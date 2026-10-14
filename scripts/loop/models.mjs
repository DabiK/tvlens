// Modèle de chaque tentative d'un ticket : une échelle de paliers, un point de départ fixé par le niveau
// du ticket, un palier de plus à chaque tentative refusée. Aucun effet de bord.

/** Du moins cher au plus fort. `alias` est le nom qu'accepte le paramètre `model` d'un sous-agent. */
export const LADDER = [
  { model: "claude-sonnet-5-5", alias: "sonnet", effort: "high" },
  { model: "claude-opus-5-5", alias: "opus", effort: "high" },
  { model: "claude-opus-5-5", alias: "opus", effort: "xhigh" },
  { model: "claude-fable-5-1", alias: "fable", effort: "high" },
];

/**
 * Niveau d'un ticket : palier de départ, et palier en dessous duquel le relecteur ne descend pas.
 * Le relecteur est le dernier filet avant les contrôles de la boucle : sauf sur un ticket simple, il
 * reste au moins sur Opus quand l'implémentation tourne sur Sonnet.
 */
export const LEVELS = {
  simple: { start: 0, reviewFloor: 0 },
  standard: { start: 0, reviewFloor: 1 },
  sensible: { start: 1, reviewFloor: 1 },
  critique: { start: 2, reviewFloor: 2 },
};

/** Niveau déclaré dans l'en-tête (`niveau:`), sinon déduit de ce que le ticket autorise. */
export function levelOf(ticket) {
  if (ticket.niveau) return ticket.niveau;
  if (ticket.harnais) return "critique";
  if (ticket.adr || ticket.supprimeTests || ticket.installe) return "sensible";
  return "standard";
}

/** Palier de la tentative `attempt` (à partir de 1) : un de plus par tentative refusée, plafonné au dernier. */
export function rungFor(level, attempt) {
  return Math.min(LEVELS[level].start + attempt - 1, LADDER.length - 1);
}

/** Tentatives nécessaires pour monter du palier de départ jusqu'en haut de l'échelle. */
export function attemptsToTop(level) {
  return LADDER.length - LEVELS[level].start;
}

/** Ce que la session et son relecteur utilisent à ce palier. */
export function plan(level, attempt) {
  const rung = rungFor(level, attempt);
  const review = LADDER[Math.max(rung, LEVELS[level].reviewFloor)];
  return { rung, ...LADDER[rung], reviewModel: review.alias };
}

/** « claude-opus-5-5 » → « Claude Opus 5.5 » ; un nom qui ne suit pas ce format → « Claude ». */
export function displayName(model) {
  const match = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(model || "");
  if (!match) return "Claude";
  const [, family, major, minor] = match;
  return `Claude ${family[0].toUpperCase()}${family.slice(1)} ${major}.${minor}`;
}
