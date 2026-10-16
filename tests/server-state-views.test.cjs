const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
const { RemoteServer } = require('../server/http.cjs');
const { DiskGuard } = require('../adapters/disk-guard.cjs');
const { emptyArchive } = require('./helpers/empty-archive.cjs');

const token = 'e'.repeat(64);
const { tick } = require('./helpers/wait.cjs');
// Text sizes of an ordinary 8 s spoken passage, as in scripts/bench-backend.cjs.
const filler = (seed, length) => {
  const words = ['le', 'débat', 'porte', 'sur', 'budget', 'santé', 'réforme', 'ministre', 'affirme', 'opposition', 'conteste', 'chiffres', 'audit', 'vote', 'jeudi', 'plateau', 'invité', 'répond', 'question', 'journaliste'];
  let text = '';
  for (let i = seed; text.length < length; i++) text += words[(i * 7 + seed) % words.length] + ' ';
  return text.slice(0, length).trim();
};

test('server session options deliver embedding load diagnostics even before a session is adopted without starting provider work', async t => {
  for (const cause of ['invalid-header', 'read-failed']) {
    await t.test(cause, async child => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-server-embedding-diagnostic-'));
      const sessionsRoot = path.join(root, 'sessions');
      const archive = await emptyArchive(sessionsRoot, 'server');
      const file = path.join(archive.dir, 'embeddings.json');
      await fs.writeFile(file, '{secret-header');
      const journal = [], adopted = [];
      let calls = 0;
      const runtime = new HeadlessRuntime({
        userData: root, sessionsRoot, config: { apiKey: 'secret-key' }, selectedModels: {}, smoke: true,
        agent: { answer: async () => ({}) },
        overrides: { embeddings: { embed: async () => {
          calls++;
          return [1, 0];
        } } },
      });
      child.mock.method(console, 'error', line => {
        journal.push(line);
        adopted.push(runtime.session?.id ?? null);
      });
      const server = await new RemoteServer({ runtime, token }).listen(0, '127.0.0.1');
      child.after(async () => {
        await server.close();
        await runtime.close();
        await fs.rm(root, { recursive: true, force: true });
      });
      if (cause === 'read-failed') {
        const readFile = fs.readFile;
        child.mock.method(fs, 'readFile', (target, ...args) => {
          if (target === file) throw Object.assign(Error('EIO secret-key /private/path [9123,4567]'), { code: 'EIO' });
          return readFile(target, ...args);
        });
      }
      const opened = await fetch(server.url + `/v1/sessions/${archive.id}/open`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}',
      });
      assert.equal(opened.status, 200);
      assert.equal((await opened.json()).readOnly, true);
      const index = runtime.session.search.index;
      assert.equal(await index.passageVector({ id: 'moment-1', observation: { summary: 'texte privé' } }), null);
      assert.equal(journal.length, 1, 'the journal is wired through sessionOptions and the shared composition');
      const diagnostic = JSON.parse(journal[0]);
      assert.equal(diagnostic.code, 'TVLENS_EMBEDDING_CACHE_LOAD');
      assert.equal(diagnostic.cause, cause);
      assert.equal(diagnostic.rebuild, 'total');
      assert.equal(diagnostic.providerCallsPossible, true);
      if (cause === 'read-failed') assert.deepEqual(adopted, [null], 'a synchronous read refusal is logged during construction');
      assert.equal(calls, 0, 'opening the archive and reporting its cache do not call the provider');
      await index.ensure([{ id: 'moment-1', observation: { summary: 'texte privé' } }]);
      await index.ensure([{ id: 'moment-1', observation: { summary: 'texte privé' } }]);
      assert.equal(calls, 1);
      assert.equal(journal.length, 1);
      assert.doesNotMatch(journal[0], /secret-key|private\/path|secret-header|texte privé|9123|4567/);
      const state = await fetch(server.url + '/v1/state', { headers: { Authorization: 'Bearer ' + token } });
      assert.equal(state.status, 200);
      assert.doesNotMatch(await state.text(), /TVLENS_EMBEDDING_CACHE_LOAD|providerCallsPossible/);
    });
  }
});
// A passage as a durable session keeps it: analysed, stamped, with its per-call metrics and its media.
function passage(i) {
  const startMs = i * 8000, endMs = startMs + 8000, first = Math.floor(i / 12) * 12;
  return { id: `moment-${i + 1}`, startMs, endMs, status: 'ready', audioStatus: 'ready', visionStatus: 'ready', hasAudio: true, available: true, thumbnailAvailable: true,
    observation: { topic: `Sujet ${Math.floor(i / 12)}`, topicContinuity: i % 12 ? 'continue' : 'change', summary: filler(i, 240), visual: filler(i + 3, 180), transcript: 'PAROLES ' + filler(i + 5, 150), audio: 'Paroles transcrites localement.', uncertainty: filler(i + 9, 160) },
    topicSummary: { text: filler(i + 11, 900), firstId: `moment-${first + 1}`, lastId: `moment-${i + 1}`, startMs: first * 8000, endMs },
    receivedMs: endMs + 650, audioStartedMs: endMs + 660, visionQueuedMs: endMs + 5800, visionStartedMs: endMs + 5800, visionPublishedMs: endMs + 9900, transcriptPublishedMs: endMs + 5600, revision: 2, ingest: { assembleMs: 540 },
    audioMs: 5200, visionMs: 4100, analysisMs: 9300, metrics: { audioCacheHit: false, whisper: { loadMs: 170.2, melMs: 22.1, sampleMs: 310.4, encodeMs: 3550.9, decodeMs: 6.2, batchdMs: 1890.3, totalMs: 5180.5, threads: 2 }, framesSent: 4, recentContextCount: 3, contextChars: 2400, coldStart: false, connectMs: 0, threadTurn: 7 } };
}

test('polled views of a two-hour session stay small whatever its length, are answered 304 while nothing was published, and cost no disk access', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-state-views-')), sessionsRoot = path.join(root, 'sessions');
  let clock = 0, wall = 1790000000000, measures = 0;
  const guard = new DiskGuard({ path: sessionsRoot, freeBytes: async () => { measures++; return 50 * 1024 ** 3; }, now: () => wall });
  const agent = { answer: async ({ question }) => ({ answer: filler(question.length, 600), kind: 'explanation', citations: [], limits: [] }) };
  const runtime = new HeadlessRuntime({ userData: root, sessionsRoot, config: {}, selectedModels: {}, smoke: true, agent, guard, readClock: () => clock, wallClock: () => wall });
  const server = await new RemoteServer({ runtime, token, media: { assemble: async input => ({ ...input, clip: Buffer.from('fixture'), frames: [{ atMs: input.startMs, dataUrl: 'data:image/jpeg;base64,YQ==' }], audio: null }) } }).listen(0, '127.0.0.1');
  t.after(async () => { await server.close(); await runtime.close(); await fs.rm(root, { recursive: true, force: true }); });
  const get = async (route, headers = {}) => {
    const res = await fetch(server.url + route, { headers: { Authorization: 'Bearer ' + token, ...headers } }), text = await res.text();
    return { status: res.status, etag: res.headers.get('etag'), bytes: Buffer.byteLength(text), text, value: text ? JSON.parse(text) : null };
  };
  const post = async (route, body) => (await fetch(server.url + route, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  const id = (await post('/v1/session/start', {})).id, watch = runtime.session.watch;
  // The session as it stands after `count` passages of 8 s: all kept, as durable retention keeps them.
  const grow = count => { for (let i = watch.segments.length; i < count; i++) watch.segments.push(passage(i)); watch.sequence = count; clock = count * 8000; watch.emit(); };
  const sizes = async () => {
    const [full, panel, chat] = [await get('/v1/state'), await get('/v1/state?view=panel'), await get('/v1/state?view=chat')];
    const unchanged = await get('/v1/state?view=panel', { 'If-None-Match': panel.etag });
    return { full, panel, chat, row: { full: full.bytes, panel: panel.bytes, chat: chat.bytes, notModified: unchanged.bytes, status: unchanged.status } };
  };

  grow(75);
  for (let n = 1; n <= 35; n++) { const { id: jobId } = await post('/v1/questions', { sessionId: id, question: `Question numéro ${n} ?`, anchorMs: 1000 }); await runtime.deep.jobs.find(job => job.id === jobId).done; }
  await tick();
  const tenMinutes = await sizes();
  grow(900);
  const twoHours = await sizes(), { full, panel, chat } = twoHours;
  t.diagnostic('octets par interrogation, 10 min (75 passages, 35 questions) : ' + JSON.stringify(tenMinutes.row));
  t.diagnostic('octets par interrogation, 2 h (900 passages, 35 questions) : ' + JSON.stringify(twoHours.row));

  // The complete state is unchanged apart from added keys, and it is what grows with the session.
  for (const key of ['session', 'transcription', 'timeline', 'chat', 'captureGaps', 'index', 'quota']) assert.ok(key in full.value, key);
  for (const key of ['id', 'accepting', 'asking', 'elapsedMs', 'capturedThroughMs', 'analyzedThroughMs', 'gaps', 'retentionMs', 'pending', 'lastError', 'history', 'questions', 'latency', 'coverage', 'segments']) assert.ok(key in full.value.session, key);
  assert.deepEqual([full.value.session.segments.length, full.value.chat.jobs.length, full.value.chat.jobs[0].timeoutMs, full.value.serverNowMs, full.value.revision > 0, full.value.surveillance.activity.state, full.value.storage.state],
    [900, 35, 300000, wall, true, 'idle', 'ok']);
  assert.ok(full.bytes > 2000000, 'two hours of passages weigh megabytes in the complete state');

  // Chat view: session header and a bounded conversation. Its size does not depend on the session length.
  assert.deepEqual(Object.keys(chat.value).sort(), ['chat', 'revision', 'serverNowMs', 'session', 'storage', 'surveillance', 'transcription', 'view']);
  assert.deepEqual([chat.value.view, chat.value.session.id, chat.value.session.accepting, chat.value.session.elapsedMs, chat.value.session.passages, chat.value.session.readOnly, chat.value.session.storage.state, chat.value.serverNowMs, chat.value.chat.timeoutMs],
    ['chat', id, true, 7200000, 900, false, 'ok', wall, 300000]);
  for (const heavy of ['segments', 'history', 'questions', 'latency', 'unavailableIds']) assert.equal(heavy in chat.value.session, false, heavy);
  assert.deepEqual([chat.value.chat.jobs.length, chat.value.chat.total, chat.value.chat.jobs.at(-1).question, chat.value.chat.jobs.at(-1).result.answer.length], [8, 35, 'Question numéro 35 ?', 600]);
  assert.ok(Math.abs(chat.bytes - tenMinutes.chat.bytes) < 64, 'same weight at ten minutes and at two hours');
  assert.ok(chat.bytes < 16000 && chat.bytes * 150 < full.bytes, `chat view of two hours: ${chat.bytes} bytes`);

  // Panel view: the last passages without their texts, the timeline with excerpts for older cards, thirty questions.
  assert.deepEqual([panel.value.view, panel.value.session.segments.length, panel.value.session.segments[0].id, panel.value.session.passages, panel.value.session.unavailableIds, panel.value.chat.jobs.length, panel.value.chat.total],
    ['panel', 40, 'moment-861', 900, [], 30, 35]);
  assert.deepEqual(Object.keys(panel.value.session.segments[0]).sort(), ['audioStatus', 'available', 'endMs', 'id', 'observation', 'startMs', 'status', 'thumbnailAvailable', 'visionStatus']);
  assert.deepEqual(Object.keys(panel.value.session.segments[0].observation), ['topic', 'summary']);
  assert.equal('history' in panel.value.session, false);
  assert.equal(panel.text.includes('PAROLES'), false, 'no transcript travels in a polled view');
  assert.equal(chat.text.includes('PAROLES'), false);
  const cards = panel.value.timeline.cards;
  assert.deepEqual([cards.length, cards.filter(card => card.summaryClipped).length, cards[0].summary.length <= 241, cards[0].segmentIds.length, cards.at(-1).summary, cards.at(-1).summaryClipped],
    [75, 63, true, 12, full.value.timeline.cards.at(-1).summary, undefined], 'every card stays reachable; only the twelve most recent carry their whole summary');
  assert.deepEqual(cards.map(card => card.id), full.value.timeline.cards.map(card => card.id));
  for (const job of panel.value.chat.jobs) for (const dropped of ['audit', 'memoryPreview', 'validation', 'evidenceAtStart', 'preview', 'activity']) assert.equal(dropped in job, false, dropped);
  assert.deepEqual(Object.keys(panel.value.chat.jobs[0].metrics).filter(key => ['tools', 'evidence'].includes(key)), []);
  assert.deepEqual([typeof panel.value.chat.jobs[0].metrics.waitMs, typeof panel.value.chat.jobs[0].metrics.totalMs, panel.value.chat.jobs[0].timeoutMs], ['number', 'number', 300000]);
  assert.ok(panel.bytes < 128000 && panel.bytes * 20 < full.bytes, `panel view of two hours: ${panel.bytes} bytes`);
  // From ten minutes to two hours it only gains its older cards: about 0.6 kB per topic, not 2.8 kB per passage.
  assert.ok(panel.bytes - tenMinutes.panel.bytes < 825 * 60, `growth of the panel view: ${panel.bytes - tenMinutes.panel.bytes} bytes for 825 passages`);
  // The whole summary of an older card comes back with its detail.
  const detail = await post('/v1/moments/detail', { sessionId: id, firstId: cards[0].segmentIds[0], lastId: cards[0].segmentIds.at(-1) });
  assert.deepEqual([detail.summary, detail.passages.length], [full.value.timeline.cards[0].summary, 12]);
  assert.ok(detail.summary.length > 800 && detail.summary.startsWith(cards[0].summary.slice(0, 200)));
  assert.deepEqual([(await get('/v1/state?view=tv')).status, (await get('/v1/state?view=')).status, (await get('/v1/state?view=tv')).value.error], [400, 400, 'Vue d’état inconnue.']);

  // Revalidation: a tag per view, 304 without a body while nothing was published, however long it lasts.
  const fsp = require('node:fs/promises');
  const readdir = t.mock.method(fsp, 'readdir'), readFile = t.mock.method(fsp, 'readFile'), measured = measures;
  assert.equal(new Set([full.etag, panel.etag, chat.etag]).size, 3);
  for (let second = 0; second < 30; second++) {
    clock += 1000; wall += 1000; runtime.tick();
    for (const [route, held] of [['/v1/state', full], ['/v1/state?view=panel', panel], ['/v1/state?view=chat', chat]]) {
      const reply = await get(route, { 'If-None-Match': held.etag });
      assert.deepEqual([reply.status, reply.bytes, reply.etag], [304, 0, held.etag], route);
    }
  }
  assert.equal((await get('/v1/state?view=chat', { 'If-None-Match': panel.etag })).status, 200, 'the tag of another view validates nothing');
  // Without the header the body is whole and current: the clock moved though nothing was published.
  const later = await get('/v1/state?view=chat');
  assert.deepEqual([later.status, later.etag, later.value.revision, later.value.session.elapsedMs, later.value.serverNowMs], [200, chat.etag, chat.value.revision, 7230000, wall]);
  await get('/v1/state?view=panel'); await get('/v1/surveillance/overlay'); await get('/v1/session');
  assert.deepEqual([readdir.mock.callCount(), readFile.mock.callCount(), measures - measured], [0, 0, 0], 'a poll lists no directory, reads no file and measures no disk');
  // Nor does it walk the passages again: what only moves with a publication is computed once per revision.
  assert.equal(runtime.snapshot('panel').timeline, runtime.snapshot('panel').timeline);
  assert.equal(runtime.snapshot('panel').session.segments, runtime.snapshot('chat') && runtime.snapshot('panel').session.segments);
  readdir.mock.restore(); readFile.mock.restore();

  // A published change moves the tag: the same request now gets the whole body.
  clock += 8000;
  const sent = await post('/v1/segments', { sessionId: id, sequence: 1, startMs: 7230000, endMs: 7238000, frames: [{ atMs: 7230000, data: 'YQ==' }] });
  assert.equal(sent.id, 'moment-901');
  const changed = await get('/v1/state?view=panel', { 'If-None-Match': panel.etag });
  assert.deepEqual([changed.status, changed.etag !== panel.etag, changed.value.revision > panel.value.revision, changed.value.session.segments.at(-1).id, changed.value.session.passages], [200, true, true, 'moment-901', 901]);
  // The analysis publishes once more after its state is saved: wait for that write, then for its publication.
  do { await tick(); } while (watch.running);
  await runtime.session.store.serial; await tick();
  const settled = await get('/v1/state?view=panel');
  assert.equal((await get('/v1/state?view=panel', { 'If-None-Match': settled.etag })).status, 304);
  await post('/v1/questions', { sessionId: id, question: 'Une de plus ?', anchorMs: 1000 });
  assert.equal((await get('/v1/state?view=panel', { 'If-None-Match': settled.etag })).status, 200);

  // A browser panel may send the tag and read it back; another process never honours a tag of this one.
  const preflight = await fetch(server.url + '/v1/state?view=panel', { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,if-none-match' } });
  assert.match(preflight.headers.get('access-control-allow-headers'), /If-None-Match/);
  const cors = await fetch(server.url + '/v1/state?view=chat', { headers: { Authorization: 'Bearer ' + token, Origin: 'null', 'If-None-Match': 'W/' + (await get('/v1/state?view=chat')).etag } });
  assert.deepEqual([cors.status, cors.headers.get('access-control-expose-headers'), cors.headers.get('access-control-allow-origin')],
    [304, 'ETag, X-TVLens-Error-Code', 'null']);
  const other = new HeadlessRuntime({ userData: root, sessionsRoot: path.join(root, 'other'), config: {}, selectedModels: {}, smoke: true, agent });
  t.after(() => other.close());
  other.revision = runtime.revision;
  assert.notEqual(other.etag('chat'), runtime.etag('chat'));
});
