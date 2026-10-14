---
id: T142
titre: Show the retrospective every tool the orchestrator called, in order and timed
statut: a-faire
bloque_par: T003, T145
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau:
---

## Ce que le ticket livre

La rétrospective d'un ticket ne lit aujourd'hui qu'un résumé chiffré de chaque tentative : tours,
durée, coût et sous-agents. Ce que l'orchestrateur a fait ne lui est pas montré : quel outil, dans quel
ordre, à quel moment, et quand la session a fini un tour. Elle peut aller le chercher dans le flux, mais
ne le fait pas. Elle a donc manqué deux reprises de sous-agent par `SendMessage` et une session restée
suspendue un quart d'heure après son verdict. Après ce ticket, l'entrée de la rétrospective donne, pour
chaque tentative, la suite chronologique des appels d'outils de l'orchestrateur et des fins de tour.

## Sources

- Constat : ESSAI-08.
- Faits observés sur T003, le 14/10 :
  - Premier lancement :
    - la session démarre à 09:24:27 et ne se termine qu'à 09:41:58, sur un arrêt manuel du processus
      (`.harness-state/loop/events.jsonl`, événements `session` et `session-terminee`) ;
    - entre son verdict et cet arrêt, une boucle Bash en arrière-plan attendait le transcript d'un
      explorateur repris par `SendMessage` ;
    - la rétrospective de ce lancement n'en a rien dit.
  - Second lancement (`.harness-state/tickets/T003/session-1.jsonl`, 1 189 lignes) :
    - l'orchestrateur appelle 42 outils : 30 Bash, 4 Agent, 2 SendMessage, 2 ToolSearch, 1 ListAgents,
      1 Read, 1 Edit, 1 Write ;
    - les sous-agents en appellent 196 ;
    - `retro-entree.md` (50 lignes) ne cite aucun de ces appels, et aucune des 7 observations de
      `retro.json` ne parle de `SendMessage` ni d'une reprise.
- Code concerné, à la version `a5b9dd3` :
  - `scripts/loop/run.mjs`, fonction `actions` (lignes 140 à 155) : elle formate déjà une ligne par
    appel d'outil, c'est-à-dire le nom et la cible, avec un retrait pour les appels d'un sous-agent
    (`parent_tool_use_id`). Ces lignes ne vont qu'à la console.
  - `scripts/loop/run.mjs`, fonction `streamSession` (lignes 166 à 205) : elle seule connaît le temps
    écoulé (`clock`). Elle garde le dernier message `result` (ligne 193) et écrit le flux brut dans
    `session-<tentative>.jsonl`.
  - `scripts/loop/retro.mjs`, fonction `digest` (lignes 58 à 83) : elle écrit `retro-entree.md`. Par
    tentative, elle donne une ligne de chiffres, les sous-agents, les refus et le chemin du flux.
  - `tests/ticket-loop.test.cjs` :
    - `FAKE_SESSION` (ligne 22), le faux `claude` ;
    - le test « after a ticket, a read-only retrospective proposes harness changes… » (ligne 448),
      qui lit `retro-entree.md`.

## Périmètre

- À modifier :
  - `scripts/loop/run.mjs` ;
  - `scripts/loop/retro.mjs` ;
  - `tests/ticket-loop.test.cjs`, pour un scénario du faux `claude` qui écrit des messages
    `assistant` avec des appels d'outils et deux messages `result` ;
  - `scripts/quality/baseline.json`, si le nombre de tests monte.
- `harnais: oui` parce que la boucle est le harnais. Ce ticket n'ajoute ni ne retire aucun contrôle :
  il change ce que lit la rétrospective.
- Forme attendue :
  - la séquence est notée par la boucle pendant la session, parce que le temps écoulé n'est pas dans le
    flux ;
  - elle est gardée à côté du flux, dans un fichier par tentative ;
  - `digest` l'inclut.
- Chaque ligne donne :
  - le temps écoulé depuis le début de la session ;
  - le nom de l'outil et sa cible, comme `actions` ;
  - pour `SendMessage`, le destinataire ;
  - une marque quand l'appel demande l'arrière-plan (`run_in_background: true`).
- Chaque message `result` donne une ligne « fin de tour ». La fin du processus en donne une aussi, avec
  son heure.
- Les appels des sous-agents ne sont pas listés un à un : ils restent résumés par sous-agent, comme
  aujourd'hui.
- À ne pas toucher :
  - le calcul des chiffres de session (`sessionReport`), qui relève d'un autre ticket ;
  - les hooks et les skills ;
  - `scripts/check.mjs` ;
  - le schéma des observations et la consigne de la rétrospective (`prompt` dans `retro.mjs`), sauf
    pour y nommer la nouvelle section ;
  - les tickets existants et le code du produit.
- Les tests existants de `tests/ticket-loop.test.cjs` gardent toutes leurs assertions.

## Critères d'acceptation

Les critères 1 à 4 se vérifient par des tests de `tests/ticket-loop.test.cjs`.

1. Après une tentative dont le flux contient des appels d'outils de l'orchestrateur, `retro-entree.md`
   les liste dans l'ordre du flux, chacun avec un temps écoulé, son outil et sa cible.
2. Un appel `SendMessage` y figure avec son destinataire. Un appel qui demande l'arrière-plan y porte
   une marque visible.
3. Chaque message `result` du flux y donne une ligne de fin de tour. La fin du processus y figure après
   la dernière, avec son temps écoulé.
4. Les appels faits par un sous-agent n'y sont pas listés un à un.
5. Au-delà d'un nombre d'appels fixé dans le code, `digest` le dit et donne combien de lignes il omet.
   Il n'y a pas de coupe muette. Vérification : un test, ou la constante et sa ligne citées dans le
   journal.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Un nouveau test dans `tests/ticket-loop.test.cjs`, nommé d'après le comportement, par exemple « the
retrospective reads every tool the orchestrator called, with its time, and each end of turn ».
Frontière : `scripts/loop/run.mjs` lancé comme un processus par `loopRepo`, avec un scénario du faux
`claude`, comme le test de la ligne 448. Le faux `claude` écrit dans l'ordre :

- un appel `Agent` ;
- un appel `SendMessage` ;
- un appel `Bash` en arrière-plan ;
- un appel fait par un sous-agent (`parent_tool_use_id` renseigné) ;
- deux messages `result`.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le temps écoulé est celui de réception par la boucle, pas celui de l'appel dans la session. L'écart est
négligeable pour repérer une attente de plusieurs minutes, ce qui est le but.

## Journal
