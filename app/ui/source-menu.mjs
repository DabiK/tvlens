import { cleanError } from './text.mjs';

// macOS applies a screen access granted while the app runs only once it is reopened.
const SCREEN_ACCESS = 'autorise l’app dans Réglages Système › Confidentialité et sécurité › Enregistrement de l’écran, '
  + 'puis quitte-la et rouvre-la.';

/**
 * What the source menu, the status and the notice say once the capture sources are listed, or once their listing fails.
 * The menu never keeps its loading wording; a missing screen access goes to the notice, the line every view shows.
 */
export function describeSourceListing({ result, error }) {
  if (error) {
    return {
      placeholder: 'Fenêtres inaccessibles',
      status: `Capture indisponible : ${cleanError(error)}`,
      notice: `TVLens ne peut pas lister les fenêtres : ${SCREEN_ACCESS}`,
    };
  }
  if (result.permission !== 'granted') {
    return {
      placeholder: 'Écran non autorisé',
      status: `Autorisation écran : ${result.permission} · Vérifie les autorisations`,
      notice: `TVLens n’a pas accès à l’écran : ${SCREEN_ACCESS}`,
    };
  }
  if (result.error) return {
    placeholder: 'Fenêtres inaccessibles', status: 'Écran autorisé · Capture indisponible',
    notice: 'L’accès à l’écran est autorisé, mais la capture reste indisponible. Quitte TVLens, puis rouvre-la depuis Applications.',
  };
  if (!result.sources.length) return { placeholder: 'Aucune fenêtre trouvée', status: 'Écran autorisé · Aucune source', notice: '' };
  return { placeholder: 'Choisir une fenêtre ou un écran…', status: 'Écran autorisé · Choisis une source', notice: '' };
}

/** The picker only selects; the existing capture controller remains the sole owner of acquisition. */
export function bindSourcePicker(dependencies) {
  return new SourcePicker(dependencies);
}

class SourcePicker {
  request = 0;
  loading = false;
  result = null;

  constructor(dependencies) {
    Object.assign(this, dependencies);
    this.dialog = this.get('source-picker-dialog');
    this.get('choose-source').onclick = () => this.open();
    this.get('source-picker-refresh').onclick = () => this.refresh();
    this.get('source-picker-close').onclick = () => this.dialog.close();
    this.dialog.onclick = event => {
      if (event.target !== this.dialog) return;
      const bounds = this.dialog.getBoundingClientRect();
      const outside = event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (outside) this.dialog.close();
    };
    this.dialog.onclose = () => {
      this.request++;
      this.loading = false;
      this.update();
    };
  }

  async open() {
    if (this.locked()) return;
    if (!this.dialog.open) this.dialog.showModal();
    await this.refresh();
  }

  async refresh() {
    if (this.locked() || this.loading || !this.dialog.open) return;
    const request = ++this.request;
    this.loading = true;
    this.result = null;
    this.get('source-picker-grid').replaceChildren();
    this.get('source-picker-status').textContent = 'Chargement des fenêtres et écrans…';
    this.update();
    try {
      const result = await this.load({ previews: true });
      if (request !== this.request || !this.dialog.open) return;
      this.result = result;
      const description = describeSourceListing({ result });
      this.get('source-picker-status').textContent = description.notice || description.placeholder;
      this.get('source-picker-grid').replaceChildren(...result.sources.map(source => this.card(source)));
    } catch (error) {
      if (request !== this.request || !this.dialog.open) return;
      this.get('source-picker-status').textContent = describeSourceListing({ error }).notice;
    } finally {
      if (request === this.request) {
        this.loading = false;
        this.update();
      }
    }
  }

  card(source) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'source-choice';
    button.setAttribute('aria-pressed', String(source.id === this.selected().id));
    const preview = document.createElement('span');
    preview.className = 'source-choice-preview';
    const fallback = document.createElement('span');
    fallback.textContent = 'Aperçu indisponible';
    preview.append(fallback);
    if (source.thumbnail) {
      const image = document.createElement('img');
      image.alt = '';
      image.src = source.thumbnail;
      fallback.hidden = true;
      image.onerror = () => { image.hidden = true; fallback.hidden = false; };
      preview.append(image);
    }
    const label = document.createElement('span');
    label.className = 'source-choice-name';
    label.textContent = source.name;
    button.append(preview, label);
    button.onclick = () => {
      if (!this.dialog.open || this.locked() || this.loading || this.result?.permission !== 'granted') return;
      this.choose(source.id, this.result);
      this.dialog.close();
    };
    return button;
  }

  update() {
    const locked = this.locked();
    const button = this.get('choose-source');
    button.disabled = locked;
    this.get('refresh').disabled = locked || this.loading;
    button.textContent = this.selected().name || 'Choisir une fenêtre ou un écran…';
    button.title = locked ? 'Mets la capture en pause avant de changer de source.' : 'Choisir une fenêtre ou un écran avec aperçu';
    this.get('source-picker-refresh').disabled = locked || this.loading;
    for (const choice of this.get('source-picker-grid').querySelectorAll('.source-choice')) {
      choice.disabled = locked || this.loading || this.result?.permission !== 'granted';
    }
  }
}
