# 0055 — La Mémoire conserve les passages sans balayage temporel

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/223-remove-the-rolling-pruning-from-the-viewing-memory.md`
- Statut : acceptée ; complète l’ADR 0048

## Contexte

Les hôtes conservaient déjà les médias jusqu’à suppression explicite. La racine Mémoire portait
encore une durée, un balayage après ingestion et une file de suppressions à retenter. Les simulateurs
injectaient cette durée ; plusieurs preuves indépendantes utilisaient l’expiration comme préparation.
Les voies de perception et leurs files appartiennent désormais au propriétaire de l’ADR 0051.

## Décision

`WatchSession` ne possède plus de durée active, `prune`, `pruneChain` ni `unremoved`. Une ingestion
attend toujours son média et sa miniature, puis rend son identifiant sans balayage. Aucun passage
ne passe automatiquement dans `history`. Les analyses et miniatures tardives enrichissent le passage
conservé. Le propriétaire des voies et ses règles de nouvel essai restent identiques.

Le snapshot, la consultation de Mémoire, le statut de publication et les lignes des deux hôtes
exposent constamment `retention: 'until-deleted'` et `retentionMs: null`. Le convertisseur historique
reste inchangé : l’absence de retention, les anciens motifs et les compteurs conservent leur sens.
Les listes historiques sont lues par restauration ; elles ne sont plus produites par une horloge.

Les scénarios de flux utilisent tous la conservation durable. Le scénario d’expiration disparaît ;
le corpus figé pruned-v1 prouve encore recherche textuelle, indisponibilité et reprise. Le banc
`bench-perceived` utilise `durable` par défaut et offre `historical-pruned` comme disposition
synthétique explicite, indépendante de toute configuration du cœur. Le générateur du témoin
pruned-v1 reste un outil historique, à utiliser avec le code producteur documenté dans le corpus.
Aucun corpus ni somme n’est régénéré.

Les rafraîchissements d’horloge du Mac et les occasions d’écriture du manifeste sont conservés.
La notification de fin de balayage disparaît avec lui : une ingestion ne produit plus cette émission
supplémentaire. Les sauvegardes, baux jusqu’au retour effectif, suppression explicite et scellement
conservent leurs propriétaires et leurs barrières. Le disque plein suspend l’admission.

## Alternatives écartées

- Garder une méthode de balayage vide : laisserait croire qu’un appel temporel gouverne la conservation.
- Reconstituer les expirations dans les tests courants : réintroduirait la politique retirée.
- Déduire la disposition du banc de mesure d’un champ interne : confondrait un jeu historique et une politique active.

## Conséquences

Les médias restent présents quelle que soit l’avance de temps, en capture comme en pause. Les anciens
médias absents ne sont jamais déclarés retrouvés. Les textes et identifiants historiques restent
consultables et la capture reprend après leur numérotation.

Huit cas dédiés au seul élagage sont retirés, sans suppression de fichier de test. Le journal donne
leurs noms et les garanties déplacées. Les cas mixtes restent actifs ; deux nouvelles preuves
couvrent la conservation des octets et l’enrichissement avec vision en attente. Le seul plancher
produit baisse de huit, indépendamment de ces ajouts. Les suppressions ESLint inutiles sont élaguées.

## Protégée par

`session-durable` compare inventaires, octets et disponibilités après ingestion, grandes avances,
pause, reprise et réouverture avec une option historique. `split-perception` garde paroles et
résultats des deux voies, et refuse les preuves issues d’un placeholder historique.
`session-latency` restaure les horodatages et compteurs historiques, conserve les retenues et miniatures.
`session-events` garde les versions, pertes de voie, faits avant publication et sauvegardes retenues.
`memory-lanes` exerce le refus d’un nouvel essai avant et après relecture lorsque le média manque.
`archive-compat`, `remote-server` et `architecture-f10` gardent le corpus figé et le 410 historique.
Les contrôles Mac/headless, de baux, de stockage plein, de coalescence et de scellement restent exécutés.
`stream-simulation` conduit cadences, surcharge et deux heures de recherche sans fenêtre temporelle.
