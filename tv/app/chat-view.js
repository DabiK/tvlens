(function (root) {
  "use strict";
  function set(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }
  function text(context, parent, tag, value) {
    var node = context.document.createElement(tag);
    node.textContent = value;
    parent.appendChild(node);
    return node;
  }
  function mediaLabel(context, id) {
    var s = context.state.session,
      segment = (s.segments || []).find(function (item) { return item.id === id; }),
      // La vue légère ne liste que les indisponibles ; l'état complet détaille chaque segment.
      missing = s.unavailableIds ? s.unavailableIds.indexOf(id) >= 0 : !(segment && segment.available);
    if (!missing) return "passage conservé";
    // « unreadable » signale une vidéo sans image exploitable ; le résumé et les captures restent conservés.
    return {
      "not-kept": "vidéo non conservée", missing: "vidéo introuvable", expired: "vidéo expirée", unreadable: "vidéo illisible",
    }[segment && segment.mediaReason] || "vidéo indisponible";
  }
  function renderAnswer(context, node, view, cited) {
    if (view.error) {
      text(context, node, "small", view.authRequired ? "Reconnexion Codex requise" : "Erreur technique").className = "answer-kind";
      text(context, node, "p", view.error).className = "chat-answer";
      if (view.errorDetail) text(context, node, "small", view.errorDetail);
    }
    if (view.answer !== null) {
      text(context, node, "small", view.kindLabel).className = "answer-kind";
      text(context, node, "p", view.answer).className = "chat-answer";
      (view.result.hypotheses || []).forEach(function (h) { text(context, node, "small", "Hypothèse : " + (h.text || h)); });
      (view.result.citations || []).forEach(function (citation, index) {
        text(context, node, "small", context.time(citation.startMs) + "–" + context.time(citation.endMs) + " · " + cited[index]);
      });
      (view.result.sources || []).forEach(function (source) {
        text(context, node, "p", (source.title || "Source") + "\n" + source.url).className = "source-card";
      });
      view.limits.forEach(function (limit) { text(context, node, "small", limit); });
    }
    if (view.preview) {
      text(context, node, "small", view.previewLabel);
      text(context, node, "p", view.preview);
    }
    if (view.provisional) {
      text(context, node, "small", view.provisionalLabel);
      text(context, node, "p", view.provisional);
    }
    if (view.message !== null) text(context, node, "small", view.message);
  }
  function renderFreshness(context, node, job, view) {
    if (!view.freshness) return;
    var fresh = text(context, node, "small", "");
    fresh.className = "job-freshness";
    if (context.model.jobActive(job)) fresh.textContent = view.freshness;
    else {
      // Une réponse terminée garde le libellé court ; la lecture de la conversation révèle la phrase entière.
      text(context, fresh, "span", view.freshnessShort).className = "fresh-short";
      text(context, fresh, "span", view.freshness).className = "fresh-detail";
      fresh.title = view.freshness;
    }
  }
  function showError(context, error) {
    context.el("error").textContent = error.message;
  }
  function renderJob(context, job) {
    var cited = ((job.result && job.result.citations) || []).map(function (citation) { return mediaLabel(context, citation.id); }),
      // La progression reste hors de cette signature : une seconde écoulée ne reconstruit pas la carte et ne déplace pas le focus.
      serialized = JSON.stringify([job, cited]),
      card = context.cards[job.id];
    if (card && card.serialized === serialized) return;
    if (!card) {
      card = context.cards[job.id] = { node: context.document.createElement("article") };
      card.node.dataset.job = job.id;
      context.el("conversation").appendChild(card.node);
    }
    card.serialized = serialized;
    var node = card.node,
      focused = node.contains(context.document.activeElement),
      view = context.model.describeJob(job),
      active = context.model.jobActive(job);
    node.removeAttribute("data-pending");
    node.replaceChildren();
    text(context, node, "h2", job.question).className = "chat-question";
    text(context, node, "small", "Moment " + context.time(job.anchorMs) + (active ? "" : " · " + view.statusLabel));
    card.progress = active ? text(context, node, "small", view.statusLabel) : null;
    if (card.progress) card.progress.className = "job-progress";
    renderFreshness(context, node, job, view);
    if (job.metrics) text(context, node, "small",
      "Attente " + (job.metrics.waitMs / 1000).toFixed(1) + " s · traitement " + (job.metrics.totalMs / 1000).toFixed(1) + " s");
    renderAnswer(context, node, view, cited);
    if (active) {
      var cancel = text(context, node, "button", "Annuler cette question");
      cancel.onclick = function () {
        context.actions.cancel(job.id).then(context.actions.kick, function (error) { showError(context, error); });
      };
      if (focused) cancel.focus();
    } else if (focused) context.el("dictate").focus();
  }
  // Le temps serveur avance uniquement par le delta monotone depuis le dernier corps, jamais un 304.
  function tick(context) {
    if (!context.state || !context.state.chat) return;
    var now = context.now(),
      serverNow = context.finite(context.state.serverNowMs) ? context.state.serverNowMs + now - context.receivedAt : null,
      jobs = context.state.chat.jobs;
    jobs.forEach(function (job) {
      var card = context.cards[job.id];
      if (!card || !card.progress) return;
      if (job.status === "running" && card.runningSince === undefined) card.runningSince = now;
      var live = context.model.describeJobProgress(job, {
        jobs: jobs, serverNowMs: serverNow, timeoutMs: context.state.chat.timeoutMs,
        localElapsedMs: card.runningSince === undefined ? null : now - card.runningSince,
      });
      if (live) set(card.progress, live.label);
    });
  }
  var BOTTOM_MARGIN_PX = 80;
  function followsBottom(context, force) {
    var list = context.el("conversation");
    return !context.isReading() && !list.contains(context.document.activeElement) &&
      (force || list.scrollHeight - list.clientHeight - list.scrollTop < BOTTOM_MARGIN_PX);
  }
  function reset(context) {
    context.cards = {};
    context.state = null;
    context.sessionId = null;
    context.submitting = null;
    context.followLatest = true;
    context.el("conversation").replaceChildren();
    renderCancel(context);
    renderAvailability(context);
  }
  // Le bouton fixe garde sa cible : la question en cours, sinon la dernière entrée en file.
  function renderCancel(context) {
    var target = context.state && context.state.chat ? context.model.cancelTarget(context.state.chat.jobs) : null,
      button = context.el("cancel-question"), focused = context.document.activeElement === button;
    set(button, target && target.status === "queued" ? "Retirer la question en file" : "Annuler la question en cours");
    if (button.hidden !== !target) button.hidden = !target;
    if (!target && focused) context.el("dictate").focus();
  }
  function cancelCurrent(context) {
    var target = context.state && context.state.chat ? context.model.cancelTarget(context.state.chat.jobs) : null;
    if (!target) return;
    context.actions.cancel(target.id).then(function (answer) {
      if (answer && answer.cancelled === false) context.el("error").textContent = "Cette question était déjà terminée.";
      context.actions.kick();
    }, function (error) { showError(context, error); });
  }
  function receive(context, state, receivedAt) {
    var id = state.session ? state.session.id : null;
    if (context.sessionId !== id) reset(context);
    var follow = followsBottom(context, context.followLatest);
    context.sessionId = id;
    context.state = state;
    context.receivedAt = receivedAt;
    if (state.session) state.chat.jobs.forEach(function (job) { renderJob(context, job); });
    tick(context);
    renderCancel(context);
    if (follow) context.el("conversation").scrollTop = context.el("conversation").scrollHeight;
    context.followLatest = false;
    renderAvailability(context);
  }
  function renderAvailability(context) {
    var disabled = !context.online || !context.state || !context.state.session || !!context.submitting;
    if (context.el("send").disabled !== disabled) context.el("send").disabled = disabled;
  }
  // L'écho rend la question visible avant HTTP ; son nœud devient la carte du job dès réception de son identifiant.
  function addPending(context, question, anchorMs) {
    var list = context.el("conversation"), node = context.document.createElement("article");
    node.dataset.pending = "true";
    text(context, node, "h2", question).className = "chat-question";
    text(context, node, "small", "Moment " + context.time(anchorMs) + " · Envoi…");
    var follow = followsBottom(context, true);
    list.appendChild(node);
    if (follow) list.scrollTop = list.scrollHeight;
    return node;
  }
  function acknowledge(context, pending, answer, anchorMs) {
    var id = answer && answer.id;
    if (!id || context.cards[id] || !pending.isConnected) pending.remove();
    else {
      pending.dataset.job = id;
      pending.lastChild.textContent = "Moment " + context.time(anchorMs) + " · Reçue par le serveur…";
      context.cards[id] = { node: pending, serialized: "" };
    }
  }
  async function submit(context, target) {
    var question = context.el("question").value.trim();
    if (!question || !target || context.submitting || !context.online || !context.state || !context.state.session) return;
    var at = { sessionId: target.sessionId, ms: target.ms, range: target.range && Object.assign({}, target.range) };
    var submission = {};
    context.submitting = submission;
    renderAvailability(context);
    context.el("error").textContent = "";
    // L'IME est libéré avant toute attente ; une réponse HTTP ne reprend jamais le focus.
    context.el("question").blur();
    context.el("dictate").focus();
    context.actions.onSubmit();
    var pending = addPending(context, question, at.ms);
    try {
      var answer = await context.actions.ask(question, at.sessionId, at.ms, at.range);
      if (context.submitting !== submission) return;
      acknowledge(context, pending, answer, at.ms);
      if (context.el("question").value.trim() === question) context.el("question").value = "";
      context.followLatest = true;
      // Le traitement démarre sur le serveur : le lire immédiatement plutôt qu'attendre le prochain tour.
      context.actions.kick();
    } catch (error) {
      if (context.submitting !== submission) return;
      // L'envoi a échoué : retirer l'écho sans perdre le texte, qui reste disponible pour réessayer.
      pending.remove();
      showError(context, error);
    } finally {
      if (context.submitting === submission) {
        context.submitting = null;
        renderAvailability(context);
      }
    }
  }
  function createChatView(options) {
    var context = {
      document: options.document, el: options.elements, model: options.model, time: options.text.clock,
      isReading: options.isReading, sessionId: null, finite: options.text.finite, now: options.now,
      actions: options.actions, state: null, cards: {}, receivedAt: 0, online: true, submitting: null, followLatest: true,
    };
    context.el("cancel-question").onclick = function () { cancelCurrent(context); };
    renderAvailability(context);
    return {
      reset: function () { reset(context); },
      receive: function (state, receivedAt) { receive(context, state, receivedAt); },
      tick: function () { tick(context); },
      submit: function (target) { return submit(context, target); },
      setOnline: function (online) {
        context.online = online;
        renderAvailability(context);
      },
    };
  }
  var api = { createChatView: createChatView };
  root.TVLensChatView = api;
  if (typeof module === "object" && module && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
