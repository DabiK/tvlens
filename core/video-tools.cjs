const { passageText, hasUsableObservation } = require('./passage-text.cjs');
// Why a passage cannot be re-examined, in the viewer's words. Without a reason the media went through the
// rolling window: that wording is the historical one and stays as it is.
const MEDIA_GONE = {
  'not-kept': 'Média non conservé : cette session date d’avant la conservation des vidéos, seul son résumé peut être consulté.',
  missing: 'Média introuvable sur le disque : seul son résumé peut être consulté.',
};
// Why a passage has no video to replay, said to the agent only where it changes what it can do: an unreadable video
// is still re-examined, on the images kept at capture. An expired or missing one is not, and looks as it always did.
const stills = s => s.mediaReason === 'unreadable' ? { mediaReason: 'unreadable' } : {};
// A capability scoped to one question and one immutable observed prefix: session, scope start,
// anchor, passage ids and bounds never change. An optional `live` snapshot provider only lets
// refresh() re-read newer versions of those same passages at consultation boundaries.
class VideoTools {
  constructor({ snapshot, search, inspector, media, signal, live, onProgress = () => {}, now = Date.now }) {
    Object.assign(this, { search, inspector, media, signal, live, onProgress, now });
    this.sessionId = snapshot.id;
    this.anchorMs = snapshot.elapsedMs ?? snapshot.segments.at(-1)?.endMs ?? snapshot.history.at(-1)?.endMs ?? 0;
    this.frozenAtMs = this.evidenceAsOfMs = this.anchorMs; this.refreshes = 0; this.journal = []; this.journalDropped = 0; this.consultedAt = new Map();
    // Rank of each consultation. The session clock cannot order two reads: it stops while the session is paused.
    this.reads = 0;
    this.segments = JSON.parse(JSON.stringify([...snapshot.history.map(s => ({...s,available:false})), ...snapshot.segments])).filter(s => s.endMs <= this.anchorMs);
    this.toolMetrics = []; this.startMs = 0; this.memoryEvidence = []; this.transcriptEvidence = []; this.calls = 0; this.inspections = 0; this.busy = false; this.observations = []; this.hypotheses = []; this.limits = [];
  }
  // Synchronous and best effort: no waiting, and a missing, foreign or failing provider keeps the frozen copies.
  // A passage absent from the initial prefix is never added, even if its interval precedes the anchor.
  refresh() {
    this.reads++;
    if(!this.live||this.signal?.aborted)return false;
    try{
      const live=this.live();
      if(!live||live.id!==this.sessionId)return false;
      const current=new Map([...(live.segments||[]),...(live.history||[]).map(s=>({...s,available:false}))].map(s=>[s.id,s]));
      this.segments=this.segments.map(s=>{const next=current.get(s.id);return next&&next.startMs===s.startMs&&next.endMs===s.endMs?JSON.parse(JSON.stringify(next)):s;});
      this.refreshes++;if(Number.isFinite(live.elapsedMs))this.evidenceAsOfMs=live.elapsedMs;
      return true;
    }catch{return false;}
  }
  // Counts and times only: safe to publish in job metrics.
  freshness() {
    return {anchorMs:this.anchorMs,frozenAtMs:this.frozenAtMs,evidenceAsOfMs:this.evidenceAsOfMs,refreshes:this.refreshes,journalEntries:this.journal.length,journalDropped:this.journalDropped};
  }
  // Audit of every passage version handed to the agent. Bounded: overflow is counted, not silent.
  record(source,segments,asOfMs=this.evidenceAsOfMs,read=this.reads) {
    for(const s of segments){
      if(this.journal.length>=400){this.journalDropped++;continue;}
      this.journal.push({source,id:s.id,startMs:s.startMs,endMs:s.endMs,revision:s.revision,status:s.status,audioStatus:s.audioStatus,visionStatus:s.visionStatus,asOfMs,read});
    }
  }
  remember(segments,source,asOfMs=this.evidenceAsOfMs,read=this.reads) {
    this.record(source,segments,asOfMs,read);
    const evidence=segments.filter(hasUsableObservation).map(s=>({id:s.id,startMs:s.startMs,endMs:s.endMs,text:passageText(s),precision:s.status==='partial'?'partial-observation':'automatic-summary',audioStatus:s.audioStatus,visionStatus:s.visionStatus,audioError:s.audioError,visionError:s.visionError,...(s.audioFailed?{audioFailed:true}:{}),available:Boolean(s.available),...stills(s),...(s.revision===undefined?{}:{revision:s.revision})}));
    // The recorded evidence is the latest consultation: a read made earlier and returned late by a concurrent
    // call never replaces it, even at an unchanged revision or an unchanged clock. The journal keeps every version.
    for(const item of evidence){
      const at=this.memoryEvidence.findIndex(e=>e.id===item.id),known=this.consultedAt.get(item.id);
      if(at>=0&&(read<known||item.revision<this.memoryEvidence[at].revision))continue;
      if(at<0)this.memoryEvidence.push(item);else this.memoryEvidence[at]=item;this.consultedAt.set(item.id,read);
    }
    return evidence;
  }
  // What this question may consult: fixed when the question froze, never widened afterwards.
  // A passage received later, or one that ends after the anchor, is not part of it.
  availability() {
    const first=this.segments[0],last=this.segments.at(-1);
    return {startMs:first?Math.max(this.startMs,first.startMs):this.startMs,throughMs:last?last.endMs:this.startMs,anchorMs:this.anchorMs,passages:this.segments.length,lastPassage:last?{id:last.id,startMs:last.startMs,endMs:last.endMs}:null};
  }
  // A refusal names the interval that can be asked instead, so the agent retries inside it; the viewer reads the limit once.
  outOfReach(reason) {
    const a=this.availability(),clock=ms=>{const total=Math.floor(ms/1000);return Math.floor(total/60)+':'+String(total%60).padStart(2,'0');};
    if(!this.reachNoted){this.reachNoted=true;this.limits.push(a.lastPassage?`Une demande visait un intervalle hors de la mémoire disponible au moment de la question (${clock(a.startMs)}–${clock(a.throughMs)}).`:'Aucun passage n’était encore reçu au moment de la question.');}
    return new Error(a.lastPassage?`${reason} Mémoire consultable pour cette question : de ${a.startMs} à ${a.throughMs} ms (${clock(a.startMs)}–${clock(a.throughMs)}), dernier passage reçu ${a.lastPassage.id}. Reformule dans cet intervalle ; un passage reçu après la question ne peut pas être consulté.`:`${reason} Aucun passage n’était encore reçu au moment de la question.`);
  }
  scope({anchorMs=this.anchorMs,startMs=0}={}) {
    if(!Number.isFinite(anchorMs)||anchorMs<0||!Number.isFinite(startMs)||startMs<0||startMs>anchorMs)throw new Error('Intervalle de question invalide.');
    this.anchorMs=Math.min(this.anchorMs,anchorMs);this.startMs=startMs;
    this.segments=this.segments.filter(s=>s.startMs>=startMs&&s.endMs<=this.anchorMs);
    return this;
  }
  context({intent}={}) {
    this.refresh();
    const usable=this.segments.filter(hasUsableObservation);
    const limit=intent==='recap'?120:6;
    // A checkpoint or an excluded boundary segment can leave an unobserved interval.
    // Ignore recorder timestamp jitter, but never imply continuous coverage across a real hole.
    const coverageGaps=[];let coveredThrough=this.startMs;
    for(const segment of [...this.segments].sort((a,b)=>a.startMs-b.startMs)){
      if(segment.startMs-coveredThrough>250)coverageGaps.push({startMs:coveredThrough,endMs:segment.startMs});
      coveredThrough=Math.max(coveredThrough,segment.endMs);
    }
    if(this.anchorMs-coveredThrough>250)coverageGaps.push({startMs:coveredThrough,endMs:this.anchorMs});
    return {sessionId:this.sessionId,startMs:this.startMs,anchorMs:this.anchorMs,intent,
      coverageGaps,uncoveredMs:coverageGaps.reduce((sum,gap)=>sum+gap.endMs-gap.startMs,0),
      capturedThroughMs:this.segments.at(-1)?.endMs||0,analyzedThroughMs:this.segments.filter(s=>s.status==='ready').at(-1)?.endMs||0,contextThroughMs:usable.at(-1)?.endMs||0,
      unanalyzedTailMs:Math.max(0,this.anchorMs-(this.segments.filter(s=>s.status==='ready').at(-1)?.endMs??this.startMs)),
      passages:this.remember(usable.slice(-limit),'context'),omittedCount:Math.max(0,usable.length-limit),pendingCount:this.segments.filter(s=>['queued','analyzing'].includes(s.status)||['queued','analyzing'].includes(s.visionStatus)).length,partialCount:this.segments.filter(s=>s.status==='partial').length,
      failedCount:this.segments.filter(s=>['error','skipped','expired'].includes(s.status)).length,
      precision:'Résumés automatiques potentiellement imprécis, pas des faits vérifiés ni des citations exactes.'};
  }
  async call(name,args={}) {
    const startedAt=this.now();let status='completed';const detail={};
    try{return await this.invoke(name,args,detail);}catch(error){status='failed';throw error;}
    finally{this.toolMetrics.push({tool:name,durationMs:Math.max(0,this.now()-startedAt),status,...detail});}
  }
  // `detail` receives counts for the tool metrics: never text.
  async invoke(name, args = {}, detail = {}) {
    this.signal?.throwIfAborted();
    if (++this.calls > 8) throw new Error('Limite de huit appels d’outils atteinte.');
    if (name === 'search_moments') {
      this.onProgress('Recherche des passages…');
      // Keep the versions handed to the search and their date: a concurrent call may refresh this.segments meanwhile.
      this.refresh(); const segments=this.segments, asOfMs=this.evidenceAsOfMs, read=this.reads;
      const found=await this.search.search({ query:args.query, segments, anchorMs:this.anchorMs, signal:this.signal });
      this.remember(segments.filter(s=>(found.moments||[]).some(m=>m.id===s.id)),'search_moments',asOfMs,read);
      return { sessionId:this.sessionId, anchorMs:this.anchorMs, ...found };
    }
    const { startMs, endMs } = args;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < this.startMs || endMs <= startMs || endMs > this.anchorMs) throw this.outOfReach('Intervalle invalide ou postérieur à la question.');
    // Also re-reads availability before an inspection; the media lease stays the authority against a concurrent purge.
    this.refresh(); const asOfMs = this.evidenceAsOfMs, read = this.reads;
    const segments = this.segments.filter(s => s.endMs > startMs && s.startMs < endMs);
    if (!segments.length) throw this.outOfReach('Aucun passage observé dans cet intervalle.');
    if (name === 'get_transcript') {
      if (endMs-startMs > 60000) throw new Error('Transcription limitée à 60 secondes par appel.');
      this.remember(segments,'get_transcript');
      this.transcriptEvidence.push(...segments.filter(hasUsableObservation).filter(s=>s.observation?.transcript||s.summary||s.observation?.summary).map(s=>({id:s.id,startMs:s.startMs,endMs:s.endMs})));
      return { passages:segments.map(s => ({ id:s.id,startMs:s.startMs,endMs:s.endMs, transcript:s.observation?.transcript || '', summary:s.summary || s.observation?.summary || '', precision:'segment', audioStatus:s.audioStatus, visionStatus:s.visionStatus, ...(s.audioFailed?{audioFailed:true}:{}), available:Boolean(s.available), ...stills(s) })) };
    }
    if (name !== 'inspect_clip') throw new Error('Outil inconnu.');
    if (endMs-startMs > 20000 || segments.length > 4) throw new Error('Réexamen limité à 20 secondes et quatre segments.');
    if (args.exactSpeech != null && typeof args.exactSpeech !== 'boolean') throw new Error('Option exactSpeech invalide : true ou false.');
    if (this.busy || this.inspections >= 2) throw new Error('Au plus deux inspections, une à la fois.');
    if (typeof args.question !== 'string' || !args.question.trim() || args.question.length > 2000) throw new Error('Question de réexamen invalide.');
    // A passage whose video holds no image is still re-examined, on the images kept at capture: the inspector says so.
    const gone = segments.find(s => !s.available && s.mediaReason !== 'unreadable');
    if (gone) throw new Error(MEDIA_GONE[gone.mediaReason] || 'Média expiré : seul son résumé peut être consulté.');
    this.inspections++; this.busy = true;
    let release;
    try {
      release = await this.media.lease(segments.map(s => s.id));
      this.signal?.throwIfAborted(); this.onProgress(`Réexamen ${Math.round(startMs/1000)}–${Math.round(endMs/1000)} s…`);
      const value = await this.inspector.inspect({ question:args.question, startMs,endMs,segments,signal:this.signal,onProgress:this.onProgress,...(args.exactSpeech&&{exactSpeech:true}) });
      this.signal?.throwIfAborted();
      if(value.cacheHit)this.inspectionCacheHits=(this.inspectionCacheHits||0)+1;
      // Images and speech are two intervals per passage. Speech is what its transcription covered: the whole passage,
      // or the excerpt itself. It is only accepted inside its own passage, which ends at or before the anchor.
      const said = (Array.isArray(value.speech) ? value.speech : []).filter(x => x && segments.some(s => s.id === x.id) && Number.isFinite(x.startMs) && Number.isFinite(x.endMs) && x.endMs > x.startMs);
      const intervals = segments.map(s => {
        const images = { startMs:Math.max(startMs,s.startMs), endMs:Math.min(endMs,s.endMs) };
        const x = said.find(x => x.id === s.id && !x.failed && x.startMs >= s.startMs && x.endMs <= s.endMs);
        return { id:s.id, images, ...(x && { speech:{ startMs:x.startMs, endMs:x.endMs, precision:x.startMs === s.startMs && x.endMs === s.endMs ? 'segment' : 'excerpt' } }) };
      });
      // An observation stays inside the images of its passage. One resting on speech carries exactly the interval that
      // speech covers, never a narrower one, and is refused when no speech was obtained. It is then its own evidence.
      const observations = (value.observations || []).filter(o => typeof o.text === 'string' && o.text.length <= 6000 && Number.isFinite(o.startMs) && Number.isFinite(o.endMs) && o.endMs > o.startMs && intervals.some(p => p.id === o.id && (o.basis === 'speech' ? o.startMs === p.speech?.startMs && o.endMs === p.speech?.endMs : o.startMs >= p.images.startMs && o.endMs <= p.images.endMs)));
      const hypotheses = (value.hypotheses || []).filter(x => typeof x === 'string').slice(0,5);
      const limits = (value.limits || []).filter(x => typeof x === 'string').slice(0,5);
      if (!observations.length) limits.push('Aucune observation horodatée valide issue du réexamen.');
      const wider = intervals.filter(p => p.speech && (p.speech.startMs < p.images.startMs || p.speech.endMs > p.images.endMs));
      const seconds = ms => (ms/1000).toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1});
      if (wider.length) limits.push(`Paroles issues de la transcription du passage entier (${wider.map(p => `${seconds(p.speech.startMs)}–${seconds(p.speech.endMs)} s`).join(', ')}), plus large que les images réexaminées : elles n’y sont pas situées et ne valent pas citation exacte.`);
      if (said.some(x => x.failed)) limits.push('Paroles indisponibles pour ce réexamen : la transcription locale a échoué.');
      if (value.stillFrames) detail.stillFrames = value.stillFrames;
      detail.speech = { passages:said.length, reused:said.filter(x => x.reused === true).length, cached:said.filter(x => x.cacheHit === true).length, failed:said.filter(x => x.failed).length };
      this.observations.push(...observations); this.hypotheses.push(...hypotheses); this.limits.push(...limits);
      this.record('inspect_clip',segments,asOfMs,read);
      return { observations,hypotheses,limits, inspected:{ startMs,endMs }, intervals, sampledFrames:value.sampledFrames };
    } finally { this.busy = false; await release?.(); }
  }
}
module.exports = { VideoTools };
