const { sessionTimeline } = require("../core/session-timeline.cjs");
const { CARD_LABELS } = require("../core/surveillance.cjs");
const { refusal } = require("./errors.cjs");

// Light views of the state. With durable sessions the complete state weighs megabytes after a film:
// a poll gets a view that never carries the texts of every passage.
const VIEWS = ["chat", "panel"];
const PANEL_SEGMENTS = 40,
  PANEL_JOBS = 30,
  CHAT_JOBS = 8,
  PANEL_FULL_CARDS = 12,
  CARD_EXCERPT = 240,
  GAPS_TAIL = 20,
  HISTORY_PAGE = 20,
  HISTORY_MAX = 50;
// Allow-list, not "everything but the lists": a field added to the session state later cannot make a
// polled view grow with the session.
const HEADER = [
  "id",
  "accepting",
  "asking",
  "analyzing",
  "elapsedMs",
  "capturedThroughMs",
  "analyzedThroughMs",
  "analysisLagMs",
  "contextThroughMs",
  "retentionMs",
  "retention",
  "readOnly",
  "pending",
  "audioPending",
  "visionPending",
  "lastError",
  "coverage",
];
const active = (job) => job.status === "queued" || job.status === "running";
const clip = (value, max) =>
  typeof value === "string" && value.length > max
    ? value.slice(0, max).trimEnd() + "…"
    : value;
const ordinal = (id) => Number(String(id).split("-").pop()) || 0;

// Passage of the panel view: what a card label or a citation needs, never the transcript.
const lightPassage = (p) => ({
  id: p.id,
  startMs: p.startMs,
  endMs: p.endMs,
  status: p.status,
  audioStatus: p.audioStatus,
  visionStatus: p.visionStatus,
  available: Boolean(p.available),
  ...(p.mediaReason ? { mediaReason: p.mediaReason } : {}),
  thumbnailAvailable: Boolean(p.thumbnailAvailable),
  observation: p.observation
    ? { topic: p.observation.topic, summary: clip(p.observation.summary, 600) }
    : null,
});
// Question of a polled view: everything a card shows, whatever a later change adds to a job. The
// diagnostics named here stay in the complete state, and a finished answer no longer travels with
// the draft it replaced.
function lightJob(job) {
  const {
    audit,
    memoryPreview,
    validation,
    evidenceAtStart,
    contextReadyAt,
    firstProgressAt,
    firstUsefulAt,
    firstAgentAt,
    firstTextAt,
    sourcesReused,
    metrics,
    result,
    ...rest
  } = job;
  const light = { ...rest };
  if (metrics) {
    const { tools, evidence, ...figures } = metrics;
    light.metrics = figures;
  }
  if (result)
    light.result = {
      ...result,
      observations: (result.observations || []).map(
        ({ id, startMs, endMs }) => ({ id, startMs, endMs }),
      ),
    };
  if (job.status === "done" && result) {
    delete light.preview;
    delete light.provisional;
    delete light.activity;
  }
  return light;
}
function captureGapsOf(passages) {
  const gaps = [];
  let through = 0;
  for (const passage of passages) {
    if (passage.startMs - through > 1000)
      gaps.push({ startMs: through, endMs: passage.startMs });
    through = Math.max(through, passage.endMs);
  }
  return gaps;
}

// History of a surveillance registry, most recent first, read from memory only. One item per grouped
// result (a lot with sourced claims, or a lot of signals) and one per claim that is in no such result:
// waiting, undetermined, failed and cancelled claims stay listed with their video origin. `seq` is
// stable for an item, so a page never shifts while the registry moves.
function surveillanceHistory(
  registry,
  { beforeSeq, limit = HISTORY_PAGE } = {},
) {
  if (
    beforeSeq !== undefined &&
    beforeSeq !== null &&
    !(Number.isInteger(beforeSeq) && beforeSeq > 0)
  )
    throw refusal(400, "Curseur d’historique invalide.");
  if (!Number.isInteger(limit) || limit < 1)
    throw refusal(400, "Limite d’historique invalide.");
  const items = [],
    grouped = new Set();
  for (const lot of registry.lots || []) {
    const ids = lot.kind === "signal" ? lot.claimIds : lot.sourcedClaimIds;
    if (lot.status !== "done" || !ids?.length) continue;
    for (const id of ids) grouped.add(id);
    items.push({
      seq: Math.max(...ids.map(ordinal)) * 2 + 1,
      id: lot.id,
      kind: "lot",
      cardKind: lot.kind,
      label: CARD_LABELS[lot.kind],
      status: lot.kind === "signal" ? "noted" : "sourced",
      late: false,
      startMs: Math.min(...lot.origin.map((o) => o.startMs)),
      endMs: Math.max(...lot.origin.map((o) => o.endMs)),
      text: lot.text,
      claimCount: ids.length,
      sourceCount: lot.sources.length,
      overlay: Boolean(lot.overlay),
      publishedAtMs: lot.publishedAtMs,
      finishedAt: lot.finishedAt,
    });
  }
  for (const claim of registry.claims || []) {
    if (grouped.has(claim.id)) continue;
    items.push({
      seq: ordinal(claim.id) * 2,
      id: claim.id,
      kind: "claim",
      action: claim.action,
      status: claim.status,
      late: Boolean(claim.late),
      startMs: claim.origin?.startMs ?? null,
      endMs: claim.origin?.endMs ?? null,
      text: claim.statement,
      quote: claim.origin?.quote || "",
      reason: claim.reason || claim.error || null,
      claimCount: 1,
      sourceCount: 0,
      overlay: false,
      lotId: claim.lotId,
      detectedAt: claim.detectedAt,
      finishedAt: claim.finishedAt,
    });
  }
  items.sort((a, b) => b.seq - a.seq);
  const rest = beforeSeq ? items.filter((item) => item.seq < beforeSeq) : items,
    page = rest.slice(0, Math.min(limit, HISTORY_MAX));
  return {
    sessionId: registry.sessionId,
    items: page,
    nextBeforeSeq: rest.length > page.length ? page.at(-1).seq : null,
    counts: registry.counts,
    totals: { ...registry.totals, items: items.length },
  };
}
// One result or one claim in full: text, claims, video origins, sources, uncertainties, delays.
function surveillanceDetail(registry, id) {
  if (typeof id !== "string" || !/^(?:lot|claim)-\d+$/.test(id))
    throw refusal(400, "Identifiant de surveillance invalide.");
  const lot = registry.lots.find((item) => item.id === id),
    claim = registry.claims.find((item) => item.id === id);
  if (!lot && !claim)
    throw refusal(404, "Élément de surveillance introuvable.", "not-found");
  const ids = lot ? lot.claimIds : [claim.id];
  return {
    sessionId: registry.sessionId,
    id,
    kind: lot ? "lot" : "claim",
    lot: lot || registry.lots.find((item) => item.id === claim.lotId) || null,
    claims: registry.claims.filter((item) => ids.includes(item.id)),
  };
}

function deriveStateViews({ state, jobs, title }) {
  const derived = { jobTotal: jobs.length };
  // Every question still moving, then the most recent ones: a client merges by id and never reads
  // an absence as a deletion.
  const recent = (count) =>
    jobs
      .filter((job, i) => active(job) || i >= jobs.length - count)
      .map(lightJob);
  derived.chatJobs = recent(CHAT_JOBS);
  derived.panelJobs = recent(PANEL_JOBS);
  if (!state)
    return {
      ...derived,
      header: null,
      timeline: sessionTimeline(null),
      captureGaps: [],
      captureGapCount: 0,
    };
  const all = [...state.history, ...state.segments],
    gaps = captureGapsOf(all),
    timeline = sessionTimeline(state),
    full = timeline.cards.length - PANEL_FULL_CARDS;
  // Older cards keep their place, title, interval and thumbnail, with an excerpt of their summary:
  // the whole text comes back with the detail of the moment.
  timeline.cards = timeline.cards.map((card, i) => {
    if (i >= full || !card.summary || card.summary.length <= CARD_EXCERPT)
      return card;
    const { summaryLimits, ...light } = card;
    return {
      ...light,
      summary: clip(card.summary, CARD_EXCERPT),
      summaryClipped: true,
    };
  });
  return {
    ...derived,
    header: {
      ...Object.fromEntries(HEADER.map((key) => [key, state[key]])),
      title,
      passages: all.length,
      gapCount: state.gaps.length,
      gaps: state.gaps.slice(-GAPS_TAIL),
      audioGapCount: state.audioGaps.length,
      visionGapCount: state.visionGaps.length,
    },
    segments: state.segments.slice(-PANEL_SEGMENTS).map(lightPassage),
    // History entries are summaries without media; everything else is replayable unless listed here.
    unavailableIds: [
      ...state.history.map((p) => p.id),
      ...state.segments.filter((p) => !p.available).map((p) => p.id),
    ],
    timeline,
    captureGaps: gaps.slice(-GAPS_TAIL),
    captureGapCount: gaps.length,
  };
}

function stateView(
  name,
  derived,
  {
    liveSession,
    timeoutMs,
    revision,
    serverNowMs,
    transcriptionLanguage,
    surveillance,
    storage,
  },
) {
  const session = derived.header && {
    ...derived.header,
    ...liveSession,
    asking: Boolean(liveSession.asking),
  };
  const chat = (jobs) => ({
    jobs,
    total: derived.jobTotal,
    timeoutMs,
  });
  const common = {
    view: name,
    revision,
    serverNowMs,
    transcription: { language: transcriptionLanguage || "fr" },
    surveillance,
    storage,
  };
  if (name === "chat")
    return { ...common, session, chat: chat(derived.chatJobs) };
  return {
    ...common,
    session: session && {
      ...session,
      segments: derived.segments,
      unavailableIds: derived.unavailableIds,
    },
    timeline: derived.timeline,
    captureGaps: derived.captureGaps,
    captureGapCount: derived.captureGapCount,
    chat: chat(derived.panelJobs),
  };
}

function overlayView({
  sessionId,
  accepting,
  readOnly,
  elapsedMs,
  surveillance,
  storage,
  revision,
  serverNowMs,
}) {
  return {
    sessionId: sessionId ?? null,
    enabled: surveillance.enabled,
    accepting: Boolean(accepting),
    readOnly: Boolean(readOnly),
    elapsedMs: elapsedMs ?? null,
    activity: surveillance.activity,
    // How the registry is kept: the ambient display tells a restoration from a session without results.
    registry: surveillance.registry || null,
    overlay: surveillance.overlay,
    signals: surveillance.signals,
    storage: { state: storage.state },
    revision,
    serverNowMs,
  };
}

module.exports = {
  VIEWS,
  PANEL_SEGMENTS,
  PANEL_JOBS,
  CHAT_JOBS,
  PANEL_FULL_CARDS,
  CARD_EXCERPT,
  GAPS_TAIL,
  HISTORY_PAGE,
  HISTORY_MAX,
  HEADER,
  active,
  clip,
  lightPassage,
  lightJob,
  captureGapsOf,
  surveillanceHistory,
  surveillanceDetail,
  deriveStateViews,
  stateView,
  overlayView,
};
