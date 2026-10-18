// Événements de la boucle (`events.jsonl`) : quel ticket est en cours, où en est la boucle à son sujet, ce qui est fini.
// Fonction pure : elle lit une liste d'événements déjà décodés et n'en garde que ce que la vue affiche (jamais `charge`).
import { quotaDiagnostic } from "../loop/codex-quota.mjs";

const TUNING_ID = /^H\d+$/;
// Les issues d'une harmonisation des consignes : ensuite la boucle passe au ticket suivant.
const TUNING_ENDS = new Set([
  "harmonisation-integree",
  "harmonisation-refusee",
  "harmonisation-sans-changement",
  "harmonisation-non-defaite",
  "harmonisation-sautee",
]);

const asMs = (iso) => (iso ? Date.parse(iso) : NaN);
const money = (value) => (typeof value === "number" ? value : 0);

/** Change l'étape en gardant l'heure de l'événement qui la change : « depuis quand » ne bouge pas avec les événements qui suivent. */
function setStage(state, stage, event, reason = null) {
  state.stage = stage;
  state.stageAt = asMs(event.at);
  state.reason = reason;
}

/**
 * Un travail qui reprend après une tentative refusée garde son début ; une session qui repart au même rang (boucle
 * relancée) ou sur un autre ticket en commence un nouveau.
 */
function startSession(state, event) {
  const previous = state.current;
  const continues = previous?.id === event.ticket && state.stage === "refused" && event.attempt > previous.attempt;
  state.current = {
    id: event.ticket,
    moteur: event.moteur ?? "claude",
    kind: TUNING_ID.test(event.ticket) ? "harmonisation" : "ticket",
    attempt: event.attempt,
    niveau: event.niveau ?? null,
    modele: event.modele ?? null,
    effort: event.effort ?? null,
    palier: event.palier ?? null,
    relecteur: event.relecteur ?? null,
    startedAt: continues ? previous.startedAt : event.at,
    attemptAt: event.at,
  };
  setStage(state, "session", event);
  state.pushRefused = false;
  state.retroPending = false;
}

function finishTicket(state, event, outcome, since) {
  const started = state.current?.id === event.ticket ? asMs(state.current.startedAt) : NaN;
  const at = asMs(event.at);
  setStage(state, outcome === "integre" ? "integrated" : "blocked", event, event.raison ?? null);
  state.retroPending = true;
  if (since !== null && at < since) return;
  state.finished.push({
    id: event.ticket,
    outcome,
    at: event.at,
    durationMs: Number.isNaN(started) ? null : at - started,
    costUsd: typeof event.cout_usd === "number" ? event.cout_usd : null,
    attempts: event.tentatives ?? null,
    commit: event.commit ?? null,
    model: event.modele ?? null,
  });
}

/** Un événement qui ne fait que coûter : la session finie et la rétrospective. */
function addCost(state, event, since) {
  if (since !== null && asMs(event.at) < since) return;
  state.costUsd += money(event.cout_usd);
  if (event.cout_usd === null) state.unknownCosts++;
}

const HANDLERS = {
  session: (state, event) => startSession(state, event),
  "session-terminee": (state, event, since) => {
    setStage(state, "gates", event);
    addCost(state, event, since);
  },
  "tentative-refusee": (state, event) => setStage(state, "refused", event, event.raison ?? null),
  "quota-epuise": (state, event) => {
    setStage(state, "quota", event, quotaDiagnostic(event.reprise ?? null));
    state.retroPending = false;
  },
  integre: (state, event, since) => finishTicket(state, event, "integre", since),
  bloque: (state, event, since) => finishTicket(state, event, "bloque", since),
  "push-refuse": (state) => {
    state.pushRefused = true;
  },
  retro: (state, event, since) => {
    state.retroPending = false;
    addCost(state, event, since);
  },
  "retro-echouee": (state) => {
    state.retroPending = false;
  },
  harmonisation: (state, event) => setStage(state, "harmonisation", event),
};

/**
 * Ce que disent les événements, dans l'ordre où la boucle les a écrits. `since` (ms) borne les tickets terminés et le
 * coût au lancement de la boucle ; sans lui, tout l'historique compte.
 *
 * `stage` : none (aucun événement), session (une session tourne), gates (la session est finie, la boucle contrôle),
 * refused, integrated, blocked, quota, harmonisation (choisie, pas encore lancée), between (entre deux tickets).
 */
export function analyzeEvents(events, { since = null } = {}) {
  const state = {
    current: null, stage: "none", stageAt: null, reason: null, pushRefused: false, retroPending: false,
    finished: [], costUsd: 0, unknownCosts: 0, lastEventAt: null,
  };
  for (const event of events) {
    const at = asMs(event.at);
    if (!Number.isNaN(at)) state.lastEventAt = at;
    // La phase vient du fichier : « constructor » ne doit pas retrouver une propriété de tout objet.
    const handle = Object.hasOwn(HANDLERS, event.phase) ? HANDLERS[event.phase] : null;
    if (handle) handle(state, event, since);
    else if (TUNING_ENDS.has(event.phase)) setStage(state, "between", event, event.raison ?? null);
  }
  return state;
}

/** Une boucle relancée sans nouvel événement attend encore son premier ticket. */
export function launchEvents(events, loop) {
  const lastEventAt = analyzeEvents(events).lastEventAt ?? 0;
  return loop.alive && loop.launchedAt != null && lastEventAt < loop.launchedAt ? [] : events;
}
