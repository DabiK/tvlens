---
id: T254
titre: Hold phase 2 until the GX10 experiment copy is frozen
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : il retient la phase 2 (Bibliothèque). Le 17/10, le propriétaire a choisi de
préparer d'abord l'expérience sur l'ASUS GX10 (accès la semaine du 19/10) ; le 18/10, la copie B est figée avant la
phase Mémoire. Tant que ce ticket n'est pas terminé, T250 et T235, les deux portes d'entrée de la phase 2, attendent :
la copie de l'expérience n'embarque aucune migration de la Bibliothèque en cours. Les tickets de préparation du GX10,
le harnais et le message de quota passent pendant ce temps.

## Sources

- Décision du propriétaire, le 17/10 : préparer le GX10 avant la phase 2 ; copie de l'expérience prise après T227,
  répétée sur le Mac avant l'accès, `hackathon-rc` gardé en repli pour la démonstration.
- Analyse d'Astra du 17/10 (commit `beb9589`) : la file prend le plus petit numéro prêt, donc la phase 2 démarrerait
  avant les tickets du GX10 sans retenue.
- Les tickets de la phase 2 dépendent tous de T250 ou de T235, directement ou non.

## Périmètre

- À modifier : rien. Ce ticket n'est pas lancé par la boucle, puisqu'il attend une décision.
- Hors boucle, par l'orchestrateur, quand la recette de la copie B (T280) est concluante : consigner son tag dans le
  journal de ce ticket. La phase 2 ne reprend pas pour autant : sa reprise se décide avec le propriétaire, lors de la
  réécriture de la feuille de route en parcours produit. Ce ticket passe à `termine` sur cette décision seulement.

## Critères d'acceptation

1. Tant que ce ticket est à faire, `node scripts/loop/run.mjs --dry-run` ne propose ni T250, ni T235, ni aucun ticket
   qui en dépend.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais. Le critère 1 se vérifie par la commande.

## Hypothèses bloquantes

Décision attendue du propriétaire : la copie B de l'expérience GX10 est-elle figée, et la reprise de la phase 2
(Bibliothèque) est-elle retenue dans la feuille de route en parcours produit ? Le propriétaire a décidé le 18/10 que
cette reprise se décide avec lui, après la copie B, et non à la seule pose du tag.

## Journal
- 18/10, propriétaire, sur l'avis d'Astra : gel de la copie B avant la phase Mémoire ; la reprise de la phase 2
  se décide avec le propriétaire, pas à la pose du tag.
- 18/10, orchestrateur : copie B figée et recettée (T280), tag `gx10-copie-b`. La phase 2 reste retenue : sa reprise
  attend la décision du propriétaire avec la feuille de route en parcours produit.
