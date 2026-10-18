const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { sha256 } = require('../scripts/perception-replay-input.cjs');
const { runReplay } = require('../scripts/replay-local-stream.cjs');
const { manualClock } = require('./helpers/clock.cjs');
const { until, deferred, turns } = require('./helpers/wait.cjs');
const { createTransport } = require('../scripts/local-stream-transport.cjs');
const { reportWriter } = require('../scripts/local-stream-report.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-stream-'));
  const cleanups = [];
  t.after(async () => {
    for (const cleanup of cleanups) await cleanup();
    await fs.rm(root, { recursive: true, force: true });
  });
  const body = { sessionId: 'template', sequence: 0, startMs: 8000, endMs: 9000,
    frames: [{ atMs: 8000, data: 'YQ==' }], audio: 'YQ==' };
  const index = { version: 1, complete: true, blocks: [{ caseId: 'capture-a',
    body: { path: 'body.json', sha256: '' } }] };
  const scenario = { version: 1, kind: 'nominal', index: { path: 'blocks.json', sha256: '' },
    provenance: { kind: 'looped-corpus', reference: 'Corpus fictif répété, sans contenu inédit.' },
    plannedDurationMs: 3000, finalWaitMs: 1000, closeWaitMs: 1000,
    config: { perceptionBackend: 'local', questionsBackend: 'local', embeddingsBackend: 'disabled', inspectionBackend: 'local',
      localVlm: { url: 'http://127.0.0.1:9', model: 'vision-fixture' },
      localQuestions: { url: 'http://127.0.0.1:9', model: 'questions-fixture' }, visionDuringAsk: true },
    selectedModels: { observationModel: 'vision-fixture', inspectionModel: 'inspection-fixture', codexModel: 'chat-fixture' },
    clips: [0, 1, 2].map(i => ({ id: 'clip-' + i, block: 0, occurrence: i, atMs: i * 1000, language: 'fr' })),
    questions: [{ id: 'question-a', atMs: 1500, question: 'Pourquoi ?' }] };
  const scenarioPath = path.join(root, 'scenario.json');
  const save = async () => {
    const raw = JSON.stringify(body);
    await fs.writeFile(path.join(root, 'body.json'), raw);
    index.blocks[0].body.sha256 = sha256(raw);
    const indexRaw = JSON.stringify(index);
    await fs.writeFile(path.join(root, 'blocks.json'), indexRaw);
    scenario.index.sha256 = sha256(indexRaw);
    await fs.writeFile(scenarioPath, JSON.stringify(scenario));
  };
  await save();
  return { root, body, index, scenario, save, cleanups, options: { scenarioPath, outputDir: path.join(root, 'out') } };
}

test('validation fingerprints HTTP templates and every planned occurrence without constructing a host', async t => {
  const f = await fixture(t);
  const report = await runReplay(f.options, { createHost: () => assert.fail('validation constructs no host') });
  assert.equal(report.complete, true);
  assert.equal(report.mode, 'validation');
  assert.equal(report.uploads.length, 3);
  assert.deepEqual(report.uploads.map(x => [x.caseId, x.occurrence, x.startMs, x.endMs, x.plannedAtMs]),
    [0, 1, 2].map(i => ['capture-a', i, i * 1000, (i + 1) * 1000, (i + 1) * 1000]));
  assert.equal(report.inputs.indexSha256, f.scenario.index.sha256);
  assert.equal(report.uploads[0].input.body.sha256, f.index.blocks[0].body.sha256);
  assert.equal(report.uploads[0].input.audioSha256, sha256(Buffer.from('YQ==', 'base64')));
  assert.equal(report.roles.questions.exercised, false);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.options.outputDir, 'campaign.json'))), report);
});

test('run reports retain the Git revision, dirty state, diff fingerprint and hashes of the actual runner and product sources', async t => {
  const { EventEmitter } = require('node:events'), { Readable } = require('node:stream');
  const sha = '1234567890abcdef1234567890abcdef12345678', diff = 'diff --git a/source b/source\n+changed\n';
  for (const dirty of [false, true]) {
    const f = await fixture(t);
    const spawnImpl = (binary, args) => {
      assert.equal(binary, 'git');
      const outputs = { 'rev-parse HEAD': sha + '\n', 'status --porcelain': dirty ? '?? capture.json\n' : '', 'diff HEAD': diff };
      assert.ok(Object.hasOwn(outputs, args.join(' ')));
      const child = new EventEmitter();
      child.stdout = Readable.from([Buffer.from(outputs[args.join(' ')])]);
      child.stdout.on('end', () => child.emit('close', 0));
      return child;
    };
    const report = await runReplay(f.options, { identityDependencies: { spawnImpl } });
    assert.equal(report.code.sha, sha);
    assert.equal(report.code.dirty, dirty);
    assert.equal(report.code.diffSha256, sha256(diff));
    for (const file of ['scripts/replay-local-stream.cjs', 'scripts/local-stream-host.cjs', 'scripts/local-stream-transport.cjs',
      'scripts/local-stream-observe.cjs', 'runtime/headless-runtime.cjs', 'server/http.cjs', 'tv/transport.py']) {
      assert.equal(report.code.sources[file], sha256(await fs.readFile(path.join(__dirname, '..', file))), file);
    }
    assert.ok(Object.values(report.code.sources).every(value => /^[a-f0-9]{64}$/.test(value)));
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.options.outputDir, 'campaign.json'))).code, report.code);
  }
});

test('raw HTTP frames fingerprint their original bytes without inventing a data URL or MIME type', async t => {
  const f = await fixture(t);
  const template = JSON.parse(await fs.readFile(path.join(__dirname, '../scripts/fixtures/local-stream/body.json')));
  f.body.frames[0].data = template.frames[0].data;
  await f.save();
  const report = await runReplay(f.options);
  assert.deepEqual(report.uploads[0].input.frames, [{ index: 0, atMs: 8000,
    bytesSha256: sha256(Buffer.from(template.frames[0].data, 'base64')) }]);
});

test('report snapshots resume after failed writes and renames while retaining prior outputs and the failure diagnostic', async t => {
  for (const [operation, causeCode] of [['writeFile', 'ENOSPC'], ['rename', 'EACCES']]) {
    const f = await fixture(t);
    await fs.mkdir(f.options.outputDir);
    const file = path.join(f.options.outputDir, 'campaign.json');
    const report = { complete: false, status: 'running', diagnostics: [], uploads: [{ sequence: 0, status: 'accepted' }] };
    const writer = reportWriter(f.options.outputDir, report);
    await writer.save();
    const before = await fs.readFile(file, 'utf8'), original = fs[operation];
    let fail = true;
    const mock = t.mock.method(fs, operation, async (...args) => {
      if (fail && args[0] === file + '.tmp') {
        fail = false;
        throw Object.assign(Error('Écriture temporairement refusée.'), { code: causeCode });
      }
      return original(...args);
    });
    await assert.rejects(writer.save(), { code: causeCode });
    assert.equal(await fs.readFile(file, 'utf8'), before, 'the last successful snapshot survives');
    report.status = 'incomplete';
    report.shutdown = { releaseConfirmed: true };
    await assert.doesNotReject(writer.save(), 'a failed snapshot must not poison later saves');
    mock.mock.restore();
    const saved = JSON.parse(await fs.readFile(file));
    assert.deepEqual(saved, report);
    assert.deepEqual(saved.uploads, [{ sequence: 0, status: 'accepted' }]);
    assert.deepEqual(saved.diagnostics, [{ code: 'TVLENS_REPLAY_REPORT_WRITE_FAILED', causeCode }]);
  }
});

test('a queued final snapshot persists a write failure discovered after that snapshot was requested', async t => {
  const f = await fixture(t);
  await fs.mkdir(f.options.outputDir);
  const report = { complete: false, status: 'running', diagnostics: [] }, writer = reportWriter(f.options.outputDir, report);
  const file = path.join(f.options.outputDir, 'campaign.json'), write = fs.writeFile;
  let fail = true;
  t.mock.method(fs, 'writeFile', async (...args) => {
    if (fail && args[0] === file + '.tmp') {
      fail = false;
      throw Object.assign(Error('Écriture temporairement refusée.'), { code: 'ENOSPC' });
    }
    return write(...args);
  });
  const first = writer.save();
  report.status = 'incomplete';
  report.shutdown = { releaseConfirmed: true };
  const final = writer.save();
  await assert.rejects(first, { code: 'ENOSPC' });
  await final;
  const saved = JSON.parse(await fs.readFile(file));
  assert.deepEqual(saved.diagnostics, [{ code: 'TVLENS_REPLAY_REPORT_WRITE_FAILED', causeCode: 'ENOSPC' }]);
  assert.deepEqual(saved, report);
});

const answer = { answer: 'Une explication française.', kind: 'explanation', citations: [], sources: [], limits: [] };
const visual = { topic: 'Un débat', summary: 'Deux personnes discutent sur un plateau.', visual: 'Un plan fixe montre les personnes.',
  uncertainty: '', continuity: 'change', topicSummary: 'Deux personnes discutent sur un plateau.' };
async function accelerated(t, f, extra = {}) {
  const clock = manualClock({ turns: 5 }), ready = deferred();
  await clock.advance(extra.clockOriginMs || 0);
  const cleanup = new AbortController();
  const { CodexPerception } = require('../adapters/codex-perception.cjs');
  const analysis = extra.analysis || { answer: async () => visual, close() {} };
  const transcriber = { availability: () => ({ available: true }), transcribe: async () => ({ text: 'Paroles françaises.', limits: [] }) };
  const perception = new CodexPerception({ agent: analysis, transcriber });
  const runtimeOptions = { guard: null, transcriber,
    agent: { identity: { kind: 'codex', model: 'fake-chat', transport: 'injected' }, answer: async () => answer, close() {} },
    surveillanceAgent: { close() {}, reset() {}, detect: async () => ({ claims: [] }), verify: async () => ({ verdicts: [] }) },
    overrides: { perception }, ...extra.runtimeOptions };
  f.scenario.config.perceptionBackend = extra.perceptionBackend || 'codex';
  f.scenario.config.questionsBackend = extra.questionsBackend || 'codex';
  await f.save();
  let finished = false, host;
  const signal = AbortSignal.any([cleanup.signal, ...(extra.signal ? [extra.signal] : [])]);
  const pending = runReplay({ ...f.options, execute: true, signal }, {
    clock: clock.io, config: {}, wallClock: () => 1800000000000 + clock.io.now(), runtimeOptions,
    media: { assemble: async input => ({ ...input, audio: Buffer.from([1]), clip: Buffer.from('fixture'),
      frames: input.frames.map(frame => ({ atMs: frame.atMs, dataUrl: 'data:image/jpeg;base64,' + frame.data })) }) },
    onScheduled: value => { host = value; ready.resolve(value); }, ...extra.dependencies,
  }).finally(() => { finished = true; });
  f.cleanups.push(async () => {
    cleanup.abort();
    await until(() => finished || host?.report.shutdown, 'runner shutdown before removing fixture');
    if (!finished) await clock.advance(f.scenario.closeWaitMs);
    await pending;
  });
  await until(() => finished || host, 'campaign starts or returns');
  return { clock, pending, ready, host, get finished() { return finished; } };
}

test('the real headless HTTP composition accepts distinct occurrences on a fixed session clock', async t => {
  const f = await fixture(t);
  const clockOriginMs = 456789;
  const stage = await accelerated(t, f, { clockOriginMs });
  assert.equal(stage.host.report.clocks.monotonicOriginMs, clockOriginMs);
  assert.equal(stage.host.report.clocks.wallOriginMs, 1800000000000 + clockOriginMs);
  assert.equal(stage.host.report.clocks.sessionOriginMs, 0);
  assert.equal(stage.host.runtime.snapshot().serverNowMs, stage.host.report.clocks.wallOriginMs);
  if (stage.host) {
    for (let i = 0; i < 3; i++) {
      await stage.clock.advance(1000);
      await until(() => stage.host.report.uploads[i].status === 'accepted', 'HTTP occurrence accepted');
      assert.equal(stage.host.report.uploads[i].submittedAtMs,
        stage.clock.io.now() - stage.host.report.clocks.monotonicOriginMs);
    }
  }
  const report = await stage.pending;
  assert.deepEqual(report.uploads.map(x => x.status), ['accepted', 'accepted', 'accepted']);
  assert.deepEqual(report.uploads.map(x => [x.sequence, x.submittedAtMs]), [[0, 1000], [1, 2000], [2, 3000]]);
  assert.equal(report.questions[0].status, 'done');
  assert.equal(report.questions[0].anchorMs, 1500);
  assert.equal(typeof report.clocks.relation, 'string');
  for (const field of ['plannedAtMs', 'submittedAtMs', 'finishedAtMs', 'anchorMs'])
    assert.equal(report.clocks.fields[field], 'session');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.options.outputDir, 'campaign.json'))).clocks, report.clocks);
  assert.equal(report.reference, 'codex');
  assert.equal(report.shutdown.archiveConfirmed, true);
  assert.equal(report.shutdown.releaseConfirmed, true);
  assert.equal(report.complete, true);
});

test('all HTTP media bounds and source fingerprints are checked before constructing any provider', async t => {
  const invalid = [
    body => { body.endMs = body.startMs; },
    body => { body.endMs = body.startMs + 10001; },
    body => { body.startMs = -1; },
    body => { body.sequence = -1; },
    body => { body.frames[0].data = 'data:image/jpeg;base64,YQ=='; },
    body => { body.frames = Array.from({ length: 6 }, () => ({ ...body.frames[0] })); },
    body => { body.frames = []; },
    body => { body.frames[0].atMs = body.endMs + 1; },
    body => { body.frames[0].crop = { x: 0, y: 0, width: 1290, height: 720 }; },
    body => { body.frames[0].data = Buffer.alloc(1500001).toString('base64'); },
    body => { body.audio = Buffer.alloc(2100001).toString('base64'); },
  ];
  for (const mutate of invalid) {
    const f = await fixture(t);
    mutate(f.body);
    await f.save();
    await assert.rejects(runReplay({ ...f.options, execute: true }, {
      createHost: () => assert.fail('invalid corpus constructs no provider'),
    }), { code: 'TVLENS_MEDIA_BLOCK_INVALID' });
    await assert.rejects(fs.access(f.options.outputDir), { code: 'ENOENT' });
  }
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, 'body.json'), '{}');
  await assert.rejects(runReplay(f.options), { code: 'TVLENS_REPLAY_HASH_MISMATCH' });
});

test('preflight retains the product question length and HTTP body byte limits including extra fields', async t => {
  for (const length of [2000, 2001]) {
    const f = await fixture(t);
    f.scenario.questions[0].question = 'q'.repeat(length);
    await f.save();
    if (length === 2000) assert.equal((await runReplay(f.options)).complete, true);
    else await assert.rejects(runReplay(f.options), { code: 'TVLENS_REPLAY_QUESTION_INVALID' });
  }
  for (const excess of [0, 1]) {
    const f = await fixture(t);
    f.body.padding = '';
    f.body.padding = 'x'.repeat(13000000 - Buffer.byteLength(JSON.stringify(f.body)) + excess);
    await f.save();
    if (excess === 0) assert.equal((await runReplay(f.options)).complete, true);
    else await assert.rejects(runReplay(f.options), { code: 'TVLENS_REPLAY_BODY_TOO_LARGE' });
  }
});

test('the request floor and the last shortened rest stay bounded by the original block availability', async () => {
  for (const start of [29500, 29950]) {
    const clock = manualClock(), calls = [], entered = deferred();
    await clock.advance(start);
    const transport = createTransport({ clock: clock.io, writer: { save: async () => {} }, exchange: async (route, input) => {
      calls.push({ route, timeoutMs: input.timeoutMs, atMs: clock.io.now() });
      if (route === '/v1/session') return { status: 200, value: { id: 's', accepting: true } };
      entered.resolve();
      return start === 29950 ? new Promise(() => {}) : { status: 503, value: { code: 'media-unavailable' } };
    } });
    const entry = { plannedAtMs: 0, attempts: [] };
    let done = false;
    const pending = transport.deliver(entry, '{}', 's').then(() => { done = true; });
    await entered.promise;
    if (start === 29500) {
      await clock.advance(499);
      assert.equal(done, false);
      await clock.advance(1);
    } else await clock.advance(100);
    await pending;
    assert.equal(entry.status, 'expired');
    assert.deepEqual(calls.map(x => x.timeoutMs), start === 29950 ? [100, 100] : [500, 500]);
    assert.equal(entry.finishedAtMs, start === 29950 ? 30050 : 30000);
    assert.equal(calls.length, 2, 'no retry after expiry');
    assert.equal(clock.armed, 0);
  }
});

test('a held session check times out every five seconds without renewing the thirty second budget', async () => {
  const clock = manualClock(), calls = [];
  const transport = createTransport({ clock: clock.io, writer: { save: async () => {} }, exchange: (route, input) => {
    calls.push({ route, atMs: clock.io.now(), timeoutMs: input.timeoutMs });
    return new Promise(() => {});
  } });
  const entry = { plannedAtMs: 0, attempts: [] };
  const pending = transport.deliver(entry, '{}', 's');
  await clock.advance(30000);
  await pending;
  assert.equal(entry.status, 'expired');
  assert.deepEqual(calls.map(x => [x.route, x.atMs, x.timeoutMs]),
    [0, 6000, 12000, 18000, 24000].map(atMs => ['/v1/session', atMs, 5000]));
  assert.ok(entry.attempts.every(item => item.code === 'TVLENS_REPLAY_TIMEOUT'));
});

test('TV terminal refusals stop subsequent uploads and keep their exact reason', async t => {
  const cases = [
    [{ status: 200, value: { id: 'other', accepting: true } }, 'session-changed'],
    [{ status: 200, value: { accepting: false } }, 'session-changed'],
    [{ status: 507, value: {} }, 'storage-full'],
    [{ status: 503, value: { code: 'storage-full' } }, 'storage-full'],
    [{ status: 409, value: { code: 'read-only' } }, 'read-only'],
  ];
  for (const [response, code] of cases) {
    const f = await fixture(t);
    const stage = await accelerated(t, f, { dependencies: { exchange: (route, input, forward) =>
      route === '/v1/session' ? response : forward(route, input) } });
    await stage.clock.advance(1000);
    await until(() => stage.host.report.uploads[0].status === 'refused', 'terminal delivery refusal');
    await stage.clock.advance(2000);
    const report = await stage.pending;
    assert.deepEqual(report.uploads.map(item => [item.status, item.code]), [['refused', code], ['not-sent', code], ['not-sent', code]]);
    assert.equal(report.complete, false);
    assert.equal(report.questions[0].status, 'done');
  }
});

test('real session states and segment admission refusals stop later uploads with the storage or read-only reason', async t => {
  const { DiskGuard } = require('../adapters/disk-guard.cjs');
  for (const code of ['storage-full', 'read-only']) for (const at of ['/v1/session', '/v1/segments']) {
    const f = await fixture(t), responses = [];
    let free = 1000000000, checks = 0, changed = false;
    const guard = new DiskGuard({ path: f.root, minFreeBytes: 100, warnFreeBytes: 200, resumeMarginBytes: 0,
      freeBytes: async () => free });
    const stage = await accelerated(t, f, { runtimeOptions: { guard }, dependencies: {
      exchange: async (route, input, forward) => {
        if (route === '/v1/session') checks++;
        if (!changed && route === at && checks === 2) {
          changed = true;
          if (code === 'storage-full') {
            free = 0;
            await guard.check({ force: true });
          } else {
            const session = await forward('/v1/session', { ...input, raw: undefined });
            assert.equal((await forward('/v1/session/pause', { ...input, raw: '{}' })).status, 200);
            assert.equal((await forward('/v1/sessions/' + session.value.id + '/open', { ...input, raw: '{}' })).status, 200);
          }
        }
        const response = await forward(route, input);
        if (['/v1/session', '/v1/segments'].includes(route)) responses.push({ route, ...response });
        return response;
      },
    } });
    await stage.clock.advance(1000);
    await until(() => stage.host.report.uploads[0].status === 'accepted', 'first occurrence accepted before terminal change');
    await stage.clock.advance(1000);
    await until(() => stage.host.report.uploads[1].status === 'refused', 'real terminal refusal observed');
    await stage.clock.advance(1000);
    const report = await stage.pending, refusal = responses.at(-1);
    assert.deepEqual(report.uploads.map(item => [item.status, item.code ?? null]),
      [['accepted', null], ['refused', code], ['not-sent', code]]);
    assert.equal(report.complete, false);
    assert.equal(refusal.route, at);
    if (at === '/v1/session') {
      assert.equal(refusal.status, 200);
      assert.equal(refusal.value.id, report.sessionId);
      if (code === 'storage-full') assert.equal(refusal.value.storage.state, 'blocked');
      else assert.equal(refusal.value.readOnly, true);
      assert.deepEqual(report.uploads[1].attempts.map(item => item.route), ['/v1/session']);
    } else {
      assert.equal(refusal.status, code === 'storage-full' ? 507 : 409);
      assert.equal(refusal.value.code, code);
      assert.deepEqual(report.uploads[1].attempts.map(item => item.route), ['/v1/session', '/v1/segments']);
    }
    assert.equal(report.uploads[2].attempts.length, 0);
  }
});

test('delivery retries session then identical block on 408, 429, 5xx and network cuts from the original deadline', async () => {
  const clock = manualClock(), calls = [], failures = [408, 429, 503, 'cut'];
  const entry = { plannedAtMs: 0, status: 'planned', attempts: [] }, raw = '{"sequence":7,"sessionId":"s"}';
  const transport = createTransport({ clock: clock.io, writer: { save: async () => {} },
    exchange: async (route, input) => {
      calls.push({ route, raw: input.raw, atMs: clock.io.now(), timeoutMs: input.timeoutMs });
      if (route === '/v1/session') return { status: 200, value: { id: 's', accepting: true } };
      const next = failures.shift();
      if (next === 'cut') throw Error('coupure');
      return { status: next || 200, value: next ? { code: 'temporary' } : { id: 'moment-1', duplicate: true } };
    } });
  let finished = false;
  const pending = transport.deliver(entry, raw, 's').then(() => { finished = true; });
  for (let i = 0; i < 4 && !finished; i++) {
    await until(() => clock.armed || finished, 'retry sleep');
    if (!finished) await clock.advance(1000);
  }
  await pending;
  assert.equal(entry.status, 'accepted');
  assert.equal(entry.duplicate, true);
  assert.deepEqual(calls.map(call => call.route), Array.from({ length: 5 }, () => ['/v1/session', '/v1/segments']).flat());
  assert.deepEqual(calls.filter(call => call.route === '/v1/segments').map(call => [call.raw, call.atMs, call.timeoutMs]),
    [0, 1000, 2000, 3000, 4000].map(atMs => [raw, atMs, 5000]));
  assert.deepEqual(entry.attempts.filter(x => x.route === '/v1/segments').map(x => x.status), [408, 429, 503, null, 200]);
});

test('held analysis does not delay captures or questions and a late result cannot rewrite a timed out campaign', async t => {
  const f = await fixture(t), held = deferred(), entered = deferred();
  const stage = await accelerated(t, f, { analysis: { answer: input => { entered.resolve(input); return held.promise; }, close() {} } });
  await stage.clock.advance(1000);
  await entered.promise;
  for (let i = 1; i < 3; i++) {
    await stage.clock.advance(1000);
    await until(() => stage.host.report.uploads[i].status === 'accepted', 'capture continues with held analysis');
  }
  assert.equal(stage.host.report.questions[0].status, 'done');
  await stage.clock.advance(1000);
  const report = await stage.pending;
  assert.equal(report.complete, false);
  assert.equal(report.stopReason, 'final-timeout');
  assert.deepEqual(report.uploads.map(item => item.submittedAtMs), [1000, 2000, 3000]);
  assert.ok(report.remaining.some(item => item.kind === 'analysis'));
  assert.equal(report.uploads[0].roles.perception.status, 'running');
  const before = await fs.readFile(path.join(f.options.outputDir, 'campaign.json'), 'utf8');
  held.resolve(visual);
  await held.promise;
  await turns(5);
  assert.deepEqual(report, JSON.parse(before));
  assert.equal(await fs.readFile(path.join(f.options.outputDir, 'campaign.json'), 'utf8'), before);
});

test('help bypasses scenario reads and validation remains the CLI default', async t => {
  const { main } = require('../scripts/local-stream-cli.cjs');
  let output = '';
  const io = { stdout: { write: value => { output += value; } }, stderr: { write: value => { output += value; } } };
  assert.equal(await main(['--help'], () => assert.fail('help must not invoke runner'), io), 0);
  assert.match(output, /--execute/);
  const f = await fixture(t);
  output = '';
  assert.equal(await main(['--scenario', f.options.scenarioPath, '--out', f.options.outputDir], runReplay, io), 0);
  assert.match(output, /validation/);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.options.outputDir, 'campaign.json'))).mode, 'validation');
});

test('a separate overload schedule retains one active and five waiting questions and records the product refusal', async t => {
  const f = await fixture(t), held = deferred();
  f.scenario.kind = 'overload';
  f.scenario.questions = Array.from({ length: 8 }, (_, i) => ({ id: 'burst-' + i, atMs: 1500, question: 'Question ' + i + ' ?' }));
  const stage = await accelerated(t, f, { runtimeOptions: { agent: {
    identity: { kind: 'codex', model: 'doubled', transport: 'injected' }, answer: () => held.promise, close() {},
  } } });
  await stage.clock.advance(1500);
  await until(() => stage.host.report.questions.every(item => item.status !== 'planned' && item.status !== 'submitting'), 'all burst outcomes');
  const jobs = stage.host.report.questions;
  assert.equal(jobs.filter(item => item.status === 'running').length, 1);
  assert.equal(jobs.filter(item => item.status === 'queued').length, 5);
  assert.deepEqual(jobs.filter(item => item.status === 'refused').map(item => item.code), ['question-queue-full', 'question-queue-full']);
  assert.ok(jobs.every(item => item.anchorMs === 1500));
  await stage.clock.advance(2500);
  const report = await stage.pending;
  assert.equal(report.status, 'incomplete');
  assert.equal(report.remaining.filter(item => item.kind === 'question').length, 6);
  assert.equal(report.questions.filter(item => item.status === 'cancelled').length, 6);
  assert.equal(report.questions.filter(item => item.called.exercised).length, 1);
  assert.ok(report.questions.every(item => item.effectiveBackend.configured === 'codex'));
  held.resolve(answer);
  await turns(3);
  assert.equal(report.questions.filter(item => item.status === 'done').length, 0);
});

test('cancellation while upload transport is held cannot turn a late question answer into success', async t => {
  const f = await fixture(t), heldUpload = deferred(), heldAnswer = deferred(), entered = deferred(), delivered = deferred();
  f.scenario.questions[0].cancelAtMs = 1800;
  let held = false;
  const stage = await accelerated(t, f, { runtimeOptions: { agent: {
    identity: { kind: 'codex' }, answer: async input => {
      entered.resolve(input);
      const result = await heldAnswer.promise;
      delivered.resolve();
      return result;
    }, close() {},
  } }, dependencies: { exchange: async (route, input, forward) => {
    const response = await forward(route, input);
    if (route === '/v1/segments' && !held) { held = true; await heldUpload.promise; }
    return response;
  } } });
  await stage.clock.advance(1500);
  const request = await entered.promise;
  await stage.clock.advance(300);
  await until(() => stage.host.report.questions[0].cancellation.status === 'acknowledged', 'cancellation acknowledged over HTTP');
  assert.equal(request.signal.aborted, true);
  heldAnswer.resolve(answer);
  await delivered.promise;
  const state = await stage.host.exchange('/v1/state', {});
  assert.equal(stage.finished, false, 'the late answer arrives before the campaign ends');
  assert.equal(stage.host.report.shutdown, null, 'the observer is still attached');
  const job = state.value.chat.jobs.find(item => item.id === stage.host.report.questions[0].jobId);
  assert.equal(job.status, 'cancelled');
  assert.equal(job.result, null);
  assert.equal(stage.host.report.questions[0].status, 'cancelled');
  assert.equal(stage.host.report.questions[0].result, null);
  await stage.clock.advance(2200);
  const report = await stage.pending;
  assert.equal(report.questions[0].status, 'cancelled');
  assert.equal(report.questions[0].result, null);
  assert.equal(report.uploads[0].status, 'unfinished');
  assert.ok(report.remaining.some(item => item.kind === 'upload'));
  const before = await fs.readFile(path.join(f.options.outputDir, 'campaign.json'), 'utf8');
  heldAnswer.resolve(answer);
  heldUpload.resolve();
  await turns(5);
  assert.deepEqual(report, JSON.parse(before));
  assert.equal(await fs.readFile(path.join(f.options.outputDir, 'campaign.json'), 'utf8'), before);
});

test('a refused provider release is preserved separately from a confirmed archive', async t => {
  const f = await fixture(t);
  const stage = await accelerated(t, f, { analysis: { answer: async () => visual,
    close() { throw Object.assign(Error('Libération GPU refusée.'), { code: 'GPU_BUSY' }); } } });
  for (let i = 0; i < 3; i++) {
    await stage.clock.advance(1000);
    await until(() => stage.host.report.uploads[i].status === 'accepted', 'accepted before close');
  }
  const report = await stage.pending;
  assert.equal(report.shutdown.archiveConfirmed, true);
  assert.equal(report.shutdown.releaseConfirmed, false);
  assert.match(JSON.stringify(report.shutdown.errors), /Libération GPU refusée/);
  assert.equal(report.complete, false);
});

test('a lost acknowledgement retries the identical occurrence and HTTP deduplication keeps the next occurrence distinct', async t => {
  const f = await fixture(t), bodies = [];
  const stage = await accelerated(t, f, { dependencies: { exchange: async (route, input, forward) => {
    if (route === '/v1/segments') bodies.push(input.raw);
    const response = await forward(route, input);
    if (route === '/v1/segments' && bodies.length === 1) throw Error('Accusé perdu.');
    return response;
  } } });
  await stage.clock.advance(1000);
  await until(() => bodies.length === 1 && stage.host.report.uploads[0].attempts.at(-1)?.code === 'network-cut', 'first acknowledgement lost');
  await stage.clock.advance(1000);
  await until(() => stage.host.report.uploads[0].status === 'accepted' && stage.host.report.uploads[1].status === 'accepted', 'retry and next occurrence');
  await stage.clock.advance(1000);
  const report = await stage.pending;
  assert.equal(report.uploads[0].duplicate, true);
  const repeated = bodies.filter(raw => JSON.parse(raw).sequence === 0);
  assert.equal(repeated.length, 2);
  assert.equal(repeated[0], repeated[1]);
  const next = JSON.parse(bodies.find(raw => JSON.parse(raw).sequence === 1));
  assert.deepEqual([next.startMs, next.endMs, next.frames[0].atMs], [1000, 2000, 1000]);
  assert.notEqual(report.uploads[0].id, report.uploads[1].id);
  assert.equal(report.uploads[0].bodySha256, sha256(repeated[0]));
  assert.equal(await fs.readFile(path.join(f.options.outputDir, report.uploads[0].bodyPath), 'utf8'), repeated[0]);
});

test('scenarios cannot change product question deadlines to make the campaign finish', async t => {
  const f = await fixture(t);
  f.scenario.config.questionTimeoutMs = 10;
  await f.save();
  await assert.rejects(runReplay(f.options), { code: 'TVLENS_REPLAY_CONFIG_INVALID' });
});

test('roles that were disabled or not exercised never become a local measurement', async t => {
  const f = await fixture(t);
  const stage = await accelerated(t, f);
  for (let i = 0; i < 3; i++) {
    await stage.clock.advance(1000);
    await until(() => stage.host.report.uploads[i].status === 'accepted', 'capture accepted');
  }
  const report = await stage.pending;
  assert.equal(report.roles.inspection.localMeasurement, false);
  assert.equal(report.roles.embeddings.localMeasurement, false);
  assert.equal(report.roles.surveillance.localMeasurement, false);
  assert.equal(report.roles.transcription.localMeasurement, false);
  assert.equal(report.roles.perception.localMeasurement, false);
  assert.equal(report.roles.questions.localMeasurement, false);
});

async function fakeOllama(t, handler) {
  const calls = [];
  const server = require('node:http').createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk)).on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks));
      calls.push({ route: req.url, body, authorization: req.headers.authorization });
      if (handler?.(body, res, req.url)) return;
      res.end(JSON.stringify({ model: body.model, message: { content: JSON.stringify(body.model === 'vision-fixture' ? visual : answer) } }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { url: 'http://127.0.0.1:' + server.address().port, calls };
}

test('production perception and questions use only the explicitly selected fake Ollama and record actual identities', async t => {
  const f = await fixture(t), ollama = await fakeOllama(t);
  f.scenario.config.localVlm.url = ollama.url;
  f.scenario.config.localQuestions.url = ollama.url;
  const stage = await accelerated(t, f, { perceptionBackend: 'local', questionsBackend: 'local',
    runtimeOptions: { overrides: {}, agent: undefined } });
  for (let i = 0; i < 3; i++) {
    await stage.clock.advance(1000);
    await until(() => stage.host.report.uploads[i].roles.perception?.status === 'returned', 'production visual result');
  }
  const report = await stage.pending;
  assert.equal(report.complete, true);
  assert.equal(report.reference, null);
  assert.equal(report.roles.perception.localMeasurement, true);
  assert.equal(report.roles.questions.localMeasurement, true);
  assert.equal(report.roles.inspection.exercised, false);
  assert.equal(report.roles.inspection.localMeasurement, false);
  assert.equal(report.roles.embeddings.exercised, false);
  assert.equal(report.roles.surveillance.exercised, false);
  assert.equal(report.questions[0].metrics.backend.identity.kind, 'ollama');
  assert.equal(report.questions[0].metrics.backend.identity.transport, 'http');
  assert.match(report.roles.questions.web, /indisponible/);
  assert.equal(report.questions[0].metrics.calls.providerRequests, 1);
  assert.equal(ollama.calls.filter(call => call.body.model === 'vision-fixture').length, 3);
  assert.equal(ollama.calls.filter(call => call.body.model === 'questions-fixture').length, 1);
  assert.ok(report.uploads.every(item => item.roles.perception.identity.kind === 'ollama'));
});

test('a local question outage keeps its backend and never falls back to Codex or OpenRouter', async t => {
  const f = await fixture(t), ollama = await fakeOllama(t, (body, res) => {
    if (body.model !== 'questions-fixture') return false;
    res.writeHead(503); res.end('{}'); return true;
  });
  f.scenario.config.localQuestions.url = ollama.url;
  const stage = await accelerated(t, f, { questionsBackend: 'local', runtimeOptions: { agent: undefined,
    CodexAgent: class { constructor() { assert.fail('no fallback Codex agent'); } } } });
  for (let i = 0; i < 3; i++) {
    await stage.clock.advance(1000);
    await until(() => stage.host.report.uploads[i].status === 'accepted', 'capture unaffected by question failure');
  }
  const report = await stage.pending;
  assert.equal(report.questions[0].status, 'error');
  assert.equal(report.questions[0].metrics.backend.configured, 'local');
  assert.equal(report.questions[0].metrics.backend.identity.kind, 'ollama');
  assert.equal(report.questions[0].metrics.calls.providerRequests, 1);
  assert.equal(report.roles.embeddings.identity.backend, 'disabled');
  assert.equal(ollama.calls.length, 1);
});

test('local measurement rejects visual results missing Ollama metrics and unknown local question identities', async t => {
  const f = await fixture(t);
  const stage = await accelerated(t, f, { perceptionBackend: 'local' });
  for (let i = 0; i < 3; i++) {
    await stage.clock.advance(1000);
    await until(() => stage.host.report.uploads[i].status === 'accepted', 'upload accepted despite invalid measurement identity');
    if (i < 2) {
      await until(() => ['ready', 'error'].includes(stage.host.runtime.snapshot().session?.segments[i]?.visionStatus),
        'visual result published despite invalid measurement identity');
      const passage = stage.host.runtime.snapshot().session.segments[i];
      assert.equal(passage.visionStatus, 'ready');
      assert.equal(passage.observation.summary, visual.summary);
      assert.equal(stage.host.report.uploads[i].roles.perception.status, 'returned');
    }
  }
  const report = await stage.pending;
  assert.equal(report.complete, false);
  assert.ok(report.guardFailures.some(item => item.code === 'TVLENS_REPLAY_PERCEPTION_IDENTITY_INVALID'));
  assert.equal(report.roles.perception.localMeasurement, false);
  const other = await fixture(t);
  const rejected = await accelerated(t, other, { questionsBackend: 'local' });
  const refused = await rejected.pending;
  assert.equal(refused.error.code, 'TVLENS_REPLAY_QUESTIONS_IDENTITY_INVALID');
  assert.equal(refused.uploads.filter(item => item.attempts.length > 0).length, 0);
  assert.ok(refused.uploads.every(item => item.status === 'not-sent'));
});

test('a transcription language mismatch disqualifies measurement while preserving the provider call and transcript', async t => {
  const f = await fixture(t);
  let changed = false;
  const stage = await accelerated(t, f, { dependencies: { exchange: async (route, input, forward) => {
    if (route === '/v1/segments' && !changed) {
      changed = true;
      const setting = await forward('/v1/settings/transcription', { ...input, raw: JSON.stringify({ language: 'en' }) });
      assert.equal(setting.status, 200);
    }
    return forward(route, input);
  } } });
  await stage.clock.advance(1000);
  await until(() => ['ready', 'error'].includes(stage.host.runtime.snapshot().session?.segments[0]?.audioStatus),
    'transcription published despite a language mismatch');
  const passage = stage.host.runtime.snapshot().session.segments[0];
  assert.equal(passage.audioStatus, 'ready');
  assert.equal(passage.observation.transcript, 'Paroles françaises.');
  assert.equal(stage.host.report.uploads[0].roles.transcription.status, 'returned');
  for (let i = 1; i < 3; i++) {
    await stage.clock.advance(1000);
    await until(() => stage.host.report.uploads[i].status === 'accepted', 'capture continues after language mismatch');
  }
  const report = await stage.pending;
  assert.equal(report.complete, false);
  assert.ok(report.guardFailures.some(item => item.code === 'TVLENS_REPLAY_TRANSCRIPTION_LANGUAGE_MISMATCH' && item.upload === 0));
});

test('each excerpt selects its declared transcription language over HTTP before its first upload and records the effective setting', async t => {
  const f = await fixture(t), order = [];
  f.scenario.clips[0].language = 'en';
  f.scenario.clips[1].language = 'fr';
  f.scenario.clips[2].language = 'auto';
  const stage = await accelerated(t, f, { dependencies: { exchange: (route, input, forward) => {
    if (route === '/v1/settings/transcription' || route === '/v1/segments') order.push([route, JSON.parse(input.raw)]);
    return forward(route, input);
  } } });
  for (let i = 0; i < 3; i++) {
    await stage.clock.advance(1000);
    await until(() => stage.host.report.uploads[i].roles.transcription?.status === 'returned', 'declared language transcribed');
  }
  const report = await stage.pending;
  assert.deepEqual(report.uploads.map(item => item.roles.transcription.language), ['en', 'fr', 'auto']);
  let current;
  for (const [route, body] of order) {
    if (route === '/v1/settings/transcription') current = body.language;
    else assert.equal(current, report.uploads[body.sequence].language);
  }
  assert.ok(report.languages.every(item => item.status === 'set'));
});

test('a declared selection from perception media retains original frame indices and data URL fingerprints', async t => {
  const f = await fixture(t);
  await fs.cp(path.resolve(__dirname, '../scripts/fixtures/perception-replay'), path.join(f.root, 'source'), { recursive: true });
  const media = JSON.parse(await fs.readFile(path.join(f.root, 'source/media.json')));
  const indices = [0, 1, 3, 5, 7];
  Object.assign(f.body, { startMs: media.startMs, endMs: media.endMs,
    frames: indices.map(index => ({ atMs: media.frames[index].atMs, data: media.frames[index].dataUrl.split(',')[1] })) });
  delete f.body.audio;
  f.index.blocks[0].perception = { manifest: { path: 'source/manifest.json',
    sha256: sha256(await fs.readFile(path.join(f.root, 'source/manifest.json'))) }, caseId: 'capture-documentee', frameIndices: indices };
  f.scenario.plannedDurationMs = 24000;
  f.scenario.clips.forEach((clip, i) => { clip.atMs = i * 8000; });
  await f.save();
  const report = await runReplay(f.options);
  assert.deepEqual(report.uploads[0].input.frames.map(frame => frame.index), indices);
  assert.deepEqual(report.uploads[0].input.frames.map(frame => frame.sha256), indices.map(index => sha256(media.frames[index].dataUrl)));
  assert.equal(report.uploads[0].input.perception.caseId, 'capture-documentee');
});

test('a bounded unconfirmed close keeps its diagnostic and late closure cannot rewrite campaign outputs', async t => {
  const f = await fixture(t), closing = deferred(), release = deferred();
  const stage = await accelerated(t, f, { analysis: { answer: async () => visual, reset() {}, close: async () => {
    closing.resolve();
    await release.promise;
    throw Error('Libération tardive refusée.');
  } } });
  for (let i = 0; i < 3; i++) {
    await stage.clock.advance(1000);
    await until(() => stage.host.report.uploads[i].status === 'accepted', 'accepted before held closure');
  }
  await closing.promise;
  await stage.clock.advance(1000);
  const report = await stage.pending;
  assert.equal(report.complete, false);
  assert.equal(report.shutdown.archiveConfirmed, false);
  assert.equal(report.shutdown.releaseConfirmed, false);
  assert.equal(report.shutdown.errors[0].code, 'TVLENS_REPLAY_TIMEOUT');
  const before = await fs.readFile(path.join(f.options.outputDir, 'campaign.json'), 'utf8');
  release.resolve();
  await stage.host.runtime.close();
  await turns(3);
  assert.deepEqual(report, JSON.parse(before));
});

test('video preparation bodies validate directly with their actual source duration and conversion parameters', async t => {
  const f = await fixture(t);
  const jpeg = await require('sharp')({ create: { width: 32, height: 32, channels: 3, background: 'blue' } }).jpeg().toBuffer();
  await fs.writeFile(path.join(f.root, 'frame.jpg'), jpeg);
  const file = path.join(f.root, 'source.mp4'), binary = path.join(f.root, 'ffmpeg-double');
  await fs.writeFile(file, 'fichier vidéo doublé');
  await fs.writeFile(binary, String.raw`#!${process.execPath}
const fs = require('node:fs'), path = require('node:path'), args = process.argv.slice(2);
if (args.includes('null')) process.stderr.write('ffmpeg version fixture\nDuration: 00:00:02.000\nStream #0:0: Video: fixture\nOutput #0\n');
else fs.copyFileSync(path.join(__dirname, 'frame.jpg'), args.at(-1));
`, { mode: 0o700 });
  const prepared = path.join(f.root, 'prepared');
  const { convertVideo } = require('../adapters/media/video-file-source.cjs');
  const state = await convertVideo({ file, outputDir: prepared, startMs: 0, durationMs: 1800000,
    blockMs: 1000, framesPerBlock: 2, jpegQuality: 3 }, { config: { ffmpeg: binary } });
  const indexRaw = await fs.readFile(path.join(prepared, 'blocks.json'));
  const preparationRaw = await fs.readFile(path.join(prepared, 'preparation.json'));
  f.scenario.index = { path: 'prepared/blocks.json', sha256: sha256(indexRaw) };
  f.scenario.provenance = { kind: 'converted-video', reference: 'Vidéo doublée, durée réelle de deux secondes.',
    preparation: { path: 'prepared/preparation.json', sha256: sha256(preparationRaw) } };
  f.scenario.plannedDurationMs = state.convertedDurationMs;
  f.scenario.clips = [0, 1].map(i => ({ id: 'video-' + i, block: i, occurrence: 0, atMs: i * 1000, language: 'en' }));
  await fs.writeFile(f.options.scenarioPath, JSON.stringify(f.scenario));
  const before = await fs.readFile(path.join(prepared, 'blocks/000000/body.json'));
  const report = await runReplay(f.options, { createHost: () => assert.fail('validation uses no provider') });
  assert.equal(report.complete, true);
  assert.equal(report.provenance.preparation.convertedDurationMs, 2000);
  assert.equal(report.provenance.preparation.source.sha256, sha256(await fs.readFile(file)));
  assert.equal(report.provenance.preparation.parameters.durationMs, 1800000);
  assert.equal(report.uploads.length, 2);
  assert.deepEqual(await fs.readFile(path.join(prepared, 'blocks/000000/body.json')), before);
});

test('interruption preserves completed outputs and explicitly retains all future scheduled items', async t => {
  const f = await fixture(t), controller = new AbortController();
  const stage = await accelerated(t, f, { signal: controller.signal });
  await stage.clock.advance(1000);
  await until(() => stage.host.report.uploads[0].status === 'accepted', 'first output available before interruption');
  controller.abort(Object.assign(Error('Arrêt piloté.'), { code: 'TVLENS_REPLAY_CANCELLED' }));
  const report = await stage.pending;
  assert.equal(report.status, 'incomplete');
  assert.equal(report.stopReason, 'interrupted');
  assert.deepEqual(report.uploads.map(item => item.status), ['accepted', 'not-sent', 'not-sent']);
  assert.equal(report.questions[0].status, 'not-sent');
  assert.equal(report.remaining.filter(item => item.kind === 'upload').length, 2);
  assert.equal(report.remaining.filter(item => item.kind === 'question').length, 1);
  await fs.access(path.join(f.options.outputDir, report.uploads[0].bodyPath));
  assert.equal(stage.clock.armed, 0);
});

test('a question retains the actual local embedding and inspection roles independently of the doubled Codex question backend', async t => {
  const f = await fixture(t), ollama = await fakeOllama(t, (body, res, route) => {
    if (route === '/api/embed') {
      res.end(JSON.stringify({ model: body.model, embeddings: body.input.map(() => [1, 0, 0]) }));
    } else res.end(JSON.stringify({ message: { content: JSON.stringify({ observations: [
      { id: 'moment-1', startMs: 0, endMs: 1000, text: 'Un plan bleu.', basis: 'images' },
    ], hypotheses: [], limits: [] }) } }));
    return true;
  });
  const jpeg = await require('sharp')({ create: { width: 32, height: 32, channels: 3, background: 'blue' } }).jpeg().toBuffer();
  f.body.frames[0].data = jpeg.toString('base64');
  f.scenario.config.embeddingsBackend = 'local';
  f.scenario.config.localEmbeddings = { url: ollama.url, model: 'vectors-fixture' };
  f.scenario.config.localVlm.url = ollama.url;
  f.scenario.config.backgroundIndex = false;
  const decoder = path.join(f.root, 'decoder-double');
  await fs.writeFile(decoder, `#!${process.execPath}\nprocess.exit(1);\n`, { mode: 0o700 });
  const stage = await accelerated(t, f, { dependencies: { config: { ffmpeg: decoder } }, runtimeOptions: {
    agent: { identity: { kind: 'codex', model: 'doubled', transport: 'injected' }, close() {}, answer: async ({ tools }) => {
      await tools.call('search_moments', { query: 'Paroles françaises' });
      await tools.call('inspect_clip', { startMs: 0, endMs: 1000, question: 'Quel plan ?' });
      return { ...answer, kind: 'observation', citations: [{ id: 'moment-1', startMs: 0, endMs: 1000 }] };
    } },
  } });
  await stage.clock.advance(1000);
  await until(() => stage.host.report.uploads[0].roles.perception?.status === 'returned', 'evidence ready before tool question');
  await stage.clock.advance(500);
  await until(() => ['done', 'error'].includes(stage.host.report.questions[0].status), 'question tool outcome');
  assert.equal(stage.host.report.questions[0].status, 'done', JSON.stringify(stage.host.report.questions[0].error));
  await stage.clock.advance(500);
  await until(() => stage.host.report.uploads[1].status === 'accepted', 'second occurrence accepted before next deadline');
  await stage.clock.advance(1000);
  await until(() => stage.host.report.uploads[2].status === 'accepted', 'last occurrence accepted');
  const report = await stage.pending;
  assert.equal(report.roles.inspection.localMeasurement, true);
  assert.equal(report.roles.embeddings.localMeasurement, true);
  assert.equal(report.questions[0].metrics.backend.identity.kind, 'codex');
  assert.equal(report.questions[0].metrics.inspection.backend, 'ollama');
  assert.equal(report.questions[0].metrics.inspection.modelCalled, true);
  assert.equal(report.questions[0].roles?.embeddings?.identity?.backend, 'ollama');
  assert.equal(report.questions[0].roles.embeddings.mode, 'hybrid');
  assert.ok(ollama.calls.some(call => call.route === '/api/embed'));
});

test('an unacknowledged question remains unfinished when the campaign ends and its late transport reply is ignored', async t => {
  const f = await fixture(t), held = deferred();
  const stage = await accelerated(t, f, { dependencies: { exchange: async (route, input, forward) => {
    const response = await forward(route, input);
    if (route === '/v1/questions') await held.promise;
    return response;
  } } });
  for (let i = 0; i < 3; i++) {
    await stage.clock.advance(1000);
    await until(() => stage.host.report.uploads[i].status === 'accepted', 'capture independent of held question acknowledgement');
  }
  await stage.clock.advance(1000);
  const report = await stage.pending;
  assert.equal(report.questions[0].status, 'unfinished');
  assert.equal(report.questions[0].acknowledgementUnknown, true);
  const before = JSON.stringify(report);
  held.resolve();
  await turns(3);
  assert.equal(JSON.stringify(report), before);
});

test('documented nominal and overload examples validate without providers and retain separate question schedules', async t => {
  const f = await fixture(t), reports = [];
  for (const name of ['nominal', 'overload']) {
    const scenarioPath = path.resolve(__dirname, '../scripts/fixtures/local-stream/' + name + '.json');
    const report = await runReplay({ scenarioPath, outputDir: path.join(f.root, name) }, {
      createHost: () => assert.fail('documented validation must construct no host'),
    });
    assert.equal(report.complete, true);
    assert.equal(report.provenance.kind, 'looped-corpus');
    assert.equal(report.uploads[0].input.frames.length, 5);
    reports.push(report);
  }
  assert.deepEqual(reports[0].plannedInterval, { startMs: 0, endMs: 1800000 });
  assert.equal(reports[0].questions.length, 12);
  assert.equal(reports[0].questions.filter(item => item.plannedAtMs === 900000).length, 3);
  assert.equal(reports[1].parameters.kind, 'overload');
  assert.equal(reports[1].questions.length, 8);
  const { execFile } = require('node:child_process');
  const { promisify } = require('node:util');
  const execute = promisify(execFile), cli = path.resolve(__dirname, '../scripts/replay-local-stream.cjs');
  assert.match((await execute(process.execPath, [cli, '--help'])).stdout, /--execute/);
  const result = await execute(process.execPath, [cli, '--scenario', f.options.scenarioPath, '--out', f.options.outputDir]);
  assert.match(result.stdout, /validation/);
});

test('backend omissions, unknown CLI flags, missing languages and undeclared loops refuse before execution', async t => {
  const mutations = [
    scenario => { delete scenario.config.questionsBackend; },
    scenario => { scenario.config.perceptionBackend = 'automatic'; },
    scenario => { delete scenario.clips[0].language; },
    scenario => { scenario.provenance.kind = 'tvlens-capture'; },
    scenario => { scenario.questions[0].atMs = -1; },
  ];
  for (const mutate of mutations) {
    const f = await fixture(t);
    mutate(f.scenario);
    await f.save();
    await assert.rejects(runReplay({ ...f.options, execute: true }, {
      createHost: () => assert.fail('invalid scenario constructs no provider'),
    }), error => error.code?.startsWith('TVLENS_REPLAY_'));
  }
  const { main } = require('../scripts/local-stream-cli.cjs');
  for (const args of [[], ['--scenario', 'missing', '--out', 'new', '--execute', '--validate'], ['--unknown']]) {
    let stderr = '';
    const code = await main(args, () => assert.fail('invalid CLI must not invoke replay'), {
      stdout: { write() {} }, stderr: { write: value => { stderr += value; } },
    });
    assert.equal(code, 1);
    assert.match(stderr, /TVLENS_REPLAY_CLI_INVALID/);
  }
});

test('local selections preserve imported authentication without copying credentials into campaign outputs', async t => {
  const f = await fixture(t), ollama = await fakeOllama(t);
  f.scenario.config.localVlm.url = ollama.url;
  f.scenario.config.localQuestions.url = ollama.url;
  const stage = await accelerated(t, f, { perceptionBackend: 'local', questionsBackend: 'local',
    runtimeOptions: { overrides: {}, agent: undefined }, dependencies: { config: {
      localVlm: { token: 'vision-secret-fixture' }, localQuestions: { token: 'questions-secret-fixture' },
    } } });
  for (let i = 0; i < 3; i++) {
    await stage.clock.advance(1000);
    await until(() => stage.host.report.uploads[i].roles.perception?.status === 'returned', 'authenticated local visual result');
  }
  const report = await stage.pending;
  assert.equal(ollama.calls.find(call => call.body.model === 'vision-fixture').authorization, 'Bearer vision-secret-fixture');
  assert.equal(ollama.calls.find(call => call.body.model === 'questions-fixture').authorization, 'Bearer questions-secret-fixture');
  assert.doesNotMatch(JSON.stringify(report), /secret-fixture/);
});

test('exercised surveillance retains its provider origin and call count after session reset during closure', async t => {
  const f = await fixture(t);
  f.scenario.surveillance = { instruction: 'Signale les affirmations discutées.' };
  let calls = 0;
  const stage = await accelerated(t, f, { runtimeOptions: { surveillanceAgent: {
    close() {}, reset() {}, detect: async () => { calls++; return { claims: [] }; }, verify: async () => ({ verdicts: [] }),
  } } });
  for (let i = 0; i < 3; i++) {
    await stage.clock.advance(1000);
    await until(() => stage.host.report.uploads[i].roles.perception?.status === 'returned', 'surveilled visual result');
    stage.host.runtime.tick();
  }
  const report = await stage.pending;
  assert.ok(calls > 0);
  assert.equal(report.roles.surveillance.exercised, true);
  assert.ok(report.roles.surveillance.calls > 0);
  assert.equal(report.roles.surveillance.origin, 'injected');
  assert.equal(report.roles.surveillance.localMeasurement, false);
});
