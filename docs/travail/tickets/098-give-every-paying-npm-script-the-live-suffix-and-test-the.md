---
id: T098
titre: Give every paying npm script the :live suffix and test the rule
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
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

- Constats : DOC-12, TSTC-18
- Code vérifié à la version `0d5a954` :
  - `package.json`, bloc `scripts` lignes 7-30 :
    - ligne 13 `test:electron:verify-live` (`smoke-electron.mjs --live-verifier`) ;
    - ligne 15 `test:verify` (`scripts/probe-verify.cjs`, vérificateur Codex réel) ;
    - ligne 16 `test:electron:deep-live` (`--live-video-agent`) ;
    - ligne 19 `test:electron:full-live` (`--live-video-agent --live-inspection`) ;
    - ligne 25 `test:codex:speed` (`scripts/probe-codex-speed.cjs`, Codex réel).
  - Les entrées déjà conformes : `test:live` ligne 14, `test:actions:live` ligne 20, `test:retrieval:live`
    ligne 21, `test:strategies:live` ligne 22, `screenshots:live` ligne 26.
  - Entrée hors ligne qui passe des drapeaux sans être payante : `test:electron:sheets` ligne 23
    (`--local-inspection --inspection-strategy=sheets-crop`).
  - `scripts/smoke-electron.mjs` lignes 7-9 : les seuls drapeaux payants qu'il lit sont `--live-verifier`,
    `--live-video-agent` et `--live-inspection`.
- Fichiers qui citent les anciens noms, hors `package.json` (`git grep` à la version citée) :
  - `docs/installation.md:154` et `:156`, des instructions ;
  - `docs/verification.md:26-27`, des instructions ;
  - `docs/reexamen-validation.md:48`, le relevé daté du 28 septembre 2026.
  `CONTRIBUTING.md`, à la section qui suit `npm run test:electron`, énonce la convention `*:live`.
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
3. `git grep -nE "verify-live|deep-live|full-live|test:verify([^:]|$)|test:codex:speed" -- . ':!docs/travail'`
   ne rend qu'une ligne : `docs/reexamen-validation.md:48`, le relevé daté laissé tel quel.
4. `node -e 'const s=require("./package.json").scripts;console.log(Object.keys(s).length)'` rend le même nombre
   en fin de session qu'au début (22 à la version citée ; d'autres lots ont pu en ajouter depuis) : aucune
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
