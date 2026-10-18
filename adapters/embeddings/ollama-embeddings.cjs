const { randomUUID } = require('node:crypto');
const { OllamaHttpClient } = require('../ollama/http-client.cjs');
const { identityChanged } = require('./provider-identity.cjs');
const TVLENS_EMBEDDINGS_RESPONSE_INVALID = 'TVLENS_EMBEDDINGS_RESPONSE_INVALID';
const TVLENS_EMBEDDINGS_INPUT_INVALID = 'TVLENS_EMBEDDINGS_INPUT_INVALID';
const MAX_TEXTS = 32;
const MAX_BATCH_BYTES = 48000;
const MAX_TEXT_BYTES = 6000;
const CACHE_SIZE = 256;
const TIMEOUT_MS = 8000;

function invalidResponse() {
  return Object.assign(Error('Réponse d’embeddings invalide.'), { code: TVLENS_EMBEDDINGS_RESPONSE_INVALID });
}
function checkTexts(texts) {
  if (!Array.isArray(texts) || texts.length > MAX_TEXTS) throw invalidInput();
  let bytes = 0;
  for (const text of texts) {
    if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > MAX_TEXT_BYTES) throw invalidInput();
    bytes += Buffer.byteLength(text);
  }
  if (bytes > MAX_BATCH_BYTES) throw invalidInput();
}
function invalidInput() {
  return Object.assign(Error('Textes d’embeddings invalides ou trop volumineux.'), { code: TVLENS_EMBEDDINGS_INPUT_INVALID });
}
class OllamaEmbeddings {
  #client;
  #cache = new Map();
  #dimension;
  #timeoutSignal;
  #identityInvalid = false;
  constructor({ timeoutSignal = () => AbortSignal.timeout(TIMEOUT_MS), ...options } = {}) {
    this.#client = new OllamaHttpClient(options);
    this.#timeoutSignal = timeoutSignal;
    // Un tag peut désigner d'autres poids demain : seule cette instance peut réutiliser ces vecteurs.
    Object.defineProperty(this, 'identity', { enumerable: true, value: Object.freeze({
      backend: 'ollama', model: options.model, revision: 'instance:' + randomUUID(), parameters: Object.freeze({ truncate: false }),
    }) });
  }
  async embed(text, signal) {
    return (await this.embedMany([text], signal))[0];
  }
  async embedMany(texts, signal) {
    this.assertIdentity();
    checkTexts(texts);
    signal?.throwIfAborted();
    const found = new Map(texts.filter(text => this.#cache.has(text)).map(text => [text, this.#cache.get(text)]));
    const missing = [...new Set(texts.filter(text => !found.has(text)))];
    if (missing.length) {
      const effectiveSignal = AbortSignal.any([this.#timeoutSignal(), ...(signal ? [signal] : [])]);
      const data = await this.#client.embed({ input: missing, signal: effectiveSignal });
      effectiveSignal.throwIfAborted();
      const vectors = this.checkResponse(data, missing.length);
      missing.forEach((text, i) => {
        found.set(text, vectors[i]);
        this.#cache.set(text, vectors[i]);
        if (this.#cache.size > CACHE_SIZE) this.#cache.delete(this.#cache.keys().next().value);
      });
    }
    return texts.map(text => found.get(text));
  }
  assertIdentity() {
    if (this.#identityInvalid) throw identityChanged();
  }
  checkResponse(data, count) {
    if (typeof data?.model !== 'string') throw invalidResponse();
    if (data.model !== this.identity.model) this.#identityInvalid = true;
    this.assertIdentity();
    const vectors = data?.embeddings;
    if (!Array.isArray(vectors) || vectors.length !== count) throw invalidResponse();
    const dimension = this.#dimension ?? vectors[0]?.length;
    if (!dimension || !vectors.every(v => Array.isArray(v) && v.length === dimension && v.every(Number.isFinite))) throw invalidResponse();
    this.#dimension = dimension;
    return vectors;
  }
}
module.exports = { OllamaEmbeddings, TVLENS_EMBEDDINGS_RESPONSE_INVALID, TVLENS_EMBEDDINGS_INPUT_INVALID };
