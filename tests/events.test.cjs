const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEventPublisher } = require('../core/shared/events.cjs');
const { tick } = require('./helpers/wait.cjs');

const message = revision => ({
  type: 'PassageReceived', sessionId: 'session', passageId: 'moment-1', revision,
  interval: { startMs: 0, endMs: 1000 },
});

test('publication synchronously serves subscribers in order without replaying earlier messages', () => {
  const events = createEventPublisher(), seen = [];
  events.publish(message(0));
  const unsubscribe = events.subscribe(event => seen.push(['first', event.revision]));
  events.subscribe(event => seen.push(['second', event.revision]));
  assert.equal(events.publish(message(1)), undefined);
  unsubscribe();
  unsubscribe();
  events.publish(message(2));
  assert.deepEqual(seen, [['first', 1], ['second', 1], ['second', 2]]);
});

test('nested publication waits for the current delivery and subscription changes apply to the next message', () => {
  const events = createEventPublisher(), seen = [];
  let unsubscribeSecond;
  events.subscribe(event => {
    seen.push(['first', event.revision]);
    if (event.revision !== 0) return;
    unsubscribeSecond();
    events.subscribe(next => seen.push(['third', next.revision]));
    events.publish(message(1));
    seen.push(['returned', 0]);
  });
  unsubscribeSecond = events.subscribe(event => seen.push(['second', event.revision]));
  events.publish(message(0));
  assert.deepEqual(seen, [
    ['first', 0], ['returned', 0], ['second', 0], ['first', 1], ['third', 1],
  ]);
});

test('all current subscribers finish a message before any receives the nested messages in FIFO order', () => {
  const events = createEventPublisher(), seen = [];
  events.subscribe(event => {
    seen.push(['first', event.revision]);
    if (event.revision !== 0) return;
    events.publish(message(1));
    events.publish(message(2));
  });
  events.subscribe(event => seen.push(['second', event.revision]));
  events.publish(message(0));
  assert.deepEqual(seen, [
    ['first', 0], ['second', 0], ['first', 1], ['second', 1], ['first', 2], ['second', 2],
  ]);
});

test('each queued message owns immutable data before any subscriber or publisher can change it', () => {
  const events = createEventPublisher(), seen = [], input = message(0), nested = message(1);
  events.subscribe(event => {
    Reflect.set(event, 'revision', 99);
    Reflect.set(event.interval, 'endMs', 99);
    if (event.revision !== 0) return;
    events.publish(nested);
    nested.interval.startMs = 99;
    input.interval.endMs = 99;
  });
  events.subscribe(event => seen.push(event));
  events.publish(input);
  assert.deepEqual(seen, [message(0), message(1)]);
  assert.ok(seen.every(event => Object.isFrozen(event) && Object.isFrozen(event.interval)));
  assert.equal(Object.isFrozen(input), false, 'publication does not freeze the caller data');
});

for (const diagnostic of ['records', 'throws', 'rejects']) {
  test(`subscriber exceptions and promises cannot retain delivery when the diagnostic ${diagnostic}`, async () => {
    const failures = [], seen = [], thrown = Error('subscriber threw'), rejected = Error('subscriber rejected');
    const events = createEventPublisher({ onError: failure => {
      failures.push(failure);
      if (diagnostic === 'throws') throw Error('diagnostic threw');
      if (diagnostic === 'rejects') return Promise.reject(Error('diagnostic rejected'));
    } });
    events.subscribe(() => { throw thrown; });
    events.subscribe(() => Promise.reject(rejected));
    events.subscribe(() => new Promise(() => {}));
    events.subscribe(event => seen.push(event));
    assert.doesNotThrow(() => events.publish(message(0)));
    assert.deepEqual(seen, [message(0)], 'delivery returns synchronously without waiting for promises');
    await tick();
    assert.deepEqual(failures, [
      { code: 'TVLENS_EVENT_DELIVERY_FAILED', event: message(0), subscriberId: 1, error: thrown },
      { code: 'TVLENS_EVENT_DELIVERY_FAILED', event: message(0), subscriberId: 2, error: rejected },
    ]);
    events.publish(message(1));
    await tick();
    assert.deepEqual(seen, [message(0), message(1)]);
    assert.equal(failures.length, 4, 'diagnostic failures never diagnose themselves');
  });
}
