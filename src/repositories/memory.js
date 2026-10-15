// Build 4: the data layer. An in-memory repository with async methods, so it
// has the same shape as the SQLite repository that arrives in Build 5. It holds
// no business rules: it only stores and fetches.
//
// Services receive a repository as an argument; they never import one.

export function createMemoryRepository() {
  const events = new Map(); // eventId -> event
  const tiers = new Map(); // tierId -> tier
  const bookings = new Map(); // bookingId -> booking
  const bookingsByReference = new Map(); // reference -> booking

  return {
    // --- events ---
    async saveEvent(event) {
      events.set(event.id, event);
      return event;
    },
    async findEventById(id) {
      return events.get(id) ?? null;
    },
    async listEvents() {
      return [...events.values()];
    },

    // --- ticket tiers ---
    async saveTier(tier) {
      tiers.set(tier.id, tier);
      return tier;
    },
    async findTierById(id) {
      return tiers.get(id) ?? null;
    },
    async listTiers() {
      return [...tiers.values()];
    },

    // --- bookings ---
    async saveBooking(booking) {
      bookings.set(booking.id, booking);
      bookingsByReference.set(booking.reference, booking);
      return booking;
    },
    async findBookingByReference(reference) {
      return bookingsByReference.get(reference) ?? null;
    },
    async listBookings() {
      return [...bookings.values()];
    },
  };
}
