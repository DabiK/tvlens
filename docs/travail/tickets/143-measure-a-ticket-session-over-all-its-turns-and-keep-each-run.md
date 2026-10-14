---
id: T143
titre: Measure a ticket session over all its turns and sub-agent runs, and keep each launch's stream
statut: a-faire
bloque_par: T142, T145
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Les chiffres qu'une session de ticket rapporte servent à calibrer la taille des tickets et, plus tard, le
plafond de tours des sous-agents. Aujourd'hui, ils peuvent être faux sans que rien ne le signale :

- une session qui finit plusieurs tours, parce qu'un sous-agent repris la réveille, n'est mesurée que
  sur son dernier tour ;
- un sous-agent repris n'est compté que pour son premier passage ;
- relancer un ticket écrase le flux du lancement précédent.

Après ce ticket :

- les tours, la durée et les tokens couvrent toute la session ;
- chaque passage d'un sous-agent est compté une fois ;
- chaque lancement garde son flux.

## Sources

- Constat : ESSAI-09.
- Faits observés sur T003, le 14/10. Toutes les sources sont dans `.harness-state/`.
- Premier lancement, `loop/events.jsonl`, événement `session-terminee` de 09:41:58 :
  - chiffres rapportés : `"tours":1`, `"duree_s":3`, `"tokens_sortie":167`,
    `"tokens_lus_cumules":76402`, `"cout_usd":3.52` ;
  - temps réel : la session avait démarré à 09:24:27, soit dix-sept minutes et demie ;
  - le coût est donc cumulé sur la session, mais les tours, la durée et les tokens ne couvrent que le
    dernier tour : 3,52 $ ne peut pas être le prix d'un tour de 3 s qui produit 167 tokens.
- Second lancement :
  - `tickets/T003/session-1.jsonl` porte trois messages `system` de sous-type `task_notification`
    pour l'implémenteur `aab8d76f4baf519d4`, un par passage :
    - 130 822 tokens, 72 outils, 686 574 ms ;
    - 147 924 tokens, 18 outils, 274 820 ms ;
    - 160 691 tokens, 16 outils, 243 983 ms ;
  - le rapport de session (`sous_agents`) et `retro-entree.md` n'ont que le premier passage ;
  - la rétrospective en a tiré une conclusion fausse sur la part des sous-agents (`retro.json`,
    observation « Métriques de session incohérentes dans la rétro d'entrée ») ;
  - chaque passage, repris ou non, a sa `task_notification` avec `usage`, et le message
    `task_started` du même `task_id` porte `subagent_type`.
- Le flux du premier lancement de T003 n'existe plus : le second lancement a réécrit
  `tickets/T003/session-1.jsonl`, parce que les tentatives sont numérotées à partir de 1 à chaque
  lancement.
- Code concerné, à la version `a5b9dd3` :
  - `scripts/loop/run.mjs` :
    - fonction `sessionReport` (lignes 120 à 137) : elle lit un seul message `result` ;
    - fonction `subAgent` (lignes 158 à 163) : elle ne compte que la réponse de l'outil `Agent`,
      `tool_use_result.agentType` ;
    - fonction `streamSession` (lignes 166 à 205) : `if (message.type === "result") result = message;`
      à la ligne 193, et le flux est écrit dans `session-${attempt}.jsonl` à la ligne 172 ;
    - fonction `runSession` (lignes 262 à 272) : elle écrit `session-<tentative>.json` et `.stderr`,
      puis l'événement `session-terminee` ;
    - boucle des tentatives (ligne 361) : les tentatives sont numérotées à partir de 1 à chaque
      lancement.
  - `scripts/loop/retro.mjs`, fonction `digest` (lignes 58 à 83) : elle affiche ces chiffres et le
    chemin du flux.
  - `tests/ticket-loop.test.cjs` : `FAKE_SESSION` (ligne 22).

## Périmètre

- À modifier :
  - `scripts/loop/run.mjs` ;
  - `scripts/loop/retro.mjs`, pour les chiffres et le chemin du flux ;
  - `tests/ticket-loop.test.cjs` ;
  - `scripts/quality/baseline.json`, si le nombre de tests monte.
- `harnais: oui` parce que la boucle est le harnais. Ce ticket ne change aucun contrôle : il corrige
  des mesures.
- Forme attendue, à partir des faits observés :
  - les compteurs propres à un tour (`num_turns`, `usage`) s'additionnent sur tous les messages
    `result` ;
  - les compteurs déjà cumulés (`total_cost_usd`, `modelUsage`) se prennent sur le dernier ;
  - `duree_s` est le temps mesuré par la boucle entre le lancement et la fin du processus ;
  - le rapport dit combien de fins de tour la session a eues ;
  - un passage de sous-agent est compté une fois, qu'il ait été lancé par `Agent` ou repris par
    `SendMessage`, avec son rôle.
- Le nommage des fichiers d'un lancement est libre. Une seule contrainte : un lancement n'efface ni ne
  réécrit les fichiers d'un lancement précédent du même ticket.
- À ne pas toucher :
  - la séquence d'outils ajoutée par le ticket qui précède, sauf pour suivre le nommage des fichiers ;
  - les hooks et les skills ;
  - `scripts/check.mjs` ;
  - les tickets existants et le code du produit.
- Les tests existants de `tests/ticket-loop.test.cjs` gardent toutes leurs assertions.

## Critères d'acceptation

Les critères 1 à 4 se vérifient par des tests de `tests/ticket-loop.test.cjs`.

1. Prenons un flux avec deux messages `result` : le premier avec `num_turns` 30 et 20 000 tokens
   produits, le second avec `num_turns` 1, 167 tokens produits et un `total_cost_usd` cumulé.
   L'événement `session-terminee` rapporte alors :
   - 31 tours ;
   - 20 167 tokens produits ;
   - le coût du second message ;
   - deux fins de tour ;
   - une durée qui suit le temps réel du processus, et non le `duration_ms` du dernier tour.
2. Un sous-agent lancé une fois puis repris deux fois compte trois passages dans `sous_agents`, chacun
   avec son rôle, ses tokens, ses outils et sa durée. Un passage n'est jamais compté deux fois.
3. Lancer deux fois le même ticket laisse les flux des deux lancements sur le disque, et
   `retro-entree.md` cite celui du lancement en cours.
4. Le message affiché en fin de session (`Session <n> : … tours, … s`) et `retro-entree.md` donnent
   les chiffres corrigés.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Un nouveau test dans `tests/ticket-loop.test.cjs`, nommé d'après le comportement, par exemple « a
session that ends several turns is measured over all of them, and every sub-agent run counts once ».
Frontière : `scripts/loop/run.mjs` lancé comme un processus par `loopRepo`, avec un scénario du faux
`claude`. Ce scénario écrit les messages `task_started` et `task_notification` avec la forme observée
dans le flux de T003 (`task_id`, `subagent_type`, `usage.total_tokens`, `usage.tool_uses`,
`usage.duration_ms`), puis deux messages `result`.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La répartition entre compteurs par tour et compteurs cumulés vient d'un seul lancement observé, le
premier de T003. Si l'implémentation trouve dans un flux conservé un fait qui la contredit, elle suit le
fait. Elle le cite dans le journal.

## Journal
