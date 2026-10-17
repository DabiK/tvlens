#!/usr/bin/env node
// Offline wall-clock micro-benchmarks of local backend compute (no provider, no network).
// They measure this machine, not the VPS or a GX10: compare ratios, not absolute values.
//   node scripts/bench-backend.cjs [--root <dir>] [--only state,assemble,research] [--out file.json]
// --root points at a source tree (default: this checkout), e.g. an extracted baseline.
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const root = path.resolve(option('--root', path.join(__dirname, '..')));
const only = new Set(String(option('--only', 'state,assemble,research')).split(','));
const load = file => require(path.join(root, file));

const median = values => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const round = value => value === null ? null : Math.round(value * 1000) / 1000;
function timeSync(fn, repeats = 15) {
  const samples = [];
  for (let i = 0; i < repeats; i++) { const t = performance.now(); fn(); samples.push(performance.now() - t); }
  return round(median(samples));
}
async function timeAsync(fn, repeats = 7) {
  const samples = [];
  for (let i = 0; i < repeats; i++) { const t = performance.now(); await fn(); samples.push(performance.now() - t); }
  return { medianMs: round(median(samples)), minMs: round(Math.min(...samples)), maxMs: round(Math.max(...samples)), samples: samples.map(round) };
}

// Text sizes follow the adapter limits and an ordinary 8 s spoken passage.
const filler = (seed, length) => {
  const words = ['le', 'débat', 'porte', 'sur', 'budget', 'santé', 'réforme', 'ministre', 'affirme', 'opposition', 'conteste', 'chiffres', 'audit', 'vote', 'jeudi', 'plateau', 'invité', 'répond', 'question', 'journaliste'];
  let text = '';
  for (let i = seed; text.length < length; i++) text += words[(i * 7 + seed) % words.length] + ' ';
  return text.slice(0, length).trim();
};
// A source tree that stamps its passages (it has core/latency-trace.cjs) carries more per passage:
// the fixture must carry it too, or the state size would look unchanged.
const stamped = require('node:fs').existsSync(path.join(root, 'core/latency-trace.cjs'));
function passage(i, archived) {
  const startMs = i ? 2000 + (i - 1) * 8000 : 0, endMs = 2000 + i * 8000;
  const stamps = stamped ? { receivedMs: endMs + 650, audioStartedMs: endMs + 660, visionQueuedMs: endMs + 5800, visionStartedMs: endMs + 5800, visionPublishedMs: endMs + 9900, revision: 2, ingest: { assembleMs: 540 } } : {};
  const metrics = { audioCacheHit: false, whisper: { loadMs: 170.2, melMs: 22.1, sampleMs: 310.4, encodeMs: 3550.9, decodeMs: 6.2, batchdMs: 1890.3, promptMs: 0, totalMs: 5180.5, logprobFallbacks: 0, entropyFallbacks: 0, threads: 2, elapsedMs: 5187.4, ...(stamped ? { audioCtx: 0 } : {}) },
    framesSent: 4, recentContextCount: 3, contextChars: 2400, lightweight: false, providerUsd: null, ...(stamped ? { coldStart: false, connectMs: 0, threadReset: false, threadTurn: 7 } : {}) };
  const observation = { topic: `Sujet ${Math.floor(i / 12)}`, topicContinuity: i % 12 ? 'continue' : 'change',
    summary: filler(i, 240), visual: filler(i + 3, 180), transcript: filler(i + 5, 150),
    audio: 'Paroles transcrites localement.', uncertainty: filler(i + 9, 160) };
  const first = Math.floor(i / 12) * 12;
  const base = { id: `moment-${i + 1}`, startMs, endMs, status: 'ready', audioStatus: 'ready', visionStatus: 'ready',
    observation, topicSummary: { text: filler(i + 11, 900), firstId: `moment-${first + 1}`, lastId: `moment-${i + 1}`, startMs: first ? 2000 + (first - 1) * 8000 : 0, endMs },
    thumbnailAvailable: true, audioMs: 5200, visionMs: 4100, transcriptPublishedMs: endMs + 5600 };
  return archived ? { ...base, ...stamps, summary: observation.summary } : { ...base, ...stamps, hasAudio: true, available: true, analysisMs: 9300, metrics };
}
function populatedSession(count) {
  const { WatchSession } = load('core/session.cjs');
  let saved = 0;
  const watch = new WatchSession({ id: 'bench', now: () => 2000 + count * 8000,
    perception: { transcribe: async () => ({}), observeVisual: async () => ({}) },
    media: { put: async () => {}, read: async () => ({ frames: [], audio: null }), remove: async () => {} },
    archive: { save: async () => { saved++; } } });
  const live = Math.min(count, 37); // five minutes of 8 s passages stay detailed
  for (let i = 0; i < count; i++) (i < count - live ? watch.history : watch.segments).push(passage(i, i < count - live));
  watch.sequence = count;
  return watch;
}

async function benchState() {
  const { sessionTimeline } = load('core/session-timeline.cjs');
  const { VideoTools, consultationOf } = load('core/video-tools.cjs');
  const { perceptionContext } = load('core/perception-context.cjs');
  const rows = [];
  for (const count of [75, 450, 900, 1800]) {
    const watch = populatedSession(count);
    const snapshot = watch.snapshot(), view = watch.memoryView();
    const state = () => { const session = watch.snapshot(); return { session, timeline: sessionTimeline(session), chat: { jobs: [] }, captureGaps: [] }; };
    const payload = JSON.stringify(state());
    rows.push({ passages: count, observedMinutes: round((2000 + count * 8000) / 60000),
      snapshotMs: timeSync(() => watch.snapshot()),
      archiveStringifyMs: timeSync(() => JSON.stringify(snapshot, null, 2)),
      archiveBytes: Buffer.byteLength(JSON.stringify(snapshot, null, 2)),
      timelineMs: timeSync(() => sessionTimeline(snapshot)),
      statePollMs: timeSync(() => JSON.stringify(state())),
      statePollBytes: Buffer.byteLength(payload),
      questionToolsMs: timeSync(() => new VideoTools({ consultation: consultationOf(view), search: {}, inspector: {}, media: {} })),
      perceptionContextMs: timeSync(() => perceptionContext(watch, watch.segments.at(-1))) });
  }
  return rows;
}

async function benchAssemble() {
  const sharp = require('sharp');
  const { RemoteMedia } = load('adapters/remote-media.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-bench-'));
  try {
    // The LG sends four 1280x720 PNG captures and 8 s of 48 kHz stereo PCM per block.
    const frames = [];
    for (let i = 0; i < 4; i++) {
      const raw = Buffer.alloc(1280 * 720 * 3);
      // Gradients with fine texture: a few hundred kB once compressed, below the 1.5 MB frame limit.
      for (let p = 0; p < raw.length; p += 3) { const x = (p / 3) % 1280, y = Math.floor(p / 3 / 1280), grain = (x % 4 === 0 && y % 4 === 0) ? (x * 31 + y * 17 + i) % 23 : 0; raw[p] = ((x >> 2) + i * 40 + grain) & 255; raw[p + 1] = ((y >> 1) + grain) & 255; raw[p + 2] = (((x >> 5) ^ (y >> 5)) * 9 + i * 11) & 255; }
      const png = await sharp(raw, { raw: { width: 1280, height: 720, channels: 3 } }).png({ compressionLevel: 6 }).toBuffer();
      if (png.length > 1500000) throw Error('Image de banc trop volumineuse.');
      frames.push({ atMs: 10000 + i * 2000, data: png.toString('base64'), crop: { x: 0, y: 0, width: 1280, height: 720 } });
    }
    const wav = path.join(dir, 'tv.wav');
    const made = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=8', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', wav]);
    if (made.status) throw Error('ffmpeg indisponible pour le banc.');
    const input = { sessionId: 'bench', sequence: 1, startMs: 10000, endMs: 18000, frames, audio: (await fs.readFile(wav)).toString('base64') };
    const media = new RemoteMedia({ ffmpeg: 'ffmpeg' });
    await media.assemble(input); // warm the file cache and sharp's thread pool
    const result = await timeAsync(() => media.assemble(input), 9);
    return { ...result, frameBytes: frames.map(f => Math.round(f.data.length * 0.75)), audioBytes: Math.round(input.audio.length * 0.75) };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

async function benchResearch() {
  const { LocalSessionStore } = load('adapters/local-store.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-bench-'));
  try {
    const store = new LocalSessionStore(dir);
    // One streamed answer: the client emits a preview at most every 80 ms.
    const jobs = Array.from({ length: 12 }, (_, i) => ({ id: `deep-${i + 1}`, question: filler(i, 80), status: 'done', activity: Array.from({ length: 8 }, (_, k) => ({ message: filler(k, 40), at: k })), preview: filler(i, 900),
      result: { answer: filler(i + 2, 900), citations: [{ id: 'moment-3', startMs: 18000, endMs: 26000 }], observations: [], limits: [filler(i, 120)] } }));
    const events = 150; // ~12 s of streaming
    const t = performance.now();
    let last;
    for (let i = 0; i < events; i++) { jobs.at(-1).preview = filler(i, 200 + i * 6); last = store.saveResearch({ jobs }); await new Promise(resolve => setImmediate(resolve)); }
    const queuedMs = performance.now() - t;
    await last;
    const persisted = JSON.parse(await fs.readFile(path.join(dir, 'deep-answers.json'), 'utf8'));
    return { events, enqueueMs: round(queuedMs), drainedMs: round(performance.now() - t), lastStatePersisted: persisted.jobs.at(-1).preview === jobs.at(-1).preview };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

(async () => {
  const report = { root, node: process.version, platform: `${os.platform()} ${os.arch()}`, cpus: os.availableParallelism(), loadAverage: os.loadavg().map(round) };
  if (only.has('state')) report.state = await benchState();
  if (only.has('assemble')) report.assemble = await benchAssemble();
  if (only.has('research')) report.research = await benchResearch();
  const text = JSON.stringify(report, null, 1);
  const out = option('--out');
  if (out) await fs.writeFile(out, text);
  console.log(text);
})().catch(error => { console.error(error); process.exit(1); });
