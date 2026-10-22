const fs = require('node:fs/promises');
const path = require('node:path');
const { codeIdentity } = require('./perception-replay-identity.cjs');
const { readBytes, sha256 } = require('./perception-replay-input.cjs');
const { campaignWebResidence } = require('./local-stream-web.cjs');

function reportWriter(outputDir, report) {
  let pending = Promise.resolve();
  return { save() {
    const file = path.join(outputDir, 'campaign.json');
    const attempt = pending.then(async () => {
      // Lire au départ de l'écriture inclut les erreurs des sauvegardes qui la précèdent dans la file.
      const raw = JSON.stringify(report, null, 2);
      await fs.writeFile(file + '.tmp', raw, { mode: 0o600 });
      await fs.rename(file + '.tmp', file);
    });
    // Les publications ne sont pas toutes attendues : conserver le diagnostic et débloquer les sauvegardes suivantes.
    pending = attempt.catch(error => {
      report.diagnostics.push({ code: 'TVLENS_REPLAY_REPORT_WRITE_FAILED', causeCode: error.code || 'UNKNOWN' });
    });
    return attempt;
  } };
}
async function identity(dependencies) {
  const code = await codeIdentity(dependencies);
  const files = (await fs.readdir(__dirname)).filter(file => file.startsWith('local-stream-') || file === 'replay-local-stream.cjs');
  for (const file of files) code.sources['scripts/' + file] = sha256(await readBytes(path.join(__dirname, file)));
  for (const file of ['runtime/headless-runtime.cjs', 'runtime/conversation-runtime.cjs', 'server/http.cjs',
    'adapters/remote-media.cjs', 'adapters/ollama/question-agent.cjs', 'adapters/embeddings/ollama-embeddings.cjs', 'tv/transport.py'])
    code.sources[file] = sha256(await readBytes(path.join(__dirname, '..', file)));
  return code;
}
function rolesOf(config) {
  const roles = {};
  for (const role of ['perception', 'questions', 'embeddings', 'inspection', 'transcription', 'surveillance',
    'surveillanceDetection', 'surveillanceWeb']) {
    const configured = config[role + 'Backend'] ?? (role === 'transcription' ? 'whisper' : 'codex');
    const settings = { perception: 'localVlm', questions: 'localQuestions', embeddings: 'localEmbeddings', inspection: 'localVlm' };
    const parameters = configured === 'local' ? config[settings[role]] || {} : {};
    roles[role] = { configured, identity: null, origin: null, exercised: false, successful: false, calls: 0,
      localMeasurement: false, evidence: [], parameters: Object.fromEntries(['model', 'numCtx', 'keepAlive', 'timeoutMs']
        .filter(key => parameters[key] !== undefined).map(key => [key, parameters[key]])) };
  }
  return roles;
}
function roleStatus(role) {
  if (role.configured === 'disabled') return 'disabled';
  if (!role.exercised) return 'not-exercised';
  if (role.origin === 'simulated' || role.origin === 'injected' || role.origin === 'substituted') return 'simulated';
  if (role.failures && !role.successful) return 'failed';
  if (!role.identity || role.identity.kind === 'unknown') return 'unknown';
  return 'observed';
}
function finalizeRoles(report) {
  report.roles.questions.successful = report.questions.some(entry => entry.acquired && entry.status === 'done');
  report.roles.questions.failures = report.questions.filter(entry => entry.status === 'error').length;
  report.roles.questions.evidence = report.questions.filter(entry => entry.called?.exercised).map(entry => ({
    id: entry.id, jobId: entry.jobId, status: entry.status, acquired: Boolean(entry.acquired), identity: entry.called.identity,
    providerRequests: entry.metrics?.calls?.providerRequests ?? null, metrics: structuredClone(entry.metrics ?? null),
  }));
  report.webResidence = campaignWebResidence(report.questions);
  for (const name of Object.keys(report.roles)) {
    const role = report.roles[name];
    for (const key of ['model', 'numCtx', 'keepAlive', 'temperature', 'reasoningEffort', 'threads', 'audioCtx'])
      if (role.identity?.[key] !== undefined) role.parameters[key] = role.identity[key];
    const effective = role.observedIdentity;
    const ollama = effective?.kind === 'ollama' || effective?.backend === 'ollama';
    role.localMeasurement = Boolean(role.configured === 'local' && role.origin === 'composed' && role.exercised && role.successful && ollama);
    role.status = roleStatus(role);
  }
}
module.exports = { reportWriter, identity, rolesOf, finalizeRoles };
