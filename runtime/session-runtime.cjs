const { SessionThumbnails } = require("../adapters/session-thumbnails.cjs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { WatchSession, restorable } = require("../core/session.cjs");
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
  let watch;
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
  };
  const { vectors, index, search, feedIndex } =
    createSessionIndex(providerOptions);
  const transcriber = createSessionTranscriber(providerOptions);
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
  let ending = null,
    // True once the end of this runtime is on disk, last states and manifest. Its own fact: what an
    // earlier life of the session left in the manifest says nothing of this one.
    archived = false,
    // Why that end is not confirmed, once asked for: the write that was refused.
    unconfirmed = null;
  const manifest = createSessionManifest({
    id,
    host,
    store,
    thumbnails,
    restore,
    readClock,
    wallClock,
    readOnly: () => watch.readOnly,
    hasConfirmedEnd: () => archived,
  });
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
  watch = new WatchSession({
    id,
    retentionMs: retentionMs,
    now: () => sessionClock.now(),
    perception,
    answer: perception,
    media: store,
    archive: store,
    thumbnails,
    storage,
    visionDuringAsk: config.visionDuringAsk === true,
    onChange: (state) => {
      if (!state.readOnly) feedIndex?.(state);
      manifest.publish(state);
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
      await manifest.record(watch.snapshot());
    },
    async resume() {
      // Refused on a fresh measurement before anything changes, with the message of a refused write.
      await diskGuard?.assertRoom();
      const fromMs = sessionClock.now();
      sessionClock.resume();
      await watch.resume();
      manifest.captureResumed(fromMs);
      await manifest.record(watch.snapshot());
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
      // No re-examination from here on, cached results included.
      inspector.revoke();
      ending ||= (async () => {
        // No new passage from here, and one whose write is under way lands first, thumbnail included:
        // the state saved by close() lists every identifier ingest() has handed or is about to hand back.
        watch.closeIntake();
        // A passage that lands during this wait is stored and saved, but its analysis is not started
        // only to be abandoned by the close that follows.
        watch.beginEnding();
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
            ? manifest.record(
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
