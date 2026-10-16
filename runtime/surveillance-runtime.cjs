const { Surveillance } = require("../core/surveillance.cjs");
const { publishState } = require("../core/state-publication.cjs");
const { createPublicationDiagnostic } = require("./publication-diagnostic.cjs");
const {
  CodexSurveillanceAgent,
} = require("../adapters/codex-surveillance-agent.cjs");

// The whole registry is serialised at each write: one write per second at most, however fast it moves,
// and less often as it grows (several kB per verified claim: sources, evidence, context). Final states never wait.
const SAVE_INTERVAL_MS = 1000;
const saveIntervalMs = (claims) =>
  SAVE_INTERVAL_MS * Math.max(1, Math.ceil(claims / 200));
// A session folder is read from local disk: past this delay the surveillance goes on without its answer.
const ADOPT_TIMEOUT_MS = 5000;
const UNREAD =
  "Registre de surveillance existant illisible : l’historique précédent n’est ni repris ni remplacé.";
const MEMORY_ONLY =
  "Historique en mémoire seulement : il ne sera pas enregistré dans cette session.";
// state.registry.message, by way of keeping the registry. None of them ever suggests removing a file.
const REGISTRY_MESSAGES = Object.freeze({
  restoring: "Restauration du suivi enregistré…",
  "memory-only": MEMORY_ONLY,
  // Status "memory-only" too: nothing says that the file is bad, its folder only failed to answer in time.
  slow: "Lecture du suivi enregistré trop longue. Historique en mémoire seulement : il ne sera pas enregistré tant que cette lecture n’a pas abouti.",
  unreadable: `${UNREAD} ${MEMORY_ONLY}`,
  "write-failed":
    "Écriture du suivi en échec. Historique en mémoire seulement : il ne sera pas enregistré tant que l’écriture échoue.",
});

function tickSurveillance(runtime, onPublicationError, context) {
  try {
    runtime.tick();
  } catch (error) {
    try {
      onPublicationError({ code: "TVLENS_SURVEILLANCE_TICK_FAILED", ...context, error });
    } catch {
      // Le journal ne possède pas la maintenance ; le prochain intervalle reste la seule reprise du tick.
    }
  }
}

// Shared composition for both hosts, like the conversation runtime. The host supplies the current
// session ({ watch, store }), forwards session changes to observe() and calls tick() every second:
// no timer lives here. Nothing in this file knows about the chat; `probe` only feeds an informative
// overlap counter.
//
// What a host is given (onChange, snapshot() in its three forms, and the states returned by start, stop,
// retry, restore and reset) is the state of the core plus how its registry is kept:
//   registry: { ready, persisted, status: 'ready'|'restoring'|'memory-only'|'unreadable'|'write-failed', message }
// - ready is false only while the registry saved in the session folder is being read. The activation asked
//   for is then provisional: activity is { state: 'restoring', label: registry.message } with nothing
//   detecting, running, waiting or late, and activation is { id: null, provisional: true } with the
//   instruction and the t0 asked for. Counters, cards and sequences are not final until ready is true.
// - persisted is true when nothing shown lives in memory only (status 'ready', message null). Otherwise the
//   surveillance goes on in memory, message says so, and it stays for as long as that is true.
// The saved form never carries this block: it describes this process, not the registry.
function createSurveillanceRuntime({
  getSession,
  agent,
  codexBinary,
  config = {},
  selectedModels = {},
  quota,
  onChange = () => {},
  onPublicationError = createPublicationDiagnostic(),
  now = Date.now,
  probe,
}) {
  const {
    workers = 1,
    reasoningEffort = "low",
    model,
    ...limits
  } = config.surveillance || {};
  // A mistyped setting is refused at start instead of running with another number of workers.
  if (!Number.isInteger(workers) || workers < 1 || workers > 3)
    throw new Error("Réglage surveillance.workers invalide : 1 à 3 attendu.");
  // Never the chat agent: a shared client would serialise both and mix their opened pages.
  const surveillanceAgent =
    agent ||
    new CodexSurveillanceAgent({
      binary: codexBinary || "codex",
      authHome: config.codexAuthHome,
      model: model ?? selectedModels?.codexModel ?? "",
      reasoningEffort,
      quota,
      workers,
    });
  let store = null,
    // The session `store` belongs to. Only an activation binds a folder; the end of the session, or an
    // archive opened in its place, lets it go.
    bound = null,
    // Bumped by reset(), restore() and close(). A reading and a write both carry the epoch and the session
    // they were started for: what one of an earlier epoch, or of another session, brings back moves nothing.
    epoch = 0,
    dirty = false,
    muted = false,
    hushed = false,
    released = true,
    lastSaveAt = -Infinity,
    // The activation waiting for the registry already saved in its session folder:
    // { id, epoch, instruction, snapshot, since, settled, release }.
    adopting = null,
    // The session whose saved registry is not held: nothing is written over that file. Known of one binding
    // of its folder, like a failed write: it goes when the folder is let go, and what is activated on that
    // session afterwards either reads the folder again or runs on the registry its host read and restored.
    unreadable = null,
    // …and the reading of its folder, when all it did was run out of time: its answer may still land, and
    // the next activation on that session reads the folder again.
    overdue = null,
    // The session whose last write failed, until one lands.
    failing = null,
    // Confirmation et refus concernent seulement l'état courant ; aucun instantané n'attend une livraison.
    toldAs = "",
    refusedAs = null,
    publications = 0,
    writing = Promise.resolve(),
    releasing = Promise.resolve();
  const persistence = { writes: 0, failures: 0, lastError: null };
  const current = (task) => task.epoch === epoch && task.id === bound;
  // How the registry shown is kept, derived from what holds now: an error is told for as long as it is
  // true, and no longer.
  const registry = () => {
    const id = surveillance.sessionId;
    const slow = unreadable === id && overdue?.id === id;
    const status = adopting
      ? "restoring"
      : !id
        ? "ready"
        : unreadable === id
          ? slow
            ? "memory-only"
            : "unreadable"
          : bound !== id
            ? // Shown without a folder bound: an archive as it was saved, or a registry nothing writes.
              surveillance.restored
              ? "ready"
              : "memory-only"
            : typeof store?.saveSurveillance !== "function"
              ? "memory-only"
              : failing === id
                ? "write-failed"
                : "ready";
    return {
      ready: status !== "restoring",
      persisted: status === "ready",
      status,
      message:
        status === "ready" ? null : REGISTRY_MESSAGES[slow ? "slow" : status],
    };
  };
  const tag = (kept) => `${kept.status}|${kept.message}`;
  const told = (state) => {
    const kept = registry();
    if (kept.ready) return { ...state, registry: kept };
    // The saved registry is still being read: the activation has no number yet and nothing runs under it.
    return {
      ...state,
      activation: state.activation && {
        ...state.activation,
        id: null,
        provisional: true,
      },
      activity: {
        ...state.activity,
        state: "restoring",
        label: kept.message,
        detecting: false,
        running: 0,
        waiting: 0,
        late: false,
      },
      registry: kept,
    };
  };
  const publish = (state) => {
    if (hushed) return;
    const shown = told(state);
    const attempt = ++publications, scope = epoch;
    let delivered = false;
    publishState(() => {
      onChange(shown);
      delivered = true;
    }, onPublicationError, {
      origin: "surveillance-runtime", sessionId: shown.sessionId,
    });
    // Un callback peut remplacer la session : son ancien envoi ne confirme rien de la nouvelle.
    if (scope !== epoch || attempt !== publications) return;
    if (delivered) {
      toldAs = tag(shown.registry);
      refusedAs = null;
    } else {
      // Seul l'état courant sera retenté, au prochain tick ; aucune copie d'état ne s'accumule.
      refusedAs = tag(shown.registry);
    }
  };
  // The way the registry is kept moves without the core (reading over, write failed or landed): said once.
  const announce = () => {
    if (tag(registry()) !== (refusedAs ?? toldAs)) publish(surveillance.snapshot());
  };
  // The store method arrives with durable sessions: until then a store without it is simply not written.
  // Never over a registry that is still being read, or that could not be read, and only ever the registry of
  // the session the folder belongs to. What a folder cannot take is dropped here: a change left pending
  // would be written into whichever folder is bound next.
  const write = () => {
    if (!dirty || adopting) return writing;
    dirty = false;
    if (
      !bound ||
      surveillance.sessionId !== bound ||
      unreadable === bound ||
      typeof store?.saveSurveillance !== "function"
    )
      return writing;
    lastSaveAt = now();
    persistence.writes++;
    const task = { epoch, id: bound };
    const landed = () => {
      if (!current(task) || failing !== task.id) return;
      failing = null;
      announce();
    };
    const failed = (error) => {
      persistence.failures++;
      persistence.lastError = String(error?.message || error).slice(0, 200);
      // Counted, and nothing more, once the folder has been let go.
      if (!current(task)) return;
      // Kept in memory and tried again at the next due second. An atomic store leaves its file as it was.
      failing = task.id;
      dirty = true;
      announce();
    };
    try {
      writing = Promise.resolve(
        store.saveSurveillance(surveillance.snapshot({ full: true })),
      )
        .then(landed, failed)
        .catch(() => {});
    } catch (error) {
      failed(error);
    }
    return writing;
  };
  const writeIfDue = () => {
    if (dirty && now() - lastSaveAt >= saveIntervalMs(surveillance.claims.length))
      write();
  };
  const surveillance = new Surveillance({
    detector: surveillanceAgent,
    researcher: surveillanceAgent,
    now,
    probe,
    limits: { ...limits, verifyConcurrency: workers },
    onChange: (state) => {
      if (!muted) {
        dirty = true;
        writeIfDue();
      }
      publish(state);
    },
  });
  toldAs = tag(registry());
  // Changes made while muted are shown to the host but never written.
  const quietly = (change) => {
    muted = true;
    try {
      return change();
    } finally {
      muted = false;
    }
  };
  // A state that only exists between two steps of one operation is not announced to the host.
  const silently = (change) => {
    hushed = true;
    try {
      return change();
    } finally {
      hushed = false;
    }
  };
  // What the session received while its saved registry was being read is read now, from the activation's t0.
  const catchUp = () => {
    const session = getSession?.();
    if (surveillance.enabled && session?.watch)
      surveillance.observe(session.watch.snapshot());
  };
  const awaited = (id) => {
    let release;
    const settled = new Promise((resolve) => {
      release = resolve;
    });
    return { id, epoch, since: now(), settled, release };
  };
  // The wait is over, whatever ended it: flush() never hangs on a folder that does not answer.
  const drop = () => {
    const pending = adopting;
    adopting = null;
    pending?.release();
    return pending;
  };
  // Whatever was started for the folder bound until now moves nothing any more, and nothing is left to write.
  const expire = () => {
    epoch++;
    dirty = false;
    toldAs = "";
    refusedAs = null;
  };
  // The folder is let go, and what it did not take goes with it. An activation that was still waiting for the
  // registry its folder holds was provisional: it is never written, there or anywhere else. What was held
  // against the folder goes too: every caller then empties the registry in memory or replaces it with the one
  // its host read, so nothing built beside an unread file is left to write over it, and an archive reopened
  // after a slow or failed reading is not told unreadable, nor kept from being saved once resumed.
  const unbind = () => {
    store = null;
    bound = null;
    failing = null;
    overdue = null;
    unreadable = null;
    expire();
  };
  // An existing registry that cannot be read is neither resumed nor replaced: the surveillance goes on in
  // memory and says so in its published state, and the file is left exactly as it is.
  const tellUnread = () => {
    surveillance.fail(new Error(UNREAD));
    surveillance.emit();
  };
  const unread = (pending, error) => {
    if (adopting === pending) adopting = null;
    if (overdue === pending) overdue = null;
    unreadable = pending.id;
    persistence.failures++;
    persistence.lastError = `Registre existant illisible : ${String(error?.message || error).slice(0, 160)}`;
    tellUnread();
    catchUp();
    pending.release();
    announce();
  };
  // The folder ran out of time. Nothing says that its registry is unreadable: the surveillance goes on in
  // memory, unwritten, the answer is still awaited and the next activation reads the folder again.
  const outwaited = (pending) => {
    adopting = null;
    unreadable = pending.id;
    overdue = pending;
    persistence.failures++;
    persistence.lastError = "Registre existant non lu : lecture trop longue";
    catchUp();
    pending.release();
    announce();
  };
  // A registry is readable when it restores whole. One that parses but breaks half-way would leave a partial
  // history in memory, and then in its file: it is tried on a core of its own first.
  const restorable = (saved) => {
    try {
      new Surveillance({
        detector: surveillanceAgent,
        researcher: surveillanceAgent,
        now,
      }).restore(saved);
      return true;
    } catch {
      return false;
    }
  };
  // The folder has answered: `saved` is the registry it holds, null when it holds none. In time, it goes
  // under the activation. After its time, the same as long as that activation still runs: nothing has been
  // written for this session meanwhile (write() refuses it), and what was read since its t0 is read again
  // under the saved history. Stopped meanwhile: what is shown is left as it is, and the next activation reads
  // the folder again. A folder that holds nothing takes what the session has in memory, late or not.
  const answered = (pending, saved, error) => {
    const late = overdue === pending;
    // Superseded meanwhile: session ended or replaced, folder let go, or read again by a later activation.
    if (!current(pending) || (adopting !== pending && !late)) return;
    const whole =
      !error &&
      (saved == null ||
        (typeof saved === "object" &&
          saved.version === 1 &&
          saved.sessionId === pending.id &&
          restorable(saved)));
    if (!whole)
      return unread(pending, error || new Error("format ou session inattendus"));
    if (late && saved && !surveillance.enabled) return;
    if (late) overdue = null;
    else adopting = null;
    if (unreadable === pending.id) unreadable = null;
    if (saved && surveillance.enabled) {
      // The saved registry goes under the activation: restored first, then the same instruction is activated
      // again at its own t0, so claim-N, lot-N and act-N go on and the history is kept. The restored-and-stopped
      // state in between is neither announced nor written.
      silently(() => quietly(() => surveillance.restore(saved)));
      surveillance.start({ instruction: pending.instruction }, pending.snapshot);
    } else if (saved) {
      // Stopped while its folder was being read: the registry is shown as an archive, not rewritten.
      quietly(() => surveillance.restore(saved));
      dirty = false;
    } else {
      // The folder holds none: what the session has in memory is its registry, written from now on.
      dirty = true;
    }
    write();
    catchUp();
    pending.release();
    announce();
  };
  // start() answers at once and a session folder is read asynchronously, so the activation comes first and the
  // registry saved in the folder is put under it as soon as it is read. Until then nothing is read from the
  // programme, nothing is written and the published state says "restoring": the saved registry can be neither
  // overwritten nor renumbered, and the provisional activation is never taken for the final one.
  const adopt = (pending, source) => {
    Promise.resolve()
      .then(() => source.loadSurveillance())
      .then(
        (saved) => answered(pending, saved),
        (error) => answered(pending, null, error || new Error("lecture impossible")),
      )
      .catch((error) => {
        if (adopting === pending) adopting = null;
        surveillance.fail(error);
        surveillance.emit();
        pending.release();
        announce();
      });
  };
  // Final states are written at once; provider processes are released in the background. An activation that
  // follows starts none before the ones released here are gone: each Codex client waits for the process it left.
  const stop = (reason) => {
    const state = surveillance.stop(reason);
    write();
    if (!released) {
      released = true;
      releasing = Promise.resolve()
        .then(() => surveillanceAgent.close?.())
        .catch(() => {});
    }
    return told(state);
  };
  const flush = async () => {
    await adopting?.settled;
    write();
    return writing;
  };

  return {
    surveillance,
    agent: surveillanceAgent,
    persistence,
    start({ instruction } = {}) {
      const session = getSession?.();
      if (!session?.watch)
        throw new Error("Démarre une session avant d’activer la surveillance.");
      const snapshot = session.watch.snapshot();
      // The registry of a former session is closed in its own folder before this one is bound.
      if (surveillance.sessionId && surveillance.sessionId !== snapshot.id) {
        surveillance.stop("Session remplacée.");
        write();
      }
      const previous = store,
        formerly = bound,
        waiting = adopting;
      store = session.store || null;
      bound = snapshot.id;
      // The core holds this session's registry when it built it or when the host restored it. Otherwise the
      // folder may hold one (archive resumed then activated again, process restarted): it is read before
      // anything is written, set before the activation so that not even its first state reaches the file.
      // A folder that did not answer in time is read again, whatever the core holds since.
      const again = overdue?.id === snapshot.id;
      const pending =
        adopting?.id === snapshot.id
          ? adopting
          : (surveillance.sessionId !== snapshot.id || again) &&
              typeof store?.loadSurveillance === "function"
            ? awaited(snapshot.id)
            : null;
      adopting = pending;
      let state;
      const previousRefusal = refusedAs;
      if (formerly !== bound) refusedAs = null;
      try {
        state = surveillance.start({ instruction }, snapshot);
      } catch (error) {
        store = previous;
        bound = formerly;
        adopting = waiting;
        refusedAs = previousRefusal;
        throw error;
      }
      released = false;
      // Another folder: what the former one failed to take is not held against this one.
      if (formerly !== bound) failing = null;
      // A wait for another session is over: its folder is left as it is.
      if (waiting !== pending) waiting?.release();
      if (pending) {
        const reading = Boolean(pending.snapshot);
        // The latest instruction and t0 are the ones activated on top of the saved registry.
        Object.assign(pending, { instruction, snapshot });
        if (!reading) {
          // The reading that ran out of time is superseded by this one.
          if (again) overdue = null;
          adopt(pending, store);
        }
      } else if (unreadable === snapshot.id) {
        // Still not written: an activation on that session says it again.
        tellUnread();
        state = surveillance.snapshot();
      }
      // Warm-up off the critical path; the first reading reports a real connection failure itself.
      Promise.resolve()
        .then(() => surveillanceAgent.prepare?.(snapshot.id))
        .catch(() => {});
      return told(state);
    },
    stop,
    observe(snapshot) {
      // Held while the saved registry is read; catchUp() then reads everything since the activation.
      if (!adopting) surveillance.observe(snapshot);
    },
    tick() {
      const before = publications;
      try {
        if (adopting) {
          if (now() - adopting.since >= ADOPT_TIMEOUT_MS) outwaited(adopting);
          return;
        }
        surveillance.tick();
      } finally {
        writeIfDue();
        if (refusedAs !== null && publications === before)
          publish(surveillance.snapshot());
      }
    },
    retry(id) {
      return told(surveillance.retry(id));
    },
    snapshot(options) {
      return told(surveillance.snapshot(options));
    },
    // A reopened archive is displayed, not rewritten: a restored registry does not move until an activation,
    // which binds the folder itself. A surveillance still running on a former session is closed in its own
    // folder first; what that folder could not take is never written into the one opened now.
    // What a host hands over is held to the rule of a registry read here: one that does not restore whole
    // would leave half a history in memory, which the next activation would write over its file. It is not
    // shown; that activation finds nothing held, reads the folder itself and says what it finds.
    restore(saved) {
      stop("Session remplacée.");
      drop();
      unbind();
      const whole = restorable(saved);
      if (!whole) {
        persistence.failures++;
        persistence.lastError =
          "Registre existant illisible : registre remis à la réouverture non restaurable";
      }
      return told(quietly(() => surveillance.restore(whole ? saved : null)));
    },
    // Resolves once the last requested write has reached the store.
    flush,
    // Resolves with the state once the registry saved in the session folder has been read, or its reading
    // given up. A host that answers an activation with it shows "restoring" for a slow folder only.
    async ready(options) {
      while (adopting) await adopting.settled;
      return told(surveillance.snapshot(options));
    },
    // Session ended or replaced: back to idle. The folder keeps the registry as it was last written. An
    // activation still waiting for its saved registry has read nothing: the file is left as it is. Folder and
    // registry are let go before the last write is awaited: a tick or an activation arriving meanwhile finds
    // nothing of this session left to write, and is not wiped when that write lands.
    async reset(reason = "Session terminée.") {
      stop(reason);
      drop();
      unbind();
      const state = told(quietly(() => surveillance.reset()));
      await writing;
      return state;
    },
    async close(reason = "Session terminée.") {
      stop(reason);
      // Closed while its folder was still being read: the provisional registry goes with the wait, so that
      // neither a late tick nor a later activation can write it over the one it never read. Otherwise the
      // folder stays bound, and what its last write or a late answer brings back is no longer tried again.
      if (drop()) {
        unbind();
        quietly(() => surveillance.reset());
      } else expire();
      await writing;
      await releasing;
    },
  };
}
module.exports = {
  createSurveillanceRuntime,
  tickSurveillance,
  saveIntervalMs,
  REGISTRY_MESSAGES,
};
