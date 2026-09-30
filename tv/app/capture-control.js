(function (root) {
  'use strict';
  // Local device control is deliberately independent of the remote inference host.
  root.setupCaptureControl = function (config) {
    var button = document.getElementById('capture'), label = document.getElementById('capture-state');
    if (!config || !config.token) { label.textContent = 'Appairage requis pour la capture.'; return; }
    var client = new root.TVLensRemoteClient({url:config.controlUrl || 'http://127.0.0.1:8788',token:config.token});
    var busy = false, current, revision = 0, restoreFocus = false;
    function render(value) {
      current = value;
      button.disabled = false;
      button.setAttribute('aria-disabled', String(busy || value.stopping));
      if (restoreFocus && document.activeElement === document.body) button.focus();
      restoreFocus = false;
      button.textContent = value.stopping ? 'Arrêt en cours…' : value.active ? 'Arrêter la capture' : 'Démarrer l’analyse';
      var report = value.report || {};
      label.textContent = value.stopping ? 'Arrêt du micro et des captures…' : value.active ?
        (report.connection === 'starting' ? 'Connexion au serveur…' : report.connection === 'reconnecting' ? 'Réseau coupé · tampon court, nouvel essai…' : report.sent ? 'Capture active · ' + report.sent + ' passage(s) envoyés' : 'Capture en cours · premier passage sous ≈10 s') :
        (report.connection === 'session-changed' ? 'Serveur redémarré · redémarre l’analyse.' : report.errors && report.errors.length ? 'Capture arrêtée · ' + report.errors[report.errors.length-1] : value.exitCode ? 'Capture interrompue · tu peux réessayer.' : 'Capture arrêtée · contexte conservé');
      if (report.dropped) label.textContent += ' · ' + report.dropped + ' passage(s) non envoyés';
    }
    async function poll() {
      var requestedRevision = revision;
      try { var value = await client.request('/capture'); if (!busy && requestedRevision === revision) render(value); }
      catch (_) { if (!busy) { restoreFocus = restoreFocus || document.activeElement === button; button.disabled = true; label.textContent = 'Contrôleur TV inaccessible.'; } }
      setTimeout(poll, 1000);
    }
    button.onclick = async function () {
      if (busy || !current || current.stopping) return;
      busy = true;revision++;button.setAttribute('aria-disabled', 'true');
      try { var value = await client.request(current.active ? '/capture/stop' : '/capture/start', {});busy=false;render(value); }
      catch (_) { busy=false;label.textContent='Commande non confirmée · vérification de l’état…'; }
    };
    poll();
  };
})(window);
