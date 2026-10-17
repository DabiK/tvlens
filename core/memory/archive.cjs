const { domainError } = require('../shared/domain-error.cjs');

// The saved state of a viewing memory (session.json). The session manifest keeps its own format.
const ARCHIVE_FORMAT = 'tvlens-viewing-memory';
const ARCHIVE_VERSION = 1;
const TVLENS_ARCHIVE_INVALID = 'TVLENS_ARCHIVE_INVALID';
const PASSAGE_ID = /^moment-\d+$/;

// A saved state a restoration can read without guessing: a file that parses but has another shape is
// refused in plain words instead of failing half-way on a TypeError.
const record = value => Boolean(value) && typeof value === 'object';
const passageLike = passage => record(passage) && typeof passage.id === 'string' && PASSAGE_ID.test(passage.id)
  && Number.isFinite(passage.startMs) && Number.isFinite(passage.endMs);
const listOf = (value, valid) => value == null || (Array.isArray(value) && value.every(valid));
const restorable = saved => record(saved) && typeof saved.id === 'string' && Array.isArray(saved.segments)
  && saved.segments.every(passageLike) && listOf(saved.history, passageLike) && listOf(saved.questions, record);
const invalid = () => domainError(TVLENS_ARCHIVE_INVALID, 'Archive illisible.');

// Version 1 writes every key of the model as it is, passages included: removing one from the disk takes a
// version 2. The envelope is shallow, so that a pending state costs no second copy of its passages.
function toArchive(model) {
  return { format: ARCHIVE_FORMAT, version: ARCHIVE_VERSION, ...model };
}

// The model a restoration starts from, or a refusal before anything is restored. A document without either
// marker was saved before versions existed and is handed back exactly as saved: an absent retention still
// says that its media were never meant to be kept. One marker alone, another format or another version is
// never read as such a document.
function fromArchive(archived) {
  if (!record(archived)) throw invalid();
  if (!Object.hasOwn(archived, 'format') && !Object.hasOwn(archived, 'version')) {
    if (!restorable(archived)) throw invalid();
    return archived;
  }
  const { format, version, ...model } = archived;
  if (format !== ARCHIVE_FORMAT || version !== ARCHIVE_VERSION || !restorable(model)) throw invalid();
  return model;
}

module.exports = { toArchive, fromArchive, ARCHIVE_FORMAT, ARCHIVE_VERSION, TVLENS_ARCHIVE_INVALID };
