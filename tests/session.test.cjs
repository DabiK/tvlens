const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ViewingMemory } = require('../core/memory/index.cjs');
const { tick, deferred } = require('./helpers/wait.cjs');

test('the memory public entry constructs a ViewingMemory and exposes archive recovery and capture refusals', async t => {
  const memory = require('../core/memory/index.cjs');
  assert.equal(typeof memory.ViewingMemory, 'function');
  const watch = new memory.ViewingMemory({
    id: 'session', now: () => 1000, perception: {}, media: {}, archive: { save: async () => {} },
  });
  t.after(() => watch.close());
  assert.equal(watch.constructor.name, 'ViewingMemory');
  assert.equal(watch.memoryView().session.id, 'session');
  const recovered = memory.recoveredPassage({ id: 'moment-3', startMs: 0, endMs: 1000, hasAudio: true });
  const saved = memory.toArchive({ id: 'session', segments: [recovered] });
  watch.restore(saved, { hasMedia: () => true, orphans: ['moment-7'] });
  assert.deepEqual(watch.snapshot().segments, memory.fromArchive(saved).segments);
  await assert.rejects(watch.ingest({ startMs: 1000, endMs: 2000 }), { code: memory.TVLENS_SESSION_STOPPED });
  await watch.resume();
  await assert.rejects(watch.ingest({ startMs: -1, endMs: 1000 }), { code: memory.TVLENS_CAPTURE_TIME_INVALID });
});

function fixture(overrides = {}) {
  let time = 0;
  const files = new Map(), calls = [], snapshots = [];
  const media = { put: async (id, value) => files.set(id, value), read: async id => { if (!files.has(id)) throw new Error('expired'); return files.get(id); }, remove: async id => files.delete(id) };
  const perception = { transcribe: async () => ({ observation: {} }), observeVisual: async s => { calls.push(s.id); return { observation: { summary: `Passage ${s.id}`, visual: 'Un chien', audio: '', transcript: '' }, cost: 0 }; } };
  const watch = new ViewingMemory({ id: 'session', now: () => time, perception, media, archive: { save: async s => snapshots.push(s) }, ...overrides });
  const add = async index => { time = (index + 1) * 15000; return watch.ingest({ startMs: index * 15000, endMs: time, clip: new Uint8Array([1]), frames: [{ atMs: index * 15000, dataUrl: 'test' }], audio: null }); };
  return { watch, files, calls, snapshots, add, setTime: value => { time = value; } };
}
test('capture continues with bounded analysis backlog and explicit skipped passages', async () => {
  const gate = deferred(); const f = fixture({ perception: {
    transcribe: async () => { await gate.promise; return { observation: {} }; },
    observeVisual: async () => ({ observation: { summary: 'Ok' } }),
  } });
  await f.add(0); await tick();
  for (let i = 1; i < 9; i++) await f.add(i);
  assert.equal(f.watch.snapshot().audioPending, 6);
  assert.equal(f.files.size, 9);
  assert.equal(f.watch.segments.filter(s => s.status === 'skipped').length, 2);
  gate.resolve(); await tick(); await tick();
});

test('upstream failure leaves media available and is visible', async () => {
  const f = fixture({ perception: { transcribe: async () => ({ observation: {} }), observeVisual: async () => { throw new Error('Quota atteint'); } } });
  await f.add(0); await tick();
  assert.equal(f.watch.segments[0].status, 'error');
  assert.equal(f.watch.lastError, 'Quota atteint');
  assert.equal(f.files.has('moment-1'), true);
});

for (const [condition, code, message, run] of [
  ['invalid timestamp', 'TVLENS_CAPTURE_TIME_INVALID', 'Horodatage invalide.', f => f.watch.ingest({ startMs: -1, endMs: 1 })],
  ['overlapping interval', 'TVLENS_CAPTURE_ORDER_INVALID', 'Les segments doivent suivre l’ordre d’observation.', async f => {
    await f.add(0);
    return f.add(0);
  }],
  ['stopped intake', 'TVLENS_SESSION_STOPPED', 'La session est arrêtée.', async f => { await f.watch.stop(); return f.add(0); }],
  ['closed resume', 'TVLENS_SESSION_STOPPED', 'Session fermée.', async f => { await f.watch.close(); return f.watch.resume(); }],
  ['closed landing', 'TVLENS_SESSION_STOPPED', 'La session est arrêtée.', async f => {
    const pending = f.add(0);
    await f.watch.close();
    return pending;
  }],
]) {
  test(`capture refusals expose ${code} for ${condition}`, async t => {
    const f = fixture();
    t.after(() => f.watch.close());
    await assert.rejects(run(f), error => {
      assert.equal(error.code, code);
      assert.equal(require('../core/memory/index.cjs')[code], code);
      assert.equal(error.message, message);
      assert.equal(error.status, undefined);
      return true;
    });
  });
}
