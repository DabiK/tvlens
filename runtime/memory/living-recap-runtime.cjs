const TVLENS_RECAP_OBSERVATION_FAILED = 'TVLENS_RECAP_OBSERVATION_FAILED';

// Les événements regroupés déclenchent une lecture hors de leur livraison synchrone ; tick reste à l'hôte.
function createLivingRecapRuntime({ id, recap, readView, subscribe, schedule, isBlocked, onError, silent = false }) {
  const revisions = new Map();
  let closed = false;
  let scheduled = false;

  function report(error) {
    try {
      Promise.resolve(onError({ code: TVLENS_RECAP_OBSERVATION_FAILED, sessionId: id, error })).catch(() => {
        // Un diagnostic refusé ne possède ni les voies ni leur sauvegarde.
      });
    } catch {
      // Aucun diagnostic récursif si le journal refuse lui aussi.
    }
  }

  function observeCurrent(quiet) {
    if (closed || isBlocked()) return;
    try {
      const view = readView();
      if (view.session.id !== id) return;
      recap.observe(view, { silent: quiet });
      for (const passage of view.passages) revisions.set(passage.id, passage.revision);
    } catch (error) {
      report(error);
    }
  }

  function flush() {
    scheduled = false;
    observeCurrent(false);
  }

  const unsubscribe = subscribe(event => {
    if (closed || isBlocked() || event.sessionId !== id) return;
    if (!['PassageReceived', 'PassageUpdated', 'PassageLost'].includes(event.type)) return;
    if (revisions.has(event.passageId) && event.revision <= revisions.get(event.passageId)) return;
    if (scheduled) return;
    scheduled = true;
    schedule(flush);
  });
  observeCurrent(silent);

  return {
    close() {
      if (closed) return;
      closed = true;
      unsubscribe();
    },
  };
}

module.exports = { createLivingRecapRuntime };
