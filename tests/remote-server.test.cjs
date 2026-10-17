const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {HeadlessRuntime}=require('../runtime/headless-runtime.cjs');
const {RemoteServer}=require('../server/http.cjs');
const { deferred } = require('./helpers/wait.cjs');
const { copyPrunedArchive } = require('./helpers/pruned-archive.cjs');
const token='a'.repeat(64);

test('the server ignores foreign question publications and keeps its closing lock without active jobs', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-question-ownership-'));
  const gate = deferred();
  const runtime = new HeadlessRuntime({
    userData: dir, sessionsRoot: path.join(dir, 'sessions'), config: {}, selectedModels: {}, smoke: true,
    agent: { answer: async () => ({ answer: 'Ok.', kind: 'explanation', citations: [], limits: [] }) },
  });
  t.after(async () => { gate.resolve(); await runtime.close(); await fs.rm(dir, { recursive: true, force: true }); });
  const session = await runtime.start();
  const published = [];
  runtime.listeners.add(state => published.push(state.session?.asking));
  for (const status of ['queued', 'running']) {
    runtime.deep.onChange({ jobs: [{ id: 'foreign', sessionId: 'other-session', status }] });
    assert.equal(runtime.snapshot().session.asking, false, 'foreign publication');
    runtime.deep.onChange({ jobs: [{ id: 'historical', status }] });
    assert.equal(runtime.snapshot().session.asking, false, 'missing session identity');
    runtime.deep.onChange({ jobs: [{ id: 'own', sessionId: session.id, status }] });
    assert.equal(runtime.snapshot().session.asking, true, status);
    runtime.deep.onChange({ jobs: [{ id: 'own', sessionId: session.id, status: 'done' }] });
    assert.equal(runtime.snapshot().session.asking, false);
  }
  assert.ok(published.includes(true));
  const entered = deferred(), pause = runtime.session.pause;
  runtime.session.pause = async () => { entered.resolve(); await gate.promise; return pause(); };
  const closing = runtime.close();
  runtime.deep.onChange({ jobs: [] });
  assert.equal(runtime.snapshot().session.asking, true, 'closing is a separate lock');
  await entered.promise;
  runtime.deep.onChange({ jobs: [] });
  assert.equal(runtime.snapshot().session.asking, true, 'an empty publication cannot release the closing lock');
  gate.resolve();
  runtime.listeners.clear();
  await closing;
});
test('authenticated remote session: ingest dedupe, anchored FIFO, targeted cancel, pause/resume',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-remote-test-'));let finishFirst;let clock=0;
 const first=new Promise(resolve=>finishFirst=resolve);let started;
 const invoked=new Promise(resolve=>started=resolve);
 const agent={answer:async({question,signal})=>{started();if(question==='first')await Promise.race([first,new Promise(r=>signal.addEventListener('abort',r,{once:true}))]);return {answer:question,kind:'explanation',citations:[],limits:[]};}};
 // L’ancienne option ne change plus la conservation des nouvelles captures.
 const runtime=new HeadlessRuntime({userData:dir,sessionsRoot:path.join(dir,'sessions'),config:{},selectedModels:{observationModel:'test',inspectionModel:'test',codexModel:'test'},smoke:true,agent,readClock:()=>clock,retentionMs:300000});
 let assemblies=0;const media={assemble:async x=>{assemblies++;return {...x,clip:Buffer.from('fixture'),frames:[{atMs:x.startMs,dataUrl:'data:image/jpeg;base64,YQ=='}],audio:null};}};
 const server=await new RemoteServer({runtime,media,token}).listen(0,'127.0.0.1');
 t.after(async()=>{finishFirst();await server.close();await runtime.close();await fs.rm(dir,{recursive:true,force:true});});
 async function req(route,body,auth=token){const res=await fetch(server.url+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,value:await res.json()};}
 assert.equal((await req('/v1/state',null,'wrong')).status,401);
 const session=(await req('/v1/session/start',{})).value;
 clock=200;
 const segment={sessionId:session.id,sequence:0,startMs:0,endMs:100,frames:[{atMs:0,data:'YQ=='}]};
 assert.equal((await req('/v1/segments',segment)).status,200);
 assert.equal((await req('/v1/segments',segment)).value.duplicate,true);assert.equal(assemblies,1);
 assert.equal((await req('/v1/segments',{...segment,endMs:200})).status,409);
 const a=(await req('/v1/questions',{sessionId:session.id,question:'first',anchorMs:100})).value;await invoked;
 const b=(await req('/v1/questions',{sessionId:session.id,question:'second',anchorMs:100})).value;
 let state=(await req('/v1/state')).value;
 assert.deepEqual(state.chat.jobs.map(j=>j.status),['running','queued']);
 assert.equal(state.chat.jobs[1].anchorMs,100);
 // The cancellation reports what really happened to the question, not a constant.
 assert.deepEqual((await req('/v1/questions/'+b.id+'/cancel',{})).value,{cancelled:true,status:'cancelled'});
 assert.equal((await req('/v1/state')).value.chat.jobs[0].status,'running');
 finishFirst();await runtime.deep.jobs[0].done;
 await req('/v1/session/pause',{});
 const resumed=(await req('/v1/session/start',{})).value;
 assert.equal(resumed.id,session.id);assert.equal((await req('/v1/state')).value.chat.jobs[0].result.answer,'first');
 assert.equal((await req('/v1/questions',{sessionId:'stale',question:'no',anchorMs:100})).status,400);
 clock=3000;
 assert.equal((await req('/v1/segments',{...segment,sequence:1,startMs:2100,endMs:2200,frames:[{atMs:2100,data:'YQ=='}]})).status,200);
 assert.deepEqual((await req('/v1/state')).value.captureGaps,[{startMs:100,endMs:2100}]);
 assert.equal((await req('/v1/segments',{...segment,sequence:1,endMs:9000})).status,400);
 const expiredBefore=await fetch(server.url+'/v1/media/moment-1',{headers:{Authorization:'Bearer '+token,Range:'bytes=0-2'}});
 assert.equal(expiredBefore.status,206);assert.equal(await expiredBefore.text(),'fix');
 clock=301000;runtime.session.watch.emit();
 assert.equal((await fetch(server.url+'/v1/media/moment-1',{headers:{Authorization:'Bearer '+token}})).status,200);
 assert.equal((await req('/v1/state')).value.chat.jobs[0].result.answer,'first','durable media preserves conversation');
 await req('/v1/session/end',{});
 const historical=await copyPrunedArchive(runtime.library.root);
 await req('/v1/sessions/'+historical.id+'/open',{});
 assert.equal((await req('/v1/media/moment-1')).status,410);
 assert.equal((await req('/v1/state')).value.chat.jobs[0].result.answer,'Un cercle bleu.');
});
test('a running question exposes its ceiling and the server clock, lets capture continue, and its HTTP cancellation tells what really happened',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-remote-question-'));let clock=0,wall=1790000000000,started;
 const invoked=new Promise(resolve=>started=resolve);
 // Never answers by itself: only its cancellation ends the long question.
 const agent={answer:async({question,signal})=>{if(question==='longue'){started();await new Promise(r=>signal.addEventListener('abort',r,{once:true}));}return {answer:question,kind:'explanation',citations:[],limits:[]};}};
 // The ceiling is the reversible host setting (TVLENS_QUESTION_TIMEOUT_MS), lowered here to show it reaches the state.
 const runtime=new HeadlessRuntime({userData:dir,sessionsRoot:path.join(dir,'sessions'),config:{questionTimeoutMs:120000},selectedModels:{},smoke:true,agent,readClock:()=>clock,wallClock:()=>wall});
 const media={assemble:async x=>({...x,clip:Buffer.from('fixture'),frames:[{atMs:x.startMs,dataUrl:'data:image/jpeg;base64,YQ=='}],audio:null})};
 const server=await new RemoteServer({runtime,media,token}).listen(0,'127.0.0.1');
 t.after(async()=>{await server.close();await runtime.close();await fs.rm(dir,{recursive:true,force:true});});
 const req=async(route,body)=>{const res=await fetch(server.url+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,value:await res.json()};};
 const session=(await req('/v1/session/start',{})).value;
 const long=(await req('/v1/questions',{sessionId:session.id,question:'longue',anchorMs:0})).value;await invoked;
 const next=(await req('/v1/questions',{sessionId:session.id,question:'suivante',anchorMs:0})).value;
 // 72 s later on the server clock: the client shows elapsed / ceiling from the state alone, never from its own clock.
 wall+=72000;clock=8000;
 let state=(await req('/v1/state')).value;
 assert.deepEqual(state.chat.jobs.map(j=>[j.status,j.timeoutMs]),[['running',120000],['queued',120000]]);
 assert.deepEqual([state.chat.timeoutMs,state.serverNowMs,state.serverNowMs-state.chat.jobs[0].startedAt],[120000,wall,72000]);
 assert.equal((await req('/v1/state?view=chat')).value.serverNowMs-(await req('/v1/state?view=chat')).value.chat.jobs[0].startedAt,72000);
 // Capture is not held by the question: a block is accepted and stored while it runs.
 assert.deepEqual((await req('/v1/segments',{sessionId:session.id,sequence:0,startMs:0,endMs:8000,frames:[{atMs:0,data:'YQ=='}]})).value,{id:'moment-1',duplicate:false});
 state=(await req('/v1/state')).value;
 assert.deepEqual([state.session.asking,state.session.segments.map(s=>[s.id,s.available]),state.chat.jobs[0].status],[true,[['moment-1',true]],'running']);
 assert.deepEqual((await req('/v1/questions/deep-99/cancel',{})).value,{cancelled:false,status:null});
 assert.deepEqual((await req('/v1/questions/'+long.id+'/cancel',{})).value,{cancelled:true,status:'cancelled'});
 // The next question starts at once with its own ceiling; its wait is measured apart.
 await runtime.deep.jobs.find(j=>j.id===next.id).done;
 state=(await req('/v1/state')).value;
 assert.deepEqual(state.chat.jobs.map(j=>[j.status,j.metrics.waitMs,j.metrics.totalMs]),[['cancelled',0,72000],['done',72000,0]]);
 assert.deepEqual([state.chat.jobs[0].message,state.chat.jobs[1].result.answer],['Question annulée.','suivante']);
 assert.deepEqual((await req('/v1/questions/'+long.id+'/cancel',{})).value,{cancelled:false,status:'cancelled'});
 assert.deepEqual((await req('/v1/questions/'+next.id+'/cancel',{})).value,{cancelled:false,status:'done'});
 while(runtime.session.watch.asking)await new Promise(r=>setImmediate(r));
 assert.equal((await req('/v1/state')).value.session.asking,false);
});
