const http = require("node:http");
const { createHash, timingSafeEqual } = require("node:crypto");
const { validateRemote } = require("../adapters/remote-media.cjs");
class RemoteServer {
  constructor({ runtime, media, token }) {
    if (typeof token !== "string" || token.length < 32)
      throw Error("Device token required");
    Object.assign(this, { runtime, media, token });
    this.accepted = new Map();
    this.lastSequence = -1;
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
    }
    const send = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
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
    try {
      if (req.method === "GET" && req.url === "/v1/session") {
        const s = this.runtime.session;
        return send(200, s ? { id: s.id, accepting: s.watch.accepting } : {});
      }
      if (req.method === "GET" && req.url === "/v1/state")
        return send(200, this.runtime.snapshot());
      const thumb = req.url.match(
        /^\/v1\/thumbnail\/([a-zA-Z0-9-]+)\/(moment-\d+)$/,
      );
      if (req.method === "GET" && thumb) {
        const session = this.runtime.session;
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
      const match = req.url.match(/^\/v1\/media\/(moment-\d+)$/);
      if (req.method === "GET" && match) {
        const session = this.runtime.session;
        if (
          !session?.watch.segments.some((s) => s.id === match[1] && s.available)
        )
          return send(410, { error: "Média expiré." });
        const response = await session.store.response(
          match[1],
          req.headers.range,
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        return res.end(Buffer.from(await response.arrayBuffer()));
      }
      if (req.method !== "POST") return send(404, { error: "Route inconnue." });
      if (
        !String(req.headers["content-type"] || "").startsWith(
          "application/json",
        )
      )
        return send(415, { error: "JSON requis." });
      const limit = req.url === "/v1/segments" ? 13000000 : 12000;
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
      const raw = Buffer.concat(chunks),
        body = JSON.parse(raw.toString());
      if (req.url === "/v1/session/start")
        return send(200, await this.runtime.start());
      if (req.url === "/v1/session/pause") {
        await this.runtime.pause();
        return send(200, { paused: true });
      }
      if (req.url === "/v1/session/end") {
        await this.runtime.end();
        this.accepted.clear();
        this.lastSequence = -1;
        return send(200, { ended: true });
      }
      if (req.url === "/v1/moments/detail")
        return send(200, this.runtime.detail(body));
      if (req.url === "/v1/questions") return send(200, this.runtime.ask(body));
      const cancel = req.url.match(/^\/v1\/questions\/(deep-\d+)\/cancel$/);
      if (cancel) {
        this.runtime.cancel(cancel[1]);
        return send(200, { cancelled: true });
      }
      if (req.url === "/v1/segments") {
        validateRemote(body);
        if (body.sessionId !== this.runtime.session?.id)
          throw Error("Session obsolète.");
        if (body.endMs > this.runtime.session.watch.now() + 3000)
          throw Error("Horodatage futur.");
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
        try {
          const input = await this.media.assemble(body);
          const id = await this.runtime.ingest(input);
          this.accepted.set(key, { id, hash });
          this.lastSequence = body.sequence;
          if (this.accepted.size > 100)
            this.accepted.delete(this.accepted.keys().next().value);
          return send(200, { id, duplicate: false });
        } finally {
          this.ingesting = false;
        }
      }
      send(404, { error: "Route inconnue." });
    } catch (error) {
      if (!res.headersSent) send(400, { error: error.message });
      else res.end();
    }
  }
  async close() {
    this.server.closeAllConnections();
    await new Promise((resolve) => this.server.close(resolve));
  }
}
module.exports = { RemoteServer };
