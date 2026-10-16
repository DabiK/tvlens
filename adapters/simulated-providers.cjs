const SIMULATED_DELAY_MS = 2500;

function simulatedInspectionModel() {
  return {
    inspect: async ({ segments }) => ({
      observations: segments.map((s) => ({
        id: s.id,
        startMs: s.startMs,
        endMs: s.endMs,
        text: "Un cercle est visible dans les planches du test.",
      })),
      hypotheses: [],
      limits: ["Modèle simulé pour le test local."],
      cost: 0,
    }),
    selectRegion: async () => ({
      region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      reason: "Rectangle de test, sans inférence.",
      cost: 0,
    }),
  };
}

function simulatedInspector() {
  return {
    inspect: async ({ segments, startMs, endMs }) => ({
      observations: segments.map((s) => ({
        id: s.id,
        startMs: Math.max(startMs, s.startMs),
        endMs: Math.min(endMs, s.endMs),
        text: "Le cercle effectue un bref saut entre deux images.",
      })),
      hypotheses: [],
      limits: [],
      sampledFrames: 12,
    }),
  };
}

function simulatedPerception() {
  return {
    transcribe: async (input) => ({
      observation: {
        transcript: input.audio?.byteLength
          ? "Un cercle se déplace sur un fond bleu."
          : "",
        audio: input.audio?.byteLength ? "Audio reçu." : "Pas d’audio.",
        uncertainty: "",
      },
      cost: 0,
    }),
    observeVisual: async (input) => ({
      observation: {
        summary: "Un cercle se déplace sur un fond bleu.",
        visual: `${input.frames.length} images reçues.`,
        transcript: input.observation?.transcript || "",
        uncertainty: input.observation?.uncertainty || "",
      },
      cost: 0,
    }),
  };
}

function simulatedVideoAgent() {
  return {
    answer: async ({ question, tools, signal }) => {
      const found = await tools.call("search_moments", { query: question });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, SIMULATED_DELAY_MS);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(signal.reason);
          },
          { once: true },
        );
      });
      const moment = found.moments[0];
      const result = await tools.call("inspect_clip", {
        startMs: moment.startMs,
        endMs: moment.endMs,
        question,
      });
      return {
        answer: result.observations.map((o) => o.text).join(" "),
        kind: "observation",
        citations: result.observations.map(({ id, startMs, endMs }) => ({
          id,
          startMs,
          endMs,
        })),
        limits: [],
      };
    },
  };
}

function simulatedVerifier() {
  return {
    verify: async ({ claim }) => {
      await new Promise((resolve) => setTimeout(resolve, SIMULATED_DELAY_MS));
      if (claim === "FAIL_TEST")
        throw new Error("Recherche indisponible (test).");
      return {
        normalizedClaim: claim,
        assessment: "contradicted",
        conclusion: "Apollo 11 a aluni en 1969, selon la NASA.",
        // The page is declared as opened, like a real verifier does: a source whose page was never opened is discarded.
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
          elapsedMs: SIMULATED_DELAY_MS,
        },
      };
    },
  };
}

function simulatedRecap() {
  return {
    summarize: async ({ chapters, newPassages }) => ({
      overview:
        "Un cercle se déplace sur un fond bleu. Les passages observés montrent la continuité de cette animation.",
      chapters: [
        {
          title: "Une animation en mouvement",
          summary: "Le cercle poursuit son déplacement sur un fond bleu.",
          sourceIds: [
            ...new Set([
              ...chapters.flatMap((c) => c.sourceIds),
              ...newPassages.map((p) => p.id),
            ]),
          ],
        },
      ],
    }),
  };
}

module.exports = {
  simulatedInspectionModel,
  simulatedInspector,
  simulatedPerception,
  simulatedVideoAgent,
  simulatedVerifier,
  simulatedRecap,
};
