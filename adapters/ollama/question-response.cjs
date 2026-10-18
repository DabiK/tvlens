const { schema } = require('../companion-prompt.cjs');
const TVLENS_OLLAMA_ANSWER_INVALID = 'TVLENS_OLLAMA_ANSWER_INVALID';
const WEB_LIMIT = 'La recherche web n’est pas disponible pour les questions locales ; je ne peux pas confirmer de source externe.';

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

function readAnswer(content) {
  let value;
  try { value = JSON.parse(content); } catch { throw invalidAnswer(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidAnswer();
  // Métadonnées et diagnostics viennent de l'adaptateur, jamais du JSON du modèle.
  const result = Object.fromEntries(Object.keys(schema.properties).map(key => [key, value[key]]));
  if (!valid(result, schema)) throw invalidAnswer();
  if (result.kind === 'external' || result.sources.length) {
    return { answer: WEB_LIMIT, kind: 'insufficient', citations: [], sources: [], limits: [...result.limits, WEB_LIMIT] };
  }
  return result;
}

module.exports = { readMessage, readAnswer, TVLENS_OLLAMA_ANSWER_INVALID };
