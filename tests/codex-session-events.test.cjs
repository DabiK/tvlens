const { test } = require("node:test");
const assert = require("node:assert/strict");
const events = require("../adapters/codex-session-events.cjs");
const { CodexSessionClient } = require("../adapters/codex-session-client.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

function fixture() {
  const progress = [],
    resolved = [],
    rejected = [],
    traces = [],
    refused = [];
  const state = {
    threadId: "current",
    ready: Promise.resolve(),
    opened: new Set(),
    threads: {
      own: new Set(["current", "old"]),
      announced: new Set(),
      starting: 0,
    },
    active: {
      text: "",
      final: "",
      audit: [],
      lastPreview: 0,
      turnId: null,
      onProgress: (value) => progress.push(value),
      resolve: (value) => resolved.push(value),
      reject: (error) => rejected.push(error),
    },
  };
  const effects = {
    now: () => 1000,
    guardThreads: true,
    trace: (...args) => traces.push(args),
    foreignThread: () => refused.push("thread"),
    acceptItem: () => true,
  };
  const emit = (method, params = {}) =>
    events.dispatchEvent(state, effects, method, {
      threadId: "current",
      ...params,
    });
  return {
    state,
    effects,
    emit,
    progress,
    resolved,
    rejected,
    traces,
    refused,
  };
}

test("connection closure invalidates readiness, releases the drain and rejects the turn", () => {
  const rejected = [];
  let ended = 0;
  const state = {
    ready: Promise.resolve(),
    draining: { end: () => ended++ },
    active: { reject: (error) => rejected.push(error) },
  };
  events.connectionClosed(state);
  assert.equal(state.ready, null);
  assert.equal(ended, 1);
  assert.equal(
    rejected[0]?.message,
    "Connexion Codex interrompue. Réessaie la question.",
  );
});

for (const [handler, params] of [
  ["threadStarted", { thread: { id: "foreign" } }],
  ["threadStatusChanged", { threadId: "foreign", status: { type: "idle" } }],
]) {
  test(`${handler} refuses foreign threads and defers announcements while starting`, () => {
    const f = fixture();
    events[handler](f.state, f.effects, params);
    assert.deepEqual(f.refused, ["thread"]);
    f.refused.length = 0;
    f.state.threads.starting = 1;
    events[handler](f.state, f.effects, params);
    assert.deepEqual([...f.state.threads.announced], ["foreign"]);
    assert.deepEqual(f.refused, []);
    f.effects.guardThreads = false;
    f.state.threads.announced.clear();
    events[handler](f.state, f.effects, params);
    assert.equal(f.state.threads.announced.size, 0);
  });
}

test("turn start takes its id once and completion resolves final or streamed text", () => {
  const f = fixture();
  events.turnStarted(f.state, f.effects, { turn: { id: "turn" } });
  events.turnStarted(f.state, f.effects, { turn: { id: "other" } });
  assert.equal(f.state.active.turnId, "turn");
  f.state.active.text = '{"answer":"stream"}';
  events.turnCompleted(f.state, f.effects, {
    turn: { id: "turn", status: "completed" },
  });
  f.state.active.final = '{"answer":"final"}';
  events.turnCompleted(f.state, f.effects, {
    turn: { id: "turn", status: "completed" },
  });
  assert.deepEqual(f.resolved, ['{"answer":"stream"}', '{"answer":"final"}']);
});

for (const status of ["interrupted", "failed", "auth"]) {
  test(`turn completion preserves ${status} diagnostics and redacts error notifications`, () => {
    const f = fixture();
    events.turnError(f.state, f.effects, {
      error: {
        code: "STREAM_LOST",
        message: "unauthorized (401) https://private.example/ token=secret",
      },
    });
    assert.deepEqual(f.state.active.lastError, {
      code: "STREAM_LOST",
      message: "unauthorized (401) [url] token=[redacted]",
    });
    const turn = { id: "turn", status: status === "auth" ? "failed" : status };
    if (status === "failed")
      turn.error = { code: "FAILED", message: "generic failure" };
    events.turnCompleted(f.state, f.effects, { turn });
    const error = f.rejected[0];
    assert.equal(error?.turnStatus, turn.status);
    assert.equal(error.authRequired, status === "auth" ? true : undefined);
    assert.equal(
      error.turnError.code,
      status === "failed" ? "FAILED" : "STREAM_LOST",
    );
    if (status === "interrupted")
      assert.equal(error.message, "Recherche annulée.");
  });
}

test("item start reports concise progress without exposing reasoning", () => {
  const f = fixture();
  for (const item of [
    { type: "webSearch", action: { type: "search" } },
    { type: "webSearch", action: { type: "openPage" } },
    { type: "agentMessage" },
    { type: "reasoning", text: "private reasoning" },
  ])
    events.itemStarted(f.state, f.effects, { item });
  assert.deepEqual(f.progress, [
    { message: "Recherche sur Internet…" },
    { message: "Consultation d’une source…" },
    { message: "Rédaction de la réponse…" },
    { message: "Codex examine le contexte…" },
  ]);
});

test("deltas throttle answer previews and terminal messages keep commentary separate", () => {
  const f = fixture();
  events.agentMessageDelta(f.state, f.effects, {
    delta: '{"answer":"Une \\"citation',
  });
  f.effects.now = () => 1080;
  events.agentMessageDelta(f.state, f.effects, { delta: " longue" });
  assert.deepEqual(
    f.progress.map((p) => p.preview),
    ['Une "citation'],
  );
  f.effects.now = () => 1081;
  events.agentMessageDelta(f.state, f.effects, { delta: '"}' });
  assert.equal(f.progress.at(-1)?.preview, 'Une "citation longue');
  events.itemCompleted(f.state, f.effects, {
    item: { type: "agentMessage", phase: "commentary", text: "p".repeat(1700) },
  });
  assert.equal(f.progress.at(-1).provisional.length, 1600);
  assert.equal(f.state.active.final, "");
  events.itemCompleted(f.state, f.effects, {
    item: { type: "agentMessage", text: "terminal" },
  });
  assert.equal(f.state.active.final, "terminal");
});

test("completed searches and grouped page openings preserve audit and canonical source keys", () => {
  const f = fixture();
  events.itemCompleted(f.state, f.effects, {
    item: {
      id: "search",
      type: "webSearch",
      action: { type: "search", url: "https://example.org/listed" },
    },
  });
  events.itemCompleted(f.state, f.effects, {
    item: {
      id: "open",
      type: "webSearch",
      action: { type: "other" },
      results: [
        { ref_id: "turn1view0", url: "https://example.org/a#part" },
        { ref_id: "turn1view1", url: "https://example.org/b" },
      ],
    },
  });
  assert.deepEqual(
    [...f.state.opened],
    ["https://example.org/a", "https://example.org/b"],
  );
  assert.deepEqual(f.state.active.audit, [
    {
      tool: "web_search",
      action: "search",
      url: "https://example.org/listed",
      status: "completed",
      itemId: "search",
    },
    {
      tool: "web_search",
      action: "other",
      url: "https://example.org/a#part",
      status: "completed",
      itemId: "open",
      opened: true,
    },
    {
      tool: "web_search",
      action: "other",
      url: "https://example.org/b",
      status: "completed",
      itemId: "open",
      opened: true,
      grouped: true,
    },
  ]);
  assert.deepEqual(f.progress, [
    { message: "Source consultée : example.org" },
    { message: "Source consultée : example.org" },
  ]);
});

test("dispatch ignores old threads and turns and checks item refusal before progress", () => {
  const f = fixture();
  f.emit("turn/started", { turn: { id: "turn" } });
  assert.equal(f.state.active.turnId, "turn");
  f.emit("item/agentMessage/delta", {
    threadId: "old",
    turnId: "turn",
    delta: "stale",
  });
  f.emit("item/agentMessage/delta", { turnId: "old-turn", delta: "stale" });
  f.emit("turn/completed", { turn: { id: "old-turn", status: "completed" } });
  assert.equal(f.state.active.text, "");
  assert.deepEqual(f.resolved, []);
  const guarded = [];
  f.effects.acceptItem = (active, method, params) => {
    guarded.push([active, method, params.item.type]);
    return false;
  };
  for (const method of ["item/started", "item/completed"])
    f.emit(method, { item: { type: "webSearch" } });
  assert.deepEqual(
    guarded.map((g) => g.slice(1)),
    [
      ["item/started", "webSearch"],
      ["item/completed", "webSearch"],
    ],
  );
  assert.deepEqual(f.progress, []);
  assert.deepEqual(f.state.active.audit, []);
  f.emit("item/started", {
    threadId: "foreign",
    item: { type: "commandExecution" },
  });
  assert.deepEqual(f.refused, ["thread"]);
  assert.equal(guarded.length, 2);
});

test("dispatch drains only the abandoned turn before inspecting activity and preserves unknown events", () => {
  const f = fixture();
  let ended = 0;
  f.state.active = null;
  f.state.draining = { turnId: "abandoned", end: () => ended++ };
  f.emit("turn/completed", { turn: { id: "other", status: "interrupted" } });
  assert.equal(ended, 0);
  f.emit("turn/completed", {
    turn: { id: "abandoned", status: "interrupted" },
  });
  assert.equal(ended, 1);
  const unknown = fixture();
  unknown.emit("unknown", { turnId: "turn" });
  unknown.emit("thread/started", { thread: { id: "current" } });
  unknown.emit("thread/status/changed", { status: { type: "idle" } });
  assert.deepEqual(
    [
      unknown.progress,
      unknown.resolved,
      unknown.rejected,
      unknown.refused,
      unknown.traces,
    ],
    [[], [], [], [], []],
  );
  f.emit("connection/closed");
  assert.equal(f.state.ready, null);
});

test("dispatch traces lifecycle events before filters with sanitized diagnostics", () => {
  const f = fixture();
  f.emit("error", {
    threadId: "old",
    error: { message: "https://private.example token=secret" },
    willRetry: true,
  });
  assert.equal(f.traces.length, 1);
  assert.deepEqual(f.traces[0], [
    "error",
    {
      eventThreadId: "old",
      eventTurnId: undefined,
      status: undefined,
      error: { message: "[url] token=[redacted]" },
      willRetry: true,
      active: true,
      hadFinal: false,
      textChars: 0,
    },
  ]);
  assert.equal(f.state.active.lastError, undefined);
});

test("notifications from a replaced connection leave its successor ready and its active turn untouched", async (t) => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "tvlens-session-events-"),
  );
  const connections = [];
  const client = new CodexSessionClient({
    authHome: path.join(dir, "absent"),
    rpcFactory(callbacks) {
      connections.push(callbacks);
      const threadId = `thread-${connections.length}`;
      return {
        start() {},
        send() {},
        close() {},
        request: async (method) =>
          method === "thread/start" ? { thread: { id: threadId } } : {},
      };
    },
  });
  t.after(async () => {
    await client.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await client.prepare("session");
  const old = connections[0];
  await client.close();
  await client.prepare("session");
  const ready = client.ready;
  const f = fixture();
  client.active = f.state.active;
  old.onEvent("connection/closed", {});
  old.onEvent("thread/status/changed", { threadId: "foreign" });
  old.onEvent("item/agentMessage/delta", {
    threadId: client.threadId,
    delta: "stale",
  });
  old.onEvent("turn/completed", {
    threadId: client.threadId,
    turn: { id: "stale", status: "completed" },
  });
  assert.equal(client.ready, ready);
  assert.equal(client.active.text, "");
  assert.deepEqual([f.resolved, f.rejected], [[], []]);
  assert.equal(connections.length, 2);
});
