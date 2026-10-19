# QR tickets and the door (Build 9)

## The idea in plain words

When you pay, the server gives you a **code** (a short piece of text). The website draws that code as a **QR picture**. At the door, the organizer of the event (or door staff) scans the picture, the phone reads the same text back, and the server decides: let them in, or stop.

The code looks like this:

```
BK-000012.1780000000.k3Jx9aQ2mZpL0vB7nT4wYc8uHd5sRe6gFi1oKjXqA3U
 ^booking   ^time      ^the stamp (signature)
```

- **Booking** is the booking reference. **Time** is when the code was made (seconds). There is **no name and no email** in it.
- The **stamp** is made with a secret key that only the server knows (HMAC-SHA256, key `TICKET_SECRET`). Change one letter of the booking or the time and the stamp no longer fits, so the code is refused as fake. Nobody can make a good stamp without the key.
- *Signing* is not *encrypting*: anyone can read the code, but nobody can forge or edit it.

## The rules at the door

`POST /api/checkin` with `{ "code": "...", "eventId": "EV-000001" }`, logged in as **staff**.

| Situation | Answer | Code |
|---|---|---|
| Good ticket, first scan | 200, the buyer's name, number of people, the time is saved | |
| Edited, made up, or not a ticket | 400 | `INVALID_TICKET` |
| Real ticket for another event | 409 | `WRONG_EVENT` |
| Booking cancelled, refunded or expired | 409 | `TICKET_CANCELLED` |
| Booking never paid | 409 | `TICKET_NOT_PAID` |
| Already scanned | 409 and `checkedInAt` = when it was **first** used | `ALREADY_CHECKED_IN` |
| Attendee or organizer tries | 403 | `FORBIDDEN` |
| Not logged in | 401 | `UNAUTHENTICATED` |
| More than 120 scans a minute from one address | 429 and `Retry-After` | `RATE_LIMITED` |

`GET /api/bookings/:ref/ticket` gives the owner of a **paid** booking the code for the QR picture. Anyone else gets 404; an unpaid booking gets 409 `TICKET_NOT_PAID`.

## Two staff scan the same code at the same moment

The data layer admits a ticket with ONE statement:

```sql
UPDATE bookings SET checked_in_at = ?, checked_in_by = ?
WHERE ref = ? AND event_id = ? AND status = 'paid' AND checked_in_at IS NULL
```

The database runs two of these one after the other. The first changes a row (admitted). The second finds `checked_in_at` already filled, changes nothing, and is told "already used". A "read first, then write" version would let both read "empty" and admit twice. `test/checkin.test.js` proves it three ways: two requests at once, twenty at once, and two separate database connections racing over 300 tickets.

## Who can scan

- **The organizer** of an event: open **Door** (a tab on a phone, also a button on "My events"), pick the event (only their own events are listed), and scan.
- **Door staff**: same page, any event.
- An attendee, or an organizer scanning another organizer's event, is refused (403).

## Scanning on an iPhone (Safari)

Safari cannot read QR codes inside a web page by itself, so the door page loads a small reader (jsQR, `public/js/vendor/`, Apache-2.0) when it is needed. Two things to know:

1. The camera only starts on a **secure page**: `https://...` or `localhost`. A plain `http://192.168.x.x:3000` address on your home network will NOT start the camera in Safari. The door page then says so, and you can paste the code instead.
2. Do not use the iPhone **Camera app** to scan a ticket: it only sees text and offers to search for it in Safari. Use the **Scan with the camera** button on the door page.

## Getting a staff account

Staff cannot sign up on the website. `npm run seed` makes `demo-staff@example.com` (password `demo-password-1`). For real use:

```
npm run make-staff -- "Ngozi Door" ngozi@example.com a-long-password
```

## Secrets

Copy `.env.example` to `.env` and set `TOKEN_SECRET` and `TICKET_SECRET` (two different values). Never commit `.env`. With `NODE_ENV=production` the server refuses to start without them. See `docs/security-checklist.md`.

## Try it by hand

1. `npm run seed`, `npm start`, open http://localhost:3000
2. Log in as `demo-attendee@example.com`, book a ticket, pay with `4242 4242 4242 4242`. The QR picture appears.
3. Log in as `demo-staff@example.com` (use a second browser or a private window), open **Door** (tab at the bottom on a phone, link at the top on a computer), pick the event.
4. Copy the code text and paste it. You get **Let them in**. Paste it again: **Already used**, with the time.

Under the QR picture, "Show the code as text" opens the code so you can copy it. (Scanning the picture with your phone's camera app shows the same text.)
