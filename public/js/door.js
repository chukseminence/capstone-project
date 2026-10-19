// The words the door shows after a scan. Pure functions (no page, no network), so tests can check them.
// Staff look at this in a hurry, at night, with a queue: one big word, then one short reason.

// result: what the server answered. error: the ApiError when the scan was refused (otherwise null).
// Returns { tone: "ok" | "stop" | "warn", headline, detail }
export function describeScan({ checkin = null, error = null }, formatTime = defaultTime) {
  if (checkin) {
    return {
      tone: "ok",
      headline: "Let them in",
      detail: `${checkin.buyerName}: ${checkin.quantity} ${checkin.quantity === 1 ? "person" : "people"}${checkin.tierName ? `, ${checkin.tierName}` : ""}. Booking ${checkin.bookingRef}.`,
    };
  }
  switch (error?.code) {
    case "ALREADY_CHECKED_IN":
      return {
        tone: "stop",
        headline: "Already used",
        detail: error.details?.checkedInAt ? `This ticket was first used at ${formatTime(error.details.checkedInAt)}. Do not admit.` : "This ticket was already used. Do not admit.",
      };
    case "INVALID_TICKET":
      return { tone: "stop", headline: "Fake or damaged code", detail: "This is not a real ticket. Do not admit. Ask to see their booking in My tickets." };
    case "WRONG_EVENT":
      return { tone: "stop", headline: "Wrong event", detail: "This ticket is for a different event. Do not admit." };
    case "TICKET_CANCELLED":
      return { tone: "stop", headline: "Cancelled ticket", detail: "This booking was cancelled or refunded. Do not admit." };
    case "TICKET_NOT_PAID":
      return { tone: "stop", headline: "Not paid", detail: "This booking was never paid for. Do not admit." };
    case "FORBIDDEN":
      return { tone: "warn", headline: "Staff accounts only", detail: "Log in with a staff account to check people in." };
    case "UNAUTHENTICATED":
      return { tone: "warn", headline: "Please log in", detail: "Your login ended. Log in again with your staff account." };
    case "RATE_LIMITED":
      return { tone: "warn", headline: "Slow down", detail: error.message };
    case "NETWORK":
      return { tone: "warn", headline: "No connection", detail: "Could not reach the server. Nobody was checked in. Try again." };
    default:
      return { tone: "warn", headline: "Could not check", detail: error?.message ?? "Something went wrong. Try again." };
  }
}

function defaultTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// A scanner or a paste can add spaces, a new line, or the web address text around the code. Keep only the code.
export function cleanCode(text) {
  return String(text ?? "").trim().replace(/\s+/g, "");
}
