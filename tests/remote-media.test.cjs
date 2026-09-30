const {test}=require('node:test');const assert=require('node:assert/strict');
const sharp=require('sharp');const {RemoteMedia,validateRemote}=require('../adapters/remote-media.cjs');
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
