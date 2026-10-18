# 0047 — session.json porte un format et une version lus par un convertisseur de la Mémoire

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/208-read-and-write-session-archives-through-a-versioned-converter.md`
- Statut : acceptée

## Contexte

`WatchSession.persist()` sauvegardait le snapshot publié tel quel, sans format ni version. Sa forme était
validée par `restorable` (`core/session.cjs`), appelé de trois endroits, et le seul marqueur de version
était implicite : l'absence de `retention`. Un document d'un autre format ou d'une version future aurait
été lu comme une archive historique. Le corpus historique (ADR 0029/0030) doit rester ouvrable sans
réécriture ni reprise d'analyse.

## Décision

`core/memory/archive.cjs`, publié par `core/memory/index.cjs`, porte le seul décodage et la seule
validation de forme de `session.json`. `toArchive(model)` rend `{ format: 'tvlens-viewing-memory',
version: 1, ...model }` : une enveloppe superficielle qui garde toutes les clés du modèle et de chaque
passage, sans liste blanche ; retirer un champ du disque demande une version 2 et son témoin.
`persist()` est son seul appelant ; le snapshot publié, le fil `/v1` et le store restent sans marqueur.
Le manifeste garde son format distinct `tvlens-session`.

`fromArchive(document)` rend un document sans aucun des deux marqueurs exactement tel quel, après la
validation historique. Un document aux deux marqueurs exacts est validé de même et rendu sans eux, sans
muter son entrée. Tout le reste est refusé avec `TVLENS_ARCHIVE_INVALID` et « Archive illisible. » : un
format étranger, le format du manifeste, une version future, non entière ou chaîne, un seul marqueur.
Les marqueurs se reconnaissent à la présence de la clé, pas à sa valeur.

La bibliothèque décode avant le contrôle d'identité et la récupération des paires (`read` refuse, `list`
donne `unreadable`). `createSessionRuntime` décode avant DiskGuard et le store, puis traduit le code en
`refusal(400, …, 'invalid-archive')`. `restore()` du cœur décode aussi. Un refus n'écrit rien. La
constante de code vit dans `core/memory/archive.cjs` ; la bibliothèque la réexporte et le serveur
garde sa traduction. La garde ouvre `core/memory/**` aux adaptateurs, par son entrée publique seulement.

La restauration effective garde ses propriétaires : récupérations et orphelins dans la bibliothèque,
adoption dans le cycle de vie, disponibilité, interruptions, compteurs, séquence et lecture seule dans
le cœur. Le marqueur implicite `retention === undefined` du cœur et le classement `legacy` de la
bibliothèque ne changent pas. La version 1 n'ajoute aucune règle sur `retention`.

## Alternatives écartées

- Valider le format dans `LocalSessionStore` : le store écrirait et lirait du domaine.
- Une copie profonde ou une liste de clés dans `toArchive` : coût par état en attente (ADR 0003) et
  perte silencieuse d'un champ ajouté plus tard.
- Normaliser les documents historiques au décodage (rétention, champs manquants) : change ce que la
  restauration déduit de l'absence de `retention` et ce qu'affichent les témoins.
- Un code d'erreur propre à la Mémoire : demande une traduction de plus pour le même refus.

## Conséquences

Une future version se déclare dans un seul module, avec son témoin, et une archive qu'on ne sait pas
lire est refusée au lieu d'être interprétée. Une version antérieure de TVLens ignore les deux marqueurs :
elle ouvre une v1 comme une archive historique. Sans contrôle de version, elle lirait de même une future
v2 comme historique tant que sa forme passe la validation de l'époque, et ne la refuserait que par sa
forme. Un refus de version future affiche le même message qu'une forme invalide. Le runtime décode
puis le cœur décode de nouveau le modèle déjà décodé, sans effet. La rétention et son élagage restent
à T215 et T223.

## Protégée par

`tests/session-archive.test.cjs` : fonctions pures, refus d'enveloppe et aller-retour de chaque
`session.json` du corpus. `tests/archive-compat.test.cjs` rejoue le corpus historique sans changer ses
octets et relit la v1 écrite à la reprise. `tests/session-runtime.test.cjs` écrit une session neuve sur
disque et compare le JSON écrit au snapshot ; session-library, session-durable et server-routes
refusent les enveloppes sans écriture. `tests/architecture.test.cjs` garde la zone et ses lecteurs.
