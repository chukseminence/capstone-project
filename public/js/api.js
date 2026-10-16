// Build 6: the ONE place the browser pages get data from.
//
// Every function returns a Promise and resolves to the same shape the real API
// returns in docs/api-examples.md, so Build 7 can swap the body for `fetch` and
// the pages will not change. For now the data comes from mockData.js.
//
// The pages must never call fetch directly; they import from here.
//
// The filter/sort rules below mirror src/domain/eventSearch.js exactly (the
// browser cannot import from src/, only from public/). If those rules change,
// change them here too.

import { createMockState } from './mockData.js';

const MAX_TICKETS_PER_BOOKING = 10;
const CURRENT_USER_ID = 'attendee-grace'; // stands in for the x-user-id header
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let state = createMockState();
let latencyMs = 150;

// --- test/demo hooks ---------------------------------------------------------

export function resetMockState() {
  state = createMockState();
}

export function setMockLatency(ms) {
  latencyMs = Math.max(0, Number(ms) || 0);
}

// The same shape as an API error: {"error":{"code","message"}}. Thrown, so pages
// catch it and read error.code.
export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

// --- helpers ----------------------------------------------------------------

function wait() {
  return latencyMs > 0 ? new Promise((resolve) => setTimeout(resolve, latencyMs)) : Promise.resolve();
}

function referenceCode() {
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += REFERENCE_ALPHABET[Math.floor(Math.random() * REFERENCE_ALPHABET.length)];
  }
  return code;
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2, 10)}`;
}

function seatsLeft(tier) {
  return Math.max(0, tier.capacity - tier.sold);
}

function toPublicTier(tier) {
  return { ...tier, seatsLeft: seatsLeft(tier) };
}

function toSummary(event) {
  let minPriceCents = null;
  let totalSeatsLeft = 0;
  for (const tier of event.tiers) {
    if (minPriceCents === null || tier.priceCents < minPriceCents) minPriceCents = tier.priceCents;
    totalSeatsLeft += seatsLeft(tier);
  }
  return {
    id: event.id,
    title: event.title,
    city: event.city,
    venue: event.venue,
    startsAt: event.startsAt,
    status: event.status,
    minPriceCents,
    totalSeatsLeft,
    tierCount: event.tiers.length,
  };
}

function findEvent(id) {
  return state.events.find((event) => event.id === id);
}

function findTier(tierId) {
  for (const event of state.events) {
    const tier = event.tiers.find((t) => t.id === tierId);
    if (tier) return tier;
  }
  return undefined;
}

function requireValidDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError('VALIDATION', `${field} must be a valid date`);
  return date;
}

// --- filter and sort (a copy of the domain rules) ----------------------------

function filterEvents(summaries, { q, city, from, to, maxPriceCents, onlyAvailable } = {}) {
  let list = summaries.slice();

  if (q) {
    const needle = String(q).toLowerCase().trim();
    list = list.filter((event) =>
      String(event.title || '').toLowerCase().includes(needle) ||
      String(event.venue || '').toLowerCase().includes(needle));
  }

  if (city) {
    const wanted = String(city).toLowerCase().trim();
    list = list.filter((event) => String(event.city || '').toLowerCase() === wanted);
  }

  if (from) {
    const fromDate = requireValidDate(from, 'from');
    list = list.filter((event) => new Date(event.startsAt) >= fromDate);
  }

  if (to) {
    const toDate = requireValidDate(to, 'to');
    const endOfDay = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999);
    list = list.filter((event) => new Date(event.startsAt) <= endOfDay);
  }

  if (maxPriceCents !== undefined && maxPriceCents !== null) {
    if (!Number.isInteger(maxPriceCents)) {
      throw new ApiError('VALIDATION', 'maxPriceCents must be a whole number of cents');
    }
    list = list.filter((event) => event.minPriceCents !== null && event.minPriceCents <= maxPriceCents);
  }

  if (onlyAvailable) {
    list = list.filter((event) => (event.totalSeatsLeft || 0) > 0);
  }

  return list;
}

function byTitleThenId(a, b) {
  const byTitle = String(a.title).localeCompare(String(b.title));
  return byTitle !== 0 ? byTitle : String(a.id).localeCompare(String(b.id));
}

function sortEvents(summaries, sortBy) {
  const list = summaries.slice();
  if (!sortBy) return list;

  if (sortBy === 'date') {
    return list.sort((a, b) => {
      const da = new Date(a.startsAt).getTime();
      const db = new Date(b.startsAt).getTime();
      return da !== db ? da - db : byTitleThenId(a, b);
    });
  }

  if (sortBy === 'price') {
    return list.sort((a, b) => {
      const pa = a.minPriceCents;
      const pb = b.minPriceCents;
      const aHas = pa !== null && pa !== undefined;
      const bHas = pb !== null && pb !== undefined;
      if (aHas && bHas && pa !== pb) return pa - pb;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return byTitleThenId(a, b);
    });
  }

  if (sortBy === 'availability') {
    return list.sort((a, b) => {
      const sa = a.totalSeatsLeft || 0;
      const sb = b.totalSeatsLeft || 0;
      return sa !== sb ? sb - sa : byTitleThenId(a, b);
    });
  }

  throw new ApiError('VALIDATION', `Unknown sortBy: ${sortBy}`);
}

// --- the public "API" --------------------------------------------------------

// GET /api/events
export async function listEvents(filters = {}) {
  await wait();
  const published = state.events
    .filter((event) => event.status === 'published')
    .map(toSummary);
  return sortEvents(filterEvents(published, filters), filters.sortBy);
}

// Not in the real API yet; the city <select> needs a list to choose from.
export async function listCities() {
  await wait();
  const cities = new Set();
  for (const event of state.events) {
    if (event.status === 'published') cities.add(event.city);
  }
  return [...cities].sort((a, b) => a.localeCompare(b));
}

// GET one event WITH its tiers (the page needs them; Build 7 can add the route).
export async function getEvent(id) {
  await wait();
  const event = findEvent(id);
  if (!event) throw new ApiError('NOT_FOUND', 'Event not found');
  return { ...event, tiers: event.tiers.map(toPublicTier) };
}

// POST /api/bookings
export async function createBooking({ tierId, quantity }) {
  await wait();

  const tier = findTier(tierId);
  if (!tier) throw new ApiError('NOT_FOUND', 'Ticket tier not found');

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
    throw new ApiError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
  }

  const left = seatsLeft(tier);
  if (left < quantity) {
    throw new ApiError(
      'SOLD_OUT',
      left === 0 ? `${tier.name} is sold out` : `Only ${left} ticket(s) left in ${tier.name}`,
    );
  }

  tier.sold += quantity; // the seats are held as soon as the booking exists

  const booking = {
    id: newId(),
    reference: referenceCode(),
    userId: CURRENT_USER_ID,
    tierId,
    quantity,
    amountCents: tier.priceCents * quantity,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  state.bookings.push(booking);
  return { ...booking };
}

// POST /api/bookings/:reference/pay
export async function pay({ reference, card }) {
  await wait();

  const booking = state.bookings.find((b) => b.reference === reference);
  if (!booking) throw new ApiError('NOT_FOUND', 'Booking not found');

  if (booking.status !== 'pending') {
    throw new ApiError('INVALID_TRANSITION', `A ${booking.status} booking cannot be paid`);
  }

  if (String(card).toLowerCase() === 'declined') {
    // The booking STAYS pending, so the user can try again.
    throw new ApiError('PAYMENT_DECLINED', 'The card was declined. Try another card.');
  }

  booking.status = 'paid';
  booking.paymentId = `pay_${referenceCode()}`;
  booking.paidAt = new Date().toISOString();
  return { ...booking };
}
