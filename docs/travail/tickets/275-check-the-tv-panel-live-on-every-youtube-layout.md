---
id: T275
titre: Check the TV panel live on every YouTube layout
statut: a-faire
bloque_par: T268
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : c'est un point de contrôle réel, sur la TV, jamais pendant que le
propriétaire regarde. Les tests du dépôt simulent les modèles et les appareils ; avant de construire la suite
dessus, l'orchestrateur vérifie en réel l'ouverture du panneau de la TV sur toute disposition YouTube, et son
message de refus (T268). Tant que ce ticket n'est pas terminé, T224 attend.

## Sources

- Décision du propriétaire, le 18/10 : « je veux un test sur le Mac pour chaque ticket critique ». Un ticket est
  critique quand son comportement dépend d'un modèle, d'un outil ou d'un appareil réel que les tests simulent.
- Précédent : T233, point de contrôle réel fermé le 18/10 par l'orchestrateur.
- T268, « Périmètre » : déploiement et essais réels par l'orchestrateur, après intégration.
- Recette T233 du 18/10 : panneau refusé sur une vidéo de 1668×1080, sans aucun retour visible.

## Périmètre

- À modifier : rien dans le dépôt, hors journal de ce ticket. La boucle ne lance pas ce ticket : il attend une
  décision.
- Hors boucle, par l'orchestrateur, sur la TV, jamais pendant que le propriétaire regarde, depuis le dernier commit intégré :
  1. poser un tag, déployer `prototypes/lg-remote/runtime` vers `/media/developer/tvlens-remote/runtime`, avec
     sauvegarde et retour arrière prêt ;
  2. ouvrir puis fermer le panneau sur une vidéo 16:9, puis sur une vidéo d'un autre format : la vidéo retrouve son
     rectangle précédent ;
  3. appuyer hors de YouTube : le message s'affiche une fois, et rien d'autre ne change ;
  4. écrire le résultat dans le journal de ce ticket, avec le commit exercé et les chiffres relevés. Un écart devient
     un ticket correctif sans bloqueur ; ce ticket reste à faire jusqu'à ce que le correctif soit intégré et le
     contrôle refait. Quand le contrôle est concluant : statut `termine`, commit de ce seul fichier, boucle relancée.

## Critères d'acceptation

1. Tant que ce ticket est à faire, `node scripts/loop/run.mjs --dry-run` ne propose ni T224 ni aucun ticket
   qui en dépend.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais. Le critère 1 se vérifie par la commande.

## Hypothèses bloquantes

Décision attendue du propriétaire : le contrôle réel de T268 est-il concluant ? Le propriétaire a décidé le 18/10
que l'orchestrateur fait ce contrôle et ferme ce ticket quand il est concluant.

## Journal
- 18/10, propriétaire : ce contrôle ne bloque plus T224. Il se fait dès que T268 est intégré et que la TV est libre,
  sans arrêter la boucle.
