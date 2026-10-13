#!/usr/bin/env node
// Wall-clock replay of ONE question that re-inspects the last seconds before its anchor, shaped like the real LG
// trial: 8 s blocks through the real HTTP ingestion, media assembly, local store, frame extraction, contact sheets
// and local Whisper, with one transcriber shared by the background lane and the re-inspection as in the server.
// By default the three models are fixed-latency fakes: they prove the orchestration, never the quality of an answer.
// --live uses the real Codex agents of this host instead. It listens on an ephemeral loopback port with a temporary
// data root, so it touches neither the TV nor an installed TVLens service.
// --root runs the same driver against another source tree (a baseline copy) on the same media and settings.
//   prepare : node scripts/replay-reinspection.cjs --prepare <video> --blocks-dir <dir> [--offset-s 60] [--blocks 6]
//   replay  : node scripts/replay-reinspection.cjs --model <ggml.bin> --blocks-dir <dir> [--root <dir>] [--threads 2]
//             [--language fr] [--ask-block 4] [--ask-offset-ms 3900] [--turn-ms 7900] [--window-ms 10000]
//             [--cpu-only] [--question <text>] [--live [--codex-model <m>] [--effort low]] [--print-text] [--out file.json]
// It reports numbers, ids and intervals only; --print-text adds the answer and observations (public media only).
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const flag = name => args.includes(name);
const root = path.resolve(option('--root', path.join(__dirname, '..')));
const load = file => require(path.join(root, file));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const wait = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});
const words = text => (typeof text === 'string' && text.trim() ? text.trim().split(/\s+/).length : 0);
const BLOCK_MS = 8000;

// Duration announced by a RIFF header, to tell an excerpt from a whole passage without reading speech.
function wavMs(audio) {
  if (!audio?.length) return 0;
  const b = Buffer.from(audio); let byteRate = 0;
  for (let at = 12; at + 8 <= b.length;) {
    const id = b.toString('ascii', at, at + 4), size = b.readUInt32LE(at + 4);
    if (id === 'fmt ') byteRate = b.readUInt32LE(at + 16);
    if (id === 'data') return byteRate ? Math.round(Math.min(size, b.length - at - 8) / byteRate * 1000) : 0;
    at += 8 + size + (size & 1);
  }
  return 0;
}
// The passages handed to the inspection model, read back from its prompt: counts and intervals only.
function described(instructions) {
  const start = instructions.indexOf('[{"id":"moment-');
  if (start < 0) return [];
  let depth = 0, quoted = false;
  for (let i = start; i < instructions.length; i++) {
    const c = instructions[i];
    if (quoted) { if (c === '\\') i++; else if (c === '"') quoted = false; continue; }
    if (c === '"') quoted = true; else if (c === '[' || c === '{') depth++;
    else if ((c === ']' || c === '}') && --depth === 0) {
      return JSON.parse(instructions.slice(start, i + 1)).map(({ transcript, limits, ...rest }) => ({ ...rest, transcriptWords: words(transcript), limits: (limits || []).length }));
    }
  }
  return [];
}

async function prepare(video, dir, offsetS, blocks) {
  for (let i = 0; i < blocks; i++) {
    const out = path.join(dir, `block-${String(i + 1).padStart(2, '0')}`);
    await fs.mkdir(out, { recursive: true });
    const cut = ['-nostdin', '-v', 'error', '-y', '-ss', String(offsetS + i * BLOCK_MS / 1000), '-t', String(BLOCK_MS / 1000), '-i', video];
    if (spawnSync('ffmpeg', [...cut, '-vf', 'fps=1/2,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2', '-frames:v', '4', '-q:v', '3', path.join(out, 'frame-%d.jpg')]).status) throw Error('ffmpeg : images du bloc.');
    if (spawnSync('ffmpeg', [...cut, '-vn', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', path.join(out, 'audio.wav')]).status) throw Error('ffmpeg : audio du bloc.');
  }
}
async function readBlocks(dir) {
  const names = (await fs.readdir(dir)).filter(name => /^block-\d+$/.test(name)).sort();
  return Promise.all(names.map(async name => {
    const files = (await fs.readdir(path.join(dir, name))).filter(f => f.endsWith('.jpg')).sort();
    return { audio: (await fs.readFile(path.join(dir, name, 'audio.wav'))).toString('base64'),
      frames: await Promise.all(files.map(async f => (await fs.readFile(path.join(dir, name, f))).toString('base64'))) };
  }));
}

(async () => {
  if (option('--prepare')) return prepare(option('--prepare'), option('--blocks-dir'), Number(option('--offset-s', 60)), Number(option('--blocks', 6)));
  const model = option('--model');
  if (!model || !option('--blocks-dir')) throw Error('Usage : node scripts/replay-reinspection.cjs --model <ggml.bin> --blocks-dir <dir> [options]');
  await fs.access(model);
  const blocks = await readBlocks(option('--blocks-dir'));
  const threads = Number(option('--threads', 2)), language = option('--language', 'fr'), live = flag('--live');
  const askBlock = Number(option('--ask-block', 4)), askOffsetMs = Number(option('--ask-offset-ms', 3900));
  const turnMs = Number(option('--turn-ms', 7900)), windowMs = Number(option('--window-ms', 10000));
  const question = option('--question', 'Que se passe-t-il à l’image dans les dix dernières secondes ?');
  if (blocks.length < askBlock + 1) throw Error('--blocks-dir doit contenir au moins un bloc après celui de la question.');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-reinspect-'));
  let server, runtime;
  try {
    const { RemoteServer } = load('server/http.cjs');
    const { HeadlessRuntime } = load('runtime/headless-runtime.cjs');
    const { RemoteMedia } = load('adapters/remote-media.cjs');
    const { CodexPerception } = load('adapters/codex-perception.cjs');
    const { LocalTranscriber } = load('adapters/local-transcriber.cjs');
    // Who asked for a transcription: the re-inspection runs inside this store, the background lane outside.
    const caller = new AsyncLocalStorage();
    const whisper = { launches: [], requests: [] }, inspections = [], toolResults = [];
    let clock = () => null;
    const instrument = transcriber => {
      const transcribe = transcriber.transcribe.bind(transcriber), run = transcriber.run.bind(transcriber);
      transcriber.transcribe = async (audio, signal) => {
        const entry = { caller: caller.getStore() || 'lane', atMs: clock(), audioMs: wavMs(audio) }, started = performance.now();
        whisper.requests.push(entry);
        try { const r = await transcribe(audio, signal); Object.assign(entry, { ms: Math.round(performance.now() - started), cacheHit: Boolean(r.cacheHit), failed: r.metrics?.failed === true }); return r; }
        catch (error) { entry.aborted = true; throw error; }
      };
      // One call per whisper-cli process actually started.
      transcriber.run = (job, signal) => {
        const entry = { caller: caller.getStore() || 'lane', atMs: clock(), audioMs: wavMs(job.bytes) }, started = performance.now();
        whisper.launches.push(entry);
        return run(job, signal).finally(() => { entry.ms = Math.round(performance.now() - started); });
      };
      return transcriber;
    };
    // Fixed latencies taken from the real trial (vision 3.3 s, image comparison 5.5 s): modelled, never measured here.
    const visionAgent = { async prepare() {}, async close() {}, async reset() {},
      async answer({ instructions, signal }) {
        await wait(3300, signal);
        const previous = /"previousTopic":"((?:[^"\\]|\\.)*)"/.exec(instructions)?.[1] || '';
        return { summary: 'Résumé simulé.', visual: 'Description simulée.', uncertainty: '', topic: 'Sujet simulé', continuity: previous === 'Sujet simulé' ? 'continue' : 'change', topicSummary: 'Résumé de sujet simulé.' };
      } };
    const inspectAgent = { async prepare() {}, async close() {}, async reset() {},
      async answer({ instructions, outputSchema, signal }) {
        await wait(5500, signal);
        const basis = outputSchema?.properties?.observations?.items?.properties?.basis ? { basis: 'images' } : {};
        return { observations: described(instructions).map(p => ({ id: p.id, startMs: p.startMs, endMs: p.endMs, text: 'Observation simulée.', ...basis })), hypotheses: [], limits: [] };
      } };
    const chatAgent = { async prepare() {}, async close() {},
      async answer({ tools, signal }) {
        await wait(turnMs, signal);
        const result = await tools.call('inspect_clip', { startMs: Math.max(0, tools.anchorMs - windowMs), endMs: tools.anchorMs, question });
        await wait(600, signal);
        return { answer: 'Réponse simulée.', kind: 'observation', citations: result.observations.map(({ id, startMs, endMs }) => ({ id, startMs, endMs })), limits: result.limits };
      } };
    // --cpu-only keeps Whisper off the GPU (a Mac otherwise transcribes in a fraction of a second on Metal).
    let binary = option('--binary', 'whisper-cli');
    if (flag('--cpu-only')) { binary = path.join(dir, 'whisper-cpu'); await fs.writeFile(binary, `#!/bin/sh\nexec ${option('--binary', 'whisper-cli')} -ng "$@"\n`, { mode: 0o755 }); }
    const userData = path.join(dir, 'data');
    const config = { apiKey: '', transcriptionLanguage: language, ffmpeg: 'ffmpeg', whisperBinary: binary, whisperModel: model, whisperThreads: threads,
      researchBudgetFile: path.join(userData, 'research-budget.json'), ...(live ? { chatReasoningEffort: option('--effort', 'low') } : {}) };
    const codexModel = option('--codex-model', 'gpt-6-luna');
    let transcriber = live ? null : instrument(new LocalTranscriber({ binary, model, threads, getLanguage: () => language }));
    runtime = new HeadlessRuntime({ userData, sessionsRoot: path.join(userData, 'sessions'), config, transcriptionSettings: { save: async value => value },
      selectedModels: { observationModel: codexModel, inspectionModel: codexModel, codexModel }, codexBinary: option('--codex', 'codex'), smoke: false,
      ...(live ? {} : { agent: chatAgent, overrides: { perception: new CodexPerception({ agent: visionAgent, sessionId: 'replay-observe', transcriber }) } }) });
    // Every tool result the chat agent received, without its text.
    const makeTools = runtime.deep.makeTools;
    runtime.deep.makeTools = (...input) => {
      const tools = makeTools(...input), call = tools.call.bind(tools);
      tools.call = async (name, input) => {
        const asked = { startMs: input.startMs, endMs: input.endMs, ...(input.exactSpeech === undefined ? {} : { exactSpeech: input.exactSpeech }) };
        // A refused call is part of the measurement: its bounds and the refusal, which is the application's own text.
        const result = await call(name, input).catch(error => { toolResults.push({ tool: name, input: asked, refused: error.message }); throw error; });
        toolResults.push({ tool: name, input: asked, fields: Object.keys(result), inspected: result.inspected, intervals: result.intervals,
          observations: (result.observations || []).map(({ text, ...o }) => ({ ...o, ...(flag('--print-text') ? { text } : { chars: text.length }) })), limits: flag('--print-text') ? result.limits : (result.limits || []).length });
        return result;
      };
      return tools;
    };
    const token = randomBytes(32).toString('hex');
    server = await new RemoteServer({ runtime, media: new RemoteMedia({ ffmpeg: 'ffmpeg' }), token }).listen(0, '127.0.0.1');
    const request = async (route, body) => {
      const t = performance.now();
      const response = await fetch(server.url + route, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, value: JSON.parse(await response.text()), ms: performance.now() - t };
    };
    const session = (await request('/v1/session/start', {})).value;
    const origin = performance.now(), stamp = () => session.elapsedMs + performance.now() - origin;
    clock = () => Math.round(stamp());
    // The server shares one transcriber between both lanes; the simulated composition must do the same.
    const inspection = runtime.session.inspectorModel;
    if (live) transcriber = instrument(runtime.session.transcriber);
    else Object.assign(inspection, { transcriber, agent: inspectAgent });
    const inspect = inspection.inspect.bind(inspection), describe = inspection.describe.bind(inspection);
    inspection.inspect = input => caller.run('inspect', () => inspect(input));
    inspection.describe = async (instructions, mediaInput, ...rest) => {
      const entry = { atMs: clock(), images: mediaInput.length, passages: described(instructions) }, started = performance.now();
      inspections.push(entry);
      try { return await describe(instructions, mediaInput, ...rest); } finally { entry.modelMs = Math.round(performance.now() - started); }
    };
    const uploads = [], sequence = Date.now();
    let asked, anchorMs;
    for (let i = 0; i < blocks.length; i++) {
      const startMs = stamp();
      await delay(BLOCK_MS);
      const endMs = stamp();
      uploads.push(request('/v1/segments', { sessionId: session.id, sequence: sequence + i, startMs, endMs, audio: blocks[i].audio,
        frames: blocks[i].frames.map((data, k) => ({ atMs: startMs + k * 2000, data })) }).then(r => ({ block: i + 1, status: r.status, id: r.value.id, postMs: Math.round(r.ms) })));
      if (i + 1 === askBlock) setTimeout(() => { anchorMs = stamp(); asked = request('/v1/questions', { question, sessionId: session.id, anchorMs }).then(r => r.value.id); }, askOffsetMs);
    }
    const sent = await Promise.all(uploads), jobId = await asked;
    for (let i = 0; i < 150; i++) { const s = runtime.snapshot(); if (!s.session.pending && !s.session.analyzing && !s.chat.jobs.some(j => ['queued', 'running'].includes(j.status))) break; await delay(1000); }
    const final = runtime.snapshot(), job = final.chat.jobs.find(j => j.id === jobId) || {};
    const report = { kind: live ? 'Rejeu mural isolé d’une question avec réexamen : ingestion, extraction, planches, Whisper et agents Codex réels de cet hôte'
      : 'Rejeu mural isolé d’une question avec réexamen : ingestion, extraction, planches et Whisper réels ; vision, réexamen et chat simulés à latence fixe',
      root, node: process.version, platform: `${os.platform()} ${os.arch()}`, cpus: os.availableParallelism(),
      settings: { blocks: blocks.length, threads, cpuOnly: flag('--cpu-only'), language, askBlock, askOffsetMs, turnMs: live ? null : turnMs, windowMs: live ? null : windowMs, live, ...(live ? { codexModel, effort: config.chatReasoningEffort } : { modelledMs: { vision: 3300, inspection: 5500, writing: 600 } }) },
      uploads: sent,
      question: { status: job.status, ...(job.status === 'error' ? { error: job.message } : {}), kind: job.result?.kind, anchorMs, totalMs: job.metrics?.totalMs, endToEndMs: job.metrics?.endToEndMs, tools: job.metrics?.tools, inspectionCacheHits: job.metrics?.inspectionCacheHits,
        validation: job.validation && { evidenceCount: job.validation.evidenceCount, proposedCitations: job.validation.proposedCitations, acceptedCitations: job.validation.acceptedCitations },
        citations: job.result?.citations, citationsAfterAnchor: (job.result?.citations || []).filter(c => c.endMs > anchorMs).length, limits: (job.result?.limits || []).length, answerChars: job.result?.answer?.length,
        ...(flag('--print-text') ? { answer: job.result?.answer, limitsText: job.result?.limits, audit: job.audit } : {}) },
      toolResults, inspections,
      whisper: { hits: transcriber.hits, misses: transcriber.misses, launches: whisper.launches, requests: whisper.requests,
        byInspection: { launches: whisper.launches.filter(l => l.caller === 'inspect').length, requests: whisper.requests.filter(r => r.caller === 'inspect').length, cacheHits: whisper.requests.filter(r => r.caller === 'inspect' && r.cacheHit).length,
          waitedMs: whisper.requests.filter(r => r.caller === 'inspect').reduce((sum, r) => sum + (r.ms || 0), 0) } },
      passages: [...final.session.history, ...final.session.segments].map(s => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, status: s.status, audioStatus: s.audioStatus, visionStatus: s.visionStatus, receivedMs: s.receivedMs, assembleMs: s.ingest?.assembleMs, audioStartedMs: s.audioStartedMs,
        transcriptPublishedMs: s.transcriptPublishedMs, audioMs: s.audioMs, visionMs: s.visionMs, audioCacheHit: s.metrics?.audioCacheHit, whisper: s.metrics?.whisper, transcriptWords: words(s.observation?.transcript) })),
      coverage: final.session.coverage };
    if (option('--out')) await fs.writeFile(option('--out'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report, null, 1));
    await request('/v1/session/end', {});
  } finally {
    await server?.close().catch(() => {});
    await runtime?.close().catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
  }
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
