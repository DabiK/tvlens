// Décodeur pur de codex exec --json : Codex travaille sans sous-agent.
import { PHASES } from "./phases.mjs";
import { quotaDiagnostic, quotaFailure } from "../loop/codex-quota.mjs";
import { codexCommandPhase } from "./codex-commands.mjs";
import { enterPhase, LAST_ACTIONS, relativePath, formatTarget, isVerdictPath } from "./session-state.mjs";

function parseLine(line) {
  try {
    const value = JSON.parse(line);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch (error) {
    // Diagnostic hors JSON ou ligne tronquée : la ligne suivante reste exploitable.
    return null;
  }
}

function addAction(state, item, tool, target, at) {
  const action = { id: item.id, turn: state.turnsStarted ?? 0, agent: "Codex", tool, target: formatTarget(target), at,
    status: item.status ?? null, exitCode: item.exit_code ?? null };
  const index = state.actions.findIndex((entry) => item.id && entry.id === item.id && entry.turn === action.turn);
  if (index < 0) state.actions.push(action);
  else state.actions[index] = { ...action, at: state.actions[index].at ?? at };
}

function applyItem(state, item, at, root) {
  if (!item || typeof item !== "object") return;
  if (item.type === "error") addAction(state, item, "Avertissement", item.message, at);
  if (item.type === "agent_message") addAction(state, item, "Message", item.text, at);
  if (item.type === "todo_list") {
    const todos = Array.isArray(item.items) ? item.items : [];
    const target = todos.filter((todo) => typeof todo?.text === "string").map((todo) => `${todo.completed ? "✓" : "·"} ${todo.text}`).join(" ; ");
    addAction(state, item, "Todo", target, at);
  }
  if (item.type === "command_execution") {
    addAction(state, item, "Bash", item.command, at);
    const phase = codexCommandPhase(String(item.command || ""));
    if (phase) enterPhase(state, phase, at);
  }
  if (item.type === "file_change") {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const paths = changes.filter((change) => typeof change?.path === "string").map((change) => relativePath(change.path, root));
    addAction(state, item, "Write", paths.join(", "), at);
    const verdict = paths.some(isVerdictPath);
    if (verdict) enterPhase(state, PHASES.verdict, at);
    else if (!state.hasChanges && paths.length) enterPhase(state, PHASES.implementation, at);
    if (paths.length) state.hasChanges = true;
  }
}

function completeTurn(state, message) {
  state.turnsCompleted = (state.turnsCompleted ?? 0) + 1;
  const usage = { ...(state.usage ?? {}) };
  for (const [key, value] of Object.entries(message.usage ?? {})) {
    if (typeof value === "number") usage[key] = (usage[key] ?? 0) + value;
  }
  state.usage = usage;
  state.result = { costUsd: null, turns: state.turnsCompleted, durationMs: null, usage };
}

export function foldCodexSession(previous, lines, { root }) {
  const state = { ...previous, engine: "codex", history: [...previous.history], actions: [...previous.actions] };
  for (const line of lines) {
    const message = parseLine(line);
    if (!message) continue;
    const at = message.timestamp ?? null;
    if (message.type === "thread.started") state.threadId = message.thread_id;
    if (message.type === "turn.started") {
      state.turnsStarted = (state.turnsStarted ?? 0) + 1;
      state.result = null;
      const phase = state.turnsStarted > 1 ? { key: "resume", label: "Reprise" } : PHASES.exploration;
      enterPhase(state, phase, at);
    }
    if (message.type === "turn.completed") completeTurn(state, message);
    if (message.type === "turn.failed" || message.type === "error") {
      const quota = quotaFailure(message);
      state.problem = quota ? quotaDiagnostic(quota.reprise) : message.error?.message || message.message || "Échec Codex";
      enterPhase(state, { key: "failed", label: "Échec du tour" }, at);
      addAction(state, {}, "Erreur", state.problem, at);
    }
    if (message.type === "item.started" || message.type === "item.completed") applyItem(state, message.item, at, root);
  }
  state.actions = state.actions.slice(-LAST_ACTIONS);
  return state;
}
