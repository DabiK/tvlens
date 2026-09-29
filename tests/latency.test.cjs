const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DeepAsk}=require('../core/deep-ask.cjs');
const {VideoTools}=require('../core/video-tools.cjs');
const segment=(id,startMs,endMs,status='ready')=>({id,startMs,endMs,status,available:true,observation:status==='ready'?{summary:`Résumé ${id}`} : null});
function factory(snapshot,extras={}){return ()=>new VideoTools({snapshot,search:{},inspector:{},media:{},...extras});}

test('recap publishes sourced memory immediately while synthesis is pending, without inspection',async()=>{
 let finish,received;let now=0;const changes=[];
 const service=new DeepAsk({now:()=>now,onChange:s=>changes.push(s),makeTools:factory({id:'s',elapsedMs:300,history:[],segments:[segment('m1',0,100),segment('m2',100,200),segment('m3',200,300,'queued')]}),agent:{answer:input=>{received=input;return new Promise(r=>finish=r);}}});
 service.start('J’ai décroché',{mode:'chat',intent:'recap',startMs:0,anchorMs:300});
 const job=service.jobs[0];
 assert.equal(job.status,'running');assert.match(job.provisional,/Résumés|résumés/);assert.equal(job.memoryPreview.passages.length,2);assert.equal(job.memoryPreview.pendingCount,1);
 assert.equal(received.context.unanalyzedTailMs,100);assert.equal(job.tools.inspections,0);
 now=40;finish({answer:'Synthèse',kind:'observation',citations:[{id:'m1',startMs:0,endMs:100}],limits:[]});await job.done;
 assert.equal(job.result.kind,'observation');assert.equal(job.metrics.firstUsefulMs,0);assert.equal(job.metrics.totalMs,40);assert.equal(changes.at(-1).jobs[0].metrics.firstUsefulMs,0);
});

test('focused recap cannot borrow earlier conversation or citations and preserves its frozen bounds',async()=>{
 let received,options;const snapshot={id:'s',elapsedMs:500,history:[],segments:[segment('old',0,100),segment('crossing',100,250),segment('target',250,300),segment('future',300,500)]};
 const service=new DeepAsk({makeTools:(signal,onProgress,opts)=>{options=opts;return new VideoTools({snapshot,signal,onProgress});},agent:{answer:async input=>{received=input;return {answer:'Ancien',kind:'observation',citations:[{id:'old',startMs:0,endMs:100}],limits:[]};}}});
 service.start('Sujet ?', {mode:'chat'});await service.jobs[0].done;
 service.start('Résume cet intervalle',{mode:'chat',intent:'recap',startMs:200,anchorMs:300});await service.jobs[1].done;
 assert.equal(options.anchorMs,300);assert.deepEqual(received.conversation,[]);assert.deepEqual(received.context.passages.map(p=>p.id),['target']);assert.equal(service.jobs[1].result.kind,'insufficient');
 await assert.rejects(service.jobs[1].tools.call('get_transcript',{startMs:100,endMs:300}),/Intervalle invalide/);
});

test('metrics survive errors and ungrounded empty deltas do not count as useful information',async()=>{
 let now=10;const service=new DeepAsk({now:()=>now,makeTools:()=>({observations:[],hypotheses:[],limits:[]}),agent:{answer:async({onProgress})=>{onProgress({preview:''});now=35;throw Error('Offline');}}});
 service.start('Explique');await service.jobs[0].done;const job=service.jobs[0];
 assert.equal(job.status,'error');assert.equal(job.metrics.totalMs,25);assert.equal(job.metrics.firstUsefulMs,null);
});

test('tool timing records failures and completed memory reads separately',async()=>{
 let now=1;const tools=new VideoTools({snapshot:{id:'s',elapsedMs:100,history:[],segments:[segment('m',0,100)]},now:()=>now++,search:{search:async()=>({moments:[]})}});
 await tools.call('search_moments',{query:'Sujet'});await assert.rejects(tools.call('get_transcript',{startMs:0,endMs:200}));
 assert.deepEqual(tools.toolMetrics.map(x=>[x.tool,x.status]),[['search_moments','completed'],['get_transcript','failed']]);assert.ok(tools.toolMetrics.every(x=>x.durationMs>0));
});

test('recap context reports omissions and does not silently limit itself to six recent passages',()=>{
 const tools=new VideoTools({snapshot:{id:'s',elapsedMs:1300,history:[],segments:Array.from({length:130},(_,i)=>segment('m'+i,i*10,(i+1)*10))}});
 assert.equal(tools.context({intent:'recap'}).passages.length,120);assert.equal(tools.context({intent:'recap'}).omittedCount,10);
});

test('recap exposes capture holes and partial interval boundaries, with application-enforced limits',async()=>{
 const snapshot={id:'s',elapsedMs:6000,history:[],segments:[segment('excluded-boundary',0,1800),segment('first',1800,2500),segment('second',3000,5000)]};
 let context;
 const service=new DeepAsk({makeTools:factory(snapshot),agent:{answer:async input=>{context=input.context;return {answer:'Résumé incomplet',kind:'observation',citations:[{id:'second',startMs:3000,endMs:5000}],limits:[]};}}});
 service.start('Récapitulatif',{mode:'chat',intent:'recap',startMs:1000,anchorMs:6000});await service.jobs[0].done;
 assert.deepEqual(context.coverageGaps,[{startMs:1000,endMs:1800},{startMs:2500,endMs:3000},{startMs:5000,endMs:6000}]);assert.equal(context.uncoveredMs,2300);
 assert.equal(service.jobs[0].memoryPreview.coverageGaps.length,3);
 assert.ok(service.jobs[0].result.limits.some(x=>x.includes('3 interruption(s)')&&x.includes('2,3 s')));
});

test('coverage unions overlapping segments and ignores recorder jitter up to 250ms',()=>{
 const tools=new VideoTools({snapshot:{id:'s',elapsedMs:2500,history:[],segments:[segment('a',0,1000),segment('b',900,1800),segment('c',2050,2500)]}});
 assert.deepEqual(tools.context({intent:'recap'}).coverageGaps,[]);assert.equal(tools.context().uncoveredMs,0);
});
