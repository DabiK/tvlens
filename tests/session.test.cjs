const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WatchSession } = require('../core/session.cjs');
const { tick, deferred } = require('./helpers/wait.cjs');
function fixture(overrides = {}) {
  let time = 0;
  const files = new Map(), calls = [], snapshots = [];
  const media = { put: async (id, value) => files.set(id, value), read: async id => { if (!files.has(id)) throw new Error('expired'); return files.get(id); }, remove: async id => files.delete(id) };
  const perception = { transcribe: async () => ({ observation: {} }), observeVisual: async s => { calls.push(s.id); return { observation: { summary: `Passage ${s.id}`, visual: 'Un chien', audio: '', transcript: '' }, cost: 0 }; } };
  const watch = new WatchSession({ id: 'session', now: () => time, perception, media, archive: { save: async s => snapshots.push(s) }, ...overrides });
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
  assert.equal(f.watch.queue.length, 6);
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
