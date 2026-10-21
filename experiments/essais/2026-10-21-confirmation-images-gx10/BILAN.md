# Bilan technique — cinq contre trois images sur blocs figés

Le 21 octobre 2026, 24 blocs pré-enregistrés (12 Kennedy, 12 Spring) ont été soumis au même composant perception de TVLens en ordre A/B/B/A. A transmet les cinq images du bloc ; B transmet les images 0, 2 et 4, sans changer le modèle `gemma3:4b`, le gabarit de consigne ou l'ASR source. Les quatre parcours ont terminé **96/96 cas** en 459,5 s. Les sorties et les 70 fichiers de leur [sceau SHA-256](rapatriements/confirmation-images-20261021T082000Z/results/integrite.json) ont été revérifiés ; les trois verrous étaient libres à la fin, aucun replay n'est resté actif. Le sceau lui-même vaut `934d12b8ea2b3a60d5b29bba1dd22ee048a8f53959a6c3cc65fda08b9141c924`.

| Vidéo | Passage | Temps fournisseur p50 / p95 par bloc | Préremplissage p50 | Génération p50 | Cas réussis |
| --- | --- | ---: | ---: | ---: | ---: |
| Kennedy | A1, 5 images | 5,656 / 6,294 s | 2,929 s | 2,574 s | 12/12 |
| Kennedy | B1, 3 images | 4,263 / 4,834 s | 1,813 s | 2,314 s | 12/12 |
| Kennedy | B2, 3 images | 2,672 / 3,182 s | 0,059 s | 2,458 s | 12/12 |
| Kennedy | A2, 5 images | 5,645 / 6,282 s | 2,920 s | 2,566 s | 12/12 |
| Spring | A1, 5 images | 6,009 / 6,738 s | 2,923 s | 2,950 s | 12/12 |
| Spring | B1, 3 images | 4,451 / 4,867 s | 1,811 s | 2,538 s | 12/12 |
| Spring | B2, 3 images | 2,626 / 2,891 s | 0,058 s | 2,450 s | 12/12 |
| Spring | A2, 5 images | 6,006 / 6,704 s | 2,916 s | 2,948 s | 12/12 |

Sur les **48 paires bloc/passage**, B est plus rapide que A. La différence médiane appariée B−A du temps fournisseur est de −1,556 s pour Kennedy et −1,534 s pour Spring au premier passage ; elle atteint −3,197 et −3,425 s au second. Les temps client de requête donnent des différences voisines. A évalue environ 1 980 jetons d'entrée par cas contre 1 426 pour B. Le deuxième B bénéficie d'un préremplissage d'environ 0,06 s, alors que A2 reste vers 2,9 s, malgré le retour à A : l'effet de l'ordre/cache est majeur. Le gain conservateur de premier passage est donc le signal le plus utile ; même lui reste une comparaison de piles et de consignes à images différentes, pas un gain garanti du flux complet.

La cadence du parcours entier de 24 cas est de 0,168 cas/s pour A1, 0,224 pour B1, 0,370 pour B2 et 0,168 pour A2. Chaque cas crée un agent de perception isolé ; cette cadence ne représente ni le visionnage continu de TVLens, ni l'audio, ni la réponse aux questions. Le premier token n'est pas mesuré. Les [96 mesures brutes](rapatriements/confirmation-images-20261021T082000Z/results/mesures.json), [96 sorties à annoter](rapatriements/confirmation-images-20261021T082000Z/results/a-annoter.json), [quatre `campaign.json`](rapatriements/confirmation-images-20261021T082000Z/results/) et les [48 différences appariées](../2026-10-21-consolidation-gx10/bilan.json) restent séparés des interprétations.

**La pertinence n'est pas notée.** Il faut comparer à l'aveugle OCR, actions brèves, faits utiles et inventions pour chaque bloc, notamment les fenêtres de `spring-04`, `spring-06` et `kennedy-06`. Trois images peuvent être plus rapides tout en perdant l'unique preuve d'une réponse. `readyForScoring=false` reste en vigueur jusqu'à validation des fiches et de l'annotation ; aucun bras n'est déclaré gagnant pour le produit.
