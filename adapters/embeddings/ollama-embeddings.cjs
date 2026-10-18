const { randomUUID } = require('node:crypto');
const { OllamaHttpClient, TVLENS_OLLAMA_RESPONSE_INVALID } = require('../ollama/http-client.cjs');
const { identityChanged, TVLENS_EMBEDDINGS_IDENTITY_CHANGED } = require('./provider-identity.cjs');
const TVLENS_EMBEDDINGS_RESPONSE_INVALID = 'TVLENS_EMBEDDINGS_RESPONSE_INVALID';
const TVLENS_EMBEDDINGS_INPUT_INVALID = 'TVLENS_EMBEDDINGS_INPUT_INVALID';
const TVLENS_LOCAL_EMBEDDINGS_TIMEOUT_INVALID = 'TVLENS_LOCAL_EMBEDDINGS_TIMEOUT_INVALID';
const TVLENS_LOCAL_EMBEDDINGS_BATCH_FAILED = 'TVLENS_LOCAL_EMBEDDINGS_BATCH_FAILED';
const MAX_TEXTS = 32;
const MAX_BATCH_BYTES = 48000;
const MAX_TEXT_BYTES = 6000;
const CACHE_SIZE = 256;
const TIMEOUT_MS = 30000;
// Au-delà, les minuteries Node ramènent le délai à 1 ms.
const MAX_TIMEOUT_MS = 2147483647;

function validateEmbeddingTimeout(timeoutMs = TIMEOUT_MS) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw Object.assign(Error(`TVLENS_LOCAL_EMBEDDINGS_TIMEOUT_MS : entier positif au plus égal à ${MAX_TIMEOUT_MS} requis.`), {
      code: TVLENS_LOCAL_EMBEDDINGS_TIMEOUT_INVALID,
    });
  }
}

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
  #timeoutMs;
  #onDiagnostic;
  #identityInvalid = false;
  constructor({ timeoutMs = TIMEOUT_MS, timeoutSignal = ms => AbortSignal.timeout(ms), onDiagnostic = () => {}, ...options } = {}) {
    validateEmbeddingTimeout(timeoutMs);
    this.#client = new OllamaHttpClient(options);
    this.#timeoutSignal = timeoutSignal;
    this.#timeoutMs = timeoutMs;
    this.#onDiagnostic = onDiagnostic;
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
      const vectors = await this.requestVectors(missing, signal, texts.length);
      missing.forEach((text, i) => {
        found.set(text, vectors[i]);
        this.#cache.set(text, vectors[i]);
        if (this.#cache.size > CACHE_SIZE) this.#cache.delete(this.#cache.keys().next().value);
      });
    }
    return texts.map(text => found.get(text));
  }
  async requestVectors(texts, signal, passageCount) {
    const deadline = this.#timeoutSignal(this.#timeoutMs);
    const effectiveSignal = AbortSignal.any([deadline, ...(signal ? [signal] : [])]);
    try {
      const data = await this.#client.embed({ input: texts, signal: effectiveSignal });
      effectiveSignal.throwIfAborted();
      return this.checkResponse(data, texts.length);
    } catch (error) {
      if (!signal?.aborted) this.diagnose(error, deadline, passageCount);
      throw error;
    }
  }
  diagnose(error, deadline, passageCount) {
    let cause = 'unavailable';
    if (deadline.aborted && error === deadline.reason) cause = 'timeout';
    else if ([TVLENS_EMBEDDINGS_RESPONSE_INVALID, TVLENS_OLLAMA_RESPONSE_INVALID, TVLENS_EMBEDDINGS_IDENTITY_CHANGED].includes(error?.code))
      cause = 'invalid-response';
    try {
      this.#onDiagnostic({ code: TVLENS_LOCAL_EMBEDDINGS_BATCH_FAILED, cause, passageCount });
    } catch {
      // Une panne du journal ne change ni le refus fournisseur ni la politique de reprise de l’index.
    }
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
module.exports = { OllamaEmbeddings, validateEmbeddingTimeout, TVLENS_EMBEDDINGS_RESPONSE_INVALID,
  TVLENS_EMBEDDINGS_INPUT_INVALID, TVLENS_LOCAL_EMBEDDINGS_TIMEOUT_INVALID, TVLENS_LOCAL_EMBEDDINGS_BATCH_FAILED };
