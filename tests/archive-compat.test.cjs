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

async function withCopy(work) {
  await verifySums(CORPUS);
  const original = await fingerprint(CORPUS);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-archive-compat-"));
  const root = path.join(temp, "corpus");
  try {
    await fs.cp(CORPUS, root, { recursive: true });
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
    await verifySums(CORPUS);
    assert.deepEqual(await fingerprint(CORPUS), original, "the original corpus is never modified");
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
  for (const name of await filesUnder(CORPUS)) {
    const relative = path.relative(root, path.join(CORPUS, name));
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
