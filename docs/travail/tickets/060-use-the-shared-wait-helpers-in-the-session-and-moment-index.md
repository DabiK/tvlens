---
id: T060
titre: Use the shared wait helpers in the protocol and Codex tests
statut: termine
bloque_par: T199
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Premier lot : les protocoles et bancs Codex prennent leurs aides génériques dans le module partagé.
Les attentes jusque-là bornées en tours réels deviennent des échéances nommées ; les scénarios et
leurs résultats attendus sont conservés. T061 migre le lot suivant, puis T062 contracte l'inventaire.

## Sources

- `docs/audit-architecture.md`, rapport A, B8 et D14 ; rapport B, B7.
  Décision du propriétaire, le 16/10 : trois lots successifs ; retirer T145 et T055, déjà terminé.
- Les aides existent déjà dans `tests/helpers/wait.cjs:11` à `:82` : pause réelle capturée avant
simulation, tick par setImmediate, turns avec nombre explicite, deferred avec resolve/reject,
until nommé et séquentiel borné par horloge monotone (5 s par défaut), bounded qui relaie les
rejets et retourne une sentinelle à l'échéance, failure pour un rejet attendu.

## Périmètre

Chaque nom ci-dessous désigne le fichier `tests/<nom>.test.cjs`, seul périmètre modifiable du lot.
La table donne les définitions actuelles et chaque changement de sémantique :

| Fichier et repères vérifiés | Migration et contrat conservé ou changé |
| --- | --- |
| `tests/architecture-f04.test.cjs:13` | settle de quatre tours devient turns(4). |
| `tests/architecture-f05.test.cjs:31` à `:40`, `:568` | pause/tick/deferred/bounded/failure partagés ; settle devient turns(10), ou le nombre explicite de l'appel. until de 400 pas de 5 ms devient une échéance 5 s nommée ; l'appel à 300 pas garde une borne au moins aussi longue. |
| `tests/architecture-f06.test.cjs:26` à `:38` | pause/tick/deferred/bounded/failure partagés ; until de 600 pas de 5 ms devient une échéance 5 s nommée. eventually reste booléen. |
| `tests/architecture-f07.test.cjs:23` à `:27` | pause/tick/deferred partagés ; until de 600 pas de 5 ms devient une échéance 5 s nommée, séquentielle et capable d'attendre un contrôle asynchrone. |
| `tests/architecture-f08.test.cjs:16` à `:22` | tick/deferred/failure partagés ; settle devient turns(8), ou le nombre explicite ; until de 600 pas de 5 ms devient une échéance 5 s nommée. |
| `tests/architecture-f10.test.cjs:18` à `:21` | tick/deferred partagés ; until de 600 pas de 5 ms devient une échéance 5 s nommée. |
| `tests/codex-confinement.test.cjs:82`, `:137`, `:138`, `:760` | settle devient turns(10), ou le nombre explicite ; pause partagée ; until de 500 pas de 10 ms (5 s nominales) devient timeoutMs: 10000, allongement explicite prévu par la migration, avec attente nommée. bounded local garde son traitement historique distinct du rejet. |
| `tests/codex-connect-race.test.cjs:8` | tick partagé, même tour d'événement. |
| `tests/codex-handler-failure.test.cjs:9` | deferred partagé ; resolve reste identique, reject devient disponible sans être requis. |
| `tests/codex-thread-rotation.test.cjs:10` et `:11` | tick/deferred partagés, avec résolution et rejet inchangés. |

- Garder la boucle d'horloge simulée de `tests/architecture-f05.test.cjs:138` (50 ms, 40 pas,
  assertion finale), distincte d'un until réel. Aucun export advanceUntil n'existe.
- Garder `eventually` d'architecture-f06 (retour booléen) et son attente métier `f.settled`,
  ainsi que celle de serverHost dans architecture-f07 et la boucle watch.running d'architecture-f10.
  Seules leurs primitives équivalentes sont partagées.
- La conversion du confinement en échéance réelle de 10 s reprend la cible de la fiche T062
  relue : elle allonge explicitement sa borne nominale de 5 s, et se consigne comme telle au journal.
- Les pauses réelles passent par le timer capturé de wait.cjs, y compris celles implémentées par
  un intervalle à usage unique. Les bornes de sécurité de bounded gardent leurs valeurs.
- Ne modifier ni produit, ni harnais, ni doubles App Server, ni `tests/helpers/wait.cjs` ou
  `tests/helpers/clock.cjs`. Aucun titre, résultat attendu ou cas de test ne disparaît.
- Les boucles métier et les flush de microtâches gardent leur sens. Aucun socket réel ne reçoit
  une horloge globale simulée. Une sentinelle de bounded n'est jamais assimilée à un succès.

## Critères d'acceptation

1. Consigner avant/après la sortie de cette commande exacte, sur les dix fichiers du lot,
   hors ticket-loop, agent-guards et helpers/codex-session :

```sh
rg -n --glob '*.cjs' \
  --glob '!tests/ticket-loop.test.cjs' \
  --glob '!tests/agent-guards.test.cjs' \
  --glob '!tests/helpers/codex-session.cjs' \
  -e '^\s*(async )?function (tick|deferred|turns|until|settle|settled|pause|bounded|failure|flush|eventually)\b' \
  -e '^\s*(const|let) (tick|deferred|turns|until|settle|settled|pause|bounded|failure|flush|eventually)\s*=\s*(async\s+)?(\([^)\n]*\)|[A-Za-z_$][\w$]*)\s*=>' \
  tests/{architecture-f04,architecture-f05,architecture-f06,architecture-f07,architecture-f08,architecture-f10,codex-confinement,codex-connect-race,codex-handler-failure,codex-thread-rotation}.test.cjs
```

   Après migration, elle ne rend que `eventually` d'architecture-f06 et `bounded` de codex-confinement,
   exceptions sémantiques nommées ci-dessus. Les variables de fixtures homonymes ne sont pas des aides.
2. Tous les until migrés ont un libellé, une échéance réelle et des contrôles séquentiels ; le délai
   explicite de confinement vaut 10 s. Aucun compte explicite de turns ne change ; les défauts
   4/10/8/10 de la table deviennent des arguments aux appels concernés.
3. Comparer le diff des assertions, titres et cas par fichier au début de session : valeurs et
   nombre de cas sont identiques. Le journal décrit imports, appels et changements de borne.
4. À l'implémentation, exécuter les dix fichiers un par un, puis wait-helpers et
   `node scripts/check.mjs`. La boucle simulée garde ses pas et sa preuve finale ; bounded
   continue de distinguer résultat, rejet et échéance selon sa variante. Aucun test nouveau de forme.

## Test d'acceptation attendu

Les scénarios existants des dix fichiers et `tests/wait-helpers.test.cjs` prouvent les résultats.
L'inventaire ci-dessus prouve la migration des copies, sans remplacer ces scénarios.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les repères sont ceux du worktree à `8340014`, à relire après les dépendances. Une différence de
contrat non prévue se consigne avant migration ; elle ne se masque pas en allongeant un délai.
Au premier échec, conserver la sortie et diagnostiquer ; aucune relance jusqu'au vert ni ancienne
sonde slow-fs non livrée n'est nécessaire.

## Journal

- Exploration : dix fichiers, aides partagées et ADR concernés lus. État initial conservé dans
  `.harness-state/tickets/T060/before/` ; diff initial, exploration et écarts prévus enregistrés.
  La commande exacte du critère 1 est conservée dans `inventory-command.sh` ; exécutée avec
  `zsh .harness-state/tickets/T060/inventory-command.sh`, code 0, sortie dans `inventory-before.log`.
  Les copies attendues sont présentes. Les deux exceptions sémantiques et les boucles métier
  seront conservées. Aucun nouveau cas de forme ; pas de rouge artificiel pour cette migration
  des scénarios existants (justification préalable dans `ecarts.md`).
- Avant migration : `python3 .harness-state/tickets/T060/run-tests.py before` exécute
  `node --test tests/<nom>.test.cjs` pour chaque fichier du périmètre, un par un :
  8/15/17/26/19/10/17/2/19/14 cas, tous verts (147 au total). Chaque commande et sa sortie
  sont conservées dans `before-<nom>.log`, sans échec ni relance.
- Migration : imports depuis `./helpers/wait.cjs` avant toute simulation des minuteries.
  `settle()` devient `turns(4)` dans architecture-f04, `turns(10)` dans architecture-f05
  et codex-confinement, `turns(8)` dans architecture-f08. Aucun compte explicite n'a changé.
  Les `until` nommés prennent désormais l'échéance réelle partagée de 5 s, avec contrôles
  séquentiels et asynchrones ; l'ancien appel à 300 pas de 5 ms reçoit aussi ces 5 s.
  Dans codex-confinement, les cinq appels portent explicitement `{ timeoutMs: 10000 }` :
  allongement prévu de l'ancienne borne nominale de 5 s à 10 s.
  Les pauses, y compris celles auparavant faites par intervalle à usage unique, utilisent
  le timer réel capturé de l'aide partagée. Le handshake de codex-thread-rotation conserve
  ses 25 ms et sa réponse vide avec `pause(25).then(() => ({}))`.
  Les bornes et sentinelles de `bounded` sont conservées ; sa variante locale du confinement
  garde son traitement distinct du rejet. `eventually`, les attentes métier et la boucle
  simulée de 40 pas de 50 ms avec assertion finale sont inchangés.
- Après migration : `python3 .harness-state/tickets/T060/run-tests.py after` exécute les dix
  mêmes commandes une par une, puis `node --test tests/wait-helpers.test.cjs` : 147/147
  et 13/13 verts, aucun cas annulé ou ignoré. Sorties dans `after-<nom>.log`.
  `zsh .harness-state/tickets/T060/inventory-command.sh` : code 0, sortie conservée dans
  `inventory-after.log`, uniquement `eventually` d'architecture-f06 et `bounded` du confinement.
- Comparaison avec les copies du début de session :
  `node .harness-state/tickets/T060/compare.cjs` : code 0, sortie dans `comparison.log`.
  Les 825 assertions des scénarios, les titres et déclarations de cas, les prédicats et
  libellés des attentes, les comptes de tours, les doubles App Server et les boucles
  spécifiques sont identiques. Les aides supprimées sont exclues du comptage des assertions.
  `git diff --check` : code 0.
- `node scripts/check.mjs --changed` : code 0, règles, format, lint, gel du lint, cliquet
  et 147 tests sur les dix fichiers verts ; sortie dans `check-changed.log`.
- `node scripts/check.mjs` : code 0, règles, format, lint, gel du lint et cliquet verts,
  1 652/1 652 tests JavaScript sur 120 fichiers et 22 tests Python verts ; sortie dans
  `check-full.log`. Aucun contrôle non lancé. Verdict `TERMINÉ` écrit dans le dossier d'état ;
  la boucle garde la responsabilité de la relecture et de l'intégration, sans commit ni push ici.
- Reprise après `relecture-1.md` : constat mineur accepté, cinq répétitions du délai à nommer
  et motif de l'allongement à préciser. Exploration et écarts complétés avant correction.
  Comparateur existant adapté d'abord pour vérifier une constante commune de 10 s :
  `node .harness-state/tickets/T060/compare.cjs`, code 1 attendu sur l'assertion
  `confinement waits use named options` (`ObjectExpression` au lieu d'`Identifier`).
  Sortie conservée dans `correction-1/comparison-red.log`. Aucun cas ajouté dans la suite.
- Correction : les cinq appels utilisent `PROCESS_WAIT`, défini une seule fois avec
  `{ timeoutMs: 10000 }`. Le commentaire explique l'observation de processus réels,
  l'allongement nominal de 5 s à 10 s et l'échec de l'attente à l'expiration.
  `node .harness-state/tickets/T060/compare.cjs` : vert, assertions et scénarios conservés,
  cinq références à la constante de 10 s vérifiées par AST (`correction-1/comparison-green.log`).
  `zsh .harness-state/tickets/T060/inventory-command.sh` : uniquement les deux exceptions
  autorisées (`correction-1/inventory-after.log`). `git diff --check` : code 0.
  `node --test tests/codex-confinement.test.cjs` : code 0, 17/17 verts, aucun cas annulé ou
  ignoré (`correction-1/confinement.log`).
- Validation de la correction : `node scripts/check.mjs --changed`, code 0, tous les
  contrôles verts et 147/147 tests JS (`correction-1/check-changed.log`), puis
  `node scripts/check.mjs`, code 0, tous les contrôles verts, 1 652/1 652 tests JS sur
  120 fichiers et 22 tests Python (`correction-1/check-full.log`). Exécutions séquentielles,
  aucun contrôle non lancé. Nouveau verdict `TERMINÉ`, constat 1 corrigé, aucune réserve.
- Reprise après `relecture-2.md` : nouveau constat mineur accepté, limité au commentaire
  de `PROCESS_WAIT`. Exploration et écarts complétés avant correction ; aucun nouveau cas
  de forme ni rouge artificiel pour cette reformulation sans changement exécutable.
  `node .harness-state/tickets/T060/compare.cjs` avant correction : code 0,
  sortie dans `correction-2/comparison-before.log`.
- Correction du commentaire : raison et comportement actuels conservés (processus réels,
  borne de 10 s au-delà du défaut des aides et échec du test à l'expiration), sans référence
  à un chantier ni à l'ancienne borne. L'historique de l'allongement reste au journal.
  Comparaison de l'AST entier avant/après, positions exclues : identique
  (`correction-2/ast-comparison.log`). `compare.cjs` est inchangé.
  `node .harness-state/tickets/T060/compare.cjs` après correction : code 0,
  `zsh .harness-state/tickets/T060/inventory-command.sh` : code 0, les deux exceptions
  autorisées uniquement ; sorties dans `correction-2/comparison-after.log` et
  `correction-2/inventory-after.log`. `git diff --check` : code 0.
  `node scripts/check.mjs --changed` : code 0, tous les contrôles verts et 147/147 tests JS
  (`correction-2/check-changed.log`).
- Validation finale : `node scripts/check.mjs`, code 0, règles, format, lint, gel du lint
  et cliquet verts, 1 652/1 652 tests JS sur 120 fichiers et 22 tests Python verts
  (`correction-2/check-full.log`). Aucun contrôle non lancé. Nouveau verdict `TERMINÉ`,
  constat 1 de la relecture 2 corrigé, aucune réserve ; relecture et intégration laissées à la boucle.

### Réserves à la clôture

- .harness-state/tickets/T060/relecture-3.md : **Écart accepté, ticket entier : pas de cycle rouge/vert ni de test de forme.** Le ticket interdit d'ajouter des tests de forme. Il prend pour preuve les scénarios existants, lancés avant et après la migration, et la comparaison des assertions, titres et cas. Ces preuves sont fournies.
- .harness-state/tickets/T060/relecture-3.md : **Écart accepté, critère 2 : la borne du confinement passe de 500 × 10 ms à 10 s.** C'est l'allongement que le ticket prévoit explicitement (l. 41 et 51-52), et il est consigné au journal.
- .harness-state/tickets/T060/relecture-3.md : **Écart accepté, correction de la relecture 1 : aucun nouveau cas pour l'extraction de la constante.** Le comportement observable ne change pas. Le comparateur hors dépôt a d'abord échoué, puis il est passé.
- .harness-state/tickets/T060/relecture-3.md : **Écart accepté, correction de la relecture 2 : ni nouveau cas ni rouge artificiel.** Seul le commentaire change, et l'interdiff montre qu'aucune ligne exécutable n'est touchée.
