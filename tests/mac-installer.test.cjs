const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const installer = path.resolve(__dirname, '../scripts/install-mac.sh');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tvlens installer '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, 'Applications');
  const target = path.join(destination, 'TVLens.app');
  fs.mkdirSync(path.join(target, 'Contents/Resources'), { recursive: true });
  fs.writeFileSync(path.join(target, 'Contents/Resources/app.asar'), 'old');
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  function run(script, args = []) {
    return spawnSync('/bin/bash', ['-c', 'source "$1"\n' + script, 'test', installer, ...args], {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, HOME: home, FIXTURE: root, DEST: destination },
    });
  }
  return { root, home, destination, target, run };
}

const offlineApp = `
check_platform() { :; }
download() { printf 'archive' > "$2"; }
extract_archive() {
  mkdir -p "$2/TVLens.app/Contents/Resources"
  printf 'new' > "$2/TVLens.app/Contents/Resources/app.asar"
}
app_is_valid() { return 0; }
copy_app() { cp -R "$1" "$2"; }
app_running() { return 1; }
APP_SHA256='${createHash('sha256').update('archive').digest('hex')}'
`;
const installArgs = 'main --yes --app-only --no-open --destination "$DEST"';

function oldApp(f) {
  assert.equal(fs.readFileSync(path.join(f.target, 'Contents/Resources/app.asar'), 'utf8'), 'old');
}

function noDebris(f) {
  assert.deepEqual(fs.readdirSync(f.destination), ['TVLens.app']);
}

test('installer help works without dependencies or platform checks', (t) => {
  const f = fixture(t);
  const result = f.run('main --help');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--app-only/);
});

test('installer rejects unsupported machines before downloading', (t) => {
  const f = fixture(t);
  const result = f.run('uname() { printf Linux; }\nmain --yes');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[PLATFORM\]/);
  oldApp(f);
});

test('installer rejects an unknown argument before any changes', (t) => {
  const f = fixture(t);
  assert.equal(f.run('main --unknown').status, 1);
  oldApp(f);
});

test('installer refuses corrupt downloads before extracting or replacing', (t) => {
  const f = fixture(t);
  const result = f.run(offlineApp + '\nAPP_SHA256=incorrect\n' + installArgs);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[CHECKSUM\]/);
  oldApp(f);
  noDebris(f);
});

test('installer refuses an unexpected signature and preserves the installed app', (t) => {
  const f = fixture(t);
  const result = f.run(offlineApp + '\napp_is_valid() { return 1; }\n' + installArgs);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[SIGNATURE\]/);
  oldApp(f);
  noDebris(f);
});

test('installer preserves the installed app on a network failure', (t) => {
  const f = fixture(t);
  const result = f.run(offlineApp + '\ndownload() { return 22; }\n' + installArgs);
  assert.equal(result.status, 22);
  oldApp(f);
  noDebris(f);
});

test('installer replaces an app in a path with spaces and removes staging files', (t) => {
  const f = fixture(t);
  const result = f.run(offlineApp + installArgs);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(f.target, 'Contents/Resources/app.asar'), 'utf8'), 'new');
  noDebris(f);
});

test('installer restores the previous app when final rename fails', (t) => {
  const f = fixture(t);
  const result = f.run(offlineApp + `
mv() {
  case "$1" in
    */.tvlens-install.*/TVLens.app) return 73 ;;
    *) command mv "$@" ;;
  esac
}
` + installArgs);
  assert.equal(result.status, 73);
  oldApp(f);
  noDebris(f);
});

test('installer refuses to replace an app while TVLens is running', (t) => {
  const f = fixture(t);
  const result = f.run(offlineApp + '\napp_running() { return 0; }\n' + installArgs);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[RUNNING\]/);
  oldApp(f);
  noDebris(f);
});

test('installer can be repeated without replacing an identical running app', (t) => {
  const f = fixture(t);
  assert.equal(f.run(offlineApp + installArgs).status, 0);
  const result = f.run(offlineApp + '\napp_running() { return 0; }\n' + installArgs);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /déjà installée/);
  noDebris(f);
});

test('installer respects an existing installation lock', (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.destination, '.tvlens-install-lock'));
  const result = f.run(offlineApp + installArgs);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[LOCK\]/);
  assert.ok(fs.existsSync(path.join(f.destination, '.tvlens-install-lock')));
  oldApp(f);
});

test('installer never follows an app destination symlink', (t) => {
  const f = fixture(t);
  fs.renameSync(f.target, f.target + '.saved');
  fs.symlinkSync(f.target + '.saved', f.target);
  const result = f.run(offlineApp + installArgs);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[DESTINATION\]/);
  oldApp(f);
});

test('installer leaves existing models and preferences untouched', (t) => {
  const f = fixture(t);
  const data = path.join(f.home, 'Library/Application Support/TVLens');
  fs.mkdirSync(path.join(data, 'models'), { recursive: true });
  fs.writeFileSync(path.join(data, 'models/ggml-base.bin'), 'custom model');
  fs.writeFileSync(path.join(data, 'installation.json'), '{"completed":true}');
  const result = f.run('download() { exit 99; }\nprepare_model');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(data, 'models/ggml-base.bin'), 'utf8'), 'custom model');
  assert.equal(fs.readFileSync(path.join(data, 'installation.json'), 'utf8'), '{"completed":true}');
});

test('installer removes a corrupt model download without replacing the model', (t) => {
  const f = fixture(t);
  const result = f.run(`
trap cleanup EXIT
download() { printf broken > "$2"; }
prepare_model
`);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[CHECKSUM\]/);
  assert.deepEqual(fs.readdirSync(path.join(f.home, 'Library/Application Support/TVLens/models')), []);
});

test('installer skips Homebrew entirely when tools already exist', (t) => {
  const f = fixture(t);
  const result = f.run('find_tool() { return 0; }\nensure_brew() { exit 99; }\nprepare_tools');
  assert.equal(result.status, 0, result.stderr);
});

test('installer installs only missing tools with the official formula and cask names', (t) => {
  const f = fixture(t);
  const result = f.run(`
find_tool() { [ "$1" = ffmpeg ] || [ -f "$FIXTURE/$1" ]; }
brew_fixture() {
  printf '%s\\n' "$*" >> "$FIXTURE/brew.calls"
  case "$*" in
    'install --cask codex') touch "$FIXTURE/codex" ;;
    'install whisper.cpp') touch "$FIXTURE/whisper-cli" ;;
    *) return 99 ;;
  esac
}
ensure_brew() { BREW=brew_fixture; }
prepare_tools
`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(f.root, 'brew.calls'), 'utf8'), 'install --cask codex\ninstall whisper.cpp\n');
});

test('installer reports a tool still absent after Homebrew rather than claiming success', (t) => {
  const f = fixture(t);
  const result = f.run('find_tool() { return 1; }\nensure_brew() { BREW=true; }\nprepare_tools');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[TOOL_MISSING\]/);
});

test('installer validates the actual signing requirement on macOS', { skip: process.platform !== 'darwin' }, (t) => {
  const f = fixture(t);
  const binary = path.join(f.root, 'SignedFixture');
  fs.copyFileSync('/usr/bin/true', binary);
  fs.chmodSync(binary, 0o755);
  const signed = spawnSync('/usr/bin/codesign', ['--force', '--sign', '-', '--identifier', 'dev.tvlens.capture', binary]);
  assert.equal(signed.status, 0, signed.stderr.toString());
  const result = f.run('verify_app "$2"', [binary]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[SIGNATURE\]/);
  assert.match(result.stderr, /code failed to satisfy specified code requirement/);
});

test('installer rejects root and Rosetta independently of the host platform', (t) => {
  const f = fixture(t);
  const root = f.run('uname() { printf Darwin; }\ncheck_platform');
  assert.match(root.stderr, /\[ARCH\]/);
  const result = f.run(`
uname() { if [ "$1" = -s ]; then printf Darwin; else printf arm64; fi; }
id() { printf 0; }
check_platform
`);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[ROOT\]/);
});

test('installer cancels before network access when confirmation is declined', (t) => {
  const f = fixture(t);
  const result = f.run(offlineApp + 'main --app-only --no-open --destination "$DEST" <<< n');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[CANCELLED\]/);
  oldApp(f);
  noDebris(f);
});

test('installer commits a model only after its checksum matches', (t) => {
  const f = fixture(t);
  const expected = createHash('sha256').update('model fixture').digest('hex');
  const result = f.run(`
trap cleanup EXIT
MODEL_SHA256='${expected}'
download() { printf 'model fixture' > "$2"; }
prepare_model
`);
  assert.equal(result.status, 0, result.stderr);
  const directory = path.join(f.home, 'Library/Application Support/TVLens/models');
  assert.deepEqual(fs.readdirSync(directory), ['ggml-base.bin']);
  assert.equal(fs.readFileSync(path.join(directory, 'ggml-base.bin'), 'utf8'), 'model fixture');
});
