// Une session externe factice permet de vérifier le protocole sans appeler de fournisseur réel.
const CODEX_SESSION = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const dir = path.join(".harness-state", "tickets", process.env.TVLENS_TICKET);
fs.mkdirSync(dir, { recursive: true });
const args = process.argv.slice(2);
if (args[0] === "mcp") {
  fs.appendFileSync(path.join(dir, "fake-mcp-calls"), JSON.stringify({ args, cwd: process.cwd() }) + "\\n");
  console.log(process.env.FAKE_CODEX_MCP_LIST || JSON.stringify([
    { name: "docs", enabled: true }, { name: "offline", enabled: false },
  ]));
  process.exit(process.env.FAKE_CODEX_MCP_FAILURE ? 1 : 0);
}
if (args.includes("--help")) {
  fs.appendFileSync(path.join(dir, "fake-help-calls"), JSON.stringify({ args, cwd: process.cwd() }) + "\\n");
  const unsupported = process.env.FAKE_CODEX_UNSUPPORTED_RESUME;
  if (args[0] === "exec" && args[1] === "resume" && unsupported && args.includes(unsupported)) {
    console.error("unexpected argument: " + unsupported);
    process.exit(1);
  }
  console.log("--disable <FEATURE> --add-dir <DIR>");
  process.exit(0);
}
const scenario = process.env.FAKE_CODEX_SCENARIO;
const resumeFailure = args[1] === "resume" && process.env.FAKE_CODEX_RESUME_FAILURE;
let failure = resumeFailure === "after-turn" ? "exit" : process.env.FAKE_CODEX_FAILURE;
const calls = path.join(dir, "fake-codex-calls");
const rank = fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split("\\n").length : 0;
failure = JSON.parse(process.env.FAKE_CODEX_FAILURES || "null")?.[rank] ?? failure;
const resumedSession = process.env.FAKE_CODEX_RESUME_SESSION || args[2];
const session = args[1] === "resume" ? resumedSession : "codex-thread-" + (rank + 1);
const blocked = scenario === "blocked" || (scenario === "blocked-after-correction" && rank > 0);
const names = ["LOOP", "TICKET", "TICKET_FILE", "HARNESS", "ALLOW_INSTALL"];
const env = Object.fromEntries(names.map(name => [name, process.env["TVLENS_" + name]]));
const stdinIsDevice = fs.fstatSync(0).isCharacterDevice();
// Une régression vers un pipe doit échouer sur une assertion, sans attendre sa fermeture.
const stdin = stdinIsDevice ? fs.readFileSync(0, "utf8") : null;
const call = {
  args, cwd: process.cwd(), stdin, stdinIsDevice, env, engine: process.env.TVLENS_ENGINE,
  loopPid: process.ppid, loopLock: fs.readFileSync(".harness-state/loop/lock", "utf8"),
  session, run: process.env.TVLENS_HOOK_RUN, greetingPresent: fs.existsSync("core/greeting.cjs"),
};
fs.appendFileSync(calls, JSON.stringify(call) + "\\n");
if (process.env.FAKE_CODEX_HOOKS !== "missing" && !(rank > 0 && process.env.FAKE_CODEX_HOOKS === "missing-on-correction") &&
    !(args[1] === "resume" && process.env.FAKE_CODEX_HOOKS === "missing-on-resume")) {
  const { spawnSync } = require("node:child_process");
  const input = { cwd: process.cwd(), session_id: session, hook_event_name: "SessionStart" };
  const started = spawnSync(process.execPath, [".claude/hooks/session-context.mjs"], { input: JSON.stringify(input), encoding: "utf8" });
  if (started.status !== 0) throw new Error("startup hook failed: " + started.stdout + started.stderr);
  fs.appendFileSync(path.join(dir, "fake-hook-witnesses"), fs.readFileSync(path.join(dir, "hooks-started.json"), "utf8").trim() + "\\n");
}
if (args[1] === "resume" && process.env.FAKE_CODEX_HOOKS === "stale-on-resume") {
  const previous = JSON.parse(fs.readFileSync(calls, "utf8").split("\\n")[0]);
  fs.writeFileSync(path.join(dir, "hooks-started.json"), JSON.stringify({ session, run: previous.run }));
}
if (resumeFailure === "before-turn") {
  console.log(JSON.stringify({ type: "thread.started", thread_id: session }));
  console.log(JSON.stringify({ type: "error", message: "resume unavailable before turn" }));
  process.exit(1);
}
fs.mkdirSync("core", { recursive: true });
if (!blocked) fs.writeFileSync("core/greeting.cjs", "module.exports = () => 'hello';\\n");
if (process.env.FAKE_UNTRACKED_CHANGE) {
  const file = path.join(dir, "untracked-before.json");
  const before = JSON.parse(fs.readFileSync(file, "utf8"));
  if (process.env.FAKE_UNTRACKED_CHANGE === "add") before.push("core/greeting.cjs");
  if (process.env.FAKE_UNTRACKED_CHANGE === "remove") before.pop();
  fs.writeFileSync(file, JSON.stringify(before));
  if (process.env.FAKE_UNTRACKED_CHANGE === "delete") fs.rmSync(file);
}
if (process.env.FAKE_CODEX_EDIT) {
  const file = process.env.FAKE_CODEX_EDIT;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, "\\n// La doublure simule une modification interdite du harnais.\\n");
}
const verdict = {
  statut: blocked ? "BLOQUÉ" : "TERMINÉ", resume: blocked ? "Quel fournisseur choisir ?" : "fake codex",
  preuves: ["fake proof"], reste: JSON.parse(process.env.FAKE_CODEX_RESERVES || "[]"),
};
if (scenario === "partial") verdict.statut = "PARTIEL";
if (scenario !== "missing-verdict") fs.writeFileSync(path.join(dir, "verdict.json"), JSON.stringify(verdict));
if (scenario === "unreadable-verdict") fs.writeFileSync(path.join(dir, "verdict.json"), "{ incomplete");
if (rank > 0 && process.env.FAKE_CODEX_REVIEW_STATE) {
  const file = path.join(dir, "reviewed-state.json");
  const change = process.env.FAKE_CODEX_REVIEW_STATE;
  if (change === "corrupt") fs.writeFileSync(file, "{ incomplete");
  if (change === "missing") fs.rmSync(file, { force: true });
  if (change === "legacy") {
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    delete state.arbre;
    fs.writeFileSync(file, JSON.stringify(state));
  }
}
const events = [
  { type: "thread.started", thread_id: session },
  { type: "turn.started" },
  { type: "item.completed", item: { type: "command_execution", command: "node --test", exit_code: 0, status: "completed" } },
  { type: "item.completed", item: { type: "file_change", changes: [{ path: "core/greeting.cjs", kind: "add" }], status: "completed" } },
  { type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 5, reasoning_output_tokens: 2 } },
];
if (process.env.FAKE_CODEX_SCENARIO === "actions") {
  events.splice(2, 2,
    { type: "item.started", item: { type: "command_execution", command: "pending command" } },
    { type: "item.completed", item: { type: "command_execution", command: "node\\n --test" } },
    { type: "item.completed", item: { type: "file_change", changes: [
      { path: path.resolve("core/greeting.cjs"), kind: "update" }, { path: "core/farewell.cjs", kind: "delete" },
    ] } },
  );
}
const reconnects = Number(JSON.parse(process.env.FAKE_CODEX_RECONNECTIONS || "[]")[rank] || 0);
for (let i = 0; i < reconnects; i++) {
  events.splice(2 + i, 0, { type: "error", message: "transport interrupted " + (i + 1) });
}
if (failure === "unfinished-error") {
  events.splice(events.length - 1, 1, { type: "error", message: "transport never recovered" });
}
if (failure === "failed-then-completed") events.splice(events.length - 1, 0, { type: "turn.failed", error: { message: "explicit failure" } });
if (["turn.failed", "error"].includes(failure)) events.push({ type: failure, error: { message: "simulated Codex failure" } });
for (const event of events) console.log(JSON.stringify(event));
if (failure === "exit") process.exitCode = 1;
`;

module.exports = { CODEX_SESSION };
