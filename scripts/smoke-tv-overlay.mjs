// Browser proof of the TV panel additions: bottom-left card with the panel open, surveillance view and
// sessions driven with the remote keys, long question, light polling with revalidation.
// What this is: tv/app in desktop Chrome, on a TEMPORARY COPY WITHOUT connection.js (a real pairing file
// in the tree would send the page to the real server with the real token), every request intercepted,
// the page clock driven by hand. What this is not: a proof on the TV (composition over the video plane,
// real key codes, dictation, sound, advertisements, subtitles are native matters).
//   node scripts/smoke-tv-overlay.mjs            screenshots go to TVLENS_SMOKE_OUT (default: a temp dir)
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = path.resolve(process.env.TVLENS_SMOKE_TMP || os.tmpdir());
const out = path.resolve(process.env.TVLENS_SMOKE_OUT || (await fs.mkdtemp(path.join(temporary, "tvlens-smoke-overlay-"))));
await fs.mkdir(out, { recursive: true });
const copy = await fs.mkdtemp(path.join(temporary, "tvlens-tv-app-"));
// TVLENS_SMOKE_APP points at another application directory (a packaged copy, or a deliberately broken one
// to check that this smoke notices).
await fs.cp(path.resolve(process.env.TVLENS_SMOKE_APP || path.join(root, "tv/app")), copy, { recursive: true, filter: (source) => path.basename(source) !== "connection.js" });
assert.equal(await fs.access(path.join(copy, "connection.js")).then(() => true, () => false), false, "the copy holds no pairing file");
const overlayModule = await fs.access(path.join(copy, "surveillance-overlay.js")).then(() => true, () => false);
const index = pathToFileURL(path.join(copy, "index.html")).href;

// Video rectangle of each layout in logical pixels (prototypes/lg-remote/runtime/panel.py): the card must never touch it.
const VIDEO = { chat: { x: 0, y: 135, width: 1440, height: 810 }, timeline: { x: 320, y: 0, width: 1280, height: 720 } };
const SESSION = "11111111-1111-4111-8111-111111111111",
  ARCHIVE = "22222222-2222-4222-8222-222222222222",
  OLD = "33333333-3333-4333-8333-333333333333";
// The server clock sits years away from the page clock on purpose: an elapsed time computed from the
// wall clock of the TV would be absurd, and the assertions would see it.
const SERVER_T0 = Date.UTC(2031, 0, 1),
  PAGE_T0 = new Date("2026-10-13T20:00:00Z");
const frame = await sharp({ create: { width: 320, height: 180, channels: 3, background: { r: 46, g: 74, b: 92 } } }).jpeg().toBuffer();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const card = (seq, text, sources, at) => ({
  id: "lot-" + seq, kind: "verification", label: "Sources consultées", seq, text,
  claimIds: ["claim-" + seq], interval: { startMs: 760000, endMs: 768000 },
  sources, origin: [{ claimId: "claim-" + seq, passageId: "moment-96", startMs: 760000, endMs: 768000, quote: "le chômage est à 7,4 %" }],
  assessments: [{ claimId: "claim-" + seq, assessment: "supported", label: "Concorde avec les sources" }],
  publishedAtMs: 770000, finishedAt: at,
});
const SOURCES = [
  { url: "https://www.insee.fr/fr/statistiques/chomage", title: "Taux de chômage au deuxième trimestre", publisher: "Insee" },
  { url: "https://www.lemonde.fr/economie/chomage", title: "Le chômage se stabilise", publisher: "Le Monde" },
];
const SIGNAL_TEXT = "Le plateau revient sur la réforme des retraites.";
const surveillanceOff = () => ({
  version: 1, enabled: false, sessionId: SESSION, restored: false, activation: null,
  activity: { state: "idle", label: "Surveillance inactive.", detecting: false, running: 0, waiting: 0, late: false },
  coverage: { total: 0 }, backlog: { late: false, reason: null, passagesPending: 0, passagesFailed: 0, failure: null, claimsWaiting: 0, oldestClaimWaitMs: 0 },
  counts: { detected: 0, queued: 0, running: 0, sourced: 0, undetermined: 0, error: 0, cancelled: 0, noted: 0 },
  totals: { claims: 0, lots: 0, gaps: 0, rejected: 0 }, overlay: { seq: 0, cards: [] }, signals: { seq: 0, cards: [] }, error: null,
});
const surveillanceOn = (overlaySeq, cards) => ({
  ...surveillanceOff(), enabled: true,
  activation: { id: "act-1", instruction: "Vérifie les chiffres annoncés.", t0Ms: 600000, startedAt: SERVER_T0 - 170000, stoppedAt: null, stopReason: null },
  activity: { state: "listening", label: "Surveillance active.", detecting: false, running: 0, waiting: 0, late: false },
  counts: { detected: 0, queued: 0, running: 0, sourced: overlaySeq, undetermined: 0, error: 0, cancelled: 0, noted: 0 },
  overlay: { seq: overlaySeq, cards },
});

function makeServer(options = {}) {
  const server = {
    revision: 1, nowMs: SERVER_T0, requests: [], posts: [], gets: [], holdQuestions: null, refuse: {},
    session: { id: SESSION, accepting: true, asking: false, analyzing: false, elapsedMs: 772000, capturedThroughMs: 770000, analyzedThroughMs: 768000, analysisLagMs: 2000, contextThroughMs: 768000,
      retentionMs: null, retention: "until-deleted", readOnly: false, pending: 0, audioPending: 0, visionPending: 0, lastError: null, coverage: { passages: 96 }, title: "Session du 13 oct., 21:04", passages: 96, gapCount: 0, gaps: [], audioGapCount: 0, visionGapCount: 0 },
    segments: [{ id: "moment-95", startMs: 752000, endMs: 760000, status: "ready", available: true }, { id: "moment-96", startMs: 760000, endMs: 768000, status: "ready", available: true }],
    cards: [1, 2].map((n) => ({ id: "moment-" + (94 + n), title: "Débat sur l’emploi " + n, startMs: 744000 + n * 8000, endMs: 752000 + n * 8000, summary: "Deux invités discutent des chiffres du chômage.", segmentIds: ["moment-" + (94 + n)], thumbnailId: "moment-" + (94 + n), status: "ready", pending: 0, failed: 0 })),
    jobs: [], surveillance: options.surveillance || surveillanceOff(),
    storage: { state: "ok", freeBytes: 9 * 1024 ** 3, minFreeBytes: 1024 ** 3, sessionBytes: 400 * 1024 ** 2, bytesPerMinute: 4 * 1024 ** 2, remainingMinutes: 2000 },
    history: [], details: {},
    library: null,
  };
  server.publish = (change) => { if (change) change(server); server.revision++; };
  server.body = (view) => ({
    ...(view ? { view } : {}), revision: server.revision, serverNowMs: server.nowMs, transcription: { language: "fr" }, surveillance: server.surveillance, storage: server.storage,
    session: server.session && (view === "chat" ? { ...server.session } : { ...server.session, segments: server.segments, unavailableIds: [], ...(view ? {} : { history: [] }) }),
    chat: { jobs: server.jobs, total: server.jobs.length, timeoutMs: 300000 },
    ...(view === "chat" ? {} : { timeline: { sessionId: server.session ? server.session.id : null, cards: server.session ? server.cards : [] }, captureGaps: [], captureGapCount: 0 }),
  });
  return server;
}
function makeController(options = {}) {
  return {
    calls: [], capture: { active: false, stopping: false, exitCode: null, report: {} },
    // video: rectangle of the picture per layout, as a recent panel launcher publishes it (absent: older launcher).
    panel: { active: true, mode: "chat", requestId: null, pending: null, hold: false, video: options.video || null },
  };
}

async function open(browser, options = {}) {
  const server = options.server || makeServer(options), controller = options.controller || makeController(options);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: PAGE_T0 });
  await page.addInitScript(() => {
    window.TVLENS_REMOTE = { url: "http://server.test", token: "x".repeat(64) };
    window.__closed = 0;
    window.close = () => { window.__closed++; };
    // Sound and media: the panel must never create any of these.
    window.__media = 0;
    for (const name of ["AudioContext", "webkitAudioContext", "Audio"]) if (window[name]) { const Original = window[name]; window[name] = function (...args) { window.__media++; return new Original(...args); }; }
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function (tag, ...rest) { if (/^(audio|video)$/i.test(tag)) window.__media++; return create.call(this, tag, ...rest); };
  });
  await page.route("http://127.0.0.1:8788/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method(), name = url.pathname;
    controller.calls.push(method + " " + name);
    const send = (status, json) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
    if (name.startsWith("/ambient")) return send(404, {});
    if (name.startsWith("/panel/")) {
      const request = { id: "request-" + controller.calls.length, mode: name.split("/").pop() };
      if (controller.panel.hold) controller.panel.pending = request;
      else Object.assign(controller.panel, { mode: request.mode, requestId: request.id });
      return send(200, request);
    }
    if (name === "/panel") return send(200, { active: controller.panel.active, mode: controller.panel.mode, requestId: controller.panel.requestId, ...(controller.panel.video ? { video: controller.panel.video[controller.panel.mode] } : {}) });
    if (name === "/capture/start") Object.assign(controller.capture, { active: true, report: { connection: "capturing", sent: 0, limits: { seconds: 21600, idleSeconds: 600 } } });
    if (name === "/capture/stop") Object.assign(controller.capture, { active: false, report: { stopped: true, stopReason: "stopped", limits: { seconds: 21600, idleSeconds: 600 } } });
    return send(200, controller.capture);
  });
  await page.route("http://server.test/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method(), name = url.pathname;
    const cors = { "access-control-allow-origin": request.headers().origin || "*", "access-control-expose-headers": "ETag" };
    const send = (status, json, headers = {}) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json), headers: { ...cors, ...headers } });
    if (method === "GET" && name === "/v1/state") {
      const view = url.searchParams.get("view"), held = request.headers()["if-none-match"] || null;
      // An older server routes on the exact URL, knows no view and sends no entity tag.
      if (options.legacyServer) {
        server.requests.push({ url: name + url.search, view, ifNoneMatch: held, status: view ? 404 : 200 });
        // The complete state as that server builds it: no surveillance, no storage, no server clock, no revision.
        const { surveillance, storage, serverNowMs, revision, ...former } = server.body(null);
        return view ? send(404, { error: "Route inconnue." }) : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(former) });
      }
      const tag = `"smoke-${view || "full"}-${server.revision}"`, status = held === tag ? 304 : 200;
      server.requests.push({ url: name + url.search, view, ifNoneMatch: held, status, atMs: server.nowMs });
      if (status === 304) return route.fulfill({ status: 304, headers: { ...cors, etag: tag } });
      return send(200, server.body(view), { etag: tag });
    }
    if (method === "GET") {
      server.gets.push(name);
      if (name === "/v1/sessions") return server.library ? send(200, server.library()) : send(404, { error: "Route inconnue." });
      if (name.startsWith("/v1/thumbnail/")) return route.fulfill({ contentType: "image/jpeg", body: frame, headers: cors });
      return send(404, { error: "Route inconnue." });
    }
    const body = request.postDataJSON();
    server.posts.push({ path: name, body });
    if (server.refuse[name]) return send(server.refuse[name].status, server.refuse[name].body);
    if (name === "/v1/questions") {
      if (server.holdQuestions) await server.holdQuestions;
      const id = "deep-" + (server.jobs.length + 1), running = server.jobs.some((job) => job.status === "running");
      server.publish(() => server.jobs.push({ id, question: body.question, anchorMs: body.anchorMs, status: running ? "queued" : "running", createdAt: server.nowMs, ...(running ? {} : { startedAt: server.nowMs }), timeoutMs: 300000, message: running ? "" : "Codex examine le contexte…",
        availability: { startMs: 472000, throughMs: 768000, anchorMs: body.anchorMs, passages: 37, lastPassage: { id: "moment-96", startMs: 760000, endMs: 768000 } } }));
      return send(200, { id });
    }
    const cancel = /^\/v1\/questions\/(deep-\d+)\/cancel$/.exec(name);
    if (cancel) {
      const job = server.jobs.find((item) => item.id === cancel[1]), active = job && ["queued", "running"].includes(job.status);
      if (active) server.publish(() => {
        Object.assign(job, { status: "cancelled", message: "Question annulée.", finishedAt: server.nowMs });
        const next = server.jobs.find((item) => item.status === "queued");
        if (next && !server.jobs.some((item) => item.status === "running")) Object.assign(next, { status: "running", startedAt: server.nowMs, message: "Codex examine le contexte…" });
      });
      return send(200, { cancelled: Boolean(active), status: job ? job.status : null });
    }
    if (name === "/v1/surveillance/start") { server.publish(() => { server.surveillance = { ...surveillanceOn(0, []), activation: { id: "act-1", instruction: body.instruction, t0Ms: server.session.elapsedMs, startedAt: server.nowMs, stoppedAt: null, stopReason: null } }; }); return send(200, { surveillance: server.surveillance }); }
    if (name === "/v1/surveillance/stop") { server.publish(() => { server.surveillance = { ...server.surveillance, enabled: false, activity: { ...server.surveillance.activity, state: "stopped", label: "Surveillance arrêtée." } }; }); return send(200, { surveillance: server.surveillance }); }
    if (name === "/v1/surveillance/history") {
      const rest = body.beforeSeq ? server.history.filter((item) => item.seq < body.beforeSeq) : server.history, items = rest.slice(0, body.limit || 20);
      return send(200, { sessionId: body.sessionId, items, nextBeforeSeq: rest.length > items.length ? items.at(-1).seq : null, counts: server.surveillance.counts, totals: { claims: server.history.length, lots: 2, items: server.history.length } });
    }
    if (name === "/v1/surveillance/detail") return server.details[body.id] ? send(200, { sessionId: body.sessionId, id: body.id, ...server.details[body.id] }) : send(404, { error: "Élément de surveillance introuvable.", code: "not-found" });
    if (name === "/v1/session/pause") { server.publish(() => { server.session.accepting = false; }); return send(200, { paused: true }); }
    if (name === "/v1/session/end" || name === "/v1/sessions/close") { const id = server.session && server.session.id; server.publish(() => { server.session = null; server.jobs = []; server.surveillance = surveillanceOff(); }); return send(200, { [name.endsWith("end") ? "ended" : "closed"]: true, id, archived: true }); }
    const stored = /^\/v1\/sessions\/([^/]+)\/(open|resume|delete)$/.exec(name);
    if (stored) return send(200, server.sessionAction(stored[1], stored[2]));
    if (name === "/v1/settings/transcription") return send(200, body);
    return send(404, { error: "Route inconnue." });
  });
  await page.goto(index);
  await page.clock.pauseAt(new Date(PAGE_T0.getTime() + 5000));
  const tools = {
    page, server, controller, errors,
    // The page clock and the server clock advance together, in steps short enough for every timer; the
    // short real pause lets the intercepted requests of each step settle.
    async advance(ms) {
      for (let left = ms; left > 0; left -= 250) {
        const step = Math.min(250, left);
        server.nowMs += step;
        if (server.session && server.session.accepting) server.session.elapsedMs += step;
        await page.clock.runFor(step);
        await sleep(12);
      }
    },
    async settle() { await sleep(25); await page.evaluate(() => 0); await sleep(25); },
    async until(check, label, argument) {
      for (let i = 0; i < 120; i++) { if (await page.evaluate(check, argument)) return; await tools.advance(250); }
      assert.fail("attendu : " + label);
    },
    async press(key, times = 1) { for (let i = 0; i < times; i++) { await page.keyboard.press(key); await tools.settle(); } },
    // Back of the LG remote (code 461), sent to the focused element as the TV does.
    async back() { await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 461, bubbles: true, cancelable: true }))); await tools.settle(); },
    focused: () => page.evaluate(() => document.activeElement.id || document.activeElement.dataset.id || document.activeElement.tagName),
    text: (selector) => page.evaluate((s) => { const node = document.querySelector(s); return node ? node.textContent.replace(/\s+/g, " ").trim() : null; }, selector),
    box: (selector) => page.evaluate((s) => { const node = document.querySelector(s); if (!node || node.hidden || !node.getClientRects().length) return null; const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }, selector),
    serverPosts: (suffix) => server.posts.filter((post) => post.path.endsWith(suffix)),
    controllerCalls: (pattern) => controller.calls.filter((call) => pattern.test(call)),
    // A stand-in for the video plane, only to make the screenshots readable: never part of an assertion.
    async shot(name, layout) {
      await page.evaluate(({ rect, src }) => {
        let node = document.querySelector("#video-fixture");
        if (!node) { node = document.createElement("img"); node.id = "video-fixture"; node.src = src; document.body.appendChild(node); document.body.style.background = "#000"; }
        node.style.cssText = `position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;z-index:-1`;
      }, { rect: VIDEO[layout], src: "data:image/jpeg;base64," + frame.toString("base64") });
      await page.screenshot({ path: path.join(out, name + ".png") });
      await page.evaluate(() => { document.querySelector("#video-fixture").remove(); document.body.style.background = ""; });
    },
  };
  // window.tvlensPanel est l’interface d’observation du panneau, documentée dans tv/app/companion.js juste au-dessus de son affectation.
  await tools.until(() => window.tvlensPanel && window.tvlensPanel.stats.renders > 0, "premier état affiché");
  return tools;
}
const intersects = (a, b) => a.left < b.x + b.width && a.right > b.x && a.top < b.y + b.height && a.bottom > b.y;
const STARTERS = /POST \/capture\/start$/;
const done = [];

const browser = await chromium.launch({ executablePath: process.env.TVLENS_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
try {
  // ---- 1. Light polling: If-None-Match, 304 without redraw, redraw after a change ---------------
  {
    const t = await open(browser, { surveillance: surveillanceOn(3, [card(3, "Résultat publié avant l’ouverture du panneau.", SOURCES, SERVER_T0 - 30000)]) });
    const { page, server, controller } = t;
    const first = server.requests[0];
    assert.deepEqual([first.url, first.ifNoneMatch, first.status], ["/v1/state?view=panel", null, 200], "first poll: panel view, no tag yet");
    await page.evaluate(() => {
      window.__mutations = [];
      new MutationObserver((records) => { for (const record of records) window.__mutations.push(record.type + ":" + (record.target.id || record.target.parentNode && record.target.parentNode.id || record.target.nodeName)); })
        .observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    });
    const before = await page.evaluate(() => ({ ...window.tvlensPanel.stats })), from = server.requests.length;
    await t.advance(5000);
    const after = await page.evaluate(() => ({ ...window.tvlensPanel.stats })), idle = server.requests.slice(from);
    assert.ok(idle.length >= 4 && idle.length <= 6, "idle cadence: about one poll per second, got " + idle.length);
    assert.ok(idle.every((r) => r.url === "/v1/state?view=panel"), "the poll URL never varies at rest");
    assert.ok(idle.every((r) => r.ifNoneMatch === '"smoke-panel-1"' && r.status === 304), "every idle poll revalidates with If-None-Match and gets 304");
    assert.equal(after.notModified - before.notModified, idle.length);
    assert.equal(after.renders, before.renders, "a 304 redraws nothing");
    assert.deepEqual(await page.evaluate(() => window.__mutations), [], "no DOM mutation while the server answers 304");
    assert.equal(await page.locator("#surveillance-overlay .tvl-card").count(), 0, "a result published before the panel opened is not replayed");
    // A surveillance already enabled starts no local capture.
    assert.deepEqual(t.controllerCalls(STARTERS), [], "no capture start without a viewer action");
    assert.deepEqual(t.controllerCalls(/\/ambient/), []);
    assert.deepEqual(server.posts, [], "no POST to the server without a viewer action");
    // A published change (storage running low) is fetched with a body and drawn.
    server.publish(() => { server.storage = { ...server.storage, state: "low", freeBytes: 1.6 * 1024 ** 3 }; server.session.capturedThroughMs = 778000; });
    await t.until(() => !document.querySelector("#storage-state").hidden, "bandeau d’espace disque faible");
    assert.match(await t.text("#storage-state"), /Espace disque faible sur le serveur : 1,6 Go libres, la capture s’arrêtera sous 1 Go\. Rien n’est supprimé automatiquement\./);
    assert.match(await t.text("#coverage"), /Capturé 12:58/);
    const changed = server.requests.at(-1);
    assert.deepEqual([changed.ifNoneMatch, changed.status], ['"smoke-panel-1"', 200], "the stale tag gets the new body");
    assert.ok((await page.evaluate(() => window.tvlensPanel.stats.renders)) > after.renders, "a new body is drawn");
    // Blocked storage is said in plain words, with the figures of the server.
    server.publish(() => { server.storage = { ...server.storage, state: "blocked", freeBytes: 0.8 * 1024 ** 3 }; server.session.accepting = false; });
    await t.until(() => /insuffisant/.test(document.querySelector("#storage-state").textContent), "stockage bloqué");
    assert.match(await t.text("#storage-state"), /Espace disque insuffisant sur le serveur : capture suspendue pour ne rien supprimer\. 819 Mo libres, 1 Go requis\./);
    assert.equal(await t.text("#connection"), "Capture suspendue · espace disque insuffisant");
    assert.match(await t.text("#capture-state"), /Capture arrêtée : espace disque insuffisant sur le serveur\. Rien n’a été supprimé, rien ne reprend seul\./);
    assert.deepEqual(t.controllerCalls(STARTERS), []);
    assert.deepEqual(t.errors, []);
    await page.close();
    done.push("If-None-Match émis, 304 sans redessin (0 mutation DOM), redessin après changement de stockage, stockage bloqué dit en clair");
  }

  // ---- 2. Older server: no view, no tag -> complete state, never If-None-Match ------------------
  {
    const t = await open(browser, { legacyServer: true });
    await t.advance(3000);
    const urls = t.server.requests.map((r) => r.url + ":" + r.status);
    assert.equal(urls[0], "/v1/state?view=panel:404", "the view is tried once");
    assert.ok(urls.slice(1).length >= 3 && urls.slice(1).every((u) => u === "/v1/state:200"), "then the complete state, at the former cadence: " + urls.join(" "));
    assert.ok(t.server.requests.every((r) => r.ifNoneMatch === null), "an older server never receives If-None-Match (its preflight would refuse it)");
    assert.equal(await t.page.evaluate(() => window.tvlensPanel.stats.legacy), true);
    assert.equal(await t.text("#connection"), "Capture reçue");
    // The same older server knows neither surveillance nor sessions: both are said, nothing breaks.
    await t.page.locator("#show-surveillance").focus();
    await t.press("Enter");
    assert.equal(await t.text("#surv-status"), "Surveillance indisponible : serveur à mettre à jour.");
    assert.equal(await t.page.locator("#surv-toggle").isDisabled(), true);
    await t.back();
    assert.equal(await t.focused(), "dictate");
    await t.page.locator("#show-timeline").focus();
    await t.press("Enter");
    await t.until(() => document.body.dataset.mode === "timeline" && !document.body.dataset.switching, "disposition frise");
    await t.page.locator("#timeline-sessions").focus();
    await t.press("Enter");
    await t.until(() => /serveur à mettre à jour/.test(document.querySelector("#sessions-status").textContent), "sessions indisponibles dites en clair");
    assert.equal(await t.text("#sessions-status"), "Sessions indisponibles : serveur à mettre à jour.");
    assert.equal(await t.focused(), "sessions-back", "the remote keeps a way out");
    await t.back();
    assert.equal(await t.focused(), "timeline-sessions");
    assert.deepEqual(t.errors, []);
    await t.page.close();
    done.push("serveur ancien : repli sur /v1/state entier sans If-None-Match, surveillance et sessions dites indisponibles");
  }

  // ---- 3. Bottom-left card: sourced only, outside the video in both layouts, gone at its deadline --
  if (overlayModule) {
    const t = await open(browser, { surveillance: surveillanceOn(3, []), video: VIDEO });
    const { page, server, controller } = t;
    const lotText = "Le taux de chômage annoncé à 7,4 % correspond au dernier chiffre publié par l’Insee pour le deuxième trimestre.";
    const focusBefore = await t.focused();
    assert.equal(await page.locator("#surveillance-overlay button, #surveillance-overlay a, #surveillance-overlay input, #surveillance-overlay [tabindex]").count(), 0, "no focusable element in the overlay");
    // One sourced verification, one video signal and one undetermined claim arrive together.
    server.publish(() => {
      server.surveillance = { ...surveillanceOn(4, [card(4, lotText, SOURCES, server.nowMs - 2000)]),
        signals: { seq: 1, cards: [{ id: "lot-9", kind: "signal", label: "Repéré dans la vidéo", seq: 1, text: SIGNAL_TEXT, claimIds: ["claim-9"], interval: { startMs: 700000, endMs: 708000 }, sources: [], origin: [], publishedAtMs: 769000, finishedAt: server.nowMs - 1000 }] },
        counts: { detected: 0, queued: 0, running: 0, sourced: 4, undetermined: 1, error: 0, cancelled: 0, noted: 1 },
        activity: { state: "verifying", label: "Vérification en cours…", detecting: false, running: 1, waiting: 2, late: false } };
    });
    await t.until(() => !!document.querySelector("#overlay-card .tvl-card"), "carte sourcée affichée");
    const shownAt = server.nowMs;
    assert.equal(await t.text("#overlay-card .tvl-card-kicker"), "Sources consultées · 12:40–12:48");
    assert.equal(await t.text("#overlay-card .tvl-card-text"), lotText);
    assert.equal(await t.text("#overlay-card .tvl-card-sources"), "Sources : insee.fr · lemonde.fr");
    const overlayText = await t.text("#surveillance-overlay");
    assert.doesNotMatch(overlayText, /https?:|www\./, "hosts only, never an address");
    assert.doesNotMatch(overlayText, /retraites|Repéré dans la vidéo/, "a signal is never drawn bottom-left");
    assert.equal(await t.focused(), focusBefore, "the card appears without taking the focus");
    let box = await t.box("#surveillance-overlay");
    assert.ok(box && box.width > 200 && box.height > 40, "the overlay is really laid out");
    assert.ok(box.right <= 1440 && box.top >= 945 && box.bottom <= 1080 && box.left >= 0, "chat layout: under the picture, left of the chat column " + JSON.stringify(box));
    assert.equal(intersects(box, VIDEO.chat), false, "chat layout: no pixel of the card over the video rectangle");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no horizontal scroll");
    // A click at the card's coordinates falls through: the overlay is not a target.
    await page.mouse.click(box.left + box.width / 2, box.top + box.height / 2);
    assert.equal(await t.focused(), focusBefore, "clicking the card moves no focus");
    assert.deepEqual(t.controllerCalls(/\/ambient/), [], "showing a card sends no local declaration");
    assert.equal(await t.text("#show-surveillance"), "Surveillance (2)", "signal and undetermined claim wait in the history, counted on the header button");
    await t.shot("overlay-chat", "chat");
    // Layout switch while the card is on screen: hidden until the new layout is confirmed, then re-anchored.
    controller.panel.hold = true;
    await page.locator("#show-timeline").focus();
    await t.press("Enter");
    await t.advance(500);
    assert.equal(await page.evaluate(() => document.body.dataset.switching), "true");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#surveillance-overlay")).visibility), "hidden", "nothing is drawn during the layout switch");
    assert.equal(await page.locator("#overlay-card .tvl-card").count(), 0, "the card is withdrawn during the switch");
    Object.assign(controller.panel, { hold: false, mode: controller.panel.pending.mode, requestId: controller.panel.pending.id });
    await t.until(() => document.body.dataset.mode === "timeline" && !document.body.dataset.switching, "disposition frise confirmée");
    await t.until(() => !!document.querySelector("#overlay-card .tvl-card"), "carte revenue après la bascule");
    const reshownAt = server.nowMs;
    box = await t.box("#surveillance-overlay");
    assert.ok(box.right <= 320 && box.bottom <= 720 && box.left >= 0 && box.top >= 0, "timeline layout: left of the picture, above the band " + JSON.stringify(box));
    assert.equal(intersects(box, VIDEO.timeline), false, "timeline layout: no pixel of the card over the video rectangle");
    assert.equal(await t.text("#overlay-card .tvl-card-text"), lotText);
    assert.deepEqual(t.controllerCalls(/\/ambient/), [], "showing the card again sends no local declaration");
    await t.shot("overlay-frise", "timeline");
    // A dialog owns the screen: the card is withdrawn meanwhile and comes back whole afterwards.
    await page.locator("#timeline-end").focus();
    await t.press("Enter");
    assert.equal(await t.focused(), "end-cancel");
    await t.advance(500);
    assert.equal(await page.locator("#overlay-card .tvl-card").count(), 0, "no card under an open dialog");
    await t.back();
    assert.equal(await t.focused(), "timeline-end");
    await t.until(() => !!document.querySelector("#overlay-card .tvl-card"), "carte revenue après le dialogue");
    const resumedAt = server.nowMs;
    // Deadline: 14 s by default, driven by the local timer. The server is not even reachable any more.
    await page.route("http://server.test/v1/state**", (route) => route.abort());
    await t.advance(12500 - (server.nowMs - resumedAt));
    assert.equal(await page.locator("#overlay-card .tvl-card").count(), 1, "still on screen before its deadline");
    await t.advance(2500);
    assert.equal(await page.locator("#overlay-card .tvl-card").count(), 0, "gone at its deadline, without any answer from the server");
    assert.ok(shownAt < reshownAt && reshownAt < resumedAt);
    // Discreet activity takes the place once the card left, still without a focusable element.
    assert.equal(await t.text("#overlay-activity .tvl-pill-label"), "Vérification en cours… · 2 en attente");
    box = await t.box("#surveillance-overlay");
    assert.equal(intersects(box, VIDEO.timeline), false);
    assert.equal(await page.evaluate(() => window.__media), 0, "no audio or video element, no audio context");
    assert.deepEqual(t.errors, []);
    await page.close();
    done.push("carte sourcée hors vidéo (chat puis frise), masquée pendant la bascule et sous un dialogue, disparue à 14 s sans serveur, aucun signalement affiché, aucun focus pris");
  }

  // ---- 3b. A picture that reaches into the card's place: nothing is drawn there, in that layout only --
  if (overlayModule) {
    // The chat layout of this launcher leaves no band under the picture; its timeline layout is the usual one.
    const t = await open(browser, { surveillance: surveillanceOn(3, []), video: { chat: { x: 0, y: 135, width: 1440, height: 945 }, timeline: VIDEO.timeline } });
    const { page, server } = t;
    server.publish(() => { server.surveillance = { ...surveillanceOn(4, [card(4, "Résultat sourcé arrivé pendant que la vidéo occupe la bande.", SOURCES, server.nowMs)]), activity: { state: "verifying", label: "Vérification en cours…", detecting: false, running: 1, waiting: 0, late: false } }; });
    await t.advance(3000);
    assert.equal(await page.locator("#overlay-card .tvl-card").count(), 0, "no card where the picture is");
    assert.equal(await page.locator("#overlay-activity .tvl-pill").count(), 0, "no activity pill there either");
    await page.locator("#show-surveillance").focus();
    await t.press("Enter");
    assert.match(await t.text("#surv-overlay"),
      /Alertes panneau ouvert masquées : la vidéo occupe leur emplacement dans cette disposition\./, "and the panel says why");
    await t.back();
    await page.locator("#show-timeline").focus();
    await t.press("Enter");
    await t.until(() => document.body.dataset.mode === "timeline" && !document.body.dataset.switching, "disposition frise");
    await t.until(() => !!document.querySelector("#overlay-card .tvl-card"), "carte affichée là où la bande est libre");
    assert.equal(intersects(await t.box("#surveillance-overlay"), VIDEO.timeline), false);
    assert.deepEqual(t.errors, []);
    await page.close();
    done.push("rectangle vidéo publié par le contrôleur : aucune carte quand l’image occupe son emplacement, carte affichée dans la disposition où la bande est libre");
  }

  // ---- 3c. Restored registry: the state in its own words, a history that is not news, a registry not saved --
  if (overlayModule) {
    const ready = { ready: true, persisted: true, status: "ready", message: null };
    const t = await open(browser, { surveillance: { ...surveillanceOn(0, []), registry: ready } });
    const { page, server } = t;
    await page.locator("#show-surveillance").focus();
    await t.press("Enter");
    // The viewer activated the surveillance on a session whose folder holds an earlier registry: it is being read.
    server.publish(() => { server.surveillance = { ...surveillanceOn(0, []), activation: { id: null, provisional: true, instruction: "Vérifie les chiffres annoncés.", t0Ms: 600000, startedAt: server.nowMs, stoppedAt: null, stopReason: null },
      activity: { state: "restoring", label: "Restauration du suivi enregistré…", detecting: false, running: 0, waiting: 0, late: false }, registry: { ready: false, persisted: false, status: "restoring", message: "Restauration du suivi enregistré…" } }; });
    await t.until(() => document.querySelector("#surv-status").textContent === "Restauration du suivi enregistré…", "restauration dite avec les mots de l’état");
    assert.deepEqual([await t.text("#surv-counts"), await t.text("#surv-history-open")], ["", "Historique"], "nothing is shown as final while the folder is read");
    assert.equal(await page.locator("#overlay-activity .tvl-pill").count(), 0, "no activity pill: nothing is read or checked yet");
    // Read: seven earlier results come back, two of them still fresh; the reading of new passages fails, and the
    // registry cannot be written. None of the seven is news.
    const unsaved = "Écriture du suivi en échec. Historique en mémoire seulement : il ne sera pas enregistré tant que l’écriture échoue.";
    const failing = { activity: { state: "late", label: "Lecture des passages en échec : 3 passages non lus.", detecting: false, running: 0, waiting: 0, late: true },
      backlog: { late: true, reason: "detection-failed", passagesPending: 0, passagesFailed: 3, failure: "Fournisseur indisponible.", claimsWaiting: 0, oldestClaimWaitMs: 0 },
      registry: { ready: true, persisted: false, status: "write-failed", message: unsaved } };
    const restored = [6, 7].map((seq) => card(seq, "Résultat restauré numéro " + seq + ".", SOURCES, server.nowMs - 2000));
    server.publish(() => { server.surveillance = { ...surveillanceOn(7, restored), ...failing }; });
    await t.until(() => /^Lecture des passages en échec/.test(document.querySelector("#surv-status").textContent), "registre restauré");
    await t.advance(3000);
    assert.equal(await page.locator("#overlay-card .tvl-card").count(), 0, "a restored history is not shown as new results");
    assert.deepEqual(t.controllerCalls(/\/ambient\/seen\//), []);
    assert.match(await t.text("#surv-status"), /^Lecture des passages en échec : 3 passages non lus\. Depuis 10:00\.$/);
    assert.equal(await t.text("#surv-counts"), "7 sourcées · " + unsaved, "the registry that is not saved is said, and the lateness is not said twice");
    assert.equal(await t.text("#surv-history-open"), "Historique · 7 affirmations");
    assert.equal(await t.text("#overlay-activity .tvl-pill-label"), "Lecture en échec · 3 passages non lus");
    assert.ok(await page.evaluate(() => { const label = document.querySelector("#overlay-activity .tvl-pill-label"); return label.scrollWidth <= label.clientWidth; }), "the pill line is not cut");
    assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /0 en attente|en retard ·/);
    await t.shot("etat-restaure", "chat");
    // One check still running 90 s after its claim was found, nothing queued behind it: the core words
    // "0 affirmation en attente". Line and pill say a late check; no count of 0 reaches the screen.
    server.publish(() => { server.surveillance = { ...surveillanceOn(7, restored), ...failing,
      activity: { state: "late", label: "Vérifications en retard : 0 affirmation en attente.", detecting: false, running: 1, waiting: 0, late: true },
      backlog: { late: true, reason: "verification", passagesPending: 0, passagesFailed: 0, failure: null, claimsWaiting: 0, oldestClaimWaitMs: 0 },
      counts: { ...surveillanceOn(7, restored).counts, running: 1 } }; });
    // The pill is redrawn by the local timer of the overlay, one turn after the state line.
    await t.until(() => /^Vérification en cours/.test(document.querySelector("#surv-status").textContent) && !/échec/.test(document.querySelector("#overlay-activity").textContent), "vérification seule en retard");
    assert.equal(await t.text("#surv-status"), "Vérification en cours : elle a pris du retard. Depuis 10:00.");
    assert.equal(await t.text("#surv-counts"), "7 sourcées · 1 en cours · " + unsaved);
    assert.equal(await t.text("#overlay-activity .tvl-pill-label"), "Vérification en cours · en retard");
    assert.ok(await page.evaluate(() => { const label = document.querySelector("#overlay-activity .tvl-pill-label"); return label.scrollWidth <= label.clientWidth; }), "the pill line is not cut");
    assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /\b0 (?:en attente|affirmation)|en retard ·/);
    await t.back();
    assert.equal(await t.text("#show-surveillance"), "Surveillance", "seven restored results are not counted as new on the header button");
    // The eighth is published now: it is news and shown in this panel.
    server.publish(() => { server.surveillance = { ...surveillanceOn(8, [...restored, card(8, "Résultat publié après la restauration.", SOURCES, server.nowMs)]), ...failing }; });
    await t.until(() => !!document.querySelector("#overlay-card .tvl-card"), "nouveau résultat affiché");
    assert.equal(await t.text("#overlay-card .tvl-card-text"), "Résultat publié après la restauration.");
    assert.deepEqual(t.controllerCalls(/\/ambient/), []);
    assert.deepEqual(t.errors, []);
    await page.close();
    done.push("registre restauré : état dit avec ses mots (restauration, lecture en échec et passages non lus, " +
      "vérification seule en retard sans « 0 en attente »), registre non enregistré signalé, " +
      "historique restauré ni affiché ni compté, résultat suivant affiché sans déclaration au contrôleur");
  }

  // ---- 4. Surveillance view with the remote: commands, history, detail, Back by levels -----------
  {
    const t = await open(browser);
    const { page, server, controller } = t;
    const lot = { id: "lot-2", kind: "verification", status: "done", text: "Le chiffre de 7,4 % concorde avec la dernière publication de l’Insee.", claimIds: ["claim-3"], sourcedClaimIds: ["claim-3"],
      sources: [{ ...SOURCES[0], claimIds: ["claim-3"] }], origin: [{ claimId: "claim-3", passageId: "moment-96", startMs: 760000, endMs: 768000, quote: "le chômage est à 7,4 %" }],
      assessments: [{ claimId: "claim-3", assessment: "supported", label: "Concorde avec les sources" }], uncertainties: ["Propos relevés dans une transcription automatique : ils peuvent avoir été mal entendus."] };
    server.history = [
      { seq: 61, id: "claim-30", kind: "claim", action: "verify", status: "queued", late: false, startMs: 800000, endMs: 808000, text: "La dette dépasse 3 000 milliards.", quote: "plus de 3 000 milliards", reason: null, claimCount: 1, sourceCount: 0, overlay: false },
      { seq: 19, id: "lot-4", kind: "lot", cardKind: "signal", label: "Repéré dans la vidéo", status: "noted", late: false, startMs: 700000, endMs: 708000, text: SIGNAL_TEXT, claimCount: 1, sourceCount: 0, overlay: false },
      { seq: 8, id: "claim-4", kind: "claim", action: "verify", status: "undetermined", late: false, startMs: 770000, endMs: 778000, text: "Ce sera la meilleure année de la décennie.", quote: "la meilleure année", reason: "non vérifiable", claimCount: 1, sourceCount: 0, overlay: false },
      { seq: 7, id: "lot-2", kind: "lot", cardKind: "verification", label: "Sources consultées", status: "sourced", late: false, startMs: 760000, endMs: 768000, text: lot.text, claimCount: 1, sourceCount: 1, overlay: true },
      // A second page, so that paging is really exercised.
      ...Array.from({ length: 21 }, (_, i) => ({ seq: 6 - i * 0.1, id: "claim-" + (100 + i), kind: "claim", action: "verify", status: "cancelled", late: false, startMs: 600000 + i * 8000, endMs: 608000 + i * 8000, text: "Affirmation ancienne " + (i + 1), quote: "", reason: "Surveillance arrêtée.", claimCount: 1, sourceCount: 0, overlay: false })),
    ];
    server.details = {
      "lot-2": { kind: "lot", lot, claims: [{ id: "claim-3", action: "verify", status: "sourced", statement: "Le chômage est à 7,4 %.", assessment: "supported", conclusion: "L’Insee publie 7,4 % au deuxième trimestre.", origin: { passageId: "moment-96", startMs: 760000, endMs: 768000, quote: "le chômage est à 7,4 %", field: "transcript" }, sources: lot.sources, limitations: ["Chiffre provisoire."] }] },
      "lot-4": { kind: "lot", lot: { id: "lot-4", kind: "signal", status: "done", text: SIGNAL_TEXT, claimIds: ["claim-9"], sources: [], origin: [{ claimId: "claim-9", passageId: "moment-88", startMs: 700000, endMs: 708000, quote: "revenons sur les retraites" }], uncertainties: [] }, claims: [{ id: "claim-9", action: "signal", status: "noted", statement: "Le plateau revient sur les retraites.", origin: { passageId: "moment-88", startMs: 700000, endMs: 708000, quote: "revenons sur les retraites" }, sources: [], limitations: [] }] },
      "claim-4": { kind: "claim", lot: null, claims: [{ id: "claim-4", action: "verify", status: "undetermined", reason: "non vérifiable", statement: "Ce sera la meilleure année de la décennie.", origin: { passageId: "moment-97", startMs: 770000, endMs: 778000, quote: "la meilleure année" }, sources: [], limitations: [] }] },
    };
    // From the question row to the header with the arrows only.
    assert.equal(await t.focused(), "dictate");
    await t.press("ArrowUp");
    assert.equal(await t.focused(), "conversation");
    await t.press("ArrowUp");
    assert.equal(await t.focused(), "show-timeline");
    await t.press("ArrowRight");
    assert.equal(await t.focused(), "show-surveillance");
    await t.press("Enter");
    assert.equal(await page.locator("#surveillance-view").isVisible(), true);
    assert.equal(await page.locator("#chat-view").isVisible(), false);
    assert.equal(await t.text("#surv-status"), "Surveillance inactive.");
    assert.deepEqual(t.controllerCalls(/\/ambient/), [], "opening surveillance reads no removed local state");
    // Activation refused without an instruction, then with an example chosen with the remote.
    assert.equal(await t.focused(), "surv-toggle");
    await t.press("Enter");
    assert.equal(await t.text("#surv-message"), "Dicte une consigne ou choisis un exemple.");
    assert.equal(t.serverPosts("/v1/surveillance/start").length, 0);
    await t.press("ArrowUp");
    assert.equal(await t.focused(), "surv-dictate");
    await t.press("Enter");
    assert.equal(await t.focused(), "surv-instruction", "Dicter gives the field to the LG keyboard and microphone");
    await t.back();
    assert.equal(await t.focused(), "surv-dictate", "Back leaves the field without closing the view");
    await t.press("ArrowRight");
    assert.equal(await t.focused(), "surv-example");
    await t.press("Enter");
    assert.equal(await page.locator("#surv-instruction").inputValue(), "Vérifie les chiffres annoncés.");
    await t.press("ArrowDown");
    assert.equal(await t.focused(), "surv-toggle");
    await t.press("Enter");
    await t.until(() => document.querySelector("#surv-toggle").textContent === "Arrêter la surveillance", "surveillance activée");
    assert.deepEqual(t.serverPosts("/v1/surveillance/start").map((p) => p.body), [{ sessionId: SESSION, instruction: "Vérifie les chiffres annoncés." }]);
    assert.deepEqual(t.controllerCalls(/\/ambient/), []);
    assert.match(await t.text("#surv-status"), /^Surveillance active\. Depuis 12:5\d\.$/);
    assert.equal(await t.focused(), "surv-toggle", "the activation keeps the focus where it was");
    // Display choices, local to the TV.
    await t.press("ArrowDown");
    assert.equal(await t.focused(), "surv-duration");
    assert.equal(await t.text("#surv-duration"), "Durée des alertes · 14 s");
    await t.press("Enter");
    assert.equal(await t.text("#surv-duration"), "Durée des alertes · 20 s");
    await t.press("Enter");
    assert.equal(await t.text("#surv-duration"), "Durée des alertes · 8 s");
    assert.deepEqual(t.controllerCalls(/display/), [], "duration stays local");
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("tvlens.overlay"))), { displayMs: 8000, alerts: true });
    await t.press("ArrowRight");
    assert.equal(await t.focused(), "surv-alerts");
    await t.press("Enter");
    assert.equal(await t.text("#surv-alerts"), "Alertes à l’écran · non");
    assert.deepEqual(t.controllerCalls(/alerts/), [], "alerts stay local");
    // With alerts off, a sourced result is not drawn; it stays for the history.
    server.publish(() => { server.surveillance = { ...server.surveillance, overlay: { seq: 1, cards: [card(1, "Résultat arrivé alertes coupées.", SOURCES, server.nowMs)] }, counts: { ...server.surveillance.counts, sourced: 1 } }; });
    await t.advance(2500);
    assert.equal(await page.locator("#overlay-card .tvl-card").count(), 0, "alerts off: nothing bottom-left");
    assert.equal(await page.locator("#surveillance-overlay").isVisible(), false);
    await t.advance(6000);
    assert.deepEqual(t.controllerCalls(/\/ambient/), [], "time passing reads no removed local state");
    await t.press("Enter");
    assert.equal(await t.text("#surv-alerts"), "Alertes à l’écran · oui");
    // Alerts back on: the result, still fresh, is shown for the duration chosen above (8 s), then leaves.
    await t.until(() => !!document.querySelector("#overlay-card .tvl-card"), "carte affichée une fois les alertes rétablies");
    const eightFrom = server.nowMs;
    assert.equal(await t.text("#overlay-card .tvl-card-text"), "Résultat arrivé alertes coupées.");
    assert.equal(await t.focused(), "surv-alerts", "a card never takes the focus");
    await t.advance(7000 - (server.nowMs - eightFrom));
    assert.equal(await page.locator("#overlay-card .tvl-card").count(), 1, "still shown before 8 s");
    await t.advance(1500);
    assert.equal(await page.locator("#overlay-card .tvl-card").count(), 0, "gone after the 8 s chosen on this TV");
    // History: paged requests, never the whole registry.
    await t.press("ArrowDown");
    assert.equal(await t.focused(), "surv-history-open");
    await t.press("Enter");
    await t.until(() => document.querySelectorAll(".surv-item").length > 0, "historique chargé");
    assert.deepEqual(t.serverPosts("/v1/surveillance/history").map((p) => p.body), [{ sessionId: SESSION, limit: 20 }]);
    assert.equal(await t.focused(), "claim-30");
    const items = await page.evaluate(() => [...document.querySelectorAll(".surv-item")].map((n) => [n.dataset.id, n.dataset.accent, n.querySelector(".surv-kicker").textContent, n.querySelector(".surv-meta").textContent]));
    assert.deepEqual(items.slice(0, 4), [
      ["claim-30", "open", "En attente · 13:20–13:28", ""],
      ["lot-4", "signal", "Repéré dans la vidéo · 11:40–11:48", "Observation de la vidéo, non vérifiée sur le web."],
      ["claim-4", "open", "Indéterminée · 12:50–12:58", "Non vérifiée : affirmation qui ne se vérifie pas par une recherche."],
      ["lot-2", "verification", "Sources consultées · 12:40–12:48", "1 affirmation · 1 source"],
    ], "a verification, a signal and an undetermined claim are told apart");
    assert.ok((await page.locator(".surv-item").count()) <= 6, "only visible neighbours are in the DOM");
    assert.match(await t.text("#surv-list-status"), /^25 éléments · du plus récent au plus ancien · 20 chargés$/);
    await t.shot("surveillance-historique", "chat");
    // Detail of the signal: its own label, no source, no verdict.
    await t.press("ArrowDown");
    assert.equal(await t.focused(), "lot-4");
    await t.press("Enter");
    await t.until(() => document.querySelector("#surv-detail-title").textContent === "Repéré dans la vidéo", "détail du signalement");
    assert.equal(await t.text("#surv-detail-time"), "11:40–11:48 · temps observé");
    const signalDetail = await t.text("#surv-detail-scroll");
    assert.match(signalDetail, /Observation de la vidéo, non vérifiée sur le web\./);
    assert.match(signalDetail, /Relevée dans la vidéo, sans vérification sur le web\./);
    assert.doesNotMatch(signalDetail, /Sources|Concorde|Contredit/, "a signal never borrows the vocabulary of a web verification");
    await t.back();
    assert.equal(await t.focused(), "lot-4", "Back: detail -> list, on the item that was open");
    // Detail of the undetermined claim.
    await t.press("ArrowDown");
    await t.press("Enter");
    await t.until(() => /Indéterminée/.test(document.querySelector("#surv-detail-title").textContent), "détail de l’indéterminée");
    assert.match(await t.text("#surv-detail-scroll"), /Ce sera la meilleure année de la décennie\..*12:50–12:58 · « la meilleure année ».*Indéterminée : affirmation qui ne se vérifie pas par une recherche\./);
    await t.back();
    // Detail of the sourced verification: claims, quote, timing, state, sources as text, uncertainties.
    await t.press("ArrowDown");
    assert.equal(await t.focused(), "lot-2");
    await t.press("Enter");
    await t.until(() => document.querySelector("#surv-detail-title").textContent === "Sources consultées", "détail de la vérification");
    assert.deepEqual(t.serverPosts("/v1/surveillance/detail").map((p) => p.body.id), ["lot-4", "claim-4", "lot-2"]);
    const detail = await t.text("#surv-detail-scroll");
    assert.match(detail, /Le chiffre de 7,4 % concorde avec la dernière publication de l’Insee\./);
    assert.match(detail, /Le chômage est à 7,4 %\..*12:40–12:48 · « le chômage est à 7,4 % ».*Concorde avec les sources — L’Insee publie 7,4 % au deuxième trimestre\./);
    assert.match(detail, /Sources.*Taux de chômage au deuxième trimestre.*Insee.*https:\/\/www\.insee\.fr\/fr\/statistiques\/chomage/, "title, publisher and address, as text");
    assert.match(detail, /Incertitudes.*transcription automatique.*Chiffre provisoire\./);
    assert.equal(await page.locator("#surv-detail-scroll a, #surv-detail-scroll button").count(), 0, "sources are text only");
    assert.equal(await t.focused(), "surv-detail-scroll");
    await t.shot("surveillance-detail", "chat");
    for (let i = 0; i < 12 && (await t.focused()) === "surv-detail-scroll"; i++) await t.press("ArrowDown");
    assert.equal(await t.focused(), "surv-detail-ask", "Down reads to the end, then reaches the actions");
    await t.press("ArrowRight");
    assert.equal(await t.focused(), "surv-detail-back");
    await t.press("ArrowLeft");
    await t.press("Enter");
    assert.equal(await page.locator("#chat-view").isVisible(), true, "Questionner ce moment opens the chat");
    assert.equal(await t.text("#moment-context span"), "Question sur 12:40–12:48");
    assert.equal(await t.focused(), "question");
    await t.back();
    assert.equal(await t.focused(), "dictate");
    // Back by levels: detail -> list -> commands -> chat -> close.
    await t.press("ArrowUp");
    assert.equal(await t.focused(), "clear-moment");
    await t.press("Enter");
    await page.locator("#show-surveillance").focus();
    await t.press("Enter");
    assert.equal(await t.focused(), "surv-toggle");
    assert.equal(await page.locator("#surv-dictate").isDisabled(), true, "the instruction of a running surveillance is not edited: it is stopped first");
    await t.press("ArrowDown", 2);
    assert.equal(await t.focused(), "surv-history-open");
    await t.press("Enter");
    await t.until(() => document.querySelectorAll(".surv-item").length > 0, "historique rechargé");
    // Paging: going down fetches the next page before the end of what is loaded.
    await t.press("ArrowDown", 18);
    await t.until(() => /25 éléments · du plus récent au plus ancien$/.test(document.querySelector("#surv-list-status").textContent), "seconde page chargée");
    const pages = t.serverPosts("/v1/surveillance/history").map((p) => p.body);
    assert.ok(pages.at(-1).beforeSeq > 0 && pages.at(-1).limit === 20, "the next page is asked with the cursor of the previous one: " + JSON.stringify(pages.at(-1)));
    assert.ok(!server.gets.includes("/v1/surveillance"), "the whole registry is never fetched");
    assert.ok((await page.locator(".surv-item").count()) <= 6);
    await t.press("Enter");
    await t.until(() => !document.querySelector("#surv-detail").hidden, "détail ouvert");
    const closedBefore = await page.evaluate(() => window.__closed);
    await t.back();
    assert.equal(await page.locator("#surv-list").isVisible(), true, "Back 1: detail -> list");
    await t.back();
    assert.equal(await page.locator("#surv-commands").isVisible(), true, "Back 2: list -> commands");
    assert.equal(await t.focused(), "surv-history-open");
    await t.back();
    assert.equal(await page.locator("#chat-view").isVisible(), true, "Back 3: commands -> chat");
    assert.equal(await t.focused(), "dictate");
    assert.equal(await page.evaluate(() => window.__closed), closedBefore, "no level closed the panel");
    await t.back();
    assert.equal(await page.evaluate(() => window.__closed), closedBefore + 1, "Back 4: the panel closes");
    // The viewer explicitly stops the server surveillance.
    await page.locator("#show-surveillance").focus();
    await t.press("Enter");
    assert.equal(await t.focused(), "surv-toggle");
    await t.press("Enter");
    await t.until(() => document.querySelector("#surv-toggle").textContent === "Activer la surveillance", "surveillance arrêtée");
    assert.equal(t.serverPosts("/v1/surveillance/stop").length, 1);
    assert.deepEqual(t.controllerCalls(/\/ambient/), []);
    assert.equal(await page.evaluate(() => window.__media), 0);
    assert.deepEqual(t.errors, []);
    await page.close();
    done.push("vue Surveillance aux flèches : activer avec exemple, durée 8/14/20, alertes, historique paginé, détails (vérification, signalement, indéterminée), Questionner ce moment, Retour par niveaux, arrêter");
  }

  // ---- 5. A controller without the removed API still allows server surveillance ----------------
  {
    const t = await open(browser);
    const { page } = t;
    await page.locator("#show-surveillance").focus();
    await t.press("Enter");
    assert.deepEqual(t.controllerCalls(/\/ambient/), []);
    await t.press("ArrowUp");
    await t.press("ArrowRight");
    await t.press("Enter");
    await t.press("ArrowDown");
    await t.press("Enter");
    await t.until(() => document.querySelector("#surv-toggle").textContent === "Arrêter la surveillance", "surveillance activée malgré le contrôleur ancien");
    assert.equal(await t.text("#surv-message"), "", "the server-side surveillance starts all the same");
    assert.deepEqual(t.errors, []);
    await page.close();
    assert.deepEqual(t.controllerCalls(/\/ambient/), []);
    done.push("surveillance activable sans API locale ambient");
  }

  // ---- 6. Long question: immediate echo, poll at once, elapsed / ceiling, cancel with the arrows ---
  {
    const t = await open(browser);
    const { page, server } = t;
    let release;
    server.holdQuestions = new Promise((resolve) => { release = resolve; });
    await page.locator("#question").fill("Que vient-il de dire sur le chômage ?");
    const pollsBefore = server.requests.length;
    await page.keyboard.press("Enter");
    await t.settle();
    // Before the server answered anything: the question is already on screen.
    assert.equal(server.jobs.length, 0);
    assert.equal(await t.text('#conversation article[data-pending="true"] .chat-question'), "Que vient-il de dire sur le chômage ?", "immediate echo of the question");
    assert.match(await t.text("#conversation article small"), /Envoi…/);
    assert.equal(await t.focused(), "dictate", "sending releases the field at once");
    release();
    server.holdQuestions = null;
    await t.settle();
    // No clock advance at all since the answer: the poll was triggered by the send, not by the timer.
    const kicked = server.requests.slice(pollsBefore);
    assert.ok(kicked.length >= 1, "a poll starts as soon as the question is accepted, without waiting for the next turn");
    await t.until(() => !!document.querySelector('#conversation article[data-job="deep-1"] .job-progress'), "carte du travail");
    assert.equal(await page.locator("#conversation article").count(), 1, "the echo became the card of the job: no duplicate");
    assert.equal(await t.text('article[data-job="deep-1"] .job-freshness'), "Mémoire disponible jusqu’à 12:48 au moment de la question · dernier passage reçu 12:40–12:48");
    // Elapsed against the ceiling, from the server clock (years away from the page clock).
    const node = await page.evaluateHandle(() => document.querySelector('article[data-job="deep-1"]'));
    await page.evaluate((article) => { article.__same = true; window.__cardMutations = 0; new MutationObserver((records) => { window.__cardMutations += records.filter((r) => r.type === "childList" && r.target === article).length; }).observe(article, { childList: true }); }, node);
    const label = async () => t.text('article[data-job="deep-1"] .job-progress');
    const seconds = async () => { const match = /^En cours · (\d+):(\d\d) \/ 5:00 max$/.exec(await label()); assert.ok(match, "progress label: " + (await label())); return Number(match[1]) * 60 + Number(match[2]); };
    const startedAt = server.jobs[0].startedAt, first = await seconds();
    assert.ok(Math.abs(first - Math.floor((server.nowMs - startedAt) / 1000)) <= 1, "elapsed follows the server clock");
    const from = server.requests.length;
    await t.focused();
    await t.advance(72000 - (server.nowMs - startedAt));
    assert.equal(await label(), "En cours · 1:12 / 5:00 max");
    const active = server.requests.slice(from);
    assert.ok(active.length > 60 * 3, "fast cadence while a question runs: " + active.length + " polls in about 70 s");
    const views = active.map((r) => r.view), chatPolls = views.filter((v) => v === "chat").length, panelPolls = views.filter((v) => v === "panel").length;
    assert.ok(chatPolls > panelPolls * 2 && panelPolls > 0, `chat view while a question moves, panel view one poll out of four: ${chatPolls} chat, ${panelPolls} panel`);
    // Nothing was published meanwhile: apart from the very first read of the chat URL, every poll is a 304.
    assert.ok(active.filter((r) => r.status !== 304).length <= 1, "polls with a body while nothing changed: " + JSON.stringify(active.filter((r) => r.status !== 304)));
    for (const url of ["/v1/state?view=chat", "/v1/state?view=panel"])
      assert.ok(server.requests.filter((r) => r.url === url).slice(1).every((r) => r.ifNoneMatch), url + ": every poll after the first carries If-None-Match");
    assert.equal(await page.evaluate(() => window.__cardMutations), 0, "seconds pass without rebuilding the card");
    assert.equal(await page.evaluate((article) => article.__same === true && article.isConnected, node), true);
    assert.equal(await t.focused(), "dictate", "and without moving the focus");
    // A second question waits its turn: position in the queue.
    await page.locator("#question").fill("Et sur la dette ?");
    await page.keyboard.press("Enter");
    await t.until(() => !!document.querySelector('article[data-job="deep-2"] .job-progress'), "seconde question");
    await t.until(() => document.querySelector('article[data-job="deep-2"] .job-progress').textContent !== "", "position en file");
    assert.equal(await t.text('article[data-job="deep-2"] .job-progress'), "En file · position 1");
    // Cancel with the arrows: Down from the question row reaches the fixed button.
    assert.equal(await t.focused(), "dictate");
    assert.equal(await page.locator("#cancel-question").isVisible(), true);
    await t.press("ArrowDown");
    assert.equal(await t.focused(), "cancel-question");
    assert.equal(await t.text("#cancel-question"), "Annuler la question en cours");
    await t.shot("question-longue", "chat");
    await t.press("Enter");
    await t.until(() => /Annulé/.test(document.querySelector('article[data-job="deep-1"]').textContent), "première question annulée");
    assert.deepEqual(t.serverPosts("/cancel").map((p) => p.path), ["/v1/questions/deep-1/cancel"], "the running question is the one cancelled");
    assert.equal(await t.focused(), "cancel-question", "the button stays while another question moves");
    await t.until(() => /^En cours/.test(document.querySelector('article[data-job="deep-2"] .job-progress').textContent), "la suivante démarre");
    await t.press("ArrowDown");
    assert.equal(await t.focused(), "capture", "Down goes on to the capture button");
    await t.press("ArrowUp");
    assert.equal(await t.focused(), "cancel-question");
    await t.press("Enter");
    await t.until(() => document.querySelector("#cancel-question").hidden, "plus aucune question en cours");
    assert.deepEqual(t.serverPosts("/cancel").map((p) => p.path), ["/v1/questions/deep-1/cancel", "/v1/questions/deep-2/cancel"]);
    assert.equal(await t.focused(), "dictate", "the button left: the focus goes back to the question row, never to nothing");
    // A question that is over keeps a short freshness label: the whole sentence is not repeated above every answer.
    const whole = "Mémoire disponible jusqu’à 12:48 au moment de la question · dernier passage reçu 12:40–12:48";
    const fresh = (job, part) => page.locator(`article[data-job="${job}"] .job-freshness .fresh-${part}`);
    for (const job of ["deep-1", "deep-2"])
      assert.deepEqual([await fresh(job, "short").innerText(), await fresh(job, "short").isVisible(), await fresh(job, "detail").isVisible()], ["Mémoire jusqu’à 12:48", true, false], job);
    assert.equal(await page.locator('article[data-job="deep-1"] .job-freshness').getAttribute("title"), whole);
    // It stays one OK away: while the messages are read, the sentence takes the place of the label.
    await t.press("ArrowUp");
    assert.equal(await t.focused(), "conversation");
    await t.press("Enter");
    assert.deepEqual([await fresh("deep-1", "short").isVisible(), await fresh("deep-1", "detail").isVisible(), await fresh("deep-1", "detail").innerText()], [false, true, whole]);
    await t.back();
    assert.deepEqual([await t.focused(), await fresh("deep-1", "short").isVisible(), await fresh("deep-1", "detail").isVisible()], ["dictate", true, false]);
    assert.doesNotMatch(await page.evaluate(() => document.body.textContent), /60 secondes/);
    assert.equal(await page.evaluate(() => window.__media), 0);
    assert.deepEqual(t.errors, []);
    await page.close();
    done.push("question longue : écho immédiat, sondage dès l’envoi, écoulé/plafond à l’horloge du serveur sans reconstruire la carte, position en file, annulation aux flèches");
  }

  // ---- 7. Sessions: list, open read-only, three-choice dialog, resume, delete, new session -----
  {
    const t = await open(browser);
    const { page, server, controller } = t;
    const summaries = () => [
      ...(server.session && server.session.id === SESSION ? [{ id: SESSION, title: "Session du 13 oct., 21:04", state: "live", elapsedMs: server.session.elapsedMs, passages: 96, media: { stored: 96, missing: 0, bytes: 400 * 1024 ** 2 }, legacy: false, current: true, readOnly: false, capturing: server.session.accepting }] : server.deleted.includes(SESSION) ? [] : [{ id: SESSION, title: "Session du 13 oct., 21:04", state: "archived", elapsedMs: 772000, passages: 96, media: { stored: 96, missing: 0, bytes: 400 * 1024 ** 2 }, legacy: false, current: false, readOnly: false, capturing: false }]),
      ...(server.deleted.includes(ARCHIVE) ? [] : [{ id: ARCHIVE, title: "Débat du 12 oct., 20:55", state: "archived", elapsedMs: 5520000, passages: 690, media: { stored: 688, missing: 2, bytes: 1.2 * 1024 ** 3 }, legacy: false, current: Boolean(server.session && server.session.id === ARCHIVE), readOnly: Boolean(server.session && server.session.id === ARCHIVE && server.session.readOnly), capturing: false }]),
      ...(server.deleted.includes(OLD) ? [] : [{ id: OLD, title: "Session du 2 oct., 19:10", state: "archived", elapsedMs: 300000, passages: 37, media: { stored: 0, missing: 37, bytes: 0 }, legacy: true, current: false, readOnly: false, capturing: false }]),
    ];
    server.deleted = [];
    server.library = () => ({ current: server.session ? { id: server.session.id, readOnly: server.session.readOnly, accepting: server.session.accepting, title: server.session.title } : null, sessions: summaries(), total: summaries().length,
      storage: { sessions: summaries().length, bytes: 1.6 * 1024 ** 3, freeBytes: 9 * 1024 ** 3, minFreeBytes: 1024 ** 3, warnFreeBytes: 2 * 1024 ** 3, state: "ok" } });
    server.sessionAction = (id, action) => {
      if (action === "open") server.publish(() => { server.session = { ...server.session, id, readOnly: true, accepting: false, elapsedMs: 5520000, capturedThroughMs: 5520000, analyzedThroughMs: 5520000, title: "Débat du 12 oct., 20:55" }; server.jobs = []; server.cards = [{ id: "moment-1", title: "Ouverture du débat", startMs: 0, endMs: 8000, summary: "Le débat commence.", segmentIds: ["moment-1"], thumbnailId: "moment-1", status: "ready", pending: 0, failed: 0 }]; });
      if (action === "resume") server.publish(() => { Object.assign(server.session, { readOnly: false, accepting: true }); });
      if (action === "delete") server.publish(() => { server.deleted.push(id); });
      return action === "delete" ? { deleted: true, id, freedBytes: 0 } : { id, readOnly: action === "open", accepting: action === "resume", elapsedMs: 5520000 };
    };
    // Timeline layout, then the toolbar with the arrows.
    await page.locator("#show-timeline").focus();
    await t.press("Enter");
    await t.until(() => document.body.dataset.mode === "timeline" && !document.body.dataset.switching, "disposition frise");
    await t.until(() => document.activeElement.classList.contains("timeline-card"), "frise focalisée");
    await t.press("ArrowUp");
    assert.equal(await t.focused(), "timeline-live");
    await t.press("ArrowRight", 2);
    assert.equal(await t.focused(), "timeline-sessions");
    await t.press("ArrowRight");
    assert.equal(await t.focused(), "timeline-end");
    await t.press("ArrowLeft");
    await t.press("Enter");
    await t.until(() => document.querySelectorAll(".session-card").length === 3, "sessions listées");
    assert.deepEqual(server.gets.filter((g) => g === "/v1/sessions").length, 1, "the list is read on request");
    assert.equal(await page.locator("#timeline-rail").isVisible(), false);
    const rows = await page.evaluate(() => [...document.querySelectorAll(".session-card")].map((n) => [...n.children].map((c) => c.textContent)));
    assert.deepEqual(rows, [
      ["Session du 13 oct., 21:04", "12 min · 96 passages · 400 Mo", "Vidéo complète", "Ouverte · capture arrêtée"],
      ["Débat du 12 oct., 20:55", "1 h 32 · 690 passages · 1,2 Go", "Vidéo partielle · 2 passages sans vidéo", ""],
      ["Session du 2 oct., 19:10", "5 min · 37 passages · 0 o", "Texte seul", ""],
    ], "title, duration, volume and media state of each session");
    assert.equal(await t.text("#sessions-storage"), "3 sessions · 1,6 Go · 9 Go libres sur le serveur");
    assert.equal(await t.focused(), SESSION, "the open session is selected first");
    const paneBox = await t.box("#sessions-panel");
    assert.ok(paneBox.top >= 720, "the list lives in the timeline band, outside the video rectangle");
    await t.shot("sessions", "timeline");
    // Open another session read-only: the one in memory stops accepting first, and no capture starts.
    await t.press("ArrowRight");
    assert.equal(await t.focused(), ARCHIVE);
    await t.press("ArrowDown");
    assert.equal(await t.focused(), "session-open");
    assert.equal(await page.locator("#session-resume").isDisabled(), true, "resume is offered only for the archive that is open");
    await t.press("ArrowUp");
    assert.equal(await t.focused(), ARCHIVE);
    await t.press("Enter");
    assert.equal(await t.focused(), "session-open", "OK on a session goes to its actions");
    await t.back();
    assert.equal(await t.focused(), ARCHIVE, "Back: actions -> list");
    await t.press("ArrowDown");
    await t.press("Enter");
    await t.until(() => document.querySelector("#sessions-panel").hidden, "session ouverte");
    assert.deepEqual(server.posts.map((p) => p.path), ["/v1/session/pause", `/v1/sessions/${ARCHIVE}/open`]);
    assert.deepEqual(t.controllerCalls(STARTERS), [], "opening a session starts no capture");
    assert.equal(await t.focused(), "timeline-sessions");
    await t.until(() => /archive en lecture seule/.test(document.querySelector("#timeline-status").textContent), "frise en lecture seule");
    assert.equal(await t.text("#error"), "", "a session change the viewer asked for is not announced as a surprise");
    // Chat layout: banner, connection line, and the capture button offers a choice instead of starting.
    await t.press("ArrowLeft");
    assert.equal(await t.focused(), "timeline-chat");
    await t.press("Enter");
    await t.until(() => document.body.dataset.mode === "chat" && !document.body.dataset.switching, "disposition chat");
    assert.equal(await t.text("#archive-banner"), "Archive · lecture seule — Débat du 12 oct., 20:55 · enregistrée jusqu’à 1:32:00. Rien n’est capturé : tu peux relire et poser des questions.");
    assert.equal(await t.text("#connection"), "Archive ouverte · capture arrêtée");
    await t.until(() => document.querySelector("#capture").textContent === "Reprendre ou nouvelle session…", "bouton de capture en lecture seule");
    assert.equal(await t.text("#capture-state"), "Archive ouverte en lecture seule · rien n’est capturé.");
    assert.equal(await t.focused(), "dictate");
    await t.press("ArrowDown");
    assert.equal(await t.focused(), "capture");
    await t.press("Enter");
    assert.equal(await page.locator("#archive-capture-dialog").evaluate((n) => n.open), true);
    assert.equal(await t.focused(), "archive-cancel", "the harmless choice is focused first");
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("#archive-capture-dialog button")].map((n) => n.textContent)), ["Annuler", "Nouvelle session", "Reprendre ici"]);
    const dialogBox = await t.box("#archive-capture-dialog");
    assert.equal(intersects(dialogBox, VIDEO.chat), false, "the dialog sits over the chat column, not over the picture");
    await t.shot("dialogue-trois-choix", "chat");
    await t.press("ArrowRight");
    assert.equal(await t.focused(), "archive-new");
    await t.press("ArrowRight");
    assert.equal(await t.focused(), "archive-resume");
    await t.back();
    assert.equal(await page.locator("#archive-capture-dialog").evaluate((n) => n.open), false, "Back cancels");
    assert.equal(await t.focused(), "capture");
    assert.deepEqual(t.controllerCalls(STARTERS), [], "nothing started by cancelling");
    // "Reprendre ici" refused for lack of room: the 507 of the server is shown in its own words.
    server.refuse[`/v1/sessions/${ARCHIVE}/resume`] = { status: 507, body: { error: "Espace disque insuffisant : la capture est suspendue pour ne rien supprimer. 0,8 Go libres, 1 Go requis.", code: "storage-full" } };
    await t.press("Enter");
    await t.press("ArrowRight", 2);
    await t.press("Enter");
    await t.until(() => document.querySelector("#archive-error").textContent !== "", "refus 507 affiché");
    assert.equal(await t.text("#archive-error"), "Espace disque insuffisant : la capture est suspendue pour ne rien supprimer. 0,8 Go libres, 1 Go requis.");
    assert.equal(await page.locator("#archive-capture-dialog").evaluate((n) => n.open), true, "the dialog stays: nothing was resumed");
    assert.deepEqual(t.controllerCalls(STARTERS), [], "no capture after a refusal");
    // Room again: explicit resume, the server first, then the capture of this TV.
    delete server.refuse[`/v1/sessions/${ARCHIVE}/resume`];
    assert.equal(await t.focused(), "archive-resume");
    await t.press("Enter");
    await t.until(() => !document.querySelector("#archive-capture-dialog").open, "reprise effectuée");
    assert.deepEqual(server.posts.map((p) => p.path).slice(-2), [`/v1/sessions/${ARCHIVE}/resume`, `/v1/sessions/${ARCHIVE}/resume`]);
    assert.deepEqual(t.controllerCalls(STARTERS), ["POST /capture/start"], "resume: one explicit capture start, after the server left read-only");
    assert.equal(await t.focused(), "capture");
    await t.until(() => document.querySelector("#capture").textContent === "Arrêter la capture", "capture relancée");
    assert.match(await t.text("#capture-state"), /arrêt automatique après 6 h ou après 10 min sans lecture/, "the bounds of the capture are told while it runs");
    await t.until(() => document.querySelector("#archive-banner").hidden, "bandeau d’archive retiré");
    // End of capture and its cause; nothing restarts by itself.
    Object.assign(controller.capture, { active: false, exitCode: 0,
      report: { stopped: true, sent: 412, stopReason: "duration", limits: { seconds: 21600, idleSeconds: 600 } },
    });
    await t.until(() => /limite/.test(document.querySelector("#capture-state").textContent), "fin de capture par durée");
    assert.equal(await t.text("#capture-state"),
      "Capture terminée : limite de 6 h atteinte. Elle ne reprend pas seule : relance-la pour continuer.");
    Object.assign(controller.capture.report, { stopReason: "idle" });
    await t.until(() => /sans lecture/.test(document.querySelector("#capture-state").textContent), "fin de capture par inactivité");
    assert.equal(await t.text("#capture-state"), "Capture arrêtée : 10 min sans lecture YouTube. Elle ne reprend pas seule.");
    await t.advance(5000);
    assert.deepEqual(t.controllerCalls(STARTERS), ["POST /capture/start"], "an ended capture is never restarted without the viewer");
    // Delete with confirmation, Cancel focused first.
    await page.locator("#show-timeline").focus();
    await t.press("Enter");
    await t.until(() => document.body.dataset.mode === "timeline" && !document.body.dataset.switching, "retour à la frise");
    await page.locator("#timeline-sessions").focus();
    await t.press("Enter");
    await t.until(() => document.querySelectorAll(".session-card").length === 3, "sessions relues");
    await t.press("ArrowRight", 2);
    assert.equal(await t.focused(), OLD);
    await t.press("ArrowDown");
    await t.press("ArrowRight");
    assert.equal(await t.focused(), "session-delete");
    await t.press("Enter");
    assert.equal(await page.locator("#delete-session-dialog").evaluate((n) => n.open), true);
    assert.equal(await t.focused(), "delete-cancel", "Cancel is focused first");
    assert.match(await t.text("#delete-subject"), /Session du 2 oct\., 19:10/);
    assert.match(await t.text("#delete-removed"), /Seront effacés du serveur/);
    assert.match(await t.text("#delete-kept"), /Aucune autre session n’est touchée\./);
    assert.equal(intersects(await t.box("#delete-session-dialog"), VIDEO.timeline), false, "the confirmation sits over the band, not over the picture");
    await t.shot("suppression-confirmation", "timeline");
    await t.press("Enter");
    assert.equal(await page.locator("#delete-session-dialog").evaluate((n) => n.open), false, "OK on Cancel deletes nothing");
    assert.equal(server.posts.filter((p) => p.path.endsWith("/delete")).length, 0);
    assert.equal(await t.focused(), "session-delete");
    await t.press("Enter");
    await t.press("ArrowRight");
    assert.equal(await t.focused(), "delete-confirm");
    await t.press("Enter");
    await t.until(() => document.querySelectorAll(".session-card").length === 2, "session supprimée");
    assert.deepEqual(server.posts.filter((p) => p.path.endsWith("/delete")).map((p) => p.path), [`/v1/sessions/${OLD}/delete`], "one session deleted, and only that one");
    assert.equal(await page.locator("#delete-session-dialog").evaluate((n) => n.open), false);
    // New session: the open one is closed as it is (archived), then the capture starts.
    const startsBefore = t.controllerCalls(STARTERS).length;
    await t.press("ArrowDown");
    for (let i = 0; i < 5 && (await t.focused()) !== "session-new"; i++) await t.press("ArrowRight");
    assert.equal(await t.focused(), "session-new");
    await t.press("Enter");
    await t.until(() => document.querySelector("#sessions-panel").hidden, "nouvelle session lancée");
    assert.equal(server.posts.at(-1).path, "/v1/sessions/close", "the open session is closed, never deleted");
    assert.equal(t.controllerCalls(STARTERS).length, startsBefore + 1);
    assert.equal(await page.evaluate(() => window.__media), 0);
    assert.deepEqual(t.errors, []);
    await page.close();
    done.push("sessions aux flèches : liste, ouverture en lecture seule sans capture, dialogue à trois choix, 507 en clair, reprise explicite, cause de fin de capture, suppression confirmée (Annuler d’abord), nouvelle session");
  }
  // ---- 8. The real server of this tree, over real HTTP: CORS preflight, exposed ETag, 304 in the browser ----
  // No interception between the page and the server here. HeadlessRuntime in smoke mode with a scripted chat
  // agent: no provider is called; ephemeral loopback port, temporary data directory.
  {
    const { HeadlessRuntime } = require("../runtime/headless-runtime.cjs"), { RemoteServer } = require("../server/http.cjs");
    const data = await fs.mkdtemp(path.join(temporary, "tvlens-smoke-server-")), token = "s".repeat(64);
    const agent = { async prepare() {}, async close() {}, async answer({ onProgress }) { onProgress({ message: "Codex examine le contexte…" }); await sleep(900); return { answer: "Réponse scriptée du smoke.", kind: "explanation", citations: [], limits: [], sources: [] }; } };
    const runtime = new HeadlessRuntime({ userData: data, sessionsRoot: path.join(data, "sessions"), config: {}, transcriptionSettings: { save: async (value) => value },
      selectedModels: { observationModel: "fake", inspectionModel: "fake", codexModel: "" }, codexBinary: "codex", smoke: true, agent });
    const live = await new RemoteServer({ runtime, media: { assemble: async (input) => input }, token }).listen(0, "127.0.0.1");
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }), errors = [], seen = [];
    try {
      const post = (route) => fetch(live.url + route, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: "{}" }).then((response) => response.json());
      const session = await post("/v1/session/start"); // what the capture of the TV does when it starts
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => { const request = response.request(); if (request.url().startsWith(live.url + "/v1/state")) seen.push({ method: request.method(), url: request.url().slice(live.url.length), tag: request.headers()["if-none-match"] || null, status: response.status() }); });
      await page.addInitScript((config) => { window.TVLENS_REMOTE = config; window.close = () => {}; }, { url: live.url, token });
      await page.route("http://127.0.0.1:8788/**", (route) => {
        const name = new URL(route.request().url()).pathname;
        return name.startsWith("/ambient")
          ? route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
          : route.fulfill({ json: { active: false, stopping: false, exitCode: null, report: {} } });
      });
      await page.goto(index);
      await page.waitForFunction(() => window.tvlensPanel && window.tvlensPanel.stats.notModified >= 3, null, { timeout: 15000 });
      const reads = seen.filter((r) => r.method === "GET");
      assert.deepEqual([reads[0].url, reads[0].tag, reads[0].status], ["/v1/state?view=panel", null, 200]);
      assert.ok(reads.slice(1).every((r) => r.url === "/v1/state?view=panel" && r.tag), "the browser sends If-None-Match to the real server: its preflight allows it, and its ETag is exposed to the page");
      assert.ok(reads.filter((r) => r.status === 304).length >= 3, "real 304 answers reach the page: " + JSON.stringify(reads.map((r) => r.status)));
      assert.equal(await page.evaluate(() => window.tvlensPanel.stats.legacy), false);
      assert.equal(await page.locator("#connection").textContent(), "Capture reçue");
      // A question through the interface, answered by the scripted agent: fast chat view, then the result.
      const before = seen.length;
      await page.locator("#question").fill("Que se passe-t-il ?");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => /Terminé/.test(document.querySelector("#conversation").textContent), null, { timeout: 15000 });
      assert.match(await page.locator("#conversation").textContent(), /Réponse scriptée du smoke\./);
      assert.equal(await page.locator("#conversation article").count(), 1);
      const during = seen.slice(before).filter((r) => r.method === "GET");
      assert.ok(during.some((r) => r.url === "/v1/state?view=chat"), "the chat view is polled while the question runs: " + JSON.stringify(during.map((r) => r.url + ":" + r.status)));
      assert.ok(during.length >= 4, "fast cadence while the question runs");
      // Surveillance and sessions against the real routes.
      await page.locator("#show-surveillance").focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.activeElement.id === "surv-toggle");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelector("#surv-toggle").textContent === "Arrêter la surveillance", null, { timeout: 10000 });
      assert.equal(runtime.snapshot("chat").surveillance.enabled, true, "the real runtime runs the surveillance the remote asked for");
      assert.match(await page.locator("#surv-status").textContent(), /^Surveillance active\./);
      assert.equal(await page.locator("#surv-overlay").textContent(), "");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      assert.equal(await page.evaluate(() => document.activeElement.id), "surv-history-open");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => /Aucun résultat pour l’instant/.test(document.querySelector("#surv-list-status").textContent), null, { timeout: 10000 });
      await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 461, bubbles: true, cancelable: true })));
      await page.waitForFunction(() => document.activeElement.id === "surv-history-open");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      assert.equal(await page.evaluate(() => document.activeElement.id), "surv-toggle");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelector("#surv-toggle").textContent === "Activer la surveillance", null, { timeout: 10000 });
      assert.equal(runtime.snapshot("chat").surveillance.enabled, false);
      const library = await fetch(live.url + "/v1/sessions", { headers: { Authorization: "Bearer " + token } }).then((response) => response.json());
      assert.equal(library.current.id, session.id);
      assert.deepEqual(errors, []);
      done.push("serveur réel de l’arbre en HTTP (port éphémère, agent scripté) : préflight CORS, ETag exposé, 304 dans le navigateur, question par la vue chat, surveillance activée puis arrêtée");
    } finally {
      await page.close();
      await live.close().catch(() => {});
      await runtime.close().catch(() => {});
      await fs.rm(data, { recursive: true, force: true });
    }
  }
  if (!overlayModule) console.log("NON EXÉCUTÉ : carte bas-gauche (tv/app/surveillance-overlay.js absent de l’arbre au moment du smoke).");
  for (const line of done) console.log("PASS · " + line);
  console.log("Captures : " + out);
  console.log("Preuve navigateur (Chrome de bureau, copie temporaire sans connection.js) ; aucune preuve sur la TV.");
} finally {
  await browser.close();
  await fs.rm(copy, { recursive: true, force: true });
}
