const words=text=>new Set(text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9]{3,}/g)||[]);
function similar(a,b){const x=words(a),y=words(b);const intersection=[...x].filter(w=>y.has(w)).length;return intersection/Math.max(1,new Set([...x,...y]).size)>=0.8;}
class AutoMonitor {
 constructor({evaluate,now=Date.now,onChange=()=>{}}){Object.assign(this,{evaluate,now,onChange});this.enabled=false;this.results=[];this.seen=[];this.sequence=0;this.busy=false;this.generation=0;this.lastCheckedMs=0;}
 configure({instruction,frequencySeconds=30},snapshot){
  if(typeof instruction!=='string'||!instruction.trim()||instruction.length>1500)throw Error('Consigne Auto requise (1–1500 caractères).');
  if(!Number.isFinite(frequencySeconds)||frequencySeconds<15||frequencySeconds>300)throw Error('Fréquence : 15 à 300 secondes.');
  this.stop();this.enabled=true;this.instruction=instruction.trim();this.frequencySeconds=frequencySeconds;this.sessionId=snapshot.id;this.activationMs=snapshot.elapsedMs;this.lastCheckedMs=this.activationMs;this.lastProcessedMs=this.activationMs;this.seen=[];this.message='Surveillance activée à partir de maintenant.';this.emit();
 }
 stop(){this.generation++;this.controller?.abort(Error('Auto arrêté.'));this.enabled=false;this.busy=false;this.message='Auto désactivé.';this.emit();}
 prioritizeManual(){if(this.busy){this.generation++;this.controller?.abort(Error('Priorité à la question manuelle.'));this.busy=false;this.message='Auto suspendu pendant les questions manuelles.';this.emit();}}
 async tick(snapshot,manualBusy){
  if(!this.enabled||this.busy||manualBusy||!snapshot?.accepting||snapshot.id!==this.sessionId)return;
  if(snapshot.elapsedMs-this.lastCheckedMs<this.frequencySeconds*1000)return;
  const segments=snapshot.segments.filter(s=>s.status==='ready'&&s.startMs>=this.activationMs&&s.endMs>this.lastProcessedMs&&!this.seen.includes(s.id));
  const eligible=segments;
  if(!eligible.length)return;
  const selected=eligible.slice(-6),generation=this.generation;this.lastCheckedMs=snapshot.elapsedMs;this.busy=true;this.controller=new AbortController();this.message='Lecture des nouveaux passages…';this.emit();
  try{
   const result=await this.evaluate({instruction:this.instruction,snapshot:{...snapshot,history:[],segments:selected},signal:this.controller.signal,recent:this.results.filter(r=>r.sessionId===this.sessionId).slice(-5).map(x=>x.result.answer),onProgress:message=>{if(generation===this.generation){this.message=message;this.emit();}}});
   if(generation!==this.generation||this.controller.signal.aborted)return;
   this.seen.push(...selected.map(s=>s.id));this.seen=this.seen.slice(-500);this.lastProcessedMs=selected.at(-1).endMs;
   if(result?.kind!=='insufficient'&&result?.citations?.length&&!this.results.some(x=>x.sessionId===this.sessionId&&similar(x.result.answer,result.answer))){this.results.push({id:'auto-'+(++this.sequence),at:this.now(),instruction:this.instruction,sessionId:this.sessionId,startMs:selected[0].startMs,endMs:selected.at(-1).endMs,result});this.message='Nouveau résultat sourcé dans le passage.';}else this.message='Aucun nouveau résultat pertinent.';
  }catch(e){if(generation===this.generation)this.message=e.message;}
  finally{if(generation===this.generation){this.busy=false;this.emit();}}
 }
 snapshot(){return {enabled:this.enabled,busy:this.busy,instruction:this.instruction||'',frequencySeconds:this.frequencySeconds||30,activationMs:this.activationMs,sessionId:this.sessionId,message:this.message||'Auto désactivé.',results:this.results};}
 emit(){this.onChange(this.snapshot());}
}
module.exports={AutoMonitor,similar};
