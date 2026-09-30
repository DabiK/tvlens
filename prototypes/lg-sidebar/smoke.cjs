// Local rendering smoke test; does not validate webOS window management.
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(pathToFileURL(path.join(__dirname, 'app/index.html')).href);
    const rect = await page.locator('aside').boundingBox();
    assert.equal(rect.x, 1440);
    assert.equal(rect.width, 480);
    assert.equal(await page.locator(':focus').getAttribute('id'), 'dictate');
    await page.keyboard.press('ArrowDown');
    assert.match(await page.locator('#event').textContent(), /40/);
    await page.locator('#dictate').click();
    assert.equal(await page.locator(':focus').getAttribute('id'), 'question');
    await page.locator('#question').fill('De quoi parle cette vidéo ?');
    assert.equal(await page.locator('#received').textContent(), 'De quoi parle cette vidéo ?');
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('keyboardStateChange', {detail:{visibility:false}})));
    assert.equal(await page.locator(':focus').getAttribute('id'), 'question');
    assert.equal(await page.locator('#keyboard').textContent(), 'Masqué');
    await page.locator('#reset').click();
    assert.equal(await page.locator('#question').inputValue(), '');
    assert.equal(await page.locator('#mode').textContent(), 'Bouton direct');
    console.log('PASS: geometry, navigation, received text, focus retained during voice UI, reset');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
