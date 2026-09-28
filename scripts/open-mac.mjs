import { spawn } from 'node:child_process';
import path from 'node:path';
const args = ['-n'];
if (process.env.CODEX_HOME) args.push('--env', `CODEX_HOME=${process.env.CODEX_HOME}`);
args.push(path.resolve('dist/TVLens-darwin-arm64/TVLens.app'), '--args', `--config=${path.resolve('.env.local')}`);
const child = spawn('/usr/bin/open', args, { stdio: 'inherit', shell: false });
child.on('exit', code => { process.exitCode = code || 0; });
child.on('error', () => { console.error('Impossible d’ouvrir TVLens. Lance npm run package:mac au préalable.'); process.exitCode = 1; });
