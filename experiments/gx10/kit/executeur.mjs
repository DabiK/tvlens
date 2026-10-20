#!/usr/bin/env node
// Exécuteur des campagnes GX10 de TVLens. Depuis un plan JSON, il enchaîne : relevé de la machine, modèles Ollama,
// préparations vidéo, puis campagnes (G1 perception, G3 session soutenue, banc Whisper, commande libre). Il appelle
// les runners de la copie figée tels quels et n'écrase jamais une sortie : une campagne finie est sautée à la relance,
// une campagne interrompue est mise de côté (renommée) puis refaite dans un dossier neuf. Chaque campagne garde ses
// paramètres, sa configuration, ses journaux, ses mesures système et un résultat résumé ; l'index les liste toutes.
//
//   node executeur.mjs <plan.json> verifier                 plan, outils et chemins, sans rien lancer
//   node executeur.mjs <plan.json> lancer [options]         tout le plan, dans l'ordre, reprise comprise
//   node executeur.mjs <plan.json> etat                     campagne en cours, faites, restantes, dernières mesures
// Options de lancer : --validation (runners en validation seule : ni modèle ni inférence, pour répéter le plan),
//   --seulement id1,id2 (ces campagnes seulement), --sans-modeles (ne tire aucun modèle), --refaire id (rejoue une
//   campagne finie dans un nouveau dossier ; l'ancien reste).
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const KINDS = ["g1", "g3", "whisper", "command"];
// Le produit ne règle que ces langues ; une autre langue de vidéo est transcrite en détection automatique.
const PRODUCT_LANGUAGES = ["fr", "en", "auto"];
const productLanguage = (language) => (PRODUCT_LANGUAGES.includes(language) ? language : "auto");
const ROLE_ENV = { vlm: "VLM", questions: "QUESTIONS", inspection: "INSPECTION" };
const now = () => new Date().toISOString();
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const exists = (file) => fs.existsSync(file);
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => {
  fs.writeFileSync(file + ".tmp", JSON.stringify(value, null, 2));
  fs.renameSync(file + ".tmp", file);
};
const fail = (message) => {
  throw Object.assign(new Error(message), { planError: true });
};

// ---------------------------------------------------------------------------------------------------------- plan

function loadPlan(planPath) {
  const plan = readJson(planPath);
  if (plan.version !== 1) fail("Plan : version 1 attendue.");
  for (const key of ["root", "code", "tools", "videos", "preparations", "campaigns"])
    if (!plan[key]) fail(`Plan : « ${key} » manque.`);
  if (!path.isAbsolute(plan.root) || !path.isAbsolute(plan.code))
    fail("Plan : « root » et « code » sont des chemins absolus.");
  plan.ollama = { mode: "service", url: "http://127.0.0.1:11434", env: {}, ...plan.ollama };
  if (!["service", "managed"].includes(plan.ollama.mode)) fail("Plan : ollama.mode vaut « service » ou « managed ».");
  plan.defaults = { roles: {}, whisper: {}, cold: true, ...plan.defaults };
  plan.sampleSeconds ??= 5;
  const ids = new Set();
  for (const [name, prep] of Object.entries(plan.preparations)) {
    if (!plan.videos[prep.video]) fail(`Préparation ${name} : vidéo « ${prep.video} » inconnue.`);
  }
  for (const c of plan.campaigns) {
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(c.id || ""))
      fail(`Campagne « ${c.id} » : identifiant en minuscules, chiffres, points et tirets.`);
    if (ids.has(c.id)) fail(`Campagne « ${c.id} » en double.`);
    ids.add(c.id);
    if (!KINDS.includes(c.kind)) fail(`Campagne ${c.id} : type « ${c.kind} » inconnu (${KINDS.join(", ")}).`);
    if (c.kind !== "command" && !plan.preparations[c.preparation])
      fail(`Campagne ${c.id} : préparation « ${c.preparation} » inconnue.`);
    if (c.ollama && plan.ollama.mode !== "managed" && Object.keys(c.ollama).length)
      fail(`Campagne ${c.id} : des réglages Ollama demandent ollama.mode « managed ».`);
  }
  return plan;
}

function rolesOf(plan, campaign) {
  const merged = {};
  for (const role of ["vlm", "questions", "embeddings", "inspection"]) {
    const base = plan.defaults.roles[role],
      over = campaign.roles?.[role];
    merged[role] = over === null ? null : base || over ? { url: plan.ollama.url, ...base, ...over } : null;
  }
  return merged;
}
const whisperOf = (plan, campaign) => ({ threads: 4, audioCtx: 0, ...plan.defaults.whisper, ...campaign.whisper });
const coldOf = (plan, campaign) => campaign.cold ?? plan.defaults.cold;

function modelsOf(plan, campaigns) {
  const models = new Set();
  for (const c of campaigns) {
    if (c.kind === "command" || c.kind === "whisper") {
      for (const m of c.pull || []) models.add(m);
      continue;
    }
    const roles = rolesOf(plan, c);
    if (c.kind === "g1") {
      if (roles.vlm?.model) models.add(roles.vlm.model);
      continue;
    }
    for (const role of Object.values(roles)) if (role?.model) models.add(role.model);
  }
  return [...models];
}

// ------------------------------------------------------------------------------------------------- journal, état

function journal(plan) {
  const file = path.join(plan.root, "journal.log");
  return (message) => {
    const line = `${now()} ${message}`;
    fs.appendFileSync(file, line + "\n");
    console.log(line);
  };
}
const statePath = (plan) => path.join(plan.root, "etat.json");
const indexPath = (plan) => path.join(plan.root, "index.jsonl");
function setState(plan, patch) {
  const current = exists(statePath(plan)) ? readJson(statePath(plan)) : {};
  writeJson(statePath(plan), { ...current, ...patch, pid: process.pid, heartbeat: now() });
}
function appendIndex(plan, entry) {
  fs.appendFileSync(indexPath(plan), JSON.stringify({ at: now(), ...entry }) + "\n");
}
function indexEntries(plan) {
  if (!exists(indexPath(plan))) return [];
  return fs
    .readFileSync(indexPath(plan), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// ------------------------------------------------------------------------------------------------------ processus

// Lance une commande, sa sortie dans deux fichiers ; tue tout son groupe au délai ou à l'arrêt de l'exécuteur.
const children = new Set();
let stopping = false;
function run(command, args, { cwd, env, stdout, stderr, timeoutMs, log } = {}) {
  return new Promise((resolve) => {
    const out = stdout ? fs.openSync(stdout, "a") : "ignore",
      err = stderr ? fs.openSync(stderr, "a") : "ignore";
    const started = Date.now();
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", out, err],
      detached: true,
    });
    children.add(child);
    let timedOut = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          log?.(`délai de ${Math.round(timeoutMs / 60000)} min dépassé : arrêt de ${path.basename(command)}`);
          killGroup(child, "SIGTERM");
          setTimeout(() => killGroup(child, "SIGKILL"), 30000).unref();
        }, timeoutMs)
      : null;
    child.on("error", (error) => {
      clearTimeout(timer);
      children.delete(child);
      resolve({ code: null, error: error.message, timedOut, durationMs: Date.now() - started });
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      children.delete(child);
      if (typeof out === "number") fs.closeSync(out);
      if (typeof err === "number") fs.closeSync(err);
      resolve({ code, signal, timedOut, durationMs: Date.now() - started });
    });
  });
}
function killGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {}
  }
}
function capture(command, args, { env, timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    let text = "";
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk) => {
      text += chunk;
    });
    child.stderr.on("data", (chunk) => {
      text += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: null, text: error.message });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, text: text.trim() });
    });
  });
}

// --------------------------------------------------------------------------------------------- mesures système

async function sample(plan) {
  const row = {
    at: now(),
    loadavg: os.loadavg().map((v) => Math.round(v * 100) / 100),
    freeMemMb: Math.round(os.freemem() / 1048576),
  };
  try {
    const info = Object.fromEntries(
      fs
        .readFileSync("/proc/meminfo", "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split(/:\s+/))
        .map(([k, v]) => [k, Number.parseInt(v, 10)]),
    );
    Object.assign(row, {
      memAvailableMb: Math.round(info.MemAvailable / 1024),
      swapUsedMb: Math.round((info.SwapTotal - info.SwapFree) / 1024),
    });
  } catch {}
  const gpu = await capture(
    plan.tools.nvidiaSmi || "nvidia-smi",
    [
      "--query-gpu=utilization.gpu,memory.used,memory.total,power.draw,temperature.gpu,clocks.sm",
      "--format=csv,noheader,nounits",
    ],
    { timeoutMs: 4000 },
  );
  if (gpu.code === 0) {
    const [util, memUsed, memTotal, power, temp, sm] = gpu.text
      .split("\n")[0]
      .split(",")
      .map((v) => Number.parseFloat(v));
    row.gpu = { util, memUsedMb: memUsed, memTotalMb: memTotal, powerW: power, tempC: temp, smMhz: sm };
  }
  try {
    const ps = await (await fetch(new URL("/api/ps", plan.ollama.url), { signal: AbortSignal.timeout(3000) })).json();
    row.ollama = (ps.models || []).map((m) => ({
      model: m.name,
      sizeMb: Math.round(m.size / 1048576),
      vramMb: Math.round((m.size_vram || 0) / 1048576),
      context: m.context_length ?? null,
    }));
  } catch {
    row.ollama = null;
  }
  return row;
}
function startSampler(plan, file) {
  let stopped = false,
    pending = Promise.resolve();
  const tick = () => {
    pending = sample(plan)
      .then((row) => {
        if (!stopped) fs.appendFileSync(file, JSON.stringify(row) + "\n");
      })
      .catch(() => {});
  };
  tick();
  const timer = setInterval(tick, plan.sampleSeconds * 1000);
  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
}
function samplesSummary(file) {
  if (!exists(file)) return null;
  const rows = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const max = (pick) => {
    const v = rows.map(pick).filter(Number.isFinite);
    return v.length ? Math.max(...v) : null;
  };
  const min = (pick) => {
    const v = rows.map(pick).filter(Number.isFinite);
    return v.length ? Math.min(...v) : null;
  };
  const mean = (pick) => {
    const v = rows.map(pick).filter(Number.isFinite);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  return {
    samples: rows.length,
    gpuUtilMean: mean((r) => r.gpu?.util),
    gpuUtilMax: max((r) => r.gpu?.util),
    gpuMemMaxMb: max((r) => r.gpu?.memUsedMb),
    powerMaxW: max((r) => r.gpu?.powerW),
    memAvailableMinMb: min((r) => r.memAvailableMb),
    swapMaxMb: max((r) => r.swapUsedMb),
    loadMax: max((r) => r.loadavg?.[0]),
    ollamaMaxMb: max((r) => r.ollama?.reduce((a, m) => a + m.sizeMb, 0)),
  };
}

// ------------------------------------------------------------------------------------------------------- Ollama

let managed = null;
async function ollamaReady(url, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if ((await fetch(new URL("/api/version", url), { signal: AbortSignal.timeout(2000) })).ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
const OLLAMA_ENV = {
  numParallel: "OLLAMA_NUM_PARALLEL",
  maxLoadedModels: "OLLAMA_MAX_LOADED_MODELS",
  flashAttention: "OLLAMA_FLASH_ATTENTION",
  kvCacheType: "OLLAMA_KV_CACHE_TYPE",
  contextLength: "OLLAMA_CONTEXT_LENGTH",
  schedSpread: "OLLAMA_SCHED_SPREAD",
};
function ollamaEnv(plan, campaign) {
  const env = { ...plan.ollama.env };
  for (const [key, value] of Object.entries(campaign?.ollama || {})) {
    if (!OLLAMA_ENV[key]) fail(`Réglage Ollama « ${key} » inconnu (${Object.keys(OLLAMA_ENV).join(", ")}).`);
    env[OLLAMA_ENV[key]] = String(value);
  }
  env.OLLAMA_HOST = new URL(plan.ollama.url).host;
  return env;
}
// En mode « managed », l'exécuteur possède le serveur Ollama : il le relance quand les réglages changent.
async function ensureOllama(plan, campaign, log, logFile) {
  if (plan.ollama.mode !== "managed") {
    if (!(await ollamaReady(plan.ollama.url, 10000))) throw new Error(`Ollama ne répond pas sur ${plan.ollama.url}.`);
    return { mode: "service", env: null };
  }
  const env = ollamaEnv(plan, campaign),
    key = JSON.stringify(env);
  if (managed?.key === key && managed.child.exitCode === null) return { mode: "managed", env };
  if (managed) {
    log("arrêt du serveur Ollama (réglages changés)");
    killGroup(managed.child, "SIGTERM");
    await new Promise((r) => setTimeout(r, 3000));
  }
  const out = fs.openSync(logFile, "a");
  const child = spawn(plan.tools.ollama || "ollama", ["serve"], {
    env: { ...process.env, ...env },
    stdio: ["ignore", out, out],
    detached: true,
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  managed = { key, child };
  log(
    `serveur Ollama lancé (${Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")})`,
  );
  if (!(await ollamaReady(plan.ollama.url, 60000))) throw new Error("Le serveur Ollama lancé ne répond pas.");
  return { mode: "managed", env };
}
// Démarrage à froid : aucun modèle ne reste chargé d'une campagne à l'autre.
async function unloadAll(plan) {
  try {
    const ps = await (await fetch(new URL("/api/ps", plan.ollama.url), { signal: AbortSignal.timeout(5000) })).json();
    for (const m of ps.models || []) {
      await fetch(new URL("/api/generate", plan.ollama.url), {
        method: "POST",
        body: JSON.stringify({ model: m.name, keep_alive: 0 }),
        signal: AbortSignal.timeout(30000),
      }).catch(() => {});
    }
    return (ps.models || []).map((m) => m.name);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------------- configuration

function configEnv(plan, campaign, roles) {
  const w = whisperOf(plan, campaign),
    lines = [];
  const set = (key, value) => {
    if (value !== undefined && value !== null && value !== "") lines.push(`${key}=${value}`);
  };
  set("TVLENS_FFMPEG", plan.tools.ffmpeg);
  if (w.model) {
    if (!plan.whisperModels?.[w.model])
      fail(`Campagne ${campaign.id} : modèle Whisper « ${w.model} » absent de whisperModels.`);
    set("TVLENS_WHISPER_MODEL", plan.whisperModels[w.model]);
  }
  set("TVLENS_WHISPER_BINARY", plan.tools.whisper);
  set("TVLENS_WHISPER_THREADS", w.threads);
  set("TVLENS_WHISPER_AUDIO_CTX", w.audioCtx);
  set("TVLENS_PERCEPTION_BACKEND", roles.vlm ? "local" : null);
  set("TVLENS_QUESTIONS_BACKEND", roles.questions ? "local" : null);
  set("TVLENS_EMBEDDINGS_BACKEND", roles.embeddings ? "local" : "disabled");
  set("TVLENS_INSPECTION_BACKEND", roles.vlm || roles.inspection ? "local" : null);
  for (const [role, name] of Object.entries(ROLE_ENV)) {
    const r = roles[role];
    if (!r) continue;
    set(`TVLENS_LOCAL_${name}_URL`, r.url);
    set(`TVLENS_LOCAL_${name}_MODEL`, r.model);
    set(`TVLENS_LOCAL_${name}_NUM_CTX`, r.numCtx);
    set(`TVLENS_LOCAL_${name}_KEEP_ALIVE`, r.keepAlive);
    set(`TVLENS_LOCAL_${name}_THINK`, r.think);
  }
  if (roles.embeddings) {
    set("TVLENS_LOCAL_EMBEDDINGS_URL", roles.embeddings.url);
    set("TVLENS_LOCAL_EMBEDDINGS_MODEL", roles.embeddings.model);
    set("TVLENS_LOCAL_EMBEDDINGS_TIMEOUT_MS", roles.embeddings.timeoutMs);
  }
  set("TVLENS_VISION_DURING_ASK", campaign.visionDuringAsk === false ? "0" : "1");
  set("TVLENS_BACKGROUND_INDEX", campaign.backgroundIndex === false ? "0" : "1");
  for (const [key, value] of Object.entries(campaign.env || {})) {
    if (!/^TVLENS_[A-Z0-9_]+$/.test(key) || /TOKEN|KEY|SECRET/.test(key))
      fail(`Campagne ${campaign.id} : variable « ${key} » refusée.`);
    set(key, value);
  }
  return lines.join("\n") + "\n";
}

// Scénario G3 à côté de la préparation : le runner n'accepte que des chemins relatifs descendants.
function writeScenario(plan, campaign, roles, prepDir, file) {
  const prep = plan.preparations[campaign.preparation],
    video = plan.videos[prep.video];
  const index = readJson(path.join(prepDir, "blocks.json"));
  const blocks = index.blocks;
  const planned = Math.round((campaign.durationMin ?? 30) * 60000);
  const lengths = blocks.map((b, i) => {
    const body = readJson(path.join(prepDir, b.body.path));
    return body.endMs - body.startMs;
  });
  const clips = [];
  let at = 0,
    i = 0;
  while (at < planned) {
    const block = i % blocks.length;
    if (at + lengths[block] > planned) break;
    clips.push({
      id: `clip-${i}`,
      block,
      occurrence: Math.floor(i / blocks.length),
      atMs: at,
      language: productLanguage(campaign.language || video.language || "auto"),
    });
    at += lengths[block];
    i++;
  }
  const looped = clips.some((c) => c.occurrence > 0);
  const overload = campaign.scenario === "overload";
  const asked = (campaign.questions || video.questions || []).filter(([s]) => s * 1000 < at);
  const questions = overload
    ? (campaign.questions || video.questions || [])
        .slice(0, 8)
        .map(([, q], n) => ({
          id: `question-${n}`,
          atMs: Math.min(at, (campaign.burstAtS ?? 120) * 1000),
          question: q,
        }))
    : asked.map(([s, q], n) => ({ id: `question-${n}`, atMs: s * 1000, question: q }));
  const role = (r) =>
    r && {
      url: r.url,
      model: r.model,
      ...(r.numCtx ? { numCtx: r.numCtx } : {}),
      ...(r.keepAlive ? { keepAlive: r.keepAlive } : {}),
    };
  const embeddings = roles.embeddings && {
    url: roles.embeddings.url,
    model: roles.embeddings.model,
    ...(roles.embeddings.timeoutMs ? { timeoutMs: roles.embeddings.timeoutMs } : {}),
  };
  const scenario = {
    version: 1,
    kind: overload ? "overload" : "nominal",
    ...(looped ? { loop: true } : {}),
    index: { path: "blocks.json", sha256: sha256(fs.readFileSync(path.join(prepDir, "blocks.json"))) },
    provenance: {
      kind: "converted-video",
      reference:
        `${video.description || prep.video} ; préparation ${campaign.preparation}` +
        `${looped ? ", bouclée et déclarée" : ""} ; capture LG non mesurée.`,
      preparation: {
        path: "preparation.json",
        sha256: sha256(fs.readFileSync(path.join(prepDir, "preparation.json"))),
      },
    },
    plannedDurationMs: at,
    finalWaitMs: campaign.finalWaitMs ?? 360000,
    closeWaitMs: campaign.closeWaitMs ?? 30000,
    config: {
      perceptionBackend: roles.vlm ? "local" : "codex",
      questionsBackend: roles.questions ? "local" : "codex",
      embeddingsBackend: roles.embeddings ? "local" : "disabled",
      inspectionBackend: roles.vlm || roles.inspection ? "local" : "codex",
      ...(roles.vlm ? { localVlm: role(roles.vlm) } : {}),
      ...(roles.questions ? { localQuestions: role(roles.questions) } : {}),
      ...(embeddings ? { localEmbeddings: embeddings } : {}),
      visionDuringAsk: campaign.visionDuringAsk !== false,
      backgroundIndex: campaign.backgroundIndex !== false,
    },
    selectedModels: { observationModel: "gpt-6-luna", inspectionModel: "gpt-6-luna", codexModel: "gpt-6" },
    clips,
    questions,
  };
  fs.writeFileSync(file, JSON.stringify(scenario, null, 2));
  return { clips: clips.length, plannedMs: at, questions: questions.length, looped };
}

// ---------------------------------------------------------------------------------------------------- résultats

function g1Result(file) {
  if (!exists(file)) return { complete: false, reason: "campaign.json absent" };
  const r = readJson(file),
    cases = r.cases || [];
  const ok = cases.filter((c) => c.status === "succeeded"),
    t = ok.map((c) => c.result?.metrics?.providerTimings || {});
  const mean = (values) => {
    const v = values.filter(Number.isFinite);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const evalMs = t.reduce((a, x) => a + (x.evalMs || 0), 0),
    evalTokens = t.reduce((a, x) => a + (x.evalTokens || 0), 0);
  return {
    complete: r.complete === true,
    mode: r.mode,
    cases: cases.length,
    succeeded: ok.length,
    failed: cases
      .filter((c) => c.status !== "succeeded")
      .map((c) => ({ id: c.id, status: c.status }))
      .slice(0, 20),
    elapsedMeanMs: mean(ok.map((c) => c.result?.elapsedMs)),
    elapsedMaxMs: ok.length ? Math.max(...ok.map((c) => c.result?.elapsedMs || 0)) : null,
    loadMeanMs: mean(t.map((x) => x.loadMs)),
    promptEvalMeanMs: mean(t.map((x) => x.promptEvalMs)),
    evalMeanMs: mean(t.map((x) => x.evalMs)),
    evalTokensPerS: evalMs ? Math.round((evalTokens / evalMs) * 10000) / 10 : null,
  };
}
function g3Result(file) {
  if (!exists(file)) return { complete: false, reason: "campaign.json absent" };
  const r = readJson(file),
    s = r.summary || {};
  const outcomes = s.questions?.outcomes || [];
  const latencies = outcomes.map((o) => o.latency?.submissionToHttpResponseMs).filter(Number.isFinite);
  const uploads = r.uploads || [];
  return {
    complete: r.complete === true,
    status: r.status,
    stopReason: r.stopReason ?? null,
    passages: s.passages ?? null,
    publications: s.publications ?? null,
    lossCounts: s.lossCounts ?? null,
    coveragePercent: s.coverage
      ? Object.fromEntries(Object.entries(s.coverage).map(([k, v]) => [k, v?.percent ?? null]))
      : null,
    uploads: {
      planned: uploads.length,
      accepted: uploads.filter((u) => (u.attempts || []).some((a) => a.status === 200)).length,
    },
    questions: {
      asked: outcomes.length,
      successful: s.questions?.successful ?? null,
      latencyMeanS: latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length / 100) / 10
        : null,
      latencyMaxS: latencies.length ? Math.round(Math.max(...latencies) / 100) / 10 : null,
    },
    shutdown: r.shutdown ?? null,
    diagnostics: (r.diagnostics || []).length,
    guardFailures: (r.guardFailures || []).length,
  };
}
function whisperResult(dir) {
  const files = exists(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  return { reports: files, complete: files.length > 0 };
}

// ------------------------------------------------------------------------------------------------- préparations

async function prepare(plan, name, { validation, log }) {
  const prep = plan.preparations[name],
    video = plan.videos[prep.video];
  const dir = path.join(plan.root, "corpus", name);
  const done = path.join(dir, "preparation.json");
  if (exists(done) && readJson(done).complete === true) return dir;
  if (exists(dir)) {
    const aside = `${dir}.incomplet-${Date.now()}`;
    fs.renameSync(dir, aside);
    log(`préparation ${name} incomplète mise de côté : ${aside}`);
  }
  if (!exists(video.file)) throw new Error(`Vidéo absente : ${video.file}`);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const logs = path.join(plan.root, "corpus", `${name}.log`);
  const config = path.join(plan.root, "corpus", `${name}.env`);
  fs.writeFileSync(config, `TVLENS_FFMPEG=${plan.tools.ffmpeg}\n`);
  const args = [
    path.join(plan.code, "scripts/prepare-video-replay.cjs"),
    "--file",
    video.file,
    "--out",
    dir,
    "--config",
    config,
    "--start-ms",
    String(prep.startMs ?? 0),
    "--block-ms",
    String(prep.blockMs ?? 8000),
    "--frames",
    String(prep.frames ?? 4),
    "--jpeg-quality",
    String(prep.jpegQuality ?? 3),
    ...(prep.durationMs ? ["--duration-ms", String(prep.durationMs)] : []),
  ];
  log(
    `préparation ${name} : ${path.basename(video.file)}${prep.durationMs ? `, ${Math.round(prep.durationMs / 1000)} s` : ""}`,
  );
  const converted = await run(plan.tools.node || "node", args, {
    cwd: plan.code,
    stdout: logs,
    stderr: logs,
    timeoutMs: 3 * 3600000,
    log,
  });
  if (converted.code !== 0) throw new Error(`Préparation ${name} refusée (code ${converted.code}), voir ${logs}`);
  const checked = await run(
    plan.tools.node || "node",
    [path.join(plan.code, "scripts/prepare-video-replay.cjs"), "--validate", "--out", dir],
    { cwd: plan.code, stdout: logs, stderr: logs, timeoutMs: 600000, log },
  );
  if (checked.code !== 0) throw new Error(`Validation de la préparation ${name} refusée, voir ${logs}`);
  appendIndex(plan, {
    step: "preparation",
    id: name,
    status: "faite",
    durationMs: converted.durationMs,
    dir,
    validation,
  });
  return dir;
}

// --------------------------------------------------------------------------------------------------- campagnes

// Une campagne finie dans le même mode (validation ou exécution) est sautée ; une validation ne compte jamais pour
// une exécution réelle.
async function campaignDir(plan, campaign, redo, validation) {
  const base = path.join(plan.root, "campagnes");
  fs.mkdirSync(base, { recursive: true });
  const previous = fs
    .readdirSync(base)
    .filter((d) => d.replace(/^\d+-/, "").replace(/\.interrompue-\d+$/, "") === campaign.id);
  for (const d of previous) {
    const full = path.join(base, d),
      result = path.join(full, "resultat.json");
    if (d.includes(".interrompue-")) continue;
    if (!exists(result)) {
      fs.renameSync(full, `${full}.interrompue-${Date.now()}`);
      continue;
    }
    if (!redo && Boolean(readJson(result).validation) === Boolean(validation)) return { skip: full };
  }
  const number = String(fs.readdirSync(base).filter((d) => /^\d+-/.test(d)).length + 1).padStart(3, "0");
  const dir = path.join(base, `${number}-${campaign.id}`);
  fs.mkdirSync(dir);
  return { dir };
}

async function runCampaign(plan, campaign, { validation, redo, log, ...options }) {
  // Une campagne peut nommer sa propre copie du code (comparer deux SHA dans un même plan) ; les préparations restent communes.
  const code = campaign.code ?? plan.code;
  const { skip, dir } = await campaignDir(plan, campaign, redo, validation);
  if (skip) {
    log(`${campaign.id} déjà faite (${path.basename(skip)}) : sautée`);
    return { skipped: true };
  }
  const roles = rolesOf(plan, campaign);
  const params = {
    id: campaign.id,
    kind: campaign.kind,
    campaign,
    roles,
    whisper: whisperOf(plan, campaign),
    cold: coldOf(plan, campaign),
    ollama: campaign.ollama || {},
    validation,
    code,
    startedAt: now(),
  };
  writeJson(path.join(dir, "parametres.json"), params);
  const stdout = path.join(dir, "sortie.log"),
    stderr = path.join(dir, "erreurs.log"),
    out = path.join(dir, "out");
  setState(plan, { phase: "campagne", campaign: campaign.id, dir, startedAt: params.startedAt });
  log(`▶ ${campaign.id} (${campaign.kind}) → ${path.basename(dir)}`);

  let ollama = null,
    unloaded = null;
  // Les modèles se tirent au fil du plan, avant la campagne qui en a besoin et hors de son temps mesuré.
  if (!validation && !options.noPull) {
    const needed = modelsOf(plan, [campaign]);
    if (needed.length) {
      setState(plan, { phase: "modeles", campaign: campaign.id });
      try {
        await pullModels(plan, needed, log);
      } catch (error) {
        const record = {
          id: campaign.id,
          kind: campaign.kind,
          status: "modele-absent",
          reason: error.message,
          finishedAt: now(),
          validation,
        };
        writeJson(path.join(dir, "resultat.json"), record);
        appendIndex(plan, {
          step: "campagne",
          id: campaign.id,
          status: "modele-absent",
          dir,
          validation,
          result: { reason: error.message },
        });
        log(`■ ${campaign.id} : modèle absent, campagne sautée (${error.message})`);
        return record;
      }
    }
  }
  if (!validation && campaign.kind !== "command" && campaign.kind !== "whisper") {
    ollama = await ensureOllama(plan, campaign, log, path.join(plan.root, "ollama.log"));
    if (coldOf(plan, campaign)) unloaded = await unloadAll(plan);
  }
  const stopSampler = startSampler(plan, path.join(dir, "systeme.jsonl"));
  const node = plan.tools.node || "node";
  let outcome, result;
  try {
    if (campaign.kind === "g1") {
      const prepDir = await prepare(plan, campaign.preparation, { validation, log });
      const vlm = roles.vlm || fail(`Campagne ${campaign.id} : rôle vlm requis pour G1.`);
      const args = [
        path.join(code, "scripts/replay-local-perception.cjs"),
        "--manifest",
        path.join(prepDir, "manifest.json"),
        "--out",
        out,
        "--backend",
        "local",
        ...(validation ? ["--validate"] : ["--execute", "--url", vlm.url, "--model", vlm.model]),
        ...(vlm.numCtx ? ["--num-ctx", String(vlm.numCtx)] : []),
        ...(vlm.keepAlive ? ["--keep-alive", vlm.keepAlive] : []),
      ];
      outcome = await run(node, args, {
        cwd: code,
        stdout,
        stderr,
        timeoutMs: (campaign.timeoutMin ?? 180) * 60000,
        log,
      });
      result = g1Result(path.join(out, "campaign.json"));
    } else if (campaign.kind === "g3") {
      const prepDir = await prepare(plan, campaign.preparation, { validation, log });
      const config = path.join(dir, "config.env");
      fs.writeFileSync(config, configEnv(plan, campaign, roles), { mode: 0o600 });
      const scenarioFile = path.join(prepDir, `scenario-${path.basename(dir)}.json`);
      const shape = writeScenario(plan, campaign, roles, prepDir, scenarioFile);
      fs.copyFileSync(scenarioFile, path.join(dir, "scenario.json"));
      log(
        `${campaign.id} : ${shape.clips} blocs, ${Math.round(shape.plannedMs / 60000)} min${shape.looped ? " bouclées" : ""}, ${shape.questions} questions`,
      );
      const args = (mode) => [
        path.join(code, "scripts/replay-local-stream.cjs"),
        "--scenario",
        scenarioFile,
        "--out",
        mode === "validate" ? `${out}-validation` : out,
        "--config",
        config,
        mode === "validate" ? "--validate" : "--execute",
      ];
      outcome = await run(node, args("validate"), { cwd: code, stdout, stderr, timeoutMs: 600000, log });
      if (outcome.code === 0 && !validation) {
        const budget =
          shape.plannedMs + (campaign.finalWaitMs ?? 360000) + (campaign.closeWaitMs ?? 30000) + 15 * 60000;
        outcome = await run(node, args("execute"), { cwd: code, stdout, stderr, timeoutMs: budget, log });
        result = g3Result(path.join(out, "campaign.json"));
      } else
        result = validation
          ? { complete: outcome.code === 0, mode: "validation" }
          : { complete: false, reason: "validation du scénario refusée" };
    } else if (campaign.kind === "whisper") {
      const prepDir = await prepare(plan, campaign.preparation, { validation, log });
      const wavs = fs
        .readdirSync(path.join(prepDir, "blocks"))
        .sort()
        .map((b) => path.join(prepDir, "blocks", b, "audio.wav"))
        .filter(exists)
        .slice(0, campaign.files ?? 10);
      if (!wavs.length) fail(`Campagne ${campaign.id} : aucun audio dans ${campaign.preparation}.`);
      fs.mkdirSync(path.join(out, "audio"), { recursive: true });
      // Un nom par bloc : le tableau du banc nomme chaque fichier par son nom de base.
      for (let i = 0; i < wavs.length; i++) {
        const named = path.join(out, "audio", `${path.basename(path.dirname(wavs[i]))}.wav`);
        fs.symlinkSync(wavs[i], named);
        wavs[i] = named;
      }
      outcome = { code: 0, durationMs: 0 };
      for (const model of campaign.models || [whisperOf(plan, campaign).model]) {
        if (!plan.whisperModels?.[model]) fail(`Campagne ${campaign.id} : modèle Whisper « ${model} » inconnu.`);
        if (validation) {
          if (!exists(plan.whisperModels[model]))
            log(`(validation) poids Whisper absents : ${plan.whisperModels[model]}`);
          continue;
        }
        const lang = productLanguage(
          campaign.language || plan.videos[plan.preparations[campaign.preparation].video].language || "auto",
        );
        const args = [
          path.join(code, "scripts/bench-whisper.cjs"),
          "--model",
          plan.whisperModels[model],
          "--binary",
          plan.tools.whisper,
          "--language",
          lang,
          "--threads",
          String(campaign.threads ?? "4,8"),
          "--audio-ctx",
          String(campaign.audioCtx ?? "0"),
          "--repeats",
          String(campaign.repeats ?? 2),
          ...(campaign.noGpu ? ["--no-gpu"] : []),
          "--out",
          path.join(out, `${model}.json`),
          ...wavs,
        ];
        const step = await run(node, args, {
          cwd: code,
          stdout,
          stderr,
          timeoutMs: (campaign.timeoutMin ?? 120) * 60000,
          log,
        });
        outcome = { ...step, durationMs: outcome.durationMs + step.durationMs, code: outcome.code || step.code };
      }
      result = validation ? { complete: true, mode: "validation", files: wavs.length } : whisperResult(out);
    } else {
      const command = campaign.command || fail(`Campagne ${campaign.id} : « command » requis.`);
      if (validation) {
        outcome = { code: 0, durationMs: 0 };
        result = { complete: true, mode: "validation", command };
      } else {
        fs.mkdirSync(out);
        outcome = await run("/bin/bash", ["-lc", command], {
          cwd: out,
          stdout,
          stderr,
          timeoutMs: (campaign.timeoutMin ?? 60) * 60000,
          log,
          env: {
            TVLENS_GX10_ROOT: plan.root,
            TVLENS_GX10_CODE: code,
            TVLENS_GX10_OUT: out,
            OLLAMA_URL: plan.ollama.url,
          },
        });
        result = { complete: outcome.code === 0 };
      }
    }
  } catch (error) {
    if (error.planError) throw error;
    outcome = { code: null, error: error.message };
    result = { complete: false, reason: error.message };
    log(`${campaign.id} : erreur ${error.message}`);
  } finally {
    await stopSampler();
  }
  if (stopping) {
    log(`${campaign.id} : interrompue par l'arrêt, sans résultat (refaite à neuf à la relance)`);
    return { interrupted: true };
  }
  const status = outcome.timedOut ? "delai" : result?.complete ? "complete" : "incomplete";
  const record = {
    id: campaign.id,
    kind: campaign.kind,
    status,
    exitCode: outcome.code,
    signal: outcome.signal ?? null,
    timedOut: Boolean(outcome.timedOut),
    durationMs: outcome.durationMs ?? null,
    finishedAt: now(),
    validation,
    ollama,
    unloadedBefore: unloaded,
    result,
    system: samplesSummary(path.join(dir, "systeme.jsonl")),
  };
  writeJson(path.join(dir, "resultat.json"), record);
  appendIndex(plan, {
    step: "campagne",
    id: campaign.id,
    status,
    dir,
    durationMs: record.durationMs,
    validation,
    result,
  });
  log(
    `■ ${campaign.id} : ${status}` +
      `${outcome.code !== 0 && outcome.code !== undefined ? ` (code ${outcome.code})` : ""}` +
      `, ${Math.round((record.durationMs || 0) / 60000)} min`,
  );
  return record;
}

// ------------------------------------------------------------------------------------------- machine et modèles

async function machine(plan, log) {
  const dir = path.join(plan.root, "machine");
  if (exists(path.join(dir, "machine.json"))) return;
  fs.mkdirSync(dir, { recursive: true });
  const probes = {
    uname: ["uname", ["-a"]],
    osRelease: ["cat", ["/etc/os-release"]],
    cpu: ["lscpu", []],
    memory: ["free", ["-m"]],
    disk: ["df", ["-h", plan.root]],
    gpu: [plan.tools.nvidiaSmi || "nvidia-smi", ["-q"]],
    gpuShort: [plan.tools.nvidiaSmi || "nvidia-smi", []],
    node: [plan.tools.node || "node", ["--version"]],
    ollama: [plan.tools.ollama || "ollama", ["--version"]],
    ffmpeg: [plan.tools.ffmpeg, ["-version"]],
    whisper: [plan.tools.whisper, ["--help"]],
    git: ["git", ["-C", plan.code, "rev-parse", "HEAD"]],
    gitStatus: ["git", ["-C", plan.code, "status", "--porcelain=v1"]],
  };
  const report = {
    at: now(),
    hostname: os.hostname(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemMb: Math.round(os.totalmem() / 1048576),
  };
  for (const [name, [command, args]] of Object.entries(probes)) {
    const r = await capture(command, args, { timeoutMs: 20000 });
    fs.writeFileSync(path.join(dir, `${name}.txt`), r.text + "\n");
    report[name] =
      r.code === 0
        ? r.text
            .split("\n")
            .slice(0, name === "git" ? 1 : 3)
            .join(" | ")
        : `indisponible (${r.text.slice(0, 120)})`;
  }
  writeJson(path.join(dir, "machine.json"), report);
  log(`machine relevée : ${report.arch}, ${report.cpus} cœurs, ${report.totalMemMb} Mo, code ${report.git}`);
}

async function pullModels(plan, models, log) {
  const file = path.join(plan.root, "modeles.json");
  const known = exists(file) ? readJson(file) : {};
  await ensureOllama(plan, null, log, path.join(plan.root, "ollama.log"));
  const env = { OLLAMA_HOST: new URL(plan.ollama.url).host };
  const local = await (await fetch(new URL("/api/tags", plan.ollama.url))).json().catch(() => ({ models: [] }));
  for (const model of models) {
    if (known[model]?.digest) continue;
    // Un modèle déjà présent n'est jamais retiré : un pull remplacerait ses poids par la dernière version publiée.
    const present = (local.models || []).find((m) => m.name === model || m.model === model);
    if (present && !(plan.refreshModels || []).includes(model)) {
      known[model] = {
        digest: present.digest,
        sizeMb: Math.round(present.size / 1048576),
        details: present.details ?? null,
        localAlready: true,
        at: now(),
      };
      writeJson(file, known);
      log(`modèle ${model} : déjà présent, gardé tel quel (${String(present.digest).slice(0, 12)})`);
      continue;
    }
    if (known[model]?.error && known[model].at && Date.now() - Date.parse(known[model].at) < 3600000)
      throw new Error(`modèle ${model} en échec il y a moins d'une heure (${known[model].error})`);
    log(`modèle ${model} : téléchargement`);
    const pulled = await run(plan.tools.ollama || "ollama", ["pull", model], {
      env,
      stdout: path.join(plan.root, "modeles.log"),
      stderr: path.join(plan.root, "modeles.log"),
      timeoutMs: 3 * 3600000,
      log,
    });
    if (pulled.code !== 0) {
      known[model] = { error: `pull ${pulled.code}`, at: now() };
      writeJson(file, known);
      throw new Error(`modèle ${model} introuvable ou non téléchargé (code ${pulled.code}), voir modeles.log`);
    }
    const tags = await (await fetch(new URL("/api/tags", plan.ollama.url))).json();
    const tag = (tags.models || []).find((m) => m.name === model || m.model === model);
    const show = await (
      await fetch(new URL("/api/show", plan.ollama.url), { method: "POST", body: JSON.stringify({ model }) })
    )
      .json()
      .catch(() => ({}));
    known[model] = {
      digest: tag?.digest ?? null,
      sizeMb: tag ? Math.round(tag.size / 1048576) : null,
      details: show.details ?? tag?.details ?? null,
      capabilities: show.capabilities ?? null,
      pulledAt: now(),
      durationMs: pulled.durationMs,
    };
    writeJson(file, known);
    log(`modèle ${model} : ${known[model].sizeMb} Mo, ${String(known[model].digest).slice(0, 12)}`);
  }
}

// ---------------------------------------------------------------------------------------------------- commandes

// Bloquant : outils, copies, configuration. Avertissement : une vidéo ou des poids absents n'arrêtent que leurs campagnes.
async function verify(plan) {
  const problems = [],
    warnings = [];
  for (const [name, tool] of Object.entries(plan.tools)) {
    if (path.isAbsolute(tool) && !exists(tool)) problems.push(`outil ${name} absent : ${tool}`);
  }
  for (const code of new Set([plan.code, ...plan.campaigns.map((c) => c.code).filter(Boolean)]))
    if (!exists(path.join(code, "scripts/replay-local-stream.cjs"))) problems.push(`copie sans runners : ${code}`);
  for (const [name, video] of Object.entries(plan.videos))
    if (!exists(video.file)) warnings.push(`vidéo ${name} absente : ${video.file}`);
  for (const [name, file] of Object.entries(plan.whisperModels || {}))
    if (!exists(file)) warnings.push(`poids Whisper ${name} absents : ${file}`);
  for (const c of plan.campaigns) {
    try {
      if (c.kind === "g3") configEnv(plan, c, rolesOf(plan, c));
      if (c.ollama) ollamaEnv(plan, c);
    } catch (error) {
      problems.push(error.message);
    }
  }
  return { problems, warnings };
}

function status(plan, rest = []) {
  const state = exists(statePath(plan)) ? readJson(statePath(plan)) : null;
  const entries = indexEntries(plan).filter(
    (e) => e.step === "campagne" && Boolean(e.validation) === Boolean(rest.includes("--validation")),
  );
  const done = new Map(entries.map((e) => [e.id, e]));
  let alive = false;
  try {
    if (state?.pid) {
      process.kill(state.pid, 0);
      alive = true;
    }
  } catch {}
  console.log(
    `exécuteur : ${alive ? `en marche (pid ${state.pid})` : "arrêté"} ; phase ${state?.phase ?? "—"}` +
      `${state?.campaign ? ` ; campagne ${state.campaign} depuis ${state.startedAt}` : ""}`,
  );
  console.log(`battement : ${state?.heartbeat ?? "—"}`);
  for (const c of plan.campaigns) {
    const e = done.get(c.id);
    const r = e?.result || {};
    const detail = !e
      ? ""
      : c.kind === "g3"
        ? ` audio ${r.coveragePercent?.audio ?? "?"} % vision ${r.coveragePercent?.vision ?? "?"} %` +
          ` questions ${r.questions?.successful ?? "?"}/${r.questions?.asked ?? "?"} (${r.questions?.latencyMeanS ?? "?"} s)`
        : c.kind === "g1"
          ? ` ${r.succeeded ?? "?"}/${r.cases ?? "?"} cas, ${r.elapsedMeanMs ?? "?"} ms, ${r.evalTokensPerS ?? "?"} jetons/s`
          : "";
    const mark = e ? (e.status === "complete" ? "✓" : "✗") : state?.campaign === c.id && alive ? "▶" : "·";
    console.log(
      `${mark} ${c.id.padEnd(36)} ${e ? `${e.status}, ${Math.round((e.durationMs || 0) / 60000)} min` : ""}${detail}`,
    );
  }
  if (alive && state?.dir) {
    try {
      const report = readJson(path.join(state.dir, "out", "campaign.json"));
      const ups = report.uploads || [],
        cases = report.cases || [];
      if (ups.length)
        console.log(
          `progression : ${ups.filter((u) => (u.attempts || []).some((a) => a.status === 200)).length}/${ups.length} envois acceptés, ` +
            `questions ${(report.questions || []).filter((q) => q.status === "done").length}/${(report.questions || []).length} faites`,
        );
      else if (cases.length)
        console.log(
          `progression : ${cases.filter((c) => c.status === "succeeded").length} cas réussis sur ${cases.length}`,
        );
    } catch {
      console.log("progression : rapport du runner pas encore écrit");
    }
  }
  if (state?.dir && exists(path.join(state.dir, "systeme.jsonl"))) {
    const last = fs.readFileSync(path.join(state.dir, "systeme.jsonl"), "utf8").trim().split("\n").pop();
    console.log(`dernière mesure : ${last}`);
  }
}

async function main() {
  const [planPath, command = "etat", ...rest] = process.argv.slice(2);
  if (!planPath) {
    console.log(
      "Usage : node executeur.mjs <plan.json> verifier|lancer|etat [--validation] [--seulement a,b] [--sans-modeles] [--refaire id]",
    );
    return 2;
  }
  const plan = loadPlan(path.resolve(planPath));
  const flag = (name) => rest.includes(name),
    value = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : null);
  if (command === "etat") {
    status(plan, rest);
    return 0;
  }
  const { problems, warnings } = await verify(plan);
  if (command === "verifier") {
    for (const line of problems) console.log(`bloquant : ${line}`);
    for (const line of warnings) console.log(`avertissement : ${line}`);
    console.log(
      `${plan.campaigns.length} campagnes ; ${problems.length} problème(s) bloquant(s), ${warnings.length} avertissement(s)`,
    );
    return problems.length ? 1 : 0;
  }
  if (command !== "lancer") {
    console.log(`Commande inconnue : ${command}`);
    return 2;
  }
  fs.mkdirSync(plan.root, { recursive: true });
  const validation = flag("--validation");
  if (problems.length && !validation) {
    console.log(problems.join("\n"));
    return 1;
  }
  for (const line of warnings) console.log(`avertissement : ${line}`);
  const state = exists(statePath(plan)) ? readJson(statePath(plan)) : null;
  try {
    if (state?.pid && state.pid !== process.pid) {
      process.kill(state.pid, 0);
      console.log(`Un exécuteur tourne déjà (pid ${state.pid}).`);
      return 1;
    }
  } catch {}
  const log = journal(plan);
  const only = value("--seulement")?.split(","),
    redo = value("--refaire");
  const campaigns = plan.campaigns.filter((c) => !only || only.includes(c.id) || c.id === redo);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.on(signal, () => {
      stopping = true;
      log(`arrêt demandé (${signal}) : processus enfants arrêtés, aucune campagne suivante`);
      for (const child of children) killGroup(child, "SIGTERM");
      setState(plan, { phase: "arrete", stoppedAt: now() });
      setTimeout(() => process.exit(130), 3000);
    });
  const beat = setInterval(() => setState(plan, {}), 30000);
  log(`lancement : ${campaigns.length} campagne(s)${validation ? ", validation seule" : ""}`);
  setState(plan, { phase: "machine", campaign: null, startedAt: now(), plan: path.resolve(planPath), validation });
  await machine(plan, log);
  for (const campaign of campaigns) {
    if (stopping) break;
    try {
      await runCampaign(plan, campaign, {
        validation,
        redo: campaign.id === redo,
        log,
        noPull: flag("--sans-modeles"),
      });
    } catch (error) {
      log(`${campaign.id} : plan refusé, ${error.message}`);
      appendIndex(plan, { step: "campagne", id: campaign.id, status: "refusee", reason: error.message });
    }
    if (fs.statfsSync && exists(plan.root)) {
      const st = fs.statfsSync(plan.root),
        freeGb = (st.bavail * st.bsize) / 1073741824;
      if (freeGb < (plan.minFreeGb ?? 20)) {
        log(`disque presque plein (${freeGb.toFixed(1)} Go libres) : arrêt avant la campagne suivante`);
        break;
      }
    }
  }
  clearInterval(beat);
  if (managed) killGroup(managed.child, "SIGTERM");
  setState(plan, { phase: "fini", campaign: null, finishedAt: now() });
  log("plan terminé");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error.planError ? error.message : error);
    process.exit(1);
  },
);
