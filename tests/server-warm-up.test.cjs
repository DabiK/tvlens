const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
const { SimulatedSurveillanceAgent } = require('../adapters/simulated-surveillance-agent.cjs');

const until = async (check, label) => {
  for (const deadline = Date.now() + 10000; Date.now() < deadline;) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  assert.fail('never reached: ' + label);
};

// A host whose chat agent and observation agent both record the identifier they are asked to prepare.
async function recordingHost(t, { failing = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-warm-up-'));
  const state = { clock: 0, prepared: [] };
  const record = label => async id => {
    state.prepared.push(label + ':' + id);
    if (failing) throw new Error('the provider is not reachable');
  };
  const chat = {
    answer: async () => ({ answer: 'Ok.', kind: 'explanation', citations: [], limits: [] }),
    prepare: record('chat'),
  };
  const perception = {
    transcribe: async () => ({ observation: { transcript: 'Paroles.' }, elapsedMs: 1 }),
    observeVisual: async () => ({ observation: { summary: 'Image.' }, elapsedMs: 1 }),
    agent: { prepare: record('observe') },
  };
  const runtime = new HeadlessRuntime({
    userData: root,
    sessionsRoot: path.join(root, 'sessions'),
    config: {},
    selectedModels: {},
    smoke: true,
    agent: chat,
    surveillanceAgent: new SimulatedSurveillanceAgent(),
    readClock: () => state.clock,
    overrides: { perception },
  });
  t.after(async () => {
    await runtime.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  // One passage, analysed: a session without any passage is erased when it ends.
  const keepOnePassage = async id => {
    state.clock = 8000;
    await runtime.ingest({
      sessionId: id,
      startMs: 0,
      endMs: 8000,
      clip: Buffer.from('fixture'),
      frames: [{ atMs: 0, dataUrl: 'data:image/jpeg;base64,YQ==' }],
      audio: null,
    });
    await until(
      () => !runtime.session.watch.running && runtime.session.watch.segments[0].status === 'ready',
      'passage analysed',
    );
  };
  return { runtime, prepared: state.prepared, keepOnePassage };
}

test('starting a session warms up the chat agent and the observation agent once each, under the same session', async t => {
  const { runtime, prepared } = await recordingHost(t);
  const { id } = await runtime.start();
  assert.deepEqual([...prepared].sort(), ['chat:' + id, 'observe:' + id + '-observe']);
});

test('an archive opened for reading warms up nothing, and resuming it warms up both agents again under the same session', async t => {
  const { runtime, prepared, keepOnePassage } = await recordingHost(t);
  const { id } = await runtime.start();
  await keepOnePassage(id);
  const ended = await runtime.end();
  assert.equal(ended.archived, true);
  assert.equal(ended.id, id);
  prepared.length = 0;

  const opened = await runtime.open(id);
  assert.equal(opened.id, id);
  assert.equal(opened.readOnly, true);
  assert.deepEqual(prepared, [], 'reading an archive calls no provider');

  const resumed = await runtime.resume(id);
  assert.equal(resumed.id, id);
  assert.equal(resumed.readOnly, false);
  assert.deepEqual([...prepared].sort(), ['chat:' + id, 'observe:' + id + '-observe']);
});

test('a warm-up that is refused by the provider neither fails the start or the resume nor leaves a rejection unhandled', async t => {
  const { runtime, prepared, keepOnePassage } = await recordingHost(t, { failing: true });
  const unhandled = [];
  const onUnhandled = reason => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const { id } = await runtime.start();
    await keepOnePassage(id);
    await runtime.end();
    await runtime.open(id);
    const resumed = await runtime.resume(id);
    assert.equal(resumed.id, id);
    // A rejection nobody handled is reported on the next turn of the event loop.
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
    assert.deepEqual(
      prepared.filter(call => call.startsWith('chat:')),
      ['chat:' + id, 'chat:' + id],
      'the chat agent was asked to warm up at the start and at the resume',
    );
    assert.deepEqual(
      prepared.filter(call => call.startsWith('observe:')),
      ['observe:' + id + '-observe', 'observe:' + id + '-observe'],
      'the observation agent was asked to warm up at the start and at the resume',
    );
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});
