// Fabrique les flux Claude (`stream-json`, session-<n>.jsonl), Codex (`exec --json`, codex-<n>.jsonl)
// et les événements de events.jsonl : de quoi jouer une session sans lancer de modèle.

const path = require("node:path");
const { pathToFileURL } = require("node:url");

/** Le module testé, importé comme le ferait un hôte : par sa frontière publique, `scripts/loop-view.mjs`. */
const loopView = () => import(pathToFileURL(path.join(__dirname, "..", "..", "scripts/loop-view.mjs")).href);

const START = Date.parse("2026-10-14T10:00:00.000Z");
const STEP_MS = 5000;

/** Horloge de test : chaque appel avance de cinq secondes, pour que les actions aient des heures distinctes. */
function clock(start = START) {
  let tick = 0;
  return () => new Date(start + STEP_MS * tick++).toISOString();
}

const toolUse = (id, name, input) => ({ type: "tool_use", id, name, input });
const agentCall = (id, subagentType, description = "work") => toolUse(id, "Agent", { subagent_type: subagentType, description, prompt: "p" });
const bash = (id, command, description) => toolUse(id, "Bash", description ? { command, description } : { command });
const write = (id, filePath) => toolUse(id, "Write", { file_path: filePath, content: "{}" });

/** Message de l'assistant ; `parent` est l'identifiant de l'appel d'agent quand c'est un sous-agent qui parle. */
const assistant = (parts, { parent = null, at = "2026-10-14T10:00:00.000Z" } = {}) =>
  JSON.stringify({ type: "assistant", parent_tool_use_id: parent, timestamp: at, message: { content: parts } });

/** Un sous-agent a rendu la main : Claude Code donne son identifiant et son rôle à l'orchestrateur. */
const agentResult = (toolUseId, agentId, agentType) =>
  JSON.stringify({
    type: "user",
    parent_tool_use_id: null,
    message: { content: [{ type: "tool_result", tool_use_id: toolUseId }] },
    tool_use_result: { status: "completed", agentId, agentType },
  });

const finalResult = (cost = 1.5) => JSON.stringify({ type: "result", subtype: "success", total_cost_usd: cost, num_turns: 12, duration_ms: 60000 });

const TICKET = "docs/travail/tickets/015-example.md";

/**
 * Une session complète de l'orchestrateur : exploration, implémentation, relecture 1 « à corriger », correction,
 * relecture 2 « accepté », contrôle complet, verdict. Chaque étape est une liste de lignes ; le sous-agent écrit
 * sous son propre appel pour que l'on voie qui fait quoi.
 */
function fullSession() {
  const at = clock();
  const step = (parts, options) => assistant(parts, { at: at(), ...options });
  return {
    exploration: [
      step([agentCall("ex", "explorateur", "Explore T015")]),
      step([toolUse("r1", "Read", { file_path: TICKET })], { parent: "ex" }),
      agentResult("ex", "agent-explorer", "explorateur"),
    ],
    implementation: [
      step([agentCall("im", "implementeur", "Implement T015")]),
      step([toolUse("e1", "Edit", { file_path: "tests/a.test.cjs" })], { parent: "im" }),
      agentResult("im", "agent-implementer", "implementeur"),
    ],
    record1: [step([bash("rc1", "node scripts/loop/reviewed-state.mjs record 2>&1 | tail -4")])],
    review1: [step([agentCall("rv1", "relecteur", "Review 1")]), agentResult("rv1", "agent-reviewer-1", "relecteur")],
    correction: [step([toolUse("sm", "SendMessage", { to: "agent-implementer", summary: "Fix the minor finding" })])],
    record2: [step([bash("rc2", "node scripts/loop/reviewed-state.mjs record")])],
    review2: [step([agentCall("rv2", "relecteur", "Review 2")]), agentResult("rv2", "agent-reviewer-2", "relecteur")],
    check: [step([bash("ck", "node scripts/check.mjs > .harness-state/tickets/T015/check.txt 2>&1; echo $?")])],
    verdict: [step([write("vd", "/work/.harness-state/tickets/T015/verdict.json")])],
    end: [finalResult(2.25)],
  };
}

/** Heure de test, `minutes` après le début : les événements de la boucle portent des dates ISO. */
const minutesAfter = (minutes) => new Date(START + minutes * 60000).toISOString();

/** Un événement de `events.jsonl` ; `charge` y est toujours, et la vue doit l'ignorer. */
const loopEvent = (minutes, phase, data = {}) => ({ at: minutesAfter(minutes), phase, ...data, charge: { uptime: "load averages: 9.99" } });
const sessionEvent = (minutes, ticket, attempt = 1, extra = {}) =>
  loopEvent(minutes, "session", { ticket, attempt, niveau: "standard", modele: "claude-sonnet-5-5", effort: "high", palier: 0, relecteur: "opus", ...extra });
const endedEvent = (minutes, ticket, attempt = 1, cost = 1) =>
  loopEvent(minutes, "session-terminee", { ticket, attempt, code: 0, tours: 10, duree_s: 60, cout_usd: cost });
const refusedEvent = (minutes, ticket, attempt = 1, reason = "no verdict") => loopEvent(minutes, "tentative-refusee", { ticket, attempt, raison: reason });
const blockedEvent = (minutes, ticket, reason = "the ticket is wrong", cost = 1) =>
  loopEvent(minutes, "bloque", { ticket, raison: reason, tentatives: 1, cout_usd: cost });
const retroEvent = (minutes, ticket, cost = 0.2) => loopEvent(minutes, "retro", { ticket, observations: 2, cout_usd: cost });
const integratedEvent = (minutes, ticket, cost = 1, extra = {}) =>
  loopEvent(minutes, "integre", { ticket, commit: "abc1234", modele: "claude-sonnet-5-5", tentatives: 1, cout_usd: cost, ...extra });

/** Rejoue des lignes du flux d'une session et rend l'état après chacune des étapes données. */
async function playSteps(steps, options) {
  const { emptySession, foldSession } = await loopView();
  let state = emptySession();
  const states = [];
  for (const lines of steps) {
    state = foldSession(state, lines, options);
    states.push(state);
  }
  return states;
}

/** Un ticket de la file tel que `list` le décrit, avec seulement ce que la boucle regarde. */
const ticket = (id, statut = "a-faire", extra = {}) => ({ id, titre: `Title of ${id}`, statut, bloquePar: [], decisionAttendue: "", ...extra });

// Rapports de relecteur : « à corriger » (deux mineurs) et « accepté » (trois constats hors périmètre).
const REPORT_FIX = "VERDICT : à corriger\nCONSTATS : 0 bloquant, 2 mineur, 1 hors périmètre\n\n## Constats\n1. a.cjs:3 : unclear.";
const REPORT_OK = "VERDICT : accepté\nCONSTATS : 0 bloquant, 0 mineur, 3 hors périmètre\n";

const QUEUE = [
  ticket("T001", "termine"),
  ticket("T002", "termine"),
  ticket("T015", "en-cours"),
  ticket("T016", "a-faire", { bloquePar: ["T015"] }),
  ticket("T017", "a-faire"),
];
const LAUNCH = Date.parse(minutesAfter(0));

/** Vue d'une boucle vivante dont T001 et T002 sont intégrés et T015 tourne ; chaque test change ce qui l'intéresse. */
async function viewOf({ events, lines = [], reviews = [], reports = {}, loop = {}, tickets = QUEUE, now = 90 } = {}) {
  const { buildView, emptySession, foldSession } = await loopView();
  const history = events ?? [
    sessionEvent(0, "T001"), endedEvent(18, "T001", 1, 2), integratedEvent(20, "T001", 2),
    sessionEvent(21, "T002"), endedEvent(58, "T002", 1, 4), integratedEvent(60, "T002", 4),
    sessionEvent(62, "T015"),
  ];
  return buildView({
    now: Date.parse(minutesAfter(now)),
    events: history,
    stream: foldSession(emptySession(), lines, { root: "/work" }),
    reviews,
    reports,
    tickets,
    loop: { alive: true, pid: 4242, launchedAt: LAUNCH, maxTickets: null, ...loop },
  });
}

const sessionUpTo = (...names) => names.flatMap((name) => fullSession()[name]);

/** Flux codex exec --json sans horodatage, comme celui conservé par la boucle. */
const codexEvent = (type, data = {}) => JSON.stringify({ type, ...data });
const codexItem = (type, item) => codexEvent(type, { item });
function codexSession() {
  return {
    exploration: [codexEvent("thread.started", { thread_id: "thread-example" }), codexEvent("turn.started"),
      codexItem("item.started", { id: "cmd-read", type: "command_execution", command: "cat CLAUDE.md", status: "in_progress" }),
      codexItem("item.completed", { id: "cmd-read", type: "command_execution", command: "cat CLAUDE.md", status: "completed", exit_code: 0 })],
    implementation: [codexItem("item.completed", { id: "patch", type: "file_change", changes: [{ path: "/work/core/example.cjs", kind: "update" }] })],
    check: [codexItem("item.started", { id: "check", type: "command_execution", command: "node scripts/check.mjs", status: "in_progress" })],
    verdict: [codexItem("item.completed", { id: "verdict", type: "file_change",
      changes: [{ path: "/work/.harness-state/tickets/T015/verdict.json", kind: "add" }] })],
    end: [codexEvent("turn.completed", { usage: { input_tokens: 100, cached_input_tokens: 60, output_tokens: 10 } })],
    resume: [codexEvent("thread.started", { thread_id: "thread-example" }), codexEvent("turn.started")],
  };
}
module.exports = {
  QUEUE,
  LAUNCH,
  viewOf,
  sessionUpTo,
  loopView,
  playSteps,
  ticket,
  REPORT_FIX,
  REPORT_OK,
  minutesAfter,
  loopEvent,
  sessionEvent,
  endedEvent,
  refusedEvent,
  blockedEvent,
  retroEvent,
  integratedEvent,
  START,
  clock,
  toolUse,
  agentCall,
  bash,
  write,
  assistant,
  agentResult,
  finalResult,
  fullSession,
  TICKET,
  codexEvent,
  codexItem,
  codexSession,
};
