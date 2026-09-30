(function () {
  'use strict';
  function el(id) { return document.getElementById(id); }
  var input = el('question');
  var params = {};
  try {
    var raw = window.launchParams || (window.PalmSystem && window.PalmSystem.launchParams);
    params = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
  } catch (_) { /* Keep bounded defaults when launch parameters are invalid. */ }
  var duration = Number(params.durationMs);
  if (!isFinite(duration) || duration < 10000) duration = 45000;
  duration = Math.min(duration, 180000);
  var deadline = Date.now() + duration;
  var events = [];
  function note(type, details) {
    events.push({ atMs: Date.now(), type: type, details: details });
    if (events.length > 40) events.shift();
    el('event').textContent = type + (details ? ' · ' + details : '');
  }
  // Diagnostics stay in memory. No raw microphone access or automatic inference.
  window.tvlensVoiceProbe = { snapshot: function () {
    return { mode: el('mode').textContent, text: input.value, events: events.slice() };
  }};
  function receive(event) {
    el('received').textContent = input.value || 'Aucun texte reçu.';
    el('status').textContent = input.value ? 'Texte reçu — origine à confirmer' : 'En attente de texte';
    note(event.type, event.inputType || 'champ texte');
  }
  input.addEventListener('input', receive);
  input.addEventListener('change', receive);
  input.addEventListener('compositionend', receive);
  input.addEventListener('focus', function () {
    el('mode').textContent = 'Champ activé';
    el('instruction').textContent = 'Appuie sur le micro et dicte : « De quoi parle cette vidéo ? »';
    note('focus', 'champ texte');
  });
  el('dictate').onclick = function () { input.focus(); };
  el('reset').onclick = function () {
    input.value = ''; events.length = 0;
    el('mode').textContent = 'Bouton direct';
    el('received').textContent = 'Aucun texte reçu.';
    el('status').textContent = 'En attente d’une action';
    el('instruction').textContent = 'Appuie sur le micro sans sélectionner le champ.';
    el('dictate').focus(); note('reset', 'bouton direct');
  };
  el('close').onclick = function () { window.close(); };
  document.addEventListener('keyboardStateChange', function (event) {
    var visible = event.detail && event.detail.visibility;
    el('keyboard').textContent = visible ? 'Visible' : 'Masqué';
    note('keyboardStateChange', visible ? 'visible' : 'masqué');
    // Do not blur: LG also hides its keyboard during voice input.
  });
  document.addEventListener('keydown', function (event) {
    note('keydown', String(event.keyCode));
    if ((event.keyCode === 461 || event.key === 'Escape') && document.activeElement !== input) {
      event.preventDefault(); window.close(); return;
    }
    if (document.activeElement === input) return;
    var buttons = [el('dictate'), el('reset'), el('close')];
    var index = buttons.indexOf(document.activeElement);
    if (event.keyCode === 38 || event.keyCode === 40) {
      event.preventDefault();
      buttons[(index + (event.keyCode === 40 ? 1 : 2)) % 3].focus();
    }
  });
  el('dictate').focus();
  setInterval(function () {
    var left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    el('timer').textContent = left + ' s';
    if (!left) window.close();
  }, 250);
})();
