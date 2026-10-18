const fs = require('node:fs/promises');
const path = require('node:path');
const { sha256 } = require('./perception-replay-input.cjs');
const { bindBody } = require('./local-stream-input.cjs');
const { REQUEST_MS } = require('./local-stream-transport.cjs');

async function setLanguage(language, transport, report) {
  const setting = { language, attempts: [] };
  report.languages.push(setting);
  const response = await transport.request('/v1/settings/transcription', JSON.stringify({ language }), REQUEST_MS, setting.attempts);
  setting.status = response.status === 200 ? 'set' : 'refused';
  setting.code = response.value?.code ?? null;
  return setting;
}
async function upload(entry, context, languageReady) {
  const { transport, loaded, report, options, writer, clock } = context;
  entry.availableAtMs = clock.now();
  if (transport.stopped) { entry.status = 'not-sent'; entry.code = transport.stopped; return; }
  const language = await languageReady;
  if (language.status !== 'set') { entry.status = 'refused'; entry.code = language.code || 'language-setting-refused'; return; }
  const raw = JSON.stringify(bindBody(loaded.templates[entry.block].body, entry, report.sessionId));
  entry.bodySha256 = sha256(raw);
  entry.bodyPath = 'uploads/' + String(entry.sequence).padStart(6, '0') + '.json';
  await fs.writeFile(path.join(options.outputDir, entry.bodyPath), raw, { mode: 0o600 });
  writer.save();
  await transport.deliver(entry, raw, report.sessionId);
}
async function question(entry, context) {
  const { transport, report, clock, observer } = context;
  entry.submittedAtMs = clock.now();
  entry.anchorMs = entry.submittedAtMs;
  entry.status = 'submitting';
  entry.effectiveBackend = { configured: report.roles.questions.configured, identity: report.roles.questions.identity,
    origin: report.roles.questions.origin };
  entry.called = { exercised: false };
  const response = await transport.request('/v1/questions', JSON.stringify({ sessionId: report.sessionId,
    question: entry.question, anchorMs: entry.anchorMs }), REQUEST_MS, entry.attempts);
  entry.acknowledgedAtMs = clock.now();
  if (response.status === 200) {
    entry.jobId = response.value.id;
    observer.refresh();
  } else {
    entry.status = response.status === null ? 'unfinished' : 'refused';
    entry.acknowledgementUnknown = response.status === null;
    entry.code = response.value?.code || 'HTTP_' + response.status;
  }
}
async function cancel(entry, context, submission) {
  const cancellation = entry.cancellation;
  cancellation.dueAtMs = context.clock.now();
  await submission;
  if (!entry.jobId) { cancellation.status = 'not-sent'; return; }
  cancellation.attempts = [];
  const response = await context.transport.request('/v1/questions/' + entry.jobId + '/cancel', '{}', REQUEST_MS, cancellation.attempts);
  cancellation.status = response.status === 200 ? 'acknowledged' : 'refused';
  cancellation.result = response.value;
  context.observer.refresh();
}
module.exports = { setLanguage, upload, question, cancel };
