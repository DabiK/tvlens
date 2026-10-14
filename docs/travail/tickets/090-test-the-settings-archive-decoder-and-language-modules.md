---
id: T090
titre: Test the settings, archive, decoder and language modules directly
statut: a-faire
bloque_par: T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Quatre petits modules n'ont aucun test qui les charge directement : les réglages de visionnage, l'archive
des vérifications, le lanceur du décodeur vidéo et la validation de la langue de transcription. Après ce
ticket, chacun a un test unitaire de son contrat (valeurs par défaut, refus, forme du fichier écrit, codes
d'erreur). Les lots qui déplaceront ces modules ou réécriront les hôtes ont alors un filet sous chacun.

Aucun code de production n'est modifié.

## Sources

- Constats : TSTB-17
- Code vérifié à la version `0d5a954` (nom d'abord, la ligne suit et bougera au formatage) :
  - `adapters/viewing-settings.cjs`, classe `ViewingSettings` (7 lignes) : `load()` rend
    `{ bookmarkShortcut: 'CommandOrControl+Shift+S' }` quand le fichier est absent ou illisible ;
    `save(value)` refuse par « Raccourci invalide. » un raccourci non texte, vide ou de plus de 100
    caractères, n'écrit que `{ bookmarkShortcut }` (mode `0o600`, dossier créé au besoin) et rend la valeur
    reçue. Utilisé par `app/main.cjs` (import ligne 10, instance ligne 97).
  - `adapters/verification-archive.cjs`, classe `VerificationArchive` (13 lignes) : `save(job)` refuse par
    « Archive invalide. » un identifiant qui ne suit pas `verification-<chiffres>` ou un `createdAt` non
    fini ; écrit `<createdAt>-<id>.json` par un fichier `.tmp` renommé, mode `0o600`, dossier racine en
    `0o700`. Utilisé par `app/main.cjs` (import ligne 24).
  - `adapters/ffmpeg.cjs`, fonction `run(binary, args, signal)` et constante `DECODE_FAILED`
    (`'FFMPEG_DECODE'`) : binaire introuvable → « FFmpeg indisponible : installe-le pour réexaminer la
    vidéo. », code `FFMPEG_MISSING` ; sortie non nulle → « Impossible de décoder cet extrait vidéo. », code
    `FFMPEG_DECODE`, `detail` = erreur standard sans espaces de bord (`trim()`) coupée à 400 caractères ;
    processus tué → « Le décodeur vidéo s’est arrêté avant la fin. », code `FFMPEG_KILLED` ; signal annulé en
    cours → rejet par la raison du signal. Un signal déjà annulé fait lever `run` de façon synchrone
    (`signal?.throwIfAborted()` avant la création de la promesse) : l'appel lève, il ne rend pas une promesse
    rejetée. Utilisé par `adapters/clip-inspector.cjs` (ligne 5) et
    `adapters/inspection-strategies.cjs` (ligne 4). Modèle de faux décodeurs :
    `tests/clip-unreadable.test.cjs`, fonction `decoders(dir)` (lignes 85-91).
  - `core/transcription-language.cjs` : `TRANSCRIPTION_LANGUAGES` (`['fr', 'en', 'auto']`, gelé) et
    `validateTranscriptionLanguage(language)` qui rend la langue ou lève « Langue de transcription
    invalide. ». Exercé seulement à travers `tests/transcription-language.test.cjs` (test ligne 9).
- Mesure du constat, reproduite à `0d5a954` :
  `grep -rl "ViewingSettings\|VerificationArchive\|ffmpeg.cjs\|Raccourci invalide\|Archive invalide" tests`
  ne rend que `tests/mac-ipc-contract.test.cjs`, où le mot n'apparaît que dans le nom d'un canal IPC
  (`saveViewingSettings`, ligne 40). Ce fichier lance `app/main.cjs`, qui charge les réglages et l'archive :
  ces modules tournent donc dans un test, mais aucun test n'exige leurs refus, leurs valeurs par défaut ni la
  forme de leurs fichiers.
- Parties du constat écartées par la lecture du code (voir le retour du lot) : `adapters/codex-analysis-agent.cjs`,
  `adapters/companion-prompt.cjs` et `mcp/server.cjs` sont déjà chargés ou lancés par des tests nommés par
  comportement ; `server/main.cjs` (`main`, ligne 24) n'est pas testable sans refonte de la composition.

## Périmètre

- À créer : `tests/viewing-settings.test.cjs`, `tests/verification-archive.test.cjs`,
  `tests/decoder-run.test.cjs`, et les cas de la langue dans `tests/transcription-language.test.cjs` (ajout,
  le test existant garde son titre et ses assertions).
- À ne pas toucher : `adapters/`, `core/`, tout autre code de production ; `tests/clip-unreadable.test.cjs`
  (son aide `decoders` sert de modèle, elle n'est ni déplacée ni partagée par ce ticket).
- Fichiers écrits dans un dossier temporaire créé par le test et retiré en `t.after`. Faux décodeurs : scripts
  Node écrits par le test, comme dans le modèle ; aucun vrai FFmpeg.
- Phrases et codes actuels comparés en entier. Les droits de fichier sont exigés par `stat().mode & 0o777`.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/viewing-settings.test.cjs` passe : fichier absent → raccourci par défaut ; fichier au
   contenu illisible → raccourci par défaut ; `save` écrit un fichier qui ne contient que `bookmarkShortcut`
   même si la valeur reçue porte d'autres champs, en mode `0o600`, dans un dossier qui n'existait pas, et
   `load` relit ce raccourci ; un raccourci de 100 caractères est accepté, un de 101, un vide, un fait
   d'espaces et un non texte sont refusés par « Raccourci invalide. » sans rien écrire.
2. `node --test tests/verification-archive.test.cjs` passe : une archive valide est écrite sous
   `<createdAt>-<id>.json`, relue à l'identique, en mode `0o600`, dans une racine en `0o700`, sans fichier
   `.tmp` restant ; un identifiant hors du format (`verification-`, `deep-1`, `verification-1/../x`) et un
   `createdAt` non fini sont refusés par « Archive invalide. » sans créer la racine.
3. `node --test tests/decoder-run.test.cjs` passe : un décodeur qui sort en 0 résout ; un binaire
   introuvable rejette avec le code `FFMPEG_MISSING` et sa phrase ; une sortie en 1 rejette avec
   `FFMPEG_DECODE`, sa phrase et un `detail` égal à l'erreur standard sans espaces de bord, coupé à 400
   caractères quand elle en compte davantage ; un décodeur qui se tue rejette avec `FFMPEG_KILLED` ; avec un
   signal déjà annulé, l'appel lève de façon synchrone la raison du signal (`assert.throws`, pas
   `assert.rejects`) avant tout lancement (le faux décodeur ne laisse aucune trace) ; un signal annulé pendant l'exécution
   rejette par la raison du signal et le processus ne survit pas. Chaque `test(` porte un `{ timeout }`.
4. `node --test tests/transcription-language.test.cjs` passe et contient un test qui exige : les trois
   langues `fr`, `en`, `auto` rendues telles quelles ; `FR`, `''`, `undefined` et `'de'` refusées par
   « Langue de transcription invalide. » ; la liste exportée est gelée.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Trois fichiers neufs et un test ajouté, cités au périmètre. Frontière : les classes et fonctions exportées
par chaque module, sur un dossier temporaire et des processus enfants factices.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un comportement observé contredit la description ci-dessus (par exemple
des droits de fichier différents sur cette machine) : le test exige ce qui est observé, et le journal note
l'écart avec la commande et la sortie. Si un cas exige de modifier le code de production : verdict BLOQUÉ
pour ce cas.

## Journal
