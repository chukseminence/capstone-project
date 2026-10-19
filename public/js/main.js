// The router. The address after the # decides which page to show:
//   #/                      browse events
//   #/event/EV-000001       one event
//   #/checkout/BK-000001    pay for a booking
//   #/done/BK-000001        the confirmation
//   #/login   #/signup      get an account
//   #/tickets               my tickets          (attendees)
//   #/organizer             my events dashboard (organizers)
//   #/me                    my account (anyone logged in)
// On a phone the four tabs at the bottom (Events, Tickets, Sell, Me) are the menu. Staff see Events, Door, Me.
// Using # means the server needs no extra rules: it always just serves index.html.
import { ApiError, currentUser, onSessionChange, logout } from "./api.js";
import { h } from "./dom.js";
import { browseView } from "./views/browse.js";
import { eventView } from "./views/event.js";
import { checkoutView } from "./views/checkout.js";
import { doneView } from "./views/done.js";
import { messageView } from "./views/message.js";
import { authView } from "./views/auth.js";
import { ticketsView } from "./views/tickets.js";
import { organizerView } from "./views/organizer.js";
import { meView } from "./views/me.js";

const main = document.getElementById("main");
const nav = document.getElementById("site-nav");
const tabbar = document.getElementById("tabbar");
const announcer = document.getElementById("announcer");
let cleanup = null;
let renderToken = 0;

function announce(text) {
  // Clearing first makes screen readers speak the same sentence again if needed.
  announcer.textContent = "";
  setTimeout(() => { announcer.textContent = text; }, 30);
}

// requires: who may open this page. "attendee", "organizer", "user" (anyone logged in) or null (everyone).
function parseRoute() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, queryText = ""] = raw.split("?");
  const query = new URLSearchParams(queryText);
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { view: browseView, args: { query }, requires: null };
  const id = parts[1] ? decodeURIComponent(parts[1]) : "";
  const two = parts.length === 2 && id;
  if (parts[0] === "event" && two) return { view: eventView, args: { id }, requires: null };
  if (parts[0] === "checkout" && two) return { view: checkoutView, args: { ref: id }, requires: "attendee" };
  if (parts[0] === "done" && two) return { view: doneView, args: { ref: id }, requires: "attendee" };
  if (parts[0] === "login" && parts.length === 1) return { view: authView, args: { mode: "login", query }, requires: null };
  if (parts[0] === "signup" && parts.length === 1) return { view: authView, args: { mode: "signup", query }, requires: null };
  if (parts[0] === "tickets" && parts.length === 1) return { view: ticketsView, args: {}, requires: "attendee" };
  if (parts[0] === "organizer" && parts.length === 1) return { view: organizerView, args: {}, requires: "organizer" };
  if (parts[0] === "me" && parts.length === 1) return { view: meView, args: { announce: undefined }, requires: "user" };
  return { view: messageView, args: { kind: "notfound" }, requires: null };
}

// Which tab is lit for this address.
function activeTab() {
  const first = (location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[0]) || "";
  if (first === "" || first === "event") return "events";
  if (first === "tickets" || first === "checkout" || first === "done") return "tickets";
  if (first === "organizer") return "sell";
  if (first === "me" || first === "login" || first === "signup") return "me";
  return "";
}

// The four tabs at the bottom. The person sees them on a phone; wide screens use the top links instead.
const ICONS = {
  events: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  tickets: "M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4z",
  sell: "M12 5v14M5 12h14",
  me: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  door: "M5 3h10v18H5zM15 7h4v14h-4zM11 12h.01",
};
function tabIcon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: "24", height: "24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) svg.setAttribute(k, v);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICONS[name]);
  svg.append(path);
  return svg;
}
function renderTabs() {
  const user = currentUser();
  const tabs = user?.role === "staff"
    ? [["events", "Events", "#/", "events"], ["door", "Door", "/checkin.html", "door"], ["me", "Me", "#/me", "me"]]
    : user?.role === "organizer"
      ? [["events", "Events", "#/", "events"], ["sell", "Sell", "#/organizer", "sell"], ["door", "Door", "/checkin.html", "door"], ["me", "Me", "#/me", "me"]]
      : [["events", "Events", "#/", "events"], ["tickets", "Tickets", "#/tickets", "tickets"], ["sell", "Sell", "#/organizer", "sell"], ["me", "Me", user ? "#/me" : "#/login", "me"]];
  const here = activeTab();
  tabbar.replaceChildren(...tabs.map(([key, label, href, icon]) =>
    h("a", { class: "tab" + (key === here ? " is-active" : ""), href, "aria-current": key === here ? "page" : null }, tabIcon(icon), h("span", { text: label }))));
}

function renderNav() {
  const user = currentUser();
  const links = [h("a", { href: "#/" }, "All events")];
  if (!user) {
    links.push(h("a", { href: "#/login" }, "Log in"), h("a", { href: "#/signup" }, "Sign up"));
  } else {
    if (user.role === "attendee") links.push(h("a", { href: "#/tickets" }, "My tickets"));
    if (user.role === "organizer") links.push(h("a", { href: "#/organizer" }, "My events"), h("a", { href: "/checkin.html" }, "Door"));
    if (user.role === "staff") links.push(h("a", { href: "/checkin.html" }, "Door"));
    links.push(
      h("span", { class: "nav-user", text: user.name }),
      h("button", { type: "button", class: "nav-button", onclick: () => { logout(); location.hash = "#/"; announce("You are logged out."); } }, "Log out")
    );
  }
  nav.replaceChildren(...links);
  renderTabs();
}

async function render() {
  const token = ++renderToken;
  if (cleanup) { cleanup(); cleanup = null; }
  const route = parseRoute();
  const user = currentUser();

  // The page checks are only for convenience. The SERVER decides who may do what.
  if (route.requires && !user) {
    location.replace("#/login?next=" + encodeURIComponent(location.hash || "#/"));
    return;
  }
  const allowed = route.requires === null || route.requires === "user" || (user && user.role === route.requires);
  let page;
  if (!allowed) {
    page = await messageView({ kind: "forbidden", role: route.requires });
  } else {
    // A loading message, so the person never stares at an old page or a blank one.
    main.replaceChildren(h("p", { class: "notice", role: "status", text: "Loading…" }));
    try {
      page = await route.view({ ...route.args, announce });
    } catch (error) {
      if (token !== renderToken) return;
      if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
        location.replace("#/login?next=" + encodeURIComponent(location.hash || "#/"));
        return;
      }
      const kind = !(error instanceof ApiError) ? "error"
        : error.code === "NOT_FOUND" ? "notfound"
        : error.code === "FORBIDDEN" ? "forbidden"
        : error.code === "NETWORK" ? "network" : "error";
      page = await messageView({ kind, detail: error instanceof ApiError ? error.message : "", onRetry: render });
    }
  }
  if (token !== renderToken) return; // the person already moved on to another page
  main.replaceChildren(page.element);
  cleanup = page.cleanup ?? null;
  document.title = `${page.title} | Stub`;
  renderTabs();
  // Keyboard and screen-reader users start at the top of the new page.
  const heading = main.querySelector("h1");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
  window.scrollTo(0, 0);
}

// If the login stops working in the middle of a page (it expired), the nav changes and the page asks to log in again.
onSessionChange(renderNav);
renderNav();
window.addEventListener("hashchange", render);
render();
