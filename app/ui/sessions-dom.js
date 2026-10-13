import { element as el, action } from './format.js';

/** One row of the Sessions panel, from the view model of sessions-view.mjs. Text only, effects by data-action. */
export function sessionEntry(row) {
  return { id: row.id, signature: JSON.stringify(row), render: () => {
    const node = el('article', 'session-row');
    node.dataset.id = row.id;
    if (row.current) node.dataset.current = 'true';
    const main = el('div', 'session-main');
    main.append(el('strong', '', row.title), el('small', '', [row.meta, row.dateLabel && `modifiée le ${row.dateLabel}`].filter(Boolean).join(' · ')));
    if (row.topic) main.append(el('small', 'hint', row.topic));
    const badges = el('div', 'session-badges'), media = el('span', 'state-chip', row.media.label);
    media.dataset.state = row.media.key; media.title = row.media.hint;
    badges.append(media);
    if (row.status) { const status = el('span', 'state-chip', row.status); status.dataset.state = row.live ? 'live' : 'status'; if (row.statusHint) status.title = row.statusHint; badges.append(status); }
    const actions = el('div', 'session-actions');
    if (row.canResume) actions.append(action('secondary', 'Reprendre la capture', 'session-resume'));
    if (!row.current) { const open = action('secondary', 'Ouvrir', 'session-open', { id: row.id }); open.disabled = !row.canOpen; if (row.openBlockedReason) open.title = row.openBlockedReason; actions.append(open); }
    const remove = action('link danger', 'Supprimer', 'session-delete', { id: row.id });
    remove.disabled = !row.canDelete; if (row.deleteBlockedReason) remove.title = row.deleteBlockedReason;
    actions.append(remove);
    node.append(main, badges, actions);
    return node;
  } };
}
