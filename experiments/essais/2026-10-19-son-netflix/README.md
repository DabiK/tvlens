# Essai du 19/10/2026 — image et son de Netflix sur la TV

Sonde de 12:25 à 12:27, en lecture seule, sur une vidéo Netflix lancée par le propriétaire : l'analyse en audio seul
de Netflix est-elle possible ? Aucune action sur l'écran ni sur la lecture. Une exécution.

## Question

La capture d'écran de la TV est-elle noire sur Netflix, et l'enregistrement du son (`arecord -D hw:0,13`, celui de
`tv/capture.py`) est-il muet ?

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| TV | LG 75QNED87T, webOS ; application `netflix`, vidéo 1920×1080 en plein écran, en lecture |
| Capture d'écran | `com.webos.service.capture/executeOneShot`, méthode `DISPLAY`, 1280×720, deux prises |
| Son | `arecord -D hw:0,13`, 48 kHz, stéréo, 16 bits : 3 s puis 8 s ; niveaux par tranche de 0,5 s |
| Comparaison | YouTube −18,2 dBFS et lecteur de la TV −22,7 dBFS sur 3 s (essai du matin) |

## Résultats

- Capture d'écran : 100 % de pixels noirs sur les deux prises (luminance moyenne 0,0 et 0,7).
- Son, 3 s : −44,4 dBFS, crête 2 831. Son, 8 s, par tranche de 0,5 s : fond vers −62 dBFS, puis −38,9, −33,9,
  −29,3 et −30,0 dBFS entre 4,5 et 6 s ; crête 5 376 ; 3 982 passages par zéro par seconde.

## Lecture

- **L'image de Netflix est protégée** : la capture rend du noir, comme prévu par `docs/lg-piccap-exploration.md`.
- **Le son n'est pas coupé** : il a la dynamique d'un vrai programme (calme puis passages forts), à un niveau plus
  bas que YouTube, ce qui est attendu d'un mixage Netflix. L'analyse en audio seul est faisable ; une normalisation
  du niveau avant la transcription sera probablement utile.

## Limites

- Huit secondes, un seul programme ; le contenu du son (paroles ou musique) n'est pas vérifié par une transcription,
  pour ne pas lancer de modèle pendant un contrôle de la boucle.
- Le panneau n'a pas été ouvert sur Netflix : la réduction de sa vidéo et la poursuite de la lecture restent à voir.
