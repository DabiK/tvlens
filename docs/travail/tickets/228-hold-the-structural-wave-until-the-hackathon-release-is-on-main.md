---
id: T228
titre: Hold the structural wave until the hackathon release is on main
statut: termine
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : il marque la fin de la vague 1. Le 16/10, le propriétaire a choisi de
recetter sur la TV et le Mac la version de fin de vague 1, à partir d'un tag, puis de la livrer sur `main` pour
les jurés du hackathon. Tant que ce ticket n'est pas terminé, T205 attend : aucun ticket structurel qui change le
produit ne démarre. La boucle finit la vague 1 et les tickets de tests seuls (T037, T038, T204, T222), puis
s'arrête d'elle-même, faute de ticket prêt. Le code de ce moment reçoit le tag. **La boucle n'attend pas la
recette** : ce ticket est terminé dès le tag posé, et la boucle repart.

## Sources

- Décision du propriétaire, le 16/10 : tag en fin de vague 1, recette au réveil à partir du tag, puis fusion du
  tag sur `main` ; correctifs éventuels sur `main`, puis ramenés sur la branche de travail ; le `README.md` de
  `main` ne change pas.
- `main` (`3d2e320`) est un ancêtre de `refactor/maintenabilite` : la livraison se fait en avance rapide.
- Les tickets structurels qui changent le produit dépendent tous de T205, directement ou non : T206 à T221 et
  T223 à T227. T037, T038, T204 et T222 n'ajoutent que des tests, des fixtures et une règle écrite.

## Périmètre

- À modifier : rien. Ce ticket n'est pas lancé par la boucle, puisqu'il attend une décision.
- Hors boucle, quand elle s'est arrêtée seule faute de ticket prêt :
  1. l'orchestrateur pose le tag annoté `hackathon-rc` sur le dernier commit intégré, et le pousse ;
  2. il passe le statut de ce ticket à `termine`, committe ce seul fichier, et relance la boucle ;
  3. le propriétaire recette le tag sur la TV, le VPS et le Mac ; si tout est bon, `main` avance jusqu'au tag en
     `--ff-only`, plus un commit qui remet `README.md` tel qu'il est sur `main`, poussé avec son accord ;
  4. un correctif éventuel se fait sur `main`, puis `main` est fusionnée dans `refactor/maintenabilite` entre deux
     tickets, sans réécrire l'historique de la branche de travail.

## Critères d'acceptation

1. Tant que ce ticket est à faire, `node scripts/loop/run.mjs --dry-run` ne propose ni T205 ni aucun ticket qui
   en dépend.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais. Le critère 1 se vérifie par la commande.

## Hypothèses bloquantes

Décision attendue du propriétaire : le tag `hackathon-rc` est-il posé sur la fin de la vague 1 ? Le
propriétaire a décidé le 16/10 que l'orchestrateur ferme ce ticket dès que le tag est posé.

## Journal

- 17/10, 07 h 47, orchestrateur : la boucle s’est arrêtée seule, aucun ticket prêt. Vague 1 et tests seuls (T037,
  T038, T204, T222) terminés, aucun ticket structurel lancé, arbre propre. Tag annoté `hackathon-rc` posé sur
  `633e6d8` et poussé. Ticket fermé selon la décision du 16/10 ; la boucle repart sur T205. La recette TV et Mac
  se fait à partir du tag, sans retenir la boucle.
