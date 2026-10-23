async function serveThumbnail(runtime, { params, res, send }) {
  const [sessionId, momentId] = params;
  // Seule la session chargée, en capture ou ouverte en archive, peut servir ses miniatures.
  const session = runtime.session;
  if (!session || session.id !== sessionId)
    return send(410, { error: "Session terminée.", code: "session-ended" });
  try {
    const bytes = await session.thumbnails.read(momentId);
    res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" });
    return res.end(bytes);
  } catch {
    return send(410, { error: "Miniature indisponible.", code: "thumbnail-unavailable" });
  }
}

function unavailableMedia(reason) {
  if (reason === "unreadable")
    return { error: "Vidéo illisible : le fichier enregistré ne contient aucune image.", code: "media-unreadable" };
  if (["missing", "not-kept"].includes(reason))
    return { error: "Média indisponible.", code: "media-missing" };
  return { error: "Média expiré.", code: "media-expired" };
}

async function serveMedia(runtime, { req, res, send }, sessionId, momentId) {
  const session = runtime.session;
  if (sessionId && session?.id !== sessionId)
    return send(410, { error: "Session terminée.", code: "session-ended" });
  const passage = session?.watch.segments.find((segment) => segment.id === momentId);
  if (!passage?.available)
    return send(410, unavailableMedia(passage?.mediaReason));
  const response = await session.store.response(momentId, req.headers.range);
  if (response.status === 416) res.setHeader("X-TVLens-Error-Code", "invalid-range");
  if (response.status === 404) res.setHeader("X-TVLens-Error-Code", "media-missing");
  res.writeHead(response.status, Object.fromEntries(response.headers));
  return res.end(Buffer.from(await response.arrayBuffer()));
}

function createSessionRoutes({ runtime }) {
  return [
    { method: "GET", path: "/v1/sessions", handler: async ({ send }) => send(200, await runtime.sessions()) },
    { method: "GET", path: "/v1/storage", handler: async ({ send }) => send(200, await runtime.storageUsage()) },
    {
      method: "GET",
      pattern: /^\/v1\/thumbnail\/([a-zA-Z0-9-]+)\/(moment-\d+)$/,
      handler: (context) => serveThumbnail(runtime, context),
    },
    {
      method: "GET",
      pattern: /^\/v1\/media\/([a-zA-Z0-9-]+)\/(moment-\d+)$/,
      handler: (context) => serveMedia(runtime, context, context.params[0], context.params[1]),
    },
    {
      method: "GET",
      pattern: /^\/v1\/media\/(moment-\d+)$/,
      handler: (context) => serveMedia(runtime, context, undefined, context.params[0]),
    },
    // Un client qui connaît ce qui est regardé peut le nommer dans le corps, à chaque démarrage ou reprise ; un corps vide
    // démarre comme avant et laisse le titre tel quel.
    { method: "POST", path: "/v1/session/start", handler: async ({ body, send }) => send(200, await runtime.start(body)) },
    {
      method: "POST", path: "/v1/session/pause",
      handler: async ({ send }) => {
        await runtime.pause();
        return send(200, { paused: true });
      },
    },
    // La bibliothèque emploie « close » pour la même fin qui archive la session.
    { method: "POST", path: "/v1/session/end", handler: async ({ send }) => send(200, { ended: true, ...(await runtime.end()) }) },
    { method: "POST", path: "/v1/sessions/close", handler: async ({ send }) => send(200, { closed: true, ...(await runtime.end()) }) },
    // Les identifiants restent tels qu'envoyés ; la bibliothèque les valide avant de construire un chemin.
    {
      method: "POST", pattern: /^\/v1\/sessions\/([^/]+)\/open$/,
      handler: async ({ params, send }) => send(200, await runtime.open(params[0])),
    },
    {
      method: "POST", pattern: /^\/v1\/sessions\/([^/]+)\/resume$/,
      handler: async ({ params, send }) => send(200, await runtime.resume(params[0])),
    },
    {
      method: "POST", pattern: /^\/v1\/sessions\/([^/]+)\/delete$/,
      handler: async ({ params, send }) => send(200, await runtime.remove(params[0])),
    },
  ];
}

module.exports = { createSessionRoutes };
