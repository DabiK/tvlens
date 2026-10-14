---
id: T151
titre: Prove the TV panel end to end against the real server fed with TV-shaped capture blocks
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Aujourd'hui, rien ne prouve sans la télé que des captures envoyées par la TV deviennent des passages, une
frise et des réponses dans le panneau TV. Chaque smoke en prouve un morceau, mais aucun ne fait le trajet
entier. Après ce ticket, un script de `scripts/` fait ce trajet sur le Mac :
- il envoie au vrai serveur du dépôt des blocs au format de ceux de la TV ;
- il ouvre la vraie page du panneau dans Chrome sans fenêtre ;
- il la parcourt au clavier comme à la télécommande, jusqu'aux passages, à la frise, à une réponse et à la
  fin de session.

Aucun fournisseur réel n'est appelé et il ne touche pas à la télé. Le script échoue dès qu'une étape
manque. T152 le fera lancer par le contrôle complet, avec les autres smokes.

## Sources

- Décision du propriétaire, le 14/10 : pouvoir tester le code qui tourne sur la télé sans la télé, où qu'on
  soit, et l'automatiser. La capture d'écran et de son se trouve derrière des ports : elle se simule.
- Plan court : section « Plan court » de `docs/travail/tickets/INDEX.md`.
- Morceaux existants, à la version `f2cd5c1`. Tous les smokes passent ce jour-là. Leur durée, mesurée sur
  ce Mac, est indiquée entre parenthèses.
  - `scripts/smoke-tv-overlay.mjs`, partie 8 (l. 965-1030, 24 s pour tout le script). Elle compose
    `HeadlessRuntime` avec `smoke: true` et un agent de conversation scripté, puis `RemoteServer` sur un
    port éphémère de `127.0.0.1` et un dossier temporaire. La vraie page du panneau lui parle sans
    interception, sur une copie temporaire de `tv/app` sans `connection.js`. Seul le contrôleur local de la
    TV (`http://127.0.0.1:8788/**`) est remplacé par une réponse fixe. La session y reste vide : aucun bloc
    n'est envoyé.
  - `scripts/replay-lg-stream.cjs`, l. 49 et 166-177. Un bloc de la TV contient quatre captures PNG
    1280×720 prises à 2 s d'écart (fabriquées avec `sharp`) et 8 s de son WAV 48 kHz stéréo, en base64,
    avec `sessionId`, `sequence`, `startMs`, `endMs` et `crop`. L'envoi se fait par `POST /v1/session/start`,
    puis `GET /v1/session` et `POST /v1/segments`, comme `tv/transport.py`. Ce script utilise le vrai
    `RemoteMedia` (`adapters/remote-media.cjs`), qui assemble les blocs avec `ffmpeg`.
  - `tests/server-ingest-path.test.cjs` (l. 10-25) : la même composition en test, avec un assembleur
    simulé.
  - `scripts/smoke-lg-ui.mjs` et `scripts/smoke-tv-timeline.mjs` : les touches envoyées à la page (flèches,
    Entrée, Retour), la copie temporaire sans `connection.js`, le chemin de Chrome
    (`TVLENS_CHROME` ou celui de `/Applications`).
- Routes du serveur : `server/http.cjs` (l. 183 `/v1/session/start`, l. 220 `/v1/segments`).

## Périmètre

- À modifier :
  - créer `scripts/smoke-tv-end-to-end.mjs`. Il compose le serveur comme la partie 8 de
    `smoke-tv-overlay.mjs`, mais avec le vrai `RemoteMedia` (`ffmpeg` du PATH). Il fabrique trois blocs
    au format de `replay-lg-stream.cjs`, sans fichier d'entrée : les images par `sharp`, le son généré
    dans le script. Puis :
    1. il ouvre le panneau, avec pour seule interception celle du contrôleur local `127.0.0.1:8788` ;
    2. il démarre une session par `/v1/session/start` et envoie les blocs ;
    3. il parcourt la page au clavier ;
    4. il pose une question par la vue de conversation et attend la réponse scriptée ;
    5. il termine la session depuis le panneau.
    Chaque attente est bornée. À la fin, le script affiche une ligne `PASS:` qui liste ce qui est prouvé,
    et une ligne qui dit ce que le script ne prouve pas (voir le critère 1). Il supprime son dossier
    temporaire ;
  - `docs/validation.md` : un paragraphe qui décrit ce script et ses limites, à côté des autres smokes.
- À ne pas toucher :
  - `tv/app/`, `server/`, `runtime/`, `adapters/`, `core/`, `app/` : le script observe, il ne corrige rien.
    S'il révèle un défaut du produit, le ticket s'arrête BLOQUÉ, avec le défaut décrit et la sortie du
    script ;
  - les smokes existants et `tests/` ;
  - `package.json`. T152 lancera le script directement.
- Ce que le script ne fait jamais : lire `.env.local` ou `connection.js`, passer un drapeau `--live`,
  écouter ailleurs que sur `127.0.0.1`, lire une variable d'environnement autre que `TVLENS_CHROME`.

## Critères d'acceptation

1. `node scripts/smoke-tv-end-to-end.mjs` rend 0 en moins de 90 s. Sa ligne `PASS:` cite au moins :
   - trois blocs reçus par le serveur ;
   - trois passages prêts dans la vue du panneau ;
   - au moins une carte de la frise dont la vignette, servie par le serveur, est chargée (largeur
     naturelle non nulle) ;
   - la réponse scriptée affichée après la question posée par la page ;
   - la session terminée, puis listée par `/v1/sessions`.
   Sa ligne de limites cite : le moteur de navigateur de webOS, les codes réels des touches, l'affichage
   par-dessus la vidéo, la capture réelle de la TV (`tv/capture.py`) et son contrôleur local, remplacé
   par une réponse fixe.
   La sortie et la durée vont au journal.
2. Entre la page et le serveur, il n'y a pas d'interception. Le seul `route(` du script vise
   `127.0.0.1:8788` : `grep -n "route(" scripts/smoke-tv-end-to-end.mjs`, sortie dans le journal.
3. Deux mutations temporaires font échouer le script avec un message qui nomme l'étape manquante. La
   sortie rouge de chacune va au journal, puis la mutation est retirée :
   - dans `tv/app/timeline-view.js`, la frise ne dessine plus aucune carte ;
   - dans `server/http.cjs`, `/v1/segments` répond sans transmettre le bloc au runtime.
4. Sans `ffmpeg` dans le PATH, le script s'arrête en erreur avec un message qui le dit, sans afficher
   `PASS:`. Commande et sortie dans le journal.
5. `grep -nE "\.env\.local|--live|0\.0\.0\.0|process\.env" scripts/smoke-tv-end-to-end.mjs` ne rend que
   la lecture de `TVLENS_CHROME`. `git diff --stat` ne cite ni `tv/app/`, ni `server/`, ni `runtime/`, ni
   `adapters/`, ni `core/`, ni `app/`, ni `tests/`.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`scripts/smoke-tv-end-to-end.mjs`, frontière : HTTP réel entre la vraie page du panneau, dans Chrome sans
fenêtre, et le vrai serveur du dépôt en mode smoke. Les mutations du critère 3 prouvent qu'il voit une
panne de la page et une panne de l'ingestion.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **Un script de smoke, pas un test de `npm test`.** Il lui faut Chrome et `ffmpeg`, comme les autres
  smokes. T152 le fait lancer par le contrôle complet.
- **Le vrai `RemoteMedia`.** L'assemblage des captures et du son, et les vignettes qui en sortent, font
  partie du trajet de la TV. Un assembleur simulé, comme dans la partie 8, laisserait ce trajet sans
  preuve.
- **Le contrôleur local de la TV reste simulé.** Le vrai `tv/controller.py` est déjà exercé par
  `scripts/simulate-tv-ambient.mjs`. Le brancher ici ferait deux choses d'un coup.
- **Aucune affirmation sur le texte des passages.** En mode smoke, l'observation et la transcription sont
  simulées. Le script vérifie que les passages existent et s'affichent, pas ce qu'ils disent.

## Journal
