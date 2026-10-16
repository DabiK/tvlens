const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runTurn } = require("../adapters/codex-session-run.cjs");
const { manualClock } = require("./helpers/clock.cjs");
const { deferred, turns } = require("./helpers/wait.cjs");
const { getEventListeners } = require("node:events");
const { CodexSessionClient } = require("../adapters/codex-session-client.cjs");
const { dynamicTools } = require("../adapters/codex-tool-definitions.cjs");

function fixture({ prepare, request, quota } = {}) {
  const clock = manualClock();
  const requests = [],
    progress = [],
    traces = [];
  const controller = new AbortController();
  let closes = 0;
  const state = {
    model: "model",
    reasoningEffort: "low",
    quota,
    rpc: {
      close: () => closes++,
      request(method, params) {
        requests.push({ method, params });
        if (request) return request(method, params, state);
        return Promise.resolve({ turn: { id: "turn", status: "inProgress" } });
      },
    },
  };
  const effects = {
    ...clock.io,
    trace: (...args) => traces.push(args),
    async prepare(sessionId) {
      await prepare?.(sessionId);
      Object.assign(state, {
        sessionId,
        threadId: "thread",
        ready: Promise.resolve("thread"),
      });
    },
  };
  const input = {
    jobId: "job",
    sessionId: "session",
    instructions: "Décris.",
    tools: { call: () => deferred().promise },
    signal: controller.signal,
    onProgress: (value) => progress.push(value),
  };
  return {
    state,
    effects,
    clock,
    controller,
    input,
    requests,
    progress,
    traces,
    run: (extra = {}) => runTurn(state, { ...input, ...extra }, effects),
    closes: () => closes,
  };
}

function assertClean(f) {
  assert.equal(f.state.active, null);
  assert.equal(f.clock.armed, 0);
  assert.deepEqual(getEventListeners(f.controller.signal, "abort"), []);
}

async function start(f, extra) {
  const pending = f.run(extra);
  pending.catch(() => {});
  await turns(1);
  assert.equal(f.requests[0]?.method, "turn/start");
  return { pending };
}

test("an already cancelled turn sends nothing and never prepares a connection", async () => {
  const reason = Error("cancelled");
  const requests = [];
  const state = { rpc: { request: (...args) => requests.push(args) } };
  const prepare = () => assert.fail("a cancelled turn must not prepare");
  await assert.rejects(
    runTurn(state, { signal: AbortSignal.abort(reason) }, { prepare }),
    (error) => error === reason,
  );
  assert.deepEqual(requests, []);
});

test("cancellation during preparation sends no start and installs no turn resources", async () => {
  const gate = deferred();
  const f = fixture({ prepare: () => gate.promise });
  const pending = f.run();
  const reason = Error("preparation cancelled");
  f.controller.abort(reason);
  gate.resolve();
  await assert.rejects(pending, (error) => error === reason);
  assert.deepEqual(f.requests, []);
  assert.equal(f.clock.armed, 0);
  assert.deepEqual(getEventListeners(f.controller.signal, "abort"), []);
});

test("invalid media is refused before preparation or transport", async () => {
  const f = fixture({
    prepare: () => assert.fail("invalid input must not connect"),
  });
  await assert.rejects(
    f.run({
      mediaInput: [{ type: "image", url: "file:///private/image.jpg" }],
    }),
    /Entrée média non autorisée/,
  );
  assert.deepEqual(f.requests, []);
});

test("run sends the same protocol and overrides provider metrics with cold and warm durations", async () => {
  const gate = deferred();
  const f = fixture({ prepare: () => gate.promise });
  const outputSchema = { type: "object" };
  const mediaInput = [{ type: "image", url: "data:image/jpeg;base64,YQ==" }];
  const pending = f.run({ mediaInput, outputSchema });
  await f.clock.advance(40);
  gate.resolve();
  await turns(1);
  assert.deepEqual(f.requests, [
    {
      method: "turn/start",
      params: {
        threadId: "thread",
        input: [{ type: "text", text: "Décris." }, ...mediaInput],
        model: "model",
        effort: "low",
        summary: "none",
        outputSchema,
      },
    },
  ]);
  assert.equal(f.state.active.tools, f.input.tools);
  f.state.active.audit.push({ tool: "inspect_clip", status: "completed" });
  await f.clock.advance(20);
  f.state.active.resolve(
    '{"answer":"ok","elapsedMs":-1,"coldStart":"spoofed","connectMs":-1}',
  );
  assert.deepEqual(await pending, {
    answer: "ok",
    audit: [{ tool: "inspect_clip", status: "completed" }],
    threadId: "thread",
    elapsedMs: 60,
    coldStart: true,
    connectMs: 40,
  });
  assert.deepEqual(f.progress, [{ message: "Connexion à Codex…" }]);
  assertClean(f);
  const warm = await start(f);
  await f.clock.advance(10);
  f.state.active.resolve('{"answer":"warm"}');
  const result = await warm.pending;
  assert.deepEqual(
    [result.coldStart, result.connectMs, result.elapsedMs],
    [false, 0, 10],
  );
  assert.deepEqual(f.progress, [
    { message: "Connexion à Codex…" },
    { message: "Lecture du contexte de la session…" },
  ]);
  assertClean(f);
});

for (const mode of ["pending", "rejected", "throwing"]) {
  test(`a ${mode} quota read stays informative and never delays the turn`, async () => {
    let checked;
    const f = fixture({
      quota: {
        check(rpc) {
          checked = rpc;
          if (mode === "throwing") throw Error("quota unavailable");
          return mode === "pending"
            ? deferred().promise
            : Promise.reject(Error("quota refused"));
        },
      },
    });
    const { pending } = await start(f);
    assert.equal(checked, f.state.rpc);
    f.state.active.resolve('{"ok":true}');
    assert.equal((await pending).ok, true);
    assertClean(f);
  });
}

for (const timing of ["before acknowledgment", "during turn"]) {
  test(`cancellation ${timing} interrupts the acknowledged turn and cleans its listener`, async () => {
    const ack = deferred();
    const f = fixture({
      request: (method) =>
        method === "turn/start" ? ack.promise : Promise.resolve({}),
    });
    const { pending } = await start(f);
    const reason = Error("cancelled");
    if (timing === "during turn") {
      ack.resolve({ turn: { id: "turn" } });
      await turns(1);
    }
    f.controller.abort(reason);
    if (timing === "before acknowledgment") {
      assert.equal(f.requests.length, 1);
      ack.resolve({ turn: { id: "turn" } });
      await turns(1);
    }
    assert.deepEqual(f.requests.at(-1), {
      method: "turn/interrupt",
      params: { threadId: "thread", turnId: "turn" },
    });
    f.state.active.resolve('{"answer":"late"}');
    await assert.rejects(pending, (error) => error === reason);
    assert.deepEqual(f.progress, [
      { message: "Connexion à Codex…" },
      { message: "Annulation…" },
      ...(timing === "before acknowledgment"
        ? [{ message: "Annulation…" }]
        : []),
    ]);
    assertClean(f);
  });
}

test("a refused start rejects with the original error and removes turn resources", async () => {
  const error = Object.assign(Error("start refused"), {
    code: "START_REFUSED",
  });
  const f = fixture({ request: () => Promise.reject(error) });
  await assert.rejects(f.run(), (actual) => actual === error);
  assertClean(f);
  assert.equal(
    f.traces.some(([event]) => event === "turn.rejected"),
    true,
  );
});

test("a synchronous start failure and malformed final JSON also clean up", async () => {
  const error = Error("transport failed");
  const broken = fixture({
    request: () => {
      throw error;
    },
  });
  await assert.rejects(broken.run(), (actual) => actual === error);
  assertClean(broken);
  const f = fixture();
  const { pending } = await start(f);
  f.state.active.resolve("unreadable");
  await assert.rejects(pending, SyntaxError);
  assertClean(f);
});

test("watchdog closes after three seconds of unconfirmed cancellation and leaves no timer", async () => {
  const f = fixture();
  const { pending } = await start(f);
  await f.clock.advance(100);
  const reason = Error("cancelled");
  f.controller.abort(reason);
  await f.clock.advance(2999);
  assert.equal(f.closes(), 0);
  await f.clock.advance(901);
  await assert.rejects(pending, (error) => error === reason);
  assert.equal(f.closes(), 1);
  assertClean(f);
  await f.clock.advance(10000);
  assert.equal(f.closes(), 1);
});

test("a first turn rejection wins over transport closure while waiting for start", async () => {
  const ack = deferred();
  const f = fixture({ request: () => ack.promise });
  const { pending } = await start(f);
  const error = Object.assign(Error("authentication refused"), {
    authRequired: true,
  });
  f.state.active.reject(error);
  ack.reject(Error("connection closed"));
  await assert.rejects(pending, (actual) => actual === error);
  assert.equal(f.state.ready, null);
  assertClean(f);
});

test("a completed turn still waits for the start acknowledgment", async () => {
  const ack = deferred();
  const f = fixture({ request: () => ack.promise });
  const { pending } = await start(f);
  f.state.active.resolve('{"ok":true}');
  const error = Error("start refused");
  ack.reject(error);
  await assert.rejects(pending, (actual) => actual === error);
  assertClean(f);
});

test("run waits for an abandoned turn drain and cancellation while waiting sends nothing", async () => {
  const gate = deferred();
  const f = fixture();
  f.state.draining = { ended: gate.promise };
  f.effects.drained = () => gate.promise;
  const pending = f.run();
  await turns(1);
  assert.deepEqual(f.requests, []);
  const reason = Error("drain cancelled");
  f.controller.abort(reason);
  gate.resolve();
  await assert.rejects(pending, (actual) => actual === reason);
  assert.deepEqual(f.requests, []);
});

test("a deferred tool shares the installed activity and cannot return success after cancellation", async () => {
  const f = fixture();
  const gate = deferred();
  const calls = [];
  const client = Object.assign(
    new CodexSessionClient({ toolDefinitions: dynamicTools }),
    f.state,
  );
  const tools = {
    call(name, args) {
      calls.push({ name, args });
      return gate.promise;
    },
  };
  const effects = {
    ...f.effects,
    prepare: async () =>
      Object.assign(client, {
        threadId: "thread",
        sessionId: "session",
        ready: Promise.resolve("thread"),
      }),
  };
  const pending = runTurn(client, { ...f.input, tools }, effects);
  pending.catch(() => {});
  await turns(1);
  assert.equal(f.requests[0]?.method, "turn/start");
  const tool = client.tool("item/tool/call", {
    threadId: "thread",
    turnId: "turn",
    tool: "inspect_clip",
    arguments: { startMs: 0, endMs: 1000 },
  });
  assert.deepEqual(calls, [
    { name: "inspect_clip", args: { startMs: 0, endMs: 1000 } },
  ]);
  f.controller.abort(Error("cancelled"));
  gate.resolve({ summary: "late result" });
  assert.equal((await tool).success, false);
  assert.deepEqual(client.active.audit, [
    { tool: "inspect_clip", status: "failed" },
  ]);
  const interrupted = Object.assign(Error("Recherche annulée."), {
    turnStatus: "interrupted",
  });
  client.active.reject(interrupted);
  await assert.rejects(pending, (actual) => actual === interrupted);
  assertClean({ ...f, state: client });
});
