// Sonde : le vrai OllamaQuestionAgent appelle-t-il des outils quand chaque requête impose aussi le schéma JSON (`format`) ?
// Condition A : agent tel que livré (outils + format à chaque tour).
// Condition B : format retiré tant que des outils sont proposés ; si le modèle répond sans outil, un dernier tour sans
// outils et avec format produit la réponse JSON (la correction suggérée par le relecteur de T263).
// Usage : node tools-format-probe.cjs [modèle] [sortie.json]
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { OllamaQuestionAgent } = require('/Users/Dabi/Documents/ISN/tvlens/adapters/ollama/question-agent.cjs');

const MODEL = process.argv[2] || 'qwen3.8:27b';
const OUT = process.argv[3] || `${__dirname}/tools-format-results.json`;
const URL = 'http://127.0.0.1:11434';
const NUM_CTX = 8192;

const passages = [
  { id: 'moment-1', startMs: 0, endMs: 8000, summary: 'La présentatrice ouvre le journal et annonce les titres.' },
  { id: 'moment-2', startMs: 8000, endMs: 16000, summary: 'Elle introduit un sujet sur l’emploi et annonce un chiffre du chômage.' },
  { id: 'moment-3', startMs: 16000, endMs: 24000, summary: 'Un économiste invité commente ce chiffre en plateau.' },
  { id: 'moment-4', startMs: 24000, endMs: 32000, summary: 'L’invité parle de l’inflation ; un graphique apparaît derrière lui.' },
  { id: 'moment-5', startMs: 32000, endMs: 40000, summary: 'Annonce d’une pause publicitaire.' },
];
const speech = {
  'moment-2': 'Le taux de chômage s’établit à 7,4 % au deuxième trimestre, en hausse de 0,3 point sur un an.',
  'moment-3': 'C’est la première hausse depuis deux ans, mais il faut rester prudent sur la tendance.',
  'moment-4': 'L’inflation a ralenti à 1,9 % en septembre, c’est ce que montre la courbe derrière moi.',
  'moment-5': 'On se retrouve juste après la pause, restez avec nous.',
};
const overlapping = (startMs, endMs) => passages.filter(p => p.endMs > startMs && p.startMs < endMs);

function fakeTools(calls) {
  return {
    anchorMs: 40000,
    async call(name, args) {
      calls.push({ name, args });
      if (name === 'search_moments') {
        const q = String(args.query || '').toLowerCase();
        const hits = passages.filter(p => q.split(/\s+/).some(w => w.length > 3 && (p.summary + (speech[p.id] || '')).toLowerCase().includes(w)));
        return { moments: (hits.length ? hits : passages.slice(0, 2)).map(p => ({ id: p.id, startMs: p.startMs, endMs: p.endMs, summary: p.summary })) };
      }
      if (name === 'get_transcript') {
        return { segments: overlapping(args.startMs, args.endMs).map(p => ({ id: p.id, startMs: p.startMs, endMs: p.endMs,
          speech: speech[p.id] || '', summary: p.summary })) };
      }
      if (name === 'inspect_clip') {
        return { intervals: overlapping(args.startMs, args.endMs).map(p => ({ id: p.id, startMs: p.startMs, endMs: p.endMs,
          observation: p.id === 'moment-4' ? 'Graphique en courbe descendante intitulé « Inflation sur un an », dernier point 1,9 %.'
            : 'Plateau de journal, deux personnes assises.', speech: speech[p.id] || '' })) };
      }
      throw Error('outil inconnu');
    },
  };
}

const questions = [
  'Quel chiffre exact du chômage la présentatrice a-t-elle donné ?',
  'Qu’est-ce qu’on voit derrière l’invité quand il parle de l’inflation ?',
  'Que dit-on mot pour mot juste avant la pause ?',
];

function recordingFetch(condition, requests) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    const send = async (b) => {
      const started = Date.now();
      const res = await fetch(url, { ...init, body: JSON.stringify(b) });
      const text = await res.text();
      let data = null; try { data = JSON.parse(text); } catch {}
      requests.push({ tools: (b.tools || []).length, format: Boolean(b.format), http: res.status, ms: Date.now() - started,
        toolCalls: data?.message?.tool_calls?.map(c => c.function?.name) || [], thinkingChars: (data?.message?.thinking || '').length,
        contentChars: (data?.message?.content || '').length, promptTokens: data?.prompt_eval_count, evalTokens: data?.eval_count,
        loadMs: data?.load_duration ? Math.round(data.load_duration / 1e6) : null, error: res.ok ? null : text.slice(0, 200) });
      return { res, text, data };
    };
    if (condition === 'B' && body.tools?.length) {
      const first = await send({ ...body, format: undefined });
      if (first.res.ok && !first.data?.message?.tool_calls?.length) {
        const last = await send({ ...body, tools: [], format: body.format });
        return new Response(last.text, { status: last.res.status, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(first.text, { status: first.res.status, headers: { 'Content-Type': 'application/json' } });
    }
    const one = await send(body);
    return new Response(one.text, { status: one.res.status, headers: { 'Content-Type': 'application/json' } });
  };
}

const memory = () => {
  const swap = execFileSync('sysctl', ['-n', 'vm.swapusage'], { encoding: 'utf8' }).trim();
  const free = execFileSync('memory_pressure', { encoding: 'utf8' }).trim().split('\n').pop();
  return { swap, free };
};

(async () => {
  const runs = [];
  const before = memory();
  for (const question of questions) {
    for (const condition of ['A', 'B']) {
      const calls = [], requests = [];
      const agent = new OllamaQuestionAgent({ url: URL, model: MODEL, numCtx: NUM_CTX, keepAlive: '2m',
        fetchImpl: recordingFetch(condition, requests) });
      const started = Date.now();
      let result = null, error = null;
      try {
        result = await agent.answer({ question, tools: fakeTools(calls),
          context: { startMs: 0, throughMs: 40000, passages }, conversation: [] });
      } catch (e) { error = { code: e.code || null, message: String(e.message).slice(0, 200) }; }
      const run = { condition, question, ms: Date.now() - started, toolCalls: calls.map(c => c.name), requests,
        kind: result?.kind ?? null, answer: result?.answer?.slice(0, 400) ?? null,
        citations: result?.citations?.map(c => c.id) ?? null, error };
      runs.push(run);
      console.log(`${condition} | ${question.slice(0, 40)}… | outils [${run.toolCalls.join(', ')}] | ${run.requests.length} requêtes | ` +
        `${Math.round(run.ms / 1000)} s | ${error ? 'ERREUR ' + error.code : run.kind}`);
      fs.writeFileSync(OUT, JSON.stringify({ model: MODEL, numCtx: NUM_CTX, before, runs }, null, 2));
    }
  }
  const after = memory();
  await fetch(`${URL}/api/generate`, { method: 'POST', body: JSON.stringify({ model: MODEL, keep_alive: 0 }) }).catch(() => {});
  fs.writeFileSync(OUT, JSON.stringify({ model: MODEL, numCtx: NUM_CTX, before, after, runs }, null, 2));
  console.log('résultats', OUT, '| mémoire avant', before.free, '| après', after.free);
})();
