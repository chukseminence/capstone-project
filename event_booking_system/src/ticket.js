let tierCounter = 1;

function createTicketTier(name, price, capacity) {
	if (typeof name !== "string" || name.trim() === "") {
		throw new Error("Ticket tier name is required.");
	}

	if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
		throw new Error("Ticket price must be a valid non-negative number.");
	}

	if (!Number.isInteger(capacity) || capacity <= 0) {
		throw new Error("Ticket capacity must be a positive integer.");
	}

	const ticketTier = {
		id: `TIER${String(tierCounter++).padStart(3, "0")}`,
		name: name.trim(),
		price,
		capacity,
		sold: 0,
	};

	return ticketTier;
}

module.exports = { createTicketTier };
