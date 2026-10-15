// Assemblage de la vue : tout ce que l'écran montre, calculé à partir de ce que le lecteur a lu. Fonction pure.
import { codexReviews } from "./codex-reviews.mjs";
import { analyzeEvents, launchEvents } from "./events.mjs";
import { buildTimeline, currentPhase } from "./phase.mjs";
import { estimateEnd, remainingTickets } from "./queue.mjs";
import { reviewCycles } from "./reviews.mjs";

import { RECENT_WINDOW_MS, msOf } from "./constants.mjs";
// Sans ticket intégré depuis le lancement, la durée moyenne se prend sur les derniers tickets intégrés de l'historique.
const HISTORY_SAMPLE = 10;
const TUNING_TITLE = "Harmonisation des consignes";
const RUNNING_STAGES = new Set(["session", "gates", "refused"]);

function ticketOf(current, tickets, now) {
  if (!current) return null;
  const startedAt = msOf(current.startedAt);
  const attemptAt = msOf(current.attemptAt);
  const queued = tickets.find((ticket) => ticket.id === current.id);
  return {
    id: current.id,
    moteur: current.moteur,
    kind: current.kind,
    titre: current.kind === "harmonisation" ? TUNING_TITLE : (queued?.titre ?? ""),
    niveau: current.niveau,
    modele: current.modele,
    effort: current.effort,
    palier: current.palier,
    relecteur: current.relecteur,
    attempt: current.attempt,
    startedAt,
    attemptAt,
    elapsedMs: now - startedAt,
    attemptElapsedMs: now - attemptAt,
  };
}

/** Les relectures enregistrées, et celle qui tourne si le flux en lance une dont le verdict n'est pas encore écrit. */
function cyclesOf({ reviews, reports, stream, running }) {
  const cycles = reviewCycles(reviews, reports).map((cycle) => ({ ...cycle, pending: false }));
  const phase = stream?.phase;
  if (!running || phase?.key !== "review") return cycles;
  if (stream.engine === "codex" && reviews.length >= phase.number) return cycles;
  const last = reviews.at(-1);
  if (last && Date.parse(last.at) >= Date.parse(phase.at)) return cycles;
  return [...cycles, { rank: cycles.length + 1, at: null, verdict: null, model: null, findings: null, pending: true }];
}

/** Le flux compte les relecteurs de la tentative ; le journal compte les cycles de toutes les tentatives. */
function alignReviews(stream, reviews) {
  if (!stream?.firstReviewAt) return stream;
  const offset = reviews.filter((entry) => Date.parse(entry.at) < Date.parse(stream.firstReviewAt)).length;
  if (!offset) return stream;
  const labelOf = (label) => label.replace(/^Relecture (\d+)$/, (_, rank) => `Relecture ${Number(rank) + offset}`);
  const phase = stream.phase?.key === "review" ? { ...stream.phase, label: labelOf(stream.phase.label), number: stream.phase.number + offset } : stream.phase;
  return { ...stream, phase, history: stream.history.map((entry) => ({ ...entry, label: labelOf(entry.label) })) };
}

function estimateOf({ events, finished, remaining, running, ticket, now }) {
  let durations = finished.filter((entry) => entry.outcome === "integre" && entry.durationMs !== null).map((entry) => entry.durationMs);
  let basis = "launch";
  if (!durations.length) {
    const history = analyzeEvents(events).finished.filter((entry) => entry.outcome === "integre" && entry.durationMs !== null);
    durations = history.slice(-HISTORY_SAMPLE).map((entry) => entry.durationMs);
    basis = "history";
  }
  const estimate = estimateEnd({ now, durationsMs: durations, remaining: remaining.tickets.length, elapsedMs: running ? ticket.elapsedMs : null });
  return estimate && { ...estimate, basis };
}

/** La fenêtre de la nuit : depuis le lancement de la boucle quand il est connu, sinon les heures qui précèdent le dernier événement. */
function nightWindow(loop, everything, now) {
  const launched = loop.launchedAt !== null && loop.launchedAt !== undefined;
  const since = launched ? loop.launchedAt : (everything.lastEventAt ?? now) - RECENT_WINDOW_MS;
  return { since, sinceKind: launched ? "launch" : "window", launchedAt: launched ? loop.launchedAt : null };
}

/** Les tickets que la boucle doit encore prendre : ceux de la file, moins ce que son `--max` lui laisse. */
function queueOf({ loop, night, ticket, tickets }) {
  const running = loop.alive && RUNNING_STAGES.has(night.stage);
  const runningId = running && ticket?.kind === "ticket" ? ticket.id : null;
  let slots = null;
  if (Number.isInteger(loop.maxTickets)) slots = loop.maxTickets - night.finished.length - Number(Boolean(runningId));
  const remaining = remainingTickets(tickets, { runningId, limit: slots === null ? null : Math.max(0, slots) });
  return { running, runningId, remaining };
}

/**
 * Tout ce que l'écran montre. `loop` : { alive, pid, launchedAt (ms ou null), maxTickets (le `--max` de la boucle, ou null) }.
 * `stream` est l'état du flux de la session en cours (`foldSession`), `reviews` les lignes de `relectures.jsonl` du ticket
 * et `reports` ses rapports de relecteur par rang.
 */
export function buildView({ now, events, stream, reviews, reports, tickets, loop, verdictStatus = null }) {
  stream = alignReviews(stream, reviews);
  const everything = analyzeEvents(events);
  const span = nightWindow(loop, everything, now);
  // Une boucle lancée après le dernier événement n'a encore rien écrit : ce que disent les événements est celui du lancement d'avant.
  const night = analyzeEvents(launchEvents(events, loop), { since: span.since });
  if (!night.current) {
    stream = null;
    reviews = [];
    reports = {};
  }
  const ticket = ticketOf(night.current, tickets, now);
  if (stream?.engine === "codex") stream = codexReviews(stream, reviews, night.current, verdictStatus);
  const phase = currentPhase({
    stage: night.stage, stageAt: night.stageAt, stream, alive: loop.alive,
    retroPending: night.retroPending, retrospective: loop.retrospective,
  });
  const { running, runningId, remaining } = queueOf({ loop, night, ticket, tickets });
  const finished = night.finished.map((entry) => ({ ...entry, titre: tickets.find((queued) => queued.id === entry.id)?.titre ?? "" }));
  const eta = loop.alive ? estimateOf({ events, finished: night.finished, remaining, running: Boolean(runningId), ticket, now }) : null;
  return {
    now,
    alive: loop.alive,
    pid: loop.pid ?? null,
    ...span,
    ticket,
    phase,
    reason: night.reason,
    pushRefused: night.pushRefused,
    timeline: buildTimeline({
      history: stream?.history ?? [], phase, kind: ticket?.kind ?? "ticket", engine: ticket?.moteur, retrospective: loop.retrospective,
    }),
    cycles: cyclesOf({ reviews, reports, stream, running }),
    reviewCount: reviews.length,
    actions: stream?.actions ?? [],
    finished,
    costUsd: night.costUsd,
    unknownCosts: night.unknownCosts,
    remaining,
    eta,
  };
}
