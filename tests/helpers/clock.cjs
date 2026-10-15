const { turns: waitTurns } = require("./wait.cjs");
const realSetImmediate = setImmediate;
const VIRTUAL_EPOCH_MS = 1790000000000;
const settle = async () => {
  for (let i = 0; i < 2; i++)
    await new Promise((resolve) => realSetImmediate(resolve));
};

// Deux tours réels laissent les chaînes de promesses se terminer entre les minuteries.
class VirtualClock {
  constructor() {
    this.t = 0;
    this.timers = new Map();
    this.sequence = 0;
  }
  install() {
    this.saved = {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      now: Date.now,
    };
    const add = (fn, ms, args, repeat) => {
      const delay = Math.max(0, Number(ms) || 0);
      const timer = {
        id: ++this.sequence,
        at: this.t + delay,
        fn,
        args,
        repeat: repeat ? Math.max(1, delay) : 0,
        unref() {
          return timer;
        },
        ref() {
          return timer;
        },
      };
      this.timers.set(timer.id, timer);
      return timer;
    };
    const remove = (handle) => {
      this.timers.delete(
        handle && typeof handle === "object" ? handle.id : handle,
      );
    };
    globalThis.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
    globalThis.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
    globalThis.clearTimeout = remove;
    globalThis.clearInterval = remove;
    Date.now = () => VIRTUAL_EPOCH_MS + Math.floor(this.t);
    return this;
  }
  uninstall() {
    Object.assign(globalThis, {
      setTimeout: this.saved.setTimeout,
      clearTimeout: this.saved.clearTimeout,
      setInterval: this.saved.setInterval,
      clearInterval: this.saved.clearInterval,
    });
    Date.now = this.saved.now;
  }
  async runUntil(limit) {
    for (;;) {
      await settle();
      let next = null;
      for (const timer of this.timers.values())
        if (
          !next ||
          timer.at < next.at ||
          (timer.at === next.at && timer.id < next.id)
        )
          next = timer;
      if (!next || next.at > limit) break;
      this.t = next.at;
      if (next.repeat) next.at += next.repeat;
      else this.timers.delete(next.id);
      next.fn(...next.args);
    }
    this.t = limit;
    await settle();
  }
}

// L'avance est relative ; les tours réels conservent le rythme asynchrone de chaque appelant.
function manualClock({ turns = 1 } = {}) {
  let t = 0,
    sequence = 0;
  const timers = new Map();
  return {
    io: {
      now: () => t,
      setTimer: (fn, ms = 0) => {
        timers.set(++sequence, { at: t + ms, fn });
        return sequence;
      },
      clearTimer: (id) => {
        timers.delete(id);
      },
    },
    get armed() {
      return timers.size;
    },
    async advance(ms) {
      const limit = t + ms;
      for (;;) {
        await waitTurns(turns);
        let next;
        for (const [id, timer] of timers)
          if (timer.at <= limit && (!next || timer.at < next.at))
            next = { id, ...timer };
        if (!next) break;
        t = next.at;
        timers.delete(next.id);
        next.fn();
      }
      t = limit;
      await waitTurns(turns);
    },
  };
}

module.exports = { VirtualClock, manualClock };
