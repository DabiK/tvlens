import systemPaths from '../adapters/system-paths.cjs';
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const jpeg = "/tmp/tvlens-timeline-fixture.jpg";
await promisify(execFile)(systemPaths.executable('ffmpeg', {override:process.env.TVLENS_FFMPEG}), [
  "-nostdin",
  "-y",
  "-v",
  "error",
  "-ss",
  "30",
  "-i",
  "media/samples/kennedy-rice-7min.mp4",
  "-frames:v",
  "1",
  "-vf",
  "scale=640:-2",
  jpeg,
]);
const image = await fs.readFile(jpeg);
const card = (n, status = "ready") => ({
  id: "moment-" + n,
  title: "Sujet observé " + n,
  startMs: (n - 1) * 8000,
  endMs: n * 8000,
  summary: "Un discours en plein air. Les propos restent attribués à la vidéo.",
  segmentIds: ["moment-" + n],
  thumbnailId: "moment-" + n,
  status,
  pending: status === "pending" ? 1 : 0,
  failed: 0,
  mediaAvailable: n > 1,
});
let items = [card(1), card(2), card(3, "pending")];
let state = {
  session: {
    id: "timeline-test",
    elapsedMs: 24000,
    capturedThroughMs: 24000,
    analyzedThroughMs: 16000,
    pending: 1,
    gaps: [],
    history: [],
    segments: [
      { id: "moment-1", available: false },
      { id: "moment-2", available: true },
      { id: "moment-3", available: true, status: "analyzing" },
    ],
  },
  chat: { jobs: [] },
  timeline: { sessionId: "timeline-test", cards: items },
};
let mode = "chat",
  requestId,
  ended = false,
  asked;
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.TVLENS_REMOTE = {
      url: "http://timeline.test",
      token: "x".repeat(64),
    };
    window.close = () => (window.__closed = (window.__closed || 0) + 1);
  });
  await page.route("http://127.0.0.1:8788/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/panel/")) {
      mode = url.pathname.split("/").at(-1);
      requestId = "request-" + Date.now();
      return route.fulfill({ json: { id: requestId, mode } });
    }
    if (url.pathname === "/panel")
      return route.fulfill({ json: { active: true, mode, requestId } });
    return route.fulfill({
      json: { active: false, stopping: false, exitCode: 0, report: {} },
    });
  });
  await page.route("http://timeline.test/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/v1/thumbnail/"))
      return route.fulfill({ contentType: "image/jpeg", body: image });
    if (url.pathname === "/v1/moments/detail") {
      const body = route.request().postDataJSON();
      return route.fulfill({
        json: {
          sessionId: body.sessionId,
          summary: body.firstId === "moment-1"
            ? "Argument initial conservé. Réponse et désaccord non résolu."
            : "Description du passage sélectionné.",
          summaryKind: body.firstId === "moment-1" ? "cumulative" : "bounded-excerpts",
          summaryLimits: body.firstId === "moment-1"
            ? "Résumé cumulatif automatique, non vérifié."
            : "Extraits récents uniquement.",
          passages: [body.firstId, body.lastId].map((id) => ({
            id,
            startMs: 0,
            endMs: 8000,
            transcript:
              "Transcription de démonstration, potentiellement imprécise.",
            available: false,
          })),
        },
      });
    }
    if (url.pathname === "/v1/questions") {
      asked = route.request().postDataJSON();
      return route.fulfill({ json: { id: "deep-1" } });
    }
    if (url.pathname === "/v1/session/end") {
      ended = true;
      state = {
        session: null,
        chat: { jobs: [] },
        timeline: { sessionId: null, cards: [] },
      };
      return route.fulfill({ json: { ended: true } });
    }
    return route.fulfill({ json: state });
  });
  await page.goto(pathToFileURL(path.resolve("tv/app/index.html")).href);
  await page.waitForFunction(() => window.tvlensTimeline?.cards.length === 3);
  await page.locator("#show-timeline").click();
  await page.waitForFunction(() => document.body.dataset.mode === "timeline");
  assert.equal(await page.locator("#chat-panel").isVisible(), false);
  assert.equal(
    await page
      .locator("#timeline-panel")
      .evaluate((n) => Math.round(n.getBoundingClientRect().top)),
    720,
  );
  await page.waitForFunction(
    () => document.querySelector(".timeline-card img")?.naturalWidth > 0,
  );
  await page.keyboard.press("ArrowLeft");
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.id),
    "moment-2",
  );
  // Updates and group merges must not steal focus or discard the selected placeholder.
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.id),
    "moment-3",
  );
  items = [
    {
      ...card(1),
      segmentIds: ["moment-1", "moment-2", "moment-3"],
      endMs: 24000,
    },
    card(4),
  ];
  state.timeline.cards = items;
  state.session.segments[2] = {
    id: "moment-3",
    status: "ready",
    available: true,
    observation: { topic: "Sujet fusionné", summary: "Le sujet continue." },
  };
  await page.waitForTimeout(1200);
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.id),
    "moment-3",
    "Pending selection survives grouping",
  );
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => !document.querySelector("#moment-detail").hidden,
  );
  await page.locator("#detail-words").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#detail-transcript")
      .textContent.includes("Transcription"),
  );
  assert.equal(await page.locator("#detail-transcript").isVisible(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#moment-detail").isVisible(), false);
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.id),
    "moment-3",
  );
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#detail-summary").textContent ===
    "Argument initial conservé. Réponse et désaccord non résolu.");
  assert.match(await page.locator("#detail-limits").textContent(), /Résumé cumulatif/);
  const previousSummary = state.timeline.cards[0].summary;
  state.timeline.cards[0].summary = "Un événement futur ne doit pas modifier le détail ouvert.";
  await page.waitForTimeout(1200);
  assert.equal(await page.locator("#detail-summary").textContent(),
    "Argument initial conservé. Réponse et désaccord non résolu.");
  state.timeline.cards[0].summary = previousSummary;
  await page.locator("#detail-ask").click();
  await page.waitForFunction(() => document.body.dataset.mode === "chat");
  assert.equal(await page.locator("#moment-context").isVisible(), true);
  await page.locator("#question").fill("Que dit-il ici ?");
  await page.locator("#send").click();
  await page.waitForTimeout(200);
  assert.deepEqual(asked.moment, {firstId:"moment-1",lastId:"moment-3"});
  assert.equal(asked.anchorMs, 24000);
  await page.locator("#clear-moment").click();
  assert.equal(await page.locator("#moment-context").isVisible(), false);
  await page.locator("#show-timeline").click();
  await page.waitForFunction(() => document.body.dataset.mode === "timeline");
  await page.locator("#detail-back").click();
  await page.locator("#timeline-live").click();
  assert.equal(await page.evaluate(() => window.tvlensTimeline.follow), true);
  state.timeline.cards.push(card(5));
  await page.waitForTimeout(1200);
  assert.equal(
    await page.evaluate(() => window.tvlensTimeline.selected),
    "moment-5",
  );
  // Presentation screenshot: real sample frame behind the overlay, not a simulated AI claim.
  await page.evaluate(
    (src) => {
      const n = document.createElement("img");
      n.id = "video-fixture";
      n.src = src;
      n.style =
        "position:absolute;left:320px;top:0;width:1280px;height:720px;object-fit:contain;z-index:-1";
      document.body.style.background = "#000";
      document.body.appendChild(n);
    },
    "data:image/jpeg;base64," + image.toString("base64"),
  );
  await page.screenshot({ path: "/tmp/tvlens-timeline-ui.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.locator("#timeline-end").click();
  await page.locator("#end-confirm").click();
  await page.waitForFunction(
    () => !document.querySelector("#end-session-dialog").open,
  );
  assert.equal(ended, true);
  assert.equal(await page.locator(".timeline-card").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: bottom layout, real thumbnail rendering, focus through grouping, details/transcript, cumulative frozen summary, scoped question, live follow, session end",
  );
} finally {
  await browser.close();
}
