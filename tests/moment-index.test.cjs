const { test } = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MomentIndex } = require('../core/moment-index.cjs');
const { MomentSearch } = require('../core/moment-search.cjs');
const { passageText } = require('../core/passage-text.cjs');
const { OpenRouterEmbeddings } = require('../adapters/openrouter-embeddings.cjs');
const { EmbeddingStore } = require('../adapters/embedding-store.cjs');
const { manualClock } = require('./helpers/clock.cjs');

const SLOW = 'Recherche sémantique trop lente : classement textuel et temporel uniquement.';
const UNAVAILABLE = 'Recherche sémantique indisponible : classement textuel et temporel uniquement.';
// Lets every promise chain settle; nothing in this file waits for real time.
const { tick } = require('./helpers/wait.cjs');
const vector = text => (/chien/.test(text) ? [0, 1] : [1, 0]);
// Records every call with its signal; a manual call stays in flight until resolve()/reject().
function provider({ manual = false, many = true, fail = false } = {}) {
  const calls = [];
  const start = (texts, signal, single) => new Promise((resolve, reject) => {
    const call = { texts, signal, resolve: () => resolve(single ? vector(texts[0]) : texts.map(vector)), reject };
    calls.push(call);
    if (fail) reject(Error('offline')); else if (!manual) call.resolve();
  });
  return { calls, embed: (text, signal) => start([text], signal, true), ...(many ? { embedMany: (texts, signal) => start(texts, signal, false) } : {}) };
}
// Exact (id, text) cache; `writes` holds the ids of each write call.
function memoryCache({ many = true } = {}) {
  const entries = new Map(), writes = [];
  return { entries, writes,
    get: async (id, text) => (entries.get(id)?.text === text ? entries.get(id).vector : null),
    put: async (id, text, value) => { writes.push([id]); entries.set(id, { text, vector: value }); },
    ...(many ? { putMany: async items => { writes.push(items.map(item => item.id)); for (const item of items) entries.set(item.id, { text: item.text, vector: item.vector }); } } : {}) };
}
const passage = (n, summary = `Passage ${n}`) => ({ id: `moment-${n}`, startMs: (n - 1) * 8000, endMs: n * 8000, observation: { summary } });
function setup({ embeddings = provider(), cache = memoryCache(), ...options } = {}) {
  const clock = manualClock(), index = new MomentIndex({ embeddings, cache, ...clock.io, ...options });
  return { clock, embeddings, cache, index, search: new MomentSearch({ index, ...clock.io }) };
}

test('background indexing waits for the hold, then makes ceil(N/32) provider calls and one cache write per batch', async () => {
  const { clock, embeddings, cache, index } = setup();
  const passages = Array.from({ length: 70 }, (_, i) => passage(i + 1));
  index.observe(passages);
  await clock.advance(5999);
  assert.equal(embeddings.calls.length, 0);
  assert.equal(index.status().pending, 70);
  await clock.advance(1);
  assert.deepEqual(embeddings.calls.map(call => call.texts.length), [32, 32, 6]);
  assert.deepEqual(embeddings.calls.flatMap(call => call.texts), passages.map(passageText));
  assert.deepEqual(cache.writes.map(ids => ids.length), [32, 32, 6]);
  assert.deepEqual(index.status(), { indexed: 70, pending: 0, inFlight: 0, coalesced: 0, dropped: 0, failed: 0, stale: 0, lastIndexedAtMs: 6000, pausedUntilMs: 0, closed: false });
  // Evidence is published again on every session change: already indexed text costs nothing.
  index.observe(passages); index.request(passages);
  await clock.advance(60000);
  assert.equal(embeddings.calls.length, 3);
  assert.equal(index.status().pending, 0);
  assert.equal(clock.armed, 0);
});

test('one batch in flight at a time: requested passages first, then the oldest, within the byte bound', async () => {
  const { clock, embeddings, index } = setup({ embeddings: provider({ manual: true }), batchSize: 2 });
  index.observe([passage(1), passage(2), passage(3)]);
  await clock.advance(6000);
  assert.deepEqual(embeddings.calls.map(call => call.texts), [['Passage 1', 'Passage 2']]);
  index.request([passage(9)]);
  await clock.advance(10000);
  assert.equal(embeddings.calls.length, 1);
  assert.equal(index.status().inFlight, 2);
  embeddings.calls[0].resolve(); await tick();
  assert.deepEqual(embeddings.calls[1].texts, ['Passage 9', 'Passage 3']);

  // 'é' is two UTF-8 bytes: three 10-byte texts do not fit a 25-byte batch.
  const bounded = setup({ batchBytes: 25 });
  bounded.index.observe([passage(1, 'éééé 1'), passage(2, 'éééé 2'), passage(3, 'éééé 3')]);
  await bounded.clock.advance(6000);
  assert.deepEqual(bounded.embeddings.calls.map(call => call.texts.length), [2, 1]);
});

test('without embedMany or putMany, passages are embedded sequentially through embed and put', async () => {
  const { clock, embeddings, cache, index } = setup({ embeddings: provider({ manual: true, many: false }), cache: memoryCache({ many: false }) });
  const passages = [passage(1), passage(2), passage(3)];
  index.observe(passages);
  await clock.advance(6000);
  for (let i = 0; i < 3; i++) {
    assert.equal(embeddings.calls.length, i + 1);
    assert.deepEqual(embeddings.calls[i].texts, [`Passage ${i + 1}`]);
    embeddings.calls[i].resolve(); await tick();
  }
  assert.deepEqual(cache.writes, [['moment-1'], ['moment-2'], ['moment-3']]);
  assert.equal(index.status().indexed, 3);
  assert.deepEqual(await index.passageVector(passages[2]), vector('Passage 3'));
});

const partial = { id: 'moment-1', startMs: 0, endMs: 8000, status: 'partial', observation: { transcript: 'Bonjour à tous.' } };
const ready = { ...partial, status: 'ready', observation: { summary: 'Un présentateur salue le public.', transcript: 'Bonjour à tous.' } };

test('partial -> ready during the hold costs one embedding, of the latest text', async () => {
  const { clock, embeddings, cache, index } = setup();
  index.observe([partial]);
  await clock.advance(4000);
  index.observe([ready]);
  await clock.advance(5999);
  assert.equal(embeddings.calls.length, 0);
  await clock.advance(1);
  assert.deepEqual(embeddings.calls.map(call => call.texts), [[passageText(ready)]]);
  assert.equal(cache.entries.get('moment-1').text, passageText(ready));
  const { coalesced, indexed, stale } = index.status();
  assert.deepEqual({ coalesced, indexed, stale }, { coalesced: 1, indexed: 1, stale: 0 });
});

test('partial -> ready while the first text is being embedded: the stale result is never written, the newer text is', async () => {
  const { clock, embeddings, cache, index } = setup({ embeddings: provider({ manual: true }) });
  index.observe([partial]);
  await clock.advance(6000);
  assert.deepEqual(embeddings.calls.map(call => call.texts), [[passageText(partial)]]);
  index.observe([ready]); await tick();
  embeddings.calls[0].resolve(); await tick();
  assert.deepEqual(cache.writes, []);
  assert.equal(await index.passageVector(partial), null);
  let { stale, indexed, pending } = index.status();
  assert.deepEqual({ stale, indexed, pending }, { stale: 1, indexed: 0, pending: 1 });
  await clock.advance(6000);
  assert.deepEqual(embeddings.calls[1].texts, [passageText(ready)]);
  embeddings.calls[1].resolve(); await tick();
  assert.deepEqual(cache.writes, [['moment-1']]);
  assert.equal(cache.entries.get('moment-1').text, passageText(ready));
  ({ stale, indexed, pending } = index.status());
  assert.deepEqual({ stale, indexed, pending }, { stale: 1, indexed: 1, pending: 0 });
});

test('close cancels pending and in-flight work, ignores the late response and turns later calls into no-ops', async () => {
  const { clock, embeddings, cache, index } = setup({ embeddings: provider({ manual: true }) });
  index.observe([passage(2), passage(3)]); await tick();
  assert.equal(clock.armed, 1);
  index.request([passage(1)]); await tick();
  assert.deepEqual(embeddings.calls.map(call => call.texts), [['Passage 1']]);
  const waiting = index.settle(1500);
  index.close();
  assert.equal(await waiting, true);
  assert.equal(embeddings.calls[0].signal.aborted, true);
  assert.equal(clock.armed, 0);
  const closed = { indexed: 0, pending: 0, inFlight: 0, coalesced: 0, dropped: 3, failed: 0, stale: 0, lastIndexedAtMs: 0, pausedUntilMs: 0, closed: true };
  assert.deepEqual(index.status(), closed);
  embeddings.calls[0].resolve();
  index.observe([passage(4)]); index.request([passage(5)]);
  await clock.advance(120000);
  assert.equal(await index.settle(1000), true);
  await assert.rejects(index.queryVector('question tardive'), /Index fermé/);
  assert.equal(embeddings.calls.length, 1);
  assert.deepEqual(cache.writes, []);
  assert.equal(cache.entries.size, 0);
  assert.deepEqual(index.status(), closed);

  // With nothing in flight, the hold timer itself is cancelled.
  const idle = setup();
  idle.index.observe([passage(1)]); await tick();
  assert.equal(idle.clock.armed, 1);
  idle.index.close();
  assert.equal(idle.clock.armed, 0);
  await idle.clock.advance(120000);
  assert.equal(idle.embeddings.calls.length, 0);
});

const scene = [passage(1, 'Un chien court dans le jardin.'), passage(2, 'Une voiture s’arrête.')];

test('a rejected passage vector preserves lexical ranking, partial semantic counts and the next search', async () => {
  const clock = manualClock();
  const index = {
    ensure: async () => {},
    queryVector: async () => [1, 0],
    passageVector: async segment => {
      if (segment.id === 'moment-1') throw Error('cache illisible');
      return [0, 1];
    },
  };
  const search = new MomentSearch({ index, ...clock.io });
  const input = { query: 'chien', segments: scene, anchorMs: 16000 };
  let result;
  await assert.doesNotReject(async () => { result = await search.search(input); });
  assert.equal(result.mode, 'hybrid');
  assert.deepEqual(result.moments.map(moment => [moment.id, moment.score]), [['moment-1', 0.55], ['moment-2', 0]]);
  assert.deepEqual(result.semantic, { eligible: 2, indexed: 1, pending: 1 });
  assert.deepEqual(result.warnings, ['1 passage(s) pas encore indexé(s) : classement textuel pour eux.']);
  assert.deepEqual(await search.search(input), result);
  assert.equal(clock.armed, 0);
});

test('a rejected passage vector keeps the lexical fallback warning when the query vector also fails', async () => {
  const clock = manualClock();
  const search = new MomentSearch({ ...clock.io, index: {
    ensure: async () => {},
    queryVector: async () => { throw Error('fournisseur indisponible'); },
    passageVector: async () => { throw Error('cache illisible'); },
  } });
  let result;
  await assert.doesNotReject(async () => {
    result = await search.search({ query: 'chien', segments: scene, anchorMs: 16000 });
  });
  assert.equal(result.mode, 'lexical');
  assert.deepEqual(result.moments.map(moment => [moment.id, moment.score]), [['moment-1', 0.55], ['moment-2', 0]]);
  assert.deepEqual(result.semantic, { eligible: 2, indexed: 0, pending: 2 });
  assert.deepEqual(result.warnings, [UNAVAILABLE]);
  assert.equal(clock.armed, 0);
});

test('an aborted search still rejects before reading an unreadable passage cache', async () => {
  const clock = manualClock(), controller = new AbortController();
  const reason = Object.assign(Error('Recherche annulée.'), { code: 'SEARCH_CANCELLED' });
  let reads = 0;
  const search = new MomentSearch({ ...clock.io, index: {
    ensure: async () => {},
    queryVector: async () => { controller.abort(reason); throw reason; },
    passageVector: async () => { reads++; throw Error('cache illisible'); },
  } });
  await assert.rejects(search.search({ query: 'chien', segments: scene, anchorMs: 16000, signal: controller.signal }),
    error => error === reason && error.code === 'SEARCH_CANCELLED');
  assert.equal(reads, 0);
  assert.equal(clock.armed, 0);
});

test('a provider slower than the budgets gives a lexical answer at the budget and the background work goes on', async () => {
  const { clock, embeddings, index, search } = setup({ embeddings: provider({ manual: true }) });
  const input = { query: 'chien', segments: scene, anchorMs: 16000 };
  let result; search.search(input).then(value => { result = value; });
  await clock.advance(1499);
  assert.equal(result, undefined);
  await clock.advance(1);
  // Passage budget spent: the query vector gets its own budget, the batch stays in flight.
  assert.deepEqual(embeddings.calls.map(call => call.texts), [scene.map(passageText), ['chien']]);
  await clock.advance(2499);
  assert.equal(result, undefined);
  await clock.advance(1);
  assert.equal(result.mode, 'lexical');
  assert.deepEqual(result.warnings, [SLOW]);
  assert.deepEqual(result.semantic, { eligible: 2, indexed: 0, pending: 2 });
  assert.equal(result.moments[0].id, 'moment-1');
  assert.ok(embeddings.calls.every(call => !call.signal.aborted));
  assert.equal(index.status().inFlight, 2);
  // Late results are kept: the next search finds the passages and the query vector.
  for (const call of embeddings.calls) call.resolve();
  await tick();
  assert.equal(index.status().indexed, 2);
  const again = await search.search(input);
  assert.equal(again.mode, 'hybrid');
  assert.deepEqual(again.warnings, []);
  assert.deepEqual(again.semantic, { eligible: 2, indexed: 2, pending: 0 });
  assert.equal(embeddings.calls.length, 2);
});

test('a failing provider gives an immediate lexical answer and the retry stays scheduled', async () => {
  const { clock, embeddings, index, search } = setup({ embeddings: provider({ fail: true }) });
  const result = await search.search({ query: 'chien', segments: scene, anchorMs: 16000 });
  assert.equal(clock.io.now(), 0);
  assert.equal(result.mode, 'lexical');
  assert.deepEqual(result.warnings, [UNAVAILABLE]);
  assert.deepEqual(result.semantic, { eligible: 2, indexed: 0, pending: 2 });
  assert.equal(result.moments[0].id, 'moment-1');
  const { failed, pending, dropped } = index.status();
  assert.deepEqual({ failed, pending, dropped }, { failed: 2, pending: 2, dropped: 0 });
  assert.equal(embeddings.calls.length, 2);
  await clock.advance(2000);
  assert.deepEqual(embeddings.calls[2].texts, scene.map(passageText));
});

test('hybrid ranking names the passages still waiting for a vector; aborting the question rejects without cancelling the index', async () => {
  const { clock, embeddings, index, search } = setup({ embeddings: provider({ manual: true }) });
  index.observe([scene[0]]);
  await clock.advance(6000);
  embeddings.calls[0].resolve(); await tick();
  let result; search.search({ query: 'chien', segments: scene, anchorMs: 16000 }).then(value => { result = value; });
  await clock.advance(1500);
  assert.deepEqual(embeddings.calls.map(call => call.texts), [[passageText(scene[0])], [passageText(scene[1])], ['chien']]);
  embeddings.calls[2].resolve(); await tick();
  assert.equal(result.mode, 'hybrid');
  assert.deepEqual(result.warnings, ['1 passage(s) pas encore indexé(s) : classement textuel pour eux.']);
  assert.deepEqual(result.semantic, { eligible: 2, indexed: 1, pending: 1 });
  assert.deepEqual(result.moments.map(moment => [moment.id, moment.score]), [['moment-1', 1], ['moment-2', 0]]);

  const controller = new AbortController();
  const cancelled = search.search({ query: 'chien', segments: scene, anchorMs: 16000, signal: controller.signal });
  await tick();
  controller.abort(Error('Annulée'));
  await assert.rejects(cancelled, /Annulée/);
  assert.equal(embeddings.calls[1].signal.aborted, false);
  assert.equal(index.status().inFlight, 1);
  assert.equal(clock.armed, 0);
  embeddings.calls[1].resolve(); await tick();
  assert.equal(index.status().indexed, 2);
});

test('settle is true as soon as the requested passages are indexed, false at the budget, and only bounds the wait', async () => {
  const { clock, embeddings, index } = setup({ embeddings: provider({ manual: true }) });
  assert.equal(await index.settle(1500), true);
  // Background work on hold is not waited for; once a question needs the passage, the hold is skipped.
  index.observe([passage(1)]); await tick();
  assert.equal(await index.settle(1500), true);
  index.request([passage(1)]);
  let first; index.settle(1500).then(value => { first = value; });
  await clock.advance(1500);
  assert.equal(first, false);
  assert.deepEqual(embeddings.calls.map(call => call.texts), [['Passage 1']]);
  assert.equal(embeddings.calls[0].signal.aborted, false);
  let second; index.settle(1500).then(value => { second = value; });
  await clock.advance(1000);
  assert.equal(second, undefined);
  embeddings.calls[0].resolve(); await tick();
  assert.equal(second, true);
  assert.equal(index.status().indexed, 1);
});

test('the queue is bounded: overflow drops the oldest background entry first and counts it', async () => {
  const { clock, embeddings, index } = setup({ maxPending: 3 });
  index.observe([1, 2, 3, 4, 5].map(n => passage(n))); await tick();
  let { pending, dropped } = index.status();
  assert.deepEqual({ pending, dropped }, { pending: 3, dropped: 2 });
  await clock.advance(6000);
  assert.deepEqual(embeddings.calls.map(call => call.texts), [['Passage 3', 'Passage 4', 'Passage 5']]);

  // What a question waits for is not evicted while a background entry can be: here the oldest pending entry is requested.
  const busy = setup({ embeddings: provider({ manual: true }), maxPending: 2 });
  busy.index.request([passage(1)]); await tick();
  busy.index.request([passage(2)]); busy.index.observe([passage(3)]); busy.index.request([passage(4)]); await tick();
  ({ pending, dropped } = busy.index.status());
  assert.deepEqual({ pending, dropped }, { pending: 2, dropped: 1 });
  busy.embeddings.calls[0].resolve(); await tick();
  assert.deepEqual(busy.embeddings.calls.map(call => call.texts), [['Passage 1'], ['Passage 2', 'Passage 4']]);
  busy.index.close();
});

test('failures are retried with backoff at most maxAttempts times, then dropped; only a question re-arms a dropped text', async () => {
  const { clock, embeddings, index } = setup({ embeddings: provider({ fail: true }) });
  index.observe([passage(1)]);
  await clock.advance(6000);
  assert.equal(embeddings.calls.length, 1);
  await clock.advance(1999);
  assert.equal(embeddings.calls.length, 1);
  await clock.advance(1);
  assert.equal(embeddings.calls.length, 2);
  await clock.advance(3999);
  assert.equal(embeddings.calls.length, 2);
  await clock.advance(1);
  assert.equal(embeddings.calls.length, 3);
  let { failed, dropped, pending } = index.status();
  assert.deepEqual({ failed, dropped, pending }, { failed: 3, dropped: 1, pending: 0 });
  assert.equal(clock.armed, 0);
  index.observe([passage(1)]);
  await clock.advance(120000);
  assert.equal(embeddings.calls.length, 3);
  assert.equal(index.status().dropped, 1);
  index.request([passage(1)]); await tick();
  assert.equal(embeddings.calls.length, 4);

  // 2 s, doubling, capped at 60 s.
  const patient = setup({ embeddings: provider({ fail: true }), maxAttempts: 7 });
  patient.index.observe([passage(1)]);
  await patient.clock.advance(6000);
  for (const [attempt, delay] of [2000, 4000, 8000, 16000, 32000, 60000].entries()) {
    await patient.clock.advance(delay - 1);
    assert.equal(patient.embeddings.calls.length, attempt + 1);
    await patient.clock.advance(1);
    assert.equal(patient.embeddings.calls.length, attempt + 2);
  }
  ({ failed, dropped, pending } = patient.index.status());
  assert.deepEqual({ failed, dropped, pending }, { failed: 7, dropped: 1, pending: 0 });
});

test('concurrent identical embedCached calls share one provider call and one caller’s abort does not fail the other', async () => {
  const { embeddings, cache, index } = setup({ embeddings: provider({ manual: true }) });
  const a = new AbortController(), b = new AbortController();
  const first = index.embedCached('moment-1', 'même texte', a.signal), second = index.embedCached('moment-2', 'même texte', b.signal);
  await tick();
  assert.equal(embeddings.calls.length, 1);
  a.abort(Error('Annulée'));
  await assert.rejects(first, /Annulée/);
  assert.equal(embeddings.calls[0].signal.aborted, false);
  embeddings.calls[0].resolve();
  assert.deepEqual(await second, vector('même texte'));
  assert.deepEqual([...cache.entries.keys()], ['moment-2']);
  // Once every caller has left, the provider call is aborted and its late answer is not cached.
  const c = new AbortController(), third = index.embedCached('moment-3', 'autre texte', c.signal);
  await tick();
  c.abort(Error('Annulée'));
  await assert.rejects(third, /Annulée/);
  assert.equal(embeddings.calls[1].signal.aborted, true);
  embeddings.calls[1].resolve(); await tick();
  assert.deepEqual([...cache.entries.keys()], ['moment-2']);
});

test('two concurrent searches make one passage call and one query call', async () => {
  const { embeddings, search } = setup();
  const input = { query: 'chien', segments: scene, anchorMs: 16000 };
  const [one, two] = await Promise.all([search.search(input), search.search(input)]);
  assert.deepEqual(embeddings.calls.map(call => call.texts), [scene.map(passageText), ['chien']]);
  assert.deepEqual(one, two);
  assert.equal(one.mode, 'hybrid');
});

test('search never requests, reads or returns a passage after the anchor, even when the index already holds it', async () => {
  const { clock, embeddings, index, search } = setup();
  const past = { id: 'past', startMs: 0, endMs: 8000, observation: { summary: 'Un chien dort.' } };
  const future = { id: 'future', startMs: 8000, endMs: 16000, observation: { summary: 'Un chat futur arrive.' } };
  const blank = { id: 'blank', startMs: 0, endMs: 8000, status: 'queued' };
  index.observe([past, future]);
  await clock.advance(6000);
  assert.ok(await index.passageVector(future));
  const requested = [], read = [], request = index.request.bind(index), passageVector = index.passageVector.bind(index);
  index.request = passages => { requested.push(passages.map(p => p.id)); request(passages); };
  index.passageVector = segment => { read.push(segment.id); return passageVector(segment); };
  const result = await search.search({ query: 'chat futur', segments: [past, blank, future], anchorMs: 8000 });
  assert.deepEqual(requested, [['past', 'blank']]);
  assert.deepEqual(read, ['past']);
  assert.deepEqual(result.moments.map(moment => moment.id), ['past', 'blank']);
  // A passage without text cannot be indexed: it is neither counted nor reported as waiting.
  assert.deepEqual(result.semantic, { eligible: 1, indexed: 1, pending: 0 });
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(embeddings.calls.map(call => call.texts), [[passageText(past), passageText(future)], ['chat futur']]);
  const temporal = await search.search({ query: 'il y a deux secondes', segments: [past, future], anchorMs: 8000 });
  assert.deepEqual(temporal, { mode: 'time', moments: temporal.moments, warnings: [] });
  assert.equal(embeddings.calls.length, 2);
});

test('a legacy index with only ensure keeps the blocking path; no index means lexical without warning', async () => {
  const ensured = [];
  const legacy = { ensure: async segments => { ensured.push(segments.map(s => s.id)); }, queryVector: async () => [0, 1], passageVector: async segment => vector(passageText(segment)) };
  const input = { query: 'chien', segments: [...scene, passage(3, 'Un chien futur.')], anchorMs: 16000 };
  const result = await new MomentSearch({ index: legacy }).search(input);
  assert.deepEqual(ensured, [['moment-1', 'moment-2']]);
  assert.equal(result.mode, 'hybrid');
  assert.deepEqual(result.semantic, { eligible: 2, indexed: 2, pending: 0 });
  const bare = await new MomentSearch({}).search(input);
  assert.equal(bare.mode, 'lexical');
  assert.deepEqual(bare.warnings, []);
  assert.deepEqual(bare.semantic, { eligible: 2, indexed: 0, pending: 0 });
});

test('feeding the index can never fail the caller: malformed input and an unreadable cache are absorbed', async () => {
  const cache = memoryCache(); cache.get = async () => { throw Error('cache illisible'); };
  const { clock, embeddings, index } = setup({ cache });
  for (const input of [undefined, null, [null], [{}], 'texte']) assert.doesNotThrow(() => { index.observe(input); index.request(input); });
  index.observe([passage(1)]);
  await clock.advance(6000);
  assert.deepEqual(embeddings.calls.map(call => call.texts), [['Passage 1']]);
  assert.equal(index.status().indexed, 1);
  for (const value of Object.values(index.status())) assert.ok(['number', 'boolean'].includes(typeof value));
});

const embedding = text => Array.from({ length: 8 }, (_, i) => text.charCodeAt(0) + i / 10);
function openRouter() {
  const requests = [], reserved = [], settled = [];
  const state = { requests, reserved, settled, reply: body => ({ ok: true, status: 200, json: async () => ({ data: [].concat(body.input).map((text, index) => ({ index, embedding: embedding(text) })).reverse(), usage: { cost: 0.00001 } }) }) };
  state.embeddings = new OpenRouterEmbeddings({ apiKey: 'test-key',
    budget: { reserve: model => { reserved.push(model); return `reservation-${reserved.length}`; }, settle: (id, cost) => settled.push([id, cost]) },
    fetchImpl: async (url, options) => { const body = JSON.parse(options.body); requests.push({ url, options, body }); return state.reply(body); } });
  return state;
}

test('OpenRouterEmbeddings.embedMany sends one request with one reservation and returns vectors in input order', async () => {
  const state = openRouter(), { embeddings, requests, reserved, settled } = state;
  assert.deepEqual(await embeddings.embedMany(['a', 'b', 'c']), [embedding('a'), embedding('b'), embedding('c')]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://openrouter.ai/api/v1/embeddings');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-key');
  assert.ok(requests[0].options.signal instanceof AbortSignal);
  assert.deepEqual(requests[0].body, { model: 'openai/text-embedding-3-small', input: ['a', 'b', 'c'], encoding_format: 'float', provider: { max_price: { prompt: 0.02 } } });
  assert.deepEqual(reserved, ['openai/text-embedding-3-small']);
  assert.deepEqual(settled, [['reservation-1', 0.00001]]);
  // Cached texts are not sent again and a repeated text is sent once.
  assert.deepEqual(await embeddings.embedMany(['c', 'd', 'a', 'd']), [embedding('c'), embedding('d'), embedding('a'), embedding('d')]);
  assert.deepEqual(requests[1].body.input, ['d']);
  assert.deepEqual(await embeddings.embedMany(['a', 'd']), [embedding('a'), embedding('d')]);
  assert.deepEqual(await embeddings.embedMany([]), []);
  assert.equal(requests.length, 2);
  // embed() shares the cache and keeps its single-string request.
  assert.deepEqual(await embeddings.embed('b'), embedding('b'));
  assert.equal(requests.length, 2);
  assert.deepEqual(await embeddings.embed('z'), embedding('z'));
  assert.equal(requests[2].body.input, 'z');
  assert.deepEqual(reserved.length, 3);
  assert.deepEqual(settled.map(([id]) => id), ['reservation-1', 'reservation-2', 'reservation-3']);
});

test('OpenRouterEmbeddings.embedMany enforces its limits before any request and rejects an invalid response as a whole', async () => {
  const state = openRouter(), { embeddings, requests, reserved, settled } = state;
  await assert.rejects(embeddings.embedMany(Array.from({ length: 33 }, (_, i) => `texte ${i}`)), /Au plus 32 textes/);
  await assert.rejects(embeddings.embedMany(Array.from({ length: 9 }, (_, i) => String(i).repeat(6000))), /48000 octets/);
  for (const invalid of [' ', '', 3, 'x'.repeat(6001), 'é'.repeat(3001)]) await assert.rejects(embeddings.embedMany(['valide', invalid]), /Texte trop volumineux/);
  await assert.rejects(embeddings.embedMany('texte'), /Au plus 32 textes/);
  const aborted = new AbortController(); aborted.abort(Error('Annulée'));
  await assert.rejects(embeddings.embedMany(['valide'], aborted.signal), /Annulée/);
  assert.equal(requests.length, 0);
  assert.equal(reserved.length, 0);
  assert.equal((await embeddings.embedMany(Array.from({ length: 32 }, (_, i) => String.fromCharCode(65 + i).repeat(1500)))).length, 32);
  assert.equal(requests.length, 1);

  const valid = state.reply;
  state.reply = body => ({ ok: true, json: async () => ({ data: body.input.map((text, index) => ({ index, embedding: index ? [1, 2] : embedding(text) })) }) });
  await assert.rejects(embeddings.embedMany(['p', 'q']), /Embedding invalide/);
  state.reply = body => ({ ok: true, json: async () => ({ data: [{ index: 0, embedding: embedding(body.input[0]) }] }) });
  await assert.rejects(embeddings.embedMany(['p', 'q']), /incomplète/);
  state.reply = body => ({ ok: true, json: async () => ({ data: body.input.map(text => ({ index: 0, embedding: embedding(text) })) }) });
  await assert.rejects(embeddings.embedMany(['p', 'q']), /Embedding invalide/);
  state.reply = () => ({ ok: false, status: 503 });
  await assert.rejects(embeddings.embedMany(['p', 'q']), /HTTP 503/);
  // One reservation per request; a refused request is never settled and nothing was cached.
  assert.equal(reserved.length, 5);
  assert.equal(settled.length, 4);
  state.reply = valid;
  assert.deepEqual(await embeddings.embedMany(['q', 'p']), [embedding('q'), embedding('p')]);
  assert.deepEqual(requests.at(-1).body.input, ['q', 'p']);
});

test('EmbeddingStore appends each batch to a log instead of rewriting every vector, and reloads the latest text per passage', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tvlens-embed-batch-'));
  try {
    const file = path.join(dir, 'cache.json');
    const store = new EmbeddingStore(file, 'model');
    await store.putMany([{ id: 'moment-1', text: 'Un', vector: [1] }, { id: 'moment-2', text: 'Deux', vector: [2] }, { id: 'moment-3', text: 'Trois', vector: [3] }]);
    const first = await fsp.readFile(file, 'utf8');
    assert.deepEqual(first.trim().split('\n').map(line => JSON.parse(line)), [{ model: 'model' }, { id: 'moment-1', text: 'Un', vector: [1] }, { id: 'moment-2', text: 'Deux', vector: [2] }, { id: 'moment-3', text: 'Trois', vector: [3] }]);
    // Concurrent writers: lines never interleave and nothing already written is touched again.
    await Promise.all([store.put('moment-4', 'Quatre', [4]), store.putMany([{ id: 'moment-5', text: 'Cinq', vector: [5] }, { id: 'moment-6', text: 'Six', vector: [6] }]), store.put('moment-1', 'Un bis', [11])]);
    const second = await fsp.readFile(file, 'utf8');
    assert.ok(second.startsWith(first), 'earlier vectors are not rewritten');
    assert.deepEqual(second.slice(first.length).trim().split('\n').map(line => JSON.parse(line).id), ['moment-4', 'moment-5', 'moment-6', 'moment-1']);
    assert.deepEqual(await store.get('moment-6', 'Six'), [6]);
    // A crash in the middle of an append leaves a torn last line: it is skipped, the rest is kept.
    await fsp.appendFile(file, '{"id":"moment-9","text":"Neuf","vec');
    const reloaded = new EmbeddingStore(file, 'model');
    for (const [id, text, value] of [['moment-1', 'Un bis', [11]], ['moment-2', 'Deux', [2]], ['moment-4', 'Quatre', [4]], ['moment-5', 'Cinq', [5]], ['moment-6', 'Six', [6]]]) assert.deepEqual(await reloaded.get(id, text), value);
    assert.equal(await reloaded.get('moment-9', 'Neuf'), null);
    assert.deepEqual(await reloaded.get('moment-8', 'Deux'), [2], 'an identical description is reused whatever the passage');
    // Another model never reads these vectors and restarts the log at its first write.
    const other = new EmbeddingStore(file, 'other');
    assert.equal(await other.get('moment-2', 'Deux'), null);
    await other.put('moment-2', 'Deux', [22]);
    assert.deepEqual((await fsp.readFile(file, 'utf8')).trim().split('\n').map(line => JSON.parse(line)), [{ model: 'other' }, { id: 'moment-2', text: 'Deux', vector: [22] }]);
    assert.deepEqual((await fsp.readdir(dir)).sort(), ['cache.json']);
  } finally { await fsp.rm(dir, { recursive: true, force: true }); }
});

test('EmbeddingStore reads the former single-object file and continues it as a log', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tvlens-embed-former-'));
  try {
    const file = path.join(dir, 'cache.json');
    await fsp.writeFile(file, JSON.stringify({ model: 'model', entries: { 'moment-1': { text: 'Ancien', vector: [1, 2] } } }));
    const store = new EmbeddingStore(file, 'model');
    assert.deepEqual(await store.get('moment-1', 'Ancien'), [1, 2]);
    await store.put('moment-2', 'Nouveau', [3, 4]);
    assert.deepEqual((await fsp.readFile(file, 'utf8')).trim().split('\n').map(line => JSON.parse(line)), [{ model: 'model' }, { id: 'moment-1', text: 'Ancien', vector: [1, 2] }, { id: 'moment-2', text: 'Nouveau', vector: [3, 4] }]);
    const reloaded = new EmbeddingStore(file, 'model');
    assert.deepEqual(await reloaded.get('moment-1', 'Ancien'), [1, 2]);
    assert.deepEqual(await reloaded.get('moment-2', 'Nouveau'), [3, 4]);
  } finally { await fsp.rm(dir, { recursive: true, force: true }); }
});

async function diagnosticCache(t, raw, options = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tvlens-cache-diagnostic-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'private-cache.json'), diagnostics = [];
  if (raw !== undefined) await fsp.writeFile(file, raw);
  const cache = new EmbeddingStore(file, 'model', { onDiagnostic: event => diagnostics.push(event), ...options });
  return { file, cache, diagnostics };
}

test('an unreadable embedding header announces necessary rebuilding once and search can retain newly requested vectors', async t => {
  const { file, cache, diagnostics } = await diagnosticCache(t, '{private-header');
  assert.equal(await cache.get('moment-1', 'contenu privé'), null);
  assert.equal(diagnostics.length, 1, 'loading must announce the missing cache before any provider work');
  assert.deepEqual(diagnostics[0], {
    code: 'TVLENS_EMBEDDING_CACHE_LOAD', cause: 'invalid-header', rebuild: 'total', providerCallsPossible: true,
    message: 'Cache d’embeddings inutilisable : reconstruction nécessaire ; nouveaux appels au fournisseur possibles pour les vecteurs demandés.',
  });
  const { embeddings, index, search } = setup({ cache });
  t.after(() => index.close());
  assert.equal(embeddings.calls.length, 0);
  const input = { query: 'chien', segments: scene, anchorMs: 16000 };
  const result = await search.search(input);
  assert.equal(result.mode, 'hybrid');
  assert.deepEqual(result.semantic, { eligible: 2, indexed: 2, pending: 0 });
  assert.deepEqual(embeddings.calls.map(call => call.texts), [scene.map(passageText), ['chien']]);
  assert.deepEqual(await search.search(input), result);
  assert.equal(embeddings.calls.length, 2);
  assert.deepEqual(await new EmbeddingStore(file, 'model').get(scene[0].id, passageText(scene[0])), vector(passageText(scene[0])));
  assert.equal(diagnostics.length, 1, 'get and put do not repeat the load diagnostic');
});

test('an injected embedding read refusal announces its stable cause without exposing the disk error and search stays available', async t => {
  let reads = 0;
  const { file, cache, diagnostics } = await diagnosticCache(t, undefined, {
    readFile: async () => {
      reads++;
      throw Object.assign(Error('secret-key /private/path contenu privé [9123,4567]'), { code: 'EACCES' });
    },
  });
  assert.equal(await cache.get('moment-1', 'contenu privé'), null);
  assert.equal(diagnostics[0]?.cause, 'read-failed');
  assert.equal(diagnostics[0].code, 'TVLENS_EMBEDDING_CACHE_LOAD');
  assert.equal(diagnostics[0].rebuild, 'total');
  assert.equal(diagnostics[0].providerCallsPossible, true);
  assert.doesNotMatch(JSON.stringify(diagnostics), /secret-key|private\/path|contenu privé|9123|4567/);
  const { embeddings, index, search } = setup({ cache });
  t.after(() => index.close());
  assert.equal(embeddings.calls.length, 0);
  const input = { query: 'chien', segments: scene, anchorMs: 16000 };
  assert.equal((await search.search(input)).mode, 'hybrid');
  assert.equal((await search.search(input)).mode, 'hybrid');
  assert.deepEqual(embeddings.calls.map(call => call.texts), [scene.map(passageText), ['chien']]);
  assert.deepEqual(await new EmbeddingStore(file, 'model').get(scene[0].id, passageText(scene[0])), vector(passageText(scene[0])));
  assert.equal(reads, 1);
  assert.equal(diagnostics.length, 1);
});

test('a structurally interrupted embedding log reports partial recovery and only missing vectors are requested before a readable rewrite', async t => {
  const kept = { id: scene[0].id, text: passageText(scene[0]), vector: [0, 1] };
  const late = { id: scene[1].id, text: passageText(scene[1]), vector: [1, 0] };
  const raw = [JSON.stringify({ model: 'model' }), JSON.stringify(kept), 'null', JSON.stringify(late), ''].join('\n');
  const { file, cache, diagnostics } = await diagnosticCache(t, raw);
  assert.deepEqual(await cache.get(kept.id, kept.text), kept.vector);
  assert.equal(await cache.get(late.id, late.text), null, 'the existing structural interruption does not salvage later rows');
  assert.equal(diagnostics[0]?.cause, 'invalid-entry');
  assert.equal(diagnostics[0].rebuild, 'partial');
  assert.equal(diagnostics[0].providerCallsPossible, true);
  assert.match(diagnostics[0].message, /Récupération partielle/);
  const { embeddings, index } = setup({ cache });
  t.after(() => index.close());
  assert.equal(embeddings.calls.length, 0, 'loading does not initiate rebuilding');
  assert.equal(await fsp.readFile(file, 'utf8'), raw, 'loading does not rewrite the file');
  await index.ensure(scene);
  await index.ensure(scene);
  assert.deepEqual(embeddings.calls.map(call => call.texts), [[late.text]]);
  assert.equal(diagnostics.length, 1);
  const lines = (await fsp.readFile(file, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(lines, [{ model: 'model' }, kept, late]);
  const reloaded = new EmbeddingStore(file, 'model');
  assert.deepEqual(await reloaded.get(kept.id, kept.text), kept.vector);
  assert.deepEqual(await reloaded.get(late.id, late.text), late.vector);
});

test('embedding cache loading distinguishes normal creation, incompatible models, migration and tolerated damaged rows', async t => {
  const entry = { id: 'moment-1', text: 'texte confidentiel', vector: [9123, 4567] };
  const header = JSON.stringify({ model: 'model' });
  const log = header + '\n' + JSON.stringify(entry) + '\n';
  const cases = [
    { name: 'missing file', raw: undefined, cause: 'missing', rebuild: 'total', kept: false },
    { name: 'valid log', raw: log, kept: true },
    { name: 'valid log without final newline', raw: log.trimEnd(), kept: true },
    { name: 'torn last row', raw: log + '{"secret-key', cause: 'invalid-json-line', rebuild: 'partial', kept: true },
    { name: 'different model', raw: log.replace('model"}', 'other"}'), cause: 'model-mismatch', rebuild: 'total', kept: false },
    {
      name: 'former object format', raw: JSON.stringify({ model: 'model', entries: { 'moment-1': entry } }),
      cause: 'legacy-format', rebuild: 'rewrite', kept: true,
    },
    { name: 'null header', raw: 'null\n', cause: 'invalid-header', rebuild: 'total', kept: false },
    { name: 'header without model', raw: '{}\n', cause: 'invalid-header', rebuild: 'total', kept: false },
    { name: 'empty file', raw: '', cause: 'invalid-header', rebuild: 'total', kept: false },
    { name: 'invalid first row', raw: header + '\nnull\n', cause: 'invalid-entry', rebuild: 'total', kept: false },
    { name: 'skipped malformed row', raw: log + '{}\n', cause: 'invalid-entry', rebuild: 'partial', kept: true },
  ];
  for (const sample of cases) {
    await t.test(sample.name, async child => {
      const { file, cache, diagnostics } = await diagnosticCache(child, sample.raw);
      assert.deepEqual(await cache.get(entry.id, entry.text), sample.kept ? entry.vector : null);
      if (sample.cause) {
        assert.equal(diagnostics.length, 1);
        assert.deepEqual(Object.keys(diagnostics[0]).sort(), ['cause', 'code', 'message', 'providerCallsPossible', 'rebuild']);
        assert.equal(diagnostics[0].code, 'TVLENS_EMBEDDING_CACHE_LOAD');
        assert.equal(diagnostics[0].cause, sample.cause);
        assert.equal(diagnostics[0].rebuild, sample.rebuild);
        assert.equal(diagnostics[0].providerCallsPossible, sample.rebuild !== 'rewrite');
        assert.doesNotMatch(JSON.stringify(diagnostics), /texte confidentiel|9123|4567|secret-key|private-cache/);
        if (sample.cause === 'missing') {
          assert.match(diagnostics[0].message, /création normale/);
          assert.doesNotMatch(diagnostics[0].message, /inutilisable|corrompu/);
        }
      } else assert.deepEqual(diagnostics, []);
      const count = diagnostics.length;
      await cache.put('moment-2', 'Nouveau', [3, 4]);
      const reloaded = new EmbeddingStore(file, 'model');
      assert.deepEqual(await reloaded.get('moment-2', 'Nouveau'), [3, 4]);
      assert.deepEqual(await reloaded.get(entry.id, entry.text), sample.kept ? entry.vector : null);
      assert.equal(diagnostics.length, count);
    });
  }
});

test('a failed embedding diagnostic cannot reject cache loading or prevent a requested vector from being stored', async t => {
  let announcements = 0;
  const { cache } = await diagnosticCache(t, '{invalid', {
    onDiagnostic: () => {
      announcements++;
      throw Error('journal indisponible');
    },
  });
  await assert.doesNotReject(async () => assert.equal(await cache.get('moment-1', 'Un'), null));
  const { embeddings, index } = setup({ cache });
  t.after(() => index.close());
  await index.ensure([passage(1, 'Un')]);
  assert.deepEqual(await cache.get('moment-1', 'Un'), [1, 0]);
  assert.equal(embeddings.calls.length, 1);
  assert.equal(announcements, 1);
});
test('a steady stream is sent as a few passages per request once a flush interval is set, and a question never waits for it', async () => {
  const clock = manualClock({ turns: 6 });
  const batches = [], values = new Map();
  const index = new MomentIndex({ embeddings: { embedMany: async texts => { batches.push(texts); return texts.map(() => [1, 0]); } },
    cache: { get: async (id, text) => values.get(id + text) || null, putMany: async items => { for (const { id, text, vector } of items) values.set(id + text, vector); } },
    holdMs: 6000, flushMs: 30000, ...clock.io });
  // One passage every 8 s, as a live capture publishes them.
  const publish = async i => {
    await clock.advance(i * 8000 - clock.io.now());
    index.observe([{ id: `moment-${i + 1}`, observation: { summary: `Passage ${i + 1}` } }]);
  };
  for (let i = 0; i < 4; i++) await publish(i);
  await clock.advance(5999);
  assert.deepEqual(batches, [], 'nothing leaves before the first boundary');
  await clock.advance(1);
  assert.deepEqual(batches, [['Passage 1', 'Passage 2', 'Passage 3', 'Passage 4']], 'everything held long enough leaves together');
  for (let i = 4; i < 7; i++) await publish(i);
  // A question asks for the newest passages: they leave at once, without the hold or the boundary.
  index.request([{ id: 'moment-6', observation: { summary: 'Passage 6' } }, { id: 'moment-7', observation: { summary: 'Passage 7' } }]);
  assert.equal(await index.settle(1500), true);
  assert.deepEqual(batches[1], ['Passage 6', 'Passage 7']);
  await clock.advance(12000);
  assert.deepEqual(batches[2], ['Passage 5']);
  index.close();
});
