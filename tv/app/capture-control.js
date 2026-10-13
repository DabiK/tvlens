(function (root) {
  'use strict';
  // Local device control is deliberately independent of the remote inference host. The wording of the
  // button and of its status line is the pure model describeCapture (sessions-view.js).
  // Nothing here starts a capture by itself: every start is a press of the viewer.
  root.setupCaptureControl = function (config, hooks) {
    var el = function (id) { return document.getElementById(id); };
    var button = el('capture'), label = el('capture-state'), dialog = el('archive-capture-dialog');
    var describe = root.TVLensSessions.describeCapture;
    var busy = false, choosing = false, current, revision = 0, restoreFocus = false, context = {}, contextKey = '';
    var api = {
      // What the server says of the loaded session: read-only archive, storage, title.
      setContext: function (next) {
        var key = JSON.stringify(next || {});
        if (key === contextKey) return;
        contextKey = key; context = next || {};
        if (current && !busy) render(current);
      },
      active: function () { return !!(current && current.active); },
      start: function () { return Promise.resolve(); }, resumeHere: function () { return Promise.resolve(); }, newSession: function () { return Promise.resolve(); },
    };
    if (!config || !config.token) { label.textContent = 'Appairage requis pour la capture.'; return api; }
    var client = new root.TVLensRemoteClient({url:config.controlUrl || 'http://127.0.0.1:8788',token:config.token});
    // Written only when it changed: a status poll that brings nothing new touches no node.
    function attribute(node, name, value) { if (node.getAttribute(name) !== value) node.setAttribute(name, value); }
    function render(value) {
      current = value;
      if (button.disabled) button.disabled = false;
      attribute(button, 'aria-disabled', String(busy || value.stopping));
      if (restoreFocus && document.activeElement === document.body) button.focus();
      restoreFocus = false;
      var view = describe(value, context);
      if (button.textContent !== view.button) button.textContent = view.button;
      if (label.textContent !== view.label) label.textContent = view.label;
      attribute(label, 'data-ended', view.ended || '');
    }
    async function poll() {
      var requestedRevision = revision;
      try { var value = await client.request('/capture'); if (!busy && requestedRevision === revision) render(value); }
      catch (_) { if (!busy) { restoreFocus = restoreFocus || document.activeElement === button; button.disabled = true; label.textContent = 'Contrôleur TV inaccessible.'; } }
      setTimeout(poll, 1000);
    }
    async function command(route) {
      busy = true;revision++;button.setAttribute('aria-disabled', 'true');
      try { var value = await client.request(route, {});busy=false;render(value);return true; }
      catch (_) { busy=false;label.textContent='Commande non confirmée · vérification de l’état…';return false; }
    }
    api.start = async function () {
      if (current && current.active) return;
      if (!(await command('/capture/start'))) throw Error('Capture non confirmée par le contrôleur TV. Réessaie avec le bouton de capture.');
    };
    // Explicit resume of the archive that is open: the server leaves read-only first (it words a full
    // disk or a conflict itself), then this TV starts sending.
    api.resumeHere = async function () {
      if (!context.sessionId) throw Error('Aucune session ouverte à reprendre.');
      await hooks.resume(context.sessionId);
      api.setContext(Object.assign({}, context, {readOnly: false}));
      await api.start();
    };
    // The open session is closed as it is (archived, nothing erased) and a new one starts with the capture.
    api.newSession = async function () {
      await hooks.close();
      api.setContext(Object.assign({}, context, {readOnly: false, sessionId: null, title: null}));
      await api.start();
    };
    async function choose(work) {
      if (choosing) return;
      choosing = true;el('archive-error').textContent = '';
      try { await work();dialog.close();button.focus(); }
      catch (error) { el('archive-error').textContent = error.message; }
      finally { choosing = false; }
    }
    el('archive-cancel').onclick = function () { dialog.close();button.focus(); };
    el('archive-new').onclick = function () { choose(api.newSession); };
    el('archive-resume').onclick = function () { choose(api.resumeHere); };
    button.onclick = async function () {
      if (busy || !current || current.stopping) return;
      // An archive is only being read: capturing into it, or leaving it, is the viewer's choice.
      if (describe(current, context).action === 'choose') {
        el('archive-error').textContent = '';
        el('archive-capture-text').textContent = (context.title ? '« ' + context.title + ' » est ouverte' : 'Cette session est ouverte') +
          ' en lecture seule : rien n’y est capturé. « Reprendre ici » ajoute la suite à cette session ; « Nouvelle session » la referme sans rien effacer et en commence une autre.';
        dialog.showModal();
        // The harmless choice is focused first.
        el('archive-cancel').focus();
        return;
      }
      await command(current.active ? '/capture/stop' : '/capture/start');
    };
    poll();
    return api;
  };
})(window);
