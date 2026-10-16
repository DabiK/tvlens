const CASES = Object.freeze([
  "memory-ready",
  "perception-delayed",
  "question-queued",
]);
const DEFAULT_DELAYS = Object.freeze({
  transportMs: 20,
  preparationMs: 30,
  audioMs: 80,
  visionMs: 120,
  firstTextMs: 40,
  responseMs: 200,
  deliveryMs: 15,
  frameMs: 16,
  checkpointMs: 500,
  captureCloseMs: 1000,
});
const DELAYED_PERCEPTION = Object.freeze({ audioMs: 300, visionMs: 650 });
const MAX_SCENARIO_MS = 30000;
const DRIVE_STEP_MS = 10;
const VIEW_SETTLE_MS = 110;
const RECORDER_SEGMENT_MS = 8000;

const SIMULATED_TRANSPORT_REFUSAL = "SIMULATED_TRANSPORT_REFUSAL";

module.exports = {
  SIMULATED_TRANSPORT_REFUSAL,
  CASES,
  DEFAULT_DELAYS,
  DELAYED_PERCEPTION,
  MAX_SCENARIO_MS,
  DRIVE_STEP_MS,
  VIEW_SETTLE_MS,
  RECORDER_SEGMENT_MS,
};
