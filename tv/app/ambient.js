// Ambient page: the card drawn over the video while the panel is closed. It holds no secret and reaches
// nothing but the local controller named by its launch parameters (loopback only). The native supervisor
// decides everything: this page draws what it was launched with, and only once that supervisor has granted
// it, because the grant is what closes the capture gate first. Two tripwires never depend on the native
// side: any key received closes the page after telling the controller, and the page closes by itself at a
// bounded deadline. An overlay window holds the key focus, so a page that lingers is a dead remote: where
// close() is slow or has no effect, leaving disarms neither tripwire, and every key, every relaunch and the
// deadline ask the page to go again, a bounded number of times each.
(function (root) {
  "use strict";
  var overlay = root.TVLensOverlay,
    doc = root.document,
    node = doc.getElementById("ambient"),
    GRANT_MS = 1500,
    KEY_REPORT_MS = 150,
    LIFE_PAD_MS = 1500,
    LIFE_MAX_MS = 21500,
    WAIT_SPACING_MS = 250,
    CLOSE_RETRY_MS = 500,
    CLOSE_RETRIES = 3,
    HINT = "Rakuten · détails",
    params = null,
    run = 0,
    closing = false,
    keyed = false,
    closer = null,
    timers = [];

  function later(task, ms) {
    var id = root.setTimeout(task, ms);
    timers.push(id);
    return id;
  }
  function disarm() {
    while (timers.length) root.clearTimeout(timers.pop());
  }
  function unpaint() {
    overlay.renderCard(node, null);
  }
  // close() asked now and a few more times at a short interval, then no more until something asks again:
  // one bounded chain at a time, never a loop.
  function depart(left) {
    root.clearTimeout(closer);
    try {
      root.close();
    } catch (_) {}
    if (left > 0)
      closer = root.setTimeout(function () {
        depart(left - 1);
      }, CLOSE_RETRY_MS);
  }
  // The single way out, and it may be taken again. The box is emptied first: nothing stays on screen where
  // close() is slow or refused. The timers of the card are left armed on purpose: its deadline still fires
  // on a page that is still here, and asks it to go once more.
  function shut() {
    closing = true;
    run++;
    try {
      unpaint();
    } finally {
      depart(CLOSE_RETRIES);
    }
  }
  function route(name) {
    return params.control + "/ambient/" + name + "/" + params.nonce;
  }
  // Pointer and focus hints for the compositor. Their effect on this TV is unproven; harmless where ignored.
  function quiet(profile) {
    var system = root.PalmSystem || root.webOSSystem;
    try {
      if (system && typeof system.setInputRegion === "function") system.setInputRegion([]);
    } catch (_) {}
    try {
      if (profile === "passthrough" && system && system.window && typeof system.window.setFocus === "function") system.window.setFocus(false);
    } catch (_) {}
  }
  // Long poll held by the controller: when the supervisor closes, the page leaves. Anything but an explicit
  // "stay" closes, a controller that died included: nobody would be left to say when to go.
  function wait(mine) {
    var asked = Date.now();
    root
      .fetch(route("wait"))
      .then(function (response) {
        return response.status === 200 ? response.json() : null;
      })
      .then(
        function (body) {
          if (mine !== run) return;
          if (!body || body.close !== false) return shut();
          later(function () {
            if (mine === run) wait(mine);
          }, Math.max(0, WAIT_SPACING_MS - (Date.now() - asked)));
        },
        function () {
          if (mine === run) shut();
        },
      );
  }
  function paint(mine) {
    if (params.element === "pill") overlay.renderActivity(node, overlay.describePill(params.activity));
    else overlay.renderCard(node, overlay.describeCard(params.card, { hint: params.element === "card" ? HINT : "" }));
    if (node.hidden) return shut();
    later(shut, Math.min(params.displayMs + LIFE_PAD_MS, LIFE_MAX_MS));
    wait(mine);
  }
  // Asks the supervisor for the right to paint. Until a 200 comes back the box stays empty; a refusal, an
  // error or silence closes the page with nothing drawn.
  function begin(parsed) {
    var mine = ++run,
      abort = new AbortController(),
      deadline;
    params = parsed;
    disarm();
    unpaint();
    node.style.left = parsed.box.x + "px";
    node.style.top = parsed.box.y + "px";
    node.style.width = parsed.box.width + "px";
    node.style.height = parsed.box.height + "px";
    quiet(parsed.profile);
    deadline = later(function () {
      abort.abort();
      if (mine === run) shut();
    }, GRANT_MS);
    try {
      root.fetch(route("ack"), { method: "POST", signal: abort.signal }).then(
        function (response) {
          if (mine !== run) return;
          root.clearTimeout(deadline);
          if (response.status !== 200) return shut();
          paint(mine);
        },
        function () {
          if (mine === run) shut();
        },
      );
    } catch (_) {
      shut();
    }
  }
  function empty(raw) {
    if (raw === undefined || raw === null) return true;
    if (typeof raw === "string") return !raw.trim() || raw.trim() === "{}";
    return typeof raw === "object" && !Array.isArray(raw) && !Object.keys(raw).length;
  }
  function given() {
    var system = root.PalmSystem || root.webOSSystem;
    return !empty(root.launchParams) ? root.launchParams : system ? system.launchParams : undefined;
  }
  function launch(raw) {
    var parsed;
    // A page that is leaving, or that took a key, never paints again: launched once more, it is only asked
    // to go once more. The supervisor sees no paint request and closes the window by its identifier.
    if (closing || keyed) return shut();
    if (empty(raw)) raw = given();
    parsed = overlay.parseAmbientParams(raw);
    // webOSLaunch repeats what was already read at load: one grant request per nonce.
    if (parsed && params && parsed.nonce === params.nonce) return;
    if (!parsed) return shut();
    begin(parsed);
  }
  // A key that lands here is a key the video application did not get. The box is emptied at once, the
  // controller is told (the supervisor then turns the display off), and the page leaves without waiting
  // more than a moment for that report.
  function onKey() {
    var left = false;
    function leave() {
      if (left) return;
      left = true;
      shut();
    }
    // Still here after it was told to go: this window holds the focus of the remote. Asked to go again at
    // once; and a key that lands while leaving is reported like any other, once.
    if (closing || keyed) shut();
    if (keyed) return;
    keyed = true;
    run++;
    try {
      unpaint();
    } catch (_) {}
    if (!params) return shut();
    root.setTimeout(leave, KEY_REPORT_MS);
    try {
      root.fetch(route("key"), { method: "POST", keepalive: true }).then(leave, leave);
    } catch (_) {
      leave();
    }
  }

  doc.addEventListener("keydown", onKey, true);
  doc.addEventListener("keyup", onKey, true);
  doc.addEventListener("visibilitychange", function () {
    if (doc.hidden) shut();
  });
  doc.addEventListener("webOSLaunch", function (event) {
    launch(event && event.detail);
  }, true);
  doc.addEventListener("webOSRelaunch", function (event) {
    launch(event && event.detail);
  }, true);
  // Whether this TV hands the parameters over at load or only with webOSLaunch is not established: without
  // them the page waits, bounded, with nothing painted.
  if (empty(given())) later(shut, GRANT_MS);
  else launch(given());
})(window);
