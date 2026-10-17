---
id: T052
titre: Answer an unexpected server error with a generic 500 and journal it
statut: termine
bloque_par: T051
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Sous réserve de la décision ci-dessous, une erreur serveur sans statut HTTP valide répond
500 avec un texte et un code génériques ; son détail reste au journal interne, avec méthode et route.
La TV peut ainsi renvoyer un bloc au lieu de le jeter comme un contenu invalide.

## Sources

- `docs/audit-architecture.md`, synthèse, rapport A, B4 et D4 ; rapport B, B2 et D2.
  Décision du propriétaire, le 16/10 : la question du 500 reste bloquante ; T051 est le prérequis.
- Code vérifié à `8340014` : `server/http.cjs:89` traite les erreurs ; `server/http.cjs:94` garde
  un status entier de 400 à 599, sinon prend 400 ; `server/http.cjs:96` publie error.message.
  null ou undefined relanceraient une exception dans ce traitement. Le catch des routes est à
  `server/http.cjs:142`, après l'extraction de l'ADR 0021.
- `server/http.cjs:102` ne reçoit aucun journal ; `server/main.cjs:46` construit le runtime,
  `server/main.cjs:47` construit RemoteServer sans puits de journal.
  `runtime/headless-runtime.cjs:92` dispose d'un callback log texte pour ses propres diagnostics.
  Le port et les fichiers proposés par T036 ne sont pas livrés dans ce worktree.
- `server/http.cjs:54` traite déjà contenu, taille et JSON invalide comme refus HTTP explicites.
  Les refus métier doivent être devenus explicites grâce à T201, sur le transport T188 ; T051 préserve les 400 de contenu.
- `tv/transport.py:76` lit le refus ; `tv/transport.py:85` abandonne les 4xx sauf 408/429 et
  renvoie les 5xx jusqu'à l'échéance. `tv/app/remote-client.js:13` conserve status/code.
  `tests/tv-panel.test.cjs:144` couvre le refus 401 ;
  `tests/tv-poll-controller.test.cjs:163` couvre la panne 500.
- Tests de frontière disponibles : `tests/remote-server.test.cjs`, `tests/server-routes.test.cjs`,
  `tests/server-sessions.test.cjs`, `tests/server-state-views.test.cjs`,
  `tests/test_tv_control.py`. Aucun futur test de contrat-fil n'est nécessaire.

## Périmètre

- Modifier `server/http.cjs`, `server/main.cjs` et les tests de serveur/clients cités selon les
  cas ajoutés. Ajouter un ADR au prochain numéro disponible, sans réécrire les ADR historiques.
- Conserver d'abord la traduction des codes métier en statuts HTTP livrée par T201 via T188, ainsi que
  STORAGE_FULL → 507 storage-full. Les refus reconnus ou portant un status HTTP valide gardent
  leurs codes et messages publics de T201/T051. Toute autre valeur levée
  répond exactement 500 avec error « Erreur interne du serveur. » et code internal-error.
  Le nom de classe, le message, errno ou syscall ne servent pas à deviner un refus métier.
- Supprimer l'ancien tri envisagé par TypeError/RangeError/ReferenceError/SyntaxError/syscall :
  une Error simple sans statut est elle aussi inattendue. Les refus voulus passent par leur
  statut explicite ; ne pas maintenir une liste de messages autorisés.
- Ajouter un callback de journal injecté à RemoteServer, recevant méthode, pathname et erreur
  d'origine/cause. Le câbler vers stderr dans server/main, sans ajouter le chantier JournalPort
  de T036 ni brancher implicitement le journal de fermeture du runtime.
  La réponse publique ne contient jamais ces détails. Un puits qui lève ne bloque pas la réponse.
- Le cas headersSent conserve sa terminaison existante : ne pas tenter un second envoi d'en-têtes.
  Les tests de réponse 500 lèvent avant tout envoi.
- Ne changer ni statuts/codes des refus explicites, ni limites et validation du corps, ni règles
  métier, ni produit Python/TV. Les tests seuls prouvent retry du transport et backoff du panneau.
  Toute ancienne attente sur un repli 400 inattendu à migrer est nommée dans les écarts et le journal.

## Critères d'acceptation

1. Vrai RemoteServer, runtime contrôlé : TypeError, Error simple sans statut, chaîne, null et undefined
   répondent chacun exactement 500 internal-error avec le texte générique. Une erreur système
   portant chemin et syscall, ainsi qu'un status hors intervalle, ont la même réponse.
2. Un puits injecté reçoit l'erreur originale et sa cause, la méthode et le pathname pour chaque
   erreur inattendue. Aucun détail interne ne paraît dans le corps. Un puits qui lève laisse le
   client recevoir la même réponse ; le chemin de refus métier ne passe pas par ce journal d'erreur.
3. Les refus explicites 400, 409, 429 et 503 gardent corps/code ; STORAGE_FULL reste 507
   storage-full. JSON invalide reste un 400 explicite. Les refus de contenu média de T051
   gardent leurs textes fixes ; aucune Error métier sans statut n'est réintroduite pour les préserver.
4. Le transport Python reçoit 500 internal-error puis 200, renvoie la même séquence et compte le
   bloc accepté ; un 400 explicite reste abandonné. Le panneau considère 500 comme panne et espace
   ses lectures, sans déclarer une vue inconnue. Réutiliser les doubles actuels.
5. L'ADR décrit la règle sans statut, le journal interne, la conservation des refus explicites et
   la conséquence retry/backoff. Le journal du ticket distingue cette évolution du contrat d'un
   simple refactor ; aucun essai TV réel n'est revendiqué.
6. À l'implémentation, exécuter en séquentiel les suites serveur touchées et les tests panneau/polling,
   puis test_tv_control en Python et `node scripts/check.mjs`. Les changements d'attentes prévus par
   la décision sont déclarés ; aucune autre assertion ni aucun cas n'est retiré.

## Test d'acceptation attendu

Dans `tests/remote-server.test.cjs` ou `tests/server-routes.test.cjs`, vrai HTTP local devant une
méthode qui lève et un puits enregistré. Commencer par Error simple sans statut : ce cas différencie
la règle retenue de l'ancien tri par classes d'exception. Les preuves clients utilisent leurs
transports réels, les réponses et minuteries contrôlées.

## Hypothèses bloquantes

Décision du propriétaire, le 16/10 (« Oui, 500 », en réponse à la question posée) : oui. Une erreur sans statut HTTP valide après traduction des codes métier reçoit 500, un message générique et sa cause au journal ; la TV renvoie alors le bloc pendant sa durée de vie.

Question posée : répondre 500, avec un message générique et la cause au journal,
à toute erreur sans statut HTTP valide après traduction des codes métier, au lieu de 400 avec son message brut ?
Conséquence : la TV renvoie le bloc pendant sa durée de vie au lieu de le jeter.
Recommandation : oui.

T051 implique T201, T188, T124, T199 et T178. T036 n'est plus un prérequis : le raccord de journal minimal
est inclus ici. Si un parcours normal reste sans statut après ces dépendances, sa réponse voulue
doit être établie avant de le convertir ; aucune règle métier ne se déduit de son message.

## Journal

- Exploration : lecture des consignes, de la skill tests, du transport et de ses cinq groupes,
  des tests et clients concernés, des ADR 0021/0026/0034/0039. Décision « oui, 500 » présente.
  Exploration et migrations prévues consignées dans `.harness-state/tickets/T052/`.
  Cette évolution du contrat remplace le repli 400 inattendu ; les refus explicites restent publics.
  Aucun test lancé à ce stade, aucun essai TV réel.
- Réponse générique, tests d'abord :
  `node --test --test-name-pattern='HTTP answers an ordinary unexpected Error' tests/server-routes.test.cjs`
  échoue sur l'assertion (400/message interne au lieu de 500/internal-error/texte fixe), puis passe
  après le changement minimal. Sorties `ordinary-error-red.log` et `ordinary-error-green.log`.
  Le contrôle rapide a signalé une complexité de 16 dans `sendError` ; extraction de la traduction
  `publicCode`, sans modification du gel ni des règles, puis contrôle rapide vert.
- Journal injecté :
  `node --test --test-name-pattern='HTTP journals|journal sink throws' tests/server-routes.test.cjs`
  rouge sur l'absence d'appel du puits (11 échecs), puis vert (11 tests). Le point d'entrée câble
  stderr ; les refus reconnus et la terminaison `headersSent` restent hors de ce journal.
  Sorties `journal-red.log` et `journal-green.log` dans le dossier d'état.
- Migrations déclarées appliquées : ancien repli inattendu, lecture d'archives EIO/EACCES/EMFILE
  et écriture EIO passent à 500 générique ; ENOSPC reste 507. Aucun cas retiré.
  `node --test --test-concurrency=1 tests/server-routes.test.cjs tests/server-ingest-path.test.cjs` :
  un nouveau cas 429 avait d'abord utilisé un code public au lieu de l'identité émettrice ; correction
  du double vers `TVLENS_QUESTION_QUEUE_FULL`, puis 59 tests réussis. Sortie `server-contract-green.log`.
- Preuves clients sans changement du produit Python/TV :
  `node --test --test-name-pattern='internal server errors through the remote client' tests/tv-poll-controller.test.cjs`
  et `python3 tests/test_tv_control.py DeliveryTests.test_internal_server_error_retries_the_same_sequence_then_counts_the_accepted_block`
  passent chacun (1 test). Vrais transports, réponses contrôlées et horloges maîtrisées ; aucun
  essai TV réel. ADR 0040 ajouté pour documenter cette évolution du contrat et ses conséquences.
- Contrôles intermédiaires : `node scripts/check.mjs --changed` vert (76 tests JS).
  Les sept suites serveur/panneau jouées ensemble avec `--test-concurrency=1` passent (130 tests),
  puis `python3 -m unittest discover -s tests -p test_tv_control.py` passe (15 tests).
- Premier `node scripts/check.mjs` : règles/format/lint/gel/cliquet verts, Python vert (24 tests),
  JS rouge (2111/2114). Trois anciennes attentes HTTP de `tests/architecture-f07.test.cjs` exposent
  encore les erreurs internes de scellement/libération. Lecture du test complet, du protocole, du
  cycle de vie et de l'ADR 0007 : ces erreurs sans statut viennent d'une panne simulée de fermeture,
  dont une annulation de questions rendue défaillante, pas d'un refus métier normal.
  Migration déclarée dans les écarts avant modification ; état, fichiers, journal et branche Mac
  restent vérifiés à l'identique.
  `node --test --test-name-pattern='server host.*deleting the loaded session|server host.*could not let go' tests/architecture-f07.test.cjs`
  reproduit les trois échecs sur les seules réponses publiques (`session-fallback-red.log`).
- Migration des trois réponses de fermeture effectuée sans toucher au protocole ni à l'hôte Mac.
  `node --test tests/architecture-f07.test.cjs` : 26/26 ; `node scripts/check.mjs --changed` : vert,
  102/102 tests JS. Sorties `session-fallback-green.log` et `check-changed-final.log`.
- Contrôle final `node scripts/check.mjs` : vert, règles/format/lint/gel/cliquet verts,
  2114/2114 tests JS sur 131 fichiers et 24 tests Python réussis, en séquentiel.
  Sortie `check-full.log` ; premier passage rouge conservé dans `check-full-initial.log`.
  `git diff --check` ne signale aucune erreur. Verdict `TERMINÉ` écrit dans le dossier d'état ;
  la relecture et l'intégration restent à la boucle. Aucun essai TV réel, commit ou push.
- Reprise après `relecture-1.md` : les deux constats sont acceptés. L'exclusion du journal après
  `headersSent`, affirmée plus haut, était erronée et contraire au critère 2 ; sa suppression
  est consignée dans les écarts avant correction. Le test HTTP sera renforcé avant le code,
  l'ADR précisé, et les trois titres de fermeture alignés sur le résultat public et le journal.
- Constat bloquant, tests d'abord :
  `node --test --test-name-pattern='HTTP ends an already started response' tests/server-routes.test.cjs`
  échoue sur l'absence d'entrée au journal (1 test, `headers-journal-red.log`), puis sur les deux
  cas après ajout du puits défaillant (`headers-journal-sink-red.log`). Après correction : 2/2
  réussis (`headers-journal-green.log`). La réponse reste 200 au corps vide ; le journal reçoit
  l'erreur de sérialisation, sa cause par identité, la méthode et le pathname, même si le puits lève.
  La classification précède désormais la garde `headersSent`, sans journaliser les refus explicites
  ni reconnus ; un seul bloc protégé appelle le puits. L'ADR 0040 précise cette garantie.
- Constat mineur : les trois titres de fermeture sont reformulés. Les deux titres serveur nomment
  l'erreur interne reçue et la raison au journal ; le titre commun nomme l'échec signalé au demandeur
  et la raison au journal, ce qui couvre les deux hôtes. Aucune assertion ni aucun cas retiré.
- Vérification des corrections : `node scripts/check.mjs --changed` vert (103 tests JS).
  `node --test --test-concurrency=1 tests/remote-server.test.cjs tests/server-routes.test.cjs tests/server-ingest-path.test.cjs tests/server-sessions.test.cjs tests/server-state-views.test.cjs tests/architecture-f07.test.cjs tests/tv-panel.test.cjs tests/tv-poll-controller.test.cjs` :
  157/157 tests réussis en séquentiel. Puis
  `python3 -m unittest discover -s tests -p test_tv_control.py` : 15/15.
  Sorties `correction-1-check-changed.log`, `correction-1-server-panel-suites.log`,
  `correction-1-python-control-suite.log` ; détails dans `correction-1.md` du dossier d'état.
- Contrôle complet après correction : `node scripts/check.mjs` vert, règles/format/lint/gel/cliquet
  verts, 2115/2115 tests JS sur 131 fichiers et 24 tests Python réussis en séquentiel.
  Sortie `correction-1-check-full.log`. `git diff --check` : aucune erreur.
  Nouveau verdict `TERMINÉ` écrit ; les deux constats sont corrigés et la relecture reste à la boucle.
  Aucun essai TV réel, commit ou push.
