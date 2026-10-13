import { element as el, formatTime } from './format.js';
import { unavailableNote } from './sessions-view.mjs';
import { agreeText, plural } from './text.mjs';

/** Renders recap snapshots; all playback and notification effects are injected. */
export function renderRecapView({ state, session, targets, replay, notice }) {
  const sameSession = Boolean(state?.sessionId && state.sessionId === session?.id);
  // One lookup per render: a film has hundreds of passages and a chapter cites several of them.
  const passages = new Map(sameSession ? [...(session.history || []), ...session.segments].map(passage => [passage.id, passage]) : []);
  function recapSource(source) {
    if (!sameSession || source.available === false) return null;
    const segment = passages.get(source.id);
    return segment?.available ? segment : null;
  }
  // Says why a passage cannot be replayed (not kept, missing, expired) instead of always blaming expiry. The recap
  // is pushed before the session state: its source may be gone while the passage held here still says available.
  const unavailable = source => unavailableNote(passages.get(source.id));
  const chapters = state?.chapters || [];
  const hasContent = Boolean(state?.overview || chapters.length);
  let statusText = !session?.id && !hasContent ? 'Lance une vidéo : son résumé et ses chapitres apparaîtront ici.' : 'Le résumé se construit au fil des passages analysés.';
  if (state?.status === 'updating') statusText = hasContent ? 'Mise à jour en cours · Le résumé précédent reste disponible.' : 'Préparation du premier résumé…';
  else if (state?.status === 'error') statusText = hasContent ? 'Mise à jour indisponible · Le dernier résumé reste disponible.' : 'Le résumé est momentanément indisponible.';
  else if (hasContent) statusText = 'Résumé automatique des passages analysés.';
  if (state?.pendingCount) statusText += ` ${plural(state.pendingCount, 'passage')} en attente d’intégration au résumé.`;
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
          else notice(unavailable(firstPlayable).long);
        };
        heading.append(button);
      } else heading.textContent = title;
      card.append(heading, el('p', 'recap-summary', chapter.summary || ''));
      const references = el('div', 'recap-sources');
      const extraSources = el('details', 'recap-extra-sources');
      extraSources.dataset.chapterId = chapter.id;
      extraSources.open = expandedSources.has(chapter.id);
      extraSources.append(el('summary', '', plural(Math.max(0, sources.length - 3), 'autre passage', 'autres passages')));
      const extraReferences = el('div', 'recap-sources');
      for (const [sourceIndex, source] of sources.entries()) {
        const available = Boolean(recapSource(source));
        const button = el('button', 'reference recap-source', `${formatTime(source.startMs)}${available ? ' ↗' : ' · résumé'}`);
        button.disabled = !available;
        button.title = available ? `Revoir le passage de ${formatTime(source.startMs)} à ${formatTime(source.endMs)}` : `Résumé conservé · ${unavailable(source).short}`;
        button.onclick = () => {
          const segment = recapSource(source);
          if (segment) replay(source.id, Math.max(0, (source.startMs - segment.startMs) / 1000));
          else notice(unavailable(source).long);
        };
        (sourceIndex < 3 ? references : extraReferences).append(button);
      }
      if (sources.length > 3) { extraSources.append(extraReferences); references.append(extraSources); }
      if (!firstPlayable) card.append(el('small', 'hint recap-expired', `Résumé conservé · ${sources.length ? unavailable(sources[0]).short : 'vidéo indisponible'}`));
      card.append(references); rail.append(card);
    }
    if (chapters.length) nodes.push(rail);
    // Sentences of the core, some still written "N passage(s)": agreed here, wording untouched.
    if (state?.limits?.length) nodes.push(el('p', 'hint recap-limits', agreeText(state.limits.join(' '))));
    target.replaceChildren(...nodes);
  }
}
