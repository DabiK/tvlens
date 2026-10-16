---
id: T175
titre: Split the event and run handling of the Codex session client
statut: termine
bloque_par: T046
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le client de session Codex délègue les événements à des fonctions nommées par type et l'exécution
d'un tour à un module distinct. Leur interface permet de tester chaque chemin sans lancer Codex.
Le client garde sa façade, la possession de sa connexion et ses garanties de génération ; son
protocole, ses résultats, ses diagnostics et ses métriques restent identiques.

## Sources

- `docs/audit-points-chauds.md`, section A « Carte des points chauds », client de session Codex.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Code à `e92c6a6`, `adapters/codex-session-client.cjs` :
  - `connect`, `adapters/codex-session-client.cjs:257`, jusqu'à 365 : 109 lignes physiques ;
    les callbacks de la connexion filtrent la génération à `adapters/codex-session-client.cjs:316` ;
  - `event`, `adapters/codex-session-client.cjs:555`, jusqu'à 701 : 147 lignes physiques ;
  - `run`, `adapters/codex-session-client.cjs:702`, jusqu'à 819 : 118 lignes physiques.
    Ces tailles incluent blancs et commentaires et ne sont pas une mesure de complexité.
- Appelants lus : `adapters/codex-session-agent.cjs`, `adapters/codex-analysis-agent.cjs`,
  `adapters/codex-surveillance-agent.cjs`, `adapters/codex-verifier.cjs`,
  `runtime/conversation-runtime.cjs`, `scripts/probe-confinement.cjs`.
  Le module exporte `CodexSessionClient`, `streamedAnswer`, `sourceKey`.
- Tests protecteurs : `tests/chat-trace.test.cjs` appelle aussi `event` directement ;
  `tests/session-optimization.test.cjs`, `tests/codex-connect-race.test.cjs`,
  `tests/codex-thread-rotation.test.cjs`, `tests/codex-confinement.test.cjs`,
  `tests/codex-abandoned-turn.test.cjs`, `tests/review-regressions.test.cjs`,
  `tests/architecture-f05.test.cjs`, `tests/architecture-f08.test.cjs`,
  `tests/codex-stream-decoding.test.cjs` et `tests/refactor-boundaries.test.cjs`.
- ADR 0005 dans `docs/adr/` : transport et arbre privé restent une génération unique, fermée avant
  la suivante. T046 corrige auparavant la frontière entre JSON illisible et exception du gestionnaire.

## Périmètre

- Créer `adapters/codex-session-events.cjs` : fonctions nommées pour fermeture de connexion,
  notifications de thread, début/fin de tour, erreur, début/fin d'item et delta de message agent.
  Garder un répartiteur qui conserve l'ordre des filtres thread/tour, drain et garde des items.
  Les requêtes serveur/outils restent dans `tool` et `onRequest`, distinctes des notifications.
- Créer `adapters/codex-session-run.cjs` pour l'exécution du tour, en étapes nommées : préparation,
  installation de l'activité, démarrage, interruption/watchdog et nettoyage. Les dépendances et
  l'état actif sont remis explicitement ; aucun module ne crée un second propriétaire de la connexion,
  du tour ou de la promesse de fin. Les minuteries des tests sont maîtrisées.
- Dans le client, garder `event` et `run` comme délégations compatibles. Le découpage de `connect`
  est reporté hors de ce ticket : son corps et sa barrière de génération restent en place.
  Le câblage `onFault` livré par T046 reste effectif après cette extraction.
- Ajouter `tests/codex-session-events.test.cjs`, `tests/codex-session-run.test.cjs` et un ADR court
  décrivant ces responsabilités et les invariants de génération conservés.
- Ne modifier ni le protocole JSON-RPC, ni les capacités, le confinement ou les approbations, ni
  les modèles, les délais ou le choix des outils. Garder exports, méthodes et champs observés par
  les tests et appelants. Aucun changement d'assertion des tests existants, aucune installation.

## Critères d'acceptation

1. Les tests appellent les fonctions d'événement avec des états et effets enregistrés, sans processus
   Codex. Chaque type traité a un cas : `connection/closed`, `thread/started`,
   `thread/status/changed`, `turn/started`, `turn/completed`, `error`, `item/started`,
   `item/completed`, `item/agentMessage/delta`. Un événement inconnu garde son absence d'effet actuelle.
2. Un ancien thread ou tour ne modifie pas le tour actif ; une connexion remplacée ne touche pas
   son successeur. Un thread étranger et un item interdit déclenchent les refus actuels. Le drain
   continue d'absorber la fin d'un tour abandonné avant qu'un nouveau tour puisse la recevoir.
3. Les deltas et messages terminaux produisent les mêmes progressions et réponses. Les pages ouvertes
   et recherches alimentent le même audit ; la fin de tour distingue succès, interruption, échec
   générique et authentification 401. Une fermeture de connexion invalide `ready` et rejette le tour.
4. Les tests du module d'exécution vérifient signal déjà annulé, annulation pendant préparation et
   pendant le tour, refus de `turn/start`, watchdog et nettoyage. Une lecture quota lente, refusée
   ou levant synchroniquement reste informative. Les métriques froid/chaud et les durées restent
   présentes et cohérentes, sans timer ou écouteur propre au tour laissé après sa fin.
5. Les méthodes `event`, `run`, leurs fonctions imbriquées et toutes les fonctions des deux modules
   extraits font au plus **80 lignes physiques par fonction**, blancs et commentaires compris.
   La commande de mesure ci-dessous affiche chemin, nom, plage et taille de chaque fonction ; elle
   sort en 1 si une taille dépasse 80. Conserver son relevé avant/après au journal : avant création,
   ajouter `--before` après le `-` de la commande pour mesurer seulement le client ; après création,
   l'exécuter sans ce drapeau, en exigeant la présence des deux modules extraits.
   `connect`, reporté hors ticket, n'entre pas dans cette mesure.
   Un seul propriétaire garde `rpc`, le thread, le tour actif et la fermeture de génération.
6. Les tests de T046 et tous les fichiers protecteurs passent en séquentiel sans modification
   d'assertion ; le diff sous `tests/` ne contient que les deux nouveaux fichiers.
   `node scripts/check.mjs` est vert à l'implémentation, harnais et plancher inchangés.

Commande de mesure, avec le parseur de Prettier déjà installé, sans exécuter les modules analysés :

```sh
node --input-type=module - <<'JS'
import fs from 'node:fs';
import prettier from 'prettier';
const client = 'adapters/codex-session-client.cjs';
const files = process.argv.includes('--before') ? [client] :
  [client, 'adapters/codex-session-events.cjs', 'adapters/codex-session-run.cjs'];
const functions = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
  'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod']);
let oversized = false;
for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`Module attendu absent : ${file}`);
  const { ast } = await prettier.__debug.parse(fs.readFileSync(file, 'utf8'), { parser: 'babel' });
  function visit(node, selected = file !== client) {
    if (!node || typeof node !== 'object') return;
    const isFunction = functions.has(node.type);
    const name = node.key?.name || node.id?.name || node.type;
    selected ||= isFunction && ['event', 'run'].includes(name);
    if (isFunction && selected) {
      const { start, end } = node.loc;
      const lines = end.line - start.line + 1;
      console.log(file, name, `${start.line}-${end.line}`, lines);
      oversized ||= lines > 80;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => visit(child, selected));
      else if (value && typeof value === 'object') visit(value, selected);
    }
  }
  visit(ast);
}
process.exitCode = oversized ? 1 : 0;
JS
```

## Test d'acceptation attendu

Les deux nouveaux fichiers testent les interfaces extraites avec transport enregistré, horloge et
minuteries conduites, outils différés et collecteur de progression. Les tests existants de courses,
drain, rotation, confinement, traçage et décodage continuent de traverser le vrai client.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T046 attend T150 et fournit la propagation des exceptions du gestionnaire : ne pas la refaire ni la
perdre dans le répartiteur. À `e92c6a6`, cette correction et son test dédié ne sont pas encore livrés.
Les événements énumérés viennent du code actuel et de ses tests ; ce ticket n'étend pas le protocole
à des types supposés d'après une documentation externe.

## Journal

- Exploration : T046 présent ; connect et sa barrière de génération conservés. Interfaces extraites avec état unique, effets explicites et temps injecté. Détail dans `.harness-state/tickets/T175/exploration.md` ; aucun écart prévu.

- Mesure initiale : `node .harness-state/tickets/T175/measure.mjs --before` (script exact du ticket) : sortie 1, `event` 147 et `run` 122 lignes physiques. Relevé :

```text
adapters/codex-session-client.cjs event 564-710 147
adapters/codex-session-client.cjs ArrowFunctionExpression 658-677 20
adapters/codex-session-client.cjs run 711-832 122
adapters/codex-session-client.cjs ArrowFunctionExpression 741-741 1
adapters/codex-session-client.cjs ArrowFunctionExpression 744-747 4
adapters/codex-session-client.cjs ArrowFunctionExpression 748-748 1
adapters/codex-session-client.cjs ArrowFunctionExpression 763-774 12
adapters/codex-session-client.cjs ArrowFunctionExpression 773-773 1
adapters/codex-session-client.cjs ArrowFunctionExpression 779-790 12
adapters/codex-session-client.cjs ArrowFunctionExpression 794-808 15
adapters/codex-session-client.cjs ArrowFunctionExpression 795-806 12
adapters/codex-session-client.cjs ArrowFunctionExpression 796-802 7
```

- Tests d’abord : `node --test --test-concurrency=1 tests/codex-session-events.test.cjs tests/codex-session-run.test.cjs` : 2 rouges sur assertion, puis 2 verts ; 26 chemins supplémentaires rouges sur assertion, puis 28/28 verts après extraction. Sorties `red-initial.log`, `green-initial.log`, `red-paths.log`, `green-paths.log` et `green-refined.log` dans le dossier d’état.
- Extraction : notifications nommées, répartiteur ordonné, exécution par étapes et temps injecté. `connect` comparé à HEAD : identique, y compris `onFault`. Deux cas supplémentaires couvrent la connexion remplacée et un outil différé annulé. ADR 0022 ajouté.
- Tests protecteurs : `node --test --test-concurrency=1 tests/codex-handler-failure.test.cjs tests/chat-trace.test.cjs tests/session-optimization.test.cjs tests/codex-connect-race.test.cjs tests/codex-thread-rotation.test.cjs tests/codex-confinement.test.cjs tests/codex-abandoned-turn.test.cjs tests/review-regressions.test.cjs tests/architecture-f05.test.cjs tests/architecture-f08.test.cjs tests/codex-stream-decoding.test.cjs tests/refactor-boundaries.test.cjs` : 125/125 verts ; assertions existantes inchangées. Sortie `protectors.log`.
- Lint : premier passage rouge (complexités 23 et 19 dans deux nouvelles fonctions), fonctions fractionnées puis `node_modules/.bin/eslint --prune-suppressions adapters/codex-session-client.cjs adapters/codex-session-events.cjs adapters/codex-session-run.cjs tests/codex-session-events.test.cjs tests/codex-session-run.test.cjs` vert. Six suppressions devenues inutiles retirées, aucune ajoutée.
- `node scripts/check.mjs --changed` : vert, 30/30 tests ; règles, format, lint, gel et cliquet verts. Sortie `check-changed.log`. Harnais et plancher inchangés ; sous `tests/`, seuls les deux nouveaux fichiers sont ajoutés.
- Mesure finale : `node --input-type=module - < .harness-state/tickets/T175/measure.mjs` : sortie 0, modules exigés présents, maximum 31 lignes physiques ; `event` 14 et `run` 10. Relevé :

```text
adapters/codex-session-client.cjs event 560-573 14
adapters/codex-session-client.cjs ArrowFunctionExpression 565-565 1
adapters/codex-session-client.cjs ArrowFunctionExpression 566-566 1
adapters/codex-session-client.cjs ArrowFunctionExpression 567-567 1
adapters/codex-session-client.cjs run 574-583 10
adapters/codex-session-client.cjs ArrowFunctionExpression 576-576 1
adapters/codex-session-client.cjs ArrowFunctionExpression 577-577 1
adapters/codex-session-client.cjs ArrowFunctionExpression 578-578 1
adapters/codex-session-events.cjs sourceKey 14-23 10
adapters/codex-session-events.cjs streamedAnswer 25-33 9
adapters/codex-session-events.cjs turnDiagnostic 35-43 9
adapters/codex-session-events.cjs traceTurn 45-53 9
adapters/codex-session-events.cjs traceEvent 55-68 14
adapters/codex-session-events.cjs connectionClosed 70-76 7
adapters/codex-session-events.cjs observeThread 79-91 13
adapters/codex-session-events.cjs threadStarted 93-95 3
adapters/codex-session-events.cjs threadStatusChanged 97-99 3
adapters/codex-session-events.cjs endDrain 101-110 10
adapters/codex-session-events.cjs turnStarted 112-114 3
adapters/codex-session-events.cjs turnError 116-119 4
adapters/codex-session-events.cjs failureMessage 121-130 10
adapters/codex-session-events.cjs turnCompleted 132-146 15
adapters/codex-session-events.cjs itemStarted 148-162 15
adapters/codex-session-events.cjs agentMessageDelta 164-172 9
adapters/codex-session-events.cjs auditWebSearch 174-196 23
adapters/codex-session-events.cjs ArrowFunctionExpression 178-195 18
adapters/codex-session-events.cjs itemCompleted 198-207 10
adapters/codex-session-events.cjs dispatchActive 217-225 9
adapters/codex-session-events.cjs dispatchEvent 228-237 10
adapters/codex-session-run.cjs prepareTurn 7-20 14
adapters/codex-session-run.cjs finishPreparation 22-31 10
adapters/codex-session-run.cjs ArrowFunctionExpression 27-27 1
adapters/codex-session-run.cjs installActivity 33-55 23
adapters/codex-session-run.cjs ArrowFunctionExpression 35-38 4
adapters/codex-session-run.cjs ArrowFunctionExpression 39-39 1
adapters/codex-session-run.cjs installInterruption 57-75 19
adapters/codex-session-run.cjs ArrowFunctionExpression 60-72 13
adapters/codex-session-run.cjs ArrowFunctionExpression 70-70 1
adapters/codex-session-run.cjs startTurn 77-96 20
adapters/codex-session-run.cjs ArrowFunctionExpression 79-95 17
adapters/codex-session-run.cjs acknowledgeStart 98-102 5
adapters/codex-session-run.cjs watchInterruption 104-122 19
adapters/codex-session-run.cjs ArrowFunctionExpression 105-121 17
adapters/codex-session-run.cjs ArrowFunctionExpression 106-119 14
adapters/codex-session-run.cjs ArrowFunctionExpression 107-116 10
adapters/codex-session-run.cjs turnResult 124-135 12
adapters/codex-session-run.cjs cleanupTurn 137-142 6
adapters/codex-session-run.cjs runTurn 144-174 31
```

- Contrôle final : `node scripts/check.mjs` : vert. Règles, format, lint, gel et cliquet verts ; 1 387/1 387 tests JS sur 111 fichiers ; 33 tests Python, OK avec 1 ignoré. Sortie complète dans `.harness-state/tickets/T175/check-full.log`.
- Verdict : `TERMINÉ`, enregistré dans `.harness-state/tickets/T175/verdict.json`. Relecture et intégration laissées à la boucle ; aucun commit ni push.

- Reprise après `relecture-1.md` : 0 bloquant, 3 mineurs acceptés ; assertions de progression à renforcer avant les corrections de commentaires et de nommage. Le constat 4 (minuterie globale de drain) est conservé en réserve hors périmètre. Aucun écart ni contestation.

- Correction du constat 1, tests d’abord : les séquences complètes de progression froid/chaud/annulation sont désormais comparées, ainsi que les objets entiers d’`itemStarted`. Le comportement étant déjà correct, quatre mutations temporaires en mémoire (message froid, message chaud, annulation supprimée, raisonnement ajouté) vérifient la force des assertions, sans modifier les fichiers de production. Pour chaque mode : `TVLENS_PROGRESS_MUTATION=<mode> node --require /Users/Dabi/Documents/ISN/tvlens/.harness-state/tickets/T175/progress-mutation.cjs --test --test-name-pattern=<motif> <fichier>` ; commandes exactes et échecs sur assertion conservés dans `red-progress-cold.log`, `red-progress-warm.log`, `red-progress-cancel.log`, `red-progress-reasoning.log`. Une première commande avait un chemin de préchargement incorrect (`progress-preload-path-error.log`), corrigé avant ces preuves ; elle ne compte pas comme rouge comportemental.
- Sans mutation : `node --test --test-concurrency=1 tests/codex-session-events.test.cjs tests/codex-session-run.test.cjs` : 30/30 verts (`green-progress-correction.log`).
- Constats 2 et 3 corrigés : explications de la validation avant connexion, du démarrage froid, de la confidentialité des progressions, du diagnostic expurgé et des champs `opened`/`grouped` et de la fin du drain rétablies ; paramètre de notification renommé `method`. Aucun changement de logique.
- `node scripts/check.mjs --changed` : vert après corrections, 30/30 tests (`check-changed-correction-1.log`). `connect` et `onFault` comparés à HEAD : identiques ; aucun test déjà suivi, harnais ou plancher modifié (`scope-correction-1.log`).
- `node --input-type=module - < .harness-state/tickets/T175/measure.mjs` : sortie 0 ; maximum 31 lignes physiques, `event` 14 et `run` 10. Relevé actualisé après commentaires :

```text
adapters/codex-session-client.cjs event 560-573 14
adapters/codex-session-client.cjs ArrowFunctionExpression 565-565 1
adapters/codex-session-client.cjs ArrowFunctionExpression 566-566 1
adapters/codex-session-client.cjs ArrowFunctionExpression 567-567 1
adapters/codex-session-client.cjs run 574-583 10
adapters/codex-session-client.cjs ArrowFunctionExpression 576-576 1
adapters/codex-session-client.cjs ArrowFunctionExpression 577-577 1
adapters/codex-session-client.cjs ArrowFunctionExpression 578-578 1
adapters/codex-session-events.cjs sourceKey 14-23 10
adapters/codex-session-events.cjs streamedAnswer 25-33 9
adapters/codex-session-events.cjs turnDiagnostic 35-43 9
adapters/codex-session-events.cjs traceTurn 45-53 9
adapters/codex-session-events.cjs traceEvent 55-68 14
adapters/codex-session-events.cjs connectionClosed 70-76 7
adapters/codex-session-events.cjs observeThread 79-91 13
adapters/codex-session-events.cjs threadStarted 93-95 3
adapters/codex-session-events.cjs threadStatusChanged 97-99 3
adapters/codex-session-events.cjs endDrain 101-111 11
adapters/codex-session-events.cjs turnStarted 113-115 3
adapters/codex-session-events.cjs turnError 117-120 4
adapters/codex-session-events.cjs failureMessage 122-131 10
adapters/codex-session-events.cjs turnCompleted 133-148 16
adapters/codex-session-events.cjs itemStarted 151-165 15
adapters/codex-session-events.cjs agentMessageDelta 167-175 9
adapters/codex-session-events.cjs auditWebSearch 177-201 25
adapters/codex-session-events.cjs ArrowFunctionExpression 181-200 20
adapters/codex-session-events.cjs itemCompleted 203-212 10
adapters/codex-session-events.cjs dispatchActive 222-230 9
adapters/codex-session-events.cjs dispatchEvent 233-242 10
adapters/codex-session-run.cjs prepareTurn 7-22 16
adapters/codex-session-run.cjs finishPreparation 24-33 10
adapters/codex-session-run.cjs ArrowFunctionExpression 29-29 1
adapters/codex-session-run.cjs installActivity 35-57 23
adapters/codex-session-run.cjs ArrowFunctionExpression 37-40 4
adapters/codex-session-run.cjs ArrowFunctionExpression 41-41 1
adapters/codex-session-run.cjs installInterruption 59-77 19
adapters/codex-session-run.cjs ArrowFunctionExpression 62-74 13
adapters/codex-session-run.cjs ArrowFunctionExpression 72-72 1
adapters/codex-session-run.cjs startTurn 79-98 20
adapters/codex-session-run.cjs ArrowFunctionExpression 81-97 17
adapters/codex-session-run.cjs acknowledgeStart 100-104 5
adapters/codex-session-run.cjs watchInterruption 106-124 19
adapters/codex-session-run.cjs ArrowFunctionExpression 107-123 17
adapters/codex-session-run.cjs ArrowFunctionExpression 108-121 14
adapters/codex-session-run.cjs ArrowFunctionExpression 109-118 10
adapters/codex-session-run.cjs turnResult 126-137 12
adapters/codex-session-run.cjs cleanupTurn 139-144 6
adapters/codex-session-run.cjs runTurn 146-176 31
```

- Contrôle complet après corrections : `node scripts/check.mjs` : vert ; règles, format, lint, gel et cliquet verts ; 1 387/1 387 tests JS sur 111 fichiers ; 33 tests Python OK, dont 1 ignoré (`check-full-correction-1.log`).
- Nouveau verdict : `TERMINÉ`. Les trois constats mineurs de la relecture 1 sont corrigés, sans contestation. Réserve conservée dans `reste` : la minuterie du drain de `refuse` utilise les fonctions globales, hors du découpage de ce ticket. Relecture et intégration laissées à la boucle ; aucun commit ni push.

### Réserves à la clôture

- Hors périmètre, relecture 1 constat 4 : refuse utilise encore setTimeout/clearTimeout globaux pour la minuterie de drain, alors que le module de tour reçoit ses minuteries par injection. Harmonisation à traiter séparément.
- .harness-state/tickets/T175/relecture-2.md : `adapters/codex-session-client.cjs:486` — hors périmètre (réserve maintenue)

  - **Problème :** `refuse` arme toujours la minuterie de drain avec les `setTimeout` et `clearTimeout` globaux (`:481`, `:486`). À l'inverse, `runTurn` reçoit ses minuteries par `effects.setTimer` et `effects.clearTimer`. Le client mélange donc encore les deux façons de faire.
  - **Attendu :** injecter les minuteries du drain dans un ticket séparé. Ce ticket ne découpe que `event` et `run`, et la correction n'a pas touché ce code.
  - **Suite :** réserve à reporter. La session la note déjà dans `ecarts.md`.
