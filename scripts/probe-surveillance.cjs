// Bounded REAL-provider trial of the surveillance role. Not part of the test suite, never run by it.
// It starts the installed Codex CLI with the account already signed in, and the web: one activation,
// six short written passages (two checkable figures, four decoys), one verification worker, a hard
// deadline. No media, no capture, nothing written unless --out is given.
//
//   node scripts/probe-surveillance.cjs [--out <file.json>] [--instruction "<consigne>"] [--deadline-ms 240000]
//
// Environment: TVLENS_TEST_CODEX_MODEL (model), TVLENS_CODEX_BINARY (default "codex"),
// TVLENS_CODEX_AUTH_HOME or CODEX_HOME (existing sign-in). The output says "essai fournisseur réel":
// it measures this run on this day, not the simulations of tests/surveillance*.test.cjs.
const fs = require('node:fs/promises');
const { createSurveillanceRuntime } = require('../runtime/surveillance-runtime.cjs');
const { sentences, acceptableText } = require('../core/surveillance.cjs');
const { createMemoryView } = require('../core/memory/index.cjs');
const { createEventPublisher } = require('../core/shared/events.cjs');
const { memoryState } = require('./memory-fixture.cjs');

const option = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const instruction = option('instruction', 'Je compte sur toi pour vérifier tous les chiffres qui sont balancés.');
const deadlineMs = Math.min(600000, Math.max(30000, Number(option('deadline-ms', 240000)) || 240000));
const out = option('out', null);

// Written for the trial, not transcribed from any programme. `expect` is what a careful reader would do.
const PASSAGES = [
  { expect: 'claim', transcript: 'D’après l’invité, le taux de chômage en France était de 7,5 % au quatrième trimestre 2023.' },
  { expect: 'decoy', decoy: 'heure', transcript: 'Il est 20 h 45, on se retrouve juste après la météo.' },
  { expect: 'decoy', decoy: 'score', transcript: 'Au tableau d’affichage, le score est de 2 à 1 pour les Bleus à la mi-temps.' },
  { expect: 'decoy', decoy: 'prix de fiction', transcript: 'Dans le film de ce soir, le héros achète la voiture 300 dollars à un inconnu.' },
  { expect: 'decoy', decoy: 'numéro de téléphone', transcript: 'Pour participer au jeu, appelez le 01 23 45 67 89 avant minuit.' },
  { expect: 'claim', transcript: 'Elle affirme que la population mondiale a dépassé les 9 milliards d’habitants en 2022.' },
].map((passage, i) => ({ ...passage, id: `moment-${i + 1}`, startMs: i * 8000, endMs: (i + 1) * 8000 }));

(async () => {
  const started = Date.now(), elapsed = () => Date.now() - started;
  const segments = [], saved = { writes: 0, last: null };
  // An in-memory session exposes the same consultation port as the hosts.
  const session = {
    memory: { view: () => createMemoryView(memoryState({ id: 'probe-surveillance', segments })) },
    events: createEventPublisher(),
    store: { saveSurveillance: async snapshot => { saved.writes++; saved.last = snapshot; } },
  };
  const runtime = createSurveillanceRuntime({
    getSession: () => session,
    codexBinary: process.env.TVLENS_CODEX_BINARY || 'codex',
    selectedModels: { codexModel: process.env.TVLENS_TEST_CODEX_MODEL || '' },
    config: { codexAuthHome: process.env.TVLENS_CODEX_AUTH_HOME || process.env.CODEX_HOME || null, surveillance: { workers: 1, visionGraceMs: 0 } },
    onChange: state => process.stderr.write(`[${(elapsed() / 1000).toFixed(1)} s] ${state.activity.state} · ${state.activity.label}\n`),
  });
  let timer, timedOut = false;
  try {
    runtime.start({ instruction });
    for (const { id, startMs, endMs, transcript } of PASSAGES)
      segments.push({ id, startMs, endMs, status: 'ready', audioStatus: 'ready', visionStatus: 'ready', observation: { transcript, summary: '', visual: '', uncertainty: 'Transcription automatique.' } });
    runtime.observe(session.memory.view());
    await new Promise(resolve => {
      timer = setInterval(() => {
        runtime.tick();
        const { coverage, counts } = runtime.snapshot();
        const moving = coverage.pending + coverage.scanning + coverage.rescan + coverage.waiting + counts.detected + counts.queued + counts.running;
        timedOut = elapsed() >= deadlineMs;
        if (!moving || timedOut) resolve();
      }, 1000);
    });
    const final = runtime.stop(timedOut ? 'Essai interrompu : délai maximal atteint.' : 'Essai terminé.');
    await runtime.flush();
    const full = runtime.snapshot({ full: true }), byPassage = id => full.claims.filter(c => c.origin.passageId === id);
    const report = {
      kind: 'essai fournisseur réel (Codex CLI et recherche web) — ni simulation ni mesure de charge',
      at: new Date().toISOString(), model: process.env.TVLENS_TEST_CODEX_MODEL || 'défaut du compte', instruction, elapsedMs: elapsed(), timedOut,
      coverage: final.coverage, counts: final.counts, backlog: final.backlog, totals: final.totals,
      // What the detector returned and validation dropped, with the cause: how often a real quote misses its passage
      // by a typographic variation can only be seen here, with a real model.
      gaps: full.gaps, rejects: full.passages.flatMap(p => p.rejects.map(reject => ({ passageId: p.id, ...reject }))),
      passages: PASSAGES.map(p => ({ id: p.id, expect: p.expect, decoy: p.decoy || null, transcript: p.transcript, claims: byPassage(p.id).map(c => c.id) })),
      expectations: {
        bothFiguresDetected: PASSAGES.filter(p => p.expect === 'claim').every(p => byPassage(p.id).length > 0),
        decoysLeftAlone: PASSAGES.filter(p => p.expect === 'decoy').every(p => byPassage(p.id).length === 0),
        everyClaimTerminal: full.claims.every(c => ['sourced', 'undetermined', 'error', 'cancelled', 'noted'].includes(c.status)),
        // One to three sentences, 420 characters, no address, no Markdown, no true/false verdict.
        cardsWithinBound: full.overlay.cards.every(card => acceptableText(card.text)),
        nothingRejected: final.totals.rejected === 0,
      },
      claims: full.claims.map(c => ({ id: c.id, status: c.status, reason: c.reason, action: c.action, kind: c.kind, checkable: c.checkable, statement: c.statement, quote: c.origin.quote, passageId: c.origin.passageId,
        assessment: c.assessment, conclusion: c.conclusion, limitations: c.limitations, sources: c.sources.map(s => ({ url: s.url, title: s.title, relation: s.relation })), error: c.error })),
      lots: full.lots.map(l => ({ id: l.id, kind: l.kind, status: l.status, overlay: l.overlay, text: l.text, sentences: sentences(l.text).length, uncertainties: l.uncertainties, sources: l.sources.map(s => s.url), metrics: l.metrics, error: l.error })),
      metrics: full.metrics, persistence: { ...runtime.persistence, savedClaims: saved.last?.claims.length ?? 0 },
    };
    const text = JSON.stringify(report, null, 2);
    if (out) await fs.writeFile(out, text, { mode: 0o600 });
    console.log(text);
    // A trial that produced nothing usable is a failed trial, whatever the cause (sign-in, quota, network).
    if (timedOut || !full.claims.length || full.metrics.detect.failures || !report.expectations.everyClaimTerminal) process.exitCode = 1;
  } finally {
    clearInterval(timer);
    await runtime.close('Essai terminé.');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
