#!/usr/bin/env node
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { loadScenario } = require('./local-stream-input.cjs');
const { reportWriter, identity, rolesOf } = require('./local-stream-report.cjs');
const { requireInput: check } = require('./perception-replay-input.cjs');
const { webSettingsOf } = require('./local-stream-web.cjs');

async function runReplay(options, dependencies = {}) {
  check(options.execute === undefined || typeof options.execute === 'boolean', 'EXECUTE_INVALID');
  const loaded = await loadScenario(options.scenarioPath);
  const report = { version: 1, runId: randomUUID(), mode: options.execute ? 'execution' : 'validation',
    complete: false, status: 'incomplete', inputs: loaded.inputs, code: await identity(dependencies.identityDependencies),
    provenance: loaded.provenance, plannedInterval: { startMs: 0, endMs: loaded.scenario.plannedDurationMs },
    parameters: loaded.scenario, roles: rolesOf(loaded.scenario.config), uploads: loaded.uploads, questions: loaded.questions,
    webRetrieval: webSettingsOf(loaded.scenario.config), webResidence: null, sourceTitleDeclared: loaded.scenario.sourceTitle !== undefined,
    clocks: null, shutdown: null, remaining: [], guardFailures: [], diagnostics: [], languages: [] };
  await fs.mkdir(options.outputDir, { mode: 0o700 });
  const writer = reportWriter(options.outputDir, report);
  await writer.save();
  if (options.execute) await require('./local-stream-schedule.cjs').execute(options, dependencies, loaded, report, writer);
  else { report.complete = true; report.status = 'validated'; }
  await writer.save();
  return report;
}
module.exports = { runReplay };
if (require.main === module) {
  require('./local-stream-cli.cjs').main(process.argv.slice(2), runReplay).then(code => { process.exitCode = code; });
}
