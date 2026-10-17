const path = require("node:path");
const { LocalTranscriber } = require("../adapters/local-transcriber.cjs");
const { CodexPerception } = require("../adapters/codex-perception.cjs");
const { LocalVlmAgent } = require("../adapters/local-vlm-agent.cjs");
const { ClipInspector } = require("../adapters/clip-inspector.cjs");
const { CachedInspector } = require("../core/cached-inspector.cjs");
const { RevocableInspector } = require("../core/revocable-inspector.cjs");
const { inspectionStrategy } = require("../adapters/inspection-strategies.cjs");
const { UsageLedger } = require("../adapters/trial-budget.cjs");
const {
  OpenRouterEmbeddings,
  EMBEDDING_MODEL,
} = require("../adapters/openrouter-embeddings.cjs");
const { EmbeddingStore } = require("../adapters/embedding-store.cjs");
const { MomentIndex } = require("../core/moment-index.cjs");
const { MomentSearch } = require("../core/moment-search.cjs");
const { hasUsableObservation } = require("../core/passage-text.cjs");
const {
  simulatedInspectionModel,
  simulatedInspector,
  simulatedPerception,
} = require("../adapters/simulated-providers.cjs");

// What a re-examination is answered once the runtime of its session has closed.
const REVOKED =
  "Session terminée : ses passages ne peuvent plus être réexaminés.";
// Group background sends while retaining several hours for a late first search.
const INDEX_FLUSH_MS = 30000,
  INDEX_MAX_PENDING = 2048;
// Media stay for the session; only the former five-minute tail feeds the background index.
const INDEX_OBSERVE_TAIL = 48;
const indexProviders = {
  UsageLedger,
  OpenRouterEmbeddings,
  EmbeddingStore,
  MomentIndex,
  MomentSearch,
};
const inspectionProviders = {
  CodexPerception,
  ClipInspector,
  CachedInspector,
  RevocableInspector,
  inspectionStrategy,
  simulatedInspectionModel,
  simulatedInspector,
};

function createSessionTranscriber(
  { config, packaged = false, onAvailability, onPublicationError },
  { LocalTranscriber: Transcriber = LocalTranscriber } = {},
) {
  return new Transcriber({
    ...(onAvailability ? { onAvailability } : {}),
    onPublicationError,
    binary: config.whisperBinary,
    threads: config.whisperThreads,
    getLanguage: () => config.transcriptionLanguage || "auto",
    // Reduced encoder context is an explicit opt-in: unvalidated on real programme audio.
    ...(config.whisperAudioCtx === undefined
      ? {}
      : { audioCtx: config.whisperAudioCtx }),
    model: config.whisperModel || (packaged
      ? path.join(path.dirname(config.researchBudgetFile || path.join(process.cwd(), ".local", "research-budget.json")), "models", "ggml-base.bin")
      : path.resolve(__dirname, "../.local/models/ggml-base.bin")),
  });
}

function createSessionInspection(
  {
    id,
    config,
    selectedModels,
    codexBinary,
    transcriber,
    quota,
    store,
    smoke,
    liveInspection,
    localInspection,
    strategy,
  },
  dependencies = {},
) {
  const make = { ...inspectionProviders, ...dependencies };
  const inspectorModel = localInspection
    ? make.simulatedInspectionModel()
    : new make.CodexPerception({
        binary: codexBinary,
        authHome: config.codexAuthHome,
        model: selectedModels.inspectionModel,
        transcriber,
        quota,
        sessionId: id + "-inspect",
      });
  const inner =
    smoke && !liveInspection && !localInspection
      ? make.simulatedInspector()
      : new make.ClipInspector({
          media: store,
          model: inspectorModel,
          ffmpeg: config.ffmpeg,
          strategy: make.inspectionStrategy(
            smoke ? strategy : "sheets-diverse",
          ),
        });
  // The inspector can outlive its runtime in a question or external MCP context. A late re-examination
  // would reconnect an inspection model nobody owns any more. Revocation wraps the cache so even a
  // cached answer is refused after closure. A call in flight is told through its signal before reaching
  // the model; whatever it brings back despite that is neither answered nor left in the cache.
  const inspector = new make.RevocableInspector(
    new make.CachedInspector(inner),
    REVOKED,
  );
  return { inspector, inspectorModel };
}

function localVlmAgent(settings = {}, Agent = LocalVlmAgent) {
  return new Agent({
    url: settings.url,
    model: settings.model,
    numCtx: settings.numCtx,
    ...(settings.keepAlive ? { keepAlive: settings.keepAlive } : {}),
    ...(settings.token
      ? { headers: { Authorization: "Bearer " + settings.token } }
      : {}),
  });
}

function createSessionPerception(
  {
    id,
    config,
    selectedModels,
    codexBinary,
    transcriber,
    quota,
    smoke,
    liveObservation,
    overrides,
  },
  {
    CodexPerception: Perception = CodexPerception,
    LocalVlmAgent: Agent = LocalVlmAgent,
    simulatedPerception: simulate = simulatedPerception,
  } = {},
) {
  if (overrides.perception) return overrides.perception;
  if (smoke && !liveObservation) return simulate();
  return new Perception({
    binary: codexBinary,
    authHome: config.codexAuthHome,
    model: selectedModels.observationModel,
    transcriber,
    quota,
    sessionId: id + "-observe",
    // A local model only replaces inference: prompt, context and validation stay shared.
    ...(config.perceptionBackend === "local"
      ? { agent: localVlmAgent(config.localVlm, Agent) }
      : {}),
  });
}

function createSessionIndex(
  { config, userData, store, smoke, liveInspection, overrides, log = () => {} },
  dependencies = {},
) {
  const make = { ...indexProviders, ...dependencies };
  const researchBudget = new make.UsageLedger(
    config.researchBudgetFile || path.join(userData, "research-budget.json"),
  );
  const embeddings =
    overrides.embeddings ||
    ((smoke && !liveInspection) || !config.apiKey
      ? null
      : new make.OpenRouterEmbeddings({
          apiKey: config.apiKey,
          budget: researchBudget,
        }));
  const vectors = embeddings
    ? new make.EmbeddingStore(
        path.join(store.root, "embeddings.json"),
        EMBEDDING_MODEL,
        { onDiagnostic: diagnostic => log(JSON.stringify(diagnostic)) },
      )
    : null;
  const index = embeddings
    ? new make.MomentIndex({
        embeddings,
        cache: vectors,
        flushMs: INDEX_FLUSH_MS,
        maxPending: INDEX_MAX_PENDING,
      })
    : null;
  const search = new make.MomentSearch({ index });
  // Published passages feed the bounded background index; a search never waits for a full catch-up.
  const feedIndex =
    index?.observe && config.backgroundIndex !== false
      ? (state) =>
          index.observe(
            state.segments
              .slice(-INDEX_OBSERVE_TAIL)
              .filter(hasUsableObservation),
          )
      : null;
  return { vectors, index, search, feedIndex };
}

module.exports = {
  createSessionTranscriber,
  createSessionInspection,
  createSessionPerception,
  createSessionIndex,
  INDEX_FLUSH_MS,
  INDEX_MAX_PENDING,
  INDEX_OBSERVE_TAIL,
};
