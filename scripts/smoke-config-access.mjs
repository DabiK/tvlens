import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = process.cwd();
const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-welcome-smoke-'));
const results = [];
try {
  for (const scenario of ['fresh', 'saved-skip', 'saved-refused']) {
    const bootstrap = path.join(staging, `${scenario}.cjs`);
    await fs.writeFile(bootstrap, `
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const electron = require('electron');
const userData = path.join(os.tmpdir(), 'tvlens-smoke-' + process.pid);
fs.mkdirSync(userData, { recursive: true });
if (${JSON.stringify(scenario)} !== 'fresh') fs.writeFileSync(path.join(userData, 'provider.enc'), 'untouched-fixture');
globalThis.storageAccesses = 0;
if (${JSON.stringify(scenario)} === 'saved-refused') {
  const Module = require('node:module');
  const load = Module._load;
  const guarded = new Proxy(electron, { get(target, name) {
    if (name !== 'safeStorage') return target[name];
    globalThis.storageAccesses++;
    return { isEncryptionAvailable() { throw Error('Controlled refusal'); } };
  } });
  Module._load = function(name, ...args) { return name === 'electron' ? guarded : load.call(this, name, ...args); };
}
require(${JSON.stringify(path.join(root, 'app/main.cjs'))});
`);
    const instance = await electron.launch({ args: [bootstrap, '--smoke-test', '--smoke-setup'], executablePath: require('electron') });
    let userData;
    try {
      userData = await instance.evaluate(({ app }) => app.getPath('userData'));
      const first = await instance.firstWindow();
      if (scenario !== 'fresh') {
        await first.getByRole('heading', { name: 'Retrouver mes réglages' }).waitFor();
        assert.equal(await instance.evaluate(() => globalThis.storageAccesses), 0);
        await first.screenshot({ path: path.join(os.tmpdir(), 'tvlens-config-welcome.png') });
        assert.match(await first.locator('main').textContent(), /TVLens Safe Storage/);
        if (scenario === 'saved-refused') {
          await first.locator('#restore').click();
          await first.getByText(/Impossible de déverrouiller/).waitFor();
          assert.equal(await instance.evaluate(() => globalThis.storageAccesses), 1);
        }
        const opened = instance.waitForEvent('window');
        await first.locator('#skip').click();
        await opened;
      }
      const page = instance.windows().find(window => window !== first) || first;
      await page.locator('#setup-dialog[open]').waitFor();
      assert.equal(await page.locator('#setup-checks > li').count(), 6);
      assert.equal(await page.locator('#source option').count(), 1, 'no capture requested');
      const config = await page.evaluate(() => window.tvlens.config());
      assert.equal(config.protectedSettingsSkipped, scenario !== 'fresh');
      if (scenario !== 'fresh') assert.equal(await fs.readFile(path.join(userData, 'provider.enc'), 'utf8'), 'untouched-fixture');
      else await assert.rejects(fs.access(path.join(userData, 'provider.enc')), { code: 'ENOENT' });
      results.push({ scenario, result: 'PASS', window: 'setup', encryptedCachePreserved: scenario !== 'fresh' });
    } finally {
      await instance.close();
      if (userData) await fs.rm(userData, { recursive: true, force: true });
    }
  }
  console.log(JSON.stringify({ result: 'PASS', results }, null, 2));
} finally {
  await fs.rm(staging, { recursive: true, force: true });
}
