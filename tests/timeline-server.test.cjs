const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const sharp = require("sharp");
const { HeadlessRuntime } = require("../runtime/headless-runtime.cjs");
const { RemoteServer } = require("../server/http.cjs");
test("authenticated timeline thumbnails and media outlive the former five-minute window; selected questions stay bounded; ending archives without purging", async (t) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "tvlens-timeline-http-"),
  );
  let clock = 0;
  const seen = [];
  const agent = {
    answer: async (input) => {
      seen.push(input.context);
      return {
        answer: "Contexte sélectionné",
        kind: "explanation",
        citations: [],
        limits: [],
      };
    },
  };
  const runtime = new HeadlessRuntime({
    userData: root,
    sessionsRoot: path.join(root, "sessions"),
    config: {},
    selectedModels: {
      codexModel: "test",
      observationModel: "test",
      inspectionModel: "test",
    },
    readClock: () => clock,
    smoke: true,
    agent,
  });
  const jpeg = await sharp({
    create: { width: 640, height: 360, channels: 3, background: "#264136" },
  })
    .jpeg()
    .toBuffer();
  const server = await new RemoteServer({
    runtime,
    token: "t".repeat(64),
    media: {
      assemble: async (input) => ({
        ...input,
        clip: Buffer.from("fixture"),
        frames: [
          {
            atMs: input.startMs,
            dataUrl: "data:image/jpeg;base64," + jpeg.toString("base64"),
          },
        ],
        audio: null,
      }),
    },
  }).listen(0, "127.0.0.1");
  t.after(async () => {
    await server.close();
    await runtime.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const request = async (route, body) =>
    fetch(server.url + route, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + "t".repeat(64),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const session = await (await request("/v1/session/start", {})).json();
  clock = 8000;
  await request("/v1/segments", {
    sessionId: session.id,
    sequence: 0,
    startMs: 0,
    endMs: 8000,
    frames: [{ atMs: 0, data: "YQ==" }],
  });
  while (runtime.session.watch.running)
    await new Promise((r) => setImmediate(r));
  assert.equal(
    (await (await request("/v1/state")).json()).timeline.cards[0].thumbnailId,
    "moment-1",
  );
  assert.equal(
    (await fetch(server.url + "/v1/thumbnail/" + session.id + "/moment-1"))
      .status,
    401,
  );
  const thumbRoute = "/v1/thumbnail/" + session.id + "/moment-1";
  const thumb = await request(thumbRoute);
  assert.equal(thumb.status, 200);
  assert.match(thumb.headers.get("content-type"), /image\/jpeg/);
  // Past the former rolling window: the media is kept until the session is deleted.
  clock = 320000;
  await runtime.session.watch.prune();
  assert.equal((await request("/v1/media/moment-1")).status, 200);
  assert.equal((await request(thumbRoute)).status, 200);
  clock = 328000;
  await request("/v1/segments", {
    sessionId: session.id,
    sequence: 1,
    startMs: 320000,
    endMs: 328000,
    frames: [{ atMs: 320000, data: "YQ==" }],
  });
  while (runtime.session.watch.running)
    await new Promise((r) => setImmediate(r));
  const answer = await request("/v1/questions", {
    sessionId: session.id,
    anchorMs: 328000,
    question: "Explique.",
    moment: { segmentIds: ["moment-1"] },
  });
  assert.equal(answer.status, 200);
  await runtime.deep.jobs.at(-1).done;
  assert.equal(seen[0].anchorMs, 8000);
  assert.equal(seen[0].startMs, 0);
  assert.deepEqual(
    seen[0].passages.map((p) => p.id),
    ["moment-1"],
  );
  const detail = await (
    await request("/v1/moments/detail", {
      sessionId: session.id,
      segmentIds: ["moment-1"],
    })
  ).json();
  assert.equal(detail.passages[0].available, true);
  assert.equal(
    (
      await request("/v1/moments/detail", {
        sessionId: "stale",
        segmentIds: ["moment-1"],
      })
    ).status,
    400,
  );
  await request("/v1/session/pause", {});
  assert.equal((await request(thumbRoute)).status, 200);
  assert.equal(
    (await (await request("/v1/session/start", {})).json()).id,
    session.id,
  );
  // Ending answers what happened to the session: archived, under its identifier.
  const ended = await request("/v1/session/end", {});
  assert.equal(ended.status, 200);
  assert.deepEqual(await ended.json(), {
    ended: true,
    id: session.id,
    archived: true,
  });
  assert.equal(runtime.session, null);
  // The ended session is no longer the one served, but nothing of it was erased: it is an archive.
  assert.equal((await request(thumbRoute)).status, 410);
  const dir = path.join(root, "sessions", session.id);
  assert.deepEqual((await fs.readdir(path.join(dir, "media"))).sort(), [
    "moment-1.json",
    "moment-1.webm",
    "moment-2.json",
    "moment-2.webm",
  ]);
  assert.deepEqual((await fs.readdir(path.join(dir, "thumbs"))).sort(), [
    "moment-1.jpg",
    "moment-2.jpg",
  ]);
  assert.ok((await fs.readdir(dir)).includes("session.json"));
  assert.equal(
    JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"))
      .state,
    "archived",
  );
});

test('ending waits for an in-flight ingestion, then keeps its media and thumbnail instead of purging them', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-end-race-'));
  let clock = 0, releaseWrite, entered;
  const writeGate = new Promise(resolve => { releaseWrite = resolve; });
  const writeEntered = new Promise(resolve => { entered = resolve; });
  const runtime = new HeadlessRuntime({userData:root,sessionsRoot:path.join(root,'sessions'),config:{},
    selectedModels:{codexModel:'test',observationModel:'test',inspectionModel:'test'},smoke:true,
    readClock:()=>clock,agent:{answer:async()=>({answer:'test',kind:'explanation',citations:[],limits:[]})}});
  t.after(async()=>{releaseWrite();await runtime.close();await fs.rm(root,{recursive:true,force:true});});
  const session = await runtime.start();
  runtime.session.watch.asking = true;
  const store = runtime.session.store, originalPut = store.put.bind(store);
  store.put = async (...args) => { entered();await writeGate;return originalPut(...args); };
  const jpeg = await sharp({create:{width:64,height:36,channels:3,background:'#264136'}}).jpeg().toBuffer();
  clock = 8000;
  const ingest = runtime.ingest({sessionId:session.id,startMs:0,endMs:8000,clip:Buffer.from('fixture'),frames:[{atMs:0,dataUrl:'data:image/jpeg;base64,'+jpeg.toString('base64')}]});
  await writeEntered;
  let ended = false;
  const end = runtime.end().then(()=>{ended=true;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ended,false,'Closing cannot race past the media write');
  releaseWrite();await ingest;await end;
  assert.equal(runtime.session,null);
  // The passage that was being written when the session ended is whole on disk, with its thumbnail.
  const dir=path.join(root,'sessions',session.id);
  assert.deepEqual((await fs.readdir(path.join(dir,'media'))).sort(),['moment-1.json','moment-1.webm']);
  assert.deepEqual(await fs.readdir(path.join(dir,'thumbs')),['moment-1.jpg']);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir,'session.json'),'utf8')).segments[0].id,'moment-1');
});
