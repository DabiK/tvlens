(function (root) {
  "use strict";
  // Surveillance on the TV panel (tickets 05, 06, 07): pure view models first, then the remote-driven
  // view in the chat column and the bottom-left card shown while the panel is open.
  // Rules carried here rather than in the DOM:
  // - only a verification with at least one source may appear by itself on screen; a signal (video
  //   observation) and an undetermined, waiting, failed or cancelled claim are read in the history;
  // - a signal never borrows the label, the sources or the verdict of a web verification;
  // - the wording says what the sources do, never "true" or "false".
  var CARD_LABELS = {
    verification: "Sources consultées",
    signal: "Repéré dans la vidéo",
  };
  var ASSESSMENT_LABELS = {
    supported: "Concorde avec les sources",
    contradicted: "Contredit par les sources",
    mixed: "Sources partagées",
  };
  var CLAIM_LABELS = {
    detected: "En attente",
    queued: "En attente",
    running: "En cours",
    sourced: "Sourcée",
    undetermined: "Indéterminée",
    error: "Erreur",
    cancelled: "Annulée",
    noted: "Relevée dans la vidéo",
  };
  var REASONS = {
    "non vérifiable": "affirmation qui ne se vérifie pas par une recherche",
    "preuves insuffisantes":
      "les sources consultées ne suffisent pas pour conclure",
    "sources non confirmées":
      "les sources proposées n’ont pas pu être confirmées",
    "aucun verdict rendu":
      "la recherche n’a rendu aucun avis sur cette affirmation",
  };
  var SIGNAL_NOTE = "Observation de la vidéo, non vérifiée sur le web.";
  var EXAMPLES = [
    "Vérifie les chiffres annoncés.",
    "Vérifie les dates et les citations attribuées.",
    "Signale ce qui contredit ce qui a été dit plus tôt dans la vidéo.",
  ];
  var DISPLAY_CHOICES = [8000, 14000, 20000],
    DISPLAY_DEFAULT = 14000,
    PAGE = 20;
  var shared = typeof module === "object" && module && module.exports ? require("./text.js") : root.TVLensText,
    finite = shared.finite,
    clock = shared.clock,
    plural = shared.plural;
  function list(value) {
    return Array.isArray(value) ? value : [];
  }
  function range(startMs, endMs) {
    if (!finite(startMs)) return "";
    return clock(startMs) + (finite(endMs) ? "–" + clock(endMs) : "");
  }
  // A lateness is told with its cause and the number that belongs to it, never with a number that is 0.
  function caused(cause, count, one, many) {
    return cause + (count > 0 ? " : " + plural(count, one, many) : "") + ".";
  }
  // The server does word a 0: a single check still running 90 s after its claim was found, with nothing
  // queued behind it, is "Vérifications en retard : 0 affirmation en attente." What is late there is the
  // check under way, not an empty queue, and it is said so.
  var LATE_CHECK = "Vérification en cours : elle a pris du retard.";
  function spoken(label) {
    if (typeof label !== "string" || !label) return "";
    return /^Vérifications en retard : 0+ affirmations? en attente\.?$/.test(label) ? LATE_CHECK : label;
  }
  function host(url) {
    var match = /^https?:\/\/([^/?#:]+)/i.exec(String(url || ""));
    return match ? match[1].replace(/^www\./, "") : "";
  }
  function ordinal(id) {
    return Number(String(id).split("-").pop()) || 0;
  }

  // What may be shown by itself, bottom-left: sourced verifications and nothing else. signals.cards
  // is never read here, and a card of another kind filed among the overlay cards is dropped.
  function overlayCards(surveillance) {
    return list(surveillance && surveillance.overlay && surveillance.overlay.cards)
      .filter(function (card) {
        return (
          card &&
          card.kind === "verification" &&
          list(card.sources).length > 0 &&
          finite(card.seq)
        );
      });
  }

  /**
   * State line, counters and what the toggle may do.
   * @param {object|null} surveillance compact block of the polled state (snapshot brief of the core)
   * @param {{session?:{id:string,accepting?:boolean,readOnly?:boolean}|null}} context
   */
  function describeSurveillance(surveillance, context) {
    var session = (context && context.session) || null,
      s = surveillance && typeof surveillance === "object" ? surveillance : null,
      view = {
        available: !!s,
        enabled: !!(s && s.enabled),
        canStart: false,
        canStop: false,
        toggleLabel: "Activer la surveillance",
        status: "",
        instruction: "",
        counts: "",
        alerts: [],
        late: false,
        // The saved registry is still being read: counters and sequences are not final yet.
        restoring: false,
        // How the registry is kept when it is not saved with the session (memory only, unreadable file,
        // failed write), in the words of the server; null when it is saved.
        notice: null,
        // Claims in the registry: the unit of the counters above, not the number of history lines.
        total: 0,
        historyLabel: "Historique",
      };
    if (!s) {
      view.status = "Surveillance indisponible : serveur à mettre à jour.";
      return view;
    }
    var activity = s.activity || {},
      backlog = s.backlog || {},
      counts = s.counts || {},
      registry = s.registry && typeof s.registry === "object" ? s.registry : null,
      activation = s.activation || null;
    view.restoring = activity.state === "restoring" || !!(registry && registry.ready === false);
    if (registry && registry.ready === true && registry.persisted === false && registry.message)
      view.notice = String(registry.message);
    view.canStop = view.enabled && !!session;
    if (view.enabled) view.toggleLabel = "Arrêter la surveillance";
    view.canStart = !view.enabled && !!session && !session.readOnly;
    view.instruction = (activation && activation.instruction) || "";
    // The activity is told in the words of the state (activity.label): restoring, reading, checking,
    // and a lateness with its cause and the number that belongs to that cause.
    var worded = spoken(activity.label);
    if (!session) view.status = "Démarre la capture TV pour activer la surveillance.";
    else if (view.restoring) view.status = worded || "Restauration du suivi enregistré…";
    else if (view.enabled)
      view.status =
        (worded || "Surveillance active.") +
        (activation && finite(activation.t0Ms)
          ? " Depuis " + clock(activation.t0Ms) + "."
          : "");
    else if (session.readOnly)
      view.status =
        "Archive en lecture seule : aucun nouveau passage n’est lu. Reprends la capture pour activer la surveillance.";
    else
      view.status =
        activity.state === "stopped"
          ? worded || "Surveillance arrêtée."
          : "Surveillance inactive.";
    view.late = !view.restoring && !!backlog.late;
    var unread = backlog.passagesFailed || 0,
      waiting = backlog.claimsWaiting || 0,
      toRead = backlog.passagesPending || 0;
    if (view.notice) view.alerts.push(view.notice);
    if (view.enabled && view.late) {
      // The state line already says it when the server worded the lateness itself; these sentences
      // only stand in for a state that carries none, and never repeat the line above.
      if (!(worded && activity.state === "late")) {
        if (backlog.reason === "detection-failed")
          view.alerts.push(
            caused("Lecture des passages en échec", unread, "passage non lu", "passages non lus"),
          );
        else if (backlog.reason === "verification")
          view.alerts.push(
            waiting > 0
              ? caused("Vérifications en retard", waiting, "affirmation en attente", "affirmations en attente")
              : LATE_CHECK,
          );
        else if (backlog.reason === "detection")
          view.alerts.push(caused("Lecture en retard", toRead, "passage à lire", "passages à lire"));
        else if (backlog.reason === "registry-full")
          view.alerts.push(
            "Registre plein : les nouveaux passages ne sont plus lus.",
          );
        else view.alerts.push("Surveillance en retard.");
      }
    } else if (unread && !view.restoring)
      view.alerts.push(
        plural(unread, "passage n’a pas pu être lu", "passages n’ont pas pu être lus") +
          " depuis l’activation.",
      );
    if (view.enabled && session && session.accepting === false)
      view.alerts.push(
        "Capture arrêtée : la surveillance ne reçoit plus de passage. Rien ne reprend seul.",
      );
    var pending = (counts.detected || 0) + (counts.queued || 0),
      parts = [
        [counts.sourced, "sourcée", "sourcées"],
        [counts.undetermined, "indéterminée", "indéterminées"],
        [pending, "en attente", "en attente"],
        [counts.running, "en cours", "en cours"],
        [counts.error, "en erreur", "en erreur"],
        [counts.cancelled, "annulée", "annulées"],
        [counts.noted, "signalement", "signalements"],
      ]
        .filter(function (part) {
          return part[0] > 0;
        })
        .map(function (part) {
          return plural(part[0], part[1], part[2]);
        });
    view.total = Object.keys(counts).reduce(function (sum, key) {
      return sum + (counts[key] || 0);
    }, 0);
    // While the saved registry is read nothing here is final: no figure is shown as if it were.
    if (view.restoring) {
      view.total = 0;
      return view;
    }
    view.counts = parts.length
      ? parts.join(" · ")
      : activation
        ? "Aucune affirmation relevée pour l’instant."
        : "";
    // The button counts what the counters count (claims); the list then says how many lines they make.
    if (view.total) view.historyLabel = "Historique · " + plural(view.total, "affirmation");
    return view;
  }

  /** One line of the paged history (item of POST /v1/surveillance/history). */
  function describeHistoryItem(item) {
    var interval = range(item.startMs, item.endMs),
      lot = item.kind === "lot",
      signal = lot ? item.cardKind === "signal" : item.action === "signal",
      view = {
        id: item.id,
        seq: item.seq,
        // verification: sourced web check; signal: video observation; open: a claim with no result.
        accent: lot ? (signal ? "signal" : "verification") : signal ? "signal" : "open",
        verified: lot && !signal,
        kicker: "",
        text: item.text || "",
        meta: "",
      };
    if (lot && !signal) {
      view.kicker = CARD_LABELS.verification;
      view.meta =
        plural(item.claimCount || 0, "affirmation") +
        " · " +
        plural(item.sourceCount || 0, "source");
    } else if (lot) {
      view.kicker = CARD_LABELS.signal;
      view.meta = SIGNAL_NOTE;
    } else {
      view.kicker =
        (signal ? "Signalement · " : "") +
        (CLAIM_LABELS[item.status] || item.status || "En attente");
      view.meta =
        item.status === "undetermined"
          ? "Non vérifiée : " + (REASONS[item.reason] || item.reason || "raison non précisée") + "."
          : item.status === "error"
            ? item.reason || "Vérification impossible."
            : item.status === "cancelled"
              ? item.reason || "Surveillance arrêtée."
              : item.late
                ? "En attente depuis un moment : la vérification a pris du retard."
                : item.status === "noted"
                  ? SIGNAL_NOTE
                  : "";
    }
    if (interval) view.kicker += " · " + interval;
    return view;
  }

  function claimState(claim) {
    if (claim.status === "sourced")
      return (
        (ASSESSMENT_LABELS[claim.assessment] || "Sourcée") +
        (claim.conclusion ? " — " + claim.conclusion : "")
      );
    if (claim.status === "undetermined")
      return (
        "Indéterminée : " +
        (REASONS[claim.reason] || claim.reason || "raison non précisée") +
        "." +
        (claim.conclusion ? " " + claim.conclusion : "")
      );
    if (claim.status === "error")
      return "Erreur : " + (claim.error || "vérification impossible") + ".";
    if (claim.status === "cancelled")
      return "Annulée" + (claim.reason ? " : " + claim.reason : ".");
    if (claim.status === "noted")
      return "Relevée dans la vidéo, sans vérification sur le web.";
    return CLAIM_LABELS[claim.status] || "En attente";
  }

  /**
   * Detail of one result or one claim (answer of POST /v1/surveillance/detail): claims with quote and
   * timing, state in plain words, sources as text (title, publisher, address), uncertainties.
   */
  function describeDetail(detail) {
    var lot = detail && detail.kind === "lot" ? detail.lot : null,
      claims = list(detail && detail.claims),
      signal = lot ? lot.kind === "signal" : claims.length > 0 && claims[0].action === "signal",
      origins = lot
        ? list(lot.origin)
        : claims.map(function (claim) {
            return Object.assign({ claimId: claim.id }, claim.origin || {});
          }),
      timed = origins.filter(function (o) {
        return finite(o.startMs) && finite(o.endMs);
      }),
      startMs = timed.length
        ? Math.min.apply(
            null,
            timed.map(function (o) {
              return o.startMs;
            }),
          )
        : null,
      endMs = timed.length
        ? Math.max.apply(
            null,
            timed.map(function (o) {
              return o.endMs;
            }),
          )
        : null,
      passages = origins
        .map(function (o) {
          return o.passageId;
        })
        .filter(function (id, index, all) {
          return typeof id === "string" && all.indexOf(id) === index;
        })
        .sort(function (a, b) {
          return ordinal(a) - ordinal(b);
        });
    // A signal has no source and no verdict, whatever a registry would carry for it.
    var sources = signal
      ? []
      : (lot ? list(lot.sources) : claims.reduce(function (all, claim) {
          return all.concat(list(claim.sources));
        }, []))
          .filter(function (source, index, all) {
            return (
              source &&
              source.url &&
              all.findIndex(function (other) {
                return other && other.url === source.url;
              }) === index
            );
          })
          .map(function (source) {
            return {
              title: source.title || "Source",
              publisher: source.publisher || host(source.url),
              url: source.url,
            };
          });
    var uncertainties = (lot ? list(lot.uncertainties) : [])
      .concat(
        claims.reduce(function (all, claim) {
          return all.concat(list(claim.limitations));
        }, []),
      )
      .filter(function (value, index, all) {
        return value && all.indexOf(value) === index;
      });
    var single = !lot && claims[0];
    return {
      id: detail ? detail.id : null,
      accent: signal ? "signal" : lot ? "verification" : "open",
      title: lot
        ? CARD_LABELS[signal ? "signal" : "verification"]
        : single
          ? (signal ? "Signalement · " : "") + (CLAIM_LABELS[single.status] || "Affirmation")
          : "Affirmation",
      time: range(startMs, endMs),
      text: lot ? lot.text || "" : "",
      note: signal ? SIGNAL_NOTE : null,
      claims: claims.map(function (claim) {
        var origin = claim.origin || {};
        return {
          id: claim.id,
          statement: claim.statement || "",
          quote: origin.quote || "",
          time: range(origin.startMs, origin.endMs),
          state: claimState(claim),
        };
      }),
      sources: sources,
      uncertainties: uncertainties,
      // What "Questionner ce moment" asks about: the stretch of video the result comes from.
      moment:
        passages.length && startMs !== null
          ? {
              segmentIds: [passages[0], passages[passages.length - 1]],
              startMs: startMs,
              endMs: endMs,
            }
          : null,
    };
  }

  var AMBIENT_PAUSED = {
    panel: "panneau ouvert",
    "not-fullscreen": "vidéo hors plein écran",
    "foreign-app": "autre application au premier plan",
    "media-transition": "publicité ou changement de vidéo",
    "recent-key": "télécommande utilisée à l’instant",
    "key-held": "touche tenue",
    "server-unreachable": "serveur inaccessible",
  };
  var AMBIENT_DISABLED = {
    "app-missing": "application d’alerte non installée sur la TV",
    "launch-unconfirmed": "lancement de l’alerte non confirmé",
    "no-relay": "relais de télécommande absent",
    "panel-outdated": "lanceur du panneau à mettre à jour",
    "relay-failed": "relais de télécommande en échec",
    "key-lost-at-launch": "une touche a été perdue au lancement",
    "relay-lossy": "le relais a perdu des touches",
    "stuck-window": "fenêtre d’alerte restée ouverte",
    "server-unsupported": "serveur à mettre à jour",
    "capture-not-gated": "capture TV à mettre à jour",
  };
  /**
   * Ambient display (card shown with the panel closed), read on the local controller with GET /ambient.
   * @param {{value?:object,status?:number,error?:boolean}|null} reading null while the first read is pending
   */
  function describeAmbient(reading) {
    var view = { supported: false, line: "", details: [], notShown: 0, settings: null };
    if (!reading) {
      view.line = "Affichage panneau fermé : lecture de l’état…";
      return view;
    }
    var value = reading.value;
    if (!value || value.supported !== true) {
      view.line =
        reading.status === 404 || (value && value.supported !== true)
          ? "Alertes panneau fermé : contrôleur TV à mettre à jour."
          : "Alertes panneau fermé : contrôleur TV inaccessible.";
      return view;
    }
    view.supported = true;
    var state = value.state || {},
      settings = value.settings || {},
      counts = state.counts || {},
      capture = state.capture || {},
      reason = state.reason || null;
    view.settings = settings;
    if (reason === "profile-off" || state.focus === "off")
      view.line =
        "Affichage panneau fermé non activé sur cette TV : les résultats s’affichent panneau ouvert et restent dans l’historique.";
    else if (reason === "alerts-off" || settings.alerts === false)
      view.line =
        "Alertes à l’écran coupées : la surveillance continue, les résultats restent dans l’historique.";
    else if (state.status === "disabled")
      view.line =
        "Affichage panneau fermé désactivé : " +
        (AMBIENT_DISABLED[reason] || state.message || reason || "cause inconnue") +
        ".";
    else if (state.status === "paused")
      view.line =
        "Affichage panneau fermé en pause : " +
        (AMBIENT_PAUSED[reason] || state.message || reason || "cause inconnue") +
        ".";
    else if (!value.active || state.status === "stopped")
      view.line = "Affichage panneau fermé arrêté.";
    else view.line = "Affichage panneau fermé actif.";
    if (state.trial) view.line += " Mode d’essai.";
    view.notShown = counts.notShown || 0;
    var missed =
      (counts.notShown || 0) + (counts.skippedStale || 0) + (counts.skippedOverflow || 0);
    if (missed)
      view.details.push(
        plural(missed, "résultat non montré", "résultats non montrés") +
          " panneau fermé : à lire dans l’historique.",
      );
    var masked = capture.overlay || {};
    if (masked.cropped || masked.withheld)
      view.details.push(
        "Capture : " +
          plural(masked.cropped || 0, "image recadrée", "images recadrées") +
          ", " +
          plural(masked.withheld || 0, "image retenue", "images retenues") +
          " pendant une alerte.",
      );
    if (capture.gateStale)
      view.details.push(
        "Porte de capture restée fermée : les images sont recadrées par précaution.",
      );
    return view;
  }

  /**
   * Status line of the history list. A result groups several claims: the line gives both numbers when
   * they differ, so that it never contradicts the "N affirmations" of the button that opened it.
   * @param {{items:number, claims?:number, loaded:number, stale?:boolean}} totals
   */
  function describeHistoryStatus(totals) {
    var t = totals || {},
      items = t.items || 0,
      claims = finite(t.claims) ? t.claims : null;
    if (!items) return "Aucun résultat pour l’instant. Les affirmations relevées apparaîtront ici.";
    return (
      plural(items, "élément") +
      (claims !== null && claims !== items ? " pour " + plural(claims, "affirmation") : "") +
      " · du plus récent au plus ancien" +
      (t.loaded < items ? " · " + t.loaded + " chargés" : "") +
      (t.stale ? " · nouveaux éléments : Retour puis Historique pour actualiser" : "")
    );
  }

  function displayChoice(ms) {
    return DISPLAY_CHOICES.indexOf(ms) >= 0 ? ms : DISPLAY_DEFAULT;
  }
  function nextDisplay(ms) {
    return DISPLAY_CHOICES[
      (DISPLAY_CHOICES.indexOf(displayChoice(ms)) + 1) % DISPLAY_CHOICES.length
    ];
  }

  var api = {
    CARD_LABELS: CARD_LABELS,
    EXAMPLES: EXAMPLES,
    DISPLAY_CHOICES: DISPLAY_CHOICES,
    DISPLAY_DEFAULT: DISPLAY_DEFAULT,
    overlayCards: overlayCards,
    describeSurveillance: describeSurveillance,
    describeHistoryItem: describeHistoryItem,
    describeDetail: describeDetail,
    describeAmbient: describeAmbient,
    describeHistoryStatus: describeHistoryStatus,
    displayChoice: displayChoice,
    nextDisplay: nextDisplay,
  };
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
    return;
  }
  // ---- Browser only below ------------------------------------------------------------------
  var el = function (id) {
    return document.getElementById(id);
  };
  function text(parent, tag, value, className) {
    var node = document.createElement(tag);
    node.textContent = value;
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
  }
  function usable(node) {
    return node && !node.disabled && !node.hidden && node.offsetParent !== null;
  }

  /**
   * Bottom-left card while the panel is open. The queue, the wording and the drawing belong to
   * tv/app/surveillance-overlay.js (TVLensOverlay: OverlayQueue, describeCard, describeActivity,
   * renderCard); nothing is shown without that module. The container has no focusable descendant
   * and sits outside the video rectangle of both layouts.
   * @param {{settings:Function, paused:Function, suspended:Function, video?:Function, onShown?:Function}} options
   *   video: the rectangle the picture occupies, as the local controller publishes it, or null when unknown.
   *   onShown(card, sessionId): a card was drawn; sessionId is the session it belongs to.
   */
  function Overlay(options) {
    var lib = root.TVLensOverlay || {};
    this.options = options;
    this.lib = lib;
    this.node = el("surveillance-overlay");
    this.cardNode = el("overlay-card");
    this.activityNode = el("overlay-activity");
    this.available =
      typeof lib.OverlayQueue === "function" &&
      typeof lib.describeCard === "function" &&
      typeof lib.renderCard === "function";
    this.queue = this.available
      ? new lib.OverlayQueue({
          // Monotonic: display time, gap and ageing never follow a wall clock.
          now: function () {
            return performance.now();
          },
          displayMs: options.settings().displayMs,
        })
      : null;
    this.sessionId = null;
    this.shown = null;
    this.more = 0;
    this.declared = {};
    this.activity = null;
    this.activityKey = "";
    this.covered = false;
  }
  // False when the picture reaches into the zone the style sheet reserves for the card in the current
  // layout (another geometry than the two this panel was drawn for): nothing is then drawn at all,
  // because whatever sits over the picture is captured with it.
  Overlay.prototype.clear = function () {
    var video = this.options.video ? this.options.video() : null;
    if (!video || !finite(video.x) || !finite(video.y) || !finite(video.width) || !finite(video.height))
      return true;
    var style = getComputedStyle(this.node),
      left = parseFloat(style.left),
      bottom = root.innerHeight - parseFloat(style.bottom),
      right = left + parseFloat(style.width),
      top = bottom - parseFloat(style.maxHeight);
    if (![left, top, right, bottom].every(finite)) return true;
    return !(
      left < video.x + video.width &&
      right > video.x &&
      top < video.y + video.height &&
      bottom > video.y
    );
  };
  // Called with every state body. Only the overlay block is handed to the queue: signals.cards never
  // reaches it. The first body of a session places the cursor, so nothing published before the panel
  // opened is replayed (and the first one after a restored registry places it again, so a restored
  // history is not news); the queue itself refuses a card that is not a sourced verification.
  Overlay.prototype.update = function (state) {
    var surveillance = (state && state.surveillance) || null,
      session = (state && state.session) || null,
      sessionId = session ? session.id : null;
    this.activity =
      typeof this.lib.describeActivity === "function" && surveillance
        ? this.lib.describeActivity(surveillance)
        : null;
    if (!this.available) return;
    if (sessionId !== this.sessionId) {
      this.sessionId = sessionId;
      this.declared = {};
    }
    this.queue.ingest({
      sessionId: sessionId,
      serverNowMs: state.serverNowMs,
      elapsedMs: session ? session.elapsedMs : undefined,
      overlay: (surveillance && surveillance.overlay) || {},
      // While the saved registry is read, the queue takes nothing and places its cursor afterwards.
      registry: (surveillance && surveillance.registry) || null,
      activity: (surveillance && surveillance.activity) || null,
    });
  };
  // Local timer: a card leaves at its deadline even when the server no longer answers.
  Overlay.prototype.tick = function () {
    var settings = this.options.settings(),
      visible = !!settings.alerts && !this.options.suspended();
    if (this.node.hidden === visible) this.node.hidden = !visible;
    this.covered = visible && !this.clear();
    if (this.covered) visible = false;
    if (!this.available) return this.renderActivity(visible);
    if (this.queue.displayMs !== settings.displayMs)
      this.queue.setDisplayMs(settings.displayMs);
    // Alerts switched off, a dialog, the LG keyboard, a layout switch or a picture in the way: the
    // card is withdrawn and comes back whole afterwards.
    var step = this.queue.tick(!visible || this.options.paused()),
      card = step.card,
      // Second guard at the last moment: only a sourced verification is ever drawn.
      view =
        card && overlayCards({ overlay: { cards: [card] } }).length
          ? this.lib.describeCard(card, { more: step.more })
          : null;
    if (step.changed || step.more !== this.more || !!view !== !!this.shown) {
      this.more = step.more;
      this.lib.renderCard(this.cardNode, view);
      this.shown = view ? card : null;
      if (view) {
        this.cardNode.dataset.id = card.id;
        if (!this.declared[card.seq]) {
          this.declared[card.seq] = true;
          // The card belongs to the session the queue reads: the declaration that follows names it.
          if (this.options.onShown) this.options.onShown(card, this.queue.sessionId);
        }
      } else delete this.cardNode.dataset.id;
    }
    this.renderActivity(visible);
  };
  // Discreet activity: only while something is being read, checked or late, and never under a card.
  Overlay.prototype.renderActivity = function (visible) {
    var activity = visible && !this.shown ? this.activity : null,
      key = activity ? activity.label + "|" + !!activity.late : "";
    if (key === this.activityKey) return;
    this.activityKey = key;
    if (typeof this.lib.renderActivity === "function")
      this.lib.renderActivity(this.activityNode, activity);
    else {
      this.activityNode.hidden = !activity;
      this.activityNode.textContent = activity ? activity.label : "";
    }
  };

  /**
   * Surveillance view in the chat column. Three levels: commands, history list, detail.
   * Back goes detail → list → commands → chat; the chat graph then closes the panel.
   */
  function View(options) {
    this.options = options;
    this.level = null; // null (closed) | "commands" | "list" | "detail"
    this.items = [];
    this.nextBeforeSeq = null;
    this.selected = null;
    this.nodes = {};
    // One counter per kind of request: a late answer of a closed view, an older page or a detail the
    // viewer already left is dropped.
    this.epoch = 0;
    this.listRun = 0;
    this.detailRun = 0;
    this.detail = null;
    this.ambient = null;
    this.example = -1;
    this.busy = false;
    this.keyboardVisible = false;
    this.listKey = "";
    this.stale = false;
    this.seconds = 0;
    var self = this;
    el("surv-dictate").onclick = function () {
      el("surv-instruction").focus();
    };
    el("surv-example").onclick = function () {
      self.example = (self.example + 1) % EXAMPLES.length;
      el("surv-instruction").value = EXAMPLES[self.example];
      self.render();
    };
    el("surv-toggle").onclick = function () {
      self.toggle();
    };
    el("surv-duration").onclick = function () {
      var settings = self.options.settings();
      self.options.setSettings({ displayMs: nextDisplay(settings.displayMs) });
      self.render();
    };
    el("surv-alerts").onclick = function () {
      var settings = self.options.settings();
      self.options.setSettings({ alerts: !settings.alerts });
      self.render();
    };
    el("surv-history-open").onclick = function () {
      self.openList();
    };
    el("surv-detail-back").onclick = function () {
      self.closeDetail();
    };
    el("surv-detail-ask").onclick = function () {
      var moment = self.detail && self.detail.moment;
      if (moment) self.options.onAsk(moment, self.sessionId());
    };
    document.addEventListener("keyboardStateChange", function (event) {
      self.keyboardVisible = !!(event.detail && event.detail.visibility);
    });
  }
  View.prototype.sessionId = function () {
    var state = this.options.getState();
    return (state && state.session && state.session.id) || null;
  };
  View.prototype.isOpen = function () {
    return this.level !== null;
  };
  View.prototype.open = function () {
    this.setLevel("commands");
    this.render();
    this.readAmbient();
    this.focusCommands();
  };
  View.prototype.close = function () {
    this.epoch++;
    this.listRun++;
    this.detailRun++;
    this.level = null;
    this.detail = null;
    el("chat-panel").removeAttribute("data-level");
  };
  // The session in memory changed: a list or a detail of the former one is left for the commands.
  View.prototype.reset = function () {
    this.listRun++;
    this.detailRun++;
    this.items = [];
    this.detail = null;
    if (this.level !== "list" && this.level !== "detail") return;
    this.setLevel("commands");
    this.render();
    this.focusCommands();
  };
  View.prototype.setLevel = function (level) {
    this.level = level;
    el("chat-panel").dataset.level = level;
    el("surv-commands").hidden = level !== "commands";
    el("surv-list").hidden = level !== "list";
    el("surv-detail").hidden = level !== "detail";
    el("navigation-hint").textContent =
      level === "list"
        ? "Haut / Bas · parcourir — OK · détail — Retour · commandes"
        : level === "detail"
          ? "Haut / Bas · lire — Retour · liste"
          : "Retour · chat";
  };
  View.prototype.focusCommands = function () {
    var first = [el("surv-toggle"), el("surv-dictate"), el("surv-history-open")].filter(usable)[0];
    (first || el("show-surveillance")).focus();
  };
  // Called with every state body; the DOM only changes when what it shows changed.
  View.prototype.update = function () {
    if (!this.isOpen()) return;
    this.render();
    if (this.level !== "list" || this.registryKey() === this.listKey) return;
    // The first page is refreshed in place. Further down, the list is left as the viewer reads it and
    // says that something new exists: a refresh under the remote would move what is being read.
    if (this.items.length <= PAGE) this.loadPage(true);
    else if (!this.stale) {
      this.stale = true;
      this.renderList(false);
    }
  };
  // What moves when the registry gains or settles an element: counters and card sequences.
  View.prototype.registryKey = function () {
    var state = this.options.getState(),
      s = state && state.surveillance;
    return s
      ? JSON.stringify([
          this.sessionId(),
          s.counts,
          s.overlay && s.overlay.seq,
          s.signals && s.signals.seq,
        ])
      : "";
  };
  // Once per second while the view is open: the ambient state is re-read now and then, never written.
  View.prototype.second = function () {
    if (this.level === "commands" && ++this.seconds % 5 === 0) this.readAmbient();
  };
  View.prototype.render = function () {
    var focused = document.activeElement,
      inside = el("surveillance-view").contains(focused),
      state = this.options.getState(),
      session = state && state.session,
      model = describeSurveillance(state && state.surveillance, { session: session }),
      settings = this.options.settings(),
      ambient = describeAmbient(this.ambient),
      set = function (id, value) {
        if (el(id).textContent !== value) el(id).textContent = value;
      },
      able = function (id, disabled) {
        if (el(id).disabled !== disabled) el(id).disabled = disabled;
      };
    this.model = model;
    set("surv-status", model.status);
    // Counters, then what is to be read about them (sentences): never run together.
    set("surv-counts", [model.counts, model.alerts.join(" ")].filter(Boolean).join(" · "));
    // Same colour for a lateness and for a registry that is not saved: both are to be read.
    if (el("surv-counts").dataset.late !== String(model.late || !!model.notice))
      el("surv-counts").dataset.late = String(model.late || !!model.notice);
    set(
      "surv-ambient",
      [ambient.line]
        .concat(ambient.details)
        .concat(
          !this.options.overlayAvailable()
            ? ["Alertes panneau ouvert indisponibles dans ce paquet."]
            : this.options.overlayCovered()
              ? ["Alertes panneau ouvert masquées : la vidéo occupe leur emplacement dans cette disposition."]
              : [],
        )
        .join(" "),
    );
    set("surv-toggle", this.busy ? "Un instant…" : model.toggleLabel);
    // Busy is not "disabled": a disabled button would drop the focus the viewer left on it.
    able("surv-toggle", !(model.canStart || model.canStop));
    if (el("surv-toggle").getAttribute("aria-busy") !== String(this.busy))
      el("surv-toggle").setAttribute("aria-busy", String(this.busy));
    var input = el("surv-instruction");
    // While a surveillance runs, the field shows its instruction: changing it means stopping first.
    able("surv-instruction", model.enabled || !model.canStart);
    if (model.enabled && input.value !== model.instruction) input.value = model.instruction;
    able("surv-dictate", input.disabled);
    able("surv-example", input.disabled);
    set("surv-duration", "Durée des alertes · " + settings.displayMs / 1000 + " s");
    set("surv-alerts", "Alertes à l’écran · " + (settings.alerts ? "oui" : "non"));
    set("surv-history-open", model.historyLabel);
    able("surv-history-open", !model.available || !session);
    // A control that an update just disabled cannot keep the remote: the focus goes to its neighbour,
    // never to nothing.
    if (inside && this.level === "commands" && !usable(focused)) this.focusCommands();
  };
  View.prototype.say = function (message) {
    el("surv-message").textContent = message || "";
  };
  // Viewer action, and the only place that starts or stops anything: the server first, then the
  // closed-panel display of this TV. A controller that does not know /ambient changes nothing here.
  View.prototype.toggle = async function () {
    var model = this.model,
      sessionId = this.sessionId(),
      self = this;
    if (this.busy || !model || !sessionId) return;
    var stopping = model.enabled,
      instruction = el("surv-instruction").value.trim();
    if (!stopping && !instruction)
      return this.say("Dicte une consigne ou choisis un exemple.");
    this.busy = true;
    this.say("");
    this.render();
    try {
      var answer = stopping
        ? await this.options.client.stopSurveillance(sessionId)
        : await this.options.client.startSurveillance(sessionId, instruction);
      this.options.onSurveillance(answer && answer.surveillance);
      this.ambient = await this.options
        .ambient(stopping ? "/ambient/stop" : "/ambient/start", {})
        .then(
          function (value) {
            return { value: value };
          },
          function (error) {
            return { status: error.status, error: true };
          },
        );
    } catch (error) {
      this.say(error.message);
    } finally {
      this.busy = false;
      this.render();
      if (document.activeElement === document.body || !usable(document.activeElement))
        self.focusCommands();
    }
  };
  // Read-only: stating the ambient mode never starts or stops it.
  View.prototype.readAmbient = async function () {
    var epoch = this.epoch,
      reading = await this.options.ambient("/ambient").then(
        function (value) {
          return { value: value };
        },
        function (error) {
          return { status: error.status, error: true };
        },
      );
    if (epoch !== this.epoch) return;
    this.ambient = reading;
    var view = describeAmbient(reading);
    if (view.settings) this.options.adoptSettings(view.settings);
    if (this.isOpen()) this.render();
  };
  View.prototype.openList = function () {
    this.setLevel("list");
    this.items = [];
    this.nodes = {};
    this.selected = null;
    this.nextBeforeSeq = null;
    this.stale = false;
    el("surv-items").replaceChildren();
    el("surv-list-status").textContent = "Chargement de l’historique…";
    el("surv-items").focus();
    this.options.onHistoryRead();
    this.loadPage(true);
  };
  // One page at a time, from the routes that page the registry on the server.
  View.prototype.loadPage = async function (first) {
    var sessionId = this.sessionId(),
      run = ++this.listRun,
      container = el("surv-items");
    if (!sessionId) return;
    if (first) this.listKey = this.registryKey();
    try {
      var page = await this.options.client.surveillanceHistory(
        sessionId,
        first ? null : this.nextBeforeSeq,
        PAGE,
      );
      if (run !== this.listRun || this.level !== "list") return;
      var known = {},
        self = this,
        previous = this.items.find(function (item) {
          return item.id === self.selected;
        });
      this.items = (first ? [] : this.items).concat(list(page.items)).filter(function (item) {
        if (known[item.id]) return false;
        return (known[item.id] = true);
      });
      this.nextBeforeSeq = page.nextBeforeSeq || null;
      this.total = (page.totals && page.totals.items) || this.items.length;
      this.claims = page.totals && finite(page.totals.claims) ? page.totals.claims : null;
      if (first) this.stale = false;
      if (
        !this.items.some(function (item) {
          return item.id === self.selected;
        })
      ) {
        // A claim that joined a result is replaced by that result, right next to it in the order.
        var nearest = previous
          ? this.items.slice().sort(function (a, b) {
              return Math.abs(a.seq - previous.seq) - Math.abs(b.seq - previous.seq);
            })[0]
          : this.items[0];
        this.selected = nearest ? nearest.id : null;
      }
      this.renderList(
        container.contains(document.activeElement) ||
          document.activeElement === document.body,
      );
    } catch (error) {
      if (run === this.listRun) el("surv-list-status").textContent = error.message;
    }
  };
  View.prototype.renderList = function (focus) {
    var self = this,
      container = el("surv-items"),
      index = Math.max(
        0,
        this.items.findIndex(function (item) {
          return item.id === self.selected;
        }),
      ),
      // Only visible neighbours enter the DOM; the rest of the history stays navigable.
      visible = this.items.slice(Math.max(0, index - 2), Math.min(this.items.length, index + 4)),
      keep = {};
    el("surv-list-status").textContent = describeHistoryStatus({
      items: this.items.length ? this.total || this.items.length : 0,
      claims: this.claims,
      loaded: this.items.length,
      stale: this.stale,
    });
    visible.forEach(function (item) {
      keep[item.id] = true;
    });
    Object.keys(this.nodes).forEach(function (id) {
      if (!keep[id]) {
        self.nodes[id].remove();
        delete self.nodes[id];
      }
    });
    visible.forEach(function (item) {
      var view = describeHistoryItem(item),
        node = self.nodes[item.id];
      if (!node) {
        node = document.createElement("button");
        node.className = "surv-item";
        node.dataset.id = item.id;
        text(node, "small", "", "surv-kicker");
        text(node, "span", "", "surv-text");
        text(node, "small", "", "surv-meta");
        node.onclick = function () {
          self.selected = item.id;
          self.openDetail(item.id);
        };
        self.nodes[item.id] = node;
      }
      node.dataset.accent = view.accent;
      node.dataset.selected = String(item.id === self.selected);
      node.children[0].textContent = view.kicker;
      node.children[1].textContent = view.text;
      node.children[2].textContent = view.meta;
      node.children[2].hidden = !view.meta;
    });
    var expected = visible
      .map(function (item) {
        return item.id;
      })
      .join(",");
    if (
      [].map
        .call(container.children, function (node) {
          return node.dataset.id;
        })
        .join(",") !== expected
    ) {
      var active = document.activeElement && document.activeElement.dataset.id;
      visible.forEach(function (item) {
        container.appendChild(self.nodes[item.id]);
      });
      if (active && self.nodes[active]) self.nodes[active].focus({ preventScroll: true });
    }
    if (focus) {
      if (this.nodes[this.selected]) this.nodes[this.selected].focus({ preventScroll: true });
      else container.focus();
    }
  };
  View.prototype.move = function (step) {
    var self = this,
      index = this.items.findIndex(function (item) {
        return item.id === self.selected;
      }),
      next = this.items[Math.max(0, Math.min(this.items.length - 1, index + step))];
    if (!next) return;
    this.selected = next.id;
    this.renderList(true);
    // Close to the end of what is loaded: fetch the next page, the selection stays where it is.
    if (this.nextBeforeSeq && this.items.indexOf(next) >= this.items.length - 3)
      this.loadPage(false);
  };
  View.prototype.openDetail = async function (id) {
    var sessionId = this.sessionId(),
      run = ++this.detailRun;
    this.setLevel("detail");
    this.detail = null;
    el("surv-detail-title").textContent = "Chargement…";
    el("surv-detail-time").textContent = "";
    el("surv-detail-scroll").replaceChildren();
    el("surv-detail-scroll").scrollTop = 0;
    el("surv-detail-ask").disabled = true;
    el("surv-detail-scroll").focus();
    try {
      var detail = await this.options.client.surveillanceDetail(sessionId, id);
      if (run !== this.detailRun || this.level !== "detail") return;
      this.renderDetail(describeDetail(detail));
    } catch (error) {
      if (run === this.detailRun) el("surv-detail-title").textContent = error.message;
    }
  };
  View.prototype.renderDetail = function (view) {
    var body = el("surv-detail-scroll");
    this.detail = view;
    el("surv-detail").dataset.accent = view.accent;
    el("surv-detail-title").textContent = view.title;
    el("surv-detail-time").textContent = view.time
      ? view.time + " · temps observé"
      : "";
    body.replaceChildren();
    if (view.note) text(body, "p", view.note, "surv-note");
    if (view.text) text(body, "p", view.text, "surv-summary");
    view.claims.forEach(function (claim) {
      var block = document.createElement("div");
      block.className = "surv-claim";
      text(block, "p", claim.statement);
      if (claim.quote)
        text(block, "small", (claim.time ? claim.time + " · " : "") + "« " + claim.quote + " »");
      else if (claim.time) text(block, "small", claim.time);
      text(block, "small", claim.state, "surv-state");
      body.appendChild(block);
    });
    if (view.sources.length) {
      text(body, "small", "Sources", "surv-heading");
      view.sources.forEach(function (source) {
        // Text only: the panel opens no browser.
        text(
          body,
          "p",
          source.title + "\n" + (source.publisher ? source.publisher + "\n" : "") + source.url,
          "surv-source",
        );
      });
    }
    if (view.uncertainties.length) {
      text(body, "small", "Incertitudes", "surv-heading");
      view.uncertainties.forEach(function (value) {
        text(body, "small", value);
      });
    }
    el("surv-detail-ask").disabled = !view.moment;
  };
  View.prototype.closeDetail = function () {
    this.detailRun++;
    this.detail = null;
    this.setLevel("list");
    this.renderList(true);
  };
  // Rows of the commands level, top to bottom; a hidden or disabled control is skipped.
  View.prototype.rows = function () {
    return [
      ["show-timeline", "show-surveillance"],
      ["surv-dictate", "surv-example"],
      ["surv-toggle"],
      ["surv-duration", "surv-alerts"],
      ["surv-history-open"],
      ["capture"],
      ["transcription-language"],
    ]
      .map(function (row) {
        return row.map(el).filter(usable);
      })
      .filter(function (row) {
        return row.length;
      });
  };
  View.prototype.handleKey = function (event) {
    if (!this.isOpen()) return false;
    var key = event.keyCode,
      back = key === 461 || event.key === "Escape",
      active = document.activeElement,
      input = el("surv-instruction");
    if (![13, 37, 38, 39, 40, 461].includes(key) && !back) return active !== input ? false : true;
    if (active === input) {
      // Same handling as the question field: the LG keyboard owns the arrows while it is visible.
      if (back || (!this.keyboardVisible && (key === 38 || key === 40))) {
        event.preventDefault();
        input.blur();
        this.keyboardVisible = false;
        el("surv-dictate").focus();
      }
      return true;
    }
    if (back) {
      event.preventDefault();
      event.stopPropagation();
      if (this.level === "detail") this.closeDetail();
      else if (this.level === "list") {
        this.listRun++;
        this.setLevel("commands");
        this.render();
        (usable(el("surv-history-open")) ? el("surv-history-open") : el("show-surveillance")).focus();
      } else this.options.onClose();
      return true;
    }
    if (key === 13) return true; // Native click of the focused button.
    event.preventDefault();
    if (this.level === "detail") {
      var scroll = el("surv-detail-scroll"),
        actions = [el("surv-detail-ask"), el("surv-detail-back")].filter(usable);
      if (active === scroll) {
        var atEnd = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2;
        if (key === 40 && atEnd) actions[0].focus();
        else if (key === 38 || key === 40) scroll.scrollTop += key === 40 ? 140 : -140;
        else if (key === 39) actions[0].focus();
      } else if (actions.indexOf(active) < 0) scroll.focus();
      else {
        var at = actions.indexOf(active);
        if (key === 38) scroll.focus();
        else if (key === 37 || key === 39)
          actions[Math.max(0, Math.min(actions.length - 1, at + (key === 39 ? 1 : -1)))].focus();
      }
      return true;
    }
    if (this.level === "list") {
      if (key === 38 || key === 40) this.move(key === 40 ? 1 : -1);
      return true;
    }
    var rows = this.rows(),
      row = rows.findIndex(function (candidates) {
        return candidates.indexOf(active) >= 0;
      });
    if (row < 0) {
      this.focusCommands();
      return true;
    }
    var column = rows[row].indexOf(active);
    if (key === 37 || key === 39)
      rows[row][Math.max(0, Math.min(rows[row].length - 1, column + (key === 39 ? 1 : -1)))].focus();
    else {
      var target = rows[Math.max(0, Math.min(rows.length - 1, row + (key === 40 ? 1 : -1)))];
      target[Math.min(column, target.length - 1)].focus();
    }
    return true;
  };

  api.Overlay = Overlay;
  api.View = View;
  root.TVLensSurveillance = api;
})(typeof window !== "undefined" ? window : globalThis);
