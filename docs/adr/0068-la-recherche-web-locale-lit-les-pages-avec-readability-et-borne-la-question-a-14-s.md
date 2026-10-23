# 0068 — La recherche web locale lit les pages avec Readability et borne à 14 s la question qui cherche sur le web

- Date : 2026-10-22
- Ticket : `docs/travail/tickets/316-extract-readable-pages-and-bound-local-web-latency.md`
- Statut : acceptée ; amende les ADR 0070 et 0067

## Contexte

L'extraction des pages (`adapters/web/html-text.cjs`) prenait le premier conteneur `article`, `main` ou `body` : une
page sans les deux premiers donnait au modèle sa navigation, ses liens latéraux et son pied de page. Côté délais, la
décision avait 5 s, la récupération 15 s, et la question le plafond général de 300 s, armé à la sortie de la file
interne ; la décision et la réponse attendaient un transport qui ignore son signal. Les mesures fournies par Dabi
(décision : médiane 0,65 s, maximum 0,96 s sur 408 appels ; recherche et pages : médiane 1,7 s, 90e centile 3,7 s,
maximum 5,3 s sur 59 recherches réelles ; réponse avec pages : médiane 4,3 à 5,7 s) laissent viser moins de 15 s.

## Décision

**Extraction.** `htmlPage` lit d'abord la page avec Mozilla Readability (`@mozilla/readability` 0.6.0) sur un document
LinkeDOM (`linkedom` 0.18.14) construit par simple analyse : aucun script exécuté, aucune ressource chargée, aucune
globale ajoutée. Le texte vient d'un parcours du nœud de l'article (espace aux frontières de bloc, rien entre éléments
en ligne), jamais de son HTML ; espaces normalisés, `WEB_PAGE_READ_MAX_CHARS` appliqué. Le titre reste celui de la
balise `title` du HTML brut (300 caractères), puis celui de SearXNG ; `plainText` ne change pas.
L'extraction par motifs reste le repli, sur la chaîne d'origine, quand l'analyse ou Readability lève, rend `null`, un
texte vide ou plus court que `MIN_PAGE_TEXT_CHARS` (200, désormais exporté par `html-text.cjs` et lu par
`searxng.cjs`), ou quand la page dépasse `READABLE_ELEMENT_LIMIT` (20 000 éléments). Cette limite est passée à
`maxElemsToParse`, mais LinkeDOM ne reconnaît pas `getElementsByTagName('*')`, que Readability utilise pour compter :
un comptage préalable par `querySelectorAll('*')` l'applique. Elle borne le travail de Readability, pas la durée de
l'analyse.

**Délais** (`adapters/ollama/question-agent.cjs`), avec horloge et minuteries injectées :

| Étape | Budget | Justification |
| --- | --- | --- |
| Décision | `WEB_DECISION_TIMEOUT_MS = 1500` | 540 ms de marge sur le maximum observé de 960 ms |
| Récupération complète | `WEB_RETRIEVAL_TIMEOUT_MS = 5000` | 90e centile 3,7 s, maximum 5,3 s ; 3,5 s en couperait environ une sur huit |
| Question qui cherche sur le web | `WEB_QUESTION_TIMEOUT_MS = 14000` | Au pire des deux budgets, 7,5 s restent pour répondre (médiane 4,3 à 5,7 s) |
| Marge jusqu'à 15 s | 1 s | Restitution et ordonnancement ; prévue, non mesurée |

- L'échéance de 14 s ne vaut que pour une question de chat sans intention, avec un port de récupération, qui cherche
  vraiment sur le web, c'est-à-dire dont une récupération va partir : avec `always` ; avec `auto` quand la règle
  `callsForWeb` est vraie ; avec `model` quand la décision est `web` avec une requête, ou en échec et la règle vraie.
  Elle commence à l'entrée dans `answer`, compte la file interne de l'agent et toutes les étapes (décision,
  récupération, extraction, réponse, outils vidéo), et n'est jamais réarmée. À son terme, l'appelant reçoit
  `TVLENS_OLLAMA_QUESTION_TIMEOUT` ; une question qui cherche et expire en file ne démarre pas.
- Une question qui ne cherche pas (`auto` et règle fausse ; `model` et décision `no-web`, ou décision en échec et règle
  fausse) garde le seul plafond général (`QUESTION_TIMEOUT_MS`), comme sans port ; avec `model`, sa décision garde
  son délai de 1,5 s. Avec `auto` et `always`, le classement est connu dès l'entrée et aucune minuterie de 14 s n'est
  armée pour une question qui ne cherche pas. Avec `model`, il n'est connu qu'au départ de la récupération : les 14 s
  courent depuis l'entrée, mais n'arrêtent la question qu'une fois classée « cherche » ; classée ainsi après ses 14 s,
  elle s'arrête aussitôt avec `TVLENS_OLLAMA_QUESTION_TIMEOUT`, sans appel au port ni appel de réponse ; classée « ne
  cherche pas », elle n'est jamais coupée à 14 s, même si sa décision a commencé tard. Les parcours non éligibles
  gardent aussi le plafond général.
- 23/10 : l'échéance visait d'abord toute question éligible, même écartée du web par la règle ou la décision ; une
  question purement vidéo, mesurée jusqu'à 12,6 s en flux réel, pouvait échouer en délai à la moindre contention du
  GPU. Elle ne vise plus que les questions qui cherchent
  (`docs/travail/tickets/317-bound-only-the-local-questions-that-really-search-the-web.md`).
- Décision, récupération et question passent par une même attente abandonnable (`#abandonable`), y compris une
  question éligible qui ne cherche pas, sans minuterie propre : à l'échéance, à l'annulation ou à la fermeture,
  l'attente s'arrête même si la promesse ignore son signal ; ses issues tardives sont absorbées sans résultat, usage
  ni appel de plus, et minuterie et écouteur sont retirés. Décision abandonnée : la règle `callsForWeb` décide sur la
  question brute. Récupération abandonnée : réponse sans pages, comme l'ADR 0070.
- Les délais internes de SearXNG (5 s pour la recherche, 4 s par page) restent des protections secondaires sous le
  budget de 5 s de la récupération entière. L'attente dans la file de DeepAsk reste hors de ce budget.

## Alternatives écartées

- Garder l'extraction par motifs et l'enrichir : chaque site demanderait sa règle ; Readability est éprouvé.
- jsdom pour le DOM : plus lourd et conçu pour simuler un navigateur, ce que l'extraction ne demande pas.
- Un budget de récupération de 3,5 s : il couperait environ une recherche réelle sur huit.
- Abaisser `QUESTION_TIMEOUT_MS` pour toutes les questions : les parcours sans web et les outils vidéo seuls n'ont pas
  été mesurés.
- Un worker pour préempter l'extraction : infrastructure disproportionnée pour un parsing mesuré à environ 160 ms au
  pire sur des pages synthétiques de 1,5 Mio.

## Conséquences

Les pages sans `article` ni `main` donnent leur contenu principal au modèle ; deux dépendances de production entrent
dans le verrou (`npm ci` à refaire sur un hôte déployé). Avec `auto` et `always`, une question qui cherche sur le web
finit, réussie ou non, au plus 14 s après son entrée dans l'agent ; une question qui ne cherche pas garde le plafond
général. Avec `model`, la borne de 14 s n'est pas garantie : l'échéance ne coupe qu'au classement « cherche », si bien
qu'une question encore non classée à 14 s (en file ou pendant sa décision) s'arrête au plus tôt à la fin de sa file,
plus jusqu'à 1,5 s de décision. Limites : ce n'est pas une garantie depuis le clic (file de DeepAsk exclue), ni une
garantie de réponse pertinente ; les échéances JavaScript ne préemptent pas une extraction synchrone, qui peut retarder
les minuteries ; un travail abandonné qui ne finit jamais garde la file interne, si bien que les questions suivantes
qui cherchent avec `auto` ou `always` expirent à 14 s, tandis que les questions `model`, jamais classées, et celles qui
ne cherchent pas attendent le plafond général ; avec `model`, une question qui ne cherche pas consomme quand même
l'appel de décision (au plus 1,5 s) ; DeepAsk annonce toujours son plafond de cinq minutes, et une coupure à 14 s y
apparaît comme une erreur de délai de l'agent. Les tests simulés ne prouvent aucune latence réelle.

## Protégée par

`tests/html-text.test.cjs` : succès de Readability, replis (nul, vide, trop court, exception, limite d'éléments),
page courte par les deux chemins. `tests/searxng-retrieval.test.cjs` : page sans `article` ni `main` débarrassée de
son bruit, page active sans script exécuté ni ressource chargée, et les tests existants d'extraction et de bornes.
`tests/ollama-question-agent.test.cjs` : réponse sourcée à 9 160 ms, décision et récupération bloquées (1 500 ms puis
6 500 ms), repli de décision sans recherche, réponse sourde abandonnée à 14 s pour les trois déclencheurs, file
comptée, question expirée en file, annulation et fermeture à chaque étape, parcours non éligibles, diagnostics
distincts ; question purement vidéo avec `auto` rendue par DeepAsk après 20 s, réponse après 20 s avec `model` sur une
décision `no-web`, bloquée ou illisible, question classée après 14 s en file, arrêtée si elle cherche et rendue sinon.
