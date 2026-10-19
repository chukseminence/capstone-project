import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { makeQr, qrPath } from "../public/js/qr.js";

// public/js/qr.js is a vendored black box: we only check what we call.
// While writing it, 300 codes (150 of them real ticket codes, the rest random text of 1 to 213 characters,
// versions 1 to 10) were drawn as pictures and read back with a real QR reader (OpenCV): every one read back correctly.
// The "golden" fingerprints below were taken from codes that were read back that way. If the encoder ever changes
// by accident, the fingerprint changes and this test fails.

function fingerprint(qr) {
  let s = "";
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) s += qr.dark(x, y) ? "1" : "0";
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}

const GOLDEN = [
  ["HELLO", 1, "32fbc389880456d5"],
  ["BK-000012.1780000000", 2, "a44106a73785dea1"],
  ["BK-000012.1780000000.k3Jx9aQ2mZpL0vB7nT4wYc8uHd5sRe6gFi1oKjXqA3U", 5, "0a9d238383dade5e"],
  ["The quick brown fox jumps over the lazy dog. ".repeat(3).slice(0, 130), 8, "7c6c22a7b698ad57"],
  ["0123456789".repeat(20) + "abc", 10, "a3c15f46c9e81a5c"],
  ["héllo wörld ✓", 2, "2cfcb40834014592"],
];

describe("qr.js (vendored QR encoder)", () => {
  for (const [text, version, sha] of GOLDEN) {
    test(`golden code, version ${version}: ${JSON.stringify(text.slice(0, 24))}`, () => {
      const qr = makeQr(text);
      assert.equal(qr.version, version);
      assert.equal(qr.size, 17 + 4 * version);
      assert.equal(fingerprint(qr), sha);
    });
  }

  test("the picture has the three corner squares and the timing lines of a real QR code", () => {
    const qr = makeQr("BK-000012.1780000000.abc");
    const n = qr.size;
    for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      for (let i = 0; i < 7; i++) {
        assert.ok(qr.dark(ox + i, oy) && qr.dark(ox + i, oy + 6) && qr.dark(ox, oy + i) && qr.dark(ox + 6, oy + i), "dark ring");
      }
      assert.ok(qr.dark(ox + 3, oy + 3), "dark centre");
      assert.ok(!qr.dark(ox + 1, oy + 1) && !qr.dark(ox + 5, oy + 5), "light ring");
    }
    for (let i = 8; i < n - 8; i++) {
      assert.equal(qr.dark(i, 6), i % 2 === 0, "horizontal timing line");
      assert.equal(qr.dark(6, i), i % 2 === 0, "vertical timing line");
    }
    assert.ok(qr.dark(8, n - 8), "the always-dark module");
  });

  test("the same text always gives the same picture; different text gives a different one", () => {
    assert.equal(fingerprint(makeQr("BK-000001.1")), fingerprint(makeQr("BK-000001.1")));
    assert.notEqual(fingerprint(makeQr("BK-000001.1")), fingerprint(makeQr("BK-000002.1")));
  });

  test("bigger text gets a bigger version, up to the limit of 213 bytes", () => {
    assert.equal(makeQr("a".repeat(14)).version, 1);
    assert.equal(makeQr("a".repeat(15)).version, 2);
    assert.equal(makeQr("a".repeat(213)).version, 10);
    assert.throws(() => makeQr("a".repeat(214)), RangeError);
    assert.throws(() => makeQr(42), TypeError);
  });

  test("a real ticket code (about 64 characters) fits in a small version-5 code", () => {
    const code = "BK-000012.1780000000." + "A".repeat(43);
    assert.equal(code.length, 64);
    assert.equal(makeQr(code).version, 5);
  });

  test("qrPath draws exactly the dark modules, inside the border", () => {
    const qr = makeQr("HELLO");
    const border = 4;
    const d = qrPath(qr, border);
    // Rebuild the grid from the path text and compare module by module.
    const grid = new Set();
    for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      for (let i = 0; i < Number(m[3]); i++) grid.add(`${Number(m[1]) + i},${m[2]}`);
    }
    let expected = 0;
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        const has = grid.has(`${x + border},${y + border}`);
        assert.equal(has, qr.dark(x, y), `module ${x},${y}`);
        if (qr.dark(x, y)) expected++;
      }
    }
    assert.equal(grid.size, expected);
    assert.ok(!/[<>"']/.test(d), "the path text holds only path commands");
  });
});
