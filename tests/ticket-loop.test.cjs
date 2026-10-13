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
const counter = path.join(dir, "fake-attempts");
const attempt = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, "utf8")) : 0) + 1;
fs.writeFileSync(counter, String(attempt));
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const verdict = (statut, extra = {}) => write(path.join(dir, "verdict.json"), JSON.stringify({ statut, resume: "fake", ...extra }));
const greeting = () => write("core/greeting.cjs", "module.exports = () => 'hello';\\n");
const scenario = process.env.FAKE_SCENARIO;
if (scenario === "silent") process.exit(0);
fs.appendFileSync(process.env.TVLENS_TICKET_FILE, "- jalon : attempt " + attempt + "\\n");
const scenarios = {
  done() {
    greeting();
    verdict("TERMINÉ");
  },
  "long-line"() {
    write("core/greeting.cjs", "module.exports = '" + "x".repeat(200) + "';\\n");
    verdict("TERMINÉ");
  },
  "edits-criteria"() {
    const file = process.env.TVLENS_TICKET_FILE;
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("says hello", "exists"));
    verdict("TERMINÉ");
  },
  "edits-harness"() {
    fs.appendFileSync("scripts/check.mjs", "\\n// weakened\\n");
    verdict("TERMINÉ");
  },
  "deletes-test"() {
    fs.rmSync("tests/sample.test.cjs");
    verdict("TERMINÉ");
  },
  blocked() {
    verdict("BLOQUÉ", { resume: "the ticket contradicts the code" });
  },
  "partial-then-done"() {
    greeting();
    verdict(attempt === 1 ? "PARTIEL" : "TERMINÉ", { reste: ["tests"] });
  },
  "with-adr"() {
    write("docs/adr/0011-greeting.md", "# 0011\\n");
    verdict("TERMINÉ");
  },
  "removes-empty-catch"() {
    write("core/legacy.cjs", "module.exports = 1;\\n");
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
  const loop = (scenario, args = []) =>
    repo.node("scripts/loop/run.mjs", ["--no-push", ...args], { env: { TVLENS_CLAUDE_BIN: bin, FAKE_SCENARIO: scenario } });
  const status = () => /^statut: (.*)$/m.exec(repo.read("docs/travail/tickets/001-add-greeting.md"))[1];
  const commits = () => repo.git("log", "--format=%s").stdout.trim().split("\n");
  const failure = () => repo.read(".harness-state/tickets/T001/echec-1.txt");
  const attempts = () => repo.read(".harness-state/tickets/T001/fake-attempts");
  return { ...repo, loop, status, commits, failure, attempts };
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

test("files that were already untracked before the loop are left out of the ticket commit", (t) => {
  const repo = loopRepo();
  t.after(repo.cleanup);
  repo.write("notes/personal.md", "mine\n");
  assert.equal(repo.loop("done").code, 0);
  assert.equal(repo.git("status", "--porcelain").stdout.trim(), "?? notes/");
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
