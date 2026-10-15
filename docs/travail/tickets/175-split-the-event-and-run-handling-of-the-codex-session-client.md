---
id: T175
titre: Split the event and run handling of the Codex session client
statut: a-faire
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
