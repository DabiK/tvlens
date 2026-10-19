---
id: T301
titre: Switch the TV capture to sound only when its images are black
statut: termine
bloque_par: T299
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Sur la TV, quand la vidéo suivie rend une image noire, la capture le voit et envoie ses blocs en « son seul »
déclaré au lieu de les perdre ou d'envoyer du noir. Après deux blocs noirs d'affilée, elle ne prend plus qu'une image
de contrôle par bloc, et revient aux images dès que la vidéo n'est plus noire. Netflix entre dans la table des
applications suivies. Le panneau dit « Son seul · image noire ou protégée ».

## Sources

- Décision du propriétaire, le 19/10 : « on peut assez facilement détecter le fait qu'une image est rendue toute
  noire, et de par ça et de par la fréquence […] on bascule en analyse du son ».
- Sonde du 19/10 à 12:25 (dossier d'essai `2026-10-19-son-netflix`) : sur Netflix, `executeOneShot` rend 100 % de
  pixels noirs (deux prises) ; `arecord -D hw:0,13` enregistre un son présent, fond vers −62 dBFS et passages forts
  jusqu'à −29 dBFS.
- Choix de l'orchestrateur, le 19/10, dans la règle du propriétaire :
  - détection sur une **image de contrôle** réduite (par exemple 160×90, méthode `DISPLAY`), entièrement décodée, et
    jugée seulement dans le **rectangle vidéo** (la sidebar ouverte n'est jamais noire) ; « noir » : aucune
    composante au-dessus d'un seuil nommé (par exemple 16 sur 255) ;
  - chaque bloc décide seul : toutes ses images noires, il part en son seul déclaré ; après deux blocs noirs
    d'affilée, une seule image de contrôle par bloc ; une image de contrôle non noire rend les quatre images au bloc
    suivant ;
  - la règle vaut pour toute application suivie : une scène noire de YouTube part aussi en son seul, ce qui est
    honnête ; le libellé dit « image noire ou protégée ».
- Code à `c35cd02`, `tv/capture.py` :
  - `VERIFIED_APPLICATIONS` (`:9-12`) : Netflix absent, compté `foreignApp` ;
  - précédent « N blocs d'affilée » : `LUNA_PATIENCE` (`:7`) et `mute` (`:103`, `:167-168`) ;
  - prise d'image `executeOneShot` (`:137`), méthode (`:47-48`), contrôle de géométrie (`:146-149`), image gardée
    (`:150-157`), refus d'un bloc sans image (`:169`, `noFrames` `:174`), bloc envoyé (`:180`), rapport (`:51-52`) ;
  - piège : le minuteur d'inactivité n'est remis à zéro que par une image gardée (`:102`, `:109`, `:151`) ; en son
    seul, la capture s'arrêterait en `idle` après 600 s ; `tv/controller.py:18-22`.
- Décodage sans dépendance : Python 3.10 sur la TV, `zlib` et `struct` suffisent ; un 160×90 se décode entièrement
  en Python pur en quelques dizaines de millisecondes (Paeth à 1,7 s pour un 1280×720 mesuré sur le Mac).
- `tv/app/sessions-view.js` : `DROP_LABELS` (`:223-240`), `describeCapture` (`:247-349`), `playback()` (`:46-50`).
- Tests : `tests/tv_fakes/luna-send` (le PNG simulé est un pixel bleu : il faut pouvoir écrire un PNG noir),
  `tests/test_tv_capture.py` (`assert_block_media` `:142-157`, `:273` ; clés exactes du rapport `:257-260` ;
  `:301` ; `:529` et `:550` prennent `'netflix'` comme application non vérifiée : changer d'identifiant),
  `tests/fixtures/tv-capture-refusals.json`, `tests/tv-panel.test.cjs:513-563`.
- Coordination : T022 (causes de perte déclarées une fois) passe après ce ticket et suit ses causes.

## Périmètre

- À modifier : `tv/capture.py` (le détecteur peut vivre dans un module voisin, par exemple `tv/blackness.py`),
  `tv/controller.py` (commentaire), `tv/app/sessions-view.js`, `tests/tv_fakes/luna-send`, `tests/test_tv_capture.py`,
  `tests/fixtures/tv-capture-refusals.json`, `tests/tv-panel.test.cjs`, `docs/lg-capture-control.md`.
- Bloc son seul : sans images, avec la déclaration du fil de T299, compté à part dans le rapport (`soundOnly`), pas
  dans `dropped`. Le minuteur d'inactivité compte aussi un bloc son seul envoyé.
- Table : `netflix` → « Netflix ».
- Panneau : « Son seul · image noire ou protégée » tant que la capture est en son seul.
- À ne pas toucher : le serveur, `core/`, `prototypes/lg-remote/`.
- Contrôle réel par l'orchestrateur après intégration : T302.

## Critères d'acceptation

1. Faux `luna-send` qui rend une image noire : les blocs partent en son seul déclaré, sans image, `soundOnly` compte ;
   après deux blocs, une seule image de contrôle par bloc ; une image de contrôle non noire rend quatre images au bloc
   suivant. Le test échoue avant la correction.
2. Sidebar ouverte (rectangle vidéo réduit) : seule la zone vidéo est jugée.
3. Netflix suivi ; une autre application non vérifiée reste `foreignApp`.
4. En son seul, la capture ne s'arrête pas en `idle` tant que des blocs partent.
5. Le libellé du panneau s'affiche en son seul.
6. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/test_tv_capture.py` : une capture qui passe du noir aux images et revient, par le faux `luna-send`.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, propriétaire : le chantier « son seul » (T297 à T302) passe en tête de file, après T225.
- 19/10, Codex : exploration consignée dans `.harness-state/tickets/T301/exploration.md` ;
  consignes, appelants, tests et ADR 0011/0041/0042/0062 lus. Aucun écart prévu (`ecarts.md`).
- 19/10, Codex : rouges observés puis verts pour la transition noir/images/noir,
  l'admission Netflix et le libellé du panneau. Commandes :
  `python3 -B -m unittest discover -s tests -p test_tv_capture.py -k test_black_blocks_send_declared_sound -v`,
  même commande avec `-k test_netflix_is_followed`,
  `node --test --test-name-pattern='active sound-only capture' tests/tv-panel.test.cjs`.
  Sorties conservées dans `.harness-state/tickets/T301/{transition,netflix,panel}-{red,green}.log`.
- 19/10, Codex : `python3 -B -m unittest discover -s tests -p test_tv_capture.py -k sound_only -v`
  passe (6 tests) ; `-k ControlBlackness` passe (4 tests). Sidebar, bloc mixte, refus de livraison,
  contrôles illisibles, PNG filtrés et seuil exact couverts. L'horloge pilotée confirme 32 s de
  capture son seul malgré une borne idle de 10 s, puis l'arrêt sur application étrangère.
  `node scripts/check.mjs --changed` : vert (22 tests JS). Ce mode ne lance pas les tests Python ;
  le contrôle complet reste à lancer.
- 19/10, Codex : déplacement d'un contrôle noir reproduit rouge avec
  `python3 -B -m unittest discover -s tests -p test_tv_capture.py -k test_one_moving_black_control -v`,
  puis corrigé : les contrôles stables restants gardent leur son. La commande avec `-k black_control`
  passe (2 tests), y compris les refus application, déconnexion, contexte et rectangle en cadence réduite.
  Sorties `moving-control-{red,green}.log` dans le dossier d'état. Documentation mise à jour ;
  aucun essai réel ni changement au serveur, au cœur ou au harnais.
- 19/10, Codex : le faux audio vérifie désormais le délai demandé à `wait`. Rouge observé avec
  `python3 -B -m unittest discover -s tests -p test_tv_capture.py -k test_sound_only_blocks_refresh -v` :
  arrêt `error` au troisième bloc, car un seul contrôle laissait huit secondes d'audio face à une attente
  maximale de cinq. Correction : attendre, avec l'événement d'arrêt, le créneau de la quatrième prise
  avant de rejoindre l'attente audio habituelle. Trace `audio-wait-red.log` dans le dossier d'état.
- 19/10, Codex : même commande ciblée verte après correction (`audio-wait-green.log`).
  `node scripts/check.mjs` : vert, 3 025 tests JS dans 154 fichiers, 68 tests Python,
  règles, format, lint, gel et cliquet verts. Trace complète :
  `.harness-state/tickets/T301/check-full.log`. Verdict `TERMINÉ` déposé pour la boucle ;
  contrôle réel réservé à T302 par le périmètre, aucun commit ni push.
- 19/10, Codex, reprise après relecture 1 : rapport, journal, écarts, état Git et diff relus.
  Les deux mineurs sont acceptés : effacer l'indicateur son seul sur perte locale et restituer
  la raison des bornes dans le commentaire du contrôleur. Aucun écart ni contestation prévu.
- 19/10, Codex, correction 1 :
  `python3 -B -m unittest discover -s tests -p test_tv_capture.py -k test_foreign_blocks_after_sound_only -v`
  rouge sur `soundOnlyActive` resté vrai, puis vert après sa remise à faux dans la branche de perte locale.
  Même commande avec `-k test_reduced_black_controls_still_refuse` : verte, avec la même assertion sur
  les pertes d'application, de connexion, de contexte et de rectangle. Traces
  `correction-1-mode-{red,green}.log` et `correction-1-refusals-green.log` dans le dossier d'état.
  Documentation du rapport précisée ; commentaire du contrôleur corrigé pour rappeler que les bornes
  empêchent un enregistreur permanent, son seul compris. `node scripts/check.mjs --changed` : vert,
  22 tests JS (`correction-1-check-changed.log`).
- 19/10, Codex, correction 1 : `node scripts/check.mjs` vert sur l'état corrigé : 3 025 tests JS
  dans 154 fichiers et 68 tests Python ; règles, format, lint, gel et cliquet verts.
  Trace `.harness-state/tickets/T301/correction-1-check-full.log` ; les deux mineurs sont corrigés,
  nouveau verdict `TERMINÉ` déposé pour la boucle. Aucun commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T301/relecture-2.md : 1. `tv/blackness.py:6-7`, `tv/capture.py:146-154` (hors périmètre, réserve de déploiement)
  - **Ce qui ne va pas.** C'est le constat 4 de la relecture 1, désormais confirmé sur la vraie TV par la sonde citée dans T306. `executeOneShot` `DISPLAY` refuse le PNG 160×90 (`ERROR_INTERNAL`). Installée telle quelle, cette version perdrait tous les blocs de toutes les applications en `captureFailed`, YouTube compris.
  - **Pourquoi pas bloquant.**
    - Le ticket proposait lui-même 160×90 comme exemple.
    - L'orchestrateur a ouvert T306 pour passer à un BMP 256×144. T306 est bloqué par T301, et le contrôle réel T302 est bloqué par T306.
    - L'installation sur la TV est manuelle.
  - **Attendu.** Ne pas installer la branche sur la TV entre l'intégration de T301 et celle de T306.
- .harness-state/tickets/T301/relecture-2.md : 2. `docs/lg-installation.md:22`, `:70-72` (hors périmètre, réserve reconduite)
  - **Ce qui ne va pas.** Ce document n'a pas changé depuis la relecture 1 (constat 3) :
    - le tableau d'installation ne cite toujours pas `blackness.py`, alors que `capture.py` l'importe ;
    - les lignes 70-72 ne parlent ni de Netflix ni du son seul.
  - **Attendu.** Le mettre à jour avant le déploiement de T302, ou dans T306.
- .harness-state/tickets/T301/relecture-2.md : 3. `tv/capture.py:43-234` (hors périmètre, réserve reconduite)
  - **Ce qui ne va pas.** `run()` dépasse toujours de loin 80 lignes et une complexité de 15. Python n'est pas vérifié par ESLint. C'est le constat 5 de la relecture 1.
  - **Attendu.** Un ticket de refactorisation qui sort la boucle de prise de `run()`.
