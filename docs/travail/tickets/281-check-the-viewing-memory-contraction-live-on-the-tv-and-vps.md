---
id: T281
titre: Check the viewing memory contraction live on the TV and VPS
statut: a-faire
bloque_par: T227
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : c'est la recette réelle de la phase Mémoire (T224 à T227), sur la vraie
TV et le vrai VPS, comme T233 avant elle. Elle ne bloque aucun ticket : un essai sur la TV ne charge pas le Mac,
et il se fait quand le propriétaire ne regarde pas.

## Sources

- Décision du propriétaire, le 18/10, sur l'avis d'Astra : une recette par copie figée, plutôt qu'un contrôle réel
  après chaque ticket interne ; G3 avant la phase Mémoire.
- Précédents : T233 (recette TV et VPS) et T274 (copie A).

## Périmètre

- À modifier : rien dans le dépôt, hors journal de ce ticket. La boucle ne lance pas ce ticket : il attend une
  décision.
- Hors boucle, par l'orchestrateur, sur la TV et le VPS, jamais pendant que le propriétaire regarde, depuis le dernier commit intégré :
  1. poser un tag, le déployer sur le VPS et sur la TV, avec sauvegarde et retour arrière prêt ;
  2. une capture réelle d'une dizaine de minutes : passages complets, sujets, frise, vues `chat` et `panel`, une
     question citée, une carte de surveillance, la fin de session puis la réouverture de l'archive ;
  3. comparer à la recette T233 (`experiments/essais/2026-10-18-recette-tv-vps/`) ;
  4. consigner le résultat dans le journal de ce ticket et dans `experiments/essais/` ; un écart devient un
     ticket correctif ; ce ticket reste à faire jusqu'à sa correction. Concluant : statut `termine`, commit de ce
     seul fichier.

## Critères d'acceptation

1. Ce ticket ne bloque aucun autre ticket ; il reste à faire tant que la recette n'est pas concluante.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais.

## Hypothèses bloquantes

Décision attendue du propriétaire : la recette réelle de la contraction de la Mémoire est-elle concluante ? Le propriétaire a décidé le 18/10
que l'orchestrateur fait cette recette et ferme ce ticket quand elle est concluante.

## Journal

