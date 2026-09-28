const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {CodexSessionAgent}=require('../adapters/codex-session-agent.cjs');const {CodexPerception}=require('../adapters/codex-perception.cjs');const {LocalTranscriber}=require('../adapters/local-transcriber.cjs');const {DeepAsk}=require('../core/deep-ask.cjs');const {VideoTools}=require('../core/video-tools.cjs');
(async()=>{
 const agent=new CodexSessionAgent();const transcriber=new LocalTranscriber({model:path.resolve('.local/models/ggml-base.bin')});const perception=new CodexPerception({transcriber,sessionId:'speed-observe'});const metrics={date:new Date().toISOString(),chat:[],perception:[]};
 try{
 const png=await require('sharp')({create:{width:640,height:360,channels:3,background:'#173952'}}).composite([{input:Buffer.from('<svg width="640" height="360"><circle cx="200" cy="180" r="50" fill="yellow"/></svg>')}]).jpeg().toBuffer();
 const audio=await fs.readFile('/tmp/tvlens-jfk.wav');
 let observation;
 for(let i=0;i<2;i++){const started=Date.now();const result=await perception.observe({id:'moment-'+(i+1),startMs:i*15000,endMs:(i+1)*15000,frames:[{atMs:i*15000+1000,dataUrl:'data:image/jpeg;base64,'+png.toString('base64')}],audio});observation=result.observation;metrics.perception.push({elapsedMs:Date.now()-started,...result});}
 const snapshot={id:'speed-chat',history:[],segments:[{id:'moment-1',startMs:0,endMs:15000,status:'ready',available:false,observation}]};
 const service=new DeepAsk({makeTools:(signal,onProgress)=>new VideoTools({snapshot,signal,onProgress,search:{search:async()=>({moments:snapshot.segments})},inspector:{},media:{}}),agent});
 for(const q of ['Ça parle de quoi ?','Et quelle est la couleur du cercle ?','Rappelle-moi sa couleur en un mot.']){let first;const start=Date.now();service.onChange=s=>{if(!first&&s.jobs.at(-1)?.preview)first=Date.now()-start;};service.start(q,{mode:'chat'});await service.jobs.at(-1).done;const job=service.snapshot().jobs.at(-1);assert.equal(job.status,'done',JSON.stringify(job));assert.ok(job.result.citations.length||job.result.kind==='explanation');metrics.chat.push({question:q,elapsedMs:Date.now()-start,firstPreviewMs:first,threadId:job.result.threadId,answer:job.result.answer,activity:job.activity});}
 assert.equal(new Set(metrics.chat.map(x=>x.threadId)).size,1);assert.ok(metrics.chat.every(x=>x.activity.length>1));assert.ok(metrics.perception[0].observation.transcript.length>20);
 await fs.writeFile('docs/codex-speed-live.json',JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics,null,2));
 }finally{await agent.close();await perception.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
