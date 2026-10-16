# 0034 — Les refus HTTP portent leur code dans le JSON ou un en-tête média

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/188-answer-every-refusal-of-the-server-with-its-stable-code-from.md`
- Statut : acceptée

## Contexte

Le transport omettait les codes des erreurs 400 et plusieurs refus directs n'avaient pas d'identité.
Le groupe sessions relaie aussi des Response du store : 416 vide avec Content-Range, 404 texte.
Les convertir en JSON changerait le contrat média de l'ADR 0010. L'ordre d'admission des ADR
0006, 0007 et 0021 doit rester identique.

## Décision

`server/http.cjs` possède les refus HTTP communs et la traduction des erreurs levées. Chaque refus
JSON porte `error` et `code`, quel que soit son statut, 400 compris. Les identités applicatives
déjà explicites sont reconnues par une liste finie, avec les constantes importées de leurs
émetteurs Codex et vision locale. `STORAGE_FULL` reste traduit en 507 `storage-full`. Une identité
inconnue, un errno ou un message seul reçoit `unclassified-error` et conserve son statut valide
ou le repli historique 400. Aucun message ne sert à classifier, aucun repli 500 n'est introduit.

Les groupes ingestion et sessions possèdent les codes de leurs refus directs. Le groupe sessions
classe les indisponibilités par `mediaReason`, sans changer les messages. Il ajoute
`X-TVLens-Error-Code: invalid-range` aux 416 et `X-TVLens-Error-Code: media-missing` aux 404 du store,
en conservant corps, statut et en-têtes. Le transport expose cet en-tête et ETag par CORS.
Le store, ses lectures et ses appelants Mac conservent leur contrat.

`runtime/errors.cjs` possède le constructeur `refusal(status, message, code)` extrait des vues.
Ses appelants gardent leurs règles. La traduction HTTP reste dans `server/`, hors du cœur.

## Alternatives écartées

- Reconnaître une phrase connue ou un errno comme refus métier : ces champs n'identifient pas le contrat applicatif.
- Transformer les refus binaires en JSON : cela modifierait les corps et le contrat de lecture des clips.
- Classer dès maintenant tous les refus du domaine : le catalogue des émetteurs relève de T201.

## Conséquences

Le transport fournit une identité sur ses deux formes de refus. Les attentes HTTP ajoutent le
code et les en-têtes ; les garanties d'ordre, déduplication, annulation et libération restent celles
des propriétaires existants. Le catalogue du domaine reste incomplet : `unclassified-error` et
le repli 400 sont provisoires ; T201 complète les identités, T052 décidera du repli inattendu.

## Protégée par

`tests/server-routes.test.cjs` utilise le vrai RemoteServer, les cinq vrais groupes et un runtime
contrôlé pour tous les refus directs et les codes levés, sous deux formulations par identité.
Un vrai LocalSessionStore prouve simultanément corps, Content-Range, code et CORS des 416/404,
ainsi que les octets des 200/206. Les suites d'ingestion, sessions, vues et timeline conservent
leurs assertions de comportement ; `node scripts/check.mjs` les joue en séquentiel.
