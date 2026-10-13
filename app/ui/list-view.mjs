import { plural } from './text.mjs';

/**
 * Rendering by entry instead of rebuilding a whole list (latency audit P6, retention audit 3.1 point 5).
 * A list keeps one {node, signature} per id: an entry whose signature did not change keeps its node, so an
 * open detail block, the scroll position, the focus and a button under the pointer all survive an update.
 * The container only needs children, insertBefore, replaceChild and removeChild: tests drive it without a DOM.
 */
export class KeyedList {
  constructor(container) { this.container = container; this.items = new Map(); }
  /**
   * @param {{id:string,signature:string,render:(previous:any)=>any}[]} entries in display order.
   *   render(previous) may patch and return the previous node, or return a new one.
   * @returns {{created:number,updated:number,kept:number,removed:number}}
   */
  sync(entries) {
    // Removing a focused node fires its blur handlers at once; if one of them asks for a new sync, it is
    // applied after the current one instead of running inside it on a half-updated list.
    if (this.busy) { this.queued = entries; return { created: 0, updated: 0, kept: 0, removed: 0, deferred: true }; }
    this.busy = true;
    try {
      const stats = this.apply(entries);
      while (this.queued) { const later = this.queued; this.queued = null; this.apply(later); }
      return stats;
    } finally { this.busy = false; this.queued = null; }
  }
  apply(entries) {
    const stats = { created: 0, updated: 0, kept: 0, removed: 0 }, next = new Map();
    for (const entry of entries) {
      if (next.has(entry.id)) continue;
      const known = this.items.get(entry.id);
      if (known && known.signature === entry.signature) { next.set(entry.id, known); stats.kept++; continue; }
      const node = entry.render(known?.node ?? null);
      if (known && node !== known.node) this.container.replaceChild(node, known.node);
      next.set(entry.id, { node, signature: entry.signature });
      if (known) stats.updated++; else stats.created++;
    }
    for (const [id, item] of this.items) if (!next.has(id)) { this.container.removeChild(item.node); stats.removed++; }
    // Only what is out of place moves: appending at the end is the common case and touches nothing else.
    let index = 0;
    for (const item of next.values()) {
      const current = this.container.children[index];
      if (current !== item.node) this.container.insertBefore(item.node, current ?? null);
      index++;
    }
    this.items = next;
    return stats;
  }
  clear() { return this.sync([]); }
}

/** The view follows new content only when the reader was already at the bottom. */
export function isNearBottom(box, threshold = 80) {
  return box.scrollHeight - box.scrollTop - box.clientHeight <= threshold;
}

/** The last `limit` items and how many older ones are left out: a long session never draws hundreds of rows. */
export function tail(items, limit) {
  const all = Array.isArray(items) ? items : [], shown = limit > 0 ? all.slice(-limit) : [];
  return { items: shown, olderCount: all.length - shown.length };
}
export function olderPassagesLabel(count) {
  return count > 0 ? `${plural(count, 'passage plus ancien', 'passages plus anciens')} : retrouve-les par la recherche, le résumé ou les citations.` : '';
}

/** Drops the oldest entries of an insertion-ordered Map beyond `max`, sparing the ids still on screen. */
export function trimMap(map, max, keep = new Set()) {
  for (const key of map.keys()) {
    if (map.size <= max) break;
    if (!keep.has(key)) map.delete(key);
  }
  return map;
}

/** Finished questions: the research budget is read again when this number changes, not at every fragment. */
export function settledCount(jobs) {
  return (Array.isArray(jobs) ? jobs : []).filter(job => !['queued', 'running'].includes(job?.status)).length;
}
