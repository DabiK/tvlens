// Paid, explicit paired experiment. No expected answer is passed to any model.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {LocalSessionStore}=require('../adapters/local-store.cjs');
const {ClipInspector}=require('../adapters/clip-inspector.cjs');
const {inspectionStrategy}=require('../adapters/inspection-strategies.cjs');
const {OpenRouterAdapter}=require('../adapters/openrouter.cjs');
const {ResearchBudget}=require('../adapters/trial-budget.cjs');
const {VideoTools}=require('../core/video-tools.cjs');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-paired-'));
 const cases=JSON.parse(await fs.readFile('.local/action-fixtures/manifest.json','utf8'));
 const budget=new ResearchBudget(path.resolve('.local/research-budget.json'));
 const strategies=['native-slow','sheets','sheets-diverse','sheets-crop'];
 let report={date:new Date().toISOString(),model:process.env.TVLENS_INSPECTION_MODEL||'google/gemini-3.8-flash',strategies,protocol:'Paired inspection port test: identical six-second clips, exact question and [0,6000] interval. No retrieval or Codex synthesis, to avoid changing inspected intervals. Full observations are the answers evaluated. End-to-end Codex tested separately.',budgetBefore:budget.snapshot(),cases:[]};
 if(process.argv.includes('--resume'))report=JSON.parse(await fs.readFile('docs/strategy-comparison-live.json','utf8'));
 try{
 for(const c of cases){
  const media=new LocalSessionStore(path.join(dir,String(c.id))),clip=await fs.readFile(path.join('.local/action-fixtures',c.file));
  await media.put('moment-1',{clip,frames:[],audio:null});
  let record=report.cases.find(r=>r.id===c.id);if(!record){record={id:c.id,question:c.question,inputSha256:createHash('sha256').update(clip).digest('hex'),interval:[0,6000],results:[]};report.cases.push(record);}
  // Rotate order per case to avoid systematic latency advantage from execution order.
  const ordered=strategies.slice(c.id%4).concat(strategies.slice(0,c.id%4));
  for(const strategy of ordered){
   const previous=record.results.find(r=>r.strategy===strategy);if(previous?.status==='done')continue;if(previous){(record.failedAttempts||=[]).push(previous);record.results=record.results.filter(r=>r!==previous);}
   const calls=[],controller=new AbortController(),start=Date.now();let timer;
   const model=new OpenRouterAdapter({apiKey:process.env.OPENROUTER_API_KEY,model:report.model,budget,fetchImpl:async(url,options)=>{
    const body=JSON.parse(options.body),at=Date.now();const row={kind:body.max_tokens===450?'region-selection':'inspection',model:body.model,images:body.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(x=>x.type==='image_url').length,video:body.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).some(x=>x.type==='video_url')};calls.push(row);
    try{const response=await fetch(url,options);const data=await response.clone().json();row.elapsedMs=Date.now()-at;row.httpStatus=response.status;row.costUsd=typeof data.usage?.cost==='number'?data.usage.cost:null;row.usage=data.usage||null;if(!response.ok)row.rejection={code:data.error?.code,limitSource:data.error?.metadata?.limit_source,retryAfter:response.headers.get('retry-after'),message:String(data.error?.message||'').replaceAll(process.env.OPENROUTER_API_KEY,'[REDACTED]').slice(0,500)};return response;}catch(error){row.elapsedMs=Date.now()-at;row.costUsd=null;row.error=error.name;throw error;}
   }});
   const tools=new VideoTools({snapshot:{id:`case-${c.id}`,history:[],segments:[{id:'moment-1',startMs:0,endMs:6000,available:true}]},search:null,media,inspector:new ClipInspector({media,model,strategy:inspectionStrategy(strategy)}),signal:controller.signal});
   // Collect preparation diagnostics without passing them to the domain or the model.
   const inspect=tools.inspector.inspect.bind(tools.inspector);let diagnostics;
   tools.inspector.inspect=async args=>{const r=await inspect(args);diagnostics={preparation:r.preparation,sampledFrames:r.sampledFrames,cost:r.cost};return r;};
   const result={strategy,calls};
   try{
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort(new Error('Limite de 60 secondes.'));reject(controller.signal.reason);},60000);});
    result.response=await Promise.race([tools.call('inspect_clip',{question:c.question,startMs:0,endMs:6000}),deadline]);result.status='done';
   }catch(error){result.status=controller.signal.aborted?'timeout':'error';result.error=error.message;}
   finally{clearTimeout(timer);result.elapsedMs=Date.now()-start;result.diagnostics=diagnostics;result.reportedCostUsd=calls.every(x=>x.costUsd!==null)?calls.reduce((n,x)=>n+x.costUsd,0):null;record.results.push(result);report.budgetAfter=budget.snapshot();await fs.writeFile('docs/strategy-comparison-live.json',JSON.stringify(report,null,2));}
   if(calls.some(c=>c.httpStatus===402))throw new Error('OpenRouter 402: comparison suspended; see recorded rejection.');
   console.log(JSON.stringify({case:c.id,strategy,status:result.status,ms:result.elapsedMs,cost:result.reportedCostUsd,observations:result.response?.observations,error:result.error}));
  }
 }
 report.status='pending_full_answer_review';await fs.writeFile('docs/strategy-comparison-live.json',JSON.stringify(report,null,2));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
