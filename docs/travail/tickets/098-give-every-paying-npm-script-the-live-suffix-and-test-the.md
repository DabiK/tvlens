---
id: T098
titre: Give every paying npm script the :live suffix and test the rule
statut: termine
bloque_par: T163
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

`CONTRIBUTING.md` et `CLAUDE.md` comptent sur une convention : une commande qui appelle un fournisseur réel
porte le suffixe `:live`. Aujourd'hui, cinq entrées de `package.json` la contredisent. Trois la portent mal
écrite (`-live` au lieu de `:live`), et deux consomment le quota Codex sans aucun suffixe : `test:verify` et
`test:codex:speed`. Un agent qui suit la règle « ne pas lancer `*:live` » les lance donc sans le savoir.
Après ce ticket, ces cinq entrées sont renommées et la documentation suit. Un test vérifie l'équivalence
dans les deux sens : un nom se termine par `:live` si et seulement si sa commande est payante. Ce test ne
tient pas de liste fermée des entrées npm : une entrée hors ligne ajoutée par un autre lot passe sans
retouche. Il tient seulement la liste des fichiers de script payants.

## Sources

- Constats : DOC-12, TSTC-18. Décision du propriétaire, le 15/10 : attente de T150 et
  exclusion des documents historiques du critère d’absence.
- Code vérifié à la version `e92c6a6` :
  - `package.json`, bloc `scripts` à `package.json:7` (24 entrées) :
    - ligne 13 `test:electron:verify-live` (`smoke-electron.mjs --live-verifier`) ;
    - ligne 15 `test:verify` (`scripts/probe-verify.cjs`, vérificateur Codex réel) ;
    - ligne 16 `test:electron:deep-live` (`--live-video-agent`) ;
    - ligne 19 `test:electron:full-live` (`--live-video-agent --live-inspection`) ;
    - ligne 25 `test:codex:speed` (`scripts/probe-codex-speed.cjs`, Codex réel).
  - Les entrées déjà conformes : `test:live` ligne 14, `test:actions:live` ligne 20, `test:retrieval:live`
    ligne 21, `test:strategies:live` ligne 22, `screenshots:live` ligne 26.
  - Entrée hors ligne qui passe des drapeaux sans être payante : `test:electron:sheets` ligne 23
    (`--local-inspection --inspection-strategy=sheets-crop`).
  - `scripts/smoke-electron.mjs:7-9` : les seuls drapeaux payants qu'il lit sont `--live-verifier`,
    `--live-video-agent` et `--live-inspection`.
- Fichiers qui citent les anciens noms, hors `package.json` (`git grep` à la version citée) :
  - `docs/installation.md:154` et `:156`, des instructions ;
  - `docs/verification.md:26-27`, des instructions ;
  - `docs/reexamen-validation.md:48`, le relevé daté du 28 septembre 2026.
  `CONTRIBUTING.md:25` énonce la convention `*:live`.
  `docs/audit-maintenabilite.md` contient aussi les anciens noms : ce relevé historique reste inchangé.
- Chemins fournisseurs lus : `scripts/probe-live.cjs:8` (OpenRouter), `scripts/probe-verify.cjs:3`
  (CodexVerifier), `scripts/evaluate-actions.cjs:4` et `scripts/compare-inspection-strategies.cjs:6`
  (adaptateurs réels), `scripts/probe-retrieval.cjs:2` (embeddings), `scripts/probe-codex-speed.cjs:2`
  (agents Codex), `scripts/capture-showcase.mjs:15` (Electron avec options live).
- `tests/npm-scripts.test.cjs` est absent : l’invariant reste à tester. Les commandes de démarrage
  des hôtes ne sont pas des sondes lancées par le test de classement.
- `git grep` des anciens noms dans `.claude/`, `scripts/loop/`, `scripts/quality/` et `tests/` ne rend rien :
  le harnais ne les cite pas.

## Périmètre

À modifier :

- `package.json` : cinq renommages, les commandes restent identiques.
  - `test:electron:verify-live` → `test:electron:verify:live`
  - `test:electron:deep-live` → `test:electron:deep:live`
  - `test:electron:full-live` → `test:electron:full:live`
  - `test:verify` → `test:verify:live`
  - `test:codex:speed` → `test:codex-speed:live`
- `docs/installation.md` et `docs/verification.md` : seulement les noms de commande.

À créer :

- `tests/npm-scripts.test.cjs`, qui lit `package.json` et vérifie l'équivalence. Une commande est payante si
  elle lance l'un des fichiers `probe-live.cjs`, `probe-verify.cjs`, `evaluate-actions.cjs`,
  `probe-retrieval.cjs`, `compare-inspection-strategies.cjs`, `probe-codex-speed.cjs` ou
  `capture-showcase.mjs`, ou si elle passe un drapeau qui commence par `--live-`. Une fonction pure, exportée
  ou interne au fichier, rend la liste des entrées en défaut. Le test l'applique au vrai `package.json`, puis à
  un objet `scripts` inventé, pour prouver qu'elle attrape les deux sens d'erreur. Le message d'échec nomme
  l'entrée et dit quel suffixe ajouter ou retirer.

À ne pas toucher :

- Les commandes elles-mêmes, `scripts/smoke-electron.mjs`, et les scripts lancés.
- Le harnais. Aucun garde-fou de hook n'est ajouté ici.
- Les rapports datés de `docs/`, dont `docs/reexamen-validation.md` : ce sont des relevés. Seules les
  instructions à suivre changent.
- Les tickets de `docs/travail/`, qui citent les anciens noms pour décrire le travail.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/npm-scripts.test.cjs` passe.
2. Le même fichier prouve, sur un objet inventé, que `{"probe:x": "node scripts/probe-verify.cjs"}` et
   `{"x:live": "node scripts/smoke-electron.mjs"}` sont tous deux signalés, et que
   `{"test:electron:sheets": "node scripts/smoke-electron.mjs --local-inspection"}` ne l'est pas.
3. La recherche suivante ne rend rien dans les instructions et le code actifs :
   ```sh
   git grep -nE 'verify-live|deep-live|full-live|test:verify([^:]|$)|test:codex:speed' -- . \
     ':!docs/travail' ':!docs/adr' ':!docs/audit-maintenabilite.md' ':!docs/reexamen-validation.md'
   ```
   Les tickets, ADR, audit et rapport daté sont exclus : ils décrivent l’état de leur époque. La sortie
   et le code de retour 1 (aucune correspondance) sont notés au journal.
4. `node -e 'const s=require("./package.json").scripts;console.log(Object.keys(s).length)'` rend le même nombre
   en fin de session qu'au début (24 à la version citée ; d'autres lots ont pu en ajouter depuis) : aucune
   entrée n'est ajoutée ni retirée. Les deux mesures figurent au journal.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/npm-scripts.test.cjs`, nouveau. Frontière : le fichier `package.json` du dépôt, lu tel quel, et la
fonction de classement appliquée à des objets inventés. Aucun script n'est lancé.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si une autre entrée de `package.json` se révèle payante sans figurer dans la
règle ci-dessus (un script qui appelle Codex ou OpenRouter sans être nommé), le ticket l'ajoute à la règle et
la renomme. Si le renommage casse un lecteur hors de la liste des sources : verdict BLOQUÉ, avec le lecteur.

## Journal

Rafraîchi le 15/10 contre `e92c6a6` : T145 remplacé par T150, 24 entrées npm relevées au lieu de 22,
chemins fournisseurs vérifiés et critère d’absence corrigé pour préserver les documents historiques.
Aucun script fournisseur, test ni installation lancé pendant ce rafraîchissement.

- Relecture documentaire le 15/10 contre `e92c6a6` : sources rendues pérennes dans
  `docs/audit-points-chauds.md` ou attribuées à la décision du propriétaire, le 15/10.

- Exploration Codex du 15/10 : consignes, méthode de tests, sources et ADR de contrôle lus ;
  exploration et absence d'écart consignées dans `.harness-state/tickets/T098/`.
  `git status --short` : ticket déjà en cours et deux dossiers non suivis, conservés.
  `node -e 'const s=require("./package.json").scripts;console.log(Object.keys(s).length)'` :
  **25**, code 0, avant modification. La recherche du critère 3 trouve seulement les cinq
  entrées et les deux guides prévus. Aucun fournisseur réel lancé.

- Tests d'abord : `node --test tests/npm-scripts.test.cjs` avant renommage : code 1,
  assertion rouge nommant exactement les cinq entrées, sortie conservée dans
  `.harness-state/tickets/T098/manifest-red.log`. Après les cinq renommages et les
  tests sur objets inventés : même commande, code 0, **4 tests réussis**, sortie dans
  `manifest-green.log`. Les guides ne changent que les noms de commande.
- `node scripts/check.mjs --changed` : code 0, **vert** ; règles, format, lint, gel,
  cliquet et les quatre tests du fichier nouveau passent (`check-changed.log`).
- Critère d'absence : commande exacte ci-dessous, **aucune sortie, code 1**
  (`.harness-state/tickets/T098/active-names.log` vide) :

  ```sh
  git grep -nE 'verify-live|deep-live|full-live|test:verify([^:]|$)|test:codex:speed' -- . \
    ':!docs/travail' ':!docs/adr' ':!docs/audit-maintenabilite.md' ':!docs/reexamen-validation.md'
  ```

- `node -e 'const s=require("./package.json").scripts;console.log(Object.keys(s).length)'` :
  **25**, code 0, après modification (`script-count-after.log`) ; nombre identique au départ.
  Comparaison structurelle avec `git show HEAD:package.json` par assertion Node : code 0,
  exactement cinq clés renommées, toutes les commandes et les autres champs identiques.
  `git diff --check` : code 0.
- `node scripts/check.mjs` : code 0, **vert** ; règles, format, lint, gel et cliquet
  réussis ; **1 190 tests JS réussis** sur 101 fichiers ; **84 tests Python exécutés,
  dont un ignoré**, résultat OK. Sortie conservée dans
  `.harness-state/tickets/T098/check-full.log`.
- Verdict Codex : **TERMINÉ**, sans réserve, dans
  `.harness-state/tickets/T098/verdict.json`. Aucun script fournisseur, aucune installation,
  aucun commit ni push ; les dossiers non suivis préexistants et les documents historiques
  restent intacts. La boucle garde la responsabilité de la relecture et de l'intégration.

- Reprise après `relecture-1.md` : rapport, ticket et journal, écarts, consignes et diff relus.
  Le constat mineur sur l'espacement de `docs/installation.md:156` est accepté ; aucun autre
  constat ni écart. Vérification ponctuelle préparée dans le dossier d'état avant correction,
  sans ajouter de test permanent pour la mise en forme du guide.
- `node .harness-state/tickets/T098/check-guide-spacing.cjs` : code 1 avant correction
  (`guide-spacing-red.log`), sur l'assertion des sept espaces ; code 0 après correction
  (`guide-spacing-green.log`). La ligne concernée passe de douze à sept espaces.
- `node scripts/check.mjs --changed` : code 0, **vert**, quatre tests npm réussis ;
  sortie dans `.harness-state/tickets/T098/correction-check-changed.log`.
  `git diff --check` : code 0.
- `node scripts/check.mjs` après correction : code 0, **vert**, **1 190 tests JS réussis**
  sur 101 fichiers et **84 tests Python, dont un ignoré**, résultat OK ; sortie dans
  `.harness-state/tickets/T098/correction-check-full.log`.
- Nouveau verdict : **TERMINÉ**, unique constat mineur corrigé, aucune réserve ni
  contestation. Verdict mis à jour dans `.harness-state/tickets/T098/verdict.json`.
  Aucun fournisseur réel, installation, commit, push, sous-agent ou relecteur lancé.
