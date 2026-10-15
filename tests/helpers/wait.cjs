const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");

const FAST_CHECK_TURNS = 100;
const POLL_INTERVAL_MS = 2;
const DEFAULT_TIMEOUT_MS = 5000;
// Les tests peuvent remplacer les minuteries globales après cet import.
const realTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

const pause = (ms) => new Promise((resolve) => realTimeout(resolve, ms));
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function turns(count) {
  assert.ok(
    Number.isInteger(count) && count > 0,
    "turns requires a positive integer",
  );
  for (let i = 0; i < count; i++) await tick();
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function until(check, what, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  assert.ok(
    typeof what === "string" && what.trim(),
    "until requires a non-empty label",
  );
  const deadline = performance.now() + timeoutMs;
  const error = new assert.AssertionError({
    message: "never reached: " + what,
  });
  let timer,
    finished = false;
  const timeout = new Promise((_resolve, reject) => {
    timer = realTimeout(() => reject(error), timeoutMs);
  });
  const poll = async () => {
    for (
      let attempt = 0;
      !finished && performance.now() < deadline;
      attempt++
    ) {
      const value = await check();
      if (finished || performance.now() >= deadline) break;
      if (value) return value;
      if (attempt < FAST_CHECK_TURNS) {
        await tick();
      } else {
        await pause(POLL_INTERVAL_MS);
      }
    }
    throw error;
  };
  try {
    return await Promise.race([poll(), timeout]);
  } finally {
    finished = true;
    realClearTimeout(timer);
  }
}

async function bounded(promise, ms = DEFAULT_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = realTimeout(() => resolve(`nothing after ${ms} ms`), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    realClearTimeout(timer);
  }
}

function failure(promise, what = "the call") {
  return promise.then(
    () => assert.fail(what + " should have failed"),
    (error) => error,
  );
}

module.exports = { until, tick, turns, deferred, pause, bounded, failure };
