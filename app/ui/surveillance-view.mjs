import { formatClock, plural } from './text.mjs';

/**
 * Pure view model of the surveillance (tickets 05 and 06) for the Mac window.
 * Input: the compact state pushed by the host (snapshot of core/surveillance.cjs, possibly without its lists)
 * and, when the panel is open, the full registry. Output: discreet activity, tab badge, result cards and a
 * history by state. Rules carried here rather than in the DOM:
 * - a verification card exists only for a lot with at least one sourced claim and one source;
 * - a signal is a video observation: its own label, its interval, never a source, never an assessment;
 * - only a sourced verification may appear on screen by itself (bottom-left stack): a signal is read in the
 *   panel and in the history, and no option changes that;
 * - an undetermined, pending, failed or cancelled claim is history only, and never leaves it;
 * - the wording says what the sources do, never "true" or "false";
 * - a saved history that is still being read ("restoring") is neither a check in progress nor a delay, and a
 *   history kept in memory only is said for as long as the state says it, both in the words of the state;
 * - passages given up for good are said on the activity chip whatever the surveillance is doing, not only
 *   while it is late.
 */
export const ASSESSMENT_LABELS = Object.freeze({ supported: 'Concorde avec les sources', contradicted: 'Contredit par les sources', mixed: 'Sources partagées' });
export const CARD_LABELS = Object.freeze({ verification: 'Sources consultées', signal: 'Repéré dans la vidéo' });
export const STATE_LABELS = Object.freeze({ pending: 'En attente', running: 'En cours', sourced: 'Sourcée', undetermined: 'Indéterminée', error: 'Erreur', cancelled: 'Annulée', noted: 'Relevée' });
export const HISTORY_STATES = Object.freeze(['pending', 'running', 'sourced', 'undetermined', 'error', 'cancelled', 'noted']);
export const INSTRUCTION_EXAMPLES = Object.freeze([
  { label: 'Vérifie les chiffres annoncés', instruction: 'Vérifie les chiffres annoncés.' },
  { label: 'Préviens-moi quand ils parlent de…', instruction: 'Préviens-moi quand ils parlent de ' },
  { label: 'Signale ce qui contredit ce qui a été dit plus tôt', instruction: 'Signale ce qui contredit ce qui a été dit plus tôt dans la vidéo.' },
]);

// One display state per core state: detected and queued are both "waiting" for the viewer.
const BUCKETS = { detected: 'pending', queued: 'pending', running: 'running', sourced: 'sourced', undetermined: 'undetermined', error: 'error', cancelled: 'cancelled', noted: 'noted' };
const REASONS = {
  'non vérifiable': 'Affirmation qui ne se vérifie pas par une recherche.',
  'preuves insuffisantes': 'Les sources consultées ne suffisent pas pour conclure.',
  'sources non confirmées': 'Les sources proposées n’ont pas pu être confirmées.',
  'aucun verdict rendu': 'La recherche n’a rendu aucun avis sur cette affirmation.',
};
const RELATIONS = { supports: 'appuie', contradicts: 'contredit', context: 'contexte' };
const FIELDS = { transcript: 'paroles', visual: 'image', summary: 'résumé' };
const COUNT_WORDS = {
  sourced: ['sourcée', 'sourcées'], pending: ['en attente', 'en attente'], running: ['en cours', 'en cours'], undetermined: ['indéterminée', 'indéterminées'],
  error: ['en erreur', 'en erreur'], cancelled: ['annulée', 'annulées'], noted: ['signalement', 'signalements'],
};
const list = value => (Array.isArray(value) ? value : []);
const lowerFirst = text => text.charAt(0).toLowerCase() + text.slice(1);
const number = id => Number(String(id).split('-').pop()) || 0;
const range = (startMs, endMs) => `${formatClock(startMs)}–${formatClock(endMs)}`;
function host(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

/**
 * The saved history of the session is still being read: the activation is asked for, nothing of it is final
 * (no activation number, sequences at zero) and nothing runs yet. A host that says nothing about its registry
 * is never restoring.
 */
export function isRestoring(state) {
  return state?.activity?.state === 'restoring' || (Boolean(state?.registry) && typeof state.registry === 'object' && state.registry.ready === false);
}

/**
 * One result card, from a card of the compact state or from a lot of the registry.
 * Returns null when the item must not be shown as a result (unsourced verification, lot still running…).
 */
export function describeCard(item, { sessionId = null, claims = new Map() } = {}) {
  if (!item || typeof item !== 'object' || typeof item.id !== 'string') return null;
  const kind = item.kind === 'signal' ? 'signal' : 'verification';
  if (item.status !== undefined && item.status !== 'done') return null;
  const origin = list(item.origin).filter(o => o && Number.isFinite(o.startMs) && Number.isFinite(o.endMs));
  // The type is in the data; a signal never borrows the vocabulary or the sources of a web check.
  const sources = kind === 'signal' ? [] : list(item.sources).filter(source => source && typeof source.title === 'string' && source.title).map((source, index) => ({
    index, title: source.title, meta: [source.publisher || host(source.url), source.publishedAt].filter(Boolean).join(' · '),
    evidence: source.evidence || '', relationLabel: RELATIONS[source.relation] || null,
  }));
  const assessed = new Map(kind === 'signal' ? [] : list(item.assessments).map(a => [a.claimId, ASSESSMENT_LABELS[a.assessment] || null]));
  if (kind === 'verification' && (!sources.length || ![...assessed.values()].some(Boolean))) return null;
  const given = item.interval && Number.isFinite(item.interval.startMs) && Number.isFinite(item.interval.endMs) ? item.interval : null;
  if (!origin.length && !given) return null;
  const interval = given || { startMs: Math.min(...origin.map(o => o.startMs)), endMs: Math.max(...origin.map(o => o.endMs)) };
  const seq = kind === 'signal' ? item.signalSeq ?? item.seq : item.seq;
  return {
    id: item.id, kind, seq: Number.isFinite(seq) ? seq : 0, key: `${sessionId ?? ''}:${kind}:${item.id}`,
    label: CARD_LABELS[kind],
    note: kind === 'signal' ? 'Relevé dans la vidéo, sans vérification sur le web.' : null,
    text: typeof item.text === 'string' ? item.text : '',
    interval: { startMs: interval.startMs, endMs: interval.endMs }, intervalLabel: range(interval.startMs, interval.endMs),
    items: origin.map(o => ({
      claimId: o.claimId, passageId: o.passageId, startMs: o.startMs, endMs: o.endMs, timeLabel: formatClock(o.startMs), quote: o.quote || '',
      statement: claims.get(o.claimId)?.statement || '', assessmentLabel: assessed.get(o.claimId) || null,
    })),
    sources, uncertainties: list(item.uncertainties).filter(Boolean),
    finishedAt: Number.isFinite(item.finishedAt) ? item.finishedAt : null, publishedAtMs: Number.isFinite(item.publishedAtMs) ? item.publishedAtMs : null,
  };
}

function describeClaim(claim, { enabled }) {
  const state = BUCKETS[claim.status] || 'pending', origin = claim.origin || {}, action = claim.action === 'signal' ? 'signal' : 'verify';
  const row = {
    id: claim.id, state, stateLabel: STATE_LABELS[state], action, late: Boolean(claim.late),
    statement: claim.statement || '', quote: origin.quote || '', passageId: origin.passageId || null,
    startMs: Number.isFinite(origin.startMs) ? origin.startMs : null, endMs: Number.isFinite(origin.endMs) ? origin.endMs : null,
    timeLabel: Number.isFinite(origin.startMs) ? formatClock(origin.startMs) : '', fieldLabel: FIELDS[origin.field] || null,
    mentionLabel: claim.mentionCount > 1 ? `Entendue ${claim.mentionCount} fois` : null,
    assessmentLabel: null, conclusion: null, reason: null, error: null, lotId: claim.lotId || null,
    // The core only takes back a verification that failed or was cancelled, and only while the surveillance runs.
    canRetry: enabled && action === 'verify' && ['error', 'cancelled'].includes(claim.status),
  };
  if (state === 'sourced') Object.assign(row, { assessmentLabel: ASSESSMENT_LABELS[claim.assessment] || null, conclusion: claim.conclusion || null });
  else if (state === 'undetermined') Object.assign(row, { reason: REASONS[claim.reason] || claim.reason || 'Raison non précisée.', conclusion: claim.conclusion || null });
  else if (state === 'error') row.error = claim.error || 'Vérification impossible.';
  else if (state === 'cancelled') row.reason = claim.reason || 'Surveillance arrêtée.';
  else if (state === 'pending' && row.late) row.reason = 'En attente depuis un moment : la vérification a pris du retard.';
  return row;
}

/**
 * @param {object|null} state compact surveillance state (snapshot(), brief or not)
 * @param {{registry?:object|null,session?:{id?:string,readOnly?:boolean}|null,seen?:{overlay:number,signal:number},filter?:string,historyLimit?:number,banner?:boolean}} options
 *   registry: snapshot({full:true}) when the panel is open; seen: sequences already looked at (tab badge);
 *   banner: the window draws `notice` in a place of its own, so the activity line does not repeat it.
 */
export function describeSurveillance(state, { registry = null, session = null, seen = { overlay: 0, signal: 0 }, filter = 'all', historyLimit = 200, banner = false } = {}) {
  // A state that belongs to another session is not this session's surveillance.
  const s = state && typeof state === 'object' && (!session?.id || !state.sessionId || state.sessionId === session.id) ? state : null;
  const full = s && registry && typeof registry === 'object' && registry.sessionId === s.sessionId ? registry : null;
  const archive = Boolean(session?.readOnly), enabled = Boolean(s?.enabled);
  const activity = s?.activity || {}, backlog = s?.backlog || {}, counts = s?.counts || {}, totals = s?.totals || {};
  // How the registry is kept (state.registry). A host that does not say it claims nothing here.
  const kept = s?.registry && typeof s.registry === 'object' ? s.registry : null;
  const restoring = isRestoring(s);
  const status = !s?.activation ? 'off' : restoring ? 'restoring' : ['listening', 'detecting', 'verifying', 'late', 'stopped'].includes(activity.state) ? activity.state : enabled ? 'listening' : 'stopped';
  // What is shown lives in memory only (registry unreadable, folder too slow, write failing): the sentence of the
  // state, for as long as the state carries it. Never while restoring: nothing is known yet.
  // A host that gives no sentence still gets the notice: the condition is the state, not the wording.
  const unsaved = kept && !restoring && kept.persisted === false ? (typeof kept.message === 'string' && kept.message.trim()) || 'Suivi non enregistré : ce qui est affiché n’est gardé qu’en mémoire.' : null;
  // The core repeats the cause of an unread registry in its error: written once.
  const incident = s?.error && !(unsaved && unsaved.includes(s.error)) ? s.error : null;
  const waiting = backlog.claimsWaiting ?? activity.waiting ?? 0, toRead = backlog.passagesPending ?? 0, unread = backlog.passagesFailed ?? 0;
  // Lateness is told with its cause and the number that belongs to that cause. A reading that fails (provider
  // down, or restored with passages given up) and any cause this window does not know are told in the core's
  // own words: a count of waiting claims would say nothing about them.
  const told = lowerFirst(typeof activity.label === 'string' ? activity.label.trim().replace(/[.…]+$/, '') : '');
  const worded = {
    'registry-full': 'Surveillance saturée · les nouveaux passages ne sont plus lus',
    detection: `Surveillance en retard · ${plural(toRead, 'passage')} à lire`,
    verification: `Surveillance en retard · ${plural(waiting, 'affirmation')} en attente`,
  }[backlog.reason];
  const lateLabel = worded || (backlog.reason === 'detection-failed'
    ? `Surveillance · ${told || `lecture des passages en échec${unread ? ` : ${plural(unread, 'passage non lu', 'passages non lus')}` : ''}`}`
    : told ? `Surveillance · ${told}` : 'Surveillance en retard');
  // The tab title is a sentence with one colon; the words of the core already carry theirs.
  const lateTitle = worded ? worded.replace(' · ', ' : ') : lateLabel;
  const lateCount = { detection: toRead, 'detection-failed': unread, verification: waiting }[backlog.reason] ?? 0;
  const activityText = {
    listening: 'Surveillance · écoute', detecting: 'Surveillance · lecture des nouveaux passages',
    verifying: `Surveillance · vérification en cours${waiting ? ` · ${waiting} en attente` : ''}`, late: lateLabel,
    restoring: `Surveillance · ${told || 'restauration du suivi enregistré'}`,
  }[status] || '';
  // Passages given up stay unread for good, and the core counts them whether it is late or not: the chip keeps
  // saying so once the delay is over. Not while the sentence shown is already about them, nor while restoring
  // (nothing is final yet), nor once stopped (no chip: the panel lists them).
  const unreadNote = activityText && unread > 0 && !restoring && !(status === 'late' && backlog.reason === 'detection-failed') ? plural(unread, 'passage non lu', 'passages non lus') : null;
  const chipText = [activityText, unreadNote].filter(Boolean).join(' · ');

  // Registry first, then the pushed state on top: the push is always the more recent of the two.
  const claims = new Map();
  for (const source of [full, s]) for (const claim of list(source?.claims)) if (claim && typeof claim.id === 'string') claims.set(claim.id, claim);
  // A published card stands for a finished lot: it replaces an older copy of that lot still marked as running.
  const lots = new Map();
  for (const source of [full?.lots, s?.lots, s?.overlay?.cards, s?.signals?.cards]) for (const lot of list(source)) {
    if (!lot || typeof lot.id !== 'string') continue;
    const known = lots.get(lot.id);
    if (!known || lot.status !== undefined || known.status !== 'done') lots.set(lot.id, lot);
  }
  const card = item => describeCard(item, { sessionId: s?.sessionId, claims });
  // Panel: sourced verifications and signals, each under its own label.
  const results = [...lots.values()].map(card).filter(Boolean)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0) || number(b.id) - number(a.id));
  // What may appear on screen by itself: sourced verifications, nothing else. signals.cards is never read here,
  // and a signal that a host would file among the overlay cards is dropped by its kind.
  const cards = list(s?.overlay?.cards).map(card).filter(c => c?.kind === 'verification')
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0) || number(a.id) - number(b.id));

  const rows = [...claims.values()].sort((a, b) => number(b.id) - number(a.id)).map(claim => describeClaim(claim, { enabled }));
  const byState = Object.fromEntries(HISTORY_STATES.map(key => [key, 0]));
  for (const [core, bucket] of Object.entries(BUCKETS)) byState[bucket] += counts[core] || 0;
  const total = Number.isFinite(totals.claims) ? totals.claims : rows.length;
  const active = HISTORY_STATES.includes(filter) ? filter : 'all';
  const filtered = active === 'all' ? rows : rows.filter(row => row.state === active);
  // The polled state may carry no list at all: the registry then arrives when the panel opens.
  const loading = rows.length === 0 && total > 0;
  const countsLine = total ? [plural(total - byState.noted, 'affirmation suivie', 'affirmations suivies'),
    ...['sourced', 'pending', 'running', 'undetermined', 'error', 'cancelled'].filter(key => byState[key]).map(key => `${byState[key]} ${COUNT_WORDS[key][byState[key] > 1 ? 1 : 0]}`),
    ...(byState.noted ? [plural(byState.noted, ...COUNT_WORDS.noted)] : [])].join(' · ') : '';

  // The tab badge is not the stack: it counts what is new to read in the panel, signals included.
  const unseen = Math.max(0, (s?.overlay?.seq || 0) - (seen.overlay || 0)) + Math.max(0, (s?.signals?.seq || 0) - (seen.signal || 0));
  const late = status === 'late';
  const startedAtMs = s?.activation?.t0Ms, through = s?.coverage?.scannedThroughMs;
  const gaps = list(full?.gaps?.length ? full.gaps : s?.gaps).filter(gap => gap && typeof gap.id === 'string').map(gap => ({
    id: gap.id, label: `${range(gap.startMs, gap.endMs)} · ${gap.reason || 'Passage non lu.'}`, startMs: gap.startMs, canRetry: enabled && gap.bucket === 'failed',
  }));
  return {
    status, enabled, archive, restored: Boolean(s?.restored), instruction: s?.activation?.instruction || '',
    chip: { visible: Boolean(chipText), state: status, text: chipText, late, waiting: late ? lateCount : waiting, unread: restoring ? 0 : unread },
    badge: {
      visible: late || unseen > 0 || enabled, tone: late ? 'late' : unseen > 0 ? 'new' : enabled ? 'active' : null, count: unseen,
      label: late ? lateTitle : unseen > 0 ? plural(unseen, 'nouveau résultat', 'nouveaux résultats') : restoring ? activityText : enabled ? 'Surveillance active' : '',
    },
    activity: {
      text: status === 'off' ? 'Aucune surveillance en cours.' : activity.label || activityText || 'Surveillance arrêtée.',
      detail: [
        Number.isFinite(startedAtMs) ? `Depuis ${formatClock(startedAtMs)} de la vidéo` : null,
        enabled && Number.isFinite(through) && through > (startedAtMs || 0) ? `lu jusqu’à ${formatClock(through)}` : null,
        !enabled && s?.coverage?.stoppedWithPending ? `${plural(s.coverage.stoppedWithPending, 'passage non lu', 'passages non lus')} à l’arrêt` : null,
        s?.restored && !enabled ? 'résultats d’une surveillance précédente, en lecture seule' : null,
      ].filter(Boolean).join(' · '),
      // Without a banner of its own the notice is read here, before any other incident.
      error: (banner ? incident : [unsaved, incident].filter(Boolean).join(' ')) || null,
    },
    registry: kept ? { status: typeof kept.status === 'string' ? kept.status : null, ready: !restoring, persisted: kept.persisted !== false } : null,
    // Discreet banner: shown while the history is not saved, in the words of the state.
    notice: unsaved ? { tone: 'warning', text: unsaved } : null,
    form: {
      canStart: Boolean(session?.id) && !archive, canStop: enabled,
      startLabel: enabled ? 'Remplacer la consigne' : 'Démarrer la surveillance',
      hint: !session?.id ? 'Lance l’observation d’une vidéo pour activer la surveillance.'
        : archive ? 'Archive en lecture seule : reprends la capture pour relancer une surveillance.'
          : 'Commence maintenant, sans relire le passé. Tu peux poser tes questions en même temps.',
    },
    cards, results,
    // While the saved history is being read, an empty list is not "no result yet": the state says what goes on.
    resultsEmpty: restoring ? activity.label || 'Restauration du suivi enregistré…'
      : enabled ? 'Aucun résultat pour l’instant. Une vérification sourcée ou un élément repéré apparaîtra ici.' : 'Démarre une surveillance : ses résultats apparaîtront ici.',
    history: {
      rows: filtered.slice(0, historyLimit), hiddenByLimit: Math.max(0, filtered.length - historyLimit), filter: active,
      moreLabel: filtered.length - historyLimit > 1 ? `Afficher les ${filtered.length - historyLimit} plus anciens` : 'Afficher le plus ancien',
      filters: [{ key: 'all', label: 'Tout', count: total }, ...HISTORY_STATES.filter(key => byState[key]).map(key => ({ key, label: STATE_LABELS[key], count: byState[key] }))],
      countsLine,
      // The pushed lists are the most recent part only: totals says how many exist, so say it.
      bound: {
        shown: rows.length, total,
        label: loading ? `Chargement de l’historique (${plural(total, 'élément')})…`
          : rows.length < total ? `${plural(rows.length, 'élément le plus récent affiché', 'éléments les plus récents affichés')} sur ${total}.` : null,
      },
      empty: total ? (loading || filtered.length ? null : 'Rien dans cet état pour l’instant.')
        : restoring ? activity.label || 'Restauration du suivi enregistré…'
          : enabled ? 'Rien de relevé pour l’instant. Les éléments repérés s’afficheront ici, avec leur état.' : 'L’historique de la surveillance s’affichera ici.',
    },
    gaps: { rows: gaps, total: Number.isFinite(totals.gaps) ? totals.gaps : gaps.length },
    untracked: claims.size - rows.length,
  };
}
