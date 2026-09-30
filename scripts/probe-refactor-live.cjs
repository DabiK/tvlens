// Isolated real-media/provider smoke: never connects to, opens or restarts the TV.
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { HeadlessRuntime } = require("../runtime/headless-runtime.cjs");
const { RemoteMedia } = require("../adapters/remote-media.cjs");
const { RemoteServer } = require("../server/http.cjs");
const { loadConfig } = require("../adapters/config.cjs");
const exec = promisify(execFile);
const reportPath = process.argv.find(arg => arg.startsWith('--report='))?.slice(9) || 'docs/refactor-live-report.json';
const requireTimeline = process.argv.includes('--require-timeline');

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-refactor-live-"));
  const report = {
    date: new Date().toISOString(),
    source: process.env.TVLENS_PROBE_VIDEO || "media/samples/kennedy-rice-7min.mp4",
    intervalSeconds: [30, 38],
    checks: [],
    failures: [],
  };
  let runtime, server;
  try {
    const config = await loadConfig({
      configPath: process.env.TVLENS_CONFIG || path.resolve(".env.local"),
      userData: dir,
      safeStorage: { isEncryptionAvailable: () => false },
    });
    // This regression probe exercises Codex/Whisper, not paid embedding generation.
    config.apiKey = "";
    const ffmpeg = config.ffmpeg || "/opt/homebrew/bin/ffmpeg";
    const input = path.resolve(report.source);
    for (let i = 0; i < 4; i++) {
      await exec(ffmpeg, [
        "-nostdin",
        "-v",
        "error",
        "-ss",
        String(30 + i * 2),
        "-i",
        input,
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-2",
        path.join(dir, i + ".jpg"),
      ]);
    }
    await exec(ffmpeg, [
      "-nostdin",
      "-v",
      "error",
      "-ss",
      "30",
      "-i",
      input,
      "-t",
      "8",
      "-ar",
      "16000",
      "-ac",
      "1",
      path.join(dir, "audio.wav"),
    ]);
    let clock = 0;
    runtime = new HeadlessRuntime({
      userData: dir,
      sessionsRoot: path.join(dir, "sessions"),
      config,
      selectedModels: {
        codexModel: "",
        observationModel: "gpt-6-luna",
        inspectionModel: "gpt-6-luna",
      },
      codexBinary: process.env.TVLENS_CODEX_BINARY || path.join(os.homedir(), ".local/bin/codex"),
      readClock: () => clock,
    });
    const token = require("node:crypto").randomBytes(32).toString("hex");
    server = await new RemoteServer({
      runtime,
      media: new RemoteMedia({ ffmpeg }),
      token,
    }).listen(0, "127.0.0.1");
    const request = async (route, body) => {
      const response = await fetch(server.url + route, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      assert.equal(response.ok, true, result.error || route);
      return result;
    };
    const session = await request("/v1/session/start", {});
    clock = 8000;
    const frames = await Promise.all(
      [0, 1, 2, 3].map(async (i) => ({
        atMs: i * 2000,
        data: (await fs.readFile(path.join(dir, i + ".jpg"))).toString(
          "base64",
        ),
      })),
    );
    await request("/v1/segments", {
      sessionId: session.id,
      sequence: 0,
      startMs: 0,
      endMs: 8000,
      frames,
      audio: (await fs.readFile(path.join(dir, "audio.wav"))).toString(
        "base64",
      ),
    });
    const deadline = Date.now() + 60000;
    let observed;
    while (Date.now() < deadline) {
      const state = await request("/v1/state");
      observed = state.session.segments[0];
      if (["ready", "error", "skipped"].includes(observed?.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(observed?.status, "ready", JSON.stringify(observed));
    assert.ok(observed.observation.summary.length);
    assert.ok(
      observed.observation.transcript.length > 10,
      "Real local transcription required",
    );
    report.observation = observed.observation;
    if (requireTimeline) {
      assert.ok(observed.observation.topic, 'Perception must emit a topic');
      const state = await request('/v1/state');
      assert.equal(state.timeline.cards.length, 1);
      assert.equal(state.timeline.cards[0].thumbnailId, observed.id);
      const image = await fetch(server.url + '/v1/thumbnail/' + session.id + '/' + observed.id, {headers:{Authorization:'Bearer '+token}});
      assert.equal(image.status, 200);
      assert.match(image.headers.get('content-type'), /image\/jpeg/);
      report.checks.push('Real topic generation and authenticated session thumbnail');
    }
    report.checks.push(
      "HTTP ingest + real JPEG/audio assembly + local Whisper + Luna perception",
    );
    const first = await request("/v1/questions", {
      sessionId: session.id,
      anchorMs: 8000,
      question:
        "Consulte get_transcript sur 0 à 8000 ms, puis indique en une phrase ce dont parle le passage, sans identifier une personne par sa seule apparence.",
    });
    const second = await request("/v1/questions", {
      sessionId: session.id,
      anchorMs: 8000,
      question:
        "Reformule ta réponse précédente plus simplement, sans ajouter de faits.",
    });
    assert.equal(
      runtime.deep.jobs.find((j) => j.id === second.id).status,
      "queued",
    );
    await Promise.all(runtime.deep.jobs.map((j) => j.done));
    report.jobs = runtime.deep
      .snapshot()
      .jobs.map(({ id, status, result, anchorMs, activity }) => ({
        id,
        status,
        result,
        anchorMs,
        activity,
      }));
    assert.ok(
      report.jobs.every((j) => j.status === "done"),
      JSON.stringify(report.jobs),
    );
    assert.ok(
      report.jobs[0].result.audit.some(
        (a) => a.tool === "get_transcript" && a.status === "completed",
      ),
    );
    assert.equal(
      report.jobs[0].result.threadId,
      report.jobs[1].result.threadId,
    );
    report.checks.push(
      "Real dynamic tool dispatch, FIFO, two questions in the same Codex thread",
    );
    await request("/v1/session/pause", {});
    clock = 12000;
    const resumed = await request("/v1/session/start", {});
    assert.equal(resumed.id, session.id);
    assert.equal(runtime.deep.jobs.length, 2);
    report.checks.push(
      "Pause/resume retains session, analyzed passage and conversation",
    );
    await request("/v1/questions", { sessionId: session.id, anchorMs: 8000,
      question: "Utilise inspect_clip sur l’intervalle 0 à 8000 ms pour décrire ce que montrent les images. Distingue les observations et les incertitudes." });
    await runtime.deep.jobs.at(-1).done;
    const inspection = runtime.deep.snapshot().jobs.at(-1);
    report.inspection = { status: inspection.status, result: inspection.result, activity: inspection.activity };
    assert.equal(inspection.status, "done", JSON.stringify(report.inspection));
    assert.ok(inspection.result.audit.some(a => a.tool === "inspect_clip" && a.status === "completed"));
    report.checks.push("Real clip reinspection through the shared runtime and tool-free Luna adapter");
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.failures.push(error.message);
    process.exitCode = 1;
  } finally {
    await server?.close();
    await runtime?.close();
    await fs.writeFile(
      reportPath,
      JSON.stringify(report, null, 2) + "\n",
    );
    await fs.rm(dir, { recursive: true, force: true });
    console.log(
      JSON.stringify(
        {
          status: report.status,
          checks: report.checks,
          failures: report.failures,
        },
        null,
        2,
      ),
    );
  }
})();
