const {
  TVLENS_QUESTION_INVALID,
  TVLENS_QUESTION_QUEUE_FULL,
  TVLENS_QUESTION_ACTION_INVALID,
  TVLENS_QUESTION_INTERVAL_INVALID,
} = require("../core/deep-ask.cjs");
const {
  TVLENS_CAPTURE_TIME_INVALID,
  TVLENS_CAPTURE_ORDER_INVALID,
  TVLENS_SESSION_STOPPED,
} = require("../core/session.cjs");
const {
  TVLENS_MOMENT_SELECTION_INVALID,
  TVLENS_MOMENT_MISSING,
  TVLENS_MOMENT_INTERVAL_DISCONTINUOUS,
} = require("../core/session-timeline.cjs");
const {
  TVLENS_TRANSCRIPTION_LANGUAGE_INVALID,
} = require("../core/transcription-language.cjs");
const {
  TVLENS_SURVEILLANCE_SESSION_REQUIRED,
  TVLENS_SURVEILLANCE_INSTRUCTION_INVALID,
  TVLENS_SURVEILLANCE_RETRY_INVALID,
} = require("../core/surveillance.cjs");
const {
  TVLENS_SESSION_ID_INVALID,
  TVLENS_SESSION_NOT_FOUND,
  TVLENS_ARCHIVE_INVALID,
} = require("../adapters/session-library.cjs");
const {
  TVLENS_MEDIA_BLOCK_INVALID,
  TVLENS_MEDIA_IMAGE_UNREADABLE,
  TVLENS_MEDIA_TOOL_REFUSED,
} = require("../adapters/remote-media.cjs");
const http = require("node:http");
const { timingSafeEqual } = require("node:crypto");
const { STORAGE_FULL } = require("../adapters/disk-guard.cjs");
const {
  TVLENS_CODEX_DISCONNECTED, TVLENS_CODEX_REQUEST_TIMEOUT, TVLENS_CODEX_REQUEST_CUT,
} = require("../adapters/codex-rpc.cjs");
const { TVLENS_CODEX_CONNECTION_LOST } = require("../adapters/codex-session-events.cjs");
const { TVLENS_CODEX_INPUT_REFUSED } = require("../adapters/codex-session-run.cjs");
const {
  TVLENS_CODEX_SESSION_CLOSED, TVLENS_CODEX_CONFINEMENT_REFUSED, TVLENS_CODEX_TOOL_REFUSED,
} = require("../adapters/codex-session-client.cjs");
const { TVLENS_CODEX_ROLE_REFUSED } = require("../adapters/codex-confinement.cjs");
const {
  TVLENS_LOCAL_VLM_INPUT_REFUSED, TVLENS_LOCAL_VLM_UNREACHABLE, TVLENS_LOCAL_VLM_UNAVAILABLE, TVLENS_LOCAL_VLM_CLOSED,
} = require("../adapters/local-vlm-agent.cjs");
const { createRoutes, dispatchRoute } = require("./routes.cjs");
const { SEGMENTS_PATH } = require("./ingest-routes.cjs");
const JSON_BODY_LIMIT = 12000;
const SEGMENT_BODY_LIMIT = 13000000;
const REQUEST_TIMEOUT_MS = 20000;
const HEADERS_TIMEOUT_MS = 10000;
// Seules les identités des émetteurs connus désignent un refus métier ; un errno ne le prouve pas.
const PUBLIC_CODES = new Map([
  [TVLENS_QUESTION_INVALID, "invalid-question"],
  [TVLENS_QUESTION_QUEUE_FULL, "question-queue-full"],
  [TVLENS_QUESTION_ACTION_INVALID, "invalid-question-action"],
  [TVLENS_QUESTION_INTERVAL_INVALID, "invalid-question-interval"],
  [TVLENS_CAPTURE_TIME_INVALID, "invalid-capture-time"],
  [TVLENS_CAPTURE_ORDER_INVALID, "invalid-capture-order"],
  [TVLENS_SESSION_STOPPED, "session-stopped"],
  [TVLENS_MOMENT_SELECTION_INVALID, "invalid-moment-selection"],
  [TVLENS_MOMENT_MISSING, "moment-missing"],
  [TVLENS_MOMENT_INTERVAL_DISCONTINUOUS, "discontinuous-moment-interval"],
  [TVLENS_TRANSCRIPTION_LANGUAGE_INVALID, "invalid-transcription-language"],
  [TVLENS_SURVEILLANCE_SESSION_REQUIRED, "surveillance-session-required"],
  [TVLENS_SURVEILLANCE_INSTRUCTION_INVALID, "invalid-surveillance-instruction"],
  [TVLENS_SURVEILLANCE_RETRY_INVALID, "invalid-surveillance-retry"],
  [TVLENS_SESSION_ID_INVALID, "invalid-session-id"],
  [TVLENS_SESSION_NOT_FOUND, "not-found"],
  [TVLENS_ARCHIVE_INVALID, "invalid-archive"],
  [TVLENS_MEDIA_BLOCK_INVALID, "invalid-media-block"],
  [TVLENS_MEDIA_IMAGE_UNREADABLE, "image-unreadable"],
  [TVLENS_MEDIA_TOOL_REFUSED, "media-tool-refused"],
]);
const APPLICATION_CODES = new Set([
  "invalid-capture-time", "media-unavailable", "read-only", "session-closing",
  "capture-changed", "capturing", "not-open", "not-found", "session-stopped",
  "unknown-view", "stale-session", "invalid-anchor", "invalid-captured-segment", "invalid-archive",
  "invalid-history-cursor", "invalid-history-limit", "invalid-surveillance-id",
  "language-setting-busy", "surveillance-session-required",
  TVLENS_CODEX_DISCONNECTED, TVLENS_CODEX_REQUEST_TIMEOUT, TVLENS_CODEX_REQUEST_CUT,
  TVLENS_CODEX_CONNECTION_LOST, TVLENS_CODEX_INPUT_REFUSED, TVLENS_CODEX_SESSION_CLOSED,
  TVLENS_CODEX_CONFINEMENT_REFUSED, TVLENS_CODEX_TOOL_REFUSED, TVLENS_CODEX_ROLE_REFUSED,
  TVLENS_LOCAL_VLM_INPUT_REFUSED, TVLENS_LOCAL_VLM_UNREACHABLE, TVLENS_LOCAL_VLM_UNAVAILABLE, TVLENS_LOCAL_VLM_CLOSED,
]);

function setCors(req, res) {
  if (req.headers.origin !== "null") return;
  res.setHeader("Access-Control-Allow-Origin", "null");
  res.setHeader("Vary", "Origin");
  // Le panneau doit pouvoir relire le tag de revalidation et le refus d'un corps média.
  res.setHeader("Access-Control-Expose-Headers", "ETag, X-TVLens-Error-Code");
}

function sendJSON(res, status, value, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(value));
}

function preflight(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, If-None-Match",
    // Le panneau interroge chaque seconde avec Authorization ; il réutilise ce prévol.
    "Access-Control-Max-Age": "600",
  });
  return res.end();
}

function authenticated(req, token) {
  const supplied = Buffer.from(req.headers.authorization || "");
  const expected = Buffer.from("Bearer " + token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function revalidate(req, res, send, tag, build) {
  // Le tag ne change qu'avec une publication : le panneau n'a donc jamais besoin de faire varier l'URL interrogée.
  const held = String(req.headers["if-none-match"] || "")
    .split(",")
    .map((value) => value.trim().replace(/^W\//, ""));
  if (!held.includes(tag)) return send(200, build(), { ETag: tag });
  res.writeHead(304, { ETag: tag, "Cache-Control": "no-store" });
  return res.end();
}

async function readJSON(req, path, send) {
  if (!String(req.headers["content-type"] || "").startsWith("application/json")) {
    send(415, { error: "JSON requis.", code: "json-required" });
    return null;
  }
  const limit = path === SEGMENTS_PATH ? SEGMENT_BODY_LIMIT : JSON_BODY_LIMIT;
  if (Number(req.headers["content-length"]) > limit) {
    send(413, { error: "Requête trop volumineuse.", code: "request-too-large" });
    return null;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      send(413, { error: "Requête trop volumineuse.", code: "request-too-large" });
      return null;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  let body;
  try {
    body = JSON.parse(raw.toString());
  } catch {
    // Le même refus d'objet ci-dessous couvre aussi une syntaxe JSON invalide.
  }
  // Chaque route lit les champs d'un objet : toute autre valeur est refusée ici, avec un message lisible.
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    send(400, { error: "JSON invalide.", code: "invalid-json" });
    return null;
  }
  return { raw, body };
}

function publicCode(code) {
  return PUBLIC_CODES.get(code) ?? (APPLICATION_CODES.has(code) ? code : undefined);
}

function validErrorStatus(status) {
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : undefined;
}

function sendError(error, res, send, reportError) {
  const storageFull = error?.code === STORAGE_FULL;
  const code = publicCode(error?.code);
  const status = validErrorStatus(error?.status);
  const unexpected = !storageFull && !status && !code;
  if (unexpected) {
    try {
      reportError();
    } catch {
      // Un journal indisponible ne doit pas empêcher la réponse publique.
    }
  }
  if (res.headersSent) return res.end();
  // Rien n'a été stocké ni supprimé : la capture apprend pourquoi son bloc est refusé.
  if (storageFull)
    return send(507, { error: error.message, code: "storage-full" });
  if (unexpected)
    return send(500, { error: "Erreur interne du serveur.", code: "internal-error" });
  return send(status ?? 400, {
    error: error.message,
    code: code ?? "unclassified-error",
  });
}

class RemoteServer {
  constructor({ runtime, media, token, logError = () => {} }) {
    if (typeof token !== "string" || token.length < 32)
      throw Error("Device token required");
    Object.assign(this, { runtime, media, token, logError });
    this.accepted = new Map();
    this.lastSequence = -1;
    this.epoch = runtime.captureEpoch;
    this.ingesting = false;
    this.routes = createRoutes({ runtime, media, transport: this });
    this.server = http.createServer((req, res) => this.handle(req, res));
    this.server.requestTimeout = REQUEST_TIMEOUT_MS;
    this.server.headersTimeout = HEADERS_TIMEOUT_MS;
  }
  async listen(port = 8787, host = "127.0.0.1") {
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, host, resolve);
    });
    this.url = `http://${host}:${this.server.address().port}`;
    return this;
  }
  async handle(req, res) {
    setCors(req, res);
    const send = (status, value, headers) => sendJSON(res, status, value, headers);
    if (req.method === "OPTIONS") return preflight(res);
    if (!authenticated(req, this.token))
      return send(401, { error: "Appareil non authentifié.", code: "unauthenticated" });
    // Les lectures sont des GET sans corps ; le reste est un POST JSON : le panneau ne connaît aucun autre verbe.
    if (req.method !== "GET" && req.method !== "POST")
      return send(405, { error: "Méthode non autorisée.", code: "method-not-allowed" }, { Allow: "GET, POST, OPTIONS" });
    let pathname;
    try {
      // La query sélectionne une vue, jamais une autre route. Même une route inconnue valide son corps avant le 404.
      const url = new URL(req.url, "http://tvlens.local");
      pathname = url.pathname;
      const payload = req.method === "POST" ? await readJSON(req, url.pathname, send) : {};
      if (!payload) return;
      const handled = await dispatchRoute(this.routes, {
        req, res, url, ...payload, send,
        revalidated: (tag, build) => revalidate(req, res, send, tag, build),
      });
      if (!handled) send(404, { error: "Route inconnue.", code: "route-not-found" });
    } catch (error) {
      sendError(error, res, send, () => this.logError({ method: req.method, pathname, error, cause: error?.cause }));
    }
  }
  async close() {
    this.server.closeAllConnections();
    await new Promise((resolve) => this.server.close(resolve));
  }
}
module.exports = { RemoteServer };
