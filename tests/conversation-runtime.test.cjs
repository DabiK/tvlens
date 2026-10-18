const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createConversationRuntime, hasPendingQuestion } = require('../runtime/conversation-runtime.cjs');
const { memoryOf } = require('./helpers/memory-consultation.cjs');

test('only identified queued or running questions of the selected session make it busy', () => {
  assert.equal(typeof hasPendingQuestion, 'function');
  for (const status of ['queued', 'running']) {
    const jobs = [{ sessionId: 'A', status }];
    assert.equal(hasPendingQuestion(jobs, 'A'), true, status);
    assert.equal(hasPendingQuestion(jobs, 'B'), false, status);
    assert.equal(hasPendingQuestion(jobs, undefined), false, status);
    assert.equal(hasPendingQuestion([{ status }], 'A'), false, 'a historical job without identity');
    assert.equal(hasPendingQuestion([{ status }], undefined), false, 'two missing identities do not match');
  }
  for (const status of ['done', 'cancelled', 'timeout', 'error', undefined]) {
    assert.equal(hasPendingQuestion([{ sessionId: 'A', status }], 'A'), false, String(status));
  }
  assert.equal(hasPendingQuestion([], 'A'), false);
  assert.equal(hasPendingQuestion([{ sessionId: '', status: 'running' }], ''), false);
  assert.equal(hasPendingQuestion([
    { sessionId: 'B', status: 'running' },
    { sessionId: 'A', status: 'done' },
    { sessionId: 'A', status: 'queued' },
  ], 'A'), true);
});

function diagnosticComposition(config) {
  const session = { id: 's', memory: memoryOf({ id: 's', elapsedMs: 0, segments: [], history: [] }),
    search: {}, inspector: {}, memoryMedia: {} };
  const traces = [];
  const runtime = createConversationRuntime({ config, getSession: () => session,
    CodexAgent: function () { return { identity: { kind: 'codex', model: null, host: null },
      answer: async () => ({ answer: 'Ok.', kind: 'explanation', citations: [], limits: [] }) }; },
    LocalAgent: function () { assert.fail('the default must select Codex'); },
    onTrace: (event, fields) => traces.push({ event, ...structuredClone(fields) }) });
  return { ...runtime, traces };
}

test('a composition without a configured question backend reports its Codex default in metrics and traces', async () => {
  const { deep, traces } = diagnosticComposition({});
  deep.start('Question', { mode: 'chat' });
  await deep.jobs[0].done;
  const job = deep.snapshot().jobs[0];
  assert.equal(job.status, 'done');
  assert.equal(job.metrics.backend.configured, 'codex');
  assert.equal(job.metrics.backend.identity.kind, 'codex');
  assert.equal(job.metrics.backend.origin, 'substituted');
  for (const trace of traces) assert.deepEqual(trace.backend, job.metrics.backend);
});

test('backend selection and diagnostics share the same resolved configuration value', async () => {
  let reads = 0;
  const config = { get questionsBackend() { return reads++ === 0 ? undefined : 'local'; } };
  const { deep, agent, traces } = diagnosticComposition(config);
  deep.start('Question', { mode: 'chat' });
  await deep.jobs[0].done;
  const job = deep.snapshot().jobs[0];
  assert.equal(job.status, 'done');
  assert.equal(agent.identity.kind, 'codex');
  assert.equal(job.metrics.backend.configured, 'codex');
  assert.equal(job.metrics.backend.identity.kind, 'codex');
  assert.equal(job.metrics.backend.origin, 'substituted');
  for (const trace of traces) assert.deepEqual(trace.backend, job.metrics.backend);
});
