const { z } = require("zod");
const { videoToolDefinitions } = require("../core/video-tool-contracts.cjs");

// The MCP SDK expects Zod fields; Codex consumes the same contract as JSON Schema.
function fieldSchema(name, field) {
  if (field.type === "string") return z.string().min(1).max(2000);
  if (field.type === "number")
    return name === "endMs" ? z.number().positive() : z.number().nonnegative();
  throw new Error(`Unsupported video tool field: ${name}`);
}

const mcpToolDefinitions = videoToolDefinitions.map((tool) => ({
  name: tool.name,
  description:
    tool.description +
    (tool.name === "search_moments"
      ? " Commence par cet outil pour ouvrir un contexte MCP."
      : ""),
  inputSchema: Object.fromEntries(
    Object.entries(tool.inputSchema.properties).map(([name, field]) => [
      name,
      fieldSchema(name, field),
    ]),
  ),
}));
module.exports = { mcpToolDefinitions };
