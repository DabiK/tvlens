const { memoryOf } = require('./helpers/memory-consultation.cjs');
const viewOf = state => memoryOf(state).view();
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { perceptionContext } = require('../core/perception-context.cjs');
const { sessionTimeline, momentDetail } = require('../core/session-timeline.cjs');
const { CodexPerception } = require('../adapters/codex-perception.cjs');
const passage = (n, topic = 'Débat économique') => ({ id: `moment-${n}`, startMs: n * 8000,
  endMs: (n + 1) * 8000, status: 'ready', observation: { topic, summary: `Résumé ${n}`,
    transcript: `Paroles ${n}`, uncertainty: 'Accusation rapportée, non vérifiée.' } });
test('context bounds history and preserves source provenance, uncertainty and the last three passages only', () => {
  const previous = Array.from({length: 1000}, (_, i) => passage(i, `Sujet ${i}`));
  previous.forEach(p => { p.observation.summary += 'x'.repeat(8000); p.observation.transcript += 'x'.repeat(8000); });
  const current = passage(1000), future = passage(1001);
  const context = perceptionContext({history: previous.slice(0, 998), segments: [...previous.slice(998), current, future]}, current);
  assert.deepEqual(context.recent.map(p => p.id), ['moment-997', 'moment-998', 'moment-999']);
  assert.equal(context.sessionOutline.length, 8);
  assert.ok(JSON.stringify(context).length < 15000);
  assert.equal(context.previousTopic, 'Sujet 999');
  assert.equal(context.recent[0].uncertainty, 'Accusation rapportée, non vérifiée.');
  previous[999].observation.summary = 'Changed later';
  assert.notEqual(context.recent.at(-1).summary, 'Changed later');
});
test('unknown passages and capture holes do not assert continuation', () => {
  const old = passage(0), missing = {...passage(1), status:'skipped', observation:null};
  assert.equal(perceptionContext({history:[],segments:[old,missing]},passage(2)).previousTopic,'');
  assert.equal(perceptionContext({history:[],segments:[old]},passage(3)).previousTopic,'');
  const context = perceptionContext({history:[],segments:[old,missing]},passage(2));
  assert.equal(context.recent.at(-1).status,'skipped');
});
test('provider uses explicit bounded historical context, keeps current evidence separate and canonicalizes a continuing topic', async () => {
  let prompt, calls=0;
  const p = new CodexPerception({agent:{answer: async input => { calls++; prompt=input.instructions;
    return {topic:'Un autre titre du même sujet', continuity:'continue', summary:'Un intervenant répond.', visual:'Plan rapproché.', uncertainty:'Identité incertaine.'}; }}});
  const previous=passage(0), current={...passage(1),frames:[]};
  current.observation.transcript='Citation actuelle';
  const context=perceptionContext({history:[previous],segments:[]},current);
  const result=await p.observeVisual({...current,context});
  assert.equal(calls,1);
  assert.equal(result.observation.topic,'Débat économique');
  assert.equal(result.observation.transcript,'Citation actuelle');
  assert.match(prompt,/HISTORIQUE NON VÉRIFIÉ/);
  assert.match(prompt,/Accusation rapportée/);
  assert.match(prompt,/N'importe aucun geste/);
  assert.match(prompt,/moment-0/);
  // No adapter-local lastTopic can bleed into another contextless call.
  const other=await p.observeVisual(current);
  assert.equal(other.observation.topic,'Un autre titre du même sujet');
});
test('one subject stays one progressively enriched card across hours and archived chunks; real transition splits', () => {
  const passages=Array.from({length:1200},(_,i)=>passage(i));
  const snapshot={id:'long',history:passages.slice(0,1100),segments:passages.slice(1100)};
  const cards=sessionTimeline(viewOf(snapshot)).cards;
  assert.equal(cards.length,1);
  assert.equal(cards[0].segmentIds.length,1200);
  assert.equal(cards[0].summary,'Résumé 1198 Résumé 1199');
  assert.ok(cards[0].summary.length <= 900);
  const detail=momentDetail(viewOf(snapshot),{firstId:'moment-0',lastId:'moment-1199'});
  assert.equal(detail.passages[700].transcript,'Paroles 700');
  assert.equal(detail.passages[700].startMs,5600000);
  snapshot.segments.push(passage(1200,'Sport'));
  assert.equal(sessionTimeline(viewOf(snapshot)).cards.length,2);
});
test('successful vision can group a known topic despite audio failure, with partial status retained', () => {
  const a=passage(0),b={...passage(1),status:'partial',visionStatus:'ready',audioStatus:'error',audioError:'Audio indisponible'};
  const cards=sessionTimeline(viewOf({id:'s',history:[],segments:[a,b]})).cards;
  assert.equal(cards.length,1); assert.equal(cards[0].status,'partial');
});
test('explicit transition or uncertain continuity never merges merely because the generated title matches', () => {
  for (const topicContinuity of ['change','uncertain']) {
    const a=passage(0), b=passage(1); b.observation.topicContinuity=topicContinuity;
    assert.equal(sessionTimeline(viewOf({id:'s',history:[],segments:[a,b]})).cards.length,2);
  }
});
test('session outline preserves explicit same-title transitions and uncertainty as separate historical runs', () => {
  const passages=[passage(0),passage(1),passage(2),passage(3)];
  passages[1].observation.topicContinuity='change';
  passages[2].observation.topicContinuity='uncertain';
  passages[3].observation.topicContinuity='continue';
  const context=perceptionContext({history:[],segments:passages},passage(4));
  assert.deepEqual(context.sessionOutline.map(p=>[p.firstId,p.lastId]),[
    ['moment-0','moment-0'],['moment-1','moment-1'],['moment-2','moment-3'],
  ]);
});

test('topic runs and cumulative recovery accept a 1000 ms gap and stop at 1001 ms', () => {
  for (const gap of [1000, 1001]) {
    const first = passage(0), next = passage(1);
    first.topicSummary = { text: 'Argument initial', firstId: first.id, lastId: first.id, startMs: 0, endMs: 8000 };
    next.startMs += gap;
    next.endMs += gap;
    const snapshot = { id: 's', history: [first], segments: [next] };
    const context = perceptionContext(snapshot, { ...passage(2), startMs: next.endMs });
    assert.equal(context.sessionOutline.length, gap === 1000 ? 1 : 2);
    assert.equal(context.activeTopic.firstId, gap === 1000 ? first.id : next.id);
    assert.equal(context.previousTopicSummary?.text ?? null, gap === 1000 ? 'Argument initial' : null);
    assert.equal(sessionTimeline(viewOf(snapshot)).cards.length, gap === 1000 ? 1 : 2);
    const atCaptureBoundary = perceptionContext({ history: [first], segments: [] }, { ...next });
    assert.equal(atCaptureBoundary.previousTopic, gap === 1000 ? first.observation.topic : '');
    assert.equal(atCaptureBoundary.activeTopic?.firstId ?? null, gap === 1000 ? first.id : null);
    assert.equal(atCaptureBoundary.previousTopicSummary?.text ?? null, gap === 1000 ? 'Argument initial' : null);
  }
});

test('perception preserves exact topic identity while the timeline normalizes case and accents', () => {
  for (const title of ['DÉBAT ÉCONOMIQUE', 'Debat economique']) {
    const first = passage(0), next = passage(1, title);
    first.topicSummary = { text: 'Ancien sujet', firstId: first.id, lastId: first.id, startMs: 0, endMs: 8000 };
    const snapshot = { id: 's', history: [first], segments: [next] };
    const context = perceptionContext(snapshot, passage(2));
    assert.equal(context.sessionOutline.length, 2, title);
    assert.equal(context.previousTopic, title);
    assert.equal(context.activeTopic.firstId, next.id);
    assert.equal(context.previousTopicSummary, null);
    assert.equal(sessionTimeline(viewOf(snapshot)).cards.length, 1, title);
  }
});

test('a short passage without a topic is skipped only by the outline, using the last known topic time', () => {
  const first = passage(0), unknown = { ...passage(1), endMs: 8500, status: 'skipped', observation: null };
  first.topicSummary = { text: 'Argument initial', firstId: first.id, lastId: first.id, startMs: 0, endMs: 8000 };
  for (const startMs of [8500, 9001]) {
    const next = { ...passage(2), startMs, endMs: startMs + 8000 };
    const snapshot = { id: 's', history: [first], segments: [unknown, next] };
    const context = perceptionContext(snapshot, { ...passage(3), startMs: next.endMs });
    assert.equal(context.sessionOutline.length, startMs === 8500 ? 1 : 2);
    assert.equal(context.activeTopic.firstId, next.id);
    assert.equal(context.previousTopicSummary, null);
    assert.deepEqual(sessionTimeline(viewOf(snapshot)).cards.map(card => card.segmentIds), [[first.id], [unknown.id], [next.id]]);
    const beforeReturn = perceptionContext({ history: [first], segments: [unknown] }, next);
    assert.equal(beforeReturn.previousTopic, '');
    assert.equal(beforeReturn.activeTopic, null);
    assert.equal(beforeReturn.previousTopicSummary, null);
  }
});

test('a returning topic never bridges an explicit break even when its title matches again', () => {
  for (const topicContinuity of ['change', 'uncertain']) {
    const first = passage(0), boundary = passage(1), next = passage(2);
    boundary.observation.topicContinuity = topicContinuity;
    first.topicSummary = { text: 'Argument initial', firstId: first.id, lastId: first.id, startMs: 0, endMs: 8000 };
    const snapshot = { id: 's', history: [first], segments: [boundary, next] };
    const context = perceptionContext(snapshot, passage(3));
    assert.deepEqual(context.sessionOutline.map(run => [run.firstId, run.lastId]), [[first.id, first.id], [boundary.id, next.id]]);
    assert.equal(context.activeTopic.firstId, boundary.id);
    assert.equal(context.previousTopicSummary, null);
    assert.deepEqual(sessionTimeline(viewOf(snapshot)).cards.map(card => card.segmentIds), [[first.id], [boundary.id, next.id]]);
  }
});
