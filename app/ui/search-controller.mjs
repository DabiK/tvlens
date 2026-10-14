import { searchCards } from './search-view.mjs';

/**
 * Sequencing of the passage search of the Mac window, without a document and without a bridge. Results belong to the
 * session they were searched in and to the latest request: a clear, another request or another session drops what is
 * still on its way, answer or refusal, instead of drawing it in the wrong place.
 *
 * `search(query)` asks the host; `session()` is the loaded session at the moment of the call. The observers draw:
 * `onStart()` when a request leaves, `onResult(cards, found)` for an answer that is still wanted, `onClear()` when the
 * results are emptied, `onFailure(error)` for a refusal that is still wanted.
 */
export function createSearchController({ search, session, onStart, onResult, onClear, onFailure }) {
  let revision = 0;

  function clear() {
    revision++;
    onClear();
  }

  async function submit(query) {
    const own = ++revision;
    onStart();
    try {
      const found = await search(query);
      if (own !== revision) return;
      const cards = searchCards(found, session());
      if (!cards) return clear();
      onResult(cards, found);
    } catch (error) {
      if (own === revision) onFailure(error);
    }
  }

  return { submit, clear };
}
