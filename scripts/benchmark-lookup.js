
import { performance } from "node:perf_hooks";

const TOTAL_BOOKINGS = 100_000;
const LOOKUPS = 500;

const bookings = [];
const bookingsByReference = new Map();


for (let i = 0; i < TOTAL_BOOKINGS; i += 1) {
  const booking = {
    reference: `REF${String(i).padStart(6, "0")}`,
    customerName: `Customer ${i}`
  };

  bookings.push(booking);
  bookingsByReference.set(booking.reference, booking);
}


const referencesToFind = [];

for (let i = 0; i < LOOKUPS; i += 1) {
  const index = Math.floor(Math.random() * TOTAL_BOOKINGS);

  referencesToFind.push(
    `REF${String(index).padStart(6, "0")}`
  );
}


function measure(label, searchFunction) {
  const start = performance.now();

  for (const reference of referencesToFind) {
    searchFunction(reference);
  }

  const elapsed = performance.now() - start;

  console.log(`${label}: ${elapsed.toFixed(3)} ms`);
}


console.log("=== BOOKING LOOKUP BENCHMARK ===");
console.log(`Bookings: ${TOTAL_BOOKINGS.toLocaleString()}`);
console.log(`Lookups: ${LOOKUPS}`);

measure("Array.find()", (reference) => {
  return bookings.find(
    (booking) => booking.reference === reference
  );
});


measure("Map.get()", (reference) => {
  return bookingsByReference.get(reference);
});

console.log("=== BENCHMARK COMPLETED ===");
