# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:** Add `mergeSort` (stable, non-mutating, no `Array.prototype.sort`), `publishEvent`/`listEventSummaries` in inventory.js, a pure `eventSearch.js` with `filterEvents`, `sortEvents` and `searchEvents`, tests with `node:test` for S02, S03, S04-publish, S05 and S06, and an `npm test` script.
- **What came back:** `src/domain/sorting.js`, additions to `src/domain/inventory.js`, `src/domain/eventSearch.js`, `test/build2.test.js`, and a `"test": "node --test"` script. All 14 tests pass and the demo runs.
- **What was wrong (or "nothing"):** Two small things. (1) The first `getHeaders`/price code ignored the "events with no tiers are left out of price filters" rule until I made `maxPriceCents` require a non-null cheapest price. (2) The S04 test used a top-level `await import(...)` inside a non-async test, which threw a syntax error; I import `unpublishEvent` at the top instead.

### Prompt 2: "Make it readable and add a demo"
- **What I asked:** Clean up the merge sort (drop an unused `aux` array), rewrite the search module in the project's comment style, and add `scripts/demo-search.js` wired to `npm run demo:search`.
- **What came back:** A recursive `mergeSort` with a small `merge` helper, a commented `eventSearch.js`, and a demo that seeds three events and prints each filter/sort.
- **What was wrong (or "nothing"):** Nothing broken, but the first demo used `capacity: 0`, which `addTier` rejects (capacity must be at least 1); I seed 1 seat and book it to show a sold-out event instead.

## Build 3

### Prompt 1: Build 3 prompt (docs/build-3.md)
- **What I asked:** `docs/architecture.md` with three Mermaid diagrams; `src/domain/bookingStateMachine.js` (states pending/paid/cancelled/refunded/checked_in, `canTransition`, `assertTransition`, code `INVALID_TRANSITION`); a tiny router in `src/http/router.js` and an app in `src/http/app.js` on `node:http` only (`GET /health`, JSON 404 for unknown `/api`, JSON 400 for bad JSON, one error shape, static files from `public/` that cannot escape it); `src/server.js` and `src/config.js` with `PORT`; and tests for every booking move, the router and a real `GET /health`.
- **What came back:** The three diagrams; the state machine as data; the router, app, routes, config and server; a `public/` landing page that pings `/health`; a `"start"` script; and 25 more tests. 39 tests pass in total and `PORT=3100 npm start` answers `/health`.
- **What was wrong (or "nothing"):** Three things. (1) The static-file guard returned **403 for every file** on Windows: `path.normalize` keeps a trailing separator, so `root + sep` became a double separator and nothing matched. I switched to `path.resolve`, which strips the trailing separator, and strip leading slashes from the request path. (2) A route handler that returns `undefined` was serialised as `null`; I check `res.writableEnded` first so a handler may write its own response or return a value, never both. (3) My escape test used `%2e%2e`, but the WHATWG URL parser turns that into `..` before the guard runs (so it 404'd, which is safe). I test with a smuggled `%2f` instead and added a second test that a plain `..` never serves the file.

## Build 4

### Prompt 1: Build 4 prompt (docs/build-4.md)

- **What I asked:** A working in-memory REST API over the Build 3 domain: `src/repositories/memory.js` (async methods for events, tiers and bookings, no rules); `src/services/eventService.js` and `src/services/bookingService.js` holding all business rules and receiving the repository as an argument; `src/lib/mockPaymentGateway.js` that never sees a card number; routes for create event, add tier, publish, search, book, pay and cancel an unpaid booking (identity via an `x-user-id` header until Build 7); `docs/api-examples.md` with a curl example for every call; and API-level tests that start the real server.
- **What came back:** The repository, the two services (reusing `bookingStateMachine`, `eventSearch`, `sorting` and the shared validators), the mock gateway, the `/api` routes, an updated `server.js` that composes the pieces (and still returns an unlistened server for tests), `docs/api-examples.md`, and `test/api.test.js`. 53 tests pass and every curl example in the doc works against a live `npm start`.
- **What was wrong (or "nothing"):** Three real fixes. (1) The shared validation helpers lived inside `inventory.js` and `eventSearch.js` as private copies; I pulled them into `src/domain/validation.js` and had both modules import them, so the services reuse the rules instead of copying them. (2) `res.statusCode` was ignored on success, so creates could not return `201`; the app now sends whatever a handler set (defaulting to `200`). (3) `PAYMENT_DECLINED` had no status, so a declined card fell through to `400`; it now maps to `402`. I also confirmed the state machine stops a second charge (`paid -> paid` is illegal) and that a decline leaves the booking `pending` so paying again works.

### Prompt 2: "Verify it against the docs and lint the rules"

- **What I asked:** Run the whole suite, then drive the server with the exact `docs/api-examples.md` curl calls and check the two hard-problem guard rails: money as whole cents and no overselling.
- **What came back:** All 53 tests green, and a live run where create -> tier -> publish -> search -> book -> declined pay -> successful pay -> cancel behaved exactly as documented.
- **What was wrong (or "nothing"):** Nothing in the code. The first curl script failed because PowerShell mangles `\"` inside a double-quoted string (the body arrived as invalid JSON); passing the body from a file fixed the harness, not the API. Worth remembering for the demo.

## Build 5

### Prompt 1: Build 5 prompt, part 1 (docs/build-5.md)

- **What I asked:** Move storage to SQLite using `node:sqlite` (still no outside packages): `src/db/schema.sql` and `src/db/connection.js` with tables for users, events, ticket_tiers and bookings and PRIMARY KEY / FOREIGN KEY / UNIQUE / CHECK constraints, including `CHECK (sold >= 0 AND sold <= capacity)`; a `src/repositories/sqlite.js` with the same methods as `memory.js` (placeholders only, never string-built SQL); `scripts/seed.js` plus a `seed` script; and `scripts/oversell-demo.js` plus an `oversell` script that fires 50 simultaneous bookings at the last seat. Do not fix overselling yet.
- **What came back:** The schema, the connection, the SQLite repository, the seed script, the demo, and SQLite wired in as the server's default repository. The API tests now run against an in-memory SQLite database and still pass unchanged, which shows the services really did not learn where the data lives.
- **What was wrong (or "nothing"):** Two things. (1) The first demo printed "seats sold = 0" for the broken case, because I had made `saveTier` skip the `sold` column; that hid the bug behind a wrong-looking zero. I made `saveTier` write the whole row (matching `memory.js`) and had the naive path create real booking rows, so "before" now honestly shows 50 bookings for 1 seat. (2) Foreign keys are OFF in SQLite by default, so `REFERENCES` did nothing until I ran `PRAGMA foreign_keys = ON` on every connection.

### Prompt 2: Build 5 prompt, part 2 - fix it in the database

- **What I asked:** Fix the overselling in the database, not in JavaScript: reserve with one atomic `UPDATE ... WHERE sold + ? <= capacity`, use the changed-row count to decide who won, throw `SOLD_OUT` when no row changed; no lock variable and no double check; add `test/oversell.test.js` (50 for 1 -> 1 success, 49 `SOLD_OUT`) that fails if the fix is removed; and show the demo before and after.
- **What came back:** `reserveSeats`/`releaseSeats` on both repositories, `bookingService.book` reserving before it builds the booking, `bookingService.cancel` releasing the same way, and the oversell demo printing "before" (50 bookings, 49 accepted) and "after" (1 booking, 49 `SOLD_OUT`).
- **What was wrong (or "nothing"):** Nothing broken, but two things worth stating. A lock variable or a double check both fail because the gap between "read the count" and "write the count" is exactly where the other fifty callers run; only a single statement with the condition inside it closes that gap. And the test file now has a second test that runs the OLD check-then-write booking and asserts it oversells - that is what makes the first test meaningful, because if the fix is removed the first test fails for the same reason the second one passes.

## Build 6

### Prompt 1: Build 6 prompt (docs/build-6.md)

- **What I asked:** Build the website in plain HTML, CSS and browser ES modules (no framework, no build step): `public/index.html` (browse with search, city filter, max price and a sort menu) and `public/event.html` (one event, its tiers, a quantity picker, checkout); `public/js/ui.js` with an `el(tag, props, children)` helper that uses `textContent` and never `innerHTML`; `public/js/mockData.js` and `public/js/api.js` where `api.js` exports `listEvents`, `getEvent`, `createBooking` and `pay` and resolves to the same shapes as the real API; `public/js/pages/home.js` and `event.js`; and `public/css/styles.css`. Rules: format money in one function (250000 -> ₦2,500), a quantity cannot exceed 10 or the seats left, a sold-out tier is marked and disabled, checkout shows a countdown, a declined card lets the user retry, every control has a label, and the pages never call `fetch`.
- **What came back:** The two pages, the helper, the mock data, the API module, the two page scripts and the stylesheet; the old Build 3 `public/app.js` and `public/styles.css` were removed (the stylesheet moved to `public/css/styles.css`), and `test/frontend.test.js` exercises the money formatter, the quantity clamp and the mock API through `node:test`.
- **What was wrong (or "nothing"):** Three things. (1) The build prompt names `public/css/styles.css`, but a Build 3 test fetched `/styles.css`; moving the file silently broke that test until I updated the path, which is a good reminder that a "static file" test is really testing a specific file. (2) I first had `getEvent` return a bare event, like the current API, but the event page needs the tiers to render at all, so the mock returns the event WITH a `tiers` array (a route the real API does not have yet, noted in the architecture doc). (3) The pages are the one part `node --test` cannot run (they need a DOM), so I moved every rule that matters - money, the quantity clamp and the mock API - out of the page files into `ui.js`/`api.js` and tested those instead; the page files are left with DOM wiring only.

### Prompt 2: "Check the rules and the screens"

- **What I asked:** Confirm the two hard rules on the screen (a sold-out tier is marked and disabled; a declined card shows an error and can be retried), that the countdown is shown, and that nothing escapes the rules in the prompt.
- **What came back:** `test/frontend.test.js` (18 tests) proving a sold-out tier rejects with `SOLD_OUT`, a quantity above 10 rejects with `VALIDATION`, a declined card rejects with `PAYMENT_DECLINED` while the booking stays `pending`, and that same booking can then be paid; a live smoke test where the server served `/`, `/event.html`, the CSS and every module with the right content type and a `%2f` traversal was still refused with `403`.
- **What was wrong (or "nothing"):** Nothing. One design note worth recording: the mock API keeps a copy of the filter/sort rules from `src/domain/eventSearch.js`, because the browser can only load modules from `public/`. That is a real duplication, not an oversight; the architecture doc says to change both if the rules change. Build 7 removes it by replacing the mock bodies with `fetch`.


