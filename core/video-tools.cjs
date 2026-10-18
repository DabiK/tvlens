const { passageText, hasUsableObservation } = require('./shared/passage-text.cjs');
const { domainError } = require('./shared/domain-error.cjs');
const { VIDEO_TOOL_CALL_LIMIT } = require('./video-tool-contracts.cjs');
// Why a passage cannot be re-examined, in the viewer's words. Without a reason the media went through the
// rolling window: that wording is the historical one and stays as it is.
const MEDIA_GONE = {
  'not-kept': 'Média non conservé : cette session date d’avant la conservation des vidéos, seul son résumé peut être consulté.',
  missing: 'Média introuvable sur le disque : seul son résumé peut être consulté.',
};
// Why a passage has no video to replay, said to the agent only where it changes what it can do: an unreadable video
// is still re-examined, on the images kept at capture. An expired or missing one is not, and looks as it always did.
const stills = s => s.mediaReason === 'unreadable' ? { mediaReason: 'unreadable' } : {};
const unfinished = status => status === 'queued' || status === 'analyzing';
// A consultation asked of a context its question has given back: nothing is read, leased or recorded for it.
const RELEASED = 'Question terminée : ses passages ne sont plus consultables.';
// The refusal code of the memory media port, read as data: the questions do not import the memory context.
const MEDIA_UNAVAILABLE = 'TVLENS_MEMORY_MEDIA_UNAVAILABLE';
const TVLENS_QUESTION_CONSULTATION_INVALID = 'TVLENS_QUESTION_CONSULTATION_INVALID';
// What a question freezes of a memory view: its session, its clock as anchor, and the passages it observed.
const consultationOf = view => ({ sessionId: view.session.id, anchorMs: view.clock.elapsedMs, passages: view.passages });
// Fields of a consulted passage that the contract publishes as null when there is nothing to say.
const OPTIONAL_FIELDS = ['revision', 'status', 'audioStatus', 'visionStatus', 'error', 'audioError', 'visionError',
  'visionSkipReason', 'stage', 'observation', 'topicSummary', 'summary'];
// The one translation from a consulted passage to the shape the search, the inspector and the evidence below have
// always read. `available` says the video can be replayed and a reason is only given for one that cannot. A null
// field is left absent, so that evidence, saved previews and tool outputs keep the exact shape they had.
function toolPassage(passage) {
  const read = { id: passage.id, startMs: passage.startMs, endMs: passage.endMs };
  for (const key of OPTIONAL_FIELDS) if (passage[key] !== null && passage[key] !== undefined) read[key] = passage[key];
  if (passage.audioFailed) read.audioFailed = true;
  if (passage.thumbnailAvailable) read.thumbnailAvailable = true;
  read.available = passage.availability.replayable;
  if (!read.available) read.mediaReason = passage.availability.reason;
  return read;
}
// Re-examined from its video, or from the images kept at capture when the video holds none. The lease stays the
// authority on the files themselves.
const reexaminable = ({ availability }) => availability.replayable || (availability.reason === 'unreadable' && availability.images !== false);
function frozenConsultation(consultation) {
  const { sessionId, anchorMs, startMs = 0, passages } = consultation || {};
  const interval = Number.isFinite(anchorMs) && anchorMs >= 0 && Number.isFinite(startMs) && startMs >= 0 && startMs <= anchorMs;
  if (typeof sessionId !== 'string' || !interval || !Array.isArray(passages))
    throw domainError(TVLENS_QUESTION_CONSULTATION_INVALID, 'Consultation de question invalide.');
  // A copy of its own: nothing the host keeps or changes afterwards reaches the question, and the view is not retained.
  return { sessionId, anchorMs, startMs, passages: structuredClone(passages.filter(p => p.startMs >= startMs && p.endMs <= anchorMs)) };
}
// A capability scoped to one question and one immutable observed prefix: session, scope start, anchor, passage ids
// and bounds never change. An optional `reread` port only lets refresh() read newer versions of those same passages
// at consultation boundaries; `media` leases what an inspection re-examines.
class VideoTools {
  constructor({ consultation, reread, search, inspector, media, signal, onProgress = () => {}, now = Date.now }) {
    Object.assign(this, { search, inspector, media, signal, reread, onProgress, now });
    const frozen = frozenConsultation(consultation);
    this.sessionId = frozen.sessionId;
    this.anchorMs = frozen.anchorMs;
    this.startMs = frozen.startMs;
    this.passages = frozen.passages;
    this.frozenAtMs = this.evidenceAsOfMs = this.anchorMs; this.refreshes = 0; this.journal = []; this.journalDropped = 0; this.consultedAt = new Map();
    // Rank of each consultation. The session clock cannot order two reads: it stops while the session is paused.
    this.reads = 0;
    // Tool calls still running: release() lets nothing go before the last of them has ended.
    this.inFlight = 0;
    this.toolMetrics = []; this.memoryEvidence = []; this.transcriptEvidence = []; this.calls = 0; this.inspections = 0; this.busy = false;
    this.observations = []; this.hypotheses = []; this.limits = [];
  }
  // The passages in the shape the tools read, at this instant: a concurrent refresh never changes a list handed out.
  toolPassages(passages = this.passages) {
    return passages.map(toolPassage);
  }
  // The consultation this question keeps, in the form it was given: a host re-examines a moment from it.
  consultationScope() {
    return { sessionId: this.sessionId, anchorMs: this.anchorMs, startMs: this.startMs, passages: structuredClone(this.passages) };
  }
  // Synchronous and best effort: no waiting, and a missing, foreign or failing reader keeps the frozen copies.
  // A passage absent from the initial prefix is never added, even if its interval precedes the anchor.
  refresh() {
    this.reads++;
    if(!this.reread||this.signal?.aborted)return false;
    try{
      const read=this.reread(this.passages.map(p=>p.id));
      if(!read||read.session?.id!==this.sessionId)return false;
      const current=new Map(read.passages.map(p=>[p.id,p]));
      this.passages=this.passages.map(p=>{const next=current.get(p.id);return next&&next.startMs===p.startMs&&next.endMs===p.endMs?structuredClone(next):p;});
      this.refreshes++;if(Number.isFinite(read.clock?.elapsedMs))this.evidenceAsOfMs=read.clock.elapsedMs;
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
    if(this.reach)return this.reach;
    const first=this.passages[0],last=this.passages.at(-1);
    return {startMs:first?Math.max(this.startMs,first.startMs):this.startMs,throughMs:last?last.endMs:this.startMs,anchorMs:this.anchorMs,
      passages:this.passages.length,lastPassage:last?{id:last.id,startMs:last.startMs,endMs:last.endMs}:null};
  }
  // A refusal names the interval that can be asked instead, so the agent retries inside it; the viewer reads the limit once.
  outOfReach(reason) {
    const a=this.availability(),clock=ms=>{const total=Math.floor(ms/1000);return Math.floor(total/60)+':'+String(total%60).padStart(2,'0');};
    if(!this.reachNoted){this.reachNoted=true;this.limits.push(a.lastPassage?`Une demande visait un intervalle hors de la mémoire disponible au moment de la question (${clock(a.startMs)}–${clock(a.throughMs)}).`:'Aucun passage n’était encore reçu au moment de la question.');}
    return new Error(a.lastPassage?`${reason} Mémoire consultable pour cette question : de ${a.startMs} à ${a.throughMs} ms (${clock(a.startMs)}–${clock(a.throughMs)}), dernier passage reçu ${a.lastPassage.id}. Reformule dans cet intervalle ; un passage reçu après la question ne peut pas être consulté.`:`${reason} Aucun passage n’était encore reçu au moment de la question.`);
  }
  // Narrows the frozen consultation, never widens it: neither an earlier start nor a later anchor is accepted.
  scope({anchorMs=this.anchorMs,startMs=0}={}) {
    if(!Number.isFinite(anchorMs)||anchorMs<0||!Number.isFinite(startMs)||startMs<0||startMs>anchorMs)throw new Error('Intervalle de question invalide.');
    this.anchorMs=Math.min(this.anchorMs,anchorMs);this.startMs=Math.max(this.startMs,startMs);
    this.passages=this.passages.filter(p=>p.startMs>=this.startMs&&p.endMs<=this.anchorMs);
    return this;
  }
  // Called by the owner of the question once its agent has given these tools back. From then on every consultation
  // is refused, and what only a question being answered needs is let go: the copied prefix, the session's search,
  // inspector and media, the reread port and the progress callback. A tool call still running keeps all of it,
  // its lease included, until it ends. What was consulted, the journal and the counters stay.
  // `keepPassages` keeps the passages of the question's own interval, for a host that re-examines that moment later.
  release({keepPassages=false}={}) {
    if(this.released)return;
    this.released=true;this.keepPassages=keepPassages;
    if(!this.inFlight)this.letGo();
  }
  letGo() {
    // A refusal goes on naming what the question could consult, not an empty memory.
    if(!this.keepPassages){this.reach=this.availability();this.passages=[];}
    this.search=this.inspector=this.media=this.reread=undefined;this.onProgress=()=>{};
  }
  context({intent}={}) {
    this.refresh();
    const segments=this.toolPassages(),usable=segments.filter(hasUsableObservation);
    const limit=intent==='recap'?120:6;
    // A checkpoint or an excluded boundary segment can leave an unobserved interval.
    // Ignore recorder timestamp jitter, but never imply continuous coverage across a real hole.
    const coverageGaps=[];let coveredThrough=this.startMs;
    for(const segment of [...segments].sort((a,b)=>a.startMs-b.startMs)){
      if(segment.startMs-coveredThrough>250)coverageGaps.push({startMs:coveredThrough,endMs:segment.startMs});
      coveredThrough=Math.max(coveredThrough,segment.endMs);
    }
    if(this.anchorMs-coveredThrough>250)coverageGaps.push({startMs:coveredThrough,endMs:this.anchorMs});
    const analyzed=segments.filter(s=>s.status==='ready');
    return {sessionId:this.sessionId,startMs:this.startMs,anchorMs:this.anchorMs,intent,
      coverageGaps,uncoveredMs:coverageGaps.reduce((sum,gap)=>sum+gap.endMs-gap.startMs,0),
      capturedThroughMs:segments.at(-1)?.endMs||0,analyzedThroughMs:analyzed.at(-1)?.endMs||0,contextThroughMs:usable.at(-1)?.endMs||0,
      unanalyzedTailMs:Math.max(0,this.anchorMs-(analyzed.at(-1)?.endMs??this.startMs)),
      passages:this.remember(usable.slice(-limit),'context'),omittedCount:Math.max(0,usable.length-limit),
      pendingCount:segments.filter(s=>unfinished(s.status)||unfinished(s.visionStatus)).length,partialCount:segments.filter(s=>s.status==='partial').length,
      failedCount:segments.filter(s=>['error','skipped','expired'].includes(s.status)).length,
      precision:'Résumés automatiques potentiellement imprécis, pas des faits vérifiés ni des citations exactes.'};
  }
  async call(name,args={}, {signal}={}) {
    const startedAt = this.now();
    let status = 'completed';
    const detail = {};
    this.inFlight++;
    try {
      const callSignal = signal && this.signal ? AbortSignal.any([signal, this.signal]) : signal || this.signal;
      return await this.invoke(name, args, detail, callSignal);
    } catch (error) {
      status = 'failed';
      throw error;
    } finally {
      this.toolMetrics.push({ tool: name, durationMs: Math.max(0, this.now() - startedAt), status, ...detail });
      this.inFlight--;
      if (!this.inFlight && this.released) this.letGo();
    }
  }
  // Only the passages admitted for this inspection. A refusal of the port keeps the words the agent has always read.
  async leaseMedia(segments) {
    try { return await this.media.lease(segments.map(s => s.id)); }
    catch (error) {
      if (error?.code === MEDIA_UNAVAILABLE) throw domainError(MEDIA_UNAVAILABLE, 'Média expiré ou indisponible.');
      throw error;
    }
  }
  // `detail` receives counts for the tool metrics: never text.
  async invoke(name, args = {}, detail = {}, signal = this.signal) {
    signal?.throwIfAborted();
    if (++this.calls > VIDEO_TOOL_CALL_LIMIT) throw new Error('Limite de huit appels d’outils atteinte.');
    if (name === 'search_moments') {
      if (this.released) throw new Error(RELEASED);
      this.onProgress('Recherche des passages…');
      // Keep the versions handed to the search and their date: a concurrent call may refresh the passages meanwhile.
      this.refresh(); const segments=this.toolPassages(), asOfMs=this.evidenceAsOfMs, read=this.reads;
      const found=await this.search.search({ query:args.query, segments, anchorMs:this.anchorMs, signal });
      signal?.throwIfAborted();
      // Given back meanwhile: what came late is not evidence of a question whose answer is settled.
      if (this.released) throw new Error(RELEASED);
      this.remember(segments.filter(s=>(found.moments||[]).some(m=>m.id===s.id)),'search_moments',asOfMs,read);
      return { sessionId:this.sessionId, anchorMs:this.anchorMs, ...found };
    }
    const { startMs, endMs } = args;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < this.startMs || endMs <= startMs || endMs > this.anchorMs) throw this.outOfReach('Intervalle invalide ou postérieur à la question.');
    if (this.released) throw new Error(RELEASED);
    // Also re-reads availability before an inspection; the media lease stays the authority against a concurrent purge.
    this.refresh(); const asOfMs = this.evidenceAsOfMs, read = this.reads;
    const consulted = this.passages.filter(s => s.endMs > startMs && s.startMs < endMs), segments = this.toolPassages(consulted);
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
    const gone = consulted.find(passage => !reexaminable(passage));
    if (gone) throw new Error(MEDIA_GONE[gone.availability.reason] || 'Média expiré : seul son résumé peut être consulté.');
    this.inspections++; this.busy = true;
    let release;
    try {
      release = await this.leaseMedia(segments);
      signal?.throwIfAborted(); this.onProgress(`Réexamen ${Math.round(startMs/1000)}–${Math.round(endMs/1000)} s…`);
      const value = await this.inspector.inspect({ question:args.question, startMs,endMs,segments,signal,onProgress:this.onProgress,...(args.exactSpeech&&{exactSpeech:true}) });
      signal?.throwIfAborted();
      if (this.released) throw new Error(RELEASED);
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
module.exports = { VideoTools, consultationOf, TVLENS_QUESTION_CONSULTATION_INVALID };
