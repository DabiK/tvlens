const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function fixture({ delayedFlush = false, delayedIngest = false } = {}) {
  const { selectFrameCandidates, visualChange } = await import('../core/frame-policy.mjs');
  let now = 0, nextTimer = 0;
  const timers = new Map(), media = [], ingested = [], errors = [];
  const flush = deferred(), ingest = deferred();
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; this.stops = 0; media.push(this); }
    start() { this.state = 'recording'; }
    stop() {
      assert.equal(this.state, 'recording');
      this.stops++; this.state = 'inactive';
      queueMicrotask(() => { this.ondataavailable({ data: new Blob(['clip']) }); this.onstop(); });
    }
  }
  const drawing = { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(64 * 36 * 4) }) };
  const sandbox = {
    selectFrameCandidates, visualChange, MediaRecorder: Recorder, Blob, Uint8Array, ArrayBuffer, DataView,
    performance: { now: () => now },
    document: { createElement: () => ({ getContext: () => drawing, toDataURL: () => 'data:image/jpeg;base64,YQ==' }) },
    setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms, interval: false }); return id; },
    setInterval: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms, interval: true }); return id; },
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    window: { tvlens: { ingest: async value => { ingested.push(value); if (delayedIngest) await ingest.promise; return 'moment-' + ingested.length; } } },
  };
  const source = fs.readFileSync(require.resolve('../app/recording.js'), 'utf8').replace(/^import .*;\n/, '').replace(/export /g, '');
  const RollingRecorder = vm.runInNewContext(source + '\nRollingRecorder;', sandbox);
  const recorder = new RollingRecorder({ stream: {}, video: { videoWidth: 1280, videoHeight: 720 },
    audioContext: { sampleRate: 16000 }, flushAudio: () => delayedFlush ? flush.promise : Promise.resolve(),
    session: { id: 'session', elapsedMs: 0, segmentMs: 8000 }, onError: error => errors.push(error) });
  return { recorder, media, ingested, errors, timers, flush, ingest, advance: ms => { now += ms; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('timer, simultaneous checkpoints and pause flush one passage and never restart after pause', async () => {
  const f = await fixture({ delayedFlush: true });
  f.recorder.start(); f.advance(2000);
  const timer = [...f.timers.values()].find(t => !t.interval);
  timer.fn();
  const a = f.recorder.checkpoint(), b = f.recorder.checkpoint(), paused = f.recorder.stop();
  f.flush.resolve();
  await Promise.all([a, b, paused]);
  assert.equal(f.media.length, 1);
  assert.equal(f.media[0].stops, 1);
  assert.equal(f.ingested.length, 1);
  assert.equal(f.recorder.active, false);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.errors, []);
});

test('checkpoint waits for persisted media before allowing a question and preserves recording', async () => {
  const f = await fixture({ delayedIngest: true });
  f.recorder.start(); f.advance(1000);
  let complete = false;
  const checkpoint = f.recorder.checkpoint().then(() => { complete = true; });
  await tick();
  assert.equal(f.ingested.length, 1);
  assert.equal(complete, false);
  assert.equal(f.recorder.active, true);
  assert.equal(f.media.length, 2);
  f.ingest.resolve(); await checkpoint;
  assert.equal(complete, true);
  await f.recorder.stop();
  assert.deepEqual(f.errors, []);
});

test('initial capture arrives in two seconds then uses the configured segment duration', async () => {
  const f = await fixture();
  f.recorder.start();
  assert.equal([...f.timers.values()].find(t => !t.interval).ms, 2000);
  f.advance(2000); await f.recorder.checkpoint();
  assert.equal([...f.timers.values()].find(t => !t.interval).ms, 8000);
  await f.recorder.stop();
});

test('an anchored checkpoint excludes frames and audio captured after the selected instant', async () => {
  const f = await fixture();
  f.recorder.start();
  f.advance(800); f.recorder.frame();
  f.advance(600); f.recorder.frame();
  f.recorder.samples(new Float32Array(22400));
  await f.recorder.checkpoint(1000);
  assert.equal(f.ingested.length, 1);
  assert.equal(f.ingested[0].endMs, 1000);
  assert.ok(f.ingested[0].frames.length > 0);
  assert.ok(f.ingested[0].frames.every(frame => frame.atMs <= 1000));
  assert.equal(f.ingested[0].audio.byteLength, 44 + 16000 * 2);
  await f.recorder.stop();
});

test('a checkpoint older than the active segment leaves current recording intact', async () => {
  const f = await fixture();
  f.recorder.start(); f.advance(2000); await f.recorder.checkpoint();
  const active = f.media.at(-1);
  f.advance(1000); await f.recorder.checkpoint(1500);
  assert.equal(active.stops, 0);
  assert.equal(f.ingested.length, 1);
  await f.recorder.stop();
});

test('ordinary rotation keeps recording video while the audio worklet flush is pending', async () => {
  const f = await fixture({ delayedFlush: true });
  f.recorder.start(); f.advance(2000);
  const rotation = f.recorder.checkpoint();
  await tick();
  assert.equal(f.media[0].state, 'recording', 'Audio flush must not create a recurring video capture gap');
  f.advance(500); f.flush.resolve(); await rotation;
  assert.equal(f.ingested[0].endMs, 2500);
  await f.recorder.stop();
});
