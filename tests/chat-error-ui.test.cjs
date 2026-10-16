const test = require('node:test');
const assert = require('node:assert/strict');
const { describeJob } = require('../tv/app/companion.js');

const insufficient = {
  answer: 'Je n’ai pas obtenu de preuve suffisante pour répondre.',
  kind: 'insufficient', citations: [], observations: [], hypotheses: [], limits: ['Résultat limité aux observations déjà obtenues.'],
};

test('companion.js exposes the pure view model without touching the browser', () => {
  assert.equal(typeof describeJob, 'function');
  assert.equal(typeof globalThis.window, 'undefined');
  // The panel now loads several scripts; each keeps its view models above a CommonJS guard and none
  // reaches for the browser when it is merely loaded.
  for (const name of ['surveillance-view.js', 'sessions-view.js', 'remote-client.js', 'surveillance-overlay.js']) assert.equal(typeof require('../tv/app/' + name), 'object', name);
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(typeof globalThis.document, 'undefined');
  assert.deepEqual(Object.keys(require('../tv/app/companion.js')).sort(), ['POLL', 'PollPlan', 'badgeReference', 'cancelTarget', 'clock', 'describeJob', 'describeJobFreshness', 'describeJobFreshnessShort', 'describeJobProgress', 'mergeState', 'pollPolicy', 'registryMarks']);
});

test('401 failure asks for Codex reconnection first and is never labelled as insufficient context', () => {
  const view = describeJob({
    status: 'error',
    message: 'Codex n’a pas terminé la réponse : authentification refusée (401). Reconnexion Codex requise (codex login), puis repose la question.',
    errorDetail: { authRequired: true, turnStatus: 'failed', turnError: { message: 'workspace routing discovery unauthorized (401)', codexErrorInfo: 'other' } },
    provisional: 'D’après les résumés automatiques :\nLe débat porte sur…',
    result: insufficient,
  });
  assert.equal(view.authRequired, true);
  assert.match(view.error, /401/);
  assert.match(view.errorDetail, /^Reconnexion Codex requise · Codex · failed · workspace routing discovery unauthorized \(401\)$/);
  assert.equal(view.kindLabel, null);
  assert.equal(view.answer, null);
  assert.equal(view.provisionalLabel, 'Résumé automatique partiel');
  assert.match(view.provisional, /Le débat porte sur/);
  assert.equal(view.previewLabel, null);
  assert.equal(view.preview, null);
  assert.deepEqual(view.limits, []);
  assert.equal(view.message, null);
});

test('a failed job keeps the streamed preview and the memory summary apart with their own provenance', () => {
  const both = describeJob({
    status: 'error',
    message: 'Codex n’a pas terminé la réponse.',
    preview: 'Le marxisme est une théorie',
    provisional: 'D’après les résumés automatiques :\nLe débat porte sur…',
    result: insufficient,
  });
  assert.equal(both.previewLabel, 'Réponse provisoire interrompue (non validée)');
  assert.equal(both.preview, 'Le marxisme est une théorie');
  assert.equal(both.provisionalLabel, 'Résumé automatique partiel');
  assert.match(both.provisional, /Le débat porte sur/);
  const onlyPreview = describeJob({ status: 'timeout', preview: 'Le marxisme est' });
  assert.equal(onlyPreview.previewLabel, 'Réponse provisoire interrompue (non validée)');
  assert.equal(onlyPreview.preview, 'Le marxisme est');
  assert.equal(onlyPreview.provisionalLabel, null);
  assert.equal(onlyPreview.provisional, null);
});

test('generic technical error shows the redacted Codex diagnostic', () => {
  const view = describeJob({ status: 'error', message: 'Codex n’a pas terminé la réponse.',
    errorDetail: { code: 'TVLENS_CODEX_REQUEST_CUT', turnStatus: 'failed', turnError: { code: 'rate_limit' } }, result: insufficient });
  assert.equal(view.authRequired, false);
  assert.equal(view.error, 'Codex n’a pas terminé la réponse.');
  assert.equal(view.errorDetail, 'Codex · failed · rate_limit');
  assert.equal(view.kindLabel, null);
  const info = describeJob({ status: 'error', message: 'Codex n’a pas terminé la réponse.', errorDetail: { turnStatus: 'failed', turnError: { codexErrorInfo: 'responseStreamDisconnected' } } });
  assert.equal(info.errorDetail, 'Codex · failed · responseStreamDisconnected');
  const bare = describeJob({ status: 'error', errorDetail: {} });
  assert.equal(bare.error, 'Erreur technique.');
  assert.equal(bare.errorDetail, null);
});

test('timeout and cancellation keep partial observations but stay distinct from abstention', () => {
  const observed = { ...insufficient, answer: 'Un intervenant lève la main.', kind: 'observation', observations: [{ id: 's1', startMs: 0, endMs: 1000, text: 'Un intervenant lève la main.' }] };
  const timeout = describeJob({ status: 'timeout', message: 'Limite de 5 minutes atteinte.', result: observed });
  assert.equal(timeout.error, 'Limite de 5 minutes atteinte.');
  // The ceiling in that sentence is worded by the server from the value it enforced; the panel adds none.
  assert.equal(timeout.statusLabel, 'Délai atteint');
  assert.equal(timeout.progress, null);
  assert.equal(describeJob({ status: 'timeout' }).error, 'Délai atteint.');
  assert.equal(timeout.kindLabel, 'Observations partielles');
  assert.equal(timeout.answer, 'Un intervenant lève la main.');
  assert.deepEqual(timeout.limits, observed.limits);
  const cancelled = describeJob({ status: 'cancelled', message: 'Recherche annulée.' });
  assert.equal(cancelled.error, 'Recherche annulée.');
  assert.equal(cancelled.statusLabel, 'Annulé');
  assert.equal(cancelled.answer, null);
  assert.equal(cancelled.preview, null);
  assert.equal(cancelled.provisional, null);
});

test('a completed answer that abstains is still reported as insufficient context', () => {
  const done = describeJob({ status: 'done', result: { ...insufficient, answer: 'Je n’ai pas assez d’éléments dans le documentaire.' } });
  assert.equal(done.error, null);
  assert.equal(done.errorDetail, null);
  assert.equal(done.kindLabel, 'Contexte insuffisant');
  assert.equal(done.answer, 'Je n’ai pas assez d’éléments dans le documentaire.');
  assert.equal(done.message, null);
  const explanation = describeJob({ status: 'done', result: { ...insufficient, kind: 'explanation', answer: 'Le marxisme est…' } });
  assert.equal(explanation.kindLabel, 'Explication générale');
  const unknown = describeJob({ status: 'done', result: { ...insufficient, kind: 'other' } });
  assert.equal(unknown.kindLabel, 'Réponse');
});

test('queued and running jobs show the provisional answer and the current step', () => {
  const view = describeJob({ status: 'running', message: 'Recherche sur Internet…', preview: 'Le marxisme' });
  assert.equal(view.error, null);
  assert.equal(view.previewLabel, 'Réponse provisoire');
  assert.equal(view.preview, 'Le marxisme');
  assert.equal(view.provisionalLabel, null);
  assert.equal(view.provisional, null);
  assert.equal(view.message, 'Recherche sur Internet…');
  // Without a clock the live line states the ceiling only: no elapsed time is made up.
  assert.equal(view.statusLabel, 'En cours');
  assert.equal(view.progress.label, 'En cours · arrêt au plus tard à 5:00');
  assert.equal(view.freshness, null);
  const withSummary = describeJob({ status: 'running', message: 'Analyse…', preview: 'Le marxisme', provisional: 'Le débat porte sur…' });
  assert.equal(withSummary.previewLabel, 'Réponse provisoire');
  assert.equal(withSummary.preview, 'Le marxisme');
  assert.equal(withSummary.provisionalLabel, 'Résumé automatique partiel');
  assert.equal(withSummary.provisional, 'Le débat porte sur…');
  const queued = describeJob({ status: 'queued' });
  assert.equal(queued.message, '');
  assert.equal(queued.progress.label, 'En file');
  assert.equal(queued.preview, null);
  assert.equal(queued.provisional, null);
});
