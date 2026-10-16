---
id: T173
titre: Move the restore and close of a session runtime into their own module
statut: termine
bloque_par: T172, T123
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La restauration et la fin d'un runtime de session ont un module propriétaire, testable sans démarrer
l'hôte Mac ou le serveur. `createSessionRuntime` conserve sa façade et compose les fournisseurs, le
manifeste et ce cycle de vie. Ouvrir, reprendre, fermer, archiver ou sceller une session garde ses
effets actuels, y compris quand le disque refuse la fin.

## Sources

- `docs/audit-points-chauds.md`, sections A « Carte des points chauds » et B « Découpage des trois gros fichiers », restauration et fermeture.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Code à `e92c6a6`, avant les déplacements de T172 :
  - validations d'archive avant construction, `runtime/session-runtime.cjs:73` ; horloge restaurée
    en pause, `runtime/session-runtime.cjs:216` ; adoption de l'inventaire puis `watch.restore`,
    `runtime/session-runtime.cjs:392` ;
  - état de fin par vie et liste d'erreurs, `runtime/session-runtime.cjs:296` ; étapes tentées même
    après une erreur, `runtime/session-runtime.cjs:307` ; façade rendue,
    `runtime/session-runtime.cjs:419` ; `pause`/`resume`, `runtime/session-runtime.cjs:444` ;
  - `close`, `runtime/session-runtime.cjs:461` : révocation, fermeture coalescée, attente des
    stockages, fermeture des fournisseurs, puis barrière disque et manifeste final ;
    `archive`, `runtime/session-runtime.cjs:535` ; `seal`, `runtime/session-runtime.cjs:542` ;
    ouverture par bibliothèque, `runtime/session-runtime.cjs:553`.
- Appelants : `app/main.cjs:293` et `runtime/headless-runtime.cjs:617` composent les sessions ;
  `runtime/headless-runtime.cjs:963` ouvre une archive ; `runtime/session-closing.cjs:53` orchestre
  le sort d'une session par `archive` ou `seal`, indépendamment de ses ressources internes.
- Tests protecteurs : `tests/session-durable.test.cjs:82`, `tests/session-durable.test.cjs:497`,
  `tests/session-durable.test.cjs:540`, `tests/session-durable.test.cjs:680`,
  `tests/session-durable.test.cjs:753`, `tests/session-delete.test.cjs:48`,
  `tests/session-delete.test.cjs:131`, `tests/architecture-f05.test.cjs` et
  `tests/architecture-f07.test.cjs`.
- ADR 0002 (archive confirmée), 0003 (publication et écritures), 0005 (inspecteur révocable),
  0007 (protocole de l'hôte), dans `docs/adr/`.

## Périmètre

- Créer `runtime/session-lifecycle.cjs`, recevant les objets déjà construits, le propriétaire du
  manifeste issu de T172 et les faits d'archive validés. Déplacer la restauration de l'inventaire et
  de `WatchSession`, puis `pause`, `resume`, `close`, `archive`, `seal` et leur état privé de fermeture.
  Décomposer les étapes en fonctions nommées ; ne pas déplacer la grande fonction entière sans la couper.
- `runtime/session-runtime.cjs` garde la validation avant tout effet, l'identité, la composition,
  `storage`, les exports publics et `openArchivedSession` comme façade. Il remet au module les
  dépendances nécessaires ; aucune lecture de l'hôte ni état global n'est introduit.
- Ajouter `tests/session-lifecycle.test.cjs` par l'interface du module, et un ADR court sur la
  propriété de l'état de fermeture et la conservation de l'ordre des ADR existants.
- Ne modifier ni `runtime/session-closing.cjs`, ni les politiques des hôtes, ni les formats disque,
  ni les règles de rétention, ni les assertions des tests existants. Les transitions de domaine
  livrées par T123 s’utilisent telles quelles, sans rétablir les anciennes écritures.

## Critères d'acceptation

1. Une archive restaurée adopte inventaire et volume des miniatures, reste arrêtée en lecture seule,
   conserve son temps écoulé, et ne lance ni analyse, ni indexation, ni écriture. Les absences de médias
   et les orphelins sont remis au cœur comme avant. La reprise explicite vérifie la garde disque avant
   tout changement, puis reprend horloge et session et enregistre la capture.
2. Deux fermetures simultanées ne ferment les ressources qu'une fois. La révocation de l'inspecteur
   précède toute attente ; une écriture déjà commencée atterrit avant la sauvegarde finale et ne
   déclenche pas une analyse. Les erreurs d'une ressource n'empêchent pas la tentative des suivantes,
   et `closeErrors` conserve ses textes bornés et rend une copie.
3. Un store différé prouve l'ordre états finaux, `flush`, manifeste final. Un refus de sauvegarde
   ou de manifeste fait rejeter `archive`, après libération des ressources ; `close` et `seal` gardent
   leur contrat actuel face à ce refus disque. Un nouvel essai après rétablissement peut confirmer
   l'archive sans refermer les fournisseurs. Tester aussi une archive reprise dont le manifeste
   antérieur disait déjà `archived` et une pause tardive après un refus.
4. `seal` scelle store et cache de vecteurs avant les écritures finales ; aucune écriture tardive ne
   recrée le dossier supprimé. `close({ purge: true })` reste refusé en lecture seule et, sur une
   session ayant capturé, retire les médias en conservant les textes et les totaux de manque.
5. Les corps de restauration et de fin ne sont plus définis dans `createSessionRuntime` ; chaque
   état `ending`, `archived`, `unconfirmed`, `closeErrors` n'a qu'un propriétaire. Documenter au journal
   leur emplacement final et la baisse de taille du fichier par `wc -l` avant/après.
6. Les tests existants passent sans changement d'assertion. Le diff sous `tests/` ne contient que
   `tests/session-lifecycle.test.cjs`. Exécuter en séquentiel les tests cités, les bancs des deux hôtes,
   puis `node scripts/check.mjs` ; consigner les résultats réellement observés.

## Test d'acceptation attendu

`tests/session-lifecycle.test.cjs` pilote le module exporté avec une session, des ressources et un
store différés enregistrant les appels. Les tests durables, de révocation et de suppression existants
restent la preuve sur les vrais stores en répertoires temporaires ; les bancs IPC/HTTP gardent leurs
assertions. Aucun fournisseur réel n'est requis.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T123 réécrit auparavant le bloc `close` déplacé ici : ses transitions sont un prérequis explicite.
T172 fournit la composition et le propriétaire du manifeste ; sa dépendance à T150 couvre la fin
du plan court. Les repères à `e92c6a6` servent à retrouver les responsabilités, pas à supposer leurs
lignes inchangées après T172. Ce module traite les ressources d'une session ; le protocole partagé
de fin des hôtes reste `runtime/session-closing.cjs`, et le coordinateur headless relève de T180.

## Journal

- Exploration : base `2f266f3`, témoin de hooks présent ; consignes, code, appelants, tests protecteurs
  et ADR étudiés. `wc -l runtime/session-runtime.cjs` : **417** lignes avant extraction.
  Plan et absence d'écart consignés dans `.harness-state/tickets/T173/`.
- Tests d'abord : `node --test tests/session-lifecycle.test.cjs`, sorties conservées dans les
  fichiers `restore-{red,green}.log`, `resume-{red,green}.log`, `close-{red,green}.log`,
  `confirmation-{red,green}.log`, `archive-{red,green}.log` et `seal-purge-{red,green}.log`
  du dossier d'état. Rouges observés sur les assertions (restauration absente, méthodes absentes,
  fermeture avant `flush`, purge non refusée ou médias non effacés), puis verts successifs :
  **1, 3, 5, 6, 10 et 14 tests**. Un premier contrôle rapide a signalé deux helpers inutilisés ;
  ils ont été retirés puis introduits avec leurs tests avant les exécutions rouges.
- Extraction raccordée à la façade : `ending`, `archived`, `unconfirmed`, `closeErrors` vivent
  exclusivement dans les champs privés de `SessionLifecycle`, dans `runtime/session-lifecycle.cjs`.
  Les transitions `closeIntake` et `beginEnding` restent celles du cœur. Restauration et étapes de
  fermeture sont des fonctions ou méthodes distinctes. Le manifeste lit `hasConfirmedEnd()`.
  `wc -l runtime/session-runtime.cjs runtime/session-lifecycle.cjs` : **289 et 169 lignes**, soit
  **128 lignes retirées** de la composition (417 → 289). ADR 0020 ajouté.
- `node_modules/.bin/eslint --prune-suppressions runtime/session-runtime.cjs` : code 0 ; aucune
  suppression devenue inutile, fichier de gel inchangé.
- `node --test --test-concurrency=1 tests/session-lifecycle.test.cjs tests/session-durable.test.cjs tests/session-delete.test.cjs` :
  **41/41**, aucun échec ; sortie `integration-green.log` conservée dans le dossier d'état.
- `node scripts/check.mjs --changed` : **vert**, règles, format, lint, gel, cliquet et 14 tests
  nouveaux réussis ; sortie `check-changed.log`.
- `node --test --test-concurrency=1 tests/architecture-f05.test.cjs tests/architecture-f07.test.cjs tests/revocable-inspector.test.cjs tests/watch-session-ending.test.cjs tests/disk-guard.test.cjs tests/mac-ipc-contract.test.cjs tests/server-sessions.test.cjs tests/remote-server.test.cjs` :
  **92/92**, aucun échec, code 0 ; sortie `hosts-green.log`. Banc Mac derrière Electron substitué,
  banc serveur derrière HTTP local, fournisseurs simulés.
- Neuf mutations temporaires du module, chacune exécutée avec
  `node --test tests/session-lifecycle.test.cjs` : restauration, garde disque et révocation omises,
  fermeture non partagée, refus du cœur ou d'archive ignoré, ancienne confirmation héritée,
  scellement tardif, total des médias manquants perdu. **9/9 détectées sur assertion**, code 1 ;
  source restaurée à l'identique, détail dans `mutations.log` et `mutation-*.log`.
  Un quinzième test caractérise ensuite pause et archivage en lecture seule sans écriture ;
  le test d'erreurs de ressources vérifie aussi qu'elles n'empêchent pas l'archive.
- `node scripts/check.mjs` : **vert**, 108 fichiers et **1 343/1 343 tests JS**, suite Python
  **33 tests, un ignoré, aucun échec** ; sortie `check-full.log`, code 0. Aucun fichier de test
  existant modifié, aucun fournisseur réel, aucune TV ni aucun VPS sollicité.
- Dernier nettoyage conforme aux standards : la borne de diagnostic conserve ses 200 caractères
  sous le nom `CLOSE_ERROR_MAX_CHARS`. `wc -l runtime/session-runtime.cjs runtime/session-lifecycle.cjs` :
  **289 et 171 lignes**. `node scripts/check.mjs --changed` sur cet état : **vert, 15/15 tests**,
  code 0 ; sortie `check-changed-final.log`.
- `node scripts/check.mjs` sur le code final : **vert**, code 0 ; **1 343/1 343 tests JS**
  dans 108 fichiers, suite Python réussie (**33 tests dont un ignoré**), règles, format, lint,
  gel et cliquet verts ; sortie `check-full-final.log`. `git diff --check` : code 0.
  `git diff --name-only -- tests` est vide et `git status --short --untracked-files=all -- tests`
  ne nomme que `tests/session-lifecycle.test.cjs` : aucune assertion existante modifiée.
  Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T173/verdict.json`, pour relecture par la boucle.
- Reprise après `relecture-1.md` : rapport, journal, écarts, statut Git et diff relus ; témoin de
  reprise présent. Deux mineurs acceptés : prouver l'attente de chaque scellement après vidage
  des microtâches et rétablir les commentaires de contrat. Plan dans `correction-1.md` ; aucune
  contestation. La duplication des diagnostics avec `session-closing.cjs` reste une réserve
  hors périmètre, ce module étant explicitement exclu du ticket.
- Constat 1, preuve d'abord : avec `await sealing[0]` à la place de `await Promise.all(sealing)`,
  `node --test --test-name-pattern='waits for both seals' tests/session-lifecycle.test.cjs` passe
  sur le test initial (1/1, code 0, `correction-1-seal-original-mutant.log`), confirmant la lacune.
  Le test renforcé attend une macrotâche avant chaque assertion d'attente et libère les verrous
  dans les deux ordres. Même commande sur quatre mutations : store seul, vecteurs seuls, second
  appel `store.seal()` seul, attente supprimée ; **4/4 rouges sur assertion**, code 1, sorties
  `correction-1-seal-*-red.log` et bilan `correction-1-mutations.log`. Source restaurée à l'identique.
  `node --test tests/session-lifecycle.test.cjs` : **15/15**, code 0, `correction-1-lifecycle-green.log`.
- Constat 2 : raisons et contrats rétablis pour la poursuite des fermetures après erreur, la purge
  refusée en lecture seule, la nouvelle sauvegarde après refus, le refus connu seulement du cœur,
  l'archive et les fichiers écrits par l'hôte, et la garantie du scellement. Les trois délégations
  de la façade portent aussi leur contrat. Aucun comportement de production modifié.
  `wc -l runtime/session-runtime.cjs runtime/session-lifecycle.cjs` : **292 et 185 lignes**,
  soit **125 lignes retirées** de la composition par rapport aux 417 initiales ; ADR 0020 actualisé.
- `node scripts/check.mjs --changed` après correction : **vert**, code 0, **15/15 tests** ;
  sortie `correction-1-check-changed.log`.
  `node --test --test-concurrency=1 tests/session-lifecycle.test.cjs tests/session-durable.test.cjs tests/session-delete.test.cjs tests/architecture-f05.test.cjs tests/architecture-f07.test.cjs tests/revocable-inspector.test.cjs tests/watch-session-ending.test.cjs tests/disk-guard.test.cjs tests/mac-ipc-contract.test.cjs tests/server-sessions.test.cjs tests/remote-server.test.cjs` :
  **134/134**, code 0, aucun échec ; sortie `correction-1-regression.log`.
- `node scripts/check.mjs` après correction : **vert**, code 0 ; **1 343/1 343 tests JS** dans
  108 fichiers, suite Python réussie (**33 tests dont un ignoré**) ; règles, format, lint, gel et
  cliquet verts, sortie `correction-1-check-full.log`. `git diff --check` : code 0.
  Le seul fichier sous `tests/` ajouté ou modifié reste `tests/session-lifecycle.test.cjs`.
  Nouveau verdict `TERMINÉ` écrit : deux mineurs corrigés, réserve du constat 3 conservée dans `reste`.

### Réserves à la clôture

- Hors périmètre, relecture 1 constat 3 : unifier ultérieurement la borne et la mise en forme des erreurs de fermeture entre session-lifecycle.cjs et session-closing.cjs. La duplication préexistait ; le ticket interdit de modifier session-closing.cjs.
- .harness-state/tickets/T173/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 1 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
