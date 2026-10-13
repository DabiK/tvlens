// Bounded REAL-provider trial of a manual question overlapping an active surveillance, on the real host
// composition (HeadlessRuntime: session, chat queue, surveillance runtime). Not part of the test suite.
//
// What is real: the chat agent and the surveillance agents (detection, web verification) are the installed
// Codex CLI with the account already signed in. What is NOT real: perception. The passages are four short
// written texts on public facts, handed as transcripts — no capture, no Whisper, no vision. The run measures
// this machine on this day: one overlap, not a concurrency benchmark.
//
//   node scripts/probe-overlap-live.cjs [--out <file.json>] [--simulated] [--chat-only] [--question <text>] [--deadline-ms 240000] [--keep]
//
// --simulated replaces every provider by the offline doubles (harness check, no network, no quota).
// --chat-only asks the same question on the same passages with no surveillance: the point of comparison.
// Environment: TVLENS_TEST_CODEX_MODEL, TVLENS_CODEX_BINARY (default "codex"), CODEX_HOME (existing sign-in).
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');

const flag = name => process.argv.includes(`--${name}`);
const option = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const simulated = flag('simulated'), keep = flag('keep'), chatOnly = flag('chat-only'), out = option('out', null);
const deadlineMs = Math.min(480000, Math.max(30000, Number(option('deadline-ms', 240000)) || 240000));
const INSTRUCTION = 'Vérifie les chiffres annoncés.';
// --question replaces the default one, e.g. to ask explicitly for a web check under the same active instruction.
const QUESTION = option('question', 'En deux phrases : de quoi vient-on de parler, et quelle hauteur a été donnée pour la tour Eiffel ?');

// Written for the trial, not transcribed from any programme. `expect` is what a careful reader would do.
const PASSAGES = [
  { expect: 'claim (exact)', transcript: 'D’après le guide, la tour Eiffel mesure 330 mètres de haut, antenne comprise.' },
  { expect: 'decoy', transcript: 'Le présentateur rappelle que l’émission reprend juste après la publicité.' },
  { expect: 'claim (exact)', transcript: 'Selon l’invité, la Lune se trouve en moyenne à environ 384 000 kilomètres de la Terre.' },
  { expect: 'claim (wrong)', transcript: 'Il affirme ensuite que le mont Blanc culmine à 5 200 mètres d’altitude.' },
].map((passage, i) => ({ ...passage, id: `moment-${i + 1}`, startMs: i * 8000, endMs: (i + 1) * 8000 }));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hosts = sources => (sources || []).map(source => { try { return new URL(source.url).hostname; } catch { return '?'; } });

(async () => {
  const started = Date.now(), elapsed = () => Date.now() - started;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-probe-overlap-'));
  let clock = 0;
  // Perception is replaced: each passage publishes its written text as speech, then a neutral description.
  const perception = {
    transcribe: async passage => ({ observation: { transcript: PASSAGES.find(p => p.id === passage.id)?.transcript || '' }, elapsedMs: 1 }),
    observeVisual: async () => ({ observation: { topic: 'Plateau', topicContinuity: 'continue', summary: 'Deux personnes discutent en plateau.', visual: 'Plateau de télévision.' }, elapsedMs: 1 }),
  };
  const fakeChat = { answer: async ({ tools }) => { await sleep(1500); const context = tools.context?.({}) || { passages: [] }; const last = context.passages.at(-1);
    return { answer: 'Simulation : on vient de parler de la tour Eiffel, donnée à 330 mètres.', kind: last ? 'observation' : 'insufficient', citations: last ? [{ id: last.id, startMs: last.startMs, endMs: last.endMs }] : [], sources: [], limits: [] }; } };
  const runtime = new HeadlessRuntime({
    userData: root, sessionsRoot: path.join(root, 'sessions'), config: {}, smoke: simulated,
    selectedModels: { observationModel: 'gpt-6-luna', inspectionModel: 'gpt-6-luna', codexModel: process.env.TVLENS_TEST_CODEX_MODEL || '' },
    codexBinary: process.env.TVLENS_CODEX_BINARY || 'codex', readClock: () => clock, overrides: { perception },
    ...(simulated ? { agent: fakeChat } : {}),
  });
  const jpeg = (await require('sharp')({ create: { width: 64, height: 36, channels: 3, background: '#335577' } }).jpeg().toBuffer()).toString('base64');
  const timeline = [], sample = label => {
    const s = runtime.surveillance.snapshot({ brief: true }), job = runtime.deep.jobs.at(-1);
    timeline.push({ atMs: elapsed(), label, chat: job ? job.status : null, surveillance: s.activity.state, running: s.activity.running, counts: s.counts, cards: s.overlay.cards.length });
  };
  const report = { mode: chatOnly ? 'question seule, sans surveillance (point de comparaison)' : 'question pendant une surveillance active', kind: simulated ? 'répétition hors ligne (doubles simulés, aucun fournisseur)' : 'essai fournisseur réel (Codex déjà authentifié, web) — perception simulée par textes écrits',
    startedAt: new Date(started).toISOString(), instruction: INSTRUCTION, question: QUESTION, deadlineMs, passages: PASSAGES.map(({ id, expect, transcript }) => ({ id, expect, transcript })) };
  let failure = null;
  try {
    const { id } = await runtime.start();
    report.sessionId = id;
    // Surveillance first: it only reads what is observed after its activation.
    if (!chatOnly) runtime.startSurveillance({ sessionId: id, instruction: INSTRUCTION });
    sample(chatOnly ? 'sans surveillance' : 'surveillance activée');
    const ingest = async passage => {
      clock = passage.endMs;
      await runtime.ingest({ sessionId: id, startMs: passage.startMs, endMs: passage.endMs, clip: Buffer.from('fixture'), frames: [{ atMs: passage.startMs, dataUrl: 'data:image/jpeg;base64,' + jpeg }], audio: null });
      for (const until = Date.now() + 15000; Date.now() < until;) { if (runtime.session.watch.snapshot().segments.find(s => s.id === passage.id)?.observation?.transcript) break; await sleep(20); }
      sample(`passage ${passage.id} publié`);
    };
    await ingest(PASSAGES[0]); await ingest(PASSAGES[1]);
    // Let the surveillance start working on the first figure before the question arrives.
    for (const until = Date.now() + (chatOnly ? 0 : 20000); Date.now() < until;) { const s = runtime.surveillance.snapshot({ brief: true }); if (['detecting', 'verifying'].includes(s.activity.state) || s.totals.claims) break; await sleep(50); }
    sample('avant la question');
    const askedAtMs = elapsed(), surveillanceAtAsk = runtime.surveillance.snapshot({ brief: true }).activity.state;
    const { id: jobId } = runtime.ask({ question: QUESTION, sessionId: id, anchorMs: clock });
    const job = () => runtime.deep.jobs.find(item => item.id === jobId);
    sample('question posée');
    // The programme goes on while the question is answered and the checks run.
    await ingest(PASSAGES[2]); await ingest(PASSAGES[3]);
    const terminal = status => ['done', 'error', 'timeout', 'cancelled'].includes(status);
    let overlapSeen = false, chatDoneAtMs = null, surveillanceDoneAtMs = chatOnly ? 0 : null;
    while (elapsed() < deadlineMs) {
      const s = runtime.surveillance.snapshot({ brief: true }), status = job().status;
      if (!terminal(status) && (s.activity.detecting || s.activity.running > 0)) overlapSeen = true;
      if (terminal(status) && chatDoneAtMs === null) { chatDoneAtMs = elapsed(); sample('question terminée'); }
      const settled = s.counts.queued + s.counts.running + (s.counts.detected || 0) === 0 && !s.activity.detecting && s.backlog.passagesPending === 0 && s.coverage.pending === 0 && s.coverage.scanning === 0 && s.coverage.waiting === 0;
      if (settled && surveillanceDoneAtMs === null && s.coverage.total >= PASSAGES.length) { surveillanceDoneAtMs = elapsed(); sample('surveillance au repos'); }
      if (chatDoneAtMs !== null && surveillanceDoneAtMs !== null) break;
      await sleep(250);
    }
    await sleep(200);
    const done = job(), full = runtime.surveillance.snapshot({ full: true });
    report.overlap = { askedAtMs, surveillanceStateWhenAsked: surveillanceAtAsk, surveillanceWorkedWhileQuestionRan: overlapSeen, chatDoneAtMs, surveillanceDoneAtMs, deadlineHit: chatDoneAtMs === null || surveillanceDoneAtMs === null };
    report.chat = { status: done.status, kind: done.result?.kind || null, answer: done.result?.answer || null, message: done.message,
      citations: (done.result?.citations || []).length, sources: hosts(done.result?.sources), limits: done.result?.limits || [],
      timeoutMs: done.timeoutMs, availability: done.availability || null, metrics: done.metrics ? { waitMs: done.metrics.waitMs, contextMs: done.metrics.contextMs, firstProgressMs: done.metrics.firstProgressMs, firstAgentMs: done.metrics.firstAgentMs, firstTextMs: done.metrics.firstTextMs, firstUsefulMs: done.metrics.firstUsefulMs, totalMs: done.metrics.totalMs, tools: done.metrics.tools } : null };
    report.surveillance = { activity: full.activity, registry: full.registry, counts: full.counts, totals: full.totals, coverage: full.coverage, backlog: full.backlog,
      claims: (full.claims || []).map(c => ({ id: c.id, action: c.action, status: c.status, statement: c.statement, origin: c.origin && { passageId: c.origin.passageId, quote: c.origin.quote }, assessment: c.assessment || null, conclusion: c.conclusion || null, reason: c.reason || null, sources: hosts(c.sources) })),
      cards: (full.overlay?.cards || []).map(card => ({ id: card.id, kind: card.kind, text: card.text, sources: hosts(card.sources), interval: card.interval })),
      lots: (full.lots || []).map(lot => ({ id: lot.id, kind: lot.kind, status: lot.status, claimIds: lot.claimIds, sourcedClaimIds: lot.sourcedClaimIds, undeterminedClaimIds: lot.undeterminedClaimIds, overlay: lot.overlay, message: lot.message || null, error: lot.error || null, metrics: lot.metrics })),
      signals: (full.signals?.cards || []).length, metrics: full.metrics };
    report.confinement = { chat: runtime.agent?.client?.confinement || null };
    report.timeline = timeline;
  } catch (error) { failure = error; report.failure = String(error?.message || error).slice(0, 600); }
  finally {
    report.elapsedMs = elapsed();
    await runtime.close().catch(error => { report.closeError = String(error?.message || error).slice(0, 300); });
    if (!keep) await fs.rm(root, { recursive: true, force: true });
    else report.kept = root;
  }
  const text = JSON.stringify(report, null, 1);
  if (out) await fs.writeFile(out, text); else console.log(text);
  const ok = !failure && report.chat?.status === 'done' && !report.overlap?.deadlineHit;
  console.error(`${report.kind} : ${ok ? 'terminé' : 'INCOMPLET'} en ${report.elapsedMs} ms` + (out ? ` → ${out}` : ''));
  process.exit(ok ? 0 : 1);
})();
