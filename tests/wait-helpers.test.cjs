const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: realTimeout } = require("node:timers");
const {
  until,
  tick,
  turns,
  deferred,
  pause,
  bounded,
  failure,
} = require("./helpers/wait.cjs");

test("until returns the first truthy value of synchronous and asynchronous checks", async () => {
  assert.equal(typeof until, "function");
  for (const asynchronous of [false, true]) {
    let calls = 0;
    const result = { ready: true };
    const check = () => (++calls === 3 ? result : false);
    assert.equal(
      await until(
        asynchronous ? async () => check() : check,
        "third check ready",
      ),
      result,
    );
    assert.equal(calls, 3);
  }
});

test("until fails with the expected fact when its deadline expires", async () => {
  await assert.rejects(
    until(() => false, "transcript published", { timeoutMs: 20 }),
    {
      code: "ERR_ASSERTION",
      message: /transcript published/,
    },
  );
});

test("until rejects missing or blank labels without running the check", async () => {
  for (const label of [undefined, "", "  ", 42]) {
    let calls = 0;
    await assert.rejects(
      until(() => {
        calls++;
        return true;
      }, label),
      { code: "ERR_ASSERTION" },
    );
    assert.equal(calls, 0);
  }
});

test("tick yields one immediate turn and turns yields the requested number", async () => {
  assert.equal(typeof tick, "function");
  assert.equal(typeof turns, "function");
  let count = 0;
  const record = () => {
    count++;
    if (count < 4) setImmediate(record);
  };
  setImmediate(record);
  const first = tick();
  assert.equal(count, 0);
  await first;
  assert.equal(count, 1);
  await turns(3);
  assert.equal(count, 4);
});

test("turns rejects absent counts and counts other than positive integers", async () => {
  assert.equal(typeof turns, "function");
  for (const count of [undefined, 0, -1, 1.5, "2", NaN, Infinity]) {
    await assert.rejects(turns(count), { code: "ERR_ASSERTION" });
  }
});

test("deferred exposes a promise that can be resolved or rejected", async () => {
  assert.equal(typeof deferred, "function");
  const resolved = deferred();
  assert.deepEqual(Object.keys(resolved).sort(), [
    "promise",
    "reject",
    "resolve",
  ]);
  const value = { published: true };
  resolved.resolve(value);
  assert.equal(await resolved.promise, value);
  const rejected = deferred();
  const error = new Error("provider failed");
  const observed = assert.rejects(
    rejected.promise,
    (candidate) => candidate === error,
  );
  rejected.reject(error);
  await observed;
});

test("pause waits on real time while timeout interval and Date are frozen", async (t) => {
  assert.equal(typeof pause, "function");
  t.mock.timers.enable({
    apis: ["setTimeout", "setInterval", "Date"],
    now: 1234,
  });
  let elapsed = false;
  realTimeout(() => {
    elapsed = true;
  }, 0);
  await pause(20);
  assert.equal(elapsed, true);
  assert.equal(Date.now(), 1234);
});

test("bounded returns the value or real timeout marker and preserves rejection", async (t) => {
  assert.equal(typeof bounded, "function");
  t.mock.timers.enable({
    apis: ["setTimeout", "setInterval", "Date"],
    now: 1234,
  });
  const value = { ready: true };
  assert.equal(await bounded(Promise.resolve(value)), value);
  const error = new Error("disconnected");
  await assert.rejects(
    bounded(Promise.reject(error)),
    (candidate) => candidate === error,
  );
  assert.equal(await bounded(new Promise(() => {}), 20), "nothing after 20 ms");
  assert.equal(Date.now(), 1234);
});

test("until keeps its deadline even when an asynchronous check never settles", async (t) => {
  t.mock.timers.enable({
    apis: ["setTimeout", "setInterval", "Date"],
    now: 1234,
  });
  const gate = deferred();
  let calls = 0;
  try {
    const waiting = until(
      () => {
        calls++;
        return gate.promise;
      },
      "held response",
      { timeoutMs: 20 },
    );
    await assert.rejects(bounded(waiting, 200), {
      code: "ERR_ASSERTION",
      message: /held response/,
    });
  } finally {
    gate.resolve(false);
  }
  await turns(3);
  assert.equal(calls, 1, "an expired wait must not start another check");
  assert.equal(Date.now(), 1234);
});

test("failure returns the original rejection and rejects success with the call label", async () => {
  assert.equal(typeof failure, "function");
  const error = new Error("provider unavailable");
  assert.equal(await failure(Promise.reject(error)), error);
  await assert.rejects(failure(Promise.resolve("done"), "transcription"), {
    code: "ERR_ASSERTION",
    message: /transcription.*should have failed/,
  });
  await assert.rejects(failure(Promise.resolve()), {
    message: /the call.*should have failed/,
  });
});

test("until serializes slow asynchronous checks", async () => {
  let active = 0,
    maximum = 0,
    calls = 0;
  const result = { transcript: "ready" };
  const value = await until(async () => {
    active++;
    maximum = Math.max(maximum, active);
    await pause(5);
    active--;
    calls++;
    return calls === 3 ? result : false;
  }, "slow transcript");
  assert.equal(value, result);
  assert.equal(calls, 3);
  assert.equal(maximum, 1);
});

test("until observes real events and expires while timeout interval and Date are frozen", async (t) => {
  t.mock.timers.enable({
    apis: ["setTimeout", "setInterval", "Date"],
    now: 1234,
  });
  let ready = false;
  realTimeout(() => {
    ready = true;
  }, 20);
  assert.equal(
    await bounded(
      until(() => ready && "published", "real event"),
      1000,
    ),
    "published",
  );
  await assert.rejects(
    bounded(
      until(() => false, "absent event", { timeoutMs: 20 }),
      200,
    ),
    {
      code: "ERR_ASSERTION",
      message: /absent event/,
    },
  );
  assert.equal(Date.now(), 1234);
});

test("until preserves errors thrown or rejected by the check", async () => {
  const error = new Error("state unavailable");
  await assert.rejects(
    until(() => {
      throw error;
    }, "read state"),
    (candidate) => candidate === error,
  );
  await assert.rejects(
    until(async () => {
      throw error;
    }, "read async state"),
    (candidate) => candidate === error,
  );
});
