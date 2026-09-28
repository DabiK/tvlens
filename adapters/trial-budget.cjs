const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Conservative reservation for a full-context Flash Lite request, not an estimate
// of the much smaller TVLens request. Unknown charges remain reserved after errors.
class TrialBudget {
  constructor(file, limitUsd = 1) { this.file = file; this.limitUsd = Math.min(5, limitUsd); }
  transaction(fn) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    let lock;
    try { lock = fs.openSync(this.file + '.lock', 'wx', 0o600); }
    catch { throw new Error('Le compteur de budget est occupé. Réessaie dans un instant.'); }
    try {
      let data;
      try { data = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw new Error('Compteur de budget illisible : appels suspendus.'); }
      data ||= { limitUsd: this.limitUsd, spentUsd: 0, reservations: {}, calls: 0 };
      data.limitUsd = Math.min(data.limitUsd, this.limitUsd);
      if (!Number.isFinite(data.spentUsd) || data.spentUsd < 0 || !Number.isFinite(data.limitUsd)) throw new Error('Compteur de budget invalide.');
      const result = fn(data);
      fs.writeFileSync(this.file + '.tmp', JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(this.file + '.tmp', this.file);
      return result;
    } finally { fs.closeSync(lock); fs.unlinkSync(this.file + '.lock'); }
  }
  reserve(model) {
    if (!['google/gemini-2.5-flash-lite', 'google/gemini-2.5-flash', 'google/gemini-3.8-flash', 'openai/text-embedding-3-small'].includes(model)) throw new Error('Ce modèle payant n’a pas de plafond de coût validé pour cet essai.');
    return this.transaction(data => {
      const held = Object.values(data.reservations).reduce((sum, r) => sum + r.amountUsd, 0);
      // Embedding adapter bounds a request to 6,000 UTF-8 bytes (< 8,192 tokens).
      const amountUsd = model === 'openai/text-embedding-3-small' ? 0.001 : 0.45;
      if (data.spentUsd + held + amountUsd > data.limitUsd) throw new Error(`Budget d’essai protégé : plus assez de marge pour réserver cet appel (plafond ${data.limitUsd} $).`);
      const id = randomUUID(); data.reservations[id] = { amountUsd, at: new Date().toISOString() }; data.calls++;
      return id;
    });
  }
  settle(id, cost) {
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) return;
    this.transaction(data => {
      if (!data.reservations[id]) throw new Error('Réservation de budget introuvable.');
      data.spentUsd += cost; delete data.reservations[id];
    });
  }
  snapshot() { return this.transaction(data => ({ limitUsd: data.limitUsd, spentUsd: data.spentUsd, heldUsd: Object.values(data.reservations).reduce((sum, r) => sum + r.amountUsd, 0), calls: data.calls })); }
}
// User explicitly increased the research campaign total to $5, prior costs included.
// The original observation/Ask budget remains $1. Existing ledgers never auto-upgrade.
class ResearchBudget extends TrialBudget { constructor(file) { super(file, 5); } }
module.exports = { TrialBudget, ResearchBudget };
