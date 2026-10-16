function createSurveillanceRoutes({ runtime }) {
  return [
    {
      method: "GET",
      path: "/v1/surveillance/overlay",
      handler: ({ revalidated }) => revalidated(runtime.etag("overlay"), () => runtime.overlay()),
    },
    { method: "GET", path: "/v1/surveillance", handler: ({ send }) => send(200, runtime.surveillanceRegistry()) },
    { method: "POST", path: "/v1/surveillance/start", handler: ({ body, send }) => send(200, runtime.startSurveillance(body)) },
    { method: "POST", path: "/v1/surveillance/stop", handler: ({ body, send }) => send(200, runtime.stopSurveillance(body)) },
    { method: "POST", path: "/v1/surveillance/retry", handler: ({ body, send }) => send(200, runtime.retrySurveillance(body)) },
    { method: "POST", path: "/v1/surveillance/history", handler: ({ body, send }) => send(200, runtime.surveillanceHistory(body)) },
    { method: "POST", path: "/v1/surveillance/detail", handler: ({ body, send }) => send(200, runtime.surveillanceDetail(body)) },
  ];
}

module.exports = { createSurveillanceRoutes };
