class CachedInspector {
  constructor(inner, { maxEntries = 32 } = {}) {
    Object.assign(this, { inner, maxEntries });
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get identity() { return this.inner.identity; }

  async inspect(input) {
    input.signal?.throwIfAborted();
    const key = JSON.stringify([
      this.identity, input.question.trim().toLowerCase().replace(/\s+/g, ' '), input.startMs, input.endMs,
      input.segments.map(s => [s.id, s.startMs, s.endMs]), Boolean(input.exactSpeech),
    ]);
    if (this.cache.has(key)) {
      this.hits++;
      input.onProgress?.('Réexamen déjà obtenu : réutilisation des observations.');
      const value = structuredClone(this.cache.get(key));
      if (value.inspection) value.inspection = { ...value.inspection, cacheHit: true, modelCalled: false };
      return { ...value, cacheHit: true, cost: 0 };
    }
    this.misses++;
    const result = await this.inner.inspect(input);
    input.signal?.throwIfAborted();
    if (result.observations?.length) {
      this.cache.set(key, structuredClone(result));
      if (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value);
    }
    return { ...result, cacheHit: false };
  }
}
module.exports = { CachedInspector };
