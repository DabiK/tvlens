const { test } = require("node:test");
const assert = require("node:assert/strict");
const { CodexAnalysisAgent } = require("../adapters/codex-analysis-agent.cjs");
const { CodexSessionAgent } = require("../adapters/codex-session-agent.cjs");
const { videoToolDefinitions } = require("../core/video-tool-contracts.cjs");
const { dynamicTools } = require("../adapters/codex-tool-definitions.cjs");
const { mcpToolDefinitions } = require("../mcp/tool-definitions.cjs");
const { MomentIndex } = require("../core/moment-index.cjs");
const { MomentSearch } = require("../core/moment-search.cjs");

function rpcFixture(onTurn) {
  const requests = [];
  let options;
  return {
    requests,
    get options() {
      return options;
    },
    rpcFactory(value) {
      options = value;
      return {
        start() {},
        send() {},
        close() {},
        async request(method, params) {
          requests.push({ method, params });
          if (method === "thread/start") return { thread: { id: "thread" } };
          if (method === "turn/start") {
            const id = "turn-" + requests.length;
            setImmediate(async () => {
              try {
                const result = await onTurn(options, id);
                options.onEvent("item/completed", {
                  threadId: "thread",
                  turnId: id,
                  item: { type: "agentMessage", text: JSON.stringify(result) },
                });
                options.onEvent("turn/completed", {
                  threadId: "thread",
                  turn: { id, status: "completed" },
                });
              } catch (error) {
                options.onEvent("connection/closed", {});
              }
            });
            return { turn: { id } };
          }
          return {};
        },
      };
    },
  };
}

test("analysis advertises no tools, disables web and rejects a tool call at the RPC boundary", async () => {
  let rejected = false;
  const fixture = rpcFixture(async (options, turnId) => {
    await assert.rejects(
      options.onRequest("item/tool/call", {
        threadId: "thread",
        turnId,
        tool: "search_moments",
        arguments: { query: "anything" },
      }),
      /non autorisé/,
    );
    rejected = true;
    return { summary: "Une image." };
  });
  const agent = new CodexAnalysisAgent({ rpcFactory: fixture.rpcFactory });
  try {
    await agent.prepare("analysis");
    const result = await agent.answer({
      sessionId: "analysis",
      instructions: "Décris.",
      outputSchema: { type: "object" },
      signal: AbortSignal.timeout(2000),
    });
    assert.equal(result.summary, "Une image.");
    assert.equal(rejected, true);
    const start = fixture.requests.find(
      (r) => r.method === "thread/start",
    ).params;
    assert.deepEqual(start.dynamicTools, []);
    assert.equal(start.config.web_search, "disabled");
    assert.ok(fixture.options.args.includes('web_search="disabled"'));
  } finally {
    await agent.close();
  }
});

test("chat dispatches tools and applies changed model selection on subsequent turns", async () => {
  let calls = 0;
  const fixture = rpcFixture(async (options, turnId) => {
    const result = await options.onRequest("item/tool/call", {
      threadId: "thread",
      turnId,
      tool: "search_moments",
      arguments: { query: "chien" },
    });
    assert.equal(result.success, true);
    return {
      answer: "Un chien.",
      kind: "observation",
      citations: [],
      sources: [],
      limits: [],
    };
  });
  const agent = new CodexSessionAgent({
    rpcFactory: fixture.rpcFactory,
    model: "first-model",
  });
  const input = {
    question: "Où est le chien ?",
    signal: AbortSignal.timeout(3000),
    tools: {
      sessionId: "chat",
      anchorMs: 8000,
      call: async (name, args) => {
        calls++;
        assert.equal(name, "search_moments");
        assert.equal(args.query, "chien");
        return { moments: [] };
      },
    },
  };
  try {
    await agent.answer(input);
    agent.model = "second-model";
    agent.authHome = "/unused-new-auth-home";
    await agent.answer(input);
    assert.equal(agent.client.authHome, "/unused-new-auth-home");
    assert.equal(calls, 2);
    assert.deepEqual(
      fixture.requests
        .filter((r) => r.method === "turn/start")
        .map((r) => r.params.model),
      ["first-model", "second-model"],
    );
    assert.equal(
      fixture.requests.filter((r) => r.method === "thread/start").length,
      1,
    );
  } finally {
    await agent.close();
  }
});

test("MCP and Codex expose the same tool names and argument fields", () => {
  assert.deepEqual(
    dynamicTools.map((t) => t.name),
    videoToolDefinitions.map((t) => t.name),
  );
  assert.deepEqual(
    mcpToolDefinitions.map((t) => t.name),
    videoToolDefinitions.map((t) => t.name),
  );
  for (const contract of videoToolDefinitions) {
    const mcp = mcpToolDefinitions.find((t) => t.name === contract.name);
    assert.deepEqual(
      Object.keys(mcp.inputSchema),
      Object.keys(contract.inputSchema.properties),
    );
  }
});

test("index is lazy, reuses vectors, and search never embeds passages after the question anchor", async () => {
  const values = new Map(),
    calls = [];
  const index = new MomentIndex({
    embeddings: {
      embed: async (text) => {
        calls.push(text);
        return [1, 0];
      },
    },
    cache: {
      get: async (id, text) => values.get(id + text),
      put: async (id, text, vector) => values.set(id + text, vector),
    },
  });
  const search = new MomentSearch({ index });
  assert.equal(calls.length, 0);
  const segments = [
    { id: "past", startMs: 0, endMs: 8000, observation: { summary: "chien" } },
    {
      id: "future",
      startMs: 8000,
      endMs: 16000,
      observation: { summary: "chat futur" },
    },
  ];
  const input = { query: "animal", segments, anchorMs: 8000 };
  assert.equal((await search.search(input)).mode, "hybrid");
  assert.deepEqual(calls, ["chien", "animal"]);
  await search.search(input);
  assert.equal(calls.length, 2);
  await search.search({ ...input, query: "il y a deux secondes" });
  assert.equal(calls.length, 2);
});

test("cancelled indexing does not cache a late embedding or continue to the next passage", async () => {
  const controller = new AbortController();
  let writes = 0,
    calls = 0;
  const index = new MomentIndex({
    embeddings: {
      embed: async () => {
        calls++;
        controller.abort(Error("Cancelled"));
        return [1];
      },
    },
    cache: { get: async () => null, put: async () => writes++ },
  });
  await assert.rejects(
    index.ensure(
      [
        { id: "a", summary: "one" },
        { id: "b", summary: "two" },
      ],
      controller.signal,
    ),
    /Cancelled/,
  );
  assert.equal(calls, 1);
  assert.equal(writes, 0);
});
