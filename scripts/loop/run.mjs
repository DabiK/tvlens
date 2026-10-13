#!/usr/bin/env node
// Boucle de tickets : une session Claude Code fraîche par ticket, puis des contrôles que la session
// ne peut pas contourner, puis un commit et un push. La session propose ; ce script décide.
//
//   node scripts/loop/run.mjs                 traite le prochain ticket prêt
//   node scripts/loop/run.mjs --max 5         jusqu'à cinq tickets à la suite
//   node scripts/loop/run.mjs --ticket T003   ce ticket précisément
//   node scripts/loop/run.mjs --dry-run       montre ce qui serait fait, sans rien lancer
//   --attempts 3 (sessions par ticket)   --no-push   --model <m>   --effort <e>
//   --permission-mode auto   --budget-usd <n>   --timeout-min 120
//   --compact-window 200000 (plafond de contexte d'une session, en tokens ; 0 pour ne pas le fixer)
//
// Codes de sortie : 0 terminé, 1 refus au démarrage, 2 ticket bloqué, 3 push refusé.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { measure } from "../quality/metrics.mjs";
import { readBaseline, tighten, writeBaseline } from "../quality/ratchet.mjs";
import { describe, list, next, setStatus, spec, validate } from "./tickets.mjs";

const root = process.cwd();
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const options = {
  max: Number(option("--max", 1)),
  attempts: Number(option("--attempts", 3)),
  ticket: option("--ticket", null),
  dryRun: flag("--dry-run"),
  push: !flag("--no-push"),
  model: option("--model", null),
  effort: option("--effort", null),
  permissionMode: option("--permission-mode", "auto"),
  budgetUsd: option("--budget-usd", null),
  timeoutMin: Number(option("--timeout-min", 120)),
  compactWindow: Number(option("--compact-window", 200000)),
};
// Ce qui définit les règles : intouchable par un ticket, sauf s'il porte « harnais: oui ».
const PROTECTED = [".claude/", "scripts/check.mjs", "scripts/quality/", "scripts/loop/", "CLAUDE.md", "docs/standards.md"];
const TRAILER = "Co-Authored-By: Claude <noreply@anthropic.com>";
const stateDir = path.join(root, ".harness-state");
const loopDir = path.join(stateDir, "loop");
const lockFile = path.join(loopDir, "lock");

function sh(command, args, extra = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...extra });
  return { code: result.status ?? 1, out: (result.stdout || "") + (result.stderr || ""), stdout: result.stdout || "", stderr: result.stderr || "" };
}
const git = (...args) => sh("git", args);
const say = (message) => console.log(`[boucle] ${message}`);

function machineLoad() {
  const load = { uptime: sh("uptime", []).stdout.trim() };
  if (process.platform === "darwin") load.swap = sh("sysctl", ["-n", "vm.swapusage"]).stdout.trim();
  return load;
}

function event(phase, data = {}) {
  fs.mkdirSync(loopDir, { recursive: true });
  const line = JSON.stringify({ at: new Date().toISOString(), phase, ...data, charge: machineLoad() });
  fs.appendFileSync(path.join(loopDir, "events.jsonl"), line + "\n");
}

function stop(code, message) {
  if (message) say(message);
  if (fs.existsSync(lockFile) && fs.readFileSync(lockFile, "utf8") === String(process.pid)) fs.rmSync(lockFile);
  process.exit(code);
}

/** Entrées de `git status` : état sur deux lettres et chemins (deux pour un renommage). */
function statusEntries() {
  const entries = [];
  for (const line of git("status", "--porcelain", "--untracked-files=all").stdout.split("\n")) {
    if (!line.trim()) continue;
    const paths = line.slice(3).split(" -> ").map((p) => p.replace(/^"|"$/g, ""));
    entries.push({ status: line.slice(0, 2), paths });
  }
  return entries;
}

function preflight() {
  if (!fs.existsSync(path.join(root, "scripts/check.mjs"))) stop(1, "À lancer depuis la racine du projet.");
  const branch = git("branch", "--show-current").stdout.trim();
  if (!branch) stop(1, "HEAD détachée : la boucle travaille sur une branche.");
  if (["main", "master"].includes(branch)) stop(1, `La boucle ne travaille pas sur ${branch} : créer une branche dédiée.`);
  const tracked = git("status", "--porcelain", "--untracked-files=no").stdout.trim();
  if (tracked) stop(1, "Des fichiers suivis sont modifiés. Committer ou remiser avant de lancer la boucle :\n" + tracked);
  const problems = validate(list(root));
  if (problems.length) stop(1, "File de tickets invalide :\n" + problems.join("\n"));
  if (!options.dryRun) {
    fs.mkdirSync(loopDir, { recursive: true });
    if (fs.existsSync(lockFile)) {
      const pid = Number(fs.readFileSync(lockFile, "utf8"));
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch (error) {
        // Le processus n'existe plus : le verrou est un reste d'un arrêt brutal.
        alive = false;
      }
      if (alive) stop(1, `Une boucle tourne déjà (processus ${pid}).`);
    }
    fs.writeFileSync(lockFile, String(process.pid));
  }
  return { branch, untracked: new Set(statusEntries().flatMap((e) => e.paths)) };
}

function compactions(dir) {
  const file = path.join(dir, "compactions.jsonl");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).length : 0;
}

/** Ce que la session rapporte d'elle-même (sortie JSON de `claude -p`) : sert à calibrer la taille des tickets. */
function sessionReport(stdout, dir, compactionsBefore) {
  const report = { compactions: compactions(dir) - compactionsBefore };
  try {
    const result = JSON.parse(stdout);
    const usage = result.usage || {};
    report.session = result.session_id;
    report.tours = result.num_turns;
    report.duree_s = Math.round((result.duration_ms || 0) / 1000);
    report.cout_usd = result.total_cost_usd;
    report.tokens_sortie = usage.output_tokens;
    // Cumul sur tous les appels de la session : il suit le coût, pas la taille du contexte à un instant donné.
    report.tokens_lus_cumules = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
    report.refus_de_permission = (result.permission_denials || []).length;
  } catch (error) {
    // Sortie absente ou illisible (session interrompue) : seul le compte des compactions est connu.
  }
  return report;
}

function runSession(ticket, attempt, dir, failureReport) {
  const retry = failureReport
    ? ` C'est la tentative ${attempt} : une session précédente n'a pas abouti. Lis ${path.relative(root, failureReport)}` +
      " et le journal du ticket, regarde git status, puis reprends là où le travail s'est arrêté."
    : "";
  const prompt =
    `Traite le ticket ${ticket.id} (${ticket.file}) en suivant la skill « ticket » : lis d'abord` +
    ` .claude/skills/ticket/SKILL.md, puis le ticket en entier.${retry}` +
    ` Avant de terminer, écris ton verdict dans .harness-state/tickets/${ticket.id}/verdict.json.`;
  const args = ["-p", prompt, "--permission-mode", options.permissionMode, "--output-format", "json"];
  args.push("--session-id", randomUUID(), "--name", `TVLens ${ticket.id} tentative ${attempt}`);
  if (options.model) args.push("--model", options.model);
  if (options.effort) args.push("--effort", options.effort);
  if (options.budgetUsd) args.push("--max-budget-usd", options.budgetUsd);
  const env = {
    ...process.env,
    TVLENS_LOOP: "1",
    TVLENS_TICKET: ticket.id,
    TVLENS_TICKET_FILE: ticket.file,
    TVLENS_ALLOW_INSTALL: ticket.installe ? "1" : "0",
    TVLENS_HARNESS: ticket.harnais ? "1" : "0",
    // Les sous-agents ne lancent pas eux-mêmes de sous-agents : trois rôles, un niveau.
    CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "1",
  };
  // Plafond de contexte : au-delà la session se compacte. Une session de ticket qui l'atteint traite un ticket trop gros.
  if (options.compactWindow > 0) env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = String(options.compactWindow);
  const bin = process.env.TVLENS_CLAUDE_BIN || "claude";
  event("session", { ticket: ticket.id, attempt });
  const compactionsBefore = compactions(dir);
  const result = sh(bin, args, { env, stdio: ["ignore", "pipe", "pipe"], timeout: options.timeoutMin * 60 * 1000 });
  fs.writeFileSync(path.join(dir, `session-${attempt}.json`), result.stdout);
  if (result.stderr) fs.writeFileSync(path.join(dir, `session-${attempt}.stderr`), result.stderr);
  const report = sessionReport(result.stdout, dir, compactionsBefore);
  event("session-terminee", { ticket: ticket.id, attempt, code: result.code, ...report });
  if (report.tours !== undefined) say(`Session ${attempt} : ${report.tours} tours, ${report.duree_s} s, ${report.tokens_sortie} tokens produits.`);
  if (report.compactions) say(`La session s'est compactée ${report.compactions} fois : ce ticket est sans doute trop gros pour une session.`);
  return result.code;
}

function readVerdict(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "verdict.json"), "utf8"));
  } catch (error) {
    // Pas de verdict lisible : la session s'est arrêtée sans conclure.
    return null;
  }
}

/** Contrôles de la boucle après une session qui se dit terminée. Renvoie la liste des refus. */
function gates(ticket, specBefore, untracked) {
  const problems = [];
  const text = fs.readFileSync(path.join(root, ticket.file), "utf8");
  if (spec(text) !== specBefore) problems.push("Le ticket a été modifié au-dessus de son journal (critères, périmètre ou en-tête).");
  const entries = statusEntries().filter((e) => !e.paths.every((p) => untracked.has(p)));
  const touched = entries.flatMap((e) => e.paths);
  if (!ticket.harnais) {
    const harness = touched.filter((p) => PROTECTED.some((x) => (x.endsWith("/") ? p.startsWith(x) : p === x)));
    if (harness.length) problems.push("Le harnais a été modifié sans que le ticket l'autorise : " + harness.join(", "));
  }
  if (!ticket.supprimeTests) {
    const deleted = entries.filter((e) => e.status.includes("D")).flatMap((e) => e.paths).filter((p) => p.startsWith("tests/"));
    if (deleted.length) problems.push("Des fichiers de test ont été supprimés sans que le ticket l'autorise : " + deleted.join(", "));
  }
  if (ticket.adr) {
    const added = entries.filter((e) => /[?A]/.test(e.status)).flatMap((e) => e.paths);
    if (!added.some((p) => /^docs\/adr\/\d{4}-.+\.md$/.test(p))) problems.push("Le ticket demande un ADR et aucun n'a été ajouté dans docs/adr/.");
  }
  const check = sh(process.execPath, ["scripts/check.mjs"]);
  if (check.code !== 0) problems.push("Le contrôle qualité complet est rouge :\n" + check.out);
  return problems;
}

function integrate(ticket, branch, untracked) {
  const baseline = readBaseline(root);
  if (baseline) writeBaseline(root, tighten(baseline, measure(root)));
  const file = path.join(root, ticket.file);
  fs.writeFileSync(file, setStatus(fs.readFileSync(file, "utf8"), "termine"));
  const paths = statusEntries().flatMap((e) => e.paths).filter((p) => !untracked.has(p));
  git("add", "-A", "--", ...paths);
  const commit = git("commit", "-m", `${ticket.id}: ${ticket.titre}`, "-m", `Ticket: ${ticket.file}`, "-m", TRAILER);
  if (commit.code !== 0) stop(2, "Le commit a échoué :\n" + commit.out);
  const head = git("rev-parse", "--short", "HEAD").stdout.trim();
  event("integre", { ticket: ticket.id, commit: head });
  say(`${ticket.id} intégré (${head}).`);
  if (!options.push) return;
  const push = git("push", "-u", "origin", branch);
  if (push.code !== 0) {
    event("push-refuse", { ticket: ticket.id, sortie: push.out.slice(-2000) });
    stop(3, "Le commit est fait mais le push a échoué. Rien d'autre n'est lancé :\n" + push.out);
  }
  say(`Poussé sur origin/${branch}.`);
}

function block(ticket, why) {
  const file = path.join(root, ticket.file);
  fs.writeFileSync(file, setStatus(fs.readFileSync(file, "utf8"), "bloque"));
  event("bloque", { ticket: ticket.id, raison: why.slice(0, 2000) });
  stop(2, `${ticket.id} est bloqué : ${why}\nLe travail en cours est laissé tel quel dans le dossier, pour examen.`);
}

function processTicket(ticket, context) {
  const dir = path.join(stateDir, "tickets", ticket.id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(root, ticket.file);
  const specBefore = spec(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, setStatus(fs.readFileSync(file, "utf8"), "en-cours"));
  say(`${ticket.id} — ${ticket.titre}`);
  let failureReport = null;
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    // Un verdict d'une tentative précédente ne vaut pas pour celle-ci.
    fs.rmSync(path.join(dir, "verdict.json"), { force: true });
    const code = runSession(ticket, attempt, dir, failureReport);
    const verdict = readVerdict(dir);
    let failure;
    if (!verdict) failure = `La session s'est terminée sans verdict (code de sortie ${code}).`;
    else if (verdict.statut === "BLOQUÉ") block(ticket, verdict.resume || "la session s'est déclarée bloquée sans dire pourquoi");
    else if (verdict.statut === "PARTIEL") {
      failure = "La session s'est déclarée PARTIELLE. Reste à faire : " + JSON.stringify(verdict.reste || verdict.resume || "");
    } else if (verdict.statut === "TERMINÉ") {
      const problems = gates(ticket, specBefore, context.untracked);
      if (!problems.length) return integrate(ticket, context.branch, context.untracked);
      failure = "La session s'est déclarée TERMINÉE mais la boucle refuse l'intégration :\n\n" + problems.join("\n\n");
    } else failure = `Verdict illisible : statut « ${verdict.statut} ».`;
    failureReport = path.join(dir, `echec-${attempt}.txt`);
    fs.writeFileSync(failureReport, failure + "\n");
    event("tentative-refusee", { ticket: ticket.id, attempt, raison: failure.slice(0, 2000) });
    say(`Tentative ${attempt} refusée : ${failure.split("\n")[0]}`);
  }
  block(ticket, `${options.attempts} tentative(s) sans aboutir. Dernier refus : ${path.relative(root, failureReport)}`);
}

const context = preflight();
for (let done = 0; done < options.max; done++) {
  const { ticket, reason } = next(list(root), done === 0 ? options.ticket : null);
  if (!ticket) stop(0, reason);
  // Un ticket hors de Git resterait hors de son propre commit : ni son journal ni son statut n'y entreraient.
  if (git("ls-files", "--error-unmatch", "--", ticket.file).code !== 0) {
    stop(1, `${ticket.id} n'est pas suivi par Git (${ticket.file}) : committer le ticket avant de lancer la boucle.`);
  }
  if (options.dryRun) {
    say(`Prochain ticket : ${ticket.id} — ${ticket.titre} (${ticket.file})`);
    say(`Session : claude -p … --permission-mode ${options.permissionMode}, ${options.attempts} tentative(s) au plus.`);
    say(options.push ? `Après contrôle : commit puis push sur origin/${context.branch}.` : "Après contrôle : commit local, sans push.");
    stop(0);
  }
  processTicket(ticket, context);
}
stop(0, "Nombre de tickets demandé atteint.");
