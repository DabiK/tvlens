function needsInspection(question) {
  return /(?:pourquoi|comment|combien de fois|avant|apres|après|entre|tombe|tombé|chute|geste|action|mouvement|que fait|se passer|s.est passe|s’est passé|s'est passé|déplace|deplace|changement|bouge|revois|revoir|approfond|retrouve|cherche.*moment)/i.test(question);
}
class DeepAsk {
  constructor({ makeTools, agent, onChange=()=>{}, now=Date.now, timeoutMs=60000, progressMs=30000 }) {
    Object.assign(this,{makeTools,agent,onChange,now,timeoutMs,progressMs}); this.jobs=[]; this.sequence=0; this.active=null;
  }
  snapshot() { return { jobs:this.jobs.map(({controller,tools,done,_finish,...j})=>({...j})) }; }
  emit() { this.onChange(this.snapshot()); }
  cancel(reason='Recherche annulée.',id) {
    const job=id?this.jobs.find(j=>j.id===id):this.active;if(!job||!['queued','running'].includes(job.status))return;
    const queued=job.status==='queued';job.status='cancelled';job.message=reason;job.finishedAt=this.now();
    if(job.tools.observations.length)job.result=this.partial(job.tools,job.mode);
    job.controller.abort(new Error(reason));if(queued)job._finish();this.emit();
  }
  cancelAll(reason='Session terminée.') {
    for(const job of this.jobs.filter(j=>j.status==='queued'))this.cancel(reason,job.id);
    this.cancel(reason);
  }
  start(question, {mode='inspect'} = {}) {
    if(typeof question!=='string'||!question.trim()||question.length>2000) throw new Error('Question invalide.');
    if(this.jobs.filter(j=>j.status==='queued').length>=5)throw new Error('Cinq questions sont déjà en attente. Attends une réponse ou annule une question.');
    const controller=new AbortController();
    const job={id:`deep-${++this.sequence}`,question,mode,createdAt:this.now(),status:'queued',message:'En attente de la réponse précédente…',activity:[],preview:'',controller,result:null};
    job.tools=this.makeTools(controller.signal,message=>this.progress(job,{message}));job.sessionId=job.tools.sessionId;job.anchorMs=job.tools.anchorMs;
    job.done=new Promise(resolve=>{job._finish=resolve;});this.jobs.push(job);this.emit();this.drain();
    return {id:job.id};
  }
  drain(){
    if(this.active)return;const job=this.jobs.find(j=>j.status==='queued');if(!job)return;
    this.active=job;job.status='running';job.startedAt=this.now();job.message='Question reçue…';job.activity.push({message:job.message,at:job.startedAt});this.emit();
    this.run(job).finally(()=>{if(this.active===job)this.active=null;job._finish();this.drain();});
  }
  async run(job) {
    let timer,progress,onAbort;
    const cancelled=new Promise(resolve=>{onAbort=resolve;job.controller.signal.addEventListener('abort',onAbort,{once:true});});
    const timeout=new Promise(resolve=>{timer=setTimeout(()=>{
      if(job.status!=='running') return;
      job.status='timeout';job.message='Limite de 60 secondes atteinte.';job.result=this.partial(job.tools,job.mode);job.finishedAt=this.now();
      job.controller.abort(new Error('Délai maximal atteint.')); this.emit();resolve();
    },this.timeoutMs);});
    progress=setTimeout(()=>{if(job.status==='running'){job.message='La recherche continue · arrêt au plus tard à 60 secondes.';this.emit();}},this.progressMs);
    try {
      await Promise.race([timeout,cancelled,(async()=>{
        try {
          const conversation=this.jobs.filter(j=>j!==job&&j.sessionId===job.sessionId&&j.result).slice(-6).map(j=>({question:j.question,answer:j.result.answer,sources:j.result.sources||[]}));
          const context=job.mode==='chat'?job.tools.context?.():undefined;
          const result=await this.agent.answer({context,question:job.question,tools:job.tools,signal:job.controller.signal,mode:job.mode,conversation,onProgress:value=>this.progress(job,value)});
          if(job.status!=='running')return;
          // Only observed, validated evidence issued by our tool can justify a video answer.
          const observations=job.tools.observations;
          const priorEvidence=job.mode==='chat'?this.jobs.filter(j=>j!==job&&j.sessionId===job.sessionId&&j.status==='done').flatMap(j=>[...(j.result?.observations||[]),...(j.tools?.memoryEvidence||[])]).filter(e=>e.endMs<=job.tools.anchorMs):[];
          const evidence=[...observations,...priorEvidence,...(job.mode==='chat' ? [...(job.tools.transcriptEvidence||[]),...(job.tools.memoryEvidence||[])] : [])];
          const citations=(result.citations||[]).flatMap(c=>{
            if(!Number.isFinite(c.startMs)||!Number.isFinite(c.endMs)||c.endMs<=c.startMs)return [];
            // Model JSON may round fractional recorder milliseconds. Clamp back to the actual evidence.
            const match=evidence.find(o=>o.id===c.id&&c.startMs>=o.startMs-1&&c.endMs<=o.endMs+1);
            if(!match)return [];
            const startMs=Math.max(c.startMs,match.startMs),endMs=Math.min(c.endMs,match.endMs);
            return endMs>startMs?[{id:c.id,startMs,endMs}]:[];
          });
          job.validation={evidenceCount:evidence.length,proposedCitations:(result.citations||[]).length,acceptedCitations:citations.length,sourceValidation:result.sourceValidation,sourceRepair:result.sourceRepair};
          job.audit=result.audit||[];
          const external=job.mode==='chat'&&result.kind==='external'&&result.sources?.length;
          const missingSources=result.sourceValidation?.proposed>0&&!result.sources?.length;
          const conversational=!missingSources&&job.mode==='chat'&&['insufficient','explanation'].includes(result.kind);
          job.result=(!missingSources&&citations.length&&result.kind!=='external')||external||conversational ? {...result,citations,observations:[...observations],hypotheses:job.tools.hypotheses,limits:[...(result.limits||[]),...job.tools.limits]} : {...this.partial(job.tools,job.mode),answer:result.kind==='external'||missingSources ? 'Je n’ai pas pu confirmer les sources de cette réponse. Je ne peux pas encore fournir un lien fiable.' : 'Je n’ai pas pu relier cette réponse aux passages consultés.',kind:'insufficient',citations:[],observations:[],hypotheses:[],sources:[],limits:['La réponse proposée n’a pas passé la validation des preuves.']};
          job.metrics={waitMs:job.startedAt-job.createdAt,firstUsefulMs:job.firstUsefulAt?job.firstUsefulAt-job.startedAt:null,totalMs:this.now()-job.startedAt,sourcesReused:result.sourcesReused||0,inspectionCacheHits:job.tools.inspectionCacheHits||0};
          job.status='done';
        } catch(error) {
          if(job.status!=='running')return;
          job.status='error';job.message=error.message;job.result=this.partial(job.tools,job.mode);
        }
        job.finishedAt=this.now();this.emit();
      })()]);
    } finally {clearTimeout(timer);clearTimeout(progress);job.controller.signal.removeEventListener('abort',onAbort);}
  }
  progress(job,value){
    if(job.status!=='running')return;
    if(value.message){job.message=value.message;if(job.activity.at(-1)?.message!==value.message){job.activity.push({message:value.message,at:this.now()});job.activity=job.activity.slice(-12);}}
    if(typeof value.provisional==='string'){job.provisional=value.provisional;if(!job.firstUsefulAt)job.firstUsefulAt=this.now();}
    if(typeof value.preview==='string'){job.preview=value.preview.slice(0,12000);if(!job.firstUsefulAt)job.firstUsefulAt=this.now();}
    this.emit();
  }
  partial(tools,mode='inspect') {
    return {answer:tools.observations.length ? tools.observations.map(o=>o.text).join('\n') : 'Je n’ai pas obtenu de preuve suffisante pour répondre.',kind:tools.observations.length?'observation':'insufficient',citations:tools.observations.map(({id,startMs,endMs})=>({id,startMs,endMs})),observations:[...tools.observations],hypotheses:[...tools.hypotheses],limits:[...tools.limits,'Résultat limité aux observations déjà obtenues.']};
  }
}
module.exports={DeepAsk,needsInspection};
