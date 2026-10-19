const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
const { RemoteServer } = require('../server/http.cjs');
const { deferred } = require('./helpers/wait.cjs');
const token = 'b'.repeat(64);

async function fixture(t, { media, runtimeOptions = {}, logError } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-ingest-path-'));
  let clock = 0;
  const runtime = new HeadlessRuntime({ userData: dir, sessionsRoot: path.join(dir, 'sessions'), config: {}, selectedModels: { observationModel: 'test', inspectionModel: 'test', codexModel: 'test' },
    smoke: true, agent: { answer: async () => ({ answer: 'ok', kind: 'explanation', citations: [], limits: [] }) }, readClock: () => clock, ...runtimeOptions });
  const assembled = media || { assemble: async x => ({ ...x, clip: Buffer.from('fixture'), frames: [{ atMs: x.startMs, dataUrl: 'data:image/jpeg;base64,YQ==' }], audio: null, ingest: { assembleMs: 37 } }) };
  const server = await new RemoteServer({ runtime, media: assembled, token, logError }).listen(0, '127.0.0.1');
  t.after(async () => { await server.close(); await runtime.close(); await fs.rm(dir, { recursive: true, force: true }); });
  const req = async (route, body, method) => {
    const res = await fetch(server.url + route, { method: method || (body ? 'POST' : 'GET'), headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, headers: res.headers, value: res.status === 204 ? null : await res.json() };
  };
  return { runtime, server, req, setClock: value => { clock = value; } };
}

test('preflight replies can be reused by the panel instead of preceding every poll', async t => {
  const f = await fixture(t);
  const res = await fetch(f.server.url + '/v1/state', { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-max-age'), '600');
  assert.equal(res.headers.get('access-control-allow-origin'), 'null');
  assert.match(res.headers.get('access-control-allow-headers'), /Authorization/);
  // The panel revalidates the state it already holds: the conditional header must pass the same preflight.
  assert.match(res.headers.get('access-control-allow-headers'), /If-None-Match/);
});

test('the time spent preparing a remote block reaches the passage timeline, and arrival is stamped on the session clock', async t => {
  const f = await fixture(t);
  const session = (await f.req('/v1/session/start', {})).value;
  f.setClock(9000);
  const sent = await f.req('/v1/segments', { sessionId: session.id, sequence: 1, startMs: 0, endMs: 8000, frames: [{ atMs: 0, data: 'YQ==' }] });
  assert.equal(sent.status, 200);
  const passage = (await f.req('/v1/state')).value.session.segments[0];
  assert.deepEqual(passage.ingest, { assembleMs: 37 });
  assert.equal(passage.receivedMs, 9000);
  assert.equal(passage.receivedMs - passage.endMs, 1000, 'close-to-arrival delay is separable from queue wait and compute');
});

test('the server publishes both default smoke lanes and their observations through HTTP ingestion', async t => {
  const f = await fixture(t, { media: { assemble: async input => ({
    ...input, clip: Buffer.from('fixture'), audio: new Uint8Array([1]),
    frames: [{ atMs: input.startMs, dataUrl: 'data:image/jpeg;base64,YQ==' }],
  }) } });
  const finished = deferred(), published = [];
  f.runtime.listeners.add(state => {
    const passage = state.session?.segments[0];
    if (!passage) return;
    published.push(structuredClone(passage));
    if (['ready', 'error'].includes(passage.visionStatus) || ['ready', 'error'].includes(passage.status)) finished.resolve();
  });
  const session = (await f.req('/v1/session/start', {})).value;
  f.setClock(8000);
  const sent = await f.req('/v1/segments', {
    sessionId: session.id, sequence: 1, startMs: 0, endMs: 8000, frames: [{ atMs: 0, data: 'YQ==' }], audio: 'AQ==',
  });
  assert.equal(sent.status, 200);
  await finished.promise;
  const state = (await f.req('/v1/state')).value.session;
  const passage = state.segments[0];
  assert.deepEqual(passage.observation, {
    transcript: 'Un cercle se déplace sur un fond bleu.', audio: 'Audio reçu.', uncertainty: '',
    summary: 'Un cercle se déplace sur un fond bleu.', visual: '1 images reçues.',
  });
  assert.deepEqual([passage.id, passage.startMs, passage.endMs, passage.status, passage.audioStatus, passage.visionStatus],
    ['moment-1', 0, 8000, 'ready', 'ready', 'ready']);
  assert.ok(published.some(p => p.audioStatus === 'ready' && p.visionStatus === 'queued' && !p.observation.summary));
  assert.equal(state.apiCost, 0);
});

function soundWav(sampleCount = 16000) {
  const rate = 16000, bytesPerSample = 2;
  const wav = Buffer.alloc(44 + sampleCount * bytesPerSample);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * bytesPerSample, 28);
  wav.writeUInt16LE(bytesPerSample, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  for (let i = 0; i < sampleCount; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / rate) * 8000), 44 + i * 2);
  return wav;
}

test('HTTP ingestion keeps a declared sound-only passage and a decodable Opus replay without vision or thumbnails', { timeout: 10000 }, async t => {
  const { RemoteMedia } = require('../adapters/remote-media.cjs');
  const f = await fixture(t, { media: new RemoteMedia() });
  const session = (await f.req('/v1/session/start', {})).value;
  const vision = t.mock.method(f.runtime.session.perception, 'observeVisual');
  const thumbnails = t.mock.method(f.runtime.session.thumbnails, 'put');
  const finished = deferred();
  f.runtime.listeners.add(state => {
    if (state.session?.segments[0]?.status === 'ready') finished.resolve();
  });
  f.setClock(1000);
  const body = { sessionId: session.id, sequence: 1, startMs: 0, endMs: 1000,
    frames: [], audio: soundWav().toString('base64'), media: { video: false, audio: true } };
  const sent = await f.req('/v1/segments', body);
  assert.deepEqual(sent.value, { id: 'moment-1', duplicate: false });
  assert.equal(sent.status, 200);
  await finished.promise;
  const view = f.runtime.session.memory.view(), passage = view.passages[0];
  assert.deepEqual([passage.id, passage.status, passage.audioStatus, passage.visionStatus], ['moment-1', 'ready', 'ready', 'absent']);
  assert.deepEqual(passage.modalities, { audio: 'present', images: 'absent', video: 'absent' });
  assert.equal(passage.observation.transcript, 'Un cercle se déplace sur un fond bleu.');
  assert.equal(passage.thumbnailAvailable, false);
  assert.equal(view.losses.imagesAbsent, 1);
  assert.deepEqual([vision.mock.callCount(), thumbnails.mock.callCount()], [0, 0]);
  const stored = await f.runtime.session.store.read(sent.value.id);
  assert.deepEqual(stored.frames, []);
  assert.equal(stored.audio.toString('ascii', 0, 4), 'RIFF');
  assert.equal(stored.audio.readUInt16LE(22), 1);
  assert.equal(stored.audio.readUInt32LE(24), 16000);
  const release = await f.runtime.session.store.lease([sent.value.id]);
  try {
    const replay = await f.runtime.session.store.response(sent.value.id);
    assert.equal(replay.status, 200);
    const file = path.join(f.runtime.session.store.root, 'audio-replay.webm');
    await fs.writeFile(file, Buffer.from(await replay.arrayBuffer()));
    const decoded = await promisify(execFile)('ffmpeg', ['-nostdin', '-i', file, '-map', '0:a:0',
      '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-f', 's16le', '-'], { encoding: 'buffer', timeout: 5000 });
    assert.match(decoded.stderr.toString(), /Audio: opus/);
    assert.doesNotMatch(decoded.stderr.toString(), /Video:/);
    assert.equal(decoded.stdout.length, 32000);
    assert.ok(decoded.stdout.some(byte => byte !== 0));
  } finally {
    await release();
  }
  assert.deepEqual((await f.req('/v1/segments', body)).value, { id: sent.value.id, duplicate: true });
  assert.equal(f.runtime.session.memory.view().passages.length, 1);
  assert.equal(f.runtime.session.memory.view().losses.imagesAbsent, 1);
});

test('HTTP ingestion refuses missing or denied sound in a declared sound-only block before preparation', async t => {
  const { RemoteMedia } = require('../adapters/remote-media.cjs');
  const media = new RemoteMedia(), assemble = t.mock.method(media, 'assemble');
  const f = await fixture(t, { media });
  const { id } = (await f.req('/v1/session/start', {})).value;
  const body = { sessionId: id, sequence: 1, startMs: 0, endMs: 1000, frames: [], media: { video: false, audio: true } };
  for (const change of [
    ...[undefined, null, '', false, 0, [], {}, true].map(audio => ({ audio })),
    { audio: soundWav().toString('base64'), media: { video: false, audio: false } },
  ]) {
    const response = await f.req('/v1/segments', { ...body, ...change });
    assert.equal(response.status, 400);
    assert.equal(response.value.code, 'invalid-media-block');
    assert.equal(assemble.mock.callCount(), 0);
  }
  assert.deepEqual(f.runtime.session.memory.view().passages, []);
  assert.equal(f.runtime.admitted.size, 0);
  assert.equal(f.server.accepted.size, 0);
});

test('HTTP ingestion refuses a block with images declared without sound before preparation', async t => {
  const { RemoteMedia } = require('../adapters/remote-media.cjs');
  const media = new RemoteMedia(), assemble = t.mock.method(media, 'assemble');
  const entries = [];
  const f = await fixture(t, { media, logError: entry => entries.push(entry) });
  const { id } = (await f.req('/v1/session/start', {})).value;
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-denied-audio-'));
  t.after(() => fs.rm(scratch, { recursive: true, force: true }));
  t.mock.method(os, 'tmpdir', () => scratch);
  const data = (await require('sharp')({ create: { width: 32, height: 32, channels: 3, background: '#fff' } }).jpeg().toBuffer())
    .toString('base64');
  const response = await f.req('/v1/segments', { sessionId: id, sequence: 1, startMs: 0, endMs: 1000,
    frames: [{ atMs: 0, data }], audio: soundWav().toString('base64'), media: { audio: false } });
  assert.equal(response.status, 400);
  assert.equal(response.value.code, 'invalid-media-block');
  assert.equal(response.value.error, 'Le bloc déclaré doit contenir du son.');
  assert.equal(assemble.mock.callCount(), 0);
  assert.deepEqual(await fs.readdir(scratch), []);
  assert.deepEqual(f.runtime.session.memory.view().passages, []);
  await assert.rejects(fs.stat(f.runtime.session.store.mediaRoot), { code: 'ENOENT' });
  assert.equal(f.runtime.admitted.size, 0);
  assert.equal(f.server.accepted.size, 0);
  assert.deepEqual(entries, []);
});

test('HTTP ingestion exposes a core sound requirement refusal as a named client error', async t => {
  const entries = [];
  const f = await fixture(t, { logError: entry => entries.push(entry), media: {
    assemble: async input => ({ ...input, clip: Buffer.from('fixture'), audio: new Uint8Array([1]),
      frames: [{ atMs: input.startMs, dataUrl: 'data:image/jpeg;base64,YQ==' }], media: { audio: false } }),
  } });
  const { id } = (await f.req('/v1/session/start', {})).value;
  const response = await f.req('/v1/segments', { sessionId: id, sequence: 1, startMs: 0, endMs: 1000,
    frames: [{ atMs: 0, data: 'YQ==' }] });
  assert.equal(response.status, 400);
  assert.equal(response.value.code, 'capture-audio-required');
  assert.equal(response.value.error, 'Le passage déclaré doit contenir du son.');
  assert.deepEqual(entries, []);
  assert.deepEqual(f.runtime.session.memory.view().passages, []);
  assert.equal(f.runtime.admitted.size, 0);
  assert.equal(f.server.ingesting, false);
  assert.equal(f.server.accepted.size, 0);
  await assert.rejects(fs.stat(f.runtime.session.store.mediaRoot), { code: 'ENOENT' });
});

test('HTTP ingestion refuses images contradicting a sound-only declaration before preparation', async t => {
  const { RemoteMedia } = require('../adapters/remote-media.cjs');
  const media = new RemoteMedia(), assemble = t.mock.method(media, 'assemble');
  const f = await fixture(t, { media });
  const { id } = (await f.req('/v1/session/start', {})).value;
  const data = (await require('sharp')({ create: { width: 32, height: 32, channels: 3, background: '#fff' } }).jpeg().toBuffer())
    .toString('base64');
  const response = await f.req('/v1/segments', { sessionId: id, sequence: 1, startMs: 0, endMs: 1000,
    frames: [{ atMs: 0, data }], audio: soundWav().toString('base64'), media: { video: false, audio: true } });
  assert.equal(response.status, 400);
  assert.equal(response.value.code, 'invalid-media-block');
  assert.equal(response.value.error, 'Le bloc déclaré son seul ne doit pas contenir d’images.');
  assert.equal(assemble.mock.callCount(), 0);
  assert.deepEqual(f.runtime.session.memory.view().passages, []);
});

test('HTTP ingestion requires decodable samples in sound-only audio and releases refused blocks', async t => {
  const { RemoteMedia } = require('../adapters/remote-media.cjs');
  for (const [kind, audio, code] of [
    ['invalid base64', 'invalid!', 'invalid-media-block'],
    ['oversized audio', Buffer.alloc(2100001).toString('base64'), 'invalid-media-block'],
    ['non-WAV audio', 'YQ==', 'invalid-media-block'],
    ['undecodable WAV', soundWav().subarray(0, 12).toString('base64'), 'media-tool-refused'],
    ['WAV without samples', soundWav(0).toString('base64'), 'media-tool-refused'],
  ]) await t.test(kind, async t => {
    const f = await fixture(t, { media: new RemoteMedia() });
    const { id } = (await f.req('/v1/session/start', {})).value;
    const body = { sessionId: id, sequence: 1, startMs: 0, endMs: 1000, frames: [], media: { video: false, audio: true }, audio };
    const response = await f.req('/v1/segments', body);
    assert.equal(response.status, 400);
    assert.equal(response.value.code, code);
    assert.deepEqual(f.runtime.session.memory.view().passages, []);
    assert.equal(f.runtime.admitted.size, 0);
    assert.equal(f.server.ingesting, false);
    assert.equal(f.server.accepted.size, 0);
    const next = await f.req('/v1/segments', { ...body, audio: soundWav().toString('base64') });
    assert.equal(next.status, 200);
    assert.deepEqual(next.value, { id: 'moment-1', duplicate: false });
  });
});

test('a media tool killed by its time limit fails the block instead of passing a truncated file', async t => {
  const { RemoteMedia } = require('../adapters/remote-media.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-slow-tool-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const slow = path.join(dir, 'slow.cjs');
  await fs.writeFile(slow, '#!/usr/bin/env node\nsetTimeout(() => {}, 60000);\n', { mode: 0o755 });
  const wav = Buffer.alloc(44 + 3200); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(3200, 40);
  const jpeg = await require('sharp')({ create: { width: 32, height: 32, channels: 3, background: '#336699' } }).jpeg().toBuffer();
  const input = { sessionId: 's', sequence: 1, startMs: 0, endMs: 100, frames: [{ atMs: 0, data: jpeg.toString('base64') }], audio: wav.toString('base64') };
  await assert.rejects(new RemoteMedia({ ffmpeg: slow, timeoutMs: 150 }).assemble(input), /Préparation média trop longue/);
});

test('remote payloads are still refused when malformed or oversized, without being decoded for the check', async () => {
  const { validateRemote } = require('../adapters/remote-media.cjs');
  const base = { sessionId: 's', sequence: 1, startMs: 0, endMs: 100 };
  assert.throws(() => validateRemote({ ...base, frames: [{ atMs: 0, data: 'pas du base64 !' }] }), /Média encodé invalide/);
  assert.throws(() => validateRemote({ ...base, frames: [{ atMs: 0, data: 'A' }] }), /Média trop volumineux/);
  assert.throws(() => validateRemote({ ...base, frames: [{ atMs: 0, data: 'QUJD' }], audio: 'A'.repeat(2800004) }), /Média encodé invalide|Média trop volumineux/);
  assert.throws(() => validateRemote({ ...base, frames: [{ atMs: 0, data: 'A'.repeat(2000004) }] }), /Média trop volumineux|Média encodé invalide/);
  assert.doesNotThrow(() => validateRemote({ ...base, frames: [{ atMs: 0, data: 'QUJD' }], audio: 'QUI=' }));
});


test('normal and legacy capture blocks retain images, identity, sequence and source without a masking declaration or note', async t => {
  const { RemoteMedia } = require('../adapters/remote-media.cjs');
  const image = await require('sharp')({ create: { width: 64, height: 36, channels: 3, background: '#336699' } }).jpeg().toBuffer();
  const assembler = new RemoteMedia(), assembled = [];
  const f = await fixture(t, { media: { assemble: async (...args) => {
    const result = await assembler.assemble(...args);
    assembled.push(result);
    return result;
  } } });
  const session = (await f.req('/v1/session/start', {})).value;
  const watch = f.runtime.session.watch;
  for (const sequence of [1, 2, 3]) {
    const startMs = (sequence - 1) * 1000, endMs = sequence * 1000;
    const legacy = sequence === 2 ? { overlay: { cropped: 1, withheld: 1 } } : {};
    if (sequence === 3) legacy.overlay = 'obsolete';
    const body = { sessionId: session.id, sequence, source: { kind: 'tv', display: 'HDMI 1' }, startMs, endMs,
      frames: [{ atMs: startMs, data: image.toString('base64'), ...(sequence > 1 ? { overlay: 'cropped' } : {}) }], ...legacy };
    f.setClock(endMs);
    const sent = await f.req('/v1/segments', body);
    assert.equal(sent.status, 200);
    do { await new Promise(resolve => setImmediate(resolve)); } while (watch.running);
    const result = assembled.at(-1);
    assert.deepEqual([result.sessionId, result.sequence, result.source], [body.sessionId, sequence, body.source]);
    assert.equal(result.overlay, undefined);
    assert.deepEqual(Object.keys(result.ingest), ['assembleMs']);
    assert.deepEqual(result.frames.map(frame => frame.atMs), [startMs]);
    assert.equal(result.frames[0].overlay, undefined);
    const stored = await f.runtime.session.store.read(sent.value.id);
    assert.deepEqual(stored.frames, result.frames);
    assert.equal(result.frames[0].dataUrl, assembled[0].frames[0].dataUrl);
    const passage = (await f.req('/v1/state')).value.session.segments.at(-1);
    assert.deepEqual([passage.status, passage.ingest.overlay, passage.observation.uncertainty], ['ready', undefined, '']);
    assert.equal(passage.observation.visual, '1 images reçues.');
    assert.equal((await f.req('/v1/segments', body)).value.duplicate, true);
  }
});


test('the host answers through DeepAsk and refuses questions during and after session teardown without reaching the agent', async t => {
  let calls = 0;
  const f = await fixture(t, { runtimeOptions: { agent: { answer: async () => {
    calls++;
    return { answer: 'Explication permise.', kind: 'explanation', citations: [], limits: [] };
  } } } });
  const session = (await f.req('/v1/session/start', {})).value;
  const question = { sessionId: session.id, question: 'Pourquoi ?', anchorMs: 0 };
  const accepted = await f.req('/v1/questions', question);
  assert.equal(accepted.status, 200);
  await f.runtime.deep.jobs.find(job => job.id === accepted.value.id).done;
  assert.equal(f.runtime.deep.snapshot().jobs[0].result.kind, 'explanation');
  const entered = deferred(), release = deferred(), pause = f.runtime.session.pause;
  f.runtime.session.pause = async () => { entered.resolve(); await release.promise; return pause(); };
  const closing = f.runtime.close();
  try {
    await entered.promise;
    assert.equal((await f.req('/v1/questions', question)).status, 400);
    assert.equal(calls, 1);
  } finally {
    release.resolve();
    await closing;
  }
  assert.equal((await f.req('/v1/questions', question)).status, 400);
  assert.equal(calls, 1);
  assert.deepEqual(f.runtime.deep.snapshot().jobs, []);
});

for (const kind of ['image', 'wav', 'tool', 'validation']) {
  test(`HTTP ingestion classifies real ${kind} content refusal and releases its admission`, async t => {
    const { RemoteMedia } = require('../adapters/remote-media.cjs');
    const data = (await require('sharp')({ create: {
      width: 32, height: 32, channels: 3, background: '#fff',
    } }).jpeg().toBuffer()).toString('base64');
    const f = await fixture(t, { media: new RemoteMedia({ ffmpeg: process.execPath }) });
    const { id } = (await f.req('/v1/session/start', {})).value;
    const input = { sessionId: id, sequence: 1, startMs: 0, endMs: 100, frames: [{ atMs: 0, data }] };
    const expected = {
      image: ['image-unreadable', 'Image illisible.'],
      wav: ['invalid-media-block', 'Audio WAV requis.'],
      tool: ['media-tool-refused', 'Préparation média échouée.'],
      validation: ['invalid-media-block', 'Nombre d’images invalide.'],
    }[kind];
    if (kind === 'image') input.frames[0].data = Buffer.from('not an image').toString('base64');
    if (kind === 'wav') input.audio = 'YQ==';
    if (kind === 'validation') input.frames = [];
    const response = await f.req('/v1/segments', input);
    assert.equal(response.status, 400);
    assert.equal(response.value.code, expected[0]);
    assert.equal(response.value.error, expected[1]);
    assert.deepEqual(f.runtime.session.watch.snapshot().segments, []);
    assert.equal(f.runtime.admitted.size, 0);
    assert.equal(f.server.ingesting, false);
    assert.equal(f.server.accepted.size, 0);
  });
}

for (const [errno, status, code] of [['EIO', 500, 'internal-error'], ['ENOSPC', 507, 'storage-full']]) {
  test(`HTTP ingestion preserves a real store write failure as ${status} ${code}`, async t => {
    const entries = [];
    const f = await fixture(t, { logError: entry => entries.push(entry) });
    const { id } = (await f.req('/v1/session/start', {})).value;
    const write = fs.writeFile;
    const cause = Object.assign(Error('Horodatage invalide.'), { code: errno });
    t.mock.method(fs, 'writeFile', async (target, ...args) => {
      if (String(target).endsWith('moment-1.webm')) throw cause;
      return write(target, ...args);
    });
    const response = await f.req('/v1/segments', {
      sessionId: id, sequence: 1, startMs: 0, endMs: 100, frames: [{ atMs: 0, data: 'YQ==' }],
    });
    assert.equal(response.status, status);
    assert.equal(response.value.code, code);
    if (errno === 'EIO') {
      assert.equal(response.value.error, 'Erreur interne du serveur.');
      assert.equal(entries.length, 1);
      assert.equal(entries[0].method, 'POST');
      assert.equal(entries[0].pathname, '/v1/segments');
      assert.equal(entries[0].error, cause);
    } else assert.deepEqual(entries, []);
    assert.deepEqual(f.runtime.session.watch.snapshot().segments, []);
    assert.deepEqual(await fs.readdir(f.runtime.session.store.mediaRoot), []);
  });
}
