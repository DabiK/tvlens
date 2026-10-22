---
id: T315
titre: Give the model the part of each page that matches the question
statut: termine
bloque_par: T314
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Une page récupérée n'arrive plus au modèle par son seul début. Les adaptateurs web lisent la page plus loin, et l'agent
local en garde le début plus la fenêtre de texte qui recoupe le mieux la question et la requête de recherche, dans la
même longueur qu'aujourd'hui. Un fait situé au milieu d'une longue page atteint ainsi le modèle.

## Sources

- Constat du 22/10 (orchestrateur) : SearXNG (`adapters/web/html-text.cjs:76`, `:79`) et le corpus figé
  (`adapters/web/frozen-corpus.cjs:142`) coupent chaque page à ses `WEB_TEXT_MAX_CHARS` (2 500) premiers caractères ;
  `boundedPages` (`adapters/ollama/question-agent.cjs:38-45`, à `05c1592`) recoupe à la même longueur. Les essais H1
  et H2 injectaient au contraire les passages les plus pertinents des pages (plongements).
- Simulation de la session expériences, le 22/10, sans GPU, sur le corpus figé : l'extrait de l'oracle est localisé
  dans 55 pages sur 64, pour 27 questions W et M sur 30. Les termes viennent de la question brute et de la requête du
  modèle de H2, mots vides retirés ; le score d'une fenêtre est le nombre de termes distincts présents. Questions dont le
  fait arrive au modèle :
  - début de page, 2 500 caractères (le produit) : 18/27 ;
  - meilleure fenêtre de 2 500 dans les 20 000 premiers caractères : 21/27 ;
  - **début de 1 000 plus meilleure fenêtre de 1 500 après lui, dans les 20 000 premiers : 23/27** (retenu) ;
  - début de 800 plus deux fenêtres de 850 : 22/27.
  La moitié des faits est dans les 900 premiers caractères ; un quart au-delà de 2 500, jusqu'à 17 000. Réserve : ce
  sont les pages de l'oracle, pas forcément celles que SearXNG ouvrira.
- T314 (`05c1592`) : déclencheur `model`, requête du modèle passée au port ; ADR 0067.
- Mots vides et normalisation déjà écrits : `adapters/web/frozen-corpus.cjs:32` (`STOP_WORDS`), `:85` (`wordsOf`),
  `core/web-retrieval.cjs:27` (`normalizeText`).

## Périmètre

- `core/web-retrieval.cjs` : constantes nommées `WEB_PAGE_READ_MAX_CHARS = 20000`, `WEB_EXCERPT_HEAD_CHARS = 1000`,
  `WEB_EXCERPT_WINDOW_CHARS = 1500` (leur somme reste `WEB_TEXT_MAX_CHARS`) ; fonction pure `pageExcerpt(text, terms)` :
  texte de moins de `WEB_TEXT_MAX_CHARS` rendu entier ; sinon début de 1 000 caractères, puis, dans la suite des
  20 000 premiers caractères, la fenêtre de 1 500 qui contient le plus de termes distincts (casse et accents ignorés),
  la plus proche du début à égalité, coupée sur des espaces et séparée du début par une marque d'élision. Les termes et
  les mots vides sont partagés avec le corpus figé (une seule liste, déplacée dans le cœur si besoin).
- Adaptateurs : SearXNG et le corpus figé rendent jusqu'à `WEB_PAGE_READ_MAX_CHARS` caractères par page au lieu de
  `WEB_TEXT_MAX_CHARS` (la limite d'octets lus reste la même) ; le message de limite du corpus sur les textes coupés suit
  la nouvelle longueur.
- `adapters/ollama/question-agent.cjs` : `boundedPages` remplace la coupe du début par `pageExcerpt`, avec pour termes
  ceux de la question brute et, si elle existe, de la requête envoyée au port. Validation des sources inchangée (par URL).
- À ne pas toucher : la décision du modèle, le prompt de réponse, DeepAsk, la configuration.

## Critères d'acceptation

1. Une page factice de 12 000 caractères dont le fait est vers le 9 000e caractère, avec une question qui en nomme les
   termes : le prompt de réponse contient le début de la page et la fenêtre du fait, et pas plus de `WEB_TEXT_MAX_CHARS`
   caractères de texte pour cette page. Le test échoue avant la correction.
2. `pageExcerpt` : texte court rendu entier ; fenêtre la plus riche en termes choisie, la plus proche du début à
   égalité ; rien au-delà de 20 000 caractères ; casse et accents ignorés ; aucun terme commun : début seul suivi de la
   première fenêtre.
3. SearXNG et le corpus figé rendent le texte jusqu'à 20 000 caractères ; les tests existants des deux adaptateurs
   passent, leurs assertions sur la longueur étant mises à jour à la nouvelle constante seulement.
4. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/ollama-question-agent.test.cjs` : une page longue au fait tardif, jusqu'au prompt de réponse ; puis
`tests/web-retrieval.test.cjs` pour `pageExcerpt`.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 22/10, orchestrateur : ticket préparé pendant T314, depuis la simulation de la session expériences ; à déposer
  après l'intégration de T314. La double récupération (requête du modèle et question brute,
  pages alternées et dédoublonnées) reste hors de ce ticket : elle attend la notation H2b.
- 22/10, exploration (explorateur, rapport dans `.harness-state/tickets/T315/exploration.md`) : `boundedPages` n'a
  qu'un appelant, `#retrieve`, où la question brute et la requête envoyée au port sont disponibles ; aucun autre
  consommateur des adaptateurs web, la limite d'octets de SearXNG (1,5 Mio) suffit pour 20 000 caractères. Le
  vocabulaire (`STOP_WORDS`, `wordsOf`, `queryWords`) passe du corpus au cœur. Les fixtures longues de SearXNG et du
  corpus doivent grandir, et le test de page longue de l'agent (longueur exacte) change ; écarts déclarés dans
  `ecarts.md` (marque d'élision prise sur le budget de la fenêtre, `<=` comme `clipText`).
- 22/10, implémentation (implementeur) : vocabulaire (`STOP_WORDS`, `wordsOf`, `searchTerms`) déplacé dans
  `core/web-retrieval.cjs` ; constantes `WEB_PAGE_READ_MAX_CHARS`, `WEB_EXCERPT_HEAD_CHARS`,
  `WEB_EXCERPT_WINDOW_CHARS` et `pageExcerpt` ; `boundedPages` prend les termes de la question et de la requête ;
  SearXNG et corpus rendent 20 000 caractères. Test d'acceptation rouge avant la correction de l'agent
  (`the page keeps the window of the fact`, actual false).
- 22/10, relecture 1 : « à corriger », 1 bloquant (fenêtre recalée au début de phrase, qui perdait des termes :
  écart refusé), 2 mineurs (test d'égalité non discriminant, part de la question non prouvée).
- 22/10, correction (implementeur) : fenêtre de nouveau ouverte sur son premier terme ; tests du contre-exemple, de
  l'égalité sans fenêtre complète et du fait nommé par la seule question, chacun vu rouge (ou tué par mutation).
- 22/10, relecture 2 (correction) : accepté, 0 bloquant, 0 mineur, 1 hors périmètre (`docs/gx10-experiment.md:325`
  parle encore de pages coupées à 2 500 caractères), NON CORRIGÉS : 0.
- 22/10, `node scripts/check.mjs` (orchestrateur) : vert, 3 149/3 149 tests JS, 71 tests Python, cliquet
  `cas_de_test_produit` 1720 → 1737.

### Réserves à la clôture

- Hors périmètre : docs/gx10-experiment.md:325 dit encore « chacune coupée à 2 500 caractères » ; le corpus rend désormais 20 000 caractères et c'est l'agent qui réduit à 2 500.
- Écart accepté, critère 2 : la marque d'élision est prise sur le budget de la fenêtre et n'apparaît que s'il y a un vrai trou ; sans terme commun, l'extrait est le préfixe du texte.
- Écart accepté, critère 2 : un texte d'au plus WEB_TEXT_MAX_CHARS (et non « de moins de ») est rendu entier, comme clipText.
- Écart accepté, critère 3 : les fixtures longues de SearXNG et du corpus sont agrandies au-delà de 20 000 caractères, en plus des assertions, pour que la coupe reste prouvée.
- Écart accepté : le test existant de page longue de l'agent compare désormais le texte exact au lieu de la seule longueur.
- Écart accepté, critère 2 : la fenêtre s'ouvre sur son premier terme ; les fixtures de faits tardifs commencent par un terme.
- Non vérifié : aucun essai avec un vrai SearXNG ni un vrai modèle ; l'effet sur la notation H2 n'est pas mesuré.
