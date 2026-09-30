const range = { startMs: { type: "number" }, endMs: { type: "number" } };
const videoToolDefinitions = [
  {
    name: "search_moments",
    description:
      "Chercher des passages dans la mémoire observée. Les résumés ne prouvent pas une action détaillée.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_transcript",
    description:
      "Lire paroles et résumés par segment. Intervalle maximal 60 secondes.",
    inputSchema: {
      type: "object",
      properties: range,
      required: ["startMs", "endMs"],
      additionalProperties: false,
    },
  },
  {
    name: "inspect_clip",
    description:
      "Réexaminer image/son, maximum 20 secondes et deux inspections par question. Analyse multimodale via le port de réexamen configuré.",
    inputSchema: {
      type: "object",
      properties: { ...range, question: { type: "string" } },
      required: ["startMs", "endMs", "question"],
      additionalProperties: false,
    },
  },
];
const videoToolNames = videoToolDefinitions.map((tool) => tool.name);
module.exports = { videoToolDefinitions, videoToolNames };
