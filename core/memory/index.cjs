/**
 * @typedef {import('./ports.cjs').MemoryView} MemoryView
 * @typedef {import('./ports.cjs').MemoryPassage} MemoryPassage
 * @typedef {import('./ports.cjs').MemoryReadPort} MemoryReadPort
 * @typedef {import('./ports.cjs').MemoryMediaPort} MemoryMediaPort
 */
module.exports = {
  ...require('./topic-continuity.cjs'),
  ...require('./topic-summary.cjs'),
  ...require('./lifecycle-state.cjs'),
  calculateCoverage: require('./coverage.cjs').calculateCoverage,
  ...require('./archive.cjs'),
  ...require('./lanes.cjs'),
  ...require('./memory-view.cjs'),
  ...require('./ports.cjs'),
  latencySummary: require('../latency-trace.cjs').latencySummary,
};
