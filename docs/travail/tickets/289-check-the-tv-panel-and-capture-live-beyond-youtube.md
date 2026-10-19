---
id: T289
titre: Check the TV panel and capture live beyond YouTube
statut: termine
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
- 19/10, orchestrateur : contrôle réel sur la TV, de 09:29 à 09:58, avec le propriétaire, tag `recette-t289`
  (`e26ac28`). Sauvegardes du runtime, de la capture et de la page dans `TVLens-backups` (`*-avant-recette-t289.tar`),
  retour arrière prêt, non utilisé. Déployés : `prototypes/lg-remote/runtime`, `tv/capture.py`, `tv/controller.py`,
  `tv/app/sessions-view.js` ; empreintes identiques au tag, fichier d'appairage intact, serveur du VPS inchangé.
  - YouTube 16:9 : ouverture en 2880×1620 en (0, 270), sidebar au premier plan ; fermeture en 3840×2160.
  - YouTube 4:3 (source 320×240, sortie 2880×2160 en x = 480) : ouverture en 2400×1800 en (480, 180), vidéo entière
    visible, plus de bande noire ; fermeture : retour en 2880×2160 en x = 480, observé.
  - Lecteur de la TV (vidéo du disque, sortie 3840×2080 en y = 40) : le panneau reste ouvert, 2880×1560 en (0, 300) ;
    fermeture : retour au rectangle d'origine.
  - Capture sur le lecteur, lancée par le propriétaire depuis la sidebar : application suivie « lecteur de la TV »,
    49 blocs envoyés, 198 images, aucune perte ; une question du propriétaire, réponse jugée juste. Retour à
    l'accueil pendant la capture : une perte `foreignApp`, application suivie inchangée.
  - Accueil : refus `TVLENS_PANEL_PLAYBACK_REQUIRED` (« No foreground playback application »), un seul message
    « TVLens : lance une vidéo pour ouvrir le panneau. », rien d'autre ne change.
  - Non observé : l'étiquette d'inactivité nommant l'application (dix minutes), couverte par les tests ; une sortie à
    coordonnées impaires (réserve de T288).
  - Concluant. Statut `termine`.
