const { HISTORICAL_IDENTITY } = require('../adapters/embeddings/provider-identity.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const sharp = require('sharp');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
const { RemoteServer } = require('../server/http.cjs');
const { DiskGuard } = require('../adapters/disk-guard.cjs');
const { VideoTools, consultationOf } = require('../core/video-tools.cjs');
const { manualClock } = require('./helpers/clock.cjs');
const { until, tick, deferred, turns } = require('./helpers/wait.cjs');
const { emptyArchive } = require('./helpers/empty-archive.cjs');

const token = 's'.repeat(64), GIB = 1024 ** 3;
const READ_ONLY = 'Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.';
const CACHE_CREATION_LOG = JSON.stringify({
  code: 'TVLENS_EMBEDDING_CACHE_LOAD', cause: 'missing', rebuild: 'total', providerCallsPossible: true,
  message: 'Cache d’embeddings absent : création normale nécessaire ; nouveaux appels au fournisseur possibles pour les vecteurs demandés.',
});
const exists = target => fs.lstat(target).then(() => true, () => false);
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
  // Resolves once `total` writes have reached the disk: the last of them is the one in flight while it is held.
  // A write that never comes fails the test instead of holding it.
  d.reached = async total => { for (const limit = Date.now() + 5000; d.seen.length < total; await tick()) if (Date.now() > limit) assert.fail(`the disk was handed ${d.seen.length} write(s), ${total} expected`); };
  return d;
}
// A chat agent the test drives: its draft moves when the test says so, and its answer comes when the test hands it.
function drivenChat() {
  const turn = {};
  turn.answer = input => new Promise((resolve, reject) => {
    Object.assign(turn, { progress: input.onProgress, finish: resolve });
    input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true });
  });
  return turn;
}
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

// A real HeadlessRuntime behind a real RemoteServer on an ephemeral port, simulated providers, a
// temporary root and clocks held by the test. boot() can be called again on the same root: a restart.
async function fixture(t, { chat, runtimeOptions = () => ({}) } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-server-sessions-')), sessionsRoot = path.join(root, 'sessions');
  const jpeg = (await sharp({ create: { width: 64, height: 36, channels: 3, background: '#264136' } }).jpeg().toBuffer()).toString('base64');
  const f = { root, sessionsRoot, clock: 0, wall: 1790000000000, calls: { prepare: 0, embed: 0, assemble: 0 }, hosts: [] };
  const agent = { prepare: async () => { f.calls.prepare++; }, close: async () => {},
    answer: chat || (async ({ question }) => ({ answer: 'Réponse à : ' + question, kind: 'explanation', citations: [], limits: [] })) };
  const embeddings = { identity: HISTORICAL_IDENTITY, embed: async () => { f.calls.embed++; return [1, 0]; }, embedMany: async texts => { f.calls.embed += texts.length; return texts.map(() => [1, 0]); } };
  const media = { assemble: async input => { f.calls.assemble++; return { ...input, clip: Buffer.from('fixture ' + input.startMs), frames: [{ atMs: input.startMs, dataUrl: 'data:image/jpeg;base64,' + jpeg }], audio: null }; } };
  f.boot = async () => {
    const runtime = new HeadlessRuntime({ userData: root, sessionsRoot, config: {}, selectedModels: {}, smoke: true, agent, readClock: () => f.clock, wallClock: () => f.wall,
      overrides: { embeddings }, ...runtimeOptions(f) });
    const server = await new RemoteServer({ runtime, media, token }).listen(0, '127.0.0.1');
    const host = { runtime, server, stopped: false, stop: async () => { if (host.stopped) return; host.stopped = true; await server.close(); await runtime.close(); } };
    f.hosts.push(host); Object.assign(f, { runtime, server });
    return host;
  };
  f.raw = (route, init = {}) => fetch(f.server.url + route, { ...init, headers: { Authorization: 'Bearer ' + token, ...init.headers } });
  f.req = async (route, body) => {
    const res = await f.raw(route, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, value: await res.json() };
  };
  // One captured block of 8 s ending at `endMs` on the session clock, then the analysis is left to finish.
  f.block = async (sessionId, sequence, endMs) => {
    f.clock += Math.max(0, endMs - (f.runtime.session?.watch.now() ?? endMs)); f.wall += 8000;
    const sent = await f.req('/v1/segments', { sessionId, sequence, startMs: endMs - 8000, endMs, frames: [{ atMs: endMs - 8000, data: 'YQ==' }] });
    do { await tick(); } while (f.runtime.session?.watch.running);
    // The analysis is saved after it is published: wait for the write too.
    await f.runtime.session?.store.serial;
    return sent;
  };
  f.ask = async (sessionId, question) => {
    const { value } = await f.req('/v1/questions', { sessionId, question, anchorMs: 0 });
    const job = f.runtime.deep.jobs.find(item => item.id === value.id);
    await job.done; await turns(5); await f.runtime.session?.store.serial;
    return job;
  };
  f.saved = async (id, name) => JSON.parse(await fs.readFile(path.join(sessionsRoot, id, name), 'utf8'));
  // The three resources a client polls, each asked again with the entity tag it holds.
  f.polled = async held => Object.fromEntries(await Promise.all(['/v1/state?view=chat', '/v1/state?view=panel', '/v1/surveillance/overlay'].map(async route => {
    const res = await f.raw(route, held ? { headers: { 'If-None-Match': held[route].etag } } : {}), text = await res.text();
    return [route, { status: res.status, etag: res.headers.get('etag'), bytes: Buffer.byteLength(text), value: text ? JSON.parse(text) : null }];
  })));
  t.after(async () => { for (const host of f.hosts) await host.stop(); await fs.rm(root, { recursive: true, force: true }); });
  await f.boot();
  return f;
}

function holdLibrary(t, library, method) {
  const entered = deferred(), release = deferred();
  const original = library[method].bind(library);
  const mock = t.mock.method(library, method, async (...args) => {
    entered.resolve();
    await release.promise;
    return original(...args);
  });
  t.after(() => release.resolve());
  const releaseHeld = () => {
    mock.mock.restore();
    release.resolve();
  };
  return { entered: entered.promise, release: releaseHeld };
}

function currentFacts(list) {
  const row = list.sessions.find(item => item.current);
  return {
    current: list.current,
    row: row ? {
      id: row.id, title: row.title, state: row.state, elapsedMs: row.elapsedMs,
      passages: row.passages, media: row.media, current: row.current, readOnly: row.readOnly, capturing: row.capturing,
    } : null,
  };
}

test('HTTP session listing keeps the entry session facts while the library waits across a replacement', async t => {
  const f = await fixture(t);
  const A = (await f.req('/v1/session/start', {})).value.id;
  await f.block(A, 1, 8000);
  const before = currentFacts((await f.req('/v1/sessions')).value);
  assert.deepEqual([before.current.id, before.current.accepting, before.row.passages, before.row.media.stored], [A, true, 1, 1]);
  const held = holdLibrary(t, f.runtime.library, 'list');
  const pending = f.req('/v1/sessions');
  await held.entered;
  try {
    assert.equal((await f.req('/v1/session/end', {})).status, 200);
    f.wall += 120000;
    const B = (await f.req('/v1/session/start', {})).value.id;
    assert.notEqual(B, A);
    await f.block(B, 1, 8000);
    await f.block(B, 2, 16000);
    assert.equal((await f.req('/v1/session/pause', {})).status, 200);
  } finally { held.release(); }
  const reply = await pending;
  assert.equal(reply.status, 200);
  assert.deepEqual(currentFacts(reply.value), before);
});

test('HTTP storage keeps the entry session volume while library usage waits across a replacement', async t => {
  const f = await fixture(t, { runtimeOptions: f => ({
    guard: new DiskGuard({ path: f.sessionsRoot, freeBytes: async () => f.free ?? 50 * GIB, now: () => f.wall }),
  }) });
  const A = (await f.req('/v1/session/start', {})).value.id;
  await f.block(A, 1, 8000);
  const before = (await f.req('/v1/storage')).value;
  assert.ok(before.session.sessionBytes > 0);
  const held = holdLibrary(t, f.runtime.library, 'usage');
  const pending = f.req('/v1/storage');
  await held.entered;
  try {
    assert.equal((await f.req('/v1/session/end', {})).status, 200);
    const B = (await f.req('/v1/session/start', {})).value.id;
    await f.block(B, 1, 8000);
    await f.block(B, 2, 16000);
    assert.equal((await f.req('/v1/session/pause', {})).status, 200);
    f.free = 40 * GIB;
    f.wall += 6000;
  } finally { held.release(); }
  const reply = await pending;
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.value.session, before.session);
  assert.deepEqual([reply.value.sessions, reply.value.bytes, reply.value.freeBytes], [1, before.bytes, 40 * GIB]);
});

for (const route of ['/v1/sessions', '/v1/storage']) {
  for (const transition of ['close', 'open archive']) {
    test(`HTTP ${route} keeps A while the library waits across ${transition}`, async t => {
      const f = await fixture(t);
      const archive = await emptyArchive(f.sessionsRoot, 'server');
      const A = (await f.req('/v1/session/start', {})).value.id;
      await f.block(A, 1, 8000);
      const before = (await f.req(route)).value;
      const held = holdLibrary(t, f.runtime.library, 'list');
      const pending = f.req(route);
      await held.entered;
      try {
        assert.equal((await f.req('/v1/session/end', {})).status, 200);
        if (transition === 'open archive') {
          const opened = await f.req(`/v1/sessions/${archive.id}/open`, {});
          assert.deepEqual([opened.status, opened.value.readOnly, opened.value.retention], [200, true, 'until-deleted']);
        }
      } finally { held.release(); }
      const reply = await pending;
      assert.equal(reply.status, 200);
      if (route === '/v1/sessions') {
        assert.deepEqual(currentFacts(reply.value), currentFacts(before));
        assert.ok(reply.value.sessions.every(row => row.id));
        const archived = reply.value.sessions.find(row => row.id === archive.id);
        assert.deepEqual([archived.state, archived.current, archived.readOnly, archived.capturing], ['archived', false, false, false]);
      } else {
        assert.deepEqual(reply.value.session, before.session);
        assert.deepEqual([reply.value.sessions, reply.value.bytes], [before.sessions, before.bytes]);
      }
    });
  }

  test(`HTTP ${route} keeps an absent entry session while a session arrives during the library wait`, async t => {
    const f = await fixture(t);
    const held = holdLibrary(t, f.runtime.library, 'list');
    const pending = f.req(route);
    await held.entered;
    try {
      const B = (await f.req('/v1/session/start', {})).value.id;
      assert.equal((await f.block(B, 1, 8000)).status, 200);
    } finally { held.release(); }
    const reply = await pending;
    assert.equal(reply.status, 200);
    if (route === '/v1/sessions') {
      assert.equal(reply.value.current, null);
      assert.equal(reply.value.sessions.length, 1);
      assert.ok(reply.value.sessions.every(row => row.id && !row.current && !row.capturing && !row.readOnly));
    } else {
      assert.equal(reply.value.session, null);
      assert.equal(reply.value.sessions, 1);
      assert.ok(reply.value.bytes > 0);
    }
  });

  test(`HTTP ${route} freezes flags and figures while the same session captures more and pauses`, async t => {
    const f = await fixture(t);
    const A = (await f.req('/v1/session/start', {})).value.id;
    await f.block(A, 1, 8000);
    const before = (await f.req(route)).value;
    const held = holdLibrary(t, f.runtime.library, 'list');
    const pending = f.req(route);
    await held.entered;
    try {
      assert.equal((await f.block(A, 2, 16000)).status, 200);
      assert.equal((await f.req('/v1/session/pause', {})).status, 200);
    } finally { held.release(); }
    const reply = await pending;
    assert.equal(reply.status, 200);
    if (route === '/v1/sessions') assert.deepEqual(currentFacts(reply.value), currentFacts(before));
    else assert.deepEqual(reply.value.session, before.session);
  });
}

test('HTTP session listing owns the published figures even if their input objects change during the wait', async t => {
  const f = await fixture(t);
  const A = (await f.req('/v1/session/start', {})).value.id;
  await f.block(A, 1, 8000);
  const revision = f.runtime.revision;
  f.runtime.session.watch.emit();
  assert.equal(f.runtime.revision, revision + 1);
  const published = f.runtime.sessionState;
  const before = currentFacts((await f.req('/v1/sessions')).value);
  const held = holdLibrary(t, f.runtime.library, 'list');
  const pending = f.req('/v1/sessions');
  await held.entered;
  published.coverage.passages = 7;
  published.segments[0].available = false;
  held.release();
  const reply = await pending;
  assert.equal(reply.status, 200);
  assert.deepEqual(currentFacts(reply.value), before);
});

test('HTTP session listing preserves library order and counts storage before the fifty row limit', async t => {
  const f = await fixture(t);
  const A = (await f.req('/v1/session/start', {})).value.id;
  await f.block(A, 1, 8000);
  const before = (await f.req('/v1/storage')).value;
  const listed = Array.from({ length: 51 }, (_, index) => ({
    id: randomUUID(), title: `Archive ${index}`, state: 'archived', updatedAt: 1000 - index,
    elapsedMs: 1000, passages: 1, media: { stored: 1, missing: 0, bytes: index + 1 },
  }));
  listed.push({ ...listed[0], id: A, title: 'Titre de bibliothèque', media: { stored: 0, missing: 9, bytes: 999999 } });
  t.mock.method(f.runtime.library, 'list', async () => listed);
  const expectedBytes = before.session.sessionBytes + 51 * 52 / 2;
  const list = await f.req('/v1/sessions');
  assert.equal(list.status, 200);
  assert.deepEqual(Object.keys(list.value).sort(), ['current', 'sessions', 'storage', 'total']);
  assert.equal(list.value.current.id, A);
  assert.deepEqual(list.value.sessions.map(row => row.id), listed.slice(0, 50).map(row => row.id));
  assert.deepEqual([list.value.total, list.value.storage.sessions, list.value.storage.bytes], [52, 52, expectedBytes]);
  const storage = await f.req('/v1/storage');
  assert.deepEqual(storage, { status: 200, value: { ...before, sessions: 52, bytes: expectedBytes } });
});

for (const resume of [false, true]) {
  test(`an empty server archive survives closing ${resume ? 'after explicit resume and pause' : 'without resume or archive writes'}`, async t => {
    const f = await fixture(t);
    const archive = await emptyArchive(f.sessionsRoot, 'server');
    const before = await tree(archive.dir);
    const opened = await f.req(`/v1/sessions/${archive.id}/open`, {});
    assert.deepEqual([opened.status, opened.value.readOnly], [200, true]);
    assert.deepEqual((await f.req('/v1/state')).value.session.questions, []);
    if (resume) {
      const resumed = await f.req(`/v1/sessions/${archive.id}/resume`, {});
      assert.deepEqual([resumed.status, resumed.value.accepting], [200, true]);
      assert.equal((await f.req('/v1/session/pause', {})).status, 200);
    }
    assert.deepEqual((await f.req('/v1/sessions/close', {})).value, { closed: true, id: archive.id, archived: true });
    assert.equal(await exists(archive.dir), true);
    for (const name of archive.files) assert.equal(await exists(path.join(archive.dir, name)), true, name);
    assert.deepEqual((await f.req('/v1/sessions')).value.sessions.map(row => [row.id, row.state, row.passages]), [[archive.id, 'archived', 0]]);
    if (!resume) assert.deepEqual(await tree(archive.dir), before, 'read-only closing writes nothing');
  });
}

test('the start of a film is still served 95 minutes later, after a stop and a restart; an opened archive stays read-only until an explicit resume, and questions never cross sessions', async t => {
  const f = await fixture(t);
  const first = (await f.req('/v1/session/start', {})).value, A = first.id, dirA = path.join(f.sessionsRoot, A);
  assert.deepEqual([first.retention, first.retentionMs, first.readOnly, first.accepting], ['until-deleted', null, false, true]);
  // Before its first passage the session has no directory: it is listed from memory.
  let list = (await f.req('/v1/sessions')).value;
  assert.deepEqual([list.current.id, list.sessions.map(s => [s.id, s.current, s.capturing, s.passages])], [A, [[A, true, true, 0]]]);
  assert.equal((await f.block(A, 100, 8000)).value.id, 'moment-1');
  await f.ask(A, 'Comment ça commence ?');
  assert.equal((await f.block(A, 101, 5700000)).value.id, 'moment-2');
  // 95 minutes in: nothing expired. Both forms of the media route serve the first passage.
  for (const route of ['/v1/media/moment-1', `/v1/media/${A}/moment-1`]) {
    const replay = await f.raw(route, { headers: { Range: 'bytes=0-6' } });
    assert.equal(replay.status, 206); assert.equal(await replay.text(), 'fixture');
  }
  assert.equal((await f.raw(`/v1/media/${randomUUID()}/moment-1`)).status, 410);
  list = (await f.req('/v1/sessions')).value;
  assert.deepEqual(list.sessions.map(s => [s.id, s.state, s.passages, s.media.stored, s.media.missing]), [[A, 'live', 2, 2, 0]]);

  // What a service stop runs, then a new process on the same data: no start-up sweep.
  await f.hosts[0].stop();
  assert.deepEqual((await fs.readdir(path.join(dirA, 'media'))).sort(), ['moment-1.json', 'moment-1.webm', 'moment-2.json', 'moment-2.webm']);
  f.clock = 20000000; f.wall += 3600000;
  await f.boot();
  assert.equal((await f.req('/v1/state')).value.session, null);
  list = (await f.req('/v1/sessions')).value;
  assert.deepEqual([list.current, list.total, list.sessions.map(s => [s.id, s.state, s.current, s.passages, s.media.stored, s.elapsedMs])], [null, 1, [[A, 'archived', false, 2, 2, 5700000]]]);
  assert.deepEqual([list.storage.sessions, list.storage.bytes, list.storage.state], [1, list.sessions[0].media.bytes, 'unknown']);
  assert.ok(list.sessions[0].media.bytes > 0);

  // Opening: stopped at its archived instant, questions restored, no provider called, nothing written.
  const before = await tree(dirA);
  Object.assign(f.calls, { prepare: 0, embed: 0, assemble: 0 });
  const opened = await f.req(`/v1/sessions/${A}/open`, {});
  assert.deepEqual([opened.status, opened.value.id, opened.value.readOnly, opened.value.accepting, opened.value.elapsedMs], [200, A, true, false, 5700000]);
  let state = (await f.req('/v1/state')).value;
  assert.deepEqual([state.session.readOnly, state.session.accepting, state.session.elapsedMs], [true, false, 5700000]);
  assert.deepEqual(state.session.segments.map(s => [s.id, s.status, s.available, s.thumbnailAvailable]), [['moment-1', 'ready', true, true], ['moment-2', 'ready', true, true]]);
  assert.deepEqual(state.chat.jobs.map(j => [j.question, j.status, j.result.answer]), [['Comment ça commence ?', 'done', 'Réponse à : Comment ça commence ?']]);
  assert.deepEqual((await f.req('/v1/session')).value, { id: A, accepting: false, readOnly: true, storage: { state: 'unknown' } });
  const replay = await f.raw(`/v1/media/${A}/moment-1`, { headers: { Range: 'bytes=0-6' } });
  assert.equal(replay.status, 206); assert.equal(await replay.text(), 'fixture');
  const thumbnail = await f.raw(`/v1/thumbnail/${A}/moment-1`);
  assert.equal(thumbnail.status, 200); assert.equal((await sharp(Buffer.from(await thumbnail.arrayBuffer())).metadata()).width, 64);
  // Consulting never captures: blocks are refused before being assembled, and so is a plain start.
  const refused = await f.block(A, 102, 5708000);
  assert.deepEqual([refused.status, refused.value, f.calls.assemble], [409, { error: READ_ONLY, code: 'read-only' }, 0]);
  assert.deepEqual(await f.req('/v1/session/start', {}), { status: 409, value: { error: READ_ONLY, code: 'read-only' } });
  assert.equal((await f.req('/v1/surveillance/start', { sessionId: A, instruction: 'Vérifie les chiffres.' })).status, 409);
  assert.deepEqual((await f.req(`/v1/sessions/${A}/open`, {})).value.readOnly, true, 'opening it again changes nothing');
  await turns(20);
  assert.deepEqual([f.calls.prepare, f.calls.embed], [0, 0], 'no warm-up, no indexing');
  assert.deepEqual(await tree(dirA), before, 'opening, polling and refused requests wrote nothing into the archive');

  // Explicit resume: same session, same clock, numbering continues; only now is a provider warmed up.
  const resumed = await f.req(`/v1/sessions/${A}/resume`, {});
  assert.deepEqual([resumed.status, resumed.value.id, resumed.value.readOnly, resumed.value.accepting, resumed.value.elapsedMs], [200, A, false, true, 5700000]);
  assert.equal(f.calls.prepare, 1);
  assert.equal((await f.req('/v1/session/start', {})).value.id, A);
  f.clock += 8000;
  const next = await f.block(A, 500, 5708000);
  assert.deepEqual([next.status, next.value.id], [200, 'moment-3']);
  // The TV restarted: its capture numbers its blocks from a lower origin after the next start.
  await f.req('/v1/session/pause', {}); await f.req('/v1/session/start', {});
  f.clock += 8000;
  assert.deepEqual((await f.block(A, 7, 5716000)).value, { id: 'moment-4', duplicate: false });
  assert.equal((await f.block(A, 7, 5716000)).value.duplicate, true, 'within one capture the numbering still deduplicates');

  // Ending archives. A new session starts with an empty conversation, and each folder keeps its own.
  assert.deepEqual((await f.req('/v1/session/end', {})).value, { ended: true, id: A, archived: true });
  assert.equal((await f.saved(A, 'manifest.json')).state, 'archived');
  const B = (await f.req('/v1/session/start', {})).value.id;
  assert.notEqual(B, A);
  assert.deepEqual((await f.req('/v1/state')).value.chat.jobs, []);
  await f.ask(B, 'Et maintenant ?');
  assert.equal((await f.req(`/v1/sessions/${A}/open`, {})).status, 409, 'not while this session captures');
  await f.req('/v1/session/pause', {});
  const closedA = await tree(dirA);
  assert.equal((await f.req(`/v1/sessions/${A}/open`, {})).status, 200);
  state = (await f.req('/v1/state')).value;
  assert.deepEqual([state.session.id, state.chat.jobs.map(j => j.question)], [A, ['Comment ça commence ?']]);
  assert.deepEqual((await f.saved(A, 'deep-answers.json')).jobs.map(j => j.question), ['Comment ça commence ?']);
  assert.deepEqual((await f.saved(B, 'deep-answers.json')).jobs.map(j => j.question), ['Et maintenant ?']);
  // A question is allowed on an archive that is only being read, and is saved with it.
  await f.ask(A, 'Qui parle au début ?');
  assert.deepEqual((await f.saved(A, 'deep-answers.json')).jobs.map(j => j.question), ['Comment ça commence ?', 'Qui parle au début ?']);
  assert.deepEqual((await f.req('/v1/sessions/close', {})).value, { closed: true, id: A, archived: true });
  assert.deepEqual((await tree(dirA)).filter(row => row[0] !== 'deep-answers.json'), closedA.filter(row => row[0] !== 'deep-answers.json'), 'apart from the question asked, the archive is as it was');

  // A session ended without a passage or a question is not kept.
  const C = (await f.req('/v1/session/start', {})).value.id, dirC = path.join(f.sessionsRoot, C);
  await f.req('/v1/session/pause', {});
  assert.equal(await exists(dirC), true);
  // What a crash at this point leaves behind: an empty session on disk that this host did not start.
  const D = randomUUID(), dirD = path.join(f.sessionsRoot, D);
  await fs.mkdir(dirD);
  for (const name of ['session.json', 'manifest.json']) await fs.writeFile(path.join(dirD, name), (await fs.readFile(path.join(dirC, name), 'utf8')).replaceAll(C, D));
  assert.deepEqual((await f.req('/v1/session/end', {})).value, { ended: true, id: C, archived: false });
  assert.equal(await exists(dirC), false);
  assert.deepEqual((await f.req('/v1/sessions')).value.sessions.map(s => [s.id, s.state]).sort(), [[A, 'archived'], [B, 'archived'], [D, 'interrupted']].sort());
  // Opening then closing an archive never discards it, however short it is: only a deletion deletes.
  const interrupted = await tree(dirD);
  assert.equal((await f.req(`/v1/sessions/${D}/open`, {})).value.readOnly, true);
  assert.deepEqual((await f.req('/v1/sessions/close', {})).value, { closed: true, id: D, archived: true });
  assert.deepEqual(await tree(dirD), interrupted);
});

test('deleting a session over HTTP is refused during capture and for anything but one session identifier; it cancels the running question and surveillance, and nothing brings the folder back', async t => {
  const late = deferred(), asked = deferred();
  const f = await fixture(t, { chat: async ({ question }) => { asked.resolve(); if (question === 'Longue question') await late.promise; return { answer: 'Réponse tardive', kind: 'explanation', citations: [], limits: [] }; } });
  const N = (await f.req('/v1/session/start', {})).value.id, dirN = path.join(f.sessionsRoot, N);
  await f.block(N, 1, 8000); await f.ask(N, 'Voisine ?');
  await f.req('/v1/session/end', {});
  const neighbour = await tree(dirN);
  const L = (await f.req('/v1/session/start', {})).value.id, dirL = path.join(f.sessionsRoot, L);
  assert.deepEqual([(await f.block(L, 1, 8000)).value.id, (await f.block(L, 2, 16000)).value.id], ['moment-1', 'moment-2']);
  assert.equal((await f.req('/v1/surveillance/start', { sessionId: L, instruction: 'Vérifie les chiffres.' })).value.surveillance.enabled, true);
  const { value: question } = await f.req('/v1/questions', { sessionId: L, question: 'Longue question', anchorMs: 0 });
  await asked.promise; await turns(20);
  const job = f.runtime.deep.jobs.find(item => item.id === question.id), loaded = f.runtime.session;
  assert.equal(job.status, 'running');
  await loaded.search.index.ensure(loaded.watch.segments); await loaded.store.serial;
  for (const name of ['session.json', 'manifest.json', 'deep-answers.json', 'surveillance.json', 'embeddings.json', 'media/moment-2.webm', 'thumbs/moment-2.jpg'])
    assert.equal(await exists(path.join(dirL, name)), true, name);

  // During capture, and for anything that is not exactly one session identifier: refused, nothing erased.
  const all = await tree(f.sessionsRoot);
  assert.deepEqual(await f.req(`/v1/sessions/${L}/delete`, {}), { status: 409, value: { error: 'Arrête la capture avant de supprimer cette session.', code: 'capturing' } });
  for (const bad of ['..%2F' + N, 'sessions', N.toUpperCase(), N + '%00', '%20' + N, 'moment-1'])
    for (const action of ['delete', 'open', 'resume'])
      assert.deepEqual(await f.req(`/v1/sessions/${bad}/${action}`, {}),
        { status: 400, value: { error: 'Identifiant de session invalide.', code: 'invalid-session-id' } }, bad + ' ' + action);
  // Dot segments are resolved before routing: they never reach a session route at all.
  for (const dots of ['..', '%2E%2E', `${N}/..`])
    assert.equal((await f.req(`/v1/sessions/${dots}/delete`, {})).status, 404, dots);
  for (const action of ['delete', 'open', 'resume'])
    assert.deepEqual(await f.req(`/v1/sessions/${randomUUID()}/${action}`, {}), { status: 404, value: { error: 'Session introuvable.', code: 'not-found' } });
  assert.equal((await f.req(`/v1/sessions/${N}/resume`, {})).status, 409, 'a session that is not the opened one cannot be resumed');
  assert.equal((await f.raw(`/v1/sessions/${N}/delete`, { method: 'DELETE' })).status, 405);
  assert.deepEqual((await tree(f.sessionsRoot)).map(row => row[0]), all.map(row => row[0]));
  assert.equal(job.status, 'running');

  await f.req('/v1/session/pause', {});
  const removed = await f.req(`/v1/sessions/${L}/delete`, {});
  assert.deepEqual([removed.status, removed.value.deleted, removed.value.id, removed.value.freedBytes > 0], [200, true, L, true]);
  assert.deepEqual([job.status, job.message], ['cancelled', 'Session supprimée.']);
  assert.equal(await exists(dirL), false);
  const state = (await f.req('/v1/state')).value;
  assert.deepEqual([state.session, state.chat.jobs, state.surveillance.enabled, state.surveillance.activity.state], [null, [], false, 'idle']);

  // Everything that could still try to write: the provider answering late, the next ticks, and the
  // objects of the deleted session themselves.
  late.resolve(); await turns(20);
  f.wall += 5000; f.runtime.tick();
  await loaded.store.save(loaded.watch.snapshot());
  await loaded.store.saveResearch({ jobs: [] }); await loaded.store.saveSurveillance({}); await loaded.store.saveManifest({ state: 'live' });
  await assert.rejects(loaded.thumbnails.put('moment-9', 'data:image/jpeg;base64,YQ=='), /terminée/);
  await loaded.search.index.cache.putMany([{ id: 'moment-9', text: 'Vecteur tardif', vector: [0, 1] }]);
  loaded.watch.emit(); await loaded.pause().catch(() => {});
  await turns(20);
  assert.equal(await exists(dirL), false, 'the deleted session does not come back');
  assert.deepEqual(await tree(dirN), neighbour, 'the neighbour is untouched: same files, same bytes, same dates');
  assert.deepEqual((await f.req('/v1/sessions')).value.sessions.map(s => s.id), [N]);
  assert.equal((await f.req(`/v1/sessions/${L}/delete`, {})).status, 404);

  // A session that is not in memory is deleted the same way, and only it.
  const last = await f.req(`/v1/sessions/${N}/delete`, {});
  assert.deepEqual([last.status, last.value.id, await exists(dirN)], [200, N, false]);
  assert.deepEqual((await f.req('/v1/sessions')).value.sessions, []);
});

test('below the disk floor a block is answered 507 with nothing written; the session pauses and says why, stays open to questions and reading, and captures again once room is back', async t => {
  let free = 50 * GIB;
  const f = await fixture(t, { runtimeOptions: f => ({ guard: new DiskGuard({ path: f.sessionsRoot, minFreeBytes: GIB, warnFreeBytes: 2 * GIB, freeBytes: async () => free, now: () => f.wall }) }) });
  const id = (await f.req('/v1/session/start', {})).value.id, dir = path.join(f.sessionsRoot, id);
  assert.equal((await f.block(id, 1, 8000)).status, 200);
  assert.deepEqual([(await f.req('/v1/state')).value.storage.state, (await f.req('/v1/session')).value.storage.state], ['ok', 'ok']);
  const kept = await tree(path.join(dir, 'media'));

  free = GIB - 1;
  const full = await f.block(id, 2, 16000);
  assert.equal(full.status, 507);
  assert.equal(full.value.code, 'storage-full');
  assert.match(full.value.error, /^Espace disque insuffisant : la capture est suspendue pour ne rien supprimer\./);
  assert.deepEqual((await fs.readdir(dir, { recursive: true })).filter(name => /moment-2/.test(name)), [], 'no partial file of the refused passage');
  assert.deepEqual(await tree(path.join(dir, 'media')), kept, 'what was stored before is intact');
  let state = (await f.req('/v1/state')).value;
  assert.deepEqual([state.storage.state, state.session.storage.state, state.session.accepting, state.session.segments.length], ['blocked', 'blocked', false, 1]);
  assert.equal(state.session.lastError, full.value.error);
  assert.deepEqual((await f.req('/v1/session')).value, { id, accepting: false, readOnly: false, storage: { state: 'blocked' } });
  // Paused as a whole: the session clock no longer runs while nothing can be captured.
  f.clock += 60000;
  assert.equal((await f.req('/v1/state')).value.session.elapsedMs, state.session.elapsedMs);
  // A retry is refused the same way without being assembled, and so is a resume.
  const assembled = f.calls.assemble;
  const again = await f.block(id, 3, 24000);
  assert.deepEqual([again.status, again.value, f.calls.assemble], [507, full.value, assembled]);
  const start = await f.req('/v1/session/start', {});
  assert.deepEqual([start.status, start.value.code], [507, 'storage-full']);
  // Reading and asking still work on what is there.
  assert.equal((await f.raw('/v1/media/moment-1', { headers: { Range: 'bytes=0-6' } })).status, 206);
  assert.equal((await f.ask(id, 'Que sait-on déjà ?')).result.answer, 'Réponse à : Que sait-on déjà ?');

  // Archived, a new session is refused too, and nothing was deleted to make room.
  assert.equal((await f.req('/v1/sessions/close', {})).value.archived, true);
  const fresh = await f.req('/v1/session/start', {});
  assert.deepEqual([fresh.status, fresh.value.code, f.runtime.session], [507, 'storage-full', null]);
  assert.deepEqual([(await f.req('/v1/state')).value.session, (await f.req('/v1/state')).value.storage.state, (await f.req('/v1/surveillance/overlay')).value.storage], [null, 'blocked', { state: 'blocked' }], 'the reason is published even with no session in memory');
  const listed = (await f.req('/v1/sessions')).value;
  assert.deepEqual([listed.sessions.map(s => [s.id, s.media.stored]), listed.storage.state], [[[id, 1]], 'blocked']);
  assert.equal((await f.req('/v1/storage')).value.state, 'blocked');
  assert.equal((await f.req(`/v1/sessions/${id}/open`, {})).status, 200);
  assert.equal((await f.req(`/v1/sessions/${id}/resume`, {})).status, 507);
  assert.equal((await f.ask(id, 'Et sur l’archive ?')).status, 'done');

  // Revalidation while nothing moves but the clock: a second that passes is still answered without a body.
  const blocked = await f.polled();
  f.clock += 1000; f.wall += 1000; f.runtime.tick(); await turns(20);
  assert.deepEqual(Object.values(await f.polled(blocked)).map(reply => [reply.status, reply.bytes]), Array(3).fill([304, 0]));

  // Room is back: the state says so within a few seconds, but capture waits for an explicit resume.
  free = 50 * GIB; f.wall += 6000; f.runtime.tick(); await turns(20); f.runtime.tick();
  // The disk state changed and nothing else did: every tag held is refused, and the body says why.
  const freed = await f.polled(blocked);
  for (const [route, reply] of Object.entries(freed))
    assert.deepEqual([reply.status, reply.etag !== blocked[route].etag, blocked[route].value.storage.state, reply.value?.storage.state], [200, true, 'blocked', 'ok'], route);
  f.clock += 1000; f.wall += 1000; f.runtime.tick(); await turns(20);
  assert.deepEqual(Object.values(await f.polled(freed)).map(reply => [reply.status, reply.bytes]), Array(3).fill([304, 0]), 'and the new tags hold in turn');
  state = (await f.req('/v1/state')).value;
  assert.deepEqual([state.storage.state, state.session.accepting, state.session.readOnly], ['ok', false, true]);
  const resumed = await f.req(`/v1/sessions/${id}/resume`, {});
  assert.deepEqual([resumed.status, resumed.value.accepting], [200, true]);
  f.clock += 8000;
  assert.deepEqual((await f.block(id, 4, state.session.elapsedMs + 8000)).value, { id: 'moment-2', duplicate: false });
  assert.deepEqual((await fs.readdir(path.join(dir, 'media'))).sort(), ['moment-1.json', 'moment-1.webm', 'moment-2.json', 'moment-2.webm']);
  state = (await f.req('/v1/state')).value;
  assert.deepEqual([state.storage.state, state.session.accepting, state.session.lastError, state.session.segments.length], ['ok', true, null, 2]);
});

test('an archive keeps its media with a legacy retention option after reopening, resuming and advancing an hour', async t => {
  const f = await fixture(t, { runtimeOptions: f => (f.window ? { retentionMs: f.window } : {}) });
  const A = (await f.req('/v1/session/start', {})).value.id, mediaA = path.join(f.sessionsRoot, A, 'media');
  assert.deepEqual([(await f.block(A, 1, 8000)).value.id, (await f.block(A, 2, 16000)).value.id], ['moment-1', 'moment-2']);
  assert.deepEqual((await f.req('/v1/session/end', {})).value, { ended: true, id: A, archived: true });
  const start = await tree(mediaA);
  assert.deepEqual(start.map(row => row[0]), ['moment-1.json', 'moment-1.webm', 'moment-2.json', 'moment-2.webm']);

  // The same data under a host set back to a five-minute window (TVLENS_MEDIA_RETENTION_MS).
  await f.hosts[0].stop(); f.window = 300000; await f.boot();
  const opened = (await f.req(`/v1/sessions/${A}/open`, {})).value;
  assert.deepEqual([opened.readOnly, opened.retention, opened.retentionMs], [true, 'until-deleted', null], 'the archive states its own contract, not the setting of the host');
  const resumed = (await f.req(`/v1/sessions/${A}/resume`, {})).value;
  assert.deepEqual([resumed.accepting, resumed.retention, resumed.retentionMs], [true, 'until-deleted', null]);
  assert.equal((await f.block(A, 1, 24000)).value.id, 'moment-3');
  // Une heure plus tard : rafraîchissement publié puis nouveau bloc, sans suppression des anciens médias.
  f.clock += 3600000;
  f.runtime.session.watch.emit();
  assert.equal((await f.block(A, 2, 3632000)).value.id, 'moment-4');
  const state = (await f.req('/v1/state')).value.session;
  assert.deepEqual([state.retention, state.retentionMs, state.history.length, state.segments.map(s => [s.id, s.available])],
    ['until-deleted', null, 0, [['moment-1', true], ['moment-2', true], ['moment-3', true], ['moment-4', true]]]);
  assert.deepEqual((await tree(mediaA)).filter(row => /moment-[12]\./.test(row[0])), start, 'the media of the start are the same files, untouched');
  const replay = await f.raw(`/v1/media/${A}/moment-1`, { headers: { Range: 'bytes=0-6' } });
  assert.equal(replay.status, 206); assert.equal(await replay.text(), 'fixture');
  const loaded = f.runtime.session;
  const inspected = await new VideoTools({ consultation: consultationOf(loaded.memory.view()), search: loaded.search, inspector: loaded.inspector, media: loaded.memoryMedia }).call('inspect_clip', { startMs: 0, endMs: 8000, question: 'Que voit-on au début ?' });
  assert.equal(inspected.observations[0].id, 'moment-1', 'the lease found the real files of the first passage');
  assert.equal((await f.req('/v1/session/end', {})).value.archived, true);

  // Le paramètre retiré ne change pas non plus la politique des nouvelles sessions.
  const B = (await f.req('/v1/session/start', {})).value;
  assert.deepEqual([B.retention, B.retentionMs], ['until-deleted', null]);
  assert.equal((await f.block(B.id, 1, 8000)).value.id, 'moment-1');
  f.clock += 600000;
  f.runtime.session.watch.emit();
  assert.equal((await f.raw(`/v1/media/${B.id}/moment-1`)).status, 200);
  await f.runtime.pause();
  f.clock += 3600000;
  f.runtime.session.watch.emit();
  assert.equal((await f.raw(`/v1/media/${B.id}/moment-1`)).status, 200);
  assert.deepEqual((await tree(mediaA)).filter(row => /moment-[12]\./.test(row[0])), start);
});

test('ending a session archives it and closes its runtime even when adapters fail to close: every closing is attempted, the failures are kept, and a new session starts', async t => {
  const closed = [], journal = [];
  const f = await fixture(t, { runtimeOptions: () => ({ log: line => journal.push(line) }) });
  const A = (await f.req('/v1/session/start', {})).value.id, session = f.runtime.session;
  await f.block(A, 1, 8000); await f.ask(A, 'Une question ?');
  assert.equal((await f.req('/v1/surveillance/start', { sessionId: A, instruction: 'Vérifie les chiffres.' })).value.surveillance.enabled, true);
  // Three adapters fail to close, each in its own way (rejection, synchronous throw); the others are watched.
  f.runtime.agent.close = async () => { closed.push('agent de chat'); throw new Error('EBUSY: resource busy (simulé)'); };
  session.search.index.close = () => { closed.push('index'); throw new Error('index bloqué (simulé)'); };
  session.perception.close = async () => { closed.push('perception'); throw new Error('perception bloquée (simulé)'); };
  for (const [name, target] of [['miniatures', session.thumbnails], ['modèle d’inspection', session.inspectorModel]]) {
    const close = target.close?.bind(target);
    target.close = async () => { closed.push(name); return close?.(); };
  }
  const ended = await f.req('/v1/session/end', {});
  const errors = ['agent de chat : EBUSY: resource busy (simulé)', 'index : index bloqué (simulé)', 'perception : perception bloquée (simulé)'];
  assert.deepEqual(ended, { status: 200, value: { ended: true, id: A, archived: true, errors } });
  assert.deepEqual(closed, ['agent de chat', 'index', 'miniatures', 'perception', 'modèle d’inspection'], 'no closing was skipped because another one failed');
  assert.deepEqual([session.watch.closed, session.closeErrors, f.runtime.lastEnd], [true, errors.slice(1), { id: A, archived: true, errors }]);
  assert.deepEqual(journal, [CACHE_CREATION_LOG, `TVLens — fermeture incomplète de la session ${A} : ${errors.join(' ; ')}`],
    'kept in the journal, not swallowed');
  // Archived whole: listed as an archive, never as a session cut short, with its registry in its final state.
  assert.deepEqual([(await f.saved(A, 'manifest.json')).state, (await f.saved(A, 'session.json')).segments.map(s => s.id), (await f.saved(A, 'surveillance.json')).enabled], ['archived', ['moment-1'], false]);
  const state = (await f.req('/v1/state')).value;
  assert.deepEqual([state.session, state.chat.jobs, state.surveillance.activity.state], [null, [], 'idle']);
  assert.deepEqual((await f.req('/v1/sessions')).value.sessions.map(s => [s.id, s.state, s.passages, s.media.stored]), [[A, 'archived', 1, 1]]);

  // A new session starts and captures; the archive reopens with its passage and its question.
  const B = (await f.req('/v1/session/start', {})).value.id;
  assert.notEqual(B, A);
  assert.deepEqual((await f.block(B, 1, 8000)).value, { id: 'moment-1', duplicate: false });
  const again = (await f.req('/v1/session/end', {})).value;
  assert.deepEqual([again.archived, again.errors], [true, errors.slice(0, 1)], 'the chat agent still fails to close, and the session is archived all the same');
  assert.equal((await f.req(`/v1/sessions/${A}/open`, {})).status, 200);
  const reopened = (await f.req('/v1/state')).value;
  assert.deepEqual([reopened.session.segments.map(s => [s.id, s.available]), reopened.chat.jobs.map(j => j.question)], [[['moment-1', true]], ['Une question ?']]);
});

test('an end the disk refuses is never announced as archived: with the state, the questions or the manifest missing, the answer names the file, the runtime is closed all the same, the folder keeps what was last confirmed and is listed as cut short, and it archives once the disk is back', async t => {
  const journal = [], ids = [];
  const f = await fixture(t, { runtimeOptions: () => ({ log: line => journal.push(line) }) });
  for (const file of ['session.json', 'deep-answers.json', 'manifest.json']) {
    journal.length = 0;
    const id = (await f.req('/v1/session/start', {})).value.id, session = f.runtime.session, dir = path.join(f.sessionsRoot, id), closed = [];
    await f.block(id, 1, 8000); await f.ask(id, 'Première question ?');
    for (const [name, target] of [['index', session.search.index], ['miniatures', session.thumbnails], ['perception', session.perception], ['modèle d’inspection', session.inspectorModel]]) {
      const close = target.close?.bind(target);
      target.close = async () => { closed.push(name); return close?.(); };
    }
    const kept = await fs.readFile(path.join(dir, file), 'utf8');
    const restore = refusing(t, file);
    // One more question, answered while the disk refuses: its last state is one of the writes an end waits for.
    const { value: asked } = await f.req('/v1/questions', { sessionId: id, question: 'Seconde question ?', anchorMs: 0 });
    await f.runtime.deep.jobs.find(job => job.id === asked.id).done; await turns(5); await session.store.serial.catch(() => {});

    const refusal = `archive : Écriture refusée par le disque (${file}) : EIO`;
    assert.deepEqual(await f.req('/v1/session/end', {}), { status: 200, value: { ended: true, id, archived: false, errors: [refusal] } });
    assert.deepEqual([f.runtime.lastEnd, journal], [
      { id, archived: false, errors: [refusal] },
      [CACHE_CREATION_LOG, `TVLens — fermeture incomplète de la session ${id} : ${refusal}`],
    ], 'kept as the outcome of the end and in the journal');
    assert.deepEqual([session.watch.closed, closed], [true, ['index', 'miniatures', 'perception', 'modèle d’inspection']], 'the resources are released whatever the disk did');
    assert.deepEqual([(await f.saved(id, 'manifest.json')).state, await fs.readFile(path.join(dir, file), 'utf8') === kept], ['live', true], 'nothing on disk says archived, and the refused file is the last one confirmed');
    restore();
    const after = (await f.req('/v1/state')).value;
    assert.deepEqual([after.session, after.chat.jobs], [null, []], 'the host has let go of the session');
    assert.deepEqual((await f.req('/v1/sessions')).value.sessions.filter(s => s.id === id).map(s => [s.state, s.passages, s.media.stored]), [['interrupted', 1, 1]]);

    // Reopened on what the disk confirmed, read-only; then the explicit resume and a new end archive it for good.
    const opened = await f.req(`/v1/sessions/${id}/open`, {});
    assert.deepEqual([opened.status, opened.value.readOnly], [200, true]);
    const reopened = (await f.req('/v1/state')).value;
    assert.deepEqual([reopened.session.segments.map(s => [s.id, s.status, s.available]), reopened.chat.jobs.map(job => job.question)],
      [[['moment-1', 'ready', true]], file === 'deep-answers.json' ? ['Première question ?'] : ['Première question ?', 'Seconde question ?']]);
    assert.equal((await f.req(`/v1/sessions/${id}/resume`, {})).status, 200);
    assert.deepEqual((await f.req('/v1/session/end', {})).value, { ended: true, id, archived: true });
    assert.deepEqual([(await f.saved(id, 'manifest.json')).state, (await f.saved(id, 'session.json')).accepting], ['archived', false]);
    ids.push(id);
  }
  assert.deepEqual((await f.req('/v1/sessions')).value.sessions.map(s => s.state), ['archived', 'archived', 'archived']);

  // An archive that is only being read takes one kind of write: the questions asked on it. Refused, closing
  // it does not claim that they were kept, and the archive itself stays exactly what it was.
  const id = ids[0], dir = path.join(f.sessionsRoot, id);
  assert.equal((await f.req(`/v1/sessions/${id}/open`, {})).value.readOnly, true);
  const before = await tree(dir), restore = refusing(t, 'deep-answers.json');
  const { value: asked } = await f.req('/v1/questions', { sessionId: id, question: 'Question sur l’archive ?', anchorMs: 0 });
  await f.runtime.deep.jobs.find(job => job.id === asked.id).done; await turns(5);
  assert.deepEqual((await f.req('/v1/sessions/close', {})).value, { closed: true, id, archived: false, errors: ['archive : Écriture refusée par le disque (deep-answers.json) : EIO'] });
  restore();
  assert.deepEqual(await tree(dir), before);
  assert.deepEqual((await f.req('/v1/sessions')).value.sessions.find(s => s.id === id).state, 'archived', 'still the archive last confirmed');
});

test('an archive opened and resumed over HTTP is not announced as archived on the manifest of its earlier life: refused, the end names the file; once the disk is back, a new end archives it and the list carries the new passage', async t => {
  const journal = [];
  const f = await fixture(t, { runtimeOptions: () => ({ log: line => journal.push(line) }) });
  const id = (await f.req('/v1/session/start', {})).value.id, dir = path.join(f.sessionsRoot, id);
  const rows = async () => (await f.req('/v1/sessions')).value.sessions.map(s => [s.id, s.state, s.passages, s.media.stored]);
  await f.block(id, 1, 8000);
  assert.deepEqual((await f.req('/v1/session/end', {})).value, { ended: true, id, archived: true });
  const earlier = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8');
  assert.deepEqual(await rows(), [[id, 'archived', 1, 1]]);

  // Opened, resumed and captured again while the disk refuses the manifest, and no other file.
  assert.equal((await f.req(`/v1/sessions/${id}/open`, {})).value.readOnly, true);
  const restore = refusing(t, 'manifest.json');
  assert.equal((await f.req(`/v1/sessions/${id}/resume`, {})).status, 200);
  f.clock += 8000; f.wall += 8000;
  assert.deepEqual((await f.req('/v1/segments', { sessionId: id, sequence: 1, startMs: 8000, endMs: 16000, frames: [{ atMs: 8000, data: 'YQ==' }] })).value, { id: 'moment-2', duplicate: false });
  do { await tick(); } while (f.runtime.session.watch.running);
  await f.runtime.session.store.serial.catch(() => {}); await turns(5);
  journal.length = 0;
  const refusal = 'archive : Écriture refusée par le disque (manifest.json) : EIO';
  assert.deepEqual(await f.req('/v1/session/end', {}), { status: 200, value: { ended: true, id, archived: false, errors: [refusal] } });
  assert.deepEqual([f.runtime.lastEnd, journal], [{ id, archived: false, errors: [refusal] }, [`TVLens — fermeture incomplète de la session ${id} : ${refusal}`]]);
  assert.deepEqual([await fs.readFile(path.join(dir, 'manifest.json'), 'utf8') === earlier, (await f.saved(id, 'session.json')).segments.map(s => s.id)], [true, ['moment-1', 'moment-2']],
    'the manifest on disk is still the one of the earlier life, beside a state that knows more');
  restore();

  // The disk takes writes again: reopened on its confirmed state, resumed explicitly and ended, it is archived with its new totals.
  assert.equal((await f.req(`/v1/sessions/${id}/open`, {})).value.readOnly, true);
  assert.deepEqual((await f.req('/v1/state')).value.session.segments.map(s => [s.id, s.status, s.available]), [['moment-1', 'ready', true], ['moment-2', 'ready', true]]);
  assert.equal((await f.req(`/v1/sessions/${id}/resume`, {})).status, 200);
  assert.deepEqual((await f.req('/v1/session/end', {})).value, { ended: true, id, archived: true });
  assert.deepEqual([(await f.saved(id, 'manifest.json')).state, await rows()], ['archived', [[id, 'archived', 2, 2]]]);
});

test('a session whose manifest the disk never took is not listed as an archive of before manifests: its end names the manifest, the list shows it live then cut short with no closing date, and it reopens read-only without a write', async t => {
  const journal = [];
  const f = await fixture(t, { runtimeOptions: () => ({ log: line => journal.push(line) }) });
  const row = s => [s.id, s.state, s.legacy, s.closedAt, s.current, s.passages, s.media.stored];
  const rows = async () => (await f.req('/v1/sessions')).value.sessions.map(row);
  // Refused from the very first passage to the end: the folder never holds a manifest.
  const restore = refusing(t, 'manifest.json');
  const id = (await f.req('/v1/session/start', {})).value.id, dir = path.join(f.sessionsRoot, id);
  f.clock += 8000; f.wall += 8000;
  assert.deepEqual((await f.req('/v1/segments', { sessionId: id, sequence: 1, startMs: 0, endMs: 8000, frames: [{ atMs: 0, data: 'YQ==' }] })).value, { id: 'moment-1', duplicate: false });
  do { await tick(); } while (f.runtime.session.watch.running);
  await f.runtime.session.store.serial.catch(() => {}); await turns(5);
  assert.deepEqual(await rows(), [[id, 'live', false, null, true, 1, 1]], 'the session in memory, saved state on disk and no manifest');
  const refusal = 'archive : Écriture refusée par le disque (manifest.json) : EIO';
  assert.deepEqual(await f.req('/v1/session/end', {}), { status: 200, value: { ended: true, id, archived: false, errors: [refusal] } });
  assert.deepEqual(journal, [CACHE_CREATION_LOG, `TVLens — fermeture incomplète de la session ${id} : ${refusal}`]);
  restore();
  assert.deepEqual([await exists(path.join(dir, 'manifest.json')), await exists(path.join(dir, 'session.json'))], [false, true]);
  assert.deepEqual(await rows(), [[id, 'interrupted', false, null, false, 1, 1]], 'what the answer said is what the list shows');

  // Opened as any session cut short: read-only, replayable, not a byte written.
  const before = await tree(dir);
  const opened = await f.req(`/v1/sessions/${id}/open`, {});
  assert.deepEqual([opened.status, opened.value.readOnly, opened.value.accepting], [200, true, false]);
  assert.deepEqual((await f.req('/v1/state')).value.session.segments.map(s => [s.id, s.status, s.available]), [['moment-1', 'ready', true]]);
  const replay = await f.raw(`/v1/media/${id}/moment-1`, { headers: { Range: 'bytes=0-6' } });
  assert.equal(replay.status, 206); assert.equal(await replay.text(), 'fixture');
  assert.deepEqual(await tree(dir), before);
  // The explicit resume and a confirmed end give it the manifest it never had.
  assert.equal((await f.req(`/v1/sessions/${id}/resume`, {})).status, 200);
  assert.deepEqual((await f.req('/v1/session/end', {})).value, { ended: true, id, archived: true });
  const [after] = (await f.req('/v1/sessions')).value.sessions;
  assert.deepEqual([after.state, after.legacy, typeof after.closedAt, after.passages, (await f.saved(id, 'manifest.json')).state], ['archived', false, 'number', 1, 'archived']);
});

test('stopping the host while the disk refuses the state leaves no archive that lies: the journal says which file, the next start lists the session as cut short, and it reopens on its last confirmed state with the passage only its media know', async t => {
  const journal = [];
  const f = await fixture(t, { runtimeOptions: () => ({ log: line => journal.push(line) }) });
  const id = (await f.req('/v1/session/start', {})).value.id, dir = path.join(f.sessionsRoot, id);
  await f.block(id, 1, 8000);
  const confirmed = await fs.readFile(path.join(dir, 'session.json'), 'utf8');
  const restore = refusing(t, 'session.json');
  // A second passage is stored and analysed, but the state that describes it never reaches the disk.
  f.clock += 8000; f.wall += 8000;
  assert.deepEqual((await f.req('/v1/segments', { sessionId: id, sequence: 2, startMs: 8000, endMs: 16000, frames: [{ atMs: 8000, data: 'YQ==' }] })).value, { id: 'moment-2', duplicate: false });
  do { await tick(); } while (f.runtime.session.watch.running);
  await f.runtime.session.store.serial.catch(() => {}); await turns(5);
  const live = (await f.req('/v1/state')).value.session;
  assert.deepEqual([live.segments.map(s => [s.id, s.status]), live.lastError], [[['moment-1', 'ready'], ['moment-2', 'ready']], 'Impossible de sauvegarder le résumé de session.'], 'said by the session while it lives');

  // What a service stop runs (SIGTERM).
  const stopped = f.hosts[0];
  await stopped.stop();
  const refusal = 'archive : Écriture refusée par le disque (session.json) : EIO';
  assert.deepEqual([stopped.runtime.lastEnd, journal], [
    { id, archived: false, errors: [refusal] },
    [CACHE_CREATION_LOG, `TVLens — fermeture incomplète de la session ${id} : ${refusal}`],
  ]);
  restore();
  assert.deepEqual([(await f.saved(id, 'manifest.json')).state, await fs.readFile(path.join(dir, 'session.json'), 'utf8') === confirmed], ['live', true]);

  // A new process on the same data.
  f.clock = 20000000; f.wall += 3600000;
  await f.boot();
  assert.deepEqual((await f.req('/v1/sessions')).value.sessions.map(s => [s.id, s.state, s.current, s.passages, s.media.stored]), [[id, 'interrupted', false, 2, 2]]);
  const opened = await f.req(`/v1/sessions/${id}/open`, {});
  assert.deepEqual([opened.status, opened.value.readOnly, opened.value.accepting], [200, true, false]);
  assert.deepEqual((await f.req('/v1/state')).value.session.segments.map(s => [s.id, s.status, s.available, s.error]),
    [['moment-1', 'ready', true, undefined], ['moment-2', 'error', true, 'Analyse interrompue à la fermeture de la session.']], 'the confirmed passage as it was saved, the other one replayable and honestly unanalysed');
  const replay = await f.raw(`/v1/media/${id}/moment-2`, { headers: { Range: 'bytes=0-6' } });
  assert.equal(replay.status, 206); assert.equal(await replay.text(), 'fixture');
});

test('a start renews the block numbering even when the session was still capturing (the TV restarted its capture without a pause), and a block already accepted is never ingested twice', async t => {
  const f = await fixture(t);
  const id = (await f.req('/v1/session/start', {})).value.id, media = path.join(f.sessionsRoot, id, 'media');
  // A capture numbers its blocks from its own monotonic clock.
  assert.deepEqual((await f.block(id, 9000001, 8000)).value, { id: 'moment-1', duplicate: false });
  assert.deepEqual((await f.block(id, 9000002, 16000)).value, { id: 'moment-2', duplicate: false });
  // Within one capture a lower number is still refused before anything is prepared.
  const assembled = f.calls.assemble;
  assert.deepEqual([await f.block(id, 5, 24000), f.calls.assemble],
    [{ status: 409, value: { error: 'Séquence ancienne.', code: 'stale-sequence' } }, assembled]);

  // The TV restarted: no pause was sent, the session still captures, and the new capture starts lower.
  const again = await f.req('/v1/session/start', {});
  assert.deepEqual([again.status, again.value.id, again.value.accepting], [200, id, true]);
  assert.deepEqual((await f.block(id, 5, 24000)).value, { id: 'moment-3', duplicate: false });
  assert.deepEqual((await f.block(id, 5, 24000)).value, { id: 'moment-3', duplicate: true }, 'the new capture is deduplicated in turn');
  // A block of the former capture really replayed, byte for byte: its number says nothing any more,
  // but the session refuses it on observation order.
  const replayed = await f.block(id, 9000002, 16000);
  assert.deepEqual(replayed,
    { status: 400, value: { error: 'Les segments doivent suivre l’ordre d’observation.', code: 'invalid-capture-order' } });
  // Even after one more start has made the transport forget the block it has just accepted.
  await f.req('/v1/session/start', {});
  assert.equal((await f.block(id, 5, 24000)).status, 400);
  const state = (await f.req('/v1/state')).value.session;
  assert.deepEqual([state.segments.map(s => [s.id, s.startMs, s.endMs]), (await fs.readdir(media)).length], [[['moment-1', 0, 8000], ['moment-2', 8000, 16000], ['moment-3', 16000, 24000]], 6], 'three passages, three pairs of files: nothing was stored twice');
  assert.deepEqual((await f.block(id, 6, 32000)).value, { id: 'moment-4', duplicate: false }, 'and the capture goes on');
});

test('the server host reads its reversible settings strictly, and no longer sweeps media at start', async () => {
  const { settings } = require('../server/main.cjs');
  assert.deepEqual(settings({}), { questionTimeoutMs: undefined, surveillance: undefined, disk: { minFreeBytes: GIB, warnFreeBytes: 2 * GIB } });
  assert.deepEqual(settings({ TVLENS_QUESTION_TIMEOUT_MS: '60000', TVLENS_SURVEILLANCE_WORKERS: '2', TVLENS_MEDIA_RETENTION_MS: '300000', TVLENS_DISK_MIN_FREE_MB: '512', TVLENS_DISK_WARN_FREE_MB: '', TVLENS_PORT: '1' }),
    { questionTimeoutMs: 60000, surveillance: { workers: 2 }, disk: { minFreeBytes: 512 * 1024 ** 2, warnFreeBytes: 2 * GIB } });
  for (const [name, value] of [['TVLENS_DISK_MIN_FREE_MB', '-1'], ['TVLENS_DISK_WARN_FREE_MB', '2 Go']])
    assert.throws(() => settings({ [name]: value }), new RegExp('Réglage ' + name + ' invalide'));
  for (const value of ['abc', '0', '-1', '300000']) {
    assert.deepEqual(settings({ TVLENS_MEDIA_RETENTION_MS: value }), settings({}), 'retired setting is ignored');
  }
  // The two values handed over as converted are refused by the runtimes that own their bounds, at start.
  const host = env => { const s = settings(env); return new HeadlessRuntime({ userData: os.tmpdir(), sessionsRoot: path.join(os.tmpdir(), 'tvlens-absent-sessions'), smoke: true, selectedModels: {}, agent: { answer: async () => ({}) },
    config: { questionTimeoutMs: s.questionTimeoutMs, ...(s.surveillance ? { surveillance: s.surveillance } : {}) } }); };
  assert.throws(() => host({ TVLENS_QUESTION_TIMEOUT_MS: 'abc' }), /questionTimeoutMs invalide/);
  assert.throws(() => host({ TVLENS_QUESTION_TIMEOUT_MS: '300001' }), /questionTimeoutMs invalide/);
  assert.throws(() => host({ TVLENS_SURVEILLANCE_WORKERS: '4' }), /surveillance\.workers invalide/);
  const lowered = host({ TVLENS_QUESTION_TIMEOUT_MS: '60000', TVLENS_SURVEILLANCE_WORKERS: '3' });
  assert.deepEqual([lowered.deep.timeoutMs, lowered.surveillance.surveillance.limits.verifyConcurrency], [60000, 3]);
  await lowered.close();
  const source = await fs.readFile(path.join(__dirname, '..', 'server', 'main.cjs'), 'utf8');
  assert.doesNotMatch(source, /cleanupRawMedia|clearRaw|purge/, 'nothing is cleaned when the server starts or stops');
  assert.match(source, /sweepStaleContexts/);
});

test('a slow disk holds back neither what a client reads nor the analysis: with the state file held, a passage is published analysed, a pause and a resume are published under a new tag, and each request still answers only once the disk has', async t => {
  const held = disk(t, 'session.json'), f = await fixture(t), chat = '/v1/state?view=chat', panel = '/v1/state?view=panel';
  const id = (await f.req('/v1/session/start', {})).value.id, session = f.runtime.session;
  await f.block(id, 1, 8000);
  // The description of a passage can be held back, as a slow provider holds it.
  let describing = null;
  const observeVisual = session.perception.observeVisual.bind(session.perception), audioPublished = deferred();
  session.perception.observeVisual = async input => { await describing?.promise; return observeVisual(input); };
  f.runtime.listeners.add(state => {
    if (state.session?.segments[2]?.audioStatus === 'ready') audioPublished.resolve();
  });
  const segment = (sequence, endMs) => { f.clock += 8000; f.wall += 8000; return f.req('/v1/segments', { sessionId: id, sequence, startMs: endMs - 8000, endMs, frames: [{ atMs: endMs - 8000, data: 'YQ==' }] }); };
  // What a client that polls with the tag it holds ends up reading, once the host has published `expected`.
  const published = async (from, expected) => {
    for (let i = 0; i < 400; i++) { const next = await f.polled(from); if (next[chat].status === 200 && expected(next[chat].value)) return next; await tick(); }
    assert.fail('never published');
  };
  // One passage is being described and another waits behind it; nothing else arrives afterwards.
  describing = deferred();
  assert.deepEqual([(await segment(2, 16000)).value.id, (await segment(3, 24000)).value.id], ['moment-2', 'moment-3']);
  await audioPublished.promise;
  await session.store.serial;
  let polled = await f.polled();
  assert.deepEqual(polled[panel].value.session.segments.map(s => [s.id, s.status, s.audioStatus, s.visionStatus]), [
    ['moment-1', 'ready', 'ready', 'ready'],
    ['moment-2', 'analyzing', 'ready', 'analyzing'],
    ['moment-3', 'analyzing', 'ready', 'queued'],
  ]);
  // The disk stops answering, then the description comes back.
  held.hold();
  const from = held.seen.length;
  describing.resolve(); describing = null;
  await held.reached(from + 1);
  // The analysis ends on the host's own time, which a loaded machine stretches: a count of turns says nothing about
  // it. The panel is asked again, with the tag held before the resume, until it shows the three passages analysed.
  const seenPassages = reply => reply[panel].value?.session?.segments?.map(s => s.id + ':' + s.status);
  const analysed = reply => reply[panel].status === 200 && seenPassages(reply)?.join() === 'moment-1:ready,moment-2:ready,moment-3:ready';
  let latest = await f.polled(polled);
  for (const limit = Date.now() + 5000; !analysed(latest); latest = await f.polled(polled)) {
    // A 304 has no body: the panel has not moved from what the held tag showed.
    const unchanged = latest[panel].status === 304;
    const seen = unchanged ? `304, unchanged since the tag held, which showed ${seenPassages(polled)}` : `${latest[panel].status} with ${seenPassages(latest)}`;
    if (Date.now() > limit) assert.fail(`the panel answered ${seen}, three ready expected`);
    await tick();
  }
  polled = latest;
  assert.deepEqual([polled[panel].status, polled[panel].value?.session.segments.map(s => [s.id, s.status]), held.seen.length - from], [200, [['moment-1', 'ready'], ['moment-2', 'ready'], ['moment-3', 'ready']], 1],
    'both passages are published analysed while the save of the first is still on its way to the disk');

  // A pause: published at once, answered once the disk has taken it.
  const answered = [];
  const pausing = f.req('/v1/session/pause', {}).then(reply => { answered.push('pause'); return reply; });
  polled = await published(polled, state => state.session.accepting === false);
  assert.deepEqual(answered, [], 'the request itself still waits for the disk');
  held.release();
  assert.deepEqual(await pausing, { status: 200, value: { paused: true } });
  await f.runtime.session.store.serial;
  assert.equal((await f.saved(id, 'session.json')).accepting, false);
  // A resume, the same way.
  held.hold();
  const resuming = f.req('/v1/session/start', {}).then(reply => { answered.push('resume'); return reply; });
  polled = await published(polled, state => state.session.accepting === true);
  assert.deepEqual(answered, ['pause']);
  held.release();
  assert.deepEqual([(await resuming).status, answered, (await f.saved(id, 'session.json')).accepting], [200, ['pause', 'resume'], true]);
  assert.deepEqual((await f.req('/v1/session/end', {})).value, { ended: true, id, archived: true });
});

test('the draft of an answer is published each time it moves and saved at most once a second, its last state included when the answer stalls: a poll gets the latest draft under a new tag while the disk is held, a refused save reaches the end of the session, and nothing waits past an end or a change of session', async t => {
  const clock = manualClock();
  const turn = drivenChat(), journal = [], held = disk(t, 'deep-answers.json');
  const f = await fixture(t, {
    chat: turn.answer,
    runtimeOptions: () => ({
      setTimer: clock.io.setTimer,
      clearTimer: clock.io.clearTimer,
      log: line => journal.push(line),
    }),
  }), chat = '/v1/state?view=chat';
  const draft = words => 'mot '.repeat(words).trim(), moving = words => turn.progress({ message: 'Rédaction de la réponse…', preview: draft(words) });
  const ask = async (sessionId, question) => { const { value } = await f.req('/v1/questions', { sessionId, question, anchorMs: 0 }); await turns(5); await f.runtime.session.store.serial; return value.id; };
  const A = (await f.req('/v1/session/start', {})).value.id, sessionA = f.runtime.session, dirA = path.join(f.sessionsRoot, A);
  await f.block(A, 1, 8000);
  // Only the checkpoint runs on these virtual seconds; HTTP and question deadlines keep their own timers.
  const second = async () => {
    await clock.advance(1000);
    await turns(5);
  };
  const onDisk = async id => (await f.saved(id, 'deep-answers.json')).jobs.at(-1);
  await ask(A, 'Que se passe-t-il ?');
  assert.deepEqual([(await onDisk(A)).status, (await onDisk(A)).preview], ['running', ''], 'a question that starts is saved at once');

  // The disk is held with one draft on its way to it. A hundred more drafts follow over five seconds.
  held.hold();
  let writes = held.seen.length, polled = await f.polled();
  moving(1); await second(); await held.reached(writes + 1);
  for (let words = 2; words <= 101; words++) {
    moving(words);
    await clock.advance(50);
    await tick();
  }
  polled = await f.polled(polled);
  assert.deepEqual([polled[chat].status, polled[chat].value.chat.jobs.at(-1).preview, held.seen.length - writes, (await onDisk(A)).preview], [200, draft(101), 1, ''],
    'the latest draft is published under a new tag while one write, and only one, is held by the disk');
  held.release();
  await sessionA.store.serial; await second(); await sessionA.store.serial;
  assert.deepEqual([held.seen.length - writes <= 3, (await onDisk(A)).preview], [true, draft(101)], 'a hundred drafts behind a held disk: the write in flight, then the latest state');

  // The answer stalls: its last draft is not left unsaved. Nothing before the second is over, the draft then.
  writes = held.seen.length;
  moving(200); await turns(5); await sessionA.store.serial;
  await clock.advance(999);
  await turns(5);
  assert.deepEqual([held.seen.length - writes, (await onDisk(A)).preview], [0, draft(101)]);
  await clock.advance(1);
  await turns(5);
  await sessionA.store.serial;
  assert.deepEqual([held.seen.length - writes, (await onDisk(A)).preview], [1, draft(200)], 'one second after it stopped moving, the draft is on disk');

  // The disk refuses the next draft, then the final state: the barrier of the session knows, and its end says so.
  held.refuse = true;
  moving(201); await second(); await sessionA.store.serial.catch(() => {});
  await assert.rejects(sessionA.store.flush(), /deep-answers\.json/);
  const refusal = 'archive : Écriture refusée par le disque (deep-answers.json) : EIO';
  assert.deepEqual((await f.req('/v1/session/end', {})).value, { ended: true, id: A, archived: false, errors: [refusal] });
  assert.deepEqual([journal, (await onDisk(A)).preview, (await onDisk(A)).status], [
    [CACHE_CREATION_LOG, `TVLens — fermeture incomplète de la session ${A} : ${refusal}`], draft(200), 'running',
  ], 'the folder keeps the last draft the disk confirmed');
  held.refuse = false;

  // B ends with a draft still waiting for its second: its final state is saved at once and nothing is written later.
  const B = (await f.req('/v1/session/start', {})).value.id, dirB = path.join(f.sessionsRoot, B);
  await f.block(B, 1, 8000);
  await ask(B, 'Et maintenant ?'); moving(1);
  assert.deepEqual((await f.req('/v1/session/end', {})).value, { ended: true, id: B, archived: true });
  assert.deepEqual([(await onDisk(B)).status, (await onDisk(B)).message], ['cancelled', 'Session terminée.']);
  const [closedA, closedB] = [await tree(dirA), await tree(dirB)];
  writes = held.seen.length;
  // C captures, stops, and is asked a question whose draft waits for its second when B is opened in its place.
  const C = (await f.req('/v1/session/start', {})).value.id, dirC = path.join(f.sessionsRoot, C);
  await f.block(C, 1, 8000);
  for (let i = 0; i < 3; i++) await second();
  assert.deepEqual([await tree(dirA), await tree(dirB), await exists(path.join(dirC, 'deep-answers.json')), held.seen.length - writes], [closedA, closedB, false, 0], 'no late save of an ended session, in its own folder or in the next one');
  assert.equal((await f.req('/v1/session/pause', {})).status, 200);
  await ask(C, 'Une dernière ?'); moving(1);
  assert.equal((await f.req(`/v1/sessions/${B}/open`, {})).value.readOnly, true);
  assert.deepEqual([(await f.saved(C, 'deep-answers.json')).jobs.map(job => [job.question, job.status, job.message]), (await f.saved(C, 'manifest.json')).state], [[['Une dernière ?', 'cancelled', 'Session fermée.']], 'archived']);
  const closedC = await tree(dirC);
  for (let i = 0; i < 3; i++) await second();
  assert.deepEqual([await tree(dirB), await tree(dirC), (await f.req('/v1/state')).value.chat.jobs.map(job => job.question)], [closedB, closedC, ['Et maintenant ?']], 'the archive opened in its place is not written into, and shows its own questions only');
});

test('closing the server runtime with a pending draft cancels its checkpoint timer and leaves no late session write', async t => {
  const clock = manualClock(), turn = drivenChat();
  const f = await fixture(t, {
    chat: turn.answer,
    runtimeOptions: () => ({ setTimer: clock.io.setTimer, clearTimer: clock.io.clearTimer }),
  });
  const id = (await f.req('/v1/session/start', {})).value.id;
  const dir = path.join(f.sessionsRoot, id), session = f.runtime.session;
  await f.block(id, 1, 8000);
  const asked = await f.req('/v1/questions', { sessionId: id, question: 'Et maintenant ?', anchorMs: 0 });
  assert.equal(asked.status, 200);
  await until(() => turn.progress, 'the question reached the agent');
  await session.store.serial;
  turn.progress({ message: 'Rédaction de la réponse…', preview: 'brouillon en attente' });
  assert.equal(clock.armed, 1, 'the draft waits on the injected checkpoint timer');
  assert.equal((await f.saved(id, 'deep-answers.json')).jobs.at(-1).preview, '');
  assert.equal((await f.req('/v1/state?view=chat')).value.chat.jobs.at(-1).preview, 'brouillon en attente');

  await f.runtime.close();
  assert.equal(clock.armed, 0, 'closing cancels the injected timer');
  const last = (await f.saved(id, 'deep-answers.json')).jobs.at(-1);
  assert.deepEqual([last.status, last.message, last.preview], ['cancelled', 'Session terminée.', 'brouillon en attente']);
  assert.equal((await f.saved(id, 'manifest.json')).state, 'archived');
  const closed = await tree(dir);
  await clock.advance(3000);
  assert.deepEqual(await tree(dir), closed, 'no session file is added, removed or rewritten after closing');
});

test('synthetic probe of the ticket at the host, on a disk that keeps up: thirty answers of 2 000 characters and a draft that moves a hundred times, every 80 ms', async t => {
  const clock = manualClock();
  const turn = drivenChat(), answered = { answer: 'r'.repeat(2000), kind: 'explanation', citations: [], limits: [] };
  const f = await fixture(t, {
    chat: input => (/^Question \d+ \?$/.test(input.question) ? Promise.resolve(answered) : turn.answer(input)),
    runtimeOptions: () => ({ setTimer: clock.io.setTimer, clearTimer: clock.io.clearTimer }),
  });
  const id = (await f.req('/v1/session/start', {})).value.id, session = f.runtime.session;
  await f.block(id, 1, 8000);
  for (let i = 1; i <= 30; i++) await f.ask(id, `Question ${i} ?`);
  const held = disk(t, 'deep-answers.json');
  await f.req('/v1/questions', { sessionId: id, question: 'Et maintenant ?', anchorMs: 0 });
  await turns(5); await session.store.serial;
  const from = held.seen.length;
  // Eight virtual seconds of an answer being written, the disk taking each save before the next draft.
  for (let step = 1; step <= 100; step++) {
    turn.progress({ message: 'Rédaction de la réponse…', preview: 'mot '.repeat(step) });
    await clock.advance(80);
    await tick();
    await session.store.serial;
  }
  const writes = held.seen.slice(from), figures = { ecritures: writes.length, octets: writes.reduce((sum, write) => sum + write.bytes, 0) };
  t.diagnostic(`sonde F03, synthétique, hôte serveur, disque libre (100 progressions espacées de 80 ms, 30 réponses de 2000 caractères) : ${JSON.stringify(figures)}`);
  assert.ok(figures.ecritures <= 8, `${figures.ecritures} writes for eight seconds of drafts`);
  assert.equal((await f.saved(id, 'deep-answers.json')).jobs.length, 31);
  // The final answer is saved at once, whole.
  turn.finish({ answer: 'Réponse finale.', kind: 'explanation', citations: [], limits: [] });
  await f.runtime.deep.jobs.at(-1).done; await turns(5); await session.store.serial;
  const last = (await f.saved(id, 'deep-answers.json')).jobs.at(-1);
  assert.deepEqual([last.status, last.result.answer, typeof last.metrics.totalMs], ['done', 'Réponse finale.', 'number']);
});
