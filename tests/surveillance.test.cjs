const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deferred } = require('./helpers/wait.cjs');
const { Surveillance, COVERAGE_BUCKETS, CLAIM_STATES, claimKey, sameClaim, applyVerdicts, composeLotText, sentences } = require('../core/surveillance.cjs');

// Everything is promise-driven and the clock is injected: no timer, real or fake, is ever armed here.
const flush = async (turns = 300) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };
const passage = (n, transcript, extra = {}) => ({ id: `moment-${n}`, startMs: (n - 1) * 8000, endMs: n * 8000, status: 'ready', audioStatus: 'ready', visionStatus: 'ready', available: true,
  // Cumulative and possibly older than the activation: must never reach a model.
  topicSummary: `CUMUL-${n} qui remonte avant l’activation`, ...extra,
  observation: extra.observation === null ? null : { transcript, summary: '', visual: '', uncertainty: '', ...extra.observation } });
const found = (passageId, quote, statement, extra = {}) => ({ passageId, quote, statement, action: 'verify', kind: 'figure', checkable: true, reason: '', sameAs: null, ...extra });
const page = id => `https://sources.example/${id}`;
const verdict = (claimId, assessment = 'supported', extra = {}) => ({ claimId, assessment, conclusion: `Les sources consultées concordent pour ${claimId}.`,
  sources: assessment === 'insufficient' ? [] : [{ url: page(claimId), title: `Page ${claimId}`, publisher: 'Institut', publishedAt: null, evidence: 'La page donne le même ordre de grandeur.', relation: 'supports' }], limitations: [], ...extra });
const answer = request => ({ summary: '', verdicts: request.claims.map(c => verdict(c.id)), research: { webSearches: request.claims.length, openedUrls: request.claims.map(c => page(c.id)), elapsedMs: 1 } });
// Ports with promises driven by the test, or answering from a rule.
const scripted = rule => { const calls = []; return { calls, detect: async request => { calls.push(request); return { claims: request.passages.flatMap(p => rule(p, request)) }; } }; };
const gatedDetector = () => { const calls = []; return { calls, detect(request) { const gate = deferred(); calls.push({ request, gate }); return gate.promise; } }; };
const gatedResearcher = () => {
  const calls = [], port = { calls, open: 0, maxOpen: 0, verify(request) {
    const gate = deferred(); port.open++; port.maxOpen = Math.max(port.maxOpen, port.open);
    calls.push({ request, gate, done: false }); return gate.promise;
  }, release(reply = answer) { const call = calls.find(c => !c.done); call.done = true; port.open--; call.gate.resolve(reply(call.request)); return call; } };
  return port;
};
const instantResearcher = (reply = answer) => { const calls = []; return { calls, verify: async request => { calls.push(request); return reply(request); } }; };

function harness({ limits = {}, detector, researcher, probe, t0 = 0 } = {}) {
  const h = { clock: 0, elapsedMs: t0, history: [], segments: [], states: [], chatReads: 0 };
  // A host snapshot carries the chat flag; the surveillance must never look at it.
  h.snapshot = () => ({ id: 'session-1', elapsedMs: h.elapsedMs, history: h.history, segments: h.segments, get asking() { h.chatReads++; return true; } });
  h.surveillance = new Surveillance({ detector, researcher, probe, now: () => h.clock, limits: { visionGraceMs: 0, retryDelayMs: 2000, ...limits }, onChange: state => h.states.push(state) });
  h.add = (...passages) => { h.segments.push(...passages); h.elapsedMs = Math.max(h.elapsedMs, ...passages.map(p => p.endMs)); h.surveillance.observe(h.snapshot()); };
  h.state = options => h.surveillance.snapshot(options);
  return h;
}
// The two accounting invariants of the contract, checked on every state the module publishes.
function invariants(state) {
  assert.equal(COVERAGE_BUCKETS.reduce((sum, bucket) => sum + state.coverage[bucket], 0), state.coverage.total, 'every passage after t0 sits in exactly one bucket');
  assert.equal(CLAIM_STATES.reduce((sum, status) => sum + state.counts[status], 0), state.totals.claims, 'every claim sits in exactly one state');
}

test('surveillance reads only what starts after the activation, and no evidence ever contains the future', async () => {
  const detector = scripted(p => ({
    'moment-4': [found('moment-4', 'le chômage est à 7 % en France', 'Selon l’invité, le chômage est à 7 % en France.')],
    'moment-5': [found('moment-5', 'la dette atteint 3 000 milliards', 'Selon l’invité, la dette atteint 3 000 milliards d’euros.'),
      found('moment-5', 'une phrase que personne n’a prononcée', 'Selon l’invité, une phrase jamais prononcée.'),
      found('moment-1', 'avant activation alpha', 'Selon l’invité, un propos tenu avant l’activation.')],
    // A real quote, but of ANOTHER passage of the programme: not evidence for this one.
    'moment-6': [found('moment-6', 'la dette atteint 3 000 milliards', 'Selon l’invité, la dette atteint encore 3 000 milliards.')],
  }[p.id] || []));
  const researcher = instantResearcher();
  const h = harness({ detector, researcher, t0: 20000, limits: { detectBatchPassages: 1 } });
  assert.throws(() => h.surveillance.start({ instruction: 'Vérifie les chiffres.' }, null), /Démarre une session/);
  assert.throws(() => h.surveillance.start({ instruction: '   ' }, h.snapshot()), /consigne/);
  assert.throws(() => h.surveillance.start({ instruction: 'x'.repeat(1501) }, h.snapshot()), /consigne/);
  // Passages 1 and 2 end before t0, passage 3 (16–24 s) straddles it.
  h.segments.push(passage(1, 'avant activation alpha 11 %'), passage(2, 'avant activation beta 22 %'), passage(3, 'à cheval gamma 33 %'));
  const started = h.surveillance.start({ instruction: 'Vérifie les chiffres.' }, h.snapshot());
  assert.equal(started.activation.t0Ms, 20000);
  assert.equal(started.coverage.total, 0);
  h.add(passage(4, 'Il affirme que le chômage est à 7 % en France.'));
  await flush();
  h.add(passage(5, 'Selon lui la dette atteint 3 000 milliards désormais.'));
  await flush();
  h.add(passage(6, 'Le débat continue sur un autre sujet delta.'));
  await flush();

  assert.deepEqual(detector.calls.map(call => call.passages.map(p => p.id)), [['moment-4'], ['moment-5'], ['moment-6']]);
  const sent = JSON.stringify([detector.calls, researcher.calls]);
  for (const forbidden of ['topicSummary', 'CUMUL', 'alpha', 'beta', 'gamma', 'moment-1', 'moment-2', 'moment-3']) assert.ok(!sent.includes(forbidden), `${forbidden} reached a model`);
  // Detection context: passages already read, after t0, that end before the batch starts.
  assert.deepEqual(detector.calls.map(call => call.context.map(p => p.id)), [[], ['moment-4'], ['moment-4', 'moment-5']]);
  for (const call of detector.calls) for (const p of call.context) assert.ok(p.startMs >= 20000 && p.endMs <= call.passages[0].startMs);

  const state = h.state({ full: true });
  assert.deepEqual(state.claims.map(c => [c.id, c.origin.passageId, c.status]), [['claim-1', 'moment-4', 'sourced'], ['claim-2', 'moment-5', 'sourced']]);
  assert.deepEqual(state.metrics.detect.rejected, { unknownPassage: 1, quoteNotFound: 2, invalid: 0, overflow: 0 });
  // A claim's evidence context is frozen at detection: its passage and earlier ones, never a later one.
  assert.deepEqual(state.claims.map(c => c.contextPassageIds), [['moment-4'], ['moment-4', 'moment-5']]);
  assert.ok(!state.claims[0].context.includes('dette') && !state.claims[0].context.includes('delta'));
  assert.ok(state.claims[1].context.includes('chômage') && !state.claims[1].context.includes('delta'));
  const verified = researcher.calls.flatMap(call => call.claims);
  assert.deepEqual(verified.map(c => [c.id, c.startMs, c.endMs, c.context]), state.claims.map(c => [c.id, c.origin.startMs, c.origin.endMs, c.context]));
  assert.equal(state.coverage.total, 3);
  assert.equal(state.coverage.scanned, 3);
  assert.equal(h.chatReads, 0);
  h.states.forEach(invariants);
});

test('a backlog of forty passages is drained oldest first without any silent loss', async () => {
  const detector = scripted(p => { const n = Number(p.id.split('-')[1]); return [found(p.id, `la mesure ${n} coûte ${n * 11} millions`, `Selon le ministre, la mesure ${n} coûte ${n * 11} millions d’euros par an.`)]; });
  const researcher = gatedResearcher();
  const h = harness({ detector, researcher, limits: { verifyConcurrency: 1, verifyBatchClaims: 2, maxQueuedClaims: 4, maxDetectedBacklog: 6 } });
  h.surveillance.start({ instruction: 'Vérifie tous les chiffres.' }, h.snapshot());
  h.add(...Array.from({ length: 40 }, (_, i) => passage(i + 1, `Le ministre annonce que la mesure ${i + 1} coûte ${(i + 1) * 11} millions d’euros par an.`)));
  await flush();

  // Verification is the bottleneck: reading pauses, the unread passages stay counted as pending.
  let state = h.state();
  assert.deepEqual([state.counts.running, state.counts.queued, state.counts.detected], [2, 4, 6]);
  assert.deepEqual([state.coverage.scanned, state.coverage.pending], [12, 28]);
  assert.deepEqual([state.backlog.late, state.backlog.reason, state.activity.state], [true, 'verification', 'late']);
  assert.deepEqual(detector.calls[0].passages.map(p => p.id), ['moment-1', 'moment-2', 'moment-3', 'moment-4', 'moment-5', 'moment-6']);
  h.surveillance.tick(); await flush();
  assert.equal(detector.calls.length, 2, 'detection stays paused under back-pressure');

  let steps = 0;
  while (researcher.calls.some(call => !call.done)) {
    researcher.release(); await flush(); steps++;
    state = h.state();
    invariants(state);
    assert.equal(state.coverage.total, 40);
    assert.ok(state.counts.queued <= 4 && state.counts.running <= 2 && state.activity.running <= 1);
    if (state.coverage.pending) assert.deepEqual([state.backlog.late, typeof state.backlog.reason], [true, 'string']);
  }
  assert.equal(steps, 20);
  assert.equal(researcher.maxOpen, 1, 'one verification lot at a time');
  // First in, first out: lots follow the order of detection, which follows the order of the video.
  assert.deepEqual(researcher.calls.flatMap(call => call.request.claims.map(c => c.id)), Array.from({ length: 40 }, (_, i) => `claim-${i + 1}`));

  const full = h.state({ full: true });
  assert.equal(full.coverage.scanned, 40);
  assert.equal(full.claims.length, 40);
  assert.ok(full.claims.every(c => c.status === 'sourced'));
  assert.deepEqual(new Set(full.claims.map(c => c.origin.passageId)), new Set(Array.from({ length: 40 }, (_, i) => `moment-${i + 1}`)));
  // Even when six passages were read in one call, a claim's context stops at its own passage.
  for (const claim of full.claims) assert.ok(claim.contextPassageIds.every(id => Number(id.split('-')[1]) <= Number(claim.origin.passageId.split('-')[1])));
  assert.deepEqual([full.lots.length, full.overlay.seq, full.metrics.detect.passagesScanned, full.metrics.verify.sourced], [20, 20, 40, 40]);
  // The polled state is bounded and says so: it never passes for the whole registry.
  const compact = h.state();
  assert.deepEqual([compact.lots.length, compact.totals.lots, compact.overlay.cards.length, compact.claims.length, compact.totals.claims], [20, 20, 5, 40, 40]);
  assert.deepEqual([compact.backlog.late, compact.backlog.reason, compact.activity.state], [false, null, 'listening']);
  // What a once-per-second poll needs: activity, counters and cards, without the lists. A card keeps what a screen
  // shows of it; evidence, relation, date and uncertainties are read from the lot, on request.
  const brief = h.state({ brief: true });
  assert.deepEqual([brief.counts, brief.totals, brief.activity, brief.overlay.seq], [compact.counts, compact.totals, compact.activity, compact.overlay.seq]);
  assert.deepEqual(brief.overlay.cards.map(({ sources, ...card }) => card), compact.overlay.cards.map(({ sources, uncertainties, ...card }) => card));
  assert.deepEqual(brief.overlay.cards.map(card => card.sources), compact.overlay.cards.map(card => card.sources.map(({ url, title, publisher }) => ({ url, title, publisher }))));
  assert.ok(compact.overlay.cards.every(card => card.uncertainties.length && card.sources.every(source => source.evidence && source.relation && source.claimIds.length)));
  assert.ok(!('claims' in brief) && !('lots' in brief) && JSON.stringify(brief).length * 3 < JSON.stringify(compact).length);
  assert.ok(h.states.length > 20);
  h.states.forEach(invariants);
  // A passage read for good is not even looked at again: a long session costs nothing per old passage.
  let reads = 0;
  h.surveillance.observe({ ...h.snapshot(), segments: h.segments.map(p => ({ ...p, get observation() { reads++; return p.observation; } })) });
  assert.equal(reads, 0);
});

test('stop cancels what is in flight and ignores late results; a new instruction starts at a new t0 and keeps the registry', async () => {
  const detector = gatedDetector(), researcher = gatedResearcher();
  const h = harness({ detector, researcher, limits: { verifyBatchClaims: 1, detectBatchPassages: 1 } });
  h.surveillance.start({ instruction: 'Vérifie les chiffres.' }, h.snapshot());
  h.add(passage(1, 'Le budget est de 10 millions. La dette atteint 20 millions. Le déficit est de 30 millions.'));
  await flush();
  detector.calls[0].gate.resolve({ claims: [found('moment-1', 'Le budget est de 10 millions', 'Selon lui, le budget est de 10 millions.'),
    found('moment-1', 'La dette atteint 20 millions', 'Selon lui, la dette atteint 20 millions.'), found('moment-1', 'Le déficit est de 30 millions', 'Selon lui, le déficit est de 30 millions.')] });
  await flush();
  h.add(passage(2, 'La croissance est de 2 % cette année.'));
  await flush();
  let state = h.state();
  assert.deepEqual([state.counts.running, state.counts.queued, state.activity.detecting, state.coverage.scanning], [1, 2, true, 1]);

  h.clock = 5000;
  const stopped = h.surveillance.stop('Arrêt demandé.');
  assert.ok(detector.calls[1].request.signal.aborted && researcher.calls[0].request.signal.aborted);
  assert.deepEqual([stopped.enabled, stopped.activity.state, stopped.activation.stopReason, stopped.activation.stoppedAt], [false, 'stopped', 'Arrêt demandé.', 5000]);
  assert.deepEqual(h.state({ full: true }).claims.map(c => [c.status, c.reason, c.finishedAt]), Array(3).fill(['cancelled', 'Arrêt demandé.', 5000]));
  assert.deepEqual([stopped.lots[0].status, stopped.counts.cancelled, stopped.metrics.verify.cancelled], ['cancelled', 3, 3]);
  // The passage that was being read is not lost from the count: it is reported as unread.
  assert.deepEqual([stopped.coverage.total, stopped.coverage.scanned, stopped.coverage.pending, stopped.coverage.stoppedWithPending], [2, 1, 1, 1]);
  invariants(stopped);
  // Results that arrive after the stop belong to nobody.
  detector.calls[1].gate.resolve({ claims: [found('moment-2', 'La croissance est de 2 %', 'Selon lui, la croissance est de 2 %.')] });
  researcher.release();
  await flush();
  const emitted = h.states.length;
  assert.deepEqual(h.state(), stopped);
  assert.deepEqual(h.surveillance.stop('Encore.'), stopped, 'stop is idempotent');
  h.surveillance.tick(); h.surveillance.observe(h.snapshot()); await flush();
  assert.deepEqual([h.states.length, detector.calls.length, researcher.calls.length], [emitted, 2, 1]);
  assert.throws(() => h.surveillance.retry('claim-2'), /Active la surveillance/);

  // Another instruction: a new t0, nothing older is read again, the registry and its numbering go on.
  h.elapsedMs = 100000; h.clock = 6000;
  const restarted = h.surveillance.start({ instruction: 'Vérifie les dates.' }, h.snapshot());
  assert.deepEqual([restarted.activation.id, restarted.activation.t0Ms, restarted.counts.cancelled, restarted.coverage.total], ['act-2', 100000, 3, 0]);
  await flush();
  assert.equal(detector.calls.length, 2, 'the passage left unread by the first activation is before the new t0');
  h.add(passage(20, 'Le traité a été signé en 1957 à Rome.'));
  await flush();
  assert.deepEqual([detector.calls[2].request.instruction, detector.calls[2].request.passages.map(p => p.id), detector.calls[2].request.known], ['Vérifie les dates.', ['moment-20'], []]);
  detector.calls[2].gate.resolve({ claims: [found('moment-20', 'Le traité a été signé en 1957', 'Selon lui, le traité a été signé en 1957 à Rome.', { kind: 'date' })] });
  await flush();
  // A cancelled claim can be put back in the queue by an explicit request, never by itself.
  h.surveillance.retry('claim-2');
  assert.throws(() => h.surveillance.retry('claim-99'), /ne peut pas être relancé/);
  researcher.release(); await flush();
  researcher.release(); await flush();
  state = h.state({ full: true });
  assert.deepEqual(state.claims.map(c => [c.id, c.activationId, c.status]), [['claim-1', 'act-1', 'cancelled'], ['claim-2', 'act-1', 'sourced'], ['claim-3', 'act-1', 'cancelled'], ['claim-4', 'act-2', 'sourced']]);
  assert.deepEqual(state.lots.map(l => [l.id, l.status]), [['lot-1', 'cancelled'], ['lot-2', 'done'], ['lot-3', 'done']]);
  h.states.forEach(invariants);
});

test('different figures are different claims; a repetition adds a mention and is never verified twice', async () => {
  assert.equal(sameClaim('Selon lui, le chômage est à 7 % en France.', 'Selon lui, le chômage est à 9 % en France.'), false);
  assert.equal(sameClaim('Selon lui, le chômage est à 7 % en France.', 'selon lui le chômage est à 7% en France'), true);
  assert.equal(sameClaim('Il annonce sept pour cent de hausse.', 'Il annonce neuf pour cent de hausse.'), false);
  assert.deepEqual(claimKey('1 200 personnes, 3,5 millions d’euros et 17,2 %').numbers, ['1200', '17.2%', '3500000']);
  const said = { 1: ['le chômage est à 7 % en France', 'Selon lui, le chômage est à 7 % en France.'], 2: ['le chômage est à 9 % en France', 'Selon lui, le chômage est à 9 % en France.'],
    3: ['le chômage est à 7 % en France', 'Selon lui, le chômage est à 7 % en France.'] };
  const detector = scripted(p => {
    const n = Number(p.id.split('-')[1]);
    if (said[n]) return [found(p.id, ...said[n])];
    // The detector may claim a duplicate: believed only for a known claim with the same numbers.
    if (n === 4) return [found(p.id, 'le chômage serait de 11 %', 'Selon elle, le chômage serait de 11 % en réalité.', { sameAs: 'claim-2' })];
    if (n === 5) return [found(p.id, 'neuf pour cent, enfin 9 %', 'D’après la ministre, le taux de sans-emploi vaut 9 %.', { sameAs: 'claim-2' })];
    return Array.from({ length: 4 }, (_, i) => found(p.id, `le poste ${i + 1} pèse ${i + 20} millions`, `Selon lui, le poste ${i + 1} pèse ${i + 20} millions.`));
  });
  const researcher = instantResearcher(request => ({ ...answer(request), verdicts: request.claims.map(c => verdict(c.id, 'insufficient')) }));
  const h = harness({ detector, researcher, limits: { maxClaimsPerBatch: 3 } });
  h.surveillance.start({ instruction: 'Vérifie les chiffres.' }, h.snapshot());
  const lines = ['Il dit que le chômage est à 7 % en France.', 'Elle répond que le chômage est à 9 % en France.', 'Il répète que le chômage est à 7 % en France.',
    'Pour elle le chômage serait de 11 % en réalité.', 'Elle redit : neuf pour cent, enfin 9 %.', 'Le poste 1 pèse 20 millions, le poste 2 pèse 21 millions, le poste 3 pèse 22 millions, le poste 4 pèse 23 millions.'];
  for (const [i, line] of lines.entries()) { h.add(passage(i + 1, line)); await flush(); }

  const state = h.state({ full: true });
  assert.deepEqual(state.claims.slice(0, 3).map(c => [c.id, c.statement, c.mentionCount, c.mentions.map(m => m.passageId)]), [
    ['claim-1', 'Selon lui, le chômage est à 7 % en France.', 2, ['moment-1', 'moment-3']],
    ['claim-2', 'Selon lui, le chômage est à 9 % en France.', 2, ['moment-2', 'moment-5']],
    ['claim-3', 'Selon elle, le chômage serait de 11 % en réalité.', 1, ['moment-4']]]);
  assert.deepEqual([state.metrics.detect.duplicates, state.metrics.detect.sameAsRejected], [2, 1]);
  // A paraphrase merged on the detector's word keeps its own wording in the mention.
  assert.deepEqual(state.claims[1].mentions.map(m => m.statement), ['Selon lui, le chômage est à 9 % en France.', 'D’après la ministre, le taux de sans-emploi vaut 9 %.']);
  // The repetition of an already settled claim does not start a second verification.
  assert.equal(researcher.calls.flatMap(call => call.claims).filter(c => c.id === 'claim-1').length, 1);
  assert.equal(state.claims[0].status, 'undetermined');
  // More elements than one reading may return: the surplus is counted and the passage is listed, not dropped quietly.
  assert.equal(state.claims.length, 6);
  assert.equal(state.metrics.detect.rejected.overflow, 1);
  assert.deepEqual(state.gaps.map(g => [g.id, g.bucket]), [['moment-6', 'scanned']]);
  assert.match(state.gaps[0].reason, /non retenu/);
  h.states.forEach(invariants);
});

test('statements one word apart are different claims: each keeps its identifier and its verification, and a merged repetition keeps its wording', async () => {
  // Same figure, or no figure at all, and a single word of difference.
  const apart = [['le chômage des jeunes est à 17 % en France', 'le chômage des seniors est à 17 % en France'],
    ['la France compte 68 millions d’habitants', 'l’Allemagne compte 68 millions d’habitants'],
    ['les exportations ont progressé de 5 % en 2023', 'les importations ont progressé de 5 % en 2023'],
    ['le budget de la défense atteint 50 milliards', 'le budget de la santé atteint 50 milliards'],
    ['la loi a été votée en première lecture', 'la loi a été votée en dernière lecture'],
    ['Paris est la capitale la plus visitée', 'Londres est la capitale la plus visitée']];
  // The same words in another order, a negation, a tense, a named source: other claims as well.
  const alsoApart = [['la France a battu l’Allemagne 2 à 1', 'l’Allemagne a battu la France 2 à 1'], ['le prix passe de 5 à 7 euros', 'le prix passe de 7 à 5 euros'],
    ['le chômage a baissé', 'le chômage n’a pas baissé'], ['il a voté pour la réforme', 'il a voté contre la réforme'], ['le chômage est à 7 %', 'le chômage était à 7 %'], ['le chômage augmente de 5 %', 'le chômage a augmenté de 5 %']];
  for (const [a, b] of [...apart, ...alsoApart]) assert.equal(sameClaim(`Selon lui, ${a}.`, `Selon lui, ${b}.`), false, `${a} / ${b}`);
  assert.equal(sameClaim('Selon l’Insee, le chômage est à 7 %.', 'Selon Eurostat, le chômage est à 7 %.'), false);
  // All but identical: the generic attribution, the punctuation, the spelling of a unit.
  const repeated = 'D’après l’intervenante, le chômage des jeunes est de 17 pour cent en France !';
  assert.equal(sameClaim(`Selon lui, ${apart[0][0]}.`, repeated), true);
  assert.equal(sameClaim('Selon lui, la dette atteint 3 000 milliards d’euros.', 'La dette atteint 3000 milliards d’euros'), true);

  const said = apart.flat();
  const detector = scripted(p => {
    const n = Number(p.id.split('-')[1]);
    // A detector that wrongly calls the second statement of each pair a duplicate of the first is not believed either.
    return [n <= said.length ? found(p.id, said[n - 1], `Selon lui, ${said[n - 1]}.`, { sameAs: n % 2 ? null : `claim-${n - 1}` }) : found(p.id, 'le chômage des jeunes est de 17 pour cent en France', repeated)];
  });
  const researcher = instantResearcher();
  const h = harness({ detector, researcher, limits: { detectBatchPassages: 1 } });
  h.surveillance.start({ instruction: 'Vérifie tous les chiffres.' }, h.snapshot());
  for (const [i, line] of said.entries()) { h.add(passage(i + 1, `Il dit que ${line}.`)); await flush(); }
  h.add(passage(13, 'Elle répète : le chômage des jeunes est de 17 pour cent en France !'));
  await flush();

  const state = h.state({ full: true });
  // Twelve statements, twelve claims: none is absorbed as a "mention" of its neighbour.
  assert.deepEqual(state.claims.map(c => [c.id, c.statement, c.status, c.origin.passageId]), said.map((line, i) => [`claim-${i + 1}`, `Selon lui, ${line}.`, 'sourced', `moment-${i + 1}`]));
  assert.deepEqual(researcher.calls.flatMap(call => call.claims.map(c => c.statement)), said.map(line => `Selon lui, ${line}.`));
  assert.deepEqual([state.metrics.detect.claimsRaw, state.metrics.detect.claimsAccepted, state.metrics.detect.duplicates, state.metrics.detect.sameAsRejected, state.coverage.scanned], [13, 12, 1, 6, 13]);
  // The true repetition is one more mention of the first claim, with the words of that mention.
  assert.deepEqual(state.claims.map(c => c.mentionCount), [2, ...Array(11).fill(1)]);
  assert.deepEqual(state.claims[0].mentions.map(m => [m.passageId, m.statement]), [['moment-1', `Selon lui, ${said[0]}.`], ['moment-13', repeated]]);
  h.states.forEach(invariants);
});

test('a finished lot yields at most one card, limited to claims whose cited page was really opened', async () => {
  const quotes = { A: 'le chômage des jeunes est de 17 %', B: 'la dette publique dépasse 3 000 milliards', C: 'le pays compte 68 millions d’habitants', D: 'la croissance sera de 4 %', E: 'les prix ont doublé en 2 ans',
    F: 'le déficit atteint 12 % du PIB', G: 'le pays compte 2,1 millions de chômeurs' };
  const detector = scripted(p => ({ 'moment-1': ['A', 'B', 'C'], 'moment-2': ['D', 'E'], 'moment-3': ['F', 'G'] })[p.id].map(k => found(p.id, quotes[k], `Selon l’invité, ${quotes[k]}.`)));
  const replies = [request => ({
    summary: 'Première phrase. Deuxième phrase. Troisième phrase. Quatrième phrase. Cinquième phrase.',
    verdicts: [
      verdict('claim-1', 'supported', { conclusion: 'Le dernier chiffre publié par l’Insee est proche, à 17,2 %, mais il porte sur les 15-24 ans. Détail superflu.', limitations: ['Le chiffre de l’Insee porte sur les 15-24 ans.'] }),
      // Presented as sourced by the model, but the cited page was never opened.
      verdict('claim-2', 'supported', { sources: [{ url: 'https://sources.example/jamais-ouverte', title: 'Page', publisher: 'X', publishedAt: null, evidence: 'Texte.', relation: 'supports' }] }),
      verdict('claim-3', 'insufficient', { conclusion: 'Aucune source consultée ne tranche.' })],
    research: { webSearches: 2, openedUrls: [page('claim-1') + '#section-2'], elapsedMs: 9 } }),
  request => ({ summary: 'Rien à dire.', verdicts: [verdict('claim-4', 'insufficient'), verdict('claim-99')], research: { webSearches: 1, openedUrls: [page('claim-99')], elapsedMs: 4 } }),
  // Two sourced claims, and a model that rules true or false and points to a bare address, against its instructions.
  request => ({ summary: 'C’est vrai pour le second chiffre et faux pour le premier. Voir insee.fr pour le détail.',
    verdicts: [verdict('claim-6', 'contradicted', { conclusion: 'C’est faux : la source officielle donne 5,5 % du PIB en 2023.' }),
      verdict('claim-7', 'supported', { conclusion: 'La source officielle publie le même ordre de grandeur, 2,1 millions fin 2023. Le chiffre est donc exact.' })],
    research: { webSearches: 2, openedUrls: [page('claim-6'), page('claim-7')], elapsedMs: 7 } })];
  const researcher = instantResearcher(request => replies[researcher.calls.length - 1](request));
  const h = harness({ detector, researcher, limits: { verifyBatchClaims: 3 } });
  h.surveillance.start({ instruction: 'Vérifie les chiffres.' }, h.snapshot());
  h.add(passage(1, 'Pour lui le chômage des jeunes est de 17 %. La dette publique dépasse 3 000 milliards. Et le pays compte 68 millions d’habitants.'));
  await flush();
  h.elapsedMs = 31000;
  h.add(passage(2, 'Demain la croissance sera de 4 %. Les prix ont doublé en 2 ans.'));
  await flush();

  const state = h.state({ full: true });
  assert.deepEqual(state.claims.map(c => [c.id, c.status, c.reason]), [['claim-1', 'sourced', null], ['claim-2', 'undetermined', 'sources non confirmées'], ['claim-3', 'undetermined', 'preuves insuffisantes'],
    ['claim-4', 'undetermined', 'preuves insuffisantes'], ['claim-5', 'undetermined', 'aucun verdict rendu']]);
  // One card, for the lot that has a sourced claim; the lot without one produces none.
  assert.deepEqual([state.overlay.seq, state.overlay.cards.length, state.lots.map(l => [l.id, l.overlay, l.seq])], [1, 1, [['lot-1', true, 1], ['lot-2', false, null]]]);
  const card = state.overlay.cards[0];
  assert.deepEqual([card.id, card.kind, card.label, card.claimIds], ['lot-1', 'verification', 'Sources consultées', ['claim-1']]);
  // Five sentences from the model, and one of its "sourced" claims was demoted: deterministic text instead.
  assert.equal(card.text, 'Le dernier chiffre publié par l’Insee est proche, à 17,2 %, mais il porte sur les 15-24 ans.');
  assert.ok(sentences(card.text).length <= 3 && card.text.length <= 420 && !/https?:|www\.|\*\*/.test(card.text));
  assert.deepEqual(card.sources.map(s => [s.url, s.claimIds]), [[page('claim-1'), ['claim-1']]]);
  assert.deepEqual(card.origin, [{ claimId: 'claim-1', passageId: 'moment-1', startMs: 0, endMs: 8000, quote: quotes.A }]);
  // Uncertainties survive even when the prose is replaced; no invented true/false verdict anywhere.
  assert.deepEqual(card.uncertainties, ['Le chiffre de l’Insee porte sur les 15-24 ans.', 'Propos relevés dans une transcription automatique : ils peuvent avoir été mal entendus.']);
  assert.deepEqual(card.assessments, [{ claimId: 'claim-1', assessment: 'supported', label: 'Concorde avec les sources' }]);
  assert.ok(!/\b(?:vrai|faux)\b/i.test(JSON.stringify(card)) && !JSON.stringify(card).includes('jamais-ouverte') && !JSON.stringify(card).includes('3 000 milliards'));
  // The undetermined claims stay in the history, each with its video origin; none became a card.
  for (const claim of state.claims.slice(1)) {
    assert.ok(claim.origin.passageId && claim.origin.quote && claim.origin.endMs > claim.origin.startMs && !claim.sources.length);
    assert.ok(!JSON.stringify(state.overlay).includes(claim.id));
  }
  assert.deepEqual(h.state().claims.map(c => [c.id, c.status, c.origin.passageId]).slice(1, 3), [['claim-2', 'undetermined', 'moment-1'], ['claim-3', 'undetermined', 'moment-1']]);
  assert.deepEqual([state.lots[0].undeterminedClaimIds, state.lots[1].sourcedClaimIds, state.lots[1].sources], [['claim-2', 'claim-3'], [], []]);
  assert.match(state.lots[1].text, /^Aucune source consultée ne permet de conclure : 2 affirmations restent indéterminées\.$/);
  assert.deepEqual([state.metrics.verify.missingVerdicts, state.metrics.verify.unknownVerdicts, state.metrics.verify.sourcesAccepted, state.metrics.verify.textFallbacks], [1, 1, 1, 1]);
  assert.equal(state.lots[0].publishedAtMs, 8000);

  // A summary that rules true or false, or that carries an address without its scheme, is not shown; neither is
  // the conclusion that rules. The card says what the remaining source shows and keeps both origins and labels.
  h.add(passage(3, 'Selon lui le déficit atteint 12 % du PIB. Et le pays compte 2,1 millions de chômeurs.'));
  await flush();
  const ruled = h.state({ full: true }), second = ruled.overlay.cards[1];
  assert.deepEqual([ruled.overlay.seq, second.id, second.claimIds, second.assessments.map(a => a.label)], [2, 'lot-3', ['claim-6', 'claim-7'], ['Contredit par les sources', 'Concorde avec les sources']]);
  assert.equal(second.text, 'La source officielle publie le même ordre de grandeur, 2,1 millions fin 2023.');
  // The model really wrote those words (the conclusions of the claims hold them); none reaches the card.
  assert.ok(/faux/.test(ruled.claims[5].conclusion) && /exact/.test(ruled.claims[6].conclusion));
  assert.ok(!/\b(?:vrai|faux|exact|fake)\b|insee\.fr/i.test(JSON.stringify(second)));
  assert.deepEqual([ruled.metrics.verify.textFallbacks, ruled.metrics.verify.sourced], [2, 3]);

  // The same rule, as a pure function: HTTPS only, no credentials, a web search really made.
  const one = [{ id: 'c' }], source = url => ({ url, title: 'T', publisher: 'P', publishedAt: null, evidence: 'E', relation: 'supports' });
  const judge = (url, research) => applyVerdicts(one, { verdicts: [verdict('c', 'mixed', { sources: [source(url)] })], research }).outcomes[0].status;
  assert.equal(judge('https://a.example/p', { webSearches: 1, openedUrls: ['https://a.example/p'] }), 'sourced');
  assert.equal(judge('http://a.example/p', { webSearches: 1, openedUrls: ['http://a.example/p'] }), 'undetermined');
  assert.equal(judge('https://user:pw@a.example/p', { webSearches: 1, openedUrls: ['https://user:pw@a.example/p'] }), 'undetermined');
  assert.equal(judge('https://a.example/p', { webSearches: 0, openedUrls: ['https://a.example/p'] }), 'undetermined');
  assert.throws(() => applyVerdicts(one, { summary: 'x' }), /invalide/);
  // Two or three natural sentences are kept as written; anything outside the bound falls back.
  const conclusions = ['Première conclusion.', 'Deuxième conclusion.', 'Troisième conclusion.', 'Quatrième conclusion.'], fallback = 'Première conclusion. Deuxième conclusion. Troisième conclusion.';
  const kept = 'L’invité annonce 17 % de chômage chez les jeunes. Le dernier chiffre de l’Insee est proche, à 17,2 %, mais il porte sur les 15-24 ans.';
  assert.equal(composeLotText({ summary: kept, conclusions }), kept);
  for (const summary of ['Un. Deux. Trois. Quatre.', 'Voir https://exemple.fr/page pour le détail.', '**Vérifié** : le chiffre est exact.', '- premier point\n- second point', 'x'.repeat(421), '', null,
    // A binary verdict, in the words a model uses for it.
    'C’est vrai. Le ministre a raison.', 'L’affirmation est fausse : la source donne 9 %.', 'C’est exact, le chiffre publié est le même.', 'Fake : la source donne un autre chiffre.',
    'Le chiffre cité est tout à fait correct.', 'Il n’a pas tort : la source donne 7,4 %.',
    // An address without its scheme.
    'Voir insee.fr pour le détail. Le chiffre est proche.', 'Selon data.gouv.fr, le taux est de 7 %.',
    // Four sentences that a unit, a missing space or line breaks must not hide.
    'La tour mesure 330 m. Elle a été construite en 1889. Elle pèse 10 000 tonnes. Elle est à Paris.', 'Premier constat.Deuxième constat.Troisième constat.Quatrième constat.',
    'Premier constat\nDeuxième constat\nTroisième constat\nQuatrième constat'])
    assert.equal(composeLotText({ summary, conclusions }), fallback, String(summary));
  // Still kept as written: a title before a name, a dotted figure, words that only look like a verdict.
  for (const summary of ['M. Dupont annonce 17,2 % de chômage. Le Dr Martin confirme env. 3 millions de personnes.', 'Le taux est de 3.5 % en 2023. La source officielle publie le même chiffre.',
    'Le prix augmente à raison de 3 % par an. La source le confirme exactement, et c’est vraiment proche.'])
    assert.equal(composeLotText({ summary, conclusions }), summary);
  assert.deepEqual(['La tour mesure 330 m. Elle date de 1889.', 'M. Dupont parle. Mme Martin répond.', 'Un\nDeux', 'Un.Deux'].map(text => sentences(text).length), [2, 2, 2, 2]);
  assert.equal(composeLotText({ summary: kept, conclusions, demoted: 1 }), fallback);
  // The fallback leaves out a conclusion that rules or that carries an address; with nothing left it points to the sources.
  assert.equal(composeLotText({ summary: '', conclusions: ['C’est faux : la source donne 9 %.', 'Voir insee.fr.', 'La source publie 9 % pour 2023. C’est donc faux.'] }), 'La source publie 9 % pour 2023.');
  assert.equal(composeLotText({ summary: 'Faux.', conclusions: ['C’est faux.'] }), 'Des sources ont été consultées ; le détail figure dans les sources de ce résultat.');
  assert.ok(composeLotText({ summary: '', conclusions: Array(3).fill('y'.repeat(600) + '.') }).length <= 420);
  h.states.forEach(invariants);
});

test('an adapter that never answers cannot freeze the module: deadline, one retry, then an explicit failed or error state', async () => {
  let healed = false, hang = true;
  const detector = scripted(p => {
    const n = Number(p.id.split('-')[1]);
    return [found(p.id, `le chantier ${n} coûte ${n * 5} millions`, `Selon lui, le chantier ${n} coûte ${n * 5} millions.`)];
  });
  const detect = detector.detect;
  // Ignores its cancellation signal on purpose.
  detector.detect = request => (request.passages[0].id === 'moment-1' && !healed ? (detector.calls.push(request), new Promise(() => {})) : detect(request));
  const researcher = instantResearcher();
  const verify = researcher.verify;
  researcher.verify = request => (hang ? (researcher.calls.push(request), new Promise(() => {})) : verify(request));
  const h = harness({ detector, researcher, limits: { detectBatchPassages: 1, verifyBatchClaims: 1 } });
  h.surveillance.start({ instruction: 'Vérifie les chiffres.' }, h.snapshot());
  h.add(passage(1, 'Il dit que le chantier 1 coûte 5 millions.'), passage(2, 'Puis que le chantier 2 coûte 10 millions.'), passage(3, 'Enfin que le chantier 3 coûte 15 millions.'));
  await flush();
  const step = async ms => { h.clock += ms; h.surveillance.tick(); await flush(); };
  await step(44999);
  assert.deepEqual([detector.calls.length, h.state().coverage.scanning], [1, 1]);
  await step(1);            // detectTimeoutMs reached: the reading is abandoned, one retry is due
  assert.deepEqual([h.state().coverage.pending, h.state().metrics.detect.timeouts, detector.calls.length], [3, 1, 1]);
  await step(2000);         // retry of the oldest passage
  assert.equal(detector.calls.length, 2);
  await step(45000);        // second deadline: explicit failed state, listed with its reason
  let state = h.state();
  const givenUp = [{ id: 'moment-1', startMs: 0, endMs: 8000, bucket: 'failed', reason: 'La lecture des passages a dépassé le délai.', rejected: 0 }];
  assert.deepEqual([state.coverage.failed, state.coverage.pending, state.metrics.detect.timeouts, state.metrics.detect.failures], [1, 2, 2, 2]);
  assert.deepEqual(state.gaps, givenUp);
  await step(2000);         // the next passage is read: reading works, so the passage given up gets one more reading, before the newer one
  state = h.state();
  assert.deepEqual([state.coverage.failed, state.coverage.scanned, state.coverage.scanning, state.coverage.pending, state.counts.running, state.metrics.detect.passagesRevived], [0, 1, 1, 1, 1, 1]);
  assert.deepEqual(detector.calls.map(call => call.passages[0].id), ['moment-1', 'moment-1', 'moment-2', 'moment-1']);
  await step(45000);        // that reading is abandoned too, on its first deadline: failed again, this time for good
  state = h.state();
  assert.deepEqual([state.coverage.failed, state.coverage.pending, state.metrics.detect.timeouts, state.gaps, state.backlog.reason], [1, 1, 3, givenUp, 'detection-failed']);
  await step(2000);         // the following passage moves on, and nothing reads the failed one a third time by itself
  state = h.state();
  assert.deepEqual([state.coverage.failed, state.coverage.scanned, state.counts.running, state.counts.queued, detector.calls.length, state.metrics.detect.passagesRevived], [1, 2, 1, 1, 5, 1]);

  // Same for a verification lot: deadline, one retry, then error; the next lot is not held back.
  await step(73000);        // 120 s after the lot started
  state = h.state();
  assert.deepEqual([state.metrics.verify.timeouts, state.metrics.verify.retries, state.counts.running, state.lots[0].status, state.lots[0].message], [1, 1, 1, 'running', 'Nouvelle tentative…']);
  await step(2000);
  assert.equal(researcher.calls.length, 2);
  await step(14000);        // the passage was given up more than 90 s ago: the lateness left is the verification's, the passage stays counted
  state = h.state({ brief: true });
  assert.deepEqual([state.backlog.late, state.backlog.reason, state.activity.state, state.backlog.passagesFailed, detector.calls.length], [true, 'verification', 'late', 1, 5]);
  hang = false;
  await step(106000);
  state = h.state({ full: true });
  assert.deepEqual(state.claims.map(c => [c.id, c.status, c.error]), [['claim-1', 'error', 'La vérification a dépassé le délai.'], ['claim-2', 'sourced', null]]);
  assert.deepEqual(state.lots.map(l => [l.id, l.status, l.attempts]), [['lot-1', 'error', 2], ['lot-2', 'done', 1]]);
  assert.deepEqual([state.metrics.verify.timeouts, state.metrics.verify.lotsFailed, state.metrics.verify.errors, state.overlay.cards.length], [2, 1, 1, 1]);
  // Both failures can be relaunched on request.
  healed = true;
  h.surveillance.retry('moment-1'); h.surveillance.retry('claim-1');
  await flush();
  state = h.state({ full: true });
  assert.deepEqual([state.coverage.failed, state.coverage.scanned, state.gaps.length], [0, 3, 0]);
  assert.deepEqual(state.claims.map(c => [c.id, c.status]), [['claim-1', 'sourced'], ['claim-2', 'sourced'], ['claim-3', 'sourced']]);
  h.states.forEach(invariants);
});

test('a reading outage is never published as a quiet programme; when reading comes back each passage given up is read once more, late but without hindsight, and what fails again stays counted for good', async () => {
  let down = true;
  // Passages whose reading keeps failing whatever the provider does.
  const broken = new Set();
  const outage = 'Codex n’a pas terminé la réponse : authentification refusée (401).';
  const detector = scripted(p => { const n = Number(p.id.split('-')[1]); return [found(p.id, `le poste ${n} vaut ${n}7 millions`, `Selon lui, le poste ${n} vaut ${n}7 millions.`)]; });
  const detect = detector.detect;
  detector.detect = async request => { if (!down && !request.passages.some(p => broken.has(p.id))) return detect(request); detector.calls.push(request); throw new Error(outage); };
  let stuck = false;
  const researcher = instantResearcher(), verify = researcher.verify;
  researcher.verify = request => (stuck ? new Promise(() => {}) : verify(request));
  const h = harness({ detector, researcher, limits: { detectBatchPassages: 1 } });
  const step = async ms => { h.clock += ms; h.surveillance.tick(); await flush(); };
  const say = async n => { h.add(passage(n, `Le poste ${n} vaut ${n}7 millions.`)); await flush(); };
  const told = () => { const s = h.state({ brief: true }); return [s.activity.state, s.activity.label, s.backlog.reason, s.backlog.passagesFailed, s.backlog.failure]; };
  const read = () => detector.calls.map(call => call.passages.map(p => p.id.split('-')[1]).join('+')).join(' ');
  h.surveillance.start({ instruction: 'Vérifie tous les chiffres.' }, h.snapshot());
  assert.deepEqual(told(), ['listening', 'Surveillance active.', null, 0, null]);

  // The very first failure is told, before the passage is even given up.
  await say(1);
  assert.deepEqual(told(), ['late', 'Lecture des passages en échec.', 'detection-failed', 0, outage]);
  const since = h.states.length;
  await step(2000);
  for (const n of [2, 3, 4, 5]) { await say(n); await step(2000); await step(2000); }
  // Five passages, ten calls, nothing read: the once-per-second state says so by itself, without the lists.
  const brief = h.state({ brief: true });
  assert.deepEqual([detector.calls.length, brief.coverage.failed, brief.coverage.scanned, brief.totals.gaps, brief.error, 'gaps' in brief], [10, 5, 0, 5, null, false]);
  assert.deepEqual([brief.activity, brief.backlog.late], [{ state: 'late', label: 'Lecture des passages en échec : 5 passages non lus.', detecting: false, running: 0, waiting: 0, late: true }, true]);
  assert.deepEqual(told().slice(2), ['detection-failed', 5, outage]);
  // Not once during the outage was the surveillance published as merely listening or reading.
  assert.ok(h.states.length > since && h.states.slice(since).every(s => s.activity.state === 'late' && s.backlog.reason === 'detection-failed'));

  // Reading works again, except for two passages. Nobody asks: the five given up are read once more, oldest
  // first, one attempt each; the two that fail again are given up for good.
  down = false; broken.add('moment-2').add('moment-4');
  await say(6); await step(2000);
  assert.deepEqual(told(), ['late', 'Lecture des passages en échec : 1 passage non lu.', 'detection-failed', 1, outage]);
  await step(2000); await step(2000);
  assert.equal(read(), '1 1 2 2 3 3 4 4 5 5 6 1 2 3 4 5');
  let state = h.state({ full: true });
  assert.deepEqual([state.coverage.scanned, state.coverage.failed, state.coverage.pending, state.counts.sourced, state.metrics.detect.passagesRevived], [4, 2, 0, 4, 5]);
  assert.deepEqual(state.gaps.map(gap => [gap.id, gap.bucket, gap.reason]), [['moment-2', 'failed', outage], ['moment-4', 'failed', outage]]);
  assert.deepEqual(told(), ['late', 'Lecture rétablie : 2 passages n’ont pas pu être lus.', 'detection-failed', 2, outage]);
  // An old passage read late gets what a reading at its own time would have had: as context, passages already
  // read that end before it starts; as known elements, nothing found in a later passage. Passage 6 was read first.
  assert.deepEqual(detector.calls.slice(11).map(call => [call.passages[0].id, call.context.map(p => p.id), call.known.map(k => k.id)]), [
    ['moment-1', [], []], ['moment-2', ['moment-1'], ['claim-2']], ['moment-3', ['moment-1'], ['claim-2']],
    ['moment-4', ['moment-1', 'moment-3'], ['claim-2', 'claim-3']], ['moment-5', ['moment-1', 'moment-3'], ['claim-2', 'claim-3']]]);
  assert.deepEqual(state.claims.map(c => [c.id, c.origin.passageId]), [['claim-1', 'moment-6'], ['claim-2', 'moment-1'], ['claim-3', 'moment-3'], ['claim-4', 'moment-5']]);
  const number = id => Number(id.split('-')[1]);
  for (const claim of state.claims) assert.ok(claim.contextPassageIds.every(id => number(id) <= number(claim.origin.passageId)) && !/poste 6/.test(state.claims[1].context));
  assert.ok(!JSON.stringify(detector.calls.slice(11)).includes('poste 6'), 'a later passage reached a late reading');

  // The second automatic reading never comes: a new passage is read at once, the two failed ones stay as they are.
  await say(7); await step(2000);
  assert.equal(read(), '1 1 2 2 3 3 4 4 5 5 6 1 2 3 4 5 7');
  await step(85999);        // the last passage was given up 89 999 ms ago
  assert.equal(told()[2], 'detection-failed');
  await step(1);
  // No longer late, still said: the once-per-second state keeps counting what was never read.
  assert.deepEqual(told(), ['listening', 'Surveillance active.', null, 2, null]);
  state = h.state({ brief: true });
  assert.deepEqual([h.states.at(-1).activity.state, h.states.at(-1).backlog.passagesFailed, state.coverage.failed, state.totals.gaps, detector.calls.length], ['listening', 2, 2, 2, 17]);

  // A second outage while a verification is stuck, then a programme on pause. No passage was given up recently
  // and a claim is late, but the last reading failed: that is told first.
  stuck = true;
  await say(8);
  down = true;
  await say(9); await step(2000); await step(300000);
  assert.deepEqual([h.state().counts.running, h.state().claims.at(-1).late], [1, true]);
  assert.deepEqual(told(), ['late', 'Lecture des passages en échec : 3 passages non lus.', 'detection-failed', 3, outage]);
  // A passage that failed twice is read again on request only. That reading succeeds, so the passage of the
  // second outage gets its own automatic reading; only then is nothing left unread.
  down = false; stuck = false; broken.clear();
  h.surveillance.retry('moment-2'); await flush();
  assert.throws(() => h.surveillance.retry('moment-9'), /n’est pas en échec/);
  h.surveillance.retry('moment-4'); await flush();
  assert.equal(read(), '1 1 2 2 3 3 4 4 5 5 6 1 2 3 4 5 7 8 9 9 2 9 4');
  assert.deepEqual(told().slice(2), ['verification', 0, null]);
  await step(2000);         // the stuck lot gets its retry, the claims read meanwhile follow
  const healed = h.state();
  assert.deepEqual(told(), ['listening', 'Surveillance active.', null, 0, null]);
  assert.deepEqual([healed.coverage.failed, healed.coverage.scanned, healed.counts.sourced, healed.gaps.length, healed.metrics.detect.passagesRevived], [0, 9, 9, 0, 6]);
  h.states.forEach(invariants);
});

test('a signal is a video observation with its interval: never a web verification, never an overlay card', async () => {
  const signal = (passageId, quote, statement) => found(passageId, quote, statement, { action: 'signal', kind: 'other', checkable: false });
  const detector = scripted(p => (p.id === 'moment-1'
    ? [signal(p.id, 'la réforme des retraites', 'Le plateau aborde la réforme des retraites.'), signal(p.id, 'Les syndicats appellent à la grève mardi', 'Les syndicats appellent à la grève mardi contre la réforme.')]
    : [signal(p.id, 'La réforme des retraites', 'Le plateau aborde la réforme des retraites.'),
      found(p.id, 'coûterait 12 milliards', 'Selon l’invité, la réforme des retraites coûterait 12 milliards.'),
      found(p.id, 'elle ne passera jamais', 'Selon l’invité, la réforme ne passera jamais.', { kind: 'other', checkable: false, reason: 'Prédiction.' })]));
  const researcher = instantResearcher();
  const h = harness({ detector, researcher });
  h.surveillance.start({ instruction: 'Préviens-moi quand ils parlent des retraites.' }, h.snapshot());
  h.add(passage(1, 'On passe maintenant à la réforme des retraites. Les syndicats appellent à la grève mardi.'));
  await flush();
  h.add(passage(2, 'La réforme des retraites coûterait 12 milliards. À mon avis elle ne passera jamais.'));
  await flush();

  const state = h.state({ full: true });
  assert.deepEqual(state.claims.map(c => [c.id, c.action, c.status, c.reason, c.mentionCount]), [['claim-1', 'signal', 'noted', null, 2], ['claim-2', 'signal', 'noted', null, 1],
    ['claim-3', 'verify', 'sourced', null, 1], ['claim-4', 'verify', 'undetermined', 'non vérifiable', 1]]);
  assert.deepEqual([state.counts.noted, state.counts.sourced, state.counts.undetermined, state.claims[3].note], [2, 1, 1, 'Prédiction.']);
  invariants(state);
  // The signals of one detection call form one lot; a repeated signal adds a mention, not a second lot.
  assert.deepEqual(state.lots.map(l => [l.id, l.kind, l.claimIds]), [['lot-1', 'signal', ['claim-1', 'claim-2']], ['lot-2', 'verification', ['claim-3']]]);
  const lot = state.lots[0];
  assert.deepEqual([lot.sources, lot.overlay, lot.seq, lot.sourcedClaimIds, 'assessments' in lot, 'assessment' in lot], [[], false, null, [], false, false]);
  assert.deepEqual(lot.origin, [{ claimId: 'claim-1', passageId: 'moment-1', startMs: 0, endMs: 8000, quote: 'la réforme des retraites' },
    { claimId: 'claim-2', passageId: 'moment-1', startMs: 0, endMs: 8000, quote: 'Les syndicats appellent à la grève mardi' }]);
  assert.equal(lot.text, 'Le plateau aborde la réforme des retraites. Les syndicats appellent à la grève mardi contre la réforme.');
  // The overlay holds sourced web verifications only; signals travel apart, typed, without source or verdict.
  assert.deepEqual(state.overlay.cards.map(c => [c.id, c.kind]), [['lot-2', 'verification']]);
  assert.deepEqual(state.signals.cards.map(c => [c.id, c.kind, c.label, c.seq, c.sources, 'assessments' in c]), [['lot-1', 'signal', 'Repéré dans la vidéo', 1, [], false]]);
  assert.deepEqual(state.signals.cards[0].origin.map(o => [o.passageId, o.startMs, o.endMs]), [['moment-1', 0, 8000], ['moment-1', 0, 8000]]);
  assert.deepEqual([state.signals.cards[0].interval, state.overlay.cards[0].interval], [{ startMs: 0, endMs: 8000 }, { startMs: 8000, endMs: 16000 }]);
  assert.ok(!/https?:/.test(JSON.stringify(state.signals)));
  // Only the checkable claim was sent to the web.
  assert.deepEqual(researcher.calls.map(call => call.claims.map(c => c.id)), [['claim-3']]);
  h.states.forEach(invariants);
});

test('words first: a partial passage is read without waiting for vision, which then gets one second reading at most', async () => {
  const detector = scripted(p => [
    ...(p.transcript.includes('chômage') ? [found(p.id, p.transcript.replace(/\.$/, ''), `Selon elle, ${p.transcript.toLowerCase()}`)] : []),
    ...(p.visual.includes('dette') ? [found(p.id, 'dette publique à 3 000 milliards', 'Un bandeau affiche une dette publique à 3 000 milliards.')] : [])]);
  const researcher = instantResearcher();
  const h = harness({ detector, researcher, limits: { visionGraceMs: 10000 } });
  h.surveillance.start({ instruction: 'Vérifie les chiffres.' }, h.snapshot());
  // Words published, vision still waiting (as when a question withholds the visual lane).
  const first = passage(1, 'Le chômage est tombé à 7 % ce trimestre.', { status: 'partial', visionStatus: 'queued' });
  h.add(first);
  await flush();
  assert.deepEqual([detector.calls.length, h.state().coverage.waiting], [0, 1]);
  h.clock = 9999; h.surveillance.tick(); await flush();
  assert.equal(detector.calls.length, 0);
  h.clock = 10000; h.surveillance.tick(); await flush();
  assert.deepEqual([detector.calls.length, detector.calls[0].passages[0].visual, h.state().coverage.scanned, h.state().coverage.textOnly, h.state().totals.claims], [1, '', 1, 1, 1]);
  // The description arrives afterwards: one second reading, with the image text this time.
  Object.assign(first, { status: 'ready', visionStatus: 'ready' });
  Object.assign(first.observation, { visual: 'Bandeau : dette publique à 3 000 milliards', summary: 'Un plateau de débat.' });
  h.surveillance.observe(h.snapshot());
  // The passage changes again while it is being read for the second time, and once more afterwards.
  first.observation.summary = 'Une autre formulation du résumé.';
  h.surveillance.observe(h.snapshot()); await flush();
  assert.deepEqual([detector.calls.length, detector.calls[1].passages[0].visual, detector.calls[1].known.length], [2, 'Bandeau : dette publique à 3 000 milliards', 1]);
  first.observation.summary = 'Une troisième formulation.';
  h.surveillance.observe(h.snapshot()); h.surveillance.tick(); await flush();
  assert.equal(detector.calls.length, 2, 'never a third reading');
  let state = h.state({ full: true });
  // The words read twice are one mention, and the figure shown on screen is a new claim.
  assert.deepEqual(state.claims.map(c => [c.id, c.mentionCount, c.origin.field]), [['claim-1', 1, 'transcript'], ['claim-2', 1, 'visual']]);
  assert.deepEqual([state.coverage.scanned, state.coverage.rescan, state.coverage.textOnly, state.metrics.detect.rescans, state.metrics.detect.passagesScanned], [1, 0, 0, 1, 1]);
  // Vision skipped for good: settled, read at once on its words. Silence and failures are counted without a model call.
  h.add(passage(2, 'Le chômage est remonté à 8 % selon elle.', { status: 'partial', visionStatus: 'skipped' }), passage(3, ''), passage(4, '', { status: 'error', observation: null }));
  await flush();
  state = h.state();
  assert.deepEqual([detector.calls.length, detector.calls[2].passages.map(p => p.id)], [3, ['moment-2']]);
  assert.deepEqual([state.coverage.total, state.coverage.scanned, state.coverage.empty, state.coverage.unscannable, state.metrics.detect.emptySkipped], [4, 2, 1, 1, 1]);
  assert.deepEqual(state.gaps, [{ id: 'moment-4', startMs: 24000, endMs: 32000, bucket: 'unscannable', reason: 'Analyse du passage en erreur.', rejected: 0 }]);
  h.states.forEach(invariants);
  // Le drapeau du chat n'est jamais lu par la surveillance.
  assert.equal(h.chatReads, 0);
});

test('a busy chat never suspends the surveillance: the probe only counts the overlap, in metrics of its own', async () => {
  const run = async probe => {
    const detector = scripted(p => [found(p.id, 'le chômage est à 7 %', 'Selon lui, le chômage est à 7 % en France.')]), researcher = instantResearcher();
    const h = harness({ detector, researcher, probe });
    h.surveillance.start({ instruction: 'Vérifie les chiffres.' }, h.snapshot());
    h.add(passage(1, 'Il assure que le chômage est à 7 % en France.'));
    h.clock = 400;
    await flush();
    return h.state();
  };
  const busy = await run(() => ({ chatBusy: true }));
  assert.deepEqual([busy.counts.sourced, busy.overlay.cards.length, busy.metrics.overlap], [1, 1, { lotsStartedDuringChat: 1, detectsDuringChat: 1 }]);
  const broken = await run(() => { throw new Error('sonde en panne'); });
  assert.deepEqual([broken.counts.sourced, broken.metrics.overlap, broken.error], [1, { lotsStartedDuringChat: 0, detectsDuringChat: 0 }, null]);
  const alone = await run(undefined);
  assert.deepEqual([alone.counts.sourced, 'overlap' in alone.metrics], [1, false]);
  // Its own timings, in its own block: nothing here is shared with the chat's job metrics.
  assert.deepEqual(Object.keys(alone.metrics), ['detect', 'verify']);
  assert.equal(alone.metrics.verify.claimToResultMs.n, 1);
  // A reversible setting trades delay for provider calls: readings spaced out, passages grouped, none skipped.
  const detector = scripted(() => []), h = harness({ detector, researcher: instantResearcher(), limits: { detectIntervalMs: 15000 } });
  h.surveillance.start({ instruction: 'Vérifie les chiffres.' }, h.snapshot());
  for (const n of [1, 2, 3]) { h.clock = (n - 1) * 8000; h.add(passage(n, `Le chantier ${n} coûte ${n * 5} millions.`)); await flush(); }
  assert.deepEqual([detector.calls.map(call => call.passages.map(p => p.id)), h.state().coverage.scanned], [[['moment-1'], ['moment-2', 'moment-3']], 3]);
  assert.throws(() => new Surveillance({ limits: { verifyConcurrency: 4 } }), /verifyConcurrency/);
  assert.throws(() => new Surveillance({ limits: { verifyTimeoutMs: 300001 } }), /verifyTimeoutMs/);
  assert.throws(() => new Surveillance({ limits: { frequencySeconds: 30 } }), /inconnu/);
});

test('a saved registry is reopened read-only: nothing is relaunched, and an explicit start resumes its numbering', async () => {
  const detector = gatedDetector(), researcher = gatedResearcher();
  const h = harness({ detector, researcher, limits: { verifyBatchClaims: 1, detectBatchPassages: 1 } });
  h.surveillance.start({ instruction: 'Vérifie les chiffres.' }, h.snapshot());
  h.add(passage(1, 'Le budget est de 10 millions. La dette atteint 20 millions. Le déficit est de 30 millions.'));
  await flush();
  detector.calls[0].gate.resolve({ claims: [found('moment-1', 'Le budget est de 10 millions', 'Selon lui, le budget est de 10 millions.'),
    found('moment-1', 'La dette atteint 20 millions', 'Selon lui, la dette atteint 20 millions.'), found('moment-1', 'Le déficit est de 30 millions', 'Selon lui, le déficit est de 30 millions.')] });
  await flush();
  researcher.release(); await flush();
  h.add(passage(2, 'La croissance est de 2 % cette année.'));
  await flush();
  h.clock = 7000;
  // What a host writes to disk while work is still moving: one sourced, one running, one queued, one passage being read.
  const saved = JSON.parse(JSON.stringify(h.state({ full: true })));
  assert.deepEqual([saved.counts.sourced, saved.counts.running, saved.counts.queued, saved.coverage.scanning], [1, 1, 1, 1]);
  assert.deepEqual(structuredClone(h.state()), h.state());

  const calls = [];
  const reopened = new Surveillance({ now: () => 99000, detector: { detect: async () => { calls.push('detect'); return { claims: [] }; } }, researcher: { verify: async request => { calls.push('verify'); return answer(request); } } });
  const state = reopened.restore(saved);
  assert.deepEqual([state.enabled, state.restored, state.activity.state, state.activation.stopReason, state.activation.stoppedAt], [false, true, 'stopped', 'Interrompue par la fermeture.', 7000]);
  assert.deepEqual(reopened.snapshot({ full: true }).claims.map(c => [c.id, c.status, c.reason]), [['claim-1', 'sourced', null], ['claim-2', 'cancelled', 'Interrompue par la fermeture.'], ['claim-3', 'cancelled', 'Interrompue par la fermeture.']]);
  assert.deepEqual(state.lots.map(l => [l.id, l.status]), [['lot-1', 'done'], ['lot-2', 'cancelled']]);
  assert.deepEqual(state.overlay, saved.overlay);
  assert.deepEqual([state.coverage.total, state.coverage.scanned, state.coverage.pending, state.coverage.stoppedWithPending], [2, 1, 1, 1]);
  invariants(state);
  reopened.tick(); reopened.observe({ id: 'session-1', elapsedMs: 50000, history: [], segments: [passage(9, 'La dette atteint 40 millions.')] });
  await flush();
  assert.deepEqual(calls, []);
  assert.throws(() => reopened.retry('claim-2'), /Active la surveillance/);
  assert.equal(new Surveillance({}).restore(null).activity.state, 'idle');
  // Capture resumed and surveillance explicitly restarted on the same session: identifiers stay unique.
  const restarted = reopened.start({ instruction: 'Vérifie les chiffres.' }, { id: 'session-1', elapsedMs: 60000, history: [], segments: [] });
  assert.deepEqual([restarted.activation.id, restarted.restored, restarted.totals.claims, restarted.coverage.total], ['act-2', false, 3, 0]);
  reopened.detector.detect = async request => ({ claims: [found(request.passages[0].id, 'La dette atteint 40 millions', 'Selon lui, la dette atteint 40 millions.')] });
  reopened.observe({ id: 'session-1', elapsedMs: 80000, history: [], segments: [passage(9, 'La dette atteint 40 millions.')] });
  await flush();
  assert.deepEqual(reopened.snapshot({ full: true }).claims.map(c => [c.id, c.status]).slice(-1), [['claim-4', 'sourced']]);
  assert.deepEqual(reopened.snapshot().lots.map(l => l.id), ['lot-1', 'lot-2', 'lot-3']);
});

test('an answer as long as one answer may be is not a complete reading: passages read together are read again one by one, and a quote belongs to the passage it names', async () => {
  // Eight elements over six passages, for answers of four elements at most.
  const said = { 1: ['le plan 1 coûte 11 millions'], 2: ['le plan 2 coûte 22 millions', 'la taxe 2 rapporte 20 millions'], 3: ['le plan 3 coûte 33 millions'], 4: ['le plan 4 coûte 44 millions'],
    5: ['le plan 5 coûte 55 millions', 'la taxe 5 rapporte 50 millions'], 6: ['le plan 6 coûte 66 millions'], 7: ['le maire promet 300 logements'], 8: ['la région finance 45 lycées'],
    9: ['le poste A pèse 1 million', 'le poste B pèse 2 millions', 'le poste C pèse 3 millions', 'le poste D pèse 4 millions', 'le poste E pèse 5 millions'] };
  const line = n => `Il annonce que ${said[n].join(', que ')}.`, calls = [];
  // A model that obeys its instructions: elements in the order of the programme, and never more than the bound it was given.
  const detector = { calls, detect: async request => {
    calls.push(request);
    const claims = request.passages.flatMap(p => said[p.id.split('-')[1]].map(quote => found(p.id, quote, `Selon lui, ${quote}.`)));
    // In the answer for passages 7 and 8 together: a real quote, of passage 8, attributed to passage 7.
    if (request.passages.length === 2) claims.splice(1, 0, found('moment-7', said[8][0], 'Selon lui, la région finance 45 lycées neufs.'));
    return { claims: claims.slice(0, request.maxClaims) };
  } };
  const researcher = instantResearcher();
  const h = harness({ detector, researcher, limits: { maxClaimsPerBatch: 4 } });
  const read = () => calls.map(call => call.passages.map(p => p.id.split('-')[1]).join('+')).join(' ');
  h.surveillance.start({ instruction: 'Vérifie tous les chiffres.' }, h.snapshot());
  h.add(...[1, 2, 3, 4, 5, 6].map(n => passage(n, line(n))));
  await flush(1500);
  let state = h.state({ full: true });
  // The detector is given the bound the validation applies, and the catch-up answer that reached it is followed by six readings.
  assert.deepEqual([read(), calls.every(call => call.maxClaims === 4)], ['1+2+3+4+5+6 1 2 3 4 5 6', true]);
  // Eight elements said, eight claims: the four the first answer had no room for were not lost with it.
  assert.deepEqual(state.claims.map(c => [c.id, c.origin.passageId, c.origin.quote, c.status, c.mentionCount]),
    [[1, 0], [2, 0], [2, 1], [3, 0], [4, 0], [5, 0], [5, 1], [6, 0]].map(([n, k], i) => [`claim-${i + 1}`, `moment-${n}`, said[n][k], 'sourced', 1]));
  assert.deepEqual([state.coverage.scanned, state.metrics.detect.readingsAtBound, state.metrics.detect.passagesReread, state.metrics.detect.duplicates, state.metrics.detect.passagesScanned, state.gaps, state.totals.rejected], [6, 1, 6, 4, 6, [], 0]);
  // After the full answer none of its passages counted as read, and no published state ever showed the six read with fewer than eight claims.
  assert.ok(h.states.some(s => s.totals.claims === 4 && s.coverage.scanned === 0 && s.coverage.pending + s.coverage.scanning === 6));
  assert.ok(h.states.every(s => s.coverage.scanned < 6 || s.totals.claims === 8));
  // Found twice, verified once.
  assert.deepEqual(researcher.calls.flatMap(call => call.claims.map(c => c.id)), state.claims.map(c => c.id));

  // One answer for two passages, below the bound: the quote found in passage 8 does not make a claim of passage 7.
  h.add(passage(7, line(7)), passage(8, line(8)));
  await flush(1500);
  state = h.state({ full: true });
  assert.equal(read(), '1+2+3+4+5+6 1 2 3 4 5 6 7+8');
  assert.deepEqual(state.claims.slice(8).map(c => [c.origin.passageId, c.origin.quote, c.statement]), [['moment-7', said[7][0], `Selon lui, ${said[7][0]}.`], ['moment-8', said[8][0], `Selon lui, ${said[8][0]}.`]]);
  assert.deepEqual(state.gaps, [{ id: 'moment-7', startMs: 48000, endMs: 56000, bucket: 'scanned', reason: '1 élément relevé puis écarté : citation introuvable dans le passage (1).', rejected: 1 }]);

  // Read alone and still as long as an answer may be: nothing smaller can be asked, so the passage says it.
  h.add(passage(9, line(9)));
  await flush(1500);
  state = h.state({ full: true });
  assert.deepEqual([read().slice(-2), state.claims.length, state.coverage.scanned, state.metrics.detect.readingsAtBound, state.metrics.detect.passagesReread], [' 9', 14, 9, 2, 6]);
  assert.deepEqual(state.gaps.at(-1), { id: 'moment-9', startMs: 64000, endMs: 72000, bucket: 'scanned', reason: 'Lecture possiblement incomplète : 4 éléments rendus, le maximum d’une réponse.', rejected: 0 });
  const { gaps, rejected } = h.state({ brief: true }).totals;
  assert.deepEqual([gaps, rejected], [2, 1]);
  h.states.forEach(invariants);
});

test('an element the detector raised and validation dropped leaves a trace on its passage, in the polled counters and in the registry', async () => {
  const detector = scripted(p => ({
    // "pour cent" for "%": one typographic variation in the quote, and a real claim does not enter the registry.
    'moment-1': [found('moment-1', 'le chômage est à 7 pour cent en France', 'Selon lui, le chômage est à 7 % en France.'), found('moment-1', 'la dette atteint 3 000 milliards', 'Selon lui, la dette atteint 3 000 milliards d’euros.')],
    // An unknown kind, a passage that is not the one being read, and something that is not even an element.
    'moment-2': [found('moment-2', 'la croissance sera de 4 %', 'Selon lui, la croissance sera de 4 %.', { kind: 'rumeur' }), found('moment-9', 'la croissance sera de 4 %', 'Selon lui, la croissance sera de 4 % demain.'), null],
  }[p.id] || []));
  const h = harness({ detector, researcher: instantResearcher(), limits: { detectBatchPassages: 1 } });
  h.clock = 500;
  h.surveillance.start({ instruction: 'Vérifie tous les chiffres.' }, h.snapshot());
  for (const [i, line] of ['Il dit que le chômage est à 7 % en France et que la dette atteint 3 000 milliards.', 'Demain la croissance sera de 4 %.', 'On passe à la météo de demain.'].entries()) { h.add(passage(i + 1, line)); await flush(); }
  const state = h.state({ full: true });
  // The passages are read; the two that lost an element say how many, and why.
  assert.deepEqual([state.claims.map(c => c.statement), state.coverage.scanned], [['Selon lui, la dette atteint 3 000 milliards d’euros.'], 3]);
  assert.deepEqual(h.state().gaps, [
    { id: 'moment-1', startMs: 0, endMs: 8000, bucket: 'scanned', reason: '1 élément relevé puis écarté : citation introuvable dans le passage (1).', rejected: 1 },
    { id: 'moment-2', startMs: 8000, endMs: 16000, bucket: 'scanned', reason: '3 éléments relevés puis écartés : passage cité hors de cette lecture (1), élément invalide (2).', rejected: 3 }]);
  // The once-per-second state has no list, and still counts them.
  const brief = h.state({ brief: true });
  assert.deepEqual([brief.totals, 'gaps' in brief], [{ claims: 1, lots: 1, gaps: 2, rejected: 4 }, false]);
  // The registry keeps what each dropped element said.
  const none = { unknownPassage: 0, quoteNotFound: 0, invalid: 0 }, growth = 'Selon lui, la croissance sera de 4 %';
  assert.deepEqual(state.passages.map(p => [p.id, p.rejected, p.rejects]), [
    ['moment-1', { ...none, quoteNotFound: 1 }, [{ cause: 'quoteNotFound', statement: 'Selon lui, le chômage est à 7 % en France.', quote: 'le chômage est à 7 pour cent en France', at: 500 }]],
    ['moment-2', { ...none, unknownPassage: 1, invalid: 2 }, [{ cause: 'invalid', statement: `${growth}.`, quote: 'la croissance sera de 4 %', at: 500 },
      { cause: 'unknownPassage', statement: `${growth} demain.`, quote: 'la croissance sera de 4 %', at: 500 }, { cause: 'invalid', statement: '', quote: '', at: 500 }]],
    ['moment-3', none, []]]);
  // A reopened registry still says it; one saved before these notes existed is read as having none.
  const saved = JSON.parse(JSON.stringify(state));
  const reopened = new Surveillance({}).restore(saved);
  assert.deepEqual([reopened.gaps, reopened.totals.rejected], [h.state().gaps, 4]);
  const older = { ...saved, passages: saved.passages.map(({ rejected, rejects, alone, split, revived, truncated, rescanError, ...entry }) => entry) };
  assert.deepEqual(new Surveillance({}).restore(older).gaps.map(gap => [gap.id, gap.rejected]), [['moment-1', 0], ['moment-2', 0]]);

  // Two passages read together and an element nobody can place: each is read again alone, and the counter keeps the element.
  const together = scripted((p, request) => (request.passages.length > 1 && p.id === 'moment-1' ? [found('moment-99', 'une phrase sans passage', 'Selon lui, une phrase que rien ne situe.')]
    : [found(p.id, `le lot ${p.id.at(-1)} vaut 5 millions`, `Selon lui, le lot ${p.id.at(-1)} vaut 5 millions.`)]));
  const g = harness({ detector: together, researcher: instantResearcher() });
  g.surveillance.start({ instruction: 'Vérifie tous les chiffres.' }, g.snapshot());
  g.add(passage(1, 'Le lot 1 vaut 5 millions.'), passage(2, 'Le lot 2 vaut 5 millions.'));
  await flush(600);
  const after = g.state({ full: true });
  assert.deepEqual([together.calls.map(call => call.passages.map(p => p.id.at(-1)).join('+')), after.claims.map(c => c.origin.passageId), after.metrics.detect.passagesReread, after.totals.rejected, after.coverage.scanned],
    [['1+2', '1', '2'], ['moment-2', 'moment-1'], 2, 1, 2]);
  [...h.states, ...g.states].forEach(invariants);
});

test('a full registry stops the reading and says so: the cursor no longer moves and the unread passages stay counted', async () => {
  const detector = scripted(p => { const n = p.id.split('-')[1]; return [found(p.id, `le site ${n} emploie ${n}00 personnes`, `Selon lui, le site ${n} emploie ${n}00 personnes.`)]; });
  const h = harness({ detector, researcher: instantResearcher(), limits: { maxClaims: 3, detectBatchPassages: 1 } });
  const say = async n => { h.add(passage(n, `Le site ${n} emploie ${n}00 personnes.`)); await flush(); };
  h.surveillance.start({ instruction: 'Vérifie tous les chiffres.' }, h.snapshot());
  for (const n of [1, 2]) await say(n);
  assert.deepEqual([h.state().backlog.reason, h.state().activity.state], [null, 'listening']);
  for (const n of [3, 4, 5]) await say(n);
  let state = h.state({ brief: true });
  assert.deepEqual([detector.calls.length, state.totals.claims, state.counts.sourced, state.coverage.scanned, state.coverage.pending, state.coverage.scannedThroughMs], [3, 3, 3, 3, 2, 24000]);
  assert.deepEqual([state.activity.state, state.activity.label, state.backlog.late, state.backlog.reason, state.backlog.passagesPending],
    ['late', 'Registre plein : les nouveaux passages ne sont plus lus.', true, 'registry-full', 2]);
  // Neither time nor a new passage moves the cursor: everything after it stays pending, and counted.
  h.clock += 600000; h.surveillance.tick(); await flush();
  await say(6);
  state = h.state({ brief: true });
  assert.deepEqual([detector.calls.length, state.coverage.scannedThroughMs, state.coverage.pending, state.backlog.reason, state.totals.claims, state.activity.state], [3, 24000, 3, 'registry-full', 3, 'late']);
  // The registry belongs to the session: another instruction does not empty it, and is told the same.
  h.surveillance.start({ instruction: 'Vérifie les dates.' }, h.snapshot());
  await say(7);
  state = h.state({ brief: true });
  assert.deepEqual([detector.calls.length, state.activation.id, state.coverage.total, state.coverage.pending, state.backlog.reason], [3, 'act-2', 1, 1, 'registry-full']);
  h.states.forEach(invariants);
});

test('the polled states stay bounded and say so: sixty claims and twenty lots at most, exact totals, and cards cut down to what a screen shows', async () => {
  // Synthetic data of realistic length: statements of 200 to 300 characters, three claims and three sources per lot.
  const topic = n => `le dispositif d’aide numéro ${n} a coûté ${n * 13 + 7} millions d’euros aux finances publiques l’an dernier, soit nettement plus que ce que prévoyait la loi de finances initiale votée par le Parlement, et bien davantage que les programmes comparables des pays voisins`;
  const summary = 'Les trois montants cités se retrouvent dans les documents budgétaires publiés par le ministère, avec des écarts de quelques millions selon l’année retenue. '
    + 'Le rapport annuel de la Cour des comptes donne des ordres de grandeur comparables, mais sur un périmètre un peu plus large. Les chiffres viennent d’une transcription automatique et peuvent avoir été mal entendus.';
  const link = id => `https://www.budget.example/rapports/2025/execution-des-depenses-publiques/${id}`;
  const researcher = instantResearcher(request => ({ summary,
    verdicts: request.claims.map(c => ({ claimId: c.id, assessment: 'supported',
      conclusion: `Le montant annoncé concorde avec le rapport public consulté pour ${c.id}, qui donne un chiffre voisin sur le même exercice budgétaire et le même périmètre de dépenses.`,
      sources: [{ url: link(c.id), title: `Rapport annuel sur l’exécution des dépenses publiques, fiche ${c.id}`, publisher: 'Ministère du Budget', publishedAt: '2025-09-30', relation: 'supports',
        evidence: 'La fiche détaille les crédits consommés et donne un montant proche de celui cité, pour le même exercice ; elle précise que le périmètre inclut les dépenses de gestion, ce qui explique l’écart avec le chiffre annoncé à l’antenne.' }],
      limitations: ['Le périmètre du rapport inclut les dépenses de gestion, que l’intervenant ne mentionne pas.'] })),
    research: { webSearches: request.claims.length, openedUrls: request.claims.map(c => link(c.id)), elapsedMs: 1 } }));
  const detector = scripted(p => { const n = Number(p.id.split('-')[1]); return [found(p.id, `le dispositif d’aide numéro ${n} a coûté ${n * 13 + 7} millions d’euros`, `Selon l’intervenant, ${topic(n)}.`)]; });
  const h = harness({ detector, researcher });
  h.surveillance.start({ instruction: 'Je compte sur toi pour vérifier tous les chiffres qui sont annoncés.' }, h.snapshot());
  h.add(...Array.from({ length: 66 }, (_, i) => passage(i + 1, `Il affirme que ${topic(i + 1)}.`)));
  await flush(6000);
  const compact = h.state(), full = h.state({ full: true }), brief = h.state({ brief: true });
  assert.ok(full.claims.every(c => c.statement.length >= 200 && c.statement.length <= 300 && c.status === 'sourced'));
  // More than the polled lists hold: they keep the most recent part, and totals give the real numbers.
  assert.deepEqual([full.claims.length, full.lots.length], [66, 22]);
  assert.deepEqual([compact.claims.length, compact.claims[0].id, compact.claims.at(-1).id, compact.lots.length, compact.lots[0].id, compact.lots.at(-1).id], [60, 'claim-7', 'claim-66', 20, 'lot-3', 'lot-22']);
  const totals = { claims: 66, lots: 22, gaps: 0, rejected: 0 };
  assert.deepEqual([compact.totals, brief.totals, compact.counts.sourced, brief.overlay.seq, brief.overlay.cards.map(card => card.id)], [totals, totals, 66, 22, ['lot-18', 'lot-19', 'lot-20', 'lot-21', 'lot-22']]);
  invariants(compact); invariants(brief);
  // The once-per-second state: no list, and of each card the text, the interval, the origins, the labels and three fields per source.
  assert.deepEqual(Object.keys(brief).sort(), ['activation', 'activity', 'backlog', 'counts', 'coverage', 'enabled', 'error', 'overlay', 'restored', 'sessionId', 'signals', 'totals', 'version']);
  for (const card of brief.overlay.cards) {
    assert.deepEqual(Object.keys(card).sort(), ['assessments', 'claimIds', 'finishedAt', 'id', 'interval', 'kind', 'label', 'origin', 'publishedAtMs', 'seq', 'sources', 'text']);
    assert.deepEqual(card.sources.map(source => Object.keys(source).sort().join()), Array(3).fill('publisher,title,url'));
    assert.deepEqual([card.text, card.text.length > 300 && card.text.length <= 420, card.label, card.assessments.map(a => a.label), card.origin.length], [summary, true, 'Sources consultées', Array(3).fill('Concorde avec les sources'), 3]);
  }
  // What was cut from the cards is still in the lots of the compact state.
  assert.ok(compact.overlay.cards.every(card => card.uncertainties.length === 2 && card.sources.every(source => source.evidence.length > 150)));
  // Synthetic measure, not a bound: five cards of three sources with texts of realistic length.
  const bytes = value => Buffer.byteLength(JSON.stringify(value));
  assert.ok(bytes(brief) < 12 * 1024, `brief state: ${bytes(brief)} bytes`);
  assert.ok(bytes(brief.overlay) * 1.5 < bytes(compact.overlay), `cards: ${bytes(brief.overlay)} bytes brief, ${bytes(compact.overlay)} compact`);
});

test('a single verification running late, with nothing queued behind it, is never worded "0 waiting"', async () => {
  let now = 1_800_000_000_000;
  const quote = 'le chômage est à 7,4 % ce trimestre selon le ministre';
  const surveillance = new Surveillance({ now: () => now, detector: scripted(p => [found(p.id, quote, 'Le chômage est à 7,4 %.')]), researcher: { verify: () => new Promise(() => {}) } });
  surveillance.start({ instruction: 'Vérifie les chiffres annoncés.' }, { id: 's1', elapsedMs: 0, segments: [], history: [] });
  const session = { id: 's1', elapsedMs: 10000, segments: [passage(1, quote)], history: [] };
  const labels = new Set();
  for (let second = 0; second < 100; second++) { now += 1000; surveillance.observe(session); surveillance.tick(); await flush(20); labels.add(surveillance.snapshot({ brief: true }).activity.label); }
  const state = surveillance.snapshot({ brief: true });
  assert.deepEqual([state.activity.state, state.backlog.reason, state.backlog.claimsWaiting, state.counts.running, state.activity.label], ['late', 'verification', 0, 1, 'Vérification en cours : elle a pris du retard.']);
  for (const label of labels) assert.doesNotMatch(label, /\b0 (affirmation|passage)/, label);
});
