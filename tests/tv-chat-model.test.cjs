const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = path.join(__dirname, '../tv/app');
const facadeNames = [
  'POLL', 'PollPlan', 'badgeReference', 'cancelTarget', 'clock', 'describeJob',
  'describeJobFreshness', 'describeJobFreshnessShort', 'describeJobProgress', 'mergeState', 'pollPolicy', 'registryMarks',
];
const plain = value => JSON.parse(JSON.stringify(value));

function loadNode() {
  let model;
  assert.doesNotThrow(() => { model = require('../tv/app/chat-model.js'); }, 'the shared model loads without a page');
  return model;
}

function loadClassic() {
  const context = vm.createContext({});
  for (const name of ['text.js', 'chat-model.js']) {
    const filename = path.join(app, name);
    assert.doesNotThrow(() => vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename }));
  }
  return context;
}

test('the model loads through CommonJS and as a classic script without browser services', () => {
  const model = loadNode();
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(model, globalThis.TVLensChatModel);
  assert.deepEqual(Object.keys(model).sort(), [...facadeNames, 'jobActive'].sort());
  const context = loadClassic();
  assert.deepEqual(Object.keys(context).sort(), ['TVLensChatModel', 'TVLensText']);
  assert.deepEqual(Object.keys(context.TVLensChatModel).sort(), Object.keys(model).sort());
  for (const name of facadeNames.filter(name => name !== 'POLL')) {
    assert.equal(typeof model[name], 'function', name);
    assert.equal(typeof context.TVLensChatModel[name], 'function', name);
  }
  assert.equal(model.clock, require('../tv/app/text.js').clock);
  assert.equal(context.TVLensChatModel.clock, context.TVLensText.clock);
  assert.deepEqual(plain(context.TVLensChatModel.POLL), model.POLL);
});

const availability = { throughMs: 8000, lastPassage: { startMs: 0, endMs: 8000 } };
const cases = [
  ['completed answer', { status: 'done', result: { kind: 'observation', answer: 'Une main se lève.' } },
    { kindLabel: 'Observations de la vidéo', answer: 'Une main se lève.', error: null }],
  ['technical error', { status: 'error', errorDetail: { turnStatus: 'failed', turnError: { code: 'rate_limit' } } },
    { kindLabel: null, answer: null, error: 'Erreur technique.' }],
  ['abstention', { status: 'done', result: { kind: 'insufficient', answer: 'Preuves insuffisantes.' } },
    { kindLabel: 'Contexte insuffisant', answer: 'Preuves insuffisantes.', error: null }],
  ['partial answer', { status: 'running', startedAt: 1000, preview: 'Brouillon', provisional: 'Résumé' },
    { kindLabel: null, answer: null, error: null }],
];

for (const [label, job, expected] of cases) {
  test('CommonJS and classic models agree on a ' + label, () => {
    const node = loadNode();
    const classic = loadClassic().TVLensChatModel;
    const input = { ...job, availability };
    const context = { serverNowMs: 3000 };
    const view = node.describeJob(input, context);
    assert.deepEqual(plain(classic.describeJob(input, context)), view);
    assert.deepEqual({ kindLabel: view.kindLabel, answer: view.answer, error: view.error }, expected);
    assert.deepEqual(plain(classic.describeJobProgress(input, context)), node.describeJobProgress(input, context));
    assert.equal(classic.describeJobFreshness(input), node.describeJobFreshness(input));
    assert.equal(classic.describeJobFreshnessShort(input), node.describeJobFreshnessShort(input));
    assert.equal(classic.jobActive(input), node.jobActive(input));
    assert.equal(classic.cancelTarget([input]), node.cancelTarget([input]));
  });
}

test('the companion facade uses the shared functions and constants by identity', () => {
  const model = loadNode();
  const facade = require('../tv/app/companion.js');
  assert.deepEqual(Object.keys(facade).sort(), facadeNames);
  for (const name of facadeNames) assert.equal(facade[name], model[name], name);
});

test('view fallback uses status and code independently of the server wording', () => {
  for (const model of [loadNode(), loadClassic().TVLensChatModel]) {
    for (const [status, code, message, permanent, fallback] of [
      [400, 'unknown-view', 'Autre formulation / unknown resource!', true, true],
      [400, undefined, 'Vue d’état inconnue.', false, true],
      [400, 'invalid-anchor', 'Vue d’état inconnue.', false, true],
      [404, undefined, 'Old route', true, true],
      [404, 'route-not-found', 'Autre route', true, true],
      [404, 'media-missing', 'Vue d’état inconnue.', false, false],
      [401, 'unknown-view', 'Vue d’état inconnue.', false, false],
      [500, 'unknown-view', 'Vue d’état inconnue.', false, false],
      [409, 'read-only', 'Vue d’état inconnue.', false, false],
    ]) {
      const plan = new model.PollPlan();
      const error = Object.assign(new Error(message), { status, code });
      assert.equal(plan.refused(error, 100), fallback, `${status} ${code}: fallback`);
      assert.equal(plan.legacy, permanent, `${status} ${code}: permanent`);
      assert.equal(plan.viewsAfter, fallback && !permanent ? 10100 : 0);
    }
  }
});
