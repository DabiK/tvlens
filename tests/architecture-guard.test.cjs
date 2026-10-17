const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');

const EXTENSIONS = ['.js', '.cjs', '.mjs'];
const LEVELS = ['', 'nested', 'nested/deeper'];
const LAYERS = ['core', 'adapters', 'runtime', 'server', 'app', 'mcp'];
const GUARD_NAMES = [
  'layer dependency table permits only declared zones',
  'portable core does not access host globals',
  'shared runtime and headless transport do not import Electron',
  'compositions leave watch session lifecycle flags to the domain',
  'core services do not import the session use case',
  'surveillance does not depend on DeepAsk or chat scheduling flags',
  'TV presentation uses classic scripts and guarded local CommonJS loads',
];
const TIME_GUARD = 'core global time access stock cannot grow or retain unused exceptions';
const PURE_GUARD = 'pure module table enforces each module dependency and timer policy';

function write(root, filename, source) {
  const target = path.join(root, filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-guard-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'tests/architecture.test.cjs', fs.readFileSync(path.join(__dirname, 'architecture.test.cjs')));
  for (const directory of LAYERS) {
    write(root, `${directory}/module.cjs`, 'module.exports = {};');
  }
  write(root, 'core/surveillance.cjs', 'module.exports = {};');
  write(root, 'tv/app/module.js', 'var value = 1;');
  write(root, 'package.json', JSON.stringify({
    dependencies: { sharp: '*', '@modelcontextprotocol/sdk': '*' },
    devDependencies: { electron: '*', eslint: '*', '@eslint/js': '*' },
  }));
  return root;
}

function runGuard(root, names = GUARD_NAMES) {
  const result = spawnSync(process.execPath, [
    '--test', '--test-concurrency=1', '--test-reporter=tap',
    `--test-name-pattern=^(${names.join('|')})$`, 'tests/architecture.test.cjs',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });
  assert.ifError(result.error);
  const output = result.stdout + result.stderr;
  // Un filtre périmé ne doit jamais transformer une garde absente en succès.
  for (const name of names) {
    assert.ok(output.split('\n').some(line => /^(?:not )?ok \d+ - /.test(line) && line.endsWith(`- ${name}`)), output);
  }
  return { status: result.status, output };
}

function assertRejected(root, filename, diagnostic, ruleName, names = GUARD_NAMES) {
  const result = runGuard(root, names);
  assert.equal(result.status, 1, result.output);
  assert.ok(result.output.includes(filename), result.output);
  assert.match(result.output, /ERR_ASSERTION/);
  assert.match(result.output, diagnostic);
  assert.doesNotMatch(result.output, /EISDIR/);
  if (ruleName) {
    assert.ok(result.output.split('\n').some(line => /^not ok \d+ - /.test(line) && line.endsWith(`- ${ruleName}`)), result.output);
  }
  return result;
}

function timeFixture(t) {
  const root = fixture(t);
  fs.cpSync(path.join(__dirname, '..', 'core'), path.join(root, 'core'), { recursive: true });
  return root;
}

function assertAccepted(root, names, t) {
  const result = runGuard(root, names);
  assert.equal(result.status, 0, result.output);
  t.diagnostic(result.output);
}

for (const direction of ['increase', 'decrease']) {
  test(`core time stock gives an actionable ${direction} diagnostic`, t => {
    const root = timeFixture(t);
    const filename = 'core/video-tools.cjs';
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    const changed = direction === 'increase' ? source + '\nDate.now();' : source.replace('Date.now', 'injectedNow');
    write(root, filename, changed);
    const code = direction === 'increase' ? /global-time-increase/ : /global-time-unused-exception/;
    const result = assertRejected(root, filename, code, TIME_GUARD, [TIME_GUARD]);
    assert.match(result.output, /Date\.now/);
    t.diagnostic(result.output);
    write(root, filename, source);
    assertAccepted(root, [TIME_GUARD], t);
  });
}

for (const count of ['0', '-1', '0.5', 'NaN', 'Infinity', '"1"', 'true']) {
  test(`core time stock rejects the invalid frozen count ${count}`, t => {
    const root = timeFixture(t);
    const filename = 'core/video-tools.cjs';
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    write(root, filename, source.replace('Date.now', 'injectedNow'));
    const guard = path.join(root, 'tests/architecture.test.cjs');
    const original = fs.readFileSync(guard, 'utf8');
    const row = "  'core/video-tools.cjs': { 'Date.now': 1 },\n";
    fs.writeFileSync(guard, original.replace(row, `  'core/video-tools.cjs': { 'Date.now': ${count} },\n`));
    t.diagnostic(assertRejected(root, filename, /Date\.now.*global-time-invalid-exception/, TIME_GUARD, [TIME_GUARD]).output);
    fs.writeFileSync(guard, original.replace(row, ''));
    assertAccepted(root, [TIME_GUARD], t);
  });
}

for (const presence of ['present', 'absent']) {
  test(`core time stock rejects an empty exception when its file is ${presence}`, t => {
    const root = timeFixture(t);
    const filename = 'core/nested/stale.cjs';
    if (presence === 'present') write(root, filename, 'module.exports = {};');
    const guard = path.join(root, 'tests/architecture.test.cjs');
    const original = fs.readFileSync(guard, 'utf8');
    const marker = 'const CORE_TIME_STOCK = {';
    fs.writeFileSync(guard, original.replace(marker, marker + `\n  '${filename}': {},`));
    t.diagnostic(assertRejected(root, filename, /global-time-invalid-exception/, TIME_GUARD, [TIME_GUARD]).output);
    fs.writeFileSync(guard, original);
    assertAccepted(root, [TIME_GUARD], t);
  });
}

const TIME_OPERATIONS = ['Date.now', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'AbortSignal.timeout'];
const COMPUTED_TIME_FORMS = [
  ['member', operation => {
    const [base, member] = operation.split('.');
    return member ? `${base}['${member}']` : `globalThis['${base}']`;
  }],
  ['host', operation => {
    const [base, member] = operation.split('.');
    return `globalThis['${base}']` + (member ? `.${member}` : '');
  }],
  ['chain', operation => 'global' + operation.split('.').map(part => `["${part}"]`).join('')],
];

for (const [form, access] of COMPUTED_TIME_FORMS) {
  for (const operation of TIME_OPERATIONS) {
    test(`core time stock rejects literal computed ${form} ${operation} and accepts its removal`, t => {
      const root = timeFixture(t);
      const filename = 'core/nested/time.cjs';
      write(root, filename, access(operation) + '();');
      const diagnostic = new RegExp(operation.replaceAll('.', '\\.'));
      t.diagnostic(assertRejected(root, filename, diagnostic, TIME_GUARD, [TIME_GUARD]).output);
      write(root, filename, 'const names = ["Date", "now", "setTimeout"]; clock["setTimeout"]();');
      assertAccepted(root, [TIME_GUARD], t);
    });
  }
}

for (const operation of TIME_OPERATIONS) {
  test(`core time stock rejects interpolated ${operation} and accepts its removal`, t => {
    const root = timeFixture(t);
    const filename = 'core/nested/time.cjs';
    write(root, filename, 'module.exports = () => `moment-${' + operation + '()}`;');
    const diagnostic = new RegExp(operation.replaceAll('.', '\\.'));
    t.diagnostic(assertRejected(root, filename, diagnostic, TIME_GUARD, [TIME_GUARD]).output);
    write(root, filename, 'module.exports = () => `moment-${clock()}`;');
    assertAccepted(root, [TIME_GUARD], t);
  });
}

for (const expression of [
  '`nested-${`inner-${Date.now()}`}`',
  '`object-${({ outer: { time: Date.now() } }).outer.time}`',
  '`regex-${/[}\\`]/.test(text) ? Date.now() : 0}`',
  '`comments-${/* } ` */ Date.now() // } `\n}`',
  '`twice-${Date.now()}-${Date.now()}`',
]) {
  test(`core time stock rejects interpolated expressions with nested syntax: ${expression}`, t => {
    const root = timeFixture(t);
    const filename = 'core/nested/time.cjs';
    write(root, filename, 'module.exports = () => ' + expression + ';');
    const count = expression.startsWith('`twice') ? 2 : 1;
    t.diagnostic(assertRejected(root, filename, new RegExp(`Date\\.now.*${count}.*0`), TIME_GUARD, [TIME_GUARD]).output);
    write(root, filename, 'module.exports = () => `literal-\\${Date.now()}`;');
    assertAccepted(root, [TIME_GUARD], t);
  });
}

for (const [index, operation] of TIME_OPERATIONS.entries()) {
  test(`core time stock rejects a new ${operation} access and accepts its removal`, t => {
    const root = timeFixture(t);
    const filename = `core/nested/deeper/time${EXTENSIONS[index % EXTENSIONS.length]}`;
    write(root, filename, `${operation};`);
    const diagnostic = new RegExp(operation.replaceAll('.', '\\.'));
    t.diagnostic(assertRejected(root, filename, diagnostic, TIME_GUARD, [TIME_GUARD]).output);
    write(root, filename, 'module.exports = {};');
    assertAccepted(root, [TIME_GUARD], t);
  });
}

test('core time stock counts a second identical access on the same line of an excepted file', t => {
  const root = timeFixture(t);
  const filename = 'core/moment-index.cjs';
  const source = fs.readFileSync(path.join(root, filename), 'utf8');
  write(root, filename, source.replace('setTimeout(fn, ms)', 'setTimeout(fn, ms) || setTimeout(fn, ms)'));
  t.diagnostic(assertRejected(root, filename, /setTimeout.*2.*1/, TIME_GUARD, [TIME_GUARD]).output);
  write(root, filename, source);
  assertAccepted(root, [TIME_GUARD], t);
});

for (const removal of ['operation', 'file']) {
  test(`core time stock rejects an unused exception after removing its ${removal}`, t => {
    const root = timeFixture(t);
    const filename = 'core/video-tools.cjs';
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    if (removal === 'file') fs.unlinkSync(path.join(root, filename));
    else write(root, filename, source.replace('Date.now', 'injectedNow'));
    t.diagnostic(assertRejected(root, filename, /Date\.now.*0.*1/, TIME_GUARD, [TIME_GUARD]).output);
    const guard = path.join(root, 'tests/architecture.test.cjs');
    fs.writeFileSync(guard, fs.readFileSync(guard, 'utf8').replace("  'core/video-tools.cjs': { 'Date.now': 1 },\n", ''));
    assertAccepted(root, [TIME_GUARD], t);
  });
}

test('core time stock cannot compensate an operation or a file with another', t => {
  const root = timeFixture(t);
  const filename = 'core/moment-index.cjs';
  const source = fs.readFileSync(path.join(root, filename), 'utf8');
  write(root, filename, source.replace('setTimeout(fn, ms)', 'clearTimeout(fn, ms)'));
  t.diagnostic(assertRejected(root, filename, /setTimeout|clearTimeout/, TIME_GUARD, [TIME_GUARD]).output);
  write(root, filename, source);
  const other = 'core/moment-search.cjs';
  const otherSource = fs.readFileSync(path.join(root, other), 'utf8');
  write(root, filename, source.replace('setTimeout(fn, ms)', 'injectedTimer(fn, ms)'));
  write(root, other, otherSource + '\nsetTimeout;');
  t.diagnostic(assertRejected(root, filename, /setTimeout/, TIME_GUARD, [TIME_GUARD]).output);
  write(root, filename, source);
  write(root, other, otherSource);
  assertAccepted(root, [TIME_GUARD], t);
});

for (const qualifier of ['globalThis', 'global']) {
  test(`core time stock counts ${qualifier} references with comments between member tokens`, t => {
    const root = timeFixture(t);
    const filename = 'core/nested/time.cjs';
    for (const operation of TIME_OPERATIONS) {
      write(root, filename, `${qualifier} /* host */ . ${operation.replace('.', ' /* member */ . ')};`);
      const diagnostic = new RegExp(operation.replaceAll('.', '\\.'));
      t.diagnostic(assertRejected(root, filename, diagnostic, TIME_GUARD, [TIME_GUARD]).output);
    }
    write(root, filename, 'module.exports = {};');
    assertAccepted(root, [TIME_GUARD], t);
  });
}

test('core time stock ignores comments literals and injected timer members', t => {
  const root = timeFixture(t);
  const examples = TIME_OPERATIONS.join('; ');
  write(root, 'core/nested/time.cjs', [
    `// ${examples}`,
    `/* ${examples} */`,
    `const documentation = '${examples}';`,
    `const template = \`${examples}\`;`,
    'const pattern = /Date.now|setTimeout|clearTimeout|setInterval|clearInterval|AbortSignal.timeout/;',
    'clock.setTimeout(); clock.clearTimeout(); clock.setInterval(); clock.clearInterval();',
    'clock?.setTimeout(); clock?.["clearTimeout"]();',
  ].join('\n'));
  assertAccepted(root, [TIME_GUARD], t);
});

test('layer table rejects an adapter importing the runtime and accepts its removal', t => {
  const root = fixture(t);
  const filename = 'adapters/nested/client.cjs';
  write(root, filename, "require('../../runtime/module.cjs');");
  t.diagnostic(assertRejected(root, filename, /runtime\/module\.cjs/).output);
  write(root, filename, "require('../../core/module.cjs');");
  const result = runGuard(root);
  assert.equal(result.status, 0, result.output);
  t.diagnostic(result.output);
});

test('layer table accepts parent imports within the core', t => {
  const root = fixture(t);
  write(root, 'core/nested/service.cjs', "require('../ports.cjs');");
  const result = runGuard(root);
  assert.equal(result.status, 0, result.output);
});

test('layer table ignores commented imports and import-shaped strings', t => {
  const root = fixture(t);
  write(root, 'core/nested/comments.mjs', [
    '// import "../../runtime/module.cjs";',
    '/* require("node:fs");',
    'import("../../app/module.cjs"); */',
    'const value = 1; // require("../../runtime/module.cjs");',
    'const documentation = "require(\'../../runtime/module.cjs\')";',
    'const address = "https://example.test/a/*text*/";',
  ].join('\n'));
  const result = runGuard(root);
  assert.equal(result.status, 0, result.output);
});

for (const directory of LAYERS) {
  for (const mode of ['absent', 'empty']) {
    test(`layer table rejects an ${mode} ${directory} root`, t => {
      const root = fixture(t);
      fs.rmSync(path.join(root, directory), { recursive: true });
      if (mode === 'empty') fs.mkdirSync(path.join(root, directory));
      assertRejected(root, directory, /no JavaScript sources|missing layer root/);
    });
  }
}

test('architecture guard cases run without product adapters', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-isolation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const filename of ['architecture.test.cjs', 'architecture-guard.test.cjs']) {
    write(root, `tests/${filename}`, fs.readFileSync(path.join(__dirname, filename)));
  }
  const result = spawnSync(process.execPath, [
    '--test', '--test-concurrency=1', '--test-reporter=tap',
    '--test-name-pattern=^architecture guard (accepts conforming modules|catches )',
    'tests/architecture-guard.test.cjs',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^# pass 4$/m);
  assert.match(result.stdout, /^ok 1 - architecture guard accepts conforming modules /m);
  assert.equal(result.stdout.match(/^ok \d+ - architecture guard catches /gm)?.length, 3, result.stdout);
});

test('architecture guard accepts conforming modules at every depth beside non-JavaScript entries', t => {
  const root = fixture(t);
  for (const directory of LAYERS) {
    for (const level of LEVELS) {
      for (const extension of EXTENSIONS) {
        write(root, `${directory}/${level}/module${extension}`, "const value = require('./local.cjs');\n");
      }
      write(root, `${directory}/${level}/notes.txt`, "require('electron'); require('node:fs'); process.cwd();\n");
    }
  }
  const result = runGuard(root);
  assert.equal(result.status, 0, result.output);
  for (const directory of LAYERS) {
    const count = directory === 'core' ? 10 : 9;
    assert.ok(result.output.includes(`# ${directory}: ${count} fichiers JavaScript`), result.output);
  }
});

const FORBIDDEN_SOURCES = [
  { directory: 'core', source: "require('node:fs');", diagnostic: /depends on node:fs/ },
  { directory: 'core', source: 'process.cwd();', diagnostic: /host globals[\s\S]*process/ },
  { directory: 'runtime', source: "require('electron');", diagnostic: /headless transport[\s\S]*electron/ },
  { directory: 'server', source: "require('electron');", diagnostic: /headless transport[\s\S]*electron/ },
];

for (const { directory, source, diagnostic } of FORBIDDEN_SOURCES) {
  for (const level of LEVELS) {
    for (const extension of EXTENSIONS) {
      const filename = path.posix.join(directory, level, `forbidden${extension}`);
      test(`architecture guard rejects ${source} in ${filename}`, t => {
        const root = fixture(t);
        write(root, filename, source);
        write(root, path.posix.join(directory, level, 'notes.txt'), 'Not JavaScript');
        assertRejected(root, filename, diagnostic);
      });
    }
  }
}

test('lifecycle guard accepts reads and comparisons and only examines CommonJS files', t => {
  const root = fixture(t);
  for (const directory of ['app', 'runtime', 'server', 'mcp']) {
    for (const level of LEVELS) {
      for (const extension of ['.js', '.mjs', '.txt']) {
        write(root, `${directory}/${level}/ignored${extension}`, 'session.watch.ending = true;');
      }
      write(root, `${directory}/${level}/reads.cjs`, [
        'watch.setQuestionPending(true); session.watch.setQuestionPending(false);',
        'state.asking = true; view.asking = false;',
        ...['ending', 'accepting', 'readOnly', 'closed', 'asking'].map(flag =>
          `void watch.${flag}; void (session.watch.${flag} === true); void (watch.${flag} !== false);`),
      ].join('\n'));
    }
  }
  const result = runGuard(root);
  assert.equal(result.status, 0, result.output);
});

for (const directory of ['app', 'runtime', 'server', 'mcp']) {
  for (const flag of ['ending', 'accepting', 'readOnly', 'closed', 'asking']) {
    const filename = `${directory}/nested/deeper/lifecycle.cjs`;
    test(`lifecycle guard rejects writes to ${flag} in ${filename}`, t => {
      const root = fixture(t);
      write(root, filename, `session.watch.${flag} = true;`);
      assertRejected(root, filename, new RegExp(`writes watch\\.${flag} =`));
    });
  }
}

for (const source of ['session.watch["ending"] = true;', 'watch.closed ||= true;', "watch['asking'] = true;", 'watch.asking ||= true;']) {
  test(`lifecycle guard rejects ${source} in a nested composition`, t => {
    const root = fixture(t);
    const filename = 'runtime/nested/lifecycle.cjs';
    write(root, filename, source);
    assertRejected(root, filename, /writes watch/);
  });
}

test('core service guard preserves its session exception and rejects nested service imports', t => {
  const root = fixture(t);
  write(root, 'core/session.cjs', "require('./session.cjs');");
  assert.equal(runGuard(root).status, 0);
  const filename = 'core/nested/service.cjs';
  write(root, filename, "require('../session.cjs');");
  t.diagnostic(assertRejected(root, filename, /core services[\s\S]*depends on the session use case/).output);
  write(root, filename, "require('../module.cjs');");
  const result = runGuard(root);
  assert.equal(result.status, 0, result.output);
  t.diagnostic(result.output);
});

test('surveillance dependency guard rejects DeepAsk and accepts its removal', t => {
  const root = fixture(t);
  const filename = 'core/surveillance.cjs';
  write(root, filename, "require('./deep-ask.cjs');");
  t.diagnostic(assertRejected(root, filename, /surveillance does not depend[\s\S]*deep-ask\.cjs/).output);
  write(root, filename, "require('./module.cjs');");
  const result = runGuard(root);
  assert.equal(result.status, 0, result.output);
  t.diagnostic(result.output);
});

const IMPORT_FORMS = [
  ['single-quoted require', specifier => `require('${specifier}');`],
  ['double-quoted require', specifier => `require("${specifier}");`],
  ['module.require', specifier => `module.require('${specifier}');`],
  ['multiline from', specifier => `import { value }\n from /* note */\n '${specifier}';`],
  ['multiline re-export', specifier => `export { value }\n from\n "${specifier}";`],
  ['dynamic import', specifier => `import(\n '${specifier}'\n);`],
  ['side-effect import', specifier => `import "${specifier}";`],
];

const PURE_MODULES = ['runtime/session-closing.cjs', 'runtime/question-checkpoint.cjs'];
function pureFixture(t) {
  const root = fixture(t);
  for (const filename of PURE_MODULES) write(root, filename, fs.readFileSync(path.join(__dirname, '..', filename), 'utf8'));
  return root;
}

for (const operation of TIME_OPERATIONS) {
  for (const filename of ['core/nested/time.cjs', 'runtime/session-closing.cjs']) {
    const inCore = filename.startsWith('core/');
    const rule = inCore ? TIME_GUARD : PURE_GUARD;
    const description = inCore ? 'core time stock' : 'pure module table';
    test(`${description} rejects optional ${operation} accesses in ${filename}`, t => {
      const root = inCore ? timeFixture(t) : pureFixture(t);
      const source = inCore ? 'module.exports = {};' : fs.readFileSync(path.join(root, filename), 'utf8');
      const expressions = [
        `globalThis?.${operation}`,
        'global?.' + operation.split('.').map(part => `['${part}']`).join('?.'),
      ];
      if (operation.includes('.')) expressions.push(operation.replace('.', '?.'));
      for (const expression of expressions) {
        write(root, filename, source + '\n' + expression + ';');
        const diagnostic = new RegExp(operation.replaceAll('.', '\\.'));
        t.diagnostic(assertRejected(root, filename, diagnostic, rule, [rule]).output);
        write(root, filename, source);
        assertAccepted(root, [rule], t);
      }
    });
  }
}

for (const filename of PURE_MODULES) {
  test(`pure module table rejects optional dependency and host accesses in ${filename}`, t => {
    const root = pureFixture(t);
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    for (const expression of ['module?.["require"]("node:fs")', 'globalThis?.["process"].cwd()', 'global?.["fetch"](url)']) {
      write(root, filename, source + '\n' + expression + ';');
      t.diagnostic(assertRejected(root, filename, /forbidden (import|process|fetch)/, PURE_GUARD, [PURE_GUARD]).output);
      write(root, filename, source);
      assertAccepted(root, [PURE_GUARD], t);
    }
  });
}

for (const filename of PURE_MODULES) {
  for (const expression of [
    'globalThis["require"]("node:fs")',
    'module["require"]("node:fs")',
    'globalThis["import"]("node:fs")',
    'globalThis["process"].cwd()',
    'globalThis["fetch"](url)',
    'global["process"].cwd()',
    'global["fetch"](url)',
  ]) {
    test(`pure module table rejects literal computed ${expression} in ${filename}`, t => {
      const root = pureFixture(t);
      const source = fs.readFileSync(path.join(root, filename), 'utf8');
      write(root, filename, source + '\n' + expression + ';');
      const diagnostic = /require|import/.test(expression) ? /forbidden import/ : /forbidden (process|fetch)/;
      t.diagnostic(assertRejected(root, filename, diagnostic, PURE_GUARD, [PURE_GUARD]).output);
      write(root, filename, source + '\nconst names = ["require", "import", "process", "fetch"];');
      assertAccepted(root, [PURE_GUARD], t);
    });
  }
}

for (const [form, access] of COMPUTED_TIME_FORMS) {
  for (const operation of TIME_OPERATIONS) {
    test(`pure module table rejects literal computed ${form} ${operation} in the closing protocol`, t => {
      const root = pureFixture(t);
      const filename = 'runtime/session-closing.cjs';
      const source = fs.readFileSync(path.join(root, filename), 'utf8');
      write(root, filename, source + '\n' + access(operation) + '();');
      const diagnostic = new RegExp(operation.replaceAll('.', '\\.'));
      t.diagnostic(assertRejected(root, filename, diagnostic, PURE_GUARD, [PURE_GUARD]).output);
      write(root, filename, source);
      assertAccepted(root, [PURE_GUARD], t);
    });
  }
}

for (const filename of PURE_MODULES) {
  for (const expression of ['require("node:fs")', 'import("node:fs")', 'process.pid', 'fetch(url)']) {
    test(`pure module table rejects interpolated ${expression} in ${filename} and accepts its removal`, t => {
      const root = pureFixture(t);
      const source = fs.readFileSync(path.join(root, filename), 'utf8');
      write(root, filename, source + '\nconst value = `result-${' + expression + '}`;');
      const diagnostic = /require|import/.test(expression) ? /forbidden import/ : /forbidden (process|fetch)/;
      t.diagnostic(assertRejected(root, filename, diagnostic, PURE_GUARD, [PURE_GUARD]).output);
      write(root, filename, source);
      assertAccepted(root, [PURE_GUARD], t);
    });
  }
}

for (const operation of TIME_OPERATIONS) {
  test(`pure module table rejects interpolated ${operation} in the closing protocol`, t => {
    const root = pureFixture(t);
    const filename = 'runtime/session-closing.cjs';
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    write(root, filename, source + '\nconst value = `result-${' + operation + '()}`;');
    const diagnostic = new RegExp(operation.replaceAll('.', '\\.'));
    t.diagnostic(assertRejected(root, filename, diagnostic, PURE_GUARD, [PURE_GUARD]).output);
    write(root, filename, source);
    assertAccepted(root, [PURE_GUARD], t);
  });
}

for (const filename of PURE_MODULES) {
  for (const [form, statement] of IMPORT_FORMS) {
    test(`pure module table rejects ${form} in ${filename} and accepts its removal`, t => {
      const root = pureFixture(t);
      const source = fs.readFileSync(path.join(root, filename), 'utf8');
      write(root, filename, source + '\n' + statement('./module.cjs'));
      t.diagnostic(assertRejected(root, filename, /import/, PURE_GUARD, [PURE_GUARD]).output);
      write(root, filename, source);
      assertAccepted(root, [PURE_GUARD], t);
    });
  }
  for (const source of ['process.cwd();', 'fetch("https://example.test");', 'require(name);']) {
    test(`pure module table rejects ${source} in ${filename} and accepts its removal`, t => {
      const root = pureFixture(t);
      const original = fs.readFileSync(path.join(root, filename), 'utf8');
      write(root, filename, original + '\n' + source);
      const diagnostic = source.startsWith('require') ? /import/ : /process|fetch/;
      t.diagnostic(assertRejected(root, filename, diagnostic, PURE_GUARD, [PURE_GUARD]).output);
      write(root, filename, original);
      assertAccepted(root, [PURE_GUARD], t);
    });
  }
}

for (const operation of TIME_OPERATIONS) {
  test(`pure module table rejects ${operation} in the closing protocol and permits checkpoint timer defaults`, t => {
    const root = pureFixture(t);
    const filename = 'runtime/session-closing.cjs';
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    write(root, filename, source + `\n${operation};`);
    const diagnostic = new RegExp(operation.replaceAll('.', '\\.'));
    t.diagnostic(assertRejected(root, filename, diagnostic, PURE_GUARD, [PURE_GUARD]).output);
    write(root, filename, source);
    assertAccepted(root, [PURE_GUARD], t);
  });
}

test('pure module table ignores policy words in comments and literals and requires its modules to exist', t => {
  const root = pureFixture(t);
  const filename = 'runtime/session-closing.cjs';
  write(root, filename, [
    '// require("node:fs"); process.cwd(); fetch(); setTimeout();',
    '/* import "node:fs"; clearTimeout(); */',
    'const documentation = "process fetch require setTimeout";',
    'module.exports = {};',
  ].join('\n'));
  assertAccepted(root, [PURE_GUARD], t);
  fs.unlinkSync(path.join(root, filename));
  t.diagnostic(assertRejected(root, filename, /must exist/, PURE_GUARD, [PURE_GUARD]).output);
  write(root, filename, 'module.exports = {};');
  assertAccepted(root, [PURE_GUARD], t);
});

for (const [form, statement] of IMPORT_FORMS) {
  test(`layer table checks ${form} and resolves parent imports across layers`, t => {
    const root = fixture(t);
    const filename = 'adapters/nested/client.mjs';
    write(root, filename, statement('../../runtime/module.cjs'));
    assertRejected(root, filename, /runtime\/module\.cjs/, GUARD_NAMES[0]);
    write(root, filename, statement('../../core/module.cjs'));
    const result = runGuard(root);
    assert.equal(result.status, 0, result.output);
  });

  test(`portable core rejects external ${form}`, t => {
    const root = fixture(t);
    const filename = 'core/nested/service.mjs';
    write(root, filename, statement('node:fs'));
    assertRejected(root, filename, /depends on node:fs/, GUARD_NAMES[0]);
  });
}

for (const [directory, specifier] of [
  ['runtime', '../../app/module.cjs'],
  ['mcp', '../../adapters/module.cjs'],
  ['app', '../../server/module.cjs'],
  ['server', '../../mcp/module.cjs'],
  ['adapters', '../../scripts/tool.cjs'],
  ['adapters', '../../../outside.cjs'],
]) {
  test(`layer table rejects ${directory} importing ${specifier}`, t => {
    const root = fixture(t);
    const filename = `${directory}/nested/module.cjs`;
    write(root, filename, `require('${specifier}');`);
    const target = path.posix.normalize(path.posix.join(directory, 'nested', specifier));
    assertRejected(root, filename, new RegExp(`-> ${target.replaceAll('.', '\\.')}\\b`), GUARD_NAMES[0]);
  });
}

test('portable core rejects an adapter imported by DeepAsk and accepts its removal', t => {
  const root = fixture(t);
  const filename = 'core/deep-ask.cjs';
  write(root, filename, "require('../adapters/module.cjs');");
  t.diagnostic(assertRejected(root, filename, /adapters\/module\.cjs/, GUARD_NAMES[0]).output);
  write(root, filename, "require('./module.cjs');");
  const result = runGuard(root);
  assert.equal(result.status, 0, result.output);
  t.diagnostic(result.output);
});

test('layer table selects the most specific source and destination zones from an added row', t => {
  const root = fixture(t);
  const filename = 'core/memory/service.cjs';
  write(root, filename, "require('../module.cjs');");
  assert.equal(runGuard(root).status, 0);
  const guard = path.join(root, 'tests/architecture.test.cjs');
  // Seule la donnée de politique change dans la copie de la garde réelle.
  const row = { pattern: 'core/memory/**', imports: ['core/memory/**'] };
  fs.writeFileSync(guard, fs.readFileSync(guard, 'utf8').replace('\n];', `\n  ${JSON.stringify(row)},\n];`));
  t.diagnostic(assertRejected(root, filename, /core\/module\.cjs/, GUARD_NAMES[0]).output);
  write(root, filename, "require('./local.cjs');");
  const accepted = runGuard(root);
  assert.equal(accepted.status, 0, accepted.output);
  t.diagnostic(accepted.output);
  write(root, 'core/module.cjs', "require('./memory/service.cjs');");
  assertRejected(root, 'core/module.cjs', /core\/memory\/service\.cjs/, GUARD_NAMES[0]);
  write(root, 'core/module.cjs', 'module.exports = {};');
  assert.equal(runGuard(root).status, 0);
});

for (const flag of ['asking', 'manualBusy', 'prioritizeManual']) {
  test(`surveillance dependency guard preserves the ban on ${flag}`, t => {
    const root = fixture(t);
    const filename = 'core/surveillance.cjs';
    write(root, filename, `const ${flag} = true;`);
    assertRejected(root, filename, new RegExp(flag), GUARD_NAMES[5]);
    write(root, filename, 'module.exports = {};');
    const result = runGuard(root);
    assert.equal(result.status, 0, result.output);
  });
}

for (const [form, statement] of IMPORT_FORMS) {
  test(`core service guard resolves the session use case in ${form}`, t => {
    const root = fixture(t);
    const filename = 'core/nested/service.mjs';
    write(root, 'core/session.cjs', 'module.exports = {};');
    write(root, filename, statement('../nested/../session.cjs'));
    assertRejected(root, filename, /depends on the session use case/, GUARD_NAMES[4]);
    // Un homonyme local n'est pas le cas d'usage session à la racine.
    write(root, 'core/nested/session.cjs', 'module.exports = {};');
    write(root, filename, statement('./session.cjs'));
    const result = runGuard(root);
    assert.equal(result.status, 0, result.output);
  });

  test(`surveillance dependency guard resolves DeepAsk in ${form}`, t => {
    const root = fixture(t);
    const filename = 'core/surveillance.cjs';
    write(root, filename, statement('./nested/../deep-ask.cjs'));
    assertRejected(root, filename, /depends on core\/deep-ask\.cjs/, GUARD_NAMES[5]);
    write(root, filename, statement('./module.cjs'));
    const result = runGuard(root);
    assert.equal(result.status, 0, result.output);
  });
}

for (const quote of ['`', "'", '"']) {
  for (const [filename, specifier, rule] of [
    ['core/surveillance.cjs', './deep-ask.cjs', 5],
    ['core/surveillance.cjs', '../adapters/module.cjs', 0],
    ['adapters/simulated-surveillance-agent.cjs', '../runtime/module.cjs', 0],
  ]) {
    test(`architecture guard sees ${specifier} after a regex containing ${quote}`, t => {
      const root = fixture(t);
      const source = dependency => [
        `const before = /${quote}/;`,
        `function load() { return require('${dependency}'); }`,
        `const after = /[${quote}]/g;`,
      ].join('\n');
      write(root, filename, source(specifier));
      t.diagnostic(assertRejected(root, filename, /depends on/, GUARD_NAMES[rule]).output);
      write(root, filename, source('./module.cjs'));
      const result = runGuard(root);
      assert.equal(result.status, 0, result.output);
      t.diagnostic(result.output);
    });
  }
}

for (const quote of ["'", '"']) {
  test(`architecture guard rejects a ${quote} string crossing an unescaped newline`, t => {
    const root = fixture(t);
    const filename = 'adapters/nested/source.cjs';
    write(root, filename, `const invalid = ${quote}unterminated\nrequire('../../runtime/module.cjs');\n${quote};`);
    assertRejected(root, filename, /unterminated string literal/, GUARD_NAMES[0]);
    write(root, filename, `const valid = ${quote}one\\\ntwo${quote};`);
    const result = runGuard(root);
    assert.equal(result.status, 0, result.output);
  });
}

test('surveillance dependency guard rejects a missing surveillance module', t => {
  const root = fixture(t);
  const filename = 'core/surveillance.cjs';
  fs.unlinkSync(path.join(root, filename));
  assertRejected(root, filename, /must exist/, GUARD_NAMES[5]);
  write(root, filename, 'module.exports = {};');
  const result = runGuard(root);
  assert.equal(result.status, 0, result.output);
});

for (const [filename, shape, specifier, rule] of [
  ['core/surveillance.cjs', 'function', './deep-ask.cjs', 5],
  ['core/surveillance.cjs', 'function', '../adapters/module.cjs', 0],
  ['adapters/simulated-agent.cjs', 'method', '../runtime/module.cjs', 0],
]) {
  const description = shape === 'function'
    ? 'between a backtick regex and a markup replacement'
    : 'after an apostrophe regex in a class method';
  test(`architecture guard catches ${specifier} ${description} in ${filename}`, t => {
    const root = fixture(t);
    const source = dependency => {
      if (shape === 'function') return [
        'const markup = /\\*\\*|__|`/m;',
        'function normalize(text) {',
        `  require('${dependency}');`,
        '  return text.replace(/[*_`#]/g, "");',
        '}',
      ].join('\n');
      return [
        "const opinion = /je pense|j'espere/;",
        'class Agent {',
        '  async prepare() {',
        `    require('${dependency}');`,
        '    return "ready";',
        '  }',
        '}',
      ].join('\n');
    };
    write(root, filename, source(specifier));
    t.diagnostic(assertRejected(root, filename, /depends on/, GUARD_NAMES[rule]).output);
    write(root, filename, source('./module.cjs'));
    const result = runGuard(root);
    assert.equal(result.status, 0, result.output);
    t.diagnostic(result.output);
  });
}

for (const prefix of [
  'const pattern = /`/;',
  'const patterns = [/`/];',
  'const match = text.replace(/`/g, "");',
  'function pattern() { return /`/; }',
  'if (ready) /`/.test(text);',
  'if (ready) {} /`/.test(text);',
  'function ready() {} /`/.test(text);',
]) {
  test(`architecture guard keeps imports visible after ${prefix}`, t => {
    const root = fixture(t);
    const filename = 'adapters/nested/expressions.cjs';
    const source = dependency => [prefix, `function load() { require('${dependency}'); }`, 'const tail = /[`]/;'].join('\n');
    write(root, filename, source('../../runtime/module.cjs'));
    assertRejected(root, filename, /depends on/, GUARD_NAMES[0]);
    write(root, filename, source('../../core/module.cjs'));
    const result = runGuard(root);
    assert.equal(result.status, 0, result.output);
  });
}

for (const numerator of ['count', 'values[0]', 'value()', '({})', '(function () {})', 'function () {}', 'class {}']) {
  test(`architecture guard sees imports between divisions after ${numerator}`, t => {
    const root = fixture(t);
    const filename = 'adapters/nested/expressions.cjs';
    const source = dependency => `const ratio = ${numerator} / require('${dependency}').scale / unit;`;
    write(root, filename, source('../../runtime/module.cjs'));
    assertRejected(root, filename, /depends on/, GUARD_NAMES[0]);
    write(root, filename, source('../../core/module.cjs'));
    const result = runGuard(root);
    assert.equal(result.status, 0, result.output);
  });
}


for (const filename of ['app/main.cjs', 'app/preload.cjs']) {
  test(`external imports allow Electron at ${filename}`, t => {
    const root = fixture(t);
    write(root, filename, "require('electron');");
    const result = runGuard(root);
    assert.equal(result.status, 0, result.output);
  });
}

for (const directory of LAYERS) {
  const filename = `${directory}/nested/deeper/packages.mjs`;
  for (const specifier of ['electron', 'electron/main', 'eslint', '@eslint/js', '@eslint/js/configs', 'fs', 'fs/promises', 'unknown-package']) {
    test(`external imports reject ${specifier} in ${filename}`, t => {
      const root = fixture(t);
      write(root, filename, `import '${specifier}';`);
      assertRejected(root, filename, new RegExp(`depends on ${specifier}`), GUARD_NAMES[0]);
    });
  }
  for (const specifier of ['node:fs', 'node:fs/promises', 'sharp', 'sharp/lib', '@modelcontextprotocol/sdk', '@modelcontextprotocol/sdk/server/index.js']) {
    test(`external imports ${directory === 'core' ? 'reject' : 'allow'} ${specifier} in ${filename}`, t => {
      const root = fixture(t);
      write(root, filename, `import '${specifier}';`);
      if (directory === 'core') {
        assertRejected(root, filename, new RegExp(`depends on ${specifier}`), GUARD_NAMES[0]);
      } else {
        const result = runGuard(root);
        assert.equal(result.status, 0, result.output);
      }
    });
  }
}

for (const specifier of ['@modelcontextprotocol/sdk-other', '@modelcontextprotocol/other']) {
  test(`external imports reject package prefix confusion with ${specifier}`, t => {
    const root = fixture(t);
    const filename = 'adapters/packages.cjs';
    write(root, filename, `require('${specifier}');`);
    assertRejected(root, filename, new RegExp(specifier), GUARD_NAMES[0]);
  });
}


for (const [form, statement] of IMPORT_FORMS) {
  test(`Mac UI imports stay inside the presentation folder in ${form}`, t => {
    const root = fixture(t);
    const filename = 'app/ui/nested/view.mjs';
    write(root, filename, statement('../../recording.js'));
    assertRejected(root, filename, /recording.js/, GUARD_NAMES[0]);
    write(root, filename, statement('../text.mjs'));
    const result = runGuard(root);
    assert.equal(result.status, 0, result.output);
  });
}

test('Mac UI permits only the browser capture edge to the recorder', t => {
  const root = fixture(t);
  const filename = 'app/ui/browser-capture.mjs';
  write(root, 'app/recording.js', 'export class RollingRecorder {}');
  write(root, filename, "import { RollingRecorder } from '../ui/../recording.js';");
  const result = runGuard(root);
  assert.equal(result.status, 0, result.output);
  write(root, filename, "import '../renderer.js';");
  assertRejected(root, filename, /renderer.js/, GUARD_NAMES[0]);
});

for (const specifier of ['node:fs', 'sharp', '../../core/module.cjs', '../../adapters/module.cjs', '../main.cjs']) {
  test(`Mac UI rejects ${specifier} even when allowed by the application layer`, t => {
    const root = fixture(t);
    const filename = 'app/ui/view.mjs';
    write(root, filename, `import '${specifier}';`);
    assertRejected(root, filename, new RegExp(specifier), GUARD_NAMES[0]);
  });
}


const NODE_GUARD = 'typeof module === "object" && module && module.exports';
const TV_FORMS = [
  ['require', specifier => `require('${specifier}')`],
  ['module.require', specifier => `module.require('${specifier}')`],
];

for (const [form, load] of TV_FORMS) {
  for (const conditional of ['ternary', 'if']) {
    test(`TV scripts allow local ${form} under a Node ${conditional} guard`, t => {
      const root = fixture(t);
      const filename = 'tv/app/nested/view.js';
      write(root, 'tv/app/text.js', 'var text = {};');
      const call = load('../text.js');
      const source = conditional === 'ternary'
        ? `var shared = ${NODE_GUARD} ? ${call} : root.TVLensText;`
        : `var shared; if (${NODE_GUARD}) { shared = ${call}; } else { shared = root.TVLensText; }`;
      const script = source + `\nif (${NODE_GUARD}) module.exports = shared;`;
      write(root, filename, script);
      const result = runGuard(root);
      assert.equal(result.status, 0, result.output);
      const context = { root: { TVLensText: {} } };
      assert.doesNotThrow(() => vm.runInNewContext(script, context, { timeout: 1000 }));
      assert.equal(context.shared, context.root.TVLensText);
      const shared = {};
      const resolve = specifier => {
        assert.equal(specifier, '../text.js');
        return shared;
      };
      const node = { module: { exports: {}, require: resolve }, require: resolve };
      vm.runInNewContext(script, node, { timeout: 1000 });
      assert.equal(node.module.exports, shared);
    });
  }
  for (const specifier of ['../../core/module.cjs', '../outside.js', 'node:fs', 'sharp']) {
    test(`TV scripts reject ${form} of ${specifier} outside their folder`, t => {
      const root = fixture(t);
      const filename = 'tv/app/view.js';
      write(root, filename, `var shared = ${NODE_GUARD} ? ${load(specifier)} : root.Shared;`);
      assertRejected(root, filename, new RegExp(specifier));
    });
  }
  const call = load('./text.js');
  for (const source of [
    `var shared = ${call};`,
    `var shared = typeof module === "object" ? ${call} : root.Shared;`,
    `var shared = ${NODE_GUARD} ? root.Shared : ${call};`,
    `if (${NODE_GUARD}) { module.exports = {}; } var shared = ${call};`,
    `if (${NODE_GUARD}) { module.exports = {}; } else { var shared = ${call}; }`,
    `var shared = ready || ${NODE_GUARD} ? ${call} : root.Shared;`,
  ]) {
    test(`TV scripts reject ${form} without an enclosing Node guard: ${source}`, t => {
      const root = fixture(t);
      const filename = 'tv/app/nested/view.js';
      write(root, filename, source);
      assertRejected(root, filename, /text.js/);
    });
  }
}

for (const source of [
  'import value from "./text.js";',
  'import * as shared from "./text.js";',
  'import { value } from "./text.js";',
  'import "./text.js";',
  'import("./text.js");',
  'import(name);',
  'void import.meta;',
  'export const value = 1;',
  'export function value() {}',
  'export class View {}',
  'export default function () {}',
  'var value; export { value };',
  'export { value } from "./text.js";',
  'export * from "./text.js";',
  'export * as shared from "./text.js";',
]) {
  test(`TV scripts reject ES module syntax: ${source}`, t => {
    const root = fixture(t);
    const filename = 'tv/app/nested/view.js';
    write(root, filename, source);
    assertRejected(root, filename, /import|export/);
  });
}

test('TV scripts ignore module syntax in comments strings and member names', t => {
  const root = fixture(t);
  write(root, 'tv/app/view.js', [
    '// import "outside"; require("node:fs");',
    'var documentation = "export default value; require(\'node:fs\');";',
    'var api = { import: 1, export: 2 }; api.import; api.export;',
    `if (${NODE_GUARD}) module.exports = api;`,
  ].join('\n'));
  const result = runGuard(root);
  assert.equal(result.status, 0, result.output);
});


test('lifecycle guard leaves question state writes inside the domain', t => {
  const root = fixture(t);
  write(root, 'core/nested/question.cjs', 'watch.asking = true; this.asking = false;');
  const result = runGuard(root);
  assert.equal(result.status, 0, result.output);
});


for (const call of ["require(name)", "module.require(name)", "require('./' + name)", "module.require(`./${name}`)"]) {
  test(`TV scripts reject an unverifiable CommonJS load: ${call}`, t => {
    const root = fixture(t);
    const filename = 'tv/app/nested/view.js';
    write(root, filename, `var shared = ${NODE_GUARD} ? ${call} : root.Shared;`);
    assertRejected(root, filename, /require/);
  });
}


for (const expression of [
  `${NODE_GUARD} ? root.Shared?.value : require('./text.js')`,
  `${NODE_GUARD} ? root.Shared ?? fallback : require('./text.js')`,
  `ready ?? (${NODE_GUARD}) ? require('./text.js') : root.Shared`,
]) {
  test(`TV scripts keep unguarded loads outside a conditional range: ${expression}`, t => {
    const root = fixture(t);
    const filename = 'tv/app/view.js';
    write(root, filename, `var shared = ${expression};`);
    assertRejected(root, filename, /text.js.*without a Node guard/);
  });
}
