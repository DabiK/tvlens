---
id: T275
titre: Check the TV panel live on every YouTube layout
statut: termine
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
message de refus (T268). Ce ticket ne bloque aucun autre ticket : il se fait quand la TV est libre.

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

1. Ce ticket ne figure dans les bloqueurs d'aucun autre ticket ; il reste à faire tant que le contrôle n'est pas
   concluant.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais. Le critère 1 se vérifie par la commande.

## Hypothèses bloquantes

Décision attendue du propriétaire : le contrôle réel de T268 est-il concluant ? Le propriétaire a décidé le 18/10
que l'orchestrateur fait ce contrôle et ferme ce ticket quand il est concluant.

## Journal
- 18/10, propriétaire : ce contrôle ne bloque plus T224. Il se fait dès que T268 est intégré et que la TV est libre,
  sans arrêter la boucle.
- 18-19/10, orchestrateur : contrôle réel sur la TV, tag `recette-t268` (`4606dca`). Runtime entier sauvegardé
  (`TVLens-backups/tv-runtime-20261018-avant-recette-t268.tar`) puis déployé ; empreintes identiques au tag. Le
  répartiteur de touches en mémoire reste celui d'avant jusqu'au prochain redémarrage de la TV ; `panel.py` est relu à
  chaque appui.
  - Hors de YouTube (accueil) : une seule ligne `TVLENS_PANEL_PLAYBACK_REQUIRED` au journal, un seul message « TVLens :
    lance une vidéo YouTube pour ouvrir le panneau. » à l'écran ; vidéo de l'accueil, application et rectangle inchangés.
  - Vidéo 16:9 (3840×2160) : ouverte puis fermée une fois par le propriétaire à la télécommande, une fois par
    l'orchestrateur. Rectangle 2880×1620 en (0, 270), sidebar au premier plan ; fermeture : retour en 3840×2160,
    `restore` accepté, aucun processus restant.
  - Vidéo 4:3 (320×240, sortie 2880×2160 en x = 480) : ouverture en 2880×2160 en (0, 0) à côté de la sidebar. Le retour
    au rectangle d'origine n'a pas été observé : le propriétaire a quitté la vidéo pendant l'essai.
  - Écart visible, hors de `panel.py` : en 4:3, la bande noire que YouTube dessine à gauche de la vidéo (x < 480)
    reste au-dessus de la vidéo réduite et masque son sixième gauche ; la page de la sidebar est transparente à cet
    endroit. Observé une fois, sur une capture d'écran.
  - Incident : la première commande de coupure du son a été refusée par le firmware (`setMuted` inconnu) ; le son a
    joué environ 25 s au volume 10 avant `master/muteVolume {"mute":true}`.
  - Propriétaire, 19/10 : « considère le ticket comme étant OK ». Statut `termine` ; la bande du 4:3 se traite à part.
