---
id: T003
titre: Never start a ticket that still waits for an owner decision
statut: a-faire
bloque_par: T002
adr: non
installe: non
harnais: oui
supprime_tests: non
---

## Ce que le ticket livre

Aujourd'hui, la boucle lance une session entière sur un ticket dont la section « Hypothèses
bloquantes » pose encore une question au propriétaire : la session coûte son prix fixe pour répondre
BLOQUÉ, ou tranche à sa place. Après ce ticket, la boucle ne choisit jamais un tel ticket, continue
avec les tickets prêts qui n'en dépendent pas, et dit lesquels attendent une décision.

## Sources

- Constats : ESSAI-06
- Convention des tickets de cette file : la section « Hypothèses bloquantes » commence par l'une de
  deux phrases exactes, « Aucune décision n'est attendue. » ou « Décision attendue du propriétaire : »
  suivie de la question. Le propriétaire tranche en remplaçant la question par sa décision, c'est-à-dire
  en faisant commencer la section par autre chose que « Décision attendue du propriétaire ».
- Code concerné, à la version `0d5a954` :
  - `scripts/loop/tickets.mjs`, fonction `describe` (lignes 36 à 49) : ne lit que l'en-tête du ticket.
  - `scripts/loop/tickets.mjs`, fonction `next` (lignes 81 à 96) : choisit le premier ticket `a-faire`
    dont les bloqueurs sont `termine`, sans rien lire d'autre.
  - `scripts/loop/run.mjs`, fonction `preflight` (ligne 82) et fin du fichier (lignes 265 à 281) : le
    message affiché quand aucun ticket n'est prêt, et la sortie de `--dry-run`.
  - `tests/ticket-loop.test.cjs` : tests de `describe` et de `next` (lignes 99 à 124), `loopRepo`
    (ligne 84), « a dry run names the next ticket and changes nothing » (ligne 277).
  - `docs/travail/tickets/_gabarit.md`, section « Hypothèses bloquantes ».
  - `docs/travail/README.md`, sections « Lancer », « Débloquer un ticket » et « Écrire un ticket ».
  - `.claude/skills/decoupage/SKILL.md`, section « Écrire ».

## Périmètre

- À modifier : `scripts/loop/tickets.mjs` ; `scripts/loop/run.mjs` pour les messages ;
  `tests/ticket-loop.test.cjs` ; `docs/travail/tickets/_gabarit.md` ; `docs/travail/README.md` ;
  `.claude/skills/decoupage/SKILL.md` ; `scripts/quality/baseline.json` si le nombre de tests monte.
- `harnais: oui` parce que la boucle et les skills sont le harnais. Le contrôle ajouté est plus strict
  que l'existant : il retire un lancement, il n'en autorise aucun de plus.
- Forme attendue : `describe` rend un champ de plus, la question en attente ou rien. `next` écarte un
  ticket qui attend une décision comme il écarte un ticket dont un bloqueur n'est pas terminé. Un ticket
  qui dépend d'un ticket en attente reste bloqué par lui, sans règle nouvelle.
- À ne pas toucher : les hooks de `.claude/hooks/`, `scripts/check.mjs`, `.claude/skills/ticket/`, les
  agents de `.claude/agents/`, les tickets existants, le code du produit.
- Les tests existants de `tests/ticket-loop.test.cjs` gardent toutes leurs assertions.

## Critères d'acceptation

Chaque critère se vérifie par un test de `tests/ticket-loop.test.cjs`.

1. `next` ne rend jamais un ticket `a-faire` dont la section « Hypothèses bloquantes » commence par
   « Décision attendue du propriétaire », même si tous ses bloqueurs sont `termine`.
2. Avec un tel ticket en tête de file et un ticket prêt derrière lui qui n'en dépend pas, `next` rend
   le second.
3. Quand il ne reste que des tickets en attente de décision, ou des tickets qui en dépendent, la raison
   rendue par `next` nomme les tickets qui attendent une décision.
4. `--ticket <id>` sur un ticket en attente de décision est refusé avant toute session, avec un message
   qui cite la question ; aucun fichier n'est modifié et le code de sortie est 1.
5. Un ticket dont la section commence par « Aucune décision n'est attendue. », ou par une décision
   écrite à la place de la question, est choisi comme aujourd'hui.
6. `--dry-run` sur une file dont le premier ticket attend une décision annonce le premier ticket prêt
   et ne lance rien.
7. Le gabarit, la skill `decoupage` et `docs/travail/README.md` disent la convention des deux phrases
   et comment trancher. Vérification : `grep` sur les trois fichiers, sortie dans le journal.
8. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Un nouveau test dans `tests/ticket-loop.test.cjs`, nommé d'après le comportement — par exemple « a
ticket that still waits for an owner decision is never started, and the tickets that do not depend on
it go on ». Frontière : `next` appelé sur des tickets décrits par `describe`, comme le test « the next
ticket is the first one to do whose blockers are all finished » ; pour les critères 4 et 6,
`scripts/loop/run.mjs` lancé comme un processus par `loopRepo`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le drapeau `harnais: oui` a été posé au découpage et attend la relecture
du propriétaire avant le premier lancement. Si la convention des deux phrases ne suffit pas à
distinguer un ticket tranché d'un ticket en attente sur les tickets présents dans
`docs/travail/tickets/` : verdict BLOQUÉ, avec les tickets qui posent problème.

## Journal

