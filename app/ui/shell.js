import { setIcon } from './icons.js';
import { describeHealth } from './sessions-view.mjs';
/** Presentation adapter. Owns navigation and window chrome, never session data or inference. */
export class ViewingShell {
  constructor(root = document) {
    this.root = root;
    this.get = id => root.getElementById(id);
    this.view = 'direct';
    this.homeView = 'chapters';
    this.onShow = () => {};
    this.get('nav-live').onclick = () => this.show('direct');
    this.get('nav-memory').onclick = () => this.show('memory');
    this.get('nav-watch').onclick = () => this.show('watch');
    this.get('home-chapters-tab').onclick = () => this.showHome('chapters');
    this.get('home-live-tab').onclick = () => this.showHome('live');
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
    this.showHome('chapters');
  }
  bookmarkFeedback(saved) {
    setIcon(this.get('float-keep'), saved ? 'check' : 'bookmark');
    this.get('float-keep').title = saved ? 'Moment conservé' : 'Garder ce moment';
  }
  // Switching home panels never moves or rebuilds the conversation or its draft.
  showHome(view) {
    this.homeView = view;
    for (const name of ['chapters', 'live']) {
      const selected = name === view;
      this.get(`home-${name}`).hidden = !selected;
      const tab = this.get(`home-${name}-tab`);
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.onkeydown = event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let next = name === 'chapters' ? 'live' : 'chapters';
        if (event.key === 'Home') next = 'chapters';
        if (event.key === 'End') next = 'live';
        this.showHome(next);
        this.get(`home-${next}-tab`).focus();
      };
    }
  }
  /** direct: chapters or current video and chat; memory: saved moments and sessions. */
  show(view) {
    this.view = view;
    this.root.body.dataset.view = view;
    this.get('memory-section').hidden = view !== 'memory';
    this.get('watch-section').hidden = view !== 'watch';
    for (const [id, selected] of [['nav-live', view === 'direct'], ['nav-memory', view === 'memory'], ['nav-watch', view === 'watch']]) {
      const button = this.get(id);
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    this.onShow(view);
  }
  windowMode(floating, expanded) {
    this.root.body.classList.toggle('floating', floating);
    this.root.body.classList.toggle('floating-expanded', expanded);
    this.get('float-chat').setAttribute('aria-expanded', String(expanded));
    this.get('float-chat').setAttribute('aria-label', expanded ? 'Réduire le chat' : 'Ouvrir le chat');
    this.get('float-menu').hidePopover();
  }
  /** Surveillance dot on the tab and on the floating bar: a count of new results, or lateness. Never a focus change. */
  watchBadge({ visible = false, tone = null, count = 0, label = '' } = {}) {
    const badge = this.get('watch-badge');
    badge.hidden = !visible;
    badge.dataset.tone = tone || '';
    badge.textContent = count > 0 ? String(Math.min(count, 99)) : '';
    this.get('nav-watch').title = label;
    const toggle = this.get('float-menu-toggle');
    if (visible && tone !== 'active') toggle.dataset.badge = tone; else delete toggle.dataset.badge;
    // The label may already open with "Surveillance", with or without its separator: the word is written once.
    this.get('float-watch').textContent = visible && label ? `Surveillance · ${label.replace(/^Surveillance\s*(?:·\s*)?/i, '') || 'active'}` : 'Surveillance';
  }
  observation(state, recording) {
    this.get('observe').hidden = recording;
    this.get('stop').hidden = !recording;
    const record = this.get('float-record');
    setIcon(record, recording ? 'pause' : 'play');
    record.setAttribute('aria-label', recording ? 'Mettre TVLens en pause' : state?.readOnly ? 'Reprendre la capture dans cette archive' : 'Lancer ou reprendre l’observation');
    // The wording (and its French agreement) lives in the view model, where it is tested without a DOM.
    const health = describeHealth(state, { recording });
    this.root.body.dataset.health = health.tone;
    this.root.body.classList.toggle('read-only', Boolean(state?.readOnly));
    for (const id of ['coverage-summary', 'chat-health-summary']) this.get(id).textContent = health.label;
    this.get('current-context').textContent = health.context || 'Le contexte apparaîtra avec les premières observations.';
  }
}
