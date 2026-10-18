const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { readJson, loadCase, sha256 } = require('./perception-replay-input.cjs');

const DIMENSIONS = {
  accuracy: ['correct', 'partial', 'incorrect', 'na'],
  invention: ['absent', 'present', 'na'],
  order: ['correct', 'incorrect', 'na'],
  imageEvidence: ['sufficient', 'insufficient', 'unknown', 'na'],
  speechEvidence: ['sufficient', 'insufficient', 'unknown', 'na'],
  description: ['faithful', 'misdescribed', 'na'],
  abstention: ['none', 'justified', 'unjustified', 'na'],
  references: ['correct', 'incorrect', 'missing', 'na'],
  causality: ['valid', 'violation', 'na'],
  provenance: ['valid', 'violation', 'na'],
};
function check(condition, code) {
  if (!condition) throw Object.assign(Error('Notation du rejeu refusée.'), { code: 'TVLENS_SCORING_' + code });
}
const isNonEmptyText = value => typeof value === 'string' && Boolean(value.trim());
function validateReport(report, manifest, inputs) {
  const valid = condition => check(condition, 'REPORT_INVALID');
  valid(report.version === 1 && report.mode === 'execution' && isNonEmptyText(report.runId));
  valid(typeof report.complete === 'boolean' && ['local', 'codex'].includes(report.backend));
  valid(Array.isArray(report.cases) && report.cases.length === inputs.length);
  for (const [index, entry] of report.cases.entries()) {
    valid(entry && entry.id === manifest.cases[index].id && entry.index === index && isDeepStrictEqual(entry.input, inputs[index]));
    valid(['validated', 'running', 'succeeded', 'refused', 'error', 'cancelled'].includes(entry.status));
    if (entry.request) validateRequest(entry.request, entry.input, valid);
    if (entry.status === 'succeeded') valid(entry.request && entry.result?.observation);
  }
}
function validateRequest(request, input, valid) {
  valid(typeof request.instructions === 'string' && sha256(request.instructions) === request.promptSha256);
  valid(Array.isArray(request.frames));
  let previous = -1;
  for (const frame of request.frames) {
    valid(frame && Number.isInteger(frame.index) && frame.index > previous && isDeepStrictEqual(frame, input.frames[frame.index]));
    previous = frame.index;
  }
}
function validateCaseRows(value, ids, valid) {
  valid(value?.version === 1 && Array.isArray(value.cases));
  const found = new Set();
  for (const row of value.cases) {
    valid(row && ids.includes(row.id) && !found.has(row.id));
    found.add(row.id);
  }
  return found;
}
function citationShape(citation) {
  return citation && isNonEmptyText(citation.id) && Number.isFinite(citation.startMs) && Number.isFinite(citation.endMs);
}
function validateAnnotations(annotations, ids) {
  const valid = condition => check(condition, 'ANNOTATIONS_INVALID');
  valid(validateCaseRows(annotations, ids, valid).size === ids.length);
  for (const row of annotations.cases) {
    valid(isNonEmptyText(row.expected) && isNonEmptyText(row.reason) && Array.isArray(row.citations));
    valid(row.citations.every(citationShape));
  }
}
function validateDimensions(dimensions, valid) {
  valid(dimensions && typeof dimensions === 'object' && !Array.isArray(dimensions));
  valid(Object.keys(dimensions).length === Object.keys(DIMENSIONS).length);
  for (const [name, values] of Object.entries(DIMENSIONS)) {
    valid(dimensions[name] && values.includes(dimensions[name].value) && isNonEmptyText(dimensions[name].reason));
  }
  const abstains = ['justified', 'unjustified'].includes(dimensions.abstention.value);
  if (abstains) valid(dimensions.accuracy.value === 'na');
}
function validateReview(review, ids) {
  const valid = condition => check(condition, 'REVIEW_INVALID');
  validateCaseRows(review, ids, valid);
  valid(isNonEmptyText(review.reviewer));
  for (const row of review.cases) {
    valid(['reviewed', 'unreviewed'].includes(row.status) && isNonEmptyText(row.reason));
    if (row.status === 'unreviewed') {
      valid(row.dimensions === undefined && row.citations === undefined);
      continue;
    }
    validateDimensions(row.dimensions, valid);
    valid(Array.isArray(row.citations) && row.citations.every(citationShape));
    if (row.dimensions.references.value === 'correct') valid(row.citations.length > 0);
    if (row.dimensions.references.value === 'na') valid(row.citations.length === 0);
  }
}
async function loadScoring(options) {
  const manifest = await readJson(options.manifestPath);
  const annotations = await readJson(options.annotationsPath);
  const report = await readJson(options.reportPath);
  const review = await readJson(options.reviewPath);
  for (const [file, code] of [[manifest, 'CORPUS_INVALID'], [annotations, 'ANNOTATIONS_INVALID'],
    [report, 'REPORT_INVALID'], [review, 'REVIEW_INVALID']]) {
    check(file.value && typeof file.value === 'object' && !Array.isArray(file.value), code);
  }
  check(manifest.value.version === 1 && Array.isArray(manifest.value.cases) && manifest.value.cases.length > 0, 'CORPUS_INVALID');
  check(report.value.annotationsSha256 && report.value.g2Eligible === true, 'ANNOTATIONS_NOT_FROZEN');
  check(report.value.annotationsSha256 === annotations.sha256, 'ANNOTATIONS_MISMATCH');
  check(report.value.manifestSha256 === manifest.sha256 && annotations.value.manifestSha256 === manifest.sha256, 'CORPUS_MISMATCH');
  check(review.value.reportSha256 === report.sha256 && review.value.runId === report.value.runId, 'STALE_REVIEW');
  check(review.value.manifestSha256 === manifest.sha256 && review.value.annotationsSha256 === annotations.sha256, 'STALE_REVIEW');
  check(new Set(manifest.value.cases.map(item => item?.id)).size === manifest.value.cases.length, 'CORPUS_INVALID');
  const inputs = [];
  for (const item of manifest.value.cases) inputs.push((await loadCase(item, path.dirname(options.manifestPath))).input);
  validateReport(report.value, manifest.value, inputs);
  const ids = manifest.value.cases.map(item => item.id);
  validateAnnotations(annotations.value, ids);
  validateReview(review.value, ids);
  return { manifest, annotations, report, review, inputs };
}
module.exports = { DIMENSIONS, check, isNonEmptyText, isDeepStrictEqual, loadScoring };
