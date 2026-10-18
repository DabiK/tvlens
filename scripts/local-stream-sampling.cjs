const { bounded, REQUEST_MS } = require('./local-stream-transport.cjs');

const SAMPLE_STEP_MS = 1000;
const terminal = status => ['done', 'cancelled', 'error'].includes(status);
function questionLatency(entry, observedAtMs) {
  return { submissionToHttpResponseMs: observedAtMs === null ? null : observedAtMs - entry.submittedAtMs,
    httpObservedAtMs: observedAtMs, observation: 'sondage HTTP échantillonné',
    acknowledgementMs: Number.isFinite(entry.acknowledgedAtMs) ? entry.acknowledgedAtMs - entry.submittedAtMs : null,
    internal: structuredClone(entry.metrics ?? null), agentWaitMs: null, firstTokenMs: null, pureNetworkMs: null };
}
function recordHttp(report, response, atMs) {
  const { value: state, status } = response;
  report.journal.httpStates.push({ atMs, status, sessionId: state.session?.id ?? null,
    revision: state.revision ?? null, serverNowMs: state.serverNowMs ?? null, captureGaps: state.captureGaps ?? null });
  if (status !== 200 || state.session?.id !== report.sessionId) return;
  for (const entry of report.questions) {
    const job = state.chat.jobs.find(item => item.id === entry.jobId);
    if (job && terminal(job.status) && entry.latency?.httpObservedAtMs == null)
      entry.latency = questionLatency(entry, atMs);
  }
}
function createSampling(host, report, writer, sample) {
  const { clock } = host, controller = new AbortController();
  const questions = new Map();
  let sealed = false, polling = false, timer, nextSampleMs = SAMPLE_STEP_MS;
  async function poll() {
    if (polling || sealed) return;
    polling = true;
    try {
      const response = await bounded(signal => host.exchange('/v1/state', { signal }), REQUEST_MS, clock, controller.signal);
      if (sealed) return;
      recordHttp(report, response, clock.now());
      writer.save();
    } catch (error) {
      if (!sealed) report.diagnostics.push({ code: 'TVLENS_REPLAY_OBSERVATION_FAILED', causeCode: error.code || 'UNKNOWN' });
    } finally { polling = false; }
  }
  function tick() {
    sample();
    poll();
    nextSampleMs = Math.max(nextSampleMs + SAMPLE_STEP_MS, clock.now() + SAMPLE_STEP_MS);
    timer = clock.setTimer(tick, nextSampleMs - clock.now());
  }
  sample();
  poll();
  timer = clock.setTimer(tick, Math.max(0, nextSampleMs - clock.now()));
  return { observeQuestion(entry) {
    entry.acquired ??= false;
    if (!sealed) entry.acquired = entry.status === 'done';
    const signature = JSON.stringify([entry.status, entry.metrics]);
    if (questions.get(entry.id) !== signature) {
      questions.set(entry.id, signature);
      report.journal.questions.push({ sessionId: report.sessionId, atMs: clock.now(), id: entry.id, jobId: entry.jobId ?? null,
        status: entry.status, metrics: structuredClone(entry.metrics ?? null), acquired: !sealed && entry.acquired, afterClose: sealed });
    }
    entry.latency = questionLatency(entry, entry.latency?.httpObservedAtMs ?? null);
  }, close() {
    sealed = true;
    clock.clearTimer(timer);
    controller.abort();
  } };
}
module.exports = { createSampling, SAMPLE_STEP_MS };
