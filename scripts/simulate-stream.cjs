#!/usr/bin/env node
// Deterministic replay of a capture stream through the real orchestration (WatchSession,
// CodexPerception, DeepAsk, VideoTools, MemorySearch) with controlled providers and a
// virtual clock. It checks ordering, bounded budgets, losses and evidence freshness.
// Provider latencies are MODELS taken from the historical measurements quoted in
// docs/backend-latency-optimization.md: results validate orchestration, never the real
// speed or quality of Whisper, Codex or OpenRouter.
//   node scripts/simulate-stream.cjs [--root <dir>] [--scenario <name|all>] [--seed <n>] [--out file.json]
//        [--vision-during-ask] [--no-background-index] [--embed-request-ms <n>]
//   node scripts/simulate-stream.cjs --diff before.json after.json
const path = require('node:path');
const fs = require('node:fs');
const { VirtualClock } = require('../tests/helpers/clock.cjs');

const realSetImmediate = setImmediate;
const settle = async () => { for (let i = 0; i < 2; i++) await new Promise(resolve => realSetImmediate(resolve)); };

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const abort = () => { clearTimeout(timer); reject(signal.reason); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
  signal?.addEventListener('abort', abort, { once: true });
});
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const between = (rng, [low, high]) => low + (high - low) * rng();

// Latency models. Sources: docs/whisper-threads-live.json and transcription-language-live.json
// (VPS Whisper, 8 s blocks), docs/split-perception-live.json (Luna vision 3.1–6.9 s, mean 4.1),
// docs/codex-speed-live.json (a first call is ≈ 3 s slower than a warm one; chat 2.9–5.9 s).
// That 3 s is split conservatively: coldStartMs is the App Server process start measured
// locally without credentials (54–454 ms, thread start 3–8 ms); the rest, freshThreadTurnMs,
// is charged to the first turn of ANY new thread, so a rotated thread still pays it.
// Embedding and transport delays are assumptions, not measurements.
const MODELS = {
  vps: { asrMs: [4400, 6600], asrSlowMs: [8500, 10300], asrSlowRate: 0.08, visionMs: [3100, 5200], visionSlowMs: [5200, 6900], visionSlowRate: 0.05,
    coldStartMs: 400, threadStartMs: 10, freshThreadTurnMs: 2600, inspectPrepMs: 500, inspectMs: [4000, 7000], chatFirstMs: [1700, 3600], chatRestMs: [1100, 2300], chatStepMs: [900, 1600],
    embedRequestMs: 350, embedPerTextMs: 4, transportMs: [600, 1400], assembleMs: [300, 700] },
  mac: { asrMs: [380, 720], asrSlowMs: [900, 1400], asrSlowRate: 0.04, visionMs: [3100, 5200], visionSlowMs: [5200, 6900], visionSlowRate: 0.05,
    coldStartMs: 400, threadStartMs: 10, freshThreadTurnMs: 2600, inspectPrepMs: 300, inspectMs: [4000, 7000], chatFirstMs: [1700, 3600], chatRestMs: [1100, 2300], chatStepMs: [900, 1600],
    embedRequestMs: 350, embedPerTextMs: 4, transportMs: [15, 40], assembleMs: [0, 0] },
};
const QUESTIONS = {
  recent: 'Ça parle de quoi ?',
  transcript: 'Que vient-il de dire exactement ?',
  search: 'Retrouve le moment où il est question du budget',
  inspect: 'Que fait la personne à l’écran à ce moment ?',
};
const every = (kinds, firstMs, stepMs, untilMs) => { const list = []; for (let at = firstMs, i = 0; at < untilMs; at += stepMs, i++) list.push({ atMs: at, kind: kinds[i % kinds.length] }); return list; };
const SCENARIOS = {
  // LG cadence to a CPU host: 8 s blocks, four frames ~2 s apart, upload then assembly.
  'lg-vps': { description: 'LG → hôte CPU, 10 min, questions intercalées, annulation, file de deux questions', source: 'lg', model: 'vps', durationMs: 600000, topicEveryMs: 96000,
    questions: [{ atMs: 70000, kind: 'recent' }, { atMs: 131000, kind: 'transcript' }, { atMs: 203000, kind: 'search' }, { atMs: 262000, kind: 'inspect' }, { atMs: 331000, kind: 'recent' }, { atMs: 331400, kind: 'transcript' },
      { atMs: 402000, kind: 'search', cancelAfterMs: 1500 }, { atMs: 469000, kind: 'transcript' }, { atMs: 541000, kind: 'inspect' }] },
  // Mac cadence: first block of 2 s, then 8 s, native capture, fast local Whisper.
  mac: { description: 'Mac natif, 10 min, premier bloc 2 s, questions intercalées', source: 'mac', model: 'mac', durationMs: 600000, topicEveryMs: 96000,
    questions: [{ atMs: 12000, kind: 'recent' }, { atMs: 75000, kind: 'transcript' }, { atMs: 140000, kind: 'search' }, { atMs: 206000, kind: 'inspect' }, { atMs: 290000, kind: 'transcript' }, { atMs: 372000, kind: 'inspect' }, { atMs: 455000, kind: 'recent' }, { atMs: 530000, kind: 'transcript' }] },
  // A Whisper slowdown fills the bounded lanes: losses must stay explicit.
  'lg-vps-backlog': { description: 'LG → hôte CPU, 6 min, Whisper ralenti de 120 à 200 s, questions fréquentes', source: 'lg', model: 'vps', durationMs: 360000, topicEveryMs: 96000,
    asrBurst: { fromMs: 120000, toMs: 200000, ms: [10500, 13000] }, questions: every(['transcript', 'recent', 'inspect'], 45000, 40000, 350000) },
  // Sustained session in accelerated time: every third question searches, so the index is caught up every 21 min.
  'long-lg': { description: 'LG → hôte CPU, 2 h en temps accéléré, une recherche toutes les 21 min', source: 'lg', model: 'vps', durationMs: 7200000, topicEveryMs: 240000,
    questions: [...every(['recent', 'transcript', 'inspect'], 300000, 420000, 6500000), { atMs: 6600000, kind: 'search' }, { atMs: 6720000, kind: 'search' }, { atMs: 6900000, kind: 'transcript' }] },
};

// The worst case for an index fed on demand: nothing searches for 110 minutes, then two searches follow.
SCENARIOS['late-first-search'] = { description: 'LG → hôte CPU, 2 h, aucune recherche avant 110 min, puis deux recherches', source: 'lg', model: 'vps', durationMs: 7200000, topicEveryMs: 240000,
  questions: [...every(['recent', 'transcript'], 300000, 420000, 6500000), { atMs: 6600000, kind: 'search' }, { atMs: 6720000, kind: 'search' }] };

const WORDS = ['budget', 'santé', 'retraites', 'ministre', 'opposition', 'audit', 'vote', 'chiffres', 'réforme', 'hôpital', 'impôts', 'débat', 'jeudi', 'plateau', 'invité'];
const transcriptFor = (index, topic) => `Passage ${index} sur ${topic} : ${Array.from({ length: 14 }, (_, k) => WORDS[(index * 5 + k * 3) % WORDS.length]).join(' ')}.`;
function vector(text) {
  const v = new Array(24).fill(0);
  for (const word of text.toLowerCase().match(/[a-zà-ÿ0-9]{3,}/g) || []) { let h = 0; for (const c of word) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % 24] += 1; }
  return v;
}
const percentile = (values, p) => { if (!values.length) return null; const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
const stats = values => values.length ? { n: values.length, mean: Math.round(values.reduce((a, b) => a + b, 0) / values.length), p50: Math.round(percentile(values, 0.5)), p95: Math.round(percentile(values, 0.95)), max: Math.round(Math.max(...values)) } : { n: 0 };

async function runScenario(root, name, seed, variant = {}) {
  const scenario = SCENARIOS[name];
  if (!scenario) throw Error(`Scénario inconnu : ${name}`);
  const model = { ...MODELS[scenario.model], ...(Number.isFinite(variant.embedRequestMs) ? { embedRequestMs: variant.embedRequestMs } : {}) };
  const load = file => require(path.join(root, file));
  const { WatchSession } = load('core/session.cjs');
  const { CodexPerception } = load('adapters/codex-perception.cjs');
  const { CachedInspector } = load('core/cached-inspector.cjs');
  const { MomentIndex } = load('core/moment-index.cjs');
  const { MemorySearch } = load('core/moment-search.cjs');
  const { createConversationRuntime, hasPendingQuestion } = load('runtime/conversation-runtime.cjs');
  const { createMemoryMedia } = load('runtime/memory-media.cjs');
  const { consultationOf } = load('core/video-tools.cjs');
  const { hasUsableObservation } = load('core/shared/passage-text.cjs');
  const started = performance.now();
  const clock = new VirtualClock().install();
  const rng = { asr: mulberry32(seed), vision: mulberry32(seed + 1), chat: mulberry32(seed + 2), feed: mulberry32(seed + 3) };
  const counters = { asrCalls: 0, asrCacheHits: 0, visionCalls: 0, inspectCalls: 0, coldStarts: 0, coldStartMs: 0, freshThreadTurns: 0, threadRotations: 0, threadRotationMs: 0, closes: 0,
    embeddingRequests: 0, embeddingTexts: 0, embeddingWrites: 0, archiveSaves: 0, emits: 0, maxConcurrentModelCalls: 0, visionCallsDuringQuestion: 0 };
  try {
    const topicAt = ms => `Sujet ${Math.floor(ms / scenario.topicEveryMs) + 1}`;
    const passages = new Map(); // id -> externally observed timeline
    let watch, conversation, activeModelCalls = 0;
    const questionBusy = () => conversation?.deep.jobs.some(j => ['queued', 'running'].includes(j.status));

    const media = { items: new Map(), leases: new Map(), pendingRemoval: new Set(),
      async put(id, input) { this.items.set(id, { frames: input.frames, audio: input.audio }); },
      async read(id) { const value = this.items.get(id); if (!value) throw Error('Passage expiré.'); return { frames: value.frames, audio: value.audio }; },
      async remove(id) { if (this.leases.get(id)) { this.pendingRemoval.add(id); return; } this.items.delete(id); },
      async lease(ids) {
        const held = [];
        const release = async () => { for (const id of held.splice(0)) { const n = this.leases.get(id) - 1; if (n) this.leases.set(id, n); else { this.leases.delete(id); if (this.pendingRemoval.delete(id)) this.items.delete(id); } } };
        for (const id of ids) { if (this.pendingRemoval.has(id) || !this.items.has(id)) { await release(); throw Error('Média expiré ou indisponible.'); } this.leases.set(id, (this.leases.get(id) || 0) + 1); held.push(id); }
        return release;
      },
      file: id => id };
    const archive = { async save() { counters.archiveSaves++; } };

    const transcripts = new Map();
    const transcriber = { cache: new Map(),
      async transcribe(audio, signal) {
        if (!audio?.length) return { text: '', limits: ['Aucune piste audio.'] };
        signal?.throwIfAborted();
        const key = audio.toString();
        if (this.cache.has(key)) { counters.asrCacheHits++; return { ...this.cache.get(key), cacheHit: true }; }
        counters.asrCalls++;
        const burst = scenario.asrBurst && clock.t >= scenario.asrBurst.fromMs && clock.t < scenario.asrBurst.toMs;
        await sleep(between(rng.asr, burst ? scenario.asrBurst.ms : rng.asr() < model.asrSlowRate ? model.asrSlowMs : model.asrMs), signal);
        const value = { text: transcripts.get(key.split(':')[0]) || 'Extrait partiel.', language: 'fr', limits: ['Transcription automatique locale ; elle peut contenir des erreurs.'] };
        this.cache.set(key, value); if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
        return { ...value, cacheHit: false };
      } };

    // Stands for CodexAnalysisAgent + its App Server process: one turn at a time,
    // a closed process pays a cold start, a rotated thread on a live process does not.
    const analysisAgent = (kind) => {
      let up = false, fresh = true, connecting = null, generation = 0, rotations = 0, tail = Promise.resolve();
      const connect = () => {
        if (up) return Promise.resolve();
        if (!connecting) { const mine = ++generation; counters.coldStarts++; counters.coldStartMs += model.coldStartMs; connecting = sleep(model.coldStartMs).then(() => { if (mine === generation) { up = true; fresh = true; connecting = null; } }); }
        return connecting;
      };
      const run = async input => {
        input.signal?.throwIfAborted();
        while (!up) await connect();
        input.signal?.throwIfAborted();
        const inspecting = Boolean(input.outputSchema?.properties?.observations);
        counters[inspecting ? 'inspectCalls' : 'visionCalls']++;
        if (!inspecting && questionBusy()) counters.visionCallsDuringQuestion++;
        counters.maxConcurrentModelCalls = Math.max(counters.maxConcurrentModelCalls, ++activeModelCalls);
        try {
          if (fresh) { fresh = false; counters.freshThreadTurns++; await sleep(model.freshThreadTurnMs, input.signal); }
          const images = input.mediaInput?.length || 0;
          await sleep(inspecting ? between(rng.vision, model.inspectMs) : between(rng.vision, rng.vision() < model.visionSlowRate ? model.visionSlowMs : model.visionMs) * (images <= 3 ? 0.85 : 1), input.signal);
        } finally { activeModelCalls--; }
        if (inspecting) {
          const observations = [...input.instructions.matchAll(/"id":"(moment-\d+)","startMs":([\d.]+),"endMs":([\d.]+)/g)].map(m => ({ id: m[1], startMs: Number(m[2]), endMs: Number(m[3]), text: `Observation réexaminée de ${m[1]}.` }));
          return { observations, hypotheses: [], limits: [] };
        }
        const interval = /Intervalle ([\d.]+)–([\d.]+) ms/.exec(input.instructions);
        const previous = /"previousTopic":"((?:[^"\\]|\\.)*)"/.exec(input.instructions)?.[1] || '';
        const topic = topicAt(Number(interval?.[1] || 0));
        return { summary: `Résumé du passage ${interval?.[1]}–${interval?.[2]} ms sur ${topic}.`, visual: 'Deux personnes en plateau.', uncertainty: '', topic,
          continuity: previous === topic ? 'continue' : 'change', topicSummary: `Résumé cumulatif de ${topic} jusqu’à ${interval?.[2]} ms.` };
      };
      return { kind, prepare: () => connect(),
        answer: input => (tail = tail.catch(() => {}).then(() => run(input))),
        async close() { if (up || connecting) counters.closes++; up = false; connecting = null; generation++; rotations = 0; },
        // Only called by source trees that rotate the thread instead of closing the process. Like the real
        // client (maxRotations = 20), the process is recycled after 20 rotations and reconnects in the background.
        async reset() {
          if (!up) return;
          if (rotations >= 20) { counters.closes++; up = false; connecting = null; generation++; rotations = 0; connect(); return; }
          rotations++; counters.threadRotations++; counters.threadRotationMs += model.threadStartMs; await sleep(model.threadStartMs); fresh = true;
        } };
    };
    const visionAgent = analysisAgent('vision'), inspectAgent = analysisAgent('inspect');
    const perception = new CodexPerception({ agent: visionAgent, transcriber, sessionId: 'sim-observe' });
    const inspectorModel = new CodexPerception({ agent: inspectAgent, transcriber, sessionId: 'sim-inspect' });
    const clipInspector = { async inspect({ question, startMs, endMs, segments, signal, onProgress }) {
      await sleep(model.inspectPrepMs, signal);
      const evidence = [];
      for (const s of segments) {
        const original = await media.read(s.id), begin = Math.max(startMs, s.startMs), end = Math.min(endMs, s.endMs);
        evidence.push({ id: s.id, startMs: begin, endMs: end, frames: original.frames, audio: begin === s.startMs && end === s.endMs ? original.audio : Buffer.from(`${s.id}:${begin}-${end}`) });
      }
      return { ...await inspectorModel.inspect({ question, segments: evidence, signal, onProgress }), sampledFrames: evidence.length * 6 };
    } };
    const inspector = new CachedInspector(clipInspector);

    const embeddings = {
      async embed(text, signal) { counters.embeddingRequests++; counters.embeddingTexts++; await sleep(model.embedRequestMs, signal); return vector(text); },
      async embedMany(texts, signal) { counters.embeddingRequests++; counters.embeddingTexts += texts.length; await sleep(model.embedRequestMs + model.embedPerTextMs * texts.length, signal); return texts.map(vector); } };
    const cache = { entries: new Map(), byText: new Map(),
      async get(id, text) { const entry = this.entries.get(id); return entry?.text === text ? entry.vector : this.byText.get(text) || null; },
      async put(id, text, value) { counters.embeddingWrites++; this.entries.set(id, { text, vector: value }); this.byText.set(text, value); },
      async putMany(items) { counters.embeddingWrites++; for (const item of items) { this.entries.set(item.id, { text: item.text, vector: item.vector }); this.byText.set(item.text, item.vector); } } };
    const momentIndex = new MomentIndex({ embeddings, cache, flushMs: 30000, maxPending: 2048 }); // INDEX_FLUSH_MS and INDEX_MAX_PENDING of runtime/session-runtime.cjs
    const search = new MemorySearch({ index: momentIndex });
    // Same feed as runtime/session-runtime.cjs: published passages go to the bounded background index.
    const feedIndex = variant.backgroundIndex !== false && typeof momentIndex.observe === 'function';

    const observe = snapshot => {
      counters.emits++;
      if (feedIndex) momentIndex.observe(snapshot.segments.filter(hasUsableObservation));
      for (const s of snapshot.segments) {
        const p = passages.get(s.id); if (!p) continue;
        if (p.transcriptAtMs === undefined && s.audioStatus === 'ready') p.transcriptAtMs = clock.t;
        if (p.audioFailedAtMs === undefined && s.audioStatus === 'error') p.audioFailedAtMs = clock.t;
        if (p.visionStartedAtMs === undefined && s.visionStatus === 'analyzing') p.visionStartedAtMs = clock.t;
        if (p.readyAtMs === undefined && s.status === 'ready') p.readyAtMs = clock.t;
        p.status = s.status; p.audioStatus = s.audioStatus; p.visionStatus = s.visionStatus;
      }
      for (const s of snapshot.history) { const p = passages.get(s.id); if (p && !p.archived) Object.assign(p, { archived: true, status: s.status, audioStatus: s.audioStatus, visionStatus: s.visionStatus }); }
      lag.push(snapshot.analysisLagMs);
    };
    const lag = [];
    watch = new WatchSession({ id: 'sim-session', now: () => clock.t, perception, media, archive, onChange: observe, ...(variant.visionDuringAsk ? { visionDuringAsk: true } : {}) });

    const records = [];
    const livePrefix = (anchorMs, startMs, endMs) => [...watch.history, ...watch.segments].filter(s => s.endMs <= anchorMs && s.endMs > startMs && s.startMs < endMs);
    const chatAgent = { async prepare() {}, async close() {},
      async answer({ question, tools, context, signal, onProgress }) {
        // A first job starts inside deep.start(), before its id is known here: match the text.
        const record = records.find(r => r.question === question) || {};
        const kind = record.kind || 'recent';
        const anchorMs = tools.anchorMs;
        const violation = items => { for (const item of items || []) if (item.endMs > anchorMs) record.causalityViolations = (record.causalityViolations || 0) + 1; };
        Object.assign(record, { contextPassages: context?.passages?.length || 0, pendingAtStart: context?.pendingCount, unanalyzedTailMs: context?.unanalyzedTailMs,
          evidenceLagAtStartMs: context ? anchorMs - (context.contextThroughMs || 0) : null });
        violation(context?.passages);
        const call = async (tool, args) => { const value = await tools.call(tool, args); violation(value.passages || value.moments || value.observations); return value; };
        const cite = items => items.map(({ id, startMs, endMs }) => ({ id, startMs, endMs }));
        if (kind === 'recent') {
          await sleep(between(rng.chat, model.chatFirstMs), signal); onProgress?.({ message: 'Rédaction de la réponse…', preview: 'Le passage…' });
          await sleep(between(rng.chat, model.chatRestMs), signal);
          const used = (context?.passages || []).slice(-2);
          return used.length ? { answer: 'Résumé des derniers passages.', kind: 'observation', citations: cite(used), limits: [] } : { answer: 'Rien d’analysé pour le moment.', kind: 'insufficient', citations: [], limits: [] };
        }
        await sleep(between(rng.chat, model.chatFirstMs), signal);
        if (kind === 'transcript') {
          const startMs = Math.max(tools.startMs || 0, anchorMs - 16000);
          const seen = await call('get_transcript', { startMs, endMs: anchorMs });
          const live = livePrefix(anchorMs, startMs, anchorMs);
          const has = p => Boolean(p.transcript || p.observation?.transcript);
          Object.assign(record, { transcriptInterval: { startMs, endMs: anchorMs }, passagesSeen: seen.passages.length, transcriptsSeen: seen.passages.filter(has).length, visionReadySeen: seen.passages.filter(p => p.visionStatus === 'ready').length,
            passagesLive: live.length, transcriptsLive: live.filter(has).length, visionReadyLive: live.filter(p => p.visionStatus === 'ready').length });
          await sleep(between(rng.chat, model.chatRestMs), signal);
          const used = seen.passages.filter(p => p.transcript || p.summary);
          return used.length ? { answer: 'Voici ce qui vient d’être dit.', kind: 'observation', citations: cite(used), limits: [] } : { answer: 'Les dernières paroles ne sont pas encore transcrites.', kind: 'insufficient', citations: [], limits: [] };
        }
        const found = await call('search_moments', { query: 'budget santé retraites' });
        Object.assign(record, { searchMode: found.mode, searchWarnings: found.warnings, searchResults: found.moments.length, semantic: found.semantic });
        await sleep(between(rng.chat, model.chatStepMs), signal);
        if (kind === 'search') {
          const best = found.moments[0];
          if (!best) return { answer: 'Aucun passage trouvé.', kind: 'insufficient', citations: [], limits: [] };
          await sleep(between(rng.chat, model.chatRestMs), signal);
          return { answer: 'Le passage retrouvé.', kind: 'observation', citations: cite([best]), limits: [] };
        }
        // inspect: the newest passage inside the prefix, or an explicit older target.
        const pool = tools.consultationScope().passages.sort((a, b) => a.endMs - b.endMs);
        const target = record.targetMs === undefined ? pool.at(-1) : pool.find(s => s.startMs <= record.targetMs && s.endMs >= record.targetMs);
        if (!target) return { answer: 'Aucun passage à réexaminer.', kind: 'insufficient', citations: [], limits: [] };
        try {
          const inspected = await call('inspect_clip', { startMs: target.startMs, endMs: target.endMs, question });
          record.inspected = inspected.observations.length;
          await sleep(between(rng.chat, model.chatRestMs), signal);
          return { answer: 'Réexamen effectué.', kind: 'observation', citations: cite(inspected.observations), limits: [] };
        } catch (error) {
          if (signal.aborted) throw error;
          record.inspectError = error.message;
          return { answer: 'Le média de ce passage n’est plus disponible.', kind: 'insufficient', citations: [], limits: [error.message] };
        }
      } };
    const memory = { view: () => watch.memoryView(), passages: ids => watch.memoryPassages(ids) }, memoryMedia = createMemoryMedia(media);
    conversation = createConversationRuntime({ getSession: () => ({ id: watch.id, memory, memoryMedia, search, inspector }), agent: chatAgent,
      onChange: state => watch.setQuestionPending(hasPendingQuestion(state.jobs, watch.id)) });
    const deep = conversation.deep;

    // Capture feed.
    const lg = scenario.source === 'lg';
    let index = 0;
    for (let startMs = 0; startMs < scenario.durationMs;) {
      const endMs = startMs + (!lg && index === 0 ? 2000 : 8000);
      const id = `moment-${++index}`, count = lg ? 4 : 6;
      const frames = Array.from({ length: count }, (_, k) => ({ atMs: startMs + k * (endMs - startMs) / count, dataUrl: `data:image/jpeg;base64,${Buffer.from(`${id}-${k}`).toString('base64')}` }));
      const arrivalMs = endMs + between(rng.feed, model.transportMs) + between(rng.feed, model.assembleMs);
      transcripts.set(id, transcriptFor(index, topicAt(startMs)));
      const input = { startMs, endMs, clip: Buffer.from(id), frames, audio: Buffer.from(id) };
      setTimeout(() => {
        const expected = `moment-${watch.sequence + 1}`;
        passages.set(expected, { id: expected, startMs, endMs, arrivedAtMs: clock.t });
        watch.ingest(input).catch(error => { passages.get(expected).ingestError = error.message; });
      }, arrivalMs);
      startMs = endMs + (lg ? 300 : 0); // the LG capture loop spends a moment between two blocks
    }
    if (!lg) setInterval(() => watch.emit(), 5000);
    if (!lg) visionAgent.prepare(); // the Mac host warms the observation agent at session start
    for (const q of scenario.questions) {
      setTimeout(() => {
        const record = { ...q, question: `${QUESTIONS[q.kind]} (${Math.round(q.atMs / 1000)} s)` };
        records.push(record);
        try {
          const options = lg ? { mode: 'chat', anchorMs: clock.t, consultation: consultationOf(watch.memoryView()) } : { mode: 'chat' };
          record.jobId = deep.start(record.question, options).id;
          if (q.cancelAfterMs) setTimeout(() => deep.cancel('Question annulée.', record.jobId), q.cancelAfterMs);
        } catch (error) { record.rejected = error.message; }
      }, q.atMs);
    }

    await clock.runUntil(scenario.durationMs + 90000);
    const final = watch.snapshot();
    for (const s of [...final.history, ...final.segments]) { const p = passages.get(s.id); if (p) Object.assign(p, { status: s.status, audioStatus: s.audioStatus, visionStatus: s.visionStatus }); }
    deep.cancelAll('Fin de la simulation.');
    const indexStatus = typeof momentIndex.status === 'function' ? momentIndex.status() : undefined;
    await momentIndex.close?.();
    await watch.close();
    await settle();

    const all = [...passages.values()].filter(p => !p.ingestError);
    const count = fn => all.filter(fn).length;
    const pct = n => all.length ? Math.round(n * 1000 / all.length) / 10 : 0;
    const jobs = new Map(deep.jobs.map(j => [j.id, j]));
    const questions = records.map(r => {
      const job = jobs.get(r.jobId);
      const { jobId, question, atMs, kind, cancelAfterMs, targetMs, ...evidence } = r;
      return { atMs, kind, status: job?.status || 'rejected', waitMs: job?.metrics?.waitMs, totalMs: job?.metrics?.totalMs, endToEndMs: job?.metrics?.endToEndMs,
        tools: (job?.metrics?.tools || []).map(t => ({ tool: t.tool, durationMs: Math.round(t.durationMs), status: t.status })), acceptedCitations: job?.validation?.acceptedCitations, resultKind: job?.result?.kind, ...evidence };
    });
    const done = questions.filter(q => q.status === 'done');
    const transcriptQs = questions.filter(q => q.kind === 'transcript' && q.passagesLive !== undefined);
    const toolTimes = name => questions.flatMap(q => q.tools.filter(t => t.tool === name && t.status === 'completed').map(t => t.durationMs));
    return { scenario: name, description: scenario.description, seed, root, variant,
      coverage: final.coverage, latency: final.latency, visionGaps: final.visionGaps?.length, audioGaps: final.audioGaps?.length, indexStatus,
      passages: { ingested: all.length, rejectedAtIngest: passages.size - all.length, ready: count(p => p.status === 'ready'), partial: count(p => p.status === 'partial'), skipped: count(p => p.status === 'skipped'), expired: count(p => p.status === 'expired'), error: count(p => p.status === 'error'),
        unfinished: count(p => ['queued', 'analyzing'].includes(p.status)), transcriptPublished: count(p => p.transcriptAtMs !== undefined), visionReady: count(p => p.visionStatus === 'ready'), visionSkipped: count(p => p.visionStatus === 'skipped'), visionExpired: count(p => p.visionStatus === 'expired'), visionError: count(p => p.visionStatus === 'error'),
        transcriptCoveragePct: pct(count(p => p.transcriptAtMs !== undefined)), visionCoveragePct: pct(count(p => p.visionStatus === 'ready')) },
      delaysMs: { arrivalAfterClose: stats(all.map(p => p.arrivedAtMs - p.endMs)), transcriptAfterClose: stats(all.filter(p => p.transcriptAtMs !== undefined).map(p => p.transcriptAtMs - p.endMs)),
        readyAfterClose: stats(all.filter(p => p.readyAtMs !== undefined).map(p => p.readyAtMs - p.endMs)), visionWaitAfterTranscript: stats(all.filter(p => p.visionStartedAtMs !== undefined && p.transcriptAtMs !== undefined).map(p => p.visionStartedAtMs - p.transcriptAtMs)),
        oldestContentAgeAtReady: stats(all.filter(p => p.readyAtMs !== undefined).map(p => p.readyAtMs - p.startMs)), analysisLag: stats(lag) },
      provider: counters,
      questionSummary: { asked: questions.length, done: done.length, cancelled: questions.filter(q => q.status === 'cancelled').length, timeout: questions.filter(q => q.status === 'timeout').length, error: questions.filter(q => q.status === 'error').length,
        insufficient: done.filter(q => q.resultKind === 'insufficient').length, endToEndMs: stats(done.map(q => q.endToEndMs)), waitMs: stats(done.map(q => q.waitMs)), searchToolMs: stats(toolTimes('search_moments')), inspectToolMs: stats(toolTimes('inspect_clip')),
        evidenceLagAtStartMs: stats(questions.filter(q => Number.isFinite(q.evidenceLagAtStartMs)).map(q => q.evidenceLagAtStartMs)),
        recentTranscripts: { questions: transcriptQs.length, seen: transcriptQs.reduce((n, q) => n + q.transcriptsSeen, 0), availableWhenRead: transcriptQs.reduce((n, q) => n + q.transcriptsLive, 0), visionReadySeen: transcriptQs.reduce((n, q) => n + q.visionReadySeen, 0), visionReadyWhenRead: transcriptQs.reduce((n, q) => n + q.visionReadyLive, 0) },
        causalityViolations: questions.reduce((n, q) => n + (q.causalityViolations || 0), 0) },
      questions, simulatedMs: scenario.durationMs, wallClockMs: Math.round(performance.now() - started) };
  } finally { clock.uninstall(); }
}

function diff(beforeFile, afterFile) {
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8')), after = JSON.parse(fs.readFileSync(afterFile, 'utf8'));
  const pick = (r, keys) => keys.reduce((value, key) => value?.[key], r);
  const rows = [['passages', 'visionCoveragePct'], ['passages', 'visionSkipped'], ['passages', 'visionExpired'], ['passages', 'skipped'], ['passages', 'partial'], ['passages', 'transcriptCoveragePct'], ['coverage', 'audioSkipped'], ['coverage', 'visionBlockedMs'],
    ['delaysMs', 'transcriptAfterClose', 'p50'], ['delaysMs', 'transcriptAfterClose', 'p95'], ['delaysMs', 'readyAfterClose', 'p50'], ['delaysMs', 'readyAfterClose', 'p95'], ['delaysMs', 'readyAfterClose', 'max'], ['delaysMs', 'analysisLag', 'max'],
    ['provider', 'coldStarts'], ['provider', 'coldStartMs'], ['provider', 'freshThreadTurns'], ['provider', 'threadRotations'], ['provider', 'visionCallsDuringQuestion'], ['provider', 'maxConcurrentModelCalls'], ['provider', 'embeddingRequests'], ['provider', 'embeddingTexts'], ['provider', 'embeddingWrites'], ['provider', 'asrCalls'],
    ['questionSummary', 'done'], ['questionSummary', 'timeout'], ['questionSummary', 'insufficient'], ['questionSummary', 'endToEndMs', 'p50'], ['questionSummary', 'endToEndMs', 'max'], ['questionSummary', 'searchToolMs', 'max'], ['questionSummary', 'inspectToolMs', 'p50'],
    ['questionSummary', 'recentTranscripts', 'seen'], ['questionSummary', 'recentTranscripts', 'availableWhenRead'], ['questionSummary', 'recentTranscripts', 'visionReadySeen'], ['questionSummary', 'recentTranscripts', 'visionReadyWhenRead'], ['questionSummary', 'causalityViolations']];
  for (const b of before.results) {
    const a = after.results.find(r => r.scenario === b.scenario); if (!a) continue;
    console.log(`\n## ${b.scenario} — ${b.description}`);
    console.log('| mesure | avant | après |\n| --- | ---: | ---: |');
    for (const keys of rows) { const x = pick(b, keys), y = pick(a, keys); if (x !== undefined || y !== undefined) console.log(`| ${keys.join('.')} | ${x ?? '—'} | ${y ?? '—'} |`); }
  }
}

if (require.main === module) (async () => {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
  if (args.includes('--diff')) return diff(args[args.indexOf('--diff') + 1], args[args.indexOf('--diff') + 2]);
  const root = path.resolve(option('--root', path.join(__dirname, '..')));
  const seed = Number(option('--seed', 20261012));
  const wanted = option('--scenario', 'all');
  const names = wanted === 'all' ? Object.keys(SCENARIOS) : wanted.split(',');
  const results = [];
  const variant = { ...(args.includes('--vision-during-ask') ? { visionDuringAsk: true } : {}), ...(args.includes('--no-background-index') ? { backgroundIndex: false } : {}),
    ...(option('--embed-request-ms') === undefined ? {} : { embedRequestMs: Number(option('--embed-request-ms')) }) };
  for (const name of names) results.push(await runScenario(root, name, seed, variant));
  const report = { kind: 'Simulation déterministe en temps virtuel ; fournisseurs contrôlés et latences modélisées', root, seed, variant, models: MODELS, results };
  const out = option('--out');
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 1));
  for (const r of results) console.log(JSON.stringify({ scenario: r.scenario, passages: r.passages, delaysMs: r.delaysMs, provider: r.provider, questionSummary: r.questionSummary, wallClockMs: r.wallClockMs }, null, 1));
})().catch(error => { console.error(error); process.exit(1); });

module.exports = { runScenario, SCENARIOS, MODELS };
