# H1 — Pages web et relecture d'images, rejouées hors ligne

## Question

Le mode local de TVLens refuse toute réponse qui demande le web. Quand on lui fournit des pages, le modèle de questions
répond-il aux questions W (web) et M (vidéo + fait extérieur) de l'oracle v4, sans inventer davantage et sans trop de
retard ? Vaut-il mieux injecter les pages avant la réponse, ou donner un outil de recherche ? Pour les questions O
(images sorties du contexte récent), le journal mémoire ou l'outil `inspect_clip` suffisent-ils ?

## Configuration

- Requêtes de questions capturées dans J2 (N2 : questions `gemma4:26b-a4b`, vision `gemma3:4b` sans `topicSummary`),
  reprises au même instant de pose avec la question W/M/O à la place de la question v3. Le GPU ne fait rien d'autre.
- Script : [`scripts/rejouer_h1.py`](scripts/rejouer_h1.py), lanceur [`scripts/launch-h1.sh`](scripts/launch-h1.sh). Bras :
  - **A** : requête capturée, mode local sans web (le produit actuel) ;
  - **A2** : consigne ouverte aux pages web, sans page fournie ;
  - **B** : A2 + les 3 passages du corpus figé les plus proches de la question, injectés dans le contexte ;
  - **C** : A2 + un outil `search_web` sur le même corpus et la même récupération, en deux temps (appel d'outil, puis
    réponse au format) ;
  - **O0** : requête capturée ; **OJ** : O0 + le journal mémoire du proxy ; **OI** : OJ + `inspect_clip` exécuté sur
    les images préparées des blocs, par le modèle de vision, en deux temps.
- Récupération : plongements `qwen3-embedding:0.6b` sur des morceaux de 1 200 caractères des 51 pages du corpus figé
  ([oracle v4](../2026-10-22-oracle-v4-web-outils-gx10/)), 3 passages. Un préfixe unique par appel contre le cache.
- Ordre A A2 B C O0 OJ OI OI OJ O0 C B A2 A (deux passages par bras) : 312 appels de questions, 22 octobre,
  15:23–16:34 UTC, sceau vérifié ([`bruts/empreintes.txt`](bruts/empreintes.txt)).
- Notation à l'aveugle des bras A, A2, B, O0, OJ et OI contre les grilles W/M/O de l'oracle v4 : deux juges par vidéo
  et un troisième sur 2 désaccords. Les juges pouvaient vérifier les faits extérieurs dans le texte du corpus figé
  ([`notation/`](notation/), paquets par [`scripts/paquet.py`](scripts/paquet.py), tableaux par
  [`scripts/bilan.py`](scripts/bilan.py)). Le bras C n'a pas été noté : il échoue déjà sur ses compteurs (voir plus bas).
- Critère fixé avant la notation : B gagne au moins 5 W/M pertinentes face à A, sans hausse des inventions, pour moins
  de 3 s de plus.

## Résultats

| Bras | Pertinentes /60 | W /36 | M /24 | Inventions | Abst. injustifiées | Délai médian |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A : produit actuel | 0 | 0 | 0 | 2 | 27 | 3,4 s |
| A2 : web autorisé, sans page | 3 | 3 | 0 | 1 | 34 | 3,0 s |
| **B : 3 passages injectés** | **26** | **16** | **10** | 8 | 16 | **4,9 s** |

| Bras O | Pertinentes /24 | Inventions | Délai médian |
| --- | ---: | ---: | ---: |
| O0 : requête capturée | 0 | 0 | 3,1 s |
| OJ : + journal | 0 | 4 | 4,3 s |
| OI : + `inspect_clip` | 4 | 10 | 8,7 s (max 235 s) |

- B face à A : 26 gagnées, 0 perdue ; 13 pertinentes à chaque passage.
- Critère : gain **+26** (seuil +5) et **+1,5 s** (seuil 3 s) atteints ; inventions **8 contre 2**, donc non atteint.
  A s'abstient presque toujours et ne peut donc presque rien inventer. Sur les 8 inventions de B, 5 reprennent une
  information périmée présentée comme actuelle (« dernier film » de Blender Studio, « dernier » modèle Gemini,
  Blender 4.3) : ce sont les pièges d'actualité de l'oracle. Les autres mélangent la vidéo et la page.
- Récupération de B : une page source de l'oracle figure parmi les 3 passages pour 21 questions W/M sur 30. Sur les 9
  ratées :
  - 7 désignent leur sujet sans le nommer (« ce film », « cette mission », « cette nuit-là ») ; la question brute
    ramène alors des pages hors sujet ;
  - 1 renvoie à PubMed, absent du corpus ;
  - 1 trouve des pages voisines.
- Bras C, non noté :
  - 3 erreurs « token repeat limit » ;
  - 12 réponses de plus de 60 s (90e centile 228 s) : le modèle boucle au second temps ;
  - 13 appels sans recherche, 12 JSON invalides, 4 réponses sourcées sur 60.

  Ses requêtes, écrites par le modèle, lèvent bien les « ce film » (« date de publication film Mango Open Movie Ian
  Hubert… »). Elles ont aussi leurs défauts : années périmées (« 2024 2025 »), titre inventé (« The Creator »). Une
  source de l'oracle revient dans les résultats pour 20 recherches sur 47.

Déclencheur du produit (calculé hors GPU sur le code de T309, règle de mots-clés `callsForWeb` de
`core/web-retrieval.cjs`) :

| Catégorie | Recherche déclenchée |
| --- | ---: |
| W | 7 sur 18 |
| M | 1 sur 12 |
| O | 0 sur 12 |
| v3 (vidéo seule) | 2 sur 60 (à tort) |

## Lecture

- Fournir des pages fonctionne : de 0 à 26 réponses W/M pertinentes sur 60, pour 1,5 s de plus. Le modèle reste prudent
  sans page (A2 : 3/60, une invention) : ouvrir la consigne au web ne le fait pas inventer de mémoire.
- La limite vient de la récupération : 21 questions sur 30 seulement ont la bonne page. Le cas dominant, une question
  qui ne nomme pas son sujet, demande une requête réécrite avec le contexte de la vidéo.
- En l'état, le déclencheur du produit est le goulot : il ne lancerait la recherche que sur 8 questions W/M sur 30. Un
  essai F1 dans le flux réel avec ce déclencheur plafonnerait vers ce nombre, et il n'est pas lancé tel quel. Prochaine
  étape : H2 hors ligne, où le modèle décide lui-même de chercher et écrit une requête autonome, sans appel d'outil.
- L'outil en deux temps (C) ne convient pas à `gemma4:26b-a4b` : boucles et JSON invalide au second temps.
- Les questions d'actualité piègent B : une page qui contient plusieurs versions fait répondre une version ancienne.
  La consigne doit demander la date de chaque fait daté.
- Relire des images anciennes avec `gemma3:4b` rapporte peu (4/24) et invente beaucoup (10/24) : la vision décrit des
  détails absents (foule devant le pupitre, Kennedy de profil). Le journal n'aide pas les questions O, puisqu'il ne
  garde que la parole et une ligne d'image au changement de sujet.

## Limites et incidents

- Rejeu hors ligne : sans la vision en parallèle, sans la validation des sources par TVLens, et sur un corpus figé de
  51 pages au lieu du web ouvert. La récupération de SearXNG sera différente.
- Deux passages d'une seule capture par question ; oracle et juges sont des modèles. Les juges vérifiaient les faits
  extérieurs dans le texte du corpus.
- Le dépôt est public : le texte des pages est retiré des bruts versionnés (empreinte et longueur à la place). Le
  journal complet est hors de Git, sur le Mac (`/Users/Dabi/Documents/TVLens-GX10/essais/h1-resultats-complets/`) et
  sur la GX10. Les empreintes de [`bruts/empreintes.txt`](bruts/empreintes.txt) portent sur les deux versions.
