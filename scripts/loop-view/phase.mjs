// La phase où en est le ticket et la frise qui la situe : d'abord le flux de l'orchestrateur, puis les événements de la boucle.

import { PHASES } from "./phases.mjs";
const TICKET_STAGES = ["exploration", "implementation", "review", "check", "verdict", "gates", "retro"].map((key) => PHASES[key]);
const TUNING_STAGES = ["harmonisation", "review", "check", "verdict", "gates"].map((key) => PHASES[key]);
const BETWEEN = { key: "between", label: "Entre deux tickets" };

// Les phases que disent les événements de la boucle, une fois la session finie ou avant qu'elle ne commence.
const STAGE_PHASES = {
  none: { key: "idle", label: "En attente du premier ticket" },
  harmonisation: { key: "start", label: "Harmonisation des consignes" },
  gates: PHASES.gates,
  refused: { key: "refused", label: "Tentative refusée" },
  integrated: BETWEEN,
  retro: PHASES.retro,
  blocked: { key: "blocked", label: "Bloqué" },
  between: BETWEEN,
};
const STARTING = { key: "start", label: "Démarrage" };
const STOPPED = { key: "stopped", label: "Boucle arrêtée" };

const msOf = (iso) => (iso ? Date.parse(iso) : null);

/**
 * La phase en cours : celle du flux tant que la session tourne, celle des événements sinon. Une boucle sans verrou
 * vivant est « arrêtée » quelle que soit sa dernière phase, que `detail` garde. `fromStream` dit que le dernier
 * libellé de l'historique du flux est cette phase, et non une phase déjà passée.
 */
export function currentPhase({ stage, stageAt, stream, alive, retroPending = false, retrospective = true }) {
  if (retroPending && retrospective) stage = "retro";
  const fromStream = stage === "session" && Boolean(stream?.phase);
  let phase;
  if (fromStream) phase = { key: stream.phase.key, label: stream.phase.label, since: msOf(stream.phase.at) };
  else phase = { ...(stage === "session" ? STARTING : STAGE_PHASES[stage]), since: stageAt };
  return alive ? { ...phase, fromStream } : { ...STOPPED, since: phase.since, detail: phase.label, fromStream };
}

/** Rang d'une phase dans la suite du ticket ; fractionnaire pour l'étape qui précède une phase de la suite. */
function rankOf(key, stages) {
  const index = (wanted) => stages.findIndex((stage) => stage.key === wanted);
  if (key === "record") return index("review") - 0.5;
  if (key === "correction") return index("review") - 1;
  if (key === "start") return -1;
  const own = index(key);
  // Une phase hors de la suite (en attente, bloqué, refusé, entre deux tickets) n'annonce plus rien.
  return own < 0 ? stages.length : own;
}

/**
 * Les phases vues par le flux (`history`, dans l'ordre), celle qui est en cours, puis celles qui restent. L'enregistrement
 * de l'état relu n'apparaît que le temps qu'il dure : il précède chaque relecture et encombrerait la frise.
 */
export function buildTimeline({ history, phase, kind, retrospective = true }) {
  const stages = (kind === "harmonisation" ? TUNING_STAGES : TICKET_STAGES).filter((stage) => retrospective || stage.key !== "retro");
  const shown = (entries) => entries.filter((entry) => entry.key !== PHASES.record.key).map(({ label }) => ({ label, state: "done" }));
  // Boucle arrêtée : tout ce que le flux a vu est passé, et la frise s'arrête là où la boucle s'est arrêtée.
  if (phase.key === "stopped") return [...shown(history), { label: phase.label, state: "stopped" }];
  // Tant que la session tourne, le dernier libellé du flux est la phase en cours : il n'est pas encore « fait ».
  const items = [...shown(phase.fromStream ? history.slice(0, -1) : history), { label: phase.label, state: "current" }];
  const rank = rankOf(phase.key, stages);
  for (const [index, stage] of stages.entries()) if (index > rank) items.push({ label: stage.label, state: "todo" });
  return items;
}
