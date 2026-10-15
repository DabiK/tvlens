---
id: T139
titre: Remove the legacy OpenRouter and codex exec adapters and the scripts using them
statut: termine
bloque_par: T163
adr: oui
installe: non
harnais: oui
supprime_tests: oui
niveau: standard
---

## Ce que le ticket livre

Deux adaptateurs hérités ne sont plus chargés par le produit : `adapters/openrouter.cjs` et
`adapters/codex-video-agent.cjs`. Ils subsistent par leurs évaluations et tests. Sur décision écrite du
propriétaire, le ticket retire ces deux adaptateurs, cinq scripts, trois entrées npm, cinq cas de test
et deux aides du vérificateur réservées à cet ancien chemin. Un ADR décrit la capacité perdue et le
moyen de retrouver le code dans Git. Les rôles Codex actifs, les embeddings OpenRouter et le serveur
MCP restent disponibles.

## Sources

- Constats ADP-11 et OPS-11. Décision du propriétaire, le 15/10 : après T150, documents historiques exclus des critères d’absence ;
  la suppression et l'abaissement du plancher restent à décider (« Hypothèses bloquantes »). `harnais: oui`,
  limité à la ligne `cas_de_test`, ne sert que si le propriétaire accepte cet abaissement.
- Code et lecteurs vérifiés à la version `e92c6a6` :
  - `adapters/openrouter.cjs:8`, `OpenRouterAdapter`, export à `adapters/openrouter.cjs:113` ; lecteurs :
    `scripts/probe-live.cjs:8`, `scripts/evaluate-actions.cjs:4`,
    `scripts/compare-inspection-strategies.cjs:6`, `scripts/diagnose-inspect.cjs:1` et
    `tests/adapters.test.cjs:7` ;
  - `adapters/codex-video-agent.cjs:7`, `CodexVideoAgent` ; lecteurs :
    `scripts/evaluate-actions.cjs:4` et `tests/chat-codex.test.cjs:23`. Les `probe-chat-*` importent
    `CodexSessionAgent` sous l’alias local `CodexVideoAgent`, par exemple
    `scripts/probe-chat-memory.cjs:2` : ils ne chargent pas cet adaptateur ;
  - `scripts/generate-action-fixtures.py:4` et sa génération à `scripts/generate-action-fixtures.py:18`
    produisent `.local/action-fixtures`, lu par `scripts/evaluate-actions.cjs:7` et
    `scripts/compare-inspection-strategies.cjs:11` ;
  - les sept fichiers à retirer représentent 356 lignes physiques : deux adaptateurs (113 et 47),
    `probe-live.cjs` (62), `evaluate-actions.cjs` (42), `compare-inspection-strategies.cjs` (46),
    `diagnose-inspect.cjs` (2), `generate-action-fixtures.py` (44) ;
  - `package.json:14`, `package.json:20` et `package.json:22` : `test:live`, `test:actions:live`,
    `test:strategies:live` ; les autres entrées restent ;
  - `adapters/codex-verifier.cjs:21` et `adapters/codex-verifier.cjs:23` : `isolatedEnvironment` et
    `invocation`, exportées à `adapters/codex-verifier.cjs:90`. L’import `childEnvironment, featureArgs`
    à `adapters/codex-verifier.cjs:2` ne sert qu’à ces aides ;
  - le runtime actif charge un autre fichier, `adapters/openrouter-embeddings.cjs`, à
    `runtime/session-runtime.cjs:24`. Les rôles actifs passent par le client de session actuel.
- Tests concernés :
  - quatre cas d’OpenRouter dans `tests/adapters.test.cjs:25`, `tests/adapters.test.cjs:31`,
    `tests/adapters.test.cjs:43`, `tests/adapters.test.cjs:56` : validation JSON et erreur sans secret,
    contenu image/audio, conversion temporelle vidéo et réservation libérée après un rejet 402 ;
  - un cas de l’agent hérité à `tests/chat-codex.test.cjs:22` : modèle, web audité et URLs ouvertes ;
  - `tests/verification.test.cjs:44` mêle les aides héritées et `childEnvironment`. Le chemin actif
    du vérificateur dispose aussi du test à `tests/verification.test.cjs:126` ;
  - `tests/codex-confinement.test.cjs:153`, `tests/codex-confinement.test.cjs:183`,
    `tests/codex-confinement.test.cjs:250` et `tests/codex-confinement.test.cjs:457` protègent le
    confinement actif ; `tests/architecture.test.cjs:20` interdit déjà le transport hérité aux rôles actifs.
- Le cliquet compte des lignes `test(`, pas les tests exécutés : `scripts/quality/metrics.mjs:74`.
  Le comptage statique sur ce worktree donne M = 966 ; `scripts/quality/baseline.json:8` donne P = 966.
  Retirer cinq cas donnerait 961, sous le plancher. L’ancienne marge annoncée par l’audit n’existe plus.
- Documentation présentant encore le chemin hérité : `SECURITY.md:152`, `docs/verification.md:51`,
  `docs/refactor-runtime.md:27`, `docs/refactor-runtime.md:71`, `docs/action-evaluation-rubric.md:3`.
  Les rapports datés `docs/night-features-delivery.md` et `docs/video-temporal-research.md` restent historiques.
- `scripts/README.md`, `tests/npm-scripts.test.cjs` et `tests/scripts-inventory.test.cjs` sont absents
  à ce commit : les anciennes dépendances à T098/T106 et leurs validations ne sont pas des prérequis.
  Les ADR existants vont jusqu’à 0013 ; choisir le prochain numéro libre lors de l’implémentation.

## Périmètre

Avant tout retrait, constater la décision écrite dans « Hypothèses bloquantes », relever le comptage M
et le plancher P du début de session. Après la décision du propriétaire, le plancher `cas_de_test` de `scripts/quality/baseline.json` baisse du nombre exact de cas `test(` supprimés, compté au début et à la fin de la session. C'est la seule modification du harnais permise : `harnais: oui` ne sert qu'à elle, et aucune autre mesure du cliquet ne change. Aucun cas de remplissage n'est ajouté.

À supprimer, une fois la décision du propriétaire écrite :

- `adapters/openrouter.cjs`, `adapters/codex-video-agent.cjs` ;
- `scripts/probe-live.cjs`, `scripts/evaluate-actions.cjs`, `scripts/compare-inspection-strategies.cjs`,
  `scripts/diagnose-inspect.cjs`, `scripts/generate-action-fixtures.py` ;
- les trois entrées npm citées, sans changer les autres commandes ;
- `isolatedEnvironment`, `invocation`, leur commentaire, leur export et leur import devenu inutilisé
  dans `adapters/codex-verifier.cjs`. L’export garde `{ CodexVerifier, verifierRole, schema }` ;
- les quatre cas OpenRouter de `tests/adapters.test.cjs` et son import, puis le seul cas hérité de
  `tests/chat-codex.test.cjs`. Les deux fichiers de test restent.

Pour chacun des cinq cas et chaque assertion héritée retirée du test de vérification, le journal
inventorie le comportement couvert et sa preuve sur le chemin actif, ou l’absence de preuve équivalente.
Une capacité d’évaluation abandonnée sur décision ne doit pas être présentée comme encore couverte.

À modifier :

- `tests/verification.test.cjs`, cas « Codex subprocess receives no provider key or token… » : retirer
  seulement les assertions sur `isolatedEnvironment` et `invocation`, dont le filtrage `older`, et leur
  commentaire devenu faux. Conserver toutes les assertions sur `childEnvironment` avec le même parent.
  Le titre décrit ce que le test vérifie encore ; son cas n’est pas supprimé ;
- `tests/architecture.test.cjs` : conserver les interdictions existantes et ajouter au même test
  l’absence des deux fichiers hérités ;
- les quatre documents actifs cités : annoncer le retrait et renvoyer à l’ADR. Si un inventaire de
  scripts existe au début de la session, en retirer les entrées supprimées sans créer cet inventaire ici.

À créer : un ADR au prochain numéro libre. Il décrit le périmètre retiré, la perte du rejeu des
actions et de la comparaison des stratégies, le commit qui permet de retrouver le code (le parent
du commit portant l’ADR), et les composants conservés. Un retour éventuel passerait par les ports
actuels. Il consigne M, P et le retrait des cinq cas ; l'autorisation de baisser le plancher vient de la décision
du propriétaire, pas de l'ADR.

À ne pas toucher :

- le harnais, sauf la seule ligne `cas_de_test` de `scripts/quality/baseline.json` autorisée ci-dessus ;
- `mcp/`, `adapters/openrouter-embeddings.cjs`, `scripts/probe-retrieval.cjs`, les `probe-chat-*`,
  `WatchSession.ask()` et `cleanupRawMedia` ;
- les rapports datés, `docs/audit-maintenabilite.md`, les tickets et les ADR déjà écrits ;
- si T098 a créé `tests/npm-scripts.test.cjs`, sa liste de fichiers payants reste : elle peut détecter
  une réintroduction de ces scripts. La fiche n’impose pas que ce test existe déjà.

## Critères d'acceptation

1. Les sept fichiers et les trois entrées npm cités sont absents. L’export du vérificateur est réduit
   comme prévu ; aucun appel à `invocation` ni `isolatedEnvironment` ne reste dans le code actif.
2. La recherche suivante est consignée en entier :
   ```sh
   git grep -nE -e 'codex-video-agent|openrouter\.cjs|OpenRouterAdapter|isolatedEnvironment|probe-live' \
     -e 'evaluate-actions|compare-inspection-strategies|diagnose-inspect|generate-action-fixtures' \
     -- . ':!docs/travail' ':!docs/adr' ':!docs/audit-maintenabilite.md' \
     ':!docs/audit-points-chauds.md' \
     ':!docs/night-features-delivery.md' ':!docs/video-temporal-research.md'
   ```
   Elle ne rend que les renvois de retrait dans les quatre documents actifs, les interdictions et
   assertions d’absence de `tests/architecture.test.cjs`, et, s’il existe, l’inventaire payant de
   `tests/npm-scripts.test.cjs`. Aucun autre lecteur de code ne reste. Les alias locaux des `probe-chat-*`
   sont vérifiés par leur import actuel, sans suppression fondée sur leur seul nom de classe.
3. `tests/adapters.test.cjs`, `tests/chat-codex.test.cjs`, `tests/verification.test.cjs`,
   `tests/architecture.test.cjs` et `tests/codex-confinement.test.cjs` passent, un fichier à la fois
   avec `node --test`. Le journal relève quatre cas de moins dans `adapters`, un de moins dans
   `chat-codex`, et autant dans les deux fichiers modifiés restants. Les assertions actives de
   vérification et les gardes existantes sont conservées.
4. Le compteur statique final vaut M − 5 et le plancher P − 5. `git diff -- scripts/quality/baseline.json`
   ne montre que la ligne `cas_de_test`. M, P, la commande de mesure et son résultat figurent au journal.
   La commande suivante et sa sortie sont aussi consignées au journal ; elle ne liste que
   `scripts/quality/baseline.json` :
   ```sh
   git status --porcelain -- .claude .codex .agents AGENTS.md CLAUDE.md docs/standards.md scripts/check.mjs scripts/quality scripts/loop
   ```
5. Si les tests `npm-scripts.test.cjs` ou `scripts-inventory.test.cjs` existent au début du ticket,
   chacun est lancé en séquentiel et reste vert. Leur absence est constatée, sans annoncer un contrôle
   réussi ni les créer uniquement pour satisfaire cette fiche.
6. `node scripts/check.mjs` est vert. Aucun script fournisseur n’est lancé.

## Test d'acceptation attendu

La garde d’architecture renforcée prouve l’absence physique des adaptateurs ; les tests restants des
adaptateurs et du chat protègent les chemins actifs. Le test de vérification conserve la frontière
publique `childEnvironment`. L’inventaire distingue les assertions actives conservées des évaluations
historiques volontairement abandonnées.

## Hypothèses bloquantes

Décision du propriétaire, le 15/10 (« Oui », en réponse à la question posée) : oui. Supprimer les deux adaptateurs
hérités, leurs cinq scripts d’évaluation, trois entrées npm et cinq tests, en acceptant la perte de ces évaluations
historiques, et autoriser l'abaissement du plancher `cas_de_test` du nombre exact de cas supprimés.

La question vise exactement les fichiers et cas inventoriés ci-dessus. Le propriétaire inscrit sa
décision au début de cette section ; un accord dans le journal seul ne lève pas le blocage. La décision du propriétaire, le 15/10, demande expressément de garder cette question tant que cette décision n’a pas été écrite par lui.

Fait mécanique : la boucle resserre le plancher à chaque intégration (`scripts/loop/run.mjs:407`). Au début de toute session, le comptage égale donc le plancher, et retirer un cas fait toujours passer le cliquet au rouge sans abaissement autorisé.

Si l’inventaire révèle qu’un comportement actif n’est couvert que par un test à retirer, la session
nomme ce comportement et s’arrête avant le retrait jusqu’à ce qu’un test du chemin actif le protège.

## Journal

Rafraîchi le 15/10 contre `e92c6a6` : dépendances T100/T106/T145 remplacées par T150, harnais fermé,
966 cas pour un plancher de 966 constatés, ancienne baisse automatique retirée. Lecteurs, tests et
imports devenus inutiles vérifiés ; validations conditionnées aux fichiers réellement présents ;
documents historiques exclus. Décision de suppression toujours attendue. Aucun test ni script fournisseur exécuté.

- Relecture documentaire le 15/10 contre `e92c6a6` : sources rendues pérennes dans
  `docs/audit-points-chauds.md` ou attribuées à la décision du propriétaire, le 15/10.
  Autorisation de harnais limitée à `cas_de_test` harmonisée dans le périmètre ; niveau standard (décision de l'orchestrateur : un retrait limité, relu par Opus, sans Astra).

### Exploration et inventaire avant retrait — 15 octobre 2026

- Base `eef7bf5`, témoin de hooks présent ; exploration et écarts dans `.harness-state/tickets/T139/`.
  Décision écrite du propriétaire constatée dans « Hypothèses bloquantes » avant toute suppression.
- Mesure initiale par `measure(process.cwd()).cas_de_test` de `scripts/quality/metrics.mjs` et lecture
  JSON de `scripts/quality/baseline.json` : **M = 1102, P = 1102**, cible **1097** pour les deux.
  Décompte statique `^\s*test\(` : adapters 5, chat-codex 7, verification 10, architecture 5,
  codex-confinement 17. Résultat conservé dans `mesure-initiale.json` du dossier d’état.
- `scripts/README.md` et `tests/scripts-inventory.test.cjs` absents : contrôles correspondants non lancés.
  `tests/npm-scripts.test.cjs` présent : sa liste payante est conservée et son exécution est prévue.
- Recherche des lecteurs : seuls les scripts et cas inventoriés chargent les deux anciens adaptateurs.
  Les trois `probe-chat-*` importent `CodexSessionAgent` sous un alias local ; ils restent.
  Le vérificateur des hôtes utilise déjà `CodexSessionClient`. Les embeddings et MCP restent.

Comportements des cinq cas retirés et preuves restantes :

| Cas retiré | Couverture abandonnée ou preuve active distincte |
| --- | --- |
| adapters : JSON invalide et erreur fournisseur sans secret | Contrat des complétions OpenRouter abandonné, aucune preuve équivalente revendiquée pour cet ancien transport. Le chemin de vérification actif conserve son traitement d’erreur et son isolation dans verification et codex-confinement. |
| adapters : blocs image/audio, modèle et absence de plugins | Formats image_url/input_audio OpenRouter abandonnés, sans équivalent. Le client actif n’accepte que des images incluses et refuse chemins, URL distantes et skills : cas « media inputs are inline images only » de codex-confinement. |
| adapters : conversion des temps relatifs d’une vidéo ralentie | Conversion fournisseur abandonnée, sans preuve équivalente revendiquée. Le chemin actif travaille sur des planches aux temps de session. |
| adapters : libération de réservation sur rejet HTTP 402 | Traitement de cette complétion payante abandonné, sans preuve équivalente. Les tests du registre de budget ne prouvent pas le traitement de ce rejet réseau. |
| chat-codex : modèle choisi, web audité, URL jamais ouverte écartée | « chat dispatches tools and applies changed model selection on subsequent turns » de refactor-boundaries protège le modèle actif ; « a grouped page open counts every page… » de codex-confinement protège l’audit et le filtrage par CodexSessionAgent. Le transport exec et son format JSONL ne sont plus évalués. |

Assertions héritées retirées du cas de vérification :

| Assertion retirée | Preuve sur le chemin actif ou perte |
| --- | --- |
| isolatedEnvironment(parent) filtre les secrets et garde HOME/CODEX_HOME | Wrapper abandonné ; les deux assertions childEnvironment restent avec le même parent ; le cas « a role is launched… with an allow-listed environment » de codex-confinement protège le lancement actif. |
| invocation contient ignore-user-config et ephemeral | Drapeaux de lancement exec abandonnés, aucune équivalence de ces drapeaux revendiquée. |
| sandbox read-only et répertoire -C temporaire | Le cas actif « a role is launched… » vérifie sandbox, cwd et dossiers séparés. |
| disabled(args) égale DISABLED_FEATURES | Le même cas actif vérifie les drapeaux transmis au processus App Server. |
| web_search live et dernier argument stdin « - » | Le rôle web actif est protégé par « the manual verifier is a web-only role… » de verification ; l’argument stdin exec est abandonné. |
| older filtre shell_tool/apps et ne transmet pas enable | Le cas « launch flags are limited to the names the installed binary knows… » de codex-confinement protège le filtrage du lancement actif ; la forme exec est abandonnée. |

Le rejeu des actions et la comparaison des stratégies sont abandonnés par décision, sans remplacement
ni revendication de couverture. Aucune assertion active de childEnvironment ni garde existante ne sera retirée.

### Retrait, cycle rouge/vert et contrôles ciblés — 15 octobre 2026

- `node --test tests/architecture.test.cjs` avant suppression : **rouge**, 4/5 passent,
  assertion `adapters/openrouter.cjs must remain absent` (`true !== false`), pas un échec d’import.
  Après retrait : **vert**, 5/5. Sorties intégrales dans `architecture-rouge.log` et `architecture-vert.log`.
- Sept fichiers, trois entrées npm et les cinq seuls cas autorisés supprimés.
  Les deux assertions `childEnvironment` et leur parent sont conservés à l’identique.
  Les interdictions existantes d’architecture restent ; deux assertions d’absence physique les complètent.
- ADR 0016 créé ; les quatre documents actifs annoncent le retrait et y renvoient.
  Les documents historiques et les composants exclus du périmètre sont conservés.
- `node_modules/.bin/eslint --prune-suppressions .` : code 0 ; seules les deux entrées
  des adaptateurs supprimés disparaissent du gel, sans ajout ni hausse.
- Tests exécutés **en séquentiel**, chacun par `node --test`, code 0 pour chaque fichier :

| Commande | Résultat observé | Écart de cas |
| --- | --- | --- |
| `node --test tests/adapters.test.cjs` | 1/1, aucun échec | 5 → 1, −4 |
| `node --test tests/chat-codex.test.cjs` | 6/6, aucun échec | 7 → 6, −1 |
| `node --test tests/verification.test.cjs` | 10/10, aucun échec | inchangé |
| `node --test tests/architecture.test.cjs` | 5/5, aucun échec | inchangé |
| `node --test tests/codex-confinement.test.cjs` | 17/17, aucun échec | inchangé |
| `node --test tests/npm-scripts.test.cjs` | 4/4, aucun échec | fichier inchangé |

Les sorties intégrales sont dans les six fichiers `*-final.log` du dossier d’état.
`tests/scripts-inventory.test.cjs` reste absent : contrôle non lancé.

Mesure finale, commande et sortie (code 0) :

```text
$ node --input-type=module <<'JS'
import fs from 'node:fs';
import { measure } from './scripts/quality/metrics.mjs';
const files = ['adapters', 'chat-codex', 'verification', 'architecture', 'codex-confinement'];
console.log(JSON.stringify({
  M: measure(process.cwd()).cas_de_test,
  P: JSON.parse(fs.readFileSync('scripts/quality/baseline.json')).cas_de_test,
  cases: Object.fromEntries(files.map(name => [name,
    (fs.readFileSync(`tests/${name}.test.cjs`, 'utf8').match(/^\s*test\(/gm) || []).length]))
}, null, 2));
JS
{
  "M": 1097,
  "P": 1097,
  "cases": {
    "adapters": 1,
    "chat-codex": 6,
    "verification": 10,
    "architecture": 5,
    "codex-confinement": 17
  }
}

Exit: 0
```

La mesure initiale a été exécutée avec `node --input-type=module`, en important le même
`measure` et en lisant le même JSON de plancher, avant toute modification ; résultat intégral :

```json
{
  "M": 1102,
  "P": 1102,
  "cases": {
    "tests/adapters.test.cjs": 5,
    "tests/chat-codex.test.cjs": 7,
    "tests/verification.test.cjs": 10,
    "tests/architecture.test.cjs": 5,
    "tests/codex-confinement.test.cjs": 17
  },
  "inventories": {
    "scripts/README.md": false,
    "tests/npm-scripts.test.cjs": true,
    "tests/scripts-inventory.test.cjs": false
  }
}
```

La baisse est exactement de cinq cas statiques et de cinq au plancher, sans cas ajouté.
Diff du plancher (code 0), seule ligne modifiée :

```text
$ git diff -- scripts/quality/baseline.json
diff --git a/scripts/quality/baseline.json b/scripts/quality/baseline.json
index 6663ee7..d14b4bb 100644
--- a/scripts/quality/baseline.json
+++ b/scripts/quality/baseline.json
@@ -5,5 +5,5 @@
   "tests_nommes_par_chantier": 9,
   "process_env_hors_config": 8,
   "inner_html": 2,
-  "cas_de_test": 1102
+  "cas_de_test": 1097
 }

Exit: 0
```

Recherche d’absence complète, commande et sortie (code 0) :

```text
$ git grep -nE -e 'codex-video-agent|openrouter\.cjs|OpenRouterAdapter|isolatedEnvironment|probe-live' -e 'evaluate-actions|compare-inspection-strategies|diagnose-inspect|generate-action-fixtures' -- . ':!docs/travail' ':!docs/adr' ':!docs/audit-maintenabilite.md' ':!docs/audit-points-chauds.md' ':!docs/night-features-delivery.md' ':!docs/video-temporal-research.md'
SECURITY.md:152:- **Chemin historique retiré.** `adapters/codex-video-agent.cjs`, son lancement `codex exec` et les évaluations associées sont supprimés. Voir [la décision de retrait](docs/adr/0016-retrait-des-adaptateurs-d-evaluation-herites.md) pour les capacités perdues et leur récupération dans Git.
docs/action-evaluation-rubric.md:3:Le générateur `scripts/generate-action-fixtures.py`, le rejeu des actions et la comparaison
docs/refactor-runtime.md:27:Les adaptateurs historiques `adapters/codex-video-agent.cjs` et `adapters/openrouter.cjs`, les scripts d’évaluation dont `evaluate-actions.cjs` et leurs cinq cas de test sont supprimés. Le rejeu des actions et la comparaison des stratégies sont abandonnés. Le chat actif, les embeddings OpenRouter et le serveur MCP restent disponibles. Voir [la décision de retrait](adr/0016-retrait-des-adaptateurs-d-evaluation-herites.md).
docs/verification.md:53:`adapters/codex-video-agent.cjs` et les aides de lancement qu’il utilisait dans le
tests/architecture.test.cjs:53:  for (const filename of ['adapters/openrouter.cjs', 'adapters/codex-video-agent.cjs']) {
tests/architecture.test.cjs:57:    assert.doesNotMatch(fs.readFileSync(path.join(root, filename), 'utf8'), /require\(['"]\.\/codex-video-agent\.cjs['"]\)/, filename);
tests/npm-scripts.test.cjs:7:  "probe-live.cjs",
tests/npm-scripts.test.cjs:9:  "evaluate-actions.cjs",
tests/npm-scripts.test.cjs:11:  "compare-inspection-strategies.cjs",

Exit: 0
```

Aucun lecteur actif supplémentaire. Les alias des trois sondes ont été revérifiés par
`rg -n CodexSessionAgent:CodexVideoAgent scripts/probe-chat-memory.cjs scripts/probe-chat-web.cjs scripts/probe-chat-sources.cjs`
(code 0, trois imports de `adapters/codex-session-agent.cjs` ; sortie dans `alias-chat.log`).

Contrôle du périmètre du harnais, commande et sortie complètes :

```text
$ git status --porcelain -- .claude .codex .agents AGENTS.md CLAUDE.md docs/standards.md scripts/check.mjs scripts/quality scripts/loop
 M scripts/quality/baseline.json

Exit: 0
```

`git diff --check` : code 0, aucune sortie.
Contrôle qualité des fichiers modifiés, commande et sortie complètes :

```text
$ node scripts/check.mjs --changed
✔ règles par fichier
✔ format
✔ lint
✔ gel du lint
✔ cliquet
    Mesures améliorées : lignes_longues_prod : 509 → 471, lignes_longues_tests : 1703 → 1696, catch_vides_prod : 38 → 36, process_env_hors_config : 8 → 6
✔ tests JS (4 fichier(s))
    ℹ tests 22
    ℹ pass 22
    ℹ fail 0
check : vert

Exit: 0
```

Aucun script fournisseur, aucune TV, aucun VPS ni identifiant utilisé. Le contrôle complet est lancé ;
son résultat sera consigné ci-dessous avant le verdict.

- Vérification de la frontière publique :
  `node -e "console.log(Object.keys(require('./adapters/codex-verifier.cjs')))"`, code 0,
  sortie `[ 'CodexVerifier', 'verifierRole', 'schema' ]`.
- Comparaison JSON de `package.json` avec `HEAD` : seules les trois entrées autorisées disparaissent.
  Comparaison JSON du plancher : seule `cas_de_test` baisse de cinq. Les sept chemins sont absents.
  Le texte du ticket avant `## Journal` est conservé, avec le statut en-cours déjà présent au démarrage.

### Contrôle complet et remise à la boucle — 15 octobre 2026

Commande et sortie intégrales, après les contrôles ciblés :

```text
$ node scripts/check.mjs
✔ règles par fichier
✔ format
✔ lint
✔ gel du lint
✔ cliquet
    Mesures améliorées : lignes_longues_prod : 509 → 471, lignes_longues_tests : 1703 → 1696, catch_vides_prod : 38 → 36, process_env_hors_config : 8 → 6
✔ tests JS (103 fichier(s))
    ℹ tests 1210
    ℹ pass 1210
    ℹ fail 0
✔ tests Python
    Ran 84 tests in 27.106s

    OK (skipped=1)
check : vert

Exit: 0
```

Le compteur statique de 1097 diffère des 1210 tests exécutés : des tests sont générés à l’exécution.
Les 84 tests Python annoncés incluent un cas ignoré ; ce cas n’est pas déclaré exécuté.
Aucun échec, aucune relance d’un test instable. Aucun script fournisseur lancé.

Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T139/verdict.json` : critères couverts,
relecture et intégration laissées à la boucle. Aucun commit ni push. Les fichiers non suivis
préexistants de `design/continuous-context/` et `experiments/` restent sans modification.

### Réserves à la clôture

- .harness-state/tickets/T139/relecture-1.md : `.env.example:9-10` — hors périmètre

  - **Ce qui ne va pas** : le commentaire dit encore « Les scripts historiques OpenRouter de comparaison acceptent aussi OPENROUTER_MODEL et TVLENS_INSPECTION_MODEL ». Ces scripts sont supprimés par le diff (`evaluate-actions.cjs`, `compare-inspection-strategies.cjs`, `diagnose-inspect.cjs`, `probe-live.cjs`), donc la phrase est devenue fausse. Les deux variables restent lues par `adapters/config.cjs:12` et `adapters/config.cjs:20`. La recherche du critère 2 ne voit pas ce fichier, car elle cherche des noms de fichiers.
  - **Ce qui est attendu** : retirer ou reformuler cette phrase, dans un ticket qui a le droit de modifier `.env.example` (T134 documente les réglages). Le ticket autorise seulement « les quatre documents actifs cités ».
- .harness-state/tickets/T139/relecture-1.md : `adapters/codex-confinement.cjs:11` — hors périmètre

  - **Ce qui ne va pas** : le commentaire dit « One list for the App Server roles and `codex exec`. » Le lancement `codex exec` (`invocation`, `CodexVideoAgent`) n'existe plus. Seuls les rôles App Server utilisent encore `DISABLED_FEATURES` et `featureArgs` (`adapters/codex-session-client.cjs:307`).
  - **Ce qui est attendu** : enlever la mention de `codex exec` dans un ticket qui touche `codex-confinement.cjs`. Ce fichier n'est pas dans le périmètre de T139.
- .harness-state/tickets/T139/relecture-1.md : **Écart accepté, élagage de `eslint-suppressions.json`** : `docs/standards.md` oblige tout ticket qui rend une suppression inutile à l'élaguer, même hors de son périmètre. Le diff retire seulement les deux entrées des adaptateurs supprimés, sans rien ajouter ni augmenter. Le fichier ne fait pas partie des chemins protégés contrôlés par le critère 4.
- .harness-state/tickets/T139/relecture-1.md : **Écart accepté, M = P = 1102 au lieu de 966** : ce n'est pas un écart à un critère. Le ticket demande de relever M et P au début de la session ; 966 était la valeur à `e92c6a6`. La cible M − 5 = P − 5 = 1097 est tenue.
- .harness-state/tickets/T139/relecture-1.md : **Écart accepté, `tests/npm-scripts.test.cjs` présent** : le critère 5 prévoit ce cas. Le test a été lancé, il est vert, et sa liste payante est conservée.

  Aucun constat contesté : c'est une première relecture.
