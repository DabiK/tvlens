---
id: T013
titre: Give each test file a private temp directory and report what it leaves
statut: a-faire
bloque_par: T012, T145
adr: non
installe: non
harnais: oui
supprime_tests: non
---

## Ce que le ticket livre

Aujourd'hui tous les fichiers de test écrivent dans le même dossier temporaire de la machine : des
chemins fixes y sont partagés entre fichiers et entre lancements, et ce qu'un test oublie y reste.
Après ce ticket, le lanceur donne à chaque fichier un dossier temporaire privé, le supprime à la fin et
dit dans son résumé ce que le fichier y a laissé.

## Sources

- Constats : FLK-13, FLK-15
- Code concerné, à la version `0d5a954` :
  - `scripts/quality/run-tests.mjs` : le lanceur livré par un ticket antérieur (un processus par
    fichier, chien de garde, budget global, résumé), et son fichier de test
    `tests/test-launcher.test.cjs`. Ils n'existent pas encore à cette version. Le ticket prérequis
    branche `npm test` et `scripts/check.mjs` sur ce lanceur : c'est ce qui fait que le contrôle complet
    de ce ticket joue toute la suite dans des dossiers privés.
  - `scripts/check.mjs`, fonction `jsTests` (ligne 114) : son détail ne garde que les lignes `ℹ tests`,
    `ℹ pass`, `ℹ fail` et celles qui commencent par `✖`. La liste des résidus ne s'y lit donc pas : elle
    se lit dans la sortie du lanceur lancé directement.
  - Chemins fixes sous `os.tmpdir()` : `tvlens-test-absent-codex-home` dans huit fichiers
    (`tests/architecture-f05.test.cjs:43`, `tests/architecture-f08.test.cjs:24`,
    `tests/codex-confinement.test.cjs:19`, `tests/codex-connect-race.test.cjs:9`,
    `tests/codex-thread-rotation.test.cjs:14`, `tests/review-regressions.test.cjs:25`,
    `tests/surveillance-runtime.test.cjs:21`, `tests/verification.test.cjs:75`) ; le binaire
    `tvlens-test-absent-codex` (`tests/codex-confinement.test.cjs:495`, `tests/verification.test.cjs:181`) ;
    `tvlens-absent-sessions` (`tests/server-sessions.test.cjs:627`). Chacun suppose que le chemin
    n'existe pas, sur une machine où rien ne le garantit.
  - `tests/codex-connect-race.test.cjs`, aide `created(t)` (ligne 11) et son commentaire : « Other test
    files create session directories in the same temp root: follow only the ones made here. » Le
    partage du dossier temporaire y est déjà contourné à la main.
  - `tests/media-asr-options.test.cjs`, aide `privateTmp(t)` (lignes 27 à 33) : un fichier qui se donne
    déjà son propre `TMPDIR` ; il doit continuer à fonctionner à l'intérieur du dossier privé.
  - `tests/helpers/harness-repo.cjs`, fonction `harnessRepo` (ligne 11) : crée ses dépôts jetables sous
    `os.tmpdir()`.
- Portée, d'après la relecture de l'audit : la collision réelle de ces chemins est peu probable ; le
  gain principal est l'isolement entre fichiers lancés ensemble et le nettoyage garanti sur une machine
  qui sature vite.

## Périmètre

- À modifier : `scripts/quality/run-tests.mjs` ; le fichier de test du lanceur,
  `tests/test-launcher.test.cjs` ; `CONTRIBUTING.md`.
- `harnais: oui` parce que `scripts/quality/` est protégé. Aucun contrôle n'est retiré ni assoupli.
- Comportement attendu :
  - Le lanceur crée un dossier de lancement sous le dossier temporaire reçu, et dedans un sous-dossier
    par fichier, passé au processus du fichier par `TMPDIR`.
  - Noms courts — préfixe bref, numéro d'ordre du fichier et non son nom : un chemin de socket Unix est
    limité à 104 caractères sur macOS.
  - Après la fin du fichier, ou son arrêt par le chien de garde, le lanceur relève les entrées de
    premier niveau restées dans le sous-dossier, puis le supprime. Le dossier de lancement est supprimé
    à la sortie du lanceur.
  - Le résumé donne, pour chaque fichier qui a laissé quelque chose, le nombre d'entrées et leurs noms
    (dix au plus), sur une ligne qui commence par « résidus » et jamais par `✖`. Un résidu est signalé,
    il ne fait pas échouer le lancement dans ce ticket.
  - Le dossier temporaire reçu par le lanceur reste celui de l'appelant : un lanceur lancé depuis un
    test (dépôt jetable) crée son dossier de lancement dans le dossier privé de ce test.
- À ne pas toucher : les fichiers de test existants. Les résidus que la suite réelle révèle sont
  consignés dans le journal, pas corrigés ici. `scripts/check.mjs` n'a pas à changer.

## Critères d'acceptation

Les critères 1 à 5 se vérifient par des tests ajoutés au fichier de test du lanceur, sur des fichiers
d'essai écrits dans un dépôt jetable.

1. Deux fichiers d'essai écrivent chacun `os.tmpdir()` dans un fichier du dépôt jetable : les deux
   chemins diffèrent, sont sous un même dossier créé par le lanceur, et plus aucun n'existe quand le
   lanceur a rendu la main.
2. Le dossier privé d'un fichier n'ajoute pas plus de 24 caractères au dossier temporaire de départ.
3. Un fichier d'essai qui laisse `left-behind/` dans son dossier temporaire et dont les tests passent :
   la sortie du lanceur nomme le fichier et `left-behind`, le code de sortie reste 0, le dossier a
   disparu.
4. Un fichier d'essai qui ne laisse rien n'apparaît pas dans la liste des résidus.
5. Le dossier privé d'un fichier arrêté par le chien de garde est supprimé lui aussi.
6. `CONTRIBUTING.md` dit que chaque fichier de test reçoit un dossier temporaire privé et où lire la
   liste des résidus. Vérification : `grep`, sortie dans le journal.
7. `node scripts/check.mjs` est vert : toute la suite passe dans des dossiers temporaires privés.
8. Un lancement de `node scripts/quality/run-tests.mjs` sur toute la suite, une seule fois, sortie
   enregistrée dans le dossier d'état du ticket : le journal recopie les lignes « résidus », fichier par
   fichier, ou dit qu'il n'y en a aucune. C'est l'entrée du ticket de suite.

## Test d'acceptation attendu

Un test nommé d'après le comportement — par exemple « each test file gets a private temp directory,
removed after it, and what it left there is named ». Frontière : `scripts/quality/run-tests.mjs` lancé
comme un processus.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le drapeau `harnais: oui` a été posé au découpage et attend la relecture
du propriétaire avant le premier lancement. Si un test existant échoue une fois son dossier temporaire
privé — chemin trop long, dossier attendu ailleurs — : verdict BLOQUÉ, avec le fichier, le test et la
sortie ; le test n'est ni modifié ni exclu du dossier privé.

## Journal
