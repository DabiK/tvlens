const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { runReplay } = require('../scripts/replay-local-perception.cjs');

const hash = value => createHash('sha256').update(value).digest('hex');
const emptyTranscript = () => ({ text: '', availability: 'unknown', limits: 'Disponibilité au départ inconnue.' });
const emptyContext = () => ({ value: null, limits: "Trace d'entrée absente ; contexte laissé vide." });
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-perception-replay-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const media = { startMs: 8000, endMs: 16000, audio: 'QUJD',
    frames: Array.from({ length: 8 }, (_, i) => ({ atMs: 8000 + i * 1000,
      dataUrl: 'data:image/jpeg;base64,' + Buffer.from('image-' + i).toString('base64') })) };
  const raw = JSON.stringify(media);
  await fs.writeFile(path.join(root, 'media.json'), raw);
  const item = { id: 'capture-1', startMs: 8000, endMs: 16000, media: { path: 'media.json', sha256: hash(raw) },
    provenance: { kind: 'tvlens-capture', sessionId: 'session', passageId: 'moment-2' },
    transcript: emptyTranscript(), context: emptyContext(), lightweight: { value: false, source: 'explicit-default' } };
  const manifest = { version: 1, cases: [item] };
  const manifestPath = path.join(root, 'manifest.json');
  const save = () => fs.writeFile(manifestPath, JSON.stringify(manifest));
  await save();
  return { root, media, item, manifest, save, options: { manifestPath, outputDir: path.join(root, 'out'), backend: 'local' } };
}
const forbidden = class {
  constructor() {
    assert.fail('validation must construct no provider');
  }
};

test('validation preserves absent input limits and capture fingerprints without constructing providers', async t => {
  const f = await fixture(t);
  const report = await runReplay(f.options, { providerDependencies: { LocalVlmAgent: forbidden, CodexPerception: forbidden } });
  assert.equal(report?.mode, 'validation');
  assert.equal(report.complete, true);
  assert.equal(report.cases[0].status, 'validated');
  assert.deepEqual(report.cases[0].input.transcript, f.item.transcript);
  assert.deepEqual(report.cases[0].input.context, f.item.context);
  assert.equal(report.cases[0].input.media.sha256, f.item.media.sha256);
  assert.equal(report.g2Eligible, false);
  assert.equal((JSON.parse(await fs.readFile(path.join(f.options.outputDir, 'campaign.json')))).complete, true);
});

function documentedContext() {
  const prior = { id: 'moment-1', startMs: 0, endMs: 8000 };
  return { provenance: { kind: 'input-trace', reference: 'trace conservée avant vision' }, limits: 'Contexte historique non vérifié.',
    prefix: [prior], value: { previousTopic: 'Débat', previousTopicSummary: {
      text: 'Une question sur les prix.', firstId: prior.id, lastId: prior.id, startMs: 0, endMs: 8000, pendingPassages: [] },
    activeTopic: { firstId: prior.id, startMs: 0, recent: [{ ...prior, summary: 'Question antérieure.' }] } } };
}

test('future context is refused even when pending, active and overlapping passages agree with their prefix', async t => {
  const outcomes = [];
  let constructed = 0;
  class ForbiddenProvider {
    constructor() {
      constructed++;
      assert.fail('future context must be refused before provider construction');
    }
  }
  for (const mode of ['pending', 'active', 'overlap']) {
    const f = await fixture(t);
    const context = documentedContext();
    if (mode === 'overlap') {
      context.prefix[0].endMs = 9000;
      context.value.activeTopic.recent[0].endMs = 9000;
      context.value.previousTopicSummary.endMs = 9000;
    } else {
      const future = { id: 'moment-3', startMs: 16000, endMs: 24000 };
      context.prefix.push(future);
      if (mode === 'pending') context.value.previousTopicSummary.pendingPassages.push({ ...future, summary: 'Futur cumulatif.' });
      else context.value.activeTopic.recent.push({ ...future, summary: 'Futur actif.' });
    }
    f.item.context = context;
    await f.save();
    const report = await runReplay({ ...f.options, execute: true, model: 'fake', url: 'http://127.0.0.1:9' }, {
      providerDependencies: { CodexPerception: ForbiddenProvider, LocalVlmAgent: ForbiddenProvider },
    });
    outcomes.push({ mode, status: report.cases[0].status, code: report.cases[0].error?.code, complete: report.complete });
  }
  assert.equal(constructed, 0);
  assert.deepEqual(outcomes, ['pending', 'active', 'overlap'].map(mode => ({
    mode, status: 'refused', code: 'TVLENS_REPLAY_CONTEXT_INVALID', complete: false,
  })));
});

test('preflight refuses missing files, wrong hashes, intervals, frame times and future or out-of-prefix context before any provider', async t => {
  const mutations = [
    [item => { item.media.path = 'absent.json'; }, 'FILE_UNAVAILABLE'],
    [item => { item.media.sha256 = '0'.repeat(64); }, 'HASH_MISMATCH'],
    [item => { item.endMs = item.startMs; }, 'INTERVAL_INVALID'],
    [item => { item.startMs = 9000; }, 'INTERVAL_MISMATCH'],
    [(_item, media) => { media.frames[7].atMs = 17000; }, 'FRAMES_INVALID'],
    [(_item, media) => { media.frames.reverse(); }, 'FRAMES_INVALID'],
    [item => {
      item.context = documentedContext();
      item.context.value.previousTopicSummary.endMs = 9000;
    }, 'CONTEXT_INVALID'],
    [item => {
      item.context = documentedContext();
      item.context.value.previousTopicSummary.pendingPassages = [
        { id: 'moment-3', startMs: 16000, endMs: 24000, summary: 'Futur' }];
    }, 'CONTEXT_INVALID'],
    [item => {
      item.context = documentedContext();
      item.context.value.activeTopic.recent[0].id = 'outside';
    }, 'CONTEXT_INVALID'],
    [item => {
      item.context = documentedContext();
      delete item.context.provenance;
    }, 'CONTEXT_INVALID'],
    [item => {
      item.context = documentedContext();
      item.context.value.activeTopic.recent[0].annotation = 'attendu';
    }, 'CONTEXT_INVALID'],
    [item => { item.transcript = { text: 'Paroles finales', availability: 'known', limits: 'Archive sans trace' }; }, 'TRANSCRIPT_INVALID'],
  ];
  for (const [mutate, code] of mutations) {
    const f = await fixture(t);
    const original = JSON.stringify(f.media);
    mutate(f.item, f.media);
    if (JSON.stringify(f.media) !== original) {
      const raw = JSON.stringify(f.media);
      await fs.writeFile(path.join(f.root, 'media.json'), raw);
      f.item.media.sha256 = hash(raw);
    }
    await f.save();
    const report = await runReplay({ ...f.options, execute: true, model: 'fake', url: 'http://127.0.0.1:9' }, {
      providerDependencies: { LocalVlmAgent: forbidden, CodexPerception: forbidden },
    }).catch(error => ({ error }));
    assert.equal(report.cases?.[0]?.status, 'refused', code);
    assert.equal(report.cases[0].error.code, 'TVLENS_REPLAY_' + code);
    assert.equal(report.complete, false);
  }
});

test('converted video keeps source fingerprint, interval and conversion settings with unknown transcript and context', async t => {
  const f = await fixture(t);
  f.item.provenance = { kind: 'converted-video', sourceSha256: hash('video'), sourceInterval: { startMs: 20000, endMs: 28000 },
    conversion: { tool: 'ffmpeg', version: 'fixture', arguments: ['-vf', 'fps=1'] } };
  await f.save();
  const report = await runReplay(f.options);
  assert.equal(report.cases[0].status, 'validated');
  assert.deepEqual(report.cases[0].input.provenance, f.item.provenance);
  assert.deepEqual(report.cases[0].input.transcript, emptyTranscript());
});

const http = require('node:http');
const { CodexPerception } = require('../adapters/codex-perception.cjs');
const { deferred } = require('./helpers/wait.cjs');
const observation = { topic: 'Débat', summary: 'Une réponse en plateau.', visual: 'Deux intervenants.', uncertainty: '',
  continuity: 'continue', topicSummary: 'Question puis réponse.' };
async function ollama(t, handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk)).on('end', () => {
      requests.push(JSON.parse(Buffer.concat(chunks)));
      handler(res, requests.length);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return { url: 'http://127.0.0.1:' + server.address().port, requests };
}
function respond(res, content = observation) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: { content: typeof content === 'string' ? content : JSON.stringify(content) },
    total_duration: 123456789, load_duration: 23456789, prompt_eval_count: 99, eval_count: 12 }));
}

test('execution traverses the shared factory and real perception to Ollama with actual bounded selection and frozen annotations', async t => {
  const f = await fixture(t);
  f.item.context = documentedContext();
  f.item.transcript = { text: 'Réponse sur les prix.', availability: 'known', limits: 'Transcription locale incertaine.',
    provenance: { kind: 'input-trace', reference: 'trace audio au départ de la vision' }, audioLimit: 'Mot indistinct.' };
  f.item.annotation = 'ANNOTATION_INTERDITE';
  f.item.expectedResponse = 'RÉPONSE_INTERDITE';
  f.manifest.cases.push({ ...f.item, id: 'capture-light', lightweight: { value: true, source: 'saved-metrics' } });
  await f.save();
  const annotationsPath = path.join(f.root, 'annotations.json');
  const annotations = 'ANNOTATION_FIGÉE';
  await fs.writeFile(annotationsPath, annotations);
  const server = await ollama(t, async res => {
    const before = JSON.parse(await fs.readFile(path.join(f.options.outputDir, 'campaign.json')));
    assert.equal(before.annotationsSha256, hash(annotations));
    assert.equal(before.complete, false);
    assert.equal(before.cases.find(item => item.status === 'running').request.frames.length > 0, true);
    await fs.writeFile(annotationsPath, 'modifié après le premier appel');
    respond(res);
  });
  let built = 0;
  const report = await runReplay({ ...f.options, execute: true, url: server.url + '/ENDPOINT_PRIVE',
    model: 'fixture-vlm', numCtx: 4096, annotationsPath }, {
    providerDependencies: { CodexPerception: class extends CodexPerception {
      constructor(options) {
        super(options);
        built++;
      }
    } },
  });
  assert.deepEqual(report.cases.map(item => item.status), ['succeeded', 'succeeded']);
  assert.equal(built, 2);
  assert.equal(report.complete, true);
  assert.equal(report.g2Eligible, true);
  assert.equal(report.backend, 'local');
  assert.equal(report.annotationsSha256, hash(annotations));
  const persisted = JSON.parse(await fs.readFile(path.join(f.options.outputDir, 'campaign.json')));
  assert.deepEqual(persisted, report);
  assert.equal(typeof persisted.runId, 'string');
  assert.match(persisted.runId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(persisted.manifestSha256, hash(await fs.readFile(f.options.manifestPath)));
  assert.deepEqual(persisted.config, { model: 'fixture-vlm', isolation: 'new-agent-per-case', transcription: 'frozen-no-whisper',
    host: new URL(server.url).host, numCtx: 4096, keepAlive: '10m' });
  for (const [i, indices] of [[0, [0, 1, 2, 3, 4, 5]], [1, [0, 3, 5]]]) {
    assert.deepEqual(server.requests[i].messages[0].images, indices.map(index => f.media.frames[index].dataUrl.split(',')[1]));
    const request = server.requests[i].messages[0].content;
    assert.ok(request.includes(JSON.stringify(indices.map(index => f.media.frames[index].atMs))));
    assert.match(request, /Réponse sur les prix|Une question sur les prix|Question antérieure/);
    assert.ok(request.includes('Réponse sur les prix.'));
    assert.ok(request.includes('Une question sur les prix.'));
    assert.ok(request.includes('Question antérieure.'));
    assert.doesNotMatch(request, /ANNOTATION_|RÉPONSE_INTERDITE/);
    assert.deepEqual(report.cases[i].request.frames.map(frame => frame.index), indices);
    assert.equal(report.cases[i].result.metrics.providerTimings.rawNs.load_duration, 23456789);
    assert.equal(report.cases[i].result.metrics.modelState, 'unknown');
    assert.equal(report.cases[i].result.metrics.backend.kind, 'ollama');
    assert.equal(report.cases[i].result.observation.transcript, f.item.transcript.text);
    assert.match(report.cases[i].result.observation.uncertainty, /Mot indistinct/);
    const stored = persisted.cases[i];
    assert.equal(stored.diagnostics.length, 1);
    assert.deepEqual(stored.input.frames, f.media.frames.map((frame, index) => ({ index, atMs: frame.atMs, sha256: hash(frame.dataUrl) })));
    assert.equal(stored.input.audioSha256, hash(Buffer.from(f.media.audio, 'base64')));
    assert.equal(stored.request.instructions, request);
    assert.equal(stored.request.promptSha256, hash(request));
  }
  assert.ok(report.code.sha.match(/^[a-f0-9]{40}$/));
  assert.ok(report.code.sources['scripts/replay-local-perception.cjs'].match(/^[a-f0-9]{64}$/));
  assert.doesNotMatch(JSON.stringify(report), /ANNOTATION_FIGÉE|ANNOTATION_INTERDITE|RÉPONSE_INTERDITE|ENDPOINT_PRIVE/);
});

test('credential-bearing URLs are refused before constructing a provider or creating a campaign', async t => {
  const f = await fixture(t);
  await assert.rejects(runReplay({ ...f.options, execute: true, url: 'http://user:SECRET_URL@127.0.0.1:9', model: 'fake' }, {
    providerDependencies: { CodexPerception: forbidden, LocalVlmAgent: forbidden },
  }), { code: 'TVLENS_REPLAY_CONFIG_INVALID' });
  await assert.rejects(fs.access(path.join(f.options.outputDir, 'campaign.json')), { code: 'ENOENT' });
});

test('Ollama receives exactly the active historical context and no replay or transcript metadata', async t => {
  const f = await fixture(t);
  const context = documentedContext();
  context.prefix[0].startMs = 4000;
  context.value.activeTopic.startMs = 4000;
  context.value.activeTopic.recent[0].startMs = 4000;
  context.value.previousTopicSummary.startMs = 4000;
  const earlier = { id: 'earlier-topic', startMs: 0, endMs: 4000 };
  context.prefix.unshift({ ...earlier, replayNote: 'EXCLUDED_PREFIX_METADATA' });
  context.value.recent = [{ ...earlier, summary: 'EXCLUDED_RECENT' }];
  context.value.sessionOutline = [{ firstId: earlier.id, lastId: earlier.id, startMs: 0, endMs: 4000, topic: 'EXCLUDED_OUTLINE' }];
  context.value.limits = 'Limite historique admissible.';
  context.limits = 'EXCLUDED_CONTEXT_LIMITS';
  context.provenance.reference = 'EXCLUDED_CONTEXT_PROVENANCE';
  f.item.context = context;
  f.item.transcript = { text: 'Paroles disponibles.', availability: 'known', limits: 'EXCLUDED_TRANSCRIPT_LIMITS',
    provenance: { kind: 'input-trace', reference: 'EXCLUDED_TRANSCRIPT_PROVENANCE' } };
  await f.save();
  const server = await ollama(t, res => respond(res));
  const report = await runReplay({ ...f.options, execute: true, url: server.url, model: 'fake' });
  assert.equal(report.cases[0].status, 'succeeded');
  const prompt = server.requests[0].messages[0].content;
  const historicalJson = prompt.split('Contexte HISTORIQUE NON VÉRIFIÉ : ')[1].split('. Ce contexte sert seulement')[0];
  assert.deepEqual(JSON.parse(historicalJson), { kind: 'historical-unverified-context', previousTopic: context.value.previousTopic,
    previousTopicSummary: context.value.previousTopicSummary, recent: context.value.activeTopic.recent, limits: context.value.limits });
  assert.doesNotMatch(prompt, /EXCLUDED_/);
  assert.equal(report.cases[0].result.observation.uncertainty, '');
});

test('Codex reference uses real perception with a doubled analysis agent and records the explicit backend', async t => {
  const f = await fixture(t), requests = [];
  const report = await runReplay({ ...f.options, backend: 'codex', execute: true, model: 'fixture-codex' }, {
    providerDependencies: { CodexPerception: class extends CodexPerception {
      constructor(options) {
        super({ ...options, agent: {
          answer: async input => {
            requests.push(input);
            return observation;
          }, close() {},
        } });
      }
    } },
  });
  assert.equal(report.cases[0].status, 'succeeded');
  assert.equal(report.backend, 'codex');
  assert.equal(report.reference, 'codex');
  assert.equal(report.cases[0].backend, 'codex');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].mediaInput.length, 6);
  assert.equal(requests[0].outputSchema.type, 'object');
  assert.equal(report.g2Eligible, false);
});

test('held calls preserve prior outputs and diagnostics survive JSON, validation, refusal and HTTP failures', async t => {
  const f = await fixture(t), held = deferred();
  f.manifest.cases = Array.from({ length: 6 }, (_, i) => ({ ...f.item, id: 'case-' + i }));
  await f.save();
  const server = await ollama(t, (res, n) => {
    if (n === 1) respond(res);
    else if (n === 2) held.resolve(res);
    else if (n === 3) respond(res, {});
    else if (n === 4) {
      res.writeHead(403);
      res.end('{}');
    }
    else if (n === 5) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'SERVER_INTERNAL_SECRET' }));
    }
    else respond(res);
  });
  const pending = runReplay({ ...f.options, execute: true, url: server.url, model: 'fixture' });
  const res = await held.promise;
  const intermediate = JSON.parse(await fs.readFile(path.join(f.options.outputDir, 'campaign.json')));
  assert.equal(intermediate.complete, false);
  assert.deepEqual(intermediate.cases.slice(0, 2).map(item => item.status), ['succeeded', 'running']);
  respond(res, 'JSON modèle invalide');
  const report = await pending;
  assert.deepEqual(report.cases.map(item => item.status), ['succeeded', 'error', 'error', 'refused', 'error', 'succeeded']);
  assert.deepEqual(report.cases.map(item => item.id), f.manifest.cases.map(item => item.id));
  assert.equal(report.cases[1].error.code, 'TVLENS_LOCAL_VLM_RESPONSE_INVALID');
  assert.equal(report.cases[1].diagnostics.at(-1).metrics.providerTimings.rawNs.total_duration, 123456789);
  assert.equal(report.cases[2].error.code, 'TVLENS_REPLAY_RESPONSE_INVALID');
  assert.equal(report.cases[3].error.httpStatus, 403);
  assert.equal(report.cases[4].error.code, 'TVLENS_VISION_TRANSIENT');
  assert.deepEqual(report.cases[4].error.cause, { code: 'TVLENS_LOCAL_VLM_UNAVAILABLE', httpStatus: 500 });
  assert.equal(report.cases[4].error.cause.message, undefined);
  assert.ok(report.cases.every(item => item.diagnostics.length === 1));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.options.outputDir, 'campaign.json'))), report);
  assert.doesNotMatch(JSON.stringify(report), /SERVER_INTERNAL_SECRET/);
  assert.equal(report.complete, true);
});

test('cancellation persists an incomplete campaign and a late doubled Codex answer never becomes success', async t => {
  const f = await fixture(t), arrived = deferred(), late = deferred(), controller = new AbortController();
  f.manifest.cases.push({ ...f.item, id: 'never-started' });
  await f.save();
  let calls = 0, closed = 0;
  const pending = runReplay({ ...f.options, backend: 'codex', execute: true, model: 'fake', signal: controller.signal }, {
    providerDependencies: { CodexPerception: class extends CodexPerception {
      constructor(options) { super({ ...options, agent: {
        answer: input => {
          calls++;
          arrived.resolve(input);
          return late.promise;
        }, close() {
          closed++;
        },
      } }); }
    } },
  });
  const request = await arrived.promise;
  controller.abort(Error('Interruption pilotée.'));
  const report = await pending;
  assert.equal(request.signal.aborted, true);
  assert.equal(report.complete, false);
  assert.equal(report.cases[0].status, 'cancelled');
  assert.equal(report.cases[0].result, undefined);
  assert.equal(calls, 1);
  assert.equal(closed, 1);
  const beforeLate = await fs.readFile(path.join(f.options.outputDir, 'campaign.json'), 'utf8');
  late.resolve(observation);
  await late.promise;
  assert.equal(await fs.readFile(path.join(f.options.outputDir, 'campaign.json'), 'utf8'), beforeLate);
});

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const cli = path.resolve(__dirname, '../scripts/replay-local-perception.cjs');
test('CLI help and default validation have no inference effects and reject invalid execution choices', async t => {
  const f = await fixture(t);
  const help = await execute(process.execPath, [cli, '--help']);
  assert.match(help.stdout, /--execute/);
  const result = await execute(process.execPath, [cli, '--manifest', f.options.manifestPath, '--out', f.options.outputDir,
    '--backend', 'local']);
  assert.match(result.stdout, /validation/);
  const report = JSON.parse(await fs.readFile(path.join(f.options.outputDir, 'campaign.json')));
  assert.equal(report.mode, 'validation');
  const missing = await execute(process.execPath, [cli]).catch(error => error);
  assert.equal(missing.code, 1);
  assert.equal(missing.stderr, 'Rejeu refusé : TVLENS_REPLAY_CLI_INVALID.\n');
  const invalid = [
    [[], 'BACKEND_REQUIRED'],
    [['--backend', 'automatic'], 'BACKEND_REQUIRED'],
    [['--backend', 'local', '--execute', '--validate'], 'CLI_INVALID'],
    [['--backend', 'local', '--execute', '--url', 'http://127.0.0.1:9'], 'CONFIG_INVALID'],
    [['--backend', 'local', '--execute', '--model', 'fake'], 'CONFIG_INVALID'],
    [['--unknown'], 'CLI_INVALID'],
  ];
  for (const [index, [args, code]] of invalid.entries()) {
    const outputDir = path.join(f.root, 'invalid-' + index);
    const result = await execute(process.execPath, [cli, '--manifest', f.options.manifestPath, '--out', outputDir, ...args])
      .catch(error => error);
    assert.equal(result.code, 1);
    assert.equal(result.stderr, `Rejeu refusé : TVLENS_REPLAY_${code}.\n`);
    await assert.rejects(fs.access(path.join(outputDir, 'campaign.json')), { code: 'ENOENT' });
  }
});

test('unreadable annotations refuse before agent construction and missing source conversion metadata fails validation', async t => {
  const f = await fixture(t);
  await assert.rejects(runReplay({ ...f.options, execute: true, url: 'http://127.0.0.1:9', model: 'fake',
    annotationsPath: path.join(f.root, 'missing-annotations') }, { providerDependencies: { CodexPerception: forbidden } }),
  { code: 'TVLENS_REPLAY_FILE_UNAVAILABLE' });
  f.item.provenance = { kind: 'converted-video', sourceSha256: hash('source') };
  await f.save();
  const report = await runReplay(f.options);
  assert.equal(report.cases[0].status, 'refused');
  assert.equal(report.cases[0].error.code, 'TVLENS_REPLAY_PROVENANCE_INVALID');
});

test('identical image bytes keep the actual lightweight timestamps and indices', async t => {
  const f = await fixture(t);
  for (const frame of f.media.frames) frame.dataUrl = f.media.frames[0].dataUrl;
  const raw = JSON.stringify(f.media);
  await fs.writeFile(path.join(f.root, 'media.json'), raw);
  f.item.media.sha256 = hash(raw);
  f.item.lightweight = { value: true, source: 'saved-metrics' };
  await f.save();
  const server = await ollama(t, res => respond(res));
  const report = await runReplay({ ...f.options, execute: true, model: 'fake', url: server.url });
  assert.deepEqual(report.cases[0].request.frames.map(frame => frame.index), [0, 3, 5]);
  assert.deepEqual(report.cases[0].request.frames.map(frame => frame.atMs), [8000, 11000, 13000]);
});

test('documented examples validate for either explicit backend without loading a provider or changing media', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-replay-examples-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const manifestPath = path.resolve(__dirname, '../scripts/fixtures/perception-replay/manifest.json');
  const mediaPath = path.join(path.dirname(manifestPath), 'media.json');
  const before = await fs.readFile(mediaPath);
  for (const backend of ['local', 'codex']) {
    const report = await runReplay({ manifestPath, outputDir: path.join(root, backend), backend }, {
      providerDependencies: { LocalVlmAgent: forbidden, CodexPerception: forbidden },
    });
    assert.equal(report.complete, true);
    assert.deepEqual(report.cases.map(item => item.status), ['validated', 'validated', 'validated']);
    assert.equal(report.cases[0].input.transcript.availability, 'known');
    assert.equal(report.cases[1].input.context.value, null);
    assert.equal(report.cases[2].input.provenance.kind, 'converted-video');
  }
  assert.deepEqual(await fs.readFile(mediaPath), before);
});

test('a valid case before a refused case never starts a provider and duplicate case identifiers are refused', async t => {
  const f = await fixture(t);
  f.manifest.cases.push({ ...f.item });
  await f.save();
  const report = await runReplay({ ...f.options, execute: true, model: 'fake', url: 'http://127.0.0.1:9' }, {
    providerDependencies: { LocalVlmAgent: forbidden, CodexPerception: forbidden },
  });
  assert.deepEqual(report.cases.map(item => item.status), ['validated', 'refused']);
  assert.equal(report.cases[1].error.code, 'TVLENS_REPLAY_DUPLICATE_ID');
  assert.equal(report.complete, false);
});

test('help bypasses even corpus parsing and provides no opportunity to build or call a provider', async () => {
  const { main } = require('../scripts/perception-replay-cli.cjs');
  let output = '';
  const status = await main(['--help'], () => assert.fail('help must not invoke replay'), {
    stdout: { write: text => { output += text; } }, stderr: { write: () => assert.fail('help succeeds') },
  });
  assert.equal(status, 0);
  assert.match(output, /--execute/);
});

test('a result write failure closes its provider and preserves the earlier incomplete campaign', async t => {
  const f = await fixture(t);
  const writeFile = fs.writeFile;
  let denyWrites = false, closed = 0;
  t.mock.method(fs, 'writeFile', async (file, ...args) => {
    if (denyWrites && file === path.join(f.options.outputDir, 'campaign.json.tmp'))
      throw Object.assign(Error('Disque plein.'), { code: 'ENOSPC' });
    return writeFile(file, ...args);
  });
  await assert.rejects(runReplay({ ...f.options, backend: 'codex', execute: true, model: 'fake' }, {
    providerDependencies: { CodexPerception: class extends CodexPerception {
      constructor(options) { super({ ...options, agent: {
        answer: async () => {
          denyWrites = true;
          return observation;
        }, close() {
          closed++;
        },
      } }); }
    } },
  }), { code: 'ENOSPC' });
  assert.equal(closed, 1);
  const report = JSON.parse(await fs.readFile(path.join(f.options.outputDir, 'campaign.json')));
  assert.equal(report.complete, false);
  assert.equal(report.cases[0].status, 'running');
});

test('one HTTP request leaves one diagnostic containing its final client and provider measurements', async t => {
  const f = await fixture(t);
  const server = await ollama(t, res => respond(res));
  await runReplay({ ...f.options, execute: true, url: server.url, model: 'fake' });
  const report = JSON.parse(await fs.readFile(path.join(f.options.outputDir, 'campaign.json')));
  assert.equal(server.requests.length, 1);
  const diagnostics = report.cases[0].diagnostics;
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].metrics.providerTimings.rawNs.total_duration, 123456789);
  assert.equal(diagnostics[0].metrics.providerTimings.promptTokens, 99);
  assert.ok(diagnostics[0].metrics.clientTimings.requestMs >= 0);
});

test('configuration records the constructed local agent defaults and explicit values actually sent over HTTP', async t => {
  const { LocalVlmAgent } = require('../adapters/local-vlm-agent.cjs');
  class AlternateDefaults extends LocalVlmAgent {
    constructor(options) {
      super({ ...options, keepAlive: options.keepAlive ?? '17m', numCtx: options.numCtx ?? 2048 });
    }
  }
  for (const explicit of [{}, { keepAlive: '2m', numCtx: 1024 }]) {
    const f = await fixture(t);
    const server = await ollama(t, res => respond(res));
    await runReplay({ ...f.options, execute: true, url: server.url + '/ENDPOINT_PRIVE', model: 'fake', ...explicit }, {
      providerDependencies: { LocalVlmAgent: AlternateDefaults },
    });
    const report = JSON.parse(await fs.readFile(path.join(f.options.outputDir, 'campaign.json')));
    const request = server.requests[0];
    assert.deepEqual(report.config, { model: request.model, isolation: 'new-agent-per-case', transcription: 'frozen-no-whisper',
      host: new URL(server.url).host, numCtx: request.options.num_ctx, keepAlive: request.keep_alive });
    assert.deepEqual(report.cases[0].config, report.config);
    assert.equal(request.keep_alive, explicit.keepAlive ?? '17m');
    assert.equal(request.options.num_ctx, explicit.numCtx ?? 2048);
    assert.doesNotMatch(JSON.stringify(report.config), /ENDPOINT_PRIVE|http:/);
  }
});

test('code identity hashes a tracked diff larger than one MiB as a stream and records the explicit source list', async t => {
  const { EventEmitter } = require('node:events');
  const { Readable } = require('node:stream');
  const f = await fixture(t);
  const diff = Buffer.from('diff --git a/large b/large\n+' + 'é'.repeat(700000));
  assert.ok(diff.length > 1024 * 1024);
  const sha = 'a'.repeat(40), calls = [];
  const spawnImpl = (binary, args) => {
    assert.equal(binary, 'git');
    calls.push(args);
    let bytes = diff;
    if (args[0] === 'rev-parse') bytes = Buffer.from(sha + '\n');
    if (args[0] === 'status') bytes = Buffer.from('?? untracked.txt\n');
    const child = new EventEmitter();
    child.stdout = Readable.from([bytes.subarray(0, 500000), bytes.subarray(500000)]);
    child.stdout.on('end', () => child.emit('close', 0));
    return child;
  };
  const report = await runReplay(f.options, { identityDependencies: { spawnImpl } });
  const stored = JSON.parse(await fs.readFile(path.join(f.options.outputDir, 'campaign.json')));
  assert.equal(stored.code.diffSha256, hash(diff));
  assert.equal(stored.code.sha, sha);
  assert.equal(stored.code.dirty, true);
  assert.deepEqual(stored, report);
  assert.deepEqual(calls, [['rev-parse', 'HEAD'], ['status', '--porcelain'], ['diff', 'HEAD']]);
  assert.deepEqual(Object.keys(stored.code.sources).sort(), [
    'scripts/replay-local-perception.cjs', 'scripts/perception-replay-input.cjs', 'scripts/perception-replay-context.cjs',
    'scripts/perception-replay-execution.cjs', 'scripts/perception-replay-cli.cjs', 'scripts/perception-replay-identity.cjs',
    'runtime/session-providers.cjs', 'adapters/codex-perception.cjs', 'adapters/local-vlm-agent.cjs',
  ].sort());
});
