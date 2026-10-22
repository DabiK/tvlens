---
id: T314
titre: Let the local model decide the web search and write its query
statut: a-faire
bloque_par: T311
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Un troisième déclencheur de la récupération web locale, `model`, laisse le modèle de questions décider s'il faut
chercher et écrire lui-même la requête, à partir de la question et des passages récents. Une question qui ne nomme pas
son sujet (« Quand ce film a-t-il été publié ? ») part alors avec une requête qui le nomme. Les déclencheurs `auto` et
`always` ne changent pas. La consigne de réponse avec pages demande en plus de dater les faits et, pour « dernier » ou
« actuel », de prendre la date la plus récente des pages.

## Sources

- Essai H1 de la session expériences, le 22/10 (`experiments/essais/2026-10-22-web-outils-hors-ligne-gx10/`, sur
  `main`) : avec trois passages de pages injectés, les questions W et M passent de 0 à 26 réponses pertinentes sur 60,
  pour 1,5 s de plus. Mais :
  - `callsForWeb` ne déclenche la recherche que sur 7 W sur 18, 1 M sur 12, 0 O sur 12, et à tort sur 2 questions vidéo
    sur 60 ;
  - `retrievalQuery(question)` cherche avec la question brute : 7 des 9 recherches ratées sont des questions qui ne
    nomment pas leur sujet (« Quand ce film a-t-il été publié ? », « cette mission », « cette nuit-là ») ;
  - 5 des 8 inventions sont des versions périmées données comme actuelles.
- Essai H2 (même session, prévu vers 18:45 UTC le 22/10) : prompt de décision exact (script de labo `rejouer_h2.py`),
  sortie `{"web": boolean, "query": string}`, `num_predict` 80. Ses chiffres et le texte du prompt sont à reporter ici
  avant de lancer le ticket (voir « Hypothèses bloquantes »).
- Code (relire après T311 ; lignes à `7a574e5`) :
  - `adapters/ollama/question-agent.cjs` : `WEB_TRIGGERS` et `DEFAULT_WEB_TRIGGER` (`:16-17`), validation du
    déclencheur au constructeur (`:61-63`), `infer` (`:118-147`), `#wantsWeb` (`:149-152`), `#retrieve` (`:155-164`,
    requête `retrievalQuery(input.question)`), `#raceRetrieval` (`:167-182`, délai `WEB_RETRIEVAL_TIMEOUT_MS`) ;
  - `adapters/ollama/http-client.cjs` : `chat({ messages, tools, format, signal })` envoie les paramètres fixés à la
    construction (modèle, `think`, `keep_alive`, `options`) ; aucun réglage par appel n'existe encore (`num_predict`) ;
  - `adapters/companion-prompt.cjs` : `localWebLines(webPages)` (`:154-168`), `buildLocalPrompt` (`:169-185`),
    `untrustedBlock` ;
  - `core/web-retrieval.cjs` : `retrievalQuery`, `WEB_QUERY_MAX_CHARS` ;
  - contexte fourni par DeepAsk à l'agent en mode chat : `context.passages` (passages récents, champ `text`),
    `conversation` (six derniers tours de la session), `core/deep-ask.cjs:206-207` ; le titre de session existe dans le
    manifeste (`runtime/headless-runtime.cjs:294`, `:329`) mais n'est pas dans le contexte de la question ;
  - configuration et rejeux du déclencheur : ce que T311 a ajouté (`TVLENS_LOCAL_WEB_TRIGGER`, validation dans la
    composition et dans `scripts/local-stream-input.cjs`) ;
  - ADR 0063 (`docs/adr/0063-une-question-locale-repond-du-web-a-partir-des-pages-recuperees-avant-la-reponse.md`) :
    récupération avant la réponse, pas un outil ; limite connue « la requête est la question brute ».
- La branche d'essai F1 fusionne `feat/journal-memoire-local` (T313 modifie le contexte des questions locales) et cette
  branche : garder les changements de `buildLocalPrompt` petits et localisés.

## Périmètre

- À modifier :
  - `adapters/ollama/question-agent.cjs` : déclencheur `model` ajouté à `WEB_TRIGGERS`. Avec un port, en mode chat sans
    intention et ce déclencheur, un appel de décision précède la récupération : même modèle, sans outil, format JSON
    `{ web: boolean, query: string }`, `num_predict` nommé (80 sauf autre chiffre de H2), délai propre nommé à
    l'intérieur de l'échéance de la question. `web: false` : aucune récupération. `web: true` : la récupération utilise
    `query`, nettoyée et bornée comme `retrievalQuery`. Sortie invalide, requête vide, erreur ou délai dépassé : repli sur
    la règle `auto` avec la question brute, et l'échec est compté. L'annulation de la question interrompt la décision
    sans réponse tardive. L'appel de décision est une requête au fournisseur comptée comme les autres, et ses jetons
    entrent dans l'usage de la question.
  - Entrées de la décision : la question (hors bloc non fiable), puis dans le bloc non fiable les textes des trois
    passages les plus récents du contexte (bornés), et le titre de session si le contexte le porte déjà (ne pas l'y
    ajouter dans ce ticket). Le dernier tour de la conversation n'est ajouté que si H2 l'a testé.
  - `adapters/ollama/http-client.cjs` : options par appel (au moins `num_predict`), fusionnées aux options fixes sans les
    modifier pour les appels suivants.
  - Le prompt de décision vit à côté des autres prompts locaux (`adapters/companion-prompt.cjs` ou un module voisin),
    texte repris de H2.
  - `adapters/companion-prompt.cjs`, consigne avec pages (`localWebLines`) : dater chaque fait daté tiré des pages ; pour
    « dernier », « actuel », « en ce moment », prendre la date la plus récente des pages et la dire. Sans page, prompt
    inchangé.
  - Résultat : le champ `retrieval` porte la décision quand elle a eu lieu (`decision: 'web' | 'no-web' | 'failed'`, la
    requête retenue, sa durée), jamais de texte de passage ni de page.
  - Configuration et rejeux : `model` admis partout où T311 admet `auto` et `always` ; documentation des réglages.
  - ADR : décision du modèle avant la récupération (pourquoi un appel séparé plutôt qu'un outil, coût mesuré par H2,
    repli sur la règle), mise à jour de la limite « requête brute » de l'ADR 0063.
  - Tests : `tests/ollama-question-agent.test.cjs`, par la composition partagée, DeepAsk et le faux serveur Ollama en
    boucle locale, avec un port factice ; test du client HTTP pour les options par appel.
- À ne pas toucher : `core/deep-ask.cjs`, la règle `callsForWeb`, les déclencheurs `auto` et `always`, les adaptateurs
  web, la liste des outils vidéo.

## Critères d'acceptation

1. Déclencheur `model`, question qui ne nomme pas son sujet : le premier appel `/api/chat` est la décision (sans outil,
   format `{web, query}`, `num_predict` réglé, passages récents dans le bloc non fiable) ; le port reçoit la requête du
   modèle, pas la question ; la réponse finale cite une page récupérée. Le test échoue avant la correction.
2. Décision `web: false` : aucune récupération, une seule requête de réponse ensuite ; le résultat porte
   `decision: 'no-web'`.
3. Décision invalide, vide, en erreur ou trop longue (minuteries injectées) : repli sur la règle `auto` avec la question
   brute, `decision: 'failed'` ; annulation pendant la décision : aucune réponse ni requête ensuite.
4. Déclencheurs `auto` et `always`, mode inspect, question avec intention, agent sans port : aucun appel de décision, et
   le nombre de requêtes au fournisseur est celui d'avant ce ticket.
5. Avec pages, la consigne de réponse contient la règle de datation ; sans page, le prompt est identique à celui d'avant.
6. `TVLENS_LOCAL_WEB_TRIGGER=model` est accepté par la configuration et par un scénario de rejeu ; une autre valeur
   reste refusée.
7. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/ollama-question-agent.test.cjs` : « Quand ce film a-t-il été publié ? » avec un passage récent qui nomme le film,
une décision `web: true` qui nomme le film dans sa requête, puis la réponse validée par DeepAsk.

## Hypothèses bloquantes

Décision attendue du propriétaire : confirmer le périmètre après les chiffres de l'essai H2 (gain du déclencheur `model`
sur W, M et O, faux déclenchements sur les questions vidéo, coût en secondes), et reporter dans ce ticket le texte exact
du prompt de décision, la valeur de `num_predict`, le traitement de la réflexion (`think`) pendant la décision, et si le
dernier tour de conversation fait partie des entrées.

## Journal

- 22/10, orchestrateur : ticket préparé depuis l'essai H1 et la proposition de la session expériences, en attente des
  chiffres de H2.
