// The warm-up of a session that starts or resumes, the same on the Mac host and on the server host: the chat
// agent and the observation agent are asked to get ready before the first question and the first
// description, so that neither pays for the connection. Both are treated alike: an agent that is absent, has
// nothing to prepare, hands back no promise or whose preparation is refused never holds the session back.
// Whether to warm up at all stays with the host: never for an archive that is only being read.

// One agent, prepared under `id`. Called as a method: a production agent keeps its state on itself.
const prepared = (agent, id) => {
  Promise.resolve(agent?.prepare?.(id)).catch(() => {});
};

// Warms up the chat agent, then the observation agent of `perception`, under the id of the session.
function warmUp({ chat, perception, sessionId }) {
  prepared(chat, sessionId);
  prepared(perception?.agent, sessionId + "-observe");
}

module.exports = { warmUp };
