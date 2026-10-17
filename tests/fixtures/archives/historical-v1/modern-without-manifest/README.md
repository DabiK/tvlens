# Variante modern-without-manifest

Retrait du manifeste ; ajout de trois paires à intervalle (moment-9 : 16000–24000, moment-3 et moment-4 : 24000–32000), une paire sans intervalle et deux demi-paires.

Transformation synthétique documentée, établie sur les lecteurs du commit `728d501`.
Source : `../../durable-v1/7dc1babe-e2b2-4199-9a4d-08811887ed9c/`, produite à `4dfc282`.
La source et ses sommes sont inchangées. Aucune capture d’une ancienne version déployée n’est revendiquée.

`expected.json` fixe séparément le snapshot lu et les attentes de restauration en mémoire, y compris toutes les clés de passage.
Sa provenance donne le SHA-256 du fichier de sommes source et la liste exacte des ajouts, retraits et modifications.
Les métadonnées non modifiées (conversation, surveillance, manifeste éventuel) sont celles du témoin ; les totaux du manifeste peuvent donc différer de l’inventaire physique.
Les dates sans manifeste viennent du mtime fixé à `2024-01-02T03:04:05.000Z` sur la copie de test.
SHA256SUMS couvre exactement tous les fichiers sauf lui-même. Ne pas régénérer ce témoin pour accompagner un futur écrivain.

## Ordre des passages

L'ordre numérique de récupération est 3, 4, 9 ; l'ordre temporel des passages est
1, 2, 9, 3, 4. Les passages 3 et 4 ont les mêmes bornes et sont départagés par leur
numéro.
