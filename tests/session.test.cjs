const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WatchSession, selectEvidence } = require('../core/session.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(overrides = {}) {
  let time = 0;
  const files = new Map(), calls = [], snapshots = [];
  const media = { put: async (id, value) => files.set(id, value), read: async id => { if (!files.has(id)) throw new Error('expired'); return files.get(id); }, remove: async id => files.delete(id) };
  const perception = { observe: async s => { calls.push(s.id); return { observation: { summary: `Passage ${s.id}`, visual: 'Un chien', audio: '', transcript: '' }, cost: 0 }; } };
  const answer = { ask: async input => ({ answer: 'Un chien.', kind: 'observation', citations: [input.context.at(-1).id], limits: [] }) };
  const watch = new WatchSession({ id: 'session', now: () => time, perception, answer, media, archive: { save: async s => snapshots.push(s) }, ...overrides });
  const add = async index => { time = (index + 1) * 15000; return watch.ingest({ startMs: index * 15000, endMs: time, clip: new Uint8Array([1]), frames: [{ atMs: index * 15000, dataUrl: 'test' }], audio: null }); };
  return { watch, files, calls, snapshots, add, setTime: value => { time = value; } };
}
test('capture continues with bounded analysis backlog and explicit skipped passages', async () => {
  const gate = deferred(); const f = fixture({ perception: { observe: async () => { await gate.promise; return { observation: { summary: 'Ok' } }; } } });
  await f.add(0); await tick();
  await f.add(1); await f.add(2); await f.add(3); await f.add(4);
  assert.equal(f.watch.queue.length, 2);
  assert.equal(f.files.size, 5);
  assert.equal(f.watch.segments.filter(s => s.status === 'skipped').length, 2);
  gate.resolve(); await tick(); await tick();
});
test('retention deletes raw media, preserves summaries, and does not substitute recent evidence for an expired requested time', async () => {
  let requested;
  const f = fixture({ retentionMs: 30000, answer: { ask: async input => { requested = input; return { answer: 'Résumé ancien uniquement.', kind: 'observation', citations: ['moment-1'], limits: ['Média expiré.'] }; } } });
  await f.add(0); await tick(); await f.add(1); await tick();
  await f.add(2); await tick(); await f.add(3); await tick();
  assert.equal(f.files.has('moment-1'), false);
  assert.equal(f.watch.history[0].id, 'moment-1');
  const response = await f.watch.ask('Que voit-on à 00:05 ?');
  assert.equal(requested.evidence.length, 0);
  assert.equal(response.citations[0].available, false);
  assert.equal(response.citations[0].id, 'moment-1');
});
test('Ask prevents another background analysis starting until the answer completes', async () => {
  const perceptionGate = deferred(), answerGate = deferred(); let calls = 0;
  const f = fixture({ perception: { observe: async () => { calls++; await perceptionGate.promise; return { observation: { summary: 'Image' } }; } }, answer: { ask: async () => { await answerGate.promise; return { answer: 'Image', kind: 'observation', citations: ['moment-1'], limits: [] }; } } });
  await f.add(0); await tick(); await f.add(1);
  const pending = f.watch.ask('Maintenant ?'); await tick();
  perceptionGate.resolve(); await tick(); await tick();
  assert.equal(calls, 1);
  answerGate.resolve(); await pending; await tick();
  assert.equal(calls, 2);
});
test('unknown references cannot become grounded observations', async () => {
  const f = fixture({ answer: { ask: async () => ({ answer: 'Un dragon.', kind: 'observation', citations: ['invented-id'], limits: [] }) } });
  await f.add(0); await tick();
  const result = await f.watch.ask('Que vois-tu ?');
  assert.equal(result.kind, 'insufficient'); assert.deepEqual(result.citations, []);
  assert.doesNotMatch(result.answer, /dragon/);
});
test('an answer citing the present cannot masquerade as an explicitly requested past moment', async () => {
  let input;
  const f = fixture({ answer: { ask: async context => { input = context; return { answer: 'Scène actuelle.', kind: 'observation', citations: ['moment-2'], limits: [] }; } } });
  await f.add(0); await tick(); await f.add(1); await tick();
  const response = await f.watch.ask('Que voyait-on il y a vingt secondes ?');
  assert.equal(input.targetMs, 10000); assert.deepEqual(input.focusIds, ['moment-1']);
  assert.deepEqual(input.evidence.map(s => s.id), ['moment-1']);
  assert.equal(response.kind, 'insufficient');
});
test('upstream failure leaves media available and is visible', async () => {
  const f = fixture({ perception: { observe: async () => { throw new Error('Quota atteint'); } } });
  await f.add(0); await tick();
  assert.equal(f.watch.segments[0].status, 'error');
  assert.equal(f.watch.lastError, 'Quota atteint');
  assert.equal(f.files.has('moment-1'), true);
});
test('observation time controls relative references even after a playback rewind', () => {
  const segments = [{ id: 'one', startMs: 0, endMs: 15000 }, { id: 'two', startMs: 60000, endMs: 75000 }];
  assert.equal(selectEvidence('Il y a une minute ?', segments, 75000)[0].id, 'one');
  assert.equal(selectEvidence('Qu’est-ce qui vient de se passer ?', segments, 75000)[0].id, 'two');
  assert.deepEqual(selectEvidence('Il y a cinq minutes ?', segments, 75000), []);
  assert.equal(selectEvidence('Il y a vingt secondes ?', [{ id: 'first', startMs: 0, endMs: 15000 }, { id: 'last', startMs: 15000, endMs: 30000 }], 30000)[0].id, 'first');
});
test('stopped sessions reject capture but retain Ask', async () => {
  const f = fixture(); await f.add(0); await tick(); await f.watch.stop();
  await assert.rejects(f.add(1), /arrêtée/);
  assert.equal((await f.watch.ask('Que voit-on ?')).kind, 'observation');
});
