const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const childProcess = require("node:child_process");
const { SessionLibrary } = require("../adapters/session-library.cjs");
const { LocalSessionStore } = require("../adapters/local-store.cjs");
const { HeadlessRuntime } = require("../runtime/headless-runtime.cjs");

const CORPUS = path.join(__dirname, "fixtures", "archives", "durable-v1");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COPY_TIME = new Date("2024-01-02T03:04:05.000Z");
const SUMS = "SHA256SUMS";
const HISTORICAL = path.join(__dirname, "fixtures", "archives", "historical-v1");
const VARIANTS = [
  "unversioned", "text-history", "without-retention", "modern-without-manifest",
  "rolling-history", "historical-questions", "interrupted-analysis", "retry-counters",
  "unknown-retention", "invalid-retry-counters",
];

test("the historical corpus freezes every named archive variant independently of its readers", async () => {
  const entries = await fs.readdir(HISTORICAL, { withFileTypes: true }).catch(error => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  assert.deepEqual(entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort(), [...VARIANTS].sort());
});

async function filesUnder(root, dir = root) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(root, target));
    else {
      assert.equal(entry.isFile(), true, "the corpus contains only directories and regular files");
      files.push(path.relative(root, target));
    }
  }
  return files.sort();
}

async function fingerprint(root) {
  const rows = [];
  for (const name of await filesUnder(root)) {
    const target = path.join(root, name);
    rows.push({ name, hash: createHash("sha256").update(await fs.readFile(target)).digest("hex"), mtimeMs: (await fs.stat(target)).mtimeMs });
  }
  return rows;
}

async function verifySums(root) {
  const lines = (await fs.readFile(path.join(root, SUMS), "utf8")).trimEnd().split("\n");
  const sums = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line);
    assert.ok(match, "each checksum row has a SHA-256 and a relative path");
    assert.equal(sums.has(match[2]), false, "no duplicate checksum path");
    sums.set(match[2], match[1]);
  }
  const files = await filesUnder(root);
  assert.deepEqual([...sums.keys()].sort(), files.filter(name => name !== SUMS), "checksums cover the exact corpus without self-reference");
  for (const row of await fingerprint(root)) {
    if (row.name !== SUMS) assert.equal(row.hash, sums.get(row.name), row.name);
  }
}

async function withCopy(work, corpus = CORPUS) {
  await verifySums(corpus);
  const original = await fingerprint(corpus);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-archive-compat-"));
  const root = path.join(temp, "corpus");
  try {
    await fs.cp(corpus, root, { recursive: true });
    for (const name of await filesUnder(root)) await fs.utimes(path.join(root, name), COPY_TIME, COPY_TIME);
    await verifySums(root);
    const before = await fingerprint(root);
    const expected = JSON.parse(await fs.readFile(path.join(root, "expected.json"), "utf8"));
    try {
      await work(root, expected);
    } finally {
      await verifySums(root);
      assert.deepEqual(await fingerprint(root), before, "reading and closing preserve every copied file and its mtime");
    }
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
    await verifySums(corpus);
    assert.deepEqual(await fingerprint(corpus), original, "the original corpus is never modified");
  }
}

// Les attentes nomment les données à conserver, sans imposer la forme entière d'un futur snapshot.
function assertSelected(actual, expected) {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual));
    assert.equal(actual.length, expected.length);
    expected.forEach((item, index) => assertSelected(actual[index], item));
  } else if (expected !== null && typeof expected === "object") {
    assert.ok(actual && typeof actual === "object");
    for (const [key, value] of Object.entries(expected)) assertSelected(actual[key], value);
  } else assert.deepEqual(actual, expected);
}

function assertSession(state, expected, id, readOnly) {
  assertSelected(state, {
    id, retention: expected.retention, retentionMs: null, elapsedMs: expected.elapsedMs,
    accepting: false, readOnly, history: [], questions: [], segments: expected.passages,
    coverage: { passages: expected.passages.length, audioError: 0, visionError: 0 },
  });
  for (const passage of state.segments) assert.equal(passage.mediaReason, undefined);
}

function assertChat(jobs, expected, id) {
  assertSelected(jobs, expected);
  for (const job of jobs) assert.equal(job.sessionId, id);
}

function assertSurveillance(registry, expected, session) {
  assertSelected(registry, expected);
  assert.equal(registry.sessionId, session.summary.id);
  assert.equal(registry.activation.startedAt, session.summary.createdAt);
  assert.equal(registry.activation.stoppedAt, session.summary.updatedAt);
  assertSelected(registry.coverage, { total: 2, scanned: 2, failed: 0, scannedThroughMs: 16000 });
}

function inventoryFacts(inventory) {
  return {
    ...inventory,
    ids: [...inventory.ids].sort(), legacy: [...inventory.legacy].sort(), thumbs: [...inventory.thumbs].sort(),
    partial: [...inventory.partial].sort(), orphans: [...inventory.orphans].sort(),
  };
}

test("the frozen archive corpus contains two independent UUID sessions", async () => {
  const entries = await fs.readdir(CORPUS).catch(error => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  assert.equal(entries.filter(name => UUID.test(name)).length, 2);
});

test("every frozen file is checksummed and every archive JSON document parses without a JSONL journal", async () => {
  await withCopy(async root => {
    const files = await filesUnder(root);
    assert.equal(files.some(name => /(?:\.jsonl$|(?:^|\/)embeddings\.json$)/.test(name)), false);
    for (const name of files.filter(name => name.endsWith(".json"))) {
      const text = await fs.readFile(path.join(root, name), "utf8");
      assert.doesNotThrow(() => JSON.parse(text), name);
    }
  });
});

test("the current library reads frozen identities, data and physical inventory separately from manifest totals", async () => {
  await withCopy(async (root, expected) => {
    const library = new SessionLibrary({ root });
    const listed = await library.list();
    assert.deepEqual(listed, expected.sessions.map(session => session.summary).sort((a, b) => b.updatedAt - a.updatedAt));
    for (const session of expected.sessions) {
      const id = session.summary.id;
      const archive = await library.read(id);
      assert.deepEqual(archive.summary, session.summary);
      assert.equal(archive.manifest.id, id);
      assert.equal(archive.manifest.state, session.manifestState);
      assert.deepEqual(archive.manifest.media, { ...session.summary.media, retention: expected.retention });
      assert.deepEqual(inventoryFacts(archive.inventory), session.inventory);
      assertSession(archive.snapshot, expected, id, false);
      assertChat(archive.chat.jobs, session.chat, id);
      assertSurveillance(archive.surveillance, expected.surveillance, session);
      assert.equal(archive.recap, null);
      const store = LocalSessionStore.forSession(path.join(root, id));
      for (const passage of expected.passages) {
        const media = await store.read(passage.id);
        assert.equal(media.frames.length, 1);
        assert.equal(media.frames[0].atMs, passage.startMs);
        assert.match(media.frames[0].dataUrl, /^data:image\/jpeg;base64,/);
        assert.equal(media.audio.toString("base64"), "UklGRgAAAAA=");
        assert.deepEqual(await store.interval(passage.id), { startMs: passage.startMs, endMs: passage.endMs, hasAudio: true });
      }
    }
  });
});

function forbidProviders(t) {
  const calls = [];
  const forbidden = name => () => {
    calls.push(name);
    throw new Error("Appel externe interdit : " + name);
  };
  // Les adaptateurs capturent child_process au chargement ; le banc contrôle leurs ports injectés.
  t.mock.method(globalThis, "fetch", forbidden("fetch"));
  const agent = { answer: forbidden("answer"), prepare: forbidden("chat.prepare") };
  const perception = Object.fromEntries(["transcribe", "observeVisual", "prepare"].map(name => [name, forbidden(name)]));
  const surveillanceAgent = {
    detect: forbidden("detect"), verify: forbidden("verify"), prepare: forbidden("surveillance.prepare"),
  };
  const embeddings = { embed: forbidden("embed"), embedMany: forbidden("embedMany") };
  return { calls, agent, surveillanceAgent, overrides: { perception, embeddings } };
}

test("the headless host opens each frozen session read-only and closes without analysis or writes", async t => {
  const providers = forbidProviders(t);
  await withCopy(async (root, expected) => {
    for (const session of expected.sessions) {
      const before = await fingerprint(root);
      const runtime = new HeadlessRuntime({
        sessionsRoot: root, userData: path.dirname(root), config: {}, selectedModels: {},
        smoke: true, readClock: () => 0, wallClock: () => COPY_TIME.getTime(),
        agent: providers.agent, surveillanceAgent: providers.surveillanceAgent, overrides: providers.overrides,
      });
      try {
        const opened = await runtime.open(session.summary.id);
        assertSelected(opened, { id: session.summary.id, readOnly: true, accepting: false, elapsedMs: expected.elapsedMs });
        const state = runtime.snapshot();
        assertSession(state.session, expected, session.summary.id, true);
        assertChat(state.chat.jobs, session.chat, session.summary.id);
        const registry = runtime.surveillanceRegistry();
        assertSurveillance(registry, expected.surveillance, session);
        assert.equal(registry.restored, true);
        assert.equal(registry.registry.persisted, true);
        assert.equal(state.session.unplacedMedia, 0);
        assert.equal(runtime.storage().sessionBytes, session.inventory.bytes);
      } finally {
        await runtime.close();
      }
      await verifySums(root);
      assert.deepEqual(await fingerprint(root), before, "each open and close preserves the copied archive");
    }
    assert.deepEqual(providers.calls, [], "no injected provider, fetch, analysis, warm-up or embedding call");
  });
});

test("the interrupted session ignores its torn temporary and counts its truncated clip as a present pair", async () => {
  await withCopy(async (root, expected) => {
    const alteration = expected.alterations;
    const dir = path.join(root, alteration.sessionId);
    assert.equal(await fs.readFile(path.join(dir, alteration.temporary), "utf8"), alteration.temporaryText);
    assert.throws(() => JSON.parse(alteration.temporaryText), SyntaxError);
    const truncated = await fs.readFile(path.join(dir, alteration.clip));
    const archived = expected.sessions.find(session => session.summary.state === "archived");
    const original = await fs.readFile(path.join(root, archived.summary.id, alteration.clip));
    assert.equal(original.length, alteration.originalBytes);
    assert.equal(truncated.length, alteration.remainingBytes);
    assert.deepEqual(truncated, original.subarray(0, alteration.remainingBytes));
    const library = new SessionLibrary({ root });
    const read = await library.read(alteration.sessionId);
    const expectedSession = expected.sessions.find(session => session.summary.id === alteration.sessionId);
    assert.equal(read.summary.state, "interrupted");
    assert.equal(read.manifest.closedAt, null);
    assert.deepEqual(inventoryFacts(read.inventory), expectedSession.inventory);
    assert.equal(read.summary.media.bytes - read.inventory.bytes, alteration.originalBytes - alteration.remainingBytes);
    const store = LocalSessionStore.forSession(dir);
    assert.equal(await store.has("moment-2"), true);
    assert.equal((await store.read("moment-2")).frames.length, 1);
    assertChat(read.chat.jobs, expectedSession.chat, alteration.sessionId);
    assertSurveillance(read.surveillance, expected.surveillance, expectedSession);
  });
});

test("Git ignore rules retain every required frozen file, including WebM clips", async t => {
  const gitRoot = childProcess.spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: CORPUS, encoding: "utf8" });
  if (gitRoot.status !== 0 && /not a git repository/.test(gitRoot.stderr || "")) {
    t.skip("Contrôle Git non lancé : corpus hors dépôt Git.");
    return;
  }
  assert.equal(gitRoot.status, 0, gitRoot.stderr || String(gitRoot.error));
  const root = gitRoot.stdout.trim();
  const files = (await filesUnder(CORPUS)).map(name => path.join(CORPUS, name));
  files.push(...(await filesUnder(HISTORICAL)).map(name => path.join(HISTORICAL, name)));
  for (const file of files) {
    const relative = path.relative(root, file);
    const result = childProcess.spawnSync("git", ["check-ignore", "--no-index", "--verbose", "--", relative], { cwd: root, encoding: "utf8" });
    assert.ok([0, 1].includes(result.status), result.stderr || String(result.error));
    const rule = result.stdout.split("\t")[0];
    const pattern = rule.slice(rule.lastIndexOf(":") + 1);
    assert.ok(result.status === 1 || pattern.startsWith("!"), `${relative} is ignored by ${rule}`);
  }
});


test("historical questions and masking notes survive a real library open and runtime close without providers or rewrites", async t => {
  const providers = forbidProviders(t);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-historical-questions-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const expected = JSON.parse(await fs.readFile(path.join(CORPUS, "expected.json"), "utf8"));
  const id = expected.sessions[0].summary.id, root = path.join(temp, "sessions"), dir = path.join(root, id);
  await fs.cp(path.join(CORPUS, id), dir, { recursive: true });
  const file = path.join(dir, "session.json"), saved = JSON.parse(await fs.readFile(file, "utf8"));
  const note = "Bas de l’image masqué par un affichage TV Lens sur 1 image(s) sur 4 : la scène n’a pas été vue en entier.";
  saved.questions = [{ question: "Que voit-on ?", answer: "Un cercle.", kind: "observation", atMs: 8000,
    citations: [{ id: "moment-1", startMs: 0, endMs: 8000, available: true }], limits: [] }];
  saved.segments[0].observation.uncertainty = note;
  saved.segments[0].ingest = { assembleMs: 12, overlay: { cropped: 1, withheld: 0 } };
  saved.history = [{ id: "moment-0", startMs: 0, endMs: 1, status: "ready",
    observation: { summary: "Note historique.", uncertainty: note } }];
  await fs.writeFile(file, JSON.stringify(saved, null, 2));
  const before = await fingerprint(root), library = new SessionLibrary({ root });
  const archive = await library.read(id);
  assert.deepEqual(archive.snapshot.questions, saved.questions);
  const runtime = new HeadlessRuntime({
    sessionsRoot: root, userData: temp, config: {}, selectedModels: {}, smoke: true,
    readClock: () => 0, agent: providers.agent, surveillanceAgent: providers.surveillanceAgent, overrides: providers.overrides,
  });
  try {
    await runtime.open(id);
    const state = runtime.snapshot().session;
    assert.deepEqual(state.questions, saved.questions);
    assert.deepEqual(state.segments[0].observation, saved.segments[0].observation);
    assert.deepEqual(state.segments[0].ingest, saved.segments[0].ingest);
    assert.deepEqual(state.history[0].observation, saved.history[0].observation);
    assert.equal(state.readOnly, true);
  } finally {
    await runtime.close();
  }
  assert.deepEqual(await fingerprint(root), before);
  assert.deepEqual(providers.calls, []);
});

async function assertProvenance(root, expected) {
  const provenance = expected.provenance;
  assert.equal(provenance.kind, "documented-transformation");
  assert.equal(provenance.sourceCorpus, "durable-v1");
  assert.equal(provenance.sourceCommit, "4dfc282");
  assert.equal(provenance.readerCommit, "728d501");
  assert.ok(provenance.transformation.length > 0);
  assert.ok((await fs.readFile(path.join(root, "README.md"), "utf8")).includes(provenance.transformation));
  await verifySums(CORPUS);
  const digest = data => createHash("sha256").update(data).digest("hex");
  assert.equal(digest(await fs.readFile(path.join(CORPUS, SUMS))), provenance.sourceSumsSha256);
  const before = new Map((await fingerprint(path.join(CORPUS, provenance.sourceSession))).map(row => [row.name, row.hash]));
  const after = new Map((await fingerprint(path.join(root, provenance.sourceSession))).map(row => [row.name, row.hash]));
  assert.deepEqual({
    added: [...after.keys()].filter(name => !before.has(name)).sort(),
    removed: [...before.keys()].filter(name => !after.has(name)).sort(),
    modified: [...before.keys()].filter(name => after.has(name) && before.get(name) !== after.get(name)).sort(),
  }, provenance.changes, "provenance describes every changed, added and removed source file");
  if (provenance.extraSource) {
    const source = provenance.extraSource;
    const bytes = await fs.readFile(path.join(__dirname, "..", source.path));
    assert.equal(digest(bytes), source.sha256);
    assert.deepEqual(await fs.readFile(path.join(root, provenance.sourceSession, source.target)), bytes);
  }
}

function historicalRuntime(root, providers, readClock = () => 0) {
  return new HeadlessRuntime({
    sessionsRoot: root, userData: path.dirname(root), config: {}, selectedModels: {},
    smoke: true, readClock, wallClock: () => COPY_TIME.getTime(),
    agent: providers.agent, surveillanceAgent: providers.surveillanceAgent,
    // Sans port embeddings, la composition smoke ne construit aucun index ni store vectoriel.
    overrides: { perception: providers.overrides.perception },
  });
}

function assertHistoricalSession(state, expected) {
  assertSelected(state, expected);
  for (const key of ["segments", "history", "questions", "coverage"]) {
    assert.deepEqual(state[key], expected[key], `${key} keeps the exact keys, values and order`);
  }
}

function reverseMediaEnumeration(t) {
  const readdir = fs.readdir;
  t.mock.method(fs, "readdir", async (dir, ...options) => {
    const entries = await readdir(dir, ...options);
    // Le système de fichiers ne garantit pas l'ordre des paires et demi-paires.
    return path.basename(String(dir)) === "media" ? entries.reverse() : entries;
  });
}

for (const variant of VARIANTS) {
  test(`the frozen ${variant} archive preserves library facts and runtime restoration without providers or writes`, async t => {
    if (variant === "modern-without-manifest") reverseMediaEnumeration(t);
    const providers = forbidProviders(t);
    await withCopy(async (root, expected) => {
      await assertProvenance(root, expected);
      const id = expected.librarySnapshot.id;
      const library = new SessionLibrary({ root });
      const archive = await library.read(id);
      const { title, ...summary } = archive.summary;
      assert.deepEqual(summary, expected.summary);
      if (expected.manifestTitle !== null) assert.equal(title, expected.manifestTitle);
      else assert.match(title, /^Session du /);
      assert.deepEqual(await library.list(), [archive.summary]);
      const current = await library.read(id, { current: id });
      assert.deepEqual(current.summary, {
        ...archive.summary, state: expected.summary.state === "interrupted" ? "live" : expected.summary.state,
      });
      assert.deepEqual(archive.manifest, expected.manifest);
      assert.deepEqual(archive.snapshot, expected.librarySnapshot);
      assert.deepEqual(inventoryFacts(archive.inventory), expected.inventory);
      assert.deepEqual(archive.chat, expected.chat);
      const store = LocalSessionStore.forSession(path.join(root, id));
      for (const media of expected.media) {
        assert.equal(await store.has(media.id), true);
        const data = await store.read(media.id);
        assert.deepEqual(data.frames.map(frame => frame.atMs), media.frameTimes);
        for (const frame of data.frames) assert.match(frame.dataUrl, /^data:image\/jpeg;base64,/);
        assert.equal(data.audio?.toString("base64") ?? null, media.audioBase64);
        assert.deepEqual(await store.interval(media.id), media.interval);
      }
      for (const id of expected.inventory.partial) assert.equal(await store.has(id), false);
      const runtime = historicalRuntime(root, providers);
      try {
        const opened = await runtime.open(id);
        assertSelected(opened, { id, readOnly: true, accepting: false, elapsedMs: expected.runtime.elapsedMs });
        assertHistoricalSession(runtime.snapshot().session, expected.runtime);
        assert.equal(runtime.snapshot().index, null);
        assert.equal(runtime.storage().sessionBytes, expected.inventory.bytes);
        assertChat(runtime.snapshot().chat.jobs, expected.chat.jobs, id);
        await runtime.pause();
        assertHistoricalSession(runtime.snapshot().session, expected.runtime);
      } finally {
        await runtime.close();
      }
      assert.deepEqual(providers.calls, [], "restoration calls no provider, warm-up, analysis or embedding");
    }, path.join(HISTORICAL, variant));
  });
}

test("the parent historical checksum file also protects every variant checksum and provenance", async () => {
  await verifySums(HISTORICAL);
  for (const name of (await filesUnder(HISTORICAL)).filter(name => name.endsWith(".json"))) {
    const source = await fs.readFile(path.join(HISTORICAL, name), "utf8");
    assert.doesNotThrow(() => JSON.parse(source), name);
  }
});

test("recovered passages in the frozen archive follow time even when their identifiers run backwards", async () => {
  await withCopy(async (root, expected) => {
    const archive = await new SessionLibrary({ root }).read(expected.librarySnapshot.id);
    assert.deepEqual(archive.inventory.recovered, ["moment-3", "moment-4", "moment-9"]);
    assert.deepEqual(archive.snapshot.segments.map(passage => [passage.id, passage.startMs, passage.endMs]), [
      ["moment-1", 0, 8000], ["moment-2", 8000, 16000], ["moment-9", 16000, 24000],
      ["moment-3", 24000, 32000], ["moment-4", 24000, 32000],
    ]);
  }, path.join(HISTORICAL, "modern-without-manifest"));
});

test("the frozen text history restores its summary without an observation or media flags on disk", async t => {
  const providers = forbidProviders(t);
  await withCopy(async (root, expected) => {
    const id = expected.librarySnapshot.id;
    const archive = await new SessionLibrary({ root }).read(id);
    const history = { id: "moment-1", startMs: 0, endMs: 8000, status: "ready", summary: "Un cercle se déplace sur un fond bleu." };
    assert.deepEqual(archive.snapshot.history, [history]);
    const runtime = historicalRuntime(root, providers);
    try {
      await runtime.open(id);
      const state = runtime.snapshot().session;
      assert.deepEqual(state.history, [{ ...history, mediaReason: "expired", thumbnailAvailable: false }]);
      assert.deepEqual(state.segments[0].topicSummary, {
        text: "Le cercle se déplace.", firstId: "moment-2", lastId: "moment-2", startMs: 8000, endMs: 16000,
      });
    } finally {
      await runtime.close();
    }
    assert.deepEqual(providers.calls, []);
  }, path.join(HISTORICAL, "text-history"));
});

test("an explicit resume numbers a new passage past recovered media and both kinds of orphan without overwriting them", async t => {
  reverseMediaEnumeration(t);
  await withCopy(async (root, expected) => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-archive-resume-"));
    const resumedRoot = path.join(temp, "copy");
    try {
      await fs.cp(root, resumedRoot, { recursive: true });
      const before = await fingerprint(resumedRoot);
      const providers = forbidProviders(t);
      providers.agent.prepare = async () => {};
      providers.overrides.perception = {
        prepare: async () => {},
        transcribe: async () => ({ observation: { transcript: "Nouveau passage." } }),
        observeVisual: async () => ({ observation: { summary: "Nouveau passage." } }),
      };
      let clock = 0;
      const runtime = historicalRuntime(resumedRoot, providers, () => clock);
      const id = expected.librarySnapshot.id;
      try {
        await runtime.open(id);
        assertHistoricalSession(runtime.snapshot().session, expected.runtime);
        assert.deepEqual(await fingerprint(resumedRoot), before, "opening precedes every permitted write");
        const resumed = await runtime.resume(id);
        assertSelected(resumed, { id, readOnly: false, accepting: true, elapsedMs: expected.resume.startMs });
        const media = expected.media.find(item => item.id === "moment-1");
        const input = await LocalSessionStore.forSession(path.join(resumedRoot, id)).read(media.id);
        clock = expected.resume.endMs - expected.resume.startMs;
        const result = await runtime.ingest({
          sessionId: id,
          startMs: expected.resume.startMs, endMs: expected.resume.endMs,
          clip: await fs.readFile(path.join(resumedRoot, id, "media", "moment-1.webm")),
          audio: input.audio, frames: input.frames.map(frame => ({ ...frame, atMs: expected.resume.startMs })),
        });
        assert.equal(result, expected.resume.nextId);
        assert.equal(runtime.snapshot().session.segments.at(-1).id, expected.resume.nextId);
      } finally {
        await runtime.close();
      }
      assert.equal(runtime.lastEnd.archived, true);
      const after = new Map((await fingerprint(resumedRoot)).map(row => [row.name, row]));
      for (const row of before.filter(row => row.name.includes("/media/") || row.name.includes("/thumbs/"))) {
        assert.deepEqual(after.get(row.name), row, "all old pairs, half-pairs and thumbnails remain untouched");
      }
      const archive = await new SessionLibrary({ root: resumedRoot }).read(id);
      assert.equal(archive.snapshot.segments.at(-1).id, expected.resume.nextId);
      // The resumed life saves in the current version; the copy it started from is the historical witness.
      const { format, version, ...saved } = JSON.parse(await fs.readFile(path.join(resumedRoot, id, "session.json"), "utf8"));
      assert.deepEqual([format, version], ["tvlens-viewing-memory", 1]);
      assert.deepEqual(archive.snapshot, saved, "the library reads the version it wrote back to the saved model");
      assert.deepEqual(inventoryFacts(archive.inventory).orphans, [...expected.inventory.orphans].sort());
      assert.deepEqual(providers.calls, []);
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  }, path.join(HISTORICAL, "modern-without-manifest"));
});
