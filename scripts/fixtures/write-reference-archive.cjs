const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { HeadlessRuntime } = require("../../runtime/headless-runtime.cjs");

const EPOCH_MS = 1790000000000;
const BLOCK_MS = 8000;
const TRUNCATED_BYTES = 16;
const QUESTION = "Que montre le début ?";
const ANSWER = "Un cercle se déplace sur un fond bleu (réponse simulée).";

// Une publication du vrai runtime confirme la fin de l'analyse et de la lecture du suivi.
async function capture(runtime, sessionId, input, count) {
  let listener;
  const published = new Promise(resolve => {
    listener = state => {
      const passages = state.session?.segments || [];
      const coverage = runtime.surveillanceRegistry().coverage;
      if (passages.length === count && passages.every(passage => passage.status === "ready") && coverage.scanned === count) resolve();
    };
    runtime.listeners.add(listener);
  });
  try {
    await Promise.all([runtime.ingest({ sessionId, ...input }), published]);
    await runtime.session.watch.persist();
    await runtime.surveillance.flush();
    await runtime.session.store.flush();
  } finally {
    runtime.listeners.delete(listener);
  }
}

async function writeSession(runtime, clock, clip, jpeg, destination, interrupted) {
  const { id } = await runtime.start();
  runtime.startSurveillance({ sessionId: id, instruction: "Vérifie les affirmations du programme." });
  await runtime.surveillance.ready();
  for (let count = 1; count <= 2; count++) {
    const startMs = (count - 1) * BLOCK_MS;
    clock.elapsed += BLOCK_MS;
    clock.wall += BLOCK_MS;
    await capture(runtime, id, {
      startMs, endMs: count * BLOCK_MS, clip,
      audio: Buffer.from([82, 73, 70, 70, 0, 0, 0, 0]),
      frames: [{ atMs: startMs, dataUrl: "data:image/jpeg;base64," + jpeg }],
    }, count);
  }
  const asked = runtime.ask({ sessionId: id, question: QUESTION, anchorMs: 2 * BLOCK_MS });
  const job = runtime.deep.jobs.find(item => item.id === asked.id);
  await job.done;
  if (job.status !== "done") throw new Error("La question simulée a échoué.");
  await runtime.pause();
  runtime.stopSurveillance({ sessionId: id });
  await runtime.surveillance.flush();
  runtime.questionSaves.flush();
  await runtime.session.store.flush();
  if (!interrupted) {
    const ended = await runtime.end();
    if (!ended.archived) throw new Error("L'archive n'a pas été confirmée.");
  }
  const target = path.join(destination, id);
  await fs.cp(path.join(runtime.library.root, id), target, { recursive: true });
  if (interrupted) {
    await fs.truncate(path.join(target, "media", "moment-2.webm"), TRUNCATED_BYTES);
    await fs.writeFile(path.join(target, "session.json.tmp"), '{"id":"écriture interrompue",');
  }
  return { id, state: interrupted ? "interrupted" : "archived" };
}

async function main(destination) {
  if (!destination) throw new Error("Indique un nouveau dossier de sortie, jamais un corpus figé existant.");
  // mkdir sans recursive refuse toute destination existante, même vide : aucun témoin n'est remplacé.
  await fs.mkdir(destination);
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-reference-"));
  const clock = { elapsed: 0, wall: EPOCH_MS };
  const runtime = new HeadlessRuntime({
    sessionsRoot: path.join(staging, "captures"), userData: staging,
    smoke: true, config: { backgroundIndex: false }, selectedModels: {},
    readClock: () => clock.elapsed, wallClock: () => clock.wall,
    agent: { answer: async () => ({ answer: ANSWER, kind: "explanation", citations: [], limits: [] }) },
  });
  try {
    const clip = await fs.readFile(path.join(__dirname, "../../tests/fixtures/ffmpeg-webm-head.webm"));
    const jpeg = (await sharp({ create: {
      width: 64, height: 36, channels: 3, background: "#264136",
    } }).jpeg().toBuffer()).toString("base64");
    const archived = await writeSession(runtime, clock, clip, jpeg, destination, false);
    clock.wall += 60000;
    const interrupted = await writeSession(runtime, clock, clip, jpeg, destination, true);
    console.log(JSON.stringify({ archived, interrupted }, null, 2));
  } finally {
    // L'arrêt ne touche que le staging ; la copie interrompue a déjà quitté sa vie active.
    await runtime.close();
    await fs.rm(staging, { recursive: true, force: true });
  }
}

main(process.argv[2]).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
