---
id: T318
titre: Give the web decision the title of the watched source
statut: termine
bloque_par: T317
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Quand l'hôte connaît le titre de ce qui est regardé, l'appel de décision web de la voie locale le reçoit, comme dans
l'essai H2-PT. La requête de recherche nomme alors la bonne œuvre. Sur le Mac, c'est le nom de la fenêtre capturée ;
sur le serveur, un titre déclaré au démarrage de la session, par un rejeu ou par un client qui le connaît. Sans titre,
rien ne change.

## Sources

- Essai H4b de la session expériences, le 23/10 : les 29 questions W et M où F1 a cherché, rejouées avec la même requête
  de réponse, seules les pages changent (requête du modèle écrite avec le titre de la source, H2-PT). Notation à
  l'aveugle dans le même paquet que F1 : W 14/18 contre 8/18, M 7/11 contre 5/11, inventions 2 contre 5 ; 8 questions
  gagnées, 0 perdue (p ≈ 0,008). Sans titre, la requête vise la mauvaise œuvre (« Apollo 13 », « Space Chimps »,
  « Avatar »).
- Essai H2 : avec titre, décisions identiques entre passages 102/102 contre 99/102, bonne page 22–23/30 contre 19/29.
- Code à `e03210f` :
  - `adapters/web-decision-prompt.cjs:31-35` : `decisionMessages({ question, passages, sourceTitle })` accepte déjà la
    ligne « Titre de la source : … » ; l'agent n'en passe aucun ;
  - `adapters/ollama/question-agent.cjs` : `#decide` (appel de `decisionMessages`) ;
  - `runtime/conversation-runtime.cjs:47-…` : composition partagée, `getInstruction` déjà lié tard par l'hôte ;
  - Mac : `app/capture-sources.cjs:30`, `:40` (`capturedSourceName`, nom de la fenêtre ou de l'écran choisi),
    `app/main.cjs:157` (composition), `:459-460` (le nom de la source sert déjà au titre de session) ;
  - serveur : `server/session-routes.cjs:57` (`POST /v1/session/start`, corps vide aujourd'hui),
    `runtime/headless-runtime.cjs:128` (composition), `:387-388` (`start`) ;
  - rejeux : `scripts/local-stream-host.cjs:67` (démarrage avec `{}`), `scripts/local-stream-input.cjs` (scénario) ;
  - TV : `tv/capture.py:134-142` ne connaît que l'application (`appId`), pas le titre du contenu.

## Périmètre

- Composition : `createConversationRuntime` accepte `getSourceTitle`, lié tard par l'hôte comme `getInstruction` ;
  l'agent local le reçoit et le lit à chaque décision, pour la session de la question. Le titre est nettoyé (caractères de
  contrôle retirés, espaces réduits) et borné par une longueur nommée ; vide, il est absent.
- Agent : `#decide` passe ce titre à `decisionMessages`. Le prompt de décision ne change pas. Le titre ne sert qu'à la
  décision : ni la réponse, ni les sources, ni les traces ne le portent ; le résultat dit seulement s'il était présent.
- Mac : `getSourceTitle` rend le nom de la source capturée de la session en cours, `null` sans capture.
- Serveur : `POST /v1/session/start` accepte un corps facultatif `{ sourceTitle }` (chaîne bornée ; autre forme refusée
  avec un code nommé) ; le titre vit avec la session démarrée, et `getSourceTitle` le rend. Un client ancien qui envoie
  `{}` démarre comme aujourd'hui.
- Rejeux : un scénario peut déclarer `sourceTitle`, envoyé au démarrage ; le rapport dit si un titre était fourni.
- Pas de titre inventé ni déduit des passages ; la TV n'envoie rien dans ce ticket.
- ADR : titre de la source comme entrée de la décision (origine par hôte, données non fiables, portée limitée à la
  requête), en amendement de l'ADR 0067.
- À ne pas toucher : le prompt de décision, les budgets, la règle `callsForWeb`, DeepAsk, la capture TV.

## Critères d'acceptation

1. Déclencheur `model`, hôte qui fournit un titre : le message utilisateur de l'appel de décision contient
   « Titre de la source : <titre> » ; sans titre, l'appel est identique à celui d'avant. Le test échoue avant la
   correction.
2. Mac : avec une source capturée nommée, la décision reçoit ce nom ; sans capture, aucun titre.
3. Serveur : `POST /v1/session/start` avec `{ sourceTitle }` puis une question web : la décision reçoit le titre ; avec
   `{}` ou sans corps, comportement d'avant ; une forme invalide est refusée avec un code nommé.
4. Un scénario de rejeu qui déclare `sourceTitle` le transmet, et le rapport le signale.
5. Le titre n'apparaît ni dans la réponse, ni dans les sources, ni dans les traces.
6. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/ollama-question-agent.test.cjs` : une question web avec le déclencheur `model` et un hôte qui fournit un titre,
jusqu'au corps de l'appel de décision reçu par le faux serveur Ollama.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 23/10, orchestrateur : ticket préparé depuis H2 et H4b. Accord du propriétaire relayé par la session expériences ;
  le ticket est traité par elle avec des sous-agents dans un worktree, pas par la boucle.
- 23/10, orchestrateur (session expériences, à la demande de Dabi : sous-agents plutôt que la boucle, worktree
  `../tvlens-t318`, branche `feat/titre-source`) — exploration faite (`.harness-state/tickets/T318/exploration.md`) :
  - chaîne : DeepAsk → `OllamaQuestionAgent.answer`/`#decide` → `decisionMessages` (ligne « Titre de la source » déjà
    prise en charge) ;
  - coutures : composition `getSourceTitle` à côté de `getInstruction`, mais transmis aux options de l'agent local ;
    nettoyage pur et borne nommée dans `core/web-retrieval.cjs` ;
  - serveur : titre porté par le coordinateur de session, validé avant `lifecycle.start`, code de refus public ;
  - Mac : titre rattaché à la session chargée, et non au nom capturé global ; rejeux : `sourceTitle` validé dans le
    scénario et envoyé au démarrage ;
  - ADR 0069 (0063–0068 pris sur d'autres branches), qui amende 0067 et cite 0042 ;
  - 4 écarts déclarés dans `ecarts.md` : sans corps, preuve Mac, requête qui contient le titre, chemin de l'agent.
- 23/10, implémentation (implémenteur, une passe) : `node scripts/check.mjs` complet vert, 161 fichiers et 3 201 tests
  JS, 71 tests Python, `cas_de_test_produit` passé de 1 759 à 1 772. ADR 0069 écrite par l'orchestrateur, ADR 0067
  amendée.
- 23/10, relecture 1 (`node scripts/loop/reviewed-state.mjs record --ticket T318`, relecteur neuf) : à corriger,
  1 bloquant et 3 mineurs. Bloquant : sur le Mac, le titre reste figé au premier démarrage (reprise d'archive, reprise
  sur une autre source). Mineurs : titre ignoré au démarrage d'une session déjà chargée, ADR sans fichier de tests
  serveur, plusieurs instructions par ligne dans les tests. Écarts 1 à 4 acceptés.
- 23/10, correction (implémenteur) : le titre suit la source capturée à chaque démarrage ou reprise sur le Mac ; un
  titre fourni au démarrage serveur s'applique à la session démarrée ou reprise ; une instruction par ligne.
  `node scripts/check.mjs` vert, 3 204 tests.
- 23/10, relecture 2 (relecture de correction, relecteur neuf) : accepté, 0 bloquant, 0 mineur, 0 hors périmètre,
  NON CORRIGÉS 0.
- 23/10, orchestrateur : `node scripts/check.mjs` complet relancé sur l'état relu : vert, 3 204 tests JS, 71 tests
  Python. Verdict TERMINÉ. Intégration hors boucle, à la demande de Dabi : commit sur `feat/titre-source`, puis rebase
  de la branche web (T308–T318) sur `main`.
