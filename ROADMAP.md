# TVLens — Roadmap proposée

**33 tickets de cadrage initial archivés.** Le POC dispose désormais de capture, chat sourcé, réexamen, MCP, overlay, file de questions, marque-pages, recherche et Auto. Les actions **Explique ce moment**, **J’ai décroché** et le récapitulatif progressif **Jusqu’ici** sont aussi intégrés. Voir [les fonctions de visionnage](docs/viewing-upgrade.md), [les actions immédiates](docs/friction-latency.md) et [le récapitulatif](docs/living-recap.md). La qualité du récapitulatif avec le fournisseur réel reste à valider. Les archives ci-dessous ne sont pas un état de livraison.

- [Roadmap complète, découpage numéroté et critères de chaque ticket](docs/roadmap-original.md)
- [Brouillons structurés pour publication](docs/ticket-drafts-original.json)
- [Contrat produit validé et décisions de plateforme](docs/product-decisions-original.md)

| Livraison | Tickets |
| --- | --- |
| Dossier ASUS prêt tôt, preuve réelle ajoutée ensuite | 01, 21 |
| Capture et première réponse sur Mac | 02, 03, 17 |
| Mémoire audiovisuelle et limites honnêtes | 04–08 |
| Vérification, Auto, overlay et suivi continu | 09–14, 16, 20 |
| App Mac complète : voix, sessions, installation, reprise | 15, 18, 19, 32 |
| Moteur portable et second écran web | 22, 23 |
| Exécution et benchmark sur GX10 | 24–28 |
| Expérience TV par caméra/micro | 29–31 |
| Distribution Mac signée pour pilotes | 33 |

Le projet complet n’est pas planifié sur six jours. La trajectoire avant candidature privilégie le dossier, une capture réelle, une réponse contextualisée puis le rappel du passé ; le reste renforce la preuve selon l’avancement. Les prérequis matériels et les blocages entre tickets sont détaillés dans la proposition.

Les brouillons de tickets historiques sont conservés comme plan de référence ; ils ne constituent pas une publication d’issues ni une promesse de livraison des étapes matérielles.

## Évolution demandée — recherche par embeddings multimodaux (hors tranche actuelle)

**Demande utilisateur :** ajouter à la roadmap uniquement des embeddings audio,
image et texte dans un espace commun, pour retrouver un passage par son contenu
sonore autant que par sa transcription ou sa description visuelle.

- Évaluer un modèle Google omni/multimodal comme candidat ; vérifier son support
  réel des modalités et de la recherche croisée, son exposition via OpenRouter,
  ses tarifs, sa latence et ses conditions de traitement avant sélection.
- Indexer des extraits audio et visuels horodatés en plus du texte, derrière les
  ports de recherche et d’embeddings existants, sans dépendance du domaine au modèle.
- Préserver session, début/fin, modalité et disponibilité du média dans les résultats.
- Comparer à la recherche textuelle actuelle sur des sons non transcrits : bruit
  de verre, musique, applaudissements, sonnerie, puis recherches texte → audio.
- Vérifier que les embeddings sont réellement comparables entre modalités ; ne
  pas mélanger des vecteurs issus d’espaces ou versions incompatibles.
- Définir séparément budget et corpus avant les essais ; aucun appel ni changement
  de modèle autorisé par ce ticket seul.

**Critère de livraison :** retrouver des passages identifiables par leur audio
non verbal et fournir des timestamps vérifiables, avec comparaison mesurée au
baseline textuel. Ne fait pas partie du réexamen vidéo/MCP actuellement en cours.
