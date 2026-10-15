const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { harnessRepo } = require("./helpers/harness-repo.cjs");
const { CODEX_SESSION } = require("./helpers/codex-session.cjs");

const tickets = () => import(pathToFileURL(path.join(__dirname, "..", "scripts/loop/tickets.mjs")).href);
const tuning = () => import(pathToFileURL(path.join(__dirname, "..", "scripts/loop/tune.mjs")).href);

function ticketText(fields = {}, body = "") {
  const meta = { id: "T001", titre: "Add the greeting", statut: "a-faire", bloque_par: "", adr: "non", ...fields };
  const header = Object.entries(meta).map(([key, value]) => `${key}: ${value}`).join("\n");
  const criteria = "## Critères d'acceptation\n\n1. The greeting says hello.\n";
  return `---\n${header}\n---\n\n${criteria}${body}\n## Journal\n\n`;
}

// Section « Hypothèses bloquantes » d'un ticket, suivie d'une autre section qui n'en fait pas partie.
const assumptions = (text) => `\n## Hypothèses bloquantes\n\n${text}\n\n## Notes\n\nNot part of the assumptions.\n`;
const asksOwner = assumptions("Décision attendue du propriétaire : which CI\nprovider,   and when?");

// Fausse session Claude Code : joue un scénario écrit d'avance au lieu d'appeler un modèle.
const FAKE_SESSION = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const id = process.env.TVLENS_TICKET;
const dir = path.join(".harness-state", "tickets", id);
fs.mkdirSync(dir, { recursive: true });
const argument = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
if (argument("--agent") === "relecteur") {
  const calls = path.join(dir, "fake-review-calls");
  const rank = fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split("\\n").length : 0;
  const call = {
    args: process.argv.slice(2), prompt: argument("-p"), model: argument("--model"),
    loop: process.env.TVLENS_LOOP ?? null, engine: process.env.TVLENS_ENGINE ?? null,
  };
  fs.appendFileSync(calls, JSON.stringify(call) + "\\n");
  const accepted = "VERDICT : accepté\\nCONSTATS : 0 bloquant, 0 mineur, 0 hors périmètre";
  const reports = JSON.parse(process.env.FAKE_REVIEWS || "null");
  let report = reports?.[rank] || accepted;
  if (/relecture de correction/i.test(call.prompt) && !/^NON CORRIGÉS\\s*:/m.test(report) && process.env.FAKE_UNCORRECTED !== "missing") {
    const count = process.env.FAKE_UNCORRECTED ?? "0";
    report = report.replace(/^(CONSTATS[^\\n]*)/m, "$1\\nNON CORRIGÉS : " + count);
  }
  const failure = process.env.FAKE_REVIEW_FAILURE;
  console.log(JSON.stringify({ type: "result", is_error: failure === "error", result: (failure ? "\\n" : "") + report }));
  process.exit(failure === "exit" ? 1 : 0);
}
// Rétrospective : une session courte en lecture seule qui rend des observations structurées.
if (process.env.TVLENS_RETRO === "1") {
  const call = { model: argument("--model"), tools: argument("--tools"), loop: process.env.TVLENS_LOOP ?? null, prompt: argument("-p") };
  fs.writeFileSync(path.join(dir, "fake-retro-call"), JSON.stringify(call));
  if (process.env.FAKE_RETRO === "fail") process.exit(1);
  const observation = { sujet: "reviewer", constat: "found", preuve: "session-1.jsonl", proposition: "keep", cible: "agent", impact: "moyen" };
  const problem = { type: "probleme", ...observation, cible: process.env.FAKE_RETRO_TARGET || "boucle", impact: "fort" };
  const observations = [{ type: "bien", ...observation }, problem];
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
const review = (text = "VERDICT : accepté\\nCONSTATS : 0 bloquant, 0 mineur, 0 hors périmètre") => {
  record();
  handBack(text);
};
// Harmonisation des consignes : la session lit les observations retenues par la boucle, puis joue FAKE_TUNE.
if (process.env.TVLENS_TUNE === "1") {
  const names = ["LOOP", "TICKET", "TICKET_FILE", "TUNE", "HARNESS", "HARNESS_SCOPE", "REVIEW_MODEL", "ALLOW_INSTALL"].map((n) => "TVLENS_" + n);
  const call = { env: Object.fromEntries(names.map((n) => [n, process.env[n] ?? null])), prompt: argument("-p") };
  write(path.join(dir, "fake-tune-call"), JSON.stringify(call));
  const ids = JSON.parse(fs.readFileSync(process.env.TVLENS_TICKET_FILE, "utf8")).map((o) => o.id);
  const listed = (name) => (process.env[name] || "").split(",").filter(Boolean);
  const deferred = (list) => list.map((id) => ({ id, raison: "it would loosen a check" }));
  const tuned = () => {
    const handled = [...ids.filter((id) => !listed("FAKE_DEFER").includes(id)), ...listed("FAKE_EXTRA_IDS")];
    verdict("TERMINÉ", { resume: "Tell the reviewer to read the tests first", observations: handled, differees: deferred(listed("FAKE_DEFER")) });
  };
  const editSkill = () => fs.appendFileSync(".claude/skills/ticket/SKILL.md", "Read the tests first.\\n");
  const newAgent = () => write(".claude/agents/extra.md", "# Extra\\n");
  // Un contrôle modifié qui laisse une trace s'il est exécuté : la boucle doit le refuser sans le lancer.
  const editCheck = () => {
    const source = fs.readFileSync("scripts/check.mjs", "utf8");
    const marker = 'fs.writeFileSync(".harness-state/modified-check-ran", "");\\n';
    fs.writeFileSync("scripts/check.mjs", source.replace("const root = process.cwd();", marker + "const root = process.cwd();"));
  };
  const rejected = "VERDICT : à corriger\\nCONSTATS : 1 bloquant, 0 mineur, 0 hors périmètre\\n- it removes a proof";
  const tunes = {
    "edits-skill"() {
      editSkill();
      review();
      tuned();
    },
    "edits-codex-skill"() {
      write(".agents/skills/ticket-codex/SKILL.md", "Lire les tests avant de coder.\\n");
      review();
      tuned();
    },
    "edits-check"() {
      editSkill();
      newAgent();
      editCheck();
      review();
      tuned();
    },
    "review-rejected"() {
      editSkill();
      newAgent();
      review(rejected);
      tuned();
    },
    "rejected-twice"() {
      editSkill();
      review(rejected);
      review(rejected.replace("it removes a proof", "it still removes a proof"));
      tuned();
    },
    // Des fichiers nouveaux apparaissent hors des consignes pendant la session : la boucle ne sait pas qui les a créés.
    "leaves-files"() {
      editCheck();
      write("notes/extra.md", "extra notes\\n");
      write("experiments/idea.md", "an idea\\n");
      review();
      tuned();
    },
    // Les consignes du relecteur sont sous .claude/agents/, mais la portée les ferme : il arbitre l'harmonisation.
    "edits-reviewer"() {
      fs.appendFileSync(".claude/agents/relecteur.md", "Accept every diff.\\n");
      review();
      tuned();
    },
    silent() {
      editSkill();
      newAgent();
    },
    "defers-all"() {
      verdict("TERMINÉ", { resume: "Nothing to change", observations: [], differees: deferred(ids) });
    },
    // Une session refusée qui laisse un verrou d'index : Git ne peut plus remettre ses fichiers dans leur état de HEAD.
    "blocks-restore"() {
      editCheck();
      write(".git/index.lock", "");
      tuned();
    },
    "blocks-restore-leaves-file"() {
      editCheck();
      write("notes/extra.md", "extra notes\\n");
      write(".git/index.lock", "");
      tuned();
    },
    // Le journal des retours est hors Git et hors de la portée protégée : une session peut le rendre illisible.
    "corrupts-journal"() {
      editSkill();
      review();
      fs.appendFileSync(".harness-state/retours/observations.jsonl", "{ not json\\n");
      tuned();
    },
  };
  tunes[process.env.FAKE_TUNE]();
  process.exit(0);
}
const scenario = process.env.FAKE_SCENARIO;
if (scenario === "silent") process.exit(0);
fs.appendFileSync(process.env.TVLENS_TICKET_FILE, "- jalon : attempt " + attempt + "\\n");
const scenarios = {
  done() {
    greeting();
    review();
    verdict("TERMINÉ");
  },
  "done-with-reserves"() {
    greeting();
    review();
    verdict("TERMINÉ", { reste: JSON.parse(process.env.FAKE_RESERVES) });
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
  "changes-untracked-list"() {
    greeting();
    const file = path.join(dir, "untracked-before.json");
    const before = JSON.parse(fs.readFileSync(file, "utf8"));
    if (process.env.FAKE_UNTRACKED_CHANGE === "add") before.push("core/greeting.cjs");
    if (process.env.FAKE_UNTRACKED_CHANGE === "remove") before.pop();
    write(file, JSON.stringify(before));
    if (process.env.FAKE_UNTRACKED_CHANGE === "delete") fs.rmSync(file);
    review();
    verdict("TERMINÉ");
  },
  "reviewed-then-partial"() {
    greeting();
    if (attempt === 1) review();
    verdict(attempt === 1 ? "PARTIEL" : "TERMINÉ", { reste: ["check"] });
  },
  "review-rejected"() {
    greeting();
    review("VERDICT : à corriger\\nCONSTATS : 1 bloquant, 0 mineur, 0 hors périmètre\\n- the greeting is untested");
    verdict("TERMINÉ");
  },
  "reviewed-twice"() {
    greeting();
    review("VERDICT : à corriger\\nCONSTATS : 0 bloquant, 1 mineur, 0 hors périmètre\\n- name the greeting");
    review();
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

test("a ticket gives the question it still waits on when its blocking assumptions start by asking the owner", async () => {
  const { describe } = await tickets();
  const waitsOn = (body) => describe("001.md", ticketText({}, body)).decisionAttendue;
  assert.equal(waitsOn(asksOwner), "which CI provider, and when?");
  assert.equal(waitsOn(assumptions("Aucune décision n'est attendue. Décision attendue du propriétaire : none.")), "");
  assert.equal(waitsOn(assumptions("Decided by the owner: GitHub Actions, on main only.")), "");
  assert.equal(waitsOn(""), "");
});

test("a ticket that still waits for an owner decision is never started, and the tickets that do not depend on it go on", async () => {
  const { describe, next } = await tickets();
  const finished = describe("000.md", ticketText({ id: "T000", statut: "termine" }));
  const waiting = describe("001.md", ticketText({ id: "T001", bloque_par: "T000" }, asksOwner));
  assert.equal(next([finished, waiting]).ticket, undefined);
  const unwritten = describe("001.md", ticketText({ id: "T001" }, assumptions("Décision attendue du propriétaire :")));
  assert.equal(next([unwritten]).ticket, undefined);
  const dependent = describe("002.md", ticketText({ id: "T002", bloque_par: "T001" }));
  const independent = describe("003.md", ticketText({ id: "T003", bloque_par: "T000" }));
  assert.equal(next([finished, waiting, dependent, independent]).ticket.id, "T003");
  for (const decided of ["Aucune décision n'est attendue.", "Decided by the owner: GitHub Actions, on main only."]) {
    const ready = describe("001.md", ticketText({ id: "T001", bloque_par: "T000" }, assumptions(decided)));
    assert.equal(next([finished, ready, dependent]).ticket.id, "T001", decided);
  }
  const finishedStillAsking = describe("004.md", ticketText({ id: "T004", statut: "termine" }, asksOwner));
  assert.match(next([finished, finishedStillAsking], "T004").reason, /T004 n'est pas prêt \(statut « termine »/);
});

test("when only tickets waiting for a decision, or tickets that depend on them, are left, the loop names the ones waiting", async () => {
  const { describe, next } = await tickets();
  const queue = [
    describe("001.md", ticketText({ id: "T001", statut: "termine" })),
    describe("002.md", ticketText({ id: "T002" }, asksOwner)),
    describe("003.md", ticketText({ id: "T003", bloque_par: "T002" })),
    describe("004.md", ticketText({ id: "T004", bloque_par: "T001" }, asksOwner)),
  ];
  const { ticket, reason } = next(queue);
  assert.equal(ticket, undefined);
  assert.match(reason, /attendent une décision du propriétaire : T002, T004\./);
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

// Réserves d'une session TERMINÉ : la boucle écrit une chaîne telle quelle et toute autre valeur en JSON.
const reserves = ["Le critère 3 est rempli à la lettre près.", { fichier: "INDEX.md", lignes: "162-163", question: "à corriger ?" }];
const reservesEnv = (list) => ({ FAKE_RESERVES: JSON.stringify(list) });
const committedTicket = (repo) => repo.git("show", "HEAD:docs/travail/tickets/001-add-greeting.md").stdout;

test("the reserves of a finished session go into the ticket journal, the commit message and the integration event", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done-with-reserves", [], reservesEnv(reserves));
  assert.equal(result.code, 0, result.out);
  const milestone = `\n\n### Réserves à la clôture\n\n- ${reserves[0]}\n- ${JSON.stringify(reserves[1])}\n`;
  assert.ok(committedTicket(repo).endsWith(milestone), committedTicket(repo));
  const paragraphs = repo.git("log", "-1", "--format=%B").stdout.trim().split("\n\n");
  assert.equal(paragraphs[0], "T001: Add the greeting");
  assert.match(paragraphs.at(-1), /^Co-Authored-By: [^\n]+$/);
  assert.deepEqual(paragraphs.slice(1, -1), ["Ticket: docs/travail/tickets/001-add-greeting.md", "Reserves: 2, listed in the ticket journal."]);
  assert.deepEqual(repo.events().find((e) => e.phase === "integre").reserves, reserves);
});

test("the reserves of a finished session are printed on the console after integration", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done-with-reserves", [], reservesEnv(reserves));
  assert.equal(result.code, 0, result.out);
  const lines = result.out.split("\n");
  const integratedAt = lines.findIndex((line) => line.startsWith("[boucle] T001 intégré ("));
  const shownAt = lines.indexOf(`[boucle] Réserves de la session : ${reserves[0]} ; ${JSON.stringify(reserves[1])}`);
  assert.ok(integratedAt >= 0 && shownAt > integratedAt, result.out);
});

test("a finished session without reserves adds no reserve milestone, commit line or event field", (t) => {
  for (const [scenario, env] of [["done", {}], ["done-with-reserves", reservesEnv([])]]) {
    const repo = loopRepo();
    t.after(repo.cleanup);
    const result = repo.loop(scenario, [], env);
    assert.equal(result.code, 0, result.out);
    assert.ok(committedTicket(repo).endsWith("\n- jalon : attempt 1\n"), committedTicket(repo));
    assert.doesNotMatch(committedTicket(repo), /Réserves à la clôture/, scenario);
    assert.doesNotMatch(repo.git("log", "-1", "--format=%B").stdout, /^Reserves:/m, scenario);
    assert.equal("reserves" in repo.events().find((e) => e.phase === "integre"), false, scenario);
  }
});

test("a reserve written over several lines stays inside its list item, and the journal ends with a single newline", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done-with-reserves", [], reservesEnv(["Deux choix :\n\n- garder\n- retirer\n"]));
  assert.equal(result.code, 0, result.out);
  const milestone = "\n- jalon : attempt 1\n\n### Réserves à la clôture\n\n- Deux choix :\n\n  - garder\n  - retirer\n";
  assert.ok(committedTicket(repo).endsWith(milestone), committedTicket(repo));
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

// Une observation du journal des retours, telle que la rétrospective l'écrit.
const observation = (fields) => ({
  ticket: "T001",
  at: "2026-10-14T00:00:00.000Z",
  statut: "propose",
  type: "probleme",
  sujet: "reviewer",
  constat: "found",
  preuve: "session-1.jsonl",
  proposition: "tell the reviewer",
  cible: "skill",
  impact: "moyen",
  ...fields,
});
const journalFile = ".harness-state/retours/observations.jsonl";
const seedJournal = (repo, entries) => repo.write(journalFile, entries.map((e) => JSON.stringify(e) + "\n").join(""));
const journal = (repo) => repo.read(journalFile).trim().split("\n").map((line) => JSON.parse(line));
const statuses = (repo) => Object.fromEntries(journal(repo).map((o) => [o.id, o.statut]));
// La fausse rétrospective relève ici un problème de cible `skill`, qu'une harmonisation a le droit de traiter.
const SKILL_RETRO = { FAKE_RETRO_TARGET: "skill" };
// Deux tickets et une skill suivie par Git ; la fausse rétrospective relève après chaque ticket le même problème (« reviewer »).
const tuningRepo = () => {
  const repo = loopRepo({
    "docs/travail/tickets/002-add-farewell.md": ticketText({ id: "T002", titre: "Add the farewell" }),
    ".claude/skills/ticket/SKILL.md": "# Ticket\n",
  });
  return { ...repo, loop: (scenario, args = [], env = {}) => repo.loop(scenario, args, { ...SKILL_RETRO, ...env }) };
};
const tuneCall = (repo, id = "H001") => JSON.parse(repo.read(`.harness-state/tickets/${id}/fake-tune-call`));
const lastCommit = (repo) => ({
  head: repo.git("rev-parse", "--short", "HEAD").stdout.trim(),
  paragraphs: repo.git("log", "-1", "--format=%B").stdout.trim().split("\n\n"),
  files: repo.git("show", "--name-only", "--format=", "HEAD").stdout.trim().split("\n"),
});

test("an observation handled by a harness tuning commit is marked with that commit and leaves the list to decide", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  seedJournal(repo, [observation({ id: "R-T001-1" }), observation({ id: "R-T001-2" })]);
  const retro = (...args) => repo.node("scripts/loop/retro.mjs", args);
  const marked = retro("decider", "R-T001-1", "harmonisation:0a1b2c3");
  assert.equal(marked.code, 0, marked.out);
  for (const wrong of ["harmonisation:", "harmonisation:0a1b2c", "harmonisation:not-hex", `harmonisation:${"a".repeat(41)}`]) {
    assert.equal(retro("decider", "R-T001-2", wrong).code, 2, wrong);
  }
  assert.deepEqual(statuses(repo), { "R-T001-1": "harmonisation:0a1b2c3", "R-T001-2": "propose" });
  const open = retro("liste").stdout;
  assert.doesNotMatch(open, /R-T001-1/);
  assert.match(open, /R-T001-2/);
  assert.match(retro("liste", "--tous").stdout, /R-T001-1 .* → harmonisation:0a1b2c3/);
});

test("an observation deferred by a tuning session stays in the list to decide, with its decision and its note, until the owner decides it", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  seedJournal(repo, [observation({ id: "R-T001-1" }), observation({ id: "R-T001-2" }), observation({ id: "R-T001-3" })]);
  const retro = (...args) => repo.node("scripts/loop/retro.mjs", args);
  const deferred = retro("decider", "R-T001-1", "differee:H001", "it would loosen a check");
  assert.equal(deferred.code, 0, deferred.out);
  for (const wrong of ["differee", "differee:", "differee:H", "differee:T001", "differee:h001", "differee:H001x"]) {
    assert.equal(retro("decider", "R-T001-2", wrong).code, 2, wrong);
  }
  assert.equal(retro("decider", "R-T001-3", "accepte").code, 0);
  assert.deepEqual(statuses(repo), { "R-T001-1": "differee:H001", "R-T001-2": "propose", "R-T001-3": "accepte" });
  const open = retro("liste").stdout;
  assert.match(open, /R-T001-1 .* → differee:H001 \(it would loosen a check\)/);
  assert.match(open, /R-T001-2/);
  assert.doesNotMatch(open, /R-T001-3/);
  assert.equal(retro("decider", "R-T001-1", "refuse", "the check stays").code, 0);
  assert.doesNotMatch(retro("liste").stdout, /R-T001-1/);
});

test("the subjects to tune are the pending problems seen on two tickets or more, or with a strong impact, most frequent first, three at most", async () => {
  const { selectSubjects } = await tuning();
  const seen = (id, ticket, sujet, fields = {}) => observation({ id, ticket, sujet, ...fields });
  const journal = [
    seen("R-T001-1", "T001", "once", { impact: "faible" }),
    seen("R-T001-2", "T001", "strong", { impact: "fort" }),
    seen("R-T001-3", "T001", "twice"),
    seen("R-T002-1", "T002", "twice", { impact: "faible" }),
    seen("R-T002-2", "T002", "twice", { type: "bien" }),
    seen("R-T003-1", "T003", "twice", { statut: "refuse" }),
    seen("R-T001-4", "T001", "same ticket"),
    seen("R-T001-5", "T001", "same ticket"),
    seen("R-T002-3", "T002", "praised", { type: "bien", impact: "fort" }),
    seen("R-T003-2", "T003", "praised", { type: "bien" }),
    seen("R-T002-4", "T002", "decided", { statut: "ticket:T009", impact: "fort" }),
    seen("R-T003-3", "T003", "decided", { statut: "accepte" }),
  ];
  const chosen = (entries) => selectSubjects(entries).map((s) => [s.sujet, s.observations.map((o) => o.id)]);
  assert.deepEqual(chosen(journal), [["twice", ["R-T001-3", "R-T002-1"]], ["strong", ["R-T001-2"]]]);
  const more = [
    seen("R-T004-1", "T004", "late twice"),
    seen("R-T005-1", "T005", "late twice"),
    seen("R-T004-2", "T004", "thrice"),
    seen("R-T005-2", "T005", "thrice"),
    seen("R-T006-1", "T006", "thrice"),
  ];
  assert.deepEqual(chosen([...journal, ...more]).map(([sujet]) => sujet), ["thrice", "twice", "late twice"]);
  assert.deepEqual(chosen(journal.filter((o) => o.sujet !== "twice" && o.sujet !== "strong")), []);
});

test("with no problem that recurs or has a strong impact, the loop says there is nothing to tune and starts no session", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  const seeded = [
    observation({ id: "R-T008-1", ticket: "T008", sujet: "slow review", impact: "moyen" }),
    observation({ id: "R-T009-1", ticket: "T009", sujet: "slow review", type: "bien" }),
    observation({ id: "R-T008-2", ticket: "T008", sujet: "noisy hook", impact: "faible" }),
    observation({ id: "R-T008-3", ticket: "T008", sujet: "noisy hook", impact: "faible" }),
    observation({ id: "R-T008-4", ticket: "T008", sujet: "already decided", statut: "refuse" }),
    observation({ id: "R-T009-2", ticket: "T009", sujet: "already decided", statut: "refuse", impact: "fort" }),
  ];
  seedJournal(repo, seeded);
  const result = repo.loop("done", ["--tune-every", "1", "--no-retro"], { FAKE_TUNE: "edits-skill" });
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /Rien à harmoniser/);
  assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/tickets/H001")), false, "no tuning session was started");
  assert.deepEqual(repo.commits(), ["T001: Add the greeting", "init"]);
  assert.deepEqual(journal(repo), seeded);
});

test("a problem that recurs on two tickets but targets the checks starts no tuning session: there is nothing to tune", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  const seeded = [
    observation({ id: "R-T008-1", ticket: "T008", sujet: "slow check", cible: "controle" }),
    observation({ id: "R-T009-1", ticket: "T009", sujet: "slow check", cible: "controle" }),
  ];
  seedJournal(repo, seeded);
  const result = repo.loop("done", ["--tune-every", "1", "--no-retro"], { FAKE_TUNE: "edits-skill" });
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /Rien à harmoniser/);
  assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/tickets/H001")), false, "no tuning session was started");
  assert.deepEqual(repo.commits(), ["T001: Add the greeting", "init"]);
  assert.deepEqual(journal(repo), seeded);
});

test("a subject that mixes targets brings to the tuning session only its skill and agent observations", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  seedJournal(repo, [
    observation({ id: "R-T008-1", ticket: "T008", cible: "skill" }),
    observation({ id: "R-T009-1", ticket: "T009", cible: "boucle" }),
    observation({ id: "R-T009-2", ticket: "T009", cible: "skill" }),
  ]);
  const result = repo.loop("done", ["--tune-every", "1", "--no-retro"], { FAKE_TUNE: "edits-skill" });
  assert.equal(result.code, 0, result.out);
  const chosen = JSON.parse(repo.read(".harness-state/tickets/H001/observations.json"));
  assert.deepEqual(chosen.map((o) => [o.id, o.cible]), [["R-T008-1", "skill"], ["R-T009-2", "skill"]]);
  const handled = `harmonisation:${lastCommit(repo).head}`;
  assert.deepEqual(statuses(repo), { "R-T008-1": handled, "R-T009-1": "propose", "R-T009-2": handled });
});

test("only skill and agent observations count for a subject: other targets neither bring it in nor add tickets to it", async () => {
  const { selectSubjects } = await tuning();
  const seen = (id, ticket, sujet, cible, fields = {}) => observation({ id, ticket, sujet, cible, ...fields });
  const journal = [
    seen("R-T001-1", "T001", "agent and hook", "agent"),
    seen("R-T002-1", "T002", "agent and hook", "hook"),
    seen("R-T001-2", "T001", "loop only", "boucle", { impact: "fort" }),
    seen("R-T002-2", "T002", "loop only", "boucle"),
    seen("R-T001-3", "T001", "two agents", "agent"),
    seen("R-T002-3", "T002", "two agents", "agent"),
    seen("R-T003-1", "T003", "two agents", "autre"),
    seen("R-T001-4", "T001", "strong elsewhere", "skill"),
    seen("R-T002-4", "T002", "strong elsewhere", "ticket", { impact: "fort" }),
  ];
  const chosen = selectSubjects(journal).map((s) => [s.sujet, s.tickets, s.observations.map((o) => o.id)]);
  assert.deepEqual(chosen, [["two agents", ["T001", "T002"], ["R-T001-3", "R-T002-3"]]]);
});

test("without --tune-every, no tuning session runs, even after two tickets with a recurring problem", (t) => {
  const repo = loopRepo({ "docs/travail/tickets/002-add-farewell.md": ticketText({ id: "T002", titre: "Add the farewell" }) });
  t.after(repo.cleanup);
  const result = repo.loop("done", ["--max", "2"], { FAKE_TUNE: "edits-skill" });
  assert.equal(result.code, 0, result.out);
  assert.deepEqual(repo.commits(), ["T002: Add the farewell", "T001: Add the greeting", "init"]);
  const recurring = journal(repo).filter((o) => o.type === "probleme" && o.statut === "propose" && o.sujet === "reviewer");
  assert.deepEqual(recurring.map((o) => o.ticket), ["T001", "T002"]);
  assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/tickets/H001")), false, "no tuning session was started");
  assert.doesNotMatch(result.out, /harmonis/i);
});

test("every N integrated tickets, a tuning session edits a skill; its commit holds only skills and agents and marks the problems handled", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done", ["--tune-every", "2", "--max", "2"], { FAKE_TUNE: "edits-skill" });
  assert.equal(result.code, 0, result.out);
  const title = "Tune the harness: Tell the reviewer to read the tests first";
  assert.deepEqual(repo.commits(), [title, "T002: Add the farewell", "T001: Add the greeting", "init"]);
  assert.ok(result.out.indexOf("[boucle] T002 intégré") < result.out.indexOf("[boucle] Harmonisation H001"), result.out);
  assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/tickets/H002")), false, "a single tuning session");
  const { env, prompt } = tuneCall(repo);
  assert.deepEqual(env, {
    TVLENS_LOOP: "1",
    TVLENS_TICKET: "H001",
    TVLENS_TICKET_FILE: ".harness-state/tickets/H001/observations.json",
    TVLENS_TUNE: "1",
    TVLENS_HARNESS: "1",
    TVLENS_HARNESS_SCOPE: "consignes",
    TVLENS_REVIEW_MODEL: "opus",
    TVLENS_ALLOW_INSTALL: "0",
  });
  assert.match(prompt, /\.claude\/skills\/harmonisation\/SKILL\.md/);
  const plans = repo.read(".harness-state/tickets/H001/fake-plans").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(plans, [{ model: "claude-opus-5-5", effort: "high", review: "opus" }]);
  const { head, paragraphs, files } = lastCommit(repo);
  assert.ok(files.every((file) => file.startsWith(".claude/skills/") || file.startsWith(".claude/agents/")), files.join("\n"));
  assert.deepEqual(files, [".claude/skills/ticket/SKILL.md"]);
  assert.deepEqual(paragraphs, [title, "Observations: R-T001-2, R-T002-2", "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"]);
  const handled = `harmonisation:${head}`;
  assert.deepEqual(statuses(repo), { "R-T001-1": "propose", "R-T001-2": handled, "R-T002-1": "propose", "R-T002-2": handled });
  assert.equal(repo.git("status", "--porcelain").stdout, "");
});

test("a tuning session can integrate a change to the Codex ticket skill", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done", ["--tune-every", "1"], { FAKE_TUNE: "edits-codex-skill" });
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /Harmonisation H001 intégrée/);
  assert.deepEqual(lastCommit(repo).files, [".agents/skills/ticket-codex/SKILL.md"]);
  assert.equal(repo.read(".agents/skills/ticket-codex/SKILL.md"), "Lire les tests avant de coder.\n");
});

for (const [scenario, expected] of [
  ["edits-check", /Le diff sort des consignes \(\.claude\/skills\/, \.claude\/agents\/, \.agents\/skills\/\) : scripts\/check\.mjs$/m],
  ["review-rejected", /Le dernier relecteur n'a pas accepté revue-1\.diff \(verdict : à corriger\)/],
  ["silent", /sans verdict/],
]) {
  test(`a refused tuning session leaves none of its files, keeps its problems pending, and the next ticket runs: ${scenario}`, (t) => {
    const repo = tuningRepo();
    t.after(repo.cleanup);
    const result = repo.loop("done", ["--tune-every", "1", "--max", "2"], { FAKE_TUNE: scenario });
    assert.equal(result.code, 0, result.out);
    assert.match(repo.read(".harness-state/tickets/H001/refus.txt"), expected);
    assert.ok(result.out.indexOf("[boucle] Harmonisation H001 refusée") < result.out.indexOf("[boucle] T002 intégré"), result.out);
    assert.deepEqual(repo.commits(), ["T002: Add the farewell", "T001: Add the greeting", "init"]);
    assert.deepEqual(lastCommit(repo).files, ["docs/travail/tickets/002-add-farewell.md"]);
    assert.equal(repo.git("status", "--porcelain").stdout, "");
    assert.equal(repo.read(".claude/skills/ticket/SKILL.md"), "# Ticket\n");
    assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/modified-check-ran")), false, "a modified check is never run");
    assert.deepEqual([...new Set(Object.values(statuses(repo)))], ["propose"]);
  });
}

test("a refused tuning session sets aside, intact and out of Git, the new files that appeared while it ran, and names them", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done", ["--tune-every", "1", "--max", "2"], { FAKE_TUNE: "leaves-files" });
  assert.equal(result.code, 0, result.out);
  assert.match(repo.read(".harness-state/tickets/H001/refus.txt"), /^Le diff sort des consignes .* : .*scripts\/check\.mjs/);
  assert.equal(repo.git("status", "--porcelain").stdout, "");
  const aside = ".harness-state/tickets/H001/mis-de-cote/";
  assert.equal(repo.read(aside + "notes/extra.md"), "extra notes\n");
  assert.equal(repo.read(aside + "experiments/idea.md"), "an idea\n");
  const named = result.out.split("\n").find((line) => line.includes(aside)) ?? "";
  for (const file of ["notes/extra.md", "experiments/idea.md"]) assert.ok(named.includes(file), result.out);
  assert.ok(result.out.indexOf(named) < result.out.indexOf("[boucle] T002 intégré"), result.out);
  const refused = repo.events().find((e) => e.phase === "harmonisation-refusee" && e.id === "H001");
  assert.deepEqual([...refused.mis_de_cote].sort(), ["experiments/idea.md", "notes/extra.md"]);
  assert.deepEqual(repo.commits(), ["T002: Add the farewell", "T001: Add the greeting", "init"]);
  assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/modified-check-ran")), false, "a modified check is never run");
});

test("a tuning session that edits the reviewer's instructions is refused by the loop and undone", (t) => {
  const repo = loopRepo({ ".claude/agents/relecteur.md": "# Reviewer\n" });
  t.after(repo.cleanup);
  seedJournal(repo, [observation({ id: "R-T008-1", ticket: "T008", impact: "fort" })]);
  const result = repo.loop("done", ["--tune-every", "1", "--no-retro"], { FAKE_TUNE: "edits-reviewer" });
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /Harmonisation H001 refusée/);
  const [first, ...next] = repo.read(".harness-state/tickets/H001/refus.txt").split("\n");
  assert.equal(first, "Le diff sort des consignes (.claude/skills/, .claude/agents/, .agents/skills/) : .claude/agents/relecteur.md");
  assert.match(next.join("\n"), /\.claude\/agents\/relecteur\.md/);
  assert.equal(repo.read(".claude/agents/relecteur.md"), "# Reviewer\n");
  assert.equal(repo.git("status", "--porcelain").stdout, "");
  assert.deepEqual(repo.commits(), ["T001: Add the greeting", "init"]);
  assert.deepEqual(statuses(repo), { "R-T008-1": "propose" });
});

test("each recorded review keeps its report in relecture-<n>.md, n being its rank, for a ticket as for a tuning session", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  const result = repo.loop("reviewed-twice", ["--tune-every", "1"], { FAKE_TUNE: "review-rejected" });
  assert.equal(result.code, 0, result.out);
  const ticket = ".harness-state/tickets/T001/";
  assert.equal(repo.read(ticket + "relectures.jsonl").trim().split("\n").length, 2);
  assert.equal(repo.read(ticket + "relecture-1.md"), "VERDICT : à corriger\nCONSTATS : 0 bloquant, 1 mineur, 0 hors périmètre\n- name the greeting");
  assert.equal(repo.read(ticket + "relecture-2.md"), "VERDICT : accepté\nCONSTATS : 0 bloquant, 0 mineur, 0 hors périmètre");
  const tuning = ".harness-state/tickets/H001/";
  assert.equal(repo.read(tuning + "relecture-1.md"), "VERDICT : à corriger\nCONSTATS : 1 bloquant, 0 mineur, 0 hors périmètre\n- it removes a proof");
  assert.equal(fs.existsSync(path.join(repo.root, tuning, "relecture-2.md")), false, "a single review of the tuning session");
});

test("a tuning session that follows a refused one is told to read that refusal first, and the last report of its reviewer", (t) => {
  for (const [scenario, report] of [["rejected-twice", ".harness-state/tickets/H001/relecture-2.md"], ["silent", null]]) {
    const repo = tuningRepo();
    t.after(repo.cleanup);
    const result = repo.loop("done", ["--tune-every", "1", "--max", "2"], { FAKE_TUNE: scenario });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /Harmonisation H001 refusée/, scenario);
    assert.doesNotMatch(tuneCall(repo).prompt, /refus\.txt|relecture-/, scenario);
    const prompt = tuneCall(repo, "H002").prompt;
    assert.ok(prompt.includes(".harness-state/tickets/H001/refus.txt"), `${scenario}: ${prompt}`);
    if (report) assert.ok(prompt.includes(report), `${scenario}: ${prompt}`);
    assert.doesNotMatch(prompt, report ? /relecture-1\.md/ : /relecture-/, scenario);
  }
});

test("a tuning session that follows an integrated one is told of no earlier refusal", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done", ["--tune-every", "1", "--max", "2"], { FAKE_TUNE: "edits-skill" });
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /Harmonisation H001 intégrée/);
  assert.ok(fs.existsSync(path.join(repo.root, ".harness-state/tickets/H001/relecture-1.md")), "the integrated session was reviewed");
  for (const id of ["H001", "H002"]) assert.doesNotMatch(tuneCall(repo, id).prompt, /refus\.txt|relecture-/, id);
});

// Dépôt distant local qui refuse tout push contenant un commit d'harmonisation.
const REFUSE_TUNING = `#!/bin/sh
while read old new ref; do
  if git log --format=%s "$new" | grep -q "^Tune the harness"; then
    echo "tuning commits are refused here" >&2
    exit 1
  fi
done
`;

/** Dépôt distant local, `origin` du dépôt de test ; `preReceive`, s'il est donné, décide de ce qu'il accepte. */
function addRemote(repo, preReceive = null) {
  const remote = path.join(repo.root, ".harness-state", "remote.git");
  assert.equal(repo.git("init", "--bare", "-q", remote).code, 0);
  if (preReceive) {
    fs.writeFileSync(path.join(remote, "hooks", "pre-receive"), preReceive);
    fs.chmodSync(path.join(remote, "hooks", "pre-receive"), 0o755);
  }
  repo.git("remote", "add", "origin", remote);
  return remote;
}

/** La boucle avec push, contrairement à `loop()` qui passe toujours `--no-push`. */
const loopWithPush = (repo, args, env) =>
  repo.node("scripts/loop/run.mjs", args, { env: { TVLENS_CLAUDE_BIN: path.join(repo.root, ".harness-state", "fake-claude.cjs"), ...env } });

test("a tuning commit whose push is refused stops the loop with code 3, its problems already marked with that commit", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  addRemote(repo, REFUSE_TUNING);
  const result = loopWithPush(repo, ["--tune-every", "1", "--max", "2"], { FAKE_SCENARIO: "done", FAKE_TUNE: "edits-skill", ...SKILL_RETRO });
  assert.equal(result.code, 3, result.out);
  assert.match(result.out, /Le commit est fait mais le push a échoué/);
  const { head } = lastCommit(repo);
  assert.deepEqual(repo.commits(), ["Tune the harness: Tell the reviewer to read the tests first", "T001: Add the greeting", "init"]);
  assert.equal(statuses(repo)["R-T001-2"], `harmonisation:${head}`);
  assert.equal(repo.events().find((e) => e.phase === "push-refuse").ticket, "H001");
  assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/tickets/T002")), false, "the next ticket was not started");
});

test("a refused tuning session that cannot be undone stops the loop with code 4, names what is left, and starts no other ticket", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done", ["--tune-every", "1", "--max", "2"], { FAKE_TUNE: "blocks-restore" });
  assert.equal(result.code, 4, result.out);
  assert.match(result.out, /remise à HEAD est incomplète/);
  assert.match(result.out, /Restent de la session : scripts\/check\.mjs/);
  assert.match(repo.read(".harness-state/tickets/H001/refus.txt"), /Le diff sort des consignes/);
  const stopped = repo.events().find((e) => e.phase === "harmonisation-non-defaite");
  assert.deepEqual([stopped.id, stopped.reste], ["H001", ["scripts/check.mjs"]]);
  assert.match(stopped.erreurs[0], /^git reset a échoué/);
  assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/tickets/T002")), false, "the next ticket was not started");
  assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/modified-check-ran")), false, "a modified check is never run");
  assert.deepEqual(repo.commits(), ["T001: Add the greeting", "init"]);
  assert.deepEqual([...new Set(Object.values(statuses(repo)))], ["propose"]);
});

test("a refused tuning session that cannot be undone still sets aside its new files, and names them as it stops", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done", ["--tune-every", "1", "--max", "2"], { FAKE_TUNE: "blocks-restore-leaves-file" });
  assert.equal(result.code, 4, result.out);
  assert.equal(repo.read(".harness-state/tickets/H001/mis-de-cote/notes/extra.md"), "extra notes\n");
  assert.match(result.out, /mis de côté dans \.harness-state\/tickets\/H001\/mis-de-cote\/ : notes\/extra\.md/);
  const stopped = repo.events().find((e) => e.phase === "harmonisation-non-defaite");
  assert.deepEqual([stopped.reste, stopped.mis_de_cote], [["scripts/check.mjs"], ["notes/extra.md"]]);
});

test("an unreadable feedback journal skips the tuning with a reason, and the queue goes on", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  repo.write(journalFile, JSON.stringify(observation({ id: "R-T008-1", ticket: "T008", impact: "fort" })) + '\n{"id": "R-T009-1", "tick\n');
  const result = repo.loop("done", ["--tune-every", "1", "--max", "2", "--no-retro"], { FAKE_TUNE: "edits-skill" });
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /Harmonisation sautée : le journal des retours est illisible/);
  assert.deepEqual(repo.commits(), ["T002: Add the farewell", "T001: Add the greeting", "init"]);
  assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/tickets/H001")), false, "no tuning session was started");
  assert.equal(repo.events().filter((e) => e.phase === "harmonisation-sautee").length, 2);
});

test("when the handled problems cannot be marked after the tuning commit, the loop says so and still pushes", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  const remote = addRemote(repo);
  const result = loopWithPush(repo, ["--tune-every", "1"], { FAKE_SCENARIO: "done", FAKE_TUNE: "corrupts-journal", ...SKILL_RETRO });
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /Les observations traitées n'ont pas pu être marquées .*: R-T001-2/);
  const title = "Tune the harness: Tell the reviewer to read the tests first";
  assert.equal(repo.git("--git-dir", remote, "log", "-1", "--format=%s", "work").stdout.trim(), title);
  assert.doesNotMatch(repo.read(journalFile), /harmonisation:/);
  assert.match(repo.events().find((e) => e.phase === "harmonisation-integree").marquage_echoue, /\S/);
});

test("problems a tuning session defers are marked deferred by it with their reason, and shown; an id outside the selection is never marked", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  seedJournal(repo, [
    observation({ id: "R-T008-1", ticket: "T008" }),
    observation({ id: "R-T009-1", ticket: "T009" }),
    observation({ id: "R-T009-2", ticket: "T009", sujet: "praise", type: "bien" }),
  ]);
  const env = { FAKE_TUNE: "edits-skill", FAKE_DEFER: "R-T009-1", FAKE_EXTRA_IDS: "R-T009-2" };
  const result = repo.loop("done", ["--tune-every", "1", "--no-retro"], env);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /Différée par l'harmonisation : R-T009-1 — it would loosen a check/);
  const { head, paragraphs } = lastCommit(repo);
  assert.equal(paragraphs[1], "Observations: R-T008-1");
  assert.deepEqual(statuses(repo), { "R-T008-1": `harmonisation:${head}`, "R-T009-1": "differee:H001", "R-T009-2": "propose" });
  assert.equal(journal(repo).find((o) => o.id === "R-T009-1").note, "it would loosen a check");
});

test("a tuning session that defers everything and changes nothing commits nothing and marks its problems deferred with their reason", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  seedJournal(repo, [observation({ id: "R-T008-1", ticket: "T008", impact: "fort" })]);
  const result = repo.loop("done", ["--tune-every", "1", "--no-retro"], { FAKE_TUNE: "defers-all" });
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /Harmonisation H001 sans changement/);
  assert.match(result.out, /Différée par l'harmonisation : R-T008-1 — it would loosen a check/);
  assert.deepEqual(repo.commits(), ["T001: Add the greeting", "init"]);
  assert.deepEqual(statuses(repo), { "R-T008-1": "differee:H001" });
  assert.equal(journal(repo)[0].note, "it would loosen a check");
});

test("a deferred problem waits for the owner: the next tuning on the same journal no longer selects it, and the list shows it", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  seedJournal(repo, [
    observation({ id: "R-T008-1", ticket: "T008" }),
    observation({ id: "R-T009-1", ticket: "T009", impact: "fort" }),
    observation({ id: "R-T007-1", ticket: "T007", cible: "boucle" }),
  ]);
  const env = { FAKE_TUNE: "edits-skill", FAKE_DEFER: "R-T009-1,R-T007-1" };
  const result = repo.loop("done", ["--tune-every", "1", "--max", "2", "--no-retro"], env);
  assert.equal(result.code, 0, result.out);
  const title = "Tune the harness: Tell the reviewer to read the tests first";
  assert.deepEqual(repo.commits(), ["T002: Add the farewell", title, "T001: Add the greeting", "init"]);
  const tuned = repo.git("rev-parse", "--short", "HEAD~1").stdout.trim();
  assert.deepEqual(statuses(repo), { "R-T008-1": `harmonisation:${tuned}`, "R-T009-1": "differee:H001", "R-T007-1": "propose" });
  assert.equal(journal(repo).find((o) => o.id === "R-T009-1").note, "it would loosen a check");
  assert.ok(result.out.lastIndexOf("Rien à harmoniser") > result.out.indexOf("[boucle] T002 intégré"), result.out);
  assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/tickets/H002")), false, "the deferred problem started no second session");
  const open = repo.node("scripts/loop/retro.mjs", ["liste"]).stdout;
  assert.match(open, /R-T009-1 .* → differee:H001 \(it would loosen a check\)/);
});

test("when the deferred problems cannot be marked, the loop says so with the command to mark them by hand, and goes on", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  seedJournal(repo, [observation({ id: "R-T008-1", ticket: "T008" }), observation({ id: "R-T009-1", ticket: "T009" })]);
  const result = repo.loop("done", ["--tune-every", "1", "--no-retro"], { FAKE_TUNE: "corrupts-journal", FAKE_DEFER: "R-T009-1" });
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /Les observations différées n'ont pas pu être marquées .*: R-T009-1\. .*retro\.mjs decider <id> differee:H001/);
  assert.doesNotMatch(repo.read(journalFile), /differee:/);
});

test("a refused tuning session marks none of the problems it deferred", (t) => {
  const repo = tuningRepo();
  t.after(repo.cleanup);
  seedJournal(repo, [observation({ id: "R-T008-1", ticket: "T008" }), observation({ id: "R-T009-1", ticket: "T009" })]);
  for (const scenario of ["review-rejected", "edits-check"]) {
    const result = repo.loop("done", ["--tune-every", "1", "--no-retro"], { FAKE_TUNE: scenario, FAKE_DEFER: "R-T009-1" });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /Harmonisation H00\d refusée/, scenario);
    assert.match(result.out, /Différée par l'harmonisation : R-T009-1/, scenario);
    assert.deepEqual(statuses(repo), { "R-T008-1": "propose", "R-T009-1": "propose" }, scenario);
  }
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

for (const previous of ["corrupt", "legacy", "missing", "missing-tree", "blob", "option", "diff-failure"]) {
  test(`record recovers a ${previous} previous state and resumes interdiffs on the following record`, (t) => {
    const repo = loopRepo();
    t.after(repo.cleanup);
    const dir = ".harness-state/tickets/T001/";
    const record = () => repo.node("scripts/loop/reviewed-state.mjs", ["record", "--ticket", "T001"]);
    repo.write("core/greeting.cjs", "module.exports = 'before';\n");
    assert.equal(record().code, 0);
    if (previous === "corrupt") repo.write(dir + "reviewed-state.json", "{ incomplete");
    if (previous === "missing") fs.rmSync(path.join(repo.root, dir + "reviewed-state.json"));
    if (previous === "legacy") repo.write(dir + "reviewed-state.json", JSON.stringify({ revue: "revue-1.diff", fichiers: {} }));
    const output = path.join(repo.root, ".harness-state/unexpected-output");
    const trees = {
      "missing-tree": "0".repeat(40),
      blob: repo.git("hash-object", "-w", "core/greeting.cjs").stdout.trim(),
      option: `--output=${output}`,
    };
    if (trees[previous]) repo.write(dir + "reviewed-state.json", JSON.stringify({ revue: "revue-1.diff", fichiers: {}, arbre: trees[previous] }));
    if (previous === "diff-failure") {
      repo.write("core/trigger.cjs", "module.exports = 'force a diff';\n");
      assert.equal(repo.git("config", "diff.external", "false").code, 0);
    }
    const recovered = record();
    assert.equal(fs.existsSync(output), false, "an old tree must never be interpreted as a Git option");
    assert.equal(recovered.code, 0, recovered.out);
    assert.doesNotMatch(recovered.stdout, /interdiff/);
    assert.equal(fs.existsSync(path.join(repo.root, dir + "revue-2.interdiff")), false);
    if (previous === "diff-failure") assert.equal(repo.git("config", "--unset", "diff.external").code, 0);
    repo.write("core/greeting.cjs", "module.exports = 'after';\n");
    const next = record();
    assert.equal(next.code, 0, next.out);
    assert.match(next.stdout, /revue-3\.interdiff/);
    assert.ok(repo.read(dir + "revue-3.interdiff").includes("-module.exports = 'before';"));
  });
}

test("record recovers a corrupt state even before any numbered review exists", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  repo.write(".harness-state/tickets/T001/reviewed-state.json", "{ incomplete");
  const result = repo.node("scripts/loop/reviewed-state.mjs", ["record", "--ticket", "T001"]);
  assert.equal(result.code, 0, result.out);
  assert.match(result.stdout, /revue-1\.diff/);
  repo.write("core/greeting.cjs", "module.exports = 'after recovery';\n");
  const next = repo.node("scripts/loop/reviewed-state.mjs", ["record", "--ticket", "T001"]);
  assert.equal(next.code, 0, next.out);
  assert.ok(repo.read(".harness-state/tickets/T001/revue-2.interdiff").includes("+module.exports = 'after recovery';"));
});

for (const status of ["AD", "RD"]) {
  test(`record accepts a staged path deleted from disk with status ${status} without changing the real index`, (t) => {
    const repo = loopRepo({ "core/greeting.cjs": "module.exports = 'hello';\n" });
    t.after(repo.cleanup);
    const file = "core/removed.cjs";
    if (status === "AD") {
      repo.write(file, "module.exports = 'temporary';\n");
      assert.equal(repo.git("add", "--", file).code, 0);
    } else {
      assert.equal(repo.git("mv", "core/greeting.cjs", file).code, 0);
    }
    fs.rmSync(path.join(repo.root, file));
    const before = repo.git("status", "--porcelain", "-z").stdout;
    assert.ok(before.includes(`${status} ${file}`), before);
    const index = fs.readFileSync(path.join(repo.root, ".git/index"));
    const result = repo.node("scripts/loop/reviewed-state.mjs", ["record", "--ticket", "T001"]);
    assert.equal(result.code, 0, result.out);
    assert.deepEqual(fs.readFileSync(path.join(repo.root, ".git/index")), index);
    assert.equal(repo.git("status", "--porcelain", "-z").stdout, before);
    repo.write(file, "module.exports = 'restored target';\n");
    if (status === "RD") repo.write("core/greeting.cjs", "module.exports = 'restored source';\n");
    const next = repo.node("scripts/loop/reviewed-state.mjs", ["record", "--ticket", "T001"]);
    assert.equal(next.code, 0, next.out);
    const diff = repo.read(".harness-state/tickets/T001/revue-2.interdiff");
    assert.ok(diff.includes(`diff --git a/${file} b/${file}\nnew file mode`), diff);
    assert.ok(diff.includes("+module.exports = 'restored target';"), diff);
    if (status === "RD") {
      assert.ok(diff.includes("diff --git a/core/greeting.cjs b/core/greeting.cjs\nnew file mode"), diff);
      assert.ok(diff.includes("+module.exports = 'restored source';"), diff);
    }
  });
}

test("record includes a force-added ignored file in the review diff and successive interdiffs without changing the real index", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const dir = ".harness-state/tickets/T001/";
  const record = () => {
    const status = repo.git("status", "--porcelain", "-z").stdout;
    const index = fs.readFileSync(path.join(repo.root, ".git/index"));
    const result = repo.node("scripts/loop/reviewed-state.mjs", ["record", "--ticket", "T001"]);
    assert.equal(result.code, 0, result.out);
    assert.deepEqual(fs.readFileSync(path.join(repo.root, ".git/index")), index);
    assert.equal(repo.git("status", "--porcelain", "-z").stdout, status);
  };
  record();
  repo.write(".git/info/exclude", "core/ignored.cjs\ncore/untracked.cjs\n");
  repo.write("core/ignored.cjs", "module.exports = 'force-added';\n");
  repo.write("core/untracked.cjs", "module.exports = 'still ignored';\n");
  assert.equal(repo.git("add", "-f", "--", "core/ignored.cjs").code, 0);
  record();
  for (const suffix of ["diff", "interdiff"]) {
    const diff = repo.read(dir + "revue-2." + suffix);
    assert.match(diff, /diff --git a\/core\/ignored\.cjs b\/core\/ignored\.cjs\nnew file mode/);
    assert.ok(diff.includes("+module.exports = 'force-added';"), diff);
    assert.doesNotMatch(diff, /untracked|still ignored/);
  }
  repo.write("core/ignored.cjs", "module.exports = 'corrected';\n");
  record();
  const diff = repo.read(dir + "revue-3.interdiff");
  assert.ok(diff.includes("-module.exports = 'force-added';"), diff);
  assert.ok(diff.includes("+module.exports = 'corrected';"), diff);
});

test("record names add when a required clean filter fails while filling the temporary index", (t) => {
  const repo = loopRepo({ "core/greeting.cjs": "module.exports = 'hello';\n" });
  t.after(repo.cleanup);
  repo.write("core/greeting.cjs", "module.exports = 'corrected';\n");
  repo.write(".git/info/attributes", "core/greeting.cjs filter=review\n");
  assert.equal(repo.git("config", "filter.review.clean", "false").code, 0);
  assert.equal(repo.git("config", "filter.review.required", "true").code, 0);
  const result = repo.node("scripts/loop/reviewed-state.mjs", ["record", "--ticket", "T001"]);
  assert.equal(result.code, 2, result.out);
  assert.match(result.out, /\(add\)/);
  assert.doesNotMatch(result.out, /--literal-pathspecs/);
});

test("record interdiff includes only corrected files and preserves the working tree and real index", (t) => {
  const repo = loopRepo({ "core/greeting.cjs": "module.exports = 'hey';\n", "core/other.cjs": "module.exports = 1;\n" });
  t.after(repo.cleanup);
  const dir = ".harness-state/tickets/T001/";
  repo.write(dir + "untracked-before.json", JSON.stringify(["notes/personal.md"]));
  repo.write("notes/personal.md", "unrelated\n");
  repo.write("core/other.cjs", "module.exports = 2;\n");
  assert.equal(repo.git("add", "core/other.cjs").code, 0);
  repo.write("core/other.cjs", "module.exports = 3;\n");
  repo.write("core/greeting.cjs", "module.exports = 'hello';\n");
  repo.write("core/new.cjs", "module.exports = 'first review';\n");
  const record = (rank) => {
    const status = repo.git("status", "--porcelain", "-z", "--untracked-files=all").stdout;
    const index = fs.readFileSync(path.join(repo.root, ".git/index"));
    const result = repo.node("scripts/loop/reviewed-state.mjs", ["record", "--ticket", "T001"]);
    assert.equal(result.code, 0, result.out);
    assert.deepEqual(fs.readFileSync(path.join(repo.root, ".git/index")), index);
    assert.equal(repo.git("status", "--porcelain", "-z", "--untracked-files=all").stdout, status);
    if (rank > 1) assert.ok(result.stdout.includes(dir + `revue-${rank}.interdiff`), result.stdout);
  };
  record(1);
  assert.equal(fs.existsSync(path.join(repo.root, dir + "revue-1.interdiff")), false);
  repo.write("core/greeting.cjs", "module.exports = 'corrected';\n");
  repo.write("core/new.cjs", "module.exports = 'corrected new file';\n");
  repo.write("core/café.cjs", "module.exports = 'created by correction';\n");
  repo.write("notes/personal.md", "still unrelated\n");
  repo.write("docs/travail/tickets/001-add-greeting.md", ticketText() + "- journal changed\n");
  record(2);
  const diff = repo.read(dir + "revue-2.interdiff");
  for (const text of ["core/greeting.cjs", "core/new.cjs", "created by correction", "-module.exports = 'hello';"]) {
    assert.ok(diff.includes(text), diff);
  }
  assert.ok(diff.includes("-module.exports = 'first review';"), diff);
  assert.doesNotMatch(diff, /core\/other|personal|journal changed/);
  repo.write("core/greeting.cjs", "module.exports = 'hey';\n");
  fs.rmSync(path.join(repo.root, "core/new.cjs"));
  record(3);
  const third = repo.read(dir + "revue-3.interdiff");
  assert.match(third, /deleted file mode/);
  assert.ok(third.includes("+module.exports = 'hey';"), third);
  assert.doesNotMatch(third, /core\/other|created by correction/);
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

test("--ticket on a ticket that cannot start is refused with code 1 before any session and changes nothing; a queue with nothing ready ends in 0", (t) => {
  const repo = loopRepo({
    "docs/travail/tickets/001-add-greeting.md": ticketText({}, asksOwner),
    "docs/travail/tickets/002-add-farewell.md": ticketText({ id: "T002", titre: "Add the farewell", bloque_par: "T001" }),
  });
  t.after(repo.cleanup);
  const citesQuestion = /T001 attend une décision du propriétaire : which CI provider, and when\?/;
  for (const [args, expected] of [
    [["--ticket", "T001"], citesQuestion],
    [["--ticket", "T001", "--dry-run"], citesQuestion],
    [["--ticket", "T002"], /T002 n'est pas prêt/],
    [["--ticket", "T009"], /T009 n'existe pas/],
  ]) {
    const result = repo.loop("done", args);
    assert.equal(result.code, 1, `${args.join(" ")}\n${result.out}`);
    assert.match(result.out, expected);
    assert.equal(repo.status(), "a-faire");
    assert.equal(repo.git("status", "--porcelain").stdout.trim(), "");
    assert.deepEqual(repo.commits(), ["init"]);
    assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/loop/lock")), false);
    assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/tickets")), false, "no session was started");
  }
  const end = repo.loop("done");
  assert.equal(end.code, 0, end.out);
  assert.match(end.out, /attendent une décision du propriétaire : T001\./);
  assert.doesNotMatch(end.out, /En attente d'une décision/);

  const stuck = loopRepo({
    "docs/travail/tickets/001-add-greeting.md": ticketText({ statut: "en-cours" }),
    "docs/travail/tickets/002-add-farewell.md": ticketText({ id: "T002", titre: "Add the farewell" }),
  });
  t.after(stuck.cleanup);
  const refused = stuck.loop("done", ["--ticket", "T002"]);
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.out, /T001 est « en-cours »/);
  assert.equal(stuck.git("status", "--porcelain").stdout.trim(), "");
  assert.deepEqual(stuck.commits(), ["init"]);
  assert.equal(fs.existsSync(path.join(stuck.root, ".harness-state/loop/lock")), false);
  assert.equal(fs.existsSync(path.join(stuck.root, ".harness-state/tickets")), false, "no session was started");
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

test("a dry run says how often the instructions are tuned, or that they are not", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const every4 = repo.loop("done", ["--dry-run", "--tune-every", "4"]);
  assert.equal(every4.code, 0, every4.out);
  assert.match(every4.out, /Harmonisation des consignes : active, tous les 4 tickets intégrés\./);
  for (const args of [[], ["--tune-every", "0"]]) {
    const off = repo.loop("done", ["--dry-run", ...args]);
    assert.equal(off.code, 0, off.out);
    assert.match(off.out, /Harmonisation des consignes : désactivée/, args.join(" "));
  }
});

test("--tune-every takes a whole number of tickets, zero or more, and anything else is refused at start", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  for (const value of ["four", "-1", "1.5", "", undefined]) {
    const result = repo.loop("done", ["--dry-run", "--tune-every", ...(value === undefined ? [] : [value])]);
    assert.equal(result.code, 1, `${value}\n${result.out}`);
    assert.match(result.out, /--tune-every attend un nombre entier de tickets/, String(value));
  }
  assert.equal(repo.status(), "a-faire");
});

test("a dry run on a queue led by a ticket waiting for a decision names the first ready ticket and starts nothing", (t) => {
  const repo = loopRepo({
    "docs/travail/tickets/001-add-greeting.md": ticketText({}, asksOwner),
    "docs/travail/tickets/002-add-farewell.md": ticketText({ id: "T002", titre: "Add the farewell" }),
  });
  t.after(repo.cleanup);
  const result = repo.loop("done", ["--dry-run"]);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /Prochain ticket : T002 — Add the farewell/);
  assert.match(result.out, /En attente d'une décision du propriétaire : T001\./);
  assert.equal(repo.git("status", "--porcelain").stdout.trim(), "");
  assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/tickets")), false, "no session was started");
});

test("the tickets waiting for a decision are named once per run, even when several tickets are processed", (t) => {
  const repo = loopRepo({
    "docs/travail/tickets/001-add-greeting.md": ticketText({}, asksOwner),
    "docs/travail/tickets/002-add-farewell.md": ticketText({ id: "T002", titre: "Add the farewell" }),
    "docs/travail/tickets/003-add-welcome.md": ticketText({ id: "T003", titre: "Add the welcome" }),
  });
  t.after(repo.cleanup);
  const result = repo.loop("done", ["--max", "2", "--no-retro"]);
  assert.equal(result.code, 0, result.out);
  assert.deepEqual(repo.commits(), ["T003: Add the welcome", "T002: Add the farewell", "init"]);
  assert.equal(result.out.match(/En attente d'une décision du propriétaire : T001\./g).length, 1, result.out);
});

test("a Codex dry run lists its engine and every planned model and effort", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done", ["--dry-run", "--engine", "codex"]);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /Moteur : codex/);
  for (const line of [
    "Palier 0 : gpt-6.1-sol, effort high, relecteur opus",
    "Palier 1 : gpt-6.1-sol, effort xhigh, relecteur opus",
    "Palier 2 : gpt-6-astra, effort xhigh, relecteur opus",
    "Palier 3 : gpt-6-astra, effort max, relecteur fable",
  ]) assert.ok(result.out.includes(line), result.out);
  assert.equal(repo.git("status", "--porcelain").stdout, "");
});

test("an unknown engine is refused before any session or state change", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  for (const value of ["autre", "", null]) {
    const args = ["--engine", ...(value === null ? [] : [value])];
    const result = repo.loop("done", args);
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /--engine/);
    assert.equal(repo.git("status", "--porcelain").stdout, "");
    assert.equal(fs.existsSync(path.join(repo.root, ".harness-state/tickets")), false);
  }
});

const codexDir = ".harness-state/tickets/T001/";
const jsonLines = (repo, file) => repo.read(codexDir + file).trim().split("\n").map(JSON.parse);
function codexRepo(fields = {}) {
  const repo = loopRepo({ "docs/travail/tickets/001-add-greeting.md": ticketText(fields) });
  repo.write(".harness-state/fake-codex.cjs", CODEX_SESSION);
  const bin = path.join(repo.root, ".harness-state/fake-codex.cjs");
  fs.chmodSync(bin, 0o755);
  const codex = (args = [], env = {}) => repo.loop("done", ["--engine", "codex", "--no-retro", ...args], { TVLENS_CODEX_BIN: bin, ...env });
  return { ...repo, codex };
}

test("a sensitive Codex ticket starts on Sol with xhigh effort in both the dry run and the actual session", (t) => {
  const repo = codexRepo({ niveau: "sensible" });
  t.after(repo.cleanup);
  const dry = repo.codex(["--dry-run"]);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /Première tentative : gpt-6\.1-sol, effort xhigh, relecteur opus\./);
  const result = repo.codex(["--attempts", "1"]);
  assert.equal(result.code, 0, result.out);
  const { args } = jsonLines(repo, "fake-codex-calls")[0];
  assert.equal(args[args.indexOf("-m") + 1], "gpt-6.1-sol");
  assert.ok(args.includes('model_reasoning_effort="xhigh"'));
});

for (const harness of [false, true]) {
  test(`Codex only adds its configuration and skill directories for a harness ticket, including corrections: ${harness}`, (t) => {
    const repo = codexRepo({ harnais: harness ? "oui" : "non", niveau: "standard" });
    t.after(repo.cleanup);
    const result = repo.codex(["--attempts", "1"], { FAKE_REVIEWS: JSON.stringify([rejectedReview, acceptedReview]) });
    assert.equal(result.code, 0, result.out);
    const calls = jsonLines(repo, "fake-codex-calls");
    assert.equal(calls.length, 2);
    for (const { args } of calls) {
      const dirs = args.flatMap((arg, i) => arg === "--add-dir" ? [args[i + 1]] : []);
      assert.deepEqual(dirs, harness ? [path.join(repo.root, ".codex"), path.join(repo.root, ".agents")] : []);
    }
  });
}

test("the retrospective of a Codex attempt cites its stream without an unknown compaction count", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done", ["--engine", "codex"], { TVLENS_CODEX_BIN: path.join(repo.root, ".harness-state/fake-codex.cjs") });
  assert.equal(result.code, 0, result.out);
  const digest = repo.read(codexDir + "retro-entree.md");
  assert.ok(digest.includes(codexDir + "codex-1.jsonl"), digest);
  assert.doesNotMatch(digest, /session-1\.jsonl|undefined|compaction/);
});

test("a Codex ticket accepted on its first review is integrated with safe options and its own signature", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex(["--attempts", "1"]);
  assert.equal(result.code, 0, result.out);
  assert.ok(fs.existsSync(path.join(repo.root, codexDir, "fake-codex-calls")), "the loop must launch Codex");
  const calls = jsonLines(repo, "fake-codex-calls");
  assert.equal(calls.length, 1);
  const { args, cwd, stdin, env } = calls[0];
  assert.deepEqual(args.slice(0, 2), ["exec", "--json"]);
  const option = (name) => args[args.indexOf(name) + 1];
  assert.equal(option("-s"), "workspace-write");
  assert.equal(option("-C"), repo.root);
  assert.equal(option("-m"), "gpt-6.1-sol");
  for (const value of [
    'approval_policy="never"', 'sandbox_workspace_write.network_access=true', 'model_reasoning_effort="high"',
  ]) assert.ok(args.some((arg, i) => arg === "-c" && args[i + 1] === value), args.join(" "));
  assert.equal(args.includes("--ignore-user-config"), false);
  assert.ok(args.includes("--dangerously-bypass-hook-trust"));
  assert.ok(args.at(-1).includes(".agents/skills/ticket-codex/SKILL.md"));
  assert.equal(cwd, repo.root);
  assert.equal(stdin, "");
  assert.deepEqual(env, { LOOP: "1", TICKET: "T001", TICKET_FILE: "docs/travail/tickets/001-add-greeting.md", HARNESS: "0", ALLOW_INSTALL: "0" });
  const review = jsonLines(repo, "fake-review-calls")[0];
  assert.equal(review.model, "opus");
  assert.ok(review.args.includes("--strict-mcp-config"));
  assert.equal(review.args[review.args.indexOf("--output-format") + 1], "json");
  for (const file of ["001-add-greeting.md", "revue-1.diff", "revue-1.fichiers"]) assert.ok(review.prompt.includes(file), review.prompt);
  assert.deepEqual(jsonLines(repo, "relectures.jsonl").map(r => r.verdict), ["accepté"]);
  assert.equal(JSON.parse(repo.read(codexDir + "verdict.json")).resume, "fake codex");
  assert.equal(repo.status(), "termine");
  assert.match(repo.git("log", "-1", "--format=%B").stdout, /Co-Authored-By: Codex \(GPT-6.1 Sol\) <noreply@openai.com>/);
  assert.equal(repo.events().find(e => e.phase === "session").moteur, "codex");
  const ended = repo.events().find(e => e.phase === "session-terminee");
  assert.deepEqual(ended.jetons, { input_tokens: 10, cached_input_tokens: 4, output_tokens: 5, reasoning_output_tokens: 2 });
  assert.equal(ended.tours, 1);
  assert.equal(ended.relectures, 1);
  assert.equal(ended.cout_usd, null);
  assert.ok(Number.isFinite(ended.duree_s) && ended.duree_s >= 0);
  assert.match(result.out, /\[boucle\] \d\d:\d\d  Bash node --test/);
  assert.match(result.out, /\[boucle\] \d\d:\d\d  Write core\/greeting.cjs/);
  assert.equal(jsonLines(repo, "codex-1.jsonl").length, 5);
});

const rejectedReview = "VERDICT : à corriger\nCONSTATS : 1 bloquant, 1 mineur, 0 hors périmètre\n- core/greeting.cjs:1 : preuve manquante.\n- nom à préciser.";
const acceptedReview = "VERDICT : accepté\nCONSTATS : 0 bloquant, 0 mineur, 0 hors périmètre";
const correctedReview = (report) => report.replace(/^(CONSTATS[^\n]*)/m, "$1\nNON CORRIGÉS : 0");

for (const engine of ["claude", "codex"]) {
  for (const change of ["add", "remove", "delete"]) {
    test(`the gates refuse ${engine} when its session makes an untracked list change: ${change}`, (t) => {
      const repo = codexRepo();
      t.after(repo.cleanup);
      repo.write("notes/personal.md", "mine\n");
      const env = { FAKE_UNTRACKED_CHANGE: change };
      const result = engine === "codex" ? repo.codex(["--attempts", "1"], env)
        : repo.loop("changes-untracked-list", ["--attempts", "1"], env);
      assert.equal(result.code, 2, result.out);
      assert.match(repo.failure(), /untracked-before\.json/);
      assert.match(repo.failure(), /modifi|absen/);
      assert.equal(jsonLines(repo, "relectures.jsonl").at(-1).verdict, "accepté");
      assert.deepEqual(repo.commits(), ["init"]);
    });
  }
}

test("the last accepted Codex review carries both out-of-scope findings into the committed journal and reserve count", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const findings = [
    "core/legacy.cjs:8 : hors périmètre — erreur sans code stable. Ajouter un code lors d'un prochain ticket.",
    "docs/notes.md:3 : hors périmètre — exemple périmé. Actualiser la commande.",
  ];
  const report = "VERDICT : accepté\nCONSTATS : 0 bloquant, 0 mineur, 2 hors périmètre\n\n" + findings.map(f => `- ${f}`).join("\n");
  const result = repo.codex(["--attempts", "1"], { FAKE_REVIEWS: JSON.stringify([rejectedReview, report]) });
  assert.equal(result.code, 0, result.out);
  const journal = committedTicket(repo).split("### Réserves à la clôture\n")[1];
  assert.ok(journal, committedTicket(repo));
  for (const finding of findings) assert.ok(journal.includes(finding), journal);
  assert.equal((journal.match(/relecture-2\.md/g) || []).length, 2, journal);
  assert.doesNotMatch(journal, /relecture-1|preuve manquante|nom à préciser/);
  assert.match(repo.git("log", "-1", "--format=%B").stdout, /^Reserves: 2, listed in the ticket journal\.$/m);
  const integrated = repo.events().find(e => e.phase === "integre");
  assert.equal(integrated.reserves.length, 2);
  for (const reserve of integrated.reserves) assert.ok(reserve.includes(codexDir + "relecture-2.md"));
  assert.deepEqual(JSON.parse(repo.read(codexDir + "verdict.json")).reste, []);
});

test("Codex preserves accepted deviations and complete multiline findings alongside the session reserves", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const finding = "`core/legacy.cjs:8` — **hors périmètre**\n  Une erreur perd son code stable.\n\n  Attendu : ajouter un code.";
  const deviation = "**Écart accepté, critère 3 :** mesure remplacée par une preuve déterministe.\n  Motif : fournisseur indisponible.";
  const report = "VERDICT : accepté\nCONSTATS : 0 bloquant, 0 mineur, 1 hors périmètre\n\n" +
    `## Constats hors périmètre\n\n1. ${finding}\n\n## Écarts\n\n${deviation}`;
  const old = rejectedReview + "\n- docs/obsolete.md:2 : hors périmètre — ancien constat corrigé depuis.";
  const result = repo.codex(["--attempts", "1"], {
    FAKE_REVIEWS: JSON.stringify([old, report]), FAKE_CODEX_RESERVES: JSON.stringify(["Vérification manuelle à prévoir."]),
  });
  assert.equal(result.code, 0, result.out);
  const kept = repo.events().find(e => e.phase === "integre").reserves;
  assert.equal(kept.length, 3, JSON.stringify(kept));
  assert.equal(kept[0], "Vérification manuelle à prévoir.");
  assert.ok(kept[1].includes(finding), kept[1]);
  assert.ok(kept[2].includes(deviation), kept[2]);
  for (const reserve of kept.slice(1)) assert.ok(reserve.includes(codexDir + "relecture-2.md"));
  assert.doesNotMatch(committedTicket(repo), /obsolete|relecture-1/);
  assert.match(repo.git("log", "-1", "--format=%B").stdout, /^Reserves: 3, listed in the ticket journal\.$/m);
  assert.deepEqual(JSON.parse(repo.read(codexDir + "verdict.json")).reste, ["Vérification manuelle à prévoir."]);
});

for (const [announced, extracted] of [[2, 0], [2, 1], [1, 2], [0, 1]]) {
  test(`Codex references the report when the finding count disagrees: ${announced} announced, ${extracted} extracted`, (t) => {
    const repo = codexRepo();
    t.after(repo.cleanup);
    const findings = Array.from({ length: extracted }, (_, i) => `- core/legacy.cjs:${i + 1} : hors périmètre — à reprendre.`);
    const deviation = "Écart accepté, critère 3 : preuve déterministe.";
    const report = ["VERDICT : accepté", `CONSTATS : 0 bloquant, 0 mineur, ${announced} hors périmètre`, "",
      "## Constats", "", ...findings, "", "## Écarts déclarés", "", `- ${deviation}`].join("\n");
    const result = repo.codex(["--attempts", "1"], { FAKE_REVIEWS: JSON.stringify([report]) });
    assert.equal(result.code, 0, result.out);
    const kept = repo.events().find(e => e.phase === "integre").reserves;
    assert.equal(kept.length, 2, JSON.stringify(kept));
    assert.ok(kept[0].startsWith(codexDir + "relecture-1.md : "), kept[0]);
    assert.ok(kept[0].includes(`CONSTATS annonce ${announced} hors périmètre`), kept[0]);
    assert.ok(kept[0].includes(`${extracted} constat(s) extrait(s)`), kept[0]);
    assert.match(kept[0], /discordant.*Consulter le rapport/);
    assert.doesNotMatch(kept[0], /core\/legacy/);
    assert.equal(kept[1], `${codexDir}relecture-1.md : ${deviation}`);
    const journal = committedTicket(repo).split("### Réserves à la clôture\n")[1];
    assert.ok(journal.includes(kept[0]), journal);
    assert.match(repo.git("log", "-1", "--format=%B").stdout, /^Reserves: 2, listed in the ticket journal\.$/m);
    assert.deepEqual(JSON.parse(repo.read(codexDir + "verdict.json")).reste, []);
  });
}

for (const section of ["Écarts déclarés", "Décisions sur les écarts", "Décisions sur les écarts déclarés"]) {
  test(`Codex retains singular and plural accepted deviations as separate reserves: ${section}`, (t) => {
    const repo = codexRepo();
    t.after(repo.cleanup);
    const deviations = [
      "**Écart accepté, critère 3.** Preuve déterministe conservée.\n  Motif : fournisseur indisponible.",
      "**Écarts acceptés, documentation (écarts 4 et 10).** Les passages périmés ont été actualisés.",
    ];
    const report = [acceptedReview, "", `## ${section}`, "", ...deviations.flatMap(d => [`- ${d}`, ""]),
      "- **Précision acceptée.** Aucun changement de critère.", "", "## Critères", "",
      "- Écart accepté, critère 3 : citation dans une preuve, pas une nouvelle réserve."].join("\n");
    const result = repo.codex(["--attempts", "1"], { FAKE_REVIEWS: JSON.stringify([report]) });
    assert.equal(result.code, 0, result.out);
    const kept = repo.events().find(e => e.phase === "integre").reserves;
    assert.deepEqual(kept, deviations.map(d => `${codexDir}relecture-1.md : ${d}`));
    const journal = committedTicket(repo).split("### Réserves à la clôture\n")[1];
    assert.ok(journal.includes("Écarts acceptés, documentation (écarts 4 et 10)"), journal);
    assert.doesNotMatch(journal, /Précision|citation/);
    assert.match(repo.git("log", "-1", "--format=%B").stdout, /^Reserves: 2, listed in the ticket journal\.$/m);
  });
}

for (const form of ["heading", "bold", "numbered", "fields"]) {
  test(`Codex preserves complete structured findings without counting the summary or criteria: ${form}`, (t) => {
    const repo = codexRepo();
    t.after(repo.cleanup);
    const locations = ["core/legacy.cjs:8", "docs/notes.md:3"];
    const findings = locations.map((location, i) => {
      const title = `${i + 1}. \`${location}\` — hors périmètre`;
      const titles = { heading: `### ${title}`, bold: `**${title}**`, numbered: title, fields: `- \`${location}\` ;` };
      return [titles[form], "", `- Problème : détail complet ${i + 1}.`, "", "- Attendu : réparer dans un prochain ticket.",
        ...(form === "fields" ? ["- Classe : hors périmètre."] : [])].join("\n");
    });
    const summary = "Synthèse : core/fixed.cjs:12 est corrigé ; deux constats hors périmètre restent.";
    const criterion = "1. core/criterion.cjs:6 — hors périmètre cité dans la preuve du critère.";
    const report = ["VERDICT : accepté", "CONSTATS : 0 bloquant, 0 mineur, 2 hors périmètre", "", summary, "",
      "## Constats", "", ...findings.flatMap(f => [f, ""]), "## Critères", "", criterion].join("\n");
    const result = repo.codex(["--attempts", "1"], { FAKE_REVIEWS: JSON.stringify([rejectedReview, report]) });
    assert.equal(result.code, 0, result.out);
    const kept = repo.events().find(e => e.phase === "integre").reserves;
    assert.equal(kept.length, 2, JSON.stringify(kept));
    for (let i = 0; i < findings.length; i++) {
      assert.ok(kept[i].includes(locations[i]), kept[i]);
      assert.ok(kept[i].includes(`- Problème : détail complet ${i + 1}.\n\n- Attendu : réparer dans un prochain ticket.`), kept[i]);
      assert.ok(kept[i].startsWith(codexDir + "relecture-2.md : "), kept[i]);
      assert.doesNotMatch(kept[i], /###|Synthèse|criterion|relecture-1/);
    }
    const journal = committedTicket(repo).split("### Réserves à la clôture\n")[1];
    assert.doesNotMatch(journal, /Synthèse|criterion/);
    for (let i = 1; i <= 2; i++) assert.ok(journal.includes(`Problème : détail complet ${i}.`), journal);
    assert.match(repo.git("log", "-1", "--format=%B").stdout, /^Reserves: 2, listed in the ticket journal\.$/m);
    assert.deepEqual(JSON.parse(repo.read(codexDir + "verdict.json")).reste, []);
  });
}

test("Codex trusts the project and identifies its engine on startup and every fresh correction", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex(["--attempts", "1"], { FAKE_REVIEWS: JSON.stringify([rejectedReview, acceptedReview]) });
  assert.equal(result.code, 0, result.out);
  const calls = jsonLines(repo, "fake-codex-calls");
  assert.equal(calls.length, 2);
  for (const call of calls) {
    const trust = `projects.${JSON.stringify(repo.root)}.trust_level="trusted"`;
    assert.ok(call.args.some((arg, i) => arg === "-c" && call.args[i + 1] === trust), call.args.join(" "));
    assert.equal(call.engine, "codex");
    assert.deepEqual(call.args.slice(0, 2), ["exec", "--json"]);
  }
});

test("Codex neutralizes user extensions and only active MCP servers on startup and correction", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const servers = [{ name: "research", enabled: true }, { name: "team.docs", enabled: true }, { name: "paused", enabled: false }];
  const result = repo.codex(["--attempts", "1"], {
    FAKE_CODEX_MCP_LIST: JSON.stringify(servers), FAKE_REVIEWS: JSON.stringify([rejectedReview, acceptedReview]),
  });
  assert.equal(result.code, 0, result.out);
  const calls = jsonLines(repo, "fake-codex-calls");
  assert.equal(calls.length, 2);
  for (const { args } of calls) {
    assert.equal(args.includes("--ignore-user-config"), false);
    const disabled = args.flatMap((arg, i) => arg === "--disable" ? [args[i + 1]] : []);
    assert.deepEqual(disabled, ["plugins", "apps", "memories", "image_generation"]);
    const configs = args.flatMap((arg, i) => arg === "-c" ? [args[i + 1]] : []);
    assert.ok(configs.includes("notify=[]"));
    assert.deepEqual(configs.filter(value => value.startsWith("mcp_servers.")), [
      "mcp_servers.research.enabled=false", 'mcp_servers."team.docs".enabled=false',
    ]);
  }
  const listings = jsonLines(repo, "fake-mcp-calls");
  assert.equal(listings.length, 2);
  for (const listing of listings) {
    assert.deepEqual(listing.args.slice(0, 3), ["mcp", "list", "--json"]);
    assert.deepEqual(listing.args.slice(3), calls[0].args.filter((_, i, args) => args[i - 1] === "--disable" || args[i] === "--disable"));
    assert.equal(listing.cwd, repo.root);
  }
});

for (const [kind, env] of [
  ["failed", { FAKE_CODEX_MCP_FAILURE: "1" }],
  ["unreadable", { FAKE_CODEX_MCP_LIST: "{ incomplete" }],
  ["not an array", { FAKE_CODEX_MCP_LIST: "{}" }],
  ["ambiguous activation", { FAKE_CODEX_MCP_LIST: '[{"name":"docs"}]' }],
]) {
  test(`a ${kind} MCP server list refuses Codex without any exec or review`, (t) => {
    const repo = codexRepo();
    t.after(repo.cleanup);
    const result = repo.codex(["--attempts", "1"], env);
    assert.equal(result.code, 2, result.out);
    assert.match(repo.failure(), /liste des serveurs MCP/);
    assert.equal(fs.existsSync(path.join(repo.root, codexDir, "fake-codex-calls")), false);
    assert.equal(fs.existsSync(path.join(repo.root, codexDir, "fake-review-calls")), false);
    assert.equal(jsonLines(repo, "fake-mcp-calls").length, 1);
    assert.deepEqual(repo.commits(), ["init"]);
  });
}

test("a Codex session without its startup hook is refused before review, even with an older witness", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  repo.write(codexDir + "hooks-started.json", JSON.stringify({ session: "codex-thread-1", run: "old-launch" }));
  const result = repo.codex(["--attempts", "1"], { FAKE_CODEX_HOOKS: "missing" });
  assert.equal(result.code, 2, result.out);
  assert.match(repo.failure(), /hooks Codex non chargés/);
  assert.match(repo.failure(), /\.codex\/hooks\.json.*non approuvés.*dépôt/);
  assert.match(repo.failure(), /hors du dépôt approuvé/);
  assert.match(repo.failure(), /propriétaire.*codex.*\/hooks/);
  assert.equal(fs.existsSync(path.join(repo.root, codexDir, "fake-review-calls")), false);
  assert.equal(repo.events().find(e => e.phase === "session-terminee").relectures, 0);
  assert.deepEqual(repo.commits(), ["init"]);
});

test("a failed Codex process without its hook witness retains the failure and explains approval", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex(["--attempts", "1"], { FAKE_CODEX_HOOKS: "missing", FAKE_CODEX_FAILURE: "exit" });
  assert.equal(result.code, 2, result.out);
  assert.match(repo.failure(), /processus en échec/);
  assert.match(repo.failure(), /hooks Codex non chargés.*non approuvés.*hors du dépôt approuvé.*propriétaire.*codex.*\/hooks/);
  assert.equal(fs.existsSync(path.join(repo.root, codexDir, "fake-review-calls")), false);
  assert.deepEqual(repo.commits(), ["init"]);
});

test("a fresh Codex correction without its hook witness is refused before another review", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex(["--attempts", "1"], {
    FAKE_CODEX_HOOKS: "missing-on-correction", FAKE_REVIEWS: JSON.stringify([rejectedReview, acceptedReview]),
  });
  assert.equal(result.code, 2, result.out);
  assert.match(repo.failure(), /hooks Codex non chargés/);
  assert.match(repo.failure(), /\.codex\/hooks\.json.*non approuvés.*dépôt/);
  assert.match(repo.failure(), /hors du dépôt approuvé/);
  assert.match(repo.failure(), /propriétaire.*codex.*\/hooks/);
  const calls = jsonLines(repo, "fake-codex-calls");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].args.slice(0, 2), ["exec", "--json"]);
  assert.equal(jsonLines(repo, "fake-review-calls").length, 1);
  assert.deepEqual(repo.commits(), ["init"]);
});

test("the separate Claude reviewer does not inherit the Codex startup instructions", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex(["--attempts", "1"]);
  assert.equal(result.code, 0, result.out);
  assert.equal(jsonLines(repo, "fake-review-calls")[0].engine, null);
});

test("Codex starts a fresh guarded correction with the ticket, report and existing tree before integration", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex(["--attempts", "1"], { FAKE_REVIEWS: JSON.stringify([rejectedReview, acceptedReview]) });
  assert.equal(result.code, 0, result.out);
  const calls = jsonLines(repo, "fake-codex-calls");
  assert.equal(calls.length, 2);
  const corrected = calls[1];
  assert.deepEqual(corrected.args.slice(0, 2), ["exec", "--json"]);
  assert.deepEqual(corrected.args.slice(0, -1), calls[0].args.slice(0, -1));
  const prompt = corrected.args.at(-1);
  assert.ok(prompt.includes("T001"));
  assert.ok(prompt.includes("docs/travail/tickets/001-add-greeting.md"));
  assert.ok(prompt.includes(codexDir + "relecture-1.md"));
  assert.ok(prompt.includes(".agents/skills/ticket-codex/SKILL.md"));
  assert.match(prompt, /reprends.*travail.*arbre/i);
  assert.ok(prompt.includes(rejectedReview), "the complete report must reach the fresh correction");
  for (const value of [
    'approval_policy="never"',
    'sandbox_workspace_write.network_access=true', 'model_reasoning_effort="high"',
  ]) assert.ok(corrected.args.some((arg, i) => arg === "-c" && corrected.args[i + 1] === value), corrected.args.join(" "));
  assert.equal(corrected.args.includes("--ignore-user-config"), false);
  assert.ok(corrected.args.includes("--dangerously-bypass-hook-trust"));
  assert.ok(corrected.args.includes("--json"));
  assert.equal(corrected.args[corrected.args.indexOf("-m") + 1], "gpt-6.1-sol");
  assert.equal(corrected.args[corrected.args.indexOf("-s") + 1], "workspace-write");
  assert.equal(corrected.args[corrected.args.indexOf("-C") + 1], repo.root);
  assert.equal(corrected.cwd, repo.root);
  assert.equal(corrected.stdin, "");
  assert.deepEqual(corrected.env, calls[0].env);
  assert.equal(corrected.greetingPresent, true);
  assert.notEqual(corrected.session, calls[0].session);
  assert.ok(corrected.run);
  assert.notEqual(corrected.run, calls[0].run);
  assert.deepEqual(JSON.parse(repo.read(codexDir + "hooks-started.json")), { session: corrected.session, run: corrected.run });
  const reviews = jsonLines(repo, "relectures.jsonl");
  assert.deepEqual(reviews.map(r => [r.revue, r.verdict]), [["revue-1.diff", "à corriger"], ["revue-2.diff", "accepté"]]);
  assert.equal(repo.read(codexDir + "relecture-1.md"), rejectedReview);
  assert.equal(repo.read(codexDir + "relecture-2.md"), correctedReview(acceptedReview));
  assert.equal(repo.status(), "termine");
  const ended = repo.events().find(e => e.phase === "session-terminee");
  assert.equal(ended.relectures, 2);
  assert.equal(ended.tours, 2);
  assert.deepEqual(ended.jetons, { input_tokens: 20, cached_input_tokens: 8, output_tokens: 10, reasoning_output_tokens: 4 });
  assert.equal(jsonLines(repo, "codex-1.jsonl").length, 10);
  assert.deepEqual(jsonLines(repo, "codex-1.jsonl").filter(e => e.type === "thread.started").map(e => e.thread_id), calls.map(c => c.session));
});

test("an unreadable Codex review starts a fresh correction naming its recorded report", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const unreadable = "Rapport incomplet : relire les preuves.";
  const result = repo.codex(["--attempts", "1"], { FAKE_REVIEWS: JSON.stringify([unreadable, acceptedReview]) });
  assert.equal(result.code, 0, result.out);
  const calls = jsonLines(repo, "fake-codex-calls");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].args.slice(0, 2), ["exec", "--json"]);
  assert.ok(calls[1].args.at(-1).includes(codexDir + "relecture-1.md"));
  assert.ok(calls[1].args.at(-1).includes(unreadable));
  assert.equal(repo.read(codexDir + "relecture-1.md"), unreadable);
  assert.deepEqual(jsonLines(repo, "relectures.jsonl").map(r => r.verdict), ["illisible", "accepté"]);
  assert.deepEqual(JSON.parse(repo.read(codexDir + "hooks-started.json")), { session: calls[1].session, run: calls[1].run });
});

test("a Codex correction reviewer receives the previous report and exact interdiff while the first review stays complete", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex(["--attempts", "1"], { FAKE_REVIEWS: JSON.stringify([rejectedReview, acceptedReview]) });
  assert.equal(result.code, 0, result.out);
  const reviews = jsonLines(repo, "fake-review-calls");
  assert.equal(reviews.length, 2);
  assert.doesNotMatch(reviews[0].prompt, /interdiff|relecture-\d+\.md|relecture de correction/i);
  assert.match(reviews[1].prompt, /relecture de correction/i);
  assert.ok(reviews[1].prompt.includes(codexDir + "relecture-1.md"), reviews[1].prompt);
  assert.ok(reviews[1].prompt.includes(codexDir + "revue-2.interdiff"), reviews[1].prompt);
  assert.equal(fs.existsSync(path.join(repo.root, codexDir + "revue-2.interdiff")), true);
});

test("a complete Codex review can restart from a legacy recorded state without an interdiff", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  repo.write(codexDir + "revue-1.diff", "old review\n");
  repo.write(codexDir + "reviewed-state.json", JSON.stringify({ revue: "revue-1.diff", fichiers: {} }));
  const result = repo.codex(["--attempts", "1"]);
  assert.equal(result.code, 0, result.out);
  const reviews = jsonLines(repo, "fake-review-calls");
  assert.equal(reviews.length, 1);
  assert.match(reviews[0].prompt, /revue-2\.diff/);
  assert.doesNotMatch(reviews[0].prompt, /interdiff|relecture de correction/i);
});

for (const previous of ["corrupt", "legacy", "missing"]) {
  test(`a Codex correction refuses a missing interdiff after a ${previous} state without crashing`, (t) => {
    const repo = codexRepo();
    t.after(repo.cleanup);
    const result = repo.codex(["--attempts", "1"], {
      FAKE_REVIEWS: JSON.stringify([rejectedReview, acceptedReview]), FAKE_CODEX_REVIEW_STATE: previous,
    });
    assert.equal(result.code, 2, result.out);
    assert.match(repo.failure(), /interdiff.*absent/i);
    assert.ok(repo.failure().includes(codexDir + "reviewed-state.json"), repo.failure());
    assert.equal(jsonLines(repo, "fake-review-calls").length, 1);
    assert.equal(jsonLines(repo, "fake-codex-calls").length, 2);
    assert.deepEqual(repo.commits(), ["init"]);
    assert.doesNotMatch(result.out, /TypeError/);
  });
}

test("a Codex correction with an unresolved finding refuses the attempt without a third session", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex(["--attempts", "1"], {
    FAKE_REVIEWS: JSON.stringify([rejectedReview, acceptedReview]), FAKE_UNCORRECTED: "1",
  });
  assert.equal(result.code, 2, result.out);
  assert.equal(jsonLines(repo, "fake-codex-calls").length, 2);
  assert.equal(jsonLines(repo, "fake-review-calls").length, 2);
  assert.ok(repo.failure().includes(codexDir + "relecture-2.md"), repo.failure());
  assert.match(repo.failure(), /non corrigé.*palier suivant/s);
  assert.equal(jsonLines(repo, "relectures.jsonl").at(-1).verdict, "à corriger");
  assert.deepEqual(repo.commits(), ["init"]);
});

test("Codex escalates immediately after an unresolved correction and starts a complete review on the next rung", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex(["--attempts", "2"], {
    FAKE_REVIEWS: JSON.stringify([rejectedReview, rejectedReview, acceptedReview]), FAKE_UNCORRECTED: "1",
  });
  assert.equal(result.code, 0, result.out);
  const calls = jsonLines(repo, "fake-codex-calls");
  assert.equal(calls.length, 3);
  assert.ok(calls[2].args.includes('model_reasoning_effort="xhigh"'));
  assert.ok(calls[2].args.at(-1).includes("echec-1.txt"));
  assert.ok(repo.failure().includes(codexDir + "relecture-2.md"), repo.failure());
  assert.match(repo.failure(), /non corrigé.*palier suivant/s);
  assert.deepEqual(repo.events().filter(e => e.phase === "session-terminee").map(e => e.relectures), [2, 1]);
  assert.deepEqual(repo.events().filter(e => e.phase === "session").map(e => e.palier), [0, 1]);
  const reviews = jsonLines(repo, "fake-review-calls");
  assert.doesNotMatch(reviews[2].prompt, /interdiff|relecture-\d+\.md|relecture de correction/i);
});

for (const count of ["missing", "inconnu", "-1", "0 restant", "0.5"]) {
  test(`an absent or unreadable correction count refuses Codex without another correction: ${count}`, (t) => {
    const repo = codexRepo();
    t.after(repo.cleanup);
    const result = repo.codex(["--attempts", "1"], {
      FAKE_REVIEWS: JSON.stringify([rejectedReview, acceptedReview]), FAKE_UNCORRECTED: count,
    });
    assert.equal(result.code, 2, result.out);
    assert.equal(jsonLines(repo, "fake-codex-calls").length, 2);
    assert.ok(repo.failure().includes(codexDir + "relecture-2.md"), repo.failure());
    assert.deepEqual(repo.commits(), ["init"]);
  });
}

test("three rejected Codex reviews with resolved findings exhaust two corrections and the next attempt raises the Sol effort", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const reports = Array.from({ length: 3 }, (_, i) => (i ? correctedReview(rejectedReview) : rejectedReview) + `\nNouveau constat ${i + 1}.`);
  const result = repo.codex(["--attempts", "2"], { FAKE_REVIEWS: JSON.stringify([...reports, acceptedReview]) });
  assert.equal(result.code, 0, result.out);
  const calls = jsonLines(repo, "fake-codex-calls");
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map(c => c.args.slice(0, 2)), Array(4).fill(["exec", "--json"]));
  assert.deepEqual(calls.map(c => c.args[c.args.indexOf("-m") + 1]), Array(4).fill("gpt-6.1-sol"));
  assert.ok(calls[3].args.includes('model_reasoning_effort="xhigh"'));
  for (let i = 1; i <= 2; i++) {
    assert.ok(calls[i].args.at(-1).includes(reports[i - 1]));
    assert.ok(calls[i].args.at(-1).includes(codexDir + `relecture-${i}.md`));
  }
  assert.ok(repo.failure().includes(reports[2]), repo.failure());
  assert.equal(jsonLines(repo, "relectures.jsonl").length, 4);
  assert.deepEqual(repo.events().filter(e => e.phase === "session-terminee").map(e => e.relectures), [3, 1]);
  assert.deepEqual(repo.events().filter(e => e.phase === "session").map(e => e.palier), [0, 1]);
  assert.ok(calls[3].args.at(-1).includes("echec-1.txt"));
  assert.equal(repo.status(), "termine");
  assert.match(repo.git("log", "-1", "--format=%B").stdout, /Co-Authored-By: Codex \(GPT-6.1 Sol\) <noreply@openai.com>/);
});

test("a Codex session that edits the quality check without harness permission is refused by the gates", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex(["--attempts", "1"], { FAKE_CODEX_EDIT: "scripts/check.mjs" });
  assert.equal(result.code, 2, result.out);
  assert.match(repo.failure(), /harnais a été modifié sans que le ticket l'autorise.*scripts\/check\.mjs/);
  assert.equal(jsonLines(repo, "relectures.jsonl")[0].verdict, "accepté");
  assert.deepEqual(repo.commits(), ["init"]);
});

test("the loop protects Codex hooks, instructions and their shared entry point without harness permission", (t) => {
  for (const file of [".codex/hooks.json", ".agents/skills/example/SKILL.md", "AGENTS.md"]) {
    const repo = codexRepo();
    t.after(repo.cleanup);
    const result = repo.codex(["--attempts", "1"], { FAKE_CODEX_EDIT: file });
    assert.equal(result.code, 2, result.out);
    assert.match(repo.failure(), /harnais a été modifié sans que le ticket l'autorise/);
    assert.ok(repo.failure().includes(file));
    assert.deepEqual(repo.commits(), ["init"]);
  }
});

test("a fixed Codex model keeps a separate Claude reviewer and applies the requested effort", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex(["--model", "gpt-6-astra", "--effort", "xhigh"]);
  assert.equal(result.code, 0, result.out);
  const { args } = jsonLines(repo, "fake-codex-calls")[0];
  assert.equal(args[args.indexOf("-m") + 1], "gpt-6-astra");
  assert.ok(args.includes('model_reasoning_effort="xhigh"'));
  assert.equal(jsonLines(repo, "fake-review-calls")[0].model, "opus");
});

test("Codex usage remains unknown in dollars through integration", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex();
  assert.equal(result.code, 0, result.out);
  assert.equal(repo.events().find(e => e.phase === "integre").cout_usd, null);
  assert.doesNotMatch(result.out, /0\.00 \$/);
});

test("Codex prints a single action per completed command or file change item", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex([], { FAKE_CODEX_SCENARIO: "actions" });
  assert.equal(result.code, 0, result.out);
  const shown = result.out.split("\n").filter(line => /^\[boucle\] \d\d:\d\d /.test(line)).map(line => line.slice(14));
  assert.deepEqual(shown, ["  Bash node --test", "  Write core/greeting.cjs, core/farewell.cjs"]);
});

test("a failed Claude reviewer cannot accept a Codex change even when its output contains an acceptance", (t) => {
  for (const failure of ["error", "exit"]) {
    const repo = codexRepo();
    t.after(repo.cleanup);
    const result = repo.codex(["--attempts", "1"], { FAKE_REVIEW_FAILURE: failure });
    assert.equal(result.code, 2, result.out);
    assert.deepEqual(jsonLines(repo, "relectures.jsonl").map(r => r.verdict), Array(3).fill("illisible"));
    assert.deepEqual(repo.commits(), ["init"]);
  }
});

test("the separate Claude reviewer runs outside ticket mode while Codex keeps its ticket environment", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex(["--attempts", "1"]);
  assert.equal(result.code, 0, result.out);
  assert.equal(jsonLines(repo, "fake-codex-calls")[0].env.LOOP, "1");
  assert.equal(jsonLines(repo, "fake-review-calls")[0].loop, null);
  assert.equal(repo.read(codexDir + "relecture-1.md"), acceptedReview);
});

test("a blocked Codex verdict preserves the owner question and stops after one session without review", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex([], { FAKE_CODEX_SCENARIO: "blocked", FAKE_REVIEWS: JSON.stringify(Array(16).fill(rejectedReview)) });
  assert.equal(result.code, 2, result.out);
  assert.equal(jsonLines(repo, "fake-codex-calls").length, 1);
  assert.equal(fs.existsSync(path.join(repo.root, codexDir, "fake-review-calls")), false);
  assert.equal(repo.status(), "bloque");
  assert.equal(repo.events().find(e => e.phase === "bloque").raison, "Quel fournisseur choisir ?");
  assert.ok(result.out.includes("Quel fournisseur choisir ?"), result.out);
  assert.deepEqual(repo.commits(), ["init"]);
});

test("Codex hands back an absent, unreadable or partial verdict without asking for review", (t) => {
  for (const scenario of ["missing-verdict", "unreadable-verdict", "partial"]) {
    const repo = codexRepo();
    t.after(repo.cleanup);
    const result = repo.codex(["--attempts", "1"], { FAKE_CODEX_SCENARIO: scenario });
    assert.equal(result.code, 2, result.out);
    assert.equal(fs.existsSync(path.join(repo.root, codexDir, "fake-review-calls")), false, scenario);
    assert.equal(jsonLines(repo, "fake-codex-calls").length, 1);
    assert.equal(repo.events().find(e => e.phase === "session-terminee").relectures, 0);
    assert.equal(repo.events().filter(e => e.phase === "tentative-refusee").length, 1);
    assert.deepEqual(repo.commits(), ["init"]);
  }
});

test("a Codex correction that becomes blocked preserves its new question without another review", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex(["--attempts", "1"], {
    FAKE_CODEX_SCENARIO: "blocked-after-correction", FAKE_REVIEWS: JSON.stringify(Array(4).fill(rejectedReview)),
  });
  assert.equal(result.code, 2, result.out);
  assert.equal(jsonLines(repo, "fake-codex-calls").length, 2);
  assert.equal(jsonLines(repo, "fake-review-calls").length, 1);
  assert.equal(repo.events().find(e => e.phase === "bloque").raison, "Quel fournisseur choisir ?");
  assert.equal(repo.events().find(e => e.phase === "session-terminee").relectures, 1);
  assert.deepEqual(repo.commits(), ["init"]);
});

test("Codex receives a null input device with immediate end of input", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex(["--attempts", "1"]);
  assert.equal(result.code, 0, result.out);
  const call = jsonLines(repo, "fake-codex-calls")[0];
  assert.equal(call.stdinIsDevice, true);
  assert.equal(call.stdin, "");
});

test("a failed Codex session cannot be reviewed or integrated despite its finished verdict", (t) => {
  for (const failure of ["turn.failed", "error", "exit"]) {
    const repo = codexRepo();
    t.after(repo.cleanup);
    const result = repo.codex(["--attempts", "1"], { FAKE_CODEX_FAILURE: failure });
    assert.equal(result.code, 2, result.out);
    assert.equal(JSON.parse(repo.read(codexDir + "verdict.json")).statut, "TERMINÉ");
    assert.equal(repo.events().filter(e => e.phase === "tentative-refusee").length, 1);
    const ended = repo.events().find(e => e.phase === "session-terminee");
    assert.equal(ended.code, 1);
    assert.equal(ended.relectures, 0);
    assert.equal(fs.existsSync(path.join(repo.root, codexDir, "fake-review-calls")), false);
    assert.deepEqual(repo.commits(), ["init"]);
  }
});

test("a custom Codex model signs integration with the Codex engine name", (t) => {
  const repo = codexRepo();
  t.after(repo.cleanup);
  const result = repo.codex(["--model", "custom-codex-model", "--attempts", "1"]);
  assert.equal(result.code, 0, result.out);
  assert.match(repo.git("log", "-1", "--format=%B").stdout, /^Co-Authored-By: Codex <noreply@openai\.com>$/m);
});

test("a fixed Claude model dry run uses readable defaults for effort and reviewer", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  const result = repo.loop("done", ["--dry-run", "--model", "custom-claude-model"]);
  assert.equal(result.code, 0, result.out);
  const levels = result.out.split("\n").filter(line => line.startsWith("[boucle] Palier"));
  assert.deepEqual(levels, Array(3).fill("[boucle] Palier fixe : custom-claude-model, effort par défaut, relecteur hérité."));
  assert.doesNotMatch(result.out, /effort null|relecteur null|undefined/);
  assert.equal(repo.git("status", "--porcelain").stdout, "");
});
