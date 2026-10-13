import { element as el, formatTime, action, keepOpen } from './format.js';
import { KeyedList } from './list-view.mjs';
import { describeJob } from './job-view.mjs';
import { mediaNote } from './sessions-view.mjs';
import { agreeText, plural } from './text.mjs';

/**
 * Chat cards. One card per question, made of blocks that are each replaced only when their own content
 * changes: while an answer is being written, the cancel button, an open detail block and the earlier cards
 * keep their nodes. Buttons carry data-action; the renderer resolves them, so no closure is lost on update.
 *
 * context = { now, timeoutMs, queuedIds, capturing, session, passage(id), preview(id), cancelling, verifyAvailable, verifyBusy }
 */
const blocksOf = new WeakMap();
const block = (id, signature, build) => ({ id, signature: typeof signature === 'string' ? signature : JSON.stringify(signature), render: previous => keepOpen(previous, build(previous)) });
const seconds = ms => `${(ms / 1000).toFixed(1)} s`;
const range = item => `${formatTime(item.startMs)}–${formatTime(item.endMs)}`;
// A time code is not a figure to check.
const hasFigure = text => /\d/.test(String(text).replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ''));

function passageButton(item, context, sameSession, className, label) {
  const passage = sameSession ? context.passage(item.id) : null, available = Boolean(passage?.available);
  const button = action(className, '', 'replay', { id: item.id, start: item.startMs });
  if (className === 'preview-passage') {
    const image = available && context.preview(item.id);
    if (image) { const img = el('img'); img.src = image; img.alt = label; button.append(img); }
    button.append(document.createTextNode(`${formatTime(item.startMs)}${available ? ' ↗' : ''}`));
  } else button.textContent = `${range(item)}${available ? ' ↗' : ` · ${mediaNote(passage).short}`}`;
  button.disabled = !available;
  if (!available) button.title = mediaNote(passage).long;
  return button;
}

function jobBlocks(job, view, context) {
  const out = [], result = view.result, sameSession = context.session?.id === job.sessionId;
  const media = items => items.map(item => { const passage = sameSession ? context.passage(item.id) : null; return [item.id, item.startMs, item.endMs, passage?.available ? (context.preview(item.id) ? 2 : 1) : passage?.mediaReason || 0]; });
  out.push(block('question', job.question, () => el('div', 'chat-question', job.question)));
  // Finished: one time code, the whole sentence on hover and in "Détails du traitement". Waiting or running: the sentence.
  if (view.freshness) out.push(block('fresh', [view.freshnessLabel, view.freshness.label], () => {
    const line = el('p', 'hint job-fresh', view.freshnessLabel);
    if (view.freshnessLabel !== view.freshness.label) line.title = view.freshness.label;
    return line;
  }));
  if (view.phase === 'failed') out.push(block('outcome', [view.outcomeLabel, view.error, view.errorDetail], () => {
    const box = el('div', 'job-outcome');
    box.dataset.outcome = job.status;
    box.append(el('div', 'answer-kind', view.outcomeLabel), el('p', 'job-error', view.error));
    if (view.errorDetail) box.append(el('p', 'hint', view.errorDetail));
    return box;
  }));
  if (view.phase === 'queued') out.push(block('queue', [view.queueLabel, view.statusLine], () => {
    const box = el('div', 'job-waiting');
    box.append(el('p', 'pending', view.queueLabel));
    if (view.statusLine) box.append(el('small', '', view.statusLine));
    return box;
  }));
  if (view.phase === 'running') {
    const startedAt = job.startedAt || job.createdAt;
    // Its text and gauge are refreshed every second by the renderer from these two attributes.
    out.push(block('clock', [startedAt, view.timeoutMs], () => {
      const row = el('div', 'job-clock-row'), clock = el('span', 'job-clock', view.clockLabel);
      clock.dataset.started = startedAt; clock.dataset.timeout = view.timeoutMs ?? '';
      clock.title = view.timeoutMs ? 'Temps écoulé / délai maximal de la question' : 'Temps écoulé';
      if (view.timeoutMs) { const gauge = el('progress', 'job-progress'); gauge.max = 1; gauge.value = view.progress; gauge.setAttribute('aria-hidden', 'true'); row.append(gauge); }
      row.append(clock);
      return row;
    }));
    const steps = (job.activity || []).slice(-5).map(step => step.message);
    if (steps.length) out.push(block('steps', steps, () => { const list = el('ol', 'activity-list'); for (const step of steps) list.append(el('li', '', step)); return list; }));
  }
  if (view.provisional) out.push(block('provisional', [view.provisionalLabel, view.provisional], () => {
    const box = el('div', 'job-provisional');
    box.append(el('div', 'answer-kind', `${view.provisionalLabel.toUpperCase()} · À CONFIRMER`), el('p', 'chat-provisional', view.provisional));
    return box;
  }));
  if (view.phase === 'running' && job.memoryPreview?.passages?.length) out.push(block('passages', [media(job.memoryPreview.passages), job.memoryPreview.unanalyzedTailMs > 0], () => {
    const box = el('div', 'job-passages'), rail = el('div', 'preview-passages');
    for (const passage of job.memoryPreview.passages) rail.append(passageButton(passage, context, sameSession, 'preview-passage', 'Passage retrouvé'));
    box.append(rail);
    if (job.memoryPreview.unanalyzedTailMs > 0) box.append(el('p', 'hint', 'Les dernières secondes ne sont pas encore entièrement analysées.'));
    return box;
  }));
  // Streamed at up to twelve updates a second: the text is patched in place, the node stays.
  if (view.preview) out.push(block('preview', [view.previewLabel, view.preview], previous => {
    const box = previous || el('div', 'job-preview');
    if (!previous) box.append(el('p', 'hint'), el('p', 'chat-preview'));
    box.firstChild.textContent = view.previewLabel; box.lastChild.textContent = view.preview;
    return box;
  }));
  if (view.phase === 'running') out.push(block('message', [view.message, view.statusLine], previous => {
    const box = previous || el('div', 'job-status');
    if (!previous) box.append(el('p', 'pending'), el('small'));
    box.firstChild.textContent = view.message; box.lastChild.textContent = view.statusLine;
    return box;
  }));
  if (view.canCancel) {
    const cancelling = context.cancelling.has(job.id);
    out.push(block('cancel', [view.cancelLabel, cancelling], () => {
      const button = action('secondary cancel-deep', cancelling ? 'Annulation…' : view.cancelLabel, 'job-cancel', { id: job.id });
      button.disabled = cancelling;
      return button;
    }));
  }
  if (result) {
    out.push(block('result', [view.kindLabel, view.answer, result.hypotheses, view.limits], () => {
      const box = el('div', 'job-result');
      box.append(el('div', 'answer-kind', view.kindLabel), el('p', 'chat-answer', view.answer));
      if (result.hypotheses?.length) box.append(el('div', 'answer-kind', 'HYPOTHÈSES · NON ÉTABLIES'), el('p', '', result.hypotheses.join(' ')));
      // Limits are sentences of the core, some still written "N passage(s)": agreed here, wording untouched.
      if (view.limits.length) box.append(el('p', 'answer-limits', agreeText(view.limits.join(' '))));
      return box;
    }));
    const citations = result.citations || [];
    if (citations.length) out.push(block('citations', media(citations), () => {
      const refs = el('div', 'references');
      for (const citation of citations) refs.append(passageButton(citation, context, sameSession, 'reference'));
      return refs;
    }));
    if (job.intent && citations.length) out.push(block('citation-rail', media(citations.slice(0, 3)), () => {
      const rail = el('div', 'preview-passages');
      for (const citation of citations.slice(0, 3)) rail.append(passageButton(citation, context, sameSession, 'preview-passage', 'Passage cité'));
      return rail;
    }));
    const sources = result.sources || [];
    if (sources.length) out.push(block('sources', sources.map(source => [source.title, source.evidence]), () => {
      const box = el('div', 'job-sources');
      box.append(el('div', 'answer-kind', 'SOURCES WEB'));
      for (const [index, source] of sources.entries()) {
        const card = el('div', 'source-card');
        card.append(action('source-link', `${source.title} ↗`, 'chat-source', { job: job.id, index }), el('p', '', source.evidence || ''));
        box.append(card);
      }
      return box;
    }));
  }
  if (view.phase === 'done' || view.phase === 'failed') {
    const more = view.phase === 'done' && Boolean(result?.answer) && result.kind !== 'insufficient' && !job.intent;
    const check = more && context.verifyAvailable && hasFigure(result.answer);
    // A restored targeted action has lost the frozen instant it was built on: it cannot be re-examined.
    const reexamine = !(job.intent && context.session?.readOnly);
    out.push(block('followups', [more, check, reexamine, view.canReask, context.verifyBusy], () => {
      const box = el('div', 'job-actions');
      if (view.canReask) box.append(action('secondary reask', 'Reposer la question', 'job-reask', { id: job.id }));
      if (more) box.append(action('secondary', 'Approfondir', 'job-more', { id: job.id }));
      if (check) { const button = action('secondary', 'Vérifier un chiffre', 'job-verify', { id: job.id }); button.disabled = Boolean(context.verifyBusy); box.append(button); }
      if (reexamine) box.append(action('secondary deepen', 'Réexaminer le passage', 'job-reexamine', { id: job.id }));
      return box;
    }));
    const metrics = job.metrics || null, steps = (job.activity || []).map(step => step.message);
    out.push(block('details', [job.anchorMs, view.waitMs, view.runMs, steps, metrics && [metrics.firstUsefulMs, metrics.waitMs, metrics.endToEndMs], view.freshness?.detail], () => {
      const details = el('details', 'response-details');
      details.dataset.key = 'meta';
      details.append(el('summary', 'hint', 'Détails du traitement'),
        el('small', 'hint', `Question posée à ${formatTime(job.anchorMs || 0)} de la vidéo${view.waitMs === null ? '' : ` · Attente ${seconds(view.waitMs)}`}`));
      // What the memory held for this question, in full: last passage received, analysis still pending.
      if (view.freshness) details.append(el('p', 'hint job-fresh-detail', view.freshness.detail));
      if (view.runMs !== null) {
        const history = el('details', 'activity-history'), list = el('ol', 'activity-list');
        history.dataset.key = 'steps';
        for (const step of steps) list.append(el('li', '', step));
        history.append(el('summary', 'hint', `${seconds(view.runMs)} · Étapes de la réponse`), list);
        details.append(history);
      }
      if (metrics) {
        const timing = el('details', 'activity-history');
        timing.dataset.key = 'timing';
        timing.append(el('summary', 'hint', 'Temps de réponse'), el('p', 'hint', `Première information : ${metrics.firstUsefulMs == null ? 'indisponible' : (metrics.firstUsefulMs / 1000).toFixed(2) + ' s'} · Attente : ${(metrics.waitMs / 1000).toFixed(2)} s · Total : ${(metrics.endToEndMs / 1000).toFixed(2)} s`));
        details.append(timing);
      }
      return details;
    }));
  }
  return out;
}

export function jobEntry(job, context) {
  const linked = [...(job.result?.citations || []), ...(job.memoryPreview?.passages || [])];
  const sameSession = context.session?.id === job.sessionId;
  const media = linked.map(item => { const passage = sameSession ? context.passage(item.id) : null; return passage?.available ? (context.preview(item.id) ? 'p' : 'a') : (passage?.mediaReason || '-')[0]; }).join('');
  // A finished question with its metrics no longer changes: its content is not serialised again at every event.
  const settled = !['queued', 'running'].includes(job.status) && job.metrics;
  const signature = [settled ? `${job.status}:${job.finishedAt}` : JSON.stringify(job), media, context.queuedIds.indexOf(job.id), context.queuedIds.length,
    context.cancelling.has(job.id), context.capturing, context.timeoutMs, Boolean(context.session?.readOnly), context.verifyAvailable, context.verifyBusy].join('|');
  return { id: job.id, signature, render: previous => {
    const node = previous || el('article', 'verification-message deep-message');
    if (!previous) blocksOf.set(node, new KeyedList(node));
    node.dataset.status = job.status; node.dataset.id = job.id;
    blocksOf.get(node).sync(jobBlocks(job, describeJob(job, context), context));
    return node;
  } };
}

const ASSESSMENTS = { supported: 'Les sources concordent', contradicted: 'Les sources contredisent l’affirmation', mixed: 'Les preuves appellent des nuances', insufficient: 'Preuves insuffisantes' };

/** Manual verification asked by the viewer (distinct from the surveillance, which has its own tab and cards). */
export function verificationEntry(job, context) {
  return { id: `verify-${job.id}`, signature: JSON.stringify([job, context.verifyBusy]), render: () => {
    const node = el('article', 'verification-message');
    node.append(el('div', 'chat-question', job.claim), el('div', 'verification-label', 'VÉRIFICATION DEMANDÉE · SOURCES WEB'));
    if (job.status === 'running') {
      node.append(el('p', 'pending', 'Recherche de sources et comparaison des preuves…'), el('p', 'verification-status', 'Tu peux continuer à poser des questions sur la vidéo.'),
        action('secondary cancel-verification', 'Annuler la recherche', 'verify-cancel'));
      return node;
    }
    if (job.status === 'error') {
      const retry = action('secondary verify-again', 'Réessayer', 'verify-retry', { id: job.id });
      retry.disabled = Boolean(context.verifyBusy);
      node.append(el('p', 'verify-error', job.error), retry);
      return node;
    }
    const result = job.result;
    node.append(el('h4', '', ASSESSMENTS[result.assessment] || 'Résultat de la recherche'), el('p', 'chat-answer', result.conclusion));
    for (const [index, source] of result.sources.entries()) {
      const card = el('div', 'source-card');
      card.append(action('source-link', `${source.title} ↗`, 'verify-source', { job: job.id, index }), el('small', '', [source.publisher, source.publishedAt].filter(Boolean).join(' · ')), el('p', '', source.evidence));
      node.append(card);
    }
    if (result.limitations.length) node.append(el('p', 'answer-limits', result.limitations.join(' ')));
    if (job.archiveError) node.append(el('p', 'verify-error', job.archiveError));
    const elapsed = Math.round((result.research?.elapsedMs || job.finishedAt - job.createdAt) / 1000);
    node.append(el('p', 'verification-status', `${plural(result.sources.length, 'source')} · ${elapsed} s`));
    return node;
  } };
}

/** Echo of a question between its submission and its acceptance by the host. */
export function pendingEntry(question) {
  return { id: 'pending-question', signature: question, render: () => {
    const node = el('div', 'pending-message');
    node.append(el('div', 'chat-question', question), el('p', 'pending', 'Je retrouve les passages utiles…'));
    return node;
  } };
}
