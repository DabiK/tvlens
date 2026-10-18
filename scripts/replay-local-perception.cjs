#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { readJson, readBytes, sha256, loadCase, requireInput } = require('./perception-replay-input.cjs');
const { executeCase } = require('./perception-replay-execution.cjs');
const { codeIdentity } = require('./perception-replay-identity.cjs');

function reportWriter(outputDir, report) {
  const file = path.join(outputDir, 'campaign.json');
  let pending = Promise.resolve();
  return { save() {
    const snapshot = JSON.stringify(report, null, 2);
    pending = pending.then(async () => {
      await fs.writeFile(file + '.tmp', snapshot, { mode: 0o600 });
      await fs.rename(file + '.tmp', file);
    });
    // Un diagnostic synchrone n'attend pas le disque ; le prochain await save() propage l'échec.
    pending.catch(() => {});
    return pending;
  } };
}
function effectiveConfig(options) {
  const config = { model: options.model ?? null, isolation: 'new-agent-per-case', transcription: 'frozen-no-whisper' };
  if (!options.execute) return config;
  requireInput(typeof options.model === 'string' && options.model.trim(), 'CONFIG_INVALID');
  if (options.backend === 'local') {
    let url;
    try { url = new URL(options.url); }
    catch { throw Object.assign(Error('Configuration locale invalide.'), { code: 'TVLENS_REPLAY_CONFIG_INVALID' }); }
    requireInput(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 'CONFIG_INVALID');
    requireInput(options.numCtx === undefined || (Number.isInteger(options.numCtx) && options.numCtx > 0), 'CONFIG_INVALID');
    config.host = url.host;
  }
  return config;
}
async function preflight(manifest, report, writer, base) {
  const loaded = [], ids = new Set();
  for (const [index, item] of manifest.cases.entries()) {
    const entry = { index, id: item?.id ?? null, status: 'refused' };
    report.cases.push(entry);
    try {
      requireInput(!ids.has(item?.id), 'DUPLICATE_ID');
      ids.add(item?.id);
      loaded[index] = await loadCase(item, base);
      Object.assign(entry, { status: 'validated', input: loaded[index].input });
    } catch (error) {
      entry.error = { code: error.code || 'TVLENS_REPLAY_INPUT_INVALID' };
    }
    await writer.save();
  }
  return loaded;
}
async function initialReport(options, config, manifest, dependencies) {
  // Empreinte figée avant le premier constructeur, même si les annotations changent ensuite.
  const annotationsSha256 = options.annotationsPath ? sha256(await readBytes(options.annotationsPath)) : null;
  return { version: 1, runId: randomUUID(), startedAt: new Date().toISOString(),
    mode: options.execute ? 'execution' : 'validation', backend: options.backend,
    reference: options.backend === 'codex' ? 'codex' : null, code: await codeIdentity(dependencies.identityDependencies),
    runtime: { node: process.version, platform: process.platform, arch: process.arch }, config,
    manifestSha256: manifest.sha256, annotationsSha256, g2Eligible: Boolean(annotationsSha256), complete: false, cases: [] };
}
function validatePreparationMarker(manifest) {
  requireInput(manifest?.preparation === undefined || manifest.preparation?.complete === true, 'PREPARATION_INCOMPLETE');
}
async function runReplay(options, dependencies = {}) {
  requireInput(['local', 'codex'].includes(options.backend), 'BACKEND_REQUIRED');
  requireInput(options.execute === undefined || typeof options.execute === 'boolean', 'EXECUTE_INVALID');
  const config = effectiveConfig(options);
  const manifest = await readJson(options.manifestPath);
  validatePreparationMarker(manifest.value);
  requireInput(manifest.value?.version === 1 && Array.isArray(manifest.value.cases)
    && manifest.value.cases.length > 0, 'MANIFEST_INVALID');
  const report = await initialReport(options, config, manifest, dependencies);
  // Un dossier neuf évite qu'une campagne écrase une preuve précédente ou son propre corpus.
  await fs.mkdir(options.outputDir, { mode: 0o700 });
  const writer = reportWriter(options.outputDir, report);
  await writer.save();
  const loaded = await preflight(manifest.value, report, writer, path.dirname(options.manifestPath));
  const valid = report.cases.every(item => item.status === 'validated');
  if (valid && options.execute) {
    for (const entry of report.cases) {
      if (options.signal?.aborted) break;
      await executeCase(options, dependencies, loaded[entry.index], entry, writer, report);
    }
  }
  report.complete = valid && !options.signal?.aborted;
  report.finishedAt = new Date().toISOString();
  await writer.save();
  return report;
}
module.exports = { runReplay };
if (require.main === module) {
  require('./perception-replay-cli.cjs').main(process.argv.slice(2), runReplay).then(code => { process.exitCode = code; });
}
