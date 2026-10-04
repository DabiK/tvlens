const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { LocalTranscriber } = require('../adapters/local-transcriber.cjs');
const { TranscriptionSettings } = require('../adapters/transcription-settings.cjs');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
test('language persists, rejects invalid values, updates active shared config', async () => {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-language-'));
 try {
  const settings = new TranscriptionSettings(path.join(dir, 'settings.json'));
  assert.equal(await settings.load(), 'fr');
  const runtime = {options:{config:{},transcriptionSettings:settings},emit(){}};
  await HeadlessRuntime.prototype.setTranscriptionLanguage.call(runtime,'en');
  assert.equal(runtime.options.config.transcriptionLanguage,'en');
  assert.equal(await new TranscriptionSettings(settings.file).load(),'en');
  await assert.rejects(HeadlessRuntime.prototype.setTranscriptionLanguage.call(runtime,'invalid'));
  assert.equal(runtime.options.config.transcriptionLanguage,'en');
 } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
test('Whisper receives selected language; cache is language-specific and in-flight language is stable', async () => {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-whisper-language-'));
 try {
  const binary=path.join(dir,'whisper');
  await fs.writeFile(binary,`#!${process.execPath}\nconst fs=require('node:fs');const a=process.argv.slice(2);setTimeout(()=>fs.writeFileSync(a[a.indexOf('-of')+1]+'.json',JSON.stringify({transcription:[{text:a[a.indexOf('-l')+1]}]})),50);`,{mode:0o700});
  let language='fr';
  const transcriber=new LocalTranscriber({binary,model:binary,getLanguage:()=>language});
  const audio=Buffer.from('fixture');
  const pending=transcriber.transcribe(audio); language='en';
  assert.equal((await pending).text,'fr');
  assert.equal((await transcriber.transcribe(audio)).text,'en');
  assert.equal((await transcriber.transcribe(audio)).cacheHit,true);
  language='auto'; assert.equal((await transcriber.transcribe(audio)).text,'auto');
  assert.equal(transcriber.misses,3);
 } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
