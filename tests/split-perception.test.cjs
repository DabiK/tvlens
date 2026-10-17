const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WatchSession } = require('../core/session.cjs');
const { VideoTools, consultationOf } = require('../core/video-tools.cjs');
const { sessionTimeline } = require('../core/session-timeline.cjs');
const { CodexPerception } = require('../adapters/codex-perception.cjs');
const { tick, deferred, until } = require('./helpers/wait.cjs');
function fixture(perception, options = {}) {
  let time = 0;
  const files = new Map(), snapshots = [];
  const watch = new WatchSession({ id: 's', now: () => time, perception,
    media: { put: async (id, s) => files.set(id, s), read: async id => { if (!files.has(id)) throw Error('expired'); return files.get(id); }, remove: async id => files.delete(id) },
    archive: { save: async () => {} }, onChange: s => snapshots.push(s), ...options });
  return { watch, snapshots, setTime: t => time = t,
    add: async i => { time = (i + 1) * 1000; await watch.ingest({ startMs: i * 1000, endMs: time, audio: new Uint8Array([i]), frames: [] }); await tick(); } };
}
const transcribe = async s => ({ observation: { transcript: `Paroles ${s.id}` }, elapsedMs: 10 });
const visual = async s => ({ observation: { summary: `Images ${s.id}`, visual: 'Image' }, elapsedMs: 20 });

test('question pending publishes each transition once and resumes held vision while audio continues', async t => {
  const audio = deferred(), vision = deferred(), scheduled = [], described = [];
  const f = fixture({
    transcribe: async s => { await audio.promise; return transcribe(s); },
    observeVisual: async s => { described.push(s.id); await vision.promise; return visual(s); },
  });
  t.after(() => f.watch.close());
  t.mock.method(globalThis, 'queueMicrotask', callback => scheduled.push(callback));
  assert.equal(typeof f.watch.setQuestionPending, 'function');
  f.watch.setQuestionPending(false);
  assert.deepEqual([f.snapshots.length, scheduled.length], [0, 0]);
  f.watch.setQuestionPending(true);
  f.watch.setQuestionPending(true);
  assert.deepEqual(f.snapshots.map(s => s.asking), [true]);
  assert.equal(scheduled.length, 0);
  await f.add(0);
  audio.resolve();
  await tick();
  assert.deepEqual(f.watch.snapshot().segments.map(s => [s.audioStatus, s.visionStatus]), [['ready', 'queued']]);
  assert.deepEqual(described, []);
  const published = f.snapshots.length;
  f.watch.setQuestionPending(false);
  f.watch.setQuestionPending(false);
  assert.equal(f.snapshots.length, published + 1);
  assert.equal(f.snapshots.at(-1).asking, false);
  assert.equal(scheduled.length, 1);
  assert.deepEqual(described, [], 'resumption is deferred');
  scheduled.shift()();
  await tick();
  assert.deepEqual(described, ['moment-1']);
  vision.resolve();
  await tick();
  assert.equal(f.watch.snapshot().segments[0].status, 'ready');
  assert.equal(Reflect.set(f.watch, 'asking', true), false, 'asking is a read-only view');
});

const publicationStages = [
  ['audio start', s => s.audioStatus === 'analyzing'],
  ['transcript', s => s.audioStatus === 'ready' && s.visionStatus === 'queued'],
  ['vision start', s => s.visionStatus === 'analyzing' && !s.stage],
  ['vision progress', s => s.stage === 'Description…'],
  ['vision completion', s => s.visionStatus === 'ready'],
];
for (const [stage, matches] of publicationStages) {
  test(`a failed ${stage} publication leaves perception results and losses intact`, async () => {
    const diagnostics = [];
    let attempts = 0;
    const f = fixture({ transcribe, observeVisual: async s => { s.onProgress('Description…'); return visual(s); } }, {
      onChange: state => {
        if (!state.segments[0] || !matches(state.segments[0])) return;
        attempts++;
        throw Error('observer failed');
      },
      onPublicationError: event => diagnostics.push(event),
    });
    await f.add(0);
    const state = f.watch.snapshot();
    assert.equal(state.segments[0].status, 'ready');
    assert.equal(state.segments[0].observation.transcript, 'Paroles moment-1');
    assert.equal(state.segments[0].observation.summary, 'Images moment-1');
    assert.deepEqual([state.coverage.audioError, state.coverage.visionError, state.lastError], [0, 0, null]);
    assert.ok(attempts > 0, `the ${stage} notification was attempted`);
    assert.equal(diagnostics.length, attempts);
    await f.watch.close();
  });
}

for (const lane of ['audio', 'vision']) {
  test(`a real ${lane} rejection keeps its own reason when every publication fails`, async () => {
    const diagnostics = [], refusal = Error(`provider refused ${lane}`);
    const f = fixture({
      transcribe: async s => { if (lane === 'audio') throw refusal; return transcribe(s); },
      observeVisual: async s => { s.onProgress('Description…'); if (lane === 'vision') throw refusal; return visual(s); },
    }, {
      onChange: () => { throw Error('observer failed'); },
      onPublicationError: event => diagnostics.push(event),
    });
    await f.add(0);
    const state = f.watch.snapshot(), passage = state.segments[0];
    assert.equal(passage.status, 'partial');
    assert.equal(passage[`${lane}Error`], refusal.message);
    assert.equal(state.lastError, refusal.message);
    assert.deepEqual([state.coverage.audioError, state.coverage.visionError], lane === 'audio' ? [1, 0] : [0, 1]);
    assert.deepEqual([state.analyzing, state.pending], [false, 0]);
    assert.ok(diagnostics.length > 0);
    assert.ok(diagnostics.every(event => event.code === 'TVLENS_STATE_PUBLICATION_FAILED' && event.error !== refusal));
    await f.watch.close();
  });
}

test('failed pause, resume and save outcome publications preserve their state and disk barriers', async () => {
  const diagnostics = [], saves = [], attempts = [];
  let gate = deferred(), refuse = true;
  const f = fixture({ transcribe, observeVisual: visual }, {
    onChange: state => { attempts.push(state); throw Error('observer failed'); },
    onPublicationError: event => diagnostics.push(event),
    archive: { save: async state => {
      saves.push(state);
      await gate.promise;
      if (refuse) throw Object.assign(Error('disk refused'), { code: 'EIO' });
    } },
  });
  let settled = false;
  const pausing = f.watch.stop().then(() => { settled = true; });
  assert.equal(f.watch.snapshot().accepting, false);
  assert.equal(settled, false);
  assert.equal(saves.length, 1);
  gate.resolve();
  await pausing;
  const saveError = f.watch.snapshot().lastError;
  assert.ok(saveError);
  assert.equal(attempts.at(-1).lastError, saveError);
  gate = deferred();
  refuse = false;
  settled = false;
  const resuming = f.watch.resume().then(() => { settled = true; });
  assert.equal(f.watch.snapshot().accepting, true);
  assert.equal(f.watch.snapshot().lastError, saveError);
  assert.equal(settled, false);
  assert.equal(saves.length, 2);
  gate.resolve();
  await resuming;
  assert.equal(f.watch.snapshot().lastError, null);
  assert.equal(attempts.at(-1).lastError, null);
  assert.equal(diagnostics.length, attempts.length);
  assert.equal(attempts.length, 4);
  await f.watch.close();
});

for (const brokenDiagnostic of [false, true]) {
  test(`failed publications preserve both perception lanes and persistence (diagnostic throws: ${brokenDiagnostic})`, async () => {
    const calls = [], saves = [], diagnostics = [];
    const refusal = Object.assign(Error('observateur indisponible'), { code: 'OBSERVER_FAILED' });
    let attempts = 0;
    const f = fixture({
      transcribe: async s => { calls.push(['audio', s.id]); return transcribe(s); },
      observeVisual: async s => { calls.push(['vision', s.id]); s.onProgress('Description…'); return visual(s); },
    }, {
      onChange: () => { attempts++; throw refusal; },
      onPublicationError: event => {
        diagnostics.push(event);
        if (brokenDiagnostic) throw Error('journal indisponible');
      },
      archive: { save: async state => saves.push(structuredClone(state)) },
    });
    await assert.doesNotReject(f.add(0));
    await assert.doesNotReject(f.add(1));
    await until(() => saves.some(state => state.segments.length === 2 && state.segments.every(s => s.status === 'ready')),
      'both passages saved after failed notifications');
    const state = f.watch.snapshot();
    assert.deepEqual(calls, [['audio', 'moment-1'], ['vision', 'moment-1'], ['audio', 'moment-2'], ['vision', 'moment-2']]);
    assert.deepEqual(state.segments.map(s => [s.audioStatus, s.visionStatus, s.observation.transcript, s.observation.summary]), [
      ['ready', 'ready', 'Paroles moment-1', 'Images moment-1'],
      ['ready', 'ready', 'Paroles moment-2', 'Images moment-2'],
    ]);
    assert.deepEqual([state.analyzing, state.pending, state.audioPending, state.visionPending], [false, 0, 0, 0]);
    assert.deepEqual([state.coverage.audioError, state.coverage.visionError, state.lastError], [0, 0, null]);
    assert.ok(attempts > 0);
    assert.equal(diagnostics.length, attempts);
    assert.ok(diagnostics.every(event => event.code === 'TVLENS_STATE_PUBLICATION_FAILED'
      && event.origin === 'watch-session' && event.sessionId === 's' && event.error === refusal));
    await f.watch.close();
  });
}
test('speech is published and next audio processed during blocked vision; context is frozen and labelled partial', async () => {
  const gate = deferred(), seen = [];
  const f = fixture({ transcribe, observeVisual: async s => { seen.push(s.id); await gate.promise; return visual(s); } });
  await f.add(0); await f.add(1);
  assert.deepEqual(seen, ['moment-1']);
  assert.deepEqual(f.watch.segments.map(s => s.audioStatus), ['ready', 'ready']);
  const tools = new VideoTools({ consultation: consultationOf(f.watch.memoryView()) });
  assert.equal(tools.context().passages.length, 2);
  assert.equal(tools.context().passages[0].precision, 'partial-observation');
  assert.equal(tools.context().analyzedThroughMs, 0);
  assert.equal(tools.context().contextThroughMs, 2000);
  const speech = await tools.call('get_transcript', { startMs: 0, endMs: 2000 });
  assert.equal(speech.passages[1].transcript, 'Paroles moment-2');
  gate.resolve(); await tick();
  assert.deepEqual(f.watch.segments.map(s => [s.id,s.startMs,s.endMs,s.status]), [['moment-1',0,1000,'ready'],['moment-2',1000,2000,'ready']]);
  assert.equal(f.watch.segments[0].observation.transcript, 'Paroles moment-1');
  assert.equal(f.watch.segments[0].audioMs, 10); assert.equal(f.watch.segments[0].visionMs, 20);
  assert.equal(tools.context().passages[0].visionStatus, 'analyzing');
});
test('audio and vision fail independently, keeping usable evidence and terminal partial timeline', async () => {
  const f = fixture({ transcribe: async s => { if (s.id === 'moment-1') throw Error('speech failed'); return transcribe(s); },
    observeVisual: async s => { if (s.id === 'moment-2') throw Error('vision failed'); return visual(s); } });
  await f.add(0); await f.add(1);
  assert.equal(f.watch.segments[0].visionStatus, 'ready');
  assert.equal(f.watch.segments[0].audioError, 'speech failed');
  assert.equal(f.watch.segments[1].observation.transcript, 'Paroles moment-2');
  assert.equal(f.watch.segments[1].visionError, 'vision failed');
  assert.deepEqual(sessionTimeline(f.watch.memoryView()).cards.map(c => [c.status,c.pending]), [['partial',0],['partial',0]]);
});
test('both lane backlogs are bounded and skipped vision keeps speech', async () => {
  const audioGate = deferred(), visionGate = deferred(); let activeAudio = 0, activeVision = 0, maxAudio = 0, maxVision = 0;
  const f = fixture({ transcribe: async s => { maxAudio = Math.max(maxAudio, ++activeAudio); await audioGate.promise; activeAudio--; return transcribe(s); },
    observeVisual: async s => { maxVision = Math.max(maxVision, ++activeVision); await visionGate.promise; activeVision--; return visual(s); } });
  for (let i = 0; i < 5; i++) await f.add(i);
  // Overload sheds transcriptions only: two wait for Whisper, the two older ones wait to hand their images over.
  assert.equal(f.watch.snapshot().segments.filter(s => s.status === 'queued' && s.audioStatus !== 'skipped').length, 2);
  assert.deepEqual(f.watch.segments.filter(s => s.audioStatus === 'skipped').map(s => s.id), ['moment-2', 'moment-3']);
  assert.equal(f.watch.losses.audioSkipped, 2);
  audioGate.resolve(); await tick();
  for (let i = 5; i < 9; i++) await f.add(i);
  assert.equal(f.watch.snapshot().visionPending, 2);
  const skipped = f.watch.segments.filter(s => s.visionStatus === 'skipped');
  assert.ok(skipped.length > 0);
  assert.ok(skipped.filter(s => s.audioStatus === 'ready').every(s => s.status === 'partial' && s.observation.transcript));
  assert.ok(skipped.filter(s => s.audioStatus === 'skipped').every(s => s.status === 'skipped' && !s.observation));
  visionGate.resolve(); await tick();
  assert.equal(maxAudio, 1); assert.equal(maxVision, 1);
});
test('manual question blocks new vision but lets audio progress; close prevents late publication', async () => {
  const gate = deferred(); let visions = 0, signal;
  const f = fixture({ transcribe, observeVisual: async s => { visions++; signal = s.signal; await gate.promise; return visual(s); } });
  f.watch.setQuestionPending(true); await f.add(0);
  assert.equal(visions, 0); assert.equal(f.watch.segments[0].audioStatus, 'ready');
  f.watch.setQuestionPending(false); await tick();
  await f.watch.stop(); await f.watch.resume();
  assert.equal(f.watch.segments[0].observation.transcript, 'Paroles moment-1');
  await f.watch.close(); const count = f.snapshots.length;
  gate.resolve(); await tick(); assert.equal(signal.aborted, true);
  assert.equal(f.snapshots.length, count); assert.equal(f.watch.segments[0].observation.summary, undefined);
});
test('completed speech and active enrichment survive a long pause and later ingestion with queued vision', async t => {
  const gate = deferred();
  const f = fixture({ transcribe, observeVisual: async s => { await gate.promise; return visual(s); } }, { retentionMs: 1000 });
  t.after(() => f.watch.close());
  await f.add(0);
  await f.add(1);
  await f.watch.stop();
  f.setTime(7200000);
  await f.watch.resume();
  await f.add(7200);
  const before = f.watch.memoryView();
  assert.deepEqual(before.passages.map(p => [p.id, p.observation.transcript, p.availability.replayable]), [
    ['moment-1', 'Paroles moment-1', true], ['moment-2', 'Paroles moment-2', true], ['moment-3', 'Paroles moment-3', true],
  ]);
  assert.deepEqual(before.passages.map(p => p.visionStatus), ['analyzing', 'queued', 'queued']);
  gate.resolve();
  await tick();
  const after = f.watch.memoryView();
  assert.deepEqual(after.passages.map(p => [p.id, p.origin, p.status, p.observation.summary]), [
    ['moment-1', 'retained', 'ready', 'Images moment-1'],
    ['moment-2', 'retained', 'ready', 'Images moment-2'],
    ['moment-3', 'retained', 'ready', 'Images moment-3'],
  ]);
  assert.deepEqual([after.losses.audioExpired, after.losses.visionExpired], [0, 0]);
});

test('Codex split port sends existing transcript to vision without retranscription and observe remains compatible', async () => {
  let calls = 0, instructions;
  const perception = new CodexPerception({ transcriber: { transcribe: async () => { calls++; return { text: 'Bonjour', limits: [], cacheHit: true }; } },
    agent: { answer: async input => { instructions = input.instructions; return { topic: 'Sujet', summary: 'Résumé', visual: 'Image', uncertainty: '' }; } } });
  const segment = { startMs: 0, endMs: 1000, frames: [], audio: new Uint8Array([1]) };
  const audio = await perception.transcribe(segment);
  const vision = await perception.observeVisual({ ...segment, observation: audio.observation });
  assert.equal(calls, 1); assert.match(instructions, /Bonjour/); assert.equal(vision.observation.transcript, 'Bonjour');
  const combined = await perception.observe(segment);
  assert.equal(calls, 2); assert.equal(combined.metrics.audioCacheHit, true);
});
test('successful later passage clears the old session error without deleting passage failure evidence', async () => {
  const f = fixture({ transcribe, observeVisual: async s => { if (s.id === 'moment-1') throw Error('old vision failure'); return visual(s); } });
  await f.add(0); assert.equal(f.watch.lastError, 'old vision failure');
  await f.add(1); assert.equal(f.watch.lastError, null);
  assert.equal(f.watch.segments[0].visionError, 'old vision failure');
});
test('vision success cannot clear concurrent newer audio failure or its own partial audio error', async () => {
  const gate = deferred();
  const f = fixture({ transcribe: async s => { if (s.id === 'moment-2') throw Error('new audio failure'); return transcribe(s); },
    observeVisual: async s => { await gate.promise; return visual(s); } });
  await f.add(0); await f.add(1); f.watch.setQuestionPending(true);
  gate.resolve(); await tick();
  assert.equal(f.watch.segments[0].status, 'ready'); assert.equal(f.watch.lastError, 'new audio failure');
  f.watch.setQuestionPending(false); await tick();
  assert.equal(f.watch.segments[1].status, 'partial'); assert.equal(f.watch.lastError, 'new audio failure');
  await f.add(2); assert.equal(f.watch.lastError, null);
  assert.equal(f.watch.segments[1].audioError, 'new audio failure');
});
test('a historical expired placeholder never becomes evidence or a citation', async () => {
  const f = fixture({ transcribe, observeVisual: visual });
  // Archive synthétique de l’ancien cas : audio vide réussi, vision expirée avant son départ.
  f.watch.restore({ id: 's', retention: 'rolling', retentionMs: 1000, segments: [], history: [{
    id: 'moment-1', startMs: 0, endMs: 1000, status: 'expired', audioStatus: 'ready', visionStatus: 'expired',
    summary: 'Passage non analysé.', observation: { transcript: '' }, mediaReason: 'expired',
  }] });
  f.setTime(5000);
  const tools = new VideoTools({ consultation: consultationOf(f.watch.memoryView()) });
  assert.deepEqual(tools.context().passages, []);
  assert.equal(tools.context().contextThroughMs, 0);
  assert.equal(f.watch.snapshot().contextThroughMs, 0);
  await tools.call('get_transcript', { startMs: 0, endMs: 1000 });
  assert.deepEqual(tools.memoryEvidence, []);
  assert.deepEqual(tools.transcriptEvidence, []);
  await f.watch.close();
});

test('shared session supplies historical context at vision dispatch, after pause and without future audio leakage', async () => {
  const seen=[];
  const f=fixture({transcribe,observeVisual:async s=>{seen.push(s.context);return {observation:{summary:s.id,topic:'Débat'},elapsedMs:1};}});
  await f.add(0); await f.watch.stop(); await f.watch.resume(); await f.add(1);
  assert.equal(seen[0].recent.length,0);
  assert.equal(seen[1].previousTopic,'Débat');
  assert.deepEqual(seen[1].recent.map(p=>p.id),['moment-1']);
  assert.equal(seen[1].recent[0].transcript,'Paroles moment-1');
  await f.watch.close();
});
