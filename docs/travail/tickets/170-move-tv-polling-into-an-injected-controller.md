---
id: T170
titre: Move TV polling into an injected controller
statut: termine
bloque_par: T169, T058, T185
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La vraie boucle de lecture d'état du panneau TV passe dans un contrôleur injecté. Les tests conduisent
ses requêtes et ses minuteries, y compris pendant un appel réseau différé. Le companion compose le
contrôleur avec le client existant et ses callbacks de présentation, et dispose d'un arrêt explicite.

## Sources

- `docs/audit-points-chauds.md`, section B « Découpage des trois gros fichiers », polling TV.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Code vérifié à `e92c6a6`, avant T169 :
  - `tv/app/companion.js:25` fixe 250 ms en activité, 1 s au repos, une vue panel sur quatre,
    un repli temporaire de 10 s et un backoff maximal de 8 s ;
  - `tv/app/companion.js:206` calcule la politique ; `tv/app/companion.js:231` classe les refus
    de vue et `tv/app/companion.js:268` réalise la lecture et son repli ; ces modèles passent
    dans `chat-model.js` avec T169 ;
  - `tv/app/companion.js:1123` possède `pollTimer`, `polling`, `kicked`, le plan et les statistiques ;
    `tv/app/companion.js:1136` accélère la prochaine lecture et `tv/app/companion.js:1143`
    conduit la requête. `tv/app/companion.js:1153` traite un 304 sans appeler `receive` ;
  - `tv/app/companion.js:1158` présente l'erreur, dont le message distinct sur 401 ;
    `tv/app/companion.js:1172` programme toujours une nouvelle lecture, sans API d'arrêt ;
  - `tv/app/companion.js:1233` et `tv/app/companion.js:1236` possèdent deux intervalles locaux
    de présentation, distincts du timer de polling ; `tv/app/companion.js:1242` expose
    `window.tvlensPanel` avec `stats`, `kick`, `state` ;
  - `tv/app/remote-client.js:68` gère les ETags par URL et le 304 ; ce transport reste inchangé ;
  - `tests/tv-panel.test.cjs:105` conduit `PollPlan`, et `tests/tv-panel.test.cjs:188` teste le
    transport. Ce ne sont pas des tests de la boucle `poll()` ;
  - `tests/helpers/tv-page.cjs:151` crée une page sans configuration d'appairage ; le companion
    sort à `tv/app/companion.js:556`. Ce banc ne prouve donc pas le polling appairé.
- ADR 0011 dans `docs/adr/` pour les scripts classiques. T058 fournit les horloges de test communes.

## Périmètre

- Créer `tv/app/poll-controller.js`, script classique exposé suivant l'ADR 0011, et une fabrique
  recevant le client, l'horloge monotone, les fonctions de timer, l'accès à l'état courant et les
  callbacks de réception, de réponse inchangée et d'erreur. Réutiliser `PollPlan` de `chat-model.js`.
- Déplacer la boucle, ses états en vol, son accélération et son timer. Fournir des commandes nommées
  pour démarrer, demander une lecture et arrêter. L'arrêt invalide une continuation réseau tardive
  et supprime le timer détenu sans imposer une nouvelle méthode au client HTTP.
- Câbler ce contrôleur dans `companion.js`, le charger dans `index.html`, et garder les noms publics
  de `window.tvlensPanel`. L'objet de statistiques exposé garde ses champs et leur sens ; le compteur
  de rendus peut continuer à être alimenté par la présentation.
- Garder dans le companion les deux intervalles locaux de présentation et leur branchement actuel :
  le contrôle de leur propriétaire n'est pas confondu avec l'arrêt du timer de polling.
- Ajouter `tests/tv-poll-controller.test.cjs` avec l'horloge de T058 et des promesses différées.
  Réutiliser le banc appairé livré par T185 dans `tests/helpers/tv-page.cjs`, avec son document,
  ses faux clients et ses minuteries injectables, pour vérifier le câblage du vrai contrôleur.
  Ajouter le scénario au test ; ne pas reconstruire ce banc ni son DOM.
- Écrire un ADR au premier numéro libre sur le propriétaire de la boucle, ses dépendances et son arrêt.
- Ne modifier ni routes, authentification, ETags, transport HTTP, modèles de polling ni rythme nominal.
  Ne pas déplacer les cartes et l'état d'envoi, qui relèvent de T171.

## Critères d'acceptation

1. Le contrôleur s'importe sans DOM. Pendant une lecture différée, plusieurs demandes d'accélération
   ne créent aucune requête concurrente ; leur résolution conduit à une seule lecture supplémentaire
   immédiate, puis au rythme normal. Une accélération pendant l'attente annule ce timer avant de lire.
2. Une réponse 200 livre le corps et la vue au callback de réception. Un 304 préserve l'état détenu,
   n'appelle pas la réception ni le rendu des cartes et ne fait que notifier l'état de connexion et
   les compteurs. Le test vérifie le nombre d'appels aux callbacks, pas seulement `PollPlan.delay()`.
3. Les tests du contrôleur observent les appels réels au faux client : un 404 de vue ou un 400
   « Vue d'état inconnue » replie définitivement vers l'état complet ; un autre 400 de vue replie
   pendant 10 s, puis réessaie les vues. Un 401 ou 500 ne devient pas un refus de vue.
4. Après des échecs réseau successifs, même avec un job actif, les attentes suivent le backoff
   existant et plafonnent à 8 s ; un succès rétablit la cadence. Les callbacks conservent le message
   d'appairage refusé sur 401 et l'indisponibilité de l'envoi hors ligne.
5. L'arrêt pendant une attente supprime le timer. L'arrêt pendant une requête rend sa réponse tardive
   sans effet sur la page et ne réarme rien. Arrêt répété et demande d'accélération après arrêt ne
   créent aucune minuterie. Tous ces cas avancent l'horloge simulée, sans sommeil réel.
6. Une page appairée du banc charge le contrôleur via les balises réelles et son `tvlensPanel.kick`
   demande effectivement une lecture. Les champs `stats`, `kick`, `state` restent disponibles ; la
   navigation existante reste verte. Une mutation qui oublie la garde d'appel en vol rend le test du
   critère 1 rouge ; sortie consignée, puis mutation retirée.
7. Les tests du contrôleur, de `tv-panel`, du modèle, de navigation et de compatibilité passent en
   séquentiel, puis `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/tv-poll-controller.test.cjs`, frontière : commandes du vrai contrôleur et appels à un client
simulé dont les promesses sont résolues par le test. Les assertions portent sur les requêtes, callbacks
et timers, avec l'horloge commune. Un cas appairé du banc `tests/helpers/tv-page.cjs` prouve le câblage
de page ; les tests actuels de `PollPlan` et du client restent inchangés.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Dans la chaîne retenue, T169 implique T182 et T150 ; T185 livre indépendamment le banc appairé.
T058 évite une nouvelle horloge locale au test. Si le retrait ambient est refusé, appliquer le
recadrage de dépendance nommé dans T169 ; T185 reste requis et n'attend pas cette décision. Le défaut
établi par lecture est l'absence d'interface d'arrêt de la boucle actuelle. L'arrêt des requêtes en vol
signifie ici invalider leur continuation ; il ne suppose pas une capacité d'annulation réseau que le
client ne publie pas. Aucun résultat de polling sur une TV réelle n'est affirmé.

## Journal

- Exploration : règles, skills, ticket, boucle, modèle, transport, banc appairé et ADR lus.
  `git status --short`, `git diff -- docs/travail/tickets/170-move-tv-polling-into-an-injected-controller.md`
  et `git log -5 --oneline` observés : base `4c1fe2d`, changements préexistants hors périmètre préservés.
  Exploration et absence d'écart consignées dans `.harness-state/tickets/T170/`.

- Tests d'abord, commandes et sorties conservées dans `.harness-state/tickets/T170/` :
  - `node --test tests/tv-poll-controller.test.cjs` : rouge sur l'assertion de première lecture
    (`controller-coalescing-red.log`), puis vert ; rouge sur l'annulation de l'attente
    (`controller-wait-red.log`), puis vert ; rouge sur le callback de réception
    (`controller-receive-red.log`), puis vert.
  - `node --test --test-name-pattern='stop during a deferred body|stop cancels' tests/tv-poll-controller.test.cjs` :
    deux assertions rouges (effet tardif et redémarrage après arrêt), puis
    `node --test tests/tv-poll-controller.test.cjs` : 7/7 verts après invalidation définitive.
  - Ajout des preuves par appels du faux client : replis 404/400 définitifs, repli temporaire de
    10 s, 401/500 sans repli, backoff actif/repos jusqu'à 8 s, reprise et réglages injectés.
    `node --test tests/tv-poll-controller.test.cjs` : 16/16 verts (`controller-policy-green.log`).
- Câblage de page :
  `node --test --test-name-pattern='paired page loads the polling controller' tests/tv-paired-page.test.cjs`
  rouge sur l'absence du contrôleur, puis extraction et balise ajoutées.
  `node --test --test-concurrency=1 tests/tv-poll-controller.test.cjs tests/tv-paired-page.test.cjs` :
  26/26 verts. Les trois scénarios de refus/reconnexion ajoutés ensuite gardent l'envoi indisponible
  hors ligne et reconnectent par 304 sans rendu : `node --test tests/tv-paired-page.test.cjs`, 13/13 verts.
- Mutation demandée : retrait temporaire de la seule garde `if (polling)` dans le contrôleur.
  `node --test --test-name-pattern='requests during a deferred read' tests/tv-poll-controller.test.cjs` :
  rouge sur « no concurrent request while the answer is deferred », 11 requêtes au lieu d'une.
  Sortie : `mutation-in-flight-red.log`. Mutation retirée dans un `finally` ;
  `node --test tests/tv-poll-controller.test.cjs` : 16/16 verts (`controller-restored-green.log`).
- ADR 0026 écrit sur le propriétaire de boucle, ses dépendances et son arrêt définitif.
  `PollPlan`, transport HTTP, banc appairé et intervalles de présentation inchangés.
- `node scripts/check.mjs --changed` : vert, 29/29 tests, règles, format, lint, gel et cliquet verts
  (`check-changed.log`). Aucune suppression ESLint devenue inutile ; aucun plancher modifié.
- Suites demandées en séquentiel :
  `node --test --test-concurrency=1 tests/tv-poll-controller.test.cjs tests/tv-panel.test.cjs tests/tv-chat-model.test.cjs tests/tv-paired-page.test.cjs tests/tv-remote-navigation.test.cjs tests/tv-app-compat.test.cjs`
  : 77/77 verts (`tv-suites.log`). Aucun essai sur TV réelle.

- Contrôle final : `node scripts/check.mjs` terminé avec code 0, vert : règles, format, lint,
  gel du lint et cliquet ; 1487/1487 tests JS dans 118 fichiers, puis 22 tests Python réussis
  (`check-full.log`). `git diff --check` : code 0, aucune erreur.
- Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T170/verdict.json` ; critères reliés aux
  preuves dans `couverture.md`. Aucun commit, push, essai TV ou fournisseur réel ; relecture
  et intégration laissées à la boucle.

- Reprise après `relecture-1.md` : rapport, ticket, journal, écarts, `git status --short` et `git diff`
  relus. Constat mineur accepté, aucune contestation ni nouvel écart de périmètre.
  `node --test tests/tv-poll-controller.test.cjs` exécuté avant édition : 16/16 verts
  (`correction-1-tests-before.log`). Correction rédactionnelle seule : aucun rouge comportemental
  nouveau revendiqué, ni test du texte source ajouté.
- Trois lignes de commentaires ajoutées dans `poll-controller.js` : lecture unique en vol,
  regroupement des accélérations en une lecture immédiate, et gardes ignorant une suite tardive
  après arrêt parce que le client n'expose pas d'annulation. Le diff de correction est conservé
  dans `correction-1-commentaires.diff` ; aucune instruction exécutable modifiée.
- Réserve hors périmètre conservée pour un ticket autorisant `scripts/` : commentaire de
  `scripts/bench-perceived.cjs:149` renvoyant encore à la boucle de `companion.js` et approximant
  le modèle effectivement conduit par ce banc. Ce script reste inchangé.

- Après correction : `node scripts/check.mjs --changed` terminé avec code 0, vert : 29/29 tests JS,
  règles, format, lint, gel et cliquet (`correction-1-check-changed.log`).
  `git diff --check` : code 0, aucune erreur.

- Contrôle complet de la correction : `node scripts/check.mjs` terminé avec code 0, vert :
  règles, format, lint, gel, cliquet, 1487/1487 tests JS dans 118 fichiers puis 22 tests Python
  (`correction-1-check-full.log`). `git diff --check` final : code 0.
- Nouveau verdict `TERMINÉ` : constat mineur 1 corrigé ; constat hors périmètre 2 conservé dans
  `reste`. Relecture et intégration laissées à la boucle ; aucun commit ni push.

### Réserves à la clôture

- Réserve hors périmètre de la relecture 1, constat 2 : scripts/bench-perceived.cjs:149 renvoie encore à companion.js et décrit approximativement le modèle conduit par le banc ; à corriger dans un ticket autorisant scripts/.
- .harness-state/tickets/T170/relecture-2.md : `scripts/bench-perceived.cjs:149` (hors périmètre)

  **Problème.** Ce constat vient de la relecture 1 et reste vrai. Le commentaire « Exactly what tv/app/companion.js does at each turn » renvoie toujours à `companion.js`. Or la boucle vit maintenant dans `tv/app/poll-controller.js`. Le commentaire était déjà approximatif avant ce ticket : le banc s'appuie sur `pollPolicy` et non sur `PollPlan`.

  **Attendu.** Corriger la référence dans un ticket qui autorise à modifier `scripts/`. C'est une réserve, et le verdict de l'implémenteur la note déjà dans `reste`.
