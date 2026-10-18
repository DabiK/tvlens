const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createSessionIndex } = require('../runtime/session-providers.cjs');
const { EmbeddingStore } = require('../adapters/embedding-store.cjs');
const { MomentIndex } = require('../core/moment-index.cjs');
const { MemorySearch } = require('../core/moment-search.cjs');

const vector = text => text.includes('chien') ? [0, 1] : [1, 0];
const segments = [
  { id: 'moment-1', startMs: 0, endMs: 8000, observation: { summary: 'Un chien court.' } },
  { id: 'moment-2', startMs: 8000, endMs: 16000, observation: { summary: 'Une voiture freine.' } },
];
async function backend(t, handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk)).on('end', () => {
      const request = { path: req.url, method: req.method, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) };
      requests.push(request);
      handler(request, res);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { requests, url: 'http://127.0.0.1:' + server.address().port };
}
function reply(res, body) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
async function directory(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-ollama-embeddings-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
function compose(t, root, config, overrides = {}, dependencies = {}) {
  const built = createSessionIndex({ config, store: { root }, userData: root, overrides }, {
    OpenRouterEmbeddings: class { constructor() { assert.fail('no remote provider may be constructed'); } },
    ...dependencies,
  });
  t.after(async () => { built.index?.close(); await built.vectors?.seal(); });
  return built;
}
const input = { query: 'chien', segments, anchorMs: 16000 };

test('local selection without an OpenRouter key indexes and searches through the real cache and a fake Ollama', async t => {
  const server = await backend(t, (req, res) => reply(res, {
    model: req.body.model, embeddings: req.body.input.map(vector), identity: 'spoofed', backend: 'spoofed',
  }));
  const root = await directory(t);
  const built = compose(t, root, { embeddingsBackend: 'local', localEmbeddings: {
    url: server.url + '/private', model: 'local-model', token: 'SECRET',
  } });
  assert.ok(built.index instanceof MomentIndex);
  assert.ok(built.vectors instanceof EmbeddingStore);
  assert.ok(built.search instanceof MemorySearch);
  assert.equal(server.requests.length, 0, 'construction performs no inference');
  const result = await built.search.search(input);
  assert.equal(result.mode, 'hybrid');
  assert.equal(result.moments[0].id, 'moment-1');
  assert.deepEqual(result.semantic, { eligible: 2, indexed: 2, pending: 0 });
  assert.deepEqual(server.requests.map(req => req.body.input), [segments.map(s => s.observation.summary), ['chien']]);
  for (const req of server.requests) {
    assert.equal(req.path, '/private/api/embed');
    assert.equal(req.method, 'POST');
    assert.equal(req.headers.authorization, 'Bearer SECRET');
    assert.deepEqual(req.body, { model: 'local-model', input: req.body.input, truncate: false });
  }
  assert.equal(result.embeddings.backend, 'ollama');
  assert.equal(result.embeddings.model, 'local-model');
  assert.equal(result.embeddings.identity, built.embeddingDiagnostics.identity);
  assert.doesNotMatch(JSON.stringify(result.embeddings), /spoofed|SECRET|private|127.0.0.1/);
  assert.equal((await built.search.search(input)).mode, 'hybrid');
  assert.equal(server.requests.length, 2);
});

test('reopening the same local configuration rebuilds mutable-tag vectors in a fresh cache and preserves historical files', async t => {
  let reopened = false;
  const server = await backend(t, (req, res) => reply(res, {
    model: req.body.model, embeddings: req.body.input.map(text => reopened ? vector(text).reverse() : vector(text)),
  }));
  const root = await directory(t);
  const historicalFile = path.join(root, 'embeddings.json');
  const historical = JSON.stringify({ model: 'openai/text-embedding-3-small' }) + '\n'
    + JSON.stringify({ id: 'historical', text: 'Cache historique.', vector: [1, 0] }) + '\n';
  await fs.writeFile(historicalFile, historical);
  const config = { embeddingsBackend: 'local', localEmbeddings: { url: server.url, model: 'mutable-tag' } };
  const first = compose(t, root, config);
  first.index.request(segments);
  assert.equal(await first.index.settle(Infinity), true);
  const initial = await first.search.search(input);
  assert.equal(initial.mode, 'hybrid');
  assert.deepEqual(initial.semantic, { eligible: 2, indexed: 2, pending: 0 });
  assert.deepEqual(await first.index.passageVector(segments[0]), [0, 1]);
  const texts = segments.map(segment => segment.observation.summary);
  assert.deepEqual(server.requests.map(req => req.body.input), [texts, ['chien']]);
  first.index.close();
  await first.vectors.seal();
  const original = await fs.readFile(first.vectors.file, 'utf8');

  reopened = true;
  const second = compose(t, root, config);
  assert.equal(await second.index.passageVector(segments[0]), null, 'a mutable tag cannot prove persistent vector compatibility');
  assert.equal(server.requests.length, 2, 'opening and checking the cache perform no inference');
  assert.notEqual(second.vectors.file, first.vectors.file);
  assert.notEqual(second.embeddingDiagnostics.identity, first.embeddingDiagnostics.identity);
  const result = await second.search.search(input);
  assert.equal(result.mode, 'hybrid');
  assert.deepEqual(result.semantic, { eligible: 2, indexed: 2, pending: 0 });
  assert.deepEqual(await second.index.passageVector(segments[0]), [1, 0]);
  assert.deepEqual(await second.index.passageVector(segments[1]), [0, 1]);
  assert.deepEqual(await second.index.queryVector(input.query), [1, 0]);
  assert.deepEqual(server.requests.slice(2).map(req => req.body.input), [texts, ['chien']]);
  for (const request of server.requests) {
    assert.equal(request.path, '/api/embed');
    assert.equal(request.body.model, 'mutable-tag');
  }
  assert.equal(await fs.readFile(first.vectors.file, 'utf8'), original);
  assert.equal(await fs.readFile(historicalFile, 'utf8'), historical);
  assert.deepEqual((await fs.readdir(root)).sort(), [
    'embeddings.json', path.basename(first.vectors.file), path.basename(second.vectors.file),
  ].sort());
});

const { OllamaEmbeddings } = require('../adapters/embeddings/ollama-embeddings.cjs');
const { deferred } = require('./helpers/wait.cjs');
function fakeProvider(handler, extra = {}) {
  const calls = [];
  const provider = new OllamaEmbeddings({ url: 'http://local.invalid/private', model: 'local-model', ...extra,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body.input);
      const value = await handler(body, options);
      return { ok: true, text: async () => JSON.stringify(value) };
    } });
  return { provider, calls };
}
const validReply = body => ({ model: body.model, embeddings: body.input.map(vector) });

test('mixed cache hits and misses retain input order even when new results evict older cache entries', async () => {
  const { provider, calls } = fakeProvider(validReply);
  for (let batch = 0; batch < 8; batch++) await provider.embedMany(Array.from({ length: 32 }, (_, i) => `text-${batch * 32 + i}`));
  const texts = ['text-0', 'chien nouveau', 'text-0', 'nouveau', 'chien nouveau'];
  assert.deepEqual(await provider.embedMany(texts), texts.map(vector));
  assert.deepEqual(calls.at(-1), ['chien nouveau', 'nouveau']);
});

test('invalid embedding batches are rejected atomically before any text enters the adapter cache', async t => {
  for (const bad of [body => ({ model: body.model, embeddings: [[1, 0]] }),
    body => ({ model: body.model, embeddings: [[1, 0], [0, NaN]] }),
    body => ({ model: body.model, embeddings: [[1, 0], [0, 1, 0]] })]) {
    await t.test(String(bad), async () => {
      let invalid = true;
      const { provider, calls } = fakeProvider(body => invalid ? bad(body) : validReply(body));
      await assert.rejects(provider.embedMany(['voiture', 'chien']), { code: 'TVLENS_EMBEDDINGS_RESPONSE_INVALID' });
      invalid = false;
      assert.deepEqual(await provider.embedMany(['chien', 'voiture']), [[0, 1], [1, 0]]);
      assert.deepEqual(calls, [['voiture', 'chien'], ['chien', 'voiture']]);
      assert.deepEqual(await provider.embedMany(['voiture', 'chien', 'chien']), [[1, 0], [0, 1], [0, 1]]);
      assert.equal(calls.length, 2);
    });
  }
});

test('a dimension change across successful batches rejects all new vectors and retains earlier cache hits', async () => {
  let dimension = 2;
  const { provider, calls } = fakeProvider(body => ({ model: body.model, embeddings: body.input.map(() => Array(dimension).fill(1)) }));
  await provider.embed('ancien');
  dimension = 3;
  await assert.rejects(provider.embedMany(['nouveau', 'autre']), { code: 'TVLENS_EMBEDDINGS_RESPONSE_INVALID' });
  dimension = 2;
  await provider.embedMany(['ancien', 'autre', 'nouveau']);
  assert.deepEqual(calls, [['ancien'], ['nouveau', 'autre'], ['autre', 'nouveau']]);
});

test('a model change announced by Ollama invalidates the index and cannot be disguised by payload metadata', async t => {
  let changed = false;
  const server = await backend(t, (req, res) => reply(res, { ...validReply(req.body), model: changed ? 'other-model' : req.body.model,
    identity: { backend: 'openrouter', model: 'local-model' } }));
  const root = await directory(t);
  const built = compose(t, root, { embeddingsBackend: 'local', localEmbeddings: { url: server.url, model: 'local-model' } });
  await built.index.ensure(segments);
  changed = true;
  await assert.rejects(built.index.queryVector('nouvelle question'), { code: 'TVLENS_EMBEDDINGS_IDENTITY_CHANGED' });
  const count = server.requests.length;
  const result = await built.search.search(input);
  assert.equal(result.mode, 'lexical');
  assert.equal(result.warnings.length, 1);
  assert.equal(server.requests.length, count);
  assert.equal(result.embeddings.backend, 'ollama');
});

test('local batches enforce text and byte bounds and cancellation before any HTTP request', async () => {
  const { provider, calls } = fakeProvider(validReply);
  for (const texts of ['text', [''], [' '], [1], ['x'.repeat(6001)], ['é'.repeat(3001)],
    Array(33).fill('text'), Array(9).fill('x'.repeat(6000))]) {
    await assert.rejects(provider.embedMany(texts), { code: 'TVLENS_EMBEDDINGS_INPUT_INVALID' });
  }
  const abort = new AbortController();
  abort.abort(Error('Annulée'));
  await assert.rejects(provider.embed('chien', abort.signal), /Annulée/);
  assert.deepEqual(await provider.embedMany([]), []);
  assert.deepEqual(calls, []);
  assert.equal((await provider.embedMany(Array(32).fill('x'.repeat(1500)))).length, 32);
  assert.equal(calls.length, 1);
});

test('late replies after cancellation or closure write no abandoned vector and cannot recreate a sealed directory', async t => {
  for (const action of ['abort', 'close']) {
    await t.test(action, async child => {
      const root = await directory(child);
      const entered = deferred(), returned = deferred();
      let held = true;
      const { provider, calls } = fakeProvider(async body => {
        entered.resolve();
        if (held) await returned.promise;
        return validReply(body);
      });
      const built = compose(child, root, {}, { embeddings: provider });
      const abort = new AbortController();
      const pending = built.index.ensure(segments, abort.signal);
      const rejected = assert.rejects(pending);
      await entered.promise;
      if (action === 'abort') abort.abort(Error('Annulée'));
      else built.index.close();
      await built.vectors.seal();
      await fs.rm(root, { recursive: true, force: true });
      held = false;
      returned.resolve();
      await rejected;
      await assert.rejects(fs.access(root), { code: 'ENOENT' });
      assert.deepEqual(await provider.embed(segments[0].observation.summary), [0, 1]);
      assert.equal(calls.length, 2, 'the abandoned reply did not populate the adapter cache');
    });
  }
});

test('an injected deadline rejects a late local response without caching it', async () => {
  const entered = deferred(), returned = deferred();
  let deadline = new AbortController(), held = true;
  const { provider, calls } = fakeProvider(async body => {
    entered.resolve();
    if (held) await returned.promise;
    return validReply(body);
  }, { timeoutSignal: () => deadline.signal });
  const pending = provider.embed('chien');
  const rejected = assert.rejects(pending, { name: 'TimeoutError' });
  await entered.promise;
  deadline.abort(new DOMException('Échéance', 'TimeoutError'));
  returned.resolve();
  await rejected;
  deadline = new AbortController();
  held = false;
  await provider.embed('chien');
  assert.equal(calls.length, 2);
});

test('local HTTP failure retains lexical ranking and warnings and reports the actual backend and mode in search traces', async t => {
  const server = await backend(t, (_req, res) => { res.writeHead(503); res.end('SECRET http://private.invalid/internal'); });
  const root = await directory(t), traces = [];
  const built = createSessionIndex({ config: { embeddingsBackend: 'local', localEmbeddings: {
    url: server.url + '/private', model: 'local-model', token: 'SECRET',
  } }, userData: root, store: { root }, overrides: {}, log: line => traces.push(JSON.parse(line)) }, {
    OpenRouterEmbeddings: class { constructor() { assert.fail('no remote fallback'); } },
  });
  t.after(async () => { built.index.close(); await built.vectors.seal(); });
  const result = await built.search.search(input);
  assert.equal(result.mode, 'lexical');
  assert.equal(result.moments[0].id, 'moment-1');
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /indisponible/);
  assert.deepEqual(result.semantic, { eligible: 2, indexed: 0, pending: 2 });
  assert.deepEqual(built.search.lastEmbeddingTrace, {
    code: 'TVLENS_EMBEDDINGS_SEARCH', ...result.embeddings, mode: 'lexical',
  });
  assert.equal(traces.some(event => event.code === 'TVLENS_EMBEDDINGS_SEARCH'), false, 'search traces are not host errors');
  assert.doesNotMatch(JSON.stringify(built.search.lastEmbeddingTrace), /SECRET|private|127.0.0.1|Un chien|voiture/);
  assert.doesNotMatch(JSON.stringify(traces), /SECRET|private|127.0.0.1|Un chien|voiture/);
  assert.equal(server.requests.length, 2);
});

test('opening an archive with local embeddings performs no inference until an explicit search', async t => {
  const { emptyArchive } = require('./helpers/empty-archive.cjs');
  const { SessionLibrary } = require('../adapters/session-library.cjs');
  const { openArchivedSession } = require('../runtime/session-runtime.cjs');
  const root = await directory(t);
  const archive = await emptyArchive(root, 'server');
  const snapshotFile = path.join(archive.dir, 'session.json');
  const snapshot = JSON.parse(await fs.readFile(snapshotFile, 'utf8'));
  snapshot.segments = segments.map(segment => ({ ...segment, status: 'ready', audioStatus: 'ready', visionStatus: 'ready' }));
  snapshot.elapsedMs = 16000;
  await fs.writeFile(snapshotFile, JSON.stringify(snapshot));
  const server = await backend(t, (req, res) => reply(res, validReply(req.body)));
  const { session } = await openArchivedSession({ id: archive.id, library: new SessionLibrary({ root }), userData: root,
    selectedModels: {}, smoke: true, config: { embeddingsBackend: 'local', localEmbeddings: { url: server.url, model: 'local-model' } } });
  t.after(() => session.seal());
  await session.search.index.cache.loaded;
  assert.equal(session.readOnly, true);
  assert.equal(session.search.index.status().pending, 0);
  assert.equal(server.requests.length, 0);
  assert.equal((await session.search.search(input)).mode, 'hybrid');
  assert.equal(server.requests.length, 2);
});
