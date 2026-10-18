const { test } = require("node:test");
const assert = require("node:assert/strict");
const stream = require("./helpers/loop-stream.cjs");
const { QUOTA_EVENTS } = require("./helpers/codex-session.cjs");
const { loopView, playSteps } = stream;
const labels = (states) => states.map((state) => state.phase?.label ?? null);

test("Codex quota actions and their diagnostic expose only the announced retry text", async () => {
  const [state] = await playSteps([QUOTA_EVENTS.map(event => JSON.stringify(event))], { engine: "codex" });
  assert.match(state.problem, /Quota Codex épuisé/);
  assert.ok(state.problem.includes("Oct 22nd, 2026 8:41 AM"));
  assert.doesNotMatch(JSON.stringify(state.actions) + state.problem, /https?:|chatgpt\.com|You’ve/);
});

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

test("Codex turn usage accumulates across correction sessions and the same item id remains a new action in the new turn", async () => {
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

test("a Codex timeline announces full check and verdict before the external review", async () => {
  const session = stream.codexSession();
  const upcoming = (view) => view.timeline.filter((entry) => entry.state === "todo").map((entry) => entry.label);
  const initial = [session.exploration, session.implementation, session.check, session.verdict].flat();
  const implementation = await codexView([session.exploration, session.implementation].flat());
  assert.deepEqual(upcoming(implementation), ["Contrôle complet", "Verdict", "Relecture", "Contrôles de la boucle", "Rétrospective"]);
  assert.deepEqual(upcoming(await codexView(initial)), ["Relecture", "Contrôles de la boucle", "Rétrospective"]);
  const completed = [...initial, ...session.end];
  assert.deepEqual(upcoming(await codexView(completed)), ["Contrôles de la boucle", "Rétrospective"]);
  const reviews = [{ at: stream.minutesAfter(10), verdict: "à corriger" }];
  const correction = await codexView([...completed, ...session.resume, ...session.implementation], reviews);
  assert.equal(correction.phase.label, "Correction");
  assert.deepEqual(upcoming(correction), ["Contrôle complet", "Verdict", "Relecture", "Contrôles de la boucle", "Rétrospective"]);
});

test("Codex external reviews and correction sessions follow the review journal", async () => {
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

test("a completed Codex turn with a finished verdict announces review even when the verdict write is unrecognised", async () => {
  const session = stream.codexSession();
  const commands = [
    "python3 - <<'PY'\njson.dump(v, open('verdict.json', 'w'))\nPY",
    "python3 - <<'PY'\np = state / 'verdict.json'\np.write_text(json.dumps(v))\nPY",
    'node -e "fs.writeFileSync(\'verdict.json\', JSON.stringify(v))"',
  ];
  for (const command of commands) {
    const write = stream.codexItem("item.completed", { id: "write", type: "command_execution", command });
    const lines = [session.exploration, session.implementation, session.check, [write], session.end].flat();
    const view = await codexView(lines);
    assert.equal(view.phase.label, "Relecture 1", command);
    assert.deepEqual(view.cycles.map(({ rank, pending }) => [rank, pending]), [[1, true]]);
    assert.deepEqual(view.timeline.slice(-4).map(({ label, state }) => [label, state]), [
      ["Contrôle complet", "done"], ["Relecture 1", "current"], ["Contrôles de la boucle", "todo"], ["Rétrospective", "todo"],
    ]);
  }
});

test("a full check repeated after the Codex verdict does not hide the external review", async () => {
  const session = stream.codexSession();
  const lines = [session.exploration, session.verdict, session.check, session.end].flat();
  const view = await codexView(lines);
  assert.equal(view.phase.label, "Relecture 1");
  assert.equal(view.cycles.at(-1).pending, true);
});

test("the review journal places external reviews after completed Codex turns without a verdict on disk", async () => {
  const session = stream.codexSession();
  const initial = [session.exploration, session.check, session.end].flat();
  const reviews = [{ at: stream.minutesAfter(10), verdict: "à corriger" }];
  const reviewed = await codexView(initial, reviews, { verdictStatus: null });
  assert.equal(reviewed.phase.label, "Relecture 1");
  assert.deepEqual(reviewed.cycles.map(({ rank, pending }) => [rank, pending]), [[1, false]]);
  const correction = await codexView([...initial, ...session.resume], reviews, { verdictStatus: null });
  assert.equal(correction.phase.label, "Correction");
  assert.ok(correction.timeline.some((entry) => entry.label === "Relecture 1" && entry.state === "done"));
});

test("an unfinished Codex turn and a completed partial verdict announce no pending external review", async () => {
  const session = stream.codexSession();
  const lines = [session.exploration, session.check].flat();
  const unfinished = await codexView(lines);
  assert.equal(unfinished.phase.label, "Contrôle complet");
  assert.deepEqual(unfinished.cycles, []);
  const partial = await codexView([...lines, ...session.end], [], { verdictStatus: "PARTIEL" });
  assert.equal(partial.phase.label, "Contrôle complet");
  assert.deepEqual(partial.cycles, []);
});

test("Codex recognises commands wrapped by its shell", async () => {
  const commands = ["/bin/zsh -lc 'node scripts/check.mjs'", '/bin/bash -c "node scripts/loop/reviewed-state.mjs record"'];
  const states = await Promise.all(commands.map(async (command) => {
    const [state] = await playSteps([[stream.codexItem("item.started", { id: "cmd", type: "command_execution", command })]], { engine: "codex" });
    return state.phase?.label ?? null;
  }));
  assert.deepEqual(states, ["Contrôle complet", "Enregistrement de l'état relu"]);
});

test("Codex decodes double-quoted shell envelopes before reading Python argument lists", async () => {
  const commands = [String.raw`/bin/zsh -lc "python3 - <<'PY'
import subprocess
command = [\"node\", \"scripts/check.mjs\"]
result = subprocess.run(command, text=True, capture_output=True)
print('\\n'.join(result.stdout.splitlines()))
PY"`, String.raw`/bin/zsh -lc "python3 - <<'PY'
command = [\"node\", \"scripts/check.mjs\", \"\$HOME\", \"\`pwd\`\", \"\\\\\"]
subprocess.run(command)
PY"`];
  for (const command of commands) {
    const item = stream.codexItem("item.started", { id: "cmd", type: "command_execution", command });
    const [state] = await playSteps([[item]], { engine: "codex" });
    assert.equal(state.phase?.label ?? null, "Contrôle complet", command);
  }
});

test("Codex decodes concatenated shell segments around dollar signs in Python command lists", async () => {
  const commands = [String.raw`/bin/zsh -lc "python3 - <<'PY'
commands = ['"'printf $HOME'"', 'node scripts/check.mjs']
for command in commands:
    subprocess.run(command, shell=True, text=True, capture_output=True)
PY"`, String.raw`/bin/bash -lc 'python3 - <<'"'PY'"'
commands = ['"'printf $HOME'"', '"'node scripts/check.mjs'"']
for command in commands:
    subprocess.run(command, shell=True)
PY'`];
  const phases = [];
  for (const command of commands) {
    const item = stream.codexItem("item.started", { id: "cmd", type: "command_execution", command });
    const [state] = await playSteps([[item]], { engine: "codex" });
    phases.push(state.phase?.label ?? null);
  }
  assert.deepEqual(phases, ["Contrôle complet", "Contrôle complet"]);
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

test("Codex recognises a full check executed by an enumerated Python command loop", async () => {
  const command = "python3 - <<'PY'\ncommands = [\n['node', '--test', 'tests/a.test.cjs'],\n" +
    "['node', 'scripts/check.mjs'],\n]\nfor index, command in enumerate(commands):\n" +
    "    result = subprocess.run(command, capture_output=True, text=True)\nPY";
  const item = stream.codexItem("item.started", { id: "cmd", type: "command_execution", command });
  const [state] = await playSteps([[item]], { engine: "codex" });
  assert.equal(state.phase?.label ?? null, "Contrôle complet");
});

test("Codex recognises full checks in Python command lists written directly in a for loop", async () => {
  const phases = [];
  for (const check of ["['node', 'scripts/check.mjs']", "['node', 'scripts/check.mjs', '--changed']"]) {
    const command = `/bin/zsh -lc "python3 - <<'PY'\nresults = []\n` +
      `for command in [['git', 'diff', '--check'], ${check}, ['git', 'apply', '--check', str(state / 'skill.patch')]]:\n` +
      " result = subprocess.run(command, text=True, capture_output=True)\n" +
      " results.append(' '.join(command) + result.stdout + result.stderr)\nPY\"";
    const item = stream.codexItem("item.started", { id: "cmd", type: "command_execution", command });
    const [state] = await playSteps([[item]], { engine: "codex" });
    phases.push(state.phase?.label ?? null);
  }
  assert.deepEqual(phases, ["Contrôle complet", null]);
});

test("Codex recognises Python argument lists with a trailing comma", async () => {
  const bodies = [
    "command = [\n'node',\n'scripts/check.mjs',\n]\nsubprocess.run(command)",
    "subprocess.run([\n'node',\n'scripts/check.mjs',\n])",
  ];
  for (const body of bodies) {
    const command = `python3 - <<'PY'\n${body}\nPY`;
    const item = stream.codexItem("item.started", { id: "cmd", type: "command_execution", command });
    const [state] = await playSteps([[item]], { engine: "codex" });
    assert.equal(state.phase?.label ?? null, "Contrôle complet", body);
  }
});

test("Codex recognises Python literal strings passed directly to subprocess with the shell option", async () => {
  const phases = [];
  const bodies = [
    "subprocess.run('node scripts/check.mjs', shell=True)",
    'subprocess.run("node scripts/check.mjs", cwd=str(root), shell=True)',
    "subprocess.run('node scripts/check.mjs --changed', shell=True)",
    "subprocess.run('git diff -- scripts/check.mjs', shell=True)",
    "subprocess.run('node scripts/check.mjs')",
    "subprocess.run('node scripts/check.mjs', text=True)",
  ];
  for (const body of bodies) {
    const command = `python3 - <<'PY'\n${body}\nPY`;
    const item = stream.codexItem("item.started", { id: "cmd", type: "command_execution", command });
    const [state] = await playSteps([[item]], { engine: "codex" });
    phases.push(state.phase?.label ?? null);
  }
  assert.deepEqual(phases, ["Contrôle complet", "Contrôle complet", null, null, null, null]);
});

test("Codex examines each shell command in a Python loop independently", async () => {
  const cases = [
    { commands: ["node --test tests/a.test.cjs", "git diff -- scripts/check.mjs"], phase: null },
    { commands: ["git diff -- scripts/check.mjs", "node --test tests/a.test.cjs"], phase: null },
    { commands: ["node scripts/check.mjs", "node scripts/check.mjs --changed"], phase: "Contrôle complet" },
    { commands: ["node scripts/check.mjs --changed", "node scripts/check.mjs"], phase: "Contrôle complet" },
  ];
  const results = [];
  for (const argument of ["", "cwd=str(root), ", "env=dict(os.environ, MODE='test'), ", "timeout=int('60'), "]) {
    for (const direct of [false, true]) {
      for (const { commands, phase } of cases) {
        const list = JSON.stringify(commands);
        const body = direct ? `subprocess.run(${list}, ${argument}shell=True)` :
          `commands = ${list}\nfor command in commands:\n    subprocess.run(command, ${argument}shell=True)`;
        const command = `python3 - <<'PY'\n${body}\nPY`;
        const item = stream.codexItem("item.started", { id: "cmd", type: "command_execution", command });
        const [state] = await playSteps([[item]], { engine: "codex" });
        results.push({ body, actual: state.phase?.label ?? null, expected: phase });
      }
    }
  }
  assert.deepEqual(results.map(({ body, actual }) => ({ body, phase: actual })),
    results.map(({ body, expected }) => ({ body, phase: expected })));
});

test("Codex does not treat a Python command argument as the shell option", async () => {
  const command = "python3 - <<'PY'\nsubprocess.run(['node', 'scripts/check.mjs', 'shell=True'])\nPY";
  const item = stream.codexItem("item.started", { id: "cmd", type: "command_execution", command });
  const [state] = await playSteps([[item]], { engine: "codex" });
  assert.equal(state.phase?.label ?? null, "Contrôle complet");
});

test("Codex reads full checks in shell lists containing triple-quoted Python strings", async () => {
  const body = String.raw`from pathlib import Path
import subprocess
commands = [
'node_modules/.bin/prettier --version',
'''node -p "require('./package.json').devDependencies.prettier"''',
'node_modules/.bin/prettier --check .',
'npm run format:check',
'node scripts/check.mjs --no-tests',
'node scripts/check.mjs',
]
files = ['film/package.json', 'promo/package.json']
commands += ['node_modules/.bin/prettier --file-info ' + f for f in files]
commands += [
'''node -e 'const block = ["**/*.js", "**/*.cjs", "**/*.mjs"];
console.log(block.join("\\n"));' ''',
'node_modules/.bin/prettier --find-config-path core/ports.cjs',
'node scripts/check.mjs --changed',
'git diff --check',
]
for command in commands:
    result = subprocess.run(command, shell=True, text=True, capture_output=True)`;
  const phases = [];
  for (const source of [body, body.replace("'node scripts/check.mjs',\n", "")]) {
    const command = `/bin/zsh -lc "python3 - <<'PY'\n${source.replace(/[\\"$`]/g, "\\$&")}\nPY"`;
    const item = stream.codexItem("item.started", { id: "cmd", type: "command_execution", command });
    const [state] = await playSteps([[item]], { engine: "codex" });
    phases.push(state.phase?.label ?? null);
  }
  assert.deepEqual(phases, ["Contrôle complet", null]);
});

test("Codex reads full checks beside raw Python strings without treating quoted brackets as delimiters", async () => {
  const literals = [String.raw`r'printf "[(]\\n"'`, String.raw`R"printf '[(]\\n'"`,
    String.raw`r'''node -p "['[', ')'].join('\\n')"'''`, String.raw`R"""node -p "['[', ')'].join('\\n')"""`];
  const phases = [];
  for (const literal of literals) {
    for (const check of ["node scripts/check.mjs", "node scripts/check.mjs --changed"]) {
      const command = `python3 - <<'PY'\ncommands = [${literal}, '${check}']\n` +
        "for command in commands:\n    subprocess.run(command, cwd=str(root), shell=True)\nPY";
      const item = stream.codexItem("item.started", { id: "cmd", type: "command_execution", command });
      const [state] = await playSteps([[item]], { engine: "codex" });
      phases.push(state.phase?.label ?? null);
    }
  }
  assert.deepEqual(phases, ["Contrôle complet", null, "Contrôle complet", null, "Contrôle complet", null, "Contrôle complet", null]);
});

test("Codex reads literal shell commands appended after a computed Python list extension", async () => {
  const phases = [];
  for (const check of ["node scripts/check.mjs", "node scripts/check.mjs --changed"]) {
    const body = String.raw`commands = [
'''node -p "require('./package.json').devDependencies.prettier"''',
'node scripts/check.mjs --no-tests',
]
files = ['film/package.json', 'promo/package.json']
commands += ['node_modules/.bin/prettier --file-info ' + f for f in files]
commands += [
'''node -e 'console.log(["**/*.js", "**/*.cjs", "**/*.mjs"].join("\\n"));' ''',
r'${check}',
'git diff --check',
]
for command in commands:
    result = subprocess.run(command, shell=True, text=True, capture_output=True)`;
    const command = `/bin/zsh -lc "python3 - <<'PY'\n${body.replace(/[\\"$`]/g, "\\$&")}\nPY"`;
    const item = stream.codexItem("item.started", { id: "cmd", type: "command_execution", command });
    const [state] = await playSteps([[item]], { engine: "codex" });
    phases.push(state.phase?.label ?? null);
  }
  assert.deepEqual(phases, ["Contrôle complet", null]);
});

test("Codex command starts and completions show each phase once within the same turn", async () => {
  const lines = [...stream.codexSession().exploration];
  const commands = [
    { id: "check", command: "node scripts/check.mjs" },
    { id: "verdict", command: "python3 - <<'PY'\nPath('verdict.json').write_text('{}')\nPY" },
  ];
  for (const item of commands) {
    lines.push(stream.codexItem("item.started", { ...item, type: "command_execution", status: "in_progress" }));
    lines.push(stream.codexItem("item.completed", { ...item, type: "command_execution", status: "completed", exit_code: 0 }));
  }
  const view = await codexView(lines);
  assert.deepEqual(view.timeline.map(({ label, state }) => [label, state]), [
    ["Exploration", "done"], ["Contrôle complet", "done"], ["Verdict", "current"],
    ["Relecture", "todo"], ["Contrôles de la boucle", "todo"], ["Rétrospective", "todo"],
  ]);
});

test("consecutive Codex correction sessions without recognised commands preserve each correction and external review", async () => {
  const session = stream.codexSession();
  const write = stream.codexItem("item.completed", { id: "write", type: "command_execution",
    command: "python3 - <<'PY'\njson.dump(v, open('verdict.json', 'w'))\nPY" });
  const initial = [session.exploration, session.end].flat();
  const second = [...initial, ...session.resume, write, ...session.end];
  const reviews = [10, 20].map((minutes) => ({ at: stream.minutesAfter(minutes), verdict: "à corriger" }));
  const resumed = [...second, ...session.resume, write];
  const correction = await codexView(resumed, reviews);
  const pending = await codexView([...resumed, ...session.end], reviews);
  assert.deepEqual([correction.phase.label, pending.phase.label], ["Correction", "Relecture 3"]);
  assert.deepEqual(correction.timeline.filter(({ state }) => state !== "todo").map(({ label, state }) => [label, state]), [
    ["Exploration", "done"], ["Relecture 1", "done"], ["Correction", "done"], ["Relecture 2", "done"], ["Correction", "current"],
  ]);
  assert.deepEqual(correction.timeline.filter(({ state }) => state === "todo").map(({ label }) => label), [
    "Contrôle complet", "Verdict", "Relecture", "Contrôles de la boucle", "Rétrospective",
  ]);
  assert.deepEqual(pending.cycles.map(({ rank, pending }) => [rank, pending]), [[1, false], [2, false], [3, true]]);
  assert.ok(pending.timeline.some(({ label, state }) => label === "Relecture 3" && state === "current"));
});
