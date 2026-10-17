const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WatchSession } = require('../core/session.cjs');
const { LivingRecap } = require('../core/living-recap.cjs');
const { createEventPublisher } = require('../core/shared/events.cjs');
const { createLivingRecapRuntime } = require('../runtime/memory/living-recap-runtime.cjs');
const { deferred, tick } = require('./helpers/wait.cjs');

const synthesis = ({ sourcePassages }) => ({
  overview: 'Vue de la session.',
  chapters: sourcePassages.map(p => ({ title: p.id, summary: p.text, sourceIds: [p.id] })),
});
const audioResult = { observation: { transcript: 'Paroles du passage' } };
const visualResult = { observation: { summary: 'Images du passage' } };
const block = (startMs, endMs) => ({ startMs, endMs, clip: new Uint8Array([1]), audio: new Uint8Array([2]), frames: [] });

function fixture(t, options = {}) {
  const f = { time: 1000, blocked: false, reads: 0, inputs: [], states: [], saves: [], scheduled: [], delivered: [], errors: [] };
  const events = createEventPublisher({ onError: error => f.errors.push(error) });
  const files = new Map(), audio = new Map(), vision = new Map();
  const lane = (map, id) => {
    if (!map.has(id)) map.set(id, deferred());
    return map.get(id);
  };
  const watch = new WatchSession({
    id: 's', now: () => f.time,
    perception: {
      transcribe: input => lane(audio, input.id).promise,
      observeVisual: input => lane(vision, input.id).promise,
    },
    media: {
      put: async (id, input) => files.set(id, input),
      read: async id => files.get(id), remove: async id => files.delete(id),
    },
    archive: { save: async state => f.saves.push(structuredClone(state)) },
    onEvents: pending => pending.forEach(event => events.publish(event)),
  });
  const recap = new LivingRecap({
    now: () => f.time,
    summarize: input => {
      f.inputs.push(input);
      return options.summarize?.(input) ?? synthesis(input);
    },
    onChange: state => {
      f.states.push(state);
      options.onChange?.(state);
    },
  });
  recap.reset('s');
  events.subscribe(event => f.delivered.push(event));
  const connect = (extra = {}) => createLivingRecapRuntime({
    id: 's', recap,
    readView: () => {
      f.reads++;
      return watch.memoryView();
    },
    subscribe: events.subscribe, schedule: fn => f.scheduled.push(fn),
    isBlocked: () => f.blocked, onError: error => f.errors.push(error), ...extra,
  });
  t.after(() => {
    f.consumer?.close();
    recap.reset();
    return watch.close();
  });
  return Object.assign(f, {
    watch, recap, events, connect,
    flush: () => { for (const fn of f.scheduled.splice(0)) fn(); },
    audio: id => lane(audio, id), vision: id => lane(vision, id),
  });
}

test('passage events coalesce outside delivery, wait for visual evidence and ignore repeated revisions', async t => {
  const f = fixture(t);
  f.consumer = f.connect();
  const initialReads = f.reads, states = f.states.length;
  await f.watch.ingest(block(0, 1000));
  assert.equal(f.reads, initialReads, 'event delivery reads no complete view');
  assert.equal(f.states.length, states, 'event delivery publishes no recap');
  f.audio('moment-1').resolve(audioResult);
  await tick();
  f.flush();
  assert.equal(f.reads, initialReads + 1, 'reception and audio changes share one read of the latest passage');
  await f.recap.tick();
  assert.equal(f.inputs.length, 0, 'speech alone is never sent to synthesis');
  assert.equal(f.recap.snapshot().sourceCount, 0);
  f.vision('moment-1').resolve(visualResult);
  await tick();
  f.flush();
  assert.equal(f.inputs.length, 0, 'observing never starts synthesis');
  await f.recap.tick();
  assert.deepEqual(f.inputs[0].newPassages.map(p => [p.id, p.text]), [['moment-1', 'Images du passage\nParoles du passage']]);
  assert.deepEqual(f.recap.snapshot().overviewSourceIds, ['moment-1']);
  const reads = f.reads, ready = f.recap.snapshot();
  f.events.publish(f.delivered.at(-1));
  f.flush();
  f.time += 30000;
  await f.recap.tick();
  assert.equal(f.reads, reads);
  assert.equal(f.inputs.length, 1);
  assert.deepEqual(f.recap.snapshot(), ready);
});

test('reception, pending vision, terminal losses and capture gaps change limits without any ready source', async t => {
  const f = fixture(t);
  f.consumer = f.connect();
  await f.watch.ingest(block(0, 1000));
  f.flush();
  assert.ok(f.recap.snapshot().limits.includes('1 passage(s) encore en analyse.'));
  f.audio('moment-1').resolve(audioResult);
  await tick();
  f.flush();
  assert.deepEqual(f.recap.snapshot().limits, [
    'Résumé issu d’analyses automatiques, susceptible d’imprécisions.',
    '1 passage(s) encore en analyse.',
    '1 passage(s) avec une analyse partielle, non inclus dans le résumé.',
  ]);
  f.vision('moment-1').reject(Error('vision unavailable'));
  await tick();
  f.flush();
  assert.ok(!f.recap.snapshot().limits.some(limit => limit.includes('encore en analyse')));
  f.time = 5000;
  await f.watch.ingest(block(4000, 5000));
  f.audio('moment-2').reject(Error('audio unavailable'));
  await tick();
  f.vision('moment-2').reject(Error('vision unavailable'));
  await tick();
  f.flush();
  assert.deepEqual(f.recap.snapshot().limits, [
    'Résumé issu d’analyses automatiques, susceptible d’imprécisions.',
    '1 passage(s) avec une analyse partielle, non inclus dans le résumé.',
    '1 passage(s) sans analyse exploitable.',
    '1 interruption(s) de capture : ces intervalles ne sont pas résumés.',
  ]);
  await f.recap.tick();
  assert.equal(f.inputs.length, 0);
  const reads = f.reads, before = f.recap.snapshot();
  f.events.publish({ ...f.delivered.at(-1), sessionId: 'foreign', revision: 100 });
  f.flush();
  assert.equal(f.reads, reads);
  assert.deepEqual(f.recap.snapshot(), before);
});

test('blocking and detaching discard already scheduled reads and all later events', async t => {
  const f = fixture(t);
  f.consumer = f.connect();
  await f.watch.ingest(block(0, 1000));
  const reads = f.reads, before = f.recap.snapshot();
  f.blocked = true;
  f.flush();
  f.audio('moment-1').resolve(audioResult);
  await tick();
  f.flush();
  assert.equal(f.reads, reads);
  assert.deepEqual(f.recap.snapshot(), before);
  f.blocked = false;
  f.events.publish(f.delivered.at(-1));
  f.consumer.close();
  f.consumer.close();
  f.recap.reset();
  const empty = f.recap.snapshot();
  f.flush();
  f.vision('moment-1').resolve(visualResult);
  await tick();
  f.events.publish(f.delivered.at(-1));
  f.flush();
  assert.equal(f.reads, reads);
  assert.deepEqual(f.recap.snapshot(), empty);
});

test('a failed deferred recap publication cannot interrupt perception or mandatory archive saves', async t => {
  let fail = false;
  const f = fixture(t, { onChange: () => { if (fail) throw Error('recap observer failed'); } });
  f.consumer = f.connect({ onError: error => {
    f.errors.push(error);
    return Promise.reject(Error('diagnostic failed'));
  } });
  f.events.subscribe(() => { throw Error('subscriber failed'); });
  f.events.subscribe(() => Promise.reject(Error('subscriber rejected')));
  f.events.subscribe(() => new Promise(() => {}));
  fail = true;
  await f.watch.ingest(block(0, 1000));
  f.flush();
  f.audio('moment-1').resolve(audioResult);
  await tick();
  f.flush();
  f.vision('moment-1').resolve(visualResult);
  await tick();
  f.flush();
  await f.watch.stop();
  assert.equal(f.watch.memoryPassage('moment-1').status, 'ready');
  assert.equal(f.saves.at(-1).segments[0].status, 'ready');
  assert.ok(f.errors.some(error => error.code === 'TVLENS_RECAP_OBSERVATION_FAILED'));
  assert.ok(f.errors.some(error => error.code === 'TVLENS_EVENT_DELIVERY_FAILED'));
  assert.equal(f.recap.snapshot().sourceCount, 1);
  fail = false;
});

test('binding a restored memory silently refreshes replay and retains chapters until explicit resume', async t => {
  const f = fixture(t);
  const passage = (id, startMs, endMs, text) => ({
    id, startMs, endMs, revision: 2, status: 'ready', audioStatus: 'ready', visionStatus: 'ready',
    observation: { summary: text }, available: true,
  });
  const passages = [passage('moment-1', 0, 500, 'Premier sujet'), passage('moment-2', 500, 1000, 'Suite en attente')];
  f.watch.restore({ id: 's', elapsedMs: 1000, segments: passages }, { hasMedia: id => id === 'moment-1' });
  const saved = {
    sessionId: 's', overview: 'Résumé conservé', updatedAt: 10,
    chapters: [{ title: 'Premier chapitre', summary: 'Résumé du premier sujet', sourceIds: ['moment-1'] }],
    sourcePassages: passages.map(p => ({ id: p.id, startMs: p.startMs, endMs: p.endMs, text: p.observation.summary, available: true })),
  };
  const published = f.states.length;
  f.recap.restore(saved);
  const snapshot = t.mock.method(f.watch, 'snapshot', () => assert.fail('binding must not read the session snapshot'));
  f.consumer = f.connect({ silent: true });
  assert.equal(snapshot.mock.callCount(), 0);
  assert.equal(f.states.length, published);
  assert.equal(f.inputs.length, 0);
  assert.deepEqual(f.delivered, []);
  assert.deepEqual(f.saves, []);
  const restored = f.recap.snapshot();
  assert.equal(restored.overview, saved.overview);
  assert.deepEqual(restored.chapters[0].sourceIds, ['moment-1']);
  assert.deepEqual(restored.chapters[0].replaySourceIds, ['moment-1']);
  assert.deepEqual(restored.sourcePassages.map(p => [p.text, p.available]), [['Premier sujet', true], ['Suite en attente', false]]);
  assert.equal(restored.pendingCount, 1);
  snapshot.mock.restore();
  await f.watch.resume();
  await f.recap.tick();
  assert.equal(f.inputs.length, 1);
  assert.deepEqual(f.inputs[0].newPassages.map(p => p.id), ['moment-2']);
  assert.deepEqual(f.inputs[0].chapters.map(p => p.sourceIds), [['moment-1']]);
  assert.deepEqual(f.recap.snapshot().overviewSourceIds, ['moment-1', 'moment-2']);
});
