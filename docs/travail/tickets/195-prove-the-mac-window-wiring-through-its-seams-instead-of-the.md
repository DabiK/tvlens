---
id: T195
titre: Prove the Mac host wiring through its registered handlers and effects
statut: termine
bloque_par: T062
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Le banc hôte prouve ses canaux IPC et l'indépendance des agents par les gestionnaires enregistrés
et leurs effets, au lieu de lire la forme de main.cjs. Aucun code produit ne change dans ce lot.
La couture renderer, ses six groupes, son ADR et ses mutations appartiennent à T203.

## Sources

- `docs/audit-architecture.md`, rapport A, B8 ; rapport B, B7.
  Décision du propriétaire, le 16/10 : séparer le banc hôte de la couture renderer.
- Code vérifié à `8340014` : `tests/mac-ipc-contract.test.cjs:87` à `:128` compare les canaux au
  texte de main.cjs, compte les arrêts et déduit l'indépendance de surveillance/options vision.
- `tests/mac-ipc-contract.test.cjs:53` exécute déjà le vrai preload ; `:151` à `:204` fournit launch,
  qui charge le vrai hôte avec Electron simulé et expose ses gestionnaires ; `:382` prouve déjà la
  coexistence surveillance/question. `tests/helpers/wait.cjs:11` à `:82` fournit les aides d'attente.
- T062 modifie aussi `tests/mac-ipc-contract.test.cjs`, pour ses aides. C'est la raison de l'ordre ;
  il ne crée pas ces aides déjà livrées. T061/T060/T199/T178 sont transitifs.
- ADR 0005 : processus indépendants par rôle ; ADR 0018 et 0025 : contrats Mac conservés.

## Périmètre

- Modifier seulement `tests/mac-ipc-contract.test.cjs` et ses aides sous tests/ si nécessaire pour
  remplacer les preuves de forme de la plage 87–128. Réutiliser launch et le vrai preload avec
  Electron simulé ; les canaux se comparent aux gestionnaires réellement enregistrés.
- Remplacer comptages cancel/stop et déduction textuelle des options par effets observables :
  capture, question, surveillance et vérification manuelle gardent leurs contrats de coexistence.
  Le démarrage balaie les seuls contextes Codex via sa dépendance contrôlée, sans racine réelle.
- Réutiliser directement `tests/helpers/wait.cjs` pour signaux et bornes. Le journal associe chaque
  ancienne assertion à sa preuve publique ou à un scénario existant conservé.
- Conserver les autres scénarios du banc et les gardes de frontière utiles. Aucun changement dans
  app/, core/, adapters/ ou runtime/, aucun ADR nouveau, protocole modifié, harnais ou plancher.

## Critères d'acceptation

1. Les canaux invoqués par le vrai preload trouvent les handlers réellement enregistrés par le vrai
   hôte sous Electron simulé ; un canal manquant est un échec. Aucun fragment JS de main.cjs
   n'est recherché pour prouver ce contrat.
2. Les scénarios existants de coexistence restent actifs : une question ne suspend ni surveillance
   ni vérification manuelle. Les vérifications des options et du balayage initial passent par les
   dépendances déjà contrôlées du banc, avec événements/promesses, sans lancement natif. Exception
   déclarée : la branche de vision de repli d'`app/main.cjs:67` ne s'atteint qu'avec `--live-inspection`
   et une configuration illisible, que `launch` ne permet pas (il force `--smoke-test`) ; son assertion de
   contenu (`tests/mac-ipc-contract.test.cjs:127`) est conservée telle quelle, avec cette raison au journal.
3. Le journal rapproche chaque assertion de la plage initiale 87–128 de sa preuve de remplacement.
   Le diff conserve titres, nombre de cas et valeurs attendues ; les seules assertions retirées
   sont celles de forme remplacées par une preuve de comportement. Aucun fichier produit ne change.
4. À l'implémentation, exécuter mac-ipc-contract et wait-helpers en séquentiel, puis
   `node scripts/check.mjs`. Aucun fournisseur réel, Electron natif, installation ni test de remplissage.

## Test d'acceptation attendu

Le banc existant lance le véritable hôte par launch, appelle le vrai preload et observe handlers,
commandes et publications sous dépendances maîtrisées. Les scénarios de coexistence font foi ;
une projection isolée ou la présence textuelle d'un appel n'est pas la preuve d'un effet.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La dépendance à T062 ordonne les deux modifications de mac-ipc-contract. La couture du renderer
ne fait pas partie de ce lot et attend T195 dans T203. La preuve reste sous doublures et ne
revendique ni capture matérielle ni comportement d'Electron réel.

## Journal

### Exploration Codex

- Consignes, ticket, banc complet, hôte/preload, aides et ADR 0005/0018/0025 lus. Témoin de hooks présent.
- `node --test tests/mac-ipc-contract.test.cjs` : **30/30 verts**, code 0 ; sortie dans
  `.harness-state/tickets/T195/mac-ipc-baseline.log`.
- Plan et méthode de preuve enregistrés dans `exploration.md` et `ecarts.md` du dossier d’état.
  Aucun code produit à modifier ; titres et nombre de cas conservés. Les fichiers non suivis initiaux restent hors lot.

### Preuves par les coutures de l’hôte

Le deuxième cas conserve son titre. Il découvre les appels/abonnements en exécutant le vrai preload,
compare les appels à la Map des handlers enregistrés par le vrai hôte et provoque les onze événements
réels : erreur de marque-page sans session, capture, marque-page, explication, surveillance, vérification,
nouvelle session et suppression. Les raccourcis sont les callbacks enregistrés dans le faux Electron ;
`--live-shortcut` active uniquement leur branche d’enregistrement sous cette doublure, sans clavier natif.
Chaque publication du banc conserve aussi sa garde d’abonnement et d’absence de préfixe `auto:`.

Rapprochement exhaustif des assertions initiales (lignes de `9a040e6`) :

| Ancienne assertion | Preuve de remplacement ou scénario conservé |
| --- | --- |
| 95 : présence des marqueurs textuels encadrant la composition | Le vrai hôte démarre ; les commandes et publications des compositions s’exécutent dans le deuxième cas et le cas de coexistence. Les marqueurs ne sont plus nécessaires. |
| 105 : mêmes canaux d’appel et handlers | Même égalité et même message, entre les appels du vrai preload et les handlers réellement enregistrés. |
| 106 : mêmes événements et abonnements | Même égalité et même message, entre les onze canaux réellement publiés par le vrai hôte et les abonnements du vrai preload. |
| 107 : aucun `auto:` | Même assertion sur les handlers et publications observés ; garde étendue aux publications de chaque scénario. |
| 108–109 : canaux surveillance/sessions attendus | Listes et assertions conservées, appliquées aux enregistrements réels. |
| 110 : événements surveillance/sessions/storage/watch attendus | Liste et assertion conservées, appliquées aux publications réelles. |
| 113–114 : absence de `cleanupRawMedia` | Cas conservés « a Mac session is archived instead of purged… » et « a question neither suspends… » : médias/registre conservés après nouvelle session, quit et prochain démarrage ; archive inchangée à la lecture. |
| 113–114 : absence de `prioritizeManual` | Cas de coexistence conservé et enrichi : capture, question et vérification manuelle n’interrompent pas la surveillance ; sa carte arrive pendant la question. |
| 113–114 : absence de `auto-monitor`, `AutoMonitor`, `autoAgent`, `saveAuto` | Absence du module conservée (115), absence de canaux `auto:` aux frontières (107), noms du pont et méthodes retirées toujours vérifiés par le premier cas conservé. Les identifiants internes ne servent plus de preuve. |
| 113–114 : absence des deux graphies `retentionMs: 300000` | Valeurs `[300000, 5, 'until-deleted', null]` conservées dans le cas d’archivage ; contrats de rétention et conservation des médias exercés par les scénarios existants. |
| 115 : module Auto absent | Assertion conservée telle quelle. |
| 116 : deux annulations du vérificateur manuel | Deux effets observés : bouton puis quit ; aucune annulation pendant capture/surveillance/question. La première vérification finit normalement pendant la question. |
| 117 : bouton d’annulation relié au vérificateur | Vrai preload → vrai handler `verify:cancel` → rejet piloté du fournisseur ; état public libéré, question et surveillance toujours actives. |
| 118 : seul l’arrêt explicite arrête la surveillance | Coexistence conservée pendant capture/question/vérification ; la surveillance reste active après la réponse. L’arrêt explicite retourne `enabled: false`. Les fins de session gardent leurs preuves existantes. |
| 119 : canal d’arrêt relié à la surveillance | Vrai preload → vrai handler `surveillance:stop` → état public désactivé dans le deuxième cas ; consigne ensuite absente du chat dans le cas conservé sur l’instruction active. |
| 122–123 : agent de surveillance simulé et distinct du chat/vérificateur | Vrais runtimes/fournisseurs simulés : détection et carte de surveillance progressent pendant une question, alors qu’une vérification manuelle se termine ; son annulation laisse les deux autres rôles actifs. |
| 124 : balayage Codex au démarrage, refus absorbé | Dépendance de balayage contrôlée : un appel sans racine fournie ; fenêtre prête pendant sa promesse en attente ; refus `EACCES` sans échec de l’hôte ; aucun nouvel appel après commandes/quit. Aucun arbre réel balayé. |
| 126 : vision autorisée en configuration simulée | Cas existant « vision follows its setting (true) » conservé : aucun réglage forcé pour ce cas ; second passage audio/vision prêt pendant la question. Son attente de publication est désormais bornée par l’aide commune. |
| 127 : vision autorisée dans le repli de configuration | Assertion de contenu conservée telle quelle, exception du critère 2 : cette branche exige `--live-inspection` et une configuration illisible ; `launch` force `--smoke-test`. |

### Rouges observés et restauration

Aucun fichier produit n’a changé, même temporairement. Les régressions ont été injectées puis retirées
dans les doublures du banc ; commandes et sorties sont conservées dans le dossier d’état.

- `node --test --test-name-pattern='every bridge call' tests/mac-ipc-contract.test.cjs` : handler
  `watch:ask` omis par le faux `ipcMain.handle` → code **1**, rouge sur l’égalité des canaux
  (`red-missing-handler.log`) ; doublure restaurée → **1/1 vert** (`green-handlers.log`).
- Même commande : publication `moments:explain-requested` interceptée dans le faux `webContents.send`
  → code **1**, rouge sur l’égalité événements/abonnements (`red-missing-event.log`) ; restauration
  → **1/1 vert** (`green-events.log`).
- `node --test --test-name-pattern='a question neither suspends' tests/mac-ipc-contract.test.cjs` :
  le faux transport annule indûment la vérification avant `watch:ask` → code **1**, rouge sur la
  vérification manuelle maintenue (`red-manual-preemption.log`) ; restauration → **1/1 vert**
  (`green-coexistence.log`).
- `node --test --test-name-pattern='vision follows its setting \(true\)' tests/mac-ipc-contract.test.cjs` :
  option forcée à `false` dans l’enveloppe du runtime → code **1**, rouge sur l’assertion bornée de
  publication visuelle (`red-vision-option.log`) ; restauration validée par le banc complet ci-dessous.

### Validation ciblée

- En séquentiel : `node --test tests/mac-ipc-contract.test.cjs` → **30/30 verts**, code 0
  (`mac-ipc-final.log`), puis `node --test tests/wait-helpers.test.cjs` → **13/13 verts**, code 0
  (`wait-helpers-final.log`).
- Les 26 déclarations de cas/sous-cas conservent leurs titres ; leurs boucles produisent toujours
  30 cas exécutés. Les valeurs attendues et scénarios préexistants sont conservés (`structure.log`).
- `node scripts/check.mjs --changed` → **vert**, code 0 : règles, format, lint, gel, cliquet et
  **30/30 tests** du fichier modifié (`check-changed.log`).
- `node scripts/check.mjs` → **vert**, code 0 : règles, format, lint, gel, cliquet,
  **1 926/1 926 tests JavaScript sur 127 fichiers**, puis **22/22 tests Python** (`check-full.log`).
- `git diff --check` → code 0. Aucun fichier produit, harnais, plancher ni suppression de lint modifié.
  Verdict `TERMINÉ` dans `.harness-state/tickets/T195/verdict.json` ; relecture et intégration laissées à la boucle.

### Reprise après relecture 1

- Rapport `.harness-state/tickets/T195/relecture-1.md`, ticket/journal, écarts, status et diff relus.
  Nouveau témoin de hooks présent. Les deux constats mineurs sont acceptés, sans nouvel écart.
- Préparation des rouges : observer toutes les fermetures avant suppression du dossier malgré une
  publication invalide ou un quit refusé ; différer l’entrée du vérificateur pour éprouver l’avance virtuelle.
- Constat 1 corrigé : `stage` tente d’abord tous les `quit`, absorbe leurs refus pour poursuivre,
  puis vérifie les publications de chaque hôte ; la suppression du dossier reste dans le `finally`.
  `node --test .harness-state/tickets/T195/stage-cleanup-probe.cjs` exécute cette aide avec deux hôtes
  contrôlés : canal inconnu du premier hôte, puis refus de son quit. **2/2 rouges** avant correction
  (code 1, `correction-1-stage-red.log`) sur l’assertion de fermeture du second hôte ; **2/2 verts**
  après correction (code 0, `correction-1-stage-green.log`). Le dossier est présent à chaque tentative
  de fermeture, supprimé ensuite, et la garde de publication reste bien rouge pour un canal inconnu.
  Cette sonde d’aide reste dans le dossier d’état ; aucun cas du banc n’est ajouté ni retiré.
- Constat 2 corrigé : le fournisseur simulé entre après un `tick()` de l’aide commune, ce qui prouve
  que l’attente ne dépend plus d’un armement synchrone. Le saut fixe de 2500 ms est remplacé par
  `until(t, …verificationState(), …, 500)` jusqu’à `status === 'done'`. La valeur attendue reste
  `contradicted`. `node --test --test-name-pattern='every bridge call' tests/mac-ipc-contract.test.cjs`
  donne **1/1 rouge** avec l’entrée différée et l’ancien saut fixe (code 1, assertion du résultat,
  `correction-1-clock-red.log`), puis **1/1 vert** avec l’attente d’état (code 0, `correction-1-clock-green.log`).
- Pour lever la limite de traçabilité signalée en fin de rapport, la préemption manuelle a été
  réinjectée temporairement dans le faux transport sur le code corrigé :
  `node --test --test-name-pattern='a question neither suspends' tests/mac-ipc-contract.test.cjs`
  → code **1**, même assertion publique de coexistence rouge, cette fois aux lignes 540/589
  (`correction-1-manual-preemption-red.log`). La doublure a été restaurée immédiatement.
- Contrôles de correction en séquentiel : `node --test tests/mac-ipc-contract.test.cjs` → **30/30 verts**,
  code 0 (`correction-1-mac-ipc.log`), puis `node --test tests/wait-helpers.test.cjs` → **13/13 verts**,
  code 0 (`correction-1-wait-helpers.log`). Les 26 déclarations conservent leurs titres
  (`correction-1-structure.log`). `node scripts/check.mjs --changed` → **vert**, code 0
  (`correction-1-check-changed.log`).
- `node scripts/check.mjs` après les deux corrections → **vert**, code 0 : règles, format, lint,
  gel, cliquet, **1 926/1 926 tests JavaScript sur 127 fichiers**, puis **22/22 tests Python**
  (`correction-1-check-full.log`). `git diff --check` → code 0.
- Les deux constats sont corrigés, sans réserve ni contestation. Nouveau verdict `TERMINÉ` dans le
  dossier d’état ; aucun commit ni push, aucun fichier produit ou harnais modifié.
