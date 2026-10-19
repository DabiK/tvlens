const { HISTORICAL_IDENTITY } = require('../adapters/embeddings/provider-identity.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { holdsMedia } = require('../core/clip-container.cjs');
const { ViewingMemory } = require('../core/memory/index.cjs');
const { VideoTools, consultationOf } = require('../core/video-tools.cjs');
const { videoToolDefinitions } = require('../core/video-tool-contracts.cjs');
const { inspectionStrategy } = require('../adapters/inspection-strategies.cjs');
const { spawnSync } = require('node:child_process');
const { ClipInspector } = require('../adapters/clip-inspector.cjs');
const { SessionLibrary } = require('../adapters/session-library.cjs');
const { createSessionRuntime, openArchivedSession } = require('../runtime/session-runtime.cjs');

// Two recordings made by Chromium's MediaRecorder (Electron 44) on 13 October 2026, kept as they came out:
// - no-frame: sound flowed for 2 s and the video track delivered no frame. 110 bytes, an EBML header and zeros.
//   This is the file found behind a first passage that could not be replayed on a saturated Mac.
// - head: the first 400 bytes of an ordinary 2 s recording, cut inside its first block.
// And one clip assembled by ffmpeg 8.1.1 with the command of the server (adapters/remote-media.cjs: concat, fps=2,
// libvpx, libopus), which is what a passage captured on the TV is stored as: its first 696 bytes, cut inside its first block.
const fixture = name => fs.readFile(path.join(__dirname, 'fixtures', name));
const { tick } = require('./helpers/wait.cjs');
const settle = async watch => { do { await tick(); } while (watch.running); };

// Hand-made Matroska: an element is its identifier, its size and its payload.
const UNKNOWN = Buffer.from('01ffffffffffffff', 'hex');
const element = (id, payload, size = Buffer.from([0x80 | payload.length])) => Buffer.concat([Buffer.from(id, 'hex'), size, payload]);
const HEADER = element('1a45dfa3', Buffer.from('4282847765626d', 'hex'));
const TRACKS = element('1654ae6b', Buffer.alloc(3)), TIMECODE = element('e7', Buffer.from([0]));
const BLOCK = element('a3', Buffer.from('8100008001020304', 'hex')), GROUP = element('a0', element('a1', Buffer.from('81000000aabb', 'hex')));
const segment = (...children) => element('18538067', Buffer.concat(children), UNKNOWN);
const cluster = (children, live = true) => element('1f43b675', Buffer.concat(children), live ? UNKNOWN : undefined);

test('a container says whether it holds media: by its blocks, never by its size', async () => {
  const empty = await fixture('chromium-webm-no-frame.webm'), head = await fixture('chromium-webm-head.webm');
  assert.equal(empty.length, 110);
  assert.equal(holdsMedia(empty), false, 'the recording without a frame holds no media');
  assert.equal(holdsMedia(head), true, 'an ordinary recording holds media, even cut inside its first block');
  // The same recording cut before its first cluster: bigger than the empty one, and just as empty. The cluster
  // identifier it still contains sits in its index (SeekHead), which is not a cluster.
  assert.equal(holdsMedia(head.subarray(0, 300)), false);
  // The container of the TV path (index, padding, tags written by ffmpeg before the first cluster) holds media.
  assert.equal(holdsMedia(await fixture('ffmpeg-webm-head.webm')), true, 'a clip assembled by the server is never said empty');
  assert.ok(head.subarray(0, 300).includes(Buffer.from('1f43b675', 'hex')));

  // What a live recorder writes (unknown sizes) and what a muxer writes (known sizes, padding, block groups).
  assert.equal(holdsMedia(Buffer.concat([HEADER, segment(TRACKS, cluster([TIMECODE, BLOCK]))])), true);
  assert.equal(holdsMedia(Buffer.concat([HEADER, element('18538067', Buffer.concat([element('ec', Buffer.alloc(5)), TRACKS, cluster([TIMECODE, GROUP], false)]))])), true);
  assert.equal(holdsMedia(Buffer.concat([HEADER, segment(TRACKS, cluster([TIMECODE]), cluster([TIMECODE, BLOCK]))])), true, 'a later cluster counts');
  // Header and tracks only; a cluster without a block; a block identifier outside any cluster; an empty block.
  assert.equal(holdsMedia(Buffer.concat([HEADER, segment(TRACKS)])), false);
  assert.equal(holdsMedia(Buffer.concat([HEADER, segment(TRACKS, cluster([TIMECODE]))])), false);
  assert.equal(holdsMedia(Buffer.concat([HEADER, segment(TRACKS, BLOCK)])), false);
  assert.equal(holdsMedia(Buffer.concat([HEADER, segment(cluster([element('a3', Buffer.alloc(0))]))])), false);
  assert.equal(holdsMedia(HEADER), false);
  // Thousands of empty clusters are walked side by side: no depth to exhaust, and still no media.
  assert.equal(holdsMedia(Buffer.concat([HEADER, Buffer.from('18538067', 'hex'), UNKNOWN, ...Array.from({ length: 20000 }, () => Buffer.concat([Buffer.from('1f43b675', 'hex'), UNKNOWN]))])), false);
  assert.equal(holdsMedia(Buffer.alloc(0)), false, 'zero bytes hold nothing');

  // Nothing is claimed about what is not a Matroska container, or cannot be walked to its end.
  for (const other of [undefined, null, 'webm', Buffer.from('clip 0'), Buffer.from('000000186674797069736f6d', 'hex'), Buffer.concat([HEADER, Buffer.from('000102', 'hex')]),
    Buffer.concat([HEADER, segment(element('1654ae6b', Buffer.alloc(3), UNKNOWN), cluster([BLOCK]))])]) assert.equal(holdsMedia(other), null);
  assert.equal(holdsMedia(new Uint8Array(empty).buffer), false, 'an ArrayBuffer is read like its bytes');
});

// Real adapters on a temporary directory, simulated providers, host clock held by the test.
async function runtime(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-unreadable-')), sessionsRoot = path.join(root, 'sessions');
  const jpeg = 'data:image/jpeg;base64,' + (await sharp({ create: { width: 64, height: 36, channels: 3, background: '#264136' } }).jpeg().toBuffer()).toString('base64');
  const f = { root, sessionsRoot, clock: 0, jpeg, opened: [] };
  const embeddings = { identity: HISTORICAL_IDENTITY, embed: async () => [1, 0], embedMany: async texts => texts.map(() => [1, 0]) };
  f.options = extra => ({ userData: root, config: {}, selectedModels: {}, smoke: true, readClock: () => f.clock, overrides: { embeddings }, ...extra });
  f.open = extra => { const session = createSessionRuntime({ sessionsRoot, ...f.options(extra) }); f.opened.push(session); return session; };
  f.reopen = async id => { const opened = await openArchivedSession({ library: new SessionLibrary({ root: sessionsRoot }), id, ...f.options() }); f.opened.push(opened.session); return opened.session; };
  t.after(async () => { for (const session of f.opened) await session.close(); await fs.rm(root, { recursive: true, force: true }); });
  return f;
}
// A strategy and a model that only look at what they are handed.
const looking = seen => ({
  strategy: { name: 'test', diverse: false, prepare: async ({ segments }) => ({ segments, metadata: { warnings: ['Avertissement de préparation.'] }, cost: 0 }) },
  model: { inspect: async ({ segments }) => { seen.push(...segments); return { observations: segments.map(s => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, text: 'Un cercle clair sur fond sombre.' })), hypotheses: [], limits: ['Limite du modèle.'], cost: 0 }; } },
});

test('the inspector refuses a declared image absence before reading media, decoding or preparing a model call', async () => {
  const calls = [];
  const inspector = new ClipInspector({
    ffmpeg: '/decoder-must-not-run',
    media: { file: () => { calls.push('file'); return '/absent'; }, read: async () => { calls.push('read'); return {}; } },
    strategy: { prepare: async () => { calls.push('prepare'); return { segments: [], metadata: {} }; } },
    model: { inspect: async () => { calls.push('vision'); return {}; } },
  });
  for (const declaration of [{ hasImages: false }, { mediaReason: 'images-absent' }]) {
    await assert.rejects(inspector.inspect({ question: 'Que voit-on ?', startMs: 0, endMs: 8000,
      segments: [{ id: 'moment-1', startMs: 0, endMs: 8000, ...declaration }] }), {
      code: 'TVLENS_INSPECTION_IMAGES_ABSENT', message: "Ce passage n'a que le son : lire ses paroles.",
    });
  }
  assert.deepEqual(calls, []);
});
// Stand-ins for ffmpeg: each leaves a line in a log, so that "never called" can be told from "failed".
async function decoders(dir) {
  const log = path.join(dir, 'decoder.log'), write = async (name, body) => { const file = path.join(dir, name); await fs.writeFile(file, `#!/usr/bin/env node\nrequire('node:fs').appendFileSync(${JSON.stringify(log)}, process.argv[process.argv.indexOf('-i') + 1] + '\\n');\n${body}\n`, { mode: 0o755 }); return file; };
  return { calls: async () => (await fs.readFile(log, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(file => path.basename(file)),
    works: await write('works.cjs', "require('node:fs').writeFileSync(process.argv.at(-1).replace('%03d','001'),'jpeg');"),
    refuses: await write('refuses.cjs', 'process.exit(1);'), nothing: await write('nothing.cjs', ''), hangs: await write('hangs.cjs', 'setTimeout(() => {}, 60000);'),
    killed: await write('killed.cjs', "process.kill(process.pid, 'SIGKILL'); setTimeout(() => {}, 60000);") };
}

test('a passage recorded without a frame is kept, analysed and never announced as a video that can be replayed', async t => {
  const f = await runtime(t), live = f.open(), id = live.id, media = path.join(f.sessionsRoot, id, 'media');
  const empty = await fixture('chromium-webm-no-frame.webm'), head = await fixture('chromium-webm-head.webm');
  f.clock = 2000; await live.watch.ingest({ startMs: 0, endMs: 2000, clip: empty, frames: [{ atMs: 0, dataUrl: f.jpeg }, { atMs: 1200, dataUrl: f.jpeg }], audio: null });
  f.clock = 10000; await live.watch.ingest({ startMs: 2000, endMs: 10000, clip: head, frames: [{ atMs: 2000, dataUrl: f.jpeg }], audio: null });
  await settle(live.watch);
  // Analysed like any passage, from its images; its video alone is said unreadable. The next one is untouched.
  assert.deepEqual(live.watch.segments.map(s => [s.id, s.status, s.available, s.mediaReason, s.thumbnailAvailable]), [['moment-1', 'ready', false, 'unreadable', true], ['moment-2', 'ready', true, undefined, true]]);
  assert.equal(live.watch.history.length, 0, 'the passage is not archived as if its media had expired');
  const state = live.watch.snapshot();
  assert.equal(state.coverage.videoUnreadable, 1);
  assert.ok(state.segments[0].observation, 'the unreadable video did not cost the passage its description');
  // Nothing is purged and nothing is rewritten: the file is there as it came, next to its images.
  assert.deepEqual(await fs.readFile(path.join(media, 'moment-1.webm')), empty);
  assert.equal(JSON.parse(await fs.readFile(path.join(media, 'moment-1.json'), 'utf8')).frames.length, 2);

  // Re-examination is not refused: it goes through the real inspector, on the files really stored.
  const dir = await fs.mkdtemp(path.join(f.root, 'decoders-')), tools = await decoders(dir), seen = [];
  const inspector = new ClipInspector({ media: live.store, ffmpeg: tools.works, ...looking(seen) });
  const video = new VideoTools({ consultation: consultationOf(live.memory.view()), search: live.search, inspector, media: live.memoryMedia });
  const result = await video.call('inspect_clip', { startMs: 0, endMs: 2000, question: 'Que voit-on ?' });
  assert.deepEqual(await tools.calls(), [], 'the container known to be empty is not handed to the decoder');
  assert.deepEqual(seen[0].frames, [{ atMs: 0, dataUrl: f.jpeg }, { atMs: 1200, dataUrl: f.jpeg }]);
  assert.deepEqual(result.limits, ['Vidéo illisible pour le passage 0,0–2,0 s : réexamen fait sur 2 images conservées à la capture, sans le mouvement entre elles.', 'Limite du modèle.', 'Avertissement de préparation.']);
  assert.deepEqual([result.observations.map(o => o.id), video.limits[0], video.toolMetrics.at(-1).stillFrames, result.sampledFrames], [['moment-1'], result.limits[0], 2, 2]);

  // The agent is told why this passage has no video: unlike an expired one it can still be re-examined.
  const read = await video.call('get_transcript', { startMs: 0, endMs: 10000 }), hits = (await video.call('search_moments', { query: 'cercle' })).moments;
  assert.deepEqual(read.passages.map(p => [p.id, p.available, p.mediaReason]), [['moment-1', false, 'unreadable'], ['moment-2', true, undefined]]);
  assert.deepEqual(hits.filter(m => m.id === 'moment-1').map(m => [m.available, m.mediaReason]), [[false, 'unreadable']]);
  assert.ok(hits.filter(m => m.id !== 'moment-1').every(m => !('mediaReason' in m)));
  assert.match(videoToolDefinitions.find(tool => tool.name === 'inspect_clip').description, /mediaReason="unreadable".*images conservées à la capture/);

  // With the real decoder and the strategy of the product (contact sheets): the marked passage is re-examined on its
  // kept images, and the same file left unmarked (an archive saved before this was detected) is refused by ffmpeg and
  // degrades the same way, without being called unreadable.
  if (spawnSync('ffmpeg', ['-version']).status === 0) {
    const handed = [], real = new ClipInspector({ media: live.store, strategy: inspectionStrategy('sheets-diverse'),
      model: { inspect: async ({ segments }) => { handed.push(...segments); return { observations: [], hypotheses: [], limits: [], cost: 0 }; } } });
    const marked = live.watch.snapshot().segments[0], ask = segment => real.inspect({ question: 'Que voit-on ?', startMs: 0, endMs: 2000, segments: [segment] });
    const first = await ask(marked), second = await ask({ ...marked, available: true, mediaReason: undefined });
    assert.deepEqual([first.limits[0], first.stillFrames, first.strategy], ['Vidéo illisible pour le passage 0,0–2,0 s : réexamen fait sur 2 images conservées à la capture, sans le mouvement entre elles.', 2, 'sheets-diverse']);
    assert.deepEqual([second.limits[0], second.stillFrames], ['Aucune image n’a pu être tirée de la vidéo sur 0,0–2,0 s : réexamen fait sur 2 images conservées à la capture, sans le mouvement entre elles.', 2]);
    assert.equal(handed.length, 2);
  } else t.diagnostic('ffmpeg absent: re-examination with the real decoder not exercised');

  // The list of sessions counts one video out of two; reopened, the passage is still unreadable, never "available".
  await live.pause(); await live.archive();
  assert.deepEqual(live.manifest().media.stored, 1);
  await live.close();
  const reopened = await f.reopen(id);
  assert.deepEqual(reopened.watch.segments.map(s => [s.id, s.available, s.mediaReason]), [['moment-1', false, 'unreadable'], ['moment-2', true, undefined]]);
  assert.equal(reopened.watch.snapshot().coverage.videoUnreadable, 1);
  await reopened.close();
  // Its files gone, it is missing like any other passage.
  await fs.rm(path.join(media, 'moment-1.webm'));
  const emptied = await f.reopen(id);
  assert.deepEqual(emptied.watch.segments.map(s => [s.id, s.available, s.mediaReason]), [['moment-1', false, 'missing'], ['moment-2', true, undefined]]);
  const consulted = new VideoTools({ consultation: consultationOf(emptied.memory.view()), search: emptied.search, inspector, media: emptied.memoryMedia });
  await assert.rejects(consulted.call('inspect_clip', { startMs: 0, endMs: 2000, question: 'Que voit-on ?' }), /Média introuvable/);
});

test('with speech and images analysed apart, the unreadable passage still gets its images described', async () => {
  let time = 0; const files = new Map(), described = [];
  const watch = new ViewingMemory({ id: 's', now: () => time, media: { put: async (id, s) => files.set(id, s), read: async id => files.get(id), remove: async id => files.delete(id) }, archive: { save: async () => {} },
    perception: { transcribe: async s => ({ observation: { transcript: `Paroles ${s.id}` }, elapsedMs: 1 }), observeVisual: async s => { described.push(s.id); return { observation: { summary: `Images ${s.id}`, visual: 'Image' }, elapsedMs: 1 }; } } });
  time = 2000; await watch.ingest({ startMs: 0, endMs: 2000, clip: await fixture('chromium-webm-no-frame.webm'), audio: new Uint8Array([1]), frames: [{ atMs: 0, dataUrl: 'data:image/jpeg;base64,AAAA' }] });
  await settle(watch);
  assert.deepEqual([described, watch.segments.map(s => [s.status, s.available, s.mediaReason, s.audioStatus, s.visionStatus, s.observation.summary]), watch.snapshot().coverage.videoUnreadable],
    [['moment-1'], [['ready', false, 'unreadable', 'ready', 'ready', 'Images moment-1']], 1]);
  assert.equal(files.has('moment-1'), true);
  // A write that is refused leaves no passage, and nothing counted.
  let refuse = true;
  const strict = new ViewingMemory({ id: 's2', now: () => 2000, media: { put: async () => { if (refuse) throw new Error('disque plein'); }, read: async () => ({ frames: [], audio: null }), remove: async () => {} }, archive: { save: async () => {} },
    perception: { transcribe: async () => ({ observation: { transcript: 'Paroles.' }, elapsedMs: 1 }), observeVisual: async () => ({ observation: { summary: 'Images.' }, elapsedMs: 1 }) } });
  await assert.rejects(strict.ingest({ startMs: 0, endMs: 2000, clip: await fixture('chromium-webm-no-frame.webm'), audio: new Uint8Array([1]), frames: [] }), /disque plein/);
  assert.deepEqual([strict.segments.length, strict.snapshot().coverage.videoUnreadable], [0, undefined]);
});

test('re-examination falls back on the images kept at capture only when the video itself cannot be decoded', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-stills-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const tools = await decoders(dir), frame = atMs => ({ atMs, dataUrl: 'data:image/jpeg;base64,AAAA' });
  const kept = { 'moment-1': [frame(0), frame(1200)], 'moment-2': [frame(2500)], 'moment-3': [] };
  const media = { file: id => path.join(dir, id + '.webm'), read: async id => ({ frames: kept[id], audio: null }) };
  const inspect = async (ffmpeg, segments, startMs, endMs, signal) => { const seen = []; const result = await new ClipInspector({ media, ffmpeg, ...looking(seen) }).inspect({ question: 'Que voit-on ?', startMs, endMs, segments, signal }); return { result, seen }; };
  const unreadable = { id: 'moment-1', startMs: 0, endMs: 2000, mediaReason: 'unreadable' }, second = { id: 'moment-2', startMs: 2000, endMs: 10000 }, third = { id: 'moment-3', startMs: 10000, endMs: 18000 };

  // A decoder that works is used, and nothing is said of the video.
  const decoded = await inspect(tools.works, [second], 2000, 10000);
  assert.deepEqual([decoded.result.limits, decoded.result.stillFrames, decoded.seen[0].frames.length, await tools.calls()], [['Limite du modèle.', 'Avertissement de préparation.'], undefined, 1, ['moment-2.webm']]);
  // The decoder refuses the file, or draws nothing from it: the kept images stand in, and the answer says so.
  for (const ffmpeg of [tools.refuses, tools.nothing]) {
    const { result, seen } = await inspect(ffmpeg, [second], 2000, 10000);
    // Nothing says this video is unreadable (it was not found empty): the limit only says what the answer rests on.
    assert.deepEqual([seen[0].frames, result.limits[0], result.stillFrames, result.sampledFrames], [[frame(2500)], 'Aucune image n’a pu être tirée de la vidéo sur 2,0–10,0 s : réexamen fait sur une seule image conservée à la capture, sans le mouvement.', 1, 1]);
  }
  // One passage unreadable among others: only that one is named, the other keeps its decoded images.
  const mixed = await inspect(tools.works, [unreadable, second], 0, 10000);
  assert.deepEqual([mixed.seen.map(s => s.frames.length), mixed.result.limits.filter(x => x.startsWith('Vidéo illisible')), mixed.result.stillFrames, mixed.result.sampledFrames], [[2, 1], ['Vidéo illisible pour le passage 0,0–2,0 s : réexamen fait sur 2 images conservées à la capture, sans le mouvement entre elles.'], 2, 3]);
  // An excerpt keeps to its own interval: an image kept elsewhere in the passage is not passed off as its content.
  assert.deepEqual((await inspect(tools.refuses, [unreadable], 1000, 1500)).seen[0].frames, [frame(1200)]);
  await assert.rejects(inspect(tools.refuses, [unreadable], 1300, 1900), /Aucune image décodée dans le passage/);
  await assert.rejects(inspect(tools.refuses, [third], 10000, 18000), /Aucune image décodée dans le passage/, 'no kept image: the failure stays a failure');
  // A decoder that is not installed says nothing of the file: the error is the one about the decoder.
  await assert.rejects(inspect(path.join(dir, 'absent'), [second], 2000, 10000), /FFmpeg indisponible/);
  // Nor does a decoder that was killed: that is a failure of the decoder, said as such.
  await assert.rejects(inspect(tools.killed, [second], 2000, 10000), /Le décodeur vidéo s’est arrêté avant la fin/);
  // An interruption is never taken for an unreadable video.
  const controller = new AbortController(), stopped = inspect(tools.hangs, [second], 2000, 10000, controller.signal);
  setTimeout(() => controller.abort(new Error('Question annulée.')), 150);
  await assert.rejects(stopped, /Question annulée/);
});
