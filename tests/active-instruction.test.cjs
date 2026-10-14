const { test } = require("node:test");
const assert = require("node:assert/strict");
const { activeInstruction } = require("../runtime/active-instruction.cjs");

const SESSION_ID = "session-1";
const INSTRUCTION = "Dis-moi quand le but est marqué.";
// A surveillance that answers with `state` and records the options it was asked with.
const surveillanceOf = (state) => {
  const surveillance = {
    options: [],
    snapshot(options) {
      surveillance.options.push(options);
      return state;
    },
  };
  return surveillance;
};
const activeOn = (sessionId, instruction = INSTRUCTION) => ({
  enabled: true,
  sessionId,
  activation: { instruction },
});

test("the instruction of a surveillance that is active on the session is handed back", () => {
  const surveillance = surveillanceOf(activeOn(SESSION_ID));

  assert.equal(activeInstruction(surveillance, SESSION_ID), INSTRUCTION);
});

test("the state is read in its brief form", () => {
  const surveillance = surveillanceOf(activeOn(SESSION_ID));

  activeInstruction(surveillance, SESSION_ID);

  assert.deepEqual(surveillance.options, [{ brief: true }]);
});

test("a surveillance active on another session gives no instruction", () => {
  const surveillance = surveillanceOf(activeOn("session-2"));

  assert.equal(activeInstruction(surveillance, SESSION_ID), undefined);
});

test("a surveillance that is stopped gives no instruction", () => {
  const surveillance = surveillanceOf({
    ...activeOn(SESSION_ID),
    enabled: false,
  });

  assert.equal(activeInstruction(surveillance, SESSION_ID), undefined);
});

test("no surveillance, or no state of it, gives no instruction", () => {
  assert.equal(activeInstruction(undefined, SESSION_ID), undefined);
  assert.equal(activeInstruction(null, SESSION_ID), undefined);
  assert.equal(activeInstruction({}, SESSION_ID), undefined);
  assert.equal(
    activeInstruction(surveillanceOf(undefined), SESSION_ID),
    undefined,
  );
});

test("a surveillance without instruction gives none", () => {
  const surveillance = surveillanceOf({
    enabled: true,
    sessionId: SESSION_ID,
  });

  assert.equal(activeInstruction(surveillance, SESSION_ID), undefined);
});

test("a state that cannot be read gives no instruction instead of an error", () => {
  const surveillance = {
    snapshot() {
      throw new Error("surveillance unavailable");
    },
  };

  assert.doesNotThrow(() => activeInstruction(surveillance, SESSION_ID));
  assert.equal(activeInstruction(surveillance, SESSION_ID), undefined);
});
