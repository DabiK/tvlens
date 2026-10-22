const { test } = require('node:test');
const assert = require('node:assert/strict');
const { OllamaHttpClient } = require('../adapters/ollama/http-client.cjs');

function recordingClient(options = {}) {
  const bodies = [];
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, status: 200, text: async () => JSON.stringify({ message: { role: 'assistant', content: '{}' } }) };
  };
  const client = new OllamaHttpClient({ url: 'http://127.0.0.1:1', model: 'm', numCtx: 4096, fetchImpl, ...options });
  return { client, bodies };
}
const messages = [{ role: 'user', content: 'Bonjour' }];

test('per-call options and thinking are merged over the fixed parameters for that call only', async () => {
  const { client, bodies } = recordingClient({ think: 'on' });
  const signal = new AbortController().signal;
  await client.chat({ messages, signal, options: { num_predict: 80 }, think: false });
  await client.chat({ messages, signal });
  assert.deepEqual(bodies[0].options, { temperature: 0, num_ctx: 4096, num_predict: 80 });
  assert.equal(bodies[0].think, false);
  assert.deepEqual(bodies[1].options, { temperature: 0, num_ctx: 4096 });
  assert.equal(bodies[1].think, true);
  assert.equal(client.temperature, 0);
});

test('a per-call thinking setting is sent even when the fixed setting leaves it to the model', async () => {
  const { client, bodies } = recordingClient();
  const signal = new AbortController().signal;
  await client.chat({ messages, signal, think: false });
  await client.chat({ messages, signal });
  assert.equal(bodies[0].think, false);
  assert.equal(Object.hasOwn(bodies[1], 'think'), false);
});

test('a chat call without tools sends no tools key', async () => {
  const { client, bodies } = recordingClient();
  await client.chat({ messages, signal: new AbortController().signal, format: { type: 'object' } });
  assert.equal(Object.hasOwn(bodies[0], 'tools'), false);
  assert.deepEqual(bodies[0].format, { type: 'object' });
});
