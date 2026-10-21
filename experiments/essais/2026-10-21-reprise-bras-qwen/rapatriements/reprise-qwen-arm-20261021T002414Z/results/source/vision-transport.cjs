const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_TOKENS = 1024;
const TIMEOUT_MS = 90000;

function localBase(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw Error('LOCAL_URL_REQUIRED');
  }
  return url.origin;
}

function requestFor(backend, model, prompt) {
  if (backend === 'ollama') {
    return {
      model,
      stream: false,
      think: false,
      format: prompt.outputSchema,
      keep_alive: '10m',
      options: { temperature: 0, num_ctx: 16384, num_predict: MAX_TOKENS },
      messages: [{ role: 'user', content: prompt.instructions,
        images: prompt.frames.map(frame => frame.split(',', 2)[1]) }],
    };
  }
  return {
    model,
    stream: false,
    temperature: 0,
    max_tokens: MAX_TOKENS,
    chat_template_kwargs: { enable_thinking: false },
    response_format: { type: 'json_schema', json_schema: {
      name: 'tvlens_vision', strict: true, schema: prompt.outputSchema,
    } },
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt.instructions },
      ...prompt.frames.map(frame => ({ type: 'image_url', image_url: { url: frame } })),
    ] }],
  };
}

async function readBounded(response) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_RESPONSE_BYTES) throw Error('RESPONSE_TOO_LARGE');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function exchange(url, options = {}, fetchImpl = fetch) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  let response;
  try {
    response = await fetchImpl(url, { redirect: 'error', ...options, signal });
    const headersMs = performance.now() - started;
    const bytes = await readBounded(response);
    return { status: response.status, headersMs, totalMs: performance.now() - started,
      bytes, contentType: response.headers.get('content-type') };
  } finally {
    clearTimeout(timer);
  }
}

function parseResponse(backend, model, exchangeResult) {
  if (exchangeResult.status !== 200) return { status: 'http-error', httpStatus: exchangeResult.status };
  let json;
  try { json = JSON.parse(exchangeResult.bytes.toString('utf8')); }
  catch { return { status: 'invalid-json' }; }
  if (json.model !== model) return { status: 'model-mismatch', reportedModel: json.model ?? null };
  let content;
  if (backend === 'ollama') {
    if (json.done_reason === 'length') return { status: 'truncated', finishReason: json.done_reason };
    if (json.done !== true || typeof json.message?.content !== 'string') return { status: 'invalid-response' };
    content = json.message.content;
  } else {
    const choice = json.choices?.[0];
    if (choice?.finish_reason === 'length') return { status: 'truncated', finishReason: choice.finish_reason };
    if (json.choices?.length !== 1 || choice.finish_reason !== 'stop' || choice.message?.tool_calls?.length ||
        typeof choice.message?.content !== 'string') return { status: 'invalid-response', finishReason: choice?.finish_reason ?? null };
    content = choice.message.content;
  }
  let observation;
  try { observation = JSON.parse(content); }
  catch { return { status: 'invalid-content' }; }
  const fields = ['summary', 'visual', 'uncertainty', 'topic', 'topicSummary'];
  const issue = !observation || typeof observation !== 'object' || Array.isArray(observation) ||
    fields.some(field => typeof observation[field] !== 'string' || observation[field].length > 8000) ||
    !['continue', 'change', 'uncertain'].includes(observation.continuity);
  if (issue) return { status: 'invalid-observation', issue };
  const providerMetrics = backend === 'ollama' ? {
    totalDurationNs: json.total_duration ?? null,
    loadDurationNs: json.load_duration ?? null,
    promptEvalDurationNs: json.prompt_eval_duration ?? null,
    evalDurationNs: json.eval_duration ?? null,
    promptTokens: json.prompt_eval_count ?? null,
    outputTokens: json.eval_count ?? null,
    modelState: 'unknown',
  } : { usage: json.usage ?? null, finishReason: json.choices[0].finish_reason };
  return { status: 'returned', observation, providerMetrics };
}

function cadenceSimulation(rows) {
  const intervalMs = 8000;
  const queueCapacity = 2;
  const queue = [];
  const dropped = [];
  const arrivals = [];
  let current = null;
  let finishAt = 0;
  const start = (index, at) => {
    current = index;
    finishAt = at + rows[index].latency.totalMs;
  };
  rows.forEach((row, index) => {
    const at = index * intervalMs;
    while (current !== null && finishAt <= at) {
      const finished = finishAt;
      current = null;
      if (queue.length) start(queue.shift(), finished);
    }
    if (current === null) start(index, at);
    else {
      if (queue.length === queueCapacity) dropped.push(queue.shift());
      queue.push(index);
    }
    arrivals.push({ id: row.id, atMs: at, backlog: queue.length, running: current === null ? null : rows[current].id });
  });
  return { kind: 'counterfactual-selected-cases', intervalMs, queueCapacity,
    measuredCases: rows.length, droppedIds: dropped.map(index => rows[index].id), arrivals };
}

module.exports = { localBase, requestFor, exchange, parseResponse, cadenceSimulation };
