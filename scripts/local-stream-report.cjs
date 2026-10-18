const fs = require('node:fs/promises');
const path = require('node:path');
const { codeIdentity } = require('./perception-replay-identity.cjs');
const { readBytes, sha256 } = require('./perception-replay-input.cjs');

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
  for (const role of ['perception', 'questions', 'embeddings', 'inspection'])
    roles[role] = { configured: config[role + 'Backend'], identity: null, origin: null, exercised: false, calls: 0, localMeasurement: false };
  roles.transcription = { configured: 'whisper', identity: null, origin: null, exercised: false, calls: 0, localMeasurement: false };
  roles.surveillance = { configured: 'codex', identity: null, origin: null, exercised: false, calls: 0, localMeasurement: false };
  return roles;
}
function finalizeRoles(report) {
  for (const name of ['perception', 'questions', 'inspection', 'embeddings']) {
    const role = report.roles[name];
    const effective = role.observedIdentity;
    const ollama = effective?.kind === 'ollama' || effective?.backend === 'ollama';
    role.localMeasurement = Boolean(role.configured === 'local' && role.origin === 'composed' && role.exercised && ollama);
  }
}
module.exports = { reportWriter, identity, rolesOf, finalizeRoles };
