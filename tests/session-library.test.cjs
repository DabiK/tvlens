const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const emitter = require('../adapters/session-library.cjs');

async function library(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-library-refusals-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return new emitter.SessionLibrary({ root });
}

function refused(code, message, causeCode) {
  return error => {
    assert.equal(error.code, code);
    assert.equal(emitter[code], code);
    assert.equal(error.message, message);
    assert.equal(error.status, undefined);
    if (causeCode) assert.equal(error.cause?.code, causeCode);
    return true;
  };
}

test('library identifiers and absent folders have distinct exported identities', async t => {
  const lib = await library(t);
  assert.throws(() => lib.dir('../elsewhere'), refused('TVLENS_SESSION_ID_INVALID', 'Identifiant de session invalide.'));
  await assert.rejects(lib.folder(randomUUID()), refused('TVLENS_SESSION_NOT_FOUND', 'Session introuvable.', 'ENOENT'));
});

for (const shape of ['empty', 'malformed', 'foreign', 'manifest']) {
  test(`the library identifies an unreadable ${shape} archive without changing its message`, async t => {
    const lib = await library(t), id = randomUUID(), dir = lib.dir(id);
    await fs.mkdir(dir);
    if (shape === 'malformed') await fs.writeFile(path.join(dir, 'session.json'), '{');
    if (shape === 'foreign') await fs.writeFile(path.join(dir, 'session.json'), JSON.stringify({ id: randomUUID(), segments: [] }));
    if (shape === 'manifest') await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
      format: emitter.MANIFEST_FORMAT, id, elapsedMs: 'invalid',
    }));
    await assert.rejects(lib.read(id), error => {
      refused('TVLENS_ARCHIVE_INVALID', 'Archive illisible.')(error);
      if (shape === 'malformed') {
        assert.equal(error.cause?.constructor, Error);
        assert.equal(error.cause.message, 'Fichier de session illisible.');
      }
      return true;
    });
  });
}

test('a UUID entry that is a file is refused as a missing session without a filesystem cause', async t => {
  const lib = await library(t), id = randomUUID();
  await fs.writeFile(lib.dir(id), 'not a directory');
  await assert.rejects(lib.folder(id), error => {
    refused('TVLENS_SESSION_NOT_FOUND', 'Session introuvable.')(error);
    assert.equal(error.cause, undefined);
    return true;
  });
});


for (const code of ['EIO', 'EACCES', 'EMFILE']) {
  test(`an archive read failure with ${code} keeps its cause without a content identity`, async t => {
    const lib = await library(t), id = randomUUID(), dir = lib.dir(id);
    await fs.mkdir(dir);
    const file = path.join(dir, 'session.json'), readFile = fs.readFile;
    const cause = Object.assign(Error('Fichier de session illisible.'), { code });
    t.mock.method(fs, 'readFile', async (target, ...args) => {
      if (target === file) throw cause;
      return readFile(target, ...args);
    });
    await assert.rejects(lib.read(id), error => {
      assert.equal(error.code, undefined);
      assert.equal(Object.hasOwn(error, 'code'), false);
      assert.equal(error.message, 'Archive illisible.');
      assert.equal(error.cause, cause);
      assert.equal(error.status, undefined);
      return true;
    });
  });

  test(`a session folder stat failure with ${code} keeps its cause without an absence identity`, async t => {
    const lib = await library(t), id = randomUUID(), dir = lib.dir(id);
    await fs.mkdir(dir);
    const lstat = fs.lstat, cause = Object.assign(Error('Session introuvable.'), { code });
    t.mock.method(fs, 'lstat', async (target, ...args) => {
      if (target === dir) throw cause;
      return lstat(target, ...args);
    });
    await assert.rejects(lib.folder(id), error => {
      assert.equal(error.code, undefined);
      assert.equal(Object.hasOwn(error, 'code'), false);
      assert.equal(error.message, 'Session introuvable.');
      assert.equal(error.cause, cause);
      assert.equal(error.status, undefined);
      return true;
    });
  });
}

// Every file under a directory with its bytes: two listings are equal only when nothing was added, removed or rewritten.
async function files(dir, base = dir) {
  const rows = [];
  for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(dir, entry.name), name = path.relative(base, target);
    if (entry.isDirectory()) rows.push([name, 'dir'], ...await files(target, base));
    else rows.push([name, (await fs.readFile(target)).toString('base64')]);
  }
  return rows;
}

for (const [condition, envelope] of [
  ['a future version', { format: 'tvlens-viewing-memory', version: 2 }],
  ['a format without a version', { format: 'tvlens-viewing-memory' }],
  ['a version without a format', { version: 1 }],
  ['the manifest format', { format: 'tvlens-session', version: 1 }],
]) {
  test(`a saved state with ${condition} is refused before its media are recovered and listed as unreadable, without a write`, async t => {
    const lib = await library(t), id = randomUUID(), dir = lib.dir(id);
    await fs.mkdir(path.join(dir, 'media'), { recursive: true });
    await fs.writeFile(path.join(dir, 'session.json'), JSON.stringify({
      ...envelope, id, elapsedMs: 0, retentionMs: null, retention: 'until-deleted', history: [], questions: [], segments: [],
    }));
    // A whole pair with its interval: a historical reading would put it back as a passage.
    await fs.writeFile(path.join(dir, 'media', 'moment-1.json'), JSON.stringify({ startMs: 0, endMs: 8000, frames: [], audio: null }));
    await fs.writeFile(path.join(dir, 'media', 'moment-1.webm'), 'clip');
    const before = await files(lib.root);
    await assert.rejects(lib.read(id), refused('TVLENS_ARCHIVE_INVALID', 'Archive illisible.'));
    assert.deepEqual((await lib.list()).map(session => [session.id, session.state]), [[id, 'unreadable']]);
    assert.deepEqual(await files(lib.root), before);
  });
}
