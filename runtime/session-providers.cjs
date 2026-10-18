const path = require("node:path");
const { LocalTranscriber } = require("../adapters/local-transcriber.cjs");
const { CodexPerception } = require("../adapters/codex-perception.cjs");
const { LocalVlmAgent } = require("../adapters/local-vlm-agent.cjs");
const { ClipInspector } = require("../adapters/clip-inspector.cjs");
const { InspectionDiagnostics } = require("../adapters/perception/inspection-diagnostics.cjs");
const { CachedInspector } = require("../core/cached-inspector.cjs");
const { RevocableInspector } = require("../core/revocable-inspector.cjs");
const { inspectionStrategy } = require("../adapters/inspection-strategies.cjs");
const { UsageLedger } = require("../adapters/trial-budget.cjs");
const {
  OpenRouterEmbeddings,
} = require("../adapters/openrouter-embeddings.cjs");
const { OllamaEmbeddings, validateEmbeddingTimeout } = require("../adapters/embeddings/ollama-embeddings.cjs");
const { providerIdentity } = require("../adapters/embeddings/provider-identity.cjs");
const { validateOllamaConfig } = require("../adapters/ollama/http-client.cjs");
const { EmbeddingStore } = require("../adapters/embedding-store.cjs");
const { MomentIndex } = require("../core/moment-index.cjs");
const { MemorySearch } = require("../core/moment-search.cjs");
const { publishState } = require("../core/state-publication.cjs");
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
  OllamaEmbeddings,
  EmbeddingStore,
  MomentIndex,
  MemorySearch,
};
const inspectionProviders = {
  CodexPerception,
  LocalVlmAgent,
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
  validateInspectionSelection(config, { smoke, liveInspection, localInspection });
  const make = { ...inspectionProviders, ...dependencies };
  const local = config.inspectionBackend === "local";
  const inspectorModel = localInspection
    ? make.simulatedInspectionModel()
    : new make.CodexPerception({
        binary: codexBinary,
        authHome: config.codexAuthHome,
        model: local ? config.localVlm.model : selectedModels.inspectionModel,
        transcriber,
        quota,
        sessionId: id + "-inspect",
        ...(local ? { agent: localVlmAgent(config.localVlm, make.LocalVlmAgent) } : {}),
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
    new make.CachedInspector(new InspectionDiagnostics(inner, inspectionIdentity({
      config, inspectorModel, smoke, liveInspection, localInspection,
    }))),
    REVOKED,
  );
  return { inspector, inspectorModel };
}

function validateInspectionSelection(config, { smoke, liveInspection, localInspection }) {
  if (![undefined, "codex", "local"].includes(config.inspectionBackend) ||
      (config.inspectionBackend === "local" && (localInspection || (smoke && !liveInspection)))) {
    throw Object.assign(Error("Configuration du réexamen invalide : backend inconnu ou simulation demandée avec le backend local."), {
      code: "TVLENS_INSPECTION_CONFIG_INVALID",
    });
  }
  if (config.inspectionBackend === "local") validateOllamaConfig(config.localVlm);
}

function inspectionIdentity({ config, inspectorModel, smoke, liveInspection, localInspection }) {
  const role = "inspection";
  if (localInspection || (smoke && !liveInspection))
    return { role, backend: "simulation", model: null, mode: localInspection ? "localInspection" : "smoke" };
  if (config.inspectionBackend !== "local") return { role, backend: "codex", model: inspectorModel.model || null };
  const { model, url, numCtx } = config.localVlm;
  return { role, backend: "ollama", model, host: new URL(url).host, ...(numCtx ? { numCtx } : {}) };
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
  { config, userData, store, smoke, liveInspection, overrides, log = () => {}, onPublicationError = () => {} },
  dependencies = {},
) {
  const make = { ...indexProviders, ...dependencies };
  const selectedEmbeddings = selectEmbeddings(config, smoke && !liveInspection, make, userData, overrides.embeddings, log);
  const identity = selectedEmbeddings ? providerIdentity(selectedEmbeddings, store.root) : null;
  const embeddingDiagnostics = indexDiagnostic(identity, config);
  const vectors = identity
    ? new make.EmbeddingStore(
        identity.file,
        identity.model,
        { onDiagnostic: diagnostic => log(JSON.stringify(diagnostic)),
          assertIdentity: identity.assertIdentity, identityScoped: identity.identityScoped },
      )
    : null;
  const index = identity
    ? new make.MomentIndex({
        embeddings: identity.provider,
        cache: vectors,
        flushMs: INDEX_FLUSH_MS,
        maxPending: INDEX_MAX_PENDING,
      })
    : null;
  const search = new make.MemorySearch({ index });
  diagnoseSearch(search, embeddingDiagnostics);
  // Published passages feed the bounded background index; a search never waits for a full catch-up.
  const feedIndex =
    index?.observe && config.backgroundIndex !== false
      ? (passages) => index.observe(passages.filter(passage => passage.usableObservation))
      : null;
  const connectIndex = feedIndex ? options => subscribeSessionIndex({ ...options, feedIndex, onPublicationError }) : null;
  return { vectors, index, search, feedIndex, connectIndex, embeddingDiagnostics };
}

function selectEmbeddings(config, simulated, make, userData, override, log) {
  validateEmbeddingSelection(config);
  const backend = config.embeddingsBackend ?? (config.apiKey ? 'openrouter' : 'disabled');
  if (config.embeddingsBackend === 'disabled') return null;
  if (override) return override;
  if (backend === 'disabled') return null;
  if (backend === 'local') return new make.OllamaEmbeddings({
    ...config.localEmbeddings, onDiagnostic: diagnostic => log(JSON.stringify(diagnostic)),
  });
  if (simulated) return null;
  const budget = new make.UsageLedger(config.researchBudgetFile || path.join(userData, 'research-budget.json'));
  return new make.OpenRouterEmbeddings({ apiKey: config.apiKey, budget });
}

function validateEmbeddingSelection(config) {
  if (![undefined, 'local', 'openrouter', 'disabled'].includes(config.embeddingsBackend)
    || (config.embeddingsBackend === 'openrouter' && !config.apiKey)) {
    throw Object.assign(Error('Configuration des embeddings invalide : backend ou clé manquant.'), { code: 'TVLENS_EMBEDDINGS_CONFIG_INVALID' });
  }
  if (config.embeddingsBackend === 'local') {
    validateOllamaConfig(config.localEmbeddings);
    validateEmbeddingTimeout(config.localEmbeddings?.timeoutMs);
  }
}

function indexDiagnostic(identity, config) {
  const diagnostic = identity?.diagnostic || { enabled: false, backend: 'disabled', model: null, identity: null };
  return Object.freeze({ ...diagnostic, selection: config.embeddingsBackend === undefined ? 'legacy' : 'explicit' });
}

function diagnoseSearch(search, diagnostic) {
  search.embeddingDiagnostics = diagnostic;
  if (typeof search.search !== 'function') return;
  const run = search.search.bind(search);
  search.search = async input => {
    const result = await run(input);
    // Le journal des hôtes signale des erreurs ; une recherche réussie y ferait annoncer une panne.
    search.lastEmbeddingTrace = Object.freeze({ code: 'TVLENS_EMBEDDINGS_SEARCH', ...diagnostic, mode: result.mode });
    return { ...result, embeddings: diagnostic };
  };
}

function subscribeSessionIndex({ id, events, memory, readOnly, feedIndex, onPublicationError }) {
  // La queue précède le filtre d'éligibilité, comme dans l'alimentation historique.
  const revisions = new Map();
  function initialize() {
    const passages = memory.recentPassages(INDEX_OBSERVE_TAIL);
    revisions.clear();
    for (const passage of passages) revisions.set(passage.id, passage.revision);
    if (!readOnly()) feedIndex(passages);
  }
  function resume() {
    // Cette réaction facultative n'empêche jamais l'enregistrement explicite de la reprise.
    publishState(initialize, onPublicationError, { origin: 'session-index-initialization', sessionId: id });
  }
  resume();
  const unsubscribe = events.subscribe(event => {
    if (event.sessionId !== id || readOnly()) return;
    if (event.type === 'PassageReceived') {
      if (!revisions.has(event.passageId)) revisions.set(event.passageId, -1);
      if (revisions.size > INDEX_OBSERVE_TAIL) revisions.delete(revisions.keys().next().value);
    }
    if (event.type !== 'PassageUpdated' || !revisions.has(event.passageId)) return;
    if (event.revision <= revisions.get(event.passageId)) return;
    const passage = memory.passage(event.passageId);
    if (!passage || passage.revision !== event.revision || passage.origin !== 'retained') return;
    revisions.set(passage.id, passage.revision);
    feedIndex([passage]);
  });
  return { resume, close: unsubscribe };
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
