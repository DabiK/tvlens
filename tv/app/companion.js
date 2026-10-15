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
var TVLENS_STATUS_LABELS = {
  queued: "En file",
  running: "En cours",
  done: "Terminé",
  error: "Erreur",
  cancelled: "Annulé",
  timeout: "Délai atteint",
};
// Poll cadence. While a question waits or runs: the light chat view, fast, and the panel view one
// poll out of four so that the timeline keeps moving; otherwise the panel view once per second.
// timeoutMs is only the fallback ceiling of a question saved before the server published its own.
// viewRetryMs: how long the complete state stands in after a light view was refused in passing.
// backoffMaxMs: the longest wait between two polls while the server does not answer.
var TVLENS_POLL = { activeMs: 250, idleMs: 1000, panelEvery: 4, timeoutMs: 300000, viewRetryMs: 10000, backoffMaxMs: 8000 };
// Session identifiers are the server's randomUUID(): the local controller takes nothing else.
var TVLENS_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// The top of this file is not wrapped: a name added here becomes a global of the page and takes the tvlens prefix.
var tvlensText = typeof module === "object" && module && module.exports ? require("./text.js") : window.TVLensText;
var tvlensFinite = tvlensText.finite,
  tvlensClock = tvlensText.clock,
  tvlensPlural = tvlensText.plural;
function tvlensJobActive(job) {
  return job.status === "queued" || job.status === "running";
}
// The question the fixed "cancel" button acts on: the running one, otherwise the last one queued.
function tvlensCancelTarget(jobs) {
  var list = jobs || [],
    running = list.filter(function (job) {
      return job.status === "running";
    }),
    queued = list.filter(function (job) {
      return job.status === "queued";
    });
  return running[0] || queued[queued.length - 1] || null;
}
// Live line of a card: place in the queue, or elapsed time against the ceiling really enforced for
// this question (job.timeoutMs). `serverNowMs` is the clock of the server stamps, extrapolated by the
// caller with a monotonic delta: the wall clock of the TV is never compared with a server stamp.
// Without a server clock (older server), `localElapsedMs` counts from when the card was first seen
// running, which needs no synchronisation either.
function describeJobProgress(job, context) {
  var c = context || {},
    ceiling =
      job.timeoutMs > 0
        ? job.timeoutMs
        : c.timeoutMs > 0
          ? c.timeoutMs
          : TVLENS_POLL.timeoutMs;
  if (job.status === "queued") {
    var queued = (c.jobs || []).filter(function (other) {
        return other.status === "queued";
      }),
      position =
        queued
          .map(function (other) {
            return other.id;
          })
          .indexOf(job.id) + 1;
    return {
      status: "queued",
      position: position || null,
      total: queued.length,
      elapsedMs: null,
      timeoutMs: ceiling,
      label: position
        ? "En file · position " +
          position +
          (queued.length > 1 ? " sur " + queued.length : "")
        : "En file",
    };
  }
  if (job.status !== "running") return null;
  var elapsed =
    tvlensFinite(c.serverNowMs) && tvlensFinite(job.startedAt)
      ? c.serverNowMs - job.startedAt
      : tvlensFinite(c.localElapsedMs)
        ? c.localElapsedMs
        : null;
  if (elapsed !== null) elapsed = Math.max(0, Math.min(ceiling, elapsed));
  return {
    status: "running",
    position: null,
    total: null,
    elapsedMs: elapsed,
    timeoutMs: ceiling,
    label:
      elapsed === null
        ? "En cours · arrêt au plus tard à " + tvlensClock(ceiling)
        : "En cours · " + tvlensClock(elapsed) + " / " + tvlensClock(ceiling) + " max",
  };
}
// What the question could consult when it froze (job.availability): never widened afterwards.
function describeJobFreshness(job) {
  var a = job.availability;
  if (!a || typeof a !== "object") return null;
  var last = a.lastPassage;
  if (!last || !tvlensFinite(a.throughMs))
    return "Aucun passage n’était encore reçu au moment de la question";
  return (
    "Mémoire disponible jusqu’à " +
    tvlensClock(a.throughMs) +
    " au moment de la question" +
    (tvlensFinite(last.startMs) && tvlensFinite(last.endMs)
      ? " · dernier passage reçu " + tvlensClock(last.startMs) + "–" + tvlensClock(last.endMs)
      : "")
  );
}
// The same fact in a few words, for an answer that is over: the whole sentence is not repeated above
// every answer of the conversation, it stays one step away (reading mode, title of the label).
function describeJobFreshnessShort(job) {
  var a = job.availability;
  if (!a || typeof a !== "object") return null;
  return a.lastPassage && tvlensFinite(a.throughMs)
    ? "Mémoire jusqu’à " + tvlensClock(a.throughMs)
    : "Aucun passage reçu à l’envoi";
}
// context (optional): { jobs, serverNowMs, timeoutMs, localElapsedMs } for the live line.
function describeJob(job, context) {
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
      statusLabel: TVLENS_STATUS_LABELS[job.status] || job.status,
      progress: describeJobProgress(job, context),
      freshness: describeJobFreshness(job),
      freshnessShort: describeJobFreshnessShort(job),
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
// Which resource the next poll reads, and how long to wait after it.
// options: { legacy (the complete state stands in for the views), activeMs, idleMs, failures (polls in a
// row that brought nothing back) }.
function tvlensPollPolicy(state, turn, options) {
  var o = options || {},
    activeMs = o.activeMs > 0 ? o.activeMs : TVLENS_POLL.activeMs,
    idleMs = o.idleMs > 0 ? o.idleMs : TVLENS_POLL.idleMs,
    jobs = (state && state.chat && state.chat.jobs) || [],
    moving = jobs.some(tvlensJobActive),
    // A server that does not answer is not asked faster because a question is in progress: the wait
    // starts at the idle cadence and doubles, bounded, until a poll comes back.
    backoff =
      o.failures > 0
        ? Math.min(Math.max(idleMs, TVLENS_POLL.backoffMaxMs), idleMs * Math.pow(2, Math.min(o.failures, 10) - 1))
        : 0;
  // An older server only has the complete state: once per second, as the panel always did.
  if (o.legacy) return { view: null, delayMs: backoff || idleMs };
  return {
    // The chat view carries no timeline: it is only read once a panel view gave this session one.
    view:
      moving && state.timeline && turn % TVLENS_POLL.panelEvery ? "chat" : "panel",
    delayMs: backoff || (moving ? activeMs : idleMs),
  };
}
// What the refusal of a light view means. "unknown": the server has no views (an older one routes on
// the exact URL, 404) or says it does not know this one; the complete state from now on. "passing":
// any other 400, which this server answers to every exception without a status; the complete state
// for a while, then the views again. null: not about the view at all (outage, token, server error).
function tvlensViewRefusal(error) {
  if (!error || !error.status) return null;
  if (error.status === 404 || (error.status === 400 && /vue d.état inconnue/i.test(error.message || "")))
    return "unknown";
  return error.status === 400 ? "passing" : null;
}
// Bookkeeping of the poll loop, apart from the DOM so that it is tested as it runs.
// options: { activeMs, idleMs, viewRetryMs }.
function TvlensPollPlan(options) {
  this.options = options || {};
  this.turn = 0;
  // The server does not know the views: the complete state, for good.
  this.legacy = false;
  // A view was refused in passing: the complete state until then, the views again afterwards.
  this.viewsAfter = 0;
  // Polls in a row that brought nothing back.
  this.failures = 0;
}
TvlensPollPlan.prototype.policy = function (state, now) {
  return tvlensPollPolicy(state, this.turn, {
    legacy: this.legacy || now < this.viewsAfter,
    activeMs: this.options.activeMs,
    idleMs: this.options.idleMs,
    failures: this.failures,
  });
};
// True when the complete state is to be read in place of the view that was just refused.
TvlensPollPlan.prototype.refused = function (error, now) {
  var kind = tvlensViewRefusal(error);
  if (kind === "unknown") this.legacy = true;
  else if (kind === "passing")
    this.viewsAfter =
      now + (this.options.viewRetryMs > 0 ? this.options.viewRetryMs : TVLENS_POLL.viewRetryMs);
  return !!kind;
};
// One poll: the resource the policy names, the complete state in its place when that view is refused.
// client: { state(view) }; now: monotonic clock in milliseconds. Resolves with { answer, view }.
TvlensPollPlan.prototype.read = async function (client, state, now) {
  var wanted = this.policy(state, now()).view,
    answer;
  this.turn++;
  try {
    try {
      answer = await client.state(wanted);
    } catch (error) {
      if (!wanted || !this.refused(error, now())) throw error;
      wanted = null;
      answer = await client.state();
    }
  } catch (error) {
    this.failures++;
    throw error;
  }
  this.failures = 0;
  return { answer: answer, view: wanted };
};
// How long to wait before the next poll.
TvlensPollPlan.prototype.delay = function (state, now) {
  return this.policy(state, now).delayMs;
};
// Reference of the "new results" count of the header button: what the registry held when the panel
// first saw this session. While the server still reads the registry saved with the session
// (registry.ready false) its sequences are not final: the reference is taken again on the first
// state where it is ready, so a restored history is not counted as news.
function tvlensBadgeReference(reference, marks) {
  return !reference ||
    reference.sessionId !== marks.sessionId ||
    reference.unsettled ||
    marks.unsettled
    ? marks
    : reference;
}
function tvlensRegistryMarks(state) {
  var s = (state && state.surveillance) || {};
  return {
    sessionId: state && state.session ? state.session.id : null,
    overlay: (s.overlay && s.overlay.seq) || 0,
    signals: (s.signals && s.signals.seq) || 0,
    undetermined: (s.counts && s.counts.undetermined) || 0,
    shown: 0,
    unsettled: !!(s.registry && s.registry.ready === false),
  };
}
// State held by the panel after a new body. Questions are merged by identifier: a light view only
// lists the recent ones, and an absence is not a deletion. A chat view refreshes the conversation,
// the session header and the surveillance; it never erases what the panel view brought.
function tvlensMergeState(previous, next, view) {
  var id = function (state) {
    return state && state.session ? state.session.id : null;
  };
  if (!previous || id(previous) !== id(next)) return next;
  var known = {},
    order = [];
  [previous.chat, next.chat].forEach(function (chat) {
    ((chat && chat.jobs) || []).forEach(function (job) {
      if (!(job.id in known)) order.push(job.id);
      known[job.id] = job;
    });
  });
  var number = function (jobId) {
    return Number(String(jobId).split("-").pop()) || 0;
  };
  order.sort(function (a, b) {
    return number(a) - number(b);
  });
  var chat = Object.assign({}, next.chat, {
    jobs: order.map(function (jobId) {
      return known[jobId];
    }),
  });
  if (view !== "chat") return Object.assign({}, next, { chat: chat });
  return Object.assign({}, previous, next, {
    chat: chat,
    session: next.session
      ? Object.assign({}, previous.session, next.session)
      : null,
  });
}
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
    submitting = false,
    cards = {},
    followLatest = true,
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
      state.transcription = value;
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
  // (local storage, never required), and passed on to the closed-panel display of the local controller.
  var settings = (function () {
    var stored = {};
    try {
      stored = JSON.parse(window.localStorage.getItem("tvlens.overlay") || "{}") || {};
    } catch (_) {}
    return {
      displayMs: Surveillance.displayChoice(stored.displayMs || config.overlayMs),
      alerts: stored.alerts !== false,
      chosen: stored.displayMs !== undefined || stored.alerts !== undefined,
    };
  })();
  var ambientKnown = true;
  function ambient(route, body) {
    return control.request(route, body).then(
      function (value) {
        ambientKnown = !!(value && value.supported);
        return value;
      },
      function (error) {
        if (error.status === 404) ambientKnown = false;
        throw error;
      },
    );
  }
  // Best effort towards the local controller: an older one answers 404 and nothing here depends on it.
  function tell(route) {
    if (ambientKnown)
      control.request(route, {}).catch(function (error) {
        if (error.status === 404) ambientKnown = false;
      });
  }
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
    onShown: function (card, sessionId) {
      if (badge) badge.shown++;
      renderBadge();
      // The closed-panel display must not show again what was read here. The numbering starts over
      // with each session: the declaration names the session whose card was shown.
      if (tvlensFinite(card.seq) && TVLENS_SESSION_ID.test(sessionId || ""))
        tell("/ambient/seen/" + sessionId + "/overlay/" + card.seq);
    },
  });
  surveillance = new Surveillance.View({
    client: client,
    ambient: ambient,
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
    // Viewer action: remembered on the TV, and passed on to the closed-panel display.
    setSettings: function (patch) {
      Object.assign(settings, patch, { chosen: true });
      try {
        window.localStorage.setItem(
          "tvlens.overlay",
          JSON.stringify({ displayMs: settings.displayMs, alerts: settings.alerts }),
        );
      } catch (_) {}
      if (patch.displayMs) tell("/ambient/display/" + patch.displayMs / 1000);
      if (patch.alerts !== undefined) tell("/ambient/alerts/" + (patch.alerts ? "on" : "off"));
      overlay.tick();
    },
    // Without a choice made on this panel, the choices kept by the local controller apply.
    adoptSettings: function (remote) {
      if (settings.chosen) return;
      if (typeof remote.alerts === "boolean") settings.alerts = remote.alerts;
      if (remote.displayMs) settings.displayMs = Surveillance.displayChoice(remote.displayMs);
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
  // Clock of the server stamps, carried forward with a monotonic delta since the body was received:
  // a 304 keeps the body, and the wall clock of the TV is never involved.
  function serverNow() {
    return state && tvlensFinite(state.serverNowMs)
      ? state.serverNowMs + (performance.now() - receivedAt)
      : null;
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
  // Why the video of a cited passage can or cannot be replayed, in the viewer's words.
  function mediaLabel(id) {
    var s = state.session,
      segment = (s.segments || []).find(function (item) {
        return item.id === id;
      }),
      // A light view lists what is not replayable; the complete state says it passage by passage.
      missing = s.unavailableIds
        ? s.unavailableIds.indexOf(id) >= 0
        : !(segment && segment.available);
    if (!missing) return "passage conservé";
    return (
      // "unreadable": the recorder received no image for this passage; its summary and its images are kept.
      { "not-kept": "vidéo non conservée", missing: "vidéo introuvable", expired: "vidéo expirée", unreadable: "vidéo illisible" }[
        segment && segment.mediaReason
      ] || (s.retention === "rolling" ? "vidéo expirée" : "vidéo indisponible")
    );
  }
  function renderJob(job) {
    var cited = ((job.result && job.result.citations) || []).map(function (c) {
        return mediaLabel(c.id);
      }),
      serialized = JSON.stringify([job, cited]),
      card = cards[job.id];
    if (card && card.serialized === serialized) return;
    if (!card) {
      card = cards[job.id] = { node: document.createElement("article") };
      card.node.dataset.job = job.id;
      el("conversation").appendChild(card.node);
    }
    card.serialized = serialized;
    var node = card.node,
      focused = node.contains(document.activeElement),
      view = describeJob(job);
    node.removeAttribute("data-pending");
    node.replaceChildren();
    text(node, "h2", job.question).className = "chat-question";
    // A moving question tells its state in the live line below (queue position, elapsed / ceiling).
    // That line is filled by renderProgress, outside the signature above, so that a second passing
    // never rebuilds the card or moves the focus.
    text(
      node,
      "small",
      "Moment " + time(job.anchorMs) + (tvlensJobActive(job) ? "" : " · " + view.statusLabel),
    );
    card.progress = tvlensJobActive(job) ? text(node, "small", view.statusLabel) : null;
    if (card.progress) card.progress.className = "job-progress";
    if (view.freshness) {
      var fresh = text(node, "small", "");
      fresh.className = "job-freshness";
      if (tvlensJobActive(job)) fresh.textContent = view.freshness;
      else {
        // An answer that is over keeps the short label; the whole sentence takes its place while the
        // messages are being read (OK on the conversation), and names the label.
        text(fresh, "span", view.freshnessShort).className = "fresh-short";
        text(fresh, "span", view.freshness).className = "fresh-detail";
        fresh.title = view.freshness;
      }
    }
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
      (view.result.citations || []).forEach(function (c, index) {
        text(node, "small", time(c.startMs) + "–" + time(c.endMs) + " · " + cited[index]);
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
    if (tvlensJobActive(job)) {
      var cancel = document.createElement("button");
      cancel.textContent = "Annuler cette question";
      cancel.onclick = function () {
        client.cancel(job.id).then(kickPoll, showError);
      };
      node.appendChild(cancel);
      if (focused) cancel.focus();
    } else if (focused) el("dictate").focus();
  }
  // Elapsed time and queue position, written into the live line of each moving card.
  function renderProgress() {
    if (!state || !state.chat) return;
    var jobs = state.chat.jobs,
      now = serverNow();
    jobs.forEach(function (job) {
      var card = cards[job.id];
      if (!card || !card.progress) return;
      if (job.status === "running" && card.runningSince === undefined)
        card.runningSince = performance.now();
      var live = describeJobProgress(job, {
        jobs: jobs,
        serverNowMs: now,
        timeoutMs: state.chat.timeoutMs,
        localElapsedMs:
          card.runningSince === undefined ? null : performance.now() - card.runningSince,
      });
      if (live) set(card.progress, live.label);
    });
  }
  // Fixed button, in the focus graph: cancels the running question, otherwise the last one queued.
  function renderCancel() {
    var target = state && state.chat ? tvlensCancelTarget(state.chat.jobs) : null,
      button = el("cancel-question"),
      focused = document.activeElement === button;
    set(
      button,
      target && target.status === "queued"
        ? "Retirer la question en file"
        : "Annuler la question en cours",
    );
    flag(button, "hidden", !target);
    if (!target && focused) el("dictate").focus();
  }
  el("cancel-question").onclick = function () {
    var target = state && state.chat ? tvlensCancelTarget(state.chat.jobs) : null;
    if (!target) return;
    client.cancel(target.id).then(function (answer) {
      if (answer && answer.cancelled === false)
        el("error").textContent = "Cette question était déjà terminée.";
      kickPoll();
    }, showError);
  };
  function showError(error) {
    el("error").textContent = error.message;
  }
  // Connection line and send button. Recomputed every second from the extrapolated session clock: a
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
    flag(el("send"), "disabled", !s || submitting);
  }
  function render() {
    var s = state.session;
    stats.renders++;
    renderLanguage();
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
      var list = el("conversation"),
        nearBottom =
          list.scrollHeight - list.clientHeight - list.scrollTop < 80,
        // The light views count the gaps; the complete state lists them.
        gaps = s.gapCount !== undefined ? s.gapCount : (s.gaps || []).length,
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
      state.chat.jobs.forEach(renderJob);
      renderProgress();
      if (
        !reading &&
        document.activeElement !== list &&
        (nearBottom || followLatest)
      )
        list.scrollTop = list.scrollHeight;
      followLatest = false;
    }
    renderCancel();
    overlay.update(state);
    surveillance.update();
    renderBadge();
  }
  // A new body: merged into what the panel holds, then drawn. Never called for a 304.
  function receive(next, viewName) {
    var before = state && state.session ? state.session.id : null,
      after = next.session ? next.session.id : null;
    if (state && before !== after) {
      cards = {};
      clearMoment();
      el("conversation").replaceChildren();
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
  var stats = { polls: 0, notModified: 0, renders: 0, legacy: false, failures: 0 },
    pollTimer = null,
    polling = false,
    kicked = false,
    plan = new TvlensPollPlan({
      activeMs: config.activePollMs,
      idleMs: config.idlePollMs,
      viewRetryMs: config.viewRetryMs,
    });
  function monotonic() {
    return performance.now();
  }
  // One poll in flight at a time. A kick cancels the wait; during a poll it asks for one more right after.
  function kickPoll() {
    if (polling) kicked = true;
    else {
      clearTimeout(pollTimer);
      poll();
    }
  }
  async function poll() {
    if (polling) return;
    polling = true;
    kicked = false;
    try {
      // A refused view is replaced by the complete state inside the plan: for good when the server
      // does not know the views (an older one), for a while after a passing refusal.
      var read = await plan.read(client, state, monotonic);
      stats.polls++;
      online = true;
      if (read.answer.notModified) {
        // Same revision: the held body stays, nothing is redrawn; clocks keep running locally.
        stats.notModified++;
        renderStatus();
      } else receive(read.answer.value, read.view);
    } catch (error) {
      online = false;
      // A refused token is not an outage: retrying will not help until the TV is paired again.
      el("connection").textContent =
        error.status === 401
          ? "Appairage refusé par le serveur · vérifie le jeton de cette TV."
          : "Serveur inaccessible · reconnexion…";
      el("send").disabled = true;
    }
    stats.legacy = plan.legacy;
    stats.failures = plan.failures;
    polling = false;
    // After a failure the wait grows whatever the held state says: a question shown "in progress"
    // must not turn an outage into four requests a second.
    pollTimer = setTimeout(poll, kicked ? 0 : plan.delay(state, monotonic()));
  }
  // Immediate echo: the question is on screen before the network answers. Its node becomes the card
  // of the job once the server names it, so the first poll redraws it in place.
  function addPendingCard(question, anchorMs) {
    var list = el("conversation"),
      node = document.createElement("article");
    node.dataset.pending = "true";
    text(node, "h2", question).className = "chat-question";
    text(node, "small", "Moment " + time(anchorMs) + " · Envoi…");
    list.appendChild(node);
    if (!reading && document.activeElement !== list)
      list.scrollTop = list.scrollHeight;
    return node;
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
    var pending = addPendingCard(question, at.ms);
    try {
      var answer = await client.ask(
        question,
        at.sessionId,
        at.ms,
        selectedMoment ? { firstId: selectedMoment.segmentIds[0], lastId: selectedMoment.segmentIds[selectedMoment.segmentIds.length - 1] } : undefined,
      );
      var id = answer && answer.id;
      if (!id || cards[id] || !pending.isConnected) pending.remove();
      else {
        pending.dataset.job = id;
        pending.lastChild.textContent = "Moment " + time(at.ms) + " · Reçue par le serveur…";
        cards[id] = { node: pending, serialized: "" };
      }
      if (el("question").value.trim() === question) el("question").value = "";
      followLatest = true;
      // The answer starts on the server now: read it at once instead of waiting for the next turn.
      kickPoll();
    } catch (error) {
      // Not sent: the echo goes, the text stays in the field.
      pending.remove();
      showError(error);
    } finally {
      submitting = false;
      renderStatus();
    }
  };
  // Local clocks. The card on screen leaves at its deadline and the elapsed times advance even when
  // the server answers 304 or does not answer at all.
  setInterval(function () {
    overlay.tick();
  }, 250);
  setInterval(function () {
    renderStatus();
    renderProgress();
    surveillance.second();
  }, 1000);
  // Read by the smokes and handy on a bench: what the poll loop really did.
  window.tvlensPanel = {
    stats: stats,
    kick: kickPoll,
    state: function () {
      return state;
    },
  };
  el("dictate").focus();
  poll();
})();
