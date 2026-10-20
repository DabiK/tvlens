# Conservation des expériences GX10

Git conserve les sources, protocoles, configurations sans secret, corpus textuels, captures textuelles,
manifestes, empreintes et bilans. Les poids, images encodées, archives et copies générées de validation
restent sur disque ; ils ne sont ni effacés ni ajoutés à l'historique Git.

Le paquet complet de la nuit est conservé localement dans
`experiments/essais/2026-10-20-nuit-gx10/paquet-nuit.tar.gz`, avec son fichier SHA-256,
et sur le GX10 au chemin enregistré dans le `deployment.json` voisin.
Il contient les entrées visuelles nécessaires aux deux ablations et les sources effectivement déployées.
Les fichiers de scellement des kits décrivent l'ensemble complet, y compris les fichiers hors Git :
un clone seul ne suffit donc pas à vérifier ou exécuter une ablation visuelle. Restaurer le paquet complet
dans un dossier neuf, puis vérifier les empreintes avant toute exécution.

Les traces distantes du lot de référence restent sous
`/home/nvidia/tvlens-setup/reference-2026-10-20`. Les résultats de la nuit restent dans le dossier
`results` désigné par `deployment.json`. Le suivi les archive et les rapatrie après clôture.
Les preuves compactes de validation et les captures textuelles déjà produites sont versionnées.
Les dossiers détaillés de fixtures HTTP et de validation locale restent disponibles dans `preuves/`.

Les commits documentaires et expérimentaux sur le Mac ne mettent pas à jour le dépôt du GX10 pendant
les mesures : le code produit et les paquets distants restent figés. Ne pas appliquer un nouveau HEAD
à un protocole déjà scellé ; une évolution du code ou du protocole demande un nouvel enregistrement.

À la demande de Dabi, faire des commits locaux aux étapes significatives après contrôles adaptés.
Conserver les échecs et les limites ; ne jamais transformer une sortie structurellement valide en note
de pertinence. Les modifications préexistantes hors de ces essais restent séparées.
