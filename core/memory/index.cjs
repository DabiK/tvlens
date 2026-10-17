/**
 * @typedef {import('./ports.cjs').MemoryView} MemoryView
 * @typedef {import('./ports.cjs').MemoryPassage} MemoryPassage
 * @typedef {import('./ports.cjs').MemoryReadPort} MemoryReadPort
 * @typedef {import('./ports.cjs').MemoryMediaPort} MemoryMediaPort
 */
module.exports = {
  calculateCoverage: require('./coverage.cjs').calculateCoverage,
  ...require('./archive.cjs'),
  ...require('./lanes.cjs'),
  ...require('./memory-view.cjs'),
  ...require('./ports.cjs'),
};
