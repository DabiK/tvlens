const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WatchSession } = require('../core/session.cjs');
const { VideoTools } = require('../core/video-tools.cjs');
const { sessionTimeline } = require('../core/session-timeline.cjs');
const { CodexPerception } = require('../adapters/codex-perception.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
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
test('speech is published and next audio processed during blocked vision; context is frozen and labelled partial', async () => {
  const gate = deferred(), seen = [];
  const f = fixture({ transcribe, observeVisual: async s => { seen.push(s.id); await gate.promise; return visual(s); } });
  await f.add(0); await f.add(1);
  assert.deepEqual(seen, ['moment-1']);
  assert.deepEqual(f.watch.segments.map(s => s.audioStatus), ['ready', 'ready']);
  const tools = new VideoTools({ snapshot: f.watch.snapshot() });
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
  assert.deepEqual(sessionTimeline(f.watch.snapshot()).cards.map(c => [c.status,c.pending]), [['partial',0],['partial',0]]);
});
test('both lane backlogs are bounded and skipped vision keeps speech', async () => {
  const audioGate = deferred(), visionGate = deferred(); let activeAudio = 0, activeVision = 0, maxAudio = 0, maxVision = 0;
  const f = fixture({ transcribe: async s => { maxAudio = Math.max(maxAudio, ++activeAudio); await audioGate.promise; activeAudio--; return transcribe(s); },
    observeVisual: async s => { maxVision = Math.max(maxVision, ++activeVision); await visionGate.promise; activeVision--; return visual(s); } });
  for (let i = 0; i < 5; i++) await f.add(i);
  assert.equal(f.watch.queue.length, 2);
  assert.equal(f.watch.segments.filter(s => s.status === 'skipped').length, 2);
  audioGate.resolve(); await tick();
  for (let i = 5; i < 9; i++) await f.add(i);
  assert.equal(f.watch.visionQueue.length, 2);
  const skipped = f.watch.segments.filter(s => s.visionStatus === 'skipped');
  assert.ok(skipped.length > 0); assert.ok(skipped.every(s => s.status === 'partial' && s.observation.transcript));
  visionGate.resolve(); await tick();
  assert.equal(maxAudio, 1); assert.equal(maxVision, 1);
});
test('manual question blocks new vision but lets audio progress; close prevents late publication', async () => {
  const gate = deferred(); let visions = 0, signal;
  const f = fixture({ transcribe, observeVisual: async s => { visions++; signal = s.signal; await gate.promise; return visual(s); } });
  f.watch.asking = true; await f.add(0);
  assert.equal(visions, 0); assert.equal(f.watch.segments[0].audioStatus, 'ready');
  f.watch.asking = false; f.watch.drain(); await tick();
  await f.watch.stop(); await f.watch.resume();
  assert.equal(f.watch.segments[0].observation.transcript, 'Paroles moment-1');
  await f.watch.close(); const count = f.snapshots.length;
  gate.resolve(); await tick(); assert.equal(signal.aborted, true);
  assert.equal(f.snapshots.length, count); assert.equal(f.watch.segments[0].observation.summary, undefined);
});
test('retention preserves completed speech while expiring queued vision and does not lose active enrichment', async () => {
  const gate = deferred(); const f = fixture({ transcribe, observeVisual: async s => { await gate.promise; return visual(s); } }, { retentionMs: 1000 });
  await f.add(0); await f.add(1); f.setTime(5000); await f.watch.prune();
  assert.equal(f.watch.visionQueue.length, 0); assert.equal(f.watch.segments[1].visionStatus, 'expired');
  gate.resolve(); await tick(); await f.watch.prune();
  assert.equal(f.watch.history.length, 2);
  assert.equal(f.watch.history[0].observation.summary, 'Images moment-1');
  assert.equal(f.watch.history[1].observation.transcript, 'Paroles moment-2');
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
  await f.add(0); await f.add(1); f.watch.asking = true;
  gate.resolve(); await tick();
  assert.equal(f.watch.segments[0].status, 'ready'); assert.equal(f.watch.lastError, 'new audio failure');
  f.watch.asking = false; f.watch.drain(); await tick();
  assert.equal(f.watch.segments[1].status, 'partial'); assert.equal(f.watch.lastError, 'new audio failure');
  await f.add(2); assert.equal(f.watch.lastError, null);
  assert.equal(f.watch.segments[1].audioError, 'new audio failure');
});
test('empty successful audio and expired queued vision never turn the archived placeholder into evidence', async () => {
  const f = fixture({ transcribe: async () => ({ observation: { transcript: '' } }), observeVisual: visual }, { retentionMs: 1000 });
  f.watch.asking = true; await f.add(0);
  assert.equal(f.watch.segments[0].audioStatus, 'ready');
  f.setTime(5000); await f.watch.prune();
  assert.equal(f.watch.history[0].summary, 'Passage non analysé.');
  assert.equal(f.watch.history[0].status, 'expired');
  const tools = new VideoTools({ snapshot: f.watch.snapshot() });
  assert.deepEqual(tools.context().passages, []);
  assert.equal(tools.context().contextThroughMs, 0);
  assert.equal(f.watch.snapshot().contextThroughMs, 0);
  await tools.call('get_transcript', { startMs: 0, endMs: 1000 });
  assert.deepEqual(tools.memoryEvidence, []); assert.deepEqual(tools.transcriptEvidence, []);
});
