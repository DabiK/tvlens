---
id: T021
titre: Import the rolling recorder in its tests instead of rewriting its source
statut: a-faire
bloque_par: T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les six tests de l'enregistreur glissant ne chargent pas `app/recording.js` : ils lisent son texte,
retirent la ligne d'import et les mots `export` par remplacement de chaînes, puis évaluent le reste dans
un contexte `vm` garni de fausses globales. Un import sur deux lignes ou un second import casse les six
tests sans que rien n'ait changé. Après ce ticket, les tests importent le module réel et lui passent
leurs doublures par une option du constructeur ; dans la fenêtre, l'enregistreur se comporte comme
avant.

## Sources

- Constats : TSTC-07
- Code concerné, à la version `0d5a954` :
  - `tests/recording.test.cjs`, `fixture` (l.7-38) : construit `sandbox` (l.23-31) avec `MediaRecorder`,
    `Blob`, `performance`, `document`, `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval` et
    `window.tvlens.ingest` ; `fs.readFileSync(…).replace(/^import .*;\n/, '').replace(/export /g, '')`
    (l.32) ; `vm.runInNewContext(source + '\nRollingRecorder;', sandbox)` (l.33). Les fonctions
    `selectFrameCandidates` et `visualChange` passées au contexte sont déjà les vraies, importées de
    `core/frame-policy.mjs` (l.8).
  - `app/recording.js` (85 lignes) : import de `../core/frame-policy.mjs` (l.1) ; `encodeWav` et
    `RollingRecorder` exportés ; constructeur
    `({ stream, video, audioContext, flushAudio, session, onError, onSegment })` ; globales lues :
    `performance.now()` (l.17, 22), `document.createElement('canvas')` (l.18-19), `MediaRecorder`
    (l.26, 28), `setInterval` (l.34), `setTimeout` (l.36), `clearInterval` et `clearTimeout` (l.55),
    `new Blob` (l.71), `window.tvlens.ingest` (l.75).
  - `app/renderer.js`, construction de l'enregistreur (l.134) :
    `new RollingRecorder({ stream, video: $('preview'), audioContext: context, flushAudio, session,
    onError, onSegment })`.
  - `tests/mac-ui.test.cjs`, test « the renderer talks to the bridge of the contract only, and writes no
    ceiling or retention of its own » (l.685) : relève dans `recording.js` l'usage `window.tvlens.ingest`.
- Vérifié par `node -e` sous Node 24 : `await import('./app/recording.js')` réussit sans DOM.

## Périmètre

- À modifier : `app/recording.js` — le constructeur accepte une option `env` qui porte ce que le module
  lit aujourd'hui dans les globales (horloge `performance`, `document`, `MediaRecorder`, `Blob`, les
  quatre fonctions de minuterie, l'envoi d'un passage). Sa valeur par défaut, évaluée seulement quand
  l'option est absente, reprend les globales du navigateur et l'appel `window.tvlens.ingest`, qui reste
  écrit dans ce fichier.
- À modifier : `tests/recording.test.cjs` — `fixture` fait `await import('../app/recording.js')` et
  passe ses doublures par `env` ; plus de `fs`, plus de `vm`.
- À ne pas toucher : `app/renderer.js` (l'appel de la l.134 reste tel quel), `core/frame-policy.mjs`,
  les six scénarios et leurs valeurs attendues, les autres tests.
- La coupure de l'import faite pour la preuve du critère 5 est défaite à la main avant la fin de la
  session : `app/recording.js` ne garde que l'option `env`.
- `app/recording.js` ne gagne aucune ligne de plus de 160 caractères, `tests/recording.test.cjs` non
  plus.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/recording.test.cjs` passe : 6 tests, mêmes titres, mêmes valeurs attendues.
2. `grep -c "readFileSync\|node:vm\|runInNewContext" tests/recording.test.cjs` rend 0.
3. `node --test --test-concurrency=1 tests/mac-ui.test.cjs` passe : la fenêtre construit toujours
   l'enregistreur sans option `env`, et le garde du pont voit toujours `ingest`.
4. `grep -c "new RollingRecorder({ stream, video: \$('preview')" app/renderer.js` rend 1.
5. Preuve consignée au journal puis défaite : couper l'import de `app/recording.js` sur deux lignes
   laisse les six tests verts.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les six tests existants de `tests/recording.test.cjs`. Frontière : la classe `RollingRecorder` du module
réel `app/recording.js`, importé par Node, avec un environnement fourni par le test.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un des six scénarios dépend d'une globale que l'option `env` ne peut
pas porter sans changer le comportement de l'enregistreur dans la fenêtre : verdict BLOQUÉ, avec l'écart
constaté.

## Journal
