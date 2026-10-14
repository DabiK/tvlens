---
id: T147
titre: Compute the polled state views of the server host in pure functions
statut: a-faire
bloque_par: T118, T119
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

`HeadlessRuntime` fait environ 1150 lignes et mêle huit rôles. Le premier qui s'en sort sans risque est
le calcul des vues que la TV interroge (`chat`, `panel`, `overlay`) : ce sont déjà, pour moitié, des
fonctions de module pures, posées en tête du fichier. Après ce ticket, elles vivent dans
`runtime/state-views.cjs`, avec les constantes de taille des vues et la liste d'autorisation `HEADER`.
Le corps de `derive`, de `view` et d'`overlay` devient un appel à ces fonctions. Elles se testent sans
monter d'hôte, et l'hôte perd au moins 200 lignes. Les réponses HTTP ne changent pas.

## Sources

- Constats :
  - CORE-02 (`docs/audit-maintenabilite.md`, section « CORE-02 — `HeadlessRuntime` classe-dieu »),
    premier temps : « sortir les vues pures ». La nuance du relecteur précise que ces fonctions
    s'extraient sans attendre le découpage du cycle de vie ;
  - GAP3-08 (même fichier) propose `runtime/wire/state-views.cjs`. Le dossier reste plat : le test
    « shared runtime and headless transport do not import Electron » (`tests/architecture.test.cjs:15-16`)
    lit `runtime/` avec un `readdirSync` non récursif.
- Plan court : section « Plan court » de `docs/travail/tickets/INDEX.md`.
- Code concerné, à la version `0d4c495` de `runtime/headless-runtime.cjs` (le nom d'abord, la ligne
  ensuite ; T118 et T119 auront décalé les lignes) :
  - constantes des vues : `VIEWS` (l. 30), `PANEL_SEGMENTS`, `PANEL_JOBS`, `CHAT_JOBS`,
    `PANEL_FULL_CARDS`, `CARD_EXCERPT`, `GAPS_TAIL`, `HISTORY_PAGE`, `HISTORY_MAX` (l. 31-39) et
    `HEADER` (l. 42-60). `SESSIONS_LISTED` (l. 37) sert à `sessions()` (l. 972) ;
  - aides : `active` (l. 61, aussi lue par la sauvegarde des questions et par `cancel`), `clip`
    (l. 78), `ordinal` (l. 82) ;
  - fonctions de module déjà pures : `lightPassage` (l. 85), `lightJob` (l. 102), `captureGapsOf`
    (l. 137), `surveillanceHistory` (l. 152), `surveillanceDetail` (l. 219) ;
  - méthodes : `snapshot` (l. 457-481), `derive` (l. 483-546), `view` (l. 547-587), `overlay`
    (l. 588-606). La mémoïsation de `derive` tient à `this.derived`, `this.revision` et à l'identifiant
    de la session. `view` lit en direct, sans passer par la mémoïsation, `watch.accepting`,
    `watch.asking`, `watch.readOnly`, `watch.now()` et `storage()` ;
  - exports (l. 1144-1150) : `HeadlessRuntime`, `surveillanceHistory`, `surveillanceDetail`,
    `READ_ONLY`, `VIEWS`.
- Appelants : `server/http.cjs` (`runtime.etag`, `runtime.snapshot`, `runtime.overlay` à la l. 101,
  `runtime.surveillanceHistory` et `runtime.surveillanceDetail` aux l. 217 et 219).
- Tests protecteurs : `tests/server-state-views.test.cjs` (la l. 78 affirme 40 passages dans la vue
  `panel`), `tests/timeline-server.test.cjs`, `tests/server-surveillance.test.cjs`,
  `tests/remote-server.test.cjs`.

## Périmètre

- À modifier :
  - créer `runtime/state-views.cjs`. Il reçoit les constantes et les fonctions pures listées plus haut,
    et trois fonctions nouvelles, qui prennent en paramètres ce qu'elles lisent aujourd'hui sur `this` :
    - une qui calcule la partie mémoïsable de `derive` à partir de l'état publié, des questions et du
      titre ;
    - une qui assemble la vue `chat` ou `panel` à partir de cette partie et des valeurs lues en direct ;
    - une qui assemble la vue `overlay`.
    Leurs noms disent ce qu'elles calculent ;
  - `runtime/headless-runtime.cjs` : importer ces fonctions. `derive` garde sa mémoïsation, `view` et
    `overlay` gardent leurs lectures en direct, et chacune délègue son calcul. `active` et `clip`, s'ils
    servent encore à l'hôte, s'importent du module au lieu d'être recopiés ;
  - créer `tests/state-views.test.cjs`.
- À ne pas toucher :
  - les réponses de `/v1/state`, `/v1/overlay` et des routes de surveillance, au champ près ;
  - les exports de `runtime/headless-runtime.cjs` : `surveillanceHistory`, `surveillanceDetail` et
    `VIEWS` restent exportés par lui (réexportés depuis le nouveau module) ;
  - `etag` et la mémoïsation, qui restent dans l'hôte : elles dépendent de compteurs de l'hôte ;
  - `leave()`, `closeSession({` et `settleQuestions(` restent dans `runtime/headless-runtime.cjs` :
    `tests/architecture-f07.test.cjs:578-591` le vérifie sur le texte du fichier ;
  - `server/http.cjs` et les tests existants.
- Le module ne lit ni `process`, ni l'horloge, ni une minuterie : l'heure (`serverNowMs`,
  `elapsedMs`) arrive en paramètre.

## Critères d'acceptation

1. `tests/state-views.test.cjs` appelle les fonctions de `runtime/state-views.cjs` sans construire de
   `HeadlessRuntime`, et vérifie au moins :
   - la vue `panel` borne les passages à `PANEL_SEGMENTS` et les questions à `PANEL_JOBS`, en gardant
     toute question encore en cours ;
   - un champ de l'état publié absent de `HEADER` n'apparaît pas dans l'en-tête de la vue ;
   - une carte ancienne au résumé plus long que `CARD_EXCERPT` porte `summaryClipped: true` ;
   - la vue `overlay` sans session rend `sessionId: null` et `elapsedMs: null`.
2. Une mutation temporaire de `PANEL_SEGMENTS` à 41 dans `runtime/state-views.cjs` fait échouer un test
   de `tests/state-views.test.cjs` et `tests/server-state-views.test.cjs`. Les deux sorties rouges sont
   notées au journal, puis la valeur est rétablie.
3. `runtime/headless-runtime.cjs` perd au moins 200 lignes : `wc -l` au début du ticket (noté au jalon de
   cadrage) moins `wc -l` à la fin, sortie dans le journal.
4. `grep -cE "process\.|setTimeout|setInterval|Date\.now" runtime/state-views.cjs` rend 0.
5. `git diff --stat` ne cite aucun fichier sous `tests/` hors `tests/state-views.test.cjs`, ni
   `server/http.cjs`.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/state-views.test.cjs`, frontière : les fonctions exportées par `runtime/state-views.cjs`, nourries
d'un état publié construit dans le test. `tests/server-state-views.test.cjs`, inchangé, prouve que les
réponses HTTP n'ont pas bougé.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **Les vues seules.** La phase explicite qui remplacerait `closing` et `releasing` (second temps de
  CORE-02) dépend du cycle de vie et reste derrière T145.
- **Un fichier à plat dans `runtime/`**, pas `runtime/wire/` : le test d'architecture lit `runtime/` sans
  descendre dans les sous-dossiers.
- **La vue complète (`snapshot`) reste dans l'hôte.** Elle lit l'index, le quota et la session entière :
  c'est une vue de compatibilité, pas une vue bornée.
- **Après T118 et T119**, qui retirent de ce fichier la sauvegarde des questions, le préchauffage et la
  consigne active : le critère 3 se mesure sur le fichier qu'ils laissent.

## Journal
