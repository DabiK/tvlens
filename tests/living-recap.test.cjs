const {test}=require('node:test');const assert=require('node:assert/strict');
const {LivingRecap}=require('../core/living-recap.cjs');
const source=(id,startMs,endMs,text='Une scène',status='ready')=>({id,startMs,endMs,status,available:true,observation:status==='ready'?{summary:text}:null});
const snapshot=(segments,history=[],id='s')=>({id,segments,history});
const synthesize=({chapters,newPassages})=>({overview:'Vue d’ensemble de la session. Les sujets évoluent.',chapters:[...chapters.map(c=>({...c})),...newPassages.filter(p=>!chapters.some(c=>c.sourceIds.includes(p.id))).map(p=>({title:'Sujet '+p.id,summary:p.text,sourceIds:[p.id]}))]});

test('first ready passage synthesizes immediately, later passages throttle and pending-to-ready changes trigger work',async()=>{
 let now=0,calls=0;const recap=new LivingRecap({now:()=>now,summarize:async input=>{calls++;return synthesize(input);}});
 recap.observe(snapshot([source('a',0,8000,'Premier sujet')]));await recap.tick();assert.equal(calls,1);assert.equal(recap.snapshot().status,'ready');
 now=1000;recap.observe(snapshot([source('a',0,8000,'Premier sujet'),source('b',8000,16000,'','queued')]));await recap.tick();assert.equal(calls,1);assert.ok(recap.snapshot().limits.some(x=>x.includes('encore en analyse')));
 now=2000;recap.observe(snapshot([source('a',0,8000,'Premier sujet'),source('b',8000,16000,'Nouveau sujet')]));await recap.tick();assert.equal(calls,1);assert.equal(recap.snapshot().pendingCount,1);
 now=25000;await recap.tick();assert.equal(calls,2);assert.equal(recap.snapshot().chapters.length,2);assert.equal(recap.snapshot().pendingCount,0);
});

test('long session keeps every original and chapter while expired media becomes unavailable independently',async()=>{
 let now=0;const inputs=[];const recap=new LivingRecap({now:()=>now,summarize:async input=>{inputs.push(input);return synthesize(input);}});
 recap.observe(snapshot([source('old',0,8000,'Origine du sujet')]));await recap.tick();
 now=400000;recap.observe(snapshot([source('new',400000,408000,'Suite du sujet')],[{...source('old',0,8000,'Origine du sujet'),available:false}]));await recap.tick();
 const value=recap.snapshot();assert.equal(value.sourcePassages.length,2);assert.equal(value.sourcePassages[0].text.includes('Origine'),true);
 assert.deepEqual(inputs[1].newPassages.map(p=>p.id),['new']);assert.equal(inputs[1].chapters[0].summary.includes('Origine'),true);
 assert.equal(value.chapters[0].sources[0].available,false);assert.equal(value.chapters[1].sources[0].available,true);assert.equal(value.chapters[1].startMs,400000);assert.ok(value.limits.some(x=>x.includes('interruption')));
});

test('repeated subjects can merge with exact source provenance and application-calculated bounds',async()=>{
 const recap=new LivingRecap({summarize:async()=>({overview:'Un seul sujet se poursuit.',chapters:[{title:'Sujet commun',summary:'La discussion continue.',sourceIds:['b','a'],startMs:999,endMs:999999}]})});
 recap.observe(snapshot([source('a',0,8000),source('b',8000,16000)]));await recap.tick();const chapter=recap.snapshot().chapters[0];
 assert.equal(chapter.startMs,0);assert.equal(chapter.endMs,16000);assert.deepEqual(chapter.sourceIds,['a','b']);
 recap.observe(snapshot([source('b',8000,16000)],[source('a',0,8000)]));assert.deepEqual(recap.snapshot().chapters[0].replaySourceIds,['b']);
});

test('busy questions abort background synthesis, retain the last result, and ignore late completions',async()=>{
 let now=0,finish,calls=0,signal;const recap=new LivingRecap({now:()=>now,summarize:input=>{calls++;if(calls===1)return synthesize(input);signal=input.signal;return new Promise(r=>finish=r);}});
 recap.observe(snapshot([source('a',0,8000)]));await recap.tick();const previous=recap.snapshot().overview;
 now=30000;recap.observe(snapshot([source('a',0,8000),source('b',8000,16000)]));const running=recap.tick();await recap.tick({busy:true});assert.equal(signal.aborted,true);assert.equal(recap.snapshot().overview,previous);
 finish({overview:'STALE',chapters:[{title:'Stale',summary:'Stale',sourceIds:['a','b']}]});await running;assert.equal(recap.snapshot().overview,previous);assert.equal(recap.snapshot().pendingCount,1);
});

test('reset rejects stale previous-session output and newly arrived passages remain pending',async()=>{
 let finish;const recap=new LivingRecap({summarize:input=>new Promise(r=>finish=()=>r(synthesize(input)))});
 recap.observe(snapshot([source('a',0,100)]));const running=recap.tick();recap.reset('next');finish();await running;assert.equal(recap.snapshot().overview,'');assert.equal(recap.snapshot().sourceCount,0);
 recap.observe(snapshot([source('b',0,100)],[],'next'));const next=recap.tick();recap.observe(snapshot([source('b',0,100),source('c',100,200)],[],'next'));finish();await next;assert.equal(recap.snapshot().sourceCount,2);assert.equal(recap.snapshot().pendingCount,1);assert.deepEqual(recap.snapshot().overviewSourceIds,['b']);
});

test('invented, duplicate, omitted or malformed sources never replace a valid recap',async()=>{
 let now=0,result;const recap=new LivingRecap({now:()=>now,summarize:async input=>result||synthesize(input)});
 recap.observe(snapshot([source('a',0,100)]));await recap.tick();const original=recap.snapshot().overview;
 recap.observe(snapshot([source('a',0,100),source('b',100,200)]));
 for(const sourceIds of [['a','invented'],['a','a'],['a']]){now+=30000;result={overview:'Invalid',chapters:[{title:'X',summary:'X',sourceIds}]};await recap.tick();assert.equal(recap.snapshot().status,'error');assert.equal(recap.snapshot().overview,original);assert.equal(recap.snapshot().pendingCount,1);}
 now+=30000;result={overview:'',chapters:[]};await recap.tick();assert.equal(recap.snapshot().overview,original);
});

test('same-ID source corrections are sent again while replay-only changes do not trigger synthesis',async()=>{
 let now=0;const inputs=[];const recap=new LivingRecap({now:()=>now,summarize:async input=>{inputs.push(input);return synthesize(input);}});
 recap.observe(snapshot([source('a',0,100,'Initial')]));await recap.tick();
 now=30000;recap.observe(snapshot([], [source('a',0,100,'Initial')]));await recap.tick();assert.equal(inputs.length,1);
 recap.observe(snapshot([], [source('a',0,100,'Corrigé')]));await recap.tick();assert.equal(inputs.length,2);assert.equal(inputs[1].newPassages[0].text.includes('Corrigé'),true);
});

test('Codex adapter uses a dedicated session, summaries-only instructions and denies tool calls',async()=>{
 const {CodexRecap}=require('../adapters/codex-recap.cjs');let input,closed=false;
 const adapter=new CodexRecap({agent:{answer:async value=>{input=value;return {overview:'Résumé',chapters:[]};},close:async()=>{closed=true;}}});
 await adapter.summarize({sessionId:'s',chapters:[],newPassages:[{id:'a',startMs:0,endMs:100,text:'Texte source',available:true,secretMedia:'SHOULD_NOT_LEAK'}],limits:[],signal:new AbortController().signal});
 assert.equal(input.tools.sessionId,'s-living-recap');assert.match(input.instructions,/Texte source/);assert.doesNotMatch(input.instructions,/SHOULD_NOT_LEAK/);assert.equal(input.outputSchema.additionalProperties,false);await assert.rejects(input.tools.call(),/uniquement les textes/);await adapter.close();assert.equal(closed,true);
});

test('every synthesis receives historical originals as well as chapters to prevent cumulative summary drift',async()=>{
 let now=0;const inputs=[];const recap=new LivingRecap({now:()=>now,summarize:async input=>{inputs.push(input);return synthesize(input);}});
 recap.observe(snapshot([source('old',0,100,'Citation originale importante')]));await recap.tick();now=30000;
 recap.observe(snapshot([source('new',100,200,'Nouveau sujet')],[source('old',0,100,'Citation originale importante')]));await recap.tick();
 assert.deepEqual(inputs[1].sourcePassages.map(p=>p.id),['old','new']);assert.match(inputs[1].sourcePassages[0].text,/Citation originale importante/);
});

test('a stalled provider times out without losing the last valid summary and is aborted',async()=>{
 let now=0,calls=0,signal;const recap=new LivingRecap({timeoutMs:10,now:()=>now,summarize:input=>{if(++calls===1)return synthesize(input);signal=input.signal;return new Promise(()=>{});}});
 recap.observe(snapshot([source('a',0,100)]));await recap.tick();const previous=recap.snapshot().overview;now=30000;
 recap.observe(snapshot([source('a',0,100),source('b',100,200)]));await recap.tick();assert.equal(signal.aborted,true);assert.equal(recap.snapshot().status,'error');assert.equal(recap.snapshot().overview,previous);assert.match(recap.snapshot().error,/délai/);
});

test('unchanged busy ticks do not emit duplicate state or archive writes',async()=>{
 let changes=0;const recap=new LivingRecap({onChange:()=>changes++,summarize:async input=>synthesize(input)});
 recap.observe(snapshot([source('a',0,100)]));const before=changes;
 await recap.tick({busy:true});await recap.tick({busy:true});assert.equal(changes,before);
 await recap.tick();const ready=changes;await recap.tick({busy:true});await recap.tick({busy:true});assert.equal(changes,ready);
});

test('observing unchanged source state does not republish the entire recap archive',()=>{
 let changes=0;const recap=new LivingRecap({onChange:()=>changes++,summarize:async input=>synthesize(input)});
 recap.observe(snapshot([source('a',0,100)]));const before=changes;
 recap.observe(snapshot([source('a',0,100)]));assert.equal(changes,before);
 recap.observe(snapshot([], [source('a',0,100)]));assert.equal(changes,before+1);
});

test('oversized history is rejected explicitly rather than silently omitted from a global recap',async()=>{
 const {CodexRecap}=require('../adapters/codex-recap.cjs');let called=false;const adapter=new CodexRecap({agent:{answer:async()=>{called=true;}}});
 await assert.rejects(adapter.summarize({sessionId:'s',chapters:[],newPassages:[],sourcePassages:[{id:'huge',startMs:0,endMs:100,text:'x'.repeat(240001)}],limits:[],signal:new AbortController().signal}),/dernier résumé reste disponible/);
 assert.equal(called,false);
});

test('source observations and busy ticks preserve a synthesis error until the next attempt',async()=>{
 let now=0,fail=true;const recap=new LivingRecap({now:()=>now,summarize:async input=>{if(fail)throw Error('Connexion perdue');return synthesize(input);}});
 recap.observe(snapshot([source('a',0,100)]));await recap.tick();assert.equal(recap.snapshot().status,'error');
 recap.observe(snapshot([source('a',0,100),source('b',100,200)]));await recap.tick({busy:true});assert.equal(recap.snapshot().status,'error');assert.equal(recap.snapshot().error,'Connexion perdue');
 fail=false;now=30000;await recap.tick();assert.equal(recap.snapshot().status,'ready');assert.equal(recap.snapshot().error,null);
});
