const {test}=require('node:test'),assert=require('node:assert/strict');
const {consultationFrom}=require('./helpers/memory-consultation.cjs');
const {CachedInspector}=require('../core/cached-inspector.cjs');const {CodexQuota}=require('../adapters/codex-quota.cjs');
const segment=(id,startMs,endMs)=>({id,startMs,endMs,status:'ready',available:true,observation:{summary:'A claim'}});
// The two Auto tests that stood here froze a contract the product reversed (decision 8): a background
// evaluation throttled by a cadence, skipped while a question was pending and aborted by any manual action.
// core/auto-monitor.cjs is gone with them. What they still guaranteed is proved on its replacement in
// tests/surveillance.test.cjs: only what starts after the activation is read, a repeated figure is one claim,
// an explicit stop cancels what is in flight and ignores its late result, and a busy chat never suspends
// the surveillance. tests/mac-ipc-contract.test.cjs holds the Mac host to it (no cancellation on a question).
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
test('saved moments survive the deletion of their session, replay and explicit durable deletion',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const {randomUUID}=require('node:crypto');const {SavedMoments}=require('../core/saved-moments.cjs');const {SavedMomentStore}=require('../adapters/saved-moment-store.cjs');const {LocalSessionStore}=require('../adapters/local-store.cjs');const {SessionLibrary}=require('../adapters/session-library.cjs');
 // No host sweeps raw media any more: the only way a session's media disappear is the explicit deletion of that session.
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-saved-test-'));try{const id=randomUUID(),root=path.join(dir,'sessions'),media=LocalSessionStore.forSession(path.join(root,id));await media.put('moment-1',{clip:Buffer.from('video'),frames:[],audio:null});const archive=new SavedMomentStore(path.join(dir,'saved'));const service=new SavedMoments({archive,makeId:randomUUID});const saved=await service.keep({snapshot:{id,segments:[segment('moment-1',0,1000)]},media});await media.seal();await new SessionLibrary({root}).remove(id);await assert.rejects(fs.access(path.join(root,id)));assert.equal((await service.list()).length,1);assert.equal(await (await archive.response(saved.id,'moment-1')).text(),'video');await service.remove(saved.id);assert.equal((await service.list()).length,0);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('temporal anchor is the send time, not the end of the last stored segment',()=>{
 const {VideoTools}=require('../core/video-tools.cjs');const tools=new VideoTools({consultation:consultationFrom({id:'s',elapsedMs:19000,segments:[segment('m',0,16000)],history:[]})});assert.equal(tools.anchorMs,19000);assert.equal(tools.context().capturedThroughMs,16000);
});
test('queued relative request remains bound to original moment even if capture advances',async()=>{
 const {DeepAsk}=require('../core/deep-ask.cjs');const {VideoTools}=require('../core/video-tools.cjs');let snapshot={id:'s',elapsedMs:10000,history:[],segments:[segment('old',0,10000)]};let unblock;const seen=[];
 const service=new DeepAsk({makeTools:signal=>new VideoTools({consultation:consultationFrom(snapshot),signal,search:{},inspector:{},media:{}}),agent:{answer:async({question,tools})=>{if(question==='first')await new Promise(r=>unblock=r);else seen.push(await tools.call('get_transcript',{startMs:0,endMs:tools.anchorMs}));return {kind:'explanation',answer:'Done',citations:[],limits:[]};}}});
 service.start('first',{mode:'chat'});service.start('Ce qu’il vient de dire ?',{mode:'chat'});snapshot={...snapshot,elapsedMs:20000,segments:[...snapshot.segments,segment('future',10000,20000)]};unblock();await Promise.all(service.jobs.map(j=>j.done));assert.deepEqual(seen[0].passages.map(p=>p.id),['old']);assert.equal(service.jobs[1].anchorMs,10000);
});
