const { executable } = require('../adapters/system-paths.cjs');
const { cleanupCodexContexts } = require('../runtime/codex-cleanup.cjs');
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {randomBytes}=require('node:crypto');
const {loadConfig}=require('../adapters/config.cjs');const {ModelSettings}=require('../adapters/model-settings.cjs');
const {HeadlessRuntime}=require('../runtime/headless-runtime.cjs');const {RemoteServer}=require('./http.cjs');const {RemoteMedia}=require('../adapters/remote-media.cjs');
const {TranscriptionSettings}=require('../adapters/transcription-settings.cjs');
const {DiskGuard}=require('../adapters/disk-guard.cjs');const confinement=require('../adapters/codex-confinement.cjs');
// Reversible settings of this host, read once at start. An absent or empty variable keeps the product default;
// a mistyped one stops the start instead of letting the service run under another setting than intended.
function settings(env=process.env){
 const set=name=>typeof env[name]==='string'&&env[name]!=='';
 const checked=(name,valid,expected)=>{if(!set(name))return undefined;const value=Number(env[name]);if(!valid(value))throw Error(`Réglage ${name} invalide : ${expected}.`);return value;};
 const megabytes=(name,fallback)=>(checked(name,v=>Number.isFinite(v)&&v>=0,'nombre de mégaoctets positif ou nul attendu')??fallback)*1024**2;
 return {
  // Converted only: the question and surveillance runtimes own the bounds (1 to 300000 ms, 1 to 3 workers) and refuse the rest at construction.
  questionTimeoutMs:set('TVLENS_QUESTION_TIMEOUT_MS')?Number(env.TVLENS_QUESTION_TIMEOUT_MS):undefined,
  surveillance:set('TVLENS_SURVEILLANCE_WORKERS')?{workers:Number(env.TVLENS_SURVEILLANCE_WORKERS)}:undefined,
  // Media are kept until the session is deleted; a duration brings the rolling window back. Checked here: the session runtime would only refuse it at the first capture.
  retentionMs:checked('TVLENS_MEDIA_RETENTION_MS',v=>Number.isFinite(v)&&v>0,'durée positive en millisecondes attendue')??Infinity,
  // Below the floor capture is refused and nothing is deleted; below the warning the state says "low".
  disk:{minFreeBytes:megabytes('TVLENS_DISK_MIN_FREE_MB',1024),warnFreeBytes:megabytes('TVLENS_DISK_WARN_FREE_MB',2048)}};
}
async function main(){
 const host=settings();
 const root=path.resolve(process.env.TVLENS_SERVER_DATA||path.join(os.homedir(),'Documents','TVLens-private','server'));
 await fs.mkdir(root,{recursive:true,mode:0o700});
 const tokenFile=path.join(root,'device-token');let token=await fs.readFile(tokenFile,'utf8').catch(()=>null);
 if(!token){token=randomBytes(32).toString('hex');await fs.writeFile(tokenFile,token,{mode:0o600});}
 const config=await loadConfig({configPath:process.env.TVLENS_CONFIG||path.resolve('.env.local'),userData:root,safeStorage:{isEncryptionAvailable:()=>false}});
 config.chatReasoningEffort=process.env.TVLENS_CHAT_REASONING_EFFORT||"low";
 config.questionTimeoutMs=host.questionTimeoutMs;
 if(host.surveillance)config.surveillance={...config.surveillance,...host.surveillance};
 const transcriptionSettings=new TranscriptionSettings(path.join(root,'transcription.json'));
 config.transcriptionLanguage=await transcriptionSettings.load();
 const selectedModels=await new ModelSettings(path.join(root,'models.json')).load({observationModel:'gpt-6-luna',inspectionModel:'gpt-6-luna',codexModel:''});
 // Private Codex trees left behind by a crash still link to the credentials: swept once, and never a reason not to start.
 await cleanupCodexContexts({ sweep: confinement.sweepStaleContexts, root: os.tmpdir(), log: line => console.error(line) });
 // Sessions are durable: nothing is swept at start, and a session cut short by the last stop is found listed, whole.
 const sessionsRoot=path.join(root,'sessions');
 const runtime=new HeadlessRuntime({userData:root,sessionsRoot,host:'server',guard:new DiskGuard({path:sessionsRoot,...host.disk}),retentionMs:host.retentionMs,config,transcriptionSettings,selectedModels,codexBinary:executable('codex', {override:process.env.TVLENS_CODEX_BINARY})});
 const server=await new RemoteServer({runtime,media:new RemoteMedia({ffmpeg:config.ffmpeg}),token:token.trim()}).listen(Number(process.env.TVLENS_PORT||8787),process.env.TVLENS_BIND||'127.0.0.1');
 console.log('TVLens server '+server.url+' — device token stored in '+tokenFile);
 // Stopping archives the session in memory: its media, questions and surveillance registry stay on disk.
 let closing=false;const close=async()=>{if(closing)return;closing=true;await server.close();await runtime.close();process.exit(0);};
 process.on('SIGTERM',close);process.on('SIGINT',close);
}
// Loadable without starting anything: the settings above are checked by the test suite.
if(require.main===module)main().catch(e=>{console.error(e.message);process.exit(1)});
module.exports={settings,main};
