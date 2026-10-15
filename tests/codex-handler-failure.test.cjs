const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { CodexRpc } = require("../adapters/codex-rpc.cjs");
const { CodexSessionClient } = require("../adapters/codex-session-client.cjs");

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function transport(t, messages, handlers) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-handler-"));
  let rpc;
  t.after(async () => {
    if (rpc) await rpc.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const binary = path.join(dir, "server.cjs");
  await fs.writeFile(
    binary,
    `
const { createInterface } = require('node:readline');
const received = [];
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  received.push(message);
  if (message.id !== undefined && message.method)
    process.stdout.write(JSON.stringify({ id: message.id, result: message.method === 'inspect-input' ? received : {} }) + '\\n');
});
for (const message of ${JSON.stringify(messages)})
  process.stdout.write((typeof message === 'string' ? message : JSON.stringify(message)) + '\\n');
`,
  );
  rpc = new CodexRpc({
    binary: process.execPath,
    args: [binary],
    cwd: dir,
    env: {},
    ...handlers,
  });
  return rpc.start();
}

test("a notification handler failure is reported once and later lines are still delivered", async (t) => {
  const failure = Error("handler failed");
  const received = [],
    faults = [],
    delivered = deferred();
  await transport(t, [{ method: "A" }, "not JSON", { method: "B" }], {
    onEvent(method) {
      if (method === "connection/closed") return;
      received.push(method);
      if (method === "A") throw failure;
      if (method === "B") delivered.resolve();
    },
    onFault(error, method) {
      faults.push({ error, method });
    },
  });
  await delivered.promise;
  assert.deepEqual(received, ["A", "B"]);
  assert.equal(faults.length, 1);
  assert.equal(faults[0].error, failure);
  assert.equal(faults[0].method, "A");
});

for (const faultHandler of ["absent", "throwing"]) {
  test(`later notifications survive a fault callback that is ${faultHandler}`, async (t) => {
    const received = [],
      delivered = deferred();
    let faults = 0;
    const handlers = {
      onEvent(method) {
        if (method === "connection/closed") return;
        received.push(method);
        if (method === "A") throw Error("handler failed");
        if (method === "B") delivered.resolve();
      },
    };
    if (faultHandler === "throwing")
      handlers.onFault = () => {
        faults++;
        throw Error("fault callback failed");
      };
    await transport(
      t,
      [{ method: "A" }, "not JSON", { method: "B" }],
      handlers,
    );
    await delivered.promise;
    assert.deepEqual(received, ["A", "B"]);
    assert.equal(faults, faultHandler === "throwing" ? 1 : 0);
  });
}

test("a synchronous request refusal sends no response or fault and reading continues", async (t) => {
  const delivered = deferred(),
    faults = [],
    requests = [];
  const rpc = await transport(
    t,
    [
      { id: "refused", method: "obsolete", params: { connection: "old" } },
      { method: "next" },
    ],
    {
      onRequest(method, params) {
        requests.push({ method, params });
        throw Error("Connexion obsolète.");
      },
      onEvent(method) {
        if (method === "next") delivered.resolve();
      },
      onFault(error) {
        faults.push(error);
      },
    },
  );
  await delivered.promise;
  await rpc.request("synchronize");
  const input = await rpc.request("inspect-input");
  assert.deepEqual(requests, [
    { method: "obsolete", params: { connection: "old" } },
  ]);
  assert.deepEqual(faults, []);
  assert.equal(
    input.some((message) => message.id === "refused"),
    false,
  );
});

test("an asynchronous request refusal keeps its JSON-RPC error response", async (t) => {
  const delivered = deferred(),
    faults = [];
  const rpc = await transport(
    t,
    [{ id: "refused", method: "forbidden" }, { method: "next" }],
    {
      onRequest: async () => {
        throw Error("request failed");
      },
      onEvent(method) {
        if (method === "next") delivered.resolve();
      },
      onFault(error) {
        faults.push(error);
      },
    },
  );
  await delivered.promise;
  await rpc.request("synchronize");
  const input = await rpc.request("inspect-input");
  const responses = input.filter((message) => message.id === "refused");
  assert.equal(responses.length, 1);
  assert.equal(responses[0].error.code, -32601);
  assert.equal(typeof responses[0].error.message, "string");
  assert.deepEqual(faults, []);
});

test("non-object JSON values are ignored without reporting a handler fault", async (t) => {
  const delivered = deferred(),
    faults = [],
    received = [];
  await transport(t, [null, 42, true, '"text"', { method: "next" }], {
    onEvent(method) {
      if (method === "connection/closed") return;
      received.push(method);
      delivered.resolve();
    },
    onFault(error) {
      faults.push(error);
    },
  });
  await delivered.promise;
  assert.deepEqual(received, ["next"]);
  assert.deepEqual(faults, []);
});

async function session(t, { onTurn, onClose, ...options } = {}) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "tvlens-handler-client-"),
  );
  const connections = [];
  const rpcFactory = (callbacks) => {
    const connection = {
      callbacks,
      n: connections.length + 1,
      closes: 0,
      faults: [],
      turns: [],
      emit(method, params) {
        try {
          callbacks.onEvent(method, params);
        } catch (error) {
          connection.faults.push(error);
          callbacks.onFault?.(error, method);
        }
      },
      complete(turn, answer = `connection-${connection.n}`) {
        if (connection.closes) return;
        connection.emit("item/completed", {
          threadId: turn.threadId,
          turnId: turn.id,
          item: { type: "agentMessage", text: JSON.stringify({ answer }) },
        });
        connection.emit("turn/completed", {
          threadId: turn.threadId,
          turn: { id: turn.id, status: "completed" },
        });
      },
    };
    connections.push(connection);
    return {
      start() {},
      send() {},
      close() {
        connection.closes++;
        connection.emit("connection/closed", {});
        onClose?.(connection);
        return Promise.resolve(true);
      },
      request(method, params) {
        if (connection.closes)
          return Promise.reject(Error("Connexion Codex interrompue."));
        if (method === "thread/start")
          return Promise.resolve({ thread: { id: `thread-${connection.n}` } });
        if (method !== "turn/start") return Promise.resolve({});
        const turn = {
          id: `turn-${connection.turns.length + 1}`,
          threadId: params.threadId,
        };
        connection.turns.push(turn);
        const response = onTurn?.(connection, turn);
        if (response?.then) return response;
        return Promise.resolve({ turn: { id: turn.id } });
      },
    };
  };
  const client = new CodexSessionClient({
    ...options,
    authHome: path.join(dir, "absent-auth"),
    rpcFactory,
  });
  t.after(async () => {
    await client.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  return {
    client,
    connections,
    answer: () =>
      client.answer({
        sessionId: "session",
        instructions: "Décris.",
        signal: new AbortController().signal,
      }),
  };
}

test("an unreadable event rejects the question with its cause and the next question reconnects", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = await session(t, {
    onTurn(connection, turn) {
      if (connection.n === 1)
        connection.emit("turn/started", { threadId: turn.threadId });
      setImmediate(() => connection.complete(turn));
    },
  });
  await assert.rejects(f.answer(), (error) => {
    assert.equal(
      error.message,
      "Codex : événement illisible. Réessaie la question.",
    );
    assert.ok(f.connections[0].faults[0] instanceof TypeError);
    assert.equal(error.cause, f.connections[0].faults[0]);
    return true;
  });
  assert.equal(f.connections[0].closes, 1);
  const result = await f.answer();
  assert.equal(f.connections.length, 2);
  assert.equal(result.answer, "connection-2");
});

test("a later handler fault preserves the first guard refusal", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = await session(t, {
    onTurn(connection, turn) {
      connection.emit("item/started", {
        threadId: turn.threadId,
        turnId: turn.id,
        item: { type: "commandExecution" },
      });
      connection.emit("turn/started", { threadId: turn.threadId });
    },
  });
  await assert.rejects(f.answer(), {
    message: "Outil hors du périmètre TVLens (commandExecution).",
  });
  assert.equal(f.connections[0].faults.length, 1);
  assert.equal(f.connections[0].closes, 1);
});

test("a pending turn start closed after a guard refusal keeps that refusal", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let rejectStart;
  const f = await session(t, {
    onClose() {
      rejectStart?.(Error("Connexion Codex interrompue."));
    },
    onTurn(connection, turn) {
      const pending = new Promise((_, reject) => {
        rejectStart = reject;
      });
      connection.emit("item/started", {
        threadId: turn.threadId,
        turnId: turn.id,
        item: { type: "commandExecution" },
      });
      connection.emit("turn/started", { threadId: turn.threadId });
      return pending;
    },
  });
  await assert.rejects(f.answer(), {
    message: "Outil hors du périmètre TVLens (commandExecution).",
  });
  assert.equal(f.connections[0].faults.length, 1);
  assert.equal(f.connections[0].closes, 1);
});

for (const timing of ["during start", "after acknowledgment"]) {
  test(`a later handler fault preserves authentication diagnostics ${timing}`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const detail = {
      message: "workspace routing discovery unauthorized (401)",
      codexErrorInfo: "other",
    };
    const f = await session(t, {
      onTurn(connection, turn) {
        const fail = () => {
          connection.emit("turn/completed", {
            threadId: turn.threadId,
            turn: { id: turn.id, status: "failed", error: detail },
          });
          const method =
            timing === "during start" ? "turn/started" : "turn/completed";
          connection.emit(method, { threadId: turn.threadId });
        };
        if (timing === "during start") fail();
        else setImmediate(fail);
      },
    });
    await assert.rejects(f.answer(), (error) => {
      assert.equal(error.authRequired, true);
      assert.equal(error.turnStatus, "failed");
      assert.deepEqual(error.turnError, detail);
      assert.match(error.message, /authentification refusée \(401\)/);
      return true;
    });
    assert.equal(f.connections[0].faults.length, 1);
    assert.equal(f.connections[0].closes, 1);
  });
}

test("a completed turn still waits for the start acknowledgment", async (t) => {
  const failure = Error("start request refused");
  const f = await session(t, {
    onTurn(connection, turn) {
      connection.complete(turn);
      return Promise.reject(failure);
    },
  });
  await assert.rejects(f.answer(), (error) => error === failure);
});

test("an idle fault leaves the connection available for the next question", async (t) => {
  const f = await session(t, {
    onTurn: (connection, turn) => setImmediate(() => connection.complete(turn)),
  });
  await f.client.prepare("session");
  const [connection] = f.connections;
  assert.doesNotThrow(() =>
    connection.callbacks.onFault(Error("idle fault"), "idle"),
  );
  assert.equal(connection.closes, 0);
  assert.equal((await f.answer()).answer, "connection-1");
  assert.equal(f.connections.length, 1);
});

test("a fault from an obsolete connection leaves the active question and current connection intact", async (t) => {
  let obsolete;
  const f = await session(t, {
    onTurn(connection, turn) {
      obsolete.callbacks.onFault(Error("obsolete fault"), "turn/started");
      setImmediate(() => connection.complete(turn));
    },
  });
  await f.client.prepare("session");
  [obsolete] = f.connections;
  await f.client.close();
  const oldCloses = obsolete.closes;
  assert.equal((await f.answer()).answer, "connection-2");
  assert.equal(obsolete.closes, oldCloses);
  assert.equal(f.connections[1].closes, 0);
});

for (const settings of [
  { role: "chat", webSearch: true, enabled: "1", expected: 1 },
  { role: "surveillance", webSearch: false, enabled: "1", expected: 1 },
  { role: "chat", webSearch: false, enabled: "1", expected: 0 },
  { role: "chat", webSearch: true, enabled: "0", expected: 0 },
]) {
  test(`fault diagnostics follow trace settings for ${JSON.stringify(settings)}`, async (t) => {
    const previous = process.env.TVLENS_CODEX_TRACE;
    process.env.TVLENS_CODEX_TRACE = settings.enabled;
    t.after(() => {
      if (previous === undefined) delete process.env.TVLENS_CODEX_TRACE;
      else process.env.TVLENS_CODEX_TRACE = previous;
    });
    const lines = [];
    t.mock.method(process.stderr, "write", (chunk) => {
      if (String(chunk).startsWith('{"trace":')) lines.push(JSON.parse(chunk));
      return true;
    });
    const f = await session(t, settings);
    await f.client.prepare("session");
    const failure = Object.assign(
      Error("https://private.example/x Bearer sensitive"),
      { code: "HANDLER_FAILED", payload: "private request" },
    );
    f.connections[0].callbacks.onFault(failure, "unreadable");
    const faults = lines.filter((entry) => entry.event === "event.failed");
    assert.equal(faults.length, settings.expected);
    if (settings.expected) {
      assert.equal(faults[0].role, settings.role);
      assert.equal(faults[0].sessionId, "session");
      assert.equal(faults[0].threadId, "thread-1");
      assert.equal(faults[0].method, "unreadable");
      assert.deepEqual(faults[0].error, {
        name: "Error",
        code: "HANDLER_FAILED",
        message: "[url] Bearer [redacted]",
      });
    }
  });
}

test("a handler fault keeps its rejection when closing the real transport rejects turn start", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "tvlens-handler-pending-"),
  );
  const binary = path.join(dir, "server.cjs");
  let client;
  t.after(async () => {
    if (client) await client.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(
    binary,
    `
const { createInterface } = require('node:readline');
const send = message => process.stdout.write(JSON.stringify(message) + '\\n');
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'turn/start') {
    send({ method: 'turn/started', params: { threadId: message.params.threadId } });
    return;
  }
  if (message.id !== undefined) send({ id: message.id,
    result: message.method === 'thread/start' ? { thread: { id: 'thread' } } : {} });
});
`,
  );
  client = new CodexSessionClient({
    authHome: path.join(dir, "absent-auth"),
    rpcFactory: (options) =>
      new CodexRpc({ ...options, binary: process.execPath, args: [binary] }),
  });
  await assert.rejects(
    client.answer({
      sessionId: "session",
      instructions: "Décris.",
      signal: new AbortController().signal,
    }),
    (error) => {
      assert.equal(
        error.message,
        "Codex : événement illisible. Réessaie la question.",
      );
      assert.ok(error.cause instanceof TypeError);
      return true;
    },
  );
});
