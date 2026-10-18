const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tick, deferred, until } = require('./helpers/wait.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { LocalSessionStore } = require('../adapters/local-store.cjs');
const { SavedMomentStore } = require('../adapters/saved-moment-store.cjs');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
const { RemoteServer } = require('../server/http.cjs');
const { copyPrunedArchive } = require('./helpers/pruned-archive.cjs');

// F10: a range of a stored clip reads the bytes it answers with, and no others.
// Offline: synthetic clips in a temporary directory, behind the real store, the real archive of kept moments and
// the real HTTP server over a simulated runtime. What is counted is what the store asks of the disk for a .webm,
// byte by byte. Nothing here measures a latency or a memory footprint, and an answer without a range, or with an
// open-ended one, still reads every byte it carries.
const MIB = 1024 ** 2, GONE = 'Passage expiré ou indisponible.', token = 'f'.repeat(64);
// Bytes no decoder takes for a video, each of which tells where it sits in the clip.
const pattern = (length, seed = 0) => { const bytes = Buffer.alloc(length); for (let i = 0; i < length; i++) bytes[i] = (i + seed) % 251; return bytes; };
const MEDIA = { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
// An answer as its client receives it: the status, the headers that describe the media, and the bytes.
const answer = async response => ({ status: response.status, body: Buffer.from(await response.arrayBuffer()),
  headers: Object.fromEntries([...Object.keys(MEDIA), 'content-range', 'content-length'].map(name => [name, response.headers.get(name)])) });

// What is asked of the disk for the clips. Every .webm opened is counted, with the bytes read through its
// descriptor and its closing; a .webm read whole by its path is counted with them, so that a store which loads
// the clip shows it. `hook` runs once, before the next read through a descriptor: after the size is known, before
// the first byte. `chunk` caps what one read hands back, as a disk may. `failClose` makes the next closing fail,
// once the descriptor is really closed.
function disk(t) {
  const open = fs.open, readFile = fs.readFile, d = { opened: 0, closed: 0, bytes: 0, reads: 0, hook: null, chunk: Infinity, failClose: false };
  const clip = file => String(file).endsWith('.webm');
  t.mock.method(fs, 'readFile', async (file, ...rest) => {
    const data = await readFile(file, ...rest);
    if (clip(file)) { d.reads++; d.bytes += data.length; }
    return data;
  });
  t.mock.method(fs, 'open', async (file, ...rest) => {
    const handle = await open(file, ...rest);
    if (!clip(file)) return handle;
    d.opened++;
    const { read, readFile: whole, close } = handle;
    handle.read = async (...args) => {
      const hook = d.hook; d.hook = null; await hook?.();
      if (Number.isFinite(d.chunk)) args[2] = Math.min(args[2], d.chunk);
      const result = await read.apply(handle, args);
      d.reads++; d.bytes += result.bytesRead;
      return result;
    };
    handle.readFile = async (...args) => { const data = await whole.apply(handle, args); d.reads++; d.bytes += data.length; return data; };
    handle.close = async () => {
      await close.call(handle); d.closed++;
      if (d.failClose) { d.failClose = false; throw Object.assign(new Error('EIO: i/o error, close'), { code: 'EIO' }); }
    };
    return handle;
  });
  d.reset = () => Object.assign(d, { opened: 0, closed: 0, bytes: 0, reads: 0 });
  return d;
}
// The real store of a session on a temporary directory, holding the clips given, and the disk as seen from then on.
async function stored(t, clips = { 'moment-1': pattern(10) }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-f10-')), dir = path.join(root, 'session');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = LocalSessionStore.forSession(dir);
  for (const [id, clip] of Object.entries(clips)) await store.put(id, { clip, frames: [], audio: null, startMs: 0, endMs: 8000 });
  return { root, dir, store, d: disk(t) };
}
// A real HeadlessRuntime behind a real RemoteServer on an ephemeral port, as tests/remote-server.test.cjs builds
// them: simulated providers, a clock held by the test, and an assembly double that hands `clip` back. One passage
// is ingested and left to settle before the disk is watched.
async function served(t, clip) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-f10-http-')), f = { clock: 0 };
  const agent = { answer: async ({ question }) => ({ answer: question, kind: 'explanation', citations: [], limits: [] }) };
  // La capture courante est durable ; les refus historiques viennent du corpus figé.
  const runtime = new HeadlessRuntime({ userData: dir, sessionsRoot: path.join(dir, 'sessions'), config: {}, selectedModels: { observationModel: 'test', inspectionModel: 'test', codexModel: 'test' }, smoke: true, agent, readClock: () => f.clock });
  const media = { assemble: async input => ({ ...input, clip, frames: [{ atMs: input.startMs, dataUrl: 'data:image/jpeg;base64,YQ==' }], audio: null }) };
  const server = await new RemoteServer({ runtime, media, token }).listen(0, '127.0.0.1');
  t.after(async () => { await server.close(); await runtime.close(); await fs.rm(dir, { recursive: true, force: true }); });
  const post = async (route, body) => (await fetch(server.url + route, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  f.id = (await post('/v1/session/start', {})).id; f.clock = 200;
  assert.deepEqual(await post('/v1/segments', { sessionId: f.id, sequence: 0, startMs: 0, endMs: 100, frames: [{ atMs: 0, data: 'YQ==' }] }), { id: 'moment-1', duplicate: false });
  do { await tick(); } while (runtime.session.watch.running);
  await runtime.session.store.serial;
  f.get = (route, headers = {}, init = {}) => fetch(server.url + route, { ...init, headers: { Authorization: 'Bearer ' + token, ...headers } });
  f.openHistorical = async () => {
    await runtime.end();
    const expected = await copyPrunedArchive(runtime.library.root);
    await runtime.open(expected.id);
    return fs.readFile(path.join(runtime.library.root, expected.id, 'media', 'moment-4.webm'));
  };
  return Object.assign(f, { runtime, server, d: disk(t) });
}

test('one byte asked of a two-megabyte clip reads one byte of it', async t => {
  const clip = pattern(2 * MIB), { store, d } = await stored(t, { 'moment-1': clip });
  const got = await answer(await store.response('moment-1', 'bytes=0-0'));
  assert.deepEqual([got.status, got.headers, [...got.body]], [206, { ...MEDIA, 'content-range': 'bytes 0-0/2097152', 'content-length': '1' }, [clip[0]]]);
  assert.deepEqual([d.bytes, d.opened, d.closed], [1, 1, 1], 'one byte read through one descriptor, closed when the answer is handed back');
});

test('a range is answered with its own bytes, stops at the end of the clip, and reads exactly what it answers', async t => {
  const clip = pattern(1000), { store, d } = await stored(t, { 'moment-1': clip });
  for (const [range, start, end] of [['bytes=0-0', 0, 0], ['bytes=1-3', 1, 3], ['bytes=400-649', 400, 649], ['bytes=007-0009', 7, 9], ['bytes=999-999', 999, 999],
    ['bytes=990-', 990, 999], ['bytes=995-5000', 995, 999], ['bytes=0-999', 0, 999], ['bytes=0-', 0, 999]]) {
    d.reset();
    const got = await answer(await store.response('moment-1', range));
    assert.deepEqual([got.status, got.headers], [206, { ...MEDIA, 'content-range': `bytes ${start}-${end}/1000`, 'content-length': String(end - start + 1) }], range);
    assert.ok(got.body.equals(clip.subarray(start, end + 1)), `${range}: the bytes of the range, in order`);
    assert.deepEqual([d.bytes, d.opened, d.closed], [end - start + 1, 1, 1], `${range}: nothing is read beyond what is answered`);
  }
  // Without a range the answer is the clip: all of it is read, as before, since all of it is the answer.
  for (const none of [undefined, null, '']) {
    d.reset();
    const got = await answer(await store.response('moment-1', none));
    assert.deepEqual([got.status, got.headers], [200, { ...MEDIA, 'content-range': null, 'content-length': '1000' }]);
    assert.ok(got.body.equals(clip));
    assert.deepEqual([d.bytes, d.opened, d.closed], [1000, 1, 1]);
  }
});

test('a range that cannot be answered is refused on the size alone, without reading a byte of the clip', async t => {
  const { store, d } = await stored(t, { 'moment-1': pattern(10), 'moment-2': Buffer.alloc(0) });
  // Past the end, backwards, counted from the end, several at once, another unit, no number, a number no clip has.
  for (const range of ['bytes=10-', 'bytes=10-12', 'bytes=9-3', 'bytes=-5', 'bytes=0-1,3-4', 'octets=0-1', 'bytes=a-b', 'bytes=', ' bytes=0-1', `bytes=${'9'.repeat(400)}-`]) {
    d.reset();
    const got = await answer(await store.response('moment-1', range));
    assert.deepEqual([got.status, got.headers, got.body.length], [416, { 'content-type': null, 'accept-ranges': null, 'cache-control': null, 'content-range': 'bytes */10', 'content-length': null }, 0], range);
    assert.deepEqual([d.bytes, d.reads, d.opened, d.closed], [0, 0, 1, 1], `${range}: opened for its size, closed, never read`);
  }
  // An empty clip has no byte to answer a range with; asked whole, it is answered whole.
  d.reset();
  const ranged = await answer(await store.response('moment-2', 'bytes=0-')), whole = await answer(await store.response('moment-2'));
  assert.deepEqual([ranged.status, ranged.headers['content-range'], ranged.body.length], [416, 'bytes */0', 0]);
  assert.deepEqual([whole.status, whole.headers, whole.body.length], [200, { ...MEDIA, 'content-range': null, 'content-length': '0' }, 0]);
  assert.deepEqual([d.bytes, d.opened, d.closed], [0, 2, 2]);
});

test('a clip that is not there is said unavailable whatever its range says, and no path is built from a foreign name', async t => {
  const { dir, store, d } = await stored(t);
  const gone = async (id, range) => { const got = await answer(await store.response(id, range)); return [got.status, String(got.body), got.headers['content-range']]; };
  for (const range of [undefined, 'bytes=0-0', 'bytes=9-3', 'bytes=x'])
    for (const id of ['moment-9', '../moment-1', 'moment-1/../moment-1', 'moment-1.webm', '../../.env.local', ''])
      assert.deepEqual(await gone(id, range), [404, GONE, null], `${id} ${range}`);
  // What bears the name of a clip without being a file was never readable: it is not given a size to refuse a range with.
  await fs.mkdir(path.join(dir, 'media', 'moment-3.webm'));
  for (const range of [undefined, 'bytes=0-0', 'bytes=x']) assert.deepEqual(await gone('moment-3', range), [404, GONE, null], `a directory, ${range}`);
  assert.deepEqual([d.bytes, d.opened - d.closed], [0, 0], 'nothing was read and nothing stays open behind a refusal');
  // The clip beside them is still served.
  assert.equal((await store.response('moment-1', 'bytes=0-0')).status, 206);
});

test('a clip a former version left at the root and a kept copy are answered by range where they are', async t => {
  const { root, dir, d } = await stored(t, {}), clip = pattern(500, 7);
  // Layout of a former version: both files of the passage at the root of the session directory.
  const old = path.join(root, 'former');
  await fs.mkdir(old);
  await fs.writeFile(path.join(old, 'moment-1.webm'), clip);
  await fs.writeFile(path.join(old, 'moment-1.json'), JSON.stringify({ frames: [], audio: null }));
  const former = LocalSessionStore.forSession(old);
  for (const [range, start, end] of [['bytes=100-149', 100, 149], ['bytes=499-', 499, 499]]) {
    d.reset();
    const got = await answer(await former.response('moment-1', range));
    assert.deepEqual([got.status, got.headers['content-range']], [206, `bytes ${start}-${end}/500`]); assert.ok(got.body.equals(clip.subarray(start, end + 1)));
    assert.deepEqual([d.bytes, d.opened, d.closed], [end - start + 1, 1, 1], range);
  }
  assert.equal((await former.response('moment-1', 'bytes=500-')).status, 416);
  assert.deepEqual((await fs.readdir(old, { recursive: true })).sort(), ['moment-1.json', 'moment-1.webm'], 'nothing is migrated');
  // A kept copy: the clip alone at the root of its own folder, without the .json a session writes beside it.
  const media = LocalSessionStore.forSession(dir), archive = new SavedMomentStore(path.join(root, 'saved')), id = randomUUID();
  await media.put('moment-2', { clip, frames: [], audio: null });
  await archive.save({ id, createdAt: 1, moments: [{ id: 'moment-2' }] }, media);
  await fs.rm(dir, { recursive: true });
  assert.deepEqual((await fs.readdir(path.join(root, 'saved', id))).sort(), ['moment-2.webm', 'saved.json']);
  d.reset();
  const kept = await answer(await archive.response(id, 'moment-2', 'bytes=0-0'));
  assert.deepEqual([kept.status, kept.headers, [...kept.body]], [206, { ...MEDIA, 'content-range': 'bytes 0-0/500', 'content-length': '1' }, [clip[0]]]);
  assert.deepEqual([d.bytes, d.opened, d.closed], [1, 1, 1], 'the copy outlives its session and is read like any clip');
  assert.equal((await archive.response(id, 'moment-2', 'bytes=500-')).status, 416);
  assert.equal((await archive.response(id, 'moment-3', 'bytes=0-0')).status, 404);
});

test('ranges asked together each get their own bytes, and every descriptor opened is closed', async t => {
  const clip = pattern(4096), { store, d } = await stored(t, { 'moment-1': clip });
  const ranges = Array.from({ length: 12 }, (_, i) => [i * 300, i * 300 + i * 17]);
  const [refused, absent, ...got] = await Promise.all([store.response('moment-1', 'bytes=5000-'), store.response('moment-2', 'bytes=0-0'),
    ...ranges.map(([start, end]) => store.response('moment-1', `bytes=${start}-${end}`))].map(asked => asked.then(answer)));
  assert.deepEqual([refused.status, absent.status], [416, 404]);
  got.forEach((one, i) => {
    const [start, end] = ranges[i];
    assert.deepEqual([one.status, one.headers['content-range'], one.headers['content-length']], [206, `bytes ${start}-${end}/4096`, String(end - start + 1)]);
    assert.ok(one.body.equals(clip.subarray(start, end + 1)), `bytes=${start}-${end}`);
  });
  assert.deepEqual([d.bytes, d.opened, d.closed], [ranges.reduce((total, [start, end]) => total + end - start + 1, 0), 13, 13], 'the sum of the ranges, and not a byte more');
});

test('a clip deleted while its range is being read is answered whole, then is gone', async t => {
  const one = pattern(64), two = pattern(64, 9), { dir, store, d } = await stored(t, { 'moment-1': one, 'moment-2': two });
  // The deletion lands once the size is known and before the first byte: the descriptor still holds the clip.
  let deleted = 0;
  for (const [id, clip, erase] of [['moment-1', one, () => store.remove('moment-1')], ['moment-2', two, () => store.clearRaw()]]) {
    d.reset();
    d.hook = async () => { await erase(); deleted++; assert.ok(!(await fs.readdir(dir, { recursive: true })).includes(path.join('media', `${id}.webm`)), 'the deletion was not held back'); };
    const got = await answer(await store.response(id, 'bytes=8-23'));
    assert.deepEqual([got.status, got.headers['content-range'], got.headers['content-length']], [206, 'bytes 8-23/64', '16'], id); assert.ok(got.body.equals(clip.subarray(8, 24)));
    assert.deepEqual([d.bytes, d.opened, d.closed], [16, 1, 1]);
    for (const range of [undefined, 'bytes=8-23', 'bytes=x']) assert.equal((await store.response(id, range)).status, 404, `${id} ${range}: nothing is served from memory afterwards`);
  }
  assert.deepEqual([deleted, d.opened, d.closed], [2, 1, 1], 'each deletion ran while its clip was open');
});

test('a read handed back in pieces is completed; a clip cut short meanwhile is unavailable, never answered short of its length', async t => {
  const clip = pattern(100), { dir, store, d } = await stored(t, { 'moment-1': clip }), file = path.join(dir, 'media', 'moment-1.webm');
  const gone = async range => { const got = await answer(await store.response('moment-1', range)); return [got.status, String(got.body), got.headers['content-range'], got.headers['content-length']]; };
  // Three bytes at most per read: the answer is still the whole range, in order.
  d.chunk = 3;
  let got = await answer(await store.response('moment-1', 'bytes=10-29'));
  assert.deepEqual([got.status, got.headers['content-range'], got.headers['content-length']], [206, 'bytes 10-29/100', '20']); assert.ok(got.body.equals(clip.subarray(10, 30)));
  assert.deepEqual([d.bytes, d.reads, d.opened, d.closed], [20, 7, 1, 1]);
  d.chunk = Infinity;
  // The disk refuses the read, then a closing: unavailable in the first case, answered in the second, closed in both.
  d.reset(); d.hook = () => { throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); };
  assert.deepEqual(await gone('bytes=10-29'), [404, GONE, null, null]);
  d.failClose = true;
  got = await answer(await store.response('moment-1', 'bytes=10-29'));
  assert.equal(got.status, 206); assert.ok(got.body.equals(clip.subarray(10, 30)));
  assert.deepEqual([d.bytes, d.opened, d.closed, d.failClose], [20, 2, 2, false]);
  // The file loses its end once its size is known. Part of the range is still there: five bytes are not an answer of twenty.
  d.reset(); d.hook = () => fs.truncate(file, 15);
  assert.deepEqual(await gone('bytes=10-29'), [404, GONE, null, null]);
  assert.deepEqual([d.bytes, d.opened, d.closed], [5, 1, 1], 'what was left was read, and thrown away');
  // Cut again, before the range this time: the first read finds the end of the file.
  d.reset(); d.hook = () => fs.truncate(file, 12);
  assert.deepEqual(await gone('bytes=12-14'), [404, GONE, null, null]);
  d.hook = () => fs.truncate(file, 6);
  assert.deepEqual(await gone(undefined), [404, GONE, null, null], 'nor is a whole clip answered short');
  assert.deepEqual([d.bytes, d.opened, d.closed], [6, 2, 2]);
  // The next request measures the file as it now is.
  got = await answer(await store.response('moment-1', 'bytes=2-29'));
  assert.deepEqual([got.status, got.headers['content-range'], got.headers['content-length']], [206, 'bytes 2-5/6', '4']); assert.ok(got.body.equals(clip.subarray(2, 6)));
  assert.equal((await store.response('moment-1', 'bytes=6-')).status, 416);
});

test('GET /v1/media answers one byte of a two-megabyte clip by reading one byte, behind the statuses and gates it had', async t => {
  const clip = pattern(2 * MIB), f = await served(t, clip), d = f.d;
  const got = async (route, range) => answer(await f.get(route, range === undefined ? {} : { Range: range }));
  for (const route of ['/v1/media/moment-1', `/v1/media/${f.id}/moment-1`]) {
    d.reset();
    const one = await got(route, 'bytes=0-0');
    assert.deepEqual([one.status, one.headers, [...one.body]], [206, { ...MEDIA, 'content-range': 'bytes 0-0/2097152', 'content-length': '1' }, [clip[0]]], route);
    assert.deepEqual([d.bytes, d.opened, d.closed], [1, 1, 1], `${route}: one byte read for one byte sent`);
  }
  d.reset();
  const tail = await got('/v1/media/moment-1', 'bytes=2097148-9999999');
  assert.deepEqual([tail.status, tail.headers['content-range'], tail.headers['content-length']], [206, 'bytes 2097148-2097151/2097152', '4']); assert.ok(tail.body.equals(clip.subarray(-4)));
  assert.deepEqual([d.bytes, d.opened, d.closed], [4, 1, 1]);
  d.reset();
  const refused = await got('/v1/media/moment-1', 'bytes=2097152-');
  assert.deepEqual([refused.status, refused.headers['content-range'], refused.headers['content-type'], refused.body.length], [416, 'bytes */2097152', null, 0]);
  assert.deepEqual([d.bytes, d.opened, d.closed], [0, 1, 1]);
  // Asked whole, the clip is sent whole: every byte of it is read, since every byte of it is the answer.
  d.reset();
  const whole = await got('/v1/media/moment-1');
  assert.deepEqual([whole.status, whole.headers], [200, { ...MEDIA, 'content-range': null, 'content-length': '2097152' }]); assert.ok(whole.body.equals(clip));
  assert.deepEqual([d.bytes, d.opened, d.closed], [2 * MIB, 1, 1]);
  // The gates before the store stand where they stood: no clip is opened for a request they refuse.
  d.reset();
  const unknown = await fetch(f.server.url + '/v1/media/moment-1', { headers: { Range: 'bytes=0-0' } });
  assert.deepEqual([unknown.status, await unknown.json()], [401, { error: 'Appareil non authentifié.', code: 'unauthenticated' }]);
  assert.deepEqual([(await got(`/v1/media/${randomUUID()}/moment-1`, 'bytes=0-0')).status, (await got('/v1/media/moment-7', 'bytes=0-0')).status, (await got('/v1/media/..%2Fmoment-1', 'bytes=0-0')).status], [410, 410, 404]);
  const historicalClip = await f.openHistorical();
  d.reset();
  assert.deepEqual([(await got('/v1/media/moment-1', 'bytes=0-0')).status, (await got('/v1/media/moment-1', 'bytes=x')).status], [410, 410], 'an expired passage is refused before its range is looked at');
  assert.deepEqual([d.bytes, d.opened, d.closed], [0, 0, 0]);
  const archivedRange = await got('/v1/media/moment-4', 'bytes=1-3');
  assert.deepEqual([archivedRange.status, archivedRange.body], [206, historicalClip.subarray(1, 4)]);
  assert.equal(archivedRange.headers['content-range'], `bytes 1-3/${historicalClip.length}`);
  assert.deepEqual([d.bytes, d.opened, d.closed], [3, 1, 1]);
});

test('a client that gives up while its range is being read leaves no descriptor open, and the server goes on answering', async t => {
  const f = await served(t, pattern(4096)), d = f.d, held = deferred(), client = new AbortController();
  const clip = await f.openHistorical();
  d.reset();
  // The read is held: the request is inside the store when its client goes away.
  d.hook = () => held.promise;
  const given = f.get('/v1/media/moment-4', { Range: 'bytes=0-99' }, { signal: client.signal }).then(() => 'answered', error => error.name);
  await until(() => d.opened === 1, 'the clip is opened for the request');
  client.abort();
  assert.equal(await given, 'AbortError');
  assert.deepEqual([d.bytes, d.opened, d.closed], [0, 1, 0]);
  held.resolve();
  await until(() => d.closed === 1, 'the descriptor is closed');
  // Kept as it was: the answer is prepared whole before it is sent, so the read under way is finished, for nobody.
  assert.deepEqual([d.bytes, d.opened, d.closed], [100, 1, 1]);
  const next = await answer(await f.get('/v1/media/moment-4', { Range: 'bytes=100-103' }));
  assert.deepEqual([next.status, next.headers['content-range']], [206, `bytes 100-103/${clip.length}`]); assert.ok(next.body.equals(clip.subarray(100, 104)));
  assert.deepEqual([d.bytes, d.opened, d.closed], [104, 2, 2]);
});
