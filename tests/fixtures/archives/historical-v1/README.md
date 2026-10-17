# Variantes historiques de session

Ces dix témoins complètent les huit formes demandées : non versionnée, history textuel,
absence de retention et manifeste, rétention moderne sans manifeste final, rolling avec
history indisponible, questions historiques, analyses interrompues et compteurs de nouvel essai.
Deux cas supplémentaires caractérisent la rétention inconnue et les compteurs invalides.

Ils sont des transformations explicites de durable-v1, jamais des captures revendiquées
d’une version déployée indisponible. Chaque sous-dossier conserve le même UUID source,
mais constitue une racine de bibliothèque indépendante. Les transformations ont été faites
une seule fois hors des tests, à partir des octets source et de la spécification des lecteurs ;
aucun runtime, convertisseur ou écrivain courant ne produit les attentes.
Les tests ne font que copier, lire et comparer ces fichiers figés.

La variante text-history reprend la forme historique à cinq clés (id, startMs, endMs,
status, summary), sans observation ni available. Son topicSummary non nul est porté par
le second passage, toujours dans segments.
La variante historical-questions reprend les données du test historique livré avec ADR 0038 :
question, citation, note d’occultation et métadonnées ingest. Le cas existant est conservé.
La variante modern-without-manifest récupère les identifiants 3, 4 et 9, puis place les
passages dans l'ordre temporel 1, 2, 9, 3, 4 : moment-9 (16000–24000) commence avant
moment-3 et moment-4 (24000–32000). À bornes égales, 3 précède 4. moment-40 n’a aucun intervalle ; moment-60 et
moment-70 sont respectivement une demi-paire vidéo et une demi-paire JSON. Ils sont comptés
comme trois orphelins. La reprise explicite, sur une autre copie, doit produire moment-71.
La variante interrupted-analysis garde les images du passage unreadable et une miniature
sans paire pour le passage missing ; aucune disponibilité vidéo n’en est déduite.

Les README locaux détaillent chaque transformation et les limites actuelles de rétention.
Chaque expected.json distingue le snapshot brut de bibliothèque et la restauration runtime,
ainsi que l’inventaire physique des totaux du manifeste conservé. Les clés de passage sont
comparées intégralement, dont topicSummary, horodatages, statuts, erreurs et miniature.
Les fournisseurs sont interdits et l’index désactivé pendant la lecture ; aucune analyse,
écriture ou reprise n’est autorisée par une simple ouverture/fermeture.

Les SHA256SUMS locaux couvrent les octets et la provenance de chaque variante. Le SHA256SUMS
parent couvre aussi ces fichiers de sommes et le présent document. durable-v1 et ses sommes
restent intacts. Aucun générateur de référence n’a été relancé. Le résumé vivant et une
archive réellement élaguée restent hors de ce corpus.
