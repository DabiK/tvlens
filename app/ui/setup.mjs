import { element as el } from './format.js';
import { setupRows, setupSummary } from './setup-view.mjs';
import { speechModelPicker } from './speech-model-picker.mjs';

export function bindSetup({ bridge, get, refreshSources, prepare, clipboard = navigator.clipboard, focusTarget = globalThis }) {
  const dialog = get('setup-dialog');
  let report, busy = false;
  const button = (label, run) => {
    const node = el('button', 'secondary', label);
    node.type = 'button';
    node.onclick = () => perform(run);
    return node;
  };
  async function perform(run, message = 'Vérification des prérequis…') {
    if (busy) return;
    busy = true;
    get('setup-state').textContent = message;
    for (const node of dialog.querySelectorAll('button, select')) node.disabled = true;
    try { const value = await run(); if (value?.checks) paint(value); }
    catch (error) { get('setup-state').textContent = error.message || 'Opération indisponible. Réessaie.'; }
    finally {
      busy = false;
      for (const node of dialog.querySelectorAll('button, select')) node.disabled = false;
      get('setup-finish').disabled = !report?.canFinish;
    }
  }
  function paint(value) {
    report = value;
    const rows = setupRows(value);
    get('setup-checks').replaceChildren(...rows.map(item => setupRow(item, { button, bridge, get, clipboard })));
    get('setup-progress').textContent = `${rows.filter(item => item.good).length} / ${rows.length} prérequis vérifiés`;
    get('setup-state').textContent = value.problem || setupSummary(value);
    get('setup-finish').disabled = !value.canFinish;
    get('setup-finish').textContent = value.canFinish && !value.ready ? 'Continuer sans capture' : 'Commencer';
    get('setup-quit').hidden = !value.restartRequired;
    get('setup-banner').hidden = value.ready && !value.restartRequired;
    let banner = 'Installation à compléter';
    if (value.canFinish) banner = 'Capture indisponible · autorisation écran à vérifier';
    if (value.restartRequired) banner = 'Configuration enregistrée · réouverture nécessaire';
    get('setup-banner-text').textContent = banner;
  }
  async function open() {
    await prepare();
    if (!dialog.open) dialog.showModal();
    await perform(() => bridge.setupStatus());
  }
  function close() { if (!busy) dialog.close(); }
  get('setup-open').onclick = get('setup-open-banner').onclick = () => open();
  get('setup-later').onclick = close;
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => refreshSources());
  focusTarget.addEventListener('focus', () => {
    if (dialog.open && !busy) void perform(() => bridge.setupStatus());
  });
  get('setup-refresh').onclick = () => perform(() => bridge.setupStatus());
  get('setup-quit').onclick = () => perform(() => bridge.setupAction('quit'));
  get('setup-finish').onclick = () => perform(async () => {
    const value = await bridge.setupAction('finish');
    dialog.close();
    return value;
  });
  get('setup-homebrew').onclick = () => perform(() => bridge.setupAction('homebrew'));
  get('setup-codex-guide').onclick = () => perform(() => bridge.setupAction('codex'));
  return { open, async start() {
    try {
      paint(await bridge.setupStatus());
      if (report.firstLaunch) { await prepare(); dialog.showModal(); }
      else await refreshSources();
    } catch {
      get('setup-banner').hidden = false;
      get('setup-banner-text').textContent = 'Installation non vérifiée';
      await refreshSources();
    }
  } };
}

function setupRow(item, { button, bridge, get, clipboard }) {
  const node = el('li', 'setup-check');
  node.dataset.state = item.good ? 'ready' : 'pending';
  const heading = el('div', 'setup-check-heading');
  heading.append(el('h3', '', item.title), el('span', 'setup-chip', item.label));
  node.append(heading, el('p', 'setup-detail', item.detail));
  if (!item.good) node.append(el('p', 'hint', item.required ? 'Indispensable à l’observation' : 'Pour cette fonction complémentaire'));
  const actions = el('div', 'setup-actions');
  if (item.id === 'screen') {
    actions.append(button('Ouvrir les autorisations', () => bridge.setupAction('permissions')));
    node.append(el('p', 'hint', 'Le son se confirme à la première capture. Si macOS le demande, quitte puis rouvre TVLens.'));
  } else {
    actions.append(button('Choisir un autre emplacement…', () => bridge.setupChoose(item.id)));
  }
  if (item.id === 'whisperModel' && item.speech) node.append(speechModelPicker(item.speech, { button, bridge, get }));
  node.append(actions);
  if (item.path || item.command) {
    const details = el('details', 'setup-details');
    details.append(el('summary', '', item.good ? 'Emplacement et configuration' : 'Comment terminer cette étape'));
    if (item.path) details.append(el('p', 'setup-path', item.path));
    if (item.command) {
      details.append(el('p', 'hint', 'Dans Terminal, exécute cette commande, puis clique sur « Vérifier à nouveau ».'));
      details.append(el('code', 'setup-command', item.command), button('Copier la commande', async () => {
        await clipboard.writeText(item.command);
        get('setup-state').textContent = 'Commande copiée. Colle-la dans Terminal pour l’exécuter.';
      }));
    }
    if (!item.good) details.open = true;
    node.append(details);
  }
  return node;
}
