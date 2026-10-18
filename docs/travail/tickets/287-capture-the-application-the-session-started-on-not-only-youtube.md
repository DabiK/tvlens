---
id: T287
titre: Capture the application the session started on, not only YouTube
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

La capture de la TV accepte d'autres applications que YouTube, à commencer par le lecteur de fichiers LG. Une capture
suit l'application qui jouait à son début : passer à une autre application est une perte comptée, jamais une analyse
de l'accueil ou d'un menu. Les messages nomment l'application suivie.

## Sources

- Décision du propriétaire, le 19/10 : lever la limite YouTube. Sur recommandation de l'orchestrateur, acceptée le même
  jour : la capture suit l'application qui jouait à son début, et une prise d'une autre application compte comme une
  perte `foreignApp`.
- Sonde du 19/10 à 00:15, lecteur de fichiers LG (`com.webos.app.mediadiscovery`) : `capture/executeOneShot` rend une
  image lisible (luminance moyenne 41 sur un générique), `arecord -D hw:0,13` enregistre un son présent (−22,7 dBFS sur
  3 s ; YouTube −18,2 dBFS).
- Non sondé : les applications protégées (Netflix, Prime, Disney+). `docs/lg-piccap-exploration.md:55` prévient que
  leurs images peuvent être refusées ou noires ; elles restent donc refusées par ce ticket.
- Code à `c2a35b0` :
  - `tv/capture.py:112` refuse toute prise hors de `youtube.leanback.v4` (`foreignApp`) ;
  - `tv/capture.py:25` message d'inactivité « sans lecture YouTube » ; `:92`, `:97-98`, `:123` minuteur `last_youtube` ;
  - `tv/controller.py:18`, commentaire « ten minutes without YouTube playback » ;
  - `tv/app/sessions-view.js:218` étiquette `foreignApp`, `:296-303` étiquette d'inactivité « sans lecture YouTube ».
- Tests : `tests/test_tv_capture.py` (`:297-308` Netflix compté `foreignApp`, `:322`, `:367`), faux `luna-send`
  `tests/tv_fakes/luna-send:16`, `tests/tv-panel.test.cjs:492` (étiquette d'inactivité) et `:515`.

## Périmètre

- À modifier : `tv/capture.py`, `tv/controller.py` (commentaire), `tv/app/sessions-view.js`,
  `tests/test_tv_capture.py`, `tests/tv-panel.test.cjs`, `tests/tv_fakes/luna-send` si besoin, et la documentation de
  `docs/` qui décrit la capture limitée à YouTube.
- Une table nommée dans `tv/capture.py` des applications dont la capture est vérifiée en réel :
  `youtube.leanback.v4` → « YouTube », `com.webos.app.mediadiscovery` → « lecteur de la TV ». Ajouter une application
  revient à ajouter une ligne après une sonde réelle.
- La capture suit la première application de cette table vue avec une vidéo `MAIN` connectée. Ensuite, toute prise
  d'une autre application, de la table ou non, est `foreignApp`, comptée comme aujourd'hui.
- Le rapport de capture publie l'application suivie : `application: {appId, name}`, `null` tant qu'aucune n'est
  suivie. Le minuteur d'inactivité compte les images de l'application suivie. Le message d'inactivité et l'étiquette de
  la page la nomment (« 10 min sans lecture de YouTube »), ou disent « sans lecture vidéo » tant qu'aucune n'est suivie.
- À ne pas toucher : le serveur, `core/`, le format des blocs envoyés, `prototypes/lg-remote/` (T285, T286, T288).
- Aucun essai réel dans la session : ni `luna-send`, ni la TV. Le contrôle réel est T289.

## Critères d'acceptation

1. Lecteur LG seul : blocs acceptés avec leurs images ; le rapport publie l'application suivie.
2. YouTube, puis le lecteur LG dans la même capture : les prises du lecteur sont `foreignApp` et comptées ;
   l'application suivie reste YouTube.
3. Netflix : `foreignApp`, comme aujourd'hui.
4. Inactivité : le message de capture et l'étiquette de la page nomment l'application suivie, ou disent « sans lecture
   vidéo » sans application suivie.
5. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/test_tv_capture.py`, par le faux `luna-send` : une capture sur le lecteur LG, puis une capture qui passe de
YouTube au lecteur, avec les causes de perte et le rapport relus.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, propriétaire : les tickets TV T285 à T288 passent avant T283, « de façon prioritaire ».
