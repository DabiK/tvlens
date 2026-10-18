const { domainError } = require('./shared/domain-error.cjs');
const TVLENS_QUESTION_INVALID = 'TVLENS_QUESTION_INVALID';
const TVLENS_QUESTION_QUEUE_FULL = 'TVLENS_QUESTION_QUEUE_FULL';
const TVLENS_QUESTION_ACTION_INVALID = 'TVLENS_QUESTION_ACTION_INVALID';
const TVLENS_QUESTION_INTERVAL_INVALID = 'TVLENS_QUESTION_INTERVAL_INVALID';
const { publishState } = require('./state-publication.cjs');
// Core must not import adapters: tracing and error serialization are injected by the runtime.
// An answer is plain text: its pages travel in `sources`, shown apart by every client. A model that still writes a
// Markdown link keeps its words and loses the address; nothing else of the answer is touched.
const plainAnswer=text=>typeof text==='string'?text.replace(/\[([^\]\n]{1,200})\]\(https?:\/\/[^\s)]+\)/g,'$1'):text;
// Product decision 1: one processing ceiling for a question on every host. It runs from the moment the
// question leaves the queue; the wait before that is measured apart and never counted against it.
const QUESTION_TIMEOUT_MS=300000,QUESTION_PROGRESS_MS=30000;
const publicationContext = job => ({ sessionId: job?.sessionId, jobId: job?.id });
// Wording of a ceiling for the viewer, derived from the value really enforced: whole minutes when exact,
// otherwise seconds rounded up so that the announced limit is never shorter than the real one.
function limitLabel(ms){
  if(ms>=60000&&ms%60000===0){const minutes=ms/60000;return `${minutes} minute${minutes>1?'s':''}`;}
  const seconds=Math.max(1,Math.ceil(ms/1000));return `${seconds} seconde${seconds>1?'s':''}`;
}
class DeepAsk {
  constructor({ makeTools, agent, onChange = () => {}, onPublicationError = () => {}, now = Date.now,
    timeoutMs = QUESTION_TIMEOUT_MS, progressMs = QUESTION_PROGRESS_MS,
    onTrace = () => {}, serializeError = () => ({}), getInstruction = () => undefined }) {
    Object.assign(this, { makeTools, agent, onChange, onPublicationError, now, timeoutMs,
      progressMs, onTrace, serializeError, getInstruction });
    this.jobs = [];
    this.sequence = 0;
    this.active = null;
  }
  // Diagnostics can never fail a job: both hooks are guarded and default to noop / empty detail.
  trace(event,fields={}){try{this.onTrace(event,fields);}catch{
    // Le diagnostic est perdu ; la réponse et le passage à la question suivante ne dépendent pas de ce callback.
  }}
  describeError(error){try{const d=this.serializeError(error);return d&&typeof d==='object'?{...d}:{};}catch{return {};}
  }
  snapshot() { return { jobs:this.jobs.map(({controller,tools,done,_finish,...j})=>({...j})) }; }
  emit({ sessionId, jobId } = publicationContext(this.active)) {
    publishState(() => this.onChange(this.snapshot()), this.onPublicationError, {
      origin: 'deep-ask', sessionId, jobId,
    });
  }
  cancel(reason='Recherche annulée.',id) {
    const job=id?this.jobs.find(j=>j.id===id):this.active;if(!job||!['queued','running'].includes(job.status))return;
    const queued=job.status==='queued';job.status='cancelled';job.message=reason;job.finishedAt=this.now();
    if(job.tools.observations.length)job.result=this.partial(job.tools,job.mode);
    // A question cancelled in the queue never reached the agent: nothing can still be using its tools.
    job.controller.abort(new Error(reason));
    if (queued) {
      job._finish();
      this.release(job);
    }
    this.emit(publicationContext(job));
  }
  // A finished question keeps its answer, not its working context. A moment action keeps the passages of its own
  // interval, which the host reads to re-examine that moment. Housekeeping: tools that cannot be released (restored
  // copies, test doubles) stay as they are, and a failure here never reaches the question nor the queue.
  release(job){try{job.tools.release?.({keepPassages:Boolean(job.intent)});}catch{
    // La réponse acquise et la file continuent sans nouvel essai ; les références des outils peuvent rester retenues.
    // Ce contrat ne garantit pas la libération effective après un échec du nettoyage (ADR 0004).
  }}
  cancelAll(reason='Session terminée.') {
    for(const job of this.jobs.filter(j=>j.status==='queued'))this.cancel(reason,job.id);
    this.cancel(reason);
  }
  // Reopened archive: the saved questions come back as finished copies. Work interrupted by the closing
  // is settled as cancelled, never resumed; new ids continue after both the archive and this instance.
  // Silent on purpose: an onChange here would make the host rewrite the archive it has just opened.
  restore(jobs=[]) {
    if(this.active||this.jobs.some(j=>['queued','running'].includes(j.status)))throw new Error('Une question est en cours.');
    this.jobs=(Array.isArray(jobs)?jobs:[]).filter(j=>j&&typeof j.id==='string'&&typeof j.question==='string').map(saved=>{
      const job={...JSON.parse(JSON.stringify(saved)),controller:new AbortController(),tools:{observations:[],hypotheses:[],limits:[],memoryEvidence:[]},done:Promise.resolve(),_finish(){}};
      if(['queued','running'].includes(job.status)){job.status='cancelled';job.message='Interrompue à la fermeture de la session.';job.finishedAt??=job.startedAt??job.createdAt;}
      return job;
    });
    this.sequence=Math.max(this.sequence,...this.jobs.map(j=>Number(/^deep-(\d+)$/.exec(j.id)?.[1])||0));
    return this.snapshot();
  }
  start(question, {mode='inspect',intent,consultation,anchorMs,startMs} = {}) {
    if (typeof question !== 'string' || !question.trim() || question.length > 2000)
      throw domainError(TVLENS_QUESTION_INVALID, 'Question invalide.');
    if (this.jobs.filter(j => j.status === 'queued').length >= 5)
      throw domainError(TVLENS_QUESTION_QUEUE_FULL, 'Cinq questions sont déjà en attente. Attends une réponse ou annule une question.');
    if (intent !== undefined && !['recap', 'explain-moment'].includes(intent))
      throw domainError(TVLENS_QUESTION_ACTION_INVALID, 'Action inconnue.');
    if (anchorMs !== undefined && (!Number.isFinite(anchorMs) || anchorMs < 0)
      || startMs !== undefined && (!Number.isFinite(startMs) || startMs < 0 || anchorMs !== undefined && startMs > anchorMs))
      throw domainError(TVLENS_QUESTION_INTERVAL_INVALID, 'Intervalle de question invalide.');
    const controller=new AbortController();
    // The ceiling travels with the job: clients show elapsed / ceiling from the published state, without a literal of their own.
    const job={id:`deep-${++this.sequence}`,question,mode,intent,createdAt:this.now(),timeoutMs:this.timeoutMs,status:'queued',message:'En attente de la réponse précédente…',activity:[],preview:'',controller,result:null};
    job.tools=this.makeTools(controller.signal,message=>this.progress(job,{message}),{consultation,anchorMs,startMs});
    if(anchorMs!==undefined||startMs!==undefined)job.tools.scope?.({anchorMs,startMs});
    job.sessionId=job.tools.sessionId;job.anchorMs=job.tools.anchorMs;
    // Freshness shown to the viewer: what was consultable when the question froze. Times and counts only.
    try{const available=job.tools.availability?.();if(available)job.availability={...available};}catch{
      // Le champ availability reste absent ; l'agent utilise ses outils et aucune plage consultable n'est inventée.
    }
    if(mode==="chat")this.trace("job.accepted",{jobId:job.id,sessionId:job.sessionId,questionLength:question.length,mode,intent,anchorMs:job.anchorMs});
    job.done = new Promise(resolve => { job._finish = resolve; });
    this.jobs.push(job);
    this.emit(publicationContext(job));
    this.drain();
    return {id:job.id};
  }
  drain(){
    if(this.active)return;const job=this.jobs.find(j=>j.status==='queued');if(!job)return;
    this.active = job;
    job.status = 'running';
    job.startedAt = this.now();
    job.message = 'Question reçue…';
    job.activity.push({ message: job.message, at: job.startedAt });
    this.emit(publicationContext(job));
    this.run(job).finally(()=>{if(this.active===job)this.active=null;job._finish();this.drain();});
  }
  setDeadline(job, finish) {
    return setTimeout(() => {
      if (job.status !== 'running') return;
      if (job.mode === 'chat') this.trace('job.timeout', { jobId: job.id, sessionId: job.sessionId });
      job.status = 'timeout';
      job.message = `Limite de ${limitLabel(job.timeoutMs)} atteinte.`;
      job.result = this.partial(job.tools, job.mode);
      job.finishedAt = this.now();
      job.controller.abort(new Error('Délai maximal atteint.'));
      this.emit(publicationContext(job));
      finish();
    }, job.timeoutMs);
  }
  async run(job) {
    let timer,progress,onAbort,work;
    if(job.mode==="chat")this.trace("job.started",{jobId:job.id,sessionId:job.sessionId});
    const cancelled=new Promise(resolve=>{onAbort=resolve;job.controller.signal.addEventListener('abort',onAbort,{once:true});});
    const timeout = new Promise(resolve => { timer = this.setDeadline(job, resolve); });
    progress = setTimeout(() => {
      if (job.status !== 'running') return;
      job.message = `La recherche continue · arrêt au plus tard à ${limitLabel(job.timeoutMs)}.`;
      this.emit(publicationContext(job));
    }, this.progressMs);
    try {
      // `work` is the agent's own use of the tools, apart from the race: a ceiling or a cancellation ends the
      // question for the viewer while the agent may still be running.
      await Promise.race([timeout,cancelled,work=(async()=>{
        try {
          const conversation=job.intent?[]:this.jobs.filter(j=>j!==job&&j.sessionId===job.sessionId&&j.result).slice(-6).map(j=>({question:j.question,answer:j.result.answer,sources:j.result.sources||[]}));
          const context=job.mode==='chat'?job.tools.context?.({intent:job.intent}):undefined;
          job.contextReadyAt=this.now();
          // Evidence state at the effective start, after any wait in the queue: counts and times only.
          if(context)job.evidenceAtStart={contextThroughMs:context.contextThroughMs,analyzedThroughMs:context.analyzedThroughMs,pendingCount:context.pendingCount,partialCount:context.partialCount,unanalyzedTailMs:context.unanalyzedTailMs};
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
          // The viewer's standing instruction (active surveillance) reaches the chat turn as a trusted field, apart from
          // the untrusted data. A host that cannot say it, or a failing provider, changes nothing.
          let instruction;
          if(job.mode==='chat'){
            try{
              const value=this.getInstruction(job);
              if(typeof value==='string'&&value.trim())instruction=value.trim().slice(0,1500);
            }catch{
              // L'agent reçoit question et contexte sans champ instruction, comme en l'absence de consigne de l'hôte.
            }
          }
          const result=await this.agent.answer({jobId:job.id,context,question:job.question,tools:job.tools,signal:job.controller.signal,mode:job.mode,conversation,...(instruction&&{instruction}),onProgress:value=>{if(job.firstAgentAt===undefined)job.firstAgentAt=this.now();this.progress(job,value);}});
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
          job.result=(!missingSources&&citations.length&&result.kind!=='external')||external||conversational ? {...result,answer:plainAnswer(result.answer),citations,observations:[...observations],hypotheses:job.tools.hypotheses,limits:[...(result.limits||[]),...job.tools.limits]} : {...this.partial(job.tools,job.mode),answer:result.kind==='external'||missingSources ? 'Je n’ai pas pu confirmer les sources de cette réponse. Je ne peux pas encore fournir un lien fiable.' : 'Je n’ai pas pu relier cette réponse aux passages consultés.',kind:'insufficient',citations:[],observations:[],hypotheses:[],sources:[],limits:['La réponse proposée n’a pas passé la validation des preuves.']};
          job.sourcesReused=result.sourcesReused||0;
          if(job.firstUsefulAt===undefined&&job.result.kind!=='insufficient')job.firstUsefulAt=this.now();
          job.status='done';
        } catch(error) {
          if(job.status!=='running')return;
          if(job.mode==="chat")this.trace("job.error",{jobId:job.id,sessionId:job.sessionId,error:this.describeError(error)});
          // Redacted diagnostic kept on the job (sent in the snapshot): the fallback result is not an evidence verdict.
          job.status='error';job.message=error.message;job.errorDetail=this.describeError(error);job.result=this.partial(job.tools,job.mode);
        }
        job.finishedAt = this.now();
        this.emit(publicationContext(job));
      })()]);
    } finally {clearTimeout(timer);clearTimeout(progress);job.controller.signal.removeEventListener('abort',onAbort);
      const end=job.finishedAt??this.now();
      // Freshness is a diagnostic: a tool set that cannot report it must not fail the job.
      let fresh;try{fresh={...job.tools.freshness?.()};}catch{
        // Les champs de fraîcheur finale restent absents ; durées et preuves de départ sont encore publiées ci-dessous.
      }
      const lagAtStartMs=job.anchorMs-job.evidenceAtStart?.contextThroughMs;
      job.metrics={waitMs:job.startedAt-job.createdAt,contextMs:job.contextReadyAt===undefined?null:job.contextReadyAt-job.startedAt,firstProgressMs:job.firstProgressAt===undefined?null:job.firstProgressAt-job.startedAt,firstUsefulMs:job.firstUsefulAt===undefined?null:job.firstUsefulAt-job.startedAt,firstAgentMs:job.firstAgentAt===undefined?null:job.firstAgentAt-job.startedAt,firstTextMs:job.firstTextAt===undefined?null:job.firstTextAt-job.startedAt,totalMs:end-job.startedAt,endToEndMs:end-job.createdAt,sourcesReused:job.sourcesReused||0,inspectionCacheHits:job.tools.inspectionCacheHits||0,tools:[...(job.tools.toolMetrics||[])],
        evidence:{...fresh,...job.evidenceAtStart,lagAtStartMs:Number.isFinite(lagAtStartMs)?lagAtStartMs:null}};
      if(job.mode==="chat")this.trace("job.finished",{jobId:job.id,sessionId:job.sessionId,status:job.status,totalMs:job.metrics.totalMs});
      this.emit(publicationContext(job));
      // After the last read and the last publication, and only once the agent has really returned: at once for an
      // answer or an error, later after a ceiling or a cancellation, never if the agent never returns. No timer.
      work.then(()=>this.release(job),()=>this.release(job));
    }
  }
  progress(job,value){
    if(job.status!=='running')return;
    if(value.message){if(job.firstProgressAt===undefined)job.firstProgressAt=this.now();job.message=value.message;if(job.activity.at(-1)?.message!==value.message){job.activity.push({message:value.message,at:this.now()});job.activity=job.activity.slice(-12);}}
    if(typeof value.provisional==='string'&&value.provisional.trim()){job.provisional=value.provisional;if(job.firstUsefulAt===undefined)job.firstUsefulAt=this.now();}
    if(typeof value.preview==='string'&&value.preview.trim()){job.preview=value.preview.slice(0,12000);if(job.firstTextAt===undefined)job.firstTextAt=this.now();if(job.firstUsefulAt===undefined)job.firstUsefulAt=this.now();}
    this.emit(publicationContext(job));
  }
  partial(tools,mode='inspect') {
    return {answer:tools.observations.length ? tools.observations.map(o=>o.text).join('\n') : 'Je n’ai pas obtenu de preuve suffisante pour répondre.',kind:tools.observations.length?'observation':'insufficient',citations:tools.observations.map(({id,startMs,endMs})=>({id,startMs,endMs})),observations:[...tools.observations],hypotheses:[...tools.hypotheses],limits:[...tools.limits,'Résultat limité aux observations déjà obtenues.']};
  }
}
function isRecentSummary(question){
  const q=question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return /(?:ca parle de quoi|qu.est.ce qui vient de se passer|j.ai decroche|^(?:resume|recapitule)(?:[.!? ]*$| (?:ce moment|cette scene|ce qui vient)))/.test(q)&&!/(?:vrai|verifi|source|exact|combien|pourquoi|il y a|premier|debut|[0-9])/.test(q);
}
module.exports = {
  DeepAsk, isRecentSummary, QUESTION_TIMEOUT_MS, QUESTION_PROGRESS_MS, limitLabel,
  TVLENS_QUESTION_INVALID, TVLENS_QUESTION_QUEUE_FULL, TVLENS_QUESTION_ACTION_INVALID, TVLENS_QUESTION_INTERVAL_INVALID,
};
