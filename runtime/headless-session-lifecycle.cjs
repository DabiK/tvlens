const {
  closeSession,
  settleQuestions,
  attempt,
} = require("./session-closing.cjs");
const { refusal } = require("./errors.cjs");
const { READ_ONLY } = require("./capture-intake.cjs");
const { isEmptySession } = require("./empty-session.cjs");

class HeadlessSessionLifecycle {
  constructor({
    library,
    createSession,
    openSession,
    conversation = {},
    surveillance,
    checkpoint,
    intake,
    warmUp,
    guard,
    onAdopt,
    publish,
    log,
  }) {
    Object.assign(this, {
      library,
      createSession,
      openSession,
      surveillance,
      checkpoint,
      intake,
      warmUp,
      guard,
      onAdopt,
      publish,
      log,
      agent: conversation.agent,
      deep: conversation.deep,
    });
    this.session = null;
    this.fresh = false;
    this.ending = null;
    this.releasing = false;
    this.closing = false;
    this.closed = null;
    // Une archive refusée reste un résultat de fin, avec ses erreurs nommées.
    this.lastEnd = null;
    // Le transport oublie sa numérotation dès que la capture peut avoir changé, même sur la même session.
    this.captureEpoch = 0;
    // Title of what is watched, as declared by the last start that named it: an archive opened has none until then.
    this.sourceTitle = null;
    this.transition = Promise.resolve();
  }
  // Les transitions passent une par une : une ouverture ne s'entrelace jamais avec une fin ou une suppression.
  exclusive(work) {
    const run = this.transition.then(work);
    this.transition = run.catch(() => {});
    return run;
  }
  described(session) {
    const watch = session.watch;
    return {
      id: session.id,
      elapsedMs: watch.now(),
      retentionMs: null,
      retention: "until-deleted",
      readOnly: watch.readOnly,
      accepting: watch.accepting,
    };
  }
  // Une restauration silencieuse peut encore refuser la libération : elle précède le transfert de référence.
  // Aucun await ni publication ne sépare ensuite la session de ses questions.
  adopt(session, jobs = []) {
    // Nothing of the former session waits past this point: what it had to save was handed over when its
    // questions were settled, and a timer left behind would have nothing to write.
    this.checkpoint.forget();
    this.deep.restore(jobs);
    this.session = session;
    this.fresh = false;
    this.sourceTitle = null;
    this.captureEpoch++;
    this.onAdopt(session);
  }
  // Only for the session still loaded: a question decided once the host has moved on gets no title of another session.
  sourceTitleOf(sessionId) {
    return this.session !== null && this.session.id === sessionId ? this.sourceTitle : null;
  }
  moving() {
    return Boolean(this.ending || this.releasing || this.closing);
  }
  // A declared title names the session this call starts or resumes, replacing the one it had, the session already
  // capturing included; without one, the title stays as it is. A refused start changes nothing.
  start({ sourceTitle } = {}) {
    return this.exclusive(async () => {
      if (this.closing) throw refusal(400, "Session en cours de fermeture.", "session-closing");
      let session = this.session;
      // Looking at an archive never adds capture to it: it is resumed explicitly, or left for a new one.
      if (session?.readOnly) throw refusal(409, READ_ONLY, "read-only");
      if (!session) {
        // Refused on a fresh measurement, before a directory or a provider connection exists.
        await this.guard?.assertRoom();
        session = this.createSession();
        this.adopt(session);
        this.fresh = true;
        // The first answer and the first description should not pay the connection. Never for an archive
        // that is only being read.
        this.warmUp({
          chat: this.agent,
          perception: session.perception,
          sessionId: session.id,
        });
      } else {
        const stopped = !session.watch.accepting;
        if (stopped) await session.resume();
        // Every successful start, even on a session that was still capturing: a TV that restarted its
        // capture without sending a pause numbers its blocks from a lower origin. A block of the former
        // capture replayed afterwards is still refused by the session, on observation order.
        this.captureEpoch++;
        if (stopped) this.publish();
      }
      if (sourceTitle !== undefined) this.sourceTitle = sourceTitle;
      return this.described(session);
    });
  }
  pause() {
    return this.exclusive(async () => {
      await this.session?.pause();
      this.publish();
    });
  }
  // Le protocole partagé tente chaque étape ; son résultat et son journal conservent tous les échecs.
  // L'ordre serveur compte : la capture s'arrête, les stockages admis atterrissent, puis questions
  // et surveillance atteignent leur état final et le sauvegardent avant l'archivage.
  // L'archivage ou l'effacement ne sont annoncés qu'après la réussite de leur propre étape ; sinon
  // le dossier garde le dernier état confirmé. La liste suit le manifeste sur disque et indique
  // une session interrompue s'il date d'une capture. Une suppression explicite scelle avant d'effacer.
  // Si l'hôte ne peut lâcher la session, elle reste tenue et rien n'est effacé sous elle.
  async leave(session, reason, remove = false) {
    this.releasing = true;
    let cancelled = [];
    try {
      const outcome = await closeSession({
        session,
        library: this.library,
        remove,
        empty: () => isEmptySession({
          fresh: this.fresh,
          jobs: this.deep.jobs.length,
          questions: session.watch.questions.length,
          passages: session.memoryProjection.read().session.coverage.passages,
        }),
        // Before anything is awaited: a block whose preparation ends meanwhile is not stored in passing.
        begin: [
          "préparation média",
          () => {
            cancelled = this.intake.cancelPreparations();
          },
        ],
        steps: [
          // A deletion is refused while its session captures: it has no capture left to stop.
          ...(remove ? [] : [["capture", () => session.pause()]]),
          ["préparation média", () => this.intake.settleIngestions(cancelled)],
          [
            "questions",
            () =>
              settleQuestions(this.deep, reason, () => this.checkpoint.flush()),
          ],
          ["surveillance", () => this.surveillance.reset(reason)],
          ["agent de chat", () => this.agent.close?.()],
        ],
        // La restauration synchrone peut refuser de lâcher une session dont une question reste active.
        letGo: () => this.adopt(null),
        log: (line) => this.log(line),
      });
      const { id, archived, errors } = outcome;
      this.lastEnd = { id, archived, ...(errors.length ? { errors } : {}) };
      return outcome;
    } finally {
      this.releasing = false;
    }
  }
  // Ends the work on the session in memory and keeps it whole on disk: nothing is purged. A session this
  // host could not let go of is not said ended: whoever asked is told why, as the journal already is.
  async release(reason = "Session terminée.") {
    const session = this.session;
    if (!session) return { id: null, archived: false };
    const { refused } = await this.leave(session, reason);
    if (refused) throw refused;
    return this.lastEnd;
  }
  // "Terminer la session" archives: nothing is purged. Coalesced: a second request shares the outcome.
  end() {
    return (this.ending ||= this.exclusive(() => this.release()).finally(() => {
      this.ending = null;
    }));
  }
  // Après validation de l'identifiant par dir(), un refus de folder() signifie que la session est absente : 404.
  async located(id) {
    this.library.dir(id);
    await this.library.folder(id).catch(() => {
      throw refusal(404, "Session introuvable.", "not-found");
    });
  }
  capturing(session = this.session) {
    return Boolean(
      session &&
      ((session.watch.accepting && !session.readOnly) ||
        this.intake.ingestions.size),
    );
  }
  // Lire une archive n'écrit rien dans son dossier et n'appelle aucun fournisseur, ni préchauffage ni indexation.
  // La capture ne peut revenir que par une reprise explicite avec resume().
  open(id) {
    return this.exclusive(async () => {
      if (this.closing) throw refusal(400, "Session en cours de fermeture.", "session-closing");
      this.library.dir(id);
      const loaded = this.session;
      if (loaded?.id === id && loaded.readOnly) return this.described(loaded);
      if (loaded?.id !== id) await this.located(id);
      if (this.capturing(loaded))
        throw refusal(
          409,
          "Arrête la capture avant d’ouvrir une autre session.",
          "capturing",
        );
      // Read before the session in memory is let go: an unreadable archive changes nothing. The
      // session in memory itself is read once it is closed, so its last state is the one reopened.
      let archive = loaded?.id === id ? null : await this.library.read(id);
      await this.release("Session fermée.");
      if (!archive) {
        await this.located(id);
        archive = await this.library.read(id);
      }
      // Same reopening as the Mac host, on the archive already read.
      const { session } = await this.openSession(id, archive);
      this.adopt(session, archive.chat?.jobs || []);
      // Read-only registry: what was still moving is shown cancelled, nothing is relaunched or rewritten.
      this.surveillance.restore(archive.surveillance);
      return this.described(session);
    });
  }
  // Explicit resume of the session in memory: an opened archive leaves read-only and captures again,
  // on its own clock and numbering.
  resume(id) {
    return this.exclusive(async () => {
      if (this.closing) throw refusal(400, "Session en cours de fermeture.", "session-closing");
      this.library.dir(id);
      const session = this.session;
      if (session?.id !== id) {
        await this.located(id);
        throw refusal(
          409,
          "Ouvre cette session avant de reprendre la capture.",
          "not-open",
        );
      }
      if (!session.watch.accepting) {
        // Refused by the guard, with its message, while the disk is below its floor.
        await session.resume();
        this.captureEpoch++;
        // Same as at the start: never for an archive that is only being read.
        this.warmUp({
          chat: this.agent,
          perception: session.perception,
          sessionId: session.id,
        });
        this.publish();
      }
      return this.described(session);
    });
  }
  // La session chargée ne peut être supprimée pendant sa capture. Sinon ses questions et sa surveillance
  // sont annulées, puis son stockage est scellé avant tout effacement : aucune sauvegarde, aucun vecteur
  // ni aucune miniature tardive ne doit recréer le dossier.
  remove(id) {
    return this.exclusive(async () => {
      this.library.dir(id);
      const session = this.session;
      if (session?.id !== id) {
        await this.located(id);
        const removed = await this.library.remove(id);
        this.publish();
        return { deleted: true, id, freedBytes: removed.freedBytes };
      }
      if (this.capturing(session))
        throw refusal(
          409,
          "Arrête la capture avant de supprimer cette session.",
          "capturing",
        );
      // Same rules as an end: nothing new is analysed for a session that is going away, a block still
      // being prepared for it is cancelled before its folder is erased, and an adapter that fails to
      // close does not keep the session from going.
      const { freedBytes, refused } = await this.leave(
        session,
        "Session supprimée.",
        true,
      );
      // Not erased "whatever happens": nothing is unless the store is really sealed and this host has
      // let go of the session. Otherwise its folder keeps what it held, and whoever asked is told why.
      if (refused) throw refused;
      this.publish();
      return { deleted: true, id, freedBytes };
    });
  }
  // L'arrêt conserve la session entière sur disque ; son archivage confirmé la rend retrouvable au prochain démarrage.
  close() {
    this.closing = true;
    return (this.closed ||= this.exclusive(async () => {
      const errors = [];
      try {
        const ended = await this.release();
        // No session to end, yet a preparation cancelled by an earlier end may still not have let go:
        // the host does not leave under it without the same bounded wait, and says so below.
        if (ended.id === null)
          await attempt(errors, "préparation média", () =>
            this.intake.settleIngestions(this.intake.cancelPreparations()),
          );
      } finally {
        // The surveillance role releases its provider processes whatever the end of the session did.
        await attempt(errors, "surveillance", () => this.surveillance.close());
        if (errors.length) {
          this.lastEnd = {
            id: null,
            archived: false,
            ...this.lastEnd,
            errors: [...(this.lastEnd?.errors || []), ...errors],
          };
          try {
            this.log(
              `TVLens — arrêt incomplet de l’hôte : ${errors.join(" ; ")}`,
            );
          } catch {
            // lastEnd.errors contient déjà les échecs d'arrêt ; un journal indisponible ne doit pas remplacer ce résultat.
          }
        }
      }
    }));
  }
}

function createHeadlessSessionLifecycle(options) {
  return new HeadlessSessionLifecycle(options);
}

module.exports = { createHeadlessSessionLifecycle };
