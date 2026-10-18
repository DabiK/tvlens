const MODEL = 'openai/text-embedding-3-small';
// A batch stays under the budget reservation of one embedding call (see trial-budget.cjs).
const MAX_TEXTS = 32, MAX_BATCH_BYTES = 48000;
const byteLength = text => { const bytes = typeof text === 'string' && text.trim() ? Buffer.byteLength(text, 'utf8') : Infinity; if (bytes > 6000) throw new Error('Texte trop volumineux pour les embeddings.'); return bytes; };
const checked = vector => { if (!Array.isArray(vector) || vector.length < 8 || vector.length > 4096 || vector.some(x => !Number.isFinite(x))) throw new Error('Embedding invalide.'); return vector; };
class OpenRouterEmbeddings {
  get identity() { return { backend: 'openrouter', model: MODEL, parameters: { encodingFormat: 'float' } }; }
  constructor({ apiKey, budget, fetchImpl = fetch }) { Object.assign(this, { apiKey, budget, fetchImpl }); this.model = MODEL; this.cache = new Map(); }
  // One reservation and one settle per HTTP request, whatever the number of inputs.
  async request(input, signal) {
    const id = this.budget.reserve(MODEL);
    const response = await this.fetchImpl('https://openrouter.ai/api/v1/embeddings', { method:'POST', headers:{ Authorization:`Bearer ${this.apiKey}`, 'Content-Type':'application/json' }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000), body:JSON.stringify({ model:MODEL, input, encoding_format:'float', provider:{ max_price:{ prompt:0.02 } } }) });
    if (!response.ok) throw new Error(`Embeddings indisponibles (HTTP ${response.status}).`);
    const data = await response.json();
    // Missing cost stays pending/unknown; never label an estimate as a billed charge.
    this.budget.settle(id, data.usage?.cost);
    return data;
  }
  remember(text, vector) { this.cache.set(text, vector); if (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value); }
  async embed(text, signal) {
    byteLength(text);
    signal?.throwIfAborted();
    if (this.cache.has(text)) return this.cache.get(text);
    const vector = checked((await this.request(text, signal)).data?.[0]?.embedding);
    this.remember(text, vector);
    return vector;
  }
  // Same order as the input. Beyond the limits the caller chunks.
  async embedMany(texts, signal) {
    if (!Array.isArray(texts) || texts.length > MAX_TEXTS) throw new Error(`Au plus ${MAX_TEXTS} textes par appel d’embeddings.`);
    if (texts.reduce((sum, text) => sum + byteLength(text), 0) > MAX_BATCH_BYTES) throw new Error(`Lot d’embeddings trop volumineux (${MAX_BATCH_BYTES} octets au plus).`);
    signal?.throwIfAborted();
    const vectors = new Map(texts.filter(text => this.cache.has(text)).map(text => [text, this.cache.get(text)]));
    const missing = [...new Set(texts.filter(text => !vectors.has(text)))];
    if (missing.length) {
      const items = (await this.request(missing, signal)).data;
      if (!Array.isArray(items) || items.length !== missing.length) throw new Error('Réponse d’embeddings incomplète.');
      const ordered = [];
      for (const [position, item] of items.entries()) ordered[item?.index ?? position] = item?.embedding;
      // Every vector is validated before any is cached or returned.
      missing.forEach((text, i) => vectors.set(text, checked(ordered[i])));
      for (const text of missing) this.remember(text, vectors.get(text));
    }
    return texts.map(text => vectors.get(text));
  }
}
module.exports = { OpenRouterEmbeddings, EMBEDDING_MODEL:MODEL };
