// What a replay report keeps of the local web retrieval: its settings, and per question what was retrieved and
// validated. Never a page text, a quotation of a page, a corpus path or a search address.
const { DEFAULT_WEB_TRIGGER } = require('../adapters/ollama/question-agent.cjs');

// Codex keeps its own web: the local settings only describe local questions.
function webSettingsOf(config) {
  const localWeb = config.questionsBackend === 'local' ? config.localWeb : null;
  if (!localWeb) return null;
  return { backend: localWeb.backend, trigger: localWeb.trigger ?? DEFAULT_WEB_TRIGGER, residence: null };
}

function questionsWebOf(configured, webRetrieval) {
  if (configured !== 'local') return 'capacité Codex';
  if (!webRetrieval) return 'indisponible ; outils vidéo seulement';
  return `récupération locale ${webRetrieval.backend}, déclencheur ${webRetrieval.trigger}`;
}

function sourceValidationOf(validation) {
  if (!validation) return null;
  return { proposed: validation.proposed, accepted: validation.accepted,
    rejected: (validation.rejected || []).map(({ url, reason }) => ({ url, reason })) };
}

// Read from the agent's own result: DeepAsk may refuse the answer and publish a result without them.
function webRecordOf(result) {
  if (!result?.retrieval) return null;
  const { residence, status, documents, elapsedMs } = result.retrieval;
  return { retrieval: { residence, status, documents, elapsedMs },
    acceptedSources: (result.sources || []).map(source => source.url),
    sourceValidation: sourceValidationOf(result.sourceValidation) };
}

// A source's evidence quotes the page it comes from.
function withoutPageText(result) {
  const copy = structuredClone(result);
  if (Array.isArray(copy?.sources)) copy.sources = copy.sources.map(({ evidence, ...source }) => source);
  return copy;
}

// One retrieval that left the machine makes the whole campaign hybrid; unrelated to the hybrid search of embeddings.
function campaignWebResidence(questions) {
  const residences = new Set(questions.map(entry => entry.web?.retrieval?.residence).filter(Boolean));
  return ['hybrid', 'unknown', 'local'].find(residence => residences.has(residence)) ?? null;
}

module.exports = { webSettingsOf, questionsWebOf, webRecordOf, withoutPageText, campaignWebResidence };
