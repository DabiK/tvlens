(function (root) {
  "use strict";
  var model = typeof module === "object" && module && module.exports ? module.require("./chat-model.js") : root.TVLensChatModel;
  var PollPlan = model.PollPlan;

  function createPollController(options) {
    var plan = new PollPlan(options),
      started = false,
      stopped = false,
      polling = false,
      requested = false,
      timer = null,
      stats = { polls: 0, notModified: 0, renders: 0, legacy: false, failures: 0 };

    // Une seule lecture en vol évite les requêtes concurrentes ; une accélération annule l'attente
    // ou regroupe les demandes reçues en vol en une seule lecture supplémentaire immédiate.
    async function poll() {
      if (!started || stopped) return;
      if (polling) {
        requested = true;
        return;
      }
      options.clearTimer(timer);
      timer = null;
      polling = true;
      requested = false;
      // Le client n'expose pas d'annulation : après stop(), les gardes ignorent la suite d'une lecture tardive.
      try {
        var read = await plan.read(options.client, options.getState(), options.now);
        if (stopped) return;
        stats.polls++;
        if (read.answer.notModified) {
          stats.notModified++;
          options.onNotModified();
        } else options.onReceive(read.answer.value, read.view);
      } catch (error) {
        if (stopped) return;
        options.onError(error);
      }
      if (stopped) return;
      stats.legacy = plan.legacy;
      stats.failures = plan.failures;
      polling = false;
      timer = options.setTimer(poll, requested ? 0 : plan.delay(options.getState(), options.now()));
    }
    function start() {
      if (started || stopped) return;
      started = true;
      poll();
    }
    function stop() {
      stopped = true;
      requested = false;
      options.clearTimer(timer);
      timer = null;
    }
    return { start: start, request: poll, stop: stop, stats: stats };
  }
  var api = { createPollController: createPollController };
  root.TVLensPollController = api;
  if (typeof module === "object" && module && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
