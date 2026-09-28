const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
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
test('Codex adapter passes the selected model, permits audited web, and drops URLs never opened',async()=>{
 const {CodexVideoAgent}=require('../adapters/codex-video-agent.cjs');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-agent-test-'));
 try{
 const binary=path.join(dir,'fake-codex');
 await fs.writeFile(binary,`#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{if(!args.includes('model="test-model"')||!args.includes('web_search="live"'))process.exit(2);console.log(JSON.stringify({type:'item.completed',item:{type:'web_search',action:{type:'open_page',url:'https://www.rice.edu/jfk-speech'}}}));fs.writeFileSync(args[args.indexOf('-o')+1],JSON.stringify({answer:'1962',kind:'external',citations:[],limits:[],sources:[{url:'https://www.rice.edu/jfk-speech',title:'Rice',evidence:'Date'},{url:'https://invented.example/x',title:'Fake',evidence:'Fake'}]}));});`,{mode:0o700});
 const agent=new CodexVideoAgent({binary,model:'test-model',bridge:{register:async()=>()=>{}}});
 const result=await agent.answer({question:'Tu peux chercher ?',tools:{anchorMs:1000},signal:AbortSignal.timeout(5000),mode:'chat'});
 assert.equal(result.sources.length,1);assert.equal(result.sources[0].title,'Rice');assert.equal(result.model,'test-model');
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('populated memory answers a topic question after an earlier empty turn, without a reinspection',async()=>{
 const {VideoTools}=require('../core/video-tools.cjs');let snapshot={id:'same-session',history:[],segments:[]};let received;
 const service=new DeepAsk({makeTools:()=>new VideoTools({snapshot,search:{},inspector:{inspect:()=>{throw Error('Unneeded inspection');}},media:{}}),agent:{answer:async input=>{received=input;const passage=input.context.passages[0];return passage?{answer:'La vidéo traite d’un débat politique, selon les résumés.',kind:'observation',citations:[{id:passage.id,startMs:0,endMs:15026}],limits:[]}:{answer:'Premier segment attendu.',kind:'insufficient',citations:[],limits:[]};}}});
 service.start('Ça parle de quoi ?',{mode:'chat'});await service.jobs.at(-1).done;
 snapshot.segments=[{id:'moment-1',startMs:0.998,endMs:15026.098,status:'ready',available:true,observation:{summary:'Une vidéo présente un débat politique.'}},{id:'moment-2',startMs:15027,endMs:30045,status:'error',available:true}];
 service.start('Ça parle de quoi ?',{mode:'chat'});await service.jobs.at(-1).done;
 const result=service.jobs.at(-1).result;assert.match(result.answer,/débat politique/);assert.equal(result.citations.length,1);assert.equal(result.citations[0].startMs,0.998);assert.equal(received.context.failedCount,1);assert.equal(received.context.passages.length,1);assert.equal(received.context.capturedThroughMs,30045);
});
test('search summaries are registered as memory evidence; forced inspection still cannot use them as action proof',async()=>{
 const {VideoTools}=require('../core/video-tools.cjs');const segment={id:'moment-1',startMs:100,endMs:15000,status:'ready',observation:{summary:'Un débat politique.'}};
 const makeTools=()=>new VideoTools({snapshot:{id:'s',segments:[segment],history:[]},search:{search:async()=>({moments:[{...segment,text:'Un débat politique.'}]})},inspector:{},media:{}});
 const agent={answer:async({tools})=>{await tools.call('search_moments',{query:'sujet'});return {kind:'observation',answer:'Un débat politique.',citations:[{id:segment.id,startMs:100,endMs:15000}],limits:[]};}};
 const chat=new DeepAsk({makeTools,agent});chat.start('Sujet ?', {mode:'chat'});await chat.jobs[0].done;assert.equal(chat.jobs[0].result.kind,'observation');
 const inspect=new DeepAsk({makeTools,agent});inspect.start('Action ?');await inspect.jobs[0].done;assert.equal(inspect.jobs[0].result.kind,'insufficient');
});
test('unrelated or out-of-range citations are rejected, even when memory exists',async()=>{
 const tools={sessionId:'s',observations:[],memoryEvidence:[],hypotheses:[],limits:[],context:()=>({passages:[]})};
 const service=new DeepAsk({makeTools:()=>tools,agent:{answer:async()=>({kind:'observation',answer:'Inventé',citations:[{id:'foreign',startMs:0,endMs:100}],limits:[]})}});
 service.start('Sujet ?', {mode:'chat'});await service.jobs[0].done;assert.equal(service.jobs[0].result.kind,'insufficient');
});
