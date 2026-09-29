const MODEL = 'openai/text-embedding-3-small';
class OpenRouterEmbeddings {
  constructor({ apiKey, budget, fetchImpl = fetch }) { Object.assign(this, { apiKey, budget, fetchImpl }); this.model = MODEL; this.cache = new Map(); }
  async embed(text, signal) {
    if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text, 'utf8') > 6000) throw new Error('Texte trop volumineux pour les embeddings.');
    signal?.throwIfAborted();
    if (this.cache.has(text)) return this.cache.get(text);
    const id = this.budget.reserve(MODEL);
    const response = await this.fetchImpl('https://openrouter.ai/api/v1/embeddings', { method:'POST', headers:{ Authorization:`Bearer ${this.apiKey}`, 'Content-Type':'application/json' }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000), body:JSON.stringify({ model:MODEL, input:text, encoding_format:'float', provider:{ max_price:{ prompt:0.02 } } }) });
    if (!response.ok) throw new Error(`Embeddings indisponibles (HTTP ${response.status}).`);
    const data = await response.json();
    // Missing cost stays pending/unknown; never label an estimate as a billed charge.
    this.budget.settle(id, data.usage?.cost);
    const vector = data.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length < 8 || vector.length > 4096 || vector.some(x => !Number.isFinite(x))) throw new Error('Embedding invalide.');
    this.cache.set(text, vector); if (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value);
    return vector;
  }
}
module.exports = { OpenRouterEmbeddings, EMBEDDING_MODEL:MODEL };
