const TVLENS_OLLAMA_CONFIG_INVALID = 'TVLENS_OLLAMA_CONFIG_INVALID';
const TVLENS_OLLAMA_UNREACHABLE = 'TVLENS_OLLAMA_UNREACHABLE';
const TVLENS_OLLAMA_UNAVAILABLE = 'TVLENS_OLLAMA_UNAVAILABLE';
const TVLENS_OLLAMA_RESPONSE_INVALID = 'TVLENS_OLLAMA_RESPONSE_INVALID';
const { normalizeThink, thinkParameter } = require('./thinking.cjs');

function invalidConfig() {
  return Object.assign(Error('Backend local : URL http(s) sans identifiants, modèle et contexte valides requis.'), {
    code: TVLENS_OLLAMA_CONFIG_INVALID,
  });
}

function validateOllamaConfig(options) {
  const { url, model, numCtx, token } = options || {};
  let endpoint;
  try { endpoint = new URL(url); } catch {
    // Le refus commun ne révèle pas l'adresse fournie.
  }
  if (!/^https?:$/.test(endpoint?.protocol) || endpoint.username || endpoint.password) throw invalidConfig();
  if (typeof model !== 'string' || !model.trim()) throw invalidConfig();
  if (numCtx !== undefined && !(Number.isInteger(numCtx) && numCtx > 0)) throw invalidConfig();
  if (token != null && (typeof token !== 'string' || /[\r\n]/.test(token))) throw invalidConfig();
}

// Le transport ne garde aucun historique ; ses adresses et en-têtes ne sont jamais des diagnostics.
class OllamaHttpClient {
  #endpoint;
  #headers;
  #fetch;
  #parameters;

  constructor({ url, model, numCtx, keepAlive = '10m', think, token, fetchImpl = fetch } = {}) {
    think = normalizeThink(think, 'TVLENS_LOCAL_QUESTIONS_THINK');
    validateOllamaConfig({ url, model, numCtx, token });
    const endpoint = new URL(url);
    endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + '/api/';
    this.#endpoint = endpoint.href;
    this.#headers = new Headers({ 'Content-Type': 'application/json' });
    try { if (token) this.#headers.set('Authorization', `Bearer ${token}`); } catch { throw invalidConfig(); }
    this.#fetch = fetchImpl;
    this.#parameters = { model, ...thinkParameter(think), keep_alive: keepAlive, options: { temperature: 0, ...(numCtx && { num_ctx: numCtx }) } };
    this.backend = Object.freeze({ kind: 'ollama', model, host: endpoint.host, ...(numCtx && { numCtx }), keepAlive, think });
  }

  get temperature() {
    return this.#parameters.options.temperature;
  }

  // Per-call settings apply to this request only: the fixed parameters stay those of the next call.
  async chat({ messages, tools, format, signal, options, think }) {
    const parameters = { ...this.#parameters, options: { ...this.#parameters.options, ...options },
      ...(typeof think === 'boolean' && { think }) };
    return this.request('chat', { ...parameters, stream: false, messages, tools, format }, signal);
  }

  async embed({ input, signal }) {
    return this.request('embed', { model: this.#parameters.model, input, truncate: false }, signal);
  }

  async request(route, payload, signal) {
    signal.throwIfAborted();
    const endpoint = new URL(this.#endpoint);
    endpoint.pathname += route;
    let response, body;
    try {
      response = await this.#fetch(endpoint.href, { method: 'POST', headers: this.#headers, signal,
        body: JSON.stringify(payload) });
      body = await response.text();
    } catch {
      // L'erreur réseau peut contenir une URL ou un jeton ; seul le refus expurgé sort du transport.
    }
    signal.throwIfAborted();
    if (typeof body !== 'string') throw Object.assign(Error('Backend local injoignable.'), { code: TVLENS_OLLAMA_UNREACHABLE });
    if (!response.ok) throw Object.assign(Error(`Backend local indisponible (HTTP ${response.status}).`), {
      code: TVLENS_OLLAMA_UNAVAILABLE, httpStatus: response.status,
    });
    try { return JSON.parse(body); } catch {
      throw Object.assign(Error('Réponse du backend local invalide.'), { code: TVLENS_OLLAMA_RESPONSE_INVALID });
    }
  }
}

module.exports = { OllamaHttpClient, validateOllamaConfig, TVLENS_OLLAMA_CONFIG_INVALID,
  TVLENS_OLLAMA_UNREACHABLE, TVLENS_OLLAMA_UNAVAILABLE, TVLENS_OLLAMA_RESPONSE_INVALID };
