const test = require('node:test');
const assert = require('node:assert/strict');
const overlay = require('../tv/app/surveillance-overlay.js');
// Shared with the native supervisor's queue (Python): same inputs, same clock, same expected outputs.
const shared = require('./fixtures/tv-overlay-queue-cases.json');

const { OverlayQueue, describeCard, describeActivity, renderCard } = overlay;
const S = 1790000000000;
const card = (seq, extra = {}) => ({ id: `lot-${seq}`, kind: 'verification', label: 'Sources consultées', seq, text: `Résultat ${seq}.`,
  interval: { startMs: 760000, endMs: 768000 }, sources: [{ url: 'https://www.insee.fr/fr/statistiques/1', title: 'Insee', publisher: 'Insee' }], finishedAt: S, publishedAtMs: 600000, ...extra });

// The protocol written in the fixture file: steps of an instant first, then one display turn.
function play(scenario, feedQueue) {
  const options = { ...shared.defaults, ...scenario.options };
  let time = 0, paused = false, open = null;
  const queue = new OverlayQueue({ now: () => time, displayMs: options.displayMs, gapMs: options.gapMs, maxQueue: options.maxQueue, staleMs: options.staleMs });
  const shown = [], checkpoints = [];
  for (time = 0; time <= scenario.untilMs; time += options.tickMs) {
    for (const step of scenario.steps.filter(s => s.atMs === time)) {
      if (step.op === 'feed') feedQueue(queue, step.feed);
      else if (step.op === 'pause') paused = step.value;
      // A declaration names its session; the earlier cases meant the session of the last reply read.
      else if (step.op === 'seen') queue.seen(step.seq, step.sessionId || queue.sessionId);
      else throw Error(`Unknown step ${step.op}`);
    }
    const turn = queue.tick(paused), id = turn.card ? turn.card.id : null;
    assert.equal(turn.changed, id !== (open ? open.id : null), `${scenario.name}: changed must follow the displayed card at ${time}`);
    if (turn.changed) {
      if (open) open.toMs = time;
      open = id ? { id, fromMs: time, toMs: null } : null;
      if (open) shown.push(open);
    }
    if ((scenario.checkpoints || []).some(c => c.atMs === time)) checkpoints.push({ atMs: time, card: id, queue: turn.more });
  }
  const state = queue.state();
  const counts = Object.fromEntries(Object.keys(scenario.expect.counts).map(key => [key, state.counts[key]]));
  return { shown, checkpoints, counts, cursor: state.cursor, queue: state.waiting };
}
const expected = scenario => ({ shown: scenario.expect.shown, checkpoints: scenario.checkpoints || [], counts: scenario.expect.counts, cursor: scenario.expect.cursor, queue: scenario.expect.queue });

test('the shared fixture covers the normative queue rules and every step lands on a tick', () => {
  assert.equal(shared.version, 1);
  assert.ok(shared.cases.length >= 14);
  for (const name of ['seen-then-new-session', 'restored-history-is-not-news']) assert.ok(shared.cases.some(c => c.name === name), name);
  assert.equal(new Set(shared.cases.map(c => c.name)).size, shared.cases.length);
  for (const scenario of shared.cases) {
    const tickMs = (scenario.options && scenario.options.tickMs) || shared.defaults.tickMs;
    for (const step of scenario.steps) assert.equal(step.atMs % tickMs, 0, `${scenario.name}: step at ${step.atMs}`);
    assert.ok(scenario.expect.shown.every(s => s.toMs !== null && s.toMs <= scenario.untilMs), `${scenario.name}: every display ends inside the case`);
  }
});

for (const scenario of shared.cases) {
  test(`shared queue case · ${scenario.name}`, () => {
    // One call per server reply, as the pages do.
    assert.deepEqual(play(scenario, (queue, feed) => queue.ingest(feed)), expected(scenario));
    // Same case through reset/accept with the session clock (elapsedMs against publishedAtMs): same outcome.
    // A caller of reset/accept applies the rule of a restoring registry itself: nothing is accepted meanwhile,
    // and the cursor is placed again on the first reply after it.
    let unsettled = false;
    assert.deepEqual(play(scenario, (queue, feed) => {
      const restoring = !!feed.activity && feed.activity.state === 'restoring';
      if (feed.sessionId !== queue.sessionId || restoring || unsettled) queue.reset(feed.sessionId, restoring ? null : feed.overlay.seq);
      unsettled = restoring;
      if (!restoring) queue.accept(feed.overlay.cards, feed.elapsedMs);
    }), expected(scenario));
  });
}

test('a pause withdraws the card on screen and gives it back whole, counted once', () => {
  let time = 0;
  const queue = new OverlayQueue({ now: () => time });
  queue.reset('s1', 0);
  assert.deepEqual(queue.accept([card(1), card(2, { finishedAt: S + 1 })], S + 10), { added: 2, skipped: 0 });
  assert.equal(queue.tick(false).card.id, 'lot-1');
  time = 3000;
  assert.deepEqual(queue.tick(true), { card: null, more: 2, changed: true });
  time = 9000;
  assert.deepEqual(queue.tick(true), { card: null, more: 2, changed: false });
  const back = queue.tick(false);
  assert.equal(back.card.id, 'lot-1');
  assert.equal(back.more, 1);
  time = 9000 + 13999;
  assert.equal(queue.tick(false).card.id, 'lot-1', 'the interrupted card gets its full duration again');
  time += 1;
  assert.equal(queue.tick(false).card, null);
  assert.equal(queue.state().counts.shown, 1);
});

test('nothing of a previous session stays on screen, and an unanchored queue replays nothing', () => {
  let time = 0;
  const queue = new OverlayQueue({ now: () => time });
  // accept() before any reset(): first read, the cursor adopts what the server already published.
  assert.deepEqual(queue.accept([card(4), card(5)], S), { added: 0, skipped: 0 });
  assert.equal(queue.state().cursor, 5);
  queue.accept([card(6)], S);
  assert.equal(queue.tick(false).card.id, 'lot-6');
  queue.reset('s2');
  assert.deepEqual(queue.tick(false), { card: null, more: 0, changed: true });
  assert.equal(queue.state().cursor, null);
  queue.accept([card(1), card(2)], S);
  assert.equal(queue.state().cursor, 2);
  assert.equal(queue.tick(false).card, null);
});

test('seen drops waiting cards without counting them, and the display setting is capped', () => {
  let time = 0;
  const queue = new OverlayQueue({ now: () => time, displayMs: 8000 });
  queue.reset('s1', 7);
  queue.accept([card(8), card(9, { finishedAt: S + 1 }), card(10, { finishedAt: S + 2 })], S + 5);
  assert.equal(queue.tick(false).card.id, 'lot-8');
  // A declaration names its session: one of another session, or of none, moves nothing.
  queue.seen(10, 's0');
  queue.seen(10);
  assert.deepEqual([queue.state().cursor, queue.state().waiting], [10, 2]);
  queue.seen(9, 's1');
  assert.deepEqual([queue.state().cursor, queue.state().waiting], [10, 1]);
  assert.equal(queue.setDisplayMs(60000), 20000);
  assert.equal(queue.setDisplayMs('abc'), 14000);
  assert.equal(queue.setDisplayMs(20000), 20000);
  time = 8000;
  assert.equal(queue.tick(false).card, null);
  time = 9500;
  assert.equal(queue.tick(false).card.id, 'lot-10');
  time = 9500 + 19999;
  assert.equal(queue.tick(false).card.id, 'lot-10');
  time += 1;
  assert.equal(queue.tick(false).card, null);
  assert.deepEqual(queue.state().counts, { shown: 2, skippedStale: 0, skippedOverflow: 0, skippedUnsourced: 0, freshnessUnknown: 0 });
  assert.deepEqual(overlay.DISPLAY_CHOICES, [8000, 14000, 20000]);
});

test('only a sourced verification enters the queue; a card without a server stamp is held fresh and says so', () => {
  const queue = new OverlayQueue({ now: () => 0 });
  queue.reset('s1', 0);
  const result = queue.accept([
    card(1, { kind: 'signal' }), // a signal stays out even with sources
    card(2, { sources: [{ url: 'pas une adresse', title: 'x' }] }),
    card(3, { kind: 'notice' }),
    card(4, { finishedAt: undefined }),
    { ...card(5), seq: 'cinq' },
  ], S);
  assert.deepEqual(result, { added: 1, skipped: 3 });
  assert.equal(queue.tick(false).card.id, 'lot-4');
  assert.deepEqual(queue.state().counts, { shown: 1, skippedStale: 0, skippedOverflow: 0, skippedUnsourced: 3, freshnessUnknown: 1 });
  assert.equal(queue.state().cursor, 4);
});

test('a card already stale when it arrives takes no place in the bounded queue', () => {
  const queue = new OverlayQueue({ now: () => 0 });
  queue.reset('s1', 0);
  // Were it queued, the stale card (the oldest) would be pushed out as an overflow: the wrong cause, and a wrong count.
  const fresh = [2, 3, 4, 5].map(seq => card(seq, { finishedAt: S + seq }));
  assert.deepEqual(queue.accept([card(1, { finishedAt: S - 200000 }), ...fresh], S + 10), { added: 4, skipped: 1 });
  assert.deepEqual(queue.state().counts, { shown: 0, skippedStale: 1, skippedOverflow: 0, skippedUnsourced: 0, freshnessUnknown: 0 });
  assert.equal(queue.state().waiting, 4);
});

test('describeCard shows hosts and the video interval, never a URL, a verdict badge or a signal', () => {
  const lot = card(5, { text: 'Le chômage est à 7,4 %\n selon https://www.insee.fr/fr/statistiques/123?x=1 .', interval: { startMs: 3760000, endMs: 3768000 },
    assessments: [{ claimId: 'claim-1', assessment: 'contradicted', label: 'Contredit par les sources' }],
    sources: [{ url: 'https://www.insee.fr/a', title: 'Insee' }, { url: 'https://www.lemonde.fr/b?c=1', title: 'Le Monde' }, { url: 'https://insee.fr/c' }, { url: 'http://user:secret@data.gouv.fr:8443/d' }] });
  const view = describeCard(lot, { more: 2, hint: 'Rakuten · détails' });
  assert.deepEqual(view, {
    kicker: 'Sources consultées · 1:02:40–1:02:48',
    text: 'Le chômage est à 7,4 % selon insee.fr .',
    sourcesLine: 'Sources : insee.fr · lemonde.fr +1',
    footer: '+2 autres résultats · Rakuten · détails',
    accent: 'verification',
  });
  assert.doesNotMatch(Object.values(view).join(' '), /https?:|\/\/|www\.|secret|\?|vrai|faux|contredit|concorde/i);
  assert.equal(describeCard(card(1)).footer, '');
  assert.equal(describeCard(card(1, { interval: null })).kicker, 'Sources consultées');
  // T7: a signal is never an overlay card; an unsourced lot is refused whatever its label says.
  assert.equal(describeCard({ ...lot, kind: 'signal', label: 'Repéré dans la vidéo' }), null);
  assert.equal(describeCard({ ...lot, kind: 'signal', sources: [] }), null);
  assert.equal(describeCard({ ...lot, sources: [] }), null);
  assert.equal(describeCard({ ...lot, sources: [{ title: 'Sans adresse' }] }), null);
  assert.equal(describeCard({ ...lot, kind: 'other' }), null);
  assert.equal(describeCard({ ...lot, text: '   ' }), null);
  assert.equal(describeCard(null), null);
  // The only card without a source is a local notice (end of capture), and it never borrows a source line.
  assert.deepEqual(describeCard({ kind: 'notice', text: 'Capture arrêtée : la surveillance ne reçoit plus rien. Rakuten pour la relancer.', sources: [{ url: 'https://a.fr' }] }),
    { kicker: 'TV Lens', text: 'Capture arrêtée : la surveillance ne reçoit plus rien. Rakuten pour la relancer.', sourcesLine: '', footer: '', accent: 'notice' });
});

test('describeActivity is silent while listening and names the cause of a delay', () => {
  const block = (state, extra = {}, backlog = {}) => ({ enabled: true, activity: { state, label: '', detecting: false, running: 0, waiting: 0, late: state === 'late', ...extra }, backlog: { late: state === 'late', reason: null, ...backlog } });
  assert.equal(describeActivity(block('listening', { label: 'Surveillance active.' })), null);
  assert.equal(describeActivity(block('idle', { label: 'Surveillance inactive.' })), null);
  assert.equal(describeActivity(block('stopped', { label: 'Surveillance arrêtée.' })), null);
  assert.equal(describeActivity({ ...block('verifying'), enabled: false }), null);
  assert.equal(describeActivity(null), null);
  assert.equal(describeActivity({}), null);
  // The pill is one short line in its box: the sentences of the server keep their cause and their number, not their filler.
  assert.deepEqual(describeActivity(block('detecting', { label: 'Lecture des nouveaux passages…', detecting: true })), { label: 'Lecture des passages…', late: false });
  assert.deepEqual(describeActivity(block('detecting', { label: 'Lecture des nouveaux passages…', detecting: true, waiting: 2 })), { label: 'Lecture des passages… · 2 en attente', late: false });
  assert.deepEqual(describeActivity(block('verifying', { label: 'Vérification en cours…', running: 1, waiting: 3 })), { label: 'Vérification en cours… · 3 en attente', late: false });
  assert.deepEqual(describeActivity(block('verifying')), { label: 'Vérification en cours…', late: false });
  assert.deepEqual(describeActivity(block('late', { label: 'Vérifications en retard : 3 affirmations en attente.', waiting: 3 }, { reason: 'verification' })),
    { label: 'Vérifications en retard · 3 en attente', late: true });
  // detection-failed: the provider is down; the pill says so instead of looking like a quiet programme.
  assert.deepEqual(describeActivity(block('late', { label: 'Lecture des passages en échec : 2 passages non lus.' }, { reason: 'detection-failed', passagesFailed: 2 })),
    { label: 'Lecture en échec · 2 passages non lus', late: true });
  const pill = (label, extra = {}) => overlay.describePill({ state: 'late', label, waiting: 0, late: true, ...extra }).label;
  assert.deepEqual(['Lecture des passages en échec : 1 passage non lu.', 'Lecture des passages en échec.', 'Lecture rétablie : 1 passage n’a pas pu être lu.', 'Lecture rétablie : 4 passages n’ont pas pu être lus.',
    'Lecture en retard : 12 passages à lire.', 'Registre plein : les nouveaux passages ne sont plus lus.'].map(label => pill(label)),
    ['Lecture en échec · 1 passage non lu', 'Lecture en échec', 'Lecture rétablie · 1 passage non lu', 'Lecture rétablie · 4 passages non lus', 'Lecture en retard · 12 passages à lire', 'Registre plein · lecture arrêtée']);
  // One check still running 90 s after its claim was found, nothing queued behind it: the server words a 0
  // (core/surveillance.cjs, reason "verification" with claimsWaiting 0). The pill says a late check, never an empty queue.
  const alone = 'Vérifications en retard : 0 affirmation en attente.';
  assert.deepEqual(describeActivity(block('late', { label: alone, running: 1, waiting: 0 }, { reason: 'verification', claimsWaiting: 0 })), { label: 'Vérification en cours · en retard', late: true });
  assert.equal(pill('Vérifications en retard : 1 affirmation en attente.'), 'Vérifications en retard · 1 en attente');
  assert.equal(pill('Vérification en cours : elle a pris du retard.'), 'Vérification en cours · en retard', 'the sentence of the panel for that case is shortened the same way');
  // In the words of the state, with the number that belongs to the cause, and no number when it is 0: never "en retard · 0 en attente".
  const zeros = [alone, 'Vérifications en retard : 0 affirmations en attente', 'Lecture en retard : 0 passage à lire.', 'Lecture des passages en échec : 0 passage non lu.', 'Lecture rétablie : 0 passage n’a pas pu être lu.'];
  assert.deepEqual(zeros.map(label => pill(label)), ['Vérification en cours · en retard', 'Vérification en cours · en retard', 'Lecture en retard', 'Lecture en échec', 'Lecture rétablie']);
  for (const waiting of [0, 3]) for (const label of ['Lecture des passages en échec : 2 passages non lus.', 'Vérifications en retard : 3 affirmations en attente.', 'Analyse ralentie', '', ...zeros])
    assert.doesNotMatch(pill(label, { waiting }), /\b0 (?:en attente|affirmation|passage)|en retard.*en retard/);
  assert.equal(overlay.describePill({ state: 'verifying', label: 'Vérification en cours…', waiting: 0, late: false }).label, 'Vérification en cours…', 'no count either when nothing waits behind a check that is on time');
  assert.ok(['Lecture en échec · 12 passages non lus', 'Vérifications en retard · 12 en attente', 'Vérification en cours · en retard', 'Lecture en retard · 12 passages à lire', 'Lecture des passages… · 12 en attente'].every(label => label.length <= 40), 'short enough for the 440 px box (measured in the browser smoke)');
  assert.deepEqual(describeActivity(block('late', { label: 'Analyse ralentie' }, { reason: 'detection' })), { label: 'Analyse ralentie · en retard', late: true });
  assert.deepEqual(describeActivity(block('late')), { label: 'Surveillance en retard.', late: true });
});

test('renderCard builds inert boxes only and empties the node when there is nothing to draw', () => {
  const made = [];
  const element = tag => {
    const node = { tag, children: [], attributes: {}, className: '', textContent: '', hidden: false, ownerDocument: null,
      get firstChild() { return this.children[0] || null; },
      appendChild(child) { this.children.push(child); return child; }, removeChild(child) { this.children.splice(this.children.indexOf(child), 1); },
      setAttribute(name, value) { this.attributes[name] = value; } };
    made.push(node);
    return node;
  };
  const doc = { createElement: tag => Object.assign(element(tag), { ownerDocument: doc }) };
  const node = doc.createElement('div');
  made.length = 0;
  renderCard(node, describeCard(card(1, { text: '<b>Texte</b> & suite' }), { hint: 'Rakuten · détails' }));
  assert.equal(node.hidden, false);
  assert.equal(node.children.length, 1);
  const [box] = node.children;
  assert.equal(box.className, 'tvl-card');
  assert.equal(box.attributes['data-accent'], 'verification');
  assert.deepEqual(box.children.map(c => c.className), ['tvl-card-kicker', 'tvl-card-text', 'tvl-card-foot']);
  assert.equal(box.children[1].textContent, '<b>Texte</b> & suite', 'markup stays text');
  assert.deepEqual(box.children[2].children.map(c => [c.className, c.textContent]), [['tvl-card-sources', 'Sources : insee.fr'], ['tvl-card-footer', 'Rakuten · détails']]);
  assert.ok(made.every(n => n.tag === 'div' && !('tabindex' in n.attributes) && !('href' in n.attributes)), 'no focusable element');
  renderCard(node, null);
  assert.equal(node.children.length, 0);
  assert.equal(node.hidden, true);
  overlay.renderActivity(node, { label: 'Vérification en cours… · 2 en attente', late: false });
  assert.deepEqual(node.children[0].children.map(c => c.className), ['tvl-pill-dot', 'tvl-pill-label']);
  assert.equal(node.children[0].attributes['data-late'], 'false');
  overlay.renderActivity(node, null);
  assert.equal(node.hidden, true);
});
