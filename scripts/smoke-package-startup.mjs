import { _electron as electron } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const appDirectory = process.argv[2] || 'dist/TVLens-darwin-arm64/TVLens.app';
const executablePath = path.resolve(appDirectory, 'Contents/MacOS/TVLens');
const results = [];
for (const saved of [false, true]) {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-package-startup-'));
  if (saved) await fs.writeFile(path.join(userData, 'provider.enc'), 'preserved-test-cache');
  let instance;
  try {
    instance = await electron.launch({ executablePath, args: [`--user-data-dir=${userData}`, '--opened-by-launch-services'] });
    assert.equal(await fs.realpath(await instance.evaluate(({ app }) => app.getPath('userData'))), await fs.realpath(userData));
    assert.equal(await instance.evaluate(({ app }) => app.isPackaged), true);
    const first = await instance.firstWindow();
    if (saved) {
      await first.getByRole('heading', { name: 'Retrouver mes réglages' }).waitFor();
      const opened = instance.waitForEvent('window');
      await first.locator('#skip').click();
      await opened;
    }
    const page = instance.windows().find(window => window !== first) || first;
    await page.locator('#setup-dialog[open]').waitFor();
    assert.equal(await page.locator('#source option').count(), 1);
    const config = await page.evaluate(() => window.tvlens.config());
    assert.equal(config.protectedSettingsSkipped, saved);
    assert.equal(config.build.dirty, false);
    if (saved) assert.equal(await fs.readFile(path.join(userData, 'provider.enc'), 'utf8'), 'preserved-test-cache');
    else await assert.rejects(fs.access(path.join(userData, 'provider.enc')), { code: 'ENOENT' });
    results.push({ saved, result: 'PASS', packaged: true, build: config.build, captureRequested: false });
  } finally {
    await instance?.close();
    await fs.rm(userData, { recursive: true, force: true });
  }
}
console.log(JSON.stringify({ result: 'PASS', results }, null, 2));
