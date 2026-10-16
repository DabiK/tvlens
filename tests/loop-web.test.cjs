const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const stream = require("./helpers/loop-stream.cjs");
const { fakeRoot, snapshot } = require("./helpers/loop-state-dir.cjs");

const serverModule = () => import(pathToFileURL(path.join(__dirname, "..", "scripts/loop-web/server.mjs")).href);

/** Un faux projet servi sur un port libre ; tout disparaît à la fin du test. */
async function serve(t) {
  const fake = fakeRoot();
  const { createLoopWeb } = await serverModule();
  const server = createLoopWeb(fake.root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(() => { fake.remove(); resolve(); })));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { ...fake, base, port: server.address().port, get: (route) => fetch(base + route) };
}

/** Une requête brute : le chemin et l'en-tête Host partent tels quels, sans la normalisation de fetch. */
function rawRequest(port, { method = "GET", requestPath = "/", host = `127.0.0.1:${port}` } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, method, path: requestPath, headers: { host } }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
    request.end();
  });
}

test("the state route gives the loop view, the tickets and the integrated tickets", async (t) => {
  const { get } = await serve(t);
  const response = await get("/api/state");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.view.ticket.id, "T015");
  assert.equal(body.view.alive, true);
  assert.deepEqual(body.tickets.map((ticket) => [ticket.id, ticket.statut]), [["T001", "termine"], ["T015", "en-cours"], ["T016", "a-faire"]]);
  assert.deepEqual(body.tickets[2].bloquePar, ["T015"]);
  assert.deepEqual(body.history.map((entry) => entry.id), ["T001"]);
  assert.deepEqual(body.journal.map((entry) => entry.phase), ["session", "session-terminee", "integre", "session"]);
  assert.equal(body.journal[0].charge, undefined, "the load of the machine stays on the server");
  assert.deepEqual(body.agents, ["orchestrateur", "explorateur", "implementeur", "relecteur"]);
  assert.equal(typeof body.project, "string");
});

test("the feed route follows each agent of the current session and sends only what changed", async (t) => {
  const { get, sessionFile } = await serve(t);
  const first = await (await get("/api/feed?agent=explorateur&since=0")).json();
  assert.deepEqual(first.agents, ["orchestrateur", "explorateur", "implementeur", "relecteur"]);
  assert.equal(first.engine, "claude");
  assert.deepEqual(first.entries.map((entry) => entry.k), ["phase", "tool", "turn"]);
  const orchestrator = await (await get("/api/feed?since=0")).json();
  assert.equal(orchestrator.agent, "orchestrateur", "without an agent, the feed of the whole session");
  const firstOpen = orchestrator.entries.findIndex((entry) => entry.open);
  assert.ok(firstOpen > 0, "the commands of the orchestrator have no result yet");
  fs.appendFileSync(sessionFile, stream.assistant([{ type: "text", text: "Le contrôle complet est vert." }]) + "\n");
  const next = await (await get(`/api/feed?agent=orchestrateur&since=${firstOpen}`)).json();
  assert.equal(next.key, orchestrator.key);
  assert.equal(next.from, firstOpen);
  assert.equal(next.total, orchestrator.total + 1);
  assert.equal(next.entries.at(-1).text, "Le contrôle complet est vert.");
});

test("the ticket route serves a ticket of the list and nothing else", async (t) => {
  const { get } = await serve(t);
  const ticket = await get("/api/ticket?id=T015");
  assert.equal(ticket.status, 200);
  assert.match((await ticket.json()).text, /titre: Second ticket, in progress/);
  assert.equal((await get("/api/ticket?id=T999")).status, 404);
  assert.equal((await get("/api/ticket?id=..%2F..%2Fpackage.json")).status, 404);
});

test("the review route gives the latest review report of a ticket, or says there is none yet", async (t) => {
  const { get } = await serve(t);
  const review = await (await get("/api/review?id=T015")).json();
  assert.deepEqual([review.rank, review.text], [2, stream.REPORT_OK]);
  const none = await get("/api/review?id=T016");
  assert.equal(none.status, 200, "a ticket not reviewed yet is a normal state, not an error");
  assert.deepEqual(await none.json(), { id: "T016", rank: null, text: null });
  assert.equal((await get("/api/review?id=..")).status, 404);
});

test("the page and its scripts are served, and no path leaves the public folder", async (t) => {
  const { get, port } = await serve(t);
  const page = await get("/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /^text\/html/);
  assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
  const script = await get("/app.js");
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /^text\/javascript/);
  assert.equal(await rawRequest(port, { requestPath: "/../package.json" }), 404);
  assert.equal(await rawRequest(port, { requestPath: "/%2e%2e/package.json" }), 404);
  assert.equal((await get("/api/unknown")).status, 404);
});

test("a request made under another host name is refused", async (t) => {
  const { port } = await serve(t);
  assert.equal(await rawRequest(port, { requestPath: "/api/state", host: "attacker.example" }), 403);
  assert.equal(await rawRequest(port, { requestPath: "/api/state", host: `localhost:${port}` }), 200);
});

test("only reading methods are accepted", async (t) => {
  const { port } = await serve(t);
  assert.equal(await rawRequest(port, { method: "POST", requestPath: "/api/state" }), 405);
});

test("serving the view writes nothing in the project", async (t) => {
  const { get, root } = await serve(t);
  const before = snapshot(root);
  for (const route of ["/api/state", "/api/feed?since=0", "/api/ticket?id=T015", "/api/review?id=T015", "/"]) await (await get(route)).arrayBuffer();
  assert.deepEqual(snapshot(root), before);
});
