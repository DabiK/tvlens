const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DeepAsk}=require('../core/deep-ask.cjs');
const {VideoTools}=require('../core/video-tools.cjs');
const {consultationFrom,rereadOf,memoryOf}=require('./helpers/memory-consultation.cjs');
const {deferred,until}=require('./helpers/wait.cjs');
// Hand-built snapshots: `revision` stands for the published version of a passage.
const pending=(id,startMs,endMs)=>({id,startMs,endMs,status:'analyzing',audioStatus:'analyzing',available:true,observation:null});
const partial=(id,startMs,endMs)=>({id,startMs,endMs,status:'partial',audioStatus:'ready',visionStatus:'analyzing',available:true,revision:1,observation:{transcript:`Paroles ${id}`}});
const ready=(id,startMs,endMs,extra={})=>({id,startMs,endMs,status:'ready',audioStatus:'ready',visionStatus:'ready',available:true,revision:2,observation:{transcript:`Paroles ${id}`,summary:`Résumé ${id}`},...extra});
const snap=(elapsedMs,segments,history=[],id='s')=>({id,elapsedMs,history,segments});
const ids=list=>list.map(x=>x.id);
// Tools frozen on a state written as the session holds it, read through the memory view contract.
const open=(state,extra={})=>new VideoTools({consultation:consultationFrom(state),...extra});
const kept=tools=>tools.consultationScope().passages;

test('a passage analysed after the question is read in its fresh version, with unchanged ids, bounds and anchor',async()=>{
 const initial=snap(3000,[ready('m1',0,1000),partial('m2',1000,2000),pending('m3',2000,3000)]);let current=initial;
 const tools=open(initial,{reread:rereadOf(()=>current)}),frozen=open(initial);
 assert.deepEqual(tools.context().passages.map(p=>[p.id,p.precision,p.revision]),[['m1','automatic-summary',2],['m2','partial-observation',1]]);
 current=snap(9000,[ready('m1',0,1000),ready('m2',1000,2000),partial('m3',2000,3000)]);
 const context=tools.context();
 assert.deepEqual(context.passages.map(p=>[p.id,p.precision,p.revision]),[['m1','automatic-summary',2],['m2','automatic-summary',2],['m3','partial-observation',1]]);
 assert.match(context.passages[1].text,/Résumé m2/);assert.equal(context.anchorMs,3000);assert.equal(context.analyzedThroughMs,2000);assert.equal(context.contextThroughMs,3000);assert.equal(context.partialCount,1);
 const speech=await tools.call('get_transcript',{startMs:1000,endMs:3000});
 assert.deepEqual(speech.passages.map(p=>[p.id,p.summary,p.transcript]),[['m2','Résumé m2','Paroles m2'],['m3','','Paroles m3']]);
 // The consulted copy is isolated from the live session.
 current.segments[1].observation.summary='Modifié après lecture';assert.equal(kept(tools)[1].observation.summary,'Résumé m2');
 assert.deepEqual(kept(tools).map(s=>[s.id,s.startMs,s.endMs]),[['m1',0,1000],['m2',1000,2000],['m3',2000,3000]]);assert.equal(tools.anchorMs,3000);
 assert.deepEqual(tools.journal.filter(e=>e.id==='m2').map(e=>[e.source,e.revision,e.status,e.asOfMs]),[['context',1,'partial',3000],['context',2,'ready',9000],['get_transcript',2,'ready',9000]]);
 assert.deepEqual(tools.journal.at(-1),{source:'get_transcript',id:'m3',startMs:2000,endMs:3000,revision:1,status:'partial',audioStatus:'ready',visionStatus:'analyzing',asOfMs:9000,read:3});
 assert.deepEqual(tools.freshness(),{anchorMs:3000,frozenAtMs:3000,evidenceAsOfMs:9000,refreshes:3,journalEntries:7,journalDropped:0});
 // Without a live provider the prefix stays frozen, as before.
 assert.deepEqual(frozen.context().passages.map(p=>[p.id,p.precision]),[['m1','automatic-summary'],['m2','partial-observation']]);
 assert.equal((await frozen.call('get_transcript',{startMs:1000,endMs:2000})).passages[0].summary,'');
 assert.deepEqual(frozen.freshness(),{anchorMs:3000,frozenAtMs:3000,evidenceAsOfMs:3000,refreshes:0,journalEntries:3,journalDropped:0});
});

test('refresh never widens the prefix: later passages and late arrivals stay invisible to every tool',async()=>{
 const initial=snap(2000,[ready('m1',0,1000),partial('m2',1000,2000)]);
 // Live: m1 archived, m2 analysed, a late arrival inside the prefix, and passages ingested after the anchor.
 const current=snap(60000,[ready('m2',1000,2000),ready('late',1200,1800),ready('m3',2000,3000),ready('m4',3000,4000)],[ready('early',0,400),ready('m1',0,1000)]);
 const searched=[],leased=[],inspected=[];
 const tools=open(initial,{reread:rereadOf(()=>current),
  search:{search:async({segments,anchorMs})=>{searched.push([ids(segments),anchorMs]);return {mode:'lexical',moments:segments.map(s=>({id:s.id,startMs:s.startMs,endMs:s.endMs})),warnings:[]};}},
  media:{lease:async list=>{leased.push(list);return async()=>{};}},
  inspector:{inspect:async({segments})=>{inspected.push(ids(segments));return {observations:[{id:'m2',startMs:1000,endMs:2000,text:'Visible'}]};}}});
 assert.deepEqual(ids(tools.context().passages),['m1','m2']);
 const found=await tools.call('search_moments',{query:'sujet'});
 assert.deepEqual(searched,[[['m1','m2'],2000]]);assert.deepEqual(ids(found.moments),['m1','m2']);assert.equal(found.anchorMs,2000);
 assert.deepEqual(ids((await tools.call('get_transcript',{startMs:0,endMs:2000})).passages),['m1','m2']);
 assert.equal((await tools.call('inspect_clip',{startMs:1000,endMs:2000,question:'Que voit-on ?'})).observations.length,1);
 assert.deepEqual(inspected,[['m2']]);assert.deepEqual(leased,[['m2']]);
 await assert.rejects(tools.call('get_transcript',{startMs:2000,endMs:3000}),/postérieur/);
 await assert.rejects(tools.call('inspect_clip',{startMs:1500,endMs:2500,question:'Et après ?'}),/postérieur/);
 assert.equal(tools.anchorMs,2000);assert.equal(tools.startMs,0);assert.equal(tools.refreshes,4);
 assert.deepEqual(kept(tools).map(s=>[s.id,s.startMs,s.endMs,s.status,s.availability.replayable]),[['m1',0,1000,'ready',false],['m2',1000,2000,'ready',true]]);
 for(const list of [tools.journal,tools.memoryEvidence,tools.transcriptEvidence,tools.observations]){assert.ok(list.length);assert.ok(list.every(e=>['m1','m2'].includes(e.id)));}
 assert.deepEqual(tools.journal.map(e=>[e.source,e.id]),[['context','m1'],['context','m2'],['search_moments','m1'],['search_moments','m2'],['get_transcript','m1'],['get_transcript','m2'],['inspect_clip','m2']]);
 // The scope start is as immutable as the anchor.
 const scoped=open(initial,{reread:rereadOf(()=>current)}).scope({startMs:1000,anchorMs:2000});
 assert.deepEqual(scoped.context().passages.map(p=>[p.id,p.precision]),[['m2','automatic-summary']]);assert.equal(scoped.startMs,1000);assert.deepEqual(ids(kept(scoped)),['m2']);
 // A live passage whose bounds differ is not the frozen passage: the frozen copy is kept.
 const moved=open(initial,{reread:rereadOf(()=>snap(60000,[ready('m1',0,1500,{observation:{summary:'Bornes modifiées'}}),ready('m2',1000,2000)]))});
 assert.deepEqual(moved.context().passages.map(p=>[p.id,p.endMs,p.text]),[['m1',1000,'Résumé m1\nParoles m1'],['m2',2000,'Résumé m2\nParoles m2']]);
});

test('media expiry between the refresh and the lease never yields an observation',async()=>{
 const initial=snap(2000,[ready('m1',0,1000),ready('m2',1000,2000)]);let current=initial,purged=true,held=0;const attempts=[];let inspections=0;
 const tools=open(initial,{reread:rereadOf(()=>current),
  media:{lease:async list=>{attempts.push(list);if(purged)throw Error('Média purgé pendant la question.');held++;return async()=>{held--;};}},
  inspector:{inspect:async()=>{inspections++;return {observations:[{id:'m2',startMs:1000,endMs:2000,text:'Visible'}]};}}});
 // (a) The live session has archived m1 since the question: refused before any lease or inspection budget.
 current=snap(400000,[ready('m2',1000,2000)],[ready('m1',0,1000)]);
 await assert.rejects(tools.call('inspect_clip',{startMs:0,endMs:1000,question:'Que voit-on ?'}),{message:'Média expiré : seul son résumé peut être consulté.'});
 assert.deepEqual(attempts,[]);assert.equal(tools.inspections,0);assert.equal(tools.busy,false);assert.deepEqual(tools.observations,[]);
 // (b) The live session still announces m2, but the store purged it: the lease is the authority.
 await assert.rejects(tools.call('inspect_clip',{startMs:1000,endMs:2000,question:'Que voit-on ?'}),/purgé/);
 assert.deepEqual(attempts,[['m2']]);assert.equal(inspections,0);assert.equal(tools.busy,false);assert.deepEqual(tools.observations,[]);assert.deepEqual(tools.journal,[]);
 // Busy was released: a later inspection goes through and is journaled once.
 purged=false;assert.equal((await tools.call('inspect_clip',{startMs:1000,endMs:2000,question:'Que voit-on ?'})).observations.length,1);
 assert.equal(held,0);assert.deepEqual(tools.journal.map(e=>[e.source,e.id]),[['inspect_clip','m2']]);
 // The summary of the expired passage remains consultable.
 assert.deepEqual((await tools.call('get_transcript',{startMs:0,endMs:1000})).passages.map(p=>[p.summary,p.available]),[['Résumé m1',false]]);
 assert.deepEqual(tools.toolMetrics.map(x=>[x.tool,x.status]),[['inspect_clip','failed'],['inspect_clip','failed'],['inspect_clip','completed'],['get_transcript','completed']]);
});

test('a live snapshot from another session, a missing one or a failing provider keeps the frozen evidence',async()=>{
 const initial=snap(2000,[partial('m1',0,2000)]);let reads=0;
 const tools=open(initial,{reread:rereadOf(()=>{reads++;return snap(9000,[ready('m1',0,2000)],[],'other');})});
 assert.equal(tools.context().passages[0].precision,'partial-observation');
 assert.equal((await tools.call('get_transcript',{startMs:0,endMs:2000})).passages[0].summary,'');
 assert.equal(reads,2);assert.equal(tools.sessionId,'s');assert.equal(tools.refreshes,0);assert.equal(tools.evidenceAsOfMs,2000);
 for(const reread of [()=>null,()=>undefined,()=>{throw Error('Session fermée.');},()=>({session:{id:'s'},clock:{elapsedMs:9000},passages:{}})]){
  const other=open(initial,{reread});
  assert.equal(other.refresh(),false);assert.equal(other.context().passages[0].precision,'partial-observation');assert.equal(other.refreshes,0);
 }
});

test('an aborted question rejects its tool calls without reading the live session',async()=>{
 const controller=new AbortController();let reads=0;
 const tools=open(snap(2000,[partial('m1',0,2000)]),{signal:controller.signal,reread:rereadOf(()=>{reads++;return snap(9000,[ready('m1',0,2000)]);}),search:{search:async()=>({moments:[]})}});
 controller.abort(Error('Question annulée.'));
 await assert.rejects(tools.call('get_transcript',{startMs:0,endMs:2000}),/annulée/);
 await assert.rejects(tools.call('search_moments',{query:'sujet'}),/annulée/);
 await assert.rejects(tools.call('inspect_clip',{startMs:0,endMs:2000,question:'Que voit-on ?'}),/annulée/);
 assert.equal(tools.refresh(),false);assert.equal(tools.context().passages[0].precision,'partial-observation');
 assert.equal(reads,0);assert.equal(tools.refreshes,0);assert.equal(tools.calls,0);
});

test('the latest consulted version is the recorded evidence; its citation is accepted and metrics expose freshness',async()=>{
 const initial=snap(2600,[partial('m1',0,2000)]);let current=initial,now=0;const seen=[];
 const agent={answer:async({context,tools})=>{
  seen.push(context.passages[0].precision);current=snap(5000,[ready('m1',0,2000)]);now=30;
  seen.push((await tools.call('get_transcript',{startMs:0,endMs:2000})).passages[0].summary);
  return {answer:'Le passage est maintenant analysé.',kind:'observation',citations:[{id:'m1',startMs:0,endMs:2000}],limits:[]};}};
 const service=new DeepAsk({now:()=>now,agent,makeTools:signal=>open(initial,{signal,reread:rereadOf(()=>current)})});
 service.start('Sujet ?',{mode:'chat'});const job=service.jobs[0];await job.done;
 assert.deepEqual(seen,['partial-observation','Résumé m1']);
 assert.equal(job.status,'done');assert.equal(job.result.kind,'observation');assert.deepEqual(job.result.citations,[{id:'m1',startMs:0,endMs:2000}]);assert.equal(job.validation.acceptedCitations,1);
 assert.deepEqual(job.tools.memoryEvidence.map(e=>[e.id,e.precision,e.revision,e.text]),[['m1','automatic-summary',2,'Résumé m1\nParoles m1']]);
 assert.deepEqual(job.tools.journal.map(e=>[e.source,e.revision,e.status,e.asOfMs]),[['context',1,'partial',2600],['get_transcript',2,'ready',5000]]);
 assert.deepEqual(job.metrics.evidence,{anchorMs:2600,frozenAtMs:2600,evidenceAsOfMs:5000,refreshes:2,journalEntries:2,journalDropped:0,contextThroughMs:2000,analyzedThroughMs:0,pendingCount:1,partialCount:1,unanalyzedTailMs:2600,lagAtStartMs:600});
 assert.equal(job.metrics.totalMs,30);assert.deepEqual(job.metrics.tools.map(x=>x.tool),['get_transcript']);
 assert.deepEqual(structuredClone(service.snapshot()).jobs[0].metrics.evidence,job.metrics.evidence);
 // Passages without a revision (older snapshots, test doubles) keep today's item shape and the last consultation wins.
 const bare=({revision,...passage})=>passage;let view=snap(2000,[bare(partial('m1',0,2000))]);
 const unversioned=open(view,{reread:rereadOf(()=>view)});unversioned.context();view=snap(4000,[bare(ready('m1',0,2000))]);unversioned.context();
 assert.deepEqual(unversioned.memoryEvidence,[{id:'m1',startMs:0,endMs:2000,text:'Résumé m1\nParoles m1',precision:'automatic-summary',audioStatus:'ready',visionStatus:'ready',audioError:undefined,visionError:undefined,available:true}]);
 // A broken diagnostic costs its own numbers only, never the answer nor the queue.
 const broken=new DeepAsk({agent,makeTools:signal=>Object.assign(open(initial,{signal}),{freshness(){throw Error('Diagnostic cassé.');}})});
 broken.start('Sujet ?',{mode:'chat'});await broken.jobs[0].done;
 assert.equal(broken.jobs[0].status,'done');assert.equal(broken.jobs[0].result.kind,'observation');assert.equal(broken.active,null);
 assert.deepEqual(broken.jobs[0].metrics.evidence,{contextThroughMs:2000,analyzedThroughMs:0,pendingCount:1,partialCount:1,unanalyzedTailMs:2600,lagAtStartMs:600});
 // Tools without context or freshness (inspection mode, test doubles) report an unknown lag, not a number.
 const plain=new DeepAsk({makeTools:()=>({observations:[],hypotheses:[],limits:[]}),agent:{answer:async()=>({answer:'Rien',kind:'insufficient',citations:[],limits:[]})}});
 plain.start('Pourquoi ?');await plain.jobs[0].done;assert.deepEqual(plain.jobs[0].metrics.evidence,{lagAtStartMs:null});
});

test('a search in flight is journaled with the versions it was handed, even if a concurrent read refreshes the view',async()=>{
 const initial=snap(2000,[partial('m1',0,2000)]);let current=initial,finish;
 const tools=open(initial,{reread:rereadOf(()=>current),search:{search:({segments})=>new Promise(resolve=>{finish=()=>resolve({moments:segments.map(s=>({id:s.id,text:s.observation.summary||s.observation.transcript}))});})}});
 const searching=tools.call('search_moments',{query:'sujet'});
 current=snap(5000,[ready('m1',0,2000)]);
 assert.equal((await tools.call('get_transcript',{startMs:0,endMs:2000})).passages[0].summary,'Résumé m1');
 finish();assert.equal((await searching).moments[0].text,'Paroles m1');
 assert.deepEqual(tools.journal.map(e=>[e.source,e.revision,e.status,e.asOfMs]),[['get_transcript',2,'ready',5000],['search_moments',1,'partial',2000]]);
 // The late, older read is journaled but does not replace the newer revision already consulted.
 assert.deepEqual(tools.memoryEvidence.map(e=>[e.id,e.revision,e.precision]),[['m1',2,'automatic-summary']]);assert.equal(kept(tools)[0].status,'ready');
});

test('the evidence journal is bounded and counts what it could not keep',()=>{
 const tools=open(snap(1300,Array.from({length:130},(_,i)=>ready('m'+i,i*10,(i+1)*10))));
 for(let i=0;i<4;i++)tools.context({intent:'recap'});
 assert.equal(tools.journal.length,400);assert.equal(tools.journalDropped,80);assert.equal(tools.memoryEvidence.length,120);
 assert.deepEqual(tools.freshness(),{anchorMs:1300,frozenAtMs:1300,evidenceAsOfMs:1300,refreshes:0,journalEntries:400,journalDropped:80});
});

test('conversation runtime binds the live provider to the session of the question',async()=>{
 const {createConversationRuntime}=require('../runtime/conversation-runtime.cjs');
 const {consultationOf}=require('../core/video-tools.cjs');
 const host=(id,state)=>({id,memory:memoryOf(()=>snap(state.elapsedMs,state.segments,[],id)),memoryMedia:{},search:{},inspector:{}});
 const a={elapsedMs:2000,segments:[partial('m1',0,2000)]};let session=host('a',a);
 let release;const contexts=[];
 const agent={answer:async({question,context})=>{contexts.push(context);if(question==='first')await new Promise(r=>release=r);return {answer:'Réponse',kind:'explanation',citations:[],sources:[],limits:[]};}};
 const runtime=createConversationRuntime({getSession:()=>session,agent});
 // One capability from the view read at creation, one from a consultation supplied by the host.
 const created=runtime.makeTools(),scoped=runtime.makeTools(undefined,undefined,{consultation:consultationOf(session.memory.view())});
 a.elapsedMs=7000;a.segments=[ready('m1',0,2000),ready('m2',2000,4000)];
 assert.equal(created.reread(['m1']).clock.elapsedMs,7000);assert.equal(scoped.reread(['m1']).session.id,'a');
 assert.deepEqual(created.context().passages.map(p=>[p.id,p.precision]),[['m1','automatic-summary']]);assert.equal(created.anchorMs,2000);
 runtime.deep.start('first',{mode:'chat'});runtime.deep.start('second',{mode:'chat'});
 // The host switches to another session that reuses the same passage ids.
 session=host('b',{elapsedMs:9000,segments:[ready('m1',0,2000,{observation:{summary:'Autre session'}})]});
 assert.equal(created.reread(['m1']),null);assert.equal(scoped.reread(['m1']),null);assert.equal(scoped.refresh(),false);
 assert.equal(scoped.context().passages[0].precision,'partial-observation');
 release();await Promise.all(runtime.deep.jobs.map(j=>j.done));
 const [first,second]=runtime.deep.jobs;
 assert.equal(first.metrics.evidence.refreshes,1);assert.equal(second.sessionId,'a');assert.equal(second.metrics.evidence.refreshes,0);
 assert.deepEqual(contexts[1].passages.map(p=>p.text),['Résumé m1\nParoles m1','Résumé m2\nParoles m2']);assert.equal(second.metrics.evidence.evidenceAsOfMs,7000);
 session=null;assert.equal(created.reread(['m1']),null);
});


test('chat validates cited observations and rejects missing, unknown or out-of-scope citations while allowing explanations', async () => {
  const first = ready('moment-1', 0, 15000, { topicSummary: { text: 'CUMUL_HORS_PREUVE' } });
  const last = ready('moment-2', 15000, 30000);
  const initial = snap(30000, [last], [first]);
  const valid = { id: first.id, startMs: first.startMs, endMs: first.endMs };
  const cases = [
    ['observation', [], 'insufficient', []],
    ['observation', [valid], 'observation', [valid]],
    ['observation', [{ ...valid, id: 'invented' }], 'insufficient', []],
    ['observation', [{ id: last.id, startMs: last.startMs, endMs: last.endMs }], 'insufficient', []],
    ['explanation', [], 'explanation', []],
  ];
  for (const [kind, citations, expectedKind, accepted] of cases) {
    const seen = [];
    const deep = new DeepAsk({
      makeTools: signal => open(initial, { signal }),
      agent: { answer: async ({ context, tools }) => {
        seen.push(context);
        const text = await tools.call('get_transcript', { startMs: 0, endMs: 15000 });
        assert.equal(text.passages[0].available, false, 'expired media leave text consultable');
        assert.equal(text.passages[0].transcript, 'Paroles moment-1');
        return { answer: 'Proposition du modèle.', kind, citations, limits: [] };
      } },
    });
    deep.start('Que voyait-on à 00:05 ?', { mode: 'chat', startMs: 0, anchorMs: 15000 });
    await deep.jobs[0].done;
    const job = deep.snapshot().jobs[0];
    assert.equal(job.status, 'done');
    assert.equal(job.result.kind, expectedKind);
    assert.deepEqual(job.result.citations, accepted);
    assert.equal(job.anchorMs, 15000);
    assert.deepEqual(seen[0].passages.map(p => p.id), ['moment-1']);
    assert.doesNotMatch(JSON.stringify(seen), /Résumé moment-2|CUMUL_HORS_PREUVE/);
    if (expectedKind === 'insufficient') {
      assert.notEqual(job.result.answer, 'Proposition du modèle.');
      assert.deepEqual(job.result.observations, []);
      assert.deepEqual(job.result.sources, []);
      assert.deepEqual(job.result.hypotheses, []);
    }
  }
});

// The real composition shared by both hosts, on a session runtime whose providers are in-memory doubles. The
// runtime handed to the questions answers every read of its snapshot, of its passage lists and of its store with
// a failure: the questions may only use its memory view, its bounded rereads and its media port.
async function composedSession(t) {
  const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
  const { createSessionRuntime } = require('../runtime/session-runtime.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-question-memory-'));
  const lanes = new Map(), opened = [], reached = [];
  const lane = id => {
    if (!lanes.has(id)) lanes.set(id, { audio: deferred(), vision: deferred() });
    return lanes.get(id);
  };
  const clock = { time: 0 };
  const open = (id, perception) => {
    const runtime = createSessionRuntime({ id, sessionsRoot: root, userData: root, selectedModels: {}, smoke: true,
      readClock: () => clock.time, wallClock: () => 10000, overrides: { perception } });
    opened.push(runtime);
    return runtime;
  };
  const runtime = open('session', { transcribe: s => lane(s.id).audio.promise, observeVisual: s => lane(s.id).vision.promise });
  const watch = runtime.watch, store = runtime.store;
  const forbidden = new Set(['snapshot', 'segments', 'history']);
  runtime.watch = new Proxy(watch, { get(target, key) {
    if (forbidden.has(key)) {
      reached.push(`watch.${key}`);
      throw Error(`watch.${key} is not part of the consultation contract`);
    }
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  Object.defineProperty(runtime, 'store', { configurable: true, get() {
    reached.push('store');
    throw Error('the store is not part of the consultation contract');
  } });
  t.after(async () => {
    for (const { audio, vision } of lanes.values()) {
      audio.resolve({ observation: {} });
      vision.resolve({ observation: {} });
    }
    runtime.watch = watch;
    Object.defineProperty(runtime, 'store', { configurable: true, writable: true, value: store });
    for (const session of opened) await session.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const block = (startMs, endMs) => ({ startMs, endMs, clip: new Uint8Array([1]), audio: new Uint8Array([2]),
    frames: [{ atMs: startMs, dataUrl: 'data:image/jpeg;base64,YQ==' }] });
  const ingest = async (session, startMs, endMs) => {
    clock.time = endMs;
    return (session === runtime ? watch : session.watch).ingest(block(startMs, endMs));
  };
  const published = (session, id, revision) => until(() => session.memory.passage(id)?.revision === revision, `${id} at revision ${revision}`);
  return { runtime, clock, lane, open, ingest, published, reached };
}
const heard = id => ({ observation: { transcript: `Paroles ${id}` }, elapsedMs: 1 });
const seen = id => ({ observation: { summary: `Résumé ${id}`, visual: `Image ${id}` }, elapsedMs: 1 });

test('a question composed on a real session keeps its anchor and passages while waiting, and reads their later revisions at the same boundaries', async t => {
 const {createConversationRuntime}=require('../runtime/conversation-runtime.cjs');
 const s=await composedSession(t);let current=s.runtime,openFirst;const gate=new Promise(resolve=>{openFirst=resolve;});const reads={};
 const agent={answer:async({question,context,tools})=>{
  if(question==='Première ?'){await gate;return {answer:'Réponse.',kind:'explanation',citations:[],sources:[],limits:[]};}
  reads.context=context;
  // The description of the first passage lands while the question is being answered.
  s.lane('moment-1').vision.resolve(seen('moment-1'));await s.published(s.runtime,'moment-1',2);s.clock.time=17000;
  reads.transcript=await tools.call('get_transcript',{startMs:0,endMs:8000});
  reads.search=await tools.call('search_moments',{query:'Résumé'});
  reads.beyond=await tools.call('get_transcript',{startMs:8000,endMs:16000}).catch(error=>error.message);
  reads.inspected=await tools.call('inspect_clip',{startMs:0,endMs:8000,question:'Que voit-on ?'});
  return {answer:'Le premier passage.',kind:'observation',citations:[{id:'moment-1',startMs:0,endMs:8000}],limits:[]};
 }};
 const {deep}=createConversationRuntime({getSession:()=>current,agent});
 const ask=(question,options)=>{const {id}=deep.start(question,options);return deep.jobs.find(j=>j.id===id);};
 await s.ingest(s.runtime,0,8000);s.clock.time=9000;
 const first=ask('Première ?',{mode:'chat'}),second=ask('Seconde ?',{mode:'chat'});
 assert.deepEqual([second.status,second.anchorMs,second.availability.passages,second.availability.lastPassage.id],['queued',9000,1,'moment-1']);
 // While it waits, the transcript of its passage is published and a passage arrives after its anchor.
 s.lane('moment-1').audio.resolve(heard('moment-1'));await s.published(s.runtime,'moment-1',1);
 await s.ingest(s.runtime,8000,16000);
 openFirst();await first.done;await second.done;
 assert.deepEqual([second.status,second.anchorMs,second.availability.passages],['done',9000,1]);
 assert.deepEqual([reads.context.anchorMs,reads.context.passages.map(p=>[p.id,p.precision,p.revision])],[9000,[['moment-1','partial-observation',1]]]);
 assert.deepEqual(reads.transcript.passages.map(p=>[p.id,p.summary,p.transcript,p.available]),[['moment-1','Résumé moment-1','Paroles moment-1',true]]);
 assert.deepEqual(reads.search.moments.map(m=>m.id),['moment-1'],'the passage received after the anchor is never searched');
 assert.match(reads.beyond,/Intervalle invalide ou postérieur à la question\./);
 assert.deepEqual(reads.inspected.observations.map(o=>o.id),['moment-1']);
 assert.deepEqual(second.tools.journal.map(e=>[e.source,e.id,e.revision,e.status,e.asOfMs]),
  [['context','moment-1',1,'partial',16000],['get_transcript','moment-1',2,'ready',17000],
   ['search_moments','moment-1',2,'ready',17000],['inspect_clip','moment-1',2,'ready',17000]]);
 assert.deepEqual(second.tools.memoryEvidence.map(e=>[e.id,e.revision,e.precision]),[['moment-1',2,'automatic-summary']]);
 assert.deepEqual([second.result.kind,second.result.citations,second.validation.acceptedCitations],['observation',[{id:'moment-1',startMs:0,endMs:8000}],1]);
 assert.deepEqual([second.metrics.evidence.anchorMs,second.metrics.evidence.evidenceAsOfMs],[9000,17000]);
 assert.deepEqual(s.reached,[],'no question read the session snapshot, its passage lists or its store');
});

test('on a real session, missing text, partial analysis and holes keep their warnings, and a session change widens nothing', async t => {
 const {createConversationRuntime,TVLENS_QUESTION_SCOPE_FOREIGN}=require('../runtime/conversation-runtime.cjs');
 const {consultationOf}=require('../core/video-tools.cjs');
 const s=await composedSession(t);let current=s.runtime;const reads={};
 const other=s.open('other',{transcribe:async()=>({observation:{transcript:'Autre session'},elapsedMs:1}),
  observeVisual:async()=>({observation:{summary:'Autre session'},elapsedMs:1})});
 const agent={answer:async({question,tools})=>{
  if(question==='Récapitule.'){reads.missing=await tools.call('get_transcript',{startMs:8000,endMs:16000});}
  else{
   const before=tools.refreshes;current=other;
   reads.afterSwitch=await tools.call('get_transcript',{startMs:0,endMs:8000});reads.refreshed=tools.refreshes-before;
  }
  return {answer:'Réponse.',kind:'observation',citations:[{id:'moment-1',startMs:0,endMs:8000}],limits:[]};
 }};
 const {deep,makeTools}=createConversationRuntime({getSession:()=>current,agent});
 const ask=(question,options)=>{const {id}=deep.start(question,options);return deep.jobs.find(j=>j.id===id);};
 await s.ingest(s.runtime,0,8000);
 s.lane('moment-1').audio.resolve(heard('moment-1'));s.lane('moment-1').vision.resolve(seen('moment-1'));await s.published(s.runtime,'moment-1',2);
 // A transcript that failed, a description still running, a hole in the capture and a passage not analysed yet.
 await s.ingest(s.runtime,8000,16000);s.lane('moment-2').audio.resolve({observation:{transcript:''},failed:true,elapsedMs:1});
 await s.published(s.runtime,'moment-2',1);
 await s.ingest(s.runtime,20000,28000);s.clock.time=30000;
 const recap=ask('Récapitule.',{mode:'chat',intent:'recap',consultation:consultationOf(s.runtime.memory.view()),startMs:0,anchorMs:30000});
 await recap.done;
 assert.deepEqual(reads.missing.passages.map(p=>[p.id,p.transcript,p.audioFailed]),[['moment-2','',true]]);
 assert.deepEqual(recap.memoryPreview.coverageGaps,[{startMs:16000,endMs:20000},{startMs:28000,endMs:30000}]);
 assert.ok(recap.result.limits.some(limit=>limit.includes('2 interruption(s)')),'the holes are said');
 assert.ok(recap.result.limits.some(limit=>limit.includes('encore en analyse')),'the passages still analysed are said');
 assert.ok(recap.result.limits.includes('La fin de l’intervalle demandé n’est pas encore entièrement analysée.'));
 // The host moves to another session that reuses the same passage ids while a question is answered.
 await s.ingest(other,0,8000);await s.published(other,'moment-1',2);current=s.runtime;s.clock.time=31000;
 const moved=ask('Et maintenant ?',{mode:'chat'});await moved.done;
 assert.deepEqual([moved.status,moved.sessionId,reads.refreshed],['done','session',0]);
 assert.deepEqual(reads.afterSwitch.passages.map(p=>[p.id,p.summary]),[['moment-1','Résumé moment-1']]);
 assert.equal(JSON.stringify([moved.tools.memoryEvidence,moved.tools.journal,moved.result]).includes('Autre session'),false);
 // A consultation kept from one session is refused under another.
 assert.throws(()=>makeTools(undefined,undefined,{consultation:consultationOf(s.runtime.memory.view())}),{code:TVLENS_QUESTION_SCOPE_FOREIGN});
 assert.deepEqual(s.reached,[],'no question read the session snapshot, its passage lists or its store');
});
