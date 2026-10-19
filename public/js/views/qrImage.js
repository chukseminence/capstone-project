import { getTicket, ApiError } from "../api.js";
import { h } from "../dom.js";
import { makeQr, qrPath, QUIET_ZONE } from "../qr.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Draws the QR code as an <svg> (a picture made of one path). Black on white with the light margin readers need,
// whatever the page colours are. No inline style: only attributes, so the strict security policy is happy.
export function qrSvg(code, label) {
  const qr = makeQr(code);
  const box = qr.size + QUIET_ZONE * 2;
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries({ viewBox: `0 0 ${box} ${box}`, class: "qr", role: "img", "aria-label": label, "shape-rendering": "crispEdges" })) svg.setAttribute(k, v);
  const back = document.createElementNS(SVG_NS, "rect");
  for (const [k, v] of Object.entries({ width: box, height: box, fill: "#ffffff" })) back.setAttribute(k, v);
  const dark = document.createElementNS(SVG_NS, "path");
  dark.setAttribute("d", qrPath(qr, QUIET_ZONE));
  dark.setAttribute("fill", "#000000");
  svg.append(back, dark);
  return svg;
}

// A box that fills itself with the ticket's QR code once the server has signed it.
// `cache` (a Map, optional) keeps codes so a page that refreshes does not ask again.
export function qrBlock(ref, { cache } = {}) {
  const box = h("div", { class: "qr-box" }, h("p", { class: "muted", text: "Getting your QR code…" }));
  const show = (code) => box.replaceChildren(
    qrSvg(code, `QR code for booking ${ref}. Show it at the door.`),
    h("p", { class: "qr-hint", text: "Show this at the door. It works once." }),
    h("details", { class: "qr-text" },
      h("summary", { text: "Show the code as text" }),
      h("p", { class: "muted", text: "For staff who type or paste the code instead of scanning it." }),
      h("code", { class: "qr-code", text: code })));
  if (cache?.has(ref)) show(cache.get(ref));
  else {
    getTicket(ref).then(
      ({ ticket }) => { cache?.set(ref, ticket.code); show(ticket.code); },
      (err) => box.replaceChildren(h("p", { class: "field-error", role: "alert", text: err instanceof ApiError ? `No QR code yet: ${err.message}` : "The QR code could not load. Reload the page." })));
  }
  return box;
}
