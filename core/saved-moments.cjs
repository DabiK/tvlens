// Explicit durable conservation, independent of rolling retention and AI providers.
class SavedMoments {
 constructor({archive,makeId,now=Date.now,transcriber}){Object.assign(this,{archive,makeId,now,transcriber});}
 async keep({snapshot,media,durationMs=30000}){
  const anchorMs=snapshot.segments.at(-1)?.endMs||0;
  const moments=snapshot.segments.filter(s=>s.available&&s.endMs>anchorMs-durationMs&&s.endMs<=anchorMs);
  if(!moments.length)throw Error('Aucun passage récent disponible à conserver.');
  const release=await media.lease(moments.map(s=>s.id));
  try{for(const moment of moments){if(!moment.observation?.transcript&&this.transcriber){const data=await media.read(moment.id);const audio=await this.transcriber.transcribe(data.audio,AbortSignal.timeout(15000));moment.observation={...moment.observation,transcript:audio.text,uncertainty:[moment.observation?.uncertainty,...audio.limits].filter(Boolean).join(' ')};}}return await this.archive.save({id:this.makeId(),sessionId:snapshot.id,createdAt:this.now(),anchorMs,startMs:moments[0].startMs,endMs:moments.at(-1).endMs,moments:moments.map(({id,startMs,endMs,observation,status})=>({id,startMs,endMs,observation,status})),retention:'Conservé sur ce Mac jusqu’à suppression explicite.'},media);}finally{await release();}
 }
 list(){return this.archive.list();}
 remove(id){return this.archive.remove(id);}
}
module.exports={SavedMoments};
