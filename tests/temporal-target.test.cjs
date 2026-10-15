const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolveTemporalTarget } = require("../core/temporal-target.cjs");

const anchorMs = 180000;
const segments = [
  { id: "moment-1", startMs: 12000, endMs: 30000 },
  { id: "moment-2", startMs: 30000, endMs: 60000 },
];
const cases = [
  ["integer seconds", "il y a 30 secondes", segments, 150000],
  ["decimal comma minutes", "y a 1,5 min", segments, 90000],
  ["spelled minutes", "il y a deux minutes", segments, 60000],
  ["spelled seconds", "depuis une seconde", segments, 179000],
  ["uppercase words", "Il y a UNE minute", segments, 120000],
  ["accented beginning", "au tout début", segments, 12001],
  ["absolute minutes and seconds", "vers 12:34", segments, 754000],
  ["absolute moment", "au moment 1:05", segments, 65000],
  ["absolute overrides relative", "il y a 30 secondes, vers 12:34", segments, 754000],
  ["first passage", "premier passage", segments, 12001],
  ["first passage without segments", "premier passage", [], undefined],
  ["no temporal reference", "Que voit-on ?", segments, undefined],
];

for (const [name, question, passages, expected] of cases) {
  test(`temporal target preserves ${name}`, () => {
    assert.equal(resolveTemporalTarget(question, passages, anchorMs), expected);
  });
}
