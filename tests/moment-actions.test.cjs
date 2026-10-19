const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMomentActions } = require('../app/moment-actions.cjs');
const { ViewingActions } = require('../core/viewing-actions.cjs');

function stage(options = {}) {
  const state = {
    id: 'session-a', elapsedMs: 30000, capturedThroughMs: 28000, history: [],
    segments: [{ id: 'moment-1', startMs: 8000, endMs: 16000, available: true, status: 'ready' }],
  };
  const calls = [];
  const deep = { jobs: [] };
  const viewingActions = new ViewingActions({ makeId: () => 'token' });
  const reads = { snapshots: 0 };
  // The memory view of the loaded session, as these actions read it: identity, clock and observed passages.
  const view = () => ({ session: { id: state.id }, clock: { elapsedMs: state.elapsedMs, capturedThroughMs: state.capturedThroughMs },
    passages: [...state.history, ...state.segments] });
  const runtime = {
    // Le snapshot reste compté pour interdire son emploi par les lecteurs applicatifs.
    watch: { snapshot: () => { reads.snapshots++; return state; } },
    memory: { view },
    memoryProjection: { read: () => ({ session: state }) },
    search: { search: async () => ({ moments: [] }) },
    store: { read: async () => ({ frames: [{ dataUrl: 'preview-a' }] }) },
  };
  let loaded = { runtime };
  const actions = createMomentActions({
    timeoutSignal: () => new AbortController().signal,
    ...options, getSession: () => loaded, viewingActions, deep,
    ask: (question, options) => {
      calls.push({ question, options });
      return { id: 'question-1', status: 'queued' };
    },
  });
  return { actions, state, runtime, calls, deep, reads, view, load: value => { loaded = value; } };
}

test('search without a loaded session asks the viewer to start observing', async () => {
  const h = stage();
  h.load(null);
  await assert.rejects(h.actions.search('cercle'), { message: 'Démarre une observation.' });
});

test('search returns the captured session and its own previews with the ranking metadata', async () => {
  const h = stage();
  const found = { moments: [{ id: 'moment-1', available: true }, { id: 'moment-2', available: false }], mode: 'lexical' };
  h.runtime.search.search = async input => {
    const { signal, ...options } = input;
    assert.equal(signal.aborted, false);
    assert.deepEqual(options, { query: 'cercle', segments: h.state.segments, anchorMs: 28000, limit: 6 });
    return found;
  };
  assert.deepEqual(await h.actions.search('cercle'), {
    ...found, sessionId: 'session-a', moments: [
      { ...found.moments[0], preview: 'preview-a' }, { ...found.moments[1], preview: null },
    ],
  });
});

test('search refuses a response after the runtime was replaced or unloaded, including during preview loading', async () => {
  for (const next of [null, { runtime: { watch: { id: 'session-b' } } }]) {
    for (const phase of ['ranking', 'preview']) {
      const h = stage();
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      let entered;
      const waiting = new Promise(resolve => { entered = resolve; });
      h.runtime.search.search = async () => {
        if (phase === 'ranking') {
          entered();
          await gate;
        }
        return { moments: [{ id: 'moment-1', available: true }] };
      };
      h.runtime.store.read = async () => {
        if (phase === 'preview') {
          entered();
          await gate;
        }
        return { frames: [{ dataUrl: 'preview-a' }] };
      };
      const result = h.actions.search('cercle');
      await waiting;
      h.load(next);
      release();
      await assert.rejects(result, { message: 'Session obsolète.' });
    }
  }
});

test('a new search aborts the previous search signal', async () => {
  const h = stage();
  const signals = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  h.runtime.search.search = async ({ signal }) => {
    signals.push(signal);
    if (signals.length === 1) await gate;
    return { moments: [] };
  };
  const first = h.actions.search('première');
  await h.actions.search('seconde');
  assert.deepEqual(signals.map(signal => signal.aborted), [true, false]);
  release();
  await first;
});

test('ending a session aborts its search with the given reason and leaves other instances alone', async () => {
  const h = stage(), other = stage();
  const signals = [];
  for (const instance of [h, other]) {
    instance.runtime.search.search = async ({ signal }) => {
      signals.push(signal);
      return { moments: [] };
    };
    await instance.actions.search('cercle');
  }
  h.actions.cancelSearch('Nouvelle session.');
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[0].reason.message, 'Nouvelle session.');
  assert.equal(signals[1].aborted, false);
  h.actions.cancelSearch('Application fermée.');
  await h.actions.search('encore');
  assert.equal(signals[2].aborted, false);
});

test('search combines its cancellation signal with a fifteen second deadline', async () => {
  const deadline = new AbortController();
  const delays = [];
  const h = stage({ timeoutSignal: ms => {
    delays.push(ms);
    return deadline.signal;
  } });
  let searchSignal;
  h.runtime.search.search = async ({ signal }) => {
    searchSignal = signal;
    return { moments: [] };
  };
  await h.actions.search('cercle');
  assert.deepEqual(delays, [15000]);
  const reason = new DOMException('Search expired', 'TimeoutError');
  deadline.abort(reason);
  assert.equal(searchSignal.reason, reason);
});

test('mark and freeze read the currently loaded session and retain the catch-up interval', () => {
  const h = stage();
  assert.deepEqual(h.actions.mark(), { sessionId: 'session-a', atMs: 28000 });
  assert.deepEqual(h.actions.freeze({ kind: 'catch-up' }), {
    token: 'token', sessionId: 'session-a', kind: 'catch-up', startMs: 28000, anchorMs: 30000, endMs: 30000,
  });
  assert.equal(h.reads.snapshots, 0, 'mark and freeze read the memory view, not the session snapshot');
  h.load(null);
  assert.throws(() => h.actions.freeze(), { message: 'Lance TVLens sur une vidéo pour utiliser cette action.' });
});

test('catch-up asks about the captured interval in seconds with the recap intention and frozen options', () => {
  const h = stage();
  h.deep.jobs.push({ id: 'question-1', done: Promise.resolve() });
  h.state.capturedThroughMs = 8000;
  h.actions.mark();
  const frozen = h.actions.freeze({ kind: 'catch-up' });
  assert.deepEqual(h.actions.catchUp(frozen), { id: 'question-1', status: 'queued', ...frozen, endMs: 16000 });
  assert.deepEqual(h.calls, [{
    question: 'J’ai décroché. Résume en quelques phrases ce que j’ai manqué entre 8 et 16 secondes. '
      + 'Mentionne les passages non analysés ou manquants. Appuie les points importants sur deux ou trois passages cités.',
    options: { mode: 'chat', intent: 'recap', consultation: { sessionId: 'session-a', anchorMs: 30000, passages: h.view().passages },
      startMs: 8000, anchorMs: 30000 },
  }]);
  assert.equal(h.reads.snapshots, 0);
});

test('catch-up advances the next interval only once the completed answer covers the passages', async () => {
  const h = stage();
  let finish;
  const job = { id: 'question-1', status: 'running', done: new Promise(resolve => { finish = resolve; }) };
  h.deep.jobs.push(job);
  const frozen = h.actions.freeze({ kind: 'catch-up' });
  h.actions.catchUp(frozen);
  assert.equal(h.actions.freeze({ kind: 'catch-up' }).startMs, 0);
  job.status = 'done';
  job.result = { citations: [{ id: 'moment-1', startMs: 8000, endMs: 16000 }] };
  finish();
  await job.done;
  assert.equal(h.actions.freeze({ kind: 'catch-up' }).startMs, 16000);
});

test('explain sends the chosen question and the selected instant with the frozen interval', () => {
  const h = stage();
  const frozen = h.actions.freeze();
  h.state.segments.push({ id: 'moment-2', startMs: 16000, endMs: 28000 });
  assert.deepEqual(h.actions.explain({ ...frozen, question: '  Pourquoi ?  ' }), {
    id: 'question-1', status: 'queued', ...frozen, endMs: 28000,
  });
  assert.deepEqual(h.calls, [{
    question: 'Pourquoi ? Instant sélectionné : 30 secondes. '
      + 'Réponds uniquement sur les passages de cet intervalle, en signalant ce qui manque.',
    options: { mode: 'chat', intent: 'explain-moment', consultation: { sessionId: 'session-a', anchorMs: 30000, passages: h.view().passages },
      startMs: 10000, anchorMs: 30000 },
  }]);
  assert.equal(h.reads.snapshots, 0);
});

test('explain refuses questions longer than sixteen hundred characters', () => {
  const h = stage();
  h.state.elapsedMs = 16000;
  const frozen = h.actions.freeze();
  assert.throws(() => h.actions.explain({ ...frozen, question: 'x'.repeat(1601) }), { message: 'Question invalide.' });
  assert.deepEqual(h.calls, []);
  h.actions.explain({ ...frozen, question: 'x'.repeat(1600) });
  assert.ok(h.calls[0].question.startsWith('x'.repeat(1600)));
});

test('explain refuses an unknown intention before asking the agent', () => {
  const h = stage();
  h.state.elapsedMs = 16000;
  const frozen = h.actions.freeze();
  assert.throws(() => h.actions.explain({ ...frozen, intent: 'delete' }), { message: 'Action inconnue.' });
  assert.deepEqual(h.calls, []);
});

test('an instant without a complete new passage asks the viewer to let the video run', () => {
  for (const kind of ['explain', 'catch-up']) {
    const h = stage();
    h.state.segments = [{ id: 'moment-1', startMs: 8000, endMs: 32000 }];
    const frozen = h.actions.freeze({ kind });
    assert.throws(() => h.actions[kind === 'catch-up' ? 'catchUp' : 'explain'](frozen), {
      message: 'Aucun nouveau passage capturé pour cet instant. Laisse tourner la vidéo quelques secondes.',
    });
    assert.deepEqual(h.calls, []);
  }
});

test('reexamination asks the original question with inspection options limited to its saved evidence', () => {
  const h = stage();
  const segment = { id: 'moment-1', startMs: 8000, endMs: 16000 };
  h.deep.jobs.push({
    id: 'original', sessionId: 'session-a', question: 'Pourquoi ?', intent: 'explain-moment', anchorMs: 16000,
    tools: { consultationScope: () => ({ sessionId: 'session-a', anchorMs: 16000, startMs: 8000,
      passages: [segment, { id: 'later', startMs: 16000, endMs: 24000 }] }) },
  });
  assert.deepEqual(h.actions.reexamine('original'), { id: 'question-1', status: 'queued' });
  assert.deepEqual(h.calls, [{
    question: 'Pourquoi ?', options: {
      mode: 'inspect', intent: 'explain-moment', startMs: 8000, anchorMs: 16000,
      consultation: { sessionId: 'session-a', anchorMs: 16000, startMs: 8000, passages: [segment] },
    },
  }]);
  assert.equal(h.reads.snapshots, 0);
  h.load({ runtime: { memory: { view: () => ({ ...h.view(), session: { id: 'session-b' } }) } } });
  assert.throws(() => h.actions.reexamine('original'), { message: 'Ce moment n’est plus disponible dans cette session.' });
});

test('explain and summarize retain their default questions for a blank question', () => {
  for (const [intent, question] of [
    [undefined, 'Explique ce moment et ce qui aide à le comprendre.'],
    ['explain', 'Explique ce moment et ce qui aide à le comprendre.'],
    ['summarize', 'Résume ce moment en quelques phrases.'],
  ]) {
    const h = stage();
    h.state.elapsedMs = 16000;
    const frozen = h.actions.freeze();
    h.actions.explain({ ...frozen, intent, question: '  ' });
    assert.equal(h.calls[0].question, question + ' Instant sélectionné : 16 secondes. '
      + 'Réponds uniquement sur les passages de cet intervalle, en signalant ce qui manque.');
  }
});

test('explain refuses non-string questions with the viewer-facing validation error', () => {
  for (const question of [null, 42, {}]) {
    const h = stage();
    h.state.elapsedMs = 16000;
    const frozen = h.actions.freeze();
    assert.throws(() => h.actions.explain({ ...frozen, question }), { message: 'Question invalide.' });
    assert.deepEqual(h.calls, []);
  }
});


test('search reads the application projection without constructing a legacy snapshot', async () => {
  const h = stage();
  await h.actions.search('cercle');
  assert.equal(h.reads.snapshots, 0);
});
