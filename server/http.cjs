const http = require("node:http");
const { timingSafeEqual } = require("node:crypto");
const { STORAGE_FULL } = require("../adapters/disk-guard.cjs");
const { createRoutes, dispatchRoute } = require("./routes.cjs");
const { SEGMENTS_PATH } = require("./ingest-routes.cjs");
const JSON_BODY_LIMIT = 12000;
const SEGMENT_BODY_LIMIT = 13000000;
const REQUEST_TIMEOUT_MS = 20000;
const HEADERS_TIMEOUT_MS = 10000;

function setCors(req, res) {
  if (req.headers.origin !== "null") return;
  res.setHeader("Access-Control-Allow-Origin", "null");
  res.setHeader("Vary", "Origin");
  // Le panneau doit pouvoir relire le tag qu'il présente à la revalidation suivante.
  res.setHeader("Access-Control-Expose-Headers", "ETag");
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
    send(415, { error: "JSON requis." });
    return null;
  }
  const limit = path === SEGMENTS_PATH ? SEGMENT_BODY_LIMIT : JSON_BODY_LIMIT;
  if (Number(req.headers["content-length"]) > limit) {
    send(413, { error: "Requête trop volumineuse." });
    return null;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      send(413, { error: "Requête trop volumineuse." });
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
    send(400, { error: "JSON invalide." });
    return null;
  }
  return { raw, body };
}

function sendError(error, res, send) {
  if (res.headersSent) return res.end();
  // Rien n'a été stocké ni supprimé : la capture apprend pourquoi son bloc est refusé.
  if (error?.code === STORAGE_FULL)
    return send(507, { error: error.message, code: "storage-full" });
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 400;
  return send(status, {
    error: error.message,
    ...(typeof error?.code === "string" && status !== 400 ? { code: error.code } : {}),
  });
}

class RemoteServer {
  constructor({ runtime, media, token }) {
    if (typeof token !== "string" || token.length < 32)
      throw Error("Device token required");
    Object.assign(this, { runtime, media, token });
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
      return send(401, { error: "Appareil non authentifié." });
    // Les lectures sont des GET sans corps ; le reste est un POST JSON : le panneau ne connaît aucun autre verbe.
    if (req.method !== "GET" && req.method !== "POST")
      return send(405, { error: "Méthode non autorisée." }, { Allow: "GET, POST, OPTIONS" });
    try {
      // La query sélectionne une vue, jamais une autre route. Même une route inconnue valide son corps avant le 404.
      const url = new URL(req.url, "http://tvlens.local");
      const payload = req.method === "POST" ? await readJSON(req, url.pathname, send) : {};
      if (!payload) return;
      const handled = await dispatchRoute(this.routes, {
        req, res, url, ...payload, send,
        revalidated: (tag, build) => revalidate(req, res, send, tag, build),
      });
      if (!handled) send(404, { error: "Route inconnue." });
    } catch (error) {
      sendError(error, res, send);
    }
  }
  async close() {
    this.server.closeAllConnections();
    await new Promise((resolve) => this.server.close(resolve));
  }
}
module.exports = { RemoteServer };
