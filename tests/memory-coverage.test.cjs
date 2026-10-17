const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateCoverage } = require('../core/memory/coverage.cjs');

const passage = (id, extra = {}) => ({ id, startMs: id * 1000, endMs: (id + 1) * 1000, ...extra });

test('only terminal whole-passage losses are total gaps, in observation order', () => {
  const passages = ['error', 'skipped', 'expired', 'partial', 'ready', 'queued', 'analyzing', undefined]
    .map((status, id) => passage(id, { status, visionStatus: 'error' }));
  assert.deepEqual(calculateCoverage({ passages }).gaps, [
    { id: 0, startMs: 0, endMs: 1000, status: 'error' },
    { id: 1, startMs: 1000, endMs: 2000, status: 'skipped' },
    { id: 2, startMs: 2000, endMs: 3000, status: 'expired' },
  ]);
});

test('audio failure stays visible when ready, while partial audio gaps exclude historical expiry', () => {
  const passages = [
    passage(0, { status: 'ready', audioStatus: 'ready', audioFailed: true, audioFailureCode: 'NO_TRANSCRIPT' }),
    passage(1, { status: 'error', audioFailed: true }),
    passage(2, { status: 'partial', audioStatus: 'skipped' }),
    passage(3, { status: 'partial', audioStatus: 'error' }),
    passage(4, { status: 'partial', audioStatus: 'expired' }),
    passage(5, { status: 'error', audioStatus: 'error' }),
    passage(6, { status: 'ready', audioStatus: 'error' }),
    passage(7, { status: 'partial', audioStatus: 'ready' }),
  ];
  assert.deepEqual(calculateCoverage({ passages }).audioGaps, [
    { id: 0, startMs: 0, endMs: 1000, audioStatus: 'failed', code: 'NO_TRANSCRIPT' },
    { id: 1, startMs: 1000, endMs: 2000, audioStatus: 'failed' },
    { id: 2, startMs: 2000, endMs: 3000, audioStatus: 'skipped' },
    { id: 3, startMs: 3000, endMs: 4000, audioStatus: 'error' },
  ]);
});

test('vision gaps retain partial speech and distinguish cause absence from an explicit null', () => {
  const passages = [
    passage(0, { status: 'partial', visionStatus: 'skipped', visionSkipReason: 'asking' }),
    passage(1, { status: 'partial', visionStatus: 'skipped', visionSkipReason: 'backlog' }),
    passage(2, { status: 'partial', visionStatus: 'expired' }),
    passage(3, { status: 'partial', visionStatus: 'error', visionSkipReason: null }),
    passage(4, { status: 'error', visionStatus: 'error' }),
    passage(5, { status: 'ready', visionStatus: 'error' }),
    passage(6, { status: 'partial', visionStatus: 'queued' }),
    passage(7, { status: 'partial', visionStatus: 'ready' }),
  ];
  assert.deepEqual(calculateCoverage({ passages }).visionGaps, [
    { id: 0, startMs: 0, endMs: 1000, visionStatus: 'skipped', reason: 'asking' },
    { id: 1, startMs: 1000, endMs: 2000, visionStatus: 'skipped', reason: 'backlog' },
    { id: 2, startMs: 2000, endMs: 3000, visionStatus: 'expired', reason: undefined },
    { id: 3, startMs: 3000, endMs: 4000, visionStatus: 'error', reason: null },
  ]);
});

test('acquired counters survive missing passages and repeated detached projections without optional zeroes', () => {
  const losses = Object.freeze({ audioSkipped: 4, visionError: 2 });
  const passages = Object.freeze([Object.freeze(passage(0, { status: 'ready' }))]);
  const input = { passages, losses, visionBlockedMs: 800 };
  const expected = { passages: 1, audioSkipped: 4, visionError: 2, visionBlockedMs: 800 };
  const first = calculateCoverage(input);
  assert.deepEqual(first.coverage, expected);
  first.coverage.audioSkipped = 99;
  assert.deepEqual(calculateCoverage(input).coverage, expected);
  assert.deepEqual(calculateCoverage({ ...input, passages: [] }).coverage, { ...expected, passages: 0 });
  const optional = { ...losses, visionRetried: 3, visionRecovered: 1, videoUnreadable: 2 };
  assert.deepEqual(calculateCoverage({ ...input, losses: optional }).coverage, { ...expected, ...optional });
});

test('held duration adds only the current interval to the acquired total without acquiring it on reads', () => {
  const { heldDuration } = require('../core/memory/coverage.cjs');
  const input = Object.freeze({ acquiredMs: 800, heldSince: 1000, now: 1400 });
  assert.equal(heldDuration(input), 1200);
  assert.equal(heldDuration(input), 1200);
  assert.equal(heldDuration({ ...input, heldSince: null, now: 9000 }), 800);
  assert.equal(heldDuration({ ...input, now: 900 }), 800);
  assert.equal(heldDuration({ acquiredMs: 0, heldSince: 0, now: 500 }), 500);
});
