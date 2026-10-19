import { createHmac, timingSafeEqual } from "node:crypto";

// TICKET TOKENS: the text inside a ticket's QR code.
//
//   BK-000012.1780000000.k3Jx...        =   booking reference . issued-at (seconds) . signature
//
// SIGNING is not ENCRYPTING. Anybody can READ this text (it is not secret). What nobody can do is
// MAKE a new one or CHANGE one, because the signature is a stamp that only the server's secret key
// can produce (HMAC-SHA256). A guard at the door who edits "BK-000012" to "BK-000013" gets a
// stamp that no longer matches, so the code is refused as INVALID.
//
// What is inside: only the booking reference and the time it was issued. Never a name or an email,
// so a photo of a ticket reveals nothing about the person.
//
// The secret here is NOT the secret that signs logins (TOKEN_SECRET). It is its own key
// (TICKET_SECRET). Even if one key leaked, the other kind of token could still not be forged.
// The text "ticket" is also mixed into every stamp, so a login token can never pass as a ticket.

const MIN_SECRET_LENGTH = 16;
const MAX_CODE_LENGTH = 200;
const REF_PATTERN = /^BK-\d{6,12}$/;

function checkSecret(secret) {
  if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`The ticket secret must be at least ${MIN_SECRET_LENGTH} characters long.`);
  }
}

function stampOf(secret, text) {
  return createHmac("sha256", secret).update("ticket:" + text).digest("base64url");
}

// bookingRef: "BK-000012".  now: milliseconds.
export function signTicket(bookingRef, secret, now = Date.now()) {
  checkSecret(secret);
  if (typeof bookingRef !== "string" || !REF_PATTERN.test(bookingRef)) {
    throw new Error("A ticket needs a booking reference like BK-000012.");
  }
  const body = `${bookingRef}.${Math.floor(now / 1000)}`;
  return `${body}.${stampOf(secret, body)}`;
}

// Gives back { bookingRef, issuedAt } when the code is genuine, or null for ANYTHING else
// (edited, made up, cut short, wrong type). The caller never learns which part was wrong.
export function verifyTicket(code, secret) {
  checkSecret(secret);
  if (typeof code !== "string" || code.length === 0 || code.length > MAX_CODE_LENGTH) return null;
  const parts = code.trim().split(".");
  if (parts.length !== 3) return null;
  const [bookingRef, issued, signature] = parts;
  if (!REF_PATTERN.test(bookingRef) || !/^\d{1,12}$/.test(issued)) return null;

  const expected = Buffer.from(stampOf(secret, `${bookingRef}.${issued}`));
  const given = Buffer.from(signature);
  // timingSafeEqual takes the same time however many letters match, so a thief cannot guess the
  // stamp one letter at a time by measuring how long the answer takes.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { bookingRef, issuedAt: Number(issued) };
}
