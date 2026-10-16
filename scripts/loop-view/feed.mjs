// Le fil d'une session tel qu'un terminal le montrerait : messages, commandes et leur sortie, outils, fichiers écrits,
// sous-agents lancés. Codex n'a qu'un fil ; une session Claude en a un par sous-agent, plus celui de l'orchestrateur.
// Fonctions pures : l'appelant lit le flux par incréments et repasse le fil d'un appel à l'autre.
import { codexCommandPhase, shellCommand } from "./codex-commands.mjs";
import { ORCHESTRATOR, isVerdictPath, relativePath } from "./session-state.mjs";
import { PHASES } from "./phases.mjs";

/** Lignes gardées par fil : assez pour remonter une session, pas assez pour peser sur le navigateur. */
export const MAX_ENTRIES = 400;
/** Lignes de sortie gardées par commande ; le total dit ce qui a été coupé. */
export const OUTPUT_LINES = 5;
export const CODEX_AGENT = "codex";
const MAX_TEXT = 1200;
const MAX_COMMAND = 400;
const MAX_TARGET = 200;
const MAX_OUTPUT_LINE = 200;
const AGENT_TOOLS = new Set(["Agent", "Task"]);

export const emptyFeed = () => ({ agents: {}, phases: {}, calls: {}, subagents: {}, turns: 0, hasChanges: false });

const clip = (text, max) => {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

function outputOf(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  return { out: lines.slice(0, OUTPUT_LINES).map((line) => clip(line, MAX_OUTPUT_LINE)), total: lines.length };
}

function parseLine(line) {
  try {
    const value = JSON.parse(line);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    // Ligne tronquée ou diagnostic hors JSON : la suivante reste lisible.
    return null;
  }
}

function agentFeed(feed, agent) {
  feed.agents[agent] ??= { dropped: 0, entries: [] };
  return feed.agents[agent];
}

function push(feed, agent, entry) {
  const own = agentFeed(feed, agent);
  own.entries.push(entry);
  const excess = own.entries.length - MAX_ENTRIES;
  if (excess > 0) {
    own.entries.splice(0, excess);
    own.dropped += excess;
  }
}

/** Remplace la ligne de même identifiant, ou l'ajoute : une commande commencée puis finie reste une seule ligne. */
function upsert(feed, agent, entry) {
  const own = agentFeed(feed, agent);
  const index = own.entries.findLastIndex((line) => line.id === entry.id);
  if (index < 0) push(feed, agent, entry);
  else own.entries[index] = { ...own.entries[index], ...entry };
}

function enterPhase(feed, agent, label) {
  if (!label || feed.phases[agent] === label) return;
  feed.phases[agent] = label;
  push(feed, agent, { k: "phase", label });
}

// ——— Codex ———

function codexCommand(feed, item, completed) {
  const cmd = clip(shellCommand(String(item.command ?? "")), MAX_COMMAND);
  const known = agentFeed(feed, CODEX_AGENT).entries.some((line) => line.id === item.id);
  if (!known) enterPhase(feed, CODEX_AGENT, codexCommandPhase(String(item.command ?? ""))?.label);
  const result = completed ? { open: false, exit: item.exit_code ?? null, ...outputOf(item.aggregated_output) } : { open: true };
  upsert(feed, CODEX_AGENT, { k: "cmd", id: item.id, cmd, ...result });
}

function codexFiles(feed, item, root) {
  const paths = (Array.isArray(item.changes) ? item.changes : []).filter((change) => typeof change?.path === "string")
    .map((change) => relativePath(change.path, root));
  if (paths.some(isVerdictPath)) enterPhase(feed, CODEX_AGENT, PHASES.verdict.label);
  else if (!feed.hasChanges && paths.length) enterPhase(feed, CODEX_AGENT, PHASES.implementation.label);
  if (paths.length) feed.hasChanges = true;
  push(feed, CODEX_AGENT, { k: "edit", paths });
}

function codexItem(feed, item, completed, root) {
  if (!item || typeof item !== "object") return;
  if (item.type === "command_execution") return codexCommand(feed, item, completed);
  if (!completed) return;
  if (item.type === "agent_message") push(feed, CODEX_AGENT, { k: "say", text: clip(item.text, MAX_TEXT) });
  if (item.type === "error") push(feed, CODEX_AGENT, { k: "warn", text: clip(item.message, MAX_TEXT) });
  if (item.type === "file_change") codexFiles(feed, item, root);
  if (item.type === "todo_list") {
    const items = (Array.isArray(item.items) ? item.items : []).filter((todo) => typeof todo?.text === "string")
      .map((todo) => ({ done: Boolean(todo.completed), text: clip(todo.text, MAX_TARGET) }));
    upsert(feed, CODEX_AGENT, { k: "todo", id: item.id, items });
  }
}

function foldCodex(feed, message, root) {
  agentFeed(feed, CODEX_AGENT);
  if (message.type === "turn.started") {
    feed.turns += 1;
    enterPhase(feed, CODEX_AGENT, feed.turns > 1 ? "Reprise" : PHASES.exploration.label);
  }
  if (message.type === "turn.completed") {
    const output = message.usage?.output_tokens ?? 0;
    push(feed, CODEX_AGENT, { k: "turn", text: `fin du tour · ${output} jetons en sortie` });
  }
  if (message.type === "turn.failed" || message.type === "error") {
    push(feed, CODEX_AGENT, { k: "warn", text: clip(message.error?.message || message.message || "Échec Codex", MAX_TEXT) });
  }
  if (message.type === "item.started" || message.type === "item.completed") codexItem(feed, message.item, message.type === "item.completed", root);
}

// ——— Claude ———

function toolTarget(input, root) {
  const target = relativePath(input.file_path || input.path, root) || input.pattern || input.skill || input.query || input.url || input.description;
  return clip(String(target ?? "").replace(/\s+/g, " ").trim(), MAX_TARGET);
}

function claudeToolUse(feed, agent, block, root) {
  const input = block.input && typeof block.input === "object" ? block.input : {};
  if (AGENT_TOOLS.has(block.name)) {
    const type = typeof input.subagent_type === "string" && input.subagent_type ? input.subagent_type : "sous-agent";
    const description = clip(input.description, MAX_TARGET);
    feed.subagents[block.id] = type;
    push(feed, agent, { k: "spawn", agent: type, text: description });
    push(feed, type, { k: "phase", label: description ? `${type} · ${description}` : type });
    return;
  }
  feed.calls[block.id] = agent;
  if (block.name === "Bash") push(feed, agent, { k: "cmd", id: block.id, cmd: clip(input.command, MAX_COMMAND), open: true });
  else push(feed, agent, { k: "tool", id: block.id, name: String(block.name), target: toolTarget(input, root), open: true });
}

function claudeAssistant(feed, message, root) {
  const agent = feed.subagents[message.parent_tool_use_id] ?? ORCHESTRATOR;
  for (const block of Array.isArray(message.message?.content) ? message.message.content : []) {
    if (block?.type === "text" && block.text?.trim()) push(feed, agent, { k: "say", text: clip(block.text, MAX_TEXT) });
    if (block?.type === "thinking" && agentFeed(feed, agent).entries.at(-1)?.k !== "think") push(feed, agent, { k: "think" });
    if (block?.type === "tool_use") claudeToolUse(feed, agent, block, root);
  }
}

const resultText = (content) => (Array.isArray(content) ? content.map((part) => part?.text ?? "").join("\n") : content);

function claudeResults(feed, message) {
  for (const block of Array.isArray(message.message?.content) ? message.message.content : []) {
    if (block?.type !== "tool_result") continue;
    const subagent = feed.subagents[block.tool_use_id];
    if (subagent) push(feed, subagent, { k: "turn", text: "rapport rendu à l'orchestrateur" });
    const owner = feed.calls[block.tool_use_id];
    if (owner) upsert(feed, owner, { id: block.tool_use_id, open: false, exit: block.is_error ? 1 : 0, ...outputOf(resultText(block.content)) });
  }
}

function foldClaude(feed, message, root) {
  agentFeed(feed, ORCHESTRATOR);
  if (message.type === "assistant") claudeAssistant(feed, message, root);
  if (message.type === "user") claudeResults(feed, message);
  if (message.type === "result") {
    const cost = typeof message.total_cost_usd === "number" ? ` · ${message.total_cost_usd.toFixed(2)} $` : "";
    push(feed, ORCHESTRATOR, { k: "turn", text: `session terminée · ${message.num_turns ?? "?"} tours${cost}` });
  }
}

// ——— Lecture du fil ———

/** Ajoute au fil les lignes lues depuis le dernier appel. `engine` vaut "codex" ou "claude". */
export function foldFeed(previous, lines, { engine = "claude", root = "" } = {}) {
  const feed = structuredClone(previous);
  const fold = engine === "codex" ? foldCodex : foldClaude;
  for (const line of lines) {
    const message = parseLine(line);
    if (message) fold(feed, message, root);
  }
  return feed;
}

/** Les fils du plus ancien au plus récent : celui de Codex, ou l'orchestrateur puis chaque sous-agent. */
export const feedAgents = (feed) => Object.keys(feed.agents);

/**
 * Les lignes à partir de `from`, qui remplacent celles du client à partir de cette place. `since` est la place de la
 * première ligne que le client tient encore ouverte, ou le nombre de ses lignes si toutes sont fermées : une commande
 * finie depuis remplace ainsi sa ligne. `from` recule jusqu'à la première ligne encore ouverte du fil, et avance jusqu'à
 * la première ligne gardée quand le client est en retard sur la fenêtre. Les identifiants internes ne partent pas.
 */
export function feedSince(feed, agent, since) {
  const own = feed.agents[agent];
  if (!own) return { from: 0, total: 0, entries: [] };
  const total = own.dropped + own.entries.length;
  const open = own.entries.findIndex((line) => line.open);
  const firstOpen = open < 0 ? total : own.dropped + open;
  const from = Math.max(own.dropped, Math.min(Math.max(0, since), firstOpen));
  const entries = own.entries.slice(from - own.dropped).map(({ id: _id, ...line }) => line);
  return { from, total, entries };
}
