const { test } = require("node:test");
const assert = require("node:assert/strict");
const { shouldPauseForStorageFull } = require("../runtime/capture-storage.cjs");
const { STORAGE_FULL } = require("../adapters/disk-guard.cjs");

test("only a storage-full code for the same loaded session object requires a pause", () => {
  const session = Object.freeze({ id: "a" });
  for (const code of [STORAGE_FULL, "EIO", "ENOSPC", "storage-full", undefined]) {
    for (const currentSession of [session, Object.freeze({ id: "a" }), Object.freeze({ id: "b" }), null]) {
      const facts = Object.freeze({ code, session, currentSession });
      assert.equal(shouldPauseForStorageFull(facts), code === STORAGE_FULL && currentSession === session);
    }
  }
  assert.equal(shouldPauseForStorageFull({ code: STORAGE_FULL, session: null, currentSession: null }), false);
});
