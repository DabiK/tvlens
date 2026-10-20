const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { parseArgs, run } = require('../scripts/vision-probe.cjs');
const { cadenceSimulation } = require('../scripts/vision-transport.cjs');

const repo = path.resolve(__dirname, '../../../../');
const manifest = path.join(repo, 'scripts/fixtures/perception-replay/manifest.json');
const observation = { summary: 'Une scène.', visual: 'Une image.', uncertainty: '', topic: 'Scène',
  continuity: 'change', topicSummary: 'Une scène.' };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function server(mode = 'success') {
  const requests = [];
  const instance = http.createServer(async (req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('fixture_metric 1\n');
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push({ url: req.url, body });
    const vllm = req.url === '/v1/chat/completions';
    const output = vllm ? { model: body.model, choices: [{ finish_reason: mode === 'truncated' ? 'length' : 'stop',
      message: { content: JSON.stringify(observation) } }], usage: { prompt_tokens: 5, completion_tokens: 8 } } :
      { model: body.model, done: true, done_reason: mode === 'truncated' ? 'length' : 'stop',
        message: { content: JSON.stringify(observation) }, load_duration: 1000000,
        total_duration: 9000000, prompt_eval_count: 5, eval_count: 8 };
    res.writeHead(mode === 'http-error' ? 503 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(output));
  });
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  return { requests, url: `http://127.0.0.1:${instance.address().port}`,
    close: () => new Promise(resolve => instance.close(resolve)) };
}

async function options(root, backend, url, extra = []) {
  return parseArgs(['--repo', repo, '--manifest', manifest, '--backend', backend, '--url', url,
    '--out', path.join(root, backend), '--limit', '1', '--repeats', '2', '--execute', ...extra]);
}

test('les deux bras reçoivent exactement la même consigne et les mêmes pixels figés', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vision-probe-'));
  const fake = await server();
  t.after(async () => { await fake.close(); await fs.rm(root, { recursive: true, force: true }); });
  const vllm = await run(await options(root, 'vllm', fake.url));
  const ollama = await run(await options(root, 'ollama', fake.url));
  assert.equal(vllm.complete, true);
  assert.equal(ollama.complete, true);
  assert.equal(vllm.cases.length, 2);
  assert.equal(ollama.cases.length, 2);
  assert.deepEqual(vllm.cases.map(row => row.promptSha256), ollama.cases.map(row => row.promptSha256));
  assert.deepEqual(vllm.cases.map(row => row.frameSha256), ollama.cases.map(row => row.frameSha256));
  const [openai, , native] = fake.requests;
  assert.equal(openai.body.messages[0].content[0].text, native.body.messages[0].content);
  assert.deepEqual(openai.body.messages[0].content.slice(1).map(part => part.image_url.url.split(',')[1]),
    native.body.messages[0].images);
  assert.equal(native.body.keep_alive, '10m');
  assert.equal(openai.body.max_tokens, native.body.options.num_predict);
  assert.equal(openai.body.max_tokens, 1024);
  assert.equal(native.body.options.num_ctx, 16384);
  assert.equal(vllm.cases[0].providerMetrics.usage.completion_tokens, 8);
  assert.equal(ollama.cases[0].providerMetrics.loadDurationNs, 1000000);
  assert.equal(ollama.cases[0].providerMetrics.modelState, 'unknown');
  const raw = await fs.readFile(path.join(root, 'vllm/pass-1-capture-documentee/response.raw.txt'));
  assert.equal(vllm.cases[0].responseSha256, hash(raw));
  const sealed = JSON.parse(await fs.readFile(path.join(root, 'vllm/integrite.json')));
  assert.equal(sealed.files['pass-1-capture-documentee/response.raw.txt'], hash(raw));
  await assert.rejects(run(await options(root, 'vllm', fake.url)), { code: 'EEXIST' });
});

test('une sortie tronquée ou HTTP 503 reste brute et rend le pré-vol incomplet', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vision-probe-errors-'));
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
  for (const [mode, expected] of [['truncated', 'truncated'], ['http-error', 'http-error']]) {
    const fake = await server(mode);
    try {
      const out = path.join(root, mode);
      const args = parseArgs(['--repo', repo, '--manifest', manifest, '--backend', 'vllm',
        '--url', fake.url, '--out', out, '--limit', '1', '--execute']);
      const report = await run(args);
      assert.equal(report.complete, false);
      assert.equal(report.cases[0].status, expected);
      assert.ok(report.cases[0].responseSha256);
      assert.ok((await fs.stat(path.join(out, 'pass-1-capture-documentee/response.raw.txt'))).size > 0);
    } finally { await fake.close(); }
  }
});

test('la cadence simulée signale une file et une perte sur des délais connus', () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({ id: `bloc-${index}`, latency: { totalMs: 30000 } }));
  const result = cadenceSimulation(rows);
  assert.equal(result.kind, 'counterfactual-selected-cases');
  assert.deepEqual(result.droppedIds, ['bloc-1']);
  assert.equal(result.arrivals[3].backlog, 2);
});
