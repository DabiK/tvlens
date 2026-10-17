# Variante rolling-history

retention rolling et retentionMs 5000, sans manifeste ; premier passage dans history avec motif expired, fichiers volontairement conservés.

Transformation synthétique documentée, établie sur les lecteurs du commit `728d501`.
Source : `../../durable-v1/7dc1babe-e2b2-4199-9a4d-08811887ed9c/`, produite à `4dfc282`.
La source et ses sommes sont inchangées. Aucune capture d’une ancienne version déployée n’est revendiquée.

`expected.json` fixe séparément le snapshot lu et les attentes de restauration en mémoire, y compris toutes les clés de passage.
Sa provenance donne le SHA-256 du fichier de sommes source et la liste exacte des ajouts, retraits et modifications.
Les métadonnées non modifiées (conversation, surveillance, manifeste éventuel) sont celles du témoin ; les totaux du manifeste peuvent donc différer de l’inventaire physique.
Les dates sans manifeste viennent du mtime fixé à `2024-01-02T03:04:05.000Z` sur la copie de test.
SHA256SUMS couvre exactement tous les fichiers sauf lui-même. Ne pas régénérer ce témoin pour accompagner un futur écrivain.

Le runtime courant ouvert avec sa configuration par défaut expose until-deleted et retentionMs null. Ce constat est caractérisé, pas corrigé. Les fichiers du history sont volontairement présents pour prouver que history reste sans média ; ce n’est pas une archive réellement élaguée.
