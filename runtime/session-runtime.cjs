const {
  simulatedInspectionModel,
  simulatedInspector,
  simulatedPerception,
} = require("../adapters/simulated-providers.cjs");
const { SessionThumbnails } = require("../adapters/session-thumbnails.cjs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { WatchSession, restorable } = require("../core/session.cjs");
const { SessionClock } = require("../core/session-clock.cjs");
const { CachedInspector } = require("../core/cached-inspector.cjs");
const { RevocableInspector } = require("../core/revocable-inspector.cjs");
const { MomentIndex } = require("../core/moment-index.cjs");
const { MomentSearch } = require("../core/moment-search.cjs");
const {
  LocalSessionStore,
  THUMBS_DIR,
  LEGACY_THUMBS_DIR,
} = require("../adapters/local-store.cjs");
const { DiskGuard } = require("../adapters/disk-guard.cjs");
const {
  sessionTitle,
  readableManifest,
  MANIFEST_FORMAT,
  MANIFEST_VERSION,
} = require("../adapters/session-library.cjs");
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
const { LocalVlmAgent } = require("../adapters/local-vlm-agent.cjs");
const { hasUsableObservation } = require("../core/passage-text.cjs");

// Background sends are grouped per interval; the queue holds several hours of passages so that a late
// first search can hand over its whole prefix instead of dropping most of it.
const INDEX_FLUSH_MS = 30000,
  INDEX_MAX_PENDING = 2048;
// Media are kept for the whole session, so the passage list no longer empties itself: the background
// index is only shown the tail the former five-minute window used to hold (48 passages of 8 s).
const INDEX_OBSERVE_TAIL = 48;
// The manifest carries what a session list needs; during capture it is rewritten at most this often.
const MANIFEST_EVERY_MS = 30000,
  MANIFEST_MAX_CAPTURES = 100;
// What a re-examination is answered once the runtime of its session has closed.
const REVOKED =
  "Session terminée : ses passages ne peuvent plus être réexaminés.";
// Shared composition for Electron and headless hosts; platform capture stays outside.
function createSessionRuntime({
  id,
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
  // Media are kept until the session is deleted; a finite value brings the rolling window back.
  retentionMs = Infinity,
  onChange = () => {},
  readClock = () => performance.now(),
  wallClock = Date.now,
  host = null,
  guard,
  restore = null,
  overrides = {},
}) {
  let store, search, inspector, inspectorModel, sessionClock, perception, watch;
  if (restore && (!restore.snapshot || !restore.inventory))
    throw new Error("Archive incomplète : état et inventaire requis.");
  // Checked before anything is built on it: a saved state of another shape is refused in plain words.
  if (
    restore &&
    (!restorable(restore.snapshot) || !readableManifest(restore.manifest))
  )
    throw new Error("Archive illisible.");
  if (restore && id !== undefined && id !== restore.snapshot.id)
    throw new Error("Archive d’une autre session.");
  id ??= restore ? restore.snapshot.id : randomUUID();
  // null is how a saved state spells "no expiry"; anything else must be a real duration.
  if (
    retentionMs !== null &&
    retentionMs !== Infinity &&
    !(Number.isFinite(retentionMs) && retentionMs > 0)
  )
    throw new Error(
      "Réglage retentionMs invalide : durée positive en millisecondes attendue.",
    );
  // An unknown value must not silently fall back to Codex and be read as a local measurement.
  if (!["codex", "local", undefined].includes(config.perceptionBackend))
    throw new Error("Backend de perception inconnu (codex ou local).");
  for (const key of ["visionDuringAsk", "backgroundIndex"])
    if (![true, false, undefined].includes(config[key]))
      throw new Error(`Réglage ${key} invalide : 0 ou 1 attendu.`);
  // A forgotten wiring must not leave a real host without the floor. A simulated run never depends on
  // the free space of the machine it runs on unless it is handed a guard.
  const diskGuard =
    guard === undefined
      ? smoke
        ? null
        : new DiskGuard({ path: sessionsRoot })
      : guard;
  // One measurement when a session is created or reopened, so its state says more than "unknown"
  // before the first write. check() never rejects.
  diskGuard?.check();
  store = LocalSessionStore.forSession(path.join(sessionsRoot, id), {
    guard: diskGuard,
  });
  const thumbnails = new SessionThumbnails(path.join(store.root, THUMBS_DIR), {
    legacyRoot: path.join(store.root, LEGACY_THUMBS_DIR),
  });
  const researchBudget = new UsageLedger(
    config.researchBudgetFile || path.join(userData, "research-budget.json"),
  );
  const embeddings =
    overrides.embeddings ||
    ((smoke && !liveInspection) || !config.apiKey
      ? null
      : new OpenRouterEmbeddings({
          apiKey: config.apiKey,
          budget: researchBudget,
        }));
  const vectors = embeddings
    ? new EmbeddingStore(
        path.join(store.root, "embeddings.json"),
        EMBEDDING_MODEL,
      )
    : null;
  const index = embeddings
    ? new MomentIndex({
        embeddings,
        cache: vectors,
        // Background sends are grouped; a search still gets its own passages at once.
        flushMs: INDEX_FLUSH_MS,
        maxPending: INDEX_MAX_PENDING,
      })
    : null;
  search = new MomentSearch({ index });
  const transcriber = new LocalTranscriber({
    binary: config.whisperBinary,
    threads: config.whisperThreads,
    getLanguage: () => config.transcriptionLanguage || "auto",
    // Reduced encoder context is an explicit opt-in: unvalidated on real programme audio.
    ...(config.whisperAudioCtx === undefined
      ? {}
      : { audioCtx: config.whisperAudioCtx }),
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
    ? simulatedInspectionModel()
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
      ? simulatedInspector()
      : new ClipInspector({
          media: store,
          model: inspectionModel,
          ffmpeg: config.ffmpeg,
          strategy: inspectionStrategy(smoke ? strategy : "sheets-diverse"),
        });
  inspector = new CachedInspector(inspector);
  // The inspector outlives this runtime in whatever was handed it: a question, an external MCP context. Once
  // the runtime has closed it serves nothing more, cached or not: a late re-examination would reconnect an
  // inspection model that nobody owns any more. One still running is told through its signal, before it
  // reaches that model, and what it brings back all the same is neither answered nor left in the cache.
  inspector = new RevocableInspector(inspector, REVOKED);
  sessionClock = new SessionClock(
    readClock,
    restore ? { elapsedMs: restore.snapshot.elapsedMs, paused: true } : {},
  );
  const adapter = (perception =
    overrides.perception ||
    (smoke && !liveObservation
      ? simulatedPerception()
      : new CodexPerception({
          binary: codexBinary,
          authHome: config.codexAuthHome,
          model: selectedModels.observationModel,
          transcriber,
          quota,
          sessionId: id + "-observe",
          // A local model only replaces inference: prompt, context and validation stay shared.
          ...(config.perceptionBackend === "local"
            ? { agent: localVlmAgent(config.localVlm) }
            : {}),
        })));
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
  // Figures already in memory: the free space last measured by the guard and the volume accumulated
  // write by write. Read at every state emission, so it must never touch the disk.
  const storage = () => {
    const disk = diskGuard?.snapshot() || {
      state: "unknown",
      freeBytes: null,
      minFreeBytes: null,
    };
    const bytesPerMinute =
      store.writtenMs >= 1000
        ? Math.round(
            ((store.writtenBytes + thumbnails.bytes) * 60000) / store.writtenMs,
          )
        : null;
    return {
      state: disk.state,
      freeBytes: disk.freeBytes,
      minFreeBytes: disk.minFreeBytes,
      sessionBytes: store.bytes + thumbnails.bytes,
      bytesPerMinute,
      remainingMinutes:
        Number.isFinite(disk.freeBytes) && bytesPerMinute
          ? Math.max(
              0,
              Math.floor((disk.freeBytes - disk.minFreeBytes) / bytesPerMinute),
            )
          : null,
    };
  };
  const captures = restore
    ? [...(restore.manifest?.captures || [])]
    : [{ startedAt: wallClock(), fromMs: 0 }];
  let manifestAt = -Infinity,
    ending = null,
    // True once the end of this runtime is on disk, last states and manifest. Its own fact: what an
    // earlier life of the session left in the manifest says nothing of this one.
    archived = false,
    // Why that end is not confirmed, once asked for: the write that was refused.
    unconfirmed = null;
  // What failed while this runtime was closing, one line per step: kept for the host, never swallowed.
  const closeErrors = [];
  // Every closing step is attempted whatever the others did: one adapter that fails to close neither
  // leaves a provider process running nor keeps the session from being archived.
  const closing = async (step, work) => {
    try {
      await work();
    } catch (error) {
      closeErrors.push(
        `${step} : ${String(error?.message || error).slice(0, 200)}`,
      );
    }
  };
  // Wall-clock facts and totals a list needs without opening the saved state. Never for a reopened
  // archive that was not resumed: opening and closing one leaves its directory as it was.
  // `final` is the end of the session, once its last states are on disk: the only write that says
  // "archived".
  const recordManifest = (state, patch = {}, final = false) => {
    if (watch.readOnly) return Promise.resolve();
    manifestAt = readClock();
    // Once on disk it stays: a late pause cannot make a closed session look interrupted again, nor one
    // whose end the disk refused look archived.
    const closed = final || archived;
    const passages = [...state.history, ...state.segments],
      stored = state.segments.filter((s) => s.available).length,
      createdAt =
        store.manifest?.createdAt ??
        restore?.createdAt ??
        captures[0]?.startedAt ??
        wallClock();
    return store
      .saveManifest({
        format: MANIFEST_FORMAT,
        version: MANIFEST_VERSION,
        id,
        host: store.manifest?.host ?? host,
        createdAt,
        updatedAt: wallClock(),
        closedAt: closed ? (store.manifest?.closedAt ?? wallClock()) : null,
        state: closed ? "archived" : "live",
        title: store.manifest?.title || sessionTitle(createdAt),
        firstTopic:
          store.manifest?.firstTopic ||
          passages.find((p) => p.observation?.topic)?.observation.topic ||
          null,
        elapsedMs: state.elapsedMs,
        capturedThroughMs: state.capturedThroughMs,
        passages: passages.length,
        media: {
          stored,
          missing: passages.length - stored,
          bytes: store.bytes + thumbnails.bytes,
          retention: state.retention,
        },
        captures,
        ...patch,
      })
      .catch((error) => {
        // While the session lives a refused manifest is only late, and the next one says it all again.
        // The one that ends it is handed back: nothing else would say that the archive is not on disk.
        if (final) throw error;
      });
  };
  watch = new WatchSession({
    id,
    retentionMs: retentionMs,
    now: () => sessionClock.now(),
    perception: adapter,
    answer: adapter,
    media: store,
    archive: store,
    thumbnails,
    storage,
    visionDuringAsk: config.visionDuringAsk === true,
    onChange: (state) => {
      if (!state.readOnly) {
        feedIndex?.(state);
        // First stored passage, then a bounded cadence: the manifest of a session cut short is at most
        // this old.
        if (
          state.accepting &&
          state.coverage.passages &&
          readClock() - manifestAt >= MANIFEST_EVERY_MS
        )
          recordManifest(state);
      }
      onChange(state);
    },
  });
  if (restore) {
    const { snapshot, inventory } = restore;
    const known = new Set(
      [...(snapshot.history || []), ...snapshot.segments].map((p) => p.id),
    );
    store.adopt(
      inventory,
      snapshot.segments.reduce(
        (total, p) =>
          inventory.ids.has(p.id) ? total + (p.endMs - p.startMs) : total,
        0,
      ),
      restore.manifest,
    );
    thumbnails.bytes = inventory.thumbBytes || 0;
    // Stopped and read-only: nothing is indexed, analysed or written until resume().
    watch.restore(snapshot, {
      hasMedia: (passage) => inventory.ids.has(passage),
      hasThumbnail: (passage) => inventory.thumbs.has(passage),
      orphans:
        inventory.orphans ||
        [...inventory.ids, ...(inventory.partial || [])].filter(
          (passage) => !known.has(passage),
        ),
    });
  }

  const runtime = {
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
    guard: diskGuard,
    storage,
    // True from the opening of an archive until an explicit resume(): hosts must not warm up a provider,
    // start a recap or accept a capture meanwhile.
    get readOnly() {
      return watch.readOnly;
    },
    // The manifest asked for, title set in memory included: not a proof that it is on disk.
    manifest: () => store.manifest,
    // Empty unless an adapter failed to close: that alone keeps no session from being archived, and its
    // host reports these. A write the disk refused is not one of them: archive() is the one to say it.
    get closeErrors() {
      return [...closeErrors];
    },
    async pause() {
      sessionClock.pause();
      await watch.stop();
      await recordManifest(watch.snapshot());
    },
    async resume() {
      // Refused on a fresh measurement before anything changes, with the message of a refused write.
      await diskGuard?.assertRoom();
      const fromMs = sessionClock.now();
      sessionClock.resume();
      await watch.resume();
      captures.push({ startedAt: wallClock(), fromMs });
      captures.splice(0, captures.length - MANIFEST_MAX_CAPTURES);
      await recordManifest(watch.snapshot());
    },
    // Ends the work of this runtime and keeps the session whole on disk. `purge` is the former
    // behaviour, on request only: raw media and thumbnails of this session are erased, its text stays.
    async close({ purge = false } = {}) {
      // An archive that is only open is never emptied in passing: nothing of this runtime may write into
      // it, its manifest included. Its media go with the explicit deletion of the whole session.
      if (purge && watch.readOnly)
        throw new Error(
          "Session ouverte en lecture seule : ses médias ne s’effacent qu’avec la suppression de la session.",
        );
      // No re-examination from here on, and none kept: see the inspector above.
      inspector.revoke();
      ending ||= (async () => {
        watch.asking = true;
        // No new passage from here, and one whose write is under way lands first, thumbnail included:
        // the state saved by close() lists every identifier ingest() has handed or is about to hand back.
        watch.accepting = false;
        // A passage that lands during this wait is stored and saved, but its analysis is not started
        // only to be abandoned by the close that follows.
        watch.ending = true;
        await watch.landed();
        await closing("session", () => watch.close());
        await closing("index", () => index?.close?.());
        await closing("miniatures", () => thumbnails.close());
        await Promise.all([
          closing("perception", () => perception.close?.()),
          closing("modèle d’inspection", () => inspectorModel.close?.()),
        ]);
      })();
      await ending;
      if (purge) {
        await thumbnails.clear();
        await store.clearRaw();
      }
      // Asked again after a refusal: the state is saved anew before anything is confirmed.
      if (unconfirmed) await watch.persist();
      const state = watch.snapshot();
      // The last states first, then the manifest that vouches for them: "archived" never sits on disk
      // beside a state the disk refused. That manifest is written by every life of the session that
      // captured, a resumed archive included; one that was only read has nothing to write. The refusal
      // is kept for archive() to say; closing itself never fails for it, so neither a deletion nor a
      // host that stops is held back.
      unconfirmed = await store
        .flush()
        .then(() => {
          // Refused before it ever reached the store: the session itself is the one that knows.
          if (watch.saveError) throw new Error(watch.saveError);
          return purge || !archived
            ? recordManifest(
                state,
                purge
                  ? {
                      media: {
                        stored: 0,
                        missing: state.coverage.passages,
                        bytes: 0,
                        retention: state.retention,
                      },
                    }
                  : {},
                true,
              )
            : null;
        })
        .then(
          () => {
            archived = true;
            return null;
          },
          (error) => error,
        );
    },
    // End of a session for its host: closed, kept, and listed as an archive; the manifest handed back is
    // the one confirmed on disk. Rejects when the disk refused one of the last writes: every resource is
    // released all the same and the folder keeps what was last confirmed. Asked again, this runtime saves
    // its state and its manifest anew; a file its host writes (questions, recap, surveillance) stays
    // refused until that host has written it again.
    async archive() {
      await runtime.close();
      if (unconfirmed) throw unconfirmed;
      return store.confirmed;
    },
    // Before the session is deleted: once this resolves, nothing from this runtime can write into its
    // directory again, so a late save cannot bring a deleted session back.
    async seal() {
      // Sealed first: the last saves of close() are then no-ops instead of final writes.
      const sealing = [store.seal(), vectors?.seal()];
      await runtime.close();
      await Promise.all(sealing);
    },
  };
  return runtime;
}
// Reads an archive once and rebuilds its runtime stopped and read-only. `library` is a SessionLibrary on
// the same root as `sessionsRoot`.
async function openArchivedSession({ library, id, ...options }) {
  const archive = await library.read(id);
  const session = createSessionRuntime({
    ...options,
    id,
    sessionsRoot: library.root,
    restore: {
      snapshot: archive.snapshot,
      inventory: archive.inventory,
      manifest: archive.manifest,
      createdAt: archive.summary.createdAt,
    },
  });
  return { session, archive };
}
function localVlmAgent(settings = {}) {
  return new LocalVlmAgent({
    url: settings.url,
    model: settings.model,
    numCtx: settings.numCtx,
    ...(settings.keepAlive ? { keepAlive: settings.keepAlive } : {}),
    ...(settings.token
      ? { headers: { Authorization: "Bearer " + settings.token } }
      : {}),
  });
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
module.exports = {
  createSessionRuntime,
  openArchivedSession,
  validateSegment,
  INDEX_FLUSH_MS,
  INDEX_MAX_PENDING,
  INDEX_OBSERVE_TAIL,
  MANIFEST_EVERY_MS,
};
