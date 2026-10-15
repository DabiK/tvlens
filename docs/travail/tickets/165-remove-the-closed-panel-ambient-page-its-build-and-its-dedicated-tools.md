---
id: T165
titre: Remove the closed-panel ambient page, its build and its dedicated tools
statut: termine
bloque_par: T163
adr: oui
installe: non
harnais: oui
supprime_tests: oui
niveau: standard
---

## Ce que le ticket livre

Après décision écrite du propriétaire, la page d'alertes panneau fermé, son paquet et ses outils
d'essai dédiés disparaissent du dépôt. Les cartes et l'activité du panneau ouvert restent disponibles.
T166 retire ensuite superviseur/relais/routes, T181 le gate de capture et T182 les intégrations
de page et documents ; ce premier ticket ne supprime pas encore toute la chaîne ambient.

## Sources

- `docs/audit-points-chauds.md`, section D « Coupes », ambient panneau fermé.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Code vérifié à `e92c6a6`, fichiers dédiés et tests lus en entier :
  - `tv/app/ambient.html:10` charge `surveillance-overlay.js` puis `ambient.js` ;
    `tv/app/ambient.js:99` peint après accord du contrôleur, et `tv/app/ambient.js:164`
    rapporte les touches puis ferme la page ;
  - `tv/app/ambient.css:1` ne sert qu'à cette page ; `tv/app/appinfo.ambient.json:2` lui donne
    l'identifiant `org.tvlens.ambient`, distinct de `tv/app/appinfo.json:2` pour le panneau ;
  - `scripts/package-tv-ambient.mjs:19` distingue les identifiants production/sonde et
    `scripts/package-tv-ambient.mjs:241` définit l'assemblage des paquets ;
    `scripts/package-tv-ambient.mjs:288` appelle l'empaqueteur générique LG, qui n'est pas à supprimer ;
  - `scripts/smoke-tv-ambient.mjs:15` importe ce packager ;
    `scripts/simulate-tv-ambient.mjs:1` simule le superviseur et
    `scripts/probe-tv-ambient-capture.mjs:1` reçoit les captures de sonde ;
  - `tests/tv-ambient-params.test.cjs:7` importe le parseur et
    `tests/tv-ambient-params.test.cjs:95` le packager : six cas exclusivement dédiés à ambient ;
  - `tests/tv-app-compat.test.cjs:50` attend `ambient.js` parmi les scripts, et deux cas dédiés
    commencent à `tests/tv-app-compat.test.cjs:77` et `tests/tv-app-compat.test.cjs:102` ;
  - `tv/app/surveillance-overlay.js:172` définit la file du panneau ouvert,
    `tv/app/surveillance-overlay.js:351` son parseur de paramètres ambient et
    `tv/app/surveillance-overlay.js:435` le rendu partagé ; ce fichier n'est pas dédié ;
  - `tests/tv-overlay-queue.test.cjs:1` protège les cartes, activités et file du panneau ouvert ;
    `scripts/smoke-tv-overlay.mjs:1` est lui aussi partagé, distinct du smoke à supprimer.
- Contrôle statique au même commit, sans exécution des tests : le comptage de
  `scripts/quality/metrics.mjs:74` donne 966 cas JavaScript déclarés ;
  `scripts/quality/baseline.json:8` fixe leur minimum à 966. La marge évoquée par l'audit ancien
  n'existe donc plus à cette version. Le retrait prévu enlève huit cas JavaScript dédiés.
- L'ADR 0011 décrit encore la page ambient comme second consommateur du rendu. Il reste une pièce
  historique ; un nouvel ADR consigne le retrait, sans réécrire cette décision passée.

## Périmètre

- Supprimer exactement ces huit fichiers de produit et d'outils :
  - `tv/app/ambient.html`, `tv/app/ambient.js`, `tv/app/ambient.css`, `tv/app/appinfo.ambient.json` ;
  - `scripts/package-tv-ambient.mjs`, `scripts/smoke-tv-ambient.mjs`,
    `scripts/simulate-tv-ambient.mjs`, `scripts/probe-tv-ambient-capture.mjs`.
- `supprime_tests: oui`, sous réserve de la décision ci-dessous : supprimer le fichier
  `tests/tv-ambient-params.test.cjs` et les deux cas exclusivement ambient de `tv-app-compat`.
  Retirer `ambient.js` de sa liste attendue et les imports devenus inutiles, tout en gardant les
  gardes générales de scripts classiques, d'API, de CSS et de HTML, avec leurs assertions.
- Conserver `surveillance-overlay.js`, son parseur et ses exports jusqu'au nettoyage des intégrations
  dans T182. Conserver `appinfo.json`, `index.html`, `icon.png`, les vues du panneau, les fixtures de
  file partagées et `tests/tv-overlay-queue.test.cjs`.
- Conserver `tv/ambient.py`, ses tests Python, contrôleur, capture, relais et coordination native :
  T166 et T181 les possèdent dans cet ordre. Conserver aussi `prototypes/lg-sidebar/package.py`
  et les autres prototypes LG.
- Ajouter un ADR au premier numéro libre qui nomme la capacité retirée, les huit fichiers et les
  tests retirés et le commit permettant de les retrouver. Cet ADR couvre **tout le retrait** et ses
  quatre étapes : page/outils (T165), superviseur/relais/routes et coordination native (T166), gate
  de capture et primitives résiduelles (T181), intégrations de page/documents (T182). Il décrit les
  cartes ouvertes conservées et le retrait différé de `/v1/surveillance/overlay` et de sa projection,
  sans supposer l’absence d’autres consommateurs. T166, T181 et T182 ont `adr: non` et le citent.
  Mettre à jour `docs/lg-ambient.md` pour annoncer le retrait de la page et des outils, sans transformer
  les anciennes validations non exécutées en résultats matériels.
- Après la décision du propriétaire, le plancher `cas_de_test` de `scripts/quality/baseline.json` baisse du nombre exact de cas `test(` supprimés, compté au début et à la fin de la session. C'est la seule modification du harnais permise : `harnais: oui` ne sert qu'à elle, et aucune autre mesure du cliquet ne change. Aucun cas de remplissage n'est ajouté. Les documents historiques, tickets et ADR existants ne
  font pas partie d'un critère d'absence. Aucune installation, désinstallation ou opération TV/VPS.

## Critères d'acceptation

1. Les huit fichiers dédiés sont absents. `git diff --name-status` sur le périmètre du ticket montre
   leurs suppressions et celle du test dédié ; aucun fichier partagé de panneau ou d'empaqueteur
   générique n'est supprimé. Aucun fichier n'est déplacé dans un dossier d'archives de remplacement.
2. Une recherche `rg -n` des quatre noms de scripts et des chemins de page supprimés dans le code
   produit, les scripts et les tests restants ne trouve aucun import, lecture ou lancement cassé.
   Chaque occurrence résiduelle éventuelle est classée au journal : le backend natif encore présent
   jusqu’aux étapes T166/T181 et les nouvelles mentions de retrait ne sont pas des fichiers à supprimer ici.
3. `tests/tv-app-compat.test.cjs` continue de vérifier tous les scripts, styles et pages restants.
   `tests/tv-overlay-queue.test.cjs`, les modèles du panneau et les tests de navigation passent sans
   réduction de leurs assertions sur le panneau ouvert. Les tests Python du superviseur et de la
   capture encore présents passent en séquentiel, sans appeler les outils supprimés.
4. Avant suppression, le journal inventorie les huit cas retirés et ce qu'ils vérifient. Il mesure
   le comptage M et le plancher P au début de la session. À la fin, le comptage vaut M − n et le plancher
   P − n, n étant le nombre de cas supprimés ; `git diff -- scripts/quality/baseline.json` ne montre que la
   ligne `cas_de_test`. Aucun test de remplissage n'est ajouté.
   La commande suivante et sa sortie sont consignées au journal ; elle ne liste que
   `scripts/quality/baseline.json` :
   ```sh
   git status --porcelain -- .claude .codex .agents AGENTS.md CLAUDE.md docs/standards.md scripts/check.mjs scripts/quality scripts/loop
   ```
5. Le nouvel ADR et la page `docs/lg-ambient.md` distinguent page/outils retirés, intégrations encore
   présentes à chaque étape et cartes du panneau ouvert conservées. L’ADR décrit les quatre étapes
   ci-dessus et le maintien provisoire de l’API overlay serveur. Ils ne décrivent aucun déploiement effectué.
6. Les suites concernées sont exécutées en séquentiel, puis `node scripts/check.mjs` est vert.
   Les scripts de smoke ou de sonde ne sont pas lancés pour prouver leur suppression.

## Test d'acceptation attendu

Frontière : l'arborescence réelle pour les suppressions et les imports résiduels ;
`tests/tv-app-compat.test.cjs`, `tests/tv-overlay-queue.test.cjs`, `tests/tv-panel.test.cjs`
et `tests/tv-remote-navigation.test.cjs` pour le panneau conservé. Les suites Python de T166 sont
encore présentes et doivent charger le backend sans les outils supprimés. Les assertions qui restent
sur le panneau ouvert ne sont pas affaiblies au motif qu'ambient disparaît.

## Hypothèses bloquantes

Décision du propriétaire, le 15/10 (« Oui », en réponse à la question posée) : oui. Supprimer définitivement l’affichage ambient panneau fermé, son superviseur, son relais et ses outils dédiés, tout en conservant la surveillance et les cartes du panneau ouvert, et autoriser l'abaissement du plancher `cas_de_test` du nombre exact de cas supprimés.

Ce ticket propose le premier temps de cette suppression, avec le retrait des huit cas JavaScript
dédiés cité plus haut ; `supprime_tests: oui` ne s'applique qu'après la décision inscrite au début de
cette section. T166, T181 puis T182 portent les trois étapes suivantes. Un accord écrit seulement ailleurs ne lève pas l'attente.

Fait mécanique : la boucle resserre le plancher à chaque intégration (`scripts/loop/run.mjs:407`). Au début de toute session, le comptage égale donc le plancher, et retirer un cas fait toujours passer le cliquet au rouge sans abaissement autorisé. L'état d'une TV installée n'est
pas établi et ne fait pas partie de cette suppression dans le dépôt.

## Journal

### Exploration et inventaire avant retrait — 15 octobre 2026

Base `8f6fab9`. Consignes, code dédié, appelants, tests et ADR lus ; exploration et écarts prévus
consignés dans `.harness-state/tickets/T165/`. Le témoin des hooks est présent. Les dossiers non suivis
préexistants `design/continuous-context/` et `experiments/` sont conservés.

Commande de mesure (sortie complète dans `mesures-debut.log`) :

```sh
node --input-type=module -e 'import { measure } from "./scripts/quality/metrics.mjs"; import fs from "node:fs"; console.log(JSON.stringify({M:measure(process.cwd()),P:JSON.parse(fs.readFileSync("scripts/quality/baseline.json","utf8"))},null,2));'
```

Résultat : **M = 1104, P = 1104**. Les autres mesures et planchers sont identiques :
`lignes_longues_prod=471`, `lignes_longues_tests=1696`, `catch_vides_prod=36`,
`tests_nommes_par_chantier=9`, `process_env_hors_config=6`, `inner_html=2`.
Retrait prévu **n = 8**, cibles **M − n = 1096, P − n = 1096**.

Inventaire des cas exclusivement dédiés, avant suppression :

| Fichier | Cas | Comportement retiré |
| --- | --- | --- |
| `tests/tv-ambient-params.test.cjs` | `valid launch parameters are accepted as an object and as the JSON string webOS hands over` | Paramètres de lancement objet/JSON et profil passthrough |
| même fichier | `anything the page must not act on is refused as a whole: nothing to paint` | Rejet version, nonce, contrôleur, boîte et contenu invalides |
| même fichier | `bounds: the page caps the display time and takes a box that touches the screen edge` | Bornes de durée, géométrie, texte, port et hôtes |
| même fichier | `pill and notice carry only what they draw` | Paramètres de pastille et avis local |
| même fichier | `debug, marker, freeze, probe and every unknown field are dropped by the production parser` | Élimination des champs de sonde et des champs inconnus |
| même fichier | `the production package carries no probe file and the probe package never takes the production id` | Assemblage production/sonde, contenu, manifestes et identifiants isolés |
| `tests/tv-app-compat.test.cjs` | `the ambient page has no secret, no remote client, no focusable element and no media` | Isolement de page, requêtes locales, absence de focus/média et manifeste distinct |
| même fichier | `the probe page generated by the packager obeys the same engine floor and stays out of tv/app` | Compatibilité moteur et isolement de la sonde générée |

Les trois gardes générales de compatibilité et toutes leurs assertions sur les fichiers restants
seront conservées. Aucun cas de remplissage. Les cinq entrées ESLint portant les fichiers supprimés
seront élaguées selon les standards, sans changer la configuration du lint.

### Retrait, preuves ciblées et comptage final

Commandes et sorties conservées sous `.harness-state/tickets/T165/` :

- `node .harness-state/tickets/T165/acceptance.mjs` : rouge avant suppression sur l’assertion
  `dedicated ambient files must be absent` (les neuf chemins existent), puis vert après suppression :
  `PASS: nine dedicated files absent, shared files retained, M = P = 1096, delta = 8`.
  La première mise au point du contrôle avait une erreur de chemin d’import, consignée séparément
  dans `absence-erreur-import.log` et corrigée avant le rouge d’assertion retenu comme preuve.
- `node --test --test-concurrency=1 tests/tv-app-compat.test.cjs tests/tv-overlay-queue.test.cjs tests/tv-panel.test.cjs tests/tv-remote-navigation.test.cjs` :
  **65 tests réussis, 0 échec, 0 sauté** (`panneau-vert.log`). Les trois gardes générales et les
  assertions file/modèles/navigation du panneau ouvert restent ; leurs fichiers partagés sont inchangés.
- `python3 -B -m unittest tests/test_tv_control.py tests/test_tv_ambient.py tests/test_tv_capture_gate.py` :
  **84 tests, OK, 1 sauté** en 27,234 s (`python-conserve.log`). Le cas sauté est le scénario optatif
  au rythme réel ; il n’a pas été activé. Contrôleur, superviseur et capture se chargent sans les outils retirés.
- `node_modules/.bin/eslint --prune-suppressions .` : code 0 (`eslint-elagage.log`). Exactement cinq
  entrées de fichiers disparus retirées, sans ajout ni hausse du gel : packager, récepteur de captures,
  simulateur, smoke ambient et page ambient. Aucun autre fichier de gel n’est modifié.

`git diff --name-status -- tv/app scripts tests` (`fichiers-supprimes.log`, code 0) :

```text
D scripts/package-tv-ambient.mjs
D scripts/probe-tv-ambient-capture.mjs
M scripts/quality/baseline.json
D scripts/simulate-tv-ambient.mjs
D scripts/smoke-tv-ambient.mjs
D tests/tv-ambient-params.test.cjs
M tests/tv-app-compat.test.cjs
D tv/app/ambient.css
D tv/app/ambient.html
D tv/app/ambient.js
D tv/app/appinfo.ambient.json
```

Aucun déplacement ni archive de remplacement. Le contrôle `git diff --exit-code` sur les modules
partagés du panneau, leurs tests/fixtures, les fichiers Python, les prototypes, le smoke overlay,
les couches core/adapters/runtime/server/mcp/app et `package.json` rend 0, sans sortie
(`fichiers-conserves.log` contient la commande complète).

Recherche d’appels cassés (`appels-restants.log`) :

```sh
rg -n 'package-tv-ambient|smoke-tv-ambient|simulate-tv-ambient|probe-tv-ambient-capture|ambient\.(html|js|css)\b|appinfo\.ambient\.json' core adapters runtime server mcp app tv scripts tests package.json
```

Sortie vide, code 1 : aucune occurrence restante. La borne de mot distingue bien `ambient.js` de
`ambient.json` : les configurations natives de `tv/ambient.py`, `tv/controller.py` et de leurs tests
restent à T166/T181. Les mentions de page/outils dans l’ADR 0017 et le nouvel état de `docs/lg-ambient.md`
décrivent explicitement le retrait ; les mentions datées de la suite de cette page, des autres documents
historiques, tickets et ADR existants restent historiques et ne sont pas des appels exécutables.
Les intégrations `/ambient`, le parseur partagé et ses exports restent à T182.

L’ADR **0017** couvre page/outils, superviseur/relais/routes et coordination, gate et primitives,
puis intégrations de page/documents. Il conserve explicitement l’API overlay serveur et sa projection
jusqu’à un cadrage distinct des consommateurs. Le document LG distingue cet état de l’historique du
13 octobre et du protocole abandonné, toujours non exécuté ; aucun déploiement n’est annoncé.

La même commande de mesure qu’au début donne (`mesures-fin.json` et `mesures-fin.log`) :
**M final = 1096 = 1104 − 8 ; P final = 1096 = 1104 − 8**. Le détail des deux fichiers de tests donne
6 → 0 et 5 → 3, soit huit cas supprimés, aucun ajouté. Les mesures de lignes longues de tests et de
catch vides baissent naturellement à 1674 et 32 ; leurs planchers restent respectivement 1696 et 36.
`git diff -- scripts/quality/baseline.json` ne change que `cas_de_test : 1104 → 1096` ; tous les autres
planchers restent identiques (`diff-suppressions.log`).

Commande de frontière du harnais :

```sh
git status --porcelain -- .claude .codex .agents AGENTS.md CLAUDE.md docs/standards.md scripts/check.mjs scripts/quality scripts/loop
```

Sortie observée, code 0 (`perimetre-harnais.log`) :

```text
 M scripts/quality/baseline.json
```

Aucun script de smoke/sonde supprimé n’a été lancé, ni navigateur, fournisseur, TV ou VPS sollicité.

### Contrôles qualité et remise à la boucle

- `node scripts/check.mjs --changed` : **vert**, règles/format/lint/gel/cliquet réussis,
  3 tests du fichier modifié réussis (`check-changed.log`).
- `node scripts/check.mjs` : **vert**, règles/format/lint/gel/cliquet réussis,
  **1260 tests JavaScript réussis dans 103 fichiers**, puis **84 tests Python, OK, 1 sauté**
  en 26,714 s (`check-complet.log`). Les suites ont été exécutées en séquentiel.
- `git diff --check` : code 0, sans sortie. Le nouvel ADR est présent ; le texte du ticket avant
  `## Journal` est conservé avec son statut préexistant `en-cours`. L’audit du gel vérifie exactement
  le retrait des cinq entrées des fichiers disparus (`audit-final.log`).

Verdict écrit dans `.harness-state/tickets/T165/verdict.json` : **TERMINÉ**, critères couverts.
Aucun commit ni push ; la relecture et l’intégration restent à la boucle.

### Réserves à la clôture

- .harness-state/tickets/T165/relecture-1.md : **`docs/architecture.md:116`** (hors périmètre)
     - **Problème :** le document d'architecture dit encore que le superviseur « lance une page minuscule qui dessine une carte » et que le chemin attend sa validation sur la TV. Cette page n'existe plus.
     - **Attendu :** annoncer le retrait et renvoyer à l'ADR 0017. T182 possède cette mise à jour (sa ligne 60 cite ce fichier).
- .harness-state/tickets/T165/relecture-1.md : **`README.md:89`** (hors périmètre)
     - **Problème :** le README dit que l'affichage panneau fermé est « désactivé par défaut tant qu'il n'est pas validé sur la TV ». La capacité est désormais abandonnée, pas en attente de validation.
     - **Attendu :** même correction, dans T182, qui cite `README.md` parmi les documents actifs.
