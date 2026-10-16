// Le serveur de la vue web de la boucle : la vue, les tickets, le fil de la session en cours et la dernière relecture,
// en lecture seule. Il n'accepte que les requêtes adressées à l'interface locale, et aucun chemin venu d'une requête
// n'atteint le disque sans avoir été reconnu : un ticket doit être dans la liste, un fichier public dans son dossier.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildView } from "../loop-view.mjs";
import { emptyFeed, feedAgents, feedSince, CODEX_AGENT } from "../loop-view/feed.mjs";
import { ORCHESTRATOR } from "../loop-view/session-state.mjs";
import { createReader } from "../watch-loop/reader.mjs";
import { createFeedReader } from "./feed-reader.mjs";

const PUBLIC_DIR = fileURLToPath(new URL("./public/", import.meta.url));
// Plusieurs routes lues dans la même seconde partagent une seule lecture du disque.
const VIEW_TTL_MS = 500;
const HISTORY_SIZE = 100;
const JOURNAL_SIZE = 40;
const SAFE_TICKET_ID = /^[A-Za-z0-9_-]+$/;
const PUBLIC_FILE = /^\/([a-z][\w-]*\.(?:js|css))$/;
const LOCAL_HOST = /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/;
const REVIEW_FILE = /^relecture-(\d+)\.md$/;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "cache-control": "no-store",
  "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com",
};

/** Ce que le client montre d'un ticket ; le chemin du fichier reste sur le serveur. */
const summary = (ticket) => ({
  id: ticket.id, titre: ticket.titre, statut: ticket.statut, bloquePar: ticket.bloquePar, niveau: ticket.niveau,
  harnais: ticket.harnais, decisionAttendue: ticket.decisionAttendue,
});

/** Les tickets intégrés, du plus récent au plus ancien. */
function integrations(events) {
  return events.filter((event) => event.phase === "integre" && typeof event.ticket === "string").slice(-HISTORY_SIZE).reverse()
    .map((event) => ({ id: event.ticket, at: event.at, commit: event.commit ?? null, model: event.modele ?? null, attempts: event.tentatives ?? 1 }));
}

/** Les derniers événements de la boucle, sans la charge de la machine : le fil du robot quand la session n'en a pas. */
function journal(events) {
  return events.slice(-JOURNAL_SIZE).map((event) => ({
    at: event.at, phase: event.phase, ticket: event.ticket ?? null, moteur: event.moteur ?? null, modele: event.modele ?? null,
    attempt: event.attempt ?? null, duree_s: event.duree_s ?? null, relectures: event.relectures ?? null, commit: event.commit ?? null,
    observations: event.observations ?? null, raison: event.raison ?? null,
  }));
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function feedPage(current, query) {
  if (!current) return { key: null, engine: null, agents: [], agent: null, from: 0, total: 0, entries: [] };
  const fallback = current.engine === "codex" ? CODEX_AGENT : ORCHESTRATOR;
  const agent = query.get("agent") || fallback;
  const since = Number.parseInt(query.get("since") ?? "0", 10);
  const page = feedSince(current.feed, agent, Number.isFinite(since) ? since : 0);
  return { key: current.key, engine: current.engine, agents: feedAgents(current.feed), agent, ...page };
}

function ticketText(root, tickets, id) {
  const ticket = tickets.find((entry) => entry.id === id);
  if (!ticket) return null;
  const text = readIfExists(path.join(root, ticket.file));
  return text === null ? null : { id, text };
}

/** Le dernier rapport de relecture d'un ticket de la liste ; un ticket pas encore relu n'en a pas, ce n'est pas une erreur. */
function latestReview(root, tickets, id) {
  if (!SAFE_TICKET_ID.test(String(id)) || !tickets.some((ticket) => ticket.id === id)) return null;
  const dir = path.join(root, ".harness-state", "tickets", id);
  const ranks = fs.existsSync(dir)
    ? fs.readdirSync(dir).map((name) => REVIEW_FILE.exec(name)).filter(Boolean).map((match) => Number(match[1]))
    : [];
  if (!ranks.length) return { id, rank: null, text: null };
  const rank = Math.max(...ranks);
  return { id, rank, text: fs.readFileSync(path.join(dir, `relecture-${rank}.md`), "utf8") };
}

function send(response, status, type, body) {
  response.writeHead(status, { ...SECURITY_HEADERS, "content-type": type });
  response.end(body);
}
const sendJson = (response, status, value) => send(response, status, "application/json; charset=utf-8", JSON.stringify(value));

function sendPublic(response, publicDir, pathname) {
  const name = pathname === "/" ? "index.html" : PUBLIC_FILE.exec(pathname)?.[1];
  const text = name ? readIfExists(path.join(publicDir, name)) : null;
  if (text === null) return sendJson(response, 404, { error: "introuvable" });
  send(response, 200, TYPES[path.extname(name)], text);
}

/**
 * Le serveur de la vue de `root`, pas encore à l'écoute. `reader`, `feeds` et `now` se remplacent pour les tests.
 * L'appelant le fait écouter sur 127.0.0.1.
 */
export function createLoopWeb(root, { reader = createReader(root), feeds = createFeedReader(root), now = Date.now, publicDir = PUBLIC_DIR } = {}) {
  let cached = null;
  const current = () => {
    const at = now();
    if (!cached || at - cached.at >= VIEW_TTL_MS) {
      const read = reader.read(at);
      cached = { at, read, view: buildView(read) };
    }
    return cached;
  };
  const routes = {
    "/api/state": () => {
      const { read, view } = current();
      const agents = feedAgents(feeds.read(view.ticket)?.feed ?? emptyFeed());
      const tickets = read.tickets.map(summary);
      return { project: path.basename(root), view, agents, tickets, history: integrations(read.events), journal: journal(read.events) };
    },
    "/api/feed": (query) => feedPage(feeds.read(current().view.ticket), query),
    "/api/ticket": (query) => ticketText(root, current().read.tickets, query.get("id")),
    "/api/review": (query) => latestReview(root, current().read.tickets, query.get("id")),
  };
  return http.createServer((request, response) => {
    try {
      if (!LOCAL_HOST.test(request.headers.host ?? "")) return sendJson(response, 403, { error: "hôte refusé" });
      if (request.method !== "GET" && request.method !== "HEAD") return sendJson(response, 405, { error: "lecture seule" });
      const url = new URL(request.url, "http://127.0.0.1");
      const route = Object.hasOwn(routes, url.pathname) ? routes[url.pathname] : null;
      if (!route) return sendPublic(response, publicDir, url.pathname);
      const body = route(url.searchParams);
      if (body === null) return sendJson(response, 404, { error: "introuvable" });
      sendJson(response, 200, body);
    } catch (error) {
      console.error(error);
      sendJson(response, 500, { error: "erreur interne" });
    }
  });
}
