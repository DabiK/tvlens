---
id: T289
titre: Check the TV panel and capture live beyond YouTube
statut: a-faire
bloque_par: T287, T288
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : c'est un point de contrôle réel, sur la TV, jamais pendant que le
propriétaire regarde. Avant de s'appuyer dessus, l'orchestrateur vérifie en réel le panneau et la capture au-delà de
YouTube (T285 à T288). Ce ticket ne bloque aucun autre ticket.

## Sources

- Décision du propriétaire, le 18/10 : un contrôle réel suit chaque ticket critique.
- Contrôle T275 et sonde du 19/10 (dossier d'essai `2026-10-18-panneau-tv`) : sidebar lente sur le lecteur LG, bande
  noire de YouTube sur le 4:3.
- Consigne du propriétaire, le 19/10 : l'orchestrateur ne change pas le flux de la TV ; le propriétaire lance lui-même
  les vidéos d'une autre application.

## Périmètre

- À modifier : rien dans le dépôt, hors journal de ce ticket. La boucle ne lance pas ce ticket : il attend une
  décision.
- Hors boucle, par l'orchestrateur, depuis le dernier commit intégré, son coupé avant toute vidéo lancée par lui :
  1. poser un tag ; déployer `prototypes/lg-remote/runtime` et les fichiers modifiés de `tv/` (capture, page) depuis
     ce tag, avec sauvegarde et retour arrière prêt, sans toucher aux fichiers d'appairage ;
  2. panneau : YouTube 16:9 (non-régression), YouTube 4:3 d'au moins une minute (plus de bande, retour au rectangle
     d'origine observé), lecteur LG lancé par le propriétaire (le panneau reste ouvert, puis se ferme en rendant la
     vidéo), accueil (un seul message) ;
  3. capture : une capture courte sur le lecteur LG, blocs acceptés avec images ; un passage à l'accueil pendant la
     capture est compté `foreignApp` ; l'étiquette nomme l'application suivie ;
  4. écrire le résultat dans le journal de ce ticket et dans `experiments/essais/`. Un écart devient un ticket
     correctif sans bloqueur ; ce ticket reste à faire jusqu'à ce que le correctif soit intégré et le contrôle refait.
     Quand le contrôle est concluant : statut `termine`, commit de ce seul fichier.

## Critères d'acceptation

1. Ce ticket ne figure dans les bloqueurs d'aucun autre ticket ; il reste à faire tant que le contrôle n'est pas
   concluant.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais. Le critère 1 se vérifie par la commande.

## Hypothèses bloquantes

Décision attendue du propriétaire : le contrôle réel de T285 à T288 est-il concluant ? Le propriétaire a décidé le 18/10
que l'orchestrateur fait ces contrôles et ferme le ticket quand il est concluant.

## Journal
