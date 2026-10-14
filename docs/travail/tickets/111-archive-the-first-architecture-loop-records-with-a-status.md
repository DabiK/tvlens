---
id: T111
titre: Archive the first architecture loop records with a status line and a glossary
statut: a-faire
bloque_par: T109, T110
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`docs/architecture-improvements/` contient les dix fiches, les dix historiques, l'index et la mission de
la première boucle d'amélioration (F01 à F10). Les sujets sont clos, chacun par un ADR. Pourtant, rien ne
dit au lecteur que ce dossier est une archive. Les textes emploient aussi un vocabulaire de processus
défini nulle part : « merger », « supervision », « Astra », « Opus », « review standards », « doublure »,
« couture ». Après ce ticket, le dossier est rangé sous `docs/archive/`, avec un README qui dit son statut
et définit ces termes. Chaque fiche renvoie à l'ADR qui l'a close. Les dettes et les invariants ont déjà
été repris par T109 et T110. Les liens restent valides.

## Sources

- Constats : DOC-08, DOC-14
- Documents, à la version `0d5a954` :
  - `docs/architecture-improvements/index.md` (14 lignes) : « Boucle séquentielle Opus5.5ultracode… »,
    puis la liste des dix fiches et de leurs issues GitHub.
  - Fiches : `01-f01.md` à `06-f06.md`, `07-f08.md`, `08-f09.md`, `09-f10.md`, `10-f07.md`. L'ADR qui
    clôt chacune se lit dans la ligne `| Issue |` de l'en-tête de chaque historique (ligne 5) :
    F01 → 0001, …, F10 → 0010.
  - `docs/architecture-improvements/history/F01.md` à `F10.md`, ligne 5 : liens relatifs `../0N-fNN.md` et
    `../../adr/…`.
  - `docs/adr/0001-*.md` à `0010-*.md`, en-tête : deux liens chacun vers `../architecture-improvements/…`
    (fiche et historique). Commande : `git grep -c "architecture-improvements" -- docs/adr` donne 2 par
    ADR.
  - Aucun code, script ni test ne cite ce dossier : `git grep -n "architecture-improvements" -- ':!docs'`
    ne renvoie rien.
  - Vocabulaire de processus, nombre de fichiers du dossier et des ADR qui l'emploient (commande
    `git grep -il "<terme>" -- docs/architecture-improvements docs/adr | wc -l`) : merger 21, supervis 25,
    Astra 10, Opus 12, « review standards » 11, « review spécification » 11, doublure 13, couture 12.

## Périmètre

- Déplacement par `git mv` : `docs/architecture-improvements/` devient
  `docs/archive/2026-10-13-boucle-architecture/`, avec la même arborescence. `index.md` devient
  `README.md` dans le dossier d'archive.
- `README.md` de l'archive :
  - première ligne de contenu : `> Statut : archive du 13/10/2026 — remplacé par` suivi des liens vers
    `docs/adr/` et `docs/travail/dettes.md` ;
  - la liste des fiches reste ;
  - une section « Glossaire du processus » définit merger, supervision et superviseur, Astra, Opus,
    review standards, review spécification, doublure, couture. Chaque définition s'appuie sur un emploi
    cité dans les textes archivés (`fichier`, section). Si les textes ne permettent pas de définir un
    terme, la ligne dit « non défini dans les textes » ; aucune définition n'est inventée.
- Chaque fiche reçoit, sous son titre, une seule ligne `Clos par [ADR NNNN](…)`, avec un lien relatif
  vers l'ADR.
- Les liens relatifs des historiques vers `docs/adr/` sont réécrits pour le nouvel emplacement. Les liens
  des dix ADR vers la fiche et l'historique pointent vers le nouveau chemin.
- `docs/README.md` : la ligne qui indexait `architecture-improvements/index.md` pointe vers le README de
  l'archive.
- Les liens vers l'ancien dossier ajoutés par les tickets précédents du lot sont réécrits : ceux de
  `docs/decisions-produit.md` (T110, source des invariants dans `mission.md`) et, s'il y en a, ceux de
  `docs/travail/dettes.md` (T109). Commande qui les liste avant le déplacement :
  `git grep -n "architecture-improvements" -- docs ':!docs/architecture-improvements' ':!docs/travail/tickets'`.
- Le texte archivé ne change pas, à part la ligne « Clos par » et les liens réécrits.
- À ne pas toucher : le contenu des ADR (sauf leurs deux liens), le code, les tests existants.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `test -d docs/architecture-improvements` échoue, et
   `ls docs/archive/2026-10-13-boucle-architecture/history | wc -l` vaut 10.
2. `git grep -n "architecture-improvements" -- . ':!docs/archive' ':!docs/travail/tickets'` ne renvoie rien.
   Les tickets sont exclus : leur rubrique « Sources » cite l'ancien chemin.
3. `grep -c "^Clos par \[ADR 00" docs/archive/2026-10-13-boucle-architecture/[01]*.md` vaut 1 pour chacune
   des dix fiches.
4. `sed -n '1,5p' docs/archive/2026-10-13-boucle-architecture/README.md | grep -c "Statut : archive du 13/10/2026"`
   vaut 1.
5. La section « Glossaire du processus » contient les huit termes. Commande :
   `for t in merger supervis Astra Opus "review standards" "review spécification" doublure couture; do grep -qi "$t" docs/archive/2026-10-13-boucle-architecture/README.md || echo "manque $t"; done`
   ne renvoie rien.
6. `node --test tests/documentation-links.test.cjs` et `node --test tests/documentation-index.test.cjs`
   passent. Le second exige que le README de l'archive soit lié depuis `docs/README.md`.
7. Diff sans réécriture de fond :
   `git diff -M --name-status HEAD -- docs/architecture-improvements docs/archive | grep -c '^R'` vaut au
   moins 21. Les fiches, les historiques et `mission.md` sont vus comme renommés ; seul `index.md`, devenu
   un README enrichi du glossaire, peut apparaître comme supprimé puis ajouté. La sortie de
   `git diff -M --stat HEAD` est dans le journal.
8. `node scripts/check.mjs --changed` est vert ; format et lint sont rapportés « non lancés » tels quels.

## Test d'acceptation attendu

Aucun nouveau test. `tests/documentation-links.test.cjs` garde les liens déplacés et
`tests/documentation-index.test.cjs` garde l'indexation de l'archive.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le sens des noms « Astra » et « Opus » n'est connu que par les textes : le
glossaire n'en dit pas plus qu'eux.

## Journal
