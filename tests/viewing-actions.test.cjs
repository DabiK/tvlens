const test = require('node:test');
const assert = require('node:assert/strict');
const { ViewingActions } = require('../core/viewing-actions.cjs');
let tokenSequence = 0;
const makeId = () => `token-${++tokenSequence}`;
const { VideoTools } = require('../core/video-tools.cjs');
const { consultationFrom } = require('./helpers/memory-consultation.cjs');
// The part of a memory view these actions read: the session identity, the clock and how far capture went.
const view = (elapsedMs = 30000, { id = 'session-a' } = {}) => ({ session: { id }, clock: { elapsedMs, capturedThroughMs: 24000 } });

test('explain token freezes invocation before later capture and remains reusable for follow-up', () => {
  const actions = new ViewingActions({ makeId });
  const frozen = actions.freeze(view());
  assert.equal(frozen.anchorMs, 30000);
  assert.equal(frozen.startMs, 10000);
  assert.deepEqual(actions.resolve(view(50000), frozen.token, 'explain'), frozen);
  assert.deepEqual(actions.resolve(view(70000), frozen.token, 'explain'), frozen);
});

test('catch-up starts at session beginning and advances only after explicit acknowledgment', () => {
  const actions = new ViewingActions({ makeId });
  const first = actions.freeze(view(), { kind: 'catch-up' });
  assert.equal(first.startMs, 0);
  assert.equal(actions.freeze(view(40000), { kind: 'catch-up' }).startMs, 0);
  actions.acknowledge({ ...first, endMs: 24000 });
  assert.equal(actions.freeze(view(50000), { kind: 'catch-up' }).startMs, 24000);
  actions.acknowledge({ ...first, endMs: 18000 });
  assert.equal(actions.freeze(view(50000), { kind: 'catch-up' }).startMs, 24000);
});

test('explicit attention marker uses sealed capture boundary', () => {
  const actions = new ViewingActions({ makeId });
  assert.deepEqual(actions.mark(view()), { sessionId: 'session-a', atMs: 24000 });
  assert.equal(actions.freeze(view(50000), { kind: 'catch-up' }).startMs, 24000);
});

test('tokens cannot cross sessions or action types; old async results cannot change new marker', () => {
  const actions = new ViewingActions({ makeId });
  const old = actions.freeze(view());
  assert.throws(() => actions.resolve(view(), old.token, 'catch-up'), /expiré/);
  assert.throws(() => actions.resolve(view(1000, { id: 'session-b' }), old.token, 'explain'), /expiré/);
  actions.acknowledge({ ...old, endMs: 30000 });
  assert.equal(actions.freeze(view(5000, { id: 'session-b' }), { kind: 'catch-up' }).startMs, 0);
});

test('missing session and stale tokens have actionable errors', () => {
  const actions = new ViewingActions({ makeId });
  assert.throws(() => actions.freeze(null), /Lance TVLens/);
  const first = actions.freeze(view());
  for (let i = 0; i < 30; i++) actions.freeze(view());
  assert.throws(() => actions.resolve(view(), first.token, 'explain'), /expiré/);
  assert.throws(() => actions.freeze(view(), { kind: 'unknown' }), /inconnue/);
});

test('successful recap preserves pending passages for the next recap', () => {
  const actions = new ViewingActions({ makeId });
  const frozen = actions.freeze(view(), { kind: 'catch-up' });
  const segments = [
    { id: 'a', startMs: 0, endMs: 8000, status: 'ready' },
    { id: 'b', startMs: 8000, endMs: 16000, status: 'analyzing' },
    { id: 'c', startMs: 16000, endMs: 24000, status: 'ready' }
  ];
  actions.acknowledgeResult(frozen, { status: 'done', result: { citations: [{ id: 'c', startMs: 16000, endMs: 24000 }] } }, segments);
  assert.equal(actions.freeze(view(40000), { kind: 'catch-up' }).startMs, 8000);
  actions.acknowledgeResult(frozen, { status: 'error', result: { citations: [{ id: 'b', startMs: 8000, endMs: 16000 }] } }, segments);
  assert.equal(actions.freeze(view(40000), { kind: 'catch-up' }).startMs, 8000);
  actions.acknowledgeResult(frozen, { status: 'done', result: { citations: [{ id: 'b', startMs: 8000, endMs: 16000 }] } }, segments);
  assert.equal(actions.freeze(view(40000), { kind: 'catch-up' }).startMs, 16000);
});

test('recap marker never advances beyond the last cited complete segment', () => {
  const actions = new ViewingActions({ makeId });
  const frozen = actions.freeze(view(), { kind: 'catch-up' });
  actions.acknowledgeResult(frozen, { status: 'done', result: { citations: [{ id: 'a', startMs: 0, endMs: 8000 }] } }, [
    { id: 'a', startMs: 0, endMs: 8000, status: 'ready' },
    { id: 'b', startMs: 8000, endMs: 16000, status: 'ready' }
  ]);
  assert.equal(actions.freeze(view(40000), { kind: 'catch-up' }).startMs, 8000);
});

test('reexamination preserves original frozen evidence and interval after live capture advances', () => {
  const actions = new ViewingActions({ makeId });
  const kept = consultationFrom({ id: 'session-a', elapsedMs: 16000,
    segments: [{ id: 'a', startMs: 8000, endMs: 16000, status: 'ready', available: true, observation: { summary: 'Original' } }] });
  const original = { question: 'Explique cet instant.', intent: 'explain-moment', sessionId: 'session-a', anchorMs: 16000,
    tools: new VideoTools({ consultation: kept }).scope({ startMs: 8000, anchorMs: 16000 }) };
  const retry = actions.reexamination(original, view(60000));
  assert.equal(retry.options.mode, 'inspect');
  assert.equal(retry.options.intent, 'explain-moment');
  assert.equal(retry.options.anchorMs, 16000);
  assert.equal(retry.options.startMs, 8000);
  assert.deepEqual([retry.options.consultation.sessionId, retry.options.consultation.anchorMs, retry.options.consultation.startMs],
    ['session-a', 16000, 8000]);
  assert.deepEqual(retry.options.consultation.passages.map(s => s.id), ['a']);
  retry.options.consultation.passages[0].observation.summary = 'Changed';
  assert.equal(original.tools.consultationScope().passages[0].observation.summary, 'Original');
  assert.throws(() => actions.reexamination(original, view(60000, { id: 'session-b' })), /plus disponible/);
  assert.throws(() => actions.reexamination(undefined, view()), /plus disponible/);
});
