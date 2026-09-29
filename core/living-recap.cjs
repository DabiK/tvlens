const {passageText}=require('./moment-search.cjs');

// The source archive lives alongside the synthesized chapters. Retention only changes replay availability.
class LivingRecap {
  constructor({summarize,onChange=()=>{},now=Date.now,throttleMs=25000,timeoutMs=45000}) {
    Object.assign(this,{summarize,onChange,now,throttleMs,timeoutMs});this.generation=0;this.reset();
  }
  reset(sessionId=null) {
    this.active?.controller.abort(new Error('Nouvelle session.'));
    this.generation++;this.active=null;this.sessionId=sessionId;this.originals=new Map();this.included=new Map();
    this.chapters=[];this.overview='';this.updatedAt=null;this.lastAttempt=null;this.error=null;this.status='idle';this.limits=[];this.emit();
  }
  observe(snapshot) {
    if(!snapshot||!snapshot.id)return this.snapshot();
    if(this.sessionId!==snapshot.id)this.reset(snapshot.id);
    const segments=[...(snapshot.history||[]).map(s=>({...s,available:false})),...(snapshot.segments||[])];
    // If an older source drops out of an upstream snapshot, keep its text but do not advertise replay.
    for(const source of this.originals.values())source.available=false;
    for(const segment of segments){
      if(segment.status!=='ready'||!passageText(segment).trim())continue;
      this.originals.set(segment.id,{id:segment.id,startMs:segment.startMs,endMs:segment.endMs,text:passageText(segment),available:Boolean(segment.available)});
    }
    const pending=segments.filter(s=>['queued','analyzing'].includes(s.status)).length;
    const missing=segments.filter(s=>['error','skipped','expired'].includes(s.status)).length;
    this.limits=['Résumé issu d’analyses automatiques, susceptible d’imprécisions.'];
    if(pending)this.limits.push(`${pending} passage(s) encore en analyse.`);
    if(missing)this.limits.push(`${missing} passage(s) sans analyse exploitable.`);
    const sorted=[...segments].sort((a,b)=>a.startMs-b.startMs);let through=0,holes=0;
    for(const s of sorted){if(s.startMs-through>250)holes++;through=Math.max(through,s.endMs);}
    if(holes)this.limits.push(`${holes} interruption(s) de capture : ces intervalles ne sont pas résumés.`);
    if(!this.active)this.status=this.error?'error':this.originals.size?(this.pending().length?'waiting':'ready'):'idle';
    this.emit();return this.snapshot();
  }
  fingerprint(source){return JSON.stringify([source.startMs,source.endMs,source.text]);}
  pending(){return [...this.originals.values()].filter(s=>this.included.get(s.id)!==this.fingerprint(s)).sort((a,b)=>a.startMs-b.startMs);}
  snapshot(){
    const chapters=this.chapters.map(chapter=>{
      const sources=chapter.sourceIds.map(id=>this.originals.get(id)).filter(Boolean);
      return {...chapter,sourceIds:[...chapter.sourceIds],available:sources.some(s=>s.available),
        replaySourceIds:sources.filter(s=>s.available).map(s=>s.id),sources:sources.map(({id,startMs,endMs,available})=>({id,startMs,endMs,available}))};
    });
    return {sessionId:this.sessionId,status:this.status,overview:this.overview,chapters,pendingCount:this.pending().length,
      sourceCount:this.originals.size,sourcePassages:[...this.originals.values()].map(s=>({...s})),
      overviewSourceIds:chapters.flatMap(c=>c.sourceIds),limits:[...this.limits,...(this.overview&&this.pending().length?[`${this.pending().length} passage(s) récent(s) en attente d’intégration au résumé.`]:[])],updatedAt:this.updatedAt,error:this.error};
  }
  emit(){const state=this.snapshot(),key=JSON.stringify(state);if(key===this.emitted)return;this.emitted=key;this.onChange(state);}
  tick({busy=false}={}) {
    if(busy){
      const wasActive=Boolean(this.active),previousStatus=this.status;
      if(this.active){this.active.controller.abort(new Error('Priorité à la question en cours.'));this.generation++;this.active=null;this.lastAttempt=null;}
      this.status=this.error?'error':this.pending().length?'waiting':this.overview?'ready':'idle';
      if(wasActive||this.status!==previousStatus)this.emit();
      return Promise.resolve(this.snapshot());
    }
    if(this.active)return this.active.done;
    const newPassages=this.pending();
    if(!newPassages.length||!this.sessionId||this.lastAttempt!==null&&this.now()-this.lastAttempt<this.throttleMs)return Promise.resolve(this.snapshot());
    const controller=new AbortController(),generation=this.generation,sources=new Map([...this.originals].map(([id,s])=>[id,{...s}]));
    const active={controller,generation,done:null};this.active=active;this.lastAttempt=this.now();this.status='updating';this.error=null;
    const chapters=this.chapters.map(({id,title,summary,sourceIds})=>({id,title,summary,sourceIds:[...sourceIds]}));
    this.emit();
    active.done=(async()=>{
      let timer,onAbort;
      const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(controller.signal.reason||new Error('Actualisation annulée.'));controller.signal.addEventListener('abort',onAbort,{once:true});});
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new Error('Le délai d’actualisation du résumé est dépassé. Une nouvelle tentative sera possible.');reject(error);controller.abort(error);},this.timeoutMs);});
      try{
        const result=await Promise.race([this.summarize({sessionId:this.sessionId,chapters,newPassages:newPassages.map(s=>({...s})),sourcePassages:[...sources.values()].map(s=>({...s})),limits:[...this.limits],signal:controller.signal}),cancelled,deadline]);
        if(controller.signal.aborted||this.generation!==generation||this.active!==active)return this.snapshot();
        const validated=validateRecap(result,sources);
        // Edits arriving while synthesis runs cannot be silently marked as incorporated.
        this.chapters=validated.chapters;this.overview=validated.overview;
        for(const [id,source] of sources)this.included.set(id,this.fingerprint(source));
        this.updatedAt=this.now();this.status=this.pending().length?'waiting':'ready';
      }catch(error){
        if(this.generation!==generation||this.active!==active)return this.snapshot();
        this.error=error.message;this.status='error';this.lastAttempt=this.now();
      }finally{clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);if(this.active===active){this.active=null;this.emit();}}
      return this.snapshot();
    })();
    return active.done;
  }
}
function validateRecap(value,sources){
  const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
  if(!value||!text(value.overview,1800)||!Array.isArray(value.chapters)||!value.chapters.length||value.chapters.length>sources.size)throw Error('Résumé vivant invalide.');
  const used=new Set();
  const chapters=value.chapters.map(chapter=>{
    if(!text(chapter.title,120)||!text(chapter.summary,1800)||!Array.isArray(chapter.sourceIds)||!chapter.sourceIds.length)throw Error('Chapitre du résumé invalide.');
    const evidence=chapter.sourceIds.map(id=>{
      if(typeof id!=='string'||!sources.has(id)||used.has(id))throw Error('Sources du résumé invalides ou répétées.');
      used.add(id);return sources.get(id);
    }).sort((a,b)=>a.startMs-b.startMs);
    return {id:`chapter-${evidence[0].id}`,title:chapter.title.trim(),summary:chapter.summary.trim(),sourceIds:evidence.map(s=>s.id),
      startMs:Math.min(...evidence.map(s=>s.startMs)),endMs:Math.max(...evidence.map(s=>s.endMs))};
  }).sort((a,b)=>a.startMs-b.startMs);
  if(used.size!==sources.size)throw Error('Le résumé a omis des passages déjà analysés.');
  return {overview:value.overview.trim(),chapters};
}
module.exports={LivingRecap,validateRecap};
