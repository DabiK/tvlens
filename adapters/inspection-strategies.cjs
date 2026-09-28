const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { run } = require('./ffmpeg.cjs');
const { selectFrames } = require('./frame-selection.cjs');
const CELL = 384, LABEL = 32, GAP = 12, MAX_SHEETS = 5;

// Strategies prepare provider evidence only. Session rules live in VideoTools/DeepAsk.
class NativeVideoStrategy {
  name = 'native-slow';
  async prepare({ segments, ffmpeg, dir, signal }) {
    const prepared = [];
    for (const [i, s] of segments.entries()) {
      const file = path.join(dir, `clip-${i}.mp4`), timeScale = 4;
      await run(ffmpeg, ['-hide_banner','-loglevel','error','-ss',String((s.startMs-s.sourceStartMs)/1000),'-t',String((s.endMs-s.startMs)/1000),'-i',s.sourceFile,'-vf',`scale=768:768:force_original_aspect_ratio=decrease:force_divisible_by=2,setpts=${timeScale}*(PTS-STARTPTS)`,'-r','10','-an','-c:v','libx264','-preset','ultrafast','-crf','26','-movflags','+faststart',file], signal);
      const video = await fs.readFile(file);
      if (video.length > 8000000) throw new Error('Extrait vidéo trop volumineux.');
      let audio = s.audio;
      if (audio) {
        const input = path.join(dir,`audio-${i}.wav`), output = path.join(dir,`slow-audio-${i}.wav`);
        await fs.writeFile(input,audio,{mode:0o600});
        await run(ffmpeg,['-hide_banner','-loglevel','error','-i',input,'-af','atempo=0.5,atempo=0.5','-ar','16000','-ac','1',output],signal);
        audio = await fs.readFile(output);
      }
      prepared.push({...s, audio, timeScale, videoDataUrl:'data:video/mp4;base64,'+video.toString('base64')});
    }
    return {segments:prepared,cost:0,metadata:{timeScale:4,selectionCalls:0}};
  }
}

class ContactSheetStrategy {
  constructor({ crop = false, diverse = false } = {}) { this.crop = crop; this.diverse = diverse; this.name = crop ? 'sheets-crop' : diverse ? 'sheets-diverse' : 'sheets'; }
  async prepare({question,segments,model,signal}) {
    let remaining = MAX_SHEETS;
    const prepared = [];
    for (const [i,s] of segments.entries()) {
      signal?.throwIfAborted();
      // Reserve at least one sheet per remaining segment; at most five globally.
      const count = Math.min(Math.max(1,Math.floor(s.frames.length/6)),remaining-(segments.length-i-1));
      if(count < 1) throw new Error('Trop de segments pour les planches.');
      remaining -= count;
      const selected = await selectFrames(s.frames,count*6,{diverse:this.diverse,signal});
      const dimensions = await sharp(bytes(selected[0])).metadata();
      for(const frame of selected){const d=await sharp(bytes(frame)).metadata();if(d.width!==dimensions.width||d.height!==dimensions.height)throw new Error('Dimensions variables : comparaison spatiale impossible.');}
      const sheets=[];
      for(let j=0;j<selected.length;j+=6) sheets.push(await makeSheet(selected.slice(j,j+6),null,j,signal));
      prepared.push({...s,frames:[],sheets,_selected:selected});
    }
    let selection=null,cost=0,roi=null;const warnings=[];
    if(this.crop){
      signal?.throwIfAborted();
      selection=await model.selectRegion({question,segments:prepared,signal});
      cost=selection.cost;
      try{roi=validateRegion(selection.region);}catch{warnings.push('Rectangle proposé invalide : conservation des vues complètes.');}
      if(roi){
        // Same normalized viewport rectangle for every frame; never track/recenter an object.
        for(const s of prepared) for(let j=0;j<s._selected.length;j+=6){
          s.sheets.push(await makeSheet(s._selected.slice(j,j+6),roi,j,signal));
        }
      }
    }
    return {segments:prepared.map(({_selected,...s})=>s),cost,metadata:{selectionCalls:this.crop?1:0,region:roi,proposedRegion:selection?.region||null,warnings,regionReason:selection?.reason||null,sheets:prepared.reduce((n,s)=>n+s.sheets.length,0),maxSheets:this.crop?10:5,cell:384,order:'left-to-right, top-to-bottom',audioTimeScale:1,selection:this.diverse?'pixel-delta + temporal anchors':'uniform',selectedTimes:prepared.map(s=>({id:s.id,times:s._selected.map(f=>f.atMs)}))}};
  }
}
function validateRegion(r){
  if(r==null)return null;
  if(!['x','y','width','height'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.width<0.2||r.height<0.2||r.x+r.width>1.000001||r.y+r.height>1.000001)throw new Error('Rectangle de recadrage invalide.');
  return r;
}
function bytes(frame){return Buffer.from(frame.dataUrl.split(',')[1],'base64');}
async function makeSheet(frames,roi,offset,signal){
  const overlays=[];
  for(const [i,frame] of frames.entries()){
    signal?.throwIfAborted();let input=sharp(bytes(frame));
    if(roi){const d=await input.metadata();const left=Math.floor(roi.x*d.width),top=Math.floor(roi.y*d.height);input=input.extract({left,top,width:Math.min(d.width-left,Math.max(1,Math.floor(roi.width*d.width))),height:Math.min(d.height-top,Math.max(1,Math.floor(roi.height*d.height)))});}
    const buffer=await input.resize(CELL,CELL,{fit:'contain',background:'#eeeeee'}).png().toBuffer();
    const left=GAP+(i%3)*(CELL+GAP),top=GAP+Math.floor(i/3)*(CELL+LABEL+GAP);
    overlays.push({input:buffer,left,top:top+LABEL});
    const text=`FRAME ${offset+i+1} | ${Math.round(frame.atMs)} ms`;
    overlays.push({input:Buffer.from(`<svg width="${CELL}" height="${LABEL}"><rect width="100%" height="100%" fill="#151719"/><text x="12" y="23" font-family="sans-serif" font-size="20" fill="white">${text}</text></svg>`),left,top});
  }
  const output=await sharp({create:{width:(CELL+GAP)*3+GAP,height:(CELL+LABEL+GAP)*2+GAP,channels:3,background:'#151719'}}).composite(overlays).jpeg({quality:85}).toBuffer();
  signal?.throwIfAborted();
  return {dataUrl:'data:image/jpeg;base64,'+output.toString('base64'),times:frames.map(f=>f.atMs),numbers:frames.map((_,i)=>offset+i+1),region:roi,width:(CELL+GAP)*3+GAP,height:(CELL+LABEL+GAP)*2+GAP};
}
function inspectionStrategy(name='native-slow'){
  if(name==='native-slow')return new NativeVideoStrategy();
  if(['sheets','sheets-diverse','sheets-crop'].includes(name))return new ContactSheetStrategy({crop:name==='sheets-crop',diverse:name!=='sheets'});
  throw new Error('Stratégie de réexamen inconnue.');
}
module.exports={NativeVideoStrategy,ContactSheetStrategy,inspectionStrategy,makeSheet,validateRegion};
