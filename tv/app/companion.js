(function () {
  "use strict";
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
      target = key === 38 ? el("dictate") : el("capture");
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
    text(node, "h2", job.question);
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
    if (job.result) {
      text(
        node,
        "small",
        {
          observation: "Observations de la vidéo",
          external: "Réponse avec sources",
          explanation: "Explication générale",
          insufficient: "Contexte insuffisant",
        }[job.result.kind] || "Réponse",
      );
      text(node, "p", job.result.answer);
      (job.result.hypotheses || []).forEach(function (h) {
        text(node, "small", "Hypothèse : " + (h.text || h));
      });
      (job.result.citations || []).forEach(function (c) {
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
      (job.result.sources || []).forEach(function (s) {
        text(node, "p", (s.title || "Source") + "\n" + s.url);
      });
      (job.result.limits || []).forEach(function (v) {
        text(node, "small", v);
      });
    } else if (job.preview || job.provisional) {
      text(node, "small", "Réponse provisoire");
      text(node, "p", job.preview || job.provisional);
    }
    if (job.status !== "done") text(node, "small", job.message || "");
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
