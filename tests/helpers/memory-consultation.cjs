const { createMemoryView, readMemoryPassages } = require('../../core/memory/index.cjs');
const { consultationOf } = require('../../core/video-tools.cjs');
// Plain passages, written as a session holds them, read as the memory of a session.
const { memoryState } = require('../../scripts/memory-fixture.cjs');

const reader = source => typeof source === 'function' ? source : () => source;

// The memory read port of a session double, through the real projection: `source` is a state, or a function giving
// the current one, so that a test can change the session between two reads.
function memoryOf(source) {
  const read = reader(source);
  return {
    view: () => createMemoryView(memoryState(read())),
    passages: ids => readMemoryPassages(memoryState(read()), ids),
  };
}

// The consultation a question freezes from that view.
const consultationFrom = state => consultationOf(memoryOf(state).view());

// A reread port over the current state. A missing state, or one that throws, is handed to the tools as it is.
function rereadOf(source) {
  const read = reader(source);
  return ids => {
    const state = read();
    return state && readMemoryPassages(memoryState(state), ids);
  };
}

module.exports = { memoryOf, consultationFrom, rereadOf };
