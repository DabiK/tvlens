const { createModel } = require("./latency-model.cjs");
const { createEnvironment } = require("./latency-environment.cjs");
const { createCapture } = require("./latency-capture.cjs");
const { createViews } = require("./latency-views.cjs");
const { caseReport } = require("./latency-trace.cjs");

const {
  CASES,
  DEFAULT_DELAYS,
  DELAYED_PERCEPTION,
  MAX_SCENARIO_MS,
  DRIVE_STEP_MS,
  VIEW_SETTLE_MS,
} = require("./latency-fixture.cjs");
const copy = (value) => JSON.parse(JSON.stringify(value));

async function createScenario(
  { id = CASES[0], ...overrides } = {},
  { createViews: makeViews = createViews } = {},
) {
  if (!CASES.includes(id)) throw new Error("Scénario inconnu.");
  const perception = id === "perception-delayed" ? DELAYED_PERCEPTION : {};
  const delays = { ...DEFAULT_DELAYS, ...perception, ...overrides };
  const env = createEnvironment();
  const events = [];
  const record = (kind, domain, atMs, fields = {}) =>
    events.push({
      sequence: events.length + 1,
      scenarioId: id,
      sessionId: "session-1",
      kind,
      domain,
      atMs,
      ...fields,
    });
  const views = await makeViews({ env, delays, record });
  const { session, deep, tools, checkpoint } = createModel({
    env,
    delays,
    views,
    record,
  });
  const capture = await createCapture({
    env,
    session,
    record,
    ingest: simulatedIngest({ env, delays, session, record }),
  });
  const advance = async (ms) => {
    await env.clock.advance(ms);
    views.assertHealthy();
  };
  const driveUntil = async (predicate) => {
    while (!predicate()) {
      if (env.io.now() >= MAX_SCENARIO_MS)
        throw new Error("Scénario hors de sa borne.");
      await advance(DRIVE_STEP_MS);
    }
  };
  const release = scenarioRelease({
    env,
    deep,
    session,
    capture,
    checkpoint,
    views,
    events,
  });
  const run = scenarioRunner({
    env,
    delays,
    capture,
    views,
    deep,
    session,
    driveUntil,
    advance,
    release,
    id,
    events,
    tools,
  });
  return { clock: env.clock, run, release, events };
}
function scenarioRelease({
  env,
  deep,
  session,
  capture,
  checkpoint,
  views,
  events,
}) {
  let disposed = false,
    cleanup;
  return async () => {
    if (disposed) return cleanup;
    disposed = true;
    try {
      deep.cancelAll();
      const closing = session.close();
      env.cancelWaits();
      await env.clock.advance(0);
      await capture.release();
      checkpoint.forget();
      await closing;
      views.tv.holdLate();
      views.release();
      const eventsBeforeProbe = events.length;
      const late = await views.probeLate();
      cleanup = {
        ...late,
        armed: env.clock.armed,
        lateEvents: events.length - eventsBeforeProbe,
      };
    } finally {
      env.release();
    }
    return cleanup;
  };
}
function simulatedIngest({ env, delays, session, record }) {
  return async (input) => {
    const correlation = { closedAtMs: input.endMs };
    record("capture.handed", "session", env.io.now(), {
      ...correlation,
    });
    await env.wait(delays.transportMs);
    record("transport.admitted", "session", env.io.now(), correlation);
    record("preparation.started", "session", env.io.now(), correlation);
    await env.wait(delays.preparationMs);
    record("preparation.finished", "session", env.io.now(), correlation);
    record("core.ingested", "session", env.io.now(), correlation);
    return session.ingest({
      ...input,
      ingest: { assembleMs: delays.preparationMs },
    });
  };
}
function scenarioRunner({
  env,
  delays,
  capture,
  views,
  deep,
  session,
  driveUntil,
  advance,
  release,
  id,
  events,
  tools,
}) {
  return async () => {
    try {
      await capture.startPreview();
      await capture.observe();
      session.emit();
      views.tv.start();
      await advance(delays.checkpointMs);
      const first = capture.checkpoint(delays.checkpointMs);
      await advance(delays.transportMs + delays.preparationMs);
      await first;
      await advance(delays.captureCloseMs - env.io.now());
      const stopped = capture.stop();
      await advance(delays.transportMs + delays.preparationMs);
      await stopped;
      if (delays.refuse !== "media") {
        if (id !== "perception-delayed")
          await driveUntil(() =>
            session.snapshot().segments.every((p) => p.status === "ready"),
          );
        deep.start("Que montrent les passages ?", {
          mode: "chat",
          anchorMs: delays.captureCloseMs,
        });
        if (id === "question-queued")
          deep.start("Qui intervient ?", {
            mode: "chat",
            anchorMs: delays.captureCloseMs,
          });
        views.tv.request();
        await driveUntil(() => deep.snapshot().jobs.every((j) => j.metrics));
        await driveUntil(() =>
          session.snapshot().segments.every((p) => p.status === "ready"),
        );
      }
      views.tv.request();
      await advance(delays.deliveryMs + VIEW_SETTLE_MS);
      // Une lecture conditionnelle identique exerce le vrai chemin 304, sans corps ni cartes.
      views.tv.request();
      await advance(delays.deliveryMs + VIEW_SETTLE_MS);
      const result = caseReport({
        id,
        delays,
        events,
        session: session.snapshot(),
        deep: copy(deep.snapshot()),
        tools,
        cards: views.cards(),
        cardsByQuestion: views.cardsByQuestion(),
        nodes: views.nodes(),
        stats: { ...views.tv.stats },
      });
      result.cleanup = await release();
      return result;
    } finally {
      await release();
    }
  };
}
module.exports = { createScenario, CASES };
