const test=require('node:test');const assert=require('node:assert/strict');
const {CodexSessionClient}=require('../adapters/codex-session-client.cjs');
const {safeError}=require('../adapters/chat-trace.cjs');
test('failed turn emits correlated sanitized diagnostics without changing rejection',()=>{
 const old=process.env.TVLENS_CODEX_TRACE;process.env.TVLENS_CODEX_TRACE='1';const write=process.stderr.write;const lines=[];process.stderr.write=(s)=>{lines.push(JSON.parse(s));return true;};
 try{
  const client=new CodexSessionClient({webSearch:true});client.threadId='thread-test';client.sessionId='session-test';let rejected;
  client.active={jobId:'deep-1',turnId:'turn-test',text:'private prompt must not appear',reject:e=>rejected=e};
  client.event('item/started',{threadId:'thread-test',turnId:'turn-test',item:{id:'web-1',type:'webSearch',action:{type:'search',query:'private query'}}});
  client.event('turn/completed',{threadId:'thread-test',turn:{id:'turn-test',status:'failed',error:{code:'rate_limit',message:'Failed https://private.example/x?token=abc Bearer secret-value',stack:'private stack'}}});
  assert.equal(rejected.message,'Codex n’a pas terminé la réponse.');
  assert.equal(rejected.turnStatus,'failed');assert.equal(rejected.turnError.code,'rate_limit');assert.equal(rejected.authRequired,undefined);
  assert.ok(!JSON.stringify(rejected.turnError).includes('private.example'));assert.ok(!JSON.stringify(rejected.turnError).includes('secret-value'));const record=lines.find(x=>x.event==='turn/completed');assert.equal(record.status,'failed');assert.equal(record.error.code,'rate_limit');assert.equal(record.jobId,'deep-1');assert.equal(record.eventTurnId,'turn-test');
  const serialized=JSON.stringify(lines);for(const secret of ['private.example','secret-value','private query','private prompt','private stack'])assert.ok(!serialized.includes(secret));
  lines.length=0;client.webSearch=false;client.event('turn/completed',{threadId:'thread-test',turn:{id:'turn-test',status:'failed'}});assert.equal(lines.length,0);
 }finally{process.stderr.write=write;if(old===undefined)delete process.env.TVLENS_CODEX_TRACE;else process.env.TVLENS_CODEX_TRACE=old;}
});
test('error summary is bounded and drops arbitrary payloads',()=>{const e=safeError({message:'token=abc password=def '+ 'x'.repeat(500),stack:'secret',request:{prompt:'private'}});assert.ok(e.message.length<=240);assert.ok(!e.message.includes('abc'));assert.ok(!e.message.includes('def'));assert.equal(e.stack,undefined);assert.equal(e.request,undefined);});
test('safeError redacts JSON-quoted credential fields, quoted values with spaces or escapes, and unquoted form',()=>{
 const m=safeError({message:'backend error: {"token":"example-sensitive-token","access_token":"a b","refresh_token":"x\\"y","password":"p w","api_key":"k"} authorization: "Bearer z" secret=plain'}).message;
 for(const s of ['example-sensitive-token','a b','x\\"y','p w','"k"','plain'])assert.ok(!m.includes(s),s);
 assert.ok(m.includes('"token":[redacted]'));
});
test('safeError bounds nested turnError depth and survives cycles and odd values',()=>{
 const nested=safeError({message:'a',turnError:{message:'b https://private.example/y',turnError:{message:'c',turnError:{message:'d'}}}});
 assert.equal(nested.turnError.message,'b [url]');assert.equal(nested.turnError.turnError,undefined);
 const loop={message:'loop'};loop.turnError=loop;assert.equal(safeError(loop).turnError.message,'loop');assert.equal(safeError(loop).turnError.turnError,undefined);
 assert.deepEqual(safeError(42),{message:'42'});assert.equal(safeError({get message(){throw Error('boom');}}).message,'[unserializable]');
 assert.equal(safeError({codexErrorInfo:'responseStreamDisconnected'}).codexErrorInfo,'responseStreamDisconnected');
});
test('401 workspace routing failure is an auth failure with a redacted diagnostic and no retry',()=>{
 const client=new CodexSessionClient({webSearch:true});client.threadId='thread-test';client.sessionId='session-test';let rejected;
 client.active={jobId:'deep-2',turnId:'turn-401',text:'',reject:e=>rejected=e};
 client.event('turn/started',{threadId:'thread-test',turn:{id:'turn-401',status:'inProgress'}});
 client.event('error',{threadId:'thread-test',turnId:'turn-401',willRetry:true,error:{message:'stream dropped https://backend.example/v1 token=abc',codexErrorInfo:'responseStreamDisconnected'}});
 assert.equal(client.active.lastError.codexErrorInfo,'responseStreamDisconnected');assert.ok(!client.active.lastError.message.includes('backend.example'));assert.ok(!client.active.lastError.message.includes('abc'));
 assert.equal(rejected,undefined);
 client.event('turn/completed',{threadId:'thread-test',turn:{id:'turn-401',status:'failed',error:{message:'workspace routing discovery unauthorized (401)',codexErrorInfo:'other'}}});
 assert.equal(rejected.authRequired,true);assert.equal(rejected.turnStatus,'failed');assert.match(rejected.message,/401/);assert.match(rejected.message,/Reconnexion Codex requise/);
 assert.equal(rejected.turnError.message,'workspace routing discovery unauthorized (401)');assert.equal(rejected.turnError.codexErrorInfo,'other');
 const summary=safeError(rejected);assert.equal(summary.authRequired,true);assert.equal(summary.turnStatus,'failed');assert.equal(summary.turnError.message,'workspace routing discovery unauthorized (401)');assert.equal(summary.turnError.turnError,undefined);
});
test('turn failure without detail falls back to the last error notification; interruption is never auth',()=>{
 const client=new CodexSessionClient({webSearch:false});client.threadId='thread-test';let rejected;
 client.active={jobId:'deep-3',turnId:'turn-x',text:'',reject:e=>rejected=e};
 client.event('error',{threadId:'thread-test',turnId:'turn-x',error:{message:'unauthorized (401)',codexErrorInfo:'other'}});
 client.event('turn/completed',{threadId:'thread-test',turn:{id:'turn-x',status:'failed'}});
 assert.equal(rejected.turnError.message,'unauthorized (401)');assert.equal(rejected.authRequired,true);
 client.active={jobId:'deep-4',turnId:'turn-y',text:'',reject:e=>rejected=e};
 client.event('error',{threadId:'thread-test',turnId:'turn-y',error:{message:'unauthorized (401)'}});
 client.event('turn/completed',{threadId:'thread-test',turn:{id:'turn-y',status:'interrupted'}});
 assert.equal(rejected.message,'Recherche annulée.');assert.equal(rejected.authRequired,undefined);assert.equal(rejected.turnStatus,'interrupted');
});
test('deep-ask keeps a redacted diagnostic on the failed job and traces cannot break it',async()=>{
 const {DeepAsk}=require('../core/deep-ask.cjs');
 const failure=Object.assign(Error('Codex n’a pas terminé la réponse : authentification refusée (401). Reconnexion Codex requise (codex login), puis repose la question.'),{authRequired:true,turnStatus:'failed',turnError:{message:'workspace routing discovery unauthorized (401) https://private.example/x',codexErrorInfo:'other'}});
 const makeTools=()=>({sessionId:'s1',observations:[],hypotheses:[],limits:[],anchorMs:0,context:()=>undefined});
 const events=[];const ask=new DeepAsk({makeTools,agent:{answer:async()=>{throw failure;}},onTrace:(event)=>{events.push(event);throw Error('trace sink broken');},serializeError:safeError});
 const {id}=ask.start('C’est quoi le marxisme',{mode:'chat'});const job=ask.jobs.find(j=>j.id===id);await job.done;
 assert.equal(job.status,'error');assert.match(job.message,/401/);assert.equal(job.errorDetail.authRequired,true);assert.equal(job.errorDetail.turnStatus,'failed');
 assert.equal(job.errorDetail.turnError.codexErrorInfo,'other');assert.match(job.errorDetail.turnError.message,/unauthorized \(401\) \[url\]/);
 assert.equal(job.result.kind,'insufficient');assert.deepEqual(events,['job.accepted','job.started','job.error','job.finished']);
 const snap=JSON.stringify(ask.snapshot());assert.ok(!snap.includes('private.example'));assert.ok(snap.includes('"errorDetail"'));
 const plain=new DeepAsk({makeTools,agent:{answer:async()=>{throw Error('x');}}});const p=plain.start('q',{mode:'chat'});const pj=plain.jobs.find(j=>j.id===p.id);await pj.done;
 assert.equal(pj.status,'error');assert.deepEqual(pj.errorDetail,{});
 const broken=new DeepAsk({makeTools,agent:{answer:async()=>{throw Error('y');}},serializeError:()=>{throw Error('serializer broken');}});const b=broken.start('q',{mode:'chat'});const bj=broken.jobs.find(j=>j.id===b.id);await bj.done;
 assert.equal(bj.status,'error');assert.equal(bj.message,'y');assert.deepEqual(bj.errorDetail,{});
});
