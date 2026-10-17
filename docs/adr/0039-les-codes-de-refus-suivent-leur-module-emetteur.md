# 0039 — Les codes de refus suivent leur module émetteur

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/201-give-the-domain-and-adapter-refusals-their-stable-codes.md`
- Statut : acceptée

## Contexte

Le transport de l’ADR 0034 reconnaît des identités explicites, mais les validateurs du domaine et
plusieurs adaptateurs lèvent encore des erreurs sans code. Leurs refus normaux arrivent en
`unclassified-error`. L’ADR 0029 prévoit que les identités suivent les modules lors du rangement
par contextes ; un catalogue commun au cœur imposerait une nouvelle découpe.

## Décision

Chaque module qui émet un refus déclare et exporte ses constantes `TVLENS_*`, dont la valeur est
le nom. `core/shared/domain-error.cjs` fabrique seulement une erreur avec `code`, message et cause ;
il ne déclare aucun code et ne connaît aucun statut HTTP. Les adaptateurs déclarent leurs propres
identités. Les compositions continuent d’utiliser `runtime/errors.cjs` avec leurs codes explicites.

`server/http.cjs` importe les constantes des émetteurs et les traduit en codes publics stables.
Aucun lecteur ne compare un message pour classifier un refus. Les statuts propres aux branches
restent conservés, dont les 400 historiques, les 404/409 explicites, 503 et 507. Les réponses média
et leurs en-têtes restent ceux de l’ADR 0034.

Dans la bibliothèque, une faute système de lecture ou de `lstat` conserve son message public
et sa cause sans recevoir d’identité de contenu ou d’absence. ENOENT et les validations existantes
restent identifiés ; un échec d’analyse du store sans errno reste une archive invalide.

RemoteMedia distingue bloc invalide, image illisible et outil ayant refusé le contenu. Seule la
chaîne sharp jusqu’à `toBuffer` est enveloppée avec son message et sa cause. Le disque temporaire,
le lancement d’outil, l’échéance et l’annulation conservent leurs identités et leur priorité. Un
signal système sans annulation ni échéance reste non classé ; il ne prouve aucun refus de contenu.
Tous les travaux commencés restent attendus avant nettoyage.

## Alternatives écartées

- Un catalogue central du domaine : les codes doivent pouvoir suivre leur module sans redécoupage.
- Classifier par message : changer une formulation ne doit pas changer l’identité du refus.
- Envelopper tout l’assemblage comme contenu invalide : cela attribuerait des pannes de l’hôte au bloc.

## Conséquences

Les émetteurs sont vérifiables sans transport ; le serveur traduit leurs identités sans modifier
leurs règles. Les messages sharp et outil sont conservés provisoirement : leur assainissement
relève de T051. Le changement du repli inattendu vers 500 reste à décider dans T052.

## Protégée par

`domain-error`, `deep-ask-restore`, `session`, `session-timeline`, `transcription-language`,
`surveillance`, `session-library`, `session-runtime` et `remote-media` sous `tests/` prouvent les
identités à la source. `server-routes` et `server-ingest-path` exercent leur traduction devant de
vrais émetteurs. `architecture-f06` et `media-asr-options` gardent les preuves d’annulation,
d’attente et de nettoyage ; les suites de bibliothèque et de transport gardent les statuts,
messages et réponses binaires. Le contrôle complet les joue en séquentiel.
