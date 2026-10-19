const range = { startMs: { type: "number" }, endMs: { type: "number" } };
const VIDEO_TOOL_CALL_LIMIT = 8;
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
      "Son seul (hasImages=false ou mediaReason=images-absent) : inspect_clip est refusé ; utiliser get_transcript pour les paroles. " +
      "Réexaminer image/son, maximum 20 secondes et deux inspections par question. Analyse multimodale via le port de réexamen configuré. Les paroles sont celles du passage entier : intervals[].speech donne leur intervalle, qui peut dépasser celui des images (intervals[].images). exactSpeech=true retranscrit seulement l’intervalle demandé, plus lentement : à réserver aux paroles qu’il faut situer dans cet intervalle. Un passage marqué mediaReason=\"unreadable\" n’a pas de vidéo lisible mais reste réexaminable : le réexamen porte alors sur ses images conservées à la capture, et le dit dans limits.",
    inputSchema: {
      type: "object",
      properties: { ...range, question: { type: "string" }, exactSpeech: { type: "boolean" } },
      required: ["startMs", "endMs", "question"],
      additionalProperties: false,
    },
  },
];
const videoToolNames = videoToolDefinitions.map((tool) => tool.name);
module.exports = { videoToolDefinitions, videoToolNames, VIDEO_TOOL_CALL_LIMIT };
