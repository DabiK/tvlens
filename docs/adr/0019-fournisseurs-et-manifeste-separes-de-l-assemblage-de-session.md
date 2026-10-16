# 0019 — Les fournisseurs et le manifeste ont leurs fabriques hors de l'assemblage de session

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/172-build-the-session-providers-of-createsessionruntime-outside-it.md`
- Statut : acceptée

## Contexte

`runtime/session-runtime.cjs` mêlait l'assemblage de la session, les choix des fournisseurs et la
politique de manifeste dans 579 lignes physiques. Les deux hôtes utilisent cette même composition.
Les ADR 0002, 0003 et 0005 imposent la confirmation finale sur disque, une publication indépendante
des écritures et la révocation de l'inspecteur, y compris de son cache.

## Décision

`runtime/session-providers.cjs` possède quatre fabriques exportées : `createSessionTranscriber`,
`createSessionInspection`, `createSessionPerception` et `createSessionIndex`. Elles reçoivent les
options et objets partagés explicitement, et acceptent des constructeurs ou fabriques de remplacement.
Elles réutilisent les fournisseurs simulés existants ; charger le module ne construit aucun fournisseur.
Le helper `localVlmAgent` conserve les options locales. L'inspecteur révocable enveloppe le cache,
conformément à l'ADR 0005. L'index possède aussi la sélection bornée des passages publiés.

`runtime/session-manifest.cjs` possède la construction et l'écriture du manifeste, la cadence monotone
de 30 secondes et les 100 dernières captures. Il reçoit les deux horloges, le store, les miniatures,
l'identité, la restauration et deux lectures explicites des faits de session : lecture seule et fin
confirmée de cette vie. Les écritures courantes absorbent les refus ; l'écriture finale les transmet.

`createSessionRuntime` garde seul le fait de fin confirmée. Comme dans l'ADR 0002, il ne le confirme
qu'après la barrière des états et l'écriture finale réussie. Le module de manifeste ne le déduit jamais
du manifeste d'une vie antérieure. La publication ne retient pas le cœur, conformément à l'ADR 0003.
Le calcul de stockage, `WatchSession`, la restauration et les méthodes de fin restent dans le runtime.
Sa façade conserve ses objets, résultats et constantes exportées pour les deux hôtes.

## Alternatives écartées

- Déduire la fin confirmée du manifeste enregistré : une vie reprise hériterait du fait de la précédente.
- Déplacer aussi la restauration et la fermeture : ces responsabilités appartiennent au découpage suivant.

## Conséquences

Les branches de construction et la politique de manifeste se testent sans fournisseur réel ni disque.
Le protocole de fin conserve ses dépendances et son propriétaire ; son découpage reste ouvert.

## Protégée par

`tests/session-providers.test.cjs`, `tests/session-manifest.test.cjs`, les tests durables, disque,
révocation et les bancs IPC/HTTP inchangés ; `node scripts/check.mjs` les exécute en séquentiel.
