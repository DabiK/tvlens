/** Real application screenshots. Requires the Spring sample and a connected Codex account.
 * Uses an isolated profile and a video-file capture source; does not capture the desktop.
 * All perception, chat, inspection and recap providers are live, not scripted answers.
 */
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const output = path.resolve('screenshots/current');
await fs.access('media/samples/spring.mp4');
await fs.mkdir(output, { recursive: true });
const app = await electron.launch({
  executablePath: require('electron'),
  args: ['.', '--smoke-test', '--live-video-agent', '--live-inspection', '--live-observation', '--live-recap'],
});
let userData;
const report = { media: 'Spring — Blender Foundation', source: 'Local MP4 captured via canvas + original audio', liveProviders: ['Codex perception', 'Codex chat', 'Codex recap', 'Whisper local'], screenshots: [], errors: [] };
try {
  userData = await app.evaluate(({ app }) => app.getPath('userData'));
  const page = await app.firstWindow();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.waitForFunction(() => document.querySelector('#source').value === 'test-source');
  await page.evaluate(async () => {
    const video = document.createElement('video');
    video.src = new URL('../media/samples/spring.mp4', location.href).href;
    video.muted = true;
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(Error('Spring unavailable')); });
    video.currentTime = 25;
    await new Promise(resolve => video.onseeked = resolve);
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 536;
    const ctx = canvas.getContext('2d');
    const audio = new AudioContext();
    const source = audio.createMediaElementSource(video);
    const destination = audio.createMediaStreamDestination(); source.connect(destination);
    // Only connect to recording, never to speakers, to avoid audio feedback.
    video.muted = false;
    navigator.mediaDevices.getDisplayMedia = async () => {
      await audio.resume(); await video.play();
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const timer = setInterval(() => ctx.drawImage(video, 0, 0, canvas.width, canvas.height), 100);
      const stream = canvas.captureStream(10);
      for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
      window.__showcaseCleanup = () => { clearInterval(timer); video.pause(); audio.close(); };
      return stream;
    };
    document.querySelector('#source option[value="test-source"]').textContent = 'Spring · Blender Open Movie';
  });
  const capture = async name => {
    await page.screenshot({ path: path.join(output, name + '.png') });
    report.screenshots.push(name + '.png');
  };
  await page.locator('#observe').click();
  await waitState(page, async () => (await window.tvlens.state())?.segments.filter(s => s.status === 'ready').length >= 2, 90000);
  await page.locator('#question').fill('Décris brièvement le décor et les personnages visibles dans les passages déjà analysés.');
  await page.locator('#send').click();
  await waitState(page, async () => (await window.tvlens.deepState()).jobs.at(-1)?.status === 'done', 75000);
  await capture('direct');
  await page.locator('#keep-moment').click();
  await page.waitForTimeout(2200);
  await page.locator('#nav-memory').click();
  await waitState(page, async () => Boolean((await window.tvlens.recapState()).overview), 60000);
  await capture('memory');
  await page.locator('#nav-live').click();
  await page.locator('#float-mode').click();
  await capture('floating-bar');
  await page.locator('#float-chat').click();
  await capture('floating-chat');
  report.session = await page.evaluate(() => window.tvlens.state());
  report.answers = await page.evaluate(() => window.tvlens.deepState());
  report.recap = await page.evaluate(() => window.tvlens.recapState());
  await page.locator('#float-record').click();
  await page.evaluate(() => window.__showcaseCleanup?.());
  console.log(JSON.stringify({ screenshots: report.screenshots, errors: report.errors }));
} catch (error) {
  report.errors.push(error.message);
  const page = await app.firstWindow();
  report.diagnostic = await page.evaluate(() => ({notice:document.querySelector('#notice').textContent,state:document.querySelector('#state').textContent}));
  throw error;
} finally {
  // Detailed local evidence may contain provider metadata; do not publish it automatically.
  await fs.mkdir('.scratch/showcase', { recursive: true });
  await fs.writeFile('.scratch/showcase/report.json', JSON.stringify(report, null, 2));
  await app.close();
  if (userData) await fs.rm(userData, { recursive: true, force: true });
}

async function waitState(page, predicate, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return;
    await page.waitForTimeout(250);
  }
  throw new Error('Timed out waiting for live provider result');
}
