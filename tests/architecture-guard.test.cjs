const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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
];
const LAYER_GUARD_PATTERN = `^(${GUARD_NAMES.join('|')})$`;

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
  return root;
}

function runGuard(root) {
  const result = spawnSync(process.execPath, [
    '--test', '--test-concurrency=1', '--test-reporter=tap',
    `--test-name-pattern=${LAYER_GUARD_PATTERN}`, 'tests/architecture.test.cjs',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });
  assert.ifError(result.error);
  const output = result.stdout + result.stderr;
  // Un filtre périmé ne doit jamais transformer une garde absente en succès.
  for (const name of GUARD_NAMES) {
    assert.ok(output.split('\n').some(line => /^(?:not )?ok \d+ - /.test(line) && line.endsWith(`- ${name}`)), output);
  }
  return { status: result.status, output };
}

function assertRejected(root, filename, diagnostic, ruleName) {
  const result = runGuard(root);
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
        'watch.asking = true;',
        ...['ending', 'accepting', 'readOnly', 'closed'].map(flag =>
          `void watch.${flag}; void (session.watch.${flag} === true); void (watch.${flag} !== false);`),
      ].join('\n'));
    }
  }
  const result = runGuard(root);
  assert.equal(result.status, 0, result.output);
});

for (const directory of ['app', 'runtime', 'server', 'mcp']) {
  for (const flag of ['ending', 'accepting', 'readOnly', 'closed']) {
    const filename = `${directory}/nested/deeper/lifecycle.cjs`;
    test(`lifecycle guard rejects writes to ${flag} in ${filename}`, t => {
      const root = fixture(t);
      write(root, filename, `session.watch.${flag} = true;`);
      assertRejected(root, filename, new RegExp(`writes watch\\.${flag} =`));
    });
  }
}

for (const source of ['session.watch["ending"] = true;', 'watch.closed ||= true;']) {
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
  ['multiline from', specifier => `import { value }\n from /* note */\n '${specifier}';`],
  ['multiline re-export', specifier => `export { value }\n from\n "${specifier}";`],
  ['dynamic import', specifier => `import(\n '${specifier}'\n);`],
  ['side-effect import', specifier => `import "${specifier}";`],
];

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
