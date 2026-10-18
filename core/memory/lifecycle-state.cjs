const { domainError } = require('../shared/domain-error.cjs');

const TVLENS_SESSION_STOPPED = 'TVLENS_SESSION_STOPPED';
const TVLENS_MEMORY_RESTORE_REFUSED = 'TVLENS_MEMORY_RESTORE_REFUSED';

function restorationRefusal() {
  return domainError(TVLENS_MEMORY_RESTORE_REFUSED, 'Session déjà commencée : restauration impossible.');
}

// Les axes sont indépendants : finir n'arrête pas l'admission et une pause ne quitte pas la lecture seule.
// Cette valeur ne porte aucun effet ; la racine conserve publications, sauvegardes et annulation des voies.
class MemoryLifecycleState {
  constructor({ closed = false, ending = false, accepting = true, readOnly = false } = {}) {
    Object.assign(this, { closed, ending, accepting, readOnly });
    Object.freeze(this);
  }

  pause() {
    return new MemoryLifecycleState({ ...this, accepting: false });
  }

  resume() {
    if (this.closed) throw domainError(TVLENS_SESSION_STOPPED, 'Session fermée.');
    return new MemoryLifecycleState({ ...this, accepting: true, readOnly: false });
  }

  suspendAdmission() {
    return new MemoryLifecycleState({ ...this, accepting: false });
  }

  beginEnding() {
    return new MemoryLifecycleState({ ...this, ending: true });
  }

  closeIntake() {
    return new MemoryLifecycleState({ ...this, accepting: false });
  }

  close() {
    return new MemoryLifecycleState({ ...this, closed: true, accepting: false });
  }

  restore() {
    if (this.closed) throw restorationRefusal();
    return new MemoryLifecycleState({ ...this, accepting: false, readOnly: true });
  }
}

module.exports = { MemoryLifecycleState, TVLENS_SESSION_STOPPED, TVLENS_MEMORY_RESTORE_REFUSED, restorationRefusal };
