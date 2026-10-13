import { formatBytes, formatClock, formatDay, formatDuration, formatLimit, formatMinutes, plural } from './text.mjs';

/**
 * Pure view model of saved sessions, storage and media availability (tickets 02 and 03) for the Mac window,
 * and of the lines that sum up the loaded session (health, coverage, memory).
 * Every threshold, size and duration shown comes from the data: this module knows none.
 */
const finite = value => (Number.isFinite(value) ? value : null);

/** Why the video of a passage cannot be replayed, in the viewer's words (mediaReason of core/session.cjs). */
export function mediaNote(passage) {
  if (passage?.available) return null;
  const kept = ' Son résumé reste disponible.';
  return {
    'not-kept': { short: 'vidéo non conservée', long: `La vidéo de ce passage n’a pas été conservée : la session date d’avant la conservation des vidéos.${kept}` },
    missing: { short: 'vidéo introuvable', long: `La vidéo de ce passage est introuvable sur ce Mac.${kept}` },
    expired: { short: 'vidéo expirée', long: `La vidéo de ce passage a expiré : sa conservation était limitée.${kept}` },
    // The recorder received no image for this passage: its file is kept as it came, and nothing is replayed from it.
    unreadable: { short: 'vidéo illisible', long: 'La vidéo de ce passage n’a pas été enregistrée : son fichier ne contient aucune image. Ce qui a été analysé (images clés, paroles, résumé) reste disponible.' },
  }[passage?.mediaReason] || { short: 'vidéo indisponible', long: `La vidéo de ce passage n’est pas disponible.${kept}` };
}

/**
 * Same wording when something else already said the video is gone (a recap citation published before the session
 * state that marks its passage): never null, whatever the passage still claims.
 */
export function unavailableNote(passage) {
  return mediaNote({ ...passage, available: false });
}

/** How long the video is kept, in words, from whatever carries {retention, retentionMs}. */
export function retentionNote(source) {
  if (source?.retention === 'rolling' && finite(source.retentionMs) > 0) return `Vidéo conservée ${formatLimit(source.retentionMs)}, résumés gardés ensuite`;
  if (source?.retention === 'until-deleted' || (source && source.retention === undefined && source.retentionMs === null)) return 'Vidéo conservée jusqu’à la suppression de la session';
  return '';
}

/**
 * Retention of the loaded session, read from the session itself: its state, else the `current` entry of the
 * library when it is the same session. Never the setting of the host: an archive kept until deletion stays so
 * when it is opened on a host set to a rolling window. Empty when the session does not say.
 */
export function sessionRetention(state, library = null) {
  if (!state?.id) return '';
  const current = library?.current && typeof library.current === 'object' && library.current.id === state.id ? library.current : null;
  return retentionNote(state) || retentionNote(current);
}

/** Capture health of the loaded session in one line (floating bar, chat header), its tone, and the latest context. */
export function describeHealth(state, { recording = false } = {}) {
  let ready = 0, latest = null;
  for (const segment of state?.segments || []) if (segment.status === 'ready') { ready++; latest = segment; }
  const pending = state?.pending || 0, gaps = state?.gaps?.length || 0;
  const delay = Math.ceil(Math.max(0, (state?.capturedThroughMs || 0) - (state?.analyzedThroughMs || 0)) / 1000);
  return {
    label: !state?.id ? 'Prêt à observer' : state.readOnly ? 'Archive · lecture seule' : !recording ? 'Observation en pause'
      : gaps ? `${plural(gaps, 'passage')} sans analyse` : pending || delay ? `Analyse en cours${delay ? ` · ${delay} s de décalage` : ''}` : ready ? 'Analyse à jour' : 'Premières observations en cours…',
    tone: !recording ? 'idle' : gaps || pending || delay ? 'pending' : 'ready',
    context: latest?.observation?.summary || '',
  };
}

/** How far capture and analysis went, under the chat header. */
export function describeCoverage(state) {
  return `Capturé ${formatClock(state?.capturedThroughMs || 0)} · Analysé ${formatClock(state?.analyzedThroughMs || 0)} · ${state?.pending || 0} en attente · ${plural(state?.gaps?.length || 0, 'lacune')}`;
}

/** What the Mémoire view says of the loaded session: its passages, and how long its own video is kept. */
export function describeMemory(state, { library = null } = {}) {
  if (!state?.id) return '';
  let replayable = 0, analyzed = 0, gaps = 0;
  for (const segment of state.segments || []) { if (segment.available) replayable++; if (segment.status === 'ready') analyzed++; else if (['error', 'skipped', 'expired'].includes(segment.status)) gaps++; }
  const total = (state.segments?.length || 0) + (state.history?.length || 0);
  return [plural(total, 'passage'), `${replayable} à revoir`, plural(analyzed, 'analysé'), state.pending ? `${state.pending} en attente` : '', gaps ? `${gaps} sans analyse` : '', sessionRetention(state, library)].filter(Boolean).join(' · ');
}

/**
 * Disk state. Accepts the library shape ({sessions, bytes, freeBytes, minFreeBytes, warnFreeBytes, state}) and the
 * session shape ({state, freeBytes, minFreeBytes, sessionBytes, bytesPerMinute, remainingMinutes}).
 * The banner exists only when storage is low or blocked; it is persistent and says that nothing was deleted.
 */
export function describeStorage(storage, { capturing = false } = {}) {
  const state = ['ok', 'low', 'blocked'].includes(storage?.state) ? storage.state : 'unknown';
  const free = formatBytes(storage?.freeBytes), floor = formatBytes(storage?.minFreeBytes);
  const used = formatBytes(storage?.bytes ?? storage?.sessionBytes);
  const remaining = finite(storage?.remainingMinutes);
  const parts = [
    used ? `${storage?.bytes !== undefined ? 'Sessions' : 'Cette session'} : ${used}` : null,
    free ? `${free} libres sur ce Mac` : 'Espace libre non mesuré',
    state !== 'blocked' && remaining !== null ? `environ ${formatMinutes(remaining)} de capture possibles` : null,
  ].filter(Boolean);
  const banner = state === 'blocked' ? {
    state, title: 'Espace disque insuffisant',
    text: `${capturing ? 'La capture s’arrête' : 'La capture est arrêtée'} : ${free ? `${free} libres` : 'espace libre trop faible'}${floor ? `, ${floor} requis` : ''}. Rien n’a été supprimé. Supprime une session ou libère de l’espace, puis reprends.`,
  } : state === 'low' ? {
    state, title: 'Espace disque faible',
    text: `${free ? `${free} libres` : 'Peu d’espace libre'}${floor ? ` : la capture s’arrêtera sous ${floor}` : ''}. Rien n’est supprimé automatiquement.`,
  } : null;
  return { state, line: parts.join(' · '), banner, blocked: state === 'blocked' };
}

function mediaBadge(summary) {
  const stored = summary.media?.stored || 0, missing = summary.media?.missing || 0;
  if (summary.state === 'unreadable') return { key: 'unreadable', label: 'Illisible', hint: 'Cette archive ne peut pas être lue. Elle peut être supprimée.' };
  if (!summary.passages) return { key: 'empty', label: 'Vide', hint: 'Aucun passage enregistré.' };
  if (!stored && summary.legacy) return { key: 'text', label: 'Texte seul', hint: 'Session d’avant la conservation des vidéos : résumés et réponses seulement.' };
  if (!stored) return { key: 'none', label: 'Sans vidéo', hint: 'Aucune vidéo à revoir pour cette session. Les résumés restent lisibles.' };
  if (missing) return { key: 'partial', label: 'Vidéo partielle', hint: `${plural(missing, 'passage')} sans vidéo.` };
  return { key: 'complete', label: 'Vidéo complète', hint: 'Tous les passages peuvent être revus.' };
}

/**
 * @param {{current?:string|{id:string}|null,sessions?:object[],storage?:object}|null} library result of the bridge sessions()
 * @param {{capturing?:boolean,readOnly?:boolean,timeZone?:string}} context capturing: a capture is running in the loaded session
 */
export function describeSessions(library, { capturing = false, readOnly = false, timeZone } = {}) {
  const loaded = library?.current && typeof library.current === 'object' ? library.current : null;
  const currentId = typeof library?.current === 'string' ? library.current : loaded?.id ?? null;
  // The host knows best what it is doing; the renderer's own view is the fallback when a row says nothing.
  capturing = Boolean(loaded?.accepting ?? capturing);
  readOnly = Boolean(loaded?.readOnly ?? readOnly);
  const rows = (Array.isArray(library?.sessions) ? library.sessions : []).filter(session => session && typeof session.id === 'string').map(session => {
    const current = Boolean(session.current ?? session.id === currentId), live = current && Boolean(session.capturing ?? capturing), unreadable = session.state === 'unreadable';
    const archived = current && Boolean(session.readOnly ?? readOnly);
    const media = mediaBadge(session);
    const status = live ? 'En cours de capture' : current ? (archived ? 'Ouverte · lecture seule' : 'Ouverte · en pause')
      : session.state === 'interrupted' ? 'Interrompue' : unreadable ? 'Illisible' : null;
    return {
      id: session.id, title: session.title || 'Session sans titre', topic: session.firstTopic || '',
      dateLabel: formatDay(session.updatedAt ?? session.createdAt, { timeZone }),
      meta: [formatDuration(session.elapsedMs), plural(session.passages || 0, 'passage'), formatBytes(session.media?.bytes)].filter(Boolean).join(' · '),
      media, status, current, live,
      statusHint: session.state === 'interrupted' ? 'Fermée sans arrêt propre : ce qui était enregistré reste lisible.' : null,
      // Opening never starts a capture, and a running capture is never swapped for another session.
      canOpen: !unreadable && !current && !capturing,
      openBlockedReason: unreadable ? 'Archive illisible.' : current ? 'Session déjà ouverte.' : capturing ? 'Mets la capture en pause avant d’ouvrir une autre session.' : null,
      canResume: archived,
      canDelete: !live,
      deleteBlockedReason: live ? 'Mets la capture en pause avant de supprimer cette session.' : null,
      passages: session.passages || 0, bytes: session.media?.bytes ?? null, stored: session.media?.stored || 0,
    };
  });
  return {
    currentId, rows, storage: describeStorage(library?.storage, { capturing }),
    empty: rows.length ? null : 'Aucune session enregistrée. La prochaine vidéo observée apparaîtra ici et restera consultable jusqu’à sa suppression.',
  };
}

/** Confirmation text of a deletion: what goes, and what stays. */
export function describeDeletion(row) {
  const video = row?.stored ? `la vidéo et le son de ${plural(row.stored, 'passage')}${formatBytes(row.bytes) ? ` (${formatBytes(row.bytes)})` : ''}, ` : '';
  return {
    title: 'Supprimer cette session ?',
    subject: [row?.title, row?.meta].filter(Boolean).join(' · '),
    removed: `Seront effacés de ce Mac : ${video}les transcriptions, le résumé, les questions et leurs réponses, les résultats de surveillance.`,
    kept: 'Ne seront pas effacés : les moments gardés et les anciennes vérifications.',
    warning: row?.current ? 'Cette session est ouverte : elle sera fermée.' : null,
    confirmLabel: 'Supprimer définitivement',
  };
}

/** Banner of a reopened session. Null for a live or paused session. */
export function describeArchive(state, { title = '' } = {}) {
  if (!state?.id || !state.readOnly) return null;
  const end = finite(state.elapsedMs) ?? finite(state.capturedThroughMs) ?? 0;
  return {
    label: 'Archive · lecture seule',
    text: [title || state.title, end ? `enregistrée jusqu’à ${formatClock(end)}` : null].filter(Boolean).join(' · ') || 'Session enregistrée',
    hint: 'Rien n’est capturé. Tu peux relire, chercher et poser des questions.',
    resumeLabel: 'Reprendre la capture',
    resumeText: `Les nouveaux passages s’ajouteront à partir de ${formatClock(end)}. La session ne sera plus en lecture seule.`,
    newLabel: 'Nouvelle session',
  };
}
