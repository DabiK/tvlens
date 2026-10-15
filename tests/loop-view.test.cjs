const { test } = require("node:test");
const assert = require("node:assert/strict");
const stream = require("./helpers/loop-stream.cjs");

const { loopView, playSteps } = stream;

const labels = (states) => states.map((state) => state.phase?.label ?? null);

/** La phase où une seule action de l'orchestrateur met une session vierge : chaque cas est indépendant des autres. */
async function phaseAfter(part) {
  const [state] = await playSteps([[stream.assistant([part])]]);
  return state.phase?.label ?? null;
}
const phasesAfter = (parts) => Promise.all(parts.map(phaseAfter));

test("the phase follows the orchestrator from exploration to verdict, with a correction after a review", async () => {
  const session = stream.fullSession();
  const steps = [
    session.exploration,
    session.implementation,
    session.record1,
    session.review1,
    session.correction,
    session.record2,
    session.review2,
    session.check,
    session.verdict,
  ];
  assert.deepEqual(labels(await playSteps(steps)), [
    "Exploration",
    "Implémentation",
    "Enregistrement de l'état relu",
    "Relecture 1",
    "Correction",
    "Enregistrement de l'état relu",
    "Relecture 2",
    "Contrôle complet",
    "Verdict",
  ]);
});

test("an implementer launched after a review is a correction", async () => {
  const at = stream.clock();
  const steps = [
    [stream.assistant([stream.agentCall("rv", "relecteur")], { at: at() })],
    [stream.assistant([stream.agentCall("im", "implementeur")], { at: at() })],
  ];
  assert.deepEqual(labels(await playSteps(steps)), ["Relecture 1", "Correction"]);
});

test("the phase history lists each phase once, in order, without repeating a phase that goes on", async () => {
  const session = stream.fullSession();
  const steps = [session.exploration, session.implementation, session.record1, session.record1, session.review1, session.review1];
  const states = await playSteps(steps);
  assert.deepEqual(states.at(-1).history.map((entry) => entry.label), [
    "Exploration", "Implémentation", "Enregistrement de l'état relu", "Relecture 1", "Relecture 2",
  ]);
});

test("a command that only mentions the quality check does not change the phase", async () => {
  const mentions = [
    "grep -n smoke scripts/check.mjs",
    "cat >> ticket.md <<'EOF'\nLe contrôle complet : node scripts/check.mjs\nEOF",
    "node scripts/check.mjs --changed",
    "node scripts/check.mjs --file core/a.cjs",
    "node scripts/check.mjs --help",
    "git status --short",
  ];
  const phases = await phasesAfter(mentions.map((command, i) => stream.bash(`b${i}`, command)));
  assert.deepEqual(phases, Array(mentions.length).fill(null));
});

test("the full quality check is recognised wherever the command puts it", async () => {
  const runs = [
    "node scripts/check.mjs",
    "( time node scripts/check.mjs ) > .harness-state/tickets/T015/check.log 2>&1; echo exit=$?",
    "cd /work && node scripts/check.mjs 2>&1 | tail -20",
    "npm run check",
  ];
  const phases = await phasesAfter(runs.map((command, i) => stream.bash(`b${i}`, command)));
  assert.deepEqual(phases, Array(runs.length).fill("Contrôle complet"));
});

test("the verdict phase starts when the verdict file is written, by a tool or by a shell redirection", async () => {
  const writes = [
    stream.write("w1", "/work/.harness-state/tickets/T015/verdict.json"),
    stream.bash("w2", "cat > .harness-state/tickets/T015/verdict.json <<'EOF'\n{\"statut\":\"TERMINÉ\"}\nEOF"),
  ];
  assert.deepEqual(await phasesAfter(writes), ["Verdict", "Verdict"]);
});

test("reading the verdict file does not start the verdict phase", async () => {
  const reads = [
    stream.bash("r1", "python3 -m json.tool .harness-state/tickets/T015/verdict.json"),
    stream.toolUse("r2", "Read", { file_path: "verdict.json" }),
  ];
  assert.deepEqual(await phasesAfter(reads), [null, null]);
});

test("a message to the implementer before any review goes on with the implementation, and after a review it is a correction", async () => {
  const session = stream.fullSession();
  const message = stream.assistant([stream.toolUse("sm", "SendMessage", { to: "agent-implementer", summary: "Go on" })]);
  const early = await playSteps([session.implementation, [message]]);
  assert.equal(early.at(-1).phase.label, "Implémentation");
  const late = await playSteps([session.implementation, session.review1, [message]]);
  assert.equal(late.at(-1).phase.label, "Correction");
});

test("a message to a sub-agent the stream never named is a correction after a review, and nothing before", async () => {
  const session = stream.fullSession();
  const message = stream.assistant([stream.toolUse("sm", "SendMessage", { to: "agent-never-seen", summary: "Fix it" })]);
  assert.equal((await playSteps([[message]])).at(-1).phase, null);
  assert.equal((await playSteps([session.review1, [message]])).at(-1).phase.label, "Correction");
});

test("a message sent to a sub-agent that is not the implementer does not start a correction", async () => {
  const session = stream.fullSession();
  const message = stream.toolUse("sm", "SendMessage", { to: "agent-reviewer-1", summary: "Ask again" });
  const states = await playSteps([session.review1, [stream.assistant([message])]]);
  assert.equal(states.at(-1).phase.label, "Relecture 1");
});

test("the result line ends the session and keeps its cost", async () => {
  const session = stream.fullSession();
  const states = await playSteps([session.verdict, session.end]);
  assert.deepEqual(states.at(-1).result, { costUsd: 2.25, turns: 12, durationMs: 60000 });
  assert.equal(states.at(-1).phase.label, "Verdict");
});

// --- Actions : qui a fait quoi ---

test("each action names the agent that did it: the orchestrator, or the sub-agent whose call it runs under", async () => {
  const session = stream.fullSession();
  const [state] = await playSteps([[...session.exploration, ...session.implementation, ...session.review1]]);
  const who = state.actions.map(({ agent, tool }) => `${agent} ${tool}`);
  assert.deepEqual(who, [
    "orchestrateur Agent",
    "explorateur Read",
    "orchestrateur Agent",
    "implémenteur Edit",
    "orchestrateur Agent",
  ]);
});

test("only the last eight actions are kept, the newest last", async () => {
  const reads = Array.from({ length: 12 }, (_, i) => stream.assistant([stream.toolUse(`r${i}`, "Read", { file_path: `/work/core/f${i}.cjs` })]));
  const [state] = await playSteps([reads], { root: "/work" });
  const expected = [4, 5, 6, 7, 8, 9, 10, 11].map((i) => `core/f${i}.cjs`);
  assert.deepEqual(state.actions.map((action) => action.target), expected);
});

test("an action shows its target: the command description, the agent launched, a path under the root, or a search pattern", async () => {
  const parts = [
    stream.bash("b1", "node scripts/check.mjs --changed\nsecond line", "Run the changed-files check"),
    stream.bash("b2", "git status --short\nsecond line"),
    stream.agentCall("a1", "relecteur", "Review 1"),
    stream.toolUse("g1", "Grep", { pattern: "foo\\(", path: "/work/core" }),
    stream.toolUse("s1", "SendMessage", { to: "agent-implementer", summary: "Fix it" }),
    stream.toolUse("w1", "Write", { file_path: "/elsewhere/a.md" }),
  ];
  const [state] = await playSteps([parts.map((part) => stream.assistant([part]))], { root: "/work" });
  assert.deepEqual(
    state.actions.map((action) => action.target),
    ["Run the changed-files check", "git status --short", "relecteur Review 1", "foo\\( core", "agent-implementer Fix it", "/elsewhere/a.md"],
  );
});

test("an action keeps the time of the message that carries it", async () => {
  const [state] = await playSteps([[stream.assistant([stream.toolUse("r", "Read", { file_path: "a.cjs" })], { at: "2026-10-14T10:00:05.000Z" })]]);
  assert.equal(state.actions[0].at, "2026-10-14T10:00:05.000Z");
});

test("folding the lines in several calls gives the state of folding them at once, and leaves the earlier state alone", async () => {
  const { emptySession, foldSession } = await loopView();
  const session = stream.fullSession();
  const lines = Object.values(session).flat();
  const once = foldSession(emptySession(), lines);
  const first = foldSession(emptySession(), lines.slice(0, 7));
  const frozen = JSON.stringify(first);
  const twice = foldSession(first, lines.slice(7));
  assert.deepEqual(twice, once);
  assert.equal(JSON.stringify(first), frozen);
});

test("lines that are not JSON, are cut short or carry nothing useful are skipped", async () => {
  const noise = ["", "not json at all", '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"x","na', '{"type":"system","subtype":"init"}'];
  const [state] = await playSteps([[...noise, stream.assistant([stream.agentCall("ex", "explorateur")])]]);
  assert.equal(state.phase.label, "Exploration");
  assert.equal(state.actions.length, 1);
});

test("the Task tool name counts as the Agent tool", async () => {
  const task = stream.toolUse("t1", "Task", { subagent_type: "explorateur", description: "Explore" });
  assert.equal(await phaseAfter(task), "Exploration");
});

test("what a sub-agent runs is an action, never a phase of the orchestrator", async () => {
  const session = stream.fullSession();
  const underReviewer = stream.assistant([stream.bash("sub-check", "node scripts/check.mjs")], { parent: "rv1" });
  const states = await playSteps([session.review1, [underReviewer]]);
  assert.equal(states.at(-1).phase.label, "Relecture 1");
  assert.equal(states.at(-1).actions.at(-1).agent, "relecteur");
});

// --- Cycles de relecture ---

const { REPORT_FIX, REPORT_OK } = stream;
const review = (minutes, revue, verdict) => ({ at: stream.minutesAfter(minutes), revue, verdict, modele: "claude-opus-5-5" });

test("a review cycle gives its rank, its verdict and the findings counted in its report", async () => {
  const { reviewCycles } = await loopView();
  const cycles = reviewCycles([review(10, "revue-1.diff", "à corriger"), review(20, "revue-2.diff", "accepté")], { 1: REPORT_FIX, 2: REPORT_OK });
  assert.deepEqual(
    cycles.map(({ rank, verdict, findings }) => ({ rank, verdict, findings })),
    [
      { rank: 1, verdict: "à corriger", findings: { blocking: 0, minor: 2, outOfScope: 1 } },
      { rank: 2, verdict: "accepté", findings: { blocking: 0, minor: 0, outOfScope: 3 } },
    ],
  );
});

test("a review whose report is missing or has no findings line still counts as a cycle, without counts", async () => {
  const { reviewCycles } = await loopView();
  const cycles = reviewCycles([review(10, "revue-1.diff", "accepté"), review(20, "revue-2.diff", "illisible")], { 2: "VERDICT : accepté\nRien." });
  assert.deepEqual(cycles.map((cycle) => cycle.findings), [null, null]);
  assert.deepEqual(cycles.map((cycle) => cycle.verdict), ["accepté", "illisible"]);
});

test("a recorded line without a verdict takes the verdict its report gives", async () => {
  const { reviewCycles } = await loopView();
  const [cycle] = reviewCycles([{ at: stream.minutesAfter(1), revue: "revue-1.diff", modele: null }], { 1: REPORT_FIX });
  assert.equal(cycle.verdict, "à corriger");
});

// --- Boucle vivante ou arrêtée ---

test("the loop is alive only when the lock names a process that still lives", async () => {
  const { loopStatus } = await loopView();
  const lives = (pid) => pid === 4242;
  assert.deepEqual(loopStatus("4242", lives), { alive: true, pid: 4242 });
  assert.deepEqual(loopStatus("4242\n", lives), { alive: true, pid: 4242 });
  assert.deepEqual(loopStatus("999", lives), { alive: false, pid: 999 });
});

test("the loop is stopped when the lock is absent, empty or not a process number", async () => {
  const { loopStatus } = await loopView();
  const lives = () => true;
  for (const lock of [null, undefined, "", "  ", "abc", "-5", "0", "12.5"]) {
    assert.deepEqual(loopStatus(lock, lives), { alive: false, pid: null }, `lock ${JSON.stringify(lock)}`);
  }
});

test("names that come from the stream and look like properties of every object are not mistaken for known ones", async () => {
  const lines = [
    stream.assistant([stream.toolUse("c1", "constructor", { description: "odd tool" })]),
    stream.assistant([stream.toolUse("c2", "Read", { file_path: "a.cjs" })], { parent: "constructor" }),
    stream.assistant([stream.toolUse("c3", "SendMessage", { to: "toString", summary: "x" })]),
    stream.assistant([stream.agentCall("c4", "constructor", "odd agent")]),
  ];
  const [state] = await playSteps([lines]);
  assert.deepEqual(state.actions.map(({ agent, tool }) => `${agent} ${tool}`), [
    "orchestrateur constructor",
    "sous-agent Read",
    "orchestrateur SendMessage",
    "orchestrateur Agent",
  ]);
  assert.equal(state.actions[0].target, "odd tool");
  assert.equal(state.phase, null);
});

test("lines that name a tool call but have an unexpected shape are skipped without stopping the reading", async () => {
  const odd = [
    '"tool_use"',
    '["tool_use"]',
    '{"type":"assistant","message":null,"note":"tool_use"}',
    '{"type":"assistant","message":{"content":5},"note":"tool_use"}',
    '{"type":"assistant","message":{"content":[null,7,{"type":"tool_use","id":"z","name":"Read","input":"oops"}]}}',
    '{"type":"user","tool_use_result":"agentId","message":{"content":[]}}',
  ];
  const [state] = await playSteps([[...odd, stream.assistant([stream.agentCall("ex", "explorateur")])]]);
  assert.equal(state.phase.label, "Exploration");
  assert.deepEqual(state.actions.map((action) => action.tool), ["Read", "Agent"]);
});

test("a message to the harmonizer after a review starts a correction", async () => {
  const launch = stream.assistant([stream.agentCall("h", "harmoniseur")]);
  const done = stream.agentResult("h", "agent-harmonizer", "harmoniseur");
  const message = stream.assistant([stream.toolUse("m", "SendMessage", { to: "agent-harmonizer" })]);
  const states = await playSteps([[launch, done], stream.fullSession().review1, [message]]);
  assert.deepEqual(labels(states), ["Harmonisation", "Relecture 1", "Correction"]);
});

test("command detection cannot cross a shell separator to a script mentioned by a neighbouring command", async () => {
  const commands = [";", " &&", " |"].flatMap((separator) => [
    `node --test tests/a.test.cjs${separator} cat scripts/check.mjs`,
    `node --test tests/a.test.cjs${separator} cat scripts/loop/reviewed-state.mjs record`,
  ]);
  assert.deepEqual(await phasesAfter(commands.map((command) => stream.bash("b", command))), Array(commands.length).fill(null));
});

test("a full check after a partial check in the same shell command is recognised", async () => {
  assert.equal(await phaseAfter(stream.bash("b", "node scripts/check.mjs --changed && node scripts/check.mjs")), "Contrôle complet");
});

test("Claude and Codex action targets shorten project paths and stay on one bounded line", async () => {
  const paths = ["/work/core/example.cjs", "/work-other/other.cjs", "/elsewhere/file name\ncontinued.cjs", `/work/${"x".repeat(180)}`, ""];
  const expected = ["core/example.cjs", "/work-other/other.cjs", "/elsewhere/file name continued.cjs", "x".repeat(160), ""];
  for (const engine of ["claude", "codex"]) {
    const lines = paths.map((file, index) => {
      if (engine === "claude") return stream.assistant([stream.toolUse(`read-${index}`, "Read", { file_path: file })]);
      return stream.codexItem("item.completed", { id: `write-${index}`, type: "file_change", changes: [{ path: file, kind: "update" }] });
    });
    const [state] = await playSteps([lines], { engine, root: "/work" });
    assert.deepEqual(state.actions.map((action) => action.target), expected, engine);
  }
});
