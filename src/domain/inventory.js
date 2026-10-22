
import { DomainError } from "./errors.js";
import { newId, newReference } from "./ids.js";
import { Queue } from "./waitlistQueue.js";

export function createStore() {
  return {
    events: new Map(),
    bookingsByReference: new Map(),
    waitlistsByTier: new Map()
  };
}

function fail(message, code) {
  throw new DomainError(message, code);
}

function validateStore(store) {
  if (
    !store ||
    !(store.events instanceof Map) ||
    !(store.bookingsByReference instanceof Map) ||
    !(store.waitlistsByTier instanceof Map)
  ) {
    fail("A valid store is required.", "VALIDATION");
  }
}

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${name} is required.`, "VALIDATION");
  }

  return value.trim();
}

function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(`${name} must be a positive whole number.`, "VALIDATION");
  }
}

function getEvent(store, eventId) {
  const event = store.events.get(eventId);

  if (!event) {
    fail("Event not found.", "NOT_FOUND");
  }

  return event;
}

function getTier(event, tierId) {
  const tier = event.tiers.get(tierId);

  if (!tier) {
    fail("Ticket tier not found.", "NOT_FOUND");
  }

  return tier;
}

function getWaitlist(store, tierId) {
  if (!store.waitlistsByTier.has(tierId)) {
    store.waitlistsByTier.set(tierId, new Queue());
  }

  return store.waitlistsByTier.get(tierId);
}

export function createEvent(store, { name, capacity } = {}) {
  validateStore(store);

  name = requireText(name, "Event name");
  requirePositiveInteger(capacity, "Event capacity");

  const event = {
    id: newId(),
    name,
    capacity,
    allocatedTickets: 0,
    tiers: new Map()
  };

  store.events.set(event.id, event);

  return {
    id: event.id,
    name: event.name,
    capacity: event.capacity,
    allocatedTickets: event.allocatedTickets
  };
}

export function addTier(store, eventId, {
  name,
  priceCents,
  quantity
} = {}) {
  validateStore(store);

  const event = getEvent(store, eventId);
  name = requireText(name, "Ticket tier name");

  if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
    fail("Price must be a non-negative whole number of cents.", "VALIDATION");
  }

  requirePositiveInteger(quantity, "Ticket quantity");

  if (event.allocatedTickets + quantity > event.capacity) {
    fail("Ticket tiers cannot exceed event capacity.", "VALIDATION");
  }

  const tier = {
    id: newId(),
    name,
    priceCents,
    quantity,
    available: quantity
  };

  event.tiers.set(tier.id, tier);
  event.allocatedTickets += quantity;

  return { ...tier };
}

export function bookTickets(store, {
  eventId,
  tierId,
  customerName,
  quantity
} = {}) {
  validateStore(store);

  const event = getEvent(store, eventId);
  const tier = getTier(event, tierId);

  customerName = requireText(customerName, "Customer name");
  requirePositiveInteger(quantity, "Ticket quantity");

  if (quantity > 10) {
    fail("You can book at most 10 tickets at a time.", "VALIDATION");
  }

  if (tier.available < quantity) {
    fail("Not enough tickets are available.", "SOLD_OUT");
  }

  let reference;

  do {
    reference = newReference();
  } while (store.bookingsByReference.has(reference));

  const booking = {
    id: newId(),
    reference,
    eventId,
    tierId,
    customerName,
    quantity,
    totalCents: tier.priceCents * quantity,
    status: "confirmed"
  };

  tier.available -= quantity;
  store.bookingsByReference.set(reference, booking);

  return { ...booking };
}

export function findBookingByReference(store, reference) {
  validateStore(store);
  reference = requireText(reference, "Booking reference");

  const booking = store.bookingsByReference.get(reference);

  if (!booking) {
    fail("Booking not found.", "NOT_FOUND");
  }

  return { ...booking };
}

export function cancelBooking(store, reference) {
  validateStore(store);
  reference = requireText(reference, "Booking reference");

  const booking = store.bookingsByReference.get(reference);

  if (!booking) {
    fail("Booking not found.", "NOT_FOUND");
  }

  if (booking.status === "cancelled") {
  fail("This booking has already been cancelled.", "ALREADY_CANCELLED");
}

  const event = getEvent(store, booking.eventId);
  const tier = getTier(event, booking.tierId);

  tier.available += booking.quantity;
  booking.status = "cancelled";

  return { ...booking };
}

export function joinWaitlist(store, {
  eventId,
  tierId,
  customerName,
  quantity
} = {}) {
  validateStore(store);

  const event = getEvent(store, eventId);
  getTier(event, tierId);

  customerName = requireText(customerName, "Customer name");
  requirePositiveInteger(quantity, "Ticket quantity");

  if (quantity > 10) {
    fail("You can request at most 10 tickets.", "VALIDATION");
  }

  const entry = {
    id: newId(),
    eventId,
    tierId,
    customerName,
    quantity,
    status: "waiting"
  };

  getWaitlist(store, tierId).enqueue(entry);

  return { ...entry };
}

export function nextWaitlistEntry(store, eventId, tierId) {
  validateStore(store);

  const event = getEvent(store, eventId);
  getTier(event, tierId);

  const entry = getWaitlist(store, tierId).dequeue();

  return entry ? { ...entry } : null;
}
