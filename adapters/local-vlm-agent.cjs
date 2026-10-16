// Local HTTP VLM (Ollama /api/chat) behind the analysis-agent contract of codex-analysis-agent.cjs.
// Prompt, bounded context and observation validation stay in CodexPerception.
// Contract-tested against a fake server only: no real backend has been exercised from here.
const CLOSED = 'Backend local fermé.', INVALID = 'Réponse du modèle local invalide.';
const IMAGE = /^data:image\/[\w.+-]+;base64,([A-Za-z0-9+/]+=*)$/;
// Ollama reports durations in nanoseconds.
const TIMINGS = [['totalMs', 'total_duration', 1e6], ['loadMs', 'load_duration', 1e6], ['promptEvalMs', 'prompt_eval_duration', 1e6], ['evalMs', 'eval_duration', 1e6], ['promptTokens', 'prompt_eval_count', 1], ['evalTokens', 'eval_count', 1]];
class LocalVlmAgent {
  // Private: an endpoint or Authorization header must not surface when the agent is logged or serialized.
  #endpoint; #headers; #closing = new AbortController();
  constructor({ url, model, numCtx, keepAlive = '10m', timeoutMs = 45000, headers = {}, fetchImpl = fetch } = {}) {
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
    Object.assign(this, { host: endpoint.host, model, numCtx, keepAlive, timeoutMs, fetchImpl });
    this.tail = Promise.resolve();
  }
  // No implicit model load: the answer that pays for one reports it in providerTimings.loadMs.
  prepare() { return Promise.resolve(); }
  // Stateless: every request is independent, nothing can leak from one topic to the next.
  reset() { return Promise.resolve(); }
  answer(input) {
    const pending = this.tail.catch(() => {}).then(() => this.run(input));
    this.tail = pending;
    return pending;
  }
  async run({ instructions, signal, mediaInput = [], outputSchema }) {
    this.#closing.signal.throwIfAborted();
    signal?.throwIfAborted();
    const images = mediaInput.map((item) => {
      const match = item?.type === 'image' && typeof item.url === 'string' && IMAGE.exec(item.url);
      if (!match) throw Error('Backend local : image invalide.');
      return match[1];
    });
    const started = Date.now(), model = this.model;
    const aborted = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(this.timeoutMs), this.#closing.signal]);
    let response, text;
    try {
      response = await this.fetchImpl(this.#endpoint, { method: 'POST', headers: this.#headers, signal: aborted,
        body: JSON.stringify({ model, stream: false, format: outputSchema, keep_alive: this.keepAlive, options: { temperature: 0, ...(this.numCtx ? { num_ctx: this.numCtx } : {}) }, messages: [{ role: 'user', content: instructions, images }] }) });
      text = await response.text();
    } catch {
      // Le refus est transformé juste après : raison d'abandon prioritaire, sinon erreur
      // « injoignable ». Le détail du transport peut contenir URL ou en-têtes privés.
    }
    // Checked after the body as well: a result landing after cancellation, timeout or close is never returned.
    if (aborted.aborted) throw aborted.reason;
    // Transport errors can quote the URL or a header value: never forwarded.
    if (typeof text !== 'string') throw Error('Backend local injoignable.');
    if (!response.ok) throw Error(`Backend local indisponible (HTTP ${response.status}).`);
    let data, output;
    try { data = JSON.parse(text); output = typeof data.message.content === 'string' ? JSON.parse(data.message.content) : null; } catch { throw Error(INVALID); }
    if (!output || typeof output !== 'object' || Array.isArray(output)) throw Error(INVALID);
    const providerTimings = {};
    for (const [key, field, scale] of TIMINGS) if (Number.isFinite(data[field]) && data[field] >= 0) providerTimings[key] = Math.round(data[field] / scale);
    // Spread first so the model cannot overwrite them: elapsedMs is transport + inference seen from this host, backend is where this request went.
    // A stateless HTTP backend never reconnects; a model load shows in providerTimings.loadMs.
    return { ...output, elapsedMs: Date.now() - started, coldStart: false, connectMs: 0, backend: { kind: 'ollama', model, host: this.host, ...(this.numCtx ? { numCtx: this.numCtx } : {}) }, providerTimings };
  }
  close() {
    this.#closing.abort(Error(CLOSED));
    return Promise.resolve();
  }
}
module.exports = { LocalVlmAgent };
