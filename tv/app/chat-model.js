(function (root) {
  "use strict";
  // Pure view model for a chat job card. Technical failures (error, timeout, cancellation) are shown
  // as such, with the redacted Codex diagnostic; "Contexte insuffisant" is reserved for a completed
  // answer that abstains for lack of evidence. `preview` (streamed, unvalidated model answer) and
  // `provisional` (automatic memory summary) have distinct provenance and are never merged.
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
  var tvlensText = typeof module === "object" && module && module.exports ? module.require("./text.js") : root.TVLensText;
  var tvlensFinite = tvlensText.finite,
    tvlensClock = tvlensText.clock;
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
  function jobTimeout(job, context) {
    if (job.timeoutMs > 0) return job.timeoutMs;
    if (context.timeoutMs > 0) return context.timeoutMs;
    return TVLENS_POLL.timeoutMs;
  }
  // Live line of a card: place in the queue, or elapsed time against the ceiling really enforced for
  // this question (job.timeoutMs). `serverNowMs` is the clock of the server stamps, extrapolated by the
  // caller with a monotonic delta: the wall clock of the TV is never compared with a server stamp.
  // Without a server clock (older server), `localElapsedMs` counts from when the card was first seen
  // running, which needs no synchronisation either.
  function describeJobProgress(job, context) {
    var c = context || {},
      ceiling = jobTimeout(job, c);
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
      var suffix = queued.length > 1 ? " sur " + queued.length : "";
      return {
        status: "queued",
        position: position || null,
        total: queued.length,
        elapsedMs: null,
        timeoutMs: ceiling,
        label: position ? "En file · position " + position + suffix : "En file",
      };
    }
    if (job.status !== "running") return null;
    var elapsed = null;
    if (tvlensFinite(c.serverNowMs) && tvlensFinite(job.startedAt)) elapsed = c.serverNowMs - job.startedAt;
    else if (tvlensFinite(c.localElapsedMs)) elapsed = c.localElapsedMs;
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
  // Le diagnostic reste celui déjà expurgé par le serveur.
  function describeErrorDetail(detail, view) {
    if (!detail) return;
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
  function describeFailedJob(job, view) {
    view.error =
      job.message ||
      { error: "Erreur technique.", timeout: "Délai atteint.", cancelled: "Recherche annulée." }[job.status];
    describeErrorDetail(job.errorDetail, view);
    var result = job.result;
    // Le résultat de repli n'est pas un verdict : seules les observations réelles sont conservées.
    if (result && result.observations && result.observations.length) {
      view.kindLabel = "Observations partielles";
      view.answer = result.answer;
      view.result = result;
      view.limits = result.limits || [];
    }
  }
  // context (optional): { jobs, serverNowMs, timeoutMs, localElapsedMs } for the live line.
  function describeJob(job, context) {
    var result = job.result || null,
      failed = ["error", "timeout", "cancelled"].indexOf(job.status) >= 0,
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
    if (failed) describeFailedJob(job, view);
    else if (result) {
      view.kindLabel = TVLENS_KIND_LABELS[result.kind] || "Réponse";
      view.answer = result.answer;
      view.result = result;
      view.limits = result.limits || [];
    }
    if (failed || !result) {
      if (job.preview) {
        view.previewLabel = failed ? "Réponse provisoire interrompue (non validée)" : "Réponse provisoire";
        view.preview = job.preview;
      }
      if (job.provisional) {
        view.provisionalLabel = "Résumé automatique partiel";
        view.provisional = job.provisional;
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
  var api = {
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
    jobActive: tvlensJobActive,
  };
  root.TVLensChatModel = api;
  if (typeof module === "object" && module && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
