const { OllamaHttpClient } = require('./http-client.cjs');
const { countThinking } = require('./thinking.cjs');
const { VIDEO_TOOL_CALL_LIMIT } = require('../../core/video-tool-contracts.cjs');
const { toolDefinitions, allowedToolCall } = require('./video-tools.cjs');
const { schema, buildLocalPrompt } = require('../companion-prompt.cjs');
const { DECISION_FORMAT, decisionMessages, readDecision } = require('../web-decision-prompt.cjs');
const { readMessage, readAnswer } = require('./question-response.cjs');
const { TVLENS_QUESTION_IMAGES_ABSENT, IMAGES_ABSENT_MESSAGE } = require('../../core/video-tools.cjs');
const { QUESTION_TIMEOUT_MS } = require('../../core/deep-ask.cjs');
const { WEB_DOCUMENT_LIMIT, callsForWeb, retrievalQuery, searchTerms, pageExcerpt, cleanSourceTitle }
  = require('../../core/web-retrieval.cjs');
const { sourceKey } = require('../external-links.cjs');
const TVLENS_OLLAMA_TOOL_REFUSED = 'TVLENS_OLLAMA_TOOL_REFUSED';
const TVLENS_OLLAMA_TOOL_BUDGET = 'TVLENS_OLLAMA_TOOL_BUDGET';
const TVLENS_OLLAMA_QUESTION_CLOSED = 'TVLENS_OLLAMA_QUESTION_CLOSED';
const TVLENS_OLLAMA_QUESTION_TIMEOUT = 'TVLENS_OLLAMA_QUESTION_TIMEOUT';
const TVLENS_OLLAMA_WEB_TRIGGER_INVALID = 'TVLENS_OLLAMA_WEB_TRIGGER_INVALID';
const WEB_TRIGGERS = ['auto', 'always', 'model'];
const DEFAULT_WEB_TRIGGER = 'auto';
// The search and every page together. 59 real searches took 1.7 s at the median, 3.7 s at the 90th percentile and 5.3 s at
// most; 3.5 s would cut about one in eight. Past it the question goes on without pages.
const WEB_RETRIEVAL_TIMEOUT_MS = 5_000;
// The model's decision took 0.65 s at the median and 0.96 s at most over 408 calls: 540 ms of margin over that maximum.
// Past it the rule decides instead.
const WEB_DECISION_TIMEOUT_MS = 1_500;
// One deadline for a whole local question that searches the web, from its entry in the agent. The owner raised it from
// 14 s to 30 s on 23/10 after a live-stream measure on the GX10: 5 of 30 web or mixed questions took more than 14 s of their own
// time (16.6 s at most), and 14 s would have lost 2 relevant answers. At worst the decision and the retrieval above leave
// 23.5 s to answer.
const WEB_QUESTION_TIMEOUT_MS = 30_000;
// A boolean and a query of a few keywords: the decision never needs a long generation.
const WEB_DECISION_MAX_TOKENS = 80;
const WEB_RETRIEVAL_FAILED_LIMIT = 'La recherche web locale n’a pas abouti.';
const RESIDENCES = ['local', 'hybrid'];

const questionTimeout = () => Object.assign(Error('Délai maximal de la question locale atteint.'), {
  code: TVLENS_OLLAMA_QUESTION_TIMEOUT,
});

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
  #getSourceTitle;
  constructor({ now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, retrieval, webTrigger = DEFAULT_WEB_TRIGGER,
    getSourceTitle, ...options } = {}) {
    if (!WEB_TRIGGERS.includes(webTrigger)) throw Object.assign(Error('Déclencheur web local invalide (auto, always ou model).'), {
      code: TVLENS_OLLAMA_WEB_TRIGGER_INVALID,
    });
    this.#retrieval = retrieval;
    this.#webTrigger = webTrigger;
    this.#getSourceTitle = getSourceTitle;
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
    // this.tail is the work itself, never the caller's wait: the next question starts only once this one has really ended.
    const queued = (runSignal, markSearching) => {
      const pending = this.tail.catch(() => {}).then(() => this.run({ ...input, signal: runSignal, markSearching,
        reportRequest: () => { requests++; report(); } }));
      this.tail = pending;
      return pending;
    };
    if (!this.#webEligible(input)) return queued(signal);
    return this.#withinWebDeadline(queued, signal, this.#searchesAtEntry(input.question));
  }

  // Only a question that really searches the web owes the web deadline, which bounds what the web adds: a video-only
  // one keeps the general ceiling, as without a port. With the model trigger this is known only once decided.
  #searchesAtEntry(question) {
    if (this.#webTrigger === 'model') return undefined;
    return this.#webTrigger === 'always' || callsForWeb(question);
  }

  // A question that may read the web is abandoned at once when cancelled or closed, even if a step ignores its signal.
  // Searching, it also has one deadline from its entry here, internal queue included, never reset between its steps;
  // a searching question expired in the queue never starts. The deadline cannot preempt synchronous work such as a page
  // extraction.
  async #withinWebDeadline(queued, signal, searching) {
    const deadline = this.#webDeadline(searching);
    try {
      const outcome = await this.#abandonable(stop => queued(stop, deadline.search), AbortSignal.any([signal, deadline.signal]));
      if ('value' in outcome) return outcome.value;
      throw 'error' in outcome ? outcome.error : outcome.abandoned;
    } finally { deadline.clear(); }
  }

  // The deadline counts from the entry whether or not the question is classified yet; it stops it only once it
  // searches. A question still unclassified at its deadline is stopped when it turns to search, before the port or the
  // answer is called.
  #webDeadline(searching) {
    const controller = new AbortController();
    let expired = false;
    const stopIfSearching = () => { if (expired && searching) controller.abort(questionTimeout()); };
    const timer = searching === false ? undefined : this.#setTimer(() => { expired = true; stopIfSearching(); }, WEB_QUESTION_TIMEOUT_MS);
    return {
      signal: controller.signal,
      search: () => { searching = true; stopIfSearching(); },
      clear: () => { if (timer !== undefined) this.#clearTimer(timer); },
    };
  }

  async run(input) {
    input.signal.throwIfAborted();
    const deadline = new AbortController();
    const timer = this.#setTimer(() => deadline.abort(questionTimeout()), QUESTION_TIMEOUT_MS);
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
    if (this.#searchesAtEntry(input.question)) return this.#retrieve(input, retrievalQuery(input.question));
    return { pages: [] };
  }

  // The model's query serves the retrieval only: the answer keeps the viewer's question. Without a usable decision the
  // rule decides, on the raw question. The result says whether the decision had a source title, never which one.
  async #decideAndRetrieve(input, usage) {
    const sourceTitle = this.#sourceTitle(input);
    const started = this.#now();
    const decision = await this.#decide(input, usage, sourceTitle);
    const decided = { decisionMs: this.#now() - started, ...(sourceTitle && { sourceTitleGiven: true }) };
    if (decision?.web === false) return { pages: [], retrieval: { decision: 'no-web', ...decided } };
    const modelQuery = decision ? retrievalQuery(decision.query) : '';
    if (modelQuery) return this.#retrieve(input, modelQuery, { decision: 'web', query: modelQuery, ...decided });
    if (!callsForWeb(input.question)) return { pages: [], retrieval: { decision: 'failed', ...decided } };
    const query = retrievalQuery(input.question);
    return this.#retrieve(input, query, { decision: 'failed', query, ...decided });
  }

  // Asked of the host at each decision for the question's own session: a question decided once the host has moved on
  // gets no title of another session.
  #sourceTitle(input) {
    const sessionId = input.context?.sessionId;
    if (typeof this.#getSourceTitle !== 'function' || typeof sessionId !== 'string') return null;
    try {
      return cleanSourceTitle(this.#getSourceTitle(sessionId));
    } catch {
      // A failing host only costs the title: the decision goes on as without one, and the host's error is not published.
      return null;
    }
  }

  // A short call without tools under its own delay. Its error or delay only costs the decision; a cancelled question stops.
  // A late reply, once the wait is over, counts nothing.
  async #decide(input, usage, sourceTitle) {
    const outcome = await this.#abandonable(signal => this.#client.chat({ format: DECISION_FORMAT, think: false, signal,
      messages: decisionMessages({ question: input.question, passages: input.context?.passages, sourceTitle }),
      options: { num_predict: WEB_DECISION_MAX_TOKENS } }), input.signal, WEB_DECISION_TIMEOUT_MS);
    input.signal.throwIfAborted();
    // The provider's error is not published: anything but a reply is no decision.
    if (!('value' in outcome)) return null;
    try {
      countThinking(outcome.value, usage);
      reportUsage(input, usage);
      return readDecision(readMessage(outcome.value).content);
    } catch {
      // A malformed reply is no decision either; its content is not published.
      return null;
    }
  }

  // Pages are read before the answer. A failed or slow retrieval only costs the pages; a cancelled question stops here.
  // The passage kept from each page matches the viewer's question and the query sent to the port.
  async #retrieve(input, query, decided = {}) {
    // The question searches from here: past its web deadline it stops before the port is called.
    input.markSearching?.();
    input.signal.throwIfAborted();
    const started = this.#now();
    // The port's error may quote page text: it is neither rethrown nor logged, only counted as a failure.
    const settled = await this.#abandonable(signal => this.#retrieval.retrieve({ query, signal }), input.signal, WEB_RETRIEVAL_TIMEOUT_MS);
    input.signal.throwIfAborted();
    const outcome = { ok: 'value' in settled, documents: settled.value?.documents };
    const pages = outcome.ok ? boundedPages(outcome.documents, searchTerms(input.question, query)) : [];
    const residence = RESIDENCES.includes(this.#retrieval.residence) ? this.#retrieval.residence : 'unknown';
    return { pages, retrieval: { residence, status: retrievalStatus(outcome, pages), documents: pages.length,
      elapsedMs: this.#now() - started, ...decided } };
  }

  // Runs work with a signal that aborts on stop or past delayMs, if given, and stops waiting at that abort even when the
  // work ignores its signal: its late value or error is absorbed and changes nothing. Gives { value }, { error } or
  // { abandoned } with the abort reason; the timer and the listener go in every case. Without delayMs no timer is armed:
  // an infinite delay is not an option, since setTimeout brings any delay past 2^31 - 1 ms down to 1 ms.
  async #abandonable(work, stop, delayMs, expiry) {
    const expired = new AbortController();
    const timer = delayMs === undefined ? undefined : this.#setTimer(() => expired.abort(expiry?.()), delayMs);
    const signal = AbortSignal.any([stop, expired.signal]);
    let onAbort;
    const abandoned = new Promise(resolve => {
      onAbort = () => resolve({ abandoned: signal.reason });
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    });
    const settled = (async () => work(signal))().then(value => ({ value }), error => ({ error }));
    try { return await Promise.race([settled, abandoned]); }
    finally {
      if (timer !== undefined) this.#clearTimer(timer);
      signal.removeEventListener('abort', onAbort);
    }
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
  WEB_TRIGGERS, DEFAULT_WEB_TRIGGER, WEB_RETRIEVAL_TIMEOUT_MS, WEB_DECISION_TIMEOUT_MS, WEB_QUESTION_TIMEOUT_MS, WEB_DECISION_MAX_TOKENS,
  WEB_RETRIEVAL_FAILED_LIMIT };
