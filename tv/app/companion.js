// The top of this file is not wrapped: a name added here becomes a global of the page and takes the tvlens prefix.
// Ces dépendances sont résolues au chargement : une balise manquante doit faire échouer la page.
var tvlensText = typeof module === "object" && module && module.exports ? module.require("./text.js") : window.TVLensText;
var tvlensChatModel = typeof module === "object" && module && module.exports ? module.require("./chat-model.js") : window.TVLensChatModel;
var tvlensClock = tvlensText.clock,
  tvlensPlural = tvlensText.plural;
var describeJob = tvlensChatModel.describeJob,
  describeJobProgress = tvlensChatModel.describeJobProgress,
  describeJobFreshness = tvlensChatModel.describeJobFreshness,
  describeJobFreshnessShort = tvlensChatModel.describeJobFreshnessShort,
  tvlensCancelTarget = tvlensChatModel.cancelTarget,
  tvlensPollPolicy = tvlensChatModel.pollPolicy,
  TvlensPollPlan = tvlensChatModel.PollPlan,
  tvlensBadgeReference = tvlensChatModel.badgeReference,
  tvlensRegistryMarks = tvlensChatModel.registryMarks,
  tvlensMergeState = tvlensChatModel.mergeState,
  TVLENS_POLL = tvlensChatModel.POLL;
(function () {
  "use strict";
  if (typeof module === "object" && module && module.exports) {
    module.exports = {
      describeJob: describeJob,
      describeJobProgress: describeJobProgress,
      describeJobFreshness: describeJobFreshness,
      describeJobFreshnessShort: describeJobFreshnessShort,
      pollPolicy: tvlensPollPolicy,
      PollPlan: TvlensPollPlan,
      badgeReference: tvlensBadgeReference,
      registryMarks: tvlensRegistryMarks,
      mergeState: tvlensMergeState,
      cancelTarget: tvlensCancelTarget,
      clock: tvlensClock,
      POLL: TVLENS_POLL,
    };
    return;
  }
  function el(id) {
    return document.getElementById(id);
  }
  // Text is only written when it changed: a poll that brings nothing new touches no node.
  function set(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }
  function flag(node, name, value) {
    if (node[name] !== value) node[name] = value;
  }
  var time = tvlensClock,
    createPollController = window.TVLensPollController.createPollController,
    Surveillance = window.TVLensSurveillance,
    Sessions = window.TVLensSessions;
  var config = window.TVLENS_REMOTE;
  document.body.dataset.mode = "chat";
  var client,
    control,
    state,
    receivedAt = 0,
    online = true,
    anchor,
    keyboardVisible = false,
    // A session change the viewer asked for (open, resume, end, delete) is not announced as a surprise.
    expectedUntil = 0;
  var reading = false,
    view = "chat",
    timeline,
    surveillance,
    sessions,
    overlay,
    selectedMoment = null;
  function expectChange() {
    expectedUntil = performance.now() + 15000;
  }
  var capture = window.setupCaptureControl(config, {
    resume: function (id) {
      expectChange();
      return client.sessionAction(id, "resume").then(kickPoll);
    },
    close: function () {
      expectChange();
      return client.closeSession().then(kickPoll);
    },
  });
  function leaveReading() {
    reading = false;
    el("conversation").dataset.reading = "false";
    el("navigation-hint").textContent = "Retour · fermer";
    el("dictate").focus();
  }
  el("conversation").addEventListener("focus", function () {
    if (!reading) el("navigation-hint").textContent = "OK · lire les messages";
  });
  el("conversation").addEventListener("blur", function () {
    reading = false;
    el("conversation").dataset.reading = "false";
    el("navigation-hint").textContent = "Retour · fermer";
  });
  el("dictate").onclick = function () {
    el("question").focus();
  };
  document.addEventListener("keyboardStateChange", function (event) {
    // LG also hides its keyboard during speech recognition: do not blur on this event.
    keyboardVisible = !!(event.detail && event.detail.visibility);
  });
  // A pointer press on the bare background (where the bottom-left card is drawn, which is no target)
  // must not blur the focused control: the remote would be left with nothing to act on. A text field
  // keeps its usual behaviour, so that the LG keyboard closes as it always did.
  document.addEventListener("mousedown", function (event) {
    var bare = event.target === document.body || event.target === document.documentElement;
    if (bare && document.activeElement && document.activeElement.tagName !== "INPUT")
      event.preventDefault();
  });
  // A modal dialog owns the remote: arrows walk its buttons, Back is its harmless choice.
  function dialogKeys(event) {
    var dialog = document.querySelector("dialog[open]");
    if (!dialog) return false;
    var key = event.keyCode;
    if (key === 461 || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      var cancel = dialog.querySelector("[data-cancel]");
      if (cancel) cancel.click();
    } else if ([37, 38, 39, 40].includes(key)) {
      event.preventDefault();
      var buttons = [].filter.call(
          dialog.querySelectorAll("button"),
          function (button) {
            return !button.disabled;
          },
        ),
        at = buttons.indexOf(document.activeElement),
        step = key === 39 || key === 40 ? 1 : -1;
      // Focus outside the buttons (it should not happen): back to the first one, the harmless choice.
      if (buttons.length)
        buttons[at < 0 ? 0 : (at + step + buttons.length) % buttons.length].focus();
    }
    return true;
  }
  document.addEventListener("keydown", function (event) {
    if (dialogKeys(event)) return;
    if (sessions && sessions.handleKey(event)) return;
    if (timeline && timeline.handleKey(event)) return;
    if (surveillance && surveillance.handleKey(event)) return;
    var active = document.activeElement,
      key = event.keyCode;
    if (key === 461 || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (active === el("conversation")) {
        leaveReading();
      } else if (active === el("question")) {
        el("question").blur();
        keyboardVisible = false;
        el("dictate").focus();
      } else window.close();
      return;
    }
    if (active === el("conversation")) {
      if (key === 13 || event.key === "Enter") {
        event.preventDefault();
        reading = true;
        active.dataset.reading = "true";
        el("navigation-hint").textContent =
          "Haut / Bas · lire — Retour · actions";
        return;
      }
      if ([38, 40].includes(key)) {
        event.preventDefault();
        if (reading) active.scrollTop += key === 40 ? 180 : -180;
        else if (key === 40) leaveReading();
        else el("show-timeline").focus();
        return;
      }
      if (key === 39) {
        event.preventDefault();
        leaveReading();
      }
      return;
    }
    if (active === el("question")) {
      if (!keyboardVisible && [38, 40].includes(key)) {
        event.preventDefault();
        el("dictate").focus();
      }
      return;
    }
    if (![37, 38, 39, 40].includes(key)) return;
    event.preventDefault();
    var target,
      cancel = el("cancel-question").hidden ? null : el("cancel-question");
    if (active === el("show-timeline"))
      target =
        key === 40
          ? el("conversation")
          : key === 39
            ? el("show-surveillance")
            : el("show-timeline");
    else if (active === el("show-surveillance"))
      target =
        key === 40
          ? el("conversation")
          : key === 37
            ? el("show-timeline")
            : el("show-surveillance");
    else if (active === el("clear-moment"))
      target = key === 40 ? el("dictate") : el("conversation");
    // Reachable with the arrows: between the question row and the capture button, only while a
    // question waits or runs.
    else if (active === el("cancel-question"))
      target = key === 38 ? el("dictate") : key === 40 ? el("capture") : active;
    else if (active === el("capture"))
      target = key === 38 ? cancel || el("dictate") : el("transcription-language");
    else if (active === el("transcription-language"))
      target = key === 38 ? el("capture") : el("transcription-language");
    else if (active === el("dictate") || active === el("send")) {
      if (key === 40) target = cancel || el("capture");
      else if (key === 38)
        target = selectedMoment ? el("clear-moment") : el("conversation");
      else if (key === 39) target = el("send");
      else target = active === el("send") ? el("dictate") : el("conversation");
    } else target = el("dictate");
    if (target && !target.disabled) target.focus();
  });
  el("dictate").focus();
  if (!config || !config.url || !config.token) {
    el("connection").textContent = "Appairage requis sur cet appareil.";
    el("send").disabled = true;
    return;
  }
  client = new window.TVLensRemoteClient(config);
  var languageBusy = false;
  var languages = ["fr", "en", "auto"];
  var languageLabels = {fr: "Français", en: "Anglais", auto: "Détection automatique"};
  function renderTranscriptionWarning() {
    var status = state && state.transcription,
      failed = status && status.available === false,
      causes = {
        TVLENS_WHISPER_MODEL_MISSING: "modèle introuvable",
        TVLENS_WHISPER_BINARY_MISSING: "binaire introuvable",
        TVLENS_WHISPER_FAILED: "échec de Whisper",
      },
      node = el("transcription-warning");
    flag(node, "hidden", !failed);
    node.dataset.code = failed ? status.code || "" : "";
    set(node, failed
      ? "Transcription locale indisponible : " + (causes[status.code] || "cause inconnue") + ". Vérifie Whisper et son modèle sur le serveur."
      : "");
  }
  function renderLanguage() {
    var language = state && state.transcription && state.transcription.language;
    flag(el("transcription-language"), "disabled", languageBusy || !language);
    set(el("transcription-language"), "Audio · " + (languageLabels[language] || "Français"));
  }
  el("transcription-language").onclick = async function () {
    if (languageBusy || !state || !state.transcription) return;
    languageBusy = true;
    renderLanguage();
    try {
      var current = state.transcription.language;
      var value = await client.request("/v1/settings/transcription", {language: languages[(languages.indexOf(current) + 1) % languages.length]});
      state.transcription = Object.assign({}, state.transcription, value);
      el("language-state").textContent = "Enregistré · prochaines transcriptions. OK pour changer.";
    } catch (error) { el("language-state").textContent = error.message; }
    finally { languageBusy = false; renderLanguage(); el("transcription-language").focus(); }
  };
  control = new window.TVLensRemoteClient({
    url: config.controlUrl || "http://127.0.0.1:8788",
    token: config.token,
  });
  // Rectangle the picture occupies in the current layout (logical pixels), when the local controller
  // publishes it: the bottom-left card is never drawn where it would reach into it.
  var videoRect = null;
  function noteLayout(layout) {
    videoRect = layout && layout.active && layout.video ? layout.video : null;
  }
  control.request("/panel").then(noteLayout, function () {});
  async function changeLayout(mode) {
    var requested = await control.request("/panel/" + mode, {}),
      deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      var layout = await control.request("/panel");
      if (
        layout.active &&
        layout.mode === mode &&
        layout.requestId === requested.id
      ) {
        noteLayout(layout);
        return;
      }
      await new Promise(function (resolve) {
        setTimeout(resolve, 200);
      });
    }
    // Restore the currently visible geometry if the coordinator never acknowledged.
    await control
      .request("/panel/" + (timeline ? timeline.mode : "chat"), {})
      .catch(function () {
        // La restauration n'est pas confirmée ; le refus de disposition ci-dessous reste rendu, même si ce dernier essai échoue.
      });
    throw Error("Disposition TV non confirmée. Réessaie la bascule.");
  }
  function clearMoment() {
    selectedMoment = null;
    anchor = null;
    el("moment-context").hidden = true;
  }
  el("clear-moment").onclick = function () {
    clearMoment();
    el("dictate").focus();
  };
  // Chat column: the conversation, or the surveillance view in its place.
  function setView(next) {
    view = next;
    el("chat-panel").dataset.view = next;
    el("chat-view").hidden = next !== "chat";
    el("surveillance-view").hidden = next !== "surveillance";
    if (next === "chat") {
      surveillance.close();
      el("navigation-hint").textContent = "Retour · fermer";
    }
    renderBadge();
  }
  // A question about a stretch of video: a moment of the timeline, or the origin of a surveillance result.
  function askAbout(card, sessionId) {
    if (view !== "chat") setView("chat");
    selectedMoment = {
      sessionId: sessionId,
      segmentIds: card.segmentIds.slice(),
      startMs: card.startMs,
      endMs: card.endMs,
    };
    anchor = { sessionId: sessionId, ms: card.endMs };
    el("moment-context").hidden = false;
    el("moment-context").querySelector("span").textContent =
      "Question sur " + time(card.startMs) + "–" + time(card.endMs);
    el("question").focus();
  }
  timeline = new window.TVLensTimeline({
    client: client,
    changeLayout: changeLayout,
    onAsk: askAbout,
    focusChat: function () {
      if (view === "surveillance") surveillance.focusCommands();
      else el("dictate").focus();
    },
    onEnd: async function () {
      await control.request("/capture/stop", {});
      var deadline = Date.now() + 15000;
      while ((await control.request("/capture")).active) {
        if (Date.now() > deadline)
          throw Error("Arrêt de capture non confirmé : session conservée.");
        await new Promise(function (resolve) {
          setTimeout(resolve, 300);
        });
      }
      expectChange();
      await client.request("/v1/session/end", {});
      clearMoment();
      kickPoll();
    },
  });
  window.tvlensTimeline = timeline;
  sessions = new Sessions.View({
    client: client,
    timeline: timeline,
    capture: capture,
    kick: function () {
      expectChange();
      kickPoll();
    },
  });
  // Display choices of this TV: how long a card stays, and whether cards appear at all. Kept on the TV
  // (local storage, never required).
  var settings = (function () {
    var stored = {};
    try {
      stored = JSON.parse(window.localStorage.getItem("tvlens.overlay") || "{}") || {};
    } catch (_) {
      // Stockage refusé ou JSON illisible : les choix d'affichage repartent des valeurs par défaut, sans toucher l'état serveur.
    }
    return {
      displayMs: Surveillance.displayChoice(stored.displayMs || config.overlayMs),
      alerts: stored.alerts !== false,
    };
  })();
  var badge = null;
  function registryMarks() {
    return tvlensRegistryMarks(state);
  }
  // Header button of the surveillance, with the number of results that arrived without a card on
  // screen (signals, undetermined claims, cards not shown) since the history was last read.
  function renderBadge() {
    var marks = registryMarks(),
      button = el("show-surveillance");
    badge = tvlensBadgeReference(badge, marks);
    var fresh =
      Math.max(0, marks.overlay - badge.overlay - badge.shown) +
      Math.max(0, marks.signals - badge.signals) +
      Math.max(0, marks.undetermined - badge.undetermined);
    set(
      button,
      view === "surveillance" ? "← Chat" : "Surveillance" + (fresh ? " (" + fresh + ")" : ""),
    );
    var label =
      view === "surveillance"
        ? "Revenir à la conversation"
        : "Afficher la surveillance" +
          (fresh
            ? " : " +
              tvlensPlural(fresh, "nouveau résultat", "nouveaux résultats") +
              " dans l’historique"
            : "");
    if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
  }
  overlay = new Surveillance.Overlay({
    settings: function () {
      return settings;
    },
    // A dialog or the LG keyboard covers the card: its time on screen does not run meanwhile.
    paused: function () {
      return keyboardVisible || !!document.querySelector("dialog[open]");
    },
    suspended: function () {
      return document.body.dataset.switching === "true";
    },
    video: function () {
      return videoRect;
    },
    onShown: function () {
      if (badge) badge.shown++;
      renderBadge();
    },
  });
  surveillance = new Surveillance.View({
    client: client,
    getState: function () {
      return state;
    },
    settings: function () {
      return settings;
    },
    overlayAvailable: function () {
      return overlay.available;
    },
    overlayCovered: function () {
      return overlay.covered;
    },
    // Viewer action: remembered on the TV and applied to the open panel.
    setSettings: function (patch) {
      Object.assign(settings, patch);
      try {
        window.localStorage.setItem(
          "tvlens.overlay",
          JSON.stringify({ displayMs: settings.displayMs, alerts: settings.alerts }),
        );
      } catch (_) {
        // Le choix reste dans settings et overlay.tick() l'applique dans cette page.
      }
      overlay.tick();
    },
    onSurveillance: function (compact) {
      if (state && compact) {
        state.surveillance = compact;
        overlay.update(state);
      }
      kickPoll();
    },
    onHistoryRead: function () {
      badge = registryMarks();
      renderBadge();
    },
    onAsk: askAbout,
    onClose: function () {
      setView("chat");
      el("dictate").focus();
    },
  });
  el("show-surveillance").onclick = function () {
    if (view === "chat") {
      setView("surveillance");
      surveillance.open();
    } else {
      setView("chat");
      el("show-surveillance").focus();
    }
  };
  el("destination").textContent =
    "Calcul distant · " + new URL(config.url).host;
  function point() {
    if (!state || !state.session) return null;
    return {
      sessionId: state.session.id,
      ms:
        state.session.elapsedMs +
        (state.session.accepting ? performance.now() - receivedAt : 0),
    };
  }
  // Freeze when dictation/text composition starts, not after waiting for a previous answer.
  el("question").addEventListener("focus", function () {
    if (!anchor) anchor = point();
  });
  el("question").addEventListener("input", function () {
    if (!anchor) anchor = point();
  });
  // Connection line. Recomputed every second from the extrapolated session clock: a
  // capture that stops publishes nothing, so no new body would ever say "no recent capture".
  function renderStatus() {
    if (!online) return;
    var s = state && state.session,
      blocked = state && state.storage && state.storage.state === "blocked";
    set(
      el("connection"),
      !state
        ? "Connexion…"
        : !s
          ? "Démarre la capture TV pour commencer."
          : s.readOnly
            ? "Archive ouverte · capture arrêtée"
            : s.accepting === false
              ? blocked
                ? "Capture suspendue · espace disque insuffisant"
                : "Capture en pause · mémoire disponible"
              : point().ms - s.capturedThroughMs > 12000
                ? "Aucune capture récente · mémoire disponible"
                : "Capture reçue",
    );
  }
  function render() {
    var s = state.session;
    stats.renders++;
    renderLanguage();
    renderTranscriptionWarning();
    timeline.update(state);
    capture.setContext({
      sessionId: s ? s.id : null,
      readOnly: !!(s && s.readOnly),
      title: (s && s.title) || null,
      storage: state.storage || null,
    });
    renderStatus();
    var archive = Sessions.describeArchive(s),
      storage = Sessions.describeStorage(state.storage);
    flag(el("archive-banner"), "hidden", !archive);
    set(el("archive-banner"), archive || "");
    flag(el("storage-state"), "hidden", !storage.banner);
    if (el("storage-state").dataset.state !== storage.state)
      el("storage-state").dataset.state = storage.state;
    set(el("storage-state"), storage.banner || "");
    if (s) {
      // The light views count the gaps; the complete state lists them.
      var gaps = s.gapCount !== undefined ? s.gapCount : (s.gaps || []).length,
        interruptions =
          state.captureGapCount !== undefined
            ? state.captureGapCount
            : (state.captureGaps || []).length;
      set(
        el("coverage"),
        "Capturé " +
          time(s.capturedThroughMs) +
          " · analysé " +
          time(s.analyzedThroughMs) +
          " · " +
          s.pending +
          " en attente" +
          (gaps ? " · " + tvlensPlural(gaps, "lacune d’analyse", "lacunes d’analyse") : "") +
          (interruptions
            ? " · " +
              tvlensPlural(interruptions, "interruption de capture", "interruptions de capture")
            : ""),
      );
    }
    chatView.receive(state, receivedAt);
    overlay.update(state);
    surveillance.update();
    renderBadge();
  }
  // A new body: merged into what the panel holds, then drawn. Never called for a 304.
  function receive(next, viewName) {
    var before = state && state.session ? state.session.id : null,
      after = next.session ? next.session.id : null;
    if (state && before !== after) {
      clearMoment();
      surveillance.reset();
      if (before && performance.now() > expectedUntil)
        el("error").textContent =
          "Le serveur a changé de session. Les anciennes questions ne sont pas renvoyées.";
      expectedUntil = 0;
    }
    state = tvlensMergeState(state, next, viewName);
    receivedAt = performance.now();
    render();
  }
  var pollController = createPollController({
    client: client,
    now: function () {
      return performance.now();
    },
    setTimer: function (callback, delay) {
      return setTimeout(callback, delay);
    },
    clearTimer: function (timer) {
      clearTimeout(timer);
    },
    getState: function () {
      return state;
    },
    activeMs: config.activePollMs,
    idleMs: config.idlePollMs,
    viewRetryMs: config.viewRetryMs,
    onReceive: function (value, viewName) {
      online = true;
      chatView.setOnline(true);
      receive(value, viewName);
    },
    onNotModified: function () {
      online = true;
      chatView.setOnline(true);
      renderStatus();
    },
    onError: function (error) {
      online = false;
      // A refused token is not an outage: retrying will not help until the TV is paired again.
      el("connection").textContent =
        error.status === 401
          ? "Appairage refusé par le serveur · vérifie le jeton de cette TV."
          : "Serveur inaccessible · reconnexion…";
      chatView.setOnline(false);
    },
  });
  var stats = pollController.stats;
  function kickPoll() {
    pollController.request();
  }
  var chatView = window.TVLensChatView.createChatView({
    document: document,
    elements: el,
    model: tvlensChatModel,
    text: tvlensText,
    now: function () { return performance.now(); },
    isReading: function () { return reading; },
    actions: {
      ask: function (question, sessionId, ms, range) { return client.ask(question, sessionId, ms, range); },
      cancel: function (id) { return client.cancel(id); },
      kick: kickPoll,
      onSubmit: function () {
        keyboardVisible = false;
        anchor = null;
      },
    },
  });
  el("ask").onsubmit = function (event) {
    event.preventDefault();
    var at = selectedMoment
      ? { sessionId: selectedMoment.sessionId, ms: selectedMoment.endMs, range: {
        firstId: selectedMoment.segmentIds[0], lastId: selectedMoment.segmentIds[selectedMoment.segmentIds.length - 1],
      } }
      : anchor || point();
    return chatView.submit(at);
  };
  // Local clocks. The card on screen leaves at its deadline and the elapsed times advance even when
  // the server answers 304 or does not answer at all.
  setInterval(function () {
    overlay.tick();
  }, 250);
  setInterval(function () {
    renderStatus();
    chatView.tick();
  }, 1000);
  // Read by the smokes and handy on a bench: what the poll loop really did.
  window.tvlensPanel = {
    stats: stats,
    kick: kickPoll,
    stop: pollController.stop,
    state: function () {
      return state;
    },
  };
  el("dictate").focus();
  pollController.start();
})();
