# 0040 — Les erreurs HTTP inattendues répondent 500 et restent au journal

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/052-answer-an-unexpected-server-error-with-a-generic-500-and.md`
- Statut : acceptée

## Contexte

Le repli 400 de `server/http.cjs` publiait le message des erreurs inattendues, dont des chemins
ou diagnostics de l'hôte. Il échouait lui-même sur null et undefined. Les ADR 0034 et 0039
identifient désormais les refus voulus ; les refus de contenu média ont des textes publics fixes.
La capture abandonne un 400, mais retente un 500 pendant la durée de vie de son bloc.

## Décision

Après traduction des identités métier connues, toute valeur levée sans statut HTTP entier
compris entre 400 et 599 reçoit exactement 500, `internal-error` et « Erreur interne du serveur. ».
Une Error simple suit cette règle comme une TypeError, une valeur primitive ou une erreur système.
Ni classe, ni message, ni errno, ni syscall ne servent à déduire un refus métier.

Les identités métier reconnues conservent leur traduction et leur 400 par défaut. Les statuts
explicites valides conservent leurs messages et codes publics, dont `unclassified-error` pour
une identité inconnue. `STORAGE_FULL` conserve en priorité 507 `storage-full`. Les validations
JSON, limites de corps et refus de contenu média restent inchangés. Si les en-têtes sont déjà
envoyés, le serveur termine la réponse comme auparavant, sans second envoi.

Les pannes de scellement ou de libération de l'ADR 0007 relaient toujours leur erreur originale
dans le runtime ; leur réponse HTTP devient générique. Le journal de fermeture, l'état de la
session et les garanties de non-effacement restent ceux du protocole.

RemoteServer reçoit un callback facultatif `logError({ method, pathname, error, cause })`,
neutre par défaut. Pour chaque erreur inattendue, même après l'envoi des en-têtes, il lui remet
la valeur levée et sa cause par référence, avec la méthode et le pathname sans query. Les refus
reconnus ou explicites ne passent pas dans ce journal. Une exception du puits n'empêche ni la
réponse générique ni la terminaison de la réponse déjà commencée, sans nouvel en-tête.
`server/main.cjs` câble ce callback vers stderr avec `console.error`, séparément des diagnostics
du runtime et sans nouveau port de journalisation.

## Alternatives écartées

- Conserver le repli 400 et le message brut : expose des détails internes et fait abandonner le bloc.
- Trier les erreurs par classe, syscall ou formulation : une Error simple peut aussi signaler une panne.
- Classer toute erreur média comme contenu invalide : une panne disque ou d'hôte ne prouve pas un mauvais bloc.
- Attendre un port de journalisation général : le callback injecté suffit au raccord nécessaire ici.

## Conséquences

Il s'agit d'une évolution du contrat de l'ADR 0034, pas d'un simple refactor. Le transport Python
retente le même numéro de séquence après 500 puis compte le bloc accepté au 200 ; les 400 de
contenu restent abandonnés. Le panneau traite le 500 comme une panne, espace ses lectures
jusqu'à huit secondes et conserve les vues ; un succès rétablit sa cadence habituelle.
Le détail diagnostic reste disponible dans le journal interne. Aucun essai sur TV réelle
n'est nécessaire ni revendiqué par les preuves locales.

## Protégée par

- `tests/server-routes.test.cjs` : vrai HTTP, Error simple puis autres valeurs levées, réponse
  exacte, original et cause au journal, méthode et pathname, puits défaillant, refus préservés,
  JSON invalide et réponse déjà commencée journalisée, même si le puits lève ; fautes de lecture
  d'archives réelles contrôlées.
- `tests/server-ingest-path.test.cjs` : textes fixes des refus de contenu média, écriture EIO
  générique avec journal et ENOSPC toujours 507, sans bloc ni fichier partiellement conservé.
- `tests/architecture-f07.test.cjs` : panne de scellement ou de libération répondue comme erreur
  interne côté HTTP ; fichiers, état, journal de fermeture et récupération préservés.
- `tests/test_tv_control.py` : vrai transport HTTP local, 500 puis 200, même séquence, attente
  maîtrisée et comptage ; un 400 de contenu est abandonné après une seule tentative.
- `tests/tv-poll-controller.test.cjs` : vrai RemoteClient, réponses contrôlées et horloge manuelle,
  backoff du 500, absence de repli vers une vue inconnue et récupération.
