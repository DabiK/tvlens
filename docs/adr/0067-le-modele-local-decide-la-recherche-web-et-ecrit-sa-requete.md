# 0067 — Le modèle local décide la recherche web et écrit sa requête, dans un appel court avant la récupération

- Date : 2026-10-22
- Ticket : `docs/travail/tickets/314-let-the-local-model-decide-the-web-search-and-write-its-query.md`
- Statut : acceptée ; amende l'ADR 0070 ; amendée par l'ADR 0069 (titre de la source)

## Contexte

L'ADR 0070 récupère des pages avant la réponse quand la règle `callsForWeb` (`core/web-retrieval.cjs`) juge la question
web, avec la question brute pour requête. L'essai H1 du 22/10 (`experiments/essais/2026-10-22-web-outils-hors-ligne-gx10/`)
montre que les pages apportent 26 réponses pertinentes sur 60 aux questions web et mixtes, mais que la règle ne
déclenche que 7 questions web sur 18 et 1 mixte sur 12 ; 7 des 9 recherches ratées sont des questions qui ne nomment
pas leur sujet (« Quand ce film a-t-il été publié ? »). L'essai H2 mesure un appel court de décision sur 102 questions :
18 web sur 18, 11 à 12 mixtes sur 12, 3 à 4 fausses alarmes sur 60 questions vidéo, aucun JSON invalide sur 408 appels,
0,65 s médian et 0,96 s au plus.

## Décision

Un troisième déclencheur, `model`, s'ajoute à `auto` et `always` (`WEB_TRIGGERS`, `adapters/ollama/question-agent.cjs`),
admis par la composition et par les scénarios de rejeu comme les deux autres. Avec un port, pour une question de chat
sans intention, `OllamaQuestionAgent` fait d'abord un appel de décision, puis seulement la récupération.

- L'appel est séparé de la réponse, sans outil, au format JSON `{web, query}`, avec `num_predict: 80`, `think: false` et
  les autres paramètres du client (`chat` accepte des options et `think` par appel, sans modifier les paramètres
  fixes). Le message système et le message utilisateur (question, titre de source facultatif, trois passages récents
  coupés à 600 caractères) sont ceux mesurés par H2, dans `adapters/web-decision-prompt.cjs`. Le titre de source vient
  de l'hôte quand il le connaît (ADR 0069).
- `web: false` : aucune récupération. `web: true` avec une requête non vide : la récupération reçoit cette requête,
  bornée par `retrievalQuery`. Sortie illisible, requête vide, erreur ou délai propre dépassé
  (`WEB_DECISION_TIMEOUT_MS`, 5 s, ramené à 1,5 s par l'ADR 0068, dans l'échéance de la question) : la règle `callsForWeb` décide sur la question brute,
  comme le déclencheur `auto`. L'annulation, la fermeture ou le plafond général de la question interrompent la
  décision, et rien ne part ensuite ; l'échéance de la question (14 s, portée à 30 s le 23/10 par l'amendement de
  l'ADR 0068) ne s'applique qu'une fois la question classée « cherche » (ADR 0068, T317).
- La réponse reçoit toujours la question du spectateur : la requête du modèle ne sert qu'à la récupération.
- La décision est une requête au fournisseur comptée comme les autres ; son raisonnement entre dans l'usage de la
  question. Le résultat porte `retrieval.decision` (`web`, `no-web` ou `failed`), la requête envoyée au port et la durée
  de la décision ; les champs de la récupération n'y figurent que si le port a été appelé. Les rejeux les reportent.
- Avec pages, la consigne de réponse demande de dater les faits tirés des pages et, pour « dernier », « actuel » ou
  « en ce moment », de prendre et dire la date la plus récente des pages (5 des 8 inventions de H1 étaient des versions
  périmées données comme actuelles). Sans page, le prompt ne change pas.

## Alternatives écartées

- Donner la recherche au modèle comme un outil de la boucle de réponse : écarté par l'ADR 0070 (contrats d'outils
  vidéo, petit modèle) ; un appel court au format imposé est borné en durée et ne produit jamais de réponse.
- Enrichir la règle `callsForWeb` : elle ne peut pas nommer le sujet d'une question qui ne le nomme pas.
- Remplacer `auto` par `model` : la décision coûte une requête de plus par question de chat ; le choix reste un réglage
  tant que les essais réels ne l'ont pas tranché.
- Répondre avec la requête du modèle : elle perd la formulation du spectateur, que la réponse doit traiter.

## Conséquences

Les questions qui renvoient à la vidéo (« ce film », « il ») partent avec une requête qui nomme le sujet, au prix
d'un appel court par question de chat. Les passages récents, données non fiables, entrent dans l'appel de décision ;
avec un port de résidence `hybrid`, une requête écrite à partir des passages sort de la machine, là où seule la
question brute sortait. Un corpus figé qui déclare des requêtes exactes ne retrouve pas celles du modèle et retombe
sur son classement lexical. Le titre de la source, qui améliore la requête dans H2 et H4b, arrive de l'hôte depuis l'ADR 0069.

## Protégée par

`tests/ollama-question-agent.test.cjs` : film nommé par la requête du modèle jusqu'à la source validée par DeepAsk,
décision contre le web, replis (contenu illisible, requête vide, erreur HTTP, délai), annulation pendant la décision,
absence de décision hors chat web ou sans port, usage et requêtes comptés, règle de datation avec et sans pages.
`tests/web-decision-prompt.test.cjs`, `tests/ollama-http-client.test.cjs`, `tests/local-stream-replay.test.cjs` et
`tests/portable-config.test.cjs` : messages de décision, réglages par appel, scénario et configuration `model`.
