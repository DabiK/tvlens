const { domainError } = require('../core/shared/domain-error.cjs');
const { FrozenCorpusRetrieval } = require('../adapters/web/frozen-corpus.cjs');
const { SearxngRetrieval } = require('../adapters/web/searxng.cjs');
const { WEB_TRIGGERS } = require('../adapters/ollama/question-agent.cjs');

const TVLENS_LOCAL_WEB_CONFIG_INVALID = 'TVLENS_LOCAL_WEB_CONFIG_INVALID';
const WEB_BACKENDS = ['corpus', 'searxng'];

// The refusal names the settings, never the value received: a URL may carry credentials.
const invalid = () => domainError(TVLENS_LOCAL_WEB_CONFIG_INVALID,
  'Récupération web locale : TVLENS_LOCAL_WEB_BACKEND corpus (avec TVLENS_LOCAL_WEB_CORPUS) ou searxng '
  + '(avec TVLENS_LOCAL_WEB_URL), toute TVLENS_LOCAL_WEB_URL en http(s) sans identifiants, '
  + 'TVLENS_LOCAL_WEB_TRIGGER auto ou always.');

function isSearchUrl(value) {
  let endpoint;
  try { endpoint = new URL(value); } catch {
    return false;
  }
  return /^https?:$/.test(endpoint.protocol) && !endpoint.username && !endpoint.password;
}

// Checked before any constructor: SearxngRetrieval does not check its URL, and a corpus is read only at the first question.
function validateLocalWeb(localWeb) {
  if (!localWeb || typeof localWeb !== 'object' || Array.isArray(localWeb)) throw invalid();
  const { backend, corpus, url, trigger } = localWeb;
  if (!WEB_BACKENDS.includes(backend)) throw invalid();
  if (backend === 'corpus' && (typeof corpus !== 'string' || !corpus.trim())) throw invalid();
  // Whatever the backend, a declared URL is copied with the scenario into the report: never one with credentials.
  if ((backend === 'searxng' || url !== undefined) && !isSearchUrl(url)) throw invalid();
  if (trigger !== undefined && !WEB_TRIGGERS.includes(trigger)) throw invalid();
}

function createWebRetrieval({ backend, corpus, url }) {
  return backend === 'corpus' ? new FrozenCorpusRetrieval({ directory: corpus }) : new SearxngRetrieval({ url });
}

// Without web retrieval the local agent receives its question options unchanged, the same object as before.
function localAgentOptions({ localQuestions, localWeb }, create = createWebRetrieval) {
  if (!localWeb) return localQuestions;
  return { ...localQuestions, retrieval: create(localWeb), ...(localWeb.trigger ? { webTrigger: localWeb.trigger } : {}) };
}

module.exports = { validateLocalWeb, createWebRetrieval, localAgentOptions, TVLENS_LOCAL_WEB_CONFIG_INVALID };
