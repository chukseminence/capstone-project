# API examples (Build 4)

Every call is `curl`, in the order you would really use them: create an event,
add a tier, publish it, find it, book, pay, then cancel an unpaid booking.

Start the server first:

```bash
npm start            # http://localhost:3000
```

Until Build 7 adds real login, the caller identifies itself with an
`x-user-id` header. Two made-up users appear below: `ada` (an organizer) and
`grace` (a buyer).

Errors are ALWAYS the same shape:

```json
{ "error": { "code": "VALIDATION", "message": "Title is required" } }
```

## 1. Create an event (draft)

```bash
curl -s -X POST http://localhost:3000/api/events \
  -H 'content-type: application/json' \
  -H 'x-user-id: ada' \
  -d '{"title":"Jazz Night","city":"Lagos","venue":"The Shrine","startsAt":"2026-03-01T19:00:00Z"}'
```

`201 Created`, `status` is `draft`:

```json
{
  "id": "3f1c...",
  "organizerId": "ada",
  "title": "Jazz Night",
  "city": "Lagos",
  "venue": "The Shrine",
  "startsAt": "2026-03-01T19:00:00.000Z",
  "status": "draft",
  "tierIds": []
}
```

Keep the `id` and use it as `EVENT_ID` below.

## 2. Add a ticket tier

```bash
curl -s -X POST http://localhost:3000/api/events/EVENT_ID/tiers \
  -H 'content-type: application/json' \
  -d '{"name":"General","priceCents":5000,"capacity":100}'
```

`200 OK`. Money is whole cents, so `5000` means 50.00.

```json
{ "id": "TIER_ID", "eventId": "EVENT_ID", "name": "General", "priceCents": 5000, "capacity": 100, "sold": 0 }
```

## 3. Publish the event

An event must have at least one tier before it can be published.

```bash
curl -s -X POST http://localhost:3000/api/events/EVENT_ID/publish
```

`200 OK` with `"status":"published"`. Publishing with no tiers returns
`409` and code `INVALID_STATE`.

## 4. Search published events

```bash
curl -s 'http://localhost:3000/api/events'
```

All query parts are optional and combine:

```bash
curl -s 'http://localhost:3000/api/events?q=jazz&city=Lagos&onlyAvailable=true&sortBy=price'
```

| Query        | Meaning                                              |
| ------------ | ---------------------------------------------------- |
| `q`          | title or venue contains the text (case-insensitive)  |
| `city`       | exact city match (case-insensitive)                  |
| `from`/`to`  | ISO date window; a date-only `to` means the whole day |
| `maxPriceCents` | cheapest tier is at most this many cents          |
| `onlyAvailable` | `true` keeps events that still have seats         |
| `sortBy`     | `date`, `price` or `availability`                    |

Only `published` events are ever returned.

## 5. Book tickets

```bash
curl -s -X POST http://localhost:3000/api/bookings \
  -H 'content-type: application/json' \
  -H 'x-user-id: grace' \
  -d '{"tierId":"TIER_ID","quantity":2}'
```

`201 Created`. The booking is `pending` but the seats are already held:

```json
{
  "id": "b1...",
  "reference": "Q7F2M9KD",
  "userId": "grace",
  "tierId": "TIER_ID",
  "quantity": 2,
  "amountCents": 10000,
  "status": "pending",
  "createdAt": "2026-02-01T10:00:00.000Z"
}
```

Ordering more than 10 tickets, or more than are left, gives `400 VALIDATION`
or `409 SOLD_OUT`. Use the `reference` below.

## 6. Pay with the mock card

```bash
curl -s -X POST http://localhost:3000/api/bookings/REFERENCE/pay \
  -H 'content-type: application/json' \
  -H 'x-user-id: grace' \
  -d '{"card":"ok"}'
```

`200 OK` with `"status":"paid"` and a `paymentId`. The gateway never sees a
card number, only the token.

A declined card (`"card":"declined"`) returns `402` and code
`PAYMENT_DECLINED`; the booking stays `pending`, so it can be tried again.
Paying an already-paid booking returns `409 INVALID_TRANSITION` (you are never
charged twice). Paying someone else's booking returns `403 FORBIDDEN`.

## 7. Cancel an unpaid booking

```bash
curl -s -X POST http://localhost:3000/api/bookings/REFERENCE/cancel \
  -H 'x-user-id: grace'
```

`200 OK` with `"status":"cancelled"`; the seats go back. Build 4 only cancels
`pending` bookings, so cancelling a `paid` one returns `409
INVALID_TRANSITION`. Refunds arrive in Build 8.
