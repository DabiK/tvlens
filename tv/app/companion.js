// Pure view model for a chat job card. Technical failures (error, timeout, cancellation) are shown
// as such, with the redacted Codex diagnostic; "Contexte insuffisant" is reserved for a completed
// answer that abstains for lack of evidence. `preview` (streamed, unvalidated model answer) and
// `provisional` (automatic memory summary) have distinct provenance and are never merged.
// Exposed via CommonJS for tests; inert on webOS.
var TVLENS_KIND_LABELS = {
  observation: "Observations de la vidéo",
  external: "Réponse avec sources",
  explanation: "Explication générale",
  insufficient: "Contexte insuffisant",
};
function describeJob(job) {
  var result = job.result || null,
    failed = ["error", "timeout", "cancelled"].indexOf(job.status) >= 0,
    observed = !!(result && result.observations && result.observations.length),
    preview = job.preview || null,
    provisional = job.provisional || null,
    detail = job.errorDetail || null,
    view = {
      error: null,
      errorDetail: null,
      authRequired: false,
      kindLabel: null,
      answer: null,
      result: null,
      previewLabel: null,
      preview: null,
      provisionalLabel: null,
      provisional: null,
      limits: [],
      message: null,
    };
  if (failed) {
    view.error =
      job.message ||
      { error: "Erreur technique.", timeout: "Délai atteint.", cancelled: "Recherche annulée." }[job.status];
    if (detail) {
      var inner = detail.turnError || null,
        parts = [];
      if (detail.turnStatus) parts.push("Codex · " + detail.turnStatus);
      if (inner && inner.code) parts.push(inner.code);
      if (inner && inner.message) parts.push(inner.message);
      else if (inner && inner.codexErrorInfo) parts.push(inner.codexErrorInfo);
      view.errorDetail = parts.length ? parts.join(" · ") : null;
      view.authRequired = !!(detail.authRequired || (inner && inner.authRequired));
      if (view.authRequired)
        view.errorDetail = "Reconnexion Codex requise" + (view.errorDetail ? " · " + view.errorDetail : "");
    }
    // The fallback "insufficient" result is not an evidence verdict: only real observations are shown.
    if (observed) {
      view.kindLabel = "Observations partielles";
      view.answer = result.answer;
      view.result = result;
      view.limits = result.limits || [];
    }
    if (preview) {
      view.previewLabel = "Réponse provisoire interrompue (non validée)";
      view.preview = preview;
    }
    if (provisional) {
      view.provisionalLabel = "Résumé automatique partiel";
      view.provisional = provisional;
    }
  } else if (result) {
    view.kindLabel = TVLENS_KIND_LABELS[result.kind] || "Réponse";
    view.answer = result.answer;
    view.result = result;
    view.limits = result.limits || [];
  } else {
    if (preview) {
      view.previewLabel = "Réponse provisoire";
      view.preview = preview;
    }
    if (provisional) {
      view.provisionalLabel = "Résumé automatique partiel";
      view.provisional = provisional;
    }
  }
  if (!failed && job.status !== "done") view.message = job.message || "";
  return view;
}
(function () {
  "use strict";
  if (typeof module === "object" && module && module.exports) {
    module.exports = { describeJob: describeJob };
    return;
  }
  function el(id) {
    return document.getElementById(id);
  }
  function time(ms) {
    return (
      Math.floor(ms / 60000) +
      ":" +
      String(Math.floor(ms / 1000) % 60).padStart(2, "0")
    );
  }
  var config = window.TVLENS_REMOTE;
  window.setupCaptureControl(config);
  var state,
    receivedAt = 0,
    anchor,
    submitting = false,
    cards = {},
    followLatest = true,
    keyboardVisible = false;
  var reading = false,
    timeline,
    selectedMoment = null;
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
  document.addEventListener("keydown", function (event) {
    if (timeline && timeline.handleKey(event)) return;
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
    var target;
    if (active === el("show-timeline"))
      target = key === 40 ? el("conversation") : el("show-timeline");
    else if (active === el("clear-moment"))
      target = key === 40 ? el("dictate") : el("conversation");
    else if (active === el("capture"))
      target = key === 38 ? el("dictate") : el("transcription-language");
    else if (active === el("transcription-language"))
      target = key === 38 ? el("capture") : el("transcription-language");
    else if (active === el("dictate") || active === el("send")) {
      if (key === 40) target = el("capture");
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
  var client = new window.TVLensRemoteClient(config);
  var languageBusy = false;
  var languages = ["fr", "en", "auto"];
  var languageLabels = {fr: "Français", en: "Anglais", auto: "Détection automatique"};
  function renderLanguage() {
    var language = state && state.transcription && state.transcription.language;
    el("transcription-language").disabled = languageBusy || !language;
    el("transcription-language").textContent = "Audio · " + (languageLabels[language] || "Français");
  }
  el("transcription-language").onclick = async function () {
    if (languageBusy || !state || !state.transcription) return;
    languageBusy = true;
    renderLanguage();
    try {
      var current = state.transcription.language;
      var value = await client.request("/v1/settings/transcription", {language: languages[(languages.indexOf(current) + 1) % languages.length]});
      state.transcription = value;
      el("language-state").textContent = "Enregistré · prochaines transcriptions. OK pour changer.";
    } catch (error) { el("language-state").textContent = error.message; }
    finally { languageBusy = false; renderLanguage(); el("transcription-language").focus(); }
  };
  var control = new window.TVLensRemoteClient({
    url: config.controlUrl || "http://127.0.0.1:8788",
    token: config.token,
  });
  async function changeLayout(mode) {
    var requested = await control.request("/panel/" + mode, {}),
      deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      var layout = await control.request("/panel");
      if (
        layout.active &&
        layout.mode === mode &&
        layout.requestId === requested.id
      )
        return;
      await new Promise(function (resolve) {
        setTimeout(resolve, 200);
      });
    }
    // Restore the currently visible geometry if the coordinator never acknowledged.
    await control
      .request("/panel/" + (timeline ? timeline.mode : "chat"), {})
      .catch(function () {});
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
  timeline = new window.TVLensTimeline({
    client: client,
    changeLayout: changeLayout,
    onAsk: function (card, sessionId) {
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
      await client.request("/v1/session/end", {});
      clearMoment();
    },
  });
  window.tvlensTimeline = timeline;
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
  function text(parent, tag, value) {
    var node = document.createElement(tag);
    node.textContent = value;
    parent.appendChild(node);
    return node;
  }
  function renderJob(job) {
    var serialized = JSON.stringify([
        job,
        state.session.segments.map(function (s) {
          return [s.id, s.available];
        }),
      ]),
      card = cards[job.id];
    if (card && card.serialized === serialized) return;
    if (!card) {
      card = cards[job.id] = { node: document.createElement("article") };
      card.node.dataset.job = job.id;
      el("conversation").appendChild(card.node);
    }
    card.serialized = serialized;
    var node = card.node,
      focused = node.contains(document.activeElement);
    node.replaceChildren();
    text(node, "h2", job.question).className = "chat-question";
    text(
      node,
      "small",
      "Moment " +
        time(job.anchorMs) +
        " · " +
        ({
          queued: "En file",
          running: "En cours",
          done: "Terminé",
          error: "Erreur",
          cancelled: "Annulé",
          timeout: "Délai atteint",
        }[job.status] || job.status),
    );
    if (job.metrics)
      text(
        node,
        "small",
        "Attente " +
          (job.metrics.waitMs / 1000).toFixed(1) +
          " s · traitement " +
          (job.metrics.totalMs / 1000).toFixed(1) +
          " s",
      );
    var view = describeJob(job);
    if (view.error) {
      text(
        node,
        "small",
        view.authRequired ? "Reconnexion Codex requise" : "Erreur technique",
      ).className = "answer-kind";
      text(node, "p", view.error).className = "chat-answer";
      if (view.errorDetail) text(node, "small", view.errorDetail);
    }
    if (view.answer !== null) {
      text(node, "small", view.kindLabel).className = "answer-kind";
      text(node, "p", view.answer).className = "chat-answer";
      (view.result.hypotheses || []).forEach(function (h) {
        text(node, "small", "Hypothèse : " + (h.text || h));
      });
      (view.result.citations || []).forEach(function (c) {
        var segment = state.session.segments.find(function (s) {
          return s.id === c.id;
        });
        text(
          node,
          "small",
          time(c.startMs) +
            "–" +
            time(c.endMs) +
            (segment && segment.available
              ? " · passage conservé"
              : " · média expiré"),
        );
      });
      (view.result.sources || []).forEach(function (s) {
        text(node, "p", (s.title || "Source") + "\n" + s.url).className = "source-card";
      });
      view.limits.forEach(function (v) {
        text(node, "small", v);
      });
    }
    if (view.preview) {
      text(node, "small", view.previewLabel);
      text(node, "p", view.preview);
    }
    if (view.provisional) {
      text(node, "small", view.provisionalLabel);
      text(node, "p", view.provisional);
    }
    if (view.message !== null) text(node, "small", view.message);
    if (["queued", "running"].includes(job.status)) {
      var cancel = document.createElement("button");
      cancel.textContent = "Annuler cette question";
      cancel.onclick = function () {
        client.cancel(job.id).catch(showError);
      };
      node.appendChild(cancel);
      if (focused) cancel.focus();
    } else if (focused) el("dictate").focus();
  }
  function showError(error) {
    el("error").textContent = error.message;
  }
  async function poll() {
    try {
      var next = await client.state();
      if (
        state &&
        state.session &&
        (!next.session || state.session.id !== next.session.id)
      ) {
        cards = {};
        clearMoment();
        el("conversation").replaceChildren();
        el("error").textContent =
          "Le serveur a changé de session. Les anciennes questions ne sont pas renvoyées.";
      }
      state = next;
      renderLanguage();
      receivedAt = performance.now();
      timeline.update(state);
      var s = state.session;
      el("connection").textContent = !s
        ? "Démarre la capture TV pour commencer."
        : s.elapsedMs - s.capturedThroughMs > 12000
          ? "Aucune capture récente · mémoire disponible"
          : "Capture reçue";
      if (s) {
        var list = el("conversation"),
          nearBottom =
            list.scrollHeight - list.clientHeight - list.scrollTop < 80;
        el("coverage").textContent =
          "Capturé " +
          time(s.capturedThroughMs) +
          " · analysé " +
          time(s.analyzedThroughMs) +
          " · " +
          s.pending +
          " en attente" +
          (s.gaps.length
            ? " · " + s.gaps.length + " lacune(s) d’analyse"
            : "") +
          (state.captureGaps && state.captureGaps.length
            ? " · " + state.captureGaps.length + " interruption(s) de capture"
            : "");
        state.chat.jobs.forEach(renderJob);
        if (
          !reading &&
          document.activeElement !== list &&
          (nearBottom || followLatest)
        )
          list.scrollTop = list.scrollHeight;
        followLatest = false;
      }
      el("send").disabled = !s || submitting;
    } catch (error) {
      el("connection").textContent = "Serveur inaccessible · reconnexion…";
      el("send").disabled = true;
    }
    setTimeout(poll, 1000);
  }
  el("ask").onsubmit = async function (event) {
    event.preventDefault();
    var question = el("question").value.trim(),
      at = selectedMoment
        ? { sessionId: selectedMoment.sessionId, ms: selectedMoment.endMs }
        : anchor || point();
    if (!question || !at || submitting) return;
    submitting = true;
    el("send").disabled = true;
    el("error").textContent = "";
    // Release the IME immediately, including submissions made with the keyboard's Enter.
    // Do not wait for HTTP or move focus again when the answer arrives.
    el("question").blur();
    keyboardVisible = false;
    el("dictate").focus();
    anchor = null;
    try {
      await client.ask(
        question,
        at.sessionId,
        at.ms,
        selectedMoment ? { firstId: selectedMoment.segmentIds[0], lastId: selectedMoment.segmentIds[selectedMoment.segmentIds.length - 1] } : undefined,
      );
      if (el("question").value.trim() === question) el("question").value = "";
      followLatest = true;
    } catch (error) {
      showError(error);
    } finally {
      submitting = false;
    }
  };
  el("dictate").focus();
  poll();
})();
