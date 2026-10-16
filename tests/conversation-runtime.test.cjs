const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasPendingQuestion } = require('../runtime/conversation-runtime.cjs');

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
