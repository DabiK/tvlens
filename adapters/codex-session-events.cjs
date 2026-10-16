const { safeError, isAuthFailure } = require("./chat-trace.cjs");
const { openedPages } = require("./codex-confinement.cjs");

const PREVIEW_INTERVAL_MS = 80;
const PROVISIONAL_MAX_CHARS = 1600;
const TURN_EVENTS = [
  "turn/started",
  "turn/completed",
  "error",
  "connection/closed",
];
const ITEM_EVENTS = ["item/started", "item/completed"];

function sourceKey(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function streamedAnswer(json) {
  const match = json.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)/);
  if (!match) return "";
  try {
    return JSON.parse('"' + match[1] + '"');
  } catch {
    return "";
  }
}

function turnDiagnostic(p) {
  return {
    eventThreadId: p?.threadId,
    eventTurnId: p?.turn?.id || p?.turnId,
    status: p?.turn?.status,
    error: safeError(p?.turn?.error || p?.error),
    willRetry: p?.willRetry,
  };
}

function traceTurn(state, effects, method, p) {
  const active = state.active;
  effects.trace(method, {
    ...turnDiagnostic(p),
    active: Boolean(active),
    hadFinal: Boolean(active?.final),
    textChars: active?.text?.length || 0,
  });
}

function traceEvent(state, effects, method, p) {
  if (TURN_EVENTS.includes(method)) traceTurn(state, effects, method, p);
  if (ITEM_EVENTS.includes(method) && p?.item?.type === "webSearch") {
    effects.trace(method, {
      eventThreadId: p.threadId,
      eventTurnId: p.turnId,
      itemId: p.item.id,
      itemType: "webSearch",
      actionType: p.item.action?.type,
      status: p.item.status,
      error: safeError(p.item.error),
    });
  }
}

function connectionClosed(state) {
  state.ready = null;
  state.draining?.end();
  state.active?.reject(
    Error("Connexion Codex interrompue. Réessaie la question."),
  );
}

// Any notification can reveal a foreign thread, before filtering out its turn or items.
function observeThread(state, effects, id) {
  if (
    !effects.guardThreads ||
    typeof id !== "string" ||
    id === state.threadId ||
    state.threads.own.has(id)
  )
    return false;
  // startThread judges an announcement received before its own request was answered.
  if (state.threads.starting) state.threads.announced.add(id);
  else effects.foreignThread();
  return true;
}

function threadStarted(state, effects, p) {
  return observeThread(state, effects, p?.thread?.id || p?.threadId);
}

function threadStatusChanged(state, effects, p) {
  return observeThread(state, effects, p?.thread?.id || p?.threadId);
}

function endDrain(state, method, p) {
  // The end of a turn the guard refused frees the client for the next one.
  const draining = state.draining;
  if (
    draining &&
    method === "turn/completed" &&
    p?.threadId === state.threadId &&
    (!draining.turnId || draining.turnId === p.turn?.id)
  )
    draining.end();
}

function turnStarted(state, _effects, p) {
  if (!state.active.turnId) state.active.turnId = p.turn.id;
}

function turnError(state, _effects, p) {
  // Notifications may carry the only failure detail; keep the last one, redacted.
  if (p.error) state.active.lastError = safeError(p.error);
}

function failureMessage(status, authRequired) {
  if (status === "interrupted") return "Recherche annulée.";
  if (authRequired) {
    return (
      "Codex n’a pas terminé la réponse : authentification refusée (401). " +
      "Reconnexion Codex requise (codex login), puis repose la question."
    );
  }
  return "Codex n’a pas terminé la réponse.";
}

function turnCompleted(state, _effects, p) {
  const active = state.active;
  if (active.turnId && p.turn.id !== active.turnId) return;
  if (p.turn.status === "completed") {
    active.resolve(active.final || active.text);
    return;
  }
  // Keep the raw turn outcome, redacted, so the job can store a usable diagnostic.
  const detail = safeError(p.turn.error) || active.lastError;
  const authRequired = p.turn.status !== "interrupted" && isAuthFailure(detail);
  const error = Error(failureMessage(p.turn.status, authRequired));
  error.turnStatus = p.turn.status;
  if (detail) error.turnError = detail;
  if (authRequired) error.authRequired = true;
  active.reject(error);
}

// No raw reasoning is emitted: only tool lifecycle, concise status and final-answer deltas.
function itemStarted(state, _effects, p) {
  const item = p.item;
  if (item.type === "webSearch") {
    state.active.onProgress?.({
      message:
        item.action?.type === "openPage"
          ? "Consultation d’une source…"
          : "Recherche sur Internet…",
    });
  } else if (item.type === "agentMessage") {
    state.active.onProgress?.({ message: "Rédaction de la réponse…" });
  } else if (item.type === "reasoning") {
    state.active.onProgress?.({ message: "Codex examine le contexte…" });
  }
}

function agentMessageDelta(state, effects, p) {
  const active = state.active;
  active.text += p.delta;
  const text = streamedAnswer(active.text);
  if (text && effects.now() - active.lastPreview > PREVIEW_INTERVAL_MS) {
    active.lastPreview = effects.now();
    active.onProgress?.({ message: "Rédaction de la réponse…", preview: text });
  }
}

function auditWebSearch(state, item) {
  const active = state.active;
  // A grouped open credits every rendered page; a search credits none.
  const pages = openedPages(item);
  (pages.length ? pages : [item.action?.url]).forEach((url, index) => {
    const key = pages.length ? sourceKey(url) : null;
    if (key) {
      state.opened.add(key);
      active.onProgress?.({
        message: "Source consultée : " + new URL(url).hostname,
      });
    }
    active.audit.push({
      action: item.action?.type,
      tool: "web_search",
      url,
      status: "completed",
      ...(item.id ? { itemId: item.id } : {}),
      // This entry credits a page really opened, whatever the action is called.
      ...(key ? { opened: true } : {}),
      // Further pages of the same call must not be counted as another search.
      ...(index ? { grouped: true } : {}),
    });
  });
}

function itemCompleted(state, _effects, p) {
  const item = p.item;
  if (item.type === "webSearch") auditWebSearch(state, item);
  if (item.type === "agentMessage" && item.phase === "commentary" && item.text)
    state.active.onProgress?.({
      provisional: item.text.slice(0, PROVISIONAL_MAX_CHARS),
    });
  if (item.type === "agentMessage" && item.phase !== "commentary")
    state.active.final = item.text;
}

const TURN_HANDLERS = new Map([
  ["turn/completed", turnCompleted],
  ["error", turnError],
  ["item/started", itemStarted],
  ["item/completed", itemCompleted],
  ["item/agentMessage/delta", agentMessageDelta],
]);

function dispatchActive(state, effects, method, p) {
  const active = state.active;
  if (!active || p?.threadId !== state.threadId) return;
  if (method === "turn/started") turnStarted(state, effects, p);
  if (p.turnId && active.turnId && p.turnId !== active.turnId) return;
  if (ITEM_EVENTS.includes(method) && !effects.acceptItem(active, method, p))
    return;
  TURN_HANDLERS.get(method)?.(state, effects, p);
}

// The client hands over its live state; there is no notification-owned connection or active turn.
function dispatchEvent(state, effects, method, p) {
  traceEvent(state, effects, method, p);
  if (method === "connection/closed") return connectionClosed(state);
  if (method === "thread/started") return threadStarted(state, effects, p);
  if (method === "thread/status/changed")
    return threadStatusChanged(state, effects, p);
  if (observeThread(state, effects, p?.thread?.id || p?.threadId)) return;
  endDrain(state, method, p);
  dispatchActive(state, effects, method, p);
}

module.exports = {
  dispatchEvent,
  connectionClosed,
  threadStarted,
  threadStatusChanged,
  turnStarted,
  turnCompleted,
  turnError,
  itemStarted,
  itemCompleted,
  agentMessageDelta,
  sourceKey,
  streamedAnswer,
};
