const { createSampling, SAMPLE_STEP_MS } = require('./local-stream-sampling.cjs');
const { CAPTURE_GAP_MS } = require('../core/session-timeline.cjs');
function latestEvidence(passages, lane, elapsedMs) {
  const stamp = lane === 'audio' ? 'transcriptPublishedMs' : 'visionPublishedMs';
  const candidates = passages.filter(p => p[lane + 'Status'] === 'ready' && !(lane === 'audio' && p.audioFailed)
    && Number.isFinite(p.metadata[stamp]));
  candidates.sort((a, b) => b.metadata[stamp] - a.metadata[stamp]);
  const passage = candidates[0];
  if (!passage) return { passageId: null, publishedAtMs: null, ageMs: null };
  return { passageId: passage.id, revision: passage.revision, publishedAtMs: passage.metadata[stamp],
    startMs: passage.startMs, endMs: passage.endMs, ageMs: Math.max(0, elapsedMs - passage.metadata[stamp]),
    contentAgeMs: Math.max(0, elapsedMs - passage.endMs) };
}
function initialize(report) {
  report.observation = {
    passages: { channel: 'session.events + session.memory.passage(id)', exhaustive: true },
    hostRevisions: { channel: '/v1/state', exhaustive: false }, sampleStepMs: SAMPLE_STEP_MS,
    consultation: { channel: 'session.memory.view()', captureGapThresholdMs: 250 },
    httpCaptureGaps: { channel: '/v1/state', captureGapThresholdMs: CAPTURE_GAP_MS, exhaustive: false },
    limits: ['Le sondage ne conserve que les révisions d’hôte reçues ; les publications intermédiaires restent inconnues.',
      'Une voie prête prouve une publication, pas la vérité du texte ni une couverture continue.',
      'Le délai HTTP inclut la cadence de sondage ; le résidu client moins fournisseur n’est pas le réseau pur.',
      'L’attente effective de l’agent peut être incluse dans le traitement annoncé ; elle reste inconnue.'],
  };
  report.journal = { revisions: [], events: [], losses: [], samples: [], httpStates: [], questions: [], productGaps: [] };
  Object.assign(report.clocks.fields, { 'journal.atMs': 'session', 'journal.samples.clock': 'session',
    'journal.revisions.passage.startMs,endMs': 'session',
    'passage.metadata.receivedMs,audioStartedMs,visionQueuedMs,visionStartedMs,transcriptPublishedMs,visionPublishedMs': 'session',
    'passage.metadata.audioMs,visionMs,analysisMs,metrics': 'durées produit ; rawNs fournisseur en nanosecondes',
    'journal.httpStates.serverNowMs': 'mural serveur', 'questions.latency': 'durées ; observation sur horloge session' });
}
function createJournal(host, report, writer) {
  const { runtime, clock } = host, session = runtime.session;
  const versions = new Set(), losses = new Set(), gaps = new Map();
  let sealed = false;
  initialize(report);
  function revision(passage, channel) {
    const key = passage.id + ':' + passage.revision;
    if (versions.has(key)) return;
    versions.add(key);
    report.journal.revisions.push({ sessionId: session.id, atMs: clock.now(), channel, passage: structuredClone(passage) });
  }
  const unsubscribe = session.events.subscribe(event => {
    if (sealed || event.sessionId !== session.id) return;
    report.journal.events.push({ ...structuredClone(event), atMs: clock.now() });
    if (['PassageReceived', 'PassageUpdated'].includes(event.type)) {
      const passage = session.memory.passage(event.passageId);
      if (passage?.revision === event.revision) revision(passage, 'session.events');
      else report.diagnostics.push({ code: 'TVLENS_REPLAY_REVISION_UNAVAILABLE', passageId: event.passageId, revision: event.revision });
    }
    if (event.type === 'PassageLost') {
      const key = [event.passageId, event.revision, event.lane].join(':');
      if (!losses.has(key)) { losses.add(key); report.journal.losses.push({ ...structuredClone(event), atMs: clock.now() }); }
    }
    writer.save();
  });
  function sample(beforeClose = false) {
    if (sealed) return;
    const view = session.memory.view(), atMs = clock.now();
    for (const passage of view.passages) revision(passage, 'session.memory.view()');
    for (const kind of ['gaps', 'captureGaps', 'audioGaps', 'visionGaps']) {
      for (const gap of view.coverage[kind]) {
        const key = JSON.stringify([kind, gap]);
        if (!gaps.has(key)) {
          gaps.set(key, true);
          report.journal.productGaps.push({ sessionId: session.id, atMs, kind, ...gap });
        }
      }
    }
    report.consultation = { sessionId: session.id, atMs, beforeClose, channel: 'session.memory.view()',
      clock: view.clock, coverage: view.coverage, losses: view.losses };
    report.journal.samples.push({ sessionId: session.id, atMs, beforeClose, clock: view.clock,
      evidence: { audio: latestEvidence(view.passages, 'audio', view.clock.elapsedMs),
        vision: latestEvidence(view.passages, 'vision', view.clock.elapsedMs) }, losses: view.losses });
    writer.save();
  }
  const sampling = createSampling(host, report, writer, sample);
  return { observeQuestion: sampling.observeQuestion, close() {
    if (sealed) return;
    sample(true);
    sealed = true;
    sampling.close();
    unsubscribe();
  } };
}
module.exports = { createJournal };
