// Codex écrit ; un processus Claude séparé juge l'état enregistré avant les contrôles de la boucle.
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { lastReviewReport, record, recordReview, reviewVerdict, uncorrectedFindings } from "./reviewed-state.mjs";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MAX_ACTION_LENGTH = 160;
const MAX_REVIEW_OUTPUT = 64 * 1024 * 1024;
const MAX_CORRECTIONS = 2;
const DISABLED_FEATURES = ["plugins", "apps", "memories", "image_generation"];
const DEFAULT_DISCOVERY_TIMEOUT_MS = SECONDS_PER_MINUTE * MS_PER_SECOND;
const TOKEN_FIELDS = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens"];

function sessionEnv(ticket) {
  return {
    ...process.env,
    TVLENS_LOOP: "1",
    TVLENS_ENGINE: "codex",
    TVLENS_TICKET: ticket.id,
    TVLENS_TICKET_FILE: ticket.file,
    TVLENS_HARNESS: ticket.harnais ? "1" : "0",
    TVLENS_ALLOW_INSTALL: ticket.installe ? "1" : "0",
  };
}

function checkResumeOptions(root, disabled, directories, env, timeoutMs) {
  const result = spawnSync(env.TVLENS_CODEX_BIN || "codex", ["exec", "resume", ...disabled, ...directories, "--help"], {
    cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs,
  });
  if (result.status !== 0) {
    const reason = result.error?.message || result.stderr || `code ${result.status}`;
    throw Object.assign(new Error(`Codex : options requises de reprise indisponibles : ${reason}`), { code: "CODEX_RESUME_UNAVAILABLE" });
  }
}

export function codexArgs(root, step, prompt, {
  env = process.env, timeoutMs = DEFAULT_DISCOVERY_TIMEOUT_MS, session = null,
} = {}) {
  const disabled = DISABLED_FEATURES.flatMap((name) => ["--disable", name]);
  const directories = env.TVLENS_HARNESS === "1" ? [".codex", ".agents"].flatMap((dir) => ["--add-dir", path.join(root, dir)]) : [];
  if (session) checkResumeOptions(root, disabled, directories, env, timeoutMs);
  let servers;
  try {
    const listed = spawnSync(env.TVLENS_CODEX_BIN || "codex", ["mcp", "list", "--json", ...disabled], {
      cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs,
    });
    if (listed.status !== 0) throw new Error(listed.error?.message || `processus en échec (code ${listed.status})`);
    servers = JSON.parse(listed.stdout);
    const valid = (server) => server && typeof server.name === "string" && server.name.trim() && typeof server.enabled === "boolean";
    if (!Array.isArray(servers) || !servers.every(valid)) throw new Error("format inattendu");
  } catch (error) {
    throw Object.assign(new Error(`Codex : liste des serveurs MCP en échec ou illisible : ${error.message}`), { code: "CODEX_MCP_LIST" });
  }
  const mcp = servers.filter((server) => server.enabled).flatMap(({ name }) => {
    const key = /^[A-Za-z0-9_-]+$/.test(name) ? name : JSON.stringify(name);
    return ["-c", `mcp_servers.${key}.enabled=false`];
  });
  const args = [
    ...(session ? ["exec", "resume", session] : ["exec"]), "--json", "-m", step.modele,
    "-c", `model_reasoning_effort="${step.effort}"`,
    "-c", 'approval_policy="never"',
    "-c", "sandbox_workspace_write.network_access=true",
    "-c", `projects.${JSON.stringify(root)}.trust_level="trusted"`,
    ...disabled, "-c", "notify=[]", ...mcp, "--dangerously-bypass-hook-trust",
  ];
  args.push(...directories);
  if (session) args.push("-c", 'sandbox_mode="workspace-write"');
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

function consumeLine(root, line, state, started, stream) {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    // Le flux brut reste archivé même si une ligne de diagnostic ne suit pas le protocole JSONL.
    return;
  }
  if (message.type === "thread.started") state.session = message.thread_id;
  if (message.type === "turn.started" || message.type === "turn.completed") state.turnStarted = true;
  if (message.type === "turn.completed") {
    for (const reason of stream.errors) stream.reportRecovery(reason);
    stream.errors = [];
    state.tours++;
    for (const field of TOKEN_FIELDS) state.jetons[field] += message.usage?.[field] || 0;
  }
  if (message.type === "error") stream.errors.push(`Codex : ${message.error?.message || message.message || "erreur du flux"}`);
  if (message.type === "turn.failed") {
    state.problem = `Codex : ${message.error?.message || message.message || "échec du tour"}`;
  }
  if (message.type === "item.completed") showAction(root, message.item, started);
}

function streamSession(root, args, env, file, state, timeoutMs, started, reportRecovery) {
  return new Promise((resolve) => {
    const child = spawn(process.env.TVLENS_CODEX_BIN || "codex", args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      state.problem = "Codex : délai maximal dépassé.";
      child.kill("SIGTERM");
    }, timeoutMs);
    const stream = { errors: [], reportRecovery };
    let stderr = "";
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => consumeLine(root, line, state, started, stream));
    child.stdout.on("data", (chunk) => fs.appendFileSync(file, chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => { state.problem = `Codex : ${error.code} (${error.message})`; });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (stderr) fs.appendFileSync(file + ".stderr", stderr);
      state.problem ||= stream.errors.at(-1);
      if (code !== 0) state.problem ||= `Codex : processus en échec (code ${code}). ${stderr}`;
      resolve(state.problem ? 1 : 0);
    });
  });
}

function sessionProblem(request, state, marker, run) {
  if (request.session && state.session && state.session !== request.session) {
    const reason = `Codex : session changée lors de la reprise : ${request.session} attendue, ${state.session} reçue.`;
    return { reason, resumeImpossible: true };
  }
  if (!state.session || marker?.session !== state.session || marker?.run !== run) {
    const reason = "hooks Codex non chargés : aucun témoin de démarrage valide pour cette session et ce lancement." +
      " Cause probable : hooks de .codex/hooks.json non approuvés pour ce dépôt, ou session hors du dépôt approuvé." +
      " Le propriétaire les approuve avec codex, puis /hooks.";
    return { reason, resumeImpossible: Boolean(request.session) };
  }
  return null;
}

async function hookedSession(root, request, env, file, state, timeoutMs, started, dir) {
  const markerFile = path.join(dir, "hooks-started.json");
  const run = randomUUID();
  fs.rmSync(markerFile, { force: true });
  state.session = null;
  state.turnStarted = false;
  let args;
  try {
    args = codexArgs(root, request.step, request.prompt, { env, timeoutMs, session: request.session });
  } catch (error) {
    if (!["CODEX_MCP_LIST", "CODEX_RESUME_UNAVAILABLE"].includes(error.code)) throw error;
    state.problem = error.message;
    return { code: 1, resumeImpossible: Boolean(request.session) };
  }
  const reportRecovery = (reason) => request.reportRecovery(run, reason);
  const code = await streamSession(root, args, { ...env, TVLENS_HOOK_RUN: run }, file, state, timeoutMs, started, reportRecovery);
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(markerFile, "utf8"));
  } catch (error) {
    // Un témoin absent ou illisible ne prouve pas le chargement des hooks.
    marker = null;
  }
  const problem = sessionProblem(request, state, marker, run);
  if (problem) {
    state.problem = state.problem ? `${state.problem} ${problem.reason}` : problem.reason;
    return { code: 1, resumeImpossible: problem.resumeImpossible };
  }
  return { code, resumeImpossible: Boolean(request.session && code !== 0 && !state.turnStarted) };
}

async function correctionSession(root, request, env, file, state, timeoutMs, started, dir, event) {
  fs.rmSync(path.join(dir, "verdict.json"), { force: true });
  const result = await hookedSession(root, request, env, file, state, timeoutMs, started, dir);
  if (!result.resumeImpossible) return result.code;
  event("reprise-impossible", { ticket: env.TVLENS_TICKET, session: request.session, raison: state.problem });
  state.problem = null;
  fs.rmSync(path.join(dir, "verdict.json"), { force: true });
  const fresh = await hookedSession(root, { ...request, session: null }, env, file, state, timeoutMs, started, dir);
  return fresh.code;
}

function reviewRequest(root, ticket, dir, correction) {
  const previousReport = correction ? lastReviewReport(dir) : null;
  const snapshot = record(root, ticket);
  if (snapshot.problem) return { problem: snapshot.problem };
  const files = snapshot.written.slice(0, 2).map((file) => path.relative(root, file));
  let prompt = `Relis le ticket ${ticket.id} (${ticket.file}), ${files.join(" et ")}` +
    ` et, s'il existe, ${path.relative(root, path.join(dir, "ecarts.md"))}.`;
  if (correction) {
    const previous = path.relative(root, path.join(dir, previousReport));
    const interdiffFile = snapshot.written.find((file) => file.endsWith(".interdiff"));
    if (!interdiffFile) {
      const state = path.relative(root, path.join(dir, "reviewed-state.json"));
      return { problem: `Relecture de correction impossible : interdiff absent après reconstruction de ${state}. La tentative est refusée.` };
    }
    const interdiff = path.relative(root, interdiffFile);
    prompt += ` Fais une relecture de correction contre ${previous} et ${interdiff}, selon la section correspondante de tes consignes.`;
  }
  return { prompt };
}

function review(root, ticket, dir, env, step, timeoutMs, correction) {
  const request = reviewRequest(root, ticket, dir, correction);
  if (request.problem) return request;
  const { prompt } = request;
  const args = ["-p", prompt, "--agent", "relecteur", "--model", step.relecteur, "--output-format", "json", "--strict-mcp-config"];
  const reviewEnv = { ...env };
  // Les hooks de ticket exigeraient du relecteur un verdict d'implémentation et remplaceraient son rapport.
  delete reviewEnv.TVLENS_LOOP;
  delete reviewEnv.TVLENS_ENGINE;
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
  const uncorrected = correction ? uncorrectedFindings(report) : 0;
  let verdict = failed ? "illisible" : reviewVerdict(report);
  if (!failed && uncorrected > 0) verdict = "à corriger";
  recordReview(root, ticket.id, { verdict, modele: step.relecteur, report });
  return { verdict, report, uncorrected };
}

function sessionVerdict(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "verdict.json"), "utf8"));
  } catch (error) {
    // Un arrêt sans verdict lisible ne peut pas déclencher une relecture du changement.
    return null;
  }
}

function locations(text) {
  return text.match(/[^\s`]+:\d+/gu) || [];
}

function findingForm(line, section, current) {
  if (/^#{1,2}\s+/u.test(line)) return (/^#{1,2}\s+\d+[.)]\s+/u.test(line) || locations(line).length > 0) && "title";
  if (/^(?:#{3,6}\s+|\*\*(?:\d+[.)]\s+|constat\s+\d+\b))/iu.test(line)) return "title";
  if (/^\d+[.)]\s+/u.test(line)) return (!current || current.form === "numbered") && "numbered";
  const bullet = /^[-*+]\s+(.+)$/u.exec(line)?.[1];
  if (!bullet || (current && current.form !== "bullet")) return false;
  const located = locations(bullet).some(ref => bullet.replace(/^`/u, "").startsWith(ref));
  if (located || /^(?:\(\d+\)\s+|hors\s+périmètre\b)/iu.test(bullet)) return "bullet";
  if (!current && /^\*\*[^*:]+\*\*(?:\s|$)/u.test(bullet)) return "title";
  return section === "reserves" && !current && "bullet";
}

function reviewSection(title) {
  if (/^(?:\d+[.)]\s+|constat\s+\d+\b)/iu.test(title)) return null;
  if (/(?:^|\s)[ée]carts\b/iu.test(title)) return "deviations";
  if (/^réserves(?:\s+hors\s+périmètre|$)/iu.test(title)) return "reserves";
  if (/^(?:suivi|synthèse|critères|régressions|code\s+changé)\b/iu.test(title)) return "other";
  if (/^constats?\s+du\s+rapport\s+précédent\b/iu.test(title)) return "tracking";
  if (/constats?\b/iu.test(title) && !/de\s+la\s+relecture/iu.test(title)) return "findings";
  return null;
}

/** Les champs et paragraphes restent attachés au titre, même si le repère est dans le corps. */
function reviewBlocks(report) {
  const blocks = [];
  let section = "findings";
  let current = null;
  for (const line of report.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*(?:VERDICT|CONSTATS|NON CORRIGÉS)\s*:/iu.test(line)) continue;
    const heading = /^#{1,6}\s+(.+)$/u.exec(line);
    const nextSection = heading && reviewSection(heading[1]);
    const title = line.replace(/^(?:#{1,6}|[-*+]|\d+[.)])\s+/u, "");
    const deviation = section !== "other" && /^(?:\*\*)?[ée]carts?\s+acceptés?(?!\p{L})/iu.test(title);
    const form = !nextSection && ["findings", "tracking", "reserves"].includes(section) && findingForm(line, section, current);
    if (deviation || form) {
      current = {
        kind: deviation ? "deviation" : "finding", form, tracking: section === "tracking", listed: /^[-*+]\s/u.test(line), lines: [title],
      };
      blocks.push(current);
    } else if (heading) {
      current = null;
      section = nextSection || "other";
    } else if (current?.kind === "deviation" && current.listed && /^(?:[-*+]|\d+[.)])\s/u.test(line)) {
      current = null;
    } else if (current) {
      current.lines.push(line);
    }
  }
  return blocks.map(({ kind, tracking, lines }) => ({ kind, tracking, text: lines.join("\n").trim() }));
}

function outOfScopeFindings(blocks) {
  const findings = blocks.filter(block => block.kind === "finding" && /hors\s+périmètre/iu.test(block.text));
  const references = findings.filter(block => !block.tracking).flatMap(block => locations(block.text));
  // Un suivi peut rappeler un constat développé plus loin ; seule sa version complète est transmise.
  return findings.filter(block => !block.tracking || !locations(block.text).some(ref => references.includes(ref)));
}

/** Les réserves du rapport accepté restent référencées sans réécrire le verdict ni l'état relu. */
function reviewReserves(report, reference) {
  const blocks = reviewBlocks(report);
  const findings = outOfScopeFindings(blocks);
  const deviations = blocks.filter((block) => block.kind === "deviation").map((block) => block.text);
  const expected = Number(/^\s*CONSTATS\s*:.*?(\d+)\s+hors\s+périmètre/imu.exec(report)?.[1]);
  // Un compte discordant rend l'extraction incertaine : le rapport entier reste la référence des constats.
  const kept = findings.length === expected ? findings.map((block) => block.text) : [
    `Nombre de constats discordant : CONSTATS annonce ${expected} hors périmètre ; ${findings.length} constat(s) extrait(s).` +
    " Consulter le rapport pour l'ensemble des constats hors périmètre.",
  ];
  return [...kept, ...deviations].map((text) => `${reference} : ${text}`);
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
  const reportRecovery = (invocation, raison) => {
    event("reconnexion", { ticket: ticket.id, attempt, invocation, raison });
    console.log(`[boucle] ${ticket.id} tentative ${attempt} invocation ${invocation} : reconnexion récupérée (${raison}).`);
  };
  let { code } = await hookedSession(root, { step, prompt, reportRecovery }, env, file, state, timeoutMs, started, dir);
  let relectures = 0;
  let reserves = [];
  for (let correction = 0; code === 0; correction++) {
    if (sessionVerdict(dir)?.statut !== "TERMINÉ") break;
    const reviewed = review(root, ticket, dir, env, step, timeoutMs, correction > 0);
    relectures++;
    if (reviewed.uncorrected > 0) {
      const reference = path.relative(root, path.join(dir, lastReviewReport(dir)));
      state.problem = `Un constat non corrigé (ou une ligne NON CORRIGÉS absente ou illisible) dans ${reference}` +
        ` refuse la tentative : la boucle passe au palier suivant.\n\n${reviewed.report}`;
      code = 1;
      break;
    }
    if (reviewed.verdict === "accepté") {
      const reference = path.relative(root, path.join(dir, lastReviewReport(dir)));
      reserves = reviewReserves(reviewed.report, reference);
      break;
    }
    if (reviewed.problem || correction >= MAX_CORRECTIONS) {
      state.problem = reviewed.problem || reviewed.report;
      code = 1;
      break;
    }
    const reportFile = path.relative(root, path.join(dir, lastReviewReport(dir)));
    const fix = `Reprends le ticket ${ticket.id} (${ticket.file}) en suivant .agents/skills/ticket-codex/SKILL.md.` +
      ` Lis ${reportFile}, le ticket et son journal, les écarts, git status et git diff, puis reprends le travail présent dans l'arbre.` +
      ` Corrige chaque constat bloquant et mineur de cette relecture, tests d'abord, puis rends un nouveau verdict.\n\n${reviewed.report}`;
    const fallbackEvent = (phase, data) => event(phase, { ...data, attempt });
    const request = { step, prompt: fix, session: state.session, reportRecovery };
    code = await correctionSession(root, request, env, file, state, timeoutMs, started, dir, fallbackEvent);
  }
  const { problem, turnStarted, ...usage } = state;
  const report = { ...usage, moteur: "codex", duree_s: Math.round((Date.now() - started) / MS_PER_SECOND), relectures, cout_usd: null };
  event("session-terminee", { ticket: ticket.id, attempt, code, ...report });
  return { code, report, problem, reserves };
}
