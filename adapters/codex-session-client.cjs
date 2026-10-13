const { trace, safeError, isAuthFailure } = require("./chat-trace.cjs");
const fs = require("node:fs/promises");
const { CodexRpc } = require("./codex-rpc.cjs");
const {
  knownFeatures,
  codexVersion,
  featureArgs,
  skippedFeatures,
  subAgentArgs,
  inspectSubAgents,
  unconfirmedCause,
  subAgentFinding,
  subAgentRefusal,
  childEnvironment,
  createContext,
  inspectThread,
  assertRole,
  itemAllowed,
  SUB_AGENT_ITEMS,
  LEGACY_BLOCKED_ITEMS,
  APPROVAL_REQUESTS,
  toolArgumentsAllowed,
  validMediaInput,
  openedPages,
} = require("./codex-confinement.cjs");
// The product transport: a real Codex process. Anything else is the test seam (see `rpcFactory`).
const spawnRpc = (options) => new CodexRpc(options);
// How long Codex gets to confirm the end of a turn the guard refused, before its process goes.
const DRAIN_MS = 3000;
// What a connection is refused with while the process group of the one it replaces is not seen gone.
const STILL_RUNNING =
  "Arrêt du processus Codex précédent non confirmé : connexion refusée.";
// The answer of a transport asked whether its process group is gone, awaited by a host that stays alive
// for it. The timers of the transport never keep a host alive: one with nothing left to do ends at once,
// and what is left of the group is killed as it exits. A host that awaits the answer is not such a host,
// and without this it would end in the middle of the wait whenever the group outlives its launcher: its
// private tree left behind, and whatever it was about to do next (archive its session) never done. Held
// for as long as the transport takes to answer, which it bounds itself.
function exitOf(answer) {
  const hold = setInterval(() => {}, 1000);
  return Promise.resolve(answer).finally(() => clearInterval(hold));
}
// States a fact of the thread (no environment is bound to it); the control is technical, not this sentence.
const ROLE_SUFFIX =
  " Tu n’es pas un agent de programmation : ce fil n’a ni fichiers, ni terminal, ni connecteur.";
const reported = new Set();
// One line per distinct finding and per process: enough for a service journal, not a log flood.
function reportOnce(message) {
  if (reported.has(message)) return;
  reported.add(message);
  report(message);
}
function report(message) {
  try {
    process.stderr.write(message + "\n");
  } catch {}
}
function sourceKey(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
function streamedAnswer(json) {
  const match = json.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)/);
  if (!match) return "";
  try {
    return JSON.parse('"' + match[1] + '"');
  } catch {
    return "";
  }
}
class CodexSessionClient {
  constructor({
    binary = "codex",
    authHome,
    model = "",
    reasoningEffort = "low",
    // Names what this client is for: the ceiling of what it may be given, and the label of its traces.
    role = "chat",
    webSearch = false,
    toolDefinitions = [],
    baseInstructions = "",
    quota,
    maxRotations = 20,
    // TEST SEAM, the only one of this client. `rpcFactory` replaces the Codex process by a double;
    // `features` replaces the question asked to the installed binary. No host passes either one:
    // tests/codex-confinement.test.cjs scans the product code for it. A double given WITHOUT
    // `features` has no binary to ask and no configuration to read back: this client is then a
    // `transportDouble`, to which the refusal of an unconfirmed sub-agent block does not apply. It
    // never claims the block either: its state stays "not-blocked", `confined` false. A double given
    // WITH `features` (a fake binary, the probe recording around the real one) is refused exactly
    // like the product path.
    rpcFactory = spawnRpc,
    features,
    // Reversible settings. environmentAccess restores the default execution environment of a thread.
    // confinementMode comes from the environment only, never from a host:
    //   "enforce" (default): a connection is refused when the App Server contradicts the confinement
    //     asked, or when Codex does not confirm that sub-agent creation is blocked;
    //   "strict": also refuses a thread whose confinement the App Server does not state at all;
    //   "report": DIAGNOSTIC, NOT CONFINED. Nothing is refused; every connection writes what it lacks.
    environmentAccess = false,
    confinementMode = process.env.TVLENS_CODEX_CONFINEMENT || "enforce",
    itemGuard = process.env.TVLENS_CODEX_ITEM_GUARD || "allowlist",
  } = {}) {
    assertRole({ role, webSearch, toolDefinitions });
    // A mistyped setting is refused at start instead of running under another control than intended.
    if (!["enforce", "strict", "report"].includes(confinementMode))
      throw Error("Réglage TVLENS_CODEX_CONFINEMENT invalide.");
    if (!["allowlist", "legacy"].includes(itemGuard))
      throw Error("Réglage TVLENS_CODEX_ITEM_GUARD invalide.");
    const transportDouble = rpcFactory !== spawnRpc && features === undefined;
    Object.assign(this, {
      binary,
      authHome,
      model,
      reasoningEffort,
      role,
      webSearch,
      toolDefinitions,
      baseInstructions,
      quota,
      maxRotations,
      rpcFactory,
      transportDouble,
      // Asking the binary which flags it knows means running it: a transport double has none to ask.
      features: features || (transportDouble ? async () => null : knownFeatures),
      environmentAccess,
      confinementMode,
      itemGuard,
    });
    this.tail = Promise.resolve();
    this.opened = new Set();
    this.rotations = 0;
    // Threads this host opened on the current process; anything else is a sub-agent.
    this.threads = { own: new Set(), announced: new Set(), starting: 0 };
    // Set while a turn the guard refused is still ending inside Codex (see refuse).
    this.draining = null;
    // What this client last left: `{ rpc, dir, attempt }`, the transport it closed and its private tree,
    // until the process group was seen gone and the tree removed (see finish). One at most: nothing is
    // started for this client while it is there (see connect).
    this.leaving = null;
    // What the current connection really confirmed. `confined` is null until something was checked,
    // then true only when the last thread/start contradicts nothing AND Codex read back a setting
    // that blocks sub-agent creation (`subAgents`: "blocked", "not-blocked", "unknown"); otherwise
    // false, `reasons` naming what is contradicted or missing. See note().
    this.confinement = { mode: confinementMode, confined: null, verified: null, reasons: [], skippedFeatures: [], homeRedirected: null, subAgents: "unknown", subAgentControls: [] };
    this.noted = {};
    this.findings = [];
  }
  // The two halves of the state are checked at different times (the sub-agent block once per
  // process, the thread at every thread/start): `confined` and `reasons` are derived from both here,
  // so that a rotated thread never wipes out what the process failed to confirm.
  note(part) {
    const { thread, subAgents } = (this.noted = { ...this.noted, ...part });
    const open = Boolean(subAgents) && subAgents.subAgents !== "blocked";
    const reasons = [...(thread?.reasons || []), ...(open ? ["sous-agents"] : [])];
    this.confinement = {
      ...this.confinement,
      confined: open ? false : thread ? thread.confined : null,
      verified: thread ? thread.verified : null,
      reasons,
      ...(subAgents || { subAgents: "unknown", subAgentControls: [] }),
    };
  }
  trace(event, fields = {}) {
    if (this.webSearch || this.role === "surveillance") trace(event, {role:this.role,sessionId:this.sessionId,threadId:this.threadId,jobId:this.active?.jobId,turnId:this.active?.turnId,...fields});
  }
  answer(input) {
    const pending = this.tail.catch(() => {}).then(() => this.run(input));
    this.tail = pending;
    return pending;
  }
  // A fresh model context is a new thread, not a new process. Serialised with turns; never rejects.
  rotateThread() {
    const pending = this.tail.catch(() => {}).then(() => this.rotate());
    this.tail = pending;
    return pending;
  }
  // Resolves when the turn the guard refused has ended inside Codex, or as soon as `signal` aborts: a
  // turn cancelled while it waits answers its caller at once and sends nothing.
  drained(signal) {
    const draining = this.draining;
    if (!draining || !signal) return draining?.ended;
    return new Promise((resolve) => {
      const done = () => {
        signal.removeEventListener("abort", done);
        resolve();
      };
      signal.addEventListener("abort", done, { once: true });
      draining.ended.then(done);
      if (signal.aborted) done();
    });
  }
  async rotate() {
    if (this.draining) await this.draining.ended;
    const rpc = this.rpc,
      old = this.threadId,
      threads = this.threads;
    // Not connected, or still connecting: the next turn starts on a fresh thread anyway.
    if (!rpc || !this.ready || !old) return;
    try {
      if (this.rotations >= this.maxRotations) {
        // Bound what one process accumulates. The reconnect overlaps idle time; a turn arriving first awaits the same `ready`.
        const sessionId = this.sessionId,
          expected = (this.generation || 0) + 1;
        await this.close();
        // Someone else closed the client meanwhile: it must stay closed.
        if (this.generation === expected) this.prepare(sessionId).catch(() => {});
        return;
      }
      const result = await this.startThread(rpc, threads);
      if (this.rpc !== rpc) return;
      const threadId = result.thread.id;
      // A rotated thread is checked like the first one; a refusal closes the client (catch below).
      this.checkThread(result);
      this.threadId = threadId;
      this.opened.clear();
      this.rotations++;
      this.trace("thread.rotate.ack", {rotations:this.rotations});
      // Best effort, off the critical path: other App Server versions may not know this method.
      try {
        rpc.request("thread/unsubscribe", { threadId: old }).catch(() => {});
      } catch {}
    } catch {
      // Any failure falls back to the former behaviour: close, and the next turn reconnects.
      if (this.rpc === rpc) await this.close().catch(() => {});
    }
  }
  async prepare(sessionId) {
    // Another prepare can connect while this one is still closing a stale connection: re-check each time.
    while (this.ready || this.dir) {
      if (this.ready && this.sessionId === sessionId) return this.ready;
      const expected = (this.generation || 0) + 1;
      await this.close();
      // Closed by its owner meanwhile (another prepare would have set `ready`): it must stay closed.
      if (this.generation !== expected && !this.ready && !this.dir)
        throw Error("Connexion obsolète.");
    }
    this.sessionId = sessionId;
    this.trace("session.prepare");
    const connecting = this.connect();
    // connect() took its generation synchronously. A process dying during the handshake leaves it
    // unchanged, so its directory and dead transport are removed here; a close or a newer prepare
    // changes it, and the superseded connection must then leave its successor alone.
    const generation = this.generation;
    const ready = (this.ready = connecting.catch(async (e) => {
      if (this.generation === generation) await this.close();
      throw e;
    }));
    return ready;
  }
  async connect() {
    // close() can land during any await below: a superseded connection must leave neither a
    // process nor a directory behind (pre-warm and background reconnect make this reachable).
    const generation = (this.generation = (this.generation || 0) + 1);
    // One process group at a time. What this client last left is finished first, and nothing is started
    // for this connection, not even its private tree, before that group was seen gone and its tree
    // removed. A group that is still there after the bound of the transport refuses the connection, in so
    // many words: two generations of a role never run side by side, and the next connection asks again.
    if (this.leaving) {
      const gone = await this.finish();
      if (generation !== this.generation) throw Error("Connexion obsolète.");
      if (gone === false) throw Error(STILL_RUNNING);
    }
    // The tree is published on the client only once complete: a close landing meanwhile finds
    // nothing to remove, and this connection removes its own tree when it sees it was superseded.
    const tree = await createContext("tvlens-codex-session-", this.authHome);
    let known;
    try {
      if (generation !== this.generation) throw Error("Connexion obsolète.");
      known = await this.features(this.binary);
      if (generation !== this.generation) throw Error("Connexion obsolète.");
    } catch (error) {
      await fs.rm(tree.dir, { recursive: true, force: true });
      throw error;
    }
    this.dir = tree.dir;
    this.context = tree.context;
    const env = childEnvironment(process.env, {
      codexHome: tree.codexHome,
      home: tree.home,
    });
    const skipped = skippedFeatures(known);
    // Only the settings the installed binary accepts: a key it cannot place would stop it at start.
    const subAgentControls = subAgentArgs(known);
    this.noted = {};
    this.findings = [];
    this.confinement = { ...this.confinement, confined: null, verified: null, reasons: [], skippedFeatures: skipped, homeRedirected: env.HOME === tree.home, subAgents: "unknown", subAgentControls: [] };
    if (skipped.length)
      reportOnce(
        `TVLens : drapeaux Codex inconnus de ${this.binary}, non transmis : ${skipped.join(", ")}.`,
      );
    // Nothing to pass is nothing Codex could read back: decided here, before any process exists.
    // Rejects unless the mode is the diagnostic one; prepare() then removes the tree.
    let stated = subAgentControls.length ? null : inspectSubAgents(null, false);
    let unconfirmed = stated && this.checkSubAgents(stated, unconfirmedCause(known), generation);
    if (unconfirmed) await unconfirmed;
    const args = [
      "--no-daemon",
      "app-server",
      "--stdio",
      ...featureArgs(known),
      ...subAgentControls,
      "-c",
      `web_search="${this.webSearch ? "live" : "disabled"}"`,
      "-c",
      "project_doc_max_bytes=0",
      "-c",
      'history.persistence="none"',
    ];
    const rpc = this.rpcFactory({
      binary: this.binary,
      args,
      // Empty, and distinct from CODEX_HOME: the credentials are not inside the working directory.
      cwd: tree.context,
      env,
      onEvent: (m, p) => {
        if (this.rpc === rpc) this.event(m, p);
      },
      onRequest: (m, p) => {
        if (this.rpc !== rpc) throw Error("Connexion obsolète.");
        return this.tool(m, p);
      },
    });
    this.rpc = rpc;
    const threads = (this.threads = { own: new Set(), announced: new Set(), starting: 0 });
    rpc.start();
    await rpc.request("initialize", {
      clientInfo: { name: "tvlens", version: "0.3.0" },
      capabilities: { experimentalApi: true },
    });
    rpc.send({ method: "initialized", params: {} });
    // Read back BEFORE any thread exists: a connection that is refused has opened none. This costs one
    // round trip per connection (milliseconds on the version measured), two seconds at most when Codex
    // never answers. Throws like checkThread below: prepare() then closes the process and removes the tree.
    if (!stated) {
      stated = await this.readSubAgents(rpc);
      if (this.rpc !== rpc) throw Error("Connexion obsolète.");
      unconfirmed = this.checkSubAgents(stated, stated.subAgents === "unknown" ? "silent" : "unstated", generation);
      if (unconfirmed) await unconfirmed;
    }
    const result = await this.startThread(rpc, threads);
    if (this.rpc !== rpc) throw Error("Connexion obsolète.");
    const threadId = result.thread.id;
    // Throws when Codex contradicts the confinement.
    this.checkThread(result);
    // The diagnostic mode is never silent: every connection says that nothing was refused, and what
    // this one failed to confirm.
    if (this.confinementMode === "report")
      report(
        `TVLens : mode diagnostic TVLENS_CODEX_CONFINEMENT=report, connexion Codex « ${this.role} » ` +
          (this.findings.length
            ? `lancée NON CONFINÉE : ${this.findings.join(" ; ")}.`
            : "confirmée ; ce mode ne refuse rien et n’est pas confiné."),
      );
    this.threadId = threadId;
    this.trace("thread.start.ack", {model:this.model,webSearch:this.webSearch});
    this.opened.clear();
    return this.threadId;
  }
  // Opens a thread and records it as the host's own. Codex announces a thread (`thread/started`)
  // right behind its answer, and the transport may dispatch that notification before this
  // continuation runs: an id announced meanwhile is only judged here, once the answer names ours.
  async startThread(rpc, threads) {
    threads.starting++;
    let result;
    try {
      result = await rpc.request("thread/start", this.threadParams());
    } finally {
      threads.starting--;
    }
    threads.own.add(result.thread.id);
    const foreign = [...threads.announced].some((id) => !threads.own.has(id));
    threads.announced.clear();
    if (foreign && this.rpc === rpc) {
      this.foreignThread();
      throw Error("Outil hors du périmètre TVLens (fil étranger).");
    }
    return result;
  }
  // A thread the host did not open is a sub-agent: its items are not this thread's and so escape
  // the allow-list. The process goes with it, turn or no turn; the next turn reconnects.
  foreignThread() {
    this.trace("guard.refused", {kind:"thread"});
    reportOnce("TVLens : fil Codex non ouvert par l’application (sous-agent), processus fermé.");
    this.active?.reject(Error("Outil hors du périmètre TVLens (fil étranger)."));
    this.ready = null;
    this.rpc?.close();
  }
  threadParams() {
    return {
      cwd: this.context,
      approvalPolicy: "never",
      sandbox: "read-only",
      // "read-only" still lets a command read the whole disk. Without any execution environment the
      // runtime offers no command and no patch surface at all (measured: probe-confinement).
      ...(this.environmentAccess ? {} : { environments: [] }),
      ephemeral: true,
      model: this.model || null,
      dynamicTools: this.toolDefinitions,
      baseInstructions: this.baseInstructions + ROLE_SUFFIX,
      config: { web_search: this.webSearch ? "live" : "disabled" },
    };
  }
  // The request is not the proof: the App Server states the policy it really applies.
  checkThread(result) {
    const report = inspectThread(result, {
      environmentAccess: this.environmentAccess,
    });
    this.note({ thread: report });
    if (report.confined && report.verified) return;
    const detail = report.confined
      ? "non vérifié (réponse de thread/start incomplète)"
      : `contredit par l’App Server (${report.reasons.join(", ")})`;
    this.trace("confinement", {confined:report.confined,verified:report.verified,reasons:report.reasons,mode:this.confinementMode});
    this.findings.push(`fil ${detail}`);
    reportOnce(`TVLens : confinement Codex ${detail}.`);
    // Same rule as for sub-agents: on the real transport an answer that does not state the policy is not a
    // confirmation, and the product does not run on an unconfirmed one. Only the test seam (a transport
    // double answering a bare thread id) keeps the former tolerance; "report" is the named diagnostic mode.
    if (
      this.confinementMode !== "report" &&
      (!report.confined || this.confinementMode === "strict" || !this.transportDouble)
    )
      throw Error(
        report.confined
          ? "Confinement Codex non confirmé (réponse de thread/start incomplète) : connexion refusée. Cette version de Codex ne confirme pas l’absence d’environnement d’exécution du fil. Mets Codex à jour (comportement mesuré sur 0.160.1), ou active explicitement le mode diagnostic TVLENS_CODEX_CONFINEMENT=report, qui n’est pas confiné."
          : `Confinement Codex non confirmé (${report.reasons.join(", ")}).`,
      );
  }
  // Passing a setting is not the proof either: the App Server states the configuration it runs with.
  // Never rejects; holds the connection two seconds at most.
  async readSubAgents(rpc) {
    try {
      return inspectSubAgents((await rpc.request("config/read", { includeLayers: false }, 2000))?.config);
    } catch {
      return inspectSubAgents(null);
    }
  }
  // Refuses the connection unless Codex itself confirmed that no sub-agent can be created: the guard
  // against foreign threads only reacts once one exists, which is not the confinement asked. No
  // silent fallback: the only way to run without the confirmation is the diagnostic mode, which
  // says so at every connection. The transport double of the tests is the one exemption (constructor).
  // Returns nothing when the block is confirmed (no tick is added to such a connection), otherwise a
  // promise that rejects with the refusal, or resolves in diagnostic mode.
  checkSubAgents(stated, cause, generation) {
    this.note({ subAgents: stated });
    if (stated.subAgents === "blocked") return null;
    if (this.transportDouble) {
      this.findings.push("blocage des sous-agents non vérifiable (doublure de transport des tests)");
      return null;
    }
    return this.unconfirmedSubAgents(stated, cause, generation);
  }
  async unconfirmedSubAgents(stated, cause, generation) {
    this.trace("confinement", {subAgents:stated.subAgents,cause,mode:this.confinementMode});
    const finding = { version: await codexVersion(this.binary), cause };
    // A close can land while the installed version is being asked.
    if (generation !== this.generation) throw Error("Connexion obsolète.");
    if (this.confinementMode === "report") {
      this.findings.push(`blocage des sous-agents non confirmé, ${subAgentFinding(finding)}`);
      return;
    }
    const message = subAgentRefusal(finding);
    reportOnce(`TVLens : ${message}`);
    throw Error(message);
  }
  // Ends the turn on anything outside the role and asks Codex to stop it. Once per turn.
  refuse(active, kind, turnId = active.turnId) {
    if (active.refused) return;
    active.refused = true;
    const label = String(kind).replace(/[^A-Za-z0-9_./-]/g, "").slice(0, 60);
    this.trace("guard.refused", {kind:label});
    active.reject(Error(`Outil hors du périmètre TVLens (${label}).`));
    // The caller is answered now, but the turn is still running inside Codex. Until Codex reports
    // its end, no other turn starts on this client: with no turn id of its own yet, the next turn
    // would take the late `turn/completed (interrupted)` of this one for its own outcome.
    const rpc = this.rpc;
    const draining = (this.draining = { turnId });
    draining.ended = new Promise((resolve) => {
      draining.end = () => {
        clearTimeout(draining.timer);
        if (this.draining === draining) this.draining = null;
        resolve();
      };
    });
    draining.timer = setTimeout(() => {
      // Never confirmed: the process goes, as for a cancelled turn that does not stop.
      if (this.rpc === rpc) {
        this.ready = null;
        rpc?.close();
      }
      draining.end();
    }, DRAIN_MS);
    draining.timer.unref?.();
    try {
      rpc
        .request("turn/interrupt", { threadId: this.threadId, turnId })
        .catch(() => {});
    } catch {
      draining.end();
    }
  }
  // Every request Codex sends to the host lands here: only a declared video tool, for the running
  // turn of this thread, is served. Approvals, user prompts and elicitations are never granted.
  async tool(method, p) {
    const active = this.active;
    if (method !== "item/tool/call") {
      // An approval request means the runtime attempted a command, a patch or a permission change.
      if (active && this.itemGuard !== "legacy" && APPROVAL_REQUESTS.includes(method))
        this.refuse(active, method, active.turnId || p?.turnId);
      throw Error("Outil non autorisé.");
    }
    if (
      !active ||
      p?.threadId !== this.threadId ||
      p.turnId !== active.turnId ||
      active.signal.aborted ||
      p.namespace != null ||
      !this.toolDefinitions.some((t) => t.name === p.tool) ||
      !toolArgumentsAllowed(p.arguments)
    )
      throw Error("Outil non autorisé.");
    active.onProgress?.({
      message: {
        search_moments: "Recherche dans la mémoire…",
        get_transcript: "Lecture des paroles observées…",
        inspect_clip: "Réexamen des images et du son…",
      }[p.tool],
    });
    this.trace("tool.started", {tool:p.tool});
    try {
      const value = await active.tools.call(p.tool, p.arguments);
      active.signal.throwIfAborted();
      active.audit.push({ tool: p.tool, status: "completed" });
      this.trace("tool.completed", {tool:p.tool,status:"completed"});
      return {
        success: true,
        contentItems: [{ type: "inputText", text: JSON.stringify(value) }],
      };
    } catch (e) {
      active.audit.push({ tool: p.tool, status: "failed" });
      this.trace("tool.completed", {tool:p.tool,status:"failed",error:safeError(e)});
      return {
        success: false,
        contentItems: [{ type: "inputText", text: e.message }],
      };
    }
  }
  event(method, p) {
    const active = this.active;
    if (["turn/started","turn/completed","error","connection/closed"].includes(method)) {
      this.trace(method, {eventThreadId:p?.threadId,eventTurnId:p?.turn?.id || p?.turnId,
        status:p?.turn?.status,error:safeError(p?.turn?.error || p?.error),willRetry:p?.willRetry,
        active:Boolean(active),hadFinal:Boolean(active?.final),textChars:active?.text?.length || 0});
    }
    if (["item/started","item/completed"].includes(method) && p?.item?.type === "webSearch") {
      this.trace(method,{eventThreadId:p.threadId,eventTurnId:p.turnId,itemId:p.item.id,
        itemType:"webSearch",actionType:p.item.action?.type,status:p.item.status,error:safeError(p.item.error)});
    }
    if (method === "connection/closed") {
      this.ready = null;
      this.draining?.end();
      active?.reject(
        Error("Connexion Codex interrompue. Réessaie la question."),
      );
      return;
    }
    // Any notification naming a thread the host did not open, during a turn or between two turns:
    // a sub-agent. Its items would be dropped by the filter below and so escape every guard.
    const eventThread = p?.thread?.id || p?.threadId;
    if (
      this.itemGuard !== "legacy" &&
      typeof eventThread === "string" &&
      eventThread !== this.threadId &&
      !this.threads.own.has(eventThread)
    ) {
      // One of the host's own thread/start is unanswered: startThread judges this id.
      if (this.threads.starting) this.threads.announced.add(eventThread);
      else this.foreignThread();
      return;
    }
    // The end of a turn the guard refused frees the client for the next one.
    const draining = this.draining;
    if (
      draining &&
      method === "turn/completed" &&
      p?.threadId === this.threadId &&
      (!draining.turnId || draining.turnId === p.turn?.id)
    )
      draining.end();
    if (!active || p?.threadId !== this.threadId) return;
    if (method === "turn/started" && !active.turnId) active.turnId = p.turn.id;
    if (p.turnId && active.turnId && p.turnId !== active.turnId) return;
    if (method === "item/started" || method === "item/completed") {
      const allowed =
        this.itemGuard === "legacy"
          ? method !== "item/started" ||
            !LEGACY_BLOCKED_ITEMS.includes(p.item?.type)
          : itemAllowed(this, p.item);
      if (!allowed) {
        this.refuse(active, p.item?.type, active.turnId || p.turnId);
        // The item says a sub-agent exists, whatever its own thread shows or not: the process goes,
        // as for a foreign thread. Interrupting the host turn alone would leave it running.
        if (this.itemGuard !== "legacy" && SUB_AGENT_ITEMS.includes(p.item?.type)) this.foreignThread();
        return;
      }
    }
    // Codex reports failure detail (e.g. responseStreamDisconnected) in separate "error" notifications
    // before turn/completed. Keep the last one, redacted, as fallback diagnostic for the turn outcome.
    if (method === "error" && p.error) active.lastError = safeError(p.error);
    if (method === "item/started") {
      const item = p.item;
      if (item.type === "webSearch")
        active.onProgress?.({
          message:
            item.action?.type === "openPage"
              ? "Consultation d’une source…"
              : "Recherche sur Internet…",
        });
      else if (item.type === "agentMessage")
        active.onProgress?.({ message: "Rédaction de la réponse…" });
      else if (item.type === "reasoning")
        active.onProgress?.({ message: "Codex examine le contexte…" });
    }
    // No raw reasoning is emitted. Only tool lifecycle, concise status and final-answer deltas.
    if (method === "item/agentMessage/delta") {
      active.text += p.delta;
      const text = streamedAnswer(active.text);
      if (text && Date.now() - active.lastPreview > 80) {
        active.lastPreview = Date.now();
        active.onProgress?.({
          message: "Rédaction de la réponse…",
          preview: text,
        });
      }
    }
    if (method === "item/completed") {
      const item = p.item;
      if (item.type === "webSearch") {
        // One audit entry per page really opened: a single open may render several pages and the
        // model cites any of them. A search opens nothing: it keeps one entry, credited no page.
        const pages = openedPages(item);
        (pages.length ? pages : [item.action?.url]).forEach((url, index) => {
          const key = pages.length ? sourceKey(url) : null;
          if (key) {
            this.opened.add(key);
            active.onProgress?.({
              message: "Source consultée : " + new URL(url).hostname,
            });
          }
          active.audit.push({
            action: item.action?.type,
            tool: "web_search",
            url,
            status: "completed",
            ...(item.id ? { itemId: item.id } : {}),
            // Stated by the client, whatever the action is called: this entry is a page really opened.
            ...(key ? { opened: true } : {}),
            // Further pages of the same call: not another search.
            ...(index ? { grouped: true } : {}),
          });
        });
      }
      if (
        item.type === "agentMessage" &&
        item.phase === "commentary" &&
        item.text
      )
        active.onProgress?.({ provisional: item.text.slice(0, 1600) });
      if (item.type === "agentMessage" && item.phase !== "commentary")
        active.final = item.text;
    }
    if (
      method === "turn/completed" &&
      (!active.turnId || p.turn.id === active.turnId)
    ) {
      if (p.turn.status !== "completed") {
        // Keep the raw turn outcome, redacted, so the job can store a usable diagnostic.
        const detail = safeError(p.turn.error) || active.lastError;
        const authRequired =
          p.turn.status !== "interrupted" && isAuthFailure(detail);
        const error = Error(
          p.turn.status === "interrupted"
            ? "Recherche annulée."
            : authRequired
              ? "Codex n’a pas terminé la réponse : authentification refusée (401). Reconnexion Codex requise (codex login), puis repose la question."
              : "Codex n’a pas terminé la réponse.",
        );
        error.turnStatus = p.turn.status;
        if (detail) error.turnError = detail;
        if (authRequired) error.authRequired = true;
        active.reject(error);
      } else active.resolve(active.final || active.text);
    }
  }
  async run({
    jobId,
    sessionId,
    instructions,
    tools,
    signal,
    onProgress,
    mediaInput = [],
    outputSchema,
  }) {
    // A turn the guard refused is still ending inside Codex: wait for its end (bounded, see refuse),
    // or for this turn's own cancellation, whichever comes first.
    if (this.draining) await this.drained(signal);
    signal.throwIfAborted();
    // Checked before anything is connected or sent: a path or a remote URL never reaches turn/start.
    if (!validMediaInput(mediaInput)) throw Error("Entrée média non autorisée.");
    const started = Date.now();
    // Cold when this turn has to wait for a connection: none yet, another session, or a reconnect still in flight.
    const coldStart =
      !this.ready || !this.threadId || this.sessionId !== sessionId;
    onProgress?.({
      message: this.ready
        ? "Lecture du contexte de la session…"
        : "Connexion à Codex…",
    });
    await this.prepare(sessionId);
    const connectMs = coldStart ? Date.now() - started : 0;
    signal.throwIfAborted();
    // Informational only (see codex-quota): never awaited on the turn path, never able to fail the turn.
    try {
      Promise.resolve(this.quota?.check(this.rpc)).catch(() => {});
    } catch {}
    let resolve, reject;
    const done = new Promise((a, b) => {
      resolve = a;
      reject = b;
    });
    done.catch(() => {});
    const active = (this.active = {
      jobId,
      tools,
      signal,
      onProgress,
      resolve,
      reject,
      audit: [],
      text: "",
      final: "",
      lastPreview: 0,
      turnId: null,
    });
    let abortedAt = 0;
    const abort = () => {
      abortedAt ||= Date.now();
      this.trace("abort.requested",{error:safeError(signal.reason)});
      onProgress?.({ message: "Annulation…" });
      if (active.turnId)
        this.rpc
          .request("turn/interrupt", {
            threadId: this.threadId,
            turnId: active.turnId,
          })
          .catch(() => {});
    };
    signal.addEventListener("abort", abort, { once: true });
    let watchdog;
    try {
      this.trace("turn.start.request",{model:this.model});
      const response = await this.rpc.request("turn/start", {
        threadId: this.threadId,
        input: [{ type: "text", text: instructions }, ...mediaInput],
        model: this.model || null,
        effort: this.reasoningEffort,
        summary: "none",
        outputSchema,
      });
      active.turnId = response.turn.id;
      this.trace("turn.start.ack",{status:response.turn.status});
      if (signal.aborted) abort();
      const interrupted = new Promise((_, fail) => {
        const check = () => {
          watchdog = setTimeout(() => {
            if (signal.aborted && Date.now() - abortedAt >= 3000) {
              this.trace("watchdog.close");
              this.rpc.close();
              fail(signal.reason);
            } else check();
          }, 1000);
        };
        check();
      });
      const raw = await Promise.race([done, interrupted]);
      signal.throwIfAborted();
      const result = JSON.parse(raw);
      return {
        ...result,
        audit: active.audit,
        threadId: this.threadId,
        elapsedMs: Date.now() - started,
        coldStart,
        connectMs,
      };
    } catch (error) {
      this.trace("turn.rejected",{error:safeError(error),auditCount:active.audit.length});
      // A 401 means the cached auth is stale: drop this session so the next question reconnects
      // with refreshed credentials. No automatic retry of the failed turn.
      if (error?.authRequired) this.ready = null;
      throw error;
    } finally {
      this.trace("turn.finished",{aborted:signal.aborted});
      clearTimeout(watchdog);
      signal.removeEventListener("abort", abort);
      if (this.active === active) this.active = null;
    }
  }
  // Finishes what this client left: its transport is asked, again if need be, whether its process group
  // is gone, and only then is its private tree removed, never under a group that may still be running.
  // One attempt at a time, shared by every close() and every connection that arrives meanwhile. Answers
  // false while the group is not seen gone after the bound of the transport: the journal says so, and
  // transport and tree are kept for the next attempt. A transport double that answers nothing is not
  // waited for; one that answers a promise has to settle it.
  finish() {
    const left = this.leaving;
    if (left.attempt) return left.attempt;
    const attempt = (left.attempt = (async () => {
      const answer = left.rpc?.close();
      if (answer && (await exitOf(answer)) === false) {
        reportOnce(
          `TVLens : arrêt du processus Codex « ${this.role} » non confirmé. Son arbre privé est conservé et ce rôle ne se reconnecte pas tant que son groupe n’est pas vu parti.`,
        );
        return false;
      }
      try {
        if (left.dir) await fs.rm(left.dir, { recursive: true, force: true });
      } finally {
        if (this.leaving === left) this.leaving = null;
      }
      return true;
    })());
    // Over, whatever it answered: the next one to ask starts another attempt.
    const over = () => {
      if (left.attempt === attempt) left.attempt = null;
    };
    attempt.then(over, over);
    return attempt;
  }
  // Closes the connection, not the client: a later prepare() or turn connects again, once what was left
  // here is finished. Every way a transport is left ends here before a reconnection: prepare() closes
  // what the guard, the drain or the watchdog closed first, and a transport closed twice answers for the
  // same process group. Closings that overlap share one closing: each invalidates what is running, and
  // each resolves once the process has left and its private tree is removed, or once the journal says
  // that the group is not seen gone. It never rejects for that, so that a session can still be archived.
  async close() {
    this.generation = (this.generation || 0) + 1;
    this.active?.reject(Error("Session Codex fermée."));
    this.draining?.end();
    const rpc = this.rpc,
      dir = this.dir;
    this.rpc = null;
    this.ready = null;
    this.threadId = null;
    this.rotations = 0;
    this.opened.clear();
    this.context = null;
    this.dir = null;
    if (rpc || dir) this.leaving = { rpc, dir, attempt: null };
    if (this.leaving) await this.finish();
  }
}
module.exports = { CodexSessionClient, streamedAnswer, sourceKey };
