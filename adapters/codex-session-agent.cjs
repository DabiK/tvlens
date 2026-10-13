const {
  CodexSessionClient,
  streamedAnswer,
  sourceKey,
} = require("./codex-session-client.cjs");
const {
  schema,
  buildPrompt,
  companionPersona,
} = require("./companion-prompt.cjs");
const { dynamicTools } = require("./codex-tool-definitions.cjs");

// Conversation policy: memory deltas, source provenance and one bounded repair.
// Process, RPC, streaming and cancellation belong to CodexSessionClient.
class CodexSessionAgent {
  constructor({ client, ...options } = {}) {
    this.webSearch = options.webSearch ?? true;
    this.client =
      client ||
      new CodexSessionClient({
        ...options,
        webSearch: this.webSearch,
        toolDefinitions: dynamicTools,
        baseInstructions: companionPersona,
      });
    this.sent = new Map();
    this.tail = Promise.resolve();
  }

  get model() {
    return this.client.model;
  }
  set model(value) {
    this.client.model = value;
  }
  get authHome() {
    return this.client.authHome;
  }
  set authHome(value) {
    this.client.authHome = value;
  }

  get rpc() {
    return this.client.rpc;
  }

  async prepare(sessionId) {
    if (this.client.sessionId !== sessionId || !this.client.ready)
      this.sent.clear();
    return this.client.prepare(sessionId);
  }

  answer(input) {
    const pending = this.tail.catch(() => {}).then(() => this.run(input));
    this.tail = pending;
    return pending;
  }

  async run({
    jobId,
    question,
    tools,
    signal,
    context,
    conversation = [],
    mode = "chat",
    // The viewer's standing instruction, when one is active. Never built from programme content.
    instruction,
    onProgress,
    sourceRepair = false,
  }) {
    signal.throwIfAborted();
    const started = Date.now();
    // The connection is made here, before the client's turn: its cost belongs to this question.
    const coldStart =
      !this.client.ready ||
      !this.client.threadId ||
      this.client.sessionId !== tools.sessionId;
    await this.prepare(tools.sessionId);
    const connectMs = coldStart ? Date.now() - started : 0;
    const fresh = context
      ? {
          ...context,
          passages: context.passages.filter(
            (p) => this.sent.get(p.id) !== JSON.stringify(p),
          ),
        }
      : context;
    // The role text already lives in the thread (baseInstructions): a turn only adds its mode, the
    // viewer's words and the data block. Pages already opened travel as data, not as instructions.
    const instructions = buildPrompt({
      question,
      tools,
      context: fresh,
      conversation: this.sent.size ? [] : conversation,
      mode,
      instruction,
      openedUrls: [...this.client.opened],
      sourceRepair,
      inThread: true,
    });
    const result = await this.client.answer({
      jobId,
      sessionId: tools.sessionId,
      instructions,
      tools,
      signal,
      onProgress,
      outputSchema: schema,
    });
    if (
      typeof result.answer !== "string" ||
      !Array.isArray(result.citations) ||
      !Array.isArray(result.limits)
    ) {
      throw Error("Réponse Codex invalide.");
    }
    for (const passage of context?.passages || [])
      this.sent.set(passage.id, JSON.stringify(passage));
    const sources = (result.sources || [])
      .filter(
        (s) =>
          sourceKey(s.url) &&
          this.client.opened.has(sourceKey(s.url)) &&
          typeof s.title === "string" &&
          typeof s.evidence === "string",
      )
      .slice(0, 6);
    const sourceValidation = {
      proposed: (result.sources || []).length,
      accepted: sources.length,
      rejected: (result.sources || [])
        .filter((s) => !sources.includes(s))
        .map((s) => ({
          url: s.url,
          reason: "URL non consultée ou source mal formée",
        })),
    };
    if (
      mode === "chat" &&
      this.webSearch &&
      !sourceRepair &&
      !sources.length &&
      (result.kind === "external" || sourceValidation.proposed)
    ) {
      onProgress?.({ message: "Confirmation des liens sources…" });
      const repaired = await this.run({
        jobId,
        question,
        tools,
        signal,
        context,
        conversation,
        mode,
        instruction,
        onProgress,
        sourceRepair: true,
      });
      return {
        ...repaired,
        audit: [...result.audit, ...(repaired.audit || [])],
        sourceRepair: { initial: sourceValidation },
        elapsedMs: Date.now() - started,
        coldStart,
        connectMs,
      };
    }
    return {
      ...result,
      sources,
      sourceValidation,
      sourcesReused: result.audit.some((x) => x.tool === "web_search")
        ? 0
        : sources.length,
      model: this.model || "default",
      elapsedMs: Date.now() - started,
      coldStart,
      connectMs,
    };
  }

  async close() {
    this.sent.clear();
    await this.client.close();
  }
}
module.exports = { CodexSessionAgent, streamedAnswer, dynamicTools };
