---
id: T228
titre: Hold the structural wave until the hackathon release is on main
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : il retient la file. Le 16/10, le propriétaire a choisi de livrer sur
`main`, pour les jurés du hackathon, la version de fin de vague 1, recettée à la main sur la TV et le Mac. Tant
que ce ticket n'est pas terminé, T205 attend : aucun ticket de la vague structurelle qui change le produit ne
démarre. La boucle finit la vague 1 et les tickets de tests seuls (T037, T038, T204, T222), puis s'arrête
d'elle-même, faute de ticket prêt. Le code est alors gelé pour la recette.

## Sources

- Décision du propriétaire, le 16/10 : livraison sur `main` en fin de vague 1, après une recette rapide sur la
  TV et le Mac ; le `README.md` de `main` ne change pas.
- `main` (`3d2e320`) est un ancêtre de `refactor/maintenabilite` : la livraison se fait en avance rapide.
- Les tickets structurels qui changent le produit dépendent tous de T205, directement ou non : T206 à T221 et
  T223 à T227. T037, T038, T204 et T222 n'ajoutent que des tests, des fixtures et une règle écrite.

## Périmètre

- À modifier : rien. Ce ticket n'est pas lancé par la boucle, puisqu'il attend une décision.
- Pour libérer la file, hors boucle :
  1. la boucle s'est arrêtée seule, faute de ticket prêt ; le dernier commit intégré est la version candidate ;
  2. le propriétaire déploie cette version sur la TV de test et le VPS, et fait la recette Mac et TV ;
  3. une branche de livraison part de ce commit, avec un seul commit qui remet `README.md` tel qu'il est sur
     `main` ; `main` avance jusqu'à elle en `--ff-only`, et n'est poussée qu'avec l'accord du propriétaire ;
  4. le statut de ce ticket passe à `termine`, et la boucle est relancée.

## Critères d'acceptation

1. Tant que ce ticket est à faire, `node scripts/loop/run.mjs --dry-run` ne propose ni T205 ni aucun ticket qui
   en dépend.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais. Le critère 1 se vérifie par la commande.

## Hypothèses bloquantes

Décision attendue du propriétaire : la version de fin de vague 1 est-elle recettée sur la TV et le Mac, et
livrée sur `main` ?

## Journal
