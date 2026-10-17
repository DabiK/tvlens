---
id: T219
titre: Serve the server state and views from the application memory projection
statut: termine
bloque_par: T209, T211, T212, T213
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

L'état serveur, son champ `session` compris, vient d'une projection applicative commune, construite
à partir de la vue de consultation et d'accès publics explicites. Les corps `/v1`, leurs invalidations
et leurs ETags gardent leur contrat. La livraison Mac et la contraction du domaine sont deux lots suivants.

## Sources

- Coupe de T219, relecture B, constats 5, 21 et 22 ; `docs/domaine.md`, sections 6, 8 et 9 ;
  ADR 0029/0030. T209/T211/T212/T213 ont migré index/manifeste, surveillance, outils, frise/vues.
  T207 est transitif ; relire ces contrats et les corps figés par T213 avant migration.
- Code vérifié à `dd5efc9` : `runtime/headless-runtime.cjs:249-253` reçoit l'état publié,
  `:280-303` construit l'état complet (session issue de `watch.snapshot()` à `:282`),
  `:306-323` cache les vues et `:474-483` nourrit les lignes de session.
- `core/session.cjs:491-504` contient aussi activité, files, erreurs, questions historiques,
  coûts, latence, stockage, orphelins et rétention, hors passages seuls.
  `runtime/state-views.cjs:17-35` nomme l'en-tête des vues légères.
- `runtime/headless-runtime.cjs:241-246` peut construire un snapshot par auditeur, mais aucun
  auditeur produit n'existe : seul `scripts/replay-lg-stream.cjs:121` en ajoute un. Ne pas
  présenter un comptage à plusieurs abonnés comme un gain déjà réalisé dans le produit.
- `tests/server-state-views.test.cjs:100` prouve qu'une horloge avancée sans publication garde
  son ETag et peut répondre 304. Bancs à conserver : server-state-views, server-sessions,
  timeline-server, state-views et wire-contract (T038), sous `tests/`, suffixe `.test.cjs`.

## Périmètre

- Ajouter la projection dans `runtime/memory/`, composée dans le runtime partagé depuis T207 et
  les ports ci-dessous. Déclarer/enrichir cette sous-zone et ses permissions selon T205.
  Aucun import de module interne de Mémoire par un autre contexte de domaine.
- Pour chaque champ de `core/session.cjs:491-504` absent de `MemoryView`, nommer l'accès public
  qui le fournit, sans `snapshot()` et sans placer `questions` ni `asking` dans `MemoryView`.
  Correspondance cible à implémenter ou à relier aux accès déjà livrés, avec contrat testé :

  | Champs de la projection | Accès public distinct de `MemoryView` |
  | --- | --- |
  | `accepting`, `readOnly`, `unplacedMedia`, `retention`, `retentionMs` | `readPublicationStatus()` de la mémoire, valeurs détachées de cycle/compatibilité |
  | `asking`, `analyzing`, `pending`, `audioPending`, `visionPending`, `lastError` | `readPublicationStatus()`, façade compatible T190 ; agrège aussi `storageError` et `saveError` |
  | `questions` historiques | `readHistoricalQuestions()`, copie des données conservées par T194, séparée des jobs `DeepAsk` |
  | `apiCalls`, `apiCost` | `readUsage()`, compteurs acquis de perception |
  | `latency` | Horodatages des passages T207, calcul public `latencySummary` (`core/session.cjs:5`, `:499`) |
  | `storage` | `runtime.storage()`, mesure en cache de la composition (`runtime/session-runtime.cjs:127-152`) |

  Identité, horloge, bornes de mémoire, passages révisés, disponibilité, couverture et pertes
  viennent de T207. Toute clé non couverte est ajoutée explicitement à la table et à son contrat
  avant migration ; aucun accès privé ou snapshot de secours. Les noms d'accès ci-dessus sont
  une interface à livrer, pas une API réputée présente à `dd5efc9`.
- La projection traduit les noms historiques `segments`/`history`, champs et valeurs du fil.
  Garder les questions historiques et les champs facultatifs ; les domaines consommateurs
  ne reçoivent pas cette forme complète en remplacement de leur vue spécialisée.
- Migrer seulement `published`, état complet, vues dérivées et lignes de session du serveur.
  Inventorier réception, enrichissement, disponibilité, progression, pertes, retenue, admission,
  pause/reprise, erreurs de traitement/sauvegarde, chargement, questions, quotas, index et disque.
  Utiliser les invalidations déjà livrées ; compléter si nécessaire une invalidation bornée
  sans forcer un événement de passage à représenter une transition de session.
- Construire une projection partagée par livraison et détacher au changement de session. Garder
  la distinction entre horloge lue au moment d'une requête et état publié : l'ETag ne dépend
  jamais de l'horloge courante seule. Révision auxiliaire, caches par vue et 304 restent inchangés.
- Garder provisoirement le callback complet du domaine et la livraison Mac. T224 migre le Mac,
  T225 retire cette construction dans `emit()`. Aucun changement de sauvegarde ou convertisseur,
  de cycle de vie, d'IPC ou de page TV. La part Mac conserve sa dépendance à T195 dans T224 ;
  jusqu'à lui, ne pas réécrire les motifs de `tests/mac-ipc-contract.test.cjs:87-128` pour suivre
  un nouveau câblage : si l'un casse, s'arrêter.
- Écrire l'ADR de projection applicative ; les fichiers nouveaux arrivent sans infraction gelée.

## Critères d'acceptation

1. Les corps figés de T213 pour `/v1/state`, `?view=chat`, `?view=panel` et `/v1/moments/detail`
   restent égaux par `assert.deepStrictEqual` dans le même scénario à horloges injectées.
   Tous les champs de l'ancienne session publiée ont un accès public testé, sans snapshot de secours.
2. Après ingestion, changement de disponibilité, état de file sans texte nouveau, erreur de
   sauvegarde, questions et chargement, le serveur expose le même dernier état et les mêmes
   totaux/lignes. Aucune livraison tardive de A ne modifie B.
3. Une horloge seule ne change pas l'ETag ; une publication invalide les bonnes vues et un poll
   inchangé reçoit 304 sans corps. Les corps des lectures complètes gardent la fraîcheur prévue,
   distincte des compteurs d'invalidation et du cache des vues.
4. La projection se construit sans appeler `WatchSession.snapshot()` ; un espion le prouve pour
   les nouveaux accès serveur. L'ancien callback peut encore le construire jusqu'à T225.
   Les comptages distinguent ce chemin hérité et le lecteur de mesure replay-lg-stream.
5. À l'implémentation, jouer les suites citées, le contrat de projection et les gardes en
   séquentiel, puis `node scripts/check.mjs`. Aucun corps attendu, test ou plancher n'est affaibli.

## Test d'acceptation attendu

Créer `tests/memory-projection.test.cjs` pour composer vraie mémoire, vue T207 et ports publics,
avec horloge et perception maîtrisées. Les bancs server-state-views/timeline-server et T038
comparent les vrais corps HTTP figés et la revalidation ; les nouveaux lecteurs interdisent
l'appel au snapshot de domaine sans empêcher le callback hérité encore nécessaire au Mac.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Si un champ ne possède pas d'accès public livré, le créer et le tester explicitement dans ce lot,
sans enrichir MemoryView avec les données de Questions. La durabilité reste appelée par ses
propriétaires actuels ; une projection réussie ne confirme aucun état disque.

## Journal

- Exploration : règles, skill, domaine et contrats consultés ; correspondance des champs et invalidations
  consignée dans `.harness-state/tickets/T219/exploration.md`, écarts prévus dans `ecarts.md`.
  Arbre initial : ticket en cours et deux dossiers non suivis préexistants conservés.

- Ports et projection : `node --test tests/memory-projection.test.cjs` rouge observé sur les
  accès absents, puis vert ; rouge/vert supplémentaires sur la fraîcheur pendant retrait média
  et les valeurs facultatives nulles. Sorties conservées dans le dossier d'état.
- Migration serveur : `node --test tests/server-state-views.test.cjs` vert (8 cas à cette étape),
  corps figés et ordre JSON inchangés, lecteurs sans snapshot, files sans texte et erreurs de
  sauvegarde couverts. Le callback hérité reste compté séparément de la projection partagée.
- Garde : rouge observé sur l'export public de latence ; déclaration de la composition et exception
  exacte ajoutées. `node --test --test-concurrency=1 tests/architecture.test.cjs tests/memory-view.test.cjs`
  vert (26 cas). Suppression de complexité devenue inutile élaguée par
  `node_modules/.bin/eslint --prune-suppressions runtime/headless-runtime.cjs`.
- Premier `node scripts/check.mjs --changed` rouge : une ligne de test dépassait 160 caractères ;
  ligne découpée. ADR 0054 écrit ; suites d'acceptation et contrôle final à suivre.

- Acceptation en séquentiel : commande ci-dessous, 609 tests réussis, aucun échec ; sortie dans
  `.harness-state/tickets/T219/acceptance.log`. Le contrat Mac est passé sans modifier ses motifs.

  ```sh
  node --test --test-concurrency=1 tests/memory-projection.test.cjs tests/server-state-views.test.cjs \
    tests/server-sessions.test.cjs tests/timeline-server.test.cjs tests/state-views.test.cjs \
    tests/wire-contract.test.cjs tests/mac-ipc-contract.test.cjs tests/architecture.test.cjs \
    tests/architecture-guard.test.cjs
  ```

- `node scripts/check.mjs --changed` vert : règles, format, lint, gel, cliquet et 39 tests réussis.
  Le compteur produit passe de 1370 à 1377 ; aucun plancher modifié. Sortie : `check-changed-final.log`.

- Premier `node scripts/check.mjs` rouge : 2564/2565 tests JS réussis, 47 tests Python réussis.
  L'échec de `session-rows` vient de sa doublure serveur sans le nouveau port public de projection.
  `node --test tests/session-rows.test.cjs` reproduit cet échec ; raccord à la vraie projection avec
  les ports du scénario, puis vert (5 tests). Toutes les assertions et valeurs attendues restent intactes.
  Diagnostic et justification consignés dans `ecarts.md`, sorties rouge/vert conservées.
- Après correction, `node scripts/check.mjs --changed` vert : 44 tests sur 5 fichiers, règles,
  format, lint, gel et cliquet verts. Sortie : `check-changed-correction.log`.

- Contrôle final : `node scripts/check.mjs` vert, 2565/2565 tests JavaScript sur 144 fichiers et
  47 tests Python réussis ; règles, format, lint, gel et cliquet verts. Sortie conservée dans
  `.harness-state/tickets/T219/check-full-final.log`. `git diff --check` vert.
- Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T219/verdict.json` ; aucune réserve propre,
  aucun commit ni push. La boucle possède la relecture et l'intégration.

- Reprise après `relecture-1.md` : rapport, journal, écarts et diff relus. Constat mineur 1 accepté :
  retrait prévu du paramètre redondant des vues ; exploration et justification consignées dans le
  dossier d'état. Aucun autre changement de périmètre prévu.

- Correction du constat mineur 1 : `node --test tests/state-views.test.cjs` rouge observé sur
  l'identité de l'en-tête issue d'une publication étrangère. Après retrait du paramètre et de son
  étalement, `node --test --test-concurrency=1 tests/state-views.test.cjs tests/server-state-views.test.cjs`
  vert : 16 tests réussis, corps figés et ordre JSON conservés. Sorties :
  `correction-1-state-views-red.log` et `correction-1-state-views-green.log` dans le dossier d'état.
- `node scripts/check.mjs --changed` vert après correction : 51 tests réussis sur 6 fichiers ;
  règles, format, lint, gel et cliquet verts. Sortie : `correction-1-check-changed.log`.

- Après correction de relecture, `node scripts/check.mjs` vert : 2566/2566 tests JavaScript
  sur 144 fichiers et 47 tests Python réussis ; règles, format, lint, gel et cliquet verts.
  Sortie : `.harness-state/tickets/T219/correction-1-check-full.log`. `git diff --check` vert.
- Nouveau verdict `TERMINÉ` enregistré : constat mineur 1 corrigé, aucune réserve propre et
  aucune contestation. La boucle conserve la relecture et l'intégration ; aucun commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T219/relecture-2.md : 1. `runtime/headless-session-lifecycle.cjs:83` — hors périmètre
  - **Problème.** `adopt()` construit encore `session.watch.snapshot()` pour le passer à `onAdopt`. Or `onAdopt` vaut `() => host.emit()` (`runtime/headless-runtime.cjs:77`) et ignore cet argument.
  - **Attendu.** Dans T224 ou T225 : `this.onAdopt(session)`, sans snapshot.
  - **Pourquoi hors périmètre.** Le ticket interdit tout changement du cycle de vie.
- .harness-state/tickets/T219/relecture-2.md : 2. `docs/domaine.md:303` — hors périmètre
  - **Problème.** La phrase « l'hôte headless en construit un par auditeur » est fausse depuis ce lot : `emit()` partage une seule livraison entre ses auditeurs.
  - **Attendu.** La corriger dans le lot qui révise ce document cible figé.
- .harness-state/tickets/T219/relecture-2.md : **Écart accepté, section « Correction après relecture 1 » de `ecarts.md`.** Ce n'est pas un écart à un critère : c'est l'application de l'attendu du constat 1. Aucune assertion ni aucun témoin existant n'est retiré, et l'interdiff ne touche à aucun test existant.
