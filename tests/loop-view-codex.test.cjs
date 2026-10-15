const { test } = require("node:test");
const assert = require("node:assert/strict");
const stream = require("./helpers/loop-stream.cjs");
const { loopView, playSteps } = stream;
const labels = (states) => states.map((state) => state.phase?.label ?? null);

test("a Codex stream follows exploration, first file change, full check and verdict without subagents", async () => {
  const session = stream.codexSession();
  const states = await playSteps([session.exploration, session.implementation, session.check, session.verdict], { engine: "codex", root: "/work" });
  assert.deepEqual(labels(states), ["Exploration", "Implémentation", "Contrôle complet", "Verdict"]);
  assert.equal(states[0].threadId, "thread-example");
  assert.deepEqual(states.at(-1).agents, {});
  assert.equal(states[1].actions.at(-1).target, "core/example.cjs");
});

test("Codex action completions update the action instead of duplicating it and preserve command status", async () => {
  const [state] = await playSteps([stream.codexSession().exploration], { engine: "codex" });
  assert.equal(state.actions.length, 1);
  assert.deepEqual([state.actions[0].status, state.actions[0].exitCode], ["completed", 0]);
  assert.equal(state.actions[0].at, null);
});

test("Codex agent messages and todo lists remain readable among the last eight actions", async () => {
  const lines = Array.from({ length: 10 }, (_, index) => stream.codexItem("item.completed", {
    id: `message-${index}`, type: "agent_message", text: `Message ${index}`,
  }));
  lines.push(stream.codexItem("item.completed", { id: "todo", type: "todo_list", items: [{ text: "Read docs", completed: true }] }));
  const [state] = await playSteps([lines], { engine: "codex" });
  assert.equal(state.actions.length, 8);
  assert.deepEqual(state.actions.slice(-2).map(({ tool, target }) => [tool, target]), [["Message", "Message 9"], ["Todo", "✓ Read docs"]]);
});

test("Codex turn usage accumulates over a resumed thread and the same item id remains a new action in the new turn", async () => {
  const session = stream.codexSession();
  const states = await playSteps([session.exploration, session.end, session.resume,
    [...session.exploration.slice(2), ...session.end]], { engine: "codex" });
  assert.deepEqual(states[1].result, { costUsd: null, turns: 1, durationMs: null,
    usage: { input_tokens: 100, cached_input_tokens: 60, output_tokens: 10 } });
  assert.equal(states[2].result, null);
  assert.equal(states[3].result.turns, 2);
  assert.equal(states[3].result.usage.input_tokens, 200);
  assert.equal(states[3].actions.length, 2);
});

test("Codex turn failures and top-level errors are visible while item warnings do not fail a turn", async () => {
  const states = await playSteps([stream.codexSession().exploration,
    [stream.codexItem("item.completed", { id: "warning", type: "error", message: "hook warning" })],
    [stream.codexEvent("turn.failed", { error: { message: "execution failed" } })],
    [stream.codexEvent("error", { message: "stream failed" })]], { engine: "codex" });
  assert.equal(states[1].actions.at(-1).target, "hook warning");
  assert.equal(states[1].phase.key, "exploration");
  assert.equal(states[2].problem, "execution failed");
  assert.equal(states[2].phase.label, "Échec du tour");
  assert.equal(states[3].actions.at(-1).target, "stream failed");
});

test("Codex command phases exclude partial controls and later journal writes preserve the full-check phase", async () => {
  const session = stream.codexSession();
  const partial = stream.codexItem("item.started", { id: "partial", type: "command_execution", command: "node scripts/check.mjs --no-tests" });
  const journal = stream.codexItem("item.completed", { id: "journal", type: "file_change", changes: [{ path: "journal.md", kind: "update" }] });
  const states = await playSteps([session.exploration, [partial], session.implementation, session.check, [journal]], { engine: "codex" });
  assert.deepEqual(labels(states), ["Exploration", "Exploration", "Implémentation", "Contrôle complet", "Contrôle complet"]);
});

async function codexView(lines, reviews = [], extra = {}) {
  const { buildView, emptySession, foldSession } = await loopView();
  return buildView({ now: stream.START + 60000,
    events: [stream.sessionEvent(0, "T015", 1, { moteur: "codex", modele: "gpt-6-astra" })],
    stream: foldSession(emptySession(), lines, { engine: "codex", root: "/work" }),
    reviews, reports: { 1: stream.REPORT_FIX, 2: stream.REPORT_OK }, tickets: stream.QUEUE,
    loop: { alive: true, pid: 4242, launchedAt: stream.START }, verdictStatus: "TERMINÉ", ...extra });
}

test("Codex external reviews and corrections follow the review journal across turns of the same session", async () => {
  const session = stream.codexSession();
  const initial = [session.exploration, session.implementation, session.check, session.verdict, session.end].flat();
  const pending = await codexView(initial);
  assert.equal(pending.phase.label, "Relecture 1");
  assert.deepEqual(pending.cycles.map(({ rank, pending }) => [rank, pending]), [[1, true]]);
  const reviews = [{ at: stream.minutesAfter(10), verdict: "à corriger" }];
  const reviewed = await codexView(initial, reviews);
  assert.deepEqual(reviewed.cycles.map(({ rank, pending }) => [rank, pending]), [[1, false]]);
  const resumed = [...initial, ...session.resume, ...session.implementation];
  const correction = await codexView(resumed, reviews);
  assert.equal(correction.phase.label, "Correction");
  assert.ok(correction.timeline.some((entry) => entry.label === "Relecture 1" && entry.state === "done"));
  const second = [...resumed, ...session.check, ...session.verdict, ...session.end];
  const next = await codexView(second, reviews);
  assert.equal(next.phase.label, "Relecture 2");
  assert.deepEqual(next.cycles.map(({ rank, pending }) => [rank, pending]), [[1, false], [2, true]]);
  const accepted = await codexView(second, [...reviews, { at: stream.minutesAfter(20), verdict: "accepté" }]);
  assert.deepEqual(accepted.cycles.map(({ rank, pending }) => [rank, pending]), [[1, false], [2, false]]);
});

test("a Codex turn ending with a blocked verdict does not announce an external review", async () => {
  const session = stream.codexSession();
  const lines = [session.exploration, session.implementation, session.verdict, session.end].flat();
  const view = await codexView(lines, [], { verdictStatus: "BLOQUÉ" });
  assert.equal(view.phase.label, "Verdict");
  assert.deepEqual(view.cycles, []);
});

test("Codex recognises commands wrapped by its shell", async () => {
  const commands = ["/bin/zsh -lc 'node scripts/check.mjs'", '/bin/bash -c "node scripts/loop/reviewed-state.mjs record"'];
  const states = await Promise.all(commands.map(async (command) => {
    const [state] = await playSteps([[stream.codexItem("item.started", { id: "cmd", type: "command_execution", command })]], { engine: "codex" });
    return state.phase?.label ?? null;
  }));
  assert.deepEqual(states, ["Contrôle complet", "Enregistrement de l'état relu"]);
});

test("Codex recognises executed Python subprocess controls and verdict writes without treating journal quotations as commands", async () => {
  const bodies = [
    "command = ['node', 'scripts/check.mjs']\nresult = subprocess.run(command, capture_output=True)",
    "commands = [\n['node', 'scripts/check.mjs', '--changed'],\n['node', 'scripts/check.mjs'],\n]\n" +
      "for command in commands:\n    result = subprocess.run(command, capture_output=True)",
    "state = Path('.harness-state/tickets/T015')\n(state / 'verdict.json').write_text(json.dumps(verdict))",
    "Path('.harness-state/tickets/T015/verdict.json').read_text()\n" +
      "Path('journal.md').write_text('node scripts/check.mjs')",
    "command = ['node', 'scripts/check.mjs', '--no-tests']\nsubprocess.run(command)",
  ];
  const phases = await Promise.all(bodies.map(async (body) => {
    const command = `/bin/zsh -lc "python3 - <<'PY'\n${body}\nPY"`;
    const [state] = await playSteps([[stream.codexItem("item.started", { id: "cmd", type: "command_execution", command })]], { engine: "codex" });
    return state.phase?.label ?? null;
  }));
  assert.deepEqual(phases, ["Contrôle complet", "Contrôle complet", "Verdict", null, null]);
});
