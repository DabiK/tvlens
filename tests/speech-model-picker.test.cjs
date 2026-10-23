const test = require('node:test');
const assert = require('node:assert/strict');
const { createMacDocument } = require('./helpers/mac-document.cjs');
const { WHISPER_MODELS } = require('../adapters/whisper-model-catalog.cjs');

const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);

async function fixture(t, overrides = {}) {
  const document = createMacDocument();
  const previous = global.document;
  global.document = document;
  t.after(() => { if (previous === undefined) delete global.document; else global.document = previous; });
  const { speechModelPicker } = await import('../app/ui/speech-model-picker.mjs');
  const calls = [];
  const picker = speechModelPicker({ selectedId: 'base', language: 'fr',
    models: WHISPER_MODELS.map(model => ({ ...model, present: model.id === 'small' })), ...overrides,
  }, {
    bridge: { setupAction: async (...args) => calls.push(args) },
    get: id => document.getElementById(id),
    button: (text, run) => {
      const button = document.createElement('button');
      button.textContent = text;
      button.onclick = run;
      return button;
    },
  });
  const nodes = descendants(picker);
  return { picker, calls, nodes, selects: nodes.filter(node => node.tagName === 'SELECT'),
    buttons: nodes.filter(node => node.tagName === 'BUTTON') };
}

test('the picker exposes all variants with sizes and language restrictions and sends the exact selection', async t => {
  const f = await fixture(t);
  const [model, language] = f.selects;
  assert.equal(model.value, 'base');
  assert.equal(language.value, 'fr');
  const options = descendants(model).filter(node => node.tagName === 'OPTION');
  assert.equal(options.length, WHISPER_MODELS.length);
  assert.match(options.find(node => node.value === 'small.en').textContent, /anglais uniquement/);
  assert.match(options.find(node => node.value === 'large-v3-turbo-q5_0').textContent, /548 Mio/);
  model.value = 'large-v3-turbo-q5_0';
  model.onchange();
  assert.match(f.picker.textContent, /perte de fidélité possible/);
  await f.buttons[0].onclick();
  assert.deepEqual(f.calls, [['download-model', { modelId: 'large-v3-turbo-q5_0', language: 'fr' }]]);
});

test('an installed model can be reselected and a language can be saved without a download', async t => {
  const f = await fixture(t);
  f.selects[0].value = 'small';
  f.selects[0].onchange();
  assert.equal(f.buttons[0].textContent, 'Vérifier et utiliser ce modèle');
  f.selects[1].value = 'en';
  await f.buttons[1].onclick();
  assert.deepEqual(f.calls, [['speech-language', { language: 'en' }]]);
});

test('setup rows name the configured model and never label a custom file as base', async () => {
  const { setupRows } = await import('../app/ui/setup-view.mjs');
  const report = { checks: [{ id: 'whisperModel', state: 'present' }], paths: { whisperModel: '/custom/model.bin' },
    speech: { models: WHISPER_MODELS, language: 'fr' } };
  assert.match(setupRows(report)[0].detail, /personnalisé/);
  report.speech.selectedId = 'medium';
  assert.match(setupRows(report)[0].detail, /Whisper medium/);
});

test('the preload forwards model and language choices through the existing setup IPC', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const calls = [], exposed = {};
  new Function('require', fs.readFileSync(path.join(__dirname, '../app/preload.cjs'), 'utf8'))(() => ({
    contextBridge: { exposeInMainWorld: (key, api) => { exposed[key] = api; } },
    ipcRenderer: { invoke: async (...args) => calls.push(args) },
  }));
  await exposed.tvlens.setupAction('download-model', { modelId: 'small', language: 'fr' });
  assert.deepEqual(calls, [['setup:action', 'download-model', { modelId: 'small', language: 'fr' }]]);
});
