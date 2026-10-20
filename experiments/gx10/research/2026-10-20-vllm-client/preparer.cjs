const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const hash = value => createHash('sha256').update(value).digest('hex');
const repo = path.resolve(process.argv[2] || '.');
const output = path.resolve(process.argv[3] || 'corpus.json');
const archives = process.argv.slice(4);
if (!archives.length) throw Error('Usage : node preparer.cjs dépôt corpus-neuf.json campagne.json [...]');
const { VideoTools } = require(path.join(repo, 'core/video-tools.cjs'));
const { schema, buildLocalPrompt } = require(path.join(repo, 'adapters/companion-prompt.cjs'));
const cases = [];
const sources = [];
for (const archive of archives) {
  const raw = fs.readFileSync(archive);
  const report = JSON.parse(raw);
  const source = { path: path.resolve(archive), sha256: hash(raw), complete: report.complete, runId: report.runId };
  sources.push(source);
  for (const question of report.questions) {
    const anchorMs = question.anchorMs;
    if (!Number.isFinite(anchorMs)) continue;
    const latest = new Map();
    for (const revision of report.journal.revisions) {
      const passage = revision.passage;
      if (revision.atMs <= anchorMs && passage.endMs <= anchorMs) latest.set(passage.id, revision);
    }
    const revisions = [...latest.values()].sort((a, b) => a.passage.startMs - b.passage.startMs);
    const passages = revisions.map(revision => revision.passage);
    const tools = new VideoTools({ consultation: { sessionId: passages.length ? revisions[0].sessionId : report.runId,
      anchorMs, startMs: 0, passages }, signal: new AbortController().signal });
    const context = tools.context();
    const input = { question: question.question, tools, context, conversation: [], mode: 'chat' };
    const protocol = 'ESSAI COMPOSANT : aucun outil n’est disponible pour ce tour. Réponds uniquement depuis le contexte fourni, sinon kind=insufficient.';
    const messages = [{ role: 'user', content: buildLocalPrompt(input) + '\n' + protocol }];
    cases.push({ id: question.id, question: question.question, anchorMs, sourceSha256: source.sha256,
      sourceQuestionId: question.id, revisions: revisions.map(revision => ({ id: revision.passage.id,
        revision: revision.passage.revision, publishedAtMs: revision.atMs, endMs: revision.passage.endMs })),
      context, conversation: [], messages, messagesSha256: hash(JSON.stringify(messages)) });
  }
}
if (!cases.length || new Set(cases.map(item => item.id)).size !== cases.length) throw Error('Corpus vide ou identifiants dupliqués.');
const sourceFiles = ['core/video-tools.cjs', 'core/shared/passage-text.cjs',
  'adapters/companion-prompt.cjs', 'adapters/ollama/question-response.cjs'];
const corpus = { version: 1, createdAtUtc: new Date().toISOString(), readyForScoring: false,
  historicalPromptReplay: false, scope: 'Question isolée, contexte reconstitué au temps d’ancre, sans conversation ni outils.',
  limitations: ['Les prompts historiques exacts sont absents ; ces nouveaux prompts sont figés une seule fois.',
    'Les résumés de perception sont des entrées automatiques, pas des attendus humains.',
    'Aucune réponse historique n’est lue pour fabriquer les entrées ; aucune fiche attendue n’est importée.',
    'Pas de file produit, ASR, perception en concurrence, recherche, inspection ou transport TV dans cette sonde.'],
  settings: { temperature: 0, maxOutputTokens: 1024, numCtx: 16384, thinking: false,
    requestTimeoutMs: 90000, budgetMs: 1200000, maxConsecutiveErrors: 3 },
  code: { sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    sources: Object.fromEntries(sourceFiles.map(file => [file, hash(fs.readFileSync(path.join(repo, file)))])) },
  sources, schema, cases };
fs.writeFileSync(output, JSON.stringify(corpus, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ output, cases: cases.length, sha256: hash(fs.readFileSync(output)), inferencePerformed: false }));
