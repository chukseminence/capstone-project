const { events } = require("./event");

const bookings = new Map();
let bookingCounter = 1;

function createBooking(eventId, tierId, customerName, quantity) {
	if (typeof eventId !== "string" || eventId.trim() === "") {
		throw new Error("Event id is required.");
	}

	if (typeof tierId !== "string" || tierId.trim() === "") {
		throw new Error("Ticket tier id is required.");
	}

	if (typeof customerName !== "string" || customerName.trim() === "") {
		throw new Error("Customer name is required.");
	}

	if (!Number.isInteger(quantity) || quantity <= 0) {
		throw new Error("Quantity must be a positive integer.");
	}

	const event = events.get(eventId);
	if (!event) {
		throw new Error(`Event ${eventId} was not found.`);
	}

	const tier = event.ticketTiers.find((item) => item.id === tierId);
	if (!tier) {
		throw new Error(`Ticket tier ${tierId} was not found on event ${eventId}.`);
	}

	const remaining = tier.capacity - tier.sold;
	if (quantity > remaining) {
		throw new Error(`Only ${remaining} ticket(s) remaining for ${tier.name}.`);
	}

	tier.sold += quantity;

	const booking = {
		id: `BK${String(bookingCounter++).padStart(3, "0")}`,
		eventId,
		tierId,
		customerName: customerName.trim(),
		quantity,
		totalPrice: tier.price * quantity,
	};

	bookings.set(booking.id, booking);
	return booking;
}

module.exports = { bookings, createBooking };
