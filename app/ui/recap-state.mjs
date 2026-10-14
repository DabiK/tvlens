// Statuses of a state that may arrive without the recap it is about: the last one goes on being shown.
const KEEPS_EARLIER = ['updating', 'error'];

/**
 * What the window shows of the recap when a new recap state arrives. Pure: no DOM, no clock.
 * - A state that belongs to another session than the current one is not this session's recap: `undefined`,
 *   and the window touches nothing (not even the revision that redraws).
 * - No state at all: no recap (`null`).
 * - Otherwise the state itself, completed: while the recap of the same session is being updated, or failed to
 *   update, the state may carry neither overview nor chapters, and the last recap goes on being shown.
 *   Any other status (ready, a ceiling reached…) is shown with what it carries.
 */
export function reduceRecap(previous, incoming, sessionId) {
  if (incoming?.sessionId && sessionId && incoming.sessionId !== sessionId) return undefined;
  if (!incoming) return null;
  const sameSession = Boolean(incoming.sessionId) && incoming.sessionId === previous?.sessionId;
  const earlier = sameSession && KEEPS_EARLIER.includes(incoming.status) ? previous : null;
  const chapters = incoming.chapters?.length ? incoming.chapters : earlier?.chapters || [];
  return { ...incoming, overview: incoming.overview || earlier?.overview || '', chapters };
}
