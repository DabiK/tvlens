/**
 * Free-instruction surveillance (tickets 05 and 06). Portable core: no provider, no host, no chat.
 *
 * One viewer instruction is followed from its activation onwards. Every passage that starts after
 * the activation is counted in exactly one coverage bucket, every detected claim keeps a stable
 * identifier and ends in an explicit state, and a finished verification lot yields at most one card.
 * The module does not know that a chat exists: nothing here reads or writes a "question pending" flag.
 *
 * Ports, implemented by structural typing (to be mirrored in core/ports.cjs):
 *
 * @typedef {{id:string,startMs:number,endMs:number,transcript:string,summary:string,visual:string,uncertainty:string}} SurveillancePassage
 * Only the fields that belong to the passage itself: the cumulative topic summary never travels.
 * @typedef {{passageId:string,quote:string,statement:string,action:'verify'|'signal',kind:'figure'|'date'|'quote'|'fact'|'other',checkable:boolean,reason:string,sameAs:string|null}} DetectedClaim
 * action=verify + checkable → web verification queue ; verify + not checkable → undetermined ("non vérifiable") ;
 * action=signal (the instruction asks to be told, not to check) → noted, grouped in a lot of kind "signal".
 * @typedef {{detect:(request:{sessionId:string,instruction:string,passages:SurveillancePassage[],context:SurveillancePassage[],known:{id:string,statement:string}[],maxClaims:number,signal:AbortSignal})=>Promise<{claims:DetectedClaim[]}>}} ClaimDetectionPort
 * maxClaims is the number of elements one answer may hold (limits.maxClaimsPerBatch): an answer that reaches it is
 * treated as possibly cut short, never as a complete reading.
 * @typedef {{claimId:string,assessment:'supported'|'contradicted'|'mixed'|'insufficient',conclusion:string,sources:import('./ports.cjs').ExternalEvidence[],limitations:string[]}} ClaimVerdict
 * @typedef {{verify:(request:{sessionId:string,instruction:string,claims:{id:string,statement:string,quote:string,kind:string,startMs:number,endMs:number,context:string}[],signal:AbortSignal,onProgress?:Function})=>Promise<{summary:string,verdicts:ClaimVerdict[],research:{webSearches:number,openedUrls:string[],elapsedMs:number}}>}} ClaimResearchPort
 *
 * Surveillance owns activation (t0), the per-passage cursor, the claim registry, the bounded
 * non-losing queue, bounded concurrency, deadlines, grouped results and its own metrics.
 * Deadlines are evaluated in tick() against the injected clock: the host calls tick() every second.
 *
 * Published state (snapshot()): {version, enabled, sessionId, restored, activation, activity, coverage,
 * backlog, counts, totals, claims, lots, gaps, overlay:{seq,cards}, signals:{seq,cards}, metrics, limits, error}.
 * - coverage: one bucket per passage that starts after t0 (COVERAGE_BUCKETS); their sum is coverage.total.
 * - backlog.reason: 'registry-full' | 'detection-failed' | 'verification' | 'detection' | null, and activity.state is
 *   'late' whenever it is set. 'detection-failed' = the last reading failed, or a passage was given up less than
 *   limits.lateAfterMs ago; backlog.failure is then the last error, backlog.passagesFailed every passage given up.
 * - counts: one state per claim (CLAIM_STATES); their sum is totals.claims. claims/lots/gaps are the most
 *   recent part only, bounded by limits.stateClaims/stateLots; totals says how many exist.
 * - gaps: one entry per passage whose reading has something to tell: given up (failed), unreadable, or read with
 *   elements that validation dropped ({id,startMs,endMs,bucket,reason,rejected}; rejected = how many, reason says why).
 *   totals.rejected counts every element a detector returned and validation dropped, whatever the cause. In the
 *   saved form, passages[].rejects keeps what those elements said (bounded per passage).
 * - backlog.passagesFailed: passages given up and still unread. After an outage each gets one automatic reading;
 *   what fails again stays counted here for good, whether the activity is late or not.
 * - overlay.cards: lots of kind "verification" with at least one sourced claim, and nothing else.
 * - signals.cards: lots of kind "signal" (video observations): no source, no assessment, explicit interval.
 * snapshot({brief:true}) drops the lists for a once-per-second poll and keeps of each card what a screen shows
 * (text, interval, origin, labels; url, title and publisher per source); snapshot({full:true}) is the saved form.
 */
const DEFAULT_LIMITS = Object.freeze({
  // detectIntervalMs > 0 spaces the readings out: passages group into fewer provider calls, later.
  detectBatchPassages: 6, detectTimeoutMs: 45000, detectRetries: 1, maxClaimsPerBatch: 12, detectIntervalMs: 0,
  visionGraceMs: 10000, minTextChars: 12, contextPassages: 2,
  verifyConcurrency: 1, verifyBatchClaims: 3, verifyTimeoutMs: 120000, verifyRetries: 1,
  maxQueuedClaims: 12, maxDetectedBacklog: 48, maxClaims: 600, lateAfterMs: 90000, retryDelayMs: 2000,
  stateClaims: 60, stateLots: 20, overlayCards: 5,
});
// A mistyped setting is refused at construction instead of silently running under another one.
const BOUNDS = Object.freeze({
  detectBatchPassages: [1, 12], detectTimeoutMs: [1, 300000], detectRetries: [0, 3], maxClaimsPerBatch: [1, 40], detectIntervalMs: [0, 60000],
  visionGraceMs: [0, 120000], minTextChars: [1, 200], contextPassages: [0, 6],
  verifyConcurrency: [1, 3], verifyBatchClaims: [1, 3], verifyTimeoutMs: [1, 300000], verifyRetries: [0, 3],
  maxQueuedClaims: [1, 100], maxDetectedBacklog: [1, 500], maxClaims: [1, 5000], lateAfterMs: [1, 3600000], retryDelayMs: [0, 60000],
  stateClaims: [1, 200], stateLots: [1, 100], overlayCards: [1, 20],
});
const COVERAGE_BUCKETS = Object.freeze(['waiting', 'pending', 'scanning', 'scanned', 'rescan', 'empty', 'unscannable', 'failed']);
const CLAIM_STATES = Object.freeze(['detected', 'queued', 'running', 'sourced', 'undetermined', 'error', 'cancelled', 'noted']);
const TERMINAL = new Set(['sourced', 'undetermined', 'error', 'cancelled', 'noted']);
const READ = new Set(['scanned', 'rescan', 'empty', 'unscannable']);
const KINDS = ['figure', 'date', 'quote', 'fact', 'other'];
const ASSESSMENTS = ['supported', 'contradicted', 'mixed', 'insufficient'];
// Never a true/false badge: the wording says what the sources do, not what is true.
const ASSESSMENT_LABELS = Object.freeze({ supported: 'Concorde avec les sources', contradicted: 'Contredit par les sources', mixed: 'Sources partagées' });
// The type of a card is carried by the data: a signal is a video observation, never a web check.
const CARD_LABELS = Object.freeze({ verification: 'Sources consultées', signal: 'Repéré dans la vidéo' });
const TEXT_LIMITS = Object.freeze({ sentences: 3, chars: 420 });
const TRANSCRIPT_NOTICE = 'Propos relevés dans une transcription automatique : ils peuvent avoir été mal entendus.';
const FIELD_CAPS = Object.freeze({ transcript: 2400, summary: 600, visual: 600, uncertainty: 300 });
const LATE_LAG_MS = 60000, CONTEXT_CHARS = 1200, MAX_MENTIONS = 20, MIN_QUOTE_CHARS = 6, KNOWN_CLAIMS = 40, GAPS_IN_STATE = 20, MAX_REJECTS = 6;
// Why validation dropped an element a detector returned, as the history words it.
const REJECT_LABELS = Object.freeze({ quoteNotFound: 'citation introuvable dans le passage', unknownPassage: 'passage cité hors de cette lecture', invalid: 'élément invalide' });

const clip = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const tidy = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const fold = value => String(value ?? '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const plain = value => fold(value).replace(/[^a-z0-9]+/g, ' ').trim();
const plural = (count, one, many) => `${count} ${count > 1 ? many : one}`;
const stamp = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const deadline = message => Object.assign(new Error(message), { timeout: true });
const aggregate = () => ({ n: 0, mean: 0, max: 0, last: 0, total: 0 });
function record(target, value) {
  if (!Number.isFinite(value)) return;
  const v = Math.max(0, Math.round(value));
  target.n++; target.total += v; target.mean = Math.round(target.total / target.n); target.max = Math.max(target.max, v); target.last = v;
}
const freshMetrics = overlap => ({
  detect: { calls: 0, failures: 0, timeouts: 0, passagesScanned: 0, rescans: 0, emptySkipped: 0, claimsRaw: 0, claimsAccepted: 0, signals: 0, duplicates: 0, sameAsRejected: 0,
    // readingsAtBound: answers as long as one answer may be; passagesReread: passages sent back to be read alone;
    // passagesRevived: passages given up during an outage and read once more when reading came back.
    readingsAtBound: 0, passagesReread: 0, passagesRevived: 0,
    rejected: { unknownPassage: 0, quoteNotFound: 0, invalid: 0, overflow: 0 }, runMs: aggregate(), passageWaitMs: aggregate() },
  verify: { lots: 0, lotsFailed: 0, timeouts: 0, retries: 0, claims: 0, sourced: 0, undetermined: 0, errors: 0, cancelled: 0, missingVerdicts: 0, unknownVerdicts: 0,
    sourcesProposed: 0, sourcesAccepted: 0, webSearches: 0, textFallbacks: 0, waitMs: aggregate(), runMs: aggregate(), claimToResultMs: aggregate(), videoLagMs: aggregate() },
  // Informative only, and only when the host supplies a probe: never an input of any decision.
  ...(overlap ? { overlap: { lotsStartedDuringChat: 0, detectsDuringChat: 0 } } : {}),
});
function resolveLimits(overrides = {}) {
  const limits = { ...DEFAULT_LIMITS };
  for (const [key, value] of Object.entries(overrides || {})) {
    if (value === undefined) continue;
    const bounds = BOUNDS[key];
    if (!bounds) throw new Error(`Réglage de surveillance inconnu : ${key}.`);
    if (!Number.isInteger(value) || value < bounds[0] || value > bounds[1]) throw new Error(`Réglage de surveillance invalide : ${key} (${bounds[0]} à ${bounds[1]} attendu).`);
    limits[key] = value;
  }
  return Object.freeze(limits);
}

// ---- Deduplication -------------------------------------------------------------------------
// A wrong merge loses a claim for good (no identifier, no state, never checked); a wrong split only costs one
// more verification. So, by itself, the core merges two statements only when nothing that carries meaning differs.
// Spelled-out quantities count as numbers: "sept pour cent" and "neuf pour cent" must stay apart.
const NUMBER_WORDS = new Set(['zero', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'cent', 'cents', 'mille', 'demi', 'moitie', 'tiers', 'quart', 'double', 'triple']);
const SCALES = [[/^milliards?$/, 1e9], [/^millions?$/, 1e6], [/^(?:milliers?|mille)$/, 1e3]];
// Articles, the bare copula and the lightest prepositions only. Negations, pronouns, auxiliaries (a tense is part
// of a claim) and every preposition that has an opposite (avec/sans, pour/contre, avant/après, sur/sous) stay:
// dropping one could equate two claims.
const STOP_WORDS = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux', 'en', 'et', 'que', 'ce', 'cet', 'cette', 'ces', 'est', 'sont']);
// The preposition goes before accents are folded: afterwards it could not be told from the auxiliary "a".
const PREPOSITION_A = /(?<![\p{L}\p{N}])à(?![\p{L}\p{N}])/gu;
// The attribution the detector is asked for ("Selon l’intervenant, …") says who speaks, not what is claimed.
// Generic speakers only: a named person or body ("Selon l’Insee, …") is part of the claim and is kept.
const ATTRIBUTION = /^\s*(?:selon|apres)\s+(?:(?:le|la|les|un|une|cet|cette|ces)\s+)?(?:lui|elle|eux|elles|intervenante?s?|invitee?s?|orat(?:eur|rice)s?|locut(?:eur|rice)s?|presentat(?:eur|rice)s?|animat(?:eur|rice)s?|journalistes?)\b[\s,:]*/;
const TOKENS = /(\d{1,3}(?:[ .]\d{3})+|\d+)(?:[.,](\d+))?\s*(%|pour\s?cents?|milliards?|millions?|milliers?|mille)?|[a-z]+/g;
/**
 * {numbers, content}. numbers: every number of the statement, normalised (decimal comma, %, thousands, millions,
 * billions) and sorted. content: what the statement says, in order: its numbers and its words, without the
 * generic attribution, the elided articles and the few function words above.
 */
function claimKey(statement) {
  const text = fold(String(statement ?? '').toLowerCase().replace(PREPOSITION_A, ' ')).replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/\bn['\u2019]/g, 'ne ').replace(/\b(?:[ldscjmt]|qu|jusqu|lorsqu|puisqu)['\u2019]/g, '').replace(ATTRIBUTION, '');
  const numbers = [], content = [], spelled = new Set();
  for (const match of text.matchAll(TOKENS)) {
    if (match[1] === undefined) {
      const word = match[0];
      if (NUMBER_WORDS.has(word) && !spelled.has(word)) { spelled.add(word); numbers.push('w:' + word); }
      if (!STOP_WORDS.has(word)) content.push(word);
      continue;
    }
    let value = Number(match[1].replace(/[ .]/g, '') + (match[2] ? '.' + match[2] : ''));
    const unit = match[3] || '', scale = SCALES.find(([pattern]) => pattern.test(unit));
    if (scale) value = Math.round(value * scale[1] * 1000) / 1000;
    const number = String(value) + (unit === '%' || unit.startsWith('pour') ? '%' : '');
    numbers.push(number); content.push(number);
  }
  return { numbers: numbers.sort(), content };
}
const sameNumbers = (a, b) => a.numbers.length === b.numbers.length && a.numbers.every((n, i) => n === b.numbers[i]);
/**
 * Same claim only when the statements are all but identical: same numbers, same content in the same order.
 * 7 % and 9 % are two claims; so are the unemployment of the young and of the seniors at the same 17 %, and
 * "A beat B" and "B beat A". A paraphrase is merged only on the detector's explicit sameAs (see register()).
 */
function sameClaim(a, b) {
  const x = typeof a === 'string' ? claimKey(a) : a, y = typeof b === 'string' ? claimKey(b) : b;
  return sameNumbers(x, y) && x.content.length > 0 && x.content.length === y.content.length && x.content.every((token, i) => token === y.content[i]);
}
// One word swapped in an otherwise identical statement (the young / the seniors, France / Germany) is the typical
// different claim behind the same figure: not even the detector's sameAs merges those.
const oneWordApart = (a, b) => a.content.length === b.content.length && a.content.filter((token, i) => token !== b.content[i]).length === 1;

// ---- Detection validation ------------------------------------------------------------------
// The quote must be found, whole words, in ONE field of the passage it names.
function locate(passage, quote) {
  const needle = plain(quote);
  if (needle.length < MIN_QUOTE_CHARS) return null;
  for (const field of ['transcript', 'visual', 'summary']) if (` ${plain(passage[field])} `.includes(` ${needle} `)) return field;
  return null;
}
/**
 * Deterministic filter of a detector answer against the passages of ITS call. Nothing is dropped without a
 * counter and a record: {accepted, raw, rejected:{unknownPassage,quoteNotFound,invalid,overflow}, overflowed,
 * rejects:[{passageId,cause,statement,quote}]}. passageId is null when the element names no passage of the call.
 */
function validateDetection(result, passages, limits = DEFAULT_LIMITS) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.claims)) throw new Error('Résultat de détection invalide.');
  const byId = new Map(passages.map(p => [p.id, p]));
  const accepted = [], overflowed = [], rejects = [], rejected = { unknownPassage: 0, quoteNotFound: 0, invalid: 0, overflow: 0 };
  // What the detector wrote is kept with the cause: a quote one typographic variation away from the passage
  // is most often a real claim, and the history must be able to say that it was raised and dropped.
  const reject = (cause, item, passageId = null) => { rejected[cause]++; rejects.push({ passageId, cause, statement: clip(item?.statement, 300), quote: clip(item?.quote, 300) }); };
  for (const item of result.claims) {
    if (!item || typeof item !== 'object') { reject('invalid', null); continue; }
    const passage = typeof item.passageId === 'string' ? byId.get(item.passageId) : null;
    if (!passage) { reject('unknownPassage', item); continue; }
    const statement = tidy(typeof item.statement === 'string' ? item.statement : ''), action = item.action === undefined ? 'verify' : item.action;
    const checkable = item.checkable === undefined ? true : item.checkable;
    if (statement.length < 8 || statement.length > 300 || !KINDS.includes(item.kind) || !['verify', 'signal'].includes(action) || typeof checkable !== 'boolean'
      || typeof item.quote !== 'string' || item.quote.length > 300 || plain(item.quote).length < MIN_QUOTE_CHARS) { reject('invalid', item, passage.id); continue; }
    const field = locate(passage, item.quote);
    if (!field) { reject('quoteNotFound', item, passage.id); continue; }
    if (accepted.length >= limits.maxClaimsPerBatch) { reject('overflow', item, passage.id); overflowed.push(passage.id); continue; }
    accepted.push({ passageId: passage.id, quote: tidy(item.quote), field, statement, action, kind: item.kind, checkable: action === 'verify' ? checkable : false,
      reason: clip(item.reason, 200), sameAs: typeof item.sameAs === 'string' && item.sameAs ? item.sameAs : null });
  }
  return { accepted, raw: result.claims.length, rejected, overflowed, rejects };
}
const freshRejected = () => ({ unknownPassage: 0, quoteNotFound: 0, invalid: 0 });
// What the history says about the readings of one passage. Counted over every reading of it, so never fewer
// elements than were really dropped: a passage read twice may count the same element twice.
function remark(entry) {
  const parts = [], dropped = Object.entries(REJECT_LABELS).filter(([cause]) => entry.rejected[cause]);
  if (entry.rescanError) parts.push(`Relecture avec la description en échec : ${entry.rescanError}`);
  if (entry.overflow) parts.push(`${plural(entry.overflow, 'élément non retenu', 'éléments non retenus')} : trop d’éléments dans une même lecture.`);
  if (dropped.length) parts.push(`${plural(dropped.reduce((sum, [cause]) => sum + entry.rejected[cause], 0), 'élément relevé puis écarté', 'éléments relevés puis écartés')} : ${dropped.map(([cause, label]) => `${label} (${entry.rejected[cause]})`).join(', ')}.`);
  if (parts.length && entry.split) parts.push('Passage relu seul ensuite.');
  if (entry.truncated) parts.push(`Lecture possiblement incomplète : ${plural(entry.truncated, 'élément rendu', 'éléments rendus')}, le maximum d’une réponse.`);
  return parts.join(' ') || null;
}
const droppedIn = entry => entry.overflow + Object.values(entry.rejected).reduce((sum, count) => sum + count, 0);

// ---- Verdicts and grouped text -------------------------------------------------------------
// Same normalisation on both sides: a cited URL counts only if that very page was opened.
function sourceKey(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}
/**
 * Pure validation of a research answer for the claims of one lot. A claim is sourced if and only if
 * its verdict is supported/contradicted/mixed, a web search really happened and at least one cited
 * HTTPS page (no credentials, with title and evidence) is among the pages actually opened.
 */
function applyVerdicts(claims, result) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.verdicts)) throw new Error('Résultat de vérification invalide.');
  const research = result.research && typeof result.research === 'object' ? result.research : {};
  const webSearches = Number.isFinite(research.webSearches) && research.webSearches > 0 ? Math.floor(research.webSearches) : 0;
  const opened = new Set((Array.isArray(research.openedUrls) ? research.openedUrls : []).map(sourceKey).filter(Boolean));
  const ids = new Set(claims.map(c => c.id)), byId = new Map();
  let unknownVerdicts = 0, missingVerdicts = 0, sourcesProposed = 0, sourcesAccepted = 0, demoted = 0;
  for (const verdict of result.verdicts) {
    if (!verdict || typeof verdict !== 'object' || !ids.has(verdict.claimId) || byId.has(verdict.claimId)) { unknownVerdicts++; continue; }
    byId.set(verdict.claimId, verdict);
  }
  const outcomes = claims.map(claim => {
    const verdict = byId.get(claim.id);
    if (!verdict || !ASSESSMENTS.includes(verdict.assessment)) {
      missingVerdicts++;
      return { claimId: claim.id, status: 'undetermined', reason: 'aucun verdict rendu', assessment: null, conclusion: '', sources: [], limitations: [] };
    }
    const proposed = Array.isArray(verdict.sources) ? verdict.sources : [], seen = new Set(), sources = [];
    sourcesProposed += proposed.length;
    for (const source of proposed) {
      const url = source && typeof source === 'object' ? sourceKey(source.url) : null;
      if (!url || seen.has(url) || !opened.has(url) || !clip(source.title, 300) || !clip(source.evidence, 600)) continue;
      seen.add(url);
      if (sources.length < 3) sources.push({ url, title: clip(source.title, 300), publisher: clip(source.publisher, 120), publishedAt: clip(source.publishedAt, 40) || null,
        evidence: clip(source.evidence, 600), relation: ['supports', 'contradicts', 'context'].includes(source.relation) ? source.relation : 'context' });
    }
    const conclusion = clip(verdict.conclusion, 600), positive = verdict.assessment !== 'insufficient';
    const limitations = (Array.isArray(verdict.limitations) ? verdict.limitations : []).map(x => clip(x, 300)).filter(Boolean).slice(0, 4);
    if (positive && webSearches > 0 && sources.length) {
      sourcesAccepted += sources.length;
      return { claimId: claim.id, status: 'sourced', reason: null, assessment: verdict.assessment, conclusion, sources, limitations };
    }
    // The model called it sourced, the audit of opened pages did not: its prose cannot be trusted either.
    if (positive) demoted++;
    return { claimId: claim.id, status: 'undetermined', reason: positive ? 'sources non confirmées' : 'preuves insuffisantes', assessment: verdict.assessment, conclusion, sources: [], limitations };
  });
  return { outcomes, webSearches, unknownVerdicts, missingVerdicts, sourcesProposed, sourcesAccepted, demoted };
}

// A title is written with its capital and stands before a name ("M. Dupont"); "m." after a figure is a unit that
// ends a sentence. The few lowercase abbreviations hold only while the sentence visibly goes on.
const TITLES = new Set(['M', 'MM', 'Mme', 'Mmes', 'Mlle', 'Mlles', 'Dr', 'Pr', 'Me', 'St', 'Ste']), CONTINUED = new Set(['cf', 'env', 'vs', 'etc']);
const UPPER = /\p{Lu}/u, MID_SENTENCE = /[,;:)\]-]/;
/**
 * Sentence split on closing punctuation and on line breaks. It errs towards counting one sentence too many,
 * never one too few: the bound it serves must not let a fourth sentence through. Not a boundary: a dot between
 * two digits, after a title before a name, after cf./env./vs./etc. when no capital follows, inside initials.
 */
function sentences(text) {
  const out = [];
  for (const line of String(text ?? '').split(/[\r\n]+/)) {
    const clean = tidy(line);
    let start = 0;
    for (let i = 0; i < clean.length; i++) {
      if (!'.!?…'.includes(clean[i])) continue;
      let end = i + 1;
      while (end < clean.length && '.!?…»”"’)'.includes(clean[end])) end++;
      const glued = end < clean.length && clean[end] !== ' ', next = clean[glued ? end : end + 1] || '';
      if (clean[i] === '.' && end === i + 1) {
        const before = clean[i - 1] || '', word = clean.slice(start, i).split(' ').pop();
        if (/\d/.test(before) && /\d/.test(clean[i + 1] || '')) continue;
        if (!glued && TITLES.has(word) && UPPER.test(next)) continue;
        if (!glued && CONTINUED.has(word.toLowerCase()) && next && !UPPER.test(next)) continue;
        // No space after the dot: a missing space before a capital still ends a sentence, initials and domains do not.
        if (glued && !(UPPER.test(next) && !UPPER.test(before))) continue;
      } else if (glued && MID_SENTENCE.test(next)) continue;
      out.push(clean.slice(start, end).trim());
      start = end; i = end - 1;
    }
    const rest = clean.slice(start).trim();
    if (rest) out.push(rest);
  }
  return out;
}
// With or without a scheme: a bare domain in a card is still an address to type, not a sentence.
const HAS_URL = /(?:https?:\/\/|www\.)\S|(?<![\p{L}\p{N}@])(?:[a-z0-9-]+\.)+(?:fr|com|org|net|eu|info|gouv|gov|edu|int|io|tv|be|ch|ca|uk|de|es|it|lu)(?![\p{L}\p{N}-])/iu;
const HAS_MARKUP = /\*\*|__|`|\]\(|<\/?[a-z][^>]*>|^\s{0,3}(?:#{1,6}\s|[-*•]\s|\d+[.)]\s)/m;
// A card says what the sources show, never whether the speaker is right: a text that rules "vrai", "faux",
// "c’est exact", "fake" or "il a raison" is not shown. Matched on folded text, except the last pattern, which
// must tell the auxiliary of "il a raison" from the preposition of "à raison de".
const VERDICT = /\b(?:vrai|vraie|vrais|vraies|faux|fausse|fausses|fake|true|false|intox|infox|mensonge|mensonges|mensonger|mensongere|mensongers|mensongeres)\b|\b(?:est|sont|etait|etaient|serait|seraient|semble|semblent|reste|restent|avere|averent)\s+(?:[a-z]+\s+){0,3}?(?:exact|exacte|exacts|exactes|inexact|inexacte|inexacts|inexactes|correct|correcte|corrects|correctes|incorrect|incorrecte|incorrects|incorrectes|errone|erronee|errones|erronees)\b/;
const SIDES = /(?<![\p{L}])(?:a|ont|avait|avaient|aurait|auraient)\s+(?:(?:pas|bien|donc|eu|tout|à|fait)\s+){0,3}(?:raison|tort)(?![\p{L}])/u;
const hasVerdict = text => VERDICT.test(plain(text)) || SIDES.test(String(text ?? '').toLowerCase());
/** Technical bound of the "two or three sentences": 1 to 3 sentences, 420 characters, no URL, no Markdown, no binary verdict. */
function acceptableText(text) {
  if (typeof text !== 'string' || HAS_URL.test(text) || HAS_MARKUP.test(text) || hasVerdict(text)) return false;
  const clean = tidy(text), count = sentences(text).length;
  return clean.length > 0 && clean.length <= TEXT_LIMITS.chars && count >= 1 && count <= TEXT_LIMITS.sentences;
}
// One sentence per item, three at most, the whole within the character bound.
function boundedSentences(items) {
  const parts = [];
  for (const item of items) {
    if (parts.length === TEXT_LIMITS.sentences) break;
    const first = sentences(tidy(String(item ?? '').replace(/https?:\/\/\S+/gi, '').replace(/[*_`#]/g, '')))[0];
    if (first) parts.push(/[.!?…»”]$/.test(first) ? first : first + '.');
  }
  const budget = Math.floor((TEXT_LIMITS.chars - (parts.length - 1)) / (parts.length || 1));
  return parts.map(part => (part.length <= budget ? part : part.slice(0, budget - 1).replace(/\s+\S*$/, '') + '…')).join(' ');
}
/**
 * Text of a grouped result. The model summary is kept only inside the technical bound and only when
 * no claim it presented as sourced was demoted; otherwise the conclusions of the sourced claims are
 * used, one sentence each. A conclusion that rules true or false, or that carries an address, is left
 * out as well: the card then points to its sources instead of repeating a verdict.
 */
function composeLotText({ summary, conclusions = [], demoted = 0 } = {}) {
  if (!demoted && acceptableText(summary)) return tidy(summary);
  // Only the first sentence of a conclusion is shown, so only that one is judged.
  const shown = conclusions.map(text => sentences(tidy(text))[0] || '').filter(text => !HAS_URL.test(text) && !hasVerdict(text));
  return boundedSentences(shown) || 'Des sources ont été consultées ; le détail figure dans les sources de ce résultat.';
}
function composeSignalText(statements) {
  if (statements.length <= TEXT_LIMITS.sentences) return boundedSentences(statements);
  const rest = statements.length - 2;
  return boundedSentences([...statements.slice(0, 2), `${rest} autres éléments repérés figurent dans l’historique`]);
}

// Races a port call against its own cancellation: an adapter that ignores the signal cannot hold the module.
function raced(controller, call) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(controller.signal.reason || new Error('Opération annulée.'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    let work;
    try { work = Promise.resolve(call(controller.signal)); } catch (error) { work = Promise.reject(error); }
    work.then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', onAbort));
  });
}

class Surveillance {
  /** @param {{detector:ClaimDetectionPort,researcher:ClaimResearchPort,now?:()=>number,onChange?:Function,limits?:object,probe?:()=>{chatBusy:boolean}}} dependencies */
  constructor({ detector, researcher, now = Date.now, onChange = () => {}, limits = {}, probe } = {}) {
    Object.assign(this, { detector, researcher, now, onChange, probe });
    this.limits = resolveLimits(limits);
    this.generation = 0; this.detecting = null; this.running = new Map();
    this.clear();
    // No emission while the host is still wiring itself: the first state is known, not announced.
    this.emitted = this.key(this.snapshot());
  }
  clear() {
    Object.assign(this, { enabled: false, sessionId: null, activation: null, activationSeq: 0, claimSeq: 0, lotSeq: 0, overlaySeq: 0, signalSeq: 0,
      elapsedMs: 0, stoppedWithPending: 0, holdDetectionUntil: 0, lastDetectionAt: -Infinity, detectStreak: 0, detectFailure: null, error: null, restored: false });
    this.passages = new Map(); this.claims = []; this.lots = []; this.index = new Map(); this.keys = new Map(); this.mentioned = new Map();
    this.metrics = freshMetrics(typeof this.probe === 'function');
  }
  /** Back to idle with an empty registry (session ended or replaced). Anything in flight is abandoned. */
  reset() {
    this.halt(new Error('Surveillance réinitialisée.'));
    this.clear(); this.emit();
    return this.snapshot();
  }
  // Abandons calls in flight; the generation makes their late results inert.
  halt(error) {
    this.generation++;
    const detecting = this.detecting, runs = [...this.running.values()];
    this.detecting = null; this.running = new Map();
    detecting?.controller.abort(error);
    for (const run of runs) run.controller?.abort(error);
    return { detecting, runs };
  }
  chatBusy() { try { return Boolean(this.probe?.()?.chatBusy); } catch { return false; } }
  fail(error) { this.error = clip(error?.message, 200) || 'Erreur interne de surveillance.'; }

  /** Activation: t0 is the session position of the snapshot. Nothing that started before it is ever read. */
  start({ instruction } = {}, snapshot) {
    if (!snapshot || typeof snapshot.id !== 'string' || !snapshot.id || !Number.isFinite(snapshot.elapsedMs) || snapshot.elapsedMs < 0) throw new Error('Démarre une session avant d’activer la surveillance.');
    if (typeof instruction !== 'string' || !instruction.trim() || instruction.trim().length > 1500) throw new Error('Écris une consigne de surveillance de 1 à 1 500 caractères.');
    if (this.enabled) this.stop('Consigne remplacée.');
    // The registry belongs to one session: it is kept across activations, never across sessions.
    if (this.sessionId !== snapshot.id) { this.clear(); this.sessionId = snapshot.id; }
    this.generation++;
    this.activation = { id: `act-${++this.activationSeq}`, instruction: instruction.trim(), t0Ms: snapshot.elapsedMs, startedAt: this.now(), stoppedAt: null, stopReason: null };
    Object.assign(this, { enabled: true, restored: false, stoppedWithPending: 0, holdDetectionUntil: 0, detectStreak: 0, detectFailure: null, error: null, elapsedMs: snapshot.elapsedMs });
    // The cursor follows the activation: a new instruction reads from its own t0.
    this.passages = new Map();
    this.observe(snapshot);
    this.emit();
    return this.snapshot();
  }

  /** Idempotent. Non-terminal claims become cancelled with the reason; unread passages stay counted. */
  stop(reason = 'Surveillance arrêtée.') {
    if (!this.enabled) return this.snapshot();
    const why = clip(reason, 200) || 'Surveillance arrêtée.', now = this.now();
    this.enabled = false;
    const { detecting, runs } = this.halt(new Error(why));
    detecting?.batch.forEach((entry, i) => { entry.bucket = detecting.previous[i]; });
    for (const run of runs) Object.assign(run.lot, { status: 'cancelled', error: why, message: null, finishedAt: now });
    for (const claim of this.claims) if (!TERMINAL.has(claim.status)) { Object.assign(claim, { status: 'cancelled', reason: why, finishedAt: now }); this.metrics.verify.cancelled++; }
    Object.assign(this.activation, { stoppedAt: now, stopReason: why });
    this.stoppedWithPending = [...this.passages.values()].filter(e => ['waiting', 'pending', 'rescan'].includes(e.bucket)).length;
    this.emit();
    return this.snapshot();
  }

  /** Called on every session change. Registers and re-reads the passages that start after t0. Never throws. */
  observe(snapshot) {
    try {
      if (!this.enabled || !snapshot || snapshot.id !== this.sessionId) return;
      if (Number.isFinite(snapshot.elapsedMs)) this.elapsedMs = snapshot.elapsedMs;
      const t0 = this.activation.t0Ms, now = this.now(), busy = value => value === 'queued' || value === 'analyzing';
      for (const list of [snapshot.history, snapshot.segments]) for (const passage of Array.isArray(list) ? list : []) {
        // A passage straddling t0 is excluded: at most one segment of blind zone after the activation.
        if (!passage || typeof passage.id !== 'string' || !(passage.startMs >= t0) || !(passage.endMs > passage.startMs)) continue;
        let entry = this.passages.get(passage.id);
        // Settled for good: nothing can move it any more, so a long session costs nothing per old passage.
        if (entry?.final) continue;
        if (!entry) this.passages.set(passage.id, entry = { id: passage.id, startMs: passage.startMs, endMs: passage.endMs, bucket: 'waiting', mode: null, reason: null, error: null,
          attempts: 0, overflow: 0, rescanned: false, counted: false, final: false, seenAt: now, speechAt: null, readableAt: null, scannedAt: null, failedAt: null, scannedKey: null, fields: null,
          // alone: to be read in a call of its own; split: it was; revived: its one automatic reading after an outage is spent.
          alone: false, split: false, revived: false, truncated: 0, rescanError: null, rejected: freshRejected(), rejects: [] });
        const observation = passage.observation && typeof passage.observation === 'object' ? passage.observation : {};
        // Passage-own fields only. topicSummary is cumulative and may reach back before t0: never read here.
        entry.fields = Object.fromEntries(Object.entries(FIELD_CAPS).map(([field, max]) => [field, clip(observation[field], max)]));
        entry.status = passage.status;
        entry.stable = !busy(passage.status) && !busy(passage.visionStatus) && passage.audioStatus !== 'analyzing';
        this.classify(entry, now);
      }
      this.pump(); this.emit();
    } catch (error) { this.fail(error); }
  }

  // Readable = settled, or words published for at least the grace period: vision completes later without blocking.
  classify(entry, now) {
    const { limits } = this, fields = entry.fields;
    if (entry.bucket === 'scanned') {
      if (entry.mode === 'full' || entry.rescanned) entry.final = true;
      else if (entry.stable) {
        // Read on its words while vision was still pending. If the description arrived since: one second reading, only one.
        if (JSON.stringify([fields.transcript, fields.summary, fields.visual]) !== entry.scannedKey) Object.assign(entry, { bucket: 'rescan', readableAt: now });
        else entry.final = true;
      }
      return;
    }
    if (!['waiting', 'empty', 'unscannable'].includes(entry.bucket)) return;
    const text = plain(`${fields.transcript} ${fields.summary} ${fields.visual}`);
    if (fields.transcript && entry.speechAt === null) entry.speechAt = now;
    const terminal = ['error', 'skipped', 'expired'].includes(entry.status);
    const eligible = entry.stable || (entry.speechAt !== null && now - entry.speechAt >= limits.visionGraceMs);
    if (terminal && !text) Object.assign(entry, { bucket: 'unscannable', reason: { error: 'Analyse du passage en erreur.', skipped: 'Analyse du passage sautée.', expired: 'Média expiré avant analyse.' }[entry.status] });
    else if (!eligible) Object.assign(entry, { bucket: 'waiting', reason: null });
    else if (text.length < limits.minTextChars) {
      // Counted without a model call: silence is covered, not skipped.
      if (!entry.counted) { entry.counted = true; this.metrics.detect.emptySkipped++; }
      Object.assign(entry, { bucket: 'empty', reason: null });
    } else Object.assign(entry, { bucket: 'pending', reason: null, readableAt: now });
    // A settled passage without usable text will not get any later.
    entry.final = entry.stable && (entry.bucket === 'empty' || entry.bucket === 'unscannable');
  }
  reclassify() { const now = this.now(); for (const entry of this.passages.values()) this.classify(entry, now); }

  /** Every second: grace periods, deadlines, retries, lateness. Never throws. */
  tick() {
    try {
      if (!this.enabled) return;
      const now = this.now(), { limits } = this;
      this.reclassify();
      if (this.detecting && now - this.detecting.startedAt >= limits.detectTimeoutMs) this.detecting.controller.abort(deadline('La lecture des passages a dépassé le délai.'));
      for (const run of [...this.running.values()]) {
        if (run.controller) { if (now - run.startedAt >= limits.verifyTimeoutMs) run.controller.abort(deadline('La vérification a dépassé le délai.')); }
        else if (now >= run.retryAt) this.attempt(run.lot);
      }
      this.pump(); this.emit();
    } catch (error) { this.fail(error); }
  }

  /** A claim in error or cancelled goes back to the queue; a passage whose detection failed is read again. */
  retry(id) {
    if (!this.enabled) throw new Error('Active la surveillance avant de relancer.');
    const entry = this.passages.get(id), claim = this.index.get(id), now = this.now();
    if (entry) {
      if (entry.bucket !== 'failed') throw new Error('Ce passage n’est pas en échec.');
      Object.assign(entry, { bucket: 'pending', attempts: 0, error: null, failedAt: null, readableAt: now });
      this.holdDetectionUntil = 0;
    } else if (claim && claim.action === 'verify' && ['error', 'cancelled'].includes(claim.status)) {
      Object.assign(claim, { status: 'detected', reason: null, error: null, since: now, queuedAt: null, startedAt: null, finishedAt: null, lotId: null });
    } else throw new Error('Cet élément ne peut pas être relancé.');
    this.pump(); this.emit();
    return this.snapshot();
  }

  /**
   * Reopened archive: the saved registry is shown read-only. Whatever was still moving is cancelled,
   * nothing is relaunched; only an explicit start() on the same session resumes numbering.
   */
  restore(saved) {
    this.halt(new Error('Archive rouverte.'));
    this.clear();
    if (saved && typeof saved === 'object' && saved.version === 1 && typeof saved.sessionId === 'string') {
      const reason = 'Interrompue par la fermeture.', number = id => Number(String(id).split('-').pop()) || 0;
      const at = Number.isFinite(saved.activation?.stoppedAt) ? saved.activation.stoppedAt : Number.isFinite(saved.savedAt) ? saved.savedAt : this.now();
      this.sessionId = saved.sessionId; this.restored = true;
      if (saved.activation && typeof saved.activation === 'object') this.activation = { ...saved.activation, stoppedAt: at, stopReason: saved.activation.stopReason || reason };
      for (const item of Array.isArray(saved.claims) ? saved.claims : []) {
        if (!item || !/^claim-\d+$/.test(item.id) || !CLAIM_STATES.includes(item.status) || this.index.has(item.id)) continue;
        const { late, sourceCount, ...rest } = item;
        const claim = { activationId: null, action: 'verify', kind: 'other', statement: '', checkable: true, reason: null, note: '', context: '', contextPassageIds: [], mentionCount: 1,
          detectedAt: at, since: at, queuedAt: null, startedAt: null, finishedAt: null, lotId: null, error: null, assessment: null, conclusion: '', ...rest,
          origin: { ...item.origin }, mentions: [...(item.mentions || [])], sources: [...(item.sources || [])], limitations: [...(item.limitations || [])] };
        if (!TERMINAL.has(claim.status)) Object.assign(claim, { status: 'cancelled', reason, finishedAt: at });
        this.adopt(claim);
        for (const mention of claim.mentions) this.mentioned.get(claim.id).add(mention.passageId);
      }
      for (const item of Array.isArray(saved.lots) ? saved.lots : []) {
        if (!item || !/^lot-\d+$/.test(item.id)) continue;
        const lot = { kind: 'verification', activationId: null, status: 'cancelled', overlay: false, seq: null, text: '', publishedAtMs: null, error: null, message: null, ...item,
          claimIds: [...(item.claimIds || [])], sourcedClaimIds: [...(item.sourcedClaimIds || [])], undeterminedClaimIds: [...(item.undeterminedClaimIds || [])], sources: (item.sources || []).map(s => ({ ...s, claimIds: [...(s.claimIds || [])] })),
          origin: [...(item.origin || [])], uncertainties: [...(item.uncertainties || [])], metrics: { ...item.metrics } };
        // A signal never carries an assessment, restored or not.
        if (lot.kind === 'signal') delete lot.assessments; else lot.assessments = [...(item.assessments || [])];
        this.lots.push(['done', 'error', 'cancelled'].includes(lot.status) ? lot : Object.assign(lot, { status: 'cancelled', error: reason, message: null, finishedAt: at }));
      }
      for (const item of Array.isArray(saved.passages) ? saved.passages : []) {
        if (!item || typeof item.id !== 'string' || !COVERAGE_BUCKETS.includes(item.bucket)) continue;
        // A registry saved before these notes existed is read as having none.
        this.passages.set(item.id, { overflow: 0, alone: false, split: false, revived: false, truncated: 0, rescanError: null, ...item, bucket: item.bucket === 'scanning' ? 'pending' : item.bucket,
          rejected: { ...freshRejected(), ...item.rejected }, rejects: (Array.isArray(item.rejects) ? item.rejects : []).map(reject => ({ ...reject })),
          fields: { transcript: '', summary: '', visual: '', uncertainty: '' }, stable: true });
      }
      const sequences = saved.sequences || {}, top = (list, floor) => Math.max(Number.isInteger(floor) ? floor : 0, ...list.map(x => number(x.id)));
      this.claimSeq = top(this.claims, sequences.claim); this.lotSeq = top(this.lots, sequences.lot);
      this.activationSeq = Math.max(Number.isInteger(sequences.activation) ? sequences.activation : 0, number(this.activation?.id));
      this.overlaySeq = Math.max(Number.isInteger(sequences.overlay) ? sequences.overlay : 0, ...this.lots.map(l => l.seq || 0));
      this.signalSeq = Math.max(Number.isInteger(sequences.signal) ? sequences.signal : 0, ...this.lots.map(l => l.signalSeq || 0));
      this.stoppedWithPending = [...this.passages.values()].filter(e => ['waiting', 'pending', 'rescan'].includes(e.bucket)).length;
      if (Number.isFinite(saved.elapsedMs)) this.elapsedMs = saved.elapsedMs;
      if (saved.metrics?.detect && saved.metrics?.verify) this.metrics = { ...this.metrics, detect: { ...this.metrics.detect, ...saved.metrics.detect }, verify: { ...this.metrics.verify, ...saved.metrics.verify } };
    }
    this.emit();
    return this.snapshot();
  }
  adopt(claim) { this.claims.push(claim); this.index.set(claim.id, claim); this.keys.set(claim.id, claimKey(claim.statement)); this.mentioned.set(claim.id, new Set([claim.origin?.passageId])); }

  // ---- Scheduling ----------------------------------------------------------------------------
  pump() {
    if (!this.enabled) return;
    this.admit(); this.pumpLots(); this.admit(); this.pumpDetection();
  }
  // detected → queued, first in first out, never beyond the bounded queue.
  admit() {
    const now = this.now();
    let queued = this.claims.filter(c => c.status === 'queued').length;
    for (const claim of this.claims) {
      if (queued >= this.limits.maxQueuedClaims) break;
      if (claim.status === 'detected') { Object.assign(claim, { status: 'queued', queuedAt: now }); queued++; }
    }
  }
  pumpLots() {
    while (this.running.size < this.limits.verifyConcurrency) {
      const batch = this.claims.filter(c => c.status === 'queued').slice(0, this.limits.verifyBatchClaims);
      if (!batch.length) break;
      this.startLot(batch);
    }
  }
  // Back-pressure: with too many claims waiting, reading pauses and passages stay pending. Nothing is lost.
  detectionPaused() {
    return this.claims.length >= this.limits.maxClaims || this.claims.filter(c => c.status === 'detected').length >= this.limits.maxDetectedBacklog;
  }
  pumpDetection() {
    const now = this.now(), { limits, metrics } = this;
    if (this.detecting || now < this.holdDetectionUntil || now - this.lastDetectionAt < limits.detectIntervalMs || this.detectionPaused()) return;
    const entries = [...this.passages.values()];
    // Oldest first, in video order: one passage per call in steady state, a bounded batch when catching up.
    const readable = entries.filter(e => e.bucket === 'pending' || e.bucket === 'rescan').sort((a, b) => a.startMs - b.startMs);
    // A passage sent back by a grouped reading goes in a call of its own; a batch stops before the next such passage.
    const lone = readable.findIndex(e => e.alone), batch = readable.slice(0, lone === 0 ? 1 : Math.min(limits.detectBatchPassages, lone < 0 ? readable.length : lone));
    if (!batch.length) return;
    const view = e => ({ id: e.id, startMs: e.startMs, endMs: e.endMs, ...e.fields });
    const last = batch.at(-1), scope = this.activation.id;
    const request = {
      sessionId: this.sessionId, instruction: this.activation.instruction, passages: batch.map(view),
      // Already-read passages that END before the batch starts: context, never a source of claims.
      context: !limits.contextPassages ? [] : entries.filter(e => ['scanned', 'rescan'].includes(e.bucket) && e.endMs <= batch[0].startMs).sort((a, b) => a.startMs - b.startMs).slice(-limits.contextPassages).map(view),
      known: this.claims.filter(c => c.activationId === scope && c.origin.endMs <= last.endMs).slice(-KNOWN_CLAIMS).map(c => ({ id: c.id, statement: c.statement })),
      // The real bound of one answer: the detector is told the number the validation applies.
      maxClaims: limits.maxClaimsPerBatch,
    };
    const controller = new AbortController();
    const active = { controller, generation: this.generation, startedAt: now, batch, passages: request.passages, previous: batch.map(e => e.bucket),
      modes: batch.map(e => (e.stable ? 'full' : 'text')), keys: batch.map(e => JSON.stringify([e.fields.transcript, e.fields.summary, e.fields.visual])) };
    for (const entry of batch) { record(metrics.detect.passageWaitMs, now - (entry.readableAt ?? now)); entry.bucket = 'scanning'; }
    this.detecting = active; this.lastDetectionAt = now; metrics.detect.calls++;
    if (metrics.overlap && this.chatBusy()) metrics.overlap.detectsDuringChat++;
    raced(controller, signal => this.detector.detect({ ...request, signal })).then(result => this.settleDetection(active, result), error => this.settleDetection(active, null, error))
      .catch(error => this.fail(error));
  }
  settleDetection(active, result, error) {
    // A result that arrives after a stop or a restart belongs to nobody.
    if (this.detecting !== active || active.generation !== this.generation) return;
    this.detecting = null;
    const now = this.now(), { limits, metrics } = this;
    record(metrics.detect.runMs, now - active.startedAt);
    let checked = null;
    if (!error) try { checked = validateDetection(result, active.passages, limits); } catch (invalid) { error = invalid; }
    if (error) {
      const message = clip(error.message, 200) || 'Lecture des passages impossible.';
      metrics.detect.failures++; if (error.timeout) metrics.detect.timeouts++;
      // Kept until a reading succeeds: an outage must show as one, not as a programme where nothing is said.
      this.detectStreak++; this.detectFailure = message;
      active.batch.forEach((entry, i) => {
        const spent = ++entry.attempts > limits.detectRetries;
        // Its words were already read: a failed second reading never turns it back into an unread passage.
        if (active.previous[i] === 'rescan') {
          Object.assign(entry, spent ? { bucket: 'scanned', rescanned: true, alone: false, attempts: 0, rescanError: message } : { bucket: 'rescan' });
          if (spent) entry.reason = remark(entry);
        } else Object.assign(entry, spent ? { bucket: 'failed', error: message, failedAt: now } : { bucket: 'pending' });
      });
      // A provider that fails at once is not hammered: the retry waits for a later tick.
      this.holdDetectionUntil = now + limits.retryDelayMs;
    } else {
      this.detectStreak = 0;
      metrics.detect.claimsRaw += checked.raw;
      for (const [cause, count] of Object.entries(checked.rejected)) metrics.detect.rejected[cause] += count;
      const single = active.batch.length === 1, atBound = checked.raw >= limits.maxClaimsPerBatch;
      if (atBound) metrics.detect.readingsAtBound++;
      // What validation dropped is written on its passage, never only in a session-wide counter. An element that
      // names no passage of the call belongs to the passage read alone; in a grouped reading nobody can place it.
      for (const { passageId, cause, statement, quote } of checked.rejects) {
        const entry = passageId ? this.passages.get(passageId) : single ? active.batch[0] : null;
        if (!entry) continue;
        if (cause === 'overflow') entry.overflow++; else entry.rejected[cause]++;
        if (entry.rejects.length < MAX_REJECTS) entry.rejects.push({ cause, statement, quote, at: now });
      }
      // An answer as long as one answer may be is possibly cut short, and an element nobody can place may come
      // from any passage of the call: several passages read together are then not marked read. Each is read
      // again alone, so a catch-up batch can never hide a claim behind the bound of one answer.
      const oneByOne = !single && (atBound || checked.rejects.some(reject => !reject.passageId));
      const signals = [];
      for (const item of checked.accepted) {
        const claim = this.register(item, this.passages.get(item.passageId), active.passages.find(p => p.id === item.passageId), now);
        if (claim?.status === 'noted') signals.push(claim);
      }
      active.batch.forEach((entry, i) => {
        const again = active.previous[i] === 'rescan';
        if (oneByOne) { Object.assign(entry, { bucket: again ? 'rescan' : 'pending', alone: true, attempts: 0, error: null, readableAt: now }); metrics.detect.passagesReread++; }
        else {
          // Read alone and still as long as an answer may be: nothing smaller can be asked, so the passage says it.
          Object.assign(entry, { bucket: 'scanned', mode: again ? 'full' : active.modes[i], rescanned: entry.rescanned || again, scannedKey: active.keys[i], scannedAt: now, attempts: 0, error: null,
            truncated: atBound ? checked.raw : 0, split: entry.split || entry.alone, alone: false });
          if (again) metrics.detect.rescans++; else metrics.detect.passagesScanned++;
        }
        entry.reason = remark(entry);
      });
      if (signals.length) this.signalLot(signals, now);
      // Reading works again: every passage given up while it did not gets one more reading, once, in video order
      // and under the same back-pressure as any pending passage. What fails again stays failed, and counted.
      for (const entry of this.passages.values()) if (entry.bucket === 'failed' && !entry.revived) {
        Object.assign(entry, { bucket: 'pending', revived: true, attempts: limits.detectRetries, error: null, failedAt: null, readableAt: now });
        metrics.detect.passagesRevived++;
      }
    }
    this.reclassify(); this.pump(); this.emit();
  }

  // ---- Registry ------------------------------------------------------------------------------
  // Returns the claim only when it is new. A repetition adds a mention; it is never discarded.
  register(item, entry, read, now) {
    const { metrics } = this, scope = this.claims.filter(c => c.activationId === this.activation.id), key = claimKey(item.statement);
    let existing = null;
    if (item.sameAs) {
      // A paraphrase is a duplicate only on the detector's explicit word, and only for a known claim with the same
      // numbers that is not the same sentence with one word changed.
      const proposed = scope.find(c => c.id === item.sameAs), known = proposed && this.keys.get(proposed.id);
      if (proposed && sameNumbers(key, known) && !oneWordApart(key, known)) existing = proposed; else metrics.detect.sameAsRejected++;
    }
    // Without that word, only an all but identical statement is a repetition: in doubt, a new claim.
    existing ||= scope.find(c => sameClaim(key, this.keys.get(c.id)));
    if (existing) {
      metrics.detect.duplicates++;
      const seen = this.mentioned.get(existing.id);
      // The same passage read twice (second reading with vision) is not a repetition in the programme.
      if (!seen.has(entry.id)) {
        seen.add(entry.id); existing.mentionCount++;
        // The mention keeps its own wording: what was merged stays readable in the history.
        if (existing.mentions.length < MAX_MENTIONS) existing.mentions.push({ passageId: entry.id, startMs: entry.startMs, endMs: entry.endMs, quote: item.quote, statement: item.statement, at: now });
      }
      return null;
    }
    // Frozen at detection: the passage and the ones that END before it starts. Verification receives nothing else.
    const before = !this.limits.contextPassages ? [] : [...this.passages.values()].filter(e => e.endMs <= entry.startMs && plain(`${e.fields.transcript} ${e.fields.summary} ${e.fields.visual}`))
      .sort((a, b) => a.startMs - b.startMs).slice(-this.limits.contextPassages);
    const line = (e, fields) => `[${stamp(e.startMs)}–${stamp(e.endMs)}] ${[fields.transcript, fields.visual, fields.summary].filter(Boolean).join(' / ')}`;
    const claim = { id: `claim-${++this.claimSeq}`, activationId: this.activation.id, action: item.action, kind: item.kind, statement: item.statement, checkable: item.checkable,
      status: 'detected', reason: null, note: item.reason,
      origin: { passageId: entry.id, startMs: entry.startMs, endMs: entry.endMs, quote: item.quote, field: item.field },
      // `read` is the text the detector was given for this passage, not a later revision of it.
      context: [...before.map(e => line(e, e.fields)), line(entry, read)].join('\n').slice(-CONTEXT_CHARS), contextPassageIds: [...before.map(e => e.id), entry.id],
      mentions: [{ passageId: entry.id, startMs: entry.startMs, endMs: entry.endMs, quote: item.quote, statement: item.statement, at: now }], mentionCount: 1,
      detectedAt: now, since: now, queuedAt: null, startedAt: null, finishedAt: null, lotId: null, error: null, assessment: null, conclusion: '', sources: [], limitations: [] };
    if (item.action === 'signal') { Object.assign(claim, { status: 'noted', finishedAt: now }); metrics.detect.signals++; }
    else if (!item.checkable) Object.assign(claim, { status: 'undetermined', reason: 'non vérifiable', finishedAt: now });
    this.adopt(claim); metrics.detect.claimsAccepted++;
    return claim;
  }
  // The signals of one detection call form one lot: a video observation with its interval, no web source, no verdict.
  signalLot(claims, now) {
    const lot = { id: `lot-${++this.lotSeq}`, kind: 'signal', activationId: this.activation.id, status: 'done', claimIds: claims.map(c => c.id), sourcedClaimIds: [], undeterminedClaimIds: [],
      overlay: false, seq: null, signalSeq: ++this.signalSeq, text: composeSignalText(claims.map(c => c.statement)), sources: [],
      origin: claims.map(c => ({ claimId: c.id, passageId: c.origin.passageId, startMs: c.origin.startMs, endMs: c.origin.endMs, quote: c.origin.quote })),
      uncertainties: claims.some(c => c.origin.field === 'transcript') ? [TRANSCRIPT_NOTICE] : [],
      createdAt: now, startedAt: now, finishedAt: now, publishedAtMs: this.elapsedMs, attempts: 0, error: null, message: null, metrics: { waitMs: 0, runMs: 0, webSearches: 0 } };
    for (const claim of claims) claim.lotId = lot.id;
    this.lots.push(lot);
  }

  // ---- Verification lots ---------------------------------------------------------------------
  startLot(claims) {
    const now = this.now(), { metrics } = this;
    const lot = { id: `lot-${++this.lotSeq}`, kind: 'verification', activationId: this.activation.id, status: 'running', claimIds: claims.map(c => c.id), sourcedClaimIds: [], undeterminedClaimIds: [],
      overlay: false, seq: null, text: '', sources: [], origin: [], assessments: [], uncertainties: [], createdAt: now, startedAt: now, finishedAt: null, publishedAtMs: null,
      attempts: 0, error: null, message: null, metrics: { waitMs: now - Math.min(...claims.map(c => c.since)), runMs: null, webSearches: 0 } };
    for (const claim of claims) { Object.assign(claim, { status: 'running', startedAt: now, lotId: lot.id, error: null }); record(metrics.verify.waitMs, now - claim.since); }
    this.lots.push(lot); metrics.verify.lots++; metrics.verify.claims += claims.length;
    if (metrics.overlap && this.chatBusy()) metrics.overlap.lotsStartedDuringChat++;
    this.attempt(lot);
  }
  attempt(lot) {
    const controller = new AbortController(), run = { lot, controller, generation: this.generation, startedAt: this.now(), retryAt: null };
    this.running.set(lot.id, run); lot.attempts++;
    const claims = lot.claimIds.map(id => this.index.get(id)).map(c => ({ id: c.id, statement: c.statement, quote: c.origin.quote, kind: c.kind, startMs: c.origin.startMs, endMs: c.origin.endMs, context: c.context }));
    const onProgress = event => {
      if (this.running.get(lot.id) !== run || typeof event?.message !== 'string') return;
      lot.message = clip(event.message, 120); this.emit();
    };
    raced(controller, signal => this.researcher.verify({ sessionId: this.sessionId, instruction: this.activation.instruction, claims, signal, onProgress }))
      .then(result => this.settleLot(run, result), error => this.settleLot(run, null, error)).catch(error => this.fail(error));
  }
  settleLot(run, result, error) {
    const { lot } = run, { limits, metrics } = this;
    if (this.running.get(lot.id) !== run || run.generation !== this.generation) return;
    const now = this.now(), claims = lot.claimIds.map(id => this.index.get(id));
    let applied = null;
    if (!error) try { applied = applyVerdicts(claims, result); } catch (invalid) { error = invalid; }
    if (error) {
      const message = clip(error.message, 200) || 'Vérification impossible.';
      if (error.timeout) metrics.verify.timeouts++;
      if (lot.attempts <= limits.verifyRetries) {
        // The lot keeps its place and its claims: one more attempt, after a short pause.
        metrics.verify.retries++;
        Object.assign(run, { controller: null, retryAt: now + limits.retryDelayMs });
        Object.assign(lot, { error: message, message: 'Nouvelle tentative…' });
        this.emit();
        return;
      }
      this.running.delete(lot.id);
      Object.assign(lot, { status: 'error', error: message, message: null, finishedAt: now, metrics: { ...lot.metrics, runMs: now - lot.startedAt } });
      for (const claim of claims) Object.assign(claim, { status: 'error', error: message, finishedAt: now });
      metrics.verify.lotsFailed++; metrics.verify.errors += claims.length;
    } else {
      this.running.delete(lot.id);
      const sourced = [];
      for (const outcome of applied.outcomes) {
        const claim = this.index.get(outcome.claimId);
        Object.assign(claim, { status: outcome.status, reason: outcome.reason, assessment: outcome.assessment, conclusion: outcome.conclusion, sources: outcome.sources, limitations: outcome.limitations, finishedAt: now, error: null });
        record(metrics.verify.claimToResultMs, now - claim.since); record(metrics.verify.videoLagMs, this.elapsedMs - claim.origin.endMs);
        if (outcome.status === 'sourced') sourced.push(claim);
      }
      // The card holds the sourced claims only; the others stay in the registry with their video origin.
      const sources = new Map();
      for (const claim of sourced) for (const source of claim.sources) {
        if (!sources.has(source.url)) sources.set(source.url, { ...source, claimIds: [] });
        sources.get(source.url).claimIds.push(claim.id);
      }
      const uncertainties = [...new Set(sourced.flatMap(c => c.limitations))].slice(0, 4);
      if (sourced.some(c => c.origin.field === 'transcript')) uncertainties.push(TRANSCRIPT_NOTICE);
      const open = claims.length - sourced.length;
      const text = sourced.length ? composeLotText({ summary: result.summary, conclusions: sourced.map(c => c.conclusion), demoted: applied.demoted })
        : `Aucune source consultée ne permet de conclure : ${plural(open, 'affirmation reste indéterminée', 'affirmations restent indéterminées')}.`;
      if (sourced.length && text !== tidy(result.summary)) metrics.verify.textFallbacks++;
      Object.assign(lot, { status: 'done', error: null, message: null, finishedAt: now, publishedAtMs: this.elapsedMs, text, overlay: sourced.length > 0,
        sourcedClaimIds: sourced.map(c => c.id), undeterminedClaimIds: claims.filter(c => c.status !== 'sourced').map(c => c.id), sources: [...sources.values()],
        origin: sourced.map(c => ({ claimId: c.id, passageId: c.origin.passageId, startMs: c.origin.startMs, endMs: c.origin.endMs, quote: c.origin.quote })),
        assessments: sourced.map(c => ({ claimId: c.id, assessment: c.assessment, label: ASSESSMENT_LABELS[c.assessment] })), uncertainties,
        metrics: { ...lot.metrics, runMs: now - lot.startedAt, webSearches: applied.webSearches } });
      // Only a lot with a sourced claim becomes a card; the sequence lets a client show what it has not shown yet.
      if (lot.overlay) lot.seq = ++this.overlaySeq;
      metrics.verify.sourced += sourced.length; metrics.verify.undetermined += open; metrics.verify.webSearches += applied.webSearches;
      for (const counter of ['missingVerdicts', 'unknownVerdicts', 'sourcesProposed', 'sourcesAccepted']) metrics.verify[counter] += applied[counter];
      record(metrics.verify.runMs, now - lot.startedAt);
    }
    this.pump(); this.emit();
  }

  // ---- Published state -----------------------------------------------------------------------
  /**
   * Compact polled state. {full:true}: the whole registry, lots and cursor (the saved form).
   * {brief:true}: what a once-per-second poll needs for the discreet activity and the cards, without the lists.
   * Its size does not grow with the session, but nothing caps it in bytes: it holds at most limits.overlayCards
   * cards of each kind, each with its text (420 characters at most), its video origins (one per claim, quote
   * included) and url, title and publisher per source. Evidence, relation, date and uncertainties stay in the
   * lots of the compact and full states. Order of magnitude, measured on synthetic texts of realistic length
   * (five cards of three sources, statements of 200 to 300 characters): about 11 kB.
   */
  snapshot({ full = false, brief = false } = {}) {
    const now = this.now(), { limits } = this;
    const coverage = Object.fromEntries(COVERAGE_BUCKETS.map(bucket => [bucket, 0])), gaps = [];
    let textOnly = 0, through = this.activation?.t0Ms ?? 0, contiguous = true, readableEnd = 0, oldestUnread = null, recentFailed = 0;
    for (const entry of this.passages.values()) {
      coverage[entry.bucket]++;
      if (entry.bucket === 'scanned' && entry.mode === 'text') textOnly++;
      if (entry.bucket === 'failed' && now - entry.failedAt < limits.lateAfterMs) recentFailed++;
      if (contiguous && READ.has(entry.bucket)) through = Math.max(through, entry.endMs); else contiguous = false;
      if (entry.bucket !== 'waiting' && entry.bucket !== 'unscannable') readableEnd = Math.max(readableEnd, entry.endMs);
      if ((entry.bucket === 'pending' || entry.bucket === 'scanning') && (oldestUnread === null || entry.startMs < oldestUnread)) oldestUnread = entry.startMs;
      if (entry.bucket === 'failed' || entry.reason) gaps.push({ id: entry.id, startMs: entry.startMs, endMs: entry.endMs, bucket: entry.bucket, reason: entry.error || entry.reason, rejected: droppedIn(entry) });
    }
    const lagMs = oldestUnread === null ? 0 : Math.max(0, readableEnd - oldestUnread);
    const counts = Object.fromEntries(CLAIM_STATES.map(status => [status, 0]));
    let lateClaims = 0, oldest = null;
    const isLate = claim => !TERMINAL.has(claim.status) && now - claim.since > limits.lateAfterMs;
    for (const claim of this.claims) {
      counts[claim.status]++;
      if (isLate(claim)) lateClaims++;
      if ((claim.status === 'detected' || claim.status === 'queued') && (oldest === null || claim.since < oldest)) oldest = claim.since;
    }
    const passagesPending = coverage.pending + coverage.rescan, claimsWaiting = counts.detected + counts.queued;
    // A given-up passage no longer counts in lagMs (it would keep the state late for ever), so failures carry
    // their own signal: told while the last reading failed, and for lateAfterMs after a passage was given up.
    // Without it a provider that is down would be published as a programme in which nothing is said.
    const readFailing = this.enabled && (this.detectStreak > 0 || recentFailed > 0);
    // Lateness always comes with its cause; a paused detection is late by definition.
    const reason = !this.enabled ? null : this.claims.length >= limits.maxClaims ? 'registry-full'
      : readFailing ? 'detection-failed'
        : counts.detected >= limits.maxDetectedBacklog || lateClaims ? 'verification'
          : passagesPending > limits.detectBatchPassages || lagMs > LATE_LAG_MS ? 'detection' : null;
    const late = reason !== null;
    const state = !this.activation ? 'idle' : !this.enabled ? 'stopped' : late ? 'late' : this.running.size ? 'verifying' : this.detecting ? 'detecting' : 'listening';
    const label = {
      idle: 'Surveillance inactive.', stopped: this.activation?.stopReason || 'Surveillance arrêtée.', verifying: 'Vérification en cours…',
      detecting: 'Lecture des nouveaux passages…', listening: 'Surveillance active.',
      late: reason === 'registry-full' ? 'Registre plein : les nouveaux passages ne sont plus lus.'
        : reason === 'detection-failed' ? (this.detectStreak
          ? `Lecture des passages en échec${coverage.failed ? ` : ${plural(coverage.failed, 'passage non lu', 'passages non lus')}` : ''}.`
          : `Lecture rétablie : ${plural(coverage.failed, 'passage n’a pas pu être lu', 'passages n’ont pas pu être lus')}.`)
          // One verification running late with nothing queued behind it is not "0 waiting": what is late is that check.
          : reason === 'verification' ? (claimsWaiting ? `Vérifications en retard : ${plural(claimsWaiting, 'affirmation en attente', 'affirmations en attente')}.` : 'Vérification en cours : elle a pris du retard.')
            : `Lecture en retard : ${plural(passagesPending + coverage.scanning, 'passage à lire', 'passages à lire')}.`,
    }[state];
    const claim = c => (full ? { ...c, origin: { ...c.origin }, mentions: c.mentions.map(m => ({ ...m })), sources: c.sources.map(s => ({ ...s })), limitations: [...c.limitations], contextPassageIds: [...c.contextPassageIds], late: isLate(c) }
      : { id: c.id, activationId: c.activationId, action: c.action, kind: c.kind, status: c.status, late: isLate(c), statement: c.statement, reason: c.reason, note: c.note,
        origin: { ...c.origin }, mentionCount: c.mentionCount, lotId: c.lotId, detectedAt: c.detectedAt, finishedAt: c.finishedAt, assessment: c.assessment, conclusion: c.conclusion, error: c.error, sourceCount: c.sources.length });
    const lot = l => ({ ...l, claimIds: [...l.claimIds], sourcedClaimIds: [...l.sourcedClaimIds], undeterminedClaimIds: [...l.undeterminedClaimIds], sources: l.sources.map(s => ({ ...s, claimIds: [...s.claimIds] })),
      origin: l.origin.map(o => ({ ...o })), uncertainties: [...l.uncertainties], ...(l.assessments ? { assessments: l.assessments.map(a => ({ ...a })) } : {}), metrics: { ...l.metrics } });
    // `interval` is the stretch of video the card comes from, whatever its kind: always stated, never implied.
    // light (brief state): what a screen shows of a card every second; the rest is read from the lot on request.
    const light = brief && !full;
    const card = l => ({ id: l.id, kind: l.kind, label: CARD_LABELS[l.kind], seq: l.kind === 'signal' ? l.signalSeq : l.seq, text: l.text, claimIds: l.kind === 'signal' ? [...l.claimIds] : [...l.sourcedClaimIds],
      interval: { startMs: Math.min(...l.origin.map(o => o.startMs)), endMs: Math.max(...l.origin.map(o => o.endMs)) },
      sources: l.sources.map(s => (light ? { url: s.url, title: s.title, publisher: s.publisher } : { ...s, claimIds: [...s.claimIds] })), origin: l.origin.map(o => ({ ...o })),
      ...(light ? {} : { uncertainties: [...l.uncertainties] }),
      ...(l.kind === 'verification' ? { assessments: l.assessments.map(a => ({ ...a })) } : {}), publishedAtMs: l.publishedAtMs, finishedAt: l.finishedAt });
    const out = {
      version: 1, enabled: this.enabled, sessionId: this.sessionId, restored: this.restored,
      activation: this.activation ? { ...this.activation } : null,
      activity: { state, label, detecting: Boolean(this.detecting), running: this.running.size, waiting: claimsWaiting, late },
      coverage: { total: this.passages.size, ...coverage, textOnly, scannedThroughMs: through, lagMs, stoppedWithPending: this.stoppedWithPending },
      // passagesFailed counts every passage given up since the activation, late or not: the polled state always says it.
      backlog: { late, reason, passagesPending, passagesFailed: coverage.failed, failure: readFailing ? this.detectFailure : null, claimsWaiting, oldestClaimWaitMs: oldest === null ? 0 : Math.max(0, now - oldest) },
      counts,
      // The polled lists are bounded and say so: totals tell a client that it shows the most recent part only.
      // rejected: elements a detector returned and validation dropped, all causes together, since the registry began.
      totals: { claims: this.claims.length, lots: this.lots.length, gaps: gaps.length, rejected: Object.values(this.metrics.detect.rejected).reduce((sum, count) => sum + count, 0) },
      claims: (full ? this.claims : this.claims.slice(-limits.stateClaims)).map(claim),
      lots: (full ? this.lots : this.lots.slice(-limits.stateLots)).map(lot),
      gaps: full ? gaps : gaps.slice(-GAPS_IN_STATE),
      // Sourced verification results only. A lot without a sourced claim never produces a card here.
      overlay: { seq: this.overlaySeq, cards: this.lots.filter(l => l.overlay).slice(-limits.overlayCards).map(card) },
      // Video observations asked for by the instruction: kept apart, typed "signal", with their interval.
      signals: { seq: this.signalSeq, cards: this.lots.filter(l => l.kind === 'signal').slice(-limits.overlayCards).map(card) },
      metrics: JSON.parse(JSON.stringify(this.metrics)), limits: { ...limits }, error: this.error,
    };
    if (brief && !full) for (const heavy of ['claims', 'lots', 'gaps', 'metrics', 'limits']) delete out[heavy];
    if (full) Object.assign(out, { savedAt: now, elapsedMs: this.elapsedMs,
      sequences: { activation: this.activationSeq, claim: this.claimSeq, lot: this.lotSeq, overlay: this.overlaySeq, signal: this.signalSeq },
      passages: [...this.passages.values()].map(({ fields, stable, status, ...entry }) => ({ ...entry, rejected: { ...entry.rejected }, rejects: entry.rejects.map(reject => ({ ...reject })) })) });
    return out;
  }
  // A waiting time that grows every second is not a change worth publishing.
  key(state) { return JSON.stringify({ ...state, backlog: { ...state.backlog, oldestClaimWaitMs: 0 } }); }
  emit() {
    const state = this.snapshot(), key = this.key(state);
    if (key === this.emitted) return;
    this.emitted = key;
    try { this.onChange(state); } catch (error) { this.fail(error); }
  }
}

module.exports = { Surveillance, DEFAULT_LIMITS, COVERAGE_BUCKETS, CLAIM_STATES, ASSESSMENT_LABELS, CARD_LABELS, TEXT_LIMITS,
  claimKey, sameClaim, validateDetection, applyVerdicts, composeLotText, composeSignalText, acceptableText, sentences, sourceKey };
