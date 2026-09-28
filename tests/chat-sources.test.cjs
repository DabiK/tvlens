const {test}=require('node:test');const assert=require('node:assert/strict');
const {CodexSessionAgent}=require('../adapters/codex-session-agent.cjs');
const {DeepAsk}=require('../core/deep-ask.cjs');
function fixture(steps){let count=0;const prompts=[];const agent=new CodexSessionAgent({rpcFactory:options=>({start(){},send(){},close(){},async request(method,p){
 if(method==='thread/start')return {thread:{id:'same'}};
 if(method==='turn/interrupt'){options.onEvent('turn/completed',{threadId:'same',turn:{id:p.turnId,status:'interrupted'}});return {};}
 if(method==='turn/start'){prompts.push(p.input[0].text);const id='t'+(++count),step=steps[count-1];setImmediate(()=>{const emit=(method,item)=>options.onEvent(method,{threadId:'same',turnId:id,item});options.onEvent('turn/started',{threadId:'same',turn:{id}});for(const url of step.open||[])emit('item/completed',{type:'webSearch',action:{type:'openPage',url}});step.onStarted?.();if(step.pending)return;emit('item/completed',{type:'agentMessage',text:JSON.stringify(step.result)});options.onEvent('turn/completed',{threadId:'same',turn:{id,status:'completed'}});});return {turn:{id}};}return {};}})});return {agent,prompts};}
const source={url:'https://example.org/article',title:'Article',evidence:'Contenu consulté'};
const result={answer:'Voici l’article.',kind:'external',citations:[],sources:[source],limits:[]};
const input={question:'lien de l’arcitle ?',tools:{sessionId:'s',anchorMs:100},signal:AbortSignal.timeout(5000)};
test('link follow-up repairs missing web provenance once, in the same thread',async()=>{
 const {agent,prompts}=fixture([{result},{open:[source.url],result}]);try{const output=await agent.answer(input);assert.equal(output.sources.length,1);assert.equal(prompts.length,2);assert.ok(output.sourceRepair);assert.equal(output.audit.length,1);assert.match(prompts[1],/ouvre explicitement/);}finally{await agent.close();}
});
test('failed source repair abstains without dumping available video summaries and retains diagnostics',async()=>{
 const {agent,prompts}=fixture([{result},{result}]);const service=new DeepAsk({agent,makeTools:()=>({sessionId:'s',anchorMs:100,observations:[],memoryEvidence:[{id:'m',startMs:0,endMs:100,text:'UNRELATED SUMMARY'}],hypotheses:[],limits:[]})});try{service.start(input.question,{mode:'chat'});await service.jobs[0].done;const job=service.jobs[0];assert.equal(prompts.length,2);assert.equal(job.result.kind,'insufficient');assert.ok(!job.result.answer.includes('UNRELATED'));assert.equal(job.validation.sourceValidation.accepted,0);assert.equal(job.validation.sourceValidation.rejected[0].url,source.url);}finally{await agent.close();}
});
test('completed page consultation survives interrupted research; follow-up reuses exact source without another search',async()=>{
 let started;const ready=new Promise(r=>started=r);const {agent,prompts}=fixture([{open:[source.url],pending:true,onStarted:started},{result:{...result,sources:[{...source,url:source.url+'#section'}]}}]);
 try{const controller=new AbortController();const first=agent.answer({...input,signal:controller.signal});first.catch(()=>{});await ready;controller.abort(Error('New question'));await assert.rejects(first);const output=await agent.answer(input);assert.equal(output.sources.length,1);assert.equal(prompts.length,2);assert.ok(prompts[1].includes(source.url));assert.equal(output.threadId,'same');}finally{await agent.close();}
});
test('mislabeling a sourced claim as explanation does not bypass rejected-source validation',async()=>{
 const service=new DeepAsk({makeTools:()=>({observations:[],hypotheses:[],limits:[]}),agent:{answer:async()=>({...result,kind:'explanation',sources:[],sourceValidation:{proposed:1,accepted:0}})}});service.start('Source ?', {mode:'chat'});await service.jobs[0].done;assert.equal(service.jobs[0].result.kind,'insufficient');assert.match(service.jobs[0].result.answer,/confirmer les sources/);
});
