// Build 6: tests for the browser code that decides what the screens show.
//
// The pages themselves need a DOM, but the rules behind them (money formatting,
// the quantity clamp and the mock API) are plain ES modules, so node:test can
// import them straight from public/js/ and check them here.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, clampQuantity, formatCountdown } from '../public/js/ui.js';
import {
  listEvents,
  listCities,
  getEvent,
  createBooking,
  pay,
  resetMockState,
  setMockLatency,
} from '../public/js/api.js';

beforeEach(() => {
  resetMockState();
  setMockLatency(0);
});

test('formatMoney shows whole cents as naira', () => {
  assert.equal(formatMoney(250000), '₦2,500');
  assert.equal(formatMoney(5000), '₦50');
  assert.equal(formatMoney(0), '₦0');
  assert.equal(formatMoney(12345), '₦123.45');
});

test('clampQuantity never exceeds 10 or the seats left, and never drops below 1', () => {
  assert.equal(clampQuantity(50, 100), 10);
  assert.equal(clampQuantity(50, 3), 3);
  assert.equal(clampQuantity(0, 5), 1);
  assert.equal(clampQuantity('not a number', 5), 1);
  assert.equal(clampQuantity(4, 4), 4);
  assert.equal(clampQuantity(2, 0), 0, 'a sold-out tier clamps to zero');
});

test('formatCountdown renders mm:ss', () => {
  assert.equal(formatCountdown(600), '10:00');
  assert.equal(formatCountdown(59), '00:59');
  assert.equal(formatCountdown(-5), '00:00');
});

test('home lists only published events', async () => {
  const events = await listEvents();
  const titles = events.map((event) => event.title);
  assert.equal(events.length, 5);
  assert.ok(!titles.includes('Kano Tech Meetup'), 'a draft event must not appear');
});

test('search matches title or venue, case-insensitively', async () => {
  const byTitle = await listEvents({ q: 'jazz' });
  assert.deepEqual(byTitle.map((event) => event.id), ['evt-jazz']);

  const byVenue = await listEvents({ q: 'shrine' });
  assert.deepEqual(byVenue.map((event) => event.id), ['evt-jazz']);
});

test('the city filter is an exact, case-insensitive match', async () => {
  const events = await listEvents({ city: 'lagos' });
  assert.deepEqual(events.map((event) => event.id).sort(), ['evt-jazz', 'evt-pitch']);
});

test('the maximum price keeps events whose cheapest tier is within it', async () => {
  const events = await listEvents({ maxPriceCents: 3000 });
  assert.deepEqual(events.map((event) => event.id).sort(), ['evt-arts', 'evt-comedy', 'evt-pitch']);
});

test('onlyAvailable drops sold-out events', async () => {
  const events = await listEvents({ onlyAvailable: true });
  const ids = events.map((event) => event.id);
  assert.equal(ids.length, 4);
  assert.ok(!ids.includes('evt-comedy'), 'the sold-out comedy event should be dropped');
});

test('sorting by price, availability and date', async () => {
  const byPrice = await listEvents({ sortBy: 'price' });
  assert.deepEqual(byPrice.map((event) => event.id), ['evt-arts', 'evt-pitch', 'evt-comedy', 'evt-jazz', 'evt-rock']);

  const byAvailability = await listEvents({ sortBy: 'availability' });
  assert.deepEqual(byAvailability.map((event) => event.id), ['evt-arts', 'evt-rock', 'evt-jazz', 'evt-pitch', 'evt-comedy']);

  const byDate = await listEvents({ sortBy: 'date' });
  assert.deepEqual(byDate.map((event) => event.id), ['evt-jazz', 'evt-rock', 'evt-comedy', 'evt-pitch', 'evt-arts']);
});

test('an unknown sort is refused', async () => {
  await assert.rejects(() => listEvents({ sortBy: 'nonsense' }), (error) => {
    assert.equal(error.code, 'VALIDATION');
    return true;
  });
});

test('the city list is built from published events only', async () => {
  assert.deepEqual(await listCities(), ['Abuja', 'Enugu', 'Lagos', 'Port Harcourt']);
});

test('getEvent returns the tiers with their seats left', async () => {
  const event = await getEvent('evt-jazz');
  assert.equal(event.title, 'Lagos Jazz Night');
  const general = event.tiers.find((tier) => tier.id === 'tier-jazz-general');
  const vip = event.tiers.find((tier) => tier.id === 'tier-jazz-vip');
  assert.equal(general.seatsLeft, 88);
  assert.equal(vip.seatsLeft, 0);
});

test('getEvent on an unknown id is NOT_FOUND', async () => {
  await assert.rejects(() => getEvent('nope'), (error) => {
    assert.equal(error.code, 'NOT_FOUND');
    return true;
  });
});

test('a sold-out tier cannot be booked', async () => {
  await assert.rejects(() => createBooking({ tierId: 'tier-comedy-regular', quantity: 1 }), (error) => {
    assert.equal(error.code, 'SOLD_OUT');
    return true;
  });
});

test('a quantity above 10 is refused', async () => {
  await assert.rejects(() => createBooking({ tierId: 'tier-rock-standing', quantity: 11 }), (error) => {
    assert.equal(error.code, 'VALIDATION');
    return true;
  });
});

test('booking holds the seats and reduces the seats left', async () => {
  const booking = await createBooking({ tierId: 'tier-rock-standing', quantity: 2 });
  assert.equal(booking.status, 'pending');
  assert.equal(booking.amountCents, 15000);
  assert.equal(booking.reference.length, 8);

  const event = await getEvent('evt-rock');
  assert.equal(event.tiers[0].seatsLeft, 198);
});

test('a declined card leaves the booking pending so it can be retried', async () => {
  const booking = await createBooking({ tierId: 'tier-rock-standing', quantity: 1 });

  await assert.rejects(() => pay({ reference: booking.reference, card: 'declined' }), (error) => {
    assert.equal(error.code, 'PAYMENT_DECLINED');
    return true;
  });

  // The same booking can still be paid: the mock API never un-reserved it.
  const paid = await pay({ reference: booking.reference, card: 'ok' });
  assert.equal(paid.status, 'paid');
  assert.ok(paid.paymentId);
});

test('paying a booking twice is refused', async () => {
  const booking = await createBooking({ tierId: 'tier-rock-standing', quantity: 1 });
  await pay({ reference: booking.reference, card: 'ok' });

  await assert.rejects(() => pay({ reference: booking.reference, card: 'ok' }), (error) => {
    assert.equal(error.code, 'INVALID_TRANSITION');
    return true;
  });
});
