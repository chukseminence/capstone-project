// Build 5: the SQLite repository.
//
// It has EXACTLY the same async methods as memory.js, so the services do not
// change when the storage does. Every query uses ? placeholders; SQL is never
// built by joining strings.
//
// Rows use snake_case columns; the domain uses camelCase. The small `rowTo...`
// helpers do that translation so the rest of the app never sees a column name.

import { openDatabase } from '../db/connection.js';

function rowToTier(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    priceCents: row.price_cents,
    capacity: row.capacity,
    sold: row.sold,
  };
}

function rowToBooking(row) {
  const booking = {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    tierId: row.tier_id,
    quantity: row.quantity,
    amountCents: row.amount_cents,
    status: row.status,
    createdAt: row.created_at,
  };
  if (row.payment_id) booking.paymentId = row.payment_id;
  if (row.paid_at) booking.paidAt = row.paid_at;
  if (row.cancelled_at) booking.cancelledAt = row.cancelled_at;
  return booking;
}

export function createSqliteRepository({ db, path = ':memory:' } = {}) {
  const database = db ?? openDatabase(path);

  // Prepared once. `?` placeholders keep values out of the SQL text, which is
  // what defends against SQL injection.
  const sql = {
    insertUser: database.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)'),

    upsertEvent: database.prepare(`
      INSERT INTO events (id, organizer_id, title, city, venue, starts_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        organizer_id = excluded.organizer_id,
        title        = excluded.title,
        city         = excluded.city,
        venue        = excluded.venue,
        starts_at    = excluded.starts_at,
        status       = excluded.status
    `),
    getEvent: database.prepare('SELECT * FROM events WHERE id = ?'),
    listEvents: database.prepare('SELECT * FROM events ORDER BY title, id'),
    tierIdsForEvent: database.prepare('SELECT id FROM ticket_tiers WHERE event_id = ? ORDER BY rowid'),

    // Same behaviour as memory.js: saveTier writes the whole row, `sold`
    // included. The booking flow never relies on this (it uses the atomic
    // reserve/release below); only addTier and the oversell demo do.
    upsertTier: database.prepare(`
      INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, sold)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name        = excluded.name,
        price_cents = excluded.price_cents,
        capacity    = excluded.capacity,
        sold        = excluded.sold
    `),
    getTier: database.prepare('SELECT * FROM ticket_tiers WHERE id = ?'),
    listTiers: database.prepare('SELECT * FROM ticket_tiers ORDER BY rowid'),

    // The atomic seat moves. The WHERE clause makes the check and the write one
    // statement, so two callers cannot both pass the check.
    reserveSeats: database.prepare(
      'UPDATE ticket_tiers SET sold = sold + ? WHERE id = ? AND sold + ? <= capacity',
    ),
    releaseSeats: database.prepare(
      'UPDATE ticket_tiers SET sold = sold - ? WHERE id = ? AND sold >= ?',
    ),

    upsertBooking: database.prepare(`
      INSERT INTO bookings
        (id, reference, user_id, tier_id, quantity, amount_cents, status, payment_id, created_at, paid_at, cancelled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status       = excluded.status,
        payment_id   = excluded.payment_id,
        paid_at      = excluded.paid_at,
        cancelled_at = excluded.cancelled_at
    `),
    getBookingByReference: database.prepare('SELECT * FROM bookings WHERE reference = ?'),
    listBookings: database.prepare('SELECT * FROM bookings ORDER BY created_at, id'),
  };

  function findEventById(id) {
    const row = sql.getEvent.get(id);
    if (!row) return null;
    const tierIds = sql.tierIdsForEvent.all(id).map((tier) => tier.id);
    return {
      id: row.id,
      organizerId: row.organizer_id,
      title: row.title,
      city: row.city,
      venue: row.venue,
      startsAt: row.starts_at,
      status: row.status,
      tierIds,
    };
  }

  function findBookingByReference(reference) {
    const row = sql.getBookingByReference.get(reference);
    return row ? rowToBooking(row) : null;
  }

  return {
    // --- events ---
    async saveEvent(event) {
      sql.insertUser.run(event.organizerId); // keep the foreign key valid
      sql.upsertEvent.run(
        event.id,
        event.organizerId,
        event.title,
        event.city,
        event.venue ?? '',
        event.startsAt,
        event.status ?? 'draft',
      );
      return findEventById(event.id);
    },
    async findEventById(id) {
      return findEventById(id);
    },
    async listEvents() {
      return sql.listEvents.all().map((row) => findEventById(row.id));
    },

    // --- ticket tiers ---
    async saveTier(tier) {
      sql.upsertTier.run(
        tier.id,
        tier.eventId,
        tier.name,
        tier.priceCents,
        tier.capacity,
        tier.sold ?? 0,
      );
      return rowToTier(sql.getTier.get(tier.id));
    },
    async findTierById(id) {
      const row = sql.getTier.get(id);
      return row ? rowToTier(row) : null;
    },
    async listTiers() {
      return sql.listTiers.all().map(rowToTier);
    },

    // Reserve seats in ONE statement. `changes` is 0 when the WHERE clause did
    // not match, which means someone else took the last seat first.
    async reserveSeats(tierId, quantity) {
      const info = sql.reserveSeats.run(quantity, tierId, quantity);
      return Number(info.changes) > 0;
    },
    async releaseSeats(tierId, quantity) {
      const info = sql.releaseSeats.run(quantity, tierId, quantity);
      return Number(info.changes) > 0;
    },

    // --- bookings ---
    async saveBooking(booking) {
      sql.insertUser.run(booking.userId);
      sql.upsertBooking.run(
        booking.id,
        booking.reference,
        booking.userId,
        booking.tierId,
        booking.quantity,
        booking.amountCents,
        booking.status,
        booking.paymentId ?? null,
        booking.createdAt,
        booking.paidAt ?? null,
        booking.cancelledAt ?? null,
      );
      return findBookingByReference(booking.reference);
    },
    async findBookingByReference(reference) {
      return findBookingByReference(reference);
    },
    async listBookings() {
      return sql.listBookings.all().map(rowToBooking);
    },

    // Not part of the shared interface; the server and tests use it to close the
    // handle (so a file can be deleted or re-opened cleanly).
    close() {
      database.close();
    },
  };
}
