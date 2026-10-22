# 0068 — La recherche web locale lit les pages avec Readability et borne la question éligible au web à 14 s

- Date : 2026-10-22
- Ticket : `docs/travail/tickets/316-extract-readable-pages-and-bound-local-web-latency.md`
- Statut : acceptée ; amende les ADR 0066 et 0067

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
| Question éligible au web | `WEB_QUESTION_TIMEOUT_MS = 14000` | Au pire des deux budgets, 7,5 s restent pour répondre (médiane 4,3 à 5,7 s) |
| Marge jusqu'à 15 s | 1 s | Restitution et ordonnancement ; prévue, non mesurée |

- L'échéance de 14 s vaut pour toute question de chat sans intention avec un port de récupération, quel que soit le
  déclencheur (`auto`, `always`, `model`) et même si la règle ou la décision écarte le web. Elle commence à l'entrée
  dans `answer`, compte la file interne de l'agent et toutes les étapes (décision, récupération, extraction, réponse,
  outils vidéo), et n'est jamais réarmée. À son terme, l'appelant reçoit `TVLENS_OLLAMA_QUESTION_TIMEOUT` ; une
  question expirée en file ne démarre pas. Les autres parcours gardent le plafond général (`QUESTION_TIMEOUT_MS`).
- Décision, récupération et question passent par une même attente abandonnable (`#abandonable`) : à l'échéance, à
  l'annulation ou à la fermeture, l'attente s'arrête même si la promesse ignore son signal ; ses issues tardives sont
  absorbées sans résultat, usage ni appel de plus, et minuterie et écouteur sont retirés. Décision abandonnée : la
  règle `callsForWeb` décide sur la question brute. Récupération abandonnée : réponse sans pages, comme l'ADR 0066.
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
dans le verrou (`npm ci` à refaire sur un hôte déployé). Une question éligible au web finit, réussie ou non, au plus
14 s après son entrée dans l'agent. Limites : ce n'est pas une garantie depuis le clic (file de DeepAsk exclue), ni
une garantie de réponse pertinente ; les échéances JavaScript ne préemptent pas une extraction synchrone, qui peut
retarder les minuteries ; un travail abandonné qui ne finit jamais garde la file interne, si bien que les questions
éligibles suivantes expirent à 14 s et les autres attendent leur plafond ; avec `auto`, une question purement vidéo
reçoit aussi les 14 s dès qu'un port est configuré ; DeepAsk annonce toujours son plafond de cinq minutes, et une
coupure à 14 s y apparaît comme une erreur de délai de l'agent. Les tests simulés ne prouvent aucune latence réelle.

## Protégée par

`tests/html-text.test.cjs` : succès de Readability, replis (nul, vide, trop court, exception, limite d'éléments),
page courte par les deux chemins. `tests/searxng-retrieval.test.cjs` : page sans `article` ni `main` débarrassée de
son bruit, page active sans script exécuté ni ressource chargée, et les tests existants d'extraction et de bornes.
`tests/ollama-question-agent.test.cjs` : réponse sourcée à 9 160 ms, décision et récupération bloquées (1 500 ms puis
6 500 ms), repli de décision sans recherche, réponse sourde abandonnée à 14 s pour les trois déclencheurs, file
comptée, question expirée en file, annulation et fermeture à chaque étape, parcours non éligibles, diagnostics
distincts.
