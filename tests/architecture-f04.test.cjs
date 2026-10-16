const { test } = require('node:test');
const assert = require('node:assert/strict');
const { turns } = require('./helpers/wait.cjs');
const { createConversationRuntime } = require('../runtime/conversation-runtime.cjs');
const { ViewingActions } = require('../core/viewing-actions.cjs');

// F04: a finished question keeps its answer, not its working memory. Every case goes through the composition shared
// by both hosts, on synthetic passages and in-memory doubles: they prove structure and orchestration, never a provider.
const BLOCK_MS = 8000;
const span = n => ({ startMs: (n - 1) * BLOCK_MS, endMs: n * BLOCK_MS });
const cite = n => ({ id: `moment-${n}`, ...span(n) });
const passage = (n, extra = {}) => ({ ...cite(n), status: 'ready', audioStatus: 'ready', visionStatus: 'ready', available: true, revision: 1,
  observation: { summary: `Résumé du passage ${n}.`, visual: `Plan ${n}.`, transcript: `Paroles du passage ${n}. `.repeat(12) }, ...extra });
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const NOTHING = { passages: 0, dependencies: 0 }, EVERYTHING = { passages: 100, dependencies: 3 };

// What a walk through own properties, array items and map entries still finds from `root`: a count of objects, not
// a heap or RSS measurement. A closure is opaque to it, so a function is only ever found as a reference.
function reachable(root) {
  const seen = new Set(), stack = [root];
  while (stack.length) {
    const value = stack.pop();
    if (value === null || !['object', 'function'].includes(typeof value) || seen.has(value)) continue;
    seen.add(value);
    stack.push(...(value instanceof Map ? [...value.keys(), ...value.values()] : Object.values(value)));
  }
  return seen;
}
// A copied passage carries its observation; the evidence kept from a consultation carries a text and no observation.
const isCopy = value => typeof value === 'object' && 'observation' in value;
const copies = root => [...reachable(root)].filter(isCopy);

// One session of a hundred analysed passages. Every question is answered by `answer`; the search, the inspector and
// the media store are the session's own objects, so that a context still holding them can be told by identity.
function stage(t, { answer, inspect, config = {} }) {
  const state = { id: 'session-f04', elapsedMs: 100 * BLOCK_MS, history: [], segments: Array.from({ length: 100 }, (_, i) => passage(i + 1)) };
  const used = { searches: [], inspections: [], leases: [], held: 0 }, changes = [], inputs = [];
  const session = {
    watch: { id: state.id, snapshot: () => ({ id: state.id, elapsedMs: state.elapsedMs, history: [...state.history], segments: state.segments.map(s => ({ ...s })) }) },
    search: { search: async ({ segments, anchorMs }) => { used.searches.push({ ids: segments.map(s => s.id), anchorMs }); return { mode: 'lexical', moments: segments.slice(-1).map(({ id, startMs, endMs }) => ({ id, startMs, endMs })), warnings: [] }; } },
    inspector: { inspect: input => { used.inspections.push(input.segments.map(s => s.id)); return inspect ? inspect(input) : { observations: input.segments.map(({ id, startMs, endMs }) => ({ id, startMs, endMs, text: `Vu ${id}.` })), hypotheses: [], limits: [] }; } },
    store: { lease: async ids => { used.leases.push(ids); used.held++; return async () => { used.held--; }; } },
  };
  const { deep, makeTools } = createConversationRuntime({ getSession: () => session, config, selectedModels: {},
    // Cloned as a host would send it: what was published can be compared later, whatever happens to the question.
    onChange: published => changes.push(structuredClone(published)),
    agent: { answer: input => { inputs.push(input); return answer(input); } } });
  const ask = (question, options) => { const { id } = deep.start(question, { mode: 'chat', ...options }); return deep.jobs.find(job => job.id === id); };
  // A failed assertion must not leave a question running with its five-minute ceiling still armed.
  t.after(() => deep.cancelAll('Fin du test.'));
  // What `root` still holds: copied passages, and how many of the session's three dependencies.
  const holds = root => { const found = reachable(root); return { passages: [...found].filter(isCopy).length, dependencies: [session.search, session.inspector, session.store].filter(dependency => found.has(dependency)).length }; };
  return { state, session, used, changes, inputs, deep, makeTools, ask, holds };
}

test('twenty finished questions on a hundred passages keep their answers, citations and metrics, and none of the passages, session dependencies or callbacks their contexts held', async t => {
  const working = [];
  const s = stage(t, { answer: async ({ tools }) => {
    // While its question is processed, a context holds the whole frozen prefix and the session's dependencies.
    const mine = copies(tools);
    working.push({ passages: mine.length, bytes: bytes(mine), dependencies: s.holds(tools).dependencies, reachable: copies(s.deep.jobs).length, live: tools.live, progress: tools.onProgress });
    return { answer: `Réponse ${working.length}.`, kind: 'observation', citations: [cite(100)], limits: [] };
  } });
  for (let i = 1; i <= 20; i++) await s.ask(`Question ${i} ?`).done;

  const found = reachable(s.deep.jobs), kept = copies(s.deep.jobs);
  const evidence = s.deep.jobs.flatMap(job => job.tools.memoryEvidence), journal = s.deep.jobs.flatMap(job => job.tools.journal);
  const copied = working.reduce((sum, w) => sum + w.passages, 0), copiedBytes = working.reduce((sum, w) => sum + w.bytes, 0);
  // Synthetic and structural: objects reachable from the question list and the size of their JSON, not V8 heap nor RSS.
  t.diagnostic(`F04 mesure structurelle synthétique, 20 questions terminées sur 100 passages (objets atteignables et octets JSON, ni heap ni RSS)`);
  t.diagnostic(`F04 préfixes copiés pendant le traitement : ${copied} passages, ${copiedBytes} octets JSON`);
  t.diagnostic(`F04 préfixes encore atteignables depuis les questions terminées : ${kept.length} passages, ${kept.length ? bytes(kept) : 0} octets JSON`);
  t.diagnostic(`F04 passages atteignables pendant le traitement de chaque question : ${working.map(w => w.reachable).join(',')}`);
  t.diagnostic(`F04 conservé à part, preuves consultées : ${evidence.length} éléments, ${bytes(evidence)} octets JSON ; journal sans texte : ${journal.length} entrées, ${bytes(journal)} octets JSON`);

  // Each context really worked on the whole prefix, with the session's search, inspector and media.
  assert.deepEqual([copied, working.every(w => w.passages === 100 && w.dependencies === 3)], [2000, true]);
  assert.equal(kept.length, 0, 'no copied passage is reachable from a finished question');
  assert.deepEqual(working.map(w => w.reachable), Array(20).fill(100), 'while a question is processed, only its own prefix is held');
  assert.deepEqual(s.holds(s.deep.jobs), NOTHING);
  assert.equal(working.some(w => found.has(w.live) || found.has(w.progress)), false, 'neither the live provider nor the progress callback of a context is still referenced');
  // The durable history is whole: what was last published is what a host still reads.
  const { jobs } = structuredClone(s.deep.snapshot());
  assert.deepEqual({ jobs }, s.changes.at(-1));
  assert.deepEqual(jobs.map(job => [job.id, job.status, job.result.answer, job.result.kind, job.result.citations, job.validation.acceptedCitations, job.availability.passages, job.timeoutMs]),
    Array.from({ length: 20 }, (_, i) => [`deep-${i + 1}`, 'done', `Réponse ${i + 1}.`, 'observation', [cite(100)], 1, 100, 300000]));
  assert.ok(jobs.every(job => Number.isFinite(job.metrics.totalMs) && job.metrics.evidence.refreshes === 1 && job.metrics.evidence.journalEntries === 6));
  // What was consulted stays: the six passages each answer started from, and the record of what was read.
  assert.deepEqual([evidence.length, journal.length], [120, 120]);
});

test('a question stopped at its ceiling keeps its context until its agent has really finished with it: an inspection still running keeps its lease, and nothing returned late is used or published', async t => {
  let finishAgent, finishInspection;
  const s = stage(t, { config: { questionTimeoutMs: 60 }, inspect: () => new Promise(resolve => { finishInspection = resolve; }),
    answer: ({ question, tools }) => {
      if (question !== 'Longue ?') return Promise.resolve({ answer: 'Suite.', kind: 'observation', citations: [cite(100)], limits: [] });
      // The worst case for a ceiling: an agent that ignores the abort, with an inspection it does not wait for.
      tools.call('inspect_clip', { ...span(100), question: 'Que voit-on ?' }).catch(() => {});
      return new Promise(resolve => { finishAgent = resolve; });
    } });
  const long = s.ask('Longue ?'), next = s.ask('Suivante ?');
  await long.done; await next.done;
  // The ceiling ended the question for the viewer and the queue moved on; the agent and its inspection have not returned.
  assert.deepEqual([long.status, long.message, next.status], ['timeout', 'Limite de 1 seconde atteinte.', 'done']);
  assert.deepEqual([s.holds(long), s.used.leases, s.used.held], [EVERYTHING, [['moment-100']], 1]);
  await assert.rejects(long.tools.call('get_transcript', span(1)), /Délai maximal atteint/);
  const published = structuredClone(s.deep.snapshot()), emitted = s.changes.length;

  // The agent gives the hand back first: its inspection still runs, so nothing is let go yet.
  finishAgent({ answer: 'Trop tard.', kind: 'observation', citations: [cite(100)], limits: [] });
  await turns(4);
  assert.deepEqual([s.holds(long), s.used.held], [EVERYTHING, 1]);
  // Then the inspection returns: its lease is given back once, what it saw is dropped, and the context goes.
  finishInspection({ observations: [{ ...cite(100), text: 'Vu trop tard.' }], hypotheses: [], limits: [] });
  await turns(4);
  assert.deepEqual([s.used.held, s.used.leases.length, s.used.inspections.length, long.tools.observations], [0, 1, 1, []]);
  assert.deepEqual(s.holds(long), NOTHING);
  assert.deepEqual([long.status, long.result.kind, structuredClone(s.deep.snapshot()), s.changes.length], ['timeout', 'insufficient', published, emitted]);
  assert.deepEqual(s.holds(s.deep.jobs), NOTHING);
});

test('a question whose agent fails gives its context back like an answered one, and keeps its error and what it consulted', async t => {
  const s = stage(t, { answer: async ({ tools }) => { await tools.call('get_transcript', span(1)); throw Error('Fournisseur indisponible.'); } });
  const job = s.ask('Sujet ?'); await job.done;
  assert.deepEqual([job.status, job.message, job.result.kind, s.holds(job)], ['error', 'Fournisseur indisponible.', 'insufficient', NOTHING]);
  assert.deepEqual([job.metrics.tools.map(call => [call.tool, call.status]), job.tools.memoryEvidence.some(e => e.id === 'moment-1')], [[['get_transcript', 'completed']], true]);
});

test('a question cancelled in the queue gives its context back at once; one cancelled while it runs gives it back when its agent returns, and the questions around them keep theirs', async t => {
  let fail;
  const s = stage(t, { answer: ({ question }) => question === 'Première ?' ? new Promise((_, reject) => { fail = reject; })
    : Promise.resolve({ answer: 'Réponse.', kind: 'observation', citations: [cite(100)], limits: [] }) });
  const first = s.ask('Première ?'), second = s.ask('Deuxième ?'), third = s.ask('Troisième ?');
  // Never handed to the agent: nothing can still be using it.
  s.deep.cancel('Question annulée.', second.id);
  assert.deepEqual([second.status, s.holds(second), s.inputs.map(input => input.question)], ['cancelled', NOTHING, ['Première ?']]);
  assert.deepEqual([first.status, s.holds(first), third.status, s.holds(third)], ['running', EVERYTHING, 'queued', EVERYTHING]);

  s.deep.cancel('Question annulée.', first.id);
  await first.done; await third.done;
  assert.deepEqual([first.status, first.result, third.status, s.inputs.map(input => input.question)], ['cancelled', null, 'done', ['Première ?', 'Troisième ?']]);
  // The cancellation was immediate for the viewer; the agent has not returned yet.
  assert.deepEqual([s.holds(first), s.holds(third)], [EVERYTHING, NOTHING]);
  const published = structuredClone(s.deep.snapshot()), emitted = s.changes.length;
  // A real agent rejects once its interrupted turn has ended.
  fail(Error('Recherche annulée.'));
  await turns(4);
  assert.deepEqual([s.holds(s.deep.jobs), first.status, first.result], [NOTHING, 'cancelled', null]);
  assert.deepEqual([structuredClone(s.deep.snapshot()), s.changes.length], [published, emitted]);
  assert.deepEqual([third.result.citations, third.validation.acceptedCitations], [[cite(100)], 1]);
});

test('a question still waiting keeps the scope it froze, and reads the admissible revisions of its own passages, after the one before it was released', async t => {
  let release, context, beyond;
  const s = stage(t, { answer: async input => {
    if (input.question === 'Première ?') await new Promise(resolve => { release = resolve; });
    else {
      context = input.context;
      await input.tools.call('search_moments', { query: 'sujet' });
      beyond = await input.tools.call('get_transcript', span(101)).catch(error => error.message);
    }
    return { answer: 'Réponse.', kind: 'observation', citations: [cite(100)], limits: [] };
  } });
  const first = s.ask('Première ?'), second = s.ask('Seconde ?');
  // The session goes on while the second question waits: its last passage is analysed again and two more arrive.
  s.state.segments[99] = passage(100, { revision: 2, observation: { summary: 'Résumé révisé.', transcript: 'Paroles révisées.' } });
  s.state.segments.push(passage(101), passage(102)); s.state.elapsedMs = 102 * BLOCK_MS;
  assert.deepEqual([second.status, s.holds(second)], ['queued', EVERYTHING]);
  release(); await first.done; await second.done;

  assert.deepEqual([s.holds(first), second.status, second.anchorMs, second.availability.passages, second.availability.lastPassage], [NOTHING, 'done', 100 * BLOCK_MS, 100, cite(100)]);
  assert.deepEqual([context.anchorMs, context.passages.map(p => [p.id, p.revision])], [100 * BLOCK_MS, [95, 96, 97, 98, 99].map(n => [`moment-${n}`, 1]).concat([['moment-100', 2]])]);
  assert.match(context.passages.at(-1).text, /Résumé révisé\./);
  // Its search ranks the hundred passages it froze, and a passage received since stays out of reach.
  assert.deepEqual(s.used.searches, [{ ids: Array.from({ length: 100 }, (_, i) => `moment-${i + 1}`), anchorMs: 100 * BLOCK_MS }]);
  assert.match(beyond, /Intervalle invalide ou postérieur à la question\./);
  assert.deepEqual([second.result.citations, second.metrics.evidence.anchorMs, second.metrics.evidence.evidenceAsOfMs], [[cite(100)], 100 * BLOCK_MS, 102 * BLOCK_MS]);
  assert.deepEqual(s.holds(s.deep.jobs), NOTHING);
});

test('what a finished question consulted still supports the citations of the next one, and the history of released questions is restored intact', async t => {
  const answer = async ({ question, tools }) => {
    if (question === 'Le début ?') await tools.call('get_transcript', span(1));
    return { answer: `Réponse à « ${question} ».`, kind: 'observation', citations: [cite(1)], limits: [] };
  };
  const s = stage(t, { answer });
  const first = s.ask('Le début ?'); await first.done;
  const second = s.ask('Encore le début ?'); await second.done;
  assert.deepEqual(s.holds(s.deep.jobs), NOTHING);
  // The second question never read the first passage: its own context starts from the six latest ones.
  assert.deepEqual(s.inputs[1].context.passages.map(p => p.id), [95, 96, 97, 98, 99, 100].map(n => `moment-${n}`));
  assert.deepEqual([second.status, second.result.kind, second.result.citations, second.validation.acceptedCitations], ['done', 'observation', [cite(1)], 1]);

  // What a host saved, reopened by a fresh composition: same questions, nothing emitted, numbering and thread go on.
  const saved = JSON.parse(JSON.stringify(s.deep.snapshot())), reopened = stage(t, { answer });
  assert.deepEqual(JSON.parse(JSON.stringify(reopened.deep.restore(saved.jobs))), saved);
  assert.equal(reopened.changes.length, 0);
  const third = reopened.ask('Et ensuite ?'); await third.done;
  assert.deepEqual([third.id, third.status, reopened.inputs[0].conversation.map(turn => turn.answer)], ['deep-3', 'done', ['Réponse à « Le début ? ».', 'Réponse à « Encore le début ? ».']]);
  assert.deepEqual(JSON.parse(JSON.stringify(reopened.deep.snapshot())).jobs.slice(0, 2), saved.jobs);
});

test('a finished moment action keeps the passages of its own interval, and only those, so that the moment can still be re-examined', async t => {
  const s = stage(t, { answer: async ({ mode, tools }) => {
    if (mode !== 'inspect') return { answer: 'Ce moment.', kind: 'observation', citations: [cite(11)], limits: [] };
    const seen = await tools.call('inspect_clip', { startMs: 10 * BLOCK_MS, endMs: 12 * BLOCK_MS, question: 'Que voit-on ?' });
    return { answer: 'Réexamen.', kind: 'observation', citations: seen.observations.map(({ id, startMs, endMs }) => ({ id, startMs, endMs })), limits: [] };
  } });
  const moment = s.ask('Explique ce moment.', { intent: 'explain-moment', snapshot: s.session.watch.snapshot(), startMs: 10 * BLOCK_MS, anchorMs: 12 * BLOCK_MS });
  const ordinary = s.ask('Et le reste ?');
  await moment.done; await ordinary.done;
  const kept = copies(moment);
  t.diagnostic(`F04 intervalle conservé par une action de moment terminée : ${kept.length} passages sur 100, ${bytes(kept)} octets JSON`);
  assert.deepEqual([kept.map(p => p.id).sort(), s.holds(moment), s.holds(ordinary)], [['moment-11', 'moment-12'], { passages: 2, dependencies: 0 }, NOTHING]);

  // The host's re-examination reads the finished question: same instant, same interval, same passages.
  const actions = new ViewingActions({ makeId: () => 'token' });
  const { question, options } = actions.reexamination(moment, s.session.watch.snapshot());
  assert.deepEqual([options.mode, options.intent, options.startMs, options.anchorMs, options.snapshot.segments.map(p => p.id)], ['inspect', 'explain-moment', 10 * BLOCK_MS, 12 * BLOCK_MS, ['moment-11', 'moment-12']]);
  const { id } = s.deep.start(question, options), again = s.deep.jobs.find(job => job.id === id);
  await again.done;
  assert.deepEqual([again.status, again.result.kind, again.result.citations.map(c => c.id), s.used.inspections, s.used.held], ['done', 'observation', ['moment-11', 'moment-12'], [['moment-11', 'moment-12']], 0]);
  assert.deepEqual(s.holds(again), { passages: 2, dependencies: 0 });
  // An ordinary question was never a moment to re-examine.
  assert.throws(() => actions.reexamination(ordinary, s.session.watch.snapshot()), /plus disponible/);
});

test('once released, a context refuses every consultation without reading, leasing or recording anything; a context no question owns is untouched', async t => {
  const s = stage(t, { answer: async () => ({ answer: 'Réponse.', kind: 'observation', citations: [cite(100)], limits: [] }) });
  const job = s.ask('Sujet ?'); await job.done;
  const record = () => JSON.stringify([job.tools.memoryEvidence, job.tools.transcriptEvidence, job.tools.observations, job.tools.journal]), before = record();
  for (const [name, args] of [['search_moments', { query: 'sujet' }], ['get_transcript', span(1)], ['inspect_clip', { ...span(1), question: 'Que voit-on ?' }]])
    await assert.rejects(job.tools.call(name, args), { message: 'Question terminée : ses passages ne sont plus consultables.' }, name);
  assert.deepEqual([s.used.searches, s.used.leases, s.used.inspections, record() === before], [[], [], [], true]);
  // An interval the question could never consult is still answered as such, with the interval it had frozen.
  await assert.rejects(job.tools.call('get_transcript', span(101)),
    error => /Intervalle invalide ou postérieur à la question\./.test(error.message) && /de 0 à 800000 ms \(0:00–13:20\)/.test(error.message) && !/Aucun passage/.test(error.message));
  assert.deepEqual(s.holds(job), NOTHING);

  // A context opened outside the question queue, as for an external MCP client, is never released by it.
  const direct = s.makeTools();
  assert.deepEqual((await direct.call('get_transcript', span(1))).passages.map(p => p.id), ['moment-1']);
  assert.deepEqual([(await direct.call('search_moments', { query: 'sujet' })).moments.map(m => m.id), s.holds(direct)], [['moment-100'], EVERYTHING]);
});
