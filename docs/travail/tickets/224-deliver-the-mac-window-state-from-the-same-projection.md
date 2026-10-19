---
id: T224
titre: Deliver the Mac window state from the same projection
statut: termine
bloque_par: T219, T210, T195, T233, T267, T268, T284, T290
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le Mac lit et pousse l'état de sa fenêtre depuis la même projection applicative que le serveur.
Le titre, la fraîcheur des lectures et la livraison groupée de l'ADR 0025 gardent leurs comportements,
sans reconstruire le snapshot complet pour chaque destinataire.

## Sources

- Coupe de T219, relecture B, constat 5 ; `docs/domaine.md`, sections 6 et 8 ; ADR 0029/0030.
  T219 livre projection, ports publics et invalidations ; T210 migre le résumé et protège sa fin.
  T195 remplace les assertions de forme de `tests/mac-ipc-contract.test.cjs:87-128` ; relire ses
  coutures, sa preuve de remplacement et ses éventuelles assertions conservées avant le câblage.
- Code vérifié à `dd5efc9` : `app/main.cjs:286` fournit l'état courant avec titre, `:299-303`
  observe le résumé/surveillance puis envoie `watch:state` ; `:300` exclut closing/switching du résumé.
- `app/ui/state-delivery.mjs:38` adopte le dernier état immédiatement puis regroupe les dessins ;
  ADR 0025 protège frame/secours, lectures, libération et absence de dessin tardif. Ce n'est pas
  la coalescence disque et cela ne garantit pas un nombre réduit de messages IPC.
- Tests : mac-ipc-contract, state-delivery et bancs Mac affectés, sous `tests/`, suffixe `.test.cjs`.
  T183 porte la couture de livraison ; T195 et T210 sont à relire, pas à réimplémenter.

## Périmètre

- Brancher `sessionState()` et le push Mac sur la projection partagée T219, ajouter seulement
  le titre propre à la session chargée. Donner la même source aux lectures IPC et notifications.
- Retirer la consommation du callback snapshot complet par la fenêtre. Résumé et surveillance
  gardent leurs abonnements spécialisés T210/T211 ; ne pas les nourrir deux fois.
- Réutiliser les invalidations publiques de T219 pour files, activité, erreurs, coûts, historique
  et stockage : aucun champ de la fenêtre ne doit disparaître faute d'être dans MemoryView.
  Ne pas placer `asking` ou les questions dans cette vue pour simplifier le branchement.
- Garder adoption immédiate, dessins regroupés, course frame/secours, lecture du dernier état,
  libération et bascule de session de l'ADR 0025. Détacher les accès à A avant adoption de B.
- Jusqu'à remplacement effectif par T195, ne pas réécrire les motifs source du banc Mac pour
  suivre le nouveau câblage ; si l'un casse, s'arrêter. Les assertions de comportement livrées
  par T195 restent les preuves ; aucun nouveau test qui compare le texte de l'hôte.
- Ne pas retirer ici `onChange` du domaine, modifier sauvegarde/fin ou format disque, ni déplacer
  l'interface. T225 contracte ensuite la notification. Compléter l'ADR T219 pour la livraison Mac,
  garder permissions T205 et code nouveau sans infraction gelée.

## Critères d'acceptation

1. Lecture IPC et push de la même session donnent le même état avec titre qu'avant, y compris
   activité, files, erreurs, questions historiques, coûts, latence et stockage. Le branchement
   Mac n'appelle plus `watch.snapshot()` ; un espion du banc le prouve.
2. Trois changements rapprochés adoptent immédiatement le dernier état et regroupent les dessins
   comme l'ADR 0025. Frame puis secours et secours puis frame ne dessinent pas deux fois.
3. Un changement ou une fermeture de session empêche état et dessin tardifs de A dans B. Une fin
   d'analyse pendant closing/switching ne réamorce pas le résumé ni ne réécrit ses chapitres (T210).
4. Les lecteurs serveur T219 et les corps figés T213 restent inchangés. Aucun champ, canal IPC ou
   URL média ne change ; un diagnostic de publication refusée ne bloque ni voies ni sauvegarde.
5. À l'implémentation, jouer memory-projection, mac-ipc-contract, state-delivery, les tests du
   résumé et les gardes en séquentiel, puis `node scripts/check.mjs`. Aucun test ni plancher retiré.

## Test d'acceptation attendu

Le vrai hôte est chargé via les coutures de T195 avec Electron simulé. Ingestion, changements de
statut et fermeture produisent des valeurs observées par IPC ; `tests/state-delivery.test.cjs`
prouve adoption et dessins avec frame/secours maîtrisés. Aucun Electron natif ni fournisseur réel.

## Hypothèses bloquantes

Aucune décision n'est attendue.

L'interface exacte est celle livrée par T219, pas une copie Mac de sa projection. T195 est un
prérequis de la part Mac ; une assertion conservée pour une branche inaccessible reste une limite
nommée, jamais un motif à réécrire pour masquer une régression de câblage.

## Journal

- Exploration Codex : consignes, coutures T195, projection T219, hôte, tests et ADR concernés lus.
  Témoin de hooks présent. Correspondance des champs, invalidations et plan de preuve consignés dans
  `.harness-state/tickets/T224/exploration.md` ; aucun écart prévu (`ecarts.md`). Les deux dossiers
  non suivis préexistants restent hors lot. Aucun sous-agent ni relecteur lancé par cette session.
- Projection : `node --test --test-name-pattern='Mac IPC reads and pushes' tests/mac-ipc-contract.test.cjs`
  rouge observé (une construction snapshot lors de la lecture IPC), puis vert après raccordement à
  `memoryProjection.read()`. Les espions distinguent callback hérité, projection et lecture explicite.
- Bascule : `node --test --test-name-pattern='Mac session switching detaches' tests/mac-ipc-contract.test.cjs`
  rouge sur une notification pendant switching, puis vert avec garde de runtime et de fermeture.
  Réouverture du même identifiant, adoption de B et notification après quit couvertes.
- Fraîcheur renderer : les motifs `a retained initial session read` puis `an archive read held at`
  de `tests/mac-ui.test.cjs` donnent chacun deux rouges sur A réadopté ou sa surveillance restaurée
  dans B. Gardes de lecture et génération locale ajoutées ; six cas ciblés verts, dont les deux
  scénarios existants de lecture d'archive et de garde deep après `Promise.all`.
- Préservation des champs : `node --test --test-name-pattern='Mac projection retains' tests/mac-ipc-contract.test.cjs`
  vert pour files sans nouveau texte, usage acquis avant publication, coûts, latence, historique,
  stockage et refus/retour de sauvegarde. Le premier essai avait une attente de test erronée (`p50`
  au lieu de `mean` dans le contrat existant de latence) ; seul cet accès a été corrigé.
- Dessins : `node --test --test-name-pattern='three session pushes' tests/state-delivery.test.cjs`
  donne deux rouges après mutation temporaire retirant la garde d'identité du lot, puis deux verts
  après restauration. Adoption immédiate des trois états et absence de double dessin vérifiées.
  `app/ui/state-delivery.mjs` reste inchangé dans le diff final.
- Premier `node scripts/check.mjs --changed` vert : règles, format, lint, gel et cliquet,
  113 tests réussis sur trois fichiers. ADR 0054 complété et ADR 0059 rédigé. Commandes et sorties
  conservées dans `.harness-state/tickets/T224/` ; acceptation séquentielle puis contrôle complet à suivre.
- Acceptation en séquentiel : commande ci-dessous, **692 tests réussis**, aucun échec ; sortie
  `.harness-state/tickets/T224/acceptance.log`. Les chapitres conservés pendant closing, les refus
  de publication/diagnostic et les corps HTTP figés restent protégés par leurs scénarios existants.

  ```sh
  node --test --test-concurrency=1 tests/memory-projection.test.cjs tests/mac-ipc-contract.test.cjs \
    tests/state-delivery.test.cjs tests/mac-ui.test.cjs tests/living-recap.test.cjs \
    tests/living-recap-runtime.test.cjs tests/server-state-views.test.cjs tests/split-perception.test.cjs \
    tests/host-error-handling.test.cjs tests/architecture.test.cjs tests/architecture-guard.test.cjs
  ```

- `node scripts/check.mjs --changed` final vert : règles, format, lint, gel et cliquet,
  **113 tests réussis sur trois fichiers** (`check-changed-final.log`). Aucun test, plancher,
  motif source hérité de T195 ou fichier du harnais modifié.
- Premier `node scripts/check.mjs` rouge : **2 916/2 917 tests JavaScript réussis sur 153 fichiers**
  et **54 tests Python réussis**. Seul échec : index documentaire incomplet pour l'ADR 0059.
  `node --test tests/documentation-index.test.cjs` reproduit le diagnostic (11/12), puis passe
  (12/12) après ajout du lien et de sa phrase dans `docs/architecture.md`. Aucun test changé.
  Sorties : `check-full-final.log`, `documentation-index-red.log`, `documentation-index-green.log`.
- Après correction documentaire, `node scripts/check.mjs` **vert** : règles, format, lint, gel,
  cliquet, **2 917/2 917 tests JavaScript sur 153 fichiers** et **54 tests Python** réussis.
  Sortie : `.harness-state/tickets/T224/check-full-corrected.log`. `git diff --check` vert.
- Verdict `TERMINÉ` enregistré dans `.harness-state/tickets/T224/verdict.json`, avec la matrice
  des critères dans `preuves.md`. Aucune réserve propre ; aucun commit ni push. La boucle garde
  la responsabilité de la relecture et de l'intégration.

- Reprise après `relecture-1.md` : rapport, ticket/journal, écarts, status/diff et couture renderer
  relus, nouveau témoin de hooks présent. Constat mineur 1 accepté : séparer fraîcheur de lecture et
  génération pour préserver accompagnements et défilement lors d'une poussée de la même archive.
  Préparation du rouge dans `mac-ui`, sans nouvel écart ni modification du harnais.
- Correction du constat mineur 1 :
  `node --test --test-name-pattern='a push from the same archive' tests/mac-ui.test.cjs` rouge
  sur l'absence des trois lectures d'accompagnement, puis vert après séparation de la garde de
  génération et de la fraîcheur de l'état. Le test conserve l'état poussé, applique deep/résumé/
  surveillance et vérifie `scrollTop` en bas après dessin. ADR 0059 précisé ; sorties
  `correction-1-same-archive-red.log` et `correction-1-same-archive-green.log` dans le dossier d'état.
- Vérifications de correction :
  `node --test --test-concurrency=1 tests/mac-ui.test.cjs tests/state-delivery.test.cjs` vert,
  **74/74 cas**, puis `node scripts/check.mjs --changed` vert, **114/114 cas** et tous les
  contrôles qualité. Sorties : `correction-1-renderer-green.log` et `correction-1-check-changed.log`.
  Le contrôle complet de correction est lancé ; aucun autre constat ni contestation.
- Contrôle complet après correction : `node scripts/check.mjs` **vert**, règles, format, lint,
  gel et cliquet validés, **2 918/2 918 tests JavaScript sur 153 fichiers** et **54 tests Python**
  réussis. Sortie : `.harness-state/tickets/T224/correction-1-check-full.log`.
  `git diff --check` vert. Nouveau verdict `TERMINÉ` enregistré : constat mineur 1 corrigé,
  aucune réserve propre, aucun commit ni push ; relecture et intégration laissées à la boucle.

- 18/10, propriétaire : ordre décidé le 18/10 (« ok on fait ça comme ordre »). La copie A du GX10 passe avant la phase
  Mémoire, puis le correctif du panneau de la TV relevé en recette T233 : ce ticket attend aussi T267 et T268.
- 18/10, propriétaire : un contrôle réel sur le Mac suit chaque ticket critique (T269 à T275). Ce ticket attend
  aussi T275.
- 18/10, propriétaire : le contrôle TV T275 ne bloque plus ce ticket. Un essai sur la TV ne charge pas le Mac et
  exige que le propriétaire ne regarde pas : il se fait à part, sans retenir la phase Mémoire.
- 18/10, propriétaire : les réglages des modèles locaux (T282, T283) et leur contrôle T284 passent avant ce
  ticket.
- 19/10, orchestrateur : attend aussi T290, l'échec intermittent d'un test des publications de passages.
