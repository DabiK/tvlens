// Local HTTP VLM (Ollama /api/chat) behind the analysis-agent contract of codex-analysis-agent.cjs.
// Prompt, bounded context and observation validation stay in CodexPerception.
// Contract-tested against a fake server only: no real backend has been exercised from here.
const CLOSED = 'Backend local fermé.', INVALID = 'Réponse du modèle local invalide.';
const TVLENS_LOCAL_VLM_INPUT_REFUSED = 'TVLENS_LOCAL_VLM_INPUT_REFUSED';
const TVLENS_LOCAL_VLM_UNREACHABLE = 'TVLENS_LOCAL_VLM_UNREACHABLE';
const TVLENS_LOCAL_VLM_UNAVAILABLE = 'TVLENS_LOCAL_VLM_UNAVAILABLE';
const TVLENS_LOCAL_VLM_CLOSED = 'TVLENS_LOCAL_VLM_CLOSED';
const TVLENS_LOCAL_VLM_RESPONSE_INVALID = 'TVLENS_LOCAL_VLM_RESPONSE_INVALID';
const TVLENS_LOCAL_VLM_TIMEOUT = 'TVLENS_LOCAL_VLM_TIMEOUT';
const IMAGE = /^data:image\/[\w.+-]+;base64,([A-Za-z0-9+/]+=*)$/;
// Ollama reports durations in nanoseconds.
const TIMINGS = [['totalMs', 'total_duration', 1e6], ['loadMs', 'load_duration', 1e6], ['promptEvalMs', 'prompt_eval_duration', 1e6], ['evalMs', 'eval_duration', 1e6], ['promptTokens', 'prompt_eval_count', 1], ['evalTokens', 'eval_count', 1]];
// Champs absents ou invalides omis : aucune durée inconnue ne devient zéro.
// Les anciens champs *Ms restent arrondis ; rawNs garde les durées brutes Ollama en nanosecondes.
// promptTokens et evalTokens sont des nombres de tokens, indépendants de ces durées.
function providerTimings(data) {
  const timings = {}, rawNs = {};
  for (const [key, field, scale] of TIMINGS) {
    if (!Number.isFinite(data[field]) || data[field] < 0) continue;
    timings[key] = Math.round(data[field] / scale);
    if (scale !== 1) rawNs[field] = data[field];
  }
  if (Object.keys(rawNs).length) timings.rawNs = rawNs;
  return timings;
}
function requestDiagnostic({ queueMs, requestMs, aborted, deadline, signal, closing, timeoutMs }) {
  const diagnostic = { metrics: { clientTimings: { queueMs, requestMs }, modelState: 'unknown' } };
  if (aborted.aborted && aborted.reason === deadline.reason && !signal?.aborted && !closing.aborted)
    diagnostic.failure = { code: TVLENS_LOCAL_VLM_TIMEOUT, timeoutMs };
  return diagnostic;
}
function parseOutput(text, onProviderTimings) {
  let data, output;
  try { data = JSON.parse(text); }
  catch { throw Object.assign(Error(INVALID), { code: TVLENS_LOCAL_VLM_RESPONSE_INVALID }); }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw Object.assign(Error(INVALID), { code: TVLENS_LOCAL_VLM_RESPONSE_INVALID });
  onProviderTimings(providerTimings(data));
  try { output = typeof data.message?.content === 'string' ? JSON.parse(data.message.content) : null; }
  catch { throw Object.assign(Error(INVALID), { code: TVLENS_LOCAL_VLM_RESPONSE_INVALID }); }
  if (!output || typeof output !== 'object' || Array.isArray(output))
    throw Object.assign(Error(INVALID), { code: TVLENS_LOCAL_VLM_RESPONSE_INVALID });
  return { data, output };
}
class LocalVlmAgent {
  // Private: an endpoint or Authorization header must not surface when the agent is logged or serialized.
  #endpoint; #headers; #closing = new AbortController();
  constructor({ url, model, numCtx, keepAlive = '10m', timeoutMs = 45000, headers = {}, fetchImpl = fetch,
    now = () => performance.now() } = {}) {
    if (!url || !model) throw Error('Backend local : URL et modèle requis.');
    if (numCtx !== undefined && !(Number.isInteger(numCtx) && numCtx > 0)) throw Error('Backend local : taille de contexte invalide (entier positif).');
    let endpoint; try { endpoint = new URL(url); } catch {
      // La validation juste après refuse endpoint absent sans exposer l'URL fournie.
    }
    // fetch refuses a URL that embeds credentials: they belong in headers.
    if (!/^https?:$/.test(endpoint?.protocol) || endpoint.username || endpoint.password) throw Error('Backend local : URL http(s) sans identifiants requise.');
    endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + '/api/chat';
    try { this.#headers = new Headers(headers); this.#headers.set('Content-Type', 'application/json'); } catch { throw Error('Backend local : en-têtes invalides.'); }
    this.#endpoint = endpoint.href;
    Object.assign(this, { host: endpoint.host, model, numCtx, keepAlive, timeoutMs, fetchImpl, now });
    this.tail = Promise.resolve();
  }
  // Pas de chargement implicite : seule la réponse Ollama peut annoncer une durée de chargement.
  prepare() { return Promise.resolve(); }
  // Stateless: every request is independent, nothing can leak from one topic to the next.
  reset() { return Promise.resolve(); }
  answer(input) {
    const queuedAt = this.now();
    const pending = this.tail.catch(() => {}).then(() => this.run(input, queuedAt));
    this.tail = pending;
    return pending;
  }
  async run({ instructions, signal, mediaInput = [], outputSchema, onDiagnostic }, queuedAt) {
    const queueMs = this.now() - queuedAt;
    this.#closing.signal.throwIfAborted();
    signal?.throwIfAborted();
    const images = mediaInput.map((item) => {
      const match = item?.type === 'image' && typeof item.url === 'string' && IMAGE.exec(item.url);
      if (!match) throw Object.assign(Error('Backend local : image invalide.'), { code: TVLENS_LOCAL_VLM_INPUT_REFUSED });
      return match[1];
    });
    const model = this.model;
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const aborted = AbortSignal.any([...(signal ? [signal] : []), deadline, this.#closing.signal]);
    const started = this.now();
    let response, text, requestMs;
    try {
      response = await this.fetchImpl(this.#endpoint, { method: 'POST', headers: this.#headers, signal: aborted,
        body: JSON.stringify({ model, stream: false, format: outputSchema, keep_alive: this.keepAlive, options: { temperature: 0, ...(this.numCtx ? { num_ctx: this.numCtx } : {}) }, messages: [{ role: 'user', content: instructions, images }] }) });
      text = await response.text();
    } catch {
      // Le refus est transformé juste après : raison d'abandon prioritaire, sinon erreur
      // « injoignable ». Le détail du transport peut contenir URL ou en-têtes privés.
    }
    requestMs = this.now() - started;
    const diagnostic = requestDiagnostic({ queueMs, requestMs, aborted, deadline, signal,
      closing: this.#closing.signal, timeoutMs: this.timeoutMs });
    onDiagnostic?.(diagnostic);
    // Checked after the body as well: a result landing after cancellation, timeout or close is never returned.
    if (aborted.aborted) throw aborted.reason;
    // Transport errors can quote the URL or a header value: never forwarded.
    if (typeof text !== 'string') throw Object.assign(Error('Backend local injoignable.'), { code: TVLENS_LOCAL_VLM_UNREACHABLE });
    if (!response.ok) throw Object.assign(Error(`Backend local indisponible (HTTP ${response.status}).`), {
      code: TVLENS_LOCAL_VLM_UNAVAILABLE, httpStatus: response.status,
    });
    const { data, output } = parseOutput(text, timings => {
      diagnostic.metrics.providerTimings = timings;
      onDiagnostic?.(diagnostic);
    });
    // Durées clientes en ms : attente depuis answer(), puis HTTP jusqu'au corps complet (inférence comprise).
    // elapsedMs garde sa portée historique sans attente de file ; ce n'est pas une mesure pure du réseau.
    // Les métriques suivent le JSON du modèle pour qu'il ne puisse pas les usurper.
    // coldStart/connectMs décrivent la connexion, jamais les poids ni un fil Codex.
    // Ollama n'annonce pas l'état du modèle : même loadMs positif ou nul ne prouve ni froid ni chaud.
    return { ...output, elapsedMs: requestMs, clientTimings: { queueMs, requestMs }, modelState: 'unknown', coldStart: false, connectMs: 0,
      backend: { kind: 'ollama', model, host: this.host, ...(this.numCtx ? { numCtx: this.numCtx } : {}) }, providerTimings: providerTimings(data) };
  }
  close() {
    this.#closing.abort(Object.assign(Error(CLOSED), { code: TVLENS_LOCAL_VLM_CLOSED }));
    return Promise.resolve();
  }
}
module.exports = {
  LocalVlmAgent,
  TVLENS_LOCAL_VLM_INPUT_REFUSED, TVLENS_LOCAL_VLM_UNREACHABLE, TVLENS_LOCAL_VLM_UNAVAILABLE, TVLENS_LOCAL_VLM_CLOSED,
  TVLENS_LOCAL_VLM_RESPONSE_INVALID, TVLENS_LOCAL_VLM_TIMEOUT,
};
