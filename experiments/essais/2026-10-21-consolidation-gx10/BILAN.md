# Bilan du 21 octobre — cinq points de consolidation GX10

Les cinq chantiers du [plan](README.md) ont produit des données ou des livrables vérifiés. Les essais sur GPU sont clos et leurs sorties brutes restent conservées. **Aucune variante ne peut encore être déclarée meilleure sur le rapport pertinence/vitesse** : les six fiches de référence sont provisoires (`readyForScoring=false`), les corrections annoncées ne sont pas encore intégrées, et les réponses doivent être notées contre les vidéos. Les chiffres ci-dessous décrivent des délais et une couverture, pas une justesse.

| Point | Livrable et constat | Limite décisive |
| --- | --- | --- |
| **1. Références et annotation** | [Six fiches et 30 questions gelées](../2026-10-21-relecture-fiches-gx10/README.md) avec SHA ; 90 réponses de référence préparées à l'aveugle. Un audit indépendant signale des corrections candidates. Les [paquets supplémentaires](annotation/README.md) contiennent 40 réponses des replays de pause et 96 observations du test d'images, mélangées par question ou bloc ; les correspondances et délais sont séparés. | Le gel est celui des **versions provisoires**. La relecture audio/vidéo finale et les corrections humaines restent nécessaires avant toute note. |
| **2. Réanalyse nocturne** | [Comparaisons appariées CNRS](../2026-10-21-analyse-ablation-gx10/README.md) : la pause est plus rapide sur 10/10 paires de questions, et trois images sur 11/12 blocs au premier passage comme au second. Délais individuels, p50/p95, préremplissage, génération, publications et fraîcheur disponibles. | Petit nombre de cas ; ordre et cache perturbent la comparaison. Aucune qualité notée. |
| **3. Pause vision** | [Huit replays complets Kennedy et Spring](../2026-10-21-confirmation-pause-vision-gx10/BILAN.md), A/B/B/A, 40/40 réponses acquises. Sur Kennedy, la médiane HTTP groupée descend de **18,78 à 11,21 s** et 10/10 réponses B sont sous 20 s contre 5/10 A. Sur Spring, elle descend d'environ **12,19 à 9,19 s**. | Sur Spring, la couverture vision baisse de 91,38 % en A à 82,76–89,66 % en B, avec davantage de pertes ; `spring-04` et `spring-06` restent `insufficient` dans chaque passage. La pause n'est donc pas validée comme réglage général. |
| **4. Trois images** | [24 blocs Kennedy/Spring, 96/96 sorties](../2026-10-21-confirmation-images-gx10/BILAN.md), ordre A/B/B/A. Trois images sont plus rapides sur les **48/48 paires bloc/passage** ; au premier passage, le gain médian apparié est **1,56 s** sur Kennedy et **1,53 s** sur Spring. | Au deuxième passage, B bénéficie d'un préremplissage proche de 0,06 s : le gain chaud n'est pas attribuable simplement aux deux images retirées. Il s'agit d'un composant sur blocs figés, pas du débit du visionnage continu. OCR, actions et faits restent à noter. |
| **5. Sélection adaptative shadow** | [667 blocs des six vidéos](../2026-10-21-shadow-selection-gx10/README.md), SHA vérifiés : proposition de trois images pour 616 blocs, repli à cinq pour 51 ; 142 candidats statiques à vérifier. Coût CPU p50 de 6,83 à 11,02 ms selon la vidéo. | **Zéro appel VLM réellement supprimé.** La règle n'a pas de rappel factuel mesuré : les 51 alarmes et des contrôles négatifs doivent être revus avant un replay adaptatif. |

Les comparaisons de réponses utilisent le délai HTTP complet ; les tests d'images utilisent le temps du composant de perception. Le premier token n'a pas été mesuré. `acquired` signifie qu'une réponse a été reçue ; `insufficient` est un type de sortie, pas un jugement de vérité. Le p95 de cinq questions ou douze blocs est peu stable. Les résultats bruts, empreintes et conditions d'arrêt figurent dans chaque dossier d'essai.

## Matrice par vidéo

| Vidéo | Cas représenté | Données de vitesse disponibles aujourd'hui | Signal de couverture ou d'erreur | Pertinence |
| --- | --- | --- | --- | --- |
| CNRS | Français, documentaire | Réanalyse A/B/B/A de la pause et de 5/3 images sur le lot nocturne ; 110 blocs shadow. | 20/20 questions de la variation pause acquises ; fraîcheur médiane d'environ 16 s. | Non notée. |
| Bœuf | Français, cuisine | Trois replays de référence Whisper ; 92 blocs shadow, dont 4 replis à cinq images. | Cas `cuisine-07` prioritaire : trois sorties `insufficient` dans le corpus étendu. | Non notée. |
| Kennedy | Anglais, documentaire | Quatre replays pause et 12 blocs appariés 5/3 images ; 53 blocs shadow. | 20/20 réponses pause acquises, couverture vision 98,10 % par passage. | Non notée. |
| Tears | Anglais, fiction | Trois replays de référence Whisper ; 91 blocs shadow, dont 26 replis. | Attribution des locuteurs et `tears-07` à revoir sur le média. | Non notée. |
| Artemis | Anglais, direct long | Trois replays de référence Whisper ; 263 blocs shadow, dont 18 replis. | `artemis-07` demande une écoute précise de la phrase « 30 seconds until » avant d'établir l'attendu. | Non notée. |
| Spring | Sans dialogue | Quatre replays pause et 12 blocs appariés 5/3 images ; 58 blocs shadow. | 20/20 réponses pause acquises, mais huit `insufficient` sur deux questions répétées et une couverture inférieure en B. | Non notée. |

La ligne Kennedy compte quatre replays de cinq questions, soit 20 réponses ; la même arithmétique vaut pour Spring. Les autres chiffres des trois replays de référence sont descriptifs et ne s'agrègent pas aux confirmations A/B/B/A.

## Décision et prochain essai

1. **Finir l'oracle et l'annotation aveugle.** Vérifier d'abord `kennedy-06`, `spring-04`, `spring-06`, `cuisine-07`, `tears-07` et `artemis-07` sur les médias. Intégrer les corrections annoncées dans une nouvelle version des fiches, consigner le relecteur et la preuve temporelle, puis noter les paquets sans ouvrir les correspondances. Mesurer ensuite par vidéo la part des réponses pertinentes sous 20 s et sous 15 s, les inventions et les abstentions justifiées.
2. **Ne pas activer la pause vision pour tous les contenus.** Le gain de Kennedy est prometteur, mais la couverture de Spring impose une règle conditionnelle ou un mécanisme de rattrapage à tester après notation.
3. **Tester en priorité une sélection adaptative 3 ou 5 images, sans saut d'appel VLM.** Contrôler d'abord les 51 replis et des blocs non alarmés sur les six vidéos, puis préenregistrer un seul replay comparant la règle figée à 3 et 5 images, avec faits/OCR/actions notés et délais complets. Les 142 candidats statiques ne deviennent pas des appels supprimés sans mesure de rappel.

Le prochain choix de configuration doit se faire sur la frontière **pertinence annotée et vitesse**, par vidéo et avec preuves d'absence de dégradation ; les seules médianes ne suffisent pas.
