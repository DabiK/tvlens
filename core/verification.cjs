class VerificationService {
  /** @param {{verifier: import('./ports.cjs').VerificationPort}} dependencies */
  constructor({ verifier, onChange = () => {}, archive, now = () => Date.now() }) {
    Object.assign(this, { verifier, onChange, archive, now });
    this.busy = false; this.jobs = [];
  }
  snapshot() { return { busy: this.busy, jobs: this.jobs.map(job => ({ ...job })) }; }
  emit() { this.onChange(this.snapshot()); }
  async verify({ claim, context = '' }) {
    if (typeof claim !== 'string' || !claim.trim() || claim.length > 2000) throw new Error('Une affirmation explicite de 1 à 2 000 caractères est requise.');
    if (typeof context !== 'string' || context.length > 6000) throw new Error('Contexte de vérification invalide.');
    if (this.busy) throw new Error('Une vérification est déjà en cours.');
    this.busy = true;
    const job = { id: `verification-${this.jobs.length + 1}`, claim: claim.trim(), createdAt: this.now(), status: 'running', result: null, error: null };
    this.jobs.push(job); this.emit();
    try {
      const result = await this.verifier.verify({ claim: claim.trim(), context });
      if (!result || typeof result.normalizedClaim !== 'string' || typeof result.conclusion !== 'string' || !['supported', 'contradicted', 'mixed', 'insufficient'].includes(result.assessment) || !Array.isArray(result.sources) || !Array.isArray(result.limitations)) throw new Error('Résultat de vérification invalide.');
      const seen = new Set();
      const sources = result.sources.filter(source => {
        if (!source || typeof source.url !== 'string' || !/^https:\/\/[^\s/@]+(?:[/?#]|$)/i.test(source.url) || seen.has(source.url) || typeof source.title !== 'string' || !source.title.trim() || typeof source.evidence !== 'string' || !source.evidence.trim() || !['supports', 'contradicts', 'context'].includes(source.relation)) return false;
        seen.add(source.url); return true;
      }).slice(0, 6);
      const limitations = result.limitations.filter(x => typeof x === 'string').slice(0, 8);
      if (!sources.length || !result.research?.webSearches) job.result = {
        claim: claim.trim(), normalizedClaim: result.normalizedClaim, assessment: 'insufficient',
        conclusion: 'La recherche n’a pas fourni de preuves externes exploitables. Cette affirmation n’est pas vérifiée.',
        sources: [], limitations: [...limitations, 'Aucune conclusion fondée uniquement sur la mémoire du modèle.'], research: result.research
      };
      else job.result = { ...result, claim: claim.trim(), sources, limitations };
      job.status = 'done';
      return job.result;
    } catch (error) {
      job.status = 'error'; job.error = error.message; throw error;
    } finally {
      job.finishedAt = this.now(); this.busy = false;
      try { await this.archive?.save(job); } catch { job.archiveError = 'Cette vérification n’a pas pu être sauvegardée.'; }
      this.emit();
    }
  }
}
module.exports = { VerificationService };
