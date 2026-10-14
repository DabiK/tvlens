---
id: T135
titre: Record the build identity in a generated file and read it without Git
statut: a-faire
bloque_par: T028
adr: oui
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Ni le serveur ni le paquet Mac ne savent de quelle révision ils viennent. La procédure de mise à jour
demande de noter `git rev-parse HEAD` à la main, et rien ne garde cette note.

Après ce ticket, une commande écrit `build-info.json` dans un dossier de construction : nom, version de
`package.json`, commit, date du commit, arbre modifié ou non. Un adaptateur relit ce fichier sans appeler
Git. Fichier absent, la construction est dite inconnue ; fichier invalide, l'erreur nomme le fichier.

Aucun hôte ne l'appelle encore : T136 branche le serveur, l'étape 9 de la fiche branchera le paquet Mac.

## Sources

- Constats : OPS-15, OPS-17
- Fiche du lot : `docs/travail/fiches/livraison.md`, § 2 (lignes `scripts/build-info.mjs` et
  `adapters/build-info.cjs`), § 3, étape 2, et § 4.
- Code vérifié à la version `0d5a954` :
  - `server/http.cjs` et `server/main.cjs` : aucune mention d'une version ou d'un commit.
    `server/main.cjs:41` journalise seulement l'URL et le fichier du jeton.
  - `docs/server-installation.md`, section « Mise à jour reproductible » (l.144) : demande de noter
    `git rev-parse HEAD`.
  - `scripts/package.mjs` : paquet Mac sans identité de construction (relecteur d'OPS-17 : « build-info
    affichée dans les réglages »).
  - `package.json` : `"name": "tvlens"` (l.2), `"version": "0.1.0"` (l.3).
  - `.gitignore` : `dist/` (l.6), aucune entrée pour un fichier d'identité.
  - Lecteur de fichier JSON du même genre : `adapters/model-settings.cjs`, `ModelSettings.load`. Fichier
    absent (`ENOENT`) : valeur par défaut. Autre erreur : relancée.
  - Dépôt Git jetable déjà monté par les tests : `tests/helpers/harness-repo.cjs:36-40`.
- ADR existantes : `docs/adr/0000-gabarit.md` à `0010-…`. Aucune ne traite de l'identité de construction.

## Périmètre

- À créer :
  - `scripts/build-info.mjs`, module ES :
    - `describeBuild({ root, git })` rend `{ name, version, commit, commitDate, dirty }` :
      - `name` et `version` viennent de `root/package.json` ;
      - `commit` vient de `git rev-parse HEAD` (40 caractères hexadécimaux) ;
      - `commitDate` vient de `git log -1 --format=%cI` ;
      - `dirty` vaut `true` si `git status --porcelain` rend une ligne non vide.
    - `git(args)` est injecté et rend `{ code, out }`. La date est celle du commit, jamais l'heure de
      construction : deux constructions du même commit propre donnent le même fichier.
    - Si une commande Git échoue (pas de dépôt, pas de commit), la fonction rejette avec un message
      français qui nomme la commande. Une construction sans identité n'est jamais écrite comme connue.
    - Exécution directe : `node scripts/build-info.mjs --out <dossier>`, avec pour `root` le dossier
      courant et Git lancé dans ce dossier, écrit `<dossier>/build-info.json`
      (JSON indenté, suivi d'un saut de ligne) et l'affiche. Sans `--out`, l'usage s'affiche et la sortie
      se fait avec le code 2. Garde d'exécution directe en fin de fichier, pour que le module se charge sans
      rien écrire.
  - `adapters/build-info.cjs` : `readBuildInfo(dir)` lit `dir/build-info.json`.
    - Absent (`ENOENT`) : rend `null`.
    - Présent : vérifie les cinq champs (`name` et `version` chaînes non vides, `commit` de 40 caractères
      hexadécimaux, `commitDate` date lisible, `dirty` booléen) et rend un objet gelé de ces cinq champs
      seulement.
    - JSON illisible, ou champ invalide : erreur dont le message nomme le fichier.
    - Aucun appel à Git, à `child_process` ni à `process.env`.
  - `tests/build-info.test.cjs` : voir « Test d'acceptation attendu ».
  - Une ADR, `docs/adr/NNNN-…md`, au prochain numéro libre, sur le gabarit `0000`. Elle dit :
    - l'identité est produite à la construction et relue à l'exécution ;
    - fichier absent : construction inconnue ; fichier invalide : erreur ;
    - la date est celle du commit, pour la reproductibilité ;
    - les deux hôtes liront le même adaptateur.
    - Alternatives écartées : appeler Git au démarrage (pas de `.git` dans une construction issue de
      `git archive`) ; injecter la version par l'environnement (une lecture de `process.env` de plus).
- À modifier : `.gitignore`, une entrée `/build-info.json`.
- À ne pas toucher :
  - `server/`, `app/` et `scripts/package.mjs`, branchés plus tard ;
  - `package.json`, sans nouvelle commande npm ;
  - `scripts/quality/`.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/build-info.test.cjs` passe.
2. `node scripts/build-info.mjs`, sans argument, sort avec le code 2 et affiche l'usage (sortie et code
   notés au journal).
3. Lancé deux fois dans le dépôt avec deux dossiers neufs du dossier temporaire du ticket,
   `node scripts/build-info.mjs --out <dossier>` écrit deux fichiers identiques : `cmp` ne rend rien
   (commande et sortie au journal). Le `commit` écrit est celui que rend `git rev-parse HEAD`.
4. `grep -n "child_process\|process.env" adapters/build-info.cjs` ne rend rien.
5. Une nouvelle ADR existe sous `docs/adr/`. Sa section « Protégée par » cite `tests/build-info.test.cjs`.
6. `node scripts/check.mjs --changed` est vert. Format et lint sont rapportés « non lancés » s'ils le sont.

## Test d'acceptation attendu

`tests/build-info.test.cjs`, nouveau, en CommonJS : le module ES est chargé par `import()`.

- `describeBuild`, avec une fonction `git` simulée et un `package.json` écrit dans un dossier temporaire :
  - arbre propre ;
  - arbre modifié (`dirty: true`) ;
  - échec de `git rev-parse` : rejet, et message qui nomme la commande.
- Bout en bout : un dépôt Git jetable (un `package.json`, `git init`, un commit, sans réseau) dans un
  dossier temporaire, qui sert de dossier courant au script,
  monté comme dans `tests/helpers/harness-repo.cjs` (l.36-40 : `git init -q -b work`, puis
  `user.email` et `user.name` posés dans ce dépôt). Le commit passe `-c commit.gpgsign=false`, pour ne
  dépendre ni de la configuration Git globale ni d'une clé de signature. L'exécution directe de
  `scripts/build-info.mjs --out <dossier>`, avec un dossier de sortie hors du dépôt jetable, est relue
  par `readBuildInfo`, qui rend le même commit que `git rev-parse HEAD` et `dirty: false`.
- `readBuildInfo` :
  - dossier sans fichier : `null` ;
  - JSON illisible : erreur qui nomme le fichier ;
  - commit de 7 caractères : erreur ;
  - champ en trop : absent de l'objet rendu.

Le premier critère est prouvé par la frontière publique des deux modules, sans toucher aux hôtes.

## Hypothèses bloquantes

Aucune décision n'est attendue.

- Ce que fera le script de mise à jour d'un arbre modifié (refus, ou construction marquée `dirty`) est la
  décision 3 de la fiche. Ce ticket se contente d'écrire `dirty`, sans rien refuser.
- Si `git log -1 --format=%cI` ne rend pas une date que `Date.parse` lit sur la version de Node du dépôt :
  verdict BLOQUÉ, avec la sortie. Choisir un autre format de date se décide.

## Journal
