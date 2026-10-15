const test = require('node:test');
const assert = require('node:assert/strict');
const { clock, plural } = require('../tv/app/text.js');

const CLOCK_CASES = [
  [0, '0:00'], [61000, '1:01'], [59999, '0:59'], [3723000, '1:02:03'], [-5000, '0:00'],
  [NaN, '0:00'], [Infinity, '0:00'], [undefined, '0:00'], ['12', '0:00'],
];

test('clock writes minutes and seconds, and the hour once past it', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(61000), '1:01');
  assert.equal(clock(59999), '0:59');
  assert.equal(clock(3723000), '1:02:03');
});

test('clock shows 0:00 for a negative position', () => {
  assert.equal(clock(-5000), '0:00');
});

test('clock shows 0:00 for a value that is not a finite number', () => {
  for (const value of [NaN, Infinity, undefined, '12']) assert.equal(clock(value), '0:00', String(value));
});

test('plural keeps the singular for zero and one, the plural form above', () => {
  assert.equal(plural(1, 'passage', 'passages'), '1 passage');
  assert.equal(plural(0, 'passage', 'passages'), '0 passage');
  assert.equal(plural(2, 'passage', 'passages'), '2 passages');
});

test('plural adds an s when no plural form is given', () => {
  assert.equal(plural(2, 'image'), '2 images');
});

test('the chat column exports the same clock as the shared script', () => {
  const { clock: chatClock } = require('../tv/app/companion.js');
  for (const [value, shown] of CLOCK_CASES) assert.equal(chatClock(value), shown, String(value));
});

test('the sessions view exports the same clock as the shared script', () => {
  const { clock: sessionsClock } = require('../tv/app/sessions-view.js');
  for (const [value, shown] of CLOCK_CASES) assert.equal(sessionsClock(value), shown, String(value));
});
