// Contrôle réel T273 : des blocs issus d'une vidéo convertie, rattachés à une vraie session d'un serveur headless
// local et envoyés au rythme réel (chaque bloc après la fin de son intervalle), sont-ils acceptés par /v1/segments
// puis traités en passages ? Le rattachement (identifiant, séquence, translation des temps) est fait ici, comme T259.
// Usage : node envoyer-blocs.mjs <dossier de préparation> <dossier de données> <sortie.json> [nombre de blocs]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [prepared, data, out, countArg = "4"] = process.argv.slice(2);
const ROOT = "/Users/Dabi/Documents/ISN/tvlens";
const PORT = Number(process.env.QA_PORT || 8804);
const index = JSON.parse(fs.readFileSync(path.join(prepared, "blocks.json"), "utf8"));
const entries = (index.blocks || index.entries || index).slice(0, Number(countArg));
const env = { ...process.env, TVLENS_SERVER_DATA: data, TVLENS_PORT: String(PORT), TVLENS_BIND: "127.0.0.1" };
const report = { startedAt: new Date().toISOString(), blocks: [], passages: null };
const save = () => fs.writeFileSync(out, JSON.stringify(report, null, 2));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn("node", ["server/main.cjs"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
let logs = "";
server.stdout.on("data", (d) => { logs += d; });
server.stderr.on("data", (d) => { logs += d; });
const token = () => fs.readFileSync(path.join(data, "device-token"), "utf8").trim();
async function call(method, route, body) {
  const res = await fetch(`http://127.0.0.1:${PORT}${route}`, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" } });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text: json ? undefined : text.slice(0, 300) };
}

try {
  for (let i = 0; i < 120 && !/TVLens server/.test(logs); i++) {
    if (server.exitCode !== null) throw Error("serveur arrêté : " + logs.slice(-600));
    await wait(500);
  }
  const started = await call("POST", "/v1/session/start", {});
  const state = await call("GET", "/v1/state");
  const sessionId = state.json?.session?.id || state.json?.sessionId || started.json?.id;
  const origin = Date.now() - (state.json?.elapsedMs ?? 0);
  report.session = { id: sessionId, start: started.status, keys: Object.keys(started.json || {}) };
  const offset = Date.now() - origin + 500;
  for (const [sequence, entry] of entries.entries()) {
    const file = path.join(prepared, entry.body?.path || entry.path || entry.file);
    const body = JSON.parse(fs.readFileSync(file, "utf8"));
    const shift = (ms) => ms + offset;
    const attached = { ...body, sessionId, sequence, startMs: shift(body.startMs), endMs: shift(body.endMs),
      frames: body.frames.map((f) => ({ ...f, atMs: shift(f.atMs) })) };
    await wait(Math.max(0, origin + attached.endMs + 300 - Date.now()));
    const sent = await call("POST", "/v1/segments", attached);
    report.blocks.push({ sequence, source: path.relative(prepared, file), startMs: body.startMs, endMs: body.endMs,
      frames: body.frames.length, audio: Boolean(body.audio), status: sent.status, answer: sent.json || sent.text });
    console.log(`bloc ${sequence} ${body.startMs}–${body.endMs} ms, ${body.frames.length} images, son ${Boolean(body.audio)} → ${sent.status}`);
    save();
  }
  for (let i = 0; i < 60; i++) {
    const s = await call("GET", "/v1/state");
    const segments = s.json?.segments || s.json?.session?.segments || [];
    report.passages = segments.map((p) => ({ id: p.id, status: p.status, summary: p.observation?.summary?.slice(0, 160),
      transcript: p.observation?.transcript?.slice(0, 160) }));
    if (segments.length >= entries.length && segments.every((p) => p.status !== "pending" && p.status !== "analyzing")) break;
    await wait(3000);
  }
  report.ended = (await call("POST", "/v1/session/end", {})).status;
} catch (e) {
  report.error = String(e.message || e).slice(0, 800);
  console.log("ERREUR", report.error);
} finally {
  report.serverLog = logs.split("\n").filter((l) => /rror|TVLENS_[A-Z_]{4,}|refus/i.test(l)).slice(-20).map((l) => l.slice(0, 300));
  save();
  server.kill("SIGTERM");
  await wait(1500);
  if (server.exitCode === null) server.kill("SIGKILL");
  console.log("passages", JSON.stringify((report.passages || []).map((p) => p.status)), "| rapport", out);
}
