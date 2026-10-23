import { describeSurveillance, isRestoring } from './surveillance-view.mjs';

// Les publications ne contiennent qu'une fin de registre. Le chat conserve les résultats reçus
// et reprend l'historique à l'ouverture, sans recopier les alertes dans les questions enregistrées.
export function createSurveillanceChat({ readHistory, changed }) {
  let sessionId = null;
  let generation = 0;
  let requested = -1;
  const cards = new Map();
  const merge = (state, overwrite) => {
    for (const card of describeSurveillance(state).results) {
      if (overwrite || !cards.has(card.key)) cards.set(card.key, card);
    }
  };
  return {
    clear() {
      generation++;
      sessionId = null;
      cards.clear();
    },
    receive(state) {
      if (state.sessionId !== sessionId) {
        generation++;
        sessionId = state.sessionId;
        cards.clear();
      }
      const current = generation;
      if (sessionId && readHistory && !isRestoring(state) && requested !== generation) {
        requested = generation;
        Promise.resolve().then(readHistory).then(history => {
          if (current !== generation || history?.sessionId !== sessionId) return;
          merge(history, false);
          changed();
        }).catch(() => {
          // Les résultats poussés restent disponibles si la lecture de l'historique échoue.
        });
      }
      merge(state, true);
    },
    results(id) {
      return id && id === sessionId ? [...cards.values()] : [];
    },
  };
}
