const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const {CodexRpc}=require('./codex-rpc.cjs');const {schema,buildPrompt,companionPersona}=require('./codex-video-agent.cjs');const {isolatedEnvironment}=require('./codex-verifier.cjs');
const range={startMs:{type:'number'},endMs:{type:'number'}};
const dynamicTools=[
 {type:'function',name:'search_moments',description:'Chercher des passages dans la mémoire observée. Les résumés ne prouvent pas une action détaillée.',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false}},
 {type:'function',name:'get_transcript',description:'Lire paroles et résumés par segment. Intervalle maximal 60 secondes.',inputSchema:{type:'object',properties:range,required:['startMs','endMs'],additionalProperties:false}},
 {type:'function',name:'inspect_clip',description:'Réexaminer image/son, maximum 20 secondes et deux inspections par question. Analyse multimodale via le port de réexamen configuré.',inputSchema:{type:'object',properties:{...range,question:{type:'string'}},required:['startMs','endMs','question'],additionalProperties:false}}
];
function sourceKey(value){try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return null;url.hash='';return url.href;}catch{return null;}}
function streamedAnswer(json){const match=json.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)/);if(!match)return '';try{return JSON.parse('"'+match[1]+'"');}catch{return '';}}
class CodexSessionAgent {
 constructor({binary='codex',authHome,model='',webSearch=true,quota,rpcFactory=options=>new CodexRpc(options)}={}){Object.assign(this,{binary,authHome,model,webSearch,quota,rpcFactory});this.tail=Promise.resolve();this.opened=new Set();this.sent=new Map();}
 answer(input){const pending=this.tail.catch(()=>{}).then(()=>this.run(input));this.tail=pending;return pending;}
 async prepare(sessionId){if(this.ready&&this.sessionId===sessionId)return this.ready;if(this.ready||this.dir)await this.close();this.sessionId=sessionId;this.ready=this.connect().catch(async e=>{await this.close();throw e;});return this.ready;}
 async connect(){
  this.dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-codex-session-'));const home=path.join(this.dir,'home');await fs.mkdir(home,{mode:0o700});
  const authHome=this.authHome||process.env.CODEX_HOME||path.join(os.homedir(),'.codex');
  for(const name of ['auth.json','models_cache.json']){const source=path.join(authHome,name);try{await fs.access(source);await fs.symlink(source,path.join(home,name));}catch{}}
  const args=['--no-daemon','app-server','--stdio'];
  for(const feature of ['shell_tool','unified_exec','shell_snapshot','apps','plugins','hooks','computer_use','browser_use','view_image','image_generation','multi_agent','memories','skill_search'])args.push('--disable',feature);
  args.push('--enable','skip_host_skill_discovery','-c','web_search="live"','-c','project_doc_max_bytes=0','-c','history.persistence="none"');
  const rpc=this.rpcFactory({binary:this.binary,args,cwd:this.dir,env:isolatedEnvironment(process.env,home),onEvent:(m,p)=>{if(this.rpc===rpc)this.event(m,p);},onRequest:(m,p)=>{if(this.rpc!==rpc)throw Error('Connexion obsolète.');return this.tool(m,p);}});this.rpc=rpc;rpc.start();
  await this.rpc.request('initialize',{clientInfo:{name:'tvlens',version:'0.3.0'},capabilities:{experimentalApi:true}});this.rpc.send({method:'initialized',params:{}});
  const result=await this.rpc.request('thread/start',{cwd:this.dir,approvalPolicy:'never',sandbox:'read-only',ephemeral:true,model:this.model||null,dynamicTools,baseInstructions:companionPersona+'  Réponds aux questions avec la mémoire fournie et les outils autorisés. Aucun travail de programmation. Aucun accès fichiers, shell ou connecteur.',config:{web_search:this.webSearch?'live':'disabled'}});
  this.threadId=result.thread.id;this.opened.clear();this.sent.clear();return this.threadId;
 }
 async tool(method,p){
  const active=this.active;if(method!=='item/tool/call'||!active||p.threadId!==this.threadId||p.turnId!==active.turnId||active.signal.aborted||!dynamicTools.some(t=>t.name===p.tool))throw Error('Outil non autorisé.');
  active.onProgress?.({message:{search_moments:'Recherche dans la mémoire…',get_transcript:'Lecture des paroles observées…',inspect_clip:'Réexamen des images et du son…'}[p.tool]});
  try{const value=await active.tools.call(p.tool,p.arguments);active.signal.throwIfAborted();active.audit.push({tool:p.tool,status:'completed'});return {success:true,contentItems:[{type:'inputText',text:JSON.stringify(value)}]};}
  catch(e){active.audit.push({tool:p.tool,status:'failed'});return {success:false,contentItems:[{type:'inputText',text:e.message}]};}
 }
 event(method,p){
  const active=this.active;if(method==='connection/closed'){this.ready=null;active?.reject(Error('Connexion Codex interrompue. Réessaie la question.'));return;}
  if(!active||p.threadId!==this.threadId)return;
  if(method==='turn/started'&&!active.turnId)active.turnId=p.turn.id;
  if(p.turnId&&active.turnId&&p.turnId!==active.turnId)return;
  if(method==='item/started'){
   const item=p.item;
   if(item.type==='webSearch')active.onProgress?.({message:item.action?.type==='openPage'?'Consultation d’une source…':'Recherche sur Internet…'});
   else if(item.type==='agentMessage')active.onProgress?.({message:'Rédaction de la réponse…'});
   else if(item.type==='reasoning')active.onProgress?.({message:'Codex examine le contexte…'});
   else if(['commandExecution','fileChange','collabAgentToolCall','mcpToolCall'].includes(item.type)){active.reject(Error('Outil hors du périmètre TVLens.'));this.rpc.request('turn/interrupt',{threadId:this.threadId,turnId:active.turnId}).catch(()=>{});}
  }
  // No raw reasoning is emitted. Only tool lifecycle, concise status and final-answer deltas.
  if(method==='item/agentMessage/delta'){
   active.text+=p.delta;const text=streamedAnswer(active.text);
   if(text&&Date.now()-active.lastPreview>80){active.lastPreview=Date.now();active.onProgress?.({message:'Rédaction de la réponse…',preview:text});}
  }
  if(method==='item/completed'){
   const item=p.item;if(item.type==='webSearch'){const url=item.action?.url;if(sourceKey(url)){this.opened.add(sourceKey(url));active.onProgress?.({message:'Source consultée : '+new URL(url).hostname});}active.audit.push({action:item.action?.type,tool:'web_search',url,status:'completed'});}
   if(item.type==='agentMessage'&&item.phase==='commentary'&&item.text)active.onProgress?.({provisional:item.text.slice(0,1600)});
   if(item.type==='agentMessage'&&item.phase!=='commentary')active.final=item.text;
  }
  if(method==='turn/completed'&&(!active.turnId||p.turn.id===active.turnId)){
   if(p.turn.status!=='completed')active.reject(Error(p.turn.status==='interrupted'?'Recherche annulée.':'Codex n’a pas terminé la réponse.'));
   else active.resolve(active.final||active.text);
  }
 }
 async run({question,tools,signal,context,conversation=[],mode='chat',onProgress,mediaInput=[],outputSchema=schema,instructions,sourceRepair=false}){
  signal.throwIfAborted();const started=Date.now();onProgress?.({message:this.ready?'Lecture du contexte de la session…':'Connexion à Codex…'});
  await this.prepare(tools.sessionId);signal.throwIfAborted();await this.quota?.check(this.rpc);signal.throwIfAborted();
  const prior=new Map(this.sent);const fresh=context?{...context,passages:context.passages.filter(p=>prior.get(p.id)!==JSON.stringify(p))}:context;
  let prompt=instructions||buildPrompt({question,tools,context:fresh,conversation:prior.size?[]:conversation,mode})+'\nLes passages fournis sont une mise à jour de la même session : conserve ceux déjà lus, mais ne suppose pas une continuité pendant les pauses. Réutilise le contexte du fil pour les relances ; ne refais pas une recherche déjà suffisante. Les médias anciens peuvent avoir expiré.';
  if(!instructions){
   prompt+='\nURLs dont la consultation a été observée dans ce fil (seules ces URLs peuvent être réutilisées sans nouvelle ouverture) : '+JSON.stringify([...this.opened])+'. Pour toute autre source, ouvre sa véritable URL HTTPS avec le web, pas seulement un identifiant interne de résultat. Un résultat de recherche seul ne suffit pas à attester la lecture de la page.';
   if(sourceRepair)prompt+='\nLa précédente proposition de sources n’a pas pu être validée par l’application. Termine la demande initiale : ouvre explicitement les URLs HTTPS pertinentes avec le web, puis fournis la réponse et les sources consultées. N’invente aucun lien. Si cela échoue, réponds kind=insufficient et explique brièvement que le lien/la source n’a pas pu être confirmé. Ne remplace pas cette demande par un résumé vidéo.';
  }
  let resolve,reject;const done=new Promise((a,b)=>{resolve=a;reject=b;});done.catch(()=>{});
  const active=this.active={tools,signal,onProgress,resolve,reject,audit:[],text:'',final:'',lastPreview:0,turnId:null};
  let abortedAt=0;
  const abort=()=>{abortedAt ||= Date.now();onProgress?.({message:'Annulation…'});if(active.turnId)this.rpc.request('turn/interrupt',{threadId:this.threadId,turnId:active.turnId}).catch(()=>{});};
  signal.addEventListener('abort',abort,{once:true});let watchdog;
  try{
   const response=await this.rpc.request('turn/start',{threadId:this.threadId,input:[{type:'text',text:prompt},...mediaInput],model:this.model||null,effort:'low',summary:'none',outputSchema});active.turnId=response.turn.id;
   if(signal.aborted)abort();
   const interrupted=new Promise((_,fail)=>{const check=()=>{watchdog=setTimeout(()=>{if(signal.aborted&&Date.now()-abortedAt>=3000){this.rpc.close();fail(signal.reason);}else check();},1000);};check();});
   const raw=await Promise.race([done,interrupted]);signal.throwIfAborted();const result=JSON.parse(raw);
   if(instructions)return {...result,threadId:this.threadId,elapsedMs:Date.now()-started};
   if(typeof result.answer!=='string'||!Array.isArray(result.citations)||!Array.isArray(result.limits))throw Error('Réponse Codex invalide.');
   for(const passage of context?.passages||[])this.sent.set(passage.id,JSON.stringify(passage));
   const sources=(result.sources||[]).filter(s=>sourceKey(s.url)&&this.opened.has(sourceKey(s.url))&&typeof s.title==='string'&&typeof s.evidence==='string').slice(0,6);
   const sourceValidation={proposed:(result.sources||[]).length,accepted:sources.length,rejected:(result.sources||[]).filter(s=>!sources.includes(s)).map(s=>({url:s.url,reason:'URL non consultée ou source mal formée'}))};
   if(mode==='chat'&&this.webSearch&&!sourceRepair&&!sources.length&&(result.kind==='external'||sourceValidation.proposed)){
    onProgress?.({message:'Confirmation des liens sources…'});
    clearTimeout(watchdog);signal.removeEventListener('abort',abort);
    const repaired=await this.run({question,tools,signal,context,conversation,mode,onProgress,sourceRepair:true});
    return {...repaired,audit:[...active.audit,...(repaired.audit||[])],sourceRepair:{initial:sourceValidation},elapsedMs:Date.now()-started};
   }
   return {...result,sources,sourceValidation,sourcesReused:active.audit.some(x=>x.tool==='web_search')?0:sources.length,audit:active.audit,threadId:this.threadId,model:this.model||'default',elapsedMs:Date.now()-started};
  }finally{clearTimeout(watchdog);signal.removeEventListener('abort',abort);if(this.active===active)this.active=null;}
 }
 async close(){this.active?.reject(Error('Session Codex fermée.'));const rpc=this.rpc;this.rpc=null;this.ready=null;this.threadId=null;rpc?.close();this.opened.clear();this.sent.clear();if(this.dir){const dir=this.dir;this.dir=null;await fs.rm(dir,{recursive:true,force:true});}}
}
module.exports={CodexSessionAgent,streamedAnswer,dynamicTools};
