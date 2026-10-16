# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 1

### Prompt 1: Build 1 domain core
- **What I asked:** Implement the Build 1 in-memory ticketing domain, readable references, FIFO waitlist, demo, and lookup benchmark.
- **What came back:** The core modules and scripts were already present, and the demo and benchmark scripts were configured. No files were created; the requested files already existed. ids.js and inventory.js were modified. The demo, benchmark and Javascript syntax were verified.
- **What was wrong (or "nothing"):** The ID module exported `referenceCode` instead of the requested `newReference`; some malformed public inputs leaked native errors, and booking lookup targets used `Math.random`. Added the requested export while keeping the old name compatible, tightened validation and booking mutation ordering. The demo and benchmark passed.

## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**

### Prompt 2:
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**
