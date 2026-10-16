const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
const { RemoteServer } = require('../server/http.cjs');
const token = 'b'.repeat(64);

async function fixture(t, { media, runtimeOptions = {} } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-ingest-path-'));
  let clock = 0;
  const runtime = new HeadlessRuntime({ userData: dir, sessionsRoot: path.join(dir, 'sessions'), config: {}, selectedModels: { observationModel: 'test', inspectionModel: 'test', codexModel: 'test' },
    smoke: true, agent: { answer: async () => ({ answer: 'ok', kind: 'explanation', citations: [], limits: [] }) }, readClock: () => clock, ...runtimeOptions });
  const assembled = media || { assemble: async x => ({ ...x, clip: Buffer.from('fixture'), frames: [{ atMs: x.startMs, dataUrl: 'data:image/jpeg;base64,YQ==' }], audio: null, ingest: { assembleMs: 37 } }) };
  const server = await new RemoteServer({ runtime, media: assembled, token }).listen(0, '127.0.0.1');
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

test('images cropped or withheld under a TV Lens card are bounded at the door, carried to the passage and said in its uncertainty; an ordinary block is unchanged', async t => {
  const { RemoteMedia, validateRemote } = require('../adapters/remote-media.cjs');
  const image = (await require('sharp')({ create: { width: 64, height: 36, channels: 3, background: '#336699' } }).jpeg().toBuffer()).toString('base64');
  const frames = (...flags) => flags.map((overlay, i) => ({ atMs: i * 2000, data: image, ...(overlay === undefined ? {} : { overlay }) }));
  const body = extra => ({ sessionId: 's', sequence: 1, startMs: 0, endMs: 8000, frames: frames('cropped', undefined, undefined), ...extra });
  // Out of bounds, mistyped or impossible for the images sent: refused before anything is decoded.
  for (const [label, refused, message] of [
    ['six cropped', body({ overlay: { cropped: 6, withheld: 0 } }), /images masquées invalide/], ['six withheld', body({ overlay: { cropped: 1, withheld: 6 } }), /images masquées invalide/],
    ['negative', body({ overlay: { cropped: -1, withheld: 0 } }), /images masquées invalide/], ['fraction', body({ overlay: { cropped: 1.5, withheld: 0 } }), /images masquées invalide/],
    ['figure as text', body({ overlay: { cropped: '1', withheld: 0 } }), /images masquées invalide/], ['half a block', body({ overlay: { cropped: 1 } }), /images masquées invalide/],
    ['not a block', body({ overlay: 'cropped' }), /images masquées invalide/], ['a list', body({ overlay: [1, 0] }), /images masquées invalide/],
    ['more cropped than sent', body({ overlay: { cropped: 4, withheld: 0 } }), /images masquées incohérente/],
    // Sent plus withheld cannot exceed the five images one block can hold.
    ['more withheld than a block holds', body({ overlay: { cropped: 1, withheld: 6 - body().frames.length } }), /images masquées incohérente/],
    // A withheld image is not sent: one that arrives flagged so could carry the text of a card.
    ['withheld image sent', body({ frames: frames('withheld', undefined) }), /image masquée invalide/], ['unknown flag', body({ frames: frames(true) }), /image masquée invalide/]])
    assert.throws(() => validateRemote(refused), message, label);
  for (const accepted of [body(), body({ overlay: null }), body({ overlay: { cropped: 1, withheld: 5 - body().frames.length } }), body({ overlay: { cropped: 0, withheld: 0 }, frames: frames(undefined) }), body({ frames: frames(null, undefined) })])
    assert.doesNotThrow(() => validateRemote(accepted));

  // Through the real route and the real assembler, down to the published description.
  const f = await fixture(t, { media: new RemoteMedia() });
  const session = (await f.req('/v1/session/start', {})).value, watch = f.runtime.session.watch;
  const send = async (sequence, endMs, extra) => {
    f.setClock(endMs);
    const sent = await f.req('/v1/segments', { sessionId: session.id, sequence, startMs: endMs - 8000, endMs, frames: extra.frames.map((frame, i) => ({ ...frame, atMs: endMs - 8000 + i * 2000 })), ...(extra.overlay ? { overlay: extra.overlay } : {}) });
    do { await new Promise(resolve => setImmediate(resolve)); } while (watch.running);
    return sent;
  };
  const note = (hidden, sampled) => `Bas de l’image masqué par un affichage TV Lens sur ${hidden} image(s) sur ${sampled} : la scène n’a pas été vue en entier.`;
  assert.equal((await send(1, 8000, { frames: frames('cropped', undefined, undefined), overlay: { cropped: 1, withheld: 1 } })).status, 200);
  // Flags alone are a declaration too; an ordinary block declares nothing.
  assert.equal((await send(2, 16000, { frames: frames('cropped', 'cropped') })).status, 200);
  assert.equal((await send(3, 24000, { frames: frames(undefined, undefined) })).status, 200);
  const refused = await send(4, 32000, { frames: frames(undefined, undefined), overlay: { cropped: 3, withheld: 0 } });
  assert.deepEqual([refused.status, refused.value], [400, { error: 'Déclaration d’images masquées incohérente.', code: 'unclassified-error' }]);
  const passages = (await f.req('/v1/state')).value.session.segments;
  assert.deepEqual(passages.map(p => [p.id, p.status, p.ingest.overlay, p.observation.uncertainty, p.observation.visual]), [
    ['moment-1', 'ready', { cropped: 1, withheld: 1 }, note(2, 4), '3 images reçues.'],
    ['moment-2', 'ready', { cropped: 2, withheld: 0 }, note(2, 2), '2 images reçues.'],
    ['moment-3', 'ready', undefined, '', '2 images reçues.']]);
  assert.deepEqual([Object.keys(passages[2].ingest), Object.keys(passages[0].ingest)], [['assembleMs'], ['assembleMs', 'overlay']], 'a passage without declaration keeps the shape it had');
});
