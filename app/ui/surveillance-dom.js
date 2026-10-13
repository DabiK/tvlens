import { element as el, action, keepOpen } from './format.js';

/**
 * DOM of the surveillance: result cards (discreet stack and panel) and history rows, from the view model of
 * surveillance-view.mjs. Text only, effects by data-action. A verification and a video signal never share
 * a look: the kind is an attribute of the card, styled apart, and a signal has no source area at all.
 */
function origin(item, withQuote) {
  const row = el('li', 'watch-item');
  row.append(action('reference', `${item.timeLabel} ↗`, 'replay', { id: item.passageId, start: item.startMs }));
  if (item.assessmentLabel) row.append(el('span', 'assessment', item.assessmentLabel));
  if (withQuote && item.quote) row.append(el('q', 'watch-quote', item.quote));
  return row;
}

/**
 * compact: the card of the bottom-left stack (two or three sentences, first sources, a way to the detail).
 * The stack only ever receives sourced verifications; a signal is drawn in the panel, in full.
 */
export function cardNode(card, { compact = false } = {}) {
  const node = el('article', 'watch-card');
  node.dataset.kind = card.kind; node.dataset.key = card.key; node.dataset.lot = card.id;
  const head = el('header', 'watch-card-head');
  head.append(el('span', 'watch-card-label', card.label.toUpperCase()), el('span', 'watch-card-time', card.intervalLabel));
  if (compact) { const close = action('watch-card-close', '×', 'watch-dismiss', { key: card.key }); close.setAttribute('aria-label', 'Fermer cette carte'); head.append(close); }
  node.append(head, el('p', 'watch-card-text', card.text));
  if (card.note) node.append(el('p', 'hint watch-card-note', card.note));
  const items = el('ul', 'watch-items');
  for (const item of compact ? card.items.slice(0, 2) : card.items) items.append(origin(item, !compact));
  node.append(items);
  if (card.sources.length) {
    const sources = el('div', 'watch-sources');
    for (const source of compact ? card.sources.slice(0, 2) : card.sources) {
      const link = action('source-link', `${source.title} ↗`, 'watch-source', { lot: card.id, index: source.index });
      if (compact) { sources.append(link); continue; }
      const box = el('div', 'source-card');
      box.append(link, el('small', '', [source.meta, source.relationLabel].filter(Boolean).join(' · ')), el('p', '', source.evidence));
      sources.append(box);
    }
    node.append(sources);
  }
  if (compact) node.append(action('link watch-card-more', 'Détail et sources ↗', 'watch-show-lot', { lot: card.id }));
  else if (card.uncertainties.length) node.append(el('p', 'answer-limits', card.uncertainties.join(' ')));
  return node;
}

export function cardEntry(card, options = {}) {
  const { remainingMs, ...stable } = card;
  return { id: card.key, signature: JSON.stringify([stable, options.compact]), render: previous => keepOpen(previous, cardNode(card, options)) };
}

export function historyEntry(row) {
  return { id: row.id, signature: JSON.stringify(row), render: () => {
    const node = el('article', 'watch-row');
    node.dataset.state = row.state; node.dataset.id = row.id;
    const head = el('header', 'watch-row-head');
    if (row.passageId) head.append(action('reference', `${row.timeLabel} ↗`, 'replay', { id: row.passageId, start: row.startMs }));
    const chip = el('span', 'state-chip', row.stateLabel);
    chip.dataset.state = row.state;
    head.append(chip);
    if (row.assessmentLabel) head.append(el('span', 'assessment', row.assessmentLabel));
    if (row.mentionLabel) head.append(el('small', 'hint', row.mentionLabel));
    node.append(head, el('p', 'watch-statement', row.statement));
    if (row.quote) { const quote = el('p', 'hint'); quote.append(el('q', 'watch-quote', row.quote)); if (row.fieldLabel) quote.append(document.createTextNode(` · ${row.fieldLabel}`)); node.append(quote); }
    if (row.conclusion) node.append(el('p', 'watch-conclusion', row.conclusion));
    if (row.reason) node.append(el('p', 'watch-reason', row.reason));
    if (row.error) node.append(el('p', 'verify-error', row.error));
    const actions = el('div', 'watch-row-actions');
    if (row.canRetry) actions.append(action('secondary', 'Relancer', 'watch-retry', { id: row.id }));
    if (row.state === 'sourced' && row.lotId) actions.append(action('link', 'Voir les sources ↑', 'watch-show-lot', { lot: row.lotId }));
    if (actions.childElementCount) node.append(actions);
    return node;
  } };
}

export function filterEntry(filter, active) {
  return { id: filter.key, signature: JSON.stringify([filter, active]), render: () => {
    const button = action('watch-filter', `${filter.label} · ${filter.count}`, 'watch-filter', { filter: filter.key });
    button.setAttribute('aria-pressed', String(active));
    return button;
  } };
}

export function gapEntry(gap) {
  return { id: gap.id, signature: JSON.stringify(gap), render: () => {
    const row = el('p', 'hint watch-gap', gap.label);
    if (gap.canRetry) row.append(document.createTextNode(' '), action('link', 'Relire ce passage', 'watch-retry', { id: gap.id }));
    return row;
  } };
}
