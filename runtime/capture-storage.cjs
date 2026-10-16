const { STORAGE_FULL } = require("../adapters/disk-guard.cjs");

// L'identifiant peut être rouvert : la pause ne concerne que l'objet qui possède encore cette ingestion.
function shouldPauseForStorageFull({ code, session, currentSession }) {
  return code === STORAGE_FULL && session != null && session === currentSession;
}

module.exports = { shouldPauseForStorageFull };
