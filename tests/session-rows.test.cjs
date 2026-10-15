const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sessionRows } = require('../app/session-rows.cjs');

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
