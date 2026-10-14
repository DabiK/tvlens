// The instruction of the active surveillance, as the chat of a session is given it, the same on the Mac host
// and on the server host: the instruction when the surveillance is enabled and is the one of the session
// that is loaded, nothing otherwise. The state is read in its brief form, at each call, and a surveillance
// that cannot be read gives no instruction rather than failing the question that asked for it.

// `surveillance` is the surveillance of the host, which may not exist yet; `sessionId` is the loaded session.
function activeInstruction(surveillance, sessionId) {
  try {
    const state = surveillance?.snapshot?.({ brief: true });
    return state?.enabled && state.sessionId === sessionId
      ? state.activation?.instruction
      : undefined;
  } catch {
    return undefined;
  }
}

module.exports = { activeInstruction };
