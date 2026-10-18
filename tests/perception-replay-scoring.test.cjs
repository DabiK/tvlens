const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { runReplay } = require('../scripts/replay-local-perception.cjs');
const { CodexPerception } = require('../adapters/codex-perception.cjs');
const { scoreReplay, compareReplays } = require('../scripts/score-perception-replay.cjs');

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const judgment = (value, reason = 'Jugement humain fictif expliqué pour ce cas.') => ({ value, reason });
function reviewed(id, overrides = {}) {
  const values = { accuracy: 'correct', invention: 'absent', order: 'correct', imageEvidence: 'sufficient',
    speechEvidence: 'na', description: 'faithful', abstention: 'none', references: 'na', causality: 'valid', provenance: 'valid',
    ...overrides };
  return { id, status: 'reviewed', reason: 'Revue fictive de la sortie exacte.',
    dimensions: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, judgment(value)])), citations: [] };
}
async function fixture(t, ids = ['correct']) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-replay-scoring-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const manifestPath = path.join(root, 'manifest.json');
  const annotationsPath = path.join(root, 'annotations.json');
  const reportPath = path.join(root, 'run', 'campaign.json');
  const reviewPath = path.join(root, 'review.json');
  const media = { startMs: 0, endMs: 2000, audio: null,
    frames: [{ atMs: 0, dataUrl: 'data:image/jpeg;base64,QUJD' }, { atMs: 2000, dataUrl: 'data:image/jpeg;base64,REVG' }] };
  const raw = JSON.stringify(media);
  await fs.writeFile(path.join(root, 'media.json'), raw);
  const manifest = { version: 1, cases: ids.map(id => ({ id, startMs: 0, endMs: 2000,
    media: { path: 'media.json', sha256: hash(raw) },
    provenance: { kind: 'tvlens-capture', sessionId: 'fiction', passageId: id },
    transcript: { text: '', availability: 'absent', limits: 'Fixture muette.' },
    context: { value: null, limits: 'Aucun contexte dans cette fixture.' },
    lightweight: { value: false, source: 'explicit-default' } })) };
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  const manifestSha256 = hash(await fs.readFile(manifestPath));
  const annotations = { version: 1, manifestSha256, cases: ids.map(id => ({ id,
    expected: 'Le rectangle descend puis revient ; aucune montée initiale.', reason: 'Attendu fictif figé avant le rejeu.', citations: [] })) };
  await fs.writeFile(annotationsPath, JSON.stringify(annotations));
  const report = await runReplay({ manifestPath, annotationsPath, outputDir: path.dirname(reportPath),
    backend: 'codex', execute: true, model: 'fixture' }, {
    providerDependencies: { CodexPerception: class extends CodexPerception {
      constructor(options) {
        super({ ...options, agent: { answer: async () => ({ topic: 'Rectangle', summary: 'Le rectangle monte puis revient.',
          visual: 'Rectangle descend monte revient.', uncertainty: '', continuity: 'change', topicSummary: 'Mouvement fictif.' }), close() {} } });
      }
    } },
  });
  const review = { version: 1, manifestSha256, annotationsSha256: report.annotationsSha256,
    reportSha256: hash(await fs.readFile(reportPath)), runId: report.runId, reviewer: 'Lecteur fictif', cases: ids.map(id => reviewed(id)) };
  const state = { root, manifest, annotations, report, review,
    options: { manifestPath, annotationsPath, reportPath, reviewPath } };
  state.saveReview = () => fs.writeFile(reviewPath, JSON.stringify(state.review));
  await state.saveReview();
  return state;
}

test('scoring binds a human review to frozen annotations and the exact production replay report', async t => {
  const f = await fixture(t);
  const result = await scoreReplay(f.options);
  assert.equal(result?.totals?.reviewed, 1);
  assert.equal(result.totals.successes, 1);
  assert.equal(result.identity.reportSha256, f.review.reportSha256);
  assert.equal(result.identity.annotationsSha256, f.report.annotationsSha256);
  assert.equal(result.identity.reviewSha256, hash(await fs.readFile(f.options.reviewPath)));
  assert.equal(result.cases[0].review.reason, f.review.cases[0].reason);
  assert.deepEqual(result.cases[0].received.frames, f.report.cases[0].request.frames);
  assert.deepEqual(result.dimensions.accuracy, { counts: { correct: 1, partial: 0, incorrect: 0, na: 0 }, denominator: 1, notApplicable: 0 });
});

async function saveReport(f, rebind = false) {
  await fs.writeFile(f.options.reportPath, JSON.stringify(f.report, null, 2));
  if (rebind) {
    f.review.reportSha256 = hash(await fs.readFile(f.options.reportPath));
    f.review.runId = f.report.runId;
    await f.saveReview();
  }
}

test('stale reviews reject modified results, inputs, run identities and review fingerprints', async t => {
  const f = await fixture(t);
  const original = structuredClone(f.report);
  const changes = [
    report => { report.cases[0].result.observation.visual = 'Autre résultat'; },
    report => { report.cases[0].input.frames[0].sha256 = hash('changed'); },
    report => { report.runId = 'other-run'; },
    report => { report.code.sha = 'b'.repeat(40); },
    report => { report.config.model = 'other-model'; },
  ];
  for (const mutate of changes) {
    f.report = structuredClone(original);
    await saveReport(f);
    assert.equal(hash(await fs.readFile(f.options.reportPath)), f.review.reportSha256);
    assert.equal((await scoreReplay(f.options)).totals.reviewed, 1);
    mutate(f.report);
    await saveReport(f);
    await assert.rejects(scoreReplay(f.options), { code: 'TVLENS_SCORING_STALE_REVIEW' });
  }
  f.report = original;
  await saveReport(f);
  for (const field of ['annotationsSha256', 'manifestSha256', 'reportSha256', 'runId']) {
    assert.equal((await scoreReplay(f.options)).totals.reviewed, 1);
    const saved = f.review[field];
    f.review[field] = hash('stale');
    await f.saveReview();
    await assert.rejects(scoreReplay(f.options), { code: 'TVLENS_SCORING_STALE_REVIEW' }, field);
    f.review[field] = saved;
    await f.saveReview();
    assert.equal((await scoreReplay(f.options)).totals.reviewed, 1);
  }
});

test('missing pre-inference fingerprints cannot be supplied after the replay and changed annotations are refused', async t => {
  const f = await fixture(t);
  const original = structuredClone(f.report);
  for (const mutation of [report => { delete report.annotationsSha256; }, report => { report.g2Eligible = false; }]) {
    f.report = structuredClone(original);
    mutation(f.report);
    await saveReport(f, true);
    await assert.rejects(scoreReplay(f.options), { code: 'TVLENS_SCORING_ANNOTATIONS_NOT_FROZEN' });
  }
  f.report = original;
  await saveReport(f, true);
  await fs.appendFile(f.options.annotationsPath, '\n');
  await assert.rejects(scoreReplay(f.options), { code: 'TVLENS_SCORING_ANNOTATIONS_MISMATCH' });
});

test('corpus changes and rebound reports with inconsistent inputs or selected images are refused', async t => {
  const f = await fixture(t);
  await fs.appendFile(f.options.manifestPath, '\n');
  await assert.rejects(scoreReplay(f.options), { code: 'TVLENS_SCORING_CORPUS_MISMATCH' });
  await fs.writeFile(f.options.manifestPath, JSON.stringify(f.manifest));
  const original = structuredClone(f.report);
  for (const mutate of [
    report => { report.cases[0].input.startMs = 100; },
    report => { report.cases[0].request.frames[0].atMs = 100; },
    report => { report.cases[0].request.promptSha256 = hash('other-prompt'); },
    report => { report.cases.push(report.cases[0]); },
    report => { report.mode = 'validation'; },
  ]) {
    f.report = structuredClone(original);
    mutate(f.report);
    await saveReport(f, true);
    await assert.rejects(scoreReplay(f.options), { code: 'TVLENS_SCORING_REPORT_INVALID' });
  }
  f.report = original;
  await saveReport(f, true);
  await fs.writeFile(path.join(f.root, 'media.json'), '{}');
  await assert.rejects(scoreReplay(f.options), { code: 'TVLENS_REPLAY_HASH_MISMATCH' });
});

test('human dimensions distinguish correct, partial, false, invented, wrong order, abstention and unreviewed cases', async t => {
  const ids = ['correct', 'partial', 'false', 'invented', 'order', 'justified', 'unjustified', 'unreviewed'];
  const f = await fixture(t, ids);
  f.review.cases = [reviewed('correct'), reviewed('partial', { accuracy: 'partial' }),
    reviewed('false', { accuracy: 'incorrect', description: 'misdescribed' }),
    reviewed('invented', { invention: 'present' }), reviewed('order', { order: 'incorrect' }),
    reviewed('justified', { accuracy: 'na', invention: 'na', order: 'na', description: 'na', imageEvidence: 'insufficient', abstention: 'justified' }),
    reviewed('unjustified', { accuracy: 'na', invention: 'na', order: 'na', description: 'na', abstention: 'unjustified' }),
    { id: 'unreviewed', status: 'unreviewed', reason: 'Revue encore absente.' }];
  await f.saveReview();
  const result = await scoreReplay(f.options);
  assert.deepEqual(result.totals, { cases: 8, reviewed: 7, notEvaluated: 1, successes: 1, successDenominator: 7, justifiedAbstentions: 1 });
  assert.deepEqual(result.cases.map(item => item.success), [true, false, false, false, false, false, false, null]);
  assert.deepEqual(result.dimensions.accuracy, { counts: { correct: 3, partial: 1, incorrect: 1, na: 2 }, denominator: 5, notApplicable: 2 });
  assert.equal(result.dimensions.order.denominator, 5);
  assert.equal(result.dimensions.speechEvidence.denominator, 0);
  assert.equal(result.dimensions.speechEvidence.notApplicable, 7);
  assert.equal(result.cases[3].review.dimensions.accuracy.value, 'correct');
  assert.equal(result.cases[2].review.dimensions.description.value, 'misdescribed');
  assert.equal(result.cases[5].review.dimensions.imageEvidence.value, 'insufficient');
  // Mêmes mots dans toutes les sorties, jugements humains différents : aucune notation lexicale.
  assert.equal(new Set(f.report.cases.map(item => item.result.observation.visual)).size, 1);
  assert.equal(result.cases[7].evaluation, 'not-evaluated');
});

test('omitted reviews remain explicit and no applicable dimension acquires an implicit success', async t => {
  const f = await fixture(t, ['one', 'two']);
  f.review.cases = [];
  await f.saveReview();
  const result = await scoreReplay(f.options);
  assert.equal(result.totals.reviewed, 0);
  assert.equal(result.totals.successes, 0);
  assert.equal(result.totals.successDenominator, 0);
  assert.equal(result.totals.notEvaluated, 2);
  assert.equal(result.dimensions.accuracy.denominator, 0);
  assert.ok(result.cases.every(item => item.evaluation === 'not-evaluated' && item.success === null));
});

test('review validation rejects ambiguous rows, unknown values, missing justifications and incompatible abstention', async t => {
  const f = await fixture(t);
  const original = structuredClone(f.review);
  const changes = [
    review => { review.version = 2; },
    review => { review.reviewer = ''; },
    review => { review.cases.push(review.cases[0]); },
    review => { review.cases[0].id = 'outside'; },
    review => { review.cases[0].reason = ' '; },
    review => { review.cases[0].dimensions.accuracy.value = 'good'; },
    review => { review.cases[0].dimensions.speechEvidence.reason = ''; },
    review => { delete review.cases[0].dimensions.order; },
    review => { review.cases[0].dimensions.other = judgment('correct'); },
    review => { review.cases[0].status = 'unreviewed'; },
    review => { review.cases[0].dimensions.abstention.value = 'justified'; },
    review => { review.cases[0].dimensions.references.value = 'correct'; },
  ];
  for (const [index, mutate] of changes.entries()) {
    f.review = structuredClone(original);
    mutate(f.review);
    await f.saveReview();
    await assert.rejects(scoreReplay(f.options), { code: 'TVLENS_SCORING_REVIEW_INVALID' }, 'mutation ' + index);
  }
});

test('frozen annotations require one justified expected description per corpus case', async t => {
  const f = await fixture(t);
  const original = structuredClone(f.annotations);
  for (const mutate of [
    annotations => { annotations.version = 2; },
    annotations => { annotations.cases = []; },
    annotations => { annotations.cases[0].expected = ''; },
    annotations => { annotations.cases[0].reason = ''; },
    annotations => { annotations.cases.push(annotations.cases[0]); },
    annotations => { annotations.cases[0].id = 'outside'; },
  ]) {
    const annotations = structuredClone(original);
    mutate(annotations);
    await fs.writeFile(f.options.annotationsPath, JSON.stringify(annotations));
    f.report.annotationsSha256 = hash(await fs.readFile(f.options.annotationsPath));
    f.review.annotationsSha256 = f.report.annotationsSha256;
    await saveReport(f, true);
    await assert.rejects(scoreReplay(f.options), { code: 'TVLENS_SCORING_ANNOTATIONS_INVALID' });
  }
});

async function anotherExecution(f) {
  const candidate = { ...f, report: structuredClone(f.report), review: structuredClone(f.review),
    options: { ...f.options, reportPath: path.join(f.root, 'candidate.json'), reviewPath: path.join(f.root, 'candidate-review.json') } };
  candidate.report.runId = 'distinct-fixture-run';
  candidate.saveReview = () => fs.writeFile(candidate.options.reviewPath, JSON.stringify(candidate.review));
  await saveReport(candidate, true);
  return candidate;
}

test('comparison reports paired changes and every causality or provenance regression despite improved totals', async t => {
  const ids = ['improves', 'regresses', 'lost-review', 'gained-review', 'na'];
  const reference = await fixture(t, ids);
  reference.review.cases = [reviewed('improves', { accuracy: 'incorrect' }), reviewed('regresses'), reviewed('lost-review'),
    reviewed('na', { order: 'na' })];
  await reference.saveReview();
  const candidate = await anotherExecution(reference);
  candidate.review.cases = [reviewed('improves'), reviewed('regresses', { causality: 'violation', provenance: 'violation' }),
    reviewed('gained-review'), reviewed('na')];
  await candidate.saveReview();
  const comparison = await compareReplays({ reference: reference.options, candidate: candidate.options });
  assert.equal(comparison?.paired?.cases, 5);
  assert.equal(comparison.paired.bothReviewed, 3);
  assert.deepEqual(comparison.paired.dimensions.accuracy, { denominator: 3, notComparable: 0, regressions: 0, improvements: 1 });
  assert.deepEqual(comparison.paired.dimensions.order, { denominator: 2, notComparable: 1, regressions: 0, improvements: 0 });
  assert.equal(comparison.reference.totals.successes, 3);
  assert.equal(comparison.candidate.totals.successes, 3);
  assert.deepEqual(comparison.regressions, [{ id: 'regresses', dimensions: ['causality', 'provenance'] }]);
  assert.deepEqual(comparison.violations.candidate, [{ id: 'regresses', dimensions: ['causality', 'provenance'] }]);
  assert.deepEqual(comparison.comparisons.find(item => item.id === 'regresses').newViolations, ['causality', 'provenance']);
  assert.equal(comparison.comparisons.find(item => item.id === 'lost-review').coverage, 'reference-only-reviewed');
  assert.equal(comparison.comparisons.find(item => item.id === 'gained-review').coverage, 'candidate-only-reviewed');
  assert.deepEqual(comparison.comparisons.find(item => item.id === 'improves').changes,
    [{ dimension: 'accuracy', reference: 'incorrect', candidate: 'correct', regression: false }]);
  assert.equal(comparison.comparisons.find(item => item.id === 'na').changes[0].regression, null);
  candidate.review.reportSha256 = reference.review.reportSha256;
  await candidate.saveReview();
  await assert.rejects(compareReplays({ reference: reference.options, candidate: candidate.options }), { code: 'TVLENS_SCORING_STALE_REVIEW' });
});

test('comparison exposes unpaired cases and rejects implicit pairing of changed inputs or expected annotations', async t => {
  const reference = await fixture(t, ['shared', 'reference-only']);
  const candidate = await fixture(t, ['shared', 'candidate-only']);
  const result = await compareReplays({ reference: reference.options, candidate: candidate.options });
  assert.equal(result?.paired?.cases, 1);
  assert.deepEqual(result.comparisons.map(item => [item.id, item.pairing]), [
    ['shared', 'paired'], ['reference-only', 'reference-only'], ['candidate-only', 'candidate-only']]);
  candidate.manifest.cases[0].transcript.limits = 'Limite différente.';
  await fs.writeFile(candidate.options.manifestPath, JSON.stringify(candidate.manifest));
  candidate.report.manifestSha256 = hash(await fs.readFile(candidate.options.manifestPath));
  candidate.review.manifestSha256 = candidate.report.manifestSha256;
  candidate.annotations.manifestSha256 = candidate.report.manifestSha256;
  candidate.report.cases[0].input.transcript.limits = 'Limite différente.';
  await fs.writeFile(candidate.options.annotationsPath, JSON.stringify(candidate.annotations));
  candidate.report.annotationsSha256 = hash(await fs.readFile(candidate.options.annotationsPath));
  candidate.review.annotationsSha256 = candidate.report.annotationsSha256;
  await saveReport(candidate, true);
  const changed = await compareReplays({ reference: reference.options, candidate: candidate.options });
  assert.equal(changed.paired.cases, 0);
  assert.equal(changed.comparisons[0].pairing, 'input-mismatch');
  assert.deepEqual(changed.comparisons[0].changes, []);
  candidate.manifest.cases[0].transcript.limits = reference.manifest.cases[0].transcript.limits;
  candidate.report.cases[0].input.transcript.limits = reference.report.cases[0].input.transcript.limits;
  await fs.writeFile(candidate.options.manifestPath, JSON.stringify(candidate.manifest));
  candidate.report.manifestSha256 = hash(await fs.readFile(candidate.options.manifestPath));
  candidate.review.manifestSha256 = candidate.report.manifestSha256;
  candidate.annotations.manifestSha256 = candidate.report.manifestSha256;
  candidate.annotations.cases[0].expected = 'Un autre attendu.';
  await fs.writeFile(candidate.options.annotationsPath, JSON.stringify(candidate.annotations));
  candidate.report.annotationsSha256 = hash(await fs.readFile(candidate.options.annotationsPath));
  candidate.review.annotationsSha256 = candidate.report.annotationsSha256;
  await saveReport(candidate, true);
  const differentExpected = await compareReplays({ reference: reference.options, candidate: candidate.options });
  assert.equal(differentExpected.comparisons[0].pairing, 'annotation-mismatch');
});

test('citation bounds remain mechanical checks and neither valid intervals nor keywords establish truth', async t => {
  const f = await fixture(t, ['wrong-trajectory', 'invalid-reference', 'absent-evidence']);
  f.review.cases = [reviewed('wrong-trajectory', { accuracy: 'incorrect', description: 'misdescribed', references: 'correct' }),
    reviewed('invalid-reference', { references: 'incorrect' }), reviewed('absent-evidence', { imageEvidence: 'insufficient' })];
  f.review.cases[0].citations = [{ id: 'wrong-trajectory', startMs: 0, endMs: 2000 }];
  f.review.cases[1].citations = [{ id: 'invalid-reference', startMs: 0, endMs: 2001 }, { id: 'unknown', startMs: 0, endMs: 1 }];
  await f.saveReview();
  const result = await scoreReplay(f.options);
  assert.deepEqual(result.cases[0].citationChecks, [{ id: 'wrong-trajectory', startMs: 0, endMs: 2000, intervalValid: true }]);
  assert.equal(result.cases[0].success, false);
  assert.deepEqual(result.cases[1].citationChecks.map(item => item.intervalValid), [false, false]);
  assert.equal(result.cases[2].success, false);
  assert.equal(result.cases[0].review.dimensions.imageEvidence.value, 'sufficient');
  assert.equal(result.cases[0].review.dimensions.description.value, 'misdescribed');
  assert.equal(result.cases[2].review.dimensions.imageEvidence.value, 'insufficient');
});

test('incomplete or failed replay cases keep review coverage without becoming successful answers', async t => {
  const f = await fixture(t, ['failed', 'never-started']);
  f.report.complete = false;
  f.report.cases[0].status = 'error';
  delete f.report.cases[0].result;
  f.report.cases[0].error = { code: 'TVLENS_REPLAY_RESPONSE_INVALID' };
  f.report.cases[1].status = 'validated';
  delete f.report.cases[1].request;
  delete f.report.cases[1].result;
  f.review.cases = [reviewed('failed'), { id: 'never-started', status: 'unreviewed', reason: 'Aucun appel effectué.' }];
  await saveReport(f, true);
  const result = await scoreReplay(f.options);
  assert.equal(result.execution?.complete, false);
  assert.equal(result.cases[0].success, false);
  assert.deepEqual(result.cases[0].error, f.report.cases[0].error);
  assert.equal(result.cases[1].received, null);
  assert.equal(result.cases[1].success, null);
});

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const cli = path.resolve(__dirname, '../scripts/score-perception-replay.cjs');
async function offlineCli(t, f) {
  const guardPath = path.join(f.root, 'forbid-providers.cjs');
  await fs.writeFile(guardPath, `
const Module = require('node:module');
const original = Module._load;
const forbidden = () => { throw Error('FORBIDDEN_PROVIDER_OR_NETWORK'); };
Module._load = function(request, ...args) {
  if (/adapters\\/|runtime\\/session-providers|replay-local-perception/.test(request)) forbidden();
  return original.call(this, request, ...args);
};
globalThis.fetch = forbidden;
for (const [moduleName, methods] of Object.entries({
  'node:http': ['request', 'get'], 'node:https': ['request', 'get'],
  'node:net': ['connect', 'createConnection'], 'node:tls': ['connect'],
  'node:child_process': ['spawn', 'exec', 'execFile', 'fork', 'spawnSync', 'execSync', 'execFileSync']
})) {
  const target = require(moduleName);
  for (const method of methods) target[method] = forbidden;
}
require('node:net').Socket.prototype.connect = forbidden;
`);
  return args => execute(process.execPath, ['--require', guardPath, cli, ...args]);
}
function cliArgs(options) {
  return ['--manifest', options.manifestPath, '--annotations', options.annotationsPath,
    '--report', options.reportPath, '--review', options.reviewPath];
}

test('CLI help, review validation, scoring and comparison complete offline without loading or invoking providers', async t => {
  const f = await fixture(t);
  const invoke = await offlineCli(t, f);
  const help = await invoke(['--help', '--manifest', '/does/not/exist']);
  assert.match(help.stdout, /Usage/);
  const validation = JSON.parse((await invoke([...cliArgs(f.options), '--validate'])).stdout);
  assert.equal(validation.valid, true);
  assert.equal(validation.totals, undefined);
  const score = JSON.parse((await invoke(cliArgs(f.options))).stdout);
  assert.equal(score.totals.successes, 1);
  assert.equal(score.identity.reportSha256, f.review.reportSha256);
  const candidate = await anotherExecution(f);
  const comparison = JSON.parse((await invoke([...cliArgs(candidate.options), '--reference-report', f.options.reportPath,
    '--reference-review', f.options.reviewPath])).stdout);
  assert.equal(comparison.paired.bothReviewed, 1);
  assert.deepEqual(comparison.regressions, []);
  const originalReport = await fs.readFile(f.options.reportPath);
  const originalReview = await fs.readFile(f.options.reviewPath);
  for (const args of [[], [...cliArgs(f.options), '--execute'], [...cliArgs(f.options), '--unknown'],
    [...cliArgs(f.options), '--reference-report', f.options.reportPath], [...cliArgs(f.options), '--review', f.options.reviewPath]]) {
    const error = await invoke(args).catch(error => error);
    assert.equal(error.code, 1);
    assert.equal(error.stdout, '');
    assert.match(error.stderr, /TVLENS_SCORING_CLI_INVALID/);
  }
  f.review.reportSha256 = hash('stale');
  await f.saveReview();
  const stale = await invoke(cliArgs(f.options)).catch(error => error);
  assert.equal(stale.code, 1);
  assert.equal(stale.stdout, '');
  assert.match(stale.stderr, /TVLENS_SCORING_STALE_REVIEW/);
  assert.deepEqual(await fs.readFile(f.options.reportPath), originalReport);
  await fs.writeFile(f.options.reviewPath, originalReview);
});

test('malformed JSON roots and missing files are refused with stable codes instead of accepted scores', async t => {
  const f = await fixture(t);
  for (const [key, suffix] of [['manifestPath', 'CORPUS_INVALID'], ['annotationsPath', 'ANNOTATIONS_INVALID'],
    ['reportPath', 'REPORT_INVALID'], ['reviewPath', 'REVIEW_INVALID']]) {
    const original = await fs.readFile(f.options[key]);
    await fs.writeFile(f.options[key], 'null');
    await assert.rejects(scoreReplay(f.options), { code: 'TVLENS_SCORING_' + suffix });
    await fs.writeFile(f.options[key], original);
  }
  await assert.rejects(scoreReplay({ ...f.options, reportPath: path.join(f.root, 'absent.json') }),
    { code: 'TVLENS_REPLAY_FILE_UNAVAILABLE' });
});

test('documented synthetic review validates and scores offline with its exact checked-in fingerprints', async t => {
  const f = await fixture(t);
  const invoke = await offlineCli(t, f);
  const base = path.resolve(__dirname, '../scripts/fixtures');
  const options = { manifestPath: path.join(base, 'perception-replay/manifest.json'),
    annotationsPath: path.join(base, 'perception-replay-scoring/annotations.json'),
    reportPath: path.join(base, 'perception-replay-scoring/campaign.json'),
    reviewPath: path.join(base, 'perception-replay-scoring/review.json') };
  const result = JSON.parse((await invoke(cliArgs(options))).stdout);
  assert.equal(result.totals.cases, 3);
  assert.equal(result.totals.reviewed, 1);
  assert.equal(result.totals.notEvaluated, 2);
  assert.equal(result.totals.successes, 1);
  assert.equal(result.execution.code.kind, 'synthetic-fixture');
  for (const item of result.cases) {
    assert.equal(item.input.frames.length, 8);
    assert.deepEqual(item.received.frames.map(frame => frame.index), [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(item.received.frames, item.input.frames.slice(0, 6));
  }
});
