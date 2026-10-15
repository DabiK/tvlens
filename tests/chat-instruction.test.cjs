const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { until, pause } = require('./helpers/wait.cjs');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
const { SimulatedSurveillanceAgent } = require('../adapters/simulated-surveillance-agent.cjs');

const CHAT_TIMEOUT_MS = 10000;

test('the instruction of the active surveillance reaches the chat agent of the host, and stops reaching it when the surveillance stops', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-chat-instruction-'));
  let clock = 0;
  const seen = [];
  const linked = 'Oui : 330 mètres. [Source officielle](https://www.toureiffel.paris/fr/page). Voir aussi [1] et (https://exemple.org).';
  const chat = { answer: async input => { seen.push([input.question, input.instruction]); return { answer: input.question.startsWith('Lien') ? linked : 'Ok.', kind: 'explanation', citations: [], limits: [] }; } };
  const runtime = new HeadlessRuntime({ userData: root, sessionsRoot: path.join(root, 'sessions'), config: {}, selectedModels: {}, smoke: true, agent: chat,
    surveillanceAgent: new SimulatedSurveillanceAgent(), readClock: () => clock });
  t.after(async () => { await runtime.close(); await fs.rm(root, { recursive: true, force: true }); });
  const { id } = await runtime.start();
  clock = 8000;
  await runtime.ingest({ sessionId: id, startMs: 0, endMs: 8000, clip: Buffer.from('fixture'), frames: [{ atMs: 0, dataUrl: 'data:image/jpeg;base64,YQ==' }], audio: null });
  const ask = async question => {
    const { id: jobId } = runtime.ask({ question, sessionId: id, anchorMs: 8000 });
    await until(
      () => ['done', 'error'].includes(runtime.deep.jobs.find(j => j.id === jobId)?.status),
      'question completed: ' + question,
      { timeoutMs: CHAT_TIMEOUT_MS },
    );
  };
  await ask('Avant toute consigne ?');
  runtime.startSurveillance({ sessionId: id, instruction: 'Vérifie tous les chiffres annoncés.' });
  await ask('Pendant la surveillance ?');
  runtime.stopSurveillance({ sessionId: id });
  await ask('Après l’arrêt ?');
  assert.deepEqual(seen, [['Avant toute consigne ?', undefined], ['Pendant la surveillance ?', 'Vérifie tous les chiffres annoncés.'], ['Après l’arrêt ?', undefined]]);
  // An answer is plain text: a Markdown link keeps its words and loses its address, nothing else is rewritten.
  await ask('Lien dans la réponse ?');
  assert.equal(runtime.deep.jobs.at(-1).result.answer, 'Oui : 330 mètres. Source officielle. Voir aussi [1] et (https://exemple.org).');
});

test('a passage still landing when the host ends the session is kept but never analysed for nothing', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-ending-'));
  let clock = 0, release, described = 0;
  const held = new Promise(resolve => { release = resolve; });
  // The media store of the session is slowed on the second passage: the end of the session arrives while it is being written.
  const perception = { transcribe: async () => { described++; return { observation: { transcript: 'Paroles.' }, elapsedMs: 1 }; }, observeVisual: async () => { described++; return { observation: { summary: 'Image.' }, elapsedMs: 1 }; } };
  const runtime = new HeadlessRuntime({ userData: root, sessionsRoot: path.join(root, 'sessions'), config: {}, selectedModels: {}, smoke: true,
    agent: { answer: async () => ({ answer: 'Ok.', kind: 'explanation', citations: [], limits: [] }) }, surveillanceAgent: new SimulatedSurveillanceAgent(), readClock: () => clock, overrides: { perception } });
  t.after(async () => { release(); await runtime.close(); await fs.rm(root, { recursive: true, force: true }); });
  const { id } = await runtime.start();
  const passage = (startMs, endMs) => ({ sessionId: id, startMs, endMs, clip: Buffer.from('fixture'), frames: [{ atMs: startMs, dataUrl: 'data:image/jpeg;base64,YQ==' }], audio: null });
  clock = 8000; await runtime.ingest(passage(0, 8000));
  await until(
    () => !runtime.session.watch.running && runtime.session.watch.segments[0].status === 'ready',
    'first passage analysed',
    { timeoutMs: CHAT_TIMEOUT_MS },
  );
  const before = described, store = runtime.session.store, put = store.put.bind(store);
  store.put = async (...args) => { await held; return put(...args); };
  clock = 16000; const landing = runtime.ingest(passage(8000, 16000));
  const ending = runtime.end();
  // The host is now waiting for that write, with the flag already raised: nothing may start once it lands.
  await pause(20);
  release();
  const [landed, ended] = await Promise.all([landing, ending]);
  assert.equal(landed, 'moment-2');
  assert.equal(ended.archived, true);
  assert.equal(described, before, 'no transcription and no description were started for the passage that landed during the end');
  const saved = JSON.parse(await fs.readFile(path.join(root, 'sessions', id, 'session.json'), 'utf8'));
  assert.deepEqual([...(saved.history || []), ...saved.segments].map(p => p.id), ['moment-1', 'moment-2'], 'the passage is kept in the archive');
});
