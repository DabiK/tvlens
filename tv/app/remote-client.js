(function (root) {
  "use strict";
  // Transport adapter only: no perception or conversational logic lives on the TV.
  function RemoteClient(config, fetcher) {
    this.url = config.url.replace(/\/$/, "");
    this.token = config.token;
    this.fetch = fetcher || root.fetch.bind(root);
  }
  RemoteClient.prototype.request = async function (route, body) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, 8000);
    try {
      var response = await this.fetch(this.url + route, {
        method: body === undefined ? "GET" : "POST",
        signal: controller.signal,
        headers: {
          Authorization: "Bearer " + this.token,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      var value = await response.json();
      if (!response.ok) throw new Error(value.error || "Serveur indisponible");
      return value;
    } finally {
      clearTimeout(timer);
    }
  };
  RemoteClient.prototype.state = function () {
    return this.request("/v1/state");
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
  root.TVLensRemoteClient = RemoteClient;
  if (typeof module !== "undefined")
    module.exports = { RemoteClient: RemoteClient };
})(typeof window !== "undefined" ? window : globalThis);
