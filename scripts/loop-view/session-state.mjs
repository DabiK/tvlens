export const MAX_TARGET = 160;
export const LAST_ACTIONS = 8;
export const ORCHESTRATOR = "orchestrateur";

export function relativePath(file, root) {
  if (!file) return "";
  return root && file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file;
}

export const formatTarget = (text) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TARGET);
export const isVerdictPath = (file) => /(^|\/)verdict\.json$/.test(file || "");

export function enterPhase(state, phase, at) {
  state.phase = { ...phase, at };
  const last = state.history.at(-1);
  const newTurn = state.engine === "codex" && last?.turn !== state.turnsStarted;
  if (last?.label !== phase.label || newTurn) {
    const entry = { key: phase.key, label: phase.label };
    if (state.engine === "codex") entry.turn = state.turnsStarted;
    state.history.push(entry);
  }
}
