(function (root) {
  "use strict";
  var el = function (id) {
    return document.getElementById(id);
  };
  var time = function (ms) {
    return (
      Math.floor(ms / 60000) +
      ":" +
      String(Math.floor(ms / 1000) % 60).padStart(2, "0")
    );
  };
  function TimelineView(options) {
    this.options = options;
    this.mode = "chat";
    this.cards = [];
    this.nodes = {};
    this.follow = true;
    this.selected = null;
    this.pinned = null;
    this.sessionId = null;
    this.urls = new Map();
    this.loading = new Set();
    this.generation = 0;
    this.detailGeneration = 0;
    var self = this;
    el("show-timeline").onclick = function () {
      self.switchMode("timeline");
    };
    el("timeline-chat").onclick = function () {
      self.switchMode("chat");
    };
    el("timeline-live").onclick = function () {
      self.follow = true;
      self.pinned = null;
      self.selected = self.cards.at(-1)?.id;
      self.render(true);
    };
    el("detail-back").onclick = function () {
      self.closeDetail();
    };
    el("detail-words").onclick = function () {
      el("detail-transcript").hidden = !el("detail-transcript").hidden;
      this.textContent = el("detail-transcript").hidden
        ? "Voir les paroles"
        : "Masquer les paroles";
      if (!el("detail-transcript").hidden) el("detail-scroll").focus();
    };
    el("detail-ask").onclick = async function () {
      var selection = self.detail;
      if (selection && (await self.switchMode("chat")))
        self.options.onAsk(selection, self.sessionId);
    };
    el("timeline-end").onclick = function () {
      el("end-error").textContent = "";
      el("end-session-dialog").showModal();
      el("end-cancel").focus();
    };
    el("end-cancel").onclick = function () {
      el("end-session-dialog").close();
      el("timeline-end").focus();
    };
    el("end-confirm").onclick = async function () {
      if (self.ending) return;
      self.ending = true;
      this.setAttribute("aria-disabled", "true");
      try {
        await self.options.onEnd();
        el("end-session-dialog").close();
        self.reset(null);
        el("timeline-chat").focus();
      } catch (error) {
        el("end-error").textContent = error.message;
      } finally {
        self.ending = false;
        this.removeAttribute("aria-disabled");
      }
    };
  }
  TimelineView.prototype.switchMode = async function (mode) {
    if (this.switching) return false;
    this.switching = true;
    el("show-timeline").setAttribute("aria-busy", "true");
    try {
      await this.options.changeLayout(mode);
      this.mode = mode;
      el("chat-panel").hidden = mode !== "chat";
      el("timeline-panel").hidden = mode !== "timeline";
      document.body.dataset.mode = mode;
      if (mode === "timeline") {
        this.render();
        if (this.detail) el("detail-words").focus();
        else this.focusSelected();
      } else el("dictate").focus();
      return true;
    } catch (error) {
      el("error").textContent = error.message;
      el("timeline-status").textContent = error.message;
      return false;
    } finally {
      this.switching = false;
      el("show-timeline").removeAttribute("aria-busy");
    }
  };
  TimelineView.prototype.reset = function (sessionId) {
    this.generation++;
    this.detailGeneration++;
    this.sessionId = sessionId;
    this.urls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    this.urls.clear();
    this.loading.clear();
    this.cards = [];
    this.nodes = {};
    this.selected = null;
    this.pinned = null;
    this.follow = true;
    this.detail = null;
    el("timeline-rail").replaceChildren();
    el("detail-image").removeAttribute("src");
    el("moment-detail").hidden = true;
    el("timeline-rail").hidden = false;
    this.render();
  };
  TimelineView.prototype.update = function (state) {
    var timeline = state.timeline || {
      sessionId: state.session?.id || null,
      cards: [],
    };
    if (timeline.sessionId !== this.sessionId) this.reset(timeline.sessionId);
    this.cards = timeline.cards;
    this.state = state;
    if (this.follow && !this.detail)
      this.selected = this.cards.at(-1)?.id || null;
    var pending = this.cards.reduce(function (n, c) {
      return n + c.pending;
    }, 0);
    el("timeline-status").textContent =
      this.cards.length +
      " moment(s)" +
      (pending ? " · " + pending + " en analyse" : "") +
      (!this.follow ? " · consultation du passé" : " · au direct");
    this.render();
    if (this.follow && this.mode === "timeline" && !this.detail) {
      this.nodes[this.selected]?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
      if (document.activeElement.classList.contains("timeline-card"))
        this.focusSelected();
    }
  };
  TimelineView.prototype.displayCards = function () {
    var cards = this.cards.slice();
    if (this.pinned && !cards.some((c) => c.id === this.pinned.id)) {
      var pinned = Object.assign({}, this.pinned);
      var passage = [
        ...(this.state?.session?.history || []),
        ...(this.state?.session?.segments || []),
      ].find((p) => p.id === pinned.id);
      if (passage?.status === "ready")
        Object.assign(pinned, {
          title: passage.observation?.topic || "Moment sélectionné",
          summary: passage.observation?.summary || "",
          status: "ready",
          pending: 0,
        });
      cards.push(pinned);
      cards.sort(function (a, b) {
        return a.startMs - b.startMs;
      });
    }
    return cards;
  };
  TimelineView.prototype.render = function (focus) {
    var self = this,
      cards = this.displayCards(),
      rail = el("timeline-rail");
    var index = Math.max(
      0,
      cards.findIndex(function (c) {
        return c.id === self.selected;
      }),
    );
    // Only visible neighbours enter the DOM or load images; session history remains navigable.
    var visible = cards.slice(
      Math.max(0, index - 3),
      Math.min(cards.length, index + 5),
    );
    var keep = new Set(visible.map((c) => c.id));
    Object.keys(this.nodes).forEach(function (id) {
      if (!keep.has(id)) {
        self.nodes[id].remove();
        delete self.nodes[id];
      }
    });
    if (!cards.length) {
      if (!rail.querySelector(".timeline-empty")) {
        var empty = document.createElement("p");
        empty.className = "timeline-empty";
        empty.textContent =
          "Les images apparaîtront dès les premières captures.";
        rail.replaceChildren(empty);
      }
      return;
    }
    rail.querySelector(".timeline-empty")?.remove();
    visible.forEach(function (card) {
      var node = self.nodes[card.id];
      if (!node) {
        node = document.createElement("button");
        node.className = "timeline-card";
        node.dataset.id = card.id;
        node.innerHTML =
          '<img alt="Capture du programme"><span class="card-copy"><small></small><h2></h2><p></p><small class="card-status"></small></span>';
        node.onfocus = function () {
          self.selected = card.id;
          self.follow = false;
          self.pinned = structuredClone(
            self.displayCards().find((c) => c.id === card.id) || card,
          );
          self.markSelection();
        };
        node.onclick = function () {
          self.openDetail(
            self.displayCards().find((c) => c.id === card.id) || card,
          );
        };
        self.nodes[card.id] = node;
      }
      node.querySelector("h2").textContent = card.title;
      node.querySelector("small").textContent =
        time(card.startMs) + " — " + time(card.endMs);
      node.querySelector("p").textContent =
        card.summary ||
        (card.status === "error"
          ? "Image conservée · analyse indisponible"
          : "Image reçue · description à venir");
      node.querySelector(".card-status").textContent =
        card.status === "pending"
          ? "◌ Analyse en cours"
          : card.status === "error"
            ? "Analyse incomplète"
            : "Observations automatiques";
      self.loadThumbnail(node.querySelector("img"), card.thumbnailId);
    });
    var expected = visible.map((c) => c.id).join(",");
    if ([...rail.children].map((n) => n.dataset.id).join(",") !== expected) {
      var activeId = document.activeElement?.dataset.id,
        wasFollowing = this.follow,
        intendedSelection = this.selected;
      visible.forEach(function (c) {
        rail.appendChild(self.nodes[c.id]);
      });
      if (activeId && self.nodes[activeId])
        self.nodes[activeId].focus({ preventScroll: true });
      this.follow = wasFollowing;
      this.selected = intendedSelection;
    }
    this.markSelection();
    if (focus) this.focusSelected();
  };
  TimelineView.prototype.markSelection = function () {
    var self = this;
    Object.keys(this.nodes).forEach(function (id) {
      self.nodes[id].dataset.selected = String(id === self.selected);
    });
  };
  TimelineView.prototype.focusSelected = function () {
    var node = this.nodes[this.selected];
    if (node) {
      var following = this.follow;
      node.focus({ preventScroll: true });
      node.scrollIntoView({ block: "nearest", inline: "nearest" });
      this.follow = following;
    } else el("timeline-chat").focus();
  };
  TimelineView.prototype.loadThumbnail = function (image, id) {
    var self = this,
      generation = this.generation;
    if (!id) {
      image.removeAttribute("src");
      return;
    }
    image.dataset.thumbnail = id;
    if (this.urls.has(id)) {
      if (image.src !== this.urls.get(id)) image.src = this.urls.get(id);
      return;
    }
    if (this.loading.has(id) || this.mode !== "timeline") return;
    this.loading.add(id);
    this.options.client
      .thumbnail(this.sessionId, id)
      .then(function (url) {
        if (generation !== self.generation) {
          URL.revokeObjectURL(url);
          return;
        }
        self.urls.set(id, url);
        document
          .querySelectorAll('img[data-thumbnail="' + id + '"]')
          .forEach(function (node) {
            node.src = url;
          });
        while (self.urls.size > 16) {
          var first = self.urls.keys().next().value;
          URL.revokeObjectURL(self.urls.get(first));
          self.urls.delete(first);
        }
      })
      .catch(function () {
        image.alt = "Miniature indisponible";
      })
      .finally(function () {
        if (generation === self.generation) self.loading.delete(id);
      });
  };
  TimelineView.prototype.openDetail = async function (card) {
    this.follow = false;
    this.pinned = structuredClone(card);
    this.detail = structuredClone(card);
    var revision = ++this.detailGeneration;
    el("timeline-rail").hidden = true;
    el("moment-detail").hidden = false;
    el("detail-title").textContent = card.title;
    el("detail-time").textContent =
      time(card.startMs) + "–" + time(card.endMs) + " · temps observé";
    el("detail-summary").textContent =
      card.summary || "Analyse encore indisponible.";
    el("detail-limits").textContent =
      "Observations automatiques, non vérifiées. Aucune relecture dans cette vue.";
    el("detail-transcript").replaceChildren();
    el("detail-transcript").hidden = true;
    el("detail-words").textContent = "Voir les paroles";
    el("detail-scroll").scrollTop = 0;
    this.loadThumbnail(el("detail-image"), card.thumbnailId);
    el("detail-words").focus();
    try {
      var detail = await this.options.client.detail(
        this.sessionId,
        card.segmentIds,
      );
      if (revision !== this.detailGeneration) return;
      detail.passages.forEach(function (p) {
        var text = document.createElement("p");
        text.textContent =
          time(p.startMs) +
          " · " +
          (p.transcript || "Paroles indisponibles pour ce passage.");
        el("detail-transcript").appendChild(text);
      });
      el("detail-limits").textContent =
        "Observations et transcription automatiques, potentiellement imprécises. " +
        (detail.passages.some((p) => !p.available)
          ? "Média détaillé expiré ; miniature et textes conservés jusqu’à la fin de session. "
          : "") +
        [...new Set(detail.passages.map((p) => p.uncertainty).filter(Boolean))]
          .slice(0, 2)
          .join(" ");
    } catch (error) {
      if (revision === this.detailGeneration)
        el("detail-limits").textContent = error.message;
    }
  };
  TimelineView.prototype.closeDetail = function () {
    this.detailGeneration++;
    this.detail = null;
    el("moment-detail").hidden = true;
    el("timeline-rail").hidden = false;
    this.render(true);
  };
  TimelineView.prototype.handleKey = function (event) {
    if (this.mode !== "timeline") return false;
    var key = event.keyCode,
      back = key === 461 || event.key === "Escape";
    if (![13, 37, 38, 39, 40, 461].includes(key) && !back) return false;
    var active = document.activeElement;
    if (el("end-session-dialog").open) {
      if (back) {
        event.preventDefault();
        el("end-cancel").click();
      } else if ([37, 38, 39, 40].includes(key)) {
        event.preventDefault();
        (active === el("end-cancel")
          ? el("end-confirm")
          : el("end-cancel")
        ).focus();
      }
      return true;
    }
    if (back) {
      event.preventDefault();
      if (this.detail) this.closeDetail();
      else window.close();
      return true;
    }
    if (key === 13) return true; // Native focused button click.
    event.preventDefault();
    if (this.detail) {
      if (active === el("detail-scroll")) {
        if (key === 38 || key === 40)
          active.scrollTop += key === 40 ? 100 : -100;
        else el("detail-words").focus();
      } else {
        var actions = ["detail-words", "detail-ask", "detail-back"],
          index = actions.indexOf(active.id);
        if (key === 37) el("detail-scroll").focus();
        else
          el(
            actions[
              Math.max(
                0,
                Math.min(2, index + (key === 40 ? 1 : key === 38 ? -1 : 0)),
              )
            ],
          ).focus();
      }
      return true;
    }
    if (
      active.classList.contains("timeline-card") ||
      active === el("timeline-rail")
    ) {
      if (key === 38) el("timeline-live").focus();
      else if (key === 37 || key === 39) {
        var cards = this.displayCards(),
          current = cards.findIndex((c) => c.id === this.selected);
        var next =
          cards[
            Math.max(
              0,
              Math.min(cards.length - 1, current + (key === 39 ? 1 : -1)),
            )
          ];
        if (next) {
          this.follow = false;
          this.selected = next.id;
          this.pinned = structuredClone(next);
          this.render(true);
        }
      }
    } else {
      var ids = ["timeline-live", "timeline-chat", "timeline-end"],
        at = ids.indexOf(active.id);
      if (key === 40) this.focusSelected();
      else
        el(
          ids[
            Math.max(
              0,
              Math.min(2, at + (key === 39 ? 1 : key === 37 ? -1 : 0)),
            )
          ],
        ).focus();
    }
    return true;
  };
  root.TVLensTimeline = TimelineView;
})(window);
