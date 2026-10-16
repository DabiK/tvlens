const VERSION = 'tvlens-chat-trace-v1';
function clean(value, max = 240) {
  return String(value ?? '').replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk-|nvapi-)[A-Za-z0-9_-]+/g, '[secret]')
    .replace(/((["']?)(?:access_token|refresh_token|token|password|secret|api[_-]?key|authorization)\2\s*[=:]\s*)(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,;]+)/gi, '$1[redacted]')
    .replace(/\b[A-Za-z0-9_+/=-]{48,}\b/g, '[opaque]')
    .replace(/[\r\n\t]/g, ' ').slice(0, max);
}
// Bounded, redacted summary of an error. Only allow-listed fields survive; stack, request payloads
// and arbitrary properties are dropped. A nested turnError is followed one level only, never further.
const MAX_DEPTH = 1;
function safeError(error, depth = 0) {
  try {
    if (!error) return undefined;
    if (typeof error === 'string') return {message:clean(error)};
    if (typeof error !== 'object') return {message:clean(String(error))};
    const out = {};
    const put = (key, value, max) => { if (value !== undefined && value !== null && value !== '') out[key] = clean(value, max); };
    put('name', error.name, 60);
    put('code', error.code, 80);
    put('message', error.message, 240);
    const info = error.codexErrorInfo;
    if (info !== undefined && info !== null)
      put('codexErrorInfo', typeof info === 'object' ? Object.keys(info).join(',') : info, 100);
    put('turnStatus', error.turnStatus, 40);
    if (error.authRequired === true) out.authRequired = true;
    if (error.turnError && typeof error.turnError === 'object' && depth < MAX_DEPTH)
      out.turnError = safeError(error.turnError, depth + 1);
    return out;
  } catch {
    return {message:'[unserializable]'};
  }
}
// Backend auth/routing refusal (e.g. "workspace routing discovery unauthorized (401)"): Codex must be reconnected.
function isAuthFailure(detail) {
  if (!detail || typeof detail !== 'object') return false;
  return /unauthorized|\b401\b/i.test([detail.code, detail.message, detail.codexErrorInfo].filter(Boolean).join(' '));
}
function trace(event, fields = {}) {
  if (process.env.TVLENS_CODEX_TRACE !== '1') return;
  try { process.stderr.write(JSON.stringify({trace:VERSION,t:new Date().toISOString(),pid:process.pid,event,...fields})+'\n'); }
  catch {
    // Une trace non sérialisable ou un stderr indisponible perd ce diagnostic seulement :
    // le résultat ou le refus du tour reste porté par les promesses du client, indépendamment des traces.
  }
}
module.exports={trace,safeError,isAuthFailure,VERSION};
