// Deterministic stand-in for the surveillance role: no process, no network, no provider.
// For the Electron smoke mode, offline simulations and overlap measurements. Everything it
// returns says that it is simulated: its "sources" use the reserved .invalid domain and can
// never be taken for pages that were really consulted.
const fold = value => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const tidy = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const SIGNAL_INTENT = /previen|signale|repere|alerte|avertis|dis[- ]moi quand|quand (?:ils|elles|on|il|elle|ca) parle|suis le sujet|suivre le sujet/;
const VERIFY_INTENT = /verif|controle|confront|fact|check/;
const STOP_WORDS = new Set(['previens', 'previenne', 'signale', 'repere', 'alerte', 'avertis', 'quand', 'parle', 'parlent', 'sujet', 'suivre', 'pour', 'avec', 'dans', 'elles', 'tous', 'toutes', 'cette', 'sont', 'etre', 'chaque', 'fois', 'programme', 'video']);
// Numbers that are not claims: clock times, scores, phone numbers, countdowns.
const DECOYS = [/\b\d{1,2}\s?h(?:\s?\d{2})?\b/g, /\b\d{1,2}:\d{2}\b/g, /\b(?:\d{2}[ .]){3,4}\d{2}\b/g, /\bdans \d+ secondes?\b/g];
const SCORE_TALK = /\b(?:score|mene|menent|buts?|sets?|match|mi-temps)\b/, SCORE = /\b\d+\s?(?:-|–|a)\s?\d+\b/g;
const OPINION = /je pense|a mon avis|je crois|peut-etre|devrait|va sans doute|j'espere|selon moi/;
const FICTION = /\b(?:film|fiction|serie|scene|personnage|episode)\b/;

function defaultWait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason || new Error('Annulé.'));
    if (!(ms > 0)) return resolve();
    const onAbort = () => { clearTimeout(timer); reject(signal.reason || new Error('Annulé.')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    timer.unref?.();
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
// Whole sentences of the passage, cut on a word boundary: a quote stays a verbatim span.
function spans(text) {
  return tidy(text).split(/(?<=[.!?…])\s+/).map(s => (s.length <= 240 ? s : s.slice(0, 240).replace(/\s+\S*$/, ''))).filter(s => s.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().length >= 8);
}
const lowerFirst = text => text.charAt(0).toLowerCase() + text.slice(1);
// Speech does not replace what is visible; each quote stays within its original field.
const passageQuotes = passage => [...new Set([passage.transcript, passage.visual].flatMap(text => spans(text || '')))];
const hash = text => [...String(text)].reduce((sum, char) => (sum * 31 + char.codePointAt(0)) % 9973, 7);

class SimulatedSurveillanceAgent {
  /** @param {{detectDelayMs?:number,verifyDelayMs?:number,wait?:Function,verdict?:(claim:object)=>string}} options */
  constructor({ detectDelayMs = 0, verifyDelayMs = 0, wait = defaultWait, verdict } = {}) {
    Object.assign(this, { detectDelayMs, verifyDelayMs, wait, verdict });
    this.simulated = true;
    this.calls = { prepare: 0, detect: 0, verify: 0, close: 0 };
  }
  async prepare() { this.calls.prepare++; }
  async close() { this.calls.close++; }

  async detect({ instruction, passages = [], known = [], maxClaims = 12, signal }) {
    this.calls.detect++;
    const started = Date.now();
    await this.wait(this.detectDelayMs, signal);
    const goal = fold(instruction), signalMode = SIGNAL_INTENT.test(goal) && !VERIFY_INTENT.test(goal);
    const topics = (goal.match(/[a-z]{4,}/g) || []).filter(word => !STOP_WORDS.has(word));
    const claims = [];
    for (const passage of passages) for (const quote of passageQuotes(passage)) {
      const flat = fold(quote);
      let item = null;
      if (signalMode) {
        if (topics.some(topic => flat.includes(topic))) item = { action: 'signal', kind: 'other', checkable: false, reason: '', statement: `Le programme aborde le sujet suivi : ${quote.replace(/[.!?…]+$/, '')}.` };
      } else if (/\d/.test([...DECOYS, ...(SCORE_TALK.test(flat) ? [SCORE] : [])].reduce((rest, pattern) => rest.replace(pattern, ' '), flat)) && !FICTION.test(flat)) {
        const opinion = OPINION.test(flat);
        item = { action: 'verify', kind: /%|pour cent|million|milliard|\d[ .,]?\d/.test(flat) && !/^\D*\b(?:19|20)\d{2}\b\D*$/.test(flat) ? 'figure' : 'date', checkable: !opinion,
          reason: opinion ? 'Opinion ou prévision : rien de vérifiable.' : '', statement: `Selon l’intervenant, ${lowerFirst(quote).replace(/[.!?…]+$/, '')}.` };
      }
      if (!item) continue;
      item.statement = item.statement.slice(0, 300);
      claims.push({ passageId: passage.id, quote, ...item, sameAs: known.find(k => k.statement === item.statement)?.id ?? null });
    }
    // Like a model that obeys the bound it is given: the core then reads an answer of that length as possibly cut short.
    return { claims: claims.slice(0, maxClaims), elapsedMs: Date.now() - started, simulated: true };
  }

  async verify({ claims = [], signal, onProgress }) {
    this.calls.verify++;
    const started = Date.now();
    onProgress?.({ message: 'Recherche simulée…' });
    await this.wait(this.verifyDelayMs, signal);
    const openedUrls = [], sourced = [];
    const verdicts = claims.map(claim => {
      // Stable for a given statement: the same simulation always yields the same history.
      const assessment = this.verdict?.(claim) || ['insufficient', 'contradicted', 'mixed', 'supported', 'supported'][hash(claim.statement) % 5];
      const subject = tidy(claim.statement).replace(/[.!?…«»"]/g, '').slice(0, 70);
      if (assessment === 'insufficient') return { claimId: claim.id, assessment, conclusion: 'Simulation hors ligne : aucune source fictive ne permet de conclure', sources: [], limitations: ['Résultat simulé : aucune recherche réelle.'] };
      const url = `https://simulation.invalid/tvlens/${encodeURIComponent(claim.id)}`;
      openedUrls.push(url);
      const conclusion = { supported: `Simulation hors ligne : une source fictive concorde avec « ${subject} »`, contradicted: `Simulation hors ligne : une source fictive donne une autre valeur que « ${subject} »`, mixed: `Simulation hors ligne : les sources fictives divergent sur « ${subject} »` }[assessment];
      sourced.push(conclusion);
      return { claimId: claim.id, assessment, conclusion,
        sources: [{ url, title: 'Source simulée — aucune page réelle consultée', publisher: 'Simulation TV Lens', publishedAt: null, evidence: 'Donnée fictive produite hors ligne pour la démonstration.', relation: assessment === 'contradicted' ? 'contradicts' : assessment === 'mixed' ? 'context' : 'supports' }],
        limitations: ['Résultat simulé : aucune recherche réelle.'] };
    });
    return { summary: sourced.slice(0, 3).map(sentence => sentence + '.').join(' '), verdicts, research: { webSearches: openedUrls.length, openedUrls, elapsedMs: Date.now() - started, simulated: true } };
  }
}
module.exports = { SimulatedSurveillanceAgent };
