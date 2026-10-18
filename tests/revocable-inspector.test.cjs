const { test } = require("node:test");
const assert = require("node:assert/strict");
const { CachedInspector } = require("../core/cached-inspector.cjs");
const { RevocableInspector } = require("../core/revocable-inspector.cjs");

const REVOKED = "Session closed: its passages can no longer be re-examined.";

const inputOf = (question, extra = {}) => ({
  question,
  startMs: 0,
  endMs: 8000,
  segments: [{ id: "p1", startMs: 0, endMs: 8000 }],
  ...extra,
});

// An in-memory inspector that counts its calls and remembers the signal it was given. It does not look at
// the signal itself. Alone, it leaves the refusals to the decorator; behind a CachedInspector, whose own
// guards read the signal, a refusal is also covered by those guards, so a test that must prove the decorator
// refuses decorates the in-memory inspector without a cache.
function countingInspector(behave = async () => undefined) {
  const inspector = {
    calls: 0,
    signals: [],
    inputs: [],
    async inspect(input) {
      inspector.calls += 1;
      inspector.signals.push(input.signal);
      inspector.inputs.push(input);
      const custom = await behave(input);
      return (
        custom || {
          observations: [{ id: "p1", text: "A circle moves." }],
          cost: 1,
        }
      );
    },
  };
  return inspector;
}

const rejection = (promise) =>
  promise.then(
    () => assert.fail("the call was expected to be refused"),
    (error) => error,
  );

test("a revoked inspector refuses a late call before its cache and its inner inspector, and empties the cache", async () => {
  const memory = countingInspector();
  const cached = new CachedInspector(memory);
  const inspector = new RevocableInspector(cached, REVOKED);
  await inspector.inspect(inputOf("What moves?"));
  assert.equal(memory.calls, 1);
  assert.equal(cached.cache.size, 1);

  inspector.revoke();
  const refusal = await rejection(inspector.inspect(inputOf("What moves?")));

  assert.equal(refusal.message, REVOKED);
  assert.equal(memory.calls, 1);
  assert.equal(cached.hits, 0);
  assert.equal(cached.cache.size, 0);
});

test("a revoked inspector refuses a late call without calling the decorated inspector, which has no cache and no guard", async () => {
  const memory = countingInspector();
  const inspector = new RevocableInspector(memory, REVOKED);
  await inspector.inspect(inputOf("What moves?"));
  assert.equal(memory.calls, 1);

  inspector.revoke();
  const refusal = await rejection(inspector.inspect(inputOf("What moves?")));

  assert.equal(refusal.message, REVOKED);
  assert.equal(memory.calls, 1);
});

test("a live inspector hands back what the decorated one returns, with a signal that follows the caller", async () => {
  const memory = countingInspector();
  const inspector = new RevocableInspector(memory, REVOKED);
  const caller = new AbortController();

  const result = await inspector.inspect(
    inputOf("What moves?", { signal: caller.signal }),
  );

  assert.deepEqual(result.observations, [{ id: "p1", text: "A circle moves." }]);
  assert.equal(memory.calls, 1);
  const [received] = memory.signals;
  assert.equal(received.aborted, false);
  caller.abort(new Error("caller gave up"));
  assert.equal(received.aborted, true);
});

test("a live inspector keeps every field of the input it passes on, and hands a signal even without one", async () => {
  const memory = countingInspector();
  const inspector = new RevocableInspector(memory, REVOKED);

  await inspector.inspect(inputOf("What moves?", { exactSpeech: true }));

  const [received] = memory.inputs;
  assert.equal(received.question, "What moves?");
  assert.equal(received.exactSpeech, true);
  assert.equal(received.signal.aborted, false);
});

test("a revoked inspector aborts the signal of a call in flight and refuses it when the inner one brings a result back", async () => {
  const release = Promise.withResolvers();
  // Only the question "What is red?" waits for the release; the other one answers at once and is cached.
  const memory = countingInspector((input) =>
    input.question === "What is red?" ? release.promise : undefined,
  );
  const cached = new CachedInspector(memory);
  const inspector = new RevocableInspector(cached, REVOKED);
  await inspector.inspect(inputOf("What moves?"));
  assert.equal(cached.cache.size, 1);
  const pending = rejection(inspector.inspect(inputOf("What is red?")));
  assert.equal(memory.calls, 2);
  const received = memory.signals[1];
  assert.equal(received.aborted, false);
  assert.equal(cached.cache.size, 1);

  inspector.revoke();

  assert.equal(received.aborted, true);
  assert.equal(received.reason.message, REVOKED);
  assert.equal(cached.cache.size, 0);
  release.resolve();
  const refusal = await pending;
  assert.equal(refusal.message, REVOKED);
  assert.equal(cached.cache.size, 0);
});

test("a revoked inspector refuses a call in flight whose decorated inspector ignores the signal and brings a result back", async () => {
  const release = Promise.withResolvers();
  const memory = countingInspector(() => release.promise);
  // The decorated one has no cache and no guard: only the refusal of the decorator can stop the result.
  const inspector = new RevocableInspector(memory, REVOKED);
  const pending = rejection(inspector.inspect(inputOf("What moves?")));

  inspector.revoke();
  release.resolve();

  const refusal = await pending;
  assert.equal(refusal.message, REVOKED);
});

test("a revoked inspector empties the cache that a decorated inspector ignoring the signal fills with its late result", async () => {
  const release = Promise.withResolvers();
  // The decorated one fills its own cache as it returns, after the revocation, without looking at the signal.
  const decorated = {
    cache: new Map(),
    async inspect(input) {
      await release.promise;
      const result = { observations: [{ id: "p1", text: "A circle moves." }], cost: 1 };
      decorated.cache.set(input.question, result);
      return result;
    },
  };
  const inspector = new RevocableInspector(decorated, REVOKED);
  const pending = rejection(inspector.inspect(inputOf("What moves?")));

  inspector.revoke();
  release.resolve();

  const refusal = await pending;
  assert.equal(refusal.message, REVOKED);
  assert.equal(decorated.cache.size, 0);
});

test("a revoked inspector refuses a call in flight whose decorated inspector rejects, and empties the cache", async () => {
  const release = Promise.withResolvers();
  const memory = countingInspector(() => release.promise);
  const cached = new CachedInspector(memory);
  const inspector = new RevocableInspector(cached, REVOKED);
  const pending = rejection(inspector.inspect(inputOf("What moves?")));
  const [received] = memory.signals;

  inspector.revoke();
  assert.equal(received.aborted, true);
  release.reject(new Error("inspection model went away"));

  const refusal = await pending;
  assert.equal(refusal.message, REVOKED);
  assert.equal(cached.cache.size, 0);
});

test("a call interrupted by its caller alone rejects with the error of the decorated inspector", async () => {
  const caller = new AbortController();
  const memory = countingInspector(
    (input) =>
      new Promise((resolve, reject) => {
        input.signal.addEventListener("abort", () =>
          reject(new Error("inspection interrupted")),
        );
      }),
  );
  const inspector = new RevocableInspector(memory, REVOKED);
  const pending = rejection(
    inspector.inspect(inputOf("What moves?", { signal: caller.signal })),
  );

  caller.abort(new Error("caller gave up"));

  const failure = await pending;
  assert.equal(failure.message, "inspection interrupted");
});

test("a revoked inspector stays revoked when revoked again", async () => {
  const memory = countingInspector();
  const cached = new CachedInspector(memory);
  const inspector = new RevocableInspector(cached, REVOKED);
  await inspector.inspect(inputOf("What moves?"));

  inspector.revoke();
  inspector.revoke();

  assert.equal(cached.cache.size, 0);
  const refusal = await rejection(inspector.inspect(inputOf("What moves?")));
  assert.equal(refusal.message, REVOKED);
  assert.equal(memory.calls, 1);
});

test("a revocable inspector reads the inner inspector, the cache and the counters of the decorated one live", async () => {
  const memory = countingInspector();
  const cached = new CachedInspector(memory);
  const inspector = new RevocableInspector(cached, REVOKED);
  assert.equal(inspector.inner, memory);
  assert.equal(inspector.cache, cached.cache);
  assert.equal(inspector.hits, 0);
  assert.equal(inspector.misses, 0);

  await inspector.inspect(inputOf("What moves?"));
  await inspector.inspect(inputOf("What moves?"));

  assert.equal(inspector.misses, 1);
  assert.equal(inspector.hits, 1);
  assert.equal(inspector.cache.size, 1);
});

test('cache identity changes never reuse another backend or model and retain original provenance', async () => {
  let identity = { role: 'inspection', backend: 'ollama', model: 'one' };
  const memory = countingInspector(() => ({ observations: [{ text: 'A circle moves.' }], inspection: { ...identity } }));
  Object.defineProperty(memory, 'identity', { get: () => identity });
  const inspector = new RevocableInspector(new CachedInspector(memory), REVOKED);
  const first = await inspector.inspect(inputOf('What moves?'));
  identity = { role: 'inspection', backend: 'ollama', model: 'two' };
  const second = await inspector.inspect(inputOf('What moves?'));
  identity = { role: 'inspection', backend: 'codex', model: 'two' };
  const third = await inspector.inspect(inputOf('What moves?'));
  assert.deepEqual([first.cacheHit, second.cacheHit, third.cacheHit], [false, false, false]);
  assert.equal(memory.calls, 3);
  identity = { role: 'inspection', backend: 'ollama', model: 'one' };
  const cached = await inspector.inspect(inputOf('What moves?'));
  assert.deepEqual(cached.inspection, { ...first.inspection, cacheHit: true, modelCalled: false });
  assert.equal(memory.calls, 3);
});
