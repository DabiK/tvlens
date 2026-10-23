---
id: T314
titre: Let the local model decide the web search and write its query
statut: termine
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
  pour 1,5 s de plus. Mais `callsForWeb` ne déclenche la recherche que sur 7 W sur 18, 1 M sur 12, 0 O sur 12 (et à tort
  sur 2 questions vidéo sur 60) ; 7 des 9 recherches ratées sont des questions qui ne nomment pas leur sujet ; 5 des
  8 inventions sont des versions périmées données comme actuelles.
- Essai H2 de la même session, le 22/10 (18:13–18:30 UTC), sur les 102 questions (60 v3, 18 W, 12 M, 12 O), deux
  passages, deux bras : P (question et trois passages récents) et PT (P plus le titre de la source).
  - 408 appels de décision : aucune erreur, aucun JSON invalide ; délai médian 0,65 s, 90e centile 0,86 s, maximum
    0,96 s.
  - PT déclenche sur W 18/18, M 12/12, O 0/12, et à tort sur v3 3/60 ; décisions identiques entre passages 102/102.
    P : W 18/18, M 11/12, O 0/12, v3 3 à 4 sur 60 ; 99/102 identiques. `callsForWeb` : W 7/18, M 1/12, v3 2/60.
  - Bonne page parmi les trois récupérées du corpus figé : requête du modèle 22–23 sur 30 avec titre, 19 sur 29 sans ;
    question brute 21 sur 30. Exemples : « date de sortie film Tears of Steel Blender VFX », « Artemis I launch delay
    reasons November 16 2022 ».
  - Les 80 requêtes du modèle envoyées à SearXNG ont toutes eu des résultats.
  - Recommandations de la session expériences : passer le titre de la source quand l'hôte le connaît ; si l'appel
    échoue, retomber sur `callsForWeb` ; garder la question brute pour la réponse, la requête du modèle ne servant qu'à
    la récupération.
- Appel de décision validé par H2 (texte à reprendre mot pour mot) :
  - format : `{"type":"object","properties":{"web":{"type":"boolean"},"query":{"type":"string"}},"required":["web","query"]}` ;
  - options du client, plus `num_predict: 80` ; `think: false` ; température 0 (celle du client) ; aucun outil ;
  - message système :

    > Tu prépares la réponse d'un compagnon de visionnage. Le spectateur pose une question pendant la vidéo. Décide si
    > une bonne réponse a besoin d'une recherche sur le web.
    > - web = true si la réponse demande un fait absent de la vidéo : culture générale, histoire, science, identité d'une
    >   personne ou d'une œuvre, date de publication, actualité ou état actuel (« aujourd'hui », « dernière version »),
    >   chiffre officiel, vérification d'une affirmation. Une question qui mêle un fait de la vidéo et un fait extérieur
    >   demande aussi web = true.
    > - web = false si la réponse se trouve dans ce qui est dit ou montré dans la vidéo, même dans un passage ancien, ou
    >   si la question porte sur l'image (cadrage, couleur, objet ou texte à l'écran).
    > Si web = true, écris dans query une requête de recherche autonome de 3 à 12 mots-clés, dans la langue la plus utile,
    > qui nomme explicitement le sujet (titre de l'œuvre, nom de la personne, de la mission, du lieu) au lieu de « ce
    > film », « il » ou « cette nuit-là ». N'y mets pas d'année que tu supposes. Si web = false, query est vide.

  - message utilisateur : `Question du spectateur : « <question> »`, puis, si le titre est connu,
    `Titre de la source : <titre>`, puis `Passages récents de la vidéo (du plus ancien au plus récent) :` et une ligne par
    passage `- [<début>–<fin> s] <texte>`, pour les trois passages les plus récents, chacun coupé à 600 caractères.
- Le titre de la source n'existe pas encore dans le produit : le titre de session est une date ou un nom donné
  (`runtime/session-manifest.cjs:41`, `adapters/session-library.cjs:40`), pas le titre de la vidéo, et il n'est pas
  dans le contexte de la question. Le faire arriver de l'hôte jusqu'au contexte est un autre ticket.
- Code (lignes à `7a574e5`, relire après T311) :
  - `adapters/ollama/question-agent.cjs` : `WEB_TRIGGERS` et `DEFAULT_WEB_TRIGGER` (`:16-17`), validation du
    déclencheur au constructeur (`:61-63`), `infer` (`:118-147`), `#wantsWeb` (`:149-152`), `#retrieve` (`:155-164`,
    requête `retrievalQuery(input.question)`), `#raceRetrieval` (`:167-182`, délai `WEB_RETRIEVAL_TIMEOUT_MS`) ;
  - `adapters/ollama/http-client.cjs` : `chat({ messages, tools, format, signal })` envoie les paramètres fixés à la
    construction (modèle, `think`, `keep_alive`, `options`) ; aucun réglage par appel n'existe encore ;
  - `adapters/companion-prompt.cjs` : `localWebLines(webPages)` (`:154-168`), `buildLocalPrompt` (`:169-185`) ;
  - `core/web-retrieval.cjs` : `retrievalQuery`, `WEB_QUERY_MAX_CHARS`, `callsForWeb` ;
  - contexte de la question en mode chat : `context.passages` (passages récents, `startMs`, `endMs`, `text`),
    `core/video-tools.cjs:174-195`, transmis par `core/deep-ask.cjs:207` ;
  - configuration et rejeux du déclencheur : ce que T311 a ajouté (`TVLENS_LOCAL_WEB_TRIGGER`, validation dans la
    composition, `scripts/local-stream-input.cjs`, documentation dans `.env.example` et `docs/gx10-experiment.md`) ;
  - ADR 0070 : récupération avant la réponse, pas un outil ; limite connue « la requête est la question brute ».
- La branche d'essai F1 fusionne aussi `feat/journal-memoire-local` (T313 change le contexte des questions locales) :
  garder les changements de `buildLocalPrompt` petits et localisés.

## Périmètre

- À modifier :
  - `adapters/ollama/question-agent.cjs` : déclencheur `model` ajouté à `WEB_TRIGGERS`. Avec un port, en mode chat sans
    intention et ce déclencheur, l'appel de décision précède la récupération, avec un délai propre nommé (5 s) à
    l'intérieur de l'échéance de la question. `web: false` : aucune récupération. `web: true` : la récupération utilise
    `query`, nettoyée et bornée par `retrievalQuery`. Sortie invalide, `web: true` avec requête vide, erreur ou délai
    dépassé : repli sur `callsForWeb` avec la question brute. L'annulation de la question interrompt la décision sans
    réponse tardive. La réponse garde la question brute. L'appel de décision est une requête au fournisseur comptée
    comme les autres, et ses jetons entrent dans l'usage de la question.
  - Prompt de décision : un module voisin des prompts locaux (`adapters/companion-prompt.cjs` ou un fichier à côté),
    texte de H2 mot pour mot. Il accepte un titre de source facultatif ; l'agent n'en passe aucun dans ce ticket. Les
    passages viennent des trois derniers de `context.passages`, temps en secondes, texte coupé à 600 caractères.
  - `adapters/ollama/http-client.cjs` : options par appel (`num_predict`) et `think` par appel, fusionnés aux paramètres
    fixes sans les modifier pour les appels suivants.
  - `adapters/companion-prompt.cjs`, consigne avec pages (`localWebLines`) : dater chaque fait daté tiré des pages ; pour
    « dernier », « actuel », « en ce moment », prendre la date la plus récente des pages et la dire. Sans page, prompt
    inchangé.
  - Résultat : le champ `retrieval` porte la décision quand elle a eu lieu (`decision: 'web' | 'no-web' | 'failed'`, la
    requête envoyée, la durée de la décision), jamais de texte de passage ni de page.
  - Configuration et rejeux : `model` admis partout où T311 admet `auto` et `always` ; documentation des réglages.
  - ADR : décision du modèle avant la récupération (appel séparé et court plutôt qu'un outil, coût mesuré par H2,
    repli sur la règle, question brute gardée pour la réponse), et mise à jour de la limite « requête brute » de
    l'ADR 0070.
  - Tests : `tests/ollama-question-agent.test.cjs`, par la composition partagée, DeepAsk et le faux serveur Ollama en
    boucle locale, avec un port factice ; test du client HTTP pour les réglages par appel ; test du prompt de décision
    (avec et sans titre, passages bornés).
- À ne pas toucher : `core/deep-ask.cjs`, la règle `callsForWeb`, les déclencheurs `auto` et `always`, les adaptateurs
  web, la liste des outils vidéo, l'arrivée d'un titre de source dans le contexte.

## Critères d'acceptation

1. Déclencheur `model`, « Quand ce film a-t-il été publié ? » avec un passage récent qui nomme le film : le premier appel
   `/api/chat` est la décision (sans outil, format `{web, query}`, `num_predict: 80`, `think: false`, message système de
   H2, passages récents dans le message utilisateur) ; le port reçoit la requête du modèle, pas la question ; l'appel de
   réponse contient la question brute ; la réponse finale cite une page récupérée. Le test échoue avant la correction.
2. Décision `web: false` : aucune récupération, une seule requête de réponse ensuite ; le résultat porte
   `decision: 'no-web'`.
3. Décision invalide, `web: true` avec requête vide, erreur ou délai dépassé (minuteries injectées) : repli sur
   `callsForWeb` avec la question brute, `decision: 'failed'` ; annulation pendant la décision : aucune réponse ni
   requête ensuite.
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

Aucune décision n'est attendue.

## Journal

- 22/10, orchestrateur : ticket préparé depuis l'essai H1 et la proposition de la session expériences.
- 22/10, orchestrateur : chiffres et prompt de H2 reportés. Le propriétaire avait demandé de passer à T314 dès
  l'arrivée de H2 ; la session expériences confirme (« T314 peut lancer sa boucle »). Le titre de source reste hors
  périmètre.
- 22/10, orchestrateur : exploration (`explorateur`, rapport dans `.harness-state/tickets/T314/exploration.md`). Toutes les
  validations du déclencheur lisent `WEB_TRIGGERS` ; le client HTTP n'a aucun réglage par appel ; l'usage d'une question
  locale se réduit à `thinkingChars` ; « Quand ce film a-t-il été publié ? » ne déclenche pas `callsForWeb` ; le texte exact
  de H2 vient du script `rejouer_h2.py` (absent de la branche). Trois écarts déclarés dans `ecarts.md` (usage, critère 5,
  source du texte H2). Aucun écart de périmètre.
- 22/10, orchestrateur : implémentation (`implementeur`) : déclencheur `model`, module `adapters/web-decision-prompt.cjs`
  (texte H2 vérifié identique au script), réglages par appel du client HTTP, règle de datation avec pages, décision
  reportée par les rejeux, documentation. Rouges vus avant le code, ou par mutation (13 mutations, toutes détectées).
  `node scripts/check.mjs` : vert, 3132 tests JS et 71 Python.
- 22/10, orchestrateur : ADR 0067 écrit, limite « requête brute » de l'ADR 0070 amendée, ligne ajoutée à
  `docs/architecture.md`. `node scripts/check.mjs --changed` : vert, 132 tests.
- 22/10, orchestrateur : relecture 1 (`relecteur` neuf, `revue-1`) : accepté, 0 bloquant, 0 mineur, 0 hors périmètre ;
  les quatre écarts déclarés sont acceptés.
- 22/10, orchestrateur : `node scripts/check.mjs` : vert, 3132 tests JS (160 fichiers) et 71 tests Python.

### Réserves à la clôture

- Écart accepté, périmètre « jetons dans l'usage » : la voie locale ne compte que thinkingChars ; la décision passe par la même comptabilité (countThinking, reportUsage) et compte comme requête au fournisseur, sans compteur de jetons nouveau.
- Écart accepté, critère 5 : aucun prompt d'avant n'était enregistré ; preuve par la branche sans page inchangée et l'égalité du prompt no-web avec celui d'un agent sans port.
- Écart accepté, source du texte H2 : le script de l'essai (rejouer_h2.py) fait foi pour les détails que le Markdown du ticket ne fixe pas ; coupe des passages par clipText.
- Écart accepté : le message système mesuré est recopié dans tests/web-decision-prompt.test.cjs comme spécification.
- Non vérifié : aucun essai réel (Ollama, SearXNG) du déclencheur model dans le produit ; l'échéance de la question pendant la décision n'a pas de test à part (même chemin que l'annulation, testée).
- Question pour le propriétaire : le titre de la source, qui améliore la requête dans H2 (22-23/30 contre 19/29), reste à faire arriver de l'hôte jusqu'au contexte (autre ticket).
