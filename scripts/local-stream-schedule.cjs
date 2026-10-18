const fs = require('node:fs/promises');
const path = require('node:path');
const { createHost } = require('./local-stream-host.cjs');
const { observeHost } = require('./local-stream-observe.cjs');
const { createTransport, bounded } = require('./local-stream-transport.cjs');
const { setLanguage, upload, question, cancel } = require('./local-stream-actions.cjs');
const { finalizeRoles } = require('./local-stream-report.cjs');

function schedule(context, initialLanguage) {
  const { clock, loaded, report, transport, signal, writer } = context;
  const timers = new Set(), tasks = new Set();
  let calendarDone = false, wake = () => {};
  function launch(work, entry) {
    const task = Promise.resolve().then(work).catch(error => {
      if (entry) { entry.status = 'unfinished'; entry.code = error.code || 'TVLENS_REPLAY_ACTION_FAILED'; }
      report.diagnostics.push({ code: error.code || 'TVLENS_REPLAY_ACTION_FAILED' });
    }).finally(() => { tasks.delete(task); writer.save(); wake(); });
    tasks.add(task);
    return task;
  }
  function at(time, work) {
    if (clock.now() >= time) { work(); return; }
    const timer = clock.setTimer(() => { timers.delete(timer); work(); }, time - clock.now());
    timers.add(timer);
  }
  let language = loaded.uploads[0].language, languageReady = Promise.resolve(initialLanguage);
  for (const entry of report.uploads) {
    if (entry.language !== language) {
      language = entry.language;
      let resolve;
      const next = new Promise(yes => { resolve = yes; });
      at(entry.plannedAtMs, () => launch(async () => resolve(await setLanguage(entry.language, transport, report))));
      languageReady = next;
    }
    const selectedLanguage = languageReady;
    at(entry.plannedAtMs, () => launch(() => upload(entry, context, selectedLanguage), entry));
  }
  for (const entry of report.questions) {
    let submission;
    at(entry.plannedAtMs, () => { submission = launch(() => question(entry, context), entry); });
    if (entry.cancellation) at(entry.cancelAtMs, () => launch(() => cancel(entry, context, submission), entry.cancellation));
  }
  at(loaded.scenario.plannedDurationMs, () => { calendarDone = true; wake(); });
  return { tasks, get done() { return calendarDone; }, onWake(fn) { wake = fn; }, stop() {
    for (const timer of timers) clock.clearTimer(timer);
    timers.clear();
    if (!signal.aborted) context.controller.abort(Object.assign(Error('Calendrier arrêté.'), { code: 'TVLENS_REPLAY_STOPPED' }));
  } };
}
function drained(context, calendar) {
  const state = context.observer.state;
  return calendar.done && !calendar.tasks.size && !state.session?.pending && !state.session?.analyzing
    && !state.chat.jobs.some(job => ['running', 'queued'].includes(job.status));
}
async function waitForDrain(context, calendar) {
  const { clock, signal, observer, loaded } = context;
  let timer, abort;
  return new Promise(resolve => {
    const finish = reason => {
      clock.clearTimer(timer);
      signal.removeEventListener('abort', abort);
      calendar.onWake(() => {});
      observer.onWake(() => {});
      resolve(reason);
    };
    const check = () => { if (drained(context, calendar)) finish('drained'); };
    abort = () => finish('interrupted');
    timer = clock.setTimer(() => finish('final-timeout'), Math.max(0,
      loaded.scenario.plannedDurationMs + loaded.scenario.finalWaitMs - clock.now()));
    calendar.onWake(check);
    observer.onWake(check);
    if (signal.aborted) abort();
    else { signal.addEventListener('abort', abort, { once: true }); check(); }
  });
}
function retainRemaining(report, state) {
  for (const [kind, entries] of [['upload', report.uploads], ['question', report.questions]]) {
    for (const entry of entries) {
      if (!['planned', 'sending', 'submitting', 'running', 'queued', 'unfinished'].includes(entry.status)) continue;
      report.remaining.push({ kind, id: entry.id || entry.sequence, status: entry.status });
      entry.status = entry.status === 'planned' ? 'not-sent' : 'unfinished';
    }
  }
  if (state.session?.pending || state.session?.analyzing)
    report.remaining.push({ kind: 'analysis', pending: state.session.pending, analyzing: state.session.analyzing });
}
async function shutdown(host, report, loaded) {
  const result = { archiveConfirmed: false, releaseConfirmed: false, errors: [] };
  report.shutdown = result;
  try {
    await bounded(() => host.runtime.close(), loaded.scenario.closeWaitMs, host.clock);
    const end = host.runtime.lastEnd;
    result.archiveConfirmed = end?.archived === true;
    result.errors.push(...(end?.errors || []));
    result.releaseConfirmed = result.errors.length === 0;
  } catch (error) { result.errors.push({ code: error.code || 'TVLENS_REPLAY_CLOSE_FAILED' }); }
  try { await host.server.close(); }
  catch (error) { result.errors.push({ code: error.code || 'TVLENS_REPLAY_SERVER_CLOSE_FAILED' }); result.releaseConfirmed = false; }
}
async function drive(context, dependencies) {
  const initialLanguage = await setLanguage(context.loaded.uploads[0].language, context.transport, context.report);
  const calendar = schedule(context, initialLanguage);
  dependencies.onScheduled?.({ ...context.host, report: context.report });
  const reason = await waitForDrain(context, calendar);
  context.report.stopReason = reason;
  retainRemaining(context.report, context.observer.state);
  calendar.stop();
  await Promise.allSettled([...calendar.tasks]);
  context.observer.refresh();
  return reason;
}
function completed(report, reason) {
  return reason === 'drained' && !report.error && !report.transportStop && !report.guardFailures.length
    && report.shutdown?.releaseConfirmed === true && !report.remaining.length;
}
function recordFailure(error, report, observer) {
  report.error = { code: error.code || 'TVLENS_REPLAY_EXECUTION_FAILED' };
  retainRemaining(report, observer?.state || {});
}
async function execute(options, dependencies, loaded, report, writer) {
  const controller = new AbortController();
  const interrupt = () => controller.abort(options.signal.reason);
  if (options.signal?.aborted) interrupt();
  else options.signal?.addEventListener('abort', interrupt, { once: true });
  let host, observer, reason;
  try {
    host = await (dependencies.createHost || createHost)(options, dependencies, loaded, report);
    observer = observeHost(host, report, writer, host.runtimeOptions);
    await fs.mkdir(path.join(options.outputDir, 'uploads'), { mode: 0o700 });
    const transport = createTransport({ exchange: host.exchange, clock: host.clock, writer, signal: controller.signal,
      onTerminal: code => { report.transportStop = code; } });
    const context = { host, observer, options, loaded, report, writer, transport, clock: host.clock, signal: controller.signal, controller };
    report.reference = loaded.scenario.config.perceptionBackend === 'codex' ? 'codex' : null;
    await writer.save();
    if (loaded.scenario.surveillance) {
      report.surveillanceStart = await transport.request('/v1/surveillance/start', JSON.stringify({
        sessionId: report.sessionId, ...loaded.scenario.surveillance }));
    }
    reason = await drive(context, dependencies);
  } catch (error) {
    recordFailure(error, report, observer);
  } finally {
    if (host) await shutdown(host, report, loaded);
    observer?.detach();
    host?.sealDiagnostics();
    options.signal?.removeEventListener('abort', interrupt);
  }
  report.complete = completed(report, reason);
  report.status = report.complete ? 'complete' : 'incomplete';
  finalizeRoles(report);
}
module.exports = { execute };
