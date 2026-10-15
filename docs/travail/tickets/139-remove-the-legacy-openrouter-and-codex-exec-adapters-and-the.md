---
id: T139
titre: Remove the legacy OpenRouter and codex exec adapters and the scripts using them
statut: a-faire
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
