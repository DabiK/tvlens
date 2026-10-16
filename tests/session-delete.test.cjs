const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const sharp = require('sharp');
const { createSessionRuntime, openArchivedSession } = require('../runtime/session-runtime.cjs');
const { SessionLibrary } = require('../adapters/session-library.cjs');
const { DiskGuard } = require('../adapters/disk-guard.cjs');
const { SavedMoments } = require('../core/saved-moments.cjs');
const { SavedMomentStore } = require('../adapters/saved-moment-store.cjs');

const { tick, deferred } = require('./helpers/wait.cjs');
const settle = async watch => { do { await tick(); } while (watch.running); };
const exists = target => fs.lstat(target).then(() => true, () => false);
async function tree(dir, base = dir) {
  const rows = [];
  for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(dir, entry.name), name = path.relative(base, target);
    if (entry.isDirectory()) rows.push([name, 'dir'], ...await tree(target, base));
    else if (entry.isSymbolicLink()) rows.push([name, 'link', await fs.readlink(target)]);
    else rows.push([name, createHash('sha256').update(await fs.readFile(target)).digest('hex'), (await fs.stat(target)).mtimeMs]);
  }
  return rows;
}
// Two real sessions on disk, each with media, thumbnails, vectors, answers and a manifest.
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-delete-')), sessionsRoot = path.join(root, 'sessions');
  const jpeg = 'data:image/jpeg;base64,' + (await sharp({ create: { width: 64, height: 36, channels: 3, background: '#173952' } }).jpeg().toBuffer()).toString('base64');
  const f = { root, sessionsRoot, jpeg, clock: 0, opened: [] };
  const embeddings = { embed: async () => [1, 0], embedMany: async texts => texts.map(() => [1, 0]) };
  f.block = (startMs, endMs) => ({ startMs, endMs, clip: Buffer.from(`clip ${startMs}`), frames: [{ atMs: startMs, dataUrl: jpeg }], audio: null });
  f.session = async extra => {
    const session = createSessionRuntime({ sessionsRoot, userData: root, config: {}, selectedModels: {}, smoke: true, readClock: () => f.clock, overrides: { embeddings }, ...extra });
    f.opened.push(session);
    for (const [startMs, endMs] of [[0, 8000], [8000, 16000]]) { f.clock = endMs; await session.watch.ingest(f.block(startMs, endMs)); await settle(session.watch); }
    await session.search.index.ensure(session.watch.segments);
    await session.store.saveResearch({ jobs: [{ id: 'deep-1', status: 'done', result: { answer: 'Réponse de ' + session.id } }] });
    await session.store.saveSurveillance({ instruction: 'Chiffres', lots: [] });
    return session;
  };
  t.after(async () => { for (const session of f.opened) await session.close(); await fs.rm(root, { recursive: true, force: true }); });
  return f;
}

test('deleting a session removes that session only, and no late write can bring it back', async t => {
  const f = await fixture(t);
  const neighbour = await f.session(); await neighbour.close();
  // The loaded session measures the disk at every write, so the test can hold one write in mid-air.
  let hold = null;
  const guard = new DiskGuard({ path: f.sessionsRoot, maxAgeMs: 0, freeBytes: async () => { await hold?.promise; return 50 * 1024 ** 3; } });
  const loaded = await f.session({ guard }), dir = path.join(f.sessionsRoot, loaded.id), other = path.join(f.sessionsRoot, neighbour.id);
  for (const name of ['session.json', 'manifest.json', 'deep-answers.json', 'surveillance.json', 'embeddings.json', 'media/moment-2.webm', 'media/moment-2.json', 'thumbs/moment-2.jpg'])
    assert.equal(await exists(path.join(dir, name)), true, name);
  // A moment kept explicitly is a copy of its own: it must outlive the session it came from.
  const kept = new SavedMomentStore(path.join(f.root, 'saved-moments'));
  const saved = await new SavedMoments({ archive: kept, makeId: randomUUID }).keep({ snapshot: loaded.watch.snapshot(), media: loaded.store });
  const library = new SessionLibrary({ root: f.sessionsRoot, guard });
  // The manifest of the session in memory is at most 30 s old: its totals are read from the live state instead.
  assert.deepEqual((await library.list({ current: loaded.id })).map(s => [s.id, s.state]).sort(), [[loaded.id, 'live'], [neighbour.id, 'archived']].sort());
  const before = await tree(other);

  // The host deletes the session while one write is already on its way to the disk and another one
  // still waits for its disk admission.
  const fsp = require('node:fs/promises'), writeFile = fsp.writeFile, onDisk = deferred(), entered = deferred();
  const slow = t.mock.method(fsp, 'writeFile', async (file, ...rest) => { if (String(file).endsWith('moment-3.json')) { entered.resolve(); await onDisk.promise; } return writeFile(file, ...rest); });
  f.clock = 32000;
  const writing = loaded.watch.ingest(f.block(16000, 24000));
  await entered.promise;
  hold = deferred();
  const waiting = loaded.store.put('moment-7', f.block(24000, 32000));
  let sealed = false;
  const sealing = loaded.seal().then(() => { sealed = true; });
  for (let i = 0; i < 20; i++) await tick();
  assert.equal(sealed, false, 'sealing waits for the write in flight: deleting now would let it recreate the directory');
  onDisk.resolve(); hold.resolve();
  assert.equal(await writing, 'moment-3');
  await assert.rejects(waiting, /Session supprimée/);
  await sealing; slow.mock.restore();
  assert.deepEqual((await fs.readdir(path.join(dir, 'media'))).filter(name => name.startsWith('moment-7')), [], 'the write admitted after the seal left nothing');
  const removed = await library.remove(loaded.id);
  assert.equal(removed.id, loaded.id); assert.ok(removed.freedBytes > 0);
  assert.equal(await exists(dir), false);

  // Everything a host or a late provider answer could still try to write.
  await loaded.store.save(loaded.watch.snapshot());
  await loaded.store.saveResearch({ jobs: [{ id: 'deep-2', status: 'cancelled', message: 'Session supprimée.' }] });
  await loaded.store.saveRecap({ overview: 'tardif' }); await loaded.store.saveAuto({}); await loaded.store.saveSurveillance({}); await loaded.store.saveManifest({ state: 'live' });
  await assert.rejects(loaded.store.put('moment-9', f.block(24000, 32000)), /Session supprimée/);
  await assert.rejects(loaded.thumbnails.put('moment-9', f.jpeg), /terminée/);
  await loaded.search.index.cache.putMany([{ id: 'moment-9', text: 'Vecteur tardif', vector: [0, 1] }]);
  await loaded.pause().catch(() => {}); await loaded.close(); loaded.watch.emit();
  for (let i = 0; i < 20; i++) await tick();
  assert.equal(await exists(dir), false, 'the deleted session does not come back');
  assert.deepEqual((await library.list()).map(s => s.id), [neighbour.id]);
  assert.deepEqual(await tree(other), before, 'the neighbour is untouched: same files, same bytes, same dates');
  assert.equal(await (await kept.response(saved.id, 'moment-2')).text(), 'clip 8000', 'kept moments are not deleted with their session');
  await assert.rejects(library.remove(loaded.id), /introuvable/);
  await assert.rejects(library.read(loaded.id), /introuvable/);
  const usage = await library.usage();
  assert.deepEqual([usage.sessions, usage.state, usage.bytes], [1, 'ok', (await library.list())[0].media.bytes]);
});

test('an identifier that is not exactly one session directory deletes and reads nothing', async t => {
  const f = await fixture(t);
  const session = await f.session(); await session.close();
  const library = new SessionLibrary({ root: f.sessionsRoot }), id = session.id;
  // A link and a plain file wearing valid identifiers, and a folder that is not a session.
  const link = randomUUID(), file = randomUUID();
  await fs.symlink(path.join(f.sessionsRoot, id), path.join(f.sessionsRoot, link));
  await fs.writeFile(path.join(f.sessionsRoot, file), 'pas un dossier');
  await fs.mkdir(path.join(f.sessionsRoot, 'sessions')); await fs.writeFile(path.join(f.sessionsRoot, 'sessions', 'session.json'), '{}');
  const before = await tree(f.root);
  for (const bad of ['../' + id, '../sessions/' + id, 'sessions', '', '.', '..', id + '/', id + '/..', id.toUpperCase(), ' ' + id, id + '\0', undefined, null, 42, [id]]) {
    await assert.rejects(library.remove(bad), /Identifiant de session invalide/, String(bad));
    await assert.rejects(library.read(bad), /Identifiant de session invalide/, String(bad));
  }
  for (const absent of [link, file, randomUUID()]) {
    await assert.rejects(library.remove(absent), /Session introuvable/);
    await assert.rejects(library.read(absent), /Session introuvable/);
  }
  assert.deepEqual((await library.list()).map(s => s.id), [id], 'links, files and foreign folders are not sessions');
  assert.deepEqual(await tree(f.root), before, 'nothing was erased or written');
  // The valid identifier still works, and takes the link target's content with it, not the link.
  assert.equal((await library.remove(id)).id, id);
  assert.deepEqual((await fs.readdir(f.sessionsRoot)).sort(), [file, link, 'sessions'].sort());
});

test('an archive that is only open cannot be emptied in passing: its media go with the explicit deletion of the whole session', async t => {
  const f = await fixture(t);
  const kept = await f.session(); await kept.close();
  const library = new SessionLibrary({ root: f.sessionsRoot }), dir = path.join(f.sessionsRoot, kept.id), before = await tree(dir), [listed] = await library.list();
  const { session } = await openArchivedSession({ library, id: kept.id, userData: f.root, config: {}, selectedModels: {}, smoke: true, readClock: () => f.clock });
  f.opened.push(session);
  await assert.rejects(session.close({ purge: true }), { message: 'Session ouverte en lecture seule : ses médias ne s’effacent qu’avec la suppression de la session.' });
  // Refused before anything was closed or written: the archive is whole, still open and still replayable.
  assert.deepEqual(await tree(dir), before);
  assert.equal(await (await session.store.response('moment-1')).text(), 'clip 0');
  assert.ok((await session.thumbnails.read('moment-1')).length);
  await session.close();
  await assert.rejects(session.close({ purge: true }), /lecture seule/, 'nor once it is closed');
  assert.deepEqual([await tree(dir), (await library.list())[0]], [before, listed], 'the list still tells the truth about its media');
  // The explicit way, and the only one.
  await session.seal();
  assert.ok((await library.remove(kept.id)).freedBytes >= listed.media.bytes);
  assert.equal(await exists(dir), false);
});
