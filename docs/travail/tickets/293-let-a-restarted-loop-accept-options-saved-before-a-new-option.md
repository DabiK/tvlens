---
id: T293
titre: Let a restarted loop accept options saved before a new option existed
statut: a-faire
bloque_par: T301, T303, T304, T305
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Après un ticket de harnais qui ajoute une option à la boucle, la relève automatique démarre la nouvelle instance au
lieu de s'arrêter : une option absente des réglages transmis par l'ancienne instance prend sa valeur par défaut.

## Sources

- 19/10 à 11:21 : T251 intégré (`a04f44b`) ajoute `--fallback-engine`. La relève qui suit échoue :
  « --fallback-engine attend claude, uniquement avec --engine codex. », puis « La nouvelle instance de boucle a échoué
  (code 1). Aucun ticket suivant n'est lancé. » (événement `relance-echouee`, cause `LOOP_WORKER_FAILED`). Relancée à
  la main par l'orchestrateur, la boucle est repartie normalement.
- Code à `a04f44b` :
  - `scripts/loop/run.mjs:43` : `options = launch?.options ?? { … }` ; une relève reçoit les options de l'ancienne
    instance par le canal IPC (`scripts/loop/restart.mjs:20-32`, `:110`), sans le champ `fallbackEngine` qu'elle ne
    connaissait pas ;
  - `scripts/loop/run.mjs:154` : `options.fallbackEngine !== null` vaut vrai pour `undefined`, et la validation
    s'arrête ;
  - `scripts/loop/run.mjs:125`, `:171` lisent aussi ce champ.
- Tests de la boucle : `tests/ticket-loop.test.cjs`.

## Périmètre

- À modifier : `scripts/loop/run.mjs`, `tests/ticket-loop.test.cjs`.
- Les options reçues d'une relève sont complétées par les valeurs par défaut de la lecture de la ligne de commande
  pour tout champ absent ; aucune option présente n'est changée. Une seule source des valeurs par défaut.
- La validation et ses messages ne changent pas pour une option réellement fournie.
- À ne pas toucher : le protocole IPC de relève, le verrou, le cliquet, `scripts/check.mjs`.

## Critères d'acceptation

1. Une relève dont les options transmises n'ont pas `fallbackEngine` démarre et traite le ticket suivant ; le test
   échoue avant la correction.
2. Une relève dont les options portent `fallbackEngine: "claude"` avec `engine: "codex"` garde ce réglage.
3. `--fallback-engine` invalide sur la ligne de commande garde son refus actuel.
4. `node --test tests/ticket-loop.test.cjs`, puis `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/ticket-loop.test.cjs` : une relève simulée avec les options d'une instance antérieure à l'option.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le propriétaire a autorisé ce ticket de harnais le 19/10 (« Oui pour les points 1 et 2 »).

## Journal
- 19/10, propriétaire : attend le chantier « son seul » (T297 à T301), traité en premier.
