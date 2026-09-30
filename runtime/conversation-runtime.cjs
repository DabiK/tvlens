const { DeepAsk } = require("../core/deep-ask.cjs");
const { VideoTools } = require("../core/video-tools.cjs");
const { CodexSessionAgent } = require("../adapters/codex-session-agent.cjs");

// Both hosts supply the current session; frozen question snapshots take precedence.
function createConversationRuntime({
  getSession,
  agent,
  codexBinary,
  config = {},
  selectedModels,
  quota,
  onChange,
}) {
  const conversationAgent =
    agent ||
    new CodexSessionAgent({
      binary: codexBinary || "codex",
      authHome: config.codexAuthHome,
      model: selectedModels.codexModel,
      quota,
    });
  const makeTools = (signal, onProgress, scope = {}) => {
    const session = getSession();
    if (!session?.watch || !session.search || !session.inspector)
      throw Error("Démarre une session.");
    return new VideoTools({
      snapshot: scope.snapshot || session.watch.snapshot(),
      search: session.search,
      inspector: session.inspector,
      media: session.store,
      signal,
      onProgress,
    });
  };
  return {
    agent: conversationAgent,
    makeTools,
    deep: new DeepAsk({ agent: conversationAgent, makeTools, onChange }),
  };
}
module.exports = { createConversationRuntime };
