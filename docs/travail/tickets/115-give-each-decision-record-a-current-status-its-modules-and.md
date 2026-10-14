---
id: T115
titre: Give each decision record a current status, its modules and its guarding tests
statut: a-faire
bloque_par: T078, T079, T080, T081, T082, T086, T111
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les dix ADR de `docs/adr/` sont des comptes rendus du chantier du 13 octobre 2026, et non des décisions
consultables :
- leur statut est périmé (« en attente du merger », « Non publié, non déployé ») ;
- ils citent des SHA et des décomptes ;
- aucun ne nomme le fichier de test qui échoue si la décision est défaite ;
- leurs 58 puces « Limites » doublonnent le registre des dettes.

Leur en-tête (tableau) ne suit pas le gabarit `docs/adr/0000-gabarit.md` que la boucle utilise pour les
nouveaux ADR. Après ce ticket :
- le gabarit est amendé : il garde ses champs actuels et ajoute les modules, les remplacements et une
  section « Limites » qui renvoie au registre ;
- les dix ADR suivent ce gabarit. Leurs preuves datées partent dans les historiques archivés ;
- `docs/adr/README.md` les liste ;
- un test garde la forme de chaque ADR.

## Sources

- Constats : DOC-04, DOC-03
- Documents, à la version `0d5a954` :
  - `docs/adr/0000-gabarit.md` : champs `Date`, `Ticket`, `Statut` (puces), sections Contexte, Décision,
    Alternatives écartées, Conséquences, Protégée par. La skill `.claude/skills/ticket/SKILL.md` (ligne
    53) l'utilise pour tout ticket `adr: oui`. `scripts/loop/run.mjs` (ligne 199) exige seulement un
    nouveau fichier `docs/adr/NNNN-*.md`.
  - `docs/adr/0001-*.md` à `0010-*.md` : tableau d'en-tête `| | |` (Issue, Date, Statut, Code relu,
    Détail), puis sections Contexte, Décision, Alternatives écartées, Conséquences, Preuves, Limites.
    Exemple : `docs/adr/0007-*.md`, ligne 7 (Statut), sections « Preuves » (ligne 96) et « Limites »
    (ligne 102).
  - Statuts périmés : `grep -lE "Non publié|en attente d.intégration|merger" docs/adr/*.md | wc -l`
    vaut 10.
  - SHA entre accents graves : ``grep -cE '`[0-9a-f]{7,40}`' docs/adr/00*.md`` donne 22 au total pour
    0001 à 0010. Les autres sont dans l'en-tête, avant « Contexte », ou dans « Preuves ». Deux sont ailleurs : `docs/adr/0002-*.md` ligne 37 (« Alternatives écartées ») et
    `docs/adr/0005-*.md` ligne 82 (« Limites »). Commande qui liste les lignes :
    ``grep -nE '`[0-9a-f]{7,40}`' docs/adr/00*.md``.
  - Puces « Limites » : 58, reprises au registre `docs/travail/dettes.md` par T109 avec les origines
    `ADR0001:n` à `ADR0010:n`.
  - Tests de la première boucle, `tests/architecture-f04.test.cjs` à `architecture-f10.test.cjs` : le
    lot L07 les renomme par comportement. Les liens « Protégée par » visent les noms qui en résultent.
  - Historiques archivés par T111 : `docs/archive/2026-10-13-boucle-architecture/history/F01.md` à
    `F10.md`.

## Périmètre

- `docs/adr/0000-gabarit.md` :
  - les puces existantes restent (`Date`, `Ticket`, `Statut`) ;
  - ajout des puces `Modules` (chemins de code) et `Remplace` / `Remplacé par` (facultatives) ;
  - valeurs admises pour `Statut` : `proposée`, `acceptée`, `remplacée par NNNN`, `abandonnée` ;
  - les sections existantes restent dans leur ordre, plus une section finale « Limites » : une ligne par
    dette, sous la forme `DET-NNN`, renvoyant à `docs/travail/dettes.md`, ou la seule ligne « Aucune. »
    quand la décision ne laisse pas de dette.

  Rien d'autre ne change : la skill `ticket` continue de s'en servir telle quelle.
- Les dix ADR passent au gabarit :
  - le tableau d'en-tête devient les puces du gabarit. `Statut : acceptée`. `Ticket` renvoie à la fiche
    archivée. `Modules` est tiré de la section « Décision » et de la section des fichiers de l'historique ;
  - « Protégée par » donne un lien relatif vers chaque fichier de test qui garde la décision, d'après
    l'historique. Un test qui n'existe plus n'est pas cité ;
  - « Limites » ne contient plus que des identifiants `DET-NNN` ;
  - « Preuves », le SHA relu et les décomptes partent, mot pour mot, dans une section « Preuves reprises de
    l'ADR » en fin d'historique archivé ;
  - les sections Contexte, Décision, Alternatives écartées et Conséquences gardent leur texte, sauf les SHA
    et décomptes qu'elles citent, déplacés de même (par exemple `docs/adr/0002-*.md`, ligne 37). Le SHA de
    la puce « Limites » de `docs/adr/0005-*.md` (ligne 82) reste au registre avec sa dette.

  Aucun fichier n'est renommé.
- À créer : `docs/adr/README.md`, un tableau `Numéro | Décision | Statut | Modules | Protégée par`, une
  ligne par ADR. `docs/README.md` et `docs/architecture.md` (section « Décisions ») y renvoient.
- À créer : `tests/decision-records.test.cjs`. Pour chaque `docs/adr/NNNN-*.md` hors gabarit, il exige :
  - les puces `Date`, `Statut` (valeur admise) et `Modules` ;
  - les sections du gabarit dans l'ordre ;
  - au moins un lien de « Protégée par » vers un fichier `tests/*.test.cjs` ou `tests/test_*.py` qui
    existe ;
  - une section « Limites » qui contient soit des `DET-NNN`, soit « Aucune. » ;
  - que chaque `DET-NNN` cité existe dans `docs/travail/dettes.md` ;
  - aucun SHA entre accents graves.

  Le test vaut aussi pour les ADR que la boucle ajoutera.
- À ne pas toucher : `.claude/`, `scripts/loop/`, le code, les noms des ADR.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/decision-records.test.cjs` passe. Le fichier contient un cas sur un ADR écrit dans
   le test, sans statut admis, sans lien de test, avec un `DET-999` absent et un SHA. Ce cas exige quatre
   signalements.
2. `grep -lE "Non publié|en attente d.intégration|merger" docs/adr/*.md` ne renvoie rien.
3. ``grep -cE '`[0-9a-f]{7,40}`' docs/adr/*.md`` vaut 0 pour chaque fichier.
4. Décisions inchangées : une commande `node -e`, consignée dans le journal, extrait la section
   « ## Décision » de chaque ADR à `HEAD` (`git show HEAD:<fichier>`) et dans l'arbre de travail. Elle
   affiche les ADR dont le texte diffère, une fois retirés les SHA et décomptes déplacés. Chaque différence
   affichée est justifiée dans le journal.
5. `grep -c "^| \[00" docs/adr/README.md` vaut 10, et `grep -n "adr/README.md" docs/README.md` renvoie une
   ligne.
6. `grep -c "Preuves reprises de l'ADR" docs/archive/2026-10-13-boucle-architecture/history/F*.md` vaut 1
   pour chacun des dix fichiers.
7. `node --test tests/documentation-links.test.cjs`, `node --test tests/documentation-index.test.cjs` et
   `node --test tests/debt-register.test.cjs` passent.
8. `node scripts/check.mjs --changed` est vert ; format et lint sont rapportés « non lancés » tels quels.

## Test d'acceptation attendu

`tests/decision-records.test.cjs`, par la frontière des fichiers `docs/adr/*.md` et
`docs/travail/dettes.md`, sans réseau.

## Hypothèses bloquantes

Aucune décision n'est attendue. Les ADR rétroactifs sur les décisions fondatrices ne sont pas dans ce
ticket : leur liste attend le propriétaire. Les lignes `// Decision:` dans le code non plus : elles
viennent après le formatage.

## Journal
