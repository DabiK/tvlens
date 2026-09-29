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
  start(question, {mode='inspect',intent,snapshot,anchorMs,startMs} = {}) {
    if(typeof question!=='string'||!question.trim()||question.length>2000) throw new Error('Question invalide.');
    if(this.jobs.filter(j=>j.status==='queued').length>=5)throw new Error('Cinq questions sont déjà en attente. Attends une réponse ou annule une question.');
    if(intent!==undefined&&!['recap','explain-moment'].includes(intent))throw new Error('Action inconnue.');
    if(anchorMs!==undefined&&(!Number.isFinite(anchorMs)||anchorMs<0)||startMs!==undefined&&(!Number.isFinite(startMs)||startMs<0||anchorMs!==undefined&&startMs>anchorMs))throw new Error('Intervalle de question invalide.');
    const controller=new AbortController();
    const job={id:`deep-${++this.sequence}`,question,mode,intent,createdAt:this.now(),status:'queued',message:'En attente de la réponse précédente…',activity:[],preview:'',controller,result:null};
    job.tools=this.makeTools(controller.signal,message=>this.progress(job,{message}),{snapshot,anchorMs,startMs});
    if(anchorMs!==undefined||startMs!==undefined)job.tools.scope?.({anchorMs,startMs});
    job.sessionId=job.tools.sessionId;job.anchorMs=job.tools.anchorMs;
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
          const conversation=job.intent?[]:this.jobs.filter(j=>j!==job&&j.sessionId===job.sessionId&&j.result).slice(-6).map(j=>({question:j.question,answer:j.result.answer,sources:j.result.sources||[]}));
          const context=job.mode==='chat'?job.tools.context?.({intent:job.intent}):undefined;
          job.contextReadyAt=this.now();
          if(context?.passages?.length&&(job.intent||isRecentSummary(job.question))){
            const passages=context.passages.slice(-3);
            job.memoryPreview={passages,precision:context.precision,pendingCount:context.pendingCount,failedCount:context.failedCount,omittedCount:context.omittedCount,unanalyzedTailMs:context.unanalyzedTailMs,coverageGaps:context.coverageGaps,uncoveredMs:context.uncoveredMs};
            const text=passages.map(p=>p.text.slice(0,500)).join('\n');
            this.progress(job,{message:'Passages retrouvés · préparation de la réponse…',provisional:'D’après les résumés automatiques :\n'+text});
          }else this.progress(job,{message:context?.pendingCount?'Les derniers passages sont encore en analyse…':'Lecture de la mémoire disponible…'});
          if(job.intent&&context){
            if(context.coverageGaps?.length)job.tools.limits.push(`L’intervalle demandé contient ${context.coverageGaps.length} interruption(s) sans passage consultable (${(context.uncoveredMs/1000).toLocaleString('fr-FR',{maximumFractionDigits:1})} s au total). La réponse ne couvre pas ces interruptions.`);
            if(context.pendingCount)job.tools.limits.push(`${context.pendingCount} passage(s) encore en analyse au moment de la question.`);
            if(context.failedCount)job.tools.limits.push(`${context.failedCount} passage(s) sans analyse exploitable.`);
            if(context.omittedCount)job.tools.limits.push(`${context.omittedCount} résumé(s) plus ancien(s) non inclus dans ce récapitulatif.`);
            if(context.unanalyzedTailMs>0)job.tools.limits.push('La fin de l’intervalle demandé n’est pas encore entièrement analysée.');
          }
          const result=await this.agent.answer({context,question:job.question,tools:job.tools,signal:job.controller.signal,mode:job.mode,conversation,onProgress:value=>this.progress(job,value)});
          if(job.status!=='running')return;
          // Only observed, validated evidence issued by our tool can justify a video answer.
          const observations=job.tools.observations;
          const priorEvidence=job.mode==='chat'&&!job.intent?this.jobs.filter(j=>j!==job&&j.sessionId===job.sessionId&&j.status==='done').flatMap(j=>[...(j.result?.observations||[]),...(j.tools?.memoryEvidence||[])]).filter(e=>e.endMs<=job.tools.anchorMs):[];
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
          job.sourcesReused=result.sourcesReused||0;
          if(job.firstUsefulAt===undefined&&job.result.kind!=='insufficient')job.firstUsefulAt=this.now();
          job.status='done';
        } catch(error) {
          if(job.status!=='running')return;
          job.status='error';job.message=error.message;job.result=this.partial(job.tools,job.mode);
        }
        job.finishedAt=this.now();this.emit();
      })()]);
    } finally {clearTimeout(timer);clearTimeout(progress);job.controller.signal.removeEventListener('abort',onAbort);
      const end=job.finishedAt??this.now();
      job.metrics={waitMs:job.startedAt-job.createdAt,contextMs:job.contextReadyAt===undefined?null:job.contextReadyAt-job.startedAt,firstProgressMs:job.firstProgressAt===undefined?null:job.firstProgressAt-job.startedAt,firstUsefulMs:job.firstUsefulAt===undefined?null:job.firstUsefulAt-job.startedAt,totalMs:end-job.startedAt,endToEndMs:end-job.createdAt,sourcesReused:job.sourcesReused||0,inspectionCacheHits:job.tools.inspectionCacheHits||0,tools:[...(job.tools.toolMetrics||[])]};
      this.emit();
    }
  }
  progress(job,value){
    if(job.status!=='running')return;
    if(value.message){if(job.firstProgressAt===undefined)job.firstProgressAt=this.now();job.message=value.message;if(job.activity.at(-1)?.message!==value.message){job.activity.push({message:value.message,at:this.now()});job.activity=job.activity.slice(-12);}}
    if(typeof value.provisional==='string'&&value.provisional.trim()){job.provisional=value.provisional;if(job.firstUsefulAt===undefined)job.firstUsefulAt=this.now();}
    if(typeof value.preview==='string'&&value.preview.trim()){job.preview=value.preview.slice(0,12000);if(job.firstUsefulAt===undefined)job.firstUsefulAt=this.now();}
    this.emit();
  }
  partial(tools,mode='inspect') {
    return {answer:tools.observations.length ? tools.observations.map(o=>o.text).join('\n') : 'Je n’ai pas obtenu de preuve suffisante pour répondre.',kind:tools.observations.length?'observation':'insufficient',citations:tools.observations.map(({id,startMs,endMs})=>({id,startMs,endMs})),observations:[...tools.observations],hypotheses:[...tools.hypotheses],limits:[...tools.limits,'Résultat limité aux observations déjà obtenues.']};
  }
}
function isRecentSummary(question){
  const q=question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return /(?:ca parle de quoi|qu.est.ce qui vient de se passer|j.ai decroche|^(?:resume|recapitule)(?:[.!? ]*$| (?:ce moment|cette scene|ce qui vient)))/.test(q)&&!/(?:vrai|verifi|source|exact|combien|pourquoi|il y a|premier|debut|[0-9])/.test(q);
}
module.exports={DeepAsk,needsInspection,isRecentSummary};
