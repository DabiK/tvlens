// Les messages sont des données simples ; la copie évite de geler les objets de l'émetteur.
function immutableCopy(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutableCopy(item)])));
}

const TVLENS_EVENT_DELIVERY_FAILED = 'TVLENS_EVENT_DELIVERY_FAILED';

function createEventPublisher({ onError = () => {} } = {}) {
  const subscribers = new Map();
  const pending = [];
  let nextId = 0;
  let delivering = false;
  function subscribe(listener) {
    const id = ++nextId;
    subscribers.set(id, listener);
    return () => subscribers.delete(id);
  }
  function report(event, subscriberId, error) {
    try {
      Promise.resolve(onError({ code: TVLENS_EVENT_DELIVERY_FAILED, event, subscriberId, error })).catch(() => {
        // Un diagnostic refusé reste perdu, sans nouvelle publication ni récursion.
      });
    } catch {
      // Un diagnostic qui lève ne possède pas la livraison.
    }
  }
  function deliver(listener, event, subscriberId) {
    try {
      Promise.resolve(listener(event)).catch(error => report(event, subscriberId, error));
    } catch (error) {
      report(event, subscriberId, error);
    }
  }
  function publish(message) {
    pending.push(immutableCopy(message));
    if (delivering) return;
    delivering = true;
    try {
      while (pending.length) {
        const current = pending.shift();
        // Un désabonnement pendant la livraison prend effet au message suivant.
        for (const [id, listener] of [...subscribers]) deliver(listener, current, id);
      }
    } finally {
      delivering = false;
    }
  }
  return { subscribe, publish };
}

module.exports = { createEventPublisher, TVLENS_EVENT_DELIVERY_FAILED };
