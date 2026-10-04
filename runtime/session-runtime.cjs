const { SessionThumbnails } = require("../adapters/session-thumbnails.cjs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { WatchSession } = require("../core/session.cjs");
const { SessionClock } = require("../core/session-clock.cjs");
const { CachedInspector } = require("../core/cached-inspector.cjs");
const { MomentIndex } = require("../core/moment-index.cjs");
const { MomentSearch } = require("../core/moment-search.cjs");
const { LocalSessionStore } = require("../adapters/local-store.cjs");
const { UsageLedger } = require("../adapters/trial-budget.cjs");
const {
  OpenRouterEmbeddings,
  EMBEDDING_MODEL,
} = require("../adapters/openrouter-embeddings.cjs");
const { EmbeddingStore } = require("../adapters/embedding-store.cjs");
const { LocalTranscriber } = require("../adapters/local-transcriber.cjs");
const { CodexPerception } = require("../adapters/codex-perception.cjs");
const { ClipInspector } = require("../adapters/clip-inspector.cjs");
const { inspectionStrategy } = require("../adapters/inspection-strategies.cjs");

// Shared composition for Electron and headless hosts; platform capture stays outside.
function createSessionRuntime({
  id = randomUUID(),
  sessionsRoot,
  userData,
  config = {},
  selectedModels,
  codexBinary = "codex",
  quota,
  smoke = false,
  liveInspection = false,
  localInspection = false,
  liveObservation = false,
  strategy = "sheets-diverse",
  retentionMs = 300000,
  onChange = () => {},
  readClock = () => performance.now(),
  overrides = {},
}) {
  let store, search, inspector, inspectorModel, sessionClock, perception, watch;
  store = new LocalSessionStore(path.join(sessionsRoot, id));
  const thumbnails = new SessionThumbnails(path.join(store.root, "thumbnails"));
  const researchBudget = new UsageLedger(
    config.researchBudgetFile || path.join(userData, "research-budget.json"),
  );
  const embeddings =
    (smoke && !liveInspection) || !config.apiKey
      ? null
      : new OpenRouterEmbeddings({
          apiKey: config.apiKey,
          budget: researchBudget,
        });
  const index = embeddings
    ? new MomentIndex({
        embeddings,
        cache: new EmbeddingStore(
          path.join(store.root, "embeddings.json"),
          EMBEDDING_MODEL,
        ),
      })
    : null;
  search = new MomentSearch({ index });
  const transcriber = new LocalTranscriber({
    binary: config.whisperBinary,
    getLanguage: () => config.transcriptionLanguage || "auto",
    model:
      config.whisperModel ||
      path.join(
        path.dirname(
          config.researchBudgetFile ||
            path.join(process.cwd(), ".local", "research-budget.json"),
        ),
        "models",
        "ggml-base.bin",
      ),
  });
  const inspectionModel = (inspectorModel = localInspection
    ? {
        inspect: async ({ segments }) => ({
          observations: segments.map((s) => ({
            id: s.id,
            startMs: s.startMs,
            endMs: s.endMs,
            text: "Un cercle est visible dans les planches du test.",
          })),
          hypotheses: [],
          limits: ["Modèle simulé pour le test local."],
          cost: 0,
        }),
        selectRegion: async () => ({
          region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
          reason: "Rectangle de test, sans inférence.",
          cost: 0,
        }),
      }
    : new CodexPerception({
        binary: codexBinary,
        authHome: config.codexAuthHome,
        model: selectedModels.inspectionModel,
        transcriber,
        quota,
        sessionId: id + "-inspect",
      }));
  inspector =
    smoke && !liveInspection && !localInspection
      ? {
          inspect: async ({ segments, startMs, endMs }) => ({
            observations: segments.map((s) => ({
              id: s.id,
              startMs: Math.max(startMs, s.startMs),
              endMs: Math.min(endMs, s.endMs),
              text: "Le cercle effectue un bref saut entre deux images.",
            })),
            hypotheses: [],
            limits: [],
            sampledFrames: 12,
          }),
        }
      : new ClipInspector({
          media: store,
          model: inspectionModel,
          ffmpeg: config.ffmpeg,
          strategy: inspectionStrategy(smoke ? strategy : "sheets-diverse"),
        });
  inspector = new CachedInspector(inspector);
  sessionClock = new SessionClock(readClock);
  const adapter = (perception =
    overrides.perception ||
    (smoke && !liveObservation
      ? {
          observe: async (input) => ({
            observation: {
              summary: "Un cercle se déplace sur un fond bleu.",
              visual: `${input.frames.length} images reçues.`,
              audio: input.audio ? "Audio reçu." : "Pas d’audio.",
              transcript: "",
              uncertainty: "",
            },
            cost: 0,
          }),
          ask: async (input) => ({
            answer: "Un cercle se déplace sur un fond bleu.",
            kind: "observation",
            citations: [input.context.at(-1).id],
            limits: [],
            cost: 0,
          }),
        }
      : new CodexPerception({
          binary: codexBinary,
          authHome: config.codexAuthHome,
          model: selectedModels.observationModel,
          transcriber,
          quota,
          sessionId: id + "-observe",
        })));
  watch = new WatchSession({
    id,
    retentionMs: retentionMs,
    now: () => sessionClock.now(),
    perception: adapter,
    answer: adapter,
    media: store,
    archive: store,
    thumbnails,
    onChange,
  });

  return {
    id,
    watch,
    store,
    search,
    inspector,
    inspectorModel,
    sessionClock,
    perception,
    transcriber,
    thumbnails,
    async pause() {
      sessionClock.pause();
      await watch.stop();
    },
    async resume() {
      sessionClock.resume();
      await watch.resume();
    },
    async close() {
      watch.asking = true;
      await watch.close();
      await thumbnails.clear();
      await Promise.allSettled([
        perception.close?.(),
        inspectorModel.close?.(),
      ]);
      await store.clearRaw();
    },
  };
}
function validateSegment(input, now) {
  if (
    !input ||
    !Number.isFinite(input.startMs) ||
    !Number.isFinite(input.endMs) ||
    input.endMs > now + 3000
  )
    throw new Error("Horodatage de capture invalide.");
  if (
    !(input.clip instanceof Uint8Array) ||
    input.clip.byteLength < 1 ||
    input.clip.byteLength > 20000000
  )
    throw new Error("Segment vidéo trop volumineux ou vide.");
  if (
    input.audio &&
    (!(input.audio instanceof Uint8Array) || input.audio.byteLength > 2100000)
  )
    throw new Error("Audio invalide.");
  if (
    !Array.isArray(input.frames) ||
    input.frames.length < 1 ||
    input.frames.length > 8 ||
    input.frames.some(
      (f) =>
        typeof f.dataUrl !== "string" ||
        f.dataUrl.length > 1000000 ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(f.dataUrl) ||
        !Number.isFinite(f.atMs) ||
        f.atMs < input.startMs - 100 ||
        f.atMs > input.endMs + 100,
    )
  )
    throw new Error("Images de capture invalides.");
}
module.exports = { createSessionRuntime, validateSegment };
