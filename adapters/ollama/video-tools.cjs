const { videoToolDefinitions } = require('../../core/video-tool-contracts.cjs');

const toolDefinitions = videoToolDefinitions.map(tool => ({ type: 'function',
  function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));

function allowedToolCall(call) {
  const definition = videoToolDefinitions.find(tool => tool.name === call?.function?.name);
  if (!definition) return false;
  const args = call.function.arguments;
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false;
  const { required, properties } = definition.inputSchema;
  if (!required.every(key => Object.hasOwn(args, key))) return false;
  return Object.entries(args).every(([key, value]) => {
    const type = properties[key]?.type;
    return typeof value === type && (type !== 'number' || Number.isFinite(value));
  });
}

module.exports = { toolDefinitions, allowedToolCall };
