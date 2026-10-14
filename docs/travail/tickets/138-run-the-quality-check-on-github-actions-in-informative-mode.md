---
id: T138
titre: Run the quality check on GitHub Actions in informative mode
statut: a-faire
bloque_par: T031, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le contrôle unique ne tourne que sur le Mac du propriétaire, quand quelqu'un pense à le lancer. Rien ne
montre qu'il passe sur une machine propre, sous Linux, après un `npm ci`. Rien ne signale une
dépendance de production vulnérable.

Après ce ticket, un workflow GitHub Actions lance `node scripts/check.mjs` sur Ubuntu à chaque
déclencheur retenu. Il démarre en mode informatif : un échec se voit dans l'onglet Actions mais ne
bloque rien. Il ne relance jamais un test qui échoue, et une exécution périmée est annulée. Un audit
des dépendances de production l'accompagne, informatif lui aussi. Le passage en mode bloquant viendra
plus tard, quand la suite sera stable sur cette machine.

## Sources

- Constats : OPS-05, FLK-17, OPS-19, ADP-15
- Code concerné, à la version `0d5a954` :
  - aucun dossier `.github/` ; `package.json` n'a pas de champ `engines`. Node 24 est celui du Mac
    (`node --version` : `v24.12.0`).
  - `scripts/check.mjs` : le contrôle unique, sans option propre à la CI. Il lance les tests JS en
    séquentiel sous un budget de 20 minutes (`TEST_BUDGET_MS`, ligne 27) et les tests Python de
    `tests/` (fonction `pythonTests`, ligne 127). Sa comparaison avec `HEAD` n'a besoin que du dernier
    commit.
  - `tests/test_tv_ambient.py`, `tests/test_tv_capture_gate.py`, `tests/test_tv_control.py` : tests
    Python lancés par le contrôle ; le Mac les lance sous Python 3.14.2.
  - 9 fichiers de `tests/` citent `ffmpeg` ou `ffprobe` (`git grep -lE "ffmpeg|ffprobe" -- 'tests/*.cjs' | wc -l`).
  - aucun test de `tests/` ne lit l'historique Git du dépôt (`git grep -nE "'(show|log|rev-parse)'" -- tests`
    ne rend que l'aide `tests/helpers/harness-repo.cjs`, qui crée son propre dépôt). Seul
    `prototypes/lg-remote/test_ambient_relay.py` (ligne 325) lit un ancien commit, et il n'est pas lancé
    par le contrôle.
  - `devDependencies` contient `electron`, dont l'installation télécharge un binaire. Aucun fichier de
    `tests/` ne charge `electron` ni `playwright-core`, ni par `require` ni par `import` : un
    `ELECTRON_SKIP_BINARY_DOWNLOAD` suffit.
  - `deploy/runtime.env.example`, ligne 14 : rien n'a été mesuré sous Linux.
- Relecture de l'audit, qui prime sur le constat :
  - la CI démarre en informatif ;
  - elle appelle `node scripts/check.mjs`, sans recomposer ses étapes ;
  - elle ne relance jamais un test : un échec intermittent se reproduit et s'explique ;
  - l'option `--test-timeout` ne borne pas un fichier resté vivant : c'est le budget du contrôle et le
    `timeout-minutes` du travail qui le font ;
  - une quarantaine de tests instables demande une décision, et n'est pas dans ce ticket.

## Périmètre

- `.github/workflows/check.yml` (nouveau), un seul travail `check` :
  - déclencheurs : ceux de la décision du propriétaire ; à défaut de précision, `pull_request`, `push`
    sur `main`, et `workflow_dispatch` ;
  - `permissions: contents: read` au niveau du workflow ;
  - `concurrency` : groupe par workflow et par référence, `cancel-in-progress: true` ;
  - `runs-on: ubuntu-24.04`, `timeout-minutes: 30`, `continue-on-error: true` ;
  - étapes, dans cet ordre :
    1. `actions/checkout`, avec `persist-credentials: false` et la profondeur par défaut ;
    2. `actions/setup-node` avec `node-version: 24` et le cache `npm` ;
    3. `actions/setup-python` avec `python-version: "3.14"` ;
    4. `sudo apt-get update && sudo apt-get install -y ffmpeg` ;
    5. `npm ci`, avec `ELECTRON_SKIP_BINARY_DOWNLOAD: 1` dans `env` ;
    6. `node scripts/check.mjs` ;
    7. `npm audit --omit=dev --audit-level=high`, avec `continue-on-error: true` sur l'étape.
  - chaque action est citée par son étiquette de version majeure (`@vN`) ;
  - aucun secret, aucune relance (ni action de relance, ni boucle, ni `retry`), aucune variable
    `TVLENS_*`, aucun cache de `node_modules` hors du cache `npm` de `setup-node`.
- `CONTRIBUTING.md`, section « Vérifier une modification » : une ligne qui dit que le même contrôle
  tourne sur GitHub Actions en mode informatif, et qu'un échec là-bas se reproduit en local avant
  d'être écarté.
- À ne pas toucher : `scripts/check.mjs` et tout le harnais, `package.json`, les tests, le code.

## Critères d'acceptation

Chaque critère se vérifie par une commande, avec sa sortie dans le journal.

1. Cette commande sort en 0 et affiche `ok` :
   `ruby -ryaml -e 'w=YAML.load_file(".github/workflows/check.yml");j=w["jobs"]["check"];runs=j["steps"].map{|s|s["run"]}.compact;abort "permissions" unless w["permissions"]=={"contents"=>"read"};abort "concurrency" unless w["concurrency"]["cancel-in-progress"]==true;abort "informatif" unless j["continue-on-error"]==true;abort "duree" unless j["timeout-minutes"].is_a?(Integer)&&j["timeout-minutes"]<=30;abort "check" unless runs.include?("node scripts/check.mjs");abort "audit" unless runs.any?{|r|r.include?("npm audit --omit=dev --audit-level=high")};puts "ok"'`.
2. `grep -ciE "retry|attempt|rerun|secrets\." .github/workflows/check.yml` affiche `0`.
3. `grep -E "^\s*-?\s*uses:" .github/workflows/check.yml | grep -vcE "@v[0-9]+\s*$"` affiche `0`.
4. `grep -c "ELECTRON_SKIP_BINARY_DOWNLOAD" .github/workflows/check.yml` affiche au moins `1`, et
   `grep -c "ffmpeg" .github/workflows/check.yml` aussi.
5. `node_modules/.bin/prettier --check .github` sort en 0.
6. `grep -c "GitHub Actions" CONTRIBUTING.md` affiche au moins `1`.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Aucun test nouveau : le ticket n'ajoute qu'un fichier de workflow. Les preuves hors ligne sont les
critères 1 à 5, qui lisent sa structure. La première exécution sur GitHub n'est observable qu'après
un envoi au dépôt distant, que la session ne fait pas : le propriétaire la regarde, et le journal le
dit comme non vérifié.

## Hypothèses bloquantes

Décision attendue du propriétaire : sous quelles conditions la CI tourne sur GitHub. Elle porte sur
quatre points :
- les minutes Actions du compte, car le travail peut durer jusqu'à 30 minutes par exécution ;
- la visibilité du dépôt `DabiK/tvlens`, qui fixe le quota de minutes gratuites ;
- l'ajout ou non d'un runner macOS, dont la minute compte plus cher et sur lequel l'application tourne
  vraiment ;
- les déclencheurs : à chaque `push` sur toute branche, seulement sur `main` et les demandes de fusion,
  ou à la demande seulement.

Sans cette décision, le ticket ne commence pas. Le reste du lot n'en dépend pas.

Le critère 1 utilise `ruby` et son module `yaml`, présents sur le Mac (`/usr/bin/ruby`, 2.6.10). Verdict
BLOQUÉ si `ruby` ne lit pas le fichier, avec la sortie constatée.

## Journal
