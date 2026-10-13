const { CodexSessionClient, sourceKey } = require('./codex-session-client.cjs');
const { detectionSchema, verificationSchema, detectionPersona, verificationPersona, buildDetectionPrompt, buildVerificationPrompt } = require('./surveillance-prompt.cjs');

// Actions of a web-search item that read a page (App Server spelling, then `codex exec` spelling). A search
// only lists results: nothing it names was opened.
const PAGE_ACTIONS = ['openPage', 'open_page', 'findInPage', 'find_in_page'];
// The pages ONE turn opened, from that turn's own audit, normalised like a cited source. The client also keeps
// a set of opened pages, but that set lives as long as the thread: after a turn the core abandoned on its
// deadline it still holds that turn's pages, and the next lot would be credited with pages it never opened.
// One open action may render several pages: an entry then lists them all in `urls`; `url` alone is the older form.
function openedBy(result) {
  const pages = new Set();
  for (const entry of Array.isArray(result.audit) ? result.audit : []) {
    // The client marks the entries of pages it saw opened (`opened`), under whatever name the App Server gave
    // the action; an entry of an older client is judged on the name of its action. A search is never a page.
    if (entry?.tool !== 'web_search' || entry.action === 'search' || !(entry.opened === true || PAGE_ACTIONS.includes(entry.action))) continue;
    for (const url of Array.isArray(entry.urls) ? entry.urls : [entry.url]) {
      const page = typeof url === 'string' ? sourceKey(url) : null;
      if (page) pages.add(page);
    }
  }
  return [...pages];
}
// Web calls of one turn. A client may write one audit entry per page of a grouped open: those are not more searches.
const searchesOf = result => (Array.isArray(result.audit) ? result.audit : []).filter(entry => entry?.tool === 'web_search' && !entry.grouped).length;

// Surveillance role on Codex. It never shares a client with the chat: one client reads the passages
// (no web, no tool), `workers` clients check claims (web search only, no tool). Neither gets a video
// tool, so the model can only see the text the core decided to send: causality is held by the data.
class CodexSurveillanceAgent {
  constructor({ binary = 'codex', authHome, model = '', quota, reasoningEffort = 'low', workers = 1, clientFactory = options => new CodexSessionClient(options), ...rest } = {}) {
    if (!Number.isInteger(workers) || workers < 1 || workers > 3) throw new Error('Réglage surveillance.workers invalide : 1 à 3 attendu.');
    // `role` lets the client label its traces once it supports the option; unknown options are ignored.
    const shared = { ...rest, binary, authHome, model, quota, reasoningEffort, toolDefinitions: [], role: 'surveillance' };
    this.detector = clientFactory({ ...shared, webSearch: false, baseInstructions: detectionPersona });
    this.researchers = Array.from({ length: workers }, () => ({ busy: 0, client: clientFactory({ ...shared, webSearch: true, baseInstructions: verificationPersona }) }));
  }

  // Warm-up only: a connection that fails here is retried, and reported, by the first real call.
  async prepare(sessionId) {
    await Promise.allSettled([this.detector.prepare(`${sessionId}-surveillance`), this.researchers[0].client.prepare(`${sessionId}-surveillance-verify-1`)]);
  }

  // One turn, then a fresh thread. The rotation is queued on the client right behind the turn, before this call
  // even waits for it: the core does not wait for a call it abandons (deadline) and may start the next one
  // while that turn is still being interrupted. A rotation requested only once the turn has ended would then
  // queue up behind the next turn, which would run on the abandoned thread, with its context and its pages.
  turn(client, input) {
    const answer = client.answer(input);
    client.rotateThread();
    return answer;
  }

  async detect({ sessionId, instruction, passages, context = [], known = [], maxClaims, signal }) {
    const started = Date.now();
    // Every reading starts from an empty model context: a passage read late can never borrow from a later one.
    const result = await this.turn(this.detector, { sessionId: `${sessionId}-surveillance`, instructions: buildDetectionPrompt({ instruction, passages, context, known, maxClaims }), signal, outputSchema: detectionSchema });
    if (!Array.isArray(result.claims)) throw new Error('Réponse de détection invalide.');
    return { claims: result.claims, elapsedMs: Date.now() - started };
  }

  async verify({ sessionId, instruction, claims, signal, onProgress }) {
    // One lot per worker; the core never runs more lots at once than there are workers.
    const worker = this.researchers.reduce((best, candidate) => (candidate.busy < best.busy ? candidate : best));
    const started = Date.now();
    worker.busy++;
    try {
      // A fresh thread per lot, success or not: no page and no context inherited from another lot.
      const result = await this.turn(worker.client, { sessionId: `${sessionId}-surveillance-verify-${this.researchers.indexOf(worker) + 1}`,
        instructions: buildVerificationPrompt({ instruction, claims }), signal, onProgress, outputSchema: verificationSchema });
      if (!Array.isArray(result.verdicts)) throw new Error('Réponse de vérification invalide.');
      return { summary: typeof result.summary === 'string' ? result.summary : '', verdicts: result.verdicts,
        research: { webSearches: searchesOf(result), openedUrls: openedBy(result), elapsedMs: Date.now() - started } };
    } finally {
      worker.busy--;
    }
  }

  async close() {
    await Promise.allSettled([this.detector.close(), ...this.researchers.map(worker => worker.client.close())]);
  }
}
module.exports = { CodexSurveillanceAgent };
