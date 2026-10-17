---
id: T211
titre: Read the memory consultation view and passage updates in surveillance
statut: termine
bloque_par: T221, T207, T187
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La surveillance découvre et relit les passages par la vue de consultation et les événements de la
Mémoire. Activation, seaux, seconde lecture visuelle et registre conservent leurs règles actuelles.

## Sources

- Cible : `docs/domaine.md`, sections 3 (Mémoire et Vérification), 6, 8 et 9 ; ADR 0029/0030.
  Ce ticket applique la migration de lecteur de la phase 1, sans découper le registre.
- Code vérifié à `dd5efc9` : `core/surveillance.cjs:397` fixe l'activation à `snapshot.elapsedMs` ;
  `core/surveillance.cjs:429` lit `id`, horloge, `history` et `segments`.
  `core/surveillance.cjs:436` exclut tout passage commencé avant `t0`, même s'il le chevauche.
- `core/surveillance.cjs:446` ne lit que les champs propres au passage, jamais son résumé cumulatif ;
  `core/surveillance.cjs:448` calcule sa stabilité. La relecture après le visuel est à
  `core/surveillance.cjs:458`, et l'éligibilité après grâce à `core/surveillance.cjs:471`.
- `runtime/surveillance-runtime.cjs:256` rattrape les passages reçus pendant l'adoption du registre ;
  `runtime/surveillance-runtime.cjs:423` lit la session au départ ;
  `runtime/surveillance-runtime.cjs:482` suspend l'observation pendant cette adoption.
- Appelants lus : `app/main.cjs`, `runtime/headless-runtime.cjs`. Tests lus :
  `tests/surveillance.test.cjs` et `tests/surveillance-runtime.test.cjs` ; bancs de composition
  disponibles : `tests/server-surveillance.test.cjs` et `tests/mac-ipc-contract.test.cjs`.
- État attendu : T187 protège le tick et ne marque un statut annoncé qu'après sa livraison ;
  T186, transitif, isole les publications. T206/T221 et T207 livrent événements et `MemoryView` après T194.
  Relire ces livraisons : aucune de ces nouvelles interfaces n'est présente au commit vérifié.

## Périmètre

- Modifier `core/surveillance.cjs`, `runtime/surveillance-runtime.cjs` et leurs branchements Mac et
  serveur. Le domaine reçoit les données de consultation ; l'application possède l'abonnement.
  Aucun import de la racine Mémoire dans le domaine de la Vérification.
- Remplacer les entrées snapshot de `start`, `observe` et `catchUp` par la vue T207. Réagir à
  `PassageReceived` et `PassageUpdated`, y compris quand un passage devient stable après une erreur ou un saut vision.
  Garder les ticks : ils font avancer les grâces et délais même sans événement nouveau.
  `elapsedMs` est lu sur l'horloge de la vue à chaque événement et à chaque tick
  (`core/surveillance.cjs:432`). Il date `publishedAtMs` (`:733`, `:802`) et `videoLagMs` (`:787`).
- À l'activation, lire la vue courante pour fixer `t0`, puis rattraper les passages admissibles.
  Pendant l'adoption asynchrone, garder les événements sans effets métier ou les coalescer ; une
  lecture de la vue après adoption récupère tout ce qui est arrivé entre-temps, sans rejeu historique.
- Préserver les identités de session et d'activation, le curseur et les seaux, `visionGraceMs`,
  `scannedKey`, la seconde lecture au plus une fois, les reprises et la saturation. Ne pas rendre
  un passage éligible parce que sa révision a seulement changé : appliquer les règles de contenu
  et de stabilité existantes. Aucun couplage avec l'activité des questions.
- Détacher les abonnements lors de reset, remplacement et libération. Conserver l'adoption tardive,
  les écritures, les diagnostics et le rattrapage de notification livrés par T187.
- Jusqu'à T195, `tests/mac-ipc-contract.test.cjs:87-128` lit encore le texte du câblage Mac.
  Ne pas réécrire ces motifs pour suivre le nouveau câblage ; si l'un casse, s'arrêter.
- Tout nouveau module applicatif va dans `runtime/verification/` ; déclarer cette sous-zone et ses
  consommateurs dans la garde T205 si elle est créée. Un module extrait arrive sans infraction ;
  élaguer les suppressions devenues inutiles. Aucun format de registre ni réponse `/v1` ne change.

## Critères d'acceptation

1. À `t0` fixé, les passages antérieurs et celui qui chevauche l'activation ne sont jamais lus ;
   chacun des passages suivants entre dans exactement un seau. Les entrées du détecteur ne
   contiennent ni sujet cumulatif ni texte futur, comme avant la migration. Un passage reçu puis
   encore en attente à l'arrêt compte dans `stoppedWithPending` et `coverage.total`, comme
   aujourd'hui (`core/surveillance.cjs:440`, `:423`, `:888`).
2. Une transcription reste en attente pendant la grâce, puis peut être lue sans attendre le visuel.
   Son enrichissement visuel déclenche la seconde lecture prévue, une seule fois ; une notification
   identique ou une disponibilité changée seule n'ajoute pas une troisième lecture.
3. Un passage devenu stable sans texte garde son classement vide ou illisible ; une perte vision
   avec paroles utilisables ne devient pas une perte totale. Les résultats des tests de seaux,
   délais, reprises et saturation restent identiques.
4. Des passages arrivent pendant la lecture retenue d'un registre : après adoption, la vue courante
   les rattrape avec le `t0` de l'activation courante. Une lecture ou un événement tardif de A
   n'écrit ni ne nourrit B. Une archive restaurée ne réactive pas la surveillance.
5. Les scénarios T187 restent vrais : tick refusé diagnostiqué, écriture due tentée, notification
   refusée retentée au tick suivant et aucun ancien statut livré à une nouvelle session. Un test
   publie un lot sans nouvel événement de passage et vérifie que son `publishedAtMs` est l'instant
   courant de la session, lu par la vue au tick.
6. Les lecteurs de surveillance n'utilisent plus le snapshot de `WatchSession`. À l'implémentation,
   exécuter les tests surveillance, surveillance-runtime et les bancs de composition affectés en
   séquentiel, puis `node scripts/check.mjs`. Aucun comportement ni cas n'est retiré.

## Test d'acceptation attendu

Étendre les deux suites de surveillance par leurs frontières `start`, `tick`, `restore`, `snapshot`
et par le vrai branchement aux événements de la Mémoire. Piloter séparément transcription, grâce,
vision et lecture du registre avec horloge et promesses maîtrisées. Les assertions portent sur
entrées du détecteur, seaux, nombre de lectures, diagnostics et écritures, sans lecture du source.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les repères du plan sur la seconde lecture étaient approximatifs : la règle est vérifiée ici dans
`classify`. Le contrat futur doit exposer tous les états intermédiaires utiles ; si son accès porte
un autre nom, suivre le contrat T207. La migration ne décide aucune nouvelle règle de surveillance.

## Journal

- Exploration : contrats `memory.view()` et `events.subscribe()` présents ; règles de `classify` conservées.
  Lecture de `git status --short` et `git diff` : seul le statut du ticket est modifié avant ce travail,
  avec `design/continuous-context/` et `experiments/` non suivis laissés en place. Détails et écarts dans
  `.harness-state/tickets/T211/`.

- Domaine : `node --test --test-name-pattern='activation reads the consultation clock'
  tests/surveillance.test.cjs` rouge observé sur l'assertion d'acceptation de la vue ; après migration,
  `node --test tests/surveillance.test.cjs` : 23 tests réussis.
- Abonnement : `node --test --test-name-pattern='passage events coalesce'
  tests/surveillance-runtime.test.cjs` rouge observé ; après branchement, la suite entière
  `node --test tests/surveillance-runtime.test.cjs` réussit (26 tests). Événements coalescés, lecture
  hors livraison synchrone et passage reçu encore en attente compté à l'arrêt.

- Horloge : `node --test --test-name-pattern='a tick without a passage event'
  tests/surveillance-runtime.test.cjs` rouge observé (`8000 !== 41000`), puis vert après relecture de
  la vue au tick ; `publishedAtMs` et `videoLagMs` vérifiés sans nouvel événement de passage.
- Couverture complémentaire : vrais événements de `createSessionRuntime`, grâce audio et seconde
  lecture visuelle unique, changement de disponibilité seul, stabilité après perte vision,
  rattrapage avec le dernier `t0`, détachement sur reset/restauration/remplacement/fermeture et
  neutralisation d'un événement ou registre tardif de l'ancienne session.
- Libération : `node --test --test-name-pattern='refused consultation'
  tests/surveillance-runtime.test.cjs` rouge observé sur la fermeture refusée ; diagnostic isolé,
  puis suite complète verte (`node --test tests/surveillance-runtime.test.cjs` : 35 tests).
- `node scripts/check.mjs --changed` : vert, 113 tests. Le premier passage a signalé deux fixtures
  Mac utilisant encore l'ancienne entrée ; elles ont été adaptées sans changer leurs assertions.
- `node --test --test-concurrency=1 tests/surveillance.test.cjs tests/surveillance-runtime.test.cjs
  tests/server-surveillance.test.cjs tests/mac-ipc-contract.test.cjs` : vert, 101 tests, aucun échec.
  Aucun motif de câblage Mac modifié. Sorties conservées dans `.harness-state/tickets/T211/`.

- Inventaire des appelants : `scripts/probe-surveillance.cjs` fournit désormais une vue Mémoire.
  `node --check scripts/probe-surveillance.cjs` : réussi. Sonde fournisseur réel non exécutée.
- Premier `node scripts/check.mjs` : 2 526/2 527 tests JS réussis, 47 tests Python réussis ; seule
  la fixture du scénario arrêt/redémarrage de `tests/architecture-f05.test.cjs` restait sur l'ancien
  contrat. Échec reproduit avec `node --test --test-name-pattern='a surveillance stopped and started'
  tests/architecture-f05.test.cjs`, fixture migrée sans modifier les assertions, puis scénario vert.
- Nouveau `node scripts/check.mjs --changed` : vert, 128 tests réussis ; contrôle complet relancé.
- Contrôle final `node scripts/check.mjs` : **vert** — règles, format, lint, gel et cliquet réussis ;
  2 527 tests JavaScript réussis (140 fichiers, en séquentiel), 47 tests Python réussis.
  `git diff --check` : réussi. Verdict `TERMINÉ` enregistré pour la relecture par la boucle.
  Aucun commit ni push ; aucun fournisseur réel, TV, VPS ou identifiant utilisé.

- Reprise après `relecture-1.md` : deux constats mineurs acceptés. Lecture du rapport, des consignes,
  du journal, des écarts, de `git status --short` et de `git diff`. Corrections prévues : isoler le
  refus de consultation dans le tick et vérifier le détachement avant toute reconnexion.
- Constat 1 : `node --test --test-name-pattern='refused consultation at tick'
  tests/surveillance-runtime.test.cjs` rouge observé sur le refus remontant du tick, puis vert après
  remplacement de `catchUp()` par `observeCurrent()`. Le test vérifie l'annulation d'une
  vérification hors délai, le diagnostic refusé isolé et l'écriture due maintenue.
- Constat 2 : assertions de détachement ajoutées avant la réactivation pour reset/restauration/
  fermeture ; abonnés comptés à la fermeture même si la vue refuse. Vérification par mutation :
  `node --test --test-name-pattern='detach memory subscriptions|cannot prevent subscription or
  provider release at close' tests/surveillance-runtime.test.cjs` échoue sur les quatre assertions
  attendues quand le détachement de `stop()` est temporairement retiré. Code restauré dans un
  `finally`, puis `node --test tests/surveillance-runtime.test.cjs` vert : 36 tests réussis.
- Vérifications de correction : `node scripts/check.mjs --changed` vert (129 tests), puis
  `node --test --test-concurrency=1 tests/surveillance.test.cjs tests/surveillance-runtime.test.cjs
  tests/server-surveillance.test.cjs tests/mac-ipc-contract.test.cjs` vert (102 tests).
- Clôture de la correction : `node scripts/check.mjs` **vert** — règles, format, lint, gel et
  cliquet réussis ; 2 528 tests JavaScript réussis (140 fichiers, séquentiels), 47 tests Python
  réussis. `git diff --check` réussi. Les deux constats sont corrigés ; nouveau verdict `TERMINÉ`
  écrit dans le dossier d'état pour la relecture de la boucle. Aucun commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T211/relecture-2.md : **Écart accepté, fixtures de `tests/mac-ui.test.cjs`.** Il est inchangé depuis la relecture 1 : seule la construction de la session est adaptée, avec des assertions identiques.
- .harness-state/tickets/T211/relecture-2.md : **Écart accepté, `scripts/probe-surveillance.cjs`.** Il est inchangé : c'est une adaptation mécanique d'un appelant du runtime partagé. La sonde réelle n'est pas lancée.
- .harness-state/tickets/T211/relecture-2.md : **Écart accepté, fixture de `tests/architecture-f05.test.cjs`.** Il est inchangé : seule la session est remplacée, et le scénario comme ses attentes restent les mêmes.
