// Reproduction : un premier appel d'embeddings Ollama dépasse-t-il le délai de 8 s de l'adaptateur ?
// Mêmes textes que l'index du serveur (passageText des 19 passages), un seul lot, sans délai côté sonde.
// Conditions : modèle d'embeddings froid seul ; froid avec gemma3:12b résident ; chaud.
const fs = require('node:fs');
const R = '/Users/Dabi/Documents/ISN/tvlens';
const { passageText } = require(R + '/core/shared/passage-text.cjs');
const [sessionDir, out] = process.argv.slice(2);
const MODEL = 'qwen3-embedding:0.6b';
const OLLAMA = 'http://127.0.0.1:11434';
const session = JSON.parse(fs.readFileSync(`${sessionDir}/session.json`, 'utf8'));
const texts = [...(session.history || []), ...session.segments].map(passageText).filter((t) => t.trim());
const post = (route, body) => fetch(`${OLLAMA}${route}`, { method: 'POST', body: JSON.stringify(body) });
const unloadAll = async () => {
  const ps = await (await fetch(`${OLLAMA}/api/ps`)).json();
  for (const m of ps.models || []) await post('/api/generate', { model: m.name, keep_alive: 0 });
};
async function embed(label) {
  const started = Date.now();
  const res = await post('/api/embed', { model: MODEL, input: texts, keep_alive: '1m' });
  const data = await res.json();
  const row = { label, ms: Date.now() - started, http: res.status, vectors: data.embeddings?.length,
    loadMs: data.load_duration ? Math.round(data.load_duration / 1e6) : null,
    totalMs: data.total_duration ? Math.round(data.total_duration / 1e6) : null, overAdapterTimeout: Date.now() - started > 8000 };
  console.log(JSON.stringify(row));
  return row;
}
(async () => {
  const bytes = texts.reduce((n, t) => n + Buffer.byteLength(t), 0);
  console.log(`textes ${texts.length}, ${bytes} octets`);
  const rows = [];
  await unloadAll();
  rows.push(await embed('froid, seul'));
  rows.push(await embed('chaud'));
  await unloadAll();
  await post('/api/generate', { model: 'gemma3:12b', prompt: 'ok', keep_alive: '3m', options: { num_predict: 1 } }).then((r) => r.text());
  rows.push(await embed('froid, gemma3:12b résident'));
  await unloadAll();
  fs.writeFileSync(out, JSON.stringify({ model: MODEL, texts: texts.length, bytes, rows }, null, 2));
})();
