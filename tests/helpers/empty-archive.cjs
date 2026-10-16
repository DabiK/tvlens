const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

// Une archive produite avant cette vie de l'hôte, indépendante de sa règle de fin des sessions fraîches.
async function emptyArchive(sessionsRoot, host) {
  const id = randomUUID();
  const dir = path.join(sessionsRoot, id);
  const files = {
    "session.json": {
      id, elapsedMs: 8000, accepting: false, retention: "until-deleted", retentionMs: null,
      history: [], segments: [], questions: [],
    },
    "manifest.json": {
      format: "tvlens-session", version: 1, id, host, title: "Archive vide conservée",
      state: "archived", createdAt: 100, updatedAt: 200, closedAt: 200, elapsedMs: 8000,
      passages: 0, media: { stored: 0, missing: 0, bytes: 0, retention: "until-deleted" }, captures: [],
    },
    "deep-answers.json": { jobs: [] },
  };
  await fs.mkdir(dir, { recursive: true });
  for (const [name, value] of Object.entries(files))
    await fs.writeFile(path.join(dir, name), JSON.stringify(value));
  return { id, dir, files: Object.keys(files).sort() };
}

module.exports = { emptyArchive };
