const {McpServer}=require('@modelcontextprotocol/sdk/server/mcp.js');
const {StdioServerTransport}=require('@modelcontextprotocol/sdk/server/stdio.js');
const {z}=require('zod');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {randomUUID}=require('node:crypto');
const descriptor=process.argv.find(x=>x.startsWith('--descriptor='))?.slice(13)||path.join(os.homedir(),'Library','Application Support','TVLens','mcp-bridge.json');
const client=randomUUID();
const server=new McpServer({name:'tvlens',version:'0.2.0'});
const range={startMs:z.number().nonnegative(),endMs:z.number().positive()};
async function call(name,args,extra){
  try{
    const config=JSON.parse(await fs.readFile(descriptor,'utf8'));
    const url=new URL(config.url);if(url.hostname!=='127.0.0.1'||url.protocol!=='http:'||url.pathname!=='/tool')throw new Error('Adresse locale invalide.');
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.token}`,'X-TVLens-Client':client},body:JSON.stringify({name,args}),signal:AbortSignal.any([extra.signal,AbortSignal.timeout(60000)])});
    const value=await response.json();if(!response.ok)throw new Error(value.error||'Outil indisponible.');
    return {content:[{type:'text',text:JSON.stringify(value)}]};
  }catch(error){return {isError:true,content:[{type:'text',text:error.code==='ENOENT'?'Ouvre TVLens et démarre une observation avant d’utiliser ces outils.':error.message}]};}
}
for(const [name,description,inputSchema] of [
 ['search_moments','Recherche hybride dans la session TVLens observée. Commence par cet outil. Renvoie IDs et intervalles en millisecondes ; aucune preuve future.',{query:z.string().min(1).max(2000)}],
 ['get_transcript','Récupère paroles et résumés, horodatés par segment (pas mot à mot). Maximum 60 secondes.',range],
 ['inspect_clip','Réexamine réellement une vidéo locale avec de nouvelles images denses et audio. Maximum 20 secondes, deux inspections par contexte. Utilise le quota Codex pour la vision et une transcription locale. Renvoie observations, hypothèses séparées et limites.',{...range,question:z.string().min(1).max(2000)}]
])server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:name==='inspect_clip'}},(args,extra)=>call(name,args,extra));
server.connect(new StdioServerTransport()).catch(()=>{process.stderr.write('Impossible de démarrer TVLens MCP.\n');process.exitCode=1;});
