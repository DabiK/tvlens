const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { HeadlessRuntime } = require('../../runtime/headless-runtime.cjs');
const { createSessionRuntime } = require('../../runtime/session-runtime.cjs');
const { RemoteServer } = require('../../server/http.cjs');
const input = require('../fixtures/state-view-memory.json');

const TOKEN = 's'.repeat(64);
const SCENARIO_TITLE = 'Session du 21 sept. 2026, 16:13';

// Mémoire déterministe écrite comme une session la conserve, avant toute projection du fil.
async function stateViewScenario(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-state-view-memory-'));
  let clock = 0;
  const runtime = new HeadlessRuntime({
    userData: root, sessionsRoot: path.join(root, 'sessions'), config: {}, selectedModels: {}, smoke: true,
    readClock: () => clock, wallClock: () => 1790000000000,
    transcriber: { availability: () => ({ available: true, code: null }) },
    agent: { answer: async () => ({ answer: 'Réponse simulée.', citations: [], limits: [] }) },
  });
  let server;
  t.after(async () => {
    await server?.close();
    await runtime.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const session = createSessionRuntime({ ...runtime.sessionOptions(), id: input.id });
  // Le titre du témoin est explicite pour ne pas dépendre du fuseau de la machine.
  await session.store.saveManifest({ title: SCENARIO_TITLE });
  const state = structuredClone(input);
  Object.assign(session.watch, {
    history: state.history, segments: state.segments, losses: state.losses,
    sequence: state.history.length + state.segments.length,
    lastError: 'Dernière analyse indisponible.', saveError: 'Sauvegarde indisponible.',
    storageError: 'Stockage indisponible.', running: true, visionBlockedMs: 1500, visionHeldSince: 500000,
  });
  session.watch.setQuestionPending(true);
  session.watch.queue = state.segments.filter(p => p.status === 'queued');
  session.watch.visionQueue = state.segments.filter(p => p.visionStatus === 'queued');
  clock = input.elapsedMs;
  runtime.adopt(session, Array.from({ length: 35 }, (_, i) => ({
    id: `deep-${i + 1}`, question: `Question ${i + 1} ?`, status: 'done', createdAt: 1000 + i,
    result: { answer: 'Réponse conservée.', citations: [], observations: [], limits: [] },
    preview: 'Brouillon remplacé.', audit: { private: true },
  })));
  server = await new RemoteServer({ runtime, token: TOKEN }).listen(0, '127.0.0.1');
  const request = async (route, body) => {
    const response = await fetch(server.url + route, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, value: await response.json() };
  };
  return { runtime, session, request };
}

module.exports = { stateViewScenario };
