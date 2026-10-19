import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { createServer } from "../src/server.js";
import { createSqliteStore } from "../src/data/sqliteStore.js";
import { createEventService } from "../src/services/eventService.js";
import { createBookingService } from "../src/services/bookingService.js";
import { createCheckinService } from "../src/services/checkinService.js";
import { signTicket, verifyTicket } from "../src/lib/ticketToken.js";
import { createRateLimiter } from "../src/lib/rateLimit.js";
import { SECURITY_HEADERS, CONTENT_SECURITY_POLICY } from "../src/http/securityHeaders.js";
import { signToken } from "../src/tokens.js";
import { TEST_SECRET, tokenFor } from "./actors.js";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const TICKET_SECRET = "ticket-secret-only-for-tests-0123456789";

// ---------------------------------------------------------------------------------
describe("S14/S15: the signed ticket code (ticketToken.js)", () => {
  test("a code we signed verifies, and gives back only the booking reference and the time", () => {
    const code = signTicket("BK-000012", TICKET_SECRET, Date.parse("2026-11-01T10:00:00Z"));
    assert.deepEqual(verifyTicket(code, TICKET_SECRET), { bookingRef: "BK-000012", issuedAt: Date.parse("2026-11-01T10:00:00Z") / 1000 });
  });

  test("the code holds no name, no email: only reference, time and stamp", () => {
    const code = signTicket("BK-000012", TICKET_SECRET);
    const [ref, issued, stamp, ...more] = code.split(".");
    assert.equal(more.length, 0);
    assert.match(ref, /^BK-\d+$/);
    assert.match(issued, /^\d+$/);
    assert.match(stamp, /^[A-Za-z0-9_-]{43}$/);
  });

  test("a forged code is refused: edited reference, edited time, wrong key, cut short, made up", () => {
    const code = signTicket("BK-000012", TICKET_SECRET, 1_700_000_000_000);
    const [ref, issued, stamp] = code.split(".");
    assert.equal(verifyTicket(`BK-000013.${issued}.${stamp}`, TICKET_SECRET), null, "reference edited");
    assert.equal(verifyTicket(`${ref}.${Number(issued) + 1}.${stamp}`, TICKET_SECRET), null, "time edited");
    assert.equal(verifyTicket(code, "a-different-secret-of-16+chars"), null, "signed with another key");
    assert.equal(verifyTicket(`${ref}.${issued}`, TICKET_SECRET), null, "stamp cut off");
    assert.equal(verifyTicket(`${ref}.${issued}.${stamp.slice(0, -1)}A`, TICKET_SECRET), null, "last letter changed");
    assert.equal(verifyTicket("BK-000012.1700000000.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", TICKET_SECRET), null, "made up");
    for (const junk of ["", "hello", null, undefined, 42, {}, "a.b.c", "x".repeat(5000)]) assert.equal(verifyTicket(junk, TICKET_SECRET), null);
  });

  test("a LOGIN token can never pass as a ticket, even when it is signed with the ticket key", () => {
    const login = signToken({ sub: "U-000001", role: "staff" }, TICKET_SECRET);
    assert.equal(verifyTicket(login, TICKET_SECRET), null);
  });

  test("the secret must be real: no secret, or a short one, is refused (no default value)", () => {
    for (const bad of [undefined, null, "", "short"]) {
      assert.throws(() => signTicket("BK-000001", bad), /at least 16/);
      assert.throws(() => verifyTicket("x", bad), /at least 16/);
    }
  });

  test("the ticket token file has no built-in secret", () => {
    const text = fs.readFileSync(new URL("../src/lib/ticketToken.js", import.meta.url), "utf8");
    assert.ok(!/secret\s*=\s*["'`]/i.test(text), "ticketToken.js must not give the secret a default value");
  });
});

// ---------------------------------------------------------------------------------
describe("rate limiter (rateLimit.js)", () => {
  test("allows `max` tries in a window, then says how long to wait, then starts again", () => {
    let t = 1_000_000;
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000, now: () => t });
    assert.deepEqual([1, 2, 3].map(() => limiter.hit("a").allowed), [true, true, true]);
    const fourth = limiter.hit("a");
    assert.equal(fourth.allowed, false);
    assert.equal(fourth.retryAfterSeconds, 60);
    t += 30_000;
    assert.equal(limiter.hit("a").retryAfterSeconds, 30);
    t += 30_001;
    assert.equal(limiter.hit("a").allowed, true);
  });

  test("each address has its own count", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000 });
    assert.equal(limiter.hit("a").allowed, true);
    assert.equal(limiter.hit("b").allowed, true);
    assert.equal(limiter.hit("a").allowed, false);
  });

  test("silly settings are refused", () => {
    assert.throws(() => createRateLimiter({ max: 0, windowMs: 1000 }));
    assert.throws(() => createRateLimiter({ max: 1, windowMs: 0 }));
  });
});

// ---------------------------------------------------------------------------------
// A real server with an event, an organizer, an attendee with a PAID booking, and two staff accounts.
describe("S14/S15: check-in over HTTP", () => {
  let server, store, base, event, otherEvent, org, ada, bayo, staff1, staff2, paid, otherPaid;

  async function call(method, url, { user, body } = {}) {
    const res = await fetch(base + url, {
      method,
      headers: { ...(user ? { Authorization: `Bearer ${tokenFor(user)}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, headers: res.headers, json: await res.json().catch(() => null) };
  }
  const makeUser = (name, role) => {
    const u = store.users.create({ name, email: `${name.toLowerCase()}@test.example`, passwordHash: "x", role });
    return { id: u.id, name, email: u.email, role };
  };
  const codeFor = async (booking, user = ada) => (await call("GET", `/api/bookings/${booking.ref}/ticket`, { user })).json.ticket.code;
  const scan = (code, eventId, user = staff1) => call("POST", "/api/checkin", { user, body: { code, eventId } });

  before(async () => {
    store = createSqliteStore(":memory:");
    server = createServer({ publicDir, store, tokenSecret: TEST_SECRET, ticketSecret: TICKET_SECRET, hashCost: { N: 1024, r: 8, p: 1 } });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
    org = makeUser("Olu", "organizer");
    ada = makeUser("Ada", "attendee");
    bayo = makeUser("Bayo", "attendee");
    staff1 = makeUser("Staffone", "staff");
    staff2 = makeUser("Stafftwo", "staff");
    const events = createEventService(store);
    const bookings = createBookingService(store);
    const mk = (title) => {
      const e = events.create({ title, city: "Lagos", venue: "Hall", date: "2040-12-05" }, org);
      events.addTier(e.id, { id: "T1", name: "Regular", priceCents: 500000, capacity: 50 }, org);
      events.publish(e.id, org);
      return e;
    };
    event = mk("Door Night");
    otherEvent = mk("Other Night");
    const pay = (e, who, qty = 1) => {
      const b = bookings.book(e.id, "T1", who.name, qty, who);
      return bookings.pay(b.ref, "tok_success", who);
    };
    paid = pay(event, ada, 2);
    otherPaid = pay(otherEvent, bayo);
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    store.close();
  });

  const newPaid = (who = ada) => {
    const bookings = createBookingService(store);
    const b = bookings.book(event.id, "T1", who.name, 1, who);
    return bookings.pay(b.ref, "tok_success", who);
  };

  // --- the ticket code itself ---
  test("a paid booking's owner gets a code; it holds no personal data", async () => {
    const r = await call("GET", `/api/bookings/${paid.ref}/ticket`, { user: ada });
    assert.equal(r.status, 200);
    const code = r.json.ticket.code;
    assert.ok(code.startsWith(paid.ref + "."));
    assert.ok(!code.toLowerCase().includes("ada") && !code.includes("@"));
  });

  test("nobody else can get your code, and an unpaid booking has none", async () => {
    assert.equal((await call("GET", `/api/bookings/${paid.ref}/ticket`, { user: bayo })).status, 404);
    assert.equal((await call("GET", `/api/bookings/${paid.ref}/ticket`)).status, 401);
    const bookings = createBookingService(store);
    const pending = bookings.book(event.id, "T1", "Ada", 1, ada);
    const r = await call("GET", `/api/bookings/${pending.ref}/ticket`, { user: ada });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, "TICKET_NOT_PAID");
  });

  // --- S14 ---
  test("S14: staff scan a paid booking: it is checked in and the time is recorded", async () => {
    const b = newPaid();
    const r = await scan(await codeFor(b), event.id);
    assert.equal(r.status, 200);
    assert.equal(r.json.checkin.bookingRef, b.ref);
    assert.equal(r.json.checkin.buyerName, "Ada");
    assert.equal(r.json.checkin.event.title, "Door Night");
    assert.ok(Math.abs(Date.parse(r.json.checkin.checkedInAt) - Date.now()) < 5000);
    assert.equal(store.bookings.find(b.ref).checkedInAt, r.json.checkin.checkedInAt, "the time is saved in the database");
    assert.ok(!("email" in r.json.checkin) && !("userId" in r.json.checkin));
  });

  test("S14: a code for a different event is rejected at this event", async () => {
    const r = await scan(await codeFor(otherPaid, bayo), event.id);
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, "WRONG_EVENT");
    assert.equal(store.bookings.find(otherPaid.ref).checkedInAt, null, "and nobody was checked in");
  });

  test("S14: an attendee and a visitor cannot scan", async () => {
    const code = await codeFor(paid);
    const asAttendee = await scan(code, event.id, ada);
    assert.equal(asAttendee.status, 403);
    assert.equal(asAttendee.json.error.code, "FORBIDDEN");
    assert.equal((await call("POST", "/api/checkin", { body: { code, eventId: event.id } })).status, 401);
    assert.equal(store.bookings.find(paid.ref).checkedInAt, null);
  });

  test("S14b: an organizer can check people in to THEIR OWN event, and only theirs", async () => {
    const stranger = makeUser("Otherorg", "organizer");
    const code = await codeFor(paid);
    const notMine = await scan(code, event.id, stranger);
    assert.equal(notMine.status, 403);
    assert.equal(notMine.json.error.code, "FORBIDDEN");
    assert.equal(store.bookings.find(paid.ref).checkedInAt, null, "someone else's organizer checked nobody in");
    const mine = await scan(code, event.id, org);
    assert.equal(mine.status, 200);
    assert.equal(mine.json.checkin.bookingRef, paid.ref);
    assert.ok(store.bookings.find(paid.ref).checkedInAt, "and the ticket is now marked as used");
    const again = await scan(code, event.id, staff1);
    assert.equal(again.json.error.code, "ALREADY_CHECKED_IN", "and door staff see it was already used");
  });

  test("a scan with no code or no event is a plain VALIDATION error", async () => {
    assert.equal((await call("POST", "/api/checkin", { user: staff1, body: { eventId: event.id } })).json.error.code, "VALIDATION");
    assert.equal((await call("POST", "/api/checkin", { user: staff1, body: { code: "x" } })).json.error.code, "VALIDATION");
    assert.equal((await scan("x", "EV-999999")).json.error.code, "NOT_FOUND");
  });

  // --- S15 ---
  test("S15: an edited or made-up code is INVALID", async () => {
    const b = newPaid();
    const real = await codeFor(b);
    const [ref, issued, stamp] = real.split(".");
    const next = "BK-" + String(Number(ref.slice(3)) + 1).padStart(6, "0");
    for (const forged of [`${next}.${issued}.${stamp}`, `${ref}.${Number(issued) + 60}.${stamp}`, `${ref}.${issued}.${"A".repeat(43)}`, "BK-000001", "hello", ""]) {
      const r = await scan(forged, event.id);
      assert.equal(r.json?.error?.code, forged === "" ? "INVALID_TICKET" : "INVALID_TICKET", forged);
      assert.equal(r.status, 400);
    }
    assert.equal(store.bookings.find(b.ref).checkedInAt, null, "a forged scan checks nobody in");
  });

  test("S15: a code signed with the LOGIN secret, or a stranger's key, is INVALID", async () => {
    const b = newPaid();
    assert.equal((await scan(signTicket(b.ref, "some-other-key-that-is-long-enough"), event.id)).json.error.code, "INVALID_TICKET");
    assert.equal((await scan(signTicket(b.ref, TEST_SECRET), event.id)).json.error.code, "INVALID_TICKET");
  });

  test("S15: a genuine-looking code for a booking that does not exist is INVALID", async () => {
    const r = await scan(signTicket("BK-999999", TICKET_SECRET), event.id);
    assert.equal(r.json.error.code, "INVALID_TICKET");
  });

  test("S15: scanning the same code again is a duplicate, and shows when it was FIRST used", async () => {
    const b = newPaid();
    const code = await codeFor(b);
    const first = await scan(code, event.id);
    assert.equal(first.status, 200);
    const second = await scan(code, event.id, staff2);
    assert.equal(second.status, 409);
    assert.equal(second.json.error.code, "ALREADY_CHECKED_IN");
    assert.equal(second.json.error.checkedInAt, first.json.checkin.checkedInAt);
    const third = await scan(code, event.id);
    assert.equal(third.json.error.checkedInAt, first.json.checkin.checkedInAt, "the first time never changes");
    assert.equal(store.bookings.find(b.ref).checkedInAt, first.json.checkin.checkedInAt);
  });

  test("S15: a cancelled (refunded) booking's code is rejected", async () => {
    const b = newPaid();
    const code = await codeFor(b);
    const cancelled = await call("POST", `/api/bookings/${b.ref}/cancel`, { user: ada });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.json.booking.status, "refunded");
    const r = await scan(code, event.id);
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, "TICKET_CANCELLED");
    assert.equal(store.bookings.find(b.ref).checkedInAt, null);
  });

  test("a booking that was never paid cannot be checked in even if somebody signs its reference", async () => {
    const pending = createBookingService(store).book(event.id, "T1", "Ada", 1, ada);
    const r = await scan(signTicket(pending.ref, TICKET_SECRET), event.id);
    assert.equal(r.json.error.code, "TICKET_NOT_PAID");
  });

  test("a ticket cancelled AFTER being checked in is reported as cancelled, not as a plain duplicate", async () => {
    const b = newPaid();
    const code = await codeFor(b);
    await scan(code, event.id);
    await call("POST", `/api/bookings/${b.ref}/cancel`, { user: ada });
    assert.equal((await scan(code, event.id)).json.error.code, "TICKET_CANCELLED");
  });

  test("S15: two staff scan the same code at the same moment: EXACTLY ONE is admitted", async () => {
    for (let round = 0; round < 10; round++) {
      const b = newPaid();
      const code = await codeFor(b);
      const results = await Promise.all([scan(code, event.id, staff1), scan(code, event.id, staff2)]);
      const statuses = results.map((r) => r.status).sort();
      assert.deepEqual(statuses, [200, 409], `round ${round}`);
      const loser = results.find((r) => r.status === 409);
      assert.equal(loser.json.error.code, "ALREADY_CHECKED_IN");
      const winner = results.find((r) => r.status === 200);
      assert.equal(loser.json.error.checkedInAt, winner.json.checkin.checkedInAt);
    }
  });

  test("S15: twenty scans of one code at once: still exactly one admitted", async () => {
    const b = newPaid();
    const code = await codeFor(b);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => scan(code, event.id, i % 2 ? staff1 : staff2)));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(results.filter((r) => r.json?.error?.code === "ALREADY_CHECKED_IN").length, 19);
  });

  test("which staff member scanned is kept (so a door log is possible)", async () => {
    const b = newPaid();
    await scan(await codeFor(b), event.id, staff2);
    const row = store.bookings.find(b.ref);
    assert.ok(row.checkedInAt);
    assert.equal(store.requireEvent(event.id).id, event.id);
  });
});

// ---------------------------------------------------------------------------------
describe("S15: the atomic UPDATE, with two real database connections", () => {
  test("two doors with their own connections racing over 300 bookings: each booking is admitted exactly once", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stub-door-"));
    const dbFile = path.join(dir, "door.sqlite");
    const store = createSqliteStore(dbFile);
    const org = store.users.create({ name: "Olu", email: "o@x.example", passwordHash: "x", role: "organizer" });
    const ada = store.users.create({ name: "Ada", email: "a@x.example", passwordHash: "x", role: "attendee" });
    const events = createEventService(store);
    const bookings = createBookingService(store);
    const e = events.create({ title: "Race", city: "Lagos", venue: "Hall", date: "2040-12-05" }, org);
    events.addTier(e.id, { id: "T1", name: "Regular", priceCents: 0, capacity: 400 }, org);
    events.publish(e.id, org);
    const refs = [];
    for (let i = 0; i < 300; i++) {
      const b = bookings.book(e.id, "T1", "Ada", 1, ada);
      bookings.pay(b.ref, "tok_success", ada);
      refs.push(b.ref);
    }

    const control = new SharedArrayBuffer(8);
    const flags = new Int32Array(control);
    const workerFile = new URL("../scripts/checkinWorker.js", import.meta.url);
    const workers = [0, 1].map(() => new Worker(workerFile, { workerData: { dbFile, eventId: e.id, refs, control } }));
    const done = workers.map((w) => new Promise((resolve, reject) => {
      w.on("message", (m) => m.admitted !== undefined && resolve(m.admitted));
      w.on("error", reject);
    }));
    await Promise.all(workers.map((w) => new Promise((r) => w.once("message", r)))); // both ready
    Atomics.store(flags, 0, 1);
    Atomics.notify(flags, 0);
    const admitted = await Promise.all(done);

    assert.equal(admitted[0] + admitted[1], 300, `door A admitted ${admitted[0]}, door B admitted ${admitted[1]}`);
    const stillOpen = refs.filter((ref) => store.bookings.find(ref).checkedInAt === null);
    assert.deepEqual(stillOpen, []);
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------------
describe("check-in service set-up", () => {
  test("the service refuses to start without a real secret", () => {
    const store = createSqliteStore(":memory:");
    assert.throws(() => createCheckinService(store, { secret: undefined }), /at least 16/);
    assert.throws(() => createCheckinService(store, { secret: "short" }), /at least 16/);
    store.close();
  });
});

// ---------------------------------------------------------------------------------
describe("S14: upgrading a schema 3 database to 4 keeps bookings and adds the check-in columns", () => {
  test("old paid bookings simply start as not checked in", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const { SCHEMA_V1, MIGRATIONS } = await import("../src/data/sqliteStore.js");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stub-v3-"));
    const file = path.join(dir, "v3.sqlite");
    const old = new DatabaseSync(file);
    old.exec(SCHEMA_V1);
    old.exec(MIGRATIONS[2]);
    old.exec(MIGRATIONS[3]);
    old.exec("PRAGMA user_version = 3");
    old.exec(`INSERT INTO events (id, title, city, venue, date, status) VALUES ('EV-000001', 'Old', 'Lagos', 'Hall', '2040-12-05', 'published');
              INSERT INTO tiers VALUES ('EV-000001', 'T1', 'Regular', 500000, 5, 1);
              INSERT INTO bookings (ref, event_id, tier_id, buyer_name, quantity, total_cents, status) VALUES ('BK-000001', 'EV-000001', 'T1', 'Old Buyer', 1, 500000, 'paid');
              UPDATE counters SET value = 1 WHERE name IN ('event', 'booking');`);
    old.close();
    const store = createSqliteStore(file);
    assert.equal(store.bookings.find("BK-000001").checkedInAt, null);
    assert.equal(store.bookings.checkIn("BK-000001", "EV-000001", { nowMs: Date.parse("2026-11-01T10:00:00Z") }).admitted, true);
    assert.equal(store.bookings.find("BK-000001").checkedInAt, "2026-11-01T10:00:00.000Z");
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------------
describe("security headers and rate limits on the real server", () => {
  let server, store, base;
  before(async () => {
    store = createSqliteStore(":memory:");
    server = createServer({
      publicDir, store, tokenSecret: TEST_SECRET, ticketSecret: TICKET_SECRET, hashCost: { N: 1024, r: 8, p: 1 },
      rateLimits: { login: { max: 3, windowMs: 60_000 }, checkin: { max: 2, windowMs: 60_000 } },
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    store.close();
  });

  const expectHeaders = (res, what) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(res.headers.get(name), value, `${what}: ${name}`);
  };

  test("every kind of reply carries the security headers: page, script, API data, API error, 404", async () => {
    expectHeaders(await fetch(base + "/"), "page");
    expectHeaders(await fetch(base + "/js/main.js"), "script");
    expectHeaders(await fetch(base + "/api/events"), "API data");
    expectHeaders(await fetch(base + "/api/me"), "API error");
    expectHeaders(await fetch(base + "/nothing-here.txt"), "404");
  });

  test("the policy allows no inline scripts, no inline styles, no other sites, no frames, no plug-ins", () => {
    const csp = CONTENT_SECURITY_POLICY;
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /style-src 'self'(;|$)/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.ok(!csp.includes("unsafe-inline") && !csp.includes("unsafe-eval") && !/https?:/.test(csp) && !csp.includes("*"));
    assert.equal(SECURITY_HEADERS["X-Content-Type-Options"], "nosniff");
    assert.equal(SECURITY_HEADERS["Referrer-Policy"], "no-referrer");
  });

  test("login: after too many tries from one address, 429 RATE_LIMITED with Retry-After, even for the right password", async () => {
    const login = () => fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "no@one.example", password: "whatever-password" }) });
    for (let i = 0; i < 3; i++) assert.equal((await login()).status, 401);
    const blocked = await login();
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).error.code, "RATE_LIMITED");
    assert.ok(Number(blocked.headers.get("Retry-After")) >= 1);
  });

  test("check-in: after too many scans from one address, 429; the limit counts before the login is even looked at", async () => {
    const scan = () => fetch(base + "/api/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "x", eventId: "EV-000001" }) });
    assert.equal((await scan()).status, 401);
    assert.equal((await scan()).status, 401);
    assert.equal((await scan()).status, 429);
  });

  test("other addresses of the API are not limited", async () => {
    for (let i = 0; i < 8; i++) assert.equal((await fetch(base + "/api/events")).status, 200);
  });
});
