const test = require("node:test");
const assert = require("node:assert/strict");
const { VIEWS } = require("../runtime/state-views.cjs");
const { PollPlan, mergeState } = require("../tv/app/chat-model.js");
const { createServerHost } = require("./helpers/server-host.cjs");

test("the TV client revalidates the complete state and every mergeable view independently", async (t) => {
  const host = await createServerHost(t);
  const { value: { id } } = await host.producer("/v1/session/start", {});
  const tags = [];
  let merged;
  for (const view of [undefined, ...VIEWS]) {
    const first = await host.client.state(view);
    assert.equal(first.notModified, false);
    assert.equal(first.value.session.id, id);
    merged = mergeState(merged, first.value, view);
    assert.equal(merged.session.id, id);
    assert.ok(Array.isArray(merged.chat.jobs));
    const second = await host.client.state(view);
    assert.equal(second.notModified, true);
    assert.equal(second.value, first.value, "304 keeps the same held value");
    const [fresh, unchanged] = host.trace.slice(-2);
    assert.equal(fresh?.status, 200, "the fetcher records the actual HTTP response");
    assert.equal(fresh.headers.has("if-none-match"), false);
    assert.equal(unchanged.status, 304);
    assert.equal(unchanged.bytes, 0);
    assert.equal(unchanged.headers.get("if-none-match"), fresh.etag);
    assert.equal(unchanged.etag, fresh.etag);
    tags.push(fresh.etag);
  }
  assert.equal(new Set(tags).size, VIEWS.length + 1);
  for (const [index, view] of [undefined, ...VIEWS].entries()) {
    const route = "/v1/state" + (view ? "?view=" + view : "");
    const response = await host.client.send(route, undefined, {
      "If-None-Match": tags[(index + 1) % tags.length],
    });
    assert.equal(response.status, 200, "another view's tag validates nothing");
    assert.equal(response.headers.get("etag"), tags[index]);
    assert.equal((await response.json()).session.id, id);
  }
});

function block(sessionId, sequence = 1, startMs = 0) {
  return {
    sessionId, sequence, startMs, endMs: startMs + 8000,
    frames: [{ atMs: startMs, data: "YQ==" }],
    audio: "QUI=",
  };
}

test("ingestion and controlled analysis each publish a new mergeable state to every TV view", { timeout: 10000 }, async (t) => {
  const host = await createServerHost(t);
  const { value: { id } } = await host.producer("/v1/session/start", {});
  for (const view of [undefined, ...VIEWS]) await host.client.state(view);
  const analysis = host.analysis.hold();
  const ready = host.published((state) => state.session?.segments[0]?.status === "ready");
  await host.clock.advance(8000);
  const sent = await host.producer("/v1/segments", block(id));
  assert.deepEqual(sent, { status: 200, value: { id: "moment-1", duplicate: false } });
  await analysis.started;
  const revisions = new Map();
  let merged;
  for (const view of [undefined, ...VIEWS]) {
    const partial = await host.client.state(view);
    assert.equal(partial.notModified, false);
    assert.equal(partial.value.session.id, id);
    assert.equal(partial.value.session.capturedThroughMs, 8000);
    assert.equal(partial.value.session.analyzedThroughMs, 0, "the test has not released vision yet");
    merged = mergeState(merged, partial.value, view);
    revisions.set(view, partial.value.revision);
    const stable = await host.client.state(view);
    assert.equal(stable.notModified, true);
    assert.equal(stable.value, partial.value);
  }
  assert.equal(merged.session.segments[0].visionStatus, "analyzing");
  analysis.release();
  await ready;
  for (const view of [undefined, ...VIEWS]) {
    const complete = await host.client.state(view);
    assert.equal(complete.notModified, false);
    assert.ok(complete.value.revision > revisions.get(view));
    merged = mergeState(merged, complete.value, view);
    assert.equal(merged.session.id, id);
    assert.equal(merged.session.analyzedThroughMs, 8000);
    const stable = await host.client.state(view);
    assert.equal(stable.notModified, true);
    assert.equal(stable.value, complete.value);
  }
  assert.equal(merged.session.segments[0].status, "ready");
  assert.equal(merged.timeline.cards[0].segmentIds[0], sent.value.id);
});

test("an unknown view preserves its HTTP identity and makes the real poll plan use full state", async (t) => {
  const host = await createServerHost(t);
  const { value: { id } } = await host.producer("/v1/session/start", {});
  let refusal;
  await assert.rejects(host.client.state("unavailable"), (error) => {
    refusal = error;
    assert.equal(error.status, 400);
    assert.equal(error.code, "unknown-view");
    return true;
  });
  assert.equal(host.trace.at(-1).value.code, refusal.code);
  assert.equal(new PollPlan().refused(refusal, host.clock.io.now()), true);
  const plan = new PollPlan();
  const unavailableView = { state: (view) => host.client.state(view ? "unavailable" : undefined) };
  const read = await plan.read(unavailableView, null, host.clock.io.now);
  assert.equal(plan.legacy, true);
  assert.equal(read.view, null);
  assert.deepEqual(host.trace.slice(-2).map((row) => row.route), ["/v1/state?view=unavailable", "/v1/state"]);
  assert.equal(mergeState(null, read.answer.value, read.view).session.id, id);
  await host.clock.advance(20000);
  const next = await plan.read(host.client, read.answer.value, host.clock.io.now);
  assert.equal(next.view, null);
  assert.equal(next.answer.notModified, true);
  assert.deepEqual(host.trace.slice(-2).map((row) => row.route), ["/v1/state", "/v1/state"]);
});

test("authentication, missing routes and oversized bodies keep status and code through the TV client", async (t) => {
  const host = await createServerHost(t);
  const oversized = { padding: "é".repeat(12000) };
  const cases = [
    [host.clientWithToken("incorrect"), "/v1/missing", oversized, 401, "unauthenticated"],
    [host.client, "/v1/missing", undefined, 404, "route-not-found"],
    [host.client, "/v1/missing", oversized, 413, "request-too-large"],
    [host.client, "/v1/session/start", oversized, 413, "request-too-large"],
  ];
  for (const [client, route, body, status, code] of cases) {
    await assert.rejects(client.request(route, body), (error) => {
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      return true;
    });
    const reply = host.trace.at(-1);
    assert.equal(reply.status, status);
    assert.equal(reply.value.code, code);
    assert.equal(typeof reply.value.error, "string");
  }
  assert.equal((await host.client.state()).value.session, null, "refusals have not started a session");
});

test("producer capture and TV session commands preserve identity, order and distinct end envelopes", { timeout: 10000 }, async (t) => {
  const host = await createServerHost(t);
  const { client, producer } = host;
  const started = await producer("/v1/session/start", {});
  assert.equal(started.status, 200);
  const { id } = started.value;
  assert.deepEqual([started.value.accepting, started.value.readOnly, started.value.elapsedMs], [true, false, 0]);
  assert.deepEqual(await producer("/v1/session"), {
    status: 200, value: { id, accepting: true, readOnly: false, storage: { state: "unknown" } },
  });
  const ready = host.published((state) => state.session?.segments[0]?.status === "ready");
  await host.clock.advance(8000);
  assert.deepEqual(await producer("/v1/segments", block(id)), {
    status: 200, value: { id: "moment-1", duplicate: false },
  });
  await ready;
  assert.deepEqual(await client.request("/v1/session/pause", {}), { paused: true });
  const paused = (await client.state("panel")).value;
  assert.deepEqual([paused.session.id, paused.session.accepting, paused.session.elapsedMs], [id, false, 8000]);
  assert.deepEqual(await client.request("/v1/session/end", {}), { ended: true, id, archived: true });
  const ended = await client.state("panel");
  assert.equal(mergeState(paused, ended.value, "panel").session, null);
  const listing = await client.sessions();
  assert.equal(listing.current, null);
  assert.deepEqual(listing.sessions.map((row) => [row.id, row.state, row.passages]), [[id, "archived", 1]]);

  const opened = await client.sessionAction(id, "open");
  assert.deepEqual([opened.id, opened.accepting, opened.readOnly, opened.elapsedMs], [id, false, true, 8000]);
  const archive = await client.state("panel");
  assert.deepEqual(archive.value.session.segments.map((passage) => [passage.id, passage.status]), [["moment-1", "ready"]]);
  assert.equal(mergeState(ended.value, archive.value, "panel").session.id, id);
  await assert.rejects(client.request("/v1/session/start", {}), { status: 409, code: "read-only" });
  const refused = await producer("/v1/segments", block(id));
  assert.equal(refused.status, 409);
  assert.equal(refused.value.code, "read-only");
  assert.equal(host.assembled.length, 1, "an archive refuses even an old duplicate before media preparation");
  const unchanged = await client.state("panel");
  assert.equal(unchanged.notModified, true);
  assert.equal(unchanged.value, archive.value, "consulting and refused starts do not resume the archive");

  await host.clock.advance(20000);
  const resumed = await client.sessionAction(id, "resume");
  assert.deepEqual([resumed.id, resumed.readOnly, resumed.accepting, resumed.elapsedMs], [id, false, true, 8000]);
  const state = await client.state("panel");
  assert.equal(state.notModified, false);
  assert.deepEqual([state.value.session.id, state.value.session.accepting, state.value.session.readOnly], [id, true, false]);
  await host.clock.advance(8000);
  assert.equal((await producer("/v1/session")).value.accepting, true);
  const nextReady = host.published((snapshot) => snapshot.session?.segments[1]?.status === "ready");
  assert.deepEqual(await producer("/v1/segments", block(id, 1, 8000)), {
    status: 200, value: { id: "moment-2", duplicate: false },
  });
  await nextReady;
  assert.deepEqual(await client.closeSession(), { closed: true, id, archived: true });
  const closed = await client.sessions();
  assert.equal(closed.current, null);
  assert.deepEqual(closed.sessions.map((row) => [row.id, row.state, row.passages]), [[id, "archived", 2]]);

  assert.deepEqual(host.trace.map(({ caller, method, route, status }) => [caller, method, route, status]), [
    ["producer", "POST", "/v1/session/start", 200],
    ["producer", "GET", "/v1/session", 200],
    ["producer", "POST", "/v1/segments", 200],
    ["panel", "POST", "/v1/session/pause", 200],
    ["panel", "GET", "/v1/state?view=panel", 200],
    ["panel", "POST", "/v1/session/end", 200],
    ["panel", "GET", "/v1/state?view=panel", 200],
    ["panel", "GET", "/v1/sessions", 200],
    ["panel", "POST", `/v1/sessions/${id}/open`, 200],
    ["panel", "GET", "/v1/state?view=panel", 200],
    ["panel", "POST", "/v1/session/start", 409],
    ["producer", "POST", "/v1/segments", 409],
    ["panel", "GET", "/v1/state?view=panel", 304],
    ["panel", "POST", `/v1/sessions/${id}/resume`, 200],
    ["panel", "GET", "/v1/state?view=panel", 200],
    ["producer", "GET", "/v1/session", 200],
    ["producer", "POST", "/v1/segments", 200],
    ["panel", "POST", "/v1/sessions/close", 200],
    ["panel", "GET", "/v1/sessions", 200],
  ]);
  for (const row of host.trace) {
    assert.match(row.headers.get("authorization"), /^Bearer w{64}$/);
    if (row.route === "/v1/segments") {
      assert.equal(row.body.sessionId, id);
      assert.deepEqual(row.body, block(id, 1, row.body.startMs));
    } else assert.deepEqual(row.body, row.method === "POST" ? {} : undefined);
  }
});

test("replayed blocks retain their id while conflicts, stale sequences and admission keep their refusal order", { timeout: 10000 }, async (t) => {
  const host = await createServerHost(t);
  const { value: { id } } = await host.producer("/v1/session/start", {});
  await host.clock.advance(16000);
  const input = block(id, 42);
  const ready = host.published((state) => state.session?.segments[0]?.status === "ready");
  const first = await host.producer("/v1/segments", input);
  assert.deepEqual(first, { status: 200, value: { id: "moment-1", duplicate: false } });
  await ready;
  const before = await host.client.state("panel");
  assert.deepEqual(await host.producer("/v1/segments", input), {
    status: 200, value: { id: first.value.id, duplicate: true },
  });
  for (const [body, status, code] of [
    [{ ...input, audio: "Q0Q=" }, 409, "sequence-conflict"],
    [block(id, 41, 8000), 409, "stale-sequence"],
    [{ ...input, frames: [] }, 400, "invalid-media-block"],
    [block(id, 42, 16000), 400, "invalid-capture-time"],
  ]) {
    const refused = await host.producer("/v1/segments", body);
    assert.equal(refused.status, status);
    assert.equal(refused.value.code, code);
  }
  assert.equal(host.assembled.length, 1, "transport refusals never reach the assembler");
  const after = await host.client.state("panel");
  assert.equal(after.notModified, true);
  assert.equal(after.value, before.value);
  assert.deepEqual(after.value.session.segments.map((passage) => passage.id), [first.value.id]);
  await host.client.request("/v1/session/pause", {});
  const stopped = await host.producer("/v1/segments", input);
  assert.equal(stopped.status, 400, "admission runs before duplicate lookup");
  assert.equal(stopped.value.code, "session-stopped");
  assert.equal(host.assembled.length, 1);
});
