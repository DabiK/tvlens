---
id: T280
titre: Check the GX10 copy B live on the Mac
statut: a-faire
bloque_par: T260
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : c'est la recette réelle de la copie B du GX10, sur le Mac, boucle
arrêtée. Une campagne soutenue de trente minutes passe par le runner de T259 et le bilan de T261 avant que la
copie soit taguée. Tant que ce ticket n'est pas terminé, T268, T251, T256 et T232 attendent.

## Sources

- Décision du propriétaire, le 18/10, sur l'avis d'Astra : une recette par copie figée, plutôt qu'un contrôle réel
  après chaque ticket interne ; G3 avant la phase Mémoire.
- Précédents : T233 (recette TV et VPS) et T274 (copie A).

## Périmètre

- À modifier : rien dans le dépôt, hors journal de ce ticket. La boucle ne lance pas ce ticket : il attend une
  décision.
- Hors boucle, par l'orchestrateur, sur le Mac, boucle arrêtée, depuis le dernier commit intégré :
  1. une vidéo convertie (T262) ou un extrait du propriétaire, avec sa langue de transcription déclarée ;
  2. une campagne de trente minutes par T259 : perception locale, questions au calendrier, rôles locaux tenables
     sur le Mac (configuration consignée ; la configuration complète est celle du GX10) ;
  3. le bilan de T261 : révisions, pertes par voie, couverture de toute la campagne ;
  4. les commandes hors ligne du guide de T260, puis le tag de la copie B ;
  5. consigner le résultat dans le journal de ce ticket et dans `experiments/essais/` ; un écart devient un
     ticket correctif ; ce ticket reste à faire jusqu'à sa correction. Concluant : statut `termine`, commit de ce
     seul fichier.

## Critères d'acceptation

1. Tant que ce ticket est à faire, `node scripts/loop/run.mjs --dry-run` ne propose ni T268, ni T251, ni T256.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais.

## Hypothèses bloquantes

Décision attendue du propriétaire : la recette réelle de la copie B est-elle concluante ? Le propriétaire a décidé le 18/10
que l'orchestrateur fait cette recette et ferme ce ticket quand elle est concluante.

## Journal

