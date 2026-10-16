const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WatchSession } = require('../core/session.cjs');
const { passageLatency, latencySummary } = require('../core/latency-trace.cjs');
const { tick, deferred } = require('./helpers/wait.cjs');
// One gate per passage: the test decides when each lane call or media write returns.
const gates = () => { const map = new Map(); return id => map.get(id) || map.set(id, deferred()).get(id); };
function fixture(perception, options = {}) {
  let time = 0;
  const files = new Map(), snapshots = [];
  const media = { put: async (id, s) => files.set(id, s), read: async id => { if (!files.has(id)) throw Error('expired'); return files.get(id); }, remove: async id => files.delete(id) };
  const watch = new WatchSession({ id: 's', now: () => time, perception, media, archive: { save: async () => {} }, onChange: s => snapshots.push(s), ...options });
  const block = (i, extra) => ({ startMs: i * 1000, endMs: (i + 1) * 1000, audio: new Uint8Array([i]), frames: [], ...extra });
  return { watch, files, media, snapshots, block, setTime: t => { time = t; },
    add: async (i, extra) => { time = Math.max(time, (i + 1) * 1000); const id = await watch.ingest(block(i, extra)); await tick(); return id; } };
}
const transcribe = async s => ({ observation: { transcript: `Paroles ${s.id}` }, elapsedMs: 10 });
const visual = async s => ({ observation: { summary: `Images ${s.id}`, visual: 'Image' }, elapsedMs: 20 });
const stamps = ['receivedMs', 'audioStartedMs', 'transcriptPublishedMs', 'visionQueuedMs', 'visionStartedMs', 'visionPublishedMs'];

test('timeline stamps are ordered on the session clock and survive archival with the revision, without per-call metrics', async () => {
  const audio = gates(), vision = gates();
  const f = fixture({ transcribe: async s => { await audio(s.id).promise; return { observation: { transcript: `Paroles ${s.id}` }, elapsedMs: 300, metrics: { whisper: { threads: 4 } } }; },
    observeVisual: async s => { await vision(s.id).promise; return { observation: { summary: `Images ${s.id}`, visual: 'Image' }, elapsedMs: 700, metrics: { frames: 3 } }; } }, { retentionMs: 5000 });
  await f.add(0); await f.add(1, { ingest: { assembleMs: 150, transport: 'ignored' } });
  const [first, second] = f.watch.segments;
  assert.deepEqual(second.ingest, { assembleMs: 150 });
  assert.equal(second.receivedMs, 2000); assert.equal(second.audioStartedMs, undefined);
  f.setTime(2400); audio('moment-1').resolve(); await tick();
  f.setTime(2600); audio('moment-2').resolve(); await tick();
  f.setTime(3100); vision('moment-1').resolve(); await tick();
  f.setTime(3500); vision('moment-2').resolve(); await tick();
  assert.deepEqual(stamps.map(k => first[k]), [1000, 1000, 2400, 2400, 2400, 3100]);
  assert.deepEqual(stamps.map(k => second[k]), [2000, 2400, 2600, 2600, 3100, 3500]);
  for (const p of [first, second]) assert.deepEqual(stamps.map(k => p[k]), stamps.map(k => p[k]).sort((a, b) => a - b));
  assert.deepEqual(passageLatency(second), { blockMs: 1000, arrivalMs: 0, audioWaitMs: 400, audioMs: 300, visionWaitMs: 500, visionMs: 700, transcriptAfterCloseMs: 600, readyAfterCloseMs: 1500 });
  assert.deepEqual(f.watch.snapshot().latency.audioWaitMs, { n: 2, mean: 200, max: 400 });
  f.setTime(20000); await f.watch.prune();
  assert.equal(f.watch.segments.length, 0);
  const archived = f.watch.history[1];
  assert.deepEqual(stamps.map(k => archived[k]), [2000, 2400, 2600, 2600, 3100, 3500]);
  assert.equal(archived.revision, 2); assert.deepEqual(archived.ingest, { assembleMs: 150 });
  assert.equal(second.analysisMs, 1000); assert.deepEqual(second.metrics, { whisper: { threads: 4 }, frames: 3 });
  assert.equal(archived.metrics, undefined, 'the archive is sent at every state poll: it keeps numbers, not diagnostics');
  assert.equal(archived.audioMs, 300); assert.equal(archived.visionMs, 700); assert.equal(archived.status, 'ready');
  assert.deepEqual(f.watch.snapshot().latency.readyAfterCloseMs, { n: 2, mean: 1800, max: 2100 });
});
test('ingest metadata keeps only a finite, non-negative assembleMs from a plain object', async () => {
  const f = fixture({ transcribe, observeVisual: visual });
  const cases = [[{ assembleMs: 0 }, { assembleMs: 0 }], [{ assembleMs: -5 }], [{ assembleMs: '12' }], [{ assembleMs: Infinity }], ['12'], [Object.assign([1], { assembleMs: 4 })], [null], [undefined]];
  for (const [i, [ingest]] of cases.entries()) await f.add(i, { ingest });
  assert.deepEqual(f.watch.segments.map(s => s.ingest), cases.map(([, kept]) => kept));
});
test('revision counts published evidence: transcript, then vision; a failed vision adds nothing', async () => {
  const audio = gates(), vision = gates();
  const f = fixture({ transcribe: async s => { await audio(s.id).promise; return transcribe(s); },
    observeVisual: async s => { await vision(s.id).promise; if (s.id === 'moment-2') throw Error('vision failed'); return visual(s); } });
  await f.add(0); const [first] = f.watch.segments;
  assert.equal(first.revision, 0);
  audio('moment-1').resolve(); await tick(); assert.equal(first.revision, 1); assert.equal(first.status, 'partial');
  vision('moment-1').resolve(); await tick(); assert.equal(first.revision, 2); assert.equal(first.status, 'ready');
  audio('moment-2').resolve(); vision('moment-2').resolve(); await f.add(1);
  const second = f.watch.segments[1];
  assert.equal(second.visionStatus, 'error'); assert.equal(second.revision, 1); assert.equal(second.visionPublishedMs, undefined);
  assert.equal(f.watch.losses.visionError, 1);
  assert.deepEqual(f.snapshots.at(-1).segments.map(s => s.revision), [2, 1]);
  const legacy = fixture({ observe: async () => ({ observation: { summary: 'Image' } }) });
  await legacy.add(0); assert.equal(legacy.watch.segments[0].revision, 1);
});
test('a transcription reporting its own failure is counted and flagged, and a host without Whisper still gets complete visual passages', async () => {
  const gate = deferred();
  // An explicit rolling window: by default media are kept until deletion and nothing is ever archived to history.
  const f = fixture({ transcribe: async () => ({ failed: true, observation: { transcript: '', audio: 'Paroles indisponibles.' }, elapsedMs: 40, metrics: { whisper: { failed: true } } }),
    observeVisual: async s => { await gate.promise; return visual(s); } }, { retentionMs: 300000 });
  await f.add(0); const [p] = f.watch.segments;
  assert.equal(p.audioFailed, true); assert.equal(f.watch.losses.audioError, 1);
  assert.equal(p.observation.transcript, '', 'no words are invented');
  assert.equal(p.audioMs, 40); assert.deepEqual(p.metrics, { whisper: { failed: true } });
  // Statuses stay what they were before the failure was counted: the living recap, Auto and the
  // analysed-through counters only accept `ready` passages, and must keep working on images alone.
  assert.equal(p.audioStatus, 'ready'); assert.equal(p.visionStatus, 'analyzing');
  gate.resolve(); await tick();
  assert.deepEqual([p.status, p.visionStatus, p.observation.summary], ['ready', 'ready', 'Images moment-1']);
  const state = f.watch.snapshot();
  assert.equal(state.analyzedThroughMs, 1000);
  assert.deepEqual(state.audioGaps, [{ id: 'moment-1', startMs: 0, endMs: 1000, audioStatus: 'failed' }], 'the missing speech is listed, not hidden');
  assert.deepEqual(state.gaps, []);
  f.setTime(400000); await f.watch.prune();
  assert.equal(f.watch.history[0].audioFailed, true, 'the flag survives archival');
  assert.equal(f.watch.snapshot().audioGaps.length, 1);
});

test('a skip while a vision call is in flight is a backlog even during a question; spoken passages stay out of gaps', async () => {
  const gate = deferred();
  const f = fixture({ transcribe, observeVisual: async s => { await gate.promise; return visual(s); } });
  for (let i = 0; i < 4; i++) await f.add(i);
  f.watch.setQuestionPending(true); await f.add(4);
  assert.deepEqual(f.watch.segments.map(s => [s.status, s.visionStatus, s.visionSkipReason]),
    [['partial', 'analyzing', undefined], ['partial', 'skipped', 'backlog'], ['partial', 'skipped', 'backlog'], ['partial', 'queued', undefined], ['partial', 'queued', undefined]]);
  const state = f.watch.snapshot();
  assert.deepEqual(state.visionGaps, [{ id: 'moment-2', startMs: 1000, endMs: 2000, visionStatus: 'skipped', reason: 'backlog' }, { id: 'moment-3', startMs: 2000, endMs: 3000, visionStatus: 'skipped', reason: 'backlog' }]);
  assert.deepEqual(state.gaps, []);
  // The question holds nothing here: the lane is busy, so it is not charged with the loss.
  assert.deepEqual(state.coverage, { passages: 5, audioSkipped: 0, audioExpired: 0, visionSkippedBacklog: 2, visionSkippedAsking: 0, visionExpired: 0, audioError: 0, visionError: 0, visionBlockedMs: 0 });
  assert.equal(f.watch.segments[1].observation.transcript, 'Paroles moment-2');
  gate.resolve(); f.watch.setQuestionPending(false); await tick();
  assert.deepEqual(f.watch.segments.map(s => s.status), ['ready', 'partial', 'partial', 'ready', 'ready']);
  assert.equal(f.watch.snapshot().visionGaps.length, 2);
});
test('audio drops, audio errors and expired vision are counted where they happen and reach history', async () => {
  const gate = deferred();
  const f = fixture({ transcribe: async s => { await gate.promise; if (s.id === 'moment-1') throw Error('speech failed'); return transcribe(s); }, observeVisual: visual }, { retentionMs: 3000 });
  f.watch.setQuestionPending(true);
  for (let i = 0; i < 4; i++) await f.add(i);
  assert.equal(f.watch.losses.audioSkipped, 1); assert.equal(f.watch.segments[1].audioStatus, 'skipped');
  gate.resolve(); await tick();
  f.setTime(6500); await f.watch.prune();
  assert.deepEqual(f.watch.history.map(s => [s.id, s.status, s.visionStatus, s.visionSkipReason]),
    [['moment-1', 'skipped', 'skipped', 'asking'], ['moment-2', 'skipped', 'skipped', 'asking'], ['moment-3', 'partial', 'expired', undefined]]);
  const state = f.watch.snapshot();
  assert.deepEqual(state.visionGaps, [{ id: 'moment-3', startMs: 2000, endMs: 3000, visionStatus: 'expired' }]);
  assert.deepEqual(state.gaps.map(g => [g.id, g.status]), [['moment-1', 'skipped'], ['moment-2', 'skipped']]);
  assert.deepEqual(state.coverage, { passages: 4, audioSkipped: 1, audioExpired: 0, visionSkippedBacklog: 0, visionSkippedAsking: 2, visionExpired: 1, audioError: 1, visionError: 0, visionBlockedMs: 2500 });
});

test('a passage whose transcription is shed is still described, in observation order, and listed as an audio gap', async () => {
  const gate = deferred(), described = [];
  const f = fixture({ transcribe: async s => { if (s.id === 'moment-1') await gate.promise; return transcribe(s); },
    observeVisual: async s => { described.push([s.id, s.observation?.transcript || null]); return visual(s); } });
  for (let i = 0; i < 4; i++) await f.add(i);
  assert.equal(f.watch.segments[1].audioStatus, 'skipped');
  assert.equal(f.watch.segments[1].status, 'queued', 'it keeps its place behind the passage being transcribed');
  assert.deepEqual(described, [], 'its images do not jump ahead of an older passage');
  gate.resolve(); await tick(); await tick();
  assert.deepEqual(described, [['moment-1', 'Paroles moment-1'], ['moment-2', null], ['moment-3', 'Paroles moment-3'], ['moment-4', 'Paroles moment-4']]);
  const shed = f.watch.segments[1];
  assert.deepEqual([shed.status, shed.audioStatus, shed.visionStatus, shed.observation.summary], ['partial', 'skipped', 'ready', 'Images moment-2']);
  assert.equal(shed.observation.transcript, undefined);
  const state = f.watch.snapshot();
  assert.deepEqual(state.audioGaps, [{ id: 'moment-2', startMs: 1000, endMs: 2000, audioStatus: 'skipped' }]);
  assert.deepEqual(state.gaps, [], 'a described passage is not a total gap');
  assert.equal(state.coverage.audioSkipped, 1);
});

test('the audio lane stays bounded when Whisper stalls: beyond it the oldest passage is dropped whole and counted', async () => {
  const gate = deferred();
  const f = fixture({ transcribe: async s => { await gate.promise; return transcribe(s); }, observeVisual: visual });
  for (let i = 0; i < 9; i++) await f.add(i);
  assert.equal(f.watch.queue.length, 6);
  assert.deepEqual(f.watch.segments.filter(s => s.status === 'skipped').map(s => [s.id, s.visionStatus, s.visionSkipReason]), [['moment-2', 'skipped', 'backlog'], ['moment-3', 'skipped', 'backlog']]);
  assert.deepEqual([f.watch.losses.audioSkipped, f.watch.losses.visionSkippedBacklog], [6, 2]);
  gate.resolve(); await tick();
});
test('visionBlockedMs only accumulates while a question alone holds queued vision', async () => {
  const vision = gates();
  const f = fixture({ transcribe, observeVisual: async s => { await vision(s.id).promise; return visual(s); } });
  const blocked = () => f.watch.snapshot().coverage.visionBlockedMs;
  f.watch.setQuestionPending(true); await f.add(0);
  assert.equal(blocked(), 0); f.setTime(3000); assert.equal(blocked(), 2000);
  // The question ends at 3000: nothing is charged afterwards, even before the next drain.
  f.watch.setQuestionPending(false); f.setTime(5000);
  assert.equal(blocked(), 2000); assert.equal(f.watch.visionBlockedMs, 2000);
  await tick();
  assert.equal(f.watch.segments[0].visionStartedMs, 5000);
  // Queued behind the call in flight, not behind the question.
  f.watch.setQuestionPending(true); await f.add(5); f.setTime(7000);
  assert.equal(f.watch.visionQueue.length, 1); assert.equal(blocked(), 2000);
  vision('moment-1').resolve(); await tick();
  f.setTime(7500); assert.equal(blocked(), 2500);
  f.watch.setQuestionPending(false); await tick();
  f.setTime(9000); assert.equal(blocked(), 2500);
  assert.equal(f.watch.segments[1].visionStartedMs, 7500); assert.equal(passageLatency(f.watch.segments[1]).visionWaitMs, 1500);
  vision('moment-2').resolve(); await tick();
  assert.equal(f.watch.segments[1].status, 'ready'); assert.equal(blocked(), 2500);
});

test('a question released during ending stops charging held vision without publishing or scheduling work', async t => {
  const audio = deferred(), scheduled = [], saves = [];
  let descriptions = 0;
  const f = fixture({
    transcribe: async s => { await audio.promise; return transcribe(s); },
    observeVisual: async s => { descriptions++; return visual(s); },
  }, { archive: { save: async state => saves.push(state) } });
  t.after(() => f.watch.close());
  f.watch.setQuestionPending(true);
  await f.add(0);
  audio.resolve();
  await tick();
  assert.deepEqual(f.watch.snapshot().segments.map(s => [s.audioStatus, s.visionStatus]), [['ready', 'queued']]);
  f.setTime(3000);
  f.watch.beginEnding();
  const published = f.snapshots.length;
  t.mock.method(globalThis, 'queueMicrotask', callback => scheduled.push(callback));
  f.setTime(3500);
  f.watch.setQuestionPending(false);
  f.setTime(9000);
  await tick();
  const state = f.watch.snapshot();
  assert.equal(state.coverage.visionBlockedMs, 2500, 'teardown time after question release is not charged');
  assert.equal(state.asking, false);
  assert.deepEqual([f.snapshots.length, scheduled.length, descriptions], [published, 0, 0]);
  await f.watch.close();
  assert.equal(saves.at(-1).coverage.visionBlockedMs, 2500, 'the archive keeps the release-time duration');
});

test('the hold ends when the held queue empties by expiry and when the session closes', async () => {
  const f = fixture({ transcribe, observeVisual: visual }, { retentionMs: 1000 });
  f.watch.setQuestionPending(true); await f.add(0);
  f.setTime(2500); await f.watch.prune();
  f.setTime(9000);
  assert.equal(f.watch.snapshot().coverage.visionBlockedMs, 1500); assert.equal(f.watch.losses.visionExpired, 1);
  const g = fixture({ transcribe, observeVisual: visual });
  g.watch.setQuestionPending(true); await g.add(0);
  g.setTime(1800); await g.watch.close(); g.setTime(5000);
  assert.equal(g.watch.snapshot().coverage.visionBlockedMs, 800);
  // A vision call that starts while the question is still running is no longer charged to the gate.
  const gate = deferred(), h = fixture({ transcribe, observeVisual: async s => { await gate.promise; return visual(s); } });
  h.watch.setQuestionPending(true); await h.add(0);
  h.setTime(1600); h.watch.visionDuringAsk = true; h.watch.drain(); await tick();
  h.setTime(4000);
  assert.equal(h.watch.segments[0].visionStartedMs, 1600); assert.equal(h.watch.snapshot().coverage.visionBlockedMs, 600);
  gate.resolve(); await tick();
});
test('visionDuringAsk lets vision run during a question, still one call at a time on a bounded queue', async () => {
  const gate = deferred(); let active = 0, max = 0, started = 0;
  const f = fixture({ transcribe, observeVisual: async s => { started++; max = Math.max(max, ++active); await gate.promise; active--; return visual(s); } }, { visionDuringAsk: true });
  f.watch.setQuestionPending(true);
  for (let i = 0; i < 5; i++) await f.add(i);
  assert.equal(started, 1); assert.equal(f.watch.segments[0].visionStatus, 'analyzing');
  assert.equal(f.watch.visionQueue.length, 2);
  assert.deepEqual(f.watch.segments.filter(s => s.visionStatus === 'skipped').map(s => [s.id, s.visionSkipReason]), [['moment-2', 'backlog'], ['moment-3', 'backlog']]);
  const { coverage } = f.watch.snapshot();
  assert.equal(coverage.visionSkippedBacklog, 2); assert.equal(coverage.visionSkippedAsking, 0); assert.equal(coverage.visionBlockedMs, 0);
  gate.resolve(); await tick();
  assert.equal(max, 1); assert.equal(started, 3); assert.equal(f.watch.asking, true);
  assert.deepEqual(f.watch.segments.map(s => s.status), ['ready', 'partial', 'partial', 'ready', 'ready']);
  // The legacy single lane keeps its barrier.
  let observed = 0;
  const legacy = fixture({ observe: async () => { observed++; return { observation: { summary: 'Image' } }; } }, { visionDuringAsk: true });
  legacy.watch.setQuestionPending(true); await legacy.add(0);
  assert.equal(observed, 0); assert.equal(legacy.watch.segments[0].status, 'queued');
});
test('a failed media removal or publication never poisons later prunes and ingests', async () => {
  const f = fixture({ transcribe, observeVisual: visual }, { retentionMs: 1000 });
  await f.add(0); await f.add(1);
  const remove = f.media.remove; let attempts = 0;
  f.media.remove = async id => { if (!attempts++) throw Error('EPERM /private/path'); return remove(id); };
  f.setTime(10000); await f.watch.prune();
  assert.equal(attempts, 2); assert.equal(f.files.has('moment-1'), true); assert.equal(f.files.has('moment-2'), false);
  assert.deepEqual(f.watch.history.map(s => s.id), ['moment-1', 'moment-2']);
  assert.match(f.watch.lastError, /média expiré/); assert.doesNotMatch(f.watch.lastError, /private/);
  assert.equal(await f.add(10), 'moment-3'); await f.watch.prune();
  // The removal is tried again at the next sweep: no raw media stays beyond the rolling window.
  assert.equal(attempts, 3); assert.equal(f.files.has('moment-1'), false); assert.equal(f.watch.segments[0].status, 'ready');
  let boom = true;
  const diagnostics = [], refusal = Object.assign(Error('observer failed'), { code: 'OBSERVER_FAILED' });
  f.watch.onChange = () => { if (boom) { boom = false; throw refusal; } };
  f.watch.onPublicationError = event => diagnostics.push(event);
  await assert.doesNotReject(f.watch.prune());
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'TVLENS_STATE_PUBLICATION_FAILED');
  assert.equal(diagnostics[0].origin, 'watch-session');
  assert.equal(diagnostics[0].sessionId, 's');
  assert.equal(diagnostics[0].error, refusal);
  await f.watch.prune(); assert.equal(await f.add(11), 'moment-4');
});
test('overlapping ingests are admitted in call order; a rejected one does not block the next', async () => {
  const put = gates(), started = [];
  const f = fixture({ transcribe, observeVisual: visual });
  const store = f.media.put;
  f.media.put = async (id, s) => { started.push(id); await put(id).promise; if (s.fail) throw Error('disk full'); return store(id, s); };
  f.setTime(2000);
  const a = f.watch.ingest(f.block(0)), b = f.watch.ingest(f.block(1)); await tick();
  assert.deepEqual(started, ['moment-1']);
  // Preconditions answer at once instead of waiting behind the write in flight.
  await assert.rejects(f.watch.ingest({ startMs: 5, endMs: 5 }), /Horodatage invalide/);
  put('moment-2').resolve(); put('moment-1').resolve();
  assert.deepEqual(await Promise.all([a, b]), ['moment-1', 'moment-2']);
  assert.deepEqual(f.watch.segments.map(s => [s.id, s.startMs, s.receivedMs]), [['moment-1', 0, 2000], ['moment-2', 1000, 2000]]);
  f.setTime(4000); put('moment-3').resolve();
  const c = f.watch.ingest(f.block(3)), late = f.watch.ingest(f.block(2));
  await assert.rejects(late, /ordre d’observation/); assert.equal(await c, 'moment-3');
  f.setTime(6000); put('moment-4').resolve(); put('moment-5').resolve();
  const broken = f.watch.ingest(f.block(4, { fail: true })), next = f.watch.ingest(f.block(5));
  await assert.rejects(broken, /disk full/); assert.equal(await next, 'moment-5');
  assert.deepEqual(f.watch.segments.map(s => [s.id, s.startMs]), [['moment-1', 0], ['moment-2', 1000], ['moment-3', 3000], ['moment-5', 5000]]);
  await f.watch.stop(); await assert.rejects(f.watch.ingest(f.block(6)), /arrêtée/);
});
test('an ingest still waiting for admission when the session closes writes no raw media', async () => {
  const gate = deferred(), written = [];
  const f = fixture({ transcribe, observeVisual: visual });
  f.media.put = async id => { written.push(id); await gate.promise; };
  f.setTime(2000);
  const first = f.watch.ingest(f.block(0)), waiting = f.watch.ingest(f.block(1)); await tick();
  await f.watch.close(); gate.resolve();
  assert.equal(await first, 'moment-1'); await assert.rejects(waiting, /arrêtée/);
  assert.deepEqual(written, ['moment-1']);
});
test('analysis starts before a slow thumbnail or sweep finishes, while ingest still waits for both', async () => {
  const thumbnail = deferred(), removal = deferred(); let settled = 0;
  const f = fixture({ transcribe, observeVisual: visual }, { retentionMs: 1000, thumbnails: { put: async () => { await thumbnail.promise; } } });
  f.setTime(1000);
  const pending = f.watch.ingest(f.block(0)).then(id => { settled++; return id; }); await tick();
  const [p] = f.watch.segments;
  assert.equal(p.status, 'ready'); assert.equal(p.thumbnailAvailable, undefined); assert.equal(settled, 0);
  thumbnail.resolve(); assert.equal(await pending, 'moment-1');
  assert.equal(p.thumbnailAvailable, true); assert.equal(f.snapshots.at(-1).segments[0].thumbnailAvailable, true);
  const remove = f.media.remove;
  f.media.remove = async id => { await removal.promise; return remove(id); };
  f.setTime(10000);
  const next = f.watch.ingest(f.block(9)).then(id => { settled++; return id; }); await tick();
  assert.equal(f.watch.segments.at(-1).status, 'ready'); assert.equal(settled, 1);
  removal.resolve(); assert.equal(await next, 'moment-2');
  assert.equal(f.watch.history[0].thumbnailAvailable, true); assert.equal(f.files.has('moment-1'), false);
  const g = fixture({ transcribe, observeVisual: visual }, { thumbnails: { put: async () => { throw Error('Image JPEG requise.'); } } });
  assert.equal(await g.add(0), 'moment-1'); assert.equal(g.watch.segments[0].thumbnailAvailable, false);
});
test('latency arithmetic tolerates missing stamps, honours the limit and rounds', () => {
  const empty = { blockMs: null, arrivalMs: null, audioWaitMs: null, audioMs: null, visionWaitMs: null, visionMs: null, transcriptAfterCloseMs: null, readyAfterCloseMs: null };
  assert.deepEqual(passageLatency({}), empty); assert.deepEqual(passageLatency(null), empty);
  assert.deepEqual(passageLatency({ startMs: 0, endMs: 'x', receivedMs: NaN, audioMs: null, visionMs: Infinity, status: 'ready' }), empty);
  const full = { startMs: 0, endMs: 8000, receivedMs: 8600, audioStartedMs: 8700, audioMs: 5000, transcriptPublishedMs: 13900, visionQueuedMs: 13900, visionStartedMs: 14000, visionMs: 4000, visionPublishedMs: 18100, status: 'partial' };
  assert.deepEqual(passageLatency(full), { blockMs: 8000, arrivalMs: 600, audioWaitMs: 100, audioMs: 5000, visionWaitMs: 100, visionMs: 4000, transcriptAfterCloseMs: 5900, readyAfterCloseMs: null });
  assert.equal(passageLatency({ ...full, status: 'ready' }).readyAfterCloseMs, 10100);
  assert.deepEqual(latencySummary([]), { passages: 0, ...Object.fromEntries(Object.keys(empty).map(key => [key, { n: 0 }])) });
  const rows = [{ startMs: 0, endMs: 1000, receivedMs: 99999 }, { startMs: 0, endMs: 1000, receivedMs: 1000.4 }, { startMs: 0, endMs: 1000, receivedMs: 1002.3 }, { startMs: 0, endMs: 1000 }];
  const summary = latencySummary(rows, 3);
  assert.equal(summary.passages, 3);
  assert.deepEqual(summary.arrivalMs, { n: 2, mean: 1, max: 2 });
  assert.deepEqual(summary.blockMs, { n: 3, mean: 1000, max: 1000 }); assert.deepEqual(summary.audioWaitMs, { n: 0 });
  assert.equal(latencySummary(Array.from({ length: 50 }, () => ({ startMs: 0, endMs: 1 }))).passages, 40);
  assert.equal(latencySummary(rows, 0).passages, 0); assert.equal(latencySummary(undefined).passages, 0);
  // The session summary only looks at the last 40 passages of history + segments.
  const f = fixture({ transcribe, observeVisual: visual });
  for (let i = 0; i < 60; i++) f.watch.history.push({ id: `old-${i}`, startMs: i * 1000, endMs: (i + 1) * 1000, receivedMs: (i + 1) * 1000 + (i < 20 ? 50000 : 100) });
  const state = f.watch.snapshot();
  assert.equal(state.latency.passages, 40); assert.deepEqual(state.latency.arrivalMs, { n: 40, mean: 100, max: 100 });
  assert.equal(state.coverage.passages, 60);
});

test('a passage that just got its transcript keeps its place when passages shed behind it are handed over', async () => {
  const gate = deferred(), described = [];
  const f = fixture({ transcribe: async s => { if (s.id === 'moment-1') await gate.promise; return transcribe(s); },
    observeVisual: async s => { described.push(s.id); return visual(s); } });
  // Four blocks arrive during one transcription: two are shed behind it, two wait for Whisper.
  for (let i = 0; i < 5; i++) await f.add(i);
  assert.deepEqual(f.watch.segments.map(s => s.audioStatus), ['analyzing', 'skipped', 'skipped', undefined, undefined]);
  gate.resolve(); await tick(); await tick();
  assert.equal(described[0], 'moment-1', 'the idle vision lane takes the transcribed passage first');
  assert.deepEqual(f.watch.segments.map(s => [s.status, s.visionStatus]), [['ready', 'ready'], ['partial', 'ready'], ['partial', 'ready'], ['ready', 'ready'], ['ready', 'ready']]);
  assert.deepEqual(described, ['moment-1', 'moment-2', 'moment-3', 'moment-4', 'moment-5'], 'descriptions stay in observation order');
  assert.deepEqual([f.watch.losses.audioSkipped, f.watch.losses.visionSkippedBacklog], [2, 0]);
});

test('a passage without speech only takes a free place in the vision lane and never evicts a spoken one', async () => {
  const audio = deferred(), vision = deferred();
  const f = fixture({ transcribe: async s => { if (s.id === 'moment-4') await audio.promise; return transcribe(s); }, observeVisual: async s => { await vision.promise; return visual(s); } });
  // moment-1 is being described; moment-2 and moment-3 hold both waiting places with their speech.
  for (let i = 0; i < 3; i++) await f.add(i);
  assert.deepEqual(f.watch.visionQueue.map(s => s.id), ['moment-2', 'moment-3']);
  // moment-4 stalls in Whisper; three more arrive, so moment-5 is shed behind it.
  for (let i = 3; i < 7; i++) await f.add(i);
  assert.equal(f.watch.segments[4].audioStatus, 'skipped');
  audio.resolve(); await tick();
  const shed = f.watch.segments[4];
  assert.deepEqual([shed.status, shed.visionStatus, shed.visionSkipReason], ['skipped', 'skipped', 'backlog'], 'no free place: it is dropped whole and counted');
  assert.ok(f.watch.segments.slice(1, 4).filter(s => s.visionStatus === 'skipped').every(s => s.observation.transcript), 'spoken passages are only evicted by spoken ones');
  assert.equal(f.watch.visionQueue.every(s => s.observation?.transcript), true);
  vision.resolve(); await tick();
});

test('a passage that expires while still waiting for its transcription is counted on both lanes', async () => {
  const gate = deferred();
  const f = fixture({ transcribe: async s => { await gate.promise; return transcribe(s); }, observeVisual: visual }, { retentionMs: 2500 });
  for (let i = 0; i < 4; i++) await f.add(i);
  // moment-1 is in Whisper; moment-2 was shed; moment-3 and moment-4 wait.
  f.setTime(6000); await f.watch.prune();
  assert.deepEqual(f.watch.segments.slice(1, 3).map(s => [s.id, s.status, s.visionStatus]), [['moment-2', 'expired', 'expired'], ['moment-3', 'expired', 'expired']]);
  assert.deepEqual([f.watch.losses.audioSkipped, f.watch.losses.audioExpired, f.watch.losses.visionExpired], [1, 1, 2]);
  gate.resolve(); await tick();
});

test('a thumbnail written after its passage was archived still reaches the archive', async () => {
  const slow = deferred();
  const f = fixture({ transcribe, observeVisual: visual }, { retentionMs: 500, thumbnails: { put: async () => { await slow.promise; } } });
  f.setTime(1000);
  const pending = f.watch.ingest({ startMs: 0, endMs: 1000, audio: new Uint8Array([1]), frames: [] });
  await tick(); await tick();
  f.setTime(5000); await f.watch.pruneChain; f.watch.prune(); await tick(); await tick();
  assert.equal(f.watch.history[0]?.thumbnailAvailable, undefined);
  slow.resolve(); await pending;
  assert.equal(f.watch.history[0].thumbnailAvailable, true);
});
