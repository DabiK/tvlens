const REQUEST_MS = 5000, BLOCK_MS = 30000, RETRY_MS = 1000, REQUEST_FLOOR_MS = 100;
const errorCode = error => typeof error?.code === 'string' ? error.code : 'network-cut';

function bounded(work, timeoutMs, clock, signal) {
  const controller = new AbortController();
  let timer, abort;
  const stopped = new Promise((resolve, reject) => {
    abort = () => {
      const reason = signal?.reason || Object.assign(Error('Rejeu arrêté.'), { code: 'TVLENS_REPLAY_CANCELLED' });
      controller.abort(reason);
      reject(reason);
    };
    timer = clock.setTimer(() => {
      const error = Object.assign(Error('Attente du runner dépassée.'), { code: 'TVLENS_REPLAY_TIMEOUT' });
      controller.abort(error);
      reject(error);
    }, timeoutMs);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
  return Promise.race([stopped, Promise.resolve().then(() => {
    controller.signal.throwIfAborted();
    return work(controller.signal);
  })]).finally(() => {
    clock.clearTimer(timer);
    signal?.removeEventListener('abort', abort);
  });
}
function wait(ms, clock, signal) {
  if (signal?.aborted || ms <= 0) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => {
      clock.clearTimer(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = clock.setTimer(finish, ms);
    signal?.addEventListener('abort', finish, { once: true });
  });
}
function terminalRefusal(response) {
  const { status, value = {} } = response;
  if (value.code === 'storage-full' || status === 507 && !value.code) return 'storage-full';
  if (status === 409 && value.code === 'read-only') return 'read-only';
  return null;
}
function terminalState(value, sessionId) {
  if (value.id === sessionId && value.storage?.state === 'blocked') return 'storage-full';
  if (value.id === sessionId && value.readOnly) return 'read-only';
  if (value.id !== sessionId || !value.accepting) return 'session-changed';
  return null;
}
function rejected(response) {
  return response.status !== null && response.status < 500 && ![408, 429].includes(response.status);
}
function unfinished(entry, signal, stopped) {
  if (entry.status !== 'sending') return;
  entry.status = signal?.aborted || stopped ? 'unfinished' : 'expired';
  entry.code = stopped || (signal?.aborted ? 'TVLENS_REPLAY_CANCELLED' : 'delivery-expired');
}
function createTransport({ exchange, clock, writer, signal, onTerminal = () => {} }) {
  let stopped = null;
  async function request(route, raw, timeoutMs = REQUEST_MS, attempts = []) {
    const attempt = { number: attempts.length + 1, route, submittedAtMs: clock.now(), timeoutMs, status: null, code: null };
    attempts.push(attempt);
    writer.save();
    let response;
    try {
      response = await bounded(effectiveSignal => exchange(route, { raw, signal: effectiveSignal, timeoutMs }), timeoutMs, clock, signal);
      Object.assign(attempt, { status: response.status, code: response.value?.code || null });
    } catch (error) {
      attempt.code = errorCode(error);
      response = { status: null, value: { code: attempt.code } };
    }
    attempt.finishedAtMs = clock.now();
    writer.save();
    return response;
  }
  function stop(code) {
    if (!stopped) { stopped = code; onTerminal(code); }
  }
  async function cycle(entry, raw, sessionId, deadline) {
    const timeout = () => Math.max(REQUEST_FLOOR_MS, Math.min(REQUEST_MS, deadline - clock.now()));
    const state = await request('/v1/session', undefined, timeout(), entry.attempts);
    const code = terminalRefusal(state) || (state.status === 200 ? terminalState(state.value, sessionId) : null);
    if (code) { stop(code); return { status: 'refused', code }; }
    if (state.status !== 200) return state;
    if (signal?.aborted || stopped || clock.now() >= deadline) return { status: null };
    const response = await request('/v1/segments', raw, timeout(), entry.attempts);
    const refusal = terminalRefusal(response);
    if (refusal) { stop(refusal); return { status: 'refused', code: refusal }; }
    if (response.status === 200) return { status: 'accepted', id: response.value.id, duplicate: Boolean(response.value.duplicate) };
    return response;
  }
  async function deliver(entry, raw, sessionId) {
    const deadline = entry.plannedAtMs + BLOCK_MS;
    entry.submittedAtMs = clock.now();
    entry.status = 'sending';
    while (!stopped && !signal?.aborted && clock.now() < deadline) {
      const response = await cycle(entry, raw, sessionId, deadline);
      if (['accepted', 'refused'].includes(response.status)) { Object.assign(entry, response); break; }
      if (rejected(response)) {
        entry.status = 'refused';
        entry.code = response.value?.code || 'HTTP_' + response.status;
        break;
      }
      await wait(Math.min(RETRY_MS, Math.max(0, deadline - clock.now())), clock, signal);
    }
    unfinished(entry, signal, stopped);
    entry.finishedAtMs = clock.now();
    writer.save();
  }
  return { request, deliver, stop, get stopped() { return stopped; } };
}
module.exports = { createTransport, bounded, wait, REQUEST_MS, BLOCK_MS };
