(function (root) {
  "use strict";
  // Transport adapter only: no perception or conversational logic lives on the TV.
  function RemoteClient(config, fetcher) {
    this.url = config.url.replace(/\/$/, "");
    this.token = config.token;
    this.fetch = fetcher || root.fetch.bind(root);
    // Last body received per polled URL, with the entity tag the server gave it.
    this.held = {};
  }
  // A refusal keeps its HTTP status and the reason code of the server (read-only, capturing,
  // storage-full, not-found…): the panel words a 409 or a 507, it never guesses from the text.
  function refusal(response, value) {
    var error = new Error((value && value.error) || "Serveur indisponible");
    error.status = response.status;
    if (value && typeof value.code === "string") error.code = value.code;
    return error;
  }
  RemoteClient.prototype.send = async function (route, body, headers) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, 8000);
    try {
      return await this.fetch(this.url + route, {
        method: body === undefined ? "GET" : "POST",
        signal: controller.signal,
        headers: Object.assign(
          {
            Authorization: "Bearer " + this.token,
            "Content-Type": "application/json",
          },
          headers || {},
        ),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      // The engine words a network failure in English ("Failed to fetch"): the panel shows its own
      // sentence, and callers tell an unreachable host (no status) from a refusal (a status).
      var failure = new Error(
        error && error.name === "AbortError"
          ? "Pas de réponse dans le délai imparti."
          : "Connexion impossible.",
      );
      failure.network = true;
      throw failure;
    } finally {
      clearTimeout(timer);
    }
  };
  // An error body may be empty or not JSON (a proxy, an older controller): the status still decides.
  async function read(response) {
    var value;
    try {
      value = await response.json();
    } catch (_) {
      // Un corps vide ou non JSON ne remplace pas le refus HTTP ; pour un succès, l'absence de valeur devient « réponse illisible » ci-dessous.
    }
    if (!response.ok) throw refusal(response, value);
    if (value === undefined) throw new Error("Réponse du serveur illisible");
    return value;
  }
  RemoteClient.prototype.request = async function (route, body) {
    return read(await this.send(route, body));
  };
  // Revalidated read of a state resource. The URL never varies (the CORS preflight is cached per
  // URL); the tag of the held body goes back in If-None-Match, and a 304 keeps that body as it is.
  // The header is only ever sent after a server exposed a tag: an older server, whose preflight does
  // not allow it, never receives it.
  RemoteClient.prototype.poll = async function (route) {
    var held = this.held[route],
      response = await this.send(
        route,
        undefined,
        held ? { "If-None-Match": held.tag } : null,
      );
    if (response.status === 304 && held)
      return { value: held.value, notModified: true };
    var value = await read(response);
    var tag =
      response.headers && response.headers.get
        ? response.headers.get("ETag")
        : null;
    if (tag) this.held[route] = { tag: tag, value: value };
    else delete this.held[route];
    return { value: value, notModified: false };
  };
  // view: "chat" | "panel" (light views of a recent server) or nothing (complete state).
  RemoteClient.prototype.state = function (view) {
    return this.poll("/v1/state" + (view ? "?view=" + view : ""));
  };
  RemoteClient.prototype.ask = function (
    question,
    sessionId,
    anchorMs,
    moment,
  ) {
    return this.request("/v1/questions", {
      question: question,
      sessionId: sessionId,
      anchorMs: anchorMs,
      moment: moment,
    });
  };
  RemoteClient.prototype.cancel = function (id) {
    return this.request(
      "/v1/questions/" + encodeURIComponent(id) + "/cancel",
      {},
    );
  };
  RemoteClient.prototype.detail = function (sessionId, segmentIds) {
    return this.request("/v1/moments/detail", {
      sessionId: sessionId,
      firstId: segmentIds[0],
      lastId: segmentIds[segmentIds.length - 1],
    });
  };
  RemoteClient.prototype.thumbnail = async function (sessionId, id) {
    var response = await this.fetch(
      this.url +
        "/v1/thumbnail/" +
        encodeURIComponent(sessionId) +
        "/" +
        encodeURIComponent(id),
      {
        headers: { Authorization: "Bearer " + this.token },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw Error("Miniature indisponible");
    return URL.createObjectURL(await response.blob());
  };
  // Surveillance. History and detail are paged requests: the whole registry never travels to the TV.
  RemoteClient.prototype.startSurveillance = function (sessionId, instruction) {
    return this.request("/v1/surveillance/start", {
      sessionId: sessionId,
      instruction: instruction,
    });
  };
  RemoteClient.prototype.stopSurveillance = function (sessionId) {
    return this.request("/v1/surveillance/stop", { sessionId: sessionId });
  };
  RemoteClient.prototype.surveillanceHistory = function (
    sessionId,
    beforeSeq,
    limit,
  ) {
    var body = { sessionId: sessionId, limit: limit || 20 };
    if (beforeSeq) body.beforeSeq = beforeSeq;
    return this.request("/v1/surveillance/history", body);
  };
  RemoteClient.prototype.surveillanceDetail = function (sessionId, id) {
    return this.request("/v1/surveillance/detail", {
      sessionId: sessionId,
      id: id,
    });
  };
  // Sessions. Listing reads the disk on the server: on request only, never in a poll.
  RemoteClient.prototype.sessions = function () {
    return this.request("/v1/sessions");
  };
  RemoteClient.prototype.sessionAction = function (id, action) {
    return this.request(
      "/v1/sessions/" + encodeURIComponent(id) + "/" + action,
      {},
    );
  };
  RemoteClient.prototype.closeSession = function () {
    return this.request("/v1/sessions/close", {});
  };
  root.TVLensRemoteClient = RemoteClient;
  if (typeof module !== "undefined")
    module.exports = { RemoteClient: RemoteClient };
})(typeof window !== "undefined" ? window : globalThis);
