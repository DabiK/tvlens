---
id: T052
titre: Answer an unexpected server error with a generic 500 and journal it
statut: a-faire
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

Décision attendue du propriétaire : répondre 500, avec un message générique et la cause au journal,
à toute erreur sans statut HTTP valide après traduction des codes métier, au lieu de 400 avec son message brut ?
Conséquence : la TV renvoie le bloc pendant sa durée de vie au lieu de le jeter.
Recommandation : oui.

T051 implique T201, T188, T124, T199 et T178. T036 n'est plus un prérequis : le raccord de journal minimal
est inclus ici. Si un parcours normal reste sans statut après ces dépendances, sa réponse voulue
doit être établie avant de le convertir ; aucune règle métier ne se déduit de son message.

## Journal
