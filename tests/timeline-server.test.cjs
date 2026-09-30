const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const sharp = require("sharp");
const { HeadlessRuntime } = require("../runtime/headless-runtime.cjs");
const { RemoteServer } = require("../server/http.cjs");
test("authenticated timeline thumbnails survive raw expiry; selected questions stay bounded; explicit end purges images", async (t) => {
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
  clock = 320000;
  await runtime.session.watch.prune();
  assert.equal((await request("/v1/media/moment-1")).status, 410);
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
  assert.equal(detail.passages[0].available, false);
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
  assert.equal((await request("/v1/session/end", {})).status, 200);
  assert.equal(runtime.session, null);
  assert.equal((await request(thumbRoute)).status, 410);
  const remaining = await fs.readdir(path.join(root, "sessions", session.id));
  assert.ok(!remaining.includes("thumbnails"));
  assert.ok(!remaining.includes("moment-2.webm"));
  assert.ok(remaining.includes("session.json"));
});

test('ending waits for an in-flight ingestion before purging thumbnails and raw media', async t => {
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
  const files=await fs.readdir(path.join(root,'sessions',session.id));
  assert.ok(!files.includes('thumbnails'));assert.ok(!files.includes('moment-1.webm'));assert.ok(!files.includes('moment-1.json'));
});
