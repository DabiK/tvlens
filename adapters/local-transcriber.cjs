const { validateTranscriptionLanguage } = require('../core/transcription-language.cjs');
const { executable } = require('./system-paths.cjs');
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {spawn}=require('node:child_process');const {createHash}=require('node:crypto');
class LocalTranscriber {
 constructor({binary=executable('whisper-cli'),model,getLanguage=()=>"auto"}={}){Object.assign(this,{binary,model,getLanguage});this.cache=new Map();this.hits=0;this.misses=0;}
 async transcribe(audio,signal){
  if(!audio?.length)return {text:'',limits:['Aucune piste audio.']};signal?.throwIfAborted();
  const language=validateTranscriptionLanguage(this.getLanguage());
  const bytes=Buffer.from(audio),key=createHash('sha256').update(language).update(bytes).digest('hex');if(this.cache.has(key)){this.hits++;return {...this.cache.get(key),cacheHit:true};}this.misses++;
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-speech-'));
  try{
   await fs.access(this.model);const input=path.join(dir,'audio.wav'),output=path.join(dir,'speech');await fs.writeFile(input,bytes,{mode:0o600});
   await new Promise((resolve,reject)=>{const child=spawn(this.binary,['-m',this.model,'-f',input,'-l',language,'-oj','-of',output,'-np','-t','4'],{stdio:'ignore',shell:false});const abort=()=>child.kill('SIGKILL');signal?.addEventListener('abort',abort,{once:true});child.on('error',()=>{signal?.removeEventListener('abort',abort);reject(Error('Whisper local indisponible.'));});child.on('exit',code=>{signal?.removeEventListener('abort',abort);if(signal?.aborted)reject(signal.reason);else if(code)reject(Error('Transcription locale échouée.'));else resolve();});});
   const data=JSON.parse(await fs.readFile(output+'.json','utf8'));const text=(data.transcription||[]).map(s=>s.text.trim()).filter(Boolean).join(' ');
   const value={text,language,limits:['Transcription automatique locale ; elle peut contenir des erreurs.']};this.cache.set(key,value);if(this.cache.size>64)this.cache.delete(this.cache.keys().next().value);return {...value,cacheHit:false};
  }catch(e){if(signal?.aborted)throw e;return {text:'',limits:['Transcription locale indisponible : vérifie Whisper et son modèle.']};}
  finally{await fs.rm(dir,{recursive:true,force:true});}
 }
}
module.exports={LocalTranscriber};
