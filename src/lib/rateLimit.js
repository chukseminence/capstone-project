// RATE LIMIT: "no more than `max` tries per `windowMs` from the same address".
// Someone guessing passwords or ticket codes must make thousands of tries; this makes that slow.
//
//   const limiter = createRateLimiter({ max: 10, windowMs: 60_000 });
//   const verdict = limiter.hit("203.0.113.9");   // { allowed: true } or { allowed: false, retryAfterSeconds: 42 }
//
// A "fixed window": the count starts again when the window ends. Simple, and good enough here.
// Kept in memory, so it starts again when the server restarts (see docs/security-checklist.md).

export function createRateLimiter({ max, windowMs, now = Date.now }) {
  if (!Number.isInteger(max) || max < 1) throw new Error("rate limit: max must be a whole number, 1 or more.");
  if (!Number.isInteger(windowMs) || windowMs < 1) throw new Error("rate limit: windowMs must be a whole number of milliseconds.");
  const windows = new Map(); // key -> { count, resetAt }

  function forget(at) {
    for (const [key, w] of windows) if (w.resetAt <= at) windows.delete(key);
  }

  return {
    hit(key) {
      const at = now();
      if (windows.size > 10_000) forget(at); // never grow without limit
      let w = windows.get(key);
      if (!w || w.resetAt <= at) {
        w = { count: 0, resetAt: at + windowMs };
        windows.set(key, w);
      }
      w.count += 1;
      if (w.count > max) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - at) / 1000)) };
      return { allowed: true };
    },
    reset() {
      windows.clear();
    },
  };
}
