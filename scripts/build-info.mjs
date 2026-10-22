import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import buildInfo from '../adapters/build-info.cjs';

export function gitReader(root) {
  return args => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    return { code: result.status ?? 1, out: result.stdout || '' };
  };
}

export async function describeBuild({ root, git = gitReader(root) }) {
  const { name, version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const read = args => {
    const result = git(args);
    if (result.code !== 0) {
      throw Object.assign(new Error(`Identité de construction : échec de git ${args.join(' ')}.`), { code: 'TVLENS_BUILD_GIT_FAILED' });
    }
    return result.out.trim();
  };
  return buildInfo.parseBuildInfo({
    name, version,
    commit: read(['rev-parse', 'HEAD']),
    commitDate: read(['log', '-1', '--format=%cI']),
    dirty: read(['status', '--porcelain', '--untracked-files=all']).length > 0,
  });
}

export async function writeBuildInfo(directory, identity) {
  const filename = path.join(directory, 'build-info.json');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(filename, JSON.stringify(buildInfo.parseBuildInfo(identity), null, 2) + '\n');
  return filename;
}

async function main() {
  const { values } = parseArgs({ options: { out: { type: 'string' } } });
  if (!values.out) {
    console.error('Usage : node scripts/build-info.mjs --out <dossier>');
    process.exitCode = 2;
    return;
  }
  const identity = await describeBuild({ root: process.cwd() });
  console.log(await writeBuildInfo(path.resolve(values.out), identity));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
