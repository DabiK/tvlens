const { DeepAsk, QUESTION_TIMEOUT_MS } = require("../core/deep-ask.cjs");
const { VideoTools } = require("../core/video-tools.cjs");
const { CodexSessionAgent } = require("../adapters/codex-session-agent.cjs");
const { trace, safeError } = require("../adapters/chat-trace.cjs");
const { createPublicationDiagnostic } = require("./publication-diagnostic.cjs");

// A host may only lower the processing ceiling of a question (rollback, tests): the product contract
// is five minutes. A mistyped value is refused at start instead of running under another limit.
function questionTimeout(value) {
  if (value === undefined || value === null) return QUESTION_TIMEOUT_MS;
  if (!Number.isInteger(value) || value < 1 || value > QUESTION_TIMEOUT_MS)
    throw Error("Réglage questionTimeoutMs invalide.");
  return value;
}

// Both hosts supply the current session; frozen question snapshots take precedence.
function createConversationRuntime({
  getSession,
  agent,
  codexBinary,
  config = {},
  selectedModels,
  quota,
  onChange,
  onPublicationError = createPublicationDiagnostic(),
  // Late-bound by the host: the surveillance runtime is composed after the conversation.
  getInstruction,
}) {
  const timeoutMs = questionTimeout(config.questionTimeoutMs);
  const conversationAgent =
    agent ||
    new CodexSessionAgent({
      binary: codexBinary || "codex",
      authHome: config.codexAuthHome,
      model: selectedModels.codexModel,
      reasoningEffort: config.chatReasoningEffort || "low",
      quota,
    });
  const makeTools = (signal, onProgress, scope = {}) => {
    const session = getSession();
    if (!session?.watch || !session.search || !session.inspector)
      throw Error("Démarre une session.");
    const snapshot = scope.snapshot || session.watch.snapshot();
    return new VideoTools({
      snapshot,
      search: session.search,
      inspector: session.inspector,
      media: session.store,
      signal,
      onProgress,
      // Evidence refresh stays bound to the question's session: nothing to read once the host moved on.
      live: () => {
        const watch = getSession()?.watch;
        return watch?.id === snapshot.id ? watch.snapshot() : null;
      },
    });
  };
  return {
    agent: conversationAgent,
    makeTools,
    deep: new DeepAsk({
      agent: conversationAgent,
      makeTools,
      onChange,
      onPublicationError,
      timeoutMs,
      onTrace: trace,
      serializeError: safeError,
      ...(typeof getInstruction === "function" ? { getInstruction } : {}),
    }),
  };
}
module.exports = { createConversationRuntime };
