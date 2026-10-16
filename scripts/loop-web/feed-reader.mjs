// Le fil de la session en cours, lu sur le disque par incréments : seuls les octets arrivés depuis la dernière lecture
// sont lus. Il repart du début quand la session change ou quand son fichier a raccourci. Rien n'est jamais écrit.
import path from "node:path";
import { emptyFeed, foldFeed } from "../loop-view/feed.mjs";
import { newLines } from "../watch-loop/reader.mjs";

// Un identifiant de ticket sert de nom de dossier : celui qui sortirait de `tickets/` n'est pas lu.
const SAFE_TICKET_ID = /^[A-Za-z0-9_-]+$/;

/** Le fichier de flux d'une tentative : `codex-<n>.jsonl` pour Codex, `session-<n>.jsonl` pour Claude. */
function streamOf(root, ticket) {
  const engine = ticket.moteur === "codex" ? "codex" : "claude";
  const prefix = engine === "codex" ? "codex" : "session";
  return { engine, file: path.join(root, ".harness-state", "tickets", ticket.id, `${prefix}-${ticket.attempt}.jsonl`) };
}

/**
 * Un lecteur du fil de `root`. `read(ticket)` prend le ticket de la vue (`buildView().ticket`) et rend
 * `{ key, engine, feed }`, ou null sans ticket en cours. `key` change avec la session : le client repart alors de zéro.
 */
export function createFeedReader(root) {
  let tracked = null;
  return {
    read(ticket) {
      if (!ticket || !SAFE_TICKET_ID.test(String(ticket.id)) || !Number.isInteger(ticket.attempt)) {
        tracked = null;
        return null;
      }
      const { engine, file } = streamOf(root, ticket);
      const key = `${ticket.id}-${ticket.attempt}-${ticket.attemptAt ?? 0}`;
      const fresh = () => ({ key, engine, offset: 0, feed: emptyFeed() });
      if (tracked?.key !== key) tracked = fresh();
      let increment = newLines(file, tracked.offset);
      if (increment.shrunk) {
        tracked = fresh();
        increment = newLines(file, 0);
      }
      tracked.feed = foldFeed(tracked.feed, increment.lines, { engine, root });
      tracked.offset += increment.consumed;
      return { key: tracked.key, engine: tracked.engine, feed: tracked.feed };
    },
  };
}
