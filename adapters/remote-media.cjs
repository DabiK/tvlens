const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const sharp=require('sharp');
function base64(value,max){
  if(typeof value!=='string'||value.length>Math.ceil(max/3)*4||!value.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Média encodé invalide.');
  const bytes=Buffer.from(value,'base64');if(!bytes.length||bytes.length>max)throw Error('Média trop volumineux.');return bytes;
}
function validateRemote(input){
  if(!input||typeof input.sessionId!=='string'||!Number.isSafeInteger(input.sequence)||input.sequence<0)throw Error('Séquence invalide.');
  if(!Number.isFinite(input.startMs)||!Number.isFinite(input.endMs)||input.startMs<0||input.endMs<=input.startMs||input.endMs-input.startMs>10000)throw Error('Intervalle invalide.');
  if(!Array.isArray(input.frames)||input.frames.length<1||input.frames.length>5)throw Error('Nombre d’images invalide.');
  let previous=-Infinity;
  for(const f of input.frames){if(!Number.isFinite(f.atMs)||f.atMs<input.startMs||f.atMs>input.endMs||f.atMs<previous)throw Error('Ordre des images invalide.');previous=f.atMs;base64(f.data,1500000);
    if(f.crop){const c=f.crop;if(!['x','y','width','height'].every(k=>Number.isInteger(c[k]))||c.x<0||c.y<0||c.width<16||c.height<16||c.x+c.width>1280||c.y+c.height>720)throw Error('Cadrage invalide.');}}
  if(input.audio)base64(input.audio,2100000);
}
async function command(binary,args){
  await new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{stdio:['ignore','ignore','pipe']});let err='';child.stderr.on('data',v=>{err=(err+v).slice(-2000);});
    const timer=setTimeout(()=>child.kill('SIGKILL'),15000);
    child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',code=>{clearTimeout(timer);code?reject(Error('Préparation média échouée : '+err)):resolve();});
  });
}
class RemoteMedia {
  constructor({ffmpeg='ffmpeg'}={}){this.ffmpeg=ffmpeg;}
  async assemble(input){
    validateRemote(input);const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-ingest-'));
    try{
      const frames=[];const list=['ffconcat version 1.0'];
      for(let i=0;i<input.frames.length;i++){
        const frame=input.frames[i];
        let image=sharp(base64(frame.data,1500000),{limitInputPixels:1920*1080});
        if(frame.crop)image=image.extract({left:frame.crop.x,top:frame.crop.y,width:frame.crop.width,height:frame.crop.height});
        const jpeg=await image.resize({width:1280,height:720,fit:'inside',withoutEnlargement:true}).jpeg({quality:75}).toBuffer();
        await fs.writeFile(path.join(dir,`${i}.jpg`),jpeg,{mode:0o600});
        frames.push({atMs:frame.atMs,dataUrl:'data:image/jpeg;base64,'+jpeg.toString('base64')});
        const start=i?frame.atMs:input.startMs,end=input.frames[i+1]?.atMs??input.endMs;
        list.push(`file '${i}.jpg'`,`duration ${Math.max(.001,(end-start)/1000)}`);
      }
      list.push(`file '${frames.length-1}.jpg'`);await fs.writeFile(path.join(dir,'frames.txt'),list.join('\n'));
      let audio=null;
      if(input.audio){
        const raw=base64(input.audio,2100000);
        if(raw.toString('ascii',0,4)!=='RIFF'||raw.toString('ascii',8,12)!=='WAVE')throw Error('Audio WAV requis.');
        await fs.writeFile(path.join(dir,'source.wav'),raw,{mode:0o600});
        await command(this.ffmpeg,['-nostdin','-v','error','-i',path.join(dir,'source.wav'),'-t',String((input.endMs-input.startMs)/1000),'-ar','16000','-ac','1',path.join(dir,'audio.wav')]);
        audio=await fs.readFile(path.join(dir,'audio.wav'));
      }
      const args=['-nostdin','-v','error','-f','concat','-safe','0','-i',path.join(dir,'frames.txt')];
      if(audio)args.push('-i',path.join(dir,'audio.wav'),'-c:a','libopus');
      args.push('-t',String((input.endMs-input.startMs)/1000),'-vf','fps=2','-c:v','libvpx','-deadline','realtime','-cpu-used','8','-b:v','500k',path.join(dir,'clip.webm'));
      await command(this.ffmpeg,args);
      return {...input,frames,audio,clip:await fs.readFile(path.join(dir,'clip.webm'))};
    }finally{await fs.rm(dir,{recursive:true,force:true});}
  }
}
module.exports={RemoteMedia,validateRemote};
