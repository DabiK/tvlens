---
id: T233
titre: Check the memory projection live on the TV before the contraction
statut: a-faire
bloque_par: T219
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : c'est un point de contrôle réel. Les tests du dépôt passent par des agents
simulés. Avant de retirer l'ancien chemin de publication de la Mémoire (T224, puis T225, T220, T226 et T227), la
projection servie par le serveur depuis T219 est exercée sur la vraie TV et le vrai VPS, avec de vrais fournisseurs.
Tant que ce ticket n'est pas terminé, T224 attend.

## Sources

- Décision du propriétaire, le 17/10 : la TV et le VPS sont à la disposition de l'orchestrateur pour installer et
  tester, YouTube restant allumé dans la journée.
- Risque relevé le 17/10 : la phase 1 rebranche ce que tous les contextes lisent (`docs/domaine.md`, sections 3 et 8),
  et seuls des agents simulés l'ont exercé.
- Procédure de déploiement : release figée sur le VPS, choisie par le drop-in de l'unité, et fichiers de la page et du
  compagnon copiés sur la TV, comme pour `hackathon-rc` le 17/10.

## Périmètre

- À modifier : rien dans le dépôt. Ce ticket n'est pas lancé par la boucle, puisqu'il attend une décision.
- Hors boucle, après l'intégration de T219, par l'orchestrateur :
  1. poser un tag sur le dernier commit intégré, le déployer sur le VPS (nouvelle release) et sur la TV (page et
     compagnon), avec sauvegarde et retour arrière prêt ; jamais pendant que le propriétaire regarde ;
  2. lancer une capture réelle d'environ dix minutes par le contrôleur de la TV ;
  3. vérifier : passages complets (transcription et description), sujets regroupés, frise et vues `chat` et `panel`
     servies sans erreur, une question avec citations, la surveillance activée qui produit une carte ou un relevé, la
     fin de session puis la réouverture de l'archive ;
  4. écrire le résultat dans le journal de ce ticket, avec le tag déployé ; un écart devient un ticket correctif, et
     ce ticket reste à faire tant qu'il n'est pas corrigé ;
  5. passer le statut à `termine` et committer ce seul fichier.

## Critères d'acceptation

1. Tant que ce ticket est à faire, `node scripts/loop/run.mjs --dry-run` ne propose ni T224 ni aucun ticket qui en
   dépend.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais. Le critère 1 se vérifie par la commande.

## Hypothèses bloquantes

Décision attendue du propriétaire : la projection de la Mémoire livrée par T219 est-elle vérifiée en réel sur la TV et
le VPS ? Le propriétaire a décidé le 17/10 que l'orchestrateur fait ce test et ferme ce ticket quand il est concluant.

## Journal
