const { OllamaHttpClient } = require('./http-client.cjs');
const { countThinking } = require('./thinking.cjs');
const { VIDEO_TOOL_CALL_LIMIT } = require('../../core/video-tool-contracts.cjs');
const { toolDefinitions, allowedToolCall } = require('./video-tools.cjs');
const { schema, buildLocalPrompt } = require('../companion-prompt.cjs');
const { readMessage, readAnswer } = require('./question-response.cjs');
const { QUESTION_TIMEOUT_MS } = require('../../core/deep-ask.cjs');
const TVLENS_OLLAMA_TOOL_REFUSED = 'TVLENS_OLLAMA_TOOL_REFUSED';
const TVLENS_OLLAMA_TOOL_BUDGET = 'TVLENS_OLLAMA_TOOL_BUDGET';
const TVLENS_OLLAMA_QUESTION_CLOSED = 'TVLENS_OLLAMA_QUESTION_CLOSED';
const TVLENS_OLLAMA_QUESTION_TIMEOUT = 'TVLENS_OLLAMA_QUESTION_TIMEOUT';

function reportUsage(input, usage) {
  try { input.onProviderMetrics?.({ ...usage }); } catch {
    // Le diagnostic numérique ne doit pas interrompre une réponse locale.
  }
}

class OllamaQuestionAgent {
  #client;
  #generation = new AbortController();
  #now;
  #setTimer;
  #clearTimer;
  #onRequest;
  #transport;
  constructor({ now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, ...options } = {}) {
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
    const messages = [{ role: 'user', content: buildLocalPrompt(input) }];
    const audit = [];
    const usage = {};
    let attempts = 0;
    while (true) {
      const availableTools = attempts < VIDEO_TOOL_CALL_LIMIT ? toolDefinitions : [];
      const data = await this.#client.chat({ messages, tools: availableTools, format: schema, signal });
      signal.throwIfAborted();
      countThinking(data, usage);
      reportUsage(input, usage);
      const message = readMessage(data);
      if (!message.tool_calls?.length) {
        const result = readAnswer(message.content);
        return { ...result, ...usage, audit, model: this.#client.backend.model,
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

  async dispatch(call, tools, signal, audit) {
    signal.throwIfAborted();
    const name = call?.function?.name;
    let value, status = 'failed';
    try {
      if (!allowedToolCall(call)) throw Object.assign(Error('Appel d’outil invalide.'), { code: TVLENS_OLLAMA_TOOL_REFUSED });
      value = await tools.call(name, call.function.arguments, { signal });
      status = 'completed';
    } catch {
      // Les erreurs d'un port peuvent exposer des chemins ou la sortie d'un fournisseur ; elles restent internes.
      value = { error: { code: TVLENS_OLLAMA_TOOL_REFUSED,
        message: 'Outil refusé : nom, arguments ou intervalle invalides, média indisponible ou limite atteinte.' } };
    }
    signal.throwIfAborted();
    audit.push({ tool: allowedToolCall(call) ? name : 'unknown', status });
    return { role: 'tool', tool_name: typeof name === 'string' ? name : 'unknown', content: JSON.stringify(value) };
  }
}

module.exports = { OllamaQuestionAgent, TVLENS_OLLAMA_TOOL_REFUSED, TVLENS_OLLAMA_TOOL_BUDGET,
  TVLENS_OLLAMA_QUESTION_CLOSED, TVLENS_OLLAMA_QUESTION_TIMEOUT };
