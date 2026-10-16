const { passageLatency } = require("../core/latency-trace.cjs");
const {
  SERVER_ORIGIN_MS,
  CLIENT_ORIGIN_MS,
} = require("./latency-environment.cjs");
const span = (end, start) =>
  Number.isFinite(end) && Number.isFinite(start) ? end - start : null;
const stamp = (value) => (Number.isFinite(value) ? value : null);
const ORIGINS = {
  session: 0,
  "server-wall": SERVER_ORIGIN_MS,
  "client-monotonic": CLIENT_ORIGIN_MS,
};

function passageReport(p, events) {
  const at = (kind) =>
    events.find((e) => e.kind === kind && e.closedAtMs === p.endMs)?.atMs ??
    null;
  const queued = events.find(
    (e) =>
      e.kind === "server.published" &&
      e.source === "session" &&
      e.passages.some((s) => s.id === p.id && s.status === "queued"),
  );
  return {
    id: p.id,
    revision: p.revision,
    startMs: p.startMs,
    closedAtMs: p.endMs,
    transportAdmittedMs: at("transport.admitted"),
    preparationStartedMs: at("preparation.started"),
    preparationFinishedMs: at("preparation.finished"),
    coreIngestedMs: p.receivedMs,
    audioQueuedMs: queued ? queued.atMs - SERVER_ORIGIN_MS : null,
    audioStartedMs: stamp(p.audioStartedMs),
    audioPublishedMs: stamp(p.transcriptPublishedMs),
    visionQueuedMs: stamp(p.visionQueuedMs),
    visionStartedMs: stamp(p.visionStartedMs),
    visionPublishedMs: stamp(p.visionPublishedMs),
    intervals: {
      ...passageLatency(p),
      transportMs: span(at("transport.admitted"), p.endMs),
      preparationMs: span(
        at("preparation.finished"),
        at("preparation.started"),
      ),
    },
  };
}

const relativeClient = (value) =>
  Number.isFinite(value) ? value - CLIENT_ORIGIN_MS : null;

function clientReport({ job, events, client, publishedMs, publicationId }) {
  const find = (kind) =>
    events.find(
      (e) =>
        e.kind === kind &&
        e.client === client &&
        e.finishedIds.includes(job.id),
    );
  const received = find("client.received") || {
    atMs: null,
    publicationId: null,
  };
  const applied = find("view.applied") || {
    atMs: null,
    publicationId: null,
    emissionId: null,
  };
  const normalizedPublication = Number.isFinite(publishedMs)
    ? publishedMs - SERVER_ORIGIN_MS
    : null;
  return {
    publicationId,
    receivedPublicationId: received.publicationId,
    appliedPublicationId: applied.publicationId,
    emissionId: applied.emissionId,
    clientReceivedMs: received.atMs,
    clientAppliedMs: applied.atMs,
    publicationToReceiptMs: span(
      relativeClient(received.atMs),
      normalizedPublication,
    ),
    receiptToApplicationMs: span(applied.atMs, received.atMs),
    acceptanceToApplicationMs: span(
      relativeClient(applied.atMs),
      job.createdAt - SERVER_ORIGIN_MS,
    ),
    captureToApplicationMs: span(relativeClient(applied.atMs), job.anchorMs),
  };
}

function questionReport(job, tools, events) {
  const publication = events.find(
    (e) =>
      e.kind === "server.published" &&
      e.source === "deep" &&
      e.jobs.some(
        (j) => j.id === job.id && (j.status === "done" || j.status === "error"),
      ),
  );
  const publishedMs = publication?.atMs ?? null;
  const clients = Object.fromEntries(
    ["mac", "tv"].map((client) => [
      client,
      clientReport({
        job,
        events,
        client,
        publishedMs,
        publicationId: publication?.publicationId ?? null,
      }),
    ]),
  );
  return {
    id: job.id,
    anchorMs: job.anchorMs,
    availability: job.availability,
    acceptedMs: job.createdAt,
    startedMs: stamp(job.startedAt),
    firstAgentMs: stamp(job.firstAgentAt),
    firstUsefulMs: stamp(job.firstUsefulAt),
    firstTextMs: stamp(job.firstTextAt),
    finishedMs: stamp(job.finishedAt),
    status: job.status,
    validation: job.validation ?? null,
    publishedMs,
    passageLinks: (tools?.journal || []).map(({ id, revision, source }) => ({
      id,
      revision,
      source,
    })),
    intervals: job.metrics,
    clients,
  };
}

function caseReport({
  id,
  delays,
  events,
  session,
  deep,
  tools,
  cards,
  cardsByQuestion,
  nodes,
  stats,
}) {
  return {
    id,
    sessionId: session.id,
    parameters: delays,
    passages: session.segments.map((p) => passageReport(p, events)),
    questions: deep.jobs.map((j) => questionReport(j, tools.get(j.id), events)),
    events: [...events],
    cards,
    cardsByQuestion,
    nodes,
    polling: stats,
  };
}
function clockFields() {
  const group = (prefix, domain, fields) =>
    fields.map((field) => [prefix + field, domain]);
  return Object.fromEntries([
    ...group("passages.*.", "session", [
      "startMs",
      "closedAtMs",
      "transportAdmittedMs",
      "preparationStartedMs",
      "preparationFinishedMs",
      "coreIngestedMs",
      "audioQueuedMs",
      "audioStartedMs",
      "audioPublishedMs",
      "visionQueuedMs",
      "visionStartedMs",
      "visionPublishedMs",
    ]),
    ["passages.*.intervals.*", "duration"],
    ["questions.*.anchorMs", "session"],
    ...group("questions.*.availability.", "session", [
      "startMs",
      "throughMs",
      "anchorMs",
      "lastPassage.startMs",
      "lastPassage.endMs",
    ]),
    ...group("questions.*.", "server-wall", [
      "acceptedMs",
      "startedMs",
      "firstAgentMs",
      "firstUsefulMs",
      "firstTextMs",
      "finishedMs",
      "publishedMs",
    ]),
    ...group("questions.*.clients.*.", "client-monotonic", [
      "clientReceivedMs",
      "clientAppliedMs",
    ]),
    ...group("questions.*.clients.*.", "duration", [
      "publicationToReceiptMs",
      "receiptToApplicationMs",
      "acceptanceToApplicationMs",
      "captureToApplicationMs",
    ]),
    ...group("questions.*.intervals.", "duration", [
      "waitMs",
      "contextMs",
      "firstProgressMs",
      "firstUsefulMs",
      "firstAgentMs",
      "firstTextMs",
      "totalMs",
      "endToEndMs",
      "tools.*.durationMs",
    ]),
    ...group("questions.*.intervals.evidence.", "session", [
      "anchorMs",
      "frozenAtMs",
      "evidenceAsOfMs",
      "contextThroughMs",
      "analyzedThroughMs",
    ]),
    ...group("questions.*.intervals.evidence.", "duration", [
      "unanalyzedTailMs",
      "lagAtStartMs",
    ]),
  ]);
}
function report(cases) {
  return {
    schemaVersion: 1,
    units: "ms",
    clocks: {
      origins: ORIGINS,
      mapping:
        "Temps scénario = estampille moins origine ; horloges simulées de même vitesse, sans pause.",
      fields: clockFields(),
    },
    cases,
  };
}
function formatTable(result) {
  const lines = [
    "Latences simulées (ms) — remise aux vues, sans mesure des pixels",
    "Cas | Passage | Transport | Préparation | Attente audio | Audio | Attente vision | Vision | Capture → publication vision",
  ];
  const cell = (v) => (v === null || v === undefined ? "—" : String(v));
  const names = {
    "memory-ready": "Mémoire prête",
    "perception-delayed": "Audio/vision retardés",
    "question-queued": "Question en attente",
  };
  for (const c of result.cases)
    for (const p of c.passages)
      lines.push(
        [
          names[c.id],
          p.id,
          p.intervals.transportMs,
          p.intervals.preparationMs,
          p.intervals.audioWaitMs,
          p.intervals.audioMs,
          p.intervals.visionWaitMs,
          p.intervals.visionMs,
          p.intervals.readyAfterCloseMs,
        ]
          .map(cell)
          .join(" | "),
      );
  lines.push(
    "",
    [
      "Cas",
      "Question",
      "Attente",
      "Traitement",
      "Premier texte",
      "Depuis acceptation",
      "Publication → réception Mac",
      "Réception → DOM Mac",
      "Publication → réception TV",
      "Réception → DOM TV",
      "Capture → Mac",
      "Capture → TV",
    ].join(" | "),
  );
  for (const c of result.cases)
    for (const q of c.questions)
      lines.push(
        [
          names[c.id],
          q.id,
          q.intervals.waitMs,
          q.intervals.totalMs,
          q.intervals.firstTextMs,
          q.intervals.endToEndMs,
          q.clients.mac.publicationToReceiptMs,
          q.clients.mac.receiptToApplicationMs,
          q.clients.tv.publicationToReceiptMs,
          q.clients.tv.receiptToApplicationMs,
          q.clients.mac.captureToApplicationMs,
          q.clients.tv.captureToApplicationMs,
        ]
          .map(cell)
          .join(" | "),
      );
  return lines.join("\n") + "\n";
}
module.exports = { caseReport, report, formatTable };
