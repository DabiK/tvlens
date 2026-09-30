const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {executable} = require('../adapters/system-paths.cjs');
const {loadConfig} = require('../adapters/config.cjs');

test('executable resolution handles PATH entries with spaces and explicit overrides', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens path '));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const binary=path.join(root,'tvlens-test-tool');
  await fs.writeFile(binary,'#!/bin/sh\nexit 0\n',{mode:0o700});
  assert.equal(executable('tvlens-test-tool',{environment:{PATH:root}}),binary);
  assert.equal(executable('tvlens-test-tool',{override:'/explicit/tool',environment:{PATH:root}}),'/explicit/tool');
  await fs.chmod(binary,0o600);
  assert.equal(executable('tvlens-test-tool',{environment:{PATH:root},home:root}),'tvlens-test-tool');
});
test('fresh installation works without an optional env file and keeps writable usage separate',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-config-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const configPath=path.join(root,'missing.env');
  const opts={configPath,userData:root,safeStorage:{isEncryptionAvailable:()=>false},environment:{TVLENS_FFMPEG:'/usr/bin/ffmpeg',TVLENS_USAGE_DIR:path.join(root,'data')}};
  const c=await loadConfig(opts);
  assert.equal(c.apiKey,'');
  assert.equal(c.ffmpeg,'/usr/bin/ffmpeg');
  assert.equal(c.researchBudgetFile,path.join(root,'data','research-budget.json'));
  await fs.writeFile(configPath,'TVLENS_FFMPEG=/file/ffmpeg\nTVLENS_WHISPER_BINARY=/custom/whisper\n');
  const d=await loadConfig(opts);
  assert.equal(d.ffmpeg,'/usr/bin/ffmpeg');
  assert.equal(d.whisperBinary,'/custom/whisper');
  await assert.rejects(loadConfig({...opts,configPath:root}),{code:'EISDIR'});
});
