// T276 refait : le vrai adaptateur d'embeddings Ollama, délai par défaut, modèle froid avec gemma3:12b résident.
const fs = require('node:fs');
const R = '/Users/Dabi/Documents/ISN/tvlens';
const { OllamaEmbeddings } = require(R + '/adapters/embeddings/ollama-embeddings.cjs');
const { passageText } = require(R + '/core/shared/passage-text.cjs');
const O = 'http://127.0.0.1:11434';
const post = (route, body) => fetch(O + route, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.text());
const session = JSON.parse(fs.readFileSync(process.argv[2] + '/session.json', 'utf8'));
const texts = [...(session.history || []), ...session.segments].map(passageText).filter((t) => t.trim());
(async () => {
  for (const m of JSON.parse(await (await fetch(O + '/api/ps')).text()).models || []) await post('/api/generate', { model: m.name, keep_alive: 0 });
  await post('/api/generate', { model: 'gemma3:12b', prompt: 'ok', keep_alive: '3m', options: { num_predict: 1 } });
  const embeddings = new OllamaEmbeddings({ url: O, model: 'qwen3-embedding:0.6b', keepAlive: '1m' });
  const t0 = Date.now();
  try {
    const vectors = await embeddings.embedMany(texts);
    console.log(JSON.stringify({ ok: true, ms: Date.now() - t0, vectors: vectors.length, dimension: vectors[0]?.length }));
  } catch (e) { console.log(JSON.stringify({ ok: false, ms: Date.now() - t0, code: e.code, message: String(e.message).slice(0, 160) })); }
  for (const m of ['gemma3:12b', 'qwen3-embedding:0.6b']) await post('/api/generate', { model: m, keep_alive: 0 });
})();
