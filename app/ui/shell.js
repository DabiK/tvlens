import { setIcon } from './icons.js';
/** Presentation adapter. Owns navigation and window chrome, never session data or inference. */
export class ViewingShell {
  constructor(root = document) {
    this.root = root;
    this.get = id => root.getElementById(id);
    this.get('nav-live').onclick = () => this.show('direct');
    this.get('nav-memory').onclick = () => this.show('memory');
    // Keep one conversation DOM tree in both modes so focus, drafts and history survive.
    const conversation = this.get('float-conversation');
    conversation.insertBefore(root.querySelector('.quick-actions'), this.get('ask-form'));
    this.get('float-menu-toggle').onclick = () => this.get('float-menu').togglePopover();
    this.get('float-menu').addEventListener('toggle', event => {
      this.get('float-menu-toggle').setAttribute('aria-expanded', String(event.newState === 'open'));
    });
    this.get('float-menu').addEventListener('click', event => {
      if (event.target.closest('button')) this.get('float-menu').hidePopover();
    });
    setIcon(this.get('float-chat'), 'chat', 'Demander');
    this.bookmarkFeedback(false);
    this.show('direct');
  }
  bookmarkFeedback(saved) {
    setIcon(this.get('float-keep'), saved ? 'check' : 'bookmark');
    this.get('float-keep').title = saved ? 'Moment conservé' : 'Garder ce moment';
  }
  show(view) {
    this.root.body.dataset.view = view;
    this.get('memory-section').hidden = view !== 'memory';
    for (const [id, selected] of [['nav-live', view === 'direct'], ['nav-memory', view === 'memory']]) {
      const button = this.get(id);
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }
  windowMode(floating, expanded) {
    this.root.body.classList.toggle('floating', floating);
    this.root.body.classList.toggle('floating-expanded', expanded);
    this.get('float-chat').setAttribute('aria-expanded', String(expanded));
    this.get('float-chat').setAttribute('aria-label', expanded ? 'Réduire le chat' : 'Ouvrir le chat');
    this.get('float-menu').hidePopover();
  }
  observation(state, recording) {
    this.get('observe').hidden = recording;
    this.get('stop').hidden = !recording;
    const record = this.get('float-record');
    setIcon(record, recording ? 'pause' : 'play');
    record.setAttribute('aria-label', recording ? 'Mettre TVLens en pause' : 'Lancer ou reprendre l’observation');
    const ready = state?.segments?.filter(s => s.status === 'ready') || [];
    const pending = state?.pending || 0;
    const gaps = state?.gaps?.length || 0;
    const delay = Math.ceil(Math.max(0, (state?.capturedThroughMs || 0) - (state?.analyzedThroughMs || 0)) / 1000);
    const health = !state?.id ? 'Prêt à observer' : !recording ? 'Observation en pause' : gaps ? `${gaps} passage(s) sans analyse` : pending || delay ? `Analyse en cours${delay ? ` · ${delay} s de décalage` : ''}` : ready.length ? 'Analyse à jour' : 'Premières observations en cours…';
    this.root.body.dataset.health = !recording ? 'idle' : gaps || pending || delay ? 'pending' : 'ready';
    for (const id of ['coverage-summary', 'chat-health-summary']) this.get(id).textContent = health;
    const latest = ready.at(-1)?.observation;
    this.get('current-context').textContent = latest?.summary || 'Le contexte apparaîtra avec les premières observations.';
  }
}
