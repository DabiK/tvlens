const { test } = require("node:test");
const assert = require("node:assert/strict");
const providers = require("../adapters/simulated-providers.cjs");

test("the local inspection model returns one observation per segment and its fixed region", async () => {
  const model = providers.simulatedInspectionModel();
  const segments = [
    { id: "moment-1", startMs: 0, endMs: 8000 },
    { id: "moment-2", startMs: 8000, endMs: 16000 },
  ];
  assert.deepEqual(await model.inspect({ segments }), {
    observations: segments.map((segment) => ({
      ...segment,
      text: "Un cercle est visible dans les planches du test.",
    })),
    hypotheses: [],
    limits: ["Modèle simulé pour le test local."],
    cost: 0,
  });
  assert.deepEqual(await model.selectRegion({ segments }), {
    region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    reason: "Rectangle de test, sans inférence.",
    cost: 0,
  });
});

test("the inspector clips every observation to the requested interval and reports twelve sampled frames", async () => {
  const segments = [
    { id: "moment-1", startMs: 0, endMs: 8000 },
    { id: "moment-2", startMs: 8000, endMs: 16000 },
    { id: "moment-3", startMs: 16000, endMs: 24000 },
  ];
  assert.deepEqual(
    await providers
      .simulatedInspector()
      .inspect({ segments, startMs: 4000, endMs: 20000 }),
    {
      observations: [
        {
          id: "moment-1",
          startMs: 4000,
          endMs: 8000,
          text: "Le cercle effectue un bref saut entre deux images.",
        },
        {
          id: "moment-2",
          startMs: 8000,
          endMs: 16000,
          text: "Le cercle effectue un bref saut entre deux images.",
        },
        {
          id: "moment-3",
          startMs: 16000,
          endMs: 20000,
          text: "Le cercle effectue un bref saut entre deux images.",
        },
      ],
      hypotheses: [],
      limits: [],
      sampledFrames: 12,
    },
  );
});


test("simulated transcription publishes an audio patch with deterministic words only for nonempty audio at zero cost", async () => {
  const perception = providers.simulatedPerception();
  for (const audio of [null, undefined, new Uint8Array(), new Uint8Array([1])]) {
    const heard = Boolean(audio?.byteLength);
    assert.deepEqual(await perception.transcribe?.({ audio }), {
      observation: {
        transcript: heard ? "Un cercle se déplace sur un fond bleu." : "",
        audio: heard ? "Audio reçu." : "Pas d’audio.",
        uncertainty: "",
      },
      cost: 0,
    });
  }
});

test("simulated vision describes the images and preserves supplied speech and uncertainty at zero cost", async () => {
  const perception = providers.simulatedPerception();
  const observation = { transcript: "Paroles déjà publiées.", uncertainty: "Son de test." };
  const input = { frames: [{ atMs: 1000 }, { atMs: 2000 }], observation };
  assert.deepEqual(await perception.observeVisual?.(input), {
    observation: {
      summary: "Un cercle se déplace sur un fond bleu.",
      visual: "2 images reçues.",
      transcript: "Paroles déjà publiées.",
      uncertainty: "Son de test.",
    },
    cost: 0,
  });
  assert.deepEqual(observation, { transcript: "Paroles déjà publiées.", uncertainty: "Son de test." });
  assert.deepEqual(await perception.observeVisual?.({ frames: [] }), {
    observation: {
      summary: "Un cercle se déplace sur un fond bleu.",
      visual: "0 images reçues.",
      transcript: "",
      uncertainty: "",
    },
    cost: 0,
  });
});

function videoTools(t) {
  let searched;
  const searchEntered = new Promise((resolve) => {
    searched = resolve;
  });
  const call = t.mock.fn(async (name) => {
    if (name === "search_moments") {
      searched();
      return {
        moments: [
          { startMs: 4000, endMs: 12000 },
          { startMs: 12000, endMs: 20000 },
        ],
      };
    }
    return {
      observations: [
        {
          id: "moment-1",
          startMs: 4000,
          endMs: 8000,
          text: "Un premier mouvement.",
        },
        {
          id: "moment-2",
          startMs: 8000,
          endMs: 12000,
          text: "Un second mouvement.",
        },
      ],
    };
  });
  return { call, searchEntered };
}

test("the video agent searches then inspects the first moment after its delay", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const tools = videoTools(t);
  const question = "Que voit-on ?";
  let answered = false;
  const pending = providers
    .simulatedVideoAgent()
    .answer({ question, tools, signal: new AbortController().signal });
  pending.then(() => {
    answered = true;
  });
  assert.deepEqual(
    tools.call.mock.calls.map(({ arguments: args }) => args),
    [["search_moments", { query: question }]],
  );
  await tools.searchEntered;
  t.mock.timers.tick(2499);
  await Promise.resolve();
  assert.equal(answered, false);
  assert.equal(tools.call.mock.callCount(), 1);
  t.mock.timers.tick(1);
  assert.deepEqual(await pending, {
    answer: "Un premier mouvement. Un second mouvement.",
    kind: "observation",
    citations: [
      { id: "moment-1", startMs: 4000, endMs: 8000 },
      { id: "moment-2", startMs: 8000, endMs: 12000 },
    ],
    limits: [],
  });
  assert.deepEqual(
    tools.call.mock.calls.map(({ arguments: args }) => args),
    [
      ["search_moments", { query: question }],
      ["inspect_clip", { startMs: 4000, endMs: 12000, question }],
    ],
  );
});

test("the video agent stops before inspection when aborted during its delay", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const tools = videoTools(t);
  const controller = new AbortController();
  const reason = new Error("Recherche annulée.");
  const pending = providers
    .simulatedVideoAgent()
    .answer({ question: "Que voit-on ?", tools, signal: controller.signal });
  assert.equal(tools.call.mock.callCount(), 1);
  await tools.searchEntered;
  t.mock.timers.tick(1000);
  const rejected = assert.rejects(pending, (error) => error === reason);
  controller.abort(reason);
  await rejected;
  t.mock.timers.tick(2500);
  assert.equal(tools.call.mock.callCount(), 1);
});

test("the verifier waits before returning the Apollo conclusion with its opened NASA source", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const claim = "Apollo 11 a aluni en 1970.";
  let answered = false;
  const pending = providers.simulatedVerifier().verify({ claim });
  pending.then(() => {
    answered = true;
  });
  t.mock.timers.tick(2499);
  await Promise.resolve();
  assert.equal(answered, false);
  t.mock.timers.tick(1);
  const result = await pending;
  assert.deepEqual(result, {
    normalizedClaim: claim,
    assessment: "contradicted",
    conclusion: "Apollo 11 a aluni en 1969, selon la NASA.",
    sources: [
      {
        url: "https://www.nasa.gov/mission/apollo-11/",
        title: "Apollo 11",
        publisher: "NASA",
        publishedAt: null,
        evidence: "La NASA date la mission de juillet 1969.",
        relation: "contradicts",
      },
    ],
    limitations: [],
    research: {
      provider: "test/fake",
      webSearches: 1,
      openedUrls: ["https://www.nasa.gov/mission/apollo-11/"],
      elapsedMs: 2500,
    },
  });
  assert.ok(
    result.sources.every(({ url }) => result.research.openedUrls.includes(url)),
  );
});

test("the verifier rejects the failure claim after its delay with the displayed error", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = providers.simulatedVerifier().verify({ claim: "FAIL_TEST" });
  const rejected = assert.rejects(pending, {
    message: "Recherche indisponible (test).",
  });
  t.mock.timers.tick(2500);
  await rejected;
});

test("the recap preserves the unique sources of old chapters and new passages", async () => {
  assert.deepEqual(
    await providers.simulatedRecap().summarize({
      chapters: [
        { sourceIds: ["moment-1", "moment-2"] },
        { sourceIds: ["moment-2"] },
      ],
      newPassages: [{ id: "moment-2" }, { id: "moment-3" }],
    }),
    {
      overview:
        "Un cercle se déplace sur un fond bleu. Les passages observés montrent la continuité de cette animation.",
      chapters: [
        {
          title: "Une animation en mouvement",
          summary: "Le cercle poursuit son déplacement sur un fond bleu.",
          sourceIds: ["moment-1", "moment-2", "moment-3"],
        },
      ],
    },
  );
});
