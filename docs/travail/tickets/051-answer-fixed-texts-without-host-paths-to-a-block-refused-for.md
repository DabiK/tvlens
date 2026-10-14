---
id: T051
titre: Answer fixed texts without host paths to a block refused for its content
statut: a-faire
bloque_par: T028, T038, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Quand un bloc envoyé par la TV est refusé pour son contenu, la réponse 400 recopie parfois un message
interne : la fin de la sortie de l'outil média (qui peut nommer un chemin temporaire du serveur),
l'erreur brute de la bibliothèque d'images, ou un `TypeError` de JavaScript. Après ce ticket, ces
trois cas répondent un texte fixe en français, le statut reste 400, et le détail d'origine reste
attaché à l'erreur côté serveur. Deux textes lus par le client changent : le ticket le dit et le
prouve.

## Sources

- Constats : SEC-01
- Le constat est P1 pour le standard « un message interne (chemin, sortie d'un outil) ne part pas vers
  un client » (`docs/standards.md`, section Erreurs), pas pour une faille : la route exige le jeton
  d'appareil. Ce ticket traite les refus de contenu ; le ticket suivant du lot traite les erreurs
  inconnues.
- Code vérifié à la version `0d5a954` (chercher par nom, les lignes bougeront) :
  - `adapters/remote-media.cjs`, `command()` (l.49-65) : l.62,
    `reject(Error('Préparation média échouée : '+err))`, où `err` est la fin de la sortie d'erreur de
    l'outil.
  - `adapters/remote-media.cjs`, `RemoteMedia.assemble(input, {signal})` (l.70) : dossier de travail
    `fs.mkdtemp(path.join(os.tmpdir(),'tvlens-ingest-'))` (l.72) ; fonction locale `encode` (l.76-84),
    `sharp(Buffer.from(frame.data,'base64'),{limitInputPixels:1920*1080})…toBuffer()` : l'erreur de la
    bibliothèque sort telle quelle. Dans `encode`, `signal?.throwIfAborted()` et les écritures passées
    par `scratch` (l.45, 503 `media-unavailable`) ont déjà leur traitement : seul l'appel à la
    bibliothèque d'images (de `sharp(…)` à `toBuffer()`) est à envelopper.
  - `adapters/remote-media.cjs`, `validateRemote(input)` (l.29-39) : boucle des images l.34,
    `if(!Number.isFinite(f.atMs)||…)throw Error('Ordre des images invalide.')`. Une image `null` lève
    avant ce contrôle.
  - `server/http.cjs`, `catch` général de `RemoteServer.handle` (l.275-290) : une erreur sans statut
    devient `400 { error: error.message }`.
  - `tv/app/companion.js`, `tvlensViewRefusal` (l.240) : le panneau ne lit le texte d'un 400 que pour
    y chercher « vue d'état inconnue », sur les lectures d'état ; il n'envoie pas de bloc.
  - `tv/transport.py`, `refusal(error)` (l.22-29) rend `(status, code, message)` ; l'envoi d'un bloc
    ignore le message (`status, code, _ = refusal(error)`) et abandonne le bloc quand
    `status < 500 and status not in (408, 429)`, en notant `HTTP <status>`.
- Comportement observé à la version `0d5a954` :

  ```sh
  node -e "const {validateRemote}=require('./adapters/remote-media.cjs');try{validateRemote({frames:[null]})}catch(e){console.log(e.name,'|',e.message)}"
  ```

  Sortie : `TypeError | Cannot read properties of null (reading 'atMs')`. Avec `frames:[{}]` ou
  `frames:["x"]`, la sortie est `Error | Ordre des images invalide.`.
- Test existant : `tests/architecture-f06.test.cjs`, « a media tool that does not end in time, cannot
  be started, or has no temporary directory is answered 503 with a code and no path of the host, and
  the same block is admitted again; a block that is itself wrong stays 400 with its message » (l.360).
  Il épingle l.386 `notWav: invalid('Audio WAV requis.')`, `notAnImage: invalid('unsupported image
  format')`, `incoherent: invalid('Déclaration d’images masquées incohérente.')`,
  `toolRefused: invalid('Préparation média échouée : boom')` et `paths: false` ; la l.382 réduit le
  message de la bibliothèque d'images à `unsupported image format`.
- Second test qui épingle les deux textes, par `RemoteMedia.assemble` appelé directement :
  `tests/media-asr-options.test.cjs`, « a failed frame waits for the running audio child before
  cleanup and stays the reported error » (l.68) — `assert.rejects(…, /unsupported image format/)`
  l.74 et l.77, `assert.rejects(…, /Préparation média échouée : /)` l.78 (faux outil qui écrit `boom`
  et sort en échec). Sans mise à jour, ce test échoue dès que les textes changent.
- Test du client de la TV : `tests/test_tv_control.py`,
  `test_archive_open_read_only_stops_by_name_and_a_plain_conflict_stays_a_rejected_block` (l.131).

## Périmètre

- À modifier : `adapters/remote-media.cjs`, `tests/architecture-f06.test.cjs`,
  `tests/media-asr-options.test.cjs`, `tests/test_tv_control.py`, et le test de contrat livré par le
  jalon `contrat-fil` s'il épingle l'un des deux textes.
- Textes qui changent, tous deux lus par le client dans le champ `error` d'un 400 :
  - « Préparation média échouée : » suivi de la sortie de l'outil devient « Préparation média
    échouée. » ; la sortie de l'outil passe en `cause` de l'erreur.
  - le message brut de la bibliothèque d'images devient « Image illisible. » ; l'erreur d'origine passe
    en `cause`.
- Texte ajouté à un cas qui n'en avait pas : une image `null` ou qui n'est pas un objet répond le
  texte existant « Ordre des images invalide. ».
- Dans le test existant, deux attentes sont remplacées par des textes fixes, plus stricts :
  `notAnImage: invalid('Image illisible.')` et `toolRefused: invalid('Préparation média échouée.')` ;
  la réduction de la l.382 n'a plus d'objet, et la fin du titre du test (« stays 400 with its
  message ») peut être ajustée si elle devient inexacte. Aucune autre attente ne change, aucun cas
  n'est retiré.
- Dans `tests/media-asr-options.test.cjs`, les trois attentes du test l.68 sont remplacées par des
  attentes plus strictes, au même endroit et dans le même ordre : l.74 et l.77, rejet dont le message
  est exactement « Image illisible. » et dont `cause.message` correspond à
  `/unsupported image format/` ; l.78, rejet dont le message est exactement « Préparation média
  échouée. » et dont `cause` contient `boom`. Les autres assertions du test (journal de l'outil,
  dossiers temporaires) ne changent pas : l'erreur de l'image reste celle qui est rapportée.
- À ne pas toucher : le statut 400 de ces refus ; les réponses 503 `media-unavailable` et 507
  `storage-full` ; l'annulation (`signal`) ; `server/http.cjs` (ticket suivant) ; `tv/transport.py` ;
  aucun code d'erreur n'est ajouté ni renommé.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `POST /v1/segments` avec une image qui n'en est pas une : `400 { error: 'Image illisible.' }`.
2. Même route, outil média qui refuse (cas `toolRefused` du test existant) :
   `400 { error: 'Préparation média échouée.' }` ; le corps ne contient ni `boom` ni chemin de l'hôte
   (`paths: false` reste exigé).
3. Même route avec `frames: [null]` : `400 { error: 'Ordre des images invalide.' }`.
4. Inchangés et toujours exigés par le test existant : `Audio WAV requis.`, `Déclaration d’images
   masquées incohérente.`, les réponses 503 avec leur code, et la réadmission du même bloc.
5. `RemoteMedia.assemble` appelé directement sur les cas 1 et 2 rejette avec une erreur dont `cause`
   porte le détail d'origine (erreur de la bibliothèque d'images, sortie de l'outil) : ce sont les
   trois attentes mises à jour du test l.68 de `tests/media-asr-options.test.cjs`.
6. Client de la TV : un bloc refusé par `400 {"error": "Image illisible."}` est abandonné sans nouvel
   envoi et noté `HTTP 400`, comme tout refus de contenu. Cas ajouté dans `tests/test_tv_control.py` à
   côté de `test_archive_open_read_only_stops_by_name_and_a_plain_conflict_stays_a_rejected_block`.
7. `node --test --test-concurrency=1 tests/architecture-f06.test.cjs tests/media-asr-options.test.cjs tests/server-ingest-path.test.cjs`
   passe ; `python3 -B -m unittest discover -s tests -p "test_tv_control.py"` passe ;
   `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Le test existant de `tests/architecture-f06.test.cjs`, par la route `POST /v1/segments` d'un vrai
`RemoteServer`, avec les deux textes fixes et le cas `frames: [null]` en plus ; le test l.68 de
`tests/media-asr-options.test.cjs` pour la cause, par `RemoteMedia.assemble`. La preuve côté client
est le cas ajouté dans `tests/test_tv_control.py`, par la boucle d'envoi réelle de `tv/transport.py`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Remplacer une attente par une attente plus stricte dans deux tests
existants n'en retire aucune. Si le test de contrat du jalon `contrat-fil` ou un client de la TV lit
le texte après « Préparation média échouée » pour décider quoi faire, ou si un autre test que les deux
nommés ici épingle l'un des deux anciens textes : verdict BLOQUÉ, avec le fichier et la ligne.

## Journal
