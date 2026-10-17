#!/usr/bin/env node
// Delay PERCEIVED by a TV client between sending a question and what it sees, and bytes per state poll.
// Real HTTP server (server/http.cjs) on an ephemeral loopback port, real HeadlessRuntime + DeepAsk +
// VideoTools, real client tv/app/remote-client.js. Three poll loops are modelled here for comparison; the
// fourth policy ("client-tv") runs the loop the panel really has: cadence and view from pollPolicy, bodies
// merged by mergeState (tv/app/companion.js), revalidation done by remote-client.js itself.
// The chat agent is a FAKE with fixed delays: this measures the client overhead (poll cadence, payload),
// never a provider, a network or the TV's processor. No provider is called, no fixed port is opened.
//   node scripts/bench-perceived.cjs [--root <tree>] [--tmp <dir>] [--questions 6] [--sizes 75,900]
//                                    [--only bytes,perceived,ledger,allLive] [--layout auto|rolling|durable] [--out file.json]
// --root points at a source tree (default: this checkout), e.g. the extracted baseline, to measure "before"
// with the same script. A tree without node_modules needs NODE_PATH=<worktree>/../node_modules.
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const root = path.resolve(option('--root', path.join(__dirname, '..')));
const tmp = path.resolve(option('--tmp', os.tmpdir()));
const questionsPerRun = Number(option('--questions', 6));
const sizes = String(option('--sizes', '75,900')).split(',').map(Number);
const only = new Set(String(option('--only', 'bytes,perceived,ledger,allLive')).split(','));
const layout = option('--layout', 'auto');
const load = file => require(path.join(root, file));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const round = value => (value === null || value === undefined ? null : Math.round(value * 10) / 10);
const stats = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? { n: sorted.length, mean: round(sorted.reduce((a, b) => a + b, 0) / sorted.length), p50: round(sorted[Math.floor((sorted.length - 1) / 2)]), max: round(sorted.at(-1)) } : { n: 0 };
};
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const isActive = job => job.status === 'queued' || job.status === 'running';

// Same passage fixture as scripts/bench-backend.cjs, so that both benches weigh the same session.
const filler = (seed, length) => {
  const words = ['le', 'débat', 'porte', 'sur', 'budget', 'santé', 'réforme', 'ministre', 'affirme', 'opposition', 'conteste', 'chiffres', 'audit', 'vote', 'jeudi', 'plateau', 'invité', 'répond', 'question', 'journaliste'];
  let text = '';
  for (let i = seed; text.length < length; i++) text += words[(i * 7 + seed) % words.length] + ' ';
  return text.slice(0, length).trim();
};
function passage(i, archived) {
  const startMs = i ? 2000 + (i - 1) * 8000 : 0, endMs = 2000 + i * 8000;
  const stamps = { receivedMs: endMs + 650, audioStartedMs: endMs + 660, visionQueuedMs: endMs + 5800, visionStartedMs: endMs + 5800, visionPublishedMs: endMs + 9900, revision: 2, ingest: { assembleMs: 540 } };
  const metrics = { audioCacheHit: false, whisper: { loadMs: 170.2, melMs: 22.1, sampleMs: 310.4, encodeMs: 3550.9, decodeMs: 6.2, batchdMs: 1890.3, promptMs: 0, totalMs: 5180.5, logprobFallbacks: 0, entropyFallbacks: 0, threads: 2, elapsedMs: 5187.4, audioCtx: 0 },
    framesSent: 4, recentContextCount: 3, contextChars: 2400, lightweight: false, providerUsd: null, coldStart: false, connectMs: 0, threadReset: false, threadTurn: 7 };
  const observation = { topic: `Sujet ${Math.floor(i / 12)}`, topicContinuity: i % 12 ? 'continue' : 'change', summary: filler(i, 240), visual: filler(i + 3, 180), transcript: filler(i + 5, 150), audio: 'Paroles transcrites localement.', uncertainty: filler(i + 9, 160) };
  const first = Math.floor(i / 12) * 12;
  const base = { id: `moment-${i + 1}`, startMs, endMs, status: 'ready', audioStatus: 'ready', visionStatus: 'ready', observation,
    topicSummary: { text: filler(i + 11, 900), firstId: `moment-${first + 1}`, lastId: `moment-${i + 1}`, startMs: first ? 2000 + (first - 1) * 8000 : 0, endMs }, thumbnailAvailable: true, audioMs: 5200, visionMs: 4100, transcriptPublishedMs: endMs + 5600 };
  return archived ? { ...base, ...stamps, summary: observation.summary } : { ...base, ...stamps, hasAudio: true, available: true, analysisMs: 9300, metrics };
}

// Modelled chat agent: fixed delays, never a provider measurement.
const AGENT = { progressMs: 300, textMs: 700, deltaMs: 80, totalMs: 1600 };
const chatAgent = { async prepare() {}, async close() {},
  async answer({ context, signal, onProgress }) {
    const wait = ms => new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
      signal.addEventListener('abort', abort, { once: true });
    });
    await wait(AGENT.progressMs); onProgress({ message: 'Codex examine le contexte…' });
    await wait(AGENT.textMs - AGENT.progressMs);
    const full = filler(3, 600);
    for (let at = AGENT.textMs, n = 40; at < AGENT.totalMs; at += AGENT.deltaMs, n += 40) { onProgress({ message: 'Rédaction de la réponse…', preview: full.slice(0, n) }); await wait(AGENT.deltaMs); }
    const used = (context?.passages || []).slice(-1);
    return { answer: full, kind: 'observation', citations: used.map(({ id, startMs, endMs }) => ({ id, startMs, endMs })), limits: [], sources: [] };
  } };

const POLICIES = {
  // The installed panel: setTimeout(poll, 1000) after each poll, complete state, no poll after sending.
  'actuel-1000ms': { interval: () => 1000, kickAfterAsk: false },
  // Faster cadence on the complete state: a poll at once after sending, 250 ms while a question moves.
  'adaptatif-250ms': { interval: state => (state?.chat?.jobs?.some(isActive) ? 250 : 1000), kickAfterAsk: true },
  // Same cadence on the light views with revalidation: chat view while a question moves, panel view one
  // poll out of four and at rest; a poll that holds the current revision costs no body. Only on a tree
  // that serves the views.
  'vues-etag-250ms': { interval: state => (state?.chat?.jobs?.some(isActive) ? 250 : 1000), kickAfterAsk: true, views: true },
  // Not a model: the poll policy, the merge and the revalidation of the TV client of the measured tree.
  // Skipped on a tree whose client does not export them (the baseline).
  'client-tv': { client: true, kickAfterAsk: true },
};

async function run(count, policyName, seed) {
  const policy = POLICIES[policyName], rng = mulberry32(seed);
  const { HeadlessRuntime } = load('runtime/headless-runtime.cjs');
  const { RemoteServer } = load('server/http.cjs');
  const { RemoteClient } = load('tv/app/remote-client.js');
  const tvPanel = policy.client ? load('tv/app/companion.js') : null;
  if (policy.client && (typeof tvPanel.pollPolicy !== 'function' || typeof tvPanel.mergeState !== 'function' || typeof RemoteClient.prototype.poll !== 'function'))
    return { passages: count, policy: policyName, skipped: 'Le client TV de cet arbre n’exporte pas sa politique de sondage.' };
  const dir = await fs.mkdtemp(path.join(tmp, 'perceived-'));
  let base = 0, bytes = 0, emits = 0, notModified = 0, lastStatus = 0;
  const runtime = new HeadlessRuntime({ userData: dir, sessionsRoot: path.join(dir, 'sessions'), config: {}, transcriptionSettings: { save: async value => value },
    selectedModels: { observationModel: 'fake', inspectionModel: 'fake', codexModel: '' }, codexBinary: 'codex', smoke: true, agent: chatAgent, readClock: () => performance.now() + base });
  const forward = runtime.deep.onChange; runtime.deep.onChange = state => { emits++; forward(state); };
  const token = 'b'.repeat(64);
  const server = await new RemoteServer({ runtime, media: { assemble: async x => x }, token }).listen(0, '127.0.0.1');
  const raw = async (route, headers = {}) => {
    const response = await fetch(server.url + route, { headers: { Authorization: 'Bearer ' + token, ...headers } }), text = await response.text();
    return { status: response.status, bytes: Buffer.byteLength(text), etag: response.headers.get('etag') };
  };
  // What a revalidating client does: it sends back the tag of the body it holds for this URL, and keeps
  // that body on 304. Body bytes only are counted, as received.
  const held = new Map();
  const fetcher = async (url, init = {}) => {
    const known = policy.views && init.method === 'GET' ? held.get(url) : null;
    const response = await fetch(url, known ? { ...init, headers: { ...init.headers, 'If-None-Match': known.tag } } : init);
    lastStatus = response.status;
    if (response.status === 304) { notModified++; return { ok: true, json: async () => known.value }; }
    const text = await response.text(), tag = response.headers.get('etag');
    bytes += Buffer.byteLength(text);
    return { ok: response.ok, json: async () => { const value = JSON.parse(text); if (tag) held.set(url, { tag, value }); return value; } };
  };
  // The real client revalidates by itself: its fetcher only counts what crosses the wire.
  const counting = async (url, init = {}) => {
    const response = await fetch(url, init);
    lastStatus = response.status;
    if (response.status === 304) { notModified++; return response; }
    const text = await response.text();
    bytes += Buffer.byteLength(text);
    return { status: response.status, ok: response.ok, headers: response.headers, json: async () => JSON.parse(text) };
  };
  const client = new RemoteClient({ url: server.url, token }, policy.client ? counting : fetcher);
  try {
    const session = await client.request('/v1/session/start', {});
    const watch = runtime.session.watch;
    // A tree with durable retention keeps every passage with its media; the former one archived all but
    // the last five minutes. Each tree is weighed in the shape it really produces.
    const durable = layout === 'durable' || (layout === 'auto' && !Number.isFinite(watch.retentionMs));
    const live = durable ? count : Math.min(count, 37);
    for (let i = 0; i < count; i++) (i < count - live ? watch.history : watch.segments).push(passage(i, i < count - live));
    watch.sequence = count; base = 2000 + count * 8000;
    // Published like any change: the light views are built from the last published state.
    watch.emit();
    const views = (await raw('/v1/state?view=chat')).status === 200;
    if ((policy.views || policy.client) && !views) return { passages: count, policy: policyName, skipped: 'Cet arbre ne sert pas les vues légères.' };

    let state = null, receivedAt = 0, stop = false, kicked = false, wake = null, turn = 0;
    const seen = new Map(), polls = [];
    const sleep = ms => new Promise(resolve => { const timer = setTimeout(resolve, ms); wake = () => { clearTimeout(timer); resolve(); }; });
    const pollOnce = async () => {
      const t = performance.now(), before = bytes;
      try {
        let view = policy.views ? (state?.chat?.jobs?.some(isActive) && ++turn % 4 ? 'chat' : 'panel') : null, next = null;
        if (policy.client) {
          // Exactly what tv/app/companion.js does at each turn: ask the policy, read, merge unless 304.
          view = tvPanel.pollPolicy(state, turn++, {}).view;
          const answer = await client.state(view);
          if (!answer.notModified) state = tvPanel.mergeState(state, answer.value, view);
        } else next = await client.request('/v1/state' + (view ? '?view=' + view : ''));
        // A chat view refreshes the conversation and the session header; it never erases what the panel view brought.
        if (policy.client) {} else if (view === 'chat' && state) {
          const jobs = new Map(state.chat.jobs.map(job => [job.id, job]));
          for (const job of next.chat.jobs) jobs.set(job.id, job);
          state = { ...state, chat: { ...next.chat, jobs: [...jobs.values()] }, session: { ...state.session, ...next.session } };
        } else state = next;
        // On 304 the held body is unchanged: the client keeps extrapolating from when it received it.
        if (lastStatus !== 304) receivedAt = performance.now();
        polls.push({ ms: performance.now() - t, bytes: bytes - before, status: lastStatus, view: view || 'full' });
        const now = Date.now();
        for (const job of state.chat.jobs) {
          const s = seen.get(job.id) || seen.set(job.id, {}).get(job.id);
          s.cardAt ??= now; if (job.status !== 'queued') s.runningAt ??= now;
          if (job.preview || job.provisional) s.textAt ??= now;
          if (['done', 'error', 'timeout', 'cancelled'].includes(job.status)) s.doneAt ??= now;
        }
      } catch {}
    };
    const interval = () => (policy.client ? tvPanel.pollPolicy(state, turn, {}).delayMs : policy.interval(state));
    const loop = (async () => { while (!stop) { kicked = false; await pollOnce(); if (stop) break; if (!kicked) await sleep(interval()); } })();
    while (!state) await delay(10);

    const rows = [];
    for (let k = 0; k < questionsPerRun; k++) {
      await delay(200 + rng() * 1000); // random phase against the poll loop
      const kind = k % 2 ? 'recent' : 'direct';
      const question = kind === 'recent' ? 'Ça parle de quoi ?' : `Que vient-il de dire exactement sur ce point ${k} ?`;
      const anchorMs = state.session.elapsedMs + (performance.now() - receivedAt);
      const pollsBefore = polls.length, bytesBefore = bytes, emitsBefore = emits, unchangedBefore = notModified;
      const sendAt = Date.now();
      const { id } = await client.ask(question, session.id, anchorMs);
      const ackAt = Date.now();
      if (policy.kickAfterAsk) { kicked = true; wake?.(); }
      const job = runtime.deep.jobs.find(j => j.id === id);
      await job.done;
      while (!seen.get(id)?.doneAt) await delay(10);
      const s = seen.get(id);
      rows.push({ kind, status: job.status, resultKind: job.result?.kind,
        server: { acceptMs: job.createdAt - sendAt, waitMs: job.metrics.waitMs, contextMs: job.metrics.contextMs, firstProgressMs: job.metrics.firstProgressMs, firstUsefulMs: job.metrics.firstUsefulMs, firstAgentMs: job.metrics.firstAgentMs ?? null, firstTextMs: job.metrics.firstTextMs ?? null, totalMs: job.metrics.totalMs },
        perceived: { ackMs: ackAt - sendAt, cardMs: s.cardAt - sendAt, textMs: s.textAt === undefined ? null : s.textAt - sendAt, doneMs: s.doneAt - sendAt },
        overhead: { cardMs: s.cardAt - job.createdAt, textMs: s.textAt === undefined || job.firstUsefulAt === undefined ? null : s.textAt - job.firstUsefulAt, doneMs: s.doneAt - job.finishedAt },
        polls: polls.length - pollsBefore, notModified: notModified - unchangedBefore, bytes: bytes - bytesBefore, serverEmits: emits - emitsBefore });
    }
    // At rest: ten seconds of polling with nothing published, as between two questions of a paused session.
    await runtime.pause(); await delay(1100);
    const restFrom = polls.length, restBytes = bytes;
    await delay(10000);
    const rest = { seconds: 10, polls: polls.length - restFrom, bytes: bytes - restBytes, notModified: polls.slice(restFrom).filter(p => p.status === 304).length };
    stop = true; wake?.(); await loop;

    // Bytes of one poll of each resource on this session, body only. A tree without views answers 404.
    const full = await raw('/v1/state'), panel = await raw('/v1/state?view=panel'), chat = await raw('/v1/state?view=chat');
    const unchanged = panel.etag ? await raw('/v1/state?view=panel', { 'If-None-Match': panel.etag }) : full.etag ? await raw('/v1/state', { 'If-None-Match': full.etag }) : null;
    const pollBytes = { full: full.bytes, panel: panel.status === 200 ? panel.bytes : null, chat: chat.status === 200 ? chat.bytes : null,
      notModified: unchanged?.status === 304 ? unchanged.bytes : null, revalidation: unchanged?.status === 304, views };
    const chatOnlyBytes = Buffer.byteLength(JSON.stringify({ chat: runtime.deep.snapshot() }));
    const pick = (group, key) => rows.map(r => r[group][key]);
    return { passages: count, layout: durable ? 'durable' : 'rolling', policy: policyName, questions: rows.length, allDone: rows.every(r => r.status === 'done'),
      server: { firstProgressMs: stats(pick('server', 'firstProgressMs')), firstUsefulMsDirect: stats(rows.filter(r => r.kind === 'direct').map(r => r.server.firstUsefulMs)), firstUsefulMsRecent: stats(rows.filter(r => r.kind === 'recent').map(r => r.server.firstUsefulMs)), totalMs: stats(pick('server', 'totalMs')) },
      perceived: { ackMs: stats(pick('perceived', 'ackMs')), cardMs: stats(pick('perceived', 'cardMs')), textMsDirect: stats(rows.filter(r => r.kind === 'direct').map(r => r.perceived.textMs)), textMsRecent: stats(rows.filter(r => r.kind === 'recent').map(r => r.perceived.textMs)), doneMs: stats(pick('perceived', 'doneMs')) },
      clientOverhead: { cardMs: stats(pick('overhead', 'cardMs')), textMs: stats(pick('overhead', 'textMs')), doneMs: stats(pick('overhead', 'doneMs')) },
      poll: { roundTripMs: stats(polls.map(p => p.ms)), lastBytes: polls.at(-1)?.bytes, pollsPerQuestion: stats(rows.map(r => r.polls)), notModifiedPerQuestion: stats(rows.map(r => r.notModified)), bytesPerQuestion: stats(rows.map(r => r.bytes)), chatOnlyBytes, rest },
      pollBytes, serverEmitsPerQuestion: stats(rows.map(r => r.serverEmits)), rows };
  } finally {
    await server.close().catch(() => {}); await runtime.close().catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// Bytes of one poll of each state resource, without any question loop: the quick part of the bench.
async function pollBytes(count) {
  const { HeadlessRuntime } = load('runtime/headless-runtime.cjs');
  const { RemoteServer } = load('server/http.cjs');
  const dir = await fs.mkdtemp(path.join(tmp, 'poll-bytes-'));
  let base = 0;
  const instant = { async prepare() {}, async close() {}, async answer() { return { answer: filler(3, 600), kind: 'explanation', citations: [], limits: [], sources: [] }; } };
  const runtime = new HeadlessRuntime({ userData: dir, sessionsRoot: path.join(dir, 'sessions'), config: {}, transcriptionSettings: { save: async value => value },
    selectedModels: { observationModel: 'fake', inspectionModel: 'fake', codexModel: '' }, codexBinary: 'codex', smoke: true, agent: instant, readClock: () => performance.now() + base });
  const token = 'c'.repeat(64);
  const server = await new RemoteServer({ runtime, media: { assemble: async x => x }, token }).listen(0, '127.0.0.1');
  try {
    const { id } = await runtime.start(), watch = runtime.session.watch;
    const durable = layout === 'durable' || (layout === 'auto' && !Number.isFinite(watch.retentionMs));
    const live = durable ? count : Math.min(count, 37);
    for (let i = 0; i < count; i++) (i < count - live ? watch.history : watch.segments).push(passage(i, i < count - live));
    watch.sequence = count; base = 2000 + count * 8000; watch.emit();
    // Six answered questions, as after the perceived-delay loop.
    for (let k = 0; k < 6; k++) { const asked = runtime.ask({ sessionId: id, question: `Question ${k + 1} ?`, anchorMs: 1000 }); await runtime.deep.jobs.find(job => job.id === asked.id).done; }
    await delay(20);
    const raw = async (route, headers = {}) => {
      const samples = [];
      let reply;
      for (let i = 0; i < 5; i++) { const t = performance.now(); const response = await fetch(server.url + route, { headers: { Authorization: 'Bearer ' + token, ...headers } }); const text = await response.text(); samples.push(performance.now() - t); reply = { status: response.status, bytes: Buffer.byteLength(text), etag: response.headers.get('etag') }; }
      return { ...reply, ms: round(samples.sort((a, b) => a - b)[2]) };
    };
    const full = await raw('/v1/state'), panel = await raw('/v1/state?view=panel'), chat = await raw('/v1/state?view=chat');
    const tagged = panel.status === 200 ? ['/v1/state?view=panel', panel] : ['/v1/state', full];
    const unchanged = tagged[1].etag ? await raw(tagged[0], { 'If-None-Match': tagged[1].etag }) : null;
    const overlay = await raw('/v1/surveillance/overlay');
    const cell = reply => (reply?.status === 200 ? { bytes: reply.bytes, ms: reply.ms } : null);
    return { passages: count, minutes: Math.round(count * 8 / 60), layout: durable ? 'durable' : 'rolling', questions: 6, full: cell(full), panel: cell(panel), chat: cell(chat),
      notModified: unchanged?.status === 304 ? { bytes: unchanged.bytes, ms: unchanged.ms } : null, overlay: cell(overlay) };
  } finally {
    await server.close().catch(() => {}); await runtime.close().catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// Synchronous transaction run by the Mac main process at each deep:state event.
async function benchLedger() {
  const { UsageLedger } = load('adapters/trial-budget.cjs');
  const dir = await fs.mkdtemp(path.join(tmp, 'ledger-'));
  try {
    const file = path.join(dir, 'research-budget.json'), samples = [];
    new UsageLedger(file).snapshot();
    for (let i = 0; i < 150; i++) { const t = performance.now(); new UsageLedger(file).snapshot(); samples.push(performance.now() - t); }
    return { events: 150, totalMs: round(samples.reduce((a, b) => a + b, 0)), perCallMs: stats(samples) };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

// Cost of the state when every passage stays in `segments` instead of moving to `history`.
function benchAllLive() {
  const { WatchSession } = load('core/session.cjs');
  const { sessionTimeline } = load('core/session-timeline.cjs');
  const { VideoTools, consultationOf } = load('core/video-tools.cjs');
  const time = (fn, repeats = 9) => { const s = []; for (let i = 0; i < repeats; i++) { const t = performance.now(); fn(); s.push(performance.now() - t); } s.sort((a, b) => a - b); return round(s[Math.floor(s.length / 2)]); };
  const rows = [];
  for (const count of [450, 900]) for (const mode of ['archive-apres-5-min', 'tout-en-segments']) {
    const watch = new WatchSession({ id: 'bench', now: () => 2000 + count * 8000, perception: { transcribe: async () => ({}), observeVisual: async () => ({}) }, media: { put: async () => {}, read: async () => ({ frames: [], audio: null }), remove: async () => {} }, archive: { save: async () => {} } });
    const live = mode === 'tout-en-segments' ? count : Math.min(count, 37);
    for (let i = 0; i < count; i++) (i < count - live ? watch.history : watch.segments).push(passage(i, i < count - live));
    const snapshot = watch.snapshot(), view = watch.memoryView();
    const state = () => {
      const session = watch.snapshot();
      return { session, timeline: sessionTimeline(watch.memoryView()), chat: { jobs: [] }, captureGaps: [] };
    };
    rows.push({ passages: count, mode, statePollBytes: Buffer.byteLength(JSON.stringify(state())), statePollMs: time(() => JSON.stringify(state())), snapshotMs: time(() => watch.snapshot()),
      archiveBytes: Buffer.byteLength(JSON.stringify(snapshot, null, 2)), archiveStringifyMs: time(() => JSON.stringify(snapshot, null, 2)), 
      questionToolsMs: time(() => new VideoTools({ consultation: consultationOf(view), search: {}, inspector: {}, media: {} })) });
  }
  return rows;
}

(async () => {
  await fs.mkdir(tmp, { recursive: true });
  const report = { kind: 'Banc de délai perçu et d’octets par interrogation : vrai serveur HTTP local + vrai client TV, agent de chat simulé à délais fixes',
    note: 'Boucle locale (127.0.0.1) : aucun délai réseau, aucun coût d’analyse JSON ou de rendu propre à webOS, aucun fournisseur. Les politiques de sondage sont simulées dans ce banc ; ce n’est pas le code du panneau TV.',
    root, node: process.version, platform: `${os.platform()} ${os.arch()}`, cpus: os.availableParallelism(), loadAverage: os.loadavg().map(round), agentModelMs: AGENT };
  if (only.has('bytes')) {
    report.pollBytes = [];
    for (const count of sizes) {
      const row = await pollBytes(count); report.pollBytes.push(row);
      const show = cell => (cell ? `${cell.bytes} o` : 'indisponible');
      console.error(`${row.minutes} min · ${count} passages (${row.layout}) : état complet ${show(row.full)} · vue panel ${show(row.panel)} · vue chat ${show(row.chat)} · 304 ${show(row.notModified)} · overlay ${show(row.overlay)}`);
    }
  }
  if (only.has('perceived')) {
    report.runs = [];
    for (const count of sizes) for (const policy of Object.keys(POLICIES)) {
      const result = await run(count, policy, 20261013); report.runs.push(result);
      console.error(result.skipped ? `${count} passages · ${policy} : ${result.skipped}`
        : `${count} passages · ${policy} : carte ${result.perceived.cardMs.mean} ms · texte ${result.perceived.textMsDirect.mean} ms · fin ${result.perceived.doneMs.mean} ms · ${result.poll.bytesPerQuestion.mean} o par question · repos ${result.poll.rest.bytes} o en 10 s`);
    }
  }
  if (only.has('ledger')) report.ledger = await benchLedger();
  if (only.has('allLive')) report.allLive = benchAllLive();
  const text = JSON.stringify(report, null, 1);
  if (option('--out')) await fs.writeFile(option('--out'), text);
  else console.log(text);
})().catch(error => { console.error(error); process.exit(1); });
