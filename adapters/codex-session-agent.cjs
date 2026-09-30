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
    question,
    tools,
    signal,
    context,
    conversation = [],
    mode = "chat",
    onProgress,
    sourceRepair = false,
  }) {
    signal.throwIfAborted();
    const started = Date.now();
    await this.prepare(tools.sessionId);
    const fresh = context
      ? {
          ...context,
          passages: context.passages.filter(
            (p) => this.sent.get(p.id) !== JSON.stringify(p),
          ),
        }
      : context;
    let instructions = buildPrompt({
      question,
      tools,
      context: fresh,
      conversation: this.sent.size ? [] : conversation,
      mode,
    });
    instructions +=
      "\nLes passages fournis sont une mise à jour de la même session : conserve ceux déjà lus, mais ne suppose pas une continuité pendant les pauses. Réutilise le contexte du fil pour les relances ; ne refais pas une recherche déjà suffisante. Les médias anciens peuvent avoir expiré.";
    instructions +=
      "\nURLs dont la consultation a été observée dans ce fil (seules ces URLs peuvent être réutilisées sans nouvelle ouverture) : " +
      JSON.stringify([...this.client.opened]) +
      ". Pour toute autre source, ouvre sa véritable URL HTTPS avec le web, pas seulement un identifiant interne de résultat. Un résultat de recherche seul ne suffit pas à attester la lecture de la page.";
    if (sourceRepair) {
      instructions +=
        "\nLa précédente proposition de sources n’a pas pu être validée par l’application. Termine la demande initiale : ouvre explicitement les URLs HTTPS pertinentes avec le web, puis fournis la réponse et les sources consultées. N’invente aucun lien. Si cela échoue, réponds kind=insufficient et explique brièvement que le lien/la source n’a pas pu être confirmé. Ne remplace pas cette demande par un résumé vidéo.";
    }
    const result = await this.client.answer({
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
        question,
        tools,
        signal,
        context,
        conversation,
        mode,
        onProgress,
        sourceRepair: true,
      });
      return {
        ...repaired,
        audit: [...result.audit, ...(repaired.audit || [])],
        sourceRepair: { initial: sourceValidation },
        elapsedMs: Date.now() - started,
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
    };
  }

  async close() {
    this.sent.clear();
    await this.client.close();
  }
}
module.exports = { CodexSessionAgent, streamedAnswer, dynamicTools };
