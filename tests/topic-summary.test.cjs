const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CodexPerception } = require('../adapters/codex-perception.cjs');
const { WatchSession } = require('../core/session.cjs');
const { perceptionContext } = require('../core/perception-context.cjs');
const { completeTopicSummary } = require('../core/topic-summary.cjs');
const { sessionTimeline, momentDetail } = require('../core/session-timeline.cjs');
const passage = (n, summary = `Réponse ${n}`) => ({ id:`moment-${n}`, startMs:n*8000,
  endMs:(n+1)*8000, status:'ready', observation:{topic:'Économie', summary, transcript:`Paroles ${n}`, topicContinuity:'continue'} });
function append(snapshot, p, text) {
  const context = perceptionContext(snapshot,p);
  p.topicSummary = completeTopicSummary(p,{ observation:p.observation, topicSummary:text },context);
  snapshot.segments.push(p);
  return context;
}
test('cumulative card preserves the initial attributed argument through updates without changing current evidence', async () => {
  const snapshot = {id:'s',history:[],segments:[]};
  const initial='A affirme une baisse des prix, non vérifiée.';
  append(snapshot,passage(0,initial));
  let calls=0;
  const provider=new CodexPerception({agent:{answer:async input=> {
    calls++; assert.match(input.instructions,/A affirme une baisse des prix, non vérifiée/);
    return {topic:'Économie', continuity:'continue',summary:'B conteste le chiffre.',visual:'B parle.',uncertainty:'Chiffre non vérifié.',
      topicSummary:initial+' B conteste le chiffre ; le désaccord reste ouvert.'};
  }}});
  for(let n=1;n<5;n++) {
    const p=passage(n); const context=perceptionContext(snapshot,p);
    const result=await provider.observeVisual({...p,frames:[],context});
    p.observation=result.observation;
    p.topicSummary=completeTopicSummary(p,result,context);
    snapshot.segments.push(p);
    assert.equal(p.observation.summary,'B conteste le chiffre.');
    assert.equal(p.observation.topicSummary,undefined);
  }
  assert.equal(calls,4);
  const card=sessionTimeline(snapshot).cards[0];
  assert.equal(card.summaryKind,'cumulative');
  assert.match(card.summary,/^A affirme/); assert.match(card.summary,/B conteste/);
  assert.equal(momentDetail(snapshot,card.segmentIds).summary,card.summary);
});
test('frozen details never include future or preceding sub-selection material', () => {
  const snapshot={id:'s',history:[],segments:[]};
  append(snapshot,passage(0,'Début A'));
  append(snapshot,passage(1,'Passage B'),'Début A puis B');
  const selection={firstId:'moment-0',lastId:'moment-1'};
  append(snapshot,passage(2,'Secret C'),'Début A puis B et Secret C');
  const frozen=momentDetail(snapshot,selection);
  assert.equal(frozen.summary,'Début A puis B');
  const subset=momentDetail(snapshot,['moment-1','moment-2']);
  assert.equal(subset.summaryKind,'bounded-excerpts');
  assert.equal(subset.summary,'Passage B Secret C');
  assert.doesNotMatch(subset.summary,/Début A/);
});
test('same-title changes, uncertainty, missing analyses and capture gaps reset aggregate provenance', () => {
  for(const boundary of ['change','uncertain','missing','gap']) {
    const snapshot={id:'s',history:[],segments:[]};
    append(snapshot,passage(0,'Ancien argument'));
    const p=passage(boundary==='gap'?3:1,'Nouveau constat');
    if(boundary==='missing') {
      snapshot.segments.push({...passage(1),status:'skipped',observation:null});
      Object.assign(p,passage(2,'Nouveau constat'));
    } else if(boundary!=='gap') p.observation.topicContinuity=boundary;
    append(snapshot,p,'Ancien argument contaminant');
    assert.equal(p.topicSummary.text,'Nouveau constat',boundary);
    assert.equal(p.topicSummary.firstId,p.id,boundary);
    assert.equal(sessionTimeline(snapshot).cards.at(-1).summary,'Nouveau constat');
  }
});
test('invalid aggregate fails gracefully without losing current observation or claiming whole-topic coverage', async () => {
  for(const invalid of [undefined,'',42,'x'.repeat(1601)]) {
    const snapshot={id:'s',history:[],segments:[]}; append(snapshot,passage(0,'Ancien'));
    const p=passage(1);
    const provider=new CodexPerception({agent:{answer:async()=>({summary:'Actuel',visual:'Plan',uncertainty:'',topic:'Économie',continuity:'continue',topicSummary:invalid})}});
    const context=perceptionContext(snapshot,p);
    const result=await provider.observeVisual({...p,frames:[],context});
    assert.equal(result.observation.summary,'Actuel');
    p.observation=result.observation; p.topicSummary=completeTopicSummary(p,result,context); snapshot.segments.push(p);
    assert.equal(p.topicSummary,null);
    const card=sessionTimeline(snapshot).cards[0];
    assert.equal(card.summaryKind,'bounded-excerpts'); assert.match(card.summaryLimits,/aucun résumé cumulatif/);
  }
});
test('legacy observations remain honestly bounded and cannot seed a false full-topic aggregate', () => {
  const snapshot={id:'s',history:[passage(0,'Ancien sans résumé')],segments:[]};
  const p=passage(1); append(snapshot,p,'Prétend tout résumer');
  assert.equal(p.topicSummary,null);
  assert.equal(sessionTimeline(snapshot).cards[0].summaryKind,'bounded-excerpts');
});
test('aggregate survives archival and pause/resume while original transcript and timestamps remain unchanged', async () => {
  let now=8000;
  const watch=new WatchSession({id:'s',now:()=>now,perception:{},media:{remove:async()=>{}},archive:{save:async()=>{}},retentionMs:10000});
  const p={...passage(0,'Argument initial'),available:true};
  append(watch,p);
  await watch.stop(); await watch.resume();
  now=30000; await watch.prune();
  assert.equal(watch.history[0].topicSummary.text,'Argument initial');
  assert.equal(watch.history[0].observation.transcript,'Paroles 0');
  const next=passage(1); const context=perceptionContext(watch,next);
  assert.equal(context.previousTopicSummary.text,'Argument initial');
  assert.equal(context.previousTopicSummary.startMs,0);
  assert.equal(watch.history[0].available,undefined);
  context.previousTopicSummary.text='mutation';
  assert.equal(watch.history[0].topicSummary.text,'Argument initial');
});
test('one rejected cumulative output recovers through bounded intact observations without another call', () => {
  const snapshot={id:'s',history:[],segments:[]};
  append(snapshot,passage(0,'Argument initial'));
  append(snapshot,passage(1,'Réponse importante'),null);
  const p=passage(2,'Désaccord');
  const context=perceptionContext(snapshot,p);
  assert.equal(context.previousTopicSummary.text,'Argument initial');
  assert.equal(context.previousTopicSummary.pendingPassages[0].summary,'Réponse importante');
  append(snapshot,p,'Argument initial, réponse importante et désaccord.');
  assert.equal(p.topicSummary.firstId,'moment-0');
  assert.equal(p.topicSummary.pendingPassages,undefined);
  assert.equal(sessionTimeline(snapshot).cards[0].summaryKind,'cumulative');
  for(let n=3;n<7;n++) append(snapshot,passage(n),null);
  assert.equal(perceptionContext(snapshot,passage(7)).previousTopicSummary,null);
});
test('legacy answer port receives only passage evidence, never aggregate text attached to a chunk', async () => {
  let received;
  const watch=new WatchSession({id:'s',now:()=>16000,perception:{},media:{remove:async()=>{},read:async()=>({frames:[]})},archive:{save:async()=>{}},
    answer:{ask:async input=>{received=input;return {answer:'Pas assez de preuves',kind:'insufficient',citations:[],limits:[]};}}});
  append(watch,passage(0,'Début'));
  append(watch,{...passage(1),available:true},'Début et fin');
  watch.history.push(watch.segments.shift());
  await watch.ask('De quoi parle-t-on ?');
  assert.equal(received.context[0].topicSummary,undefined);
  assert.equal(received.history[0].topicSummary,undefined);
  assert.equal(watch.segments[0].topicSummary.text,'Début et fin');
});
test('actual perception input and reused thread cannot carry material from before a capture gap', async () => {
  const snapshot={id:'s',history:[],segments:[]}, prompts=[];
  let closes=0;
  const provider=new CodexPerception({agent:{close:async()=>{closes++;},answer:async input=> {
    prompts.push({text:input.instructions,closes});
    return {topic:'Économie',continuity:'continue',summary:'Constat actuel',visual:'Plan actuel',uncertainty:'',topicSummary:'Résumé actuel'};
  }}});
  const first=passage(0,'MARQUEUR_SECRET_AVANT_LACUNE');
  append(snapshot,first);
  async function observe(n) {
    const p=passage(n,'Constat actuel'), context=perceptionContext(snapshot,p);
    const result=await provider.observeVisual({...p,frames:[],context});
    p.observation=result.observation; p.topicSummary=completeTopicSummary(p,result,context);
    snapshot.segments.push(p);
  }
  await observe(1);
  assert.match(prompts[0].text,/MARQUEUR_SECRET_AVANT_LACUNE/);
  await observe(3); // missing8s interval
  await observe(4);
  assert.doesNotMatch(prompts[1].text,/MARQUEUR_SECRET_AVANT_LACUNE/);
  assert.doesNotMatch(prompts[2].text,/MARQUEUR_SECRET_AVANT_LACUNE/);
  assert.ok(prompts[1].closes>prompts[0].closes);
  assert.equal(prompts[2].closes,prompts[1].closes);
  assert.equal(perceptionContext(snapshot,passage(5)).activeTopic.firstId,'moment-3');
});
test('explicit uncertain/change topic boundary clears old thread and filters earlier-topic observations', async () => {
  for(const boundary of ['change','uncertain']) {
    const snapshot={id:'s',history:[],segments:[]};
    append(snapshot,passage(0,'ANCIEN_ARGUMENT_EXCLU'));
    const next=passage(1,'NOUVEAU_ARGUMENT'); next.observation.topicContinuity=boundary; append(snapshot,next);
    const context=perceptionContext(snapshot,passage(2));
    assert.deepEqual(context.activeTopic.recent.map(p=>p.id),['moment-1']);
    let prompt;
    const provider=new CodexPerception({agent:{answer:async input=>{prompt=input.instructions;return {
      topic:'Économie',continuity:'continue',summary:'Suite',visual:'',uncertainty:'',topicSummary:'Nouveau puis suite'};}}});
    await provider.observeVisual({...passage(2),frames:[],context});
    assert.doesNotMatch(prompt,/ANCIEN_ARGUMENT_EXCLU/);
    assert.match(prompt,/NOUVEAU_ARGUMENT/);
  }
});
test('a transition discovered during inference and an inspection both invalidate the visual thread', async () => {
  const snapshot={id:'s',history:[],segments:[]}; append(snapshot,passage(0,'Initial'));
  let closes=0, mode='change';
  const provider=new CodexPerception({transcriber:{transcribe:async()=>({text:'',limits:[]})},agent:{
    close:async()=>{closes++;}, answer:async()=>mode==='inspect'?{observations:[],hypotheses:[],limits:[]}:
      {topic:'Économie',continuity:mode,summary:'Suite',visual:'',uncertainty:'',topicSummary:'Initial puis suite'}}});
  const p={...passage(1),frames:[],context:perceptionContext(snapshot,passage(1))};
  await provider.observeVisual(p); const initialCloses=closes;
  mode='continue'; await provider.observeVisual(p);
  assert.equal(closes,initialCloses+1,'same-topic-key still resets after discovered change');
  mode='uncertain'; await provider.observeVisual(p); const beforeUncertain=closes;
  mode='continue'; await provider.observeVisual(p); assert.equal(closes,beforeUncertain+1);
  mode='inspect'; await provider.inspect({question:'Que voit-on ?',segments:[]}); const afterInspect=closes;
  mode='continue'; await provider.observeVisual(p); assert.equal(closes,afterInspect+1);
});
