---
id: T315
titre: Give the model the part of each page that matches the question
statut: a-faire
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
- T314 (`05c1592`) : déclencheur `model`, requête du modèle passée au port ; ADR 0064.
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
