// Legacy CLI/MCP adapter retained for historical evaluation scripts.
// Production conversation uses CodexSessionAgent and direct dynamic tools.
const { videoToolNames } = require('../core/video-tool-contracts.cjs');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {spawn}=require('node:child_process');
const {invocation,isolatedEnvironment}=require('./codex-verifier.cjs');
const { schema, buildPrompt, companionPersona } = require('./companion-prompt.cjs');
class CodexVideoAgent{
 constructor({binary='codex',authHome,bridge,model='',nodeBinary=process.execPath,mcpScript=path.join(__dirname,'..','mcp','server.cjs')}){Object.assign(this,{binary,authHome,bridge,model,nodeBinary,mcpScript});}
 async answer({question,tools,signal,conversation=[],context,mode='inspect'}){
  signal.throwIfAborted();const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-agent-'));let revoke;
  try{
   const descriptor=path.join(dir,'capability.json'),output=path.join(dir,'answer.json'),schemaFile=path.join(dir,'schema.json');
   await fs.writeFile(schemaFile,JSON.stringify(schema),{mode:0o600});revoke=await this.bridge.register(tools,signal,descriptor);
   const args=invocation(dir,schemaFile,output);args.pop();
   const cfg={'web_search':mode==='chat'?'live':'disabled','model_reasoning_effort':'low','mcp_servers.tvlens.command':this.nodeBinary,'mcp_servers.tvlens.args':[this.mcpScript,`--descriptor=${descriptor}`],'mcp_servers.tvlens.env':{ELECTRON_RUN_AS_NODE:'1'},'mcp_servers.tvlens.enabled_tools':videoToolNames,'mcp_servers.tvlens.startup_timeout_sec':10,'mcp_servers.tvlens.tool_timeout_sec':45,'mcp_servers.tvlens.default_tools_approval_mode':'approve'};
   if(this.model)cfg.model=this.model;
   for(const [key,value]of Object.entries(cfg))args.push('-c',`${key}=${toml(value)}`);args.push('-');
   const prompt=buildPrompt({question,tools,conversation,context,mode});
   const audit=await runAgent(this.binary,args,dir,isolatedEnvironment(process.env,this.authHome),prompt,signal,mode==='chat');
   signal.throwIfAborted();const result=JSON.parse(await fs.readFile(output,'utf8'));
   if(typeof result.answer!=='string'||!Array.isArray(result.citations)||!Array.isArray(result.limits))throw new Error('Réponse Codex invalide.');
   const opened=new Set(audit.filter(x=>x.tool==='web_search').map(x=>x.url).filter(Boolean));
   const sources=(result.sources||[]).filter(s=>opened.has(s.url)&&/^https:\/\//.test(s.url)&&typeof s.title==='string'&&typeof s.evidence==='string').slice(0,6);
   return {...result,sources,audit,model:this.model||'default'};
  }finally{revoke?.();await fs.rm(dir,{recursive:true,force:true});}
 }
}
function toml(v){if(Array.isArray(v))return '['+v.map(toml).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).map(([k,x])=>`${JSON.stringify(k)}=${toml(x)}`).join(',')+'}';return JSON.stringify(v);}
function runAgent(binary,args,cwd,env,prompt,signal,allowWeb=false){
 signal.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{cwd,env,stdio:['pipe','pipe','pipe'],shell:false,detached:process.platform!=='win32'});let pending='',size=0,failure,killTimer,closed=false;const audit=[];
  const kill=()=>{try{if(child.pid&&process.platform!=='win32')process.kill(-child.pid,'SIGTERM');else child.kill();}catch{}killTimer=setTimeout(()=>{if(!closed)try{if(child.pid&&process.platform!=='win32')process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{}},1000);};
  const abort=()=>{failure=signal.reason||new Error('Recherche annulée.');kill();};signal.addEventListener('abort',abort,{once:true});
  const line=s=>{let e;try{e=JSON.parse(s);}catch{return;}const item=e.item;
   if(item?.type==='mcp_tool_call'){if(item.server!=='tvlens'||!videoToolNames.includes(item.tool)){failure=new Error('Outil non autorisé.');kill();}else if(e.type==='item.completed')audit.push({tool:item.tool,status:item.status});}
   if(item?.type==='web_search'&&allowWeb&&e.type==='item.completed')audit.push({tool:'web_search',url:item.action?.url,status:'completed'});
   if(['command_execution','file_change',...(!allowWeb?['web_search']:[])].includes(item?.type)){failure=new Error('Outil hors du périmètre vidéo.');kill();}
   if(e.type==='turn.failed'||e.type==='error'){failure=new Error('Codex n’a pas terminé le réexamen. Vérifie sa connexion.');kill();}
  };
  child.stdout.on('data',b=>{size+=b.length;if(size>2000000){failure=new Error('Sortie Codex trop volumineuse.');kill();return;}pending+=b.toString();const lines=pending.split('\n');pending=lines.pop();lines.forEach(line);});child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
  const clean=()=>{closed=true;clearTimeout(killTimer);signal.removeEventListener('abort',abort);};
  child.on('error',()=>{clean();reject(new Error('Codex indisponible. Vérifie son installation et sa connexion.'));});
  child.on('close',code=>{if(pending)line(pending);clean();if(failure||code)reject(failure||new Error(`Codex interrompu (code ${code}).`));else resolve(audit);});child.stdin.end(prompt);
 });
}
module.exports={CodexVideoAgent,toml,runAgent,schema,buildPrompt,companionPersona};
