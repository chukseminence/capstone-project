// S05: browse, filter and sort events.
import { listEvents, ApiError } from "../api.js";
import { h, uniqueId } from "../dom.js";
import { formatMoney, nairaToCents, describeDate } from "../money.js";
import { countdownParts, secondsLeft } from "../countdown.js";

const SORTS = [
  ["date-asc", "Soonest first"],
  ["date-desc", "Latest first"],
  ["price-asc", "Cheapest first"],
  ["price-desc", "Most expensive first"],
  ["availability-asc", "Fewest seats left"],
  ["availability-desc", "Most seats left"],
];

// The filter boxes live in the address (#/?city=Lagos) so the back button and sharing a link work.
function readValues(query) {
  const sort = query.get("sort");
  return {
    q: query.get("q") ?? "",
    city: query.get("city") ?? "",
    from: query.get("from") ?? "",
    to: query.get("to") ?? "",
    max: query.get("max") ?? "",
    sort: SORTS.some(([key]) => key === sort) ? sort : "date-asc",
  };
}

// Turns the box values into an API query. Returns { query } or { problem }.
export function toApiQuery(values) {
  const query = {};
  if (values.q.trim()) query.q = values.q.trim();
  if (values.city) query.city = values.city;
  if (values.from) query.dateFrom = values.from;
  if (values.to) query.dateTo = values.to;
  if (values.from && values.to && values.from > values.to) {
    return { problem: "The end date is before the start date. Change one of them." };
  }
  if (values.max.trim()) {
    const cents = nairaToCents(values.max);
    if (cents === null) return { problem: "Enter the highest price as a number, for example 10000." };
    query.maxPriceCents = cents;
  }
  const [sort, order] = values.sort.split("-");
  query.sort = sort;
  query.order = order;
  return { query };
}

function totalSeatsLeft(event) {
  return event.tiers.reduce((sum, t) => sum + t.seatsLeft, 0);
}

// Percent of all seats that are taken (0 to 100), for the "sold" bar.
export function percentSold(event) {
  const capacity = event.tiers.reduce((sum, t) => sum + t.capacity, 0);
  if (capacity === 0) return 0;
  return Math.round(((capacity - totalSeatsLeft(event)) / capacity) * 100);
}

// The event that starts soonest and still has seats. The server sends dates only, and an event starts at 00:00 UTC (same rule as refunds).
export function nextBigNight(events, nowMs) {
  const upcoming = events
    .filter((e) => totalSeatsLeft(e) > 0 && Date.parse(e.date + "T00:00:00Z") > nowMs)
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] ?? null;
}

function featuredBox(event) {
  const startsAt = Date.parse(event.date + "T00:00:00Z");
  const date = describeDate(event.date);
  const numbers = { days: h("span", { class: "countdown-num" }), hours: h("span", { class: "countdown-num" }), minutes: h("span", { class: "countdown-num" }) };
  const box = (key, unit) => h("div", { class: "countdown-box" }, numbers[key], h("span", { class: "countdown-unit", text: unit }));
  const readout = h("div", { class: "countdown", role: "timer", "aria-label": `Time until ${event.title}` }, box("days", "days"), box("hours", "hours"), box("minutes", "min"));
  const tick = () => {
    const parts = countdownParts(secondsLeft(startsAt, Date.now()));
    numbers.days.textContent = String(parts.days);
    numbers.hours.textContent = String(parts.hours).padStart(2, "0");
    numbers.minutes.textContent = String(parts.minutes).padStart(2, "0");
  };
  tick();
  const timer = setInterval(tick, 30_000);
  const element = h("section", { class: "featured", "aria-labelledby": "featured-title" },
    h("p", { class: "featured-tag", text: "Next big night" }),
    h("h2", { id: "featured-title" }, h("a", { href: `#/event/${encodeURIComponent(event.id)}` }, event.title)),
    h("p", { class: "featured-when", text: `${date.long}, ${event.venue}, ${event.city}` }),
    readout,
    h("a", { class: "button", href: `#/event/${encodeURIComponent(event.id)}` }, "Get tickets"));
  return { element, stop: () => clearInterval(timer) };
}

function ticketCard(event) {
  const date = describeDate(event.date);
  const soldOut = totalSeatsLeft(event) === 0;
  // Show the cheapest tier that can still be bought.
  const prices = event.tiers.filter((t) => t.seatsLeft > 0).map((t) => t.priceCents);
  const from = prices.length ? Math.min(...prices) : 0;
  return h("li", { class: "ticket" + (soldOut ? " is-soldout" : "") },
    h("div", { class: "ticket-body" },
      h("h2", {}, h("a", { href: `#/event/${encodeURIComponent(event.id)}` }, event.title)),
      h("p", { class: "where", text: `${event.venue}, ${event.city}` }),
      soldOut
        ? h("p", { class: "badge badge-soldout", text: "Sold out" })
        : h("p", { class: "price" }, from === 0 ? "Free entry available" : `From ${formatMoney(from)}`),
      soldOut ? null : soldBar(event)),
    h("div", { class: "ticket-stub" },
      h("time", { datetime: event.date, "aria-label": date.long },
        h("span", { class: "stub-day", text: date.day }),
        h("span", { class: "stub-month", text: date.month }),
        h("span", { class: "stub-year", text: date.year }))));
}

function soldBar(event) {
  const capacity = event.tiers.reduce((sum, t) => sum + t.capacity, 0);
  const percent = percentSold(event);
  return h("div", { class: "sold" },
    h("meter", { class: "sold-meter", min: 0, max: capacity, value: capacity - totalSeatsLeft(event), "aria-label": `${event.title}: ${percent}% sold` }),
    h("span", { class: "sold-note", text: `${percent}% sold` }));
}

export async function browseView({ query, announce }) {
  const values = readValues(query);
  const everything = (await listEvents({})).events;
  const cities = [...new Set(everything.map((e) => e.city))].sort();

  const ids = { q: uniqueId("q"), city: uniqueId("city"), from: uniqueId("from"), to: uniqueId("to"), max: uniqueId("max"), sort: uniqueId("sort") };
  const problem = h("p", { class: "field-error", role: "alert", hidden: true });
  const list = h("ul", { class: "tickets", "aria-label": "Events" });
  const count = h("p", { class: "result-count", "aria-live": "polite" });

  const input = (key, label, attrs = {}) => h("div", { class: "field" },
    h("label", { for: ids[key] }, label),
    h("input", { id: ids[key], name: key, value: values[key], ...attrs }));

  const citySelect = h("select", { id: ids.city, name: "city" },
    h("option", { value: "" }, "All cities"),
    cities.map((c) => h("option", { value: c, selected: c === values.city }, c)));
  const sortSelect = h("select", { id: ids.sort, name: "sort" },
    SORTS.map(([key, label]) => h("option", { value: key, selected: key === values.sort }, label)));

  const form = h("form", { class: "filters", role: "search", "aria-label": "Find events", novalidate: true },
    input("q", "Search", { type: "search", placeholder: "Title, city or venue", autocomplete: "off" }),
    h("div", { class: "field" }, h("label", { for: ids.city }, "City"), citySelect),
    input("from", "From date", { type: "date" }),
    input("to", "To date", { type: "date" }),
    input("max", "Highest price (₦)", { type: "text", inputmode: "decimal", placeholder: "No limit", autocomplete: "off" }),
    h("div", { class: "field" }, h("label", { for: ids.sort }, "Sort by"), sortSelect),
    h("div", { class: "filter-actions" },
      h("button", { type: "button", class: "button button-quiet", onclick: clearAll }, "Clear filters")));

  function currentValues() {
    const data = new FormData(form);
    return Object.fromEntries(["q", "city", "from", "to", "max", "sort"].map((k) => [k, String(data.get(k) ?? "")]));
  }

  let latest = 0;
  async function refresh(speak) {
    const now = currentValues();
    // Keep the address in step with the boxes, without adding a history step per keystroke.
    const shown = new URLSearchParams();
    for (const [k, v] of Object.entries(now)) if (v && !(k === "sort" && v === "date-asc")) shown.set(k, v);
    history.replaceState(null, "", "#/" + (shown.size ? "?" + shown : ""));

    const built = toApiQuery(now);
    problem.hidden = !built.problem;
    problem.textContent = built.problem ?? "";
    if (built.problem) return;

    const token = ++latest;
    list.setAttribute("aria-busy", "true");
    try {
      const { events } = await listEvents(built.query);
      if (token !== latest) return;
      list.replaceChildren(...events.map(ticketCard));
      const message = events.length === 0
        ? "No events match. Remove a filter to see more."
        : `${events.length} ${events.length === 1 ? "event" : "events"} found.`;
      count.textContent = message;
      count.classList.toggle("is-empty", events.length === 0);
    } catch (error) {
      if (token !== latest) return;
      list.replaceChildren();
      count.textContent = error instanceof ApiError ? error.message : "Events could not load. Try again.";
    } finally {
      if (token === latest) list.removeAttribute("aria-busy");
    }
  }

  function clearAll() {
    form.reset();
    for (const el of form.elements) {
      if (el.name === "sort") el.value = "date-asc";
      else if (el.name) el.value = "";
    }
    refresh();
    form.elements.q.focus();
  }

  form.addEventListener("input", () => refresh());
  form.addEventListener("submit", (e) => { e.preventDefault(); refresh(); });

  const next = nextBigNight(everything, Date.now());
  const featured = next ? featuredBox(next) : null;
  const element = h("section", { class: "page" },
    featured?.element,
    h("div", { class: "page-head" },
      h("h1", { text: "Find your next event" }),
      h("p", { class: "lede", text: "Pick a night out, choose your tickets and pay in a minute." })),
    form, problem, count, list);

  await refresh();
  return { title: "Events", element, cleanup: () => featured?.stop() };
}
