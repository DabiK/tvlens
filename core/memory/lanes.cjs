const { hasUsableObservation } = require('../passage-text.cjs');
const { completeTopicSummary } = require('../topic-summary.cjs');

// Seul le port de perception peut déclarer cet échec passager.
const VISION_TRANSIENT = 'TVLENS_VISION_TRANSIENT';
const AUDIO_REFERENCE_MULTIPLIER = 3;

/**
 * @typedef {'audio'|'vision'} PerceptionLane
 * @typedef {'backlog'|'held'|'expired'|'error'} LaneLoss
 * @typedef {object} LanePorts
 * @property {()=>number} now
 * @property {(id:string)=>Promise<object>} readMedia
 * @property {(input:object)=>Promise<object>} transcribe
 * @property {(input:object)=>Promise<object>} observeVisual
 * @property {(passage:object)=>boolean} hasMedia
 * @property {()=>boolean} isEnding
 * @property {()=>boolean} isReadOnly
 * @property {(passage:object)=>object} contextFor
 * @property {(passage:object, lane?:PerceptionLane, cause?:LaneLoss)=>void} update Version acquise, sans publication immédiate.
 * @property {(usage:{calls?:number,cost?:number})=>void} addUsage
 * @property {(name:'visionRetried'|'visionRecovered')=>void} count
 * @property {(message:string)=>void} setError
 * @property {(passage:object)=>void} clearErrorThrough
 * @property {()=>void} publish Clôt la transition rétablie ; ses abonnés sont isolés par la racine.
 * @property {()=>Promise<void>} persist Sauvegarde explicite, indépendante des abonnés.
 */
class PerceptionLanes {
  #ports;
  #maxPending;
  #audioQueue = [];
  #visionQueue = [];
  #audioRunning = false;
  #visionRunning = false;
  #closed = false;
  #controller = new AbortController();
  #visionHeld = false;
  #heldSince = null;
  #heldMs = 0;

  /** @param {LanePorts & {maxPending:number}} options */
  constructor({ maxPending, ...ports }) {
    this.#maxPending = maxPending;
    this.#ports = ports;
  }

  state(now = this.#ports.now()) {
    return {
      pending: this.#audioQueue.length + this.#visionQueue.length,
      audioPending: this.#audioQueue.length,
      visionPending: this.#visionQueue.length,
      analyzing: this.#audioRunning || this.#visionRunning,
      heldMs: this.#heldMs + (this.#heldSince === null ? 0 : Math.max(0, now - this.#heldSince)),
    };
  }

  setVisionHeld(held) {
    this.#visionHeld = held;
    if (!held) this.#endHold();
  }

  restoreHeldMs(duration) {
    this.#heldMs = duration;
  }

  #endHold() {
    if (this.#heldSince === null) return;
    this.#heldMs += Math.max(0, this.#ports.now() - this.#heldSince);
    this.#heldSince = null;
  }

  enqueue(segment) {
    if (this.#stopped()) return;
    this.#audioQueue.push(segment);
    this.#shed();
  }

  // L'expiration reste décidée par la racine ; le retrait ne touche pas aux appels en vol.
  remove(segment) {
    const awaitingAudio = this.#audioQueue.includes(segment);
    this.#audioQueue = this.#audioQueue.filter(item => item !== segment);
    this.#visionQueue = this.#visionQueue.filter(item => item !== segment);
    if (!this.#visionQueue.length) this.#endHold();
    return awaitingAudio;
  }

  close() {
    this.#closed = true;
    this.#endHold();
    this.#controller.abort(new Error('Session fermée.'));
    this.#audioQueue = [];
    this.#visionQueue = [];
  }

  #stopped() {
    return this.#closed || this.#ports.isEnding();
  }

  // Un audio écarté conserve sa référence et sa place pour transmettre encore ses images.
  #shed() {
    const waiting = this.#audioQueue.filter(segment => segment.audioStatus !== 'skipped');
    for (const segment of waiting.slice(0, Math.max(0, waiting.length - this.#maxPending))) {
      segment.audioStatus = 'skipped';
      this.#ports.update(segment, 'audio', 'backlog');
    }
    while (this.#audioQueue.length > this.#maxPending * AUDIO_REFERENCE_MULTIPLIER) {
      const dropped = this.#audioQueue.shift();
      Object.assign(dropped, { status: 'skipped', visionStatus: 'skipped' });
      this.#ports.update(dropped, 'vision', 'backlog');
    }
  }

  #skipVision(segment) {
    // Une retenue n'est la cause d'une perte que si elle seule empêche le départ.
    const reason = this.#visionHeld && !this.#visionRunning ? 'held' : 'backlog';
    segment.visionStatus = 'skipped';
    segment.status = hasUsableObservation(segment) ? 'partial' : 'skipped';
    this.#ports.update(segment, 'vision', reason);
  }

  #toVision(segment) {
    segment.status = hasUsableObservation(segment) ? 'partial' : 'analyzing';
    if (!this.#ports.hasMedia(segment)) {
      segment.visionStatus = 'expired';
      segment.status = hasUsableObservation(segment) ? 'partial' : 'expired';
      this.#ports.update(segment, 'vision', 'expired');
      return;
    }
    // Un passage sans paroles ne chasse jamais un passage parlé d'une file pleine.
    if (segment.audioStatus === 'skipped' && this.#visionQueue.length >= this.#maxPending) {
      this.#skipVision(segment);
      return;
    }
    segment.visionStatus = 'queued';
    segment.visionQueuedMs = this.#ports.now();
    this.#visionQueue.push(segment);
    while (this.#visionQueue.length > this.#maxPending) this.#skipVision(this.#visionQueue.shift());
  }

  drain() {
    if (this.#stopped()) return;
    this.#drainAudio();
    this.#drainVision();
  }

  async #drainAudio() {
    if (this.#stopped() || this.#audioRunning) return;
    if (this.#audioQueue[0]?.audioStatus === 'skipped') {
      // La vision libre prend chaque référence avant le transfert de la suivante.
      while (this.#audioQueue[0]?.audioStatus === 'skipped') {
        this.#toVision(this.#audioQueue.shift());
        this.#drainVision();
      }
      this.#ports.publish();
    }
    if (!this.#audioQueue.length) return;
    this.#audioRunning = true;
    const segment = this.#audioQueue.shift();
    segment.status = 'analyzing';
    segment.audioStatus = 'analyzing';
    segment.audioStartedMs = this.#ports.now();
    this.#ports.publish();
    try {
      const evidence = await this.#ports.readMedia(segment.id);
      if (this.#stopped()) return;
      const result = await this.#ports.transcribe({ ...segment, ...evidence, signal: this.#controller.signal });
      if (this.#closed) return;
      this.#acceptAudio(segment, result);
    } catch (error) {
      if (this.#closed) return;
      segment.audioStatus = 'error';
      segment.audioError = error.message;
      this.#ports.setError(error.message);
      this.#ports.update(segment, 'audio', 'error');
    } finally {
      this.#audioRunning = false;
      if (!this.#closed) {
        this.#toVision(segment);
        // Les paroles et leur place devant les références écartées précèdent disque et drainage audio suivant.
        this.#ports.publish();
        this.#drainVision();
        this.drain();
        await this.#ports.persist();
      }
    }
  }

  #acceptAudio(segment, result) {
    segment.analysisMs = result.elapsedMs;
    segment.audioMs = result.elapsedMs;
    segment.metrics = result.metrics;
    this.#ports.addUsage({ cost: result.cost || 0 });
    // Un échec signalé par le transcripteur n'est pas un silence ; les statuts historiques restent prêts.
    if (result.failed === true) {
      segment.audioFailed = true;
      segment.audioFailureCode = result.code;
      this.#ports.update(segment, 'audio', 'error');
    }
    segment.observation = result.observation;
    this.#ports.update(segment);
    segment.audioStatus = 'ready';
    segment.transcriptPublishedMs = this.#ports.now();
  }

  #retriesVision(segment, error) {
    return error?.code === VISION_TRANSIENT && !this.#stopped() && !this.#ports.isReadOnly()
      && this.#ports.hasMedia(segment) && !this.#visionQueue.length && !this.#visionHeld;
  }

  #describe(segment, evidence, context) {
    this.#ports.addUsage({ calls: 1 });
    return this.#ports.observeVisual({ ...segment, ...evidence,
      context, signal: this.#controller.signal, lightweight: this.#visionQueue.length > 0,
      onProgress: message => {
        if (this.#closed) return;
        segment.stage = message;
        this.#ports.publish();
      },
    });
  }

  #canDrainVision() {
    return !this.#stopped() && !this.#visionRunning && this.#visionQueue.length > 0;
  }

  async #drainVision() {
    if (!this.#canDrainVision()) return;
    if (this.#visionHeld) {
      this.#heldSince ??= this.#ports.now();
      return;
    }
    this.#endHold();
    this.#visionRunning = true;
    const segment = this.#visionQueue.shift();
    segment.visionStatus = 'analyzing';
    segment.visionStartedMs = this.#ports.now();
    this.#ports.publish();
    try {
      let evidence = await this.#ports.readMedia(segment.id);
      if (this.#stopped()) return;
      let context, result, retried = false;
      const describe = () => {
        context = this.#ports.contextFor(segment);
        return this.#describe(segment, evidence, context);
      };
      try {
        result = await describe();
      } catch (error) {
        if (!this.#retriesVision(segment, error)) throw error;
        // La relecture refusée garde la première cause, sans perte ni publication entre les deux appels.
        try {
          evidence = await this.#ports.readMedia(segment.id);
        } catch {
          throw error;
        }
        if (!this.#retriesVision(segment, error)) throw error;
        this.#ports.count('visionRetried');
        retried = true;
        result = await describe();
      }
      if (this.#closed) return;
      this.#acceptVision(segment, { result, context, retried });
    } catch (error) {
      if (this.#closed) return;
      segment.visionStatus = 'error';
      segment.visionError = error.message;
      segment.status = hasUsableObservation(segment) ? 'partial' : 'error';
      this.#ports.setError(error.message);
      this.#ports.update(segment, 'vision', 'error');
    } finally {
      this.#visionRunning = false;
      segment.stage = null;
      if (!this.#closed) {
        this.#ports.publish();
        this.drain();
        await this.#ports.persist();
      }
    }
  }

  #acceptVision(segment, { result, context, retried }) {
    segment.observation = { ...segment.observation, ...result.observation };
    segment.topicSummary = completeTopicSummary(segment, result, context);
    segment.visionStatus = 'ready';
    segment.visionMs = result.elapsedMs;
    segment.visionPublishedMs = this.#ports.now();
    this.#ports.update(segment);
    segment.status = segment.audioStatus === 'ready' ? 'ready' : 'partial';
    segment.analysisMs = (segment.analysisMs || 0) + (result.elapsedMs || 0);
    segment.metrics = { ...segment.metrics, ...result.metrics };
    this.#ports.addUsage({ cost: result.cost || 0 });
    if (retried) this.#ports.count('visionRecovered');
    this.#ports.clearErrorThrough(segment);
  }
}

module.exports = { PerceptionLanes };
