// Pure view model of the surveillance overlay: the bottom-left card and the discreet activity pill.
// The open panel runs the queue (OverlayQueue). Nothing here reaches the network, storage or a clock
// of its own: time is injected. Only sourced web results enter the queue; video signals, unsourced
// lots and unknown kinds are refused, whatever the caller does.
// Classic script on webOS (globals below); exposed through CommonJS for tests.
var TVLensOverlay = (function () {
  "use strict";
  var DISPLAY_CHOICES = [8000, 14000, 20000],
    DISPLAY_DEFAULT_MS = 14000,
    DISPLAY_MIN_MS = 1000,
    DISPLAY_MAX_MS = 20000,
    GAP_MS = 1500,
    MAX_QUEUE = 4,
    STALE_MS = 180000,
    MAX_SEQ = 999999999,
    MAX_HOSTS = 2,
    // Above this a number is a wall-clock reading (1973 onwards), below it a session clock.
    WALL_CLOCK_FLOOR_MS = 100000000000,
    ACTIVE_STATES = ["detecting", "verifying", "late"],
    ACTIVITY_LABELS = {
      detecting: "Lecture des nouveaux passages…",
      verifying: "Vérification en cours…",
      late: "Surveillance en retard.",
    };

  function integer(value, min, max) {
    return typeof value === "number" && Math.floor(value) === value && value >= min && value <= max;
  }
  function finite(value) {
    return typeof value === "number" && isFinite(value);
  }
  function plain(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
  // Hard ceiling whatever the stored setting says: a corrupt value never keeps a card on screen.
  function displayMs(value) {
    if (!finite(value) || value <= 0) return DISPLAY_DEFAULT_MS;
    return Math.min(DISPLAY_MAX_MS, Math.max(DISPLAY_MIN_MS, Math.round(value)));
  }
  // Hosts only, never an address: a full URL and a bare host name both come out as "insee.fr".
  function hostOf(source) {
    var raw = source && (typeof source.host === "string" ? source.host : source.url),
      match;
    if (typeof raw !== "string") return "";
    match = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@\/?#\s]*@)?([^:\/?#\s]+)/i.exec(raw.trim());
    raw = match ? match[1].toLowerCase().replace(/^www\./, "").replace(/\.$/, "") : "";
    return /^[a-z0-9](?:[a-z0-9.-]{0,78}[a-z0-9])?$/.test(raw) && raw.indexOf(".") > 0 ? raw : "";
  }
  function sourceHosts(sources) {
    var hosts = [],
      host,
      i;
    if (!Array.isArray(sources)) return hosts;
    for (i = 0; i < sources.length; i++) {
      host = hostOf(sources[i]);
      if (host && hosts.indexOf(host) < 0) hosts.push(host);
    }
    return hosts;
  }
  function sourced(card) {
    return !!card && card.kind === "verification" && sourceHosts(card.sources).length > 0;
  }
  function clock(ms) {
    var total = Math.max(0, Math.floor(ms / 1000)),
      hours = Math.floor(total / 3600),
      minutes = Math.floor(total / 60) % 60;
    return (hours ? hours + ":" + String(minutes).padStart(2, "0") : String(minutes)) + ":" + String(total % 60).padStart(2, "0");
  }
  function range(interval) {
    if (!plain(interval) || !finite(interval.startMs) || !finite(interval.endMs)) return "";
    if (interval.startMs < 0 || interval.endMs < interval.startMs) return "";
    return clock(interval.startMs) + "–" + clock(interval.endMs);
  }
  // A pasted address is reduced to its host: the card never shows a URL.
  function tidy(text) {
    return String(text)
      .replace(/(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s]+/gi, function (url) {
        return hostOf({ url: url });
      })
      .replace(/\s+/g, " ")
      .trim();
  }
  function plural(count, one, many) {
    return count + " " + (count > 1 ? many : one);
  }

  // {kicker, text, sourcesLine, footer, accent}, or null when the card must not be drawn. No true/false badge:
  // the assessments of a lot are deliberately not read here.
  function describeCard(card, context) {
    var notice, hosts, text, when, more, footer;
    if (!plain(card) || typeof card.text !== "string") return null;
    text = tidy(card.text);
    if (!text) return null;
    notice = card.kind === "notice";
    hosts = notice ? [] : sourceHosts(card.sources);
    if (!notice && (card.kind !== "verification" || !hosts.length)) return null;
    context = context || {};
    if (notice) return { kicker: "TV Lens", text: text, sourcesLine: "", footer: "", accent: "notice" };
    when = range(card.interval);
    more = integer(context.more, 0, 99) ? context.more : integer(card.more, 0, 99) ? card.more : 0;
    footer = [];
    if (more) footer.push("+" + plural(more, "autre résultat", "autres résultats"));
    if (typeof context.hint === "string" && context.hint) footer.push(context.hint);
    return {
      kicker: (typeof card.label === "string" && card.label && card.label.length <= 60 ? card.label : "Sources consultées") + (when ? " · " + when : ""),
      text: text,
      sourcesLine: "Sources : " + hosts.slice(0, MAX_HOSTS).join(" · ") + (hosts.length > MAX_HOSTS ? " +" + (hosts.length - MAX_HOSTS) : ""),
      footer: footer.join(" · "),
      accent: "verification",
    };
  }

  // A cause with the number that belongs to it, and without it when that number is 0 or absent.
  function counted(cause, digits, one, many) {
    var count = Number(digits);
    return count > 0 ? cause + " · " + plural(count, one, many) : cause;
  }
  // The server words the activity as a sentence; the pill is one line in a 440 px box. Its known sentences
  // lose their filler here and keep their cause and their number; an unknown one is kept whole (the box cuts it).
  // A number that is 0 is never shown. The server does send one: a single check still running 90 s after its
  // claim was found, with nothing queued behind it, is worded "Vérifications en retard : 0 affirmation en
  // attente." What is late there is the check under way, not an empty queue.
  function shortActivity(label) {
    var match;
    if ((match = /^Lecture des passages en échec(?: : (\d+) passages? non lus?)?\.?$/.exec(label)))
      return counted("Lecture en échec", match[1], "passage non lu", "passages non lus");
    if ((match = /^Lecture rétablie : (\d+) passages? n’(?:a|ont) pas pu être lus?\.?$/.exec(label)))
      return counted("Lecture rétablie", match[1], "passage non lu", "passages non lus");
    if ((match = /^Vérifications en retard : (\d+) affirmations? en attente\.?$/.exec(label)))
      return Number(match[1]) > 0 ? "Vérifications en retard · " + Number(match[1]) + " en attente" : "Vérification en cours · en retard";
    // The sentence the panel says of that case (surveillance-view.js), should the server come to word it itself.
    if (/^Vérification en cours : elle a pris du retard\.?$/.test(label)) return "Vérification en cours · en retard";
    if ((match = /^Lecture en retard : (\d+) passages? à lire\.?$/.exec(label))) return counted("Lecture en retard", match[1], "passage à lire", "passages à lire");
    if (/^Registre plein\b/.test(label)) return "Registre plein · lecture arrêtée";
    if (/^Lecture des nouveaux passages…?$/.test(label)) return "Lecture des passages…";
    return label;
  }
  // One line for the pill, in the words of the state. A late label from the server already names its cause
  // and the number that goes with it; "en retard" is only appended when the wording does not say it, and a
  // count is only shown when there is something to count: never "en retard · 0 en attente".
  function describePill(activity) {
    var label, waiting;
    if (!plain(activity)) return null;
    label = typeof activity.label === "string" ? activity.label.replace(/\s+/g, " ").trim() : "";
    if (!label) label = ACTIVITY_LABELS[activity.late ? "late" : activity.state] || "";
    if (!label) return null;
    label = shortActivity(label);
    waiting = integer(activity.waiting, 1, 999) ? activity.waiting : 0;
    if (activity.late) return { label: /retard|échec|plein|rétablie/i.test(label) ? label : label + " · en retard", late: true };
    return { label: waiting ? label + " · " + waiting + " en attente" : label, late: false };
  }
  // null (nothing on screen) unless the surveillance is working: detecting, verifying or late.
  function describeActivity(surveillance) {
    var activity = plain(surveillance) ? surveillance.activity : null;
    if (!plain(activity) || surveillance.enabled === false || ACTIVE_STATES.indexOf(activity.state) < 0) return null;
    return describePill({ state: activity.state, label: activity.label, waiting: activity.waiting, late: activity.state === "late" });
  }

  // The age is a difference between two readings of one server clock; the TV's own clock never enters it.
  // serverNowMs pairs with card.finishedAt, a session clock (elapsedMs) with card.publishedAtMs.
  function ageOf(card, serverNow) {
    var stamp;
    if (!finite(serverNow)) return null;
    stamp = serverNow >= WALL_CLOCK_FLOOR_MS ? card.finishedAt : card.publishedAtMs;
    return finite(stamp) ? Math.max(0, serverNow - stamp) : null;
  }

  // options: {now, displayMs: 14000, gapMs: 1500, maxQueue: 4, staleMs: 180000}. `now` is the local clock in
  // milliseconds; it only measures elapsed time (display, gap, ageing while waiting).
  function OverlayQueue(options) {
    options = options || {};
    this.now = typeof options.now === "function" ? options.now : Date.now;
    this.displayMs = displayMs(options.displayMs);
    this.gapMs = finite(options.gapMs) && options.gapMs >= 0 ? options.gapMs : GAP_MS;
    this.maxQueue = integer(options.maxQueue, 1, 20) ? options.maxQueue : MAX_QUEUE;
    this.staleMs = finite(options.staleMs) && options.staleMs > 0 ? options.staleMs : STALE_MS;
    this.sessionId = null;
    this.cursor = null;
    // The last reply was read while the server restored its saved registry: its sequences were not final.
    this.unsettled = false;
    this.queue = [];
    this.held = null;
    this.current = null;
    // What the last tick() reported: `changed` compares against it, so a reset between two ticks is seen.
    this.reported = null;
    this.nextAt = 0;
    this.batch = 0;
    this.counts = { shown: 0, skippedStale: 0, skippedOverflow: 0, skippedUnsourced: 0, freshnessUnknown: 0 };
  }
  // New session: nothing of the previous one stays queued or on screen. A lastSeq that is not a sequence
  // number leaves the cursor unanchored: the next accept() adopts the server's current seq and replays nothing.
  OverlayQueue.prototype.reset = function (sessionId, lastSeq) {
    this.sessionId = sessionId === undefined ? null : sessionId;
    this.cursor = integer(lastSeq, 0, MAX_SEQ) ? lastSeq : null;
    this.queue = [];
    this.held = null;
    if (this.current) {
      this.current = null;
      this.nextAt = this.now() + this.gapMs;
    }
  };
  OverlayQueue.prototype.setDisplayMs = function (value) {
    this.displayMs = displayMs(value);
    return this.displayMs;
  };
  // Cards the server published after the cursor, oldest first. serverNow is the server's reading of "now"
  // (state.serverNowMs, or the session clock). Returns {added, skipped}: cards of this call still waiting,
  // and cards counted as not shown by this call.
  OverlayQueue.prototype.accept = function (cards, serverNow) {
    var now = this.now(),
      fresh = [],
      skipped = 0,
      added = 0,
      batch = ++this.batch,
      lowest = Infinity,
      card,
      age,
      i;
    cards = Array.isArray(cards) ? cards : [];
    if (this.cursor === null) {
      this.cursor = 0;
      for (i = 0; i < cards.length; i++) if (cards[i] && integer(cards[i].seq, 1, MAX_SEQ)) this.cursor = Math.max(this.cursor, cards[i].seq);
      return { added: 0, skipped: 0 };
    }
    for (i = 0; i < cards.length; i++) {
      card = cards[i];
      // Without a sequence number a card could not be told from one already shown: it is not taken.
      if (!plain(card) || !integer(card.seq, 1, MAX_SEQ) || card.seq <= this.cursor) continue;
      fresh.push(card);
      lowest = Math.min(lowest, card.seq);
    }
    if (!fresh.length) return { added: 0, skipped: 0 };
    fresh.sort(function (a, b) {
      return (finite(a.finishedAt) ? a.finishedAt : Infinity) - (finite(b.finishedAt) ? b.finishedAt : Infinity) || a.seq - b.seq;
    });
    // The server only serves its last few cards: what fell out between two readings is counted, never ignored.
    if (lowest > this.cursor + 1) {
      this.counts.skippedOverflow += lowest - this.cursor - 1;
      skipped += lowest - this.cursor - 1;
    }
    for (i = 0; i < fresh.length; i++) {
      card = fresh[i];
      this.cursor = Math.max(this.cursor, card.seq);
      if (!sourced(card)) {
        this.counts.skippedUnsourced++;
        skipped++;
        continue;
      }
      age = ageOf(card, serverNow);
      if (age === null) {
        this.counts.freshnessUnknown++;
        age = 0;
      }
      if (age > this.staleMs) {
        this.counts.skippedStale++;
        skipped++;
        continue;
      }
      this.queue.push({ card: card, bornAt: now - age, batch: batch, shown: false });
      if (this.queue.length > this.maxQueue) {
        this.queue.shift();
        this.counts.skippedOverflow++;
        skipped++;
      }
    }
    for (i = 0; i < this.queue.length; i++) if (this.queue[i].batch === batch) added++;
    return { added: added, skipped: skipped };
  };
  // One reply of the server (the overlay route, or the surveillance block of the state with the session id):
  // {sessionId, serverNowMs, overlay: {seq, cards}, activity?, registry?}. `signals` is never read: a signal
  // is not an overlay card. While the server reads the registry saved with the session (registry.ready false,
  // activity "restoring") its sequences are not final: nothing is taken, and the first reply after that
  // places the cursor again, so a restored history is never taken for new results.
  OverlayQueue.prototype.ingest = function (feed) {
    var overlay = plain(feed) && plain(feed.overlay) ? feed.overlay : {},
      sessionId = plain(feed) && feed.sessionId ? feed.sessionId : null,
      restoring = plain(feed) && ((plain(feed.registry) && feed.registry.ready === false) || (plain(feed.activity) && feed.activity.state === "restoring"));
    if (sessionId !== this.sessionId || restoring || this.unsettled) this.reset(sessionId, restoring ? null : overlay.seq);
    this.unsettled = restoring;
    if (!sessionId || restoring) return { added: 0, skipped: 0 };
    return this.accept(overlay.cards, finite(feed.serverNowMs) ? feed.serverNowMs : feed.elapsedMs);
  };
  // The other screen showed the cards of `sessionId` up to seq: they are not shown again here, and not counted
  // as missed. The numbering starts over with each session: a declaration that names another session, or
  // none, moves nothing.
  OverlayQueue.prototype.seen = function (seq, sessionId) {
    if (!sessionId || sessionId !== this.sessionId) return;
    if (!integer(seq, 0, MAX_SEQ) || this.cursor === null) return;
    this.cursor = Math.max(this.cursor, seq);
    this.queue = this.queue.filter(function (entry) {
      return entry.card.seq > seq;
    });
    if (this.held && this.held.card.seq <= seq) this.held = null;
  };
  // One display turn: {card, more, changed}. paused (a dialog is open, the LG keyboard is visible): no card
  // leaves the queue and the one on screen is withdrawn, to come back whole afterwards; ageing goes on.
  OverlayQueue.prototype.tick = function (paused) {
    var now = this.now(),
      before = this.reported,
      entry;
    if (this.current && now >= this.current.until) {
      this.current = null;
      this.nextAt = now + this.gapMs;
    }
    if (paused) {
      if (this.current) {
        this.held = this.current.entry;
        this.current = null;
      }
    } else if (!this.current && now >= this.nextAt) {
      while (!this.current && (this.held || this.queue.length)) {
        entry = this.held || this.queue.shift();
        this.held = null;
        if (now - entry.bornAt > this.staleMs) {
          if (!entry.shown) this.counts.skippedStale++;
          continue;
        }
        if (!entry.shown) {
          entry.shown = true;
          this.counts.shown++;
        }
        this.current = { entry: entry, until: now + this.displayMs };
      }
    }
    this.reported = this.current ? this.current.entry.card : null;
    return { card: this.reported, more: this.queue.length + (this.held ? 1 : 0), changed: this.reported !== before };
  };
  OverlayQueue.prototype.state = function () {
    return {
      sessionId: this.sessionId,
      cursor: this.cursor,
      waiting: this.queue.length + (this.held ? 1 : 0),
      displayMs: this.displayMs,
      counts: {
        shown: this.counts.shown,
        skippedStale: this.counts.skippedStale,
        skippedOverflow: this.counts.skippedOverflow,
        skippedUnsourced: this.counts.skippedUnsourced,
        freshnessUnknown: this.counts.freshnessUnknown,
      },
    };
  };

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }
  function part(doc, parent, name, text) {
    var child;
    if (!text) return null;
    child = doc.createElement("div");
    child.className = name;
    child.textContent = text;
    parent.appendChild(child);
    return child;
  }
  // Draws one card in `node` (its only content), or empties and hides it when view is null. Inert boxes
  // only: nothing here can take the focus, and every text goes through textContent.
  function renderCard(node, view) {
    var doc = node.ownerDocument,
      card,
      foot;
    clear(node);
    if (!view || !view.text) {
      node.hidden = true;
      return node;
    }
    card = doc.createElement("div");
    card.className = "tvl-card";
    card.setAttribute("data-accent", view.accent === "notice" ? "notice" : "verification");
    part(doc, card, "tvl-card-kicker", view.kicker);
    part(doc, card, "tvl-card-text", view.text);
    if (view.sourcesLine || view.footer) {
      foot = doc.createElement("div");
      foot.className = "tvl-card-foot";
      part(doc, foot, "tvl-card-sources", view.sourcesLine);
      part(doc, foot, "tvl-card-footer", view.footer);
      card.appendChild(foot);
    }
    node.appendChild(card);
    node.hidden = false;
    return node;
  }
  // Same contract for the activity pill: view is {label, late} or null.
  function renderActivity(node, view) {
    var doc = node.ownerDocument,
      pill;
    clear(node);
    if (!view || !view.label) {
      node.hidden = true;
      return node;
    }
    pill = doc.createElement("div");
    pill.className = "tvl-pill";
    pill.setAttribute("data-late", view.late ? "true" : "false");
    pill.appendChild(doc.createElement("div")).className = "tvl-pill-dot";
    part(doc, pill, "tvl-pill-label", view.label);
    node.appendChild(pill);
    node.hidden = false;
    return node;
  }

  return {
    OverlayQueue: OverlayQueue,
    describeCard: describeCard,
    describeActivity: describeActivity,
    describePill: describePill,
    renderCard: renderCard,
    renderActivity: renderActivity,
    DISPLAY_CHOICES: DISPLAY_CHOICES,
    DISPLAY_DEFAULT_MS: DISPLAY_DEFAULT_MS,
    DISPLAY_MAX_MS: DISPLAY_MAX_MS,
  };
})();
if (typeof module === "object" && module && module.exports) module.exports = TVLensOverlay;
