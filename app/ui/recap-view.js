import { element as el, formatTime } from './format.js';
import { unavailableNote } from './sessions-view.mjs';
import { agreeText, plural } from './text.mjs';

const carousels = new WeakMap();

/** Renders recap snapshots; all playback and notification effects are injected. */
export function renderRecapView({ state, session, targets, replay, notice, preview = () => null, askChapter }) {
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
  // A ceiling, not an outage: waiting brings no update back.
  else if (state?.status === 'capacity') statusText = hasContent ? 'Session trop longue pour la synthèse automatique · Le résumé n’est plus mis à jour.' : 'Session trop longue pour la synthèse automatique · Aucun résumé n’est produit.';
  else if (hasContent) statusText = 'Résumé automatique des passages analysés.';
  if (state?.pendingCount) statusText += ` ${plural(state.pendingCount, 'passage')} en attente d’intégration au résumé.`;
  for (const [target, expanded] of targets) {
    const expandedSources = new Set([...target.querySelectorAll('.recap-extra-sources[open]')].map(node => node.dataset.chapterId));
    const statusNode = el('p', 'hint recap-status', statusText);
    statusNode.setAttribute('role', 'status');
    const nodes = [statusNode];
    if (state?.error) nodes.push(el('p', 'recap-error', state.error));
    if (state?.overview) nodes.push(recapOverview(state.overview, expanded, expandedSources));
    const rail = el('div', 'recap-chapters');
    for (const chapter of chapters) {
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
      if (expanded) card.append(references);
      else decorateChapter(card, { chapter, sources, recapSource, preview, references, expandedSources, askChapter });
      rail.append(card);
    }
    if (chapters.length) nodes.push(rail);
    // Sentences of the core, some still written "N passage(s)": agreed here, wording untouched.
    if (state?.limits?.length) nodes.push(el('p', 'hint recap-limits', agreeText(state.limits.join(' '))));
    mountRecap(target, nodes, expanded ? null : rail, state?.sessionId);
  }
}

/** A compact home card keeps the full summary and all replay references one click away. */
function decorateChapter(card, { chapter, sources, recapSource, preview, references, expandedSources, askChapter }) {
  card.classList.add('home-chapter');
  const cover = el('div', 'chapter-cover');
  const imageSource = sources.find(source => {
    const passage = recapSource(source);
    return passage && passage.hasImages !== false && preview(source.id);
  });
  const fallback = el('span', 'chapter-cover-empty', 'Aperçu indisponible');
  cover.append(fallback);
  if (imageSource) {
    const image = el('img', 'chapter-image');
    image.alt = '';
    image.loading = 'lazy';
    image.src = preview(imageSource.id);
    image.onerror = () => { image.hidden = true; fallback.hidden = false; };
    fallback.hidden = true;
    cover.append(image);
  }
  cover.append(el('span', 'chapter-time', `${formatTime(chapter.startMs)} – ${formatTime(chapter.endMs)}`));
  card.insertBefore(cover, card.firstChild);
  const details = el('details', 'recap-extra-sources chapter-details');
  details.dataset.chapterId = `detail:${chapter.id}`;
  details.open = expandedSources.has(details.dataset.chapterId);
  details.append(el('summary', '', 'Explorer les passages ↗'), el('p', 'recap-summary', chapter.summary || ''), references);
  card.append(details);
  if (askChapter) {
    const ask = el('button', 'chapter-ask', 'Questionner');
    ask.onclick = () => askChapter(chapter);
    card.append(ask);
  }
}

function recapOverview(text, expanded, expandedSources) {
  const overview = el(expanded ? 'p' : 'span', 'recap-overview', text);
  if (expanded) return overview;
  const details = el('details', 'recap-extra-sources home-overview');
  details.dataset.chapterId = 'overview';
  details.open = expandedSources.has('overview');
  const summary = el('summary');
  const label = el('span', 'overview-toggle', details.open ? 'Réduire' : 'Lire la suite');
  details.ontoggle = () => { label.textContent = details.open ? 'Réduire' : 'Lire la suite'; };
  summary.append(overview, label);
  details.append(summary);
  return details;
}

function mountRecap(target, nodes, rail, sessionId) {
  const previous = carousels.get(target);
  if (previous?.rail.clientWidth) previous.position = previous.rail.scrollLeft;
  const position = previous && previous.sessionId === sessionId ? previous.position : 0;
  previous?.observer?.disconnect();
  carousels.delete(target);
  target.replaceChildren(...nodes);
  if (!rail?.children.length) return;
  const controls = el('div', 'chapter-carousel-controls');
  controls.append(el('span', 'hint', `${plural(rail.children.length, 'chapitre')} · Du début à maintenant`));
  const back = el('button', 'secondary chapter-previous', '←');
  const next = el('button', 'secondary chapter-next', '→');
  back.setAttribute('aria-label', 'Voir le chapitre précédent');
  next.setAttribute('aria-label', 'Voir le chapitre suivant');
  controls.append(back, next);
  target.insertBefore(controls, rail);
  rail.tabIndex = 0;
  rail.setAttribute('role', 'region');
  rail.setAttribute('aria-label', 'Chapitres de la session, défilement horizontal');
  const entry = { rail, sessionId, position, observer: null };
  let restorePosition = true;
  const update = () => {
    // Hidden panels have no width: wait for their first layout before restoring their position.
    if (restorePosition && rail.clientWidth) {
      rail.scrollLeft = position || 0;
      restorePosition = false;
    }
    if (rail.clientWidth) entry.position = rail.scrollLeft;
    back.disabled = rail.scrollLeft <= 1;
    next.disabled = rail.scrollWidth <= rail.clientWidth + rail.scrollLeft + 1;
  };
  back.onclick = () => moveChapter(rail, -1, update);
  next.onclick = () => moveChapter(rail, 1, update);
  rail.onscroll = update;
  rail.onfocus = update;
  rail.onkeydown = event => {
    if (event.target !== rail || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') rail.scrollLeft = 0;
    else if (event.key === 'End') rail.scrollLeft = rail.scrollWidth;
    else moveChapter(rail, event.key === 'ArrowLeft' ? -1 : 1, update);
    update();
  };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
  observer?.observe(rail);
  entry.observer = observer;
  carousels.set(target, entry);
  update();
}

function moveChapter(rail, direction, update) {
  const origin = rail.children[0].offsetLeft;
  const offsets = [...rail.children].map(card => card.offsetLeft - origin);
  const maximum = Math.max(0, rail.scrollWidth - rail.clientWidth);
  let destination;
  if (direction > 0) destination = offsets.find(offset => offset > rail.scrollLeft + 1) ?? maximum;
  else destination = offsets.reverse().find(offset => offset < rail.scrollLeft - 1) ?? 0;
  rail.scrollLeft = Math.min(maximum, Math.max(0, destination));
  update();
}
