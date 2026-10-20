#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { prepareCases } = require('./vision-input.cjs');
const { localBase, requestFor, exchange, parseResponse, cadenceSimulation } = require('./vision-transport.cjs');

const DEFAULT_MODELS = {
  ollama: 'qwen3-vl:4b-instruct-bf16',
  vllm: 'Qwen/Qwen3-VL-4B-Instruct',
};
const DEFAULT_URLS = { ollama: 'http://127.0.0.1:11434', vllm: 'http://127.0.0.1:8001' };
const BUDGET_MS = 20 * 60 * 1000;
const FAILURES_LIMIT = 3;
const sha256 = data => createHash('sha256').update(data).digest('hex');
const utc = () => new Date().toISOString();

function parseArgs(argv) {
  const options = {};
  const values = { '--manifest': 'manifest', '--out': 'out', '--repo': 'repo', '--backend': 'backend',
    '--model': 'model', '--url': 'url', '--limit': 'limit', '--repeats': 'repeats' };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (seen.has(flag)) throw Error('CLI_DUPLICATE');
    seen.add(flag);
    if (flag === '--execute') options.execute = true;
    else if (values[flag] && argv[i + 1] && !argv[i + 1].startsWith('--')) options[values[flag]] = argv[++i];
    else throw Error('CLI_INVALID');
  }
  if (!options.manifest || !options.out || !options.repo || !DEFAULT_MODELS[options.backend]) throw Error('CLI_REQUIRED');
  options.limit = options.limit === undefined ? 12 : Number(options.limit);
  options.repeats = options.repeats === undefined ? 1 : Number(options.repeats);
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 12 ||
      !Number.isInteger(options.repeats) || options.repeats < 1 || options.repeats > 2) throw Error('CLI_BOUNDS');
  options.model ||= DEFAULT_MODELS[options.backend];
  options.url = localBase(options.url || DEFAULT_URLS[options.backend]);
  return options;
}

async function saveJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}

async function replaceJson(file, value) {
  const temp = file + '.tmp';
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(temp, file);
}

async function providerSnapshot(options, out, label) {
  const endpoint = options.backend === 'vllm' ? '/metrics' : '/api/ps';
  const file = path.join(out, `provider-${label}.raw.txt`);
  const atUtc = utc();
  try {
    const result = await exchange(options.url + endpoint, { signal: options.signal });
    await fs.writeFile(file, result.bytes, { flag: 'wx', mode: 0o600 });
    let modelResident = null;
    if (options.backend === 'ollama' && result.status === 200) {
      try {
        const state = JSON.parse(result.bytes.toString('utf8'));
        if (Array.isArray(state.models)) {
          modelResident = state.models.some(item => [item.name, item.model].includes(options.model));
        }
      } catch {
        modelResident = null;
      }
    }
    return { atUtc, endpoint, httpStatus: result.status, sha256: sha256(result.bytes),
      file: path.basename(file), totalMs: result.totalMs, modelResident };
  } catch (error) {
    return { atUtc, endpoint, error: error.name === 'AbortError' ? 'TIMEOUT' : 'SNAPSHOT_FAILED' };
  }
}

async function runCase(options, item, out, repeat) {
  const key = `pass-${repeat}-${item.id}`;
  const folder = path.join(out, key);
  await fs.mkdir(folder, { mode: 0o700 });
  const body = requestFor(options.backend, options.model, item.prompt);
  const request = Buffer.from(JSON.stringify(body));
  await fs.writeFile(path.join(folder, 'request.json'), request, { flag: 'wx', mode: 0o600 });
  const row = { id: key, caseId: item.id, repeat, startMs: item.startMs, endMs: item.endMs, atUtc: utc(), status: 'started',
    input: item.input, promptSha256: item.promptSha256, frameSha256: item.frameSha256,
    requestSha256: sha256(request), requestBytes: request.length,
    requestFile: `${key}/request.json`, responseFile: null, responseSha256: null };
  if (options.backend === 'ollama') row.residencyBefore = await providerSnapshot(options, out, `${key}-before`);
  try {
    const endpoint = options.backend === 'vllm' ? '/v1/chat/completions' : '/api/chat';
    const result = await exchange(options.url + endpoint, { method: 'POST', signal: options.signal,
      headers: { 'Content-Type': 'application/json' }, body: request });
    const raw = path.join(folder, 'response.raw.txt');
    await fs.writeFile(raw, result.bytes, { flag: 'wx', mode: 0o600 });
    row.responseFile = `${key}/response.raw.txt`;
    row.responseSha256 = sha256(result.bytes);
    row.responseBytes = result.bytes.length;
    row.httpStatus = result.status;
    row.latency = { headersMs: result.headersMs, totalMs: result.totalMs, ttftMs: null };
    row.contentType = result.contentType;
    Object.assign(row, parseResponse(options.backend, options.model, result));
  } catch (error) {
    row.status = 'transport-error';
    row.error = options.signal?.aborted ? 'CANCELLED' : error.name === 'AbortError' ? 'TIMEOUT' :
      error.message === 'RESPONSE_TOO_LARGE' ? 'RESPONSE_TOO_LARGE' : 'TRANSPORT_FAILED';
  }
  if (options.backend === 'ollama') row.residencyAfter = await providerSnapshot(options, out, `${key}-after`);
  row.finishedAtUtc = utc();
  await saveJson(path.join(folder, 'result.json'), row);
  return row;
}

async function seal(out) {
  const files = {};
  async function visit(folder) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.name !== 'integrite.json') files[path.relative(out, file)] = sha256(await fs.readFile(file));
    }
  }
  await visit(out);
  await saveJson(path.join(out, 'integrite.json'), { files });
}

async function run(options) {
  const inputs = await prepareCases(path.resolve(options.manifest), path.resolve(options.repo));
  await fs.mkdir(options.out, { mode: 0o700 });
  const selected = inputs.cases.slice(0, options.limit);
  const planned = Array.from({ length: options.repeats }, (_, index) =>
    selected.map(item => ({ id: `pass-${index + 1}-${item.id}`, caseId: item.id, repeat: index + 1,
      startMs: item.startMs, endMs: item.endMs, promptSha256: item.promptSha256,
      frameSha256: item.frameSha256, mediaSha256: item.input.media.sha256, status: 'validated' }))).flat();
  const report = { version: 1, id: randomUUID(), atUtc: utc(), backend: options.backend,
    model: options.model, host: new URL(options.url).host, mode: options.execute ? 'execute' : 'validate',
    manifestSha256: inputs.manifestSha256, selectedCases: selected.length, repeats: options.repeats,
    complete: false, readyForScoring: false,
    cadenceInterpretation: 'simulation sur les cas sélectionnés ; aucune perte réelle TVLens',
    cases: planned };
  const reportFile = path.join(options.out, 'campaign.json');
  await saveJson(reportFile, report);
  const started = performance.now();
  let failures = 0;
  try {
    if (options.execute) {
      report.before = await providerSnapshot(options, options.out, 'before');
      for (const [index, row] of planned.entries()) {
        if (options.signal?.aborted) { report.stopReason = 'CANCELLED'; break; }
        if (performance.now() - started >= BUDGET_MS) { report.stopReason = 'BUDGET'; break; }
        const item = selected.find(candidate => candidate.id === row.caseId);
        const result = await runCase(options, item, options.out, row.repeat);
        report.cases[index] = result;
        failures = result.status === 'returned' ? 0 : failures + 1;
        await replaceJson(reportFile, report);
        if (failures >= FAILURES_LIMIT) { report.stopReason = 'CONSECUTIVE_FAILURES'; break; }
      }
      report.after = await providerSnapshot(options, options.out, 'after');
      report.cadence = Array.from({ length: options.repeats }, (_, index) => {
        const rows = report.cases.filter(row => row.repeat === index + 1);
        if (rows.length !== selected.length || rows.some(row => row.status !== 'returned')) {
          return { repeat: index + 1, kind: 'unavailable', reason: 'incomplete-provider-series' };
        }
        return { repeat: index + 1, ...cadenceSimulation(rows) };
      });
    }
    report.complete = !report.stopReason && report.cases.every(row =>
      options.execute ? row.status === 'returned' : row.status === 'validated');
  } finally {
    report.finishedAtUtc = utc();
    await replaceJson(reportFile, report);
    await seal(options.out);
  }
  return report;
}

module.exports = { parseArgs, run };
if (require.main === module) {
  const usage = 'Usage : node vision-probe.cjs --repo depot --manifest corpus.json --backend ollama|vllm '
    + '--out dossier-neuf [--url loopback] [--model nom] [--limit 1..12] [--repeats 1..2] [--execute]\n';
  if (process.argv.includes('--help')) process.stdout.write(usage);
  else {
    const controller = new AbortController();
    const interrupt = () => controller.abort();
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', interrupt);
    Promise.resolve().then(() => run({ ...parseArgs(process.argv.slice(2)), signal: controller.signal })).then(report => {
      process.stdout.write(`${report.backend}: ${report.complete ? 'complete' : 'incomplete'} ; ${report.cases.length} cas.\n`);
      process.exitCode = report.complete ? 0 : 1;
    }).catch(error => {
      process.stderr.write(`Sonde refusée : ${error.code || error.message || 'ERROR'}\n`);
      process.exitCode = 1;
    }).finally(() => {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    });
  }
}
