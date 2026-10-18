# 0051 — Les voies de perception possèdent leurs files et une retenue générique

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/214-extract-the-memory-perception-lanes.md`
- Statut : acceptée

## Contexte

`WatchSession` possédait les passages, les deux files, leurs appels et la traduction de l'activité
questions en retenue vision. Les ADR 0029 et 0044 demandent un propriétaire dans la Mémoire,
sans dépendance vers un autre contexte. Les publications de versions des ADR 0045 et 0050
et les garanties de fermeture doivent survivre au déplacement.

## Décision

`PerceptionLanes`, dans `core/memory/lanes.cjs`, possède deux FIFO privées de références,
un appel au plus par voie, leur annulation, le transfert, les bornes et les décisions de perte.
Il reçoit horloge, ports de lecture et perception, lectures de disponibilité et de fin,
contexte et callbacks de comptabilité, version, publication et sauvegarde. Aucun objet hôte
ou session ne lui est transmis. L'entrée `core/memory/index.cjs` expose ce constructeur à la racine.

La commande `setVisionHeld` reçoit une politique générique. La racine conserve `setQuestionPending`,
sa publication idempotente et sa microtâche liée à cette instance (ADR 0035). Elle traduit à un seul
endroit activité et `visionDuringAsk`, y compris dans `closeIntake`. Le verrou `closing` serveur
reste chez son hôte. La cause interne `held` devient `asking` à la frontière de versionnement ;
`visionSkippedAsking`, `visionSkipReason` et `visionBlockedMs` gardent leur forme historique.
La durée ne compte que la retenue seule, se termine au relâchement, au dernier retrait ou à la fermeture.

La racine garde identités, passages, transitions d'expiration/restauration, compteurs historiques,
publication des faits et persistance. `remove` retire un passage des deux files et indique s'il
attendait encore l'audio ; l'élagage n'accède plus aux files. Snapshot, consultation et getter
historique `running` passent par des comptes détachés, sans exposer les références des voies.

La transcription publiée garde sa place devant les audios écartés. Aucun niveau d'attente
supplémentaire ne sépare résultat visuel et drainage suivant. L'unique nouvel essai de l'ADR 0008
reste en ligne, après relecture et double vérification, sans perte intermédiaire ; les codes stables
de l'ADR 0031 restent seuls décisifs. Une lecture média qui revient après le début de fin ne lance
plus de fournisseur. Une réponse après fermeture ne produit ni enrichissement ni publication.

Les ADR 0002/0003 conservent leurs barrières et l'ordre publication puis sauvegarde ;
les ADR 0006/0023 conservent l'atterrissage des écritures admises et l'ADR 0004 ses baux retenus.
La fermeture du propriétaire ne remplace aucune étape du protocole de cycle de vie (ADR 0030).
Les notifications restent isolées, sans porter l'obligation de sauvegarde (ADR 0032).

Deux exceptions exactes relient temporairement `lanes.cjs` à `core/passage-text.cjs`, destiné
à `core/shared/`, et `core/topic-summary.cjs`, destiné à `core/memory/`. Elles disparaîtront lors
de ces rangements. La sous-zone existante et la permission de `core/session.cjs` suffisent ;
aucune permission générale ni accès global au temps n'est ajouté.

## Alternatives écartées

- Donner la session au propriétaire : permettrait de reprendre ses files et ses règles de question.
- Recopier les files ou déduire leurs comptes des statuts : divergerait pendant un appel, une expiration ou une fermeture.
- Extraire le nouvel essai dans une attente asynchrone supplémentaire : modifie l'ordre des transferts sous surcharge.
- Déplacer déjà la traduction dans le runtime : la migration de coordination appartient au lot suivant.

## Conséquences

Le traitement possède un seul état privé et les mêmes comptes aux deux frontières de lecture.
Le format disque, les causes publiées et les hôtes restent compatibles. La rétention historique
et les autres helpers de Mémoire restent à leur emplacement actuel ; aucune voie série ne revient.
Le code extrait n'a aucune suppression ESLint ; celles devenues inutiles dans la session sont élaguées.

## Protégée par

`split-perception`, `session-latency` et `architecture-f08` conduisent ingestion, indépendance,
ordre, surcharge, politique et unique nouvel essai. Leurs lectures de files privées utilisent les
comptes et passages publiés. `memory-lanes` isole le retrait explicite et sa fin de mesure.
`watch-session-ending` couvre aussi les lectures média retenues au début de fin.
`session-events`, `events`, `memory-view`, `capture-intake` et `session-lifecycle` protègent versions,
isolation, atterrissage et sauvegardes. Les gardes protègent l'entrée publique, les exceptions exactes,
l'absence de vocabulaire étranger dans les voies et le stock de temps inchangé.
Le contrôle complet reste `node scripts/check.mjs`, en séquentiel.
