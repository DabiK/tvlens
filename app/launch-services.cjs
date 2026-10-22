const path = require('node:path');

// Added to the reopened start, so that it is never reopened a second time, whatever its parent.
const OPENED_BY_LAUNCH_SERVICES = '--opened-by-launch-services';
const CONFIG = '--config=';

/**
 * How to reopen a macOS start through LaunchServices, or null when it runs where it is.
 * Started from a terminal, the app is not the one macOS holds responsible for screen and sound access: the terminal
 * is, and CoreAudio Tap then delivers no sound. Opened by Finder, Dock or `open`, the app has launchd for parent.
 * `open` hands the caller's environment on, but starts in `/`: the app folder and the configuration become absolute.
 */
function launchServicesReopening({ platform, parentPid, argv, execPath, appPath, cwd, logFile }) {
  if (platform !== 'darwin' || parentPid === 1 || argv.includes(OPENED_BY_LAUNCH_SERVICES)) return null;
  const bundle = path.resolve(execPath, '..', '..', '..');
  // An unpackaged start names its app folder first; a packaged one carries it inside the bundle.
  const options = argv.slice(appPath ? 2 : 1).map(arg => (arg.startsWith(CONFIG) ? CONFIG + path.resolve(cwd, arg.slice(CONFIG.length)) : arg));
  return {
    command: '/usr/bin/open',
    args: ['-n', '--stdout', logFile, '--stderr', logFile, bundle, '--args', ...(appPath ? [appPath] : []), ...options, OPENED_BY_LAUNCH_SERVICES],
    notice: `TVLens s’ouvre par macOS pour capter le son du système. Journaux : ${logFile}`,
  };
}

module.exports = { launchServicesReopening, OPENED_BY_LAUNCH_SERVICES };
