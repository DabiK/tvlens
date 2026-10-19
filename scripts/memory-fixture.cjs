const { createMemoryView } = require('../core/memory/index.cjs');
const { consultationOf } = require('../core/video-tools.cjs');

// What a session would publish of its memory, over plain passages written as the session holds them:
// `available` and `mediaReason` on retained passages, history apart. The clock reads the state's `elapsedMs`, or
// the end of its last passage for a fixture written without one.
function memoryState(state) {
  const history = state.history || [], segments = state.segments || [];
  const elapsedMs = state.elapsedMs ?? segments.at(-1)?.endMs ?? history.at(-1)?.endMs ?? 0;
  return {
    id: state.id, now: () => elapsedMs, historicalPassages: history, passages: segments,
    perceptionState: () => ({ pending: 0, audioPending: 0, visionPending: 0, analyzing: false, visionBlockedMs: 0 }),
    losses: {}, accepting: true, asking: false,
    readOnly: false, unplacedMedia: 0, lastError: null,
  };
}

// The consultation a question freezes from a fixture, through the real memory view projection.
const consultationFrom = state => consultationOf(createMemoryView(memoryState(state)));

module.exports = { memoryState, consultationFrom };
