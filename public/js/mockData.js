// Build 6: fake data so the screens can be built before they talk to the real
// API. This is plain data; api.js is the only module that reads it.
//
// Prices are whole cents (5000 = 50.00). Some tiers are deliberately sold out
// (sold === capacity) so the "Sold out" screen state can be seen, and there is
// one free tier (priceCents 0) to prove ₦0 formats correctly. There is also a
// draft event to prove only published events reach the screens.

export const SEED_EVENTS = [
  {
    id: 'evt-jazz',
    organizerId: 'organizer-ada',
    title: 'Lagos Jazz Night',
    city: 'Lagos',
    venue: 'The Shrine',
    startsAt: '2026-03-01T19:00:00.000Z',
    status: 'published',
    tiers: [
      { id: 'tier-jazz-general', eventId: 'evt-jazz', name: 'General', priceCents: 5000, capacity: 100, sold: 12 },
      { id: 'tier-jazz-vip', eventId: 'evt-jazz', name: 'VIP', priceCents: 15000, capacity: 20, sold: 20 },
    ],
  },
  {
    id: 'evt-rock',
    organizerId: 'organizer-ada',
    title: 'Abuja Rock Festival',
    city: 'Abuja',
    venue: 'Transcorp Hilton',
    startsAt: '2026-03-15T20:00:00.000Z',
    status: 'published',
    tiers: [
      { id: 'tier-rock-standing', eventId: 'evt-rock', name: 'Standing', priceCents: 7500, capacity: 200, sold: 0 },
    ],
  },
  {
    id: 'evt-comedy',
    organizerId: 'organizer-ada',
    title: 'Port Harcourt Comedy Evening',
    city: 'Port Harcourt',
    venue: 'Civic Centre',
    startsAt: '2026-04-02T18:30:00.000Z',
    status: 'published',
    tiers: [
      { id: 'tier-comedy-regular', eventId: 'evt-comedy', name: 'Regular', priceCents: 3000, capacity: 50, sold: 50 },
    ],
  },
  {
    id: 'evt-pitch',
    organizerId: 'organizer-ada',
    title: 'Lagos Startup Pitch',
    city: 'Lagos',
    venue: 'Landmark Centre',
    startsAt: '2026-04-20T09:00:00.000Z',
    status: 'published',
    tiers: [
      { id: 'tier-pitch-early', eventId: 'evt-pitch', name: 'Early Bird', priceCents: 2500, capacity: 30, sold: 28 },
      { id: 'tier-pitch-standard', eventId: 'evt-pitch', name: 'Standard', priceCents: 4000, capacity: 70, sold: 5 },
    ],
  },
  {
    id: 'evt-arts',
    organizerId: 'organizer-ada',
    title: 'Enugu Arts and Crafts Fair',
    city: 'Enugu',
    venue: 'Milliken Hill',
    startsAt: '2026-05-05T10:00:00.000Z',
    status: 'published',
    tiers: [
      { id: 'tier-arts-day', eventId: 'evt-arts', name: 'Day Pass', priceCents: 1000, capacity: 500, sold: 120 },
      { id: 'tier-arts-under12', eventId: 'evt-arts', name: 'Under 12s', priceCents: 0, capacity: 50, sold: 0 },
    ],
  },
  {
    id: 'evt-kano',
    organizerId: 'organizer-ada',
    title: 'Kano Tech Meetup',
    city: 'Kano',
    venue: 'Meena Event Centre',
    startsAt: '2026-06-10T17:00:00.000Z',
    status: 'draft',
    tiers: [
      { id: 'tier-kano-general', eventId: 'evt-kano', name: 'General', priceCents: 2000, capacity: 40, sold: 0 },
    ],
  },
];

// A fresh, independent copy of the seed data. structuredClone is in every modern
// browser and in Node, so the demo and the tests never share mutable state.
// `bookings` starts empty and fills up as the user books.
export function createMockState() {
  return {
    events: structuredClone(SEED_EVENTS),
    bookings: [],
  };
}
