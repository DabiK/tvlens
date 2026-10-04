const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { whisperDiagnostics } = require('../adapters/whisper-diagnostics.cjs');
const { LocalTranscriber } = require('../adapters/local-transcriber.cjs');
test('diagnostics expose numeric timings and fallbacks without stderr content', () => {
 const value = whisperDiagnostics('private utterance\nwhisper_print_timings: load time = 123.40 ms\nwhisper_print_timings: fallbacks = 2 p / 1 h\nwhisper_print_timings: batchd time = 765.43 ms / 3 runs\nwhisper_print_timings: total time = 900.1 ms');
 assert.deepEqual(value,{loadMs:123.4,batchdMs:765.43,totalMs:900.1,logprobFallbacks:2,entropyFallbacks:1});
 assert.deepEqual(whisperDiagnostics('unknown backend output'),{});
});
test('thread selection is bounded and defaults to available CPUs capped at four', () => {
 assert.equal(new LocalTranscriber().threads,Math.min(4,os.availableParallelism()));
 for(const threads of [0,-1,17,NaN,1.5,'2'])assert.throws(()=>new LocalTranscriber({threads}));
});
test('actual child receives threads; bounded stderr drains and cached response does not reuse inference timings', async () => {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-diagnostics-test-'));
 try {
  const binary=path.join(dir,'whisper');
  await fs.writeFile(binary,`#!${process.execPath}\nconst fs=require('node:fs');const a=process.argv.slice(2);process.stderr.write('private utterance '.repeat(10000)+'\\nwhisper_print_timings: total time = 42.5 ms\\nwhisper_print_timings: fallbacks = 1 p / 0 h\\n');fs.writeFileSync(a[a.indexOf('-of')+1]+'.json',JSON.stringify({transcription:[{text:a[a.indexOf('-t')+1]}]}));`,{mode:0o700});
  const t=new LocalTranscriber({binary,model:binary,threads:2});
  const result=await t.transcribe(Buffer.from('fixture'));
  assert.equal(result.text,'2');assert.equal(result.metrics.totalMs,42.5);
  assert.equal(result.metrics.logprobFallbacks,1);
  assert.equal(JSON.stringify(result).includes('private utterance'),false);
  const cached=await t.transcribe(Buffer.from('fixture'));
  assert.equal(cached.cacheHit,true);assert.equal(cached.metrics.totalMs,undefined);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('aborting an active Whisper child still rejects promptly', async () => {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-abort-test-'));
 try {
  const binary=path.join(dir,'whisper');
  await fs.writeFile(binary,`#!${process.execPath}\nsetTimeout(()=>{},10000);`,{mode:0o700});
  const t=new LocalTranscriber({binary,model:binary});
  await assert.rejects(t.transcribe(Buffer.from('fixture'),AbortSignal.timeout(100)),/timeout/i);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
