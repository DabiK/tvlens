const { STORAGE_FULL } = require("../adapters/disk-guard.cjs");
const { refusal } = require("./state-views.cjs");
const { validateSegment } = require("./session-runtime.cjs");

const READ_ONLY =
  "Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.";
// Une session qui part fait redemander son état à la capture, sans compter un bloc invalide.
const closing = () => refusal(503, "Session en cours de fermeture.", "session-closing");
// Plafond d'attente après annulation, sans garantie de nettoyage ni libération du créneau HTTP.
const PREPARATION_WAIT_MS = 1000;

// Refuser avant tout travail média : une archive en lecture seule ne reçoit jamais de capture,
// et une capture suspendue faute de place continue d'en donner la raison.
function admit({ getSession, storage }, sessionId) {
  const session = getSession();
  if (!session || sessionId !== session.id) throw Error("Session obsolète.");
  if (session.readOnly) throw refusal(409, READ_ONLY, "read-only");
  if (session.watch.accepting) return session;
  if (storage().state === "blocked")
    throw Object.assign(
      new Error(
        session.watch.storageError ||
          "Espace disque insuffisant : la capture est suspendue pour ne rien supprimer.",
      ),
      { code: STORAGE_FULL },
    );
  throw Error("La session est arrêtée.");
}

// L'hôte possède le bloc avant sa préparation pour pouvoir l'annuler quand sa session part.
// Cette possession dure jusqu'au finish du transport, même si la préparation se règle tard.
function accept(intake, sessionId) {
  const session = admit(intake, sessionId);
  if (intake.isMoving()) throw closing();
  const operation = {
    session,
    epoch: intake.getCaptureEpoch(),
    controller: new AbortController(),
    storing: false,
  };
  operation.settled = new Promise((resolve) => {
    operation.settle = resolve;
  });
  intake.admitted.add(operation);
  return operation;
}

// L'identifiant survit à une réouverture d'archive ; seul l'objet session distingue ses vies.
function current(intake, operation) {
  return (
    !operation.controller.signal.aborted &&
    operation.session === intake.getSession() &&
    operation.epoch === intake.getCaptureEpoch()
  );
}

// Seul le transport rend le bloc, une fois répondu et sa préparation réglée, même après la borne.
function finish({ admitted }, operation) {
  admitted.delete(operation);
  operation.settle();
}

function cancelPreparations({ admitted }) {
  const cancelled = [];
  for (const operation of admitted)
    if (!operation.storing) {
      if (!operation.controller.signal.aborted)
        operation.controller.abort(closing());
      // Une préparation sourde reste attendue aux fins suivantes, jusqu'au finish du transport.
      cancelled.push(operation.settled);
    }
  return cancelled;
}

// Les stockages atterrissent en entier avant la borne réservée aux préparations annulées.
// Dépasser cette borne ne libère ni l'opération ni le créneau HTTP : la préparation doit réellement se régler.
async function settleIngestions(intake, cancelled) {
  await Promise.allSettled([...intake.ingestions]);
  if (!cancelled.length) return;
  let timer;
  try {
    const late = await Promise.race([
      Promise.all(cancelled).then(() => false),
      new Promise((resolve) => {
        timer = intake.setTimer(() => resolve(true), intake.preparationWaitMs);
      }),
    ]);
    if (late)
      throw new Error(
        `arrêt non confirmé après ${intake.preparationWaitMs} ms, bloc refusé, préparation suivante en attente`,
      );
  } finally {
    intake.clearTimer(timer);
  }
}

// L'opération est facultative : une sonde ou un test sans préparation appelle ingest(input) directement.
async function ingest(intake, input, operation) {
  // Vérifier la vie d'origine avant admit : rouvrir le même identifiant ne rend pas un ancien bloc valide.
  if (operation && !current(intake, operation))
    throw operation.controller.signal.aborted
      ? operation.controller.signal.reason
      : refusal(409, "La capture a changé pendant la préparation de ce bloc.", "capture-changed");
  const session = admit(intake, input?.sessionId);
  validateSegment(input, session.watch.now());
  if (intake.isMoving()) throw closing();
  // Aucun await entre la validité et ce passage : la fin attend désormais ce stockage entier.
  if (operation) operation.storing = true;
  const work = session.watch.ingest(input);
  intake.ingestions.add(work);
  try {
    return await work;
  } catch (error) {
    // Le manque d'espace refuse le bloc avant toute écriture. Seule la session encore en mémoire
    // se met entièrement en pause, horloge comprise ; rien n'est supprimé pour faire de la place,
    // et elle reste ouverte aux questions.
    if (error?.code === STORAGE_FULL && intake.getSession() === session) {
      await session.pause().catch(() => {
        // La session conserve son refus de sauvegarde ; il ne remplace pas le manque d'espace du bloc.
      });
      intake.publish();
    }
    throw error;
  } finally {
    intake.ingestions.delete(work);
  }
}

function createCaptureIntake({
  getSession,
  getCaptureEpoch,
  isMoving,
  storage,
  publish,
  preparationWaitMs,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
}) {
  const intake = {
    getSession, getCaptureEpoch, isMoving, storage, publish,
    preparationWaitMs: preparationWaitMs ?? PREPARATION_WAIT_MS,
    setTimer, clearTimer,
    admitted: new Set(),
    ingestions: new Set(),
  };
  return {
    admitted: intake.admitted,
    ingestions: intake.ingestions,
    admit: (sessionId) => admit(intake, sessionId),
    accept: (sessionId) => accept(intake, sessionId),
    current: (operation) => current(intake, operation),
    finish: (operation) => finish(intake, operation),
    cancelPreparations: () => cancelPreparations(intake),
    settleIngestions: (cancelled) => settleIngestions(intake, cancelled),
    ingest: (input, operation) => ingest(intake, input, operation),
  };
}

module.exports = { createCaptureIntake, READ_ONLY };
