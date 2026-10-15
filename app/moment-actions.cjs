const SEARCH_TIMEOUT_MS = 15000;
// Doit égaler le maxlength du champ #moment-question dans app/index.html pour garder la même limite côté hôte et interface.
const QUESTION_MAX_LENGTH = 1600;
const SEARCH_RESULT_LIMIT = 6;

function createMomentActions({ getSession, ask, viewingActions, deep, timeoutSignal = ms => AbortSignal.timeout(ms) }) {
  let searchController;
  const startMomentAction = (input, kind) => {
    const snapshot = getSession()?.runtime.watch.snapshot();
    const frozen = viewingActions.resolve(snapshot, input?.token, kind);
    const eligible = [...snapshot.history, ...snapshot.segments].filter(s => s.startMs >= frozen.startMs && s.endMs <= frozen.anchorMs);
    if (!eligible.length) throw Error('Aucun nouveau passage capturé pour cet instant. Laisse tourner la vidéo quelques secondes.');
    const endMs = Math.max(...eligible.map(s => s.endMs));
    let question;
    if (kind === 'catch-up') {
      question = `J’ai décroché. Résume en quelques phrases ce que j’ai manqué entre ${Math.round(frozen.startMs / 1000)} et `
        + `${Math.round(endMs / 1000)} secondes. Mentionne les passages non analysés ou manquants. `
        + 'Appuie les points importants sur deux ou trois passages cités.';
    } else {
      if (input?.question !== undefined && (typeof input.question !== 'string' || input.question.length > QUESTION_MAX_LENGTH)) {
        throw Error('Question invalide.');
      }
      if (input?.intent !== undefined && !['explain', 'summarize'].includes(input.intent)) throw Error('Action inconnue.');
      question = input?.question?.trim()
        || (input?.intent === 'summarize' ? 'Résume ce moment en quelques phrases.' : 'Explique ce moment et ce qui aide à le comprendre.');
      question += ` Instant sélectionné : ${Math.round(frozen.anchorMs / 1000)} secondes. `
        + 'Réponds uniquement sur les passages de cet intervalle, en signalant ce qui manque.';
    }
    const result = ask(question, {
      mode: 'chat', intent: kind === 'catch-up' ? 'recap' : 'explain-moment', snapshot, startMs: frozen.startMs, anchorMs: frozen.anchorMs,
    });
    if (kind === 'catch-up') {
      const job = deep.jobs.find(j => j.id === result.id);
      job.done.then(() => viewingActions.acknowledgeResult(frozen, job, eligible));
    }
    return { ...result, ...frozen, endMs };
  };
  return {
    search: async query => {
      // La session qui demande garde ses passages et miniatures ; une réponse tardive ne change jamais de session.
      const session = getSession()?.runtime;
      if (!session) throw Error('Démarre une observation.');
      searchController?.abort();
      searchController = new AbortController();
      const signal = AbortSignal.any([searchController.signal, timeoutSignal(SEARCH_TIMEOUT_MS)]);
      const state = session.watch.snapshot();
      const found = await session.search.search({
        query, segments: [...state.history, ...state.segments], anchorMs: state.capturedThroughMs, signal, limit: SEARCH_RESULT_LIMIT,
      });
      const moments = await Promise.all(found.moments.map(async moment => ({
        ...moment, preview: moment.available ? (await session.store.read(moment.id).catch(() => null))?.frames?.[0]?.dataUrl : null,
      })));
      if (session !== getSession()?.runtime) throw Error('Session obsolète.');
      return { ...found, sessionId: state.id, moments };
    },
    cancelSearch: reason => {
      searchController?.abort(new Error(reason));
      searchController = null;
    },
    freeze: value => viewingActions.freeze(getSession()?.runtime.watch.snapshot(), value),
    mark: () => viewingActions.mark(getSession()?.runtime.watch.snapshot()),
    explain: input => startMomentAction(input, 'explain'),
    catchUp: input => startMomentAction(input, 'catch-up'),
    reexamine: jobId => {
      const original = deep.jobs.find(job => job.id === jobId);
      const { question, options } = viewingActions.reexamination(original, getSession()?.runtime.watch.snapshot());
      return ask(question, options);
    },
  };
}

module.exports = { createMomentActions };
