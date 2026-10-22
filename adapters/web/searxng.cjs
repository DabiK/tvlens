/**
 * Web retrieval through a self-hosted SearXNG, queried on its JSON API (GET <url>/search?q=…&format=json).
 * The query leaves the machine through the engines SearXNG asks, hence residence 'hybrid'.
 *
 * Failures of the search itself (unreachable, status other than 200, invalid or oversized JSON, deadline) reject with
 * TVLENS_WEB_SEARCH_UNAVAILABLE and a fixed message: a network error may carry the address, and a reply body is
 * provider content, so neither is kept, not even as a cause. A cancellation by the caller's signal rejects with the
 * signal's own reason and is never turned into an unavailable search.
 *
 * Results whose address safeExternalUrl refuses, or that repeat an earlier one (sourceKey), are dropped; the first
 * OPENED_RESULT_LIMIT are opened together, each within PAGE_TIMEOUT_MS. Redirects are followed by hand, at most
 * REDIRECT_LIMIT, each target checked again before it is requested. Only a 200 in text/html or text/plain is read, up to
 * PAGE_BYTE_LIMIT, in the charset it declares when TextDecoder knows it. Only pages actually read come back, at most
 * WEB_DOCUMENT_LIMIT, in result order; limits count the pages opened but not read, without any address.
 */
const { WEB_DOCUMENT_LIMIT } = require('../../core/web-retrieval.cjs');
const { safeExternalUrl, sourceKey } = require('../external-links.cjs');
const { MIN_PAGE_TEXT_CHARS, htmlPage, plainText, titleText } = require('./html-text.cjs');

const TVLENS_WEB_SEARCH_UNAVAILABLE = 'TVLENS_WEB_SEARCH_UNAVAILABLE';
const SEARCH_TIMEOUT_MS = 5000;
const SEARCH_BYTE_LIMIT = 1024 * 1024;
const USER_AGENT = 'TVLens/1.0 (self-hosted web retrieval)';
const SEARCH_HEADERS = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
const PAGE_HEADERS = { 'User-Agent': USER_AGENT, Accept: 'text/html, text/plain;q=0.9' };
const OPENED_RESULT_LIMIT = 5;
const PAGE_TIMEOUT_MS = 4000;
const PAGE_BYTE_LIMIT = 1.5 * 1024 * 1024;
const READABLE_TYPES = new Set(['text/html', 'text/plain']);
const CHARSET = /;\s*charset\s*=\s*"?([^";\s]+)/i;
const REDIRECT_LIMIT = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// Each sentence gives a count only: an address or a provider detail would leak what was searched.
const UNREAD_LIMITS = {
  slow: count => `Pages trop lentes à répondre : ${count}.`,
  refused: count => `Pages non suivies, redirigées vers une adresse refusée : ${count}.`,
  unreadable: count => `Pages ouvertes sans contenu HTML ou texte lisible : ${count}.`,
  short: count => `Pages au texte trop court ou sans titre : ${count}.`,
};

const unavailable = () => Object.assign(new Error('Recherche web indisponible.'), { code: TVLENS_WEB_SEARCH_UNAVAILABLE });
const anySignal = (signal, deadline) => (signal ? AbortSignal.any([signal, deadline]) : deadline);

function searchUrl(base, query) {
  const endpoint = new URL(base);
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + '/search';
  endpoint.search = new URLSearchParams({ q: String(query ?? ''), format: 'json' }).toString();
  endpoint.hash = '';
  return endpoint.href;
}

async function discard(response) {
  try { await response.body?.cancel(); } catch {
    // The body is dropped unread; failing to release it early changes nothing for the caller.
  }
}

async function cancel(reader) {
  try { await reader.cancel(); } catch {
    // The rest of the body is unwanted; a stream that is already closed or errored has nothing more to release.
  }
}

// Reads at most limit bytes, then cancels the stream so that the remainder is never downloaded.
async function readText(body, limit, decoder) {
  if (!body) return { text: '', truncated: false };
  const reader = body.getReader();
  let size = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { text: text + decoder.decode(), truncated: false };
    if (value.byteLength > limit - size) {
      text += decoder.decode(value.subarray(0, limit - size));
      await cancel(reader);
      return { text, truncated: true };
    }
    size += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
}

const isResult = result => result !== null && typeof result === 'object'
  && typeof result.url === 'string' && typeof result.title === 'string';

function resultsOf(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  const results = data?.results;
  return Array.isArray(results) && results.every(isResult) ? results : null;
}

const mediaType = response => (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();

// An unknown label falls back to UTF-8, the encoding of most pages, rather than losing the page.
function decoderFor(response) {
  const label = CHARSET.exec(response.headers.get('content-type') ?? '')?.[1];
  try { return new TextDecoder(label ?? 'utf-8'); } catch { return new TextDecoder('utf-8'); }
}

// A page is a source only once its text was read: a search result alone is never returned as a document.
function pageOf(candidate, url, type, raw) {
  const page = type === 'text/html' ? htmlPage(raw) : { title: '', text: plainText(raw) };
  const title = page.title || titleText(candidate.title);
  if (page.text.length < MIN_PAGE_TEXT_CHARS || !title) return { unread: 'short' };
  return { document: { url: sourceKey(url), title, text: page.text } };
}

// The location is resolved against the page that sent it, then checked like any result address.
function redirectTarget(location, base) {
  if (!location) return null;
  try { return safeExternalUrl(new URL(location, base).href); } catch { return null; }
}

// Documents keep the order of the results whatever order the pages answered in. Two results that lead to the same
// final page give one document; the repeat is neither a second source nor a failure.
function retrievalOf(outcomes) {
  const documents = [];
  const seen = new Set();
  const unread = {};
  for (const outcome of outcomes) {
    if (outcome.unread) unread[outcome.unread] = (unread[outcome.unread] ?? 0) + 1;
    else if (!seen.has(outcome.document.url) && documents.length < WEB_DOCUMENT_LIMIT) {
      seen.add(outcome.document.url);
      documents.push(outcome.document);
    }
  }
  const limits = Object.keys(UNREAD_LIMITS).filter(kind => unread[kind]).map(kind => UNREAD_LIMITS[kind](unread[kind]));
  return { documents, limits };
}

// A search result is only a lead: it is opened when its address is public https and not a repeat of an earlier one.
function candidatesOf(results) {
  const seen = new Set();
  const candidates = [];
  for (const result of results) {
    const key = sourceKey(result.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push({ href: safeExternalUrl(key), title: result.title });
    if (candidates.length === OPENED_RESULT_LIMIT) break;
  }
  return candidates;
}

class SearxngRetrieval {
  #url;
  #fetch;
  #setTimer;
  #clearTimer;

  constructor({ url, fetchImpl = fetch, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.residence = 'hybrid';
    this.#url = url;
    this.#fetch = fetchImpl;
    this.#setTimer = setTimer;
    this.#clearTimer = clearTimer;
  }

  async retrieve({ query, signal } = {}) {
    signal?.throwIfAborted();
    const results = await this.#search(query, signal);
    return retrievalOf(await this.#openAll(candidatesOf(results), signal));
  }

  // #open never rejects, so every opening is over, cancelled ones included, before the caller gets control back.
  async #openAll(candidates, signal) {
    const outcomes = await Promise.all(candidates.map(candidate => this.#open(candidate, signal)));
    signal?.throwIfAborted();
    return outcomes;
  }

  // The deadline covers the redirects and the body: a page that starts answering but never ends is a slow page.
  async #open(candidate, signal) {
    const expired = new AbortController();
    const timer = this.#setTimer(() => expired.abort(), PAGE_TIMEOUT_MS);
    try {
      return await this.#read(candidate, anySignal(signal, expired.signal));
    } catch {
      // A cancellation is the caller's decision, not a page failure: #openAll rethrows it once every opening is over.
      return { unread: expired.signal.aborted ? 'slow' : 'unreadable' };
    } finally {
      this.#clearTimer(timer);
    }
  }

  // Redirects are followed by hand so that every hop is checked before it is requested.
  async #follow(href, signal) {
    let target = href;
    for (let hop = 0; hop <= REDIRECT_LIMIT; hop += 1) {
      const response = await this.#fetch(target, { headers: PAGE_HEADERS, redirect: 'manual', signal });
      if (!REDIRECT_STATUSES.has(response.status)) return { response, url: target };
      await discard(response);
      target = redirectTarget(response.headers.get('location'), target);
      if (!target) return { unread: 'refused' };
    }
    return { unread: 'unreadable' };
  }

  async #read(candidate, signal) {
    const reached = await this.#follow(candidate.href, signal);
    if (reached.unread) return reached;
    const { response, url } = reached;
    const type = mediaType(response);
    if (response.status !== 200 || !READABLE_TYPES.has(type)) {
      await discard(response);
      return { unread: 'unreadable' };
    }
    const { text } = await readText(response.body, PAGE_BYTE_LIMIT, decoderFor(response));
    return pageOf(candidate, url, type, text);
  }

  async #search(query, signal) {
    const expired = new AbortController();
    const timer = this.#setTimer(() => expired.abort(), SEARCH_TIMEOUT_MS);
    let results = null;
    try {
      results = await this.#fetchResults(query, anySignal(signal, expired.signal));
    } catch {
      // A network error may name the address; only the fixed refusal below leaves the adapter.
    } finally {
      this.#clearTimer(timer);
    }
    signal?.throwIfAborted();
    if (!results) throw unavailable();
    return results;
  }

  // The search service sits at a fixed configured address: a redirect away from it is a failure, not a hop to follow.
  async #fetchResults(query, signal) {
    const response = await this.#fetch(searchUrl(this.#url, query), { headers: SEARCH_HEADERS, redirect: 'error', signal });
    if (response.status !== 200) {
      await discard(response);
      return null;
    }
    const body = await readText(response.body, SEARCH_BYTE_LIMIT, new TextDecoder());
    return body.truncated ? null : resultsOf(body.text);
  }
}

module.exports = { SearxngRetrieval, TVLENS_WEB_SEARCH_UNAVAILABLE, SEARCH_TIMEOUT_MS, SEARCH_BYTE_LIMIT, PAGE_BYTE_LIMIT,
  PAGE_TIMEOUT_MS };
