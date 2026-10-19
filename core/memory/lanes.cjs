const { hasUsableObservation } = require('../shared/passage-text.cjs');
const { completeTopicSummary } = require('./topic-summary.cjs');
const { heldDuration } = require('./coverage.cjs');

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
 * @property {(passage:object)=>boolean} [hasImages] Présence déclarée, indépendante du nombre d'images reçues.
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
  constructor({ maxPending, hasImages = () => true, ...ports }) {
    this.#maxPending = maxPending;
    this.#ports = { ...ports, hasImages };
  }

  state(now = this.#ports.now()) {
    return {
      pending: this.#audioQueue.length + this.#visionQueue.length,
      audioPending: this.#audioQueue.length,
      visionPending: this.#visionQueue.length,
      analyzing: this.#audioRunning || this.#visionRunning,
      heldMs: heldDuration({ acquiredMs: this.#heldMs, heldSince: this.#heldSince, now }),
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
    this.#heldMs = heldDuration({ acquiredMs: this.#heldMs, heldSince: this.#heldSince, now: this.#ports.now() });
    this.#heldSince = null;
  }

  enqueue(passage) {
    if (this.#stopped()) return;
    this.#audioQueue.push(passage);
    this.#shed();
  }

  // Le retrait explicite des références ne touche pas aux appels en vol.
  remove(passage) {
    const awaitingAudio = this.#audioQueue.includes(passage);
    this.#audioQueue = this.#audioQueue.filter(item => item !== passage);
    this.#visionQueue = this.#visionQueue.filter(item => item !== passage);
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
    const waiting = this.#audioQueue.filter(passage => passage.audioStatus !== 'skipped');
    for (const passage of waiting.slice(0, Math.max(0, waiting.length - this.#maxPending))) {
      passage.audioStatus = 'skipped';
      this.#ports.update(passage, 'audio', 'backlog');
    }
    while (this.#audioQueue.length > this.#maxPending * AUDIO_REFERENCE_MULTIPLIER) {
      const dropped = this.#audioQueue.shift();
      if (!this.#ports.hasImages(dropped)) {
        this.#toVision(dropped);
        continue;
      }
      Object.assign(dropped, { status: 'skipped', visionStatus: 'skipped' });
      this.#ports.update(dropped, 'vision', 'backlog');
    }
  }

  #skipVision(passage) {
    // Une retenue n'est la cause d'une perte que si elle seule empêche le départ.
    const reason = this.#visionHeld && !this.#visionRunning ? 'held' : 'backlog';
    passage.visionStatus = 'skipped';
    passage.status = hasUsableObservation(passage) ? 'partial' : 'skipped';
    this.#ports.update(passage, 'vision', reason);
  }

  #toVision(passage) {
    if (!this.#ports.hasImages(passage)) {
      const previousStatus = passage.status;
      passage.visionStatus = 'absent';
      passage.status = passage.audioFailed ? 'error' : passage.audioStatus;
      if (passage.status === 'ready') this.#ports.clearErrorThrough(passage);
      if (passage.status !== previousStatus) this.#ports.update(passage);
      return;
    }
    passage.status = hasUsableObservation(passage) ? 'partial' : 'analyzing';
    if (!this.#ports.hasMedia(passage)) {
      passage.visionStatus = 'expired';
      passage.status = hasUsableObservation(passage) ? 'partial' : 'expired';
      this.#ports.update(passage, 'vision', 'expired');
      return;
    }
    // Un passage sans paroles ne chasse jamais un passage parlé d'une file pleine.
    if (passage.audioStatus === 'skipped' && this.#visionQueue.length >= this.#maxPending) {
      this.#skipVision(passage);
      return;
    }
    passage.visionStatus = 'queued';
    passage.visionQueuedMs = this.#ports.now();
    this.#visionQueue.push(passage);
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
    const passage = this.#audioQueue.shift();
    passage.status = 'analyzing';
    passage.audioStatus = 'analyzing';
    passage.audioStartedMs = this.#ports.now();
    this.#ports.publish();
    try {
      const evidence = await this.#ports.readMedia(passage.id);
      if (this.#stopped()) return;
      const result = await this.#ports.transcribe({ ...passage, ...evidence, signal: this.#controller.signal });
      if (this.#closed) return;
      this.#acceptAudio(passage, result);
    } catch (error) {
      if (this.#closed) return;
      passage.audioStatus = 'error';
      passage.audioError = error.message;
      this.#ports.setError(error.message);
      this.#ports.update(passage, 'audio', 'error');
    } finally {
      this.#audioRunning = false;
      if (!this.#closed) {
        this.#toVision(passage);
        // Les paroles et leur place devant les références écartées précèdent disque et drainage audio suivant.
        this.#ports.publish();
        this.#drainVision();
        this.drain();
        await this.#ports.persist();
      }
    }
  }

  #acceptAudio(passage, result) {
    passage.analysisMs = result.elapsedMs;
    passage.audioMs = result.elapsedMs;
    passage.metrics = result.metrics;
    this.#ports.addUsage({ cost: result.cost || 0 });
    // Un échec signalé par le transcripteur n'est pas un silence ; les statuts historiques restent prêts.
    if (result.failed === true) {
      passage.audioFailed = true;
      passage.audioFailureCode = result.code;
      this.#ports.update(passage, 'audio', 'error');
    }
    passage.observation = result.observation;
    this.#ports.update(passage);
    passage.audioStatus = 'ready';
    passage.transcriptPublishedMs = this.#ports.now();
  }

  #retriesVision(passage, error) {
    return error?.code === VISION_TRANSIENT && !this.#stopped() && !this.#ports.isReadOnly()
      && this.#ports.hasMedia(passage) && !this.#visionQueue.length && !this.#visionHeld;
  }

  #describe(passage, evidence, context) {
    this.#ports.addUsage({ calls: 1 });
    return this.#ports.observeVisual({ ...passage, ...evidence,
      context, signal: this.#controller.signal, lightweight: this.#visionQueue.length > 0,
      onProgress: message => {
        if (this.#closed) return;
        passage.stage = message;
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
    const passage = this.#visionQueue.shift();
    passage.visionStatus = 'analyzing';
    passage.visionStartedMs = this.#ports.now();
    this.#ports.publish();
    try {
      let evidence = await this.#ports.readMedia(passage.id);
      if (this.#stopped()) return;
      let context, result, retried = false;
      const describe = () => {
        context = this.#ports.contextFor(passage);
        return this.#describe(passage, evidence, context);
      };
      try {
        result = await describe();
      } catch (error) {
        if (!this.#retriesVision(passage, error)) throw error;
        // La relecture refusée garde la première cause, sans perte ni publication entre les deux appels.
        try {
          evidence = await this.#ports.readMedia(passage.id);
        } catch {
          throw error;
        }
        if (!this.#retriesVision(passage, error)) throw error;
        this.#ports.count('visionRetried');
        retried = true;
        result = await describe();
      }
      if (this.#closed) return;
      this.#acceptVision(passage, { result, context, retried });
    } catch (error) {
      if (this.#closed) return;
      passage.visionStatus = 'error';
      passage.visionError = error.message;
      passage.status = hasUsableObservation(passage) ? 'partial' : 'error';
      this.#ports.setError(error.message);
      this.#ports.update(passage, 'vision', 'error');
    } finally {
      this.#visionRunning = false;
      passage.stage = null;
      if (!this.#closed) {
        this.#ports.publish();
        this.drain();
        await this.#ports.persist();
      }
    }
  }

  #acceptVision(passage, { result, context, retried }) {
    passage.observation = { ...passage.observation, ...result.observation };
    passage.topicSummary = completeTopicSummary(passage, result, context);
    passage.visionStatus = 'ready';
    passage.visionMs = result.elapsedMs;
    passage.visionPublishedMs = this.#ports.now();
    this.#ports.update(passage);
    passage.status = passage.audioStatus === 'ready' ? 'ready' : 'partial';
    passage.analysisMs = (passage.analysisMs || 0) + (result.elapsedMs || 0);
    passage.metrics = { ...passage.metrics, ...result.metrics };
    this.#ports.addUsage({ cost: result.cost || 0 });
    if (retried) this.#ports.count('visionRecovered');
    this.#ports.clearErrorThrough(passage);
  }
}

module.exports = { PerceptionLanes };
