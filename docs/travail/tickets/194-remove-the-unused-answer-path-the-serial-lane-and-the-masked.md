---
id: T194
titre: Remove the unused answer path, the serial lane and the masked-overlay declaration from the watch session
statut: termine
bloque_par: T193, T190
adr: oui
installe: non
harnais: oui
supprime_tests: oui
niveau: standard
---

## Ce que le ticket livre

`WatchSession` ne porte plus une seconde conversation ni une troisième voie de perception. Les
questions restent à `DeepAsk`, les deux voies audio/vision deviennent le contrat unique et la
déclaration d'images masquées sans émetteur disparaît de l'ingestion. Les questions et les textes
des anciennes archives restent lisibles. Le niveau standard suit la règle des tickets de harnais ;
le retrait touche la session mais n'autorise aucun changement des règles actives de réponse.

## Sources

- `docs/audit-architecture.md`, rapport A, B3 et D2 ; rapport B, B12 et D5.
  Décision du propriétaire, le 16/10 : retrait après la migration smoke et la possession de l'activité
  des questions. T199 et T178 sont transitifs. L'autorisation de suppression reste à décider ci-dessous.
- Code vérifié à `8340014` et appels recherchés dans le produit, scripts et tests :
  - `core/session.cjs:48` reçoit le port `answer`, `:237` porte la voie série, `:386` l'ancien `ask`,
    `:524` `selectEvidence`. `runtime/session-runtime.cjs:170` câble encore `answer: perception` ;
  - aucun appel produit à `watch.ask` n'a été identifié. Les questions actives passent par
    `runtime/conversation-runtime.cjs:59`, `app/main.cjs:132` et `runtime/headless-runtime.cjs:427` ;
  - `core/session.cjs:408` filtre les citations ; `:414` transforme une observation sans citation
    en réponse insuffisante. `core/deep-ask.cjs:129` rassemble les preuves, `:132` valide les citations
    et `:142` distingue les réponses externes et conversationnelles avant la décision à `:145` ;
  - `core/session.cjs:29` et `:38` interprètent l'overlay de capture et ajoutent sa note ; `:122`
    le conserve à l'ingestion. `adapters/remote-media.cjs:13`, `:37` et `:128` le valident et le relaient.
    `tv/capture.py:120` produit les images sans cette déclaration ;
  - `core/session.cjs:478` restaure `saved.questions`, `:498` les conserve dans le snapshot ;
    `core/ports.cjs:10` décrit l'ancien `AnswerPort`, distinct du `SessionAgentPort` actif à `:34` ;
  - tests directs : `tests/session.test.cjs:32`, `tests/topic-summary.test.cjs:127`,
    `tests/watch-session-ending.test.cjs:112`. Fixtures série : `tests/architecture-f08.test.cjs:93`
    et `tests/session-durable.test.cjs:365`, `:405`, `:420`, `:571`, `:610`, `:973`, `:1001`,
    `tests/session-latency.test.cjs:68`, `:210`, `tests/session-lifecycle.test.cjs:99` et
    `tests/session-optimization.test.cjs:5` ;
  - autres câblages à retirer : `scripts/simulate-stream.cjs:220` et
    `tests/question-ceiling.test.cjs:36` (`answer: perception`), `scripts/bench-backend.cjs:58` et
    `scripts/bench-perceived.cjs:282` (`answer: {}`) ;
  - `tests/deep-ask-restore.test.cjs:8` protège des explications sans citation ;
    `tests/evidence-refresh.test.cjs:108` couvre une observation citée. Aucun test explicite
    d'observation sans citation dans `DeepAsk` n'a été identifié pendant cette lecture ;
  - `tests/server-ingest-path.test.cjs:70` protège encore l'ancienne déclaration de capture.
- ADR 0016 et 0017 : précédents de retrait avec conservation de l'historique et baisse exacte du
  plancher. L'API de surveillance overlay est distincte et reste conservée par l'ADR 0017.

## Périmètre

- Retirer `WatchSession.ask`, `selectEvidence`, le port `answer` de son constructeur et son câblage,
  puis la branche observation-only de `drain`. Adapter `core/ports.cjs` au contrat à deux voies.
  Les adaptateurs et fixtures de perception conservés exposent les deux méthodes ; les méthodes
  de compatibilité devenues sans appelant dans le simulé et `CodexPerception` peuvent être retirées.
- Retirer `declaredOverlay`, `withOverlayNote` et le relais de cette déclaration dans
  `adapters/remote-media.cjs`. L'ancien champ facultatif d'entrée peut être ignoré ; ne pas créer
  de nouveau refus d'ingestion. Garder les métadonnées d'identité, de séquence et de source.
- Migrer vers `DeepAsk` les garanties utiles des tests de l'ancien chemin avant leur retrait :
  citations, cible temporelle, contexte disponible et refus après la fin. T190 fournit déjà la
  commande d'activité de question ; ne pas réintroduire ses mutations directes dans les fixtures.
- Conserver la lecture, la validation et la restitution des `questions` historiques, ainsi que les
  observations archivées et leurs notes existantes. Aucun réexamen ni fournisseur à l'ouverture.
- Modifier les modules cités et leurs tests propres, les fixtures série réellement consommatrices,
  les scripts `scripts/simulate-stream.cjs`, `scripts/bench-backend.cjs` et `scripts/bench-perceived.cjs`,
  `tests/question-ceiling.test.cjs`, et ajouter un ADR court qui acte le retrait, la compatibilité et l'inventaire des tests supprimés.
  Garder les fichiers mixtes : seuls les cas devenus sans objet en sortent.
- `harnais: oui` n'ouvre que la ligne `cas_de_test` de `scripts/quality/baseline.json`, pour la baisse
  décidée ci-dessous. Aucun autre changement de harnais. Ne retirer ni `close({ purge })`, ni
  `saveAuto`, ni délégations headless, ni routes ou file de surveillance overlay dans ce ticket.

## Critères d'acceptation

1. Avant de retirer l'ancien `ask`, un test par `DeepAsk.start` fait répondre l'agent avec une
   observation sans citation : le résultat est insuffisant et ne présente aucune preuve inventée.
   Les tests distinguent l'observation citée, la citation inconnue ou hors cible et les explications
   sans citation autorisées en chat. Les règles actives ne sont pas alignées artificiellement sur
   les anciens textes de réponse. Chaque garantie migrée est reliée à un test public dans le journal.
2. Les recherches de symboles dans le code, scripts et tests ne trouvent plus l'ancien appel
   `WatchSession.ask`, `selectEvidence`, `AnswerPort`, `answer: perception`, ni la sélection d'une
   voie série. `DeepAsk` et les ports `answer` de ses agents restent actifs. Les documents historiques
   (`docs/audit-*.md`, tickets et ADR) sont exclus de ces critères d'absence.
3. Un bloc normal, et un bloc portant encore l'ancien champ facultatif, sont ingérés par le serveur
   sans déclaration d'images masquées ni ajout d'une nouvelle note. Leurs images, séquence et source
   restent intactes. La recherche des anciens symboles de déclaration est vide dans le code actif ;
   les routes et données de surveillance overlay restent couvertes par leurs tests existants.
4. Une fixture d'archive contenant `questions` et une ancienne observation avec sa note est ouverte,
   lue et refermée sans perte ni réécriture, sans appel fournisseur. Les tests de restauration restent
   actifs ; la disparition de l'API historique n'efface pas les données qu'elle a écrites.
5. Le journal donne les cas retirés, leur fichier, leur ancien comportement et leur remplacement
   éventuel. Soit P le plancher au début, n le nombre exact de lignes `test(` retirées et a les ajouts :
   le nouveau plancher est P − n et la mesure finale M vérifie M ≥ P − n + a. Aucun cas de remplissage
   ne compense un retrait. Aucun autre compteur du plancher n'est relâché. Si T196 est déjà livré,
   la même autorisation s'applique seulement à son plancher produit, en adaptant le journal au nom réel.
6. La commande suivante ne liste que `scripts/quality/baseline.json` :

   ```sh
   git status --porcelain -- .claude .codex .agents AGENTS.md CLAUDE.md docs/standards.md scripts/check.mjs scripts/quality scripts/loop
   ```

   `git diff -- scripts/quality/baseline.json` ne touche que la ligne du plancher `cas_de_test`,
   ou celle du plancher produit si T196 est déjà livré, avec la baisse exacte du critère 5.
   Aucun autre fichier protégé ni aucune autre ligne du fichier n'est modifié.
7. À l'implémentation, exécuter en séquentiel les fichiers touchés, split-perception, deep-ask-restore,
   evidence-refresh, session-durable et server-ingest-path, puis `node scripts/check.mjs`. Le contrôle
   est vert avec l'autorisation de baisse exacte ; aucun autre comportement ni test n'est affaibli.

## Test d'acceptation attendu

La première preuve est un agent factice appelé par le vrai `DeepAsk`, avec outils et preuves maîtrisés,
et l'observation de son résultat public. Elle précède la contraction. Une ancienne archive complète
est ensuite ouverte par le runtime et la bibliothèque réels, sur disque temporaire, avec comparaison
avant/après. Les scénarios de perception de T193 continuent d'exercer les deux voies des hôtes.

## Hypothèses bloquantes

Décision du propriétaire, le 16/10 (« Oui, supprimer », en réponse à la question posée) : oui. Supprimer ces chemins et leurs tests propres, et abaisser le plancher `cas_de_test` du nombre exact de cas supprimés, avec `harnais: oui` limité à cette ligne, comme pour T139. Si T196 a déjà séparé le cliquet, c'est le
plancher des tests du produit qui baisse, et lui seul.

Question posée : supprimer ces chemins et leurs tests propres, en abaissant le
plancher `cas_de_test` du nombre exact de cas supprimés, avec `harnais: oui` limité à cette ligne,
comme pour T139 ? Recommandation : oui.

Le nombre exact de cas retirés sera établi sur la version livrée par T193 et T190 ; il n'est pas
inventé ici. Les garanties d'archives et de citations sont obligatoires même après cet accord.

## Journal

### Exploration

- Base `26fa76b` ; statut initial et diff lus. Témoin hooks présent. Exploration et écarts dans `.harness-state/tickets/T194/`.
- `P = 1467`, compteur `cas_de_test` unique (T196 non livré). Les fichiers non suivis initiaux restent intacts.
- Les règles de DeepAsk restent inchangées : caractérisation publique avant contraction, puis rouge d’ingestion sur le comportement à retirer.

### Preuves avant contraction et changement d’ingestion

- `node --test tests/evidence-refresh.test.cjs` : **10/10 verts** avant retrait de `ask` (`pre-contraction-evidence.log`).
  Le nouveau cas `chat validates cited observations…` passe par `DeepAsk.start` et les vrais `VideoTools` :
  observation sans citation → insuffisant, sans observations/sources/hypothèses inventées ; citation connue → observation ;
  citation inconnue ou hors du périmètre temporel → insuffisant ; explication sans citation → explication.
  Le contexte historique expiré reste consultable par `get_transcript`, sans lui substituer le présent.
  Le périmètre de `DeepAsk.start({ startMs, anchorMs })` est testé ; aucune nouvelle règle d’interprétation des questions libres n’est ajoutée.
- `node --test --test-name-pattern='historical questions and masking notes' tests/archive-compat.test.cjs` : **1/1 vert**
  avant contraction (`pre-contraction-archive.log`). Copie complète sur disque temporaire, vraie bibliothèque et vrai hôte,
  anciennes questions/citations, observation et note dans segments et history, empreintes et mtimes égaux après fermeture,
  aucun appel fournisseur.
- `node --test --test-name-pattern='normal and legacy capture blocks' tests/server-ingest-path.test.cjs` :
  **rouge observé sur assertion** (overlay relayé au lieu d’undefined, `red-ingest.log`), puis **1/1 vert**
  après retrait (`green-ingest.log`, puis `green-ingest-two-lanes.log`). Images comparées après assemblage et stockage,
  identité, séquence et source conservées, doublon reconnu, ancien champ bien ou mal formé ignoré, aucune note ajoutée.
- L’inventaire complémentaire trouve `scripts/probe-codex-speed.cjs` comme appelant de `CodexPerception.observe`.
  Son retrait facultatif n’est donc pas appliqué : voir `ecarts.md`. La session ne sélectionne plus de voie série.

### Inventaire exact des déclarations de tests retirées et remplacées

Comptage statique identique au cliquet (`^\s*test\(`), base `26fa76b` : **P = M initial = 1467**.
Inventaire détaillé conservé dans `test-inventory.json`. **n = 13 déclarations retirées**, dont deux cas de la matrice
série/deux voies remplacés par leurs cas deux voies ; **a = 6 déclarations ajoutées**, dont ces deux remplacements.
Il y a donc onze cas supprimés sans remplacement de déclaration sur place, quatre nouvelles preuves et deux migrations.
Nouveau plancher : **1467 − 13 = 1454**. Mesure attendue : **1460 = 1454 + 6**. Aucun cas de remplissage.

| Fichier | Ancien cas / comportement | Remplacement ou conservation |
| --- | --- | --- |
| `tests/session.test.cjs` | `retention deletes raw media…` : résumé ancien sans média, pas de substitution récente | Nouveau `chat validates cited observations…` dans evidence-refresh ; suites durables conservées |
| `tests/session.test.cjs` | `Ask prevents another background analysis…` : barrière série pendant ask | `question pending publishes each transition once…` et `manual question blocks new vision…` de split-perception ; audio continue |
| `tests/session.test.cjs` | `unknown references cannot become grounded observations` | Nouveau cas DeepAsk dans evidence-refresh |
| `tests/session.test.cjs` | `an answer citing the present cannot masquerade…` | Nouveau cas DeepAsk : citation du présent hors périmètre refusée |
| `tests/session.test.cjs` | `observation time controls relative references…` : selectEvidence | `temporal-target.test.cjs` conserve les références relatives et absolues ; nouveau cas DeepAsk conserve ancre et intervalle |
| `tests/session.test.cjs` | `stopped sessions reject capture but retain Ask` | `overlapping ingests…` de session-latency refuse après stop ; `the start of a film is still served 95 minutes later…` de server-sessions pose des questions sur archive |
| `tests/topic-summary.test.cjs` | `legacy answer port receives only passage evidence…` : pas de cumul dans l’ancien port | Nouveau cas DeepAsk vérifie l’absence du marqueur cumulatif dans le contexte, sans retirer les autres cas topic-summary |
| `tests/simulated-providers.test.cjs` | `historical serial perception reports images and audio…` : observe/ask simulés | Cas existants de transcription et vision simulées conservés |
| `tests/session-durable.test.cjs` | `images hidden by a TV Lens card stay declared…` : création/relais de note | Nouveau cas archive-compat conserve les notes déjà écrites ; nouveau cas ingestion n’en ajoute plus |
| `tests/server-ingest-path.test.cjs` | `images cropped or withheld under a TV Lens card…` : validation et note | Nouveau cas `normal and legacy capture blocks…` ; cadrage géométrique protégé par remote-media inchangé |
| `tests/watch-session-ending.test.cjs` | `beginEnding silently keeps intake open… (${split…})` | Déclaration remplacée par `(audio and vision)` : assertions d’admission/silence conservées |
| `tests/watch-session-ending.test.cjs` | `question resumption starts no analysis… (${split…})` | Déclaration remplacée par `(audio and vision)` : ending/closed et notifications tardives conservés |
| `tests/watch-session-ending.test.cjs` | `an ending session still refuses a second question…` : concurrence de l’ancien ask | Nouveau cas `the host answers through DeepAsk and refuses questions during and after session teardown…` ; FIFO DeepAsk conservée |

Fragments retirés de fichiers mixtes sans supprimer leurs cas : assertions série dans session-latency et architecture-f08,
appels à l’ancien ask dans closeIntake et fin tardive de question. Les assertions des deux voies et des verrous restent.
Les fixtures durables synchronisent désormais la voie audio ou vision concernée ; les assertions disque restent conservées.

### Contrôles intermédiaires

- Exécution séquentielle des fichiers listés dans `test-files.txt` : tous verts sauf la nouvelle preuve de fin,
  qui supposait à tort la conservation des jobs après fermeture de l’hôte. Correction de cette attente : le runtime vide les jobs,
  et le compteur fournisseur prouve toujours le refus. Logs individuels conservés.
- Migration du cas de backlog : premier échec expliqué par une attente portant encore sur la mauvaise voie ; le différé porte
  désormais sur la transcription. Erreur de syntaxe de cette adaptation corrigée ; `node --test tests/session.test.cjs` : **2/2 verts** (`session-fixed.log`).
- `node scripts/check.mjs --changed` : règles, format, gel et **142 tests verts** ; rouge attendu sur le plancher non encore abaissé
  (1467 → 1460) et les suppressions ESLint devenues inutiles (`check-changed-initial.log`).
- `node_modules/.bin/eslint --prune-suppressions core/session.cjs adapters/remote-media.cjs adapters/simulated-providers.cjs` : **code 0**.
  Retire uniquement le gel max-lines de session et réduit sa complexité de 7 à 6, conformément aux standards.

### Complément révélé par le contrôle complet

- `node scripts/check.mjs` : règles, format, lint, gel, cliquet et **22 tests Python verts** ;
  **1924/1926 tests JS verts**, deux échecs déterministes (`check-full.log`).
- `node --test --test-name-pattern='a media tool that does not end' tests/architecture-f06.test.cjs` :
  rouge reproduit sur assertion (`red-media-compat.log`) : le fragment de déclaration overlay attend encore 400,
  alors que l’ancien champ est désormais toléré (200). Retrait de ce seul fragment sans supprimer le cas mixte ;
  les refus WAV, image, outil, délai et répertoire temporaire restent vérifiés. La tolérance est déjà prouvée par server-ingest-path.
- `node --test --test-name-pattern='thumbnail exists before analysis' tests/session-timeline.test.cjs` :
  rouge reproduit sur assertion (`red-thumbnail.log`) : l’ancienne fixture perception:{} supposait que asking bloque toute analyse.
  La fixture fournit maintenant les deux méthodes, tient explicitement la transcription et vérifie la miniature alors que
  l’observation est encore null. Après relâchement, elle attend la publication ready puis conserve toutes les assertions
  d’expiration, pause, fermeture et purge. Aucun fournisseur ni attente de durée ajoutés.
- `node --test tests/architecture-f06.test.cjs` puis `node --test tests/session-timeline.test.cjs` :
  **codes 0**, séquentiels (`architecture-f06-migrated.log`, `session-timeline-migrated.log`).
  Ces deux adaptations sont des fixtures consommatrices de la compatibilité retirée ; aucun nouveau retrait de déclaration,
  aucun changement supplémentaire du plancher. Écart documenté avant adaptation dans `ecarts.md`.

### Vérifications finales et remise à la boucle

- `node scripts/check.mjs --changed` : **vert**, 15 fichiers de tests exécutés en séquentiel, **163/163 réussis**
  (`check-changed-final.log`). Les suites split-perception et deep-ask-restore avaient également été exécutées
  séparément dans la séquence ciblée ; elles sont reprises par le contrôle complet.
- `node scripts/check.mjs` : **vert**, **1926/1926 tests JavaScript** dans 127 fichiers en séquentiel,
  **22 tests Python réussis** ; règles, format, lint, gel et cliquet verts (`check-full-final.log`).
- `git grep -E '^[[:space:]]*test\(' HEAD -- 'tests/*.test.cjs'` et comptage du diff `git diff --unified=0 -- tests` :
  **1467 lignes initiales, 13 retirées, 6 ajoutées** (`static-counts-final.json`). Mesure finale observée **M = 1460**,
  nouveau plancher **P − n = 1454**, donc **M = P − n + a**. Les deux remplacements de matrice sont explicitement inventoriés.
- `rg -n 'selectEvidence|AnswerPort|answer: perception|splitPerception|declaredOverlay|withOverlayNote|this\.perception\.observe\(|watch\.ask\(' core adapters runtime server app mcp scripts tests` :
  **aucune occurrence**, code 1 sans erreur (`final-inventory.log`). La méthode combinée Codex encore appelée par sa sonde reste documentée ;
  elle n’est jamais sélectionnée par WatchSession.
- `git status --porcelain -- .claude .codex .agents AGENTS.md CLAUDE.md docs/standards.md scripts/check.mjs scripts/quality scripts/loop` :
  **seul `scripts/quality/baseline.json` est listé**. `git diff -- scripts/quality/baseline.json` : seule la ligne
  `cas_de_test`, **1467 → 1454**. Aucun autre chemin protégé modifié ; `git diff --check` : **code 0**.
- ADR **0038** ajouté. Les routes et données de surveillance overlay, `close({ purge })`, saveAuto et les délégations headless restent conservés.
- Verdict **TERMINÉ** écrit dans `.harness-state/tickets/T194/verdict.json`. Aucun commit ni push ; remise à la boucle pour relecture.

### Réserves à la clôture

- .harness-state/tickets/T194/relecture-1.md : **`docs/architecture.md:26`** (hors périmètre)
     - **Problème :** la documentation d'architecture dit encore « Les adaptateurs historiques `observe` restent compatibles ». C'est faux depuis ce diff : `WatchSession` n'accepte plus de perception qui n'expose que `observe`.
     - **Attendu :** retirer ou corriger cette phrase dans un ticket qui autorise la modification de la documentation. Ce fichier n'est pas dans la liste du périmètre.
- .harness-state/tickets/T194/relecture-1.md : **`tests/session-providers.test.cjs:32`** (hors périmètre)
     - **Problème :** le garde `runtime.perception.observe = () => { throw Error("Historical serial perception must not run"); }` surveille une voie série qui n'existe plus. Il est mort et ajoute une méthode `observe` à la perception simulée pendant l'exécution.
     - **Attendu :** le retirer plus tard. Le fichier n'utilise pas la voie série et n'est pas dans la liste du ticket.
- .harness-state/tickets/T194/relecture-1.md : **`tests/topic-summary.test.cjs:91` et `tests/session-durable.test.cjs:503`** (hors périmètre)
     - **Problème :** il reste deux doublures `perception: {}`, qui ne respectent pas le contrat à deux voies de `core/ports.cjs`. Elles ne déclenchent aucune analyse, donc rien ne casse aujourd'hui. Mais si une analyse démarrait, l'erreur serait absorbée et notée comme simple erreur audio.
     - **Attendu :** leur donner `transcribe` et `observeVisual` plus tard. Le ticket limite la migration aux doublures qui utilisaient vraiment la voie série.
- .harness-state/tickets/T194/relecture-1.md : **Écart accepté, critère 1 :** caractériser `DeepAsk` en vert avant la contraction, sans fabriquer d'échec, est conforme à la section « Test d'acceptation attendu ». Le rouge est bien exigé là où le comportement change, c'est-à-dire à l'ingestion.
- .harness-state/tickets/T194/relecture-1.md : **Écart accepté, critère 2 :** garder `CodexPerception.observe` est légitime. Le ticket rend ce retrait facultatif et réservé aux méthodes sans appelant, or `scripts/probe-codex-speed.cjs` l'appelle. La session ne sélectionne plus aucune voie série.
- .harness-state/tickets/T194/relecture-1.md : **Écart accepté, critères 5 et 7 :** adapter `tests/architecture-f06.test.cjs` (retrait du seul fragment de refus de déclaration) et `tests/session-timeline.test.cjs` (passage de la doublure de miniature aux deux voies) était nécessaire. Ces tests dépendaient du comportement retiré, et les deux rouges ont été reproduits avant l'adaptation. Aucune déclaration `test(` n'est retirée en plus, aucun autre plancher ne bouge et aucune autre assertion n'est retirée.

  Le fichier des écarts ne contient aucune contestation.
