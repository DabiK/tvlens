---
id: T219
titre: Serve the server state and views from the application memory projection
statut: a-faire
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
