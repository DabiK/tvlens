import { element as el, formatTime } from './format.js';

/** Renders recap snapshots; all playback and notification effects are injected. */
export function renderRecapView({ state, session, targets, replay, notice }) {
  function recapSource(source) {
    if (!state?.sessionId || state.sessionId !== session?.id || source.available === false) return null;
    return session.segments.find(segment => segment.id === source.id && segment.available);
  }
  const chapters = state?.chapters || [];
  const hasContent = Boolean(state?.overview || chapters.length);
  let statusText = !session?.id && !hasContent ? 'Lance une vidéo : son résumé et ses chapitres apparaîtront ici.' : 'Le résumé se construit au fil des passages analysés.';
  if (state?.status === 'updating') statusText = hasContent ? 'Mise à jour en cours · Le résumé précédent reste disponible.' : 'Préparation du premier résumé…';
  else if (state?.status === 'error') statusText = hasContent ? 'Mise à jour indisponible · Le dernier résumé reste disponible.' : 'Le résumé est momentanément indisponible.';
  else if (hasContent) statusText = 'Résumé automatique des passages analysés.';
  if (state?.pendingCount) statusText += ` ${state.pendingCount} passage${state.pendingCount > 1 ? 's' : ''} en attente d’intégration au résumé.`;
  for (const [target, expanded] of targets) {
    const expandedSources = new Set([...target.querySelectorAll('.recap-extra-sources[open]')].map(node => node.dataset.chapterId));
    const statusNode = el('p', 'hint recap-status', statusText);
    statusNode.setAttribute('role', 'status');
    const nodes = [statusNode];
    if (state?.error) nodes.push(el('p', 'recap-error', state.error));
    if (state?.overview) nodes.push(el('p', 'recap-overview', state.overview));
    const rail = el('div', 'recap-chapters');
    for (const chapter of expanded ? chapters : chapters.slice(-3)) {
      const card = el('article', 'recap-chapter');
      const sources = chapter.sources || [];
      const firstPlayable = sources.find(source => recapSource(source));
      const title = `${formatTime(chapter.startMs)} · ${chapter.title || 'Chapitre'}`;
      const heading = el('h3');
      if (firstPlayable) {
        const button = el('button', 'recap-chapter-link', title + (firstPlayable.startMs > chapter.startMs ? ` · Revoir dès ${formatTime(firstPlayable.startMs)} ↗` : ' ↗'));
        button.title = `Revoir le premier passage disponible à ${formatTime(firstPlayable.startMs)}`;
        button.onclick = () => {
          const segment = recapSource(firstPlayable);
          if (segment) replay(firstPlayable.id, Math.max(0, (firstPlayable.startMs - segment.startMs) / 1000));
          else notice('La vidéo de ce passage a expiré. Son résumé reste disponible.');
        };
        heading.append(button);
      } else heading.textContent = title;
      card.append(heading, el('p', 'recap-summary', chapter.summary || ''));
      const references = el('div', 'recap-sources');
      const extraSources = el('details', 'recap-extra-sources');
      extraSources.dataset.chapterId = chapter.id;
      extraSources.open = expandedSources.has(chapter.id);
      extraSources.append(el('summary', '', `${Math.max(0, sources.length - 3)} autres passages`));
      const extraReferences = el('div', 'recap-sources');
      for (const [sourceIndex, source] of sources.entries()) {
        const available = Boolean(recapSource(source));
        const button = el('button', 'reference recap-source', `${formatTime(source.startMs)}${available ? ' ↗' : ' · résumé'}`);
        button.disabled = !available;
        button.title = available ? `Revoir le passage de ${formatTime(source.startMs)} à ${formatTime(source.endMs)}` : 'Vidéo expirée · Résumé conservé';
        button.onclick = () => {
          const segment = recapSource(source);
          if (segment) replay(source.id, Math.max(0, (source.startMs - segment.startMs) / 1000));
          else notice('La vidéo de ce passage a expiré. Son résumé reste disponible.');
        };
        (sourceIndex < 3 ? references : extraReferences).append(button);
      }
      if (sources.length > 3) { extraSources.append(extraReferences); references.append(extraSources); }
      if (!firstPlayable) card.append(el('small', 'hint recap-expired', 'Résumé conservé · Vidéo indisponible'));
      card.append(references); rail.append(card);
    }
    if (chapters.length) nodes.push(rail);
    if (state?.limits?.length) nodes.push(el('p', 'hint recap-limits', state.limits.join(' ')));
    target.replaceChildren(...nodes);
  }
}
