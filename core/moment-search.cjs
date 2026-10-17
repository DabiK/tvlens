const { passageText } = require("./shared/passage-text.cjs");
const { MomentIndex } = require("./moment-index.cjs");
const { resolveTemporalTarget } = require("./temporal-target.cjs");
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
class MemorySearch {
  constructor({
    index,
    embeddings,
    cache,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (timer) => clearTimeout(timer),
  }) {
    // Compatibility for standalone evaluation scripts; production injects the index.
    this.index =
      index ?? (embeddings ? new MomentIndex({ embeddings, cache }) : null);
    // A script that builds its own index wants the exhaustive ranking it always had.
    this.exhaustive = !index && Boolean(embeddings);
    Object.assign(this, { setTimer, clearTimer });
  }
  // Resolves undefined after ms without cancelling: a late vector still reaches
  // the index cache for the next search.
  within(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = Number.isFinite(ms)
        ? this.setTimer(() => resolve(undefined), Math.max(0, ms))
        : null;
      Promise.resolve(promise)
        .then(resolve, reject)
        .finally(() => this.clearTimer(timer));
    });
  }
  async search({
    query,
    segments,
    anchorMs,
    signal,
    limit = 4,
    budgetMs = 1500,
    queryBudgetMs = 2500,
  }) {
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
        if (!this.exhaustive && this.index.request && this.index.settle) {
          // Bounded wait, never a full catch-up: indexing carries on in the
          // background and missing vectors only cost the semantic part.
          this.index.request(eligible);
          await this.index.settle(budgetMs, signal);
        } else await this.index.ensure(eligible, signal);
        vector = await this.within(
          this.index.queryVector(query, signal),
          this.exhaustive ? Infinity : queryBudgetMs,
        );
        if (!vector)
          warnings.push(
            "Recherche sémantique trop lente : classement textuel et temporel uniquement.",
          );
      } catch (error) {
        if (signal?.aborted) throw error;
        warnings.push(
          "Recherche sémantique indisponible : classement textuel et temporel uniquement.",
        );
      }
      signal?.throwIfAborted();
    }
    const ranked = [];
    let indexable = 0,
      indexed = 0;
    for (const s of eligible) {
      const text = passageText(s),
        lexical =
          terms.filter((t) => normalize(text).includes(t)).length /
          Math.max(1, terms.length);
      let known = null;
      if (text.trim()) {
        indexable++;
        // An unreadable cache only costs the semantic part of this passage.
        try {
          if (this.index) known = await this.index.passageVector(s);
        } catch {
          // known reste null : score lexical conservé, indexed inchangé ; pending alimente l'avertissement si vector existe.
          // L'annulation de l'attente de l'index et de la requête reste propagée avant ce classement.
        }
        if (known) indexed++;
      }
      const semantic = vector ? Math.max(0, cosine(vector, known)) : 0;
      ranked.push({ s, score: lexical * 0.55 + semantic * 0.45 });
    }
    ranked.sort((a, b) => b.score - a.score || b.s.endMs - a.s.endMs);
    const pending = this.index ? indexable - indexed : 0;
    if (vector && pending)
      warnings.push(
        `${pending} passage(s) pas encore indexé(s) : classement textuel pour eux.`,
      );
    return {
      mode: vector ? "hybrid" : "lexical",
      moments: ranked
        .slice(0, Math.min(6, limit))
        .map((x) => result(x.s, x.score)),
      warnings,
      semantic: { eligible: indexable, indexed, pending },
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
    // Still re-examinable on its kept images, and worded apart by the clients.
    ...(s.mediaReason === "unreadable" ? { mediaReason: "unreadable" } : {}),
    score,
  };
}
module.exports = { MemorySearch };
