const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { builtinModules } = require('node:module');
const vm = require('node:vm');
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

function sourceImports(tokens) {
  const imports = [];
  for (let index = 0; index < tokens.length; index++) {
    const keyword = tokens[index];
    const moduleRequire = keyword === 'require' && tokens[index - 1] === '.' && tokens[index - 2] === 'module';
    if (tokens[index - 1] === '.' && !moduleRequire) continue;
    const call = ['require', 'import'].includes(keyword) && tokens[index + 1] === '(';
    let value;
    if (keyword === 'from' || keyword === 'import') value = tokens[index + 1];
    if (call && tokens[index + 3] === ')') {
      value = tokens[index + 2];
    }
    if (/^['"]/.test(value ?? '')) imports.push({ specifier: value.slice(1, -1), index });
    else if (call) imports.push({ specifier: null, index });
  }
  return imports;
}

function resolveImport(filename, specifier) {
  if (!specifier?.startsWith('.')) return null;
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
  roots.add('tv/app');
  for (const root of roots) {
    const directory = path.join(REPOSITORY, root);
    assert.ok(fs.existsSync(directory), `${root}: missing layer root`);
    const filenames = Array.from(sources(directory, LAYER_EXTENSIONS));
    assert.ok(filenames.length > 0, `${root}: no JavaScript sources`);
    for (const filename of filenames) {
      const { tokens, source } = lexSource(fs.readFileSync(filename, 'utf8'), path.relative(REPOSITORY, filename));
      collected.push({ relative: path.relative(REPOSITORY, filename).split(path.sep).join('/'), root, source, tokens,
        imports: sourceImports(tokens).map(imported => ({ ...imported, target: resolveImport(filename, imported.specifier) })) });
    }
  }
  modules = collected;
  return modules;
}

function externalImportAllowed(relative, specifier, dependencies) {
  if (relative.startsWith('core/')) return false;
  const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
  if (packageName === 'electron') {
    return specifier === 'electron' && ['app/main.cjs', 'app/preload.cjs'].includes(relative);
  }
  if (specifier.startsWith('node:')) return true;
  if (builtinModules.includes(specifier)) return false;
  return Object.hasOwn(dependencies, packageName);
}

function uiImportAllowed(relative, target) {
  if (!relative.startsWith('app/ui/')) return true;
  if (target?.startsWith('app/ui/')) return true;
  return relative === 'app/ui/browser-capture.mjs' && target === 'app/recording.js';
}

test('layer dependency table permits only declared zones', t => {
  const { dependencies = {} } = JSON.parse(fs.readFileSync(path.join(REPOSITORY, 'package.json'), 'utf8'));
  const edges = new Map();
  for (const { relative, imports } of inventory()) {
    if (relative.startsWith('tv/app/')) continue;
    const origin = zoneFor(relative);
    for (const { specifier, target } of imports) {
      if (specifier === null) continue;
      assert.ok(uiImportAllowed(relative, target), `${relative} depends on ${specifier} -> ${target}`);
      if (target === null) {
        assert.ok(externalImportAllowed(relative, specifier, dependencies), `${relative} depends on ${specifier}`);
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

function closingToken(tokens, start) {
  const closing = { '(': ')', '[': ']', '{': '}' }[tokens[start]];
  let depth = 1;
  for (let index = start + 1; index < tokens.length; index++) {
    if (tokens[index] === tokens[start]) depth++;
    if (tokens[index] === closing && --depth === 0) return index;
  }
  return tokens.length;
}

function ternaryBranchEnd(tokens, start) {
  let nested = 0;
  for (let index = start; index < tokens.length; index++) {
    if (['(', '[', '{'].includes(tokens[index])) {
      index = closingToken(tokens, index);
      continue;
    }
    const ternary = tokens[index] === '?' && !['?', '.'].includes(tokens[index + 1]) && tokens[index - 1] !== '?';
    if (ternary) nested++;
    if (tokens[index] === ':') {
      if (nested === 0) return index;
      nested--;
    }
  }
  return tokens.length;
}

function nodeGuardRanges(tokens) {
  const guard = ['typeof', 'module', '=', '=', '=', '"object"', '&', '&', 'module', '&', '&', 'module', '.', 'exports'];
  const ranges = [];
  for (let index = 0; index < tokens.length; index++) {
    const candidate = tokens.slice(index, index + guard.length).map(token => token === "'object'" ? '"object"' : token);
    if (!guard.every((token, offset) => candidate[offset] === token)) continue;
    const after = index + guard.length;
    if (tokens[index - 2] === 'if' && tokens[index - 1] === '(' && tokens[after] === ')' && tokens[after + 1] === '{') {
      ranges.push([after + 2, closingToken(tokens, after + 1)]);
    }
    const expressionStart = ['=', '(', 'return', ',', ':', '?'].includes(tokens[index - 1]) && tokens[index - 2] !== '?';
    if (expressionStart && tokens[after] === '?') ranges.push([after + 1, ternaryBranchEnd(tokens, after + 1)]);
  }
  return ranges;
}

test('TV presentation uses classic scripts and guarded local CommonJS loads', () => {
  for (const { relative, source, tokens, imports, root } of inventory()) {
    if (root !== 'tv/app') continue;
    const diagnostic = `${relative}: classic script without ES import/export (${imports.map(imported => imported.specifier).join(', ')})`;
    assert.doesNotThrow(() => new vm.Script(source, { filename: relative }), diagnostic);
    const dynamicImport = tokens.some((token, index) => token === 'import' && tokens[index - 1] !== '.' && tokens[index + 1] === '(');
    assert.ok(!dynamicImport, `${relative}: ES import() syntax`);
    const ranges = nodeGuardRanges(tokens);
    for (const { specifier, target, index } of imports) {
      assert.notEqual(specifier, null, `${relative}: require must have a literal relative target`);
      assert.ok(target?.startsWith('tv/app/'), `${relative} depends on ${specifier} -> ${target}`);
      assert.ok(ranges.some(([start, end]) => index >= start && index < end), `${relative} depends on ${specifier} without a Node guard`);
    }
  }
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
  const flags = 'ending|accepting|readOnly|closed|asking';
  const member = String.raw`\bwatch\s*(?:\.\s*(?:${flags})\b|\[\s*(['"])(?:${flags})\1\s*\])`;
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
