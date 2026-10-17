const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OWNERS = [
  'session-providers', 'session-manifest', 'session-lifecycle', 'session-closing',
  'capture-intake', 'headless-session-lifecycle', 'state-views',
];
const REFERENCES = ['docs/architecture.md', 'docs/README.md', 'CONTRIBUTING.md'];

function trackedFiles(root) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean);
}

function expectedIndexTargets(documents) {
  const top = documents
    .filter(filename => /^docs\/[^/]+\.md$/.test(filename) && filename !== 'docs/README.md')
    .map(filename => filename.slice('docs/'.length));
  const archives = documents
    .filter(filename => /^docs\/archive\/[^/]+\/README\.md$/.test(filename))
    .map(filename => filename.slice('docs/'.length));
  return [...top, ...archives, 'adr/', 'diagrams/README.md', 'architecture-improvements/index.md'].sort();
}

function linksOf(source) {
  return [...source.matchAll(/(?<!!)\[([^\]\n]+)\]\(([^)\s]+)\)/g)]
    .map(match => ({ label: match[1], target: match[2], end: match.index + match[0].length }));
}

function documentProblems(root) {
  const problems = [];
  const documents = trackedFiles(root);
  const read = filename => fs.readFileSync(path.join(root, filename), 'utf8');
  const index = read('docs/README.md');
  const architecture = read('docs/architecture.md');
  const indexTargets = new Set(linksOf(index).map(link => link.target));
  for (const target of expectedIndexTargets(documents)) {
    if (!indexTargets.has(target)) problems.push(`docs/README.md : ajouter un lien vers ${target}.`);
  }
  const decisions = architecture.match(/^## Décisions\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] || '';
  const decisionLinks = linksOf(decisions);
  for (const filename of documents) {
    if (!/^docs\/adr\/(?!0000-)\d{4}-.+\.md$/.test(filename)) continue;
    const target = filename.slice('docs/'.length);
    const link = decisionLinks.find(link => link.target === target);
    const explanation = link && decisions.slice(link.end).split(/\n(?=- |## )/)[0].replace(/^[\s:—–-]+/, '').trim();
    if (!explanation) problems.push(`docs/architecture.md : ajouter une phrase et un lien vers ${target} dans la section Décisions.`);
  }
  for (const owner of OWNERS) {
    if (!new RegExp(`(?<![\\w-])${owner}(?![\\w-])`).test(architecture)) {
      problems.push(`docs/architecture.md : ajouter le module ${owner} et sa responsabilité à la carte.`);
    }
  }
  for (const filename of REFERENCES) {
    problems.push(...referenceProblems(root, filename, read(filename), documents));
  }

  return problems;
}

function publishedTargetExists(root, filename, local, files) {
  const absolute = path.resolve(root, path.dirname(filename), local);
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  const prefix = relative ? relative + '/' : '';
  return fs.existsSync(absolute) && (files.includes(relative) || files.some(file => file.startsWith(prefix)));
}

function referenceProblems(root, filename, source, files) {
  const problems = [];
  for (const { target } of linksOf(source)) {
    if (/^(?:[a-z]+:|#)/i.test(target)) continue;
    const local = decodeURIComponent(target.split('#')[0]);
    if (!publishedTargetExists(root, filename, local, files)) {
      problems.push(`${filename} : cible absente ${target} ; corriger le lien ou ajouter le document.`);
    }
  }
  for (const line of source.split('\n')) {
    if (/\b\d[\d\s.,]*\s+(?:tests?|cas de test)\b/i.test(line)
      || /\btests?\s*[:=]\s*\d/i.test(line)) {
      problems.push(`${filename} : retirer le décompte de tests de la référence : ${line.trim()}`);
    }
    if (/\b(?:codex|refactor|feature|fix)\/[\w./-]+|\bbranche\s+`[^`]+`/i.test(line)) {
      problems.push(`${filename} : retirer le nom de branche de la référence : ${line.trim()}`);
    }
    if (/(?:ni commit[ée]+|rien n[’']est déployé|pas encore déploy[ée]+|tournent encore sur la version précédente)/i.test(line)) {
      problems.push(`${filename} : remplacer l'affirmation de déploiement par une référence à un relevé daté : ${line.trim()}`);
    }
  }
  return problems;
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tvlens-doc-index-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  const write = (filename, source, { tracked = true } = {}) => {
    fs.mkdirSync(path.dirname(path.join(root, filename)), { recursive: true });
    fs.writeFileSync(path.join(root, filename), source);
    if (tracked) execFileSync('git', ['add', '--', filename], { cwd: root });
  };
  write('docs/adr/0000-gabarit.md', '# Gabarit');
  write('docs/adr/0001-example.md', '# Décision');
  write('docs/diagrams/README.md', '# Diagrammes');
  write('docs/architecture-improvements/index.md', '# Historique');
  write('docs/history.md', '# Rapport du 13 octobre 2026\n127 tests, branche `codex/history`. Rien n’est déployé.');
  write('docs/architecture.md', `# Architecture\n${OWNERS.join('\n')}\n\n## Décisions\n- [ADR](adr/0001-example.md) : Conserver la décision.\n`);
  write('docs/README.md', ['architecture.md', 'history.md', 'adr/', 'diagrams/README.md', 'architecture-improvements/index.md']
    .map(target => `[Document](${target})`).join('\n'));
  write('CONTRIBUTING.md', '# Contribuer');
  return { root, write, read: filename => fs.readFileSync(path.join(root, filename), 'utf8') };
}

test('published documentation indexes the local documents and decisions with existing targets', () => {
  assert.equal(documentProblems(ROOT).join('\n'), '', 'Compléter les liens et les phrases indiqués dans les diagnostics.');
});

test('documentation inventory accepts a complete tree and ignores historical assertions', t => {
  const { root } = fixture(t);
  assert.deepEqual(documentProblems(root), []);
});

test('documentation inventory diagnoses a newly added top-level document', t => {
  const { root, write } = fixture(t);
  write('docs/new-reference.md', '# Nouvelle référence');
  assert.ok(documentProblems(root).some(problem => problem.includes('ajouter un lien vers new-reference.md')));
});

test('documentation inventory excludes untracked and ignored documents from every category', t => {
  const { root, write } = fixture(t);
  write('.gitignore', 'docs/private-draft.md\n');
  for (const filename of ['docs/private-draft.md', 'docs/local-notes.md', 'docs/adr/0002-draft.md', 'docs/archive/private/README.md']) {
    write(filename, '# Brouillon local', { tracked: false });
  }
  assert.deepEqual(documentProblems(root), []);
});

test('documentation inventory diagnoses an archive index and accepts its link', t => {
  const { root, write, read } = fixture(t);
  write('docs/archive/old/README.md', '# Archive');
  assert.ok(documentProblems(root).some(problem => problem.includes('archive/old/README.md')));
  write('docs/README.md', read('docs/README.md') + '\n[Archive](archive/old/README.md)');
  assert.deepEqual(documentProblems(root), []);
});

test('documentation inventory requires a sentence and link for each added decision', t => {
  const { root, write, read } = fixture(t);
  write('docs/adr/0002-added.md', '# Nouvelle décision');
  const expected = 'ajouter une phrase et un lien vers adr/0002-added.md dans la section Décisions';
  assert.ok(documentProblems(root).some(problem => problem.includes(expected)));
  const original = read('docs/architecture.md');
  write('docs/architecture.md', original + '- [ADR](adr/0002-added.md)\n');
  assert.ok(documentProblems(root).some(problem => problem.includes(expected)));
  write('docs/architecture.md', original + '- [ADR](adr/0002-added.md) : Expliquer la nouvelle règle.\n');
  assert.deepEqual(documentProblems(root), []);
});

test('documentation inventory diagnoses an absent link target', t => {
  const { root, write, read } = fixture(t);
  for (const filename of REFERENCES) {
    const original = read(filename);
    write(filename, original + '\n[Absent](missing.md)');
    assert.ok(documentProblems(root).some(problem => problem.startsWith(filename) && problem.includes('cible absente missing.md')));
    write(filename, original);
  }
});

test('reference links reject existing untracked and ignored files and directories', t => {
  const { root, write, read } = fixture(t);
  write('.gitignore', 'private/\n');
  write('experiments/README.md', '# Recherche locale', { tracked: false });
  write('private/README.md', '# Brouillon privé', { tracked: false });
  const expected = [];
  for (const filename of REFERENCES) {
    const targets = ['experiments/README.md', 'experiments/', 'private/README.md']
      .map(target => path.relative(path.dirname(filename), target));
    write(filename, read(filename) + '\n' + targets.map(target => `[Local](${target})`).join('\n'));
    for (const target of targets) {
      expected.push(`${filename} : cible absente ${target} ; corriger le lien ou ajouter le document.`);
    }
  }
  assert.deepEqual(documentProblems(root), expected);
});

test('reference links accept tracked targets outside docs and their parent directories', t => {
  const { root, write, read } = fixture(t);
  write('examples/README.md', '# Exemple publié');
  for (const filename of REFERENCES) {
    const targets = ['examples/README.md', 'examples/']
      .map(target => path.relative(path.dirname(filename), target));
    write(filename, read(filename) + '\n' + targets.map(target => `[Publié](${target})`).join('\n'));
  }
  assert.deepEqual(documentProblems(root), []);
});

test('architecture map diagnoses every missing runtime owner', t => {
  const { root, write, read } = fixture(t);
  const original = read('docs/architecture.md');
  for (const owner of OWNERS) {
    write('docs/architecture.md', original.replace(new RegExp(`^${owner}\\n`, 'm'), ''));
    assert.ok(documentProblems(root).some(problem => problem.includes(`module ${owner} et sa responsabilité`)), owner);
  }
});

test('reference pages reject test counts and branch or deployment assertions', t => {
  const { root, write, read } = fixture(t);
  for (const filename of REFERENCES) {
    const original = read(filename);
    for (const assertion of ['127 tests passent.', 'Branche `refactor/example`.', 'Rien n’est déployé.']) {
      write(filename, original + '\n' + assertion);
      assert.ok(documentProblems(root).some(problem => problem.startsWith(filename) && problem.includes(assertion)), assertion);
    }
    write(filename, original);
  }
});
