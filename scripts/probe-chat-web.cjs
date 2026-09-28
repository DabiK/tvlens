const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const {CodexSessionAgent:CodexVideoAgent}=require('../adapters/codex-session-agent.cjs');const {VideoBridge}=require('../adapters/video-bridge.cjs');const {VideoTools}=require('../core/video-tools.cjs');const {DeepAsk}=require('../core/deep-ask.cjs');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-chat-live-'));let bridge,agent;
 try{
 const snapshot={id:'kennedy-fixture',history:[],segments:[{id:'moment-1',startMs:0,endMs:15000,available:false,observation:{summary:'John F. Kennedy prononce un discours dans un stade.',transcript:'We choose to go to the Moon in this decade and do the other things, not because they are easy, but because they are hard.'}}]};
 const makeTools=(signal,onProgress)=>new VideoTools({snapshot,signal,onProgress,search:{search:async()=>({moments:snapshot.segments})},inspector:{inspect:async()=>{throw Error('Pas de vidéo dans cette fixture');}},media:{}});
 bridge=await new VideoBridge({descriptor:path.join(dir,'bridge.json'),makeTools}).start();
 agent=new CodexVideoAgent({bridge,model:process.env.TVLENS_TEST_CODEX_MODEL||''});
 const service=new DeepAsk({makeTools,agent});
 // Prior turn is deliberately insufficient: verifies that a short follow-up restores its subject.
 service.jobs.push({id:'prior',sessionId:snapshot.id,question:'Ça date de quand ce discours de Kennedy ?',result:{kind:'insufficient',answer:'La date n’est pas dans les observations.'},status:'done'});
 service.start('Tu peux chercher ?', {mode:'chat'});await service.jobs.at(-1).done;
 const job=service.snapshot().jobs.at(-1);console.log(JSON.stringify(job,null,2));
 assert.equal(job.status,'done');assert.equal(job.result.kind,'external');assert.ok(job.result.sources.length);assert.match(job.result.answer,/1962/);assert.ok(job.result.audit.some(x=>x.tool==='web_search'));
 await fs.writeFile('docs/chat-web-live.json',JSON.stringify({fixture:'Synthetic transcript provided; real Codex MCP and web; no OpenRouter calls',job},null,2));
 }finally{await agent?.close();await bridge?.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
