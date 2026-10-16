const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const providers = require("../runtime/session-providers.cjs");
const fs = require("node:fs/promises");
const os = require("node:os");
const { createSessionRuntime } = require("../runtime/session-runtime.cjs");
const { EmbeddingStore } = require("../adapters/embedding-store.cjs");
const { deferred } = require("./helpers/wait.cjs");

test("default smoke ingestion publishes speech before vision and keeps the next audio independent", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-smoke-lanes-"));
  const published = [];
  const audioPublished = [deferred(), deferred()];
  const visionPublished = [deferred(), deferred()];
  let clock = 0;
  const runtime = createSessionRuntime({
    sessionsRoot: path.join(root, "sessions"), userData: root,
    selectedModels: {}, smoke: true, readClock: () => clock,
    onChange: (state) => {
      published.push(structuredClone(state));
      for (let i = 0; i < 2; i++) {
        const passage = state.segments[i];
        if (passage?.audioStatus === "ready" && passage.visionStatus === "queued") audioPublished[i].resolve(passage);
        if (passage?.visionStatus === "ready") visionPublished[i].resolve(passage);
      }
    },
  });
  t.after(async () => {
    await runtime.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  runtime.perception.observe = () => { throw Error("Historical serial perception must not run"); };
  const audio = [deferred(), deferred()], vision = [deferred(), deferred()];
  const audioCalls = [], visionCalls = [];
  const visionEntered = deferred();
  const retain = (method, gates, calls, entered) => {
    const original = runtime.perception[method];
    if (!original) return;
    runtime.perception[method] = async (input) => {
      const result = await original(input);
      const index = calls.push({ input, result }) - 1;
      entered?.resolve();
      await gates[index].promise;
      return result;
    };
  };
  retain("transcribe", audio, audioCalls);
  retain("observeVisual", vision, visionCalls, visionEntered);
  const ingest = async (index) => {
    clock = (index + 1) * 1000;
    return runtime.watch.ingest({
      startMs: index * 1000, endMs: clock, clip: new Uint8Array([1]),
      audio: new Uint8Array([index + 1]), frames: [{ atMs: index * 1000, dataUrl: "data:image/jpeg;base64,YQ==" }],
    });
  };
  assert.equal(await ingest(0), "moment-1");
  assert.equal(runtime.watch.snapshot().segments[0].audioStatus, "analyzing");
  audio[0].resolve();
  const speech = await audioPublished[0].promise;
  assert.deepEqual([speech.id, speech.startMs, speech.endMs, speech.status, speech.visionStatus],
    ["moment-1", 0, 1000, "partial", "queued"]);
  assert.equal(speech.observation.transcript, "Un cercle se déplace sur un fond bleu.");
  assert.equal(speech.observation.summary, undefined);
  await visionEntered.promise;
  assert.equal(await ingest(1), "moment-2");
  audio[1].resolve();
  await audioPublished[1].promise;
  assert.deepEqual(runtime.watch.snapshot().segments.map((s) => [s.id, s.audioStatus, s.visionStatus]),
    [["moment-1", "ready", "analyzing"], ["moment-2", "ready", "queued"]]);
  assert.equal(visionCalls.length, 1, "vision serializes while both audio results are published");
  assert.deepEqual(visionCalls[0].input.observation, audioCalls[0].result.observation);
  vision[0].resolve();
  await visionPublished[0].promise;
  vision[1].resolve();
  await visionPublished[1].promise;
  const final = runtime.watch.snapshot();
  assert.deepEqual(final.segments.map((s) => [s.id, s.startMs, s.endMs, s.status, s.audioStatus, s.visionStatus]),
    [["moment-1", 0, 1000, "ready", "ready", "ready"], ["moment-2", 1000, 2000, "ready", "ready", "ready"]]);
  for (let i = 0; i < 2; i++) {
    assert.equal(final.segments[i].observation.transcript, audioCalls[i].result.observation.transcript);
    assert.deepEqual(final.segments[i].observation, { ...audioCalls[i].result.observation, ...visionCalls[i].result.observation });
    const audioIndex = published.findIndex((s) => s.segments[i]?.audioStatus === "ready");
    const visionIndex = published.findIndex((s) => s.segments[i]?.visionStatus === "ready");
    assert.ok(audioIndex < visionIndex, "each transcript precedes its visual publication");
  }
  assert.deepEqual([final.apiCost, final.coverage.audioError, final.coverage.visionError, final.pending], [0, 0, 0, 0]);
});

function recordedConstructor() {
  return class {
    constructor(...args) {
      this.args = args;
    }
  };
}

test("transcription keeps explicit options and reads the current language", () => {
  const config = {
    whisperBinary: "whisper-test",
    whisperThreads: 3,
    whisperModel: "/models/speech.bin",
    whisperAudioCtx: 512,
    transcriptionLanguage: "fr",
  };
  const transcriber = providers.createSessionTranscriber(
    { config },
    { LocalTranscriber: recordedConstructor() },
  );
  const [options] = transcriber.args || [];
  assert.equal(options?.binary, "whisper-test");
  assert.equal(options.threads, 3);
  assert.equal(options.model, "/models/speech.bin");
  assert.equal(options.audioCtx, 512);
  assert.equal(options.getLanguage(), "fr");
  config.transcriptionLanguage = "en";
  assert.equal(options.getLanguage(), "en");
});

test("transcription defaults keep the model path and omit an unrequested audio context", () => {
  for (const [config, model] of [
    [{}, path.join(process.cwd(), ".local", "models", "ggml-base.bin")],
    [
      { researchBudgetFile: "/research/budget.json" },
      "/research/models/ggml-base.bin",
    ],
  ]) {
    const [options] = providers.createSessionTranscriber(
      { config },
      { LocalTranscriber: recordedConstructor() },
    ).args;
    assert.equal(options.model, model);
    assert.equal(options.getLanguage(), "auto");
    assert.equal("audioCtx" in options, false);
  }
});

function sessionOptions(extra = {}) {
  return {
    id: "session",
    config: { ffmpeg: "ffmpeg-test", codexAuthHome: "/auth" },
    selectedModels: {
      observationModel: "observation-model",
      inspectionModel: "inspection-model",
    },
    codexBinary: "codex-test",
    transcriber: { transcribe() {} },
    quota: { check() {} },
    store: { root: "/sessions/session" },
    overrides: {},
    strategy: "requested-strategy",
    ...extra,
  };
}

test("inspection selects smoke, live and local models and keeps its cache revocable", () => {
  for (const [smoke, liveInspection, localInspection, simulated] of [
    [true, false, false, true],
    [true, true, false, false],
    [true, false, true, false],
    [true, true, true, false],
    [false, false, false, false],
  ]) {
    const options = sessionOptions({ smoke, liveInspection, localInspection });
    const localModel = {},
      smokeInspector = {};
    const built = providers.createSessionInspection(options, {
      CodexPerception: recordedConstructor(),
      ClipInspector: recordedConstructor(),
      CachedInspector: recordedConstructor(),
      RevocableInspector: recordedConstructor(),
      inspectionStrategy: (name) => ({ name }),
      simulatedInspectionModel: () => localModel,
      simulatedInspector: () => smokeInspector,
    });
    assert.ok(built.inspector, "the public inspector is constructed");
    const [cached, message] = built.inspector.args;
    assert.match(message, /Session terminée/);
    const [inner] = cached.args;
    if (localInspection) assert.equal(built.inspectorModel, localModel);
    else
      assert.deepEqual(built.inspectorModel.args, [
        {
          binary: "codex-test",
          authHome: "/auth",
          model: "inspection-model",
          transcriber: options.transcriber,
          quota: options.quota,
          sessionId: "session-inspect",
        },
      ]);
    if (simulated) assert.equal(inner, smokeInspector);
    else
      assert.deepEqual(inner.args, [
        {
          media: options.store,
          model: built.inspectorModel,
          ffmpeg: "ffmpeg-test",
          strategy: { name: smoke ? "requested-strategy" : "sheets-diverse" },
        },
      ]);
  }
});

test("perception keeps the observation role and passes local agent options", () => {
  const smokePerception = {};
  for (const [smoke, liveObservation, backend] of [
    [true, false, "codex"],
    [true, true, "codex"],
    [true, false, "local"],
    [true, true, "local"],
    [false, false, "codex"],
    [false, false, "local"],
  ]) {
    const options = sessionOptions({ smoke, liveObservation });
    options.config.perceptionBackend = backend;
    options.config.localVlm = {
      url: "http://local.test",
      model: "local-model",
      numCtx: 8192,
      keepAlive: "10m",
      token: "test-token",
    };
    const perception = providers.createSessionPerception(options, {
      CodexPerception: recordedConstructor(),
      LocalVlmAgent: recordedConstructor(),
      simulatedPerception: () => smokePerception,
    });
    if (smoke && !liveObservation) {
      assert.equal(perception, smokePerception);
      continue;
    }
    const [received] = perception?.args || [];
    assert.equal(received?.sessionId, "session-observe");
    const { agent, ...codex } = received;
    assert.deepEqual(codex, {
      binary: "codex-test",
      authHome: "/auth",
      model: "observation-model",
      transcriber: options.transcriber,
      quota: options.quota,
      sessionId: "session-observe",
    });
    if (backend === "local")
      assert.deepEqual(agent.args, [
        {
          url: "http://local.test",
          model: "local-model",
          numCtx: 8192,
          keepAlive: "10m",
          headers: { Authorization: "Bearer test-token" },
        },
      ]);
    else assert.equal("agent" in received, false);
  }
});

test("indexing selects embeddings by smoke mode and key and shares its vector cache with search", () => {
  for (const [smoke, liveInspection, apiKey, enabled] of [
    [true, false, "test-key", false],
    [true, true, "test-key", true],
    [false, false, "test-key", true],
    [false, false, "", false],
    [true, true, "", false],
  ]) {
    const options = sessionOptions({
      smoke,
      liveInspection,
      userData: "/data",
    });
    options.config.apiKey = apiKey;
    const built = providers.createSessionIndex(options, {
      UsageLedger: recordedConstructor(),
      OpenRouterEmbeddings: recordedConstructor(),
      EmbeddingStore: recordedConstructor(),
      MomentIndex: recordedConstructor(),
      MomentSearch: recordedConstructor(),
    });
    assert.ok(built.search, "search is available with or without embeddings");
    assert.deepEqual(built.search.args, [{ index: built.index }]);
    if (!enabled) {
      assert.deepEqual(
        [built.index, built.vectors, built.feedIndex],
        [null, null, null],
      );
      continue;
    }
    const [index] = built.index.args;
    assert.equal(index.flushMs, 30000);
    assert.equal(index.maxPending, 2048);
    assert.equal(index.cache, built.vectors);
    assert.deepEqual(built.vectors.args.slice(0, 2), [
      "/sessions/session/embeddings.json",
      "openai/text-embedding-3-small",
    ]);
    assert.equal(built.vectors.args.length, 3);
    assert.equal(typeof built.vectors.args[2].onDiagnostic, "function");
    const [embedding] = index.embeddings.args;
    assert.equal(embedding.apiKey, "test-key");
    assert.deepEqual(embedding.budget.args, ["/data/research-budget.json"]);
  }
});

test("perception overrides take priority over smoke, live and local construction", () => {
  const perception = {};
  const forbidden = () =>
    assert.fail("an override must bypass provider construction");
  for (const [smoke, liveObservation] of [
    [true, false],
    [true, true],
    [false, false],
  ]) {
    const options = sessionOptions({
      smoke,
      liveObservation,
      overrides: { perception },
    });
    options.config.perceptionBackend = "local";
    assert.equal(
      providers.createSessionPerception(options, {
        CodexPerception: forbidden,
        LocalVlmAgent: forbidden,
        simulatedPerception: forbidden,
      }),
      perception,
    );
  }
});

test("observation and inspection share the constructed transcriber and keep local defaults optional", () => {
  const options = sessionOptions();
  options.config.perceptionBackend = "local";
  options.transcriber = providers.createSessionTranscriber(options, {
    LocalTranscriber: recordedConstructor(),
  });
  const { inspectorModel } = providers.createSessionInspection(options, {
    CodexPerception: recordedConstructor(),
    ClipInspector: recordedConstructor(),
  });
  const perception = providers.createSessionPerception(options, {
    CodexPerception: recordedConstructor(),
    LocalVlmAgent: recordedConstructor(),
  });
  assert.equal(inspectorModel.args[0].transcriber, options.transcriber);
  assert.equal(perception.args[0].transcriber, options.transcriber);
  assert.deepEqual(perception.args[0].agent.args, [
    { url: undefined, model: undefined, numCtx: undefined },
  ]);
});

function indexDependencies(extra = {}) {
  return {
    UsageLedger: recordedConstructor(),
    OpenRouterEmbeddings: () => assert.fail("the embeddings override must win"),
    EmbeddingStore: recordedConstructor(),
    MomentIndex: class extends recordedConstructor() {
      observe(passages) {
        this.observed = passages;
      }
    },
    MomentSearch: recordedConstructor(),
    ...extra,
  };
}

test("embeddings overrides bypass smoke and key selection and background indexing feeds a usable bounded tail", () => {
  const embeddings = {};
  const options = sessionOptions({
    userData: "/data",
    smoke: true,
    overrides: { embeddings },
  });
  const built = providers.createSessionIndex(options, indexDependencies());
  assert.equal(built.index.args[0].embeddings, embeddings);
  const segments = Array.from({ length: 60 }, (_, i) => ({
    id: `moment-${i + 1}`,
    status: "ready",
    observation: { summary: `Passage ${i + 1}` },
  }));
  segments[20].observation = {};
  built.feedIndex({ segments });
  assert.deepEqual(
    built.index.observed,
    segments.slice(12).filter((segment) => segment.id !== "moment-21"),
  );
  assert.equal(built.index.observed.length, 47);
  options.config.backgroundIndex = false;
  const silent = providers.createSessionIndex(options, indexDependencies());
  assert.ok(silent.search);
  assert.equal(silent.feedIndex, null);
  options.config.researchBudgetFile = "/custom/budget.json";
  const budgets = [];
  const dependencies = indexDependencies({
    UsageLedger: class extends recordedConstructor() {
      constructor(...args) {
        super(...args);
        budgets.push(this);
      }
    },
  });
  for (const [smoke, liveInspection, apiKey] of [
    [true, true, "test-key"],
    [false, false, "test-key"],
    [false, false, ""],
  ]) {
    const custom = providers.createSessionIndex(
      {
        ...options,
        smoke,
        liveInspection,
        config: { ...options.config, apiKey },
      },
      dependencies,
    );
    assert.equal(custom.index.args[0].embeddings, embeddings);
  }
  assert.deepEqual(
    budgets.map((budget) => budget.args),
    Array(3).fill(["/custom/budget.json"]),
  );
});

test("shared index composition sends the real cache load diagnostic to the injected journal before provider work", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-index-diagnostic-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "embeddings.json"), "{private-header");
  const journal = [], calls = [];
  const built = providers.createSessionIndex(sessionOptions({
    userData: root, store: { root }, smoke: true, log: line => journal.push(line),
    overrides: { embeddings: { embed: async text => {
      calls.push(text);
      return [1, 0];
    } } },
  }));
  t.after(async () => {
    built.index.close();
    await built.vectors.seal();
  });
  assert.ok(built.vectors instanceof EmbeddingStore);
  assert.equal(await built.vectors.get("moment-1", "texte privé"), null);
  assert.equal(journal.length, 1);
  const diagnostic = JSON.parse(journal[0]);
  assert.equal(diagnostic.code, "TVLENS_EMBEDDING_CACHE_LOAD");
  assert.equal(diagnostic.cause, "invalid-header");
  assert.equal(diagnostic.rebuild, "total");
  assert.equal(diagnostic.providerCallsPossible, true);
  assert.deepEqual(calls, []);
  await built.index.ensure([{ id: "moment-1", observation: { summary: "texte privé" } }]);
  assert.deepEqual(calls, ["texte privé"]);
  assert.equal(journal.length, 1);
  assert.doesNotMatch(journal[0], /private-header|texte privé|embeddings.json/);
});

test("shared index composition installs the journal before the cache constructor emits a load diagnostic", () => {
  const journal = [];
  const diagnostic = {
    code: "TVLENS_EMBEDDING_CACHE_LOAD", cause: "read-failed", rebuild: "total", providerCallsPossible: true,
  };
  providers.createSessionIndex(sessionOptions({
    userData: "/data", smoke: true, overrides: { embeddings: {} }, log: line => journal.push(line),
  }), indexDependencies({
    EmbeddingStore: class {
      constructor(_file, _model, { onDiagnostic = () => {} } = {}) {
        onDiagnostic(diagnostic);
      }
    },
  }));
  assert.deepEqual(journal.map(line => JSON.parse(line)), [diagnostic]);
});

test("the exposed inspector caches results and refuses cached and in-flight calls after revocation", async () => {
  let calls = 0,
    release,
    pendingSignal;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const inner = {
    async inspect({ question, signal }) {
      calls++;
      if (question === "Later?") {
        pendingSignal = signal;
        await gate;
      }
      return { observations: [{ text: "Un cercle." }] };
    },
  };
  const { inspector } = providers.createSessionInspection(
    sessionOptions({ smoke: true }),
    {
      CodexPerception: recordedConstructor(),
      simulatedInspector: () => inner,
    },
  );
  const input = {
    question: "What?",
    startMs: 0,
    endMs: 1000,
    segments: [{ id: "moment-1", startMs: 0, endMs: 1000 }],
  };
  assert.equal((await inspector.inspect(input)).cacheHit, false);
  assert.equal((await inspector.inspect(input)).cacheHit, true);
  const pending = inspector.inspect({ ...input, question: "Later?" });
  inspector.revoke();
  assert.equal(pendingSignal.aborted, true);
  const refused = assert.rejects(pending, /Session terminée/);
  release();
  await refused;
  await assert.rejects(inspector.inspect(input), /Session terminée/);
  assert.equal(calls, 2);
  assert.equal(inspector.cache.size, 0);
});
