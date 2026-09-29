const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { LocalSessionStore, cleanupRawMedia } = require('../adapters/local-store.cjs');
const { OpenRouterAdapter } = require('../adapters/openrouter.cjs');
test('local media supports byte-range replay; cleanup retains session archive only', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-store-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new LocalSessionStore(path.join(root, 'session'));
  await store.put('moment-1', { clip: new Uint8Array([1, 2, 3, 4, 5]), frames: [], audio: new Uint8Array([8]) });
  await store.save({ id: 'session', questions: [] });
  const response = await store.response('moment-1', 'bytes=1-3');
  assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), 'bytes 1-3/5');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [2, 3, 4]);
  assert.equal((await store.response('moment-1', 'bytes=9-12')).status, 416);
  assert.throws(() => store.file('../../.env.local', 'json'), /invalide/);
  const recap={sessionId:'session',overview:'Résumé conservé',sourcePassages:[{id:'moment-1',text:'Original'}]};
  await store.saveRecap(recap);
  await cleanupRawMedia(root);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'session','living-recap.json'),'utf8')),recap);
  assert.deepEqual(await fs.readdir(path.join(root, 'session')), ['living-recap.json','session.json']);
});
test('adapter validates JSON and never exposes raw provider errors containing secrets', async () => {
  const errorAdapter = new OpenRouterAdapter({ apiKey: 'secret', model: 'test', fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'secret' } }), { status: 429 }) });
  await assert.rejects(errorAdapter.observe({ frames: [] }), error => /Quota/.test(error.message) && !error.message.includes('secret'));
  const invalid = new OpenRouterAdapter({ apiKey: 'secret', model: 'test', fetchImpl: async () => Response.json({ choices: [{ message: { content: 'Definitely a dragon.' } }] }) });
  await assert.rejects(invalid.observe({ frames: [] }), /non structurée/);
});
test('adapter sends image and audio in the documented content blocks', async () => {
  let request;
  const adapter = new OpenRouterAdapter({ apiKey: 'secret', model: 'test', fetchImpl: async (_url, options) => {
    request = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ summary: 'Objet', visual: 'Bleu', audio: 'Son', transcript: '' }) } }], usage: { cost: 0 } });
  } });
  await adapter.observe({ id: 'moment-1', startMs: 0, endMs: 1000, frames: [{ atMs: 0, dataUrl: 'data:image/jpeg;base64,AA==' }], audio: new Uint8Array([1, 2]) });
  const content = request.messages[1].content;
  assert.equal(content.find(c => c.type === 'image_url').image_url.url, 'data:image/jpeg;base64,AA==');
  assert.equal(content.find(c => c.type === 'input_audio').input_audio.format, 'wav');
  assert.equal(request.model, 'test'); assert.equal(request.plugins, undefined);
});
test('video inspection converts provider-relative slow-motion times into original session times', async () => {
  let request;
  const adapter = new OpenRouterAdapter({ apiKey: 'test', model: 'google/gemini-2.5-flash', fetchImpl: async (_url, options) => {
    request = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: JSON.stringify({
      observations: [{ id: 'moment-2', startMs: 4000, endMs: 12000, text: 'Le cercle descend.' }], hypotheses: [], limits: []
    }) } }], usage: { cost: 0.001 } });
  } });
  const result = await adapter.inspect({ question: 'Quel mouvement ?', segments: [{ id: 'moment-2', startMs: 15000, endMs: 20000, timeScale: 4, videoDataUrl: 'data:video/mp4;base64,AA==', frames: [] }] });
  assert.deepEqual(result.observations[0], { id: 'moment-2', startMs: 16000, endMs: 18000, text: 'Le cercle descend.' });
  assert.ok(request.messages[1].content.some(c => c.type === 'video_url'));
  assert.ok(request.messages[1].content.some(c => c.text?.includes('20000 ms')));
});
test('an HTTP 402 pre-generation rejection releases its reservation without erasing previous costs', async () => {
  const settlements=[];
  const adapter=new OpenRouterAdapter({apiKey:'test',model:'google/gemini-2.5-flash',budget:{reserve:()=> 'rejected-call',settle:(...args)=>settlements.push(args)},fetchImpl:async()=>Response.json({error:{code:402,message:'video requires balance'}},{status:402})});
  await assert.rejects(adapter.inspect({question:'Action ?',segments:[]}),/Crédits/);
  assert.deepEqual(settlements,[['rejected-call',0]]);
});
