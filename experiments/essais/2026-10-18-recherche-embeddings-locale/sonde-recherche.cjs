// Contrôle réel T276 : recherche d'une vraie session par la composition de production des embeddings Ollama.
// 1. Index construit par Ollama sur les 19 passages réels, lié à son identité ; recherches par paraphrase.
// 2. Une autre instance (autre identité) ouvre un autre espace de cache : aucun vecteur mélangé.
// Lecture seule de la session copiée ; caches dans un dossier temporaire de la sonde.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const R = '/Users/Dabi/Documents/ISN/tvlens';
const { MemorySearch } = require(R + '/core/moment-search.cjs');
const { EmbeddingStore } = require(R + '/adapters/embedding-store.cjs');
const { OllamaEmbeddings } = require(R + '/adapters/embeddings/ollama-embeddings.cjs');
const { providerIdentity } = require(R + '/adapters/embeddings/provider-identity.cjs');

const [sessionDir, out, model = 'qwen3-embedding:0.6b'] = process.argv.slice(2);
const session = JSON.parse(fs.readFileSync(path.join(sessionDir, 'session.json'), 'utf8'));
const segments = [...(session.history || []), ...session.segments].filter((s) => s.observation?.summary)
  .map((s) => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, available: true, observation: s.observation }));
const anchorMs = Math.max(...segments.map((s) => s.endMs));
const QUERIES = [
  'un sondage sur l’élection présidentielle',
  'une escroquerie à la location de logements',
  'une personne interviewée dont le visage est caché',
  'il y a une minute',
];

const diagnostics = [];
async function searcher(root) {
  const provider = new OllamaEmbeddings({ url: 'http://127.0.0.1:11434', model, keepAlive: '1m' });
  const identity = providerIdentity(provider, root);
  const store = new EmbeddingStore(identity.file, identity.model, { assertIdentity: identity.assertIdentity, identityScoped: identity.identityScoped,
    onDiagnostic: (d) => diagnostics.push(d) });
  return { identity, search: new MemorySearch({ embeddings: identity.provider, cache: store }) };
}

(async () => {
  const root = await fsp.mkdtemp(path.join(path.dirname(out), 'caches-'));
  const report = { model, passages: segments.length, anchorMs, runs: [] };
  const a = await searcher(root);
  report.identityA = a.identity.diagnostic;
  for (const query of QUERIES) {
    const t0 = Date.now();
    try {
      const result = await a.search.search({ query, segments, anchorMs, signal: AbortSignal.timeout(60000) });
      const summaryOf = (id) => segments.find((s) => s.id === id)?.observation.summary.slice(0, 140);
      const top = result.moments.slice(0, 3).map((m) => ({ id: m.id, score: m.score, summary: summaryOf(m.id) }));
      report.runs.push({ query, ms: Date.now() - t0, mode: result.mode, top });
      console.log(`${query} | ${result.mode} | ${Date.now() - t0} ms | ${top.map((t) => t.id).join(', ')}`);
      console.log(`   1er : ${top[0]?.summary}`);
    } catch (e) {
      report.runs.push({ query, ms: Date.now() - t0, error: { code: e.code, message: String(e.message).slice(0, 200) } });
      console.log(`${query} | ERREUR ${e.code} ${e.message}`);
    }
  }
  const filesAfterA = fs.readdirSync(root);
  const b = await searcher(root);
  report.identityB = b.identity.diagnostic;
  const again = await b.search.search({ query: QUERIES[0], segments, anchorMs, signal: AbortSignal.timeout(60000) });
  const filesAfterB = fs.readdirSync(root);
  report.cache = { filesAfterA, filesAfterB, sameTopWithNewInstance: again.moments[0]?.id === report.runs[0]?.top?.[0]?.id,
    linesA: fs.readFileSync(path.join(root, filesAfterA[0]), 'utf8').trim().split('\n').length - 1, diagnostics };
  console.log('cache', JSON.stringify(report.cache));
  await fetch('http://127.0.0.1:11434/api/generate', { method: 'POST', body: JSON.stringify({ model, keep_alive: 0 }) }).catch(() => {});
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('résultats', out);
})();
