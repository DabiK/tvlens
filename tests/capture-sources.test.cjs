const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createCaptureSources } = require('../app/capture-sources.cjs');

async function stage(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-capture-sources-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const preferenceFile = path.join(dir, 'preferences', 'last-source.json');
  const video = { id: 'window:1', name: 'Film', thumbnail: { native: true } };
  const state = { catalog: [{ id: 'window:0', name: 'TVLens' }, video], permission: 'denied', opened: [] };
  const options = {
    smoke: false,
    preferenceFile,
    desktopCapturer: { getSources: async value => {
      assert.deepEqual(value, { types: ['window', 'screen'], thumbnailSize: { width: 0, height: 0 } });
      return state.catalog;
    } },
    systemPreferences: { getMediaAccessStatus: kind => {
      assert.equal(kind, 'screen');
      return state.permission;
    } },
    shell: { openExternal: async url => {
      state.opened.push(url);
      return 'opened';
    } },
  };
  const writePreference = async text => {
    await fs.mkdir(path.dirname(preferenceFile), { recursive: true });
    await fs.writeFile(preferenceFile, text);
  };
  return { state, options, video, preferenceFile, writePreference, create: () => createCaptureSources(options) };
}

test('capture sources exclude the TVLens window from listing and selection and report the screen permission', async t => {
  const { create } = await stage(t);
  const capture = await create();
  assert.deepEqual(await capture.sources(), {
    permission: 'denied', sources: [{ id: 'window:1', name: 'Film' }], preferredSourceId: null,
  });
  await assert.rejects(capture.select('window:0'), { message: 'Source indisponible' });
});

test('a saved source is preferred only while both its id and title still match an available source', async t => {
  const { create, writePreference } = await stage(t);
  for (const [preference, expected] of [
    [{ id: 'window:1', name: 'Film' }, 'window:1'],
    [{ id: 'window:1', name: 'Autre film' }, null],
    [{ id: 'window:2', name: 'Film' }, null],
    [{ id: 'window:0', name: 'TVLens' }, null],
  ]) {
    await writePreference(JSON.stringify(preference));
    assert.equal((await (await create()).sources()).preferredSourceId, expected);
  }
});

test('selecting a source saves a private preference and retains its name for the session title', async t => {
  const { create, preferenceFile } = await stage(t);
  const capture = await create();
  assert.equal(capture.capturedSourceName(), null);
  await capture.sources();
  assert.equal(await capture.select('window:1'), undefined);
  const written = await fs.readFile(preferenceFile, 'utf8').then(JSON.parse).catch(() => null);
  assert.deepEqual(written, { id: 'window:1', name: 'Film' });
  assert.equal((await fs.stat(preferenceFile)).mode & 0o777, 0o600);
  assert.equal(capture.capturedSourceName(), 'Film');
  assert.equal((await capture.sources()).preferredSourceId, 'window:1');
  await assert.rejects(capture.select('unknown'), { message: 'Source indisponible' });
  assert.equal(capture.capturedSourceName(), 'Film');
  assert.deepEqual(JSON.parse(await fs.readFile(preferenceFile, 'utf8')), written);
});

test('the selected native source is handed to capture once while its title stays available', async t => {
  const { create, video, state } = await stage(t);
  const capture = await create();
  assert.equal(capture.takeSelectedSource(), undefined);
  await assert.rejects(capture.select('window:1'), { message: 'Source indisponible' });
  await capture.sources();
  await capture.select('window:1');
  assert.equal(capture.takeSelectedSource(), video);
  assert.equal(capture.takeSelectedSource(), undefined);
  assert.equal(capture.capturedSourceName(), 'Film');
  await capture.select('window:1');
  state.catalog = [];
  await capture.sources();
  assert.equal(capture.takeSelectedSource(), undefined);
  state.catalog = [video];
  await capture.sources();
  assert.equal(capture.takeSelectedSource(), undefined);
});

test('smoke capture lists only the demonstration video and grants permission without querying Electron', async t => {
  const { options } = await stage(t);
  let queried = 0;
  options.desktopCapturer.getSources = async () => {
    queried++;
    return [];
  };
  options.systemPreferences.getMediaAccessStatus = () => {
    queried++;
    return 'denied';
  };
  const capture = await createCaptureSources({ ...options, smoke: true });
  assert.deepEqual(await capture.sources(), {
    permission: 'granted', sources: [{ id: 'test-source', name: 'Vidéo de démonstration' }], preferredSourceId: null,
  });
  assert.equal(queried, 0);
  await capture.select('test-source');
  assert.deepEqual(capture.takeSelectedSource(), { id: 'test-source', name: 'Vidéo de démonstration' });
});

test('capture settings opens the screen privacy panel and returns the shell result', async t => {
  const { create, state } = await stage(t);
  const capture = await create();
  assert.equal(await capture.settings(), 'opened');
  assert.deepEqual(state.opened, ['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture']);
});

test('an absent or malformed source preference does not prevent listing', async t => {
  const { create, writePreference } = await stage(t);
  assert.equal((await (await create()).sources()).preferredSourceId, null);
  await writePreference('{broken');
  assert.equal((await (await create()).sources()).preferredSourceId, null);
});

test('capture instances keep their catalogs, preferences, selections and captured titles independent', async t => {
  const first = await stage(t);
  const a = await first.create();
  await a.sources();
  await a.select('window:1');
  const second = await stage(t);
  second.state.catalog = [{ id: 'window:2', name: 'Autre film' }];
  await second.writePreference(JSON.stringify({ id: 'window:2', name: 'Autre film' }));
  const b = await second.create();
  assert.equal(b.capturedSourceName(), null);
  assert.equal(b.takeSelectedSource(), undefined);
  assert.equal((await b.sources()).preferredSourceId, 'window:2');
  await assert.rejects(b.select('window:1'), { message: 'Source indisponible' });
  await b.select('window:2');
  assert.equal(a.takeSelectedSource(), first.video);
  assert.equal(b.takeSelectedSource().name, 'Autre film');
  assert.equal(a.capturedSourceName(), 'Film');
  assert.equal((await a.sources()).preferredSourceId, 'window:1');
  const restarted = await first.create();
  assert.equal(restarted.capturedSourceName(), null);
  assert.equal(restarted.takeSelectedSource(), undefined);
  assert.equal((await restarted.sources()).preferredSourceId, 'window:1');
});
