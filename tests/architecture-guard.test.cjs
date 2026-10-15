const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const EXTENSIONS = ['.js', '.cjs', '.mjs'];
const LEVELS = ['', 'nested', 'nested/deeper'];
const LAYER_GUARD_PATTERN = '^(portable core|shared runtime|compositions leave|core services) ';

function write(root, filename, source) {
  const target = path.join(root, filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-guard-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'tests/architecture.test.cjs', fs.readFileSync(path.join(__dirname, 'architecture.test.cjs')));
  for (const directory of ['core', 'runtime', 'server', 'app', 'mcp']) {
    fs.mkdirSync(path.join(root, directory));
  }
  return root;
}

function runGuard(root) {
  const result = spawnSync(process.execPath, [
    '--test', '--test-concurrency=1', `--test-name-pattern=${LAYER_GUARD_PATTERN}`, 'tests/architecture.test.cjs',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}

function assertRejected(root, filename, diagnostic) {
  const result = runGuard(root);
  assert.equal(result.status, 1, result.output);
  assert.ok(result.output.includes(filename), result.output);
  assert.match(result.output, /ERR_ASSERTION/);
  assert.match(result.output, diagnostic);
  assert.doesNotMatch(result.output, /EISDIR/);
}

test('architecture guard cases run without product adapters', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-isolation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const filename of ['architecture.test.cjs', 'architecture-guard.test.cjs']) {
    write(root, `tests/${filename}`, fs.readFileSync(path.join(__dirname, filename)));
  }
  const result = spawnSync(process.execPath, [
    '--test', '--test-concurrency=1', '--test-reporter=tap',
    '--test-name-pattern=^architecture guard accepts conforming modules',
    'tests/architecture-guard.test.cjs',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^# pass 1$/m);
  assert.match(result.stdout, /^ok 1 - architecture guard accepts conforming modules /m);
});

test('architecture guard accepts conforming modules at every depth beside non-JavaScript entries', t => {
  const root = fixture(t);
  for (const directory of ['core', 'runtime', 'server']) {
    for (const level of LEVELS) {
      for (const extension of EXTENSIONS) {
        write(root, `${directory}/${level}/module${extension}`, "const value = require('./local.cjs');\n");
      }
      write(root, `${directory}/${level}/notes.txt`, "require('electron'); require('node:fs'); process.cwd();\n");
    }
  }
  const result = runGuard(root);
  assert.equal(result.status, 0, result.output);
});

const FORBIDDEN_SOURCES = [
  { directory: 'core', source: "require('node:fs');", diagnostic: /depends on node:fs/ },
  { directory: 'core', source: 'process.cwd();', diagnostic: /portable core[\s\S]*process/ },
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
  write(root, filename, "require('./session.cjs');");
  assertRejected(root, filename, /depends on the session use case/);
});
