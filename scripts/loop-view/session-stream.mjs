import { foldCodexSession } from "./codex-stream.mjs";
import { commandPhase } from "./commands.mjs";
import { MAX_TARGET, LAST_ACTIONS, ORCHESTRATOR, enterPhase } from "./session-state.mjs";
import { PHASES } from "./phases.mjs";
// Flux `stream-json` d'une session `claude -p` : la phase où en est l'orchestrateur et ses dernières actions.
// Fonctions pures : l'état passe d'un appel à l'autre, c'est l'appelant qui lit le fichier, par incréments.

const SUB_AGENT = "sous-agent";
const AGENT_TOOLS = new Set(["Agent", "Task"]);
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);
// Les seules lignes qui servent : un appel d'outil, la fin de session, le rapport d'un sous-agent. Le reste du flux
// (réflexion, progression, sorties d'outils) pèse l'essentiel des octets et se saute sans être lu.
const USEFUL_LINE = ['"tool_use"', '"type":"result"', '"agentId"'];

// Les noms viennent du flux, pas de ce code : « constructor » ne doit pas retrouver une propriété de tout objet.
const lookup = (table, key) => (Object.hasOwn(table, String(key)) ? table[String(key)] : undefined);

/** Nom affiché de chaque rôle de sous-agent ; un rôle inconnu garde son nom brut. */
const ROLE_NAMES = { explorateur: "explorateur", implementeur: "implémenteur", relecteur: "relecteur", harmoniseur: "harmoniseur" };
const roleName = (type) => lookup(ROLE_NAMES, type) || (typeof type === "string" && type) || SUB_AGENT;

export const emptySession = () => ({ agents: {}, agentIds: {}, reviews: 0, firstReviewAt: null, phase: null, history: [], actions: [], result: null });

function parseLine(line) {
  if (!USEFUL_LINE.some((marker) => line.includes(marker))) return null;
  try {
    const message = JSON.parse(line);
    return message !== null && typeof message === "object" && !Array.isArray(message) ? message : null;
  } catch (error) {
    // Ligne tronquée ou qui n'est pas du JSON : rien à en tirer, la suivante dira la suite.
    return null;
  }
}

const firstLine = (text) => String(text || "").split("\n").find((line) => line.trim()) || "";

function relative(file, root) {
  if (!file) return "";
  return root && file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file;
}

const agentTarget = (input) => `${input.subagent_type || ""} ${input.description || ""}`;
// La cible de chaque outil qui a la sienne ; les autres se lisent d'après leur chemin, leur motif ou leur description.
const TARGETS = {
  Bash: (input) => input.description || firstLine(input.command),
  SendMessage: (input) => `${input.to || ""} ${input.summary || ""}`,
  SubagentHandback: () => "rapport rendu",
};

function genericTarget(input, root) {
  if (input.pattern) return `${input.pattern} ${relative(input.path, root)}`;
  return relative(input.file_path || input.path, root) || input.skill || input.query || input.description || "";
}

/** Ce que l'action vise, en une ligne : la cible plutôt que l'entrée entière de l'outil. */
function targetOf(name, input, root) {
  const own = AGENT_TOOLS.has(name) ? agentTarget : lookup(TARGETS, name);
  const target = own ? own(input) : genericTarget(input, root);
  return String(target).replace(/\s+/g, " ").trim().slice(0, MAX_TARGET);
}

function agentPhase(type, state) {
  if (type === "explorateur") return PHASES.exploration;
  if (type === "implementeur") return state.reviews > 0 ? PHASES.correction : PHASES.implementation;
  if (type === "harmoniseur") return PHASES.harmonisation;
  if (type !== "relecteur") return null;
  return { key: "review", label: `Relecture ${state.reviews + 1}`, number: state.reviews + 1 };
}

/**
 * La reprise de l'implémenteur ou de l'harmoniseur devient une correction après relecture. Un destinataire inconnu
 * après relecture est traité comme l'agent chargé des corrections.
 */
function resumedPhase(recipient, state) {
  const type = lookup(state.agentIds, recipient);
  if (type === "harmoniseur") return state.reviews > 0 ? PHASES.correction : PHASES.harmonisation;
  const isImplementer = type === "implementeur" || (!type && state.reviews > 0);
  if (!isImplementer) return null;
  return state.reviews > 0 ? PHASES.correction : PHASES.implementation;
}

function phaseOf(part, state, input) {
  if (AGENT_TOOLS.has(part.name)) return agentPhase(input.subagent_type, state);
  if (part.name === "SendMessage") return resumedPhase(input.to, state);
  if (WRITE_TOOLS.has(part.name)) return /(^|\/)verdict\.json$/.test(input.file_path || "") ? PHASES.verdict : null;
  return part.name === "Bash" ? commandPhase(String(input.command || "")) : null;
}

function applyToolUse(state, part, message, root) {
  const input = part.input !== null && typeof part.input === "object" ? part.input : {};
  const at = message.timestamp || null;
  const parent = message.parent_tool_use_id;
  const agent = parent ? roleName(lookup(state.agents, parent)) : ORCHESTRATOR;
  state.actions.push({ agent, tool: part.name, target: targetOf(part.name, input, root), at });
  if (AGENT_TOOLS.has(part.name)) state.agents[part.id] = input.subagent_type;
  // Seul l'orchestrateur mène les phases : ce que fait un sous-agent est une action, pas une étape.
  if (parent) return;
  const phase = phaseOf(part, state, input);
  if (phase) enterPhase(state, phase, at);
  if (AGENT_TOOLS.has(part.name) && input.subagent_type === "relecteur") {
    if (state.reviews === 0) state.firstReviewAt = at;
    state.reviews++;
  }
}

function applyMessage(state, message, root) {
  if (message.type === "result") {
    state.result = { costUsd: message.total_cost_usd ?? null, turns: message.num_turns ?? null, durationMs: message.duration_ms ?? null };
    return;
  }
  const done = message.type === "user" ? message.tool_use_result : null;
  if (done?.agentId && done.agentType && !message.parent_tool_use_id) state.agentIds[done.agentId] = done.agentType;
  if (message.type !== "assistant") return;
  const content = message.message?.content;
  for (const part of Array.isArray(content) ? content : []) {
    if (part?.type === "tool_use") applyToolUse(state, part, message, root);
  }
}

/**
 * Applique des lignes du flux (chaîne JSON chacune) à l'état précédent et rend le nouvel état, sans toucher l'ancien.
 * `root` sert à raccourcir les chemins absolus affichés dans les actions.
 */
export function foldSession(previous, lines, { root = "", engine = "claude" } = {}) {
  if (engine === "codex") return foldCodexSession(previous, lines, { root });
  const state = {
    ...previous,
    agents: { ...previous.agents },
    agentIds: { ...previous.agentIds },
    history: [...previous.history],
    actions: [...previous.actions],
  };
  for (const line of lines) {
    const message = parseLine(line);
    if (message) applyMessage(state, message, root);
  }
  state.actions = state.actions.slice(-LAST_ACTIONS);
  return state;
}
