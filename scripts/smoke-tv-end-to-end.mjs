// End-to-end proof of the TV panel without the TV: blocks shaped like those of the TV go through the real
// HTTP ingestion of this tree (real RemoteMedia and ffmpeg, HeadlessRuntime in smoke mode, scripted chat
// agent), and the real panel page, in headless Chrome, is driven with the keyboard from the passages to the
// timeline, a question, its answer and the end of the session. No provider is called and the TV is not touched.
// What this is not: a proof on the TV (see the limits line printed at the end).
//   node scripts/smoke-tv-end-to-end.mjs
// The page is loaded from a temporary copy of tv/app WITHOUT its pairing file, so that the injected
// configuration is the only one it can see. The only interception is the local controller of the TV.
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.TVLENS_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Shape of a block of the TV (tv/capture.py): four 1280x720 images two seconds apart and eight seconds of sound.
const BLOCK_COUNT = 3;
const BLOCK_MS = 8000;
const FRAMES_PER_BLOCK = 4;
const FRAME_GAP_MS = 2000;
const FRAME = { width: 1280, height: 720 };
const WAV = { rate: 48000, channels: 2, seconds: BLOCK_MS / 1000, hertz: 440, amplitude: 6000 };
const IMAGE_MAX_BYTES = 1500000;
// The session clock is advanced this far past the end of a block, as for a TV that sends a finished block.
// (The server itself only tolerates a block ending up to 3000 ms ahead of its clock.)
const CLOCK_MARGIN_MS = 400;
const QUESTION = "Que vient-il d’être dit ?";
const SCRIPTED_ANSWER = "Réponse scriptée du smoke.";
const AGENT_DELAY_MS = 600;

// Every wait is bounded, and says which step did not happen.
const REQUEST_TIMEOUT_MS = 20000;
const RETRY_DELAY_MS = 1000;
const SEND_TIMEOUT_MS = 30000;
const PASSAGE_TIMEOUT_MS = 25000;
const STEP_TIMEOUT_MS = 10000;
const ANSWER_TIMEOUT_MS = 20000;
const END_TIMEOUT_MS = 25000;
const POLL_MS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class MissingStep extends Error {
  constructor(step, detail) {
    super("étape manquante « " + step + " » : " + detail);
    this.name = "MissingStep";
  }
}

// ---- Media tools -----------------------------------------------------------------------------------------------
function requireMediaTools() {
  const version = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (version.error || version.status !== 0) {
    throw new MissingStep("ffmpeg disponible", "ffmpeg est introuvable dans le PATH : le serveur ne peut pas assembler les blocs.");
  }
  const encoders = spawnSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8" }).stdout || "";
  for (const name of ["libvpx", "libopus"]) {
    if (!new RegExp("\\s" + name + "\\s").test(encoders)) {
      throw new MissingStep("ffmpeg disponible", "ffmpeg n’a pas l’encodeur " + name + ", requis pour assembler les blocs.");
    }
  }
}

// ---- Fixtures: blocks as the TV sends them -----------------------------------------------------------------------
async function makeFrame(block, index) {
  const raw = Buffer.alloc(FRAME.width * FRAME.height * 3);
  for (let y = 0; y < FRAME.height; y++) {
    for (let x = 0; x < FRAME.width; x++) {
      const p = (y * FRAME.width + x) * 3;
      raw[p] = ((x >> 2) + block * 50) & 255;
      raw[p + 1] = ((y >> 1) + index * 20) & 255;
      raw[p + 2] = (((x + y) >> 3) + 40) & 255;
    }
  }
  const png = await sharp(raw, { raw: { ...FRAME, channels: 3 } }).png({ compressionLevel: 6 }).toBuffer();
  if (png.length > IMAGE_MAX_BYTES) throw new Error("image de test trop lourde : " + png.length + " octets");
  return png.toString("base64");
}

function makeWav() {
  const samples = WAV.rate * WAV.seconds, data = Buffer.alloc(samples * WAV.channels * 2), header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(WAV.channels, 22);
  header.writeUInt32LE(WAV.rate, 24);
  header.writeUInt32LE(WAV.rate * WAV.channels * 2, 28);
  header.writeUInt16LE(WAV.channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  for (let i = 0; i < samples; i++) {
    const value = Math.round(Math.sin((2 * Math.PI * WAV.hertz * i) / WAV.rate) * WAV.amplitude);
    for (let channel = 0; channel < WAV.channels; channel++) data.writeInt16LE(value, (i * WAV.channels + channel) * 2);
  }
  return Buffer.concat([header, data]).toString("base64");
}

async function makeBlocks() {
  const audio = makeWav(), blocks = [];
  for (let block = 0; block < BLOCK_COUNT; block++) {
    const startMs = block * BLOCK_MS, frames = [];
    for (let index = 0; index < FRAMES_PER_BLOCK; index++) {
      frames.push({ atMs: startMs + index * FRAME_GAP_MS, data: await makeFrame(block, index), crop: { x: 0, y: 0, ...FRAME } });
    }
    blocks.push({ sequence: block + 1, startMs, endMs: startMs + BLOCK_MS, audio, frames });
  }
  return blocks;
}

// ---- Server of this tree, over real HTTP -----------------------------------------------------------------------------
// The session clock is the process clock plus a jump: the TV sends a block once it is finished, so the clock is
// moved just past the end of each block instead of waiting for it in real time, which would cost twenty seconds
// for nothing.
function makeClock() {
  let skew = 0;
  return { read: () => performance.now() + skew, jump: (ms) => { skew += ms; } };
}

async function composeServer(data, cleanups) {
  const { HeadlessRuntime } = require("../runtime/headless-runtime.cjs");
  const { RemoteServer } = require("../server/http.cjs");
  const { RemoteMedia } = require("../adapters/remote-media.cjs");
  const clock = makeClock(), token = randomBytes(32).toString("hex");
  const agent = {
    async prepare() {},
    async close() {},
    async answer({ onProgress }) {
      onProgress({ message: "Examen du contexte…" });
      await sleep(AGENT_DELAY_MS);
      return { answer: SCRIPTED_ANSWER, kind: "explanation", citations: [], limits: [], sources: [] };
    },
  };
  const runtime = new HeadlessRuntime({
    userData: data, sessionsRoot: path.join(data, "sessions"), config: {}, transcriptionSettings: { save: async (value) => value },
    selectedModels: { observationModel: "fake", inspectionModel: "fake", codexModel: "" }, codexBinary: "codex",
    smoke: true, agent, readClock: clock.read,
  });
  cleanups.push(() => runtime.close());
  const live = await new RemoteServer({ runtime, media: new RemoteMedia({ ffmpeg: "ffmpeg" }), token }).listen(0, "127.0.0.1");
  cleanups.push(() => live.close());
  return { clock, token, url: live.url };
}

function makeApi(url, token) {
  return async (route, body) => {
    const response = await fetch(url + route, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { status: response.status, value: await response.json().catch(() => null) };
  };
}

// ---- The page ---------------------------------------------------------------------------------------------------------
async function copyPanel(workdir) {
  const copy = path.join(workdir, "app");
  await fs.cp(path.join(root, "tv/app"), copy, { recursive: true, filter: (source) => path.basename(source) !== "connection.js" });
  if (await fs.access(path.join(copy, "connection.js")).then(() => true, () => false)) {
    throw new Error("la copie du panneau contient un fichier d’appairage");
  }
  return pathToFileURL(path.join(copy, "index.html")).href;
}

// Le contrôleur local confirme la disposition et annonce une capture arrêtée.
// Les routes /ambient retirées gardent une réponse 404 ; le panneau ne les appelle plus.
async function interceptController(page) {
  const controller = { mode: "chat", requestId: null, calls: [] };
  await page.route("http://127.0.0.1:8788/**", (route) => {
    const name = new URL(route.request().url()).pathname, json = (status, body) => route.fulfill({ status, json: body });
    controller.calls.push(route.request().method() + " " + name);
    if (name.startsWith("/ambient")) return json(404, {});
    if (name.startsWith("/panel/")) {
      Object.assign(controller, { mode: name.split("/").pop(), requestId: "request-" + controller.calls.length });
      return json(200, { id: controller.requestId, mode: controller.mode });
    }
    if (name === "/panel") return json(200, { active: true, mode: controller.mode, requestId: controller.requestId });
    return json(200, { active: false, stopping: false, exitCode: null, report: {} });
  });
  return controller;
}

async function openPanel(browser, server, index) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const seen = { errors: [], thumbnails: [], questions: [] };
  page.on("pageerror", (error) => seen.errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(server.url + "/v1/thumbnail/")) {
      seen.thumbnails.push({ status: response.status(), type: response.headers()["content-type"] || "" });
    }
  });
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url() === server.url + "/v1/questions") seen.questions.push(request.postDataJSON());
  });
  await page.addInitScript((config) => {
    window.TVLENS_REMOTE = config;
    window.close = () => {};
  }, { url: server.url, token: server.token });
  const controller = await interceptController(page);
  await page.goto(index);
  return { page, seen, controller };
}

// What the page shows, for the message of a step that did not happen.
async function describePage(page) {
  return page.evaluate(() => {
    const state = window.tvlensPanel && window.tvlensPanel.state(), focus = document.activeElement;
    const segments = ((state && state.session && state.session.segments) || []).map((segment) => segment.status);
    return "mode " + document.body.dataset.mode + ", focus " + (focus.id || focus.className || focus.tagName) +
      ", passages [" + segments.join(",") + "], cartes " + document.querySelectorAll("#timeline-rail .timeline-card").length +
      ", connexion « " + document.querySelector("#connection").textContent + " »";
  }).catch((error) => "page illisible : " + error.message);
}

async function until(page, step, predicate, argument, timeoutMs = STEP_TIMEOUT_MS) {
  try {
    await page.waitForFunction(predicate, argument, { timeout: timeoutMs, polling: POLL_MS });
  } catch (error) {
    const cause = error.name === "TimeoutError" ? "non atteint en " + timeoutMs + " ms" : error.message;
    throw new MissingStep(step, cause + " (" + (await describePage(page)) + ")");
  }
}

async function press(page, key, focus, step) {
  await page.keyboard.press(key);
  await until(page, step, (selector) => document.activeElement.matches(selector), focus);
}

// ---- Steps ------------------------------------------------------------------------------------------------------------
async function waitForPanel(page) {
  await until(page, "panneau affiché", () => window.tvlensPanel && window.tvlensPanel.stats.renders > 0, null);
}

async function startSession(api) {
  const started = await api("/v1/session/start", {});
  if (started.status !== 200 || !started.value.id) {
    throw new MissingStep("démarrage de la session", "réponse " + started.status + " de /v1/session/start");
  }
  return started.value.id;
}

// The session clock reaches the end of the block, as it would after eight seconds of capture.
async function reachEndOfBlock(api, clock, endMs) {
  const state = await api("/v1/state?view=chat");
  const elapsed = state.value && state.value.session ? state.value.session.elapsedMs : 0;
  if (endMs + CLOCK_MARGIN_MS > elapsed) clock.jump(endMs + CLOCK_MARGIN_MS - elapsed);
}

// Like tv/transport.py: the session is read, then the block is sent; a 429 is retried with the same sequence.
async function sendBlock(api, sessionId, block, number) {
  const body = { sessionId, ...block }, deadline = Date.now() + SEND_TIMEOUT_MS;
  for (;;) {
    await api("/v1/session");
    const reply = await api("/v1/segments", body);
    if (reply.status === 200) return reply.value.id;
    const refusal = "réponse " + reply.status + (reply.value && reply.value.error ? " : " + reply.value.error : "");
    if (reply.status !== 429 || Date.now() > deadline) throw new MissingStep("envoi du bloc " + number, refusal);
    await sleep(RETRY_DELAY_MS);
  }
}

// Proved by the state the page holds, not by the answer of the server nor by the cards.
async function waitForReadyPassages(page, count) {
  await until(page, "passage " + count + " prêt dans la vue du panneau", (wanted) => {
    const state = window.tvlensPanel.state(), segments = (state && state.session && state.session.segments) || [];
    return segments.filter((segment) => segment.status === "ready").length >= wanted;
  }, count, PASSAGE_TIMEOUT_MS);
}

async function sendBlocksAndAwaitPassages(api, clock, page, sessionId, blocks) {
  const received = [];
  for (const [index, block] of blocks.entries()) {
    await reachEndOfBlock(api, clock, block.endMs);
    received.push(await sendBlock(api, sessionId, block, index + 1));
    await waitForReadyPassages(page, index + 1);
  }
  const summary = await page.evaluate(() => {
    const state = window.tvlensPanel.state(), session = state.session;
    return { ready: session.segments.filter((segment) => segment.status === "ready").length, passages: session.coverage.passages };
  });
  if (summary.ready !== BLOCK_COUNT || summary.passages !== BLOCK_COUNT) {
    throw new MissingStep("trois passages prêts dans la vue du panneau", "état de la page : " + JSON.stringify(summary));
  }
  return { received: received.length, passages: summary.ready };
}

// Keyboard path of the remote: from the question row, up to the conversation, up to the memory button, OK.
async function openTimeline(page) {
  await press(page, "ArrowUp", "#conversation", "focus sur la conversation");
  await press(page, "ArrowUp", "#show-timeline", "focus sur le bouton de la frise");
  await page.keyboard.press("Enter");
  await until(page, "bascule vers la frise", () => document.body.dataset.mode === "timeline" && !document.body.dataset.switching, null);
}

async function checkTimelineCards(page, seen) {
  await until(page, "frise : au moins une carte dessinée", () => document.querySelectorAll("#timeline-rail .timeline-card").length > 0, null);
  await until(page, "frise : vignette chargée (largeur naturelle non nulle)", () => {
    const image = document.querySelector("#timeline-rail .timeline-card img");
    return Boolean(image && image.naturalWidth > 0);
  }, null);
  const cards = await page.locator("#timeline-rail .timeline-card").count();
  const width = await page.evaluate(() => document.querySelector("#timeline-rail .timeline-card img").naturalWidth);
  const served = seen.thumbnails.filter((item) => item.status === 200 && /^image\/jpeg/.test(item.type));
  if (!served.length) {
    throw new MissingStep("vignette servie par le serveur", "aucune réponse 200 image/jpeg sur /v1/thumbnail : " + JSON.stringify(seen.thumbnails));
  }
  return { cards, width };
}

async function openAndCloseDetail(page) {
  await press(page, "Enter", "#detail-words", "détail du passage ouvert");
  await until(page, "détail : titre et image", () => {
    return document.querySelector("#detail-title").textContent.length > 0 && document.querySelector("#detail-image").naturalWidth > 0;
  }, null);
  await page.keyboard.press("Escape");
  await until(page, "détail fermé, retour sur une carte", () => document.querySelector("#moment-detail").hidden &&
    document.activeElement.matches(".timeline-card"), null);
}

// Back to the chat by the toolbar of the timeline (up to the live button, right to the chat button, OK).
async function backToChat(page) {
  await press(page, "ArrowUp", "#timeline-live", "barre de la frise : bouton direct");
  await press(page, "ArrowRight", "#timeline-chat", "barre de la frise : bouton chat");
  await page.keyboard.press("Enter");
  await until(page, "retour à la conversation", () => document.body.dataset.mode === "chat" && !document.body.dataset.switching, null);
}

async function askQuestion(page, seen) {
  await page.locator("#question").fill(QUESTION);
  await page.keyboard.press("Enter");
  await until(page, "question envoyée par la page", (text) => document.querySelector("#conversation").textContent.includes(text), QUESTION);
  await until(page, "réponse scriptée affichée", () => /Terminé/.test(document.querySelector("#conversation").textContent) &&
    document.querySelectorAll("#conversation .chat-answer").length > 0, null, ANSWER_TIMEOUT_MS);
  const shown = await page.locator("#conversation").textContent();
  const asked = shown.indexOf(QUESTION), answered = shown.indexOf(SCRIPTED_ANSWER);
  if (asked < 0 || answered < asked) {
    throw new MissingStep("réponse scriptée affichée après la question", "texte de la conversation : " + shown.replace(/\s+/g, " ").trim());
  }
  if (!seen.questions.some((body) => body.question === QUESTION)) {
    throw new MissingStep("question posée par la page", "aucune requête POST /v1/questions observée");
  }
}

// From the chat to the timeline again, then the toolbar: live, chat, sessions, end; the harmless choice is focused first.
async function endSession(page, controller) {
  await page.keyboard.press("Escape");
  await press(page, "ArrowUp", "#conversation", "focus sur la conversation après la réponse");
  await press(page, "ArrowUp", "#show-timeline", "focus sur le bouton de la frise après la réponse");
  await page.keyboard.press("Enter");
  await until(page, "retour à la frise", () => document.body.dataset.mode === "timeline" && !document.body.dataset.switching, null);
  await press(page, "ArrowUp", "#timeline-live", "barre de la frise : bouton direct");
  for (const target of ["#timeline-chat", "#timeline-sessions", "#timeline-end"]) {
    await press(page, "ArrowRight", target, "barre de la frise : " + target);
  }
  await page.keyboard.press("Enter");
  await until(page, "dialogue de fin ouvert", () => document.querySelector("#end-session-dialog").open &&
    document.activeElement.id === "end-cancel", null);
  await press(page, "ArrowRight", "#end-confirm", "dialogue de fin : choix de confirmation");
  await page.keyboard.press("Enter");
  await until(page, "session terminée depuis le panneau", () => !document.querySelector("#end-session-dialog").open &&
    window.tvlensTimeline.sessionId === null, null, END_TIMEOUT_MS);
  if (!controller.calls.includes("POST /capture/stop")) {
    throw new MissingStep("arrêt de la capture demandé au contrôleur", "appels vus : " + controller.calls.join(", "));
  }
}

async function checkSessionList(api, sessionId, passages) {
  const list = await api("/v1/sessions");
  const entry = ((list.value && list.value.sessions) || []).find((item) => item.id === sessionId);
  if (list.status !== 200 || !entry || list.value.current !== null || entry.state !== "archived" || entry.passages !== passages) {
    throw new MissingStep("session terminée puis listée par /v1/sessions", "réponse : " + JSON.stringify(list.value));
  }
}

// ---- Run --------------------------------------------------------------------------------------------------------------
async function runPath(browser, workdir, cleanups) {
  const blocks = await makeBlocks();
  const server = await composeServer(path.join(workdir, "data"), cleanups);
  const api = makeApi(server.url, server.token);
  const { page, seen, controller } = await openPanel(browser, server, await copyPanel(workdir));
  await waitForPanel(page);
  const sessionId = await startSession(api);
  const { received, passages } = await sendBlocksAndAwaitPassages(api, server.clock, page, sessionId, blocks);
  await openTimeline(page);
  const timeline = await checkTimelineCards(page, seen);
  await openAndCloseDetail(page);
  await backToChat(page);
  await askQuestion(page, seen);
  await endSession(page, controller);
  await checkSessionList(api, sessionId, passages);
  if (seen.errors.length) throw new MissingStep("page sans erreur", seen.errors.join(" | "));
  return { received, passages, timeline };
}

function report({ received, passages, timeline }, elapsedMs) {
  console.log(
    "PASS: " + received + " blocs reçus par le serveur réel (RemoteMedia et ffmpeg réels) ; " + passages +
      " passages prêts dans la vue du panneau ; frise de " + timeline.cards + " carte(s) avec vignette servie par le serveur (largeur naturelle " +
      timeline.width + ") ; détail ouvert et fermé au clavier ; réponse scriptée affichée après la question posée par la page ; " +
      "session terminée depuis le panneau puis listée archivée par /v1/sessions (" + (elapsedMs / 1000).toFixed(1) + " s)",
  );
  console.log(
    "LIMITES: ne prouve ni le moteur de navigateur de webOS (Chrome de bureau ici), ni les codes réels des touches, " +
      "ni l’affichage par-dessus la vidéo, ni la capture réelle de la TV (tv/capture.py) et son contrôleur local, " +
      "remplacé par une réponse fixe.",
  );
}

async function runCleanups(cleanups) {
  for (const cleanup of cleanups.reverse()) {
    await cleanup().catch((error) => console.error("nettoyage : " + error.message));
  }
}

async function main() {
  requireMediaTools();
  const started = Date.now(), cleanups = [];
  try {
    const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-e2e-"));
    cleanups.push(() => fs.rm(workdir, { recursive: true, force: true }));
    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    cleanups.push(() => browser.close());
    report(await runPath(browser, workdir, cleanups), Date.now() - started);
  } finally {
    await runCleanups(cleanups);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error("ÉCHEC : " + error.message);
    process.exit(1);
  },
);
