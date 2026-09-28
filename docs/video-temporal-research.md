# Compréhension temporelle vidéo — recherche pour TVLens

Recherche du 28 septembre 2026. Sources primaires : articles, publications et pages des auteurs. Cette note propose une évolution ; elle ne décrit pas une fonctionnalité déjà implémentée. Aucun appel d’inférence payant effectué pour cette recherche.

## Conclusion

Le problème est bien identifié en recherche : compréhension temporelle fine, recherche de moments pertinents, questions sur des vidéos longues et compréhension en streaming. Il existe des méthodes réutilisables, mais pas de garantie générale de compréhension des actions.

Pour TVLens, expérimenter une observation légère couplée à un réexamen ciblé du média enregistré. Mesurer séparément la récupération du bon passage et la justesse de son interprétation.

## Ce que fait actuellement le code

`app/recording.js` collecte plusieurs images par segment, espacées de 5 secondes dans la configuration usuelle de 15 secondes, avec une image au démarrage. `adapters/openrouter.cjs` envoie les images du segment ensemble avec son audio. Ce n’est donc pas un appel indépendant par image. Le WebM enregistré conserve davantage de détails que ces images.

Ask peut récupérer les preuves échantillonnées de passages sélectionnés ; il ne décode pas encore leur WebM pour demander de nouvelles images plus rapprochées. La conservation brute sur cinq minutes rend cette extension possible, sous réserve que le passage ait été correctement capturé et soit encore disponible.

## Travaux retenus

### VideoAgent — 2024

Un agent décide alternativement de répondre ou de chercher des observations supplémentaires. La récupération est limitée à des segments temporels, puis les descriptions sont remises dans l’ordre. C’est une référence directement utile pour un orchestrateur indépendant du fournisseur. Les évaluations portent sur des vidéos disponibles, pas sur notre capture continue.

[Article complet](https://arxiv.org/html/2403.10517v1)

### VideoTree — prépublication 2024, version 2025

Organise les informations à plusieurs granularités et développe davantage les régions pertinentes pour la question. Il utilise un regroupement visuel et une sélection adaptative ; ce n’est pas simplement une détection de changements de scène. Pour notre POC, retenir le principe de recherche progressive sans reproduire tout l’arbre.

[Article complet](https://arxiv.org/html/2405.19209v3)

### ReViSe — CVPR 2026

Boucle de sélection de nouvelles images avec un état synthétique conservant observations, hypothèses et incertitudes. Les auteurs présentent une version sans modification des poids compatible avec des VLM via API, et une variante entraînée. Pour TVLens, séparer les observations des hypothèses et borner le nombre de réexamens.

[Méthode, expériences et code des auteurs](https://sparsevideounderstanding.github.io/)

### MovieChat+ — prépublication 2024, publication en ligne 2025

Mémoire courte et longue, avec consolidation de représentations visuelles et sélection guidée par la question. Il faut distinguer cette mémoire de tokens de notre historique de résumés textuels : les deux ne préservent pas les mêmes informations.

[Article](https://arxiv.org/abs/2404.17176)

### SAVEMem — prépublication mai 2026

Sépare construction de mémoire sans connaissance de la future question et récupération guidée par celle-ci. Trois niveaux de mémoire visuelle, budget borné et arbitrage entre présent et passé. Son protocole « pseudo-streaming » respecte le préfixe observé mais n’impose pas une contrainte de latence image par image. Il nécessite l’accès aux représentations internes : piste pour le local, pas simple option OpenRouter.

[Article complet et limites](https://arxiv.org/html/2605.07897v1)

### VideoTreeSearch — prépublication juillet 2026

L’agent peut approfondir une région, revenir au niveau supérieur ou explorer ailleurs avant de répondre avec un intervalle justificatif. Le point transférable est la possibilité de corriger une mauvaise localisation initiale. L’approche publiée comporte un entraînement ; notre boucle bornée serait une adaptation, pas une reproduction.

[Article complet](https://arxiv.org/html/2607.16189v1)

### TemporalBench et StreamingBench — 2024

TemporalBench évalue notamment l’ordre, la répétition et les détails du mouvement, donc les échecs que des questions purement descriptives masquent. StreamingBench place des questions à différents instants et distingue compréhension visuelle, audiovisuelle et contextuelle. Ils inspirent notre protocole ; leurs scores historiques ne permettent pas de classer notre modèle actuel.

[TemporalBench](https://arxiv.org/html/2410.10818v2) · [StreamingBench](https://arxiv.org/abs/2411.03628)

## Expérience proposée pour le POC

Les paramètres suivants sont des hypothèses d’ingénierie à évaluer, pas des valeurs universelles tirées des articles.

1. Garder l’observation légère et le tampon vidéo actuel.
2. Localiser un ou deux intervalles à partir de la question, des horodatages, du transcript et des observations.
3. Ajouter du contexte avant et après, y compris à travers une frontière de segment. Ne jamais dépasser l’instant observé auquel la question se rapporte.
4. Extraire initialement 1–2 images par seconde sur 10–20 secondes, plafonnées à 32 images, avec audio aligné. Adapter résolution et volume au budget du fournisseur.
5. Demander une description temporelle étayée et les éléments manquants. Distinguer succession observée et cause supposée.
6. Autoriser au plus un deuxième réexamen : densifier, élargir ou changer d’intervalle. Pour un geste très bref, 1–2 images/s peuvent rester insuffisantes ; inspecter plus densément la portion courte, jusqu’à la limite du média enregistré.
7. Répondre avec intervalle de preuve, ou indiquer le manque d’information. La confiance déclarée par le modèle ne suffit pas à valider une réponse.

Ne pas remplacer toute observation par une recherche guidée : avant la question, on ignore ce qui sera demandé. Une sélection par changement visuel peut aider, mais une action significative peut se produire dans un plan fixe. Pour compter des gestes répétés, inspecter toute la période concernée : quelques images « pertinentes » ne garantissent pas le compte.

## Frontières hexagonales proposées

- `TemporalEvidencePort` : récupérer des intervalles et leur disponibilité.
- `ClipInspectionPort` : examiner un extrait pour une question, retourner observations et preuves horodatées.
- Le cas d’usage du domaine borne les intervalles, le budget, les tours et les annulations ; il préserve la priorité Ask et la capture.
- Les adaptateurs assurent décodage du WebM et inférence API ou locale. Aucun type Electron ou format OpenRouter dans le domaine.

Ces noms sont indicatifs. Réutiliser ou étendre les ports actuels si cela évite un doublon. Ne pas faire dépendre le réexamen visuel du port de vérification Web/Codex : ce sont deux types de preuves différents.

## Validation avant adoption

Préparer environ 20 questions annotées avec réponse et intervalle attendu : état statique, ordre de deux actions, geste bref, répétition, action à cheval sur deux segments, référence ancienne, absence de preuve.

Comparer le système actuel, un réexamen dense fixe et un réexamen adaptatif borné. Mesurer justesse, récupération du bon intervalle, abstention correcte, coût par question, latence médiane/p95 et retard de la capture. Tester aussi sans audio puis avec audio pour identifier d’où provient l’amélioration.

Inclure des paires ouvrir/fermer, prendre/poser et une séquence inversée : si la réponse reste identique malgré l’inversion pertinente, le modèle peut se fier à l’apparence générale. Exécuter les tests de streaming sans accès aux images futures. Utiliser un budget API explicitement réservé à ces nouveaux essais avant de les lancer.

## Limites à conserver dans le produit

Un détail absent du média enregistré ou supprimé ne peut pas être récupéré par un meilleur résumé. Le réexamen ne résout pas les occultations, le flou ou toutes les erreurs du modèle. La fréquence et la résolution effectivement enregistrées limitent les actions analysables. Les gains et latences publiés ne se transfèrent pas directement à Gemini, OpenRouter ou GX10.
