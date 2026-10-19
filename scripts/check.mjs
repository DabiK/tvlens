#!/usr/bin/env node
// Contrôle qualité unique du projet. Les hooks, la boucle de tickets et la CI appellent ce script :
// une règle s'écrit ici une seule fois.
//
//   node scripts/check.mjs                 tout : règles, format, lint, gel du lint, cliquet, tests JS (séquentiels), tests Python
//   node scripts/check.mjs --changed       fichiers modifiés depuis HEAD : règles, format, lint, gel du lint, cliquet, tests modifiés
//   node scripts/check.mjs --file <chemin> un fichier : règles, format, lint (contrôle rapide après une édition)
//   --no-tests  ne lance aucun test        --json  sortie structurée
//
// Un outil absent (Prettier, ESLint) est signalé « non lancé », jamais compté comme réussi.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DIRECTIONS, measure, measureText, PROD_DIRS, TICKET_NAMED_TEST } from "./quality/metrics.mjs";
import { compare, readBaseline } from "./quality/ratchet.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const fileArg = args.includes("--file") ? args[args.indexOf("--file") + 1] : null;
const CODE = /\.(cjs|mjs|js)$/;
const steps = [];
const step = (name, status, detail = "") => steps.push({ name, status, detail });

// Durée maximale d'une suite de tests. Sans elle, un fichier de test qui ne se termine pas bloque le contrôle,
// donc la boucle, sans fin et sans message.
const TEST_BUDGET_MS = Number(process.env.TVLENS_TEST_BUDGET_MS) || 20 * 60 * 1000;
const JS_FAILURE_DETAIL_MAX_LINES = 120;

function run(command, commandArgs, budgetMs = 0) {
  const options = { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 };
  // Avec un budget, la commande mène son propre groupe de processus : à l'échéance tout le groupe est arrêté,
  // y compris les fichiers de test que le lanceur a démarrés et qui ne rendraient jamais la main.
  if (budgetMs) Object.assign(options, { timeout: budgetMs, killSignal: "SIGKILL", detached: true });
  const result = spawnSync(command, commandArgs, options);
  const timedOut = result.error?.code === "ETIMEDOUT";
  if (timedOut && result.pid) {
    try {
      process.kill(-result.pid, "SIGKILL");
    } catch (error) {
      // Le groupe a déjà disparu : il n'y a plus rien à arrêter.
    }
  }
  return { code: timedOut ? 1 : (result.status ?? 1), out: (result.stdout || "") + (result.stderr || ""), timedOut };
}
const overBudget = (what) => `Délai dépassé (${Math.round(TEST_BUDGET_MS / 1000)} s) : ${what} ne se termine pas. Ses processus ont été arrêtés.`;
const git = (...gitArgs) => run("git", gitArgs);
const tail = (text, lines) => text.trimEnd().split("\n").slice(-lines).join("\n");
const bin = (name) => path.join(root, "node_modules", ".bin", name);

/** Fichiers modifiés ou ajoutés par rapport à HEAD (les suppressions sont ignorées). */
function changedFiles() {
  const { out } = git("status", "--porcelain", "--untracked-files=all");
  const files = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2);
    if (status.includes("D")) continue;
    const file = line.slice(3).split(" -> ").pop().replace(/^"|"$/g, "");
    files.push({ file, added: status.includes("?") || status.includes("A") });
  }
  return files;
}

function inHead(file) {
  const result = git("show", `HEAD:${file}`);
  return result.code === 0 ? result.out : null;
}

/** Règles par fichier : comparent le fichier à sa version de HEAD, pour ne juger que ce qui a été ajouté. */
function fileRules(files) {
  const problems = [];
  for (const { file, added } of files) {
    if (!CODE.test(file) || !fs.existsSync(path.join(root, file))) continue;
    const name = path.basename(file);
    if (added && file.startsWith("tests/") && /\.test\./.test(name) && TICKET_NAMED_TEST.test(name))
      problems.push(`${file} : un fichier de test porte le nom du comportement testé, pas celui d'un ticket ou d'une revue.`);
    const before = measureText(inHead(file) ?? "");
    const now = measureText(fs.readFileSync(path.join(root, file), "utf8"));
    if (now.lignes_longues > before.lignes_longues)
      problems.push(`${file} : ${now.lignes_longues - before.lignes_longues} ligne(s) de plus de 160 caractères ajoutée(s). Une instruction par ligne.`);
    const prod = PROD_DIRS.some((dir) => file.startsWith(dir + "/"));
    if (prod && now.catch_vides > before.catch_vides)
      problems.push(`${file} : catch vide ajouté. Traiter l'erreur, ou la laisser passer avec un commentaire qui dit pourquoi.`);
  }
  step("règles par fichier", problems.length ? "ko" : "ok", problems.join("\n"));
}

function format(files) {
  if (!fs.existsSync(bin("prettier"))) return step("format", "skip", "Prettier n'est pas installé");
  const targets = files ? files.filter((f) => fs.existsSync(path.join(root, f))) : ["."];
  if (!targets.length) return step("format", "ok");
  const result = run(bin("prettier"), ["--check", "--ignore-unknown", ...targets]);
  step("format", result.code === 0 ? "ok" : "ko", result.code === 0 ? "" : tail(result.out, 20));
}

function lint(files) {
  const configured = ["eslint.config.mjs", "eslint.config.js", "eslint.config.cjs"].some((f) => fs.existsSync(path.join(root, f)));
  if (!fs.existsSync(bin("eslint")) || !configured) return step("lint", "skip", "ESLint n'est pas installé ou pas configuré");
  const targets = files ? files.filter((f) => CODE.test(f) && fs.existsSync(path.join(root, f))) : ["."];
  if (!targets.length) return step("lint", "ok");
  const result = run(bin("eslint"), targets);
  step("lint", result.code === 0 ? "ok" : "ko", result.code === 0 ? "" : tail(result.out, 30));
}

/** Comparaison pure du stock gelé : chaque couple nouveau ou augmenté est une hausse. */
function suppressionIncreases(before, current) {
  const increases = [];
  for (const [file, rules] of Object.entries(current)) {
    for (const [rule, { count: now }] of Object.entries(rules)) {
      const known = Object.hasOwn(before, file) && Object.hasOwn(before[file], rule);
      const previous = known ? before[file][rule].count : 0;
      if (!known || now > previous) increases.push({ file, rule, before: previous, now });
    }
  }
  return increases;
}

const SUPPRESSIONS_FILE = "eslint-suppressions.json";

function readTreeSuppressions() {
  const file = path.join(root, SUPPRESSIONS_FILE);
  try {
    fs.lstatSync(file);
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readHeadSuppressions() {
  const entry = git("ls-tree", "--name-only", "HEAD", "--", SUPPRESSIONS_FILE);
  if (entry.code !== 0) throw new Error(`HEAD:${SUPPRESSIONS_FILE} : lecture Git impossible : ${entry.out}`);
  if (!entry.out.trim()) return {};
  const source = inHead(SUPPRESSIONS_FILE);
  if (source === null) throw new Error(`HEAD:${SUPPRESSIONS_FILE} : lecture Git impossible`);
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`HEAD:${SUPPRESSIONS_FILE} : JSON invalide : ${error.message}`);
  }
}

function lintFreeze() {
  try {
    const headFreeze = readHeadSuppressions();
    const treeFreeze = readTreeSuppressions();
    const increases = suppressionIncreases(headFreeze, treeFreeze);
    const details = increases.map(({ file, rule, before, now }) => `${file} : ${rule} : ${before} → ${now}`);
    if (increases.length) details.push("Une infraction nouvelle se corrige au lieu de se geler.");
    step("gel du lint", increases.length ? "ko" : "ok", details.join("\n"));
  } catch (error) {
    step("gel du lint", "ko", `${SUPPRESSIONS_FILE} : gel illisible ou JSON invalide : ${error.message}`);
  }
}

function ratchet() {
  const baseline = readBaseline(root);
  if (!baseline) return step("cliquet", "skip", "aucun plancher (node scripts/quality/ratchet.mjs --init)");
  const unknown = Object.keys(baseline).filter((key) => !Object.hasOwn(DIRECTIONS, key));
  if (unknown.length) return step("cliquet", "ko", "Mesures inconnues du plancher : " + unknown.join(", ") + ". Migrer le plancher explicitement.");
  const { regressions, improvements } = compare(baseline, measure(root));
  const line = ({ key, before, now }) => `${key} : ${before} → ${now}`;
  if (regressions.length) return step("cliquet", "ko", "Mesures dégradées :\n" + regressions.map(line).join("\n"));
  step("cliquet", "ok", improvements.length ? "Mesures améliorées : " + improvements.map(line).join(", ") : "");
}

function jsFailureDetail(output, summary) {
  const start = output.search(/^✖ failing tests:/m);
  if (start === -1) return summary;
  const lines = (summary + "\n\n" + output.slice(start).trimEnd()).split("\n");
  if (lines.length <= JS_FAILURE_DETAIL_MAX_LINES) return lines.join("\n");
  const notice = `… Détail tronqué (limite de ${JS_FAILURE_DETAIL_MAX_LINES} lignes).`;
  return [...lines.slice(0, JS_FAILURE_DETAIL_MAX_LINES - 1), notice].join("\n");
}

function jsTests(files) {
  const all = fs.existsSync(path.join(root, "tests"))
    ? fs.readdirSync(path.join(root, "tests")).filter((f) => f.endsWith(".test.cjs")).map((f) => "tests/" + f)
    : [];
  const targets = files ? all.filter((f) => files.includes(f)) : all;
  if (!targets.length) return step("tests JS", files ? "ok" : "skip", files ? "" : "aucun test");
  // Séquentiel : sous charge, les fichiers lancés en parallèle se perturbent (échecs intermittents déjà observés).
  const result = run(process.execPath, ["--test", "--test-concurrency=1", ...targets], TEST_BUDGET_MS);
  const summary = result.out.split("\n").filter((l) => /^ℹ (tests|pass|fail)|^✖/.test(l)).slice(0, 40).join("\n");
  let detail = summary;
  if (result.timedOut) detail = overBudget("un fichier de test") + "\n" + tail(result.out, 15);
  else if (result.code !== 0) detail = jsFailureDetail(result.out, summary);
  step(`tests JS (${targets.length} fichier(s))`, result.code === 0 ? "ok" : "ko", detail);
}

function pythonTests() {
  const has = fs.existsSync(path.join(root, "tests")) && fs.readdirSync(path.join(root, "tests")).some((f) => /^test_.*\.py$/.test(f));
  if (!has) return step("tests Python", "skip", "aucun test");
  const result = run("python3", ["-B", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"], TEST_BUDGET_MS);
  const detail = (result.timedOut ? overBudget("un test Python") + "\n" : "") + tail(result.out, result.code === 0 ? 3 : 25);
  step("tests Python", result.code === 0 ? "ok" : "ko", detail);
}

if (!fs.existsSync(path.join(root, "package.json"))) {
  console.error("check : à lancer depuis la racine du projet.");
  process.exit(2);
}

if (fileArg) {
  const file = path.relative(root, path.resolve(root, fileArg)).split(path.sep).join("/");
  if (!file.startsWith("..")) {
    const added = git("ls-files", "--error-unmatch", file).code !== 0;
    fileRules([{ file, added }]);
    format([file]);
    lint([file]);
  }
} else {
  const changed = flag("--changed") ? changedFiles() : null;
  const names = changed ? changed.map((c) => c.file) : null;
  fileRules(changed ?? changedFiles());
  format(names);
  lint(names);
  lintFreeze();
  ratchet();
  if (!flag("--no-tests")) {
    jsTests(names);
    if (!changed) pythonTests();
  }
}

const ok = steps.every((s) => s.status !== "ko");
if (flag("--json")) {
  console.log(JSON.stringify({ ok, steps }, null, 2));
} else {
  const mark = { ok: "✔", ko: "✖", skip: "–" };
  for (const s of steps) {
    console.log(`${mark[s.status]} ${s.name}${s.status === "skip" ? " : non lancé (" + s.detail + ")" : ""}`);
    if (s.status !== "skip" && s.detail) console.log(s.detail.split("\n").map((l) => "    " + l).join("\n"));
  }
  console.log(ok ? "check : vert" : "check : ROUGE");
}
process.exit(ok ? 0 : 1);
