import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const instance = await electron.launch({ args: ['.', '--smoke-test', '--smoke-setup'], executablePath: require('electron') });
let userData;
try {
  userData = await instance.evaluate(({ app }) => app.getPath('userData'));
  const page = await instance.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#setup-dialog[open]').waitFor();
  assert.equal(await page.locator('#setup-checks > li').count(), 6);
  const modelPicker = page.getByRole('combobox', { name: 'Modèle de transcription', exact: true });
  assert.equal(await modelPicker.locator('option').count(), 33);
  await modelPicker.selectOption('large-v3-turbo-q5_0');
  await page.getByRole('combobox', { name: 'Langue de transcription', exact: true }).selectOption('fr');
  assert.equal(await page.getByRole('button', { name: 'Télécharger et utiliser · 548 Mio' }).count(), 1);
  assert.equal(await page.locator('#setup-progress').textContent(), '6 / 6 prérequis vérifiés');
  assert.equal(await page.locator('#source option').count(), 1, 'no capture sources requested before the first-launch choice');
  await page.screenshot({ path: '/tmp/tvlens-setup-ready.png' });
  await page.locator('.speech-model-picker').screenshot({ path: '/tmp/tvlens-speech-model-picker.png' });
  await page.locator('#setup-finish').click();
  await page.waitForFunction(() => document.querySelector('#source').value === 'test-source');
  const stored = JSON.parse(await fs.readFile(path.join(userData, 'installation.json'), 'utf8'));
  assert.equal(stored.completed, true);
  assert.equal((await page.evaluate(() => window.tvlens.setupStatus())).firstLaunch, false);
  await page.locator('#models').click();
  await page.locator('#setup-open').click();
  await page.locator('#setup-dialog[open]').waitFor();
  await page.locator('#setup-later').click();
  // A controlled missing-tool response exercises the same UI without probing or changing this Mac.
  await page.evaluate(async () => {
    const { bindSetup } = await import('./ui/setup.mjs');
    const paths = { codexBinary: 'codex', codexAuthHome: '/Users/example/.codex', ffmpeg: 'ffmpeg',
      whisperBinary: 'whisper-cli', whisperModel: '/Users/example/Library/Application Support/TVLens/models/ggml-base.bin' };
    const { speech } = await window.tvlens.setupStatus();
    const report = { speech, firstLaunch: true, ready: false, canObserve: false, restartRequired: false, paths,
      checks: Object.keys(paths).map(id => ({ id, state: 'missing' })).concat({ id: 'screen', state: 'denied' }) };
    window.setupFixture = bindSetup({ get: id => document.getElementById(id), refreshSources: async () => {}, prepare: async () => {},
      bridge: { setupStatus: async () => report, setupChoose: async () => { throw Error('Sélection refusée.'); },
        setupAction: async () => { throw Error('Téléchargement interrompu. Réessaie.'); } } });
    await window.setupFixture.start();
  });
  assert.equal(await page.locator('#setup-finish').isDisabled(), true);
  assert.equal(await page.locator('.setup-command').count(), 4);
  await page.screenshot({ path: '/tmp/tvlens-setup-missing.png' });
  await page.getByRole('button', { name: 'Télécharger et utiliser · 142 Mio' }).click();
  await page.waitForFunction(() => document.querySelector('#setup-state').textContent === 'Téléchargement interrompu. Réessaie.');
  assert.equal(await page.locator('#setup-refresh').isEnabled(), true);
  await page.locator('#setup-later').click();
  assert.equal(await page.locator('#setup-dialog').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', firstLaunch: true, completionPersisted: true,
    reopen: true, missingDependencies: true, downloadFailureRecoverable: true }));
} finally {
  await instance.close();
  if (userData) await fs.rm(userData, { recursive: true, force: true });
}
