import { parentPort, workerData } from "node:worker_threads";
import { createSqliteStore } from "../src/data/sqliteStore.js";

// One "door": a thread with its OWN connection to the database file, like a second staff phone
// talking to a second server process. It waits for GO, then tries to check in every booking.
const { dbFile, eventId, refs, control } = workerData;
const flags = new Int32Array(control);
const store = createSqliteStore(dbFile);
parentPort.postMessage({ ready: true });
Atomics.wait(flags, 0, 0);

let admitted = 0;
for (const ref of refs) {
  if (store.bookings.checkIn(ref, eventId, { staffId: null, nowMs: Date.now() }).admitted) admitted += 1;
}
store.close();
parentPort.postMessage({ admitted });
