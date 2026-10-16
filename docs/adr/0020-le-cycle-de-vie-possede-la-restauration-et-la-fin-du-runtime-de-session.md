# 0020 — Le cycle de vie possède la restauration et la fin du runtime de session

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/173-move-the-restore-and-close-of-a-session-runtime-into-their-own-module.md`
- Statut : acceptée

## Contexte

Après la séparation des fournisseurs et du manifeste (ADR 0019), `runtime/session-runtime.cjs`
réunissait encore composition, restauration et fermeture dans 417 lignes physiques.
Les deux hôtes utilisent cette façade ; les refus disque et les écritures déjà admises imposent
de conserver les ordres des ADR 0002, 0003 et 0005, ainsi que le protocole des hôtes de l'ADR 0007.

## Décision

`runtime/session-lifecycle.cjs` reçoit les objets construits, le propriétaire du manifeste et les
faits d'archive validés. Sa fabrique restaure l'inventaire puis `WatchSession`, sans écriture ni
analyse. Son instance possède seule la promesse `ending`, la confirmation `archived` de cette vie,
le refus `unconfirmed` et les diagnostics `closeErrors`, dont elle rend une copie.

Des méthodes distinctes portent pause, reprise, libération des ressources, purge, confirmation,
archivage et scellement. La révocation précède toute attente ; les stockages admis atterrissent
avant la fermeture du cœur. Toutes les ressources sont tentées, puis viennent `flush` et le
manifeste final. Seul `archive` transmet le refus disque ; un nouvel essai réécrit l'état sans
refermer les ressources. Le scellement du store et des vecteurs précède les écritures finales.

`createSessionRuntime` conserve validations avant effet, identité, composition, calcul de stockage
et façade publique. Il construit l'horloge restaurée en pause et remet au manifeste une lecture
différée de la confirmation détenue par le cycle de vie. Aucun état de fin n'est recopié dans la
composition. `session-closing.cjs` garde le protocole et les politiques des deux hôtes.

## Alternatives écartées

- Déplacer le bloc entier dans une grande fonction : l'ordre resterait difficile à tester et à lire.
- Déduire la confirmation du manifeste adopté : une archive reprise hériterait de la vie précédente.
- Réunir cycle des ressources et fin des hôtes : leurs responsabilités et leurs ordres restent distincts.

## Conséquences

La restauration et les barrières de fin se testent par le module sans démarrer un hôte ni appeler
un fournisseur. La composition passe à 292 lignes physiques ; le nouveau propriétaire en compte 185.
Les formats disque, transitions du domaine et politiques de rétention conservent leurs contrats.

## Protégée par

`tests/session-lifecycle.test.cjs` utilise le vrai cœur, l'horloge et le manifeste avec un store mémoire
et des ressources différées. Les tests durables, de suppression, de révocation et les bancs IPC/HTTP
conservent leurs assertions et vérifient les vrais stores temporaires. `node scripts/check.mjs`
exécute les tests en séquentiel.
