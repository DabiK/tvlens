const fs = require("node:fs/promises");
const path = require("node:path");

const corpus = path.join(__dirname, "../fixtures/archives/pruned-v1");

async function copyPrunedArchive(sessionsRoot) {
  const expected = JSON.parse(await fs.readFile(path.join(corpus, "expected.json"), "utf8"));
  await fs.cp(path.join(corpus, expected.id), path.join(sessionsRoot, expected.id), { recursive: true });
  return expected;
}

module.exports = { copyPrunedArchive };
