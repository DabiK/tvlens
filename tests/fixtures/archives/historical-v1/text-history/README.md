# Variante text-history

Remplacement du premier passage par un history textuel à cinq clés (id, startMs, endMs, status, summary), sans observation ni available ; retrait de sa paire et de sa miniature ; topicSummary explicite sur le second passage.

Transformation synthétique documentée, établie sur les lecteurs du commit `728d501`.
Source : `../../durable-v1/7dc1babe-e2b2-4199-9a4d-08811887ed9c/`, produite à `4dfc282`.
La source et ses sommes sont inchangées. Aucune capture d’une ancienne version déployée n’est revendiquée.

`expected.json` fixe séparément le snapshot lu et les attentes de restauration en mémoire, y compris toutes les clés de passage.
Sa provenance donne le SHA-256 du fichier de sommes source et la liste exacte des ajouts, retraits et modifications.
Les métadonnées non modifiées (conversation, surveillance, manifeste éventuel) sont celles du témoin ; les totaux du manifeste peuvent donc différer de l’inventaire physique.
Les dates sans manifeste viennent du mtime fixé à `2024-01-02T03:04:05.000Z` sur la copie de test.
SHA256SUMS couvre exactement tous les fichiers sauf lui-même. Ne pas régénérer ce témoin pour accompagner un futur écrivain.

## Forme historique

Le history reprend la forme minimale établie dans `tests/session-durable.test.cjs` :
`{ id, startMs, endMs, status, summary }`, sans observation ni drapeau available.
Il reste consultable comme texte ; le runtime lui ajoute expired et une miniature
indisponible. Le second passage conserve un topicSummary non nul, avec ses propres
identifiants et bornes.
