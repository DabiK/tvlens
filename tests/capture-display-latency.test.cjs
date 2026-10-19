const { test } = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_DELAYS } = require("../scripts/latency-fixture.cjs");
const {
  SERVER_ORIGIN_MS,
  CLIENT_ORIGIN_MS,
} = require("../scripts/latency-environment.cjs");
const { measureLatency } = require("../scripts/measure-latency.cjs");

test("offline memory publications read the application projection without legacy snapshots", async (t) => {
  const { createEnvironment } = require("../scripts/latency-environment.cjs");
  const { createModel } = require("../scripts/latency-model.cjs");
  const env = createEnvironment();
  const delivered = [];
  const { session } = createModel({
    env, delays: DEFAULT_DELAYS,
    views: { publish: (value) => delivered.push(value) }, record() {},
  });
  t.after(async () => { await session.close(); env.release(); });
  const snapshots = t.mock.method(session, "snapshot");
  session.emit();
  session.setQuestionPending(true);
  assert.deepEqual(delivered.map((value) => value.session.asking), [false, true]);
  assert.equal(snapshots.mock.callCount(), 0);
});

test("fresh offline runs produce identical versioned traces through both real card views", async () => {
  const first = await measureLatency();
  assert.equal(first?.schemaVersion, 1);
  assert.equal(first.units, "ms");
  assert.deepEqual(
    first.cases.map((entry) => entry.id),
    ["memory-ready", "perception-delayed", "question-queued"],
  );
  assert.equal(JSON.stringify(first), JSON.stringify(await measureLatency()));
  for (const entry of first.cases) {
    assert.equal(entry.passages.length, 2);
    for (const question of entry.questions)
      for (const client of ["mac", "tv"]) {
        assert.match(
          entry.cardsByQuestion?.[client]?.[question.id] || "",
          /Réponse simulée validée\./,
        );
        assert.ok(Number.isFinite(question.clients[client].clientAppliedMs));
      }
    assert.match(entry.cards.mac, /Réponse simulée validée\./);
    assert.match(entry.cards.tv, /Réponse simulée validée\./);
    assert.deepEqual(entry.cleanup, {
      armed: 0,
      frames: 0,
      lateApplications: 0,
      lateEvents: 0,
    });
  }
});

const { createScenario } = require("../scripts/measure-latency.cjs");
async function run(options) {
  const scenario = await createScenario(options);
  return scenario.run();
}

test("audio and vision delays affect their causal spans while transport and the other processing lane stay fixed", async () => {
  const base = await run();
  for (const [name, amount] of [
    ["audioMs", 50],
    ["visionMs", 50],
  ]) {
    const changed = await run({ [name]: base.parameters[name] + amount });
    for (let i = 0; i < 2; i++) {
      const before = base.passages[i].intervals,
        after = changed.passages[i].intervals;
      assert.equal(after[name] - before[name], amount);
      assert.equal(after.readyAfterCloseMs - before.readyAfterCloseMs, amount);
      assert.equal(
        after[name === "audioMs" ? "visionMs" : "audioMs"],
        before[name === "audioMs" ? "visionMs" : "audioMs"],
      );
      assert.equal(after.transportMs, before.transportMs);
      assert.equal(after.preparationMs, before.preparationMs);
      assert.equal(
        after.transcriptAfterCloseMs - before.transcriptAfterCloseMs,
        name === "audioMs" ? amount : 0,
      );
    }
    assert.equal(
      changed.questions[0].intervals.totalMs,
      base.questions[0].intervals.totalMs,
    );
    assert.equal(
      changed.questions[0].clients.mac.captureToApplicationMs -
        base.questions[0].clients.mac.captureToApplicationMs,
      amount,
    );
  }
});

test("a slower answer grows queue wait separately from the next question processing and acceptance duration", async () => {
  const base = await run({ id: "question-queued" });
  const addedResponseMs = 50;
  const changed = await run({
    id: "question-queued",
    responseMs: DEFAULT_DELAYS.responseMs + addedResponseMs,
  });
  const processingMs = DEFAULT_DELAYS.firstTextMs + DEFAULT_DELAYS.responseMs;
  const slowerProcessingMs = processingMs + addedResponseMs;
  const [first, second] = base.questions;
  assert.equal(first.intervals.waitMs, 0);
  assert.equal(second.intervals.waitMs, processingMs);
  assert.equal(second.intervals.totalMs, processingMs);
  assert.equal(second.intervals.endToEndMs, processingMs * 2);
  assert.equal(changed.questions[1].intervals.waitMs, slowerProcessingMs);
  assert.equal(changed.questions[1].intervals.totalMs, slowerProcessingMs);
  assert.equal(
    changed.questions[1].intervals.endToEndMs,
    slowerProcessingMs * 2,
  );
  assert.deepEqual(changed.passages, base.passages);
});

test("delivery delay moves actual receipt and application without changing perception or answer spans", async () => {
  const base = await run();
  const changed = await run({ deliveryMs: 65 });
  assert.deepEqual(changed.passages, base.passages);
  assert.deepEqual(changed.questions[0].intervals, base.questions[0].intervals);
  for (const client of ["mac", "tv"]) {
    const before = base.questions[0].clients[client],
      after = changed.questions[0].clients[client];
    assert.equal(
      after.publicationToReceiptMs - before.publicationToReceiptMs,
      50,
    );
    assert.equal(after.receiptToApplicationMs, before.receiptToApplicationMs);
    assert.equal(
      after.captureToApplicationMs - before.captureToApplicationMs,
      50,
    );
  }
});

test("empty progress, useful text and validated finish stay distinct with frozen availability and actual plural passage links", async () => {
  const ready = await run();
  const q = ready.questions[0];
  assert.equal(q.firstAgentMs, q.startedMs);
  assert.equal(q.firstTextMs - q.startedMs, ready.parameters.firstTextMs);
  assert.equal(q.firstUsefulMs, q.firstTextMs);
  assert.equal(q.finishedMs - q.firstTextMs, ready.parameters.responseMs);
  assert.equal(q.validation.acceptedCitations, 2);
  assert.deepEqual(
    q.passageLinks.map((p) => p.id),
    ["moment-1", "moment-2"],
  );
  const delayed = await run({ id: "perception-delayed" });
  const early = delayed.questions[0];
  assert.equal(early.availability.passages, 2);
  assert.equal(early.availability.throughMs, delayed.parameters.captureCloseMs);
  assert.deepEqual(
    early.passageLinks.map((p) => p.id),
    ["moment-1"],
  );
  assert.ok(
    early.startedMs - SERVER_ORIGIN_MS < delayed.passages[1].visionPublishedMs,
  );
  assert.equal(early.intervals.evidence.pendingCount, 2);
});

test("a 304 never adds receipt or application while Mac bursts apply only their final local emission", async () => {
  const result = await run();
  const events = result.events;
  const notModified = events.filter((e) => e.kind === "transport.not-modified");
  assert.ok(notModified.length >= 1);
  const tvReceived = events.filter(
    (e) => e.kind === "client.received" && e.client === "tv",
  );
  const tvApplied = events.filter(
    (e) => e.kind === "view.applied" && e.client === "tv",
  );
  assert.equal(tvReceived.length, result.polling.renders);
  assert.equal(tvApplied.length, tvReceived.length);
  assert.equal(
    result.polling.polls,
    result.polling.renders + result.polling.notModified,
  );
  const received = events.filter(
    (e) =>
      e.kind === "client.received" && e.client === "mac" && e.source === "deep",
  );
  const applied = events.filter(
    (e) =>
      e.kind === "view.applied" && e.client === "mac" && e.source === "deep",
  );
  assert.ok(received.length > applied.length);
  for (const e of applied) {
    const last = received.filter((r) => r.atMs <= e.atMs).at(-1);
    assert.equal(e.emissionId, last.emissionId);
  }
  assert.equal(result.nodes.mac, 1);
  assert.equal(result.nodes.tv, 1);
  assert.match(applied.at(-1).text, /Réponse simulée validée/);
  const fallback = await run({ fallback: true });
  const { FALLBACK_MS } = await import("../app/ui/state-delivery.mjs");
  assert.equal(
    fallback.questions[0].clients.mac.receiptToApplicationMs,
    FALLBACK_MS,
  );
  assert.deepEqual(fallback.cleanup, {
    armed: 0,
    frames: 0,
    lateApplications: 0,
    lateEvents: 0,
  });
});

test("shifting only the TV wall clock cannot alter the monotonic view durations", async () => {
  const base = await run();
  const shifted = await run({ tvWallOffsetMs: 86400000 });
  assert.deepEqual(shifted.questions, base.questions);
  assert.deepEqual(shifted.cards, base.cards);
  assert.deepEqual(shifted.events, base.events);
});

for (const refuse of ["media", "answer"]) {
  test(`a ${refuse} refusal releases capture, polling, drawings and pending callbacks`, async () => {
    const result = await run({ refuse });
    assert.deepEqual(result.cleanup, {
      armed: 0,
      frames: 0,
      lateApplications: 0,
      lateEvents: 0,
    });
    if (refuse === "media") assert.equal(result.passages.length, 0);
    else {
      assert.equal(result.questions[0].status, "error");
      assert.equal(result.questions[0].validation, null);
    }
  });
}

test("the French table separates preparation, publication, receipt and DOM application for each client", async () => {
  const { formatTable } = require("../scripts/measure-latency.cjs");
  const table = formatTable(await measureLatency());
  for (const label of [
    "Préparation",
    "Audio",
    "Vision",
    "Publication → réception Mac",
    "Réception → DOM Mac",
    "Publication → réception TV",
    "Réception → DOM TV",
  ])
    assert.ok(table.includes(label), label);
});

test("an agent with no useful streamed text keeps the missing text stamp null until its validated answer", async () => {
  const result = await run({ omitText: true });
  const q = result.questions[0];
  assert.equal(q.firstTextMs, null);
  assert.equal(q.intervals.firstTextMs, null);
  assert.equal(q.firstUsefulMs, q.finishedMs);
  assert.equal(q.firstAgentMs, q.startedMs);
  assert.equal(q.intervals.firstUsefulMs, q.intervals.totalMs);
});

test("passage queue stamps come from published states and every client emission refers to a real publication", async () => {
  const result = await run();
  for (const p of result.passages) {
    const queued = result.events.find(
      (e) =>
        e.kind === "server.published" &&
        e.source === "session" &&
        e.passages.some((s) => s.id === p.id && s.status === "queued"),
    );
    assert.ok(
      queued,
      "the audio queue must be observed before its processing starts",
    );
    assert.equal(p.audioQueuedMs, queued.atMs - SERVER_ORIGIN_MS);
    assert.equal(p.coreIngestedMs, p.preparationFinishedMs);
    assert.ok(p.transportAdmittedMs < p.coreIngestedMs);
  }
  for (const e of result.events.filter(
    (event) =>
      event.kind === "client.received" || event.kind === "view.applied",
  )) {
    const publication = result.events.find(
      (p) =>
        p.kind === "server.published" && p.publicationId === e.publicationId,
    );
    assert.ok(publication);
    assert.ok(e.atMs - CLIENT_ORIGIN_MS >= publication.atMs - SERVER_ORIGIN_MS);
  }
});

test("release leaves no late event or rearmed poll after resolving its withheld published body", async () => {
  const scenario = await createScenario();
  const result = await scenario.run();
  assert.equal(result.cleanup.lateEvents, 0);
  assert.equal(result.cleanup.armed, 0);
  assert.equal(scenario.clock.armed, 0);
  assert.equal(scenario.events.length, result.events.length);
});

test("perception durations measure the clock even when an injected wait outlasts its declared delay", async () => {
  const { createEnvironment } = require("../scripts/latency-environment.cjs");
  const { createModel } = require("../scripts/latency-model.cjs");
  const env = createEnvironment();
  const extraWaitMs = 7;
  const wait = env.wait;
  env.wait = (ms) => wait(ms + extraWaitMs);
  const delays = { ...DEFAULT_DELAYS };
  const { session } = createModel({
    env,
    delays,
    views: { publish() {} },
    record() {},
  });
  try {
    await env.clock.advance(delays.checkpointMs);
    await session.ingest({
      startMs: 0,
      endMs: delays.checkpointMs,
      frames: [],
      audio: new Uint8Array([1]),
    });
    await env.clock.advance(delays.checkpointMs);
    const p = session.snapshot().segments[0];
    assert.equal(p.audioMs, p.transcriptPublishedMs - p.audioStartedMs);
    assert.equal(p.visionMs, p.visionPublishedMs - p.visionStartedMs);
    assert.equal(p.audioMs, delays.audioMs + extraWaitMs);
    assert.equal(p.visionMs, delays.visionMs + extraWaitMs);
  } finally {
    await session.close();
    env.release();
  }
});

test("question occupancy publishes both asking transitions before the matching deep state", async () => {
  const result = await run();
  const transitions = result.events
    .filter(
      (e) =>
        e.kind === "server.published" &&
        e.source === "session" &&
        e.asking !== undefined,
    )
    .filter(
      (e, index, events) =>
        index === 0 || e.asking !== events[index - 1].asking,
    );
  assert.deepEqual(
    transitions.map((e) => e.asking),
    [false, true, false],
  );
  const starts = result.events.find(
    (e) =>
      e.kind === "server.published" && e.source === "deep" && e.jobs.length,
  );
  assert.ok(transitions[1].sequence < starts.sequence);
  const finished = result.events.find(
    (e) =>
      e.kind === "server.published" &&
      e.source === "deep" &&
      e.jobs.some((j) => j.status === "done"),
  );
  assert.ok(transitions[2].sequence < finished.sequence);
});

test("vision held by a question restarts after its final deep publication", async () => {
  const result = await run({ id: "perception-delayed", responseMs: 600 });
  const finished = result.events.find(
    (e) =>
      e.kind === "server.published" &&
      e.source === "deep" &&
      e.jobs.some((j) => j.status === "done"),
  );
  const vision = result.events.find(
    (e) =>
      e.kind === "server.published" &&
      e.source === "session" &&
      e.passages.some(
        (p) => p.id === "moment-2" && p.visionStatus === "analyzing",
      ),
  );
  assert.ok(
    vision.sequence > finished.sequence,
    "resumed vision is published after the completed question",
  );
});

test("transport and preparation correlate to the captured bounds when the cut points change", async () => {
  const checkpointMs = 700,
    captureCloseMs = 1400;
  const result = await run({ checkpointMs, captureCloseMs });
  assert.deepEqual(
    result.passages.map((p) => p.closedAtMs),
    [checkpointMs, captureCloseMs],
  );
  for (const p of result.passages) {
    const admitted = result.events.find(
      (e) => e.kind === "transport.admitted" && e.closedAtMs === p.closedAtMs,
    );
    assert.ok(admitted);
    assert.equal(p.transportAdmittedMs, admitted.atMs);
    assert.equal(p.intervals.preparationMs, result.parameters.preparationMs);
    assert.equal(p.intervals.transportMs, result.parameters.transportMs);
    assert.equal(p.coreIngestedMs, p.preparationFinishedMs);
  }
});

test("the schema assigns session bounds and server question stamps their distinct clock domains", async () => {
  const result = await measureLatency();
  const fields = result.clocks.fields;
  assert.equal(fields["questions.*.anchorMs"], "session");
  assert.equal(fields["questions.*.availability.throughMs"], "session");
  assert.equal(fields["questions.*.availability.lastPassage.endMs"], "session");
  assert.equal(fields["questions.*.startedMs"], "server-wall");
  assert.equal(fields["questions.*.finishedMs"], "server-wall");
  assert.equal(fields["questions.*.intervals.totalMs"], "duration");
});

test("client transport stamps use names distinct from the core ingestion receivedMs", async () => {
  const result = await measureLatency();
  assert.equal(
    result.clocks.fields["questions.*.clients.*.clientReceivedMs"],
    "client-monotonic",
  );
  assert.equal(
    result.clocks.fields["questions.*.clients.*.clientAppliedMs"],
    "client-monotonic",
  );
  for (const c of result.cases)
    for (const q of c.questions)
      for (const client of Object.values(q.clients)) {
        assert.equal("receivedMs" in client, false);
        assert.equal("appliedMs" in client, false);
        assert.ok(Number.isFinite(client.clientReceivedMs));
        assert.ok(Number.isFinite(client.clientAppliedMs));
      }
});

test("the configured first text delay is observed separately from final response processing", async () => {
  const firstTextMs = 70;
  const result = await run({ firstTextMs });
  const q = result.questions[0];
  assert.equal(q.firstTextMs - q.startedMs, firstTextMs);
  assert.equal(q.intervals.totalMs, firstTextMs + result.parameters.responseMs);
});

test("a scenario released before running needs no published body and owns no remaining timers", async () => {
  const scenario = await createScenario();
  let cleanup;
  await assert.doesNotReject(async () => {
    cleanup = await scenario.release();
  });
  assert.deepEqual(cleanup, {
    armed: 0,
    frames: 0,
    lateApplications: 0,
    lateEvents: 0,
  });
  assert.equal(scenario.clock.armed, 0);
  assert.equal(await scenario.release(), cleanup);
  assert.deepEqual(scenario.events, []);
});

test("a failure before ingestion propagates its original cause and clears scheduled deliveries", async () => {
  const scenario = await createScenario();
  const failure = Object.assign(new Error("Advance refused"), {
    code: "SIMULATED_ADVANCE_REFUSAL",
  });
  const advance = scenario.clock.advance;
  scenario.clock.advance = (ms) =>
    ms > 0 ? Promise.reject(failure) : advance(ms);
  await assert.rejects(scenario.run(), (error) => error === failure);
  assert.deepEqual(await scenario.release(), {
    armed: 0,
    frames: 0,
    lateApplications: 0,
    lateEvents: 0,
  });
  assert.equal(scenario.clock.armed, 0);
});

test("nominal scenarios publish a real initial state before their first TV request and never refuse transport", async () => {
  const result = await measureLatency();
  for (const c of result.cases) {
    assert.deepEqual(
      c.events.filter((e) => e.kind === "transport.refused"),
      [],
    );
    const firstRequest = c.events.find(
      (e) => e.kind === "client.requested" && e.client === "tv",
    );
    assert.ok(firstRequest);
    assert.ok(
      c.events.some(
        (e) =>
          e.kind === "server.published" &&
          e.publicationId === firstRequest.publicationId &&
          e.sequence < firstRequest.sequence,
      ),
    );
  }
});

test("a TV callback exception is preserved as a scenario failure instead of a transport refusal", async () => {
  const { createEnvironment } = require("../scripts/latency-environment.cjs");
  const { createViews } = require("../scripts/latency-views.cjs");
  const env = createEnvironment();
  const events = [];
  const views = await createViews({
    env,
    delays: DEFAULT_DELAYS,
    record: (kind) => events.push(kind),
  });
  const failure = Object.assign(new Error("Invalid body"), {
    code: "SIMULATED_INVALID_BODY",
  });
  const deep = {
    get jobs() {
      throw failure;
    },
  };
  try {
    views.tv.publish({ id: 1, session: { id: "session-1" }, deep });
    views.tv.start();
    await env.clock.advance(DEFAULT_DELAYS.deliveryMs);
    assert.throws(
      () => views.assertHealthy?.(),
      (error) => error === failure,
    );
    assert.equal(events.includes("transport.refused"), false);
  } finally {
    views.release();
    env.release();
  }
});

test("an unexpected TV receive exception rejects the conductor with its original cause after cleanup", async () => {
  for (const failOnReceipt of [1, 2, 3]) {
    let receipts = 0;
    const { createViews } = require("../scripts/latency-views.cjs");
    const failure = Object.assign(new Error("Reception failed"), {
      code: "SIMULATED_RECEIVE_FAILURE",
    });
    const scenario = await createScenario(
      {},
      {
        createViews: (options) =>
          createViews({
            ...options,
            record: (kind, domain, atMs, fields) => {
              if (
                kind === "client.received" &&
                fields.client === "tv" &&
                ++receipts === failOnReceipt
              )
                throw failure;
              options.record(kind, domain, atMs, fields);
            },
          }),
      },
    );
    await assert.rejects(scenario.run(), (error) => error === failure);
    assert.equal(
      scenario.events.some((e) => e.kind === "transport.refused"),
      false,
    );
    assert.deepEqual(await scenario.release(), {
      armed: 0,
      frames: 0,
      lateApplications: 0,
      lateEvents: 0,
    });
    assert.equal(scenario.clock.armed, 0);
  }
});

test("only an explicitly simulated transport refusal produces a refusal event with its stable code", async () => {
  const {
    SIMULATED_TRANSPORT_REFUSAL,
  } = require("../scripts/latency-fixture.cjs");
  const result = await run({ refuse: "transport" });
  const refusals = result.events.filter((e) => e.kind === "transport.refused");
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0].code, SIMULATED_TRANSPORT_REFUSAL);
  assert.ok(
    result.events.some(
      (e) =>
        e.kind === "client.requested" &&
        e.client === "tv" &&
        e.sequence < refusals[0].sequence,
    ),
  );
  assert.deepEqual(result.cleanup, {
    armed: 0,
    frames: 0,
    lateApplications: 0,
    lateEvents: 0,
  });
});
