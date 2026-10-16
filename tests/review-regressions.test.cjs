const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { turns, until, deferred, bounded } = require('./helpers/wait.cjs');
const { manualClock } = require('./helpers/clock.cjs');
const { CodexSessionClient } = require('../adapters/codex-session-client.cjs');
const { CodexSessionAgent } = require('../adapters/codex-session-agent.cjs');
const { CodexPerception } = require('../adapters/codex-perception.cjs');
const { heldWhisper } = require('./helpers/held-whisper.cjs');
const { EmbeddingStore } = require('../adapters/embedding-store.cjs');
const { MomentIndex } = require('../core/moment-index.cjs');
const { MomentSearch } = require('../core/moment-search.cjs');
const { VideoTools } = require('../core/video-tools.cjs');
const { passageText } = require('../core/passage-text.cjs');
const { momentDetail } = require('../core/session-timeline.cjs');
const { loadConfig } = require('../adapters/config.cjs');
const { createSessionRuntime } = require('../runtime/session-runtime.cjs');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');

const authHome = path.join(os.tmpdir(), 'tvlens-test-absent-codex-home');

function appServer({ handle } = {}) {
  const processes = [];
  const rpcFactory = options => {
    const process = { options, started: false, closed: false, n: processes.length + 1 };
    processes.push(process);
    return { start() { process.started = true; }, send() {}, close() { process.closed = true; },
      request(method, params) {
        const custom = handle?.(method, params, process);
        if (custom !== undefined) return custom;
        if (process.closed) return Promise.reject(Error('Connexion Codex interrompue.'));
        if (method === 'thread/start') return Promise.resolve({ thread: { id: `thread-${process.n}-${Math.random().toString(36).slice(2, 6)}` } });
        if (method === 'turn/start') {
          const id = 'turn-' + Math.random().toString(36).slice(2, 8), threadId = params.threadId;
          setImmediate(() => {
            options.onEvent('item/completed', { threadId, turnId: id, item: { type: 'agentMessage', text: JSON.stringify({ answer: 'Oui', kind: 'explanation', citations: [], limits: [], sources: [] }) } });
            options.onEvent('turn/completed', { threadId, turn: { id, status: 'completed' } });
          });
          return Promise.resolve({ turn: { id } });
        }
        return Promise.resolve({});
      } };
  };
  return { processes, rpcFactory, live: () => processes.filter(p => p.started && !p.closed) };
}

test('an App Server dying during the handshake leaves neither its directory nor its dead transport on the client', async () => {
  const server = appServer({ handle: (method, params, process) => {
    if (method !== 'initialize') return undefined;
    // What CodexRpc.fail() does: the close notification first, then the pending request rejects.
    process.options.onEvent('connection/closed', {});
    return Promise.reject(Error('Connexion Codex interrompue.'));
  } });
  const client = new CodexSessionClient({ authHome, rpcFactory: server.rpcFactory });
  await assert.rejects(client.prepare('s'), /interrompue/);
  await turns(6);
  assert.equal(client.rpc, null);
  assert.equal(client.dir, null, 'the session directory (links to the auth files in production) is removed');
});

test('a client closed while its process is being recycled stays closed', async () => {
  const server = appServer();
  const client = new CodexSessionClient({ authHome, rpcFactory: server.rpcFactory, maxRotations: 0 });
  await client.prepare('s');
  const recycling = client.rotateThread(); // maxRotations reached: close, then reconnect in the background
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  await client.close(); // the host ends the session while the recycle is removing its directory
  await recycling;
  await turns(10);
  assert.equal(server.live().length, 0, 'no App Server may be started after the owner closed the client');
  assert.equal(client.ready, null);
});

test('two prepare calls around a dead connection end with a single live process', async () => {
  const server = appServer();
  const client = new CodexSessionClient({ authHome, rpcFactory: server.rpcFactory });
  await client.prepare('s');
  server.processes[0].options.onEvent('connection/closed', {}); // the process died: ready is gone, its directory remains
  const [first, second] = await Promise.all([client.prepare('s'), client.prepare('s')]);
  assert.equal(first, second);
  assert.equal(server.processes.length, 2);
  assert.equal(server.live().length, 1);
  await client.close();
  assert.equal(server.live().length, 0);
});

test('a chat answer that had to connect says so, and the next one does not', async () => {
  const server = appServer();
  const agent = new CodexSessionAgent({ authHome, rpcFactory: server.rpcFactory });
  const input = { tools: { sessionId: 's', anchorMs: 100 }, signal: AbortSignal.timeout(5000), context: { passages: [] } };
  try {
    const first = await agent.answer({ ...input, question: 'Un ?' }), second = await agent.answer({ ...input, question: 'Deux ?' });
    assert.equal(first.coldStart, true); assert.ok(first.connectMs >= 0);
    assert.deepEqual([second.coldStart, second.connectMs], [false, 0]);
  } finally { await agent.close(); }
});

test('after the agent reconnected, a description is the first turn of its thread, not the nth', async () => {
  let cold = false;
  const provider = new CodexPerception({ agent: { reset: async () => {}, answer: async () => ({ topic: 'Sujet', continuity: 'continue', summary: 'Résumé', visual: 'Image', uncertainty: '', topicSummary: 'Cumul', coldStart: cold, connectMs: cold ? 120 : 0 }) } });
  const passage = { id: 'moment-1', startMs: 0, endMs: 8000, frames: [], context: { activeTopic: { firstId: 'moment-1', recent: [] }, previousTopic: 'Sujet' } };
  await provider.observeVisual(passage); await provider.observeVisual(passage);
  cold = true; // the process died between two passages of the same topic: the client reconnected inside this call
  const result = await provider.observeVisual(passage);
  assert.deepEqual([result.metrics.coldStart, result.metrics.threadReset, result.metrics.threadTurn], [true, true, 1]);
  cold = false;
  assert.equal((await provider.observeVisual(passage)).metrics.threadTurn, 2);
});

test('an abandoned Whisper run settling late does not unregister the run that replaced it', async t => {
  const releaseFirst = deferred(), firstFinished = deferred();
  t.after(() => releaseFirst.resolve());
  const f = await heldWhisper(t), transcriber = f.transcriber;
  const run = transcriber.run.bind(transcriber), events = [];
  let launches = 0;
  transcriber.run = async (...args) => {
    const first = ++launches === 1;
    try { return await run(...args); }
    finally {
      if (first) {
        firstFinished.resolve(true);
        await releaseFirst.promise;
      }
    }
  };
  const audio = Buffer.from('eight seconds'), leaving = new AbortController();
  const gone = transcriber.transcribe(audio, leaving.signal);
  const firstPid = await f.started(1);
  const abandoned = [...transcriber.running.values()][0];
  const abandonedSettled = abandoned.result.finally(() => events.push('first settled'));
  abandonedSettled.catch(() => {});
  leaving.abort(new Error('annulé'));
  await assert.rejects(bounded(gone), /annulé/);
  events.push('first abandoned');
  const second = transcriber.transcribe(audio);
  const secondPid = await f.started(2);
  assert.notEqual(firstPid, secondPid);
  assert.equal(transcriber.running.size, 1);
  const replacement = [...transcriber.running.values()][0];
  assert.notEqual(replacement, abandoned);
  events.push('replacement alive');
  assert.equal(events.includes('first settled'), false, 'the abandoned result is still held while the replacement is alive');
  await f.exited(firstPid);
  assert.equal(await bounded(firstFinished.promise), true, 'the abandoned run reached its settlement gate');
  releaseFirst.resolve();
  // result porte le finally du registre, contrairement au rejet déjà rendu à l'appelant parti.
  await assert.rejects(bounded(abandonedSettled), /annulé/);
  assert.equal(transcriber.cache.size, 0, 'no cached transcript can satisfy the third caller');
  const third = transcriber.transcribe(audio);
  events.push('third call');
  assert.equal(launches, 2, 'the third caller shares the second run instead of spawning its own');
  assert.deepEqual((await f.records()).map(row => row.event), ['start', 'start']);
  await f.release(secondPid);
  events.push('replacement released');
  assert.deepEqual(await bounded(Promise.all([second, third]).then(results => results.map(result => result.text))), ['Bonjour', 'Bonjour']);
  await f.exited(secondPid);
  assert.equal((await f.records()).filter(row => row.event === 'start').length, 2);
  assert.deepEqual(events, ['first abandoned', 'replacement alive', 'first settled', 'third call', 'replacement released']);
});

const memoryCache = () => { const values = new Map(); return { values, get: async (id, text) => values.get(id + '\n' + text) || null, putMany: async items => { for (const { id, text, vector } of items) values.set(id + '\n' + text, vector); } }; };
const passage = (n, summary = `Passage ${n}`) => ({ id: `moment-${n}`, startMs: (n - 1) * 8000, endMs: n * 8000, status: 'ready', observation: { summary } });

test('during an embeddings outage searches do not multiply failing requests: one per shared backoff step', async () => {
  const clock = manualClock({ turns: 6 });
  let requests = 0;
  const index = new MomentIndex({ embeddings: { embedMany: async () => { requests++; throw Error('HTTP 503'); } }, cache: memoryCache(), ...clock.io });
  const search = new MomentSearch({ index, setTimer: clock.io.setTimer, clearTimer: clock.io.clearTimer });
  const segments = Array.from({ length: 100 }, (_, i) => passage(i + 1));
  const ask = async () => {
    const found = search.search({ query: 'il est question du budget', segments, anchorMs: 800000, budgetMs: 1500, queryBudgetMs: 100 });
    await clock.advance(1600);
    return found;
  };
  const first = await ask();
  assert.equal(first.mode, 'lexical');
  const afterFirst = requests;
  assert.ok(afterFirst <= 2, `a search during an outage costs at most its first failing batch and the query (got ${afterFirst})`);
  await ask(); await ask();
  assert.ok(requests - afterFirst <= 4, `later searches wait for the shared pause instead of re-sending every batch (got ${requests - afterFirst} more)`);
  assert.ok(index.status().pausedUntilMs > 0);
  index.close();
});

test('a search holding an older copy of a passage does not discard the newer text being indexed', async () => {
  const clock = manualClock({ turns: 6 });
  const cache = memoryCache();
  let release;
  const index = new MomentIndex({ embeddings: {
    embedMany: async texts => {
      if (texts[0] === 'Texte complet') await new Promise(resolve => { release = resolve; });
      return texts.map(() => [1, 0]);
    },
  }, cache, holdMs: 0, ...clock.io });
  index.request([passage(1, 'Paroles seules')]); await clock.advance(10);
  assert.ok(cache.values.has('moment-1\nParoles seules'));
  index.observe([passage(1, 'Texte complet')]);
  await clock.advance(10); // the fuller text is now in flight
  index.request([passage(1, 'Paroles seules')]);
  await turns(6); // a question still holds the older, already indexed text
  release();
  await clock.advance(10);
  assert.ok(cache.values.has('moment-1\nTexte complet'), 'the newer vector is written');
  assert.equal(index.status().stale, 0);
  index.close();
});

test('a vector appended after a torn line survives the next load', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-torn-log-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'embeddings.json');
  await new EmbeddingStore(file, 'model').put('moment-1', 'Un', [1]);
  await fs.appendFile(file, '{"id":"moment-9","text":"Neuf","vec'); // crash or full disk in the middle of an append
  const reopened = new EmbeddingStore(file, 'model');
  await reopened.put('moment-10', 'Dix', [10]);
  const reloaded = new EmbeddingStore(file, 'model');
  assert.deepEqual(await reloaded.get('moment-10', 'Dix'), [10]);
  assert.deepEqual(await reloaded.get('moment-1', 'Un'), [1]);
  assert.ok((await fs.readFile(file, 'utf8')).split('\n').filter(Boolean).every(line => JSON.parse(line)));
});

test('the text of a spoken passage without description does not change when it is archived', () => {
  const live = { id: 'moment-1', status: 'partial', audioStatus: 'ready', visionStatus: 'skipped', observation: { transcript: 'Bonsoir à tous.' } };
  const archived = { ...live, summary: live.observation.summary || live.observation.transcript };
  assert.equal(passageText(archived), passageText(live));
  assert.equal(passageText(live), 'Bonsoir à tous.');
  assert.equal(passageText({ observation: { summary: 'Résumé', visual: 'Image', transcript: 'Paroles' } }), 'Résumé\nImage\nParoles');
});

test('an older read returned late never replaces the newer consulted version, even at the same revision', async () => {
  let live, releaseSearch;
  const snapshot = { id: 's', elapsedMs: 9000, history: [], segments: [{ id: 'moment-1', startMs: 0, endMs: 8000, status: 'partial', audioStatus: 'ready', visionStatus: 'analyzing', available: true, revision: 1, observation: { transcript: 'Paroles' } }] };
  live = snapshot;
  const tools = new VideoTools({ snapshot, live: () => live, media: { lease: async () => async () => {} },
    search: { search: async ({ segments }) => { await new Promise(resolve => { releaseSearch = resolve; }); return { mode: 'lexical', moments: segments.map(s => ({ id: s.id })), warnings: [] }; } } });
  const searching = tools.call('search_moments', { query: 'paroles' });
  await turns(6);
  // Meanwhile the description fails and the media expires: same revision, newer state.
  live = { ...snapshot, elapsedMs: 12000, segments: [{ ...snapshot.segments[0], visionStatus: 'error', visionError: 'Délai dépassé', available: false }] };
  await tools.call('get_transcript', { startMs: 0, endMs: 8000 });
  releaseSearch(); await searching;
  const recorded = tools.memoryEvidence.find(e => e.id === 'moment-1');
  assert.deepEqual([recorded.visionStatus, recorded.available], ['error', false]);
});

test('runtime switches reach the packaged app too: those of the imported file persist with it, the environment of a start wins and is not stored, and a mistyped one is refused at session start', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-switch-paths-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sealed = [], safeStorage = { isEncryptionAvailable: () => true, encryptString: text => { sealed.push(text); return Buffer.from(text); }, decryptString: bytes => Buffer.from(bytes).toString() };
  const configPath = path.join(root, 'tvlens.env');
  await fs.writeFile(configPath, 'OPENROUTER_API_KEY=key\nTVLENS_LOCAL_VLM_TOKEN=secret-token\nTVLENS_BACKGROUND_INDEX=0\n');
  const dev = await loadConfig({ configPath, userData: root, safeStorage, environment: { TVLENS_VISION_DURING_ASK: '1', TVLENS_WHISPER_AUDIO_CTX: '512' } });
  assert.deepEqual([dev.backgroundIndex, dev.visionDuringAsk, dev.whisperAudioCtx, dev.localVlm.token], [false, true, 512, 'secret-token']);
  assert.ok(!sealed.join('').includes('secret-token'), 'the local-model token is never stored');
  assert.ok(!/VISION_DURING_ASK|AUDIO_CTX/.test(sealed.join('')), 'an experiment set in the environment of one start is not stored');
  // Packaged app opened from the Finder: no env file, no shell environment. The opt-out of the imported file still holds.
  const finder = await loadConfig({ userData: root, safeStorage, environment: {} });
  // visionDuringAsk is back to its default, which is on since questions may run five minutes: the unset audio context is what shows the experiment was not kept.
  assert.deepEqual([finder.apiKey, finder.backgroundIndex, finder.visionDuringAsk, finder.whisperAudioCtx, finder.localVlm.token], ['key', false, true, undefined, null]);
  assert.equal('switchEnv' in finder, false);
  // The environment of a start wins in both directions; an empty variable undoes nothing.
  const packaged = environment => loadConfig({ userData: root, safeStorage, environment });
  assert.equal((await packaged({ TVLENS_BACKGROUND_INDEX: '1' })).backgroundIndex, true);
  assert.equal((await packaged({ TVLENS_BACKGROUND_INDEX: '' })).backgroundIndex, false);
  assert.equal((await loadConfig({ configPath, userData: root, safeStorage, environment: { TVLENS_BACKGROUND_INDEX: '' } })).backgroundIndex, false);
  // A cache written before this change holds no switch: defaults, then the environment.
  const older = path.join(root, 'older');
  await fs.mkdir(older); await fs.writeFile(path.join(older, 'provider.enc'), JSON.stringify({ apiKey: 'old', model: 'm' }));
  assert.deepEqual(await loadConfig({ userData: older, safeStorage, environment: {} }).then(c => [c.apiKey, c.backgroundIndex, c.visionDuringAsk]), ['old', true, true]);
  assert.equal((await loadConfig({ userData: older, safeStorage, environment: { TVLENS_BACKGROUND_INDEX: '0' } })).backgroundIndex, false);
  const bare = await loadConfig({ userData: path.join(root, 'empty'), safeStorage: { isEncryptionAvailable: () => false }, environment: { TVLENS_WHISPER_AUDIO_CTX: 'auto' } });
  assert.deepEqual([bare.whisperAudioCtx, bare.backgroundIndex], ['auto', true]);
  const start = config => createSessionRuntime({ sessionsRoot: path.join(root, 'sessions'), userData: root, config, selectedModels: {}, smoke: true });
  assert.throws(() => start({ backgroundIndex: 'false' }), /backgroundIndex invalide/);
  assert.throws(() => start({ visionDuringAsk: 'yes' }), /visionDuringAsk invalide/);
  assert.throws(() => start({ perceptionBackend: 'ollama' }), /Backend de perception inconnu/);
  assert.throws(() => createSessionRuntime({ sessionsRoot: path.join(root, 'sessions'), userData: root, selectedModels: {}, config: { perceptionBackend: 'local', localVlm: { url: 'http://127.0.0.1:1', model: 'm', numCtx: NaN } } }), /taille de contexte invalide/);
});

test('the session runtime feeds published passages to the index, honours the opt-out, passes the lane options and closes the index', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-runtime-wiring-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const calls = [];
  const embeddings = { embedMany: async texts => { calls.push(texts); return texts.map(() => [1, 0]); } };
  const perception = { transcribe: async s => ({ observation: { transcript: `Paroles ${s.id}` }, elapsedMs: 1 }), observeVisual: async s => ({ observation: { summary: `Images ${s.id}`, visual: 'Image' }, elapsedMs: 1 }) };
  const build = config => createSessionRuntime({ sessionsRoot: path.join(root, 'sessions'), userData: root, config, selectedModels: {}, smoke: true, overrides: { perception, embeddings }, readClock: () => 9000 });
  const block = { startMs: 0, endMs: 8000, clip: Buffer.from('clip'), audio: new Uint8Array([1]), frames: [{ atMs: 0, dataUrl: 'data:image/jpeg;base64,YQ==' }] };
  const fed = build({ visionDuringAsk: true, whisperAudioCtx: 512 });
  assert.equal(fed.watch.visionDuringAsk, true);
  assert.equal(fed.transcriber.audioCtx, 512);
  await fed.watch.ingest(block);
  await until(
    () => fed.watch.segments[0].status === 'ready' && fed.search.index.status().pending === 1,
    'published passage queued for indexing',
  );
  assert.deepEqual([fed.search.index.status().pending, fed.watch.segments[0].status], [1, 'ready'], 'the published passage waits in the background queue');
  await fed.close();
  await turns(6);
  assert.equal(fed.search.index.status().closed, true);
  assert.deepEqual(calls, [], 'nothing is sent after the session ended');
  const silent = build({ backgroundIndex: false });
  assert.equal(silent.watch.visionDuringAsk, false);
  await silent.watch.ingest(block);
  await until(() => silent.watch.segments[0].status === 'ready', 'passage ready with background indexing disabled');
  await turns(6);
  assert.equal(silent.search.index.status().pending, 0, 'opted out: only a search may request an embedding');
  await silent.close();
});

test('the headless state exposes index counters only when an index exists', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-index-state-'));
  const runtime = new HeadlessRuntime({ userData: root, sessionsRoot: path.join(root, 'sessions'), config: {}, selectedModels: {}, smoke: true, agent: { answer: async () => ({}) }, overrides: { embeddings: { embedMany: async texts => texts.map(() => [1, 0]) } } });
  t.after(async () => { await runtime.close(); await fs.rm(root, { recursive: true, force: true }); });
  assert.equal(runtime.snapshot().index, null);
  await runtime.start();
  assert.deepEqual(Object.keys(runtime.snapshot().index).sort(), ['closed', 'coalesced', 'dropped', 'failed', 'inFlight', 'indexed', 'lastIndexedAtMs', 'pausedUntilMs', 'pending', 'stale']);
});

test('a search during the pause that follows a provider failure answers at once instead of waiting its whole budget', async () => {
  const clock = manualClock({ turns: 6 });
  let fail = true, batches = 0;
  const reply = value => { if (fail) throw Error('HTTP 503'); return value; };
  const cache = memoryCache(); cache.put = (id, text, vector) => cache.putMany([{ id, text, vector }]);
  const index = new MomentIndex({ embeddings: {
    embed: async () => reply([1, 0]),
    embedMany: async texts => {
      batches++;
      return reply(texts.map(() => [1, 0]));
    },
  }, cache, ...clock.io });
  const search = new MomentSearch({ index, setTimer: clock.io.setTimer, clearTimer: clock.io.clearTimer });
  const segments = Array.from({ length: 100 }, (_, i) => passage(i + 1));
  const ask = () => { const found = {}; search.search({ query: 'il est question du budget', segments, anchorMs: 800000 }).then(value => { found.value = value; }); return found; };
  // No timer fires below unless the clock is advanced: an answer means the search did not wait.
  const first = ask();
  await turns(12);
  assert.equal(first.value?.mode, 'lexical', 'the first batch failed and the pause outlasts the budget');
  await clock.advance(500);
  const second = ask();
  await turns(12);
  assert.equal(second.value?.mode, 'lexical');
  assert.deepEqual(second.value.semantic, { eligible: 100, indexed: 0, pending: 100 });
  assert.equal(batches, 1, 'nothing is sent during the pause');
  // The pause now ends inside the budget and the provider is back: this search waits for the retry.
  fail = false;
  await clock.advance(500);
  const third = ask();
  await turns(12);
  assert.equal(third.value, undefined);
  await clock.advance(1000);
  assert.equal(third.value?.mode, 'hybrid');
  assert.deepEqual(third.value.semantic, { eligible: 100, indexed: 100, pending: 0 });
  index.close();
});

test('a client closed while a turn is removing a dead connection stays closed', async () => {
  const server = appServer();
  const client = new CodexSessionClient({ authHome, rpcFactory: server.rpcFactory });
  await client.prepare('s');
  server.processes[0].options.onEvent('connection/closed', {}); // the process died: ready is gone, its directory remains
  const controller = new AbortController();
  const turn = client.answer({ sessionId: 's', instructions: 'Décris.', signal: controller.signal });
  turn.catch(() => {});
  for (let i = 0; i < 6; i++) await Promise.resolve(); // the turn's prepare() is now removing that directory
  controller.abort(Error('Session fermée.')); await client.close(); // the host ends the session meanwhile
  await assert.rejects(turn);
  await turns(10);
  assert.equal(server.live().length, 0, 'no App Server may be started after the owner closed the client');
  assert.deepEqual([client.ready, client.dir], [null, null]);
});

test('a passage whose transcription failed says so wherever its empty transcript is read', async () => {
  const failed = { id: 'moment-1', startMs: 0, endMs: 8000, status: 'ready', audioStatus: 'ready', visionStatus: 'ready', audioFailed: true, available: true, revision: 2, observation: { summary: 'Un plateau.', visual: 'Deux personnes.', transcript: '' } };
  const heard = { ...failed, id: 'moment-2', startMs: 8000, endMs: 16000, audioFailed: undefined, observation: { ...failed.observation, transcript: 'Bonsoir.' } };
  const snapshot = { id: 's', elapsedMs: 17000, history: [], segments: [failed, heard] };
  const tools = new VideoTools({ snapshot, search: {}, inspector: {}, media: {} });
  const read = await tools.call('get_transcript', { startMs: 0, endMs: 16000 });
  assert.deepEqual(read.passages.map(p => [p.id, p.audioStatus, p.audioFailed]), [['moment-1', 'ready', true], ['moment-2', 'ready', undefined]]);
  assert.equal('audioFailed' in read.passages[1], false, 'a passage that was heard carries no flag');
  assert.equal(tools.memoryEvidence.find(e => e.id === 'moment-1').audioFailed, true);
  const detail = momentDetail(snapshot, ['moment-1', 'moment-2']);
  assert.deepEqual(detail.passages.map(p => p.audioFailed), [true, undefined]);
});

test('with the session clock stopped by a pause, an older read returned late still does not replace the newer one', async () => {
  let live, releaseSearch;
  const passage = { id: 'moment-1', startMs: 0, endMs: 8000, status: 'partial', audioStatus: 'ready', visionStatus: 'analyzing', available: true, revision: 1, observation: { transcript: 'Paroles' } };
  const snapshot = { id: 's', elapsedMs: 9000, history: [], segments: [passage] };
  live = snapshot;
  const tools = new VideoTools({ snapshot, live: () => live, media: { lease: async () => async () => {} },
    search: { search: async ({ segments }) => { await new Promise(resolve => { releaseSearch = resolve; }); return { mode: 'lexical', moments: segments.map(s => ({ id: s.id })), warnings: [] }; } } });
  const searching = tools.call('search_moments', { query: 'paroles' });
  await turns(6);
  // Paused session: elapsedMs no longer advances, yet the passage changes (the description fails, the media expires).
  live = { ...snapshot, segments: [{ ...passage, visionStatus: 'error', visionError: 'Délai dépassé', available: false }] };
  await tools.call('get_transcript', { startMs: 0, endMs: 8000 });
  releaseSearch(); await searching;
  const recorded = tools.memoryEvidence.find(e => e.id === 'moment-1');
  assert.deepEqual([recorded.visionStatus, recorded.available], ['error', false]);
  // Both versions stay in the journal, at the same clock value, each with its consultation rank.
  assert.deepEqual(tools.journal.map(e => [e.source, e.visionStatus, e.asOfMs, e.read]), [['get_transcript', 'error', 9000, 2], ['search_moments', 'analyzing', 9000, 1]]);
});

test('the switches of an imported file persist without any provider key, never with the local-model token, and leave a stored key in place', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-switch-nokey-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sealed = [], safeStorage = { isEncryptionAvailable: () => true, encryptString: text => { sealed.push(text); return Buffer.from(text); }, decryptString: bytes => Buffer.from(bytes).toString() };
  const configPath = path.join(root, 'tvlens.env'), userData = path.join(root, 'data');
  const importFile = async contents => { await fs.writeFile(configPath, contents); return loadConfig({ configPath, userData, safeStorage, environment: {} }); };
  const finder = () => loadConfig({ userData, safeStorage, environment: {} }); // packaged app opened from the Finder: no file, no environment
  const view = c => [c.apiKey, c.perceptionBackend, c.localVlm.url, c.localVlm.model, c.localVlm.token, c.visionDuringAsk, c.whisperAudioCtx, c.backgroundIndex];
  // A Codex-only install: no OpenRouter key at all, a local backend and two options.
  const imported = await importFile('TVLENS_PERCEPTION_BACKEND=local\nTVLENS_LOCAL_VLM_URL=http://127.0.0.1:11434\nTVLENS_LOCAL_VLM_MODEL=qwen\nTVLENS_LOCAL_VLM_TOKEN=secret-token\nTVLENS_VISION_DURING_ASK=1\nTVLENS_WHISPER_AUDIO_CTX=auto\n');
  assert.deepEqual(view(imported), ['', 'local', 'http://127.0.0.1:11434', 'qwen', 'secret-token', true, 'auto', true]);
  assert.deepEqual(view(await finder()), ['', 'local', 'http://127.0.0.1:11434', 'qwen', null, true, 'auto', true], 'the imported backend and options hold at the next start; the token does not');
  assert.equal((await finder()).model, 'google/gemini-2.5-flash-lite');
  assert.ok(!sealed.join('').includes('secret-token'), 'the local-model token is never stored');
  assert.deepEqual(Object.keys(JSON.parse(sealed.at(-1))), ['switchEnv'], 'a keyless import stores its switches and nothing else');
  // A file without switches clears those kept before.
  await importFile('');
  assert.deepEqual(view(await finder()), ['', 'codex', null, null, null, true, undefined, true]);
  // A stored key keeps its provider settings when a keyless file is imported over it: only the switches are replaced.
  await importFile('OPENROUTER_API_KEY=key\nTVLENS_WHISPER_THREADS=3\n');
  assert.deepEqual([(await finder()).apiKey, (await finder()).whisperThreads, (await finder()).backgroundIndex], ['key', 3, true]);
  await importFile('TVLENS_BACKGROUND_INDEX=0\n');
  assert.deepEqual([(await finder()).apiKey, (await finder()).whisperThreads, (await finder()).backgroundIndex], ['key', 3, false], 'the opt-out holds with the stored key');
  // A host without encryption keeps nothing, as before.
  const plain = path.join(root, 'plain');
  await loadConfig({ configPath, userData: plain, safeStorage: { isEncryptionAvailable: () => false }, environment: {} });
  await assert.rejects(fs.access(plain));
});
