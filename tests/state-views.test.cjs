const { memoryOf } = require('./helpers/memory-consultation.cjs');
const viewOf = state => memoryOf(state).view();
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  deriveStateViews,
  stateView,
  overlayView,
} = require("../runtime/state-views.cjs");

function publishedState(count = 0) {
  return {
    id: "session-1",
    accepting: true,
    asking: false,
    readOnly: false,
    elapsedMs: count * 8000,
    history: [],
    segments: Array.from({ length: count }, (_, i) => ({
      id: `moment-${i + 1}`,
      startMs: i * 8000,
      endMs: (i + 1) * 8000,
      status: "ready",
      available: true,
      observation: {
        topic: `Sujet ${i + 1}`,
        summary: "Un résumé du passage.",
      },
    })),
    gaps: [],
    audioGaps: [],
    visionGaps: [],
  };
}

test('the light panel preserves declared image absence independently of missing audio files', () => {
  const state = publishedState(2);
  for (const p of state.segments) Object.assign(p, { hasImages: false, available: false,
    mediaReason: 'images-absent', audioStatus: 'ready', visionStatus: 'absent', observation: { transcript: 'Paroles.' } });
  state.segments[1].mediaReason = 'missing';
  const panel = stateView('panel', deriveStateViews({ memory: viewOf(state), jobs: [], title: null }), liveValues());
  assert.ok(panel.session.segments.every(p => p.hasImages === false));
  assert.deepEqual(panel.session.segments.map(p => p.mediaReason), ['images-absent', 'missing']);
  assert.equal(panel.timeline.cards[0].title, 'Son seul · image indisponible');
});

test('light speech excerpts leave empty and null image summaries intact', () => {
  const state = publishedState(3);
  state.segments[0].observation = { summary: '', transcript: 'Paroles à ne pas substituer aux images.' };
  state.segments[1].observation = { summary: null, transcript: 'Autres paroles.' };
  Object.assign(state.segments[2], { hasImages: false, available: false, visionStatus: 'absent',
    observation: { transcript: 'Paroles son seul. ' + 'x'.repeat(1000) } });
  const { segments } = deriveStateViews({ memory: viewOf(state), jobs: [], title: null });
  assert.equal(segments[0].observation.summary, '');
  assert.equal(segments[1].observation.summary, null);
  assert.match(segments[2].observation.summary, /^Paroles son seul/);
  assert.ok(segments[2].observation.summary.length <= 601);
  assert.ok(segments.every(p => !('transcript' in p.observation)));
});

test("panel projections keep forty recent passages and thirty recent questions plus every active question", () => {
  const state = publishedState(55);
  const jobs = Array.from({ length: 45 }, (_, i) => ({
    id: `deep-${i + 1}`,
    status: "done",
  }));
  jobs[0].status = "queued";
  jobs[1].status = "running";
  const derived = deriveStateViews({ memory: viewOf(state), jobs, title: "Débat" });

  assert.equal(derived.segments.length, 40);
  assert.deepEqual(
    derived.segments.map((p) => p.id),
    state.segments.slice(-40).map((p) => p.id),
  );
  assert.equal(derived.panelJobs.length, 32);
  assert.deepEqual(
    derived.panelJobs.map((job) => job.id),
    ["deep-1", "deep-2", ...jobs.slice(-30).map((job) => job.id)],
  );
  assert.equal(derived.jobTotal, 45);
  const panel = stateView("panel", derived, liveValues());
  assert.equal(panel.session.segments.length, 40);
  assert.equal(panel.chat.jobs.length, 32);
  assert.deepEqual(
    panel.chat.jobs.map((job) => job.id),
    derived.panelJobs.map((job) => job.id),
  );
});

test("the polled session header keeps only allowed fields and bounded gap counters", () => {
  const state = publishedState(26);
  for (const passage of state.segments.slice(0, 25)) passage.status = 'error';
  Object.assign(state.segments[25], { status: 'partial', audioStatus: 'error', visionStatus: 'error' });
  const memory = viewOf(state);
  memory.session.privateDiagnostics = { transcript: "Texte à exclure" };
  const { header } = deriveStateViews({ memory, jobs: [], title: "Débat" });

  assert.ok(header);
  assert.equal(header.id, state.id);
  assert.equal(header.title, "Débat");
  assert.equal(header.accepting, true);
  assert.equal("privateDiagnostics" in header, false);
  assert.equal("segments" in header, false);
  assert.equal("history" in header, false);
  assert.equal(header.passages, 26);
  assert.equal(header.gapCount, 25);
  assert.deepEqual(header.gaps, memory.coverage.gaps.slice(-20));
  assert.equal(header.audioGapCount, 1);
  assert.equal(header.visionGapCount, 1);
});

test("older timeline cards keep an excerpt while the twelve latest cards keep the complete summary", () => {
  const state = publishedState(14);
  for (const passage of state.segments)
    passage.observation.summary = "r".repeat(300);
  const original = structuredClone(state);
  const memory = viewOf(state);
  const originalMemory = structuredClone(memory);
  const { timeline } = deriveStateViews({ memory, jobs: [], title: null });

  assert.equal(timeline.cards[0].summaryClipped, true);
  assert.equal(timeline.cards[0].summary, "r".repeat(240) + "…");
  assert.equal("summaryLimits" in timeline.cards[0], false);
  assert.deepEqual(timeline.cards[0].segmentIds, ["moment-1"]);
  assert.equal(timeline.cards.filter((card) => card.summaryClipped).length, 2);
  assert.equal(timeline.cards.at(-1).summary, "r".repeat(300));
  assert.equal(timeline.cards.at(-1).summaryClipped, undefined);
  assert.deepStrictEqual(memory, originalMemory);
  assert.deepEqual(state, original);
});

function liveValues() {
  return {
    liveSession: {
      accepting: false,
      asking: 1,
      readOnly: true,
      elapsedMs: 99000,
      storage: { state: "low", sessionBytes: 123 },
    },
    timeoutMs: 120000,
    revision: 7,
    serverNowMs: 1790000000000,
    transcriptionLanguage: "en",
    surveillance: { enabled: true, activity: { state: "verifying" } },
    storage: { state: "low", freeBytes: 456 },
  };
}

test("chat and panel assemble live values over the published header without changing the cached projection", () => {
  const jobs = Array.from({ length: 12 }, (_, i) => ({
    id: `deep-${i + 1}`,
    status: "done",
  }));
  const derived = deriveStateViews({
    memory: viewOf(publishedState(2)),
    jobs,
    title: "Débat",
  });
  const before = structuredClone(derived);
  const live = liveValues();
  const chat = stateView("chat", derived, live);

  assert.equal(chat.view, "chat");
  assert.deepEqual(Object.keys(chat).sort(), [
    "chat",
    "revision",
    "serverNowMs",
    "session",
    "storage",
    "surveillance",
    "transcription",
    "view",
  ]);
  assert.deepEqual(
    [
      chat.session.id,
      chat.session.title,
      chat.session.accepting,
      chat.session.asking,
      chat.session.readOnly,
      chat.session.elapsedMs,
      chat.session.storage,
    ],
    ["session-1", "Débat", false, true, true, 99000, live.liveSession.storage],
  );
  assert.deepEqual(
    [
      chat.revision,
      chat.serverNowMs,
      chat.transcription,
      chat.storage,
      chat.surveillance,
    ],
    [7, 1790000000000, { language: "en" }, live.storage, live.surveillance],
  );
  assert.deepEqual(
    [chat.chat.jobs.map((job) => job.id), chat.chat.total, chat.chat.timeoutMs],
    [jobs.slice(-8).map((job) => job.id), 12, 120000],
  );
  assert.equal("segments" in chat.session, false);

  const panel = stateView("panel", derived, live);
  assert.equal(panel.session.segments, derived.segments);
  assert.equal(panel.timeline, derived.timeline);
  assert.deepEqual(
    panel.chat.jobs.map((job) => job.id),
    jobs.map((job) => job.id),
  );
  assert.deepEqual(derived, before);
});

test("overlay without a session has null identifiers and elapsed time and only the storage state", () => {
  const state = {
    enabled: false,
    activity: { state: "idle" },
    overlay: { cards: [] },
    signals: { cards: [] },
  };
  const overlay = overlayView({
    sessionId: undefined,
    accepting: undefined,
    readOnly: undefined,
    elapsedMs: undefined,
    surveillance: state,
    storage: { state: "unknown", freeBytes: 456 },
    revision: 3,
    serverNowMs: 123000,
  });

  assert.deepEqual(overlay, {
    sessionId: null,
    enabled: false,
    accepting: false,
    readOnly: false,
    elapsedMs: null,
    activity: { state: "idle" },
    registry: null,
    overlay: { cards: [] },
    signals: { cards: [] },
    storage: { state: "unknown" },
    revision: 3,
    serverNowMs: 123000,
  });
});

test('panel projects frozen cards, retained passages, availability and gaps from the consultation contract', () => {
  const { createMemoryView } = require('../core/memory/index.cjs');
  const { memoryState } = require('../scripts/memory-fixture.cjs');
  const source = require('./fixtures/state-view-memory.json');
  const expected = require('./fixtures/state-view-responses.json')['/v1/state?view=panel'];
  const memory = createMemoryView({ ...memoryState(source), losses: source.losses });
  let derived;
  assert.doesNotThrow(() => { derived = deriveStateViews({ memory, jobs: [], title: null }); });
  assert.deepStrictEqual(derived.timeline, expected.timeline);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(derived.segments)), expected.session.segments);
  assert.deepStrictEqual(derived.unavailableIds, expected.session.unavailableIds);
  assert.deepStrictEqual(derived.captureGaps, expected.captureGaps);
  assert.equal(derived.captureGapCount, expected.captureGapCount);
  assert.deepStrictEqual(derived.header.coverage, { passages: 56, ...source.losses, visionBlockedMs: 0 });
  assert.equal(derived.header.audioGapCount, expected.session.audioGapCount);
  assert.equal(derived.header.visionGapCount, expected.session.visionGapCount);
});

test('polled views take the published identity from consultation and the question flag from live values', () => {
  const memory = viewOf(publishedState(2));
  const derived = deriveStateViews({
    memory, jobs: [], title: 'Débat',
    publicationStatus: { id: 'another-session', asking: false, lastError: 'Erreur étrangère' },
  });
  assert.equal(derived.header.id, memory.session.id);
  assert.equal(derived.header.lastError, memory.session.lastError);
  for (const name of ['chat', 'panel']) {
    const live = liveValues();
    assert.equal(stateView(name, derived, live).session.asking, true);
    live.liveSession.asking = false;
    assert.equal(stateView(name, derived, live).session.asking, false);
  }
});
