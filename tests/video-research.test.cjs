const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {MemorySearch}=require('../core/moment-search.cjs');const {VideoTools}=require('../core/video-tools.cjs');const {DeepAsk}=require('../core/deep-ask.cjs');const {LocalSessionStore}=require('../adapters/local-store.cjs');
const {consultationFrom,rereadOf}=require('./helpers/memory-consultation.cjs');
const {deferred,turns}=require('./helpers/wait.cjs');const {VirtualClock}=require('./helpers/clock.cjs');
const segments=[{id:'moment-1',startMs:0,endMs:15000,available:true,observation:{summary:'Une automobile s’immobilise.'}},{id:'moment-2',startMs:15000,endMs:30000,available:true,observation:{summary:'Un chien court.'}}];
const cache=()=>{const m=new Map();return {get:async(id,t)=>m.get(id+t),put:async(id,t,v)=>m.set(id+t,v)}};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('hybrid retrieval finds semantic paraphrases and excludes future evidence; temporal references bypass embeddings',async()=>{
 let calls=0;const search=new MemorySearch({embeddings:{embed:async text=>{calls++;return /chien/.test(text)?[0,1]:[1,0]}},cache:cache()});
 let r=await search.search({query:'voiture arrêtée',segments,anchorMs:30000});assert.equal(r.moments[0].id,'moment-1');assert.equal(r.mode,'hybrid');
 const count=calls;r=await search.search({query:'il y a deux secondes',segments,anchorMs:15000});assert.equal(calls,count);assert.equal(r.moments[0].id,'moment-1');assert.equal(r.moments.length,1);
});
test('embedding failure degrades to explicitly labelled lexical search',async()=>{
 const search=new MemorySearch({embeddings:{embed:async()=>{throw Error('offline')}},cache:cache()});const r=await search.search({query:'chien',segments,anchorMs:30000});assert.equal(r.moments[0].id,'moment-2');assert.equal(r.mode,'lexical');assert.equal(r.warnings.length,1);
});
test('video tools freeze prefix, reject expired/future media and filter fabricated evidence',async()=>{
 const snap={id:'s',history:[],segments:structuredClone(segments)};let leases=0,current=snap;
 const consultation=consultationFrom(snap);
 const tools=new VideoTools({consultation,reread:rereadOf(()=>current),search:{},media:{lease:async()=>{leases++;return async()=>leases--}},inspector:{inspect:async()=>({observations:[{id:'moment-1',startMs:1,endMs:2,text:'Visible'},{id:'fake',startMs:1,endMs:2,text:'Inventé'}]})}});
 consultation.passages.push(consultationFrom({id:'s',segments:[{id:'future',startMs:30000,endMs:45000}]}).passages[0]);assert.equal(tools.anchorMs,30000);
 await assert.rejects(tools.call('inspect_clip',{startMs:29999,endMs:30001,question:'Que fait-il ?'}),/postérieur/);
 const r=await tools.call('inspect_clip',{startMs:0,endMs:15000,question:'Que fait-il ?'});assert.equal(r.observations.length,1);assert.equal(leases,0);
 // The session has since lost the media of the first passage: the next consultation boundary reads it so.
 current={...snap,segments:[{...snap.segments[0],available:false},snap.segments[1]]};
 await assert.rejects(tools.call('inspect_clip',{startMs:0,endMs:15000,question:'Et ?'}),/expiré/);
});
test('retention lease defers actual deletion only until inspection releases it',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-lease-test-'));try{const media=new LocalSessionStore(dir);await media.put('moment-1',{clip:Buffer.from('video'),frames:[],audio:null});const release=await media.lease(['moment-1']);await media.remove('moment-1');await fs.access(media.file('moment-1','webm'));await release();await assert.rejects(fs.access(media.file('moment-1','webm')));}finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('new questions queue without cancelling; explicit cancellation ignores late output and starts the next job',async()=>{
 const gates=[];const service=new DeepAsk({makeTools:()=>({observations:[],hypotheses:[],limits:[]}),agent:{answer:({signal})=>new Promise(resolve=>gates.push({resolve,signal}))},timeoutMs:1000});
 service.start('first');service.start('second');assert.equal(gates[0].signal.aborted,false);assert.equal(service.jobs[1].status,'queued');assert.equal(gates.length,1);
 service.cancel('Manual',service.jobs[0].id);await service.jobs[0].done;assert.equal(gates[0].signal.aborted,true);gates[0].resolve({answer:'stale',citations:[]});gates[1].resolve({answer:'new',citations:[]});await service.jobs[1].done;
 assert.equal(service.jobs[0].status,'cancelled');assert.equal(service.jobs[0].result,null);assert.equal(service.jobs[1].status,'done');assert.doesNotThrow(()=>structuredClone(service.snapshot()));
});
test('queued questions inherit the completed answer, preserve submission snapshot, and get their own processing deadline',async()=>{
 let release;let anchor=10;const inputs=[];const service=new DeepAsk({makeTools:()=>({sessionId:'s',anchorMs:anchor,observations:[],hypotheses:[],limits:[]}),agent:{answer:async input=>{inputs.push(input);if(inputs.length===1)await new Promise(r=>release=r);return {answer:'Answer',kind:'explanation',citations:[],sources:[],limits:[]};}},timeoutMs:1000});
 service.start('first',{mode:'chat'});service.start('followup',{mode:'chat'});anchor=100;assert.equal(service.jobs[1].startedAt,undefined);release();await Promise.all(service.jobs.map(j=>j.done));assert.ok(service.jobs.every(j=>j.status==='done'));assert.equal(inputs[1].conversation[0].answer,'Answer');assert.equal(inputs[1].tools.anchorMs,10);
});
test('queued cancellation is per question; session reset cancels all outstanding questions',async()=>{
 const service=new DeepAsk({makeTools:()=>({observations:[],hypotheses:[],limits:[]}),agent:{answer:()=>new Promise(()=>{})}});service.start('first');service.start('second');service.start('third');service.cancel('Removed',service.jobs[1].id);assert.equal(service.jobs[0].status,'running');assert.equal(service.jobs[2].status,'queued');service.cancelAll();await Promise.all(service.jobs.map(j=>j.done));assert.ok(service.jobs.every(j=>j.status==='cancelled'));
});
test('deadline returns only acquired observations even if agent never finishes',async()=>{
 const messages=[];
 const service=new DeepAsk({makeTools:()=>({observations:[{id:'moment-1',startMs:0,endMs:1,text:'Un cercle'}],hypotheses:[],limits:[]}),agent:{answer:()=>new Promise(()=>{})},onChange:s=>messages.push(s.jobs[0].message),timeoutMs:25,progressMs:10});service.start('why');await service.jobs[0].done;assert.equal(service.jobs[0].status,'timeout');assert.equal(service.jobs[0].result.answer,'Un cercle');assert.equal(service.active,null);
 assert.ok(messages.some(m=>m.includes('La recherche continue')));
});
test('a confident agent answer without inspected evidence becomes an explicit abstention',async()=>{
 const service=new DeepAsk({makeTools:()=>({observations:[],hypotheses:[],limits:['Aucun geste visible.']}),agent:{answer:async()=>({answer:'Il trébuche sur une pierre.',kind:'observation',citations:[{id:'moment-1',startMs:0,endMs:1000}],limits:[]})}});
 service.start('Pourquoi est-il tombé ?');await service.jobs[0].done;
 assert.equal(service.jobs[0].result.kind,'insufficient');assert.deepEqual(service.jobs[0].result.citations,[]);
 assert.ok(!service.jobs[0].result.answer.includes('pierre'));
});
test('external bridge authenticates capability and real MCP stdio tool calls reach scoped domain',async()=>{
 const {VideoBridge}=require('../adapters/video-bridge.cjs');const {Client}=require('@modelcontextprotocol/sdk/client/index.js');const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-mcp-test-'));let bridge,client;
 try{bridge=await new VideoBridge({descriptor:path.join(dir,'bridge.json'),makeTools:()=>({call:async(name,args)=>({name,args,anchorMs:30000})})}).start();
 const denied=await fetch(bridge.url,{method:'POST',body:'{}'});assert.equal(denied.status,401);
 client=new Client({name:'test',version:'1'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('mcp/server.cjs'),`--descriptor=${bridge.descriptor}`]}));
 const list=await client.listTools();assert.deepEqual(list.tools.map(t=>t.name),['search_moments','get_transcript','inspect_clip']);
 const result=await client.callTool({name:'search_moments',arguments:{query:'un chien'}});assert.equal(JSON.parse(result.content[0].text).anchorMs,30000);
 const controller=new AbortController(),cap=path.join(dir,'cap.json');const revoke=await bridge.register({call:async()=>({ok:true})},controller.signal,cap);const data=JSON.parse(await fs.readFile(cap));controller.abort();const r=await fetch(bridge.url,{method:'POST',headers:{Authorization:`Bearer ${data.token}`},body:JSON.stringify({name:'search_moments',args:{query:'x'}})});assert.equal(r.status,401);revoke();
 }finally{await client?.close();await bridge?.close();await fs.rm(dir,{recursive:true,force:true})}
});
test('real clip decoding spans a segment boundary, aligns PCM audio and constructs native-video evidence',async()=>{
 const {run,ClipInspector}=require('../adapters/clip-inspector.cjs');
 const ffmpeg=process.env.TVLENS_FFMPEG||(process.platform==='darwin'?'/opt/homebrew/bin/ffmpeg':'ffmpeg');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-decode-test-'));
 try{
  const media=new LocalSessionStore(dir);await fs.mkdir(dir,{recursive:true});
  for(const id of ['moment-1','moment-2']){
   await run(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=red:s=160x90:r=10:d=2','-c:v','libvpx','-deadline','realtime',media.file(id,'webm')]);
   const wav=Buffer.alloc(44+2*16000*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
   await fs.writeFile(media.file(id,'json'),JSON.stringify({frames:[],audio:wav.toString('base64')}));
  }
  let evidence;const inspector=new ClipInspector({media,ffmpeg,model:{inspect:async input=>{evidence=input.segments;return {observations:[],hypotheses:[],limits:[]}}}});
  const result=await inspector.inspect({question:'Action ?',startMs:1000,endMs:3000,segments:[{id:'moment-1',startMs:0,endMs:2000},{id:'moment-2',startMs:2000,endMs:4000}],signal:AbortSignal.timeout(10000)});
  assert.equal(evidence.length,2);assert.ok(result.sampledFrames>=12&&result.sampledFrames<=32);
  for(const s of evidence){
   assert.equal(s.timeScale,4);
   const dataAt=s.audio.indexOf(Buffer.from('data'));
   const duration=s.audio.readUInt32LE(dataAt+4)/32000;
   assert.ok(duration>3.7&&duration<=4.1,`Aligned slowed audio: ${duration}s`);
  }
  for(const s of evidence){assert.ok(s.videoDataUrl.startsWith('data:video/mp4;base64,'));assert.ok(s.frames.every(f=>f.atMs>=s.startMs&&f.atMs<=s.endMs));}
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});

// A media port that counts what it lends and what comes back, once per lease.
function leasing() {
  const media = { leased: [], returned: [], held: 0, reads: 0 };
  media.lease = async ids => {
    media.leased.push([...ids]); media.held++;
    let given = false;
    return async () => { if (!given) { given = true; media.held--; media.returned.push([...ids]); } };
  };
  media.read = async () => { media.reads++; return { frames: [], audio: null }; };
  return media;
}
// An inspector that says when it is reached and answers when the test decides.
function heldInspector() {
  const calls = [], reached = [deferred(), deferred(), deferred()];
  return { calls, reached, inspect: input => {
    const answer = deferred();
    calls.push({ input, answer });
    reached[calls.length - 1].resolve();
    return answer.promise;
  } };
}
const watched = (n, extra = {}) => ({ id: `moment-${n}`, startMs: (n - 1) * 8000, endMs: n * 8000, status: 'ready', audioStatus: 'ready',
  visionStatus: 'ready', available: true, revision: 1, observation: { summary: `Passage ${n}`, transcript: `Paroles ${n}` }, ...extra });
const frozenTools = (state, extra = {}) => new VideoTools({ consultation: consultationFrom(state), ...extra });

test('an inspection leases only the passages it admits, holds them for its whole call and gives them back on success and on failure', async () => {
  const media = leasing(), inspector = heldInspector();
  const tools = frozenTools({ id: 's', elapsedMs: 24000, segments: [watched(1), watched(2), watched(3)] }, { media, inspector });
  const succeeding = tools.call('inspect_clip', { startMs: 9000, endMs: 15000, question: 'Que voit-on ?' });
  await inspector.reached[0].promise;
  assert.deepEqual([media.leased, media.held, inspector.calls[0].input.segments.map(s => s.id)], [[['moment-2']], 1, ['moment-2']]);
  inspector.calls[0].answer.resolve({ observations: [{ id: 'moment-2', startMs: 9000, endMs: 15000, text: 'Vu.' }] });
  assert.deepEqual((await succeeding).observations.map(o => o.id), ['moment-2']);
  assert.deepEqual([media.held, media.returned], [0, [['moment-2']]]);
  const failing = tools.call('inspect_clip', { startMs: 14000, endMs: 18000, question: 'Et là ?' });
  await inspector.reached[1].promise;
  assert.deepEqual([media.leased[1], media.held], [['moment-2', 'moment-3'], 1], 'held while the inspector works');
  inspector.calls[1].answer.reject(Error('Inspecteur indisponible.'));
  await assert.rejects(failing, /Inspecteur indisponible/);
  assert.deepEqual([media.held, media.returned, tools.busy], [0, [['moment-2'], ['moment-2', 'moment-3']], false]);
  assert.deepEqual(tools.journal.map(e => [e.source, e.id]), [['inspect_clip', 'moment-2']], 'a failed inspection records nothing');
  assert.equal(media.reads, 0, 'the tools never read media themselves');
});

test('absent or expired media are refused by availability or by the lease, and an unreadable clip with kept images is still re-examined', async t => {
  const { createMemoryMedia } = require('../runtime/memory-media.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-lease-refusal-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = new LocalSessionStore(dir), frames = [{ atMs: 0, dataUrl: 'data:image/jpeg;base64,YQ==' }];
  for (const id of ['moment-1', 'moment-4']) await store.put(id, { clip: Buffer.from('video'), frames, audio: null });
  const state = { id: 's', elapsedMs: 48000, history: [], segments: [
    watched(1), watched(2), watched(3, { available: false, mediaReason: 'missing' }), watched(4, { available: false, mediaReason: 'unreadable' }),
    watched(5, { available: false, mediaReason: 'unreadable' }), watched(6, { available: false })] };
  const consultation = consultationFrom(state);
  // Known at capture to hold no image: nothing is left to re-examine.
  consultation.passages[4].availability.images = false;
  const open = () => {
    const leases = [], media = createMemoryMedia(store), inspected = [];
    return { leases, inspected, tools: new VideoTools({ consultation, inspector: { inspect: async input => {
      inspected.push(input.segments.map(s => [s.id, s.available, s.mediaReason]));
      return { observations: [{ id: input.segments[0].id, startMs: input.startMs, endMs: input.endMs, text: 'Vu.' }] };
    } }, media: { read: media.read, lease: ids => { leases.push(ids); return media.lease(ids); } } }) };
  };
  const ask = (tools, n) => tools.call('inspect_clip', { startMs: (n - 1) * 8000, endMs: n * 8000, question: 'Que voit-on ?' });
  const replayable = open();
  assert.equal((await ask(replayable.tools, 1)).observations.length, 1);
  // Announced replayable, but its files are gone: the lease refuses it, with the words the agent always read.
  const gone = open();
  await assert.rejects(ask(gone.tools, 2), { code: 'TVLENS_MEMORY_MEDIA_UNAVAILABLE', message: 'Média expiré ou indisponible.' });
  assert.deepEqual([gone.leases, gone.inspected, gone.tools.busy], [[['moment-2']], [], false]);
  for (const [n, message] of [[3, /^Média introuvable sur le disque/], [5, /^Média expiré : seul son résumé/], [6, /^Média expiré : seul son résumé/]]) {
    const refused = open();
    await assert.rejects(ask(refused.tools, n), { message });
    assert.deepEqual([refused.leases, refused.inspected], [[], []], `moment-${n} is refused before any lease`);
  }
  const unreadable = open();
  assert.equal((await ask(unreadable.tools, 4)).observations.length, 1);
  assert.deepEqual([unreadable.leases, unreadable.inspected], [[['moment-4']], [[['moment-4', false, 'unreadable']]]]);
  const read = await unreadable.tools.call('get_transcript', { startMs: 24000, endMs: 40000 });
  assert.deepEqual(read.passages.map(p => [p.id, p.available, p.mediaReason]), [['moment-4', false, 'unreadable'], ['moment-5', false, 'unreadable']]);
  assert.deepEqual(unreadable.tools.memoryEvidence.map(e => [e.id, e.mediaReason]), [['moment-4', 'unreadable'], ['moment-5', 'unreadable']]);
  // A missing or expired passage keeps the shape it always had: no reason is published for it.
  const expired = await unreadable.tools.call('get_transcript', { startMs: 16000, endMs: 24000 });
  assert.deepEqual(expired.passages.map(p => [p.available, 'mediaReason' in p]), [[false, false]]);
});

test('with agent and tool held apart, a cancellation or a ceiling settles the question but lets nothing go before their real returns', async () => {
  const clock = new VirtualClock().install();
  try {
    const state = { id: 's', elapsedMs: 16000, history: [], segments: [watched(1), watched(2)] };
    const scenario = () => {
      const media = leasing(), inspector = heldInspector(), agents = [];
      let inspection;
      const deep = new DeepAsk({ timeoutMs: 1000, makeTools: signal => frozenTools(state, { signal, media, inspector, search: {} }),
        agent: { answer: ({ question, tools }) => {
          if (question !== 'Longue ?') return Promise.resolve({ answer: 'Ok.', kind: 'explanation', citations: [], limits: [] });
          inspection = tools.call('inspect_clip', { startMs: 0, endMs: 8000, question: 'Que voit-on ?' }).catch(error => error);
          const agent = deferred();
          agents.push(agent);
          return agent.promise;
        } } });
      const ask = question => { const { id } = deep.start(question, { mode: 'chat' }); return deep.jobs.find(job => job.id === id); };
      return { media, inspector, agents, deep, ask, inspection: () => inspection };
    };
    const settledLater = async (s, job, settle, agentReturned = false) => {
      await s.inspector.reached[0].promise;
      await settle();
      // The viewer sees the question settled; the agent and its inspection are still out, and keep what they hold.
      assert.deepEqual([s.media.held, job.tools.consultationScope().passages.map(p => p.id)], [1, ['moment-1', 'moment-2']]);
      s.agents[0].resolve({ answer: 'Trop tard.', kind: 'observation', citations: [], limits: [] });
      await (agentReturned ? job.done : turns(4));
      assert.deepEqual([s.media.held, job.tools.consultationScope().passages.length], [1, 2], 'the inspection still runs');
      s.inspector.calls[0].answer.resolve({ observations: [{ id: 'moment-1', startMs: 0, endMs: 8000, text: 'Vu trop tard.' }] });
      await s.inspection();
      await turns(4);
      assert.deepEqual([s.media.held, s.media.returned, job.tools.observations, job.tools.consultationScope().passages], [0, [['moment-1']], [], []]);
      // Released: nothing is read, leased or recorded any more.
      const journal = JSON.stringify(job.tools.journal);
      await assert.rejects(job.tools.call('get_transcript', { startMs: 0, endMs: 8000 }));
      assert.deepEqual([s.media.leased.length, s.media.reads, JSON.stringify(job.tools.journal)], [1, 0, journal]);
    };

    const cancelled = scenario(), long = cancelled.ask('Longue ?'), queued = cancelled.ask('En attente ?');
    // Never handed to an agent: its context is given back at once.
    cancelled.deep.cancel('Question annulée.', queued.id);
    assert.deepEqual([queued.status, queued.tools.consultationScope().passages], ['cancelled', []]);
    assert.deepEqual(cancelled.media.leased, [['moment-1']], 'only the running question asked for media');
    await settledLater(cancelled, long, () => {
      cancelled.deep.cancel('Question annulée.', long.id);
      assert.equal(long.status, 'cancelled');
    });

    const ceiling = scenario(), slow = ceiling.ask('Longue ?');
    await settledLater(ceiling, slow, async () => {
      await clock.runUntil(1001);
      assert.deepEqual([slow.status, slow.message], ['timeout', 'Limite de 1 seconde atteinte.']);
    });

    // An agent that answers while its own inspection is still out: the answer stands, the context waits for the
    // inspection, and what it brings back afterwards is neither recorded nor used.
    const answered = scenario(), early = answered.ask('Longue ?');
    await settledLater(answered, early, () => {}, true);
    assert.deepEqual([early.status, early.result.observations, early.tools.journal.some(e => e.source === 'inspect_clip')], ['done', [], false]);
  } finally { clock.uninstall(); }
});
