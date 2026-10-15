const { test } = require("node:test");
const assert = require("node:assert/strict");
const { VirtualClock, manualClock } = require("./helpers/clock.cjs");
const { turns } = require("./helpers/wait.cjs");

test("six turns finish a three-turn callback chain before the next timer while the default does not", async () => {
  for (const [options, expected] of [
    [undefined, false],
    [{ turns: 6 }, true],
  ]) {
    const clock = manualClock(options);
    let finished = false;
    let finishedAtNextTimer;
    let completion;
    clock.io.setTimer(() => {
      completion = turns(3).then(() => {
        finished = true;
      });
    }, 1);
    clock.io.setTimer(() => {
      finishedAtNextTimer = finished;
    }, 2);
    await clock.advance(2);
    await completion;
    assert.equal(finishedAtNextTimer, expected);
  }
});

test("manual advance fires due timers and their children in order, cancels timers and advances relatively", async () => {
  const clock = manualClock();
  const { now, setTimer, clearTimer } = clock.io;
  const events = [];
  setTimer(() => events.push(["later", now()]), 20);
  setTimer(() => {
    events.push(["parent", now()]);
    setTimer(() => events.push(["child", now()]), 2);
  }, 5);
  setTimer(() => events.push(["tie", now()]), 5);
  const cancelled = setTimer(() => events.push(["cancelled", now()]), 3);
  assert.equal(now(), 0);
  assert.equal(clock.armed, 4);
  clearTimer(cancelled);
  assert.equal(clock.armed, 3);
  await clock.advance(10);
  assert.deepEqual(events, [
    ["parent", 5],
    ["tie", 5],
    ["child", 7],
  ]);
  assert.equal(now(), 10);
  assert.equal(clock.armed, 1);
  await clock.advance(10);
  assert.deepEqual(events.at(-1), ["later", 20]);
  assert.equal(now(), 20);
  assert.equal(clock.armed, 0);
  await clock.advance(4);
  assert.equal(now(), 24);
});

test("install replaces the global timers and time, and uninstall restores their original identities", () => {
  const names = ["setTimeout", "setInterval", "clearTimeout", "clearInterval"];
  const originals = Object.fromEntries(
    names.map((name) => [name, globalThis[name]]),
  );
  const originalNow = Date.now;
  const clock = new VirtualClock();
  try {
    assert.equal(clock.install(), clock);
    for (const name of names)
      assert.notEqual(globalThis[name], originals[name]);
    assert.notEqual(Date.now, originalNow);
  } finally {
    clock.uninstall();
  }
  for (const name of names) assert.equal(globalThis[name], originals[name]);
  assert.equal(Date.now, originalNow);
});

test("runUntil orders deadlines and creation ties, repeats intervals and leaves later timers armed", async () => {
  const clock = new VirtualClock().install();
  try {
    const epoch = Date.now();
    const events = [];
    const record = (name) => events.push([name, clock.t, Date.now() - epoch]);
    setTimeout(record, 10, "first tie");
    setTimeout(record, 10, "second tie");
    setTimeout(record, 3, "earlier");
    setTimeout(record, 21, "later");
    const cancelled = setTimeout(record, 2, "cancelled");
    clearTimeout(cancelled);
    const interval = setInterval(record, 5, "interval");
    await clock.runUntil(12);
    assert.deepEqual(events, [
      ["earlier", 3, 3],
      ["interval", 5, 5],
      ["first tie", 10, 10],
      ["second tie", 10, 10],
      ["interval", 10, 10],
    ]);
    assert.equal(clock.t, 12);
    assert.equal(Date.now() - epoch, 12);
    assert.equal(clock.timers.size, 2);
    clearInterval(interval);
    await clock.runUntil(21);
    assert.deepEqual(events.at(-1), ["later", 21, 21]);
    assert.equal(clock.timers.size, 0);
  } finally {
    clock.uninstall();
  }
});
