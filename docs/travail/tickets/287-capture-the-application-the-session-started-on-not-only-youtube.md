---
id: T287
titre: Capture the application the session started on, not only YouTube
statut: termine
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

- 19/10, Codex — Cadrage : règles, skills, code de capture/contrôle/vue, tests et ADR concernés lus. `git status --short` et `git diff` : seul le statut du ticket est modifié, avec deux dossiers préexistants non suivis ; aucun échec antérieur. Exploration et écarts consignés dans `.harness-state/tickets/T287/`.
- 19/10, Codex — Capture, tests d’abord : `python3 -B -m unittest discover -s tests -p test_tv_capture.py -k test_lg_player_capture -v` rouge (0 bloc envoyé, deux `foreignApp`), puis vert (un test). Même commande avec `-k test_application_changed_or_disconnected` rouge sur les compteurs et causes, puis vert après garde après prise (un test, quatre scénarios). La simulation « MAIN absente » a été corrigée en `video:[]` ; son premier faux `{}` était une réponse mal formée, sorties conservées.
- 19/10, Codex — Inactivité : même commande avec `-k test_idle_timeout` rouge sur les messages attendus, puis `python3 -B -m unittest discover -s tests -p test_tv_capture.py -v` vert : 22 tests en 30,389 s. Lecteur LG, YouTube → lecteur → YouTube, Netflix, sélection MAIN connectée, délais pilotés et format des médias vérifiés. Sorties dans `.harness-state/tickets/T287/`.
- 19/10, Codex — Page : `node --test --test-name-pattern='capture idle label|active capture names' tests/tv-panel.test.cjs` rouge (deux assertions de libellé), puis `node --test tests/tv-panel.test.cjs` vert : 21 tests. Documentation actualisée, preuves matérielles historiques distinguées des simulations ; aucun essai TV ni fournisseur réel.
- 19/10, Codex — `node scripts/check.mjs --changed` vert, puis `node scripts/check.mjs` **rouge** : règles, format, lint, gel et cliquet verts ; 54 tests Python réussis en 47,270 s ; 2 902/2 903 tests JS réussis. Échec : `shared composition delivers each passage version while failed subscribers leave both lanes and saves running`, dans `tests/session-events.test.cjs:104` (inchangé). Le contrôle ne publie pas le détail de cette assertion. Bilan conservé dans `check-full.log` du dossier d’état.
- 19/10, Codex — Diagnostic de l’échec global : `node --test --test-name-pattern='shared composition delivers each passage version' tests/session-events.test.cjs` vert (1 test) ; `node --test tests/session-events.test.cjs` vert (28 tests) ; protocole fixé de 30 exécutions ciblées : 30 succès, échec initial non reproduit et cause indéterminée. Aucun changement de ce test ou du runtime/core. Le contrôle complet reste rouge, sans relance pour obtenir un vert.
- 19/10, Codex — Dernier `node scripts/check.mjs --changed` vert (21 tests JS) ; `git diff --check` sans erreur. Verdict **PARTIEL** écrit dans `.harness-state/tickets/T287/verdict.json` : implémentation et preuves ciblées livrées, critère 5 manquant à cause de l’échec global non expliqué. Aucun commit, push ni essai réel ; fichiers préexistants préservés.
- 19/10, Codex — Reprise après `echec-1.txt` : journal, écarts, diff et preuves relus. Diagnostic de l’ordre des lectures média dans `session-events` préparé dans le dossier d’état, sans modification hors périmètre. Aucun sous-agent, commit, push ni essai réel.
- 19/10, Codex — Diagnostic maîtrisé : `node --require ./.harness-state/tickets/T287/reproduce-lane-order.cjs --test --test-name-pattern='shared composition delivers each passage version' tests/session-events.test.cjs` rouge sur l’ordre global des appels (ligne 136). Proposition de six lignes, assertions intactes, compilée en mémoire avec `verify-proposed-session-events.cjs` : verte sous la même inversion des lectures. Exception de périmètre demandée avant application ; sorties conservées dans le dossier d’état.
- 19/10, Codex — Vérifications de reprise : `python3 -B -m unittest discover -s tests -p test_tv_capture.py -v` vert (22 tests en 30,463 s) ; `node --test tests/tv-panel.test.cjs` vert (21 tests) ; proposition en mémoire : `node --test .harness-state/tickets/T287/verify-proposed-session-events.cjs` vert (28 tests). `node scripts/check.mjs --changed` vert ; `git diff --check` sans erreur. Contrôle complet non relancé avant correction de l’instabilité : son dernier résultat reste rouge. Verdict **BLOQUÉ** sur la seule décision d’exception de périmètre, correction prête et non appliquée.
- 19/10, orchestrateur, propriétaire absent : décision sur le blocage. La correction de `tests/session-events.test.cjs`
  entre dans ce ticket : l'ordre des appels audio et vision entre deux passages n'est garanti ni par le produit
  (`core/memory/lanes.cjs:179-183`, lectures média en parallèle) ni par les ADR 0003 et 0050. La barrière fixe
  l'entrelacement que le scénario pilote déjà ; aucune assertion n'est retirée ni élargie ; l'ordre garanti reste
  vérifié par `tests/split-perception.test.cjs:170`. `scripts/smoke-tv-overlay.mjs`, relevé par la relecture, entre
  aussi.
- 19/10, orchestrateur : correction appliquée. `node --require ./.harness-state/tickets/T287/reproduce-lane-order.cjs
  --test --test-name-pattern='shared composition delivers each passage version' tests/session-events.test.cjs` : rouge
  sans la barrière (ordre réel audio 1, audio 2, vision 1, vision 2), vert avec ; `node --test
  tests/session-events.test.cjs` : 28 tests réussis. `node scripts/check.mjs` : vert, 2 903 tests JS sur 2 903 et
  54 tests Python.
- 19/10, relecture (agent relecteur) : à corriger, un bloquant et deux mineurs, corrigés. Le smoke du panneau attendait
  « sans lecture YouTube » : rapport simulé avec l'application suivie et texte « sans lecture de YouTube ». Le
  commentaire de `tv/controller.py` a retrouvé sa raison. Ensuite : `node scripts/smoke-tv-overlay.mjs` réussi ;
  `node scripts/check.mjs --changed` vert, 49 tests JS ; tests Python : 54 réussis.
- 19/10, orchestrateur : intégré hors boucle, qui refuse de démarrer sur un arbre modifié ; T290 fermé par ce commit.

### Réserves à la clôture

- `docs/lg-capture-control.md:34` dit encore « tant que … le contexte YouTube reste compatible » : la phrase parle de
  l'ouverture du panneau, élargie par T286. À reprendre au ménage de la documentation.
- `tests/fixtures/tv-capture-refusals.json` ne porte pas le champ `application` du rapport réel ;
  `tests/test_tv_capture.py:313` le complète. Fixture et rapport divergent.
- La cause exacte de l'échec du 19/10 à 01:43 reste une inférence : le contrôle complet n'a gardé que le titre du test.
