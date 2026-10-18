const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { DiskGuard, StorageFullError } = require('../adapters/disk-guard.cjs');
const { LocalSessionStore } = require('../adapters/local-store.cjs');
const { createSessionRuntime } = require('../runtime/session-runtime.cjs');
const { SessionLibrary } = require('../adapters/session-library.cjs');
const { VideoTools, consultationOf } = require('../core/video-tools.cjs');

const GIB = 1024 ** 3, MIB = 1024 ** 2;
const { tick } = require('./helpers/wait.cjs');
const settle = async watch => { do { await tick(); } while (watch.running); };
async function tree(dir, base = dir) {
  const rows = [];
  for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(dir, entry.name), name = path.relative(base, target);
    if (entry.isDirectory()) rows.push([name, 'dir'], ...await tree(target, base));
    else rows.push([name, createHash('sha256').update(await fs.readFile(target)).digest('hex'), (await fs.stat(target)).mtimeMs]);
  }
  return rows;
}
// Names only: a save of the session state may be renaming its temporary file at this very moment.
const moments = async dir => (await fs.readdir(dir, { recursive: true })).filter(name => /moment-\d+\./.test(name)).sort();
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-disk-')), sessionsRoot = path.join(root, 'sessions');
  const f = { root, sessionsRoot, clock: 0, free: 50 * GIB, wall: 0, measures: 0, opened: [] };
  f.guard = options => new DiskGuard({ path: sessionsRoot, freeBytes: async () => { f.measures++; if (f.free === null) throw new Error('statfs indisponible'); return f.free; }, now: () => f.wall, ...options });
  f.open = extra => { const session = createSessionRuntime({ sessionsRoot, userData: root, config: {}, selectedModels: {}, smoke: true, readClock: () => f.clock, ...extra }); f.opened.push(session); return session; };
  f.block = n => ({ startMs: (n - 1) * 8000, endMs: n * 8000, clip: Buffer.from(`clip ${n}`), frames: [{ atMs: (n - 1) * 8000, dataUrl: 'data:image/jpeg;base64,YQ==' }], audio: null });
  f.ingest = async (session, n) => { f.clock = n * 8000; f.wall += 8000; const id = await session.watch.ingest(f.block(n)); await settle(session.watch); return id; };
  t.after(async () => { for (const session of f.opened) await session.close(); await fs.rm(root, { recursive: true, force: true }); });
  return f;
}

test('the guard reports ok, low, blocked and unknown from injected thresholds, with hysteresis and a cached measurement', async t => {
  const f = await fixture(t), guard = f.guard({ minFreeBytes: GIB, warnFreeBytes: 2 * GIB });
  assert.deepEqual(guard.snapshot(), { state: 'unknown', freeBytes: null, minFreeBytes: GIB, warnFreeBytes: 2 * GIB, checkedAt: null }, 'never measured yet');
  assert.equal((await guard.check()).state, 'ok');
  for (let i = 0; i < 20; i++) await guard.admit(MIB);
  assert.equal(f.measures, 1, 'twenty writes in one cache period: one measurement');
  assert.equal(guard.snapshot().freeBytes, 50 * GIB - 20 * MIB, 'writes are debited between two measurements');
  f.wall += 5000; f.free = 1.5 * GIB;
  assert.equal((await guard.check()).state, 'low'); await guard.admit(MIB);
  // A write that would cross the floor is refused before the floor is crossed.
  f.wall += 5000; f.free = GIB + MIB;
  // The refusal names one figure, the room to free before capture comes back (floor plus margin): free space
  // and floor side by side used to read "1 Go libres, 1 Go requis" here.
  await assert.rejects(guard.admit(2 * MIB), error => error instanceof StorageFullError && error.code === 'TVLENS_STORAGE_FULL' && error.minFreeBytes === GIB && error.neededBytes === 255 * MIB
    && /^Espace disque insuffisant : la capture est suspendue pour ne rien supprimer\. Il manque environ 255 Mo d’espace libre\. Supprime une session ou libère de l’espace, puis reprends\.$/.test(error.message));
  assert.equal(guard.snapshot().state, 'blocked');
  // Back just above the floor is not enough: capture would flap. It resumes with the margin.
  f.free = GIB + 100 * MIB;
  await assert.rejects(guard.assertRoom(), { code: 'TVLENS_STORAGE_FULL' }); assert.equal(guard.snapshot().state, 'blocked');
  f.free = GIB + 256 * MIB;
  await guard.assertRoom(); assert.equal(guard.snapshot().state, 'low');
  // No measurement is not a reason to stop: it is shown as unknown and the write decides.
  f.free = null;
  assert.deepEqual([(await guard.check({ force: true })).state, guard.snapshot().freeBytes], ['unknown', null]);
  await guard.admit(10 * GIB);
  // A write that really failed blocks like a measured shortage.
  f.free = 50 * GIB; await guard.check({ force: true });
  // The system refused a write although the measurement shows room (a quota): no figure is invented.
  assert.equal(guard.trip().code, 'TVLENS_STORAGE_FULL'); assert.equal(guard.snapshot().state, 'blocked');
  assert.equal(guard.trip().message, 'Espace disque insuffisant : la capture est suspendue pour ne rien supprimer. Supprime une session ou libère de l’espace, puis reprends.');
  await guard.assertRoom(); assert.equal(guard.snapshot().state, 'ok');
  // Whatever the shortage, a single figure, rounded up so that freeing it is enough.
  for (const [free, said] of [[GIB - 1, '257 Mo'], [GIB + 256 * MIB - 1, '1 Mo'], [GIB - 768 * MIB, '1 Go'], [0, '1,3 Go']]) {
    guard.trip(); f.free = free;
    const refusal = await guard.assertRoom().catch(error => error);
    assert.deepEqual(refusal.message.match(/\d[\d,]* (?:Mo|Go)/g), [said], `${free} octets libres`);
    f.free = free + refusal.neededBytes; await guard.assertRoom();
  }
  assert.throws(() => new DiskGuard({ path: f.root, minFreeBytes: -1 }), /Seuils/);
  // The real measurement works on a directory that does not exist yet, through its nearest ancestor.
  const real = await new DiskGuard({ path: path.join(f.root, 'not', 'yet', 'there') }).check();
  assert.ok(Number.isFinite(real.freeBytes) && real.freeBytes > 0); assert.notEqual(real.state, 'unknown');
});

test('a measurement that throws synchronously is one failed measurement, not a guard stuck on unknown for ever', async () => {
  let wall = 0, calls = 0, free = null;
  // Not an async function: a synchronous statfs on a directory that does not exist yet throws on the spot.
  const guard = new DiskGuard({ path: '/absent', now: () => wall, freeBytes: () => { calls++; if (free === null) throw Object.assign(new Error('ENOENT: statfs'), { code: 'ENOENT' }); return free; } });
  assert.deepEqual([(await guard.check()).state, guard.measuring, calls], ['unknown', null, 1]);
  await guard.admit(MIB);
  assert.equal(calls, 1, 'the failed measurement is cached like any other');
  free = GIB - MIB;
  assert.deepEqual([(await guard.check({ force: true })).state, calls], ['blocked', 2], 'a forced check measures again');
  await assert.rejects(guard.admit(MIB), { code: 'TVLENS_STORAGE_FULL' });
  free = null; wall += 5000;
  assert.deepEqual([(await guard.check()).state, calls], ['unknown', 3]);
  free = 50 * GIB; wall += 5000;
  assert.deepEqual([(await guard.check()).state, guard.snapshot().freeBytes, calls], ['ok', 50 * GIB, 4], 'and so does the next check once the cache period is over');
  // Two callers during one failing measurement share it, and neither is left with a rejection.
  free = null;
  assert.deepEqual((await Promise.all([guard.check({ force: true }), guard.check({ force: true })])).map(state => state.state).concat(calls), ['unknown', 'unknown', 5]);
});

test('below the floor a passage is refused before any write, capture stops, nothing is deleted, and capture resumes when room is back', async t => {
  const f = await fixture(t), guard = f.guard({ minFreeBytes: GIB, warnFreeBytes: 2 * GIB });
  const neighbour = f.open({ guard }); await f.ingest(neighbour, 1); await neighbour.close();
  const others = await tree(path.join(f.sessionsRoot, neighbour.id));
  const states = [], session = f.open({ guard, onChange: state => states.push(state) }), dir = path.join(f.sessionsRoot, session.id);
  assert.equal(await f.ingest(session, 1), 'moment-1');
  assert.deepEqual([session.watch.snapshot().storage.state, session.watch.snapshot().storage.minFreeBytes], ['ok', GIB]);
  const kept = await tree(path.join(dir, 'media'));

  f.free = GIB - 1; f.clock = 16000; f.wall += 8000;
  const refused = await session.watch.ingest(f.block(2)).catch(error => error);
  assert.equal(refused.code, 'TVLENS_STORAGE_FULL'); assert.match(refused.message, /Espace disque insuffisant.*Il manque environ 257 Mo d’espace libre\./);
  const state = session.watch.snapshot();
  assert.deepEqual([state.accepting, state.storage.state, state.storage.freeBytes, state.lastError, state.segments.map(s => s.id)], [false, 'blocked', GIB - 1, refused.message, ['moment-1']]);
  assert.deepEqual([states.at(-1).accepting, states.at(-1).storage.state], [false, 'blocked'], 'the stop is published');
  assert.deepEqual(await moments(dir), ['media/moment-1.json', 'media/moment-1.webm'], 'no trace of the refused passage');
  assert.deepEqual(await tree(path.join(dir, 'media')), kept, 'what was captured before is untouched');
  assert.deepEqual(await tree(path.join(f.sessionsRoot, neighbour.id)), others, 'no other session pays for the shortage');
  await assert.rejects(session.watch.ingest(f.block(2)), /arrêtée/);
  // Start and resume are refused with the same message, on a fresh measurement.
  f.free = GIB + 10 * MIB;
  const again = await session.resume().catch(error => error);
  assert.deepEqual([again.code, again.message, session.watch.accepting], ['TVLENS_STORAGE_FULL', refused.message.replace('257 Mo', '246 Mo'), false]);
  // Consulting what exists still works: text, replay and re-examination of the stored passage.
  const tools = new VideoTools({ consultation: consultationOf(session.memory.view()),
    search: session.search, inspector: session.inspector, media: session.memoryMedia });
  assert.equal((await tools.call('inspect_clip', { startMs: 0, endMs: 8000, question: 'Que voit-on ?' })).observations[0].id, 'moment-1');
  assert.equal((await session.store.response('moment-1')).status, 200);
  // A late analysis must not erase the reason of the stop.
  session.watch.lastError = null; assert.equal(session.watch.snapshot().lastError, refused.message);

  // Deleting a session is how room comes back: the guard measures again at once.
  const library = new SessionLibrary({ root: f.sessionsRoot, guard });
  f.free = 30 * GIB;
  await library.remove(neighbour.id);
  assert.equal(session.watch.snapshot().storage.state, 'ok');
  await session.resume();
  assert.deepEqual([session.watch.accepting, session.watch.snapshot().lastError], [true, null]);
  assert.equal(await f.ingest(session, 3), 'moment-3');
  assert.deepEqual(await moments(dir), ['media/moment-1.json', 'media/moment-1.webm', 'media/moment-3.json', 'media/moment-3.webm']);
  assert.deepEqual(session.watch.segments.map(s => [s.id, s.available]), [['moment-1', true], ['moment-3', true]]);
});

test('a write that runs out of space mid-way leaves no partial pair, with or without a guard', async t => {
  const f = await fixture(t), fsp = require('node:fs/promises'), writeFile = fsp.writeFile;
  // The clip lands, the frames file is cut short: the worst case for a pair.
  const failing = code => t.mock.method(fsp, 'writeFile', async (file, data, options) => {
    if (!String(file).endsWith('moment-2.json')) return writeFile(file, data, options);
    await writeFile(file, String(data).slice(0, 10), options);
    throw Object.assign(new Error(`${code}: no space left on device, write`), { code });
  });
  for (const [guard, code, expected] of [[f.guard(), 'ENOSPC', 'blocked'], [null, 'EDQUOT', 'unknown']]) {
    const session = f.open({ guard }), dir = path.join(f.sessionsRoot, session.id);
    await f.ingest(session, 1);
    const mock = failing(code);
    f.clock = 16000;
    const error = await session.watch.ingest(f.block(2)).catch(e => e);
    mock.mock.restore();
    assert.deepEqual([error.code, error instanceof StorageFullError], ['TVLENS_STORAGE_FULL', true], 'the raw system error never reaches the viewer');
    assert.doesNotMatch(error.message, /ENOSPC|EDQUOT|no space/);
    assert.deepEqual(await moments(dir), ['media/moment-1.json', 'media/moment-1.webm'], 'the clip already written was removed with its broken half');
    const state = session.watch.snapshot();
    assert.deepEqual([state.accepting, state.storage.state, state.lastError, state.segments.length], [false, expected, error.message, 1]);
    await session.resume();
    assert.equal(await f.ingest(session, 3), 'moment-3');
  }
  // Any other failure also cleans its pair, and stays what it is: capture is not stopped for it.
  const store = LocalSessionStore.forSession(path.join(f.root, 'plain'));
  const mock = t.mock.method(fsp, 'writeFile', async (file, data, options) => { if (String(file).endsWith('.json')) throw Object.assign(new Error('EIO'), { code: 'EIO' }); return writeFile(file, data, options); });
  await assert.rejects(store.put('moment-1', f.block(1)), { code: 'EIO' });
  mock.mock.restore();
  assert.deepEqual(await fs.readdir(path.join(f.root, 'plain', 'media')), []);
  assert.deepEqual([store.bytes, await store.has('moment-1')], [0, false]);
});
