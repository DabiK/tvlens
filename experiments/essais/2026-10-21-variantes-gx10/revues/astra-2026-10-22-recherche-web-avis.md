**Dabi, vous avez un peu sur-construit l’extraction, pas le principe de la chaîne.** Après lecture du code, « décision → recherche → pages ouvertes → réponse → filtrage des citations » reste proportionné à vos contraintes. Les 1 100 lignes comprennent aussi le dispositif d’essai : ce n’est pas toute la complexité du produit.

| À conserver | Ce qui aurait pu être évité |
|---|---|
| Ouverture des pages, limites de taille/durée, annulation, contrôle des redirections et citations limitées aux pages récupérées. | L’extracteur HTML maison : entités, balises et conteneurs constituent une maintenance générique. |
| Appel court de décision et injection préalable : les essais les justifient face aux boucles de Gemma. | Enrichir encore `callsForWeb` : conserver un repli simple, sans construire un second décideur sophistiqué. |
| Corpus figé et rapports : nécessaires pour comparer sans solliciter constamment les moteurs. | Transformer ces outils d’essai en plateforme générale de recherche. |

**La réserve majeure est la validation réelle.** H1 obtient 26/60 réponses pertinentes, mais aussi 8 inventions contre 2 auparavant. Le 30/30 de H2 correspond à une condition avec titre ; le produit ne transmet pas encore ce titre. Le 23/27 de T315 mesure la présence du fait dans l’extrait, pas la justesse des réponses. Ces résultats encouragent à tester, pas à déclarer le problème résolu.

**Oui, des briques existaient :**

| Brique | Remplacement possible et contraintes |
|---|---|
| [Ollama web search](https://docs.ollama.com/capabilities/web-search) | Recherche et récupération hébergées, compte et clé. Incompatible avec le choix SearXNG auto-hébergé ; `web_search` seul ne suffit pas, il faut ouvrir via `web_fetch`. |
| [OpenCode](https://opencode.ai/docs/tools/) | `webfetch` récupère les pages ; `websearch` utilise Exa/Parallel hébergés, même sans clé. Embarquer son agent ajoute une orchestration et ne corrige pas les difficultés de Gemma. Garder un contrôle explicite des pages ouvertes. |
| [Mozilla Readability](https://github.com/mozilla/readability) | Mon choix naturel pour remplacer `htmlPage` : extraction locale, dépendance DOM supplémentaire sous Node. Conserver téléchargement borné et validation des sources ; scripts et ressources DOM désactivés. |
| [Trafilatura](https://trafilatura.readthedocs.io/en/latest/) | Extraction locale et chargement de pages, mais dépendances Python et liaison avec Node. Pertinent pour préparer le corpus ; moins proportionné dans ce chemin Node. |
| [SearXNG](https://docs.searxng.org/dev/search_api.html) | Réutilise déjà les moteurs, leur configuration et les résultats JSON. Les résultats ne prouvent pas l’ouverture des pages : votre récupération reste nécessaire. |
| Loader ou index local | Un loader remplace du téléchargement/extraction, pas la politique de citation. Un index local suppose collecte et actualisation ; disproportionné pour quelques pages par question. |

« Local » signifie ici **inférence locale avec recherche web hybride** : les requêtes sortent vers les moteurs. Sans clé ne signifie pas sans limitation ; SearXNG possède précisément des [suspensions après erreurs ou blocages](https://docs.searxng.org/admin/settings/settings_search.html).

**Avant vendredi soir, je privilégierais ceci :**

| Zone précise | Décision |
|---|---|
| `runtime/local-web-retrieval.cjs`, configuration `trigger` | Choisir explicitement `model` pour la recette ; garder `auto`/`always` pour comparaison, sans changer le défaut global. |
| `question-agent.cjs`, constantes de délai et `#raceRetrieval` | Priorité à vérifier : décision autorisée jusqu’à 5 s, récupération jusqu’à 15 s, question jusqu’à 300 s. **L’objectif de 15 s n’est pas garanti.** Mesurer le parcours complet avant de réduire les budgets. |
| `html-text.cjs::htmlPage` | Remplacement souhaitable, mais pas « sans risque » demain : comparer Readability sur des HTML conservés avant toute bascule. Sinon, geler. |
| `web-retrieval.cjs::pageExcerpt`, `question-response.cjs::retrievedSources`, corpus et rapports | Conserver. Faire une petite recette réelle espacée, tracée, du produit complet. |

**À ne surtout pas lancer maintenant :** migration vers OpenCode/LangChain, index vectoriel, nouveau modèle, double recherche systématique, rafales SearXNG ou suppression des garde-fous pour gagner des lignes. Ne pas confondre URL ouverte et affirmation vérifiée : `retrievedSources` ne contrôle pas que l’extrait cité étaye réellement la réponse.

Lecture seule ; aucun code modifié, aucun essai ni contrôle qualité relancé.