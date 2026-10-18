const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {consultationFrom}=require('./helpers/memory-consultation.cjs');
const {DeepAsk}=require('../core/deep-ask.cjs');const {ModelSettings}=require('../adapters/model-settings.cjs');
test('chat follows up within the session and accepts sourced external answers without inventing video citations',async()=>{
 let sessionId='a';const inputs=[];
 const service=new DeepAsk({makeTools:()=>({sessionId,observations:[],hypotheses:[],limits:[]}),agent:{answer:async input=>{inputs.push(input);return inputs.length===1?{answer:'Quel discours ?',kind:'insufficient',citations:[],limits:[]}:{answer:'12 septembre 1962',kind:'external',citations:[],sources:[{url:'https://www.jfklibrary.org/',title:'JFK',evidence:'Rice University'}],limits:[]}}}});
 service.start('Ça date de quand ?',{mode:'chat'});await service.jobs.at(-1).done;
 service.start('Tu peux chercher ?',{mode:'chat'});await service.jobs.at(-1).done;
 assert.equal(inputs[1].conversation[0].question,'Ça date de quand ?');assert.equal(service.jobs[1].result.kind,'external');assert.equal(service.jobs[1].result.citations.length,0);
 sessionId='b';service.start('Autre vidéo',{mode:'chat'});await service.jobs.at(-1).done;assert.deepEqual(inputs[2].conversation,[]);
});
test('external claim without a consulted source cannot become an answer even with video citations',async()=>{
 const service=new DeepAsk({makeTools:()=>({observations:[{id:'m',startMs:0,endMs:1,text:'Un discours'}],hypotheses:[],limits:[]}),agent:{answer:async()=>({kind:'external',answer:'1962',sources:[],citations:[{id:'m',startMs:0,endMs:1}],limits:[]})}});
 service.start('Date ?', {mode:'chat'});await service.jobs[0].done;assert.equal(service.jobs[0].result.kind,'insufficient');assert.match(service.jobs[0].result.answer,/confirmer les sources/);assert.deepEqual(service.jobs[0].result.citations,[]);
});
test('settings persist across instances and reject malformed model IDs without changing existing choice',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-settings-'));try{
 const file=path.join(dir,'models.json');const store=new ModelSettings(file);const value={codexModel:'gpt-6-sol',observationModel:'google/gemini-2.5-flash-lite',inspectionModel:'google/gemini-3.8-flash'};
 await store.save(value);assert.deepEqual(await new ModelSettings(file).load(),value);
 await assert.rejects(store.save({...value,codexModel:'bad\n-c setting'}));assert.deepEqual(await store.load(),value);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('populated memory answers a topic question after an earlier empty turn, without a reinspection',async()=>{
 const {VideoTools}=require('../core/video-tools.cjs');let snapshot={id:'same-session',history:[],segments:[]};let received;
 const service=new DeepAsk({makeTools:()=>new VideoTools({consultation:consultationFrom(snapshot),search:{},inspector:{inspect:()=>{throw Error('Unneeded inspection');}},media:{}}),agent:{answer:async input=>{received=input;const passage=input.context.passages[0];return passage?{answer:'La vidéo traite d’un débat politique, selon les résumés.',kind:'observation',citations:[{id:passage.id,startMs:0,endMs:15026}],limits:[]}:{answer:'Premier segment attendu.',kind:'insufficient',citations:[],limits:[]};}}});
 service.start('Ça parle de quoi ?',{mode:'chat'});await service.jobs.at(-1).done;
 snapshot.segments=[{id:'moment-1',startMs:0.998,endMs:15026.098,status:'ready',available:true,observation:{summary:'Une vidéo présente un débat politique.'}},{id:'moment-2',startMs:15027,endMs:30045,status:'error',available:true}];
 service.start('Ça parle de quoi ?',{mode:'chat'});await service.jobs.at(-1).done;
 const result=service.jobs.at(-1).result;assert.match(result.answer,/débat politique/);assert.equal(result.citations.length,1);assert.equal(result.citations[0].startMs,0.998);assert.equal(received.context.failedCount,1);assert.equal(received.context.passages.length,1);assert.equal(received.context.capturedThroughMs,30045);
});
test('search summaries are registered as memory evidence; forced inspection still cannot use them as action proof',async()=>{
 const {VideoTools}=require('../core/video-tools.cjs');const segment={id:'moment-1',startMs:100,endMs:15000,status:'ready',observation:{summary:'Un débat politique.'}};
 const makeTools=()=>new VideoTools({consultation:consultationFrom({id:'s',segments:[segment],history:[]}),search:{search:async()=>({moments:[{...segment,text:'Un débat politique.'}]})},inspector:{},media:{}});
 const agent={answer:async({tools})=>{await tools.call('search_moments',{query:'sujet'});return {kind:'observation',answer:'Un débat politique.',citations:[{id:segment.id,startMs:100,endMs:15000}],limits:[]};}};
 const chat=new DeepAsk({makeTools,agent});chat.start('Sujet ?', {mode:'chat'});await chat.jobs[0].done;assert.equal(chat.jobs[0].result.kind,'observation');
 const inspect=new DeepAsk({makeTools,agent});inspect.start('Action ?');await inspect.jobs[0].done;assert.equal(inspect.jobs[0].result.kind,'insufficient');
});
test('unrelated or out-of-range citations are rejected, even when memory exists',async()=>{
 const tools={sessionId:'s',observations:[],memoryEvidence:[],hypotheses:[],limits:[],context:()=>({passages:[]})};
 const service=new DeepAsk({makeTools:()=>tools,agent:{answer:async()=>({kind:'observation',answer:'Inventé',citations:[{id:'foreign',startMs:0,endMs:100}],limits:[]})}});
 service.start('Sujet ?', {mode:'chat'});await service.jobs[0].done;assert.equal(service.jobs[0].result.kind,'insufficient');
});

test('explicit Codex with a doubled client exposes identity before refusal and keeps unknown defaults unknown', async () => {
  const { CodexSessionAgent } = require('../adapters/codex-session-agent.cjs');
  const { createConversationRuntime } = require('../runtime/conversation-runtime.cjs');
  const { memoryOf } = require('./helpers/memory-consultation.cjs');
  for (const model of ['gpt-6-sol', '']) {
    const client = { model, reasoningEffort: 'low', authHome: '/PRIVATE_ACCOUNT',
      prepare: async () => { throw Object.assign(Error('Refus.'), { code: 'PROVIDER_REFUSED' }); } };
    const agent = new CodexSessionAgent({ client });
    const identity = { role: 'questions', kind: 'codex', model: model || null, host: null,
      reasoningEffort: 'low', transport: 'injected' };
    assert.deepEqual(agent.identity, identity);
    const traces = [];
    const session = { id: 's', memory: memoryOf({ id: 's', elapsedMs: 0, segments: [], history: [] }),
      search: {}, inspector: {}, memoryMedia: {} };
    const { deep } = createConversationRuntime({ config: { questionsBackend: 'codex' },
      CodexAgent: function () { return agent; }, getSession: () => session,
      onTrace: (event, fields) => traces.push({ event, ...structuredClone(fields) }) });
    deep.start('QUESTION_PRIVATE', { mode: 'chat' });
    await deep.jobs[0].done;
    const job = deep.snapshot().jobs[0];
    assert.equal(job.status, 'error');
    assert.deepEqual(job.metrics.backend, { configured: 'codex', origin: 'substituted', identity });
    assert.deepEqual(job.metrics.calls, { agentInvoked: true, providerRequests: null });
    assert.deepEqual(traces.map(trace => trace.event), ['job.accepted', 'job.started', 'job.error', 'job.finished']);
    for (const trace of traces) assert.deepEqual(trace.backend, job.metrics.backend);
    agent.model = 'next-model';
    assert.deepEqual(deep.snapshot().jobs[0].metrics.backend, job.metrics.backend);
    assert.doesNotMatch(JSON.stringify([job.metrics, traces]), /PRIVATE_|QUESTION_PRIVATE|default/);
  }
});

test('local configuration with an injected or simulated agent never counts an unobserved local inference', async () => {
  const { createConversationRuntime } = require('../runtime/conversation-runtime.cjs');
  const { memoryOf } = require('./helpers/memory-consultation.cjs');
  const session = { id: 's', memory: memoryOf({ id: 's', elapsedMs: 0, segments: [], history: [] }),
    search: {}, inspector: {}, memoryMedia: {} };
  for (const kind of [undefined, 'simulated']) {
    const agent = { identity: kind && { role: 'other', kind, model: null, host: null,
      token: 'PRIVATE_TOKEN', authHome: '/PRIVATE_ACCOUNT', prompt: 'PRIVATE_PROMPT', media: 'PRIVATE_MEDIA' },
    answer: async () => ({ answer: 'Ok.', kind: 'explanation', citations: [], limits: [],
      backend: { kind: 'ollama', model: 'spoofed' } }) };
    const traces = [];
    const { deep } = createConversationRuntime({ getSession: () => session, agent,
      config: { questionsBackend: 'local', localQuestions: { url: 'http://localhost/private?token=PRIVATE_TOKEN', model: 'local' } },
      onTrace: (event, fields) => traces.push({ event, ...structuredClone(fields) }) });
    deep.start('PRIVATE_QUESTION', { mode: 'chat' });
    await deep.jobs[0].done;
    const job = deep.snapshot().jobs[0];
    assert.equal(job.status, 'done');
    assert.deepEqual(job.metrics.backend, { configured: 'local', origin: 'injected',
      identity: { role: 'questions', kind: kind || 'unknown', model: null, host: null } });
    assert.deepEqual(job.metrics.calls, { agentInvoked: true, providerRequests: null });
    assert.doesNotMatch(JSON.stringify([job.metrics, traces]), /PRIVATE|spoofed|\/private/);
  }
});

test('unreadable identity and failing trace diagnostics cannot interrupt answers or queue progression', async () => {
  const { deferred } = require('./helpers/wait.cjs');
  const held = deferred();
  let calls = 0;
  const deep = new DeepAsk({ agent: {
    get identity() { throw Error('PRIVATE_DIAGNOSTIC'); },
    answer: async () => {
      if (++calls === 1) await held.promise;
      return { answer: 'Ok.', kind: 'explanation', citations: [], limits: [] };
    },
  }, makeTools: () => ({ observations: [], hypotheses: [], limits: [] }),
  onTrace: () => { throw Error('PRIVATE_TRACE'); } });
  deep.start('Première', { mode: 'chat' });
  deep.start('Suivante', { mode: 'chat' });
  held.resolve();
  await Promise.all(deep.jobs.map(job => job.done));
  assert.deepEqual(deep.snapshot().jobs.map(job => job.status), ['done', 'done']);
  for (const job of deep.snapshot().jobs) {
    assert.equal(job.result.answer, 'Ok.');
    assert.deepEqual(job.metrics.backend.identity, { role: 'questions', kind: 'unknown', model: null, host: null });
    assert.doesNotMatch(JSON.stringify(job.metrics), /PRIVATE/);
  }
});

test('completed Codex question identities remain unchanged when the selected model changes', async () => {
  const { CodexSessionAgent } = require('../adapters/codex-session-agent.cjs');
  const client = { model: '', reasoningEffort: 'low', opened: new Set(), prepare: async () => {},
    answer: async () => ({ answer: 'Ok.', kind: 'explanation', citations: [], limits: [], audit: [],
      backend: { kind: 'ollama', model: 'spoofed' } }) };
  const agent = new CodexSessionAgent({ client });
  const deep = new DeepAsk({ agent, makeTools: () => ({ sessionId: 's', observations: [], hypotheses: [], limits: [] }) });
  deep.start('Première', { mode: 'chat' });
  await deep.jobs[0].done;
  const first = structuredClone(deep.snapshot().jobs[0]);
  assert.equal(first.metrics.backend.identity.model, null);
  assert.equal(first.result.backend.kind, 'codex');
  agent.model = 'gpt-next';
  deep.start('Suivante', { mode: 'chat' });
  await deep.jobs[1].done;
  assert.deepEqual(deep.snapshot().jobs[0], first);
  assert.equal(deep.snapshot().jobs[1].metrics.backend.identity.model, 'gpt-next');
  assert.deepEqual(deep.snapshot().jobs[1].metrics.calls, { agentInvoked: true, providerRequests: null });
});

test('an unavailable Codex diagnostic parameter cannot prevent a completed response', async () => {
  const { CodexSessionAgent } = require('../adapters/codex-session-agent.cjs');
  const agent = new CodexSessionAgent({ client: {
    model: 'gpt-test', opened: new Set(), prepare: async () => {},
    get reasoningEffort() { throw Error('PRIVATE_DIAGNOSTIC'); },
    answer: async () => ({ answer: 'Ok.', kind: 'explanation', citations: [], limits: [], audit: [] }),
  } });
  const deep = new DeepAsk({ agent, makeTools: () => ({ sessionId: 's', observations: [], hypotheses: [], limits: [] }) });
  deep.start('Question', { mode: 'chat' });
  await deep.jobs[0].done;
  const job = deep.snapshot().jobs[0];
  assert.equal(job.status, 'done');
  assert.equal(job.result.answer, 'Ok.');
  assert.doesNotMatch(JSON.stringify(job.metrics), /PRIVATE_DIAGNOSTIC/);
});
