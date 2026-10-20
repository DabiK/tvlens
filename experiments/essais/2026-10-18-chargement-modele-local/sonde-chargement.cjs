// Contrôle réel T270 : la perception de production sur Ollama local, modèle déchargé au départ.
// Passage 1 à froid, passage 2 à chaud, puis passages 3 et 4 envoyés ensemble (le second attend le premier).
// Lecture seule des sessions ; aucune écriture dans l'app ni dans le dépôt.
const fs = require('node:fs');
const R = '/Users/Dabi/Documents/ISN/tvlens';
const { createSessionPerception } = require(R + '/runtime/session-providers.cjs');
const [model = 'gemma3:4b', out = `${__dirname}/resultats.json`] = process.argv.slice(2);
const sessionId = 'ec55a89c-ca7f-4ca0-af77-eb2b6b313495';
const D = `${process.env.HOME}/Library/Application Support/TVLens/sessions/${sessionId}`;
const session = JSON.parse(fs.readFileSync(`${D}/session.json`, 'utf8'));
const perception = createSessionPerception({
  id: 'probe-local', config: { perceptionBackend: 'local', localVlm: { url: 'http://127.0.0.1:11434', model, keepAlive: '2m' } },
  selectedModels: { observationModel: 'non-utilise' }, codexBinary: '/inexistant',
  transcriber: { transcribe: async () => { throw Error('transcription non utilisée par la sonde'); } },
  quota: null, smoke: false, liveObservation: true, overrides: {},
});
const ready = session.segments.filter((s) => s.status === 'ready').slice(0, 4);

async function observe(p, label) {
  const media = JSON.parse(fs.readFileSync(`${D}/media/${p.id}.json`, 'utf8'));
  const started = Date.now();
  try {
    const result = await perception.observeVisual({ id: p.id, frames: media.frames,
      observation: { transcript: p.observation.transcript, uncertainty: '' }, context: {}, lightweight: false });
    const m = result.metrics || {};
    return { label, id: p.id, ok: true, wallMs: Date.now() - started, coldStart: m.coldStart, modelState: m.modelState,
      clientTimings: m.clientTimings, providerTimings: m.providerTimings, backend: m.backend, connectMs: m.connectMs,
      threadStarted: m.threadStarted ?? m.newThread ?? null, metricKeys: Object.keys(m) };
  } catch (error) {
    return { label, id: p.id, ok: false, wallMs: Date.now() - started, code: error.code, erreur: String(error.message).slice(0, 300) };
  }
}

(async () => {
  await fetch('http://127.0.0.1:11434/api/generate', { method: 'POST', body: JSON.stringify({ model, keep_alive: 0 }) });
  const before = await (await fetch('http://127.0.0.1:11434/api/ps')).json();
  const rows = [];
  rows.push(await observe(ready[0], 'froid'));
  rows.push(await observe(ready[1], 'chaud'));
  rows.push(...await Promise.all([observe(ready[2], 'ensemble-1'), observe(ready[3], 'ensemble-2')]));
  for (const r of rows) {
    const c = r.clientTimings || {}, p = r.providerTimings || {};
    console.log(`${r.label.padEnd(10)} ${r.id} ${r.ok ? 'ok' : 'ÉCHEC ' + r.code} | mur ${r.wallMs} ms | attente ${Math.round(c.queueMs ?? NaN)} ms | ` +
      `HTTP ${Math.round(c.requestMs ?? NaN)} ms | Ollama total ${p.totalMs} ms, chargement ${p.loadMs} ms | ` +
      `coldStart ${r.coldStart} | modelState ${r.modelState}`);
  }
  await fetch('http://127.0.0.1:11434/api/generate', { method: 'POST', body: JSON.stringify({ model, keep_alive: 0 }) });
  fs.writeFileSync(out, JSON.stringify({ model, sessionId, modelsLoadedBefore: before.models?.map((x) => x.name) ?? [], rows }, null, 2));
  console.log('résultats', out);
  process.exit(0);
})();
