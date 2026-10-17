const { DeepAsk, QUESTION_TIMEOUT_MS } = require("../core/deep-ask.cjs");
const { VideoTools, consultationOf } = require("../core/video-tools.cjs");
const { domainError } = require("../core/shared/domain-error.cjs");
const { CodexSessionAgent } = require("../adapters/codex-session-agent.cjs");
const { trace, safeError } = require("../adapters/chat-trace.cjs");
const { createPublicationDiagnostic } = require("./publication-diagnostic.cjs");
const TVLENS_QUESTION_SCOPE_FOREIGN = "TVLENS_QUESTION_SCOPE_FOREIGN";

function hasPendingQuestion(jobs, sessionId) {
  return Boolean(sessionId) && jobs.some(job => job.sessionId === sessionId
    && (job.status === 'queued' || job.status === 'running'));
}

// A host may only lower the processing ceiling of a question (rollback, tests): the product contract
// is five minutes. A mistyped value is refused at start instead of running under another limit.
function questionTimeout(value) {
  if (value === undefined || value === null) return QUESTION_TIMEOUT_MS;
  if (!Number.isInteger(value) || value < 1 || value > QUESTION_TIMEOUT_MS)
    throw Error("Réglage questionTimeoutMs invalide.");
  return value;
}

// Both hosts supply the current session; a consultation kept by the question takes precedence over its view.
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
    if (!session?.memory || !session.memoryMedia || !session.search || !session.inspector)
      throw Error("Démarre une session.");
    const consultation = scope.consultation || consultationOf(session.memory.view());
    // A kept scope names its session: a moment of another session is never consulted under the current one.
    if (consultation.sessionId !== session.id)
      throw domainError(TVLENS_QUESTION_SCOPE_FOREIGN, "Ce moment n’appartient pas à la session en cours.");
    const { sessionId } = consultation;
    return new VideoTools({
      consultation,
      search: session.search,
      inspector: session.inspector,
      media: session.memoryMedia,
      signal,
      onProgress,
      // Rereads stay bound to the question's session: nothing is read once the host moved on. Only the identifier
      // is kept here, never the view or the session the question started from.
      reread: (ids) => {
        const current = getSession();
        return current?.id === sessionId && current.memory ? current.memory.passages(ids) : null;
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
module.exports = { createConversationRuntime, hasPendingQuestion, TVLENS_QUESTION_SCOPE_FOREIGN };
