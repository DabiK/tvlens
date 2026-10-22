const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launchServicesReopening, OPENED_BY_LAUNCH_SERVICES } = require('../app/launch-services.cjs');

const DEV_ELECTRON = '/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron';
const PACKAGED = '/Applications/TVLens.app/Contents/MacOS/TVLens';
const LOG = '/Users/viewer/Library/Logs/TVLens/main.log';

test('a macOS start from a terminal reopens its bundle through LaunchServices, with absolute paths and a log file', () => {
  const dev = launchServicesReopening({
    platform: 'darwin', parentPid: 4242, execPath: DEV_ELECTRON, appPath: '/repo', cwd: '/repo/app',
    argv: [DEV_ELECTRON, '.', '--config=../.env.local', '--live-verifier'], logFile: LOG,
  });
  assert.deepEqual({ command: dev.command, args: dev.args }, {
    command: '/usr/bin/open',
    args: ['-n', '--stdout', LOG, '--stderr', LOG, '/repo/node_modules/electron/dist/Electron.app', '--args',
      '/repo', '--config=/repo/.env.local', '--live-verifier', OPENED_BY_LAUNCH_SERVICES],
  });
  assert.match(dev.notice, /s’ouvre par macOS pour capter le son du système/);
  assert.ok(dev.notice.includes(LOG));
  const packaged = launchServicesReopening({
    platform: 'darwin', parentPid: 4242, execPath: PACKAGED, appPath: null, cwd: '/Users/viewer',
    argv: [PACKAGED, '--config=/Users/viewer/tvlens/.env.local'], logFile: LOG,
  });
  assert.deepEqual(packaged.args, ['-n', '--stdout', LOG, '--stderr', LOG, '/Applications/TVLens.app', '--args',
    '--config=/Users/viewer/tvlens/.env.local', OPENED_BY_LAUNCH_SERVICES]);
});

test('a start opened by macOS, one already reopened, or one off macOS is kept as it is', () => {
  const start = { platform: 'darwin', parentPid: 4242, execPath: PACKAGED, appPath: null, cwd: '/', argv: [PACKAGED], logFile: LOG };
  assert.equal(launchServicesReopening({ ...start, parentPid: 1 }), null, 'launchd opened it: Finder, Dock or open');
  assert.equal(launchServicesReopening({ ...start, argv: [PACKAGED, OPENED_BY_LAUNCH_SERVICES] }), null, 'never reopened twice');
  for (const platform of ['linux', 'win32']) assert.equal(launchServicesReopening({ ...start, platform }), null, platform);
});
