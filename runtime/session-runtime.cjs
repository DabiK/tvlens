const { refusal } = require("./errors.cjs");
const { SessionThumbnails } = require("../adapters/session-thumbnails.cjs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { WatchSession } = require("../core/session.cjs");
const { fromArchive, TVLENS_ARCHIVE_INVALID } = require("../core/memory/index.cjs");
const { createEventPublisher } = require("../core/shared/events.cjs");
const { SessionClock } = require("../core/session-clock.cjs");
const {
  LocalSessionStore,
  THUMBS_DIR,
  LEGACY_THUMBS_DIR,
} = require("../adapters/local-store.cjs");
const { DiskGuard } = require("../adapters/disk-guard.cjs");
const { readableManifest } = require("../adapters/session-library.cjs");
const {
  createSessionIndex,
  createSessionTranscriber,
  createSessionInspection,
  createSessionPerception,
  INDEX_FLUSH_MS,
  INDEX_MAX_PENDING,
  INDEX_OBSERVE_TAIL,
} = require("./session-providers.cjs");
const {
  createSessionManifest,
  MANIFEST_EVERY_MS,
} = require("./session-manifest.cjs");
const { createSessionLifecycle } = require("./session-lifecycle.cjs");
const { createPublicationDiagnostic } = require("./publication-diagnostic.cjs");
const { createMemoryMedia } = require("./memory-media.cjs");
// Decoded before anything is built on it: a saved state of another shape, format or version, or a manifest
// of another shape, is refused in plain words. Hands back the archive with the model to restore.
function readableRestore(restore) {
  if (!restore.snapshot || !restore.inventory)
    throw refusal(400, "Archive incomplète : état et inventaire requis.", "invalid-archive");
  let snapshot;
  try {
    snapshot = fromArchive(restore.snapshot);
  } catch (error) {
    if (error?.code === TVLENS_ARCHIVE_INVALID)
      throw refusal(400, error.message, "invalid-archive");
    throw error;
  }
  if (!readableManifest(restore.manifest))
    throw refusal(400, "Archive illisible.", "invalid-archive");
  return { ...restore, snapshot };
}
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
  onChange = () => {},
  log = () => {},
  onPublicationError = createPublicationDiagnostic(),
  events = createEventPublisher({ onError: onPublicationError }),
  readClock = () => performance.now(),
  wallClock = Date.now,
  host = null,
  guard,
  restore = null,
  overrides = {},
  transcriber = null,
}) {
  let watch, lifecycle;
  if (restore) restore = readableRestore(restore);
  if (restore && id !== undefined && id !== restore.snapshot.id)
    throw refusal(400, "Archive d’une autre session.", "invalid-archive");
  id ??= restore ? restore.snapshot.id : randomUUID();
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
  const store = LocalSessionStore.forSession(path.join(sessionsRoot, id), {
    guard: diskGuard,
  });
  const thumbnails = new SessionThumbnails(path.join(store.root, THUMBS_DIR), {
    legacyRoot: path.join(store.root, LEGACY_THUMBS_DIR),
  });
  const providerOptions = {
    id,
    config,
    selectedModels,
    codexBinary,
    quota,
    smoke,
    liveInspection,
    localInspection,
    liveObservation,
    strategy,
    overrides,
    store,
    userData,
    log,
    onPublicationError,
  };
  const { vectors, index, search, feedIndex } =
    createSessionIndex(providerOptions);
  transcriber ||= createSessionTranscriber(providerOptions);
  const { inspector, inspectorModel } = createSessionInspection({
    ...providerOptions,
    transcriber,
  });
  const sessionClock = new SessionClock(
    readClock,
    restore ? { elapsedMs: restore.snapshot.elapsedMs, paused: true } : {},
  );
  const perception = createSessionPerception({
    ...providerOptions,
    transcriber,
  });
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
  const manifest = createSessionManifest({
    id,
    host,
    store,
    thumbnails,
    restore,
    readClock,
    wallClock,
    readOnly: () => watch.readOnly,
    hasConfirmedEnd: () => lifecycle.hasConfirmedEnd(),
  });
  watch = new WatchSession({
    id,
    now: () => sessionClock.now(),
    perception,
    media: store,
    archive: store,
    thumbnails,
    storage,
    visionDuringAsk: config.visionDuringAsk === true,
    onPublicationError,
    onEvents: (pending) => {
      for (const event of pending) events.publish(event);
    },
    onChange: (state) => {
      if (!state.readOnly) feedIndex?.(state);
      manifest.publish(state);
      onChange(state);
    },
  });
  lifecycle = createSessionLifecycle({
    watch,
    store,
    thumbnails,
    sessionClock,
    manifest,
    inspector,
    index,
    vectors,
    perception,
    inspectorModel,
    guard: diskGuard,
    restore,
  });

  return {
    id,
    watch,
    events,
    memory: {
      view: () => watch.memoryView(),
      passage: id => watch.memoryPassage(id),
      passages: ids => watch.memoryPassages(ids),
      recentPassages: limit => watch.recentMemoryPassages(limit),
    },
    memoryMedia: createMemoryMedia(store),
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
      return lifecycle.closeErrors;
    },
    pause: () => lifecycle.pause(),
    resume: () => lifecycle.resume(),
    // Garde la session ; { purge: true } retire ses médias et miniatures en conservant ses textes.
    close: (options) => lifecycle.close(options),
    // Confirme l'archive sur disque, ou rejette après libération en gardant le dernier état confirmé.
    archive: () => lifecycle.archive(),
    // Attend le scellement avant suppression : aucune écriture tardive ne doit recréer le dossier.
    seal: () => lifecycle.seal(),
  };
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
function validateSegment(input, now) {
  if (
    !input ||
    !Number.isFinite(input.startMs) ||
    !Number.isFinite(input.endMs) ||
    input.endMs > now + 3000
  )
    throw refusal(400, "Horodatage de capture invalide.", "invalid-captured-segment");
  if (
    !(input.clip instanceof Uint8Array) ||
    input.clip.byteLength < 1 ||
    input.clip.byteLength > 20000000
  )
    throw refusal(400, "Segment vidéo trop volumineux ou vide.", "invalid-captured-segment");
  if (
    input.audio &&
    (!(input.audio instanceof Uint8Array) || input.audio.byteLength > 2100000)
  )
    throw refusal(400, "Audio invalide.", "invalid-captured-segment");
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
    throw refusal(400, "Images de capture invalides.", "invalid-captured-segment");
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
