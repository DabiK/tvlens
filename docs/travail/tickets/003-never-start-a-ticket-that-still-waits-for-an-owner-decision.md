---
id: T003
titre: Never start a ticket that still waits for an owner decision
statut: termine
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


### Tentative 1 — BLOQUÉ après l'exploration

Le hook `.claude/hooks/guard-write.mjs` refusait en boucle toute écriture de `docs/travail/tickets/_gabarit.md`,
qui est dans le périmètre (critère 7). Verdict BLOQUÉ, aucun code écrit. Rapport : `.harness-state/tickets/T003/exploration.md`.

### Reprise — décision du propriétaire constatée

- `b929684` (11:43) : un ticket `harnais: oui` peut modifier le gabarit, jamais un autre ticket ; test dans
  `tests/agent-guards.test.cjs`. Environnement de la session : `TVLENS_HARNESS=1`, `TVLENS_LOOP=1`.
- L'exploration (11:31) est postérieure au dernier changement de `scripts/loop/` et de `tests/ticket-loop.test.cjs`
  (`7097a5d`, 11:17) ; `b929684` ne touche que la section « Garde-fous » de `docs/travail/README.md`, hors des
  sections visées. Exploration reprise sans nouvelle passe.

### Exploration (résumé)

- `describe` reçoit déjà le texte entier mais ne lit que l'en-tête ; `next` choisit le premier `a-faire` dont les
  bloqueurs sont `termine` et rend `{ ticket }` ou `{ reason }`.
- `run.mjs` : `if (!ticket) stop(0, reason)` avant toute écriture liée au ticket ; un `--ticket` refusé sort aujourd'hui
  en 0 alors que le README annonce « 1 refus au démarrage ».
- Convention des deux phrases vérifiée sur les 140 tickets : 137 « Aucune décision n'est attendue. », 3 « Décision
  attendue du propriétaire : » (T138, T139, T140), aucun autre début : la condition BLOQUÉ du ticket ne se déclenche pas.
- Le gabarit dit encore « Vide si rien » ; le README (« Lancer », « Débloquer », « Écrire ») et la skill `decoupage`
  ne disent rien de la convention.
- Le plancher `cas_de_test` est resserré par la boucle à l'intégration : la session ne touche pas `baseline.json`.

### Décision de l'orchestrateur

Tout `--ticket` refusé au démarrage (inconnu, pas prêt, en attente de décision) sort en 1, comme le README l'annonce
déjà : un code 1 pour le seul cas « en attente » et 0 pour un ticket inconnu serait incohérent. Le changement retire un
lancement sans en autoriser aucun. La file sans ticket prêt (sans `--ticket`) reste en 0.

### Implémentation (passe 1)

- `describe` rend `decisionAttendue` (question normalisée, ou `""` ; « (question non écrite dans le ticket) » si la
  phrase est là sans question) ; `next` n'estime jamais prêt un ticket qui attend, cite la question sur `--ticket` et
  nomme les tickets en attente quand plus rien n'est prêt. `run.mjs` : un `--ticket` refusé sort en 1.
- Gabarit, skill `decoupage` et README (« Lancer », « Débloquer un ticket », « Écrire un ticket », plus la ligne
  « refus avant toute session » de « Lire un échec », gardée parce que le code de sortie change).
- Rapporté par l'implémenteur : `node --test tests/ticket-loop.test.cjs` 43/43 (38 avant) ; `node scripts/check.mjs
  --changed` vert, Prettier et ESLint « non lancés » (non installés).
- Écart relevé par l'orchestrateur : « dit lesquels attendent une décision » n'était tenu que lorsque rien n'est prêt.
  Renvoyé à l'implémenteur : une ligne par lancement qui nomme les tickets en attente quand un ticket est choisi.

### Implémentation (passe 2)

- `awaitingDecision(tickets)` (une seule source pour la règle) ; `run.mjs` nomme une fois par lancement, au premier
  ticket choisi (`--dry-run` compris), les tickets en attente ; pas de doublon avec la raison d'arrêt. README « Lancer »
  mis à jour. Rapporté par l'implémenteur : 44/44 tests de la boucle ; `check --changed` vert ; `check` complet vert
  (674 tests JS, 84 Python dont 1 sauté), Prettier et ESLint non installés.

### Relecture 1 — accepté (constats mineurs)

`node scripts/loop/reviewed-state.mjs record` → `revue-1.diff`, `revue-1.fichiers` (6 fichiers). Relecteur neuf :
VERDICT accepté, critères 1 à 7 couverts, 8 non lancé par lui. Constats mineurs : (1) sortie `grep` du critère 7 absente
du journal ; (2) code 1 aussi pour `--ticket` quand un autre ticket est `en-cours`/`bloque`, sans test ni mention au
README ; (3) un ticket `termine` qui garde la phrase d'attente serait refusé avec le mauvais motif ; (4) le gabarit commence
par une consigne, donc un ticket copié sans remplir la section part comme tranché ; (5) `decisionAttendue` est un
identifiant français, comme ses voisins `bloquePar`, `supprimeTests`. Décision : (2) et (3) renvoyés à l'implémenteur
puis nouvelle relecture ; (4) et (5) laissés au propriétaire ; (1) ci-dessous.


### Implémentation (passe 3) et relecture 2 — accepté

- Renvoyés à l'implémenteur : `waitsForOwner` (un ticket `a-faire` qui pose la question) sert à `awaitingDecision` et à
  `--ticket`, donc un ticket `termine` qui garde la phrase reçoit « n'est pas prêt » ; cas testé. Code 1 quand un autre
  ticket `en-cours` arrête la file sur `--ticket` : testé par processus (vu rouge par mutation ciblée), ajouté au README.
- `node scripts/loop/reviewed-state.mjs record` → `revue-2.diff`. Relecteur neuf : VERDICT accepté. Constat retenu :
  la section « Ordre » de la skill `decoupage` décrivait encore le ticket prêt sans la condition de décision.

### Correction de l'orchestrateur et relecture 3 — accepté

- `.claude/skills/decoupage/SKILL.md`, « Ordre », point 3 : « … et qui n'attend aucune décision du propriétaire ».
- `node scripts/check.mjs --changed` : vert (44/44 tests de la boucle ; Prettier et ESLint non lancés, non installés).
- `node scripts/check.mjs` : vert — règles ✔, cliquet ✔ (`cas_de_test` 627 → 642), tests JS 674/674 sur 74 fichiers,
  tests Python 84 OK (1 sauté) ; format et lint « non lancés » (Prettier et ESLint non installés).
- `node scripts/loop/reviewed-state.mjs record` → `revue-3.diff` (6 fichiers). Relecteur neuf : VERDICT accepté, critères
  1 à 7 couverts. Constats mineurs laissés au propriétaire (voir plus bas).

### Critère 7 — convention et façon de trancher dans les trois documents

```
$ grep -n "Aucune décision n'est attendue\|Décision attendue du propriétaire\|tranche en remplaçant\|Pour le trancher" docs/travail/tickets/_gabarit.md .claude/skills/decoupage/SKILL.md docs/travail/README.md
docs/travail/tickets/_gabarit.md:41:« Aucune décision n'est attendue. », ou
docs/travail/tickets/_gabarit.md:42:« Décision attendue du propriétaire : » suivie de ce qui doit être tranché avant de commencer.
docs/travail/tickets/_gabarit.md:43:La boucle ne lance pas un ticket qui attend une décision. Le propriétaire tranche en remplaçant la
.claude/skills/decoupage/SKILL.md:53:- « Aucune décision n'est attendue. » ;
.claude/skills/decoupage/SKILL.md:54:- « Décision attendue du propriétaire : » suivie de la question à trancher avant de commencer.
.claude/skills/decoupage/SKILL.md:57:dépendent pas et nomme ceux qui attendent. Le propriétaire tranche en remplaçant la question par sa
docs/travail/README.md:60:la section commence par « Décision attendue du propriétaire : » n'est jamais lancé : il reste `a-faire`,
docs/travail/README.md:225:« Décision attendue du propriétaire : » n'est pas `bloque` : il reste `a-faire`, la boucle ne le lance
docs/travail/README.md:226:pas et continue sans lui. Pour le trancher, remplacer la question par la décision, au début de la
docs/travail/README.md:249:  « Aucune décision n'est attendue. », ou
docs/travail/README.md:250:  « Décision attendue du propriétaire : » suivie de la question. La boucle ne lance pas un ticket qui
docs/travail/README.md:252:  attendent. Le propriétaire tranche en remplaçant la question par sa décision, au début de la section ;
```

L'arbre est identique à `revue-3.diff` (comparaison des lignes `+`/`-` de `git diff` sur les 6 fichiers).

### Laissé au propriétaire

- `docs/travail/tickets/INDEX.md:162-163` dit encore que la boucle « lancerait leur session comme une autre » : faux
  désormais ; hors périmètre et refusé par le hook en boucle.
- T139 demande un « accord écrit du propriétaire dans le journal » : la boucle ne lit que le début de la section ; pour
  trancher T139, réécrire ce début et le reste de sa section.
- Le gabarit commence par une consigne : un ticket copié sans remplir la section part comme tranché. Piste : faire
  commencer le gabarit par la phrase d'attente, pour qu'un oubli retienne le ticket.
- La question citée par `--ticket` est toute la section aplatie (environ 750 caractères pour T138 et T139).
- `decisionAttendue` est un identifiant français, comme ses voisins `bloquePar` et `supprimeTests`.
- Un `--ticket` refusé sort en 1 dans tous les cas (inconnu, pas prêt, file arrêtée), au-delà de la lettre du critère 4 ;
  quand un autre ticket arrête la file, le message nomme ce ticket et non la question.

### Verdict

TERMINÉ : critères 1 à 8 couverts, relecture 3 acceptée, `node scripts/check.mjs` vert.
