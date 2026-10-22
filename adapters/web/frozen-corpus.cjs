/**
 * Web retrieval from a frozen corpus of pages already extracted to text, on the local disk.
 * Reproducible trials use it instead of a live search: the same question always gets the same pages.
 *
 * Corpus format, in the folder given to FrozenCorpusRetrieval:
 *   corpus.json = { "version": 1, "documents": [ { "url", "title", "publisher"?, "publishedAt"?, "file", "queries"? } ] }
 *   - url: the page address; it must be accepted by sourceKey (public https), and is returned without its fragment;
 *   - title: the page title; publisher and publishedAt are free text, kept as written;
 *   - file: relative path, under the corpus folder, of the UTF-8 text already extracted from the page
 *     (no absolute path, no "..", no backslash);
 *   - queries: optional list of exact questions this page answers.
 *
 * Retrieval: pages that declare the query (same normalisation as retrievalQuery, case and accents ignored) come
 * back in corpus order. Otherwise pages are ranked by the number of distinct query words, minus stop words, found in
 * their title or text; ties keep corpus order. At most WEB_DOCUMENT_LIMIT pages, each text cut to WEB_TEXT_MAX_CHARS.
 * A page with an unsafe address, a repeated address (the first one wins) or an empty text is left out.
 *
 * The corpus and all page files are read once, on the first retrieval; an invalid corpus is refused with
 * TVLENS_WEB_CORPUS_INVALID and a message that carries no path. Real pages stay out of Git.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { domainError } = require('../../core/shared/domain-error.cjs');
const { WEB_DOCUMENT_LIMIT, WEB_TEXT_MAX_CHARS, normalizeText, queryKey, clipText } = require('../../core/web-retrieval.cjs');
const { sourceKey } = require('../external-links.cjs');

const TVLENS_WEB_CORPUS_INVALID = 'TVLENS_WEB_CORPUS_INVALID';
const CORPUS_FILE = 'corpus.json';
const CORPUS_VERSION = 1;
const MIN_WORD_LENGTH = 3;
const MIN_SHARED_WORDS = 2;
const STOP_WORDS = new Set([
  'les', 'des', 'une', 'que', 'qui', 'est', 'sont', 'dans', 'sur', 'pour', 'par', 'avec', 'sans', 'pas', 'ses', 'son',
  'ces', 'cette', 'quel', 'quelle', 'quels', 'quelles', 'quoi', 'comment', 'pourquoi', 'aux', 'elle', 'elles', 'ils',
  'nous', 'vous', 'mais', 'donc', 'aussi', 'plus', 'tout', 'tous', 'ont', 'etre', 'avoir', 'peut', 'cela', 'leur', 'leurs',
]);
const NO_PAGE_LIMIT = 'Aucune page du corpus ne correspond à la requête.';
const CUT_COUNT_LIMIT = `Seules les ${WEB_DOCUMENT_LIMIT} pages les plus pertinentes sont conservées.`;
const CUT_TEXT_LIMIT = `Le texte de certaines pages est coupé à ${WEB_TEXT_MAX_CHARS} caractères.`;

const invalid = (message, cause) => domainError(TVLENS_WEB_CORPUS_INVALID, `Corpus web invalide : ${message}`, cause);
const isText = value => typeof value === 'string' && value.trim() !== '';
const isOptionalText = value => value === undefined || typeof value === 'string';

function parseManifest(raw) {
  let manifest;
  try { manifest = JSON.parse(raw); } catch (cause) { throw invalid('JSON illisible.', cause); }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw invalid('objet attendu.');
  if (manifest.version !== CORPUS_VERSION) throw invalid('version non prise en charge.');
  if (!Array.isArray(manifest.documents)) throw invalid('liste de documents manquante.');
  return manifest.documents;
}

function checkDeclaration(entry) {
  const complete = entry && typeof entry === 'object' && isText(entry.url) && isText(entry.title) && isText(entry.file);
  const optional = complete && isOptionalText(entry.publisher) && isOptionalText(entry.publishedAt);
  const queries = optional && (entry.queries === undefined || (Array.isArray(entry.queries) && entry.queries.every(isText)));
  if (!queries) throw invalid('champ manquant ou invalide.');
}

// The text file must stay under the corpus folder: no absolute path, no "..", no backslash.
function pageFilePath(directory, file) {
  const unsafe = file.includes('\\') || file.includes('\0') || path.posix.isAbsolute(file) || path.win32.isAbsolute(file);
  if (unsafe || file.split('/').includes('..')) throw invalid('chemin de page refusé.');
  const root = path.resolve(directory);
  const target = path.resolve(root, file);
  if (!target.startsWith(root + path.sep)) throw invalid('chemin de page refusé.');
  return target;
}

async function loadPage(entry, directory, readFile) {
  const target = pageFilePath(directory, entry.file);
  let text;
  try { text = await readFile(target, 'utf8'); } catch (cause) { throw invalid('fichier de page absent ou illisible.', cause); }
  return { entry, text: String(text) };
}

function pageOf({ entry, text }) {
  const page = { url: sourceKey(entry.url), title: entry.title, text };
  if (entry.publisher !== undefined) page.publisher = entry.publisher;
  if (entry.publishedAt !== undefined) page.publishedAt = entry.publishedAt;
  return page;
}

function wordsOf(value) {
  return normalizeText(value).match(/[a-z0-9]+/g) ?? [];
}

function indexPage(loaded) {
  const page = pageOf(loaded);
  return {
    page,
    declared: new Set((loaded.entry.queries ?? []).map(queryKey)),
    words: new Set(wordsOf(`${page.title} ${page.text}`)),
  };
}

// Pages are checked and read together so that a missing file is refused up front, then filtered in corpus order.
async function loadCorpus(directory, readFile) {
  let raw;
  try { raw = await readFile(path.join(directory, CORPUS_FILE), 'utf8'); } catch (cause) { throw invalid('fichier du corpus illisible.', cause); }
  const entries = parseManifest(String(raw));
  entries.forEach(checkDeclaration);
  const loaded = await Promise.all(entries.map(entry => loadPage(entry, directory, readFile)));
  const seen = new Set();
  const kept = [];
  for (const item of loaded) {
    const key = sourceKey(item.entry.url);
    if (!key || seen.has(key) || !item.text.trim()) continue;
    seen.add(key);
    kept.push(indexPage(item));
  }
  return kept;
}

function queryWords(query) {
  return [...new Set(wordsOf(query).filter(word => word.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(word)))];
}

function rankLexically(pages, query) {
  const words = queryWords(query);
  const threshold = Math.min(MIN_SHARED_WORDS, words.length);
  if (!threshold) return [];
  return pages
    .map((indexed, order) => ({ indexed, order, score: words.filter(word => indexed.words.has(word)).length }))
    .filter(candidate => candidate.score >= threshold)
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .map(candidate => candidate.indexed);
}

function candidatesFor(pages, query) {
  const key = queryKey(query);
  const declared = key ? pages.filter(indexed => indexed.declared.has(key)) : [];
  return declared.length ? declared : rankLexically(pages, query);
}

function answerFrom(candidates) {
  if (!candidates.length) return { documents: [], limits: [NO_PAGE_LIMIT] };
  const limits = [];
  if (candidates.length > WEB_DOCUMENT_LIMIT) limits.push(CUT_COUNT_LIMIT);
  const documents = candidates.slice(0, WEB_DOCUMENT_LIMIT).map(({ page }) => {
    const text = clipText(page.text, WEB_TEXT_MAX_CHARS);
    if (text.length < page.text.length && !limits.includes(CUT_TEXT_LIMIT)) limits.push(CUT_TEXT_LIMIT);
    return { ...page, text };
  });
  return { documents, limits };
}

class FrozenCorpusRetrieval {
  constructor({ directory, readFile = fs.readFile } = {}) {
    if (!isText(directory)) throw invalid('dossier manquant.');
    this.residence = 'local';
    this.directory = directory;
    this.readFile = readFile;
    this.loading = null;
  }

  // The loading promise is kept, failure included: concurrent first calls share one read.
  pages() {
    this.loading ||= loadCorpus(this.directory, this.readFile);
    return this.loading;
  }

  async retrieve({ query, signal } = {}) {
    signal?.throwIfAborted();
    const pages = await this.pages();
    signal?.throwIfAborted();
    return answerFrom(candidatesFor(pages, query));
  }
}

module.exports = { FrozenCorpusRetrieval, TVLENS_WEB_CORPUS_INVALID };
