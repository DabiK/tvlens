# H2 — Le modèle décide de chercher sur le web et écrit sa requête, hors ligne

## Question

Dans H1, injecter des pages faisait passer les questions W/M de 0 à 26 pertinentes sur 60. Mais le déclencheur du
produit, une règle de mots-clés (`callsForWeb`), ne lancerait la recherche que sur 8 questions W/M sur 30. De plus, la
requête est la question brute : elle rate les questions qui ne nomment pas leur sujet (« ce film »). Un appel court au
modèle de questions peut-il décider de la recherche et écrire une requête autonome, vite et sans se tromper sur les
questions vidéo ?

## Configuration

- Requêtes de questions capturées dans J2, comme H1. Questions : les 102 de l'oracle v4 (60 v3, 18 W, 12 M, 12 O).
- Appel de décision, sans outil, au format JSON `{"web": boolean, "query": string}`, `num_predict` 80, avec la question
  et les 3 passages récents (600 caractères chacun). Prompt dans [`scripts/rejouer_h2.py`](scripts/rejouer_h2.py). Bras :
  - **P** : sans titre ;
  - **PT** : avec le titre de la source, celui de la page YouTube, ou le nom du fichier pour Kennedy.
- Si `web` est vrai, réponse comme le bras B de H1, mais avec les 3 passages du corpus figé retrouvés par la requête du
  modèle (bras **PQ** et **PTQ**). Chaque requête du modèle et chaque question W/M brute sont envoyées à SearXNG, sans
  ouvrir de page.
- Deux passages. 22 octobre, 18:13–18:30 UTC. Le premier départ, à 18:12 UTC, a échoué sur une erreur d'import ; le
  lanceur a alors laissé démarrer J5b, arrêté une minute plus tard. Sceau : [`bruts/empreintes.txt`](bruts/empreintes.txt).
- Notation à l'aveugle des réponses PQ et PTQ contre l'oracle v4, avec la même grille et le même corpus que H1
  ([`notation/`](notation/)).

## Résultats

Décision (408 appels, aucune erreur, aucun JSON invalide ; délai médian **0,65 s**, maximum 0,96 s) :

| Recherche déclenchée | W | M | O | v3 (à tort) | Décisions identiques entre passages |
| --- | ---: | ---: | ---: | ---: | ---: |
| Règle du produit (`callsForWeb`) | 7/18 | 1/12 | 0/12 | 2/60 | — |
| P : modèle, sans titre | **18/18** | 11/12 | 0/12 | 3–4/60 | 99/102 |
| **PT : modèle, avec titre** | **18/18** | **12/12** | 0/12 | 3/60 | **102/102** |

Récupération dans le corpus figé, avec une page source de l'oracle parmi les 3 passages :

| Requête | Questions W/M |
| --- | ---: |
| Question brute (H1-B) | 21/30 |
| Requête du modèle, P | 19/29 |
| Requête du modèle, PT | 22–23/30 |

Réponses (deux passages) :

| | W/M pertinentes | W | M | Inventions | Délai médian |
| --- | ---: | ---: | ---: | ---: | ---: |
| H1-B : question brute | 26/60 | 16/36 | 10/24 | 8 | 4,9 s |
| PQ : requête du modèle | 21/58 | 16/36 | 5/22 | 4 | 4,3 s |
| **PTQ : requête du modèle avec titre** | **26/60** | **22/36** | 4/24 | 6 | 4,6 s |

- Les 3 questions v3 marquées à tort (`artemis-n1`, `artemis-n2`, `kennedy-n3`) restent fausses avec des pages. Elles
  l'étaient déjà sans web dans ces requêtes, qui n'ont pas de journal : l'effet des pages sur les questions vidéo n'est
  pas mesurable ici.
- SearXNG : les 80 requêtes du modèle renvoient des résultats. Les 30 questions brutes, passées ensuite, n'en renvoient
  aucun : Brave, DuckDuckGo et Google CSE avaient suspendu l'instance pour trop de requêtes (403, 429, « unusual
  traffic »). La comparaison sur le moteur réel n'est donc pas valable (voir [SearXNG](../2026-10-22-searxng-gx10/)).

## Lecture

- Le modèle décide bien et vite : toutes les questions W et M sont marquées, aucune O, et 3 questions vidéo sur 60 à
  tort, pour 0,65 s par question. Avec le titre de la source, ses décisions sont stables d'un passage à l'autre.
- Sa requête résout les questions qui ne nomment pas leur sujet (« date de sortie film Tears of Steel Blender VFX ») :
  +6 sur les W. Elle vise seulement le fait extérieur, et les questions mixtes perdent le passage utile (−6 sur les M).
  Le total ne change pas.
- Pour le produit : décider par le modèle (ticket T314, déclencheur `model`), passer le titre de la source quand l'hôte
  le connaît, et récupérer aussi avec la question brute pour les questions mixtes (option transmise à la session web).

## Limites et incidents

- Corpus figé de 51 pages ; la recherche réelle sera différente.
- Deux passages d'une même capture ; juges et oracle sont des modèles.
- Les titres de PT sont ceux des pages YouTube du corpus de test, sauf Kennedy (nom du fichier) : un hôte qui ne
  connaît pas le titre se comporte comme P.

## H2b : fusion des recherches et texte des pages, sur le corpus figé

- Mêmes requêtes, requête du modèle avec titre (H2-PT), 30 W/M, deux exécutions, 22/10 20:01–20:18 UTC
  ([`scripts/rejouer_h2b.py`](scripts/rejouer_h2b.py), bruts [`bruts-h2b/`](bruts-h2b/), notation
  [`notation-h2b/`](notation-h2b/)). Avant le rejeu, simulation sans GPU de la présence du fait dans le texte
  transmis ([`scripts/simuler_fenetres.py`](scripts/simuler_fenetres.py)) : 18/27 avec le début de page, 23/27 avec
  le début + la meilleure fenêtre.

| Bras | Justes /60 | W /36 | M /24 | Inventions |
| --- | ---: | ---: | ---: | ---: |
| FQ : passages des deux recherches fusionnés | 21 | 17 | 4 | 5 |
| PH : 3 pages, début de 2 500 caractères | 24 | 20 | 4 | 2 |
| **PW : début de 1 000 + meilleure fenêtre de 1 500 (T315)** | **29** | **22** | **7** | 3 |

Sur le corpus figé, la fenêtre aide et la fusion n'aide pas : T315 est confirmé, le ticket de fusion est abandonné.
Sur de vraies pages, la fenêtre n'aide plus ([H4](../2026-10-22-web-reel-texte-gx10/)).

