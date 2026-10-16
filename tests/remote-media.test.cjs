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
