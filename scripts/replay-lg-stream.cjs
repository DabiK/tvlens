#!/usr/bin/env node
// Wall-clock replay of an LG-shaped stream (four 1280x720 PNG captures ~2 s apart and 8 s of
// 48 kHz stereo sound per block) through the real HTTP ingestion, media assembly, local store,
// thumbnails and local Whisper. Vision and chat are controlled fakes: no Codex, no OpenRouter.
// It listens on an ephemeral loopback port with a temporary data root, so it touches neither
// the TV nor an installed TVLens service. It measures the machine it runs on, nothing else.
//   node scripts/replay-lg-stream.cjs --model <ggml.bin> [--root <dir>] [--blocks 12] [--cpu-only]
//        [--threads 2] [--audio-ctx auto|<n>] [--vision-during-ask] [--audio-dir <dir of wav>] [--out file.json]
// Serve mode receives blocks from a real capture client instead of sending synthetic ones:
//   … --serve <seconds> [--bind <addr>] [--port <n>] --client-config <file> [--keep-audio <dir>]
// It writes the client pairing (url + one-time token) to --client-config with mode 600, never prints it,
// and reports numbers only: no transcript, no image, no address.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const flag = name => args.includes(name);
const root = path.resolve(option('--root', path.join(__dirname, '..')));
const load = file => require(path.join(root, file));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const stats = values => { const s = values.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? { n: s.length, mean: Math.round(s.reduce((a, b) => a + b, 0) / s.length), p50: Math.round(s[Math.floor((s.length - 1) / 2)]), max: Math.round(s.at(-1)) } : { n: 0 }; };
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const SENTENCES = [
  'Bonsoir à tous. Ce soir, le débat porte sur le budget de la santé et sur la réforme des retraites annoncée par le gouvernement.',
  'Le ministre affirme que les dépenses resteront stables, mais l’opposition conteste ces chiffres et réclame un audit indépendant.',
  'Sur le plateau, deux économistes comparent les prévisions de croissance et les recettes fiscales attendues pour l’année prochaine.',
  'La journaliste rappelle que le vote aura lieu jeudi, après une semaine de discussions entre les groupes parlementaires.',
  'Un médecin hospitalier décrit le manque de personnel aux urgences et les délais d’attente qui augmentent depuis trois ans.',
  'L’invité suivant défend au contraire la maîtrise des dépenses et propose de regrouper plusieurs établissements régionaux.',
  'Les téléspectateurs peuvent poser leurs questions en direct, et la première concerne le remboursement des soins dentaires.',
  'Le présentateur montre un graphique : la courbe des dépenses dépasse celle des recettes depuis le début de la décennie.',
  'Une députée répond que ce graphique oublie les cotisations exceptionnelles versées pendant la période de crise sanitaire.',
  'Après la pause, l’émission abordera le financement des transports publics et le prix des abonnements dans les grandes villes.',
  'Le maire d’une commune rurale explique que la dernière ligne de bus a été supprimée faute de voyageurs réguliers.',
  'En conclusion, chacun reconnaît que les chiffres présentés ce soir devront être vérifiés avant le vote de jeudi.',
];

async function fixtures(dir, blocks) {
  const sharp = require('sharp');
  const frames = [];
  for (let i = 0; i < 4; i++) {
    const raw = Buffer.alloc(1280 * 720 * 3);
    for (let p = 0; p < raw.length; p += 3) { const x = (p / 3) % 1280, y = Math.floor(p / 3 / 1280), grain = (x % 4 === 0 && y % 4 === 0) ? (x * 31 + y * 17 + i) % 23 : 0; raw[p] = ((x >> 2) + i * 40 + grain) & 255; raw[p + 1] = ((y >> 1) + grain) & 255; raw[p + 2] = (((x >> 5) ^ (y >> 5)) * 9 + i * 11) & 255; }
    frames.push((await sharp(raw, { raw: { width: 1280, height: 720, channels: 3 } }).png({ compressionLevel: 6 }).toBuffer()).toString('base64'));
  }
  const audio = [];
  const supplied = option('--audio-dir');
  if (supplied) {
    const files = (await fs.readdir(supplied)).filter(f => f.endsWith('.wav')).sort();
    if (files.length < blocks) throw Error(`--audio-dir doit contenir au moins ${blocks} fichiers WAV distincts.`);
    for (const f of files.slice(0, blocks)) audio.push((await fs.readFile(path.join(supplied, f))).toString('base64'));
  } else {
    for (let i = 0; i < blocks; i++) {
      const aiff = path.join(dir, `voice-${i}.aiff`), wav = path.join(dir, `voice-${i}.wav`);
      if (spawnSync('say', ['-v', 'Thomas', '-r', '185', '-o', aiff, `${SENTENCES[i % SENTENCES.length]} Passage ${i + 1}.`]).status) throw Error('Synthèse vocale indisponible : fournis --audio-dir avec des WAV distincts.');
      if (spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', aiff, '-af', 'apad', '-t', '8', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', wav]).status) throw Error('ffmpeg indisponible.');
      audio.push((await fs.readFile(wav)).toString('base64'));
    }
  }
  return { frames, audio };
}

(async () => {
  const model = option('--model');
  if (!model) throw Error('Usage : node scripts/replay-lg-stream.cjs --model <ggml.bin> [options]');
  await fs.access(model);
  const blocks = Number(option('--blocks', 12)), threads = Number(option('--threads', 2));
  const serveSeconds = option('--serve') === undefined ? 0 : Number(option('--serve'));
  const audioCtx = option('--audio-ctx') === undefined ? undefined : option('--audio-ctx') === 'auto' ? 'auto' : Number(option('--audio-ctx'));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-replay-'));
  let server, runtime;
  try {
    const { frames, audio } = serveSeconds ? {} : await fixtures(dir, blocks);
    let binary = option('--binary', 'whisper-cli');
    if (flag('--cpu-only')) { binary = path.join(dir, 'whisper-cpu'); await fs.writeFile(binary, `#!/bin/sh\nexec ${option('--binary', 'whisper-cli')} -ng "$@"\n`, { mode: 0o755 }); }
    const { RemoteServer } = load('server/http.cjs');
    const { HeadlessRuntime } = load('runtime/headless-runtime.cjs');
    const { RemoteMedia } = load('adapters/remote-media.cjs');
    const { CodexPerception } = load('adapters/codex-perception.cjs');
    const { LocalTranscriber } = load('adapters/local-transcriber.cjs');
    const rng = mulberry32(20261012);
    const counters = { visionCalls: 0, closes: 0, resets: 0 };
    // Vision latency is a model (3.1–5.2 s, docs/split-perception-live.json), never a measurement.
    const visionAgent = { async prepare() {}, async close() { counters.closes++; }, async reset() { counters.resets++; },
      async answer({ instructions, signal }) {
        counters.visionCalls++;
        await new Promise((resolve, reject) => { const timer = setTimeout(resolve, 3100 + rng() * 2100); signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true }); });
        const previous = /"previousTopic":"((?:[^"\\]|\\.)*)"/.exec(instructions)?.[1] || '';
        return { summary: 'Débat en plateau sur le budget.', visual: 'Deux personnes en plateau.', uncertainty: '', topic: 'Débat budgétaire', continuity: previous === 'Débat budgétaire' ? 'continue' : 'change', topicSummary: 'Débat sur le budget de la santé.' };
      } };
    const perception = new CodexPerception({ agent: visionAgent, sessionId: 'replay-observe',
      transcriber: new LocalTranscriber({ binary, model, threads, getLanguage: () => 'fr', ...(audioCtx === undefined ? {} : { audioCtx }) }) });
    const chatAgent = { async prepare() {}, async close() {},
      async answer({ tools, signal }) {
        await delay(1800); signal.throwIfAborted();
        const startMs = Math.max(0, tools.anchorMs - 16000);
        const seen = await tools.call('get_transcript', { startMs, endMs: tools.anchorMs });
        await delay(1200); signal.throwIfAborted();
        const used = seen.passages.filter(p => p.transcript || p.summary);
        return used.length ? { answer: 'Voici ce qui vient d’être dit.', kind: 'observation', citations: used.map(({ id, startMs, endMs }) => ({ id, startMs, endMs })), limits: [] } : { answer: 'Pas encore transcrit.', kind: 'insufficient', citations: [], limits: [] };
      } };
    const userData = path.join(dir, 'data');
    const config = { apiKey: '', transcriptionLanguage: 'fr', ffmpeg: 'ffmpeg', whisperBinary: binary, whisperModel: model, whisperThreads: threads, researchBudgetFile: path.join(userData, 'research-budget.json'), ...(flag('--vision-during-ask') ? { visionDuringAsk: true } : {}) };
    runtime = new HeadlessRuntime({ userData, sessionsRoot: path.join(userData, 'sessions'), config, transcriptionSettings: { save: async value => value },
      selectedModels: { observationModel: 'fake', inspectionModel: 'fake', codexModel: '' }, codexBinary: 'codex', smoke: true, overrides: { perception }, agent: chatAgent });
    const token = randomBytes(32).toString('hex');
    server = await new RemoteServer({ runtime, media: new RemoteMedia({ ffmpeg: 'ffmpeg' }), token }).listen(Number(option('--port', 0)), option('--bind', '127.0.0.1'));
    const request = async (route, body, timeoutMs) => {
      const t = performance.now();
      const response = await fetch(server.url + route, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
        ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}) });
      const text = await response.text();
      return { status: response.status, value: JSON.parse(text), bytes: Buffer.byteLength(text), ms: performance.now() - t };
    };
    const seen = new Map();
    runtime.listeners.add(state => {
      for (const s of state.session?.segments || []) {
        const p = seen.get(s.id) || seen.set(s.id, { id: s.id, startMs: s.startMs, endMs: s.endMs, firstSeenMs: state.session.elapsedMs }).get(s.id);
        if (p.transcriptAtMs === undefined && s.audioStatus === 'ready') p.transcriptAtMs = state.session.elapsedMs;
        if (p.readyAtMs === undefined && s.status === 'ready') p.readyAtMs = state.session.elapsedMs;
        Object.assign(p, { status: s.status, audioStatus: s.audioStatus, visionStatus: s.visionStatus, audioMs: s.audioMs, visionMs: s.visionMs, whisper: s.metrics?.whisper, assembleMs: s.ingest?.assembleMs, receivedMs: s.receivedMs });
      }
    });
    if (serveSeconds) {
      if (!option('--client-config')) throw Error('--serve demande --client-config <fichier>.');
      await fs.writeFile(option('--client-config'), JSON.stringify({ url: server.url, token }), { mode: 0o600 });
      console.error(`Serveur d’essai prêt pour ${serveSeconds} s (appairage écrit dans le fichier demandé).`);
      const until = performance.now() + serveSeconds * 1000;
      // Stop early once the client's session has drained and stayed quiet for a while.
      for (let quiet = 0; performance.now() < until && quiet < 12; ) {
        await delay(1000);
        const s = runtime.snapshot().session;
        quiet = s && seen.size && !s.pending && !s.analyzing && s.elapsedMs - s.capturedThroughMs > 12000 ? quiet + 1 : 0;
      }
      const final = runtime.snapshot(), passages = [...seen.values()];
      const kept = option('--keep-audio');
      if (kept && final.session) {
        await fs.mkdir(kept, { recursive: true, mode: 0o700 });
        for (const s of final.session.segments) { const media = await runtime.session.store.read(s.id).catch(() => null); if (media?.audio) await fs.writeFile(path.join(kept, `${s.id}.wav`), media.audio, { mode: 0o600 }); }
      }
      const all = final.session ? [...final.session.history, ...final.session.segments] : [];
      const report = { kind: 'Réception réelle sur port de test : ingestion HTTP, assemblage, stockage et Whisper réels ; vision et chat simulés ; aucun contenu conservé dans ce rapport', root, node: process.version, platform: `${os.platform()} ${os.arch()}`, cpus: os.availableParallelism(),
        settings: { serveSeconds, threads, audioCtx: audioCtx ?? 0, visionLatency: 'modèle 3,1–5,2 s' },
        passages: { count: passages.length, ready: passages.filter(p => p.status === 'ready').length, partial: passages.filter(p => p.status === 'partial').length, skipped: passages.filter(p => p.status === 'skipped').length,
          visionSkipped: passages.filter(p => p.visionStatus === 'skipped').length, audioError: passages.filter(p => p.audioStatus === 'error').length, blockMs: stats(passages.map(p => p.endMs - p.startMs)) },
        delaysMs: { arrivalAfterClose: stats(passages.map(p => p.receivedMs - p.endMs)), firstSeenAfterClose: stats(passages.map(p => p.firstSeenMs - p.endMs)), transcriptAfterClose: stats(passages.map(p => p.transcriptAtMs - p.endMs)), readyAfterClose: stats(passages.map(p => p.readyAtMs - p.endMs)),
          whisperWall: stats(passages.map(p => p.audioMs)), whisperEncode: stats(passages.map(p => p.whisper?.encodeMs)), whisperLoad: stats(passages.map(p => p.whisper?.loadMs)), assemble: stats(passages.map(p => p.assembleMs)) },
        content: { framesPerPassage: stats(all.map(s => s.metrics?.framesSent)), transcriptChars: stats(all.map(s => s.observation?.transcript?.length ?? NaN)), keptAudio: kept ? all.filter(s => s.hasAudio).length : 0 },
        captureGaps: final.captureGaps?.length, latency: final.session?.latency, coverage: final.session?.coverage, visionGaps: final.session?.visionGaps?.length, audioGaps: final.session?.audioGaps?.length, counters };
      if (option('--out')) await fs.writeFile(option('--out'), JSON.stringify(report, null, 1));
      console.log(JSON.stringify(report, null, 1));
      return;
    }
    const session = (await request('/v1/session/start', {})).value;
    const anchor = performance.now(), stamp = () => session.elapsedMs + performance.now() - anchor;
    const uploads = [], polls = [], questions = [];
    let polling = true;
    const poller = (async () => { while (polling) { try { const r = await request('/v1/state'); polls.push({ atMs: Math.round(stamp()), bytes: r.bytes, ms: r.ms }); } catch {} await delay(1000); } })();
    const sequence = Date.now();
    for (let i = 0; i < blocks; i++) {
      const startMs = stamp();
      await delay(8000);
      const endMs = stamp();
      const body = { sessionId: session.id, sequence: sequence + i, startMs, endMs, audio: audio[i],
        frames: frames.map((data, k) => ({ atMs: startMs + k * 2000, data, crop: { x: 0, y: 0, width: 1280, height: 720 } })) };
      // Like tv/transport.py: session check, then the block; five seconds per request, thirty per block;
      // a timeout or a 429 is retried after one second with the same sequence.
      uploads.push((async () => {
        const created = performance.now(); let retries = 0, timeouts = 0, slowest = 0;
        for (;;) {
          const attempt = performance.now();
          const r = await request('/v1/session', undefined, 5000).then(() => request('/v1/segments', body, 5000)).catch(() => null);
          slowest = Math.max(slowest, performance.now() - attempt);
          if (r?.status === 200) return { block: i + 1, id: r.value.id, endMs, ackAfterCloseMs: performance.now() - created, postMs: r.ms, retries, timeouts, duplicate: Boolean(r.value.duplicate) };
          if ((r && r.status !== 429) || performance.now() - created > 30000) return { block: i + 1, endMs, error: r?.value.error || 'délai dépassé', status: r?.status, retries, timeouts };
          if (!r) timeouts++;
          retries++; await delay(1000);
        }
      })());
      if ([4, 8].includes(i)) questions.push(request('/v1/questions', { question: `Que vient-il de dire ? (bloc ${i + 1})`, sessionId: session.id, anchorMs: stamp() }).then(r => r.value.id));
    }
    const sent = await Promise.all(uploads);
    for (let i = 0; i < 60; i++) { const s = runtime.snapshot().session; if (!s.pending && !s.analyzing && !s.asking) break; await delay(1000); }
    polling = false; await poller;
    const final = runtime.snapshot();
    const passages = [...seen.values()];
    const jobs = final.chat.jobs.map(j => ({ status: j.status, waitMs: j.metrics?.waitMs, totalMs: j.metrics?.totalMs, tools: j.metrics?.tools, evidence: j.metrics?.evidence, citations: j.result?.citations?.length }));
    const report = { kind: 'Rejeu mural isolé sur cet hôte : ingestion HTTP, assemblage, stockage et Whisper réels ; vision et chat simulés', root, node: process.version, platform: `${os.platform()} ${os.arch()}`, cpus: os.availableParallelism(),
      settings: { blocks, threads, cpuOnly: flag('--cpu-only'), audioCtx: audioCtx ?? 0, visionDuringAsk: flag('--vision-during-ask'), visionLatency: 'modèle 3,1–5,2 s' },
      uploads: { sent: sent.filter(s => s.id).length, failed: sent.filter(s => !s.id).length, retries: sent.reduce((n, s) => n + s.retries, 0), timeouts: sent.reduce((n, s) => n + s.timeouts, 0), postMs: stats(sent.map(s => s.postMs)), ackAfterCloseMs: stats(sent.map(s => s.ackAfterCloseMs)) },
      passages: { count: passages.length, ready: passages.filter(p => p.status === 'ready').length, partial: passages.filter(p => p.status === 'partial').length, skipped: passages.filter(p => p.status === 'skipped').length,
        visionSkipped: passages.filter(p => p.visionStatus === 'skipped').length, audioError: passages.filter(p => p.audioStatus === 'error').length },
      delaysMs: { firstSeenAfterClose: stats(passages.map(p => p.firstSeenMs - p.endMs)), transcriptAfterClose: stats(passages.map(p => p.transcriptAtMs - p.endMs)), readyAfterClose: stats(passages.map(p => p.readyAtMs - p.endMs)),
        whisperWall: stats(passages.map(p => p.audioMs)), whisperEncode: stats(passages.map(p => p.whisper?.encodeMs)), whisperLoad: stats(passages.map(p => p.whisper?.loadMs)), assemble: stats(passages.map(p => p.assembleMs)) },
      statePolls: { count: polls.length, ms: stats(polls.map(p => p.ms)), firstBytes: polls[0]?.bytes, lastBytes: polls.at(-1)?.bytes },
      questions: jobs, latency: final.session.latency, coverage: final.session.coverage, visionGaps: final.session.visionGaps?.length, counters,
      // Only for the synthetic sentences this script wrote: supplied audio may be real speech.
      ...(option('--audio-dir') ? {} : { transcriptSample: final.session.segments.slice(0, 2).map(s => s.observation?.transcript) }) };
    const out = option('--out');
    if (out) await fs.writeFile(out, JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report, null, 1));
    await request('/v1/session/end', {});
  } finally {
    await server?.close().catch(() => {});
    await runtime?.close().catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
  }
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
