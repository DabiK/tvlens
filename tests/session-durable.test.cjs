const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const sharp = require('sharp');
const { WatchSession } = require('../core/session.cjs');
const { SessionClock } = require('../core/session-clock.cjs');
const { VideoTools, consultationOf } = require('../core/video-tools.cjs');
const { createSessionRuntime, openArchivedSession, INDEX_OBSERVE_TAIL, MANIFEST_EVERY_MS } = require('../runtime/session-runtime.cjs');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
const { SessionLibrary } = require('../adapters/session-library.cjs');
const { SessionThumbnails } = require('../adapters/session-thumbnails.cjs');
const { DiskGuard } = require('../adapters/disk-guard.cjs');
const { LocalSessionStore, cleanupRawMedia } = require('../adapters/local-store.cjs');

const { tick, deferred, turns } = require('./helpers/wait.cjs');
const settle = async watch => { do { await tick(); } while (watch.running); };
const gates = () => { const map = new Map(); return id => map.get(id) || map.set(id, deferred()).get(id); };
// Every entry under a directory with its content hash and modification time: two listings are equal
// only when nothing was added, removed or rewritten.
async function tree(dir, base = dir) {
  const rows = [];
  for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(dir, entry.name), name = path.relative(base, target);
    if (entry.isDirectory()) rows.push([name, 'dir'], ...await tree(target, base));
    else rows.push([name, createHash('sha256').update(await fs.readFile(target)).digest('hex'), (await fs.stat(target)).mtimeMs]);
  }
  return rows;
}
const inspect = (session, startMs, endMs) => new VideoTools({ consultation: consultationOf(session.memory.view()), search: session.search, inspector: session.inspector, media: session.memoryMedia })
  .call('inspect_clip', { startMs, endMs, question: 'Que voit-on ?' });
// The disk refuses the files named, as on EIO or in a directory that is no longer writable: their temporary
// file is never written, so each keeps what it held. Media, thumbnails and every other file still land.
function refusing(t, ...names) {
  const writeFile = fs.writeFile;
  const mock = t.mock.method(fs, 'writeFile', async (file, ...rest) => {
    if (names.some(name => String(file).endsWith(name + '.tmp'))) throw Object.assign(new Error(`EIO: i/o error, write '${file}'`), { code: 'EIO' });
    return writeFile(file, ...rest);
  });
  return () => mock.mock.restore();
}
// The disk as a test holds it. Every write of the files named is listed with its size; while the disk is
// held it waits for release(), and with `refuse` it then fails as on EIO. Every other file lands at once.
// Let go when the test ends, whatever happened: made before a fixture, it never keeps a host from closing.
function disk(t, ...names) {
  const writeFile = fs.writeFile, d = { seen: [], gate: null, refuse: false };
  t.mock.method(fs, 'writeFile', async (file, data, ...rest) => {
    const name = names.find(item => String(file).endsWith(item + '.tmp'));
    if (!name) return writeFile(file, data, ...rest);
    d.seen.push({ name, bytes: Buffer.byteLength(data) });
    await d.gate?.promise;
    if (d.refuse) throw Object.assign(new Error(`EIO: i/o error, write '${file}'`), { code: 'EIO' });
    return writeFile(file, data, ...rest);
  });
  d.hold = () => { d.gate = deferred(); };
  d.release = () => { const gate = d.gate; d.gate = null; gate?.resolve(); };
  t.after(() => d.release());
  d.count = name => d.seen.filter(write => write.name === name).length;
  // Resolves once `total` writes have reached the disk: the last of them is the one in flight while it is held.
  // A write that never comes fails the test instead of holding it.
  d.reached = async total => { for (const limit = Date.now() + 5000; d.seen.length < total; await tick()) if (Date.now() > limit) assert.fail(`the disk was handed ${d.seen.length} write(s), ${total} expected`); };
  return d;
}

// Real adapters on a temporary directory, simulated providers, host clock held by the test.
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-durable-')), sessionsRoot = path.join(root, 'sessions');
  const jpeg = 'data:image/jpeg;base64,' + (await sharp({ create: { width: 64, height: 36, channels: 3, background: '#264136' } }).jpeg().toBuffer()).toString('base64');
  const f = { root, sessionsRoot, clock: 0, embedded: [], opened: [] };
  const embeddings = { embed: async text => { f.embedded.push(text); return [1, 0]; }, embedMany: async texts => { f.embedded.push(...texts); return texts.map(() => [1, 0]); } };
  f.options = extra => ({ userData: root, config: {}, selectedModels: {}, smoke: true, readClock: () => f.clock, overrides: { embeddings }, ...extra });
  f.open = extra => { const session = createSessionRuntime({ sessionsRoot, ...f.options(extra) }); f.opened.push(session); return session; };
  f.reopen = async (library, id, extra) => { const opened = await openArchivedSession({ library, id, ...f.options(extra) }); f.opened.push(opened.session); return opened; };
  f.block = (startMs, endMs, dataUrl = jpeg) => ({ startMs, endMs, clip: Buffer.from(`clip ${startMs}`), frames: [{ atMs: startMs, dataUrl }], audio: null });
  t.after(async () => { for (const session of f.opened) await session.close(); await fs.rm(root, { recursive: true, force: true }); });
  return f;
}

test('the start of a film is still replayable and inspectable after 95 minutes, a stop and a reopening; capture only comes back on an explicit resume', async t => {
  const f = await fixture(t), live = f.open({ host: 'server' }), id = live.id, dir = path.join(f.sessionsRoot, id);
  f.clock = 8000; assert.equal(await live.watch.ingest(f.block(0, 8000)), 'moment-1'); await settle(live.watch);
  f.clock = 5700000; await live.watch.prune();
  await live.watch.ingest(f.block(5692000, 5700000)); await settle(live.watch);
  // Nothing expired, nothing was compacted away: both passages keep their media 95 minutes in.
  assert.deepEqual(live.watch.segments.map(s => [s.id, s.status, s.available, s.thumbnailAvailable]), [['moment-1', 'ready', true, true], ['moment-2', 'ready', true, true]]);
  assert.equal(live.watch.history.length, 0);
  const state = live.watch.snapshot();
  assert.deepEqual([state.retentionMs, state.retention, state.readOnly], [null, 'until-deleted', false]);
  assert.equal((await live.store.response('moment-1', 'bytes=0-3')).status, 206);
  assert.equal((await inspect(live, 0, 8000)).observations[0].id, 'moment-1');
  await live.store.saveResearch({ jobs: [{ id: 'deep-1', status: 'done', question: 'Comment ça commence ?', result: { answer: 'Par un cercle.' } }] });
  await live.pause();
  assert.deepEqual((await live.archive()).state, 'archived');
  await live.close(); await live.pause();
  assert.equal(live.manifest().state, 'archived', 'a late pause does not make a closed session look interrupted');
  assert.deepEqual((await fs.readdir(path.join(dir, 'media'))).sort(), ['moment-1.json', 'moment-1.webm', 'moment-2.json', 'moment-2.webm']);
  assert.deepEqual((await fs.readdir(path.join(dir, 'thumbs'))).sort(), ['moment-1.jpg', 'moment-2.jpg']);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'media', 'moment-1.json'), 'utf8')).endMs, 8000, 'the interval travels with the media');

  // Restart: a new library and a new runtime on the same root, hours later on the host clock.
  const library = new SessionLibrary({ root: f.sessionsRoot });
  const reads = t.mock.method(require('node:fs/promises'), 'readFile');
  const [listed] = await library.list();
  assert.deepEqual(reads.mock.calls.map(call => path.basename(String(call.arguments[0]))), ['manifest.json'], 'a list reads the manifest, never the saved state');
  reads.mock.restore();
  assert.deepEqual([listed.id, listed.state, listed.legacy, listed.host, listed.passages, listed.elapsedMs], [id, 'archived', false, 'server', 2, 5700000]);
  assert.deepEqual([listed.media.stored, listed.media.missing], [2, 0]); assert.match(listed.title, /^Session du \d/);
  const expectedBytes = (await Promise.all(['media', 'thumbs'].map(async sub => Promise.all((await fs.readdir(path.join(dir, sub))).map(async name => (await fs.stat(path.join(dir, sub, name))).size))))).flat().reduce((a, b) => a + b, 0);
  assert.equal(listed.media.bytes, expectedBytes, 'the listed volume is what is on disk');
  const before = await tree(dir);
  f.clock = 20000000; f.embedded.length = 0;
  const { session, archive } = await f.reopen(library, id);
  const fed = []; session.search.index.observe = passages => fed.push(passages.length);
  session.watch.emit(); await session.watch.prune(); await tick();
  const reopened = session.watch.snapshot();
  assert.deepEqual([session.readOnly, reopened.readOnly, reopened.accepting, reopened.elapsedMs], [true, true, false, 5700000], 'stopped, at its archived instant');
  assert.deepEqual(reopened.segments.map(s => [s.id, s.status, s.available, s.thumbnailAvailable, s.mediaReason]), [['moment-1', 'ready', true, true, undefined], ['moment-2', 'ready', true, true, undefined]]);
  assert.equal(archive.chat.jobs[0].result.answer, 'Par un cercle.');
  assert.deepEqual([archive.summary.state, archive.manifest.state, archive.inventory.orphans.length], ['archived', 'archived', 0]);
  const replay = await session.store.response('moment-1', 'bytes=0-3');
  assert.equal(replay.status, 206); assert.equal(await replay.text(), 'clip');
  assert.equal((await sharp(await session.thumbnails.read('moment-1')).metadata()).width, 64);
  assert.equal((await inspect(session, 0, 8000)).observations[0].id, 'moment-1', 'the lease found the real files');
  await assert.rejects(session.watch.ingest(f.block(5700000, 5708000)), /arrêtée/, 'opening an archive does not restart capture');
  assert.deepEqual([fed, f.embedded], [[], []], 'opening indexes nothing and calls no provider');
  assert.equal(session.storage().sessionBytes, expectedBytes);
  await session.pause(); await session.close();
  assert.deepEqual(await tree(dir), before, 'opening, pausing and closing an archive writes nothing');

  // Explicit resume: same session, same clock, numbering continues.
  const resumed = (await f.reopen(library, id)).session;
  await resumed.resume();
  assert.deepEqual([resumed.readOnly, resumed.watch.accepting, resumed.watch.now()], [false, true, 5700000]);
  f.clock += 8000;
  assert.equal(await resumed.watch.ingest(f.block(5700000, 5708000)), 'moment-3'); await settle(resumed.watch);
  assert.equal(resumed.watch.now(), 5708000);
  assert.deepEqual([resumed.manifest().state, resumed.manifest().closedAt, resumed.manifest().captures.length, resumed.manifest().createdAt], ['live', null, 2, archive.manifest.createdAt]);
  assert.equal((await library.list({ current: id }))[0].state, 'live');
  assert.equal((await library.list())[0].state, 'interrupted', 'a live manifest that is not the session in memory was cut short');
  await resumed.close();
  const [after] = await library.list();
  assert.deepEqual([after.state, after.passages, after.media.stored], ['archived', 3, 3]);
});

test('an archive written before manifests is listed and opened as text only, with an honest reason, and stays byte for byte identical', async t => {
  const f = await fixture(t), id = randomUUID(), dir = path.join(f.sessionsRoot, id);
  const passage = (n, extra) => ({ id: `moment-${n}`, startMs: (n - 1) * 8000, endMs: n * 8000, status: 'ready', hasAudio: true, available: true, thumbnailAvailable: true,
    observation: { topic: 'Énergie', summary: `Résumé ${n}`, transcript: `Paroles ${n}` }, ...extra });
  // Shape of a session.json of September 2026: no manifest, no `retention`, raw media and thumbnails long gone.
  const former = { id, accepting: false, asking: false, analyzing: false, elapsedMs: 420000, retentionMs: 300000, apiCalls: 7, apiCost: 0, lastError: null, questions: [],
    coverage: { passages: 3, audioSkipped: 1, visionError: 0 },
    history: [{ id: 'moment-1', startMs: 0, endMs: 8000, status: 'ready', summary: 'Résumé 1', thumbnailAvailable: true, observation: { topic: 'Énergie', summary: 'Résumé 1', transcript: 'Paroles 1' } }],
    segments: [passage(2), passage(3, { status: 'analyzing', audioStatus: 'ready', visionStatus: 'analyzing', observation: { transcript: 'Paroles 3' } })] };
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'session.json'), JSON.stringify(former, null, 2));
  await fs.writeFile(path.join(dir, 'deep-answers.json'), JSON.stringify({ jobs: [{ id: 'deep-1', status: 'done', result: { answer: 'Ancienne réponse' } }] }));
  await fs.writeFile(path.join(dir, 'embeddings.json'), JSON.stringify({ model: 'test', entries: { 'moment-1': { text: 'Résumé 1', vector: [1, 0] } } }));
  await fs.mkdir(path.join(f.sessionsRoot, 'not-a-session')); await fs.writeFile(path.join(f.sessionsRoot, 'not-a-session', 'session.json'), '{}');
  const before = await tree(f.sessionsRoot);

  const library = new SessionLibrary({ root: f.sessionsRoot });
  const listed = await library.list();
  assert.deepEqual(listed.map(s => [s.id, s.legacy, s.state, s.passages, s.media.stored, s.media.missing, s.media.bytes, s.firstTopic, s.elapsedMs]), [[id, true, 'archived', 3, 0, 3, 0, 'Énergie', 420000]]);
  const { session, archive } = await f.reopen(library, id);
  assert.deepEqual([archive.manifest, archive.summary.legacy, archive.chat.jobs[0].result.answer], [null, true, 'Ancienne réponse']);
  const state = session.watch.snapshot();
  assert.deepEqual([state.readOnly, state.accepting, state.elapsedMs, state.apiCalls, state.coverage.audioSkipped], [true, false, 420000, 7, 1]);
  assert.deepEqual([...state.history, ...state.segments].map(p => [p.id, Boolean(p.available), p.mediaReason, p.thumbnailAvailable, p.status]),
    [['moment-1', false, 'not-kept', false, 'ready'], ['moment-2', false, 'not-kept', false, 'ready'], ['moment-3', false, 'not-kept', false, 'partial']]);
  assert.deepEqual([state.segments[1].visionStatus, state.segments[1].visionError], ['error', 'Analyse interrompue à la fermeture de la session.']);
  const tools = new VideoTools({ consultation: consultationOf(session.memory.view()),
    search: session.search, inspector: session.inspector, media: session.memoryMedia });
  await assert.rejects(tools.call('inspect_clip', { startMs: 8000, endMs: 16000, question: 'Que voit-on ?' }), /Média non conservé/);
  await assert.rejects(session.store.lease(['moment-2']), /indisponible/);
  assert.equal((await tools.call('get_transcript', { startMs: 0, endMs: 24000 })).passages.map(p => p.transcript).join(' '), 'Paroles 1 Paroles 2 Paroles 3', 'the text stays consultable');
  assert.equal(tools.context().pendingCount, 0, 'nothing is shown as still in analysis');
  session.watch.emit(); await session.watch.prune(); await session.pause(); await session.close(); await tick();
  assert.deepEqual(await tree(f.sessionsRoot), before, 'listing, opening and closing changed no byte and added no file');
  assert.deepEqual(f.embedded, []);

  // Only an explicit resume turns it into a durable session: additive, the old passages keep their honest reason.
  const resumed = (await f.reopen(library, id)).session;
  await resumed.resume(); f.clock += 8000;
  assert.equal(await resumed.watch.ingest(f.block(420000, 428000)), 'moment-4'); await settle(resumed.watch);
  await resumed.close();
  const [now] = await library.list();
  assert.deepEqual([now.legacy, now.state, now.passages, now.media.stored, now.media.missing, now.createdAt], [false, 'archived', 4, 1, 3, listed[0].createdAt]);
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'session.json'), 'utf8'));
  assert.deepEqual([...saved.history, ...saved.segments].map(p => [p.id, Boolean(p.available), p.mediaReason]),
    [['moment-1', false, 'not-kept'], ['moment-2', false, 'not-kept'], ['moment-3', false, 'not-kept'], ['moment-4', true, undefined]]);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'deep-answers.json'), 'utf8')).jobs[0].result.answer, 'Ancienne réponse', 'its other files are left as they were');
});

test('reopening settles what was in flight, trusts the disk for availability, numbers past orphan media and writes nothing', async () => {
  let time = 0; const files = new Map(), saves = [], removed = [], audio = gates(), vision = gates();
  const media = { put: async (id, s) => { files.set(id, s); }, read: async id => files.get(id), remove: async id => { removed.push(id); files.delete(id); } };
  const perception = { transcribe: async s => { await audio(s.id).promise; return { observation: { transcript: `Paroles ${s.id}` } }; },
    observeVisual: async s => { await vision(s.id).promise; return { observation: { summary: `Images ${s.id}` } }; } };
  const make = options => new WatchSession({ id: 's', now: () => time, perception, media, archive: { save: async s => { saves.push(s); } }, ...options });
  const block = i => ({ startMs: i * 1000, endMs: (i + 1) * 1000, audio: new Uint8Array([i]), frames: [] });
  const live = make();
  for (const id of ['moment-1', 'moment-2']) audio(id).resolve();
  vision('moment-1').resolve();
  for (let i = 0; i < 4; i++) { time = (i + 1) * 1000; await live.ingest(block(i)); await tick(); }
  assert.deepEqual(live.segments.map(s => [s.status, s.audioStatus, s.visionStatus]), [['ready', 'ready', 'ready'], ['partial', 'ready', 'analyzing'], ['analyzing', 'analyzing', undefined], ['queued', undefined, undefined]]);
  // What the store wrote: JSON has no Infinity, so "no expiry" is saved as null.
  const saved = JSON.parse(JSON.stringify(live.snapshot()));
  assert.deepEqual([saved.retentionMs, saved.retention], [null, 'until-deleted']);
  await live.close(); saves.length = 0;

  // A host set to a rolling window reopens it much later: the archive must not be swept by being opened.
  time = 9000000;
  const reopened = make({ retentionMs: 1000 });
  reopened.restore(saved, { hasMedia: id => id !== 'moment-2', hasThumbnail: id => id === 'moment-1', orphans: ['moment-9', 'moment-6'] });
  assert.deepEqual(reopened.segments.map(s => [s.id, s.status, s.audioStatus, s.visionStatus, s.available, s.mediaReason, s.thumbnailAvailable]), [
    ['moment-1', 'ready', 'ready', 'ready', true, undefined, true],
    ['moment-2', 'partial', 'ready', 'error', false, 'missing', false],
    ['moment-3', 'error', 'error', undefined, true, undefined, false],
    ['moment-4', 'error', undefined, undefined, true, undefined, false]]);
  assert.deepEqual([reopened.segments[1].visionError, reopened.segments[2].audioError, reopened.segments[3].error], Array(3).fill('Analyse interrompue à la fermeture de la session.'));
  const state = reopened.snapshot();
  assert.deepEqual([state.accepting, state.readOnly, state.pending, state.analyzing, state.coverage.audioError, state.coverage.visionError], [false, true, 0, false, 1, 1]);
  assert.equal(state.unplacedMedia, 2, 'media no passage could be made of are counted in the state');
  // Adapted on purpose (it used to read [1000, 'rolling']): the archive keeps the contract it was saved
  // under, and says so; the window of the host that reopens it is not its own.
  assert.deepEqual([state.retentionMs, state.retention], [null, 'until-deleted']);
  assert.equal(new VideoTools({ consultation: consultationOf(reopened.memoryView()) }).context().pendingCount, 0);
  await reopened.prune(); await reopened.stop(); await tick();
  assert.deepEqual([saves.length, removed.length, reopened.segments.length], [0, 0, 4], 'no save and no sweep while the archive is only open');
  await assert.rejects(reopened.ingest(block(9000)), /arrêtée/);
  assert.throws(() => reopened.restore(saved), /déjà commencée/);
  assert.throws(() => make().restore({ ...saved, id: 'other' }), /incompatible/);

  // Saved by a version that did not keep media: the reason says so, whatever the old flags claimed.
  const { retention, ...former } = saved;
  const old = make({ retentionMs: 1000 }); old.restore({ ...former, history: [{ id: 'moment-0', startMs: 0, endMs: 1, status: 'ready', summary: 'Ancien' }] });
  assert.deepEqual([old.snapshot().retention, old.snapshot().retentionMs], ['until-deleted', null]);
  assert.deepEqual([...old.history, ...old.segments].map(p => [Boolean(p.available), p.mediaReason]), Array(5).fill([false, 'not-kept']));
  // A rolling session reopened later: what had expired stays "expired".
  const rolling = make(); rolling.restore({ ...saved, retention: 'rolling', history: [{ id: 'moment-0', startMs: 0, endMs: 1, status: 'ready', summary: 'Ancien' }] }, { hasMedia: () => true });
  assert.deepEqual([rolling.history[0].mediaReason, rolling.history[0].available, rolling.segments[0].available], ['expired', undefined, true]);

  // Explicit resume: numbering continues past the highest orphan, and saving starts again.
  const untilDeleted = make({ retentionMs: saved.retentionMs });
  assert.equal(untilDeleted.retentionMs, Infinity, 'a saved null is never fed back into arithmetic');
  untilDeleted.restore(saved, { hasMedia: () => true, orphans: ['moment-9'] });
  await untilDeleted.resume();
  assert.deepEqual([untilDeleted.accepting, untilDeleted.readOnly, saves.length], [true, false, 1]);
  time = 9001000; audio('moment-10').resolve(); vision('moment-10').resolve();
  assert.equal(await untilDeleted.ingest(block(9000)), 'moment-10'); await tick();
  await untilDeleted.prune();
  assert.deepEqual([untilDeleted.segments.length, untilDeleted.history.length, removed.length], [5, 0, 0], 'nothing expires without a rolling window');
  await untilDeleted.close();
  // Resumed by a host set to a rolling window, then swept long after: nothing promised until deletion goes.
  const promised = make({ retentionMs: 1000 });
  promised.restore(saved, { hasMedia: () => true });
  await promised.resume(); time += 600000; await promised.prune();
  assert.deepEqual([promised.snapshot().retention, promised.segments.map(s => s.available), promised.history.length, removed.length], ['until-deleted', [true, true, true, true], 0, 0]);
  await promised.close();
  // Les anciennes archives deviennent durables après décodage de leurs motifs historiques.
  const windowed = make({ retentionMs: 1000 });
  windowed.restore({ ...saved, retention: 'rolling', retentionMs: 300000 }, { hasMedia: () => true });
  await windowed.resume(); await windowed.prune();
  assert.deepEqual([windowed.snapshot().retention, windowed.segments.length, removed], ['until-deleted', 4, []]);
  await windowed.close();
  const clock = new SessionClock(() => time, { elapsedMs: 5000, paused: true });
  time += 60000; assert.equal(clock.now(), 5000); clock.resume(); time += 250; assert.equal(clock.now(), 5250);
});

test('the cleanup of a former version cannot erase durable media, and media it left behind are read in place', async t => {
  const f = await fixture(t), live = f.open(), dir = path.join(f.sessionsRoot, live.id);
  f.clock = 8000; await live.watch.ingest(f.block(0, 8000)); await settle(live.watch);
  await live.store.flush();
  await cleanupRawMedia(f.sessionsRoot);
  assert.equal(await live.store.has('moment-1'), true);
  assert.ok((await live.thumbnails.read('moment-1')).length);
  assert.deepEqual((await fs.readdir(dir)).filter(name => !name.endsWith('.json')).sort(), ['media', 'thumbs']);

  // Layout of a former version: both files at the root of the session directory, thumbnails/ beside them.
  const old = path.join(f.sessionsRoot, randomUUID());
  await fs.mkdir(path.join(old, 'thumbnails'), { recursive: true });
  await fs.writeFile(path.join(old, 'moment-1.webm'), 'former clip');
  await fs.writeFile(path.join(old, 'moment-1.json'), JSON.stringify({ frames: [{ atMs: 0, dataUrl: 'x' }], audio: null }));
  await fs.writeFile(path.join(old, 'moment-2.webm'), 'half a passage');
  await fs.writeFile(path.join(old, 'thumbnails', 'moment-1.jpg'), 'former thumbnail');
  const before = await tree(old), store = LocalSessionStore.forSession(old);
  const inventory = await store.inventory();
  assert.deepEqual([[...inventory.ids], [...inventory.legacy], inventory.partial, [...inventory.thumbs]], [['moment-1'], ['moment-1'], ['moment-2'], ['moment-1']]);
  assert.equal((await store.read('moment-1')).frames.length, 1);
  assert.equal(await (await store.response('moment-1')).text(), 'former clip');
  const release = await store.lease(['moment-1']);
  assert.equal(store.file('moment-1', 'webm'), path.join(old, 'moment-1.webm'), 'an inspection decodes the file where it is');
  await release();
  await assert.rejects(store.lease(['moment-2']), /indisponible/, 'half a passage cannot be inspected');
  const thumbnails = new SessionThumbnails(path.join(old, 'thumbs'), { legacyRoot: path.join(old, 'thumbnails') });
  assert.equal(String(await thumbnails.read('moment-1')), 'former thumbnail');
  assert.deepEqual(await tree(old), before, 'nothing is migrated');

  // The former end-of-session purge still exists, on request and for this session only: its text stays.
  await live.close({ purge: true });
  assert.deepEqual((await fs.readdir(dir)).sort(), ['manifest.json', 'session.json']);
  assert.deepEqual([live.manifest().state, live.manifest().media.stored, live.manifest().media.missing, live.manifest().media.bytes], ['archived', 0, 1, 0]);
  assert.deepEqual(await tree(old), before);
  const purged = (await f.reopen(new SessionLibrary({ root: f.sessionsRoot }), live.id)).session.watch.snapshot().segments[0];
  assert.deepEqual([purged.available, purged.mediaReason, purged.thumbnailAvailable], [false, 'missing', false], 'a reopened session never announces media that are gone');
});

test('a long capture costs no directory listing, media read or disk measurement per tick, one manifest per 30 s and a bounded index feed', async t => {
  const f = await fixture(t), fsp = require('node:fs/promises');
  let wall = 1000, measures = 0;
  const guard = new DiskGuard({ path: f.sessionsRoot, freeBytes: async () => { measures++; return 50 * 1024 ** 3; }, now: () => wall });
  const live = f.open({ guard }), dir = path.join(f.sessionsRoot, live.id);
  const fed = [], observe = live.search.index.observe.bind(live.search.index);
  live.search.index.observe = passages => { fed.push(passages.length); observe(passages); };
  let manifests = 0; const saveManifest = live.store.saveManifest.bind(live.store);
  live.store.saveManifest = patch => { manifests++; return saveManifest(patch); };
  const readdir = t.mock.method(fsp, 'readdir'), readFile = t.mock.method(fsp, 'readFile');
  for (let i = 0; i < 60; i++) { f.clock = (i + 1) * 1000; await live.watch.ingest(f.block(i * 1000, (i + 1) * 1000, 'data:image/jpeg;base64,YQ==')); await settle(live.watch); }
  assert.deepEqual([live.watch.segments.length, live.watch.history.length, live.watch.segments.every(s => s.available && s.status === 'ready')], [60, 0, true]);
  // Saves in flight publish late: wait for them, then look at one emission of the whole, analysed session.
  await live.store.serial; await tick(); live.watch.emit();
  assert.deepEqual([Math.max(...fed), fed.at(-1)], [INDEX_OBSERVE_TAIL, INDEX_OBSERVE_TAIL], 'the index is only shown the tail of the session');
  assert.equal(manifests, Math.ceil(60000 / MANIFEST_EVERY_MS), 'first passage, then every 30 s of capture');
  assert.equal(measures, 1, 'sixty writes inside one cache period measure the disk once');
  const reads = readFile.mock.callCount(), states = [];
  for (let i = 0; i < 200; i++) { await live.watch.prune(); live.watch.emit(); states.push(live.watch.snapshot().storage); }
  assert.deepEqual([readdir.mock.callCount(), readFile.mock.callCount() - reads, measures, manifests], [0, 0, 1, 2], 'two hundred ticks touch neither the directory, the media nor the disk');
  wall += 6000; f.clock = 61000; await live.watch.ingest(f.block(60000, 61000, 'data:image/jpeg;base64,YQ=='));
  assert.equal(measures, 2, 'a write after the cache period measures again');
  readdir.mock.restore(); readFile.mock.restore();
  const onDisk = (await Promise.all((await fs.readdir(path.join(dir, 'media'))).map(async name => (await fs.stat(path.join(dir, 'media', name))).size))).reduce((a, b) => a + b, 0);
  const storage = live.watch.snapshot().storage;
  assert.deepEqual(Object.keys(storage), ['state', 'freeBytes', 'minFreeBytes', 'sessionBytes', 'bytesPerMinute', 'remainingMinutes']);
  assert.deepEqual([storage.state, storage.sessionBytes, storage.bytesPerMinute], ['ok', onDisk, Math.round(onDisk * 60000 / 61000)]);
  assert.equal(storage.remainingMinutes, Math.floor((storage.freeBytes - storage.minFreeBytes) / storage.bytesPerMinute));
  const ignored = f.open({ retentionMs: -5 }).watch.snapshot();
  assert.deepEqual([ignored.retention, ignored.retentionMs], ['until-deleted', null]);
});

test('stopping the server host keeps the current session whole, and the next start finds it archived', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-stop-')), sessionsRoot = path.join(root, 'sessions');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let clock = 0;
  const host = () => new HeadlessRuntime({ userData: root, sessionsRoot, config: {}, selectedModels: {}, smoke: true, readClock: () => clock,
    agent: { answer: async () => ({ answer: 'ok', kind: 'explanation', citations: [], limits: [] }) } });
  const first = host(), { id } = await first.start();
  clock = 8000;
  await first.ingest({ sessionId: id, startMs: 0, endMs: 8000, clip: Buffer.from('clip'), frames: [{ atMs: 0, dataUrl: 'data:image/jpeg;base64,YQ==' }], audio: null });
  await settle(first.session.watch);
  // What a service stop runs today (SIGTERM): no purge any more.
  await first.close();
  assert.deepEqual((await fs.readdir(path.join(sessionsRoot, id, 'media'))).sort(), ['moment-1.json', 'moment-1.webm']);
  // Next start of the same host version, including its former start-up sweep.
  await cleanupRawMedia(sessionsRoot);
  const second = host(); t.after(() => second.close());
  const library = new SessionLibrary({ root: sessionsRoot });
  assert.deepEqual((await library.list({ current: second.session?.id })).map(s => [s.id, s.state, s.media.stored]), [[id, 'archived', 1]]);
  const { session } = await openArchivedSession({ library, id, userData: root, config: {}, selectedModels: {}, smoke: true, readClock: () => clock });
  t.after(() => session.close());
  assert.equal(await (await session.store.response('moment-1')).text(), 'clip');
});

test('ending a session while a passage is still being written waits for it: reopened, the passage is on the timeline and can be re-examined', async t => {
  const f = await fixture(t), analysis = gates();
  const perception = { transcribe: async () => ({ observation: {} }), observeVisual: async input => { await analysis(input.id).promise; return { observation: { summary: `Résumé ${input.id}` }, cost: 0 }; } };
  const live = f.open({ host: 'server', overrides: { perception } }), id = live.id, dir = path.join(f.sessionsRoot, id);
  analysis('moment-1').resolve();
  f.clock = 8000; await live.watch.ingest(f.block(0, 8000)); await settle(live.watch); await live.store.serial;
  // The second passage is held in mid-write, as on a slow disk, and the host ends the session meanwhile.
  const fsp = require('node:fs/promises'), writeFile = fsp.writeFile, entered = deferred(), onDisk = deferred();
  const slow = t.mock.method(fsp, 'writeFile', async (file, ...rest) => { if (String(file).endsWith('moment-2.json')) { entered.resolve(); await onDisk.promise; } return writeFile(file, ...rest); });
  f.clock = 16000;
  const writing = live.watch.ingest(f.block(8000, 16000));
  await entered.promise;
  let ended = false;
  const ending = live.archive().then(manifest => { ended = true; return manifest; });
  for (let i = 0; i < 20; i++) await tick();
  assert.equal(ended, false, 'the session is not saved and archived while a write it admitted is still on its way');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'session.json'), 'utf8')).segments.map(s => s.id), ['moment-1']);
  await assert.rejects(live.watch.ingest(f.block(16000, 24000)), /arrêtée/, 'nothing new is admitted meanwhile');
  onDisk.resolve();
  assert.equal(await writing, 'moment-2');
  const manifest = await ending; slow.mock.restore();
  assert.deepEqual([manifest.state, manifest.passages, manifest.media.stored, manifest.media.missing], ['archived', 2, 2, 0]);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'session.json'), 'utf8')).segments.map(s => [s.id, s.available, s.thumbnailAvailable]),
    [['moment-1', true, true], ['moment-2', true, true]], 'every identifier ingest() handed back is in the saved state, thumbnail included');

  const library = new SessionLibrary({ root: f.sessionsRoot }), before = await tree(dir);
  const { session, archive } = await f.reopen(library, id);
  assert.deepEqual([archive.inventory.orphans, archive.inventory.recovered, archive.summary.passages], [[], [], 2], 'ending left no media outside the saved state');
  const state = session.watch.snapshot();
  assert.deepEqual(state.segments.map(s => [s.id, s.status, s.available, s.thumbnailAvailable, s.error]),
    [['moment-1', 'ready', true, true, undefined], ['moment-2', 'error', true, true, 'Analyse interrompue à la fermeture de la session.']]);
  assert.equal((await inspect(session, 8000, 16000)).observations[0].id, 'moment-2', 'the lease found both real files of the passage that landed during the end');
  assert.equal(await (await session.store.response('moment-2')).text(), 'clip 8000');
  await session.pause(); await session.close();
  assert.deepEqual(await tree(dir), before);
  analysis('moment-2').resolve();
});

test('a core session closed without waiting still saves a passage that lands afterwards, before handing its identifier back', async () => {
  const gate = deferred(), saves = [], files = new Map();
  // Only the second write is slow: the first passage is stored, analysed and saved as usual.
  const media = { put: async (id, input) => { if (id === 'moment-2') await gate.promise; files.set(id, input); }, read: async id => files.get(id), remove: async () => {} };
  const watch = new WatchSession({ id: 's', now: () => 2000, perception: { transcribe: async () => ({ observation: {} }), observeVisual: async () => ({ observation: { summary: 'Résumé' } }) }, media, archive: { save: async state => { saves.push(state); } } });
  const block = i => ({ startMs: i * 1000, endMs: (i + 1) * 1000, frames: [], audio: null });
  assert.equal(await watch.ingest(block(0)), 'moment-1'); await settle(watch);
  const writing = watch.ingest(block(1)); await tick();
  await watch.close();
  assert.deepEqual(saves.at(-1).segments.map(s => s.id), ['moment-1'], 'close() itself does not wait: the write may never return');
  gate.resolve();
  assert.equal(await writing, 'moment-2');
  assert.deepEqual(saves.at(-1).segments.map(s => [s.id, s.status, s.available]), [['moment-1', 'ready', true], ['moment-2', 'queued', true]]);
  assert.deepEqual([saves.at(-1).pending, watch.running], [0, false], 'landed, saved, and never sent to analysis');
});

test('a session cut short reopens read-only with every stored passage: its first one never saved, media newer than its saved state put back in order, media without interval only counted', async t => {
  const f = await fixture(t), analysis = gates(), INTERRUPTED = 'Analyse interrompue à la fermeture de la session.';
  // The first analysis never returns: what a power cut leaves on disk is the directory as it is, copied under another root.
  const perception = { transcribe: async input => { await analysis(input.id).promise; return { observation: {} }; },
    observeVisual: async () => ({ observation: { summary: 'Jamais rendu' }, cost: 0 }) };
  const live = f.open({ host: 'server', overrides: { perception } }), id = live.id, dir = path.join(f.sessionsRoot, id);
  const cut = async name => { await live.store.serial; const root = path.join(f.root, name); await fs.cp(dir, path.join(root, id), { recursive: true }); return root; };
  const opened = async root => { const library = new SessionLibrary({ root }), [listed] = await library.list(), { session, archive } = await f.reopen(library, id); return { library, listed, session, archive, state: session.watch.snapshot() }; };
  const passages = state => [...state.history, ...state.segments].map(p => [p.id, p.startMs, p.endMs, p.status, p.available, p.thumbnailAvailable, p.error]);
  const unanalysed = (n, startMs) => [`moment-${n}`, startMs, startMs + 8000, 'error', true, true, INTERRUPTED];

  // Cut during the analysis of the very first passage.
  f.clock = 8000; assert.equal(await live.watch.ingest(f.block(0, 8000)), 'moment-1');
  assert.equal(live.watch.segments[0].status, 'analyzing');
  const first = await cut('cut-first');
  assert.deepEqual((await fs.readdir(path.join(first, id))).sort(), ['manifest.json', 'media', 'session.json', 'thumbs'], 'the state reached the disk with the first stored passage');
  const a = await opened(first);
  assert.deepEqual([a.listed.state, a.listed.passages, a.listed.media.stored], ['interrupted', 1, 1]);
  assert.deepEqual([a.state.readOnly, a.state.accepting, a.state.elapsedMs, a.state.unplacedMedia], [true, false, 8000, 0]);
  assert.deepEqual(passages(a.state), [unanalysed(1, 0)]);
  assert.equal((await inspect(a.session, 0, 8000)).observations[0].id, 'moment-1');

  // Cut before that first save landed: only the manifest and the media say a session was there.
  const unsaved = await cut('cut-unsaved'), bare = path.join(unsaved, id);
  await fs.rm(path.join(bare, 'session.json'));
  const untouched = await tree(bare), b = await opened(unsaved);
  assert.deepEqual([b.listed.state, b.listed.passages, b.archive.inventory.recovered, b.archive.inventory.orphans], ['interrupted', 1, ['moment-1'], []]);
  assert.deepEqual([b.state.readOnly, b.state.accepting, b.state.elapsedMs], [true, false, 8000]);
  assert.deepEqual(passages(b.state), [unanalysed(1, 0)]);
  assert.equal((await inspect(b.session, 0, 8000)).observations[0].id, 'moment-1', 'the lease found the real files of a passage no saved state ever listed');
  assert.equal(await (await b.session.store.response('moment-1')).text(), 'clip 0');
  await b.session.pause(); await b.session.close();
  assert.deepEqual(await tree(bare), untouched, 'rebuilding a state wrote nothing');
  // Not even a manifest: stored media are enough, and the session is still one that was cut short, not an
  // archive of before manifests. A directory that holds nothing of a session stays unreadable.
  await fs.rm(path.join(bare, 'manifest.json'));
  const empty = randomUUID(); await fs.mkdir(path.join(unsaved, empty));
  const c = await opened(unsaved);
  assert.deepEqual((await c.library.list()).map(s => [s.id, s.state, s.passages, s.media.stored]).sort(), [[id, 'interrupted', 1, 1], [empty, 'unreadable', 0, 0]].sort());
  assert.deepEqual([c.archive.manifest, passages(c.state)], [null, [unanalysed(1, 0)]]);
  await assert.rejects(c.library.read(empty), { message: 'Archive illisible.' });

  // Two more passages are stored while the first analysis still runs: the saved state only knows the first.
  f.clock = 16000; await live.watch.ingest(f.block(8000, 16000)); f.clock = 24000; await live.watch.ingest(f.block(16000, 24000));
  const later = await cut('cut-later'), image = path.join(later, id), media = path.join(image, 'media');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(image, 'session.json'), 'utf8')).segments.map(s => s.id), ['moment-1']);
  // As a former version wrote them: a whole pair that carries no interval, and half a pair.
  await fs.writeFile(path.join(media, 'moment-7.webm'), 'clip sans bornes');
  await fs.writeFile(path.join(media, 'moment-7.json'), JSON.stringify({ frames: [{ atMs: 0, dataUrl: 'x' }], audio: null }));
  await fs.writeFile(path.join(media, 'moment-8.webm'), 'moitié de passage');
  const kept = await tree(image), d = await opened(later);
  assert.deepEqual([d.archive.inventory.recovered, d.archive.inventory.orphans], [['moment-2', 'moment-3'], ['moment-7', 'moment-8']]);
  assert.deepEqual(passages(d.state), [unanalysed(1, 0), unanalysed(2, 8000), unanalysed(3, 16000)]);
  assert.deepEqual([d.state.readOnly, d.state.elapsedMs, d.state.coverage.passages, d.state.unplacedMedia], [true, 24000, 3, 2], 'the clock reopens past the passages put back; the two others are counted');
  assert.deepEqual((await inspect(d.session, 8000, 20000)).observations.map(o => o.id), ['moment-2', 'moment-3'], 'media the saved state never knew are leased and re-examined');
  assert.equal(JSON.stringify(d.state).includes('moment-7') || JSON.stringify(d.state).includes('moment-8'), false, 'media without a known interval are never shown as a passage');
  await assert.rejects(d.session.store.lease(['moment-8']), /indisponible/);
  d.session.watch.emit(); await d.session.watch.prune(); await d.session.pause(); await d.session.close(); await tick();
  assert.deepEqual(await tree(image), kept, 'listing, opening, pausing and closing changed no byte: nothing erased, moved or rewritten');
  // A saved state that knows the passages around it: the one put back takes its place by its interval.
  const gap = path.join(f.root, 'cut-gap', id); await fs.cp(image, gap, { recursive: true });
  const known = JSON.parse(await fs.readFile(path.join(gap, 'session.json'), 'utf8'));
  await fs.writeFile(path.join(gap, 'session.json'), JSON.stringify({ ...known, elapsedMs: 30000, segments: [known.segments[0], { id: 'moment-3', startMs: 16000, endMs: 24000, status: 'ready', available: true, observation: { summary: 'Vu' } }] }));
  const placed = await new SessionLibrary({ root: path.dirname(gap) }).read(id);
  assert.deepEqual([placed.snapshot.segments.map(s => s.id), placed.inventory.recovered, placed.snapshot.elapsedMs], [['moment-1', 'moment-2', 'moment-3'], ['moment-2'], 30000]);

  // Explicit resume: the passages put back are saved with the session, capture continues after them and
  // numbers past every file on disk; the media that could not be placed are still there.
  const resumed = (await f.reopen(d.library, id)).session;
  await resumed.resume();
  assert.equal(resumed.watch.now(), 24000);
  f.clock += 8000;
  assert.equal(await resumed.watch.ingest(f.block(24000, 32000)), 'moment-9'); await settle(resumed.watch);
  await resumed.close();
  const after = await d.library.read(id);
  assert.deepEqual([after.snapshot.segments.map(s => [s.id, s.status]), after.inventory.recovered, after.inventory.orphans],
    [[['moment-1', 'error'], ['moment-2', 'error'], ['moment-3', 'error'], ['moment-9', 'ready']], [], ['moment-7', 'moment-8']]);
  assert.deepEqual((await fs.readdir(media)).filter(name => /moment-[78]\./.test(name)).sort(), ['moment-7.json', 'moment-7.webm', 'moment-8.webm']);
  for (const n of [1, 2, 3]) analysis(`moment-${n}`).resolve();
});

test('a saved state that parses but has another shape is an unreadable archive, said in plain words, wherever it is handed over', async t => {
  const f = await fixture(t), library = new SessionLibrary({ root: f.sessionsRoot });
  const base = id => ({ id, elapsedMs: 8000, retention: 'until-deleted', history: [], questions: [], segments: [{ id: 'moment-1', startMs: 0, endMs: 8000, status: 'ready', available: true, observation: { summary: 'Résumé' } }] });
  const shapes = [id => ({ ...base(id), segments: [null] }), id => ({ ...base(id), history: 7 }), id => ({ ...base(id), questions: 'aucune' }), id => ({ ...base(id), questions: [null] }),
    id => ({ ...base(id), segments: [{ id: '../moment-1', startMs: 0, endMs: 8000 }] }), id => ({ ...base(id), segments: [{ id: 'moment-1', startMs: '0' }] }), id => ({ ...base(id), history: [{ summary: 'Sans identifiant' }] }), id => ({ ...base(id), segments: {} })];
  const save = async shape => { const id = randomUUID(), dir = path.join(f.sessionsRoot, id); await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, 'session.json'), JSON.stringify(shape(id))); return id; };
  const core = () => new WatchSession({ id: 's', now: () => 0, perception: {}, media: {}, archive: { save: async () => {} } });
  const inventory = { ids: new Set(), legacy: new Set(), partial: [], thumbs: new Set(), mediaBytes: 0, thumbBytes: 0, bytes: 0 };
  for (const shape of shapes) {
    const id = await save(shape), label = JSON.stringify(shape('s'));
    await assert.rejects(library.read(id), { name: 'Error', message: 'Archive illisible.' }, label);
    await assert.rejects(f.reopen(library, id), { name: 'Error', message: 'Archive illisible.' }, label);
    assert.equal((await library.list()).find(s => s.id === id).state, 'unreadable', label);
    // The same guard where a host hands a state over itself: the core, and the runtime before it builds anything.
    assert.throws(() => core().restore(shape('s')), { name: 'Error', message: 'Archive illisible.' }, label);
    assert.throws(() => f.open({ restore: { snapshot: shape(id), inventory } }), { name: 'Error', message: 'Archive illisible.' }, label);
  }
  // A whole file that is not a session state at all, and one saved for another session.
  for (const content of ['[]', '"session"', '{"id":7,"segments":[]}', '{ pas du JSON', JSON.stringify(base(randomUUID()))]) {
    const id = randomUUID(), dir = path.join(f.sessionsRoot, id); await fs.mkdir(dir); await fs.writeFile(path.join(dir, 'session.json'), content);
    await assert.rejects(library.read(id), { message: 'Archive illisible.' }, content);
  }
  // The same for the manifest of the session: one that parses but has another shape is an unreadable
  // archive too, never a raw TypeError half-way through the reopening.
  for (const broken of [{ captures: 7 }, { captures: 'hier' }, { captures: [null] }, { media: 3 }, { title: 12 }, { elapsedMs: 'long' }]) {
    const id = await save(base), label = JSON.stringify(broken), manifest = { format: 'tvlens-session', version: 1, id, state: 'live', ...broken };
    await fs.writeFile(path.join(f.sessionsRoot, id, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(library.read(id), { name: 'Error', message: 'Archive illisible.' }, label);
    await assert.rejects(f.reopen(library, id), { name: 'Error', message: 'Archive illisible.' }, label);
    assert.equal((await library.list()).find(s => s.id === id).state, 'unreadable', label);
    assert.throws(() => f.open({ restore: { snapshot: base(id), inventory, manifest } }), { name: 'Error', message: 'Archive illisible.' }, label);
  }
  // The well-formed state next to them opens, and stays as it was.
  const good = await save(base), dir = path.join(f.sessionsRoot, good);
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ format: 'tvlens-session', version: 1, id: good, state: 'live', title: 'Soirée', captures: [{ startedAt: 1, fromMs: 0 }], media: { stored: 0, missing: 1, bytes: 0, retention: 'until-deleted' } }));
  const before = await tree(dir);
  const { session, archive } = await f.reopen(library, good);
  assert.deepEqual([archive.summary.title, archive.summary.state, archive.manifest.captures.length], ['Soirée', 'interrupted', 1], 'a well-formed manifest is read as before');
  assert.deepEqual(session.watch.snapshot().segments.map(s => [s.id, s.status, s.available, s.mediaReason]), [['moment-1', 'ready', false, 'missing']]);
  await session.close();
  assert.deepEqual(await tree(dir), before);
});

test('a saved state of another format or version is refused by its code wherever it is handed over, and its folder stays as it was', async t => {
  const f = await fixture(t), library = new SessionLibrary({ root: f.sessionsRoot });
  const passage = { id: 'moment-1', startMs: 0, endMs: 8000, status: 'ready', available: true, observation: { summary: 'Résumé' } };
  const model = id => ({ id, elapsedMs: 8000, retention: 'until-deleted', history: [], questions: [], segments: [{ ...passage }] });
  const core = () => new WatchSession({ id: 's', now: () => 0, perception: {}, media: {}, archive: { save: async () => {} } });
  const inventory = { ids: new Set(), legacy: new Set(), partial: [], thumbs: new Set(), mediaBytes: 0, thumbBytes: 0, bytes: 0 };
  const code = { code: 'TVLENS_ARCHIVE_INVALID' }, refusal = { code: 'invalid-archive', status: 400 };
  const envelopes = [
    { format: 'tvlens-viewing-memory', version: 2 }, { format: 'tvlens-viewing-memory' }, { version: 1 }, { format: 'tvlens-session', version: 1 },
  ];
  for (const envelope of envelopes) {
    const id = randomUUID(), dir = path.join(f.sessionsRoot, id), label = JSON.stringify(envelope);
    await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, 'session.json'), JSON.stringify({ ...envelope, ...model(id) }));
    const before = await tree(dir);
    await assert.rejects(library.read(id), code, label);
    await assert.rejects(f.reopen(library, id), code, label);
    assert.equal((await library.list()).find(s => s.id === id).state, 'unreadable', label);
    assert.throws(() => core().restore({ ...envelope, ...model('s') }), code, label);
    assert.throws(() => f.open({ restore: { snapshot: { ...envelope, ...model(id) }, inventory } }), refusal, label);
    assert.deepEqual(await tree(dir), before, label);
  }
  // The version this host writes is restored by the core as well, without its markers.
  const watch = core();
  watch.restore({ format: 'tvlens-viewing-memory', version: 1, ...model('s') });
  assert.deepEqual(watch.snapshot().segments.map(s => [s.id, s.status, s.available, s.mediaReason]), [['moment-1', 'ready', false, 'missing']]);
});

test('a passage that lands while its session is being ended is kept and saved, but starts no analysis only to have it abandoned', async t => {
  const f = await fixture(t), calls = { transcribe: 0, visual: 0 };
  // Split perception with vision free during questions, as in production: nothing else would hold a new analysis back.
  const perception = { transcribe: async () => { calls.transcribe++; return { observation: { transcript: 'Paroles' }, elapsedMs: 1 }; },
    observeVisual: async () => { calls.visual++; return { observation: { summary: 'Images' }, elapsedMs: 1 }; } };
  const live = f.open({ host: 'server', config: { visionDuringAsk: true }, overrides: { perception } }), id = live.id;
  f.clock = 8000; await live.watch.ingest(f.block(0, 8000)); await settle(live.watch); await live.store.serial;
  assert.deepEqual(calls, { transcribe: 1, visual: 1 });
  // The second passage is held in mid-write, and the host ends the session meanwhile.
  const put = live.store.put.bind(live.store), entered = deferred(), onDisk = deferred();
  live.store.put = async (passage, input) => { if (passage === 'moment-2') { entered.resolve(); await onDisk.promise; } return put(passage, input); };
  f.clock = 16000;
  const writing = live.watch.ingest(f.block(8000, 16000));
  await entered.promise;
  const ending = live.archive();
  for (let i = 0; i < 10; i++) await tick();
  onDisk.resolve();
  assert.equal(await writing, 'moment-2');
  await ending; for (let i = 0; i < 10; i++) await tick();
  assert.deepEqual(calls, { transcribe: 1, visual: 1 }, 'no provider call left for a passage that landed during the end');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.sessionsRoot, id, 'session.json'), 'utf8')).segments.map(s => [s.id, s.status, s.available, s.thumbnailAvailable]),
    [['moment-1', 'ready', true, true], ['moment-2', 'queued', true, true]]);
  // Reopened: replayable, and honestly unanalysed.
  const { session } = await f.reopen(new SessionLibrary({ root: f.sessionsRoot }), id);
  assert.deepEqual(session.watch.snapshot().segments.map(s => [s.id, s.status, s.available, s.error]),
    [['moment-1', 'ready', true, undefined], ['moment-2', 'error', true, 'Analyse interrompue à la fermeture de la session.']]);
  assert.equal(await (await session.store.response('moment-2')).text(), 'clip 8000');
});

test('a block already stored is refused on observation order even after a rolling window has emptied the passage list', async () => {
  let time = 0; const stored = [];
  const watch = new WatchSession({ id: 's', now: () => time, retentionMs: 1000, perception: { transcribe: async () => ({ observation: {} }), observeVisual: async () => ({ observation: { summary: 'Résumé' } }) },
    media: { put: async id => { stored.push(id); }, read: async () => ({ frames: [] }), remove: async () => {} }, archive: { save: async () => {} } });
  const block = { startMs: 0, endMs: 1000, frames: [], audio: null };
  time = 1000; assert.equal(await watch.ingest(block), 'moment-1'); await settle(watch);
  time = 60000; await watch.prune();
  assert.deepEqual([watch.segments.length, watch.history.map(p => p.id)], [0, ['moment-1']], 'the only passage left the list with its expired media');
  await assert.rejects(watch.ingest(block), /ordre d’observation/, 'the same block replayed by its capture');
  assert.deepEqual([stored, watch.snapshot().coverage.passages], [['moment-1'], 1], 'never stored a second time');
  assert.equal(await watch.ingest({ ...block, startMs: 59000, endMs: 60000 }), 'moment-2', 'the capture itself goes on, numbering continued');
  await watch.close();
});

test('the store tells a write the disk refused from one that landed: the file keeps what it held, the manifest asked for is not the manifest written, and the final barrier names what is missing', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-flush-')), dir = path.join(root, randomUUID());
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = LocalSessionStore.forSession(dir), saved = async name => JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
  await store.save({ id: 's', saves: 1 }); await store.saveResearch({ jobs: ['deep-1'] }); await store.saveManifest({ state: 'live', title: 'Film' });
  await store.flush();
  assert.deepEqual([store.manifest, store.confirmed], [{ state: 'live', title: 'Film' }, { state: 'live', title: 'Film' }]);

  let restore = refusing(t, 'session.json', 'manifest.json');
  await assert.rejects(store.save({ id: 's', saves: 2 }), { code: 'EIO' }, 'whoever asked for a write is still told that it was refused');
  await assert.rejects(store.saveManifest({ state: 'archived' }), error => error.code === 'EIO' && /manifest\.json/.test(error.message) && !error.message.includes(root));
  // A later write of another file lands: the chain goes on, and forgets nothing of what it refused.
  await store.saveResearch({ jobs: ['deep-1', 'deep-2'] });
  assert.deepEqual([store.manifest.state, store.confirmed.state, (await saved('manifest.json')).state, (await saved('session.json')).saves, (await saved('deep-answers.json')).jobs.length],
    ['archived', 'live', 'live', 1, 2], 'what was asked for is not what the disk holds');
  await assert.rejects(store.flush(), error => error.code === 'EIO' && /session\.json/.test(error.message) && !/manifest|deep-answers/.test(error.message) && !error.message.includes(root),
    'the state file by its name, never by a path; the manifest is written after this barrier and answers for itself');
  restore();
  await assert.rejects(store.flush(), /session\.json/, 'a disk that takes writes again has not written the file');
  await store.save({ id: 's', saves: 3 });
  await store.flush();
  await store.saveManifest({});
  assert.deepEqual([store.confirmed.state, (await saved('manifest.json')).state, (await saved('session.json')).saves], ['archived', 'archived', 3]);

  // A session being deleted has nothing left to confirm, and gets nothing back.
  restore = refusing(t, 'session.json');
  await assert.rejects(store.save({ id: 's', saves: 4 }), { code: 'EIO' });
  restore();
  await store.seal(); await store.flush(); await store.save({ id: 's', saves: 5 });
  assert.equal((await saved('session.json')).saves, 3);
});

test('a save the disk refused stays said by the session until a save lands: an analysis that succeeds meanwhile does not clear it, a save that lands does, and closing still ends', async () => {
  const SAVE = 'Impossible de sauvegarder le résumé de session.';
  let time = 0, refuse = true; const files = new Map(), states = [], described = deferred();
  // Split perception, as in production: each lane publishes before it saves. The description is held until the
  // first saves have been refused.
  const watch = new WatchSession({ id: 's', now: () => time, onChange: state => states.push(state),
    perception: { transcribe: async () => ({ observation: { transcript: 'Paroles' } }), observeVisual: async () => { await described.promise; return { observation: { summary: 'Images', visual: 'Image' } }; } },
    media: { put: async (id, input) => { files.set(id, input); }, read: async id => files.get(id), remove: async () => {} },
    archive: { save: async () => { if (refuse) throw Object.assign(new Error('EIO: i/o error, write'), { code: 'EIO' }); } } });
  time = 1000; await watch.ingest({ startMs: 0, endMs: 1000, audio: new Uint8Array([1]), frames: [] });
  for (let i = 0; i < 10; i++) await tick();
  assert.deepEqual([watch.segments[0].audioStatus, watch.snapshot().lastError], ['ready', SAVE]);
  described.resolve(); await settle(watch);
  for (let i = 0; i < 10; i++) await tick();
  // The passage is described without a failure of its own, and nothing was saved meanwhile: the state published
  // with its description still says so.
  const published = states.find(state => state.segments[0]?.status === 'ready');
  assert.deepEqual([published.segments[0].observation.summary, published.lastError], ['Images', SAVE]);
  refuse = false; await watch.stop();
  assert.deepEqual([states.at(-1).accepting, states.at(-1).lastError], [false, null], 'said for as long as it is true, and no longer');
  refuse = true; await watch.close();
  assert.deepEqual([watch.closed, watch.snapshot().lastError], [true, SAVE], 'closing ends whatever the disk did, and the session still knows that its last state was refused');
});

test('archive() says archived only once the final states are on disk: refused on the state, the questions or the manifest, it rejects with every resource released and the folder as last confirmed, and asked again once the disk is back it archives', async t => {
  const f = await fixture(t), library = new SessionLibrary({ root: f.sessionsRoot });
  const listed = async id => (await library.list()).filter(s => s.id === id).map(s => s.state);
  const question = status => ({ jobs: [{ id: 'deep-1', status, question: 'Comment ça commence ?' }] });
  for (const file of ['session.json', 'deep-answers.json', 'manifest.json']) {
    const live = f.open({ host: 'server' }), dir = path.join(f.sessionsRoot, live.id), closed = [];
    const raw = name => fs.readFile(path.join(dir, name), 'utf8'), saved = async name => JSON.parse(await raw(name));
    f.clock += 8000; await live.watch.ingest(f.block(0, 8000)); await settle(live.watch); await live.store.serial;
    await live.store.saveResearch(question('running'));
    await live.pause();
    const kept = await raw(file);
    for (const [name, target] of [['index', live.search.index], ['miniatures', live.thumbnails], ['perception', live.perception], ['modèle d’inspection', live.inspectorModel]]) {
      const close = target.close?.bind(target);
      target.close = async () => { closed.push(name); return close?.(); };
    }
    const restore = refusing(t, file);
    // What a host writes when a question reaches its final state while the session ends.
    await live.store.saveResearch(question('cancelled')).catch(() => {});
    const refusal = await live.archive().then(() => null, error => error);
    assert.ok(refusal, `${file} refused: the session is not said archived`);
    assert.deepEqual([refusal.code, refusal.message], ['EIO', `Écriture refusée par le disque (${file}) : EIO`]);
    assert.deepEqual([live.watch.closed, closed, live.closeErrors], [true, ['index', 'miniatures', 'perception', 'modèle d’inspection'], []], 'every resource released, and the refusal said once, by archive()');
    assert.deepEqual([(await saved('manifest.json')).state, await raw(file) === kept], ['live', true], 'nothing on disk says archived, and the refused file is the last one confirmed');
    assert.deepEqual(await listed(live.id), ['interrupted']);
    // A late pause does not make it look archived, and asking again while the disk still refuses changes nothing.
    await live.pause();
    await assert.rejects(live.archive(), { code: 'EIO' });
    assert.deepEqual([(await saved('manifest.json')).state, closed.length], ['live', 4]);
    restore();
    // The disk takes writes again. What it refused is still not on it: the host writes its questions again, the runtime its state.
    if (file === 'deep-answers.json') { await assert.rejects(live.archive(), /deep-answers\.json/); await live.store.saveResearch(question('cancelled')); }
    const manifest = await live.archive();
    assert.deepEqual([manifest.state, (await saved('manifest.json')).state, (await saved('session.json')).accepting, (await saved('deep-answers.json')).jobs[0].status, closed.length],
      ['archived', 'archived', false, 'cancelled', 4], 'archived for good, its adapters closed once');
    assert.deepEqual(await listed(live.id), ['archived']);
    // Reopened and closed again, the confirmed archive is not rewritten.
    const before = await tree(dir), { session } = await f.reopen(library, live.id);
    assert.deepEqual(session.watch.snapshot().segments.map(s => [s.id, s.status, s.available]), [['moment-1', 'ready', true]]);
    assert.equal((await session.archive()).state, 'archived');
    assert.deepEqual(await tree(dir), before);
  }
  // A refusal that never reaches the store's own writes (the archive port itself says no) is known to the
  // session alone: it keeps the session from being said archived all the same.
  const deaf = f.open({ host: 'server' }), save = deaf.store.save.bind(deaf.store);
  f.clock += 8000; await deaf.watch.ingest(f.block(0, 8000)); await settle(deaf.watch); await deaf.store.serial;
  await deaf.pause();
  deaf.store.save = async () => { throw Object.assign(new Error('EIO: i/o error, write'), { code: 'EIO' }); };
  await assert.rejects(deaf.archive(), { message: 'Impossible de sauvegarder le résumé de session.' });
  assert.deepEqual([deaf.watch.closed, JSON.parse(await fs.readFile(path.join(f.sessionsRoot, deaf.id, 'manifest.json'), 'utf8')).state, await listed(deaf.id)], [true, 'live', ['interrupted']]);
  deaf.store.save = save;
  assert.deepEqual([(await deaf.archive()).state, await listed(deaf.id)], ['archived', ['archived']]);

  // A directory that takes no write at all, as the ticket puts it: every state file is named, and "archived"
  // is not even attempted.
  const sunk = f.open({ host: 'server' });
  f.clock += 8000; await sunk.watch.ingest(f.block(0, 8000)); await settle(sunk.watch); await sunk.store.serial;
  await sunk.store.saveResearch(question('running')); await sunk.pause();
  const none = refusing(t, 'session.json', 'deep-answers.json', 'manifest.json');
  await sunk.store.saveResearch(question('cancelled')).catch(() => {});
  await assert.rejects(sunk.archive(), { code: 'EIO', message: 'Écriture refusée par le disque (deep-answers.json, session.json) : EIO' });
  none();
  assert.deepEqual([sunk.watch.closed, JSON.parse(await fs.readFile(path.join(f.sessionsRoot, sunk.id, 'manifest.json'), 'utf8')).state, await listed(sunk.id)], [true, 'live', ['interrupted']]);

  // Deleting waits for no confirmation: a sealed session writes nothing, so nothing of it can be refused.
  const doomed = f.open();
  f.clock += 8000; await doomed.watch.ingest(f.block(0, 8000)); await settle(doomed.watch); await doomed.store.serial;
  const restore = refusing(t, 'session.json');
  await doomed.pause(); await doomed.seal();
  restore();
  await library.remove(doomed.id);
  assert.deepEqual(await listed(doomed.id), []);
});

test('an archive reopened and resumed is archived on what this life wrote, never on what an earlier one left in its manifest: refused, its end says so, a late pause does not write "archived", and once the disk is back the list carries the new totals', async t => {
  const f = await fixture(t), library = new SessionLibrary({ root: f.sessionsRoot });
  const first = f.open({ host: 'server' }), id = first.id, dir = path.join(f.sessionsRoot, id);
  const raw = name => fs.readFile(path.join(dir, name), 'utf8'), saved = async name => JSON.parse(await raw(name));
  const listed = async () => (await library.list()).map(s => [s.state, s.passages, s.media.stored]);
  f.clock = 8000; await first.watch.ingest(f.block(0, 8000)); await settle(first.watch); await first.store.serial;
  await first.pause();
  assert.equal((await first.archive()).state, 'archived');
  const earlier = await raw('manifest.json');
  assert.deepEqual(await listed(), [['archived', 1, 1]]);

  // A new life of the same session: reopened, resumed, one more passage. The disk refuses its manifest from the resume on.
  const second = (await f.reopen(library, id)).session;
  let restore = refusing(t, 'manifest.json');
  await second.resume();
  f.clock += 8000; assert.equal(await second.watch.ingest(f.block(8000, 16000)), 'moment-2'); await settle(second.watch); await second.store.serial.catch(() => {});
  await second.pause();
  await assert.rejects(second.archive(), { code: 'EIO', message: 'Écriture refusée par le disque (manifest.json) : EIO' });
  assert.deepEqual([second.watch.closed, await raw('manifest.json') === earlier, (await saved('session.json')).segments.map(s => s.id)], [true, true, ['moment-1', 'moment-2']],
    'closed all the same; the manifest on disk is still the one of the earlier life, beside a state that knows more');
  restore();
  // A late pause lands now. The end of this life was refused: what it writes cannot say "archived".
  await second.pause();
  assert.deepEqual([(await saved('manifest.json')).state, await listed()], ['live', [['interrupted', 2, 2]]]);
  const manifest = await second.archive();
  assert.deepEqual([manifest.state, manifest.passages, manifest.captures.length, manifest === second.store.confirmed, await listed()], ['archived', 2, 2, true, [['archived', 2, 2]]],
    'asked again: archived for good, and what archive() hands back is the manifest confirmed on disk');

  // A third life: its manifest is refused while it captures, and the disk is back when it ends. The end writes
  // the manifest of this life instead of trusting the one an earlier life left there.
  const third = (await f.reopen(library, id)).session;
  restore = refusing(t, 'manifest.json');
  await third.resume();
  f.clock += 8000; assert.equal(await third.watch.ingest(f.block(16000, 24000)), 'moment-3'); await settle(third.watch); await third.store.serial.catch(() => {});
  await third.pause();
  restore();
  assert.deepEqual([(await third.archive()).state, (await saved('manifest.json')).captures.length, await listed()], ['archived', 3, [['archived', 3, 3]]]);
});

test('a session whose manifest never reached the disk is listed as cut short, never as an archive of before manifests: live while it is the one in memory, opened read-only without a write, replayable, and archived only by an explicit resume and a confirmed end; a state of before manifests keeps its row', async t => {
  const f = await fixture(t), library = new SessionLibrary({ root: f.sessionsRoot });
  const row = s => [s.state, s.legacy, s.closedAt, s.passages, s.media.stored, s.media.missing];
  // The disk refuses the manifest from the first passage on: the folder is the one the runtime itself leaves.
  const restore = refusing(t, 'manifest.json');
  const live = f.open({ host: 'server' }), id = live.id, dir = path.join(f.sessionsRoot, id);
  const listed = async options => (await library.list(options)).filter(s => s.id === id).map(row);
  f.clock = 8000; await live.watch.ingest(f.block(0, 8000)); await settle(live.watch); await live.store.serial.catch(() => {});
  assert.deepEqual(await listed({ current: id }), [['live', false, null, 1, 1, 0]], 'the session in memory is live, with or without a manifest');
  await live.pause();
  await assert.rejects(live.archive(), { message: 'Écriture refusée par le disque (manifest.json) : EIO' });
  restore();
  assert.deepEqual([(await fs.readdir(dir)).includes('manifest.json'), (await fs.readdir(dir)).includes('session.json')], [false, true]);
  assert.deepEqual(await listed(), [['interrupted', false, null, 1, 1, 0]], 'nothing says that it was closed: no closing date is made up');

  // Opened as any session cut short: read-only, replayable, and not a byte written.
  const before = await tree(dir), { session, archive } = await f.reopen(library, id);
  assert.deepEqual([archive.manifest, archive.summary.state, archive.summary.legacy, archive.summary.closedAt], [null, 'interrupted', false, null]);
  const state = session.watch.snapshot();
  assert.deepEqual([state.readOnly, state.accepting, state.segments.map(s => [s.id, s.status, s.available])], [true, false, [['moment-1', 'ready', true]]]);
  assert.equal(await (await session.store.response('moment-1')).text(), 'clip 0');
  assert.equal((await inspect(session, 0, 8000)).observations[0].id, 'moment-1');
  await session.pause(); await session.close();
  assert.deepEqual([await tree(dir), await listed()], [before, [['interrupted', false, null, 1, 1, 0]]], 'listing, opening, replaying and closing wrote nothing');

  // Only an explicit resume writes again: additive, and its confirmed end gives the session the manifest it never had.
  const resumed = (await f.reopen(library, id)).session;
  await resumed.resume();
  assert.deepEqual(await listed({ current: id }), [['live', false, null, 1, 1, 0]]);
  f.clock += 8000; assert.equal(await resumed.watch.ingest(f.block(8000, 16000)), 'moment-2'); await settle(resumed.watch);
  assert.equal((await resumed.archive()).state, 'archived');
  const [after] = (await library.list()).filter(s => s.id === id);
  assert.deepEqual([after.state, after.legacy, typeof after.closedAt, after.passages, after.media.stored], ['archived', false, 'number', 2, 2]);

  // A state saved before manifests existed names no retention: it is the archive it always was, row unchanged,
  // the session in memory or not. A retention this version does not know is no proof of anything newer.
  const former = randomUUID(), unknown = randomUUID();
  const old = sessionId => ({ id: sessionId, accepting: false, elapsedMs: 16000, retentionMs: 300000, questions: [], history: [],
    segments: [{ id: 'moment-1', startMs: 0, endMs: 8000, status: 'ready', available: true, observation: { topic: 'Énergie', summary: 'Résumé 1' } }] });
  for (const [sessionId, extra] of [[former, {}], [unknown, { retention: 'forever' }]]) {
    await fs.mkdir(path.join(f.sessionsRoot, sessionId));
    await fs.writeFile(path.join(f.sessionsRoot, sessionId, 'session.json'), JSON.stringify({ ...old(sessionId), ...extra }));
  }
  const savedAt = Math.round((await fs.stat(path.join(f.sessionsRoot, former, 'session.json'))).mtimeMs), kept = await tree(path.join(f.sessionsRoot, former));
  const expected = { id: former, title: (await library.read(former)).summary.title, firstTopic: 'Énergie', host: null, createdAt: savedAt, updatedAt: savedAt, closedAt: savedAt, state: 'archived',
    elapsedMs: 16000, passages: 1, media: { stored: 0, missing: 1, bytes: 0 }, legacy: true };
  for (const options of [{}, { current: former }]) assert.deepEqual((await library.list(options)).find(s => s.id === former), expected);
  assert.deepEqual((await library.list()).filter(s => s.id === unknown).map(s => [s.state, s.legacy]), [['archived', true]]);
  assert.deepEqual(await tree(path.join(f.sessionsRoot, former)), kept);
});

test('a disk slower than the states it is handed writes the latest one, not each of them: per file one write runs and one state waits, whoever asked is answered by the write that covers its state, and a disk that keeps up still writes every state it is asked for', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-coalesce-')), dir = path.join(root, randomUUID());
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = LocalSessionStore.forSession(dir), saved = async name => JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
  // The synthetic probe of the ticket: thirty answers of 2 000 characters, and the draft of one more that moves a hundred times.
  const answers = Array.from({ length: 30 }, (_, i) => ({ id: `deep-${i + 1}`, status: 'done', question: `Question ${i + 1} ?`, result: { answer: 'r'.repeat(2000) } }));
  const state = step => ({ jobs: [...answers, { id: 'deep-31', status: 'running', question: 'Et maintenant ?', preview: 'mot '.repeat(step) }] });
  const whole = Buffer.byteLength(JSON.stringify(state(100), null, 2)), held = disk(t, 'deep-answers.json', 'session.json');
  const figures = from => { const writes = held.seen.slice(from).filter(write => write.name === 'deep-answers.json'); return { ecritures: writes.length, octets: writes.reduce((sum, write) => sum + write.bytes, 0) }; };

  // Held: the first state is on its way to the disk when the ninety-nine others are asked for.
  held.hold();
  const asked = [store.saveResearch(state(1))];
  await held.reached(1);
  for (let step = 2; step <= 100; step++) asked.push(store.saveResearch(state(step)));
  const other = store.save({ id: 's', saves: 1 });
  for (let i = 0; i < 20; i++) await tick();
  const started = held.seen.length;
  held.release();
  const written = await Promise.all(asked);
  await other; await store.serial;
  const retained = { ...figures(0), enAttenteDerriereLEcritureEnCours: held.count('deep-answers.json') - started }, sessionWrites = held.count('session.json');
  const newest = [await saved('deep-answers.json'), (await saved('session.json')).saves];
  // Free: each state is on disk before the next one is asked for. The store decides nothing about cadence.
  const from = held.seen.length, kept = [];
  for (let step = 1; step <= 100; step++) { await store.saveResearch(state(step)); if (step % 20 === 0) kept.push(await saved('deep-answers.json')); }
  const free = figures(from);
  // Both regimes are said before anything is asserted: the same probe gives its figures on a tree that fails it.
  t.diagnostic(`sonde F03, synthétique, disque retenu (100 progressions, 30 réponses de 2000 caractères) : ${JSON.stringify(retained)}`);
  t.diagnostic(`sonde F03, synthétique, disque libre (chaque état attendu avant le suivant) : ${JSON.stringify(free)}`);

  assert.equal(started, 1, 'one write runs, and nothing else starts while the disk is held');
  assert.deepEqual([retained.ecritures, retained.enAttenteDerriereLEcritureEnCours, sessionWrites], [2, 1, 1], 'the write in flight, then the latest state: one waited, not ninety-nine');
  assert.ok(retained.octets <= 2 * whole, `${retained.octets} bytes serialised for a hundred states of ${whole}`);
  assert.deepEqual(newest, [state(100), 1], 'the newest state is the one on disk, and the other file was not held back by the ninety-nine');
  assert.deepEqual([written[0], written[1] === written[99], written[99]], [state(1), true, state(100)], 'each caller is told what the write that answered it carried');
  assert.deepEqual([free.ecritures, kept], [100, [20, 40, 60, 80, 100].map(state)], 'a save that is awaited is on disk when it settles');
});

test('a write the disk refuses is said to everyone whose state it carried, and only a write of that very file that lands clears it', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-coalesce-')), dir = path.join(root, randomUUID());
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = LocalSessionStore.forSession(dir), saved = async name => JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
  const held = disk(t, 'deep-answers.json');
  await store.saveResearch({ jobs: ['deep-1'] });
  held.hold(); held.refuse = true;
  const flying = store.saveResearch({ jobs: 2 });
  await held.reached(2);
  const grouped = [3, 4, 5].map(jobs => store.saveResearch({ jobs })), state = store.save({ id: 's', saves: 1 });
  for (let i = 0; i < 20; i++) await tick();
  held.release();
  const outcomes = await Promise.allSettled([flying, ...grouped]);
  assert.deepEqual(outcomes.map(outcome => [outcome.status, outcome.reason?.code]), Array(4).fill(['rejected', 'EIO']), 'the three that shared one write are each told that it was refused');
  await state;
  assert.deepEqual([held.count('deep-answers.json'), await saved('deep-answers.json'), (await saved('session.json')).saves], [3, { jobs: ['deep-1'] }, 1], 'two writes were tried, not four; the file keeps what it held and the other file landed');
  const named = error => error.code === 'EIO' && error.message === 'Écriture refusée par le disque (deep-answers.json) : EIO';
  await assert.rejects(store.flush(), named);
  // Another file that lands says nothing of this one, and a disk that takes writes again has not written it.
  await store.save({ id: 's', saves: 2 });
  await assert.rejects(store.flush(), named);
  held.refuse = false;
  await assert.rejects(store.flush(), named);
  await store.saveResearch({ jobs: 6 });
  await store.flush();
  assert.deepEqual(await saved('deep-answers.json'), { jobs: 6 });
});

test('the manifest said confirmed is the one a write really carried: asked for several times behind a slow write it is written once, whole, and confirmed as the disk holds it; refused, each request is told and what is confirmed does not move', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-coalesce-')), dir = path.join(root, randomUUID());
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = LocalSessionStore.forSession(dir), saved = async name => JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
  const held = disk(t, 'session.json', 'manifest.json');
  await store.saveManifest({ state: 'live', title: 'Film', passages: 1 });
  held.hold();
  // The state is on its way to the disk: three manifests are asked for behind it.
  const slow = store.save({ id: 's', saves: 1 });
  await held.reached(2);
  const asked = [store.saveManifest({ passages: 2 }), store.saveManifest({ elapsedMs: 16000 }), store.saveManifest({ passages: 3 })];
  for (let i = 0; i < 20; i++) await tick();
  assert.deepEqual([store.manifest.passages, store.confirmed.passages, held.count('manifest.json')], [3, 1, 1], 'what is asked for moves at once; what is confirmed waits for the disk');
  held.release();
  await Promise.all([slow, ...asked]);
  const merged = { state: 'live', title: 'Film', passages: 3, elapsedMs: 16000 };
  assert.deepEqual([held.count('manifest.json'), await saved('manifest.json'), store.confirmed, store.confirmed === store.manifest], [2, merged, merged, true], 'one write for the three, and no fact of any of them lost');

  held.hold(); held.refuse = true;
  const refusedState = store.save({ id: 's', saves: 2 }).then(() => null, error => error);
  await held.reached(4);
  const refused = [store.saveManifest({ state: 'archived' }), store.saveManifest({ closedAt: 5 })].map(request => request.then(() => null, error => error));
  for (let i = 0; i < 20; i++) await tick();
  held.release();
  assert.deepEqual((await Promise.all(refused)).map(error => [error?.code, error?.message]), Array(2).fill(['EIO', 'Écriture refusée par le disque (manifest.json) : EIO']));
  assert.equal((await refusedState)?.code, 'EIO');
  assert.deepEqual([held.count('manifest.json'), store.manifest.state, store.manifest.closedAt, store.confirmed, await saved('manifest.json')], [3, 'archived', 5, merged, merged], 'asked for, not confirmed: the disk still holds the manifest of before');
  // The disk is back: the state first, then the manifest that vouches for it, confirmed as written.
  held.refuse = false;
  await store.save({ id: 's', saves: 3 }); await store.flush(); await store.saveManifest({});
  assert.deepEqual([await saved('manifest.json'), store.confirmed, (await saved('session.json')).saves], [{ ...merged, state: 'archived', closedAt: 5 }, { ...merged, state: 'archived', closedAt: 5 }, 3]);
});

test('sealing drops the states that waited for their turn: the write in flight is awaited, nothing is written after it, nobody is left waiting, and the deleted folder does not come back', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-coalesce-')), dir = path.join(root, randomUUID());
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = LocalSessionStore.forSession(dir), exists = target => fs.lstat(target).then(() => true, () => false);
  const held = disk(t, 'deep-answers.json', 'session.json', 'manifest.json');
  await store.saveResearch({ jobs: 1 });
  held.hold();
  const flying = store.saveResearch({ jobs: 2 });
  await held.reached(2);
  const waiting = [store.saveResearch({ jobs: 3 }), store.saveResearch({ jobs: 4 }), store.save({ id: 's' }), store.saveManifest({ state: 'live' })];
  let sealed = false;
  const sealing = store.seal().then(() => { sealed = true; });
  for (let i = 0; i < 20; i++) await tick();
  const started = held.seen.length;
  assert.deepEqual([sealed, started], [false, 2], 'sealing waits for the write in flight: deleting now would let it recreate the directory');
  held.release();
  await sealing; await Promise.all([flying, ...waiting]); await store.flush();
  assert.deepEqual([held.seen.length, JSON.parse(await fs.readFile(path.join(dir, 'deep-answers.json'), 'utf8')), await fs.readdir(dir), store.confirmed], [started, { jobs: 2 }, ['deep-answers.json'], null],
    'the write in flight landed; the states that waited were dropped, the manifest among them');
  await fs.rm(dir, { recursive: true });
  await store.saveResearch({ jobs: 5 }); await store.save({ id: 's' }); await store.saveManifest({ state: 'archived' }); await store.flush();
  for (let i = 0; i < 20; i++) await tick();
  assert.deepEqual([await exists(dir), held.seen.length], [false, started], 'the deleted session does not come back');
});

test('a state that waits for its turn on disk is written as it was asked for: a rolling window that moves a passage into the history meanwhile does not show it twice', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-coalesce-')), dir = path.join(root, randomUUID());
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = LocalSessionStore.forSession(dir), saved = async name => JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
  let time = 0;
  const watch = new WatchSession({ id: 's', now: () => time, retentionMs: 5000, media: store, archive: store, perception: { transcribe: async () => ({ observation: {} }), observeVisual: async () => ({ observation: { summary: 'Résumé' } }) } });
  time = 1000; await watch.ingest({ startMs: 0, endMs: 1000, clip: Buffer.from('clip'), frames: [], audio: null }); await settle(watch); await store.serial;
  const held = disk(t, 'session.json');
  held.hold();
  // A pause is on its way to the disk and a resume waits behind it, both with the passage still listed.
  const pausing = watch.stop();
  await held.reached(1);
  const resuming = watch.resume();
  for (let i = 0; i < 20; i++) await tick();
  // The window closes on the passage meanwhile: its media go, its summary moves into the history.
  time = 400000; await watch.prune();
  assert.deepEqual([watch.segments.length, watch.history.map(passage => passage.id), held.count('session.json')], [0, ['moment-1'], 1]);
  held.release();
  await pausing; await resuming; await store.serial;
  const written = await saved('session.json');
  assert.deepEqual([written.accepting, written.segments.map(passage => passage.id), written.history.map(passage => passage.id), held.count('session.json')], [true, ['moment-1'], [], 2],
    'the state asked for before the sweep, whole: the passage is listed once');
  await watch.close();
  const closed = await saved('session.json');
  assert.deepEqual([closed.segments.length, closed.history.map(passage => passage.id)], [0, ['moment-1']], 'and the next save says where the passage is now');
});

test('a state is published before the disk has taken it: an analysed passage, a pause and a resume are shown while their save is held, whoever awaits a pause, a resume or a close still waits for the disk, and what the disk answered is published when it changes what the state says, never otherwise', async () => {
  const SAVE = 'Impossible de sauvegarder le résumé de session.';
  let time = 0, gate = null, refuse = false, describing = null; const files = new Map(), states = [];
  const hold = () => { gate = deferred(); }, release = () => { const held = gate; gate = null; held?.resolve(); };
  // La transcription porte la synchronisation : les passages suivants attendent encore leur analyse.
  const watch = new WatchSession({ id: 's', now: () => time, onChange: state => states.push(state),
    perception: { transcribe: async segment => { await describing?.promise; return { observation: { transcript: 'Passage ' + segment.id } }; },
      observeVisual: async segment => ({ observation: { summary: 'Passage ' + segment.id } }) },
    media: { put: async (id, input) => { files.set(id, input); }, read: async id => files.get(id), remove: async () => {} },
    archive: { save: async () => { await gate?.promise; if (refuse) throw Object.assign(new Error('EIO: i/o error, write'), { code: 'EIO' }); } } });
  const block = index => ({ startMs: index * 1000, endMs: (index + 1) * 1000, clip: new Uint8Array([1]), frames: [], audio: null });
  const shown = () => { const state = states.at(-1); return [state.accepting, state.lastError, state.segments.map(segment => segment.status)]; };
  time = 1000; await watch.ingest(block(0)); await settle(watch);

  // Two more passages: one is being described, the other waits behind it, and nothing else arrives afterwards.
  describing = deferred();
  time = 2000; await watch.ingest(block(1)); time = 3000; await watch.ingest(block(2));
  await turns(20);
  assert.deepEqual(shown(), [true, null, ['ready', 'analyzing', 'queued']]);
  // The disk stops answering, then the description comes back: the passage is published, and the next one is
  // analysed and published in turn, without waiting for the save of the first.
  hold();
  describing.resolve(); describing = null;
  await turns(20);
  assert.deepEqual(shown(), [true, null, ['ready', 'ready', 'ready']], 'published and analysed while the disk holds their save');
  // A pause, then a resume: shown at once, settled only once the disk has answered.
  const settled = [];
  const pausing = watch.stop().then(() => settled.push('pause'));
  await turns(20);
  assert.deepEqual([shown()[0], settled], [false, []], 'the pause is shown; whoever awaits it still waits for the disk');
  const resuming = watch.resume().then(() => settled.push('resume'));
  await turns(20);
  assert.deepEqual([shown()[0], settled], [true, []], 'the resume is shown; whoever awaits it still waits for the disk');
  const pushed = states.length;
  release();
  await pausing; await resuming; await turns(20);
  assert.deepEqual([settled, states.length], [['pause', 'resume'], pushed], 'saves that land and change nothing of what the state says push nothing more');

  // The disk refuses. The pause is shown first, as before; the refusal is published when it is known, once.
  refuse = true; hold();
  const refusedPause = watch.stop();
  await turns(20);
  assert.deepEqual([shown().slice(0, 2), states.length], [[false, null], pushed + 1]);
  release(); await refusedPause;
  assert.deepEqual([shown().slice(0, 2), states.length], [[false, SAVE], pushed + 2], 'said as soon as the disk refused, without waiting for another event');
  await watch.resume();
  assert.deepEqual([shown().slice(0, 2), states.length], [[true, SAVE], pushed + 3], 'refused again: nothing new to say');
  // The disk is back: the next save that lands ends the refusal, and that is published too.
  refuse = false;
  await watch.stop();
  assert.deepEqual([shown().slice(0, 2), states.length], [[false, null], pushed + 5], 'said for as long as it is true, and no longer');

  // Closing is a barrier: it settles only when its last save has been answered.
  hold();
  const closing = watch.close().then(() => settled.push('close'));
  await turns(20);
  assert.deepEqual([watch.closed, settled.includes('close')], [true, false]);
  release(); await closing;
  assert.deepEqual(settled, ['pause', 'resume', 'close']);
});
