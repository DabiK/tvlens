import { unavailableNote } from './sessions-view.mjs';

/**
 * Pure view model of the passage search of the Mac window. Passages are numbered from moment-1 in every session:
 * a search card is only worth something with the session it was searched in, which it carries from the answer of
 * the host to the replay.
 */

/**
 * The cards of a search answer, each naming the session it was searched in. null when the answer is not for the
 * loaded session (another one was opened meanwhile, none is loaded, or the answer names none): nothing of it is drawn.
 */
export function searchCards(found, session) {
  const sessionId = found?.sessionId;
  if (!sessionId || sessionId !== session?.id) return null;
  return (found.moments || []).map(moment => ({ ...moment, sessionId }));
}

/**
 * What replaying passage `id` opens in the loaded session: { segment, url }, or { refusal } with the reason in the
 * viewer's words. `sessionId` is the session the passage was shown for: when it is not the loaded one the replay is
 * refused, even though the loaded session may hold a passage of the same name.
 */
export function replayTarget({ id, sessionId } = {}, session) {
  if (sessionId !== session?.id) return { refusal: 'Ce passage appartient à une autre session que celle qui est ouverte : sa vidéo ne se relit pas ici.' };
  const segment = (session?.segments || []).find(passage => passage.id === id);
  // Says why the video cannot be replayed (not kept, missing, expired) instead of always blaming expiry.
  if (!segment?.available) return { refusal: unavailableNote(segment || (session?.history || []).find(passage => passage.id === id)).long };
  return { segment, url: `tvlens-media://${session.id}/${segment.id}` };
}
