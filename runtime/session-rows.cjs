function liveRow(summary, snapshot, live) {
  const stored = snapshot.segments.filter(segment => segment.available).length;
  return {
    ...summary,
    ...(live.title === undefined ? {} : { title: live.title }),
    state: "live",
    elapsedMs: live.elapsedMs ?? snapshot.elapsedMs,
    passages: snapshot.coverage.passages,
    media: {
      stored,
      missing: snapshot.coverage.passages - stored,
      bytes: live.sessionBytes ?? snapshot.storage?.sessionBytes ?? 0,
    },
  };
}

// Les hôtes fournissent leurs métadonnées et leur présentation ; seuls les chiffres et flags sont projetés ici.
function sessionRows(listed, snapshot, { current = null, capturing = false, fallback = {}, live = {} } = {}) {
  const id = current?.id ?? null;
  const sessions = [...listed];
  if (current && !current.readOnly && snapshot) {
    const at = sessions.findIndex(row => row.id === id);
    const summary = at < 0 ? { id, firstTopic: null, closedAt: null, legacy: false, ...fallback } : sessions[at];
    const row = liveRow(summary, snapshot, live);
    if (at < 0) sessions.unshift(row);
    else sessions[at] = row;
  }
  return {
    current: current ? { ...current } : null,
    sessions: sessions.map(row => ({
      ...row,
      current: row.id === id,
      readOnly: row.id === id && current.readOnly,
      capturing: row.id === id && capturing,
    })),
  };
}

module.exports = { sessionRows };
