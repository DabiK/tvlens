// Les règles de la vue, sans DOM ni canvas : qui travaille, où se tiennent les agents, ce que montrent le tableau des
// quêtes, la file, le coffre et le terminal, et quels moments méritent une bannière. Tout part de la vue du serveur.

/** Le rôle qui travaille pendant chaque phase de la boucle (`buildView().phase.key`). */
export const PHASE_ROLE = {
  exploration: "explorateur", implementation: "implementeur", correction: "implementeur", record: "implementeur",
  check: "gardien", verdict: "gardien", gates: "gardien", refused: "gardien",
  review: "relecteur", retro: "retro", harmonisation: "retro",
};
/** Les agents qu'on peut suivre dans le terminal, dans l'ordre de leur entrée en scène. */
export const CAST = ["explorateur", "implementeur", "relecteur", "retro", "gardien"];
export const HUB = { x: 4.25, y: 7.0 };

export const ROLES = {
  explorateur: {
    label: "Explorateur", short: "EXPLO", spot: { x: 2.35, y: 1.05 }, route: [[4.25, 1.05], [2.35, 1.05]], lounge: { x: 0.9, y: 7.7 },
    look: { top: "#7d7254", pants: "#2b2c36", skin: "#c68642", hair: "#3b2416", accessory: "hat" },
  },
  implementeur: {
    label: "Implémenteur", short: "IMPL", spot: { x: 5.85, y: 1.05 }, route: [[4.25, 1.05], [5.85, 1.05]], lounge: { x: 2.3, y: 8.5 },
    look: { top: "#3a3d4c", pants: "#22232c", skin: "#8d5524", hair: "#120c08", accessory: "headset" },
  },
  relecteur: {
    label: "Relecteur", short: "REVUE", spot: { x: 2.35, y: 4.45 }, route: [[4.25, 4.45], [2.35, 4.45]], lounge: { x: 2.4, y: 7.4 },
    look: { top: "#cfd0d6", pants: "#2b2c36", skin: "#f1c27d", hair: "#8a4a2a", accessory: "glasses" },
  },
  retro: {
    label: "Rétro", short: "RÉTRO", spot: { x: 7.45, y: 4.8 }, route: [[4.25, 3.4], [7.45, 3.4], [7.45, 4.8]], lounge: { x: 3.7, y: 8.2 },
    look: { top: "#a8863a", pants: "#2b2c36", skin: "#e0ac69", hair: "#d8d0c0", accessory: "beret" },
  },
  gardien: { label: "La boucle", short: "BOUCLE", spot: { x: 10.45, y: 2.15 }, robot: true },
};
export const CHEF = { spot: { x: 10.3, y: 6.55 }, look: { top: "#121214", pants: "#34343a", skin: "#6e3b22", cornrows: true, goatee: true, hood: true } };

export const activeRole = (view) => (view?.alive ? PHASE_ROLE[view.phase?.key] ?? null : null);

/** Au poste quand sa phase tourne, au salon sinon ; le robot ne quitte pas ses serveurs. */
export const placeOf = (role, view) => (ROLES[role].robot || activeRole(view) === role ? "desk" : "lounge");

function routeOf(role, place) {
  const r = ROLES[role];
  if (place === "desk") return r.route.map(([x, y]) => ({ x, y }));
  return [{ x: r.lounge.x, y: HUB.y }, { ...r.lounge }];
}

/** Le trajet d'un endroit à l'autre, par l'allée centrale : jamais à travers un bureau. */
export const pathBetween = (role, from, to) => [...routeOf(role, from).reverse().slice(1), { ...HUB }, ...routeOf(role, to)];

export function engineOf(role, view) {
  if (ROLES[role]?.robot) return "machine";
  if (role === "explorateur" || role === "implementeur") return view?.ticket?.moteur === "codex" ? "codex" : "claude";
  return "claude";
}

export function modelName(model) {
  if (!model) return "modèle inconnu";
  const claude = /^claude-(\w+)-(\d+)-(\d+)/.exec(model);
  if (claude) return `${claude[1][0].toUpperCase()}${claude[1].slice(1)} ${claude[2]}.${claude[3]}`;
  if (/^(opus|sonnet|haiku|fable)$/.test(model)) return model[0].toUpperCase() + model.slice(1);
  const gpt = /^gpt-([\d.]+)-?(\w+)?/.exec(model);
  if (!gpt) return model;
  return `GPT-${gpt[1]}${gpt[2] ? ` ${gpt[2][0].toUpperCase()}${gpt[2].slice(1)}` : ""}`;
}

export function roleLabel(role, view) {
  if (role === "retro" && view?.phase?.key === "harmonisation") return "Harmoniseur";
  return ROLES[role].label;
}

const two = (n) => String(n).padStart(2, "0");

/** « 42 s », « 3 min 05 », « 1 h 05 » ; un tiret quand la durée est inconnue. */
export function duration(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${two(seconds % 60)}`;
  return `${Math.floor(minutes / 60)} h ${two(minutes % 60)}`;
}

export function clock(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const date = new Date(ms);
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}

const STEP_SHORT = {
  "Exploration": "EXPLO", "Implémentation": "IMPL", "Correction": "CORRECTION", "Contrôle complet": "CHECK", "Verdict": "VERDICT",
  "Relecture": "REVUE", "Contrôles de la boucle": "BOUCLE", "Rétrospective": "RÉTRO", "Harmonisation": "HARMO", "Démarrage": "DÉPART",
  "Boucle arrêtée": "ARRÊT", "Reprise": "REPRISE", "Enregistrement de l'état relu": "ÉTAT RELU",
};

/** Le libellé court d'une étape de la frise : « Relecture 2 » devient « REVUE 2 ». */
export function stepLabel(label) {
  const [, name, rank] = /^(.*?)(?: (\d+))?$/.exec(String(label));
  const short = STEP_SHORT[name] ?? name.toUpperCase();
  return rank ? `${short} ${rank}` : short;
}

// ——— Quêtes ———

export const decisions = (tickets) => tickets.filter((ticket) => ticket.statut === "a-faire" && ticket.decisionAttendue);
const STATUS_COLUMN = { "a-faire": "todo", "en-cours": "doing", bloque: "blocked", termine: "done" };
const columnOf = (ticket) => (ticket.statut === "a-faire" && ticket.decisionAttendue ? "decision" : STATUS_COLUMN[ticket.statut] ?? "todo");
const isReady = (ticket, done) => ticket.statut === "a-faire" && !ticket.decisionAttendue && ticket.bloquePar.every((id) => done.has(id));
const COLUMNS = [["decision", "TA DÉCISION"], ["todo", "À FAIRE"], ["doing", "EN COURS"], ["blocked", "BLOQUÉES"], ["done", "TERMINÉES"]];

function cardOf(ticket, done, liveId) {
  const waiting = ticket.statut === "a-faire" && !ticket.decisionAttendue ? ticket.bloquePar.filter((id) => !done.has(id)) : [];
  let mark = "";
  if (ticket.id === liveId) mark = "EN JEU";
  else if (waiting.length) mark = `▣ ${waiting[0]}`;
  else if (isReady(ticket, done)) mark = "PRÊTE";
  return { id: ticket.id, titre: ticket.titre, mark, live: ticket.id === liveId, ask: columnOf(ticket) === "decision", done: ticket.statut === "termine" };
}

/** Les colonnes du tableau ; `filter` vaut "all", "decision" ou "ready". Les terminées vont de la plus récente à la plus ancienne. */
export function boardColumns(tickets, { liveId = null, filter = "all", search = "" } = {}) {
  const done = new Set(tickets.filter((ticket) => ticket.statut === "termine").map((ticket) => ticket.id));
  const query = search.trim().toLowerCase();
  const keep = (ticket) => {
    if (query && !`${ticket.id} ${ticket.titre}`.toLowerCase().includes(query)) return false;
    if (filter === "decision") return columnOf(ticket) === "decision";
    if (filter === "ready") return isReady(ticket, done);
    return true;
  };
  return COLUMNS.map(([key, name]) => {
    const list = tickets.filter((ticket) => keep(ticket) && columnOf(ticket) === key);
    const ordered = key === "done" ? list.reverse() : list;
    return { key, name, ask: key === "decision", cards: ordered.map((ticket) => cardOf(ticket, done, liveId)) };
  });
}

/** La file : les quêtes que la boucle prendra, dans l'ordre, et celles qui attendent une décision. */
export function queueList(view, tickets) {
  const queued = view?.remaining?.tickets ?? [];
  const asks = decisions(tickets);
  const levelOf = (id) => tickets.find((ticket) => ticket.id === id)?.niveau ?? "";
  const plural = queued.length > 1 ? "s" : "";
  const many = asks.length > 1;
  const waiting = `${asks.length} quête${many ? "s" : ""} en attente de ta décision n'y figure${many ? "nt" : ""} pas`;
  const sub = asks.length ? `${waiting} : ${asks.map((t) => t.id).join(", ")}.` : "Dans l'ordre où la boucle va les prendre.";
  const rows = queued.map((ticket, index) => ({ id: ticket.id, titre: ticket.titre, tag: index === 0 ? "PROCHAINE" : "", meta: levelOf(ticket.id) }));
  return { kicker: "FILE", title: `${queued.length} quête${plural} en attente`, sub, sections: [{ name: "", rows }] };
}

/** Le coffre : les quêtes accomplies depuis le lancement, puis les précédentes. */
export function chestList(view, history, tickets) {
  const titleOf = (id) => tickets.find((ticket) => ticket.id === id)?.titre ?? "";
  const tonight = [...(view?.finished ?? [])].reverse().filter((entry) => entry.outcome === "integre");
  const shown = new Set(tonight.map((entry) => entry.id));
  const since = view?.launchedAt ?? view?.since ?? 0;
  const day = (ms) => new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  const earlier = history.filter((entry) => !shown.has(entry.id) && Date.parse(entry.at) < since)
    .map((entry) => ({ id: entry.id, titre: titleOf(entry.id), meta: `${day(Date.parse(entry.at))} ${clock(Date.parse(entry.at))}` }));
  const rows = tonight.map((entry) => ({
    id: entry.id, titre: entry.titre || titleOf(entry.id), meta: `${duration(entry.durationMs)} · ${modelName(entry.model)}`,
  }));
  const total = tickets.filter((ticket) => ticket.statut === "termine").length;
  const plural = rows.length > 1 ? "s" : "";
  return {
    kicker: "COFFRE", title: `${rows.length} quête${plural} accomplie${plural} depuis ${clock(since)}`, sub: `${total} en tout depuis le début.`,
    sections: [{ name: "DEPUIS LE LANCEMENT", rows }, { name: "PLUS TÔT", rows: earlier }],
  };
}

// ——— Terminal ———

const NO_LIVE_RETRO = "La rétrospective tourne avec --output-format json : rien n'arrive avant la fin. "
  + "Il faudrait l'écrire en stream-json sur disque, comme la session.";
const NO_LIVE_REVIEW = "En mode Codex, la boucle lance la relecture Claude avec spawnSync : sa sortie reste en mémoire "
  + "jusqu'à la fin, puis devient relecture-N.md, que voici quand elle existe.";

/**
 * Ce que le terminal montre pour un agent : un fil de la session (`agent` du serveur), le journal de la boucle, le
 * dernier rapport de relecture, ou rien quand l'agent n'écrit aucun fil. `agents` : les fils que le serveur connaît.
 */
export function feedSource(role, view, agents = []) {
  if (!view?.ticket) return role === "gardien" ? { kind: "journal" } : { kind: "none", title: "Pas de session", why: "Aucune quête en cours." };
  const codex = view.ticket.moteur === "codex";
  if (role === "gardien") return codex ? { kind: "journal" } : { kind: "feed", agent: "orchestrateur" };
  if (codex && (role === "explorateur" || role === "implementeur")) return { kind: "feed", agent: "codex" };
  if (codex && role === "relecteur") return { kind: "review", why: NO_LIVE_REVIEW };
  const agent = role === "retro" ? "harmoniseur" : role;
  if (agents.includes(agent)) return { kind: "feed", agent };
  if (role === "retro") return { kind: "none", title: "Pas de fil en direct", why: NO_LIVE_RETRO };
  return { kind: "none", title: "Pas encore de fil", why: "Ce sous-agent n'a pas encore été lancé pour cette quête." };
}

// ——— Moments ———

/** Les bannières à montrer entre deux vues : une quête finie, un verdict de relecture, un push refusé. */
export function transitions(previous, next) {
  if (!previous || !next) return [];
  const banners = [];
  const finished = next.finished ?? [];
  if (finished.length > (previous.finished ?? []).length) {
    const last = finished.at(-1);
    const sub = `${last.id} · ${duration(last.durationMs)}`;
    banners.push(last.outcome === "integre" ? { title: "QUÊTE ACCOMPLIE", sub } : { title: "QUÊTE BLOQUÉE", sub, bad: true });
  }
  const verdicts = (view) => (view.cycles ?? []).filter((cycle) => !cycle.pending);
  const reviews = verdicts(next);
  if (next.ticket?.id === previous.ticket?.id && reviews.length > verdicts(previous).length) {
    const cycle = reviews.at(-1);
    const accepted = cycle.verdict === "accepté";
    banners.push({ title: accepted ? "ACCEPTÉ" : "À CORRIGER", sub: `RELECTURE ${cycle.rank}`, bad: !accepted });
  }
  if (next.pushRefused && !previous.pushRefused) banners.push({ title: "PUSH REFUSÉ", sub: "LA BOUCLE S'ARRÊTE", bad: true });
  return banners;
}
