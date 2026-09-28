const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {MomentSearch}=require('../core/moment-search.cjs');const {VideoTools}=require('../core/video-tools.cjs');const {DeepAsk}=require('../core/deep-ask.cjs');const {LocalSessionStore}=require('../adapters/local-store.cjs');
const segments=[{id:'moment-1',startMs:0,endMs:15000,available:true,observation:{summary:'Une automobile s’immobilise.'}},{id:'moment-2',startMs:15000,endMs:30000,available:true,observation:{summary:'Un chien court.'}}];
const cache=()=>{const m=new Map();return {get:async(id,t)=>m.get(id+t),put:async(id,t,v)=>m.set(id+t,v)}};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('hybrid retrieval finds semantic paraphrases and excludes future evidence; temporal references bypass embeddings',async()=>{
 let calls=0;const search=new MomentSearch({embeddings:{embed:async text=>{calls++;return /chien/.test(text)?[0,1]:[1,0]}},cache:cache()});
 let r=await search.search({query:'voiture arrêtée',segments,anchorMs:30000});assert.equal(r.moments[0].id,'moment-1');assert.equal(r.mode,'hybrid');
 const count=calls;r=await search.search({query:'il y a deux secondes',segments,anchorMs:15000});assert.equal(calls,count);assert.equal(r.moments[0].id,'moment-1');assert.equal(r.moments.length,1);
});
test('embedding failure degrades to explicitly labelled lexical search',async()=>{
 const search=new MomentSearch({embeddings:{embed:async()=>{throw Error('offline')}},cache:cache()});const r=await search.search({query:'chien',segments,anchorMs:30000});assert.equal(r.moments[0].id,'moment-2');assert.equal(r.mode,'lexical');assert.equal(r.warnings.length,1);
});
test('video tools freeze prefix, reject expired/future media and filter fabricated evidence',async()=>{
 const snap={id:'s',history:[],segments:structuredClone(segments)};let leases=0;
 const tools=new VideoTools({snapshot:snap,search:{},media:{lease:async()=>{leases++;return async()=>leases--}},inspector:{inspect:async()=>({observations:[{id:'moment-1',startMs:1,endMs:2,text:'Visible'},{id:'fake',startMs:1,endMs:2,text:'Inventé'}]})}});
 snap.segments.push({id:'future',startMs:30000,endMs:45000});assert.equal(tools.anchorMs,30000);
 await assert.rejects(tools.call('inspect_clip',{startMs:29999,endMs:30001,question:'Que fait-il ?'}),/postérieur/);
 const r=await tools.call('inspect_clip',{startMs:0,endMs:15000,question:'Que fait-il ?'});assert.equal(r.observations.length,1);assert.equal(leases,0);
 tools.segments[0].available=false;await assert.rejects(tools.call('inspect_clip',{startMs:0,endMs:15000,question:'Et ?'}),/expiré/);
});
test('retention lease defers actual deletion only until inspection releases it',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-lease-test-'));try{const media=new LocalSessionStore(dir);await media.put('moment-1',{clip:Buffer.from('video'),frames:[],audio:null});const release=await media.lease(['moment-1']);await media.remove('moment-1');await fs.access(media.file('moment-1','webm'));await release();await assert.rejects(fs.access(media.file('moment-1','webm')));}finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('new questions queue without cancelling; explicit cancellation ignores late output and starts the next job',async()=>{
 const gates=[];const service=new DeepAsk({makeTools:()=>({observations:[],hypotheses:[],limits:[]}),agent:{answer:({signal})=>new Promise(resolve=>gates.push({resolve,signal}))},timeoutMs:1000});
 service.start('first');service.start('second');assert.equal(gates[0].signal.aborted,false);assert.equal(service.jobs[1].status,'queued');assert.equal(gates.length,1);
 service.cancel('Manual',service.jobs[0].id);await service.jobs[0].done;assert.equal(gates[0].signal.aborted,true);gates[0].resolve({answer:'stale',citations:[]});gates[1].resolve({answer:'new',citations:[]});await service.jobs[1].done;
 assert.equal(service.jobs[0].status,'cancelled');assert.equal(service.jobs[0].result,null);assert.equal(service.jobs[1].status,'done');assert.doesNotThrow(()=>structuredClone(service.snapshot()));
});
test('queued questions inherit the completed answer, preserve submission snapshot, and get their own processing deadline',async()=>{
 let release;let anchor=10;const inputs=[];const service=new DeepAsk({makeTools:()=>({sessionId:'s',anchorMs:anchor,observations:[],hypotheses:[],limits:[]}),agent:{answer:async input=>{inputs.push(input);if(inputs.length===1)await new Promise(r=>release=r);return {answer:'Answer',kind:'explanation',citations:[],sources:[],limits:[]};}},timeoutMs:1000});
 service.start('first',{mode:'chat'});service.start('followup',{mode:'chat'});anchor=100;assert.equal(service.jobs[1].startedAt,undefined);release();await Promise.all(service.jobs.map(j=>j.done));assert.ok(service.jobs.every(j=>j.status==='done'));assert.equal(inputs[1].conversation[0].answer,'Answer');assert.equal(inputs[1].tools.anchorMs,10);
});
test('queued cancellation is per question; session reset cancels all outstanding questions',async()=>{
 const service=new DeepAsk({makeTools:()=>({observations:[],hypotheses:[],limits:[]}),agent:{answer:()=>new Promise(()=>{})}});service.start('first');service.start('second');service.start('third');service.cancel('Removed',service.jobs[1].id);assert.equal(service.jobs[0].status,'running');assert.equal(service.jobs[2].status,'queued');service.cancelAll();await Promise.all(service.jobs.map(j=>j.done));assert.ok(service.jobs.every(j=>j.status==='cancelled'));
});
test('deadline returns only acquired observations even if agent never finishes',async()=>{
 const messages=[];
 const service=new DeepAsk({makeTools:()=>({observations:[{id:'moment-1',startMs:0,endMs:1,text:'Un cercle'}],hypotheses:[],limits:[]}),agent:{answer:()=>new Promise(()=>{})},onChange:s=>messages.push(s.jobs[0].message),timeoutMs:25,progressMs:10});service.start('why');await service.jobs[0].done;assert.equal(service.jobs[0].status,'timeout');assert.equal(service.jobs[0].result.answer,'Un cercle');assert.equal(service.active,null);
 assert.ok(messages.some(m=>m.includes('La recherche continue')));
});
test('a confident agent answer without inspected evidence becomes an explicit abstention',async()=>{
 const service=new DeepAsk({makeTools:()=>({observations:[],hypotheses:[],limits:['Aucun geste visible.']}),agent:{answer:async()=>({answer:'Il trébuche sur une pierre.',kind:'observation',citations:[{id:'moment-1',startMs:0,endMs:1000}],limits:[]})}});
 service.start('Pourquoi est-il tombé ?');await service.jobs[0].done;
 assert.equal(service.jobs[0].result.kind,'insufficient');assert.deepEqual(service.jobs[0].result.citations,[]);
 assert.ok(!service.jobs[0].result.answer.includes('pierre'));
});
test('external bridge authenticates capability and real MCP stdio tool calls reach scoped domain',async()=>{
 const {VideoBridge}=require('../adapters/video-bridge.cjs');const {Client}=require('@modelcontextprotocol/sdk/client/index.js');const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-mcp-test-'));let bridge,client;
 try{bridge=await new VideoBridge({descriptor:path.join(dir,'bridge.json'),makeTools:()=>({call:async(name,args)=>({name,args,anchorMs:30000})})}).start();
 const denied=await fetch(bridge.url,{method:'POST',body:'{}'});assert.equal(denied.status,401);
 client=new Client({name:'test',version:'1'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('mcp/server.cjs'),`--descriptor=${bridge.descriptor}`]}));
 const list=await client.listTools();assert.deepEqual(list.tools.map(t=>t.name),['search_moments','get_transcript','inspect_clip']);
 const result=await client.callTool({name:'search_moments',arguments:{query:'un chien'}});assert.equal(JSON.parse(result.content[0].text).anchorMs,30000);
 const controller=new AbortController(),cap=path.join(dir,'cap.json');const revoke=await bridge.register({call:async()=>({ok:true})},controller.signal,cap);const data=JSON.parse(await fs.readFile(cap));controller.abort();const r=await fetch(bridge.url,{method:'POST',headers:{Authorization:`Bearer ${data.token}`},body:JSON.stringify({name:'search_moments',args:{query:'x'}})});assert.equal(r.status,401);revoke();
 }finally{await client?.close();await bridge?.close();await fs.rm(dir,{recursive:true,force:true})}
});
test('real clip decoding spans a segment boundary, aligns PCM audio and constructs native-video evidence',async()=>{
 const {run,ClipInspector}=require('../adapters/clip-inspector.cjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-decode-test-'));
 try{
  const media=new LocalSessionStore(dir);await fs.mkdir(dir,{recursive:true});
  for(const id of ['moment-1','moment-2']){
   await run('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=red:s=160x90:r=10:d=2','-c:v','libvpx','-deadline','realtime',media.file(id,'webm')]);
   const wav=Buffer.alloc(44+2*16000*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
   await fs.writeFile(media.file(id,'json'),JSON.stringify({frames:[],audio:wav.toString('base64')}));
  }
  let evidence;const inspector=new ClipInspector({media,model:{inspect:async input=>{evidence=input.segments;return {observations:[],hypotheses:[],limits:[]}}}});
  const result=await inspector.inspect({question:'Action ?',startMs:1000,endMs:3000,segments:[{id:'moment-1',startMs:0,endMs:2000},{id:'moment-2',startMs:2000,endMs:4000}],signal:AbortSignal.timeout(10000)});
  assert.equal(evidence.length,2);assert.ok(result.sampledFrames>=12&&result.sampledFrames<=32);
  for(const s of evidence){
   assert.equal(s.timeScale,4);
   const dataAt=s.audio.indexOf(Buffer.from('data'));
   const duration=s.audio.readUInt32LE(dataAt+4)/32000;
   assert.ok(duration>3.7&&duration<=4.1,`Aligned slowed audio: ${duration}s`);
  }
  for(const s of evidence){assert.ok(s.videoDataUrl.startsWith('data:video/mp4;base64,'));assert.ok(s.frames.every(f=>f.atMs>=s.startMs&&f.atMs<=s.endMs));}
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
