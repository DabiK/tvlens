---
id: T190
titre: Let the watch session own its question-pending state
statut: termine
bloque_par: T199
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

`WatchSession.setQuestionPending(busy)` possède la transition « question en cours », sa publication
et la reprise des voies. Les deux hôtes utilisent la même règle pour reconnaître une question
active appartenant à la session chargée ; ils n'écrivent plus `watch.asking` à la main.

## Sources

- `docs/audit-architecture.md`, rapport A, B3 et D1 ; rapport B, B6 et D6. Décision du propriétaire,
  le 16/10 : partager les règles dans `runtime/`, en conservant les deux cycles de vie des hôtes.
- Code vérifié à `8340014` : `core/session.cjs:78` expose le mutateur `asking` ; sa remise à false
  termine la mesure de retenue vision. `core/session.cjs:239` distribue le drainage et
  `core/session.cjs:320` retient la vision pendant une question si `visionDuringAsk` est false.
- `app/main.cjs:149` filtre les jobs queued/running sur l'identifiant de session, puis écrit,
  publie et programme le drainage. `runtime/headless-runtime.cjs:126` fait la même mécanique mais
  prend tous les jobs actifs, ou `closing`, sans filtre de session. Le callback Mac différé relit
  `loaded` et peut ainsi viser une autre session que celle dont le drapeau a été abaissé.
- La même mécanique apparaît dans `tests/question-ceiling.test.cjs:40` et
  `scripts/simulate-stream.cjs:280`. Écritures de tests dans `tests/split-perception.test.cjs:71`,
  `tests/session-latency.test.cjs:98`, `tests/architecture-f08.test.cjs:136`,
  `tests/timeline-server.test.cjs:190` et `tests/session-timeline.test.cjs:88`.
- `core/session.cjs:90` ferme silencieusement l'admission, questions comprises. Ce contrat est
  protégé par `tests/watch-session-ending.test.cjs:94`. Banc Mac :
  `tests/mac-ipc-contract.test.cjs:857` ; serveur : `tests/remote-server.test.cjs`.
- ADR 0007, 0015, 0024 : fermeture, checkpoint des questions et adoption synchrone côté serveur.

## Périmètre

- Ajouter `setQuestionPending(busy)` dans `core/session.cjs`. La méthode change l'état seulement
  si nécessaire, termine la mesure de retenue au relâchement, publie et programme elle-même le
  drainage différé de cette instance. Garder `asking` lisible dans les snapshots et supprimer son
  mutateur public ; les usages internes restants suivent la même propriété d'état.
- Ajouter une fonction pure de `runtime/` qui reconnaît les jobs queued/running dont `sessionId`
  correspond à la session concernée. Les jobs d'une autre session, sans identité ou terminés ne
  rendent pas cette session occupée. Les deux hôtes l'appellent ; le serveur garde explicitement
  son verrou de fermeture, distinct de la présence de jobs.
- Migrer les deux hôtes, les tests et `scripts/simulate-stream.cjs` : aucun appelant ne recopie
  « affecter, émettre, relancer ». Le callback différé reste attaché à l'instance qui le possède,
  même si l'hôte adopte une autre session avant son exécution.
- Conserver les règles de checkpoint et de restauration des questions : ce ticket ne réécrit ni
  les archives historiques, ni la sélection des questions à sauvegarder. La surveillance ne passe
  pas par la file de questions et ne lève pas ce drapeau.
- Ajouter les tests de la commande et de la fonction pure ; adapter les entrées des tests existants
  sans changer leurs résultats attendus. Écrire un ADR court sur cette propriété de la transition.
- Ne changer ni plafond des questions, ni bornes des files, ni politique `visionDuringAsk`, ni
  ordre des fermetures. L'extension de la garde textuelle d'architecture est portée par T030.

## Critères d'acceptation

1. Depuis l'interface publique du cœur, `setQuestionPending(true)` publie `asking: true` ; répéter
   la même valeur n'ajoute ni publication ni drainage. Avec vision retenue, l'audio continue et
   aucune nouvelle description ne démarre. Avec `visionDuringAsk: true`, la vision continue.
2. `setQuestionPending(false)` termine exactement la durée de retenue puis relance les passages
   conservés, sans appel explicite à `emit()` ou `drain()` par le test. Le temps ajouté après le
   relâchement n'est plus compté dans `visionBlockedMs`.
3. Si la session est ending ou closed avant l'exécution différée, aucune nouvelle analyse ni
   publication tardive ne démarre. `closeIntake()` conserve son contrat silencieux et fermé ;
   une notification de fin de question ne rouvre jamais l'admission.
4. La règle partagée donne true pour une question queued ou running de A, false pour celle de B,
   une entrée sans `sessionId`, un travail terminé et l'absence de session. Les bancs des deux
   hôtes prouvent qu'une publication étrangère ne lève pas le drapeau de la session chargée.
5. Relâcher A puis adopter B avant la microtâche ne draine pas B. Une fermeture serveur conserve
   son verrou même sans job actif ; une surveillance active seule ne rend pas la session asking.
6. Il ne reste aucune affectation exécutable de `watch.asking` hors de son propriétaire dans
   `core/session.cjs`, ni aucune copie de la séquence publication/drainage dans les hôtes et le
   simulateur. Vérification par recherche et relecture, hors documents historiques et chaînes
   de fixtures de gardes ; les tests utilisent la commande sans perdre leurs assertions.
7. Les tests cités, ceux de la fonction partagée et de la commande passent en séquentiel ;
   `node scripts/check.mjs` est vert à l'implémentation, sans modification du harnais ni du plancher.

## Test d'acceptation attendu

`tests/split-perception.test.cjs` et `tests/session-latency.test.cjs` conduisent les deux valeurs
de la commande, avec horloge et fournisseurs retenus par promesses. Un test du helper de runtime
prouve le filtre de session ; les bancs Mac/serveur prouvent le câblage et la fermeture. Les tests
ne comparent pas le texte des méthodes ; l'inventaire final protège la migration du simulateur.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T199 implique T178. Le filtre Mac suit la décision du propriétaire, le 16/10, et le rapport A, D1. Les questions historiques sans `sessionId` restent lisibles et
sauvegardables selon le contrat existant ; elles ne constituent pas un travail actif identifié.

Hypothèse de course à prouver : le drainage différé Mac peut atteindre B après un relâchement de A,
puisque son callback relit `loaded`. Aucune reproduction n'a été exécutée au découpage.

## Journal

- Exploration : règles, skill, code, appelants, tests et ADR examinés. Le callback Mac relit bien `loaded` ; le serveur ne filtre pas les jobs par session. Plan de preuves et absence d'écart consignés dans `.harness-state/tickets/T190/`.
- Rouge/vert : commande (`node --test --test-name-pattern='question pending publishes' tests/split-perception.test.cjs`) puis fermeture (`node --test tests/watch-session-ending.test.cjs`) et filtre (`node --test tests/conversation-runtime.test.cjs`) observés. Sorties conservées dans le dossier d'état.
- Les nouveaux tests des hôtes exécutés avec le cœur de HEAD ont reproduit deux échecs d'assertion : publication étrangère côté serveur et drainage de B après relâchement de A côté Mac. Après migration, `node --test --test-name-pattern='server ignores foreign' tests/remote-server.test.cjs` et `node --test --test-name-pattern='Mac question publications|releasing a Mac question' tests/mac-ipc-contract.test.cjs` sont verts.
- `node --test --test-concurrency=1 tests/split-perception.test.cjs tests/session-latency.test.cjs tests/watch-session-ending.test.cjs tests/conversation-runtime.test.cjs tests/question-ceiling.test.cjs tests/architecture-f08.test.cjs tests/timeline-server.test.cjs tests/session-timeline.test.cjs tests/mac-ipc-contract.test.cjs tests/remote-server.test.cjs tests/session.test.cjs` : 117 tests réussis, aucun échec. Premier `node scripts/check.mjs --changed` : vert, 109 tests réussis.
- Inventaire complémentaire : `scripts/latency-model.cjs` utilisait aussi le mutateur via l'alias `session`. Migration consignée dans `ecarts.md` avant modification ; `node --test tests/capture-display-latency.test.cjs` a montré deux assertions rouges avant sa correction, sans changement des attendus.
- `node --test --test-concurrency=1 tests/capture-display-latency.test.cjs tests/stream-simulation.test.cjs` : 34 tests réussis, aucun échec. ADR 0035 ajouté sur la propriété de la transition.
- Inventaire final : `rg -n --pcre2 '\.asking\s*=(?!=)' core runtime app scripts tests --glob '*.{cjs,js,mjs}'` ne trouve que la chaîne de fixture de `tests/architecture-guard.test.cjs`. Aucun callback de drainage ne reste dans les hôtes et les deux simulateurs ; `git diff --check` est sans diagnostic.
- `node scripts/check.mjs` : vert ; règles, format, lint, gel et cliquet réussis, 1 739 tests JavaScript réussis dans 124 fichiers et 22 tests Python réussis. Harnais et plancher inchangés. Verdict `TERMINÉ` consigné dans `.harness-state/tickets/T190/verdict.json` ; relecture et intégration laissées à la boucle.
- Reprise après `relecture-1.md` : les deux constats sont acceptés. Garde de publication/drainage à séparer de la mise à jour d'état et du terme de retenue pendant ending ; compteur Mac `chatBusy` à rétablir. Tests de régression préparés avant correction, sans retrait d'assertion.
- Correction du constat bloquant : `node --test --test-concurrency=1 --test-name-pattern='question released during ending|question resumption|ending session still refuses' tests/session-latency.test.cjs tests/watch-session-ending.test.cjs` a montré six assertions rouges, dont 8 000 ms facturées au lieu de 2 500 ms après relâchement. La garde ending/closed est maintenant placée après la mise à jour d'état et `endVisionHold()`, avant publication/drainage. `node --test --test-concurrency=1 tests/session-latency.test.cjs tests/watch-session-ending.test.cjs` : 31 tests réussis. Les assertions de silence existantes restent intactes ; états tardifs et refus d'une question concurrente sont aussi couverts. ADR 0035 rectifié.
- Correction du constat mineur : `node --test --test-name-pattern='Mac chat overlap still counts' tests/mac-ipc-contract.test.cjs` a échoué sur le compteur public de chevauchement (0 au lieu de 1). La règle initiale de `questionPending` est rétablie. `node --test --test-name-pattern='Mac chat overlap still counts|Mac question publications|releasing a Mac question' tests/mac-ipc-contract.test.cjs` : 3 tests réussis ; le filtre du seul drapeau asking et la course A/B restent couverts.
- `node scripts/check.mjs --changed` après corrections : vert ; règles, format, lint, gel et cliquet réussis, 112 tests JavaScript réussis dans 10 fichiers. Recherche des affectations asking et `git diff --check` sans nouvelle anomalie.
- `node scripts/check.mjs` après corrections de relecture 1 : vert ; règles, format, lint, gel et cliquet réussis ; 1 742 tests JavaScript réussis dans 124 fichiers, aucun échec ; 22 tests Python réussis. Les deux constats sont corrigés sans contestation ni retrait d'assertion. Nouveau verdict `TERMINÉ` écrit ; relecture et intégration laissées à la boucle.

### Réserves à la clôture

- .harness-state/tickets/T190/relecture-2.md : **Écart accepté, migration de `scripts/latency-model.cjs`.** Ce fichier est un appelant qui recopiait la séquence, et le ticket exige « aucun appelant ne recopie ». Ses attendus sont inchangés : rouge avant la migration, vert après.
