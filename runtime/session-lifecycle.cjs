const CLOSE_ERROR_MAX_CHARS = 200;

function restoreSession({ watch, store, thumbnails }, restore) {
  const { snapshot, inventory } = restore;
  const known = new Set(
    [...(snapshot.history || []), ...snapshot.segments].map((passage) => passage.id),
  );
  store.adopt(
    inventory,
    snapshot.segments.reduce(
      (total, passage) =>
        inventory.ids.has(passage.id)
          ? total + (passage.endMs - passage.startMs)
          : total,
      0,
    ),
    restore.manifest,
  );
  thumbnails.bytes = inventory.thumbBytes || 0;
  // L'ouverture reste silencieuse et en lecture seule jusqu'à la reprise explicite.
  watch.restore(snapshot, {
    hasMedia: (passage) => inventory.ids.has(passage),
    hasThumbnail: (passage) => inventory.thumbs.has(passage),
    orphans:
      inventory.orphans ||
      [...inventory.ids, ...(inventory.partial || [])].filter(
        (passage) => !known.has(passage),
      ),
  });
}

class SessionLifecycle {
  #objects;
  #ending = null;
  // La confirmation appartient à cette vie, jamais au manifeste d'une vie antérieure.
  #archived = false;
  #unconfirmed = null;
  #closeErrors = [];

  constructor(objects) {
    this.#objects = objects;
    if (objects.restore) restoreSession(objects, objects.restore);
  }

  hasConfirmedEnd() {
    return this.#archived;
  }

  get closeErrors() {
    return [...this.#closeErrors];
  }

  // Un refus de fermeture ne doit empêcher ni l'arrêt des autres fournisseurs ni l'archivage.
  // L'hôte garde les diagnostics pour signaler les ressources dont l'arrêt a échoué.
  async #attemptClosing(step, work) {
    try {
      await work();
    } catch (error) {
      this.#closeErrors.push(
        `${step} : ${String(error?.message || error).slice(0, CLOSE_ERROR_MAX_CHARS)}`,
      );
    }
  }

  async #releaseResources() {
    const { watch, index, thumbnails, perception, inspectorModel } = this.#objects;
    // Les écritures admises atterrissent entières ; aucune nouvelle analyse ne démarre.
    watch.closeIntake();
    watch.beginEnding();
    await watch.landed();
    await this.#attemptClosing("session", () => watch.close());
    await this.#attemptClosing("index", () => index?.close?.());
    await this.#attemptClosing("miniatures", () => thumbnails.close());
    await Promise.all([
      this.#attemptClosing("perception", () => perception.close?.()),
      this.#attemptClosing("modèle d’inspection", () => inspectorModel.close?.()),
    ]);
  }

  // Garde la session complète ; purge retire sur demande ses médias et miniatures, jamais ses textes.
  // Un refus des dernières sauvegardes ne retient pas cette fermeture : archive porte leur confirmation.
  async close({ purge = false } = {}) {
    const { watch, inspector } = this.#objects;
    // Une purge ne doit pas toucher une archive seulement ouverte : ses médias partent avec la
    // suppression explicite de toute la session, pas avec sa fermeture après lecture.
    if (purge && watch.readOnly)
      throw new Error(
        "Session ouverte en lecture seule : ses médias ne s’effacent qu’avec la suppression de la session.",
      );
    inspector.revoke();
    this.#objects.disconnectConsumers?.();
    this.#ending ||= this.#releaseResources();
    await this.#ending;
    if (purge) await this.#purgeMedia();
    await this.#confirmFinalState(purge);
  }

  async #purgeMedia() {
    const { thumbnails, store } = this.#objects;
    await thumbnails.clear();
    await store.clearRaw();
  }

  #recordFinalManifest(purge) {
    if (!purge && this.#archived) return null;
    const view = purge ? this.#objects.watch.memoryView() : null;
    const patch = purge
      ? {
          media: {
            stored: 0,
            missing: view.coverage.passages,
            bytes: 0,
            retention: view.session.retention,
          },
        }
      : {};
    return this.#objects.manifest.record(patch, true);
  }

  async #confirmFinalState(purge) {
    const { watch, store } = this.#objects;
    // Après un refus, un nouvel essai doit sauvegarder l'état à nouveau, même si les ressources
    // sont déjà fermées : le retour du disque ne prouve pas que l'état refusé y a atterri.
    if (this.#unconfirmed) await watch.persist();
    // Les états précèdent leur manifeste final. Un refus ne retient ni close ni une suppression ;
    // archive le transmet, et un nouvel essai peut confirmer sans refermer les fournisseurs.
    this.#unconfirmed = await store
      .flush()
      .then(() => {
        // Le port d'archive peut refuser avant d'atteindre le store ; seul le cœur connaît alors ce refus.
        if (watch.saveError) throw new Error(watch.saveError);
        return this.#recordFinalManifest(purge);
      })
      .then(
        () => {
          this.#archived = true;
          return null;
        },
        (error) => error,
      );
  }

  // Rejette si le disque refuse une dernière écriture, après libération des ressources ; le dossier
  // garde le dernier état confirmé. Un nouvel essai réécrit l'état et le manifeste de ce runtime,
  // mais les fichiers de l'hôte (questions, récap, surveillance) restent refusés tant qu'il ne les réécrit pas.
  async archive() {
    await this.close();
    if (this.#unconfirmed) throw this.#unconfirmed;
    return this.#objects.store.confirmed;
  }

  // Avant l'effacement, attend les écritures déjà commencées du store et des vecteurs. Après retour,
  // aucune écriture tardive de ce runtime ne peut recréer le dossier supprimé.
  async seal() {
    const { store, vectors } = this.#objects;
    // Les derniers enregistrements deviennent inertes avant la fermeture, afin qu'aucune réponse
    // tardive ne puisse recréer le dossier après sa suppression.
    const sealing = [store.seal(), vectors?.seal()];
    await this.close();
    await Promise.all(sealing);
  }

  async pause() {
    const { sessionClock, watch, manifest } = this.#objects;
    sessionClock.pause();
    await watch.stop();
    await manifest.record();
  }

  async resume() {
    const { guard, sessionClock, watch, manifest } = this.#objects;
    // La garde refuse avant tout changement de l'horloge ou de la session.
    await guard?.assertRoom();
    const fromMs = sessionClock.now();
    sessionClock.resume();
    await watch.resume();
    this.#objects.resumeConsumers?.();
    manifest.captureResumed(fromMs);
    await manifest.record();
  }
}

function createSessionLifecycle(objects) {
  return new SessionLifecycle(objects);
}

module.exports = { createSessionLifecycle };
