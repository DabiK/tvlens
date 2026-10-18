const { sessionRows: projectSessionRows } = require('../runtime/session-rows.cjs');

function sessionRows(listed, loaded, now) {
  const id = loaded?.runtime.watch.id || null;
  const watch = loaded?.runtime.watch;
  return projectSessionRows(listed, loaded && !loaded.runtime.readOnly ? watch.snapshot() : null, {
    current: loaded ? {
      id, title: loaded.title, elapsedMs: watch.now(), readOnly: loaded.runtime.readOnly, accepting: watch.accepting,
      retention: 'until-deleted', retentionMs: null,
    } : null,
    capturing: watch?.accepting ?? false,
    fallback: loaded ? { host: 'mac', createdAt: loaded.startedAt, updatedAt: now } : {},
    live: loaded ? { title: loaded.title } : {},
  });
}

module.exports = { sessionRows };
