const { WatchSession } = require("../core/session.cjs");
const { VideoTools, consultationOf } = require("../core/video-tools.cjs");
const { hasPendingQuestion } = require("../runtime/conversation-runtime.cjs");
const { createMemoryProjection } = require("../runtime/memory/memory-projection.cjs");
const {
  createQuestionCheckpoint,
} = require("../runtime/question-checkpoint.cjs");
const { controlledDeepAsk } = require("./latency-environment.cjs");
const copy = (value) => JSON.parse(JSON.stringify(value));

function createAgent(env, delays, tools) {
  return {
    answer: async ({ jobId, context, tools: capability, onProgress }) => {
      tools.set(jobId, capability);
      onProgress({ preview: "" });
      await env.wait(delays.firstTextMs);
      if (!delays.omitText)
        onProgress({ preview: "Réponse simulée en préparation." });
      await env.wait(delays.responseMs);
      if (delays.refuse === "answer")
        throw Object.assign(new Error("Réponse simulée refusée."), {
          code: "SIMULATED_REFUSAL",
        });
      return {
        kind: context.passages.length ? "observation" : "explanation",
        answer: "Réponse simulée validée.",
        citations: context.passages.map(
          ({ id: passageId, startMs, endMs }) => ({
            id: passageId,
            startMs,
            endMs,
          }),
        ),
        limits: [],
      };
    },
  };
}

function createModel({ env, delays, views, record }) {
  const checkpoint = createQuestionCheckpoint(env.io);
  const files = new Map(),
    tools = new Map();
  const store = { save: async () => {}, saveResearch: async () => {} };
  let session,
    deep,
    publication = 0;
  const projection = createMemoryProjection({
    memory: {
      view: () => session.memoryView(),
      readPublicationStatus: () => session.readPublicationStatus(),
      readHistoricalQuestions: () => session.readHistoricalQuestions(),
      readUsage: () => session.readUsage(),
    },
    now: env.io.now,
    storage: () => null,
  });
  const readSession = () => projection.read().session;
  const publish = (source, value) => {
    const envelope = copy({
      id: ++publication,
      source,
      session: source === "session" ? value : readSession(),
      deep: source === "deep" ? value : deep?.snapshot() || { jobs: [] },
    });
    record("server.published", "server-wall", env.serverNow(), {
      publicationId: envelope.id,
      source,
      asking: envelope.session.asking,
      passages: envelope.session.segments.map((p) => ({
        id: p.id,
        revision: p.revision,
        status: p.status,
        audioStatus: p.audioStatus ?? null,
        visionStatus: p.visionStatus ?? null,
      })),
      jobs: envelope.deep.jobs.map((j) => ({
        id: j.id,
        status: j.status,
        preview: j.preview,
        answer: j.result?.answer ?? null,
      })),
    });
    views.publish(envelope);
  };
  session = new WatchSession({
    id: "session-1",
    now: env.io.now,
    archive: store,
    media: createMedia(files, delays),
    perception: createPerception(env, delays),
    onInvalidate: () => publish("session", readSession()),
  });
  const DeepAsk = controlledDeepAsk(env.io);
  deep = new DeepAsk({
    now: env.serverNow,
    makeTools: (signal, onProgress) =>
      new VideoTools({
        consultation: consultationOf(session.memoryView()),
        signal,
        onProgress,
        reread: (ids) => session.memoryPassages(ids),
        now: env.serverNow,
      }),
    agent: createAgent(env, delays, tools),
    onChange: (s) => {
      session.setQuestionPending(hasPendingQuestion(s.jobs, session.id));
      publish("deep", s);
      checkpoint.checkpoint(store, s);
    },
  });
  return { session, deep, tools, checkpoint, readSession };
}
function createMedia(files, delays) {
  return {
    put: async (passageId, value) => {
      if (delays.refuse === "media")
        throw Object.assign(new Error("Stockage simulé refusé."), {
          code: "SIMULATED_REFUSAL",
        });
      files.set(passageId, value);
    },
    read: async (passageId) => files.get(passageId),
    remove: async (passageId) => files.delete(passageId),
  };
}
function createPerception(env, delays) {
  return {
    transcribe: async () => {
      const startedMs = env.io.now();
      await env.wait(delays.audioMs);
      return {
        elapsedMs: env.io.now() - startedMs,
        observation: { transcript: "Des paroles simulées." },
      };
    },
    observeVisual: async () => {
      const startedMs = env.io.now();
      await env.wait(delays.visionMs);
      return {
        elapsedMs: env.io.now() - startedMs,
        observation: {
          summary: "Une scène simulée.",
          visual: "Un intervenant.",
        },
      };
    },
  };
}
module.exports = { createModel };
