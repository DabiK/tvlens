const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {randomBytes}=require('node:crypto');
const {cleanupRawMedia}=require('../adapters/local-store.cjs');
const {loadConfig}=require('../adapters/config.cjs');const {ModelSettings}=require('../adapters/model-settings.cjs');
const {HeadlessRuntime}=require('../runtime/headless-runtime.cjs');const {RemoteServer}=require('./http.cjs');const {RemoteMedia}=require('../adapters/remote-media.cjs');
async function main(){
 const root=path.resolve(process.env.TVLENS_SERVER_DATA||path.join(os.homedir(),'Documents','TVLens-private','server'));
 await fs.mkdir(root,{recursive:true,mode:0o700});
 const tokenFile=path.join(root,'device-token');let token=await fs.readFile(tokenFile,'utf8').catch(()=>null);
 if(!token){token=randomBytes(32).toString('hex');await fs.writeFile(tokenFile,token,{mode:0o600});}
 const config=await loadConfig({configPath:process.env.TVLENS_CONFIG||path.resolve('.env.local'),userData:root,safeStorage:{isEncryptionAvailable:()=>false}});
 const selectedModels=await new ModelSettings(path.join(root,'models.json')).load({observationModel:'gpt-6-luna',inspectionModel:'gpt-6-luna',codexModel:''});
 await cleanupRawMedia(path.join(root,'sessions'));
 const runtime=new HeadlessRuntime({userData:root,sessionsRoot:path.join(root,'sessions'),config,selectedModels,codexBinary:process.env.TVLENS_CODEX_BINARY||path.join(os.homedir(),'.local/bin/codex')});
 const server=await new RemoteServer({runtime,media:new RemoteMedia({ffmpeg:config.ffmpeg}),token:token.trim()}).listen(Number(process.env.TVLENS_PORT||8787),process.env.TVLENS_BIND||'127.0.0.1');
 console.log('TVLens server '+server.url+' — device token stored in '+tokenFile);
 let closing=false;const close=async()=>{if(closing)return;closing=true;await server.close();await runtime.close();process.exit(0);};
 process.on('SIGTERM',close);process.on('SIGINT',close);
}
main().catch(e=>{console.error(e.message);process.exit(1)});
