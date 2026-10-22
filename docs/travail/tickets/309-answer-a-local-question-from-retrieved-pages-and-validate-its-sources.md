---
id: T309
titre: Answer a local question from retrieved pages and validate its sources against them
statut: termine
bloque_par: T308
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Quand l'agent local (Ollama) reçoit un port de récupération web, il récupère des pages AVANT de répondre, pour une
question de chat sans intention que la règle de T308 juge web. Ces pages arrivent au modèle dans le bloc de données non
fiables du prompt, pas comme un outil. Une réponse extérieure ou mixte (fait vidéo plus fait extérieur) est alors
acceptée si ses sources sont des pages de cette récupération, validées par l'adaptateur contre les URL réellement
rendues. Sans port, ou quand rien n'a été récupéré, le refus actuel reste inchangé. Un nouvel ADR remplace, pour la voie
locale, la phrase de l'ADR 0057 qui réserve le web à Codex.

## Sources

- Décision du propriétaire, le 22/10 : la voie locale répond aux questions qui demandent internet, ou un fait vidéo plus
  un fait extérieur ; la catégorie W (web), M (mixte), O (relecture d'images) du banc est jugée « très nécessaire ».
- Choix retenu, le 22/10 (recommandation de l'orchestrateur, sans objection du propriétaire au moment du découpage) :
  la règle « une source ne compte que si sa page a été ouverte » (`docs/domaine.md:17`) est conservée. Un document du
  port est une page lue (T308) ; une URL proposée par le modèle hors de ces documents est rejetée.
- T308 : `WebRetrievalPort`, `callsForWeb`, `retrievalQuery`, `WEB_DOCUMENT_LIMIT`, `WEB_TEXT_MAX_CHARS`, `sourceKey`
  (`adapters/external-links.cjs`), `FrozenCorpusRetrieval`.
- Code à `c9f3cc2` (relire les lignes après T308) :
  - `adapters/ollama/question-agent.cjs` : constructeur (`:27-38`, options passées telles quelles au client HTTP),
    `run` (`:69-79`, échéance de la question avec minuteries injectées), `infer` (`:81-106`, prompt construit en `:84`,
    réponse lue en `:96`) ;
  - `adapters/ollama/question-response.cjs` : refus web défini en `:3`, appliqué en `:37-39` sur `kind: 'external'` ou
    toute source non vide ;
  - `adapters/companion-prompt.cjs:153-170` : `buildLocalPrompt`, lignes « Aucun accès web » (`:155-156`), bloc non
    fiable (`:168`) ; complexité gelée dans `eslint-suppressions.json` ;
  - forme du bilan des sources côté Codex, à reproduire : `adapters/codex-session-agent.cjs:132-150`
    (`sourceValidation: { proposed, accepted, rejected: [{ url, reason }] }`, au plus six sources) ;
  - DeepAsk, inchangé : accepte une réponse `external` en mode chat si elle porte des sources (`core/deep-ask.cjs:252`),
    refuse si `sourceValidation.proposed > 0` sans source acceptée (`:253`) ; les citations vidéo restent validées par
    lui (`:242-249`).
- ADR 0057 (« Le web reste une capacité du backend Codex », `docs/adr/0057-…:28-29`), ADR 0004 (outils rendus au
  retour de l'agent, aucun outil ajouté ici), ADR 0029, ADR 0039 (codes `TVLENS_*`).
- Tests à garder verts sans modifier leurs assertions : `tests/ollama-question-agent.test.cjs` (liste exacte des outils
  `:182-183`, prompt « Aucun accès web » `:189-190`, refus des sources inventées `:245-260`), `tests/chat-sources.test.cjs`,
  `tests/chat-codex.test.cjs`, `tests/video-research.test.cjs`, `tests/codex-confinement.test.cjs`.

## Périmètre

- À modifier :
  - `adapters/ollama/question-agent.cjs` : options `retrieval` (port facultatif) et `webTrigger` (`'auto'` par défaut,
    ou `'always'`), retirées des options passées au client HTTP. Dans `infer`, avant le prompt : récupération seulement
    si `retrieval` existe, `input.mode === 'chat'`, `input.context?.intent` est absent, et `webTrigger === 'always'` ou
    `callsForWeb(question)`. La récupération a son propre délai nommé, armé avec les minuteries injectées, à l'intérieur
    de l'échéance de la question. Les documents rendus sont rebornés par l'agent (nombre, longueur, `sourceKey`, doublons).
    Un échec ou un délai dépassé de la récupération ne fait pas échouer la question : aucune page, une limite explicite
    (« la recherche web locale n'a pas abouti »). L'annulation ou l'échéance de la question interrompt la récupération et
    n'émet aucune réponse tardive. La récupération ne passe pas par le `fetchImpl` de l'agent et n'incrémente pas le
    compteur de requêtes au fournisseur.
  - `adapters/companion-prompt.cjs` : `buildLocalPrompt` accepte `webPages`. Avec au moins une page, les deux lignes sur
    le web sont remplacées par une consigne : les pages de `webPages` sont les seules sources extérieures ; un fait
    extérieur se répond en `kind=external` (ou garde ses citations vidéo s'il est mixte), chaque source reprend
    exactement l'URL et le titre d'une page, avec dans `evidence` le passage de la page qui l'établit ; si les pages ne
    suffisent pas, `kind=insufficient`. Les pages (URL, titre, éditeur, date, texte) vont dans le bloc non fiable. Sans
    page, le prompt est identique au texte actuel. La complexité de la fonction ne dépasse pas son gel : extraire une
    fonction si besoin.
  - `adapters/ollama/question-response.cjs` : `readAnswer(content, pages)`. Sans pages, comportement actuel à
    l'identique. Avec pages : une source est acceptée si `sourceKey(url)` est la clé d'une page récupérée et si son titre
    et son extrait sont des chaînes non vides ; au plus six ; `sourceValidation` de même forme que Codex, émis aussi
    quand le modèle propose des sources toutes rejetées (DeepAsk s'en sert pour refuser une réponse maquillée en
    explication).
  - Le résultat porte un champ `retrieval` quand une récupération a été tentée : `residence` (celle du port), `status`
    (`used`, `empty`, `failed`), nombre de documents, durée. Jamais de texte de page dans le résultat, les traces ou les
    erreurs.
  - Nouvel ADR `docs/adr/0063-…` (prochain numéro libre) : validité d'une source locale (page lue par la récupération de
    ce tour, validée par clé d'URL contre les documents rendus) ; récupération avant la réponse dans le bloc non fiable,
    pas un outil ; seulement en chat sans intention, par règle pure ou réglage `always` ; capacité désactivée par défaut
    (sans port, refus actuel) ; aucun repli vers Codex ; une récupération par un port `hybrid` rend la question
    « hybride » (la requête est sortie de la machine), à relever comme tel dans les essais ; une relance ne réutilise pas
    les pages d'un tour précédent (pas d'historique implicite) ; limite connue : la requête est la question brute, sans
    reformulation. Statut de l'ADR 0057 mis à jour (amendée par 0063) ; `docs/architecture.md` si elle décrit les
    questions locales.
  - Tests dans `tests/ollama-question-agent.test.cjs`, par la composition partagée, DeepAsk, les vrais outils et le faux
    serveur Ollama en boucle locale, avec un port de récupération factice injecté (agent construit avec `retrieval`
    puis passé à `createConversationRuntime({ agent })`).
- À ne pas toucher : `core/deep-ask.cjs`, la liste des outils vidéo et leur traduction, les adaptateurs Codex, la
  configuration et la composition (T311), l'adaptateur SearXNG (T310).

## Critères d'acceptation

1. Question web (règle vraie, mode chat, sans intention) : le port reçoit la requête, les pages figurent dans le bloc non
   fiable du premier appel `/api/chat`, et une réponse `external` qui cite l'URL d'une page récupérée est le résultat
   final de DeepAsk, avec sa source et `sourceValidation.accepted === 1`. Le test échoue avant la correction.
2. Une source dont l'URL n'a pas été récupérée est rejetée et listée dans `sourceValidation.rejected` ; DeepAsk rend une
   réponse insuffisante.
3. Réponse mixte : une citation vidéo valide et une source récupérée sont toutes deux conservées.
4. Règle fausse, mode inspect, question avec intention, ou agent sans port : le port n'est jamais appelé et le prompt
   est identique à celui d'aujourd'hui ; `webTrigger: 'always'` appelle le port même quand la règle est fausse.
5. Récupération en échec ou trop longue (minuteries injectées) : refus actuel d'une source externe, plus la limite
   explicite ; annulation pendant la récupération : aucune réponse, aucun appel `/api/chat` ensuite.
6. Les tests existants cités dans les sources passent sans modification de leurs assertions.
7. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/ollama-question-agent.test.cjs` : une question web avec un port factice qui rend deux pages inventées, jusqu'au
résultat validé de DeepAsk.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 22/10, orchestrateur : ticket ouvert depuis l'exploration de la recherche web locale, après T308.
- 22/10, orchestrateur, exploration (explorateur, rapport dans `.harness-state/tickets/T309/exploration.md`) : T308 livre
  le port dans `core/ports.cjs`, `callsForWeb` et les bornes dans `core/web-retrieval.cjs`, `sourceKey` strict (https,
  vrai domaine). L'agent Ollama passe ses options au client HTTP et compte les requêtes dans son `fetchImpl` ; DeepAsk ne
  revalide pas les URL, l'agent est le seul garde. `buildLocalPrompt` est à ≈10 de complexité (le gel du fichier porte
  sur `buildPrompt`). Le marqueur aléatoire du bloc non fiable impose de comparer les prompts à marqueur normalisé
  (écart déclaré dans `ecarts.md`). Prochain ADR : 0063 ; `docs/architecture.md` décrit les questions locales sans web.
- 22/10, orchestrateur, implémentation (implementeur) : `buildLocalPrompt` reçoit `webPages` (lignes web extraites dans
  `localWebLines`), `readAnswer(content, pages)` valide les sources par clé d'URL, l'agent récupère avant le prompt avec
  un délai de 15 s et publie `retrieval`. 12 tests ajoutés ; rouge vu : le test d'acceptation échouait sur `actual: []`
  (port jamais appelé). Rapporté par l'implémenteur : `node scripts/check.mjs` complet vert (3090 tests JS, 71 Python).
- 22/10, orchestrateur, ADR : `docs/adr/0063-…` écrit, statut de l'ADR 0057 « amendée par l'ADR 0063 »,
  `docs/architecture.md` (questions locales et entrée Décisions) mis à jour.
- 22/10, orchestrateur, relecture 1 (`relecture-1.md`) : à corriger, 0 bloquant, 1 mineur (aucun test ne protège la
  consigne web du prompt avec pages), 1 hors périmètre (titre et éditeur non bornés en longueur). Écart du critère 4
  accepté. Correction renvoyée à l'implémenteur.
- 22/10, orchestrateur, correction 1 (implementeur) : le test d'acceptation vérifie la consigne web du prompt avec
  pages ; rouge vu en cassant `localWebLines`. `node scripts/check.mjs` lancé par l'orchestrateur : vert, 3090 tests
  JS, 71 Python, `cas_de_test_produit` 1668 → 1680.
- 22/10, orchestrateur, relecture 2 (`relecture-2.md`, relecture de correction) : accepté, 0 bloquant, 0 mineur,
  1 hors périmètre (titre, éditeur et date d'une page non bornés en longueur), NON CORRIGÉS : 0. Verdict TERMINÉ.

### Réserves à la clôture

- Hors périmètre (relecture 1 et 2) : titre, éditeur et date d'une page ne sont pas bornés en longueur dans boundedPages (adapters/ollama/question-agent.cjs) ; une borne partagée dans core/web-retrieval.cjs est à prévoir en T310 ou T311.
- Écart accepté, critère 4 : le prompt est comparé à celui d'un agent sans port après normalisation du marqueur aléatoire TVLENS-<12 hex> du bloc non fiable, seule différence possible.
- Non vérifié : aucun essai réel avec un modèle Ollama ni avec SearXNG ; l'extrait (evidence) d'une source n'est pas comparé au texte de la page.
- Question pour le propriétaire : la sonde experiments/gx10/research/2026-10-20-vllm-client/sonder.cjs hache adapters/ollama/question-response.cjs et refusera avec RESPONSE_PARSER_CHANGED tant que son empreinte n'est pas mise à jour.
- Une résidence de port autre que local ou hybrid est publiée 'unknown' dans retrieval.residence, valeur que le ticket ne prévoit pas.
