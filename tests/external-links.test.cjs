const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sourceKey } = require('../adapters/external-links.cjs');

test('a source key is the same with and without a fragment', () => {
  const plain = sourceKey('https://www.example.org/articles/volcan');
  assert.equal(plain, 'https://www.example.org/articles/volcan');
  assert.equal(sourceKey('https://www.example.org/articles/volcan#chapitre-2'), plain);
});

test('a source key keeps the query string, which names a different page', () => {
  assert.notEqual(sourceKey('https://www.example.org/a?id=1'), sourceKey('https://www.example.org/a?id=2'));
});

test('a source key is null for a page that is not a safe external link', () => {
  for (const value of [
    'http://www.example.org/page',
    'https://user:secret@www.example.org/page',
    'https://93.184.216.34/page',
    'https://[2001:db8::1]/page',
    'https://nas.local/page',
    'https://localhost/page',
    'https://example.org:8443/page',
    'javascript:alert(1)',
    'not a url',
    '',
    null,
    undefined,
    42,
  ]) assert.equal(sourceKey(value), null, String(value));
});
