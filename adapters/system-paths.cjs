const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Configuration overrides win; PATH supports Linux and either Homebrew prefix.
function executable(name, { override, environment = process.env, home = os.homedir() } = {}) {
  if (override) return override;
  const candidates = [
    ...(environment.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, name)),
    path.join(home, '.local', 'bin', name),
    path.join('/opt/homebrew/bin', name),
    path.join('/usr/local/bin', name),
    path.join('/usr/bin', name),
  ];
  return candidates.find(file => {
    try { return fs.statSync(file).isFile() && (fs.accessSync(file, fs.constants.X_OK), true); }
    catch { return false; }
  }) || name;
}
module.exports = { executable };
