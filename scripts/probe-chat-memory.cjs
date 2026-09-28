const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const {CodexSessionAgent:CodexVideoAgent}=require('../adapters/codex-session-agent.cjs');const {VideoBridge}=require('../adapters/video-bridge.cjs');const {VideoTools}=require('../core/video-tools.cjs');const {DeepAsk}=require('../core/deep-ask.cjs');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-memory-live-'));let bridge,agent;
 try{
 const snapshot={id:'topic-memory-fixture',history:[],segments:[
  {id:'moment-1',startMs:0.998,endMs:15026.098,status:'ready',available:false,observation:{summary:'La vidéo présente un article de Mediapart et des accusations de propos antisémites visant Jordan Bardella. Il s’agit de ce que rapporte la vidéo, non d’une vérification de ces accusations.'}},
  {id:'moment-2',startMs:15027.498,endMs:30045.198,status:'error',available:false},
  {id:'moment-3',startMs:30046.498,endMs:45065.898,status:'ready',available:false,observation:{summary:'Un présentateur commente cette polémique politique devant un titre à l’écran.'}}
 ]};
 const makeTools=(signal,onProgress)=>new VideoTools({snapshot,signal,onProgress,search:{search:async()=>({moments:snapshot.segments})},inspector:{inspect:async()=>{throw Error('Pas de vidéo dans cette fixture');}},media:{}});
 bridge=await new VideoBridge({descriptor:path.join(dir,'bridge.json'),makeTools}).start();
 agent=new CodexVideoAgent({bridge,model:process.env.TVLENS_TEST_CODEX_MODEL||''});
 const service=new DeepAsk({makeTools,agent});
 // Prior turn is deliberately insufficient: verifies that a short follow-up restores its subject.
 service.jobs.push({id:'prior',sessionId:snapshot.id,question:'ça parle de quoi',result:{kind:'insufficient',answer:'Aucun passage disponible au moment de la question.'},status:'done'});
 service.start('ça parle de quoi ?', {mode:'chat'});await service.jobs.at(-1).done;
 const job=service.snapshot().jobs.at(-1);console.log(JSON.stringify(job,null,2));
 assert.equal(job.status,'done');assert.equal(job.result.kind,'observation');assert.ok(job.result.citations.length);assert.match(job.result.answer,/Bardella|politique|accusation/i);assert.doesNotMatch(job.result.answer,/aucun contenu|0:00|pas obtenu de preuve/i);
 await fs.writeFile('docs/chat-memory-live.json',JSON.stringify({fixture:'Synthetic populated memory with one failed segment and prior empty response; real Codex; no OpenRouter calls',job},null,2));
 }finally{await agent?.close();await bridge?.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
