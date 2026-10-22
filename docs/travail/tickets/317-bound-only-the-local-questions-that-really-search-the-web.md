---
id: T317
titre: Bound only the local questions that really search the web
statut: a-faire
bloque_par: T316
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

L'échéance de 14 s de T316 ne vise plus que les questions locales qui cherchent vraiment sur le web. Une question
purement vidéo, ou une question pour laquelle la décision ou la règle dit de ne pas chercher, garde le plafond qu'elle
avait sans port de récupération. Elle n'échoue donc plus en délai dépassé à la moindre contention du GPU.

## Sources

- Réserve de clôture de T316 (`docs/travail/tickets/316-extract-readable-pages-and-bound-local-web-latency.md`, journal) :
  avec un port configuré, une question de chat purement vidéo reçoit aussi l'échéance de 14 s ; question posée au
  propriétaire.
- Mesures de la session expériences, le 23/10, questions vidéo seules en flux réel : maximum par essai J2 10,0 s,
  J3 11,8 s, J6 10,5 s (J5b, abandonné, 12,6 s). La marge n'est que de 2 à 4 s. Les questions O avec `inspect_clip` réel
  n'ont été mesurées qu'hors ligne (H1 : médiane 8,7 s, un cas à 235 s).
- Demande de la session expériences, le 23/10, après ses mesures : n'appliquer l'échéance qu'aux questions qui
  cherchent vraiment (décision web vraie, ou règle vraie en `auto` ou `always`) ; les autres gardent leur plafond actuel.
- Code à `0ecee6a` :
  - `adapters/ollama/question-agent.cjs` : `answer` (`:108-125`, échéance armée dès l'entrée si `#webEligible`),
    `#withinWebDeadline` (`:130-134`), `run` (`:136-143`, plafond `QUESTION_TIMEOUT_MS`), `#webEligible` (`:177-179`),
    `#webPages` (`:181-186`, choix entre décision, `always` et règle), `#decideAndRetrieve` (`:190-200`), `#decide`
    (`:204-219`), `#retrieve` (`:223-234`), `#abandonable` (`:238-…`) ; constantes `WEB_DECISION_TIMEOUT_MS`,
    `WEB_RETRIEVAL_TIMEOUT_MS`, `WEB_QUESTION_TIMEOUT_MS` (`:21-28`) ;
  - `core/deep-ask.cjs:13` : `QUESTION_TIMEOUT_MS = 300000` ;
  - ADR 0068 (`docs/adr/0068-la-recherche-web-locale-lit-les-pages-avec-readability-et-borne-la-question-a-14-s.md`),
    lignes 36-44 et 65-70 : échéance de toute question éligible et sa limite connue ;
  - tests de T316 dans `tests/ollama-question-agent.test.cjs` (critères 5 à 8 de T316 : échéances en temps virtuel,
    abandon d'une réponse sourde à 14 s pour les trois déclencheurs, file, annulation).

## Périmètre

- À modifier : `adapters/ollama/question-agent.cjs`, `tests/ollama-question-agent.test.cjs`, l'ADR 0068 (section de
  l'échéance et limite connue, corrigées avec une ligne datée qui renvoie à ce ticket), `docs/architecture.md` s'il
  décrit l'échéance.
- Une question cherche vraiment quand une récupération va partir : `always` ; `auto` avec `callsForWeb` vrai ; `model`
  avec une décision `web` et une requête, ou une décision en échec avec `callsForWeb` vrai. Seule une telle question est
  soumise à l'échéance de 14 s, toujours comptée depuis son entrée dans `answer`, file interne comprise.
- Une question qui ne cherche pas (`auto` avec règle fausse ; `model` avec décision `no-web`, ou décision en échec et
  règle fausse) garde le seul plafond `QUESTION_TIMEOUT_MS`, comme sans port. Avec `model`, la décision garde son délai
  de 1,5 s.
- Pour `auto` et `always`, le classement est connu dès l'entrée. Pour `model`, il l'est à la fin de la décision : une
  question classée « cherche » alors que ses 14 s sont déjà écoulées s'arrête là avec
  `TVLENS_OLLAMA_QUESTION_TIMEOUT`, sans récupération ni appel de réponse ; une question classée « ne cherche pas » n'est
  jamais coupée à 14 s, même si sa décision a commencé tard.
- Abandon, annulation, fermeture, sérialisation de la file et absorption des résultats tardifs restent ceux de T316.
- À ne pas toucher : les budgets de décision et de récupération, la règle `callsForWeb`, le prompt de décision,
  l'extraction des pages, `core/deep-ask.cjs`.

## Critères d'acceptation

1. Déclencheur `auto`, port configuré, question purement vidéo (règle fausse) dont la réponse arrive à 20 000 ms en
   temps virtuel : la réponse est rendue, sans `TVLENS_OLLAMA_QUESTION_TIMEOUT`. Le test échoue avant la correction.
2. Déclencheur `model`, décision `no-web` puis réponse à 20 000 ms : la réponse est rendue. Décision en échec et règle
   fausse : de même.
3. Déclencheurs `always`, `auto` avec règle vraie, `model` avec décision `web` : une réponse sourde est toujours abandonnée
   à 14 000 ms depuis l'entrée avec `TVLENS_OLLAMA_QUESTION_TIMEOUT` ; les tests de T316 sur ces chemins passent sans
   modification de leurs assertions.
4. Déclencheur `model`, question restée en file au-delà de 14 000 ms puis classée « cherche » : arrêt avec
   `TVLENS_OLLAMA_QUESTION_TIMEOUT` sans appel au port ni appel de réponse ; classée « ne cherche pas » : elle répond.
5. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/ollama-question-agent.test.cjs` : une question purement vidéo avec le déclencheur `auto`, un port factice et une
réponse lente en temps virtuel, jusqu'au résultat rendu par DeepAsk.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 23/10, orchestrateur : ticket ouvert depuis la réserve de clôture de T316, les mesures et la demande de la session
  expériences.
