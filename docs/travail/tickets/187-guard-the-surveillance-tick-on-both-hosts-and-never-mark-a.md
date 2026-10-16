---
id: T187
titre: Guard the surveillance tick on both hosts and never mark a refused publication as told
statut: termine
bloque_par: T186
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Les deux hôtes continuent leur maintenance après un tick de surveillance refusé et en donnent un
diagnostic. Un statut de persistance dont la notification a échoué reste à annoncer ; un tick suivant
retente l'état courant, sans boucle immédiate ni historique de notifications en attente.

## Sources

- `docs/audit-architecture.md`, rapport B, B1 ; rapport A, C, réserves T177 sur le tick partiel,
  le tick Mac sans garde et l'avancement de `toldAs`. Décision du propriétaire, le 16/10 : traiter
  ces défauts isolément avant le découpage plus large de la surveillance.
- Code vérifié à `8340014` : `app/main.cjs:184` appelle directement `surveillance.tick()` depuis
  un intervalle. `runtime/headless-runtime.cjs:217` protège cet appel, mais son `catch` ne donne
  aucun diagnostic ; les actualisations quota et disque viennent ensuite.
- `runtime/surveillance-runtime.cjs:159` calcule l'état montré et avance `toldAs` à la ligne 162,
  avant `onChange`. Le `catch` conserve le registre mais perd la notification ; `announce()` à
  `runtime/surveillance-runtime.cjs:172` compare alors le même statut déjà marqué comme annoncé.
- `runtime/surveillance-runtime.cjs:486` possède le tick du runtime : `surveillance.tick()` précède
  `writeIfDue()`. Le cœur a déjà sa propre garde dans `core/surveillance.cjs:485` ; toute erreur
  interne de surveillance ne remonte donc pas automatiquement au processus Mac.
- `tests/surveillance-runtime.test.cjs:116` caractérise explicitement l'absence de nouvelle
  notification après un refus ; `tests/surveillance-runtime.test.cjs:153` distingue publication
  défaillante et erreur du cœur. Banc IPC `launch` : `tests/mac-ipc-contract.test.cjs:151` ;
  `tests/server-surveillance.test.cjs` et `tests/server-state-views.test.cjs`.
- ADR 0003, 0007, 0015, 0024 : publication, ordres de fin et domaines de temps des hôtes.

## Périmètre

- Modifier `runtime/surveillance-runtime.cjs`, `app/main.cjs` et `runtime/headless-runtime.cjs`
  pour protéger les appels périodiques et signaler leurs refus par le canal de diagnostic de T186.
  La sauvegarde due reste tentée même si le tick du cœur lève ; les autres tâches de maintenance
  et le prochain tick restent possibles. Ne pas rejouer un tick entier immédiatement.
- Confirmer `toldAs` seulement après le retour réussi du callback. Conserver aussi le fait d'un
  refus même si le statut de persistance n'a pas changé. Garder au plus l'état courant à notifier :
  à chaque tick ultérieur, au plus une tentative de rattrapage, sans timer ajouté ni récursion
  depuis le diagnostic. Une notification réussie n'est pas répétée sans changement.
- Invalider ce rattrapage lors de reset, restauration et changement de session : un ancien statut
  ne doit pas être annoncé comme celui de la nouvelle session. Écriture et notification restent
  indépendantes ; le diagnostic de livraison ne devient pas `snapshot().error` du cœur.
- Adapter les tests de caractérisation cités au nouveau contrat et déclarer cette évolution dans
  `ecarts.md`. Étendre les coutures de leurs bancs si nécessaire pour injecter le tick défaillant,
  sans comparer le texte de `app/main.cjs`. Écrire un ADR court sur confirmation et reprise bornée.
- Ne changer ni règles de détection/vérification, ni capacité, ni délais métier, ni formats disque,
  ni ordre de fin propre à chaque hôte. Le découpage de la persistance surveillance attend la vague 2.

## Critères d'acceptation

1. Sur Mac et serveur, un tick de runtime qui lève donne un diagnostic et ne lève pas hors du
   callback périodique. Le tick suivant est appelé ; les tâches quota/disque du serveur continuent.
   Les tests conduisent les minuteries, sans attendre une seconde réelle ni lancer Electron.
2. Un tick du cœur refusé ne saute plus la tentative d'écriture déjà due du runtime. Le test prouve
   cette tentative par le store injecté ; il ne prétend pas annuler les effets partiels du tick.
3. Premier callback refusé sur `write-failed`, puis callback rétabli, sans modification du registre
   ni nouveau refus disque : au tick suivant, le statut courant est reçu. Un tick supplémentaire
   n'envoie aucun doublon. Ce cas échoue sur le marquage prématuré actuel.
4. Si le callback reste défaillant, le nombre de tentatives de rattrapage est borné par les ticks
   conduits. Aucune microtâche récursive, nouvelle minuterie ou file non bornée n'apparaît ; le
   registre reste consultable et ses écritures continuent selon leur cadence existante.
5. Une nouvelle session ou un reset pendant l'échec ne livre jamais le statut de l'ancienne session.
   Un retour à `ready` publie l'état actuel, sans rejouer les statuts intermédiaires perdus.
   Un échec de publication d'un changement du cœur est aussi réessayé quand registry reste `ready`.
6. Les diagnostics de tick et de notification sont distincts des erreurs de détection et de disque.
   Un diagnostic qui lève ne bloque ni le tick suivant ni la sauvegarde due.
7. Les tests de surveillance, de vues serveur et du banc IPC Mac passent en séquentiel ;
   `node scripts/check.mjs` est vert à l'implémentation. Les seules attentes changées sont celles
   qui caractérisaient la perte de notification, nommées au journal et dans `ecarts.md`.

## Test d'acceptation attendu

`tests/surveillance-runtime.test.cjs` conduit `start`, `tick`, `flush`, `reset` et `snapshot` avec
horloge et store injectés. Le premier scénario retient l'état `write-failed`, refuse son premier
envoi, rétablit seulement l'observateur et observe sa livraison au tick suivant. Les bancs Mac et
serveur injectent ensuite une exception du runtime, afin de prouver la garde des vrais callbacks.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T186 apporte le contrat de diagnostic non bloquant et implique T199 puis T178. La reprise est une
nouvelle tentative au tick suivant, pas une garantie que les effets partiels d'un tick ont été
annulés. La panne Mac est établie par lecture ; aucune panne matérielle n'a été reproduite au découpage.

## Journal

- Exploration sur `c0bdaec` : consignes, trois compositions, tests et ADR 0003/0007/0015/0024/0030/0032 lus.
  `git status --short` et `git diff` : seul le statut du ticket était modifié ; dossiers
  `design/continuous-context/` et `experiments/` préexistants. Témoin de hooks présent.
  Exploration et évolution autorisée des caractérisations consignées dans
  `.harness-state/tickets/T187/{exploration,ecarts}.md` avant implémentation.

- Tests d'abord, sorties conservées dans `.harness-state/tickets/T187/` :
  `node --test --test-name-pattern='a refused persistence notice' tests/surveillance-runtime.test.cjs`
  rouge sur l'absence de livraison au tick suivant, puis vert (1/1).
  Seule attente existante changée : la caractérisation auparavant nommée
  `a failed host publication leaves the registry readable but does not retry the same persistence notice`,
  conformément à `ecarts.md`. La caractérisation des erreurs du cœur conserve ses assertions.
- `node --test --test-name-pattern='a failed core tick still' tests/surveillance-runtime.test.cjs` :
  rouge sur l'écriture due omise, puis vert (1/1). Le test final ajoute des refus de notification et de
  diagnostic et reste vert. `node --test --test-name-pattern='persistent delivery failures' tests/surveillance-runtime.test.cjs` :
  rouge sur l'absence de diagnostic, puis vert (1/1) ; quatre ticks conduits, quatre rattrapages,
  deux écritures supplémentaires aux échéances, aucune nouvelle minuterie ni tentative récursive.
- `node --test --test-name-pattern='the Mac surveillance interval' tests/mac-ipc-contract.test.cjs` :
  rouge sur l'exception qui sort du callback, puis vert (3/3, sous-tests compris).
  `node --test --test-name-pattern='the server interval diagnoses' tests/server-surveillance.test.cjs` :
  rouge sur le diagnostic absent, puis vert (3/3). Diagnostic normal et diagnostic qui lève conduits
  sur chaque hôte ; quota, vérification disque et publication de sa nouvelle mesure continuent côté serveur.
  L'extension du banc IPC a d'abord dépassé la complexité autorisée ; ses coutures sont regroupées
  dans une table de fabriques, sans assouplir le lint.
- Preuves complémentaires sur la correction :
  `node --test --test-name-pattern='a refused core change|catch-up publishes|reset, restore|a refused restoring' tests/surveillance-runtime.test.cjs`
  vert (7/7) : état courant sous `ready`, retour du disque, reset, restauration, remplacement et lecture en attente.
  `node --test --test-name-pattern='the Mac composition journals a refused surveillance' tests/mac-ipc-contract.test.cjs`
  vert (1/1) : journal réel de l'hôte et livraison après rétablissement du seul abonné fenêtre.
  `node --test --test-name-pattern='a failed core tick still|reset, restore' tests/surveillance-runtime.test.cjs`
  vert (5/5) après invalidation explicite du marqueur et ajout du diagnostic défaillant à l'écriture due.
- Premier `node scripts/check.mjs --changed` : vert, règles/format/lint/gel/cliquet et 49 tests JS
  dans les trois fichiers modifiés. ADR 0033 rédigé sur confirmation et reprise bornée.
- Contrôle final `node scripts/check.mjs` : vert, code de sortie 0 ; règles, format, lint, gel et
  cliquet validés ; 1 724/1 724 tests JS dans 123 fichiers et 22 tests Python réussis.
  Les suites surveillance, vues serveur et IPC Mac ont donc été exécutées en séquentiel.
  Sortie conservée dans `.harness-state/tickets/T187/check-full.log`.
  `git diff --check` : aucune erreur. Verdict `TERMINÉ` écrit pour la boucle ; aucun commit,
  push, fournisseur réel, lancement d'Electron ni intervention TV/VPS.

### Réserves à la clôture

- .harness-state/tickets/T187/relecture-1.md : **Écart accepté, critère 3 et 7 :** la caractérisation `a failed host publication … does not retry the same persistence notice` évolue. Le ticket l'ordonne au périmètre, et ce qu'elle ne prouve plus est toujours prouvé ailleurs (voir critère 7).
- .harness-state/tickets/T187/relecture-1.md : **Écart accepté, critère 5 :** la caractérisation des changements du cœur dont la publication échoue est conservée telle quelle (`:310`), et une preuve complémentaire sous `ready` est ajoutée (`:196`).
- .harness-state/tickets/T187/relecture-1.md : **Écart accepté, critère 1 :** le banc IPC `launch` est étendu par une table de fabriques. Les remplacements existants de conversation et de session se comportent comme avant (mêmes arguments, même condition). Le ticket autorise l'extension des coutures.
- .harness-state/tickets/T187/relecture-1.md : **Écart accepté, critère 1 :** la garde est exportée par `runtime/surveillance-runtime.cjs`. Ce fichier est dans le périmètre, et la règle demande d'écrire une seule fois la logique commune aux hôtes.

  Il n'y avait aucun constat contesté : c'est une première relecture.
