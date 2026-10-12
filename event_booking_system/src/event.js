const events = new Map();
let nextEventId = 1;

function createEvent(id, name, title, venue, city, date, published = false, ticketTiers = []) {
	if (!name || !title || !venue || !city || !date) {
		throw new Error("name, title, venue, city, and date are required");
	}

	const eventId = id || `EVT${String(nextEventId).padStart(3, "0")}`;

	if (events.has(eventId)) {
		throw new Error(`Event with id ${eventId} already exists`);
	}

	const newEvent = {
		id: eventId,
		name,
		title,
		venue,
		city,
		date,
		published: Boolean(published),
		ticketTiers: Array.isArray(ticketTiers) ? ticketTiers : [],
	};

	events.set(eventId, newEvent);
	nextEventId += 1;
	return newEvent;
}

module.exports = { events, createEvent };
