# Oracle v4 — questions qui demandent internet ou un outil, et corpus web figé

## Question

Le benchmark ne mesurait que des réponses tirées de la vidéo. Dabi (22/10) a demandé une catégorie à part, jugée « très
nécessaire » : les questions dont la réponse demande des outils ou une recherche sur internet, sur des faits stables
comme sur l'actualité. Peut-on l'écrire avec le même soin que l'oracle v3, et la rendre rejouable sans réseau ?

## Configuration

- Les 60 questions de l'oracle v3 restent intactes. Catégories ajoutées, notées et rapportées à part :
  - **W** (web) : réponse absente de la vidéo, trouvée en ligne ; au moins une question sur des faits stables et une
    d'actualité par vidéo, avec un attendu daté « au 22/10/2026 » ;
  - **M** (mixte) : un fait de la vidéo, disponible à la pose, plus un fait extérieur ;
  - **O** (outil images) : seule une relecture d'images sorties du contexte récent répond (`inspect_clip`). Ni la
    transcription ni les descriptions de la vision de N2 ne la contiennent : les rédacteurs l'ont vérifié dans le
    journal du proxy de N2.
- Chaque question reprend l'instant de pose d'une question de l'oracle v3, chacun au plus une fois, pour rejouer les
  requêtes déjà capturées.
- Sous-agents Claude (Opus 5.5), comme pour la v3 : un rédacteur puis un vérificateur indépendant par paire de vidéos.
  La part vidéo a des preuves horodatées. La part extérieure a des sources (URL, titre, date de consultation, extrait de
  25 mots au plus), consultées avec WebSearch et WebFetch. Consignes exactes : [`consignes-agents.js.txt`](consignes-agents.js.txt).
- Grilles propres à W, M et O :
  - crédit pour un fait extérieur juste et attribué à sa source ;
  - invention si le fait est faux ou présenté comme dit dans la vidéo ;
  - abstention justifiée (note 0) si l'outil nécessaire manque.
- 22 octobre, 12:40–13:25 UTC.

## Résultats

| | Nombre |
| --- | ---: |
| Questions rédigées | 42 (7 par vidéo) |
| Acceptées / corrigées / rejetées | 27 / 15 / 0 |
| W : stables / actualité | 11 / 7 |
| M (toutes sur des faits extérieurs stables) | 12 |
| O | 12 |
| URL sources distinctes | 54 |

Corpus figé ([`figer_corpus.py`](figer_corpus.py), 22/10 vers 13:30 UTC). Chaque page est téléchargée une fois ; on garde
la page brute compressée, le texte extrait et un manifeste avec empreintes, taille, statut HTTP et date :
- 51 pages sur 54 obtenues. Refus : Rice News (HTTP 406) ; deux pages PubMed renvoient une page de blocage (HTTP 203) ;
- 59 extraits sur 67 retrouvés dans le texte figé (au moins 60 % de leurs suites de 6 mots) ;
- 28 questions W/M sur 30 ont au moins une source retrouvée. Exceptions : `cnrs-m1` (PubMed bloqué) et `cuisine-w2`
  (extrait retrouvé à 38 %).

Fichiers :
- [`oracle-v4.json`](oracle-v4.json) : les 60 questions de l'oracle v3 et les 42 nouvelles (`v1Status: "new-v4"`, champs
  `category`, `freshness`, `sources`, `toolExpected`, `inspectInterval`) ;
- [`questions-wmo.json`](questions-wmo.json) et [`questions-wmo-scenario.json`](questions-wmo-scenario.json) (format des
  scénarios de rejeu) ;
- [`corpus-manifeste.json`](corpus-manifeste.json) : URL, clé, statut, taille et empreintes SHA-256 de la page brute et du
  texte ;
- [`verdicts.json`](verdicts.json) et [`redaction-et-verification.json`](redaction-et-verification.json).

## Lecture

La catégorie existe : 42 questions vérifiées, 30 adossées à des sources datées, 12 qui demandent de revoir des images.
Le corpus permet de rejouer les essais sans réseau et de comparer des variantes sur les mêmes pages. Les sites qui
refusent l'accès automatique (Britannica, bibliothèque JFK, Nobel, Rice News, PubMed) poussent vers Wikipedia, la NASA et
les sites officiels : c'est aussi ce que trouvera un moteur réel.

## Limites et incidents

- Le dépôt GitHub est public : le texte des pages reste hors de Git, sur le Mac
  (`/Users/Dabi/Documents/TVLens-GX10/essais/corpus-web-20261022/`) et sur la GX10
  (`/home/nvidia/tvlens-setup/corpus-web-20261022/`). Seuls les URL, les extraits courts et les empreintes sont versionnés.
- Les questions d'actualité vieillissent : l'attendu est daté du 22/10/2026, et la grille accepte une réponse plus récente
  si elle est sourcée et datée.
- Questions, sources et oracle sont écrits par des modèles, sans relecture humaine. Le vérificateur est indépendant du
  rédacteur, mais c'est le même modèle.
- Les pages dynamiques (NASA Artemis II, téléchargements Blender) ont pu changer entre la consultation par les agents et
  le téléchargement : 4 extraits n'y sont plus retrouvés.
