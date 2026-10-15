---
id: T170
titre: Move TV polling into an injected controller
statut: a-faire
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
