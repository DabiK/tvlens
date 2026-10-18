const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createEventPublisher } = require("../core/shared/events.cjs");
const { createSessionManifest } = require("../runtime/session-manifest.cjs");
const {
  sessionTitle,
  MANIFEST_FORMAT,
  MANIFEST_VERSION,
} = require("../adapters/session-library.cjs");

function fixture(extra = {}) {
  const f = {
    clock: 0,
    wall: 1000,
    readOnly: false,
    archived: false,
    writes: [],
    gate: null,
    refusal: null,
  };
  const store = {
    bytes: 1234,
    manifest: null,
    confirmed: null,
    saveManifest(value) {
      store.manifest = { ...store.manifest, ...value };
      const asked = structuredClone(store.manifest);
      f.writes.push(asked);
      return (async () => {
        await f.gate;
        if (f.refusal) throw f.refusal;
        store.confirmed = asked;
        return asked;
      })();
    },
  };
  f.store = store;
  f.thumbnails = { bytes: 66 };
  const events = createEventPublisher();
  f.current = state({ history: [], segments: [], coverage: { passages: 0 } });
  const memory = {
    view: () => f.current,
    passages: () => ({ clock: { capturedThroughMs: f.current.passages.at(-1)?.endMs || 0 } }),
  };
  f.manifest = createSessionManifest({
    id: "session",
    host: "server",
    store,
    thumbnails: f.thumbnails,
    readClock: () => f.clock,
    wallClock: () => f.wall,
    readOnly: () => f.readOnly || f.current.session.readOnly,
    accepting: () => f.current.session.accepting,
    memory,
    hasConfirmedEnd: () => f.archived,
    ...extra,
  });
  f.manifest.connect(events);
  f.publish = current => {
    f.current = current;
    if (current.coverage.passages) events.publish({ type: "PassageReceived", sessionId: "session" });
    return f.manifest.publish();
  };
  f.record = (current, ...args) => {
    f.current = current;
    return f.manifest.record(...args);
  };
  return f;
}

function state(extra = {}) {
  const source = {
    accepting: true,
    readOnly: false,
    elapsedMs: 24000,
    capturedThroughMs: 23000,
    retention: "until-deleted",
    history: [{ id: "moment-1", observation: { topic: "Ancien sujet" } }],
    segments: [
      {
        id: "moment-2",
        available: true,
        observation: { topic: "Sujet récent" },
      },
      { id: "moment-3", available: false },
    ],
    coverage: { passages: 3 },
    ...extra,
  };
  return {
    session: { accepting: source.accepting, readOnly: source.readOnly, retention: source.retention },
    clock: { elapsedMs: source.elapsedMs, capturedThroughMs: source.capturedThroughMs },
    passages: [...source.history, ...source.segments],
    coverage: { ...source.coverage, replayablePassages: source.segments.filter(p => p.available).length },
  };
}

test("a manifest keeps session totals and wall dates with the original title and topic fallbacks", async () => {
  const f = fixture();
  f.wall = 2000;
  await f.record(state());
  assert.deepEqual(f.writes[0], {
    format: MANIFEST_FORMAT,
    version: MANIFEST_VERSION,
    id: "session",
    host: "server",
    createdAt: 1000,
    updatedAt: 2000,
    closedAt: null,
    state: "live",
    title: sessionTitle(1000),
    firstTopic: "Ancien sujet",
    elapsedMs: 24000,
    capturedThroughMs: 23000,
    passages: 3,
    media: { stored: 1, missing: 2, bytes: 1300, retention: "until-deleted" },
    captures: [{ startedAt: 1000, fromMs: 0 }],
  });
});

test("the first eligible publication writes at once and the monotonic clock limits requests even behind a held disk", async () => {
  const f = fixture();
  let release;
  f.gate = new Promise((resolve) => {
    release = resolve;
  });
  for (const ineligible of [
    state({ coverage: { passages: 0 } }),
    state({ accepting: false }),
    state({ readOnly: true }),
  ])
    f.publish(ineligible);
  assert.equal(f.writes.length, 0);
  f.clock = 500;
  f.wall = 7000;
  const first = f.publish(state());
  assert.equal(
    f.writes.length,
    1,
    "the first stored passage does not wait for the cadence",
  );
  assert.equal(f.store.confirmed, null);
  f.clock = 30499;
  f.wall = 900000;
  f.publish(state());
  assert.equal(
    f.writes.length,
    1,
    "wall-clock jumps do not advance the cadence",
  );
  f.clock = 30500;
  f.wall = 6000;
  const second = f.publish(state({ elapsedMs: 54000 }));
  assert.deepEqual(
    f.writes.map((value) => [value.updatedAt, value.elapsedMs]),
    [
      [7000, 24000],
      [6000, 54000],
    ],
  );
  assert.equal(
    f.store.confirmed,
    null,
    "publication does not wait for the disk",
  );
  release();
  await Promise.all([first, second]);
  assert.equal(f.store.confirmed.elapsedMs, 54000);
});

test("an archive opened read-only never writes a current or final manifest", async () => {
  const f = fixture({
    restore: {
      manifest: { captures: [{ startedAt: 50, fromMs: 0 }] },
      createdAt: 50,
    },
  });
  f.readOnly = true;
  f.publish(state({ readOnly: true }));
  await f.record(state());
  await f.record(state(), {}, true);
  assert.deepEqual(f.writes, []);
});

test("resuming appends a wall-clock capture at the session offset and keeps the latest hundred entries", async () => {
  const earlier = [{ startedAt: 50, fromMs: 0 }];
  const f = fixture({
    restore: { manifest: { captures: earlier }, createdAt: 50 },
  });
  f.wall = 5000;
  f.manifest.captureResumed(24000);
  await f.record(state());
  assert.deepEqual(f.writes[0].captures, [
    { startedAt: 50, fromMs: 0 },
    { startedAt: 5000, fromMs: 24000 },
  ]);
  assert.deepEqual(
    earlier,
    [{ startedAt: 50, fromMs: 0 }],
    "the previous life's capture list is not extended",
  );
  for (let i = 1; i <= 105; i++) {
    f.wall = 5000 + i;
    f.manifest.captureResumed(24000 + i * 1000);
  }
  await f.record(state());
  const last = f.writes.at(-1);
  assert.equal(
    last.createdAt,
    50,
    "trimming captures does not change the session's creation time",
  );
  assert.equal(last.captures.length, 100);
  assert.deepEqual(
    [last.captures[0], last.captures.at(-1)],
    [
      { startedAt: 5006, fromMs: 30000 },
      { startedAt: 5105, fromMs: 129000 },
    ],
  );
});

test("a current manifest refusal is absorbed while the final refusal is returned to its caller", async () => {
  const f = fixture();
  const refusal = Object.assign(new Error("Écriture refusée."), {
    code: "EIO",
  });
  f.refusal = refusal;
  f.clock = 100;
  await assert.doesNotReject(f.record(state()));
  assert.equal(f.store.confirmed, null);
  f.clock = 30099;
  f.publish(state());
  assert.equal(
    f.writes.length,
    1,
    "a refusal still advances the publication cadence",
  );
  await assert.rejects(
    f.record(state(), {}, true),
    (error) => error === refusal,
  );
  assert.equal(f.store.confirmed, null);
  f.refusal = null;
  await f.record(state());
  assert.equal(
    f.store.confirmed.state,
    "live",
    "a refused final write does not confirm this life's end",
  );
});

test("a late pause keeps a confirmed end but a resumed life does not inherit its predecessor's confirmation", async () => {
  const f = fixture({ restore: { manifest: { captures: [] }, createdAt: 10 } });
  f.store.manifest = {
    createdAt: 0,
    host: "mac",
    title: "Film",
    firstTopic: "Sujet gardé",
    state: "archived",
    closedAt: 100,
  };
  await f.record(state());
  assert.deepEqual(
    [
      f.store.confirmed.state,
      f.store.confirmed.closedAt,
      f.store.confirmed.createdAt,
      f.store.confirmed.host,
      f.store.confirmed.title,
      f.store.confirmed.firstTopic,
    ],
    ["live", null, 0, "mac", "Film", "Sujet gardé"],
  );
  let release;
  f.gate = new Promise((resolve) => {
    release = resolve;
  });
  f.wall = 9000;
  const final = f.record(state(), {}, true);
  assert.equal(
    f.store.confirmed.state,
    "live",
    "asking for a final write does not confirm it",
  );
  release();
  await final;
  f.archived = true;
  f.wall = 12000;
  await f.record(state({ accepting: false }));
  assert.deepEqual(
    [f.store.confirmed.state, f.store.confirmed.closedAt],
    ["archived", 9000],
  );
});

test("legacy restoration falls back to its creation date or the wall clock and explicit patches keep precedence", async () => {
  const blank = state({ history: [], segments: [], coverage: { passages: 0 } });
  for (const [restore, createdAt] of [
    [{ createdAt: 25 }, 25],
    [{}, 3000],
  ]) {
    const f = fixture({ restore });
    f.wall = 3000;
    await f.record(blank);
    assert.deepEqual(
      [f.writes[0].createdAt, f.writes[0].firstTopic, f.writes[0].captures],
      [createdAt, null, []],
    );
    const media = { stored: 0, missing: 3, bytes: 0, retention: "rolling" };
    await f.record(state(), { media, title: "Titre choisi" }, true);
    assert.deepEqual(
      [f.writes[1].media, f.writes[1].title, f.writes[1].state],
      [media, "Titre choisi", "archived"],
    );
  }
});
