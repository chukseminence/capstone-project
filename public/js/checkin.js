// The door page (checkin.html): staff paste or scan a ticket's code and see ADMIT or STOP.
// Everything the server decides (is it real? this event? paid? used already?) happens on the server, in the check-in call of api.js.
// This page only shows the answer in big, plain words.
import { checkIn, listEvents, listMyEvents, currentUser, ApiError } from "./api.js";
import { makeReader, cameraAllowed } from "./scan.js";
import { h, uniqueId } from "./dom.js";
import { describeScan, cleanCode } from "./door.js";
import { describeDate } from "./money.js";

const main = document.getElementById("main");
const announcer = document.getElementById("announcer");

function announce(text) {
  announcer.textContent = "";
  setTimeout(() => { announcer.textContent = text; }, 30);
}

function message(title, text, link) {
  main.replaceChildren(h("section", { class: "page narrow" },
    h("h1", { text: title }),
    h("p", { text }),
    link ? h("p", { class: "actions" }, h("a", { class: "button button-primary", href: link[0] }, link[1])) : null));
  const heading = main.querySelector("h1");
  heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}

// An organizer's tab bar on this page: Events, Sell, Door, Me (the page itself starts with the door staff's three tabs).
function addSellTab() {
  const bar = document.querySelector(".tabbar");
  const door = bar?.querySelector('a[href="/checkin.html"]');
  if (!bar || !door || bar.querySelector('a[href="/#/organizer"]')) return;
  const sell = door.cloneNode(false);
  sell.setAttribute("href", "/#/organizer");
  sell.classList.remove("is-active");
  sell.removeAttribute("aria-current");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: "24", height: "24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) svg.setAttribute(k, v);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M12 5v14M5 12h14");
  svg.append(path);
  sell.append(svg, h("span", { text: "Sell" }));
  bar.insertBefore(sell, door);
}

async function start() {
  const user = currentUser();
  if (!user) return message("Log in to check people in", "Door check-in is for organizers and door staff. Log in first.", ["/#/login", "Log in"]);
  if (user.role === "attendee") return message("This page is for organizers and door staff", "An attendee account cannot check people in. Your own tickets are under My tickets.", ["/#/tickets", "My tickets"]);
  if (user.role === "organizer") addSellTab();

  let events;
  try {
    // Door staff work at any published event. An organizer checks people in to their own published events.
    events = user.role === "organizer"
      ? (await listMyEvents()).events.filter((e) => e.status === "published")
      : (await listEvents({ sort: "date", order: "asc" })).events;
  } catch (err) {
    return message("Cannot load the events", err instanceof ApiError ? err.message : "Try again in a moment.", ["/checkin.html", "Try again"]);
  }
  if (events.length === 0) {
    return user.role === "organizer"
      ? message("No published events yet", "Publish an event first. Then you can check its ticket holders in here.", ["/#/organizer", "My events"])
      : message("No events yet", "There are no published events to check people in to.", ["/", "See all events"]);
  }

  const ids = { event: uniqueId("event"), code: uniqueId("code") };
  const eventSelect = h("select", { id: ids.event, name: "event" },
    events.map((e) => h("option", { value: e.id }, `${e.title}, ${describeDate(e.date).long}`)));
  const codeInput = h("input", { id: ids.code, name: "code", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "BK-000012.1780000000.…" });
  const submit = h("button", { type: "submit", class: "button button-primary" }, "Check in");
  const result = h("div", { class: "scan-result", role: "status", "aria-live": "assertive", hidden: true });
  const form = h("form", { class: "door-form", novalidate: true, "aria-label": "Check in a ticket" },
    h("div", { class: "field" }, h("label", { for: ids.event }, "Event you are working at"), eventSelect),
    h("div", { class: "field" }, h("label", { for: ids.code }, "Ticket code (paste it, or scan the QR code)"), codeInput),
    h("div", { class: "actions" }, submit));

  function show(outcome) {
    const words = describeScan(outcome);
    result.className = `scan-result scan-${words.tone}`;
    result.replaceChildren(h("p", { class: "scan-headline", text: words.headline }), h("p", { class: "scan-detail", text: words.detail }));
    result.hidden = false;
    announce(`${words.headline}. ${words.detail}`);
  }

  let busy = false;
  async function submitCode(raw) {
    if (busy) return;
    const code = cleanCode(raw);
    if (code === "") { codeInput.focus(); return show({ error: new ApiError("VALIDATION", "Paste or scan a ticket code first.") }); }
    busy = true;
    submit.disabled = true;
    try {
      const { checkin } = await checkIn({ code, eventId: eventSelect.value });
      show({ checkin });
    } catch (err) {
      show({ error: err instanceof ApiError ? err : new ApiError("SERVER", "Something went wrong.") });
    } finally {
      busy = false;
      submit.disabled = false;
      codeInput.value = "";
      codeInput.focus(); // ready for the next person in the queue
    }
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); submitCode(codeInput.value); });

  // The camera works in Chrome (Android) and in Safari (iPhone, using the small jsQR reader). It needs a secure (https) page or localhost.
  let stopCamera = () => {};
  const camera = h("div", { class: "camera", hidden: true });
  const cameraButton = h("button", { type: "button", class: "button", onclick: toggleCamera }, "Scan with the camera");

  async function toggleCamera() {
    if (!camera.hidden) return stopCamera();
    if (!cameraAllowed()) {
      return show({ error: new ApiError("CAMERA", "This browser only starts the camera on secure (https) pages or localhost. Open the site over https, or paste the code instead.") });
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    } catch {
      return show({ error: new ApiError("CAMERA", "The camera could not start. Allow the camera for this site, or paste the code instead.") });
    }
    const video = h("video", { class: "camera-video", playsinline: true, muted: true, "aria-label": "Camera view for scanning a ticket" });
    video.setAttribute("playsinline", "");
    video.muted = true;
    video.srcObject = stream;
    camera.replaceChildren(video);
    camera.hidden = false;
    cameraButton.textContent = "Stop the camera";
    await video.play().catch(() => {});
    let read;
    try { read = await makeReader(); } catch { stream.getTracks().forEach((t) => t.stop()); camera.hidden = true; cameraButton.textContent = "Scan with the camera"; return show({ error: new ApiError("CAMERA", "The scanner could not load. Paste the code instead.") }); }
    let running = true;
    let pauseUntil = 0;
    stopCamera = () => {
      running = false;
      stream.getTracks().forEach((t) => t.stop());
      camera.hidden = true;
      camera.replaceChildren();
      cameraButton.textContent = "Scan with the camera";
      stopCamera = () => {};
    };
    (async function loop() {
      while (running) {
        await new Promise((r) => setTimeout(r, 200));
        if (!running || Date.now() < pauseUntil || busy) continue;
        try {
          const text = await read(video);
          if (text) {
            pauseUntil = Date.now() + 2500; // do not scan the same code twice in a row
            await submitCode(text);
          }
        } catch { /* a frame that cannot be read: try the next one */ }
      }
    })();
  }
  window.addEventListener("pagehide", () => stopCamera());

  main.replaceChildren(h("section", { class: "page narrow door" },
    h("h1", { text: "Door check-in" }),
    h("p", { class: "lede", text: `Logged in as ${user.name}. Choose the event, then scan or paste each ticket.` }),
    form, cameraButton, result, camera,
    h("p", { class: "muted", text: "Green means let them in. Red means stop. A ticket works once." })));
  const heading = main.querySelector("h1");
  heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
  document.title = "Door check-in | Stub";
}

start();
