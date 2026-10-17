const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const memory = require('../core/memory/index.cjs');
const { toArchive, fromArchive, ARCHIVE_FORMAT, ARCHIVE_VERSION, TVLENS_ARCHIVE_INVALID } = memory;

const ARCHIVES = path.join(__dirname, 'fixtures', 'archives');
const reread = value => JSON.parse(JSON.stringify(value));

// A saved state as a session writes it, with passage keys no reader knows yet: the archive keeps them all.
function savedModel(extra = {}) {
  return {
    id: 'session-a', accepting: false, elapsedMs: 16000, retentionMs: null, retention: 'until-deleted', readOnly: false,
    apiCalls: 2, apiCost: 0.01, lastError: null, coverage: { passages: 2, audioError: 0, visionError: 1 },
    history: [{ id: 'moment-1', startMs: 0, endMs: 8000, status: 'ready', summary: 'Un cercle.', revision: 3, laterKey: { kept: true } }],
    questions: [{ question: 'Que voit-on ?', answer: 'Un cercle.', atMs: 8000 }],
    segments: [{
      id: 'moment-2', startMs: 8000, endMs: 16000, status: 'partial', available: true, hasAudio: true, visionStatus: 'error',
      visionError: 'Coupé.', observation: { summary: 'Un carré.', topic: 'Formes' }, ingest: { assembleMs: 12 }, unknownToday: [1, 2],
    }],
    ...extra,
  };
}

function refusedAsInvalidArchive(error) {
  assert.equal(error.code, TVLENS_ARCHIVE_INVALID);
  assert.equal(error.status, undefined);
  return true;
}

async function sessionFiles(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await sessionFiles(target));
    else if (entry.name === 'session.json') files.push(target);
  }
  return files.sort();
}

test('the archive names the viewing memory format at version 1 and refuses with a stable code', () => {
  assert.deepEqual([ARCHIVE_FORMAT, ARCHIVE_VERSION, TVLENS_ARCHIVE_INVALID], ['tvlens-viewing-memory', 1, 'TVLENS_ARCHIVE_INVALID']);
});

test('toArchive puts the format and version in front of every key of the model, passages and their keys included', () => {
  const model = savedModel(), before = reread(model);
  const archive = toArchive(model);
  assert.deepEqual(Object.keys(archive), ['format', 'version', ...Object.keys(model)]);
  assert.deepEqual([archive.format, archive.version], ['tvlens-viewing-memory', 1]);
  const written = reread(archive);
  for (const key of Object.keys(model)) assert.deepEqual(written[key], before[key], key);
  written.segments.forEach((passage, index) => assert.deepEqual(passage, before.segments[index]));
  written.history.forEach((passage, index) => assert.deepEqual(passage, before.history[index]));
  assert.deepEqual(model, before, 'the model is not changed by its archive');
  assert.equal(archive.segments, model.segments, 'a shallow envelope: the passages are not copied again');
});

test('fromArchive decodes a version 1 archive into the model without its markers and leaves the document unchanged', () => {
  const document = reread(toArchive(savedModel())), before = reread(document);
  const decoded = fromArchive(document);
  assert.deepEqual(decoded, reread(savedModel()));
  assert.deepEqual(Object.keys(decoded), Object.keys(savedModel()));
  assert.deepEqual(document, before);
});

test('fromArchive hands a historical document back exactly as saved, without adding an absent retention', () => {
  const { retention, retentionMs, ...historical } = savedModel();
  const before = reread(historical);
  const decoded = fromArchive(historical);
  assert.deepEqual(decoded, before);
  assert.deepEqual(Object.keys(decoded), Object.keys(before));
  assert.equal(Object.hasOwn(decoded, 'retention'), false);
  assert.deepEqual([retention, retentionMs], ['until-deleted', null]);
});

for (const [condition, envelope] of [
  ['a foreign format', { format: 'another-application', version: 1 }],
  ['the session manifest format', { format: 'tvlens-session', version: 1 }],
  ['a future version', { format: 'tvlens-viewing-memory', version: 2 }],
  ['a version that is not an integer', { format: 'tvlens-viewing-memory', version: 1.5 }],
  ['a version spelled as text', { format: 'tvlens-viewing-memory', version: '1' }],
  ['a format without a version', { format: 'tvlens-viewing-memory' }],
  ['a version without a format', { version: 1 }],
  ['an empty format', { format: null, version: 1 }],
]) {
  test(`fromArchive refuses ${condition} without reading it as a historical document`, () => {
    const document = { ...envelope, ...savedModel() }, before = reread(document);
    assert.throws(() => fromArchive(document), refusedAsInvalidArchive);
    assert.deepEqual(document, before);
  });
}

for (const [condition, document] of [
  ['a historical document of another shape', { ...savedModel(), segments: [null] }],
  ['a version 1 archive of another shape', { format: 'tvlens-viewing-memory', version: 1, ...savedModel(), history: 7 }],
  ['a list', []],
  ['nothing', null],
]) {
  test(`fromArchive refuses ${condition} with the archive code`, () => {
    assert.throws(() => fromArchive(document), refusedAsInvalidArchive);
  });
}

test('every saved state of the frozen corpus is read as it is and survives a version 1 round trip key for key', async () => {
  const files = await sessionFiles(ARCHIVES);
  assert.ok(files.length >= 12, 'the durable and historical corpora are both present');
  for (const file of files) {
    const label = path.relative(ARCHIVES, file);
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.deepEqual(fromArchive(reread(saved)), saved, label);
    const written = reread(toArchive(saved));
    assert.deepEqual([written.format, written.version], [ARCHIVE_FORMAT, ARCHIVE_VERSION], label);
    const decoded = reread(fromArchive(written));
    assert.deepEqual(Object.keys(decoded), Object.keys(saved), label);
    for (const key of ['segments', 'history']) {
      assert.equal(decoded[key]?.length, saved[key]?.length, `${label} ${key}`);
      (saved[key] || []).forEach((passage, index) => {
        assert.deepEqual(Object.keys(decoded[key][index]), Object.keys(passage), `${label} ${key} ${passage.id}`);
        assert.deepEqual(decoded[key][index], passage, `${label} ${key} ${passage.id}`);
      });
    }
    assert.deepEqual(decoded, saved, label);
  }
});
