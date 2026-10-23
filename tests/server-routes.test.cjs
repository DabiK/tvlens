const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { LocalSessionStore } = require("../adapters/local-store.cjs");
const { RemoteServer } = require("../server/http.cjs");
const { createRoutes, dispatchRoute } = require("../server/routes.cjs");
const { createStateRoutes } = require("../server/state-routes.cjs");
const { createQuestionRoutes } = require("../server/question-routes.cjs");
const {
  createSurveillanceRoutes,
} = require("../server/surveillance-routes.cjs");
const { createSessionRoutes } = require("../server/session-routes.cjs");
const { createIngestRoutes } = require("../server/ingest-routes.cjs");
const { STORAGE_FULL } = require("../adapters/disk-guard.cjs");

function recordingRuntime(names) {
  const calls = [];
  const runtime = {};
  for (const name of names) {
    runtime[name] = (...args) => {
      calls.push([name, ...args]);
      return { result: name };
    };
  }
  return { runtime, calls };
}

async function invoke(routes, method, path, body = {}) {
  const replies = [];
  const send = (status, value, headers = {}) =>
    replies.push({ status, value, headers });
  const matched = await dispatchRoute(routes, {
    req: { method, headers: {} },
    url: new URL(path, "http://tvlens.local"),
    body,
    raw: Buffer.from(JSON.stringify(body)),
    send,
    revalidated: (tag, build) => send(200, build(), { ETag: tag }),
  });
  return { matched, replies };
}

async function expectUnknown(routes, calls, paths) {
  const before = [...calls];
  for (const path of paths) {
    for (const method of ["GET", "POST"]) {
      assert.deepEqual(await invoke(routes, method, path), {
        matched: false,
        replies: [],
      });
    }
  }
  assert.deepEqual(calls, before);
}

async function expectCalls(routes, calls, cases) {
  for (const {
    method,
    path,
    body,
    name,
    args,
    value = { result: name },
  } of cases) {
    const before = calls.length;
    assert.deepEqual(
      await invoke(routes, method, path, body),
      {
        matched: true,
        replies: [{ status: 200, value, headers: {} }],
      },
      path,
    );
    assert.deepEqual(calls.slice(before), [[name, ...args]], path);
  }
}

test("state routes use the requested view and transcription language and leave unknown routes untouched", async () => {
  const { runtime, calls } = recordingRuntime([
    "etag",
    "snapshot",
    "setTranscriptionLanguage",
    "storage",
  ]);
  runtime.session = {
    id: "session-a",
    watch: { accepting: true, readOnly: false },
  };
  runtime.storage = () => ({ state: "ok" });
  runtime.etag = (view) => {
    calls.push(["etag", view]);
    return '"chat-1"';
  };
  const routes = createStateRoutes({ runtime });
  assert.deepEqual(await invoke(routes, "GET", "/v1/state?view=chat"), {
    matched: true,
    replies: [
      {
        status: 200,
        value: { result: "snapshot" },
        headers: { ETag: '"chat-1"' },
      },
    ],
  });
  assert.deepEqual(calls, [
    ["etag", "chat"],
    ["snapshot", "chat"],
  ]);
  assert.deepEqual(
    (await invoke(routes, "GET", "/v1/session")).replies[0].value,
    {
      id: "session-a",
      accepting: true,
      readOnly: false,
      storage: { state: "ok" },
    },
  );
  assert.deepEqual(
    (
      await invoke(routes, "POST", "/v1/settings/transcription", {
        language: "fr",
      })
    ).replies[0].value,
    { result: "setTranscriptionLanguage" },
  );
  assert.deepEqual(calls.at(-1), ["setTranscriptionLanguage", "fr"]);
  runtime.session = null;
  assert.deepEqual(
    (await invoke(routes, "GET", "/v1/session")).replies[0].value,
    {},
  );
  await expectUnknown(routes, calls, [
    "/v1/state/unknown",
    "/v1/settings/unknown",
    "/v1/questions",
  ]);
});

test("question routes pass the object or the unchanged cancellation identifier to the runtime", async () => {
  const { runtime, calls } = recordingRuntime(["detail", "ask", "cancel"]);
  const routes = createQuestionRoutes({ runtime });
  const body = { sessionId: "session-a", question: "Pourquoi ?", anchorMs: 20 };
  await expectCalls(routes, calls, [
    {
      method: "POST",
      path: "/v1/moments/detail",
      body,
      name: "detail",
      args: [body],
    },
    { method: "POST", path: "/v1/questions", body, name: "ask", args: [body] },
    {
      method: "POST",
      path: "/v1/questions/deep-01/cancel",
      name: "cancel",
      args: ["deep-01"],
    },
  ]);
  await expectUnknown(routes, calls, [
    "/v1/questions/unknown",
    "/v1/questions/deep-1/cancel/extra",
    "/v1/questions/deep-a/cancel",
  ]);
});

test("surveillance routes keep the registry, overlay and five commands in their group", async () => {
  const names = [
    "surveillanceRegistry",
    "etag",
    "overlay",
    "startSurveillance",
    "stopSurveillance",
    "retrySurveillance",
    "surveillanceHistory",
    "surveillanceDetail",
  ];
  const { runtime, calls } = recordingRuntime(names);
  const routes = createSurveillanceRoutes({ runtime });
  const body = { sessionId: "session-a", instruction: "Vérifie les chiffres." };
  await expectCalls(routes, calls, [
    {
      method: "GET",
      path: "/v1/surveillance",
      name: "surveillanceRegistry",
      args: [],
    },
    ...[
      ["start", "startSurveillance"],
      ["stop", "stopSurveillance"],
      ["retry", "retrySurveillance"],
      ["history", "surveillanceHistory"],
      ["detail", "surveillanceDetail"],
    ].map(([action, name]) => ({
      method: "POST",
      path: "/v1/surveillance/" + action,
      body,
      name,
      args: [body],
    })),
  ]);
  const overlay = await invoke(routes, "GET", "/v1/surveillance/overlay");
  assert.equal(overlay.matched, true);
  assert.deepEqual(overlay.replies, [
    {
      status: 200,
      value: { result: "overlay" },
      headers: { ETag: { result: "etag" } },
    },
  ]);
  assert.deepEqual(calls.slice(-2), [["etag", "overlay"], ["overlay"]]);
  await expectUnknown(routes, calls, [
    "/v1/surveillance/unknown",
    "/v1/surveillance/overlay/extra",
    "/v1/state",
  ]);
});

test("session routes forward library identifiers without decoding and preserve lifecycle response fields", async () => {
  const { runtime, calls } = recordingRuntime([
    "sessions",
    "storageUsage",
    "start",
    "pause",
    "end",
    "open",
    "resume",
    "remove",
  ]);
  const routes = createSessionRoutes({ runtime });
  await expectCalls(routes, calls, [
    { method: "GET", path: "/v1/sessions", name: "sessions", args: [] },
    { method: "GET", path: "/v1/storage", name: "storageUsage", args: [] },
    { method: "POST", path: "/v1/session/start", name: "start", args: [{}] },
    {
      method: "POST",
      path: "/v1/session/start",
      body: { sourceTitle: "Sintel" },
      name: "start",
      args: [{ sourceTitle: "Sintel" }],
    },
    {
      method: "POST",
      path: "/v1/session/pause",
      name: "pause",
      args: [],
      value: { paused: true },
    },
    {
      method: "POST",
      path: "/v1/session/end",
      name: "end",
      args: [],
      value: { ended: true, result: "end" },
    },
    {
      method: "POST",
      path: "/v1/sessions/close",
      name: "end",
      args: [],
      value: { closed: true, result: "end" },
    },
    ...[
      ["open", "open"],
      ["resume", "resume"],
      ["delete", "remove"],
    ].map(([action, name]) => ({
      method: "POST",
      path: "/v1/sessions/a%2Fb/" + action,
      name,
      args: ["a%2Fb"],
    })),
  ]);
  await expectUnknown(routes, calls, [
    "/v1/sessions/a/open/extra",
    "/v1/sessions/a/b/open",
    "/v1/session/unknown",
    "/v1/thumbnail/a_b/moment-1",
    "/v1/media/a/moment-1/extra",
  ]);
});

function block(extra = {}) {
  return {
    sessionId: "session-a",
    sequence: 1,
    startMs: 0,
    endMs: 100,
    frames: [{ atMs: 0, data: "YQ==" }],
    ...extra,
  };
}

function ingestionFixture() {
  const events = [];
  const operation = { controller: new AbortController() };
  const runtime = {
    captureEpoch: 1,
    admit: (id) => {
      events.push(["admit", id]);
      return { watch: { now: () => 1000 } };
    },
    accept: (id) => {
      events.push(["accept", id]);
      return operation;
    },
    ingest: async (input, owned) => {
      events.push(["ingest", input, owned]);
      return "moment-1";
    },
    current: () => true,
    finish: (owned) => events.push(["finish", owned]),
  };
  const media = {
    assemble: async (input, options) => {
      events.push(["assemble", input, options]);
      return { ...input, clip: Buffer.from("clip") };
    },
  };
  const transport = {
    accepted: new Map(),
    lastSequence: -1,
    epoch: 1,
    ingesting: false,
  };
  return { runtime, media, transport, events, operation };
}

test("ingestion routes acquire ownership before assembly and deduplicate without acquiring another operation", async () => {
  const f = ingestionFixture();
  const routes = createIngestRoutes(f);
  const body = block();
  assert.deepEqual(await invoke(routes, "POST", "/v1/segments", body), {
    matched: true,
    replies: [
      { status: 200, value: { id: "moment-1", duplicate: false }, headers: {} },
    ],
  });
  assert.deepEqual(
    f.events.map(([name]) => name),
    ["admit", "accept", "assemble", "ingest", "finish"],
  );
  assert.equal(f.events[2][2].signal, f.operation.controller.signal);
  assert.equal(f.events[3][2], f.operation);
  assert.equal(f.events[4][1], f.operation);
  assert.deepEqual(
    (await invoke(routes, "POST", "/v1/segments", body)).replies[0].value,
    { id: "moment-1", duplicate: true },
  );
  assert.deepEqual(
    f.events.map(([name]) => name),
    ["admit", "accept", "assemble", "ingest", "finish", "admit"],
  );
  await expectUnknown(routes, f.events, [
    "/v1/segments/unknown",
    "/v1/session/start",
  ]);
});

const token = "r".repeat(64);

async function httpFixture(t, dependencies = ingestionFixture()) {
  const server = await new RemoteServer({ ...dependencies, token }).listen(
    0,
    "127.0.0.1",
  );
  t.after(() => server.close());
  const raw = (path, init = {}) =>
    fetch(server.url + path, {
      ...init,
      headers: { Authorization: "Bearer " + token, ...init.headers },
    });
  const request = async (path, body) => {
    const response = await raw(
      path,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    return { status: response.status, value: await response.json() };
  };
  return { ...dependencies, server, raw, request };
}

function wireRequest(
  server,
  path,
  { method = "POST", headers = {}, body, chunks, announced } = {},
) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      server.url + path,
      {
        method,
        agent: false,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          ...headers,
        },
      },
      (res) => {
        const received = [];
        res.on("error", reject);
        res.on("data", (chunk) => received.push(chunk));
        res.on("end", () => {
          const bytes = Buffer.concat(received);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: bytes.toString(),
          });
          req.destroy();
        });
      },
    );
    req.on("error", reject);
    if (announced) return req.flushHeaders();
    if (chunks) for (const chunk of chunks) req.write(chunk);
    req.end(body);
  });
}

test("unknown paths in every group reach the common HTTP 404 for GET and valid object POST", async (t) => {
  const f = await httpFixture(t);
  for (const path of [
    "/v1/session/unknown",
    "/v1/segments/unknown",
    "/v1/questions/unknown",
    "/v1/surveillance/unknown",
    "/v1/state/unknown",
  ]) {
    for (const body of [undefined, {}]) {
      assert.deepEqual(
        await f.request(path, body),
        { status: 404, value: { error: "Route inconnue.", code: "route-not-found" } },
        path,
      );
    }
  }
  assert.deepEqual(f.events, []);
});

test("HTTP common refusals precede routing in preflight, authentication, method, content type and JSON order", async (t) => {
  const f = await httpFixture(t);
  const path = "/v1/questions/unknown";
  const preflight = await wireRequest(f.server, path, {
    method: "OPTIONS",
    headers: {
      Authorization: "",
      Origin: "null",
      "Content-Type": "text/plain",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.text, "");
  assert.equal(preflight.headers["access-control-allow-origin"], "null");
  assert.equal(preflight.headers.vary, "Origin");
  assert.equal(preflight.headers["access-control-expose-headers"], "ETag, X-TVLens-Error-Code");
  assert.equal(
    preflight.headers["access-control-allow-methods"],
    "GET, POST, OPTIONS",
  );
  assert.equal(
    preflight.headers["access-control-allow-headers"],
    "Authorization, Content-Type, If-None-Match",
  );
  assert.equal(preflight.headers["access-control-max-age"], "600");
  const unauthorized = await wireRequest(f.server, path, {
    method: "DELETE",
    headers: { Authorization: "Bearer wrong", "Content-Type": "text/plain" },
    body: "bad",
  });
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(JSON.parse(unauthorized.text), {
    error: "Appareil non authentifié.",
    code: "unauthenticated",
  });
  const method = await wireRequest(f.server, path, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: "bad",
  });
  assert.equal(method.status, 405);
  assert.deepEqual(JSON.parse(method.text), {
    error: "Méthode non autorisée.", code: "method-not-allowed",
  });
  assert.equal(method.headers.allow, "GET, POST, OPTIONS");
  const nonJson = await wireRequest(f.server, path, {
    headers: { "Content-Type": "text/plain", "Content-Length": 12001 },
    announced: true,
  });
  assert.equal(nonJson.status, 415);
  assert.deepEqual(JSON.parse(nonJson.text), { error: "JSON requis.", code: "json-required" });
  for (const body of ["{", "null", "[]", '"text"', "1", "true"]) {
    const invalid = await wireRequest(f.server, path, { body });
    assert.equal(invalid.status, 400, body);
    assert.deepEqual(JSON.parse(invalid.text), { error: "JSON invalide.", code: "invalid-json" });
  }
  const unknown = await wireRequest(f.server, path, { body: "{}" });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.headers["content-type"], "application/json");
  assert.equal(unknown.headers["cache-control"], "no-store");
  assert.deepEqual(f.events, []);
});

test("HTTP enforces both exact byte limits on announcements and streams before assembly or routing", async (t) => {
  const f = await httpFixture(t);
  for (const [path, limit, atLimitStatus] of [
    ["/v1/segments", 13000000, 400],
    ["/v1/questions/unknown", 12000, 404],
  ]) {
    const announced = await wireRequest(f.server, path, {
      headers: { "Content-Length": limit + 1 },
      announced: true,
    });
    assert.equal(announced.status, 413, path);
    assert.deepEqual(JSON.parse(announced.text), {
      error: "Requête trop volumineuse.",
      code: "request-too-large",
    });
    const body = "{}" + " ".repeat(limit - 2);
    assert.equal(Buffer.byteLength(body), limit);
    const exact = await wireRequest(f.server, path, { body });
    assert.equal(exact.status, atLimitStatus, path);
    const streamed = await wireRequest(f.server, path, { chunks: [body, " "] });
    assert.equal(streamed.status, 413, path);
    assert.deepEqual(JSON.parse(streamed.text), {
      error: "Requête trop volumineuse.",
      code: "request-too-large",
    });
  }
  assert.deepEqual(
    f.events,
    [],
    "no admission, provider or assembly for refused payloads",
  );
});

test("HTTP revalidation keeps four distinct tags and builds no snapshot for strong or weak held tags", async (t) => {
  const f = ingestionFixture();
  const built = [];
  Object.assign(f.runtime, {
    etag: (view) => '"' + (view ?? "full") + '-3"',
    snapshot: (view) => {
      built.push(view);
      return { view: view ?? "full" };
    },
    overlay: () => {
      built.push("overlay");
      return { overlay: true };
    },
  });
  const h = await httpFixture(t, f);
  const held = [];
  for (const path of [
    "/v1/state",
    "/v1/state?view=chat",
    "/v1/state?view=panel",
    "/v1/surveillance/overlay",
  ]) {
    const first = await h.raw(path);
    assert.equal(first.status, 200);
    await first.json();
    const tag = first.headers.get("etag");
    held.push(tag);
    const before = [...built];
    for (const conditional of [tag, '"other", W/' + tag]) {
      const response = await h.raw(path, {
        headers: { Origin: "null", "If-None-Match": conditional },
      });
      assert.equal(response.status, 304);
      assert.equal(await response.text(), "");
      assert.equal(response.headers.get("etag"), tag);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(
        response.headers.get("access-control-expose-headers"),
        "ETag, X-TVLens-Error-Code",
      );
      assert.deepEqual(built, before);
    }
  }
  assert.equal(new Set(held).size, 4);
  const otherView = await h.raw("/v1/state?view=chat", {
    headers: { "If-None-Match": held[2] },
  });
  assert.equal(otherView.status, 200);
  assert.deepEqual(await otherView.json(), { view: "chat" });
});

test("HTTP reaches all five groups with the recorded runtime and assembler", async (t) => {
  const f = ingestionFixture();
  const { runtime, calls } = recordingRuntime([
    "sessions",
    "ask",
    "startSurveillance",
    "snapshot",
  ]);
  Object.assign(f.runtime, runtime, { etag: () => '"state-1"' });
  const h = await httpFixture(t, f);
  const question = { sessionId: "session-a", question: "Pourquoi ?" };
  const surveillance = { sessionId: "session-a", instruction: "Vérifie." };
  assert.deepEqual(await h.request("/v1/state?view=panel"), {
    status: 200,
    value: { result: "snapshot" },
  });
  assert.deepEqual(await h.request("/v1/sessions"), {
    status: 200,
    value: { result: "sessions" },
  });
  assert.deepEqual(await h.request("/v1/questions", question), {
    status: 200,
    value: { result: "ask" },
  });
  assert.deepEqual(await h.request("/v1/surveillance/start", surveillance), {
    status: 200,
    value: { result: "startSurveillance" },
  });
  assert.deepEqual(await h.request("/v1/segments", block()), {
    status: 200,
    value: { id: "moment-1", duplicate: false },
  });
  assert.deepEqual(calls, [
    ["snapshot", "panel"],
    ["sessions"],
    ["ask", question],
    ["startSurveillance", surveillance],
  ]);
  assert.deepEqual(
    f.events.map(([name]) => name),
    ["admit", "accept", "assemble", "ingest", "finish"],
  );
});

test("HTTP answers an ordinary unexpected Error with a generic internal error", async (t) => {
  const f = await httpFixture(t, { runtime: { ask: () => { throw Error("secret-key /private/server/file"); } } });
  assert.deepEqual(await f.request("/v1/questions", {}), {
    status: 500, value: { error: "Erreur interne du serveur.", code: "internal-error" },
  });
});

for (const [name, error] of [
  ["TypeError", new TypeError("secret-key /private/type")],
  ["RangeError", new RangeError("secret-key /private/range")],
  ["ReferenceError", new ReferenceError("secret-key /private/reference")],
  ["SyntaxError", new SyntaxError("secret-key /private/syntax")],
  ["ordinary Error with cause", new Error("secret-key /private/outer", { cause: Error("secret-key /private/cause") })],
  ["string", "secret-key /private/string"],
  ["null", null],
  ["undefined", undefined],
  ["system error", Object.assign(Error("EIO secret-key /private/media"), {
    code: "EIO", path: "/private/media", syscall: "write", cause: Error("secret-key disk cause"),
  })],
  ["invalid status", Object.assign(Error("secret-key /private/status"), { status: 600 })],
]) {
  test(`HTTP journals an unexpected ${name} with its origin while keeping the response generic`, async (t) => {
    const entries = [];
    const runtime = { ask: () => { throw error; }, etag: () => { throw error; } };
    const f = await httpFixture(t, { runtime, logError: entry => entries.push(entry) });
    for (const [pathname, body, method] of [["/v1/questions", {}, "POST"], ["/v1/state", undefined, "GET"]]) {
      assert.deepEqual(await f.request(pathname + "?view=secret-query", body), {
        status: 500, value: { error: "Erreur interne du serveur.", code: "internal-error" },
      });
      assert.equal(entries.length, method === "POST" ? 1 : 2);
      assert.deepEqual(entries.at(-1), { method, pathname, error, cause: error?.cause });
      assert.equal(entries.at(-1).error, error);
      assert.equal(entries.at(-1).cause, error?.cause);
    }
  });
}

test("HTTP still answers with the generic internal error when the journal sink throws", async (t) => {
  let calls = 0;
  const error = Error("secret-key /private/origin");
  const f = await httpFixture(t, {
    runtime: { ask: () => { throw error; } },
    logError: () => { calls++; throw Error("secret-key /private/journal"); },
  });
  assert.deepEqual(await f.request("/v1/questions", {}), {
    status: 500, value: { error: "Erreur interne du serveur.", code: "internal-error" },
  });
  assert.equal(calls, 1);
});

test("HTTP carries recognized application codes at every error status independently of their message", async (t) => {
  const entries = [];
  const f = await httpFixture(t, { ...ingestionFixture(), logError: entry => entries.push(entry) });
  const cases = [
    [400, "invalid-capture-time"],
    [429, "TVLENS_QUESTION_QUEUE_FULL", "question-queue-full"],
    [503, "media-unavailable"],
    [409, "read-only"],
    [503, "session-closing"],
    [409, "capture-changed"],
    [409, "capturing"],
    [409, "not-open"],
    [404, "not-found"],
    [507, STORAGE_FULL, "storage-full"],
    ...[
      ["TVLENS_QUESTION_INVALID", "invalid-question"],
      ["TVLENS_QUESTION_QUEUE_FULL", "question-queue-full"],
      ["TVLENS_QUESTION_ACTION_INVALID", "invalid-question-action"],
      ["TVLENS_QUESTION_INTERVAL_INVALID", "invalid-question-interval"],
      ["TVLENS_CAPTURE_TIME_INVALID", "invalid-capture-time"],
      ["TVLENS_CAPTURE_ORDER_INVALID", "invalid-capture-order"],
      ["TVLENS_SESSION_STOPPED", "session-stopped"],
      ["TVLENS_MOMENT_SELECTION_INVALID", "invalid-moment-selection"],
      ["TVLENS_MOMENT_MISSING", "moment-missing"],
      ["TVLENS_MOMENT_INTERVAL_DISCONTINUOUS", "discontinuous-moment-interval"],
      ["TVLENS_TRANSCRIPTION_LANGUAGE_INVALID", "invalid-transcription-language"],
      ["TVLENS_SURVEILLANCE_SESSION_REQUIRED", "surveillance-session-required"],
      ["TVLENS_SURVEILLANCE_INSTRUCTION_INVALID", "invalid-surveillance-instruction"],
      ["TVLENS_SURVEILLANCE_RETRY_INVALID", "invalid-surveillance-retry"],
      ["TVLENS_SESSION_ID_INVALID", "invalid-session-id"],
      ["TVLENS_SESSION_NOT_FOUND", "not-found"],
      ["TVLENS_ARCHIVE_INVALID", "invalid-archive"],
      ["TVLENS_MEDIA_BLOCK_INVALID", "invalid-media-block"],
      ["TVLENS_MEDIA_IMAGE_UNREADABLE", "image-unreadable"],
      ["TVLENS_MEDIA_TOOL_REFUSED", "media-tool-refused"],
    ].map(([code, publicCode]) => [undefined, code, publicCode]),
    ...[
      "unknown-view", "stale-session", "invalid-anchor", "invalid-captured-segment", "invalid-archive",
      "invalid-history-cursor", "invalid-history-limit", "invalid-surveillance-id",
      "language-setting-busy", "surveillance-session-required",
    ].map(code => [undefined, code]),
    ...[
      "TVLENS_CODEX_DISCONNECTED",
      "TVLENS_CODEX_REQUEST_TIMEOUT",
      "TVLENS_CODEX_REQUEST_CUT",
      "TVLENS_CODEX_CONNECTION_LOST",
      "TVLENS_CODEX_INPUT_REFUSED",
      "TVLENS_CODEX_SESSION_CLOSED",
      "TVLENS_CODEX_CONFINEMENT_REFUSED",
      "TVLENS_CODEX_TOOL_REFUSED",
      "TVLENS_CODEX_ROLE_REFUSED",
      "TVLENS_LOCAL_VLM_INPUT_REFUSED",
      "TVLENS_LOCAL_VLM_UNREACHABLE",
      "TVLENS_LOCAL_VLM_UNAVAILABLE",
      "TVLENS_LOCAL_VLM_CLOSED",
    ].map((code) => [undefined, code]),
  ];
  for (const [status, code, publicCode = code] of cases) {
    for (const message of ["Premier libellé arbitraire.", "Autre formulation sans rapport."]) {
      f.runtime.ask = () => {
        throw Object.assign(Error(message), { code, ...(code === STORAGE_FULL ? {} : { status }) });
      };
      assert.deepEqual(await f.request("/v1/questions", {}), {
        status: status ?? 400, value: { error: message, code: publicCode },
      });
    }
  }
  for (const status of [400, 422, 500, 599]) {
    f.runtime.ask = () => {
      throw Object.assign(Error("Refus explicite."), { status, code: "not-found" });
    };
    assert.deepEqual(await f.request("/v1/questions", {}), {
      status, value: { error: "Refus explicite.", code: "not-found" },
    });
  }
  assert.deepEqual(f.events, []);
  assert.deepEqual(entries, [], "explicit and recognized refusals are not unexpected errors");
});

test("HTTP keeps an explicit status but hides errno, unknown identities and familiar wording without one", async (t) => {
  const f = await httpFixture(t);
  for (const fields of [
    {}, { code: "ENOENT" }, { code: "EIO" }, { code: "ENOSPC" },
    { code: "not-a-recognized-code" }, { code: "TVLENS_UNKNOWN_ERROR" }, { code: 42 },
    { status: 399 }, { status: 600 }, { status: "503" }, { status: 400.5 },
    { status: 503, code: "EIO" },
  ]) {
    for (const message of ["Session obsolète.", "Espace disque insuffisant."]) {
      f.runtime.ask = () => { throw Object.assign(Error(message), fields); };
      const expected = fields.status === 503
        ? { status: 503, value: { error: message, code: "unclassified-error" } }
        : { status: 500, value: { error: "Erreur interne du serveur.", code: "internal-error" } };
      assert.deepEqual(await f.request("/v1/questions", {}), expected);
    }
  }
  assert.deepEqual(f.events, []);
});

test("HTTP ends an already started response without sending another set of headers", async (t) => {
  const entries = [];
  const cause = Error("secret-key /private/serialization-cause");
  const error = new Error("secret-key /private/serialization", { cause });
  const f = await httpFixture(t, {
    runtime: { ask: () => ({ toJSON: () => { throw error; } }) },
    logError: entry => entries.push(entry),
  });
  const response = await wireRequest(f.server, "/v1/questions", { body: "{}" });
  assert.equal(response.status, 200);
  assert.equal(response.text, "");
  assert.deepEqual(entries, [{ method: "POST", pathname: "/v1/questions", error, cause }]);
  assert.equal(entries[0].error, error);
  assert.equal(entries[0].cause, cause);
});

test("HTTP ends an already started response even when its error journal throws", async (t) => {
  const entries = [];
  const error = new Error("secret-key /private/serialization", { cause: Error("secret-key serialization cause") });
  const f = await httpFixture(t, {
    runtime: { ask: () => ({ toJSON: () => { throw error; } }) },
    logError: entry => { entries.push(entry); throw Error("secret-key /private/journal"); },
  });
  const response = await wireRequest(f.server, "/v1/questions", { body: "{}" });
  assert.equal(response.status, 200);
  assert.equal(response.text, "");
  assert.deepEqual(entries, [{ method: "POST", pathname: "/v1/questions", error, cause: error.cause }]);
  assert.equal(entries[0].error, error);
  assert.equal(entries[0].cause, error.cause);
});

test("HTTP preserves JPEG and both media routes including Range headers and statuses", async (t) => {
  const f = ingestionFixture();
  const jpeg = Buffer.from([255, 216, 255, 217]);
  const reads = [];
  f.runtime.session = {
    id: "session-a",
    watch: { segments: [{ id: "moment-1", available: true }] },
    thumbnails: {
      read: async (id) => {
        reads.push(["thumbnail", id]);
        return jpeg;
      },
    },
    store: {
      response: async (id, range) => {
        reads.push(["media", id, range]);
        if (range === "bytes=99-")
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": "bytes */7" },
          });
        const headers = {
          "Content-Type": "video/webm",
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
          "Content-Length": range ? "3" : "7",
        };
        if (range) headers["Content-Range"] = "bytes 0-2/7";
        return new Response(range ? "fix" : "fixture", {
          status: range ? 206 : 200,
          headers,
        });
      },
    },
  };
  const h = await httpFixture(t, f);
  const thumbnail = await h.raw("/v1/thumbnail/session-a/moment-1");
  assert.equal(thumbnail.status, 200);
  assert.equal(thumbnail.headers.get("content-type"), "image/jpeg");
  assert.equal(thumbnail.headers.get("cache-control"), "no-store");
  assert.deepEqual(Buffer.from(await thumbnail.arrayBuffer()), jpeg);
  for (const path of ["/v1/media/session-a/moment-1", "/v1/media/moment-1"]) {
    for (const range of [undefined, "bytes=0-2", "bytes=99-"]) {
      const response = await h.raw(path, {
        headers: { Origin: "null", ...(range ? { Range: range } : {}) },
      });
      assert.equal(response.headers.get("access-control-expose-headers"), "ETag, X-TVLens-Error-Code");
      if (range === "bytes=99-") {
        assert.equal(response.status, 416);
        assert.equal(response.headers.get("content-range"), "bytes */7");
        assert.equal(response.headers.get("x-tvlens-error-code"), "invalid-range");
        assert.equal(await response.text(), "");
        continue;
      }
      assert.equal(response.status, range ? 206 : 200);
      assert.equal(response.headers.get("content-type"), "video/webm");
      assert.equal(response.headers.get("accept-ranges"), "bytes");
      assert.equal(response.headers.get("content-length"), range ? "3" : "7");
      assert.equal(
        response.headers.get("content-range"),
        range ? "bytes 0-2/7" : null,
      );
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-tvlens-error-code"), null);
      assert.equal(await response.text(), range ? "fix" : "fixture");
    }
  }
  const before = reads.length;
  for (const path of [
    "/v1/media/session_b/moment-1",
    "/v1/media/moment-1/extra",
    "/v1/media/moment-x",
    "/v1/thumbnail/session-a/moment-1/extra",
    "/v1/thumbnail/session_a/moment-1",
    "/v1/sessions/a/open/extra",
    "/v1/questions/deep-1/cancel/extra",
  ]) {
    for (const body of [undefined, {}])
      assert.equal((await h.request(path, body)).status, 404, path);
  }
  assert.equal(reads.length, before);
  for (const path of [
    "/v1/media/other/moment-1",
    "/v1/thumbnail/other/moment-1",
  ])
    assert.deepEqual(await h.request(path), {
      status: 410,
      value: { error: "Session terminée.", code: "session-ended" },
    });
});

test("HTTP media refusal headers preserve the real store bodies, Range metadata and successful bytes", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-media-http-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = LocalSessionStore.forSession(root);
  const bytes = Buffer.from([0, 255, 12, 128, 42, 13, 10]);
  await store.put("moment-1", { clip: bytes, frames: [], startMs: 0, endMs: 100 });
  const dependencies = ingestionFixture();
  dependencies.runtime.session = {
    id: "session-a", store,
    watch: { segments: [1, 2].map((number) => ({ id: "moment-" + number, available: true })) },
  };
  const f = await httpFixture(t, dependencies);
  for (const base of ["/v1/media/session-a/", "/v1/media/"]) {
    for (const [range, status, contentRange, code, body] of [
      [undefined, 200, null, null, bytes],
      ["bytes=0-2", 206, "bytes 0-2/7", null, bytes.subarray(0, 3)],
      ["bytes=2-", 206, "bytes 2-6/7", null, bytes.subarray(2)],
      ["bytes=99-", 416, "bytes */7", "invalid-range", Buffer.alloc(0)],
      ["bytes=-2", 416, "bytes */7", "invalid-range", Buffer.alloc(0)],
      ["bytes=3-1", 416, "bytes */7", "invalid-range", Buffer.alloc(0)],
    ]) {
      const response = await f.raw(base + "moment-1", {
        headers: { Origin: "null", ...(range ? { Range: range } : {}) },
      });
      assert.equal(response.status, status);
      assert.equal(response.headers.get("content-range"), contentRange);
      assert.equal(response.headers.get("x-tvlens-error-code"), code);
      assert.equal(response.headers.get("access-control-allow-origin"), "null");
      assert.equal(response.headers.get("access-control-expose-headers"), "ETag, X-TVLens-Error-Code");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), body);
    }
    const missing = await f.raw(base + "moment-2", { headers: { Origin: "null", Range: "bytes=99-" } });
    assert.equal(missing.status, 404, "a missing file still precedes a refused range");
    assert.equal(await missing.text(), "Passage expiré ou indisponible.");
    assert.equal(missing.headers.get("content-type"), "text/plain;charset=UTF-8");
    assert.equal(missing.headers.get("content-range"), null);
    assert.equal(missing.headers.get("x-tvlens-error-code"), "media-missing");
    assert.equal(missing.headers.get("access-control-allow-origin"), "null");
    assert.equal(missing.headers.get("access-control-expose-headers"), "ETag, X-TVLens-Error-Code");
  }
});

test("HTTP codes unavailable thumbnails and media by their structured reason", async (t) => {
  const f = await httpFixture(t);
  const reads = [];
  const session = {
    id: "session-a",
    watch: { segments: [] },
    thumbnails: { read: async () => { throw Error("Diagnostic arbitraire."); } },
    store: { response: async (...args) => { reads.push(args); } },
  };
  f.runtime.session = session;
  assert.deepEqual(await f.request("/v1/thumbnail/session-a/moment-1"), {
    status: 410, value: { error: "Miniature indisponible.", code: "thumbnail-unavailable" },
  });
  const unreadable = "Vidéo illisible : le fichier enregistré ne contient aucune image.";
  for (const [reason, message, code] of [
    ["expired", "Média expiré.", "media-expired"],
    ["missing", "Média indisponible.", "media-missing"],
    ["not-kept", "Média indisponible.", "media-missing"],
    ["unreadable", unreadable, "media-unreadable"],
    [undefined, "Média expiré.", "media-expired"],
    ["raison inconnue", "Média expiré.", "media-expired"],
  ]) {
    session.watch.segments = [{ id: "moment-1", available: false, mediaReason: reason }];
    for (const route of ["/v1/media/session-a/moment-1", "/v1/media/moment-1"]) {
      assert.deepEqual(await f.request(route), {
        status: 410, value: { error: message, code },
      }, String(reason));
    }
  }
  session.watch.segments = [];
  assert.deepEqual(await f.request("/v1/media/moment-1"), {
    status: 410, value: { error: "Média expiré.", code: "media-expired" },
  });
  f.runtime.session = null;
  for (const route of ["/v1/media/session-a/moment-1", "/v1/thumbnail/session-a/moment-1"]) {
    assert.deepEqual(await f.request(route), {
      status: 410, value: { error: "Session terminée.", code: "session-ended" },
    });
  }
  assert.deepEqual(await f.request("/v1/media/moment-1"), {
    status: 410, value: { error: "Média expiré.", code: "media-expired" },
  });
  assert.deepEqual(reads, [], "unavailable media never reach the store");
});

test("HTTP ingestion keeps conflicts, old sequences, capture renewal and operation release after success or failure", async (t) => {
  const f = await httpFixture(t);
  const body = block();
  assert.deepEqual(await f.request("/v1/segments", body), {
    status: 200,
    value: { id: "moment-1", duplicate: false },
  });
  assert.deepEqual(await f.request("/v1/segments", body), {
    status: 200,
    value: { id: "moment-1", duplicate: true },
  });
  assert.deepEqual(await f.request("/v1/segments", { ...body, endMs: 90 }), {
    status: 409,
    value: { error: "Séquence déjà utilisée avec un autre contenu.", code: "sequence-conflict" },
  });
  assert.deepEqual(await f.request("/v1/segments", { ...body, sequence: 0 }), {
    status: 409,
    value: { error: "Séquence ancienne.", code: "stale-sequence" },
  });
  assert.equal(f.events.filter(([name]) => name === "assemble").length, 1);
  f.runtime.captureEpoch++;
  assert.deepEqual(await f.request("/v1/segments", { ...body, sequence: 0 }), {
    status: 200,
    value: { id: "moment-1", duplicate: false },
  });
  assert.equal(f.events.filter(([name]) => name === "assemble").length, 2);
  const assemble = f.media.assemble;
  f.media.assemble = async () => {
    throw Object.assign(Error("Outil média indisponible."), {
      status: 503,
      code: "media-unavailable",
    });
  };
  assert.deepEqual(await f.request("/v1/segments", block({ sequence: 2 })), {
    status: 503,
    value: { error: "Outil média indisponible.", code: "media-unavailable" },
  });
  assert.deepEqual(f.events.at(-1), ["finish", f.operation]);
  f.media.assemble = assemble;
  const ingest = f.runtime.ingest;
  f.runtime.ingest = async () => {
    throw Object.assign(Error("Espace disque insuffisant."), {
      code: STORAGE_FULL,
    });
  };
  assert.deepEqual(await f.request("/v1/segments", block({ sequence: 2 })), {
    status: 507,
    value: { error: "Espace disque insuffisant.", code: "storage-full" },
  });
  assert.deepEqual(f.events.at(-1), ["finish", f.operation]);
  f.runtime.ingest = ingest;
  assert.deepEqual(await f.request("/v1/segments", block({ sequence: 2 })), {
    status: 200,
    value: { id: "moment-1", duplicate: false },
  });
  assert.equal(f.events.filter(([name]) => name === "finish").length, 5);
});

test(
  "HTTP keeps one preparation slot per server until assembly settles",
  { timeout: 10000 },
  async (t) => {
    let entered;
    let release;
    const assembling = new Promise((resolve) => {
      entered = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    t.after(() => release());
    const dependencies = ingestionFixture();
    dependencies.media.assemble = async (input) => {
      entered();
      await gate;
      return input;
    };
    const first = await httpFixture(t, dependencies);
    const pending = first.request("/v1/segments", block());
    await assembling;
    assert.deepEqual(
      await first.request("/v1/segments", block({ sequence: 2 })),
      { status: 429, value: { error: "Préparation du passage précédent.", code: "preparation-busy" } },
    );
    const second = await httpFixture(t);
    assert.equal((await second.request("/v1/segments", block())).status, 200);
    release();
    assert.equal((await pending).status, 200);
    assert.equal(
      (await first.request("/v1/segments", block({ sequence: 2 }))).status,
      200,
    );
  },
);

test("HTTP refuses a future capture after admission and before acquiring or assembling media", async (t) => {
  const f = await httpFixture(t);
  assert.deepEqual(await f.request("/v1/segments", block({ endMs: 4001 })), {
    status: 400,
    value: { error: "Horodatage futur.", code: "invalid-capture-time" },
  });
  assert.deepEqual(f.events, [["admit", "session-a"]]);
  assert.equal((await f.request("/v1/segments", block({ endMs: 4000 }))).status, 200);
  assert.deepEqual(f.events.map(([name]) => name), ["admit", "admit", "accept", "assemble", "ingest", "finish"]);
});

test("the composed table gives each of the 27 method and path pairs exactly one group owner", () => {
  const f = ingestionFixture();
  const groups = [
    [
      createStateRoutes,
      [
        ["GET", "/v1/version"],
        ["GET", "/v1/session"],
        ["GET", "/v1/state"],
        ["POST", "/v1/settings/transcription"],
      ],
    ],
    [
      createSurveillanceRoutes,
      [
        ["GET", "/v1/surveillance/overlay"],
        ["GET", "/v1/surveillance"],
        ["POST", "/v1/surveillance/start"],
        ["POST", "/v1/surveillance/stop"],
        ["POST", "/v1/surveillance/retry"],
        ["POST", "/v1/surveillance/history"],
        ["POST", "/v1/surveillance/detail"],
      ],
    ],
    [
      createSessionRoutes,
      [
        ["GET", "/v1/sessions"],
        ["GET", "/v1/storage"],
        ["GET", "/v1/thumbnail/session-a/moment-1"],
        ["GET", "/v1/media/session-a/moment-1"],
        ["GET", "/v1/media/moment-1"],
        ["POST", "/v1/session/start"],
        ["POST", "/v1/session/pause"],
        ["POST", "/v1/session/end"],
        ["POST", "/v1/sessions/close"],
        ["POST", "/v1/sessions/a%2Fb/open"],
        ["POST", "/v1/sessions/a%2Fb/resume"],
        ["POST", "/v1/sessions/a%2Fb/delete"],
      ],
    ],
    [
      createQuestionRoutes,
      [
        ["POST", "/v1/moments/detail"],
        ["POST", "/v1/questions"],
        ["POST", "/v1/questions/deep-1/cancel"],
      ],
    ],
    [createIngestRoutes, [["POST", "/v1/segments"]]],
  ];
  const table = createRoutes(f);
  assert.equal(table.length, 27);
  const entries = groups.map(([factory]) => factory(f));
  for (const [owner, [, cases]] of groups.entries()) {
    for (const [method, path] of cases) {
      const matches = (entry) =>
        entry.method === method &&
        (entry.path === path || entry.pattern?.test(path));
      const matched = table.filter(matches);
      assert.equal(matched.length, 1, method + " " + path);
      assert.equal(typeof matched[0].handler, "function");
      assert.deepEqual(
        entries.map((group) => group.filter(matches).length),
        entries.map((_, index) => Number(index === owner)),
      );
    }
  }
});

async function applicationFixture(t, options = {}, serverOptions = {}) {
  const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
  const { TranscriptionSettings } = require('../adapters/transcription-settings.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-application-refusals-'));
  const runtime = new HeadlessRuntime({
    userData: root, sessionsRoot: path.join(root, 'sessions'), config: {}, selectedModels: {}, smoke: true,
    transcriptionSettings: new TranscriptionSettings(path.join(root, 'transcription.json')),
    readClock: () => 0, log: () => {},
    agent: { answer: async () => ({ answer: 'Réponse.', kind: 'explanation', citations: [], limits: [] }) },
    ...options,
  });
  t.after(async () => { await runtime.close(); await fs.rm(root, { recursive: true, force: true }); });
  const media = { assemble: async input => ({
    ...input, clip: Buffer.from('clip'), frames: [{ atMs: input.startMs, dataUrl: 'data:image/jpeg;base64,YQ==' }],
  }) };
  return { ...await httpFixture(t, { runtime, media, ...serverOptions }), root };
}

function expectRefusal(actual, code, error, status = 400) {
  assert.deepEqual(actual, { status, value: { code, error } });
}

test('HTTP session start refuses a source title that is not a bounded string with a named code, before any session and without echoing it', async t => {
  const { SOURCE_TITLE_MAX_CHARS } = require('../core/web-retrieval.cjs');
  const f = await applicationFixture(t);
  for (const sourceTitle of [42, null, true, ['PRIVATE_TITLE'], { title: 'PRIVATE_TITLE' }, 'PRIVATE_TITLE'.padEnd(SOURCE_TITLE_MAX_CHARS + 1, 'x')]) {
    expectRefusal(await f.request('/v1/session/start', { sourceTitle }), 'invalid-source-title', 'Titre de la source invalide.');
    assert.equal(f.runtime.session, null);
  }
  const withoutType = await f.raw('/v1/session/start', { method: 'POST' });
  assert.deepEqual({ status: withoutType.status, value: await withoutType.json() },
    { status: 415, value: { error: 'JSON requis.', code: 'json-required' } });
  const withoutBody = await f.raw('/v1/session/start', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  assert.deepEqual({ status: withoutBody.status, value: await withoutBody.json() },
    { status: 400, value: { error: 'JSON invalide.', code: 'invalid-json' } });
  assert.equal(f.runtime.session, null);
  const started = await f.request('/v1/session/start', { sourceTitle: 'a'.repeat(SOURCE_TITLE_MAX_CHARS) });
  assert.equal(started.status, 200);
  assert.equal(started.value.id, f.runtime.session.id);
});

// A local question model that decides against the web and then answers that it cannot say: each decision's user
// message is kept.
async function decliningOllama(t) {
  const decisions = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk)).on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const deciding = body.messages[0].role === 'system';
      if (deciding) decisions.push(body.messages[1].content);
      const content = deciding ? { web: false, query: '' }
        : { answer: 'Je ne peux pas le dire.', kind: 'insufficient', citations: [], sources: [], limits: [] };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ model: body.model, done: true, message: { role: 'assistant', content: JSON.stringify(content) } }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return { url: `http://127.0.0.1:${server.address().port}`, decisions };
}

const DECLARED_TITLES = /Sintel|Cosmos Laundromat|Spring/;
const titleLine = title => `\nTitre de la source : ${title}\n`;
// The server host with the local agent under the model trigger. `ask` puts one question to a session over HTTP and hands
// back the user message of its web decision; the title never reaches the job.
async function localDecisionFixture(t) {
  const ollama = await decliningOllama(t);
  const f = await applicationFixture(t, { agent: undefined,
    config: { questionsBackend: 'local', localQuestions: { url: ollama.url, model: 'questions-fixture' },
      localWeb: { backend: 'corpus', corpus: '/unused', trigger: 'model' } },
    createWebRetrieval: () => ({ residence: 'local', retrieve: async () => assert.fail('a declined decision retrieves nothing') }) });
  const ask = async sessionId => {
    const { status, value } = await f.request('/v1/questions', { sessionId, anchorMs: 0, question: 'Quand ce film est-il sorti ?' });
    assert.equal(status, 200);
    const job = f.runtime.deep.jobs.find(item => item.id === value.id);
    await job.done;
    assert.equal(job.status, 'done', job.message);
    assert.doesNotMatch(JSON.stringify(job), DECLARED_TITLES);
    return ollama.decisions.at(-1);
  };
  return { f, ask, decisions: ollama.decisions };
}

test('a title declared when a session starts reaches the web decision of its questions only, until another session is loaded', async t => {
  const { f, ask, decisions } = await localDecisionFixture(t);
  const titled = (await f.request('/v1/session/start', { sourceTitle: ' Sintel\n' })).value.id;
  assert.equal((await f.request('/v1/session/start', {})).value.id, titled);
  await ask(titled);
  assert.equal((await f.request('/v1/session/end', {})).status, 200);
  assert.equal((await f.request('/v1/sessions/' + titled + '/open', {})).status, 200);
  await ask(titled);
  assert.equal((await f.request('/v1/sessions/close', {})).status, 200);
  const untitled = (await f.request('/v1/session/start', {})).value.id;
  assert.notEqual(untitled, titled);
  await ask(untitled);
  assert.equal(decisions.length, 3);
  assert.ok(decisions[0].includes(titleLine('Sintel')));
  assert.deepEqual(decisions.slice(1).map(message => message.includes('Titre de la source')), [false, false]);
});

test('a title given to a start replaces the title of the session it keeps capturing or resumes, and an empty body leaves it', async t => {
  const { f, ask } = await localDecisionFixture(t);
  const start = async body => (await f.request('/v1/session/start', body)).value.id;
  const id = await start({ sourceTitle: 'Sintel' });
  assert.equal(await start({ sourceTitle: 'Cosmos Laundromat' }), id, 'the session still capturing');
  assert.ok((await ask(id)).includes(titleLine('Cosmos Laundromat')));
  assert.equal(await start({}), id);
  assert.ok((await ask(id)).includes(titleLine('Cosmos Laundromat')), 'an empty body leaves the title');
  expectRefusal(await f.request('/v1/session/start', { sourceTitle: 42 }), 'invalid-source-title', 'Titre de la source invalide.');
  assert.ok((await ask(id)).includes(titleLine('Cosmos Laundromat')), 'a refused title leaves it too');
  assert.equal((await f.request('/v1/session/pause', {})).status, 200);
  assert.equal(await start({ sourceTitle: 'Spring' }), id, 'the paused session resumed by this start');
  assert.ok((await ask(id)).includes(titleLine('Spring')));
  assert.equal((await f.request('/v1/session/end', {})).status, 200);
  assert.equal((await f.request(`/v1/sessions/${id}/open`, {})).status, 200);
  assert.equal((await f.request(`/v1/sessions/${id}/resume`, {})).status, 200);
  assert.equal((await ask(id)).includes('Titre de la source'), false, 'an archive resumed has no title until a start gives one');
  assert.equal(await start({ sourceTitle: 'Sintel' }), id);
  assert.ok((await ask(id)).includes(titleLine('Sintel')));
});

test('HTTP state requests classify the real view, language validator and concurrent language setting', async t => {
  const { deferred } = require('./helpers/wait.cjs');
  const f = await applicationFixture(t);
  expectRefusal(await f.request('/v1/state?view=other'), 'unknown-view', 'Vue d’état inconnue.');
  expectRefusal(await f.request('/v1/settings/transcription', { language: 'es' }),
    'invalid-transcription-language', 'Langue de transcription invalide.');
  const entered = deferred(), release = deferred(), settings = f.runtime.options.transcriptionSettings;
  const save = settings.save.bind(settings);
  t.mock.method(settings, 'save', async language => { entered.resolve(); await release.promise; return save(language); });
  const pending = f.request('/v1/settings/transcription', { language: 'en' });
  try {
    await entered.promise;
    expectRefusal(await f.request('/v1/settings/transcription', { language: 'fr' }), 'language-setting-busy', 'Réglage en cours, réessaie.');
  } finally { release.resolve(); await pending; }
});

test('HTTP question requests classify real session, anchor, question and moment refusals', async t => {
  const f = await applicationFixture(t);
  expectRefusal(await f.request('/v1/questions', { sessionId: 'absent' }), 'stale-session', 'Session obsolète.');
  const { id } = (await f.request('/v1/session/start', {})).value;
  for (const anchorMs of [-1, 3001]) {
    expectRefusal(await f.request('/v1/questions', { sessionId: id, anchorMs, question: 'Pourquoi ?' }), 'invalid-anchor', 'Ancrage invalide.');
  }
  expectRefusal(await f.request('/v1/questions', { sessionId: id, anchorMs: 0, question: '' }), 'invalid-question', 'Question invalide.');
  for (let i = 0; i < 3; i++) await f.runtime.ingest({
    sessionId: id, startMs: i * 100, endMs: (i + 1) * 100,
    clip: Buffer.from('clip'), frames: [{ atMs: i * 100, dataUrl: 'data:image/jpeg;base64,YQ==' }],
  });
  for (const [selection, code, message] of [
    [{ segmentIds: [] }, 'invalid-moment-selection', 'Sélection de moments invalide.'],
    [{ firstId: 'moment-2', lastId: 'moment-1' }, 'invalid-moment-selection', 'Bornes de moment invalides.'],
    [{ segmentIds: ['moment-99'] }, 'moment-missing', 'Moment absent de cette session.'],
    [{ segmentIds: ['moment-1', 'moment-3'] }, 'discontinuous-moment-interval', 'Intervalle discontinu.'],
  ]) {
    expectRefusal(await f.request('/v1/moments/detail', { sessionId: id, ...selection }), code, message);
    expectRefusal(await f.request('/v1/questions', { sessionId: id, anchorMs: 0, question: 'Pourquoi ?', moment: selection }), code, message);
  }
});

test('HTTP question queue fullness comes from the real queue without starting a refused question', async t => {
  const { deferred } = require('./helpers/wait.cjs');
  const release = deferred();
  let calls = 0;
  const f = await applicationFixture(t, { agent: { answer: async () => {
    calls++;
    await release.promise;
    return { answer: 'Réponse.', kind: 'explanation', citations: [], limits: [] };
  } } });
  t.after(() => release.resolve());
  const { id } = (await f.request('/v1/session/start', {})).value;
  const question = { sessionId: id, anchorMs: 0, question: 'Pourquoi ?' };
  for (let i = 0; i < 6; i++) assert.equal((await f.request('/v1/questions', question)).status, 200);
  expectRefusal(await f.request('/v1/questions', question), 'question-queue-full',
    'Cinq questions sont déjà en attente. Attends une réponse ou annule une question.');
  assert.equal(calls, 1);
});

test('HTTP surveillance requests classify real instruction, retry and history refusals', async t => {
  const f = await applicationFixture(t);
  expectRefusal(await f.request('/v1/surveillance/start', { sessionId: 'absent' }), 'stale-session', 'Session obsolète.');
  const { id } = (await f.request('/v1/session/start', {})).value;
  const request = (path, fields = {}) => f.request('/v1/surveillance/' + path, { sessionId: id, ...fields });
  expectRefusal(await request('start', { instruction: '' }), 'invalid-surveillance-instruction',
    'Écris une consigne de surveillance de 1 à 1 500 caractères.');
  expectRefusal(await request('retry', { id: 'claim-99' }), 'invalid-surveillance-retry', 'Active la surveillance avant de relancer.');
  assert.equal((await request('start', { instruction: 'Vérifie.' })).status, 200);
  await f.runtime.surveillance.ready();
  expectRefusal(await request('retry', { id: 'claim-99' }), 'invalid-surveillance-retry', 'Cet élément ne peut pas être relancé.');
  expectRefusal(await request('history', { beforeSeq: 0 }), 'invalid-history-cursor', 'Curseur d’historique invalide.');
  expectRefusal(await request('history', { limit: 0 }), 'invalid-history-limit', 'Limite d’historique invalide.');
  expectRefusal(await request('detail', { id: '../claim-1' }), 'invalid-surveillance-id', 'Identifiant de surveillance invalide.');
  expectRefusal(await request('detail', { id: 'claim-99' }), 'not-found', 'Élément de surveillance introuvable.', 404);
});

test('HTTP surveillance without a session identifies the shared composition refusal', async t => {
  const { createSurveillanceRuntime } = require('../runtime/surveillance-runtime.cjs');
  const surveillance = createSurveillanceRuntime({ getSession: () => null, agent: {} });
  t.after(() => surveillance.close());
  const f = await httpFixture(t, { runtime: { startSurveillance: input => surveillance.start(input) } });
  expectRefusal(await f.request('/v1/surveillance/start', { instruction: 'Vérifie.' }),
    'surveillance-session-required', 'Démarre une session avant d’activer la surveillance.');
});

test('HTTP ingestion distinguishes real admission, captured segment and observation order refusals', async t => {
  const f = await applicationFixture(t);
  expectRefusal(await f.request('/v1/segments', block()), 'stale-session', 'Session obsolète.');
  const { id } = (await f.request('/v1/session/start', {})).value;
  const input = block({ sessionId: id, endMs: 200 });
  await f.runtime.pause();
  expectRefusal(await f.request('/v1/segments', input), 'session-stopped', 'La session est arrêtée.');
  await f.runtime.start();
  const assemble = f.media.assemble;
  for (const [change, code, message] of [
    [{ clip: Buffer.alloc(0) }, 'invalid-captured-segment', 'Segment vidéo trop volumineux ou vide.'],
    [{ startMs: -1 }, 'invalid-capture-time', 'Horodatage invalide.'],
  ]) {
    const mock = t.mock.method(f.media, 'assemble', async body => ({ ...await assemble(body), ...change }));
    expectRefusal(await f.request('/v1/segments', input), code, message);
    mock.mock.restore();
  }
  assert.equal((await f.request('/v1/segments', input)).status, 200);
  expectRefusal(await f.request('/v1/segments', { ...input, sequence: 2 }), 'invalid-capture-order',
    'Les segments doivent suivre l’ordre d’observation.');
});

test('HTTP library requests retain real invalid identifier, missing archive and unreadable archive classifications', async t => {
  const { randomUUID } = require('node:crypto');
  const f = await applicationFixture(t);
  for (const action of ['open', 'resume', 'delete']) {
    expectRefusal(await f.request('/v1/sessions/invalid/' + action, {}), 'invalid-session-id', 'Identifiant de session invalide.');
    expectRefusal(await f.request('/v1/sessions/' + randomUUID() + '/' + action, {}), 'not-found', 'Session introuvable.', 404);
  }
  for (const content of [null, '{', JSON.stringify({ id: 'other', segments: [] })]) {
    const id = randomUUID(), dir = f.runtime.library.dir(id);
    await fs.mkdir(dir, { recursive: true });
    if (content !== null) await fs.writeFile(path.join(dir, 'session.json'), content);
    expectRefusal(await f.request('/v1/sessions/' + id + '/open', {}), 'invalid-archive', 'Archive illisible.');
  }
});

test('HTTP opening refuses a saved state of another format or version as an invalid archive, without a write', async t => {
  const { randomUUID } = require('node:crypto');
  const f = await applicationFixture(t);
  const files = async dir => Promise.all((await fs.readdir(dir, { recursive: true })).sort().map(async name => {
    const target = path.join(dir, name);
    return [name, (await fs.stat(target)).isFile() ? (await fs.readFile(target)).toString('base64') : 'dir'];
  }));
  for (const envelope of [
    { format: 'tvlens-viewing-memory', version: 2 }, { format: 'tvlens-viewing-memory' }, { version: 1 }, { format: 'tvlens-session', version: 1 },
  ]) {
    const id = randomUUID(), dir = f.runtime.library.dir(id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'session.json'), JSON.stringify({ ...envelope, id, elapsedMs: 0, retention: 'until-deleted', segments: [] }));
    const before = await files(dir);
    expectRefusal(await f.request('/v1/sessions/' + id + '/open', {}), 'invalid-archive', 'Archive illisible.');
    assert.deepEqual(await files(dir), before, JSON.stringify(envelope));
  }
});

test('HTTP closing refusals retain their historical 400 while admitted capture closing stays 503', async t => {
  const { deferred } = require('./helpers/wait.cjs');
  const f = await applicationFixture(t);
  const { id } = (await f.request('/v1/session/start', {})).value;
  const entered = deferred(), release = deferred();
  const transition = f.runtime.exclusive(async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  const closed = f.runtime.close();
  try {
    for (const [route, body] of [
      ['/v1/questions', { sessionId: id }], ['/v1/surveillance/start', { sessionId: id }],
    ]) {
      expectRefusal(await f.request(route, body), 'session-closing', 'Session en cours de fermeture.');
    }
    expectRefusal(await f.request('/v1/segments', block({ sessionId: id })), 'session-closing', 'Session en cours de fermeture.', 503);
    const requests = ['start', 'open', 'resume'].map(action => {
      const route = action === 'start' ? '/v1/session/start' : '/v1/sessions/' + id + '/' + action;
      return f.request(route, {});
    });
    release.resolve();
    await transition;
    for (const response of await Promise.all(requests)) expectRefusal(response, 'session-closing', 'Session en cours de fermeture.');
  } finally { release.resolve(); await closed; }
});

for (const [options, code, message] of [
  [{ intent: 'other' }, 'invalid-question-action', 'Action inconnue.'],
  [{ startMs: 2, anchorMs: 1 }, 'invalid-question-interval', 'Intervalle de question invalide.'],
]) {
  test(`HTTP translates the real question emitter refusal ${code}`, async t => {
    const { DeepAsk } = require('../core/deep-ask.cjs');
    const deep = new DeepAsk({});
    const f = await httpFixture(t, { runtime: { ask: input => deep.start(input.question, input) } });
    expectRefusal(await f.request('/v1/questions', { question: 'Pourquoi ?', ...options }), code, message);
  });
}

test('HTTP library transitions preserve exact capturing, not-open and read-only refusals', async t => {
  const { emptyArchive } = require('./helpers/empty-archive.cjs');
  const f = await applicationFixture(t);
  const archive = await emptyArchive(f.runtime.options.sessionsRoot, 'server');
  const { id } = (await f.request('/v1/session/start', {})).value;
  expectRefusal(await f.request('/v1/sessions/' + archive.id + '/open', {}), 'capturing',
    'Arrête la capture avant d’ouvrir une autre session.', 409);
  expectRefusal(await f.request('/v1/sessions/' + archive.id + '/resume', {}), 'not-open',
    'Ouvre cette session avant de reprendre la capture.', 409);
  expectRefusal(await f.request('/v1/sessions/' + id + '/delete', {}), 'capturing',
    'Arrête la capture avant de supprimer cette session.', 409);
  await f.runtime.pause();
  assert.equal((await f.request('/v1/sessions/' + archive.id + '/open', {})).status, 200);
  const { READ_ONLY } = require('../runtime/headless-runtime.cjs');
  expectRefusal(await f.request('/v1/session/start', {}), 'read-only', READ_ONLY, 409);
  expectRefusal(await f.request('/v1/segments', block({ sessionId: archive.id })), 'read-only', READ_ONLY, 409);
  expectRefusal(await f.request('/v1/surveillance/start', { sessionId: archive.id }), 'read-only',
    'Session ouverte en lecture seule : reprends la capture avant d’activer la surveillance.', 409);
});


for (const code of ['EIO', 'EACCES', 'EMFILE']) {
  test(`HTTP archive opening answers a real ${code} read failure generically and journals its cause`, async t => {
    const { emptyArchive } = require('./helpers/empty-archive.cjs');
    const entries = [];
    const f = await applicationFixture(t, {}, { logError: entry => entries.push(entry) });
    const archive = await emptyArchive(f.runtime.options.sessionsRoot, 'server');
    const file = path.join(archive.dir, 'session.json'), readFile = fs.readFile;
    const cause = Object.assign(Error('Fichier de session illisible.'), { code });
    t.mock.method(fs, 'readFile', async (target, ...args) => {
      if (target === file) throw cause;
      return readFile(target, ...args);
    });
    const pathname = '/v1/sessions/' + archive.id + '/open';
    expectRefusal(await f.request(pathname, {}), 'internal-error', 'Erreur interne du serveur.', 500);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].method, 'POST');
    assert.equal(entries[0].pathname, pathname);
    assert.equal(entries[0].error.message, 'Archive illisible.');
    assert.equal(entries[0].error.cause, cause);
    assert.equal(entries[0].cause, cause);
  });
}
