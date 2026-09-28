const fs = require('node:fs/promises');
const { VerificationService } = require('../core/verification.cjs');
const { CodexVerifier } = require('../adapters/codex-verifier.cjs');
(async () => {
  const claim = process.argv.slice(2).join(' ') || 'Le premier alunissage habité a eu lieu en 1972.';
  const service = new VerificationService({ verifier: new CodexVerifier() });
  const result = await service.verify({ claim, context: 'Affirmation fournie explicitement pour un test de vérification. Aucun média transmis.' });
  await fs.writeFile('docs/verification-live.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!result.sources.length) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
