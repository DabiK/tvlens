import { formatClock, formatLimit, plural } from './text.mjs';

/**
 * Pure view model of one chat question. Same rules as describeJob in tv/app/companion.js:
 * a technical failure, a deadline or a cancellation is shown as such, and "PREUVES INSUFFISANTES"
 * is reserved for a completed answer that abstains. Nothing here knows a ceiling: it comes from
 * job.timeoutMs (published by the core) or from the host configuration, otherwise it is not shown.
 */
const KIND_LABELS = {
  observation: 'OBSERVÉ DANS LA VIDÉO',
  external: 'RÉPONSE AVEC SOURCES EXTERNES',
  explanation: 'EXPLICATION GÉNÉRALE',
  insufficient: 'PREUVES INSUFFISANTES',
};
const OUTCOME_LABELS = { error: 'ERREUR TECHNIQUE', timeout: 'DÉLAI ATTEINT', cancelled: 'ANNULÉE' };
const positive = value => (Number.isFinite(value) && value > 0 ? value : null);
const finite = value => (Number.isFinite(value) ? value : null);

/** "01:12 / 05:00" with a known ceiling, "01:12" without. The elapsed part never runs past the ceiling. */
export function clockLabel(elapsedMs, timeoutMs) {
  const ceiling = positive(timeoutMs), elapsed = Math.max(0, finite(elapsedMs) ?? 0);
  return ceiling ? `${formatClock(Math.min(elapsed, ceiling))} / ${formatClock(ceiling)}` : formatClock(elapsed);
}

/**
 * How far the memory reached for this question. Two measurements of the core, shown only when they exist:
 * job.availability (what was received when the question froze: interval and last passage) and the analysis
 * state at the effective start (job.evidenceAtStart while it runs, job.metrics.evidence afterwards).
 * Returns null without either: nothing is inferred, and the frozen interval is never presented as wider.
 * Three wordings of the same measurements: `label`, the whole sentence (shown while the question waits or runs,
 * and on hover afterwards); `short`, one time code above a finished answer; `detail`, the sentence without the
 * instant of the question, for the detail block that already states it.
 */
export function describeFreshness(job) {
  const available = job?.availability && typeof job.availability === 'object' ? job.availability : null;
  const evidence = job?.evidenceAtStart || job?.metrics?.evidence || null;
  const received = available ? (available.lastPassage ? finite(available.throughMs) : 0) : null, analyzed = finite(evidence?.contextThroughMs);
  if (received === null && analyzed === null) return null;
  const anchorMs = finite(available?.anchorMs) ?? finite(job.anchorMs) ?? finite(job.metrics?.evidence?.anchorMs);
  const through = received ?? analyzed, pending = evidence?.pendingCount > 0 ? evidence.pendingCount : 0;
  const memory = received === null ? (analyzed > 0 ? `Mémoire analysée jusqu’à ${formatClock(analyzed)} pour cette question` : 'Aucun passage analysé n’était encore disponible pour cette question')
    : received > 0 ? `Mémoire disponible jusqu’à ${formatClock(received)} au moment de l’envoi` : 'Aucun passage n’était encore reçu au moment de l’envoi';
  // Said only when it adds something: a question asked a second after the last passage needs no second time code.
  const asked = anchorMs !== null && anchorMs - through >= 1000 ? `question posée à ${formatClock(anchorMs)}` : null;
  const more = [];
  if (available?.lastPassage && Number.isFinite(available.lastPassage.startMs)) more.push(`dernier passage reçu : ${formatClock(available.lastPassage.startMs)}–${formatClock(available.lastPassage.endMs)}`);
  if (received !== null && analyzed !== null && analyzed < received) more.push(analyzed > 0 ? `analysée jusqu’à ${formatClock(analyzed)}` : 'pas encore analysée');
  if (pending) more.push(`${plural(pending, 'passage')} encore en analyse`);
  return {
    label: `${[memory, asked, ...more].filter(Boolean).join(' · ')}.`,
    // Received and analysed are two measurements: the short form keeps saying which one it shows.
    short: received === null ? (analyzed > 0 ? `Mémoire analysée jusqu’à ${formatClock(analyzed)}` : 'Aucun passage analysé')
      : received > 0 ? `Mémoire jusqu’à ${formatClock(received)}` : 'Aucun passage reçu à l’envoi',
    detail: `${[memory, ...more].join(' · ')}.`,
    throughMs: through, analyzedThroughMs: analyzed, anchorMs, lastPassage: available?.lastPassage || null,
    lagMs: anchorMs === null ? null : Math.max(0, anchorMs - through), pendingCount: pending,
  };
}

/**
 * @param {object} job one entry of DeepAsk.snapshot().jobs
 * @param {{now:number,timeoutMs?:number|null,queuedIds?:string[],capturing?:boolean}} context
 *   now is injected (tests drive it); timeoutMs is the host fallback for a job saved before the field existed.
 */
export function describeJob(job, { now = Date.now(), timeoutMs: fallbackTimeoutMs = null, queuedIds = [], capturing = false } = {}) {
  const result = job.result || null, status = job.status;
  const failed = ['error', 'timeout', 'cancelled'].includes(status);
  const observed = Boolean(result?.observations?.length);
  const ceiling = positive(job.timeoutMs) ?? positive(fallbackTimeoutMs);
  const view = {
    status, phase: failed ? 'failed' : status === 'done' ? 'done' : status === 'queued' ? 'queued' : 'running',
    outcomeLabel: null, error: null, errorDetail: null, authRequired: false,
    kind: null, kindLabel: null, answer: null, result: null, limits: [],
    previewLabel: null, preview: null, provisionalLabel: null, provisional: null, message: null,
    queuePosition: null, queueLabel: null, timeoutMs: ceiling, elapsedMs: null, progress: null, clockLabel: null, statusLine: null,
    canCancel: false, cancelLabel: null, canReask: failed, freshness: describeFreshness(job), freshnessLabel: null,
    waitMs: finite(job.startedAt) === null ? null : Math.max(0, job.startedAt - job.createdAt),
    runMs: finite(job.finishedAt) === null ? null : Math.max(0, job.finishedAt - (finite(job.startedAt) ?? job.createdAt)),
  };
  // Above a finished question, one time code: the whole sentence would stack up over every answer of the chat.
  // A question that waits or runs keeps it: how far the memory reached is what there is to read meanwhile.
  if (view.freshness) view.freshnessLabel = ['queued', 'running'].includes(view.phase) ? view.freshness.label : view.freshness.short;
  const preview = job.preview || null, provisional = job.provisional || null;
  if (failed) {
    view.outcomeLabel = OUTCOME_LABELS[status];
    view.error = job.message || {
      error: 'Erreur technique.',
      timeout: ceiling ? `Délai de ${formatLimit(ceiling)} atteint.` : 'Délai atteint.',
      cancelled: 'Recherche annulée.',
    }[status];
    const detail = job.errorDetail || null;
    if (detail) {
      const inner = detail.turnError || null, parts = [];
      if (detail.turnStatus) parts.push(`Codex · ${detail.turnStatus}`);
      if (inner?.code) parts.push(inner.code);
      if (inner?.message) parts.push(inner.message);
      else if (inner?.codexErrorInfo) parts.push(inner.codexErrorInfo);
      view.errorDetail = parts.length ? parts.join(' · ') : null;
      view.authRequired = Boolean(detail.authRequired || inner?.authRequired);
      if (view.authRequired) view.errorDetail = `Reconnexion Codex requise${view.errorDetail ? ` · ${view.errorDetail}` : ''}`;
    }
    // The fallback result of a failed job is not an evidence verdict: only real observations are shown.
    if (observed) Object.assign(view, { kind: 'partial', kindLabel: 'OBSERVATIONS PARTIELLES', answer: result.answer, result, limits: result.limits || [] });
    if (preview) Object.assign(view, { previewLabel: 'Réponse provisoire interrompue (non validée)', preview });
    if (provisional) Object.assign(view, { provisionalLabel: 'Résumé automatique partiel', provisional });
    return view;
  }
  if (result) {
    const kind = Object.hasOwn(KIND_LABELS, result.kind) ? result.kind : 'other';
    return Object.assign(view, { kind, kindLabel: KIND_LABELS[kind] || 'RÉPONSE', answer: result.answer, result, limits: result.limits || [] });
  }
  if (preview) Object.assign(view, { previewLabel: 'Réponse en cours · pas encore validée', preview });
  if (provisional) Object.assign(view, { provisionalLabel: 'Résumé automatique partiel', provisional });
  view.message = job.message || '';
  view.canCancel = true;
  if (status === 'queued') {
    const position = queuedIds.indexOf(job.id) + 1;
    view.queuePosition = position || null;
    view.queueLabel = position ? `En attente · position ${position} sur ${queuedIds.length} dans la file.` : 'En attente dans la file.';
    // The wait is not charged to the ceiling: say so instead of letting the viewer count it.
    view.statusLine = ceiling ? `Son délai de ${formatLimit(ceiling)} ne démarre qu’à son tour.` : null;
    view.cancelLabel = 'Retirer cette question';
    return view;
  }
  const startedAt = finite(job.startedAt) ?? finite(job.createdAt) ?? now;
  view.elapsedMs = Math.max(0, now - startedAt);
  view.progress = ceiling ? Math.min(1, view.elapsedMs / ceiling) : null;
  view.clockLabel = clockLabel(view.elapsedMs, ceiling);
  view.statusLine = `${capturing ? 'La capture continue' : 'Capture en pause'}${ceiling ? ` · arrêt au plus tard à ${formatLimit(ceiling)}` : ''}. Tu peux ajouter des questions : elles attendent leur tour.`;
  view.cancelLabel = 'Annuler la recherche';
  return view;
}
