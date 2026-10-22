const { DeepAsk, QUESTION_TIMEOUT_MS } = require("../core/deep-ask.cjs");
const { VideoTools, consultationOf } = require("../core/video-tools.cjs");
const { domainError } = require("../core/shared/domain-error.cjs");
const { CodexSessionAgent } = require("../adapters/codex-session-agent.cjs");
const { OllamaQuestionAgent } = require("../adapters/ollama/question-agent.cjs");
const { validateOllamaConfig } = require("../adapters/ollama/http-client.cjs");
const { normalizeThink } = require("../adapters/ollama/thinking.cjs");
const { trace, safeError } = require("../adapters/chat-trace.cjs");
const { createPublicationDiagnostic } = require("./publication-diagnostic.cjs");
const { validateLocalWeb, createWebRetrieval: defaultWebRetrieval, localAgentOptions } = require("./local-web-retrieval.cjs");
const TVLENS_QUESTION_SCOPE_FOREIGN = "TVLENS_QUESTION_SCOPE_FOREIGN";
const TVLENS_QUESTIONS_BACKEND_INVALID = 'TVLENS_QUESTIONS_BACKEND_INVALID';

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

// Only the composed local agent reads the host's source title, for its web decision; an injected agent or Codex never does.
function createQuestionAgent({ backend, config, agent, CodexAgent, LocalAgent, createWebRetrieval, getSourceTitle, codexBinary,
  selectedModels, quota }) {
  if (!['codex', 'local'].includes(backend))
    throw domainError(TVLENS_QUESTIONS_BACKEND_INVALID, 'Backend de questions inconnu (codex ou local).');
  if (backend === 'local') validateOllamaConfig(config.localQuestions);
  // Codex keeps its own web: the local retrieval settings only concern the local agent.
  if (backend === 'local' && config.localWeb) validateLocalWeb(config.localWeb);
  if (agent) return agent;
  if (backend === 'local') {
    const options = localAgentOptions(config, createWebRetrieval);
    return new LocalAgent(typeof getSourceTitle === 'function' ? { ...options, getSourceTitle } : options);
  }
  return new CodexAgent({ binary: codexBinary || 'codex', authHome: config.codexAuthHome,
    model: selectedModels?.codexModel, reasoningEffort: config.chatReasoningEffort || 'low', quota });
}

function questionAgentOrigin(backend, agent, CodexAgent, LocalAgent) {
  if (agent) return 'injected';
  const standard = backend === 'local' ? LocalAgent === OllamaQuestionAgent : CodexAgent === CodexSessionAgent;
  return standard ? 'composed' : 'substituted';
}

// Both hosts supply the current session; a consultation kept by the question takes precedence over its view.
function createConversationRuntime({
  getSession,
  agent,
  CodexAgent = CodexSessionAgent,
  LocalAgent = OllamaQuestionAgent,
  createWebRetrieval = defaultWebRetrieval,
  codexBinary,
  config = {},
  selectedModels,
  quota,
  onChange,
  onTrace = trace,
  onPublicationError = createPublicationDiagnostic(),
  // Late-bound by the host: the surveillance runtime is composed after the conversation.
  getInstruction,
  // Late-bound by the host too: the title of what is watched in a session, by its identifier, or nothing.
  getSourceTitle,
}) {
  // Les deux hôtes composent les questions au démarrage, avant de créer une session de perception.
  normalizeThink(config.localVlm?.think, 'TVLENS_LOCAL_VLM_THINK');
  normalizeThink(config.localQuestions?.think, 'TVLENS_LOCAL_QUESTIONS_THINK');
  const timeoutMs = questionTimeout(config.questionTimeoutMs);
  const backend = config.questionsBackend ?? 'codex';
  const conversationAgent = createQuestionAgent({ backend, config, agent, CodexAgent, LocalAgent, createWebRetrieval,
    getSourceTitle, codexBinary, selectedModels, quota });
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
      // The local agent rebuilds every question without a thread: it alone needs the older passages handed again.
      olderPassageDigest: backend === 'local',
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
      configuredBackend: backend,
      agentOrigin: questionAgentOrigin(backend, agent, CodexAgent, LocalAgent),
      onTrace,
      serializeError: safeError,
      ...(typeof getInstruction === "function" ? { getInstruction } : {}),
    }),
  };
}
module.exports = { createConversationRuntime, hasPendingQuestion, TVLENS_QUESTION_SCOPE_FOREIGN, TVLENS_QUESTIONS_BACKEND_INVALID };
