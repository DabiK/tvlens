const test = require('node:test');
const assert = require('node:assert/strict');
const { DeepAsk } = require('../core/deep-ask.cjs');
const { VirtualClock } = require('./helpers/clock.cjs');

const tools = () => ({ sessionId: 's1', anchorMs: 9000, observations: [], hypotheses: [], limits: [], memoryEvidence: [{ id: 'moment-1', startMs: 0, endMs: 8000 }], transcriptEvidence: [] });

test('restored questions come back finished, interrupted ones are settled and new ids never collide', async () => {
  const states = [];
  const deep = new DeepAsk({ makeTools: tools, onChange: state => states.push(state),
    agent: { answer: async () => ({ answer: 'Réponse reprise.', kind: 'explanation', citations: [], limits: [] }) } });
  const restored = deep.restore([
    { id: 'deep-7', question: 'Ancienne question ?', mode: 'chat', status: 'done', sessionId: 's1', createdAt: 1, startedAt: 2, finishedAt: 3, result: { answer: 'Ancienne réponse.', kind: 'explanation', citations: [], limits: [] }, activity: [], preview: '' },
    { id: 'deep-9', question: 'Coupée ?', mode: 'chat', status: 'running', sessionId: 's1', createdAt: 5, startedAt: 6, result: null, activity: [], preview: '' },
    { id: 12, question: 'Entrée invalide' }, null,
  ]);
  assert.deepEqual(deep.jobs.map(j => [j.id, j.status]), [['deep-7', 'done'], ['deep-9', 'cancelled']]);
  assert.equal(deep.jobs[1].message, 'Interrompue à la fermeture de la session.');
  assert.equal(deep.jobs[1].finishedAt, 6);
  // Silent: the host must not be told to save over the archive it is opening. The returned state is cloneable, without live handles.
  assert.equal(states.length, 0);
  assert.deepEqual(Object.keys(structuredClone(restored).jobs[0]).filter(k => ['controller', 'tools', 'done', '_finish'].includes(k)), []);
  const { id } = deep.start('Et maintenant ?', { mode: 'chat' });
  assert.equal(id, 'deep-10');
  await deep.jobs.at(-1).done;
  assert.equal(deep.jobs.at(-1).status, 'done');
  // A settled copy can no longer be cancelled into another state.
  deep.cancel('Annulée.', 'deep-9');
  assert.equal(deep.jobs[1].message, 'Interrompue à la fermeture de la session.');
});

test('restore is refused while a question is queued or running', async () => {
  let release;
  const deep = new DeepAsk({ makeTools: tools, agent: { answer: () => new Promise(resolve => { release = () => resolve({ answer: 'Ok.', kind: 'explanation', citations: [], limits: [] }); }) } });
  deep.start('En cours ?', { mode: 'chat' });
  assert.throws(() => deep.restore([]), /en cours/);
  await new Promise(resolve => setImmediate(resolve));
  release(); await deep.jobs[0].done;
  deep.restore([]);
  assert.equal(deep.jobs.length, 0);
});

test('first agent event and first model text are measured apart from the first useful information', async () => {
  let clock = 1000;
  const deep = new DeepAsk({ makeTools: tools, now: () => clock,
    agent: { answer: async ({ onProgress }) => {
      clock = 1040; onProgress({ message: 'Recherche…' });
      clock = 1300; onProgress({ preview: 'Début de réponse' });
      clock = 1900; return { answer: 'Réponse.', kind: 'explanation', citations: [], limits: [] };
    } } });
  deep.start('Question ?', { mode: 'chat' });
  await deep.jobs[0].done;
  await new Promise(resolve => setImmediate(resolve));
  const { firstAgentMs, firstTextMs, firstUsefulMs, totalMs } = deep.jobs[0].metrics;
  assert.deepEqual([firstAgentMs, firstTextMs, firstUsefulMs, totalMs], [40, 300, 300, 900]);
});

test('the viewer\'s active instruction reaches a chat turn as its own field, never an inspect turn, and a failing host changes nothing', async () => {
  const seen = [];
  let instruction = '  Vérifie tous les chiffres annoncés.  ';
  const deep = new DeepAsk({ makeTools: tools, getInstruction: () => { if (instruction === 'boom') throw new Error('hôte indisponible'); return instruction; },
    agent: { answer: async input => { seen.push([input.mode, input.instruction, 'instruction' in input]); return { answer: 'Ok.', kind: 'explanation', citations: [], limits: [] }; } } });
  deep.start('Et ce chiffre ?', { mode: 'chat' }); await deep.jobs.at(-1).done;
  deep.start('Revois ce geste', { mode: 'inspect' }); await deep.jobs.at(-1).done;
  instruction = ''; deep.start('Sans consigne ?', { mode: 'chat' }); await deep.jobs.at(-1).done;
  instruction = 'boom'; deep.start('Hôte en panne ?', { mode: 'chat' }); await deep.jobs.at(-1).done;
  instruction = 'x'.repeat(4000); deep.start('Trop longue ?', { mode: 'chat' }); await deep.jobs.at(-1).done;
  assert.deepEqual(seen.slice(0, 4), [['chat', 'Vérifie tous les chiffres annoncés.', true], ['inspect', undefined, false], ['chat', undefined, false], ['chat', undefined, false]]);
  assert.equal(seen[4][1].length, 1500);
  // The published question never carries the instruction as data of its own.
  assert.equal(JSON.stringify(deep.snapshot()).includes('Vérifie tous les chiffres'), false);
});

async function queuedQuestions(t, options = {}, { firstAnswerMs = 0, nextAnswerMs = 0 } = {}) {
  const clock = new VirtualClock().install();
  t.after(() => clock.uninstall());
  let finishFirst;
  const first = new Promise(resolve => { finishFirst = resolve; });
  const states = [], inputs = [];
  const deep = new DeepAsk({
    makeTools: tools,
    now: () => clock.t,
    ...options,
    onChange: state => states.push(structuredClone(state)),
    agent: { answer: async input => {
      inputs.push(input);
      if (input.question === 'Première ?') await first;
      clock.t += input.question === 'Première ?' ? firstAnswerMs : nextAnswerMs;
      return { answer: input.question, kind: 'explanation', citations: [], limits: [] };
    } },
  });
  assert.doesNotThrow(() => deep.start('Première ?', { mode: 'chat' }));
  assert.doesNotThrow(() => deep.start('Suivante ?', { mode: 'chat' }));
  assert.deepEqual(deep.snapshot().jobs.map(job => job.status), ['running', 'queued']);
  finishFirst();
  await clock.runUntil(firstAnswerMs + nextAnswerMs);
  const published = deep.snapshot().jobs;
  assert.deepEqual(published.map(job => [job.status, job.result?.answer]), [
    ['done', 'Première ?'], ['done', 'Suivante ?'],
  ]);
  assert.equal(clock.timers.size, 0);
  return { states, inputs, published };
}

test('a failing trace callback preserves successful published answers and the next queued question', async t => {
  const diagnostics = [];
  const { published } = await queuedQuestions(t, {
    onTrace: (event, fields) => {
      diagnostics.push({ event, ...fields });
      throw Error('diagnostic indisponible');
    },
  });
  for (const job of published) {
    assert.ok(diagnostics.some(item => item.event === 'job.finished' && item.jobId === job.id && item.status === 'done'));
    assert.equal(Object.hasOwn(job, 'errorDetail'), false);
  }
});

test('a synchronous release failure preserves the answer and lets the next queued question finish', async t => {
  let attempts = 0;
  const { published } = await queuedQuestions(t, {
    makeTools: () => ({ ...tools(), release: () => {
      attempts++;
      throw Error('libération incomplète');
    } }),
  });
  assert.equal(attempts, 2);
  assert.ok(published.every(job => Object.hasOwn(job, 'finishedAt')));
});

test('a release failure on queued cancellation does not prevent another question from running', async t => {
  const clock = new VirtualClock().install();
  t.after(() => clock.uninstall());
  let finishFirst, attempts = 0;
  const gate = new Promise(resolve => { finishFirst = resolve; });
  const seen = [], states = [];
  const deep = new DeepAsk({
    now: () => clock.t,
    makeTools: () => ({ ...tools(), release: () => { attempts++; throw Error('libération incomplète'); } }),
    onChange: state => states.push(structuredClone(state)),
    agent: { answer: async ({ question }) => {
      seen.push(question);
      await gate;
      return { answer: question, kind: 'explanation', citations: [], limits: [] };
    } },
  });
  deep.start('En cours ?', { mode: 'chat' });
  const cancelled = deep.start('À annuler ?', { mode: 'chat' });
  deep.start('Suivante ?', { mode: 'chat' });
  assert.doesNotThrow(() => deep.cancel('Annulée.', cancelled.id));
  finishFirst();
  await clock.runUntil(0);
  assert.deepEqual(states.at(-1).jobs.map(job => job.status), ['done', 'cancelled', 'done']);
  assert.deepEqual(seen, ['En cours ?', 'Suivante ?']);
  assert.equal(attempts, 3);
  assert.equal(clock.timers.size, 0);
});

test('unreadable availability stays absent in every publication while queued questions finish', async t => {
  let attempts = 0;
  const { states } = await queuedQuestions(t, {
    makeTools: () => ({ ...tools(), availability: () => {
      attempts++;
      throw Error('disponibilité illisible');
    } }),
  });
  assert.equal(attempts, 2);
  assert.ok(states.every(state => state.jobs.every(job => !Object.hasOwn(job, 'availability'))));
});

test('unreadable freshness omits its fields but preserves measured timings and the next question', async t => {
  let attempts = 0;
  const { published } = await queuedQuestions(t, {
    makeTools: () => ({ ...tools(),
      context: () => ({ contextThroughMs: 6000, analyzedThroughMs: 5000, pendingCount: 1, partialCount: 2, unanalyzedTailMs: 3000 }),
      freshness: () => {
        attempts++;
        throw Error('fraîcheur illisible');
      },
    }),
  }, { firstAnswerMs: 120, nextAnswerMs: 45 });
  assert.equal(attempts, 2);
  assert.deepEqual(published.map(job => ({ waitMs: job.metrics.waitMs, totalMs: job.metrics.totalMs })), [
    { waitMs: 0, totalMs: 120 },
    { waitMs: 120, totalMs: 45 },
  ]);
  for (const job of published) {
    assert.deepEqual(job.metrics.evidence, {
      contextThroughMs: 6000, analyzedThroughMs: 5000, pendingCount: 1, partialCount: 2, unanalyzedTailMs: 3000, lagAtStartMs: 3000,
    });
  }
});

test('an unreadable instruction is absent at the agent and published questions still finish', async t => {
  let attempts = 0;
  const { inputs, states } = await queuedQuestions(t, {
    getInstruction: () => {
      attempts++;
      throw Error('consigne illisible');
    },
  });
  assert.equal(attempts, 2);
  assert.ok(inputs.every(input => !Object.hasOwn(input, 'instruction')));
  assert.ok(states.every(state => state.jobs.every(job => !Object.hasOwn(job, 'instruction'))));
});
