const test = require('node:test');
const assert = require('node:assert/strict');
const { createPollController } = require('../tv/app/poll-controller.js');
const { RemoteClient } = require('../tv/app/remote-client.js');
const { manualClock } = require('./helpers/clock.cjs');
const { deferred } = require('./helpers/wait.cjs');

const idle = () => ({ timeline: { cards: [] }, chat: { jobs: [] } });
const body = value => ({ value, notModified: false });

function setup(t, respond, initial = idle(), options = {}) {
  const clock = manualClock();
  const requests = [], received = [], unchanged = [], errors = [];
  let state = initial;
  const controller = createPollController({
    ...clock.io, ...options,
    client: { state: view => {
      requests.push({ at: clock.io.now(), view: view || 'full' });
      return respond(view);
    } },
    getState: () => state,
    onReceive: (value, view) => { received.push({ value, view }); state = value; },
    onNotModified: () => unchanged.push(clock.io.now()),
    onError: error => errors.push(error),
  });
  t.after(() => controller.stop());
  return { clock, controller, requests, received, unchanged, errors, state: () => state };
}

test('requests during a deferred read coalesce into one immediate read and resume the normal cadence', async t => {
  const answer = deferred();
  let reads = 0;
  const h = setup(t, () => ++reads === 1 ? answer.promise : body(idle()));
  h.controller.start();
  h.controller.start();
  assert.equal(h.requests.length, 1, 'start reads once without a DOM');
  for (let i = 0; i < 4; i++) h.controller.request();
  await h.clock.advance(4000);
  assert.equal(h.requests.length, 1, 'no concurrent request while the answer is deferred');
  assert.equal(h.clock.armed, 0);
  answer.resolve(body(idle()));
  await h.clock.advance(0);
  assert.deepEqual(h.requests.map(call => call.at), [0, 4000]);
  assert.equal(h.clock.armed, 1);
  await h.clock.advance(999);
  assert.equal(h.requests.length, 2);
  await h.clock.advance(1);
  assert.deepEqual(h.requests.map(call => call.at), [0, 4000, 5000]);
});

test('a request while waiting cancels the previous timer before reading', async t => {
  const answer = deferred();
  let reads = 0;
  const h = setup(t, () => ++reads === 1 ? body(idle()) : answer.promise);
  h.controller.start();
  await h.clock.advance(200);
  assert.equal(h.clock.armed, 1);
  h.controller.request();
  assert.equal(h.clock.armed, 0, 'the old wait no longer owns a timer');
  assert.deepEqual(h.requests.map(call => call.at), [0, 200]);
  await h.clock.advance(2000);
  assert.equal(h.requests.length, 2);
  answer.resolve(body(idle()));
  await h.clock.advance(0);
  assert.equal(h.clock.armed, 1);
});

test('a new body reaches receive with its view while a 304 only notifies connection and counters', async t => {
  const value = idle();
  let reads = 0;
  const h = setup(t, () => ++reads === 1 ? body(value) : { value: idle(), notModified: true }, null);
  h.controller.start();
  await h.clock.advance(0);
  assert.deepEqual(h.received, [{ value, view: 'panel' }]);
  assert.equal(h.received[0].value, value);
  assert.equal(h.state(), value);
  assert.deepEqual(h.unchanged, []);
  assert.deepEqual(h.controller.stats, { polls: 1, notModified: 0, renders: 0, legacy: false, failures: 0 });
  h.controller.stats.renders++;
  await h.clock.advance(1000);
  assert.equal(h.state(), value, '304 preserves the held body');
  assert.equal(h.received.length, 1, 'no card rendering callback on 304');
  assert.deepEqual(h.unchanged, [1000]);
  assert.deepEqual(h.controller.stats, { polls: 2, notModified: 1, renders: 1, legacy: false, failures: 0 });
  assert.deepEqual(h.errors, []);
});

for (const outcome of ['body', '304', 'error']) {
  test('stop during a deferred ' + outcome + ' ignores its continuation and never rearms', async t => {
    const answer = deferred();
    const h = setup(t, () => answer.promise);
    h.controller.start();
    h.controller.request();
    h.controller.stop();
    h.controller.stop();
    h.controller.request();
    if (outcome === 'error') answer.reject(Object.assign(new Error('offline'), { network: true }));
    else answer.resolve({ value: idle(), notModified: outcome === '304' });
    await h.clock.advance(20000);
    assert.deepEqual(h.received, [], 'no late body reaches the presentation');
    assert.deepEqual(h.unchanged, [], 'no late connection notification');
    assert.deepEqual(h.errors, [], 'no late error notification');
    assert.equal(h.clock.armed, 0);
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.controller.stats, { polls: 0, notModified: 0, renders: 0, legacy: false, failures: 0 });
  });
}

test('stop cancels a wait and remains terminal after repeated stops, requests and starts', async t => {
  const h = setup(t, () => body(idle()));
  h.controller.start();
  await h.clock.advance(0);
  assert.equal(h.clock.armed, 1);
  h.controller.stop();
  assert.equal(h.clock.armed, 0);
  h.controller.stop();
  h.controller.request();
  h.controller.start();
  await h.clock.advance(20000);
  assert.equal(h.clock.armed, 0);
  assert.equal(h.requests.length, 1);
});

const refusal = (status, message, code) => Object.assign(new Error(message), { status, code });
const busy = () => ({ timeline: { cards: [] }, chat: { jobs: [{ id: 'deep-1', status: 'running' }] } });

for (const error of [refusal(404, 'Route inconnue.'), refusal(400, 'Vue indisponible sous cette forme.', 'unknown-view')]) {
  test('a view refusal with status ' + error.status + ' permanently reads the complete state', async t => {
    const h = setup(t, view => {
      if (view) throw error;
      return body(busy());
    }, busy());
    h.controller.start();
    await h.clock.advance(20000);
    assert.deepEqual(h.requests.slice(0, 2), [{ at: 0, view: 'panel' }, { at: 0, view: 'full' }]);
    assert.equal(h.requests.length, 22);
    assert.ok(h.requests.slice(1).every(call => call.view === 'full'));
    assert.deepEqual(h.errors, []);
    assert.equal(h.received.length, 21);
    assert.ok(h.received.every(read => read.view === null));
    assert.deepEqual(h.controller.stats, { polls: 21, notModified: 0, renders: 0, legacy: true, failures: 0 });
  });
}

test('a passing 400 reads the complete state for ten seconds then retries views', async t => {
  let reads = 0;
  const h = setup(t, () => {
    if (++reads === 1) throw refusal(400, 'Curseur invalide.');
    return body(idle());
  });
  h.controller.start();
  await h.clock.advance(9999);
  assert.deepEqual(h.requests.slice(0, 2), [{ at: 0, view: 'panel' }, { at: 0, view: 'full' }]);
  assert.equal(h.requests.length, 11);
  assert.ok(h.requests.slice(1).every(call => call.view === 'full'));
  assert.equal(h.received.length, 10);
  assert.deepEqual(h.errors, []);
  assert.equal(h.controller.stats.legacy, false);
  await h.clock.advance(1);
  assert.deepEqual(h.requests.at(-1), { at: 10000, view: 'panel' });
  assert.equal(h.received.at(-1).view, 'panel');
});

for (const status of [401, 500]) {
  test('an HTTP ' + status + ' reaches the error callback without becoming a view refusal', async t => {
    const error = refusal(status, 'Refus du serveur.');
    const h = setup(t, () => { throw error; }, busy());
    h.controller.start();
    await h.clock.advance(1000);
    assert.deepEqual(h.requests, [{ at: 0, view: 'panel' }, { at: 1000, view: 'chat' }]);
    assert.deepEqual(h.received, []);
    assert.deepEqual(h.unchanged, []);
    assert.deepEqual(h.errors, [error, error]);
    assert.deepEqual(h.controller.stats, { polls: 0, notModified: 0, renders: 0, legacy: false, failures: 2 });
  });
}

for (const [name, state, cadence] of [['idle', idle(), 1000], ['active', busy(), 250]]) {
  test('network failures back off to eight seconds for an ' + name + ' session and a success restores its cadence', async t => {
    let reads = 0;
    const h = setup(t, () => {
      if (++reads <= 6) throw Object.assign(new Error('offline'), { network: true });
      return body(state);
    }, state);
    h.controller.start();
    await h.clock.advance(23000);
    assert.deepEqual(h.requests.map(call => call.at), [0, 1000, 3000, 7000, 15000, 23000]);
    assert.equal(h.errors.length, 6);
    assert.equal(h.controller.stats.failures, 6);
    assert.equal(h.controller.stats.polls, 0);
    await h.clock.advance(8000);
    assert.equal(h.requests.at(-1).at, 31000);
    assert.equal(h.controller.stats.failures, 0);
    assert.equal(h.received.length, 1);
    await h.clock.advance(cadence - 1);
    assert.equal(h.requests.length, 7);
    await h.clock.advance(1);
    assert.equal(h.requests.at(-1).at, 31000 + cadence);
  });
}

test('internal server errors through the remote client back off without declaring an unknown view', async t => {
  const routes = [];
  const state = busy();
  const client = new RemoteClient({ url: 'http://controlled-server', token: 'fixture' }, async url => {
    routes.push(new URL(url).pathname + new URL(url).search);
    const failing = routes.length <= 6;
    return new Response(JSON.stringify(failing ? { error: 'Erreur interne du serveur.', code: 'internal-error' } : state), {
      status: failing ? 500 : 200,
    });
  });
  const h = setup(t, view => client.state(view), state);
  h.controller.start();
  await h.clock.advance(23000);
  assert.deepEqual(h.requests.map(call => call.at), [0, 1000, 3000, 7000, 15000, 23000]);
  assert.ok(h.requests.every(call => call.view !== 'full'));
  assert.ok(routes.every(route => route.startsWith('/v1/state?view=')));
  assert.deepEqual(h.errors.map(error => [error.status, error.code, error.message]),
    Array.from({ length: 6 }, () => [500, 'internal-error', 'Erreur interne du serveur.']));
  assert.deepEqual(h.received, []);
  assert.equal(h.controller.stats.legacy, false);
  assert.equal(h.controller.stats.failures, 6);
  await h.clock.advance(8000);
  assert.equal(h.requests.at(-1).at, 31000);
  assert.deepEqual(h.received, [{ value: state, view: 'chat' }]);
  assert.equal(h.controller.stats.failures, 0);
  assert.equal(h.controller.stats.legacy, false);
  await h.clock.advance(249);
  assert.equal(h.requests.length, 7);
  await h.clock.advance(1);
  assert.equal(h.requests.at(-1).at, 31250);
});

test('configured cadences and retry duration reach the existing plan', async t => {
  let reads = 0;
  const h = setup(t, () => {
    if (++reads === 1) throw refusal(400, 'Curseur invalide.');
    return body(busy());
  }, busy(), { activeMs: 500, idleMs: 2000, viewRetryMs: 4000 });
  h.controller.start();
  await h.clock.advance(4500);
  assert.deepEqual(h.requests, [
    { at: 0, view: 'panel' }, { at: 0, view: 'full' }, { at: 2000, view: 'full' },
    { at: 4000, view: 'chat' }, { at: 4500, view: 'chat' },
  ]);
});

for (const [status, code, message, permanent, fallback] of [
  [400, 'unknown-view', 'Resource unavailable!', true, true],
  [400, 'unknown-view', 'Vue d’état inconnue.', true, true],
  [400, undefined, 'Vue d’état inconnue.', false, true],
  [400, 'invalid-anchor', 'Vue d’état inconnue.', false, true],
  [404, 'route-not-found', 'Route reformulée.', true, true],
  [404, 'media-missing', 'Vue d’état inconnue.', false, false],
  [401, 'unauthorized', 'Vue d’état inconnue.', false, false],
  [503, 'internal-error', 'Vue d’état inconnue.', false, false],
]) {
  test(`real polling classifies ${status} ${code} with message ${message}`, async t => {
    let reads = 0;
    const client = new RemoteClient({ url: 'http://controlled-server', token: 'fixture' }, async () => {
      const failing = ++reads === 1;
      return new Response(JSON.stringify(failing ? { code, error: message } : busy()), { status: failing ? status : 200 });
    });
    const h = setup(t, view => client.state(view), busy());
    h.controller.start();
    await h.clock.advance(0);
    assert.deepEqual(h.requests.map(call => call.view), fallback ? ['panel', 'full'] : ['panel']);
    assert.equal(h.controller.stats.legacy, permanent);
    assert.equal(h.received.length, fallback ? 1 : 0);
    assert.deepEqual(h.errors.map(error => [error.status, error.code, error.message]), fallback ? [] : [[status, code, message]]);
    await h.clock.advance(999);
    assert.equal(h.requests.length, fallback ? 2 : 1);
    await h.clock.advance(1);
    assert.deepEqual(h.requests.at(-1), { at: 1000, view: fallback ? 'full' : 'chat' });
    await h.clock.advance(9000);
    assert.equal(h.controller.stats.legacy, permanent);
    assert.equal(h.requests.at(-1).view === 'full', permanent);
    assert.equal(h.controller.stats.failures, 0);
  });
}

test('requests before start do nothing and stopping an unused controller prevents startup', async t => {
  const h = setup(t, () => body(idle()));
  h.controller.request();
  await h.clock.advance(20000);
  assert.deepEqual(h.requests, []);
  assert.equal(h.clock.armed, 0);
  h.controller.stop();
  h.controller.start();
  h.controller.request();
  await h.clock.advance(20000);
  assert.deepEqual(h.requests, []);
  assert.equal(h.clock.armed, 0);
});
