# Security checklist (Build 9)

What we protect, and what protects it. Each line names the file or test that proves it, so you can check it yourself.

## 1. Secrets

| What | How it is protected | Proof |
|---|---|---|
| `TOKEN_SECRET` and `TICKET_SECRET` (the two signing keys) | Read from the environment or from a `.env` file. Never written in the code. `.env` is in `.gitignore`; `.env.example` has no real values. | `test/project-files.test.js` |
| No default key in production | With `NODE_ENV=production` the server refuses to start unless both secrets are set. `ticketToken.js` has no built-in secret at all. | `test/checkin.test.js` ("no default value"), `start.js` |
| Two different keys | A leaked login key cannot make tickets, and the other way round. A login token never passes as a ticket. | `test/checkin.test.js` ("a LOGIN token can never pass as a ticket") |
| Passwords | Only a salted scrypt hash is stored. | `test/auth-units.test.js` |

## 2. Tickets and the door

| What | How it is protected | Proof |
|---|---|---|
| A fake or edited QR code | The code is booking reference, issued-at time and an HMAC-SHA256 stamp. Changing any letter breaks the stamp, so the scan is refused as `INVALID_TICKET`. The stamp is compared in constant time. | `test/checkin.test.js` (forged code tests) |
| Personal data in the QR code | None. Only the booking reference and a time. | `test/checkin.test.js` ("holds no name, no email") |
| Who can scan | Door staff (any event) and the organizer of that event (own events only). `FORBIDDEN` for attendees and for other organizers, `401` for visitors. Staff cannot be made by signing up. | `test/checkin.test.js`, `test/auth-api.test.js` |
| Getting in twice | One atomic `UPDATE ... WHERE checked_in_at IS NULL`. The database lets exactly one of two simultaneous scans change the row. | `test/checkin.test.js` (two scans at once; two database connections) |
| Refunded or cancelled tickets | Refused (`TICKET_CANCELLED`) even if the code was signed earlier. | `test/checkin.test.js` |
| A ticket for another event | Refused (`WRONG_EVENT`). | `test/checkin.test.js` |
| Seeing somebody else's QR code | `GET /api/bookings/:ref/ticket` answers only the owner of a paid booking. Others get "not found". | `test/checkin.test.js` |

## 3. The website and the server

| What | How it is protected | Proof |
|---|---|---|
| Scripts injected into a page | `Content-Security-Policy`: scripts and styles only from this site, no inline code, no plug-ins, no frames. Pages are built with `h()`, never from text. | `src/http/securityHeaders.js`, `test/frontend-rules.test.js`, `test/checkin.test.js` |
| The browser guessing file types | `X-Content-Type-Options: nosniff` on every reply. | same tests |
| Leaking the page address to other sites | `Referrer-Policy: no-referrer`. | same tests |
| Being shown inside another site's frame | `frame-ancestors 'none'` and `X-Frame-Options: DENY`. | same tests |
| Camera | `Permissions-Policy` allows the camera only for this site (for scanning), nothing else. | `src/http/securityHeaders.js` |
| Guessing passwords or ticket codes | Rate limits per address: login 20 a minute, check-in 120 a minute. Too many: `429 RATE_LIMITED` with `Retry-After`. | `src/lib/rateLimit.js`, `test/checkin.test.js` |
| Reading files that are not for the public | Hidden names and `..` are refused; only `public/` is served. | `test/static-safety.test.js` |
| SQL injection | Every value goes in through a `?`. | `test/sqlite.test.js` |
| Selling the same seat twice | Atomic seat taking (Build 5). | `test/sqlite.test.js`, `docs/overselling.md` |
| Breaking the layers | A test reads the imports and fails if a layer reaches where it should not. No outside packages. | `test/architecture.test.js` |

## 4. Known limits (be honest at the demo)

- The rate limiter lives in memory: it starts again when the server restarts, and each server process counts alone. Behind a proxy every visitor would look like the same address, so a real deployment must count the real client address.
- There is no HTTPS in this practice server. In production a proxy must provide it, and then `Strict-Transport-Security` should be added.
- A QR code is a photo-able thing: anyone who gets a picture of a ticket before its owner arrives can use it once. The first scan wins. (Real products rotate codes or tie them to a person; not part of this build.)
- Camera scanning only works in browsers that can read QR codes themselves (Chrome on Android). Everywhere else, paste the code or use a scanner that types.
- Payments are still pretend.

## 5. Before every push

1. `npm test` is green.
2. `git status` shows no `.env` and no `data/` folder.
3. Search your changes for anything that looks like a key or a password.
