export const MAX_TARGET = 160;
export const LAST_ACTIONS = 8;
export const ORCHESTRATOR = "orchestrateur";

export function enterPhase(state, phase, at) {
  state.phase = { ...phase, at };
  if (state.history.at(-1)?.label !== phase.label) {
    const entry = { key: phase.key, label: phase.label };
    if (state.engine === "codex") entry.turn = state.turnsStarted;
    state.history.push(entry);
  }
}

