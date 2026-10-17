const test = require('node:test');
const assert = require('node:assert/strict');
const { VideoTools } = require('../core/video-tools.cjs');
const { DeepAsk } = require('../core/deep-ask.cjs');
const { consultationFrom, rereadOf } = require('./helpers/memory-consultation.cjs');

const passage = (n, startMs, endMs, extra = {}) => ({ id: `moment-${n}`, startMs, endMs, status: 'ready', available: true, observation: { summary: `Résumé ${n}`, transcript: `Paroles ${n}` }, ...extra });
// The question froze at 26 s. The passage covering 24–32 s arrived afterwards: it is not part of the prefix.
const snapshot = () => ({ id: 's1', elapsedMs: 26000, history: [], segments: [passage(1, 0, 8000), passage(2, 8000, 16000), passage(3, 16000, 24000)] });
const tools = (inspected = []) => new VideoTools({ consultation: consultationFrom(snapshot()), search: { search: async () => ({ moments: [] }) },
  inspector: { inspect: async input => { inspected.push(input); return { observations: [], hypotheses: [], limits: [] }; } },
  media: { lease: async () => async () => {} },
  // A later state knows a newer passage: refreshing must never add it.
  reread: rereadOf(() => ({ ...snapshot(), elapsedMs: 40000, segments: [...snapshot().segments, passage(4, 24000, 32000)] })) });

test('a request beyond what the question froze is refused with the interval that can be asked instead', async () => {
  const inspected = [], t = tools(inspected);
  assert.deepEqual(t.availability(), { startMs: 0, throughMs: 24000, anchorMs: 26000, passages: 3, lastPassage: { id: 'moment-3', startMs: 16000, endMs: 24000 } });
  // « Les dix dernières secondes » asked against the wall clock: after the anchor.
  await assert.rejects(t.call('inspect_clip', { startMs: 22000, endMs: 32000, question: 'Que se passe-t-il ?' }),
    error => /Intervalle invalide ou postérieur à la question\./.test(error.message) && /de 0 à 24000 ms \(0:00–0:24\)/.test(error.message) && /dernier passage reçu moment-3/.test(error.message) && /Reformule dans cet intervalle/.test(error.message));
  // Inside the anchor but in the part no received passage covers.
  await assert.rejects(t.call('get_transcript', { startMs: 24500, endMs: 26000 }),
    error => /Aucun passage observé dans cet intervalle\./.test(error.message) && /0:00–0:24/.test(error.message));
  assert.equal(inspected.length, 0, 'nothing was re-examined');
  // Neither refusal widened the prefix, and the newer passage stays out after a refresh.
  assert.equal(t.refresh(), true);
  assert.deepEqual(t.consultationScope().passages.map(s => s.id), ['moment-1', 'moment-2', 'moment-3']);
  assert.equal(t.availability().throughMs, 24000);
  // The viewer reads the limit once, however many requests were refused.
  assert.deepEqual(t.limits, ['Une demande visait un intervalle hors de la mémoire disponible au moment de la question (0:00–0:24).']);
  // The guided request is served, on the passage that was really received.
  const served = await t.call('get_transcript', { startMs: 16000, endMs: 24000 });
  assert.deepEqual(served.passages.map(p => p.id), ['moment-3']);
});

test('a question asked before any passage says so instead of an opaque refusal', async () => {
  const t = new VideoTools({ consultation: consultationFrom({ id: 's1', elapsedMs: 3000, history: [], segments: [] }), search: {}, inspector: {}, media: {} });
  assert.deepEqual(t.availability(), { startMs: 0, throughMs: 0, anchorMs: 3000, passages: 0, lastPassage: null });
  await assert.rejects(t.call('get_transcript', { startMs: 0, endMs: 3000 }), /Aucun passage n’était encore reçu au moment de la question\./);
  assert.deepEqual(t.limits, ['Aucun passage n’était encore reçu au moment de la question.']);
});

test('the frozen availability is published with the question, as times and counts only', async () => {
  const deep = new DeepAsk({ makeTools: () => tools(), agent: { answer: async () => ({ answer: 'Ok.', kind: 'explanation', citations: [], limits: [] }) } });
  deep.start('Les dix dernières secondes ?', { mode: 'chat' });
  await deep.jobs[0].done;
  const published = structuredClone(deep.snapshot()).jobs[0].availability;
  assert.deepEqual(published, { startMs: 0, throughMs: 24000, anchorMs: 26000, passages: 3, lastPassage: { id: 'moment-3', startMs: 16000, endMs: 24000 } });
  assert.equal(JSON.stringify(published).includes('Paroles'), false);
});
