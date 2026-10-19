const { domainError } = require('../core/shared/domain-error.cjs');
const TVLENS_MEDIA_BLOCK_INVALID = 'TVLENS_MEDIA_BLOCK_INVALID';
const TVLENS_MEDIA_IMAGE_UNREADABLE = 'TVLENS_MEDIA_IMAGE_UNREADABLE';
const TVLENS_MEDIA_TOOL_REFUSED = 'TVLENS_MEDIA_TOOL_REFUSED';
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const sharp=require('sharp');
const REMOTE_MEDIA_LIMITS = Object.freeze({
  minFrames: 1,
  maxFrames: 5,
  maxAudioBytes: 2100000,
});
// Checks a base64 payload without decoding it: a block carries several megabytes, decoded once in assemble().
function base64(value, max) {
  if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 || !value.length || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw domainError(TVLENS_MEDIA_BLOCK_INVALID, 'Média encodé invalide.');
  const padding = value.endsWith('==') ? 2 : Number(value.endsWith('='));
  const size = Math.floor((value.length - padding) * 3 / 4);
  if (!size || size > max) throw domainError(TVLENS_MEDIA_BLOCK_INVALID, 'Média trop volumineux.');
}
// Inputs already checked by the HTTP handler are not scanned a second time.
const validated = new WeakSet();
function validateRemote(input) {
  if (!input || typeof input.sessionId !== 'string' || !Number.isSafeInteger(input.sequence) || input.sequence < 0)
    throw domainError(TVLENS_MEDIA_BLOCK_INVALID, 'Séquence invalide.');
  if (!Number.isFinite(input.startMs) || !Number.isFinite(input.endMs)
    || input.startMs < 0 || input.endMs <= input.startMs || input.endMs - input.startMs > 10000)
    throw domainError(TVLENS_MEDIA_BLOCK_INVALID, 'Intervalle invalide.');
  if (!Array.isArray(input.frames)
    || input.frames.length < REMOTE_MEDIA_LIMITS.minFrames || input.frames.length > REMOTE_MEDIA_LIMITS.maxFrames)
    throw domainError(TVLENS_MEDIA_BLOCK_INVALID, 'Nombre d’images invalide.');
  let previous = -Infinity;
  for (const f of input.frames) {
    if (!f || typeof f !== 'object'
      || !Number.isFinite(f.atMs) || f.atMs < input.startMs || f.atMs > input.endMs || f.atMs < previous)
      throw domainError(TVLENS_MEDIA_BLOCK_INVALID, 'Ordre des images invalide.');
    previous = f.atMs;
    base64(f.data, 1500000);
    if (f.crop) {
      const c = f.crop;
      if (!['x', 'y', 'width', 'height'].every(k => Number.isInteger(c[k]))
        || c.x < 0 || c.y < 0 || c.width < 16 || c.height < 16 || c.x + c.width > 1280 || c.y + c.height > 720)
        throw domainError(TVLENS_MEDIA_BLOCK_INVALID, 'Cadrage invalide.');
    }
  }
  if (input.audio) base64(input.audio, REMOTE_MEDIA_LIMITS.maxAudioBytes);
  validated.add(input);
}
// Seule la chaîne sharp identifie un contenu image illisible ; le disque et l’annulation gardent leur refus.
async function encodeImage(frame) {
  try {
    let image = sharp(Buffer.from(frame.data, 'base64'), { limitInputPixels: 1920 * 1080 });
    if (frame.crop) image = image.extract({ left: frame.crop.x, top: frame.crop.y, width: frame.crop.width, height: frame.crop.height });
    return await image.resize({ width: 1280, height: 720, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
  } catch (cause) {
    throw domainError(TVLENS_MEDIA_IMAGE_UNREADABLE, 'Image illisible.', cause);
  }
}
// Not the block's doing: a media tool that cannot be started or does not end in time, a temporary directory the system
// refuses. The transport answers 503 with this code, so that the capture sends the same block again instead of counting
// one refused for its content. The message never carries a path of this host; the cause stays on the error.
const unavailable=(message,cause)=>Object.assign(Error(message,{cause}),{status:503,code:'media-unavailable'});
// Every file of a block being prepared lives in its own temporary directory: a refusal there is the host's.
const scratch=work=>work.catch(cause=>{throw unavailable('Espace temporaire média indisponible.',cause);});
// `signal` is held by whoever owns the block. When it fires, this child and no other is killed. A child that started is
// over when it exits and not before: an error it reports meanwhile (a kill the system refuses) settles nothing, its time
// limit and its signal stay armed, and nothing is removed under a tool that may still run.
async function command(binary,args,timeoutMs,signal){
  signal?.throwIfAborted();
  await new Promise((resolve,reject)=>{
    let child,err='',expired=false;
    try{child=spawn(binary,args,{stdio:['ignore','ignore','pipe']});}catch(cause){return reject(unavailable('Outil média indisponible.',cause));}
    const kill=()=>child.kill('SIGKILL');
    const timer=setTimeout(()=>{expired=true;kill();},timeoutMs);signal?.addEventListener('abort',kill,{once:true});
    const settle=()=>{clearTimeout(timer);signal?.removeEventListener('abort',kill);};
    // Heard before the pipe is read: a spawn the system refuses hands back a child without a pid, and without pipes when
    // it ran out of descriptors, and only says so on the next tick. Unheard, that would end the host. Without a pid
    // nothing was started: that error is the end of the command, and no other is.
    child.on('error',cause=>{if(child.pid)return;settle();reject(signal?.aborted?signal.reason:unavailable('Outil média indisponible.',cause));});
    // A child killed by the timer exits with a signal and no code: a truncated file must never pass for a result.
    child.on('exit', (code, killed) => {
      settle();
      if (signal?.aborted) reject(signal.reason);
      else if (expired) reject(unavailable('Préparation média trop longue.'));
      // Un signal système ne prouve aucun refus du contenu par l’outil.
      else if (killed) reject(Error('Préparation média échouée : ' + err));
      else if (code) reject(domainError(TVLENS_MEDIA_TOOL_REFUSED, 'Préparation média échouée.', Error(err)));
      else resolve();
    });
    child.stderr?.on('data',v=>{err=(err+v).slice(-2000);});
  });
}
class RemoteMedia {
  constructor({ffmpeg='ffmpeg',timeoutMs=15000}={}){this.ffmpeg=ffmpeg;this.timeoutMs=timeoutMs;}
  // `signal` gives the block up: nothing new is made for it from then on (directory, file, media tool), the tool that
  // runs is killed, and the reason of the signal is what this rejects with once everything started has settled.
  async assemble(input,{signal}={}){
    const started=performance.now();if(!validated.has(input))validateRemote(input);signal?.throwIfAborted();
    const dir=await scratch(fs.mkdtemp(path.join(os.tmpdir(),'tvlens-ingest-')));let result,failed=false,primary;
    try{
      signal?.throwIfAborted();
      const seconds=String((input.endMs-input.startMs)/1000);
      const encode=async(frame,i)=>{
        // Un encodage commencé se règle avant l’annulation et avant tout nettoyage.
        const jpeg = await encodeImage(frame);
        signal?.throwIfAborted();
        await scratch(fs.writeFile(path.join(dir,`${i}.jpg`),jpeg,{mode:0o600}));
        return {atMs:frame.atMs,dataUrl:'data:image/jpeg;base64,'+jpeg.toString('base64')};
      };
      const resample=async()=>{
        if(!input.audio)return null;
        const raw=Buffer.from(input.audio,'base64');
        if (raw.toString('ascii', 0, 4) !== 'RIFF' || raw.toString('ascii', 8, 12) !== 'WAVE')
          throw domainError(TVLENS_MEDIA_BLOCK_INVALID, 'Audio WAV requis.');
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
    }catch(error){failed=true;primary=error;}
    // The directory goes whatever happened. A removal the system refuses is the host's doing only when nothing else went
    // wrong: a block refused for what it is, or given up by its owner, keeps its own answer and carries that failure.
    try{await fs.rm(dir,{recursive:true,force:true});}
    catch(cause){
      if(!failed)throw unavailable('Espace temporaire média indisponible.',cause);
      try{primary.cleanup=cause;}
      catch{
        // Cette méthode de classe est stricte même sans directive dans le fichier : une primitive
        // (dont null/undefined) ou un objet gelé peut faire lever l'affectation de cleanup,
        // comme un accesseur ou un Proxy qui lève ; il n'y a pas d'échec silencieux dans ces cas.
        // Le refus média ou l'abandon initial reste prioritaire et sera relancé ci-dessous ;
        // l'échec du nettoyage est alors perdu, sans garantir la suppression du répertoire.
      }
    }
    if(failed)throw primary;
    delete result.overlay;
    result.ingest = { assembleMs: Math.round(performance.now() - started) };
    return result;
  }
}
module.exports = {
  RemoteMedia, validateRemote, REMOTE_MEDIA_LIMITS,
  TVLENS_MEDIA_BLOCK_INVALID, TVLENS_MEDIA_IMAGE_UNREADABLE, TVLENS_MEDIA_TOOL_REFUSED,
};
