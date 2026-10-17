# Archive réellement élaguée

Témoin produit le 17 octobre 2026 sur le code produit `5e3f479`, avant retrait des réglages
et changement de restauration. Commande manuelle, jamais exécutée par les tests :

```sh
node scripts/fixtures/write-pruned-archive.cjs tests/fixtures/archives/pruned-v1
```

Le générateur compose directement `WatchSession`, `LocalSessionStore`, les miniatures et le
manifeste partagés. La fenêtre de 12 000 ms est injectée dans le cœur historique : aucun réglage
d'hôte, variable d'environnement, Electron ou fournisseur réel. Quatre passages proviennent du
clip `tests/fixtures/ffmpeg-webm-head.webm` et d'une miniature du corpus durable-v1.
Les réponses de perception et les deux formes de question sont synthétiques et documentées dans
le générateur ; ce témoin ne provient pas d'une installation déployée.

À 16 000 ms, `prune()` a réellement supprimé les paires de moment-1 et moment-2 et déplacé leurs
textes dans history. moment-2 conserve son échec audio/vision et son trou d'analyse. Les compteurs
et révisions viennent des passages réellement traités. Après sauvegarde, barrière et manifeste
final, les deux fichiers média de moment-3 ont été retirés explicitement pour simuler une paire
perdue : le document la croit encore présente, la restauration doit dire `missing`.
La paire de moment-4 et les quatre miniatures restent intactes. Le manifeste décrit donc deux
médias stockés, l'inventaire physique un seul ; leurs octets sont comparés séparément.

L'ouverture doit publier until-deleted/null sans réécrire rolling/12000 sur disque et sans
rendre disponibles les médias absents. La reprise doit ajouter moment-5 et conserver les anciens
textes, questions, motifs, trous et compteurs. expected.json spécifie ces faits indépendamment du
lecteur ; SHA256SUMS couvre tous les fichiers sauf lui-même. Ce témoin ne se régénère pas pour
accompagner une évolution du produit. durable-v1 et historical-v1 restent inchangés.
