const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const sharp=require('sharp');
// Checks a base64 payload without decoding it: a block carries several megabytes, decoded once in assemble().
function base64(value,max){
  if(typeof value!=='string'||value.length>Math.ceil(max/3)*4||!value.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Média encodé invalide.');
  const size=Math.floor((value.length-(value.endsWith('==')?2:value.endsWith('=')?1:0))*3/4);if(!size||size>max)throw Error('Média trop volumineux.');
}
// Images the capture cropped or withheld because a TV Lens card was on screen: `overlay:"cropped"` on each cropped image sent,
// and a block `overlay:{cropped,withheld}` (0 to 5 each; withheld images are not in `frames`). Bounded here; null when nothing is declared.
function declaredOverlay(input){
  const flagged=input.frames.filter(f=>f.overlay==='cropped').length,block=input.overlay;
  // An image flagged otherwise (a withheld one that was sent after all, say) could carry the text of a card: the block is refused.
  if(input.frames.some(f=>f.overlay!==undefined&&f.overlay!==null&&f.overlay!=='cropped'))throw Error('Déclaration d’image masquée invalide.');
  if(block===undefined||block===null)return flagged?{cropped:flagged,withheld:0}:null;
  if(typeof block!=='object'||Array.isArray(block)||![block.cropped,block.withheld].every(v=>Number.isInteger(v)&&v>=0&&v<=5))throw Error('Déclaration d’images masquées invalide.');
  // A cropped image is one of those sent: their count cannot exceed them. Between the block and the images flagged one by one,
  // the larger figure is kept rather than losing the block: hidden images are never understated.
  if(block.cropped>input.frames.length)throw Error('Déclaration d’images masquées incohérente.');
  // A block carries five images at most: those sent plus those withheld cannot exceed what one block can hold.
  if(input.frames.length+block.withheld>5)throw Error('Déclaration d’images masquées incohérente.');
  const cropped=Math.max(block.cropped,flagged);
  return cropped+block.withheld?{cropped,withheld:block.withheld}:null;
}
// Inputs already checked by the HTTP handler are not scanned a second time.
const validated=new WeakSet();
function validateRemote(input){
  if(!input||typeof input.sessionId!=='string'||!Number.isSafeInteger(input.sequence)||input.sequence<0)throw Error('Séquence invalide.');
  if(!Number.isFinite(input.startMs)||!Number.isFinite(input.endMs)||input.startMs<0||input.endMs<=input.startMs||input.endMs-input.startMs>10000)throw Error('Intervalle invalide.');
  if(!Array.isArray(input.frames)||input.frames.length<1||input.frames.length>5)throw Error('Nombre d’images invalide.');
  let previous=-Infinity;
  for(const f of input.frames){if(!Number.isFinite(f.atMs)||f.atMs<input.startMs||f.atMs>input.endMs||f.atMs<previous)throw Error('Ordre des images invalide.');previous=f.atMs;base64(f.data,1500000);
    if(f.crop){const c=f.crop;if(!['x','y','width','height'].every(k=>Number.isInteger(c[k]))||c.x<0||c.y<0||c.width<16||c.height<16||c.x+c.width>1280||c.y+c.height>720)throw Error('Cadrage invalide.');}}
  if(input.audio)base64(input.audio,2100000);
  declaredOverlay(input);
  validated.add(input);
}
// Not the block's doing: a media tool that cannot be started or does not end in time, a temporary directory the system
// refuses. The transport answers 503 with this code, so that the capture sends the same block again instead of counting
// one refused for its content. The message never carries a path of this host; the cause stays on the error.
const unavailable=(message,cause)=>Object.assign(Error(message,{cause}),{status:503,code:'media-unavailable'});
// Every file of a block being prepared lives in its own temporary directory: a refusal there is the host's.
const scratch=work=>work.catch(cause=>{throw unavailable('Espace temporaire média indisponible.',cause);});
// `signal` is held by whoever owns the block. When it fires, this child and no other is killed, and the command still
// settles on the exit of that child only: nothing is removed under a tool that runs.
async function command(binary,args,timeoutMs,signal){
  signal?.throwIfAborted();
  await new Promise((resolve,reject)=>{
    let child,err='',expired=false;
    try{child=spawn(binary,args,{stdio:['ignore','ignore','pipe']});}catch(cause){return reject(unavailable('Outil média indisponible.',cause));}
    const kill=()=>child.kill('SIGKILL');
    const timer=setTimeout(()=>{expired=true;kill();},timeoutMs);signal?.addEventListener('abort',kill,{once:true});
    const settle=()=>{clearTimeout(timer);signal?.removeEventListener('abort',kill);};
    // Heard before the pipe is read: a spawn the system refuses hands back a child without a pid, and without pipes when
    // it ran out of descriptors, and only says so on the next tick. Unheard, that would end the host.
    child.on('error',cause=>{settle();reject(signal?.aborted?signal.reason:unavailable('Outil média indisponible.',cause));});
    // A child killed by the timer exits with a signal and no code: a truncated file must never pass for a result.
    child.on('exit',(code,killed)=>{settle();if(signal?.aborted)reject(signal.reason);else if(expired)reject(unavailable('Préparation média trop longue.'));else if(code||killed)reject(Error('Préparation média échouée : '+err));else resolve();});
    child.stderr?.on('data',v=>{err=(err+v).slice(-2000);});
  });
}
class RemoteMedia {
  constructor({ffmpeg='ffmpeg',timeoutMs=15000}={}){this.ffmpeg=ffmpeg;this.timeoutMs=timeoutMs;}
  // `signal` gives the block up: nothing new is made for it from then on (directory, file, media tool), the tool that
  // runs is killed, and the reason of the signal is what this rejects with once everything started has settled.
  async assemble(input,{signal}={}){
    const started=performance.now();if(!validated.has(input))validateRemote(input);signal?.throwIfAborted();
    const dir=await scratch(fs.mkdtemp(path.join(os.tmpdir(),'tvlens-ingest-')));let result;
    try{
      signal?.throwIfAborted();
      const seconds=String((input.endMs-input.startMs)/1000);
      const encode=async(frame,i)=>{
        let image=sharp(Buffer.from(frame.data,'base64'),{limitInputPixels:1920*1080});
        if(frame.crop)image=image.extract({left:frame.crop.x,top:frame.crop.y,width:frame.crop.width,height:frame.crop.height});
        // An encoding under way cannot be stopped: it is left to finish, and nothing is written for it afterwards.
        const jpeg=await image.resize({width:1280,height:720,fit:'inside',withoutEnlargement:true}).jpeg({quality:75}).toBuffer();
        signal?.throwIfAborted();
        await scratch(fs.writeFile(path.join(dir,`${i}.jpg`),jpeg,{mode:0o600}));
        return {atMs:frame.atMs,dataUrl:'data:image/jpeg;base64,'+jpeg.toString('base64')};
      };
      const resample=async()=>{
        if(!input.audio)return null;
        const raw=Buffer.from(input.audio,'base64');
        if(raw.toString('ascii',0,4)!=='RIFF'||raw.toString('ascii',8,12)!=='WAVE')throw Error('Audio WAV requis.');
        await scratch(fs.writeFile(path.join(dir,'source.wav'),raw,{mode:0o600}));
        await command(this.ffmpeg,['-nostdin','-v','error','-i',path.join(dir,'source.wav'),'-t',seconds,'-ar','16000','-ac','1',path.join(dir,'audio.wav')],this.timeoutMs,signal);
        return scratch(fs.readFile(path.join(dir,'audio.wav')));
      };
      // Frames and audio run together. Everything started settles before the directory is removed, and the
      // error reported is the one the former sequential order would have met first (frames in order, then audio).
      const settled=await Promise.allSettled([...input.frames.map(encode),resample()]);
      // Given up meanwhile: that is the answer, whatever the frames and the sound met on the way.
      signal?.throwIfAborted();
      const failed=settled.find(s=>s.status==='rejected');if(failed)throw failed.reason;
      const audio=settled.pop().value,frames=settled.map(s=>s.value);
      const list=['ffconcat version 1.0'];
      input.frames.forEach((frame,i)=>{
        const start=i?frame.atMs:input.startMs,end=input.frames[i+1]?.atMs??input.endMs;
        list.push(`file '${i}.jpg'`,`duration ${Math.max(.001,(end-start)/1000)}`);
      });
      list.push(`file '${frames.length-1}.jpg'`);await scratch(fs.writeFile(path.join(dir,'frames.txt'),list.join('\n')));
      const args=['-nostdin','-v','error','-f','concat','-safe','0','-i',path.join(dir,'frames.txt')];
      if(audio)args.push('-i',path.join(dir,'audio.wav'),'-c:a','libopus');
      args.push('-t',seconds,'-vf','fps=2','-c:v','libvpx','-deadline','realtime','-cpu-used','8','-b:v','500k',path.join(dir,'clip.webm'));
      await command(this.ffmpeg,args,this.timeoutMs,signal);
      result={...input,frames,audio,clip:await scratch(fs.readFile(path.join(dir,'clip.webm')))};
    }finally{await scratch(fs.rm(dir,{recursive:true,force:true}));}
    // Carried to the passage: the session says by itself that such a scene was not seen whole. Absent when nothing was hidden.
    const overlay=declaredOverlay(input);
    result.ingest={assembleMs:Math.round(performance.now()-started),...(overlay?{overlay}:{})};return result;
  }
}
module.exports={RemoteMedia,validateRemote};
