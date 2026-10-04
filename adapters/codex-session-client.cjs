const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { CodexRpc } = require("./codex-rpc.cjs");
const { isolatedEnvironment } = require("./codex-verifier.cjs");
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
    webSearch = false,
    toolDefinitions = [],
    baseInstructions = "",
    quota,
    rpcFactory = (options) => new CodexRpc(options),
  } = {}) {
    Object.assign(this, {
      binary,
      authHome,
      model,
      reasoningEffort,
      webSearch,
      toolDefinitions,
      baseInstructions,
      quota,
      rpcFactory,
    });
    this.tail = Promise.resolve();
    this.opened = new Set();
  }
  answer(input) {
    const pending = this.tail.catch(() => {}).then(() => this.run(input));
    this.tail = pending;
    return pending;
  }
  async prepare(sessionId) {
    if (this.ready && this.sessionId === sessionId) return this.ready;
    if (this.ready || this.dir) await this.close();
    this.sessionId = sessionId;
    this.ready = this.connect().catch(async (e) => {
      await this.close();
      throw e;
    });
    return this.ready;
  }
  async connect() {
    this.dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "tvlens-codex-session-"),
    );
    const home = path.join(this.dir, "home");
    await fs.mkdir(home, { mode: 0o700 });
    const authHome =
      this.authHome ||
      process.env.CODEX_HOME ||
      path.join(os.homedir(), ".codex");
    for (const name of ["auth.json", "models_cache.json"]) {
      const source = path.join(authHome, name);
      try {
        await fs.access(source);
        await fs.symlink(source, path.join(home, name));
      } catch {}
    }
    const args = ["--no-daemon", "app-server", "--stdio"];
    for (const feature of [
      "shell_tool",
      "unified_exec",
      "shell_snapshot",
      "apps",
      "plugins",
      "hooks",
      "computer_use",
      "browser_use",
      "view_image",
      "image_generation",
      "multi_agent",
      "memories",
      "skill_search",
    ])
      args.push("--disable", feature);
    args.push(
      "--enable",
      "skip_host_skill_discovery",
      "-c",
      `web_search="${this.webSearch ? "live" : "disabled"}"`,
      "-c",
      "project_doc_max_bytes=0",
      "-c",
      'history.persistence="none"',
    );
    const rpc = this.rpcFactory({
      binary: this.binary,
      args,
      cwd: this.dir,
      env: isolatedEnvironment(process.env, home),
      onEvent: (m, p) => {
        if (this.rpc === rpc) this.event(m, p);
      },
      onRequest: (m, p) => {
        if (this.rpc !== rpc) throw Error("Connexion obsolète.");
        return this.tool(m, p);
      },
    });
    this.rpc = rpc;
    rpc.start();
    await this.rpc.request("initialize", {
      clientInfo: { name: "tvlens", version: "0.3.0" },
      capabilities: { experimentalApi: true },
    });
    this.rpc.send({ method: "initialized", params: {} });
    const result = await this.rpc.request("thread/start", {
      cwd: this.dir,
      approvalPolicy: "never",
      sandbox: "read-only",
      ephemeral: true,
      model: this.model || null,
      dynamicTools: this.toolDefinitions,
      baseInstructions:
        this.baseInstructions +
        "  Réponds aux questions avec la mémoire fournie et les outils autorisés. Aucun travail de programmation. Aucun accès fichiers, shell ou connecteur.",
      config: { web_search: this.webSearch ? "live" : "disabled" },
    });
    this.threadId = result.thread.id;
    this.opened.clear();
    return this.threadId;
  }
  async tool(method, p) {
    const active = this.active;
    if (
      method !== "item/tool/call" ||
      !active ||
      p.threadId !== this.threadId ||
      p.turnId !== active.turnId ||
      active.signal.aborted ||
      !this.toolDefinitions.some((t) => t.name === p.tool)
    )
      throw Error("Outil non autorisé.");
    active.onProgress?.({
      message: {
        search_moments: "Recherche dans la mémoire…",
        get_transcript: "Lecture des paroles observées…",
        inspect_clip: "Réexamen des images et du son…",
      }[p.tool],
    });
    try {
      const value = await active.tools.call(p.tool, p.arguments);
      active.signal.throwIfAborted();
      active.audit.push({ tool: p.tool, status: "completed" });
      return {
        success: true,
        contentItems: [{ type: "inputText", text: JSON.stringify(value) }],
      };
    } catch (e) {
      active.audit.push({ tool: p.tool, status: "failed" });
      return {
        success: false,
        contentItems: [{ type: "inputText", text: e.message }],
      };
    }
  }
  event(method, p) {
    const active = this.active;
    if (method === "connection/closed") {
      this.ready = null;
      active?.reject(
        Error("Connexion Codex interrompue. Réessaie la question."),
      );
      return;
    }
    if (!active || p.threadId !== this.threadId) return;
    if (method === "turn/started" && !active.turnId) active.turnId = p.turn.id;
    if (p.turnId && active.turnId && p.turnId !== active.turnId) return;
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
      else if (
        [
          "commandExecution",
          "fileChange",
          "collabAgentToolCall",
          "mcpToolCall",
        ].includes(item.type)
      ) {
        active.reject(Error("Outil hors du périmètre TVLens."));
        this.rpc
          .request("turn/interrupt", {
            threadId: this.threadId,
            turnId: active.turnId,
          })
          .catch(() => {});
      }
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
        const url = item.action?.url;
        if (sourceKey(url)) {
          this.opened.add(sourceKey(url));
          active.onProgress?.({
            message: "Source consultée : " + new URL(url).hostname,
          });
        }
        active.audit.push({
          action: item.action?.type,
          tool: "web_search",
          url,
          status: "completed",
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
      if (p.turn.status !== "completed")
        active.reject(
          Error(
            p.turn.status === "interrupted"
              ? "Recherche annulée."
              : "Codex n’a pas terminé la réponse.",
          ),
        );
      else active.resolve(active.final || active.text);
    }
  }
  async run({
    sessionId,
    instructions,
    tools,
    signal,
    onProgress,
    mediaInput = [],
    outputSchema,
  }) {
    signal.throwIfAborted();
    const started = Date.now();
    onProgress?.({
      message: this.ready
        ? "Lecture du contexte de la session…"
        : "Connexion à Codex…",
    });
    await this.prepare(sessionId);
    signal.throwIfAborted();
    await this.quota?.check(this.rpc);
    signal.throwIfAborted();
    let resolve, reject;
    const done = new Promise((a, b) => {
      resolve = a;
      reject = b;
    });
    done.catch(() => {});
    const active = (this.active = {
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
      const response = await this.rpc.request("turn/start", {
        threadId: this.threadId,
        input: [{ type: "text", text: instructions }, ...mediaInput],
        model: this.model || null,
        effort: this.reasoningEffort,
        summary: "none",
        outputSchema,
      });
      active.turnId = response.turn.id;
      if (signal.aborted) abort();
      const interrupted = new Promise((_, fail) => {
        const check = () => {
          watchdog = setTimeout(() => {
            if (signal.aborted && Date.now() - abortedAt >= 3000) {
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
      };
    } finally {
      clearTimeout(watchdog);
      signal.removeEventListener("abort", abort);
      if (this.active === active) this.active = null;
    }
  }
  async close() {
    this.active?.reject(Error("Session Codex fermée."));
    const rpc = this.rpc;
    this.rpc = null;
    this.ready = null;
    this.threadId = null;
    rpc?.close();
    this.opened.clear();
    if (this.dir) {
      const dir = this.dir;
      this.dir = null;
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}
module.exports = { CodexSessionClient, streamedAnswer, sourceKey };
