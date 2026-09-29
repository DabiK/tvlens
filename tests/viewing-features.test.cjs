const {test}=require('node:test'),assert=require('node:assert/strict');
const {AutoMonitor}=require('../core/auto-monitor.cjs');const {CachedInspector}=require('../core/cached-inspector.cjs');const {CodexQuota}=require('../adapters/codex-quota.cjs');
const segment=(id,startMs,endMs)=>({id,startMs,endMs,status:'ready',available:true,observation:{summary:'A claim'}});
const result={kind:'observation',answer:'Le chiffre montré est 42.',citations:[{id:'b',startMs:100,endMs:200}],sources:[],limits:[]};
test('Auto starts at activation, throttles, ignores old content, deduplicates and yields to manual questions',async()=>{
 const inputs=[];const auto=new AutoMonitor({evaluate:async input=>{inputs.push(input);return result;}});const snapshot={id:'s',accepting:true,elapsedMs:100,segments:[segment('old',0,99)]};auto.configure({instruction:'Chiffres',frequencySeconds:15},snapshot);
 await auto.tick({...snapshot,elapsedMs:16000,segments:[...snapshot.segments,segment('b',100,200)]},true);assert.equal(inputs.length,0);
 await auto.tick({...snapshot,elapsedMs:16000,segments:[...snapshot.segments,segment('b',100,200)]},false);assert.deepEqual(inputs[0].snapshot.segments.map(x=>x.id),['b']);assert.equal(auto.results.length,1);
 await auto.tick({...snapshot,elapsedMs:17000,segments:[segment('c',200,300)]},false);assert.equal(inputs.length,1);
 await auto.tick({...snapshot,elapsedMs:32000,segments:[segment('c',200,300)]},false);assert.equal(inputs.length,2);assert.equal(auto.results.length,1);auto.stop();
});
test('manual preemption aborts Auto and its late result cannot be published',async()=>{
 let release,signal;const auto=new AutoMonitor({evaluate:input=>{signal=input.signal;return new Promise(r=>release=r);}});auto.configure({instruction:'Chiffres',frequencySeconds:15},{id:'s',elapsedMs:0});const running=auto.tick({id:'s',accepting:true,elapsedMs:16000,segments:[segment('b',0,100)]},false);auto.prioritizeManual();assert.equal(signal.aborted,true);release(result);await running;assert.equal(auto.results.length,0);assert.equal(auto.busy,false);
});
test('inspection cache reuses only same question, interval and media identity, never aborted results',async()=>{
 let calls=0;const cache=new CachedInspector({inspect:async()=>{calls++;return {observations:[{text:'A movement'}],cost:0};}});const input={question:'Que fait-il ?',startMs:0,endMs:10,segments:[segment('a',0,10)]};await cache.inspect(input);assert.equal((await cache.inspect(input)).cacheHit,true);assert.equal(calls,1);await cache.inspect({...input,endMs:9});assert.equal(calls,2);await assert.rejects(cache.inspect({...input,signal:AbortSignal.abort()}));assert.equal(cache.hits,1);
});
test('quota is informational: low, exhausted, missing or unreadable quotas never impose a local block',async()=>{
 const quota=new CodexQuota();const rpc={request:async()=>({ordinaryUsageAllowed:false,rateLimits:{limitId:'codex',primary:{usedPercent:100,windowDurationMins:10080},secondary:{usedPercent:46,windowDurationMins:300}}})};await quota.check(rpc);assert.equal(quota.snapshot().windows[0].remainingPercent,0);assert.equal(quota.snapshot().windows[1].remainingPercent,54);
 await new CodexQuota().check({request:async()=>({})});const failed=new CodexQuota();await failed.check({request:async()=>{throw Error('Unavailable');}});assert.equal(failed.snapshot().unavailable,true);
});
test('frame selection keeps minimum temporal coverage and reserves change-sensitive samples',async()=>{
 const {selectFrameCandidates,visualChange}=await import('../core/frame-policy.mjs');const frames=Array.from({length:21},(_,i)=>({atMs:i*400,change:i===7?1:0}));const chosen=selectFrameCandidates(frames);assert.equal(chosen.length,6);assert.equal(chosen[0].atMs,0);assert.equal(chosen.at(-1).atMs,8000);assert.ok(chosen.some(f=>f.atMs===2400||f.atMs===2800));for(let i=1;i<chosen.length;i++)assert.ok(chosen[i].atMs-chosen[i-1].atMs<=2000);assert.equal(visualChange(new Uint8ClampedArray(64*36*4),new Uint8ClampedArray(64*36*4)),0);
});
test('saved moments survive rolling media deletion, replay and explicit durable deletion',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const {randomUUID}=require('node:crypto');const {SavedMoments}=require('../core/saved-moments.cjs');const {SavedMomentStore}=require('../adapters/saved-moment-store.cjs');const {LocalSessionStore,cleanupRawMedia}=require('../adapters/local-store.cjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-saved-test-'));try{const media=new LocalSessionStore(path.join(dir,'sessions','s'));await media.put('moment-1',{clip:Buffer.from('video'),frames:[],audio:null});const archive=new SavedMomentStore(path.join(dir,'saved'));const service=new SavedMoments({archive,makeId:randomUUID});const saved=await service.keep({snapshot:{id:'s',segments:[segment('moment-1',0,1000)]},media});await cleanupRawMedia(path.join(dir,'sessions'));assert.equal((await service.list()).length,1);assert.equal(await (await archive.response(saved.id,'moment-1')).text(),'video');await service.remove(saved.id);assert.equal((await service.list()).length,0);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('temporal anchor is the send time, not the end of the last stored segment',()=>{
 const {VideoTools}=require('../core/video-tools.cjs');const tools=new VideoTools({snapshot:{id:'s',elapsedMs:19000,segments:[segment('m',0,16000)],history:[]}});assert.equal(tools.anchorMs,19000);assert.equal(tools.context().capturedThroughMs,16000);
});
test('queued relative request remains bound to original moment even if capture advances',async()=>{
 const {DeepAsk}=require('../core/deep-ask.cjs');const {VideoTools}=require('../core/video-tools.cjs');let snapshot={id:'s',elapsedMs:10000,history:[],segments:[segment('old',0,10000)]};let unblock;const seen=[];
 const service=new DeepAsk({makeTools:signal=>new VideoTools({snapshot,signal,search:{},inspector:{},media:{}}),agent:{answer:async({question,tools})=>{if(question==='first')await new Promise(r=>unblock=r);else seen.push(await tools.call('get_transcript',{startMs:0,endMs:tools.anchorMs}));return {kind:'explanation',answer:'Done',citations:[],limits:[]};}}});
 service.start('first',{mode:'chat'});service.start('Ce qu’il vient de dire ?',{mode:'chat'});snapshot={...snapshot,elapsedMs:20000,segments:[...snapshot.segments,segment('future',10000,20000)]};unblock();await Promise.all(service.jobs.map(j=>j.done));assert.deepEqual(seen[0].passages.map(p=>p.id),['old']);assert.equal(service.jobs[1].anchorMs,10000);
});
