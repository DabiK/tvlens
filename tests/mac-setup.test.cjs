const test = require('node:test');
const assert = require('node:assert/strict');
const { createMacSetup } = require('../app/mac-setup.cjs');

const paths = { codexBinary: '/bin/codex', codexAuthHome: '/account', ffmpeg: '/bin/ffmpeg',
  whisperBinary: '/bin/whisper-cli', whisperModel: '/models/base.bin' };
const checks = Object.keys(paths).map(id => ({ id, state: id === 'whisperModel' ? 'present' : 'ready' }))
  .concat({ id: 'screen', state: 'ready' });

function fixture(extra = {}, dependencies = {}) {
  const writes = [], opened = [];
  const service = createMacSetup({ store: { save: async value => writes.push(value) }, initial: { paths: {}, completed: false },
    resolvePaths: (_config, preferences) => ({ ...paths, ...preferences }), getConfig: () => ({}), environment: {},
    permission: () => 'granted', choose: async () => ({ canceled: false, filePaths: ['/chosen/base.bin'] }),
    openExternal: async url => opened.push(url), quit: () => {}, isBusy: () => false, userData: '/data', ...extra,
  }, { inspect: async () => structuredClone(checks), access: async () => true, ...dependencies });
  return { service, writes, opened };
}

test('first launch is explicit and completing a verified setup persists the completion flag', async () => {
  const { service, writes } = fixture();
  const first = await service.status();
  assert.equal(first.firstLaunch, true);
  assert.equal(first.ready, true);
  assert.equal(first.restartRequired, false);
  assert.equal((await service.action('finish')).firstLaunch, false);
  assert.deepEqual(writes, [{ paths: {}, completed: true }]);
});

test('a missing complementary dependency allows exploration but does not claim a complete installation', async () => {
  const { service } = fixture({}, { inspect: async () => checks.map(item => item.id === 'whisperModel' ? { ...item, state: 'missing' } : item) });
  assert.equal((await service.status()).canObserve, true);
  assert.equal((await service.status()).ready, false);
  await assert.rejects(service.action('finish'), { code: 'TVLENS_SETUP_INCOMPLETE' });
});

test('file selection persists only the selected path and requests reopening before completing setup', async () => {
  const { service, writes } = fixture();
  const selected = await service.select('whisperModel');
  assert.equal(selected.paths.whisperModel, '/chosen/base.bin');
  assert.equal(selected.restartRequired, true);
  assert.deepEqual(writes, [{ paths: { whisperModel: '/chosen/base.bin' }, completed: false }]);
  await assert.rejects(service.action('finish'), { code: 'TVLENS_SETUP_INCOMPLETE' });
  const reopened = fixture({ initial: writes[0] }).service;
  assert.equal((await reopened.status()).restartRequired, false);
  assert.equal((await reopened.action('finish')).firstLaunch, false);
});

test('unknown actions and paths cannot execute commands or open caller supplied URLs', async () => {
  const { service, opened, writes } = fixture();
  await assert.rejects(service.action('https://attacker.invalid'), { code: 'TVLENS_SETUP_ACTION_INVALID' });
  await assert.rejects(service.action('toString'), { code: 'TVLENS_SETUP_ACTION_INVALID' });
  await assert.rejects(service.select('apiKey'), { code: 'TVLENS_SETUP_PATH_INVALID' });
  assert.deepEqual(opened, []);
  assert.deepEqual(writes, []);
  await service.action('permissions');
  assert.deepEqual(opened, ['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture']);
});

test('a running session and a concurrent download prevent installation changes', async () => {
  const active = fixture({ isBusy: () => true }).service;
  await assert.rejects(active.select('whisperModel'), { code: 'TVLENS_SETUP_SESSION_ACTIVE' });
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const { service, writes } = fixture({}, { install: async destination => { entered(destination); await held; return destination; } });
  const downloading = service.action('download-model');
  assert.equal(await started, '/data/models/ggml-base.bin');
  await assert.rejects(service.select('whisperModel'), { code: 'TVLENS_SETUP_BUSY' });
  release();
  assert.equal((await downloading).restartRequired, true);
  assert.equal(writes[0].paths.whisperModel, '/data/models/ggml-base.bin');
});

test('cancelled selection leaves completion and settings intact', async () => {
  const { service, writes } = fixture({ initial: { paths: {}, completed: true }, choose: async () => ({ canceled: true }) });
  const report = await service.select('ffmpeg');
  assert.equal(report.firstLaunch, false);
  assert.equal(report.restartRequired, false);
  assert.deepEqual(writes, []);
});

test('simulation never probes tools or downloads a model', async () => {
  const { service } = fixture({ simulated: true }, { inspect: () => assert.fail('real probe'), install: () => assert.fail('real download') });
  assert.equal((await service.status()).ready, true);
  await assert.rejects(service.action('download-model'), { code: 'TVLENS_SETUP_SIMULATED' });
});

test('screen access is requested only after the explicit permission action', async () => {
  let permission = 'not-determined', requests = 0;
  const { service, opened } = fixture({ permission: () => permission, requestScreen: async () => { requests++; permission = 'granted'; } },
    { inspect: async input => checks.map(item => {
      if (item.id !== 'screen') return item;
      return { ...item, state: input.permission === 'granted' ? 'ready' : input.permission };
    }) });
  assert.equal((await service.status()).ready, false);
  assert.equal(requests, 0);
  await service.action('permissions');
  assert.equal(requests, 1);
  assert.equal((await service.status()).ready, true);
  assert.equal(opened.length, 1);
});

test('screen permission can be deferred persistently without claiming capture is ready', async () => {
  for (const state of ['denied', 'restricted', 'unknown', 'not-determined']) {
    const inspect = async () => checks.map(item => item.id === 'screen' ? { ...item, state } : item);
    const { service, writes } = fixture({}, { inspect });
    const report = await service.status();
    assert.equal(report.canFinish, true);
    assert.equal(report.ready, false);
    assert.equal(report.canObserve, false);
    const completed = await service.action('finish');
    assert.equal(completed.firstLaunch, false);
    assert.equal(completed.ready, false);
    assert.equal(completed.canObserve, false);
    const reopened = fixture({ initial: writes[0] }, { inspect }).service;
    assert.equal((await reopened.status()).firstLaunch, false);
    assert.equal((await reopened.status()).canObserve, false);
  }
});

test('deferring screen permission does not bypass missing tools or a required restart', async () => {
  const inspect = async () => checks.map(item => item.id === 'screen' ? { ...item, state: 'denied' } : item);
  const { service } = fixture({}, { inspect });
  assert.equal((await service.select('whisperModel')).canFinish, false);
  await assert.rejects(service.action('finish'), { code: 'TVLENS_SETUP_INCOMPLETE' });
  const missing = fixture({}, { inspect: async () => (await inspect()).map(item =>
    item.id === 'codexBinary' ? { ...item, state: 'missing' } : item) }).service;
  assert.equal((await missing.status()).canFinish, false);
  await assert.rejects(missing.action('finish'), { code: 'TVLENS_SETUP_INCOMPLETE' });
});

test('catalogue selection persists the requested model and language and survives reopening', async () => {
  const installed = [];
  const { service, writes } = fixture({}, { install: async (file, options) => { installed.push({ file, options }); return file; } });
  const result = await service.action('download-model', { modelId: 'large-v3-turbo-q5_0', language: 'fr' });
  assert.deepEqual(installed, [{ file: '/data/models/ggml-large-v3-turbo-q5_0.bin', options: { modelId: 'large-v3-turbo-q5_0' } }]);
  assert.equal(result.restartRequired, true);
  assert.equal(result.speech.selectedId, 'large-v3-turbo-q5_0');
  assert.equal(result.speech.language, 'fr');
  const reopened = fixture({ initial: writes[0] }).service;
  assert.equal((await reopened.status()).restartRequired, false);
  assert.equal((await reopened.status()).speech.selectedId, 'large-v3-turbo-q5_0');
  await reopened.action('finish');
  assert.equal((await reopened.status()).speech.language, 'fr');
});

test('unknown models and English-only models for French are refused before downloading or saving', async () => {
  const { service, writes } = fixture({}, { install: () => assert.fail('download must not start') });
  await assert.rejects(service.action('download-model', { modelId: '../../outside', language: 'fr' }),
    { code: 'TVLENS_SPEECH_MODEL_INVALID' });
  await assert.rejects(service.action('download-model', { modelId: 'small.en', language: 'fr' }),
    { code: 'TVLENS_SPEECH_MODEL_LANGUAGE' });
  await assert.rejects(service.action('speech-language', { language: 'invalid' }),
    { code: 'TVLENS_TRANSCRIPTION_LANGUAGE_INVALID' });
  assert.deepEqual(writes, []);
});

test('a failed model replacement preserves the active model and allows another attempt', async () => {
  const initial = { paths: { whisperModel: '/data/models/ggml-base.bin' }, completed: true, transcriptionLanguage: 'fr' };
  const { service, writes } = fixture({ initial }, { install: async () => { throw Error('interrompu'); } });
  await assert.rejects(service.action('download-model', { modelId: 'small' }), /interrompu/);
  const report = await service.status();
  assert.equal(report.speech.selectedId, 'base');
  assert.equal(report.restartRequired, false);
  assert.equal(report.busy, false);
  assert.deepEqual(writes, []);
  await service.action('speech-language', { language: 'en' });
  assert.equal(writes[0].paths.whisperModel, initial.paths.whisperModel);
});

test('English-only selection is explicit and cannot later accept a French language override', async () => {
  const { service } = fixture({}, { install: async file => file });
  await service.action('download-model', { modelId: 'small.en', language: 'en' });
  await assert.rejects(service.action('speech-language', { language: 'fr' }), { code: 'TVLENS_SPEECH_MODEL_LANGUAGE' });
  assert.equal((await service.status()).speech.language, 'en');
});

test('granting screen access after startup requires reopening before setup completion', async () => {
  let permission = 'denied';
  const { service } = fixture({ permission: () => permission }, { inspect: async input =>
    checks.map(item => item.id === 'screen' ? { ...item, state: input.permission === 'granted' ? 'ready' : input.permission } : item) });
  assert.equal((await service.status()).restartRequired, false);
  permission = 'granted';
  assert.equal((await service.status()).restartRequired, true);
  await assert.rejects(service.action('finish'), { code: 'TVLENS_SETUP_INCOMPLETE' });
  assert.equal((await fixture().service.status()).restartRequired, false);
});
