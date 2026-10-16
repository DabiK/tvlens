const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { VirtualClock } = require('./helpers/clock.cjs');
const { until } = require('./helpers/wait.cjs');
const { WatchSession } = require('../core/session.cjs');
const { DeepAsk, QUESTION_TIMEOUT_MS, QUESTION_PROGRESS_MS, limitLabel } = require('../core/deep-ask.cjs');
const { createConversationRuntime, hasPendingQuestion } = require('../runtime/conversation-runtime.cjs');
const { loadConfig } = require('../adapters/config.cjs');
const { VideoBridge } = require('../adapters/video-bridge.cjs');

// The ceiling tests drive the real session core, the real question queue and the composition shared by both
// hosts on a virtual clock. Providers are in-memory fakes: they prove orchestration, never provider speed.
const BLOCK_MS = 8000, TRANSCRIBE_MS = 1200, VISION_MS = 4000;
// Resolved at call time: a virtual timer while the clock is installed.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// A question listed in `answers` follows its script. Any other one only gives the hand back when it is aborted:
// the worst case for a ceiling.
function scriptedAgent(answers = {}) {
  const signals = [];
  return { signals, answer: input => { signals.push(input.signal); return answers[input.question]?.(input) ?? new Promise((_, reject) => input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true })); } };
}
// What a host resolves at start, without a file and without encrypted storage: nothing touches the disk.
const hostConfig = environment => loadConfig({ userData: 'unused', safeStorage: { isEncryptionAvailable: () => false }, environment });

// Must be called once the clock is installed: the queue captures Date.now when it is built.
function stage(clock, config, answers) {
  const items = new Map(), failures = [];
  const media = { put: async (id, input) => { items.set(id, input); }, read: async id => items.get(id), remove: async id => { items.delete(id); } };
  const perception = {
    transcribe: async s => { await sleep(TRANSCRIBE_MS); return { observation: { transcript: `Paroles ${s.id}` }, elapsedMs: TRANSCRIBE_MS }; },
    observeVisual: async s => { await sleep(VISION_MS); return { observation: { summary: `Images ${s.id}`, visual: 'Plan fixe' }, elapsedMs: VISION_MS }; } };
  // One hour of retention keeps expiry out of the picture: only the question may hold anything back here.
  const watch = new WatchSession({ id: 'session', now: () => clock.t, perception, media, archive: { save: async () => {} }, retentionMs: 3600000, visionDuringAsk: config.visionDuringAsk === true });
  const agent = scriptedAgent(answers);
  const { deep } = createConversationRuntime({ agent, config, selectedModels: {}, getSession: () => ({ watch, search: {}, inspector: {}, store: media }),
    onChange: state => watch.setQuestionPending(hasPendingQuestion(state.jobs, watch.id)) });
  let index = 0;
  const feed = setInterval(() => {
    const startMs = index++ * BLOCK_MS;
    watch.ingest({ startMs, endMs: startMs + BLOCK_MS, clip: new Uint8Array([1]), audio: new Uint8Array([1]), frames: [{ atMs: startMs, dataUrl: 'data:image/jpeg;base64,YQ==' }] }).catch(error => failures.push(error));
  }, BLOCK_MS);
  const epoch = Date.now() - clock.t;
  return { watch, deep, signals: agent.signals, failures, feed,
    ask: question => { const { id } = deep.start(question, { mode: 'chat' }); return deep.jobs.find(j => j.id === id); },
    // Question stamps come from Date.now: bring them back on the session timeline.
    at: stamp => stamp - epoch,
    passages() {
      const state = watch.snapshot(), all = [...state.history, ...state.segments];
      return { received: all.length, transcribed: all.filter(s => s.audioStatus === 'ready').length, described: all.filter(s => s.visionStatus === 'ready').length };
    } };
}

test('a question runs past 60 s and stops at exactly 300 000 ms while capture, speech and images go on; a long search that progresses succeeds, a cancelled one frees the queue at once, each question gets its own ceiling', async () => {
  const config = await hostConfig({});
  assert.equal(config.visionDuringAsk, true, 'hosts no longer hold visual descriptions back during a question');
  const clock = new VirtualClock().install();
  try {
    // One question answers after 250 s and reports progress on the way; the three others never answer.
    const s = stage(clock, config, { 'Recherche longue': async ({ onProgress }) => {
      await sleep(100000); onProgress({ message: 'Recherche dans les passages…' });
      await sleep(100000); onProgress({ message: 'Rédaction de la réponse…' });
      await sleep(50000); return { answer: 'Réponse longue.', kind: 'explanation', citations: [], sources: [], limits: [] };
    } });
    await clock.runUntil(20000);
    const [q1, q2, q3, q4] = ['Question sans réponse', 'Recherche longue', 'Question à annuler', 'Dernière question'].map(s.ask);
    assert.deepEqual([q1, q2, q3, q4].map(j => j.status), ['running', 'queued', 'queued', 'queued']);
    assert.deepEqual(s.deep.snapshot().jobs.map(j => j.timeoutMs), [300000, 300000, 300000, 300000], 'the ceiling is published with every question, queued ones included');

    // Past the former limit: still running, nothing aborted, the stream keeps being captured, transcribed and described.
    await clock.runUntil(80001);
    assert.deepEqual([q1.status, s.at(q1.startedAt), s.signals[0].aborted], ['running', 20000, false]);
    assert.equal(q1.message, 'La recherche continue · arrêt au plus tard à 5 minutes.');
    assert.deepEqual(s.passages(), { received: 10, transcribed: 9, described: 9 });
    await clock.runUntil(319999);
    assert.deepEqual([q1.status, s.signals[0].aborted, q2.status], ['running', false, 'queued']);
    assert.deepEqual(s.passages(), { received: 39, transcribed: 39, described: 39 });

    // The ceiling itself, one millisecond later: the question stops, the next one starts.
    await clock.runUntil(320000);
    assert.deepEqual([q1.status, q1.finishedAt - q1.startedAt, q1.message], ['timeout', 300000, 'Limite de 5 minutes atteinte.']);
    assert.deepEqual([q1.metrics.waitMs, q1.metrics.totalMs, q1.metrics.endToEndMs], [0, 300000, 300000]);
    assert.deepEqual([s.signals[0].aborted, s.signals[0].reason.message, q1.result.kind], [true, 'Délai maximal atteint.', 'insufficient']);
    assert.deepEqual([q2.status, s.at(q2.startedAt), q3.status], ['running', 320000, 'queued']);

    // It waited 300 s, a whole ceiling, without being charged for it, then works 250 s with visible progress and succeeds.
    await clock.runUntil(470000);
    assert.deepEqual([q2.status, q2.message, s.signals[1].aborted], ['running', 'Recherche dans les passages…', false]);
    await clock.runUntil(569999);
    assert.deepEqual([q2.status, q2.message], ['running', 'Rédaction de la réponse…']);
    await clock.runUntil(570000);
    assert.deepEqual([q2.status, q2.result.answer, q2.result.kind, s.signals[1].aborted], ['done', 'Réponse longue.', 'explanation', false]);
    assert.deepEqual([q2.metrics.waitMs, q2.metrics.totalMs, q2.metrics.endToEndMs], [300000, 250000, 550000]);
    assert.deepEqual([q3.status, s.at(q3.startedAt)], ['running', 570000]);

    // Manual cancellation 150 s into the third question: effective at once, and the queue moves on at the same instant.
    await clock.runUntil(720000);
    assert.deepEqual([q3.status, s.signals[2].aborted, s.passages().received], ['running', false, 90]);
    s.deep.cancel('Question annulée.', q3.id);
    assert.deepEqual([q3.status, q3.message, s.at(q3.finishedAt), s.signals[2].aborted, s.signals[2].reason.message], ['cancelled', 'Question annulée.', 720000, true, 'Question annulée.']);
    await clock.runUntil(720000);
    assert.deepEqual([q3.metrics.waitMs, q3.metrics.totalMs, q3.metrics.endToEndMs], [550000, 150000, 700000]);
    assert.deepEqual([q4.status, s.at(q4.startedAt), s.watch.asking], ['running', 720000, true]);

    // The last question waited 700 s. Its own 300 s start when it leaves the queue and end exactly there.
    await clock.runUntil(1019999);
    assert.deepEqual([q3.status, q4.status, s.signals[3].aborted], ['cancelled', 'running', false]);
    await clock.runUntil(1020000);
    assert.deepEqual([q4.status, q4.message, q4.metrics.waitMs, q4.metrics.totalMs, q4.metrics.endToEndMs], ['timeout', 'Limite de 5 minutes atteinte.', 700000, 300000, 1000000]);
    assert.deepEqual([s.signals[3].aborted, s.watch.asking, s.deep.active], [true, false, null]);

    // Nearly seventeen minutes of questions cost the stream nothing.
    await clock.runUntil(1040000);
    clearInterval(s.feed);
    await clock.runUntil(1046000);
    assert.deepEqual(s.failures, []);
    assert.deepEqual(s.passages(), { received: 130, transcribed: 130, described: 130 });
    const { coverage, accepting } = s.watch.snapshot();
    assert.deepEqual([accepting, coverage.visionBlockedMs, coverage.visionSkippedAsking, coverage.visionSkippedBacklog, coverage.audioSkipped], [true, 0, 0, 0, 0]);
    assert.doesNotMatch(JSON.stringify(s.deep.snapshot()), /60 secondes/);
    await s.watch.close();
    assert.equal(clock.timers.size, 0, 'no ceiling or reminder timer outlives its question');
  } finally { clock.uninstall(); }
});

test('with the vision gate restored (TVLENS_VISION_DURING_ASK=0) a five-minute question still loses no capture and no speech, and every withheld description is counted', async () => {
  const config = await hostConfig({ TVLENS_VISION_DURING_ASK: '0' });
  assert.equal(config.visionDuringAsk, false);
  const clock = new VirtualClock().install();
  try {
    const s = stage(clock, config);
    await clock.runUntil(20000);
    const question = s.ask('Question longue');
    await clock.runUntil(319999);
    assert.equal(question.status, 'running');
    assert.deepEqual(s.passages(), { received: 39, transcribed: 39, described: 2 });
    await clock.runUntil(320000);
    assert.deepEqual([question.status, question.metrics.totalMs, s.watch.asking], ['timeout', 300000, false]);
    const { coverage } = s.watch.snapshot();
    // Held from the first transcript published after the question started (25 200 ms) to its ceiling.
    assert.deepEqual([coverage.visionSkippedAsking, coverage.visionBlockedMs], [35, 294800]);
    // Once the question is over the lane resumes with what it kept waiting.
    clearInterval(s.feed);
    await clock.runUntil(340000);
    assert.deepEqual(s.failures, []);
    assert.deepEqual(s.passages(), { received: 40, transcribed: 40, described: 5 });
    await s.watch.close();
    assert.equal(clock.timers.size, 0);
  } finally { clock.uninstall(); }
});

test('the shared composition applies a lowered questionTimeoutMs, refuses any other value and defaults to five minutes', async () => {
  const session = { watch: { id: 's', snapshot: () => ({ id: 's', elapsedMs: 0, history: [], segments: [] }) }, search: {}, inspector: {}, store: {} };
  const build = config => createConversationRuntime({ getSession: () => session, agent: scriptedAgent(), config, selectedModels: {} }).deep;
  for (const value of [0, -1, 300001, 1.5, NaN, Infinity, 'abc', '150', true])
    assert.throws(() => build({ questionTimeoutMs: value }), /^Error: Réglage questionTimeoutMs invalide\.$/, String(value));

  // A lowered ceiling is enforced in real time and worded from the value really applied.
  const lowered = build({ questionTimeoutMs: 150 });
  lowered.start('Question', { mode: 'chat' });
  assert.equal(lowered.snapshot().jobs[0].timeoutMs, 150);
  await lowered.jobs[0].done;
  const [job] = lowered.snapshot().jobs;
  assert.deepEqual([job.status, job.message, job.timeoutMs], ['timeout', 'Limite de 1 seconde atteinte.', 150]);
  assert.ok(job.metrics.totalMs >= 140 && job.metrics.totalMs < 5000, `stopped at its own ceiling (got ${job.metrics.totalMs} ms)`);

  // Without the setting, and at the contract value itself: five minutes. The question is cancelled so that no timer stays armed.
  for (const config of [undefined, {}, { questionTimeoutMs: undefined }, { questionTimeoutMs: null }, { questionTimeoutMs: 300000 }]) {
    const deep = build(config);
    assert.equal(deep.timeoutMs, 300000);
    deep.start('Question', { mode: 'chat' });
    assert.equal(deep.snapshot().jobs[0].timeoutMs, 300000);
    deep.cancel();
    await deep.jobs[0].done;
    assert.equal(deep.jobs[0].status, 'cancelled');
  }
  assert.deepEqual([QUESTION_TIMEOUT_MS, QUESTION_PROGRESS_MS, new DeepAsk({}).timeoutMs], [300000, 30000, 300000]);
  assert.deepEqual([300000, 120000, 60000, 150000, 59001, 1000, 25].map(limitLabel), ['5 minutes', '2 minutes', '1 minute', '150 secondes', '60 secondes', '1 seconde', '1 seconde']);
});

test('an external MCP context lasts as long as a question may be processed, and says so', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-mcp-context-')), bridges = [];
  t.after(async () => { for (const bridge of bridges) await bridge.close(); await fs.rm(dir, { recursive: true, force: true }); });
  const open = async options => { bridges.push(new VideoBridge({ descriptor: path.join(dir, `bridge-${bridges.length}.json`), makeTools: () => ({ call: async name => ({ name }) }), ...options })); return bridges.at(-1).start(); };
  const call = async (bridge, name) => {
    const response = await fetch(bridge.url, { method: 'POST', headers: { Authorization: `Bearer ${bridge.master}`, 'X-TVLens-Client': 'client-1' }, body: JSON.stringify({ name, args: {} }) });
    return [response.status, await response.json()];
  };
  const standard = await open({});
  assert.equal(standard.contextMs, QUESTION_TIMEOUT_MS);
  assert.deepEqual(await call(standard, 'get_transcript'), [400, { error: 'Commence par search_moments pour ouvrir un contexte de 5 minutes.' }]);
  assert.deepEqual(await call(standard, 'search_moments'), [200, { name: 'search_moments' }]);
  assert.deepEqual(await call(standard, 'get_transcript'), [200, { name: 'get_transcript' }]);
  // The lifetime really is the option: a short context expires by itself and the client has to open a new one.
  const brief = await open({ contextMs: 80 }), openedAt = performance.now();
  assert.deepEqual(await call(brief, 'search_moments'), [200, { name: 'search_moments' }]);
  await until(() => brief.external.size === 0, 'external MCP context expired', { timeoutMs: 3000 });
  assert.equal(brief.external.size, 0);
  assert.ok(performance.now() - openedAt >= 70, 'the context was not dropped before its lifetime');
  assert.deepEqual(await call(brief, 'get_transcript'), [400, { error: 'Commence par search_moments pour ouvrir un contexte de 1 seconde.' }]);
  // The stdio server gives one tool call the same ceiling; neither side keeps a literal of the former limit.
  const read = file => fs.readFile(path.join(__dirname, '..', file), 'utf8');
  assert.match(await read('mcp/server.cjs'), /AbortSignal\.timeout\(QUESTION_TIMEOUT_MS\)/);
  for (const file of ['mcp/server.cjs', 'adapters/video-bridge.cjs']) assert.doesNotMatch(await read(file), /60000|60 secondes/, file);
});
