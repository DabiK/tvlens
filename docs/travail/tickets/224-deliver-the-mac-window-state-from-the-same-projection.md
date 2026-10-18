---
id: T224
titre: Deliver the Mac window state from the same projection
statut: a-faire
bloque_par: T219, T210, T195, T233, T267, T268, T275
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

- 18/10, propriétaire : ordre décidé le 18/10 (« ok on fait ça comme ordre »). La copie A du GX10 passe avant la phase
  Mémoire, puis le correctif du panneau de la TV relevé en recette T233 : ce ticket attend aussi T267 et T268.
- 18/10, propriétaire : un contrôle réel sur le Mac suit chaque ticket critique (T269 à T275). Ce ticket attend
  aussi T275.
