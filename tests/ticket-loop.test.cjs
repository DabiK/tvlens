const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { harnessRepo } = require("./helpers/harness-repo.cjs");

const tickets = () => import(pathToFileURL(path.join(__dirname, "..", "scripts/loop/tickets.mjs")).href);

function ticketText(fields = {}, body = "") {
  const meta = { id: "T001", titre: "Add the greeting", statut: "a-faire", bloque_par: "", adr: "non", ...fields };
  const header = Object.entries(meta).map(([key, value]) => `${key}: ${value}`).join("\n");
  const criteria = "## Critères d'acceptation\n\n1. The greeting says hello.\n";
  return `---\n${header}\n---\n\n${criteria}${body}\n## Journal\n\n`;
}

// Fausse session Claude Code : joue un scénario écrit d'avance au lieu d'appeler un modèle.
const FAKE_SESSION = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const id = process.env.TVLENS_TICKET;
const dir = path.join(".harness-state", "tickets", id);
fs.mkdirSync(dir, { recursive: true });
const argument = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
// Rétrospective : une session courte en lecture seule qui rend des observations structurées.
if (process.env.TVLENS_RETRO === "1") {
  const call = { model: argument("--model"), tools: argument("--tools"), loop: process.env.TVLENS_LOOP ?? null, prompt: argument("-p") };
  fs.writeFileSync(path.join(dir, "fake-retro-call"), JSON.stringify(call));
  if (process.env.FAKE_RETRO === "fail") process.exit(1);
  const observation = { sujet: "reviewer", constat: "found", preuve: "session-1.jsonl", proposition: "keep", cible: "agent", impact: "moyen" };
  const observations = [{ type: "bien", ...observation }, { type: "probleme", ...observation, cible: "boucle", impact: "fort" }];
  console.log(JSON.stringify({ type: "result", total_cost_usd: 0.2, structured_output: { observations } }));
  process.exit(0);
}
const plan = { model: argument("--model"), effort: argument("--effort"), review: process.env.TVLENS_REVIEW_MODEL ?? null };
fs.appendFileSync(path.join(dir, "fake-plans"), JSON.stringify(plan) + "\\n");
const counter = path.join(dir, "fake-attempts");
const attempt = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, "utf8")) : 0) + 1;
fs.writeFileSync(counter, String(attempt));
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const verdict = (statut, extra = {}) => write(path.join(dir, "verdict.json"), JSON.stringify({ statut, resume: "fake", ...extra }));
const greeting = () => write("core/greeting.cjs", "module.exports = () => 'hello';\\n");
const { spawnSync } = require("node:child_process");
// Enregistre l'état relu comme le fait l'orchestrateur avant chaque relecture ; sortie capturée, hors du flux de la session.
const record = () => {
  const result = spawnSync(process.execPath, ["scripts/loop/reviewed-state.mjs", "record"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error("record failed: " + result.stdout + result.stderr);
};
// Le relecteur rend la main : Claude Code passe son rapport au hook qui en enregistre le verdict.
const handBack = (text) => {
  const input = { tool_name: "Agent", tool_input: { subagent_type: "relecteur" }, tool_response: { handbackReport: { text } } };
  const result = spawnSync(process.execPath, [".claude/hooks/record-review.mjs"], { input: JSON.stringify(input), encoding: "utf8" });
  if (result.status !== 0) throw new Error("review hook failed: " + result.stdout + result.stderr);
};
const review = (text = "VERDICT : accepté") => {
  record();
  handBack(text);
};
const scenario = process.env.FAKE_SCENARIO;
if (scenario === "silent") process.exit(0);
fs.appendFileSync(process.env.TVLENS_TICKET_FILE, "- jalon : attempt " + attempt + "\\n");
const scenarios = {
  done() {
    greeting();
    review();
    verdict("TERMINÉ");
  },
  "long-line"() {
    write("core/greeting.cjs", "module.exports = '" + "x".repeat(200) + "';\\n");
    review();
    verdict("TERMINÉ");
  },
  "edits-criteria"() {
    const file = process.env.TVLENS_TICKET_FILE;
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("says hello", "exists"));
    review();
    verdict("TERMINÉ");
  },
  "edits-harness"() {
    fs.appendFileSync("scripts/check.mjs", "\\n// weakened\\n");
    review();
    verdict("TERMINÉ");
  },
  "deletes-test"() {
    fs.rmSync("tests/sample.test.cjs");
    review();
    verdict("TERMINÉ");
  },
  blocked() {
    verdict("BLOQUÉ", { resume: "the ticket contradicts the code" });
  },
  "partial-then-done"() {
    greeting();
    review();
    verdict(attempt === 1 ? "PARTIEL" : "TERMINÉ", { reste: ["tests"] });
  },
  "with-adr"() {
    write("docs/adr/0011-greeting.md", "# 0011\\n");
    review();
    verdict("TERMINÉ");
  },
  compacts() {
    greeting();
    review();
    verdict("TERMINÉ");
    fs.appendFileSync(path.join(dir, "compactions.jsonl"), JSON.stringify({ trigger: "auto" }) + "\\n");
    write(path.join(dir, "fake-window"), String(process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW));
    const reviewer = { agentType: "relecteur", resolvedModel: "claude-opus-5-5", totalTokens: 900, totalToolUseCount: 7, totalDurationMs: 4000 };
    console.log(JSON.stringify({ type: "user", tool_use_result: reviewer }));
    const usage = { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 };
    const modelUsage = { "claude-sonnet-5-5": { costUSD: 0.301 }, "claude-opus-5-5": { costUSD: 0.199 } };
    const denials = [{ tool_name: "Bash", tool_input: { command: "git commit" } }];
    const result = { session_id: "s1", num_turns: 12, duration_ms: 3400, total_cost_usd: 0.5, usage, modelUsage, permission_denials: denials };
    console.log(JSON.stringify({ type: "result", ...result }));
  },
  narrates() {
    const say = (content, parent = null) => console.log(JSON.stringify({ type: "assistant", parent_tool_use_id: parent, message: { content } }));
    say([{ type: "text", text: "Je lis le ticket." }, { type: "tool_use", name: "Read", input: { file_path: path.resolve(process.env.TVLENS_TICKET_FILE) } }]);
    say([{ type: "tool_use", name: "Agent", input: { subagent_type: "explorateur", description: "Explore greeting" } }]);
    say([{ type: "tool_use", name: "Grep", input: { pattern: "hello" } }], "toolu_1");
    console.log("not json");
    greeting();
    say([{ type: "tool_use", name: "Bash", input: { command: "node scripts/check.mjs --changed", description: "Run the changed-files check" } }]);
    review();
    verdict("TERMINÉ");
    console.log(JSON.stringify({ type: "result", session_id: "s2", num_turns: 4, duration_ms: 1000, total_cost_usd: 0.1, usage: {} }));
  },
  "changes-after-review"() {
    greeting();
    review();
    write("core/greeting.cjs", "module.exports = () => 'hi';\\n");
    verdict("TERMINÉ");
  },
  "done-without-review"() {
    greeting();
    verdict("TERMINÉ");
  },
  "journals-after-review"() {
    greeting();
    review();
    fs.appendFileSync(process.env.TVLENS_TICKET_FILE, "- jalon : review accepted\\n");
    verdict("TERMINÉ");
  },
  "edits-untracked-after-review"() {
    greeting();
    review();
    for (const name of fs.readdirSync("notes")) fs.appendFileSync(path.join("notes", name), "changed after the review\\n");
    verdict("TERMINÉ");
  },
  "corrupts-review"() {
    greeting();
    review();
    write(path.join(dir, "reviewed-state.json"), "{ not json");
    verdict("TERMINÉ");
  },
  "corrupts-untracked-list"() {
    greeting();
    review();
    write(path.join(dir, "untracked-before.json"), "{ not json");
    verdict("TERMINÉ");
  },
  "reviewed-then-partial"() {
    greeting();
    if (attempt === 1) review();
    verdict(attempt === 1 ? "PARTIEL" : "TERMINÉ", { reste: ["check"] });
  },
  "review-rejected"() {
    greeting();
    review("VERDICT : à corriger\\n- the greeting is untested");
    verdict("TERMINÉ");
  },
  "review-stale"() {
    greeting();
    review();
    fs.appendFileSync("core/greeting.cjs", "// reworded\\n");
    record();
    verdict("TERMINÉ");
  },
  "removes-empty-catch"() {
    write("core/legacy.cjs", "module.exports = 1;\\n");
    review();
    verdict("TERMINÉ");
  },
};
scenarios[scenario]();
`;

function loopRepo(scenarioFiles = {}) {
  const repo = harnessRepo({ "docs/travail/tickets/001-add-greeting.md": ticketText(), ...scenarioFiles });
  const bin = path.join(repo.root, ".harness-state", "fake-claude.cjs");
  repo.write(".harness-state/fake-claude.cjs", FAKE_SESSION);
  fs.chmodSync(bin, 0o755);
  const loop = (scenario, args = [], env = {}) =>
    repo.node("scripts/loop/run.mjs", ["--no-push", ...args], { env: { TVLENS_CLAUDE_BIN: bin, FAKE_SCENARIO: scenario, ...env } });
  const status = () => /^statut: (.*)$/m.exec(repo.read("docs/travail/tickets/001-add-greeting.md"))[1];
  const commits = () => repo.git("log", "--format=%s").stdout.trim().split("\n");
  const failure = () => repo.read(".harness-state/tickets/T001/echec-1.txt");
  const attempts = () => repo.read(".harness-state/tickets/T001/fake-attempts");
  const plans = () => repo.read(".harness-state/tickets/T001/fake-plans").trim().split("\n").map((line) => JSON.parse(line));
  const events = () => repo.read(".harness-state/loop/events.jsonl").trim().split("\n").map((line) => JSON.parse(line));
  return { ...repo, loop, status, commits, failure, attempts, plans, events };
}

test("the next ticket is the first one to do whose blockers are all finished", async () => {
  const { describe, next } = await tickets();
  const queue = [
    describe("001.md", ticketText({ id: "T001", statut: "termine" })),
    describe("002.md", ticketText({ id: "T002", bloque_par: "T003" })),
    describe("003.md", ticketText({ id: "T003", bloque_par: "T001" })),
  ];
  assert.equal(next(queue).ticket.id, "T003");
  assert.match(next(queue, "T002").reason, /T002 n'est pas prêt/);
});

test("a ticket in progress or blocked stops the queue until someone decides", async () => {
  const { describe, next } = await tickets();
  const queue = [describe("001.md", ticketText({ id: "T001", statut: "bloque" })), describe("002.md", ticketText({ id: "T002" }))];
  assert.match(next(queue).reason, /T001 est « bloque »/);
});

test("a malformed queue is reported: duplicate id, unknown blocker, unknown status", async () => {
  const { describe, validate } = await tickets();
  const problems = validate([
    describe("001.md", ticketText({ id: "T001" })),
    describe("002.md", ticketText({ id: "T001", bloque_par: "T009", statut: "fini" })),
  ]);
  assert.equal(problems.length, 3, problems.join("\n"));
});

test("a ticket whose level is not on the ladder is reported", async () => {
  const { describe, validate } = await tickets();
  const problems = validate([describe("001.md", ticketText({ niveau: "urgent" })), describe("002.md", ticketText({ id: "T002", niveau: "critique" }))]);
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.match(problems[0], /niveau « urgent » inconnu/);
});

test("the protected part of a ticket ignores its status and its journal, and nothing else", async () => {
  const { setStatus, spec } = await tickets();
  const text = ticketText();
  assert.equal(spec(setStatus(text, "en-cours") + "- jalon\n"), spec(text));
  assert.notEqual(spec(text.replace("says hello", "exists")), spec(text));
});

test("a ticket whose session finishes green is committed under its title and marked finished", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done");
  assert.equal(result.code, 0, result.out);
  assert.equal(repo.status(), "termine");
  assert.equal(repo.commits()[0], "T001: Add the greeting");
  assert.equal(repo.git("status", "--porcelain").stdout.trim(), "");
  assert.match(repo.read("core/greeting.cjs"), /hello/);
});

test("a session that claims done on a red check is refused, retried, then the ticket is blocked without any commit", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("long-line", ["--attempts", "2"]);
  assert.equal(result.code, 2, result.out);
  assert.equal(repo.status(), "bloque");
  assert.deepEqual(repo.commits(), ["init"]);
  assert.match(repo.failure(), /contrôle qualité complet est rouge/);
  assert.equal(repo.attempts(), "2");
});

for (const [scenario, expected] of [
  ["edits-criteria", /modifié au-dessus de son journal/],
  ["edits-harness", /harnais a été modifié sans que le ticket l'autorise/],
  ["deletes-test", /fichiers de test ont été supprimés/],
]) {
  test(`a session that ${scenario.replace("-", " ")} is refused`, (t) => {
    const repo = loopRepo();
    t.after(repo.cleanup);
    const result = repo.loop(scenario, ["--attempts", "1"]);
    assert.equal(result.code, 2, result.out);
    assert.deepEqual(repo.commits(), ["init"]);
    assert.match(repo.failure(), expected);
  });
}

test("a session that stops without a verdict counts as a failed attempt", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("silent", ["--attempts", "1"]);
  assert.equal(result.code, 2, result.out);
  assert.match(repo.failure(), /sans verdict/);
});

test("a session that declares itself blocked stops the loop at once with its reason", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("blocked");
  assert.equal(result.code, 2);
  assert.match(result.out, /the ticket contradicts the code/);
  assert.equal(repo.attempts(), "1");
  assert.equal(repo.status(), "bloque");
});

test("a partial session is followed by a fresh one that resumes and can finish", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("partial-then-done");
  assert.equal(result.code, 0, result.out);
  assert.equal(repo.status(), "termine");
  assert.equal(repo.attempts(), "2");
});

test("a ticket that requires an ADR is refused without one and accepted with one", (t) => {
  const withAdr = { "docs/travail/tickets/001-add-greeting.md": ticketText({ adr: "oui" }) };
  const missing = loopRepo(withAdr);
  t.after(missing.cleanup);
  assert.equal(missing.loop("done", ["--attempts", "1"]).code, 2);
  assert.match(missing.failure(), /demande un ADR/);
  const present = loopRepo(withAdr);
  t.after(present.cleanup);
  assert.equal(present.loop("with-adr").code, 0);
  assert.equal(present.status(), "termine");
});

test("a ticket that improves a measure tightens the baseline in its own commit", (t) => {
  const repo = loopRepo({ "core/legacy.cjs": "try {\n  work();\n} catch {}\n" });
  t.after(repo.cleanup);
  repo.node("scripts/quality/ratchet.mjs", ["--init"]);
  repo.git("add", "-A");
  repo.git("commit", "-q", "-m", "baseline");
  assert.equal(JSON.parse(repo.read("scripts/quality/baseline.json")).catch_vides_prod, 1);
  const result = repo.loop("removes-empty-catch");
  assert.equal(result.code, 0, result.out);
  assert.equal(JSON.parse(repo.read("scripts/quality/baseline.json")).catch_vides_prod, 0);
  assert.match(repo.git("show", "--stat", "--format=", "HEAD").stdout, /scripts\/quality\/baseline\.json/);
});

test("the loop caps the context of a ticket session and records what the session cost, compactions included", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("compacts");
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /compactée 1 fois/);
  assert.equal(repo.read(".harness-state/tickets/T001/fake-window"), "200000");
  const events = repo.read(".harness-state/loop/events.jsonl").trim().split("\n").map((line) => JSON.parse(line));
  const ended = events.find((e) => e.phase === "session-terminee");
  const { session, tours, duree_s, cout_usd, tokens_sortie, tokens_lus_cumules, refus_de_permission, compactions } = ended;
  assert.deepEqual(
    { session, tours, duree_s, cout_usd, tokens_sortie, tokens_lus_cumules, refus_de_permission, compactions },
    { session: "s1", tours: 12, duree_s: 3, cout_usd: 0.5, tokens_sortie: 20, tokens_lus_cumules: 80, refus_de_permission: 1, compactions: 1 },
  );
  assert.equal(repo.loop("done", ["--dry-run", "--compact-window", "0"]).code, 0);
});

test("the loop records the model of each attempt, what each model and sub-agent cost, and signs the commit with the model that finished", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("compacts");
  assert.equal(result.code, 0, result.out);
  const events = repo.events();
  const { niveau, modele, effort, palier, relecteur } = events.find((e) => e.phase === "session");
  const firstRung = { niveau: "standard", modele: "claude-sonnet-5-5", effort: "high", palier: 0, relecteur: "opus" };
  assert.deepEqual({ niveau, modele, effort, palier, relecteur }, firstRung);
  const ended = events.find((e) => e.phase === "session-terminee");
  assert.deepEqual(ended.cout_par_modele, { "claude-sonnet-5-5": 0.3, "claude-opus-5-5": 0.2 });
  assert.deepEqual(ended.sous_agents, [{ role: "relecteur", modele: "claude-opus-5-5", tokens: 900, outils: 7, duree_ms: 4000 }]);
  assert.match(ended.refus[0], /^Bash .*git commit/);
  const integrated = events.find((e) => e.phase === "integre");
  assert.deepEqual([integrated.tentatives, integrated.cout_usd, integrated.modele], [1, 0.5, "claude-sonnet-5-5"]);
  assert.match(result.out, /intégré \(\w+\) en 1 tentative\(s\), 0\.50 \$/);
  assert.match(repo.git("log", "-1", "--format=%B").stdout, /^Co-Authored-By: Claude Sonnet 5\.5 <noreply@anthropic\.com>$/m);
});

test("each refused attempt climbs one rung of the model ladder from a start set by the ticket level; the reviewer never runs below its floor", (t) => {
  const sonnet = { model: "claude-sonnet-5-5", effort: "high" };
  const opus = { model: "claude-opus-5-5", effort: "high", review: "opus" };
  const opusMore = { model: "claude-opus-5-5", effort: "xhigh", review: "opus" };
  const fable = { model: "claude-fable-5-1", effort: "high", review: "fable" };
  for (const [fields, args, expected] of [
    [{}, [], [{ ...sonnet, review: "opus" }, opus, opusMore, fable]],
    [{ harnais: "oui" }, [], [opusMore, fable]],
    [{ niveau: "simple" }, ["--attempts", "1"], [{ ...sonnet, review: "sonnet" }]],
    [{}, ["--model", "claude-opus-5-5", "--effort", "max"], Array(3).fill({ model: "claude-opus-5-5", effort: "max", review: null })],
  ]) {
    const repo = loopRepo({ "docs/travail/tickets/001-add-greeting.md": ticketText(fields) });
    t.after(repo.cleanup);
    assert.equal(repo.loop("silent", args).code, 2);
    assert.deepEqual(repo.plans(), expected, JSON.stringify(fields) + args.join(" "));
  }
});

for (const [scenario, expected] of [
  ["review-rejected", /Le dernier relecteur n'a pas accepté revue-1\.diff \(verdict : à corriger\)/],
  ["review-stale", /Le dernier verdict porte sur revue-1\.diff, pas sur la dernière revue enregistrée \(revue-2\.diff\)/],
]) {
  test(`a session that claims done without its last review accepted is refused: ${scenario}`, (t) => {
    const repo = loopRepo();
    t.after(repo.cleanup);
    const result = repo.loop(scenario, ["--attempts", "1"]);
    assert.equal(result.code, 2, result.out);
    assert.match(repo.failure(), expected);
    assert.deepEqual(repo.commits(), ["init"]);
  });
}

test("after a ticket, a read-only retrospective proposes harness changes that the owner can list and decide later", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done");
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /Rétrospective : 2 observation\(s\), 0\.20 \$/);
  const call = JSON.parse(repo.read(".harness-state/tickets/T001/fake-retro-call"));
  assert.deepEqual([call.model, call.tools, call.loop], ["claude-sonnet-5-5", "Read,Grep,Glob", null]);
  assert.match(repo.read(".harness-state/tickets/T001/retro-entree.md"), /## Tentative 1[\s\S]*claude-sonnet-5-5/);
  assert.equal(JSON.parse(repo.read(".harness-state/tickets/T001/retro.json")).observations.length, 2);
  const journal = repo.read(".harness-state/retours/observations.jsonl").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(journal.map((o) => [o.id, o.statut, o.cible]), [["R-T001-1", "propose", "agent"], ["R-T001-2", "propose", "boucle"]]);

  assert.equal(repo.node("scripts/loop/retro.mjs", ["decider", "R-T001-2", "ticket:T009", "queue", "it"]).code, 0);
  assert.equal(repo.node("scripts/loop/retro.mjs", ["decider", "R-T001-1", "maybe"]).code, 2);
  const open = repo.node("scripts/loop/retro.mjs", ["liste"]).stdout;
  assert.match(open, /R-T001-1/);
  assert.doesNotMatch(open, /R-T001-2/);
  assert.match(repo.node("scripts/loop/retro.mjs", ["liste", "--tous"]).stdout, /R-T001-2 .* → ticket:T009 \(queue it\)/);
});

test("a failed retrospective is reported and never stops the loop; --no-retro skips it", (t) => {
  const failing = loopRepo();
  t.after(failing.cleanup);
  const result = failing.loop("done", [], { FAKE_RETRO: "fail" });
  assert.equal(result.code, 0, result.out);
  assert.equal(failing.status(), "termine");
  assert.match(result.out, /La rétrospective a échoué, la boucle continue/);
  assert.ok(failing.events().some((e) => e.phase === "retro-echouee"));
  const skipped = loopRepo();
  t.after(skipped.cleanup);
  assert.equal(skipped.loop("done", ["--no-retro"]).code, 0);
  assert.equal(fs.existsSync(path.join(skipped.root, ".harness-state/tickets/T001/fake-retro-call")), false);
});

test("the loop shows each tool the session calls while it runs and keeps the whole stream", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("narrates");
  assert.equal(result.code, 0, result.out);
  const shown = result.out.split("\n").filter((line) => /^\[boucle\] \d\d:\d\d /.test(line)).map((line) => line.slice(14));
  assert.deepEqual(shown, [
    "  Read docs/travail/tickets/001-add-greeting.md",
    "  Agent explorateur Explore greeting",
    "    Grep hello",
    "  Bash Run the changed-files check",
  ]);
  assert.ok(result.out.indexOf("Bash Run the changed-files check") < result.out.indexOf("Session 1 : 4 tours"));
  const stream = repo.read(".harness-state/tickets/T001/session-1.jsonl").trim().split("\n");
  assert.equal(stream.length, 6);
  assert.equal(JSON.parse(repo.read(".harness-state/tickets/T001/session-1.json")).session_id, "s2");
});

const changedAfterReview = /modifié depuis la dernière relecture/;

test("a session that changes the code after its last review is refused, retried, then blocked without any commit", (t) => {
  const repo = loopRepo({ "core/greeting.cjs": "module.exports = () => 'hey';\n" });
  t.after(repo.cleanup);
  const result = repo.loop("changes-after-review", ["--attempts", "2"]);
  assert.equal(result.code, 2, result.out);
  assert.match(repo.failure(), changedAfterReview);
  assert.match(repo.failure(), /core\/greeting\.cjs/);
  assert.equal(repo.attempts(), "2");
  assert.equal(repo.status(), "bloque");
  assert.deepEqual(repo.commits(), ["init"]);
});

test("a session that changes a new untracked file after its last review is refused", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("changes-after-review", ["--attempts", "1"]);
  assert.equal(result.code, 2, result.out);
  assert.match(repo.failure(), changedAfterReview);
  assert.match(repo.failure(), /core\/greeting\.cjs/);
  assert.deepEqual(repo.commits(), ["init"]);
});

test("a session that claims done without any recorded review is refused", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done-without-review", ["--attempts", "1"]);
  assert.equal(result.code, 2, result.out);
  assert.match(repo.failure(), /Aucune relecture n'est enregistrée/);
  assert.deepEqual(repo.commits(), ["init"]);
});

test("a session whose final change is the one last reviewed is committed, even with a journal written after the review", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("journals-after-review");
  assert.equal(result.code, 0, result.out);
  assert.equal(repo.commits()[0], "T001: Add the greeting");
  assert.match(repo.git("show", "HEAD:docs/travail/tickets/001-add-greeting.md").stdout, /review accepted/);
});

test("a review recorded by an earlier attempt still counts for the next one", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("reviewed-then-partial");
  assert.equal(result.code, 0, result.out);
  assert.equal(repo.attempts(), "2");
  assert.equal(repo.status(), "termine");
});

for (const [what, scenario, expected] of [
  ["reviewed state", "corrupts-review", /Aucune relecture lisible n'est enregistrée/],
  ["list of files untracked before the session", "corrupts-untracked-list", /untracked-before\.json est illisible/],
]) {
  test(`a session that leaves an unreadable ${what} is refused with a report, not a crash`, (t) => {
    const repo = loopRepo();
    t.after(repo.cleanup);
    const result = repo.loop(scenario, ["--attempts", "1"]);
    assert.equal(result.code, 2, result.out);
    assert.match(repo.failure(), expected);
    assert.equal(repo.status(), "bloque");
    assert.deepEqual(repo.commits(), ["init"]);
  });
}

test("recording a review writes the diff with new files in full and the file list, numbered after the previous review", (t) => {
  const repo = loopRepo({ "core/greeting.cjs": "module.exports = () => 'hey';\n" });
  t.after(repo.cleanup);
  repo.write("core/greeting.cjs", "module.exports = () => 'hello';\n");
  repo.write("core/farewell.cjs", "module.exports = () => 'bye';\n");
  repo.write("docs/travail/tickets/001-add-greeting.md", ticketText() + "- jalon\n");
  const first = repo.node("scripts/loop/reviewed-state.mjs", ["record", "--ticket", "T001"]);
  assert.equal(first.code, 0, first.out);
  const dir = ".harness-state/tickets/T001/";
  assert.deepEqual(first.stdout.trim().split("\n"), ["revue-1.diff", "revue-1.fichiers", "reviewed-state.json"].map((f) => dir + f));
  const diff = repo.read(dir + "revue-1.diff");
  assert.match(diff, /^-module\.exports = \(\) => 'hey';$/m);
  assert.match(diff, /^\+module\.exports = \(\) => 'bye';$/m);
  assert.doesNotMatch(diff, /jalon/);
  assert.equal(repo.read(dir + "revue-1.fichiers"), " M core/greeting.cjs\n?? core/farewell.cjs\n");
  const second = repo.node("scripts/loop/reviewed-state.mjs", ["record", "--ticket", "T001"]);
  assert.match(second.stdout, /revue-2\.diff/);
});

test("recording a review fails with a clear message when the list of files untracked before the session is unreadable", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  repo.write(".harness-state/tickets/T001/untracked-before.json", "{ not json");
  const result = repo.node("scripts/loop/reviewed-state.mjs", ["record", "--ticket", "T001"]);
  assert.equal(result.code, 2, result.out);
  assert.match(result.out, /untracked-before\.json est illisible/);
  assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/tickets/T001/revue-1.diff")), false);
});

test("files that were already untracked before the loop are left out of the ticket commit", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  repo.write("notes/personal.md", "mine\n");
  assert.equal(repo.loop("done").code, 0);
  assert.equal(repo.git("status", "--porcelain").stdout.trim(), "?? notes/");
});

for (const name of ["notes/personal.md", "notes/café.md"]) {
  test(`a file untracked before the loop and changed after the review stays out of the review and of the commit: ${name}`, (t) => {
    const repo = loopRepo();
    t.after(repo.cleanup);
    repo.write(name, "mine\n");
    const result = repo.loop("edits-untracked-after-review", ["--attempts", "1"]);
    assert.equal(result.code, 0, result.out);
    assert.equal(repo.commits()[0], "T001: Add the greeting");
    assert.doesNotMatch(repo.git("show", "--name-only", "--format=", "HEAD").stdout, /notes/);
    assert.equal(repo.git("status", "--porcelain").stdout.trim(), "?? notes/");
    const review = ".harness-state/tickets/T001/revue-1.";
    assert.doesNotMatch(repo.read(review + "diff") + repo.read(review + "fichiers"), /notes|mine/);
  });
}

test("a ticket that Git does not track is refused: its journal and status would stay out of its own commit", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  repo.write("docs/travail/tickets/002-add-farewell.md", ticketText({ id: "T002", titre: "Add the farewell" }));
  for (const args of [["--ticket", "T002", "--dry-run"], ["--ticket", "T002"]]) {
    const result = repo.loop("done", args);
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /T002 n'est pas suivi par Git/);
  }
  assert.deepEqual(repo.commits(), ["init"]);
  assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/loop/lock")), false);
});

test("the loop refuses to start on main, on a dirty tree, or with a malformed queue", (t) => {
  const dirty = loopRepo();
  t.after(dirty.cleanup);
  dirty.write("package.json", '{ "name": "changed" }\n');
  const refusedDirty = dirty.loop("done");
  assert.equal(refusedDirty.code, 1);
  assert.match(refusedDirty.out, /fichiers suivis sont modifiés/);

  const main = loopRepo();
  t.after(main.cleanup);
  main.git("branch", "-m", "main");
  assert.match(main.loop("done").out, /ne travaille pas sur main/);

  const malformed = loopRepo({ "docs/travail/tickets/002-other.md": ticketText({ id: "T001" }) });
  t.after(malformed.cleanup);
  assert.match(malformed.loop("done").out, /File de tickets invalide/);
});

test("a dry run names the next ticket and changes nothing", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done", ["--dry-run"]);
  assert.equal(result.code, 0);
  assert.match(result.out, /Prochain ticket : T001 — Add the greeting/);
  assert.equal(repo.status(), "a-faire");
  assert.equal(repo.git("status", "--porcelain").stdout.trim(), "");
});
