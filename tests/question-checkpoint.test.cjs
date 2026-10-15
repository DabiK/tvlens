const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  createQuestionCheckpoint,
} = require("../runtime/question-checkpoint.cjs");
const { manualClock } = require("./helpers/clock.cjs");

const DELAY_MS = 1000;
const running = (id, preview = "") => ({ id, status: "running", preview });
const done = (id, preview = "") => ({ id, status: "done", preview });
const stateOf = (...jobs) => ({ jobs });
// A store that only keeps what it is handed, in order. `refuse` makes the next writes fail, as a disk would.
const fakeStore = ({ refuse = false } = {}) => {
  const store = {
    writes: [],
    saveResearch(state) {
      store.writes.push(state);
      return refuse
        ? Promise.reject(new Error("EIO"))
        : Promise.resolve();
    },
  };
  return store;
};
const timers = (t) => t.mock.timers.enable({ apis: ["setTimeout"] });

test("injected timers save the latest draft at one second and are cancelled by flush and forget", async (t) => {
  const clock = manualClock(), store = fakeStore();
  const saves = createQuestionCheckpoint({
    setTimer: clock.io.setTimer,
    clearTimer: clock.io.clearTimer,
  });
  t.after(() => saves.forget());
  const initial = stateOf(running("a"));
  saves.checkpoint(store, initial);
  saves.checkpoint(store, stateOf(running("a", "un")));
  const latest = stateOf(running("a", "un deux"));
  saves.checkpoint(store, latest);
  assert.equal(clock.armed, 1, "several drafts share one injected timer");
  await clock.advance(DELAY_MS - 1);
  assert.deepEqual(store.writes, [initial], "nothing before the second is over");
  await clock.advance(1);
  assert.deepEqual(store.writes, [initial, latest], "the latest draft at one second");
  assert.deepEqual([clock.armed, saves.pending()], [0, false]);

  const flushed = stateOf(running("a", "à sauvegarder"));
  saves.checkpoint(store, flushed);
  assert.equal(clock.armed, 1);
  saves.flush();
  assert.deepEqual([clock.armed, saves.pending()], [0, false], "flush cancels the injected timer");
  await clock.advance(DELAY_MS * 3);
  assert.deepEqual(store.writes, [initial, latest, flushed], "flush leaves no late write");

  saves.checkpoint(store, stateOf(running("a", "à oublier")));
  assert.equal(clock.armed, 1);
  saves.forget();
  assert.deepEqual([clock.armed, saves.pending()], [0, false], "forget cancels the injected timer");
  await clock.advance(DELAY_MS * 3);
  assert.deepEqual(store.writes, [initial, latest, flushed], "forget leaves no late write");
});

test("a question that appears, leaves or changes status is saved at once", (t) => {
  timers(t);
  const store = fakeStore();
  const saves = createQuestionCheckpoint({ delayMs: DELAY_MS });
  saves.checkpoint(store, stateOf(running("a")));
  assert.equal(store.writes.length, 1, "a new question");
  saves.checkpoint(store, stateOf(running("a"), running("b")));
  assert.equal(store.writes.length, 2, "a second question");
  saves.checkpoint(store, stateOf(done("a"), running("b")));
  assert.equal(store.writes.length, 3, "a question that changes status");
  assert.equal(saves.pending(), false, "nothing waits for its second");
});

test("the same shape while a job is active is saved once after the delay, with the latest state", (t) => {
  timers(t);
  const store = fakeStore();
  const saves = createQuestionCheckpoint({ delayMs: DELAY_MS });
  saves.checkpoint(store, stateOf(running("a")));
  const first = store.writes.length;
  saves.checkpoint(store, stateOf(running("a", "un")));
  saves.checkpoint(store, stateOf(running("a", "un deux")));
  const latest = stateOf(running("a", "un deux trois"));
  saves.checkpoint(store, latest);
  assert.deepEqual(
    [store.writes.length - first, saves.pending()],
    [0, true],
    "the drafts wait while the second is not over",
  );
  t.mock.timers.tick(DELAY_MS - 1);
  assert.equal(store.writes.length - first, 0, "not before the delay");
  t.mock.timers.tick(1);
  assert.deepEqual(store.writes.slice(first), [latest], "one write, the latest state");
  assert.equal(saves.pending(), false);
  t.mock.timers.tick(DELAY_MS * 5);
  assert.equal(store.writes.length - first, 1, "no further write once it was handed over");
});

test("the state is saved at once when no job is active any more, whatever its shape", (t) => {
  timers(t);
  const store = fakeStore();
  const saves = createQuestionCheckpoint({ delayMs: DELAY_MS });
  saves.checkpoint(store, stateOf(running("a")));
  saves.checkpoint(store, stateOf(running("a", "brouillon")));
  assert.equal(saves.pending(), true);
  const ended = stateOf(done("a", "réponse"));
  saves.checkpoint(store, ended);
  assert.equal(store.writes.at(-1), ended);
  assert.equal(saves.pending(), false, "the timer is cleared with the write");
  const settled = stateOf(done("a", "réponse finale"));
  saves.checkpoint(store, settled);
  assert.equal(store.writes.at(-1), settled, "still no job active: saved at once, even with the same shape");
});

test("forget leaves no late write and no memory of the last shape saved", (t) => {
  timers(t);
  const store = fakeStore();
  const saves = createQuestionCheckpoint({ delayMs: DELAY_MS });
  saves.checkpoint(store, stateOf(running("a")));
  saves.checkpoint(store, stateOf(running("a", "brouillon")));
  const before = store.writes.length;
  saves.forget();
  assert.equal(saves.pending(), false);
  t.mock.timers.tick(DELAY_MS * 3);
  saves.flush();
  assert.equal(store.writes.length, before, "nothing is written after it");
  saves.checkpoint(store, stateOf(running("a")));
  assert.equal(store.writes.length, before + 1, "the same shape is new again once forgotten");
});

test("flush hands over what waits, now, and clears the timer", (t) => {
  timers(t);
  const store = fakeStore();
  const saves = createQuestionCheckpoint({ delayMs: DELAY_MS });
  saves.checkpoint(store, stateOf(running("a")));
  const waiting = stateOf(running("a", "brouillon"));
  saves.checkpoint(store, waiting);
  const before = store.writes.length;
  saves.flush();
  assert.deepEqual([store.writes.slice(before), saves.pending()], [[waiting], false]);
  t.mock.timers.tick(DELAY_MS * 3);
  assert.equal(store.writes.length, before + 1, "the timer that was set does not write it again");
  saves.flush();
  assert.equal(store.writes.length, before + 1, "nothing waits: nothing is written");
});

test("what waits is written into the store it was published for, by flush and by the timer, and into no other", (t) => {
  timers(t);
  const [first, second] = [fakeStore(), fakeStore()];
  const saves = createQuestionCheckpoint({ delayMs: DELAY_MS });
  saves.checkpoint(first, stateOf(running("a")));
  const late = stateOf(running("a", "brouillon"));
  saves.checkpoint(first, late);
  saves.flush();
  assert.deepEqual([first.writes.at(-1), second.writes.length], [late, 0], "flush");

  saves.forget();
  saves.checkpoint(second, stateOf(running("b")));
  const kept = stateOf(running("b", "brouillon"));
  saves.checkpoint(second, kept);
  t.mock.timers.tick(DELAY_MS);
  assert.deepEqual([second.writes.at(-1), first.writes.length], [kept, 2], "the timer");
});

// A state of the same shape, as the one already saved, waits for `first`; then one for `second` arrives
// with no `forget` between them: only the latest state waits, and with the store it was published for.
const waitForFirstThenSecond = () => {
  const [first, second] = [fakeStore(), fakeStore()];
  const saves = createQuestionCheckpoint({ delayMs: DELAY_MS });
  saves.checkpoint(first, stateOf(running("a")));
  saves.checkpoint(first, stateOf(running("a", "brouillon")));
  assert.deepEqual([first.writes.length, saves.pending()], [1, true], "a state waits for the first store");
  const latest = stateOf(running("a", "brouillon suivant"));
  saves.checkpoint(second, latest);
  return { first, second, saves, latest };
};

test("a state that waits for a store and is replaced by one for another store is flushed into the other only", (t) => {
  timers(t);
  const { first, second, saves, latest } = waitForFirstThenSecond();
  saves.flush();
  assert.deepEqual(second.writes, [latest], "the latest state, into the store it was published for");
  assert.equal(first.writes.length, 1, "nothing more into the store of the state it replaced");
});

test("a state that waits for a store and is replaced by one for another store is written by the timer into the other only", (t) => {
  timers(t);
  const { first, second, saves, latest } = waitForFirstThenSecond();
  t.mock.timers.tick(DELAY_MS);
  assert.deepEqual(second.writes, [latest], "the latest state, into the store it was published for");
  assert.equal(first.writes.length, 1, "nothing more into the store of the state it replaced");
  assert.equal(saves.pending(), false);
});

test("a store that refuses the write does not make the checkpoint throw or leave a rejection unhandled", async (t) => {
  timers(t);
  const store = fakeStore({ refuse: true });
  const saves = createQuestionCheckpoint({ delayMs: DELAY_MS });
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on("unhandledRejection", onUnhandled);
  t.after(() => process.off("unhandledRejection", onUnhandled));
  assert.doesNotThrow(() => saves.checkpoint(store, stateOf(running("a"))));
  assert.doesNotThrow(() => saves.checkpoint(store, stateOf(running("a", "brouillon"))));
  assert.doesNotThrow(() => saves.flush());
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual([store.writes.length, unhandled], [2, []]);
});

test("pending is true while a state waits or a timer is set, and false otherwise", (t) => {
  timers(t);
  const store = fakeStore();
  const saves = createQuestionCheckpoint({ delayMs: DELAY_MS });
  assert.equal(saves.pending(), false, "a new instance");
  saves.checkpoint(store, stateOf(running("a")));
  assert.equal(saves.pending(), false, "a state saved at once");
  saves.checkpoint(store, stateOf(running("a", "brouillon")));
  assert.equal(saves.pending(), true, "a state waits");
  t.mock.timers.tick(DELAY_MS);
  assert.equal(saves.pending(), false, "handed over by the timer");
});

test("the delay is a parameter of the module, one second by default", (t) => {
  timers(t);
  const store = fakeStore();
  const quick = createQuestionCheckpoint({ delayMs: 50 });
  quick.checkpoint(store, stateOf(running("a")));
  quick.checkpoint(store, stateOf(running("a", "brouillon")));
  t.mock.timers.tick(50);
  assert.equal(store.writes.length, 2, "a delay of 50 ms");

  const byDefault = createQuestionCheckpoint();
  byDefault.checkpoint(store, stateOf(running("b")));
  byDefault.checkpoint(store, stateOf(running("b", "brouillon")));
  t.mock.timers.tick(999);
  assert.equal(store.writes.length, 3, "not before a second");
  t.mock.timers.tick(1);
  assert.equal(store.writes.length, 4, "after a second");
});

test("the module loads nothing and reads neither the process, nor a disk, nor a network", () => {
  const source = fs
    .readFileSync(path.join(__dirname, "..", "runtime", "question-checkpoint.cjs"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(source, /\brequire\(|\bprocess\b|\bfetch\b|\bimport\b/);
});
