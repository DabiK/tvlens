const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runScenario } = require('../scripts/simulate-stream.cjs');
const root = path.join(__dirname, '..');
const seed = 20261012;

// The replay drives the real orchestration with controlled providers on a virtual clock:
// these checks are about ordering, bounds, losses and causality, never about provider speed.
function accounted(result) {
  const p = result.passages;
  assert.equal(p.ready + p.partial + p.skipped + p.expired + p.error + p.unfinished, p.ingested, 'every passage ends in exactly one status');
  assert.equal(p.unfinished, 0, 'nothing is left queued or analysing once the stream has drained');
  assert.equal(p.rejectedAtIngest, 0);
  const q = result.questionSummary;
  assert.equal(q.done + q.cancelled + q.timeout + q.error, q.asked, 'every question ends in exactly one status');
  assert.equal(q.causalityViolations, 0, 'no tool result or context passage ends after the question anchor');
}

test('the same seed replays the same stream, passage for passage', async () => {
  const [a, b] = [await runScenario(root, 'lg-vps', seed), await runScenario(root, 'lg-vps', seed)];
  for (const key of ['passages', 'delaysMs', 'provider', 'questionSummary', 'coverage']) assert.deepEqual(a[key], b[key]);
});

test('LG and Mac cadences: passages and questions are all accounted for, a cancelled question stays cancelled', async () => {
  const lg = await runScenario(root, 'lg-vps', seed);
  accounted(lg);
  assert.equal(lg.questionSummary.cancelled, 1);
  assert.equal(lg.passages.transcriptCoveragePct, 100);
  assert.ok(lg.provider.maxConcurrentModelCalls <= 2, 'at most one description and one re-inspection at a time');
  const mac = await runScenario(root, 'mac', seed);
  accounted(mac);
  assert.ok(mac.delaysMs.transcriptAfterClose.p50 < lg.delaysMs.transcriptAfterClose.p50, 'the modelled local Whisper publishes earlier than the CPU host');
});

test('a Whisper slowdown sheds transcriptions but keeps the images, and every loss is reported by the session itself', async () => {
  const result = await runScenario(root, 'lg-vps-backlog', seed);
  accounted(result);
  const p = result.passages, c = result.coverage;
  assert.ok(c.audioSkipped > 0, 'the slowdown must overflow the audio lane in this scenario');
  assert.equal(p.ingested - p.transcriptPublished, c.audioSkipped + c.audioError, 'every missing transcript has a counted cause');
  assert.equal(c.visionSkippedBacklog + c.visionSkippedAsking, p.visionSkipped, 'every skipped description has a counted cause');
  assert.equal(p.skipped, 0, 'no passage is lost whole while the vision lane has room');
  assert.equal(result.audioGaps, c.audioSkipped, 'described passages without speech are listed');
});

test('two simulated hours with a search every 21 minutes: no question is spent catching up the index', async () => {
  const result = await runScenario(root, 'long-lg', seed);
  accounted(result);
  const q = result.questionSummary;
  assert.equal(q.timeout, 0, 'no question may hit its five-minute ceiling because of indexing');
  assert.ok(q.searchToolMs.max <= 4500, `search stays within its budgets (got ${q.searchToolMs.max} ms)`);
  assert.ok(result.provider.embeddingTexts <= result.passages.ingested * 1.25, 'a passage is embedded once, twice at most when its description arrives late');
  assert.ok(result.provider.embeddingRequests <= result.provider.embeddingTexts);
  assert.equal(result.indexStatus.dropped, 0);
});

test('with visionDuringAsk a question no longer holds descriptions back, still one description at a time', async () => {
  const held = await runScenario(root, 'lg-vps', seed);
  const free = await runScenario(root, 'lg-vps', seed, { visionDuringAsk: true });
  accounted(free);
  assert.ok(held.coverage.visionBlockedMs > 0);
  assert.equal(free.coverage.visionBlockedMs, 0);
  assert.equal(free.coverage.visionSkippedAsking, 0);
  assert.ok(free.provider.visionCallsDuringQuestion > 0);
  assert.ok(free.provider.maxConcurrentModelCalls <= 2);
  assert.ok(free.delaysMs.readyAfterClose.p95 <= held.delaysMs.readyAfterClose.p95);
});

test('a first search after 110 minutes answers within its budget in both index modes, and says what it could not rank semantically', async () => {
  const fed = await runScenario(root, 'late-first-search', seed);
  accounted(fed);
  const [first] = fed.questions.filter(q => q.kind === 'search');
  assert.deepEqual([first.status, first.searchMode, first.semantic.pending], ['done', 'hybrid', 0], 'fed in the background, the index is complete when the first search comes');
  const onDemand = await runScenario(root, 'late-first-search', seed, { backgroundIndex: false });
  accounted(onDemand);
  const [late, next] = onDemand.questions.filter(q => q.kind === 'search');
  assert.equal(late.status, 'done');
  assert.ok(late.tools[0].durationMs <= 4500, `bounded by the search budgets (got ${late.tools[0].durationMs} ms)`);
  assert.ok(late.semantic.pending > 0 && late.searchWarnings.some(w => /pas encore indexé/.test(w)), 'what is ranked on text only is counted and announced');
  assert.equal(late.semantic.indexed + late.semantic.pending, late.semantic.eligible);
  assert.equal(next.semantic.pending, 0, 'indexing went on after the answer: the next search is complete');
  assert.equal(onDemand.indexStatus.dropped, 0, 'the whole prefix was queued, nothing was dropped');
});

test('the replay counts the process recycling of the real client, not only thread rotations', async () => {
  const result = await runScenario(root, 'long-lg', seed);
  assert.ok(result.provider.threadRotations > 40);
  assert.ok(result.provider.coldStarts >= 3, 'one start, plus one per twenty rotations');
});
