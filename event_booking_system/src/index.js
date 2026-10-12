
const events = new Map();
const bookings = new Map();

let nextBookingId = 1;

function createEvent(id, title, capacity) {
    const event = {
        id,
        title,
        capacity,
        bookings: new Map(),
        waitlist: []
    };

    events.set(id, event);
    return event;
}

function bookTicket(eventId, attendee) {
    const event = events.get(eventId);

    if (!event) {
        throw new Error("Event not found.");
    }

    // Refuse a booking if the event is sold out.
    if (event.bookings.size >= event.capacity) {
        event.waitlist.push(attendee);

        console.log(
            `${attendee} cannot book: event sold out. ` +
            `${attendee} has joined the waitlist.`
        );

        return null;
    }

    const reference = `BK${String(nextBookingId).padStart(3, "0")}`;
    nextBookingId++;

    const booking = {
        reference,
        attendee,
        eventId,
        status: "confirmed"
    };

    event.bookings.set(reference, booking);
    bookings.set(reference, booking);

    console.log(
        `${attendee} booked successfully. Reference: ${reference}`
    );

    return booking;
}

function cancelBooking(reference) {
    const booking = bookings.get(reference);

    if (!booking || booking.status !== "confirmed") {
        console.log("Booking not found or already cancelled.");
        return;
    }

    const event = events.get(booking.eventId);

    event.bookings.delete(reference);
    booking.status = "cancelled";

    console.log(
        `${booking.attendee} cancelled booking ${reference}.`
    );

    // Offer the freed ticket to the first person in the queue.
    if (event.waitlist.length > 0) {
        const nextAttendee = event.waitlist.shift();

        console.log(
            `${nextAttendee} is next in line and will receive the available ticket.`
        );

        bookTicket(event.id, nextAttendee);
    }
}

function runDemo() {
    console.log("=== EVENT BOOKING SYSTEM DEMO ===\n");

    const event = createEvent("EVT001", "Tech Training", 2);

    console.log(`Event: ${event.title}`);
    console.log(`Capacity: ${event.capacity}\n`);

    console.log("--- 1. Booking tickets ---");
    bookTicket("EVT001", "David");
    bookTicket("EVT001", "John");

    console.log("\n--- 2. Event sells out ---");
    console.log(`Confirmed bookings: ${event.bookings.size}/${event.capacity}`);

    console.log("\n--- 3. Waitlist ---");
    bookTicket("EVT001", "Mary");
    bookTicket("EVT001", "Peter");

    console.log("\n--- 4. Cancellation ---");
    cancelBooking("BK001");

    console.log("\n--- 5. Final status ---");
    console.log(
        "Confirmed attendees:",
        [...event.bookings.values()].map((booking) => booking.attendee)
    );

    console.log("Remaining waitlist:", event.waitlist);
}

runDemo();

