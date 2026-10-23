const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { showConfigWelcome, explainConfigImport } = require('../app/config-welcome.cjs');

function welcome(restore) {
  const handlers = new Map();
  class BrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = { mainFrame: {}, setWindowOpenHandler() {}, on() {} };
    }
    async loadFile(file) { this.file = file; }
  }
  const ipcMain = { handle: (name, fn) => handlers.set(name, fn), removeHandler: name => handlers.delete(name) };
  const result = showConfigWelcome({ BrowserWindow, ipcMain, restore });
  const event = { sender: result.window.webContents, senderFrame: result.window.webContents.mainFrame };
  return { ...result, handlers, invoke: (action, source = event) => handlers.get('config:welcome')(source, action) };
}

test('the welcome window loads before any protected call and ignores untrusted or unknown choices', async () => {
  let accesses = 0;
  const screen = welcome(async () => { accesses++; return { apiKey: 'private' }; });
  assert.equal(accesses, 0);
  assert.ok(screen.window.file.endsWith('config-welcome.html'));
  assert.equal(screen.window.options.webPreferences.sandbox, true);
  await assert.rejects(screen.invoke('restore', { sender: {} }), /Unauthorized/);
  assert.deepEqual(await screen.invoke('anything'), { error: 'Choix inconnu.' });
  assert.equal(accesses, 0);
  assert.deepEqual(await screen.invoke('restore'), { ready: true });
  assert.deepEqual(await screen.choice, { apiKey: 'private' });
  assert.equal(accesses, 1);
  screen.window.emit('closed');
  assert.equal(screen.handlers.size, 0);
});

test('a refused unlock remains on the welcome screen and can continue without decrypting again', async () => {
  let accesses = 0;
  const screen = welcome(async () => { accesses++; throw Error('private native detail'); });
  const refused = await screen.invoke('restore');
  assert.match(refused.error, /réessayer/);
  assert.doesNotMatch(refused.error, /private/);
  assert.deepEqual(await screen.invoke('skip'), { ready: true });
  assert.equal(await screen.choice, null);
  assert.equal(accesses, 1);
});

test('a pending keychain choice cannot race a second unlock or skip', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const screen = welcome(() => pending);
  const restoring = screen.invoke('restore');
  assert.match((await screen.invoke('skip')).error, /en cours/);
  release({ apiKey: 'private' });
  assert.deepEqual(await restoring, { ready: true });
  assert.deepEqual(await screen.choice, { apiKey: 'private' });
});

test('the import explanation defaults to temporary use and treats closing as cancellation', async () => {
  for (const [response, expected] of [[0, 'save'], [1, 'temporary'], [2, 'cancel'], [undefined, 'cancel']]) {
    let options;
    const choice = await explainConfigImport({ showMessageBox: async (_window, shown) => { options = shown; return { response }; } }, {});
    assert.equal(choice, expected);
    assert.equal(options.defaultId, 1);
    assert.equal(options.cancelId, 2);
    assert.match(options.detail, /TVLens Safe Storage/);
    assert.match(options.detail, /mot de passe de ta session Mac/);
  }
});

test('the welcome controls never request access until clicked and recover from refusal', async () => {
  const { bindConfigWelcome } = await import('../app/ui/config-welcome.mjs');
  const nodes = Object.fromEntries(['restore', 'skip', 'feedback'].map(id => [id, { disabled: false, textContent: '' }]));
  const calls = [];
  bindConfigWelcome({ get: id => nodes[id], choose: async action => { calls.push(action); return { error: 'Accès refusé.' }; } });
  assert.deepEqual(calls, []);
  await nodes.restore.onclick();
  assert.deepEqual(calls, ['restore']);
  assert.equal(nodes.feedback.textContent, 'Accès refusé.');
  assert.equal(nodes.skip.disabled, false);
  await nodes.skip.onclick();
  assert.deepEqual(calls, ['restore', 'skip']);
});

test('the welcome preload exposes only its choice, never capture, sessions or provider commands', async () => {
  const fs = require('node:fs/promises');
  const source = await fs.readFile(require.resolve('../app/preload.cjs'), 'utf8');
  const exposed = {};
  const calls = [];
  const electron = { contextBridge: { exposeInMainWorld: (name, value) => { exposed[name] = value; } },
    ipcRenderer: { invoke: async (...args) => { calls.push(args); return { ready: true }; } } };
  new Function('require', 'process', source)(() => electron, { argv: ['electron', '--config-welcome'] });
  assert.deepEqual(Object.keys(exposed), ['configuration']);
  assert.deepEqual(Object.keys(exposed.configuration), ['choose']);
  assert.deepEqual(await exposed.configuration.choose('skip'), { ready: true });
  assert.deepEqual(calls, [['config:welcome', 'skip']]);
});
