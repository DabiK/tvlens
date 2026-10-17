const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sessionRows } = require('../app/session-rows.cjs');
const { sessionRows: projectSessionRows } = require('../runtime/session-rows.cjs');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { memoryOf } = require('./helpers/memory-consultation.cjs');

function loadedSession({ readOnly = false, accepting = true, retentionMs = Infinity } = {}) {
  return {
    title: 'Vidéo', startedAt: 100,
    runtime: {
      readOnly, watch: {
        id: 'session-a', accepting, retentionMs, now: () => 32000,
        snapshot: () => ({
          elapsedMs: 30000, coverage: { passages: 3 }, storage: { sessionBytes: 1200 },
          segments: [{ available: true }, { available: false }],
        }),
      },
    },
  };
}

test('a capturing session absent from the library is prepended with its figures from memory', () => {
  const listed = Object.freeze([{ id: 'older', state: 'archived', title: 'Archive' }]);
  assert.deepEqual(sessionRows(listed, loadedSession(), 500), {
    current: {
      id: 'session-a', title: 'Vidéo', elapsedMs: 32000, readOnly: false, accepting: true,
      retention: 'until-deleted', retentionMs: null,
    },
    sessions: [{
      id: 'session-a', firstTopic: null, host: 'mac', createdAt: 100, updatedAt: 500, closedAt: null, legacy: false,
      title: 'Vidéo', state: 'live', elapsedMs: 30000, passages: 3,
      media: { stored: 1, missing: 2, bytes: 1200 }, current: true, readOnly: false, capturing: true,
    }, { ...listed[0], current: false, readOnly: false, capturing: false }],
  });
});

test('an existing session keeps its metadata and position while its figures are replaced from memory', () => {
  const stored = Object.freeze({
    id: 'session-a', title: 'Ancien titre', state: 'interrupted', firstTopic: 'Sujet', host: 'mac', createdAt: 50,
    updatedAt: 200, closedAt: null, legacy: false, passages: 1, elapsedMs: 5000, media: { stored: 0, missing: 1, bytes: 0 },
  });
  const listed = Object.freeze([{ id: 'newer' }, stored]);
  const result = sessionRows(listed, loadedSession({ accepting: false, retentionMs: 60000 }), 500);
  assert.deepEqual(result.sessions, [
    { id: 'newer', current: false, readOnly: false, capturing: false },
    { ...stored, title: 'Vidéo', state: 'live', passages: 3, elapsedMs: 30000,
      media: { stored: 1, missing: 2, bytes: 1200 }, current: true, readOnly: false, capturing: false },
  ]);
  assert.deepEqual(result.current, {
    id: 'session-a', title: 'Vidéo', elapsedMs: 32000, readOnly: false, accepting: false, retention: 'rolling', retentionMs: 60000,
  });
  assert.equal(listed[1], stored);
});

test('a read-only archive retains the library row and is not marked as capturing', () => {
  const stored = Object.freeze({ id: 'session-a', title: 'Archive', state: 'archived', passages: 7, media: { stored: 4 } });
  const loaded = loadedSession({ readOnly: true, accepting: false });
  const result = sessionRows(Object.freeze([stored]), loaded, 500);
  assert.deepEqual(result.sessions, [{ ...stored, current: true, readOnly: true, capturing: false }]);
  assert.deepEqual(result.current, {
    id: 'session-a', title: 'Vidéo', elapsedMs: 32000, readOnly: true, accepting: false, retention: 'until-deleted', retentionMs: null,
  });
  assert.deepEqual(sessionRows([], loaded, 500).sessions, []);
});

test('without a loaded session current is null and all library rows are inactive', () => {
  const listed = Object.freeze([Object.freeze({ id: 'archived', state: 'archived', passages: 2 })]);
  assert.deepEqual(sessionRows(listed, null, 500), {
    current: null, sessions: [{ ...listed[0], current: false, readOnly: false, capturing: false }],
  });
  assert.deepEqual(sessionRows([], null, 500), { current: null, sessions: [] });
});

function projectionMetadata(loaded, item) {
  return Object.freeze({
    current: loaded ? Object.freeze({
      id: 'session-a', title: loaded.title, elapsedMs: 32000, readOnly: loaded.runtime.readOnly,
      accepting: loaded.runtime.watch.accepting,
      retention: item.retentionMs ? 'rolling' : 'until-deleted', retentionMs: item.retentionMs ?? null,
    }) : null,
    capturing: loaded?.runtime.watch.accepting ?? false,
    fallback: Object.freeze({ host: 'mac', createdAt: 100, updatedAt: 500 }),
    live: Object.freeze({ title: loaded?.title }),
  });
}

function assertLiveFigures(result, item) {
  assert.deepEqual(result.sessions[0].media, {
    stored: item.expired ? 0 : 1, missing: item.expired ? 3 : 2, bytes: item.unknownStorage ? 0 : 1200,
  });
  assert.deepEqual([result.sessions[0].current, result.sessions[0].readOnly, result.sessions[0].capturing],
    [true, false, result.current.accepting]);
}

test('both host facades project the same library facts while preserving their titles and dates', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-library-rows-'));
  const server = new HeadlessRuntime({
    userData: root, sessionsRoot: path.join(root, 'sessions'), config: {}, selectedModels: {},
    smoke: true, agent: { answer: async () => ({}) },
  });
  t.after(async () => { server.adopt(null); await server.close(); await fs.rm(root, { recursive: true, force: true }); });
  const common = row => ({
    id: row.id, state: row.state, elapsedMs: row.elapsedMs, passages: row.passages, media: row.media,
    current: row.current, readOnly: row.readOnly, capturing: row.capturing,
  });
  const old = Object.freeze({
    id: 'session-a', title: 'Titre du manifeste', host: 'original', createdAt: 50, updatedAt: 60, closedAt: 70,
    state: 'archived', passages: 9, elapsedMs: 9000, media: Object.freeze({ stored: 8, missing: 1, bytes: 4000 }),
  });
  const cases = [
    { name: 'without manifest', listed: [] },
    { name: 'stale manifest', listed: [old] },
    { name: 'read-only archive', listed: [old], readOnly: true, accepting: false },
    { name: 'no loaded session', listed: [old], absent: true },
    { name: 'expired passage', listed: [old], expired: true, accepting: false, retentionMs: 60000 },
    { name: 'unknown storage', listed: [], unknownStorage: true },
  ];
  for (const item of cases) {
    const listed = Object.freeze(item.listed);
    const snapshot = Object.freeze({
      elapsedMs: 32000, coverage: Object.freeze({ passages: 3 }),
      segments: Object.freeze([Object.freeze({ available: !item.expired }), Object.freeze({ available: false })]),
      history: Object.freeze([Object.freeze({ available: false })]),
      ...(item.unknownStorage ? {} : { storage: Object.freeze({ sessionBytes: 1200 }) }),
    });
    const before = structuredClone({ listed, snapshot });
    const loaded = item.absent ? null : loadedSession(item);
    if (loaded) {
      Object.assign(loaded.runtime, {
        id: 'session-a', manifest: () => ({ title: 'Titre du runtime' }),
        storage: () => ({ sessionBytes: snapshot.storage?.sessionBytes ?? 0 }),
        memory: memoryOf({
          id: 'session-a', elapsedMs: snapshot.elapsedMs,
          history: [{ id: 'moment-1', startMs: 0, endMs: 8000, status: 'ready' }],
          segments: snapshot.segments.map((p, i) => ({
            ...p, id: `moment-${i + 2}`, startMs: (i + 1) * 8000, endMs: (i + 2) * 8000, status: 'ready',
          })),
        }),
      });
      loaded.runtime.watch.snapshot = () => snapshot;
      loaded.runtime.watch.readOnly = loaded.runtime.readOnly;
    }
    server.adopt(loaded?.runtime ?? null);
    server.library.list = async () => listed;
    server.library.usage = async rows => ({ sessions: rows.length, bytes: rows.reduce((sum, row) => sum + row.media.bytes, 0) });
    const mac = sessionRows(listed, loaded, 500);
    const headless = await server.sessions();
    const metadata = projectionMetadata(loaded, item);
    const metadataBefore = structuredClone(metadata);
    assert.deepEqual(projectSessionRows(listed, snapshot, metadata), mac, item.name + ' pure projection');
    assert.deepEqual(metadata, metadataBefore);
    assert.deepEqual(headless.sessions.map(common), mac.sessions.map(common), item.name);
    if (loaded && !item.readOnly) assertLiveFigures(mac, item);
    if (loaded) {
      assert.deepEqual({ ...headless.current, title: loaded.title }, mac.current, item.name);
      const row = mac.sessions[0];
      if (item.listed.length) {
        assert.deepEqual([row.host, row.createdAt, row.updatedAt, row.closedAt], ['original', 50, 60, 70]);
        assert.equal(row.title, item.readOnly ? old.title : loaded.title);
        assert.equal(headless.sessions[0].title, old.title);
      } else {
        assert.deepEqual([row.title, row.host, row.createdAt, row.updatedAt], [loaded.title, 'mac', 100, 500]);
        assert.deepEqual(
          [headless.sessions[0].title, headless.sessions[0].host, headless.sessions[0].createdAt],
          ['Titre du runtime', 'server', null],
        );
      }
    } else assert.deepEqual([mac.current, headless.current], [null, null]);
    assert.deepEqual({ listed, snapshot }, before, item.name + ' leaves inputs unchanged');
  }
});
