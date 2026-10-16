import { createFreshness } from "./freshness.mjs";

export const FALLBACK_MS = 100;

// Les sources adoptent immédiatement leur état ; seuls leurs dessins sont regroupés.
export function createStateDelivery({
  sources,
  draws,
  now,
  requestFrame,
  cancelFrame,
  setTimer,
  clearTimer,
  onReceived,
  onApplied,
}) {
  const pending = new Map();
  let sequence = 0;
  let released = false;

  function schedule(group) {
    if (released || pending.has(group)) return;
    const batch = { emissions: new Map(), frame: null, timer: null };
    pending.set(group, batch);
    const fire = () => {
      if (released || pending.get(group) !== batch) return;
      pending.delete(group);
      clearTimer(batch.timer);
      cancelFrame(batch.frame);
      draws[group]();
      for (const event of batch.emissions.values())
        onApplied?.({ ...event, appliedAt: now() });
    };
    batch.timer = setTimer(fire, FALLBACK_MS);
    batch.frame = requestFrame(fire);
  }

  function receive(source, state) {
    if (released) return;
    const { adopt, group } = sources[source];
    const event = { source, emissionId: ++sequence, receivedAt: now() };
    onReceived?.(event);
    adopt(state);
    schedule(group);
    pending.get(group).emissions.set(source, event);
  }

  function release() {
    if (released) return;
    released = true;
    for (const batch of pending.values()) {
      cancelFrame(batch.frame);
      clearTimer(batch.timer);
    }
    pending.clear();
  }

  return { receive, schedule, release };
}

// Le bridge reste une dépendance de composition ; les lectures conservent leur règle de fraîcheur.
export function bindPushedStates({ bridge, delivery, changed, onError }) {
  let released = false;
  const deepFreshness = createFreshness();
  const verificationFreshness = createFreshness();
  const push = (source, freshness) => (state) => {
    if (released || (source === "session" && !state)) return;
    freshness?.pushed();
    delivery.receive(source, state);
    if (source !== "session") changed();
  };
  const subscriptions = [
    bridge.onState(push("session")),
    bridge.onDeepState(push("deep", deepFreshness)),
    bridge.onVerificationState(push("verification", verificationFreshness)),
  ];
  const beginDeepRead = () => {
    const isFresh = deepFreshness.beginRead();
    return () => !released && isFresh();
  };
  const initialDeepFresh = beginDeepRead();
  bridge
    .deepState()
    .then((state) => {
      if (!initialDeepFresh()) return;
      delivery.receive("deep", state);
    })
    .catch((error) => {
      if (!released) onError(error);
    });
  const initialVerificationFresh = verificationFreshness.beginRead();
  bridge
    .verificationState()
    .then((state) => {
      if (released || !initialVerificationFresh()) return;
      delivery.receive("verification", state);
      changed();
    })
    .catch((error) => {
      if (!released) onError(error);
    });
  return {
    beginDeepRead,
    release() {
      if (released) return;
      released = true;
      for (const unsubscribe of subscriptions) unsubscribe();
      delivery.release();
    },
  };
}
