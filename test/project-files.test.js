import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Build 9's project files: the automatic test run, the secrets example, the security checklist.
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (["node_modules", ".git", "data"].includes(e.name)) return [];
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(full) : [full];
  });
}

describe("S16: tests run on every push (.github/workflows/ci.yml)", () => {
  const ci = read(".github/workflows/ci.yml");
  test("it runs on push and on pull request", () => {
    assert.match(ci, /^on:\s*\n\s+push:/m);
    assert.match(ci, /\n\s+pull_request:/);
  });
  test("it sets up Node 22 and runs npm test", () => {
    assert.match(ci, /actions\/setup-node@v\d+/);
    assert.match(ci, /node-version:\s*22/);
    assert.match(ci, /run:\s*npm test/);
  });
  test("it uses no secrets", () => {
    assert.ok(!/secrets\./.test(ci));
  });
  test("npm test really runs every test file, and the engine matches", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.match(pkg.scripts.test, /--test/);
    assert.match(pkg.engines.node, /22/);
  });
});

describe("secrets stay out of Git", () => {
  test(".env.example names both secrets and holds no real value", () => {
    const text = read(".env.example");
    for (const name of ["TOKEN_SECRET", "TICKET_SECRET"]) assert.match(text, new RegExp(`^${name}=$`, "m"), `${name} must be listed, empty`);
    const values = [...text.matchAll(/^[A-Z_]+=(.+)$/gm)].map((m) => m[1]);
    for (const v of values) assert.ok(v.length < 40 && !/^[0-9a-f]{32,}$/i.test(v), `.env.example holds something that looks like a real secret: ${v}`);
  });
  test(".gitignore (if this project has one) lists .env and the data folder", () => {
    if (!fs.existsSync(path.join(root, ".gitignore"))) return; // the zip carries no .gitignore: your repository already has the course one
    const text = read(".gitignore");
    assert.match(text, /^\.env$/m);
    assert.match(text, /^data\/$/m);
  });
  test("no file in the project holds a long hex or base64 secret, a private key, or a ticket secret in plain code", () => {
    for (const f of listFiles(root)) {
      if (!/\.(js|md|yml|json|html|css|example)$/.test(f)) continue;
      const text = fs.readFileSync(f, "utf8");
      const name = path.relative(root, f);
      assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text), `${name} has a private key`);
      assert.ok(!/(TICKET_SECRET|TOKEN_SECRET)\s*[:=]\s*["'][^"']{16,}["']/.test(text.replace(/test-secret|ticket-secret/g, "")) || /^test\//.test(name), `${name} sets a secret to a fixed value`);
    }
  });
  test("the server code reads the secrets from the environment only", () => {
    const start = read("start.js");
    assert.match(start, /process\.env\.TICKET_SECRET/);
    assert.match(start, /process\.env\.TOKEN_SECRET/);
    assert.match(start, /NODE_ENV === "production"/);
  });
});

describe("docs: the security checklist", () => {
  const text = read("docs/security-checklist.md");
  test("it covers secrets, tickets, headers, rate limits and the known limits", () => {
    for (const word of ["TICKET_SECRET", "Content-Security-Policy", "rate", "atomic", "Known limits", "constant time"]) {
      assert.match(text, new RegExp(word, "i"), word);
    }
  });
  test("every test file it names exists", () => {
    for (const m of text.matchAll(/`((?:test|src|scripts)\/[\w./-]+\.js)`/g)) assert.ok(fs.existsSync(path.join(root, m[1])), `${m[1]} is named in the checklist but does not exist`);
  });
});
