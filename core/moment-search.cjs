const { passageText } = require("./passage-text.cjs");
const { MomentIndex } = require("./moment-index.cjs");
const { resolveTemporalTarget } = require("./session.cjs");
const normalize = (text) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
class MomentSearch {
  constructor({ index, embeddings, cache }) {
    // Compatibility for standalone evaluation scripts; production injects the index.
    this.index =
      index ?? (embeddings ? new MomentIndex({ embeddings, cache }) : null);
  }
  async search({ query, segments, anchorMs, signal, limit = 4 }) {
    if (typeof query !== "string" || !query.trim() || query.length > 2000)
      throw new Error("Recherche invalide.");
    const eligible = segments.filter((s) => s.endMs <= anchorMs);
    const target = resolveTemporalTarget(query, eligible, anchorMs);
    if (target !== undefined)
      return {
        mode: "time",
        moments: eligible
          .filter((s) => s.startMs <= target && s.endMs >= target)
          .map((s) => result(s, 1)),
        warnings: [],
      };
    const tokens = normalize(query).match(/[a-z0-9]{3,}/g) || [];
    const stop = new Set([
      "les",
      "des",
      "une",
      "est",
      "que",
      "qui",
      "quoi",
      "quand",
      "dans",
      "pour",
      "moment",
      "quel",
      "quelle",
      "avec",
      "comment",
      "pourquoi",
    ]);
    const terms = tokens.filter((x) => !stop.has(x));
    const warnings = [];
    let vector;
    if (this.index) {
      try {
        await this.index.ensure(eligible, signal);
        vector = await this.index.queryVector(query, signal);
      } catch (error) {
        if (signal?.aborted) throw error;
        warnings.push(
          "Recherche sémantique indisponible : classement textuel et temporel uniquement.",
        );
      }
    }
    const ranked = [];
    for (const s of eligible) {
      const text = passageText(s),
        lexical =
          terms.filter((t) => normalize(text).includes(t)).length /
          Math.max(1, terms.length);
      const semantic = vector
        ? Math.max(0, cosine(vector, await this.index.passageVector(s)))
        : 0;
      ranked.push({ s, score: lexical * 0.55 + semantic * 0.45 });
    }
    ranked.sort((a, b) => b.score - a.score || b.s.endMs - a.s.endMs);
    return {
      mode: vector ? "hybrid" : "lexical",
      moments: ranked
        .slice(0, Math.min(6, limit))
        .map((x) => result(x.s, x.score)),
      warnings,
    };
  }
}
function result(s, score) {
  return {
    id: s.id,
    startMs: s.startMs,
    endMs: s.endMs,
    text: passageText(s),
    available: Boolean(s.available),
    score,
  };
}
module.exports = { MomentSearch, passageText, cosine };
