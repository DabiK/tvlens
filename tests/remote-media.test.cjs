const {test}=require('node:test');const assert=require('node:assert/strict');
const sharp=require('sharp');const {RemoteMedia,validateRemote}=require('../adapters/remote-media.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
test('remote media preserves crop, frame timestamps and produces a replay with normalized audio',async()=>{
 const image=await sharp({create:{width:1280,height:720,channels:3,background:'#ff0000'}}).png().toBuffer();
 const wav=Buffer.alloc(44+48000*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(192000,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 const input={sessionId:'test',sequence:1,startMs:100,endMs:1100,frames:[100,600].map(atMs=>({atMs,data:image.toString('base64'),crop:{x:0,y:90,width:960,height:540}})),audio:wav.toString('base64')};
 const result=await new RemoteMedia().assemble(input);
 assert.deepEqual(result.frames.map(f=>f.atMs),[100,600]);
 const meta=await sharp(Buffer.from(result.frames[0].dataUrl.split(',')[1],'base64')).metadata();
 assert.equal(meta.width,960);assert.equal(meta.height,540);
 assert.equal(result.clip.subarray(0,4).toString('hex'),'1a45dfa3');
 assert.equal(result.audio.toString('ascii',0,4),'RIFF');assert.equal(result.audio.readUInt16LE(22),1);assert.equal(result.audio.readUInt32LE(24),16000);
 assert.throws(()=>validateRemote({...input,endMs:20000}),/Intervalle/);
 assert.throws(()=>validateRemote({...input,frames:[input.frames[1],input.frames[0]]}),/Ordre/);
 await assert.rejects(new RemoteMedia().assemble({...input,audio:Buffer.from('not wave').toString('base64')}),/WAV/);
});

test('cleanup failure preserves an abort reason that cannot carry the cleanup diagnostic', async t => {
 const setter = Object.defineProperty({}, 'cleanup', {
  set() { throw Error('setter refused'); }
 });
 const proxy = new Proxy({}, {
  set() { throw Error('proxy refused'); }
 });
 const reasons = [
  ['string', 'cancelled'], ['number', 42], ['null', null], ['undefined', undefined],
  ['frozen error', Object.freeze(Error('cancelled'))], ['throwing setter', setter], ['throwing proxy', proxy]
 ];
 for (const [name, reason] of reasons) await t.test(name, async t => {
  const controller = new AbortController();
  // abort(undefined) produit une DOMException native ; cette doublure exerce aussi un rejet undefined.
  const signal = reason === undefined ? {
   throwIfAborted() { if (controller.signal.aborted) throw reason; }
  } : controller.signal;
  const dir = path.join(os.tmpdir(), 'tvlens-ingest-double');
  t.mock.method(fs, 'mkdtemp', async () => {
   controller.abort(reason);
   return dir;
  });
  const cleanup = Object.assign(Error('cleanup refused'), { code: 'EBUSY' });
  const removal = t.mock.method(fs, 'rm', async () => {
   throw cleanup;
  });
  const input = { sessionId: 'test', sequence: 1, startMs: 0, endMs: 100, frames: [{ atMs: 0, data: 'YQ==' }] };
  await assert.rejects(new RemoteMedia().assemble(input, { signal }), error => {
   assert.strictEqual(error, reason);
   return true;
  });
  assert.deepEqual(removal.mock.calls.map(call => call.arguments[0]), [dir]);
 });
});

const validBlock = () => ({
 sessionId: 's', sequence: 1, startMs: 0, endMs: 100,
 frames: [{ atMs: 0, data: Buffer.from('not an image').toString('base64') }],
});
for (const [condition, change, message] of [
 ['invalid sequence', { sequence: -1 }, 'Séquence invalide.'],
 ['long interval', { endMs: 20000 }, 'Intervalle invalide.'],
 ['empty frames', { frames: [] }, 'Nombre d’images invalide.'],
 ['null frame', { frames: [null] }, 'Ordre des images invalide.'],
 ['missing frame', { frames: [undefined] }, 'Ordre des images invalide.'],
 ['numeric frame', { frames: [42] }, 'Ordre des images invalide.'],
 ['boolean frame', { frames: [true] }, 'Ordre des images invalide.'],
 ['string frame', { frames: ['frame'] }, 'Ordre des images invalide.'],
 ['frame order', { frames: [{ atMs: -1, data: 'YQ==' }] }, 'Ordre des images invalide.'],
 ['base64 encoding', { frames: [{ atMs: 0, data: 'invalid!' }] }, 'Média encodé invalide.'],
 ['empty decoded media', { frames: [{ atMs: 0, data: 'A' }] }, 'Média trop volumineux.'],
 ['invalid crop', { frames: [{ atMs: 0, data: 'YQ==', crop: { x: -1 } }] }, 'Cadrage invalide.'],
]) {
 test(`remote block validation identifies ${condition}`, () => {
  assert.throws(() => validateRemote({ ...validBlock(), ...change }), error => {
   assert.equal(error.code, 'TVLENS_MEDIA_BLOCK_INVALID');
   assert.equal(require('../adapters/remote-media.cjs').TVLENS_MEDIA_BLOCK_INVALID, error.code);
   assert.equal(error.message, message);
   assert.equal(error.status, undefined);
   return true;
  });
 });
}

for (const transform of [false, true]) {
 test(`image refusal publishes a fixed message and preserves the sharp cause (transformation: ${transform})`, async () => {
  const input = validBlock();
  if (transform) input.frames[0] = {
   atMs: 0,
   data: (await sharp({ create: { width: 1, height: 1, channels: 3, background: '#fff' } }).png().toBuffer()).toString('base64'),
   crop: { x: 0, y: 0, width: 16, height: 16 },
  };
  await assert.rejects(new RemoteMedia().assemble(input), error => {
   assert.equal(error.code, 'TVLENS_MEDIA_IMAGE_UNREADABLE');
   assert.equal(require('../adapters/remote-media.cjs').TVLENS_MEDIA_IMAGE_UNREADABLE, error.code);
   assert.ok(error.cause instanceof Error);
   assert.equal(error.message, 'Image illisible.');
   assert.match(error.cause.message, transform ? /extract_area/ : /unsupported image format/);
   assert.equal(error.status, undefined);
   return true;
  });
 });
}

test('a non-WAV block retains its validation identity after frame work settles', async () => {
 const data = (await sharp({ create: { width: 32, height: 32, channels: 3, background: '#fff' } }).jpeg().toBuffer()).toString('base64');
 await assert.rejects(new RemoteMedia().assemble({ ...validBlock(), frames: [{ atMs: 0, data }], audio: 'YQ==' }), {
  code: 'TVLENS_MEDIA_BLOCK_INVALID', message: 'Audio WAV requis.',
 });
});

test('an executed media tool refusal has a fixed message and keeps stderr in its cause', async t => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-media-refused-'));
 t.after(() => fs.rm(root, { recursive: true, force: true }));
 const binary = path.join(root, 'refusing-tool'), detail = 'boom: /private/tvlens-refused/source.wav';
 await fs.writeFile(binary, `#!${process.execPath}\nprocess.stderr.write(${JSON.stringify(detail)});process.exit(1);\n`, { mode: 0o700 });
 const data = (await sharp({ create: { width: 32, height: 32, channels: 3, background: '#fff' } }).jpeg().toBuffer()).toString('base64');
 await assert.rejects(new RemoteMedia({ ffmpeg: binary }).assemble({ ...validBlock(), frames: [{ atMs: 0, data }] }), error => {
  assert.equal(error.code, 'TVLENS_MEDIA_TOOL_REFUSED');
  assert.equal(require('../adapters/remote-media.cjs').TVLENS_MEDIA_TOOL_REFUSED, error.code);
  assert.equal(error.message, 'Préparation média échouée.');
  assert.ok(error.cause instanceof Error);
  assert.equal(error.cause.message, detail);
  assert.equal(error.status, undefined);
  return true;
 });
});

test('a tool terminated by the system keeps its unclassified failure instead of blaming content', async t => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-media-signal-'));
 t.after(() => fs.rm(root, { recursive: true, force: true }));
 const binary = path.join(root, 'interrupted-tool');
 await fs.writeFile(binary, `#!${process.execPath}\nprocess.kill(process.pid, 'SIGTERM');\n`, { mode: 0o700 });
 const data = (await sharp({ create: { width: 32, height: 32, channels: 3, background: '#fff' } }).jpeg().toBuffer()).toString('base64');
 await assert.rejects(new RemoteMedia({ ffmpeg: binary }).assemble({ ...validBlock(), frames: [{ atMs: 0, data }] }), error => {
  assert.equal(error.code, undefined);
  assert.equal(error.status, undefined);
  assert.equal(error.message, 'Préparation média échouée : ');
  return true;
 });
});
