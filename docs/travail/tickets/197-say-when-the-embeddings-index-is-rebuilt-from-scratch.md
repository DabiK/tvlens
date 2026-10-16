---
id: T197
titre: Say when the embeddings index is rebuilt from scratch instead of rebuilding it in silence
statut: termine
bloque_par: T199
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le journal de l'hôte annonce qu'un cache d'embeddings inutilisable devra être reconstruit et pourra
entraîner de nouveaux appels au fournisseur. Le diagnostic distingue un cache absent, un cache
invalide et une récupération partielle ; la recherche continue d'utiliser les vecteurs encore connus.
Le ticket rend visible le comportement de reconstruction, sans en changer la politique ni le coût.

## Sources

- `docs/audit-architecture.md`, rapport A, C, réserve T176 R4. Décision du propriétaire, le 16/10 :
  signaler la reconstruction dans l'état ou le journal, test à l'appui ; le journal est retenu ici
  pour ne pas étendre les projections publiques. T178 est transitif par T199.
- Réserve versionnée :
  `docs/travail/tickets/176-handle-or-justify-every-empty-catch-in-the-adapters.md:235` et `:385`
  (R4) : chargement silencieux, coût possible et structure tardive invalide, distincts de la simple
  ligne JSON déchirée.
- Code vérifié à `8340014`, stockage, index, compositions, appelants et tests lus en entier :
  - `adapters/embedding-store.cjs:6` lance `load` dès la construction ; `:9` lit le fichier et son
    en-tête, `:10` écarte un autre modèle ; `:13` ignore les lignes JSON illisibles ;
  - `adapters/embedding-store.cjs:14` mémorise les entrées au fil du parcours ; une structure telle
    qu'une entrée `null` peut interrompre celui-ci après des entrées déjà mémorisées ;
    `:17` absorbe ce refus sans diagnostic. Il ne vide pas les entrées déjà lues ;
  - `adapters/embedding-store.cjs:38` réécrit atomiquement ce qui est connu au prochain `put` quand
    `restart` est vrai ; une dernière ligne déchirée avec des entrées valides n'est pas une perte totale ;
  - `core/moment-index.cjs:63` réutilise le cache ou redemande le vecteur manquant au fournisseur ;
    `runtime/session-providers.cjs:177` compose le fournisseur et `:185` le cache `embeddings.json` ;
  - `core/moment-index.cjs:413` expose les compteurs de travail, sans diagnostic de chargement ;
    `runtime/headless-runtime.cjs:294` les publie, sans état de reconstruction du cache ;
  - couture serveur : `runtime/headless-runtime.cjs:362` (`sessionOptions()`) transmet les overrides
    de fournisseurs à la composition. `runtime/session-providers.cjs:179` ne construit pas de cache
    en smoke sans override d'embeddings ; le banc Mac ne constitue donc pas une preuve de ce diagnostic ;
  - `tests/moment-index.test.cjs:438` couvre un cache abstrait refusé ; `:515` le log nominal,
    `:530` la ligne déchirée, `:535` le changement de modèle et `:544` l'ancien format ;
    `tests/review-regressions.test.cjs:183` couvre une récupération de ligne déchirée,
    `:285` fixe la liste actuelle des compteurs. Aucun de ces cas ne prouve le diagnostic demandé.

## Périmètre

- Ajouter à `EmbeddingStore` un canal de diagnostic injecté, et le raccorder au journal des deux
  hôtes via `runtime/session-providers.cjs` et `runtime/session-runtime.cjs`. Modifier les points
  de composition de `app/main.cjs` et `runtime/headless-runtime.cjs` seulement pour transmettre
  cette dépendance ; aucun accès global au journal depuis le cœur.
- Émettre un diagnostic stable et exploitable, avec code, cause et indication de reconstruction
  totale ou partielle. Au chargement, annoncer une reconstruction nécessaire, sans prétendre
  qu'elle a déjà abouti ; le fournisseur ne sera rappelé que pour les vecteurs effectivement demandés.
- Distinguer ENOENT normal, refus de lecture, en-tête illisible, modèle différent, ancien format et
  récupération partielle. Conserver les tolérances existantes, les entrées valides et les écritures
  sérialisées. Ce ticket ne définit pas un nouveau schéma d'archive ni une réparation exhaustive du cache.
- Compléter les tests du store/index et de la composition des fournisseurs, puis
  `tests/server-sessions.test.cjs` ou `tests/server-state-views.test.cjs` via `sessionOptions()`.
  Le diagnostic est porté par l'adaptateur partagé par les deux hôtes. Le Mac emprunte le même
  adaptateur ; aucun test d'hôte Mac séparé n'est demandé. Utiliser fichier
  temporaire et faute disque injectée, pas les permissions réelles d'un fichier ni un fournisseur réel.
- Ne modifier ni compteur public de l'index, ni politique de recherche, budget, prix ou renouvellement
  des vecteurs, ni contrat serveur/TV. Les textes et vecteurs privés ne partent pas dans le diagnostic.

## Critères d'acceptation

1. Un en-tête JSON illisible et un refus de lecture injecté donnent chacun un diagnostic de cache
   inutilisable et de reconstruction nécessaire, avec cause stable. Un `get` retourne toujours le
   résultat de secours existant ; une demande à l'index peut ensuite produire et conserver un vecteur.
   Le test prouve à la fois la disponibilité de la recherche et l'annonce de son nouveau travail.
2. Un fichier avec une entrée valide puis une structure invalide conserve la première entrée en
   mémoire. Le diagnostic dit récupération partielle et ne prétend pas que tous les vecteurs ont
   été perdus. Le fournisseur n'est rappelé que pour une entrée absente ; le prochain `put` reconstruit
   un fichier relisible contenant aussi l'entrée valide, sans duplication de son appel fournisseur.
3. Un fichier absent est reconnu comme création normale, sans fausse alerte de corruption. Un log
   valide ne produit pas d'alerte. Une ligne finale déchirée conserve les vecteurs précédents ; le
   changement de modèle et l'ancien format sont distingués d'un refus disque ou d'une perte totale.
4. Le diagnostic de chargement ne se répète pas à chaque `get` ou `put`. Les tests de composition
   prouvent d'abord son émission par l'adaptateur partagé, puis son arrivée au journal du serveur
   via `sessionOptions()`, y compris si le chargement se règle pendant la construction.
   Le Mac emprunte le même adaptateur, sans test d'hôte séparé. Les sorties n'incluent ni texte de passage, ni vecteur, ni identifiant secret.
5. Les tests existants de sérialisation, arrêt et scellement restent actifs : aucune écriture tardive
   ne recrée une session supprimée. Le diagnostic ne transforme pas le cache dérivé en condition de
   démarrage ou de réussite de la recherche, et ne déclenche aucun nouvel appel de sa propre initiative.
6. À l'implémentation, exécuter en séquentiel les tests moment-index, session-providers,
   session-lifecycle et le scénario serveur touché, puis `node scripts/check.mjs`. Aucun test live,
   quota réel, changement de harnais ou de plancher n'est requis.

## Test d'acceptation attendu

Dans `tests/moment-index.test.cjs` ou un fichier dédié au store, charger les trois fixtures fautives
par le vrai `EmbeddingStore`, recueillir ses diagnostics et faire demander les vecteurs par le vrai
`MomentIndex` avec un fournisseur factice compté. Un test serveur, avec les overrides d'embeddings fournis par `sessionOptions()`, observe ce
même diagnostic au journal injecté, sans dépendre d'un changement de la liste des compteurs publics.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La possibilité de rappeler le fournisseur est établie par le code. Le montant refacturé, la fréquence
des reconstructions et le nombre de vecteurs perdus sur des sessions réelles ne sont pas mesurés.
Le diagnostic ne doit pas annoncer un montant ni une reconstruction totale lorsque le cache reste partiel.

## Journal

- Exploration : consignes, code du store/index, compositions, appelants, tests et ADR concernés lus.
  Le cache conserve déjà les entrées précédant une structure invalide ; le travail porte sur son
  diagnostic et le journal des deux hôtes. Détails et absence d'écarts :
  `.harness-state/tickets/T197/exploration.md` et `ecarts.md`. Aucun test lancé à ce stade.
- Store/index : rouges observés sur les assertions de diagnostic, puis verts pour en-tête illisible,
  refus de lecture injecté, récupération structurelle partielle, classification des formats et
  journal défaillant. Commandes `node --test --test-name-pattern='<comportement>' tests/moment-index.test.cjs`
  et sorties exactes conservées dans les fichiers `*-red.log` / `*-green.log` du dossier d'état.
  `node --test tests/moment-index.test.cjs` : 41 tests réussis, 0 échec (`store-green.log`).
- Composition : `node --test --test-name-pattern='shared index composition' tests/session-providers.test.cjs`
  échoue d'abord sur l'absence de journal, émission pendant construction comprise.
  `node --test tests/session-providers.test.cjs` devient vert : 12/12 (`composition-green.log`).
- Serveur : `node --test --test-name-pattern='server session options deliver embedding load diagnostics' tests/server-state-views.test.cjs`
  rouge sur le journal absent, puis vert : 3/3. Le refus disque synchrone arrive au journal avant
  adoption de la session ; aucune donnée privée ni appel fournisseur initié au chargement.
- Suites exécutées séquentiellement : `node --test tests/moment-index.test.cjs` (41/41),
  `node --test tests/session-providers.test.cjs` (12/12), `node --test tests/session-lifecycle.test.cjs`
  (15/15), `node --test tests/server-state-views.test.cjs` (4/4). Sorties `*-final.log` dans l'état.
  Premier `node scripts/check.mjs --changed` vert : 57/57 tests JS.
- Premier `node scripts/check.mjs` : 1953/1958 tests JS réussis, 5 échecs ; 22/22 tests Python réussis.
  Reproduction avec `node --test --test-name-pattern='ending a session archives|an end the disk refuses|a session whose manifest|stopping the host|the draft of an answer is' tests/server-sessions.test.cjs`
  : les cinq assertions de journal constatent uniquement le nouveau diagnostic normal de cache absent.
  Leurs attentes sont complétées avec ce message exact et conservent les erreurs de fermeture attendues.
  Sorties : `check-full-first.log` et `server-journal-red.log`.
- Après adaptation des attentes : `node --test tests/server-sessions.test.cjs` vert, 29/29 ;
  `node scripts/check.mjs --changed` vert, 86/86 tests JS ; `node scripts/check.mjs` vert,
  1958/1958 tests JS (127 fichiers) et 22/22 tests Python. Règles, format, lint, gel et cliquet verts.
  Sorties : `server-journal-green.log`, `check-changed-final.log`, `check-full-final.log`.
  Commandes exactes des cycles et preuves : `.harness-state/tickets/T197/commandes.md`.
  Verdict `TERMINÉ` enregistré dans le dossier d'état ; relecture et intégration rendues à la boucle.
- Reprise après `relecture-1.md` : constat mineur accepté. Le test serveur transmet actuellement
  `log` par les options, ce qui masque le raccord explicite de `sessionOptions()`. Le scénario sera
  repris sans option `log`, avec interception de `console.error` ; toutes ses assertions restent
  conservées. Une suppression temporaire du raccord servira à observer le rouge, puis sera restaurée.
- Preuve de correction : `node --test --test-name-pattern='server session options deliver embedding load diagnostics' tests/server-state-views.test.cjs`
  passe avec l'ancien test malgré le raccord retiré (`default-journal-old-test-mutant.log`), puis
  échoue sur l'assertion de journal avec le test renforcé (`default-journal-red.log`, deux sous-cas).
  Après restauration du raccord à l'identique, la même commande est verte : 3/3
  (`default-journal-green.log`). Les assertions sur l'adoption, le fournisseur et la confidentialité
  restent identiques. `cmp runtime/headless-runtime.cjs .harness-state/tickets/T197/headless-runtime-before-correction.cjs`
  réussit : aucun changement de production durable dans cette correction.
- Suites de correction exécutées séquentiellement : `node --test tests/moment-index.test.cjs`
  (41/41), `node --test tests/session-providers.test.cjs` (12/12),
  `node --test tests/session-lifecycle.test.cjs` (15/15),
  `node --test tests/server-state-views.test.cjs` (4/4). Sorties `*-correction.log` dans l'état.
- Contrôles après correction : `node scripts/check.mjs --changed` vert (86/86 tests JS), puis
  `node scripts/check.mjs` vert (1958/1958 tests JS, 127 fichiers ; 22/22 tests Python).
  Règles, format, lint, gel et cliquet verts. Sorties : `check-changed-correction.log` et
  `check-full-correction.log`. Constat mineur corrigé ; nouveau verdict `TERMINÉ` enregistré
  pour la relecture de correction par la boucle.
