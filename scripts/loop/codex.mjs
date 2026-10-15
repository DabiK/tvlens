// Codex écrit ; un processus Claude séparé juge l'état enregistré avant les contrôles de la boucle.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { record, recordReview, reviewVerdict } from "./reviewed-state.mjs";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MAX_ACTION_LENGTH = 160;
const MAX_REVIEW_OUTPUT = 64 * 1024 * 1024;
const MAX_CORRECTIONS = 3;
const TOKEN_FIELDS = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens"];

function sessionEnv(ticket) {
  return {
    ...process.env,
    TVLENS_LOOP: "1",
    TVLENS_TICKET: ticket.id,
    TVLENS_TICKET_FILE: ticket.file,
    TVLENS_HARNESS: ticket.harnais ? "1" : "0",
    TVLENS_ALLOW_INSTALL: ticket.installe ? "1" : "0",
  };
}

function codexArgs(root, step, prompt, thread = null) {
  const args = [
    "exec", ...(thread ? ["resume", thread] : []), "--json", "-m", step.modele,
    "-c", `model_reasoning_effort="${step.effort}"`,
    "-c", 'approval_policy="never"',
    "-c", "sandbox_workspace_write.network_access=true",
    "--ignore-user-config", "--dangerously-bypass-hook-trust",
  ];
  if (thread) args.push("-c", 'sandbox_mode="workspace-write"');
  else args.push("-s", "workspace-write", "-C", root);
  return [...args, prompt];
}

function showAction(root, item, started) {
  const actions = [];
  if (item?.type === "command_execution") actions.push(`Bash ${item.command}`);
  if (item?.type === "file_change") {
    const files = (item.changes || []).map((change) => path.isAbsolute(change.path) ? path.relative(root, change.path) : change.path);
    actions.push(`Write ${files.join(", ")}`);
  }
  const seconds = Math.round((Date.now() - started) / MS_PER_SECOND);
  const minutes = String(Math.floor(seconds / SECONDS_PER_MINUTE)).padStart(2, "0");
  const remainder = String(seconds % SECONDS_PER_MINUTE).padStart(2, "0");
  for (const action of actions) console.log(`[boucle] ${minutes}:${remainder}  ${action.replace(/\s+/g, " ").slice(0, MAX_ACTION_LENGTH)}`);
}

function consumeLine(root, line, state, started) {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    // Le flux brut reste archivé même si une ligne de diagnostic ne suit pas le protocole JSONL.
    return;
  }
  if (message.type === "thread.started") state.session = message.thread_id;
  if (message.type === "turn.completed") {
    state.tours++;
    for (const field of TOKEN_FIELDS) state.jetons[field] += message.usage?.[field] || 0;
  }
  if (message.type === "turn.failed" || message.type === "error") {
    state.problem = `Codex : ${message.error?.message || message.message || "échec du tour"}`;
  }
  if (message.type === "item.completed") showAction(root, message.item, started);
}

function streamSession(root, args, env, file, state, timeoutMs, started) {
  return new Promise((resolve) => {
    const child = spawn(process.env.TVLENS_CODEX_BIN || "codex", args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      state.problem = "Codex : délai maximal dépassé.";
      child.kill("SIGTERM");
    }, timeoutMs);
    let stderr = "";
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => consumeLine(root, line, state, started));
    child.stdout.on("data", (chunk) => fs.appendFileSync(file, chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => { state.problem = `Codex : ${error.code} (${error.message})`; });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (stderr) fs.appendFileSync(file + ".stderr", stderr);
      if (code !== 0) state.problem ||= `Codex : processus en échec (code ${code}). ${stderr}`;
      resolve(state.problem ? 1 : 0);
    });
  });
}

function review(root, ticket, dir, env, step, timeoutMs) {
  const snapshot = record(root, ticket);
  if (snapshot.problem) return { problem: snapshot.problem };
  const files = snapshot.written.slice(0, 2).map((file) => path.relative(root, file));
  const prompt = `Relis le ticket ${ticket.id} (${ticket.file}), ${files.join(" et ")}` +
    ` et, s'il existe, ${path.relative(root, path.join(dir, "ecarts.md"))}.`;
  const args = ["-p", prompt, "--agent", "relecteur", "--model", step.relecteur, "--output-format", "json", "--strict-mcp-config"];
  const reviewEnv = { ...env };
  // Les hooks de ticket exigeraient du relecteur un verdict d'implémentation et remplaceraient son rapport.
  delete reviewEnv.TVLENS_LOOP;
  const result = spawnSync(process.env.TVLENS_CLAUDE_BIN || "claude", args, {
    cwd: root, env: reviewEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs, maxBuffer: MAX_REVIEW_OUTPUT,
  });
  let report;
  let failed = result.status !== 0;
  try {
    const output = JSON.parse(result.stdout);
    report = typeof output.result === "string" ? output.result : "";
    failed ||= Boolean(output.is_error);
    if (failed) report = `Relecteur en échec : ${result.stderr || ""}\n${report}`;
  } catch (error) {
    // Un processus interrompu ou une sortie non JSON ne peut jamais accepter une revue.
    report = `Relecteur illisible : ${result.error?.message || result.stderr || result.stdout || error.message}`;
    failed = true;
  }
  const verdict = failed ? "illisible" : reviewVerdict(report);
  recordReview(root, ticket.id, { verdict, modele: step.relecteur, report });
  return { verdict, report };
}

function sessionVerdict(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "verdict.json"), "utf8"));
  } catch (error) {
    // Un arrêt sans verdict lisible ne peut pas déclencher une relecture du changement.
    return null;
  }
}

export async function runCodex(root, ticket, attempt, dir, failureReport, step, { event, timeoutMin }) {
  const started = Date.now();
  const timeoutMs = timeoutMin * SECONDS_PER_MINUTE * MS_PER_SECOND;
  const state = { session: null, tours: 0, jetons: Object.fromEntries(TOKEN_FIELDS.map((field) => [field, 0])), problem: null };
  const env = sessionEnv(ticket);
  const retry = failureReport ? ` Lis ${path.relative(root, failureReport)} et le journal, puis reprends le travail.` : "";
  const prompt = `Traite le ticket ${ticket.id} (${ticket.file}) en suivant .agents/skills/ticket-codex/SKILL.md.${retry}`;
  event("session", { ticket: ticket.id, attempt, moteur: "codex", ...step });
  const file = path.join(dir, `codex-${attempt}.jsonl`);
  fs.writeFileSync(file, "");
  let code = await streamSession(root, codexArgs(root, step, prompt), env, file, state, timeoutMs, started);
  let relectures = 0;
  for (let correction = 0; code === 0; correction++) {
    if (sessionVerdict(dir)?.statut !== "TERMINÉ") break;
    const reviewed = review(root, ticket, dir, env, step, timeoutMs);
    relectures++;
    if (reviewed.verdict === "accepté") break;
    if (reviewed.problem || correction >= MAX_CORRECTIONS || !state.session) {
      state.problem = reviewed.problem || reviewed.report;
      code = 1;
      break;
    }
    const fix = `Corrige chaque constat bloquant et mineur de cette relecture, puis rends un nouveau verdict.\n\n${reviewed.report}`;
    fs.rmSync(path.join(dir, "verdict.json"), { force: true });
    code = await streamSession(root, codexArgs(root, step, fix, state.session), env, file, state, timeoutMs, started);
  }
  const { problem, ...usage } = state;
  const report = { ...usage, duree_s: Math.round((Date.now() - started) / MS_PER_SECOND), relectures, cout_usd: null };
  event("session-terminee", { ticket: ticket.id, attempt, code, ...report });
  return { code, report, problem };
}
