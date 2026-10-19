import { currentUser, logout } from "../api.js";
import { h } from "../dom.js";

const ROLE_WORDS = { attendee: "Attendee: you buy tickets", organizer: "Organizer: you sell tickets", staff: "Door staff: you check people in" };

// The "Me" tab: who is logged in, the shortcuts for their role, and log out.
export async function meView({ announce }) {
  const user = currentUser();
  const shortcuts = [];
  if (user.role === "attendee") shortcuts.push(h("a", { class: "button button-primary", href: "#/tickets" }, "My tickets"));
  if (user.role === "organizer") shortcuts.push(h("a", { class: "button button-primary", href: "#/organizer" }, "My events"), h("a", { class: "button", href: "/checkin.html" }, "Door check-in"));
  if (user.role === "staff") shortcuts.push(h("a", { class: "button button-primary", href: "/checkin.html" }, "Open the door scanner"));
  const element = h("section", { class: "page narrow" },
    h("h1", { text: "Me" }),
    h("article", { class: "manage-card me-card", "aria-label": "Your account" },
      h("p", { class: "me-name", text: user.name }),
      h("p", { class: "muted", text: user.email }),
      h("p", { class: "badge badge-paid", text: ROLE_WORDS[user.role] ?? user.role })),
    h("div", { class: "actions" },
      ...shortcuts,
      h("button", { type: "button", class: "button button-quiet", onclick: () => { logout(); location.hash = "#/"; announce("You are logged out."); } }, "Log out")));
  return { title: "Me", element };
}
