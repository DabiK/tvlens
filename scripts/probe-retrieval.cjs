const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { MemorySearch } = require('../core/moment-search.cjs');
const { EmbeddingStore } = require('../adapters/embedding-store.cjs');
const { OpenRouterEmbeddings } = require('../adapters/openrouter-embeddings.cjs');
const { ResearchBudget } = require('../adapters/trial-budget.cjs');
const { providerIdentity } = require('../adapters/embeddings/provider-identity.cjs');

const segments = [
  { id: 'moment-1', startMs: 0, endMs: 15000, available: true,
    observation: { summary: 'Une automobile freine brusquement pour laisser traverser un piéton.' } },
  { id: 'moment-2', startMs: 15000, endMs: 30000, available: true,
    observation: { summary: 'Un cuisinier découpe des carottes et les verse dans une casserole.' } },
  { id: 'moment-3', startMs: 30000, endMs: 45000, available: true,
    observation: { summary: 'Une personne applaudit après un spectacle musical.' } },
];
const query = 'Le véhicule qui évite de percuter un passant';
async function probe() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-search-eval-'));
  try {
    const budget = new ResearchBudget(path.resolve('.local/research-budget.json'));
    const embeddings = new OpenRouterEmbeddings({ apiKey: process.env.OPENROUTER_API_KEY, budget });
    const identity = providerIdentity(embeddings, root);
    const search = new MemorySearch({ embeddings: identity.provider,
      cache: new EmbeddingStore(identity.file, identity.model, { assertIdentity: identity.assertIdentity }) });
    const before = budget.snapshot();
    const result = await search.search({ query, segments, anchorMs: 45000, signal: AbortSignal.timeout(30000) });
    assert.equal(result.mode, 'hybrid');
    assert.equal(result.moments[0].id, 'moment-1');
    const after = budget.snapshot();
    const temporal = await search.search({ query: 'il y a vingt secondes', segments, anchorMs: 45000 });
    assert.equal(temporal.moments[0].id, 'moment-2');
    assert.equal(budget.snapshot().calls, after.calls);
    await fs.writeFile('docs/retrieval-live.json', JSON.stringify({ date: new Date().toISOString(), query,
      result, temporal, budgetBefore: before, budgetAfter: after }, null, 2));
    console.log('PASS: semantic paraphrase and temporal retrieval using real OpenRouter embeddings.');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
probe().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
