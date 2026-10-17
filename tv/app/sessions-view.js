(function (root) {
  "use strict";
  // Saved sessions on the TV panel (tickets 02 and 03): pure view models first, then the list shown in
  // the timeline band. Every size, threshold and duration shown comes from the server: none is known here.
  // Opening a session never starts a capture; capture only comes back through an explicit choice.
  var shared = typeof module === "object" && module && module.exports ? require("./text.js") : root.TVLensText,
    finite = shared.finite,
    clock = shared.clock,
    plural = shared.plural;
  function two(value) {
    return String(value).padStart(2, "0");
  }
  // Length of a session: "45 s", "4 min", "1 h 32".
  function duration(ms) {
    var total = Math.max(0, Math.floor((finite(ms) ? ms : 0) / 1000));
    if (total < 60) return total + " s";
    var minutes = Math.floor(total / 60);
    if (minutes < 60) return minutes + " min";
    return Math.floor(minutes / 60) + " h " + two(minutes % 60);
  }
  // Disk volume, decimal comma. Unknown stays empty rather than "0 o".
  function bytes(value) {
    if (!finite(value) || value < 0) return "";
    var units = ["o", "Ko", "Mo", "Go", "To"],
      unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return (
      (unit >= 3 && value < 100
        ? value.toFixed(1).replace(".", ",").replace(/,0$/, "")
        : String(Math.round(value))) +
      " " +
      units[unit]
    );
  }
  // A ceiling in words, from the value really enforced.
  function limit(seconds) {
    if (!finite(seconds) || seconds <= 0) return "";
    if (seconds % 3600 === 0) return seconds / 3600 + " h";
    if (seconds % 60 === 0) return seconds / 60 + " min";
    return seconds + " s";
  }

  /**
   * Disk state of the server. Accepts the library shape ({sessions, bytes, freeBytes, minFreeBytes,
   * warnFreeBytes, state}) and the session shape of the polled state ({state, freeBytes, minFreeBytes,
   * sessionBytes, remainingMinutes}). The banner exists only when storage is low or blocked.
   */
  function describeStorage(storage) {
    var s = storage || {},
      state = ["ok", "low", "blocked"].indexOf(s.state) >= 0 ? s.state : "unknown",
      free = bytes(s.freeBytes),
      floor = bytes(s.minFreeBytes),
      used = bytes(s.bytes !== undefined ? s.bytes : s.sessionBytes),
      parts = [];
    if (finite(s.sessions)) parts.push(plural(s.sessions, "session"));
    if (used) parts.push((s.bytes !== undefined ? "" : "cette session : ") + used);
    parts.push(free ? free + " libres sur le serveur" : "espace libre non mesuré");
    if (state !== "blocked" && finite(s.remainingMinutes))
      parts.push("environ " + duration(s.remainingMinutes * 60000) + " de capture possibles");
    return {
      state: state,
      blocked: state === "blocked",
      line: parts.join(" · "),
      banner:
        state === "blocked"
          ? "Espace disque insuffisant sur le serveur : capture suspendue pour ne rien supprimer. " +
            (free ? free + " libres" : "Espace libre trop faible") +
            (floor ? ", " + floor + " requis" : "") +
            ". Supprime une session (Mémoire ↔ puis Sessions) ou libère de l’espace, puis relance la capture."
          : state === "low"
            ? "Espace disque faible sur le serveur : " +
              (free ? free + " libres" : "peu d’espace libre") +
              (floor ? ", la capture s’arrêtera sous " + floor : "") +
              ". Rien n’est supprimé automatiquement."
            : null,
    };
  }

  function mediaBadge(summary) {
    var media = summary.media || {},
      stored = media.stored || 0,
      missing = media.missing || 0;
    if (summary.state === "unreadable") return "Illisible";
    if (!summary.passages) return "Vide";
    if (!stored && summary.legacy) return "Texte seul";
    if (!stored) return "Sans vidéo";
    if (missing) return "Vidéo partielle · " + plural(missing, "passage") + " sans vidéo";
    return "Vidéo complète";
  }

  /**
   * @param {{current?:{id:string,readOnly?:boolean,accepting?:boolean}|string|null,sessions?:object[],storage?:object}|null} library answer of GET /v1/sessions
   * @param {{capturing?:boolean}} context capturing: the capture of this TV is running. The server keeps a
   *   session "accepting" after the TV stopped sending, so that flag alone never blocks an action here.
   */
  function describeSessions(library, context) {
    var loaded =
        library && library.current && typeof library.current === "object"
          ? library.current
          : null,
      currentId =
        library && typeof library.current === "string"
          ? library.current
          : loaded
            ? loaded.id
            : null,
      capturing = !!(context && context.capturing),
      accepting = !!(loaded && loaded.accepting && !loaded.readOnly),
      rows = ((library && library.sessions) || [])
        .filter(function (session) {
          return session && typeof session.id === "string";
        })
        .map(function (session) {
          var current =
              session.current !== undefined ? !!session.current : session.id === currentId,
            // "capturing" in a row of the server only repeats that the session accepts passages.
            live = current && capturing,
            archived =
              current &&
              (session.readOnly !== undefined ? !!session.readOnly : !!(loaded && loaded.readOnly)),
            unreadable = session.state === "unreadable",
            media = session.media || {};
          return {
            id: session.id,
            title: session.title || "Session sans titre",
            topic: session.firstTopic || "",
            meta: [
              duration(session.elapsedMs),
              plural(session.passages || 0, "passage"),
              bytes(media.bytes),
            ]
              .filter(Boolean)
              .join(" · "),
            media: mediaBadge(session),
            status: live
              ? "En cours de capture"
              : current
                ? archived
                  ? "Ouverte · lecture seule"
                  : accepting
                    ? "Ouverte · capture arrêtée"
                    : "Ouverte · en pause"
                : session.state === "interrupted"
                  ? "Interrompue · ce qui était enregistré reste lisible"
                  : unreadable
                    ? "Archive illisible"
                    : "",
            current: current,
            live: live,
            archived: archived,
            stored: media.stored || 0,
            bytes: finite(media.bytes) ? media.bytes : null,
            // Opening never starts a capture, and a running capture is never swapped for another session.
            canOpen: !unreadable && !archived && !capturing,
            openBlocked: unreadable
              ? "Archive illisible."
              : archived
                ? "Session déjà ouverte en lecture seule."
                : capturing
                  ? "Arrête la capture avant d’ouvrir une autre session."
                  : null,
            canResume: archived,
            canDelete: !live,
            deleteBlocked: live ? "Arrête la capture avant de supprimer cette session." : null,
          };
        });
    return {
      currentId: currentId,
      capturing: capturing,
      // Still accepting on the server although this TV sends nothing: paused before another session is
      // opened or this one deleted, which the server refuses on an accepting session.
      pauseFirst: accepting && !capturing,
      rows: rows,
      // A new session replaces the one in memory: never under a running capture.
      canNew: !capturing,
      storage: describeStorage(library && library.storage),
      empty: rows.length
        ? null
        : "Aucune session enregistrée. La prochaine vidéo observée apparaîtra ici et restera consultable jusqu’à sa suppression.",
    };
  }

  /** Confirmation text of a deletion: what goes, and what stays. */
  function describeDeletion(row) {
    return {
      subject: [row.title, row.meta].filter(Boolean).join(" · "),
      removed:
        "Seront effacés du serveur : " +
        (row.stored
          ? "la vidéo et le son de " +
            plural(row.stored, "passage") +
            (bytes(row.bytes) ? " (" + bytes(row.bytes) + ")" : "") +
            ", "
          : "") +
        "les miniatures, les transcriptions, les résumés, les questions et leurs réponses, les résultats de surveillance.",
      kept:
        "Aucune autre session n’est touchée." +
        (row.current ? " Cette session est ouverte : elle sera fermée." : ""),
    };
  }

  /** Banner of an archive opened read-only; null for a live or paused session. */
  function describeArchive(session) {
    if (!session || !session.readOnly) return null;
    var end = finite(session.elapsedMs) ? session.elapsedMs : session.capturedThroughMs;
    return (
      "Archive · lecture seule" +
      (session.title ? " — " + session.title : "") +
      (finite(end) && end > 0 ? " · enregistrée jusqu’à " + clock(end) : "") +
      ". Rien n’est capturé : tu peux relire et poser des questions."
    );
  }

  var DROP_LABELS = {
    foreignApp: "autre application à l’écran",
    captureFailed: "capture refusée",
    geometryChanged: "publicité ou changement de vidéo",
    noFrames: "aucune image",
    audioFailed: "son indisponible",
    tooLong: "bloc trop long",
    queueOverflow: "file pleine",
    sessionChanged: "session changée",
    deliveryExpired: "envoi expiré",
    deliveryRejected: "envoi refusé",
    stopped: "arrêt",
    leftAtStop: "restés à l’arrêt",
    storageFull: "stockage plein",
    readOnly: "session en lecture seule",
    deliveryError: "erreur d’envoi",
    lunaFailed: "système de la TV muet",
  };
  /**
   * Capture button and its status line, from the local controller (GET /capture) and what the server
   * says of the loaded session. An end of capture always comes with its cause; nothing resumes by itself.
   * @param {{active:boolean,stopping:boolean,exitCode:number|null,report:object}} value
   * @param {{readOnly?:boolean,storage?:object}} context
   */
  function describeCapture(value, context) {
    var report = (value && value.report) || {},
      c = context || {},
      limits = report.limits || {},
      storage = describeStorage(c.storage),
      errors = report.errors || [],
      last = errors.length ? String(errors[errors.length - 1]) : "",
      reason = report.stopReason || null,
      refusal = report.lastRefusal || {},
      full =
        storage.blocked ||
        reason === "storage-full" ||
        report.connection === "storage-full" ||
        refusal.code === "storage-full" ||
        (refusal.status === 507 && !refusal.code),
      refused =
        reason === "read-only" || report.connection === "read-only" || refusal.code === "read-only",
      view = { button: "Démarrer l’analyse", label: "", action: "start", ended: null };
    if (value && value.stopping) {
      view.button = "Arrêt en cours…";
      view.label = "Arrêt du micro et des captures…";
      view.action = null;
    } else if (value && value.active) {
      view.button = "Arrêter la capture";
      view.action = "stop";
      view.label =
        report.connection === "starting"
          ? "Connexion au serveur…"
          : report.connection === "reconnecting"
            ? "Réseau coupé · tampon court, nouvel essai…"
            : report.sent
              ? "Capture active · " + plural(report.sent, "passage envoyé", "passages envoyés")
              : "Capture en cours · premier passage sous ≈10 s";
      // The bounds are told while the capture runs, not only once it has stopped.
      var bounds = [
        limit(limits.seconds) ? "après " + limit(limits.seconds) : "",
        limit(limits.idleSeconds) ? "après " + limit(limits.idleSeconds) + " sans lecture" : "",
      ].filter(Boolean);
      if (bounds.length) view.label += " · arrêt automatique " + bounds.join(" ou ");
      if (full)
        view.label =
          "Espace disque insuffisant sur le serveur : les passages sont refusés, rien n’a été supprimé.";
    } else {
      if (c.readOnly) {
        view.button = "Reprendre ou nouvelle session…";
        view.action = "choose";
        view.label = "Archive ouverte en lecture seule · rien n’est capturé.";
      } else if (full) {
        view.ended = "storage";
        view.label =
          "Capture arrêtée : espace disque insuffisant sur le serveur. Rien n’a été supprimé, rien ne reprend seul.";
      } else if (reason === "duration") {
        view.ended = "duration";
        view.label =
          "Capture terminée : limite de " +
          (limit(limits.seconds) || "durée") +
          " atteinte. Elle ne reprend pas seule : relance-la pour continuer.";
      } else if (reason === "idle") {
        view.ended = "idle";
        view.label =
          "Capture arrêtée : " +
          (limit(limits.idleSeconds) || "trop longtemps") +
          " sans lecture YouTube. Elle ne reprend pas seule.";
      } else if (reason === "session-changed" || report.connection === "session-changed") {
        view.ended = "session-changed";
        view.label = "Serveur redémarré ou session changée · redémarre l’analyse.";
      } else if (refused) {
        view.ended = "read-only";
        view.label =
          "Capture refusée : session ouverte en lecture seule. Choisis Reprendre ou Nouvelle session.";
      } else if (reason === "parent") {
        view.ended = "parent";
        view.label = "Capture arrêtée : contrôleur TV redémarré. Elle ne reprend pas seule.";
      } else if (reason === "stopped") view.label = "Capture arrêtée · contexte conservé";
      else if (last) {
        view.ended = "error";
        view.label = "Capture arrêtée · " + last;
      } else if (reason && report.stopMessage) {
        // A cause this panel does not know yet: the capture words it itself.
        view.ended = reason;
        view.label = "Capture arrêtée : " + report.stopMessage;
      } else if (value && value.exitCode) {
        view.ended = "error";
        view.label = "Capture interrompue · tu peux réessayer.";
      } else view.label = "Capture arrêtée · contexte conservé";
    }
    if (report.dropped) {
      var causes = Object.keys(report.dropReasons || {})
        .map(function (key) {
          return (DROP_LABELS[key] || key) + " " + report.dropReasons[key];
        })
        .join(", ");
      view.label +=
        " · " +
        plural(report.dropped, "passage non envoyé", "passages non envoyés") +
        (causes ? " (" + causes + ")" : "");
    }
    return view;
  }

  var api = {
    clock: clock,
    duration: duration,
    bytes: bytes,
    describeStorage: describeStorage,
    describeSessions: describeSessions,
    describeDeletion: describeDeletion,
    describeArchive: describeArchive,
    describeCapture: describeCapture,
  };
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
    return;
  }
  // ---- Browser only below ------------------------------------------------------------------
  var el = function (id) {
    return document.getElementById(id);
  };
  var ACTIONS = ["session-open", "session-resume", "session-delete", "session-new", "sessions-back"];
  /**
   * Session list in the timeline band (outside the video rectangle): a rail of sessions, then the
   * actions of the selected one. Back goes actions → rail → timeline.
   * @param {{client:object, timeline:object, capture:object, kick:Function}} options
   */
  function SessionsView(options) {
    this.options = options;
    this.active = false;
    this.model = null;
    this.selected = null;
    this.nodes = {};
    this.run = 0;
    this.busy = false;
    this.hint = el("timeline-hint").textContent;
    var self = this;
    el("timeline-sessions").onclick = function () {
      self.open();
    };
    el("sessions-back").onclick = function () {
      self.close();
    };
    el("session-open").onclick = function () {
      self.act(async function (row) {
        await self.settle();
        return self.options.client.sessionAction(row.id, "open");
      }, true);
    };
    // Leaving the list by another button of the band closes it without taking the focus back.
    ["timeline-live", "timeline-chat", "timeline-end"].forEach(function (id) {
      el(id).addEventListener("click", function () {
        if (self.active) self.dismiss();
      });
    });
    el("session-resume").onclick = function () {
      self.act(function () {
        return self.options.capture.resumeHere();
      }, true);
    };
    el("session-new").onclick = function () {
      self.act(function () {
        return self.options.capture.newSession();
      }, true);
    };
    el("session-delete").onclick = function () {
      var row = self.row();
      if (!row || !row.canDelete) return;
      var copy = describeDeletion(row);
      el("delete-subject").textContent = copy.subject;
      el("delete-removed").textContent = copy.removed;
      el("delete-kept").textContent = copy.kept;
      el("delete-error").textContent = "";
      el("delete-session-dialog").showModal();
      // The harmless choice is focused first: a stray OK deletes nothing.
      el("delete-cancel").focus();
    };
    el("delete-cancel").onclick = function () {
      el("delete-session-dialog").close();
      el("session-delete").focus();
    };
    el("delete-confirm").onclick = async function () {
      var row = self.row();
      if (!row || self.busy) return;
      self.busy = true;
      this.setAttribute("aria-disabled", "true");
      try {
        if (row.current) await self.settle();
        await self.options.client.sessionAction(row.id, "delete");
        el("delete-session-dialog").close();
        self.options.kick();
        await self.load();
        self.focusSelected();
      } catch (error) {
        el("delete-error").textContent = error.message;
      } finally {
        self.busy = false;
        this.removeAttribute("aria-disabled");
      }
    };
  }
  SessionsView.prototype.row = function () {
    var self = this;
    return (
      (this.model &&
        this.model.rows.find(function (row) {
          return row.id === self.selected;
        })) ||
      null
    );
  };
  SessionsView.prototype.open = async function () {
    this.active = true;
    this.options.timeline.sessionsOpen = true;
    this.options.timeline.layoutPanes();
    el("timeline-hint").textContent =
      "← → Parcourir · Bas Actions · Retour Frise · rien n’est capturé à l’ouverture d’une session";
    el("sessions-status").textContent = "Lecture des sessions…";
    el("sessions-back").focus();
    await this.load();
    if (this.active) this.focusSelected();
  };
  SessionsView.prototype.dismiss = function () {
    this.active = false;
    this.run++;
    this.options.timeline.sessionsOpen = false;
    this.options.timeline.layoutPanes();
    el("timeline-hint").textContent = this.hint;
  };
  SessionsView.prototype.close = function () {
    this.dismiss();
    el("timeline-sessions").focus();
  };
  // The session in memory stops accepting before it is left or deleted. Only when this TV is not
  // capturing: a running capture is stopped by its own button, never as a side effect.
  SessionsView.prototype.settle = async function () {
    if (this.model && this.model.pauseFirst)
      await this.options.client.request("/v1/session/pause", {});
  };
  // The list reads the disk on the server: on opening and after an action, never in a poll.
  SessionsView.prototype.load = async function () {
    var run = ++this.run,
      self = this;
    try {
      var library = await this.options.client.sessions();
      if (run !== this.run) return;
      this.model = describeSessions(library, {
        capturing: this.options.capture.active(),
      });
      if (!this.row())
        this.selected =
          this.model.currentId &&
          this.model.rows.some(function (row) {
            return row.id === self.model.currentId;
          })
            ? this.model.currentId
            : this.model.rows.length
              ? this.model.rows[0].id
              : null;
      this.render();
    } catch (error) {
      if (run !== this.run) return;
      this.model = null;
      el("sessions-rail").replaceChildren();
      this.nodes = {};
      el("sessions-storage").textContent = "";
      el("sessions-status").textContent =
        error.status === 404
          ? "Sessions indisponibles : serveur à mettre à jour."
          : error.message;
      this.renderActions();
    }
    // An action that the new list no longer offers cannot keep the remote.
    var focused = document.activeElement;
    if (this.active && !el("delete-session-dialog").open && (focused === document.body || focused.disabled))
      this.focusSelected();
  };
  SessionsView.prototype.render = function () {
    var self = this,
      model = this.model,
      rail = el("sessions-rail"),
      index = Math.max(
        0,
        model.rows.findIndex(function (row) {
          return row.id === self.selected;
        }),
      ),
      visible = model.rows.slice(Math.max(0, index - 2), Math.min(model.rows.length, index + 4)),
      keep = {};
    el("sessions-storage").textContent = model.storage.line;
    el("sessions-storage").dataset.state = model.storage.state;
    visible.forEach(function (row) {
      keep[row.id] = true;
    });
    Object.keys(this.nodes).forEach(function (id) {
      if (!keep[id]) {
        self.nodes[id].remove();
        delete self.nodes[id];
      }
    });
    visible.forEach(function (row) {
      var node = self.nodes[row.id];
      if (!node) {
        node = document.createElement("button");
        node.className = "session-card";
        node.dataset.id = row.id;
        node.innerHTML = "<strong></strong><span></span><small></small><small class=\"session-state\"></small>";
        node.onfocus = function () {
          self.selected = row.id;
          self.renderActions();
        };
        node.onclick = function () {
          var first = self.firstAction();
          if (first) first.focus();
        };
        self.nodes[row.id] = node;
      }
      node.dataset.selected = String(row.id === self.selected);
      node.dataset.current = String(row.current);
      node.children[0].textContent = row.title;
      node.children[1].textContent = row.meta;
      node.children[2].textContent = row.media;
      node.children[3].textContent = row.status;
    });
    var expected = visible
      .map(function (row) {
        return row.id;
      })
      .join(",");
    if (
      [].map
        .call(rail.children, function (node) {
          return node.dataset.id || "";
        })
        .join(",") !== expected
    ) {
      var active = document.activeElement && document.activeElement.dataset.id;
      rail.replaceChildren.apply(
        rail,
        visible.map(function (row) {
          return self.nodes[row.id];
        }),
      );
      if (active && self.nodes[active]) self.nodes[active].focus({ preventScroll: true });
    }
    if (model.empty && !rail.children.length) {
      var empty = document.createElement("p");
      empty.className = "timeline-empty";
      empty.textContent = model.empty;
      rail.appendChild(empty);
    }
    this.renderActions();
  };
  SessionsView.prototype.renderActions = function () {
    var row = this.row(),
      model = this.model;
    el("session-open").disabled = !(row && row.canOpen);
    el("session-resume").disabled = !(row && row.canResume);
    el("session-delete").disabled = !(row && row.canDelete);
    el("session-new").disabled = !(model && model.canNew);
    Object.keys(this.nodes).forEach(
      function (id) {
        this.nodes[id].dataset.selected = String(id === this.selected);
      }.bind(this),
    );
    if (!model) return;
    el("sessions-status").textContent = row
      ? [row.status, row.openBlocked && !row.archived ? row.openBlocked : "", row.deleteBlocked || ""]
          .filter(Boolean)
          .join(" · ")
      : model.empty || "";
  };
  SessionsView.prototype.firstAction = function () {
    return ACTIONS.map(el).filter(function (node) {
      return !node.disabled;
    })[0];
  };
  SessionsView.prototype.focusSelected = function () {
    var node = this.nodes[this.selected];
    if (node) {
      node.focus({ preventScroll: true });
      node.scrollIntoView({ block: "nearest", inline: "nearest" });
    } else el("sessions-back").focus();
  };
  // One viewer action at a time. A refusal of the server (409 capture running, 507 disk full) is shown
  // in its own words; the list is read again either way.
  SessionsView.prototype.act = async function (work, closeAfter) {
    var row = this.row();
    if (this.busy || (!row && work.length)) return;
    this.busy = true;
    el("sessions-status").textContent = "Un instant…";
    try {
      await work(row);
      this.options.kick();
      if (closeAfter) return this.close();
      await this.load();
    } catch (error) {
      await this.load();
      el("sessions-status").textContent = error.message;
    } finally {
      this.busy = false;
    }
  };
  SessionsView.prototype.handleKey = function (event) {
    if (!this.active || this.options.timeline.mode !== "timeline") return false;
    var key = event.keyCode,
      back = key === 461 || event.key === "Escape",
      active = document.activeElement,
      self = this;
    if (![13, 37, 38, 39, 40, 461].includes(key) && !back) return false;
    var onAction = ACTIONS.indexOf(active.id) >= 0,
      onCard = active.classList.contains("session-card");
    if (back) {
      event.preventDefault();
      if (onAction && this.nodes[this.selected]) this.focusSelected();
      else this.close();
      return true;
    }
    if (key === 13) return true; // Native click of the focused button.
    event.preventDefault();
    if (onCard) {
      if (key === 37 || key === 39) {
        var rows = this.model.rows,
          at = rows.findIndex(function (row) {
            return row.id === self.selected;
          }),
          next = rows[Math.max(0, Math.min(rows.length - 1, at + (key === 39 ? 1 : -1)))];
        if (next) {
          this.selected = next.id;
          this.render();
          this.focusSelected();
        }
      } else if (key === 40) {
        var first = this.firstAction();
        if (first) first.focus();
      } else el("timeline-sessions").focus();
      return true;
    }
    if (onAction) {
      var enabled = ACTIONS.map(el).filter(function (node) {
          return !node.disabled;
        }),
        index = enabled.indexOf(active);
      if (key === 38) this.focusSelected();
      else if (key === 37 || key === 39)
        enabled[Math.max(0, Math.min(enabled.length - 1, index + (key === 39 ? 1 : -1)))].focus();
      return true;
    }
    // Toolbar of the timeline band: same row as before, plus the way down into the list.
    var bar = ["timeline-live", "timeline-chat", "timeline-sessions", "timeline-end"],
      place = bar.indexOf(active.id);
    if (key === 40 || place < 0) this.focusSelected();
    else if (key === 37 || key === 39)
      el(bar[Math.max(0, Math.min(bar.length - 1, place + (key === 39 ? 1 : -1)))]).focus();
    return true;
  };

  api.View = SessionsView;
  root.TVLensSessions = api;
})(typeof window !== "undefined" ? window : globalThis);
