function createQuestionRoutes({ runtime }) {
  return [
    { method: "POST", path: "/v1/moments/detail", handler: ({ body, send }) => send(200, runtime.detail(body)) },
    { method: "POST", path: "/v1/questions", handler: ({ body, send }) => send(200, runtime.ask(body)) },
    {
      method: "POST",
      pattern: /^\/v1\/questions\/(deep-\d+)\/cancel$/,
      handler: ({ params, send }) => send(200, runtime.cancel(params[0])),
    },
  ];
}

module.exports = { createQuestionRoutes };
