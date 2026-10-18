const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { readBytes, sha256 } = require('./perception-replay-input.cjs');

const ROOT = path.join(__dirname, '..');
const SOURCES = ['scripts/replay-local-perception.cjs', 'scripts/perception-replay-input.cjs',
  'scripts/perception-replay-context.cjs', 'scripts/perception-replay-execution.cjs', 'scripts/perception-replay-cli.cjs',
  'scripts/perception-replay-identity.cjs', 'runtime/session-providers.cjs',
  'adapters/codex-perception.cjs', 'adapters/local-vlm-agent.cjs'];

function gitStream(args, consume, spawnImpl) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
    const fail = () => reject(Object.assign(Error('Identité Git indisponible.'), { code: 'TVLENS_REPLAY_CODE_IDENTITY_FAILED' }));
    child.on('error', fail);
    child.stdout.on('error', fail);
    child.stdout.on('data', consume);
    child.on('close', code => {
      if (code !== 0) fail();
      else resolve();
    });
  });
}
async function codeIdentity({ spawnImpl = spawn } = {}) {
  let sha = '', dirty = false;
  await gitStream(['rev-parse', 'HEAD'], chunk => { sha += chunk.toString('utf8'); }, spawnImpl);
  await gitStream(['status', '--porcelain'], chunk => { dirty ||= chunk.length > 0; }, spawnImpl);
  // Le diff suivi peut être volumineux : ses octets rejoignent directement l'empreinte.
  const diff = createHash('sha256');
  await gitStream(['diff', 'HEAD'], chunk => diff.update(chunk), spawnImpl);
  const sources = {};
  for (const file of SOURCES) sources[file] = sha256(await readBytes(path.join(ROOT, file)));
  return { sha: sha.trim(), dirty, diffSha256: diff.digest('hex'), sources };
}
module.exports = { codeIdentity };
