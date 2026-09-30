const { executable } = require('./system-paths.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { run } = require('./ffmpeg.cjs');
const { NativeVideoStrategy } = require('./inspection-strategies.cjs');
class ClipInspector {
  constructor({ media, model, ffmpeg = executable('ffmpeg'), strategy = new NativeVideoStrategy() }) { Object.assign(this,{media,model,ffmpeg,strategy}); }
  async inspect({ question,startMs,endMs,segments,signal,onProgress }) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-inspect-'));
    try {
      const evidence=[]; let count=0;
      // Allocate <=32 frames across all clips. A short interval receives a denser sampling.
      const cap=this.strategy.diverse?160:32;
      const fps=Math.min(8,(this.strategy.diverse?160:30)/((endMs-startMs)/1000));
      for (let i=0;i<segments.length;i++) {
        signal?.throwIfAborted(); const s=segments[i]; const begin=Math.max(startMs,s.startMs), end=Math.min(endMs,s.endMs);
        const prefix=path.join(dir,`${i}-%03d.jpg`);
        await run(this.ffmpeg,['-hide_banner','-loglevel','error','-ss',String((begin-s.startMs)/1000),'-i',this.media.file(s.id,'webm'),'-t',String((end-begin)/1000),'-vf',`fps=${fps},scale=768:768:force_original_aspect_ratio=decrease:force_divisible_by=2`,'-frames:v',String(Math.max(1,cap-count)),'-q:v','3',prefix],signal);
        const files=(await fs.readdir(dir)).filter(f => f.startsWith(`${i}-`)).sort();
        const frames=[];
        for(let j=0;j<files.length;j++) { const atMs=begin+(j+0.5)*1000/fps; if(atMs>end || count>=cap) break; frames.push({atMs,dataUrl:'data:image/jpeg;base64,'+(await fs.readFile(path.join(dir,files[j]))).toString('base64')}); count++; }
        if(!frames.length) throw new Error('Aucune image décodée dans le passage.');
        const original=await this.media.read(s.id);
        const audio=trimWav(original.audio,(begin-s.startMs)/1000,(end-s.startMs)/1000);
        evidence.push({id:s.id,startMs:begin,endMs:end,sourceStartMs:s.startMs,sourceFile:this.media.file(s.id,'webm'),frames,audio});
      }
      const prepared=await this.strategy.prepare({question,segments:evidence,model:this.model,ffmpeg:this.ffmpeg,dir,signal});
      signal?.throwIfAborted();
      const result=await this.model.inspect({question,segments:prepared.segments,signal,onProgress});
      return {...result,limits:[...(result.limits||[]),...(prepared.metadata.warnings||[])],sampledFrames:count,strategy:this.strategy.name,preparation:prepared.metadata, cost: result.cost == null || prepared.cost == null ? null : result.cost + prepared.cost};
    } finally { await fs.rm(dir,{recursive:true,force:true}); }
  }
}
function trimWav(bytes,start,end) {
  if(!bytes) return null;
  const b=Buffer.from(bytes);
  if(b.length<44 || b.toString('ascii',0,4)!=='RIFF' || b.toString('ascii',36,40)!=='data') return null;
  const rate=b.readUInt32LE(28), block=b.readUInt16LE(32); if(!rate || !block) return null;
  const data=b.subarray(44+Math.floor(start*rate/block)*block,Math.min(b.length,44+Math.floor(end*rate/block)*block));
  const header=Buffer.from(b.subarray(0,44)); header.writeUInt32LE(data.length+36,4);header.writeUInt32LE(data.length,40);
  return Buffer.concat([header,data]);
}
module.exports={ClipInspector,trimWav,run};
