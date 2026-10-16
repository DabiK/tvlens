const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const stream = require("./helpers/loop-stream.cjs");

const modelModule = () => import(pathToFileURL(path.join(__dirname, "..", "scripts/loop-web/public/model.js")).href);
const view = (phase, extra = {}) => ({ alive: true, phase: { key: phase, label: phase }, ticket: { id: "T015", moteur: "codex", attempt: 1 }, ...extra });

test("the agent of the running phase works at its desk, the others rest in the lounge and the robot never leaves", async () => {
  const { placeOf, activeRole } = await modelModule();
  const current = view("review");
  assert.equal(activeRole(current), "relecteur");
  assert.deepEqual(["explorateur", "implementeur", "relecteur", "retro", "gardien"].map((role) => placeOf(role, current)),
    ["lounge", "lounge", "desk", "lounge", "desk"]);
  assert.equal(activeRole(view("correction")), "implementeur");
  assert.equal(activeRole({ ...view("review"), alive: false }), null, "nobody works while the loop is stopped");
});

test("an agent walks from the lounge to its desk through the central aisle", async () => {
  const { pathBetween, ROLES, HUB } = await modelModule();
  const route = pathBetween("relecteur", "lounge", "desk");
  assert.deepEqual(route.at(-1), { x: ROLES.relecteur.spot.x, y: ROLES.relecteur.spot.y });
  assert.ok(route.some((point) => point.x === HUB.x && point.y === HUB.y));
  assert.deepEqual(pathBetween("relecteur", "desk", "lounge").at(-1), ROLES.relecteur.lounge);
});

test("the board gives tickets awaiting a decision their own column, marks the live and the waiting ones, and filters", async () => {
  const { boardColumns } = await modelModule();
  const tickets = [
    stream.ticket("T001", "termine"), stream.ticket("T002", "termine"), stream.ticket("T015", "en-cours"),
    stream.ticket("T016", "a-faire", { bloquePar: ["T015"] }), stream.ticket("T017", "a-faire", { bloquePar: ["T001"] }),
    stream.ticket("T018", "a-faire", { decisionAttendue: "Which host?" }),
  ];
  const columns = Object.fromEntries(boardColumns(tickets, { liveId: "T015" }).map((column) => [column.key, column.cards]));
  assert.deepEqual(columns.decision.map((card) => card.id), ["T018"]);
  assert.deepEqual(columns.todo.map((card) => [card.id, card.mark]), [["T016", "▣ T015"], ["T017", "PRÊTE"]]);
  assert.deepEqual(columns.doing.map((card) => [card.id, card.live]), [["T015", true]]);
  assert.deepEqual(columns.done.map((card) => card.id), ["T002", "T001"], "the last finished comes first");
  const ready = boardColumns(tickets, { filter: "ready" }).flatMap((column) => column.cards.map((card) => card.id));
  assert.deepEqual(ready, ["T017"]);
  const found = boardColumns(tickets, { search: "of t016" }).flatMap((column) => column.cards.map((card) => card.id));
  assert.deepEqual(found, ["T016"]);
});

test("the queue names the next quest and the ones waiting for the owner; the chest separates tonight from before", async () => {
  const { queueList, chestList } = await modelModule();
  const tickets = [
    stream.ticket("T001", "termine"), stream.ticket("T009", "termine"), stream.ticket("T016"), stream.ticket("T018", "a-faire", { decisionAttendue: "?" }),
  ];
  const launchedAt = Date.parse("2026-10-16T20:00:00Z");
  const current = { remaining: { tickets: [{ id: "T016", titre: "Title of T016" }] }, launchedAt,
    finished: [{ id: "T009", outcome: "integre", durationMs: 600000, model: "gpt-6.1-sol", titre: "Title of T009" }] };
  const queue = queueList(current, tickets);
  assert.deepEqual(queue.sections[0].rows.map((row) => [row.id, row.tag]), [["T016", "PROCHAINE"]]);
  assert.match(queue.sub, /T018/);
  const history = [{ id: "T009", at: "2026-10-16T21:00:00Z" }, { id: "T001", at: "2026-10-15T21:00:00Z" }];
  const chest = chestList(current, history, tickets);
  assert.deepEqual(chest.sections.map((section) => section.rows.map((row) => row.id)), [["T009"], ["T001"]]);
  assert.equal(chest.sections[0].rows[0].meta, "10 min 00 · GPT-6.1 Sol");
});

test("the terminal follows the Codex thread for both of its roles, and says when an agent writes no live feed", async () => {
  const { feedSource } = await modelModule();
  const codex = view("implementation");
  assert.deepEqual(feedSource("explorateur", codex, ["codex"]), { kind: "feed", agent: "codex" });
  assert.deepEqual(feedSource("implementeur", codex, ["codex"]), { kind: "feed", agent: "codex" });
  assert.equal(feedSource("relecteur", codex, ["codex"]).kind, "review");
  assert.equal(feedSource("retro", codex, ["codex"]).kind, "none");
  assert.equal(feedSource("gardien", codex, ["codex"]).kind, "journal");
});

test("in a Claude session each role follows its own sub-agent, and the loop follows the orchestrator", async () => {
  const { feedSource } = await modelModule();
  const claude = view("review", { ticket: { id: "T015", moteur: "claude", attempt: 1 } });
  const agents = ["orchestrateur", "explorateur", "relecteur"];
  assert.deepEqual(feedSource("relecteur", claude, agents), { kind: "feed", agent: "relecteur" });
  assert.deepEqual(feedSource("gardien", claude, agents), { kind: "feed", agent: "orchestrateur" });
  assert.equal(feedSource("implementeur", claude, agents).kind, "none", "not launched yet");
});

test("a finished quest and a new review verdict call for a banner, a first view does not", async () => {
  const { transitions } = await modelModule();
  const before = view("review", { finished: [], cycles: [{ rank: 1, pending: true }] });
  assert.deepEqual(transitions(null, before), []);
  const fixed = { ...before, cycles: [{ rank: 1, verdict: "à corriger", pending: false }] };
  assert.deepEqual(transitions(before, fixed), [{ title: "À CORRIGER", sub: "RELECTURE 1", bad: true }]);
  const done = { ...fixed, finished: [{ id: "T015", outcome: "integre", durationMs: 90000 }] };
  assert.deepEqual(transitions(fixed, done), [{ title: "QUÊTE ACCOMPLIE", sub: "T015 · 1 min 30" }]);
});

test("the steps of the timeline get short arcade labels that keep the review rank", async () => {
  const { stepLabel } = await modelModule();
  assert.deepEqual(["Exploration", "Relecture 2", "Contrôles de la boucle", "Inconnue"].map(stepLabel), ["EXPLO", "REVUE 2", "BOUCLE", "INCONNUE"]);
});
