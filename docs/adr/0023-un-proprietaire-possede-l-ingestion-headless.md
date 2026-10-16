# 0023 — Un propriétaire possède l'ingestion headless dès l'admission

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/179-move-headless-capture-admission-into-one-intake-owner.md`
- Statut : acceptée

## Contexte

`HeadlessRuntime` réunissait le cycle de vie de l'hôte et la possession des blocs HTTP dans
864 lignes physiques. Une préparation annulée peut survivre à plusieurs fins de session ;
son identifiant peut même être rouvert et repris. Les décisions de l'ADR 0006 et l'ordre de
fermeture de l'ADR 0007 doivent rester vrais après extraction.

## Décision

`createCaptureIntake`, dans `runtime/capture-intake.cjs`, possède seul les ensembles `admitted`
et `ingestions`, les opérations et les sept méthodes `admit`, `accept`, `current`, `finish`,
`cancelPreparations`, `settleIngestions` et `ingest`. Il reçoit les lectures de la session,
de l'époque, de la transition et du stockage, ainsi que la publication. L'hôte conserve les
changements d'époque, les transitions et les étapes du protocole partagé. Sa façade délègue
et ses getters exposent les mêmes ensembles, sans les recopier. `READ_ONLY` reste réexporté.

La validité compare signal, objet session et époque ; son contrôle et le début du stockage
restent dans le même pas synchrone. Un stockage commencé est attendu en entier. Les préparations
annulées restent possédées jusqu'au `finish` du transport, même après la borne, et chaque fin
suivante ou arrêt sans session les attend de nouveau sans lever leur signal une seconde fois.
La pause disque, horloge comprise, et la publication restent celles de la session courante.

La borne reste de 1000 ms par défaut et conserve le repli pour une option nulle. Le module reçoit
`setTimer` et `clearTimer` ; chaque attente libère sa minuterie, au règlement comme au dépassement.
L'hôte les câble avec `setPreparationTimer` et `clearPreparationTimer` : les options historiques
`setTimer` et `clearTimer` restent réservées au checkpoint des questions (ADR 0015). Sans injection,
les fonctions globales sont appelées à l'utilisation.

Le transport garde sa déduplication, sa séquence et son créneau. Il prend l'opération avant
assemblage, marque seulement une opération courante et la rend au même `finally` que son créneau.
La déconnexion du client n'annule rien. Toutes les décisions de l'ADR 0006 sont conservées.

## Alternatives écartées

- Recopier les ensembles dans l'hôte : deux propriétaires pourraient diverger après une fin.
- Renouveler l'époque dans le module : le cycle de vie de l'hôte décide déjà des captures.
- Partager les minuteries du checkpoint : cela changerait le domaine de temps de ses bancs HTTP.

## Conséquences

L'ingestion se vérifie sans HTTP ni fournisseur, avec des écritures différées et une horloge
manuelle. L'hôte conserve son cycle de vie ; cette extraction ne vise aucun seuil global de taille.
La borne reste un plafond d'attente et ne garantit ni nettoyage ni libération du créneau.

## Protégée par

`tests/capture-intake.test.cjs` conduit refus, identité, annulation, bornes répétées, stockage
média et miniature, pause disque et câblage des minuteries de fermeture. Les assertions existantes
de `architecture-f06`, `architecture-f07`, `server-ingest-path`, `timeline-server` et
`server-sessions` restent inchangées. `node scripts/check.mjs` les joue en séquentiel.
