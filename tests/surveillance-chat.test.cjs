const test = require('node:test');
const assert = require('node:assert/strict');
const { rendererHarness } = require('./helpers/mac-renderer.cjs');
const { deferred, turns } = require('./helpers/wait.cjs');

const signal = (id, text, finishedAt = 100) => ({
  id, kind: 'signal', status: 'done', text, finishedAt,
  interval: { startMs: 0, endMs: 5000 }, origin: [], sources: [],
});
const state = (sessionId, lots) => ({ sessionId, activity: { state: 'listening' }, lots });

test('surveillance results reach the conversation once and keep their sources clickable', async t => {
  const f = await rendererHarness(t);
  f.publish('onState', { id: 'session-a', segments: [] });
  const verification = {
    ...signal('lot-2', 'Le chiffre concorde avec la source.', 200), kind: 'verification',
    assessments: [{ claimId: 'claim-1', assessment: 'supported' }],
    sources: [{ title: 'Source consultée', url: 'https://example.org/evidence', evidence: 'Texte de la source.' }],
  };
  const pushed = state('session-a', [signal('lot-1', 'Un sujet repéré.'), verification]);
  f.publish('onSurveillance', pushed);
  f.frame();
  const chat = f.get('message-list');
  assert.equal(chat.children.length, 2);
  assert.match(chat.textContent, /Un sujet repéré/);
  assert.match(chat.textContent, /sans vérification sur le web/);
  assert.match(chat.textContent, /Source consultée/);
  await f.click(chat.querySelectorAll('.source-link')[0]);
  assert.deepEqual(f.calls.at(-1), ['openSurveillanceSource', 'lot-2', 0]);
  f.publish('onSurveillance', pushed);
  f.frame();
  assert.equal(chat.children.length, 2);
  f.publish('onSurveillance', state('session-a', []));
  f.frame();
  assert.equal(chat.children.length, 2, 'A compact publication cannot erase earlier notifications');
  f.publish('onState', { id: 'session-b', segments: [] });
  f.frame();
  assert.equal(chat.children.length, 0, 'Notifications belong to their session');
});

test('opening an archive restores older notifications without replacing a newer pushed result', async () => {
  const { createSurveillanceChat } = await import('../app/ui/surveillance-chat.mjs');
  const read = deferred();
  let changed = 0;
  const chat = createSurveillanceChat({ readHistory: () => read.promise, changed: () => changed++ });
  chat.receive(state('session-a', [signal('lot-2', 'Récent')]));
  read.resolve(state('session-a', [signal('lot-1', 'Ancien'), signal('lot-2', 'Périmé')]));
  await turns(3);
  assert.deepEqual(chat.results('session-a').map(card => card.text), ['Récent', 'Ancien']);
  assert.equal(changed, 1);
});

test('a history read finishing after reset cannot restore another session notifications', async () => {
  const { createSurveillanceChat } = await import('../app/ui/surveillance-chat.mjs');
  const read = deferred();
  let changed = 0;
  const chat = createSurveillanceChat({ readHistory: () => read.promise, changed: () => changed++ });
  chat.receive(state('session-a', []));
  chat.clear();
  read.resolve(state('session-a', [signal('lot-1', 'Ancien')]));
  await turns(3);
  assert.deepEqual(chat.results('session-a'), []);
  assert.equal(changed, 0);
});

test('history is read only after the surveillance registry has finished restoring', async () => {
  const { createSurveillanceChat } = await import('../app/ui/surveillance-chat.mjs');
  let reads = 0;
  const chat = createSurveillanceChat({
    readHistory: async () => { reads++; return state('session-a', [signal('lot-1', 'Historique')]); },
    changed: () => {},
  });
  chat.receive({ ...state('session-a', []), registry: { ready: false } });
  await turns(3);
  assert.equal(reads, 0);
  chat.receive({ ...state('session-a', []), registry: { ready: true } });
  await turns(3);
  assert.equal(reads, 1);
  assert.equal(chat.results('session-a')[0].text, 'Historique');
});
