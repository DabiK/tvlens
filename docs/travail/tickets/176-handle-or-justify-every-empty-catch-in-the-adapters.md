---
id: T176
titre: Handle or justify every empty catch in the adapters
statut: termine
bloque_par: T046, T031
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Chaque `catch` vide des adaptateurs reçoit une gestion vérifiée de son erreur ou un commentaire
précis expliquant pourquoi la poursuite est acceptable. Les véritables défauts dépassant une petite
correction sont nommés en réserve avec leur conséquence ; ils ne sont pas masqués par une
justification générique. Le compteur du cliquet baisse sans changer sa définition ou son plancher.

## Sources

- `docs/audit-points-chauds.md`, section A « Cliquet », inventaire des catch vides.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Définition à `e92c6a6` : `scripts/quality/metrics.mjs:6` donne les répertoires de production ;
  `scripts/quality/metrics.mjs:10` contient la regex `catch` à corps composé d'espaces seulement ;
  `scripts/quality/metrics.mjs:35` la compte. Le plancher maximal enregistré est 40,
  `scripts/quality/baseline.json:4`. Le relevé statique de ce SHA retrouve 40 occurrences au total,
  dont **16 dans `adapters/`**, sur 15 lignes physiques ; les callbacks `.catch(() => {})` ne sont
  pas comptés par cette définition.
- Inventaire relu en entier avec les appelants/tests concernés, repères à `e92c6a6` :

| Repère | Opération protégée et suite actuellement visible |
| --- | --- |
| `adapters/chat-trace.cjs:42` | Écriture stderr ; un échec du diagnostic ne remonte pas. |
| `adapters/codex-confinement.cjs:261` | Accès et liens des fichiers facultatifs ; absence et refus de lien sont aujourd'hui confondus. |
| `adapters/codex-confinement.cjs:306` | Examen/suppression d'un candidat périmé ; le balayage continue avec les suivants. |
| `adapters/codex-rpc.cjs:17` | Allocation pour l'attente synchrone à la sortie ; sans elle, cette attente est sautée. |
| `adapters/codex-rpc.cjs:67` | Parsing et réception d'une ligne ; T046 doit séparer JSON invalide et exception du gestionnaire. |
| `adapters/codex-rpc.cjs:74` | Envoi secondaire d'une réponse d'erreur devenu impossible. |
| `adapters/codex-session-client.cjs:56` | Diagnostic stderr du client. |
| `adapters/codex-session-client.cjs:228` | `thread/unsubscribe` levant synchroniquement ; la rotation continue. |
| `adapters/codex-session-client.cjs:733` | Lecture quota levant synchroniquement ; le tour continue. |
| `adapters/codex-video-agent.cjs:33` | Deux occurrences distinctes : SIGTERM puis SIGKILL lors de l'abandon d'une exécution héritée. |
| `adapters/embedding-store.cjs:17` | Lecture/parsing du cache ; repli sur un cache vide. |
| `adapters/local-vlm-agent.cjs:14` | Parsing d'URL ; validation de configuration explicite juste après. |
| `adapters/local-vlm-agent.cjs:47` | Transport local ; transformation en erreur stable ou raison d'abandon. |
| `adapters/remote-media.cjs:115` | Échec d'attachement de `cleanup` ; l'erreur primaire reste prioritaire. |
| `adapters/saved-moment-store.cjs:11` | Lecture d'un élément gardé illisible ; cet élément est omis de la liste. |

- Tests protecteurs : `tests/chat-trace.test.cjs`, `tests/codex-confinement.test.cjs`,
  `tests/codex-thread-rotation.test.cjs:228` (quota), `tests/codex-stream-decoding.test.cjs`,
  `tests/local-vlm-agent.test.cjs`, `tests/moment-index.test.cjs`,
  `tests/architecture-f06.test.cjs:479` (nettoyage média), `tests/viewing-features.test.cjs`,
  `tests/session-delete.test.cjs`, `tests/chat-codex.test.cjs`, et les tests apportés par T046.
  Plusieurs couvrent le chemin nominal seulement : leur présence ne prouve pas que le refus est testé.

## Périmètre

- Modifier seulement les occurrences encore présentes dans `adapters/`, y compris celles déplacées
  dans ce répertoire par un refactor précédent. Refaire l’inventaire au début : T046 traite la
  frontière JSON/gestionnaire de `adapters/codex-rpc.cjs:67` et garantit au plus deux `catch` vides
  restants ; ceux des lignes 17 et 74 restent à inventorier ici. T175 peut déplacer ceux du client ;
  T139 peut retirer le
  client hérité. Une occurrence supprimée par un prédécesseur n'est pas recréée pour ce ticket.
- Pour une erreur déjà transformée ou conservée ailleurs, documenter précisément ce chemin. Pour une
  opération facultative sans conséquence sur le résultat, écrire la raison **dans** le `catch`.
  Pour une petite gestion nouvelle, utiliser les canaux d'erreur existants et ajouter un test qui
  provoque le refus ; aucun chemin interne ni donnée sensible ne doit être ajouté aux réponses.
- En particulier, la lecture quota est informative ; un diagnostic qui échoue ne doit pas faire
  échouer le tour. Le défaut de gestionnaire RPC appartient à T046. Les liens de confinement,
  les signaux de processus et l'omission d'un élément illisible demandent une justification fondée
  sur leur contrat, pas « erreur ignorée » ou « best effort » sans explication.
- Si un défaut demande une correction plus large, le journal et les réserves de clôture nomment
  fichier, opération, conséquence, preuve manquante et travail requis. Ne pas affirmer que l'erreur
  est sans effet si cette propriété n'est pas établie ; conserver explicitement le contrat courant
  et sa limite, sans ouvrir un refactor du confinement, du stockage ou des processus.
- Tests : compléter les fichiers des comportements concernés, ou créer
  `tests/adapter-error-handling.test.cjs` pour les coutures non couvertes. Aucun nouveau test ne
  compare le texte du produit pour se substituer à une preuve de comportement.
- Ne modifier ni `core/`, ni les hôtes, ni les callbacks de rejet non comptés par le cliquet, ni les
  historiques, ni le harnais ou le plancher. Pas de nouvelle politique métier ou de dépendance npm.

## Critères d'acceptation

1. Le journal rapproche toutes les occurrences de l'inventaire initial de l'un de ces résultats :
   traitement existant documenté, gestion nouvelle testée, poursuite justifiée, ou disparition par un
   prédécesseur. Chaque justification cite la conséquence évitée et ce qui prend déjà en charge le
   refus ; toute limite restante est une réserve nommée. Aucun commentaire générique ne suffit.
2. Toute gestion nouvelle est exercée en provoquant l'erreur à la frontière publique du module,
   avec disque/transport/logger doublé. Le test vérifie l'erreur remise, l'état ou le diagnostic
   attendu, et la poursuite ou le refus du travail suivant. Aucun vrai fournisseur ni signal vers
   un processus externe au test n'est utilisé.
3. Le relevé selon la définition inchangée de `emptyCatches` rend 0 dans `adapters/`, sans déplacer
   un `catch` vide hors de ce périmètre ni le convertir en callback vide pour éviter le compteur.
   Consigner le total global et le détail avant/après. Sur le code de départ seul, retirer ces
   16 occurrences ferait passer le total de 40 à 24 ; le lancement doit remesurer les prédécesseurs.
4. Les comportements de rotation, quota, confinement, priorité de l'erreur média, lecture des
   caches et liste des moments restent protégés par leurs tests existants, sans en affaiblir ni
   retirer une assertion. Les tests ajoutés échouent si leur nouvelle gestion est temporairement
   retirée ; consigner un rouge causal puis rétablir le code.
5. Exécuter les fichiers concernés en séquentiel, puis `node scripts/check.mjs` à l'implémentation.
   Le cliquet baisse ; son resserrement éventuel appartient à la boucle, sans édition du harnais
   par ce ticket `harnais: non`.

## Test d'acceptation attendu

Les tests du module dont la gestion change provoquent le refus par ses dépendances contrôlées et
observent sa méthode publique. Pour les seules justifications de comportement inchangé, conserver
les tests existants et leur portée réelle ; ne pas annoncer qu'un commentaire prouve une absence
de défaut. Le relevé du compteur vérifie la couverture de l'inventaire, pas la sûreté du comportement.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T046 et T031 attendent T150 et apportent respectivement la propagation des fautes et le lint.
Le choix accepté ici est de rendre explicites les traitements existants et de corriger seulement
les petits défauts établis. Aucune preuve de panne réelle de lien, de signal ou de cache sur la
machine de l'utilisateur n'est disponible ; une autre politique de propagation reste hors périmètre.
T177 poursuit sur les hôtes et la TV ; T184, qui dépend de T177, possède les six occurrences du cœur.

## Journal

### Exploration — 16 octobre 2026

- Base `6cf7ed4`, témoin hooks présent, changements préexistants préservés.
- Lecture des règles, des skills ticket/tests, des contrats et des ADR 0002, 0005, 0014,
  0016 et 0022. Exploration et écarts prévus dans `.harness-state/tickets/T176/`.
- Relevé par les exports inchangés de `scripts/quality/metrics.mjs` : **30 globalement,
  11 dans `adapters/`**. Détail sauvegardé dans `inventaire-avant.json`.
- Choix : justifier les traitements et poursuites existants sans nouvelle politique ni
  modification de comportement. Les limites sont conservées explicitement en réserve ;
  aucun commentaire ne prouvera à lui seul la sûreté d'un refus non exercé.

### Justifications et rapprochement de l'inventaire

Les repères ci-dessous sont ceux de l'inventaire historique du ticket ; les numéros du
code actuel diffèrent après les extractions. Les onze corps encore vides au départ sont
commentés sur place. Aucun traitement nouveau, déplacement ou callback vide de substitution.

| Repère historique | Résultat et conséquence prise en charge | Portée des preuves existantes |
| --- | --- | --- |
| `chat-trace:42` | Poursuite justifiée : sérialisation ou stderr peut perdre la trace ; résultat/refus reste porté par les promesses du client. Évite qu'un diagnostic casse le tour. | `chat-trace` protège corrélation, filtrage, refus et diagnostics ; pas de refus stderr injecté dans ce module. |
| `codex-confinement:261` | Contrat conservé et limite explicite : fichiers facultativement liés hors contexte de travail ; absence tolérée sans élargissement des accès. Un refus de lien peut rendre l'authentification indisponible et n'est pas distingué d'une absence. Réserve R1. | `codex-confinement` vérifie lien auth, séparation des répertoires, absence d'auth dans les doublures et contrôles effectifs ; pas chaque refus d'accès/lien. |
| `codex-confinement:306` | Poursuite justifiée : un candidat disparu/non supprimable ne bloque pas les suivants ; `removed` contient seulement les suppressions réussies. Résidu possible avec liens privés, sans diagnostic. Réserve R2. | `codex-confinement` protège âge, propriétaire vivant, fichiers étrangers et cible des liens ; pas de refus lstat/rm injecté. |
| `codex-rpc:17` | Poursuite justifiée : sans cellule, seule la grâce synchrone est sautée ; la boucle finale demande toujours SIGKILL. Évite d'abandonner l'escalade à la sortie de l'hôte. Limite de preuve R5. | `codex-confinement` exerce la sortie d'un hôte de test, enfants polis/récalcitrants ; allocation refusée non exercée. |
| `codex-rpc:67` | Disparition du corps vide par T046 : JSON parasite ignoré avant `receive`, exception du gestionnaire séparément transmise à `onFault`. | `codex-handler-failure` et `codex-stream-decoding` conservent propagation et lecture des notifications. Aucune modification ici. |
| `codex-rpc:74` | Déjà expliqué par T046 : impossible de remettre la réponse de refus sur une connexion fermée. | Corps déjà commenté dans `receive` ; aucune modification ici. Les tests RPC existants gardent leur portée réelle. |
| `codex-session-client:56` | Poursuite justifiée : stderr peut perdre le diagnostic mais ne doit pas interrompre contrôles de confinement ou barrière d'arrêt. Ces décisions restent dans leurs appelants, indépendantes de l'écriture. | Tests de confinement et refus client conservés ; pas de refus stderr injecté dans `report`. |
| `codex-session-client:228` | Poursuite justifiée : nouveau fil déjà contrôlé/installé ; événements anciens filtrés ; `maxRotations` limite les rotations avant recyclage. Désabonnement indisponible sans annuler le nouveau fil. | `codex-thread-rotation` provoque rejet, attente infinie et levée synchrone ; rotation puis tour suivant réussissent. |
| `codex-session-client:733` | Déplacé et déjà expliqué par T175 dans `codex-session-run/finishPreparation` : quota informatif, sans retenir ni faire échouer le tour. | `codex-thread-rotation` provoque lecture lente, rejet et levée synchrone du quota. Aucune modification ici. |
| `codex-video-agent:33`, SIGTERM | Disparition par T139, retrait de l'adaptateur hérité (ADR 0016). | Fichier absent ; aucun signal hérité recréé ni garantie inventée sur un refus de signal. |
| `codex-video-agent:33`, SIGKILL | Même disparition par T139, deuxième occurrence distincte de la ligne. | Même périmètre ; le transport actif garde ses propres tests de processus appartenant aux tests. |
| `embedding-store:17` | Traitement existant documenté : cache dérivé, vecteur manquant rendu `null`, redemandé par `MomentIndex`, réécriture au prochain `put`. Entrées déjà lues conservées si erreur tardive ; aucun diagnostic du refus. Réserve R4. | `moment-index` protège cache neuf, migration, relecture, ligne tronquée et reconstruction ; pas tous les refus disque/structure. |
| `local-vlm-agent:14` | Traitement existant documenté : validation immédiate d'endpoint absent, refus de configuration sans recopier l'URL. | `local-vlm-agent` provoque URL mal formée, protocole interdit, identifiants intégrés. |
| `local-vlm-agent:47` | Traitement existant documenté : raison d'abandon prioritaire, sinon erreur « injoignable » ; détails de transport privés jamais transmis. | `local-vlm-agent` protège coupure de connexion, annulation, fermeture, délai, HTTP et poursuite des requêtes suivantes. |
| `remote-media:115` | Traitement existant documenté : dans la méthode de classe strictement exécutée, primitive (null/undefined inclus), objet gelé, accesseur ou Proxy qui lève peuvent faire lever l'affectation de `cleanup`. Le catch conserve `primary` ; pas d'échec silencieux pour ces cas. Nettoyage réussi non garanti, diagnostic secondaire perdu. Limite R6. | `architecture-f06` protège le refus rm et l'attachement sur raison extensible ; `remote-media` couvre sept raisons refusant l'attachement avec rouge causal par retrait temporaire du catch. |
| `saved-moment-store:11` | Poursuite justifiée par le contrat actuel de liste partielle : omettre ce saved.json permet de lire les autres ; aucun fichier de l'élément n'est effacé. L'omission n'est pas signalée au client. Réserve R3. | `viewing-features` et `session-delete` protègent conservation, relecture et suppression explicite ; pas l'omission sur refus de lecture. |

### Vérification — commandes et résultats observés

- Avant commentaires, puis après :
  `node --test --test-concurrency=1 tests/chat-trace.test.cjs tests/codex-confinement.test.cjs tests/codex-thread-rotation.test.cjs tests/codex-stream-decoding.test.cjs tests/local-vlm-agent.test.cjs tests/moment-index.test.cjs tests/architecture-f06.test.cjs tests/viewing-features.test.cjs tests/session-delete.test.cjs tests/chat-codex.test.cjs tests/codex-handler-failure.test.cjs`
  → **121 tests réussis, zéro échec**, chaque fois. Sorties `tests-avant.log` et `tests-apres.log`
  dans `.harness-state/tickets/T176/`. Fichiers exécutés en séquentiel.
- Premier contrôle rapide des huit adaptateurs : rouge uniquement sur les suppressions
  ESLint devenues inutiles (« There are suppressions left that do not occur anymore »).
  Ce rouge de lint n'est pas présenté comme un rouge causal de comportement.
- `node_modules/.bin/eslint --prune-suppressions adapters/chat-trace.cjs adapters/codex-confinement.cjs adapters/codex-rpc.cjs adapters/codex-session-client.cjs adapters/embedding-store.cjs adapters/local-vlm-agent.cjs adapters/remote-media.cjs adapters/saved-moment-store.cjs`
  → code **0** ; onze suppressions `no-empty` retirées, aucune autre règle modifiée
  (`lint-elagage.log`). Élagage exigé par les standards, sans modification du harnais.
- `node scripts/check.mjs --changed` → **vert**, règles, format, lint, gel et cliquet.
  Aucun test modifié à sélectionner dans ce mode ; les 121 tests ciblés ont été lancés
  séparément. Sortie `check-changed.log`.
- Relecture du diff et comparaison des AST par Espree des huit adaptateurs avec `HEAD`,
  hors positions et graphie des littéraux → **identiques** (`relecture-ast.log`). Cette
  observation confirme le changement limité aux commentaires et à la mise en lignes ;
  elle ne remplace aucune preuve de refus aux frontières publiques.
- Aucun test ajouté ni traitement nouveau : aucun rouge causal nouveau à produire.
  Aucune assertion existante assouplie ou supprimée. Les refus non exercés restent nommés.

### Relevé final du cliquet

Commandes reproductibles, script d'audit hors Git important `PROD_DIRS` et `emptyCatches`
depuis la définition inchangée :

- `node .harness-state/tickets/T176/relever-compteur.mjs --head` → **30 global, 11 adaptateurs**.
- `node .harness-state/tickets/T176/relever-compteur.mjs` → **19 global, 0 adaptateur**.
- `git diff --exit-code -- scripts/quality/metrics.mjs scripts/quality/baseline.json` → code **0**.

| Fichier | Avant | Après |
| --- | ---: | ---: |
| `adapters/chat-trace.cjs` | 1 | 0 |
| `adapters/codex-confinement.cjs` | 2 | 0 |
| `adapters/codex-rpc.cjs` | 1 | 0 |
| `adapters/codex-session-client.cjs` | 2 | 0 |
| `adapters/embedding-store.cjs` | 1 | 0 |
| `adapters/local-vlm-agent.cjs` | 2 | 0 |
| `adapters/remote-media.cjs` | 1 | 0 |
| `adapters/saved-moment-store.cjs` | 1 | 0 |
| Autres adaptateurs | 0 | 0 |
| `core/deep-ask.cjs` | 5 | 5 |
| `core/moment-search.cjs` | 1 | 1 |
| `runtime/headless-runtime.cjs` | 2 | 2 |
| `runtime/session-closing.cjs` | 1 | 1 |
| `runtime/surveillance-runtime.cjs` | 1 | 1 |
| `server/main.cjs` | 1 | 1 |
| `app/main.cjs` | 2 | 2 |
| `app/renderer.js` | 2 | 2 |
| `tv/app/companion.js` | 3 | 3 |
| `tv/app/remote-client.js` | 1 | 1 |
| **Total** | **30** | **19** |

Le contrôle observe aussi une ligne longue de moins (462 → 461), par dépliage de la
méthode `list`. Le plancher reste intact ; son resserrement appartient à la boucle.

### Réserves de clôture

Ces limites du contrat courant sont conservées et ne sont pas déclarées sans effet.
Aucune panne réelle sur la machine du propriétaire ni fournisseur réel n'a été exercé.

- **R1 — `adapters/codex-confinement.cjs`, liens de `createContext`** : accès/lien refusé
  confondu avec absence ; authentification possiblement indisponible sans cause spécifique.
  Preuve manquante : refus disque injectés par la frontière `createContext`/`prepare`.
  Travail requis : distinguer absence/refus et définir un diagnostic sûr, sans élargir les accès.
- **R2 — `adapters/codex-confinement.cjs`, candidat de `sweepStaleContexts`** : un refus
  d'examen/suppression peut laisser un arbre privé avec ses liens sans diagnostic.
  Preuve manquante : refus `lstat`/`rm` avec candidat suivant encore traité.
  Travail requis : définir le canal de refus et le tester en conservant la protection du
  propriétaire vivant et des cibles des liens.
- **R3 — `adapters/saved-moment-store.cjs`, lecture dans `list`** : élément illisible
  absent de la liste sans signalement, fichiers conservés. Preuve manquante : refus de
  lecture/parsing injecté suivi d'un élément lisible. Travail requis : préciser la visibilité
  de ces refus, puis tester sans changer implicitement la politique de liste partielle.
- **R4 — `adapters/embedding-store.cjs`, `load`** : reconstruction silencieuse et coût
  éventuel du fournisseur après refus disque/header ; un élément JSON mal structuré peut
  arrêter le chargement après des entrées déjà mémorisées. Preuve manquante : refus de
  lecture et erreur de structure tardive. Travail requis : préciser/tester la tolérance au
  schéma et le diagnostic du cache, sans promettre un repli systématiquement vide.
- **R5 — `adapters/codex-rpc.cjs`, allocation dans `atHostExit`** : absence de grâce si
  allocation impossible, SIGKILL demandé sans confirmation synchrone de disparition.
  Preuve manquante : allocation refusée avec sortie d'hôte contrôlée et signaux doublés.
  Travail requis : preuve dédiée du repli ; aucune nouvelle garantie de processus ici.
- **R6 — `adapters/remote-media.cjs`, attachement de `cleanup`** : diagnostic de nettoyage
  perdu si l'affectation lève, erreur primaire conservée. `assemble` est une méthode de
  classe implicitement stricte : chaîne, nombre, null/undefined, erreur gelée, accesseur et
  Proxy qui lèvent atteignent bien ce catch, sans échec silencieux dans ces cas.
  Preuve désormais apportée par `tests/remote-media.test.cjs`, disque doublé, avec rouge
  causal pour chacun des sept cas. La perte du diagnostic reste une limite du contrat ;
  si sa visibilité est requise, définir puis tester un canal distinct de l'erreur primaire.
  Aucune réussite du nettoyage n'est revendiquée ; aucune preuve comportementale ne manque
  pour les sept cas exercés (une raison undefined utilise un signal doublé, car
  `AbortController.abort(undefined)` produit une DOMException native).

### Clôture — contrôle complet

- `node scripts/check.mjs` → code **0**, **vert** : règles, format, lint, gel, cliquet,
  **1 387 tests JS réussis dans 111 fichiers**, zéro échec ; Python **33 tests exécutés,
  dont un ignoré**, résultat `OK (skipped=1)`. Sortie complète du contrôle dans
  `.harness-state/tickets/T176/check-complet.log`.
- `git diff --check` → code **0**. Définition et plancher du cliquet inchangés ;
  suppressions ESLint uniquement élaguées. Aucun commit ni push.
- Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T176/verdict.json`, avec les
  réserves R1–R6 et la portée réelle des preuves. Relecture et intégration laissées à la boucle.

### Reprise après relecture 1 — exploration

- Rapport, ticket/journal, écarts, état Git et diff relus ; témoin de reprise présent.
- Le constat 1 est contesté sur sa prémisse : `primary.cleanup` est affecté dans une
  **méthode de classe**, implicitement stricte, même dans un `.cjs` sans `use strict`.
  Une sonde locale Node observe `TypeError` pour chaîne, nombre, erreur gelée, null et
  undefined. Une preuve par `RemoteMedia.assemble` est ajoutée avant clarification des textes.
- Plan et raison consignés dans `ecarts.md` ; arbitrage laissé à la prochaine relecture.

### Reprise après relecture 1 — preuve et clarification du constat 1

- Ajout d'un test par la méthode publique `RemoteMedia.assemble`, sept sous-cas : chaîne,
  nombre, null, undefined, erreur gelée, accesseur et Proxy qui lèvent. `mkdtemp` et `rm`
  sont doublés ; annulation après création simulée, suppression refusée par code `EBUSY`.
  Aucun disque réel ni processus dans ce nouveau test. Le cas undefined utilise un signal
  doublé, les autres le vrai `AbortController` ; aucune attente ni minuteries ajoutées.
- Caractérisation avant clarification :
  `node --test --test-name-pattern='cleanup failure preserves' tests/remote-media.test.cjs`
  → **8 réussis** (sept sous-cas et leur parent), code 0, `cleanup-caracterisation.log`.
- Rouge causal : retrait **temporaire** du try/catch qui protège `primary.cleanup=cause`,
  puis même commande → code **1**, sept sous-cas en échec (huit échecs parent inclus),
  sur l'assertion d'identité de la raison primaire. Chaîne, nombre, null, undefined et
  erreur gelée : `TypeError` remis à la place ; accesseur et Proxy : leur propre erreur
  remise à la place. Sortie `cleanup-rouge.log`. Ce rouge établit que ces cas atteignent
  réellement le catch dans la méthode de classe, contrairement à la prémisse du rapport.
- Protection existante rétablie, sans changement de traitement, puis même commande →
  **8 réussis**, code **0**, `cleanup-vert.log`. Le commentaire précise le mode strict
  implicite des méthodes de classe et les cas de levée ; aucun échec silencieux n'est
  revendiqué pour ces cas. Tableau et réserve R6 clarifiés, preuve manquante désormais
  apportée. La perte du diagnostic reste déclarée ; le nettoyage réussi n'est pas affirmé.
- `node --test --test-concurrency=1 tests/remote-media.test.cjs tests/architecture-f06.test.cjs`
  → **26 réussis**, zéro échec, code **0** (`correction-1-tests-media.log`).
- `node scripts/check.mjs --changed` → **vert**, code **0** ; neuf tests réussis dans le
  fichier modifié ; compteur statique des cas 1207 → 1208 (un test parent ajouté),
  `catch_vides_prod` 30 → 19 (`correction-1-check-changed.log`).
- Comparaison AST des huit adaptateurs avec `HEAD` : identiques hors positions et graphie
  des littéraux (`correction-1-ast.log`). Les changements du produit restent des commentaires
  et retours à la ligne ; le retrait causal de la protection n'est pas conservé.
- `node .harness-state/tickets/T176/relever-compteur.mjs` → **19 au total, zéro dans les
  adaptateurs** (`correction-1-inventaire.json`). Le plancher et la définition sont intacts.
- Constat 1 : **contestation motivée**, avec clarification et preuve comportementale ajoutées,
  sans adopter l'affirmation d'un mode non strict. L'arbitrage appartient à la relecture
  suivante, conformément à la skill. Les réserves R1–R5 restent inchangées.

### Reprise après relecture 1 — clôture

- `node scripts/check.mjs` → **vert**, code **0**, **1 395 tests JavaScript réussis**
  dans 111 fichiers, zéro échec ; Python **33 tests dont un ignoré**, `OK (skipped=1)`.
  Sortie `correction-1-check-complet.log` dans le dossier d'état du ticket.
- `git diff --check` et
  `git diff --exit-code -- scripts/quality/metrics.mjs scripts/quality/baseline.json`
  → code **0**. Le produit ne change pas de comportement, le test ajouté garde son rouge
  causal enregistré et tous les tests existants restent intacts.
- Nouveau verdict `TERMINÉ` écrit dans `.harness-state/tickets/T176/verdict.json`.
  Constat 1 clarifié et contesté sur le mode strict, preuves jointes : arbitrage par la
  prochaine relecture. R1–R5 conservées, R6 précisée avec ses sept cas désormais exercés.
  Aucun commit ni push ; aucune relecture lancée par cette session.

### Reprise après relecture 2 — exploration

- Rapport, journal, écarts, état Git et diff relus ; témoin de reprise présent.
- Contestation de la première relecture acceptée par la seconde : le mode strict est résolu.
- Nouveau constat accepté : l'assertion dans la doublure `rm` peut être avalée. Correction
  prévue : contrôler après `assert.rejects` les cibles enregistrées dans les appels de `rm`.
- Plan sans écart consigné dans le dossier d'état : mauvaise cible temporaire, rouge causal
  de l'assertion déplacée, rétablissement ; nouvelle observation du rouge de protection de
  `cleanup` sur le test final. Aucun changement de comportement produit à conserver.

### Reprise après relecture 2 — correction et preuves causales

- Mutation temporaire de la cible de suppression dans `assemble` : `rm` reçoit un
  sous-répertoire `unexpected` au lieu du répertoire créé. Le disque reste doublé.
  `node --test --test-name-pattern='cleanup failure preserves' tests/remote-media.test.cjs`
  avant correction → code **0**, huit réussis (sept sous-cas et parent) malgré la mauvaise
  cible, confirmant le constat (`correction-2-cible-avant.log`).
- Correction du test : la doublure `rm` ne fait que lever le refus prévu ; après
  `assert.rejects`, `assert.deepEqual(removal.mock.calls.map(call => call.arguments[0]), [dir])`
  vérifie à la fois la cible et l'unicité de l'appel. Cette assertion est hors du code testé.
- Même commande avec mauvaise cible maintenue → code **1**, sept sous-cas rouges sur
  **l'assertion de cible** (huit échecs parent inclus), `correction-2-cible-rouge.log`.
  L'erreur d'assertion n'est plus interceptée par `assemble`.
- Cible normale rétablie, même commande → code **0**, huit réussis,
  `correction-2-cible-vert.log`. Le test ne change plus ensuite, notamment sa mise en forme.
- Retrait temporaire de la protection d'attachement de `cleanup`, même commande sur ce
  test final → code **1**, sept sous-cas rouges sur **l'identité de la raison primaire**
  (huit échecs parent inclus), `correction-2-cleanup-rouge.log`. Ce nouveau rouge lève la
  réserve de provenance signalée par le relecteur pour les anciens numéros de lignes.
- Protection rétablie :
  `node --test --test-concurrency=1 tests/remote-media.test.cjs tests/architecture-f06.test.cjs`
  → code **0**, **26 réussis**, zéro échec (`correction-2-tests-media.log`).
- `node scripts/check.mjs --changed` → **vert**, code **0**, neuf tests réussis dans le
  fichier modifié ; règles, format, lint, gel et cliquet verts (`correction-2-check-changed.log`).
- Empreintes des huit adaptateurs comparées à l'état relu par la boucle : **identiques**
  (`correction-2-restauration.log`). Aucune mutation conservée, aucun changement produit
  ajouté pendant cette correction ; aucun état relu réenregistré par cette session.
- `node .harness-state/tickets/T176/relever-compteur.mjs` → **19 au total, zéro dans les
  adaptateurs**, détail `correction-2-inventaire.json`. Le compteur statique de tests reste
  à **1208** (1207 au plancher), aucun nouveau cas ajouté pendant cette correction.
- `git diff --check` et
  `git diff --exit-code -- scripts/quality/metrics.mjs scripts/quality/baseline.json`
  → code **0**. Le constat 1 de relecture 2 est corrigé ; aucune contestation ne reste à trancher.

### Reprise après relecture 2 — clôture

- `node scripts/check.mjs` → **vert**, code **0**, **1 395 tests JavaScript réussis**
  dans 111 fichiers, zéro échec ; Python **33 tests dont un ignoré**, `OK (skipped=1)`.
  Sortie `correction-2-check-complet.log` dans le dossier d'état du ticket.
- `git diff --check` → code **0**. Test final inchangé depuis les preuves causales ;
  empreinte enregistrée dans `correction-2-test-final.sha256`.
- Constat de relecture 2 corrigé ; contestation de relecture 1 acceptée. Aucun constat
  non corrigé ni écart à trancher. Réserves R1–R6 conservées avec leur portée réelle.
- Nouveau verdict `TERMINÉ` écrit dans `.harness-state/tickets/T176/verdict.json`.
  Aucun commit ni push ; relecture et intégration laissées à la boucle.

### Réserves à la clôture

- R1 — adapters/codex-confinement.cjs/createContext : refus accès/lien confondu avec absence, authentification possiblement indisponible sans cause spécifique. Manquent refus disque injectés via createContext/prepare ; travail futur : distinguer absence/refus et définir un diagnostic sûr.
- R2 — adapters/codex-confinement.cjs/sweepStaleContexts : candidat non supprimable pouvant garder ses liens privés sans diagnostic. Manquent refus lstat/rm et preuve de poursuite vers un autre candidat ; travail futur : canal de refus testé sans affaiblir les protections du balayage.
- R3 — adapters/saved-moment-store.cjs/list : élément illisible omis silencieusement, fichiers conservés. Manquent refus lecture/parsing avec élément suivant lisible ; travail futur : préciser la visibilité des refus puis tester le contrat de liste partielle.
- R4 — adapters/embedding-store.cjs/load : reconstruction silencieuse et coût fournisseur éventuel ; structure invalide pouvant arrêter le chargement après des entrées déjà mémorisées. Manquent refus lecture/header et structure tardive ; travail futur : définir/tester tolérance au schéma et diagnostic.
- R5 — adapters/codex-rpc.cjs/atHostExit : allocation refusée non exercée, grâce sautée et SIGKILL demandé sans confirmation synchrone. Travail futur : preuve du repli par sortie contrôlée et signaux doublés ; aucune nouvelle garantie de disparition.
- R6 — adapters/remote-media.cjs/cleanup : méthode de classe stricte ; affectation sur chaîne/nombre, null/undefined, Error gelée, accesseur/Proxy qui lèvent atteint le catch. Preuve réobservée pour ces sept cas via assemble et disque doublé (signal doublé uniquement pour undefined), cible de rm désormais vérifiée hors du code testé. Diagnostic secondaire perdu, raison primaire conservée ; aucune réussite du nettoyage revendiquée. Si une visibilité du diagnostic est requise, définir et tester un canal distinct de l’erreur primaire.
- .harness-state/tickets/T176/relecture-3.md : **Écart accepté, critères 2 et 4 :** pas de test ni de rouge causal exigé pour de simples commentaires. Le ticket admet les justifications de comportement inchangé ; je maintiens la décision des relectures 1 et 2.
- .harness-state/tickets/T176/relecture-3.md : **Écart accepté, élagage de `eslint-suppressions.json` :** les standards l'imposent, et ce fichier ne fait pas partie du harnais protégé.
