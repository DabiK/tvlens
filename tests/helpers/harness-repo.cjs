// Dépôt Git jetable contenant une copie du harnais (contrôle qualité, cliquet, boucle, hooks),
// pour le tester de bout en bout sans toucher au vrai dépôt.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SOURCE = path.join(__dirname, "..", "..");
const HARNESS = ["scripts/check.mjs", "scripts/quality", "scripts/loop", ".claude/hooks"];

function harnessRepo(files = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tvlens-harness-")));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
  // Un test lancé par `node --test` transmet NODE_TEST_CONTEXT à ses enfants, ce qui change leur sortie.
  const env = (extra = {}) => {
    const merged = { ...process.env, ...extra };
    delete merged.NODE_TEST_CONTEXT;
    return merged;
  };
  const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, { cwd: root, encoding: "utf8", input: options.input, env: env(options.env) });
    return { code: result.status, out: (result.stdout || "") + (result.stderr || ""), stdout: result.stdout || "" };
  };
  const node = (script, args = [], options = {}) => run(process.execPath, [script, ...args], options);
  const git = (...args) => run("git", args);

  for (const rel of HARNESS) fs.cpSync(path.join(SOURCE, rel), path.join(root, rel), { recursive: true });
  fs.rmSync(path.join(root, "scripts/quality/baseline.json"), { force: true });
  write("package.json", '{ "name": "sample", "private": true }\n');
  write(".gitignore", ".harness-state/\n");
  write("tests/sample.test.cjs", "const { test } = require('node:test');\ntest('sample passes', () => {});\n");
  for (const [rel, text] of Object.entries(files)) write(rel, text);
  git("init", "-q", "-b", "work");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  git("add", "-A");
  git("commit", "-q", "-m", "init");

  return { root, write, read, run, node, git, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

module.exports = { harnessRepo };
