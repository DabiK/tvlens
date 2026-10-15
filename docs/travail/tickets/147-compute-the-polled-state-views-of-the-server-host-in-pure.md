---
id: T147
titre: Compute the polled state views of the server host in pure functions
statut: termine
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

### Cadrage

- Consignes, ticket, hôte, appelant HTTP, tests protecteurs et ADR pertinents lus ; exploration et écarts dans `.harness-state/tickets/T147/`.
- `git status --short` : ticket déjà modifié (`en-cours`), `design/continuous-context/` et `experiments/` non suivis ; éléments conservés.
- `wc -l runtime/headless-runtime.cjs` : **1113** lignes avant extraction.
- Aucun écart prévu ; mémoïsation et lectures en direct conservées dans l'hôte.

### Tests et extraction

- `node --test tests/state-views.test.cjs` : cinq cycles rouges/verts observés, un comportement à la fois (panneau, en-tête, cartes, assemblage, overlay). Sorties conservées dans `panel-{red,green}.log`, `header-{red,green}.log`, `cards-{red,green}.log`, `assembly-{red,green}.log` et `overlay-{red,green}.log` du dossier d'état. Les rouges sont des échecs d'assertion, pas d'import.
- `node --test --test-concurrency=1 tests/state-views.test.cjs tests/server-state-views.test.cjs tests/server-surveillance.test.cjs tests/timeline-server.test.cjs tests/remote-server.test.cjs` : **12 tests verts**, exécutés en séquentiel (`protective-tests.log`). Les fichiers existants ne sont pas modifiés.
- `node_modules/.bin/prettier --write --ignore-path /dev/null runtime/state-views.cjs tests/state-views.test.cjs` : code de sortie 0 (`format.log`).
- `node scripts/check.mjs --changed` : **vert**, 5 tests, règles/format/cliquet verts ; lint non lancé car ESLint absent ou non configuré (`check-changed.log`).

### Mutation exigée

Valeur temporaire `PANEL_SEGMENTS = 41` dans `runtime/state-views.cjs` :

- `node --test tests/state-views.test.cjs` : **rouge**, code 1, assertion `41 !== 40`, 4 tests verts et 1 rouge (`mutation-state-views-red.log`).
- `node --test tests/server-state-views.test.cjs` : **rouge**, code 1, panneau contenant 41 passages dès `moment-860` au lieu de 40 dès `moment-861` (`mutation-server-state-views-red.log`).
- Valeur **40 rétablie**. `node --test --test-concurrency=1 tests/state-views.test.cjs tests/server-state-views.test.cjs` : **6 tests verts** (`mutation-restored-green.log`).

### Vérifications structurelles

- `wc -l runtime/headless-runtime.cjs` : **860** lignes à la fin, contre **1113** au cadrage, soit **253 lignes retirées**.
- `grep -cE "process\.|setTimeout|setInterval|Date\.now" runtime/state-views.cjs` : sortie **0** (code 1 normal de grep sans correspondance).
- `git diff --stat` : uniquement le ticket et `runtime/headless-runtime.cjs` parmi les fichiers suivis ; `git status --short` ajoute `runtime/state-views.cjs` et `tests/state-views.test.cjs`. Aucun autre test ni `server/http.cjs` modifié. Dossiers non suivis présents au départ conservés.
- `git diff --check` : code 0. Sorties dans `static-checks.log` du dossier d'état.

### Contrôle final et remise à la boucle

- `node scripts/check.mjs` : **vert**, code 0. Règles, format et cliquet verts ; **1074 tests JS verts** sur 92 fichiers, **84 tests Python, OK (1 ignoré)**. Lint non lancé : ESLint absent ou non configuré. Sortie conservée dans `.harness-state/tickets/T147/check-full.log`.
- Critères couverts, aucun écart ni reste de périmètre. Verdict `TERMINÉ` dans `.harness-state/tickets/T147/verdict.json` ; relecture et intégration laissées à la boucle. Aucun commit ni push.

### Reprise après relecture 1 — cadrage

- Rapport `.harness-state/tickets/T147/relecture-1.md`, ticket et journal, écarts, `git status --short` et `git diff` relus ; travail précédent conservé.
- Trois constats mineurs acceptés : déplacer la normalisation de l'absence de session dans la fonction pure, rétablir les deux commentaires d'origine. Test renforcé avant correction.
- Constats 4 et 5 conservés comme réserves hors périmètre (emplacement de `refusal` et défaut de langue `fr` dupliqué) ; aucun constat contesté.

### Reprise après relecture 1 — corrections

- Constat 1 : le test « overlay sans session » remet désormais `undefined` pour `sessionId` et `elapsedMs`, tout en exigeant `null` dans la réponse. `node --test tests/state-views.test.cjs` : **rouge**, 4 verts et 1 échec d'assertion sur ces deux champs (`correction-overlay-red.log`).
- `overlayView` applique désormais `sessionId ?? null` et `elapsedMs ?? null` ; l'hôte lui transmet `this.session?.id` et `watch?.now()`, sans lire l'heure dans le module pur. Même commande : **5 tests verts** (`correction-overlay-green.log`).
- Constats 2 et 3 : commentaire d'origine sur le registre rétabli en anglais, commentaire d'origine expliquant `refusal`, `status` et `code` rétabli au-dessus du constructeur. Vérification à la lecture ; aucun test de texte source ajouté.
- `node scripts/check.mjs --changed` : **vert**, 5 tests, règles/format/cliquet verts ; lint non lancé car ESLint absent ou non configuré (`correction-check-changed.log`).

### Réserves hors périmètre de la relecture 1

- Constat 4 : `refusal` reste dans `runtime/state-views.cjs`, dont l'hôte l'importe aussi pour ses refus hors vues ; un module d'erreurs de transport dédié serait un travail ultérieur.
- Constat 5 : la langue par défaut `fr` reste dupliquée entre la vue pure et `snapshot`, cette dernière restant dans l'hôte conformément au périmètre.
- Vérifications structurelles après correction : `wc -l runtime/headless-runtime.cjs` donne toujours **860**, soit **253 lignes retirées** ; `grep -cE "process\.|setTimeout|setInterval|Date\.now" runtime/state-views.cjs` donne **0** ; `git diff --check` sort à 0. Sorties dans `correction-static-checks.log`.

### Reprise après relecture 1 — contrôle final

- `node scripts/check.mjs` : **vert**, code 0. **1074 tests JS verts** sur 92 fichiers, **84 tests Python OK (1 ignoré)** ; règles, format et cliquet verts. Lint non lancé : ESLint absent ou non configuré (`correction-check-full.log`).
- Les trois constats mineurs sont corrigés. Nouveau verdict `TERMINÉ` dans `.harness-state/tickets/T147/verdict.json`, avec les deux réserves hors périmètre dans `reste`. Relecture et intégration laissées à la boucle ; aucun commit ni push.

### Réserves à la clôture

- Relecture 1, constat 4 hors périmètre : refusal reste dans le module de vues bien que l’hôte l’utilise aussi pour ses autres refus ; envisager un module d’erreurs de transport dans un travail ultérieur.
- Relecture 1, constat 5 hors périmètre : la langue par défaut fr reste dupliquée entre stateView et snapshot, que le ticket maintient dans l’hôte.
- .harness-state/tickets/T147/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 2 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
- .harness-state/tickets/T147/relecture-2.md : **Écart accepté, `refusal` déplacé dans le module (déclaré dans `ecarts.md`) :** même décision qu'à la relecture 1, et pour la même raison. `surveillanceHistory` et `surveillanceDetail`, que le ticket ordonne de déplacer, ont besoin de `refusal`. Le laisser dans l'hôte aurait obligé à le recopier. Le problème de cohésion reste en réserve 1.
