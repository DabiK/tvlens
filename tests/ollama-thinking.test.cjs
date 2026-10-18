const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeThink } = require('../adapters/ollama/thinking.cjs');

test('thinking validation requires an explicit setting name even for a valid or absent value', () => {
  for (const value of [undefined, 'default', 'on', 'off', 'invalid']) {
    assert.throws(() => normalizeThink(value), error => error.code === 'TVLENS_LOCAL_THINK_INVALID'
      && !error.message.includes('TVLENS_LOCAL_QUESTIONS_THINK'));
  }
});

test('invalid thinking values name the caller setting without choosing another role or echoing the value', () => {
  for (const setting of ['TVLENS_LOCAL_VLM_THINK', 'TVLENS_LOCAL_QUESTIONS_THINK', 'ANOTHER_LOCAL_ROLE_THINK']) {
    assert.throws(() => normalizeThink('PRIVATE_INVALID_VALUE', setting), error => error.code === 'TVLENS_LOCAL_THINK_INVALID'
      && error.message.includes(setting) && !error.message.includes('PRIVATE_INVALID_VALUE'));
  }
});
