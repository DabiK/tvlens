const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const REPOSITORY = path.join(__dirname, '..');
const LAYER_EXTENSIONS = ['.js', '.cjs', '.mjs'];

function* sources(directory, extensions) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* sources(filename, extensions);
    else if (entry.isFile() && extensions.includes(path.extname(entry.name))) yield filename;
  }
}

test('portable core has no Electron, provider, platform or adapter imports', () => {
  for (const filename of sources(path.join(REPOSITORY, 'core'), LAYER_EXTENSIONS)) {
    const relative = path.relative(REPOSITORY, filename);
    const source = fs.readFileSync(filename, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const match of source.matchAll(/(?:require\s*\(|from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('./') && !match[1].includes('..'), `${relative} depends on ${match[1]}`);
    }
    assert.doesNotMatch(source, /\b(?:fetch|ipcRenderer|ipcMain|localStorage|document|window|process|Buffer)\s*[.(]/, relative);
  }
});
test('shared runtime and headless transport do not import Electron', () => {
  for (const directory of ['runtime', 'server']) {
    for (const filename of sources(path.join(REPOSITORY, directory), LAYER_EXTENSIONS)) {
      assert.doesNotMatch(fs.readFileSync(filename, 'utf8'), /require\(['"]electron['"]\)/, path.relative(REPOSITORY, filename));
    }
  }
});
test('compositions leave watch session lifecycle flags to the domain', () => {
  const member = String.raw`\bwatch\s*(?:\.\s*(?:ending|accepting|readOnly|closed)\b|\[\s*(['"])(?:ending|accepting|readOnly|closed)\1\s*\])`;
  const assignment = String.raw`\s*(?:=(?!=|>)|(?:\*\*|<<|>>>?|&&|\|\||\?\?|[-+*/%&|^])=|\+\+|--)`;
  const write = new RegExp(member + assignment);
  for (const directory of ['app', 'runtime', 'server', 'mcp']) {
    for (const filename of sources(path.join(REPOSITORY, directory), ['.cjs'])) {
      const source = fs.readFileSync(filename, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const match = write.exec(source);
      assert.equal(match?.[0] ?? null, null, `${path.relative(path.join(__dirname, '..'), filename)} writes ${match?.[0]}`);
    }
  }
});
test('core services do not import the session use case', () => {
  const root = path.join(REPOSITORY, 'core');
  for (const filename of sources(root, LAYER_EXTENSIONS)) {
    if (filename === path.join(root, 'session.cjs')) continue;
    const source = fs.readFileSync(filename, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const match of source.matchAll(/(?:require\s*\(|from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)) {
      assert.notEqual(match[1], './session.cjs', `${path.relative(REPOSITORY, filename)} depends on the session use case`);
    }
  }
});
test('active Codex roles do not depend on the legacy MCP transport', () => {
  const root = path.join(__dirname, '..');
  for (const filename of ['adapters/openrouter.cjs', 'adapters/codex-video-agent.cjs']) {
    assert.equal(fs.existsSync(path.join(root, filename)), false, `${filename} must remain absent`);
  }
  for (const filename of ['adapters/codex-session-agent.cjs', 'adapters/codex-session-client.cjs', 'adapters/codex-analysis-agent.cjs', 'adapters/companion-prompt.cjs']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, filename), 'utf8'), /require\(['"]\.\/codex-video-agent\.cjs['"]\)/, filename);
  }
  for (const filename of ['adapters/codex-perception.cjs', 'adapters/codex-recap.cjs']) {
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    assert.doesNotMatch(source, /require\(['"]\.\/codex-session-agent\.cjs['"]\)/, filename);
    assert.match(source, /codex-analysis-agent\.cjs/, filename);
  }
});
