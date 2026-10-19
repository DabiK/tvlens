/**
 * Contracts of the portable TVLens application core.
 * Adapters implement these by structural typing; the core never selects them.
 * All times are milliseconds in observation order, relative to session start.
 *
 * @typedef {{atMs:number, dataUrl:string}} Frame
 * @typedef {{video:boolean,audio:boolean}} CapturedMedia
 * video:false déclare un passage son seul : audio non vide obligatoire, aucune vision ni miniature.
 * Sans déclaration, frames:[] garde le traitement visuel historique.
 * @typedef {object} CapturedSegment
 * @property {number} startMs
 * @property {number} endMs
 * @property {Uint8Array} clip
 * @property {Frame[]} frames
 * @property {Uint8Array|null} audio
 * @property {CapturedMedia} [media]
 * @typedef {{summary:string,visual:string,audio:string,transcript:string,uncertainty?:string}} Observation
 * @typedef {object} PerceptionResult
 * @property {Partial<Observation>} observation
 * @property {number} [cost]
 * @property {object} [metrics]
 * @property {number} [elapsedMs]
 * @property {boolean} [failed]
 * @property {string} [error]
 * @property {string} [code] Cause stable facultative d'un échec de transcription.
 * @typedef {{transcribe:(segment:object)=>Promise<PerceptionResult>,observeVisual:(segment:object)=>Promise<PerceptionResult>}} PerceptionPort
 * @typedef {{put:(id:string,input:CapturedSegment)=>Promise<{bytes:number}>,read:(id:string)=>Promise<{frames:Frame[],audio:Uint8Array|null}>,remove:(id:string)=>Promise<void>}} MediaPort
 * put() resolves to the volume it stored; a refusal for lack of room rejects with code 'TVLENS_STORAGE_FULL'
 * before anything is written, and the session stops capture on that code without deleting anything.
 * @typedef {{save:(snapshot:object)=>Promise<void>}} ArchivePort
 * @typedef {()=>number} ObservationClock
 * @typedef {{claim:string,context:string}} VerificationRequest
 * @typedef {{url:string,title:string,publisher:string,publishedAt:string|null,evidence:string,relation:'supports'|'contradicts'|'context'}} ExternalEvidence
 * @typedef {{normalizedClaim:string,assessment:'supported'|'contradicted'|'mixed'|'insufficient',conclusion:string,sources:ExternalEvidence[],limitations:string[],research:object}} VerificationResult
 * @typedef {{verify:(request:VerificationRequest)=>Promise<VerificationResult>}} VerificationPort
 */
module.exports = {};
/**
 * @typedef {{embed:(text:string,signal?:AbortSignal)=>Promise<number[]>,embedMany?:(texts:string[],signal?:AbortSignal)=>Promise<number[][]>}} EmbeddingPort
 * embedMany is optional: one bounded request for several texts, vectors in input order.
 * @typedef {{search:(request:{query:string,segments:object[],anchorMs:number,signal?:AbortSignal})=>Promise<object>}} MemorySearchPort
 * @typedef {{inspect:(request:{question:string,startMs:number,endMs:number,segments:object[],signal?:AbortSignal})=>Promise<{observations:object[],hypotheses:string[],limits:string[]}>}} ClipInspectionPort
 * @typedef {{answer:(request:{question:string,tools:object,signal:AbortSignal})=>Promise<object>}} VideoAgentPort
 * @typedef {{lease:(ids:string[])=>Promise<()=>Promise<void>>}} MediaLeasePort
 * A lease is only granted on a passage whose clip and stored frames/audio both exist.
 */

/**
 * @typedef {{transcribe:(audio:Uint8Array|null,signal?:AbortSignal)=>Promise<{text:string,limits:string[],code?:string}>}} TranscriptionPort
 * @typedef {{answer:(request:{question:string,tools:object,signal:AbortSignal,context?:object,conversation?:object[],mode:string,onProgress?:(event:{message?:string,preview?:string})=>void})=>Promise<object>,close?:()=>Promise<void>}} SessionAgentPort
 * Session agent implementations may retain a provider thread; the domain owns
 * session identity, time limits, validated evidence and cancellation.
 */

/**
 * @typedef {{save:(value:object,media:MediaPort)=>Promise<object>,list:()=>Promise<object[]>,remove:(id:string)=>Promise<void>}} SavedMomentArchivePort
 * @typedef {{check:(rpc:object)=>Promise<object>,snapshot:()=>object}} QuotaGuardPort
 * DeepAsk owns the FIFO, enqueue-time anchor, separate queue/processing timings,
 * manual per-question cancellation and the five-minute processing deadline
 * (QUESTION_TIMEOUT_MS = 300000, published on every job as timeoutMs; a host may
 * only lower it). Time spent waiting in the FIFO is never charged to that deadline.
 * SavedMoments owns explicit conservation; archive adapters own durable copies.
 * Surveillance owns activation (t0), the per-passage cursor, the claim registry, its bounded
 * non-losing queue, deadlines and grouped results. It runs alongside questions and never reads or
 * writes a "question pending" flag: nothing manual suspends or cancels it.
 * CachedInspector wraps any ClipInspectionPort without provider knowledge.
 */

/**
 * @typedef {{ensure:(segments:object[],signal?:AbortSignal)=>Promise<void>,queryVector:(query:string,signal?:AbortSignal)=>Promise<number[]>,passageVector:(segment:object)=>Promise<number[]|null>,observe?:(passages:object[])=>void,request?:(passages:object[])=>void,settle?:(budgetMs:number,signal?:AbortSignal)=>Promise<boolean>,status?:()=>object,close?:()=>Promise<void>}} MomentIndexPort
 * Index creation/reuse is separate from ranking. When an embedding provider is
 * configured, the session runtime feeds published passages to observe(): one batch
 * in flight, bounded queue, coalescence by passage id, stale results never written.
 * A search calls request() for its admissible prefix and waits settle() for a short
 * budget only; what is not indexed yet is ranked lexically and counted. The index may
 * know passages newer than a question: search still ranks its own prefix only.
 */

/**
 * PerceptionPort exposes transcribe(segment) and observeVisual(segment).
 * Both return {observation,cost?,metrics?,elapsedMs?}; visual receives the current
 * observation (including transcript) and returns an observation patch. The core
 * serializes each lane, bounds each backlog, and passes a close cancellation signal.
 * Partial observations retain the same ID/time range; audioStatus/visionStatus describe missing evidence.
 * Un passage déclaré son seul porte visionStatus:absent et devient ready après sa transcription.
 * L'absence d'images est une perte de capture imagesAbsent, sans PassageLost de vision.
 * Un résultat transcribe() portant failed:true incrémente coverage.audioError et marque audioFailed sur le passage.
 * Son code facultatif devient audioFailureCode sur le passage et code dans audioGaps ; il identifie la cause de la perte.
 * Les statuts restent inchangés pour que les passages sans paroles transcrites puissent terminer leur analyse visuelle.
 * Every published change of an observation increments the passage revision; reception,
 * lane starts and publications are stamped on the session clock (core/latency-trace.cjs).
 * The visionDuringAsk option lets a new visual call start while a question is pending.
 *
 * VideoTools keeps session, scope start, anchor and passage ids fixed for one question, from the consultation
 * frozen out of a memory view. With a bounded reread port it re-reads those passages at consultation boundaries
 * (answer start, search, transcript, inspection); the journal records each revision read. Media are leased
 * through the memory media port, for the passages an inspection admits only.
 */

/**
 * Surveillance ports (free-instruction surveillance, core/surveillance.cjs).
 * @typedef {{id:string,startMs:number,endMs:number,transcript:string,summary:string,visual:string,uncertainty:string}} SurveillancePassage
 * Only the fields that belong to the passage itself: the cumulative topic summary never travels.
 * @typedef {{passageId:string,quote:string,statement:string,action:'verify'|'signal',kind:'figure'|'date'|'quote'|'fact'|'other',checkable:boolean,reason:string,sameAs:string|null}} DetectedClaim
 * action=verify + checkable: web verification queue; verify + not checkable: undetermined; action=signal
 * (the instruction asks to be told, not to check): noted, grouped in a lot of kind "signal" without sources.
 * @typedef {{detect:(request:{sessionId:string,instruction:string,passages:SurveillancePassage[],context:SurveillancePassage[],known:{id:string,statement:string}[],signal:AbortSignal})=>Promise<{claims:DetectedClaim[]}>}} ClaimDetectionPort
 * @typedef {{claimId:string,assessment:'supported'|'contradicted'|'mixed'|'insufficient',conclusion:string,sources:ExternalEvidence[],limitations:string[]}} ClaimVerdict
 * @typedef {{verify:(request:{sessionId:string,instruction:string,claims:{id:string,statement:string,quote:string,kind:string,startMs:number,endMs:number,context:string}[],signal:AbortSignal,onProgress?:Function})=>Promise<{summary:string,verdicts:ClaimVerdict[],research:{webSearches:number,openedUrls:string[],elapsedMs:number}}>}} ClaimResearchPort
 * Detection gets neither web nor tools; research gets web search only. Neither is ever the chat agent
 * or the manual verification adapter: a shared client would let a question cancel the surveillance.
 *
 * Durable sessions.
 * @typedef {()=>({state:'ok'|'low'|'blocked'|'unknown',freeBytes:number|null,minFreeBytes:number|null,sessionBytes:number,bytesPerMinute:number|null,remainingMinutes:number|null}|null)} StoragePort
 * Synchronous and cached: read at every state emission, it never measures anything itself.
 * @typedef {{id:string,title:string,firstTopic:string|null,host:string|null,createdAt:number|null,updatedAt:number|null,closedAt:number|null,state:'live'|'archived'|'interrupted'|'unreadable',elapsedMs:number,passages:number,media:{stored:number,missing:number,bytes:number},legacy:boolean,error?:string}} SessionSummary
 * @typedef {{list:(options?:{current?:string|null})=>Promise<SessionSummary[]>,read:(id:string,options?:{current?:string|null})=>Promise<{summary:SessionSummary,manifest:object|null,snapshot:object,chat:object|null,recap:object|null,auto:object|null,surveillance:object|null,inventory:object}>,remove:(id:string)=>Promise<{id:string,freedBytes:number}>,usage:(sessions?:SessionSummary[])=>Promise<{sessions:number,bytes:number,freeBytes:number|null,minFreeBytes:number|null,warnFreeBytes:number|null,state:string}>}} SessionLibraryPort
 * Listing and reading never write. The only deletion is one whole session, named by a strict identifier;
 * a session in memory is stopped and sealed by its host first. Nothing is ever evicted to make room.
 * A reopened session is stopped and read-only until an explicit resume: WatchSession.restore,
 * DeepAsk.restore, LivingRecap.restore and Surveillance.restore are silent (no emission, no write, no provider).
 */
