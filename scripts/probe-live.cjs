// Explicit live API test. Sends only the licensed Spring sample, never a desktop capture.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { WatchSession } = require('../core/session.cjs');
const { OpenRouterAdapter } = require('../adapters/openrouter.cjs');
const { LocalSessionStore } = require('../adapters/local-store.cjs');
const { TrialBudget } = require('../adapters/trial-budget.cjs');
const run = promisify(execFile);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('Clé manquante.');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-live-'));
  const sample = path.resolve('media/samples/spring.mp4');
  const model = process.env.OPENROUTER_MODEL;
  const audioInput = process.env.OPENROUTER_AUDIO_INPUT !== 'false';
  const adapter = new OpenRouterAdapter({ apiKey: process.env.OPENROUTER_API_KEY, model, audioInput, budget: model.endsWith(':free') ? undefined : new TrialBudget(path.resolve('.local/trial-budget.json')) });
  const timings = [];
  const perception = { observe: async segment => {
    const t = performance.now(); const result = await adapter.observe(segment);
    timings.push({ operation: 'observe', id: segment.id, ms: Math.round(performance.now() - t) });
    return result;
  } };
  const store = new LocalSessionStore(path.join(root, 'session'));
  let now = 0;
  const watch = new WatchSession({ id: 'live-validation', now: () => now, perception, answer: adapter, media: store, archive: store });
  try {
    for (const [index, offset] of [60, 120].entries()) {
      const dir = path.join(root, `input-${index}`); await fs.mkdir(dir);
      const ff = args => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(offset), '-i', sample, '-t', '15', ...args], { env: { PATH: process.env.PATH } });
      await Promise.all([
        ff(['-vf', 'fps=1/5,scale=768:-2', '-q:v', '4', path.join(dir, 'frame-%02d.jpg')]),
        ff(['-vn', '-ac', '1', '-ar', '16000', path.join(dir, 'audio.wav')]),
        ff(['-vf', 'scale=768:-2', '-r', '10', '-c:v', 'libvpx', '-deadline', 'realtime', '-b:v', '600k', '-c:a', 'libopus', path.join(dir, 'clip.webm')])
      ]);
      const names = (await fs.readdir(dir)).filter(x => x.endsWith('.jpg')).sort();
      const frames = await Promise.all(names.map(async (f, n) => ({ atMs: index * 15000 + n * 5000, dataUrl: 'data:image/jpeg;base64,' + (await fs.readFile(path.join(dir, f))).toString('base64') })));
      now = (index + 1) * 15000;
      await watch.ingest({ startMs: index * 15000, endMs: now, frames, clip: await fs.readFile(path.join(dir, 'clip.webm')), audio: await fs.readFile(path.join(dir, 'audio.wav')) });
      const deadline = Date.now() + 90000;
      while ((watch.running || watch.queue.length) && Date.now() < deadline) await sleep(100);
      const segment = watch.segments.at(-1);
      if (segment.status !== 'ready') throw new Error(segment.error || 'Analyse non terminée.');
      console.log(JSON.stringify({ step: 'perception', moment: segment.id, observation: segment.observation }));
    }
    const answers = [];
    for (const question of ['Qu’est-ce qui vient de se passer ?', 'Que voyait-on il y a vingt secondes, dans le premier passage ?', 'Quel est le nom exact du village où le personnage est né ?']) {
      const t = performance.now(); const response = await watch.ask(question);
      timings.push({ operation: 'ask', ms: Math.round(performance.now() - t) });
      answers.push(response); console.log(JSON.stringify({ step: 'ask', ...response }));
    }
    const observations = watch.segments.map(s => ({ id: s.id, observation: s.observation }));
    now = 340000; await watch.prune();
    const report = { date: new Date().toISOString(), model, sample: 'Spring, source video 60–75s and 120–135s', note: 'Prepared segments; app capture tested separately with synthetic media.', timings, observations, answers, totalCalls: watch.apiCalls, reportedCost: watch.apiCost, retention: { remainingRawSegments: watch.segments.filter(s => s.available).length, preservedSummaries: watch.history.length }, checks: { recentCitesSecond: answers[0].citations.some(c => c.id === 'moment-2'), pastCitesFirst: answers[1].citations.some(c => c.id === 'moment-1'), absentContextAbstains: answers[2].kind === 'insufficient' } };
    await fs.writeFile('docs/live-validation.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ report: 'docs/live-validation.json', checks: report.checks, retention: report.retention, timings, reportedCost: report.reportedCost }));
    if (!Object.values(report.checks).every(Boolean)) process.exitCode = 1;
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
