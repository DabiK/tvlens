// L'application : elle sonde le serveur chaque seconde, comme le moniteur du terminal, et fait suivre la vue à la scène,
// au terminal, aux fenêtres et au HUD. Les bannières naissent des transitions entre deux vues, jamais de la première.
import { h, fill } from "./dom.js";
import { chestList, decisions, queueList, stepLabel, transitions } from "./model.js";
import { createOverlay } from "./overlay.js";
import { Panels } from "./panels.js";
import { Scene } from "./scene.js";
import { Terminal } from "./term.js";

const POLL_MS = 1000;
const BANNER_MS = 2900;
const $ = (selector) => document.querySelector(selector);
const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
const app = { state: null, offline: false, banners: [], flashing: false };

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

const panels = new Panels({
  boardModal: $("#boardModal"), board: $("#board"), filterSeg: $("#filterSeg"), searchInput: $("#search"), closeBoard: $("#closeBoard"),
  count: $("#countBoard"), sheet: $("#sheet"), sheetBody: $("#sheetBody"),
}, { fetchJson });
const terminal = new Terminal({ cast: $("#cast"), head: $("#termHead"), body: $("#termBody"), jump: $("#jump") }, { fetchJson });
const overlay = createOverlay({ accent, selected: () => terminal.role, asks: () => (app.state ? decisions(app.state.tickets).length : 0) });
const scene = new Scene($("#scene"), { accent, overlay, onHit });

function onHit(hit) {
  const { view, tickets, history } = app.state;
  if (hit.kind === "actor") terminal.select(hit.role);
  if (hit.kind === "chef") panels.openBoard("decision");
  if (hit.kind === "board") panels.openBoard();
  if (hit.kind === "queue") panels.openList(queueList(view, tickets));
  if (hit.kind === "chest") panels.openList(chestList(view, history, tickets));
  if (hit.kind === "ticket" && view.ticket) panels.openTicket(view.ticket.id);
}

function flash({ title, sub, bad }) {
  const banner = $("#banner");
  banner.className = bad ? "banner bad" : "banner";
  fill(banner, h("h2", {}, title), sub ? h("p", {}, sub) : null);
  void banner.offsetWidth;
  banner.classList.add("show");
}

/** Une bannière à la fois ; la boucle arrêtée garde la sienne. */
function nextBanner() {
  if (!app.banners.length || !app.state?.view.alive) {
    app.flashing = false;
    return;
  }
  app.flashing = true;
  flash(app.banners.shift());
  setTimeout(nextBanner, BANNER_MS);
}

function stoppedBanner(view) {
  const banner = $("#banner");
  if (!view.alive) {
    banner.className = "banner bad stay";
    fill(banner, h("h2", {}, "PARTIE TERMINÉE"), h("p", {}, "LA BOUCLE EST ARRÊTÉE"), h("p", { class: "blink" }, "CONTINUER ? RELANCE LA BOUCLE"));
  } else if (banner.classList.contains("stay")) {
    banner.className = "banner";
    fill(banner);
  }
}

function renderHud() {
  const { view, tickets, project } = app.state;
  $("#project").textContent = project;
  const live = $("#live");
  let mark = view.alive ? "EN DIRECT" : "ARRÊTÉE";
  if (app.offline) mark = "HORS LIGNE";
  live.className = view.alive && !app.offline ? "live" : "live off";
  fill(live, h("b"), mark);
  const ticket = view.ticket;
  fill($("#hudStage"), h("small", {}, "QUÊTE"), h("strong", {}, ticket?.id ?? "—"), ticket ? h("span", {}, ticket.titre) : null);
  $("#hudStage").disabled = !ticket;
  const score = tickets.filter((entry) => entry.statut === "termine").length;
  fill($("#hudScore"), h("small", {}, "SCORE"), h("strong", {}, String(score).padStart(4, "0")));
  $("#hudQuestsCount").textContent = String(tickets.length);
  fill($("#steps"), (view.timeline ?? []).map((step) => h("span", { class: step.state }, stepLabel(step.label))));
  stoppedBanner(view);
}

function apply(next) {
  const moments = transitions(app.state?.view ?? null, next.view);
  app.state = next;
  app.offline = false;
  scene.show(next.view, { project: next.project, queued: next.view.remaining?.tickets?.length ?? 0 });
  terminal.update(next);
  panels.update(next);
  renderHud();
  if (moments.some((moment) => moment.title === "QUÊTE ACCOMPLIE")) scene.celebrate();
  app.banners.push(...moments);
  if (!app.flashing) nextBanner();
}

async function tick() {
  if (!document.hidden) {
    try {
      apply(await fetchJson("/api/state"));
      await terminal.poll();
    } catch (error) {
      // Une seule trace au passage hors ligne, pas une par seconde tant que le serveur ne répond pas.
      if (!app.offline) console.error(error);
      app.offline = true;
      if (app.state) renderHud();
    }
  }
  setTimeout(tick, POLL_MS);
}

$("#hudStage").addEventListener("click", () => {
  if (app.state?.view.ticket) panels.openTicket(app.state.view.ticket.id);
});
$("#hudScore").addEventListener("click", () => {
  if (app.state) panels.openList(chestList(app.state.view, app.state.history, app.state.tickets));
});
$("#hudQuests").addEventListener("click", () => panels.openBoard());

(document.fonts?.ready ?? Promise.resolve()).then(tick);
