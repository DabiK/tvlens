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
test('shared runtime and headless transport do not import Electron',()=>{
  for(const dir of ['runtime','server'])for(const file of fs.readdirSync(path.join(__dirname,'..',dir))){
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'..',dir,file),'utf8'),/require\(['"]electron['"]\)/,dir+'/'+file);
  }
});
test('active Codex roles do not depend on the legacy MCP transport', () => {
  const root = path.join(__dirname, '..');
  for (const filename of ['adapters/codex-session-agent.cjs', 'adapters/codex-session-client.cjs', 'adapters/codex-analysis-agent.cjs', 'adapters/companion-prompt.cjs']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, filename), 'utf8'), /require\(['"]\.\/codex-video-agent\.cjs['"]\)/, filename);
  }
  for (const filename of ['adapters/codex-perception.cjs', 'adapters/codex-recap.cjs']) {
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    assert.doesNotMatch(source, /require\(['"]\.\/codex-session-agent\.cjs['"]\)/, filename);
    assert.match(source, /codex-analysis-agent\.cjs/, filename);
  }
});
