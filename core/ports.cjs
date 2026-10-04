/**
 * Contracts of the portable TVLens application core.
 * Adapters implement these by structural typing; the core never selects them.
 * All times are milliseconds in observation order, relative to session start.
 *
 * @typedef {{atMs:number, dataUrl:string}} Frame
 * @typedef {{startMs:number,endMs:number,clip:Uint8Array,frames:Frame[],audio:Uint8Array|null}} CapturedSegment
 * @typedef {{summary:string,visual:string,audio:string,transcript:string,uncertainty?:string}} Observation
 * @typedef {{observe:(segment:object)=>Promise<{observation:Observation,cost?:number}>}} PerceptionPort
 * @typedef {{ask:(context:object)=>Promise<{answer:string,kind:'observation'|'explanation'|'insufficient',citations:string[],limits:string[],cost?:number}>}} AnswerPort
 * @typedef {{put:(id:string,input:CapturedSegment)=>Promise<void>,read:(id:string)=>Promise<{frames:Frame[],audio:Uint8Array|null}>,remove:(id:string)=>Promise<void>}} MediaPort
 * @typedef {{save:(snapshot:object)=>Promise<void>}} ArchivePort
 * @typedef {()=>number} ObservationClock
 * @typedef {{claim:string,context:string}} VerificationRequest
 * @typedef {{url:string,title:string,publisher:string,publishedAt:string|null,evidence:string,relation:'supports'|'contradicts'|'context'}} ExternalEvidence
 * @typedef {{normalizedClaim:string,assessment:'supported'|'contradicted'|'mixed'|'insufficient',conclusion:string,sources:ExternalEvidence[],limitations:string[],research:object}} VerificationResult
 * @typedef {{verify:(request:VerificationRequest)=>Promise<VerificationResult>}} VerificationPort
 */
module.exports = {};
/**
 * @typedef {{embed:(text:string,signal?:AbortSignal)=>Promise<number[]>}} EmbeddingPort
 * @typedef {{search:(request:{query:string,segments:object[],anchorMs:number,signal?:AbortSignal})=>Promise<object>}} MomentSearchPort
 * @typedef {{inspect:(request:{question:string,startMs:number,endMs:number,segments:object[],signal?:AbortSignal})=>Promise<{observations:object[],hypotheses:string[],limits:string[]}>}} ClipInspectionPort
 * @typedef {{answer:(request:{question:string,tools:object,signal:AbortSignal})=>Promise<object>}} VideoAgentPort
 * @typedef {{lease:(ids:string[])=>Promise<()=>Promise<void>>}} MediaLeasePort
 */

/**
 * @typedef {{transcribe:(audio:Uint8Array|null,signal?:AbortSignal)=>Promise<{text:string,limits:string[]}>}} TranscriptionPort
 * @typedef {{answer:(request:{question:string,tools:object,signal:AbortSignal,context?:object,conversation?:object[],mode:string,onProgress?:(event:{message?:string,preview?:string})=>void})=>Promise<object>,close?:()=>Promise<void>}} SessionAgentPort
 * Session agent implementations may retain a provider thread; the domain owns
 * session identity, time limits, validated evidence and cancellation.
 */

/**
 * @typedef {{save:(value:object,media:MediaPort)=>Promise<object>,list:()=>Promise<object[]>,remove:(id:string)=>Promise<void>}} SavedMomentArchivePort
 * @typedef {{evaluate:(request:{instruction:string,snapshot:object,signal:AbortSignal,recent:string[],onProgress:Function})=>Promise<object>}} AutoEvaluationPort
 * @typedef {{check:(rpc:object)=>Promise<object>,snapshot:()=>object}} QuotaGuardPort
 * DeepAsk owns the FIFO, enqueue-time anchor, separate queue/processing timings,
 * manual per-question cancellation and 60-second processing deadline.
 * SavedMoments owns explicit conservation; archive adapters own durable copies.
 * AutoMonitor owns prospective activation, cadence, deduplication and manual priority.
 * CachedInspector wraps any ClipInspectionPort without provider knowledge.
 */

/**
 * @typedef {{ensure:(segments:object[],signal?:AbortSignal)=>Promise<void>,queryVector:(query:string,signal?:AbortSignal)=>Promise<number[]>,passageVector:(segment:object)=>Promise<number[]|null>}} MomentIndexPort
 * Index creation/reuse is separate from ranking. Runtimes currently request it
 * lazily from MomentSearch; capture never implicitly schedules embedding calls.
 */

/**
 * PerceptionPort optionally exposes transcribe(segment) and observeVisual(segment).
 * Both return {observation,cost?,metrics?,elapsedMs?}; visual receives the current
 * observation (including transcript) and returns an observation patch. The core
 * serializes each lane, bounds each backlog, and passes a close cancellation signal.
 * Legacy observe-only adapters keep the serial behavior. Partial observations
 * retain the same ID/time range; audioStatus/visionStatus describe missing evidence.
 */
