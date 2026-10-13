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
const { VideoTools } = require('../core/video-tools.cjs');

const token = 's'.repeat(64), GIB = 1024 ** 3;
const READ_ONLY = 'Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.';
const tick = () => new Promise(resolve => setImmediate(resolve));
const turns = async (count = 20) => { for (let i = 0; i < count; i++) await tick(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
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
  const embeddings = { embed: async () => { f.calls.embed++; return [1, 0]; }, embedMany: async texts => { f.calls.embed += texts.length; return texts.map(() => [1, 0]); } };
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
  await turns();
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
  await asked.promise; await turns();
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
      assert.deepEqual(await f.req(`/v1/sessions/${bad}/${action}`, {}), { status: 400, value: { error: 'Identifiant de session invalide.' } }, bad + ' ' + action);
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
  late.resolve(); await turns();
  f.wall += 5000; f.runtime.tick();
  await loaded.store.save(loaded.watch.snapshot());
  await loaded.store.saveResearch({ jobs: [] }); await loaded.store.saveSurveillance({}); await loaded.store.saveManifest({ state: 'live' });
  await assert.rejects(loaded.thumbnails.put('moment-9', 'data:image/jpeg;base64,YQ=='), /terminée/);
  await loaded.search.index.cache.putMany([{ id: 'moment-9', text: 'Vecteur tardif', vector: [0, 1] }]);
  loaded.watch.emit(); await loaded.pause().catch(() => {});
  await turns();
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
  f.clock += 1000; f.wall += 1000; f.runtime.tick(); await turns();
  assert.deepEqual(Object.values(await f.polled(blocked)).map(reply => [reply.status, reply.bytes]), Array(3).fill([304, 0]));

  // Room is back: the state says so within a few seconds, but capture waits for an explicit resume.
  free = 50 * GIB; f.wall += 6000; f.runtime.tick(); await turns(); f.runtime.tick();
  // The disk state changed and nothing else did: every tag held is refused, and the body says why.
  const freed = await f.polled(blocked);
  for (const [route, reply] of Object.entries(freed))
    assert.deepEqual([reply.status, reply.etag !== blocked[route].etag, blocked[route].value.storage.state, reply.value?.storage.state], [200, true, 'blocked', 'ok'], route);
  f.clock += 1000; f.wall += 1000; f.runtime.tick(); await turns();
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

test('an archive kept until deletion keeps that contract on a host set to a rolling window: reopened, resumed and swept an hour later, its start is still there and can be re-examined', async t => {
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
  // An hour later on the session clock, far past the window: the periodic sweep, then the one of a new block.
  f.clock += 3600000;
  await f.runtime.session.watch.prune();
  assert.equal((await f.block(A, 2, 3632000)).value.id, 'moment-4');
  const state = (await f.req('/v1/state')).value.session;
  assert.deepEqual([state.retention, state.retentionMs, state.history.length, state.segments.map(s => [s.id, s.available])],
    ['until-deleted', null, 0, [['moment-1', true], ['moment-2', true], ['moment-3', true], ['moment-4', true]]]);
  assert.deepEqual((await tree(mediaA)).filter(row => /moment-[12]\./.test(row[0])), start, 'the media of the start are the same files, untouched');
  const replay = await f.raw(`/v1/media/${A}/moment-1`, { headers: { Range: 'bytes=0-6' } });
  assert.equal(replay.status, 206); assert.equal(await replay.text(), 'fixture');
  const loaded = f.runtime.session;
  const inspected = await new VideoTools({ snapshot: loaded.watch.snapshot(), search: loaded.search, inspector: loaded.inspector, media: loaded.store }).call('inspect_clip', { startMs: 0, endMs: 8000, question: 'Que voit-on au début ?' });
  assert.equal(inspected.observations[0].id, 'moment-1', 'the lease found the real files of the first passage');
  assert.equal((await f.req('/v1/session/end', {})).value.archived, true);

  // The window of this host is real: a session born under it promised nothing and does expire.
  const B = (await f.req('/v1/session/start', {})).value;
  assert.deepEqual([B.retention, B.retentionMs], ['rolling', 300000]);
  assert.equal((await f.block(B.id, 1, 8000)).value.id, 'moment-1');
  f.clock += 600000;
  await f.runtime.session.watch.prune();
  assert.deepEqual(await f.req(`/v1/media/${B.id}/moment-1`), { status: 410, value: { error: 'Média expiré.' } });
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
  assert.deepEqual(journal, [`TVLens — fermeture incomplète de la session ${A} : ${errors.join(' ; ')}`], 'kept in the journal, not swallowed');
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
    assert.deepEqual([f.runtime.lastEnd, journal], [{ id, archived: false, errors: [refusal] }, [`TVLens — fermeture incomplète de la session ${id} : ${refusal}`]], 'kept as the outcome of the end and in the journal');
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
  assert.deepEqual([stopped.runtime.lastEnd, journal], [{ id, archived: false, errors: [refusal] }, [`TVLens — fermeture incomplète de la session ${id} : ${refusal}`]]);
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
  assert.deepEqual([await f.block(id, 5, 24000), f.calls.assemble], [{ status: 409, value: { error: 'Séquence ancienne.' } }, assembled]);

  // The TV restarted: no pause was sent, the session still captures, and the new capture starts lower.
  const again = await f.req('/v1/session/start', {});
  assert.deepEqual([again.status, again.value.id, again.value.accepting], [200, id, true]);
  assert.deepEqual((await f.block(id, 5, 24000)).value, { id: 'moment-3', duplicate: false });
  assert.deepEqual((await f.block(id, 5, 24000)).value, { id: 'moment-3', duplicate: true }, 'the new capture is deduplicated in turn');
  // A block of the former capture really replayed, byte for byte: its number says nothing any more,
  // but the session refuses it on observation order.
  const replayed = await f.block(id, 9000002, 16000);
  assert.deepEqual(replayed, { status: 400, value: { error: 'Les segments doivent suivre l’ordre d’observation.' } });
  // Even after one more start has made the transport forget the block it has just accepted.
  await f.req('/v1/session/start', {});
  assert.equal((await f.block(id, 5, 24000)).status, 400);
  const state = (await f.req('/v1/state')).value.session;
  assert.deepEqual([state.segments.map(s => [s.id, s.startMs, s.endMs]), (await fs.readdir(media)).length], [[['moment-1', 0, 8000], ['moment-2', 8000, 16000], ['moment-3', 16000, 24000]], 6], 'three passages, three pairs of files: nothing was stored twice');
  assert.deepEqual((await f.block(id, 6, 32000)).value, { id: 'moment-4', duplicate: false }, 'and the capture goes on');
});

test('the server host reads its reversible settings strictly, and no longer sweeps media at start', async () => {
  const { settings } = require('../server/main.cjs');
  assert.deepEqual(settings({}), { questionTimeoutMs: undefined, surveillance: undefined, retentionMs: Infinity, disk: { minFreeBytes: GIB, warnFreeBytes: 2 * GIB } });
  assert.deepEqual(settings({ TVLENS_QUESTION_TIMEOUT_MS: '60000', TVLENS_SURVEILLANCE_WORKERS: '2', TVLENS_MEDIA_RETENTION_MS: '300000', TVLENS_DISK_MIN_FREE_MB: '512', TVLENS_DISK_WARN_FREE_MB: '', TVLENS_PORT: '1' }),
    { questionTimeoutMs: 60000, surveillance: { workers: 2 }, retentionMs: 300000, disk: { minFreeBytes: 512 * 1024 ** 2, warnFreeBytes: 2 * GIB } });
  for (const [name, value] of [['TVLENS_MEDIA_RETENTION_MS', 'abc'], ['TVLENS_MEDIA_RETENTION_MS', '0'], ['TVLENS_DISK_MIN_FREE_MB', '-1'], ['TVLENS_DISK_WARN_FREE_MB', '2 Go']])
    assert.throws(() => settings({ [name]: value }), new RegExp('Réglage ' + name + ' invalide'));
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
