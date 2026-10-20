// Contrôle réel T269, étape 3 : une session archivée du Mac (copie), ouverte par le serveur headless avec les questions
// sur Ollama, puis des questions réelles par l'API HTTP. Rien n'est écrit hors du dossier de copie.
// Usage : node qa-questions.mjs <dossier de données> <sortie.json> [env supplémentaires KEY=VALUE...]
import { spawn } from "node:child_process";
import fs from "node:fs";

const [data, out, ...extra] = process.argv.slice(2);
const ROOT = "/Users/Dabi/Documents/ISN/tvlens";
const PORT = Number(process.env.QA_PORT || 8799);
const SESSION = "ec55a89c-ca7f-4ca0-af77-eb2b6b313495";
const QUESTIONS = process.env.QA_QUESTIONS ? JSON.parse(process.env.QA_QUESTIONS) : [
  "Que dit exactement l'intervenant sur la mobilisation des lycéens ?",
  "Qu'est-ce qui est écrit à l'écran au début du live ?",
];
const PORT_OVERRIDE = process.env.QA_PORT;
const env = { ...process.env, TVLENS_SERVER_DATA: data, TVLENS_PORT: String(PORT), TVLENS_BIND: "127.0.0.1",
  TVLENS_QUESTIONS_BACKEND: "local", TVLENS_LOCAL_QUESTIONS_URL: "http://127.0.0.1:11434",
  TVLENS_LOCAL_QUESTIONS_MODEL: "qwen3.8:27b", TVLENS_LOCAL_QUESTIONS_NUM_CTX: "16384", TVLENS_LOCAL_QUESTIONS_KEEP_ALIVE: "2m" };
for (const pair of extra) { const i = pair.indexOf("="); env[pair.slice(0, i)] = pair.slice(i + 1); }

const ROLE_SETTING = /^TVLENS_(QUESTIONS|LOCAL_QUESTIONS|EMBEDDINGS|LOCAL_EMBEDDINGS|INSPECTION|LOCAL_VLM|PERCEPTION)_/;
const shown = Object.entries(env).filter(([k]) => ROLE_SETTING.test(k) && !/TOKEN/.test(k));
const report = { startedAt: new Date().toISOString(), env: Object.fromEntries(shown), steps: [] };
const save = () => fs.writeFileSync(out, JSON.stringify(report, null, 2));
const server = spawn("node", ["server/main.cjs"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
let logs = "";
server.stdout.on("data", (d) => { logs += d; });
server.stderr.on("data", (d) => { logs += d; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  for (let i = 0; i < 120; i++) {
    if (/TVLens server/.test(logs)) return;
    if (server.exitCode !== null) throw Error("serveur arrêté : " + logs.slice(-800));
    await wait(500);
  }
  throw Error("serveur pas prêt : " + logs.slice(-800));
}
const token = () => fs.readFileSync(`${data}/device-token`, "utf8").trim();
async function call(method, path, body) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { method, headers: { Authorization: `Bearer ${token()}`,
    "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text: json ? undefined : text.slice(0, 300) };
}
function find(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id && ("status" in node)) return node;
  for (const v of Object.values(node)) { const f = find(v, id); if (f) return f; }
  return null;
}

try {
  await ready();
  const list = await call("GET", "/v1/sessions");
  report.steps.push({ step: "sessions", status: list.status, found: JSON.stringify(list.json || {}).includes(SESSION) });
  const open = await call("POST", `/v1/sessions/${SESSION}/open`, {});
  report.steps.push({ step: "open", status: open.status, keys: Object.keys(open.json || {}), error: open.json?.error || open.text });
  const state = await call("GET", "/v1/state");
  const sessionId = state.json?.session?.id || state.json?.sessionId || SESSION;
  const anchorMs = state.json?.capturedThroughMs ?? state.json?.session?.capturedThroughMs;
  report.steps.push({ step: "state", status: state.status, sessionId, anchorMs, readOnly: state.json?.readOnly ?? state.json?.session?.readOnly });
  save();
  for (const question of QUESTIONS) {
    const t0 = Date.now();
    const asked = await call("POST", "/v1/questions", { question, sessionId, anchorMs });
    const id = asked.json?.id || asked.json?.job?.id;
    const entry = { step: "question", question, status: asked.status, id, accepted: asked.json };
    report.steps.push(entry); save();
    if (!id) continue;
    let job = null;
    for (let i = 0; i < 400; i++) {
      await wait(1500);
      const s = await call("GET", "/v1/state");
      job = find(s.json, id);
      if (job && ["done", "failed", "cancelled", "timeout", "error"].includes(job.status)) break;
    }
    const r = job?.result || {};
    Object.assign(entry, { wallMs: Date.now() - t0, final: job?.status, message: job?.message, kind: r.kind,
      answer: r.answer, citations: r.citations, limits: r.limits, audit: r.audit, model: r.model, backend: r.backend,
      elapsedMs: r.elapsedMs, sourcesRejected: r.sourceValidation?.rejected, error: job?.error, metrics: job?.metrics,
      observations: r.observations });
    save();
    console.log(`${question.slice(0, 50)}… → ${job?.status} ${r.kind || ""} | outils ${JSON.stringify((r.audit || []).map((a) => a.tool))} | ` +
      `citations ${(r.citations || []).length} | ${Math.round((Date.now() - t0) / 1000)} s`);
  }
} catch (e) {
  report.error = String(e.message || e).slice(0, 1200);
  console.log("ERREUR", report.error);
} finally {
  report.serverLogTail = logs.split("\n").filter((l) => /rror|TVLENS_[A-Z_]{4,}|refus/i.test(l)).slice(-30).map((l) => l.slice(0, 300));
  save();
  server.kill("SIGTERM");
  await wait(1500);
  if (server.exitCode === null) server.kill("SIGKILL");
  console.log("rapport", out);
}
