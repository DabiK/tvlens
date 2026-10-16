const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isEmptySession } = require("../runtime/empty-session.cjs");

test("only a fresh session without jobs, historical questions or passages is empty", () => {
  for (const fresh of [false, true]) {
    for (const jobs of [0, 1]) {
      for (const questions of [0, 1]) {
        for (const passages of [0, 1]) {
          const facts = Object.freeze({ fresh, jobs, questions, passages });
          assert.equal(isEmptySession(facts), fresh && !jobs && !questions && !passages, JSON.stringify(facts));
        }
      }
    }
  }
});
