// Preuve réelle de trois minutes : aucun attendu de référence fourni au modèle.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.argv[2];
const read = file => fs.readFileSync(path.join(root, file));
const hash = file => crypto.createHash('sha256').update(read(file)).digest('hex');
const { blocks } = JSON.parse(read('blocks.json'));
const scenario = {
  version: 1,
  kind: 'nominal',
  index: { path: 'blocks.json', sha256: hash('blocks.json') },
  provenance: {
    kind: 'converted-video',
    reference: 'CNRS, trois premières minutes ; transport réel TV non mesuré.',
    preparation: { path: 'preparation.json', sha256: hash('preparation.json') },
  },
  plannedDurationMs: 190000,
  finalWaitMs: 180000,
  closeWaitMs: 30000,
  config: {
    perceptionBackend: 'local',
    questionsBackend: 'local',
    inspectionBackend: 'local',
    embeddingsBackend: 'local',
    localVlm: { url: 'http://127.0.0.1:11434', model: 'gemma3:4b', numCtx: 8192, keepAlive: '10m' },
    localQuestions: { url: 'http://127.0.0.1:11434', model: 'qwen3.8:27b', numCtx: 16384, keepAlive: '10m', think: 'off' },
    localEmbeddings: { url: 'http://127.0.0.1:11434', model: 'qwen3-embedding:0.6b', timeoutMs: 120000 },
    visionDuringAsk: true,
    backgroundIndex: true,
  },
  selectedModels: { observationModel: 'gemma3:4b', inspectionModel: 'gemma3:4b', codexModel: 'qwen3.8:27b' },
  clips: blocks.map((block, i) => ({ id: `clip-${i}`, block: i, occurrence: 0, atMs: block.startMs, language: 'fr' })),
  questions: [
    { id: 'q1', atMs: 65000, question: "Quel est le sujet de cette vidéo et qu'a expliqué l'intervenant jusqu'ici ?" },
    { id: 'q2', atMs: 125000, question: "Résume les explications de l'intervenant dans la dernière minute." },
    { id: 'q3', atMs: 185000, question: "Quels points clés faut-il retenir des trois minutes que nous venons de regarder ?" },
  ],
};
fs.writeFileSync(path.join(root, 'scenario.json'), JSON.stringify(scenario, null, 2), { flag: 'wx' });
