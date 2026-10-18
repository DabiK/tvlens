const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("the historical archive generator refuses a core without pruning before creating its destination", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-pruned-generator-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const script = path.join(__dirname, "../scripts/fixtures/write-pruned-archive.cjs");
  const result = spawnSync(process.execPath, [script, path.join(root, "archive")], { encoding: "utf8" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
  assert.deepEqual(await fs.readdir(root), [], "refusing the historical API must leave no partial archive");
  assert.match(result.stderr, /TVLENS_HISTORICAL_PRUNING_REQUIRED/);
  assert.match(result.stderr, /5e3f479/);
});
