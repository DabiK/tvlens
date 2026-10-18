const { executable } = require('./system-paths.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { run, DECODE_FAILED } = require('./ffmpeg.cjs');
const { NativeVideoStrategy } = require('./inspection-strategies.cjs');
// Under one second Whisper invents words: such an excerpt never gets a transcription of its own.
const MIN_EXACT_SPEECH_MS=1000;
const seconds=ms => (ms/1000).toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1});
class ClipInspector {
  constructor({ media, model, ffmpeg = executable('ffmpeg'), strategy = new NativeVideoStrategy() }) { Object.assign(this,{media,model,ffmpeg,strategy}); }
  async inspect({ question,startMs,endMs,segments,signal,onProgress,onDiagnostic,exactSpeech }) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-inspect-'));
    try {
      const evidence=[], stills=[]; let count=0;
      // Allocate <=32 frames across all clips. A short interval receives a denser sampling.
      const cap=this.strategy.diverse?160:32;
      const fps=Math.min(8,(this.strategy.diverse?160:30)/((endMs-startMs)/1000));
      for (let i=0;i<segments.length;i++) {
        signal?.throwIfAborted(); const s=segments[i]; const begin=Math.max(startMs,s.startMs), end=Math.min(endMs,s.endMs);
        const prefix=path.join(dir,`${i}-%03d.jpg`);
        const frames=[], before=count;
        // A container known to hold no image is not handed to the decoder. A clip the decoder refuses, or from which it
        // draws nothing, is treated the same way afterwards. A missing decoder or an interruption is never taken for that.
        if(s.mediaReason!=='unreadable') {
          try {
            await run(this.ffmpeg,['-hide_banner','-loglevel','error','-ss',String((begin-s.startMs)/1000),'-i',this.media.file(s.id,'webm'),'-t',String((end-begin)/1000),'-vf',`fps=${fps},scale=768:768:force_original_aspect_ratio=decrease:force_divisible_by=2`,'-frames:v',String(Math.max(1,cap-count)),'-q:v','3',prefix],signal);
            const files=(await fs.readdir(dir)).filter(f => f.startsWith(`${i}-`)).sort();
            for(let j=0;j<files.length;j++) { const atMs=begin+(j+0.5)*1000/fps; if(atMs>end || count>=cap) break; frames.push({atMs,dataUrl:'data:image/jpeg;base64,'+(await fs.readFile(path.join(dir,files[j]))).toString('base64')}); count++; }
          } catch(error) { signal?.throwIfAborted(); if(error?.code!==DECODE_FAILED) throw error; frames.length=0; count=before; }
        }
        const original=await this.media.read(s.id);
        if(!frames.length) {
          // The images kept at capture stand in for the video, inside the interval asked and nowhere else.
          const kept=(Array.isArray(original.frames)?original.frames:[]).filter(f => f && typeof f.dataUrl==='string' && Number.isFinite(f.atMs) && f.atMs>=begin && f.atMs<=end).slice(0,Math.max(0,cap-count));
          if(!kept.length) throw new Error('Aucune image décodée dans le passage.');
          frames.push(...kept.map(({atMs,dataUrl}) => ({atMs,dataUrl}))); count+=kept.length;
          stills.push({startMs:begin,endMs:end,frames:kept.length,empty:s.mediaReason==='unreadable'});
        }
        // A whole passage keeps its stored bytes: the transcriber then reuses the passage transcription.
        const audio=begin===s.startMs&&end===s.endMs?original.audio:trimWav(original.audio,(begin-s.startMs)/1000,(end-s.startMs)/1000);
        // Speech is a passage matter, on an interval of its own: the transcript the passage already published, else its
        // stored bytes, which hit the transcriber cache or share the background run where a slice would start Whisper
        // again. Only exactSpeech asks for the excerpt's own words. A failed or shed transcription is not a transcript,
        // and a passage without an audio track has no speech to announce.
        const published=s.audioStatus==='ready'&&!s.audioFailed&&typeof s.observation?.transcript==='string';
        const speech=!original.audio||exactSpeech&&end-begin>=MIN_EXACT_SPEECH_MS?null:published?{transcript:s.observation.transcript}:{audio:original.audio};
        evidence.push({id:s.id,startMs:begin,endMs:end,sourceStartMs:s.startMs,sourceFile:this.media.file(s.id,'webm'),frames,audio,...(speech&&{speech:{...speech,startMs:s.startMs,endMs:s.endMs}})});
      }
      const prepared=await this.strategy.prepare({question,segments:evidence,model:this.model,ffmpeg:this.ffmpeg,dir,signal});
      signal?.throwIfAborted();
      const result=await this.model.inspect({question,segments:prepared.segments,signal,onProgress,onDiagnostic});
      // Said first: the tool keeps a handful of limits, and this one changes what the answer rests on. Only a
      // container known to be empty is called unreadable; a decoder that drew nothing says just that.
      const stillLimits=stills.map(x => `${x.empty?'Vidéo illisible pour le passage':'Aucune image n’a pu être tirée de la vidéo sur'} ${seconds(x.startMs)}–${seconds(x.endMs)} s : réexamen fait sur ${x.frames>1?`${x.frames} images conservées`:'une seule image conservée'} à la capture, sans le mouvement${x.frames>1?' entre elles':''}.`);
      return {...result,limits:[...stillLimits,...(result.limits||[]),...(prepared.metadata.warnings||[])],...(stills.length&&{stillFrames:stills.reduce((sum,x) => sum+x.frames,0)}),sampledFrames:count,strategy:this.strategy.name,preparation:prepared.metadata, cost: result.cost == null || prepared.cost == null ? null : result.cost + prepared.cost};
    } finally { await fs.rm(dir,{recursive:true,force:true}); }
  }
}
function trimWav(bytes,start,end) {
  if(!bytes) return null;
  const b=Buffer.from(bytes);
  if(b.length<44 || b.toString('ascii',0,4)!=='RIFF' || b.toString('ascii',8,12)!=='WAVE') return null;
  // ffmpeg writes a LIST chunk before the samples (LG blocks): walk the chunks, never assume 44 bytes.
  let fmt=-1, samples=null;
  for(let at=12; at+8<=b.length;) {
    const id=b.toString('ascii',at,at+4), size=b.readUInt32LE(at+4);
    if(id==='fmt ' && size>=16) fmt=at+8;
    if(id==='data') { samples=b.subarray(at+8,Math.min(b.length,at+8+size)); break; }
    at+=8+size+(size&1);
  }
  if(fmt<0 || !samples) return null;
  const rate=b.readUInt32LE(fmt+8), block=b.readUInt16LE(fmt+12); if(!rate || !block) return null;
  const data=samples.subarray(Math.min(samples.length,Math.floor(start*rate/block)*block),Math.min(samples.length,Math.floor(end*rate/block)*block));
  const header=Buffer.alloc(44); header.write('RIFF',0,'ascii'); header.writeUInt32LE(data.length+36,4); header.write('WAVEfmt ',8,'ascii');
  header.writeUInt32LE(16,16); b.copy(header,20,fmt,fmt+16); header.write('data',36,'ascii'); header.writeUInt32LE(data.length,40);
  return Buffer.concat([header,data]);
}
module.exports={ClipInspector,trimWav,run};
