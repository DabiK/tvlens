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
    { method: "POST", path: "/v1/session/start", name: "start", args: [] },
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

test("HTTP carries recognized application codes at every error status independently of their message", async (t) => {
  const f = await httpFixture(t);
  const cases = [
    [400, "invalid-capture-time"],
    [503, "media-unavailable"],
    [409, "read-only"],
    [503, "session-closing"],
    [409, "capture-changed"],
    [409, "capturing"],
    [409, "not-open"],
    [404, "not-found"],
    [507, STORAGE_FULL, "storage-full"],
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
});

test("HTTP leaves errno, unknown identities and familiar wording unclassified with the historical fallback", async (t) => {
  const f = await httpFixture(t);
  for (const fields of [
    {}, { code: "ENOENT" }, { code: "EIO" }, { code: "ENOSPC" },
    { code: "not-a-recognized-code" }, { code: "TVLENS_UNKNOWN_ERROR" }, { code: 42 },
    { status: 399 }, { status: 600 }, { status: "503" }, { status: 400.5 },
    { status: 503, code: "EIO" },
  ]) {
    for (const message of ["Session obsolète.", "Espace disque insuffisant."]) {
      f.runtime.ask = () => { throw Object.assign(Error(message), fields); };
      assert.deepEqual(await f.request("/v1/questions", {}), {
        status: fields.status === 503 ? 503 : 400,
        value: { error: message, code: "unclassified-error" },
      });
    }
  }
  assert.deepEqual(f.events, []);
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

test("the composed table gives each of the 26 method and path pairs exactly one group owner", () => {
  const f = ingestionFixture();
  const groups = [
    [
      createStateRoutes,
      [
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
  assert.equal(table.length, 26);
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
