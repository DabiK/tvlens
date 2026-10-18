const { DIMENSIONS, loadScoring, isDeepStrictEqual } = require('./perception-replay-scoring-input.cjs');

function aggregate(cases) {
  const reviewed = cases.filter(item => item.review.status === 'reviewed');
  const dimensions = {};
  for (const [name, values] of Object.entries(DIMENSIONS)) {
    const counts = Object.fromEntries(values.map(value => [value, 0]));
    for (const item of reviewed) counts[item.review.dimensions[name].value]++;
    dimensions[name] = { counts, denominator: reviewed.length - counts.na, notApplicable: counts.na };
  }
  return { totals: { cases: cases.length, reviewed: reviewed.length, notEvaluated: cases.length - reviewed.length,
    successes: reviewed.filter(item => item.success).length, successDenominator: reviewed.length,
    justifiedAbstentions: reviewed.filter(item => item.review.dimensions.abstention.value === 'justified').length }, dimensions };
}
function succeeds(entry, row) {
  const values = Object.fromEntries(Object.entries(row.dimensions).map(([name, judgment]) => [name, judgment.value]));
  const fails = { order: ['incorrect'], description: ['misdescribed'], references: ['incorrect', 'missing'],
    causality: ['violation'], provenance: ['violation'], imageEvidence: ['insufficient', 'unknown'], speechEvidence: ['insufficient', 'unknown'] };
  return entry.status === 'succeeded' && values.accuracy === 'correct' && values.invention === 'absent'
    && values.abstention === 'none' && Object.entries(fails).every(([name, bad]) => !bad.includes(values[name]));
}
function citationChecks(row, cases) {
  return (row.citations || []).map(citation => {
    const target = cases.find(item => item.id === citation.id)?.input;
    const intervalValid = Boolean(target && citation.startMs >= target.startMs && citation.endMs <= target.endMs
      && citation.endMs > citation.startMs);
    return { ...citation, intervalValid };
  });
}
async function scoreReplay(options) {
  const { manifest, annotations, report, review } = await loadScoring(options);
  const cases = report.value.cases.map(entry => {
    const row = review.value.cases.find(item => item.id === entry.id)
      || { id: entry.id, status: 'unreviewed', reason: 'Aucune revue fournie.' };
    const evaluated = row.status === 'reviewed';
    const checks = citationChecks(row, report.value.cases);
    return { id: entry.id, status: entry.status, error: entry.error || null, review: row, input: entry.input, citationChecks: checks,
      expected: annotations.value.cases.find(item => item.id === entry.id),
      received: entry.request ? { frames: entry.request.frames, transcript: entry.input.transcript } : null,
      evaluation: evaluated ? 'evaluated' : 'not-evaluated', success: evaluated ? succeeds(entry, row) && checks.every(item => item.intervalValid) : null };
  });
  return { version: 1, execution: { complete: report.value.complete, backend: report.value.backend,
    code: report.value.code, config: report.value.config }, identity: { manifestSha256: manifest.sha256, annotationsSha256: annotations.sha256,
    reportSha256: report.sha256, reviewSha256: review.sha256, runId: report.value.runId }, cases, ...aggregate(cases) };
}
const RANKS = {
  accuracy: { correct: 2, partial: 1, incorrect: 0 }, invention: { absent: 1, present: 0 },
  order: { correct: 1, incorrect: 0 }, imageEvidence: { sufficient: 1, insufficient: 0 },
  speechEvidence: { sufficient: 1, insufficient: 0 }, description: { faithful: 1, misdescribed: 0 },
  abstention: { none: 1, justified: 1, unjustified: 0 }, references: { correct: 1, incorrect: 0, missing: 0 },
  causality: { valid: 1, violation: 0 }, provenance: { valid: 1, violation: 0 },
};
const VIOLATIONS = ['causality', 'provenance'];
function violations(item) {
  if (item?.evaluation !== 'evaluated') return [];
  return VIOLATIONS.filter(name => item.review.dimensions[name].value === 'violation');
}
function pairing(reference, candidate) {
  if (!reference) return 'candidate-only';
  if (!candidate) return 'reference-only';
  if (!isDeepStrictEqual(reference.input, candidate.input)) return 'input-mismatch';
  if (!isDeepStrictEqual(reference.expected, candidate.expected)) return 'annotation-mismatch';
  return 'paired';
}
function coverage(reference, candidate) {
  const before = reference?.evaluation === 'evaluated', after = candidate?.evaluation === 'evaluated';
  if (before && after) return 'both-reviewed';
  if (before) return 'reference-only-reviewed';
  if (after) return 'candidate-only-reviewed';
  return 'neither-reviewed';
}
function compareCase(id, reference, candidate, dimensions) {
  const row = { id, pairing: pairing(reference, candidate), coverage: coverage(reference, candidate),
    changes: [], regressions: [], newViolations: [] };
  if (row.pairing !== 'paired' || row.coverage !== 'both-reviewed') return row;
  row.newViolations = violations(candidate).filter(name => !violations(reference).includes(name));
  for (const name of Object.keys(DIMENSIONS)) {
    const before = reference.review.dimensions[name].value, after = candidate.review.dimensions[name].value;
    const beforeRank = RANKS[name][before], afterRank = RANKS[name][after];
    const comparable = beforeRank !== undefined && afterRank !== undefined;
    if (comparable) {
      dimensions[name].denominator++;
      if (afterRank < beforeRank) dimensions[name].regressions++;
      if (afterRank > beforeRank) dimensions[name].improvements++;
    } else dimensions[name].notComparable++;
    if (before !== after) row.changes.push({ dimension: name, reference: before, candidate: after,
      regression: comparable ? afterRank < beforeRank : null });
    if ((comparable && afterRank < beforeRank) || row.newViolations.includes(name)) row.regressions.push(name);
  }
  return row;
}
function violationCases(result) {
  return result.cases.map(item => ({ id: item.id, dimensions: violations(item) })).filter(item => item.dimensions.length > 0);
}
async function compareReplays(options) {
  const reference = await scoreReplay(options.reference);
  const candidate = await scoreReplay(options.candidate);
  const ids = [...new Set([...reference.cases, ...candidate.cases].map(item => item.id))];
  const dimensions = Object.fromEntries(Object.keys(DIMENSIONS).map(name => [name,
    { denominator: 0, notComparable: 0, regressions: 0, improvements: 0 }]));
  const comparisons = ids.map(id => compareCase(id, reference.cases.find(item => item.id === id),
    candidate.cases.find(item => item.id === id), dimensions));
  const paired = comparisons.filter(item => item.pairing === 'paired');
  return { version: 1, reference, candidate, comparisons,
    paired: { cases: paired.length, bothReviewed: paired.filter(item => item.coverage === 'both-reviewed').length, dimensions },
    regressions: comparisons.filter(item => item.regressions.length > 0).map(item => ({ id: item.id, dimensions: item.regressions })),
    violations: { reference: violationCases(reference), candidate: violationCases(candidate) } };
}
module.exports = { scoreReplay, compareReplays };
if (require.main === module) {
  require('./perception-replay-scoring-cli.cjs').main(process.argv.slice(2), module.exports).then(code => { process.exitCode = code; });
}
