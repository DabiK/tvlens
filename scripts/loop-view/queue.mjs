// La file de tickets restante et l'heure où elle devrait finir. Fonctions pures sur la liste des tickets.
import { next } from "../loop/tickets.mjs";

const finished = (tickets, id) => tickets.map((ticket) => (ticket.id === id ? { ...ticket, statut: "termine" } : ticket));

/**
 * Les tickets que la boucle prendrait après celui qui tourne (`runningId`), en jouant `next` comme si chaque ticket
 * pris était terminé, jusqu'à la première raison de s'arrêter. `limit` est le nombre de tickets que la boucle doit
 * encore prendre (`--max`), ou null s'il est inconnu. Rend aussi cette raison, celle de la file entière.
 */
export function remainingTickets(tickets, { runningId = null, limit = null } = {}) {
  let queue = runningId ? finished(tickets, runningId) : tickets;
  const taken = [];
  for (;;) {
    const step = next(queue);
    if (!step.ticket) return capped(taken, limit, step.reason);
    taken.push({ id: step.ticket.id, titre: step.ticket.titre });
    queue = finished(queue, step.ticket.id);
  }
}

function capped(taken, limit, reason) {
  const isCapped = limit !== null && taken.length > limit;
  return { tickets: limit === null ? taken : taken.slice(0, Math.max(0, limit)), reason, capped: isCapped };
}

/**
 * Heure de fin : la durée moyenne des tickets terminés pour chaque ticket restant, plus ce qu'il reste au ticket en
 * cours (`elapsedMs`, null s'il n'y en a pas) avant d'atteindre cette moyenne. Null sans ticket terminé à moyenner.
 */
export function estimateEnd({ now, durationsMs, remaining, elapsedMs }) {
  if (!durationsMs.length) return null;
  const averageMs = durationsMs.reduce((sum, duration) => sum + duration, 0) / durationsMs.length;
  const currentLeft = elapsedMs === null ? 0 : Math.max(0, averageMs - elapsedMs);
  return { at: now + currentLeft + averageMs * remaining, averageMs };
}
