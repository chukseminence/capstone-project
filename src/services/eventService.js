// Build 4: the event rules, moved out of the route handlers.
//
// The service receives a repository as an argument and reuses the pure domain
// rules (validation, summarising, search). It never imports a repository.

import { DomainError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';
import { requireText, requireWholeNumber, requireValidDate } from '../domain/validation.js';
import { summariseEvent } from '../domain/inventory.js';
import { searchEvents } from '../domain/eventSearch.js';

export function createEventService(repository) {
  async function getEventOrThrow(id) {
    const event = await repository.findEventById(id);
    if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
    return event;
  }

  return {
    async createEvent({ title, city, venue = '', startsAt, organizerId }) {
      requireText(organizerId, 'organizerId');
      const date = requireValidDate(startsAt, 'startsAt');
      const event = {
        id: newId(),
        organizerId,
        title: requireText(title, 'Title'),
        city: requireText(city, 'City'),
        venue: String(venue).trim(),
        startsAt: date.toISOString(),
        status: 'draft',
        tierIds: [],
      };
      return repository.saveEvent(event);
    },

    async addTier(eventId, { name, priceCents, capacity }) {
      const event = await getEventOrThrow(eventId);
      const tier = {
        id: newId(),
        eventId,
        name: requireText(name, 'Tier name'),
        // Money is ALWAYS whole cents.
        priceCents: requireWholeNumber(priceCents, 'priceCents', 0),
        capacity: requireWholeNumber(capacity, 'capacity', 1),
        sold: 0,
      };
      await repository.saveTier(tier);
      event.tierIds.push(tier.id);
      await repository.saveEvent(event);
      return tier;
    },

    async publishEvent(eventId) {
      const event = await getEventOrThrow(eventId);
      if (event.status === 'published') return event;
      if (!Array.isArray(event.tierIds) || event.tierIds.length === 0) {
        throw new DomainError('INVALID_STATE', 'Cannot publish an event with no ticket tiers');
      }
      event.status = 'published';
      return repository.saveEvent(event);
    },

    async unpublishEvent(eventId) {
      const event = await getEventOrThrow(eventId);
      event.status = 'draft';
      return repository.saveEvent(event);
    },

    async getEvent(eventId) {
      return getEventOrThrow(eventId);
    },

    // Search, filter and sort the PUBLISHED events using the shared domain rules.
    async search(filters = {}) {
      const [events, tiers] = await Promise.all([
        repository.listEvents(),
        repository.listTiers(),
      ]);

      const tiersByEvent = new Map();
      for (const tier of tiers) {
        if (!tiersByEvent.has(tier.eventId)) tiersByEvent.set(tier.eventId, []);
        tiersByEvent.get(tier.eventId).push(tier);
      }

      const summaries = events
        .filter((event) => event.status === 'published')
        .map((event) => summariseEvent(event, tiersByEvent.get(event.id) ?? []));

      return searchEvents(summaries, filters, filters.sortBy);
    },
  };
}
