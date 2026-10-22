
import {
  createStore,
  createEvent,
  addTier,
  bookTickets,
  joinWaitlist,
  cancelBooking,
  findBookingByReference,
  nextWaitlistEntry
} from "../src/domain/inventory.js";

console.log("=== EVENT TICKETING DEMO ===");

// 1. Create a store and an event.
const store = createStore();

const event = createEvent(store, {
  name: "Lagos Fiesta Carnival",
  capacity: 3
});

console.log(`Event created: ${event.name}`);
console.log(`Event capacity: ${event.capacity}`);

// 2. Create a ticket tier with only 3 tickets.
const tier = addTier(store, event.id, {
  name: "Regular",
  priceCents: 500000,
  quantity: 3
});

function showAvailableTickets() {
  return store.events.get(event.id).tiers.get(tier.id).available;
}

console.log(`Ticket tier created: ${tier.name}`);
console.log(`Available tickets: ${showAvailableTickets()}`);

// 3. Ada books 2 tickets.
const adaBooking = bookTickets(store, {
  eventId: event.id,
  tierId: tier.id,
  customerName: "Ada",
  quantity: 2
});

console.log("\nBooking confirmed!");
console.log(`Customer: ${adaBooking.customerName}`);
console.log(`Reference: ${adaBooking.reference}`);
console.log(`Tickets booked: ${adaBooking.quantity}`);
console.log(`Total price in minor units: ${adaBooking.totalCents}`);
console.log(`Available tickets: ${showAvailableTickets()}`);

// 4. Chidi books the last ticket.
const chidiBooking = bookTickets(store, {
  eventId: event.id,
  tierId: tier.id,
  customerName: "Chidi",
  quantity: 1
});

console.log(`\n${chidiBooking.customerName} booked the last ticket.`);
console.log(`Available tickets: ${showAvailableTickets()}`);

// 5. Another booking should fail because the tier is sold out.
try {
  bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    customerName: "Ngozi",
    quantity: 1
  });
} catch (error) {
  console.log(`\nBooking refused: ${error.code}`);
}

console.log(`Available tickets after refused booking: ${showAvailableTickets()}`);

// 6. Tunde and Bola join the waitlist.
joinWaitlist(store, {
  eventId: event.id,
  tierId: tier.id,
  customerName: "Tunde",
  quantity: 1
});

joinWaitlist(store, {
  eventId: event.id,
  tierId: tier.id,
  customerName: "Bola",
  quantity: 1
});

console.log("\nCustomers added to the waitlist: Tunde, Bola");

// 7. Find Ada's booking using its reference.
const foundBooking = findBookingByReference(store, adaBooking.reference);

console.log("\nBooking lookup successful!");
console.log(`Found customer: ${foundBooking.customerName}`);

// 8. Ada cancels, releasing her two tickets.
cancelBooking(store, adaBooking.reference);

console.log("\nAda's booking has been cancelled.");
console.log(`Available tickets after cancellation: ${showAvailableTickets()}`);

// 9. The first person on the waitlist is announced.
const nextCustomer = nextWaitlistEntry(store, event.id, tier.id);

console.log(`Next customer in line: ${nextCustomer.customerName}`);

// 10. A second cancellation of Ada's booking must fail.
try {
  cancelBooking(store, adaBooking.reference);
} catch (error) {
  console.log(`Duplicate cancellation refused: ${error.code}`);
}

console.log("\n=== DEMO COMPLETED ===");
