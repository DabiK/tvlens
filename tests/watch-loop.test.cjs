const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const stream = require("./helpers/loop-stream.cjs");
const { fakeRoot, snapshot, MINUTE_MS } = require("./helpers/loop-state-dir.cjs");

const { loopView } = stream;
const script = (relative) => path.join(__dirname, "..", relative);
const readerModule = () => import(pathToFileURL(script("scripts/watch-loop/reader.mjs")).href);

/** Un faux projet qui disparaît à la fin du test. */
function project(t, options) {
  const fake = fakeRoot(options);
  t.after(fake.remove);
  return fake;
}

// --- Le lecteur : ce qu'il lit sur le disque, et comment ---

test("the reader gathers the events, the lock, the tickets, the reviews and the session stream of the current ticket", async (t) => {
  const { root } = project(t);
  const { createReader } = await readerModule();
  const state = createReader(root).read(Date.now());
  assert.equal(state.events.length, 4);
  assert.deepEqual([state.loop.alive, state.loop.pid], [true, process.pid]);
  assert.ok(Math.abs(state.loop.launchedAt - (Date.now() - 90 * MINUTE_MS)) < 5000, "the launch is the time the lock was written");
  assert.deepEqual(state.tickets.map((ticket) => ticket.id), ["T001", "T015", "T016"]);
  assert.deepEqual(state.reviews.map((review) => review.verdict), ["à corriger", "accepté"]);
  assert.deepEqual(Object.keys(state.reports), ["1", "2"]);
  assert.equal(state.stream.phase.label, "Contrôle complet");
});

test("the reader reads the session stream by increments and never reads again what it has read", async (t) => {
  const { root, sessionFile } = project(t);
  const { createReader } = await readerModule();
  const { emptySession, foldSession } = await loopView();
  const all = fs.readFileSync(sessionFile, "utf8");
  const cut = all.indexOf("\n", Math.floor(all.length / 2)) + 12;
  fs.writeFileSync(sessionFile, all.slice(0, cut));
  const reader = createReader(root);
  const first = reader.read(Date.now());
  // Ce qui est déjà lu est écrasé, sur la même taille : seul un lecteur qui repart du début s'en apercevrait.
  const readPart = all.slice(0, all.lastIndexOf("\n", cut) + 1);
  fs.writeFileSync(sessionFile, "x".repeat(readPart.length) + all.slice(readPart.length));
  const second = reader.read(Date.now());
  const whole = foldSession(emptySession(), all.split("\n").filter(Boolean), { root });
  assert.ok(first.stream.history.length < whole.history.length, "the line cut in the middle is not read yet");
  assert.deepEqual(second.stream, whole);
});

test("a character cut in two by a read is read whole once the rest has been written", async (t) => {
  const { root, sessionFile } = project(t);
  const { createReader } = await readerModule();
  const line = stream.assistant([stream.toolUse("x", "Bash", { command: "ls", description: "Créer le résumé" })]);
  const bytes = Buffer.from(`${line}\n`);
  fs.writeFileSync(sessionFile, bytes.subarray(0, bytes.indexOf(Buffer.from("é")) + 1));
  const reader = createReader(root);
  assert.equal(reader.read(Date.now()).stream.actions.length, 0);
  fs.writeFileSync(sessionFile, bytes);
  assert.equal(reader.read(Date.now()).stream.actions[0].target, "Créer le résumé");
});

test("a session stream that starts over is read from its beginning", async (t) => {
  const { root, write, sessionFile } = project(t);
  const { createReader } = await readerModule();
  const { emptySession, foldSession } = await loopView();
  const session = stream.fullSession();
  const reader = createReader(root);
  fs.writeFileSync(sessionFile, session.exploration.join("\n") + "\n");
  assert.equal(reader.read(Date.now()).stream.phase.label, "Exploration");
  // Une boucle relancée écrit la même session de zéro, plus longue que ce qui était lu : seul l'événement dit qu'elle a recommencé.
  const full = stream.sessionUpTo("implementation", "record1", "review1");
  fs.writeFileSync(sessionFile, full.join("\n") + "\n");
  const events = fs.readFileSync(path.join(root, ".harness-state/loop/events.jsonl"), "utf8");
  write(".harness-state/loop/events.jsonl", events + JSON.stringify({ ...stream.sessionEvent(0, "T015"), at: new Date().toISOString() }) + "\n");
  const restarted = reader.read(Date.now());
  assert.deepEqual(restarted.stream, foldSession(emptySession(), full, { root }));
});

test("a session stream that shrinks is read from its beginning", async (t) => {
  const { root, sessionFile } = project(t);
  const { createReader } = await readerModule();
  const reader = createReader(root);
  assert.equal(reader.read(Date.now()).stream.phase.label, "Contrôle complet");
  fs.writeFileSync(sessionFile, stream.fullSession().exploration.join("\n") + "\n");
  assert.deepEqual(reader.read(Date.now()).stream.history.map((entry) => entry.label), ["Exploration"]);
});

test("a project without any state is read as a stopped loop with nothing in it", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "loop-view-empty-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { createReader } = await readerModule();
  const state = createReader(root).read(Date.now());
  assert.deepEqual([state.events, state.tickets, state.reviews, state.reports], [[], [], [], {}]);
  assert.deepEqual(state.loop, { alive: false, pid: null, launchedAt: null, maxTickets: null, retrospective: true });
  assert.equal(state.stream.phase, null);
});

test("event lines that are not JSON or not objects are skipped", async (t) => {
  const { root, write } = project(t);
  const { createReader } = await readerModule();
  const events = fs.readFileSync(path.join(root, ".harness-state/loop/events.jsonl"), "utf8");
  write(".harness-state/loop/events.jsonl", `${events}not json\nnull\n42\n[1]\n{"at":"2026-10-14T1`);
  assert.equal(createReader(root).read(Date.now()).events.length, 4);
});

test("the loop is stopped when the process of the lock does not live", async (t) => {
  const { root } = project(t);
  const { createReader } = await readerModule();
  const { loop } = createReader(root, { isRunning: () => false }).read(Date.now());
  assert.deepEqual(loop, { alive: false, pid: process.pid, launchedAt: null, maxTickets: null, retrospective: true });
});

test("the number of tickets the loop was asked to take comes from its command line, if the process is a loop", async (t) => {
  const { root } = project(t);
  const { createReader } = await readerModule();
  const maxOf = (command) => createReader(root, { commandOf: () => command }).read(Date.now()).loop.maxTickets;
  assert.equal(maxOf("node scripts/loop/run.mjs --max 17"), 17);
  assert.equal(maxOf("node scripts/loop/run.mjs --no-push --max 5"), 5);
  assert.equal(maxOf("node scripts/loop/run.mjs"), 1);
  assert.equal(maxOf("node something-else.js --max 9"), null);
  assert.equal(maxOf(null), null);
});

// --- L'affichage de bout en bout : node scripts/watch-loop.mjs --once ---

// Un délai : si le script se mettait à redessiner sans fin, le test échouerait au lieu de rester bloqué.
const WATCH_TIMEOUT_MS = 20000;

function watch(args, env = {}) {
  const options = { encoding: "utf8", env: { ...process.env, TZ: "UTC", ...env }, timeout: WATCH_TIMEOUT_MS, killSignal: "SIGKILL" };
  const run = spawnSync(process.execPath, [script("scripts/watch-loop.mjs"), ...args], options);
  return { code: run.status, out: run.stdout, err: run.stderr };
}

test("--once prints one screen that names the ticket, its phase and its review cycles, then exits", (t) => {
  const { root } = project(t);
  const { code, out } = watch(["--root", root, "--once"]);
  assert.equal(code, 0);
  for (const expected of ["T015", "Second ticket, in progress", "Contrôle complet", "Cycles de relecture : 2", "Restants : 1 (T016)", "boucle vivante"]) {
    assert.ok(out.includes(expected), `missing « ${expected} » in:\n${out}`);
  }
  assert.ok(!out.includes("\x1b"), "a screen printed once is plain text");
});

test("--once leaves the project exactly as it found it", (t) => {
  const { root } = project(t);
  const before = snapshot(root);
  watch(["--root", root, "--once"]);
  assert.deepEqual(snapshot(root), before);
});

test("--once says the loop is stopped when the lock is absent or names a process that is gone", (t) => {
  const gone = spawnSync(process.execPath, ["-e", ""]).pid;
  for (const lock of [null, String(gone)]) {
    const { root } = project(t, { lock });
    const { code, out } = watch(["--root", root, "--once"]);
    assert.equal(code, 0);
    assert.ok(out.includes("Boucle arrêtée"), `lock ${lock}: ${out}`);
    assert.ok(out.includes("Cycles de relecture : 2"));
  }
});

test("without a terminal, a run without --once still prints one screen and exits", (t) => {
  const { root } = project(t);
  const { code, out } = watch(["--root", root]);
  assert.equal(code, 0);
  assert.ok(out.includes("T015"));
  assert.ok(!out.includes("\x1b[?1049h"), "no alternate screen when the output is not a terminal");
});

test("an unknown option or a missing folder is refused with a message and a code", (t) => {
  const refused = watch(["--nope"]);
  assert.equal(refused.code, 2);
  assert.match(refused.err, /Usage/);
  const missing = watch(["--root", path.join(os.tmpdir(), "loop-view-no-such-folder"), "--once"]);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /introuvable/);
});

test("a process counts as living unless the system says it does not exist", async () => {
  const { processLives } = await readerModule();
  const failing = (code) => () => {
    throw Object.assign(new Error(code), { code });
  };
  assert.equal(processLives(4242, () => true), true);
  assert.equal(processLives(4242, failing("ESRCH")), false);
  assert.equal(processLives(4242, failing("EPERM")), true);
});

test("a ticket identifier from the events cannot lead the reader outside the folder of the tickets", async (t) => {
  const { root, write } = project(t);
  const { createReader } = await readerModule();
  const odd = { ...stream.sessionEvent(0, "../../outside"), at: new Date().toISOString() };
  const events = fs.readFileSync(path.join(root, ".harness-state/loop/events.jsonl"), "utf8");
  write(".harness-state/loop/events.jsonl", `${events}${JSON.stringify(odd)}\n`);
  write("outside/session-1.jsonl", stream.fullSession().exploration.join("\n") + "\n");
  write("outside/relectures.jsonl", JSON.stringify({ at: new Date().toISOString(), verdict: "accepté" }) + "\n");
  const state = createReader(root).read(Date.now());
  assert.deepEqual([state.stream.phase, state.reviews], [null, []]);
});

test("the reader gets the retrospective setting from the loop command", async (t) => {
  const { root } = project(t);
  const { createReader } = await readerModule();
  const read = (command) => createReader(root, { commandOf: () => command }).read(Date.now());
  assert.equal(read("node scripts/loop/run.mjs --no-retro").loop.retrospective, false);
  assert.equal(read("node scripts/loop/run.mjs").loop.retrospective, true);
});

test("a reader waiting for the first ticket ignores the previous launch stream and reviews", async (t) => {
  const { root, write } = project(t);
  const { createReader } = await readerModule();
  write(".harness-state/loop/events.jsonl", JSON.stringify(stream.sessionEvent(-200, "T015")) + "\n");
  const state = createReader(root, { commandOf: () => null }).read(Date.now());
  assert.deepEqual([state.stream.phase, state.stream.actions, state.reviews, state.reports], [null, [], [], {}]);
});

const terminalModule = () => import(pathToFileURL(script("scripts/watch-loop/terminal.mjs")).href);

function terminalHarness() {
  const { EventEmitter } = require("node:events");
  const lifecycle = new EventEmitter();
  const writes = [];
  const output = { rows: 4, write: (text) => writes.push(text) };
  return { output, lifecycle, writes, schedule: () => {}, reportError: (error) => { throw error; } };
}

// Le curseur xterm reste sur la dernière colonne après un texte pleine largeur : K et J l'effacent incluse.
function terminalRows(text, columns) {
  const rows = [Array(columns).fill(" ")];
  let row = 0;
  let column = 0;
  for (const token of text.match(/\x1b\[[?0-9;]*[A-Za-z]|[^\x1b]/gu) || []) {
    if (token === "\x1b[H") { row = 0; column = 0; }
    else if (token === "\x1b[K" || token === "\x1b[J") rows[row].fill(" ", column);
    else if (token === "\n") { row++; column = 0; rows[row] ||= Array(columns).fill(" "); }
    else if (!token.startsWith("\x1b")) { rows[row][column] = token; column = Math.min(columns - 1, column + 1); }
  }
  return rows.map((line) => line.join(""));
}

test("drawing full-width lines preserves the clock digit and the final ellipsis", async () => {
  const { watch: start } = await terminalModule();
  const harness = terminalHarness();
  start(() => ["12:34", "abcd…"], harness);
  assert.deepEqual(terminalRows(harness.writes.join(""), 5).slice(0, 2), ["12:34", "abcd…"]);
});

test("suspending restores the shell before stopping and continuing re-enters and redraws the screen", async () => {
  const { watch: start } = await terminalModule();
  const harness = terminalHarness();
  let refresh;
  const stops = [];
  harness.schedule = (callback) => { refresh = callback; };
  harness.stop = () => stops.push(harness.writes.at(-1));
  start(() => ["current frame"], harness);
  harness.lifecycle.emit("SIGTSTP");
  assert.deepEqual(stops, ["\x1b[?25h\x1b[?1049l"]);
  const suspendedWrites = harness.writes.length;
  refresh();
  assert.equal(harness.writes.length, suspendedWrites);
  harness.lifecycle.emit("SIGCONT");
  assert.equal(harness.writes.at(-2), "\x1b[?1049h\x1b[?25l");
  assert.ok(harness.writes.at(-1).includes("current frame"));
  harness.lifecycle.emit("exit");
  assert.equal(harness.writes.at(-1), "\x1b[?25h\x1b[?1049l");
  const exitedWrites = harness.writes.length;
  harness.lifecycle.emit("exit");
  assert.equal(harness.writes.length, exitedWrites);
});

test("the reader selects a Codex stream by engine and keeps reading appended corrections in the same file", async (t) => {
  const { root, write } = project(t);
  const { createReader } = await readerModule();
  const { buildView } = await loopView();
  const session = stream.codexSession();
  const started = stream.sessionEvent(0, "T015", 1, { moteur: "codex", modele: "gpt-6-astra" });
  write(".harness-state/loop/events.jsonl", JSON.stringify(started) + "\n");
  write(".harness-state/tickets/T015/relectures.jsonl", "");
  const file = write(".harness-state/tickets/T015/codex-1.jsonl", session.exploration.join("\n") + "\n");
  const reader = createReader(root, { commandOf: () => "node scripts/loop/run.mjs", isRunning: () => false });
  const first = reader.read(stream.START);
  assert.equal(first.stream.phase.label, "Exploration");
  assert.equal(buildView(first).ticket.moteur, "codex");
  fs.appendFileSync(file, [...session.implementation, ...session.check, ...session.verdict, ...session.end].join("\n") + "\n");
  write(".harness-state/tickets/T015/verdict.json", JSON.stringify({ statut: "TERMINÉ" }));
  const done = reader.read(stream.START);
  assert.equal(done.stream.result.turns, 1);
  assert.equal(done.verdictStatus, "TERMINÉ");
  write(".harness-state/tickets/T015/relectures.jsonl", JSON.stringify({ at: stream.minutesAfter(10), verdict: "à corriger" }) + "\n");
  fs.appendFileSync(file, session.resume.join("\n") + "\n");
  const resumed = reader.read(stream.START);
  assert.equal(resumed.stream.turnsStarted, 2);
  assert.equal(resumed.reviews.length, 1);
  assert.equal(resumed.reports[1], stream.REPORT_FIX);
});

test("a Codex screen shows its model and a failed command while leaving the fake project untouched", (t) => {
  const { root, write } = project(t, { lock: null });
  const session = stream.codexSession();
  const event = stream.sessionEvent(0, "T015", 1, { moteur: "codex", modele: "gpt-6-astra" });
  write(".harness-state/loop/events.jsonl", JSON.stringify(event) + "\n");
  const failure = stream.codexItem("item.completed", { id: "failed-command", type: "command_execution",
    command: "node --test tests/example.test.cjs", status: "failed", exit_code: 2 });
  const noise = ["not JSON", "null", "[]", '{"type":"item.completed","item":null}'];
  write(".harness-state/tickets/T015/codex-1.jsonl", [...session.exploration, ...noise, failure].join("\n") + "\n");
  const before = snapshot(root);
  const { code, out } = watch(["--root", root, "--once"]);
  assert.equal(code, 0);
  assert.match(out, /Codex \(GPT-6 Astra\), effort high/);
  assert.match(out, /Bash.*échec 2.*node --test/);
  assert.deepEqual(snapshot(root), before);
});
