import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readBuildInfo } from '../adapters/build-info.cjs';
import { buildLabel } from '../app/ui/build-info.mjs';

const require = createRequire(import.meta.url);
const expected = await readBuildInfo(process.cwd());
const instance = await electron.launch({ args: ['.', '--smoke-test'], executablePath: require('electron') });
let userData;
try {
  userData = await instance.evaluate(({ app }) => app.getPath('userData'));
  const page = await instance.firstWindow();
  await page.waitForFunction(() => document.querySelector('#source').value === 'test-source');
  const config = await page.evaluate(() => window.tvlens.config());
  assert.ok(Object.hasOwn(config, 'build'), 'The main process publishes construction even when unknown');
  assert.deepEqual(config.build, expected);
  await page.waitForFunction(label => document.querySelector('#build-info').textContent === label, buildLabel(expected));
  await page.locator('#models').click();
  await page.locator('.status-details summary').click();
  assert.equal(await page.locator('#build-info').isVisible(), true);
  assert.equal(await page.locator('#build-info').textContent(), buildLabel(expected));
  console.log(JSON.stringify({ result: 'PASS', build: config.build, label: buildLabel(config.build) }));
} finally {
  await instance.close();
  if (userData) await fs.rm(userData, { recursive: true, force: true });
}
