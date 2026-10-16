const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const REPOSITORY = path.join(__dirname, '..');
const LAYER_EXTENSIONS = ['.js', '.cjs', '.mjs'];
const DEPENDENCY_ZONES = [
  { pattern: 'core/**', imports: ['core/**'] },
  { pattern: 'adapters/**', imports: ['adapters/**', 'core/**'] },
  { pattern: 'runtime/**', imports: ['runtime/**', 'core/**', 'adapters/**'] },
  { pattern: 'server/**', imports: ['server/**', 'core/**', 'adapters/**', 'runtime/**'] },
  { pattern: 'mcp/**', imports: ['mcp/**', 'core/**'] },
  { pattern: 'app/**', imports: ['app/**', 'core/**', 'adapters/**', 'runtime/**'] },
];

function zoneFor(filename) {
  return DEPENDENCY_ZONES.filter(zone => filename.startsWith(zone.pattern.slice(0, -2)))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
}

function regexCanStartAfter(previous) {
  if (previous === undefined) return true;
  return /^(?:[([{=,:;!?~&|+*%^<>/-]|=>|return|throw|case|yield|void|typeof|delete|in|of|instanceof|else|do)$/.test(previous);
}

function declarationIsExpression(tokens, keywordIndex) {
  let previous = tokens[keywordIndex - 1];
  if (previous === 'async') previous = tokens[keywordIndex - 2];
  return previous !== undefined && ![';', '{', '}'].includes(previous) && regexCanStartAfter(previous);
}

function blockEndsStatement(tokens, closed) {
  const previous = tokens.at(-1);
  if (previous === ')') return closed?.functionExpression !== true;
  const classIndex = tokens.lastIndexOf('class');
  if (classIndex >= tokens.length - 2 && classIndex >= 0) return !declarationIsExpression(tokens, classIndex);
  return previous === undefined || [';', '{', '}', 'else', 'try', 'finally', 'do'].includes(previous);
}

function advanceRegexContext(value, tokens, state) {
  const previous = tokens.at(-1);
  if (value === '(') {
    const functionIndex = tokens.lastIndexOf('function');
    const functionExpression = functionIndex >= Math.max(0, tokens.length - 3) && declarationIsExpression(tokens, functionIndex);
    state.stack.push({ closing: ')', functionExpression,
      endsStatement: ['if', 'while', 'for', 'with', 'switch', 'catch'].includes(previous) });
  }
  if (value === '[') state.stack.push({ closing: ']', endsStatement: false });
  if (value === '{') state.stack.push({ closing: '}', endsStatement: blockEndsStatement(tokens, state.closed) });
  const closing = [')', ']', '}'].includes(value);
  const context = closing ? state.stack.pop() : null;
  state.closed = context;
  return closing ? context?.endsStatement === true : regexCanStartAfter(value);
}

function lexSource(source, filename) {
  const token = /\s+|"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*'|`(?:\\[\s\S]|[^`\\])*`|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|[\w$]+|\+\+|--|=>|[^\s]/gy;
  const regexp = /\/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\[\r\n])+\/[a-z]*/y;
  const tokens = [];
  const parts = [];
  const context = { stack: [], closed: null };
  let regexAllowed = true;
  while (token.lastIndex < source.length) {
    const index = token.lastIndex;
    regexp.lastIndex = index;
    // Le contexte distingue une regex d'une division, sans ouvrir de chaîne dans son corps.
    const startsComment = source.startsWith('//', index) || source.startsWith('/*', index);
    const literal = !startsComment && regexAllowed ? regexp.exec(source) : null;
    let value;
    if (literal) {
      value = literal[0];
      token.lastIndex = regexp.lastIndex;
    } else value = token.exec(source)[0];
    assert.ok(value !== "'" && value !== '"', `${filename}: unterminated string literal`);
    if (value.startsWith('//') || value.startsWith('/*')) {
      parts.push(' ');
      continue;
    }
    parts.push(value);
    if (!/^\s/.test(value)) {
      regexAllowed = advanceRegexContext(value, tokens, context);
      tokens.push(value);
    }
  }
  return { tokens, source: parts.join('') };
}

function literalImports(tokens) {
  const imports = [];
  for (let index = 0; index < tokens.length; index++) {
    const keyword = tokens[index];
    if (tokens[index - 1] === '.') continue;
    let value;
    if (keyword === 'from' || keyword === 'import') value = tokens[index + 1];
    if (['require', 'import'].includes(keyword) && tokens[index + 1] === '(' && tokens[index + 3] === ')') {
      value = tokens[index + 2];
    }
    if (/^['"]/.test(value ?? '')) imports.push(value.slice(1, -1));
  }
  return imports;
}

function resolveImport(filename, specifier) {
  if (!specifier.startsWith('.')) return null;
  const target = path.resolve(path.dirname(filename), specifier);
  const candidates = [target, ...LAYER_EXTENSIONS.map(extension => target + extension),
    ...LAYER_EXTENSIONS.map(extension => path.join(target, 'index' + extension))];
  const resolved = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? target;
  return path.relative(REPOSITORY, resolved).split(path.sep).join('/');
}

function* sources(directory, extensions) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* sources(filename, extensions);
    else if (entry.isFile() && extensions.includes(path.extname(entry.name))) yield filename;
  }
}

let modules;
function inventory() {
  if (modules) return modules;
  const collected = [];
  const roots = new Set(DEPENDENCY_ZONES.map(zone => zone.pattern.split('/')[0]));
  for (const root of roots) {
    const directory = path.join(REPOSITORY, root);
    assert.ok(fs.existsSync(directory), `${root}: missing layer root`);
    const filenames = Array.from(sources(directory, LAYER_EXTENSIONS));
    assert.ok(filenames.length > 0, `${root}: no JavaScript sources`);
    for (const filename of filenames) {
      const { tokens, source } = lexSource(fs.readFileSync(filename, 'utf8'), path.relative(REPOSITORY, filename));
      collected.push({ relative: path.relative(REPOSITORY, filename).split(path.sep).join('/'), root, source,
        imports: literalImports(tokens).map(specifier => ({ specifier, target: resolveImport(filename, specifier) })) });
    }
  }
  modules = collected;
  return modules;
}

test('layer dependency table permits only declared zones', t => {
  const edges = new Map();
  for (const { relative, imports } of inventory()) {
    const origin = zoneFor(relative);
    for (const { specifier, target } of imports) {
      if (target === null) {
        assert.ok(!relative.startsWith('core/'), `${relative} depends on ${specifier}`);
        continue;
      }
      const destination = zoneFor(target);
      assert.ok(destination && origin.imports.includes(destination.pattern), `${relative} depends on ${specifier} -> ${target}`);
      const edge = `${origin.pattern} -> ${destination.pattern}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  for (const root of new Set(inventory().map(module => module.root))) {
    t.diagnostic(`${root}: ${inventory().filter(module => module.root === root).length} fichiers JavaScript`);
  }
  for (const [edge, count] of edges) t.diagnostic(`${edge}: ${count} imports`);
});

test('portable core does not access host globals', () => {
  for (const { relative, source, root } of inventory()) {
    if (root !== 'core') continue;
    assert.doesNotMatch(source, /\b(?:fetch|ipcRenderer|ipcMain|localStorage|document|window|process|Buffer)\s*[.(]/, relative);
  }
});
test('shared runtime and headless transport do not import Electron', () => {
  for (const { relative, imports, root } of inventory()) {
    if (!['runtime', 'server'].includes(root)) continue;
    assert.ok(!imports.some(({ specifier }) => specifier === 'electron'), `${relative} depends on electron`);
  }
});
test('compositions leave watch session lifecycle flags to the domain', () => {
  const member = String.raw`\bwatch\s*(?:\.\s*(?:ending|accepting|readOnly|closed)\b|\[\s*(['"])(?:ending|accepting|readOnly|closed)\1\s*\])`;
  const assignment = String.raw`\s*(?:=(?!=|>)|(?:\*\*|<<|>>>?|&&|\|\||\?\?|[-+*/%&|^])=|\+\+|--)`;
  const write = new RegExp(member + assignment);
  for (const { relative, source, root } of inventory()) {
    if (!['app', 'runtime', 'server', 'mcp'].includes(root) || !relative.endsWith('.cjs')) continue;
    const match = write.exec(source);
    assert.equal(match?.[0] ?? null, null, `${relative} writes ${match?.[0]}`);
  }
});
test('core services do not import the session use case', () => {
  for (const { relative, root, imports } of inventory()) {
    if (root !== 'core' || relative === 'core/session.cjs') continue;
    for (const { target } of imports) {
      assert.notEqual(target, 'core/session.cjs', `${relative} depends on the session use case`);
    }
  }
});
test('surveillance does not depend on DeepAsk or chat scheduling flags', () => {
  const module = inventory().find(module => module.relative === 'core/surveillance.cjs');
  assert.ok(module, 'core/surveillance.cjs must exist');
  const { relative, source, imports } = module;
  assert.doesNotMatch(source, /\basking\b|manualBusy|prioritizeManual/, relative);
  for (const { target } of imports) {
    assert.notEqual(target, 'core/deep-ask.cjs', `${relative} depends on core/deep-ask.cjs`);
  }
});
test('active Codex roles do not depend on the legacy MCP transport', () => {
  for (const filename of ['adapters/openrouter.cjs', 'adapters/codex-video-agent.cjs']) {
    assert.equal(fs.existsSync(path.join(REPOSITORY, filename)), false, `${filename} must remain absent`);
  }
  const active = ['adapters/codex-session-agent.cjs', 'adapters/codex-session-client.cjs',
    'adapters/codex-analysis-agent.cjs', 'adapters/companion-prompt.cjs'];
  for (const filename of active) {
    const module = inventory().find(module => module.relative === filename);
    assert.ok(module, `${filename} must exist`);
    assert.ok(!module.imports.some(({ target }) => target === 'adapters/codex-video-agent.cjs'), filename);
  }
  for (const filename of ['adapters/codex-perception.cjs', 'adapters/codex-recap.cjs']) {
    const module = inventory().find(module => module.relative === filename);
    assert.ok(module, `${filename} must exist`);
    assert.ok(!module.imports.some(({ target }) => target === 'adapters/codex-session-agent.cjs'), filename);
    assert.ok(module.imports.some(({ target }) => target === 'adapters/codex-analysis-agent.cjs'), filename);
  }
});
