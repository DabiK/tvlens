const { schema } = require('../companion-prompt.cjs');
const { sourceKey } = require('../external-links.cjs');
const TVLENS_OLLAMA_ANSWER_INVALID = 'TVLENS_OLLAMA_ANSWER_INVALID';
const WEB_LIMIT = 'La recherche web n’est pas disponible pour les questions locales ; je ne peux pas confirmer de source externe.';
const SOURCE_LIMIT = 6;
const SOURCE_REJECTED = 'URL non récupérée pendant ce tour ou source mal formée';

function invalidAnswer() {
  return Object.assign(Error('Réponse du modèle local invalide.'), { code: TVLENS_OLLAMA_ANSWER_INVALID });
}

function validObject(value, shape) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!shape.required.every(key => Object.hasOwn(value, key))) return false;
  return Object.entries(value).every(([key, item]) => shape.properties[key] && valid(item, shape.properties[key]));
}

function valid(value, shape) {
  if (shape.enum && !shape.enum.includes(value)) return false;
  if (shape.type === 'object') return validObject(value, shape);
  if (shape.type === 'array') return Array.isArray(value) && value.every(item => valid(item, shape.items));
  if (shape.type === 'number') return Number.isFinite(value);
  return typeof value === shape.type;
}

function readMessage(data) {
  const message = data?.message;
  if (data?.done !== true || message?.role !== 'assistant' || typeof message.content !== 'string') throw invalidAnswer();
  if (message.tool_calls !== undefined && !Array.isArray(message.tool_calls)) throw invalidAnswer();
  return { role: 'assistant', content: message.content, ...(message.tool_calls && { tool_calls: message.tool_calls }) };
}

const filled = value => typeof value === 'string' && value.trim() !== '';

// The adapter is the only guard of a local source (DeepAsk does not check URLs): a source counts only if it names a
// page retrieved for this turn, once per page, under the URL of that page.
function retrievedSources(proposed, pages) {
  const byKey = new Map(pages.map(page => [sourceKey(page.url), page]));
  const cited = new Set(), sources = [], rejected = [];
  for (const source of proposed) {
    const key = sourceKey(source.url);
    const page = key && byKey.get(key);
    if (page && !cited.has(key) && filled(source.title) && filled(source.evidence) && sources.length < SOURCE_LIMIT) {
      cited.add(key);
      sources.push({ url: page.url, title: source.title, evidence: source.evidence });
    } else rejected.push({ url: source.url, reason: SOURCE_REJECTED });
  }
  return { sources, sourceValidation: { proposed: proposed.length, accepted: sources.length, rejected } };
}

function readAnswer(content, pages = []) {
  let value;
  try { value = JSON.parse(content); } catch { throw invalidAnswer(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidAnswer();
  // Métadonnées et diagnostics viennent de l'adaptateur, jamais du JSON du modèle.
  const result = Object.fromEntries(Object.keys(schema.properties).map(key => [key, value[key]]));
  if (!valid(result, schema)) throw invalidAnswer();
  if (pages.length) return { ...result, ...retrievedSources(result.sources, pages) };
  if (result.kind === 'external' || result.sources.length) {
    return { answer: WEB_LIMIT, kind: 'insufficient', citations: [], sources: [], limits: [...result.limits, WEB_LIMIT] };
  }
  return result;
}

module.exports = { readMessage, readAnswer, TVLENS_OLLAMA_ANSWER_INVALID };
