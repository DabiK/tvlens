---
id: T290
titre: Explain and fix the intermittent failure of the shared composition event test
statut: termine
bloque_par: T284
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le test qui a échoué une fois sur un contrôle complet de la boucle est expliqué : l'échec est reproduit, sa cause
nommée, puis corrigée dans le test ou dans le runtime. Le contrôle complet ne dépend plus de la chance.

## Sources

- Tentative 1 de T287, le 19/10 à 01:43 : `node scripts/check.mjs` rouge, 2 902 tests JS sur 2 903, un seul échec en
  9,3 ms : `shared composition delivers each passage version while failed subscribers leave both lanes and saves
  running` (`tests/session-events.test.cjs:104`). Le contrôle ne garde que le titre, pas l'assertion en échec. Ce test
  n'importe aucun fichier touché par T287. Rejoué ensuite isolément : 1 succès, puis le fichier entier : 28 succès, puis
  30 exécutions du test seul : 30 succès (`.harness-state/tickets/T287/diagnostic-controle.md`, journaux conservés).
  Première occurrence dans les journaux de la boucle.
- Le test, à `ec8d9d5`, `tests/session-events.test.cjs:104-148` :
  - `:118-125` libère les deux voies dans un ordre fixé, avec un seul `await tick()` (`:122`, un `setImmediate` :
    `tests/helpers/wait.cjs:12`) entre la fin de l'audio du second passage et la fin de la vision du premier ;
  - `:138` affirme l'ordre des appels de perception, `:140-142` l'ordre des six événements livrés, `:143` le nombre
    d'échecs des abonnés.
- Hypothèse, non vérifiée : si la publication d'une mise à jour attend une écriture disque ou plus d'un tour de boucle,
  un seul tick ne suffit pas sous charge ; l'ordre livré ou le nombre d'échecs change. Contrat des événements :
  `docs/adr/0050-les-versions-consultables-et-les-pertes-de-voie-publient-leur-revision.md`, publication avant
  sauvegarde : `docs/adr/0003-dernier-etat-par-fichier-et-publication-avant-sauvegarde.md`.
- Règle du projet : un échec intermittent se reproduit et s'explique ; un test ne s'affaiblit pas et ne se relance pas
  jusqu'au succès.

## Périmètre

- D'abord reproduire, de façon provoquée et répétable : par exemple une écriture du magasin retardée de façon
  contrôlée, ou le test lancé avec d'autres en parallèle et une charge processeur. Consigner l'assertion en échec et
  ses valeurs.
- Si la cause est une attente du test trop courte pour un ordre que le produit garantit : remplacer le tick par une
  attente de l'événement attendu (`until` de `tests/helpers/wait.cjs`), sans retirer aucune assertion.
- Si la cause est un défaut du runtime (ordre ou nombre de publications contraire aux ADR 0003 et 0050) : corriger
  le runtime, avec un test qui reproduit l'échec de façon déterministe.
- Si l'échec vient d'un ordre entre passages que ces ADR ne garantissent pas : s'arrêter avec un verdict PARTIEL et la
  preuve. Changer ce que l'assertion affirme revient au propriétaire.
- À modifier : `tests/session-events.test.cjs`, et `runtime/` ou `core/` seulement dans le deuxième cas.
- À ne pas toucher : le harnais (`scripts/check.mjs`, `scripts/loop/`), les autres tests du fichier.

## Critères d'acceptation

1. La reproduction provoquée échoue avant la correction et passe après ; sa commande et son résultat figurent au
   journal.
2. Aucune assertion du test n'est retirée ni élargie.
3. `node --test tests/session-events.test.cjs`, puis `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/session-events.test.cjs` : la reproduction provoquée de l'échec, gardée comme test si elle porte un défaut du
runtime.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, orchestrateur : rangé après le contrôle T284 et avant la phase Mémoire (T224), qui touche les mêmes
  publications.
- 19/10, orchestrateur : traité dans le commit de T287, sur décision de l'orchestrateur, propriétaire absent. Reproduction
  provoquée par Codex : une lecture média du premier passage retenue jusqu'à la fin de la lecture du second
  (`.harness-state/tickets/T287/reproduce-lane-order.cjs`) fait échouer l'assertion de l'ordre des appels. Cause : les
  voies audio et vision lisent le média en parallèle (`core/memory/lanes.cjs:179-183`) ; l'entrelacement entre
  passages ne dépend que de la fin des lectures disque et n'est garanti par aucun ADR. La correction n'est pas un arrêt
  PARTIEL : elle ne change pas ce que l'assertion affirme, elle fixe le scénario par une barrière dans la doublure de
  transcription. Rouge sans elle, vert avec ; contrôle complet vert. Le détail de l'échec initial n'ayant pas été
  gardé, son identité avec cette cause reste une inférence.
