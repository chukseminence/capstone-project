// Build 4: the booking rules, moved out of the route handlers.
//
// Receives the repository and a payment gateway. Reuses the shared state
// machine so allowed moves between booking states are defined in one place.

import { DomainError } from '../domain/errors.js';
import { newId, referenceCode } from '../domain/ids.js';
import { seatsLeft } from '../domain/inventory.js';
import { requireQuantity } from '../domain/validation.js';
import { assertTransition } from '../domain/bookingStateMachine.js';

export function createBookingService(repository, paymentGateway) {
  async function getBookingOrThrow(reference) {
    const booking = await repository.findBookingByReference(reference);
    if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
    return booking;
  }

  function assertOwner(booking, userId) {
    if (booking.userId !== userId) {
      throw new DomainError('FORBIDDEN', 'This booking belongs to someone else');
    }
  }

  async function uniqueReference() {
    let reference;
    let taken = true;
    while (taken) {
      reference = referenceCode();
      taken = (await repository.findBookingByReference(reference)) !== null;
    }
    return reference;
  }

  return {
    async book({ tierId, userId, quantity }) {
      requireQuantity(quantity);

      const tier = await repository.findTierById(tierId);
      if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');

      const left = seatsLeft(tier);
      if (left < quantity) {
        const message = left === 0 ? `${tier.name} is sold out` : `Only ${left} ticket(s) left in ${tier.name}`;
        throw new DomainError('SOLD_OUT', message, { seatsLeft: left });
      }

      const booking = {
        id: newId(),
        reference: await uniqueReference(),
        userId,
        tierId,
        quantity,
        amountCents: tier.priceCents * quantity,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      // Booking holds the seats straight away. Paying just confirms them.
      tier.sold += quantity;
      await repository.saveTier(tier);
      return repository.saveBooking(booking);
    },

    // Pay for an unpaid booking with the mock gateway. A decline leaves the
    // booking pending, and a card is only charged once (the state machine stops
    // a second charge).
    async pay({ reference, userId, card }) {
      const booking = await getBookingOrThrow(reference);
      assertOwner(booking, userId);
      assertTransition(booking.status, 'paid');

      const result = await paymentGateway.charge({
        amountCents: booking.amountCents,
        reference: booking.reference,
        card,
      });
      if (!result.ok) {
        throw new DomainError('PAYMENT_DECLINED', result.message ?? 'The card was declined');
      }

      booking.status = 'paid';
      booking.paymentId = result.paymentId;
      booking.paidAt = new Date().toISOString();
      return repository.saveBooking(booking);
    },

    // Build 4 only cancels UNPAID (pending) bookings and returns the seats.
    // Refunds arrive in Build 8.
    async cancel({ reference, userId }) {
      const booking = await getBookingOrThrow(reference);
      assertOwner(booking, userId);
      if (booking.status !== 'pending') {
        throw new DomainError('INVALID_TRANSITION', 'Only an unpaid booking can be cancelled');
      }

      const tier = await repository.findTierById(booking.tierId);
      if (tier) {
        tier.sold = Math.max(0, tier.sold - booking.quantity);
        await repository.saveTier(tier);
      }

      booking.status = 'cancelled';
      booking.cancelledAt = new Date().toISOString();
      return repository.saveBooking(booking);
    },

    async getBooking(reference) {
      return getBookingOrThrow(reference);
    },
  };
}
