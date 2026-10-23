const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sharp = require('sharp');
const { IndividualFrameStrategy } = require('../adapters/individual-frame-strategy.cjs');
const { inspectionStrategy } = require('../adapters/inspection-strategies.cjs');
const { ClipInspector } = require('../adapters/clip-inspector.cjs');
const { CodexPerception } = require('../adapters/codex-perception.cjs');
const { run } = require('../adapters/ffmpeg.cjs');
const { executable } = require('../adapters/system-paths.cjs');

async function image(width, height) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: '#369abc' } }).jpeg().toBuffer();
  return 'data:image/jpeg;base64,' + bytes.toString('base64');
}

async function dimensions(dataUrl) {
  const metadata = await sharp(Buffer.from(dataUrl.split(',')[1], 'base64')).metadata();
  return [metadata.width, metadata.height];
}

test('individual inspection preserves readable images and time coverage within a global budget', async () => {
  const dataUrl = await image(1280, 720);
  const segments = Array.from({ length: 4 }, (_,index) => ({
    id: `moment-${index}`, startMs: index * 5000, endMs: (index + 1) * 5000,
    frames: Array.from({ length: 40 }, (_,frame) => ({ atMs: index * 5000 + frame * 125, dataUrl })),
  }));
  const prepared = await inspectionStrategy('frames-diverse').prepare({ segments });
  assert.equal(prepared.metadata.images, 12);
  assert.equal(prepared.segments.reduce((sum, segment) => sum + segment.frames.length, 0), 12);
  for (const [index, segment] of prepared.segments.entries()) {
    assert.equal(segment.sheets, undefined);
    assert.equal(segment.frames[0], segments[index].frames[0]);
    assert.equal(segment.frames.at(-1), segments[index].frames.at(-1));
    assert.ok(segment.frames.every(frame => frame.dataUrl === dataUrl));
    assert.deepEqual(await dimensions(segment.frames[0].dataUrl), [1280, 720]);
    assert.deepEqual(prepared.metadata.selectedTimes[index], { id: segment.id, times: segment.frames.map(frame => frame.atMs) });
  }
});

test('single image slots never duplicate endpoints or exceed the request budget', async () => {
  const dataUrl = await image(320, 180);
  const segments = Array.from({ length: 12 }, (_,index) => ({
    id: `moment-${index}`, frames: [{ atMs: index * 1000, dataUrl }, { atMs: index * 1000 + 500, dataUrl }],
  }));
  const strategy = new IndividualFrameStrategy();
  const prepared = await strategy.prepare({ segments });
  assert.equal(prepared.metadata.images, 12);
  assert.ok(prepared.segments.every(segment => segment.frames.length === 1));
  await assert.rejects(strategy.prepare({ segments: [...segments, segments[0]] }), {
    code: 'TVLENS_INSPECTION_TOO_MANY_PASSAGES',
  });
  await assert.rejects(strategy.prepare({ segments: [{ id: 'empty', frames: [] }] }), {
    code: 'TVLENS_INSPECTION_NO_CANDIDATE_IMAGES',
  });
  const signal = AbortSignal.abort();
  await assert.rejects(strategy.prepare({ segments, signal }), { name: 'AbortError' });
});

test('individual extraction keeps source resolution up to the limit without enlarging small videos', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-readable-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const ffmpeg = executable('ffmpeg');
  for (const [width, height, expected] of [[1280, 720, [1280, 720]], [1920, 1080, [1280, 720]], [320, 180, [320, 180]]]) {
    const file = path.join(dir, `${width}.mkv`);
    await run(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', `color=c=blue:s=${width}x${height}:r=8:d=1`, '-c:v', 'ffv1', file]);
    const seen = [];
    const inspector = new ClipInspector({
      ffmpeg, strategy: new IndividualFrameStrategy(),
      media: { file: () => file, read: async () => ({ frames: [], audio: null }) },
      model: { inspect: async ({ segments }) => { seen.push(...segments); return { observations: [], limits: [], cost: 0 }; } },
    });
    await inspector.inspect({ question: 'Quel texte ?', startMs: 2000, endMs: 3000,
      segments: [{ id: 'moment-1', startMs: 2000, endMs: 3000 }] });
    assert.ok(seen[0].frames.length > 0);
    assert.ok(seen[0].frames.length <= 12);
    for (const frame of seen[0].frames) {
      assert.deepEqual(await dimensions(frame.dataUrl), expected);
      assert.ok(frame.atMs >= 2000 && frame.atMs <= 3000);
    }
  }
});

test('unreadable video keeps captured images intact and maps each image to its passage and timestamp', async () => {
  const dataUrl = await image(768, 432);
  const stored = {
    first: [{ atMs: 100, dataUrl }, { atMs: 900, dataUrl }],
    second: [{ atMs: 1100, dataUrl }],
  };
  const calls = [];
  const model = new CodexPerception({
    agent: { answer: async input => { calls.push(input); return { observations: [], hypotheses: [], limits: [] }; } },
    transcriber: { transcribe: async () => ({ text: '', limits: [] }) },
  });
  const inspector = new ClipInspector({
    ffmpeg: '/must-not-decode', strategy: new IndividualFrameStrategy(), model,
    media: { file: id => id, read: async id => ({ frames: stored[id], audio: null }) },
  });
  const result = await inspector.inspect({ question: 'Quel texte ?', startMs: 0, endMs: 2000, segments: [
    { id: 'first', startMs: 0, endMs: 1000, mediaReason: 'unreadable' },
    { id: 'second', startMs: 1000, endMs: 2000, mediaReason: 'unreadable' },
  ] });
  assert.equal(result.stillFrames, 3);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].mediaInput.length, 3);
  assert.ok(calls[0].mediaInput.every(input => input.url === dataUrl));
  const descriptions = JSON.parse(/ces passages : (\[.*\])\. Sépare/s.exec(calls[0].instructions)[1]);
  assert.deepEqual(descriptions.map(({ id, images }) => ({ id, images })), [
    { id: 'first', images: [{ image: 1, atMs: 100 }, { image: 2, atMs: 900 }] },
    { id: 'second', images: [{ image: 3, atMs: 1100 }] },
  ]);
  assert.match(calls[0].instructions, /vue individuelle/);
  assert.doesNotMatch(calls[0].instructions, /Chaque planche/);
});
