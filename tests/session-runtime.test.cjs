const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createSessionRuntime, openArchivedSession, validateSegment } = require('../runtime/session-runtime.cjs');
const { SessionLibrary } = require('../adapters/session-library.cjs');
const { tick } = require('./helpers/wait.cjs');

for (const [condition, restore, message] of [
  ['incomplete', {}, 'Archive incomplète : état et inventaire requis.'],
  ['unreadable', { snapshot: { id: 's' }, inventory: {} }, 'Archive illisible.'],
  ['foreign', { snapshot: { id: 'other', segments: [] }, inventory: {} }, 'Archive d’une autre session.'],
  ['of a future version', { snapshot: { format: 'tvlens-viewing-memory', version: 2, id: 's', segments: [] }, inventory: {} }, 'Archive illisible.'],
  ['of a format without a version', { snapshot: { format: 'tvlens-viewing-memory', id: 's', segments: [] }, inventory: {} }, 'Archive illisible.'],
  ['of a version without a format', { snapshot: { version: 1, id: 's', segments: [] }, inventory: {} }, 'Archive illisible.'],
  ['of another format', { snapshot: { format: 'tvlens-session', version: 1, id: 's', segments: [] }, inventory: {} }, 'Archive illisible.'],
]) {
  test(`archive composition retains its explicit refusal for an archive that is ${condition}`, () => {
    assert.throws(() => createSessionRuntime({ id: 's', restore }), { code: 'invalid-archive', status: 400, message });
  });
}

const segment = () => ({
  startMs: 0, endMs: 100, clip: Buffer.from('clip'), frames: [{ atMs: 0, dataUrl: 'data:image/jpeg;base64,YQ==' }],
});
for (const [condition, change, message] of [
  ['future timestamp', { endMs: 3101 }, 'Horodatage de capture invalide.'],
  ['empty clip', { clip: Buffer.alloc(0) }, 'Segment vidéo trop volumineux ou vide.'],
  ['invalid audio', { audio: 'text' }, 'Audio invalide.'],
  ['empty frames', { frames: [] }, 'Images de capture invalides.'],
]) {
  test(`captured segment validation identifies ${condition}`, () => {
    assert.throws(() => validateSegment({ ...segment(), ...change }, 100), {
      code: 'invalid-captured-segment', status: 400, message,
    });
  });
}

const reread = value => JSON.parse(JSON.stringify(value));
const marked = state => ['format', 'version'].filter(key => Object.hasOwn(state, key));

test('a new session saved by the shared runtime writes the archive markers beside exactly its state, and reopens to the same model', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-runtime-archive-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let clock = 0;
  const published = [];
  const options = { sessionsRoot: root, userData: root, config: {}, selectedModels: {}, smoke: true, readClock: () => clock };
  const live = createSessionRuntime({ ...options, onChange: state => published.push(state) });
  clock = 8000;
  await live.watch.ingest(segment());
  do await tick(); while (live.watch.running);
  await live.pause();
  await live.close();
  const written = JSON.parse(await fs.readFile(path.join(root, live.id, 'session.json'), 'utf8'));
  const state = reread(live.watch.snapshot());
  assert.deepEqual(Object.keys(written), ['format', 'version', ...Object.keys(state)]);
  assert.deepEqual([written.format, written.version], ['tvlens-viewing-memory', 1]);
  const { format, version, ...model } = written;
  for (const key of ['segments', 'history']) {
    assert.equal(model[key].length, state[key].length, key);
    state[key].forEach((passage, index) => assert.deepEqual(model[key][index], passage, `${key} ${passage.id}`));
  }
  assert.equal(model.segments.length, 1);
  assert.deepEqual(model, state);
  assert.ok(published.length > 0);
  assert.deepEqual([...published, live.watch.snapshot()].flatMap(marked), [], 'the published state carries no archive marker');

  const library = new SessionLibrary({ root });
  const archive = await library.read(live.id);
  assert.deepEqual(archive.snapshot, model, 'the library reads back the saved model, without its markers');
  const { session } = await openArchivedSession({ library, id: live.id, ...options });
  try {
    const reopened = reread(session.watch.snapshot());
    assert.deepEqual(marked(reopened), []);
    assert.deepEqual(reopened.segments, model.segments);
    assert.deepEqual([reopened.readOnly, reopened.elapsedMs, reopened.retention], [true, model.elapsedMs, model.retention]);
  } finally {
    await session.close();
  }
});
