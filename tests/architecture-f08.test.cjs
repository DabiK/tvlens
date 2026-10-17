const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tick, turns, deferred, until, failure } = require('./helpers/wait.cjs');
const os = require('node:os');
const path = require('node:path');
const { WatchSession } = require('../core/session.cjs');
const { CodexPerception } = require('../adapters/codex-perception.cjs');
const { CodexAnalysisAgent } = require('../adapters/codex-analysis-agent.cjs');
const {
  CodexRpc, TVLENS_CODEX_DISCONNECTED, TVLENS_CODEX_REQUEST_TIMEOUT, TVLENS_CODEX_REQUEST_CUT,
} = require('../adapters/codex-rpc.cjs');
const {
  LocalVlmAgent, TVLENS_LOCAL_VLM_INPUT_REFUSED, TVLENS_LOCAL_VLM_UNREACHABLE, TVLENS_LOCAL_VLM_UNAVAILABLE, TVLENS_LOCAL_VLM_CLOSED,
} = require('../adapters/local-vlm-agent.cjs');
const { TVLENS_CODEX_CONNECTION_LOST } = require('../adapters/codex-session-events.cjs');
const { TVLENS_CODEX_INPUT_REFUSED } = require('../adapters/codex-session-run.cjs');
const {
  TVLENS_CODEX_CONFINEMENT_REFUSED, TVLENS_CODEX_TOOL_REFUSED, TVLENS_CODEX_SESSION_CLOSED,
} = require('../adapters/codex-session-client.cjs');

// F08: a description that failed on a passing error is asked for once more, in line, and only then.
// Offline: perception doubles, a fake App Server behind the real Codex client, a fetch double behind the real
// local agent, a Node child behind the real Codex pipe. Counts and statuses only: nothing here measures a
// latency or how often a description fails.
const TRANSIENT = 'TVLENS_VISION_TRANSIENT';
const passing = (message = 'Connexion coupée') => Object.assign(new Error(message), { code: TRANSIENT });
// Never an existing directory: connect() must not link real credentials during tests.
const authHome = path.join(os.tmpdir(), 'tvlens-test-absent-codex-home');

function fixture(perception, options = {}) {
  let time = 0;
  const files = new Map(), snapshots = [], saves = [], reads = [];
  const media = { put: async (id, s) => { files.set(id, s); }, read: async id => { reads.push(id); if (!files.has(id)) throw Error('expired'); return files.get(id); }, remove: async id => { files.delete(id); } };
  const watch = new WatchSession({ id: 's', now: () => time, perception, media, archive: { save: async s => { saves.push(JSON.parse(JSON.stringify(s))); } }, onChange: s => snapshots.push(s), ...options });
  return { watch, files, media, snapshots, saves, reads, setTime: t => { time = t; },
    add: async i => {
      time = Math.max(time, (i + 1) * 1000);
      const id = await watch.ingest({ startMs: i * 1000, endMs: (i + 1) * 1000, audio: new Uint8Array([i]), frames: [] });
      await turns(8);
      return id;
    } };
}
const transcribe = async s => ({ observation: { transcript: `Paroles ${s.id}` }, elapsedMs: 10 });
const visual = async s => ({ observation: { summary: `Images ${s.id}`, visual: 'Image' }, elapsedMs: 20 });
// The counters of a session in which no description was ever asked for twice: the two new ones are absent.
const BASE = { audioSkipped: 0, audioExpired: 0, visionSkippedBacklog: 0, visionSkippedAsking: 0, visionExpired: 0, audioError: 0, visionError: 0, visionBlockedMs: 0 };

test('a description that fails once on a passing error is asked for once more in line, and the passage is published as described', async () => {
  const calls = [];
  const f = fixture({ transcribe, observeVisual: async s => { calls.push(s.id); if (calls.length === 1) throw passing(); return visual(s); } });
  await f.add(0);
  const [p] = f.watch.segments, state = f.watch.snapshot();
  assert.deepEqual(calls, ['moment-1', 'moment-1'], 'two calls, no more');
  assert.deepEqual([p.status, p.audioStatus, p.visionStatus, p.visionError, p.observation.summary, p.observation.transcript], ['ready', 'ready', 'ready', undefined, 'Images moment-1', 'Paroles moment-1']);
  assert.equal(p.revision, 2, 'the transcript, then one description: a second call is not a second publication');
  assert.deepEqual(state.coverage, { passages: 1, ...BASE, visionRetried: 1, visionRecovered: 1 });
  assert.deepEqual([state.lastError, state.visionGaps, state.gaps, state.apiCalls, state.analyzedThroughMs], [null, [], [], 2, 1000], 'each call made is counted');
  assert.deepEqual(f.reads, ['moment-1', 'moment-1', 'moment-1'], 'the media are read again for the second call');
  for (const s of [...f.snapshots, ...f.saves])
    assert.ok(s.lastError === null && s.coverage.visionError === 0 && s.segments.every(x => x.visionStatus !== 'error' && !x.visionError), 'no state published or saved ever said the description was lost');
});

test('between the two calls the passage stays in analysis and keeps its first start; the description is published once', async () => {
  const second = deferred(); let calls = 0;
  const f = fixture({ transcribe, observeVisual: async s => { if (++calls === 1) throw passing(); await second.promise; return visual(s); } });
  await f.add(0);
  const [p] = f.watch.segments; let state = f.watch.snapshot();
  assert.deepEqual([calls, p.visionStatus, p.status, p.visionError, p.revision, state.analyzing, state.lastError], [2, 'analyzing', 'partial', undefined, 1, true, null]);
  assert.deepEqual([state.coverage.visionRetried, state.coverage.visionRecovered, state.coverage.visionError], [1, undefined, 0], 'counted as tried again when the second call starts, as recovered only once it succeeds');
  f.setTime(5000);
  second.resolve();
  await turns(8);
  state = f.watch.snapshot();
  assert.deepEqual([p.visionStartedMs, p.visionPublishedMs, p.visionMs, p.analysisMs, p.revision, p.status], [1000, 5000, 20, 30, 2, 'ready']);
  assert.deepEqual([state.coverage.visionRetried, state.coverage.visionRecovered, state.coverage.visionError], [1, 1, 0]);
});

test('a description that fails twice is lost after exactly two calls, counted as tried again and as lost', async () => {
  const calls = [];
  const f = fixture({ transcribe, observeVisual: async s => { calls.push(s.id); if (s.id === 'moment-1') throw passing(`Coupure ${calls.length}`); return visual(s); } });
  await f.add(0);
  const [p] = f.watch.segments, state = f.watch.snapshot();
  assert.deepEqual(calls, ['moment-1', 'moment-1']);
  assert.deepEqual([p.status, p.visionStatus, p.visionError, p.revision, p.observation.transcript, p.visionPublishedMs], ['partial', 'error', 'Coupure 2', 2, 'Paroles moment-1', undefined]);
  assert.deepEqual(state.coverage, { passages: 1, ...BASE, visionRetried: 1, visionError: 1 }, 'tried again, never recovered, lost once');
  assert.deepEqual([state.lastError, state.apiCalls, state.visionGaps], ['Coupure 2', 2, [{ id: 'moment-1', startMs: 0, endMs: 1000, visionStatus: 'error' }]]);
  await f.add(1);
  f.watch.drain();
  await turns(8);
  assert.deepEqual(calls, ['moment-1', 'moment-1', 'moment-2'], 'never a third call, whatever comes next');
  assert.deepEqual(f.watch.segments.map(s => s.visionStatus), ['error', 'ready']);
  assert.deepEqual(f.watch.snapshot().coverage, { passages: 2, ...BASE, visionRetried: 1, visionError: 1 });
});

test('an error its adapter did not mark stays final at the first call, and a session without a second call keeps the counters it always had', async () => {
  const failures = [Error('vision failed'), Object.assign(Error('refusée'), { authRequired: true }), Object.assign(Error('disque plein'), { code: 'TVLENS_STORAGE_FULL' }),
    Object.assign(Error('marquée autrement'), { transient: true, retryable: true }), new DOMException('The operation was aborted due to timeout', 'TimeoutError')];
  for (const error of failures) {
    let calls = 0;
    const f = fixture({ transcribe, observeVisual: async () => { calls++; throw error; } });
    await f.add(0);
    assert.equal(calls, 1, error.message);
    assert.deepEqual(f.watch.snapshot().coverage, { passages: 1, ...BASE, visionError: 1 }, error.message);
    assert.deepEqual([f.watch.segments[0].visionStatus, f.watch.segments[0].visionError, f.reads.length], ['error', error.message, 2]);
  }

});

test('nothing is described again once the session is ending, read-only or closed', async () => {
  for (const [name, end] of [['ending', w => { w.ending = true; }], ['readOnly', w => { w.readOnly = true; }]]) {
    const gate = deferred(); let calls = 0;
    const f = fixture({ transcribe, observeVisual: async () => { calls++; await gate.promise; throw passing(); } });
    await f.add(0);
    end(f.watch);
    gate.resolve();
    await turns(8);
    const [p] = f.watch.segments;
    assert.deepEqual([calls, f.reads.length, p.visionStatus, p.visionError, f.watch.losses.visionRetried, f.watch.losses.visionError], [1, 2, 'error', 'Connexion coupée', undefined, 1], name);
  }
  const gate = deferred(); let calls = 0, signal;
  const f = fixture({ transcribe, observeVisual: async s => { calls++; signal = s.signal; await gate.promise; throw passing(); } });
  await f.add(0); await f.watch.close();
  const published = f.snapshots.length, saved = f.saves.length;
  gate.resolve();
  await turns(8);
  assert.deepEqual([calls, signal.aborted, f.snapshots.length, f.saves.length, f.reads.length, f.watch.losses.visionRetried], [1, true, published, saved, 2, undefined]);
});

test('a session closed during the second call publishes nothing more and reopens with that passage unanalysed: nothing is resumed', async () => {
  const second = deferred(); let calls = 0;
  const perception = { transcribe, observeVisual: async s => { if (++calls === 1) throw passing(); await second.promise; return visual(s); } };
  const f = fixture(perception);
  await f.add(0);
  assert.equal(calls, 2);
  await f.watch.close();
  const published = f.snapshots.length, written = f.saves.length, saved = f.saves.at(-1);
  second.resolve();
  await turns(8);
  assert.deepEqual([f.snapshots.length, f.saves.length, f.watch.segments[0].observation.summary, f.watch.losses.visionRecovered], [published, written, undefined, undefined]);
  assert.deepEqual([saved.segments[0].visionStatus, saved.coverage.visionRetried, saved.coverage.visionRecovered, saved.coverage.visionError], ['analyzing', 1, undefined, 0]);
  const g = fixture(perception);
  g.watch.restore(saved, { hasMedia: () => true });
  await g.watch.resume();
  g.watch.drain();
  await turns(8);
  const state = g.watch.snapshot();
  assert.deepEqual([calls, g.reads.length, state.segments[0].visionStatus, state.segments[0].visionError, state.pending], [2, 0, 'error', 'Analyse interrompue à la fermeture de la session.', 0]);
  assert.deepEqual([state.coverage.visionRetried, state.coverage.visionRecovered, state.coverage.visionError], [1, undefined, 1], 'a second call cut short is neither a recovery nor replayed');
});

test('what allows the second call is checked again once the media have been read again', async () => {
  const changes = { ending: f => { f.watch.ending = true; }, question: f => { f.watch.setQuestionPending(true); }, queue: f => f.add(1),
    expiry: async f => { f.setTime(5000); await f.watch.prune(); }, closed: f => f.watch.close() };
  for (const [name, change] of Object.entries(changes)) {
    const reread = deferred(), calls = []; let reads = 0;
    const f = fixture({ transcribe, observeVisual: async s => { calls.push(s.id); if (s.id === 'moment-1') throw passing(); return visual(s); } }, { retentionMs: 1000 });
    const read = f.media.read;
    // The third read of the passage is the one made for the second call: it has its content, and returns late.
    f.media.read = async id => { const content = await read(id); if (id === 'moment-1' && ++reads === 3) await reread.promise; return content; };
    await f.add(0);
    assert.deepEqual([calls, reads], [['moment-1'], 3], name);
    await change(f);
    reread.resolve();
    await turns(8);
    const first = [...f.watch.history, ...f.watch.segments][0];
    assert.deepEqual([calls.filter(id => id === 'moment-1').length, f.watch.losses.visionRetried], [1, undefined], name);
    if (name !== 'closed') assert.deepEqual([first.visionStatus, first.visionError, f.watch.losses.visionError], ['error', 'Connexion coupée', 1], name);
    if (name === 'queue') assert.deepEqual([calls, f.watch.segments[1].visionStatus], [['moment-1', 'moment-2'], 'ready'], 'the passage that arrived meanwhile is described next');
  }
});

test('media that cannot be read again, or are no longer kept, end the description at its first failure', async () => {
  let calls = 0, reads = 0;
  const f = fixture({ transcribe, observeVisual: async () => { calls++; throw passing(); } });
  const read = f.media.read;
  f.media.read = async id => { if (++reads === 3) throw Error('ENOENT: no such file or directory, open \'/private/sessions/moment-1.json\''); return read(id); };
  await f.add(0);
  assert.deepEqual([calls, reads, f.watch.segments[0].visionStatus, f.watch.segments[0].visionError, f.watch.lastError], [1, 3, 'error', 'Connexion coupée', 'Connexion coupée'], 'the loss keeps the words of the failure, never those of the disk');
  assert.deepEqual(f.watch.snapshot().coverage, { passages: 1, ...BASE, visionError: 1 }, 'no second call was made: none is counted');
  // Out of the rolling window during the first call, its files still there because their removal failed:
  // a passage that is no longer kept is not read again, let alone described again.
  const gate = deferred(); let described = 0;
  const g = fixture({ transcribe, observeVisual: async () => { described++; await gate.promise; throw passing(); } }, { retentionMs: 1000 });
  g.media.remove = async () => { throw Error('EPERM'); };
  await g.add(0); g.setTime(5000); await g.watch.prune();
  assert.deepEqual([g.files.has('moment-1'), g.watch.segments[0].available, g.watch.segments[0].mediaReason], [true, false, 'expired']);
  gate.resolve();
  await turns(8);
  assert.deepEqual([described, g.reads.length, g.watch.losses.visionRetried, g.watch.losses.visionError], [1, 2, undefined, 1]);
});

test('the second call only takes a free lane: not while a passage waits behind it, nor while a question holds vision back', async () => {
  const gate = deferred(), calls = [];
  const f = fixture({ transcribe, observeVisual: async s => { calls.push(s.id); if (s.id === 'moment-1') { await gate.promise; throw passing(); } return visual(s); } });
  await f.add(0); await f.add(1);
  assert.deepEqual(f.watch.visionQueue.map(s => s.id), ['moment-2']);
  gate.resolve();
  await turns(8);
  assert.deepEqual(calls, ['moment-1', 'moment-2'], 'the passage that waited is described next, in observation order');
  assert.deepEqual(f.watch.segments.map(s => [s.status, s.visionStatus]), [['partial', 'error'], ['ready', 'ready']]);
  assert.deepEqual(f.watch.snapshot().coverage, { passages: 2, ...BASE, visionError: 1 });

  const held = deferred(); let asked = 0;
  const g = fixture({ transcribe, observeVisual: async s => { if (++asked === 1) { await held.promise; throw passing(); } return visual(s); } });
  await g.add(0);
  g.watch.setQuestionPending(true);
  held.resolve();
  await turns(8);
  assert.deepEqual([asked, g.watch.segments[0].visionStatus], [1, 'error']);
  assert.deepEqual(g.watch.snapshot().coverage, { passages: 1, ...BASE, visionError: 1 }, 'lost and counted as such: nothing waits for the end of the question');
  g.watch.setQuestionPending(false);
  await turns(8);
  assert.equal(asked, 1, 'and nothing is tried once the question has ended');
});

test('where vision is allowed during a question, a second call runs during the question like any description', async () => {
  let calls = 0;
  const f = fixture({ transcribe, observeVisual: async s => { if (++calls === 1) throw passing(); return visual(s); } }, { visionDuringAsk: true });
  f.watch.setQuestionPending(true); await f.add(0);
  assert.deepEqual([calls, f.watch.asking, f.watch.segments[0].status, f.watch.segments[0].visionStatus], [2, true, 'ready', 'ready']);
  assert.deepEqual(f.watch.snapshot().coverage, { passages: 1, ...BASE, visionRetried: 1, visionRecovered: 1 });
});

test('reopening brings the two counters back only as counts this session can have written, and describes nothing again', async () => {
  const calls = [];
  // moment-1 is recovered at its second call, moment-2 is lost after two, moment-3 is described at once.
  const perception = { transcribe, observeVisual: async s => { calls.push(s.id); if (s.id === 'moment-2' || (s.id === 'moment-1' && calls.length === 1)) throw passing(); return visual(s); } };
  const live = fixture(perception);
  for (let i = 0; i < 3; i++) await live.add(i);
  assert.deepEqual(calls, ['moment-1', 'moment-1', 'moment-2', 'moment-2', 'moment-3']);
  const saved = JSON.parse(JSON.stringify(live.watch.snapshot()));
  assert.deepEqual([saved.coverage.visionRetried, saved.coverage.visionRecovered, saved.coverage.visionError, saved.apiCalls], [2, 1, 1, 5]);
  await live.watch.close(); calls.length = 0;
  const reopen = (coverage = {}) => { const f = fixture(perception); f.watch.restore({ ...saved, coverage: { ...saved.coverage, ...coverage } }, { hasMedia: () => true }); return f; };
  const f = reopen();
  let state = f.watch.snapshot();
  assert.deepEqual([state.coverage.visionRetried, state.coverage.visionRecovered, state.coverage.visionError, state.readOnly, state.pending, state.apiCalls], [2, 1, 1, true, 0, 5]);
  f.watch.drain();
  await turns(8);
  assert.deepEqual([calls, f.reads, f.saves.length], [[], [], 0], 'an archive that is only open is neither analysed nor written');
  await f.watch.resume();
  f.watch.drain();
  await turns(8);
  state = f.watch.snapshot();
  assert.deepEqual([calls, f.reads, state.segments.map(s => s.visionStatus), state.coverage.visionRetried, state.coverage.visionRecovered], [[], [], ['ready', 'error', 'ready'], 2, 1], 'resumed, the lost description is still not asked for again');
  // Three passages: at most three second calls, and no more recoveries than second calls.
  for (const [given, kept] of [[[-1, 1], [undefined, undefined]], [[1.5, 1], [undefined, undefined]], [['2', '1'], [undefined, undefined]], [[Infinity, 1], [undefined, undefined]], [[4, 1], [undefined, undefined]],
    [[null, 1], [undefined, undefined]], [[2, 3], [2, undefined]], [[3, 0], [3, undefined]], [[3, -2], [3, undefined]], [[3, 3], [3, 3]], [[1, 1], [1, 1]]]) {
    const { coverage } = reopen({ visionRetried: given[0], visionRecovered: given[1] }).watch.snapshot();
    assert.deepEqual([coverage.visionRetried, coverage.visionRecovered, 'visionRetried' in coverage, 'visionRecovered' in coverage], [...kept, kept[0] !== undefined, kept[1] !== undefined], JSON.stringify(given));
  }
});

// The adapter: which failures it marks, on which evidence.
const described = { topic: 'Sujet', continuity: 'continue', summary: 'Résumé', visual: 'Image', uncertainty: '', topicSummary: 'Cumul' };
const passage = (extra = {}) => ({ id: 'moment-1', startMs: 0, endMs: 8000, frames: [], observation: { transcript: 'Bonjour.' }, ...extra });
// A description whose deadline was lowered: the test fails at once, instead of waiting 45 s, where it cannot be.
const impatient = (agent, timeoutMs = 15) => { const perception = new CodexPerception({ agent, timeoutMs }); assert.equal(perception.timeoutMs, timeoutMs, 'the deadline of a description can be lowered'); return perception; };
// An agent that answers nothing, and fails with `reason(signal)` once the signal it was given aborts.
const afterAbort = reason => ({ answer: ({ signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(reason(signal)), { once: true })) });
const marked = async (error, timeoutMs) => (await failure(new CodexPerception({ agent: { answer: () => Promise.reject(error) }, timeoutMs }).observeVisual(passage()))).code === TRANSIENT;
const coded = (message, code, fields = {}) => Object.assign(Error(message), { code, ...fields });

test('description retries depend on transport codes and fields regardless of their wording', async t => {
  const deadline = new AbortController();
  t.mock.method(AbortSignal, 'timeout', () => deadline.signal);
  const transient = [
    ['Connexion Codex interrompue. Réessaie la question.', TVLENS_CODEX_CONNECTION_LOST],
    ['Codex déconnecté.', TVLENS_CODEX_DISCONNECTED],
    ['Codex : délai de connexion dépassé (initialize).', TVLENS_CODEX_REQUEST_TIMEOUT, { method: 'initialize' }],
    ['Codex : délai de connexion dépassé (thread/start).', TVLENS_CODEX_REQUEST_TIMEOUT, { method: 'thread/start' }],
    ['Backend local injoignable.', TVLENS_LOCAL_VLM_UNREACHABLE],
    ['Backend local indisponible (HTTP 503).', TVLENS_LOCAL_VLM_UNAVAILABLE, { httpStatus: 503 }],
  ];
  for (const [message, code, fields] of transient) {
    assert.equal(await marked(Error(message)), false, `uncoded: ${message}`);
    for (const wording of [message, 'Diagnostic reformulé.']) {
      const error = coded(wording, code, fields);
      const result = await failure(new CodexPerception({ agent: { answer: async () => { throw error; } } }).observeVisual(passage()));
      assert.deepEqual([result.code, result.message, result.cause], [TRANSIENT, wording, error], `${code}: ${wording}`);
    }
  }
  const final = [
    coded('Connexion Codex interrompue. Réessaie la question.', TVLENS_CODEX_REQUEST_CUT),
    coded('Codex déconnecté.', TVLENS_CODEX_REQUEST_TIMEOUT, { method: 'turn/start' }),
    coded('Codex déconnecté.', TVLENS_CODEX_REQUEST_TIMEOUT),
    coded('Codex déconnecté.', TVLENS_CODEX_REQUEST_TIMEOUT, { method: 'initialize/other' }),
    coded('Codex déconnecté.', 'UNKNOWN'),
    Error('Diagnostic inconnu.'),
  ];
  for (const httpStatus of [undefined, null, '503', 399, 503.5, 600, NaN, Infinity]) {
    final.push(coded('Backend local indisponible (HTTP 503).', TVLENS_LOCAL_VLM_UNAVAILABLE, { httpStatus }));
  }
  for (const error of final) assert.equal(await marked(error), false, `${error.code}: ${error.method ?? error.httpStatus}`);
  for (const httpStatus of [500, 599]) {
    assert.equal(await marked(coded('Diagnostic reformulé.', TVLENS_LOCAL_VLM_UNAVAILABLE, { httpStatus })), true, `${httpStatus}`);
  }
});

test('coded refusals override every transient transport through four cause levels even after the deadline', async t => {
  let deadline;
  t.mock.method(AbortSignal, 'timeout', () => deadline.signal);
  const refusals = [
    Object.assign(Error('Authentification reformulée.'), { authRequired: true }),
    ...[TVLENS_CODEX_INPUT_REFUSED, TVLENS_CODEX_CONFINEMENT_REFUSED, TVLENS_CODEX_TOOL_REFUSED,
      TVLENS_CODEX_SESSION_CLOSED, TVLENS_LOCAL_VLM_INPUT_REFUSED, TVLENS_LOCAL_VLM_CLOSED]
      .map(code => coded('Refus reformulé.', code)),
    ...[400, 404, 499].map(httpStatus => coded('Refus HTTP reformulé.', TVLENS_LOCAL_VLM_UNAVAILABLE, { httpStatus })),
  ];
  const transports = [
    [TVLENS_CODEX_CONNECTION_LOST], [TVLENS_CODEX_DISCONNECTED], [TVLENS_LOCAL_VLM_UNREACHABLE],
    [TVLENS_CODEX_REQUEST_TIMEOUT, { method: 'initialize' }],
    [TVLENS_CODEX_REQUEST_TIMEOUT, { method: 'thread/start' }],
    [TVLENS_LOCAL_VLM_UNAVAILABLE, { httpStatus: 503 }],
  ];
  for (const expired of [false, true]) {
    deadline = new AbortController();
    if (expired) deadline.abort(Error('Échéance expirée.'));
    for (const [code, fields] of transports) {
      const outer = cause => coded('Transport reformulé.', code, { ...fields, cause });
      assert.equal(await marked(outer()), true, `outer alone: ${code}, expired: ${expired}`);
      for (const refusal of refusals) {
        for (let depth = 0; depth < 4; depth++) {
          let error = refusal;
          for (let level = 1; level < depth; level++) error = Error('Enveloppe.', { cause: error });
          if (depth > 0) error = outer(error);
          const result = await failure(new CodexPerception({ agent: { answer: async () => { throw error; } } }).observeVisual(passage()));
          assert.equal(result, error, `${refusal.code ?? 'authRequired'}, depth: ${depth}, outer: ${code}, expired: ${expired}`);
        }
      }
      let distant = refusals[0];
      for (let depth = 1; depth < 4; depth++) distant = Error('Enveloppe.', { cause: distant });
      assert.equal(await marked(outer(distant)), true, 'a fifth cause level is outside the refusal search');
      const cancelled = AbortSignal.abort(Error('Appelant annulé.')), error = outer();
      const result = await failure(new CodexPerception({ agent: { answer: async () => { throw error; } } })
        .observeVisual(passage({ signal: cancelled })));
      assert.equal(result, error, `caller cancelled: ${code}`);
    }
  }
});

test('the description deadline is proved by its reason or interrupted turn fields independently of the message', async t => {
  let deadline;
  t.mock.method(AbortSignal, 'timeout', () => deadline.signal);
  const outcome = (error, { expired = false, reason = Error('Échéance.'), signal } = {}) => {
    deadline = new AbortController();
    const agent = { answer: async () => { if (expired) deadline.abort(reason); throw error; } };
    return failure(new CodexPerception({ agent }).observeVisual(passage({ signal })));
  };
  const reason = Error('Raison propre reformulée.');
  assert.equal(await outcome(reason), reason, 'the deadline has not expired');
  const own = await outcome(reason, { expired: true, reason });
  assert.deepEqual([own.code, own.cause], [TRANSIENT, reason]);
  for (const message of ['Recherche annulée.', 'Diagnostic de tour reformulé.']) {
    const interrupted = Object.assign(Error(message), { turnStatus: 'interrupted' });
    assert.equal(await outcome(interrupted), interrupted, 'an interrupted turn without an expired deadline is final');
    const confirmed = await outcome(interrupted, { expired: true });
    assert.deepEqual([confirmed.code, confirmed.message, confirmed.cause], [TRANSIENT, message, interrupted]);
    for (const turnError of [{ codexErrorInfo: 'responseStreamDisconnected' }, null, false]) {
      const detailed = Object.assign(Error(message), { turnStatus: 'interrupted', turnError });
      assert.equal(await outcome(detailed, { expired: true }), detailed, 'a reported turn error remains final');
    }
    const signal = AbortSignal.abort(Error('Appelant annulé.'));
    assert.equal(await outcome(interrupted, { expired: true, signal }), interrupted);
    assert.equal(await outcome(reason, { expired: true, reason, signal }), reason);
  }
  const unknown = [
    Error('Connexion Codex interrompue. Réessaie la question.'), Error('Codex déconnecté.'),
    Error('Codex : délai de connexion dépassé (initialize).'), Error('Codex : délai de connexion dépassé (thread/start).'),
    Error('Backend local injoignable.'), Error('Backend local indisponible (HTTP 503).'),
    Error('Diagnostic inconnu.'), Object.assign(Error('Recherche annulée.'), { turnStatus: 'failed' }),
    coded('Recherche annulée.', TVLENS_CODEX_REQUEST_TIMEOUT, { method: 'turn/start' }),
    coded('Recherche annulée.', TVLENS_CODEX_REQUEST_CUT),
  ];
  for (const error of unknown) assert.equal(await outcome(error, { expired: true }), error, error.message);
  const refused = Error('Échéance avec refus.', { cause: coded('Refus reformulé.', TVLENS_CODEX_TOOL_REFUSED) });
  assert.equal(await outcome(refused, { expired: true, reason: refused }), refused, 'a refusal wins even over the deadline reason itself');
});

test('the deadline of a description is 45 s unless a shorter one is asked for, never a longer or an unbounded one', () => {
  const agent = { answer: async () => described };
  assert.deepEqual([undefined, null, 0, -5, NaN, Infinity, '30', 45001, 90000].map(timeoutMs => new CodexPerception({ agent, timeoutMs }).timeoutMs), Array(9).fill(45000));
  assert.deepEqual([1, 30, 44999].map(timeoutMs => new CodexPerception({ agent, timeoutMs }).timeoutMs), [1, 30, 44999]);
});

test('the adapter marks its own expired deadline, on the reason of its signal or on the turn Codex confirms it interrupted, and nothing that only looks like it', { timeout: 20000 }, async () => {
  const own = await failure(impatient(afterAbort(signal => signal.reason)).observeVisual(passage()));
  assert.deepEqual([own.code, own.cause?.name, own.message], [TRANSIENT, 'TimeoutError', own.cause?.message], 'a new error carries the mark: the reason itself is a DOMException whose code cannot be written');
  const interrupted = () => Object.assign(Error('Recherche annulée.'), { turnStatus: 'interrupted' });
  const confirmed = await failure(impatient(afterAbort(interrupted)).observeVisual(passage()));
  assert.deepEqual([confirmed.code, confirmed.message, confirmed.cause?.turnStatus], [TRANSIENT, 'Recherche annulée.', 'interrupted']);
  // The same turn interrupted with a failure of its own to report: a provider detail nobody has classified.
  const detailed = Object.assign(interrupted(), { turnError: { codexErrorInfo: 'responseStreamDisconnected' } });
  assert.equal(await failure(impatient(afterAbort(() => detailed)).observeVisual(passage())), detailed);
  // Interrupted while the deadline still runs: not this adapter's doing.
  assert.equal(await marked(interrupted()), false);
  // A timeout that is not this deadline, before it and after it.
  const foreign = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  assert.equal(await failure(new CodexPerception({ agent: { answer: () => Promise.reject(foreign) } }).observeVisual(passage())), foreign);
  assert.equal(await failure(impatient(afterAbort(() => foreign)).observeVisual(passage())), foreign);
  assert.equal(await marked(AbortSignal.abort(new DOMException('ailleurs', 'TimeoutError')).reason), false);
  assert.equal(await marked(Object.assign(Error('délai'), { name: 'TimeoutError' })), false);
});

test('a refusal is never marked, even with the deadline already expired, a lost connection as its outer message or a caller that cancelled', { timeout: 20000 }, async () => {
  const unauthorized = Object.assign(Error('Codex n’a pas terminé la réponse : authentification refusée (401). Reconnexion Codex requise (codex login), puis repose la question.'), { authRequired: true, turnStatus: 'failed' });
  // Authentication, confinement, input, a request the local backend refused, a client or a backend that was closed.
  const refusals = [unauthorized,
    coded('Confinement Codex non confirmé (environnement).', TVLENS_CODEX_CONFINEMENT_REFUSED),
    coded('Confinement Codex non confirmé (sous-agents) : connexion refusée.', TVLENS_CODEX_CONFINEMENT_REFUSED),
    coded('Outil hors du périmètre TVLens (fil étranger).', TVLENS_CODEX_TOOL_REFUSED),
    coded('Outil hors du périmètre TVLens (commandExecution).', TVLENS_CODEX_TOOL_REFUSED),
    coded('Entrée média non autorisée.', TVLENS_CODEX_INPUT_REFUSED),
    coded('Backend local : image invalide.', TVLENS_LOCAL_VLM_INPUT_REFUSED),
    coded('Backend local indisponible (HTTP 404).', TVLENS_LOCAL_VLM_UNAVAILABLE, { httpStatus: 404 }),
    coded('Session Codex fermée.', TVLENS_CODEX_SESSION_CLOSED), coded('Backend local fermé.', TVLENS_LOCAL_VLM_CLOSED)];
  // Unknown, or a failed turn with a provider detail: final too, deadline or not.
  const unknown = [Error('boom'),
    Object.assign(Error('Codex n’a pas terminé la réponse.'), { turnStatus: 'failed', turnError: { codexErrorInfo: 'responseStreamDisconnected' } }),
    coded('Connexion Codex interrompue.', TVLENS_CODEX_REQUEST_CUT), Error('Connexion obsolète.')];
  for (const final of [...refusals, ...unknown]) {
    assert.equal(await failure(impatient(afterAbort(() => final)).observeVisual(passage())), final, `deadline expired: ${final.message}`);
    assert.equal(await marked(final), false, final.message);
  }
  // What a failure names as its cause refuses too, whatever its own message says, and two levels down as well.
  for (const refusal of refusals) {
    assert.equal(await marked(coded('Connexion Codex interrompue. Réessaie la question.', TVLENS_CODEX_CONNECTION_LOST,
      { cause: refusal })), false, `cause: ${refusal.message}`);
    assert.equal(await marked(coded('Backend local indisponible (HTTP 503).', TVLENS_LOCAL_VLM_UNAVAILABLE,
      { httpStatus: 503, cause: Error('enveloppe', { cause: refusal }) })), false, `cause of the cause: ${refusal.message}`);
  }
  assert.equal(await marked(coded('Connexion Codex interrompue. Réessaie la question.', TVLENS_CODEX_CONNECTION_LOST, { authRequired: true })), false);
  // A cause nobody knows refuses nothing: the lost connection is still one.
  assert.equal(await marked(coded('Connexion Codex interrompue. Réessaie la question.', TVLENS_CODEX_CONNECTION_LOST, { cause: Error('boom') })), true);
  // The caller cancelled: neither a lost connection, nor the deadline that expired first, is a reason any more.
  const closed = AbortSignal.abort(Error('Session fermée.'));
  const lost = coded('Connexion Codex interrompue. Réessaie la question.', TVLENS_CODEX_CONNECTION_LOST);
  assert.equal(await failure(new CodexPerception({ agent: { answer: () => Promise.reject(lost) } }).observeVisual(passage({ signal: closed }))), lost);
  const closing = new AbortController();
  const both = { answer: ({ signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => { const reason = signal.reason; closing.abort(Error('Session fermée.')); reject(reason); }, { once: true })) };
  const raced = await failure(impatient(both).observeVisual(passage({ signal: closing.signal })));
  assert.deepEqual([raced.name, raced.code === TRANSIENT, closing.signal.aborted], ['TimeoutError', false, true]);
});

test('the messages the adapter relies on are the ones the Codex pipe really writes; the one a closed process also answers is left out', { timeout: 20000 }, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dead = await failure(new CodexRpc({}).request('turn/start'));
  // A live process that answers nothing, then goes with a request pending.
  const rpc = new CodexRpc({ binary: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], env: process.env }).start();
  const gone = new Promise(resolve => rpc.child.once('exit', resolve));
  t.after(() => rpc.close());
  const timeouts = [];
  for (const method of ['initialize', 'thread/start', 'turn/start']) {
    const timed = failure(rpc.request(method, {}, 30));
    t.mock.timers.tick(30);
    timeouts.push(await timed);
  }
  const [silent, thread, started] = timeouts;
  const pending = failure(rpc.request('thread/start'));
  rpc.close();
  const cut = await pending; await gone;
  assert.deepEqual([dead.message, silent.message, started.message, cut.message], ['Codex déconnecté.', 'Codex : délai de connexion dépassé (initialize).', 'Codex : délai de connexion dépassé (turn/start).', 'Connexion Codex interrompue.']);
  assert.equal(dead.code, 'TVLENS_CODEX_DISCONNECTED');
  for (const [index, method] of ['initialize', 'thread/start', 'turn/start'].entries()) {
    assert.deepEqual([timeouts[index].message, timeouts[index].code, timeouts[index].method],
      [`Codex : délai de connexion dépassé (${method}).`, 'TVLENS_CODEX_REQUEST_TIMEOUT', method]);
  }
  assert.equal(cut.code, 'TVLENS_CODEX_REQUEST_CUT');
  const codes = require('../adapters/codex-rpc.cjs');
  for (const code of [dead.code, silent.code, cut.code]) assert.equal(codes[code], code);
  assert.deepEqual([await marked(dead), await marked(silent), await marked(thread)], [true, true, true]);
  // A turn Codex never acknowledged may be running; a pending request of a process the guard closed reads the same.
  assert.deepEqual([await marked(started), await marked(cut)], [false, false]);
});

// Fake App Server behind the real Codex client: one factory call is one process, `script(n)` plays the nth turn.
function appServer(script, { detail = null } = {}) {
  const requests = []; let processes = 0, turns = 0;
  const rpcFactory = ({ onEvent }) => {
    const n = ++processes; let closed = false;
    return { start() {}, send() {}, close() { closed = true; },
      request(method, params) {
        requests.push(method);
        if (closed) return Promise.reject(coded('Connexion Codex interrompue.', TVLENS_CODEX_REQUEST_CUT));
        if (method === 'thread/start') return Promise.resolve({ thread: { id: `thread-${n}` } });
        const threadId = params?.threadId;
        // Codex confirms the end of a turn it was asked to interrupt, after the failure it may have met itself.
        if (method === 'turn/interrupt') setImmediate(() => { if (detail) onEvent('error', { threadId, turnId: params.turnId, error: detail }); onEvent('turn/completed', { threadId, turn: { id: params.turnId, status: 'interrupted' } }); });
        if (method !== 'turn/start') return Promise.resolve({});
        const id = `turn-${++turns}`, act = script(turns);
        setImmediate(() => {
          if (act === 'described') { onEvent('item/completed', { threadId, turnId: id, item: { type: 'agentMessage', text: JSON.stringify(described) } }); onEvent('turn/completed', { threadId, turn: { id, status: 'completed' } }); }
          if (act === 'lost') onEvent('connection/closed', {});
          if (act === 'unauthorized') onEvent('turn/completed', { threadId, turn: { id, status: 'failed', error: { message: 'workspace routing discovery unauthorized (401)', codexErrorInfo: 'other' } } });
          if (act === 'failed') { onEvent('error', { threadId, turnId: id, error: { message: 'stream dropped', codexErrorInfo: 'responseStreamDisconnected' } }); onEvent('turn/completed', { threadId, turn: { id, status: 'failed' } }); }
          // 'stalled': nothing comes.
        });
        return Promise.resolve({ turn: { id } });
      } };
  };
  return { rpcFactory, sent: method => requests.filter(name => name === method).length, processes: () => processes };
}
function codex(t, script, { timeoutMs, ...options } = {}) {
  const server = appServer(script, options);
  const agent = new CodexAnalysisAgent({ authHome, rpcFactory: server.rpcFactory });
  const perception = new CodexPerception({ agent, sessionId: 's-observe', transcriber: { transcribe: async () => ({ text: 'Bonjour.', limits: [] }) }, timeoutMs });
  if (timeoutMs) assert.equal(perception.timeoutMs, timeoutMs, 'the deadline of a description can be lowered');
  t.after(() => perception.close());
  return { server, agent, perception };
}

test('behind the real Codex client: a connection lost during the turn is marked and the next call reconnects; a refused authentication and a failed turn are not', { timeout: 20000 }, async t => {
  const lost = codex(t, n => (n === 1 ? 'lost' : 'described'));
  const error = await failure(lost.perception.observeVisual(passage()));
  assert.deepEqual([error.code, error.message, error.cause?.message], [TRANSIENT, 'Connexion Codex interrompue. Réessaie la question.', 'Connexion Codex interrompue. Réessaie la question.']);
  assert.equal(error.cause.code, 'TVLENS_CODEX_CONNECTION_LOST');
  assert.equal(require('../adapters/codex-session-events.cjs').TVLENS_CODEX_CONNECTION_LOST, error.cause.code);
  const again = await lost.perception.observeVisual(passage());
  assert.deepEqual([again.observation.summary, lost.server.processes(), lost.server.sent('turn/start')], ['Résumé', 2, 2]);
  for (const [act, message] of [['unauthorized', /authentification refusée \(401\)/], ['failed', /^Codex n’a pas terminé la réponse\.$/]]) {
    const refused = codex(t, () => act);
    const final = await failure(refused.perception.observeVisual(passage()));
    assert.match(final.message, message); assert.equal(final.code, undefined, act);
  }
});

test('closing the real Codex client during a stalled turn preserves the explicit session closure', { timeout: 20000 }, async t => {
  const closed = codex(t, () => 'stalled');
  const pending = failure(closed.perception.observeVisual(passage()));
  await until(() => closed.server.sent('turn/start') === 1, 'the stalled turn to start');
  await closed.agent.close();
  const error = await pending;
  assert.deepEqual([error.message, error.code], ['Session Codex fermée.', 'TVLENS_CODEX_SESSION_CLOSED']);
  assert.equal(require('../adapters/codex-session-client.cjs').TVLENS_CODEX_SESSION_CLOSED, error.code);
  assert.equal(closed.server.sent('turn/start'), 1);
});

test('behind the real Codex client: the deadline of the adapter, confirmed as an interrupted turn, is marked; the same turn interrupted for its caller, or with a failure of its own, is not', { timeout: 20000 }, async t => {
  const own = codex(t, () => 'stalled', { timeoutMs: 60 });
  await own.agent.prepare('s-observe');
  const error = await failure(own.perception.observeVisual(passage()));
  assert.deepEqual([error.code, error.message, error.cause?.turnStatus, own.server.sent('turn/interrupt')], [TRANSIENT, 'Recherche annulée.', 'interrupted', 1]);

  const closing = new AbortController(), cancelled = codex(t, () => 'stalled');
  await cancelled.agent.prepare('s-observe');
  const pending = failure(cancelled.perception.observeVisual(passage({ signal: closing.signal })));
  await until(() => cancelled.server.sent('turn/start') === 1, 'the turn to start');
  await tick(); closing.abort(Error('Session fermée.'));
  const stopped = await pending;
  assert.deepEqual([stopped.message, stopped.turnStatus, stopped.code, cancelled.server.sent('turn/interrupt')], ['Recherche annulée.', 'interrupted', undefined, 1]);

  const detailed = codex(t, () => 'stalled', { timeoutMs: 60, detail: { message: 'stream dropped', codexErrorInfo: 'responseStreamDisconnected' } });
  await detailed.agent.prepare('s-observe');
  const unknown = await failure(detailed.perception.observeVisual(passage()));
  assert.deepEqual([unknown.message, unknown.turnStatus, unknown.turnError.codexErrorInfo, unknown.code], ['Recherche annulée.', 'interrupted', 'responseStreamDisconnected', undefined]);
});

test('behind the real local agent: a backend out of reach or answering 5xx is marked; a refused request, an invalid answer, a closed backend and a timeout that is not the adapter’s are not', { timeout: 20000 }, async () => {
  // No request leaves the process: fetch is a double.
  const local = (fetchImpl, options) => new LocalVlmAgent({ url: 'http://127.0.0.1:9', model: 'modele-factice', fetchImpl, ...options });
  const answered = (status, body = '{}') => async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });
  const stalled = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  const outcome = async agent => { const error = await failure(new CodexPerception({ agent }).observeVisual(passage())); return [error.message, error.code === TRANSIENT]; };
  assert.deepEqual(await outcome(local(async () => { throw new TypeError('fetch failed'); })), ['Backend local injoignable.', true]);
  for (const status of [500, 502, 503]) assert.deepEqual(await outcome(local(answered(status))), [`Backend local indisponible (HTTP ${status}).`, true]);
  for (const status of [400, 401, 404, 429]) assert.deepEqual(await outcome(local(answered(status))), [`Backend local indisponible (HTTP ${status}).`, false]);
  assert.deepEqual(await outcome(local(answered(200, 'pas du JSON'))), ['Réponse du modèle local invalide.', false]);
  const closed = local(answered(200)); await closed.close();
  assert.deepEqual(await outcome(closed), ['Backend local fermé.', false]);
  // Two deadlines run: the adapter only vouches for its own.
  const theirs = await failure(new CodexPerception({ agent: local(stalled, { timeoutMs: 15 }) }).observeVisual(passage()));
  assert.deepEqual([theirs.name, theirs.code === TRANSIENT], ['TimeoutError', false]);
  const ours = await failure(impatient(local(stalled)).observeVisual(passage()));
  assert.deepEqual([ours.code, ours.cause?.name], [TRANSIENT, 'TimeoutError']);
});

test('end to end behind the real Codex client: a connection lost during a description costs one reconnection, not the passage; lost twice or refused, the passage is lost as before', { timeout: 30000 }, async t => {
  const run = async script => {
    const { server, perception } = codex(t, script), f = fixture(perception);
    t.after(() => f.watch.close());
    await f.add(0); await until(() => ['ready', 'error'].includes(f.watch.segments[0].visionStatus), 'the description to settle');
    await turns(8);
    const [p] = f.watch.segments;
    return { p, coverage: f.watch.snapshot().coverage, turns: server.sent('turn/start'), processes: server.processes(), published: f.snapshots.flatMap(s => s.segments.map(x => x.visionStatus)) };
  };
  const once = await run(n => (n === 1 ? 'lost' : 'described'));
  assert.deepEqual([once.p.status, once.p.visionStatus, once.p.visionError, once.p.observation.summary, once.p.observation.transcript, once.p.revision], ['ready', 'ready', undefined, 'Résumé', 'Bonjour.', 2]);
  assert.deepEqual([once.turns, once.processes, once.published.includes('error')], [2, 2, false]);
  assert.deepEqual(once.coverage, { passages: 1, ...BASE, visionRetried: 1, visionRecovered: 1 });
  const twice = await run(() => 'lost');
  assert.deepEqual([twice.p.status, twice.p.visionStatus, twice.p.visionError, twice.turns], ['partial', 'error', 'Connexion Codex interrompue. Réessaie la question.', 2]);
  assert.deepEqual(twice.coverage, { passages: 1, ...BASE, visionRetried: 1, visionError: 1 });
  const refused = await run(() => 'unauthorized');
  assert.deepEqual([refused.p.visionStatus, refused.turns], ['error', 1]);
  assert.match(refused.p.visionError, /authentification refusée \(401\)/);
  assert.deepEqual(refused.coverage, { passages: 1, ...BASE, visionError: 1 });
});
