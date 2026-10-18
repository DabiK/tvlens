// Ce lecteur vérifie une trace fournie ; il ne reconstruit jamais le contexte de Mémoire.
function validateContext(context, current, check) {
  const valid = condition => check(condition, 'CONTEXT_INVALID');
  valid(context && typeof context.limits === 'string' && context.limits.trim());
  if (context.value === null) return;
  valid(context.provenance?.kind === 'input-trace' || context.provenance?.kind === 'operator');
  valid(typeof context.provenance.reference === 'string' && context.provenance.reference.trim());
  valid(Array.isArray(context.prefix) && context.prefix.length > 0);
  const prefix = validatePrefix(context.prefix, current, valid);
  validateValue(context.value, prefix, valid);
}
function validatePrefix(passages, current, valid) {
  const prefix = new Map();
  let previousEnd = 0;
  for (const passage of passages) {
    valid(passage && typeof passage.id === 'string' && passage.id !== current.id && !prefix.has(passage.id));
    valid(Number.isFinite(passage.startMs) && Number.isFinite(passage.endMs));
    valid(passage.startMs >= previousEnd && passage.endMs > passage.startMs && passage.endMs <= current.startMs);
    prefix.set(passage.id, passage);
    previousEnd = passage.endMs;
  }
  return prefix;
}
function keys(value, allowed, valid) {
  valid(value && typeof value === 'object' && !Array.isArray(value));
  valid(Object.keys(value).every(key => allowed.includes(key)));
}
function textFields(value, names, valid) {
  for (const name of names) if (value[name] !== undefined) valid(typeof value[name] === 'string');
}
function validatePassages(passages, prefix, valid) {
  valid(Array.isArray(passages));
  let previousEnd = 0;
  for (const passage of passages) {
    keys(passage, ['id', 'startMs', 'endMs', 'status', 'topic', 'summary', 'transcript', 'uncertainty'], valid);
    const original = prefix.get(passage.id);
    valid(original && passage.startMs === original.startMs && passage.endMs === original.endMs);
    valid(passage.startMs >= previousEnd);
    previousEnd = passage.endMs;
    textFields(passage, ['status', 'topic', 'summary', 'transcript', 'uncertainty'], valid);
  }
}
function validateAggregate(value, prefix, valid) {
  keys(value, ['text', 'firstId', 'lastId', 'startMs', 'endMs', 'pendingPassages', 'topic', 'summary', 'uncertainty'], valid);
  const first = prefix.get(value.firstId), last = prefix.get(value.lastId);
  valid(first && last && value.startMs === first.startMs && value.endMs === last.endMs && value.startMs < value.endMs);
  textFields(value, ['text', 'topic', 'summary', 'uncertainty'], valid);
  if (value.pendingPassages !== undefined) {
    validatePassages(value.pendingPassages, prefix, valid);
    valid(value.pendingPassages.every(passage => passage.startMs >= value.endMs));
  }
}
function validateValue(value, prefix, valid) {
  keys(value, ['kind', 'previousTopic', 'previousTopicSummary', 'activeTopic', 'recent', 'sessionOutline', 'limits'], valid);
  textFields(value, ['kind', 'previousTopic', 'limits'], valid);
  if (value.recent !== undefined) validatePassages(value.recent, prefix, valid);
  if (value.sessionOutline !== undefined) {
    valid(Array.isArray(value.sessionOutline));
    for (const item of value.sessionOutline) validateAggregate(item, prefix, valid);
  }
  if (value.activeTopic != null) {
    keys(value.activeTopic, ['firstId', 'startMs', 'recent'], valid);
    const first = prefix.get(value.activeTopic.firstId);
    valid(first && first.startMs === value.activeTopic.startMs);
    validatePassages(value.activeTopic.recent, prefix, valid);
    valid(value.activeTopic.recent.every(passage => passage.startMs >= first.startMs));
  }
  if (value.previousTopicSummary != null) {
    validateAggregate(value.previousTopicSummary, prefix, valid);
    valid(typeof value.previousTopicSummary.text === 'string' && value.previousTopicSummary.text.trim());
    valid(value.activeTopic && value.previousTopicSummary.firstId === value.activeTopic.firstId);
  }
}
module.exports = { validateContext };
