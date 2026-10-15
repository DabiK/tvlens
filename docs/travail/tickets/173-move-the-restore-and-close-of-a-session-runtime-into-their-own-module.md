---
id: T173
titre: Move the restore and close of a session runtime into their own module
statut: a-faire
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
