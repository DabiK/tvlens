function createStateRoutes({ runtime, build = null, nodeVersion }) {
  return [
    {
      method: "GET",
      path: "/v1/version",
      handler: ({ send }) => send(200, { build, node: nodeVersion }),
    },
    {
      method: "GET",
      path: "/v1/session",
      handler: ({ send }) => {
        const session = runtime.session;
        return send(200, session ? {
          id: session.id,
          accepting: session.watch.accepting,
          readOnly: session.watch.readOnly,
          storage: { state: runtime.storage().state },
        } : {});
      },
    },
    {
      method: "GET",
      path: "/v1/state",
      handler: ({ url, revalidated }) => {
        const view = url.searchParams.get("view") ?? undefined;
        return revalidated(runtime.etag(view), () => runtime.snapshot(view));
      },
    },
    {
      method: "POST",
      path: "/v1/settings/transcription",
      handler: async ({ body, send }) => send(200, await runtime.setTranscriptionLanguage(body.language)),
    },
  ];
}

module.exports = { createStateRoutes };
