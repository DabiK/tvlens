const http = require("node:http");
const { createHash, timingSafeEqual } = require("node:crypto");
const { validateRemote } = require("../adapters/remote-media.cjs");
const { STORAGE_FULL } = require("../adapters/disk-guard.cjs");
class RemoteServer {
  constructor({ runtime, media, token }) {
    if (typeof token !== "string" || token.length < 32)
      throw Error("Device token required");
    Object.assign(this, { runtime, media, token });
    this.accepted = new Map();
    this.lastSequence = -1;
    this.epoch = runtime.captureEpoch;
    this.ingesting = false;
    this.server = http.createServer((req, res) => this.handle(req, res));
    this.server.requestTimeout = 20000;
    this.server.headersTimeout = 10000;
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
    const origin = req.headers.origin;
    if (origin === "null") {
      res.setHeader("Access-Control-Allow-Origin", "null");
      res.setHeader("Vary", "Origin");
      // The panel revalidates the state itself: it must be allowed to read the tag it sends back.
      res.setHeader("Access-Control-Expose-Headers", "ETag");
    }
    const send = (status, value, headers = {}) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...headers,
      });
      res.end(JSON.stringify(value));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, If-None-Match",
        // The panel polls every second with an Authorization header: let it reuse the preflight.
        "Access-Control-Max-Age": "600",
      });
      return res.end();
    }
    const supplied = Buffer.from(req.headers.authorization || ""),
      expected = Buffer.from("Bearer " + this.token);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return send(401, { error: "Appareil non authentifié." });
    // Reads are GET without a body, everything else is a JSON POST: the panel knows no other verb.
    if (req.method !== "GET" && req.method !== "POST")
      return send(
        405,
        { error: "Méthode non autorisée." },
        { Allow: "GET, POST, OPTIONS" },
      );
    try {
      // Routed on the path alone: a query string selects a view, it never hides a route.
      const url = new URL(req.url, "http://tvlens.local"),
        route = url.pathname,
        runtime = this.runtime;
      // A state the client already holds is answered without a body. The tag only moves with a
      // published change, so the poll URL never has to vary.
      const revalidated = (tag, build) => {
        const held = String(req.headers["if-none-match"] || "")
          .split(",")
          .map((value) => value.trim().replace(/^W\//, ""));
        if (!held.includes(tag)) return send(200, build(), { ETag: tag });
        res.writeHead(304, { ETag: tag, "Cache-Control": "no-store" });
        return res.end();
      };
      if (req.method === "GET") {
        if (route === "/v1/session") {
          const s = runtime.session;
          return send(
            200,
            s
              ? {
                  id: s.id,
                  accepting: s.watch.accepting,
                  readOnly: s.watch.readOnly,
                  storage: { state: runtime.storage().state },
                }
              : {},
          );
        }
        if (route === "/v1/state") {
          const view = url.searchParams.get("view") ?? undefined;
          return revalidated(runtime.etag(view), () => runtime.snapshot(view));
        }
        if (route === "/v1/surveillance/overlay")
          return revalidated(runtime.etag("overlay"), () => runtime.overlay());
        if (route === "/v1/surveillance")
          return send(200, runtime.surveillanceRegistry());
        if (route === "/v1/sessions") return send(200, await runtime.sessions());
        if (route === "/v1/storage")
          return send(200, await runtime.storageUsage());
        const thumb = route.match(
          /^\/v1\/thumbnail\/([a-zA-Z0-9-]+)\/(moment-\d+)$/,
        );
        if (thumb) {
          // The session in memory, live or opened as an archive, and no other.
          const session = runtime.session;
          if (!session || session.id !== thumb[1])
            return send(410, { error: "Session terminée." });
          try {
            const bytes = await session.thumbnails.read(thumb[2]);
            res.writeHead(200, {
              "Content-Type": "image/jpeg",
              "Cache-Control": "no-store",
            });
            return res.end(bytes);
          } catch {
            return send(410, { error: "Miniature indisponible." });
          }
        }
        const media = route.match(
          /^\/v1\/media\/(?:([a-zA-Z0-9-]+)\/)?(moment-\d+)$/,
        );
        if (media) {
          const session = runtime.session;
          if (media[1] && session?.id !== media[1])
            return send(410, { error: "Session terminée." });
          const passage = session?.watch.segments.find(
            (s) => s.id === media[2],
          );
          if (!passage?.available)
            return send(410, {
              error:
                passage?.mediaReason === "unreadable"
                  ? "Vidéo illisible : le fichier enregistré ne contient aucune image."
                  : ["missing", "not-kept"].includes(passage?.mediaReason)
                    ? "Média indisponible."
                    : "Média expiré.",
            });
          const response = await session.store.response(
            media[2],
            req.headers.range,
          );
          res.writeHead(response.status, Object.fromEntries(response.headers));
          return res.end(Buffer.from(await response.arrayBuffer()));
        }
        return send(404, { error: "Route inconnue." });
      }
      if (
        !String(req.headers["content-type"] || "").startsWith(
          "application/json",
        )
      )
        return send(415, { error: "JSON requis." });
      const limit = route === "/v1/segments" ? 13000000 : 12000;
      if (Number(req.headers["content-length"]) > limit)
        return send(413, { error: "Requête trop volumineuse." });
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) {
          send(413, { error: "Requête trop volumineuse." });
          return;
        }
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks);
      let body;
      try {
        body = JSON.parse(raw.toString());
      } catch {}
      // Every route reads fields of an object: anything else is refused here, in plain words.
      if (!body || typeof body !== "object" || Array.isArray(body))
        return send(400, { error: "JSON invalide." });
      if (route === "/v1/settings/transcription")
        return send(200, await runtime.setTranscriptionLanguage(body.language));
      if (route === "/v1/session/start")
        return send(200, await runtime.start());
      if (route === "/v1/session/pause") {
        await runtime.pause();
        return send(200, { paused: true });
      }
      // Ending archives; "close" is the name the session list uses for the same thing.
      if (route === "/v1/session/end")
        return send(200, { ended: true, ...(await runtime.end()) });
      if (route === "/v1/sessions/close")
        return send(200, { closed: true, ...(await runtime.end()) });
      const stored = route.match(
        /^\/v1\/sessions\/([^/]+)\/(open|resume|delete)$/,
      );
      if (stored) {
        // Taken as sent, never decoded: the library accepts a bare session identifier and nothing
        // else before any path is built from it.
        const id = stored[1];
        if (stored[2] === "open") return send(200, await runtime.open(id));
        if (stored[2] === "resume") return send(200, await runtime.resume(id));
        return send(200, await runtime.remove(id));
      }
      if (route === "/v1/moments/detail")
        return send(200, runtime.detail(body));
      if (route === "/v1/questions") return send(200, runtime.ask(body));
      const cancel = route.match(/^\/v1\/questions\/(deep-\d+)\/cancel$/);
      if (cancel) return send(200, runtime.cancel(cancel[1]));
      if (route === "/v1/surveillance/start")
        return send(200, runtime.startSurveillance(body));
      if (route === "/v1/surveillance/stop")
        return send(200, runtime.stopSurveillance(body));
      if (route === "/v1/surveillance/retry")
        return send(200, runtime.retrySurveillance(body));
      if (route === "/v1/surveillance/history")
        return send(200, runtime.surveillanceHistory(body));
      if (route === "/v1/surveillance/detail")
        return send(200, runtime.surveillanceDetail(body));
      if (route === "/v1/segments") {
        validateRemote(body);
        // Refused before the block is assembled: stale session, archive opened read-only, capture
        // stopped (and why, when the disk is the reason).
        const session = runtime.admit(body.sessionId);
        if (body.endMs > session.watch.now() + 3000)
          throw Error("Horodatage futur.");
        // Another session, or the same one resumed or started again (a TV that restarted its capture
        // sends no pause): its capture numbers its blocks from another origin. A block of the former
        // capture replayed after that is refused by the session itself, on observation order.
        if (this.epoch !== runtime.captureEpoch) {
          this.accepted.clear();
          this.lastSequence = -1;
          this.epoch = runtime.captureEpoch;
        }
        const key = body.sessionId + ":" + body.sequence,
          hash = createHash("sha256").update(raw).digest("hex");
        const prior = this.accepted.get(key);
        if (prior)
          return send(
            prior.hash === hash ? 200 : 409,
            prior.hash === hash
              ? { id: prior.id, duplicate: true }
              : { error: "Séquence déjà utilisée avec un autre contenu." },
          );
        if (body.sequence <= this.lastSequence)
          return send(409, { error: "Séquence ancienne." });
        if (this.ingesting)
          return send(429, { error: "Préparation du passage précédent." });
        this.ingesting = true;
        const epoch = this.epoch;
        try {
          const input = await this.media.assemble(body);
          const id = await runtime.ingest(input);
          // The session changed while this block was being prepared: its number says nothing any more.
          if (epoch === runtime.captureEpoch) {
            this.accepted.set(key, { id, hash });
            this.lastSequence = body.sequence;
            if (this.accepted.size > 100)
              this.accepted.delete(this.accepted.keys().next().value);
          }
          return send(200, { id, duplicate: false });
        } finally {
          this.ingesting = false;
        }
      }
      send(404, { error: "Route inconnue." });
    } catch (error) {
      if (res.headersSent) return res.end();
      // Nothing was stored and nothing was deleted: the capture learns why it was refused.
      if (error?.code === STORAGE_FULL)
        return send(507, { error: error.message, code: "storage-full" });
      const status =
        Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
          ? error.status
          : 400;
      send(status, {
        error: error.message,
        ...(typeof error?.code === "string" && status !== 400
          ? { code: error.code }
          : {}),
      });
    }
  }
  async close() {
    this.server.closeAllConnections();
    await new Promise((resolve) => this.server.close(resolve));
  }
}
module.exports = { RemoteServer };
