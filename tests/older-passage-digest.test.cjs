const { test } = require('node:test');
const assert = require('node:assert/strict');
const { digestOlderPassages } = require('../core/older-passage-digest.cjs');
const { VideoTools } = require('../core/video-tools.cjs');
const { DeepAsk } = require('../core/deep-ask.cjs');
const { consultationFrom } = require('./helpers/memory-consultation.cjs');

// A passage in the shape the question tools read: eight-second moments, replayable unless told otherwise.
const passage = (n, observation, extra = {}) => ({ id: `moment-${n}`, startMs: (n - 1) * 8000, endMs: n * 8000,
  status: 'ready', available: true, observation, ...extra });
const texts = entries => entries.map(entry => entry.text);
const totalLength = entries => entries.reduce((sum, entry) => sum + entry.text.length, 0);

test('each older passage becomes a compact entry with its real identity, bounds and replayability', () => {
  const entries = digestOlderPassages([
    passage(1, { transcript: 'Bonjour.' }),
    passage(2, { transcript: 'Plus tard.' }, { available: false, mediaReason: 'expired' }),
  ]);
  assert.deepEqual(entries, [
    { id: 'moment-1', startMs: 0, endMs: 8000, text: 'Bonjour.', precision: 'compact-journal', available: true },
    { id: 'moment-2', startMs: 8000, endMs: 16000, text: 'Plus tard.', precision: 'compact-journal', available: false },
  ]);
});

test('the entries keep the chronological order they are given', () => {
  const entries = digestOlderPassages([3, 4, 5, 6].map(n => passage(n, { transcript: `Paroles ${n}` })));
  assert.deepEqual(entries.map(entry => entry.id), ['moment-3', 'moment-4', 'moment-5', 'moment-6']);
  assert.ok(entries.every((entry, index) => index === 0 || entries[index - 1].endMs <= entry.startMs));
});

test('the speech is trimmed, and a passage without speech says so', () => {
  const entries = digestOlderPassages([
    passage(1, { transcript: '  Il pleut.\n ' }),
    passage(2, { transcript: '   ', summary: 'Un plateau télévisé.' }),
    passage(3, { summary: 'Un générique.' }),
  ]);
  assert.deepEqual(texts(entries), ['Il pleut.', '(pas de parole transcrite)', '(pas de parole transcrite)']);
});

test('the image line is given to the first two entries and at each change of topic, raw and cut at 300 characters', () => {
  const long = 'V'.repeat(450);
  const entries = digestOlderPassages([
    passage(1, { transcript: 'Un', visual: '  Un studio.  ', topic: 'météo' }),
    passage(2, { transcript: 'Deux', visual: 'Une carte.', topic: 'météo' }),
    passage(3, { transcript: 'Trois', visual: 'La même carte.', topic: 'météo' }),
    passage(4, { transcript: 'Quatre', visual: long, topic: 'sport' }),
    passage(5, { transcript: 'Cinq', visual: 'Un stade.', topic: 'sport' }),
    passage(6, { transcript: 'Six', visual: '   ', topic: 'jeu' }),
  ]);
  assert.deepEqual(texts(entries), ['Un\nImage :   Un studio.  ', 'Deux\nImage : Une carte.', 'Trois',
    `Quatre\nImage : ${'V'.repeat(300)}`, 'Cinq', 'Six\nImage :    ']);
});

test('the previous topic moves on with every passage, pictured or not', () => {
  const entries = digestOlderPassages([
    passage(1, { transcript: 'Un', visual: 'A', topic: 'météo' }),
    passage(2, { transcript: 'Deux', visual: 'B', topic: 'météo' }),
    passage(3, { transcript: 'Trois', topic: 'sport' }),
    passage(4, { transcript: 'Quatre', visual: 'D', topic: 'sport' }),
    passage(5, { transcript: 'Cinq', visual: 'E' }),
    passage(6, { transcript: 'Six', visual: 'F', topic: '' }),
  ]);
  assert.deepEqual(texts(entries), ['Un\nImage : A', 'Deux\nImage : B', 'Trois', 'Quatre', 'Cinq\nImage : E', 'Six']);
});

test('a passage without a visual never gets an image line, and a sound-only one keeps its media fields', () => {
  const entries = digestOlderPassages([
    passage(1, { transcript: 'Seulement le son.', topic: 'radio' }, { hasImages: false, available: false, mediaReason: 'images-absent' }),
    passage(2, { transcript: 'Sans visuel.', visual: '', topic: 'autre' }),
    passage(3, { transcript: 'Illisible.', topic: 'encore' }, { mediaReason: 'unreadable' }),
  ]);
  assert.deepEqual(entries.map(({ id, text, available, hasImages, mediaReason }) => ({ id, text, available, hasImages, mediaReason })), [
    { id: 'moment-1', text: 'Seulement le son.', available: false, hasImages: false, mediaReason: 'images-absent' },
    { id: 'moment-2', text: 'Sans visuel.', available: true, hasImages: undefined, mediaReason: undefined },
    { id: 'moment-3', text: 'Illisible.', available: true, hasImages: undefined, mediaReason: 'unreadable' },
  ]);
  assert.ok(entries.every(entry => !entry.text.includes('Image :')));
});

test('a digest at the ceiling is kept whole', () => {
  const entries = digestOlderPassages([1, 2, 3, 4].map(n => passage(n, { transcript: String(n).repeat(2500) })));
  assert.equal(entries.length, 4);
  assert.equal(totalLength(entries), 10000);
});

test('a digest over the ceiling is thinned in the middle, keeping the first two and the last entries', () => {
  const entries = digestOlderPassages(Array.from({ length: 10 }, (_, i) => passage(i + 1, { transcript: 'x'.repeat(1500) })));
  assert.deepEqual(entries.map(entry => entry.id), ['moment-1', 'moment-2', 'moment-3', 'moment-4', 'moment-9', 'moment-10']);
  assert.ok(totalLength(entries) <= 10000);
});

test('the image lines are chosen before thinning: an entry brought forward gains none', () => {
  const entries = digestOlderPassages([
    passage(1, { transcript: 'a'.repeat(4000), visual: 'A', topic: 't' }),
    passage(2, { transcript: 'b'.repeat(4000), visual: 'B', topic: 't' }),
    passage(3, { transcript: 'c'.repeat(4000), visual: 'C', topic: 't' }),
    passage(4, { transcript: 'd', visual: 'D', topic: 't' }),
  ]);
  assert.deepEqual(entries.map(entry => entry.id), ['moment-1', 'moment-2', 'moment-4']);
  assert.equal(entries[2].text, 'd');
});

test('thinning never goes below three entries, even over the ceiling', () => {
  const entries = digestOlderPassages([1, 2, 3, 4, 5].map(n => passage(n, { transcript: 'y'.repeat(6000) })));
  assert.deepEqual(entries.map(entry => entry.id), ['moment-1', 'moment-2', 'moment-5']);
  assert.ok(totalLength(entries) > 10000);
});

test('no older passage gives an empty digest', () => {
  assert.deepEqual(digestOlderPassages([]), []);
});

// A session of `count` analysed eight-second passages, written as the session holds them.
const watched = (n, observation = {}) => ({ id: `moment-${n}`, startMs: (n - 1) * 8000, endMs: n * 8000, status: 'ready',
  audioStatus: 'ready', visionStatus: 'ready', available: true, revision: 1,
  observation: { summary: `Passage ${n}`, transcript: `Paroles ${n}`, visual: `Écran ${n}`, topic: 'émission', ...observation } });
const sessionOf = (count, observation) => ({ id: 's', elapsedMs: count * 8000,
  segments: Array.from({ length: count }, (_, i) => watched(i + 1, observation)) });
const toolsOn = (state, extra = {}) => new VideoTools({ consultation: consultationFrom(state), ...extra });
const ranks = context => context.passages.map(p => [p.id, p.precision]);

test('with the digest, a chat context leads with the older passages in compact form before the six recent ones', () => {
  const context = toolsOn(sessionOf(10), { olderPassageDigest: true }).context();
  assert.deepEqual(ranks(context), [
    ...[1, 2, 3, 4].map(n => [`moment-${n}`, 'compact-journal']),
    ...[5, 6, 7, 8, 9, 10].map(n => [`moment-${n}`, 'automatic-summary']),
  ]);
  assert.deepEqual(texts(context.passages.slice(0, 4)), ['Paroles 1\nImage : Écran 1', 'Paroles 2\nImage : Écran 2', 'Paroles 3', 'Paroles 4']);
  assert.equal(context.omittedCount, 0);
});

test('without the digest, a chat context keeps its six recent passages and counts the older ones as omitted', () => {
  const context = toolsOn(sessionOf(10)).context();
  assert.deepEqual(context.passages.map(p => p.id), [5, 6, 7, 8, 9, 10].map(n => `moment-${n}`));
  assert.equal(context.omittedCount, 4);
});

test('a thinned digest leaves out exactly the passages it removed', () => {
  const context = toolsOn(sessionOf(20, { transcript: 'z'.repeat(1500) }), { olderPassageDigest: true }).context();
  const digest = context.passages.filter(p => p.precision === 'compact-journal');
  assert.ok(digest.length < 14);
  assert.deepEqual(digest.slice(0, 2).map(p => p.id), ['moment-1', 'moment-2']);
  assert.equal(digest.at(-1).id, 'moment-14');
  assert.equal(context.omittedCount, 14 - digest.length);
  assert.deepEqual(context.passages.slice(digest.length).map(p => p.id), [15, 16, 17, 18, 19, 20].map(n => `moment-${n}`));
});

// 130 passages exceed the recap window of 120 as well as the recent one, so both intents leave older passages out.
for (const intent of ['recap', 'explain-moment']) {
  test(`a ${intent} context is the same with or without the digest`, () => {
    const withDigest = toolsOn(sessionOf(130), { olderPassageDigest: true }), without = toolsOn(sessionOf(130));
    assert.deepEqual(withDigest.context({ intent }), without.context({ intent }));
    assert.deepEqual(withDigest.memoryEvidence, without.memoryEvidence);
    assert.deepEqual(withDigest.freshness(), without.freshness());
  });
}

test('digest entries become evidence of the question without entering the audit of reads', () => {
  const tools = toolsOn(sessionOf(10), { olderPassageDigest: true });
  tools.context();
  assert.deepEqual(tools.memoryEvidence.filter(e => e.precision === 'compact-journal').map(e => [e.id, e.startMs, e.endMs]),
    [1, 2, 3, 4].map(n => [`moment-${n}`, (n - 1) * 8000, n * 8000]));
  assert.deepEqual(tools.journal.map(e => e.id), [5, 6, 7, 8, 9, 10].map(n => `moment-${n}`));
  assert.equal(tools.freshness().journalEntries, 6);
});

test('a later full reading of a digested passage replaces its compact evidence', async () => {
  const tools = toolsOn(sessionOf(10), { olderPassageDigest: true });
  tools.context();
  await tools.call('get_transcript', { startMs: 0, endMs: 8000 });
  const evidence = tools.memoryEvidence.filter(e => e.id === 'moment-1');
  assert.deepEqual(evidence.map(e => [e.precision, e.revision]), [['automatic-summary', 1]]);
});

test('a digest entry never replaces the evidence of a passage already read in full', async () => {
  const tools = toolsOn(sessionOf(10), { olderPassageDigest: true });
  await tools.call('get_transcript', { startMs: 0, endMs: 8000 });
  const context = tools.context();
  assert.equal(context.passages[0].precision, 'compact-journal');
  assert.deepEqual(tools.memoryEvidence.filter(e => e.id === 'moment-1').map(e => [e.precision, e.revision]), [['automatic-summary', 1]]);
});

// A chat question answered by an agent that cites the passage `pick` chooses from the context it was handed.
async function askCiting(state, pick) {
  const contexts = [];
  const deep = new DeepAsk({
    makeTools: signal => toolsOn(state, { signal, olderPassageDigest: true }),
    agent: { answer: async ({ context }) => {
      contexts.push(context);
      const cited = pick(context);
      return { answer: 'Réponse tirée du passage.', kind: 'observation', limits: [],
        citations: [{ id: cited.id, startMs: cited.startMs, endMs: cited.endMs }] };
    } },
  });
  deep.start('Que disait-on au début ?', { mode: 'chat' });
  await deep.jobs[0].done;
  return { job: deep.jobs[0], context: contexts[0] };
}

test('a chat answer citing a digested passage keeps its citation', async () => {
  const { job } = await askCiting(sessionOf(10), context => context.passages[0]);
  assert.equal(job.status, 'done');
  assert.equal(job.validation.acceptedCitations, 1);
  assert.equal(job.result.kind, 'observation');
  assert.deepEqual(job.result.citations, [{ id: 'moment-1', startMs: 0, endMs: 8000 }]);
  assert.equal(job.metrics.evidence.journalEntries, 6);
});

test('a chat answer citing a passage thinned out of the digest is refused', async () => {
  const state = sessionOf(20, { transcript: 'z'.repeat(1500) });
  const { job, context } = await askCiting(state, ({ passages }) => {
    const handed = new Set(passages.map(p => p.id));
    return state.segments.find(p => !handed.has(p.id));
  });
  assert.ok(context.omittedCount > 0);
  assert.equal(job.validation.acceptedCitations, 0);
  assert.equal(job.result.kind, 'insufficient');
  assert.deepEqual(job.result.citations, []);
});
