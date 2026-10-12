const SIZE = 100000;
const SEARCH_REFERENCE = `BK${SIZE}`;

const bookingsArray = [];
const bookingsMap = new Map();

// Create 100,000 bookings
for (let i = 1; i <= SIZE; i++) {
	const reference = `BK${i}`;

	const booking = {
		reference: reference,
		attendee: `Attendee ${i}`,
	};

	bookingsArray.push(booking);
	bookingsMap.set(reference, booking);
}

const arrayStart = performance.now();

const arrayResult = bookingsArray.find(
	(booking) => booking.reference === SEARCH_REFERENCE
);

const arrayEnd = performance.now();

const mapStart = performance.now();

const mapResult = bookingsMap.get(SEARCH_REFERENCE);

const mapEnd = performance.now();

console.log("Number of bookings:", SIZE);
console.log("\nArray.find():");
console.log("Found:", arrayResult.reference);
console.log("Time:", (arrayEnd - arrayStart).toFixed(4), "ms");

console.log("\nMap.get():");
console.log("Found:", mapResult.reference);
console.log("Time:", (mapEnd - mapStart).toFixed(4), "ms");
