// Explicit live comparison: same fixed clips and question, sparse Ask vs video reinspection.
// Keyword hints are diagnostic only: acceptance requires review of actions AND intervals.
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {OpenRouterAdapter}=require('../adapters/openrouter.cjs');const {OpenRouterEmbeddings,EMBEDDING_MODEL}=require('../adapters/openrouter-embeddings.cjs');const {EmbeddingStore}=require('../adapters/embedding-store.cjs');const {ResearchBudget}=require('../adapters/trial-budget.cjs');const {LocalSessionStore}=require('../adapters/local-store.cjs');const {ClipInspector}=require('../adapters/clip-inspector.cjs');const {MomentSearch}=require('../core/moment-search.cjs');const {VideoTools}=require('../core/video-tools.cjs');const {VideoBridge}=require('../adapters/video-bridge.cjs');const {CodexVideoAgent}=require('../adapters/codex-video-agent.cjs');const {DeepAsk}=require('../core/deep-ask.cjs');
async function main(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-action-eval-'));const fixture=path.resolve('.local/action-fixtures');
 const cases=JSON.parse(await fs.readFile(path.join(fixture,'manifest.json'),'utf8'));
 const budget=new ResearchBudget(path.resolve('.local/research-budget.json'));const before=budget.snapshot();
 const model=new OpenRouterAdapter({apiKey:process.env.OPENROUTER_API_KEY,model:'google/gemini-2.5-flash-lite',audioInput:true,budget});
 const inspectionModelName=process.env.TVLENS_INSPECTION_MODEL||'google/gemini-3.8-flash';
 const inspectionModel=new OpenRouterAdapter({apiKey:process.env.OPENROUTER_API_KEY,model:inspectionModelName,audioInput:true,budget});
 const embeddings=new OpenRouterEmbeddings({apiKey:process.env.OPENROUTER_API_KEY,budget});
 const bridge=await new VideoBridge({descriptor:path.join(root,'bridge.json'),makeTools:()=>{throw Error('Use scoped capability')}}).start();
 const agent=new CodexVideoAgent({binary:path.join(os.homedir(),'.local/bin/codex'),bridge});
 const report={date:new Date().toISOString(),models:{baseline:'google/gemini-2.5-flash-lite',inspection:inspectionModelName,embeddings:EMBEDDING_MODEL},corpus:'10 synthetic geometric action clips, fixed before inference; no speech; baseline frames at 0 and 5 s',limitations:['Synthetic clips, not a measurement of film or human-action accuracy.','Keyword hints are not correctness scores. Full answers and intervals require explicit review.','Timing references are sampled evidence intervals, not frame-exact causal ground truth.'],cases:[],budgetBefore:before};
 try{
 for(const c of cases){
  try {
  const media=new LocalSessionStore(path.join(root,String(c.id)));const frames=await Promise.all([0,50].map(async f=>({atMs:f*100,dataUrl:'data:image/jpeg;base64,'+(await fs.readFile(path.join(fixture,`${String(c.id).padStart(2,'0')}-${f}.jpg`))).toString('base64')})));
  await media.put('moment-1',{clip:await fs.readFile(path.join(fixture,c.file)),frames,audio:null});
  const segment={id:'moment-1',startMs:0,endMs:6000,status:'ready',available:true,hasAudio:false};
  try {segment.observation=(await model.observe({...segment,frames,audio:null})).observation;}catch(error){segment.observation={summary:'Analyse initiale indisponible.',uncertainty:error.message};}
  let baseline;try{baseline=await model.ask({question:c.question,anchorMs:6000,context:[segment],history:[],evidence:[{...segment,frames,audio:null}],conversation:[]});}catch(error){baseline={answer:'',error:error.message};}
  const snapshot={id:`case-${c.id}`,segments:[segment],history:[]};
  const search=new MomentSearch({embeddings,cache:new EmbeddingStore(path.join(media.root,'embeddings.json'),EMBEDDING_MODEL)});
  const inspector=new ClipInspector({media,model:inspectionModel});
  const service=new DeepAsk({agent,makeTools:(signal,onProgress)=>new VideoTools({snapshot,search,inspector,media,signal,onProgress})});
  const start=Date.now();service.start(c.question);await service.jobs[0].done;
  const job=service.snapshot().jobs[0];
  const matches=text=>{const words=text.toLowerCase().replace(/\b\d+(?:[.,:]\d+)*\b/g,'');return c.matchGroups.every(group=>group.some(term=>!/^\d+$/.test(term)&&words.includes(term)));};
  const denseText=job.result?.answer||'';
  const densePass=matches(denseText)&&Boolean(job.result?.citations.some(x=>x.id==='moment-1'&&x.startMs<c.eventEndMs&&x.endMs>c.eventStartMs));
  report.cases.push({id:c.id,expected:c.expected,question:c.question,baseline,baselineKeywordHint:matches(baseline.answer),deep:job,deepKeywordHint:densePass,elapsedMs:Date.now()-start});
  await fs.writeFile('docs/action-evaluation-live.json',JSON.stringify({...report,budgetAfter:budget.snapshot()},null,2));
  console.log(JSON.stringify({case:c.id,baselineKeywordHint:matches(baseline.answer),deepKeywordHint:densePass,status:job.status,ms:Date.now()-start,answer:denseText}));
  } catch(error) { report.cases.push({id:c.id,expected:c.expected,error:error.message,baselineKeywordHint:false,deepKeywordHint:false});console.log(JSON.stringify({case:c.id,error:error.message})); }
 }
 report.summary={status:'pending_review',baselineKeywordHints:report.cases.filter(x=>x.baselineKeywordHint).length,deepKeywordHints:report.cases.filter(x=>x.deepKeywordHint).length,total:cases.length};report.budgetAfter=budget.snapshot();await fs.writeFile('docs/action-evaluation-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));
 if(report.cases.some(c=>c.error))process.exitCode=2;
 }finally{await bridge.close();await fs.rm(root,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
