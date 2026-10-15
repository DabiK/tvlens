// What is saved of the questions of a session, and when, the same on the Mac host and on the server host.
// Durability of the questions, apart from their publication. A question that appears, leaves or changes
// status is saved at once, final states included. Between two of those, the draft of a running answer moves
// many times a second: it is published each time and saved at most once per `delayMs`, the latest state
// after this delay even when the answer then stops moving. The host decides which jobs and which store go
// in; nothing here reads a disk, a clock or a transport.

const active = (job) => job.status === "queued" || job.status === "running";
const shapeOf = (jobs) => jobs.map((job) => `${job.id}:${job.status}`).join();

function createQuestionCheckpoint({
  delayMs = 1000,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
} = {}) {
  // The state not saved yet, with the store of the session it was published for, the timer that will hand it
  // over and the shape last handed to a store.
  let unsaved = null;
  let timer = null;
  let savedShape = null;

  // Hands the store whatever waits, now. The state waits with the store it was published for: a save that
  // comes late is written into that session's folder, never into the one loaded since, and into none once
  // its store is sealed.
  const flush = () => {
    clearTimer(timer);
    timer = null;
    const waiting = unsaved;
    unsaved = null;
    if (!waiting) return;
    savedShape = waiting.shape;
    // A refusal is not lost here: the store keeps it for the barrier that ends the session.
    waiting.store.saveResearch(waiting.state).catch(() => {});
  };

  const checkpoint = (store, state) => {
    const shape = shapeOf(state.jobs);
    unsaved = { store, state, shape };
    if (shape !== savedShape || !state.jobs.some(active)) flush();
    else timer ||= setTimer(flush, delayMs);
  };

  // Nothing of the former session waits past this point: what it had to save was handed over when its
  // questions were settled, and a timer left behind would have nothing to write.
  const forget = () => {
    clearTimer(timer);
    timer = unsaved = savedShape = null;
  };

  const pending = () => unsaved !== null || timer !== null;

  return { checkpoint, flush, forget, pending };
}

module.exports = { createQuestionCheckpoint };
