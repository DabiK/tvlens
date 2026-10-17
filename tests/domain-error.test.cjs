const { test } = require('node:test');
const assert = require('node:assert/strict');
const shared = require('../core/shared/domain-error.cjs');

test('domain errors retain their originating cause and expose no transport metadata or shared catalogue', () => {
  const cause = new TypeError('Donnée illisible.');
  const error = shared.domainError('CONTEXT_REFUSED', 'Refus de la demande.', cause);
  assert.equal(error.cause, cause);
  assert.equal(error.code, 'CONTEXT_REFUSED');
  assert.equal(error.message, 'Refus de la demande.');
  assert.equal(error.status, undefined);
  assert.deepEqual(Object.keys(shared), ['domainError']);
  assert.ok(error instanceof Error);
});
