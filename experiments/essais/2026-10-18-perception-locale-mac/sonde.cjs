// Sonde hors dépôt : la vraie perception de production, branchée sur Ollama local, sur des passages déjà capturés.
// Lecture seule des sessions ; aucune écriture dans l'app ni dans le dépôt.
const fs = require('node:fs');
const R = '/Users/Dabi/Documents/ISN/tvlens';
const { createSessionPerception } = require(R + '/runtime/session-providers.cjs');
const [model = 'gemma3:4b', count = '6', sessionId = 'ec55a89c-ca7f-4ca0-af77-eb2b6b313495'] = process.argv.slice(2);
const D = `${process.env.HOME}/Library/Application Support/TVLens/sessions/${sessionId}`;
const session = JSON.parse(fs.readFileSync(`${D}/session.json`, 'utf8'));
const perception = createSessionPerception({
  id: 'probe-local', config: { perceptionBackend: 'local', localVlm: { url: 'http://127.0.0.1:11434', model, keepAlive: '2m' } },
  selectedModels: { observationModel: 'non-utilise' }, codexBinary: '/inexistant',
  transcriber: { transcribe: async () => { throw Error('transcription non utilisée par la sonde'); } },
  quota: null, smoke: false, liveObservation: true, overrides: {},
});
(async () => {
  const rows = [];
  for (const p of session.segments.filter((s) => s.status === 'ready').slice(0, Number(count))) {
    const media = JSON.parse(fs.readFileSync(`${D}/media/${p.id}.json`, 'utf8'));
    const started = Date.now();
    try {
      const observation = { transcript: p.observation.transcript, uncertainty: '' };
      const out = await perception.observeVisual({ id: p.id, frames: media.frames, observation, context: {}, lightweight: false });
      const { summary: local, visual: visuel } = out.observation;
      rows.push({ id: p.id, ms: Date.now() - started, frames: media.frames.length, metrics: out.metrics, local, visuel,
        codex: p.observation.summary, ok: true });
    } catch (error) {
      rows.push({ id: p.id, ms: Date.now() - started, frames: media.frames.length, ok: false, code: error.code, erreur: String(error.message).slice(0, 300) });
    }
    const r = rows.at(-1);
    console.log(`${r.id} ${r.ok ? 'ok' : 'ÉCHEC ' + (r.code || '')} ${r.ms} ms, ${r.frames} images${r.ok ? '' : ' — ' + r.erreur}`);
  }
  fs.writeFileSync(`${__dirname}/resultats-${model.replace(/[:/]/g, '_')}.json`, JSON.stringify({ model, sessionId, rows }, null, 2));
  process.exit(0);
})();
