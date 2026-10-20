# Essai du 19/10/2026 — panneau et capture sur une autre application que YouTube

Sonde de 00:13 à 00:16, à la demande du propriétaire : la limite à YouTube du panneau et de la capture est-elle
écrite dans le code ou imposée par la TV ? Le propriétaire a lancé lui-même une vidéo du disque dur ; l'orchestrateur
n'a changé ni d'application ni de vidéo. Une exécution : aucune statistique.

## Question

Sur une autre application, la TV décrit-elle la vidéo, laisse-t-elle la réduire, la capture d'écran et le son
sont-ils exploitables, et le panneau de T268 tient-il une fois sa garde YouTube levée ?

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| TV | LG 75QNED87T, webOS ; runtime du panneau au tag `recette-t268` |
| Application | lecteur de fichiers LG `com.webos.app.mediadiscovery`, film depuis un disque dur, source 1920×1040 |
| Base de comparaison | YouTube, vidéo 1920×1080 regardée par le propriétaire, relevé en lecture seule |
| Panneau | `scripts/sonde-panel.py` : le `panel.py` déployé, importé tel quel, sans sa seule garde d'application |
| Relevés | `getStatus`, fenêtres au premier plan, `executeOneShot` 1280×720, `arecord -D hw:0,13` 3 s ; `scripts/analyse.py` |

## Résultats

| Point | Lecteur LG | YouTube (base) |
| --- | --- | --- |
| Vidéo décrite par la TV | `MAIN` connectée, 3840×2080 en y = 40 | `MAIN` connectée, 3840×2160 |
| Capture d'écran | lisible (luminance moyenne 41 sur un générique) | lisible (85) |
| Son | présent, −22,7 dBFS | présent, −18,2 dBFS |
| Réduction `setDisplayWindow` | acceptée : 2880×1560 en (0, 300), rapport gardé, lecture continue | (contrôle T275) |
| Panneau | refermé seul ; sidebar orpheline au second essai | (contrôle T275) |

Relevé fin du second essai (`brut/disque-detail.txt`) : la réduction s'applique en moins d'une seconde, la fenêtre de
la sidebar n'apparaît qu'environ 2,5 s après le lancement ; le contrôleur, qui la cherche au bout d'une seconde,
s'était déjà arrêté et avait rendu le plein écran. La sidebar restait ouverte au-dessus du film ; l'orchestrateur l'a
fermée.

## Lecture

- **La limite à YouTube est dans le code** (`panel.py`, `tv/capture.py`), pas dans la TV : sur une vidéo sans
  protection, image, son et réduction fonctionnent.
- **Le panneau a un défaut de délai indépendant de l'application** : une sidebar lente à s'afficher est prise pour une
  sidebar fermée. Ticket T285.
- Suites décidées le 19/10 : T285 à T288, contrôle réel T289 ; Netflix, dont l'image est probablement protégée,
  passera par une sonde du son avant tout chantier « audio seul ».

## Limites et incidents

- Une seule application sans protection ; aucune application protégée sondée.
- Le premier essai a aussi échoué (fermeture refusée, « app is not running ») ; une capture d'écran prise juste après
  est entièrement noire, sur un fondu du générique probablement : non conclusif.
- La sidebar laissée ouverte par le second essai est restée environ 30 s au-dessus du film du propriétaire.
