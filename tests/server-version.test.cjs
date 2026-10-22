const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RemoteServer } = require('../server/http.cjs');
const identity = { name: 'tvlens', version: '0.1.0', commit: 'a'.repeat(40), commitDate: '2026-10-23T00:00:00Z', dirty: false };

async function fixture(t, build) {
  const token = 'a'.repeat(32);
  const server = await new RemoteServer({ runtime: { captureEpoch: 0 }, media: {}, token, build }).listen(0);
  t.after(() => server.close());
  return { url: server.url + '/v1/version', headers: { Authorization: 'Bearer ' + token } };
}

test('version is authenticated, has no session dependency and exposes only construction and Node identity', async t => {
  const { url, headers } = await fixture(t, identity);
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  const response = await fetch(url, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { build: identity, node: process.version });
});

test('an unpackaged server explicitly reports an unknown construction', async t => {
  const { url, headers } = await fixture(t);
  assert.deepEqual(await (await fetch(url, { headers })).json(), { build: null, node: process.version });
});

test('the UI describes unknown, clean and modified constructions', async () => {
  const { buildLabel } = await import('../app/ui/build-info.mjs');
  assert.equal(buildLabel(null), 'Construction inconnue');
  assert.equal(buildLabel(identity), 'TVLens 0.1.0 · aaaaaaaaaaaa');
  assert.equal(buildLabel({ ...identity, dirty: true }), 'TVLens 0.1.0 · aaaaaaaaaaaa · modifiée');
});
