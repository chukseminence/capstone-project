# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.  
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 1

### Prompt 1: Build 1 implementation and review
- **What I asked:** Help me implement the event ticketing domain files, including errors, IDs, the waitlist queue, and inventory operations.
- **What came back:** JavaScript ES modules for creating events and ticket tiers, booking and cancelling tickets, looking up bookings, and managing a FIFO waitlist.
- **What was wrong (or "nothing"):** The cancellation error initially used a generic validation code. I changed it to `ALREADY_CANCELLED` so duplicate cancellations have a specific error code.


### Prompt 2: Demo and benchmark
- **What I asked:** Help me create a terminal demo and a benchmark comparing booking lookup with `Array.find()` and `Map.get()`.
- **What came back:** A demo showing successful bookings, a sold-out rejection, waitlist order, booking cancellation, and duplicate-cancellation rejection; plus a lookup benchmark.
- **What was wrong (or "nothing"):** I checked the demo output and confirmed that a refused booking did not reduce available tickets, cancellation returned tickets, and Tunde was next in the waitlist. Benchmark timings varied, so I treated the measured speed difference as an example rather than a guaranteed result.


## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**

### Prompt 2:
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**
