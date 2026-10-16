const { safeError } = require("./chat-trace.cjs");
const { validMediaInput } = require("./codex-confinement.cjs");

const TVLENS_CODEX_INPUT_REFUSED = "TVLENS_CODEX_INPUT_REFUSED";
const WATCHDOG_INTERVAL_MS = 1000;
const INTERRUPT_GRACE_MS = 3000;

function prepareTurn(state, input, effects) {
  const { signal, sessionId, onProgress, mediaInput = [] } = input;
  signal.throwIfAborted();
  // Checked before anything is connected or sent: a path or remote URL must never reach turn/start.
  if (!validMediaInput(mediaInput))
    throw Object.assign(Error("Entrée média non autorisée."), { code: TVLENS_CODEX_INPUT_REFUSED });
  const started = effects.now();
  // Cold when this turn must await a connection: none yet, another session, or a reconnect still in flight.
  const coldStart =
    !state.ready || !state.threadId || state.sessionId !== sessionId;
  onProgress?.({
    message: state.ready
      ? "Lecture du contexte de la session…"
      : "Connexion à Codex…",
  });
  return { started, coldStart };
}

function finishPreparation(state, input, timing, effects) {
  timing.connectMs = timing.coldStart ? effects.now() - timing.started : 0;
  input.signal.throwIfAborted();
  // Quota is informational: neither a synchronous failure nor a pending read affects the turn.
  try {
    Promise.resolve(state.quota?.check(state.rpc)).catch(() => {});
  } catch {
    // A quota provider can throw before returning a promise; the turn still proceeds.
  }
}

function installActivity(state, input) {
  let resolve, reject;
  const done = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  done.catch(() => {});
  const { jobId, tools, signal, onProgress } = input;
  const active = (state.active = {
    jobId,
    tools,
    signal,
    onProgress,
    resolve,
    reject,
    audit: [],
    text: "",
    final: "",
    lastPreview: 0,
    turnId: null,
  });
  return { active, done };
}

function installInterruption(state, active, effects) {
  const { signal, onProgress } = active;
  const interruption = { abortedAt: 0, watchdog: undefined };
  interruption.abort = () => {
    interruption.abortedAt ||= effects.now();
    effects.trace("abort.requested", { error: safeError(signal.reason) });
    onProgress?.({ message: "Annulation…" });
    if (active.turnId) {
      state.rpc
        .request("turn/interrupt", {
          threadId: state.threadId,
          turnId: active.turnId,
        })
        .catch(() => {});
    }
  };
  signal.addEventListener("abort", interruption.abort, { once: true });
  return interruption;
}

function startTurn(state, input, activity, effects) {
  effects.trace("turn.start.request", { model: state.model });
  return new Promise((acknowledge, fail) => {
    // Preserve the first turn rejection before closing the transport also rejects turn/start.
    activity.done.catch(fail);
    state.rpc
      .request("turn/start", {
        threadId: state.threadId,
        input: [
          { type: "text", text: input.instructions },
          ...(input.mediaInput || []),
        ],
        model: state.model || null,
        effort: state.reasoningEffort,
        summary: "none",
        outputSchema: input.outputSchema,
      })
      .then(acknowledge, fail);
  });
}

function acknowledgeStart(activity, response, interruption, effects) {
  activity.active.turnId = response.turn.id;
  effects.trace("turn.start.ack", { status: response.turn.status });
  if (activity.active.signal.aborted) interruption.abort();
}

function watchInterruption(state, signal, interruption, effects) {
  return new Promise((_, fail) => {
    const check = () => {
      interruption.watchdog = effects.setTimer(() => {
        if (
          signal.aborted &&
          effects.now() - interruption.abortedAt >= INTERRUPT_GRACE_MS
        ) {
          effects.trace("watchdog.close");
          state.rpc.close();
          fail(signal.reason);
        } else check();
      }, WATCHDOG_INTERVAL_MS);
      // A turn on a transport double must not hold an otherwise idle host alive.
      interruption.watchdog.unref?.();
    };
    check();
  });
}

function turnResult(state, active, raw, timing, effects) {
  active.signal.throwIfAborted();
  const result = JSON.parse(raw);
  return {
    ...result,
    audit: active.audit,
    threadId: state.threadId,
    elapsedMs: effects.now() - timing.started,
    coldStart: timing.coldStart,
    connectMs: timing.connectMs,
  };
}

function cleanupTurn(state, active, interruption, effects) {
  effects.trace("turn.finished", { aborted: active.signal.aborted });
  effects.clearTimer(interruption.watchdog);
  active.signal.removeEventListener("abort", interruption.abort);
  if (state.active === active) state.active = null;
}

async function runTurn(state, input, effects) {
  // A refused turn must finish its drain before the next turn can receive notifications.
  if (state.draining) await effects.drained(input.signal);
  const timing = prepareTurn(state, input, effects);
  await effects.prepare(input.sessionId);
  finishPreparation(state, input, timing, effects);
  const activity = installActivity(state, input);
  const interruption = installInterruption(state, activity.active, effects);
  try {
    const response = await startTurn(state, input, activity, effects);
    acknowledgeStart(activity, response, interruption, effects);
    const interrupted = watchInterruption(
      state,
      input.signal,
      interruption,
      effects,
    );
    const raw = await Promise.race([activity.done, interrupted]);
    return turnResult(state, activity.active, raw, timing, effects);
  } catch (error) {
    effects.trace("turn.rejected", {
      error: safeError(error),
      auditCount: activity.active.audit.length,
    });
    // Stale authentication requires a new connection on the next question, without retrying this one.
    if (error?.authRequired) state.ready = null;
    throw error;
  } finally {
    cleanupTurn(state, activity.active, interruption, effects);
  }
}

module.exports = { runTurn, TVLENS_CODEX_INPUT_REFUSED };
