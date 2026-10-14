const { test } = require("node:test");
const assert = require("node:assert/strict");
const { warmUp } = require("../runtime/session-warm-up.cjs");

const SESSION_ID = "session-1";
// An agent that records the ids it was prepared under and, in `calls`, who was asked first.
const recordingAgent = (name, calls, prepare = () => Promise.resolve()) => ({
  prepared: [],
  prepare(id) {
    calls.push(name);
    this.prepared.push(id);
    return prepare(id);
  },
});
// Lets the rejections of the promises already handed back surface, as a host that did not wait would see them.
const settled = () => new Promise((resolve) => setImmediate(resolve));
// Collects the rejections nobody handled while `work` runs.
async function unhandledDuring(work) {
  const seen = [];
  const listener = (reason) => seen.push(reason);
  process.on("unhandledRejection", listener);
  try {
    await work();
    await settled();
    await settled();
  } finally {
    process.off("unhandledRejection", listener);
  }
  return seen;
}

test("the chat agent and the observation agent are prepared under the right ids, the chat first", () => {
  const calls = [];
  const chat = recordingAgent("chat", calls);
  const observe = recordingAgent("observe", calls);

  warmUp({ chat, perception: { agent: observe }, sessionId: SESSION_ID });

  assert.deepEqual(chat.prepared, [SESSION_ID]);
  assert.deepEqual(observe.prepared, [`${SESSION_ID}-observe`]);
  assert.deepEqual(calls, ["chat", "observe"]);
});

test("an agent is prepared as a method, so that it keeps its own state", () => {
  const chat = {
    connection: "open",
    seen: null,
    prepare(id) {
      this.seen = [this.connection, id];
      return Promise.resolve();
    },
  };

  warmUp({ chat, perception: null, sessionId: SESSION_ID });

  assert.deepEqual(chat.seen, ["open", SESSION_ID]);
});

test("a chat agent that is absent leaves the observation agent prepared", () => {
  const observe = recordingAgent("observe", []);

  warmUp({
    chat: undefined,
    perception: { agent: observe },
    sessionId: SESSION_ID,
  });

  assert.deepEqual(observe.prepared, [`${SESSION_ID}-observe`]);
});

test("a host without perception or without observation agent still prepares the chat agent", () => {
  for (const perception of [undefined, null, {}, { agent: null }]) {
    const chat = recordingAgent("chat", []);

    warmUp({ chat, perception, sessionId: SESSION_ID });

    assert.deepEqual(chat.prepared, [SESSION_ID]);
  }
});

test("an agent without prepare is left alone and does not hold the other one back", () => {
  const chat = recordingAgent("chat", []);
  const observe = recordingAgent("observe", []);

  warmUp({
    chat: {},
    perception: { agent: observe },
    sessionId: SESSION_ID,
  });
  warmUp({
    chat,
    perception: { agent: {} },
    sessionId: SESSION_ID,
  });

  assert.deepEqual(observe.prepared, [`${SESSION_ID}-observe`]);
  assert.deepEqual(chat.prepared, [SESSION_ID]);
});

test("a prepare that hands back no promise is tolerated for both agents", () => {
  const chat = recordingAgent("chat", [], () => undefined);
  const observe = recordingAgent("observe", [], () => undefined);

  assert.doesNotThrow(() =>
    warmUp({ chat, perception: { agent: observe }, sessionId: SESSION_ID }),
  );

  assert.deepEqual(chat.prepared, [SESSION_ID]);
  assert.deepEqual(observe.prepared, [`${SESSION_ID}-observe`]);
});

test("a prepare that is refused raises no unhandled rejection and does not stop the other agent", async () => {
  const refused = () => Promise.reject(new Error("connection refused"));
  const chat = recordingAgent("chat", [], refused);
  const observe = recordingAgent("observe", [], refused);

  const unhandled = await unhandledDuring(() => {
    warmUp({ chat, perception: { agent: observe }, sessionId: SESSION_ID });
  });

  assert.deepEqual(unhandled, []);
  assert.deepEqual(chat.prepared, [SESSION_ID]);
  assert.deepEqual(observe.prepared, [`${SESSION_ID}-observe`]);
});

test("warming up hands nothing back and does not wait for the agents", () => {
  const never = () => new Promise(() => {});
  const chat = recordingAgent("chat", [], never);

  const returned = warmUp({
    chat,
    perception: { agent: recordingAgent("observe", [], never) },
    sessionId: SESSION_ID,
  });

  assert.equal(returned, undefined);
});
