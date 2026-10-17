const test = require('node:test');
const assert = require('node:assert/strict');
const { DeepAsk } = require('../core/deep-ask.cjs');
const { VirtualClock } = require('./helpers/clock.cjs');
const { deferred } = require('./helpers/wait.cjs');

const tools = () => ({ sessionId: 's1', anchorMs: 9000, observations: [], hypotheses: [], limits: [], memoryEvidence: [{ id: 'moment-1', startMs: 0, endMs: 8000 }], transcriptEvidence: [] });

test('a publication accepts diagnostic identity without a question job', () => {
  const diagnostics = [], snapshots = [], refusal = Error('observer failed');
  const deep = new DeepAsk({
    onChange: state => { snapshots.push(state); throw refusal; },
    onPublicationError: event => diagnostics.push(event),
  });
  const context = { sessionId: 'ended-session', jobId: 'finished-question' };
  assert.doesNotThrow(() => deep.emit(context));
  assert.deepEqual(diagnostics, [{
    code: 'TVLENS_STATE_PUBLICATION_FAILED', origin: 'deep-ask', ...context, error: refusal,
  }]);
  assert.doesNotThrow(() => deep.emit({ sessionId: 'ended-session' }));
  assert.equal(diagnostics[1].sessionId, 'ended-session');
  assert.equal(diagnostics[1].jobId, undefined);
  assert.deepEqual(snapshots, [{ jobs: [] }, { jobs: [] }]);
  assert.deepEqual(deep.snapshot(), { jobs: [] });
});

for (const brokenDiagnostic of [false, true]) {
  test(`failed publications preserve queued answers, timers and tool release (diagnostic throws: ${brokenDiagnostic})`, async t => {
    const clock = new VirtualClock().install();
    t.after(() => clock.uninstall());
    const gates = [deferred(), deferred()], calls = [], released = [], attempted = [], diagnostics = [];
    const refusal = Error('observateur indisponible');
    const deep = new DeepAsk({
      makeTools: () => {
        const value = tools();
        value.release = () => released.push(value);
        return value;
      },
      now: () => clock.t,
      progressMs: 10,
      timeoutMs: 100,
      onChange: state => { attempted.push(structuredClone(state)); throw refusal; },
      onPublicationError: event => {
        diagnostics.push(event);
        if (brokenDiagnostic) throw Error('journal indisponible');
      },
      agent: { answer: async input => {
        const gate = gates[calls.length];
        calls.push(input);
        input.onProgress({ message: 'Recherche…', preview: 'Brouillon' });
        await gate.promise;
        return { answer: input.question, kind: 'explanation', citations: [], limits: [] };
      } },
    });
    assert.doesNotThrow(() => deep.start('Première ?', { mode: 'chat' }));
    assert.doesNotThrow(() => deep.emit());
    assert.equal(diagnostics.at(-1).jobId, 'deep-1', 'an omitted context uses the active question');
    assert.doesNotThrow(() => deep.start('Suivante ?', { mode: 'chat' }));
    assert.equal(diagnostics.at(-1).jobId, 'deep-2', 'a queued publication identifies the queued job while another is active');
    assert.deepEqual(deep.snapshot().jobs.map(job => job.status), ['running', 'queued']);
    await clock.runUntil(10);
    assert.ok(deep.snapshot().jobs[0].message.includes('La recherche continue'));
    gates[0].resolve();
    await clock.runUntil(10);
    await deep.jobs[0].done;
    assert.deepEqual(calls.map(input => input.question), ['Première ?', 'Suivante ?']);
    gates[1].resolve();
    await clock.runUntil(10);
    await deep.jobs[1].done;
    assert.deepEqual(deep.snapshot().jobs.map(job => [job.status, job.result.answer]), [
      ['done', 'Première ?'], ['done', 'Suivante ?'],
    ]);
    assert.equal(deep.active, null);
    assert.equal(clock.timers.size, 0);
    assert.deepEqual(released, calls.map(input => input.tools));
    assert.equal(diagnostics.length, attempted.length);
    assert.ok(diagnostics.every(event => event.code === 'TVLENS_STATE_PUBLICATION_FAILED'
      && event.origin === 'deep-ask' && event.sessionId === 's1' && event.error === refusal));
    assert.deepEqual([...new Set(diagnostics.map(event => event.jobId))].sort(), ['deep-1', 'deep-2']);
    assert.equal(diagnostics.at(-1).jobId, 'deep-2');
    assert.ok(attempted.some(state => state.jobs[0].status === 'queued'));
    assert.ok(attempted.some(state => state.jobs[1]?.status === 'running'));
    assert.ok(attempted.some(state => state.jobs[1]?.metrics));
  });
}

for (const ending of ['cancelled', 'timeout']) {
  test(`failed publications preserve ${ending} results and release late tools only after the agent returns`, async t => {
    const clock = new VirtualClock().install();
    t.after(() => clock.uninstall());
    const gate = deferred(), released = [], attempts = [], diagnostics = [], inputs = [];
    let sequence = 0;
    const deep = new DeepAsk({
      now: () => clock.t,
      timeoutMs: 50,
      progressMs: 10,
      makeTools: () => {
        const id = ++sequence;
        return { ...tools(), observations: [{ id: 'moment-1', startMs: 0, endMs: 1000, text: 'Observation acquise.' }],
          release: () => released.push(id) };
      },
      onChange: state => { attempts.push(state); throw Error('observer failed'); },
      onPublicationError: event => { diagnostics.push(event); throw Error('diagnostic failed'); },
      agent: { answer: async input => {
        inputs.push(input);
        if (input.question === 'Lente ?') await gate.promise;
        return { answer: 'Réponse tardive.', kind: 'explanation', citations: [], limits: [] };
      } },
    });
    const first = deep.start('Lente ?', { mode: 'chat' });
    const queued = deep.start('À annuler ?', { mode: 'chat' });
    deep.start('Suivante ?', { mode: 'chat' });
    assert.doesNotThrow(() => deep.cancel('Annulée en attente.', queued.id));
    await deep.jobs[1].done;
    assert.deepEqual(released, [2]);
    if (ending === 'cancelled') assert.doesNotThrow(() => deep.cancel('Annulée.', first.id));
    await clock.runUntil(ending === 'timeout' ? 50 : 0);
    await Promise.all(deep.jobs.map(job => job.done));
    const state = deep.snapshot();
    assert.deepEqual(state.jobs.map(job => job.status), [ending, 'cancelled', 'done']);
    assert.equal(state.jobs[0].result.answer, 'Observation acquise.');
    assert.equal(inputs[0].signal.aborted, true);
    assert.deepEqual(inputs.map(input => input.question), ['Lente ?', 'Suivante ?']);
    assert.deepEqual(released, [2, 3], 'the late agent still owns its tools');
    assert.equal(deep.active, null);
    assert.equal(clock.timers.size, 0);
    gate.resolve();
    await clock.runUntil(clock.t);
    assert.deepEqual(released, [2, 3, 1]);
    assert.deepEqual(deep.snapshot(), state, 'a late answer cannot replace the acquired outcome');
    assert.equal(diagnostics.length, attempts.length);
    assert.ok(diagnostics.every(event => event.code === 'TVLENS_STATE_PUBLICATION_FAILED'
      && event.origin === 'deep-ask' && event.sessionId === 's1' && event.jobId));
  });
}

test('a real agent rejection retains its own diagnostic when state publications fail', async t => {
  const clock = new VirtualClock().install();
  t.after(() => clock.uninstall());
  const diagnostics = [], refusal = Object.assign(Error('provider refused'), { code: 'PROVIDER_FAILED' });
  const deep = new DeepAsk({
    makeTools: tools,
    onChange: () => { throw Error('observer failed'); },
    onPublicationError: event => diagnostics.push(event),
    serializeError: error => ({ code: error.code }),
    agent: { answer: async () => { throw refusal; } },
  });
  deep.start('Question ?', { mode: 'chat' });
  await clock.runUntil(0);
  await deep.jobs[0].done;
  const job = deep.snapshot().jobs[0];
  assert.equal(job.status, 'error');
  assert.equal(job.message, refusal.message);
  assert.deepEqual(job.errorDetail, { code: 'PROVIDER_FAILED' });
  assert.ok(diagnostics.length > 0);
  assert.ok(diagnostics.every(event => event.code === 'TVLENS_STATE_PUBLICATION_FAILED' && event.error !== refusal));
  assert.equal(clock.timers.size, 0);
});

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

for (const [code, message, question, options] of [
  ['TVLENS_QUESTION_INVALID', 'Question invalide.', ' ', {}],
  ['TVLENS_QUESTION_ACTION_INVALID', 'Action inconnue.', 'Pourquoi ?', { intent: 'other' }],
  ['TVLENS_QUESTION_INTERVAL_INVALID', 'Intervalle de question invalide.', 'Pourquoi ?', { startMs: 2, anchorMs: 1 }],
]) {
  test(`question refusals expose ${code} without transport metadata`, () => {
    const emitter = require('../core/deep-ask.cjs');
    const deep = new DeepAsk({});
    assert.throws(() => deep.start(question, options), error => {
      assert.equal(error.code, code);
      assert.equal(emitter[code], code);
      assert.equal(error.message, message);
      assert.equal(error.status, undefined);
      return true;
    });
  });
}

test('a full question queue refuses with its own exported identity and keeps every admitted question', async t => {
  const clock = new VirtualClock().install();
  t.after(() => clock.uninstall());
  const gate = deferred();
  const deep = new DeepAsk({ makeTools: tools, agent: { answer: async () => {
    await gate.promise;
    return { answer: 'Réponse.', kind: 'explanation', citations: [], limits: [] };
  } } });
  t.after(async () => { deep.cancelAll(); gate.resolve(); await clock.runUntil(0); });
  for (let i = 0; i < 6; i++) deep.start('Pourquoi ?');
  assert.throws(() => deep.start('Pourquoi encore ?'), error => {
    assert.equal(error.code, 'TVLENS_QUESTION_QUEUE_FULL');
    assert.equal(require('../core/deep-ask.cjs').TVLENS_QUESTION_QUEUE_FULL, error.code);
    assert.equal(error.message, 'Cinq questions sont déjà en attente. Attends une réponse ou annule une question.');
    assert.equal(error.status, undefined);
    return true;
  });
  assert.equal(deep.snapshot().jobs.length, 6);
});
