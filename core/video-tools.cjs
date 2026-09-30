const { passageText } = require('./passage-text.cjs');
// A capability scoped to one question and one immutable observed prefix.
class VideoTools {
  constructor({ snapshot, search, inspector, media, signal, onProgress = () => {}, now = Date.now }) {
    Object.assign(this, { search, inspector, media, signal, onProgress, now });
    this.sessionId = snapshot.id;
    this.anchorMs = snapshot.elapsedMs ?? snapshot.segments.at(-1)?.endMs ?? snapshot.history.at(-1)?.endMs ?? 0;
    this.segments = JSON.parse(JSON.stringify([...snapshot.history.map(s => ({...s,available:false})), ...snapshot.segments])).filter(s => s.endMs <= this.anchorMs);
    this.toolMetrics = []; this.startMs = 0; this.memoryEvidence = []; this.transcriptEvidence = []; this.calls = 0; this.inspections = 0; this.busy = false; this.observations = []; this.hypotheses = []; this.limits = [];
  }
  remember(segments) {
    const evidence=segments.filter(s=>passageText(s).trim()&&(!s.status||s.status==='ready')).map(s=>({id:s.id,startMs:s.startMs,endMs:s.endMs,text:passageText(s),precision:'automatic-summary',available:Boolean(s.available)}));
    for(const item of evidence)if(!this.memoryEvidence.some(e=>e.id===item.id))this.memoryEvidence.push(item);
    return evidence;
  }
  scope({anchorMs=this.anchorMs,startMs=0}={}) {
    if(!Number.isFinite(anchorMs)||anchorMs<0||!Number.isFinite(startMs)||startMs<0||startMs>anchorMs)throw new Error('Intervalle de question invalide.');
    this.anchorMs=Math.min(this.anchorMs,anchorMs);this.startMs=startMs;
    this.segments=this.segments.filter(s=>s.startMs>=startMs&&s.endMs<=this.anchorMs);
    return this;
  }
  context({intent}={}) {
    const usable=this.segments.filter(s=>passageText(s).trim()&&(!s.status||s.status==='ready'));
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
      capturedThroughMs:this.segments.at(-1)?.endMs||0,analyzedThroughMs:usable.at(-1)?.endMs||0,
      unanalyzedTailMs:Math.max(0,this.anchorMs-(usable.at(-1)?.endMs??this.startMs)),
      passages:this.remember(usable.slice(-limit)),omittedCount:Math.max(0,usable.length-limit),pendingCount:this.segments.filter(s=>['queued','analyzing'].includes(s.status)).length,
      failedCount:this.segments.filter(s=>['error','skipped','expired'].includes(s.status)).length,
      precision:'Résumés automatiques potentiellement imprécis, pas des faits vérifiés ni des citations exactes.'};
  }
  async call(name,args={}) {
    const startedAt=this.now();let status='completed';
    try{return await this.invoke(name,args);}catch(error){status='failed';throw error;}
    finally{this.toolMetrics.push({tool:name,durationMs:Math.max(0,this.now()-startedAt),status});}
  }
  async invoke(name, args = {}) {
    this.signal?.throwIfAborted();
    if (++this.calls > 8) throw new Error('Limite de huit appels d’outils atteinte.');
    if (name === 'search_moments') {
      this.onProgress('Recherche des passages…');
      const found=await this.search.search({ query:args.query, segments:this.segments, anchorMs:this.anchorMs, signal:this.signal });
      this.remember(this.segments.filter(s=>(found.moments||[]).some(m=>m.id===s.id)));
      return { sessionId:this.sessionId, anchorMs:this.anchorMs, ...found };
    }
    const { startMs, endMs } = args;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < this.startMs || endMs <= startMs || endMs > this.anchorMs) throw new Error('Intervalle invalide ou postérieur à la question.');
    const segments = this.segments.filter(s => s.endMs > startMs && s.startMs < endMs);
    if (!segments.length) throw new Error('Aucun passage observé dans cet intervalle.');
    if (name === 'get_transcript') {
      if (endMs-startMs > 60000) throw new Error('Transcription limitée à 60 secondes par appel.');
      this.remember(segments);
      this.transcriptEvidence.push(...segments.filter(s=>s.observation?.transcript||s.summary||s.observation?.summary).map(s=>({id:s.id,startMs:s.startMs,endMs:s.endMs})));
      return { passages:segments.map(s => ({ id:s.id,startMs:s.startMs,endMs:s.endMs, transcript:s.observation?.transcript || '', summary:s.summary || s.observation?.summary || '', precision:'segment', available:Boolean(s.available) })) };
    }
    if (name !== 'inspect_clip') throw new Error('Outil inconnu.');
    if (endMs-startMs > 20000 || segments.length > 4) throw new Error('Réexamen limité à 20 secondes et quatre segments.');
    if (this.busy || this.inspections >= 2) throw new Error('Au plus deux inspections, une à la fois.');
    if (typeof args.question !== 'string' || !args.question.trim() || args.question.length > 2000) throw new Error('Question de réexamen invalide.');
    if (segments.some(s => !s.available)) throw new Error('Média expiré : seul son résumé peut être consulté.');
    this.inspections++; this.busy = true;
    let release;
    try {
      release = await this.media.lease(segments.map(s => s.id));
      this.signal?.throwIfAborted(); this.onProgress(`Réexamen ${Math.round(startMs/1000)}–${Math.round(endMs/1000)} s…`);
      const value = await this.inspector.inspect({ question:args.question, startMs,endMs,segments,signal:this.signal,onProgress:this.onProgress });
      this.signal?.throwIfAborted();
      if(value.cacheHit)this.inspectionCacheHits=(this.inspectionCacheHits||0)+1;
      const observations = (value.observations || []).filter(o => typeof o.text === 'string' && o.text.length <= 6000 && Number.isFinite(o.startMs) && Number.isFinite(o.endMs) && o.endMs > o.startMs && segments.some(s => s.id === o.id && o.startMs >= Math.max(startMs,s.startMs) && o.endMs <= Math.min(endMs,s.endMs)));
      const hypotheses = (value.hypotheses || []).filter(x => typeof x === 'string').slice(0,5);
      const limits = (value.limits || []).filter(x => typeof x === 'string').slice(0,5);
      if (!observations.length) limits.push('Aucune observation horodatée valide issue du réexamen.');
      this.observations.push(...observations); this.hypotheses.push(...hypotheses); this.limits.push(...limits);
      return { observations,hypotheses,limits, inspected:{ startMs,endMs }, sampledFrames:value.sampledFrames };
    } finally { this.busy = false; await release?.(); }
  }
}
module.exports = { VideoTools };
