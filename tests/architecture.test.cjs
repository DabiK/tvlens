const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('portable core has no Electron, provider, platform or adapter imports', () => {
  const root = path.join(__dirname, '..', 'core');
  for (const filename of fs.readdirSync(root)) {
    const source = fs.readFileSync(path.join(root, filename), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const match of source.matchAll(/(?:require\s*\(|from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('./') && !match[1].includes('..'), `${filename} depends on ${match[1]}`);
    }
    assert.doesNotMatch(source, /\b(?:fetch|ipcRenderer|ipcMain|localStorage|document|window|process|Buffer)\s*[.(]/, filename);
  }
});
