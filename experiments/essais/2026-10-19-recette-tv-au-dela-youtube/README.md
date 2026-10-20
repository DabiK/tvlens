# Essai du 19/10/2026 — panneau et capture de la TV au-delà de YouTube

Contrôle T289, de 09:29 à 09:58, avec le propriétaire devant la TV : les tickets T285 à T288 tiennent-ils en réel ?
Le panneau attend la sidebar (T285) et s'ouvre sur toute application qui joue une vidéo (T286) ; la capture suit
l'application du début de session (T287) ; la vidéo réduite reste dans son rectangle (T288). Une exécution par cas.

## Question

Sur la vraie TV, le panneau s'ouvre-t-il et se referme-t-il sur YouTube 16:9, YouTube 4:3 et le lecteur de fichiers
de la TV, sans bande noire ni sidebar orpheline ? La capture suit-elle le lecteur, compte-t-elle un passage à
l'accueil comme une perte, et le refus sur l'accueil reste-t-il un seul message ?

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| Code | tag `recette-t289` (`e26ac28`) : runtime du panneau, `tv/capture.py`, `tv/controller.py`, `tv/app/sessions-view.js` |
| Serveur | VPS inchangé (release `recette-t233`) : protocole TV identique, seuls des libellés de la page changent |
| TV | LG 75QNED87T, webOS, écran 3840×2160 ; YouTube `youtube.leanback.v4`, lecteur `com.webos.app.mediadiscovery` |
| Sauvegardes | runtime, capture et contrôleur, page (sans `connection.js`) ; retour arrière `scripts/rollback.sh`, non utilisé |
| Déclenchement | panneau lancé comme le répartiteur de touches (`scripts/cycle.sh`), fermé par `closeByAppId` ; capture et question par le propriétaire depuis la sidebar |
| Vidéos | YouTube 16:9 choisie par le propriétaire ; « Me at the zoo » (4:3, lancée par l'orchestrateur, avec accord) ; film du disque dur |

## Résultats

| Cas | Avant | Panneau ouvert | Après fermeture |
| --- | --- | --- | --- |
| YouTube 16:9 | 3840×2160 | 2880×1620 en (0, 270), sidebar au premier plan | 3840×2160 |
| YouTube 4:3 | 2880×2160 en x = 480 | 2400×1800 en (480, 180), vidéo entière visible | 2880×2160 en x = 480 |
| Lecteur de la TV | 3840×2080 en y = 40 | 2880×1560 en (0, 300), panneau resté ouvert | 3840×2080 en y = 40 |
| Accueil | aucune vidéo | refus `TVLENS_PANEL_PLAYBACK_REQUIRED`, un message | inchangé |

Capture sur le lecteur (`brut/4-capture-suivi.txt`, `brut/5-capture-accueil.txt`) : application suivie « lecteur de
la TV », 49 blocs envoyés et 198 images en sept minutes, aucune perte ; une question du propriétaire, réponse jugée
juste par lui. Retour à l'accueil pendant la capture : `foreignApp: 1`, l'application suivie ne change pas, l'accueil
n'est pas analysé. Message sur l'accueil : « TVLens : lance une vidéo pour ouvrir le panneau. »

## Lecture

- **Les trois défauts trouvés le 18-19/10 sont corrigés en réel** : la bande noire du 4:3 a disparu, la sidebar lente
  du lecteur ne referme plus le panneau, et le message ne nomme plus YouTube.
- **TVLens fonctionne hors de YouTube** sur une vidéo sans protection : panneau, capture, question.
- Le retour au rectangle d'origine du 4:3, non observé la veille, est vu.

## Limites et incidents

- Une exécution par cas ; aucune application protégée (Netflix) essayée : son son reste à sonder.
- Non observés : l'étiquette d'inactivité nommant l'application (dix minutes, couverte par les tests) et une sortie
  à coordonnées impaires (réserve de T288).
- La mise en pause de la vidéo 4:3 par `com.webos.media/pause` a été refusée ; le cycle a tenu dans ses 19 s.
- La page de la TV vient du tag, le serveur du VPS d'une release plus ancienne : compatibles ici, à aligner au prochain
  déploiement du serveur.
