const { videoToolDefinitions } = require("../core/video-tool-contracts.cjs");

// Codex transport envelope; the tool contract remains provider independent.
const dynamicTools = videoToolDefinitions.map((tool) => ({
  type: "function",
  ...tool,
}));
module.exports = { dynamicTools };
