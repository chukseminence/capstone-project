// Build 4: the routes layer.
//
// A route handler does two things only: turn an HTTP request into a call to a
// service, and turn the service's return value (or thrown DomainError) back into
// HTTP. No business rules live here: they are all in src/services/.
//
// Identity: until Build 7 adds real login, the caller says who they are with an
// `x-user-id` header.

import { DomainError } from '../domain/errors.js';

function requireUserId(req) {
  const header = req.headers['x-user-id'];
  const id = header === undefined ? '' : String(header).trim();
  if (id === '') {
    throw new DomainError('UNAUTHORIZED', 'x-user-id header is required');
  }
  return id;
}

// Query values arrive as strings. Turn "" and missing into undefined so the
// domain rules see real "not provided" values instead of empty strings.
function queryValue(query, name) {
  const value = query.get(name);
  return value === null || value === '' ? undefined : value;
}

function optionalNumber(value) {
  return value === undefined ? undefined : Number(value);
}

export function registerRoutes(router, services = {}) {
  const { eventService, bookingService } = services;

  router.get('/health', () => ({ status: 'ok' }));

  if (!eventService || !bookingService) return router;

  // --- events ---

  router.post('/api/events', async ({ req, res, body }) => {
    const event = await eventService.createEvent({
      ...(body ?? {}),
      organizerId: requireUserId(req),
    });
    res.statusCode = 201;
    return event;
  });

  router.post('/api/events/:id/tiers', async ({ params, body }) => {
    return eventService.addTier(params.id, body ?? {});
  });

  router.post('/api/events/:id/publish', async ({ params }) => {
    return eventService.publishEvent(params.id);
  });

  router.get('/api/events', async ({ query }) => {
    return eventService.search({
      q: queryValue(query, 'q'),
      city: queryValue(query, 'city'),
      from: queryValue(query, 'from'),
      to: queryValue(query, 'to'),
      maxPriceCents: optionalNumber(queryValue(query, 'maxPriceCents')),
      onlyAvailable: query.get('onlyAvailable') === 'true',
      sortBy: queryValue(query, 'sortBy'),
    });
  });

  // --- bookings ---

  router.post('/api/bookings', async ({ req, res, body }) => {
    const booking = await bookingService.book({
      tierId: body?.tierId,
      quantity: body?.quantity,
      userId: requireUserId(req),
    });
    res.statusCode = 201;
    return booking;
  });

  router.post('/api/bookings/:reference/pay', async ({ req, params, body }) => {
    return bookingService.pay({
      reference: params.reference,
      userId: requireUserId(req),
      card: body?.card,
    });
  });

  router.post('/api/bookings/:reference/cancel', async ({ req, params }) => {
    return bookingService.cancel({
      reference: params.reference,
      userId: requireUserId(req),
    });
  });

  return router;
}
