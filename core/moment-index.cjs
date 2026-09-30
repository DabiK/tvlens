const { passageText } = require("./passage-text.cjs");

// Owns embedding creation and reuse. No ranking or temporal selection here.
// The caller chooses when to index: current runtimes keep lazy indexing.
class MomentIndex {
  constructor({ embeddings, cache }) {
    this.embeddings = embeddings;
    this.cache = cache;
  }

  async ensure(segments, signal) {
    for (const segment of segments) {
      signal?.throwIfAborted();
      const text = passageText(segment);
      if (text) await this.embedCached(segment.id, text, signal);
    }
  }

  async embedCached(id, text, signal) {
    const cached = await this.cache.get(id, text);
    if (cached) return cached;
    signal?.throwIfAborted();
    const vector = await this.embeddings.embed(text, signal);
    signal?.throwIfAborted();
    await this.cache.put(id, text, vector);
    return vector;
  }

  queryVector(query, signal) {
    return this.embedCached("__query__", query, signal);
  }
  passageVector(segment) {
    return this.cache.get(segment.id, passageText(segment));
  }
}
module.exports = { MomentIndex };
