import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatMoney, nairaToCents, describeDate, ticketWord } from "../public/js/money.js";
import { secondsLeft, formatClock, milestoneMessage, countdownParts } from "../public/js/countdown.js";
import { digitsOnly, groupCardNumber, passesLuhn, validateCard } from "../public/js/card.js";
import { REFUND_POLICY_LINES, refundMessage, refundDoneMessage, waitlistStatusWords, formatMinutesSeconds } from "../public/js/refund.js";
import { toApiQuery, percentSold, nextBigNight } from "../public/js/views/browse.js";
import { describeScan, cleanCode } from "../public/js/door.js";

describe("website helpers: money", () => {
  test("formatMoney shows naira from whole cents", () => {
    assert.equal(formatMoney(800000), "₦8,000");
    assert.equal(formatMoney(123456789), "₦1,234,567.89");
    assert.equal(formatMoney(150), "₦1.50");
    assert.equal(formatMoney(5), "₦0.05");
    assert.equal(formatMoney(0), "Free");
  });
  test("formatMoney refuses things that are not whole cents", () => {
    for (const bad of [-1, 1.5, NaN, "100", null, undefined]) assert.equal(formatMoney(bad), "");
  });
  test("nairaToCents reads what a person types, with no decimal rounding", () => {
    assert.equal(nairaToCents("8,000"), 800000);
    assert.equal(nairaToCents("₦8000.5"), 800050);
    assert.equal(nairaToCents("0.1"), 10);
    assert.equal(nairaToCents("19.99"), 1999);
    assert.equal(nairaToCents(" 2 000 "), 200000);
    for (const bad of ["", "abc", "-5", "1.234", "1e3", "5.", ".5", "99999999999999999999"]) assert.equal(nairaToCents(bad), null, bad);
  });
  test("describeDate does not move the day with the computer's time zone", () => {
    const d = describeDate("2026-11-07");
    assert.deepEqual([d.day, d.month, d.year, d.weekday], ["07", "Nov", "2026", "Saturday"]);
    assert.equal(d.long, "Saturday 7 Nov 2026");
    assert.equal(describeDate("nonsense").long, "nonsense");
  });
  test("ticketWord", () => {
    assert.equal(ticketWord(1), "ticket");
    assert.equal(ticketWord(2), "tickets");
  });
});

describe("website helpers: countdown", () => {
  test("secondsLeft rounds up and never goes below zero", () => {
    assert.equal(secondsLeft(10_000, 0), 10);
    assert.equal(secondsLeft(10_000, 9_001), 1);
    assert.equal(secondsLeft(10_000, 10_000), 0);
    assert.equal(secondsLeft(10_000, 99_999), 0);
  });
  test("formatClock", () => {
    assert.equal(formatClock(600), "10:00");
    assert.equal(formatClock(59), "00:59");
    assert.equal(formatClock(61), "01:01");
    assert.equal(formatClock(-5), "00:00");
  });
  test("screen readers only hear a few milestones", () => {
    assert.ok(milestoneMessage(60));
    assert.ok(milestoneMessage(0));
    assert.equal(milestoneMessage(59), null);
    assert.equal(milestoneMessage(299), null);
  });
});

describe("website helpers: card form", () => {
  test("digits and grouping", () => {
    assert.equal(digitsOnly("4242-4242 abc"), "42424242");
    assert.equal(groupCardNumber("4242424242424242"), "4242 4242 4242 4242");
    assert.equal(groupCardNumber("42"), "42");
  });
  test("the two test cards pass the Luhn check, a typo does not", () => {
    assert.equal(passesLuhn("4242424242424242"), true);
    assert.equal(passesLuhn("4000 0000 0000 0002"), true);
    assert.equal(passesLuhn("4242424242424241"), false);
    assert.equal(passesLuhn("1234"), false);
  });
  test("validateCard: good card has no problems", () => {
    const now = new Date(2026, 9, 14);
    assert.deepEqual(validateCard({ number: "4242 4242 4242 4242", expiry: "12/29", cvc: "123" }, now), {});
    assert.deepEqual(validateCard({ number: "4242424242424242", expiry: "10/26", cvc: "1234" }, now), {}); // this month is still fine
  });
  test("validateCard: each bad field gets its own plain message", () => {
    const now = new Date(2026, 9, 14);
    const p = validateCard({ number: "", expiry: "13/29", cvc: "12" }, now);
    assert.match(p.number, /Enter the card number/);
    assert.match(p.expiry, /between 01 and 12/);
    assert.match(p.cvc, /3 or 4 digit/);
    assert.match(validateCard({ number: "4242424242424242", expiry: "09/26", cvc: "123" }, now).expiry, /expired/);
    assert.match(validateCard({ number: "4242424242424242", expiry: "1229", cvc: "123" }, now).expiry, /MM\/YY/);
    assert.match(validateCard({ number: "4242424242424241", expiry: "12/29", cvc: "123" }, now).number, /not valid/);
  });
});

describe("website helpers: filter boxes -> API query", () => {
  const blank = { q: "", city: "", from: "", to: "", max: "", sort: "date-asc" };
  test("empty boxes only ask for the sort", () => {
    assert.deepEqual(toApiQuery(blank), { query: { sort: "date", order: "asc" } });
  });
  test("boxes become API names, price becomes cents", () => {
    const { query } = toApiQuery({ q: " jazz ", city: "Lagos", from: "2026-11-01", to: "2026-12-01", max: "10,000", sort: "price-desc" });
    assert.deepEqual(query, { q: "jazz", city: "Lagos", dateFrom: "2026-11-01", dateTo: "2026-12-01", maxPriceCents: 1000000, sort: "price", order: "desc" });
  });
  test("bad input gives a message instead of a query", () => {
    assert.match(toApiQuery({ ...blank, from: "2026-12-01", to: "2026-11-01" }).problem, /end date is before/);
    assert.match(toApiQuery({ ...blank, max: "ten" }).problem, /number/);
  });
});

describe("website helpers: refund and waitlist words", () => {
  test("refundMessage says what the person will get back", () => {
    assert.match(refundMessage({ paid: false, refundCents: 0, percent: 0 }, 500000), /not paid yet/);
    assert.match(refundMessage({ paid: true, percent: 100, refundCents: 500000 }, 500000), /₦5,000 back \(all of it\)/);
    assert.match(refundMessage({ paid: true, percent: 50, refundCents: 250000 }, 500000), /₦2,500 back \(50% of ₦5,000\)/);
    assert.match(refundMessage({ paid: true, percent: 0, refundCents: 0 }, 500000), /nothing back/);
    assert.match(refundMessage({ paid: true, percent: 0, refundCents: 0 }, 0), /was free/);
    assert.match(refundMessage(null, 100), /nothing to refund/);
  });
  test("refundDoneMessage", () => {
    assert.match(refundDoneMessage({ paid: true, refundCents: 150 }), /₦1.50 is on its way/);
    assert.match(refundDoneMessage({ paid: true, refundCents: 0 }), /No refund is due/);
    assert.match(refundDoneMessage({ paid: false }), /cancelled/);
  });
  test("waitlist words and clock", () => {
    assert.equal(waitlistStatusWords({ status: "waiting", position: 3 }), "You are number 3 in line.");
    assert.match(waitlistStatusWords({ status: "offered" }, 90), /01:30/);
    assert.match(waitlistStatusWords({ status: "expired" }), /ran out/);
    assert.equal(formatMinutesSeconds(905), "15:05");
    assert.equal(formatMinutesSeconds(-3), "00:00");
  });
  test("the policy has one line per rule", () => {
    assert.equal(REFUND_POLICY_LINES.length, 3);
  });
});

describe("website helpers: the big countdown and the sold bar (design C)", () => {
  test("countdownParts splits seconds into days, hours and minutes", () => {
    assert.deepEqual(countdownParts(0), { days: 0, hours: 0, minutes: 0 });
    assert.deepEqual(countdownParts(59), { days: 0, hours: 0, minutes: 0 });
    assert.deepEqual(countdownParts(3600 + 120), { days: 0, hours: 1, minutes: 2 });
    assert.deepEqual(countdownParts(19 * 86400 + 13 * 3600 + 13 * 60 + 5), { days: 19, hours: 13, minutes: 13 });
    assert.deepEqual(countdownParts(-50), { days: 0, hours: 0, minutes: 0 });
  });
  const ev = (date, tiers) => ({ id: date, title: date, date, venue: "V", city: "C", tiers: tiers.map(([capacity, seatsLeft], i) => ({ id: "T" + i, name: "t", priceCents: 0, capacity, seatsLeft })) });
  test("percentSold counts seats taken over all seats, rounded", () => {
    assert.equal(percentSold(ev("2026-11-01", [[200, 143], [40, 12]])), 35); // 85 of 240 taken
    assert.equal(percentSold(ev("2026-11-01", [[10, 10]])), 0);
    assert.equal(percentSold(ev("2026-11-01", [[10, 0]])), 100);
    assert.equal(percentSold(ev("2026-11-01", [])), 0);
  });
  test("nextBigNight is the soonest event that still has seats and has not started", () => {
    const now = Date.parse("2026-11-05T10:00:00Z");
    const events = [ev("2026-11-04", [[10, 5]]), ev("2026-11-06", [[10, 0]]), ev("2026-11-09", [[10, 5]]), ev("2026-11-07", [[10, 5]])];
    assert.equal(nextBigNight(events, now).date, "2026-11-07");
    assert.equal(nextBigNight([ev("2026-11-04", [[10, 5]])], now), null);
    assert.equal(nextBigNight([], now), null);
  });
});

describe("website helpers: the words at the door (door.js)", () => {
  const err = (code, details = {}, message = "m") => ({ code, details, message });
  test("an admitted scan says Let them in, with the name and number of people", () => {
    const words = describeScan({ checkin: { buyerName: "Ada", quantity: 2, tierName: "VIP", bookingRef: "BK-000001" } });
    assert.equal(words.tone, "ok");
    assert.equal(words.headline, "Let them in");
    assert.match(words.detail, /Ada: 2 people, VIP/);
  });
  test("every refusal is a STOP with its own plain headline", () => {
    const headline = (code, details) => describeScan({ error: err(code, details) }, (t) => `<${t}>`);
    assert.equal(headline("INVALID_TICKET").headline, "Fake or damaged code");
    assert.equal(headline("WRONG_EVENT").headline, "Wrong event");
    assert.equal(headline("TICKET_CANCELLED").headline, "Cancelled ticket");
    assert.equal(headline("TICKET_NOT_PAID").headline, "Not paid");
    for (const code of ["INVALID_TICKET", "WRONG_EVENT", "TICKET_CANCELLED", "TICKET_NOT_PAID", "ALREADY_CHECKED_IN"]) assert.equal(headline(code).tone, "stop");
  });
  test("a repeated scan shows when it was FIRST used", () => {
    const words = describeScan({ error: err("ALREADY_CHECKED_IN", { checkedInAt: "2026-11-07T20:15:00.000Z" }) }, (t) => `<${t}>`);
    assert.equal(words.headline, "Already used");
    assert.match(words.detail, /first used at <2026-11-07T20:15:00.000Z>/);
  });
  test("wrong role, no login, slow down and no connection are warnings, not stops", () => {
    for (const code of ["FORBIDDEN", "UNAUTHENTICATED", "RATE_LIMITED", "NETWORK", "SOMETHING_ELSE"]) assert.equal(describeScan({ error: err(code) }).tone, "warn");
  });
  test("cleanCode removes spaces and new lines a scanner or a paste adds", () => {
    assert.equal(cleanCode("  BK-000001.1.abc \n"), "BK-000001.1.abc");
    assert.equal(cleanCode(null), "");
  });
});
