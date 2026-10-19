---
id: T302
titre: Check sound-only analysis live on Netflix
statut: a-faire
bloque_par: T300, T301, T303, T306
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : c'est le contrôle réel du chantier « son seul » (T297 à T301), sur la TV et
le VPS, avec le propriétaire, qui lance lui-même Netflix. Ce ticket ne bloque aucun autre ticket.

## Sources

- Décision du propriétaire, le 18/10 : un contrôle réel suit chaque ticket critique ; le 19/10 : chantier « son seul ».
- Sonde du 19/10 (dossier d'essai `2026-10-19-son-netflix`).

## Périmètre

- À modifier : rien dans le dépôt, hors journal de ce ticket. La boucle ne lance pas ce ticket : il attend une
  décision.
- Hors boucle, par l'orchestrateur, depuis le dernier commit intégré :
  1. poser un tag ; déployer sur le VPS une release figée depuis ce tag (le serveur doit accepter le son seul), avec
     sauvegarde et retour arrière par le drop-in ; puis les fichiers modifiés de `tv/` sur la TV, avec sauvegarde ;
  2. Netflix lancé par le propriétaire : une capture de deux minutes ; les blocs partent en son seul ; les passages
     sont transcrits et marqués son seul ; une question reçoit une réponse fondée sur les paroles ;
  3. YouTube ensuite : retour aux images, sans régression ;
  4. résultat au journal et dans `experiments/essais/` ; un écart devient un ticket correctif sans bloqueur. Quand
     c'est concluant : statut `termine`, commit de ce seul fichier.

## Critères d'acceptation

1. Ce ticket ne figure dans les bloqueurs d'aucun autre ticket.
2. La file des tickets reste valide (fonction `validate` de `scripts/loop/tickets.mjs`).

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais.

## Hypothèses bloquantes

Décision attendue du propriétaire : le contrôle réel du son seul sur Netflix est-il concluant ? Le propriétaire a
décidé le 18/10 que l'orchestrateur fait ces contrôles et ferme le ticket quand il est concluant.

## Journal
