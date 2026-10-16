---
id: T025
titre: State the layer rules as one table in the architecture test
statut: termine
bloque_par: T199
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Une table unique garde le sens des dépendances entre les six couches JavaScript, y compris les
dépendances inverses que les gardes actuelles ne couvrent pas. Les règles d'import placées dans deux
tests de comportement rejoignent cette garde, sans perdre leurs assertions comportementales.

## Sources

- `docs/audit-architecture.md`, rapport A, A.1 et D3 ; décision du propriétaire, le 16/10 :
  rouvrir après T199, qui attend T178, sans les anciennes chaînes de chantier.
- Code vérifié à `8340014` : `tests/architecture.test.cjs:8` parcourt déjà récursivement les sources
  et filtre les extensions ; `tests/architecture.test.cjs:16` garde le cœur,
  `tests/architecture.test.cjs:26` garde Electron dans runtime/serveur,
  `tests/architecture.test.cjs:33` garde les drapeaux du domaine,
  `tests/architecture.test.cjs:46` interdit aux services du cœur le cas d'usage session et
  `tests/architecture.test.cjs:57` garde les rôles Codex et l'absence des adaptateurs retirés.
- `tests/architecture-guard.test.cjs:18` copie la garde réelle dans des arbres isolés ;
  `tests/architecture-guard.test.cjs:49` prouve l'isolation sans adaptateurs produit.
  Le parcours plat et son erreur EISDIR décrits par l'ancienne fiche sont déjà traités par T164.
- Lectures de source à migrer : `tests/chat-trace.test.cjs:55` interdit textuellement `adapters/`
  dans DeepAsk ; `tests/surveillance.test.cjs:624` cherche des mots liés au chat et à DeepAsk.
  La preuve comportementale `h.chatReads === 0` est à `tests/surveillance.test.cjs:623`.
- Relevé statique récursif des imports littéraux relatifs à cette version : adapters → core 7 ;
  runtime → core 13 et adapters 22 ; server → adapters 9 et runtime 1 ; mcp → core 2 ;
  app → adapters 16, core 5 et runtime 7. Aucune arête inverse relevée par ce relevé textuel.
  Il ne prétend pas analyser les chemins construits à l'exécution.
- Appelant : `scripts/check.mjs:166` découvre les tests puis les exécute en séquentiel.
  ADR 0014 : règles de couches dans le test d'architecture ; ADR 0016 : adaptateurs retirés absents.

## Périmètre

- Modifier `tests/architecture.test.cjs` et `tests/architecture-guard.test.cjs`. Réutiliser le parcours
  récursif existant ; un seul relevé des imports littéraux (`require`, `from`, import dynamique,
  import statique à effet de bord),
  commentaires ignorés, et une résolution des chemins relatifs servent les règles de couches.
- Table permise, imports internes à chaque couche compris :

  | Couche | Autres couches permises |
  | --- | --- |
  | core | aucune |
  | adapters | core |
  | runtime | core, adapters |
  | server | core, adapters, runtime |
  | mcp | core |
  | app | core, adapters, runtime |

  Un import relatif qui sort de ces six racines est refusé. Un chemin parent qui reste dans sa
  couche est permis, y compris dans `core/`. Les imports externes du cœur restent interdits.
- La table est une donnée : une liste de zones, chacune désignée par un motif de chemin (`core/**`,
  `adapters/**`…), avec les zones qu'elle peut importer. Une sous-zone plus précise (par exemple
  `core/memory/**`, ou `core/shared/**` comme noyau partagé) s'ajoute plus tard par une ligne de table,
  sans réécrire le relevé ni les gardes. La zone d'un fichier est le motif le plus précis qui le
  contient. Aujourd'hui, la table ne contient que les six couches ci-dessus : aucune sous-zone n'est créée.
  Un test vérifie ce mécanisme sur un arbre temporaire, avec une sous-zone de fixture et une arête refusée.
- Garder les interdictions de globales du cœur, d'Electron dans runtime/serveur, les drapeaux et les
  rôles Codex. La règle des services du cœur vise le module session après résolution, y compris
  depuis un sous-dossier ; adapter sa fixture au vrai chemin vers ce module.
- Porter ici l'interdiction Surveillance → DeepAsk. Retirer seulement les lectures de source citées
  de `tests/chat-trace.test.cjs` et `tests/surveillance.test.cjs`, avec les imports disque devenus
  inutiles. Garder `h.chatReads === 0` et tous les scénarios.
- Les arbres isolés couvrent les six racines. Adapter la sélection de gardes et vérifier qu'un
  test nommé s'est réellement exécuté, comme le fait déjà le banc d'isolation.
- Ne modifier ni production, ni harnais, ni standards, ni dépendances. Aucun analyseur installé.
  `tests/helpers/source-shape.cjs` conserve les commentaires : ne pas l'utiliser pour les retirer.
  Les fautes injectées restent dans des copies temporaires, jamais dans le worktree partagé.

## Critères d'acceptation

1. La garde passe sur le dépôt et examine chaque racine. Le journal donne fichiers et arêtes
   relevés ; une racine absente ou un parcours vide dans la fixture complète fait échouer le test.
2. Les fixtures prouvent `require` avec les deux guillemets, `from` sur plusieurs lignes, import
   dynamique ou à effet de bord, commentaires ignorés et fichiers non JavaScript ignorés. Elles acceptent
   `../../core/x.cjs` depuis `adapters/nested/` et `../ports.cjs` depuis `core/nested/`, mais refusent
   adapters → runtime, runtime → app et toute sortie des couches, avec les chemins en diagnostic.
3. Dans ces arbres, importer un adaptateur depuis DeepAsk, DeepAsk depuis Surveillance, ou le module
   session depuis un service imbriqué fait échouer la règle correspondante. Retirer chaque faute
   rend le cas vert ; les sorties rouge et verte vont au journal.
4. Les gardes précédentes restent exercées aux profondeurs et extensions déjà couvertes. Aucun cas
   ne disparaît ; chat-trace et surveillance ne lisent plus leur source pour ces règles. Leurs
   assertions de diagnostic et d'indépendance du chat gardent leurs valeurs attendues.
5. À l'implémentation, lancer en séquentiel les tests architecture, architecture-guard, chat-trace
   et surveillance, puis `node scripts/check.mjs`. Consigner les résultats réellement observés.

## Test d'acceptation attendu

`tests/architecture-guard.test.cjs` exerce la garde réelle dans une arborescence temporaire.
Le refus adapters → runtime constitue la première preuve : il échappe aux règles actuelles.
Le banc ne lit pas le texte du parcours pour deviner son comportement.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T199 implique T178. T023 n'est plus un prérequis : parcours et banc sont déjà livrés.
La table extensible par sous-zone vient de l'analyse de conception du 16/10 (Opus et Astra) : la cible découpera
l'intérieur de `core/`, `runtime/` et `adapters/` par contexte. Ce ticket prépare ce mécanisme, sans rien découper.
Les chemins dynamiques restent une limite nommée du relevé. Une arête produit contredisant la table
est signalée avant toute extension de la table ou modification produit.

## Journal

### Exploration

- Lecture du ticket, des règles, des deux skills, des quatre fichiers de tests, de leur appelant
  et des ADR 0014/0016 ; exploration et écarts consignés dans `.harness-state/tickets/T025/`.
- `git status --short` et `git diff` : seul le statut initial du ticket est modifié ; les répertoires
  non suivis `design/continuous-context/` et `experiments/` préexistent et restent hors périmètre.
- Première preuve prévue : refus adapters → runtime dans une copie temporaire de la garde réelle.

### Implémentation et preuves ciblées

- Table unique de six motifs `/**`, imports internes explicités, sélection de la zone la plus
  précise côté source et destination. Une ligne ajoutée dans la copie temporaire pour
  `core/memory/**` refuse ses sorties et les entrées non déclarées, puis accepte les corrections.
- Un inventaire commun sert toutes les gardes : parcours récursif existant, commentaires ignorés,
  imports littéraux et chemins résolus. Le cœur accepte désormais ses chemins parents internes.
  Les chemins construits à l'exécution restent hors du relevé.
- `node --test --test-concurrency=1 --test-name-pattern='^layer table rejects an adapter' tests/architecture-guard.test.cjs`
  : rouge observé (`0 !== 1`, l'ancienne garde accepte adapters → runtime), puis vert, 1/1.
  Sorties : `.harness-state/tickets/T025/layer-red.log` et `layer-green.log`.
- `node --test --test-concurrency=1 --test-name-pattern='^layer table (accepts parent|ignores|rejects an (absent|empty))' tests/architecture-guard.test.cjs`
  : quatre rouges observés, puis 4/4 verts ; parent interne, commentaires et chaînes ignorés,
  racines absente et vide refusées. Sorties : `inventory-red.log`, `inventory-green.log` dans l'état.
- `node --test --test-concurrency=1 --test-name-pattern='^(core service guard|surveillance dependency guard)' tests/architecture-guard.test.cjs`
  : deux rouges sur l'assertion de refus (`0 !== 1`), puis 2/2 verts après résolution des cibles.
  Sorties : `specialized-red.log`, `specialized-green.log` dans l'état.
- Le banc complet conserve tous les cas existants, adapte la fixture session à `../session.cjs`,
  crée les six racines et exige l'exécution effective de chacune des six gardes sélectionnées.
  Les refus des trois dépendances spécialisées produisent un diagnostic avec les chemins :
  `core/deep-ask.cjs depends on ../adapters/module.cjs -> adapters/module.cjs` ;
  `core/surveillance.cjs depends on core/deep-ask.cjs` ;
  `core/nested/service.cjs depends on the session use case`.
  Après retrait de chaque faute, le même arbre passe : `# pass 6`, `# fail 0`.
  Sorties rouges/vertes complètes et essai de sous-zone : `architecture-guard.log` et `targeted-final.log`.
- Les six formes couvertes sont require simple/double guillemet, from multiligne, réexport
  multiligne, import dynamique et import à effet de bord. Le banc conserve les trois profondeurs
  et trois extensions, couvre les six racines, les sorties des couches, runtime → app, les
  indicateurs de chat et les cibles session/DeepAsk après normalisation.
- Retrait des seules lectures de source citées dans chat-trace/surveillance et des imports disque
  inutiles ; assertions de diagnostic et `h.chatReads === 0` conservées.

### Inventaire du dépôt

`node --test --test-concurrency=1 tests/architecture.test.cjs` : 7/7 verts, sortie `architecture.log`.
125 fichiers JavaScript : core 24, adapters 42, runtime 14, server 8, mcp 2, app 35.
207 imports relatifs, dont 82 entre couches ; aucune arête contraire à la table.

| Origine | Destination et nombre d'imports |
| --- | --- |
| core | core 14 |
| adapters | adapters 30 ; core 7 |
| runtime | runtime 17 ; core 13 ; adapters 22 |
| server | server 8 ; adapters 9 ; runtime 1 |
| mcp | mcp 1 ; core 2 |
| app | app 55 ; core 5 ; adapters 16 ; runtime 7 |

### Vérifications

- Exécution séparée et séquentielle de `node --test --test-concurrency=1` sur architecture (7/7),
  architecture-guard (94/94 avant les derniers cas complémentaires), chat-trace (7/7),
  surveillance (17/17) : toutes vertes ; sorties homonymes dans l'état.
- `node --test --test-concurrency=1 tests/architecture.test.cjs tests/architecture-guard.test.cjs tests/chat-trace.test.cjs tests/surveillance.test.cjs`
  : 140 tests, 140 réussis, aucun échec ; sortie `targeted-final.log`.
- `git diff --check` : réussi, aucune erreur d'espacement.
- `node scripts/check.mjs --changed` : vert, règles, format, lint, gel, cliquet et quatre fichiers
  de tests réussis (140/140) ; sortie `check-changed-final.log`.
- `node scripts/check.mjs` : vert ; règles, format, lint, gel du lint et cliquet réussis,
  120 fichiers JavaScript exécutés en séquentiel, 1 623 tests réussis, aucun échec ;
  22 tests Python réussis en 17,333 s. Sortie intégrale : `.harness-state/tickets/T025/check-full.log`.
- Aucun changement produit, harnais, dépendance ou plancher. Aucun commit ni push.
  Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T025/verdict.json` ; relecture laissée à la boucle.

### Reprise après relecture 1

- Relecture de `.harness-state/tickets/T025/relecture-1.md`, du ticket et du journal, des écarts,
  de `git status --short` et `git diff`. Les trois constats sont acceptés, aucune contestation.
- Les travaux présents sont repris ; les deux répertoires non suivis restent hors périmètre.
  Preuves prévues : imports interdits après regex contenant des délimiteurs de chaînes,
  refus d'une fixture dépourvue de Surveillance, puis renommage de la garde des globales.

### Corrections de la relecture 1

- Constat bloquant 1 corrigé : le lexer consomme les regex littérales comme un seul jeton, avec
  échappements, classes de caractères et drapeaux. Le jeton précédent et une pile de délimiteurs
  distinguent les positions de regex des divisions, y compris après les conditions et les blocs.
  Les chaînes simples/doubles refusent une fin de ligne non échappée ; la continuation échappée reste admise.
- `node --test --test-concurrency=1 --test-name-pattern='^architecture guard sees .* after a regex' tests/architecture-guard.test.cjs`
  : neuf rouges observés sur `0 !== 1`, couvrant les trois délimiteurs et les trois dépendances
  interdites ; sortie `regex-red.log`. Avec la correction, les refus nommés puis les corrections
  vertes sont consignés par `t.diagnostic` dans `lexer-green.log`.
- `node --test --test-concurrency=1 --test-name-pattern='^architecture guard rejects a .* string crossing' tests/architecture-guard.test.cjs`
  : deux rouges observés, puis deux verts ; sorties `strings-red.log` et `lexer-green.log`.
  La commande verte commune est
  `node --test --test-concurrency=1 --test-name-pattern='^architecture guard (sees .* after a regex|rejects a .* string crossing)' tests/architecture-guard.test.cjs`
  : 11/11 réussis.
- `node --test --test-concurrency=1 --test-name-pattern='^architecture guard (catches .* injected|keeps imports visible|sees imports between)' tests/architecture-guard.test.cjs`
  : trois rouges complémentaires après condition/bloc, puis 17/17 verts, dont les copies des deux
  fichiers réels nommés par la relecture et sept cas de division. Sorties `regex-context-red.log`
  et `regex-context-green.log`. La première préparation de ces fixtures avait une erreur de
  syntaxe dans une chaîne du test ; elle a été corrigée avant d'observer les trois rouges d'assertion.
- Constat mineur 2 corrigé : la garde exige `core/surveillance.cjs` dans l'inventaire, et chaque
  fixture le crée. Le contrôle d'une racine vide vide désormais tout son contenu ; la fixture
  complète compte dix fichiers pour core (dont Surveillance), neuf pour chacune des autres racines.
- `node --test --test-concurrency=1 --test-name-pattern='^surveillance dependency guard rejects a missing' tests/architecture-guard.test.cjs`
  : rouge observé (`0 !== 1`), puis 1/1 vert ; sorties `presence-red.log` et `presence-green.log`.
- Constat mineur 3 corrigé : nom `portable core does not access host globals`, liste de sélection
  et diagnostic du banc mis à jour ensemble.
  `node --test --test-concurrency=1 --test-name-pattern='^architecture guard rejects process.* in core/forbidden.cjs$' tests/architecture-guard.test.cjs`
  : rouge du banc tant que le nom sélectionné n'existait pas, puis 1/1 vert avec refus de process ;
  sorties `globals-name-red.log` et `globals-name-green.log`.
- Un contrôle rapide a signalé deux échappements inutiles dans une regex du lexer ; ils ont été
  retirés sans suppression de lint. Les contrôles suivants sont verts.
- Limites du relevé : il reste lexical, sans analyse de portée ni évaluation JavaScript ; les
  chemins calculés, alias/appels indirects de require et code généré à l'exécution ne sont pas résolus.
  Il ne constitue pas un validateur complet de la syntaxe JavaScript.

### Vérifications après correction

- `node --test --test-concurrency=1 tests/architecture.test.cjs tests/architecture-guard.test.cjs tests/chat-trace.test.cjs tests/surveillance.test.cjs`
  : 169/169 réussis, aucun échec ; sortie `correction-targeted.log`.
- L'inventaire du dépôt reste identique : 125 fichiers, 207 imports relatifs et les mêmes arêtes
  que dans le tableau précédent ; la correction ne touche aucun fichier produit.
- `node scripts/check.mjs --changed` : vert ; règles, format, lint, gel et cliquet réussis,
  169/169 tests réussis ; sortie `correction-check-changed.log`.
- `git diff --check` : réussi, aucune erreur d'espacement.
- `node scripts/check.mjs` : vert après correction ; règles, format, lint, gel et cliquet réussis,
  1 652/1 652 tests JavaScript réussis dans 120 fichiers, 22 tests Python réussis en 17,333 s.
  Sortie : `.harness-state/tickets/T025/correction-check-full.log`.
- Nouveau verdict `TERMINÉ` : les trois constats sont corrigés, preuves conservées dans l'état.
  Aucun commit ni push ; la relecture de correction reste à la charge de la boucle.

### Reprise après relecture 2

- Lecture du rapport, du ticket et de son journal, des écarts, de `git status --short` et du diff.
  Le constat mineur est accepté : les trois cas dépendant des sources produit seront remplacés
  par des formes synthétiques équivalentes, avec le même nombre de cas et les mêmes règles nommées.
- Première preuve : étendre le cas d'isolation aux trois cas concernés et constater son rouge
  sans core/adapters produit avant de remplacer leurs fixtures.
- Limite du lexer signalée hors périmètre : le contenu des interpolations de gabarits n'est pas
  parcouru ; un import dans `${…}` peut être invisible, et un gabarit imbriqué peut provoquer un
  faux refus de chaîne non terminée. Le lexer reste inchangé dans cette correction des fixtures.

### Correction de la relecture 2

- Les trois copies produit sont remplacées par trois sources synthétiques : regex avec accent
  grave et drapeau `m`, fonction puis remplacement avec ``/[*_`#]/g`` ; regex avec apostrophe puis
  méthode `async prepare()` d'une classe. Aucune lecture de core/adapters du dépôt ni recherche
  d'un nom de fonction produit. Le refus par règle nommée, le retour au vert et les trois cas restent.
- `node --test --test-concurrency=1 --test-name-pattern='^architecture guard cases run without product adapters$' tests/architecture-guard.test.cjs`
  : rouge observé sur l'assertion de succès du banc (`1 !== 0`) ; le sous-processus passe le cas
  conforme mais échoue sur les trois lectures produit absentes. Après remplacement, le même
  contrôle est vert et vérifie quatre cas réussis, dont les trois cas synthétiques exécutés.
  Sorties : `isolation-red.log`, `isolation-green.log` dans `.harness-state/tickets/T025/`.
- `node --test --test-concurrency=1 --test-name-pattern='^architecture guard catches ' tests/architecture-guard.test.cjs`
  : trois cas réussis ; les sorties de refus et de retour au vert sont conservées par
  `t.diagnostic` dans `synthetic-fixtures.log`.
- `rg -n 'readFileSync|acceptableText|injected in a copy' tests/architecture-guard.test.cjs`
  : seules restent les lectures des deux tests à copier et de la garde temporaire pour ajouter
  une ligne de table. Plus aucune lecture des deux sources produit ni ancien point d'injection.
- `node --test --test-concurrency=1 tests/architecture.test.cjs tests/architecture-guard.test.cjs tests/chat-trace.test.cjs tests/surveillance.test.cjs`
  : 169/169 réussis, aucun cas perdu ; sortie `isolation-correction-targeted.log`.
- `node scripts/check.mjs --changed` : vert ; règles, format, lint, gel, cliquet et 169/169 tests
  réussis ; sortie `isolation-correction-check-changed.log`.
- `git diff --check` : réussi, aucune erreur d'espacement.
- `node scripts/check.mjs` : vert ; règles, format, lint, gel et cliquet réussis,
  1 652/1 652 tests JavaScript réussis dans 120 fichiers, 22 tests Python réussis en 17,573 s.
  Sortie : `.harness-state/tickets/T025/isolation-correction-check-full.log`.
- Nouveau verdict `TERMINÉ` : constat mineur corrigé, nombre de cas conservé, preuve d'isolation
  étendue aux trois fixtures. Aucun commit ni push ; relecture laissée à la boucle.

### Reprise après échec 1

- Lecture de `.harness-state/tickets/T025/echec-1.txt`, du journal, des écarts, du statut et du diff.
  Le constat mineur est accepté : les noms distingueront la fonction entre deux regex et la
  méthode après une regex contenant une apostrophe, sans changer les fixtures ou leurs assertions.
- Exploration et absence d'écart consignées dans l'état. Première preuve prévue : vérifier
  les trois noms effectivement publiés par TAP avant et après le renommage.

### Correction du nom des fixtures

- Le nom choisit sa description selon la forme : `between a backtick regex and a markup replacement`
  pour les deux fonctions ; `after an apostrophe regex in a class method` pour la méthode.
  Les trois sources, les assertions et le préfixe `architecture guard catches ` sont conservés.
- `node .harness-state/tickets/T025/verify-fixture-names.cjs` : rouge sur `deepStrictEqual`
  des trois noms TAP avant correction, puis vert avec 3/3 cas réussis et les noms attendus.
  Le script de preuve et les sorties `fixture-names-red.log` / `fixture-names-green.log` sont
  conservés dans l'état ; les refus puis retours au vert des imports y figurent aussi.
- `node --test --test-concurrency=1 --test-name-pattern='^architecture guard cases run without product adapters$' tests/architecture-guard.test.cjs`
  : 1/1 réussi ; le banc exige toujours quatre succès isolés dont les trois cas synthétiques.
  Sortie : `fixture-names-isolation.log` dans l'état.
- `node --test --test-concurrency=1 tests/architecture.test.cjs tests/architecture-guard.test.cjs tests/chat-trace.test.cjs tests/surveillance.test.cjs`
  : 169/169 réussis, aucun échec ; sortie `fixture-names-targeted.log`.
- `node scripts/check.mjs --changed` : vert ; règles, format, lint, gel, cliquet et 169/169 tests
  réussis ; sortie `fixture-names-check-changed.log`. `git diff --check` : réussi.
- `node scripts/check.mjs` : vert ; règles, format, lint, gel et cliquet réussis,
  1 652/1 652 tests JavaScript réussis dans 120 fichiers, 22 tests Python réussis en 17,599 s.
  Sortie : `.harness-state/tickets/T025/fixture-names-check-full.log`.
- Verdict `TERMINÉ` écrit dans l'état : constat mineur corrigé, préfixe et décomptes conservés.
  Aucun commit ni push ; relecture et intégration laissées à la boucle.

### Réserves à la clôture

- .harness-state/tickets/T025/relecture-4.md : 1. `tests/architecture.test.cjs:57` et `:98` : le relevé ne lit pas l'intérieur des gabarits (hors périmètre, réserve maintenue et étendue)

  **Le problème.** Un gabarit `` `…` `` reste un seul jeton, et `literalImports` ne retient que les spécificateurs entre `'` ou `"` (ligne 98). Deux formes échappent donc aux règles :
  - un import écrit dans une interpolation : `` `${require('../adapters/x.cjs')}` `` ;
  - un spécificateur entre accents graves : `` require(`./deep-ask.cjs`) `` dans Surveillance, ou `` require(`../adapters/x.cjs`) `` dans DeepAsk.

  Les deux assertions retirées les auraient attrapées, puisqu'elles cherchaient le texte : `includes('adapters/')` dans chat-trace, `/deep-ask/` dans surveillance. Le journal (lignes 251-253) ne nomme que la limite des interpolations, pas celle des spécificateurs entre accents graves.

  **Pourquoi ce n'est pas bloquant aujourd'hui.**
  - **Aucune forme concernée dans le dépôt.** La recherche ne trouve aucun `` require(` `` ni `` import(` ``, ni aucun appel à chemin calculé, dans les six racines.
  - **Gabarits imbriqués sans effet.** Il y en a cinq lignes dans core et adapters : `core/surveillance.cjs:211` et `:865`, `core/video-tools.cjs:183`, `adapters/surveillance-prompt.cjs:52`, `adapters/clip-inspector.cjs:55`. Aucune ne contient d'import. J'ai suivi à la main les lignes 211 et 865 : le lexer n'y perd pas le fil.
  - **Relevé complet aujourd'hui.** Le nombre d'imports relevés correspond au comptage indépendant. Par exemple, le comptage par grep trouve 16 lignes pour core → core contre 14 imports relevés. L'écart vient de deux `import('./ports.cjs')` placés dans des commentaires JSDoc (`core/surveillance.cjs:19` et `core/verification.cjs:10`), que la garde ignore à juste titre.
  - **Ce que demande le ticket.** Il définit le relevé par des spécificateurs entre guillemets, comme l'ancienne garde et son propre comptage, et il accepte de remplacer les lectures de texte par ce relevé.

  **Attendu (réserve).** Un ticket ultérieur traite les gabarits sans substitution comme des spécificateurs littéraux et lit les interpolations comme du code. À défaut, il nomme au moins la limite des accents graves à côté de celle des interpolations.
- .harness-state/tickets/T025/relecture-4.md : 2. `docs/architecture.md:18` et `docs/standards.md:22-23` : la table des six couches n'est pas décrite (hors périmètre)

  **Le problème.** Ces deux documents ne disent que « dépendances externes interdites dans le cœur » et « pas d'Electron dans runtime/serveur ». La garde fait désormais respecter une table complète : par exemple adapters → runtime, runtime → app et toute sortie des six racines sont refusés. Un lecteur des standards ne peut pas le savoir.

  Le ticket interdit de modifier les standards et n'autorise que les deux fichiers de test d'architecture.

  **Attendu (réserve).** Une mise à jour documentaire dans un ticket qui en a le droit.
