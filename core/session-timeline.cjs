const { domainError } = require('./shared/domain-error.cjs');
const TVLENS_MOMENT_SELECTION_INVALID = 'TVLENS_MOMENT_SELECTION_INVALID';
const TVLENS_MOMENT_MISSING = 'TVLENS_MOMENT_MISSING';
const TVLENS_MOMENT_INTERVAL_DISCONTINUOUS = 'TVLENS_MOMENT_INTERVAL_DISCONTINUOUS';
const { summaryForPassages, continuesTopic, CAPTURE_GAP_MS } = require('./memory/index.cjs');
// La consultation normalise l'absence à null ; le fil historique garde ses champs omis.
const optionalPassageField = (passage, key) =>
  passage[key] ?? (passage.explicitNulls.includes(key) ? null : undefined);
// Projection of observed passages, never an inference or provider call.
const topicKey = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** @param {import('./memory/ports.cjs').MemoryView|null} memory */
function sessionTimeline(memory) {
  if (!memory) return { sessionId: null, cards: [] };
  const cards = [];
  for (const passage of memory.passages) {
    const observation = passage.observation || {};
    const ready = passage.status === "ready";
    const topic = ready || passage.visionStatus === "ready" ? topicKey(observation.topic) : "";
    let card = cards.at(-1);
    // Never group across an unanalysed passage or a capture gap. No guessed topics.
    if (!continuesTopic({ previousTopic: card?.topicKey, topic,
      continuity: observation.topicContinuity, gapMs: passage.startMs - card?.endMs })) {
      card = {
        id: passage.id,
        startMs: passage.startMs,
        endMs: passage.endMs,
        title: topic
          ? observation.topic || "Passage observé"
          : passage.status === "partial" ? "Analyse partielle" : "Analyse en attente",
        topicKey: topic,
        segmentIds: [],
        summaries: [],
        passages: [],
        statuses: [],
        thumbnailId: null,
        pending: 0,
        failed: 0,
        mediaAvailable: false,
      };
      cards.push(card);
    }
    card.segmentIds.push(passage.id);
    card.passages.push(passage);
    card.endMs = passage.endMs;
    card.statuses.push(passage.status);
    if (passage.thumbnailAvailable && !card.thumbnailId)
      card.thumbnailId = passage.id;
    if (
      (ready || passage.status === "partial") &&
      (observation.summary || observation.transcript) &&
      !card.summaries.includes(observation.summary)
    )
      card.summaries.push(observation.summary || observation.transcript);
    if (["queued", "analyzing"].includes(passage.status) || ["queued", "analyzing"].includes(passage.visionStatus)) card.pending++;
    if (["error", "skipped", "expired"].includes(passage.status)) card.failed++;
    card.mediaAvailable ||= passage.availability.replayable;
  }
  return {
    sessionId: memory.session.id,
    cards: cards.map(({ topicKey, summaries, statuses, passages, ...card }) => ({
      ...card,
      ...summaryForPassages(passages),
      status: card.failed ? "error" : card.pending ? "pending" : statuses.includes("partial") ? "partial" : "ready",
      title:
        card.failed && !summaries.length ? "Passage non analysé" : card.title,
    })),
  };
}
/** @param {import('./memory/ports.cjs').MemoryView} memory */
function momentDetail(memory, selection) {
  const all = memory.passages;
  let ids = selection;
  // Boundary IDs keep long-topic requests small and frozen as new passages arrive.
  if (selection && !Array.isArray(selection)) {
    const first = all.findIndex(p => p.id === selection.firstId);
    const last = all.findIndex(p => p.id === selection.lastId);
    if (first < 0 || last < first) throw domainError(TVLENS_MOMENT_SELECTION_INVALID, "Bornes de moment invalides.");
    ids = all.slice(first, last + 1).map(p => p.id);
  }
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    new Set(ids).size !== ids.length
  )
    throw domainError(TVLENS_MOMENT_SELECTION_INVALID, "Sélection de moments invalide.");
  const wanted = new Set(ids);
  const selected = all.filter((p) => wanted.has(p.id));
  if (selected.length !== ids.length)
    throw domainError(TVLENS_MOMENT_MISSING, "Moment absent de cette session.");
  // The selection must form a contiguous observed interval, not arbitrary omitted evidence.
  const first = all.indexOf(selected[0]);
  if (
    all
      .slice(first, first + selected.length)
      .some((p, i) => p.id !== selected[i].id)
  )
    throw domainError(TVLENS_MOMENT_INTERVAL_DISCONTINUOUS, "Intervalle discontinu.");
  return {
    sessionId: memory.session.id,
    ...summaryForPassages(selected),
    startMs: selected[0].startMs,
    endMs: selected.at(-1).endMs,
    passages: selected.map((p) => ({
      id: p.id,
      startMs: p.startMs,
      endMs: p.endMs,
      status: p.status,
      audioStatus: optionalPassageField(p, 'audioStatus'),
      visionStatus: optionalPassageField(p, 'visionStatus'),
      audioError: optionalPassageField(p, 'audioError'),
      visionError: optionalPassageField(p, 'visionError'),
      // The transcriber failed: an empty transcript is not silence.
      ...(p.audioFailed ? { audioFailed: true } : {}),
      transcript: p.observation?.transcript || "",
      summary: p.observation?.summary || "",
      uncertainty: p.observation?.uncertainty || "",
      available: p.availability.replayable,
    })),
  };
}
module.exports = {
  sessionTimeline, momentDetail, optionalPassageField, CAPTURE_GAP_MS,
  TVLENS_MOMENT_SELECTION_INVALID, TVLENS_MOMENT_MISSING, TVLENS_MOMENT_INTERVAL_DISCONTINUOUS,
};
