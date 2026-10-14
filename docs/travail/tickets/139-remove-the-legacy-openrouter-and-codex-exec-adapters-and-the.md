---
id: T139
titre: Remove the legacy OpenRouter and codex exec adapters and the scripts using them
statut: a-faire
bloque_par: T100, T106, T145
adr: oui
installe: non
harnais: oui
supprime_tests: oui
---

## Ce que le ticket livre

Deux adaptateurs ne servent plus au produit, et leurs propres commentaires le disent :
`adapters/openrouter.cjs` (modèle de vision par OpenRouter) et `adapters/codex-video-agent.cjs` (agent qui
lance `codex exec` avec le serveur MCP). L'app, le serveur et le runtime n'en chargent aucun. Ils ne vivent
plus que par quatre scripts d'évaluation payants, trois entrées npm, cinq tests et deux fonctions du
vérificateur qui n'existent que pour eux. Un cinquième script, `generate-action-fixtures.py`, ne fabrique que
le corpus que lisent deux de ces scripts.

Après ce ticket, et seulement si le propriétaire le décide, tout cet ensemble est supprimé. Un ADR dit ce qui
est retiré, ce qui ne l'est pas (les embeddings OpenRouter, `probe-retrieval`, le serveur MCP) et comment
retrouver le code dans l'historique. La garde d'architecture qui interdisait de dépendre de l'agent hérité
devient une garde qui interdit son retour.

## Sources

- Constats : ADP-11, OPS-11
- Après ce ticket, `WatchSession.ask()` (`core/session.cjs`) n'a plus d'appelant hors des tests : son seul
  appelant de script était `scripts/probe-live.cjs` (`watch.ask(question)`). Son retrait est hors de ce
  ticket.
- Code vérifié à la version `0d5a954` :
  - `adapters/openrouter.cjs`, classe `OpenRouterAdapter` (ligne 8, export ligne 113). Seuls lecteurs :
    - `scripts/probe-live.cjs:8` ;
    - `scripts/evaluate-actions.cjs:4` ;
    - `scripts/compare-inspection-strategies.cjs:6` ;
    - `scripts/diagnose-inspect.cjs:1` ;
    - `tests/adapters.test.cjs:7`.
    `runtime/session-runtime.cjs:25` charge `adapters/openrouter-embeddings.cjs`, un autre fichier, qui reste.
  - `adapters/codex-video-agent.cjs`, classe `CodexVideoAgent` : ligne 5, importe `invocation` et
    `isolatedEnvironment` de `./codex-verifier.cjs` ; ligne 8, `mcpScript` vers `mcp/server.cjs`. Seuls
    lecteurs : `scripts/evaluate-actions.cjs:4` et `tests/chat-codex.test.cjs:23`. Les
    `scripts/probe-chat-*.cjs` importent `CodexSessionAgent` sous l'alias `CodexVideoAgent` : ils ne dépendent
    pas du fichier hérité.
  - `scripts/generate-action-fixtures.py` n'importe aucun adaptateur. Il écrit `.local/action-fixtures`, que
    lisent `evaluate-actions.cjs` et `compare-inspection-strategies.cjs`.
  - `adapters/codex-verifier.cjs` : commentaire « Former `codex exec` launch, kept only for the legacy CLI
    agent » au-dessus de `isolatedEnvironment` ; fonctions `isolatedEnvironment` et `invocation` ; export
    `{ CodexVerifier, isolatedEnvironment, invocation, verifierRole, schema }` (ligne 90).
  - Scripts à supprimer : `probe-live.cjs`, `evaluate-actions.cjs`, `compare-inspection-strategies.cjs`,
    `diagnose-inspect.cjs`, `generate-action-fixtures.py`. Entrées npm : `test:live`, `test:actions:live`,
    `test:strategies:live`. Aucun autre fichier que `package.json` ne cite ces trois noms.
  - Tests retirés, cinq cas :
    - `tests/adapters.test.cjs`, les quatre tests d'`OpenRouterAdapter` : « adapter validates JSON and never
      exposes raw provider errors containing secrets », « adapter sends image and audio in the documented
      content blocks », « video inspection converts provider-relative slow-motion times into original
      session times », « an HTTP 402 pre-generation rejection releases its reservation without erasing
      previous costs » ;
    - `tests/chat-codex.test.cjs`, « Codex adapter passes the selected model, permits audited web, and
      drops URLs never opened ».
  - `tests/verification.test.cjs`, test « Codex subprocess receives no provider key or token, and its launch
    follows the shared flag list » : il mêle `isolatedEnvironment`, `childEnvironment` et `invocation`
    (dont le filtrage des drapeaux inconnus, `older`). Le commentaire qui le précède parle d'`invocation`.
    Sur le chemin actif, la liste partagée des drapeaux est prouvée par `tests/codex-confinement.test.cjs`
    (`disabled(args)` égal à `DISABLED_FEATURES`), et le filtrage des drapeaux inconnus par `featureArgs(known)`
    dans le même fichier.
  - `tests/architecture.test.cjs`, test « active Codex roles do not depend on the legacy MCP transport » : il
    interdit `require('./codex-video-agent.cjs')` à quatre adaptateurs actifs.
  - `scripts/quality/baseline.json`, mesure `cas_de_test` (617 à la version citée), sens `min` : elle ne peut
    que monter, et la boucle la resserre après chaque ticket. Retirer cinq cas la fait passer sous le
    plancher.
- Documentation qui décrit l'héritage comme présent :
  - `SECURITY.md`, puce « Chemin historique » ;
  - `docs/verification.md`, section « Premier essai (historique) : lancement `codex exec` » ;
  - `docs/refactor-runtime.md:27` et `:71` (« `CodexVideoAgent`, conservé pour les scripts d'évaluation ») ;
  - `docs/action-evaluation-rubric.md:3` (`generate-action-fixtures.py`).
  `docs/night-features-delivery.md` et `docs/video-temporal-research.md` sont des rapports datés : ils
  restent.
- `scripts/README.md` (T106) a une ligne par script supprimé. `tests/npm-scripts.test.cjs` (T098) nomme
  `probe-live.cjs`, `evaluate-actions.cjs` et `compare-inspection-strategies.cjs` dans sa liste de fichiers
  payants.
- `docs/adr/` va de `0000` à `0010` à la version citée ; aucun ADR ne traite d'OpenRouter ni de `codex exec`.

## Périmètre

À supprimer, seulement sur la décision du propriétaire :

- `adapters/openrouter.cjs` et `adapters/codex-video-agent.cjs`.
- Les cinq scripts cités et les trois entrées npm citées.
- `invocation` et `isolatedEnvironment` dans `adapters/codex-verifier.cjs`, avec le commentaire qui les
  présente ; l'export ne garde que `{ CodexVerifier, verifierRole, schema }`.
- `supprime_tests: oui` : les cinq cas de test cités, et l'import `OpenRouterAdapter` de
  `tests/adapters.test.cjs`. Raison : ils testent le seul code supprimé. Avant de les retirer, l'agent
  inscrit au journal, pour chacun, le comportement qu'il vérifie et le test du chemin actif qui couvre le
  même comportement, ou l'absence d'un tel test.

À modifier :

- `tests/verification.test.cjs`, test « Codex subprocess receives no provider key or token… » :
  l'assertion sur `isolatedEnvironment(parent)` sort, car les deux assertions sur `childEnvironment`, qui
  la suivent, prouvent déjà sur le même `parent` que les clés et jetons ne passent pas. Les assertions sur
  `invocation` (drapeaux `--ignore-user-config`, `--ephemeral`, `--sandbox`, `-C`, liste désactivée,
  recherche web, filtrage `older`) sortent aussi. La dernière phrase du commentaire qui précède le test,
  sur `invocation`, sort. Les assertions sur `childEnvironment` restent toutes, inchangées. Le titre ne
  garde que ce que le test vérifie encore. L'inventaire du journal (voir « À supprimer ») couvre aussi ces
  assertions retirées.
- `tests/architecture.test.cjs`, test « active Codex roles do not depend on the legacy MCP transport » :
  l'interdiction de `require('./codex-video-agent.cjs')` reste, et une assertion ajoutée exige que
  `adapters/codex-video-agent.cjs` et `adapters/openrouter.cjs` n'existent pas. La garde se renforce.
- Documentation : les quatre documents cités disent que le chemin hérité a été retiré, et renvoient à l'ADR.
  `scripts/README.md` perd les lignes des scripts supprimés.
- `harnais: oui` : `scripts/quality/baseline.json`, mesure `cas_de_test` seulement. L'agent mesure
  `cas_de_test` au début de la session (M) et en fin de session. La fin doit valoir exactement M − 5. Si le
  plancher est alors au-dessus de M − 5, il descend à M − 5, et pas plus bas. Aucune autre mesure n'est
  touchée, ni aucun autre fichier du harnais.

À créer : un ADR dans `docs/adr/`, au premier numéro libre. Il dit :

- ce qui est retiré, et le commit à partir duquel le retrouver (« le commit qui porte cet ADR ») ;
- ce qui reste : `adapters/openrouter-embeddings.cjs`, `scripts/probe-retrieval.cjs`, `mcp/server.cjs` et
  l'entrée npm `mcp` ;
- la capacité perdue : rejouer l'évaluation des actions et la comparaison des stratégies d'inspection ;
- la condition d'un retour : un adaptateur qui passe par les ports actuels, pas une restauration de ces
  fichiers ;
- la baisse du plancher `cas_de_test`, de cinq cas, et sa raison.

À ne pas toucher :

- `cleanupRawMedia` (lot:L06 et lot:L01 modifient son fichier et son test), `mcp/`,
  `adapters/openrouter-embeddings.cjs`, `scripts/probe-retrieval.cjs`, les `probe-chat-*`, les rapports
  datés.
- `tests/npm-scripts.test.cjs` : sa liste de fichiers payants garde ses noms. Retirer une règle d'un test
  n'est pas l'objet de ce ticket.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. La commande suivante ne rend que les lignes énumérées plus bas :
   ```sh
   git grep -nE -e "codex-video-agent|openrouter\.cjs|OpenRouterAdapter|isolatedEnvironment|probe-live" \
     -e "evaluate-actions|compare-inspection-strategies|diagnose-inspect|generate-action-fixtures" \
     -- . ':!docs/travail'
   ```
   - le nouvel ADR ;
   - `docs/night-features-delivery.md` et `docs/video-temporal-research.md` ;
   - les renvois historiques ajoutés à `SECURITY.md`, `docs/verification.md`, `docs/refactor-runtime.md` et
     `docs/action-evaluation-rubric.md` ;
   - dans `tests/architecture.test.cjs`, l'interdiction du `require` et l'assertion d'absence ajoutée ;
   - dans `tests/npm-scripts.test.cjs`, la liste des fichiers payants.
   La sortie complète figure au journal.
2. `git grep -n "\binvocation(" -- adapters tests` ne rend rien.
3. `node --test tests/adapters.test.cjs tests/chat-codex.test.cjs tests/verification.test.cjs
   tests/architecture.test.cjs` passe. Le journal donne le nombre de tests de chaque fichier avant et après :
   4 de moins pour `adapters`, 1 de moins pour `chat-codex`, autant pour les deux autres.
4. `git diff HEAD -- scripts/quality/baseline.json` ne montre, au plus, que la ligne `cas_de_test`, et sa
   nouvelle valeur est M − 5. Les deux mesures figurent au journal.
5. `node --test tests/npm-scripts.test.cjs tests/scripts-inventory.test.cjs` passe.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/architecture.test.cjs`, avec l'assertion d'absence ajoutée, et `tests/verification.test.cjs`
réduit à `childEnvironment`. Frontière : les fichiers du dépôt et l'environnement transmis à un processus
Codex. Les tests restants des adaptateurs et du chat prouvent que rien d'actif ne dépendait du code retiré.

## Hypothèses bloquantes

Décision attendue du propriétaire : supprimer `adapters/openrouter.cjs`, `adapters/codex-video-agent.cjs`,
les cinq scripts d'évaluation qui en dépendent et leurs trois entrées npm, retirer cinq tests et baisser de
cinq le plancher `cas_de_test` de `scripts/quality/baseline.json`. Cela retire la possibilité de rejouer
l'évaluation des actions et la comparaison des stratégies d'inspection. Sans accord écrit du propriétaire
dans le journal, verdict BLOQUÉ : rien n'est supprimé, le plancher ne bouge pas, et les fichiers ne sont pas
déplacés dans un dossier d'archives à la place. Si l'inventaire du journal montre qu'un comportement du
chemin actif n'était couvert que par un des cinq tests retirés : verdict BLOQUÉ, avec le comportement,
jusqu'à ce qu'un test du chemin actif le couvre.

## Journal
