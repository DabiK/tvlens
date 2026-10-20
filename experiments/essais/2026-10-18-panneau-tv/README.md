# Essai du 18-19/10/2026 — panneau de la TV sur une vidéo 16:9, une vidéo 4:3 et hors de YouTube

Contrôle réel de T268 (ticket de contrôle T275), du 18/10 à 23:56 au 19/10 à 00:03. Le panneau s'ouvre-t-il sur
toute disposition YouTube, la vidéo retrouve-t-elle son rectangle à la fermeture, et un appui hors de YouTube
affiche-t-il un message au lieu de rien ? Une exécution par cas : aucune statistique.

## Question

Sur la vraie TV, le `panel.py` de T268 accepte-t-il une vidéo plein écran et une vidéo à bandes noires, restaure-t-il
le rectangle d'origine, et nomme-t-il une seule fois la cause d'un refus sans rien changer d'autre ?

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| Code | tag `recette-t268` (`4606dca`), répertoire `prototypes/lg-remote/runtime` déployé en entier |
| TV | LG 75QNED87T, webOS, écran physique 3840×2160 ; application YouTube `youtube.leanback.v4` |
| Sauvegarde | runtime de la TV archivé avant déploiement ; retour arrière `scripts/rollback.sh`, non utilisé |
| Déclenchement | comme le répartiteur de touches : `panel.py` lancé en processus séparé ; une fois à la télécommande par le propriétaire |
| Fermeture | `applicationManager/closeByAppId` sur la sidebar, équivalent de la touche Retour |
| Vidéos | Big Buck Bunny (16:9, source 3840×2160) ; « Me at the zoo » (4:3, source 320×240, 19 s) |
| Relevés | `videooutput/getStatus`, fenêtres au premier plan, état du panneau, capture `executeOneShot` 1280×720 |

## Résultats

| Cas | Avant | Panneau ouvert | Après fermeture | Verdict |
| --- | --- | --- | --- | --- |
| Hors de YouTube (accueil) | aperçu de l'accueil 1600×900 | refus `TVLENS_PANEL_PLAYBACK_REQUIRED`, un message | inchangé | conforme |
| 16:9, appui du propriétaire | 3840×2160 | ouvert (vu par le propriétaire) | 3840×2160, `restore` accepté | conforme |
| 16:9, orchestrateur | 3840×2160 en (0, 0) | 2880×1620 en (0, 270), sidebar au premier plan | 3840×2160, aucun processus restant | conforme |
| 4:3, orchestrateur | 2880×2160 en x = 480 | 2880×2160 en (0, 0), sidebar au premier plan | non observé : vidéo quittée | ouverture conforme |

Message affiché hors de YouTube : « TVLens : lance une vidéo YouTube pour ouvrir le panneau. » (capture
`brut/1-hors-youtube.jpg`), une seule ligne au journal du panneau.

## Lecture

- **Le défaut de la recette T233 est corrigé en réel** : une vidéo à bandes noires ouvre le panneau, et le refus hors
  de YouTube se voit à l'écran au lieu de ne rien faire.
- **La géométrie est juste** : le rectangle réduit garde le rapport de la source, et la fermeture rend le rectangle
  courant sauvegardé.
- **Écart visible, hors de `panel.py`** : en 4:3, la bande noire que YouTube dessine à gauche de la vidéo (x < 480)
  reste au-dessus de la vidéo réduite et en masque le sixième gauche (`brut/6-43-ouvert.jpg`). La page de la sidebar
  est transparente à cet endroit : la bande vient de l'interface de YouTube. Une piste : garder la vidéo réduite dans
  le rectangle d'origine. Observé une fois.
- **La limite à YouTube est écrite dans le code** (`panel.py`, `tv/capture.py`) ; la TV décrit aussi les vidéos de
  l'accueil et de la TV en direct. Une autre application reste à sonder : pause au premier plan, protection des images.

## Limites et incidents

- Une exécution par cas, sans annotation ; le retour au rectangle d'origine du 4:3 n'a pas été vu, le propriétaire
  ayant quitté la vidéo pendant l'essai. « Me at the zoo » dure 19 s : un premier essai a été perdu, YouTube ayant
  enchaîné sur une autre vidéo.
- **Incident de son** : la coupure `master/setMuted` n'existe pas sur ce firmware ; le son a joué environ 25 s au
  volume 10 avant `master/muteVolume {"mute":true}`. Le propriétaire, présent, a remis le son.
- **La TV n'était pas libre** : elle était allumée sur l'accueil, et le propriétaire était devant. Il a ouvert le
  panneau lui-même, puis a demandé de continuer.
- Le répartiteur de touches en mémoire reste celui d'avant le déploiement jusqu'au prochain redémarrage de la TV ;
  `panel.py`, relu à chaque appui, est bien celui du tag.
