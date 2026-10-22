const fs = require('node:fs/promises');
const path = require('node:path');

function parseBuildInfo(value) {
  const text = field => typeof value?.[field] === 'string' && value[field].trim().length > 0;
  if (!text('name') || !text('version') || !/^[a-f0-9]{40}$/.test(value?.commit) ||
    !text('commitDate') || !Number.isFinite(Date.parse(value.commitDate)) || typeof value?.dirty !== 'boolean') {
    throw Object.assign(new Error('Identité de construction invalide.'), { code: 'TVLENS_BUILD_INVALID' });
  }
  const { name, version, commit, commitDate, dirty } = value;
  return Object.freeze({ name, version, commit, commitDate, dirty });
}

async function readBuildInfo(directory) {
  const filename = path.join(directory, 'build-info.json');
  let contents;
  try {
    contents = await fs.readFile(filename, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    return parseBuildInfo(JSON.parse(contents));
  } catch (cause) {
    throw Object.assign(new Error(`Identité de construction illisible : ${filename}`, { cause }), { code: 'TVLENS_BUILD_INVALID' });
  }
}

module.exports = { parseBuildInfo, readBuildInfo };
