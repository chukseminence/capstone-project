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


