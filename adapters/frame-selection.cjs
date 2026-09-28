const sharp = require('sharp');
// Bounded, deterministic selection. No question answers, object labels or ground truth.
// Keep time coverage; use pixel change to spend remaining slots around transitions.
async function selectFrames(frames, count, { diverse=false, signal, maxGapMs=2000 } = {}) {
  if(!frames.length) throw new Error('Aucune frame candidate.');
  if(!diverse) return Array.from({length:count},(_,j)=>frames[Math.round(j*(frames.length-1)/Math.max(1,count-1))]);
  const pixels=[];
  for(const f of frames){signal?.throwIfAborted();pixels.push(await sharp(Buffer.from(f.dataUrl.split(',')[1],'base64')).resize(64,64,{fit:'fill'}).removeAlpha().raw().toBuffer());}
  const delta=(a,b)=>{let changed=0;for(let i=0;i<a.length;i+=3)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>16)changed++;return changed/(a.length/3);};
  const selected=new Set([0,frames.length-1]);
  // Temporal anchors are retained even when their images are identical.
  while(selected.size<count){
    const sorted=[...selected].sort((a,b)=>a-b);let interval;
    for(let i=1;i<sorted.length;i++)if(frames[sorted[i]].atMs-frames[sorted[i-1]].atMs>maxGapMs)interval=[sorted[i-1],sorted[i]];
    if(!interval)break;const index=Math.round((interval[0]+interval[1])/2);if(selected.has(index))break;selected.add(index);
  }
  const changes=frames.slice(1).map((_,i)=>({index:i+1,score:delta(pixels[i],pixels[i+1])})).sort((a,b)=>b.score-a.score||a.index-b.index);
  for(const c of changes){if(c.score<0.005)break;for(const i of [c.index-1,c.index])if(selected.size<count)selected.add(i);}
  // Fill evenly across remaining gaps, so similar frames still convey elapsed time.
  while(selected.size<Math.min(count,frames.length)){
    let best=-1,score=-1;
    for(let i=0;i<frames.length;i++)if(!selected.has(i)){const distance=Math.min(...[...selected].map(j=>Math.abs(frames[i].atMs-frames[j].atMs)));if(distance>score){best=i;score=distance;}}
    selected.add(best);
  }
  const result=[...selected].sort((a,b)=>a-b).map(i=>frames[i]);
  while(result.length<count)result.push(result.at(-1));
  return result;
}
module.exports={selectFrames};
