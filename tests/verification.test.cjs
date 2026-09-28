const { test } = require('node:test');
const assert = require('node:assert/strict');
const { VerificationService } = require('../core/verification.cjs');
const { isolatedEnvironment, invocation } = require('../adapters/codex-verifier.cjs');
const { safeExternalUrl } = require('../adapters/external-links.cjs');
const evidence = { url: 'https://www.nasa.gov/mission/apollo-11/', title: 'Apollo 11', publisher: 'NASA', publishedAt: null, evidence: 'Date de la mission.', relation: 'contradicts' };
function verifier(result) { return new VerificationService({ verifier: { verify: async () => result } }); }
test('verification without external research or sources must abstain', async () => {
  const result = await verifier({ normalizedClaim: 'Claim', conclusion: 'Faux.', assessment: 'contradicted', sources: [evidence], limitations: [], research: { webSearches: 0 } }).verify({ claim: 'Claim' });
  assert.equal(result.assessment, 'insufficient'); assert.equal(result.sources.length, 0);
  assert.doesNotMatch(result.conclusion, /Faux/);
});
test('verification preserves evidence and removes invalid or duplicate links', async () => {
  const result = await verifier({ normalizedClaim: 'Claim', conclusion: 'Les sources donnent une autre date.', assessment: 'contradicted', sources: [evidence, evidence, { ...evidence, url: 'javascript:alert(1)' }], limitations: [], research: { webSearches: 2 } }).verify({ claim: 'Claim' });
  assert.equal(result.sources.length, 1); assert.equal(result.assessment, 'contradicted');
});
test('a failed verifier releases its slot and rejects overlapping jobs', async () => {
  let reject;
  const service = new VerificationService({ verifier: { verify: () => new Promise((_resolve, r) => { reject = r; }) } });
  const pending = service.verify({ claim: 'Claim' });
  await assert.rejects(service.verify({ claim: 'Another' }), /déjà/);
  reject(new Error('Timeout')); await assert.rejects(pending, /Timeout/);
  assert.equal(service.busy, false);
});
test('Codex subprocess receives no provider keys and has no shell/connectors', () => {
  const env = isolatedEnvironment({ HOME: '/home/user', PATH: '/bin', CODEX_HOME: '/auth', OPENROUTER_API_KEY: 'secret', OPENAI_API_KEY: 'secret', CODEX_API_KEY: 'secret', OTHER_TOKEN: 'secret' });
  assert.deepEqual(env, { PATH: '/bin', HOME: '/home/user', CODEX_HOME: '/auth' });
  const args = invocation('/tmp/isolated', '/tmp/schema', '/tmp/result');
  assert.ok(args.includes('--ignore-user-config')); assert.ok(args.includes('--ephemeral'));
  assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
  for (const feature of ['shell_tool', 'unified_exec', 'apps', 'plugins', 'computer_use']) assert.ok(args.some((arg, index) => arg === '--disable' && args[index + 1] === feature));
  assert.ok(args.includes('web_search="live"'));
});
test('verification publishes progress and archives the final evidence', async () => {
  const states = [], archived = [];
  const service = new VerificationService({ verifier: { verify: async () => ({ normalizedClaim: 'Claim', conclusion: 'Preuve.', assessment: 'supported', sources: [evidence], limitations: [], research: { webSearches: 1 } }) }, onChange: state => states.push(state), archive: { save: async job => archived.push(job) }, now: () => 1234 });
  await service.verify({ claim: 'Claim' });
  assert.equal(states[0].busy, true); assert.equal(states[0].jobs[0].status, 'running');
  assert.equal(states.at(-1).busy, false); assert.equal(states.at(-1).jobs[0].status, 'done');
  assert.equal(archived[0].result.sources[0].url, evidence.url);
});
test('source links must be public HTTPS URLs, never local files or actions', () => {
  assert.equal(safeExternalUrl(evidence.url), evidence.url);
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://localhost/', 'https://127.0.0.1/', 'https://[::1]/', 'https://host.local/', 'https://user:pass@example.com/', 'https://example.com:8443/']) assert.equal(safeExternalUrl(url), null, url);
});
