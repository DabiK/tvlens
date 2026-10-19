const fs = require("node:fs/promises");
const path = require("node:path");
const { ViewingMemory } = require("../../core/memory/index.cjs");
const { createEventPublisher } = require("../../core/shared/events.cjs");
const { LocalSessionStore } = require("../../adapters/local-store.cjs");
const { SessionThumbnails } = require("../../adapters/session-thumbnails.cjs");
const { createSessionManifest } = require("../../runtime/session-manifest.cjs");

const ID = "4473f9a2-3179-4ba8-b5f5-e5462d11fb52";
const WINDOW_MS = 12000;
const EPOCH_MS = 1792195200000;

async function main(destination) {
  if (!destination) throw new Error("Indique un nouveau dossier de sortie.");
  if (typeof ViewingMemory.prototype.prune !== "function") {
    throw Object.assign(new Error("Ce générateur exige l’élagage historique. Utilise le code du commit producteur 5e3f479."), {
      code: "TVLENS_HISTORICAL_PRUNING_REQUIRED",
    });
  }
  // Aucun témoin existant ne peut être remplacé, même si sa racine est vide.
  await fs.mkdir(destination);
  const root = path.join(destination, ID);
  const store = LocalSessionStore.forSession(root);
  const thumbnails = new SessionThumbnails(path.join(root, "thumbs"));
  const events = createEventPublisher();
  let clock = 0, settled;
  const manifest = createSessionManifest({
    id: ID, host: "server", store, thumbnails, readClock: () => clock,
    wallClock: () => EPOCH_MS + clock, readOnly: () => false, hasConfirmedEnd: () => false,
    accepting: () => watch.accepting,
    memory: { view: () => watch.memoryView(), passages: ids => watch.memoryPassages(ids) },
  });
  // Le témoin figé provient du commit 5e3f479 : sa fenêtre exige le cœur historique.
  const watch = new ViewingMemory({
    id: ID, now: () => clock, retentionMs: WINDOW_MS, media: store, archive: store, thumbnails,
    onEvents: pending => pending.forEach(event => events.publish(event)),
    perception: {
      transcribe: async ({ id }) => {
        if (id === "moment-2") throw new Error("Transcription indisponible dans le témoin.");
        return { observation: { transcript: "Un cercle bleu traverse l’écran." }, elapsedMs: 0 };
      },
      observeVisual: async ({ id }) => {
        if (id === "moment-2") throw new Error("Image indisponible dans le témoin.");
        return { observation: { summary: "Le cercle bleu continue son trajet." }, elapsedMs: 0 };
      },
    },
    onChange: state => {
      manifest.publish();
      const last = state.segments.at(-1);
      if (last && ["ready", "error"].includes(last.status) && !state.analyzing) settled?.();
    },
  });
  manifest.connect(events);
  const fixtures = path.join(__dirname, "../../tests/fixtures");
  const clip = await fs.readFile(path.join(fixtures, "ffmpeg-webm-head.webm"));
  const jpeg = await fs.readFile(path.join(fixtures,
    "archives/durable-v1/7dc1babe-e2b2-4199-9a4d-08811887ed9c/thumbs/moment-1.jpg"));
  for (const [startMs, endMs] of [[0, 1000], [1000, 2000], [8000, 9000], [15000, 16000]]) {
    clock = endMs;
    const analyzed = new Promise(resolve => { settled = resolve; });
    await watch.ingest({
      startMs, endMs, clip, audio: Buffer.from("audio simulé"),
      frames: [{ atMs: startMs, dataUrl: "data:image/jpeg;base64," + jpeg.toString("base64") }],
    });
    await analyzed;
    await watch.persist();
    await store.flush();
  }
  await watch.prune();
  // Données de conversation synthétiques, sauvegardées par le vrai port d'archive.
  watch.questions.push({ question: "Quelle forme ?", answer: "Un cercle bleu.", atMs: 1000 });
  await store.saveResearch({ jobs: [{
    id: "deep-1", sessionId: ID, question: "Quelle forme ?", anchorMs: 1000, status: "done",
    result: { answer: "Un cercle bleu.", kind: "explanation", citations: [], limits: [] },
  }] });
  watch.closeIntake();
  manifest.disconnect();
  await watch.close();
  await thumbnails.close();
  await store.flush();
  await manifest.record({}, true);
  // Altération documentée après la confirmation : le passage reste disponible dans l'état sauvegardé.
  await fs.rm(path.join(root, "media", "moment-3.webm"));
  await fs.rm(path.join(root, "media", "moment-3.json"));
}

main(process.argv[2]).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
