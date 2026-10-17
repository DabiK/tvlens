const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { builtinModules } = require('node:module');
const vm = require('node:vm');
const REPOSITORY = path.join(__dirname, '..');
const LAYER_EXTENSIONS = ['.js', '.cjs', '.mjs'];
const ROOT_LAYERS = {
  core: 'domain',
  runtime: 'application',
  adapters: 'adapter',
  server: 'host',
  mcp: 'host',
  app: 'host',
};
const DEPENDENCY_ZONES = [
  { pattern: 'core/**', layer: 'domain', imports: ['core/**', 'core/shared/**', 'core/memory/**'] },
  { pattern: 'core/memory/**', layer: 'domain', context: 'memory', entryPoint: 'core/memory/index.cjs',
    imports: ['core/memory/**', 'core/shared/**'] },
  { pattern: 'core/shared/**', layer: 'domain', shared: true, imports: ['core/shared/**'] },
  { pattern: 'adapters/**', layer: 'adapter', imports: ['adapters/**', 'core/**', 'core/shared/**', 'core/memory/**'] },
  { pattern: 'runtime/**', layer: 'application', imports: ['runtime/**', 'core/**', 'core/shared/**', 'core/memory/**', 'adapters/**'] },
  { pattern: 'runtime/memory/**', layer: 'application', context: 'memory',
    imports: ['runtime/memory/**', 'core/memory/**', 'core/shared/**'] },
  { pattern: 'server/**', layer: 'host', imports: ['server/**', 'core/**', 'core/shared/**', 'adapters/**', 'runtime/**'] },
  { pattern: 'mcp/**', layer: 'host', imports: ['mcp/**', 'core/**', 'core/shared/**'] },
  { pattern: 'app/**', layer: 'host', imports: ['app/**', 'core/**', 'core/shared/**', 'adapters/**', 'runtime/**', 'runtime/memory/**'] },
];
const TEMPORARY_IMPORT_EXCEPTIONS = [];
const GLOBAL_TIME_OPERATIONS = ['Date.now', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'AbortSignal.timeout'];
// Chaque couple conserve son effectif exact : ni compensation ni exception devenue inutile.
const CORE_TIME_STOCK = {
  'core/deep-ask.cjs': { 'Date.now': 1, setTimeout: 2, clearTimeout: 2 },
  'core/living-recap.cjs': { 'Date.now': 1, setTimeout: 1, clearTimeout: 1 },
  'core/moment-index.cjs': { 'Date.now': 1, setTimeout: 1, clearTimeout: 1 },
  'core/moment-search.cjs': { setTimeout: 1, clearTimeout: 1 },
  'core/saved-moments.cjs': { 'Date.now': 1, 'AbortSignal.timeout': 1 },
  'core/surveillance.cjs': { 'Date.now': 1 },
  'core/video-tools.cjs': { 'Date.now': 1 },
  'core/verification.cjs': { 'Date.now': 1 },
};
const PURE_MODULE_POLICIES = [
  { filename: 'runtime/session-closing.cjs', allowTimers: false },
  { filename: 'runtime/question-checkpoint.cjs', allowTimers: true },
];
const NETWORK_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'];

test('topic summaries belong to memory and passage text belongs to the shared kernel without legacy modules', () => {
  const filenames = inventory().map(module => module.relative);
  for (const filename of ['core/topic-summary.cjs', 'core/passage-text.cjs']) {
    assert.equal(filenames.includes(filename), false, `${filename}: remove the legacy module`);
  }
  for (const filename of ['core/memory/topic-summary.cjs', 'core/shared/passage-text.cjs']) {
    assert.ok(filenames.includes(filename), `${filename}: missing module`);
  }
});

function literalMemberTokens(tokens) {
  const normalized = [];
  const beforeExpression = /^(?:return|throw|case|yield|await|void|typeof|delete|new|in|of|instanceof|else|do)$/;
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index] === '?' && tokens[index + 1] === '.') {
      if (tokens[index + 2] !== '[') normalized.push('.');
      index++;
      continue;
    }
    const previous = normalized.at(-1) ?? '';
    const afterObject = /^[\w$]+$/.test(previous) && !beforeExpression.test(previous) || [')', ']', '}'].includes(previous);
    const name = /^(['"])([\w$]+)\1$/.exec(tokens[index + 1] ?? '')?.[2];
    if (afterObject && tokens[index] === '[' && name && tokens[index + 2] === ']') {
      normalized.push('.', name);
      index += 2;
    } else normalized.push(tokens[index]);
  }
  return normalized;
}

function globalTimeAccesses(sourceTokens) {
  const tokens = literalMemberTokens(sourceTokens);
  const counts = {};
  for (let index = 0; index < tokens.length; index++) {
    const member = tokens[index - 1] === '.';
    const globalMember = ['globalThis', 'global'].includes(tokens[index - 2]) && tokens[index - 3] !== '.';
    if (member && !globalMember) continue;
    for (const operation of GLOBAL_TIME_OPERATIONS) {
      const parts = operation.split('.').flatMap((part, offset) => offset === 0 ? [part] : ['.', part]);
      if (parts.every((part, offset) => tokens[index + offset] === part)) counts[operation] = (counts[operation] ?? 0) + 1;
    }
  }
  return counts;
}

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

function lexTemplate(source, filename, start) {
  const tokens = ['(', '""'];
  const parts = ['`'];
  let segmentStart = start + 1;
  let index = segmentStart;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === '`') {
      parts.push(source.slice(segmentStart, index + 1));
      return { tokens: [...tokens, ')'], source: parts.join(''), end: index + 1 };
    }
    if (source.startsWith('${', index)) {
      parts.push(source.slice(segmentStart, index + 2));
      const expression = lexSource(source, filename, index + 2, true);
      parts.push(expression.source, '}');
      // Les bornes évitent de joindre des membres ou des conditions de deux interpolations.
      tokens.push(',', '(', ...expression.tokens, ')');
      index = expression.end + 1;
      segmentStart = index;
    } else index++;
  }
  assert.fail(`${filename}: unterminated template literal`);
}

function nextLexeme(source, token, regexp, regexAllowed) {
  const index = token.lastIndex;
  regexp.lastIndex = index;
  // Le contexte distingue une regex d'une division, sans ouvrir de chaîne dans son corps.
  const startsComment = source.startsWith('//', index) || source.startsWith('/*', index);
  const literal = !startsComment && regexAllowed ? regexp.exec(source) : null;
  if (!literal) return token.exec(source)[0];
  token.lastIndex = regexp.lastIndex;
  return literal[0];
}

function lexSource(source, filename, start = 0, interpolation = false) {
  const token = /\s+|"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*'|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|[\w$]+|\+\+|--|=>|[^\s]/gy;
  const regexp = /\/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\[\r\n])+\/[a-z]*/y;
  const tokens = [];
  const parts = [];
  const context = { stack: [], closed: null };
  let regexAllowed = true;
  token.lastIndex = start;
  while (token.lastIndex < source.length) {
    const index = token.lastIndex;
    if (interpolation && source[index] === '}' && context.stack.length === 0) return { tokens, source: parts.join(''), end: index };
    const value = nextLexeme(source, token, regexp, regexAllowed);
    assert.ok(value !== "'" && value !== '"', `${filename}: unterminated string literal`);
    if (value === '`') {
      const template = lexTemplate(source, filename, index);
      parts.push(template.source);
      tokens.push(...template.tokens);
      token.lastIndex = template.end;
      regexAllowed = false;
      context.closed = null;
      continue;
    }
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
  assert.ok(!interpolation, `${filename}: unterminated template interpolation`);
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

function validateContextZone(zone, root, diagnostic) {
  assert.ok(typeof zone.context === 'string' && /^[a-z][a-z0-9-]*$/.test(zone.context), diagnostic);
  assert.equal(zone.pattern, `${root}/${zone.context}/**`, diagnostic);
}

function validateDomainZone(zone, diagnostic) {
  if (zone.pattern === 'core/**') {
    assert.ok(!Object.hasOwn(zone, 'context') && !Object.hasOwn(zone, 'entryPoint'), diagnostic);
    return;
  }
  validateContextZone(zone, 'core', diagnostic);
  assert.equal(zone.entryPoint, `core/${zone.context}/index.cjs`, diagnostic);
}

function validateDependencyZones() {
  for (const zone of DEPENDENCY_ZONES) {
    const diagnostic = `zone-metadata-invalid: ${zone.pattern}`;
    const root = zone.pattern.split('/')[0];
    assert.ok(Object.hasOwn(ROOT_LAYERS, root), diagnostic);
    assert.equal(zone.layer, ROOT_LAYERS[root], diagnostic);
    assert.ok(zone.shared === undefined || zone.shared === true, diagnostic);
    if (zone.pattern === 'core/shared/**') assert.equal(zone.shared, true, diagnostic);
    if (zone.shared) {
      assert.equal(zone.pattern, 'core/shared/**', diagnostic);
      assert.equal(zone.layer, 'domain', diagnostic);
      assert.ok(!Object.hasOwn(zone, 'context') && !Object.hasOwn(zone, 'entryPoint'), diagnostic);
    } else if (zone.layer === 'domain') validateDomainZone(zone, diagnostic);
    else {
      assert.ok(!Object.hasOwn(zone, 'entryPoint'), diagnostic);
      if (Object.hasOwn(zone, 'context')) {
        assert.equal(zone.layer, 'application', diagnostic);
        validateContextZone(zone, 'runtime', diagnostic);
      }
    }
  }
}

function foreignDomainImport(origin, destination) {
  return origin.layer === 'domain' && origin.context && destination?.layer === 'domain' &&
    destination.context && origin.context !== destination.context;
}

function importPolicyViolation(origin, destination, target) {
  if (foreignDomainImport(origin, destination)) return 'context-domain-import-forbidden: domains cannot import another context';
  if (origin.context && /^(?:core|runtime)\/[^/]+$/.test(target)) {
    return 'context-flat-import-requires-exception: declare the exact migration edge';
  }
  if (!destination || !origin.imports.includes(destination.pattern)) {
    return `zone-permission-missing: ${origin.pattern} does not list ${destination?.pattern ?? target}`;
  }
  if (destination.shared) return null;
  if (destination.layer === 'domain' && destination.context && origin.context !== destination.context && target !== destination.entryPoint) {
    return `context-private-import: use ${destination.entryPoint}`;
  }
  return null;
}

function exactModulePath(filename) {
  return typeof filename === 'string' && !/[?*[\]{}\\]/.test(filename) &&
    !path.posix.isAbsolute(filename) && !filename.startsWith('../') &&
    path.posix.normalize(filename) === filename && LAYER_EXTENSIONS.includes(path.posix.extname(filename));
}

function validateMigrationExceptions() {
  const names = new Set();
  const edges = new Set();
  const filenames = new Set(inventory().map(module => module.relative));
  for (const exception of TEMPORARY_IMPORT_EXCEPTIONS) {
    const { name, source, target, reason } = exception;
    const diagnostic = `migration-exception-invalid: ${JSON.stringify(exception)}`;
    assert.ok(typeof name === 'string' && /^[a-z][a-z0-9-]*$/.test(name), diagnostic);
    assert.ok(typeof reason === 'string' && reason.trim().length > 0, diagnostic);
    assert.ok(exactModulePath(source) && exactModulePath(target), diagnostic);
    const edge = `${source} -> ${target}`;
    assert.ok(!names.has(name) && !edges.has(edge), diagnostic);
    names.add(name);
    edges.add(edge);
    assert.ok(filenames.has(source) && filenames.has(target), `${name}: ${edge}: migration-exception-unused: a module disappeared`);
  }
}

function assertRelativeImport(relative, specifier, target, origin, usedExceptions) {
  const destination = zoneFor(target);
  const violation = importPolicyViolation(origin, destination, target);
  const zones = `zones ${origin.pattern} -> ${destination?.pattern ?? 'undeclared'}`;
  const exception = TEMPORARY_IMPORT_EXCEPTIONS.find(item => item.source === relative && item.target === target);
  const migrationAllowed = violation && exception && !foreignDomainImport(origin, destination);
  if (migrationAllowed) usedExceptions.add(exception.name);
  assert.ok(violation === null || migrationAllowed, `${relative} depends on ${specifier} -> ${target}; ${zones}; ${violation}`);
  return `${origin.pattern} -> ${destination?.pattern ?? 'undeclared'}`;
}

test('layer dependency table permits only declared zones', t => {
  validateDependencyZones();
  const { dependencies = {} } = JSON.parse(fs.readFileSync(path.join(REPOSITORY, 'package.json'), 'utf8'));
  const edges = new Map();
  validateMigrationExceptions();
  const usedExceptions = new Set();
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
      const edge = assertRelativeImport(relative, specifier, target, origin, usedExceptions);
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  for (const { name, source, target } of TEMPORARY_IMPORT_EXCEPTIONS) {
    assert.ok(usedExceptions.has(name), `${name}: ${source} -> ${target}: migration-exception-unused: remove the obsolete declaration`);
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
test('core global time access stock cannot grow or retain unused exceptions', () => {
  for (const [filename, operations] of Object.entries(CORE_TIME_STOCK)) {
    assert.ok(Object.keys(operations).length > 0, `${filename}: global-time-invalid-exception: remove the empty file exception`);
    for (const [operation, count] of Object.entries(operations)) {
      assert.ok(Number.isInteger(count) && count > 0,
        `${filename}: ${operation}: global-time-invalid-exception: frozen counts must be positive integers; remove unused exceptions`);
    }
  }
  const actual = new Map(inventory().filter(module => module.root === 'core')
    .map(({ relative, tokens }) => [relative, globalTimeAccesses(tokens)]));
  const filenames = new Set([...actual.keys(), ...Object.keys(CORE_TIME_STOCK)]);
  for (const filename of filenames) {
    const observed = actual.get(filename) ?? {};
    const expected = CORE_TIME_STOCK[filename] ?? {};
    for (const operation of new Set([...Object.keys(observed), ...Object.keys(expected)])) {
      const count = observed[operation] ?? 0;
      const allowed = expected[operation] ?? 0;
      const reason = count > allowed
        ? 'global-time-increase: inject the time dependency; no new global access is allowed'
        : 'global-time-unused-exception: lower or remove the frozen exception';
      assert.equal(count, allowed, `${filename}: ${operation}: ${count} observed, ${allowed} frozen; ${reason}`);
    }
  }
});
test('pure module table enforces each module dependency and timer policy', () => {
  for (const { filename, allowTimers } of PURE_MODULE_POLICIES) {
    const module = inventory().find(module => module.relative === filename);
    assert.ok(module, `${filename} must exist`);
    const { imports, tokens } = module;
    const members = literalMemberTokens(tokens);
    const importAccess = members.find(token => token === 'require' || token === 'import');
    assert.ok(imports.length === 0 && importAccess === undefined, `${filename}: forbidden import ${imports[0]?.specifier ?? importAccess}`);
    const forbidden = members.find(token => token === 'process' || NETWORK_GLOBALS.includes(token));
    assert.equal(forbidden, undefined, `${filename}: forbidden ${forbidden}`);
    if (!allowTimers) {
      const operations = Object.keys(globalTimeAccesses(tokens));
      assert.equal(operations.length, 0, `${filename}: forbidden global time ${operations.join(', ')}`);
    }
  }
});
test('shared runtime and headless transport do not import Electron', () => {
  for (const { relative, imports, root } of inventory()) {
    if (!['runtime', 'server'].includes(root)) continue;
    assert.ok(!imports.some(({ specifier }) => specifier === 'electron'), `${relative} depends on electron`);
  }
});
test('compositions leave watch session lifecycle flags to the domain', () => {
  const flags = 'ending|accepting|readOnly|closed|asking|queue|visionQueue|audioRunning|visionRunning|visionHeldSince|visionBlockedMs';
  const member = String.raw`\bwatch\s*(?:\.\s*(?:${flags})\b|\[\s*(['"])(?:${flags})\1\s*\])`;
  const assignment = String.raw`\s*(?:=(?!=|>)|(?:\*\*|<<|>>>?|&&|\|\||\?\?|[-+*/%&|^])=|\+\+|--)`;
  const write = new RegExp(member + assignment);
  for (const { relative, source, root } of inventory()) {
    if (!['app', 'runtime', 'server', 'mcp'].includes(root) || !relative.endsWith('.cjs')) continue;
    const match = write.exec(source);
    assert.equal(match?.[0] ?? null, null, `${relative} writes ${match?.[0]}`);
  }
});
test('memory perception lanes own their queues and use a generic hold policy', () => {
  const lanes = inventory().find(module => module.relative === 'core/memory/lanes.cjs');
  assert.ok(lanes, 'the memory context must own perception lanes');
  assert.doesNotMatch(lanes.source, /asking|question|deep-?ask|surveillance|duringask/i, lanes.relative);
  const session = inventory().find(module => module.relative === 'core/session.cjs');
  assert.doesNotMatch(session.source, /this\.(?:queue|visionQueue|audioRunning|visionRunning|visionHeldSince|controller)\b/);
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
