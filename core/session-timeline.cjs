// Projection of observed passages, never an inference or provider call.
const topicKey = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function sessionTimeline(snapshot) {
  if (!snapshot) return { sessionId: null, cards: [] };
  const cards = [];
  for (const passage of [...snapshot.history, ...snapshot.segments]) {
    const observation = passage.observation || {};
    const ready = passage.status === "ready";
    const topic = ready ? topicKey(observation.topic) : "";
    let card = cards.at(-1);
    // Never group across an unanalysed passage or a capture gap. No guessed topics.
    if (
      !topic ||
      !card ||
      card.topicKey !== topic ||
      passage.startMs - card.endMs > 1000
    ) {
      card = {
        id: passage.id,
        startMs: passage.startMs,
        endMs: passage.endMs,
        title: ready
          ? observation.topic || "Passage observé"
          : passage.status === "partial" ? "Analyse partielle" : "Analyse en attente",
        topicKey: topic,
        segmentIds: [],
        summaries: [],
        statuses: [],
        thumbnailId: null,
        pending: 0,
        failed: 0,
        mediaAvailable: false,
      };
      cards.push(card);
    }
    card.segmentIds.push(passage.id);
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
    card.mediaAvailable ||= Boolean(passage.available);
  }
  return {
    sessionId: snapshot.id,
    cards: cards.map(({ topicKey, summaries, statuses, ...card }) => ({
      ...card,
      summary: summaries.slice(-2).join(" ").slice(0, 900),
      status: card.failed ? "error" : card.pending ? "pending" : statuses.includes("partial") ? "partial" : "ready",
      title:
        card.failed && !summaries.length ? "Passage non analysé" : card.title,
    })),
  };
}
function momentDetail(snapshot, selection) {
  const all = [...snapshot.history, ...snapshot.segments];
  let ids = selection;
  // Boundary IDs keep long-topic requests small and frozen as new passages arrive.
  if (selection && !Array.isArray(selection)) {
    const first = all.findIndex(p => p.id === selection.firstId);
    const last = all.findIndex(p => p.id === selection.lastId);
    if (first < 0 || last < first) throw Error("Bornes de moment invalides.");
    ids = all.slice(first, last + 1).map(p => p.id);
  }
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    new Set(ids).size !== ids.length
  )
    throw Error("Sélection de moments invalide.");
  const wanted = new Set(ids);
  const selected = all.filter((p) => wanted.has(p.id));
  if (selected.length !== ids.length)
    throw Error("Moment absent de cette session.");
  // The selection must form a contiguous observed interval, not arbitrary omitted evidence.
  const first = all.indexOf(selected[0]);
  if (
    all
      .slice(first, first + selected.length)
      .some((p, i) => p.id !== selected[i].id)
  )
    throw Error("Intervalle discontinu.");
  return {
    sessionId: snapshot.id,
    startMs: selected[0].startMs,
    endMs: selected.at(-1).endMs,
    passages: selected.map((p) => ({
      id: p.id,
      startMs: p.startMs,
      endMs: p.endMs,
      status: p.status,
      audioStatus: p.audioStatus,
      visionStatus: p.visionStatus,
      audioError: p.audioError,
      visionError: p.visionError,
      transcript: p.observation?.transcript || "",
      summary: p.observation?.summary || "",
      uncertainty: p.observation?.uncertainty || "",
      available: Boolean(p.available),
    })),
  };
}
module.exports = { sessionTimeline, momentDetail };
