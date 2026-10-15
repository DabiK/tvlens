function sessionRows(listed, loaded, now) {
  const id = loaded?.runtime.watch.id || null;
  const sessions = [...listed];
  if (loaded && !loaded.runtime.readOnly) {
    const state = loaded.runtime.watch.snapshot();
    const at = sessions.findIndex(s => s.id === id);
    const stored = state.segments.filter(s => s.available).length;
    const row = {
      ...(at < 0 ? {
        id, firstTopic: null, host: 'mac', createdAt: loaded.startedAt, updatedAt: now, closedAt: null, legacy: false,
      } : sessions[at]),
      title: loaded.title, state: 'live', elapsedMs: state.elapsedMs, passages: state.coverage.passages,
      media: { stored, missing: state.coverage.passages - stored, bytes: state.storage?.sessionBytes ?? 0 },
    };
    if (at < 0) sessions.unshift(row);
    else sessions[at] = row;
  }
  // The retention of the loaded session, not the setting of this host: an archive kept until deletion stays so here.
  return {
    current: loaded ? {
      id, title: loaded.title, elapsedMs: loaded.runtime.watch.now(), readOnly: loaded.runtime.readOnly,
      accepting: loaded.runtime.watch.accepting,
      retention: Number.isFinite(loaded.runtime.watch.retentionMs) ? 'rolling' : 'until-deleted',
      retentionMs: Number.isFinite(loaded.runtime.watch.retentionMs) ? loaded.runtime.watch.retentionMs : null,
    } : null,
    sessions: sessions.map(s => ({
      ...s, current: s.id === id, readOnly: s.id === id && loaded.runtime.readOnly,
      capturing: s.id === id && loaded.runtime.watch.accepting,
    })),
  };
}

module.exports = { sessionRows };
