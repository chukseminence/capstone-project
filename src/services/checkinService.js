import { DomainError } from "../errors.js";
import { signTicket, verifyTicket } from "../lib/ticketToken.js";
import { requireLogin, requireRole } from "./access.js";

// SERVICES layer: the ticket QR code, and the door.
//
//   issue(ref, actor)              the attendee asks for the code to show in their QR
//   checkIn(code, eventId, actor)  door staff, or the organizer of that event, scan a code at an event
//
// A scan is refused for exactly one clear reason (each has its own error code):
//   INVALID_TICKET       the code was edited, made up, or is not a ticket code at all
//   WRONG_EVENT          a real ticket, but for a different event
//   TICKET_CANCELLED     the booking was cancelled, refunded or expired
//   TICKET_NOT_PAID      the booking was never paid for
//   ALREADY_CHECKED_IN   used before; the answer says WHEN it was first used
export function createCheckinService(store, { secret, now = Date.now }) {
  // Fail at start-up, not at the first scan, if the secret is missing or too short.
  signTicket("BK-000000", secret, 0);

  return {
    // The attendee's own paid booking gets a signed code. Someone else's booking looks like "not found".
    issue(ref, actor) {
      requireLogin(actor);
      const booking = store.bookings.find(ref);
      if (!booking || booking.userId === null || booking.userId !== actor.id) {
        throw new DomainError("NOT_FOUND", `No booking with code ${ref}.`);
      }
      if (booking.status !== "paid") {
        throw new DomainError("TICKET_NOT_PAID", "Only a paid booking has a ticket code.");
      }
      return { code: signTicket(booking.ref, secret, now()), bookingRef: booking.ref };
    },

    checkIn(code, eventId, actor) {
      requireRole(actor, "staff", "organizer"); // attendees cannot scan: FORBIDDEN
      if (typeof code !== "string" || typeof eventId !== "string" || eventId === "") {
        throw new DomainError("VALIDATION", "A check-in needs the ticket code and the event you are working at.");
      }
      const event = store.requireEvent(eventId); // NOT_FOUND if there is no such event
      // An organizer can check people in only to THEIR OWN events. (Door staff work at any event.)
      if (actor.role === "organizer" && event.ownerId !== actor.id) {
        throw new DomainError("FORBIDDEN", "You can only check people in to your own events.");
      }

      // 1. Is the code genuine? (the stamp matches)
      const verified = verifyTicket(code, secret);
      const booking = verified ? store.bookings.find(verified.bookingRef) : undefined;
      if (!verified || !booking) {
        throw new DomainError("INVALID_TICKET", "This code is not a valid ticket. Do not admit.");
      }
      // 2. Is it for THIS event?
      if (booking.eventId !== event.id) {
        throw new DomainError("WRONG_EVENT", "This ticket is for a different event. Do not admit.");
      }

      // 3. Admit, in ONE atomic step. The data layer only changes the row if the booking is paid and not yet used.
      const result = store.bookings.checkIn(booking.ref, event.id, { staffId: actor.id, nowMs: now() });
      if (result.admitted) {
        return {
          booking: result.booking,
          event: { id: event.id, title: event.title },
          tierName: event.tiers.get(result.booking.tierId)?.name ?? null,
        };
      }

      // Not admitted: say why, using the row as it is NOW.
      const now_ = result.booking ?? booking;
      if (now_.status === "cancelled" || now_.status === "refunded" || now_.status === "expired") {
        throw new DomainError("TICKET_CANCELLED", "This booking was cancelled or refunded. Do not admit.");
      }
      if (now_.status !== "paid") {
        throw new DomainError("TICKET_NOT_PAID", "This booking was not paid for. Do not admit.");
      }
      throw new DomainError("ALREADY_CHECKED_IN", "This ticket was already used. Do not admit.", { checkedInAt: now_.checkedInAt });
    },
  };
}
