const { OllamaHttpClient } = require('./http-client.cjs');
const { countThinking } = require('./thinking.cjs');
const { VIDEO_TOOL_CALL_LIMIT } = require('../../core/video-tool-contracts.cjs');
const { toolDefinitions, allowedToolCall } = require('./video-tools.cjs');
const { schema, buildLocalPrompt } = require('../companion-prompt.cjs');
const { DECISION_FORMAT, decisionMessages, readDecision } = require('../web-decision-prompt.cjs');
const { readMessage, readAnswer } = require('./question-response.cjs');
const { TVLENS_QUESTION_IMAGES_ABSENT, IMAGES_ABSENT_MESSAGE } = require('../../core/video-tools.cjs');
const { QUESTION_TIMEOUT_MS } = require('../../core/deep-ask.cjs');
const { WEB_DOCUMENT_LIMIT, callsForWeb, retrievalQuery, searchTerms, pageExcerpt } = require('../../core/web-retrieval.cjs');
const { sourceKey } = require('../external-links.cjs');
const TVLENS_OLLAMA_TOOL_REFUSED = 'TVLENS_OLLAMA_TOOL_REFUSED';
const TVLENS_OLLAMA_TOOL_BUDGET = 'TVLENS_OLLAMA_TOOL_BUDGET';
const TVLENS_OLLAMA_QUESTION_CLOSED = 'TVLENS_OLLAMA_QUESTION_CLOSED';
const TVLENS_OLLAMA_QUESTION_TIMEOUT = 'TVLENS_OLLAMA_QUESTION_TIMEOUT';
const TVLENS_OLLAMA_WEB_TRIGGER_INVALID = 'TVLENS_OLLAMA_WEB_TRIGGER_INVALID';
const WEB_TRIGGERS = ['auto', 'always', 'model'];
const DEFAULT_WEB_TRIGGER = 'auto';
// Well inside the question deadline (QUESTION_TIMEOUT_MS): a slow retrieval leaves time to answer without pages.
const WEB_RETRIEVAL_TIMEOUT_MS = 15_000;
// The model's decision is a short call (under a second when measured): past this delay the rule decides instead.
const WEB_DECISION_TIMEOUT_MS = 5_000;
// A boolean and a query of a few keywords: the decision never needs a long generation.
const WEB_DECISION_MAX_TOKENS = 80;
const WEB_RETRIEVAL_FAILED_LIMIT = 'La recherche web locale n’a pas abouti.';
const RESIDENCES = ['local', 'hybrid'];

function reportUsage(input, usage) {
  try { input.onProviderMetrics?.({ ...usage }); } catch {
    // Le diagnostic numérique ne doit pas interrompre une réponse locale.
  }
}

const filled = value => typeof value === 'string' && value.trim() !== '';
const optionalText = (document, key) => (typeof document[key] === 'string' ? { [key]: document[key] } : {});

// The port is trusted for nothing: the agent bounds what reaches the prompt (count, length, safe URL, one page per URL).
// Each page keeps its head and the passage that best matches the search terms.
function boundedPages(documents, terms) {
  const pages = [], keys = new Set();
  for (const document of Array.isArray(documents) ? documents : []) {
    const key = sourceKey(document?.url);
    if (!key || keys.has(key) || !filled(document.title) || !filled(document.text)) continue;
    keys.add(key);
    pages.push({ url: key, title: document.title, ...optionalText(document, 'publisher'),
      ...optionalText(document, 'publishedAt'), text: pageExcerpt(document.text, terms) });
    if (pages.length === WEB_DOCUMENT_LIMIT) break;
  }
  return pages;
}

function retrievalStatus(outcome, pages) {
  if (!outcome.ok) return 'failed';
  return pages.length ? 'used' : 'empty';
}

class OllamaQuestionAgent {
  #client;
  #generation = new AbortController();
  #now;
  #setTimer;
  #clearTimer;
  #onRequest;
  #transport;
  #retrieval;
  #webTrigger;
  constructor({ now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, retrieval, webTrigger = DEFAULT_WEB_TRIGGER, ...options } = {}) {
    if (!WEB_TRIGGERS.includes(webTrigger)) throw Object.assign(Error('Déclencheur web local invalide (auto, always ou model).'), {
      code: TVLENS_OLLAMA_WEB_TRIGGER_INVALID,
    });
    this.#retrieval = retrieval;
    this.#webTrigger = webTrigger;
    const fetchImpl = options.fetchImpl || fetch;
    this.#transport = options.fetchImpl ? 'injected' : 'http';
    this.#client = new OllamaHttpClient({ ...options, fetchImpl: (...args) => {
      this.#onRequest?.();
      return fetchImpl(...args);
    } });
    this.#now = now;
    this.#setTimer = setTimer;
    this.#clearTimer = clearTimer;
    this.tail = Promise.resolve();
  }

  get identity() {
    return Object.freeze({ role: 'questions', ...this.#client.backend, temperature: this.#client.temperature, transport: this.#transport });
  }

  prepare() { return Promise.resolve(); }
  close() {
    this.#generation.abort(Object.assign(Error('Question locale annulée à la fin de session.'), {
      code: TVLENS_OLLAMA_QUESTION_CLOSED,
    }));
    this.#generation = new AbortController();
    return Promise.resolve();
  }

  answer(input) {
    let requests = 0;
    const report = () => {
      try { input.onProviderRequest?.(requests); } catch {
        // Une panne du diagnostic ne change ni l'envoi ni la réponse.
      }
    };
    report();
    const signal = AbortSignal.any([this.#generation.signal, ...(input.signal ? [input.signal] : [])]);
    const pending = this.tail.catch(() => {}).then(() => this.run({ ...input, signal,
      reportRequest: () => { requests++; report(); } }));
    this.tail = pending;
    return pending;
  }

  async run(input) {
    input.signal.throwIfAborted();
    const deadline = new AbortController();
    const timer = this.#setTimer(() => deadline.abort(Object.assign(Error('Délai maximal de la question locale atteint.'), {
      code: TVLENS_OLLAMA_QUESTION_TIMEOUT,
    })), QUESTION_TIMEOUT_MS);
    const signal = AbortSignal.any([input.signal, deadline.signal]);
    this.#onRequest = input.reportRequest;
    try { return await this.infer({ ...input, signal }); }
    finally { this.#onRequest = undefined; this.#clearTimer(timer); }
  }

  async infer(input) {
    const started = this.#now();
    const { tools, signal } = input;
    const usage = {};
    const { pages, retrieval } = await this.#webPages(input, usage);
    const messages = [{ role: 'user', content: buildLocalPrompt({ ...input, webPages: pages }) }];
    const audit = [];
    let attempts = 0;
    while (true) {
      const availableTools = attempts < VIDEO_TOOL_CALL_LIMIT ? toolDefinitions : [];
      const data = await this.#client.chat({ messages, tools: availableTools, format: schema, signal });
      signal.throwIfAborted();
      countThinking(data, usage);
      reportUsage(input, usage);
      const message = readMessage(data);
      if (!message.tool_calls?.length) {
        const result = readAnswer(message.content, pages);
        if (retrieval?.status === 'failed') result.limits = [...result.limits, WEB_RETRIEVAL_FAILED_LIMIT];
        return { ...result, ...usage, audit, model: this.#client.backend.model, ...(retrieval && { retrieval }),
          backend: { role: 'questions', ...this.#client.backend }, elapsedMs: this.#now() - started, coldStart: false, connectMs: 0 };
      }
      messages.push(message);
      for (const call of message.tool_calls) {
        if (++attempts > VIDEO_TOOL_CALL_LIMIT) throw Object.assign(Error('Limite de huit appels d’outils atteinte.'), {
          code: TVLENS_OLLAMA_TOOL_BUDGET,
        });
        messages.push(await this.dispatch(call, tools, signal, audit));
      }
    }
  }

  #webEligible({ mode, context }) {
    return Boolean(this.#retrieval) && mode === 'chat' && !context?.intent;
  }

  async #webPages(input, usage) {
    if (!this.#webEligible(input)) return { pages: [] };
    if (this.#webTrigger === 'model') return this.#decideAndRetrieve(input, usage);
    if (this.#webTrigger === 'always' || callsForWeb(input.question)) return this.#retrieve(input, retrievalQuery(input.question));
    return { pages: [] };
  }

  // The model's query serves the retrieval only: the answer keeps the viewer's question. Without a usable decision the
  // rule decides, on the raw question.
  async #decideAndRetrieve(input, usage) {
    const started = this.#now();
    const decision = await this.#decide(input, usage);
    const decisionMs = this.#now() - started;
    if (decision?.web === false) return { pages: [], retrieval: { decision: 'no-web', decisionMs } };
    const modelQuery = decision ? retrievalQuery(decision.query) : '';
    if (modelQuery) return this.#retrieve(input, modelQuery, { decision: 'web', query: modelQuery, decisionMs });
    if (!callsForWeb(input.question)) return { pages: [], retrieval: { decision: 'failed', decisionMs } };
    const query = retrievalQuery(input.question);
    return this.#retrieve(input, query, { decision: 'failed', query, decisionMs });
  }

  // A short call without tools under its own delay. Its error or delay only costs the decision; a cancelled question stops.
  async #decide(input, usage) {
    const expired = new AbortController();
    const timer = this.#setTimer(() => expired.abort(), WEB_DECISION_TIMEOUT_MS);
    const signal = AbortSignal.any([input.signal, expired.signal]);
    try {
      const data = await this.#client.chat({ messages: decisionMessages({ question: input.question, passages: input.context?.passages }),
        format: DECISION_FORMAT, options: { num_predict: WEB_DECISION_MAX_TOKENS }, think: false, signal });
      countThinking(data, usage);
      reportUsage(input, usage);
      return readDecision(readMessage(data).content);
    } catch {
      // The provider's error is not published: only the question's own cancellation goes on, everything else is no decision.
      input.signal.throwIfAborted();
      return null;
    } finally { this.#clearTimer(timer); }
  }

  // Pages are read before the answer. A failed or slow retrieval only costs the pages; a cancelled question stops here.
  // The passage kept from each page matches the viewer's question and the query sent to the port.
  async #retrieve(input, query, decided = {}) {
    const started = this.#now();
    const outcome = await this.#raceRetrieval(query, input.signal);
    input.signal.throwIfAborted();
    const pages = outcome.ok ? boundedPages(outcome.documents, searchTerms(input.question, query)) : [];
    const residence = RESIDENCES.includes(this.#retrieval.residence) ? this.#retrieval.residence : 'unknown';
    return { pages, retrieval: { residence, status: retrievalStatus(outcome, pages), documents: pages.length,
      elapsedMs: this.#now() - started, ...decided } };
  }

  // The port may ignore its signal: the agent stops waiting on abandonment and leaves the late promise settled aside.
  async #raceRetrieval(query, signal) {
    const expired = new AbortController();
    const timer = this.#setTimer(() => expired.abort(), WEB_RETRIEVAL_TIMEOUT_MS);
    const stop = AbortSignal.any([signal, expired.signal]);
    let onAbort;
    const abandoned = new Promise(resolve => {
      onAbort = () => resolve({ ok: false });
      if (stop.aborted) onAbort();
      else stop.addEventListener('abort', onAbort, { once: true });
    });
    // The port's error may quote page text: it is neither rethrown nor logged, only counted as a failure.
    const settled = (async () => this.#retrieval.retrieve({ query, signal: stop }))()
      .then(value => ({ ok: true, documents: value?.documents }), () => ({ ok: false }));
    try { return await Promise.race([settled, abandoned]); }
    finally { this.#clearTimer(timer); stop.removeEventListener('abort', onAbort); }
  }

  async dispatch(call, tools, signal, audit) {
    signal.throwIfAborted();
    const name = call?.function?.name;
    let value, status = 'failed';
    try {
      if (!allowedToolCall(call)) throw Object.assign(Error('Appel d’outil invalide.'), { code: TVLENS_OLLAMA_TOOL_REFUSED });
      value = await tools.call(name, call.function.arguments, { signal });
      status = 'completed';
    } catch (error) {
      // Les erreurs d'un port peuvent exposer des chemins ou la sortie d'un fournisseur ; elles restent internes.
      value = { error: { code: TVLENS_OLLAMA_TOOL_REFUSED,
        message: 'Outil refusé : nom, arguments ou intervalle invalides, média indisponible ou limite atteinte.' } };
      if (error?.code === TVLENS_QUESTION_IMAGES_ABSENT)
        value = { error: { code: TVLENS_QUESTION_IMAGES_ABSENT, message: IMAGES_ABSENT_MESSAGE } };
    }
    signal.throwIfAborted();
    audit.push({ tool: allowedToolCall(call) ? name : 'unknown', status });
    return { role: 'tool', tool_name: typeof name === 'string' ? name : 'unknown', content: JSON.stringify(value) };
  }
}

module.exports = { OllamaQuestionAgent, TVLENS_OLLAMA_TOOL_REFUSED, TVLENS_OLLAMA_TOOL_BUDGET,
  TVLENS_OLLAMA_QUESTION_CLOSED, TVLENS_OLLAMA_QUESTION_TIMEOUT, TVLENS_OLLAMA_WEB_TRIGGER_INVALID,
  WEB_TRIGGERS, DEFAULT_WEB_TRIGGER, WEB_RETRIEVAL_TIMEOUT_MS, WEB_DECISION_TIMEOUT_MS, WEB_DECISION_MAX_TOKENS,
  WEB_RETRIEVAL_FAILED_LIMIT };
