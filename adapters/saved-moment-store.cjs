const fs=require('node:fs/promises');const path=require('node:path');const {LocalSessionStore}=require('./local-store.cjs');
class SavedMomentStore {
 constructor(root){this.root=root;}
 dir(id){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Identifiant sauvegardé invalide.');return path.join(this.root,id);}
 async save(value,media){
  const dir=this.dir(value.id),temp=dir+'.tmp';await fs.mkdir(temp,{recursive:true,mode:0o700});
  try{for(const m of value.moments){await fs.copyFile(media.file(m.id,'webm'),path.join(temp,m.id+'.webm'));const data=await media.read(m.id);m.preview=data.frames?.[0]?.dataUrl||null;}
   await fs.writeFile(path.join(temp,'saved.json'),JSON.stringify(value,null,2),{mode:0o600});await fs.rename(temp,dir);return value;
  }catch(e){await fs.rm(temp,{recursive:true,force:true});throw e;}
 }
 async list(){const dirs=await fs.readdir(this.root,{withFileTypes:true}).catch(()=>[]);const out=[];for(const d of dirs)if(d.isDirectory()&&/^[a-f0-9-]{36}$/.test(d.name)){try{out.push(JSON.parse(await fs.readFile(path.join(this.root,d.name,'saved.json'),'utf8')));}catch{}}return out.sort((a,b)=>b.createdAt-a.createdAt);}
 async remove(id){await fs.rm(this.dir(id),{recursive:true,force:true});}
 response(id,moment,range){return new LocalSessionStore(this.dir(id)).response(moment,range);}
}
module.exports={SavedMomentStore};
