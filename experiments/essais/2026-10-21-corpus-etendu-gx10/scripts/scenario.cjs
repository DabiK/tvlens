// Scénario identique à la référence, sans attendus ni réponses de référence.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const [root, questionsPath, language] = process.argv.slice(2);
if (!root || !questionsPath || !['fr', 'en'].includes(language)) throw Error('SCENARIO_ARGUMENTS');
const read = name => fs.readFileSync(path.join(root, name));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const { blocks } = JSON.parse(read('blocks.json'));
const { questions } = JSON.parse(fs.readFileSync(questionsPath));
if (!Array.isArray(blocks) || !blocks.length || !Array.isArray(questions) || questions.length !== 5) {
  throw Error('SCENARIO_INPUTS');
}
const duration = Math.max(...blocks.map(block => block.endMs));
if (questions.some(item => !Number.isInteger(item.atMs) || item.atMs >= duration)) {
  throw Error('QUESTION_OUTSIDE_MEDIA');
}
const scenario = {
  version: 1, kind: 'nominal',
  index: { path: 'blocks.json', sha256: sha256(read('blocks.json')) },
  provenance: {
    kind: 'converted-video',
    reference: 'Corpus étendu ; comparaison exploratoire Whisper ; transport TV exclu.',
    preparation: { path: 'preparation.json', sha256: sha256(read('preparation.json')) },
  },
  plannedDurationMs: duration, finalWaitMs: 180000, closeWaitMs: 30000,
  config: {
    perceptionBackend: 'local', questionsBackend: 'local', inspectionBackend: 'local',
    embeddingsBackend: 'local',
    localVlm: { url: 'http://127.0.0.1:11434', model: 'gemma3:4b', numCtx: 8192, keepAlive: '10m' },
    localQuestions: { url: 'http://127.0.0.1:11434', model: 'qwen3.8:27b', numCtx: 16384, keepAlive: '10m', think: 'off' },
    localEmbeddings: { url: 'http://127.0.0.1:11434', model: 'qwen3-embedding:0.6b', timeoutMs: 120000 },
    visionDuringAsk: true, backgroundIndex: true,
  },
  selectedModels: { observationModel: 'gemma3:4b', inspectionModel: 'gemma3:4b', codexModel: 'qwen3.8:27b' },
  clips: blocks.map((block, index) => ({ id: `clip-${index}`, block: index, occurrence: 0,
    atMs: block.startMs, language })),
  questions,
};
fs.writeFileSync(path.join(root, 'scenario.json'), JSON.stringify(scenario, null, 2), { flag: 'wx' });
