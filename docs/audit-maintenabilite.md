# Audit de maintenabilité de TVLens

Rapport écrit dans la nuit du 13 au 14 octobre 2026, sur la branche `refactor/maintenabilite`. Les
audits ont lu le code à la version `8627b46` ; les verdicts et les tickets sont écrits contre `0d5a954`.
La liste des tickets et leur ordre sont dans [travail/tickets/INDEX.md](travail/tickets/INDEX.md), le
mode d'emploi de la boucle dans [travail/README.md](travail/README.md), ce qui reste à décider dans
[travail/nuit-2026-10-14.md](travail/nuit-2026-10-14.md).

## En bref

- **Ce qui presse n'est pas dans le produit, c'est dans ce qui permet de le modifier sans crainte.** Les
  quinze constats de priorité P0 portent tous sur le filet : des tests qui échouent sous charge ou ne se
  terminent pas (lot L01), des tests qui lisent le texte du code au lieu de son comportement et se
  vident au premier formatage (L02), l'absence de formateur, de lint et d'intégration continue (L03),
  trois angles que le premier passage avait manqués — journal, formats sur disque, contrat de fil entre
  le Mac et la TV (L17) — et deux défauts du harnais lui-même (L18).
- **Le travail de fond existe mais vient après.** Deux orchestrations d'hôte parallèles, une classe et
  une fonction qui portent trop (`HeadlessRuntime`, `createSessionRuntime`), une interface Mac et un
  companion TV à découper : ce sont les lots L11 à L16. Ils ne sont pas découpés en entier : chacun a
  ses premiers tickets et une fiche de chantier, parce que les lots qui précèdent changent le terrain.
- **L'ordre des lots est l'ordre de sécurité.** D'abord un filet fiable, puis les outils, puis les
  retouches larges, enfin les refontes. Lancer un lot de la seconde vague avant que la première soit
  passée, c'est refondre du code que ses tests ne protègent pas encore.
- **Aucun constat des audits n'a été réfuté, et c'est à lire avec prudence.** Sur 206 constats relus
  par un second lecteur, 50 sont confirmés tels quels et 156 sont nuancés : le constat tient, sa
  description a été corrigée. Les constats écartés le sont au découpage en tickets, quand le rédacteur
  ne retrouve pas le fait dans le code. Un second lecteur qui ne réfute jamais peut être un lecteur
  indulgent : la priorité d'un constat se discute, son existence a été revérifiée dans le code.
- **Un seul ticket est passé par la boucle.** Les autres attendent une relecture : ils sont écrits et
  relus par des agents, pas par leur propriétaire.

## Comment lire ce rapport

Chaque constat porte un identifiant, un verdict, une preuve localisée et une suite.

| Préfixe | Origine | Ce qui a été lu |
| --- | --- | --- |
| `CORE` | audit du cœur et de la composition | `core/`, `runtime/`, composition des deux hôtes |
| `ADP`, `SEC` | audit des adaptateurs et des frontières | `adapters/`, `server/`, `mcp/`, entrées et sorties |
| `UI`, `TV`, `PY` | audit des interfaces | `app/`, `tv/`, scripts Python côté TV |
| `FLK` | audit du déterminisme | tests instables, attentes, horloges, ports, disque |
| `DOC` | audit de la documentation et du dépôt | `docs/`, `README.md`, fichiers à la racine |
| `OPS` | audit des scripts et de l'outillage | `scripts/`, `package.json`, livraison |
| `TSTA`, `TSTB`, `TSTC` | trois audits des tests | tests par chantier, par comportement, des interfaces |
| `GAP1`, `GAP2`, `GAP3` | trois audits complémentaires | journal, formats sur disque, contrat de fil |
| `OUBLI` | signalements des seconds lecteurs | ce qu'ils ont vu en passant, hors du constat relu |
| `ESSAI` | essai de la boucle sur un ticket réel | le harnais lui-même |

Le **verdict** dit ce qu'il reste du constat après relecture contre le code :

- **confirmé** — un second lecteur a rouvert le code et retrouvé le constat tel quel ;
- **nuancé** — le constat tient, mais sa description, son ampleur ou son remède ont été corrigés. La
  correction est écrite sous le constat et c'est elle qui fait foi ;
- **écarté** — le code à la version `0d5a954` ne confirme pas, ou plus, le constat. La raison est donnée.

Un signalement `OUBLI` n'a ni verdict de second lecteur ni priorité : il a été lu par un seul agent,
puis vérifié dans le code par le rédacteur du ticket qui le traite. Son verdict vient de cette
vérification.

La **priorité** (P0 à P3), l'**effort** (S, M, L) et le **risque** sont ceux du second lecteur. P0 :
à traiter avant tout autre travail sur la zone. P3 : confort.

La **suite** est soit un ou plusieurs tickets, soit un report avec sa raison et le moment où le
reprendre, soit un abandon avec sa raison. Le remède et son risque ne sont détaillés ici que pour les
constats sans ticket : pour les autres, le ticket fait foi.

Les lots sont présentés dans l'ordre d'exécution. La première vague (L18, L01 à L10, L17) est
découpée en entier. La seconde (L11 à L16) a ses premiers tickets et une fiche de chantier dans
`docs/travail/fiches/`.

## Méthode et limites

1. **Neuf audits** ont lu une copie figée du dépôt à la version `8627b46`, chacun sur une zone, sans
   rien modifier.
2. **Un second lecteur par audit** a rouvert le code pour chaque constat, avec la consigne de le
   réfuter, et lui a donné un verdict, une priorité, un effort et un risque. Ces lecteurs ont signalé
   au passage 59 points hors de leur constat.
3. **Un critique de complétude** a cherché ce que les neuf audits avaient laissé de côté : huit
   angles. Les trois plus importants ont été audités et relus de la même façon ; les cinq autres ne
   l'ont pas été (dernière section du rapport).
4. **Le découpage** a rangé les constats en dix-huit lots. Pour chaque lot, un rédacteur a écrit les
   tickets en relisant le code à la version `0d5a954`, un relecteur les a contrôlés contre le code et
   contre la règle « une session, un commit ». La cohérence de l'ensemble (dépendances résolues et sans
   cycle, jalons, constats cités) est contrôlée par le script d'assemblage. Le critique de cohérence
   prévu n'a pas tourné : le découpage a pris plus de cinq heures, et il a été écarté pour finir.
5. **L'essai de la boucle** a fait passer un ticket réel, de bout en bout. Ce qu'il a montré du
   harnais est dans le lot L18.

Limites à garder en tête :

- Le harnais (`.claude/`, `scripts/check.mjs`, `scripts/quality/`, `scripts/loop/`) n'existait pas dans
  la copie auditée : seuls l'essai de la boucle et la lecture faite en préparant la file le couvrent.
- Rien n'a été exécuté sur la TV, sur le VPS ni contre un fournisseur réel. Les constats qui touchent
  ces parties viennent de la lecture du code et des tests locaux.
- Le formatage et le lint n'ont pas été lancés sur le dépôt : les chiffres cités viennent d'un essai à
  blanc sur une copie.
- Aucun constat n'a été vérifié par son propriétaire. Tout ce qui est écrit ici est une lecture
  d'agents, recoupée par d'autres agents.
- Le rapport est long parce qu'il garde la preuve de chaque constat. Pour décider, lire « En bref »,
  les tableaux de « Chiffres », puis l'index des tickets ; ne descendre dans un lot qu'au moment de
  relire ses tickets.
- Les pièces de travail de l'audit (rapports bruts, verdicts, briefs de lots) sont copiées dans
  `.harness-state/audit/` sur ce Mac, hors Git.

## Chiffres

| Origine | Constats | Confirmés | Nuancés | Écartés | Avec ticket | Sans ticket |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Les neuf audits | 176 | 48 | 128 | 0 | 112 | 64 |
| Les trois audits complémentaires | 30 | 2 | 28 | 0 | 13 | 17 |
| Signalements des relecteurs | 59 | 34 | 25 | 0 | 29 | 30 |
| Essai de la boucle | 9 | 9 | 0 | 0 | 6 | 3 |
| **Total** | 274 | 93 | 181 | 0 | 160 | 114 |

| Priorité | Constats | Avec ticket | Sans ticket |
| --- | ---: | ---: | ---: |
| P0 | 15 | 14 | 1 |
| P1 | 61 | 45 | 16 |
| P2 | 101 | 64 | 37 |
| P3 | 38 | 8 | 30 |

Les signalements des relecteurs n'ont pas de priorité : ils n'ont pas été classés par un second lecteur. 143 tickets au total, dont 3 attendent une décision.

Détail par audit :

| Audit | Constats | Confirmés | Nuancés | Écartés | Avec ticket | Sans ticket |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Cœur et composition (`core/`, `runtime/`) | 21 | 7 | 14 | 0 | 6 | 15 |
| Adaptateurs et frontières | 21 | 5 | 16 | 0 | 11 | 10 |
| Interfaces (Mac, TV, scripts Python) | 21 | 11 | 10 | 0 | 13 | 8 |
| Déterminisme des tests | 17 | 2 | 15 | 0 | 16 | 1 |
| Documentation et dépôt | 19 | 5 | 14 | 0 | 13 | 6 |
| Scripts et outillage | 20 | 3 | 17 | 0 | 17 | 3 |
| Tests nommés par chantier | 18 | 3 | 15 | 0 | 9 | 9 |
| Tests de comportement | 19 | 5 | 14 | 0 | 12 | 7 |
| Tests des interfaces | 20 | 7 | 13 | 0 | 15 | 5 |
| Complément : journal et diagnostic d'une panne | 10 | 1 | 9 | 0 | 5 | 5 |
| Complément : formats écrits sur disque | 10 | 1 | 9 | 0 | 4 | 6 |
| Complément : contrat de fil entre parties déployées | 10 | 0 | 10 | 0 | 4 | 6 |
| Essai de la boucle sur un ticket réel | 9 | 9 | 0 | 0 | 6 | 3 |

## Constats, lot par lot

Les lots sont dans l'ordre d'exécution des tickets. Dans chaque lot, les constats sont rangés par priorité.

### L18 — Ce que l'essai de la boucle a montré

Vague 1 · 9 constats · 6 tickets

- [T002](travail/tickets/002-refuse-a-ticket-whose-final-change-differs-from-the-one-its.md) — Refuse a ticket whose final change differs from the one its reviewer read _(touche au harnais)_
- [T003](travail/tickets/003-never-start-a-ticket-that-still-waits-for-an-owner-decision.md) — Never start a ticket that still waits for an owner decision _(touche au harnais)_
- [T141](travail/tickets/141-refuse-resuming-a-reviewer-or-an-unknown-sub-agent-in-a.md) — Refuse resuming a reviewer or a sub-agent of unknown role in a ticket session _(touche au harnais)_
- [T142](travail/tickets/142-show-the-retrospective-every-tool-the-orchestrator-called-in.md) — Show the retrospective every tool the orchestrator called, in order and timed _(touche au harnais)_
- [T143](travail/tickets/143-measure-a-ticket-session-over-all-its-turns-and-keep-each-run.md) — Measure a ticket session over all its turns and sub-agent runs, and keep each launch's stream _(touche au harnais)_
- [T144](travail/tickets/144-keep-the-reserves-of-a-finished-ticket-in-its-journal-and.md) — Keep the reserves of a finished ticket in its journal and its commit _(touche au harnais)_

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [ESSAI-01](#ESSAI-01) | Un sous-agent lancé en arrière-plan fait finir le tour de l'orchestrateur sans verdict | confirmé | P0 | pas de ticket |
| [ESSAI-02](#ESSAI-02) | La boucle intègre un changement fait après la relecture, que personne n'a relu | confirmé | P0 | [T002](travail/tickets/002-refuse-a-ticket-whose-final-change-differs-from-the-one-its.md) |
| [ESSAI-05](#ESSAI-05) | Un verdict TERMINÉ qui garde des réserves est intégré sans que personne les voie | confirmé | P1 | [T144](travail/tickets/144-keep-the-reserves-of-a-finished-ticket-in-its-journal-and.md) |
| [ESSAI-06](#ESSAI-06) | La boucle lance une session entière sur un ticket qui attend une décision | confirmé | P1 | [T003](travail/tickets/003-never-start-a-ticket-that-still-waits-for-an-owner-decision.md) |
| [ESSAI-07](#ESSAI-07) | Une session de ticket peut reprendre un relecteur sans qu'aucun hook le voie | confirmé | P1 | [T141](travail/tickets/141-refuse-resuming-a-reviewer-or-an-unknown-sub-agent-in-a.md) |
| [ESSAI-03](#ESSAI-03) | Un critère d'acceptation sur l'état du checkout ne peut pas être rempli à la lettre | confirmé | P2 | pas de ticket |
| [ESSAI-04](#ESSAI-04) | Un ticket de six lignes coûte 3,73 $ et dix-neuf minutes | confirmé | P2 | pas de ticket |
| [ESSAI-08](#ESSAI-08) | La rétrospective ne voit pas ce que l'orchestrateur a fait | confirmé | P2 | [T142](travail/tickets/142-show-the-retrospective-every-tool-the-orchestrator-called-in.md) |
| [ESSAI-09](#ESSAI-09) | Les chiffres d'une session ne couvrent que son dernier tour | confirmé | P2 | [T143](travail/tickets/143-measure-a-ticket-session-over-all-its-turns-and-keep-each-run.md) |

<a id="ESSAI-01"></a>
#### ESSAI-01 — Un sous-agent lancé en arrière-plan fait finir le tour de l'orchestrateur sans verdict

**Verdict : confirmé** · priorité P0 · effort S · risque faible · Essai de la boucle sur un ticket réel

_Observé pendant l'essai de la boucle._

**Suite : pas de ticket.** Corrigé cette nuit par le commit `0d5a954` (garde `guard-agent.mjs`, testée dans `tests/agent-guards.test.cjs`). Vérifié sur une session directe sans écran ; la boucle n'a pas été relancée après ce correctif.

- **Où :** `.claude/hooks/guard-agent.mjs` ; `.claude/settings.json` (PreToolUse, filtre `Agent|Task`) ; `.claude/skills/ticket/SKILL.md`.
- **Preuve :** Pendant la session de T001, l'outil de sous-agent lance par défaut en arrière-plan : l'orchestrateur a rendu la main avant le rapport de l'explorateur, et la garde de fin de tour (`.claude/hooks/stop-gate.mjs`, deux refus au plus) a dépensé un refus pour le relancer. La session a tout de même fini (29 tours, verdict TERMINÉ), mais un ticket plus long aurait épuisé ses deux refus.
- **Impact :** Une session peut finir sans verdict : la boucle la compte comme une tentative perdue, puis bloque le ticket.
- **Remède proposé par l'audit :** Refuser, dans une session de ticket, tout lancement de sous-agent qui ne demande pas explicitement le premier plan.

<a id="ESSAI-02"></a>
#### ESSAI-02 — La boucle intègre un changement fait après la relecture, que personne n'a relu

**Verdict : confirmé** · priorité P0 · effort M · risque moyen · Essai de la boucle sur un ticket réel

_Observé pendant l'essai de la boucle._

**Suite :** [T002](travail/tickets/002-refuse-a-ticket-whose-final-change-differs-from-the-one-its.md) « Refuse a ticket whose final change differs from the one its reviewer read ».

- **Où :** `scripts/loop/run.mjs:183` (`gates`) ; `.claude/skills/ticket/SKILL.md:33-44` ; `docs/travail/tickets/001-resent-block-duplicate-without-race.md`, jalon « Relecture (tour 1) ».
- **Preuve :** Sur T001, le relecteur accepte au tour 1 ; l'orchestrateur reformule ensuite un commentaire de `tests/architecture-f06.test.cjs` et le journal du ticket le dit : « C'est la seule modification postérieure à la relecture ; elle ne touche aucune instruction et n'a pas été relue. » Les fichiers `revue-1.diff` et `final.diff` de `.harness-state/tickets/T001/` ne diffèrent que par cette ligne. Aucun contrôle de `gates` ne compare l'état final à l'état relu : le commit `fb19ce6` contient le texte non relu.
- **Impact :** La relecture indépendante, seule étape qui ne soit pas l'auteur du code, peut être contournée sans que la boucle le voie. Ici une ligne de commentaire ; rien n'empêche que ce soit une instruction.

<a id="ESSAI-05"></a>
#### ESSAI-05 — Un verdict TERMINÉ qui garde des réserves est intégré sans que personne les voie

**Verdict : confirmé** · priorité P1 · effort S · risque faible · Essai de la boucle sur un ticket réel

_Observé pendant l'essai de la boucle._

**Suite :** [T144](travail/tickets/144-keep-the-reserves-of-a-finished-ticket-in-its-journal-and.md) « Keep the reserves of a finished ticket in its journal and its commit ». Décision du propriétaire, le 14/10 : afficher plutôt que refuser.

- **Où :** `scripts/loop/run.mjs:234-262` (`processTicket` ne lit `reste` que pour un verdict PARTIEL) ; `.claude/skills/ticket/SKILL.md:60-75` (`reste` est décrit pour PARTIEL seulement).
- **Preuve :** Le verdict de T001 (`.harness-state/tickets/T001/verdict.json`) est TERMINÉ avec deux entrées dans `reste` : le critère 5 non rempli à la lettre et le commentaire non relu. La boucle a intégré et affiché « T001 intégré » ; les réserves ne sont ni dans la sortie de la boucle, ni dans le message du commit, ni dans `events.jsonl`.
- **Impact :** Les réserves honnêtes d'une session restent dans un dossier hors Git, que le propriétaire n'ouvre pas quand tout est vert.
- **Remède proposé par l'audit :** Deux voies : refuser un TERMINÉ dont `reste` n'est pas vide (plus strict, mais pousse à taire les réserves), ou intégrer et afficher les réserves en fin de boucle et dans le journal des événements.

<a id="ESSAI-06"></a>
#### ESSAI-06 — La boucle lance une session entière sur un ticket qui attend une décision

**Verdict : confirmé** · priorité P1 · effort S · risque faible · Essai de la boucle sur un ticket réel

_Déduit de la lecture du code en préparant la file ; non observé pendant l'essai._

**Suite :** [T003](travail/tickets/003-never-start-a-ticket-that-still-waits-for-an-owner-decision.md) « Never start a ticket that still waits for an owner decision ».

- **Où :** `scripts/loop/tickets.mjs:36-49` (`describe` ne lit que l'en-tête du ticket) et `:81-96` (`next` ne regarde que `statut` et `bloque_par`) ; `.claude/skills/ticket/SKILL.md` (aucune étape ne lit la section « Hypothèses bloquantes ») ; `docs/travail/tickets/_gabarit.md` (section « Hypothèses bloquantes »).
- **Preuve :** Lecture du code à la version `0d5a954` : rien, ni dans `next` ni dans `preflight` (`scripts/loop/run.mjs:82`), ne lit le corps du ticket avant de lancer la session. Un ticket dont la section « Hypothèses bloquantes » pose une question au propriétaire part donc comme les autres. Non observé : aucun ticket en attente de décision n'est passé par la boucle cette nuit.
- **Impact :** Au mieux, la session dépense son coût fixe (3,73 $ et dix-neuf minutes mesurés sur T001) pour rendre BLOQUÉ, et la file s'arrête sur ce ticket. Au pire, elle tranche à la place du propriétaire : la skill `ticket` ne lui dit pas de s'arrêter sur une hypothèse non tranchée.

<a id="ESSAI-03"></a>
#### ESSAI-03 — Un critère d'acceptation sur l'état du checkout ne peut pas être rempli à la lettre

**Verdict : confirmé** · priorité P2 · effort S · risque faible · Essai de la boucle sur un ticket réel

_Observé pendant l'essai de la boucle._

**Suite : pas de ticket.** Pas de ticket : traité par une règle de découpage (aucun critère sur l'état du checkout), appliquée aux tickets de cette nuit et écrite dans `docs/travail/README.md`, section « Écrire un ticket ».

- **Où :** `docs/travail/tickets/001-resent-block-duplicate-without-race.md`, critère 5 et fin du journal ; `scripts/loop/run.mjs:206` (`integrate`).
- **Preuve :** Le critère 5 de T001 demandait que `git status` ne montre que le test et le ticket. Trois entrées non suivies antérieures à la session (`design/continuous-context/`, `docs/travail/README.md`, `experiments/`) y figuraient : la session l'a écrit dans son verdict (« non rempli à la lettre ») et la boucle, qui écarte déjà ces fichiers du commit, a intégré.
- **Impact :** Un critère que la session ne peut pas tenir l'oblige à choisir entre un verdict faux et une réserve ; ici elle a dit vrai, mais le critère était mal posé.
- **Remède proposé par l'audit :** Ne jamais écrire de critère sur l'état global du checkout : la boucle garantit déjà que les fichiers non suivis d'avant la session restent hors du commit.

<a id="ESSAI-04"></a>
#### ESSAI-04 — Un ticket de six lignes coûte 3,73 $ et dix-neuf minutes

**Verdict : confirmé** · priorité P2 · effort M · risque moyen · Essai de la boucle sur un ticket réel

_Observé pendant l'essai de la boucle._

**Suite : pas de ticket.** Pas de ticket : le regroupement est une règle de découpage appliquée cette nuit ; un mode allégé retirerait une étape de la skill, donc assouplirait le harnais — décision du propriétaire, notée dans `docs/travail/nuit-2026-10-14.md`.

- **Où :** `.harness-state/loop/events.jsonl` (événement `session-terminee` de T001) ; `.claude/skills/ticket/SKILL.md` (explorer, implémenter, relire : trois sous-agents par ticket).
- **Preuve :** Mesure de la seule session réelle : 29 tours, 1 120 s, 3,726 $, 27 860 jetons écrits, 1 251 745 jetons lus en cumul, aucune compaction, aucun refus de permission, pour une modification de six lignes dans un test. Le contrôle complet de la boucle ajoute environ 1 min 30.
- **Impact :** À ce prix, une file d'une centaine de tickets demande de l'ordre de 400 $ et trente heures en séquentiel. Le coût fixe (exploration, relecture, contrôle complet) domine pour les petits tickets.
- **Remède proposé par l'audit :** Regrouper les changements triviaux d'un même fichier dans un seul ticket ; décider si un mode allégé (sans exploration séparée) est acceptable pour les tickets marqués triviaux.

<a id="ESSAI-07"></a>
#### ESSAI-07 — Une session de ticket peut reprendre un relecteur sans qu'aucun hook le voie

**Verdict : confirmé** · priorité P1 · effort S · risque faible · Essai de la boucle sur un ticket réel

_Observé pendant l'essai de la boucle._

**Suite :** [T141](travail/tickets/141-refuse-resuming-a-reviewer-or-an-unknown-sub-agent-in-a.md) « Refuse resuming a reviewer or a sub-agent of unknown role in a ticket session ».

- **Où :**
  - `.claude/hooks/guard-agent.mjs` ;
  - `.claude/hooks/record-review.mjs:9` ;
  - `.claude/settings.json:44` et `:68`, où les filtres valent `Agent|Task` ;
  - `.claude/skills/ticket/SKILL.md:62`.
- **Preuve :**
  - Sur T003, l'orchestrateur a repris des sous-agents par l'outil `SendMessage` :
    - au premier lancement, l'explorateur ;
    - au second, l'implémenteur, deux fois (`.harness-state/tickets/T003/session-1.jsonl`).
  - L'entrée de l'outil ne porte que le destinataire (`to`). Aucun hook ne la voit : les deux filtres
    valent `Agent|Task`.
  - La reprise rend la main tout de suite, et le rapport arrive plus tard par un message.
  - Au premier lancement, l'orchestrateur a attendu ce rapport avec une boucle Bash en arrière-plan. Le
    processus est resté vivant après le verdict, jusqu'à un arrêt manuel.
- **Impact :**
  - Un relecteur repris relit sans regard neuf, contre la règle de la skill.
  - Son verdict n'est pas enregistré : `record-review` ne lit que l'outil `Agent`. La boucle jugerait le
    ticket sur une relecture qui n'est pas la dernière.
- **Remède proposé par l'audit :**
  - En mode boucle, refuser `SendMessage` vers un relecteur ou vers un sous-agent de rôle inconnu.
  - Dire dans la skill comment attendre le rapport d'un implémenteur repris.

<a id="ESSAI-08"></a>
#### ESSAI-08 — La rétrospective ne voit pas ce que l'orchestrateur a fait

**Verdict : confirmé** · priorité P2 · effort S · risque faible · Essai de la boucle sur un ticket réel

_Observé pendant l'essai de la boucle._

**Suite :** [T142](travail/tickets/142-show-the-retrospective-every-tool-the-orchestrator-called-in.md) « Show the retrospective every tool the orchestrator called, in order and timed ».

- **Où :**
  - `scripts/loop/retro.mjs:58-83` (`digest`) ;
  - `scripts/loop/run.mjs:140-155` (`actions`, lignes envoyées à la console seulement).
- **Preuve :**
  - Au second lancement de T003, l'orchestrateur appelle 42 outils, dont 2 `SendMessage`.
  - `retro-entree.md` n'en cite aucun.
  - Aucune des 7 observations de `retro.json` ne parle d'une reprise de sous-agent.
  - La rétrospective du premier lancement n'a pas vu non plus la session restée suspendue après son
    verdict.
- **Impact :** les écarts de conduite de l'orchestrateur échappent à la seule étape chargée de les
  relever :
  - un sous-agent repris ;
  - une attente en arrière-plan ;
  - une fin de tour prématurée.
- **Remède proposé par l'audit :** noter pendant la session la suite chronologique des appels d'outils
  de l'orchestrateur et des fins de tour, et la donner à la rétrospective.

<a id="ESSAI-09"></a>
#### ESSAI-09 — Les chiffres d'une session ne couvrent que son dernier tour

**Verdict : confirmé** · priorité P2 · effort S · risque faible · Essai de la boucle sur un ticket réel

_Observé pendant l'essai de la boucle._

**Suite :** [T143](travail/tickets/143-measure-a-ticket-session-over-all-its-turns-and-keep-each-run.md) « Measure a ticket session over all its turns and sub-agent runs, and keep each launch's stream ».

- **Où :**
  - `scripts/loop/run.mjs:193` : seul le dernier message `result` est gardé ;
  - `scripts/loop/run.mjs:158-163` : `subAgent` ;
  - `scripts/loop/run.mjs:172`, où le flux est écrit dans `session-${attempt}.jsonl`.
- **Preuve :**
  - Premier lancement de T003 : 1 tour, 3 s et 167 tokens produits sont rapportés pour 3,52 $ et dix-sept
    minutes et demie de session (`.harness-state/loop/events.jsonl`).
  - Second lancement : l'implémenteur, repris deux fois, a trois passages dans le flux. Le rapport n'en
    compte qu'un.
  - Le flux du premier lancement a été réécrit par le second.
- **Impact :**
  - Les mesures qui doivent calibrer la taille des tickets et le plafond de tours des sous-agents sont
    fausses dès qu'une session finit plusieurs tours.
  - La preuve d'un lancement raté disparaît au lancement suivant.
- **Remède proposé par l'audit :**
  - Additionner les compteurs par tour et prendre les compteurs cumulés sur le dernier `result`.
  - Mesurer la durée réelle du processus.
  - Compter chaque passage de sous-agent.
  - Ne jamais réécrire le flux d'un lancement précédent.

### L01 — Un filet de tests fiable et reproductible

Vague 1 · 19 constats · 11 tickets

- [T004](travail/tickets/004-wait-for-the-turn-request-itself-in-the-verifier-deadline.md) — Wait for the turn request itself in the verifier deadline test
- [T005](travail/tickets/005-let-a-codex-turn-left-in-flight-stop-holding-its-process.md) — Let a Codex turn left in flight stop holding its process alive
- [T006](travail/tickets/006-read-the-session-folder-only-after-the-store-has-finished.md) — Read the session folder only after the store has finished writing
- [T007](travail/tickets/007-add-a-test-launcher-that-stops-and-names-a-test-file-that.md) — Add a test launcher that stops and names a test file that hangs _(touche au harnais)_
- [T008](travail/tickets/008-ship-the-slow-disk-and-stalled-process-probes-for-flaky.md) — Ship the slow-disk and stalled-process probes for flaky tests
- [T009](travail/tickets/009-skip-by-name-or-fail-on-demand-the-tests-that-need-ffmpeg.md) — Skip by name, or fail on demand, the tests that need ffmpeg
- [T010](travail/tickets/010-link-no-real-codex-credential-when-the-transport-is-a-test.md) — Link no real Codex credential when the transport is a test double
- [T011](travail/tickets/011-declare-the-node-version-the-project-runs-on-and-refuse.md) — Declare the Node version the project runs on and refuse older ones
- [T012](travail/tickets/012-run-npm-test-and-the-quality-check-through-the-test-launcher.md) — Run npm test and the quality check through the test launcher _(touche au harnais)_
- [T013](travail/tickets/013-give-each-test-file-a-private-temp-directory-and-report-what.md) — Give each test file a private temp directory and report what it leaves _(touche au harnais)_
- [T014](travail/tickets/014-run-every-python-test-from-npm-test-and-from-the-quality.md) — Run every Python test from npm test and from the quality check _(touche au harnais)_

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [FLK-01](#FLK-01) | F06 : le renvoi du bloc part avant que la première requête soit rendue (429) | confirmé | P0 | [T001](travail/tickets/001-resent-block-duplicate-without-race.md) |
| [FLK-02](#FLK-02) | verification : attente bornée en tours de boucle sur du disque réel, puis fichier qui ne se termine plus | nuancé | P0 | [T004](travail/tickets/004-wait-for-the-turn-request-itself-in-the-verifier-deadline.md) |
| [FLK-05](#FLK-05) | Un échec peut devenir un blocage : pas de délai global, boucles sans borne, nettoyage en fin de corps | nuancé | P0 | [T007](travail/tickets/007-add-a-test-launcher-that-stops-and-names-a-test-file-that.md), [T012](travail/tickets/012-run-npm-test-and-the-quality-check-through-the-test-launcher.md) |
| [TSTA-01](#TSTA-01) | Échec intermittent de architecture-f06:530 : l'attente précède la libération de la voie d'ingestion | nuancé | P0 | [T001](travail/tickets/001-resent-block-duplicate-without-race.md) |
| [FLK-03](#FLK-03) | session-durable : le dossier est lu avant que le magasin ait fini d'écrire | nuancé | P1 | [T006](travail/tickets/006-read-the-session-folder-only-after-the-store-has-finished.md) |
| [FLK-13](#FLK-13) | Parallélisme par défaut de node --test et isolation qui repose sur un processus par fichier | nuancé | P1 | [T007](travail/tickets/007-add-a-test-launcher-that-stops-and-names-a-test-file-that.md), [T012](travail/tickets/012-run-npm-test-and-the-quality-check-through-the-test-launcher.md), [T013](travail/tickets/013-give-each-test-file-a-private-temp-directory-and-report-what.md) |
| [FLK-16](#FLK-16) | Sondes de délai : l'outil pour reproduire au lieu de relancer, absent du dépôt | nuancé | P1 | [T008](travail/tickets/008-ship-the-slow-disk-and-stalled-process-probes-for-flaky.md) |
| [OPS-01](#OPS-01) | Version de Node ni déclarée ni vérifiée | confirmé | P1 | [T011](travail/tickets/011-declare-the-node-version-the-project-runs-on-and-refuse.md) |
| [OPS-06](#OPS-06) | `npm test` a un prérequis système caché et ignore les tests Python | nuancé | P1 | [T009](travail/tickets/009-skip-by-name-or-fail-on-demand-the-tests-that-need-ffmpeg.md), [T014](travail/tickets/014-run-every-python-test-from-npm-test-and-from-the-quality.md) |
| [TSTB-01](#TSTB-01) | Tests dépendants de la machine du développeur | nuancé | P1 | [T009](travail/tickets/009-skip-by-name-or-fail-on-demand-the-tests-that-need-ffmpeg.md), [T010](travail/tickets/010-link-no-real-codex-credential-when-the-transport-is-a-test.md) |
| [TSTC-08](#TSTC-08) | 84 tests Python hors de npm test et de toute CI, jamais lancés sur le Python de la TV | nuancé | P1 | [T014](travail/tickets/014-run-every-python-test-from-npm-test-and-from-the-quality.md) |
| [TSTC-11](#TSTC-11) | Prérequis d'exécution non déclarés : version de Node, Chrome, Python, aucun fichier de CI | nuancé | P1 | [T011](travail/tickets/011-declare-the-node-version-the-project-runs-on-and-refuse.md) |
| [FLK-14](#FLK-14) | Couverture qui dépend de la machine : ffmpeg, plateforme, version de Node, répertoire courant, Python | confirmé | P2 | [T009](travail/tickets/009-skip-by-name-or-fail-on-demand-the-tests-that-need-ffmpeg.md), [T011](travail/tickets/011-declare-the-node-version-the-project-runs-on-and-refuse.md), [T014](travail/tickets/014-run-every-python-test-from-npm-test-and-from-the-quality.md) |
| [FLK-15](#FLK-15) | Chemins fixes partagés dans le dossier temporaire commun | nuancé | P3 | [T010](travail/tickets/010-link-no-real-codex-credential-when-the-transport-is-a-test.md), [T013](travail/tickets/013-give-each-test-file-a-private-temp-directory-and-report-what.md) |
| [OUBLI-04](#OUBLI-04) | Cause probable de l'échec intermittent 429 | nuancé | — | pas de ticket |
| [OUBLI-11](#OUBLI-11) | Minuterie de garde du client Codex réarmée sans unref : un tour abandonné retient le processus | confirmé | — | [T005](travail/tickets/005-let-a-codex-turn-left-in-flight-stop-holding-its-process.md) |
| [OUBLI-36](#OUBLI-36) | Trois échecs latents sous disque ralenti, absents de l'audit | confirmé | — | [T004](travail/tickets/004-wait-for-the-turn-request-itself-in-the-verifier-deadline.md), [T006](travail/tickets/006-read-the-session-folder-only-after-the-store-has-finished.md) |
| [OUBLI-37](#OUBLI-37) | Aucun délai par test ni nettoyage garanti à l'échec | confirmé | — | [T004](travail/tickets/004-wait-for-the-turn-request-itself-in-the-verifier-deadline.md), [T007](travail/tickets/007-add-a-test-launcher-that-stops-and-names-a-test-file-that.md), [T012](travail/tickets/012-run-npm-test-and-the-quality-check-through-the-test-launcher.md) |
| [OUBLI-41](#OUBLI-41) | 33 tests Python de prototypes/lg-remote absents du décompte et de toute commande | confirmé | — | [T014](travail/tickets/014-run-every-python-test-from-npm-test-and-from-the-quality.md) |

<a id="FLK-01"></a>
#### FLK-01 — F06 : le renvoi du bloc part avant que la première requête soit rendue (429)

**Verdict : confirmé** · priorité P0 · effort S · risque faible · Déterminisme des tests

**Suite :** [T001](travail/tickets/001-resent-block-duplicate-without-race.md) « Prove the duplicate answer to a resent block without racing the ingestion lane » (terminé).

**Part laissée de côté :** Déjà traité par le ticket T001 (statut terminé, commit fb19ce6). — _Reprise :_ Rien à faire : T001 est terminé.

- **Où :** tests/architecture-f06.test.cjs:514-531 (attente fautive 529, assertion 530, f.passages 142) ; server/http.cjs:247-248, 253, 258, 262, 270-271 ; core/session.cjs:117, 126-128, 134, 141 ; runtime/headless-runtime.cjs:713-741, 778-809 ; tv/transport.py:85-92
- **Preuve :** Le test relâche l'assemblage (528), sonde GET /v1/state toutes les 5 ms jusqu'à voir le passage (529), puis renvoie le même bloc (530). Le passage est visible dès segments.push (session.cjs:117), alors que runtime.ingest n'a pas fini : il reste la sauvegarde du premier passage (126-128), la miniature sharp (134) et prune (141). Ce n'est qu'ensuite que http.cjs marque la séquence (262) et remet ingesting à false (270). Un renvoi arrivé entre-temps ne trouve ni la séquence ni lastSequence et reçoit 429 (247-248).

  Mesures par horodatage seul : fenêtre de 1,03 ms dans le fichier complet (lancement E, passé) et de 7,9 ms test isolé, sharp étant froid (lancement B, passé avec 0,13 ms de marge).

  Reproduction : A, copie intacte, test isolé : 429 en :530. C1, +150 ms sur thumbnails.put : 429. C2, +150 ms sur archive.save : 429. Fichier complet sous sonde disque +5 ms puis +10 ms : 429, ce seul test.

  Correctif sur les mêmes entrées : D1 et D2 passent ; la variante d'une ligne passe 17/17 sous +5 et +10 ms.

  Charge : load 5,6 à 10,9, swap 23,4 à 23,7 Go utilisés sur 24.

  Verdict : défaut du test. Un client réel verrait ce 429, qui est la réponse prévue « occupé, renvoyer » : tv/transport.py:85-92 et scripts/replay-lg-stream.cjs:172-180 la retentent, puis reçoivent 200 duplicate.
- **Impact :** Échec intermittent d'un test de non-régression F06, plus fréquent sous charge et quand le test est lancé seul ; il pousse à relancer la suite et masque les vrais échecs.

<a id="FLK-02"></a>
#### FLK-02 — verification : attente bornée en tours de boucle sur du disque réel, puis fichier qui ne se termine plus

**Verdict : nuancé** · priorité P0 · effort S · risque faible · Déterminisme des tests

**Suite :** [T004](travail/tickets/004-wait-for-the-turn-request-itself-in-the-verifier-deadline.md) « Wait for the turn request itself in the verifier deadline test ».

- **Où :** tests/verification.test.cjs:77, 207-252 (attentes 238 et 248) ; adapters/codex-confinement.cjs:237-262 ; adapters/codex-session-client.cjs:272 ; tests/surveillance-runtime.test.cjs:13-19
- **Preuve :** until (77) abandonne après 2000 tours de setImmediate, sans temps réel : 27 ms mesurées à vide. Il attend turn/start, qui vient après createContext sur disque réel (mkdtemp, 3 mkdir, writeFile, 2 access). Le commentaire de surveillance-runtime.test.cjs:13-14 décrit ce défaut et ne l'a corrigé que dans ce fichier.

  Reproduit : +10 ms sur mkdir/writeFile/rename donne « condition never reached » en :238, 2 lancements sur 2 (load 13,6 et 7,1). À +5 ms le fichier passe, rien n'en est conclu.

  Après l'échec, le processus du fichier reste vivant : 324 s jusqu'à ce que je le tue, puis 100 s jusqu'au chien de garde. Le test n'a ni t.after ni finally ; ce qui le retient n'est pas identifié.

  Correctif sur l'entrée capturée : une promesse résolue par le crochet gate du faux App Server passe 10/10 sous +10 ms et sous la sonde large.
- **Impact :** Échec intermittent sous charge disque, et surtout un échec qui se transforme en blocage du lancement : en CI le job court jusqu'à son délai sans afficher l'assertion.
- **Nuance du relecteur (elle prime) :** Preuve exacte (until en 77, attentes en 238 et 248, createContext en 237-262, journal : test échoué en 231 ms puis fichier vivant 324 s). Un fait à compléter : la cause du blocage, donnée comme non identifiée, se lit dans le code. adapters/codex-session-client.cjs:781-791 réarme un setTimeout de 1000 ms, sans unref, tant que le tour n'est pas réglé, et ne l'efface qu'en 812. Au test, la minuterie de délai du vérificateur est injectée (235) et ne se déclenche jamais, et le tour ne finit jamais : quand until échoue en 238, rien n'annule le vérificateur et le processus reste vivant. Mettre cancel() dans t.after est donc bien le correctif du blocage, pas une simple hygiène. until n'a que deux usages (238, 248) : sa suppression est triviale. Le crochet gate est en 85-92.

<a id="FLK-05"></a>
#### FLK-05 — Un échec peut devenir un blocage : pas de délai global, boucles sans borne, nettoyage en fin de corps

**Verdict : nuancé** · priorité P0 · effort S · risque faible · Déterminisme des tests

**Suite :** [T007](travail/tickets/007-add-a-test-launcher-that-stops-and-names-a-test-file-that.md) « Add a test launcher that stops and names a test file that hangs » ; [T012](travail/tickets/012-run-npm-test-and-the-quality-check-through-the-test-launcher.md) « Run npm test and the quality check through the test launcher ».

**Part laissée de côté :** Reste du constat : les dix-sept boucles d'attente sans borne demandent l'aide partagée tests/helpers/wait.cjs, que seul le lot L05 crée (arbitrage A2). Le lot L01 ne livre que le délai par test et le chien de garde du lanceur. — _Reprise :_ Après lot:L05 et L01-11.

- **Où :** package.json:11 ; tests/verification.test.cjs:207 ; boucles sans borne : tests/architecture-f06.test.cjs:139, architecture-f05.test.cjs:581, architecture-f10.test.cjs:86, clip-unreadable.test.cjs:25, codex-connect-race.test.cjs:54, disk-guard.test.cjs:15, remote-server.test.cjs:80, server-sessions.test.cjs:98, 504, 532, 567, server-ingest-path.test.cjs:96, server-state-views.test.cjs:129, session-delete.test.cjs:15, session-durable.test.cjs:19, timeline-server.test.cjs:84, 112
- **Preuve :** npm test = node --test tests/*.test.cjs, sans --test-timeout. 15 tests sur 602 déclarent un timeout (architecture-f08 : 7, local-vlm-agent : 8). 17 boucles d'attente n'ont aucune borne (do { await tick() } while (watch.running) et variantes). 15 fichiers qui ouvrent des ressources n'ont aucun t.after, dont 2 sans finally non plus (codex-connect-race, deploy-unit).

  Observé deux fois (FLK-02) : un test échoue en 0,2 à 0,4 s, puis son fichier reste vivant indéfiniment.
- **Impact :** En CI, un échec intermittent consomme tout le délai du job et son message n'apparaît pas en fin de journal. En local, npm test ne rend pas la main.
- **Nuance du relecteur (elle prime) :** Compteurs retrouvés : 15 tests avec timeout (architecture-f08 : 7, local-vlm-agent : 8), 17 boucles sans borne aux lignes citées. Non retrouvé : « 15 fichiers sans t.after » (10 à 12 par grep selon ce qu'on appelle ressource ; codex-connect-race confirmé, deploy-unit n'ouvre aucune ressource). Erreur de fond sur la remédiation : --test-timeout ne borne pas un fichier dont le processus reste vivant. Dans Node 24.12.0, le runner fixe FileTest.timeout = null et se contente de transmettre --test-timeout à l'enfant, où il devient le délai de chaque test (lu dans les sources internal/test_runner/runner et test du binaire). Le blocage observé (test échoué en 0,2 s, processus vivant 324 s) n'est donc pas couvert : il durerait jusqu'au délai du job. Le drapeau reste utile pour les 17 boucles, qui sont dans des corps de test. Le cas observé demande : sa cause (minuterie de adapters/codex-session-client.cjs:781-791, voir FLK-02) et le nettoyage en t.after, plus un chien de garde par fichier dans un script de lancement, qui tue le groupe de processus et nomme « fichier encore vivant N s après son dernier test ». Le prérequis FLK-12 se limite au module d'attente, sans ESLint. D'après le journal Git de la branche de travail (non relu), le contrôle qualité borne déjà ses lancements de tests : à vérifier avant de créer le ticket.

<a id="TSTA-01"></a>
#### TSTA-01 — Échec intermittent de architecture-f06:530 : l'attente précède la libération de la voie d'ingestion

**Verdict : nuancé** · priorité P0 · effort S · risque faible · Tests nommés par chantier

**Suite :** [T001](travail/tickets/001-resent-block-duplicate-without-race.md) « Prove the duplicate answer to a resent block without racing the ingestion lane » (terminé).

**Part laissée de côté :** Déjà traité par le ticket T001 (statut terminé, commit fb19ce6). — _Reprise :_ Rien à faire : T001 est terminé.

- **Où :** tests/architecture-f06.test.cjs:514 (attente :529, assertion :530) ; server/http.cjs:247, 258-270 ; core/session.cjs:117, 128, 134
- **Preuve :** Le test abandonne sa requête, laisse l'assemblage finir, attend `(await f.passages()).length === 1`, puis renvoie aussitôt le même bloc et exige 200 avec `duplicate: true`. Or le passage devient visible dès `this.segments.push(segment)` (session.cjs:117), alors que deux attentes restent en cours pour le tout premier passage : l'écriture de l'état (:128) et la vignette (:134). Le serveur n'inscrit le bloc dans `accepted` (http.cjs:262) et ne remet `ingesting` à false (:270) qu'au retour de `runtime.ingest` (:258). Dans cet intervalle, le renvoi ne trouve pas de bloc déjà accepté et tombe sur `if (this.ingesting) return send(429, …)` (:247) : c'est exactement « reçu 429, attendu 200 ». La fenêtre est établie par lecture du code ; l'échec n'a pas été reproduit ici.
- **Impact :** Un filet de 602 tests qui échoue une fois sur trois sous charge apprend à relancer. Le 429 est la réponse prévue du produit (« à renvoyer ») : c'est l'hypothèse du test qui est fausse, pas le serveur.
- **Nuance du relecteur (elle prime) :** Preuve exacte : les lignes sont justes (f06:514, :529, :530 ; http.cjs:247, :258, :262, :270 ; session.cjs:117, :128, :134) et le mécanisme est reproduit par la sonde de disque lent déjà présente dans le dossier de travail de l'audit (flaky/probe-architecture-f06-slow.log : 16 réussites sur 17, ce test seul en échec, avec 429). Je ne l'ai pas relancé moi-même. Trois faits à corriger. 1) L'étape 1 n'est pas faisable telle qu'écrite : `runtimeOptions` atteint bien createSessionRuntime (headless-runtime.cjs:618-626), mais `overrides` n'accepte que `embeddings` et `perception` (session-runtime.cjs:119, :238) ; ni l'écriture de l'état ni la vignette ne s'y injectent. Reproduire en retardant fsp.mkdir, writeFile et rename (sonde chargée par --require, ou t.mock.method sur fsp). 2) Le `until` de f06:30 ne rend aucune valeur : il faut le faire rendre la valeur, comme celui de f07:26, pour écrire `const again = await until(...)`. 3) Ce constat est déjà un ticket à HEAD (commit e47c1aa, docs/travail/tickets/001-resent-block-duplicate-without-race.md, reproduction établie trois fois sur trois) : ne pas en créer un second.

<a id="FLK-03"></a>
#### FLK-03 — session-durable : le dossier est lu avant que le magasin ait fini d'écrire

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Déterminisme des tests

**Suite :** [T006](travail/tickets/006-read-the-session-folder-only-after-the-store-has-finished.md) « Read the session folder only after the store has finished writing ».

**Part laissée de côté :** Reste du constat : la quarantaine d'autres lectures faites sans attendre la file d'écriture du magasin relève d'une barrière commune avec FLK-06, hors de ce lot. L01-03 ne corrige que le test reproduit. — _Reprise :_ Après L01-03, dans le lot qui porte FLK-06.

- **Où :** tests/session-durable.test.cjs:19, 273-277 ; adapters/local-store.cjs:157-175, 202-206 ; tests/architecture-f06.test.cjs:139 ; tests/server-sessions.test.cjs:98-100
- **Preuve :** Après settle(watch) (un tour, puis boucle tant que watch.running), le test liste le dossier (277) et attend ['media','thumbs']. L'écriture du manifeste est encore entre son .tmp et son rename.

  Reproduit : +5 ms puis +20 ms sur mkdir/writeFile/rename donnent 'manifest.json.tmp' en trop en :277 (2 sur 2, load 7,2 et 8,9). Témoin sans sonde : 24/24. Sonde large +10 ms : 24/24, le readdir du test étant lui aussi retardé. Rien n'est conclu de ces deux passages.

  Correctif sur l'entrée capturée : await live.store.flush() avant la lecture passe 24/24 sous +5 et +20 ms.

  Plus largement, 40 lectures de store.serial dans 8 fichiers n'attendent que la chaîne en cours à l'instant de la lecture ; LocalStore.flush() boucle jusqu'à stabilité mais n'est appelé que dans 2 fichiers de tests.
- **Impact :** Échec intermittent sous charge disque ; le même raccourci (serial au lieu de flush) est recopié dans les fixtures des tests d'hôte.
- **Nuance du relecteur (elle prime) :** Preuve exacte : la ligne 277 filtre '.json' mais pas '.json.tmp' ; 40 lectures de store.serial dans 8 fichiers ; store.flush() appelé dans 2 fichiers de tests ; journaux conformes (23/24 à +5 et +20 ms, 24/24 corrigé). Deux précisions. 1) L'ajout se place après la ligne 273 (ingest puis settle), avant cleanupRawMedia (274). 2) Le remplacement en bloc des 40 lectures par flush() n'est ni « S » ni « risque faible » : LocalSessionStore.flush() rejette tant que la dernière écriture d'un fichier d'état a été refusée (adapters/local-store.cjs:204-205, barrière d'archive gardée telle quelle par l'ADR 0003, point 2). 32 des 40 lectures sont dans session-durable (15) et server-sessions (17), qui portent les tests de disque refusé (session-durable 628-651 et 898-905, server-sessions 688-778) ; architecture-f07:187 écrit déjà .serial.catch(() => {}). À scinder : le correctif d'une ligne maintenant ; les 40 sites avec FLK-06, sur une barrière qui ne rejette pas.

<a id="FLK-13"></a>
#### FLK-13 — Parallélisme par défaut de node --test et isolation qui repose sur un processus par fichier

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Déterminisme des tests

**Suite :** [T007](travail/tickets/007-add-a-test-launcher-that-stops-and-names-a-test-file-that.md) « Add a test launcher that stops and names a test file that hangs » ; [T012](travail/tickets/012-run-npm-test-and-the-quality-check-through-the-test-launcher.md) « Run npm test and the quality check through the test launcher » ; [T013](travail/tickets/013-give-each-test-file-a-private-temp-directory-and-report-what.md) « Give each test file a private temp directory and report what it leaves ».

**Part laissée de côté :** Reste du constat : VIPS_CONCURRENCY=1 n'a jamais été mesuré ; faire passer un résidu de « signalé » à « en échec » demande d'abord la liste réelle des résidus. — _Reprise :_ Après L01-05.

- **Où :** package.json:11 ; tests/architecture-f05.test.cjs:151-154, 653-667 ; tests/architecture-f06.test.cjs:415-420 ; tests/architecture-f07.test.cjs:248-275 ; tests/mac-ipc-contract.test.cjs:166-181 ; tests/codex-confinement.test.cjs:32-35, 159 ; tests/chat-trace.test.cjs:5 ; tests/media-asr-options.test.cjs:29 ; tests/tv-panel.test.cjs:45 ; tests/architecture-f09.test.cjs:244
- **Preuve :** node --test lance un processus par fichier, availableParallelism()−1 à la fois : 9 sur ce Mac (10 cœurs, 16 Go, swap utilisé à plus de 23 Go pendant l'audit). 12 fichiers chargent sharp, 13 lancent de vrais processus enfants, 3 chargent app/main.cjs.

  9 fichiers modifient puis restaurent un état global du processus : process.env, process.argv, process.stderr.write, require.cache, Date.now, globalThis.document.

  L'ordre change aussi le temps : le premier appel à sharp d'un processus coûte 3,1 à 4,5 ms contre 0,1 à 0,3 ms ensuite (lancements A, B, E), d'où une issue de FLK-01 différente selon que le test tourne seul ou après les autres.
- **Impact :** Sous charge ou sur un runner à 2 ou 4 vCPU, les fenêtres mesurées en millisecondes s'élargissent. La concurrence par défaut change d'une machine à l'autre, donc la fréquence d'échec aussi. --test-isolation=none ou des tests concurrents dans un fichier casseraient l'isolation.
- **Nuance du relecteur (elle prime) :** Faits retrouvés : 10 cœurs, 16 Go, concurrence par défaut 9 ; 12 fichiers chargent sharp ; les mutations d'état global existent aux lignes citées (process.env, argv, stderr.write, require.cache, Date.now, globalThis.document). Non retrouvés à l'identique : « 13 fichiers à processus enfants » (4 appellent spawn ou execFile directement, 17 manipulent des exécutables) et « 3 chargent app/main.cjs » (5 le citent, 3 le chargent). À corriger : la valeur locale. La consigne actuelle du projet (CLAUDE.md) impose les tests en séquentiel sur ce Mac, et l'audit mesure lui-même plus de 23 Go de swap : défaut local 1, variable pour monter, et non 4. Le TMPDIR privé fait doublon avec FLK-15 : un seul ticket.

<a id="FLK-16"></a>
#### FLK-16 — Sondes de délai : l'outil pour reproduire au lieu de relancer, absent du dépôt

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Déterminisme des tests

**Suite :** [T008](travail/tickets/008-ship-the-slow-disk-and-stalled-process-probes-for-flaky.md) « Ship the slow-disk and stalled-process probes for flaky tests ».

- **Où :** le dossier de sondes de l'audit (flaky/)/slow-fs.cjs, stall.cjs, probe.sh, probe-stall.sh ; variantes de tests dans flaky/copy/tests/flk-*.test.cjs ; journaux run*.log, probe-*.log, stall-*.log
- **Preuve :** Deux préchargements écrits pour l'audit : slow-fs.cjs retarde les appels de node:fs/promises, stall.cjs bloque périodiquement le processus de test. Un fichier à la fois, load 5,5 à 14,5, swap 23,4 à 24,5 Go utilisés ; une autre session lançait sa suite pendant certains lancements.

  Résultats : +5 ms sur mkdir/writeFile/rename, 19 fichiers, 2 échecs (FLK-01, FLK-03). +10 ms sur 15 appels, 50 fichiers, 4 fichiers en échec (FLK-01, FLK-02 avec blocage, FLK-04, FLK-07 une fois sur deux). Blocage 60/80 ms sur 6 fichiers et 700/1000 ms sur 7 : aucun échec.

  Chaque échec a été relu jusqu'à sa cause. Les lancements réussis ne prouvent rien.
- **Impact :** Sans cet outil, la règle « un intermittent se reproduit » n'a pas de moyen : il reste la relance.
- **Nuance du relecteur (elle prime) :** Résultats conformes aux journaux : sonde étroite, architecture-f06 à 16/17 et session-durable à 23/24 ; sonde large, 50 fichiers dont 4 en échec ; 13 lancements de blocage sans échec. Trois précisions. 1) 21 fichiers sur 71 n'ont jamais tourné sous la sonde large, 52 sous la sonde étroite : l'état de la voie complète est inconnu. 2) Les deux modes ne s'emboîtent pas : la sonde large masque FLK-03 en retardant aussi le readdir du test ; il faut garder les deux. 3) Le script npm décrit se bloquerait à la première reproduction de FLK-02 : il lui faut le chien de garde par fichier que probe.sh porte en zsh, perl et sysctl macOS, à réécrire en Node. Emplacement : scripts/ (convention de CONTRIBUTING.md:11), pas un nouveau tools/. Durée mesurée : 162 s pour 50 fichiers à +10 ms.

<a id="OPS-01"></a>
#### OPS-01 — Version de Node ni déclarée ni vérifiée

**Verdict : confirmé** · priorité P1 · effort S · risque faible · Scripts et outillage

**Suite :** [T011](travail/tickets/011-declare-the-node-version-the-project-runs-on-and-refuse.md) « Declare the Node version the project runs on and refuse older ones ».

**Part laissée de côté :** Reste du constat : la règle ESLint n/no-unsupported-features attend jalon:lint ; le contrôle de la version de Node dans deploy/install.sh va avec OPS-15 et touche au déploiement. — _Reprise :_ Après L01-09 et jalon:lint.

- **Où :** package.json:1-39 ; README.md:111 ; docs/installation.md:9 ; docs/server-installation.md:9 ; docs/vps-deployment.md:9 ; adapters/config.cjs:3 ; adapters/codex-perception.cjs:115 ; adapters/disk-guard.cjs:27 ; tests/architecture-f09.test.cjs:243 ; tests/server-sessions.test.cjs:696 ; deploy/tvlens.service:22
- **Preuve :** Aucun champ engines, ni .nvmrc, ni .npmrc. La documentation dit « Node.js 24+ » ; seules versions mesurées : 24.12.0 (poste) et 24.13.0 (VPS). D'après les API utilisées, le code serveur exige 20.12 au minimum (util.parseEnv en config.cjs:3 ; AbortSignal.any ; fs.statfs ; sharp 0.35.5 demande 20.9). La suite de tests exige 22.7 : architecture-f09.test.cjs:243 importe app/ui/recap-view.js, module ES dans un fichier .js d'un paquet sans champ type (détection de syntaxe ; rétroportée en 20.19 de mémoire, non vérifié). L'installation de développement exige 22.12 (engines d'electron 44.4.5 et de @electron/packager 20.3.0 dans package-lock.json). Rien n'exige 24. Electron 44.4.5 dépend de @types/node ^24.9.0 : son Node embarqué est donc un 24 (déduit, non exécuté). L'unité systemd lance /usr/bin/node sans contrôle.
- **Impact :** Deux moteurs Node exécutent les mêmes adaptateurs (Node système pour le serveur et les tests, Node d'Electron pour l'app Mac) et aucun n'est fixé : une API plus récente que le Node d'Electron passerait les tests et casserait l'app. Un poste ou un serveur en Node 20 ou 22 échoue loin de la cause.

<a id="OPS-06"></a>
#### OPS-06 — `npm test` a un prérequis système caché et ignore les tests Python

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Scripts et outillage

**Suite :** [T009](travail/tickets/009-skip-by-name-or-fail-on-demand-the-tests-that-need-ffmpeg.md) « Skip by name, or fail on demand, the tests that need ffmpeg » ; [T014](travail/tickets/014-run-every-python-test-from-npm-test-and-from-the-quality.md) « Run every Python test from npm test and from the quality check ».

- **Où :** tests/video-research.test.cjs:62 ; tests/media-asr-options.test.cjs:36-37 ; tests/clip-unreadable.test.cjs:130-138 ; CONTRIBUTING.md:17-21 ; docs/lg-ambient.md:144-147 ; package.json:11
- **Preuve :** video-research.test.cjs:62 lance un vrai ffmpeg (encodage libvpx) sans garde, avec le chemin /opt/homebrew/bin/ffmpeg codé pour macOS. Deux autres tests se sautent ou se réduisent en silence sans ffmpeg (media-asr-options.test.cjs:37, clip-unreadable.test.cjs:138). CONTRIBUTING ne demande que `npm ci` et `npm test`. Les commandes Python ne figurent que dans docs/lg-ambient.md ; aucune entrée npm. Tout le Python testé n'utilise que la bibliothèque standard.
- **Impact :** Sur un Mac Intel, un Linux sans ffmpeg ou un runner de CI, la suite échoue ou perd de la couverture sans le dire. Une modification de tv/*.py n'est vérifiée que si l'on retrouve la commande dans un document.
- **Nuance du relecteur (elle prime) :** Lignes exactes (video-research:62, media-asr-options:36-37, clip-unreadable:130-138 ; executable() existe dans adapters/system-paths.cjs et connaît les deux préfixes Homebrew). Trois précisions.

  (1) CONTRIBUTING.md:17-21 demande trois commandes, pas deux : `npm ci`, `npm test` et `npm run test:electron`.

  (2) Les deux replis ne sont pas silencieux : media-asr-options:37 saute avec le motif « ffmpeg indisponible », clip-unreadable:138 écrit un diagnostic. Le défaut est que la couverture perdue ne fait pas échouer.

  (3) Hors ROOT (HEAD 208d2e3) : `npm run check` existe déjà (scripts/check.mjs) et lance les trois tests/test_tv_*.py. Restent hors de tout lancement les trois fichiers de prototypes/lg-remote. La remédiation doit étendre ce script, fichier protégé du harnais, et non créer une entrée check concurrente.

  Nom d'entrée à unifier entre audits : test:py ici, test:tv dans PY-04, test:python dans DOC-10.

<a id="TSTB-01"></a>
#### TSTB-01 — Tests dépendants de la machine du développeur

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Tests de comportement

**Suite :** [T009](travail/tickets/009-skip-by-name-or-fail-on-demand-the-tests-that-need-ffmpeg.md) « Skip by name, or fail on demand, the tests that need ffmpeg » ; [T010](travail/tickets/010-link-no-real-codex-credential-when-the-transport-is-a-test.md) « Link no real Codex credential when the transport is a test double ».

- **Où :** tests/remote-media.test.cjs:7 ; tests/video-research.test.cjs:54, 62 ; tests/clip-unreadable.test.cjs:130 ; tests/media-asr-options.test.cjs:36-37 ; tests/chat-sources.test.cjs:4 ; tests/session-optimization.test.cjs:10, 21 ; adapters/codex-session-client.cjs:272 ; adapters/codex-confinement.cjs:253-262 ; tests/surveillance-runtime.test.cjs:20-21
- **Preuve :** Quatre tests lancent le vrai ffmpeg avec trois politiques : remote-media:7 (`new RemoteMedia().assemble(input)`, ffmpeg du PATH, aucune garde) ; video-research:62 (chemin `/opt/homebrew/bin/ffmpeg` en dur sur macOS, aucune garde) ; media-asr-options:37 (`skip: !ffmpegAvailable`) ; clip-unreadable:130 (un `if` autour des assertions : elles disparaissent en silence). video-research:54 résout `path.resolve('mcp/server.cjs')` depuis le répertoire courant. Trois CodexSessionAgent sont construits avec `rpcFactory` mais sans `authHome` : `connect()` appelle `createContext(prefix, undefined)` (session-client:272), qui lie `~/.codex/auth.json` et `models_cache.json` dans l'arbre temporaire (confinement:253-262). Deux autres fichiers passent au contraire un dossier inexistant, avec le commentaire « connect() must not link real credentials during tests » (surveillance-runtime:20-21, verification:75).
- **Impact :** La première CI sera rouge (ffmpeg absent, autre répertoire courant) ou verte par omission (branche sautée). Le comportement d'un test dépend de la présence de ~/.codex sur le poste, et des identifiants réels sont liés dans tmp pendant le test.
- **Nuance du relecteur (elle prime) :** Cinq tests lancent le vrai ffmpeg, pas quatre : s'ajoute tests/server-ingest-path.test.cjs:91 (`fixture(t, { media: new RemoteMedia() })`, ffmpeg du PATH, aucune garde, statut 200 attendu lignes 99-101). Le script de l'audit lui-même (tstb-class.cjs) compte 5 fichiers « realTool ». clip-unreadable:130 n'est pas tout à fait muet : la branche `else` (ligne 138) émet un `t.diagnostic`, mais le test reste compté réussi et non sauté. video-research:62 accepte la surcharge `TVLENS_FFMPEG` (pas de saut pour autant). ffmpeg est un prérequis documenté (README.md:115, docs/installation.md:10). Le reste est exact : chat-sources:4 et session-optimization:10, 21 construisent un CodexSessionAgent sans authHome ; createContext lie auth.json et models_cache.json (adapters/codex-confinement.cjs:252-262) ; transportDouble est en codex-session-client.cjs:116. Hors périmètre, d'autres constructions sans authHome existent (refactor-boundaries:70, 110, 239 ; codex-confinement:627), non suivies jusqu'à la connexion.

<a id="TSTC-08"></a>
#### TSTC-08 — 84 tests Python hors de npm test et de toute CI, jamais lancés sur le Python de la TV

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Tests des interfaces

**Suite :** [T014](travail/tickets/014-run-every-python-test-from-npm-test-and-from-the-quality.md) « Run every Python test from npm test and from the quality check ».

**Part laissée de côté :** Reste du constat : jouer les tests Python sous Python 3.10 et réduire leurs attentes en temps réel. Non observable sur ce poste. — _Reprise :_ Après L01-10.

- **Où :** package.json:11 ; tests/test_tv_ambient.py:7-27 ; tests/test_tv_capture_gate.py:6-23, 231 ; tests/test_tv_control.py:1-16 ; docs/lg-ambient.md:161, 170 ; docs/lg-on-device-exploration.md:20 ; README.md:169
- **Preuve :** Lanceur : unittest de la bibliothèque standard (classes TestCase, `unittest.main()` en fin de fichier) ; pytest n'est pas installé. Aucune dépendance tierce (fcntl, http.server, subprocess, tempfile, threading, unittest.mock) ; fcntl limite à Linux et macOS. Mesuré ici sur ROOT, Python 3.14.2, machine chargée, sans écriture de bytecode : contrôle 9 tests en 6,0 s ; porte de capture 20 tests dont 1 sauté (scénario au rythme réel, TVLENS_SLOW=1, environ 35 s d'après docs/lg-ambient.md:148) en 13,1 s ; ambiant 55 tests en 11,9 s. Total 84 tests, 0 échec, 31 s de mur pour environ 5 s de CPU : le reste est de l'attente réelle (sous-processus, serveurs HTTP sur port éphémère). Chemins dérivés de `__file__` : lançables de n'importe quel dossier. docs/lg-ambient.md:170 : la TV a Python 3.10 et les tests n'y ont jamais tourné (3.14 seulement ; 3.9 et 3.11 : analyse syntaxique seule). README.md:169 annonce encore « 6 tests Python ».
- **Impact :** Les tests qui gardent la porte de capture et le superviseur ne sont dans aucune commande standard : une régression de tv/*.py laisse `npm test` vert. Une construction acceptée par 3.14 et refusée par 3.10 n'apparaîtrait que sur l'appareil.
- **Nuance du relecteur (elle prime) :** 84 tests confirmés (9 + 20 + 55 par grep ; la forme discover lancée sur test_tv_control.py depuis un autre dossier : 9 tests en 5,7 s). Portée incomplète : prototypes/lg-remote contient trois autres fichiers de tests Python (test_panel.py 15, test_ambient_relay.py 17, test_control.py 1, soit 33 tests) qui couvrent prototypes/lg-remote/runtime/*.py (1 114 lignes), code installé sur la TV (docs/lg-installation.md:20, README.md:139). Le motif proposé « -s tests -p 'test_tv_*.py' » les laisse hors de toute commande : ajouter une seconde découverte pour ce dossier ou déplacer ces tests. docs/lg-ambient.md:161 annonce 83 tests (capture 19) : à corriger avec README.md:169.

<a id="TSTC-11"></a>
#### TSTC-11 — Prérequis d'exécution non déclarés : version de Node, Chrome, Python, aucun fichier de CI

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Tests des interfaces

**Suite :** [T011](travail/tickets/011-declare-the-node-version-the-project-runs-on-and-refuse.md) « Declare the Node version the project runs on and refuse older ones ».

**Part laissée de côté :** Reste du constat : un flux d'intégration continue (aucun dossier .github, réseau requis) et le chemin de Chrome écrit en dur dans quatre scripts de fumée et simulate-tv-ambient.mjs demandent un navigateur, donc ne s'exécutent pas dans une session de ticket. — _Reprise :_ Après L01-09 et L01-10, quand le propriétaire décide d'une intégration continue.

- **Où :** package.json:1-39 ; tests/architecture-f09.test.cjs:243 ; tests/mac-ui.test.cjs:10 ; tests/mac-ipc-contract.test.cjs:10, 198 ; scripts/smoke-lg-ui.mjs:13 ; scripts/simulate-tv-ambient.mjs:26-27
- **Preuve :** package.json n'a ni `engines` ni `type` ; pas de .nvmrc ni de dossier .github. Des tests importent des fichiers .js à syntaxe ESM (`await import('../app/ui/recap-view.js')`) : cela ne fonctionne que grâce à la détection de syntaxe des modules de Node (24.12.0 sur cette machine). `t.mock.timers` et `structuredClone` sont requis par le banc d'hôte ; sharp (binaire natif) par mac-ipc-contract et trois smokes. Le chemin `/Applications/Google Chrome.app/…` est en dur dans quatre smokes et simulate-tv-ambient.mjs. Python : `python3` du PATH (3.14 par pyenv ici) alors que la TV est en 3.10.
- **Impact :** Sur un Node plus ancien une partie de la suite échoue à l'import avec un message sans rapport ; aucune des cinq commandes de vérification n'est reproductible sur une machine neuve ou en CI sans connaissance orale.
- **Nuance du relecteur (elle prime) :** Constat exact au commit 8627b46 : ni engines, ni type, ni .nvmrc, ni .github ; Node 24.12.0 ; python3 est un shim pyenv en 3.14.2. Un point de la remédiation est nuisible tel quel : un fichier .python-version n'est pas de la documentation, pyenv l'applique ; seuls 2.7.18 et 3.14.2 sont installés ici, donc y écrire 3.10 ferait échouer python3 dans le dépôt, et test:tv avec lui. Déclarer le plancher ailleurs : requires-python >= 3.10 dans le pyproject.toml de TSTC-19, ou la seule matrice CI. La détection de syntaxe des modules existe dès Node 22.7 ; >= 22.12 reste un plancher sûr (VPS en 24.13, docs/vps-deployment.md:9). À réconcilier avec le harnais scripts/check.mjs apparu après ce commit sur refactor/maintenabilite (non lu ici : supposé, d'après CLAUDE.md).

<a id="FLK-14"></a>
#### FLK-14 — Couverture qui dépend de la machine : ffmpeg, plateforme, version de Node, répertoire courant, Python

**Verdict : confirmé** · priorité P2 · effort S · risque faible · Déterminisme des tests

**Suite :** [T009](travail/tickets/009-skip-by-name-or-fail-on-demand-the-tests-that-need-ffmpeg.md) « Skip by name, or fail on demand, the tests that need ffmpeg » ; [T011](travail/tickets/011-declare-the-node-version-the-project-runs-on-and-refuse.md) « Declare the Node version the project runs on and refuse older ones » ; [T014](travail/tickets/014-run-every-python-test-from-npm-test-and-from-the-quality.md) « Run every Python test from npm test and from the quality check ».

**Part laissée de côté :** Reste du constat : une image d'intégration continue qui fige les outils. Dépend de la décision sur l'intégration continue. — _Reprise :_ Après L01-07, L01-09 et L01-10.

- **Où :** tests/clip-unreadable.test.cjs:130 ; tests/media-asr-options.test.cjs:36-37 ; tests/architecture-f05.test.cjs:73, 105, 431, 464 ; tests/codex-confinement.test.cjs:352, 425, 499, 755 ; tests/video-research.test.cjs:54 ; package.json ; tests/test_tv_control.py:100-113
- **Preuve :** clip-unreadable:130 n'exécute sa seconde moitié que si ffmpeg est installé, sans le signaler ; media-asr-options:37 le fait avec un motif de skip.

  8 tests sont sautés sous win32. package.json n'a pas de champ engines et le dépôt n'a pas de .nvmrc (Node 24.12.0 ici). video-research:54 résout 'mcp/server.cjs' depuis le répertoire courant.

  Les 3 fichiers Python (1565 lignes, vrais threads, serveurs HTTP et time.monotonic) ne sont pas lancés par npm test ; je n'en ai lu que les en-têtes.
- **Impact :** Le même commit ne teste pas la même chose en local et en CI, sans que le rapport le dise.

<a id="FLK-15"></a>
#### FLK-15 — Chemins fixes partagés dans le dossier temporaire commun

**Verdict : nuancé** · priorité P3 · effort S · risque faible · Déterminisme des tests

**Suite :** [T010](travail/tickets/010-link-no-real-codex-credential-when-the-transport-is-a-test.md) « Link no real Codex credential when the transport is a test double » ; [T013](travail/tickets/013-give-each-test-file-a-private-temp-directory-and-report-what.md) « Give each test file a private temp directory and report what it leaves ».

**Part laissée de côté :** Reste du constat : nettoyer, fichier par fichier, ce que les tests laissent dans leur dossier temporaire. La liste vient du journal de L01-05. — _Reprise :_ Après L01-05.

- **Où :** tests/architecture-f05.test.cjs:43, 205 ; tests/architecture-f08.test.cjs:24 ; tests/codex-connect-race.test.cjs:9 ; tests/codex-confinement.test.cjs:19 ; tests/codex-thread-rotation.test.cjs:14 ; tests/surveillance-runtime.test.cjs:21 ; tests/review-regressions.test.cjs:25 ; tests/verification.test.cjs:75, 181 ; tests/server-sessions.test.cjs:627 ; tests/media-asr-options.test.cjs:26-32 ; tests/architecture-f06.test.cjs:60-63
- **Preuve :** 8 fichiers partagent le chemin fixe os.tmpdir()/tvlens-test-absent-codex-home, censé ne pas exister : il empêche de lier de vrais identifiants (surveillance-runtime.test.cjs:20). server-sessions:627 fait de même avec tvlens-absent-sessions.

  media-asr-options:26-32 remplace TMPDIR pour que son contrôle de fuite soit exact « while other test runs share the machine », et f06:60-63 filtre ses propres dossiers pour la même raison.

  Fait favorable : après une centaine de lancements, mon TMPDIR privé ne contenait que 2 arbres tvlens-codex-session-, laissés par les deux exécutions de FLK-02 tuées.
- **Impact :** Un dossier de ce nom présent sur une machine change le comportement de 8 fichiers. Les contrôles de fuite voient les dossiers des fichiers voisins.
- **Nuance du relecteur (elle prime) :** Compteurs exacts : 8 fichiers pour tvlens-test-absent-codex-home, server-sessions:627, media-asr-options 26-32, architecture-f06 60-63. Impact surestimé : le chemin n'est jamais créé, seulement lu, donc aucune course entre fichiers ; et un dossier de ce nom ne change rien s'il est vide, createContext ne liant que auth.json et models_cache.json quand ils existent (adapters/codex-confinement.cjs:252-260). Même famille, non citée : userData: os.tmpdir() en server-sessions:627, et le binaire fixe tvlens-test-absent-codex en codex-confinement:495 (verification:181 est cité). Forme plus simple que le mkdtemp par test, ces chemins étant des constantes de module dans 8 fichiers : une constante unique dans le module de support, avec une assertion au chargement que le chemin n'existe pas. Le TMPDIR privé vérifié vide est à porter par le même ticket que FLK-13.

<a id="OUBLI-04"></a>
#### OUBLI-04 — Cause probable de l'échec intermittent 429

**Verdict : nuancé** · Signalement du relecteur — Adaptateurs et frontières

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Déjà traité par le ticket T001 (statut terminé, commit fb19ce6). — _Reprise :_ Rien à faire : T001 est terminé.

- **Signalement :** Cause probable de l'échec intermittent 429 (déduite à la lecture, non reproduite) : server/http.cjs:237-248 cherche le doublon avant de regarder `ingesting`, mais n'inscrit la clé qu'au retour de runtime.ingest (:258-266), alors que le passage est publié avant ce retour (core/session.cjs:117-135 : émission, puis sauvegarde du premier passage et miniature). Le même bloc renvoyé dans cette fenêtre reçoit 429 au lieu de 200 doublon ; tests/architecture-f06.test.cjs:529-530 attend le passage visible, pas la fin du stockage.

<a id="OUBLI-11"></a>
#### OUBLI-11 — Minuterie de garde du client Codex réarmée sans unref : un tour abandonné retient le processus

**Verdict : confirmé** · Signalement du relecteur — Déterminisme des tests

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T005](travail/tickets/005-let-a-codex-turn-left-in-flight-stop-holding-its-process.md) « Let a Codex turn left in flight stop holding its process alive ».

- **Signalement :** adapters/codex-session-client.cjs:781-791 : minuterie de garde réarmée chaque seconde, sans unref, pendant toute la vie d'un tour, effacée seulement en 812. C'est elle qui retient le processus après l'échec de FLK-02, et tout test qui abandonne un tour en cours (assertion levée avant cancel ou close) bloque son fichier de la même façon. Comme Node 24.12 ne borne pas un fichier de test (FileTest.timeout = null), --test-timeout ne protège pas de ce cas.

<a id="OUBLI-36"></a>
#### OUBLI-36 — Trois échecs latents sous disque ralenti, absents de l'audit

**Verdict : confirmé** · Signalement du relecteur — Tests de comportement

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T004](travail/tickets/004-wait-for-the-turn-request-itself-in-the-verifier-deadline.md) « Wait for the turn request itself in the verifier deadline test » ; [T006](travail/tickets/006-read-the-session-folder-only-after-the-store-has-finished.md) « Read the session folder only after the store has finished writing ».

**Part laissée de côté :** Reste du constat : l'échec de tests/server-sessions.test.cjs (ligne 688) vu une fois sous la sonde large, de cause inconnue. Il faut d'abord le reproduire avec les sondes livrées. — _Reprise :_ Après L01-06.

- **Signalement :** Trois échecs latents du périmètre, reproduits sous disque ralenti de 5 ms par les sondes de le dossier de sondes de l'audit (flaky/) (journaux lus, non relancés), absents de TSTB-03 : tests/session-durable.test.cjs:271-277 (`settle(watch)` n'attend pas l'écriture, `readdir` voit `manifest.json.tmp` ; probe-durable20-slow.log) ; tests/verification.test.cjs:238 (`until` de 2 000 tours défini ligne 77, sans le recours au temps réel que surveillance-runtime.test.cjs:13-19 justifie par l'arbre Codex créé sur disque ; probe-verification10-slow.log) ; tests/server-sessions.test.cjs:688 (activité asynchrone après la fin du test ; probe-wide-server-sessions-slow.log).

<a id="OUBLI-37"></a>
#### OUBLI-37 — Aucun délai par test ni nettoyage garanti à l'échec

**Verdict : confirmé** · Signalement du relecteur — Tests de comportement

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T004](travail/tickets/004-wait-for-the-turn-request-itself-in-the-verifier-deadline.md) « Wait for the turn request itself in the verifier deadline test » ; [T007](travail/tickets/007-add-a-test-launcher-that-stops-and-names-a-test-file-that.md) « Add a test launcher that stops and names a test file that hangs » ; [T012](travail/tickets/012-run-npm-test-and-the-quality-check-through-the-test-launcher.md) « Run npm test and the quality check through the test launcher ».

- **Signalement :** Aucun délai par test ni nettoyage garanti à l'échec : package.json:11 n'a pas de `--test-timeout`, et dans le périmètre seul tests/local-vlm-agent.test.cjs pose `{ timeout: 10000 }` (8 tests). tests/verification.test.cjs:207-250 libère ses vérificateurs en fin de corps et non par `t.after` : quand `until` échoue ligne 238, le fichier reste vivant 324 s (flaky/probe-verification10-slow.log:12) ou jusqu'au chien de garde de la sonde (flaky/probe-wide-verification-slow.log:12).

<a id="OUBLI-41"></a>
#### OUBLI-41 — 33 tests Python de prototypes/lg-remote absents du décompte et de toute commande

**Verdict : confirmé** · Signalement du relecteur — Tests des interfaces

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T014](travail/tickets/014-run-every-python-test-from-npm-test-and-from-the-quality.md) « Run every Python test from npm test and from the quality check ».

- **Signalement :** prototypes/lg-remote/test_panel.py, test_ambient_relay.py, test_control.py : 33 tests Python (15 + 17 + 1) pour prototypes/lg-remote/runtime/*.py (1 114 lignes installées sur la TV, docs/lg-installation.md:20). Absents du décompte de TSTC-08 et de sa commande de découverte ; aucune commande npm ne les lance.

### L02 — Des tests qui ne lisent plus le texte du code source

Vague 1 · 14 constats · 11 tickets

- [T015](travail/tickets/015-make-the-mac-window-source-text-assertions-independent-of.md) — Make the Mac window source-text assertions independent of code layout
- [T016](travail/tickets/016-make-the-static-guards-of-the-mac-renderer-fail-when-they.md) — Make the static guards of the Mac renderer fail when they scan nothing
- [T017](travail/tickets/017-move-the-search-sequencing-of-the-mac-window-into-a-tested.md) — Move the search sequencing of the Mac window into a tested controller
- [T018](travail/tickets/018-extract-the-reception-rules-of-the-mac-window-as-pure-tested.md) — Extract the reception rules of the Mac window as pure tested functions
- [T019](travail/tickets/019-declare-the-ipc-channels-of-the-mac-host-once-and-check-them.md) — Declare the IPC channels of the Mac host once and check them at runtime
- [T020](travail/tickets/020-prove-on-the-mac-bench-that-a-question-leaves-a-manual.md) — Prove on the Mac bench that a question leaves a manual verification running
- [T021](travail/tickets/021-import-the-rolling-recorder-in-its-tests-instead-of.md) — Import the rolling recorder in its tests instead of rewriting its source
- [T022](travail/tickets/022-declare-the-tv-drop-causes-once-and-prove-each-one-has-its.md) — Declare the TV drop causes once and prove each one has its words
- [T023](travail/tickets/023-share-the-comment-stripping-of-the-static-guards-and-free.md) — Share the comment stripping of the static guards and free one from quote style
- [T024](travail/tickets/024-make-the-remaining-static-guards-tolerant-of-quotes-and-line.md) — Make the remaining static guards tolerant of quotes and line breaks
- [T025](travail/tickets/025-state-the-layer-rules-as-one-table-in-the-architecture-test.md) — State the layer rules as one table in the architecture test

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [UI-01](#UI-01) | Tests couplés au texte source du renderer | nuancé | P0 | [T015](travail/tickets/015-make-the-mac-window-source-text-assertions-independent-of.md) |
| [TSTC-04](#TSTC-04) | Trois gardes statiques se vident au formatage ou au découpage sans faire échouer la suite | nuancé | P0 | [T016](travail/tickets/016-make-the-static-guards-of-the-mac-renderer-fail-when-they.md) |
| [TSTA-08](#TSTA-08) | Gardes sur le texte source fragiles ou mal placées ; les règles de dépendance de l'hexagone ne sont presque pas gardées | nuancé | P1 | [T023](travail/tickets/023-share-the-comment-stripping-of-the-static-guards-and-free.md), [T025](travail/tickets/025-state-the-layer-rules-as-one-table-in-the-architecture-test.md) |
| [TSTC-01](#TSTC-01) | Recherche de passages du renderer prouvée par 7 regex sur son texte | nuancé | P1 | [T017](travail/tickets/017-move-the-search-sequencing-of-the-mac-window-into-a-tested.md) |
| [TSTC-02](#TSTC-02) | Réception de la surveillance, bandeau et pile de cartes prouvés par 7 regex | confirmé | P1 | [T018](travail/tickets/018-extract-the-reception-rules-of-the-mac-window-as-pure-tested.md) |
| [TSTC-03](#TSTC-03) | Contrat IPC lu par regex dans app/main.cjs alors que le banc d'hôte le connaît à l'exécution | nuancé | P1 | [T019](travail/tickets/019-declare-the-ipc-channels-of-the-mac-host-once-and-check-them.md), [T020](travail/tickets/020-prove-on-the-mac-bench-that-a-question-leaves-a-manual.md) |
| [TSTC-05](#TSTC-05) | Rendu des cartes vérifié par la position de littéraux ; 11 points d'entrée DOM Mac sur 12 jamais exécutés | confirmé | P2 | pas de ticket |
| [TSTC-07](#TSTC-07) | recording.test.cjs charge app/recording.js par chirurgie de texte puis vm | confirmé | P2 | [T021](travail/tickets/021-import-the-rolling-recorder-in-its-tests-instead-of.md) |
| [TSTC-13](#TSTC-13) | Contrat des causes de perte vérifié par une regex JavaScript sur le source Python, à moitié | nuancé | P2 | [T022](travail/tickets/022-declare-the-tv-drop-causes-once-and-prove-each-one-has-its.md) |
| [TSTC-15](#TSTC-15) | 45 gardes statiques légitimes à conserver, à rendre insensibles aux guillemets et à regrouper | nuancé | P2 | [T024](travail/tickets/024-make-the-remaining-static-guards-tolerant-of-quotes-and-line.md) |
| [TSTB-19](#TSTB-19) | Tests de comportement qui lisent le texte source | nuancé | P3 | [T025](travail/tickets/025-state-the-layer-rules-as-one-table-in-the-architecture-test.md) |
| [TSTC-19](#TSTC-19) | Tests Python denses, avec trois gardes sur le texte sensibles aux commentaires | confirmé | P3 | pas de ticket |
| [OUBLI-15](#OUBLI-15) | Des assertions sur le texte source de l'hôte Mac épinglent ses minuteries | confirmé | — | [T019](travail/tickets/019-declare-the-ipc-channels-of-the-mac-host-once-and-check-them.md) |
| [OUBLI-24](#OUBLI-24) | app/index.html n'est pas audité alors qu'il est aussi dense que renderer.js | confirmé | — | [T015](travail/tickets/015-make-the-mac-window-source-text-assertions-independent-of.md) |

<a id="UI-01"></a>
#### UI-01 — Tests couplés au texte source du renderer

**Verdict : nuancé** · priorité P0 · effort M · risque faible · Interfaces (Mac, TV, scripts Python)

**Suite :** [T015](travail/tickets/015-make-the-mac-window-source-text-assertions-independent-of.md) « Make the Mac window source-text assertions independent of code layout ».

Constat d'origine :

- Où : `tests/mac-ui.test.cjs:330-339, 644-656, 705-716` ; `tests/architecture-f09.test.cjs:237` ; `tests/recording.test.cjs:32`.
- Preuve : `assert.match(renderer, /if\(!savedId\)return replay\(moment\.id,0,moment\);/)`. `receiveRecap` est extrait par regex puis évalué. Commentaire du test : « The window itself cannot be loaded here ».
- Impact : un formateur ou un déplacement de fonction fait échouer des tests sans régression réelle.
- Remède : sortir la logique visée (recherche, réception du récap, garde de session) en `.mjs` importables et tester le comportement. Garder les gardes statiques utiles (ids présents dans `index.html`, méthodes du bridge exposées).
- Effort M, risque faible. Prérequis de UI-02.

- **Nuance du relecteur (elle prime) :** Le fond tient, le périmètre est incomplet. Les citations existent (tests/mac-ui.test.cjs:335-339, 645-657, 705-716 ; extraction de receiveRecap à tests/architecture-f09.test.cjs:239-243, deux lignes après la ligne citée). Trois emplacements manquent : mac-ui.test.cjs:137-140 (trois regex sur le texte de app/ui/job-card.js, c'est le quatrième test de mac-ui qui casse après formatage), mac-ipc-contract.test.cjs:94-117 (regex sur app/main.cjs, cinquième test cassé) et tv-panel.test.cjs:540-543 (regex sur le texte de tv/capture.py et tv/transport.py). recording.test.cjs:32 relève d'un autre mécanisme (module entier évalué dans vm après retrait des import/export) et n'a pas cassé sous Prettier. La direction est déjà actée : ADR 0001 (l.36) écarte la logique laissée dans renderer.js parce que la preuve s'y réduit à des gardes textuelles, ADR 0009 (l.80) liste la dépendance à la forme de receiveRecap comme limite connue. Hors copie figée : docs/standards.md du commit 0262480 interdit ces tests et refuse toute ligne ajoutée de plus de 160 caractères, donc tout code déplacé hors de renderer.js devra être reformaté. UI-01 est le prérequis de tout formateur, pas seulement de UI-02.

<a id="TSTC-04"></a>
#### TSTC-04 — Trois gardes statiques se vident au formatage ou au découpage sans faire échouer la suite

**Verdict : nuancé** · priorité P0 · effort S · risque faible · Tests des interfaces

**Suite :** [T016](travail/tickets/016-make-the-static-guards-of-the-mac-renderer-fail-when-they.md) « Make the static guards of the Mac renderer fail when they scan nothing ».

- **Où :** tests/mac-ui.test.cjs:661, 665-670, 678-679, 687-691 ; tests/mac-ipc-contract.test.cjs:97
- **Preuve :** Rejoué sur FMT. l.668 `^import\s*\{([^}]+)\}\s*from\s*'([^']+)';?\s*$` ne reconnaît plus que 5 imports sur 33 (14 noms sur 79) : le garde « imports only what its modules export » passe en ayant vérifié 18 % des noms. l.678 `\$\('([^']+)'\)` : 378 appels reconnus -> 0 ; `this\.get\('…'\)` : 27 -> 0 : « finds every element it asks for » passe sans rien vérifier. l.688 `\b(?:bridge|window\.tvlens)\??\.([A-Za-z]+)` : 57 noms -> 50 (appel coupé après le point) ; seul `storage`, exigé par la liste l.689, produit l'échec visible du journal. mac-ipc l.97 boucle sur un ensemble devenu vide. Déplacement : le garde d'ids ne lit que renderer.js et ui/shell.js, et `rendererFiles` (l.661) est figé sur renderer.js, recording.js et ui/* : un dossier app/controllers issu de UI-02 échapperait aux trois gardes.
- **Impact :** Pire qu'un échec : après formatage ou découpage la suite reste verte alors que la protection contre une page blanche (id absent d'index.html, import inexistant, méthode de pont non exposée) a disparu.
- **Nuance du relecteur (elle prime) :** Fond confirmé et rejoué : 378 appels reconnus puis 0, 27 puis 0, 57 méthodes puis 50, et la suite reste verte. Le chiffre « 5 imports sur 33 (14 noms sur 79) » est un artefact de mesure : la passe Prettier de FMT n'a pas touché les sept app/ui/*.mjs (identiques à ROOT, lignes jusqu'à 287 caractères), et ce sont eux qui fournissent les 5 imports encore reconnus ; avec un formatage complet aux réglages par défaut le garde vérifie 0 import sur 33. Prérequis du point 1 incomplet : import/named n'appartient pas au cœur d'ESLint mais à eslint-plugin-import (une dépendance de plus) ; sans elle, un motif multi-ligne indifférent aux guillemets suffit pour renderer.js. Vérifié par exécution : les 14 modules de app/ui et app/recording.js s'importent déjà sous Node 24.12 sans DOM, donc le point 1 est faisable dès maintenant. Priorité P0 parce que la perte est silencieuse et doit précéder le formateur.

<a id="TSTA-08"></a>
#### TSTA-08 — Gardes sur le texte source fragiles ou mal placées ; les règles de dépendance de l'hexagone ne sont presque pas gardées

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Tests nommés par chantier

**Suite :** [T023](travail/tickets/023-share-the-comment-stripping-of-the-static-guards-and-free.md) « Share the comment stripping of the static guards and free one from quote style » ; [T025](travail/tickets/025-state-the-layer-rules-as-one-table-in-the-architecture-test.md) « State the layer rules as one table in the architecture test ».

- **Où :** tests/architecture.test.cjs:5-30 ; tests/architecture-f07.test.cjs:578-591 ; tests/codex-confinement.test.cjs:457-483 ; tests/architecture-f09.test.cjs:236-240
- **Preuve :** 24 assertions du périmètre comparent du texte source : architecture.test.cjs 6 (sur 6), f07:578 7, confinement:457 10, f09:237 1. Le retrait des commentaires par la même paire d'expressions régulières est recopié dans 5 fichiers de tests/. architecture.test.cjs:7 et :16 listent un dossier sans récursion puis lisent chaque entrée comme un fichier : le premier sous-dossier créé dans core/, runtime/ ou server/ fait échouer le test sur EISDIR. confinement:481 exige la chaîne exacte `process.env.TVLENS_CODEX_CONFINEMENT || "enforce` (guillemets et opérateur compris), alors que le même fait est prouvé par comportement en :337-338. f07:586 interdit `.slice(0, 200)` dans deux fichiers. f09:237 extrait `receiveRecap` de app/renderer.js par expression régulière puis l'évalue (déjà relevé par UI-01). Seules deux règles de dépendance sont gardées : core sans import sortant, runtime et server sans electron. Un comptage des imports montre que les autres sont respectées aujourd'hui (runtime vers core 11 et adapters 19, server vers adapters 9 et runtime 1, adapters vers core 8, mcp vers core 2, aucune arête inverse), sans qu'aucun test ne l'impose.
- **Impact :** Gardes utiles et gardes fragiles sont mêlées à des tests de comportement. Un découpage en sous-dossiers casse le test d'architecture pour une mauvaise raison. Rien n'empêche un adaptateur d'importer runtime/.
- **Nuance du relecteur (elle prime) :** Preuve exacte : 6 + 7 + 10 + 1 assertions sur le texte source, lecture non récursive en architecture.test.cjs:7 et :16 (EISDIR au premier sous-dossier ; core/, runtime/ et server/ n'en ont aucun aujourd'hui), et les arêtes d'import se recomptent à l'identique (runtime vers core 11 et adapters 19, server vers adapters 9 et runtime 1, adapters vers core 8, mcp vers core 2, app vers adapters 15, core 5 et runtime 4, aucune arête inverse). À corriger dans la remédiation. 1) Un sous-dossier tests/architecture/ ne serait pas lancé par le contrôle de HEAD : scripts/check.mjs:98-99 et package.json ne listent que tests/*.test.cjs, alors que le cliquet compte les tests récursivement ; et docs/standards.md nomme tests/architecture.test.cjs comme vérificateur de deux règles. Garder des fichiers à plat et ce nom, ou demander explicitement la modification du harnais. 2) Retirer confinement:481 affaiblit une garde de sécurité : :337-338 prouvent la valeur par défaut et la lecture de l'environnement, pas l'unicité de cette lecture ni l'absence d'écriture par le produit. La rendre indifférente aux guillemets au lieu de la supprimer. 3) Réduire f07:578 à deux faits retire cinq assertions (chaque hôte charge le protocole, appelle closeSession et settleQuestions, l'hôte serveur ne garde pas d'aide propre) : à justifier par les 7 scénarios onBothHosts, ou à garder. 4) La paire d'expressions qui retire les commentaires est dans 4 fichiers ; tv-app-compat:37 ne traite que du CSS.

<a id="TSTC-01"></a>
#### TSTC-01 — Recherche de passages du renderer prouvée par 7 regex sur son texte

**Verdict : nuancé** · priorité P1 · effort M · risque faible · Tests des interfaces

**Suite :** [T017](travail/tickets/017-move-the-search-sequencing-of-the-mac-window-into-a-tested.md) « Move the search sequencing of the Mac window into a tested controller ».

- **Où :** tests/mac-ui.test.cjs:644-656 ; app/renderer.js:164-176, 188, 540-549, 572-575
- **Preuve :** Légende : F = casse au formatage (rejoué sur FMT), D = casse si le code quitte app/renderer.js. l.645 corps exact de clearSearch (jeton incrémenté, résultats et statut vidés) : F, D. l.646 un changement de session appelle clearSearch : D. l.647 clearSession appelle clearSearch : D. l.651-652 ordre de fragments minifiés `at('const revision=++searchRevision;') < at('await bridge.searchMoments(') < at('if(revision!==searchRevision)return;') < …` : F, D. l.654 un refus tardif n'écrit pas le statut : F, D. l.655 `if(!savedId)return replay(moment.id,0,moment);` : F, D. l.656 replay interroge replayTarget avec la session de la carte : F, D. Soit 5 sur 7 cassés par Prettier quel que soit le réglage (il réécrit les espaces et déplie les blocs d'une ligne) ; le journal ne montre que l.645. Commentaire l.642 : « The window itself cannot be loaded here ». Le smoke Electron ne lance aucune recherche (seule mention de #moment-query : un contrôle de focus, scripts/smoke-electron.mjs:580).
- **Impact :** Bloque le formateur et le découpage de renderer.js (UI-02). La règle (réponse tardive jetée, résultats vidés au changement de session ou au reset) n'est prouvée par aucune exécution côté fenêtre : seul l'ordre des caractères l'est.
- **Nuance du relecteur (elle prime) :** Preuve rejouée sur ROOT et FMT : exacte (645, 651-652, 654, 655, 656 tombent ; 646 et 647 survivent ; le smoke Electron ne fait qu'un contrôle de focus l.580). Deux précisions. (1) l.656 ne casse pas « quel que soit le réglage » : la ligne visée (app/renderer.js:167) fait 124 caractères et reste intacte avec printWidth >= 124 ; seules 645, 651-652, 654 et 655 cassent à coup sûr. (2) Supprimer aussi 646-647 retire la seule preuve, dans npm test, que receiveState (renderer.js:188) et clearSession (renderer.js:543) déclenchent le vidage : après extraction, ce câblage n'est plus prouvé que par l'étape recherche du smoke Electron (TSTC-10 point 3), à livrer dans le même ticket, ou garder ces deux gardes adaptées d'ici là. La dette est déjà reconnue par docs/adr/0001 (l.36 et l.54) et la remédiation prolonge sa décision 4. Même constat que UI-01 de l'audit interfaces : à fusionner.

<a id="TSTC-02"></a>
#### TSTC-02 — Réception de la surveillance, bandeau et pile de cartes prouvés par 7 regex

**Verdict : confirmé** · priorité P1 · effort M · risque moyen · Tests des interfaces

**Suite :** [T018](travail/tickets/018-extract-the-reception-rules-of-the-mac-window-as-pure-tested.md) « Extract the reception rules of the Mac window as pure tested functions ».

- **Où :** tests/mac-ui.test.cjs:335-339, 705-706, 710 ; app/renderer.js:210, 598-599, 605, 608, 622-624, 802-812 ; tests/architecture-f09.test.cjs:237-239 (hors périmètre, même cause)
- **Preuve :** l.335 surveillanceView passe `banner: true` : F, D. l.336 `/const unsaved = view\.notice\?\.text \|\| '';\s*\$\('watch-notice'\)\.hidden = !unsaved;/` (bandeau caché sans avis) : F, D. l.337 texte du bandeau : F, D. l.339 `/seen = sequences\(restoring \? null : state\); if \(!restoring\) seenFor = state\.sessionId;/` (référence du badge prise après restauration) : F, D. l.705 la pile reçoit `surveillanceView().cards` : D. l.706 un seul `cardQueue.offer(` : D. l.710 `#memory-status = describeMemory(state, { library })` : F, D. Cinq cassent sur FMT ; le journal ne montre que l.335. La TV possède déjà la forme pure de la règle de l.339 : `badgeReference` et `registryMarks` exportés par tv/app/companion.js, testés par comportement (tests/tv-panel.test.cjs:299-315). architecture-f09.test.cjs:237 découpe `receiveRecap` par regex dans renderer.js et l'évalue dans vm : casse au déplacement.
- **Impact :** Mêmes blocages que TSTC-01. La règle « un historique restauré n'est pas une nouvelle » existe en deux écritures (Mac en ligne dans le renderer, TV en fonction pure) dont une seule est exécutée par un test.

<a id="TSTC-03"></a>
#### TSTC-03 — Contrat IPC lu par regex dans app/main.cjs alors que le banc d'hôte le connaît à l'exécution

**Verdict : nuancé** · priorité P1 · effort M · risque faible · Tests des interfaces

**Suite :** [T019](travail/tickets/019-declare-the-ipc-channels-of-the-mac-host-once-and-check-them.md) « Declare the IPC channels of the Mac host once and check them at runtime » ; [T020](travail/tickets/020-prove-on-the-mac-bench-that-a-question-leaves-a-manual.md) « Prove on the Mac bench that a question leaves a manual verification running ».

- **Où :** tests/mac-ipc-contract.test.cjs:94-100, 106-117, 141-194, 231, 236, 469 ; app/main.cjs:81, 84-88
- **Preuve :** `handled = all(mainSource, /(?<![.\w])handle\(\s*'([^']+)'/g)` : 49 canaux sur ROOT, 0 sur FMT (guillemets), d'où l'échec observé l.95. Derrière lui : l.96 (évènements émis = écoutés), l.98-99, l.100, l.107 et l.109 (forme exacte d'un handler), l.112 (agent simulé propre à la surveillance), l.114, l.116-117 (littéraux visionDuringAsk) cassent aussi : 10 sites sur 13. l.106 et l.108 comptent des occurrences (`verifierAdapter?.cancel?.()` = 2, `surveillance.stop(` = 1) à la place d'un comportement ; ils survivent au formatage, pas au déplacement. Le même fichier a le banc `launch()` (l.141-194) dont le faux `ipcMain.handle` remplit `handlers` (Map, déjà lue l.231) : l'ensemble des canaux traités existe à l'exécution. l.114 double l.236 (balayage lancé une fois) et l.469 (balayage en échec, l'hôte démarre). Le preload est en bac à sable (`sandbox: true`, main.cjs:81) : il ne peut pas require un module partagé.
- **Impact :** Le test de contrat le plus important du Mac tombe au premier formatage ; déplacer les handlers hors de main.cjs (découpage attendu) le casse aussi.
- **Nuance du relecteur (elle prime) :** Compteurs rejoués et exacts : 49 canaux et 11 évènements sur ROOT, 0 et 0 sur FMT, 10 sites sur 13 cassent, l.114 doublée par l.236 et l.469-470. Trois faits à corriger dans la remédiation. (1) Le point 5 n'est pas faisable tel quel : launch() ajoute toujours --smoke-test (tests/mac-ipc-contract.test.cjs:168) et, en mode smoke, app/main.cjs:55 prend le littéral { visionDuringAsk: true } ; TVLENS_VISION_DURING_ASK n'est lu que dans le repli du .catch de loadConfig, hors smoke, donc l'environnement n'a aucun effet observable sur le banc. Forme faisable : extraire le choix de configuration de main.cjs:55 en fonction pure testée, ou s'appuyer sur adapters/config.cjs:70 ; à traiter avec ADP-03. (2) Le garde « send refuse un canal non déclaré » ne couvre pas 7 appels directs à window.webContents.send (main.cjs:95, 99, 169, 210, 238, 517, 518) ; quatre évènements ne passent que par eux (saved:changed, saved:error, verify:state, moments:explain-requested) : les faire passer par send d'abord. (3) Le preload étant en bac à sable, les noms de canaux restent écrits deux fois : la table ne supprime pas le doublon, elle le fait vérifier à l'exécution.

<a id="TSTC-05"></a>
#### TSTC-05 — Rendu des cartes vérifié par la position de littéraux ; 11 points d'entrée DOM Mac sur 12 jamais exécutés

**Verdict : confirmé** · priorité P2 · effort M · risque faible · Tests des interfaces

**Suite : pas de ticket.** Remplacer ces gardes par une preuve de rendu demande un faux DOM, helper réservé au lot L05 (arbitrage sur les helpers de test). — _Reprise :_ après lot:L05

- **Où :** tests/mac-ui.test.cjs:137-140, 716 ; app/ui/job-card.js:40, 110, 153-156, 176-227 ; app/ui/recap-view.js:76 ; app/ui/surveillance-dom.js:20-84 ; app/ui/sessions-dom.js:4 ; app/ui/shell.js:4 ; app/ui/icons.js:9
- **Preuve :** l.138 `el('p', 'hint job-fresh', view.freshnessLabel)` (la carte écrit le libellé choisi par le modèle) : F, D. l.139 `line.title = view.freshness.label` : D. l.140 `card.indexOf("'hint job-fresh-detail', view.freshness.detail") > card.indexOf("'Détails du traitement'")` : l'ordre de deux littéraux dans le fichier tient lieu de test de structure : F, D. l.716 trois regex « les limites passent par agreeText » (job-card.js, recap-view.js, renderer.js) : F, D. Exports DOM : jobEntry, verificationEntry, pendingEntry, sessionEntry, cardNode, cardEntry, historyEntry, filterEntry, gapEntry, setIcon, ViewingShell, renderRecapView ; seul renderRecapView est exécuté par un test (tests/architecture-f09.test.cjs:243). 442 lignes sans exécution (job-card 233, surveillance-dom 90, shell 77, sessions-dom 25, icons 17).
- **Impact :** Un bloc mal imbriqué, un bouton sans data-action ou un état désactivé oublié ne fait échouer aucun test Node ; les regex cassent au formatage sans dire si le rendu a changé.
- **Remède proposé par l'audit :** tests/mac-dom.test.cjs sur le DOM commun de TSTC-06 : `jobEntry(job, ctx).render()` -> `.job-fresh` porte freshnessLabel, son title la phrase entière, `.job-fresh-detail` est dans le details « Détails du traitement » ; `.answer-limits` contient le texte accordé (« 1 passage », jamais « passage(s) ») ; keepOpen garde un bloc ouvert après re-rendu ; cardNode d'un signal n'a ni source ni lien ; sessionEntry désactive Supprimer et pose le motif en title quand canDelete est faux ; chaque bouton porte data-action. Puis suppression de l.137-140 et l.716.
- **Risque du remède selon le relecteur :** Des tests DOM qui recopient la structure (ordre exact des enfants) deviennent aussi fragiles que les regex remplacées ; les limiter à ce que l'utilisateur perçoit (texte, title, disabled, data-action) et recouper avec scripts/smoke-electron.mjs:186-264.

<a id="TSTC-07"></a>
#### TSTC-07 — recording.test.cjs charge app/recording.js par chirurgie de texte puis vm

**Verdict : confirmé** · priorité P2 · effort S · risque faible · Tests des interfaces

**Suite :** [T021](travail/tickets/021-import-the-rolling-recorder-in-its-tests-instead-of.md) « Import the rolling recorder in its tests instead of rewriting its source ».

- **Où :** tests/recording.test.cjs:22-33 ; app/recording.js:1
- **Preuve :** `fs.readFileSync(…).replace(/^import .*;\n/, '').replace(/export /g, '')` puis `vm.runInNewContext(source + '\nRollingRecorder;', sandbox)`. La première regex, sans drapeau g ni m, ne retire qu'un import, en tête de fichier et sur une ligne ; `export ` est retiré partout, y compris dans une chaîne. Survit au formatage (vérifié : l'import reste sur une ligne dans FMT, les 6 tests passent dans le journal). Casse au deuxième import, à un import multi-lignes, ou si RollingRecorder quitte le fichier. Globales lues par le module : MediaRecorder (2), document.createElement (2), performance.now (2), setTimeout, setInterval, clearTimeout, clearInterval, Blob, window.tvlens.ingest.
- **Impact :** Ajouter un import à recording.js casse 6 tests pour une raison sans rapport ; le module dépend de `window.tvlens` par une globale, ce qui empêche de le composer ailleurs.

<a id="TSTC-13"></a>
#### TSTC-13 — Contrat des causes de perte vérifié par une regex JavaScript sur le source Python, à moitié

**Verdict : nuancé** · priorité P2 · effort S · risque faible · Tests des interfaces

**Suite :** [T022](travail/tickets/022-declare-the-tv-drop-causes-once-and-prove-each-one-has-its.md) « Declare the TV drop causes once and prove each one has its words ».

- **Où :** tests/tv-panel.test.cjs:540-543 ; tv/capture.py:159, 182, 202, 216, 221, 230 ; tv/transport.py:31, 59-93 ; tv/app/sessions-view.js:225-243
- **Preuve :** `/drop\((?:self\.)?report, ?'(\w+)'/g` appliqué à capture.py et transport.py trouve 7 causes (deliveryError, queueOverflow, leftAtStop, storageFull, readOnly, sessionChanged, stopped) pour 11 appels `drop(`. Les causes passées par variable ou par conditionnelle lui échappent : foreignApp (capture.py:182), lunaFailed (l.202), overlayVisible, geometryChanged, noFrames, audioFailed, tooLong (l.216). DROP_LABELS a 17 clés côté JS. Le garde « every cause the capture counts has its words » (l.537) couvre donc 7 causes sur au moins 14 émises. Un formateur Python passant aux guillemets doubles ferait tomber `counted.size` sous le plancher de 6 (l.542) : échec visible, grâce à ce plancher.
- **Impact :** Une nouvelle cause Python sans libellé s'afficherait sur la TV comme identifiant brut sans qu'un test le voie ; ce test interdit de fait de formater tv/*.py.
- **Nuance du relecteur (elle prime) :** La regex trouve bien 7 causes. Compteurs exacts : 10 appels à drop( (4 dans tv/capture.py, 6 dans tv/transport.py) plus la définition transport.py:31, et non 11 appels. Les causes réellement émises sont 17 : les 7 vues, plus foreignApp, captureFailed (capture.py:187, non cité), lunaFailed, overlayVisible, geometryChanged, noFrames, audioFailed, tooLong, deliveryExpired (transport.py:52) et deliveryRejected (transport.py:87). Ce sont exactement les 17 clés de DROP_LABELS : aucun libellé ne manque aujourd'hui, le défaut est seulement que le garde n'en voit que 7.

<a id="TSTC-15"></a>
#### TSTC-15 — 45 gardes statiques légitimes à conserver, à rendre insensibles aux guillemets et à regrouper

**Verdict : nuancé** · priorité P2 · effort S · risque faible · Tests des interfaces

**Suite :** [T024](travail/tickets/024-make-the-remaining-static-guards-tolerant-of-quotes-and-line.md) « Make the remaining static guards tolerant of quotes and line breaks ».

- **Où :** tests/tv-app-compat.test.cjs:48-110 ; tests/mac-ui.test.cjs:330-334, 454, 657, 673-677, 682, 694-704, 707-709, 713-715, 718-724 ; tests/mac-ipc-contract.test.cjs:97, 103-105 ; tests/tv-ambient-params.test.cjs:104-110 ; tests/tv-panel.test.cjs:80-85
- **Preuve :** Ce qu'ils garantissent : plancher moteur de la TV (chaque script compile en script classique par vm.Script, 15 API récentes et CSS imbriqué refusés, avec auto-test du garde l.58-67) ; page ambiante sans secret, sans élément focalisable, trois requêtes ; paquet de production sans fichier de sonde ; ids uniques ; CSP `img-src … tvlens-media:` ; bandeau #watch-notice sans bouton et placé avant main ; absences (mode Auto, réglage showSignals, lecture de signals.cards, plafonds « 60 s », « 5 min », 300000 écrits en dur, pluriels « (s) », core/auto-monitor.cjs supprimé, adresse média construite hors replayTarget, recap-view.js sans mediaNote) ; scripts de smoke n'appelant que des méthodes exposées. Aucun ne casse dans le journal FMT. Fragilités : tv-app-compat.test.cjs:92 attend `route("…")` en guillemets doubles, alors que app/ est en apostrophes : aucun réglage unique de Prettier ne laisse tous les tests verts ; l.82-83 attendent `html, body {` sur une ligne (casserait si le CSS était formaté, non rejoué) ; `\b300000\b` ne voit pas `300_000` ; les mots interdits sont cherchés aussi dans les commentaires ; un garde d'absence devient aveugle si le code visé déménage dans un fichier qu'il ne lit pas.
- **Impact :** Ces gardes sont la seule protection du plancher moteur TV et de plusieurs décisions produit ; les perdre ou les affaiblir pendant le passage au formateur serait une régression silencieuse.
- **Nuance du relecteur (elle prime) :** Gardes et fragilités vérifiés : l.92 attend des guillemets doubles, l.82-83 une règle CSS sur une ligne, 15 API récentes refusées, aucun de ces tests dans les 5 échecs du journal FMT. Le compteur « 45 » ne se retrouve pas : 65 assertions aux lignes citées (37 dans tv-app-compat.test.cjs:48-110 dont 8 pour l'auto-test du garde, 20 dans mac-ui, 3 dans mac-ipc-contract, 4 dans tv-ambient-params, 1 dans tv-panel). « Aucun réglage unique » est vrai pour un réglage global ; les overrides par dossier de Prettier (apostrophes pour app/, guillemets pour tv/app) le contournent, mais rendre les motifs indifférents reste la bonne forme.

<a id="TSTB-19"></a>
#### TSTB-19 — Tests de comportement qui lisent le texte source

**Verdict : nuancé** · priorité P3 · effort S · risque faible · Tests de comportement

**Suite :** [T025](travail/tickets/025-state-the-layer-rules-as-one-table-in-the-architecture-test.md) « State the layer rules as one table in the architecture test ».

- **Où :** tests/surveillance.test.cjs:624 ; tests/server-sessions.test.cjs:635-637 ; tests/chat-trace.test.cjs:55 ; tests/question-ceiling.test.cjs:207-209 ; tests/deploy-unit.test.cjs:11
- **Preuve :** Cinq fichiers lisent un fichier et le passent à une regex : `doesNotMatch(core/surveillance.cjs, /\basking\b|manualBusy|prioritizeManual|deep-ask/)` ; `doesNotMatch(server/main.cjs, /cleanupRawMedia|clearRaw|purge/)` puis `match(/sweepStaleContexts/)` ; `!includes('adapters/')` sur core/deep-ask.cjs ; `doesNotMatch(mcp/server.cjs, /60000|60 secondes/)`. Ils survivent au formatage (les 5 échecs mesurés sont ailleurs), mais figent des identifiants : renommer `sweepStaleContexts` ou écrire « purge » dans un commentaire fait échouer un test de comportement. deploy-unit lit l'unité systemd : c'est légitime, le fichier est la chose testée.
- **Impact :** Faux positifs au renommage ; fausse sécurité, car l'absence d'un mot ne prouve pas l'absence du comportement.
- **Nuance du relecteur (elle prime) :** Les cinq lectures de source sont exactes (surveillance:624, server-sessions:635-637, chat-trace:55, question-ceiling:208-209, deploy-unit:11). La remédiation de server-sessions:635-637 n'est pas faisable telle quelle : « démarrer un hôte » ne passe pas par le code que la regex garde. `main()` (server/main.cjs:22-45) lit `process.env`, prend par défaut ~/Documents/TVLens-private/server, balaie les vrais contextes Codex, écoute un port, pose des gestionnaires de signaux et appelle `process.exit` ; il faut d'abord un démarrage injectable (environnement, port 0, sans sortie de processus), ce qui relève d'ADP-09 et manque aux prérequis. Pour surveillance:624, la partie comportementale existe déjà ligne 623 (`assert.equal(h.chatReads, 0)`) : la regex peut être retirée sans remplacement, hors la règle d'import. question-ceiling:208 porte aussi une assertion positive sur le source (`AbortSignal.timeout(QUESTION_TIMEOUT_MS)`), à remplacer par le comportement au plafond.

<a id="TSTC-19"></a>
#### TSTC-19 — Tests Python denses, avec trois gardes sur le texte sensibles aux commentaires

**Verdict : confirmé** · priorité P3 · effort S · risque faible · Tests des interfaces

**Suite : pas de ticket.** Priorité P3 ; le rédacteur le rattache au constat PY-04 du lot L15, hors du périmètre de L02. — _Reprise :_ avec le lot L15 (PY-04)

- **Où :** tests/test_tv_ambient.py:215-216, 785-786, 845-846 ; tests/test_tv_capture_gate.py:47-345 ; tests/test_tv_control.py:18-138
- **Preuve :** Indentation d'une espace, instructions chaînées par point-virgule (226 lignes sur 1 082 dans test_tv_ambient.py), lignes jusqu'à 301 caractères. Trois gardes lisent le source Python : l.216 `assertNotIn('setDisplayWindow', …read_text().replace('setDisplayWindow interdit',''))` ; l.786 `assertNotIn('luna', source.lower().replace('luna itself','').replace('calls luna','').replace('call luna',''))` sur controller.py ; l.846 absence de `tvlens-panel.lock` et `tvlens-capture.lock` dans ambient.py. Deux d'entre eux retirent à la main des phrases de commentaire avant de chercher : un commentaire de plus contenant « Luna » dans controller.py fait échouer le test. l.216 double l.215, qui vérifie déjà l'ensemble exact des appels Luna enregistrés.
- **Impact :** Relire ou modifier un cas demande de dérouler des lignes de 300 caractères ; les gardes d'architecture échouent sur de la prose et non sur du code.
- **Remède proposé par l'audit :** `ruff format` sur tests/test_tv_*.py et tests/tv_fakes (configuration unique dans pyproject.toml). Gardes d'architecture par l'arbre syntaxique : `ast.parse` puis parcours des noeuds Import, Call et Attribute (« controller.py n'importe pas luna et n'instancie pas GateWriter »), insensible aux commentaires. Supprimer l.216.
- **Risque du remède selon le relecteur :** ruff format réécrit entièrement trois fichiers (indentation, points-virgules) : dans un diff illisible, une assertion perdue passerait inaperçue ; comparer le nombre de tests (84) et d'appels assert avant et après, puis lancer la suite Python.

<a id="OUBLI-15"></a>
#### OUBLI-15 — Des assertions sur le texte source de l'hôte Mac épinglent ses minuteries

**Verdict : confirmé** · Signalement du relecteur — Déterminisme des tests

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T019](travail/tickets/019-declare-the-ipc-channels-of-the-mac-host-once-and-check-them.md) « Declare the IPC channels of the Mac host once and check them at runtime ».

- **Signalement :** tests/mac-ipc-contract.test.cjs:94-117 : des assertions sur le texte source de app/main.cjs épinglent ses minuteries (la ligne 111 découpe le source jusqu'à 'surveillanceTimer = setInterval'). Toute injection d'horloge ou de minuterie dans l'hôte Mac (FLK-04 en version production, extension de FLK-07) les casse ; l'audit ne le compte pas dans ses prérequis.

<a id="OUBLI-24"></a>
#### OUBLI-24 — app/index.html n'est pas audité alors qu'il est aussi dense que renderer.js

**Verdict : confirmé** · Signalement du relecteur — Interfaces (Mac, TV, scripts Python)

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T015](travail/tickets/015-make-the-mac-window-source-text-assertions-independent-of.md) « Make the Mac window source-text assertions independent of code layout ».

- **Signalement :** app/index.html n'est pas audité alors qu'il est aussi dense que renderer.js : 145 lignes, 38 de plus de 160 caractères, une de 1 831. tests/mac-ui.test.cjs:331-334 y épingle par regex le balisage de la bannière, ordre des attributs compris : formater ou découper la page peut casser ce test comme ceux de UI-01.

### L03 — Formatage, lint, règles de couches et intégration continue

Vague 1 · 15 constats · 11 tickets

- [T026](travail/tickets/026-install-prettier-with-default-settings-and-a-staged-ignore.md) — Install Prettier with default settings and a staged ignore list _(demande un ADR ; installe une dépendance)_
- [T027](travail/tickets/027-prove-the-full-suite-passes-on-a-prettier-formatted-copy-of.md) — Prove the full suite passes on a Prettier-formatted copy of the tree
- [T028](travail/tickets/028-format-every-javascript-file-of-the-product-with-prettier.md) — Format every JavaScript file of the product with Prettier
- [T029](travail/tickets/029-ignore-the-formatting-commit-in-blame-and-pin-line-endings.md) — Ignore the formatting commit in blame and pin line endings
- [T030](travail/tickets/030-guard-the-boundaries-the-layer-table-leaves-open-in-the.md) — Guard the boundaries the layer table leaves open in the architecture test
- [T031](travail/tickets/031-lint-with-eslint-in-the-quality-check-and-freeze-the.md) — Lint with ESLint in the quality check and freeze the existing violations _(demande un ADR ; installe une dépendance ; touche au harnais)_
- [T032](travail/tickets/032-refuse-any-growth-of-the-frozen-lint-violations-in-the.md) — Refuse any growth of the frozen lint violations in the quality check _(touche au harnais)_
- [T033](travail/tickets/033-remove-the-unused-variables-that-eslint-reports.md) — Remove the unused variables that ESLint reports
- [T034](travail/tickets/034-add-a-type-check-step-and-a-typed-files-measure-to-the.md) — Add a type-check step and a typed-files measure to the quality check _(demande un ADR ; installe une dépendance ; touche au harnais)_
- [T035](travail/tickets/035-type-check-ten-more-core-files-through-jsdoc-annotations.md) — Type-check ten more core files through JSDoc annotations
- [T138](travail/tickets/138-run-the-quality-check-on-github-actions-in-informative-mode.md) — Run the quality check on GitHub Actions in informative mode _(attend une décision du propriétaire)_

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [ADP-15](#ADP-15) | Aucun outillage, style hétérogène | nuancé | P0 | [T026](travail/tickets/026-install-prettier-with-default-settings-and-a-staged-ignore.md), [T028](travail/tickets/028-format-every-javascript-file-of-the-product-with-prettier.md), [T031](travail/tickets/031-lint-with-eslint-in-the-quality-check-and-freeze-the.md), [T034](travail/tickets/034-add-a-type-check-step-and-a-typed-files-measure-to-the.md), [T138](travail/tickets/138-run-the-quality-check-on-github-actions-in-informative-mode.md) |
| [OPS-02](#OPS-02) | Formatage : un commit Prettier à préparer, 5 tests couplés au texte à découpler d'abord | nuancé | P0 | [T026](travail/tickets/026-install-prettier-with-default-settings-and-a-staged-ignore.md), [T027](travail/tickets/027-prove-the-full-suite-passes-on-a-prettier-formatted-copy-of.md), [T028](travail/tickets/028-format-every-javascript-file-of-the-product-with-prettier.md), [T029](travail/tickets/029-ignore-the-formatting-commit-in-blame-and-pin-line-endings.md) |
| [OPS-03](#OPS-03) | ESLint : jeu de règles initial et gel des 580 infractions existantes | nuancé | P1 | [T031](travail/tickets/031-lint-with-eslint-in-the-quality-check-and-freeze-the.md), [T032](travail/tickets/032-refuse-any-growth-of-the-frozen-lint-violations-in-the.md), [T033](travail/tickets/033-remove-the-unused-variables-that-eslint-reports.md) |
| [OPS-04](#OPS-04) | Règles de couches : 0 infraction aujourd'hui, mais aucune garde hors de core/ | nuancé | P1 | [T030](travail/tickets/030-guard-the-boundaries-the-layer-table-leaves-open-in-the.md) |
| [OPS-05](#OPS-05) | Aucune intégration continue | nuancé | P1 | [T138](travail/tickets/138-run-the-quality-check-on-github-actions-in-informative-mode.md) |
| [FLK-17](#FLK-17) | CI : réglages, politique face à un test instable, et conditions avant de la rendre bloquante | nuancé | P2 | [T138](travail/tickets/138-run-the-quality-check-on-github-actions-in-informative-mode.md) |
| [DOC-19](#DOC-19) | Fichiers racine manquants : licence, journal des changements, version de Node, exception .gitignore | confirmé | P2 | pas de ticket |
| [OPS-07](#OPS-07) | Scripts npm : préfixe test: trompeur, trois conventions, entrées manquantes | nuancé | P2 | [T026](travail/tickets/026-install-prettier-with-default-settings-and-a-staged-ignore.md), [T031](travail/tickets/031-lint-with-eslint-in-the-quality-check-and-freeze-the.md), [T034](travail/tickets/034-add-a-type-check-step-and-a-typed-files-measure-to-the.md) |
| [OPS-14](#OPS-14) | Typage : aucun contrôle statique, alors que les ports sont déjà décrits en JSDoc | nuancé | P2 | [T034](travail/tickets/034-add-a-type-check-step-and-a-typed-files-measure-to-the.md), [T035](travail/tickets/035-type-check-ten-more-core-files-through-jsdoc-annotations.md) |
| [OPS-19](#OPS-19) | Hygiène du dépôt : ni crochet, ni mise à jour des dépendances, ni audit, ni scan de secrets | nuancé | P2 | [T029](travail/tickets/029-ignore-the-formatting-commit-in-blame-and-pin-line-endings.md), [T138](travail/tickets/138-run-the-quality-check-on-github-actions-in-informative-mode.md) |
| [OUBLI-06](#OUBLI-06) | Garde d'architecture incompatible avec le découpage proposé en section 3 | confirmé | — | [T030](travail/tickets/030-guard-the-boundaries-the-layer-table-leaves-open-in-the.md) |
| [OUBLI-19](#OUBLI-19) | La garde d'architecture n'est pas récursive et lit chaque entrée comme un fichier de code | confirmé | — | [T030](travail/tickets/030-guard-the-boundaries-the-layer-table-leaves-open-in-the.md) |
| [OUBLI-27](#OUBLI-27) | film/ et promo/ : deux sous-projets Remotion suivis par Git, jamais inventoriés | confirmé | — | [T026](travail/tickets/026-install-prettier-with-default-settings-and-a-staged-ignore.md), [T031](travail/tickets/031-lint-with-eslint-in-the-quality-check-and-freeze-the.md) |
| [OUBLI-32](#OUBLI-32) | Titres de test trop longs pour la règle des 160 caractères | nuancé | — | pas de ticket |
| [OUBLI-43](#OUBLI-43) | Mesure de formatage incomplète pour les sept modules de vue du Mac | confirmé | — | [T027](travail/tickets/027-prove-the-full-suite-passes-on-a-prettier-formatted-copy-of.md) |

<a id="ADP-15"></a>
#### ADP-15 — Aucun outillage, style hétérogène

**Verdict : nuancé** · priorité P0 · effort M · Adaptateurs et frontières

**Suite :** [T026](travail/tickets/026-install-prettier-with-default-settings-and-a-staged-ignore.md) « Install Prettier with default settings and a staged ignore list » ; [T028](travail/tickets/028-format-every-javascript-file-of-the-product-with-prettier.md) « Format every JavaScript file of the product with Prettier » ; [T031](travail/tickets/031-lint-with-eslint-in-the-quality-check-and-freeze-the.md) « Lint with ESLint in the quality check and freeze the existing violations » ; [T034](travail/tickets/034-add-a-type-check-step-and-a-typed-files-measure-to-the.md) « Add a type-check step and a typed-files measure to the quality check » ; [T138](travail/tickets/138-run-the-quality-check-on-github-actions-in-informative-mode.md) « Run the quality check on GitHub Actions in informative mode ».

**Part laissée de côté :** Partie restante. Les promesses flottantes demandent un lint typé, donc les lots de typage. La journalisation structurée relève de L17 (jalon:journal). — _Reprise :_ Après les lots de typage et avec L17

Constat d'origine :

- Preuve : style dense sans espaces (`codex-rpc`, `video-bridge`, `remote-media`, `main.cjs`) contre style Prettier (`http.cjs`) ; six sites de journalisation ad hoc.
- Remédiation : un commit de formatage isolé, ESLint (`no-empty`, promesses flottantes), `// @ts-check`, CI `node --test`.
- Effort M. À faire avant ADP-06 et ADP-08.

- **Nuance du relecteur (elle prime) :** Exact sur la copie 8627b46. Trois faits à intégrer. (1) Le commit suivant de la branche (0262480, lu en lecture seule par git show) ajoute un contrôle unique scripts/check.mjs, un cliquet scripts/quality/baseline.json (lignes de plus de 160 caractères, catch vides, process.env hors config, innerHTML, nombre de cas de test) et docs/standards.md, qui renvoie ESLint à « le ticket qui installe l'outil » : la remédiation doit brancher Prettier et ESLint dans ce contrôle, pas créer une chaîne parallèle, et toujours pas de CI ni de typage. (2) Le formatage n'est pas isolable tel quel : il fait échouer 5 tests à regex sur le source (mesuré), à traiter dans le même lot. (3) La règle des promesses flottantes demande un lint typé (typescript-eslint avec un tsconfig allowJs), pas ESLint seul ; tv/app/ (scripts classiques) exige une configuration à part. Compteur : 9 appels de journalisation dans 6 fichiers.

<a id="OPS-02"></a>
#### OPS-02 — Formatage : un commit Prettier à préparer, 5 tests couplés au texte à découpler d'abord

**Verdict : nuancé** · priorité P0 · effort M · risque faible · Scripts et outillage

**Suite :** [T026](travail/tickets/026-install-prettier-with-default-settings-and-a-staged-ignore.md) « Install Prettier with default settings and a staged ignore list » ; [T027](travail/tickets/027-prove-the-full-suite-passes-on-a-prettier-formatted-copy-of.md) « Prove the full suite passes on a Prettier-formatted copy of the tree » ; [T028](travail/tickets/028-format-every-javascript-file-of-the-product-with-prettier.md) « Format every JavaScript file of the product with Prettier » ; [T029](travail/tickets/029-ignore-the-formatting-commit-in-blame-and-pin-line-endings.md) « Ignore the formatting commit in blame and pin line endings ».

**Part laissée de côté :** scripts/check.mjs, scripts/quality/, scripts/loop/ et .claude/ ne sont ni formatés ni analysés, pour ne pas mêler une réécriture du harnais aux lots de code. — _Reprise :_ Ticket harnais dédié du propriétaire

- **Où :** tests/mac-ipc-contract.test.cjs:94 ; tests/mac-ui.test.cjs:138 ; tests/mac-ui.test.cjs:335 ; tests/mac-ui.test.cjs:645 ; tests/mac-ui.test.cjs:688-690
- **Preuve :** Aucun .prettierrc ni .editorconfig. 6 107 lignes JS sur 41 968 (14,5 %) dépassent 120 colonnes ; la plus longue fait 2 923 caractères (adapters/). Style dominant mesuré : 21 041 chaînes en apostrophes contre 4 705 en guillemets (36 fichiers sur 208 majoritairement en guillemets : runtime 5 sur 5, tv/app 7 sur 8, mcp 2 sur 2) ; flèches sans parenthèses 2 607 contre 334. L'essai fourni, en réglages par défaut, modifie 188 fichiers JS sur 208 et aucun autre type de fichier. Les 5 tests cassés lisent la mise en page : apostrophes de `handle('…'` (ipc:94), fonction clearSearch sur une ligne (ui:645), accolade collée (ui:335), appel `el('p', …)` sur une ligne (ui:138), `bridge.nom` sans saut de ligne (ui:688).
- **Impact :** Tant que ces 5 assertions dépendent de la mise en page, aucun formateur ne peut être activé. Les lignes de 300 à 2 900 caractères rendent les diffs illisibles : une modification remplace une ligne entière.
- **Nuance du relecteur (elle prime) :** Fond exact : aucun formateur, et les cinq lignes citées sont justes (ipc:94, ui:138, 335, 645, 688). Quatre faits à corriger.

  (1) Ce sont 5 tests, pas 5 assertions : chaque test s'arrête à sa première assertion fausse. Derrière, d'autres lisent des apostrophes ou une mise en page exacte : tests/mac-ui.test.cjs:336, 337, 710, 716 et tests/mac-ipc-contract.test.cjs:107, 109, 116, 117.

  (2) L'essai n'a pas couvert 9 fichiers : les 7 modules app/ui/*.mjs et les 2 fichiers de prototypes/lg-sidebar sont identiques octet pour octet dans ROOT et FMT, alors que Prettier 3.8.1 par défaut les signale. Le compte de tests cassés est donc un minimum (mac-ui.test.cjs:661 lit ces modules comme du texte).

  (3) L'essai est en réglages par défaut ; la configuration proposée casse au moins un test qu'il ne peut pas voir : tests/codex-confinement.test.cjs:481 attend `|| "enforce` en guillemets dans adapters/codex-session-client.cjs:107, que singleQuote réécrit. La preuve « verte sur ROOT et sur FMT » doit être rejouée avec la configuration retenue, sur tous les fichiers.

  (4) 13 fichiers sont déjà conformes aux réglages par défaut (core/ports.cjs, core/moment-search.cjs, 3 de runtime/, 2 de mcp/, 5 de adapters/, tv/app/remote-client.js) : c'est le code le plus récent. La configuration proposée les reformate (vérifié par --check sur 7 d'entre eux). « Style dominant » ou réglages par défaut : choix à faire trancher, les fichiers denses étant réécrits en entier dans les deux cas.

  Hors ROOT (HEAD 208d2e3 de la branche de travail) : scripts/check.mjs lance `prettier --check --ignore-unknown .` dès que le binaire existe. Installation, configuration, .prettierignore et commit de formatage forment donc un seul ticket (« installe: oui »). Le .prettierignore doit aussi couvrir film/, promo/ (qui a son propre .prettierrc), .claude/ et les JSON que l'essai n'a pas traités. Les planchers lignes_longues_prod (545) et lignes_longues_tests (1 725) du cliquet se resserrent dans le même commit ; docs/standards.md fixe 160 caractères, à accorder avec la largeur choisie.

<a id="OPS-03"></a>
#### OPS-03 — ESLint : jeu de règles initial et gel des 580 infractions existantes

**Verdict : nuancé** · priorité P1 · effort M · risque faible · Scripts et outillage

**Suite :** [T031](travail/tickets/031-lint-with-eslint-in-the-quality-check-and-freeze-the.md) « Lint with ESLint in the quality check and freeze the existing violations » ; [T032](travail/tickets/032-refuse-any-growth-of-the-frozen-lint-violations-in-the.md) « Refuse any growth of the frozen lint violations in the quality check » ; [T033](travail/tickets/033-remove-the-unused-variables-that-eslint-reports.md) « Remove the unused variables that ESLint reports ».

**Part laissée de côté :** Il y a 13 occurrences de timers dans 8 fichiers de core. Les interdire demande d'abord de déplacer ces timers, ce qui est le travail des lots du cœur. — _Reprise :_ Lots de refonte du cœur

- **Où :** core/surveillance.cjs (37 messages) ; scripts/probe-confinement.cjs (23) ; scripts/simulate-stream.cjs (23) ; tv/app/surveillance-view.js (23) ; runtime/headless-runtime.cjs (21) ; app/renderer.js (19)
- **Preuve :** eslint-audit.json : 1 296 messages. Répartition production / scripts / tests : complexity au-dessus de 15 : 105 / 19 / 0 (10 fonctions de production au-dessus de 50) ; max-lines-per-function au-dessus de 80 : 54 / 30 / 165 ; max-lines au-dessus de 400 : 20 / 10 / 32 ; no-nested-ternary 132 / 10 / 2 ; no-unused-vars 41 / 16 / 27 (30 des 41 sont des affectations jamais lues) ; no-empty 39 / 7 / 5 ; no-shadow 13 / 18 / 51 ; no-param-reassign 17 / 3 / 0 ; require-await 18 / 48 / 402 ; max-depth 5 / 1 / 0 ; max-params 3 / 0 / 3. Totaux : 447 (62 fichiers sur 99), 162 (25 sur 38), 687 (56 sur 71). Hors audit, estimé par grep : égalités lâches environ 18 en production ; console.* 6 en production dont 1 hors point d'entrée ; `var` 267 dans tv/app (voulu) et 0 ailleurs.
- **Impact :** Sans plafond, chaque chantier ajoute des fonctions de complexité 50 et des catch vides sans signal. Un `--max-warnings` global laisserait une règle empirer pendant qu'une autre s'améliore.
- **Nuance du relecteur (elle prime) :** Compteurs d'eslint-audit.json exacts : 1 296 messages ; 447, 162 et 687 par zone ; 62, 25 et 56 fichiers ; 10 fonctions de production au-dessus de 50, maximum 163 ; 30 affectations sur 41. Estimations par grep confirmées : 18 égalités lâches, 6 console.* dont 1 dans runtime/, 267 `var` dans tv/app et 0 ailleurs. À corriger :

  (1) Le stock « 580 » compte les 96 infractions que la remédiation dit corriger d'abord (no-unused-vars 84, max-depth 6, max-params 6) et oublie eqeqeq (environ 18). Après le ticket de nettoyage, il vaut environ 484 plus eqeqeq.

  (2) Les compteurs liés aux lignes (max-lines 20/10/32, max-lines-per-function 54/30/165) viennent d'un formatage par défaut à 80 colonnes, avec 7 fichiers app/ui/*.mjs non formatés. À 100 colonnes ils changent : geler après OPS-02, pas avec ces chiffres.

  (3) no-undef et le reste de la configuration recommandée ne sont pas mesurés (l'audit le dit) : « 0 infraction attendue » reste supposé.

  (4) Hors ROOT (HEAD 208d2e3) : un cliquet existe déjà (scripts/quality/baseline.json, dont catch_vides_prod à 40) et scripts/check.mjs lance `eslint` dès qu'un eslint.config.* existe ; docs/standards.md annonce que complexity, max-lines et no-nested-ternary rejoindront ce contrôle. La forme cible doit donc préciser comment eslint-suppressions.json cohabite avec baseline.json, qui élague (la boucle, comme elle resserre le plancher), si le fichier est protégé, et exclure film/ et promo/ (promo a son eslint.config.mjs).

<a id="OPS-04"></a>
#### OPS-04 — Règles de couches : 0 infraction aujourd'hui, mais aucune garde hors de core/

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Scripts et outillage

**Suite :** [T030](travail/tickets/030-guard-the-boundaries-the-layer-table-leaves-open-in-the.md) « Guard the boundaries the layer table leaves open in the architecture test ».

- **Où :** tests/architecture.test.cjs:5-30 ; CONTRIBUTING.md:7-11
- **Preuve :** Matrice d'imports mesurée sur les 99 fichiers de production : core n'importe rien, pas même node: ; adapters vers core (8 liens) ; runtime vers core (11) et adapters (19) ; server vers adapters (9) et runtime (1) ; mcp vers core (2) ; app vers adapters (15), core (5), runtime (4) et app/ui (13) ; app/ui et tv/app n'importent rien d'extérieur ; aucun import de scripts/ ni de tests/ depuis la production. tests/architecture.test.cjs ne garde par regex que 3 de ces frontières : core (imports en ./ et 8 globales interdites), absence d'electron dans runtime/ et server/, et 6 fichiers Codex nommés.
- **Impact :** Les frontières adapters vers runtime, runtime vers server, mcp vers adapters, app/ui autonome et production vers scripts ne tiennent que par discipline : le premier import à contresens passera les 602 tests.
- **Nuance du relecteur (elle prime) :** Matrice exacte (8, 11, 19, 9, 1, 2, 15, 5, 4, 13 liens sur 99 fichiers) et test décrit fidèlement (3 tests, 8 globales, 6 fichiers Codex, assertion positive ligne 28). Trois points rendent la remédiation inopérante telle qu'écrite.

  (1) no-restricted-imports ne voit que les déclarations import. Or core, adapters, runtime, server, mcp et app/*.cjs sont en CommonJS : il faut n/no-restricted-require (ou no-restricted-syntax sur require) pour ces dossiers, et no-restricted-imports seulement pour app/ui et les .mjs.

  (2) n/no-unpublished-require ignore par défaut un paquet « private: true » (option ignorePrivate ; de mémoire, à confirmer à l'installation) : il ne signalerait rien. Une fois activé, il signale require('electron') dans app/main.cjs et app/preload.cjs, electron étant en devDependencies : prévoir allowModules pour app/.

  (3) Retirer deux des trois tests d'architecture fait baisser le nombre de tests. Hors ROOT (HEAD 208d2e3), le cliquet l'interdit (cas_de_test) et docs/standards.md cite ce test comme vérification des frontières : ticket à marquer « supprime_tests », standards à mettre à jour.

<a id="OPS-05"></a>
#### OPS-05 — Aucune intégration continue

**Verdict : nuancé** · priorité P1 · effort M · risque faible · Scripts et outillage

**Suite :** [T138](travail/tickets/138-run-the-quality-check-on-github-actions-in-informative-mode.md) « Run the quality check on GitHub Actions in informative mode ».

**Part laissée de côté :** Le coût en minutes et la visibilité du dépôt sont inconnus. L03-10 ne pose que le runner Ubuntu, et la décision est demandée dans son en-tête. — _Reprise :_ Après la décision du propriétaire sur L03-10

- **Où :** package.json:11 ; tests/architecture-f06.test.cjs:530 ; docs/lg-ambient.md:144-147 ; aucun dossier .github
- **Preuve :** Ni fichier de CI ni crochet Git. Seule existe `node --test tests/*.test.cjs` : 602 tests, 14,9 à 19,5 s sur trois journaux locaux, 0 test sauté. Hors de tout automatisme : 6 fichiers de tests Python (tests/test_tv_*.py, 1 565 lignes ; prototypes/lg-remote/test_*.py, 560 lignes), 6 parcours hors ligne (701 assertions, OPS-09) et les deux empaquetages. L'échec intermittent connu (429 reçu au lieu de 200) n'a pas de cause corrigée.
- **Impact :** La boucle de chantiers fusionne sur la foi d'un lancement local. Ni Linux, plateforme du serveur, ni une autre version de Node ne sont exercés avant un déploiement.
- **Nuance du relecteur (elle prime) :** Preuve exacte sur ROOT : aucun dossier .github, 6 fichiers de tests Python (1 565 et 560 lignes), 701 assertions de parcours hors de tout automatisme. Portée et prérequis à corriger.

  (1) Hors ROOT (HEAD 208d2e3) : un contrôle unique existe, scripts/check.mjs, dont l'en-tête dit que hooks, boucle et CI l'appellent ; il lance les tests en séquentiel et les tests Python de tests/. La CI doit l'appeler au lieu de recomposer format:check, lint et un `npm test` en parallèle.

  (2) L'échec intermittent a déjà son ticket (docs/travail/tickets/001-resent-block-duplicate-without-race.md) : cause établie et reproduite, c'est l'attente du test qui est fausse, pas le serveur.

  (3) « Bloquant » dès le départ sur ubuntu et Python 3.10 n'est étayé par aucune mesure : deploy/runtime.env.example:14 dit que rien n'a été mesuré sous Linux, docs/lg-ambient.md:161 et 170 que les tests Python n'ont tourné que sous 3.14. Démarrer en informatif.

  (4) prototypes/lg-remote/test_ambient_relay.py:325 compare à un ancien commit par `git show` et se saute sans lui : avec un clone superficiel la comparaison disparaît sans bruit ; il faut l'historique complet.

  (5) Coût des runners macOS non vérifié : la visibilité du dépôt GitHub n'est pas connue.

<a id="FLK-17"></a>
#### FLK-17 — CI : réglages, politique face à un test instable, et conditions avant de la rendre bloquante

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Déterminisme des tests

**Suite :** [T138](travail/tickets/138-run-the-quality-check-on-github-actions-in-informative-mode.md) « Run the quality check on GitHub Actions in informative mode ».

**Part laissée de côté :** Une quarantaine des tests instables demande une décision du propriétaire. L03-10 ne relance jamais un test et n'en écarte aucun. — _Reprise :_ Après la décision du propriétaire, quand la CI passera en mode bloquant

- **Où :** package.json:11 ; CONTRIBUTING.md:19-20
- **Preuve :** Aucune CI, aucun délai, aucune concurrence fixée, version de Node non épinglée. La suite n'a jamais tourné sur un runner Linux : son comportement y est inconnu (groupes de processus POSIX, scripts à shebang, chemins temporaires). La taille des runners est une hypothèse.
- **Impact :** Activée telle quelle, une CI bloquante échouerait par intermittence sur FLK-01 à FLK-04 et pourrait se bloquer sur FLK-05, ce qui installerait l'habitude de relancer.
- **Nuance du relecteur (elle prime) :** Constat d'absence exact : ni .github, ni engines, ni .nvmrc ; CONTRIBUTING.md:19-20 ne cite que npm test et test:electron. Trois corrections sur la remédiation. 1) --test-timeout=60000 ne borne pas un fichier resté vivant (voir FLK-05) : la voie bloquante se bloquerait jusqu'au délai du job. 2) Déplacer un test dans tests/quarantine/ casse ses chemins relatifs (require('../runtime/…'), path.join(__dirname, 'fixtures', …)) : il faudrait le modifier pour l'écarter. node:test offre l'option { todo: 'raison' } : le test tourne, son échec est rapporté sans faire échouer le lancement. 3) Un en-tête qui porte le ticket contredit la règle actuelle du projet (aucun identifiant de ticket dans un fichier, un test ou un commentaire), et la quarantaine touche à « ne pas affaiblir un test » : décision du propriétaire requise, le lien vivant dans le ticket. Le statut reste « supposé » : rien n'a tourné sur Linux.

<a id="DOC-19"></a>
#### DOC-19 — Fichiers racine manquants : licence, journal des changements, version de Node, exception .gitignore

**Verdict : confirmé** · priorité P2 · effort S · risque faible · Documentation et dépôt

**Suite : pas de ticket.** Licence, CHANGELOG, champ engines et exception .gitignore des fixtures .webm : la licence demande une décision du propriétaire, et le reste ne relève ni du formatage, ni du lint, ni de la CI. — _Reprise :_ Lot de documentation du dépôt, après la décision du propriétaire sur la licence

- **Où :** package.json:1-41 ; .gitignore:15 ; README.md:89,109,111,169-170 ; tests/fixtures/chromium-webm-head.webm
- **Preuve :** Racine suivie : 9 fichiers (.env.example, .gitignore, CONTRIBUTING.md, PRD.MD, README.md, ROADMAP.md, SECURITY.md, package.json, package-lock.json). Pas de LICENSE alors que README.md:109 donne une URL de clone GitHub et que CONTRIBUTING invite à développer ; seul fichier de licence : prototypes/lg-remote/LICENSE.upstream. Pas de CHANGELOG : l'historique des livraisons est réparti entre README.md:89 et :169-170, docs/validation.md et docs/night-features-delivery.md. Pas de champ engines alors que README.md:111 exige Node.js 24+. .gitignore:15 ignore *.webm alors que trois fixtures WebM sont suivies dans tests/fixtures/ : une nouvelle fixture serait ignorée sans message.
- **Impact :** Statut légal des contributions indéterminé. Aucun endroit où un ticket consigne ce qu'il change. Une version de Node inadaptée échoue sans message clair. Une fixture manquante ne se découvre que sur une autre machine.
- **Remède proposé par l'audit :** LICENSE choisie par le propriétaire. CHANGELOG.md en français au format « Keep a Changelog » : rubrique « Non publié » puis entrées datées, sections Ajouté, Modifié, Corrigé, Retiré, chaque ligne citant le ticket et l'ADR ; une section « Déployé » par appareil (TV de test, VPS) remplace les paragraphes d'état de README.md:89 et docs/architecture.md:5. Champ engines avec node >= 24 dans package.json. Ligne d'exception !tests/fixtures/*.webm dans .gitignore.
- **Risque du remède selon le relecteur :** Le champ engines seul ne fait qu'avertir à l'installation (pas d'échec sans engine-strict dans un .npmrc), et une licence choisie sans le propriétaire engage un dépôt public ; l'exception .gitignore se vérifie par git check-ignore sur une fixture .webm neuve, la licence par décision humaine seulement.

<a id="OPS-07"></a>
#### OPS-07 — Scripts npm : préfixe test: trompeur, trois conventions, entrées manquantes

**Verdict : nuancé** · priorité P2 · effort S · risque faible · Scripts et outillage

**Suite :** [T026](travail/tickets/026-install-prettier-with-default-settings-and-a-staged-ignore.md) « Install Prettier with default settings and a staged ignore list » ; [T031](travail/tickets/031-lint-with-eslint-in-the-quality-check-and-freeze-the.md) « Lint with ESLint in the quality check and freeze the existing violations » ; [T034](travail/tickets/034-add-a-type-check-step-and-a-typed-files-measure-to-the.md) « Add a type-check step and a typed-files measure to the quality check ».

**Part laissée de côté :** Le renommage des scripts *:live touche CLAUDE.md, qui est protégé, et les consignes de la boucle ; ce n'est pas un ticket de formatage. — _Reprise :_ Ticket harnais du propriétaire

- **Où :** package.json:7-28 ; CONTRIBUTING.md:25 ; scripts/probe-verify.cjs:6 ; scripts/probe-codex-speed.cjs:4
- **Preuve :** 20 entrées dans l'ordre d'ajout. 12 sont des entrées de test, dont 3 seulement hors ligne (test, test:electron, test:electron:sheets). Les 9 autres appellent des fournisseurs réels sous trois conventions : suffixe :live (4), suffixe -live (3), aucun marqueur (test:verify et test:codex:speed, qui consomment le quota Codex alors que CONTRIBUTING.md:25 n'annonce que `*:live`). 4 entrées exigent l'existence de .env.local (--env-file). Les 4 variantes test:electron:* ne sont que des drapeaux d'un même script. Absents : lint, format, typecheck, tests Python, parcours TV, paquet TV, commande unique de vérification.
- **Impact :** Un nouveau venu qui lance une entrée « test » peut dépenser du quota sans le savoir, et ne trouve aucune commande qui dise « mon changement est bon ».
- **Nuance du relecteur (elle prime) :** Décompte exact : 20 entrées, 12 de test dont 3 hors ligne, 4 en :live, 3 en -live, 2 sans marqueur, 4 avec --env-file, 4 variantes de test:electron. Portée de la remédiation à compléter.

  (1) Hors ROOT (HEAD 208d2e3) : les entrées check (node scripts/check.mjs) et loop existent déjà ; la cible ne peut pas redéfinir check comme une suite de scripts npm.

  (2) CLAUDE.md (HEAD) interdit aux agents les scripts « *:live » par ce motif de nom : le renommage en live:* impose de mettre à jour cette consigne, fichier protégé, dans le même ticket, sinon l'interdiction ne désigne plus rien.

  (3) La documentation cite 32 fois `npm run <entrée>`, dont une quinzaine pour des entrées renommées (test:electron 8 fois, test:verify 2 fois), dans d'autres fichiers que README et CONTRIBUTING.

<a id="OPS-14"></a>
#### OPS-14 — Typage : aucun contrôle statique, alors que les ports sont déjà décrits en JSDoc

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Scripts et outillage

**Suite :** [T034](travail/tickets/034-add-a-type-check-step-and-a-typed-files-measure-to-the.md) « Add a type-check step and a typed-files measure to the quality check » ; [T035](travail/tickets/035-type-check-ten-more-core-files-through-jsdoc-annotations.md) « Type-check ten more core files through JSDoc annotations ».

**Part laissée de côté :** Le lint typé et la règle des promesses flottantes demandent une couverture de types plus large que les 12 fichiers de L03-09 et L03-11. — _Reprise :_ Lots de typage suivants

- **Où :** core/ports.cjs:1-40 ; core/session.cjs ; core/surveillance.cjs ; package-lock.json:756-757
- **Preuve :** Aucun tsconfig, aucun `// @ts-check`. Étiquettes JSDoc de type : 39 dans core/ (core/ports.cjs déclare les ports), 1 dans adapters/, 0 dans runtime/, server/, mcp/ et app/*.cjs, 8 dans app/ui, 10 dans tv/app. L'idiome `Object.assign(this, {…})` dans les constructeurs cache les champs à un vérificateur : 13 occurrences dans core/, 17 dans adapters/, 0 dans runtime/. @types/node 24.19.0 est déjà dans le lockfile, comme dépendance d'electron.
- **Impact :** Les contrats de ports ne sont vérifiés que par les tests qui les traversent ; un port incomplet ou une option renommée (voir l'option `bridge` de OPS-11) ne produit aucune erreur.
- **Nuance du relecteur (elle prime) :** Compteurs exacts : 39, 1, 0, 8 et 10 étiquettes JSDoc ; Object.assign(this) 13 fois dans core, 17 dans adapters, 0 dans runtime ; lot 1 de 12 fichiers et 566 lignes ; mcp 108 lignes ; runtime 2 547 lignes ; @types/node 24.19.0 en package-lock.json:756. Deux imprécisions.

  (1) Effort. Avec `strict`, un fichier sous `// @ts-check` signale chaque paramètre non annoté, et core/ n'a que 39 étiquettes, presque toutes dans ports.cjs. Le socle et le lot 1 font un M ; l'ensemble des lots (13 constructeurs, runtime, adapters, tv/app) est un L, à découper en tickets.

  (2) L'exemple de l'option `bridge` ne serait pas attrapé : scripts/ n'est pas dans include, et CodexSessionAgent reçoit `{ client, ...options }`, qui accepte tout.

  Forme cible plus simple que le test qui lit `// @ts-check` dans le texte : un tsconfig avec checkJs vrai et une liste include qui ne fait que grandir. Hors ROOT : film/ et promo/ ont leur propre tsconfig (TypeScript 5.9.3), à exclure du tsconfig racine.

<a id="OPS-19"></a>
#### OPS-19 — Hygiène du dépôt : ni crochet, ni mise à jour des dépendances, ni audit, ni scan de secrets

**Verdict : nuancé** · priorité P2 · effort S · risque faible · Scripts et outillage

**Suite :** [T029](travail/tickets/029-ignore-the-formatting-commit-in-blame-and-pin-line-endings.md) « Ignore the formatting commit in blame and pin line endings » ; [T138](travail/tickets/138-run-the-quality-check-on-github-actions-in-informative-mode.md) « Run the quality check on GitHub Actions in informative mode ».

**Part laissée de côté :** Des crochets pre-commit locaux doubleraient la boucle, qui intègre déjà après le contrôle, et toucheraient la configuration persistante. — _Reprise :_ Hors lot, sur décision du propriétaire

- **Où :** package.json:29-38 ; package-lock.json ; .gitignore:1-41 ; deploy/tvlens.service:43-45
- **Preuve :** Aucun crochet Git, aucune configuration de mise à jour, aucun `npm audit` ni scanner dans une procédure. État sain constaté : lockfile en version 3, 169 paquets tous résolus sur registry.npmjs.org avec empreinte d'intégrité, lockfile cohérent avec package.json ; une recherche de motifs de secrets (clés OpenRouter, OpenAI, GitHub, Tailscale, AWS, clés privées) dans la copie figée ne trouve rien ; .gitignore couvre jeton d'appairage, auth.json, profils VPN et connection.js. Les 6 dépendances directes sont en plage « ^ ». sharp a déjà provoqué un arrêt brutal du serveur (commentaire de l'unité, :43-45). Ni .editorconfig ni .gitattributes.
- **Impact :** Une vulnérabilité publiée dans l'une des 98 dépendances de production reste invisible ; un secret commité par erreur ne serait vu que par relecture ; les montées de version d'Electron, qui changent le Node embarqué, se font sans rendez-vous.
- **Nuance du relecteur (elle prime) :** État constaté exact sur ROOT : lockfile en version 3, 169 paquets tous résolus sur le registre avec empreinte, 98 dépendances de production hors optionnelles, 6 plages « ^ », aucun motif de secret trouvé, commentaire de l'unité aux lignes 43-45. Portée à corriger.

  (1) Hors ROOT (HEAD 208d2e3) : des crochets d'agent existent (.claude/hooks : garde des commandes, contrôle après édition, barrière de fin) ainsi qu'un contrôle unique, mais toujours aucun crochet Git. Les crochets Git doivent appeler `node scripts/check.mjs --changed`, pas une liste parallèle de commandes. Le pre-push ne doit pas lancer `npm test` en parallèle : l'échec intermittent connu apparaît sous charge, et check lance en séquentiel.

  (2) `prepare` avec `git config core.hooksPath` s'exécute aussi pendant `npm ci --omit=dev`. Dans un export sans .git, proposé par OPS-08 et OPS-15, la commande échoue et bloque l'installation : la rendre tolérante à l'absence de dépôt.

  (3) « Sans dépendance lourde », puis lint-staged : choisir l'un.

  (4) film/ et promo/ ont chacun un package-lock.json (Remotion, React), hors de l'inventaire : audit et mises à jour doivent les couvrir ou les exclure explicitement.

<a id="OUBLI-06"></a>
#### OUBLI-06 — Garde d'architecture incompatible avec le découpage proposé en section 3

**Verdict : confirmé** · Signalement du relecteur — Cœur et composition (`core/`, `runtime/`)

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T030](travail/tickets/030-guard-the-boundaries-the-layer-table-leaves-open-in-the.md) « Guard the boundaries the layer table leaves open in the architecture test ».

**Part laissée de côté :** Partie restante. Interdire setTimeout, Date.now et AbortSignal.timeout dans core (13 occurrences dans 8 fichiers) suppose de retirer d'abord ces appels encore en usage ; c'est le travail des lots du cœur. — _Reprise :_ Avec les lots du cœur (horloge injectée)

- **Signalement :** Garde d'architecture incompatible avec le découpage proposé en section 3 : tests/architecture.test.cjs:7-12 lit core/ à plat (EISDIR sur un sous-dossier) et interdit tout require contenant « .. ». Elle ne contrôle pas non plus setTimeout, Date.now ni AbortSignal.timeout dans core/. Prérequis commun à CORE-07, CORE-13 et au découpage de core/session.cjs, absent du rapport.

<a id="OUBLI-19"></a>
#### OUBLI-19 — La garde d'architecture n'est pas récursive et lit chaque entrée comme un fichier de code

**Verdict : confirmé** · Signalement du relecteur — Documentation et dépôt

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T030](travail/tickets/030-guard-the-boundaries-the-layer-table-leaves-open-in-the.md) « Guard the boundaries the layer table leaves open in the architecture test ».

- **Signalement :** tests/architecture.test.cjs:6-12 et :16-17, seule garde outillée citée par DOC-02, n'est pas récursive et lit chaque entrée du dossier comme un fichier de code : un sous-dossier dans core/, runtime/ ou server/ lève EISDIR, un import « ../ » depuis un sous-dossier de core/ est refusé (ligne 10), et un README y est analysé comme du code. Elle bloque donc les découpages en sous-dossiers prévus par les autres audits et les README de DOC-13 ; à adapter avant eux.

<a id="OUBLI-27"></a>
#### OUBLI-27 — film/ et promo/ : deux sous-projets Remotion suivis par Git, jamais inventoriés

**Verdict : confirmé** · Signalement du relecteur — Scripts et outillage

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T026](travail/tickets/026-install-prettier-with-default-settings-and-a-staged-ignore.md) « Install Prettier with default settings and a staged ignore list » ; [T031](travail/tickets/031-lint-with-eslint-in-the-quality-check-and-freeze-the.md) « Lint with ESLint in the quality check and freeze the existing violations ».

- **Signalement :** film/ et promo/ (hors ROOT : exclus de la copie figée, jamais inventoriés). Deux sous-projets Remotion suivis par Git (26 fichiers .ts ou .tsx, 14 .mjs), chacun avec package.json, package-lock.json et tsconfig.json ; promo/.prettierrc et promo/eslint.config.mjs (ESLint 9.39.5, Prettier 3.8.1, TypeScript 5.9.3) ; film/package.json a une entrée voice:generate qui appelle un fournisseur payant. Sur disque : 557 Mo et 355 Mo avec leurs node_modules. Ils entreraient dans l'asar (OPS-08), seraient parcourus par un `prettier .` ou un `eslint .` lancé à la racine (OPS-02, OPS-03), et ajoutent deux lockfiles à l'hygiène (OPS-19).

<a id="OUBLI-32"></a>
#### OUBLI-32 — Titres de test trop longs pour la règle des 160 caractères

**Verdict : nuancé** · Signalement du relecteur — Tests nommés par chantier

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Les titres de test de plus de 160 caractères (tests/architecture-fNN) relèvent du renommage et de la mise à plat des tests (arbitrage A1) et demandent une table de correspondance des titres. Le formatage n'en ajoute aucun. — _Reprise :_ Lot de restructuration des tests

- **Signalement :** Titres de test trop longs pour la règle des 160 caractères : après Prettier il reste 72 lignes trop longues dans le périmètre, dont 58 titres (tests/architecture-f07.test.cjs 17, architecture-f06 13, architecture-f05 8, architecture-f04 6, codex-confinement 6, architecture-f08 3, architecture-f09 2, review-regressions 2, codex-thread-rotation 1). Le filet « mêmes titres avant et après », sur lequel reposent TSTA-02, 05, 06 et 18, ne peut donc pas tenir pour ces tests : il faut une table de correspondance des titres.

<a id="OUBLI-43"></a>
#### OUBLI-43 — Mesure de formatage incomplète pour les sept modules de vue du Mac

**Verdict : confirmé** · Signalement du relecteur — Tests des interfaces

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T027](travail/tickets/027-prove-the-full-suite-passes-on-a-prettier-formatted-copy-of.md) « Prove the full suite passes on a Prettier-formatted copy of the tree ».

**Part laissée de côté :** Partie restante : une règle ESLint contre les tests qui lisent le texte du source (standards.md, l.41) demanderait une règle sur mesure. Elle reste vérifiée par relecture. — _Reprise :_ Plus tard

- **Signalement :** Mesure de formatage incomplète : la passe Prettier de FMT n'a pas touché les sept app/ui/*.mjs (identiques à ROOT, lignes jusqu'à 287 caractères). Les statuts « casse au formatage » et « survit au formatage » ne sont donc pas établis pour ces modules de vue, et le « 5 imports sur 33 » de TSTC-04 en découle.

### L17 — Journal, formats sur disque et contrat de fil : les angles morts de l'audit

Vague 1 · 44 constats · 10 tickets

- [T036](travail/tickets/036-add-a-journal-port-with-a-stderr-sink-and-a-contract-test.md) — Add a journal port with a stderr sink and a contract test _(demande un ADR)_
- [T037](travail/tickets/037-freeze-a-reference-session-archive-and-prove-the-current.md) — Freeze a reference session archive and prove the current code reads it
- [T038](travail/tickets/038-exercise-the-v1-wire-with-the-real-tv-client-and-write-its.md) — Exercise the /v1 wire with the real TV client and write its compatibility rule _(demande un ADR)_
- [T039](travail/tickets/039-journal-every-refused-http-request-with-its-route-status-and.md) — Journal every refused HTTP request with its route, status and block identity
- [T040](travail/tickets/040-serialize-errors-for-the-journal-with-their-cause-system.md) — Serialize errors for the journal with their cause, system code and a short stack
- [T041](travail/tickets/041-journal-the-start-the-stop-and-the-last-resort-failure-of.md) — Journal the start, the stop and the last-resort failure of the server host
- [T042](travail/tickets/042-pin-the-status-and-code-of-every-block-refusal-the-tv.md) — Pin the status and code of every block refusal the TV capture reads
- [T043](travail/tickets/043-name-the-surveillance-registry-version-and-report-an-unknown.md) — Name the surveillance registry version and report an unknown one when reopened
- [T044](travail/tickets/044-publish-the-server-version-and-capabilities-in-the-session.md) — Publish the server version and capabilities in the session answer
- [T045](travail/tickets/045-replay-the-server-refusals-through-the-tv-transport.md) — Replay the server refusals through the TV transport

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [GAP3-02](#GAP3-02) | Aucun test ne fait parler un client TV au vrai serveur | nuancé | P0 | [T038](travail/tickets/038-exercise-the-v1-wire-with-the-real-tv-client-and-write-its.md), [T042](travail/tickets/042-pin-the-status-and-code-of-every-block-refusal-the-tv.md), [T045](travail/tickets/045-replay-the-server-refusals-through-the-tv-transport.md) |
| [GAP2-01](#GAP2-01) | Aucune archive de référence : la lecture n'est prouvée que par aller-retour avec le même code | nuancé | P0 | [T037](travail/tickets/037-freeze-a-reference-session-archive-and-prove-the-current.md) |
| [GAP2-02](#GAP2-02) | Trois obstacles matériels à une archive figée : .gitignore, formateur, dates tirées du mtime | nuancé | P0 | [T037](travail/tickets/037-freeze-a-reference-session-archive-and-prove-the-current.md) |
| [GAP1-01](#GAP1-01) | Pas de port de journal : quatre formes ad hoc, aucun identifiant commun | nuancé | P0 | [T036](travail/tickets/036-add-a-journal-port-with-a-stderr-sink-and-a-contract-test.md) |
| [GAP3-01](#GAP3-01) | Aucune règle de compatibilité ni ordre de livraison écrits | nuancé | P1 | [T038](travail/tickets/038-exercise-the-v1-wire-with-the-real-tv-client-and-write-its.md) |
| [GAP3-04](#GAP3-04) | Le transport retire le code d'un refus 400 ; 8 codes émis, 2 lus | nuancé | P1 | pas de ticket |
| [GAP3-05](#GAP3-05) | La reprise de la capture Python dépend de la classe du statut, que SEC-01 et CORE-11 déplacent | nuancé | P1 | [T042](travail/tickets/042-pin-the-status-and-code-of-every-block-refusal-the-tv.md), [T045](travail/tickets/045-replay-the-server-refusals-through-the-tv-transport.md) |
| [GAP2-03](#GAP2-03) | Version inconnue ou plus récente : cinq comportements, et quatre fichiers réécrits sans avoir été compris | nuancé | P1 | pas de ticket |
| [GAP2-05](#GAP2-05) | Deux générations devinées par la forme à onze endroits ; durée de vie jamais décidée | nuancé | P1 | pas de ticket |
| [GAP1-02](#GAP1-02) | Bloc de capture refusé : la cause n'est gardée par personne | nuancé | P1 | [T039](travail/tickets/039-journal-every-refused-http-request-with-its-route-status-and.md) |
| [GAP1-03](#GAP1-03) | Perception, surveillance, stockage : aucun point d'émission, la trace est réservée au chat | nuancé | P1 | pas de ticket |
| [GAP1-04](#GAP1-04) | La cause est détruite là où l'erreur est attrapée | nuancé | P1 | [T040](travail/tickets/040-serialize-errors-for-the-journal-with-their-cause-system.md) |
| [GAP1-06](#GAP1-06) | App Mac empaquetée : le « journal » des ADR est un console.error sans destinataire | nuancé | P1 | pas de ticket |
| [GAP3-03](#GAP3-03) | Aucune partie ne publie sa version ni ses capacités | nuancé | P2 | [T044](travail/tickets/044-publish-the-server-version-and-capabilities-in-the-session.md) |
| [GAP3-06](#GAP3-06) | Un pair plus ancien est reconnu par un 404 ambigu, parfois sans retour | nuancé | P2 | pas de ticket |
| [GAP3-07](#GAP3-07) | Le texte français publié sert de donnée à la TV | nuancé | P2 | pas de ticket |
| [GAP3-08](#GAP3-08) | Les champs lus par la TV ne sont déclarés nulle part ; trois formes d'état réconciliées par présence de champ | nuancé | P2 | pas de ticket |
| [GAP3-09](#GAP3-09) | « Ajouts seulement » déjà pratiqué mais non écrit, et contredit par deux remèdes proposés | nuancé | P2 | pas de ticket |
| [GAP2-04](#GAP2-04) | Registre de surveillance : version vérifiée à l'activation, ignorée en silence à la réouverture | nuancé | P2 | [T043](travail/tickets/043-name-the-surveillance-registry-version-and-report-an-unknown.md) |
| [GAP2-06](#GAP2-06) | session.json : 28 clés écrites, 9 relues ; le contrat de lecture n'est écrit nulle part | nuancé | P2 | pas de ticket |
| [GAP2-07](#GAP2-07) | Le dossier de session n'est décrit nulle part en entier : liste FILES inexacte, format retiré encore lu, cache hors liste | nuancé | P2 | pas de ticket |
| [GAP2-08](#GAP2-08) | Hors session : neuf fichiers sans version, quatre politiques de lecture, écritures non atomiques, chemins absolus mis en cache | nuancé | P2 | pas de ticket |
| [GAP2-09](#GAP2-09) | Des données écrites que le produit ne sait plus lister ni supprimer | nuancé | P2 | pas de ticket |
| [GAP1-05](#GAP1-05) | Aucun gestionnaire de dernier recours sur les trois hôtes Node | nuancé | P2 | [T041](travail/tickets/041-journal-the-start-the-stop-and-the-last-resort-failure-of.md) |
| [GAP1-07](#GAP1-07) | TV : sorties des enfants jetées, rapport effacé au démarrage suivant, journal écrasé à chaque lancement | confirmé | P2 | pas de ticket |
| [GAP1-08](#GAP1-08) | Événements de confinement écrits une fois par processus, sans heure ni identifiant | nuancé | P2 | pas de ticket |
| [GAP1-09](#GAP1-09) | Rejets neutralisés : trois familles écrites de la même façon | nuancé | P2 | pas de ticket |
| [GAP1-10](#GAP1-10) | Le journal s'observe en remplaçant des globales, et aucune procédure ne dit où regarder | nuancé | P2 | [T036](travail/tickets/036-add-a-journal-port-with-a-stderr-sink-and-a-contract-test.md) |
| [GAP3-10](#GAP3-10) | Contrat local panneau, contrôleur et scripts : valeurs codées dans les chemins, copies partielles possibles | nuancé | P3 | pas de ticket |
| [GAP2-10](#GAP2-10) | Média d'un passage : JSON en base64 sans version, relu en entier pour deux nombres | confirmé | P3 | [T037](travail/tickets/037-freeze-a-reference-session-archive-and-prove-the-current.md) |
| [OUBLI-46](#OUBLI-46) | Le fil panneau ↔ contrôleur local ↔ rapport de capture n'a pas non plus de test conjoint, et GAP3-02 ne couvre que /v1 | nuancé | — | pas de ticket |
| [OUBLI-47](#OUBLI-47) | Le CLI Codex est une pièce installée séparément, absente de la matrice | nuancé | — | pas de ticket |
| [OUBLI-48](#OUBLI-48) | La procédure d'installation écrite produit elle-même un état mélangé | nuancé | — | pas de ticket |
| [OUBLI-49](#OUBLI-49) | Les bornes et délais font partie du contrat et n'existent qu'en copies de chaque côté, sans déclaration commune ni test | confirmé | — | [T038](travail/tickets/038-exercise-the-v1-wire-with-the-real-tv-client-and-write-its.md) |
| [OUBLI-50](#OUBLI-50) | Formats côté TV absents de l'inventaire | nuancé | — | pas de ticket |
| [OUBLI-51](#OUBLI-51) | models.json est réécrit à chaque démarrage du Mac | nuancé | — | pas de ticket |
| [OUBLI-52](#OUBLI-52) | Préférences persistées en localStorage, sans version et hors inventaire | nuancé | — | pas de ticket |
| [OUBLI-53](#OUBLI-53) | États d'un disque interrompu absents de la fixture proposée | confirmé | — | [T037](travail/tickets/037-freeze-a-reference-session-archive-and-prove-the-current.md) |
| [OUBLI-54](#OUBLI-54) | Racine des sessions : un dossier dont le nom n'est pas un UUID n'est ni listé, ni ouvert, ni supprimable (adap… | nuancé | — | pas de ticket |
| [OUBLI-55](#OUBLI-55) | Aucun événement de démarrage ni d'arrêt | confirmé | — | [T041](travail/tickets/041-journal-the-start-the-stop-and-the-last-resort-failure-of.md) |
| [OUBLI-56](#OUBLI-56) | Erreurs côté client sans chemin vers un journal | nuancé | — | pas de ticket |
| [OUBLI-57](#OUBLI-57) | La règle « jamais ce qui est regardé » n'est pas tenable par clean() seul | confirmé | — | [T036](travail/tickets/036-add-a-journal-port-with-a-stderr-sink-and-a-contract-test.md) |
| [OUBLI-58](#OUBLI-58) | safeError sert trois lecteurs et non le seul journal | confirmé | — | [T040](travail/tickets/040-serialize-errors-for-the-journal-with-their-cause-system.md) |
| [OUBLI-59](#OUBLI-59) | Boucles à la seconde qui avalent | nuancé | — | pas de ticket |

<a id="GAP3-02"></a>
#### GAP3-02 — Aucun test ne fait parler un client TV au vrai serveur

**Verdict : nuancé** · priorité P0 · effort M · risque faible · Complément : contrat de fil entre parties déployées

**Suite :** [T038](travail/tickets/038-exercise-the-v1-wire-with-the-real-tv-client-and-write-its.md) « Exercise the /v1 wire with the real TV client and write its compatibility rule » ; [T042](travail/tickets/042-pin-the-status-and-code-of-every-block-refusal-the-tv.md) « Pin the status and code of every block refusal the TV capture reads » ; [T045](travail/tickets/045-replay-the-server-refusals-through-the-tv-transport.md) « Replay the server refusals through the TV transport ».

- **Où :** tests/server-state-views.test.cjs:61, :68, :79, :98 ; tests/tv-panel.test.cjs:91-92, :117, :120-143 ; tests/test_tv_control.py:121, :132, :135 ; tests/test_tv_capture_gate.py:156, :257, :267 ; scripts/smoke-tv-overlay.mjs:966-974 ; package.json:11
- **Preuve :** 9 fichiers de tests instancient RemoteServer, 5 chargent du code de tv/app, 0 fait les deux (grep croisé). Le serveur est vérifié par des listes de clés littérales (server-state-views.test.cjs:68, :79). Le panneau est vérifié sur des objets écrits à la main (tv-panel.test.cjs:91-92) et des refus fabriqués (:117). Les tests Python utilisent un faux serveur et des couples écrits à la main (`(507,{'error':…,'code':'storage-full'})`). La seule exécution conjointe est scripts/smoke-tv-overlay.mjs, avec navigateur, hors npm test. Les 6 fichiers de tests Python (3 dans tests/, 3 dans prototypes/lg-remote) ne sont pas lancés par npm test.
- **Impact :** Renommer un champ ou changer un statut côté serveur laisse les deux suites vertes et casse la TV. Aucun test ne répond à « une TV non mise à jour fonctionne encore ».
- **Nuance du relecteur (elle prime) :** Compteurs exacts : 9 fichiers de tests instancient RemoteServer, 5 chargent tv/app par require, intersection vide ; toutes les lignes citées sont justes. Un fait faux : scripts/smoke-tv-overlay.mjs n'est pas la seule exécution conjointe. scripts/bench-perceived.cjs:88-100 monte déjà le vrai RemoteServer et HeadlessRuntime avec le vrai tv/app/remote-client.js, pollPolicy et mergeState, sans navigateur, et sait charger un autre arbre par --root (:19, :25) ; hors npm test lui aussi, mais c'est le gabarit de (a). Deux imprécisions sur (c) : transport.py ne peut pas être rejoué par un .test.cjs sans lancer python3 depuis Node (précédent : scripts/simulate-tv-ambient.mjs lance les vrais controller.py et ambient.py) ; et le repli « plancher = 8627b46 » est dangereux, car la doc dit les écrans TV non déployés (architecture.md:104) et le VPS parti de 7015a64 (vps-deployment.md:101) : un plancher plus récent que l'installé rassure à tort. (a) et (b) ne dépendent pas de la TV ; (c) attend une révision lue par le propriétaire.

<a id="GAP2-01"></a>
#### GAP2-01 — Aucune archive de référence : la lecture n'est prouvée que par aller-retour avec le même code

**Verdict : nuancé** · priorité P0 · effort M · risque faible · Complément : formats écrits sur disque

**Suite :** [T037](travail/tickets/037-freeze-a-reference-session-archive-and-prove-the-current.md) « Freeze a reference session archive and prove the current code reads it ».

- **Où :** tests/fixtures/ (4 fichiers, aucune session) ; tests/session-durable.test.cjs:148-190, :271-300, :826-833 ; tests/surveillance.test.cjs:781 ; tests/moment-index.test.cjs:507-511 ; docs/night-features-delivery.md:229
- **Preuve :** Les appels à library.read, library.list et openArchivedSession des tests (25 dans session-durable, 10 dans session-delete, 1 dans architecture-f05, 1 dans clip-unreadable) ouvrent tous un dossier écrit quelques millisecondes plus tôt par le même processus. Les « anciens formats » sont 4 littéraux écrits à la main (session-durable:151-160, :285-290, :828-832 ; moment-index:511) et 1 registre dérivé de la sortie courante en retirant 7 champs (surveillance.test:781). Sonde en mémoire : le job ancien du test, `{id:'deep-1',status:'done',result:{…}}`, est écarté par DeepAsk.restore (0 job gardé, filtre `typeof j.question==='string'`, core/deep-ask.cjs:47) ; le test ne le voit pas car il lit `archive.chat.jobs[0]`, le fichier brut. La note de livraison l'écrit : « Le repli de lecture des archives anciennes est testé sur des fichiers fabriqués. Aucune archive réelle de ce Mac n'a été ouverte. »
- **Impact :** Un ticket qui renomme un champ de passage, scinde snapshot() ou retire un chemin hérité modifie l'écrivain et le lecteur dans le même commit : tous les tests restent verts et les sessions déjà sur le disque du Mac et du VPS deviennent illisibles ou partiellement lues. CORE-05 (retrait de ask, donc du champ `questions`), CORE-06 (drapeaux persistés), CORE-07 et CORE-08 (forme sauvegardée), CORE-15 (phrases persistées) et ADP-11 (chemins hérités) sont tous dans ce cas.
- **Nuance du relecteur (elle prime) :** Fond vérifié : tests/fixtures contient 4 fichiers et aucune session ; les compteurs 25 / 10 / 1 / 1 se retrouvent par grep ; DeepAsk.restore écarte bien le job sans `question` (core/deep-ask.cjs:47) alors que le test lit le fichier brut (tests/session-durable.test.cjs:168) ; la phrase de la note de livraison est à la ligne 229. Faits à corriger : (1) session-durable compte 21 appels à tree() répartis sur 11 assertions, pas 22 comparaisons (le 22e « await tree( » est la récursion de la ligne 28). (2) D'autres tests rouvrent des archives par les hôtes (server-sessions, mac-ipc-contract, architecture-f07) : eux aussi en aller-retour, le constat tient. (3) Effort plutôt M à L : living-recap.json n'est écrit que par le câblage de l'hôte Mac (app/main.cjs:212), deep-answers.json et surveillance.json par les hôtes et non par createSessionRuntime. Le générateur doit donc piloter HeadlessRuntime et reproduire le câblage Mac (ou passer par l'Electron de substitution), et le README doit dire lequel. (4) Le helper tree n'est pas exporté et existe déjà en 6 copies (session-durable:24, session-delete:18, server-sessions:61, architecture-f06:50, architecture-f07:30, disk-guard:16) : l'extraire plutôt qu'en ajouter une septième. (5) expected.json ne peut pas être figé comme les octets : CORE-15 changera légitimement ce que la relecture rend. Le README doit lister les invariants de lecture (identifiants, bornes, compteurs, texte) et dire qui peut modifier ce fichier.

<a id="GAP2-02"></a>
#### GAP2-02 — Trois obstacles matériels à une archive figée : .gitignore, formateur, dates tirées du mtime

**Verdict : nuancé** · priorité P0 · effort S · risque faible · Complément : formats écrits sur disque

**Suite :** [T037](travail/tickets/037-freeze-a-reference-session-archive-and-prove-the-current.md) « Freeze a reference session archive and prove the current code reads it ».

- **Où :** .gitignore:15, :18-20, :40 ; adapters/session-library.cjs:11-15, :44, :95, :98 ; adapters/local-store.cjs:190 ; adapters/embedding-store.cjs:34
- **Preuve :** (a) .gitignore ignore `*.webm` (15), `*.enc` (18), `sessions/` (19), `saved-moments/` (20), `device-token` (40). Les 3 WebM de tests/fixtures sont suivis malgré la règle, donc ajoutés de force. Une archive posée sous un dossier nommé `sessions/` ne serait pas ajoutée du tout ; ailleurs, ses JSON le seraient et ses clips non. Sans CI, un clone propre qui échoue ne serait vu par personne. (b) Prettier modifie déjà 188 fichiers : surveillance.json est écrit sans indentation (local-store.cjs:190, `indent 0`), embeddings.json est un journal ligne par ligne sous extension .json (embedding-store.cjs:34), session.json est indenté à 2. Un passage du formateur sur tests/fixtures changerait les octets, ou échouerait sur embeddings.json. (c) Sans manifeste, `savedAt` est le mtime de session.json (:98) ou du dossier (:95), et sert de createdAt, updatedAt, closedAt et de titre (`sessionTitle`, :11-15, heure locale de l'hôte). Git ne conserve pas les mtime : après un checkout, la session ancienne de la fixture s'appelle « Session du &lt;jour du clone> ».
- **Impact :** Une fixture partiellement versionnée passe en local et échoue sur un clone ; une fixture reformatée ne prouve plus rien sur ce que le code de 8627b46 écrivait ; un test qui compare titre ou date d'une archive sans manifeste est instable selon la machine et le fuseau. Le point (c) touche aussi le produit : une sauvegarde restaurée par copie sans conservation des dates renomme et reclasse toutes les sessions anciennes.
- **Nuance du relecteur (elle prime) :** Preuve vérifiée : .gitignore lignes 15, 18-20 et 40 ; les 3 WebM sont bien suivis à 8627b46 (git ls-tree) malgré `*.webm` ; savedAt vient du mtime (adapters/session-library.cjs:95, :98) et sert de titre et de dates (:44). Corrections : (1) scripts/check.mjs n'existe pas à 8627b46. Il existe sur la branche de travail, fait partie du harnais protégé (CLAUDE.md) et lance déjà `prettier --check --ignore-unknown` sur les fichiers modifiés : le .prettierignore doit donc arriver dans le même commit que la fixture, et y ajouter un contrôle demande l'ouverture du harnais par Dabi, prérequis non annoncé. (2) Un `git clone` local ne voit que ce qui est commité : dans la boucle, avant intégration, il passerait à vide ou échouerait. Forme équivalente et compatible : dans archive-compat, `git check-ignore --no-index` sur chaque chemin de SHA256SUMS (aucun ne doit être ignoré), sauté hors dépôt Git. (3) Appliquer fs.utimes à la copie temporaire, pas à la fixture versionnée. (4) Ajouter un `.gitattributes` (`tests/fixtures/archives/** -text`) : il n'en existe aucun, et une conversion de fins de ligne changerait les octets. (5) La négation proposée ne couvre pas `tests/fixtures/user-data/` de GAP2-08, où provider.enc, device-token et saved-moments/ restent ignorés. Non vérifié : le comportement exact de Prettier sur un JSON compact ou sur un journal en .json (Prettier non lancé).

<a id="GAP1-01"></a>
#### GAP1-01 — Pas de port de journal : quatre formes ad hoc, aucun identifiant commun

**Verdict : nuancé** · priorité P0 · effort M · risque moyen · Complément : journal et diagnostic d'une panne

**Suite :** [T036](travail/tickets/036-add-a-journal-port-with-a-stderr-sink-and-a-contract-test.md) « Add a journal port with a stderr sink and a contract test ».

- **Où :** core/ports.cjs:1-103 (aucun typedef de journal) ; runtime/headless-runtime.cjs:250, 259, 885, 1137 ; runtime/session-closing.cjs:126-131 ; app/main.cjs:378, 549 ; adapters/codex-session-client.cjs:46-56 ; adapters/chat-trace.cjs:40-44 ; core/deep-ask.cjs:18, 22-23 ; server/main.cjs:36, 41, 47 ; mcp/server.cjs:78-81
- **Preuve :** Quatre formes coexistent. (1) `log(line)` injectable, prose française, 2 émetteurs (session-closing.cjs:128, headless-runtime.cjs:1137), puits `console.error` sur les deux hôtes. (2) `reportOnce`/`report` vers `process.stderr.write("TVLens : …")`, 6 appels (codex-session-client.cjs:295, 355, 390, 422, 470, 829). (3) `trace()` en ligne JSON `tvlens-chat-trace-v1`, 23 appels (18 dans codex-session-client, 5 dans deep-ask ; la mission en annonçait 21), éteinte sans TVLENS_CODEX_TRACE=1. (4) `console.log/error` directs : server/main.cjs:36, 41, 47, app/main.cjs:549, et mcp/server.cjs:79 qui écrit un texte fixe sans l'erreur. Seule la forme 3 porte une heure et des identifiants ; aucune ne porte de niveau, d'hôte ni l'identifiant de démarrage, alors que `this.boot` existe déjà (headless-runtime.cjs:250, utilisé pour l'ETag). `clean()` n'est pas exporté (chat-trace.cjs:44). core/ ne contient ni `process` ni `console` (grep vide) : son seul précédent de diagnostic est l'injection `onTrace`/`serializeError` par constructeur (deep-ask.cjs:18).
- **Impact :** Sept constats de L04 (SEC-01, SEC-05, ADP-01, ADP-02, ADP-05, UI-04, PY-04) demandent de « journaliser ». Sans port, chaque ticket ajoutera sa propre forme et son propre puits, et aucune ligne ne pourra être reliée à une autre par session, passage ou question.
- **Nuance du relecteur (elle prime) :** Preuve exacte : 6 appels reportOnce/report (codex-session-client.cjs:295, 355, 390, 422, 470, 829), 23 points de trace (18 this.trace dans le client, 5 dans deep-ask.cjs:68, 79, 83, 139, 152), core/ sans process ni console, clean non exporté (chat-trace.cjs:44), this.boot lu seulement pour l'ETag (headless-runtime.cjs:455). Quatre faits à corriger. (1) « Les tests fixent le texte, pas l'enveloppe » est faux : l'enveloppe est fixée par les trois filtres String(chunk).startsWith('TVLens :') sur stderr brut (codex-confinement.test.cjs:33, architecture-f05.test.cjs:52, verification.test.cjs:186), par la regex ancrée ^TVLens : … \.\n$ (codex-confinement.test.cjs:570), par JSON.parse de chaque écriture et record.eventTurnId (chat-trace.test.cjs:5, 13), et par l'option log déjà injectée et comparée en deepEqual à la ligne entière (server-sessions.test.cjs:400, 437, 490, 524, 559, 690 ; architecture-f06.test.cjs:124 ; architecture-f07.test.cjs:69, 128, 175). (2) La liste blanche de 15 clés contredit le point (e) et les autres constats du même audit : elle retirerait eventTurnId, eventThreadId, itemId, tool, model, kind, mode, confined, verified, willRetry, questionLength, totalMs, émis aujourd'hui par trace(), ainsi que reasons (GAP1-08), lane et timeout (GAP1-03), origin (GAP1-05), component (GAP1-07). Forme cible : liste blanche par événement, ou liste commune élargie à ces champs. (3) Couture d'injection oubliée : runtime/conversation-runtime.cjs:4 et 64-65, où trace et safeError sont branchés sur DeepAsk pour les deux hôtes ; et CodexSessionClient est construit à quatre endroits (codex-session-agent.cjs:20, codex-analysis-agent.cjs:8, codex-surveillance-agent.cjs:31, codex-verifier.cjs:50), donc l'option journal traverse quatre adaptateurs et leurs runtimes. (4) Effort : M pour (a) à (d) avec le puits mémoire ; (e) est déjà compté dans GAP1-08 (forme 2) et GAP1-10 (tests). À découper : port, puits et test de contrat d'abord, puis une migration par forme.

<a id="GAP3-01"></a>
#### GAP3-01 — Aucune règle de compatibilité ni ordre de livraison écrits

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Complément : contrat de fil entre parties déployées

**Suite :** [T038](travail/tickets/038-exercise-the-v1-wire-with-the-real-tv-client-and-write-its.md) « Exercise the /v1 wire with the real TV client and write its compatibility rule ».

- **Où :** docs/server-installation.md:148 ; docs/vps-deployment.md:101 ; docs/lg-capture-control.md:49 ; docs/lg-installation.md:32 ; docs/architecture.md:100 ; docs/adr/ (10 ADR, aucun sur le fil)
- **Preuve :** server-installation.md:148 : « Les changements du serveur et ceux de tv/app se déploient séparément ». vps-deployment.md:101 : le VPS « part de 7015a64 avec correctifs déployés hors commit ». lg-capture-control.md:49 : « copier les trois fichiers ». La seule phrase de compatibilité du dépôt est architecture.md:100 (« GET /v1/state reste compatible… un client TV non mis à jour continue de télécharger l'état complet »). Six pièces installées séparément ; l'app Mac n'appelle jamais /v1 (grep dans app/ et mcp/ : 0).
- **Impact :** Chaque ticket qui touche un statut, un champ ou une route (SEC-01, CORE-11, CORE-15, CORE-08, TV-06) n'a aucun critère pour savoir s'il est permis. Le relecteur ne peut pas dire si une TV non mise à jour continue de fonctionner.
- **Nuance du relecteur (elle prime) :** Le fond tient : aucune règle de compatibilité ni ordre de livraison n'est écrit ; les cinq lignes de doc citées sont exactes ; grep de /v1 dans app/ et mcp/ : 0. Deux faits faux. (1) « Aucun ADR sur le fil » : l'ADR 0006 fixe déjà, décisions 12 et 13 (docs/adr/0006-…md:48-57), la table des statuts de POST /v1/segments (503 media-unavailable, 503 session-closing, 409 capture-changed, 400 bloc fautif, 413/429/507/409 inchangés) en raisonnant sur le renvoi côté TV (:20, :72-74, :85-87) ; l'ADR 0010:17 note que GET /v1/media n'a pas de consommateur. (2) architecture.md:100 n'est pas « la seule phrase de compatibilité » : docs/server-installation.md:134 (« compatible avec un panneau ancien »), docs/lg-ambient.md:74 (forme d'un panneau antérieur encore acceptée), :93 (server-unsupported), :301 (capture.py non mis à jour). Prérequis « aucun » inexact : la matrice a besoin des révisions réellement installées, que seul le propriétaire peut lire sur la TV et le VPS ; docs/architecture.md:104 dit les écrans surveillance et sessions non déployés, vps-deployment.md:101 un VPS parti de 7015a64. Le nouvel ADR doit étendre l'ADR 0006, pas le doubler.

<a id="GAP3-04"></a>
#### GAP3-04 — Le transport retire le code d'un refus 400 ; 8 codes émis, 2 lus

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Complément : contrat de fil entre parties déployées

**Suite : pas de ticket.** Arbitrage A5 : le domicile des codes d'erreur est une décision du propriétaire, et le relecteur demande de livrer avec CORE-11 et CORE-10 ; le défaut est latent, pas actif. — _Reprise :_ Après L17-07 (table des refus figée), avec le lot qui porte CORE-10 et CORE-11.

- **Où :** server/http.cjs:284-289, :58-65, :114-144, :152, :159-180, :239-248, :274 ; runtime/headless-runtime.cjs:69-70, :158, :160, :221, :448 ; tv/app/remote-client.js:11-18 ; tv/app/companion.js:240-245 ; tv/transport.py:79-82
- **Preuve :** http.cjs:286 : `typeof error?.code === "string" && status !== 400 ? { code } : {}`. Observé : un refus (400, « Vue d’état inconnue. », code) sort en `{"error":"Vue d’état inconnue."}` ; un TypeError sort en 400 avec son message brut ; un ENOENT sort en 400 avec son chemin. Les 4 refusal(400) du runtime n'ont pas de code. Codes émis : storage-full, read-only, capturing, not-open, not-found, session-closing, capture-changed, media-unavailable. Lus : storage-full et read-only, en Python. `error.code` est posé à remote-client.js:16 et lu nulle part dans tv/app (grep), alors que le commentaire :11-12 dit que le panneau « never guesses from the text ». 15 refus écrits dans http.cjs sans code (401, 405, 410×4, 404×2, 415, 413×2, 400, 409×2, 429).
- **Impact :** Le panneau ne peut décider que sur le statut ou le texte, d'où la regex /vue d.état inconnue/ (companion.js:242). Une TV future qui demande une vue nouvelle à ce serveur dépend à jamais de cette phrase française.
- **Nuance du relecteur (elle prime) :** Preuve exacte : 15 refus sans code écrits dans http.cjs, 8 codes émis, 2 lus (Python), error.code posé à remote-client.js:16 et lu nulle part dans tv/app. Précision : aucun refus 400 ne porte de code aujourd'hui (les 4 refusal(400) du runtime n'en ont pas) ; le filtre `status !== 400` (http.cjs:286) ne retire en pratique que les codes système d'erreurs sans statut (ENOENT, ERR_*). Le défaut est latent, pas actif. Remédiation à corriger : « code si et seulement si instanceof Refusal », avec la classe dans runtime/refusals.cjs, ferait perdre `media-unavailable`, créé dans adapters/remote-media.cjs:43 (Error nue avec status et code), et doit préserver STORAGE_FULL (adapters/disk-guard.cjs:4, http.cjs:278). Aucun adaptateur n'importe runtime/ (grep : 0) : la classe doit vivre dans core/ (le core/errors.cjs de CORE-10). tests/architecture-f06.test.cjs:22-24 affirme ces codes.
- **Remède proposé par l'audit :** runtime/refusals.cjs (le fichier de CORE-11) : classe Refusal {status, code} et fabriques. http.cjs publie `code` si et seulement si `error instanceof Refusal`, quel que soit le statut, jamais pour une autre erreur. Chaque refus écrit dans http.cjs reçoit un code (route-unknown, unknown-view, invalid-json, sequence-conflict, sequence-old, busy, media-expired, session-ended, unauthenticated…), listé dans wire-contract.cjs CODES. Test : tout code de CODES est produit par au moins un test HTTP et tout code émis est dans CODES. Livraison additive : statuts et messages inchangés. Ensuite, côté panneau, tvlensViewRefusal décide sur `error.code === "unknown-view"` ; la regex et le 404 ne servent plus que si `server` est absent.
- **Risque du remède selon le relecteur :** Un filtre par classe mal placé fait disparaître media-unavailable ou storage-full, et la TV compte alors un bloc rejeté ou affiche une coupure réseau ; le détectent tests/architecture-f06.test.cjs, tests/server-sessions.test.cjs et tests/test_tv_control.py:120-137.

<a id="GAP3-05"></a>
#### GAP3-05 — La reprise de la capture Python dépend de la classe du statut, que SEC-01 et CORE-11 déplacent

**Verdict : nuancé** · priorité P1 · effort M · risque moyen · Complément : contrat de fil entre parties déployées

**Suite :** [T042](travail/tickets/042-pin-the-status-and-code-of-every-block-refusal-the-tv.md) « Pin the status and code of every block refusal the TV capture reads » ; [T045](travail/tickets/045-replay-the-server-refusals-through-the-tv-transport.md) « Replay the server refusals through the TV transport ».

- **Où :** tv/transport.py:76-93 ; tv/capture.py:140-146, :221 ; server/http.cjs:237-258, :280-283 ; adapters/remote-media.cjs:8-36, :62 ; runtime/headless-runtime.cjs:655, :660, :707
- **Preuve :** transport.py:85 : un 4xx hors 408 et 429 abandonne le bloc ; tout le reste est renvoyé chaque seconde jusqu'au délai de 30 s. Mesuré sur le vrai transport.py face à un serveur factice, délai ramené à 4 s : 400 → 1 envoi, deliveryRejected, erreur « HTTP 400 » ; 500 → 4 envois, deliveryExpired, aucune erreur notée ; 409 avec code session-closing → abandon (le code n'est pas lu). Chaque renvoi repasse par media.assemble (rien n'est mémorisé avant un succès, http.cjs:237-258), donc par ffmpeg. Aujourd'hui les 11 `throw Error` de validation (remote-media.cjs:8-35) et « Préparation média échouée » (:62) sortent en 400. capture.py:143 : `code=='read-only' or status==409`, donc tout 409 sur POST /v1/session/start s'affiche « lecture seule ».
- **Impact :** SEC-01 (« tout le reste en 500 ») appliqué avant de classer les validations transforme, pour une TV non mise à jour, chaque bloc refusé en une trentaine de renvois avec ffmpeg relancé sur le VPS, un débordement de la file de 3 blocs (capture.py:146, :221) et un panneau qui affiche « Réseau coupé ». Un 409 choisi par CORE-11 pour « fermeture » au démarrage s'afficherait « lecture seule ».
- **Nuance du relecteur (elle prime) :** Mesure rejouée sur le vrai transport.py, délai de 4 s : 400 → 1 envoi, deliveryRejected, « HTTP 400 » ; 500 → 4 envois, deliveryExpired, aucune erreur, connection `reconnecting` (« Réseau coupé », sessions-view.js:276-277). capture.py:143 confirmé. Quatre corrections. (1) L'invariant de classe de statut est déjà décidé : ADR 0006, décisions 12-13 (docs/adr/0006-…md:48-57), alternative écartée :74 (« une entrée invalide inconnue ne doit pas devenir un renvoi »), coût des renvois reconnu :85. SEC-01 contredit cet ADR ; l'audit ne le cite pas. (2) Le cas « 409 session-closing » n'existe pas sur le vrai serveur, qui répond 503 (headless-runtime.cjs:73-74) ; les 409 définitifs réels sont capture-changed (:783-787) et les deux refus de séquence (http.cjs:240, :246). (3) « ffmpeg relancé à chaque renvoi » ne vaut que pour les échecs levés pendant ou après assemble (remote-media.cjs:62, décodage, validateSegment) : validateRemote (http.cjs:221), admit (:224) et l'horodatage (:226) refusent avant, et le verrou `ingesting` (:247) répond 429 entre-temps. (4) « 5xx sans code : 2 renvois au plus » réduit la tolérance validée sur la TV (docs/lg-capture-control.md:54 : 12 renvois, zéro passage perdu) et met tests/test_tv_control.py:105-107 exactement à la limite.

<a id="GAP2-03"></a>
#### GAP2-03 — Version inconnue ou plus récente : cinq comportements, et quatre fichiers réécrits sans avoir été compris

**Verdict : nuancé** · priorité P1 · effort M · risque moyen · Complément : formats écrits sur disque

**Suite : pas de ticket.** Décision attendue du propriétaire : l'état « newer » (consultation seule) est une valeur nouvelle publiée sur le fil et affichée par une TV non redéployée, le code TVLENS_ARCHIVE_PROTECTED est nouveau, et la protection en écriture change la fin de session. — _Reprise :_ Après L17-02 (l'archive figée sert de base aux cas de version) et L17-03 (règle du fil), une fois la décision prise.

- **Où :** adapters/session-library.cjs:6, :77-83, :135-137 ; runtime/session-runtime.cjs:346-353, :414-422 ; adapters/local-store.cjs:138-141, :194-198 ; core/session.cjs:17-20, :477-493 ; core/deep-ask.cjs:45-53 ; core/living-recap.cjs:24-44 ; app/main.cjs:153, :212, :444-445 ; runtime/headless-runtime.cjs:403-424, :1010
- **Preuve :** Sondes en mémoire sur la copie de référence. manifest.json : `version` valant undefined, 0, 2, 99 ou "x" est accepté ; seuls `format` et `id` sont comparés (:79). À la reprise, saveManifest fusionne `{...manifest lu, ...patch}` avec `version: MANIFEST_VERSION` : un manifeste 2 redevient 1 en gardant ses champs inconnus. Un manifeste d'un autre `format` rend null, donc « pas de manifeste » : la liste relit alors session.json en entier, et la reprise écrit un manifeste neuf dont createdAt est le mtime de session.json (:346-349, lu sans exécution). session.json : aucun champ de version ; `restorable` accepte tout sur-ensemble (un état portant `schema: 7` passe) ; après restore, le snapshot suivant a perdu les champs inconnus de premier niveau et gardé ceux des passages (copie par étalement). deep-answers.json : lu par `archive.chat?.jobs || []` ; une forme inconnue ou un JSON abîmé (`optional`, :135, avale l'erreur) donne zéro question sans message, et la question suivante sur l'archive rouverte remplace le fichier (aucune garde readOnly dans checkpoint ni saveQuestions). living-recap.json : relu champ par champ sans version, réécrit à la synthèse suivante. Les cinq comportements : refus en clair (forme invalide), version ignorée, lu comme absent puis remplacé, déclaré illisible et protégé (surveillance à l'activation), vide en silence (surveillance à la réouverture).
- **Impact :** Le Mac lance tous les checkouts sur le même dossier de données (app.setName('TVLens'), app/main.cjs:41 ; `userData` n'est redirigé qu'en smoke) : lancer une branche plus ancienne après une plus récente suffit à rabaisser un manifeste, à tronquer session.json ou à remplacer les questions d'une session. Le scénario est supposé, le mécanisme est lu dans le code. Sans règle, chaque ticket qui introduit une version (CORE-08) devra réinventer la sienne.
- **Nuance du relecteur (elle prime) :** Mécanismes vérifiés par lecture et par sonde : la version du manifeste n'est jamais comparée (adapters/session-library.cjs:79), saveManifest fusionne puis réécrit version 1 (adapters/local-store.cjs:196, runtime/session-runtime.cjs:352-353), `restorable` accepte un sur-ensemble, le snapshot suivant perd les champs inconnus de premier niveau et garde ceux des passages, `optional` avale l'erreur (:135), aucune garde readOnly dans saveQuestions (app/main.cjs:153, runtime/headless-runtime.cjs:423). Corrections : (1) Impact surévalué : lancer, lister ou ouvrir n'écrit rien, invariant testé octet pour octet (tests/session-durable.test.cjs:180, :814). Rabaisser le manifeste ou tronquer session.json exige une reprise explicite ; remplacer les questions exige une question sur l'archive, geste autorisé et testé (tests/mac-ipc-contract.test.cjs:330-340). (2) La perte de questions est plus large que « forme inconnue » : tout job filtré par DeepAsk.restore (core/deep-ask.cjs:47) est effacé du fichier à la question suivante. (3) Le refus dans persist() ne doit pas passer par `this.refused` (local-store.cjs:177), sinon flush() (:202-207) fait rejeter archive() à la fermeture d'une simple consultation (ADR 0002) : refuser avant la mise en file et le dire à l'hôte. (4) Une garde dans le store ne couvre pas embeddings.json, écrit par EmbeddingStore hors du store (session-runtime.cjs:127-130, adapters/embedding-store.cjs:34 ; limite déjà notée dans docs/night-features-delivery.md:232) : le test « arbre identique après question » en dépend. (5) Une rétention inconnue est volontairement « pas plus récente » (session-durable:825-838) : classify doit se fonder sur le champ version, pas sur `retention`. (6) Le nouvel état `newer` doit être connu du renderer Mac, du panneau TV et des routes serveur : non vérifié (supposé).
- **Remède proposé par l'audit :** `core/archive-format.cjs`, pur : table des formats du dossier de session (nom, version courante, « sans champ version = génération d'avant ») et `classify(name, value)` qui rend `absent | current | older | newer | foreign`. SessionLibrary.read rend ce statut par fichier ; `describe` gagne l'état `newer` (« Écrite par une version plus récente : consultation seule »). `LocalSessionStore.adopt` reçoit les noms à protéger ; `persist(name)` d'un fichier classé newer, foreign ou illisible est rejeté avec le code `TVLENS_ARCHIVE_PROTECTED` : c'est la règle du registre de surveillance (« ni repris ni remplacé », surveillance-runtime.cjs:289-304) portée dans le store. `resume()` est refusé quand session.json ou manifest.json est newer. Le manifeste est comparé à MANIFEST_VERSION. Tests : pour chaque fichier de la fixture, une copie dont la version est augmentée s'ouvre en lecture seule, refuse la reprise, et son arbre reste identique après question, pause et close.
- **Risque du remède selon le relecteur :** Un refus d'écriture protégé qui atterrit dans store.refused fait échouer l'archivage en fin de session, ou l'état `newer` est mal affiché par une TV non redéployée ; tests/session-durable.test.cjs:679-720, tests/mac-ipc-contract.test.cjs:330-341 et tests/tv-panel.test.cjs le détecteraient en partie, l'écart de version TV non.

<a id="GAP2-05"></a>
#### GAP2-05 — Deux générations devinées par la forme à onze endroits ; durée de vie jamais décidée

**Verdict : nuancé** · priorité P1 · effort M · risque moyen · Complément : formats écrits sur disque

**Suite : pas de ticket.** Dépend d'un inventaire des dossiers réels du Mac et du VPS, que seul le propriétaire peut lancer, et d'une décision sur la durée de vie de l'ancienne génération ; le compteur « 11 sites » n'a pas été retrouvé par le relecteur. — _Reprise :_ Après L17-02 ; le script d'inventaire peut être un ticket dès que le propriétaire le demande, l'ADR « formats sur disque » après l'inventaire.

- **Où :** core/session.cjs:431, :441, :453-462 ; adapters/session-library.cjs:28, :43, :79 ; adapters/local-store.cjs:7, :33-34, :40-41, :88-93, :125-130, :267-276 ; adapters/session-thumbnails.cjs:53-54, :65 ; runtime/session-runtime.cjs:112-114 ; adapters/embedding-store.cjs:12, :16 ; core/surveillance.cjs:529-530, :538, :547-549 ; adapters/config.cjs:41-43 ; adapters/trial-budget.cjs:19-20 ; docs/architecture.md:39
- **Preuve :** Génération d'avant la nuit du 13 octobre 2026 (date tirée de docs/night-features-delivery.md) : session.json sans `retention`, pas de manifeste, médias à la racine du dossier, `thumbnails/`, média JSON sans intervalle, embeddings.json en objet `entries`. Génération durable : `retention`, manifeste, `media/`, `thumbs/`, intervalle, journal. Onze sites de détection dans 8 fichiers, 7 prédicats, aucune déclaration commune. Deux prédicats pour la même question : le cœur teste `saved.retention === undefined` (:431), la bibliothèque `!RETENTIONS.includes(snapshot.retention)` (:43). Sonde : pour `retention: 'pinned'` ou `null`, la liste dit `legacy: true`, archivée, date de clôture inventée, et le cœur dit `mediaReason: 'missing'` au lieu de `'not-kept'`. La doctrine écrite est « additif, ni migré ni effacé », avec deux exceptions dans le code : embeddings.json est réécrit en journal à la première écriture (:16, :31-35) et le compteur de budget est converti en place (trial-budget.cjs:19-20). `cleanupRawMedia` (:267-276), sans appelant en production, supprime exactement la disposition que la lecture héritée préserve. Aucun document ne dit jusqu'à quand la première génération reste lisible.
- **Impact :** Chaque refactoring du store, de la bibliothèque ou de restore doit préserver des branches dont personne ne sait si elles servent encore. Inversement, ADP-11 peut les retirer sans savoir s'il reste de tels dossiers : avec « conservé jusqu'à suppression », ce serait une perte de données muette.
- **Nuance du relecteur (elle prime) :** Fond vérifié : deux prédicats (core/session.cjs:431 et adapters/session-library.cjs:43) ; sonde : `retention: 'pinned'` donne `missing` côté cœur, l'absence de rétention donne `not-kept` ; doctrine en docs/architecture.md:39 ; exceptions en adapters/embedding-store.cjs:16, :31-35 et adapters/trial-budget.cjs:19-20 ; cleanupRawMedia sans appelant en production. Corrections : (1) Le compteur « 11 sites, 8 fichiers, 7 prédicats » ne se retrouve pas : la liste cite 9 fichiers de code, dont 7 pour le dossier de session (config.cjs et trial-budget.cjs sont hors session). (2) Le prédicat de la bibliothèque est voulu et testé : tests/session-durable.test.cjs:825-838 exige qu'une rétention inconnue (`forever`) soit listée archivée et `legacy`. La « date de clôture inventée » est ce comportement testé ; seul le côté cœur n'a pas de test. (3) Le point 3 n'est pas faisable tel quel pour le store : les replis de local-store.cjs:34, :40-41, :125-130 et de session-thumbnails.cjs:53-54 se décident par fichier, et une session ancienne reprise mêle les deux dispositions par conception (session-durable:183-192, :279-297). Le prédicat unique ne peut remplacer que les deux tests de `retention`, et doit vivre dans core/ pour être appelé par restore. (4) cleanupRawMedia a trois appels en test (session-durable:274, :353 ; tests/adapters.test.cjs:21), dont deux simulent le balayage de démarrage d'un hôte plus ancien sur un dossier durable : le déplacer côté tests comme réplique plutôt que perdre ces vérifications. Son commentaire « pour les hôtes qui l'importent encore » est faux : aucun hôte ne l'importe. (5) La conversion du compteur est voulue et testée (tests/budget.test.cjs:29-30).
- **Remède proposé par l'audit :** (1) `scripts/inventory-archives.cjs --root <dossier>`, lecture seule : par session, la génération, les fichiers présents, leurs tailles, les champs de version et l'ensemble des chemins de clés (sans contenu). Dabi le lance sur le Mac et sur le VPS ; les chemins de clés vus sur le terrain et absents de la fixture sont ajoutés à son générateur. (2) ADR « Formats sur disque » : une génération reste lisible tant que sa fixture existe ; son lecteur ne se retire que si l'inventaire rend zéro sur tous les hôtes, ou après une conversion à la reprise testée sur la fixture, ou par décision explicite qui laisse la session listée « format antérieur non pris en charge » et supprimable ; jamais d'effacement implicite ; un cache (embeddings.json) peut être reconstruit et le dit. (3) Un seul prédicat `archiveGeneration({ manifest, snapshot, inventory })` rendant `pre-durable | durable-v1`, appelé par restore, describe et le store à la place des sites actuels ; les deux tests de `retention` disparaissent. (4) Suppression de `cleanupRawMedia` dès maintenant, indépendamment du reste (tests/mac-ipc-contract.test.cjs:103 exige déjà son absence de l'hôte Mac).
- **Risque du remède selon le relecteur :** Unifier le prédicat peut changer `mediaReason` ou `legacy` d'archives existantes, et supprimer cleanupRawMedia retire la seule simulation du balayage d'un ancien hôte ; tests/session-durable.test.cjs:148-192, :271-297 et :825-839 le détecteraient, les données réelles seulement par l'inventaire.

<a id="GAP1-02"></a>
#### GAP1-02 — Bloc de capture refusé : la cause n'est gardée par personne

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Complément : journal et diagnostic d'une panne

**Suite :** [T039](travail/tickets/039-journal-every-refused-http-request-with-its-route-status-and.md) « Journal every refused HTTP request with its route, status and block identity ».

- **Où :** server/http.cjs:58, 122-124, 235, 275-289 ; tv/transport.py:77, 85-92 ; tv/capture.py:147, 217 ; core/session.cjs:101
- **Preuve :** Le `catch` de `handle` (http.cjs:275-289) transforme toute erreur en réponse, 400 par défaut, et n'écrit rien ; même silence pour un 401 (:58) et pour une miniature illisible rendue en 410 (:122-124, erreur jetée). Côté TV, `status, code, _ = refusal(error)` (transport.py:77) jette le texte envoyé par le serveur : le rapport ne garde que `'HTTP ' + str(status)` (:86) pour un refus inférieur à 500, et pour 408, 429 ou 5xx seulement `retries += 1` (:89-90) puis `dropReasons.deliveryExpired` après 30 s, sans statut ni code. Un bloc est identifié par `sessionId` + `sequence` (capture.py:147, 217 ; http.cjs:235), mais le passage créé (`moment-N`, session.cjs:101) ne garde pas `sequence` : un bloc de la TV ne se relie à un passage du serveur que par ses bornes de temps.
- **Impact :** « Trois blocs perdus hier soir » : on ne peut dire ni lesquels ni pourquoi, sur aucune des deux machines. La distinction validation contre panne que demande SEC-01 n'est observable nulle part. L'échec intermittent 429 de tests/architecture-f06.test.cjs:530 ne se diagnostiquerait pas en production.
- **Nuance du relecteur (elle prime) :** Preuve exacte : catch muet (http.cjs:275-290), 401 (:58), miniature (:122-124), transport.py:77 et 85-92, capture.py:147 et 217, session.cjs:101 sans sequence. La remédiation est à refaire sur quatre points. (1) Portée : « une seule émission dans le catch » ne voit pas les refus rendus par send() direct, dont ceux d'un bloc : 409 « Séquence déjà utilisée » et « Séquence ancienne » (:239-246), 429 « Préparation du passage précédent » (:248, seule source de 429 du serveur, donc celle de architecture-f06.test.cjs:530 que le constat invoque), 413 (:162, :168), 415 (:159), 400 JSON invalide (:180), 410 (:114-143), 404, 405, 401. Forme cible : émettre dans send quand le statut est >= 400, le catch n'ajoutant que error. (2) Infaisable telle qu'écrite : route (:69) et body (:174) sont déclarés dans le bloc try ; les lire dans le catch lève une ReferenceError, donc un rejet non attrapé de handle, le chemin de crash décrit en GAP1-05. Les hisser avant le try. (3) Il n'existe pas de « motif de route » : route est le chemin brut, qui porte des identifiants (/v1/sessions/&lt;id>/open, /v1/thumbnail/&lt;session>/moment-N, /v1/questions/deep-N/cancel) ; il faut une fonction de normalisation. (4) Côté TV, tests/test_tv_control.py:137 exige errors == ['HTTP 409'] à l'identique et ce texte est affiché dans le panneau (tv/app/sessions-view.js:255) : l'assertion est à mettre à jour avec le nouveau format. Enfin ingest.stored en debug est éteint par défaut : le pont séquence-passage n'existe pas en production sans drapeau, alors que le serveur rend déjà id dans sa réponse 200 (:267), que la TV jette (transport.py:69).

<a id="GAP1-03"></a>
#### GAP1-03 — Perception, surveillance, stockage : aucun point d'émission, la trace est réservée au chat

**Verdict : nuancé** · priorité P1 · effort M · risque faible · Complément : journal et diagnostic d'une panne

**Suite : pas de ticket.** Plafond de quatre tickets du thème journal atteint (L17-01, 04, 05, 06). Le constat demande d'injecter le journal dans WatchSession, Surveillance et le store, et de lever le filtre de rôle qu'affirme tests/chat-trace.test.cjs:15 : plus d'une session, et rien n'est possible avant que le runtime reçoive le journal. — _Reprise :_ Après L17-06 (l'hôte serveur compose le journal) ; à découper en deux tickets : perception, puis surveillance et stockage.

- **Où :** adapters/chat-trace.cjs:40-43 ; adapters/codex-session-client.cjs:170-172 ; adapters/codex-analysis-agent.cjs:11-12 ; core/deep-ask.cjs:68, 79, 83, 139, 152 ; core/session.cjs:245-249, 283-286, 353-357 ; core/surveillance.cjs:394, 628-629, 767 ; runtime/surveillance-runtime.cjs:102, 195 ; adapters/local-store.cjs:175-177 ; runtime/headless-runtime.cjs:423
- **Preuve :** `trace()` ne sort que si TVLENS_CODEX_TRACE=1 (chat-trace.cjs:41) ; la variable n'apparaît que dans le code et dans un test, ni dans deploy/*.example ni dans docs/. Le client filtre en plus par rôle : `if (this.webSearch || this.role === "surveillance")` (codex-session-client.cjs:171) ; le rôle `analysis` (description des passages, `webSearch:false`, codex-analysis-agent.cjs:11-12) n'émet donc rien même drapeau levé. deep-ask ne trace que `mode==="chat"`. Points d'émission hors chat : 0. Ce qui reste d'un échec : perception, `segment.error|audioError|visionError = error.message` et `losses.*` (session.cjs:248, 285, 355) ; surveillance, `this.error` tronqué à 200 caractères, `metrics.detect.failures/timeouts`, `persistence.lastError` ; écriture, `store.refused` en mémoire (local-store.cjs:177), dit seulement à la fin de la session, le rejet de `saveResearch` étant neutralisé (headless-runtime.cjs:423). Identifiants disponibles : UUID de session, `moment-N`, `deep-N`, uniques dans leur session.
- **Impact :** Une série d'échecs de description sur le VPS se lit passage par passage dans l'état sauvegardé, sans heure murale, sans cause ni rôle Codex ; si le processus tombe avant la sauvegarde, il ne reste rien. Une écriture refusée en cours de session n'est connue qu'à sa fin.
- **Nuance du relecteur (elle prime) :** Preuve exacte sur les sites (session.cjs:245-249, 283-286, 353-357 ; surveillance.cjs:394, 628-629, 767 ; surveillance-runtime.cjs:102, 193-195 ; local-store.cjs:174-178 ; headless-runtime.cjs:423) et sur le filtre (codex-session-client.cjs:171) ; TVLENS_CODEX_TRACE n'apparaît que dans chat-trace.cjs:41 et tests/chat-trace.test.cjs. Corrections. (1) « Trace réservée au chat, 0 point hors chat » est imprécis : les 18 points du client émettent aussi pour le rôle surveillance et pour le vérificateur (webSearch:true, codex-verifier.cjs:60). Ce qui n'a aucun point, c'est le cœur (session.cjs, surveillance.cjs) et le stockage ; côté client seul le rôle analysis est muet. (2) Invariant non cité : tests/chat-trace.test.cjs:15 affirme qu'un client webSearch=false n'écrit aucune ligne (assert.equal(lines.length,0)). Retirer le filtre de rôle change un comportement testé : l'assertion se réécrit explicitement (rôle porté en champ), elle ne se contourne pas. La ligne 54 citée ne protège que deep-ask. (3) lane et timeout ne sont pas dans la liste blanche de GAP1-01. (4) fail() (surveillance.cjs:394, appelé par tick :496) est cité mais ne reçoit aucun événement : un défaut interne du tick reste une phrase tronquée réécrite chaque seconde. store.sweep.failed ne désigne aucun site. (5) LocalSessionStore est aussi construit par forSession (session-library.cjs:122, 134) : journal et identifiant de session doivent y arriver.
- **Remède proposé par l'audit :** Événements toujours actifs (niveaux `warn`/`error`, sans drapeau), émis là où l'état est déjà mis à jour : `passage.failed { sessionId, passageId, lane:'audio'|'vision', code, error }` aux trois `catch` de session.cjs (WatchSession reçoit `journal` par constructeur, comme `now`) ; `passage.retried` pour la reprise de l'ADR 0008 ; `surveillance.read.failed` et `surveillance.verify.failed { sessionId, passageId, timeout }` (surveillance.cjs:628, 767) ; `store.write.refused { sessionId, file, code }` (local-store.cjs:175, avec le nom logique du fichier déjà utilisé par `refusal`) ; `store.sweep.failed`. La trace fine reste en `debug` derrière TVLENS_CODEX_TRACE, mais le filtre de rôle de la ligne 171 disparaît : `role` devient un champ. La variable est commentée dans deploy/runtime.env.example.
- **Risque du remède selon le relecteur :** Lever le filtre de rôle fait échouer tests/chat-trace.test.cjs:15 et multiplie le volume de trace (un tour par passage) ; un extrait de réponse du modèle porté par error.message entrerait au journal, ce que seul un test de contrat avec contenu planté détecterait.

<a id="GAP1-04"></a>
#### GAP1-04 — La cause est détruite là où l'erreur est attrapée

**Verdict : nuancé** · priorité P1 · effort M · risque moyen · Complément : journal et diagnostic d'une panne

**Suite :** [T040](travail/tickets/040-serialize-errors-for-the-journal-with-their-cause-system.md) « Serialize errors for the journal with their cause, system code and a short stack ».

- **Où :** adapters/codex-rpc.cjs:62, 64, 68, 76 ; adapters/remote-media.cjs:42-45, 53, 60, 115 ; adapters/local-transcriber.cjs:89-97, 106-109 ; adapters/disk-guard.cjs:54-57 ; core/session.cjs:209, 502 ; adapters/chat-trace.cjs:13-34 ; server/main.cjs:47 ; docs/adr/0006-bloc-possede-des-son-admission-et-preparation-annulee-quand-sa-session-part.md:86
- **Preuve :** `.stack` n'est lu nulle part en production (grep : 0). `cause` est posé à 5 endroits de remote-media.cjs (« the cause stays on the error », :42) et n'est lu par aucun code de diagnostic ; sa seule lecture sert la politique de reprise (codex-perception.cjs:44). codex-rpc.cjs jette l'erreur de lancement (:62), le code et le signal de sortie (:64), la sortie d'erreur (:68) et `message.error` (:76) : le « fork rejected by pids controller » décrit dans deploy/tvlens.service:43-45 ne laisserait que « Connexion Codex interrompue. ». local-transcriber.cjs réduit un binaire absent à « Whisper local indisponible. » et un code de sortie à « Transcription locale échouée. », puis le tout à `{ text:'', failed:true }`. disk-guard.cjs:54 change une mesure impossible en `free = null`. session.cjs:209 et :502 remplacent l'erreur par une phrase fixe. `safeError` ne garde ni `status`, ni `cause`, ni `errno`/`syscall`, ni pile (essai node -e sur la copie : une erreur portant status, cause et stack rend `{name, message}`) ; `clean()` expurge jetons et URL mais laisse les chemins de l'hôte et le texte libre. server/main.cjs:47 n'écrit que `e.message`. L'ADR 0006:86 le dit lui-même : « l'assembleur n'a pas de journal ».
- **Impact :** Un défaut de programmation (TypeError) et une panne système (EMFILE, ENOSPC, EACCES) produisent la même phrase française : chaque diagnostic oblige à reproduire à la main. ADP-02 ne traite que la sortie d'erreur de Codex.
- **Nuance du relecteur (elle prime) :** Preuve exacte : .stack lu nulle part (grep 0), codex-rpc.cjs:62, 64, 68, 76, local-transcriber.cjs:89-97 et 106-109, disk-guard.cjs:54-57, session.cjs:209 et 502, safeError rend {name,message} pour une erreur portant status, cause et errno (rejoué sur la copie). Corrections. (1) Compteur : cause est posé à 4 sites d'appel de remote-media.cjs (45, 53, 60, 115) plus la définition (:43), et aussi dans codex-perception.cjs:177. (2) « clean() laisse les chemins de l'hôte » est faux pour les chemins longs : la règle [A-Za-z0-9_+/=-]{48,} (chat-trace.cjs:7) remplace tout chemin de 48 caractères sans point ni espace. Essai sur la copie : « open '/var/lib/tvlens/data/sessions/&lt;uuid>/session.json' » sort « open '/[opaque].json' ». Les chemins de session, ceux qu'un diagnostic disque veut lire, sont déjà détruits ; seuls les chemins courts passent. (3) Le point (1) de la remédiation est à refaire : safeError n'est pas réservé au journal. Il alimente job.errorDetail (runtime/conversation-runtime.cjs:65 vers deep-ask.cjs:141), publié dans l'état servi à la TV (tv/app/companion.js:144) et sauvegardé, et rejected.turnError (codex-session-client.cjs:616, 685). L'étendre avec stack, errno, syscall et cause met des piles et des chemins dans l'état public. De plus tests/chat-trace.test.cjs:18 exige e.stack === undefined pour une erreur sans status ni code, exactement le cas où la remédiation ajoute la pile, et le commentaire chat-trace.cjs:10-11 documente ce retrait. Forme cible : safeError inchangé, et un second sérialiseur réservé au journal, avec son propre nettoyage qui garde les chemins. (4) Point (3) : la sortie d'erreur de Codex est du texte libre que clean() n'expurge pas de ce qui est regardé, et local-transcriber.cjs:84 interdit déjà de garder le texte brut de Whisper. Garder exitCode et signal sans réserve ; la queue de stderr seulement réduite à des motifs connus.

<a id="GAP1-06"></a>
#### GAP1-06 — App Mac empaquetée : le « journal » des ADR est un console.error sans destinataire

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Complément : journal et diagnostic d'une panne

**Suite : pas de ticket.** Plafond de quatre tickets du thème journal atteint. Le puits fichier de l'app Mac se teste en chargeant app/main.cjs, donc avec l'aide mac-host que crée lot:L05 ; la perte de stderr sous open reste supposée. — _Reprise :_ Après L17-01 et lot:L05.

- **Où :** app/main.cjs:378, 549, 566 ; runtime/session-closing.cjs:126-131 ; scripts/open-mac.mjs:3-6 ; docs/adr/0002-archive-confirmee-avant-d-etre-annoncee.md:58 ; docs/adr/0007-fin-de-session-par-un-meme-protocole-sur-les-deux-hotes.md:19, 51
- **Preuve :** Le seul puits de l'hôte Mac est `console.error` (2 sites) ; aucun écrivain de fichier journal en production (grep `appendFile|createWriteStream` : seul adapters/embedding-store.cjs:31, pour l'index). L'app empaquetée est lancée par `/usr/bin/open -n … TVLens.app` sans redirection (open-mac.mjs). L'ADR 0002:58 dit : « Côté Mac, l'échec ne s'affiche pas dans la fenêtre : journal et état de la liste seulement » ; l'ADR 0007 fait du journal la sortie des fins incomplètes « sur les deux hôtes ». L'archivage à la fermeture neutralise son rejet (`archiveOnQuit?.()).catch(() => {})`, :566). La conséquence côté macOS (sortie d'erreur d'une app lancée par `open` non conservée) est déduite, pas observée.
- **Impact :** Sur le Mac, les décisions des ADR 0002, 0005 et 0007 qui « disent au journal » ne disent à personne. Une archive refusée à la fermeture ne se découvre qu'à la réouverture, comme session interrompue, sans cause.
- **Nuance du relecteur (elle prime) :** Preuve exacte : app/main.cjs:378, 549, 566 ; scripts/open-mac.mjs:3-6 ; ADR 0002:58, ADR 0007:19 et 51 ; seul appendFile de production dans embedding-store.cjs:31. La perte de stderr d'une app lancée par open reste supposée, comme le dit le constat. Corrections. (1) « Seul puits, 2 sites » : sur le même hôte s'ajoutent les écritures directes des adaptateurs (codex-session-client.cjs:55, chat-trace.cjs:42) et celle d'Electron pour les gestionnaires IPC. Conséquence pour le ticket : le fichier ne reçoit que ce qui passe par le port ; tant que GAP1-08 n'a pas migré les six lignes de confinement, elles restent perdues sur le Mac. Prérequis : GAP1-01, et GAP1-08 pour ces lignes. (2) Ligne 566 : l'échec est déjà dit par closeSession via log avant le rejet (archiveOnQuit passe par endSession, :390) ; le .catch n'avale qu'un refus déjà écrit, dans un puits sans lecteur. (3) « Entrée de menu » : app/main.cjs n'importe pas Menu (:12) et ne construit aucun menu ; il faut le créer, ou passer par un canal IPC et un bouton. L'emplacement d'usage sur macOS est app.getPath('logs') (~/Library/Logs/TVLens), à préférer à userData/logs. (4) Les tests qui chargent l'hôte comme script (mac-ipc-contract.test.cjs:166-169, architecture-f07.test.cjs:248-252, architecture-f05.test.cjs:653-656) n'ont pas d'option à qui passer un puits : ils substituent le module du puits par Module._load, comme ils le font pour electron.
- **Remède proposé par l'audit :** `adapters/journal-file.cjs` : `fileSink({ dir, maxBytes: 1_000_000, files: 2 })`, ajout synchrone d'une ligne, mode 0600, bascule `tvlens.log` vers `tvlens.1.log` au dépassement ; une écriture qui échoue est comptée par le puits (`dropped`) et ne remonte jamais. Composé dans app/main.cjs sur `path.join(app.getPath('userData'), 'logs')` ; hors paquet (`!app.isPackaged`) le puits stderr s'y ajoute. Une entrée de menu « Afficher le journal » (`shell.showItemInFolder`) donne l'accès. Le même puits sert au serveur lancé hors systemd.
- **Risque du remède selon le relecteur :** Une écriture synchrone dans le processus principal et une bascule mal bornée peuvent geler l'interface ou remplir le disque ; les tests du puits (bascule, mode 0600, écriture refusée) sont à écrire, et les tests qui chargent app/main.cjs écriraient un vrai fichier si le puits n'est pas substitué.

<a id="GAP3-03"></a>
#### GAP3-03 — Aucune partie ne publie sa version ni ses capacités

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Complément : contrat de fil entre parties déployées

**Suite :** [T044](travail/tickets/044-publish-the-server-version-and-capabilities-in-the-session.md) « Publish the server version and capabilities in the session answer ».

- **Où :** server/http.cjs:82-95, :44-46, :32 ; runtime/headless-runtime.cjs:30, :250, :455, :1149 ; package.json:3 ; tv/app/appinfo.json:3, :9 ; tv/app/appinfo.ambient.json:3 ; mcp/server.cjs:21 ; adapters/codex-session-client.cjs:334 ; prototypes/lg-remote/runtime/magic_mapper_runtime.py:10 ; tv/app/remote-client.js:28-34 ; tv/transport.py:45-46
- **Preuve :** Observé sur un RemoteServer à runtime factice : GET /v1/session sans session répond `{}`, aucun en-tête de version, seul ETag est exposé, le preflight n'autorise que Authorization, Content-Type et If-None-Match. La seule identité du serveur est `boot`, 4 octets aléatoires dans l'ETag (:250, :455). Six numéros sans lien (0.1.0, 0.0.4, 0.1.0, 0.2.0, 0.3.0, RUNTIME_VERSION 0.3.0) ; aucun code ne lit la version de package.json ni d'appinfo.json ; `uiRevision: 3` n'est lu par personne (grep : 0). Les clients n'envoient qu'Authorization et Content-Type. VIEWS est exporté mais pas publié.
- **Impact :** Ni les journaux ni l'écran ne disent quelles versions se parlent. Chaque nouvelle fonction ajoute une heuristique de plus. Un diagnostic de versions mélangées demande un accès au VPS et à la TV.
- **Nuance du relecteur (elle prime) :** Vrai pour le serveur /v1 et le panneau : lignes exactes, six numéros confirmés, uiRevision lu par personne, GET /v1/session sans identité. Faux tel que formulé pour les pièces de la TV, qui publient déjà des marqueurs : paramètres de lancement `v:1` refusés sinon (tv/ambient.py:837, tv/app/surveillance-overlay.js:370) ; porte, état et fichier des vus en `v:2` (ambient.py:176, :208, :1005 ; controller.py:188) ; `gate:1` dans le rapport de capture, lu par le superviseur (capture.py:119, ambient.py:698) ; `panelYield` et RUNTIME_VERSION dans le status.json du mapper (ambient.py:776 ; prototypes/lg-remote/runtime/managed_mapper.py:111) ; `supported:true` (controller.py:119). tv/version.py doit s'aligner sur ces marqueurs au lieu d'en créer un jeu parallèle. Deux points de la remédiation à corriger : RemoteClient sert aussi le contrôleur local (companion.js:594, capture-control.js:23), dont le preflight n'autorise qu'Authorization et Content-Type (controller.py:280), donc tout en-tête client se décide par instance ; et lire `boot` en découpant l'ETag (headless-runtime.cjs:455) fait d'un validateur opaque un contrat : publier `boot` comme champ additif des vues d'état.

<a id="GAP3-06"></a>
#### GAP3-06 — Un pair plus ancien est reconnu par un 404 ambigu, parfois sans retour

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Complément : contrat de fil entre parties déployées

**Suite : pas de ticket.** Suppose les capacités publiées (L17-09) et les codes de GAP3-04 ; change un comportement affirmé par test (legacy collant, tests/tv-panel.test.cjs:132-137) et modifie le client TV. — _Reprise :_ Après L17-09 et le ticket de GAP3-04.

- **Où :** tv/app/companion.js:240-245, :267-274, :711-730 ; tv/app/sessions-view.js:258-264, :520-524 ; tv/app/surveillance-view.js:131-134, :444-449 ; tv/ambient.py:517-520 ; tv/controller.py:16-19, :298, :303, :313, :319, :337 ; server/http.cjs:152, :274 ; runtime/headless-runtime.cjs:225, :915
- **Preuve :** Sept détecteurs : (1) 404 ou regex sur une vue → `legacy = true`, seule affectation à companion.js:269, jamais remise à faux : l'état complet (plus de 2 Mo à deux heures, server-state-views.test.cjs:65) reste la ressource lue jusqu'au rechargement du panneau, même après mise à jour du serveur ; (2)(3) 404 sur /ambient → `ambientKnown = false`, tell() muet jusqu'à la prochaine lecture réussie de GET /ambient ; (4) 404 sur GET /v1/sessions ; (5) bloc `surveillance` absent ; (6) GET /ambient en 404 ou `supported` différent de true ; (7) ambient.py : 404 sur l'overlay → server-unsupported. S'y ajoute la lecture d'anciens rapports de capture par `/\b409\b/` et `/\b507\b/` sur le texte de la dernière erreur (sessions-view.js:260-264), troisième génération du même signal après stopReason et connection. Sur le contrôleur, un 404 sous /ambient a quatre causes : route absente d'un contrôleur plus ancien, module ambient qui n'a pas pu être importé (controller.py:18-19 puis :303), chemin ou valeur inconnus (:313), nonce non accordé (:298). Sur le serveur, 404 désigne « Route inconnue. » (2 endroits, sans code) et « introuvable » (code not-found).
- **Impact :** « À mettre à jour » s'affiche pour une installation cassée. Une faute de frappe dans un chemin d'une future version coupe une fonction sans bruit. Personne ne peut supprimer un détecteur, faute de plancher connu.
- **Nuance du relecteur (elle prime) :** Les sept détecteurs et leurs lignes sont exacts, ainsi que les quatre causes d'un 404 sous /ambient. Trois précisions. (1) `legacy` collant est un choix voulu et testé (« for good », tests/tv-panel.test.cjs:132-137 ; commentaire companion.js:251) : le changer modifie un comportement affirmé. Le mécanisme `viewsAfter` (companion.js:253-272) permet déjà un nouvel essai borné, plus simple que de suivre `boot`. (2) L'inventaire oublie les détecteurs qui ne passent pas par un 404 et sont déjà des capacités publiées : `gate:1` (ambient.py:698, :781, capture-not-gated), `panelYield` (:776, panel-outdated), fichier des vus sans sessions (:630). (3) Le contrôleur ne publie pas son pid (status(), controller.py:34-41 et :112-120) : « quand le contrôleur change de pid » suppose de l'ajouter. tests/test_tv_ambient.py:985-991 affirme `(404, {})` exactement et devra changer avec les codes.
- **Remède proposé par l'audit :** tv/app/server-profile.js : `profileOf(réponse de GET /v1/session)` rend {views, etag, sessions, surveillance, overlay} à partir de `server.capabilities` ; l'inférence par 404, regex ou champ absent y est regroupée et ne sert que si `server` est absent. `legacy` et `ambientKnown` sont recalculés quand la partie `boot` de l'ETag change ou quand le contrôleur change de pid, au lieu de rester collés. Contrôleur : GET /capture et GET /ambient publient `controller: {version, capabilities: [capture, panel, ambient, ambient-seen-session], ambientError}` ; ses 404 portent `code` : route-unknown, ambient-unavailable ou not-granted. Serveur : le 404 de route porte route-unknown (GAP3-04).
- **Risque du remède selon le relecteur :** Un profil mal déduit masque une fonction disponible ou relit l'état complet de plusieurs mégaoctets chaque seconde ; le détecteraient tests/tv-panel.test.cjs:90-143 (à réécrire pour un état non collant) et un cas « serveur sans bloc server » dans le test de contrat.

<a id="GAP3-07"></a>
#### GAP3-07 — Le texte français publié sert de donnée à la TV

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Complément : contrat de fil entre parties déployées

**Suite : pas de ticket.** Arbitrage A6 : la rédaction française ne se déplace pas dans ce lot. Seul l'ajout de backlog à overlay() est additif, et il n'a de sens qu'avec le client TV qui le lit. — _Reprise :_ Après L17-03, avant le lot qui porte CORE-15 et SEC-01.

- **Où :** tv/app/surveillance-overlay.js:127-141, :153 ; tv/app/surveillance-view.js:77-80, :141-142 ; core/surveillance.cjs:860-870, :887, :890 ; runtime/headless-runtime.cjs:26-27, :588-606 ; tv/transport.py:19-20 ; app/main.cjs:394 ; 13 affichages de error.message dans tv/app
- **Preuve :** shortActivity (surveillance-overlay.js:127-141) applique 7 regex aux phrases construites à core/surveillance.cjs:862-869 pour en extraire les nombres ; :153 teste `/retard|échec|plein|rétablie/i` pour décider d'ajouter « en retard » ; surveillance-view.js:79 en ajoute une. La donnée structurée existe (`backlog.reason`, claimsWaiting, passagesPending, passagesFailed, surveillance.cjs:890) et l'interface Mac s'en sert (app/ui/surveillance-view.mjs:140-150), mais overlay() publie `activity` sans `backlog` (headless-runtime.cjs:588-606). Sur les 7 phrases, 3 ne sont affirmées par aucun test du cœur ou du serveur (grep de fragments, approximatif : « Vérifications en retard », « Lecture en retard », « Lecture des nouveaux passages »). La phrase READ_ONLY est recopiée à l'identique dans transport.py:20, headless-runtime.cjs:27 et app/main.cjs:394. Le panneau affiche le message du serveur tel quel à 13 endroits (capture-control.js:70 ; companion.js:591, :1031 ; sessions-view.js:449, :524, :653 ; timeline-view.js:77, :112, :113, :384 ; surveillance-view.js:920, :1003, :1108).
- **Impact :** CORE-15 (rédaction déplacée dans une projection, `{code, counts}` stockés) change ces phrases : sur une TV non mise à jour la pastille de 440 px reçoit la phrase longue (shortActivity rend une phrase inconnue entière) ou double « en retard ». SEC-01 remplacerait par un message générique des phrases que la TV montre au spectateur.
- **Nuance du relecteur (elle prime) :** 7 regex dans shortActivity, 13 affichages de error.message et triple copie de READ_ONLY confirmés ; overlay() ne publie pas `backlog`. Portée inexacte sur deux points. Panneau ouvert : `backlog` arrive déjà dans l'état (vue brève, core/surveillance.cjs:890, conservé à :904) et tv/app/surveillance-view.js:166-191 compose déjà ses alertes depuis backlog.reason ; seule la pastille (surveillance-overlay.js:127-160) passe par les regex, sans aucun changement serveur requis pour ce chemin. Panneau fermé : publier `backlog` dans overlay() ne suffit pas, car tv/ambient.py:839 ne relaie que label, waiting et late, et parseAmbientParams (surveillance-overlay.js:382-384) ne reconstruit que ces trois champs. Deux pièces TV de plus à modifier (superviseur Python et IPK ambiante), que la remédiation ne liste pas. tests/server-surveillance.test.cjs:109 affirme la liste exacte des clés de l'overlay.
- **Remède proposé par l'audit :** (1) Additif : overlay() publie `backlog: {reason, claimsWaiting, passagesPending, passagesFailed}`. (2) Nouvelle TV : describePill compose la pastille depuis `backlog.reason` et ses nombres, comme surveillance-view.mjs ; les regex ne servent plus que si `backlog` est absent. (3) La projection de CORE-15 continue de produire, pour `activity.label` sur le fil, les 7 phrases actuelles jusqu'au relèvement du plancher : tests/fixtures/wire-v1/activity-labels.json, produit par un test du cœur et consommé par le test de l'overlay TV. (4) Les refus connus gardent leur phrase française dans `error` (contrat d'affichage) ; seul le message des erreurs non classées devient générique (SEC-01).
- **Risque du remède selon le relecteur :** La pastille panneau fermé peut doubler la cause ou ne rien afficher si `backlog` traverse ambient.py sans passer parseAmbientParams ; le détectent tests/tv-ambient-params.test.cjs, tests/tv-overlay-queue.test.cjs:187-205 et tests/server-surveillance.test.cjs:109.

<a id="GAP3-08"></a>
#### GAP3-08 — Les champs lus par la TV ne sont déclarés nulle part ; trois formes d'état réconciliées par présence de champ

**Verdict : nuancé** · priorité P2 · effort L · risque moyen · Complément : contrat de fil entre parties déployées

**Suite : pas de ticket.** Effort L selon le relecteur (trois projections, déclaration de clés, vérification des deux côtés) et renversement d'un choix écrit sur lightJob : plusieurs sessions. — _Reprise :_ Après L17-03 et L17-09, avant le lot qui porte CORE-08 et CORE-15 ; à découper en trois tickets.

- **Où :** runtime/headless-runtime.cjs:40-60, :85-136, :457-480, :547-586, :588-606 ; core/surveillance.cjs:885 ; tv/app/companion.js:329-360, :857-858, :881-882, :1082-1086 ; tv/app/timeline-view.js:178 ; tests/server-state-views.test.cjs:61-98
- **Preuve :** L'état complet est `session.watch.snapshot()`, qui est aussi le format disque (CORE-08), sous 11 clés de premier niveau. Les vues chat (8 clés, affirmées à server-state-views.test.cjs:68) et panel en sont deux autres formes. L'en-tête est une liste d'autorisation de 17 champs (HEADER, :42-60) ; lightJob est l'inverse : il retire 10 champs, en réduit 2 et publie tout le reste (`...rest`, :102-118), donc tout champ ajouté plus tard à une question. La TV réconcilie par présence : `s.unavailableIds ? … : …` (companion.js:881), `s.gapCount !== undefined` (:1082), `state.captureGapCount !== undefined` (:1084), `tvlensFinite(state.serverNowMs)` (:857), `history` lu seulement dans l'état complet (timeline-view.js:178). Le bloc surveillance porte `version: 1` (surveillance.cjs:885), version du format disque visible sur le fil.
- **Impact :** CORE-08 (toArchive et fromArchive séparés de snapshot) et CORE-15 ne peuvent pas savoir quels champs la TV fige. Un champ ajouté à une question part vers la TV par défaut.
- **Nuance du relecteur (elle prime) :** Compteurs exacts : 11 clés de l'état complet, 8 de la vue chat, HEADER à 17 champs, lightJob qui retire 10 champs et en réduit 2 ; les lectures par présence côté TV sont aux lignes citées. Précision qui change la remédiation : la liste de refus de lightJob est un choix écrit (headless-runtime.cjs:99-101, « whatever a later change adds to a job »), inverse assumé de celui de HEADER (:40-41). Passer lightJob en liste d'autorisation renverse cette décision et exige d'abord la mesure par Proxy des champs lus, qui ne couvre que les branches exercées par les cas. Découpage conseillé : keys.json et test des deux côtés d'abord (effort M), projections runtime/wire/ ensuite. La priorité monte à P1 dès que CORE-08 ou CORE-15 sont planifiés.
- **Remède proposé par l'audit :** runtime/wire/ : session-wire.cjs (GET /v1/session), state-views.cjs (chat, panel, état complet de compatibilité), overlay-wire.cjs ; chacune est une projection pure à liste d'autorisation, lightJob comprise. runtime/wire/keys.json déclare les clés de chaque forme (requises, facultatives). Vérification des deux côtés : (a) serveur : clés produites incluses dans la déclaration et clés requises présentes, à la place des listes littérales de server-state-views.test.cjs:61-98 ; (b) TV : dans wire-contract.test.cjs, le cas est enveloppé dans un Proxy qui note les chemins lus par describeJob, describeSurveillance, describeSessions, mergeState et describeCapture, et le test échoue si un chemin lu n'est pas déclaré. La liste « lu par la TV » devient mesurée. L'état sans `view` est déclaré « compatibilité seulement » : plus aucun champ nouveau. Le format disque peut ensuite changer derrière les projections.
- **Risque du remède selon le relecteur :** Une liste d'autorisation incomplète retire d'une carte un champ lu seulement dans une branche non couverte (erreur, délai, annulation) ; le test par Proxy ne le détecte que si les cas couvrent chaque statut de question, sinon rien avant l'écran.

<a id="GAP3-09"></a>
#### GAP3-09 — « Ajouts seulement » déjà pratiqué mais non écrit, et contredit par deux remèdes proposés

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Complément : contrat de fil entre parties déployées

**Suite : pas de ticket.** La règle « ajouts seulement » est écrite par L17-03 ; reste la table de routes, qui refond handle() dans server/http.cjs pendant que L17-04 et L17-09 y écrivent. — _Reprise :_ Après L17-09, avant ADP-10 et TV-06.

- **Où :** server/http.cjs:81-106, :181-220, :189-193 ; tv/capture.py:218-219 ; adapters/remote-media.cjs:11-25, :29-37 ; tv/controller.py:174-189, :247-255 ; tv/app/companion.js:588, :683 ; tv/app/remote-client.js:166-168
- **Preuve :** Les 23 routes sont des `if` dans une fonction de 265 lignes, sans table. Deux chemins font la même chose avec deux réponses (`/v1/session/end` → `{ended:true,…}`, `/v1/sessions/close` → `{closed:true,…}`), appelés par le même panneau (companion.js:683, remote-client.js:167). Quatre routes n'ont aucun client dans tv/ ni prototypes/ : GET /v1/surveillance, GET /v1/storage, GET /v1/media/…, POST /v1/surveillance/retry (grep : 0 ; appelants : tests et scripts). POST /v1/settings/transcription est appelé par le panneau (companion.js:588) et par aucun test (grep dans tests/ : 0). L'ajout côté client existe déjà : capture.py:218-219 (« an older server ignores it ») et le contrôleur garde la forme sans session de /ambient/seen pour un panneau antérieur (controller.py:174-180). ADP-10 propose des schémas zod `.strict()` par route : un schéma strict refuse exactement ce genre d'ajout venu d'une TV mise à jour avant le serveur. TV-06 propose des « méthodes nommées côté serveur ».
- **Impact :** Un schéma strict ou un renommage de chemin est une rupture qu'aucune des deux suites ne voit.
- **Nuance du relecteur (elle prime) :** Faits exacts : 23 routes (motif open|resume|delete compté une fois ; handle() fait 266 lignes), deux alias end/close appelés par le même panneau, 4 routes sans client dans tv/ ni prototypes/, POST /v1/settings/transcription sans test HTTP (tests/transcription-language.test.cjs:15 appelle le runtime directement), ajout client déjà pratiqué (capture.py:218-219, controller.py:174-180). Une seule contradiction est établie, celle d'ADP-10 (.strict()). TV-06 ne propose pas de renommer des chemins : « méthodes nommées côté serveur » y désigne les méthodes du client pour les routes du serveur (routes en dur hors RemoteClient). Le test « chaque littéral /v1/ existe dans la table » ne voit que des préfixes pour les trois routes composées (remote-client.js:105, :119, :162) : prévoir une correspondance par motif.
- **Remède proposé par l'audit :** server/routes.cjs : table `[{method, path ou pattern, handler, bodyLimit, clients: [panel, capture, ambient, scripts]}]` parcourue par http.cjs, sans changer un seul chemin. Deux tests : chaque ligne est atteinte par au moins un test HTTP (ferme le trou de settings/transcription) ; chaque littéral « /v1/… » trouvé dans tv/app/*.js et tv/*.py existe dans la table. Le tableau de l'ADR (GAP3-01) est produit depuis cette table. Schémas d'ADP-10 : stricts sur le type des clés connues, clés inconnues retirées (comportement par défaut de z.object), jamais `.strict()` sur une entrée du fil ; `.strict()` reste valable pour l'IPC, livré dans le même paquet. TV-06 : ControlClient et méthodes nommées restent côté client ; les deux alias demeurent jusqu'au relèvement du plancher ; les 4 routes sans client déployé sont marquées `clients: [scripts]` et restent libres d'évoluer.
- **Risque du remède selon le relecteur :** Une table de routes qui change l'ordre d'évaluation peut faire répondre 415 ou 413 là où une route inconnue répondait 404, ou confondre deux motifs ; le détectent tests/remote-server.test.cjs et les tests server-*, plus le nouveau test « chaque ligne atteinte ».

<a id="GAP2-04"></a>
#### GAP2-04 — Registre de surveillance : version vérifiée à l'activation, ignorée en silence à la réouverture

**Verdict : nuancé** · priorité P2 · effort S · risque faible · Complément : formats écrits sur disque

**Suite :** [T043](travail/tickets/043-name-the-surveillance-registry-version-and-report-an-unknown.md) « Name the surveillance registry version and report an unknown one when reopened ».

- **Où :** core/surveillance.cjs:518-563, :885 ; runtime/surveillance-runtime.cjs:106-126, :320-331, :341-349, :502-513 ; app/main.cjs:447 ; runtime/headless-runtime.cjs:1012
- **Preuve :** Le littéral `1` figure à trois endroits sans constante (surveillance.cjs:521 et :885, surveillance-runtime.cjs:345). À l'activation, un registre d'une autre version passe par `unread` : « Registre existant illisible », fichier intact, écriture bloquée. À la réouverture, `restore(saved)` (:502) se fie à `restorable`, qui vaut vrai dès que le cœur ne lève pas ; or le cœur ignore sans lever tout registre dont la version n'est pas 1 (sonde : version 2 ou absente rend restored false, sessionId null, 0 affirmation). `registry()` rend alors `status: 'ready', persisted: true` (:111-112) : l'archive s'affiche sans surveillance et sans message. Le Mac vérifie `sessionId === id` avant de passer le registre (:447), le serveur non (:1012). La « version 1 » couvre déjà au moins deux formes : sept champs de passage ajoutés depuis sont lus par défaut (:547-549), et tests/surveillance.test.cjs:781 fabrique l'ancienne en les retirant de la sortie courante.
- **Impact :** Le seul format versionné donne deux réponses selon le chemin. Le jour où CORE-07 ou CORE-15 passe le registre en version 2, une version antérieure du produit affichera « aucune surveillance » sur ces archives au lieu de dire qu'elle ne sait pas les lire. Le fichier reste toutefois protégé par le chemin d'activation.
- **Nuance du relecteur (elle prime) :** Preuve vérifiée : trois littéraux (core/surveillance.cjs:521, :885 ; runtime/surveillance-runtime.cjs:345) ; sonde : version 2 ou absente rend restored false, sessionId null, 0 affirmation, sans exception ; registry() rend alors ready et persisted true (:111-112, :129) ; le Mac contrôle l'identité (app/main.cjs:447), le serveur non (runtime/headless-runtime.cjs:1012). Corrections : (1) « Le seul format versionné » est faux : le manifeste porte version 1 (jamais comparée) et trois fichiers côté TV portent `v: 2`, dont un contrôlé strictement (tv/ambient.py:176). (2) registry() tire son identifiant de surveillance.sessionId (:107), nul après un refus, et unbind() (:281-288) remet `unreadable` à zéro : « marquer la session unreadable » exige que registry() utilise l'identifiant passé à restore(saved, sessionId). (3) Un surveillance.json qui ne se parse pas arrive déjà nul par library.read (adapters/session-library.cjs:135) : il reste vide en silence tant que read() ne distingue pas absent et illisible (GAP2-03). Le prérequis « aucun » ne vaut donc que pour le cas de version. (4) La règle de version doit compter une nouvelle valeur d'énumération comme un changement : restore saute sans rien dire une affirmation de statut inconnu ou un passage de bucket inconnu (:527, :546), et l'activation suivante réécrit le registre sans eux (surveillance-runtime.cjs:354-359). (5) Le code donne des valeurs par défaut à 8 champs de passage (:548-549, `overflow` compris) ; le test en retire 7.

<a id="GAP2-06"></a>
#### GAP2-06 — session.json : 28 clés écrites, 9 relues ; le contrat de lecture n'est écrit nulle part

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Complément : formats écrits sur disque

**Suite : pas de ticket.** Le relecteur le rattache au ticket qui réalise CORE-08 (toArchive et fromArchive séparés de snapshot) : le faire ici doublerait ce lot. — _Reprise :_ Avec le lot qui porte CORE-08, après L17-02 et le ticket de GAP2-03.

- **Où :** core/session.cjs:426-476 (restore), :477-493 (snapshot), :495-502 (persist) ; adapters/session-library.cjs:24-25, :42-46, :94 ; runtime/session-runtime.cjs:235, :343-374
- **Preuve :** Mesuré sur un WatchSession neuf : snapshot() rend 28 clés de premier niveau et `archive.save(this.snapshot())` les écrit toutes. La lecture en consomme 9 : id, retention, coverage, history, segments, questions, apiCalls, apiCost (restore) et elapsedMs (horloge, bibliothèque). Les 19 autres sont dérivées ou propres au processus : accepting, asking, analyzing, capturedThroughMs, analyzedThroughMs, analysisLagMs, contextThroughMs, gaps, retentionMs, readOnly, unplacedMedia, pending, audioPending, visionPending, lastError, latency, audioGaps, visionGaps, storage (l'espace libre de l'hôte à l'instant de la sauvegarde). Un passage porte une trentaine de champs (9 posés à l'ingestion, core/session.cjs:101, 21 autres affectés ensuite). Des phrases françaises sont persistées comme données (INTERRUPTED, core/session.cjs:6, dans `error`, `audioError`, `visionError`).
- **Impact :** Complète CORE-08 par les chiffres : tout changement de la projection publiée (CORE-06, CORE-20) change les octets de session.json sans changer ce qui est relu, donc un test d'archive qui comparerait le fichier réécrit serait rouge pour de mauvaises raisons, et un test qui ne compare rien laisserait passer la perte d'une des 9 clés. La fixture doit donc figer les fichiers d'origine et comparer des projections après relecture, pas les fichiers réécrits.
- **Nuance du relecteur (elle prime) :** Chiffres vérifiés par sonde : snapshot() rend 28 clés ; la lecture en consomme 9 (restore, core/session.cjs:428-474 ; elapsedMs en runtime/session-runtime.cjs:235 et adapters/session-library.cjs:46, :108) ; le seul lecteur de session.json en production est session-library.cjs:90 ; un passage reçoit 9 champs à l'ingestion (:101) et 21 autres ensuite (compte retrouvé par grep). Correction : `retentionMs` n'est ni dérivée ni propre au processus. C'est la durée de la fenêtre glissante de la session, écrite et aujourd'hui non relue, ce que la note de livraison range dans les limites connues (docs/night-features-delivery.md:231, « prend la fenêtre de l'hôte qui la reprend ») ; `retention: 'rolling'` n'en garde que le genre. toArchive() doit la conserver (10 clés), ou l'ADR doit dire qu'elle est abandonnée, sinon la limite devient irréparable pour toute archive écrite ensuite. À noter aussi : après restore, le snapshot réécrit `retention` d'après l'hôte (sonde : `pinned` devient `until-deleted`). Neuf fichiers de test lisent session.json sur disque, surtout `segments` : la forme réduite ne devrait pas les casser (lu, non lancé).
- **Remède proposé par l'audit :** Dans le ticket qui réalise CORE-08 : `toArchive()` écrit `{ format: 'tvlens-session-state', version: 1, id, elapsedMs, retention, coverage, history, segments, questions, apiCalls, apiCost }` ; `fromArchive(saved)` accepte la forme sans version (les 28 clés actuelles, 19 ignorées) et la forme versionnée ; `snapshot()` ne sert plus qu'à la publication. expected.json de GAP2-01 liste, par passage, les champs dont la relecture dépend. CORE-05 doit dire ce que deviennent les `questions` des archives existantes (gardées et relues, ou abandonnées par décision écrite) : la fixture ancienne en contient pour forcer le choix. CORE-15 lit les anciennes phrases comme des codes.
- **Risque du remède selon le relecteur :** Une clé tenue pour dérivée peut être une donnée de session ou être lue par un test dans le fichier, et disparaître des nouvelles archives ; la fixture et les neuf fichiers de test qui lisent session.json le détecteraient, sauf pour `retentionMs` qu'aucun test ne relit.

<a id="GAP2-07"></a>
#### GAP2-07 — Le dossier de session n'est décrit nulle part en entier : liste FILES inexacte, format retiré encore lu, cache hors liste

**Verdict : nuancé** · priorité P2 · effort S · risque faible · Complément : formats écrits sur disque

**Suite : pas de ticket.** Effort M selon le relecteur : retirer auto.json oblige à adapter tests/session-delete.test.cjs:90 (seul appelant de saveAuto), donc un ticket supprime_tests à part, et le descripteur de dossier touche adapters/local-store.cjs que d'autres lots refondent. Le plafond du thème formats sur disque n'est pas atteint (deux tickets sur quatre) : le retrait de auto seul reste écrivable dans ce lot. — _Reprise :_ Après L17-02, avant le lot qui refond adapters/local-store.cjs ; le retrait de auto.json peut partir seul.

- **Où :** adapters/local-store.cjs:5-8, :143-149, :188 ; adapters/session-library.cjs:135-140 ; runtime/session-runtime.cjs:126-131 ; adapters/embedding-store.cjs:3-17 ; app/main.cjs:212 ; tests/mac-ipc-contract.test.cjs:103
- **Preuve :** Le commentaire de la ligne 5 dit qu'un nom hors de FILES n'est jamais lu ni écrit ; le même dossier reçoit pourtant embeddings.json (session-runtime.cjs:128), media/ et thumbs/. auto.json : `saveAuto` n'a aucun appelant en production (le test mac-ipc-contract:103 exige même son absence de l'hôte Mac), mais library.read le lit à chaque ouverture (:137) et rend `archive.auto`, que personne ne consomme. living-recap.json n'est écrit que par l'hôte Mac (app/main.cjs:212 ; aucun `recap` dans headless-runtime.cjs). embeddings.json est un journal ligne par ligne sous extension .json, invalidé en bloc quand le modèle change (:10) puis réécrit entièrement (:32-34). deep-answers.json et living-recap.json n'ont ni version ni format ; chaque job porte son `sessionId`, le fichier non.
- **Impact :** Qui veut savoir ce qu'une session contient doit lire cinq fichiers de code. Un ticket qui touche le store ne sait pas quels noms relèvent de l'état (à préserver) ou du cache (reconstructible), ni lesquels dépendent de l'hôte ; l'ancien auto.json reste lu pour rien à chaque ouverture.
- **Nuance du relecteur (elle prime) :** Preuve vérifiée : commentaire de adapters/local-store.cjs:5 ; saveAuto n'a qu'un appelant, tests/session-delete.test.cjs:90 ; `auto` est lu en adapters/session-library.cjs:137 et consommé nulle part ; living-recap.json n'est écrit que par app/main.cjs:212 (aucun `recap` dans runtime/headless-runtime.cjs) ; embeddings.json est un journal réécrit en bloc (adapters/embedding-store.cjs:10, :32-34). Corrections : (1) Effort M plutôt que S : le test d'architecture « aucun autre module ne construit un chemin dans un dossier de session » oblige à faire passer derrière le store deux constructions de runtime/session-runtime.cjs (:112-114 pour thumbs/ et thumbnails/, :127-130 pour embeddings.json). (2) Les colonnes `writer`, `reader`, `hosts` dans un adaptateur lui font connaître ses hôtes : les garder dans la documentation ou dans runtime/. La documentation est de la prose et ne « dérive » pas mécaniquement du descripteur. (3) Le retrait de `auto` ne dépend pas de GAP2-01 et peut partir seul.
- **Remède proposé par l'audit :** Un descripteur unique `SESSION_LAYOUT` dans adapters/local-store.cjs : pour chaque nom, `{ kind: 'state' | 'cache' | 'media', writer, reader, versioned, hosts }`, embeddings.json, media/ et thumbs/ compris ; `FILES`, l'inventaire, `treeBytes` et la documentation (docs/architecture.md:39) en dérivent ; un test d'architecture vérifie qu'aucun autre module ne construit un chemin dans un dossier de session. `auto` retiré de FILES, de `saveAuto` et de library.read ; les auto.json existants restent sur le disque et partent avec la suppression de la session. embeddings.json déclaré cache dans l'ADR de GAP2-05 : hors garantie de relecture, jamais renommé (un renommage serait une génération de plus).
- **Risque du remède selon le relecteur :** Déplacer la construction des chemins de miniatures et d'embeddings peut changer l'endroit où les fichiers atterrissent ; tests/session-durable.test.cjs:100 (liste de thumbs/), tests/moment-index.test.cjs:478-520 et tests/session-delete.test.cjs:87-94 le détecteraient.

<a id="GAP2-08"></a>
#### GAP2-08 — Hors session : neuf fichiers sans version, quatre politiques de lecture, écritures non atomiques, chemins absolus mis en cache

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Complément : formats écrits sur disque

**Suite : pas de ticket.** À coordonner avec ADP-03, ADP-09, ADP-16 et CORE-19 selon le relecteur ; la règle « défaut si invalide » appliquée au compteur de budget lèverait le plafond de dépense, ce qui demande une décision. — _Reprise :_ Dans le lot des adaptateurs de réglages, après L17-01 (la règle écrit une ligne au journal de l'hôte).

- **Où :** adapters/config.cjs:8, :13-23, :34, :41-45 ; adapters/model-settings.cjs:16-17 ; adapters/transcription-settings.cjs:5-8 ; adapters/viewing-settings.cjs:4-5 ; adapters/trial-budget.cjs:16-25, :46 ; app/main.cjs:73-76, :98, :224, :272-273, :287-288 ; server/main.cjs:26-27, :32-34
- **Preuve :** provider.enc, models.json, viewing-settings.json, last-source.json, transcription.json, research-budget.json, saved.json, verifications/*.json, device-token : aucun ne porte de version. Lecture : (1) contenu invalide = exception non rattrapée au démarrage (models.json sur les deux hôtes, transcription.json sur le serveur ; un models.json sans l'une des trois clés suffit) ; (2) tout avalé, valeur par défaut, contenu rendu sans validation (viewing-settings.json:4 ; last-source.json) ; (3) entrée illisible sautée en silence (saved.json) ; (4) conversion en place et sans retour : `trackingOnly` pose `limitUsd: null` et `previousLimitUsd` (trial-budget.cjs:19-20). Trois écritures directes sans fichier temporaire : viewing-settings.json:5, last-source.json (app/main.cjs:288), device-token (server/main.cjs:27) ; les autres font tmp puis rename. Lire le compteur l'écrit : `snapshot()` passe par `transaction`, qui réécrit toujours le fichier (:23-24, :46), à chaque appel `deep:budget`. provider.enc enregistre l'objet `result` entier, dont des chemins absolus résolus à l'import (researchBudgetFile, budgetFile, whisperBinary, ffmpeg, codexAuthHome), et il est réécrit à chaque démarrage avec fichier de configuration (:34).
- **Impact :** Chaque nouveau réglage choisit sa politique au hasard des précédents ; un fichier de réglage d'une autre version arrête un hôte au démarrage ou est ignoré sans trace selon son nom. Scénario supposé, non reproduit : une configuration importée depuis un worktree laisse dans provider.enc un chemin de compteur et, par dérivation (session-runtime.cjs:150-158), un chemin de modèle Whisper qui pointent vers un dossier supprimé depuis.
- **Nuance du relecteur (elle prime) :** Fond vérifié : neuf fichiers sans version ; models.json lève hors ENOENT (adapters/model-settings.cjs:9, :16) sur les deux hôtes (app/main.cjs:74, server/main.cjs:34) ; transcription.json sur le serveur (:33) ; viewing-settings.json et last-source.json avalent tout ; snapshot() réécrit le compteur (adapters/trial-budget.cjs:23-24, :46). Corrections : (1) Quatre écritures directes, pas trois : provider.enc (adapters/config.cjs:34) est écrit sans fichier temporaire, et c'est lui qui porte la clé. (2) Une politique manque à la liste : models.json est réécrit à chaque démarrage du Mac (app/main.cjs:75-76), avec conversion muette et clés inconnues retirées ; voir oublis. (3) « Défaut si invalide » ne doit pas s'appliquer au compteur : l'arrêt est voulu (trial-budget.cjs:17, « appels suspendus »), une valeur par défaut remettrait spentUsd à zéro. La conversion en suivi seul est voulue et testée (tests/budget.test.cjs:29-30). Un snapshot() sans écriture est compatible avec les 3 tests (lu, non lancé). (4) provider.enc ne peut pas se limiter à « clé, modèle, interrupteurs » : l'app empaquetée ouverte depuis le Finder n'a ni fichier ni environnement (config.cjs:24-27, :39-45 ; tests/review-regressions.test.cjs:215-229). Conserver les variables importées (TVLENS_USAGE_DIR, TVLENS_WHISPER_*, TVLENS_FFMPEG, TVLENS_CODEX_AUTH_HOME) comme switchEnv et dériver les chemins à chaque démarrage ; aucun test ne couvre ces chemins au démarrage sans fichier. (5) tests/fixtures/user-data/ : provider.enc est chiffré par safeStorage, donc non reproductible hors de la machine sans le faux des tests ; device-token, *.enc et saved-moments/ sont ignorés par .gitignore, qui interdit de versionner les fichiers d'authentification (:37-40).
- **Remède proposé par l'audit :** `adapters/json-file.cjs` : `readJson(file, { validate, fallback })` rend `{ value, status: 'absent' | 'ok' | 'invalid' }` sans rien écrire, et `writeJsonAtomic(file, value)` (tmp, rename, mode 0600). Les cinq adaptateurs de réglages et app/main.cjs:272-288 passent par lui. Règle unique : un réglage invalide donne la valeur par défaut, une ligne dans le journal de l'hôte et un fichier laissé intact jusqu'à la prochaine sauvegarde explicite ; jamais d'arrêt au démarrage pour un réglage d'affichage. `TrialBudget.snapshot()` lit sans écrire. provider.enc ne garde que ce qui a été saisi (clé, modèle, interrupteurs) ; les chemins sont recalculés à chaque démarrage (rejoint CORE-19). Un dossier `tests/fixtures/user-data/` avec un exemplaire de chaque fichier écrit par 8627b46, relu par un test.
- **Risque du remède selon le relecteur :** La règle « défaut si invalide » appliquée au compteur lève le plafond de dépense, et un provider.enc allégé fait perdre binaires et dossier d'usage à l'app lancée depuis le Finder ; aucun test n'exerce un compteur illisible, et tests/review-regressions.test.cjs:215-229 ne vérifie que les interrupteurs.

<a id="GAP2-09"></a>
#### GAP2-09 — Des données écrites que le produit ne sait plus lister ni supprimer

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Complément : formats écrits sur disque

**Suite : pas de ticket.** Décision attendue du propriétaire sur verifications/ (lecteur et suppression, ou arrêt de l'écriture) ; la partie « moment illisible » touche l'interface Mac. — _Reprise :_ Une fois la décision prise ; la partie SavedMomentStore.list peut partir seule après lot:L05.

- **Où :** adapters/verification-archive.cjs:5-11 ; app/main.cjs:237, :470 ; adapters/saved-moment-store.cjs:8, :11 ; core/saved-moments.cjs:9 ; adapters/local-store.cjs:6
- **Preuve :** `verifications/<createdAt>-verification-N.json` : VerificationArchive n'a que `save` ; aucun lecteur, aucune liste, aucune suppression dans l'arbre (les seules occurrences de `verifications` sont app/main.cjs:237 et le commentaire :470, qui dit qu'elles ne partent pas avec la session). `saved-moments/<id>/saved.json` : `list()` saute sans message toute entrée dont le JSON ne se lit pas (`try{…}catch{}`, :11) ; le moment gardé disparaît de l'interface, donc de la seule voie de suppression, et son clip reste sur le disque. saved.json porte une phrase d'interface comme donnée (`retention: 'Conservé sur ce Mac jusqu’à suppression explicite.'`, core/saved-moments.cjs:9) et une image en base64 (`preview`, :7). auto.json : voir GAP2-07.
- **Impact :** « Conservé jusqu'à suppression » suppose que tout ce qui est écrit reste supprimable par son propriétaire. Ici, des vérifications s'accumulent sans limite ni écran, et un saved.json abîmé ou d'une forme future rend un moment gardé invisible sans le libérer.
- **Nuance du relecteur (elle prime) :** Preuve vérifiée : VerificationArchive n'a que save ; `verifications` n'apparaît qu'en app/main.cjs:237 et :470 ; list() saute en silence (adapters/saved-moment-store.cjs:11) ; phrase d'interface persistée (core/saved-moments.cjs:9) ; aperçu en base64 (saved-moment-store.cjs:7). Corrections : (1) tests/verification.test.cjs (:59-65) teste le service avec une archive factice : l'écriture sur disque par VerificationArchive n'a aucun test. (2) list() rend le JSON lu sans en contrôler la forme : un saved.json qui se parse mais n'a pas de `moments` fait lever renderSaved et renderSavedRail (app/renderer.js:563-564) et masque tous les moments gardés. La remédiation doit donc valider la forme (identifiant égal au nom du dossier, `moments` en tableau) et adapter ces deux fonctions, sinon l'entrée `{ id, state: 'unreadable' }` déclenche elle-même ce plantage ; le tri par createdAt (:11) doit tolérer une entrée sans date. (3) Même famille, non relevée : un arrêt pendant save laisse `<id>.tmp/` avec des copies de clips (saved-moment-store.cjs:6), que l'expression de 36 caractères ne liste ni ne nettoie jamais.
- **Remède proposé par l'audit :** SavedMomentStore.list() rend, pour une entrée illisible, `{ id, state: 'unreadable' }` sur le modèle de `unreadable(id)` (session-library.cjs:48) : l'interface l'affiche « Moment illisible » avec la suppression disponible. Décision écrite pour verifications/ : soit lecteur, liste et suppression dans l'écran existant, soit arrêt de l'écriture et mention dans la documentation que les fichiers existants se suppriment à la main ; dans les deux cas le dialogue de suppression de session reste exact. saved.json : `retention` devient un code (`'until-deleted'`), l'ancienne phrase étant lue comme ce code.
- **Risque du remède selon le relecteur :** Une entrée `unreadable` sans `moments` fait planter le rendu et cache tous les moments gardés ; aucun test ne passe aujourd'hui une telle entrée au renderer, seul un cas ajouté à tests/mac-ui.test.cjs le détecterait.

<a id="GAP1-05"></a>
#### GAP1-05 — Aucun gestionnaire de dernier recours sur les trois hôtes Node

**Verdict : nuancé** · priorité P2 · effort S · risque moyen · Complément : journal et diagnostic d'une panne

**Suite :** [T041](travail/tickets/041-journal-the-start-the-stop-and-the-last-resort-failure-of.md) « Journal the start, the stop and the last-resort failure of the server host ».

- **Où :** server/main.cjs:43-44, 47 ; server/http.cjs:14, 20, 285 ; runtime/headless-runtime.cjs:899-900, 1116-1141 ; app/main.cjs:46, 84-87, 547-552 ; mcp/server.cjs:78-81 ; deploy/tvlens.service:23-24, 43-45
- **Preuve :** grep de `uncaughtException|unhandledRejection|render-process-gone|child-process-gone|crashReporter|unresponsive` sur app, adapters, core, runtime, server, mcp, tv et scripts : 0 occurrence. Sur le serveur, ce qui tient lieu de dernier recours est le défaut de Node (pile sur stderr, sortie 1) puis `Restart=on-failure` après 5 s : une trace existe donc dans journald, mais sans session, sans niveau et sans forme. Trois chemins y mènent sans garde : la promesse de `handle` n'est pas attrapée (http.cjs:14) et son propre `catch` lit `error.message` sans `?.` (:285) ; `close` sur SIGTERM (main.cjs:43-44) rejette quand `runtime.close()` rejette (`release` relance `refused`, headless-runtime.cjs:899-900, et le `try/finally` de :1118-1140 n'a pas de `catch`) ; `once("error", reject)` (:20) reste armé après l'écoute. Un SIGSEGV de la bibliothèque d'images (documenté, tvlens.service:44) ne laisse que la ligne de systemd. Mac : aucun écouteur ; une exception dans un gestionnaire IPC (:84-87) part vers la fenêtre sans être écrite. MCP : texte fixe, l'erreur est jetée.
- **Impact :** Après un crash on sait que le service a redémarré, pas quelle session était chargée ni ce qui était en cours ; sur le Mac, une fenêtre blanche ou figée ne laisse rien.
- **Nuance du relecteur (elle prime) :** Preuve exacte : grep à 0 occurrence ; promesse de handle non attrapée (http.cjs:14), error.message sans ?. (:285), once('error') (:20), close qui rejette quand release relance refused (headless-runtime.cjs:899-900, try/finally sans catch :1118-1140). Corrections. (1) Les trois chemins sont étroits : hors suppression, refused ne vient que d'un letGo qui lève (session-closing.cjs:104-111) ; :285 demande un throw null ou undefined ; :20 avale la première erreur tardive du serveur au lieu de faire tomber, c'est la suivante qui tomberait. (2) Mac inexact : Electron écrit lui-même une exception de gestionnaire IPC sur stderr (« Error occurred in handler for '&lt;canal>' ») et affiche par défaut un dialogue pour une exception non attrapée du processus principal (« A JavaScript error occurred in the main process ») ; les deux chaînes sont présentes dans le binaire Electron 44.4.5 du dépôt. Le manque est le puits (GAP1-06), pas l'écriture. Poser uncaughtException supprime ce dialogue, et un exit(1) sur unhandledRejection n'est pas « la même sémantique qu'aujourd'hui » dans Electron (comportement par défaut du processus principal : supposé avertissement sans arrêt, non vérifié par exécution). Forme cible sur le Mac : journal, dialogue existant (:550), et choix explicite de quitter ou non. (3) mcp/server.cjs n'a ni main() ni garde require.main : le script s'exécute au chargement (:78), l'installation se fait en tête de fichier ; ce processus parle MCP sur stdout, le journal n'y écrit que sur stderr. (4) Un SIGSEGV ou un arrêt par MemoryMax (deploy/tvlens.service:34, 44) ne passent par aucun gestionnaire : la remédiation ne couvre pas le crash que le constat cite.

<a id="GAP1-07"></a>
#### GAP1-07 — TV : sorties des enfants jetées, rapport effacé au démarrage suivant, journal écrasé à chaque lancement

**Verdict : confirmé** · priorité P2 · effort M · risque moyen · Complément : journal et diagnostic d'une panne

**Suite : pas de ticket.** Journal côté TV : la bascule de fichier ne se prouve que par un essai sur la TV réelle, interdit à la boucle, et le relecteur demande de fusionner avec PY-04 plutôt que de doubler. — _Reprise :_ Avec le lot qui porte PY-04, après L17-01 (schéma de ligne) ; essai TV par le propriétaire.

- **Où :** tv/35-tvlens-capture-control:3 ; tv/controller.py:18-19, 52, 54-55, 130-131, 151-152, 272 ; tv/ambient.py:493, 1065-1068 ; tv/capture.py:7-8, 107-112, 235-236
- **Preuve :** Le contrôleur écrit dans `/tmp/tvlens-controller.log`, ouvert par `>` : écrasé à chaque lancement, sans borne. `log_message` est neutralisé (controller.py:272) : n'y arrivent que les piles de ses propres fils. Ses enfants (capture, superviseur d'ambiance, récupération) partent avec stdout et stderr sur DEVNULL : la pile relancée par ambient.py:1068 et le rapport imprimé par capture.py:235 n'ont pas de lecteur ; le fichier d'état du superviseur ne dit que `reason: 'error'`. Le rapport de capture (JSON atomique, 10 dernières erreurs, sessionId) est supprimé au démarrage suivant (controller.py:52). Un échec avant le premier `save()` (durée invalide :107, verrou :111, configuration illisible :112) ne laisse que `exitCode`. Les imports protégés (controller.py:18-19, capture.py:7-8) jettent la cause. Compteurs confirmés : 22 lignes `except … pass/return/continue` et 9 lignes DEVNULL, soit 31.
- **Impact :** Une capture qui ne démarre pas, ou un superviseur qui meurt, ne laissent rien à lire après coup : il faut une session SSH et une relance à la main sur un appareil que le projet interdit de toucher à la légère.
- **Remède proposé par l'audit :** `tv/journal.py` : `Journal(path, max_bytes=256_000, keep=2)` avec `event(level, name, **fields)` au schéma de ligne de GAP1-01 (`host:'tv'`, `component:'controller'|'capture'|'ambient'`, `sessionId`, `sequence`). Les enfants reçoivent `stderr=journal.child_stream()` (fichier borné ouvert en ajout, bascule vérifiée au lancement) au lieu de DEVNULL. `self.report.unlink(...)` devient un renommage en `.previous`. La cause d'un import raté est gardée et publiée dans `status()`. Le crochet de démarrage écrit en `>>` dans le même fichier borné. Un arrêt propre continue de ne rien écrire sur stderr.
- **Risque du remède selon le relecteur :** Une bascule par renommage laisse le contrôleur (redirigé en >> par le shell) et les enfants écrire dans un fichier renommé puis supprimé, donc sans borne ni lecteur ; un test de bascule avec descripteur tenu et l'essai sur la TV réelle le détectent, test_tv_capture_gate.py:289 gardant la sortie d'erreur vide à l'arrêt propre.

<a id="GAP1-08"></a>
#### GAP1-08 — Événements de confinement écrits une fois par processus, sans heure ni identifiant

**Verdict : nuancé** · priorité P2 · effort S · risque faible · Complément : journal et diagnostic d'une panne

**Suite : pas de ticket.** Plafond de quatre tickets du thème journal atteint. Migrer les six sites de confinement vers le port oblige à migrer sans les assouplir les tests qui filtrent stderr sur le préfixe « TVLens : » (codex-confinement, architecture-f05, verification). — _Reprise :_ Après L17-01, dans le lot qui réécrit ces tests de confinement.

- **Où :** adapters/codex-session-client.cjs:46-56, 295, 355, 389-390, 420-422, 470, 829 ; docs/adr/0005-groupe-codex-attendu-avant-d-etre-remplace-et-contextes-revoques-en-fin-de-session.md:65
- **Preuve :** `reported` est un `Set` de module jamais vidé (:46) : « confinement Codex contredit par l'App Server », « fil Codex non ouvert par l'application (sous-agent), processus fermé » ou « arrêt du processus Codex non confirmé » ne sont écrits qu'une fois par processus hôte, quel que soit le nombre d'occurrences, de sessions ou de semaines. La ligne n'a ni heure propre, ni session, ni fil, ni compteur. L'événement jumeau de la trace (`guard.refused` :389, `confinement` :420) porte ces identifiants mais reste éteint par défaut. L'ADR 0005:65 note déjà que la ligne « dit plus que le code ». À l'inverse `report()` (:355, mode diagnostic) écrit à chaque connexion, sans borne.
- **Impact :** Ce sont les seuls événements de sécurité du produit. Sur un serveur qui tourne des semaines, la deuxième contradiction de confinement est invisible : ni date, ni nombre, ni session concernée.
- **Nuance du relecteur (elle prime) :** Preuve exacte : Set de module jamais vidé (codex-session-client.cjs:46), six sites, jumeaux de trace éteints par défaut (:389, :420), ADR 0005:65. Corrections. (1) Le dédoublonnage porte sur le texte complet du message (rôle, binaire, raisons, version compris), pas sur le type d'événement : c'est « une fois par constat distinct et par processus », choix commenté (:47) et noté en limite par l'ADR. (2) La cadence est testée et documentée, et la remédiation la casse en deux points. La ligne du mode diagnostic doit sortir à chaque connexion : codex-confinement.test.cjs:320-321 et 412-419 (« every time and not once per process »), verification.test.cjs:203, deploy/runtime.env.example (« writes a journal line at every connection »). L'événement codex.confinement.report doit donc être exempté de la borne, et « sans borne » n'est pas un défaut mais un choix voulu. Ensuite verification.test.cjs:204 exige deux lignes pour deux refus de causes différentes : la clé de borne doit inclure cause, raisons et rôle, pas le seul nom d'événement. À l'inverse architecture-f05.test.cjs:396 exige une seule ligne pour deux fermetures du même rôle. (3) reasons n'est pas dans la liste blanche de GAP1-01.
- **Remède proposé par l'audit :** Les six sites émettent par le port : `journal.event('warn', 'codex.confinement.refused' | 'codex.subagent.thread' | 'codex.exit.unconfirmed' | 'codex.flags.skipped' | 'codex.confinement.report', { role, sessionId, threadId, reasons })`, `message` gardant la phrase actuelle. La borne quitte le client pour le port : première occurrence immédiate, puis une ligne agrégée par clé et par fenêtre de 10 minutes avec `repeated:n`. Le même mécanisme sert aux 401 de SEC-05. `reported`, `reportOnce` et `report` disparaissent du client : une responsabilité de moins pour ADP-08.
- **Risque du remède selon le relecteur :** Une borne clée sur le seul nom d'événement masque un second refus de confinement de cause différente et fait taire le mode diagnostic ; verification.test.cjs:203-204 et codex-confinement.test.cjs:320-321, 412-419 le détectent à condition d'être migrés sans être assouplis.

<a id="GAP1-09"></a>
#### GAP1-09 — Rejets neutralisés : trois familles écrites de la même façon

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Complément : journal et diagnostic d'une panne

**Suite : pas de ticket.** Recoupe lot:L03 (règles ESLint et cliquet sur les rejets neutralisés) et ADP-05 ; la répartition par famille n'a pas été recomptée site par site et aucun test ne couvre une lecture en erreur autre qu'un fichier absent. — _Reprise :_ Dans lot:L03, après L17-01 (journal.quiet et journal.report supposent le port).

- **Où :** server/main.cjs:26-27 ; adapters/session-library.cjs:73, 78, 90, 118, 135 ; adapters/local-store.cjs:121, 217, 268 ; adapters/saved-moment-store.cjs:11 ; runtime/headless-runtime.cjs:331, 423, 802 ; runtime/surveillance-runtime.cjs:401 ; core/moment-index.cjs:157 ; app/main.cjs:153, 212, 216, 311, 421, 566 ; tests/mac-ipc-contract.test.cjs:114
- **Preuve :** 61 des 76 sites lus dans leur contexte immédiat (runtime 9, core 5, server 1, adapters 32, app/main.cjs 14 ; les 15 de app/renderer.js relèvent de UI-04). Famille A, maillon de file ou garde d'une promesse attendue ailleurs (`x = x.catch(() => {}).then(…)`) : 19 sites, légitimes. Famille B, échauffement ou nettoyage dont l'échec ressort au premier usage réel : 21. Famille C, échec dit nulle part ou réduit à « absent » : 21. Exemples C : `fs.readFile(tokenFile,'utf8').catch(()=>null)` suivi d'une régénération (server/main.cjs:26-27) : une lecture en erreur autre qu'un fichier absent réécrit un nouveau jeton et désappaire la TV sans une ligne ; `fs.readdir(this.root).catch(() => [])` (session-library.cjs:118) : une racine illisible devient « aucune session » ; `store?.saveRecap(state).catch(()=>{})` (app/main.cjs:212) ; `watch.prune().catch(() => {})` (headless-runtime.cjs:331, app/main.cjs:311). Les 9 lectures « toute erreur = absent » des adaptateurs ne figurent pas dans la liste d'ADP-05.
- **Impact :** Un relecteur, humain ou agent, ne peut pas distinguer un silence voulu d'un oubli, et les règles ESLint prévues en L03 (`no-empty`, promesses flottantes) ne voient pas ces formes.
- **Nuance du relecteur (elle prime) :** Compteurs exacts, recomptés par grep : 76 sites, 61 hors renderer (runtime 9, core 5, server 1, adapters 32, app/main.cjs 14), 15 dans app/renderer.js, 9 lectures des adaptateurs (saved-moment-store.cjs:11 ; local-store.cjs:121, 217, 268 ; session-library.cjs:73, 78, 90, 118, 135), 4 écritures de tail. La répartition 19/21/21 n'a pas été recomptée site par site (statut : supposé, échantillon conforme). Corrections. (1) absent(fallback) qui relance est faux pour session-library.cjs:78, 90, 135 : load() distingue déjà ENOENT (local-store.cjs:147), et ces trois .catch sont des dégradations voulues : état « unreadable » de la liste (ports.cjs:97, session-library.cjs:127), repli du manifeste sur l'état sauvegardé, fichiers optionnels à l'ouverture. Relancer rendrait une session inouvrable pour un deep-answers.json corrompu. Forme cible à ces endroits : signaler au journal puis garder le repli. Pour :118, relancer change la réponse de GET /v1/sessions (erreur au lieu d'une liste vide) : à décider dans le ticket. (2) journal.quiet et journal.report ne font pas partie du port défini en GAP1-01 (event, child) : en faire des aides au-dessus de event, avec une version sans import pour core/ (session.cjs:95, 182 ; moment-index.cjs:87, 157, 239). (3) server/main.cjs:26-27 : une lecture refusée par EACCES ferait aussi échouer l'écriture (:27), donc le démarrage, avec un message ; la régénération silencieuse vaut pour une erreur passagère ou un fichier vide. (4) Hors compte : les blocs try/catch vides, dont headless-runtime.cjs:361-363 exécuté chaque seconde.
- **Remède proposé par l'audit :** Trois écritures nommées. Famille A : une aide `settled(promise)` unique pour les files (elle remplace aussi les quatre écritures de `tail` relevées par ADP-12). Famille B : `.catch(journal.quiet('<raison>'))`, qui émet en `debug`. Famille C : `.catch(journal.report('<événement>', { sessionId }))`, qui émet en `warn` avec `safeError` ; pour les lectures, `absent(fallback)` ne rend la valeur de repli que sur ENOENT et relance sinon (rejoint ADP-05). Garde outillée : `no-restricted-syntax` sur `.catch(() => {})` et `.catch(() => null | [] | undefined)` nus, le compte du jour servant de plancher au cliquet. Traitement par répertoire, un ticket chacun.
- **Risque du remède selon le relecteur :** Remplacer un repli par une relance rend bloquants à l'ouverture une session listée « illisible » ou un fichier optionnel corrompu ; aucun test ne couvre aujourd'hui une lecture en erreur autre qu'un fichier absent (d'après l'audit, non revérifié), il faut l'écrire avant de toucher session-library.cjs.

<a id="GAP1-10"></a>
#### GAP1-10 — Le journal s'observe en remplaçant des globales, et aucune procédure ne dit où regarder

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Complément : journal et diagnostic d'une panne

**Suite :** [T036](travail/tickets/036-add-a-journal-port-with-a-stderr-sink-and-a-contract-test.md) « Add a journal port with a stderr sink and a contract test ».

- **Où :** tests/chat-trace.test.cjs:5 ; tests/codex-confinement.test.cjs:33 ; tests/architecture-f05.test.cjs:52, 656 ; tests/verification.test.cjs:186 ; tests/architecture-f07.test.cjs:252, 589 ; tests/mac-ipc-contract.test.cjs:169 ; docs/vps-deployment.md:35 ; deploy/runtime.env.example ; deploy/tvlens.service:7-47
- **Preuve :** 7 remplacements de `process.stderr.write` ou de `console.error` dans 6 fichiers de tests ; 25 lignes dans 7 fichiers fixent le texte « TVLens : … » ou « TVLens — … » ; tests/chat-trace.test.cjs:5 applique `JSON.parse` à toute écriture sur stderr ; tests/architecture-f07.test.cjs:589 vérifie par le texte source qu'un seul fichier contient la phrase de fin incomplète. Côté exploitation, la seule consigne est `journalctl -u tvlens --since '10 minutes ago'` (vps-deployment.md:35) ; TVLENS_CODEX_TRACE n'apparaît dans aucun document ni exemple d'environnement ; l'unité n'a pas de `SyslogIdentifier`. Aucune page ne dit, par symptôme, où lire : état de session, journal, rapport TV.
- **Impact :** Un ticket qui touche une ligne de journal peut casser des tests sans rapport, parce qu'ils partagent des globales ; et en panne, le premier geste reste de relancer à la main avec un drapeau que rien ne documente.
- **Nuance du relecteur (elle prime) :** Compteurs exacts : 7 remplacements de globales dans 6 fichiers (chat-trace.test.cjs:5, codex-confinement.test.cjs:33, architecture-f05.test.cjs:52 et 656, verification.test.cjs:186, architecture-f07.test.cjs:252, mac-ipc-contract.test.cjs:169), 25 lignes dans 7 fichiers, TVLENS_CODEX_TRACE absent de docs/ et de deploy/, pas de SyslogIdentifier, seule consigne à vps-deployment.md:35. Corrections. (1) Manque dans la preuve : la forme 1 a déjà une couture sans globale, l'option log, utilisée par une dizaine de tests (server-sessions.test.cjs:400, 437, 490, 524, 559, 690 ; architecture-f06.test.cjs:124 ; architecture-f07.test.cjs:175). Ils migrent aussi si log devient journal. (2) Le point (1) de la remédiation est inapplicable à 3 des 7 remplacements : architecture-f05.test.cjs:656, architecture-f07.test.cjs:252 et mac-ipc-contract.test.cjs:169 chargent app/main.cjs comme script (require sous Module._load), sans option où passer un puits. Soit substitution du module du puits par cette même couture, soit prérequis ADP-06. (3) La commande journalctl -u tvlens -o cat | jq 'select(…)' s'arrête à la première ligne non JSON (ligne de démarrage server/main.cjs:41, pile de Node, messages de systemd) : forme correcte jq -R 'fromjson? | select(…)'. (4) SyslogIdentifier est cosmétique, journalctl -u filtre déjà par unité. (5) Le puits mémoire et la migration des tests sont déjà comptés dans GAP1-01 et GAP1-08 : ne garder ici que docs/diagnostic.md, l'exemple d'environnement et le test de contrat.

<a id="GAP3-10"></a>
#### GAP3-10 — Contrat local panneau, contrôleur et scripts : valeurs codées dans les chemins, copies partielles possibles

**Verdict : nuancé** · priorité P3 · effort S · risque faible · Complément : contrat de fil entre parties déployées

**Suite : pas de ticket.** ne vaut pas une session — _Reprise :_ Avec le lot qui porte PY-04, si le contrôleur local est repris.

- **Où :** tv/controller.py:236-241, :300-313 ; tv/app/surveillance-overlay.js:10 ; tv/app/surveillance-view.js:44 ; tv/app/companion.js:725-730, :780, :807-808 ; tv/capture.py:3, :7-8 ; docs/lg-capture-control.md:49
- **Preuve :** Les durées d'affichage permises existent trois fois : chemins `/ambient/display/8`, `/14`, `/20` (controller.py:239) et DISPLAY_CHOICES dans deux scripts de la TV. Une valeur inconnue du contrôleur répond 404 `{}` (:313), que le panneau lit comme « contrôleur plus ancien » : tell() se tait alors, y compris pour `/ambient/seen/…` (companion.js:780), qui sert à ne pas rejouer panneau fermé une carte déjà vue. Les scripts Python sont 5 fichiers copiés à la main (« copier les trois fichiers ») avec des imports croisés : capture.py:3 importe 6 noms de transport.py ; un capture.py récent avec un transport.py ancien échoue à l'import, sortie vers DEVNULL (PY-04).
- **Impact :** Ajouter un choix de durée dans l'IPK avant de copier controller.py coupe sans bruit les déclarations de cartes vues. Une copie partielle des scripts donne un échec muet.
- **Nuance du relecteur (elle prime) :** Les durées existent quatre fois côté TV, pas trois : controller.py:239, ambient.py:38 (DISPLAY_CHOICES, constante utilisée nulle part ailleurs), surveillance-overlay.js:10, surveillance-view.js:44 ; plus app/ui/card-queue.mjs:11 côté Mac. Le reste est exact : 404 `{}` à controller.py:313, donc ambientKnown faux et tell() muet (companion.js:725-730), 5 scripts Python, 6 noms importés à capture.py:3. Sur le dossier versionné : il a un précédent (dossier neuf d'essai, docs/lg-ambient.md:221 ; arguments de controller.py:346-349), mais la bascule d'un lien n'empêche pas un contrôleur déjà lancé, donc d'ancien code, de démarrer le nouveau capture.py (controller.py:26) : le redémarrage du contrôleur reste requis. tests/test_tv_ambient.py:985-991 affirme `(404, {})` pour les chemins inconnus. Le scénario d'un nouveau choix de durée est hypothétique : aucun n'est prévu.
- **Remède proposé par l'audit :** GET /ambient publie `settings.choices: {displayMs: [8000, 14000, 20000]}` et le panneau ne propose que les choix publiés ; les chemins fixes sans corps sont gardés (choix de conception, :301). Une valeur non permise répond 400 avec code unsupported-value, jamais 404. tv/version.py est publié dans GET /capture, le rapport de capture et l'état ambiant (GAP3-03). Installation des scripts par dossier versionné avec bascule d'un lien, pour qu'une copie partielle soit impossible (à valider sur la TV : non vérifié).
- **Risque du remède selon le relecteur :** Passer une valeur refusée de 404 à 400 et donner un corps aux 404 change des réponses affirmées telles quelles ; le détecte tests/test_tv_ambient.py:985-991, hors npm test, donc seulement une fois PY-04 fait.

<a id="GAP2-10"></a>
#### GAP2-10 — Média d'un passage : JSON en base64 sans version, relu en entier pour deux nombres

**Verdict : confirmé** · priorité P3 · effort S · risque faible · Complément : formats écrits sur disque

**Suite :** [T037](travail/tickets/037-freeze-a-reference-session-archive-and-prove-the-current.md) « Freeze a reference session archive and prove the current code reads it ».

- **Où :** adapters/local-store.cjs:50-56, :82-93 ; adapters/session-library.cjs:100-105 ; adapters/saved-moment-store.cjs:7 ; runtime/session-runtime.cjs:597-631
- **Preuve :** `media/moment-N.json` contient `{ frames, audio (base64), startMs, endMs }` sans version (:55). D'après les bornes d'admission (session-runtime.cjs:605-628 : 8 images d'un million de caractères au plus, 2,1 Mo de son, soit 2,8 Mo en base64), un fichier peut atteindre environ 10,8 Mo ; c'est le fichier le plus nombreux du produit, un par passage. `interval()` (:88-93) fait `JSON.parse` du fichier entier pour lire startMs, endMs et la présence du son ; il est appelé pour chaque passage orphelin à la réouverture (session-library.cjs:102-104). SavedMomentStore.save relit le fichier entier pour en tirer une image (:7). Deux générations coexistent : sans intervalle (`interval()` rend null, le passage reste compté comme orphelin, jamais placé) et avec. Les tailles réelles ne sont pas mesurées (docs/night-features-delivery.md : « Le volume n'est pas mesuré sur une vraie émission »).
- **Impact :** C'est le format le plus coûteux à faire évoluer : le changer oblige à convertir ou à lire à jamais des gigaoctets (environ un gigaoctet par film d'après le README). Un ticket de performance ou de nettoyage qui le toucherait sans fixture ni version créerait une troisième génération non déclarée.

<a id="OUBLI-46"></a>
#### OUBLI-46 — Le fil panneau ↔ contrôleur local ↔ rapport de capture n'a pas non plus de test conjoint, et GAP3-02 ne couvre que /v1

**Verdict : nuancé** · Signalement du relecteur — Contrat-de-fil-entre-parties-déployées-s

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Le fil local panneau, contrôleur, rapport de capture est hors /v1 et ses tests Python sont rattachés à PY-04 ; signalement non revérifié dans le code. — _Reprise :_ Après L17-10, qui donne le modèle d'un test conjoint côté Python, avec le lot qui porte PY-04.

- **Signalement :** Le fil panneau ↔ contrôleur local ↔ rapport de capture n'a pas non plus de test conjoint, et GAP3-02 ne couvre que /v1. Le seul couplage automatique est une regex sur le source Python (tests/tv-panel.test.cjs:540-543, `drop\((?:self\.)?report, ?'(\w+)'` sur capture.py et transport.py), qui casse dès qu'un formateur Python change les guillemets. describeCapture (tv/app/sessions-view.js:250-264) est testé sur des rapports écrits à la main.

<a id="OUBLI-47"></a>
#### OUBLI-47 — Le CLI Codex est une pièce installée séparément, absente de la matrice

**Verdict : nuancé** · Signalement du relecteur — Contrat-de-fil-entre-parties-déployées-s

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Le CLI Codex est un fil vers un tiers, hors du contrat /v1 ; aucune règle de version n'est écrite et en inventer une serait une règle métier. — _Reprise :_ Après L17-06 : l'événement host.started pourra porter la version de Codex, dans le lot du confinement Codex.

- **Signalement :** Le CLI Codex est une pièce installée séparément, absente de la matrice : docs/server-installation.md:11 et :55 (« Codex 0.158.0, installation npm séparée »). Son protocole est déclaré `experimentalApi: true` (adapters/codex-session-client.cjs:333-336) et sa version n'est lue que pour le message d'un refus (adapters/codex-confinement.cjs:80-86). C'est le seul fil vers un tiers ; le Mac et le VPS peuvent avoir deux versions.

<a id="OUBLI-48"></a>
#### OUBLI-48 — La procédure d'installation écrite produit elle-même un état mélangé

**Verdict : nuancé** · Signalement du relecteur — Contrat-de-fil-entre-parties-déployées-s

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Correction de la procédure d'installation TV (trois scripts cités, cinq présents) : documentation liée à l'installation par dossier versionné de GAP3-10, non revérifiée ici. — _Reprise :_ Avec le lot qui porte PY-04 et GAP3-10.

- **Signalement :** La procédure d'installation écrite produit elle-même un état mélangé : docs/lg-installation.md:19 et docs/lg-capture-control.md:45, :49 listent trois scripts à copier alors que tv/ en compte cinq. Sans ambient.py ni luna.py, controller.py:18-19 continue sans le module, répond 404 sous /ambient, et le panneau affiche « contrôleur TV à mettre à jour » (tv/app/surveillance-view.js:446-447).

<a id="OUBLI-49"></a>
#### OUBLI-49 — Les bornes et délais font partie du contrat et n'existent qu'en copies de chaque côté, sans déclaration commune ni test

**Verdict : confirmé** · Signalement du relecteur — Contrat-de-fil-entre-parties-déployées-s

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T038](travail/tickets/038-exercise-the-v1-wire-with-the-real-tv-client-and-write-its.md) « Exercise the /v1 wire with the real TV client and write its compatibility rule ».

- **Signalement :** Les bornes et délais font partie du contrat et n'existent qu'en copies de chaque côté, sans déclaration commune ni test : corps limités à 12 000 et 13 000 000 octets (server/http.cjs:160), requestTimeout 20 s (:15), 8 s côté panneau (tv/app/remote-client.js:23), 5 s par requête et 30 s de vie d'un bloc côté capture (tv/transport.py:43, :50). L'ADR 0006 (décision 13, :57) les cite comme invariants ; un 413 n'a pas de code.

<a id="OUBLI-50"></a>
#### OUBLI-50 — Formats côté TV absents de l'inventaire

**Verdict : nuancé** · Signalement du relecteur — Formats-écrits-sur-disque-inventaire

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Inventaire des formats côté TV : il sert de modèle à la règle de GAP2-08 et n'a pas de livrable propre avant elle. — _Reprise :_ Avec le ticket de GAP2-08.

- **Signalement :** Formats côté TV absents de l'inventaire : tv/ambient.py:120-132 déclare une douzaine de fichiers JSON (dont ambient.json et ambient-settings.json, persistants à côté de connection.json ; tv/controller.py:73-83), avec leur propre convention de version `v: 2` (tv/ambient.py:176 contrôle strict, :208, :1005 ; tv/controller.py:188) et un lecteur tolérant champ par champ (clean_config :134-150, clean_settings :156-164). C'est déjà, dans le dépôt, le modèle de la règle que GAP2-08 veut écrire, et ces composants sont déployés séparément sur la TV.

<a id="OUBLI-51"></a>
#### OUBLI-51 — models.json est réécrit à chaque démarrage du Mac

**Verdict : nuancé** · Signalement du relecteur — Formats-écrits-sur-disque-inventaire

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** models.json réécrit au démarrage du Mac : même fichier et même règle de lecture que GAP2-08 ; le mécanisme est lu, non reproduit. — _Reprise :_ Avec le ticket de GAP2-08.

- **Signalement :** models.json est réécrit à chaque démarrage du Mac (app/main.cjs:74-76) : toute valeur contenant « / » devient gpt-6-luna et seules les clés connues sont gardées, alors que validateSettings exige chaque clé (adapters/model-settings.cjs:7-11, :16). Un checkout plus ancien retire donc une clé ajoutée par un plus récent, qui ne démarre plus ensuite ; tout ticket qui ajoute un réglage de modèle déclenche ce piège sur les installations existantes (supposé : mécanisme lu, non reproduit).

<a id="OUBLI-52"></a>
#### OUBLI-52 — Préférences persistées en localStorage, sans version et hors inventaire

**Verdict : nuancé** · Signalement du relecteur — Formats-écrits-sur-disque-inventaire

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** ne vaut pas une session — _Reprise :_ À nommer dans l'ADR « formats sur disque » de GAP2-05.

- **Signalement :** Préférences persistées en localStorage, sans version et hors inventaire : app/renderer.js:583-591 (`tvlens.surveillance.display`) et tv/app/companion.js:703, :802-805 (`tvlens.overlay`). Lecture tolérante dans les deux cas ; risque faible, mais ce sont des formats écrits que le plan ne nomme pas.

<a id="OUBLI-53"></a>
#### OUBLI-53 — États d'un disque interrompu absents de la fixture proposée

**Verdict : confirmé** · Signalement du relecteur — Formats-écrits-sur-disque-inventaire

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T037](travail/tickets/037-freeze-a-reference-session-archive-and-prove-the-current.md) « Freeze a reference session archive and prove the current code reads it ».

- **Signalement :** États d'un disque interrompu absents de la fixture proposée : les deux fichiers d'un passage sont écrits directement, sans fichier temporaire (adapters/local-store.cjs:63), et has() ne contrôle que leur présence (:37-43) ; un clip tronqué avec son JSON complet est annoncé disponible, limite reconnue en docs/night-features-delivery.md:230. La session « interrompue » de la fixture devrait contenir ce cas ainsi qu'un reste `session.json.tmp` (local-store.cjs:172).

<a id="OUBLI-54"></a>
#### OUBLI-54 — Racine des sessions : un dossier dont le nom n'est pas un UUID n'est ni listé, ni ouvert, ni supprimable (adap…

**Verdict : nuancé** · Signalement du relecteur — Formats-écrits-sur-disque-inventaire

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Demande que le script d'inventaire de GAP2-05 compte les dossiers hors UUID ; sans ce script il n'y a rien à livrer. — _Reprise :_ Avec le ticket d'inventaire de GAP2-05.

- **Signalement :** Racine des sessions : un dossier dont le nom n'est pas un UUID n'est ni listé, ni ouvert, ni supprimable (adapters/session-library.cjs:7-8, :119 ; comportement testé en tests/session-durable.test.cjs:161). Le script d'inventaire de GAP2-05 doit compter ces dossiers et les fichiers isolés de la racine, sinon des données écrites restent invisibles au produit (supposé : existence sur le Mac ou le VPS non vérifiée).

<a id="OUBLI-55"></a>
#### OUBLI-55 — Aucun événement de démarrage ni d'arrêt

**Verdict : confirmé** · Signalement du relecteur — Journal-et-diagnostic-d-une-panne-en-pro

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T041](travail/tickets/041-journal-the-start-the-stop-and-the-last-resort-failure-of.md) « Journal the start, the stop and the last-resort failure of the server host ».

- **Signalement :** Aucun événement de démarrage ni d'arrêt : server/main.cjs:41 n'écrit que l'URL et le chemin du jeton ; ni version (package.json:3), ni commit, ni version de Node et de Codex, ni réglages retenus, ni boot (headless-runtime.cjs:250, jamais écrit), ni signal reçu (server/main.cjs:43-44). Rien ne dit non plus au démarrage que l'arrêt précédent n'était pas propre, seule trace possible d'un SIGSEGV ou d'un arrêt par MemoryMax (deploy/tvlens.service:34, 44) qu'aucun gestionnaire de GAP1-05 ne voit.

<a id="OUBLI-56"></a>
#### OUBLI-56 — Erreurs côté client sans chemin vers un journal

**Verdict : nuancé** · Signalement du relecteur — Journal-et-diagnostic-d-une-panne-en-pro

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Remonter une erreur du panneau demande une route ou un canal IPC nouveaux : un ajout au contrat de fil et une décision du propriétaire sur ce qu'un client a le droit d'écrire au journal. — _Reprise :_ Après L17-04 et L17-03, une fois la décision prise.

- **Signalement :** Erreurs côté client sans chemin vers un journal : aucun onerror ni unhandledrejection dans tv/app/*.js ni app/renderer.js (grep : 0 hors balises média). Une exception du panneau webOS ne laisse rien sur aucune machine, et le plan ne prévoit ni route ni canal IPC pour la remonter (TV-05 et UI-04 ne traitent que l'affichage).

<a id="OUBLI-57"></a>
#### OUBLI-57 — La règle « jamais ce qui est regardé » n'est pas tenable par clean() seul

**Verdict : confirmé** · Signalement du relecteur — Journal-et-diagnostic-d-une-panne-en-pro

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T036](travail/tickets/036-add-a-journal-port-with-a-stderr-sink-and-a-contract-test.md) « Add a journal port with a stderr sink and a contract test ».

- **Signalement :** La règle « jamais ce qui est regardé » n'est pas tenable par clean() seul : adapters/codex-session-client.cjs:795 (JSON.parse(raw) de la réponse du modèle, dont le message d'erreur cite un extrait), la sortie d'erreur de Codex (adapters/codex-rpc.cjs:68) et les messages des fournisseurs sont du texte libre que les événements de GAP1-03 et GAP1-04 feraient entrer au journal.

<a id="OUBLI-58"></a>
#### OUBLI-58 — safeError sert trois lecteurs et non le seul journal

**Verdict : confirmé** · Signalement du relecteur — Journal-et-diagnostic-d-une-panne-en-pro

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T040](travail/tickets/040-serialize-errors-for-the-journal-with-their-cause-system.md) « Serialize errors for the journal with their cause, system code and a short stack ».

- **Signalement :** safeError sert trois lecteurs et non le seul journal : la trace, job.errorDetail publié à la TV et sauvegardé (runtime/conversation-runtime.cjs:65, core/deep-ask.cjs:141, tv/app/companion.js:144) et rejected.turnError (adapters/codex-session-client.cjs:616, 685). L'audit le traite comme un sérialiseur de journal ; toute extension doit passer par un second sérialiseur.

<a id="OUBLI-59"></a>
#### OUBLI-59 — Boucles à la seconde qui avalent

**Verdict : nuancé** · Signalement du relecteur — Journal-et-diagnostic-d-une-panne-en-pro

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Mêmes fichiers et même injection que GAP1-03 (runtime/headless-runtime.cjs:361-363, core/surveillance.cjs:394 et :496) : à traiter dans le même ticket, pas à part. — _Reprise :_ Avec le ticket de surveillance issu de GAP1-03, après L17-06.

- **Signalement :** Boucles à la seconde qui avalent : runtime/headless-runtime.cjs:361-363 (try { this.surveillance.tick(); } catch {}) et core/surveillance.cjs:394, 496 (fail() ne garde qu'un message tronqué à 200 caractères). Un défaut interne de la surveillance n'a ni compteur ni ligne et n'entre dans aucun des comptes de GAP1-09, qui ne recense que les .catch de promesses.

### L04 — Des erreurs visibles et des frontières durcies

Vague 1 · 20 constats · 10 tickets

- [T046](travail/tickets/046-reject-the-active-codex-turn-when-its-event-handler-throws.md) — Reject the active Codex turn when its event handler throws
- [T047](travail/tickets/047-keep-the-redacted-codex-refusal-detail-as-the-cause-of-the.md) — Keep the redacted Codex refusal detail as the cause of the fixed message
- [T048](travail/tickets/048-warn-at-server-start-when-the-listen-address-is-neither.md) — Warn at server start when the listen address is neither loopback nor Tailscale
- [T049](travail/tickets/049-tell-a-panel-drawing-failure-apart-from-a-server-outage-on.md) — Tell a panel drawing failure apart from a server outage on the TV
- [T050](travail/tickets/050-retry-a-failed-surveillance-registry-read-with-a-bounded.md) — Retry a failed surveillance registry read with a bounded backoff
- [T051](travail/tickets/051-answer-fixed-texts-without-host-paths-to-a-block-refused-for.md) — Answer fixed texts without host paths to a block refused for its content
- [T052](travail/tickets/052-answer-an-unexpected-server-error-with-a-generic-500-and.md) — Answer an unexpected server error with a generic 500 and journal it _(demande un ADR)_
- [T053](travail/tickets/053-keep-the-config-read-when-its-cache-fails-and-journal-an.md) — Keep the config read when its cache fails and journal an unreadable cache
- [T054](travail/tickets/054-journal-unreadable-stores-instead-of-treating-them-as-absent.md) — Journal unreadable stores instead of treating them as absent
- [T065](travail/tickets/065-stop-the-mac-launch-when-the-given-config-file-cannot-be.md) — Stop the Mac launch when the given config file cannot be read

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [SEC-01](#SEC-01) | Messages internes renvoyés au client HTTP | nuancé | P1 | [T051](travail/tickets/051-answer-fixed-texts-without-host-paths-to-a-block-refused-for.md), [T052](travail/tickets/052-answer-an-unexpected-server-error-with-a-generic-500-and.md) |
| [ADP-01](#ADP-01) | Exceptions du gestionnaire d'événements Codex avalées | confirmé | P1 | [T046](travail/tickets/046-reject-the-active-codex-turn-when-its-event-handler-throws.md) |
| [TV-05](#TV-05) | Exception de rendu affichée comme panne serveur ; `#error` persistant | nuancé | P1 | [T049](travail/tickets/049-tell-a-panel-drawing-failure-apart-from-a-server-outage-on.md) |
| [TSTA-12](#TSTA-12) | Messages français utilisés comme identifiants d'erreur, dans les tests et dans la production | nuancé | P1 | pas de ticket |
| [CORE-10](#CORE-10) | Codes d'erreur dupliqués par littéral | confirmé | P2 | pas de ticket |
| [CORE-11](#CORE-11) | Même refus, statuts HTTP différents | nuancé | P2 | pas de ticket |
| [SEC-03](#SEC-03) | Écoute non-loopback sans garde ni avertissement | nuancé | P2 | [T048](travail/tickets/048-warn-at-server-start-when-the-listen-address-is-neither.md) |
| [ADP-02](#ADP-02) | Diagnostic Codex perdu | nuancé | P2 | [T047](travail/tickets/047-keep-the-redacted-codex-refusal-detail-as-the-cause-of-the.md) |
| [ADP-03](#ADP-03) | Échec de configuration avalé au démarrage Mac | nuancé | P2 | [T053](travail/tickets/053-keep-the-config-read-when-its-cache-fails-and-journal-an.md), [T065](travail/tickets/065-stop-the-mac-launch-when-the-given-config-file-cannot-be.md) |
| [ADP-05](#ADP-05) | Autres `catch` vides qui masquent | nuancé | P2 | [T053](travail/tickets/053-keep-the-config-read-when-its-cache-fails-and-journal-an.md), [T054](travail/tickets/054-journal-unreadable-stores-instead-of-treating-them-as-absent.md) |
| [UI-04](#UI-04) | Erreurs avalées, rejets non gérés | nuancé | P2 | [T050](travail/tickets/050-retry-a-failed-surveillance-registry-read-with-a-bounded.md) |
| [TSTB-10](#TSTB-10) | Assertions couplées au texte français et aux objets entiers | nuancé | P2 | pas de ticket |
| [SEC-02](#SEC-02) | Dossiers temporaires privés non balayés après un crash | nuancé | P3 | pas de ticket |
| [SEC-04](#SEC-04) | ffmpeg et Whisper héritent de tout l'environnement | nuancé | P3 | pas de ticket |
| [SEC-05](#SEC-05) | Durcissements sans chemin d'exploitation | confirmé | P3 | pas de ticket |
| [ADP-14](#ADP-14) | Sens des dépendances discutable | nuancé | P3 | pas de ticket |
| [ADP-16](#ADP-16) | Compteur de budget synchrone, verrou sans reprise | nuancé | P3 | pas de ticket |
| [TV-08](#TV-08) | Sécurité de rendu : gravité faible | confirmé | P3 | pas de ticket |
| [OUBLI-02](#OUBLI-02) | Un fichier de fournisseur illisible est avalé : l'app démarre sur la configuration par défaut sans rien dire | confirmé | — | [T053](travail/tickets/053-keep-the-config-read-when-its-cache-fails-and-journal-an.md), [T054](travail/tickets/054-journal-unreadable-stores-instead-of-treating-them-as-absent.md) |
| [OUBLI-05](#OUBLI-05) | Même classe que SEC-01, non citée | nuancé | — | pas de ticket |

<a id="SEC-01"></a>
#### SEC-01 — Messages internes renvoyés au client HTTP

**Verdict : nuancé** · priorité P1 · effort M · risque moyen · Adaptateurs et frontières

**Suite :** [T051](travail/tickets/051-answer-fixed-texts-without-host-paths-to-a-block-refused-for.md) « Answer fixed texts without host paths to a block refused for its content » ; [T052](travail/tickets/052-answer-an-unexpected-server-error-with-a-generic-500-and.md) « Answer an unexpected server error with a generic 500 and journal it ».

Constat d'origine :

- Emplacement : `server/http.cjs:275-289`, `adapters/remote-media.cjs:62` et `:34`.
- Preuve : statut 400 par défaut avec `error.message`. `'Préparation média échouée : '+err` porte la sortie d'erreur de ffmpeg, donc le chemin temporaire de l'hôte, alors que `remote-media.cjs:42` promet l'inverse. Un `frames:[null]` renvoie un `TypeError` brut.
- Gravité : faible. Client authentifié seulement ; divulgation de chemins et impossibilité de distinguer validation et panne.
- Remédiation : `ValidationError`/`Refusal` (statut + code) ; tout le reste en 500 générique + journal.
- Effort M, risque moyen (la TV lit certains textes). Tests : `remote-server`, `server-*`, `architecture-f06:360`.

- **Nuance du relecteur (elle prime) :** Chemins relatifs à ROOT. Preuve exacte : server/http.cjs:275-289 répond 400 + error.message par défaut ; `frames:[null]` rend bien « TypeError: Cannot read properties of null (reading 'atMs') » (reproduit par node -e sur validateRemote) ; ffmpeg 8.1.1 lancé avec les mêmes options écrit « Error opening input file &lt;chemin absolu> » sur stderr (observé), donc remote-media.cjs:62 porte le chemin du dossier temporaire. Deux corrections. (1) Le commentaire remote-media.cjs:40-42 ne promet l'absence de chemin que pour les réponses 503 `unavailable`, pas pour l'erreur de la ligne 62. (2) La remédiation « tout le reste en 500 générique » contredit un invariant testé : tests/architecture-f06.test.cjs:360-391 fixe 400 + message pour un bloc fautif, y compris « Préparation média échouée : boom » (queue de stderr) et le texte brut de sharp ; tv/transport.py:85 abandonne un bloc sur un statut &lt; 500 et le renvoie sur ≥ 500 (hors 408/429) ; tv/app/companion.js:242-244 lit le statut 400 et le texte « vue d'état inconnue ». Forme cible : les échecs dus au contenu (décodage ffmpeg, image illisible, TypeError de validation) restent en 400 avec un texte fixe ; seul l'inconnu passe en 500 générique + journal.

<a id="ADP-01"></a>
#### ADP-01 — Exceptions du gestionnaire d'événements Codex avalées

**Verdict : confirmé** · priorité P1 · effort S · risque faible · Adaptateurs et frontières

**Suite :** [T046](travail/tickets/046-reject-the-active-codex-turn-when-its-event-handler-throws.md) « Reject the active Codex turn when its event handler throws ».

Constat d'origine :

- Emplacement : `adapters/codex-rpc.cjs:67` ; accès fragiles dans `codex-session-client.cjs:598,681-683`.
- Preuve : `try{this.receive(JSON.parse(line));}catch{}` couvre aussi `onEvent`. Un `p.turn` absent lève un `TypeError` qui disparaît.
- Impact : un changement de forme du protocole (le projet en a déjà mesuré entre versions) devient une question muette jusqu'au plafond de 5 minutes.
- Remédiation : séparer l'analyse JSON de la distribution ; une exception du gestionnaire trace et rejette le tour actif.
- Effort S, risque faible. Tests : `codex-stream-decoding`, `architecture-f05`.

<a id="TV-05"></a>
#### TV-05 — Exception de rendu affichée comme panne serveur ; `#error` persistant

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Interfaces (Mac, TV, scripts Python)

**Suite :** [T049](travail/tickets/049-tell-a-panel-drawing-failure-apart-from-a-server-outage-on.md) « Tell a panel drawing failure apart from a server outage on the TV ».

**Part laissée de côté :** Reste du constat après L04-04 : la portée et la durée de vie du bandeau #error (écrit en tv/app/companion.js l.1026, 1031, 1127 et tv/app/timeline-view.js:112, effacé seulement l.1208) sont une décision de produit. — _Reprise :_ Après la décision du propriétaire sur ce que le bandeau doit montrer et quand il s'efface.

Constat d'origine :

- Où : `companion.js:1159-1178` ; `:1026, 1031, 1127, 1208` ; `timeline-view.js:112`.
- Preuve : `receive()` est dans le `try` du poll. Une exception de `render()` affiche « Serveur inaccessible » et désactive Envoyer. `#error` n'est vidé qu'à l'envoi d'une question.
- Remède : séparer le `try` réseau du `try` de rendu avec un message distinct. Donner au message d'erreur une portée et une durée de vie.
- Effort S, risque faible.

- **Nuance du relecteur (elle prime) :** Preuve exacte : receive() est dans le try de poll (companion.js:1159-1178), #error est écrit aux l.1026, 1031, 1127 et à timeline-view.js:112, vidé seulement à la l.1208. L'impact est sous-estimé : le message « Serveur inaccessible » ne dure qu'un tour. state est affecté avant render() (l.1131-1133) et l'étiquette du corps est déjà retenue par RemoteClient.poll (remote-client.js:82) ; PollPlan.read a réussi, son compteur failures reste à 0. Le poll suivant reçoit 304, remet online à true et rétablit la ligne de connexion (l.1165-1168) : le panneau reste à moitié dessiné, sans aucun signe, jusqu'à la révision suivante. C'est un masquage silencieux, plus coûteux à diagnostiquer sur une TV qu'un faux libellé, et à traiter avant TV-01 et TV-02 qui provoqueront ce genre d'exception.

<a id="TSTA-12"></a>
#### TSTA-12 — Messages français utilisés comme identifiants d'erreur, dans les tests et dans la production

**Verdict : nuancé** · priorité P1 · effort M · risque moyen · Tests nommés par chantier

**Suite : pas de ticket.** Dépend des codes posés à la source par les adaptateurs (ADP-04, ADR 0008, hors de ce lot) et de la décision du propriétaire sur les conventions de codes (A5) avant de remplacer les comparaisons de messages de codex-perception. Seule la part additive (codes sequence-old et sequence-conflict sur les deux 409 de server/http.cjs:243 et :246, aujourd'hui sans code) est faisable sans décision, mais le lot atteint déjà dix tickets. — _Reprise :_ Suite du lot déclenchée par L04-07 pour les codes HTTP additifs (après jalon:contrat-fil) ; le reste après ADP-04 et la décision A5.

- **Où :** adapters/codex-perception.cjs:23-41 ; tests/architecture-f08.test.cjs:261-306 ; tests/architecture-f05.test.cjs:26-29, 199-213, 396 ; tests/architecture-f04.test.cjs:104, 232-236 ; tests/codex-confinement.test.cjs:585-633, 790-833 ; tests/architecture-f06.test.cjs:534-578
- **Preuve :** Environ 198 des 942 assertions du périmètre (21 %, comptage par motifs) dépendent d'un message français ; environ 99 s'en servent pour dire de quelle erreur il s'agit. Occurrences écrites dans le périmètre : « hors du périmètre » 14, « non autorisé » 8 (appliqué en boucle à 13 cas), « Codex déconnecté » 6, `REVOKED` 7, « Recherche annulée » 7, « fil étranger » 5, « Connexion obsolète » 3, « Entrée média non autorisée » 3. La production fait de même : codex-perception.cjs:23-41 décide de redemander une description en comparant `error.message` à 5 phrases exactes, 2 expressions régulières, 4 phrases de refus et 2 préfixes. f08:261 (une vingtaine de messages) et f08:291 (« the messages the adapter relies on are the ones the Codex pipe really writes ») n'existent que pour garantir que ces phrases ne bougent pas. Les doubles doivent reproduire ces phrases : « Connexion Codex interrompue » est écrit 16 fois dans le périmètre. Côté HTTP, f06:534 distingue trois réponses 409 dont deux par le texte seul (« Séquence ancienne. », « Séquence déjà utilisée avec un autre contenu. »), alors que `capture-changed`, `session-closing`, `read-only` et `media-unavailable` ont un code.
- **Impact :** Reformuler un message d'erreur est un changement de comportement (une description n'est plus redemandée) et casse des dizaines de tests. Aucune traduction n'est possible.
- **Nuance du relecteur (elle prime) :** Preuve exacte : codex-perception.cjs:23-41 classe bien sur 5 phrases exactes, 2 expressions régulières, 4 refus et 2 préfixes ; les occurrences se recomptent (« hors du périmètre » 14, « non autorisé » 8, « Codex déconnecté » 6, « Recherche annulée » 7, « fil étranger » 5, « Connexion obsolète » 3, « Connexion Codex interrompue » 16) ; http.cjs:243 et :246 distinguent deux 409 par le texte seul. Deux précisions. 1) Le prérequis laissé « non vérifié » est levé : tv/transport.py:22-28 lit le statut, `code` et `error` ; il ne connaît que les codes storage-full et read-only et renvoie sur 408 et 429 (:85) ; tv/app/remote-client.js:14-16 affiche `error` et recopie `code`. Ajouter des codes aux 409 est donc additif. 2) La classification par message est une décision écrite : l'ADR 0008 (décision 5, « cinq messages exacts », et ligne 37 du tableau des options) l'a retenue parce que les trois adaptateurs émetteurs étaient en lecture seule pendant la vague, et la nomme « dette ». La remédiation est légitime mais modifie cet ADR : le ticket doit l'amender, et f08:261 et :291, qui épinglent ces phrases, changent de sens.
- **Remède proposé par l'audit :** Un code par erreur qui traverse une frontière, posé là où le message est créé : `error.code` valant par exemple `CODEX_DISCONNECTED`, `CODEX_CONNECTION_LOST`, `CODEX_STALE_CONNECTION`, `CODEX_OUT_OF_SCOPE`, `CODEX_NOT_ALLOWED`, `MEDIA_INPUT_REFUSED`, `SESSION_REVOKED`, `QUESTION_RELEASED`, et pour HTTP `sequence-old`, `sequence-conflict`, `ingest-busy`. codex-perception classe sur le code. Les tests affirment le code par un helper `rejectsWith(promise, code)` ; un seul test par surface garde la phrase exacte (TSTA-16). Ordre : ajouter les codes sans retirer les messages, basculer les tests, puis basculer codex-perception.
- **Risque du remède selon le relecteur :** Basculer codex-perception sur les codes peut laisser un émetteur sans code : la description n'est alors plus redemandée, sans boucle ni erreur visible ; f08:291 et :342-394, qui passent par les émetteurs réels, le détectent s'ils sont migrés avant la bascule.

<a id="CORE-10"></a>
#### CORE-10 — Codes d'erreur dupliqués par littéral

**Verdict : confirmé** · priorité P2 · effort S · risque faible · Cœur et composition (`core/`, `runtime/`)

**Suite : pas de ticket.** Décision du propriétaire attendue (arbitrage A5) : le foyer unique des codes d'erreur n'est pas tranché. Faits vérifiés : littéraux en double pour TVLENS_STORAGE_FULL (core/session.cjs:6, adapters/disk-guard.cjs:4), TVLENS_VISION_TRANSIENT (core/session.cjs:9, adapters/codex-perception.cjs:16), TVLENS_RECAP_CAPACITY (core/living-recap.cjs:5, adapters/codex-recap.cjs:5). — _Reprise :_ Après la décision du propriétaire sur le foyer unique des codes.

Constat d'origine :

- Emplacement : `TVLENS_STORAGE_FULL` (`core/session.cjs:6`, `adapters/disk-guard.cjs:4`), `VISION_TRANSIENT` (`session.cjs:9`, `codex-perception.cjs:16`), `RECAP_CAPACITY` (`living-recap.cjs:5`, `codex-recap.cjs:5`) ; `error.timeout` (`surveillance.cjs:84`).
- Preuve : `runtime/` et `server/` importent le code depuis l'adaptateur, pas depuis le domaine.
- Remédiation : `core/errors.cjs` (codes et fabriques), importé par les adaptateurs.
- E : S. R : faible.

- **Risque du remède selon le relecteur :** Faible : StorageFullError doit rester la classe de adapters/disk-guard.cjs, que disk-guard.test vérifie par instanceof, seuls les codes migrant vers core/ ; détecté par disk-guard, architecture-f08, architecture-f09 et la garde d'architecture.

<a id="CORE-11"></a>
#### CORE-11 — Même refus, statuts HTTP différents

**Verdict : nuancé** · priorité P2 · effort S · risque moyen · Cœur et composition (`core/`, `runtime/`)

**Suite : pas de ticket.** Décision du propriétaire attendue, à consigner dans un ADR : quel statut pour « Session en cours de fermeture. » sur start, ask, open, resume et startSurveillance (erreurs nues aujourd'hui, donc 400, là où la fermeture répond déjà 503 session-closing ; écart reconnu par l'ADR 0007). Les clients de la TV décident sur le statut : changer 400 en 503 fait renvoyer au lieu d'abandonner. Aucune règle n'est inventée ici. — _Reprise :_ Après la décision du propriétaire et après jalon:contrat-fil ; le ticket portera le drapeau adr et la preuve côté client (A7).

Constat d'origine :

- Emplacement : `runtime/headless-runtime.cjs:655, 660, 707, 811, 985, 1020, 1076` contre `715, 790` ; `server/http.cjs:280-283`.
- Preuve : « Session en cours de fermeture. » part en `Error` nue (400 sans code) dans cinq méthodes, et en 503 `session-closing` dans `accept` et `ingest`.
- Impact : un client ne peut pas décider de réessayer de façon fiable.
- Remédiation : `runtime/refusals.cjs` (`closing`, `stale`, `stopped`, `readOnly`, `capturing`, `notFound`), utilisé partout.
- E : S. R : moyen (environ 178 assertions de tests portent sur des messages, comptage approximatif par grep).

- **Nuance du relecteur (elle prime) :** Fait exact, déjà reconnu comme écart dans ADR 0007 (Conséquences : « 503 pour les blocs et un 400 ailleurs »). Cinq méthodes en Error nue : start 660, ask 811, open 985, resume 1020, startSurveillance 1076 ; 655 et 707 sont deux autres refus nus (« Session obsolète. », « La session est arrêtée. »). Le risque annoncé vise la mauvaise cible : une seule assertion de test porte sur « en cours de fermeture » et quatre sur « Session obsolète » (dont tests/server-surveillance.test.cjs:57, qui fixe 400 sans code). Le vrai contrat est chez les clients TV, qui décident sur le statut : tv/transport.py:85 (statut &lt; 500 hors 408 et 429 = bloc rejeté sans réessai, sinon réessai pendant 30 s), tv/app/companion.js:240-244 (tout 400 = refus « passager » d'une vue), tv/capture.py:143. Effort M, pas S : c'est un changement de contrat HTTP à décider par ADR, avec un client TV déployé séparément du serveur.
- **Risque du remède selon le relecteur :** Passer un refus de 400 à 503 ou 409 change la politique de réessai de la capture Python et du panneau TV, dont une version plus ancienne peut rester installée ; détecté en partie seulement par tv-panel, tv-app-compat et chat-error-ui, les tests Python (tests/test_tv_*.py) n'étant pas lancés par npm test.

<a id="SEC-03"></a>
#### SEC-03 — Écoute non-loopback sans garde ni avertissement

**Verdict : nuancé** · priorité P2 · effort S · risque faible · Adaptateurs et frontières

**Suite :** [T048](travail/tickets/048-warn-at-server-start-when-the-listen-address-is-neither.md) « Warn at server start when the listen address is neither loopback nor Tailscale ».

**Part laissée de côté :** Reste du constat après L04-03 : refuser 0.0.0.0 ou :: sans réglage explicite est une décision du propriétaire (elle peut empêcher un serveur déjà déployé de démarrer ; la valeur de TVLENS_BIND sur le VPS n'a pas été consultée). — _Reprise :_ Après la décision du propriétaire, une fois L04-03 livré.

Constat d'origine :

- Emplacement : `server/main.cjs:40`.
- Preuve : `TVLENS_BIND` et `TVLENS_PORT` ne sont pas validés ; `0.0.0.0` n'est déconseillé que par un commentaire dans `deploy/runtime.env.example`.
- Gravité : faible (erreur d'opérateur). Le jeton circule alors en clair sur le LAN.
- Remédiation : refuser `0.0.0.0`/`::` sans opt-in explicite, avertir hors loopback et hors plage Tailscale.
- Effort S, risque faible. Tests : `deploy-unit`.

- **Nuance du relecteur (elle prime) :** Fond exact (server/main.cjs:40 ; mise en garde seulement en commentaire, deploy/runtime.env.example:2). Deux faits à corriger. Un TVLENS_PORT mal saisi arrête déjà le démarrage : listen(NaN) et listen(70000) lèvent ERR_SOCKET_BAD_PORT (vérifié par node -e), avec un message Node en anglais ; le seul vrai manque est TVLENS_BIND. Le test à étendre n'est pas deploy-unit (un seul test, sur TasksMax de l'unité systemd) mais tests/server-sessions.test.cjs:620-627, qui compare par deepEqual la forme rendue par settings() de server/main.cjs.

<a id="ADP-02"></a>
#### ADP-02 — Diagnostic Codex perdu

**Verdict : nuancé** · priorité P2 · effort S · Adaptateurs et frontières

**Suite :** [T047](travail/tickets/047-keep-the-redacted-codex-refusal-detail-as-the-cause-of-the.md) « Keep the redacted Codex refusal detail as the cause of the fixed message ».

**Part laissée de côté :** Reste du constat après L04-02 : écrire les traces d'échec quel que soit le rôle du client. tests/chat-trace.test.cjs, « failed turn emits correlated sanitized diagnostics without changing rejection » (l.4), exige par sa dernière assertion (l.14) qu'un client sans recherche web et de rôle par défaut n'écrive aucune ligne de trace pour un tour échoué, même avec TVLENS_CODEX_TRACE=1. Élargir la trace demande de modifier cette assertion : c'est une décision du propriétaire, pas un choix de ticket. — _Reprise :_ Après la décision du propriétaire sur la portée des traces Codex, une fois L04-02 livré.

Constat d'origine :

- Emplacement : `adapters/codex-rpc.cjs:68` (sortie d'erreur jetée), `:76` (`message.error` remplacé par un texte fixe), `:67` (fermeture muette au-delà de 4 Mo).
- Impact : un refus de Codex n'est pas explicable sans relancer à la main.
- Remédiation : garder une queue bornée et expurgée (`clean()` de `chat-trace.cjs`) en `cause` et dans la trace.
- Effort S.

- **Nuance du relecteur (elle prime) :** Preuve exacte (codex-rpc.cjs:67, :68, :76). Deux faits à corriger. `clean()` n'est pas exporté par chat-trace.cjs (exports ligne 44 : trace, safeError, isAuthFailure, VERSION) : il faut l'exporter ou passer par safeError. La trace n'écrit que si TVLENS_CODEX_TRACE=1 et seulement pour les rôles web ou surveillance (codex-session-client.cjs:171) : le refus d'une description ou d'un résumé resterait invisible sans élargir cette condition. Le texte fixe de :76 suit la règle du dépôt de ne pas renvoyer d'erreur de transport brute à l'utilisateur : garder le message, ne mettre le détail expurgé qu'en `cause`.

<a id="ADP-03"></a>
#### ADP-03 — Échec de configuration avalé au démarrage Mac

**Verdict : nuancé** · priorité P2 · effort S · Adaptateurs et frontières

**Suite :** [T053](travail/tickets/053-keep-the-config-read-when-its-cache-fails-and-journal-an.md) « Keep the config read when its cache fails and journal an unreadable cache » ; [T065](travail/tickets/065-stop-the-mac-launch-when-the-given-config-file-cannot-be.md) « Stop the Mac launch when the given config file cannot be read ».

Constat d'origine :

- Emplacement : `app/main.cjs:55`.
- Preuve : `loadConfig(...).catch(() => ({apiKey:'',…}))`.
- Impact : un `.env.local` illisible ou un `provider.enc` corrompu lance l'app sans chemins Whisper/ffmpeg ni `codexAuthHome`, à l'inverse du principe « un réglage mal saisi arrête le démarrage ».
- Remédiation : valeurs par défaut sur `ENOENT` seulement, sinon dialogue d'erreur.
- Effort S. Tests : `mac-ipc-contract:451`.

- **Nuance du relecteur (elle prime) :** Le catch de app/main.cjs:55 existe et avale bien, mais pas ce que dit le constat. Un provider.enc corrompu n'arrive jamais jusque-là : il est avalé dans loadConfig même (adapters/config.cjs:40-45, puis :51-54). Ce que main.cjs:55 masque réellement : une lecture de configPath qui échoue autrement que par ENOENT (config.cjs:10 traite déjà ENOENT) et un échec d'écriture du cache chiffré (config.cjs:33-34), auquel cas une configuration lue correctement est jetée. L'absence de chemins Whisper/ffmpeg et de codexAuthHome n'est pas propre au repli : le chemin normal sans fichier (config.cjs:47) ne les fournit pas non plus ; le repli perd en plus les bascules (backend local, index de fond). Remédiation : retirer le `.catch` suffit pour atteindre le dialogue déjà prévu en main.cjs:547-552 ; le cache corrompu demande un correctif séparé dans config.cjs.

<a id="ADP-05"></a>
#### ADP-05 — Autres `catch` vides qui masquent

**Verdict : nuancé** · priorité P2 · effort S · Adaptateurs et frontières

**Suite :** [T053](travail/tickets/053-keep-the-config-read-when-its-cache-fails-and-journal-an.md) « Keep the config read when its cache fails and journal an unreadable cache » ; [T054](travail/tickets/054-journal-unreadable-stores-instead-of-treating-them-as-absent.md) « Journal unreadable stores instead of treating them as absent ».

**Part laissée de côté :** Reste du constat après L04-08 et L04-09 : le catch vide du lien des identifiants dans createContext (adapters/codex-confinement.cjs l.254-262, auth.json et models_cache.json) demande de faire descendre le journal à travers adapters/codex-session-client.cjs, ce qui dépasse une session avec les trois magasins. Le catch de balayage de server/main.cjs:36 est voulu et commenté : il n'est pas un défaut. — _Reprise :_ Suite du lot déclenchée par L04-09, après jalon:journal.

Constat d'origine :

- Masquants : `embedding-store.cjs:17` (toute erreur donne un index vide, donc des embeddings repayés), `saved-moment-store.cjs` `list` (un passage conservé corrompu disparaît), `codex-confinement.cjs:261` (lien d'identifiants raté pour une autre raison qu'un fichier absent), `server/main.cjs:36`.
- Justifiés : `http.cjs:177`, `main.cjs:100,555`, `local-vlm-agent.cjs:14,47`, `remote-media.cjs:115`, `chat-trace.cjs:43`, `session-client.cjs:56,228,733`.
- Remédiation : filtrer sur `ENOENT`, journaliser le reste.
- Effort S.

- **Nuance du relecteur (elle prime) :** Trois des quatre « masquants » tiennent (embedding-store.cjs:17, saved-moment-store.cjs:11, codex-confinement.cjs:261). server/main.cjs:36 ne masque rien : sweepStaleContexts ne lève jamais par construction (codex-confinement.cjs:281-309) et le commentaire :35 en fait un choix voulu, comme le test mac-ipc-contract.test.cjs:467-470 côté Mac. Manquent à la liste : adapters/config.cjs:45 et :53 (cache chiffré corrompu avalé, plus grave que les cas cités) et adapters/viewing-settings.cjs:4. Compteur : 20 `catch {}` par grep dans adapters/ + app/main.cjs + server/, pas 19. Les 35 `.catch(() => {})` du même périmètre (12 dans app/main.cjs, 9 dans codex-session-client.cjs) ne sont pas classés, alors que plusieurs avalent une écriture disque (main.cjs:212).

<a id="UI-04"></a>
#### UI-04 — Erreurs avalées, rejets non gérés

**Verdict : nuancé** · priorité P2 · effort S · risque faible · Interfaces (Mac, TV, scripts Python)

**Suite :** [T050](travail/tickets/050-retry-a-failed-surveillance-registry-read-with-a-bounded.md) « Retry a failed surveillance registry read with a bounded backoff ».

**Part laissée de côté :** Reste du constat après L04-05 : écouteur global unhandledrejection, quatre gestionnaires asynchrones sans catch (app/renderer.js l.397, 398, 441-445, 569) et retrait du préfixe IPC en double (app/preload.cjs l.5-7 et cleanError de app/ui/text.mjs). Rien de cela n'est prouvable hors ligne tant que le renderer ne se charge pas sans Electron. — _Reprise :_ Après lot:L05 (tests/helpers/fake-dom.cjs) et un moyen de charger app/renderer.js hors Electron ; suite déclenchée par L04-05.

Constat d'origine :

- Preuve : 17 `catch` vides (lignes 143, 175, 303, 373, 500, 552, 561, 578-580, 586, 591, 657, 726, 799). `refreshRegistry` pose `registryKey = key` même après échec (l.657-658), donc pas de nouvel essai. Aucun écouteur `unhandledrejection`. Gestionnaires async sans `catch` aux lignes 397, 398, 568. Le préfixe IPC est retiré deux fois avec deux regex différentes (`preload.cjs:6`, `text.mjs:82`).
- Remède : un enrobage `guarded(fn)` commun vers `notice`, un écouteur global, et ne mémoriser la clé du registre qu'en cas de succès.
- Effort S, risque faible.

- **Nuance du relecteur (elle prime) :** 17 catch vides retrouvés aux lignes citées (deux à la l.500, deux à la l.578), aucun écouteur unhandledrejection, double retrait du préfixe IPC exact (app/preload.cjs:6, app/ui/text.mjs:82). Deux faits à rectifier. La l.568 a un catch : elle recopie le gestionnaire de open-library (l.566), qui en porte un ; les gestionnaires asynchrones sans catch sont aux l.397, 398, 441-445 (float-record) et 569 (nav-search). « Pas de nouvel essai » est trop fort : la clé du registre est remise à zéro à l'affichage de l'onglet Surveillance (l.724) et au changement de session (l.188, 542), et elle diffère dès que totals ou counts changent ; le cas réellement bloqué est une archive ouverte dont rien ne bouge. Plusieurs catch vides sont légitimes (play() aux l.175 et 561, localStorage aux l.586 et 591) : ils demandent un commentaire, pas un enrobage guarded().

<a id="TSTB-10"></a>
#### TSTB-10 — Assertions couplées au texte français et aux objets entiers

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Tests de comportement

**Suite : pas de ticket.** Dépend de CORE-10 (codes en un seul endroit, décision du propriétaire A5) et de la table code vers phrase ; son prérequis TSTB-04 relève d'un autre lot. A6 n'autorise ici que la caractérisation des textes, déjà faite ticket par ticket pour les textes touchés (L04-04, L04-06). — _Reprise :_ Après la décision sur le foyer des codes et le ticket CORE-10 qui en découlera.

- **Où :** tests/session-durable.test.cjs:173, 222, 392, 455, 506-526, 656, 699, 726, 738 ; tests/server-sessions.test.cjs:14, 247, 250, 255, 302, 413-417, 452-454 ; tests/surveillance.test.cjs:418, 478-500, 737, 744, 765-766, 808, 849-852 ; tests/surveillance-runtime.test.cjs:46-48, 272, 437, 477 ; tests/moment-index.test.cjs:12-13, 71, 162, 240 ; tests/latency.test.cjs:36
- **Preuve :** Sur 196 `assert.rejects` et `assert.throws` : 132 par regex sur le message, 17 par message exact, 8 par code seul, 20 sans aucune attente (latency:36, question-freshness:19 et 22, session-timeline:62 et 112 : n'importe quelle erreur passe), 19 par prédicat. 65 `assert.match` ou `doesNotMatch`. 193 littéraux français dans des lignes d'assertion (surveillance 42, server-sessions 27, surveillance-runtime 24, session-durable 18). « Écriture refusée par le disque » est retapé 12 fois pour un seul site de production, « Archive illisible » 9 fois. Constantes redéclarées au lieu d'être importées : `READ_ONLY` (server-sessions:14, pourtant exporté par headless-runtime.cjs:1148), `MEMORY_ONLY` et `UNREAD` (surveillance-runtime:46-47, alors que `REGISTRY_MESSAGES` est importé ligne 6). Objets entiers comparés : `index.status()` à 10 champs (moment-index:71, 162), `gaps` avec leur raison rédigée (surveillance:418, 737, 744, 765-766), liste des clés d'un état (:849-852).
- **Impact :** CORE-11 (refus par codes), CORE-15 (rédaction hors du domaine) et ADP-04 (codes pour la politique de reprise) touchent exactement ces chaînes. L'audit du cœur estimait 178 assertions ; ce périmètre seul en compte 149 sur un message et 193 littéraux.
- **Nuance du relecteur (elle prime) :** Total exact (196) ainsi que 65 `assert.match`/`doesNotMatch`, « Écriture refusée par le disque » 12 fois pour un site (local-store.cjs:11), « Archive illisible » 9 fois, READ_ONLY redéclaré (server-sessions:14, exporté en headless-runtime.cjs:1148), MEMORY_ONLY et UNREAD (surveillance-runtime:46-47). Trois faits faux. (1) 14 assertions sans attente, pas 20 : chat-codex:19, chat-sources:19, inspection-strategies:23 et 32, latency:36, session-optimization:23, session-timeline:112 et 126, transcription-language:18, verification:162, video-research:23, viewing-features:11 et 23, whisper-diagnostics:15. (2) Trois des cinq exemples cités ne sont pas nus : question-freshness:19 et 22 portent un prédicat sur la ligne suivante, session-timeline:62 une regex /discontinu/ ligne 64 (appels sur plusieurs lignes, mal lus par un comptage ligne à ligne). (3) Les deux compteurs sont intervertis : 8 par message exact, 17 par code ou nom (dont 11 `{ code: 'EIO' }`). Les 193 littéraux français n'ont pas été recomptés.
- **Remède proposé par l'audit :** Trois règles : (1) une erreur s'affirme par `{ code }` dès que `core/errors.cjs` existe (CORE-10) ; d'ici là, importer la constante de production au lieu de la retaper ; (2) la rédaction se teste une fois par message dans `tests/unit/core/wording.test.cjs` (table code vers phrase), et les autres tests affirment les codes et états déjà publiés à côté des libellés (`backlog.reason`, `registry.status`, `bucket`) ; (3) plus de `assert.rejects(p)` nu : aide `rejectsWith(p, code)`. Conversion fichier par fichier, quand on y passe.
- **Risque du remède selon le relecteur :** Convertir un message en code retire la seule vérification du libellé français que la TV et le Mac affichent ; la table code vers phrase doit exister avant la première conversion, et le compte d'assertions par fichier, avant et après, détecte une perte.

<a id="SEC-02"></a>
#### SEC-02 — Dossiers temporaires privés non balayés après un crash

**Verdict : nuancé** · priorité P3 · effort S · risque faible · Adaptateurs et frontières

**Suite : pas de ticket.** P3 : ne vaut pas une session. Faits vérifiés : les préfixes tvlens-ingest- (adapters/remote-media.cjs:72), tvlens-speech- (adapters/local-transcriber.cjs:74) et tvlens-inspect- (adapters/clip-inspector.cjs:13) sont absents de CONTEXT_PREFIXES (adapters/codex-confinement.cjs:230-234). Risque noté par le relecteur : un balayage par seul préfixe supprimerait le dossier d'un autre hôte actif. — _Reprise :_ Quand un ticket rouvre le balayage de adapters/codex-confinement.cjs (par exemple la suite d'ADP-05 sur le lien des identifiants), en étendant le test de balayage de tests/codex-confinement.test.cjs.

Constat d'origine :

- Emplacement : `adapters/codex-confinement.cjs:230-234`.
- Preuve : le balayage connaît `tvlens-verify-` (plus jamais créé) mais pas `tvlens-ingest-`, `tvlens-speech-`, `tvlens-inspect-`, `tvlens-agent-`.
- Gravité : faible. Images et son du visionnage restent dans tmp ; des crashs sont documentés (`deploy/tvlens.service:44-46`), atténués sur serveur par `PrivateTmp`.
- Remédiation : un module `scratch` unique (création, propriétaire, registre de préfixes) et balayage sur ce registre.
- Effort S, risque faible. Tests : `codex-confinement`.

- **Nuance du relecteur (elle prime) :** Faits exacts : CONTEXT_PREFIXES (codex-confinement.cjs:230-234) ignore tvlens-ingest- (remote-media.cjs:72), tvlens-speech- (local-transcriber.cjs:74) et tvlens-inspect- (clip-inspector.cjs:13) ; PrivateTmp=true en deploy/tvlens.service:29. Trois précisions. tvlens-agent- n'est créé que par l'adaptateur hérité codex-video-agent.cjs:10 (scripts et tests, aucun hôte). tvlens-verify- n'est plus créé en production, mais son balayage reste fixé par tests/codex-confinement.test.cjs:963-969 : le retirer de la liste casse ce test. Les dossiers média n'écrivent pas de fichier `owner` : un balayage étendu ne peut s'appuyer que sur l'âge (24 h) tant que le module scratch ne l'écrit pas.
- **Risque du remède selon le relecteur :** Un balayage élargi qui ne filtrerait que sur le préfixe supprimerait le dossier de travail d'un autre hôte actif sur la même machine ; le test de balayage de tests/codex-confinement.test.cjs:963-969 le détecte s'il est étendu aux nouveaux préfixes.

<a id="SEC-04"></a>
#### SEC-04 — ffmpeg et Whisper héritent de tout l'environnement

**Verdict : nuancé** · priorité P3 · effort S · risque faible · Adaptateurs et frontières

**Suite : pas de ticket.** P3 : ne vaut pas une session. Fait vérifié : aucun env passé au lancement de ffmpeg (adapters/ffmpeg.cjs:8) ni de Whisper (adapters/local-transcriber.cjs:82-83), qui héritent de tout l'environnement ; aucun chemin d'exploitation décrit. — _Reprise :_ Quand un ticket rouvre adapters/ffmpeg.cjs ou adapters/local-transcriber.cjs.

Constat d'origine :

- Emplacement : `adapters/remote-media.cjs:53`, `adapters/ffmpeg.cjs:8`, `adapters/local-transcriber.cjs:82`.
- Preuve : aucun `env` passé, alors que Codex reçoit une liste blanche (`codex-confinement.cjs:205-228`).
- Gravité : théorique. Il faudrait un binaire média compromis par un média forgé.
- Remédiation : réutiliser `childEnvironment` ; ajouter `-f wav` sur l'entrée audio distante.
- Effort S, risque faible.

- **Nuance du relecteur (elle prime) :** Preuve exacte : aucun `env` passé en remote-media.cjs:53, ffmpeg.cjs:8 et local-transcriber.cjs:82-83, alors que Codex reçoit une liste blanche (codex-confinement.cjs:205-228). Remédiation à préciser : `childEnvironment` est propre à Codex (clé CODEX_HOME, redirection de HOME) et vit dans codex-confinement.cjs ; un adaptateur média ne doit pas en dépendre. Forme cible : une liste blanche générique (PATH, HOME, TMPDIR, LANG, LC_ALL, plus les variables de bibliothèques dynamiques si un binaire installé en dépend) dans un module à part. `-f wav` sur remote-media.cjs:90 est faisable : l'en-tête RIFF/WAVE est déjà exigé en :88.
- **Risque du remède selon le relecteur :** Une liste blanche peut priver whisper-cli ou ffmpeg d'une variable dont le binaire installé dépend, et la transcription échouerait sans bruit puisque LocalTranscriber rend alors un texte vide (local-transcriber.cjs:106-109) ; seuls un essai réel ou le compteur `failed` des métriques le montrent, les tests utilisant de faux binaires.

<a id="SEC-05"></a>
#### SEC-05 — Durcissements sans chemin d'exploitation

**Verdict : confirmé** · priorité P3 · effort S · Adaptateurs et frontières

**Suite : pas de ticket.** P3 : ne vaut pas une session (durcissements sans chemin d'exploitation). Absence constatée de setPermissionRequestHandler dans app/. Le relecteur note qu'un refus global des permissions Electron ne se vérifie qu'au smoke Electron, interdit à une session de ticket, et qu'un journal des 401 doit être borné. — _Reprise :_ Le journal borné des 401 après jalon:journal, s'il est retenu ; les permissions Electron lors d'une session du propriétaire avec Electron réel.

Constat d'origine :

- Preuve : pas de limite ni de journal des 401 (jeton de 256 bits) ; comparaison non constante du jeton du pont loopback (`video-bridge.cjs:14-16`) ; pas de `setPermissionRequestHandler` ; CSP sans `base-uri`/`form-action` ; `apiKey` et jeton du modèle local voyagent dans `config` vers tous les runtimes (jamais journalisés : les six sites de journalisation ont été relus).
- Gravité : théorique.
- Remédiation : journal des 401, refus des permissions par défaut, objet `secrets` séparé.
- Effort S.

- **Risque du remède selon le relecteur :** Un journal des 401 sans borne écrirait une ligne par seconde pour une TV mal configurée qui interroge l'état en continu, et un refus global des permissions Electron pourrait couper la capture d'écran (supposé) ; le second ne se voit qu'au smoke Electron, pas dans les tests node.

<a id="ADP-14"></a>
#### ADP-14 — Sens des dépendances discutable

**Verdict : nuancé** · priorité P3 · effort S · Adaptateurs et frontières

**Suite : pas de ticket.** La part qui touche l'import des codes dépend de la même décision du propriétaire que CORE-10 (A5). Le reste (validateRemote importé par server/http.cjs:3 depuis adapters/remote-media.cjs, couplé au WeakSet validated l.28) est P3 : ne vaut pas une session. — _Reprise :_ Avec le ticket qui suivra la décision sur le foyer des codes ; le déplacement de validateRemote seulement si un ticket rouvre adapters/remote-media.cjs après L04-06.

Constat d'origine :

- Preuve : `STORAGE_FULL` vit dans `adapters/disk-guard.cjs:4` et est importé par `server/http.cjs:4`, `app/main.cjs:16` et le runtime. `server/http.cjs:3` importe `validateRemote` d'un adaptateur. `codex-video-agent` importe `codex-verifier`.
- Remédiation : codes d'erreur dans `core/`, validation dans la couche frontière.
- Effort S.

- **Nuance du relecteur (elle prime) :** Importateurs exacts (server/http.cjs:3-4, app/main.cjs:16, runtime/headless-runtime.cjs:20 ; codex-video-agent.cjs:5 importe codex-verifier). Fait manquant : le code existe déjà côté cœur, en littéral dupliqué. 'TVLENS_STORAGE_FULL' est défini en core/session.cjs:6 et adapters/disk-guard.cjs:4, 'TVLENS_VISION_TRANSIENT' en core/session.cjs:9 et adapters/codex-perception.cjs:16, 'TVLENS_RECAP_CAPACITY' en core/living-recap.cjs:5 et adapters/codex-recap.cjs:5 (idiome nommé par l'ADR 0008, point 1). Forme cible : un module de codes exporté par core/, importé par les adaptateurs et les hôtes (sens permis), ce qui supprime les trois doublons. À traiter avec SEC-01 et ADP-04 comme un seul chantier d'erreurs typées.
- **Risque du remède selon le relecteur :** Peu de risque : un import du cœur vers un adaptateur introduit par erreur est refusé par tests/architecture.test.cjs:5-14 ; déplacer validateRemote doit garder partagé le WeakSet `validated` (remote-media.cjs:28, :71), sinon chaque bloc de 13 Mo est validé deux fois, ce qu'aucun test ne mesure.

<a id="ADP-16"></a>
#### ADP-16 — Compteur de budget synchrone, verrou sans reprise

**Verdict : nuancé** · priorité P3 · effort S · Adaptateurs et frontières

**Suite : pas de ticket.** P3 : ne vaut pas une session. Le scénario d'arrêt brutal est déduit par l'audit, non reproduit ; la forme cible (pid dans le verrou, snapshot non écrivant) n'a pas de reproduction à corriger. — _Reprise :_ Quand un ticket rouvre adapters/trial-budget.cjs, avec un cas à deux processus ajouté à tests/budget.test.cjs.

Constat d'origine :

- Emplacement : `adapters/trial-budget.cjs:9-26`, `app/main.cjs:224`.
- Preuve : `openSync('wx')` sans détection de verrou périmé ; un compteur neuf est créé à chaque appel `deep:budget`.
- Impact : un arrêt brutal dans la fenêtre (quelques millisecondes) bloquerait les embeddings jusqu'à suppression manuelle.
- Effort S.

- **Nuance du relecteur (elle prime) :** Preuve exacte (transaction en trial-budget.cjs:9-27, verrou `wx` sans reprise ; le scénario d'arrêt brutal reste déduit, non reproduit). Trois précisions. Aucune remédiation n'est décrite ; forme cible : écrire le pid dans le verrou et le reprendre quand ce processus n'existe plus, et rendre snapshot() non écrivant. snapshot() (:46) passe par transaction() et réécrit le fichier à chaque lecture, donc à chaque `deep:budget` (renderer.js:281, :303) : c'est le vrai défaut de conception, alors que créer un UsageLedger par appel (main.cjs:224) est sans effet, l'objet n'ayant pas d'état. L'impact ne touche que les installations avec clé OpenRouter (embeddings facultatifs, session-runtime.cjs:118-125).
- **Risque du remède selon le relecteur :** Une reprise de verrou fondée sur l'âge seul laisserait deux processus écrire le compteur ensemble quand Mac et serveur partagent le même fichier .local/research-budget.json ; budget.test.cjs le détecte si un cas à deux processus y est ajouté.

<a id="TV-08"></a>
#### TV-08 — Sécurité de rendu : gravité faible

**Verdict : confirmé** · priorité P3 · effort S · Interfaces (Mac, TV, scripts Python)

**Suite : pas de ticket.** P3 : ne vaut pas une session. Faits vérifiés : innerHTML en tv/app/timeline-view.js:236 et tv/app/sessions-view.js:561, concaténation de sélecteur en timeline-view.js:323, pas de CSP dans tv/app/index.html. L'effet d'une CSP sur la TV ne se vérifie que sur l'appareil, hors de portée d'une session de ticket. — _Reprise :_ Le remplacement des deux innerHTML avec le ticket qui abaissera le cliquet inner_html ; la CSP lors d'une vérification du propriétaire sur la TV.

Constat d'origine :

- `innerHTML` : littéraux statiques seulement (`timeline-view.js:236`, `sessions-view.js:561`).
- `timeline-view.js:323` construit un sélecteur CSS par concaténation de `thumbnailId` (réseau). Au pire une `SyntaxError` attrapée. Remède : filtrer par `dataset`.
- `tv/app/index.html` n'a pas de CSP ; le Mac en a une stricte (`app/index.html:6`).
- Mac : adresses `tvlens-media://${id}` non encodées (`renderer.js:182`, `search-view.mjs:29`), ids produits par le cœur.
- Effort S.

- **Risque du remède selon le relecteur :** Remplacer les deux innerHTML par createElement doit conserver l'ordre et les classes des enfants que le rendu lit par position (node.children[0..3] à sessions-view.js:574-577, querySelector dans timeline-view.js), et une CSP ajoutée à tv/app/index.html pourrait bloquer les requêtes vers l'URL d'appairage, inconnue à l'écriture, ce qui ne se verrait que sur la TV ; le détecteraient les smokes TV et le cliquet inner_html.

<a id="OUBLI-02"></a>
#### OUBLI-02 — Un fichier de fournisseur illisible est avalé : l'app démarre sur la configuration par défaut sans rien dire

**Verdict : confirmé** · Signalement du relecteur — Adaptateurs et frontières

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T053](travail/tickets/053-keep-the-config-read-when-its-cache-fails-and-journal-an.md) « Keep the config read when its cache fails and journal an unreadable cache » ; [T054](travail/tickets/054-journal-unreadable-stores-instead-of-treating-them-as-absent.md) « Journal unreadable stores instead of treating them as absent ».

- **Signalement :** adapters/config.cjs:40-45 et :51-54 : un provider.enc illisible ou indéchiffrable est avalé (catch à commentaire seul, puis `return null`) et l'app démarre sur la configuration par défaut sans rien dire. C'est ce chemin, et non app/main.cjs:55, qui masque un cache corrompu. Même motif en adapters/viewing-settings.cjs:4.

<a id="OUBLI-05"></a>
#### OUBLI-05 — Même classe que SEC-01, non citée

**Verdict : nuancé** · Signalement du relecteur — Adaptateurs et frontières

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Emplacements vérifiés (adapters/codex-session-client.cjs, catch de tool() l.551 ; adapters/video-bridge.cjs:33 ; core/video-tools.cjs call() l.120-124), mais le contenu réel des messages n'a pas été tracé de bout en bout : la fuite d'un chemin reste supposée, et les destinataires sont le modèle Codex et le client MCP locaux, pas la TV. La correction suivrait la forme de L04-07 (texte générique, détail au journal). — _Reprise :_ Suite du lot déclenchée par L04-07, après jalon:journal.

- **Signalement :** Même classe que SEC-01, non citée : adapters/codex-session-client.cjs:549-552 renvoie `e.message` brut d'un outil au modèle Codex et adapters/video-bridge.cjs:33 au client MCP ; core/video-tools.cjs:122 relance l'erreur telle quelle. Le contenu réel de ces messages n'a pas été tracé de bout en bout (supposé : une erreur disque porte un chemin de l'hôte).

### L05 — Des aides de test partagées au lieu de copies

Vague 1 · 15 constats · 10 tickets

- [T055](travail/tickets/055-share-the-wait-helpers-of-the-tests-and-make-every-bounded.md) — Share the wait helpers of the tests and make every bounded wait fail aloud
- [T056](travail/tickets/056-move-the-mac-host-bench-out-of-the-ipc-contract-test-into-a.md) — Move the Mac host bench out of the IPC contract test into a shared helper
- [T057](travail/tickets/057-launch-the-mac-host-from-the-shared-bench-in-the-two.md) — Launch the Mac host from the shared bench in the two remaining test files
- [T058](travail/tickets/058-share-the-simulated-clocks-of-the-tests-instead-of-importing.md) — Share the simulated clocks of the tests instead of importing one from a script
- [T059](travail/tickets/059-share-one-hand-written-fake-dom-between-the-recap-view-and.md) — Share one hand-written fake DOM between the recap view and overlay card tests
- [T060](travail/tickets/060-use-the-shared-wait-helpers-in-the-session-and-moment-index.md) — Use the shared wait helpers in the session and moment index tests
- [T061](travail/tickets/061-use-the-shared-wait-helpers-in-the-server-recording-and.md) — Use the shared wait helpers in the server, recording and Codex client tests
- [T062](travail/tickets/062-leave-no-private-copy-of-a-wait-helper-in-the-test-files.md) — Leave no private copy of a wait helper in the test files
- [T063](travail/tickets/063-share-one-fake-codex-app-server-between-the-verification-and.md) — Share one fake Codex App Server between the verification and surveillance tests
- [T064](travail/tickets/064-start-the-headless-server-host-from-one-shared-helper-in-two.md) — Start the headless server host from one shared helper in two test files

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [TSTB-03](#TSTB-03) | Aides d'attente divergentes et tours de boucle comptés | nuancé | P0 | [T055](travail/tickets/055-share-the-wait-helpers-of-the-tests-and-make-every-bounded.md), [T060](travail/tickets/060-use-the-shared-wait-helpers-in-the-session-and-moment-index.md), [T061](travail/tickets/061-use-the-shared-wait-helpers-in-the-server-recording-and.md), [T062](travail/tickets/062-leave-no-private-copy-of-a-wait-helper-in-the-test-files.md) |
| [FLK-12](#FLK-12) | Helpers d'attente recopiés dans chaque fichier, dont trois qui abandonnent en silence | nuancé | P1 | [T055](travail/tickets/055-share-the-wait-helpers-of-the-tests-and-make-every-bounded.md), [T060](travail/tickets/060-use-the-shared-wait-helpers-in-the-session-and-moment-index.md), [T061](travail/tickets/061-use-the-shared-wait-helpers-in-the-server-recording-and.md), [T062](travail/tickets/062-leave-no-private-copy-of-a-wait-helper-in-the-test-files.md) |
| [TSTA-02](#TSTA-02) | Aucun module d'aide partagé : une quinzaine d'utilitaires recopiés de 2 à 20 fois, avec des sens différents | nuancé | P1 | [T055](travail/tickets/055-share-the-wait-helpers-of-the-tests-and-make-every-bounded.md), [T060](travail/tickets/060-use-the-shared-wait-helpers-in-the-session-and-moment-index.md), [T061](travail/tickets/061-use-the-shared-wait-helpers-in-the-server-recording-and.md), [T062](travail/tickets/062-leave-no-private-copy-of-a-wait-helper-in-the-test-files.md) |
| [TSTA-03](#TSTA-03) | Faux App Server Codex recopié 12 fois dans 11 fichiers ; 11 copies ignorent le contrat F05 et la plupart exercent une branche réservée aux doubles | nuancé | P1 | [T063](travail/tickets/063-share-one-fake-codex-app-server-between-the-verification-and.md) |
| [TSTA-04](#TSTA-04) | Harnais d'hôtes recopiés : 3 faux Electron (environ 670 lignes formatées) et un hôte serveur remonté dans 9 fichiers | nuancé | P1 | [T056](travail/tickets/056-move-the-mac-host-bench-out-of-the-ipc-contract-test-into-a.md), [T057](travail/tickets/057-launch-the-mac-host-from-the-shared-bench-in-the-two.md), [T064](travail/tickets/064-start-the-headless-server-host-from-one-shared-helper-in-two.md) |
| [TSTB-04](#TSTB-04) | Fabriques et doublures recopiées de fichier en fichier | confirmé | P1 | [T058](travail/tickets/058-share-the-simulated-clocks-of-the-tests-instead-of-importing.md), [T064](travail/tickets/064-start-the-headless-server-host-from-one-shared-helper-in-two.md) |
| [OPS-13](#OPS-13) | De l'infrastructure de test loge dans scripts/ | nuancé | P2 | [T058](travail/tickets/058-share-the-simulated-clocks-of-the-tests-instead-of-importing.md) |
| [TSTB-08](#TSTB-08) | Faux App Server Codex réécrit dans chaque fichier | nuancé | P2 | [T063](travail/tickets/063-share-one-fake-codex-app-server-between-the-verification-and.md) |
| [TSTB-11](#TSTB-11) | Doublures de ports écrites à la main, sans contrat commun | confirmé | P2 | pas de ticket |
| [TSTC-06](#TSTC-06) | Quatre faux DOM artisanaux incompatibles, aucune bibliothèque DOM | nuancé | P2 | [T059](travail/tickets/059-share-one-hand-written-fake-dom-between-the-recap-view-and.md) |
| [TSTC-16](#TSTC-16) | Méga-tests et banc d'hôte Electron enfermé dans un fichier de test | nuancé | P2 | [T056](travail/tickets/056-move-the-mac-host-bench-out-of-the-ipc-contract-test-into-a.md), [T057](travail/tickets/057-launch-the-mac-host-from-the-shared-bench-in-the-two.md) |
| [TSTC-17](#TSTC-17) | Trois doublures de luna-send décrivent la même réponse de la TV | confirmé | P3 | pas de ticket |
| [OUBLI-01](#OUBLI-01) | Doublure d'Electron en trois exemplaires, liée au nom de fichier de l'hôte | confirmé | — | [T056](travail/tickets/056-move-the-mac-host-bench-out-of-the-ipc-contract-test-into-a.md), [T057](travail/tickets/057-launch-the-mac-host-from-the-shared-bench-in-the-two.md) |
| [OUBLI-35](#OUBLI-35) | Programmes Node écrits dans des chaînes puis lancés comme processus | nuancé | — | pas de ticket |
| [OUBLI-38](#OUBLI-38) | Un harnais de contrat à deux hôtes existe déjà et n'est repris ni par TSTB-04 ni par TSTB-14 | confirmé | — | [T064](travail/tickets/064-start-the-headless-server-host-from-one-shared-helper-in-two.md) |

<a id="TSTB-03"></a>
#### TSTB-03 — Aides d'attente divergentes et tours de boucle comptés

**Verdict : nuancé** · priorité P0 · effort M · risque moyen · Tests de comportement

**Suite :** [T055](travail/tickets/055-share-the-wait-helpers-of-the-tests-and-make-every-bounded.md) « Share the wait helpers of the tests and make every bounded wait fail aloud » ; [T060](travail/tickets/060-use-the-shared-wait-helpers-in-the-session-and-moment-index.md) « Use the shared wait helpers in the session and moment index tests » ; [T061](travail/tickets/061-use-the-shared-wait-helpers-in-the-server-recording-and.md) « Use the shared wait helpers in the server, recording and Codex client tests » ; [T062](travail/tickets/062-leave-no-private-copy-of-a-wait-helper-in-the-test-files.md) « Leave no private copy of a wait helper in the test files ».

**Part laissée de côté :** Reste : remplacer les turns(N) par un vrai signal de fin exposé par la production (TSTB-09). — _Reprise :_ Après L05-08, avec le lot de TSTB-09.

- **Où :** tests/chat-instruction.test.cjs:9 ; tests/server-surveillance.test.cjs:14 ; tests/verification.test.cjs:76-77 ; tests/surveillance-runtime.test.cjs:12-19 ; tests/transcriber-sharing.test.cjs:23 ; tests/session-durable.test.cjs:19, 376, 554, 557, 665, 858 ; tests/surveillance.test.cjs:8, 717, 839 ; tests/server-sessions.test.cjs:16, 651 ; tests/architecture-f06.test.cjs:528-530 ; server/http.cjs:247-248, 268-271
- **Preuve :** Cinq `until` pour cinq sémantiques : échéance de 10 s (chat-instruction:9), de 15 s (server-surveillance:14), 2 000 tours (verification:77), 500 tours puis 5 s (surveillance-runtime:15-19), et 200 × 10 ms sans échec si la condition n'arrive jamais (transcriber-sharing:23). `settle` a deux sens incompatibles : « tant que watch.running » (4 fichiers) ou « N tours » (surveillance-runtime:12, verification:76). 19 boucles `for (i < 10|20) await tick()` dans 4 fichiers (13 dans session-durable), 29 `await turns(n)`, et un `flush(300)` de microtâches porté à 1 500 puis 6 000 selon le test (surveillance:717, 839). Échec intermittent 429, par lecture et non reproduit : architecture-f06:528-530 attend que le passage soit visible dans l'état puis renvoie le bloc, alors que http.cjs:247-248 répond 429 tant que `this.ingesting` est vrai, drapeau remis à faux seulement dans le `finally` (:268-271).
- **Impact :** Un `await` ajouté en production peut casser un test sans changement fonctionnel, ou laisser passer une assertion négative (« rien n'a démarré »). Sous charge, chaque fichier a sa propre tolérance. Le `until` muet transforme une attente ratée en assertion suivante trompeuse.
- **Nuance du relecteur (elle prime) :** Exact : cinq `until` à cinq sémantiques, 19 boucles comptées dans 4 fichiers (13 dans session-durable), 29 `await turns(n)`, flush(1500) lignes 717, 733, 741 et flush(6000) ligne 839 de surveillance.test. À corriger : (1) `settle` a sept définitions et trois sens, pas six et deux : s'ajoute moment-index:525 (6 tours, locale à un test). (2) Le 429 n'est plus « non reproduit » : les sondes du dossier de travail de l'audit le reproduisent (flaky/runA.log, runC1.log, runC2.log, probe-architecture-f06-slow.log) et un ticket 001-resent-block-duplicate-without-race existe déjà, non suivi par Git, dans le dépôt de travail (vu dans l'état Git, non lu) : cette partie fait doublon. Fenêtre exacte : le passage devient visible pendant `runtime.ingest` (server/http.cjs:258), avant `accepted.set` (:262) et `ingesting = false` (:270) ; d'où le 429 de :247-248. (3) « Faire attendre au test la fin de la première requête côté serveur » n'a pas de signal public : le client a abandonné, il ne reste que le champ `server.ingesting`, ce que TSTB-09 proscrit. Il faut exposer un signal ou fermer la fenêtre côté production, décision à prendre dans le ticket 001. (4) Trois autres échecs latents du périmètre, reproduits sous disque ralenti, manquent au constat (voir oublis).

<a id="FLK-12"></a>
#### FLK-12 — Helpers d'attente recopiés dans chaque fichier, dont trois qui abandonnent en silence

**Verdict : nuancé** · priorité P1 · effort M · risque faible · Déterminisme des tests

**Suite :** [T055](travail/tickets/055-share-the-wait-helpers-of-the-tests-and-make-every-bounded.md) « Share the wait helpers of the tests and make every bounded wait fail aloud » ; [T060](travail/tickets/060-use-the-shared-wait-helpers-in-the-session-and-moment-index.md) « Use the shared wait helpers in the session and moment index tests » ; [T061](travail/tickets/061-use-the-shared-wait-helpers-in-the-server-recording-and.md) « Use the shared wait helpers in the server, recording and Codex client tests » ; [T062](travail/tickets/062-leave-no-private-copy-of-a-wait-helper-in-the-test-files.md) « Leave no private copy of a wait helper in the test files ».

**Part laissée de côté :** Reste : la règle ESLint qui interdit de redéfinir une aide d'attente ou une minuterie nue dans un test, en laissant passer settle(watch), flush et eventually. — _Reprise :_ Après L05-08 et jalon:lint.

- **Où :** tests/review-regressions.test.cjs:24, 128 ; tests/transcriber-sharing.test.cjs:23 ; tests/verification.test.cjs:77 ; tests/architecture-f05.test.cjs:31-38 ; tests/architecture-f06.test.cjs:26-37 ; tests/architecture-f07.test.cjs:23-26 ; tests/surveillance-runtime.test.cjs:12-19 ; tests/chat-instruction.test.cjs:9 ; tests/server-surveillance.test.cjs:14
- **Preuve :** Aucun module partagé dans tests/. tick est défini dans 20 fichiers, deferred dans 15, until dans 13, settle dans 12, pause dans 5, bounded dans 4.

  Les 13 until ont 13 bornes différentes : 200×10 ms, 300×10 ms, 400×5 ms, 500×10 ms, 600×5 ms, 2000 tours, 10 s, 15 s, hybride tours puis 5 s.

  Deux until abandonnent sans échouer (review-regressions:24, transcriber-sharing:23), ainsi que la boucle review-regressions:128 : l'assertion suivante échoue alors avec un message sans rapport.
- **Impact :** Une correction d'attente ne se propage pas (FLK-02 en est la preuve). Le diagnostic d'un échec dépend du fichier où il survient.
- **Nuance du relecteur (elle prime) :** Compteurs retrouvés pour tick (20 fichiers), deferred (15), until (13), settle (12), pause (5). bounded est un helper d'attente dans 3 fichiers (architecture-f05:34, architecture-f06:34, codex-confinement:760), pas 4. Les 13 until ont 9 bornes distinctes, pas 13 : 600×5 ms revient dans f06, f07, f08, f10 et mac-ipc-contract. Les attentes muettes sont plus de trois : aussi architecture-f05:138, question-ceiling:202, et le helper eventually d'architecture-f06:32 (4 usages, choix documenté en 31). Prérequis à scinder : tests/support/wait.cjs ne dépend pas d'ESLint et doit sortir d'abord, puisque FLK-05 en dépend ; seule la règle attend ADP-15. La règle devra laisser passer les doublures qui temporisent légitimement : 78 setTimeout ou setImmediate bruts dans 41 fichiers, dont des faux serveurs (verification:99).

<a id="TSTA-02"></a>
#### TSTA-02 — Aucun module d'aide partagé : une quinzaine d'utilitaires recopiés de 2 à 20 fois, avec des sens différents

**Verdict : nuancé** · priorité P1 · effort M · risque faible · Tests nommés par chantier

**Suite :** [T055](travail/tickets/055-share-the-wait-helpers-of-the-tests-and-make-every-bounded.md) « Share the wait helpers of the tests and make every bounded wait fail aloud » ; [T060](travail/tickets/060-use-the-shared-wait-helpers-in-the-session-and-moment-index.md) « Use the shared wait helpers in the session and moment index tests » ; [T061](travail/tickets/061-use-the-shared-wait-helpers-in-the-server-recording-and.md) « Use the shared wait helpers in the server, recording and Codex client tests » ; [T062](travail/tickets/062-leave-no-private-copy-of-a-wait-helper-in-the-test-files.md) « Leave no private copy of a wait helper in the test files ».

- **Où :** tests/review-regressions.test.cjs:24 ; tests/architecture-f05.test.cjs:31-45, 51-53 ; tests/architecture-f06.test.cjs:26-50 ; tests/architecture-f07.test.cjs:22-30 ; tests/architecture-f09.test.cjs:50 ; tests/codex-confinement.test.cjs:28-38, 137-139 ; tests/codex-connect-race.test.cjs:9-11 ; package.json:11
- **Preuve :** Aucun test ne requiert un autre fichier de tests/ (seule exception : fixtures/tv-overlay-queue-cases.json). Copies sur tout tests/ : `tick` 20, `deferred` 15, `until` 13, `settle` 11, chemin `tvlens-test-absent-codex-home` 8, `tree` 6, `pause` 5, `failure` 4, `created` 3 (identiques), `disk` 3, `alive`/`gone` 3, `bounded` 2 plus une copie locale (codex-confinement:760), image JPEG par sharp dans 13 fichiers, capture de `process.stderr.write` 2. Divergences : le `until` de review-regressions:24 abandonne en silence après 3 s, les 12 autres appellent `assert.fail` (bornes de 2, 3 ou 5 s, vérification synchrone ou asynchrone) ; `settle` vaut 4, 6, 8 ou 10 tours selon le fichier ; `deferred` existe avec et sans `reject`, et `deferred(t, options)` de f09:50 désigne autre chose (un récap derrière un port) ; `tree` existe en 3 variantes (hachage seul en f06:50 et f07:30 ; hachage et date dans disk-guard, server-sessions, session-durable ; plus les liens dans session-delete), alors que le commentaire de f06 et f07 promet de voir une réécriture, qu'un hachage seul ne voit pas si le contenu est identique ; `pause` repose sur `setInterval` (f05:31, confinement:137), sur un `setTimeout` capturé (f07:22-23) ou sur `setTimeout` nu (f06:26) ; `disk` compte des lectures (f10:34) ou retient des écritures (server-sessions, session-durable) ; `fixture` nomme 15 fabriques sans rapport entre elles.
- **Impact :** Corriger une attente (TSTA-01, TSTA-13) demande 13 retouches. Un même nom n'a pas le même sens d'un fichier à l'autre. Chaque nouveau fichier recopie de 40 à 150 lignes d'en-tête, ce qui rend le déplacement de tests coûteux et pousse à créer un fichier par chantier.
- **Nuance du relecteur (elle prime) :** Fond confirmé : aucun test ne requiert un autre fichier de tests/ (sauf la fixture JSON), tick 20, deferred 15, until 13, tree 6 en 3 variantes, pause 5, created 3 identiques, disk 3, alive et gone 3, bounded 2 plus une copie locale, fixture 15. Compteurs à corriger. `failure` : 3 et non 4 (f05:40, f06:38, f08:22). `settle` : 12 définitions (11 en tête de fichier plus moment-index:525), dont 4 désignent autre chose, `settle(watch)` attend la fin de l'analyse (disk-guard:15, clip-unreadable:25, session-delete:15, session-durable:19) ; les tours valent 4, 6, 8, 10 ou 20 (surveillance-runtime:12). `until` : deux copies abandonnent en silence, pas une (review-regressions:24 et transcriber-sharing:23), 11 échouent, avec des bornes qui vont jusqu'à 10 s (chat-instruction:9) et 15 s (server-surveillance:14). Capture de process.stderr.write : 4 fichiers (f05:52, confinement:33, verification:186, chat-trace:5). JPEG par sharp : 12 fichiers. À HEAD (0262480, hors ROOT) : tests/helpers/ existe déjà (harness-repo.cjs) et scripts/check.mjs refuse tout fichier qui gagne une ligne de plus de 160 caractères ; les helpers s'écrivent donc formatés, et le commit de formatage est un vrai prérequis pour les fichiers migrés, pas un confort.

<a id="TSTA-03"></a>
#### TSTA-03 — Faux App Server Codex recopié 12 fois dans 11 fichiers ; 11 copies ignorent le contrat F05 et la plupart exercent une branche réservée aux doubles

**Verdict : nuancé** · priorité P1 · effort M · risque moyen · Tests nommés par chantier

**Suite :** [T063](travail/tickets/063-share-one-fake-codex-app-server-between-the-verification-and.md) « Share one fake Codex App Server between the verification and surveillance tests ».

**Part laissée de côté :** Reste : les faux App Server des neuf autres fichiers qui écrivent leur rpcFactory ; le retrait de la couture transportDouble dans adapters/codex-session-client.cjs est un changement de production qui demande une décision. — _Reprise :_ Déclenché par L05-09, par lots de fichiers.

- **Où :** tests/architecture-f05.test.cjs:220 ; tests/architecture-f08.test.cjs:307 ; tests/codex-confinement.test.cjs:48 ; tests/review-regressions.test.cjs:27 ; tests/codex-thread-rotation.test.cjs:19 ; tests/codex-connect-race.test.cjs:18 ; tests/refactor-boundaries.test.cjs:11 ; tests/surveillance-runtime.test.cjs:81 ; tests/verification.test.cjs:88 ; tests/chat-sources.test.cjs:4 ; tests/session-optimization.test.cjs:10, 21 ; adapters/codex-session-client.cjs:116, 428, 454
- **Preuve :** Divergences entre copies : `close()` ne rend la sortie du groupe de processus que dans f05:220, les 11 autres rendent `undefined`, soit le transport d'avant F05 ; `thread/start` répond la forme confinée dans 3 copies (confinement, verification, surveillance-runtime) et `{ thread: { id } }` nu dans les 9 autres ; `turn/interrupt` termine le tour dans 7 copies et est ignoré dans 5 ; `turn/started` est émis dans 7 et absent dans 5 ; les identifiants de fil viennent d'un compteur, d'une constante (`'thread'`, `'same'`) ou de `Math.random` (review-regressions:27) ; l'enregistrement d'un processus s'appelle `processes`, `connections` ou `child`, et `closed` y est un booléen ou un compteur. Un client construit avec `rpcFactory` sans `features` devient `transportDouble` (codex-session-client.cjs:116) : le refus d'un fil non confirmé (:428) ne s'applique pas et une branche propre s'exécute (:454). La majorité des tests du client parcourent donc un chemin que le produit ne prend jamais. S'y ajoutent 3 remplaçants à vrai processus (confinement:92, f05:417, codex-stream-decoding:8).
- **Impact :** Tout changement de protocole (nouvel événement, nouvelle requête à l'ouverture) se répercute dans 12 doubles. Les tests de rotation, de course et de revue ne couvrent pas la vérification de confinement faite à chaque fil. Deux branches de production n'existent que pour ces doubles.
- **Nuance du relecteur (elle prime) :** Preuve exacte : 12 copies dans 11 fichiers, et les quatre divergences se recomptent à l'identique (close qui rend la sortie du groupe : 1 contre 11 ; thread/start confiné : 3 contre 9 ; turn/interrupt honoré : 7 contre 5 ; turn/started émis : 7 contre 5). Le fait à corriger est la dernière phrase de la remédiation. `transportDouble` n'est pas un résidu : c'est une couture voulue, documentée (codex-session-client.cjs:90-97) et affirmée par des tests (confinement:359, :472, :486-492, :552-555) ; scripts/probe-confinement.cjs:469 la lit aussi. Les deux tests cités comme protecteurs (:457, :524) sont justement ceux qu'il faudrait réécrire. Son retrait est un changement de production (lignes 116, 129, 131, 428, 454) qui demande son propre ticket et une décision écrite, pas une suite du helper. Autre limite : un double fidèle par défaut ajoute config/read et la lecture des drapeaux, donc change les listes de requêtes affirmées telles quelles (confinement:492 attend ['initialize', 'thread/start'] ; connect-race et thread-rotation comptent leurs requêtes) : dans ces fichiers la migration ne se fait pas sans toucher aux assertions.

<a id="TSTA-04"></a>
#### TSTA-04 — Harnais d'hôtes recopiés : 3 faux Electron (environ 670 lignes formatées) et un hôte serveur remonté dans 9 fichiers

**Verdict : nuancé** · priorité P1 · effort M · risque moyen · Tests nommés par chantier

**Suite :** [T056](travail/tickets/056-move-the-mac-host-bench-out-of-the-ipc-contract-test-into-a.md) « Move the Mac host bench out of the IPC contract test into a shared helper » ; [T057](travail/tickets/057-launch-the-mac-host-from-the-shared-bench-in-the-two.md) « Launch the Mac host from the shared bench in the two remaining test files » ; [T064](travail/tickets/064-start-the-headless-server-host-from-one-shared-helper-in-two.md) « Start the headless server host from one shared helper in two test files ».

**Part laissée de côté :** Reste : les sept autres fichiers qui montent un hôte serveur (architecture-f06, dont host prend encore runtimeOptions comme objet, architecture-f07, architecture-f10, remote-server, server-surveillance, server-state-views, timeline-server) ; l'injection de spawn dans CodexRpc et RemoteMedia pour supprimer transportOn et assemblerOn (production) ; Module._load ne disparaît du banc Mac que si app/main.cjs exporte une fonction de démarrage. — _Reprise :_ Déclenché par L05-10 pour les montages ; avec le lot des adaptateurs pour le reste.

- **Où :** tests/mac-ipc-contract.test.cjs:134-141 ; tests/architecture-f05.test.cjs:620-676 ; tests/architecture-f07.test.cjs:215-310 ; tests/architecture-f06.test.cjs:121 ; tests/architecture-f07.test.cjs:169 ; tests/architecture-f10.test.cjs:75 ; tests/architecture-f05.test.cjs:150 ; tests/architecture-f06.test.cjs:415 ; adapters/codex-rpc.cjs:1 ; adapters/remote-media.cjs:4
- **Preuve :** `launch` (mac-ipc-contract:141), `launchMac` (f05:628) et `macHost` (f07:221) redéfinissent chacun `BrowserWindow`, `app`, l'objet `electron` à 12 clés, `loadPreload` (app/preload.cjs évalué par `new Function`), la liste `HOST_SETTINGS` (6 variables, 3 listes, aujourd'hui alignées sur app/main.cjs), la sauvegarde et la restauration de `process.argv`, `process.env` et `console.error`, et l'interception de `Module._load`. Les commentaires de f05 et f07 le disent : « The harness of tests/mac-ipc-contract.test.cjs, reduced to what this file needs ». Côté serveur, `new RemoteServer(` apparaît dans 9 fichiers et `new HeadlessRuntime(` dans 12, chacun avec sa fonction de requête, son jeton, son horloge et sa doublure d'assemblage (f06:121, f07:169, f10:75 dans le périmètre). `transportOn` (f05:150) et `assemblerOn` (f06:415) vident `require.cache` pour recharger un module, parce que `spawn` y est lié au chargement (codex-rpc.cjs:1, remote-media.cjs:4).
- **Impact :** Une API Electron de plus dans app/main.cjs, une septième variable d'hôte ou un changement de composition demande 3 mises à jour. Les harnais épousent la forme actuelle de main.cjs (noms des modules requis, drapeau `--smoke-test`) et casseront à son découpage.
- **Nuance du relecteur (elle prime) :** Preuve exacte : trois harnais Electron de 216, 170 et 284 lignes formatées (670), Module._load dans ces trois fichiers seulement, HOST_SETTINGS identique aux six variables lues par app/main.cjs:55-70, `new RemoteServer(` dans 9 fichiers et `new HeadlessRuntime(` dans 12, transportOn en f05:150 et assemblerOn en f06:415. Précisions. 1) Effort L plutôt que M : 6 des 9 fichiers serveur sont hors de ce périmètre et leurs fabriques divergent (server-sessions:73 prend `runtimeOptions` comme fonction, server-ingest-path:10 et f06:121 comme objet) ; f07 fige les minuteries de l'hôte, f05 garde les vraies. 2) Injecter `spawn` dans CodexRpc ouvre une seconde couture sur le transport Codex : la garde confinement:472 ne liste que rpcFactory, transportDouble, confinementMode et itemGuard ; `spawn` doit y entrer dans le même ticket. 3) Risque que l'audit ne dit pas : les trois harnais ne remplacent que les modules requis depuis un fichier dont le chemin finit par app/main.cjs. Dès que la composition quitte main.cjs, le remplacement de sweepStaleContexts cesse sans erreur et un lancement de tests balaie le vrai répertoire temporaire de la machine. C'est ce qui fait de ce constat un prérequis du découpage de main.cjs.

<a id="TSTB-04"></a>
#### TSTB-04 — Fabriques et doublures recopiées de fichier en fichier

**Verdict : confirmé** · priorité P1 · effort M · risque faible · Tests de comportement

**Suite :** [T058](travail/tickets/058-share-the-simulated-clocks-of-the-tests-instead-of-importing.md) « Share the simulated clocks of the tests instead of importing one from a script » ; [T064](travail/tickets/064-start-the-headless-server-host-from-one-shared-helper-in-two.md) « Start the headless server host from one shared helper in two test files ».

**Part laissée de côté :** Reste : les fabriques de système de fichiers, de média, de passage et de session recopiées d'un fichier à l'autre. — _Reprise :_ Après L05-10.

- **Où :** tests/session.test.cjs:6 ; tests/session-latency.test.cjs:9 ; tests/split-perception.test.cjs:9 ; tests/session-durable.test.cjs:18-21, 24-32, 37-66, 69-80 ; tests/session-delete.test.cjs:18-26, 29 ; tests/disk-guard.test.cjs:16, 27 ; tests/server-sessions.test.cjs:15-49, 61-69, 73-118 ; tests/remote-server.test.cjs:16, 57 ; tests/clip-audio.test.cjs:9 ; tests/media-asr-options.test.cjs:15 ; tests/reinspection-transcript-reuse.test.cjs:15 ; tests/moment-index.test.cjs:54 ; tests/perception-context.test.cjs:6
- **Preuve :** Compteurs du périmètre : `fixture` ×11 en quatre familles sans rapport (WatchSession en mémoire ×3, session sur disque ×3, hôte serveur ×2 plus 5 montages en ligne, soit 8 `new RemoteServer(` dans 6 fichiers et 5 `req` ; divers ×3) ; `tick` ×11 identiques ; `deferred` ×7 dont une variante avec reject ; `settle` ×6 ; `until` ×5 ; `tree` ×4 ; `gates` ×2 ; `refusing` et `disk` ×2 (26 lignes identiques) ; `passage` ×7 ; `wav` ×3 nommés et 3 en-têtes RIFF en ligne ; `data:image/jpeg;base64,YQ==` ×14 dans 9 fichiers. Divergences : `tree` de session-delete traite les liens symboliques (:23), pas les trois autres ; `wav` a trois signatures ; `passage(1)` commence à 0 ms dans moment-index:54 et surveillance:10, à 8 000 ms dans perception-context:6 et topic-summary:8.
- **Impact :** Toute évolution d'un port (store, perception, agent) se répercute dans une dizaine de fichiers ; les copies divergent sans que ce soit voulu ; écrire un nouveau test commence par recopier 50 lignes.

<a id="OPS-13"></a>
#### OPS-13 — De l'infrastructure de test loge dans scripts/

**Verdict : nuancé** · priorité P2 · effort S · risque faible · Scripts et outillage

**Suite :** [T058](travail/tickets/058-share-the-simulated-clocks-of-the-tests-instead-of-importing.md) « Share the simulated clocks of the tests instead of importing one from a script ».

**Part laissée de côté :** Reste : le moteur de scénarios reste dans scripts/simulate-stream.cjs, dont les lignes de plus de 160 caractères sont à reformater ; assemble et PROBE_* de scripts/package-tv-ambient.mjs relèvent de OPS-10 ; la règle d'import ESLint relève de jalon:lint. — _Reprise :_ Déclenché par L05-04 ; avec le lot d'OPS-10 et jalon:lint.

- **Où :** tests/stream-simulation.test.cjs:4 ; tests/question-ceiling.test.cjs:6 ; tests/tv-ambient-params.test.cjs:95 ; tests/tv-app-compat.test.cjs:103 ; tests/media-asr-options.test.cjs:179 ; scripts/simulate-stream.cjs:18 ; scripts/simulate-stream.cjs:420 ; scripts/package-tv-ambient.mjs:241 ; CONTRIBUTING.md:11
- **Preuve :** Deux tests importent `runScenario` et `VirtualClock` depuis scripts/simulate-stream.cjs ; deux autres importent `assemble`, PROBE_JS et PROBE_HTML depuis scripts/package-tv-ambient.mjs ; un cinquième exécute scripts/bench-whisper.cjs. CONTRIBUTING décrit scripts/ comme « outils de développement, packaging et essais ». Des horloges factices existent par ailleurs dans au moins 6 fichiers de tests.
- **Impact :** Trois scripts portent une partie de `npm test` sans que rien ne le signale : un ménage de scripts/ casse la suite, et les surcharges de lint prévues pour les scripts (console autorisé, seuils relâchés) s'appliqueraient à du code de test et de construction.
- **Nuance du relecteur (elle prime) :** Imports exacts : stream-simulation:4, question-ceiling:6, tv-ambient-params:95, tv-app-compat:103, media-asr-options:179. La remédiation est incomplète.

  (1) Elle ne déplace que VirtualClock, alors que tests/stream-simulation.test.cjs:4 importe `runScenario`, le moteur de scénarios lui-même. La règle proposée (« les tests n'importent jamais un script exécutable ») resterait violée. Il faut aussi extraire runScenario, SCENARIOS et MODELS dans un module importable ; le script ne garde que la ligne de commande (simulate-stream.cjs:404-420).

  (2) Mettre VirtualClock sous tests/ fait dépendre un script des tests. Le placer dans scripts/lib garde un seul sens de dépendance.

  (3) Hors ROOT (HEAD 208d2e3) : tests/helpers/ existe déjà ; ne pas créer tests/support à côté.

<a id="TSTB-08"></a>
#### TSTB-08 — Faux App Server Codex réécrit dans chaque fichier

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Tests de comportement

**Suite :** [T063](travail/tickets/063-share-one-fake-codex-app-server-between-the-verification-and.md) « Share one fake Codex App Server between the verification and surveillance tests ».

**Part laissée de côté :** Reste : la trace de protocole enregistrée et le test de contrat du faux App Server. — _Reprise :_ Après L05-09.

- **Où :** tests/surveillance-runtime.test.cjs:81-112 ; tests/verification.test.cjs:86-116 ; tests/chat-sources.test.cjs:4 ; tests/session-optimization.test.cjs:10, 21 ; hors périmètre : tests/architecture-f05.test.cjs:220, tests/architecture-f08.test.cjs:307, tests/codex-confinement.test.cjs:48, tests/review-regressions.test.cjs:27
- **Preuve :** Six fonctions `appServer` pour six signatures (`(script)`, `(script, {gate, config})`, `({script, interrupted})`, `(script, {detail})`, `({start, script, interrupted, config})`, `({handle})`), plus trois `rpcFactory` en ligne ; `thread/start` est écrit à la main dans 11 fichiers. Les réponses divergent : surveillance-runtime:91 rend `approvalPolicy` et `sandbox` ; verification ajoute `runtimeWorkspaceRoots` et `instructionSources` ; chat-sources:4 ne rend que `{thread:{id}}`. Les formes sont dites « measured on codex 0.160.1 » (verification:86-87).
- **Impact :** Un changement de forme du protocole (déjà constaté entre versions, voir ADP-01) oblige à corriger neuf doublures ; celles qui omettent la politique n'exercent pas le contrôle de confinement.
- **Nuance du relecteur (elle prime) :** Les six `appServer` et leurs signatures sont exacts (surveillance-runtime:81, verification:88, architecture-f05:220, architecture-f08:307, codex-confinement:48, review-regressions:27), `thread/start` est bien écrit à la main dans 11 fichiers, et les formes divergent comme dit. Mais il y a au moins douze faux App Server distincts, pas neuf : s'ajoutent codex-thread-rotation:22, codex-connect-race:20, refactor-boundaries:19 et architecture-f05:210 et 435. Les doublures qui omettent la politique passent grâce à une tolérance voulue et documentée (codex-session-client.cjs:90-97, 428, 454, « TEST SEAM ») : ce n'est pas un oubli, mais la duplication reste. Effort plutôt L si les tests de chantier sont inclus (26 `thread/start` dans codex-confinement).

<a id="TSTB-11"></a>
#### TSTB-11 — Doublures de ports écrites à la main, sans contrat commun

**Verdict : confirmé** · priorité P2 · effort M · risque faible · Tests de comportement

**Suite : pas de ticket.** Le contrat commun des doublures de ports suppose les fabriques de TSTB-04 et une coordination avec CORE-04 et CORE-09. — _Reprise :_ Après L05-10 et la suite de TSTB-04, une fois les lots de CORE-04 et CORE-09 découpés.

- **Où :** tests/session-durable.test.cjs:198-201, 403-404, 502, 570-571 ; tests/session.test.cjs:6 ; tests/session-latency.test.cjs:9 ; tests/surveillance-runtime.test.cjs:24-43, 183-184 ; tests/video-research.test.cjs:4 ; tests/moment-index.test.cjs:47-53, 529 ; runtime/session-runtime.cjs:56, 102, 120, 189 ; core/ports.cjs
- **Preuve :** 18 `new WatchSession(` dans 9 fichiers, chacun avec son `media = { put, read, remove }` sur une Map et son `archive = { save }` ; doublures partielles (`perception: {}, media: {}` en session-durable:502 ; `store: {}` en surveillance-runtime:184) ; cache d'embeddings en mémoire écrit 3 fois. 14 doublures à voie unique `observe:` (4 fichiers) font vivre l'ancien `drain` (CORE-04, CORE-05), contre 26 à deux voies. `smoke: true` ×20 dans 11 fichiers : les tests reposent sur les doublures logées dans la composition de production. Aucun test ne rejoue les mêmes assertions sur une doublure et sur l'adaptateur réel ; `core/ports.cjs` n'est importé par aucun test.
- **Impact :** Une doublure peut s'écarter de LocalSessionStore (`flush`, `seal`, `lease`, `saveManifest` absents) sans alerte. CORE-04 (paramètre `providers`) et CORE-09 (ports réels) devront toucher une vingtaine de fichiers de tests.
- **Remède proposé par l'audit :** `tests/helpers/memory-ports.cjs` : `memoryStore()`, `memoryArchive()`, `scriptedPerception({ transcribe, observeVisual })`, `memoryEmbeddingCache()`. `tests/contract/session-store.contract.cjs` exporte `storeContract(makeStore)`, exécuté deux fois (doublure, LocalSessionStore sur dossier temporaire) ; même schéma pour EmbeddingStore. Dans les tests, remplacer `smoke: true` par des `overrides` explicites tirés de ces aides, pour que CORE-04 puisse supprimer le drapeau.
- **Risque du remède selon le relecteur :** Retirer `smoke: true` des tests ne suffit pas à supprimer le drapeau, que app/main.cjs:38-130 et le smoke Electron utilisent aussi, et un contrat exécuté sur la doublure et sur LocalSessionStore peut révéler des écarts réels qui cassent des tests existants ; la double exécution du contrat les montre dès le premier lancement.

<a id="TSTC-06"></a>
#### TSTC-06 — Quatre faux DOM artisanaux incompatibles, aucune bibliothèque DOM

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Tests des interfaces

**Suite :** [T059](travail/tickets/059-share-one-hand-written-fake-dom-between-the-recap-view-and.md) « Share one hand-written fake DOM between the recap view and overlay card tests ».

**Part laissée de côté :** Reste : les tests qui ont besoin de sélecteurs ou d'attributs reflétés ; une bibliothèque DOM est une installation, sur décision du propriétaire. — _Reprise :_ Après L05-05, sur décision du propriétaire.

- **Où :** tests/architecture-f09.test.cjs:227-231 ; tests/tv-overlay-queue.test.cjs:228-236 ; tests/mac-ui.test.cjs:529-532 ; tests/recording.test.cjs:22-31 ; package.json:29-33 ; app/ui/format.js:28-29 ; app/ui/recap-view.js:28 ; app/ui/shell.js:21
- **Preuve :** f09 : createElement + append, replaceChildren, setAttribute, et `querySelectorAll: () => []`. tv-overlay-queue : appendChild, removeChild, firstChild, hidden, ownerDocument. mac-ui : conteneur à insertBefore, replaceChild, removeChild. recording : document.createElement rendant un canvas, MediaRecorder et minuteries dans un bac vm. Aucune ne répond à un sélecteur, or app/ui en utilise : `details[open][data-key]` (format.js:28-29), `.recap-extra-sources[open]` (recap-view.js:28), `closest('button')` (shell.js:21). devDependencies : @electron/packager, electron, playwright-core. Besoins côté TV relevés par grep : 68 `.focus`, 25 `document.activeElement`, 3 `showModal`, 3 `scrollIntoView`, touches par keyCode.
- **Impact :** Chaque test DOM réinvente sa doublure. Avec `querySelectorAll: () => []`, keepOpen et la conservation des sources dépliées deviennent des no-op dans le test f09 : une régression y est invisible.
- **Nuance du relecteur (elle prime) :** Les quatre doublures existent aux lignes citées et aucune ne répond à un sélecteur. Fait faux dans l'impact : keepOpen n'est pas exercé par le test f09, car app/ui/recap-view.js n'importe que element et formatTime ; seule la conservation des sources dépliées (recap-view.js:28) y devient un no-op. keepOpen (job-card.js:15, surveillance-dom.js:49) n'est exécuté par aucun test. Critère à ajouter à l'essai de bibliothèque : l'API popover (togglePopover, hidePopover, évènement toggle et newState, app/ui/shell.js:16-21), absente de plusieurs bibliothèques DOM. tests/chat-error-ui.test.cjs:12 et 16-17 exige que window et document soient absents du global : withDom ne tient que grâce à l'isolement d'un processus par fichier de node --test.

<a id="TSTC-16"></a>
#### TSTC-16 — Méga-tests et banc d'hôte Electron enfermé dans un fichier de test

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Tests des interfaces

**Suite :** [T056](travail/tickets/056-move-the-mac-host-bench-out-of-the-ipc-contract-test-into-a.md) « Move the Mac host bench out of the IPC contract test into a shared helper » ; [T057](travail/tickets/057-launch-the-mac-host-from-the-shared-bench-in-the-two.md) « Launch the Mac host from the shared bench in the two remaining test files ».

**Part laissée de côté :** Reste : le découpage du méga-test de mac-ipc-contract et les tables de libellés de mac-ui et tv-panel. — _Reprise :_ Après L05-03.

- **Où :** tests/mac-ipc-contract.test.cjs:45-57, 141-225, 227-371 ; tests/architecture-f05.test.cjs:624 ; tests/architecture-f07.test.cjs:218 ; tests/mac-ui.test.cjs:399-469, 573-613 ; tests/tv-panel.test.cjs:503-545
- **Preuve :** Le test de la l.227 porte 79 assertions sur 145 lignes (459 après Prettier) et sept comportements dans son titre. mac-ui : 270 assertions pour 15 tests ; tv-panel : 235 pour 19 ; mac-ipc-contract : 231 pour 12 ; lignes jusqu'à 357 caractères. Après Prettier, fonctions de plus de 80 lignes : 14 dans mac-ui, 12 dans tv-panel, 11 dans mac-ipc-contract. Le chargement du preload par `new Function('require', source)` est écrit trois fois (l.52, f05:624, f07:218). `loadBridge`, `launch`, `stage`, `until`, `capture`, `analysed` (une centaine de lignes) vivent dans le fichier de test ; il n'existe pas de dossier tests/helpers.
- **Impact :** Un échec arrête le test à sa première assertion et cache les suivantes : c'est ce qui a masqué 19 des 24 sites cassés par le formatage. Le banc d'hôte, l'actif de test le plus précieux du Mac, n'est pas réutilisable par les autres fichiers.
- **Nuance du relecteur (elle prime) :** Compteurs exacts : 79 assertions aux l.227-371, 459 lignes après Prettier, 270/15, 235/19, 231/12, lignes jusqu'à 357 caractères, 14, 12 et 11 fonctions de plus de 80 lignes. Portée à corriger : ce n'est pas le seul chargement du preload qui est écrit trois fois mais le banc d'hôte entier, en trois variantes (launch ici ; launchMac dans tests/architecture-f05.test.cjs:628, à minuteurs réels ; macHost dans tests/architecture-f07.test.cjs:221, à minuteurs figés et journal propre). « f05 et f07 l'importent » demande donc un banc paramétrable (minuteurs, wrap, journal), pas un simple changement de chargeur. C'est le constat TSTA-04 déjà vérifié : fusionner. Restent propres à ce constat le découpage du test de la l.227 et les tables de libellés.

<a id="TSTC-17"></a>
#### TSTC-17 — Trois doublures de luna-send décrivent la même réponse de la TV

**Verdict : confirmé** · priorité P3 · effort M · risque faible · Tests des interfaces

**Suite : pas de ticket.** Ne vaut pas une session à lui seul : P3 sur trois doublures de luna-send, avec TSTC-08 en prérequis et une simulation pilotée par Chrome. — _Reprise :_ Avec le lot de TSTC-08.

- **Où :** tests/tv_fakes/luna-send:1-66 ; tests/tv_fakes/arecord:1-20 ; scripts/simulate-tv-ambient.mjs:42-130 ; tests/test_tv_ambient.py:43-76 ; tests/test_tv_capture_gate.py:191 ; tests/test_tv_ambient.py:794, 904
- **Preuve :** (1) Exécutable tests/tv_fakes/luna-send, piloté par un dossier de scénario TVLENS_FAKE_LUNA (replies.json, oneshot.json, windows.json, journal calls.jsonl), utilisé par les deux suites Python. (2) `FAKE_LUNA`, second exécutable Python écrit en chaîne dans scripts/simulate-tv-ambient.mjs:44 et déposé dans un dossier bin temporaire l.130. (3) Classe `FakeLuna` en processus avec horloge simulée (test_tv_ambient.py:43). tests/tv_fakes n'est référencé que par les deux tests Python et docs/lg-ambient.md.
- **Impact :** Une correction apprise sur l'appareil (forme de `timingServiceResponse`, champs de getForegroundWindowInfo) doit être reportée à la main en trois endroits ; la simulation de bout en bout peut diverger des tests sans que rien le signale.
- **Remède proposé par l'audit :** scripts/simulate-tv-ambient.mjs place tests/tv_fakes en tête du PATH et écrit son scénario dans TVLENS_FAKE_LUNA, après ajout au faux partagé de ce qui lui manque. Réponses par défaut dans un fichier unique tests/fixtures/tv-luna-replies.json, lu par l'exécutable et par la classe FakeLuna (qui reste, pour l'horloge simulée). README d'une page dans tests/tv_fakes décrivant le format de scénario.
- **Risque du remède selon le relecteur :** Le faux de la simulation déduit les fenêtres de son journal et pilote l'ouverture de pages dans Chrome ; remplacé par le faux à fichiers de scénario, une passe (off, relay, passthrough) peut changer de sens sans échouer : comparer les sorties de scripts/simulate-tv-ambient.mjs avant et après.

<a id="OUBLI-01"></a>
#### OUBLI-01 — Doublure d'Electron en trois exemplaires, liée au nom de fichier de l'hôte

**Verdict : confirmé** · Signalement du relecteur — Adaptateurs et frontières

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T056](travail/tickets/056-move-the-mac-host-bench-out-of-the-ipc-contract-test-into-a.md) « Move the Mac host bench out of the IPC contract test into a shared helper » ; [T057](travail/tickets/057-launch-the-mac-host-from-the-shared-bench-in-the-two.md) « Launch the Mac host from the shared bench in the two remaining test files ».

- **Signalement :** Doublure d'Electron en trois exemplaires, liée au nom de fichier de l'hôte : tests/mac-ipc-contract.test.cjs:141-183, tests/architecture-f05.test.cjs:628-668 et tests/architecture-f07.test.cjs:235-275 ne substituent sweepStaleContexts, DiskGuard et les runtimes que si le `require` vient de app/main.cjs (:173, :660, :257). Tout découpage de l'hôte Mac (ADP-06, ADP-07) passe d'abord par une doublure unique, indépendante du fichier appelant.

<a id="OUBLI-35"></a>
#### OUBLI-35 — Programmes Node écrits dans des chaînes puis lancés comme processus

**Verdict : nuancé** · Signalement du relecteur — Tests nommés par chantier

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Les programmes Node écrits en chaînes dans architecture-f05, architecture-f08 et codex-confinement ne se ramènent à aucune aide de ce lot. — _Reprise :_ Après L05-08, quand les sondes de confinement seront reprises.

- **Signalement :** Programmes Node écrits dans des chaînes puis lancés comme processus : l'audit en compte 3, il y en a au moins 8 emplacements (tests/architecture-f05.test.cjs:112, :417, :471 ; tests/codex-confinement.test.cjs:92, :130, :504 ; tests/architecture-f06.test.cjs:95-97 ; tests/architecture-f08.test.cjs:294 ; tests/codex-stream-decoding.test.cjs:11). Ce code échappe à Prettier, à ESLint et aux mesures de complexité. S'y ajoutent deux dépendances hors tests que les constats TSTA-03, 07, 08 et 09 oublient : scripts/probe-confinement.cjs:469-484 lit les champs privés du client, et les commentaires de adapters/codex-session-client.cjs:92 et adapters/codex-verifier.cjs:53 nomment tests/codex-confinement.test.cjs comme le lieu de la garde.

<a id="OUBLI-38"></a>
#### OUBLI-38 — Un harnais de contrat à deux hôtes existe déjà et n'est repris ni par TSTB-04 ni par TSTB-14

**Verdict : confirmé** · Signalement du relecteur — Tests de comportement

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T064](travail/tickets/064-start-the-headless-server-host-from-one-shared-helper-in-two.md) « Start the headless server host from one shared helper in two test files ».

**Part laissée de côté :** Reste : réutiliser le harnais à deux hôtes de architecture-f07 (serverHost, HOSTS, onBothHosts). — _Reprise :_ Après L05-03 et L05-10.

- **Signalement :** Un harnais de contrat à deux hôtes existe déjà et n'est repris ni par TSTB-04 ni par TSTB-14 : tests/architecture-f07.test.cjs:169 (`serverHost`), :221 (`macHost`), :311-312 (`HOSTS`, `onBothHosts`), sept scénarios lignes 322-460. Avec tests/server-sessions.test.cjs:73, tests/server-ingest-path.test.cjs:10 et tests/architecture-f06.test.cjs:121, cela fait quatre montages d'hôte serveur à faire converger dans l'aide `serverHost`.

### L06 — Des tests qui attendent un fait, pas un délai

Vague 1 · 15 constats · 12 tickets

- [T066](travail/tickets/066-drive-the-question-checkpoint-of-the-server-host-with-an.md) — Drive the question checkpoint of the server host with an injected timer _(demande un ADR)_
- [T067](travail/tickets/067-hold-the-session-clock-of-the-mac-host-in-its-tests-instead.md) — Hold the session clock of the Mac host in its tests instead of pausing
- [T068](travail/tickets/068-gate-close-during-reconnect-and-retry-tests-on-a-named-step.md) — Gate close-during-reconnect and retry tests on a named step, not a count
- [T069](travail/tickets/069-order-abandoned-run-and-held-write-tests-by-a-signal-instead.md) — Order abandoned-run and held-write tests by a signal instead of a delay
- [T070](travail/tickets/070-let-a-test-drive-the-lifetime-of-an-external-mcp-context.md) — Let a test drive the lifetime of an external MCP context
- [T071](travail/tickets/071-inject-the-disk-into-the-session-store-and-library-with-a.md) — Inject the disk into the session store and library with a fault double _(demande un ADR)_
- [T072](travail/tickets/072-let-a-session-say-what-it-still-has-in-flight-and-when-it-is.md) — Let a session say what it still has in flight and when it is at rest _(demande un ADR)_
- [T073](travail/tickets/073-give-the-server-host-a-barrier-that-resolves-once-nothing-is.md) — Give the server host a barrier that resolves once nothing is in flight
- [T074](travail/tickets/074-wait-on-the-host-barrier-in-server-host-tests-instead-of.md) — Wait on the host barrier in server-host tests instead of polling its state
- [T075](travail/tickets/075-move-the-durable-session-disk-faults-onto-the-injected-disk.md) — Move the durable-session disk faults onto the injected disk double
- [T076](travail/tickets/076-move-the-server-session-disk-faults-onto-the-injected-disk.md) — Move the server-session disk faults onto the injected disk double
- [T077](travail/tickets/077-move-the-disk-guard-and-session-deletion-disk-faults-onto.md) — Move the disk-guard and session-deletion disk faults onto the injected disk

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [FLK-04](#FLK-04) | Hôte Mac sur horloge réelle : rétention de 50 ms et captures qui dorment 20 ms | nuancé | P1 | [T067](travail/tickets/067-hold-the-session-clock-of-the-mac-host-in-its-tests-instead.md) |
| [FLK-06](#FLK-06) | Aucune barrière « hôte au repos » : chaque test la reconstitue à partir d'états internes | nuancé | P1 | [T072](travail/tickets/072-let-a-session-say-what-it-still-has-in-flight-and-when-it-is.md), [T073](travail/tickets/073-give-the-server-host-a-barrier-that-resolves-once-nothing-is.md), [T074](travail/tickets/074-wait-on-the-host-barrier-in-server-host-tests-instead-of.md) |
| [FLK-07](#FLK-07) | Minuteries du runtime non injectées : setTimeout global simulé dans un processus qui fait du vrai HTTP | nuancé | P2 | [T066](travail/tickets/066-drive-the-question-checkpoint-of-the-server-host-with-an.md) |
| [FLK-09](#FLK-09) | Entrelacements visés en comptant des microtâches | nuancé | P2 | [T068](travail/tickets/068-gate-close-during-reconnect-and-retry-tests-on-a-named-step.md) |
| [FLK-10](#FLK-10) | Absence prouvée par une pause réelle, et temps virtuel avancé au rythme du sondage | nuancé | P2 | [T067](travail/tickets/067-hold-the-session-clock-of-the-mac-host-in-its-tests-instead.md) |
| [FLK-11](#FLK-11) | Suppositions « c'est fini maintenant » et délais réels courts passés au produit | nuancé | P2 | [T069](travail/tickets/069-order-abandoned-run-and-held-write-tests-by-a-signal-instead.md), [T070](travail/tickets/070-let-a-test-drive-the-lifetime-of-an-external-mcp-context.md) |
| [TSTA-11](#TSTA-11) | Tests calés sur le nombre d'étapes internes (micro-tâches, lectures) | confirmé | P2 | [T068](travail/tickets/068-gate-close-during-reconnect-and-retry-tests-on-a-named-step.md) |
| [TSTA-13](#TSTA-13) | Preuves d'absence par sommeil et attentes bornées hétérogènes | nuancé | P2 | [T067](travail/tickets/067-hold-the-session-clock-of-the-mac-host-in-its-tests-instead.md), [T074](travail/tickets/074-wait-on-the-host-barrier-in-server-host-tests-instead-of.md) |
| [TSTB-12](#TSTB-12) | Disque fautif simulé par un mock global de fs | confirmé | P2 | [T071](travail/tickets/071-inject-the-disk-into-the-session-store-and-library-with-a.md), [T075](travail/tickets/075-move-the-durable-session-disk-faults-onto-the-injected-disk.md), [T076](travail/tickets/076-move-the-server-session-disk-faults-onto-the-injected-disk.md), [T077](travail/tickets/077-move-the-disk-guard-and-session-deletion-disk-faults-onto.md) |
| [TSTB-13](#TSTB-13) | Temps réel et cinq mécanismes d'horloge factice | nuancé | P2 | [T070](travail/tickets/070-let-a-test-drive-the-lifetime-of-an-external-mcp-context.md) |
| [FLK-08](#FLK-08) | Attentes à nombre de tours fixe placées devant du disque réel | nuancé | P3 | pas de ticket |
| [OUBLI-12](#OUBLI-12) | Simuler le setTimeout global capture aussi les délais du client HTTP de Node | confirmé | — | [T066](travail/tickets/066-drive-the-question-checkpoint-of-the-server-host-with-an.md) |
| [OUBLI-13](#OUBLI-13) | Un second entrelacement visé en comptant des microtâches | confirmé | — | [T068](travail/tickets/068-gate-close-during-reconnect-and-retry-tests-on-a-named-step.md) |
| [OUBLI-14](#OUBLI-14) | Tests Python sur temps réel non analysés | nuancé | — | pas de ticket |
| [OUBLI-25](#OUBLI-25) | Tests Python dépendants du temps réel, non reliés à la stabilité de la suite | nuancé | — | pas de ticket |

<a id="FLK-04"></a>
#### FLK-04 — Hôte Mac sur horloge réelle : rétention de 50 ms et captures qui dorment 20 ms

**Verdict : nuancé** · priorité P1 · effort M · risque moyen · Déterminisme des tests

**Suite :** [T067](travail/tickets/067-hold-the-session-clock-of-the-mac-host-in-its-tests-instead.md) « Hold the session clock of the Mac host in its tests instead of pausing ».

- **Où :** tests/mac-ipc-contract.test.cjs:216-220, 676, 719-752 (échec 752), 754 ; tests/architecture-f05.test.cjs:677-680 ; tests/architecture-f07.test.cjs:289-291 ; app/main.cjs:63-67 ; runtime/session-runtime.cjs:64 ; core/session.cjs:141, 180-186, 379
- **Preuve :** app/main.cjs ne passe pas readClock : session-runtime.cjs:64 prend performance.now(). Les tests font avancer l'horloge de session en dormant (pause(20) avant chaque capture : mac-ipc 218 et 676, f05 678, f07 290) et règlent une rétention de 50 ms réelles (748).

  Le test 719 suppose que l'ingestion et l'analyse tiennent dans ces 50 ms. Sinon prune() efface le média avant le balayage piloté par l'horloge virtuelle.

  Reproduit : sonde large +10 ms, « out of the window, and not swept yet » faux en :752 (1 lancement, load 9,2). À +5 ms sur 3 appels le fichier passe 12/12, rien n'en est conclu.
- **Impact :** La marge dépend du disque et de sharp : échec intermittent sous charge. Les durées de passages et le temps virtuel écoulé varient d'une machine à l'autre, donc un échec ne se rejoue pas à l'identique.
- **Nuance du relecteur (elle prime) :** Le fond tient (quatre pause(20) retrouvées : mac-ipc 218 et 676, f05 678, f07 290 ; rétention 50 ms en 748 ; échec en 752 au journal). Trois faits à corriger. 1) L'appel sans horloge est en app/main.cjs:303-306 (compose appelle createSessionRuntime sans readClock ni wallClock) ; les lignes 63-67 ne lisent que TVLENS_MEDIA_RETENTION_MS. 2) L'analyse ne balaie pas : hors minuterie, seuls land() (core/session.cjs:141) et ask() (379) appellent prune(). La fenêtre de 50 ms est consommée par l'ingestion seule (IPC, écriture média, miniature sharp), entre la lecture d'elapsedMs (219) et le prune de fin d'ingestion. 3) « Piloté par le substitut d'Electron » n'est pas une forme réalisable : Electron n'expose pas d'horloge et main.cjs est un script sans paramètre. Forme réalisable sans prérequis ni changement de production : l'interception Module._load, qui enveloppe déjà createSessionRuntime (mac-ipc-contract:178, architecture-f05:662, architecture-f07:259), passe readClock: () => clock, et capture() avance clock au lieu de dormir. La variante « composition Mac paramétrée » dépend, elle, d'ADP-06 et ADP-07. Effort S à M selon la forme retenue.

<a id="FLK-06"></a>
#### FLK-06 — Aucune barrière « hôte au repos » : chaque test la reconstitue à partir d'états internes

**Verdict : nuancé** · priorité P1 · effort M · risque moyen · Déterminisme des tests

**Suite :** [T072](travail/tickets/072-let-a-session-say-what-it-still-has-in-flight-and-when-it-is.md) « Let a session say what it still has in flight and when it is at rest » ; [T073](travail/tickets/073-give-the-server-host-a-barrier-that-resolves-once-nothing-is.md) « Give the server host a barrier that resolves once nothing is in flight » ; [T074](travail/tickets/074-wait-on-the-host-barrier-in-server-host-tests-instead-of.md) « Wait on the host barrier in server-host tests instead of polling its state ».

**Part laissée de côté :** Reste hors des douze tickets : la barrière n'est livrée que pour la session et l'hôte serveur (l'hôte Mac tient le même état dans des variables de module de app/main.cjs) ; onze autres fichiers de test sondent encore watch.running (architecture-f05, architecture-f10, chat-instruction, clip-unreadable, disk-guard, server-ingest-path, server-surveillance, session-delete, server-state-views, session-durable, timeline-server) ; dans server-sessions, les tests de sauvegarde différée (aide locale ask ligne 692, lignes 711-775) et les attentes de store.serial des lignes 241, 657 et 676 sont laissés par L06-09. — _Reprise :_ Fichiers restants : après L06-09, par lot de fichiers. Hôte Mac : avec l'unification des hôtes du lot L11 (CORE-01).

- **Où :** tests/architecture-f06.test.cjs:139, 280, 350 ; tests/architecture-f07.test.cjs:187 ; tests/server-sessions.test.cjs:98-106 ; runtime/headless-runtime.cjs:738-741 ; core/session.cjs:92 ; adapters/local-store.cjs:202
- **Preuve :** Les tests sondent watch.running (17 boucles), store.serial (40 lectures), runtime.admitted et server.ingesting (f06), runtime.unsaved et checkpointTimer (f07:187), runtime.moving() (f06:350) et deep.jobs (13 lectures).

  Le produit a les morceaux : operation.settled, watch.landed() (jamais appelé par un test), store.flush(), job.done. Il n'a aucune barrière unique. FLK-01 et FLK-03 sont deux instances d'une barrière incomplète.
- **Impact :** Chaque nouveau test d'hôte choisit sa propre approximation du repos. Un await ajouté en production casse des tests sans rapport, ou les fait passer à tort.
- **Nuance du relecteur (elle prime) :** Constat juste : aucune barrière n'existe, et watch.landed() n'a qu'un appelant (runtime/session-runtime.cjs:496), aucun dans les tests. Compteur faux : deep.jobs est lu 45 fois dans 11 fichiers de tests (14 fois sous la forme runtime.deep.jobs), pas 13. La définition proposée d'idle() est incomplète au regard de son propre inventaire : elle omet les questions (job.done et la sauvegarde différée unsaved/checkpointTimer, qu'architecture-f07:187 attend en temps réel) et le registre de surveillance (runtime.surveillance.flush(), server-surveillance:205). Trois points à fixer dans la forme cible. 1) idle() ne rejette jamais, alors que store.flush() rejette sur écriture refusée (adapters/local-store.cjs:204-205). 2) Elle est bornée et nomme ce qui est encore en cours, car beaucoup de tests tiennent volontairement une doublure. 3) « Aucune analyse en cours » doit dire quoi faire quand une question retient la voie : running est faux avec une file non vide (core/session.cjs:227 et vers 308). Écrite avant CORE-01, elle l'est deux fois (app/main.cjs et HeadlessRuntime). Effort plutôt L que M.

<a id="FLK-07"></a>
#### FLK-07 — Minuteries du runtime non injectées : setTimeout global simulé dans un processus qui fait du vrai HTTP

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Déterminisme des tests

**Suite :** [T066](travail/tickets/066-drive-the-question-checkpoint-of-the-server-host-with-an.md) « Drive the question checkpoint of the server host with an injected timer ».

- **Où :** tests/server-sessions.test.cjs:688, 696, 759 ; runtime/headless-runtime.cjs:326, 334, 409, 767 ; tests/architecture-f06.test.cjs:191, 238, 264 ; core/moment-index.cjs:22
- **Preuve :** HeadlessRuntime arme ses minuteries directement : setInterval (326, 334), checkpoint des questions (409), attente de préparation (767). Pour les piloter, server-sessions remplace le setTimeout global (696, 759) dans un processus qui appelle aussi fetch ; f06 leur donne 40 ms réelles (191, 238, 264).

  Observé 1 fois sur 2 sous sonde large +10 ms (load 7,4 puis 7,8) : le fichier échoue alors que ses 14 tests passent, avec « generated asynchronous activity after the test ended … Cannot destructure property 'socket' of 'parser.deref(...)' » attribué au test 688. Cette ligne vient du client HTTP intégré à Node (chaîne présente dans le binaire).

  L'enchaînement exact entre minuteries simulées et client HTTP n'est pas établi, et l'échec n'est pas rendu déterministe.
- **Impact :** Un échec de fichier sans test fautif, donc sans piste. Les tests du checkpoint dépendent du comportement interne de Node.
- **Nuance du relecteur (elle prime) :** Lignes exactes (headless-runtime 326, 334, 409, 767 ; server-sessions 696, 759 ; f06 191, 238, 264 ; journal : 14 tests passés, fichier en échec). Le mécanisme, donné comme non établi, se lit dans l'undici embarqué de Node 24.12 : le parseur HTTP arme ses délais par le setTimeout global lu à l'appel, avec un WeakRef (setTimeout(onParserTimeout, delay, new WeakRef(this))), et onParserTimeout déstructure parser.deref() sans garde. Après t.mock.timers.enable({ apis: ['setTimeout'] }), les fetch de f.req arment ces délais sur l'horloge simulée ; tick() les déclenche, et l'erreur survient si le parseur a été ramassé entre-temps, d'où un échec qui dépend du GC. Lu, non rejoué de façon déterministe : le statut reste « supposé ». Portée à réduire : l'échec observé ne demande que l'injection de la minuterie du checkpoint (headless-runtime.cjs:409-411, effacée en 417 et 633). Les deux setInterval (326, 334) sont unref et déjà pilotés à la main par runtime.tick() (32 appels dans les tests) ; la borne de 767 est une expiration attendue, donc stable. Effort S, sans le prérequis CORE-13. Le plan par hôte de l'ADR 0003 (une minuterie simple par hôte) n'interdit pas cette injection.

<a id="FLK-09"></a>
#### FLK-09 — Entrelacements visés en comptant des microtâches

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Déterminisme des tests

**Suite :** [T068](travail/tickets/068-gate-close-during-reconnect-and-retry-tests-on-a-named-step.md) « Gate close-during-reconnect and retry tests on a named step, not a count ».

- **Où :** tests/review-regressions.test.cjs:316 ; tests/codex-thread-rotation.test.cjs:121, 152, 173 ; tests/codex-connect-race.test.cjs:41 ; tests/architecture-f06.test.cjs:526
- **Preuve :** review-regressions.test.cjs:316 : « for (let i = 0; i &lt; 6; i++) await Promise.resolve(); // the turn's prepare() is now removing that directory ». Le test atteint un point précis de la chaîne asynchrone du produit en comptant six microtâches. Les autres sites ont la même forme avec 5 ou 10 tours ; ils sont repérés par motif, non lus un par un.
- **Impact :** Un await ajouté ou retiré en production déplace le point visé : le test continue de passer sans couvrir l'entrelacement qu'il nomme.
- **Nuance du relecteur (elle prime) :** Un seul des six sites cités a la forme décrite : review-regressions:316 (citation exacte). Un second, non cité, l'a aussi : review-regressions:71 (trois await Promise.resolve() avant close()). Les cinq autres sont d'une autre nature : codex-thread-rotation 121 et 152 prouvent une absence après une barrière déjà tenue par un deferred (running, connecting) ; codex-thread-rotation 173 et codex-connect-race 41 laissent retomber après un rejet attendu ; architecture-f06 526 prouve qu'aucune annulation n'arrive après le départ du client. La doublure à barrière proposée y existe déjà : ces cinq sites relèvent de FLK-08 et FLK-10. Portée réelle : 2 sites dans un fichier, effort S et non M.

<a id="FLK-10"></a>
#### FLK-10 — Absence prouvée par une pause réelle, et temps virtuel avancé au rythme du sondage

**Verdict : nuancé** · priorité P2 · effort L · risque faible · Déterminisme des tests

**Suite :** [T067](travail/tickets/067-hold-the-session-clock-of-the-mac-host-in-its-tests-instead.md) « Hold the session clock of the Mac host in its tests instead of pausing ».

**Part laissée de côté :** Reste hors des douze tickets : L06-02 ne retire que les pauses liées à l'horloge de session. Les quinze preuves d'absence de tests/architecture-f05.test.cjs (92, 131, 262, 271, 281, 292, 339, 357, 361, 373, 403, 454, 492, 512, 516) et tests/codex-confinement.test.cjs:401 demandent un point d'arrivée propre au client Codex (couture de production) ; les pauses de scénario d'architecture-f07 (333, 352, 356, 411, 511, 525) et les autres pauses de mac-ipc-contract tournent sur l'hôte Mac, qui n'a pas de barrière. — _Reprise :_ Client Codex : après L06-03 (doublures de transport tenues). Hôte Mac : après L06-08 et l'unification des hôtes du lot L11, qui donnera la barrière à app/main.cjs.

- **Où :** tests/architecture-f05.test.cjs:92, 131, 262, 271, 281, 292, 339, 357, 361, 373, 403, 454, 492, 512, 516 ; tests/architecture-f07.test.cjs:333, 352, 356, 411, 511, 525 ; tests/mac-ipc-contract.test.cjs:204-212, 313, 366, 442, 483, 494, 553, 725-726, 751, 775, 780, 794, 811 ; tests/codex-confinement.test.cjs:401
- **Preuve :** 65 pauses à durée littérale. La forme dominante est « pause de 20 à 600 ms, puis vérifier que rien ne s'est produit » (f05 : 15, f07 : 6, mac-ipc : 13).

  15 sites alternent un tick virtuel et 5 à 20 ms réelles pour laisser le disque finir (mac-ipc : 8, server-sessions : 5, f05 : 2). Les 14 until(t, …, stepMs) de mac-ipc avancent l'horloge virtuelle à chaque tour de sondage : le temps virtuel écoulé dépend de la vitesse de la machine.

  Aucun échec reproduit par les sondes disque ni par le blocage de processus.
- **Impact :** Sous charge, ces assertions passent sans rien prouver, l'événement redouté n'ayant pas eu le temps d'arriver. Elles coûtent du temps réel à chaque lancement.
- **Nuance du relecteur (elle prime) :** Compteurs cohérents (52 pause(N) et 11 setTimeout littéraux, 14 until(t, …, stepMs) dans mac-ipc-contract). Les prérequis ne couvrent qu'une partie des sites : idle() et l'horloge injectée concernent les hôtes (mac-ipc-contract, architecture-f07). Les 15 sites d'architecture-f05 et codex-confinement:401 testent le transport et le client Codex, sans runtime d'hôte : l'absence y est déjà tenue par une barrière (minuterie simulée non avancée en f05 91-94, sortie du groupe tenue par un deferred en 260-263), la pause n'étant qu'une marge. Il leur faut un point d'arrivée propre au client, pas idle(). Le coût en temps réel est faible : la suite complète tourne en 15 à 17 s.

<a id="FLK-11"></a>
#### FLK-11 — Suppositions « c'est fini maintenant » et délais réels courts passés au produit

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Déterminisme des tests

**Suite :** [T069](travail/tickets/069-order-abandoned-run-and-held-write-tests-by-a-signal-instead.md) « Order abandoned-run and held-write tests by a signal instead of a delay » ; [T070](travail/tickets/070-let-a-test-drive-the-lifetime-of-an-external-mcp-context.md) « Let a test drive the lifetime of an external MCP context ».

- **Où :** tests/review-regressions.test.cjs:128, 132 ; tests/chat-instruction.test.cjs:53 ; tests/transcriber-sharing.test.cjs:46-56 ; tests/local-vlm-agent.test.cjs:103-106, 119 ; tests/architecture-f06.test.cjs:159, 191, 456, 466 ; tests/video-research.test.cjs:40 ; tests/living-recap.test.cjs:74 ; tests/whisper-diagnostics.test.cjs:37 ; tests/server-ingest-path.test.cjs:57 ; tests/architecture-f08.test.cjs:356, 369 ; tests/question-ceiling.test.cjs:200-204
- **Preuve :** « the abandoned run has settled by now » après 120 ms réelles (review-regressions:132). « the host is now waiting for that write » après 20 ms (chat-instruction:53). Un faux Whisper de 600 ms censé être tué avant sa fin (transcriber-sharing:46-56). « Date.now() - abortedAt &lt; 1000 » (local-vlm-agent:106). Des délais de production réels de 10 à 150 ms aux autres sites.

  À la lecture, l'issue attendue est le plus souvent l'expiration elle-même, donc stable ; les quatre premiers supposent qu'un travail réel finit avant le délai.

  Non reproduit : blocage de processus 60 ms toutes les 80 ms (6 fichiers) et 700 ms toutes les 1000 ms (7 fichiers), tous passés. Rien n'en est conclu.
- **Impact :** Marges de 20 à 600 ms face à des processus enfants et au disque : échec rare, ou scénario différent de celui que le test annonce.
- **Nuance du relecteur (elle prime) :** Citations exactes aux sites lus (review-regressions 128-132, chat-instruction 53, transcriber-sharing 46-56, local-vlm-agent 106 et 119, architecture-f06 456 et 466, question-ceiling 200-204). Portée : sur 17 sites, l'audit dit lui-même que l'expiration est l'issue attendue pour la plupart. Les sites à traiter sont cinq : les quatre nommés, plus question-ceiling 200-201 (un appel qui doit aboutir dans les 80 ms réels de vie du contexte). Prérequis faux : aucun de ces sites ne dépend des minuteries du runtime (FLK-07). chat-instruction 53 demande un signal d'arrivée sur l'écriture tenue (doublure, ou FLK-06) ; les faux binaires ne demandent rien. « Minuterie injectée » n'existe aujourd'hui que dans MomentIndex, MomentSearch et CodexVerifier : l'étendre à DeepAsk, LivingRecap, RemoteMedia ou LocalVlmAgent est un changement de production par classe, inutile là où l'expiration est le résultat voulu.

<a id="TSTA-11"></a>
#### TSTA-11 — Tests calés sur le nombre d'étapes internes (micro-tâches, lectures)

**Verdict : confirmé** · priorité P2 · effort M · risque moyen · Tests nommés par chantier

**Suite :** [T068](travail/tickets/068-gate-close-during-reconnect-and-retry-tests-on-a-named-step.md) « Gate close-during-reconnect and retry tests on a named step, not a count ».

- **Où :** tests/review-regressions.test.cjs:71, 316 ; tests/codex-connect-race.test.cjs:39 ; tests/architecture-f08.test.cjs:49, 91, 106, 113, 131, 143, 158, 170, 215, 218 ; tests/codex-thread-rotation.test.cjs:121, 152, 173
- **Preuve :** review-regressions:71 attend exactement 3 micro-tâches (`await Promise.resolve()` trois fois) pour que `close()` tombe « while the recycle is removing its directory » ; :316 en attend 6 pour tomber pendant le `prepare()` du tour. codex-connect-race:39 compte sur le fait que `close()` arrive « during the first filesystem await of connect() ». f08 retient « the third read of the passage » par `++reads === 3` (:143, :158) et affirme le nombre de lectures média dans 10 assertions. codex-thread-rotation attend 5 tours de boucle avant d'affirmer qu'une requête n'est pas partie (:121, :152, :173).
- **Impact :** Ajouter ou retirer un `await` dans `connect()`, `rotateThread()` ou la description déplace l'instant visé : le test continue de passer sans plus couvrir la course qu'il nomme, ou échoue sans régression.

<a id="TSTA-13"></a>
#### TSTA-13 — Preuves d'absence par sommeil et attentes bornées hétérogènes

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Tests nommés par chantier

**Suite :** [T067](travail/tickets/067-hold-the-session-clock-of-the-mac-host-in-its-tests-instead.md) « Hold the session clock of the Mac host in its tests instead of pausing » ; [T074](travail/tickets/074-wait-on-the-host-barrier-in-server-host-tests-instead-of.md) « Wait on the host barrier in server-host tests instead of polling its state ».

**Part laissée de côté :** Reste hors des douze tickets : mêmes sites que le reste de FLK-10 (f05, f07 côté Mac, codex-confinement), plus la course de 150 ms de tests/architecture-f06.test.cjs:313, preuve d'absence sans fait positif à attendre, laissée telle quelle. Le dossier tests/process/ et la borne unique TVLENS_TEST_WAIT_MS proposés par le constat sont écartés (arbitrage A1 : tests à plat ; la relecture note que la borne unique raccourcirait deux attentes). — _Reprise :_ Avec le reste de FLK-10 (après L06-03 pour le client Codex, après le lot L11 pour l'hôte Mac).

- **Où :** tests/architecture-f05.test.cjs:32, 92, 131, 138, 262-292, 339-373, 403, 454, 492, 512-516, 678 ; tests/architecture-f07.test.cjs:26, 290, 333, 352-356, 411, 511, 525 ; tests/review-regressions.test.cjs:24, 128-132 ; tests/architecture-f06.test.cjs:30-37
- **Preuve :** 30 `await pause(n)` à durée fixe dans le périmètre (f05 18, f07 8, f06 2, confinement 2), presque tous pour prouver qu'une chose n'arrive pas : « await pause(30) » puis `assert.equal(f.started(), 1)` (f05:262). 59 `until(...)` bornés à 2, 3 ou 5 s et 48 `bounded(...)`. review-regressions:132 attend 120 ms réels pour qu'un processus abandonné « ait fini », et son `until` (:24) n'échoue jamais. Les fichiers du périmètre cumulent 27,6 s sur 75,7 s de durée de test cumulée (36 %) : f06 8,2 s et codex-confinement 9,4 s, parce qu'ils lancent de vrais processus enfants et de vraies écoutes HTTP.
- **Impact :** Une preuve d'absence par sommeil passe à tort quand la machine est lente (le fait interdit arrive après la pause), et une attente bornée échoue quand elle est très lente. Les deux sens sont possibles sous charge, ce que TSTA-01 illustre.
- **Nuance du relecteur (elle prime) :** Les 30 `await pause(n)` se recomptent (f05 18, f07 8, f06 2, confinement 2), comme les 59 `until(` et les 48 `bounded(`. À corriger. 1) « Presque tous » est trop fort : 5 de ces pauses sont le pas d'une attente active (f05:32, f06:30, :32, f07:26, confinement:138) et 3 laissent avancer une horloge (f05:138, :678, f07:290) ; il reste environ 22 preuves d'absence. 2) Les durées (27,6 s sur 75,7 s) ne sont pas vérifiées. 3) `server.idle()` ne suffit pas là où l'attente porte sur du vrai disque : en f05:262 le client attend une sortie de groupe que le test tient, mais `remaining()` lit le système de fichiers, et f07:333 mêle minuteries simulées et écritures réelles. L'état de repos doit inclure les sondes de fichiers (created, treeRemovals). 4) Un dossier tests/process/ ne serait pas lancé par le contrôle de HEAD (scripts/check.mjs:98-99, liste à plat). 5) Une borne unique de 5 s raccourcit deux attentes existantes (chat-instruction 10 s, server-surveillance 15 s).

<a id="TSTB-12"></a>
#### TSTB-12 — Disque fautif simulé par un mock global de fs

**Verdict : confirmé** · priorité P2 · effort M · risque moyen · Tests de comportement

**Suite :** [T071](travail/tickets/071-inject-the-disk-into-the-session-store-and-library-with-a.md) « Inject the disk into the session store and library with a fault double » ; [T075](travail/tickets/075-move-the-durable-session-disk-faults-onto-the-injected-disk.md) « Move the durable-session disk faults onto the injected disk double » ; [T076](travail/tickets/076-move-the-server-session-disk-faults-onto-the-injected-disk.md) « Move the server-session disk faults onto the injected disk double » ; [T077](travail/tickets/077-move-the-disk-guard-and-session-deletion-disk-faults-onto.md) « Move the disk-guard and session-deletion disk faults onto the injected disk ».

**Part laissée de côté :** Reste hors des douze tickets : les remplacements globaux de fs qui visent un autre module que le magasin de session, ou l'hôte Mac qui garde le disque réel — architecture-f07 370/447/483 (la ligne 371 cite session.json.tmp), architecture-f05 47/57, architecture-f06 66/73, architecture-f10 37/42, codex-connect-race 13, codex-confinement 40, mac-ipc-contract 480/623/770/815/819 (624, 770, 816 et 820 citent des noms en .tmp). Les espions de coût (session-durable 105 et 317, server-state-views 102) restent globaux à dessein. — _Reprise :_ Après L06-12, module par module, seulement si le module visé reçoit à son tour un disque injecté ; hôte Mac avec le lot L11.

- **Où :** tests/session-durable.test.cjs:37-66, 105-108, 317, 327, 369-370 ; tests/server-sessions.test.cjs:21-49 ; tests/disk-guard.test.cjs ; tests/session-delete.test.cjs ; tests/server-state-views.test.cjs
- **Preuve :** Cinq fichiers remplacent `writeFile`, `readFile` ou `readdir` du module partagé `node:fs/promises` par `t.mock.method` (20 usages de `mock.*`). `refusing` et `disk` reconnaissent la cible par `String(file).endsWith(name + '.tmp')` : les tests savent que le store écrit `<fichier>.tmp` puis renomme. session-durable:105-107 affirme la liste exacte des fichiers lus ; :327 affirme zéro `readdir` et zéro `readFile` sur 200 ticks.
- **Impact :** Changer la technique d'écriture atomique (autre suffixe, descripteur ouvert, bibliothèque) casse une quinzaine de tests sans changement de comportement ; un mock global intercepte aussi les écritures d'autres modules du même processus.

<a id="TSTB-13"></a>
#### TSTB-13 — Temps réel et cinq mécanismes d'horloge factice

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Tests de comportement

**Suite :** [T070](travail/tickets/070-let-a-test-drive-the-lifetime-of-an-external-mcp-context.md) « Let a test drive the lifetime of an external MCP context ».

**Part laissée de côté :** Reste hors de L06-05 : les setTimeout directs de core/deep-ask.cjs (81, 87) et de core/living-recap.cjs (107) sont le constat CORE-13, traité par le lot L12 ; les injecter ici ferait deux fois le même geste dans core/. — _Reprise :_ Avec le lot L12, en appliquant la règle d'injection écrite par l'ADR de L06-01.

- **Où :** tests/chat-instruction.test.cjs:53 ; tests/video-research.test.cjs:40 ; tests/clip-unreadable.test.cjs:212 ; tests/local-vlm-agent.test.cjs:80, 119 ; tests/question-ceiling.test.cjs:6, 202-204 ; tests/whisper-diagnostics.test.cjs:35-37 ; tests/transcriber-sharing.test.cjs:17 ; tests/moment-index.test.cjs:17-34, 521-526 ; tests/server-sessions.test.cjs:696, 759 ; tests/verification.test.cjs:235
- **Preuve :** 14 fichiers sur 50 utilisent de vraies minuteries. Durées fixes servant de preuve : 20 ms d'attente pour affirmer que rien n'a démarré (chat-instruction:53) ; `timeoutMs:25, progressMs:10` sur la minuterie globale de DeepAsk (video-research:40) ; annulation à 150 ms (clip-unreadable:212) ; `timeoutMs: 40` et délais de 150, 30 et 5 ms pour l'ordre des réponses (local-vlm-agent:119, :80) ; `contextMs: 80` puis `performance.now() - openedAt >= 70` (question-ceiling:202-204). Cinq horloges factices coexistent : `manualClock()` injectée (moment-index:17), une seconde copie en ligne dans le même fichier (:521-526), `VirtualClock` importée de `scripts/simulate-stream.cjs` (question-ceiling:6 : un test dépend d'un script), `t.mock.timers` (server-sessions:696, 759), `setTimer` capturé (verification:235). 24 tests dépassent la seconde, surtout à cause de faux whisper et ffmpeg temporisés (250 à 600 ms).
- **Impact :** Sous charge machine, les petites durées deviennent des échecs intermittents ; la suite paie des secondes d'attente ; cinq façons de faire avancer le temps à connaître pour écrire un test.
- **Nuance du relecteur (elle prime) :** Les emplacements et les cinq mécanismes d'horloge sont exacts (chat-instruction:53, video-research:40, clip-unreadable:212, local-vlm-agent:80 et 119, question-ceiling:6 et 200-204, moment-index:17-34 et 521-526, server-sessions:696 et 759, verification:235). Deux corrections. (1) L'impact « sous charge, les petites durées deviennent des échecs intermittents » n'est pas reproduit : les sondes de gel du dossier de travail de l'audit (processus figé 60 ms toutes les 80 ms, et variantes « big ») passent sur local-vlm-agent, video-research, transcriber-sharing, whisper-diagnostics, question-ceiling et chat-instruction (13 journaux flaky/stall-*.log, 0 échec). Les échecs reproduits viennent des tours comptés sous disque lent (TSTB-03), pas de ces durées. Le coût établi est donc la durée de la suite et cinq façons d'avancer le temps ; la fragilité reste supposée. (2) 17 fichiers sur 50, pas 14, dépendent du temps réel : chat-codex, chat-sources et session-optimization passent par `AbortSignal.timeout`, que le comptage sur `setTimeout`/`setInterval` ne voit pas. L'injection `setTimer` existe déjà dans moment-index, moment-search et codex-verifier ; DeepAsk (core/deep-ask.cjs:81, 87) et LivingRecap (core/living-recap.cjs:107) appellent `setTimeout` en direct.

<a id="FLK-08"></a>
#### FLK-08 — Attentes à nombre de tours fixe placées devant du disque réel

**Verdict : nuancé** · priorité P3 · effort L · risque moyen · Déterminisme des tests

**Suite : pas de ticket.** P3 : ne vaut pas une session. Selon la relecture d'audit, les sites cités sont des preuves d'absence qui passent sans prouver, pas des courses qui échouent ; « attendre le fait » ne s'y applique pas avant un tri site par site. — _Reprise :_ Tri site par site après L06-09 (bancs passés à la barrière) et L06-12 (dernière migration vers le disque injecté), à fusionner avec le reste de FLK-10.

- **Où :** tests/session-durable.test.cjs:376, 554, 557, 665, 858, 891, 920, 931, 954, 963, 980 ; tests/session-delete.test.cjs:76, 95 ; tests/server-sessions.test.cjs:16, 106, 170, 271, 278, 664 ; tests/server-surveillance.test.cjs:196, 205, 215
- **Preuve :** 204 appels settle(), turns() ou flush() à nombre fixe (4 à 20 tours de setImmediate, ou 300 microtâches), 146 « await tick() » et 27 boucles en ligne.

  Mesuré : 20 tours durent 0,36 ms à vide, et une écriture mkdir+writeFile+rename se termine en 16 à 19 tours.

  C'est déterministe quand la chaîne n'a aucune E/S (surveillance.test.cjs, surveillance-runtime.test.cjs avec horloge injectée). C'est une course quand du disque réel est dans la chaîne, aux lignes citées. Les sites sont repérés par motif et lus par échantillon. Les sondes +5 et +10 ms n'en ont fait échouer aucun au-delà de FLK-02 et FLK-03.
- **Impact :** Marge inférieure à la milliseconde sur des écritures disque, et couplage au nombre d'await du code de production.
- **Nuance du relecteur (elle prime) :** Compteurs retrouvés (204 appels settle/turns/flush, 146 await tick()). Mais les sites cités ne sont pas des courses qui échouent. Sur 10 sites lus parmi les 22 cités, 9 sont des preuves d'absence derrière une écriture tenue ou déjà réglée (session-durable 376, 554, 557, 858, 954 ; session-delete 76 ; server-sessions 170, 271-278, 664) : sous charge elles passent sans rien prouver, elles n'échouent pas. Le dixième n'a aucun disque réel dans sa chaîne (session-durable 665, doublures en mémoire). Cela concorde avec les sondes, qui n'en ont fait échouer aucun. La remédiation « attendre le fait par d.reached(n) » ne s'applique pas : reached() est déjà attendu juste avant (session-durable 855 et 950, server-sessions 664), et une absence n'a pas de fait à attendre. À fusionner avec FLK-10 (absence affirmée après idle() ou après relâchement de la doublure), après un tri site par site ; l'effort L n'est pas justifié avant ce tri.
- **Remède proposé par l'audit :** Sur disque réel, attendre le fait : d.reached(n) existe déjà (session-durable.test.cjs:64, server-sessions.test.cjs:47), sinon la barrière de FLK-06. Sans E/S, un seul helper drain() partagé, documenté « chaîne de promesses sans E/S uniquement ».
- **Risque du remède selon le relecteur :** Remplacer une attente à tours par une attente de fait transforme une preuve d'absence en attente sans fin ou en assertion vide ; une mutation du produit (retirer l'attente gardée) doit faire rougir chaque test retouché.

<a id="OUBLI-12"></a>
#### OUBLI-12 — Simuler le setTimeout global capture aussi les délais du client HTTP de Node

**Verdict : confirmé** · Signalement du relecteur — Déterminisme des tests

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T066](travail/tickets/066-drive-the-question-checkpoint-of-the-server-host-with-an.md) « Drive the question checkpoint of the server host with an injected timer ».

- **Signalement :** tests/server-sessions.test.cjs:696 et 759 : simuler le setTimeout global capture aussi les délais du client HTTP de Node (undici arme ses délais de parseur par le setTimeout global avec un WeakRef). C'est la cause lisible de l'échec de fichier de FLK-07, que l'audit laisse non établie. Même cohabitation à vérifier dans tests/architecture-f07.test.cjs (macHost simule setTimeout en 222, serverHost utilise fetch en 182).

<a id="OUBLI-13"></a>
#### OUBLI-13 — Un second entrelacement visé en comptant des microtâches

**Verdict : confirmé** · Signalement du relecteur — Déterminisme des tests

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T068](travail/tickets/068-gate-close-during-reconnect-and-retry-tests-on-a-named-step.md) « Gate close-during-reconnect and retry tests on a named step, not a count ».

- **Signalement :** tests/review-regressions.test.cjs:71 : second entrelacement visé en comptant des microtâches (trois await Promise.resolve() avant close()), même forme que la ligne 316, non cité par FLK-09.

<a id="OUBLI-14"></a>
#### OUBLI-14 — Tests Python sur temps réel non analysés

**Verdict : nuancé** · Signalement du relecteur — Déterminisme des tests

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Confirmé par le code (tests Python de la TV qui tournent en temps réel), mais la couture nécessaire (horloge et sommeil injectés côté Python) est celle du constat PY-03, traité par le lot L15 ; l'écrire ici la ferait deux fois. — _Reprise :_ Avec le lot L15, dans le ticket qui injecte l'horloge du contrôleur TV.

- **Signalement :** Tests Python sur temps réel non analysés : tests/test_tv_control.py:105-107 (deux renvois, soit environ 2 s d'attente réelle par le stop.wait de tv/transport.py:92), tests/test_tv_ambient.py:240 et 908, tests/test_tv_capture_gate.py:282 (boucles time.sleep). 44 occurrences de sleep, wait, monotonic ou thread dans les trois fichiers. Les brancher en CI (FLK-14) sans cet examen importe un risque non mesuré.

<a id="OUBLI-25"></a>
#### OUBLI-25 — Tests Python dépendants du temps réel, non reliés à la stabilité de la suite

**Verdict : nuancé** · Signalement du relecteur — Interfaces (Mac, TV, scripts Python)

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Confirmé par le code (tv/controller.py, page_ack et page_wait sur time.monotonic et time.sleep) ; même couture Python que OUBLI-14, portée par le lot L15. — _Reprise :_ Avec le lot L15, même ticket que OUBLI-14.

- **Signalement :** Tests Python dépendants du temps réel, non reliés à la stabilité de la suite : page_ack et page_wait comptent en time.monotonic et time.sleep (tv/controller.py:210-228) et leurs tests règlent des délais réels de 0,3 à 0,6 s (tests/test_tv_ambient.py:234 et 955) pendant qu'un fil avance l'horloge simulée toutes les 5 ms (l.240). Sous la charge mémoire de cette machine c'est un candidat à l'échec intermittent (supposé, non observé) ; PY-03 cite l'injection manquante sans faire ce lien.

### L07 — Des fichiers de test rangés par comportement

Vague 1 · 18 constats · 9 tickets

- [T078](travail/tickets/078-name-the-context-release-recap-capacity-and-clip-range-tests.md) — Name the context release, recap capacity and clip range tests by behaviour
- [T079](travail/tickets/079-name-the-description-retry-tests-after-their-behaviour.md) — Name the description retry tests after their behaviour
- [T080](travail/tickets/080-name-the-ingest-block-ownership-tests-after-their-behaviour.md) — Name the ingest block ownership tests after their behaviour
- [T081](travail/tickets/081-name-the-session-closing-tests-after-their-behaviour.md) — Name the session closing tests after their behaviour
- [T082](travail/tickets/082-name-the-codex-process-ownership-tests-after-their-behaviour.md) — Name the Codex process ownership tests after their behaviour
- [T083](travail/tickets/083-sort-the-agent-role-tool-contract-and-index-tests-into.md) — Sort the agent role, tool contract and index tests into behaviour files
- [T084](travail/tickets/084-move-the-moment-index-regression-tests-next-to-the-index.md) — Move the moment index regression tests next to the index tests
- [T085](travail/tickets/085-move-the-evidence-settings-and-whisper-regression-tests-to.md) — Move the evidence, settings and Whisper regression tests to behaviour files
- [T086](travail/tickets/086-name-the-remaining-codex-connection-tests-after-their.md) — Name the remaining Codex connection tests after their behaviour

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [TSTA-09](#TSTA-09) | Les tests lisent l'état privé du client Codex (environ 90 accès) | nuancé | P1 | pas de ticket |
| [TSTA-10](#TSTA-10) | Drapeaux écrits de l'extérieur, méthodes remplacées et état privé des runtimes et de WatchSession | nuancé | P1 | pas de ticket |
| [TSTB-02](#TSTB-02) | Un dossier à plat, une commande, aucune couche | nuancé | P1 | pas de ticket |
| [TSTB-09](#TSTB-09) | Les tests d'intégration pilotent les internes de production | nuancé | P1 | pas de ticket |
| [DOC-06](#DOC-06) | Fichiers de tests nommés par numéro de chantier ; étiquettes F0x en collision | nuancé | P2 | [T078](travail/tickets/078-name-the-context-release-recap-capacity-and-clip-range-tests.md), [T079](travail/tickets/079-name-the-description-retry-tests-after-their-behaviour.md), [T080](travail/tickets/080-name-the-ingest-block-ownership-tests-after-their-behaviour.md), [T081](travail/tickets/081-name-the-session-closing-tests-after-their-behaviour.md), [T082](travail/tickets/082-name-the-codex-process-ownership-tests-after-their-behaviour.md), [T083](travail/tickets/083-sort-the-agent-role-tool-contract-and-index-tests-into.md), [T086](travail/tickets/086-name-the-remaining-codex-connection-tests-after-their.md) |
| [TSTA-05](#TSTA-05) | Sept fichiers nommés F04 à F10 : répartition cible par comportement | nuancé | P2 | [T078](travail/tickets/078-name-the-context-release-recap-capacity-and-clip-range-tests.md), [T079](travail/tickets/079-name-the-description-retry-tests-after-their-behaviour.md), [T080](travail/tickets/080-name-the-ingest-block-ownership-tests-after-their-behaviour.md), [T081](travail/tickets/081-name-the-session-closing-tests-after-their-behaviour.md), [T082](travail/tickets/082-name-the-codex-process-ownership-tests-after-their-behaviour.md) |
| [TSTA-06](#TSTA-06) | review-regressions, refactor-boundaries et petits fichiers codex-* : 42 tests rangés par origine | nuancé | P2 | [T083](travail/tickets/083-sort-the-agent-role-tool-contract-and-index-tests-into.md), [T084](travail/tickets/084-move-the-moment-index-regression-tests-next-to-the-index.md), [T085](travail/tickets/085-move-the-evidence-settings-and-whisper-regression-tests-to.md), [T086](travail/tickets/086-name-the-remaining-codex-connection-tests-after-their.md) |
| [TSTA-07](#TSTA-07) | codex-confinement.test.cjs : 9 sujets dans un fichier, 8 tests géants sur 17 | nuancé | P2 | pas de ticket |
| [TSTA-16](#TSTA-16) | Textes réellement remis à un utilisateur ou à un client : contrat légitime mais réécrit dans chaque fichier | confirmé | P2 | pas de ticket |
| [TSTB-15](#TSTB-15) | Tests-fleuves : plusieurs scénarios par test, noms-paragraphes | confirmé | P2 | pas de ticket |
| [TSTA-14](#TSTA-14) | Recouvrements à l'intérieur du périmètre : mêmes scénarios dans plusieurs fichiers | nuancé | P3 | pas de ticket |
| [TSTA-15](#TSTA-15) | Recouvrements avec les fichiers voisins (server-sessions, moment-index, opened-pages, server-ingest-path, question-ceiling, adapters) | nuancé | P3 | pas de ticket |
| [TSTA-17](#TSTA-17) | Comparaisons positionnelles : 267 `deepEqual` de tableaux contre 47 d'objets nommés | confirmé | P3 | pas de ticket |
| [TSTA-18](#TSTA-18) | Autres fichiers fourre-tout hors de la liste : session-optimization, adapters, viewing-features, latency, chat-codex | nuancé | P3 | pas de ticket |
| [TSTB-16](#TSTB-16) | Fichiers fourre-tout nommés par chantier, unités éparpillées | nuancé | P3 | pas de ticket |
| [OUBLI-33](#OUBLI-33) | État global de processus partagé entre tests, absent de l'audit alors qu'il conditionne tout découpage ou déplacement | nuancé | — | pas de ticket |
| [OUBLI-34](#OUBLI-34) | Tests trop longs au seuil des standards | nuancé | — | pas de ticket |
| [OUBLI-39](#OUBLI-39) | État global du processus modifié par des tests | nuancé | — | pas de ticket |

<a id="TSTA-09"></a>
#### TSTA-09 — Les tests lisent l'état privé du client Codex (environ 90 accès)

**Verdict : nuancé** · priorité P1 · effort M · risque faible · Tests nommés par chantier

**Suite : pas de ticket.** Demande une décision du propriétaire sur ce que status() doit exposer, et la sonde partagée que crée le lot L05 ; aucune règle métier n'est inventée ici. — _Reprise :_ Après la décision du propriétaire et le lot L05.

- **Où :** tests/codex-thread-rotation.test.cjs:61-70, 104, 143-149, 160-174, 202-220 ; tests/codex-connect-race.test.cjs:43-44, 63-64 ; tests/review-regressions.test.cjs:62-63, 75, 321 ; tests/architecture-f05.test.cjs:212, 345, 387-399, 447, 461, 481 ; tests/codex-confinement.test.cjs:279, 287, 337-338, 365, 409, 486-492, 536-555, 928 ; tests/refactor-boundaries.test.cjs:130-133, 236
- **Preuve :** Accès dans le périmètre : `client.rpc` 13, `client.ready` 12, `client.dir` 12, `client.threadId` 16, `client.rotations` 6, `client.opened` 3 (dont une écriture, thread-rotation:61), `transportDouble` 5, `agent.client.*` 7, `.confinement.*` 18. En production, `rotations` et `transportDouble` ne sont lus que par le client lui-même, et `rpc`, `ready`, `dir` par le client et 3 lignes de codex-session-agent. refactor-boundaries:130-131 écrit `agent.model` et `agent.authHome` entre deux tours, puis lit `agent.client.authHome`.
- **Impact :** Le client est le fichier que l'audit des adaptateurs propose de découper (connexion, garde, rotation). Ces lectures cassent dès que `rpc`, `ready` ou `dir` changent de propriétaire, sans régression réelle.
- **Nuance du relecteur (elle prime) :** Compteurs retrouvés à une ou deux unités près (.rpc 13, client.ready 12, client.dir 10, client.threadId 17, rotations 6, opened 3, agent.client 7, .confinement 18), et les trois lectures de codex-session-agent sont bien en :44, :48 et :76. À corriger. 1) `transportDouble`, `rpc`, `threadId` et `rotations` sont aussi lus par scripts/probe-confinement.cjs:469-484, que la bascule casserait. 2) « Les mêmes tests affirment déjà les faits observables » est vrai pour connect-race:42-45, faux pour review-regressions:52-63 et :321, qui n'affirment que client.rpc, client.dir et client.ready et n'ont pas de sonde `created` dans leur fichier : la sonde de TSTA-02 est un prérequis, en plus de TSTA-03. 3) `status()` n'aurait aucun lecteur en production : aucun hôte ne lit ces champs aujourd'hui. Soit on lui donne un vrai consommateur, soit on l'assume comme lecture de diagnostic, à faire entrer dans la garde de confinement:457.
- **Remède proposé par l'audit :** Une lecture publique `client.status()` rendant `{ connected, connecting, threadId, rotations, confinement }`, utilisée par les tests et par l'hôte. Remplacer `client.rpc === null` et `client.dir === null` par les faits observables déjà disponibles : `server.live().length === 0` et `await remaining()` qui vaut `[]`. Remplacer `[...client.opened]` (confinement:928) par `output.audit`, affirmé deux lignes plus bas. Faire cette bascule avant le découpage du client, chaque test restant vert sur le code actuel.
- **Risque du remède selon le relecteur :** Remplacer `client.dir === null` par l'absence de répertoire créé ne voit plus un client qui garderait une référence morte ; à détecter en vérifiant que chaque test réécrit échoue encore quand on retire, dans le client, la remise à null correspondante.

<a id="TSTA-10"></a>
#### TSTA-10 — Drapeaux écrits de l'extérieur, méthodes remplacées et état privé des runtimes et de WatchSession

**Verdict : nuancé** · priorité P1 · effort L · risque moyen · Tests nommés par chantier

**Suite : pas de ticket.** Porte sur le comportement de modules de core/, pas sur le rangement des fichiers de test : il relève des lots qui traitent ces modules. — _Reprise :_ Avec le lot qui modifie le module de core/ concerné.

- **Où :** tests/architecture-f08.test.cjs:101, 136, 177, 185-195 ; tests/architecture-f05.test.cjs:550-565, 584-614, 702-736 ; tests/architecture-f06.test.cjs:276-280, 299, 348-350 ; tests/architecture-f07.test.cjs:56, 180, 187, 190, 254-277, 343-345, 377, 393-396, 419-426, 504-521, 539-541, 555-557 ; tests/architecture-f04.test.cjs:16-31, 61-74, 106-124, 217-233 ; runtime/session-closing.cjs:73 ; runtime/session-runtime.cjs:69, 489-495
- **Preuve :** f08 écrit `watch.ending`, `watch.readOnly` et `watch.asking` (7 écritures), lit `watch.losses` (8) et `watch.visionQueue` (1), appelle `watch.drain()` ou `prune()` (7). Il reproduit ce que font les hôtes (session-closing.cjs:73, session-runtime.cjs:489-495) et écrit en plus `readOnly`, que la production ne modifie que dans core/session.cjs. f05 lit `inspector.inner`, `inspector.hits`, `inspector.cache.size` (8 accès), `store.leases.size`, `bridge.external` (2) et remplace `inner.inspect`. f06:276-280 lit `runtime.admitted.size` et `server.ingesting` ; :348-350 appelle `runtime.exclusive()` et `runtime.moving()`. f07 pose 17 remplacements de méthodes sur des objets réels : `recorded()` (:56) sur `cancelPreparations`, `surveillance.reset`, `deep.cancelAll`, `pause`, `archive`, puis `live.seal`, `live.store.put`, `live.perception.observe` et `close`, `inspectorModel.close`, `agent.close`, `deep.emit`, `search.search` ; il lit `runtime.unsaved` et `checkpointTimer` (:187). f04 parcourt le graphe d'objets (`reachable`, :19) depuis `deep.jobs` (12 accès) et `job.tools.*` : 29 de ses 52 assertions portent sur ce qui est atteignable, son commentaire note qu'une fermeture lui est opaque (:16-17), et il publie 6 mesures par `t.diagnostic` (:70-74, :210).
- **Impact :** Ces tests protègent F04 à F08 et épinglent les noms de champs et de méthodes que l'audit du cœur propose de remplacer (machine à états de WatchSession, découpage de session-runtime et de HeadlessRuntime). L'ordre des étapes de fermeture (f07:460) est affirmé par le nom des méthodes enveloppées : renommer `cancelPreparations` casse le test sans changer l'ordre. Si le contexte d'une question passe dans une fermeture, les assertions de F04 passent sans rien prouver.
- **Nuance du relecteur (elle prime) :** Comptages retrouvés : f08 fait 7 écritures de drapeaux (:101 deux fois, :136 deux fois, :185, :188, :195), 8 lectures de losses, 1 de visionQueue, 7 appels à drain ou prune ; f05 a 8 accès à l'inspecteur et 2 à bridge.external ; f04 a 12 accès à deep.jobs et 6 t.diagnostic ; session-closing.cjs:73 et session-runtime.cjs:69, :489-495 sont justes. À corriger. 1) `overrides` n'accepte aujourd'hui que `embeddings` et `perception` (session-runtime.cjs:119, :238) : y injecter une écriture retenue, un scellement refusé ou une fermeture en échec est une extension de production à décrire, pas un usage de l'existant. 2) Les étapes de closeSession portent déjà un nom (capture, préparation média, questions, surveillance, agent de chat), mais affirmer l'ordre sur ces noms par `onStep` prouve moins que f07:460, qui observe l'effet réel (VideoBridge.revoke, surveillance.reset, deep.cancelAll, runtime.pause, runtime.archive) : garder au moins un test qui relie chaque nom à son effet. 3) Les hôtes écrivent eux-mêmes ces drapeaux (headless-runtime.cjs:297, app/main.cjs:167, session-closing.cjs:73) : les commandes proposées corrigent d'abord la production, et le ticket appartient au chantier du cœur.
- **Remède proposé par l'audit :** Par module, avant son refactor. WatchSession : des commandes (`beginEnding()`, `setAsking(bool)`) et la lecture de `snapshot().coverage` au lieu de `losses` ; f08 passe par elles. Fermeture : `closeSession` reçoit déjà des étapes nommées (f07:75) ; lui ajouter un rappel `onStep(name)` et affirmer l'ordre sur ces noms, sans envelopper de méthode. HeadlessRuntime : un champ `ingest: { owned, busy }` dans son instantané public, à la place de `admitted` et `ingesting`. Pannes simulées (écriture retenue, scellement refusé, fermeture en échec) : les injecter à la construction par `overrides` (session-runtime.cjs:69) au lieu de réécrire la méthode après coup. F04 : un état public `released` sur le contexte d'outils ; garder un seul test d'atteignabilité, marqué comme sonde, et déplacer les mesures `t.diagnostic` dans un script de scripts/.
- **Risque du remède selon le relecteur :** Affirmer l'ordre sur des noms d'étapes laisserait passer un hôte qui nomme une étape sans faire le travail ; à détecter par le test conservé qui relie le nom à l'effet et par les scénarios onBothHosts.

<a id="TSTB-02"></a>
#### TSTB-02 — Un dossier à plat, une commande, aucune couche

**Verdict : nuancé** · priorité P1 · effort M · risque faible · Tests de comportement

**Suite : pas de ticket.** Propose une arborescence de tests par couche, contraire à l'arbitrage A1 (tests à plat dans tests/) ; demande une décision du propriétaire et un changement du harnais. — _Reprise :_ Si le propriétaire revient sur A1, dans un ticket harnais dédié.

- **Où :** package.json:11 ; tests/moment-index.test.cjs:60, 422, 478 ; tests/ (50 fichiers du périmètre, 76 au total)
- **Preuve :** `node --test tests/*.test.cjs` est la seule commande ; 0 `describe`, 0 sous-test. Un même fichier mêle les couches : moment-index teste MomentIndex et MomentSearch en pur (:60), OpenRouterEmbeddings avec fetch injecté (:422) et EmbeddingStore sur disque (:478). Sur 50 fichiers : 29 créent des dossiers temporaires (56 mkdtemp), 9 ouvrent un port ou appellent fetch, 13 lancent de vrais processus enfants, 14 utilisent de vraies minuteries, environ 15 sont strictement purs. Journal de référence : 602 tests, 17,4 s de mur, 75,7 s cumulées, 24 tests de plus d'une seconde, 416 de moins de 20 ms. Aucune mesure de couverture en place ; mesure faite pour l'audit sur 12 fichiers purs (121 tests, 0,39 s) : core à 79,1 % des lignes, 86,2 % des branches, 85,4 % des fonctions sur les 15 fichiers chargés.
- **Impact :** Pas de boucle rapide pendant une refonte du cœur ; un test lent ou fragile pénalise toute la suite ; impossible de fixer un seuil par dossier ou de limiter la concurrence des seuls tests lourds.
- **Nuance du relecteur (elle prime) :** Preuve exacte : package.json:11 ; 0 describe (« suites 0 » dans les journaux) ; 29 fichiers et 56 mkdtemp ; 9, 13 et 14 fichiers ; durées tirées de fmt-baseline.log (l'autre journal, f07-run2.log, donne 14,9 s de mur, 61,4 s cumulées, 15 tests de plus d'une seconde : chiffres variables d'un lancement à l'autre). Deux points de remédiation à corriger. (1) La couverture intégrée de Node 24 n'offre que des seuils globaux (`--test-coverage-branches`, etc.) : des seuils par dossier demandent un lancement par dossier avec `--test-coverage-include`, ou un rapport lcov relu par un script. (2) Le test de garde par regex sur le texte des tests (`mkdtemp|listen(|…`) est le procédé même que TSTB-19 veut retirer : préférer une règle ESLint limitée à tests/unit une fois ADP-15 en place. Le script de l'audit classe 19 fichiers « purs », dont remote-media (vrai ffmpeg), chat-sources et verification (arbre Codex créé sur disque à la connexion) : « environ 15 » est cohérent. Les pourcentages de couverture n'ont pas été remesurés.
- **Remède proposé par l'audit :** Arborescence cible : `tests/unit/{core,runtime,adapters}/<module>.<aspect>.test.cjs` (ni disque, ni réseau, ni processus, ni minuterie réelle) ; `tests/contract/` (routes HTTP, protocole App Server, ports, cycle de vie d'hôte) ; `tests/integration/{server,session,media,codex}/` (disque temporaire, boucle locale, faux exécutables) ; `tests/helpers/` ; `tests/fixtures/`. Scripts : `test:unit`, `test:contract`, `test:integration` (avec `--test-concurrency=2`), `test` = les trois plus l'ancien glob tant qu'il reste des fichiers à plat, `test:coverage` (`--experimental-test-coverage`, Node 24). Un test de garde refuse `mkdtemp|listen(|child_process|setTimeout(` dans `tests/unit`. Nommage : fichier = unité testée ; `describe(unité)` puis `describe(situation)` puis `test(résultat)` de 100 caractères au plus ; un scénario par test. Seuils en branches (le code dense gonfle le taux de lignes) : core 85 puis 90 ; server/http.cjs 85 après TSTB-05 ; runtime 70 puis 80 et adapters 60 puis 75 hors code hérité, à calibrer sur la première mesure. Ordre : squelette, aides et rapport non bloquant ; tout nouveau test naît dans sa couche ; un fichier existant ne migre (git mv, sans réécriture) que lorsqu'on le touche ou que son unité est refondue ; un seuil devient bloquant dossier par dossier une fois atteint.
- **Risque du remède selon le relecteur :** Un fichier déplacé hors de tout glob n'est plus lancé sans que rien n'échoue ; le détecte la comparaison du nombre de tests (602) avant et après chaque déplacement, à automatiser dans le contrôle.

<a id="TSTB-09"></a>
#### TSTB-09 — Les tests d'intégration pilotent les internes de production

**Verdict : nuancé** · priorité P1 · effort M · risque moyen · Tests de comportement

**Suite : pas de ticket.** Même cas que TSTA-10 : le constat vise des tests liés à des modules de core/, à traiter avec leur code. — _Reprise :_ Avec le lot qui modifie le module de core/ concerné.

- **Où :** tests/server-sessions.test.cjs:98-100, 105-106, 241, 273-277, 405-410, 450, 504-505 ; tests/session-durable.test.cjs:116, 313-316, 321, 548-549, 690-693, 725 ; tests/surveillance-runtime.test.cjs:189, 543, 561-564 ; tests/chat-trace.test.cjs:7-8 ; tests/transcription-language.test.cjs:14-15 ; tests/surveillance.test.cjs:691
- **Preuve :** Compteurs du périmètre : `.store.serial` ×32 (4 fichiers), `runtime.session` ×42 (7), `watch.asking = …` ×20 (5), `watch.running` ×15 (10), `runtime.deep.jobs` ×14 (7), `session.search.index.*` ×8. Méthodes réaffectées sur des objets de production (`live.store.put = …`, `session.perception.close = …`, `target.close = …`, `session.search.index.observe = …`). État privé posé à la main : `client.threadId = …; client.active = {…}` (chat-trace:7-8) ; méthode de prototype appelée sur un objet factice (transcription-language:14-15) ; surveillance-runtime:559-561 atteint le cœur « without the runtime ». Aucun accès à un champ préfixé `_`.
- **Impact :** Ce sont les champs que CORE-02 (découpage de HeadlessRuntime), CORE-03 (12 internes exposés) et CORE-06 (drapeau `asking` remplacé par une phase) veulent retirer : chaque refonte cassera des dizaines de tests qui ne portent pas sur elle.
- **Nuance du relecteur (elle prime) :** Compteurs exacts (`.store.serial` 32 dans 4 fichiers, `runtime.session` 42 dans 7, `watch.asking =` 20 dans 5, `watch.running` 15 dans 10, `runtime.deep.jobs` 14 dans 7), sauf `.search.index` : 11 occurrences dans 3 fichiers (session-durable 5, server-sessions 4, session-delete 2), pas 8. Nuance de fond : `watch.asking = …` n'est pas un interne mais l'interface documentée des hôtes (core/session.cjs:75-77, « Hosts assign `asking` directly », accesseur et mutateur) ; ces 20 écritures suivent le contrat actuel et ne bougeront qu'avec CORE-06. Les réaffectations de méthodes sont plus nombreuses que les quatre citées : une vingtaine, dont `store.loadSurveillance` (surveillance-runtime:65, 290, 514, 609) et `f.media.put`/`remove` (session-latency:218, 235, 256, 273). Le point d'appui `overrides.perception` existe bien (runtime/session-runtime.cjs:69, 238 ; session-durable:365).
- **Remède proposé par l'audit :** Avant ces refontes, ouvrir des points d'appui publics étroits et y porter les tests : `session.idle()` (plus aucune voie active, file d'écriture vidée) à la place des boucles sur `watch.running` et de `store.serial` ; `runtime.question(id)` rendant `{ status, done }` à la place de `deep.jobs.find` ; injection de fautes par le constructeur (`overrides.store`, comme `overrides.perception` l'est déjà en session-durable:364-365) au lieu de réaffecter une méthode ; `holdVision(reason)` et `releaseVision()` (CORE-06) pour les tests comme pour les hôtes. Les aides `serverHost` et `diskSession` concentrent les accès restants en un seul endroit.
- **Risque du remède selon le relecteur :** Les points d'appui ajoutés (`idle()`, `question(id)`) deviennent une API de production à maintenir, et un `idle()` qui se résout trop tôt donne des verts trompeurs ; le détecte le rejeu des fichiers convertis sous la sonde disque lent, qui fait déjà échouer session-durable:271.

<a id="DOC-06"></a>
#### DOC-06 — Fichiers de tests nommés par numéro de chantier ; étiquettes F0x en collision

**Verdict : nuancé** · priorité P2 · effort S · risque faible · Documentation et dépôt

**Suite :** [T078](travail/tickets/078-name-the-context-release-recap-capacity-and-clip-range-tests.md) « Name the context release, recap capacity and clip range tests by behaviour » ; [T079](travail/tickets/079-name-the-description-retry-tests-after-their-behaviour.md) « Name the description retry tests after their behaviour » ; [T080](travail/tickets/080-name-the-ingest-block-ownership-tests-after-their-behaviour.md) « Name the ingest block ownership tests after their behaviour » ; [T081](travail/tickets/081-name-the-session-closing-tests-after-their-behaviour.md) « Name the session closing tests after their behaviour » ; [T082](travail/tickets/082-name-the-codex-process-ownership-tests-after-their-behaviour.md) « Name the Codex process ownership tests after their behaviour » ; [T083](travail/tickets/083-sort-the-agent-role-tool-contract-and-index-tests-into.md) « Sort the agent role, tool contract and index tests into behaviour files » ; [T086](travail/tickets/086-name-the-remaining-codex-connection-tests-after-their.md) « Name the remaining Codex connection tests after their behaviour ».

- **Où :** tests/architecture-f04.test.cjs:6,70 ; tests/architecture-f05.test.cjs:20 ; tests/architecture-f06.test.cjs:15,559 ; tests/architecture-f07.test.cjs:14 ; tests/architecture-f08.test.cjs:11 ; tests/architecture-f09.test.cjs:9 ; tests/architecture-f10.test.cjs:12 ; tests/session-durable.test.cjs:870-871 ; tests/server-sessions.test.cjs:770 ; docs/features-proactives-et-retention-2026-10-13.md:13-65 ; docs/architecture-improvements/index.md:5-14
- **Preuve :** Occurrences de F01…F10 (mot entier) par dossier : core 0, adapters 0, runtime 0, server 0, mcp 0, app 0, tv 0, scripts 0, deploy 0, prototypes 0, tests 17 (9 fichiers), docs 224 (32 fichiers, tous dans docs/adr et docs/architecture-improvements). Le code de production est propre. La fuite tient à 7 noms de fichiers (tests/architecture-f04 à f10, 3 122 lignes) et à des messages : « kept out of F06 » (architecture-f06:559), « sonde F03, synthétique » (session-durable:870), « F04 mesure structurelle synthétique » (architecture-f04:70). Sans la boucle, rien n'indique que architecture-f07 teste la fin de session ni que f05 teste la propriété des processus Codex. Collision : le même jour, docs/features-proactives… numérote F1 à F6 les demandes produit (F4 = cloisonnement) alors que F04 = mémoire des questions terminées. Triple numérotation : fiche 07-f08.md = F08 = issue 7 = ADR 0008 ; fiche 10-f07.md = F07 = issue 10 = ADR 0007. Autres noms de chantier : tests/review-regressions.test.cjs (383 lignes, 19 tests), tests/refactor-boundaries.test.cjs (246 lignes).
- **Impact :** Trouver le test d'un sujet demande une table de correspondance. Le plan à venir ajoute des identifiants (CORE-xx, ADP-xx) : sans règle, on obtiendra architecture-core03.test.cjs.
- **Nuance du relecteur (elle prime) :** Compteurs confirmés : 0 occurrence de F01–F10 dans le code de production, 17 dans 9 fichiers de tests, 7 fichiers pour 3 122 lignes, review-regressions 383 lignes et 19 tests, refactor-boundaries 246 lignes. Cinq corrections. (1) La règle et la garde existent déjà à la tête de branche : docs/standards.md (« un fichier de test porte le nom d'un module ou d'un comportement »), refus à la création dans .claude/hooks/guard-write.mjs, cliquet tests_nommes_par_chantier = 9 dans scripts/quality/baseline.json, soit exactement ces neuf fichiers. Le « test de dépôt » proposé fait doublon : le ticket se réduit aux renommages, et la boucle resserre le plancher. (2) Références oubliées à mettre à jour : tests/surveillance-runtime.test.cjs:79 (cite tests/refactor-boundaries.test.cjs), docs/backend-latency-optimization.md:56, :69, :293 et docs/night-features-delivery.md:820 (citent review-regressions). (3) Le ticket T001 de la tête de branche vise tests/architecture-f06.test.cjs (lignes 514-532) : renommer f06 seulement après sa clôture. (4) « module-boundaries » est un faux nom de comportement : les 6 tests de refactor-boundaries portent sur les rôles Codex, la parité des outils MCP, l'index paresseux et l'effort de raisonnement ; à ventiler comme review-regressions. (5) « Sans toucher au contenu » est inexact : les en-têtes « // F0x: », les t.diagnostic et la ventilation de 19 tests avec leurs aides (lignes 20-50) modifient le contenu ; effort S pour les sept renommages, M avec les deux ventilations.

<a id="TSTA-05"></a>
#### TSTA-05 — Sept fichiers nommés F04 à F10 : répartition cible par comportement

**Verdict : nuancé** · priorité P2 · effort L · risque faible · Tests nommés par chantier

**Suite :** [T078](travail/tickets/078-name-the-context-release-recap-capacity-and-clip-range-tests.md) « Name the context release, recap capacity and clip range tests by behaviour » ; [T079](travail/tickets/079-name-the-description-retry-tests-after-their-behaviour.md) « Name the description retry tests after their behaviour » ; [T080](travail/tickets/080-name-the-ingest-block-ownership-tests-after-their-behaviour.md) « Name the ingest block ownership tests after their behaviour » ; [T081](travail/tickets/081-name-the-session-closing-tests-after-their-behaviour.md) « Name the session closing tests after their behaviour » ; [T082](travail/tickets/082-name-the-codex-process-ownership-tests-after-their-behaviour.md) « Name the Codex process ownership tests after their behaviour ».

- **Où :** tests/architecture-f04.test.cjs:56-225 ; tests/architecture-f05.test.cjs:73-686 ; tests/architecture-f06.test.cjs:149-534 ; tests/architecture-f07.test.cjs:75-578 ; tests/architecture-f08.test.cjs:39-394 ; tests/architecture-f09.test.cjs:57-242 ; tests/architecture-f10.test.cjs:92-273 ; docs/architecture-improvements/history/F04.md à F10.md
- **Preuve :** 97 tests déclarés (104 exécutés), 3 122 lignes (8 838 formatées). Le préfixe « architecture » est faux : ce sont des tests de comportement. Assertions par fichier (comportement / état privé / texte source) : f04 23/29/0 ; f05 109/13/0 ; f06 25/0/0 ; f07 50/0/7 ; f08 79/18/0 ; f09 55/0/1 ; f10 71/2/0. Les chantiers F01 à F03 ont été rangés dans des fichiers de comportement (server-sessions, session-durable) : deux conventions coexistent. Contenu réel : F04, libération du contexte d'une question (deep-ask, conversation-runtime) ; F05, quatre sujets (groupe de processus de CodexRpc, reconnexion du client, révocation des contextes MCP, runtime de session fermé) ; F06, propriété d'un bloc ingéré et assembleur RemoteMedia ; F07, protocole de fermeture seul puis parité des deux hôtes ; F08, seconde description dans WatchSession puis classement des échecs par CodexPerception ; F09, plafond du récap (CodexRecap, LivingRecap, vue) ; F10, plages d'octets (LocalSessionStore, SavedMomentStore, route /v1/media).
- **Impact :** Pour savoir si la reconnexion du client Codex est testée, il faut ouvrir f05, codex-connect-race, review-regressions et codex-thread-rotation. Le nom du fichier ne dit rien à qui n'a pas suivi les chantiers.
- **Nuance du relecteur (elle prime) :** Compteurs et lignes exacts : 97 tests déclarés, 104 exécutés, 3 122 lignes, 8 838 formatées, et chaque numéro cité dans la répartition tombe sur un test. Le rangement proposé va dans le sens de la règle entrée à HEAD (cliquet tests_nommes_par_chantier à 9, soit ces 7 fichiers plus review-regressions et refactor-boundaries). Faits à corriger. 1) Le déplacement « mêmes titres » n'est pas faisable tel quel à HEAD : scripts/check.mjs:53-66 refuse tout fichier qui gagne une ligne de plus de 160 caractères. Le périmètre en compte 478, et encore 72 après Prettier, dont 58 sont des titres de test que Prettier ne coupe pas (f07 17, f06 13, f05 8, f04 6, confinement 6). Le formatage est un prérequis dur, et ces titres doivent être raccourcis, avec une table ancien titre vers nouveau titre comme filet. 2) « Garder l'en-tête de chaque fichier » : ces en-têtes commencent par « F0N: », ce que CLAUDE.md interdit aussi dans les commentaires. 3) Les history/F0N.md sont un historique (10 mentions dans 7 fichiers) : y ajouter une table de correspondance plutôt que les réécrire. 4) Les triplets d'assertions sous-comptent l'état privé : f06:276 affirme runtime.admitted.size et server.ingesting, f07:426 affirme live.watch.closed, ce que TSTA-10 relève par ailleurs.

<a id="TSTA-06"></a>
#### TSTA-06 — review-regressions, refactor-boundaries et petits fichiers codex-* : 42 tests rangés par origine

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Tests nommés par chantier

**Suite :** [T083](travail/tickets/083-sort-the-agent-role-tool-contract-and-index-tests-into.md) « Sort the agent role, tool contract and index tests into behaviour files » ; [T084](travail/tickets/084-move-the-moment-index-regression-tests-next-to-the-index.md) « Move the moment index regression tests next to the index tests » ; [T085](travail/tickets/085-move-the-evidence-settings-and-whisper-regression-tests-to.md) « Move the evidence, settings and Whisper regression tests to behaviour files » ; [T086](travail/tickets/086-name-the-remaining-codex-connection-tests-after-their.md) « Name the remaining Codex connection tests after their behaviour ».

- **Où :** tests/review-regressions.test.cjs:52-356 ; tests/refactor-boundaries.test.cjs:55-232 ; tests/codex-connect-race.test.cjs:35, 48 ; tests/codex-stream-decoding.test.cjs:8 ; tests/codex-thread-rotation.test.cjs:228-354 ; tests/surveillance-runtime.test.cjs:79 ; docs/backend-latency-optimization.md ; docs/night-features-delivery.md
- **Preuve :** Assertions (comportement / état privé / texte source) : review-regressions 66/14/0 ; refactor-boundaries 25/2/0 ; codex-thread-rotation 98/10/0 ; codex-connect-race 10/3/0 ; codex-stream-decoding 1/0/0. review-regressions (19 tests) se présente comme « Defects found by the independent review of the latency branch » et touche 11 modules : client Codex (:52, :66, :78, :308), agent de chat (:91), CodexPerception (:102), LocalTranscriber (:114), MomentIndex et MomentSearch (:148, :164, :281), EmbeddingStore (:177), passageText (:191), VideoTools (:199, :324, :337), loadConfig (:215, :356), session-runtime (:249), HeadlessRuntime (:272). refactor-boundaries (6 tests) : rôle d'analyse (:55), agent de chat (:92, :232), contrat d'outils MCP et Codex (:150), index (:168, :203). codex-thread-rotation porte bien son nom pour 8 tests (:49 à :206) ; 6 autres portent sur le quota (:228), le démarrage à froid (:249) et CodexPerception (:282, :318, :338, :354).
- **Impact :** Un test de non-régression rangé par la revue qui l'a trouvé n'est pas relu quand on modifie le module concerné ; il est redécouvert quand il casse.
- **Nuance du relecteur (elle prime) :** Compteurs et lignes exacts : 19 + 6 + 14 + 2 + 1 = 42 tests, et chaque numéro cité tombe sur un test. À corriger. 1) La cible `chat-codex.test.cjs` est elle-même classée fourre-tout par TSTA-18 : choisir un nom de comportement dès ce ticket. 2) « Le fichier du quota » n'est pas nommé. 3) Les mentions à mettre à jour ne sont pas 5 : au moins 8 lignes dans 6 documents (night-features-delivery.md:820 ; backend-latency-optimization.md:56, :69, :293 ; history/F04.md:92, F06.md:165, F07.md:116, F10.md:107), plus surveillance-runtime.test.cjs:79. 4) Mêmes contraintes de HEAD que TSTA-05 : lignes de plus de 160 caractères refusées à l'ajout (review-regressions en a 33), et suppression de fichiers de test seulement avec `supprime_tests: oui` dans le ticket. 5) review-regressions:52-63 et :308-321 n'affirment que des champs privés (client.rpc, client.dir, client.ready) : leur déplacement vers un fichier au double commun dépend aussi de TSTA-09.

<a id="TSTA-07"></a>
#### TSTA-07 — codex-confinement.test.cjs : 9 sujets dans un fichier, 8 tests géants sur 17

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Tests nommés par chantier

**Suite : pas de ticket.** Effort L : séparer ces tests demande d'abord un état partagé réinitialisable par test (journal commun, compteur de rapport) et les aides partagées du lot L05 ; ce n'est pas un renommage et cela dépasse une session. — _Reprise :_ Après le lot L05 et les renommages L07-03 à L07-05, dans un lot dédié à l'isolation des tests.

- **Où :** tests/codex-confinement.test.cjs:183, 250, 352, 524, 585, 634, 852, 905 ; :457, 703, 790 ; tests/architecture-f05.test.cjs:686
- **Preuve :** 973 lignes (2 819 formatées), 225 assertions (205 comportement / 10 état privé / 10 texte source), 9,4 s cumulées dont 5,6 s pour :352. Tests de plus de 150 lignes formatées : :250 (346 lignes : arguments de sous-agents, `inspectSubAgents` en unitaire, 4 rôles, 2 adaptateurs, mode strict, refus précoce, refus tardif, mode diagnostic, lecture de l'environnement, garde du fil étranger) ; :352 (248 : 6 faux binaires réels, 5 refus, minuterie simulée, cas nominal sur 4 rôles, adaptateurs, mode diagnostic) ; :634 (215 : fil étranger annoncé, non annoncé, fil propre, entre deux tours, événements tardifs, `subAgentActivity`, garde `legacy`) ; :905 (191 : `openedPages` en unitaire, audit du client, validation des sources du chat) ; :524 (174 : 4 contradictions, réponse muette, doublure, strict, bac à sable partiel, diagnostic, rotation) ; :183 (170 : `knownFeatures`, délai de reprise, essai par réglage, `codexVersion`, puis un client) ; :852 (160 : `buildPrompt`, rôle porté par le fil, agent de chat, variante `legacy`) ; :585 (157 : 14 refus, 9 autorisations, 6 validations de constructeur, garde `legacy`). Trois autres tests font de 133 à 138 lignes (:457, :703, :790). Le neuvième géant du périmètre est architecture-f05:686 (151 lignes : révocation MCP, session suivante, archive rouverte). Chaque géant enchaîne des sections séparées par des commentaires (« DEFAULT MODE », « DIAGNOSTIC MODE »).
- **Impact :** Un échec en section 2 masque les sections 3 à 6 et le titre ne dit pas quelle règle est tombée. Les fonctions pures (`inspectSubAgents`, `inspectThread`, `openedPages`, `knownFeatures`, `codexVersion`, `buildPrompt`) n'ont aucun test à leur nom. Découper codex-session-client oblige à relire 2 800 lignes.
- **Nuance du relecteur (elle prime) :** Tailles exactes, remesurées sur la copie formatée : 346, 248, 215, 191, 174, 170, 160 et 157 lignes, puis 138, 135 et 133, et 151 pour f05:686. À corriger. 1) `openedPages` a déjà des tests à son nom (opened-pages.test.cjs:12, :22) ; les autres fonctions pures citées ne sont nommées que dans ce fichier (knownFeatures aussi dans verification). 2) Les durées (9,4 s, 5,6 s) ne sont pas vérifiées. 3) Le risque n'est pas faible : `reported` est un ensemble au niveau du module (codex-session-client.cjs:46-52, une ligne par constat et par processus) et le journal est capturé au niveau du fichier (confinement:28-35) ; les assertions `journal.some(...)` de :242, :304, :551 et :640 peuvent être satisfaites par un test antérieur. Découper ou changer de fichier modifie ce contexte. 4) Déplacer :457 oblige à corriger deux commentaires de production qui nomment ce fichier (codex-session-client.cjs:92, codex-verifier.cjs:53). 5) Contradiction avec TSTA-14 : :755 est ici déplacé vers codex-rpc.test.cjs, là supprimé. 6) Découper :352 (six faux binaires réels) multiplie sa mise en place si elle n'est pas partagée. Effort L plutôt que M.
- **Remède proposé par l'audit :** Six fichiers : `codex-features.test.cjs` (`knownFeatures`, `codexVersion`, `featureArgs`, `subAgentArgs`, `inspectSubAgents`, `inspectThread` : extraits de :183, :250 et :524) ; `codex-confinement-launch.test.cjs` (:153, fin de :183, :250, :352, :425, :524, :948) ; `codex-turn-guard.test.cjs` (:585, :634, :703, :790, :835, et refactor-boundaries:55) ; `codex-rpc.test.cjs` (:499, :755) ; `companion-prompt.test.cjs` (:852) ; `opened-pages.test.cjs` existant (:905). Dans chaque géant, une section commentée devient un `test()`. Les tableaux de cas (`refused`, `allowed`, `contradictions`, `refusals`) deviennent des sous-tests `t.test(nom)` pour que le cas fautif soit nommé. :457 part dans tests/architecture/ (TSTA-08).
- **Risque du remède selon le relecteur :** Une section devenue un test indépendant peut passer grâce à une ligne de journal écrite par un test précédent, ou perdre l'état que la section d'avant lui laissait ; à détecter en lançant chaque nouveau test seul (--test-name-pattern) puis le fichier entier.

<a id="TSTA-16"></a>
#### TSTA-16 — Textes réellement remis à un utilisateur ou à un client : contrat légitime mais réécrit dans chaque fichier

**Verdict : confirmé** · priorité P2 · effort M · risque faible · Tests nommés par chantier

**Suite : pas de ticket.** Touche des libellés français comparés par des tests : l'arbitrage A6 interdit de déplacer ces libellés, et le prérequis (tests sans texte source) n'est pas dans ce lot. — _Reprise :_ Après le ticket qui retire les comparaisons de texte source et une décision sur A6.

- **Où :** tests/architecture-f09.test.cjs:14, 242-270 ; tests/architecture-f06.test.cjs:22-25, 360-392, 534-578 ; tests/architecture-f07.test.cjs:72, 364-460 ; tests/architecture-f05.test.cjs:28-29, 527-571, 686-739 ; tests/codex-confinement.test.cjs:146, 250-351, 852-903 ; tests/architecture-f10.test.cjs:17 ; runtime/session-closing.cjs:129
- **Preuve :** Environ 99 assertions portent sur un texte remis à quelqu'un : 4 phrases de statut de la vue Mémoire et le refus de capacité (f09:14, :242) ; 13 corps d'erreur HTTP (f06:22-25, :360, :534 ; f10:17) ; 5 erreurs rendues à un client MCP externe (f05:28-29, :527, :686) ; la ligne de journal « TVLens — fermeture incomplète de la session … » et les noms d'étapes (archive, scellement, effacement, hôte, agent de chat) dans une trentaine d'assertions de f07 ; le refus de confinement et ses 4 causes (confinement:146, :250, :352) ; les libellés du prompt (« DEMANDE (du spectateur) », « CONSIGNE ACTIVE », « PORTÉE DE LA CONSIGNE », confinement:852) ; les messages d'une question (« Limite de 1 seconde atteinte. », « Nouvelle session. », « Session terminée. »). Ces phrases sont réécrites en clair partout : la ligne de journal, produite à un seul endroit (session-closing.cjs:129), est reconstruite 18 fois dans 4 fichiers de tests (f06 4, f07 6, server-sessions 6, mac-ipc-contract 2).
- **Impact :** Corriger une faute ou reformuler une phrase d'interface touche de 5 à 18 assertions. On ne distingue pas ce qui est un contrat de texte de ce qui est un identifiant (TSTA-12).
- **Remède proposé par l'audit :** La production exporte ses phrases : un module de messages par surface (`runtime/session-closing.cjs` exporte `incompleteEndLine(id, errors)` ; un catalogue des erreurs HTTP avec statut, code et texte ; les phrases de la vue Mémoire dans son modèle de vue). Les tests de scénario importent ces fonctions pour dire « le journal porte cet événement avec ces étapes ». Un seul fichier `tests/wording.test.cjs` épingle le français exact de chaque surface : erreurs HTTP, erreurs MCP, statuts du récap, lignes de journal, libellés du prompt.
- **Risque du remède selon le relecteur :** Un test de scénario qui construit son attendu avec la fonction de production ne voit plus une phrase cassée ; wording.test.cjs doit couvrir chaque fonction exportée, ce que montrerait une mutation de phrase qui ne ferait échouer aucun test.

<a id="TSTB-15"></a>
#### TSTB-15 — Tests-fleuves : plusieurs scénarios par test, noms-paragraphes

**Verdict : confirmé** · priorité P2 · effort L · risque moyen · Tests de comportement

**Suite : pas de ticket.** Effort L : réécriture de tests au-delà d'un déplacement, à faire sur des fichiers formatés et déjà répartis. — _Reprise :_ Après jalon:format et la fin du lot L07, dans un lot dédié.

- **Où :** tests/server-sessions.test.cjs:120, 290, 435, 688 ; tests/server-surveillance.test.cjs:28 ; tests/server-state-views.test.cjs:29 ; tests/session-durable.test.cjs:82, 196, 416, 504, 520, 679, 683, 791 ; tests/surveillance.test.cjs:292, 457 ; tests/surveillance-runtime.test.cjs:116, 277, 294-349 ; tests/session-optimization.test.cjs:10
- **Preuve :** 344 tests pour 2 784 assertions : médiane 6, 90e centile 16, maximum 53 ; 84 tests de plus de 10 assertions, 18 de plus de 20, 6 de plus de 30. server-sessions:120 : 53 assertions, 107 lignes, 12 blocs commentés ; server-surveillance:28 : 52 assertions ; server-state-views : un seul test de 118 lignes. Noms : médiane 94 caractères, 63 au-delà de 120, 15 au-delà de 200, maximum 304 (server-sessions:688). 74 boucles `for (… of […])` déroulent des cas dans un même test (session-durable:504, 520, 683) : le premier cas en échec masque les suivants. surveillance-runtime:294-349 numérote ses cinq scénarios en commentaires. 365 lignes de plus de 200 caractères, 18 de plus de 400, maximum 952 ; quatre fichiers sont en style minifié. Après Prettier, le périmètre passe de 8 987 à 26 780 lignes (session-durable : 3 231).
- **Impact :** Un échec s'affiche comme un titre de 300 caractères et la première assertion fausse ; les scénarios suivants ne s'exécutent pas ; on ne peut pas lancer un scénario seul ; relire une modification y est impraticable.
- **Remède proposé par l'audit :** Un scénario par test : chaque bloc introduit par un commentaire devient un `test()` sous un `describe()` nommé d'après la première proposition du titre actuel ; la préparation commune devient une fabrique du `describe`, quitte à la rejouer. Les boucles deviennent `for (const c of cases) test(…)`, comme le fait déjà tests/tv-overlay-queue.test.cjs:53-54. Garder un test de parcours par fichier, marqué bout en bout, pour l'enchaînement complet. Règle : tout test de plus de 20 assertions ou de 60 lignes formatées est découpé quand on le touche ; commencer par les 6 de plus de 30 assertions, qui gardent CORE-02 et CORE-03.
- **Risque du remède selon le relecteur :** Découper un test-fleuve dont les étapes partagent un état accumulé perd les invariants entre étapes et multiplie la préparation (0,5 à 3,4 s par test dans server-sessions) ; le détectent le compte d'assertions avant et après, la durée de la suite, et le test de parcours conservé.

<a id="TSTA-14"></a>
#### TSTA-14 — Recouvrements à l'intérieur du périmètre : mêmes scénarios dans plusieurs fichiers

**Verdict : nuancé** · priorité P3 · effort M · risque moyen · Tests nommés par chantier

**Suite : pas de ticket.** P3 : fusion ou retrait de tests redondants, possible seulement une fois la répartition faite ; la mesure cas_de_test interdit une baisse nette sans décision (supprime_tests). — _Reprise :_ Après la fin du lot L07, si le propriétaire accepte une baisse motivée de cas_de_test.

- **Où :** tests/architecture-f05.test.cjs:73, 289, 335 ; tests/codex-confinement.test.cjs:585, 634, 703, 755, 790 ; tests/codex-connect-race.test.cjs:35, 48 ; tests/review-regressions.test.cjs:52, 66, 78, 91, 102, 308 ; tests/codex-thread-rotation.test.cjs:206, 249, 282, 318 ; tests/architecture-f06.test.cjs:303 ; tests/architecture-f07.test.cjs:339 ; tests/refactor-boundaries.test.cjs:55
- **Preuve :** 1) Escalade SIGTERM puis SIGKILL du transport : f05:73 et confinement:755 déroulent le même scénario (enfant qui ignore SIGTERM, avance de 2 999 ms puis 1 ms, enfant poli, `process.kill` jamais rappelé, double fermeture sans effet). 2) Garde du fil étranger et tour refusé purgé après 3 s : confinement:634 et :703, rejoués comme déclencheurs dans f05:289. 3) Fermeture pendant une connexion : connect-race:35 et :48, review-regressions:52, :66, :78, :308, f05:335, thread-rotation:206 couvrent la même famille de courses dans 4 fichiers. 4) Démarrage à froid signalé : review-regressions:91 et thread-rotation:249. 5) Remise à zéro du fil après reconnexion : review-regressions:102 et thread-rotation:282, :318. 6) Stockage commencé quand la session se termine : f06:303 (serveur) et f07:339 (les deux hôtes). 7) Le rôle d'analyse refuse outils et web : refactor-boundaries:55 et confinement:585, :790.
- **Impact :** Un changement de comportement voulu casse le même scénario à plusieurs endroits, avec des doublures différentes. Le lecteur ne sait pas quelle version fait foi.
- **Nuance du relecteur (elle prime) :** Seule la paire 1 est un vrai doublon, vérifié à la lecture : f05:73 et confinement:755 déroulent le même scénario, et f05:73 affirme en plus la valeur rendue par close(). Les paires 4 et 5 ne sont pas les mêmes scénarios mais deux couches : review-regressions:91 prouve que l'agent de chat transmet coldStart, thread-rotation:249 que le client le mesure ; review-regressions:102 porte sur CodexPerception après une reconnexion, thread-rotation:282 sur le changement de sujet. La paire 7 est partielle : refactor-boundaries:55 passe par CodexAnalysisAgent et affirme ses propres réglages (dynamicTools vide, web_search désactivé dans les arguments). Les paires 2, 3 et 6 ne sont rapprochées que par leurs titres (statut « supposé »). Contrainte absente de l'audit : à HEAD le cliquet cas_de_test (plancher 612, jamais relâché à la main) interdit toute baisse nette du nombre de tests, et CLAUDE.md interdit de supprimer un test sans demande. Chaque suppression doit donc être demandée explicitement et compensée dans le même ticket, par exemple par un découpage de TSTA-07. Contradiction interne : TSTA-07 déplace confinement:755, ce constat le supprime.
- **Remède proposé par l'audit :** 1) Garder f05:73 (il affirme en plus la valeur rendue par `close()`) et supprimer confinement:755. 2) f05:289 ne garde que « la reconnexion attend la sortie du groupe » ; le déclencheur vient d'un helper du faux App Server. 3) Un seul fichier (TSTA-06) et une table des instants de fermeture : pendant l'accès au système de fichiers, pendant la poignée de main, pendant le recyclage, pendant un tour, pendant l'attente du groupe. 4) et 5) Un test chacun dans le fichier du module. 6) Garder la version à deux hôtes de f07 et réduire f06:303 à ce qui est propre à l'ingestion (signal non annulé). 7) Garder confinement:585, supprimer la partie redondante de refactor-boundaries:55. Avant chaque suppression, vérifier que le test conservé échoue sur la même mutation du code.
- **Risque du remède selon le relecteur :** Supprimer un jumeau qui n'en est pas un (autre couche, autre double) retire une couverture sans que rien n'échoue ; à détecter par la mutation que l'audit prescrit, appliquée au test conservé avant chaque suppression.

<a id="TSTA-15"></a>
#### TSTA-15 — Recouvrements avec les fichiers voisins (server-sessions, moment-index, opened-pages, server-ingest-path, question-ceiling, adapters)

**Verdict : nuancé** · priorité P3 · effort M · risque moyen · Tests nommés par chantier

**Suite : pas de ticket.** P3 : même nature que TSTA-14 (tests proches à rapprocher après répartition) ; ne peut pas se faire avant que les fichiers aient leur nom définitif. — _Reprise :_ Après la fin du lot L07.

- **Où :** tests/architecture-f07.test.cjs:364, 386, 416 ; tests/server-sessions.test.cjs:227, 398, 435, 592, 600 ; tests/architecture-f06.test.cjs:323, 360, 534 ; tests/server-ingest-path.test.cjs:48, 60 ; tests/codex-confinement.test.cjs:905 ; tests/opened-pages.test.cjs:12 ; tests/review-regressions.test.cjs:148, 164, 177, 281 ; tests/refactor-boundaries.test.cjs:168, 203 ; tests/moment-index.test.cjs:131, 151, 215, 295, 363, 478 ; tests/architecture-f04.test.cjs:92 ; tests/question-ceiling.test.cjs:59 ; tests/architecture-f10.test.cjs:92-119 ; tests/adapters.test.cjs:8
- **Preuve :** Rapprochement par les titres et par recherche de motifs, les fichiers voisins n'ayant pas été lus en entier. Titres presque identiques : f07:416 « ending a session archives it and closes its runtime even when adapters fail to close… » et server-sessions:398 ; f07:364 (état final refusé par le disque) et server-sessions:435 ; f07:386 (suppression refusée pendant la capture) et server-sessions:227. Redémarrage de capture et renumérotation : f06:323 et server-sessions:592. Garanties du transport : f06:534, dont le titre dit lui-même « what the transport already guaranteed stays », face à server-sessions:600 et server-ingest-path:60. Outil média tué par son délai : f06:360 (son commentaire renvoie à server-ingest-path) et server-ingest-path:48. `openedPages` en unitaire : confinement:905 et opened-pages:12. Index : review-regressions:148, :164, :281, :177 face à moment-index:295, :131, :215, :478 ; refactor-boundaries:168, :203 face à moment-index:363, :151. Plafond d'une question : f04:92 et question-ceiling:59. Plages d'octets : f10:92-119 et adapters:8.
- **Impact :** Même effet que TSTA-14, avec en plus des harnais d'hôte différents pour un même scénario HTTP.
- **Nuance du relecteur (elle prime) :** Constat que l'audit donne lui-même comme supposé. J'ai lu trois paires en entier, les autres par leurs titres seulement. Les recouvrements existent mais sont partiels, et la règle de fusion proposée ne tient pas telle quelle. f07:416 et server-sessions:398 ont presque le même titre, mais c'est la version HTTP qui affirme le plus : fermeture de l'index en échec, closeErrors, surveillance.json, archive rouverte avec sa question, seconde fin de session. Ce contenu n'est pas « propre au transport » et devrait être porté dans la version à deux hôtes avant toute réduction. confinement:905 (première moitié) et opened-pages:12 testent bien tous deux `openedPages`. adapters:8 ne recouvre f10:92-119 que sur une plage et un 416 ; il couvre aussi cleanupRawMedia et le refus d'un nom de fichier étranger. Deux faits à corriger : server-sessions:600 n'est pas un test mais une assertion du test qui commence en :592 ; f06:534 est un test de caractérisation voulu (history/F06.md:40, « test qui caractérise, vert sur la base »). Même contrainte que TSTA-14 : le cliquet cas_de_test de HEAD interdit une baisse nette.
- **Remède proposé par l'audit :** Après les déplacements de TSTA-05 et TSTA-06, les jumeaux se retrouvent dans le même fichier : fusionner à ce moment-là. Règle : le scénario complet vit dans la version à deux hôtes (`session-end-host-parity`), et le fichier HTTP ne garde que ce qui est propre au transport (statuts, codes, corps). Pour l'index, garder la version de moment-index et y ajouter le cas limite qu'apporte le test de revue s'il manque. Confirmer chaque recouvrement par lecture des deux tests avant de supprimer.
- **Risque du remède selon le relecteur :** Fusionner vers la version à deux hôtes perd les faits que seule la version HTTP affirme ; à détecter par une table des assertions de chaque jumeau, dressée avant la fusion et vérifiée après.

<a id="TSTA-17"></a>
#### TSTA-17 — Comparaisons positionnelles : 267 `deepEqual` de tableaux contre 47 d'objets nommés

**Verdict : confirmé** · priorité P3 · effort S · risque faible · Tests nommés par chantier

**Suite : pas de ticket.** P3 : ne vaut pas une session. — _Reprise :_ À l'occasion d'un ticket qui touche déjà le fichier concerné.

- **Où :** tests/architecture-f08.test.cjs:45 ; tests/architecture-f05.test.cjs (44 occurrences) ; tests/architecture-f09.test.cjs (38) ; tests/architecture-f10.test.cjs (44) ; tests/codex-confinement.test.cjs (30) ; contre-exemple à suivre : tests/architecture-f06.test.cjs:161
- **Preuve :** Le style dominant compare deux tableaux de faits : `assert.deepEqual([p.status, p.audioStatus, p.visionStatus, p.visionError, …], ['ready', 'ready', 'ready', undefined, …])` (f08:45). Par fichier : f04 27, f05 44, f08 49, f09 38, f10 44, review-regressions 12, confinement 30, thread-rotation 15. f06 et f07 font l'inverse (16 et 29 comparaisons d'objets aux clés nommées : `{ handed, cancelled, block, end, order, … }`, f06:161).
- **Impact :** En cas d'échec, le rapport donne une position dans un tableau : il faut recompter pour savoir quel fait a changé. Les lignes dépassent 200 caractères dans la copie d'origine.
- **Remède proposé par l'audit :** Adopter la forme de f06 et f07 : un objet de faits nommés comparé à un objet attendu. À appliquer quand on touche un test (déplacement de TSTA-05 à 07), sans campagne dédiée. L'inscrire dans la convention de tests du dépôt.
- **Risque du remède selon le relecteur :** Changer la forme d'une comparaison en déplaçant un test peut faire perdre un fait ou en intervertir deux sans que la suite le voie, l'attendu étant réécrit du même geste ; seule la relecture du diff, fait par fait, le détecte.

<a id="TSTA-18"></a>
#### TSTA-18 — Autres fichiers fourre-tout hors de la liste : session-optimization, adapters, viewing-features, latency, chat-codex

**Verdict : nuancé** · priorité P3 · effort M · risque faible · Tests nommés par chantier

**Suite : pas de ticket.** Vise des fichiers thématiques fourre-tout autres que les neuf fichiers nommés par chantier : hors de la mesure de ce lot, et leur découpe demande les aides partagées du lot L05 et un choix de fichiers cibles. — _Reprise :_ Après les lots L05 et L07, dans un lot de répartition des fichiers thématiques.

- **Où :** tests/session-optimization.test.cjs:4-19 ; tests/adapters.test.cjs:8-56 ; tests/viewing-features.test.cjs:10-28 ; tests/latency.test.cjs:8-55 ; tests/chat-codex.test.cjs:3-47
- **Preuve :** Lus par leurs titres seulement. session-optimization (5 tests) : pause et reprise de WatchSession (:4), fil Codex chaud (:9, :19), analyseur de flux (:14), cache d'embeddings (:15). adapters (5) : plages du store local (:8), adaptateur OpenRouter (:25, :31, :56), temps d'inspection (:43). viewing-features (6) : cache d'inspection (:10), quota (:13), sélection d'images (:17), moments gardés (:20), ancrage temporel (:25, :28). latency (7) : récap ciblé, métriques, couverture de capture. chat-codex (7) : citations, réglages persistants (:15), modèle choisi (:22). Ces noms désignent une branche ou une couche, pas un comportement.
- **Impact :** Même difficulté que TSTA-05 et 06 pour une trentaine de tests supplémentaires.
- **Nuance du relecteur (elle prime) :** Titres et lignes vérifiés : 5 + 5 + 6 + 7 + 7 = 30 tests, aux numéros cités. Le contenu reste non lu, comme l'audit le dit lui-même (statut « supposé ») : la répartition n'est pas encore une forme cible. Précisions. `saved-moments.test.cjs` et `openrouter.test.cjs` n'existent pas, ce sont des créations. adapters:25, :31 et :56 testent bien OpenRouterAdapter, que l'audit des adaptateurs dit sans appelant en production (audit-adapters.md:152) : leur sort dépend de cette décision et doit être tranché avant ce ticket. `chat-codex.test.cjs` est ici un fourre-tout et, dans TSTA-06, une cible de déplacement : les deux constats doivent être découpés ensemble. Ces fichiers sont écrits en lignes denses (une instruction de test par ligne de plusieurs centaines de caractères) : à HEAD, les déplacer exige le formatage préalable.
- **Remède proposé par l'audit :** Même règle : un fichier par module ou par comportement. Par exemple session-optimization:4 vers `session.test.cjs`, :9 et :19 vers `codex-thread-rotation.test.cjs`, :15 vers `moment-index.test.cjs` ; adapters:8 vers `local-store-range.test.cjs`, :25 à :56 vers un `openrouter.test.cjs` (ou suppression avec l'adaptateur s'il est retiré, voir l'audit des adaptateurs) ; viewing-features:13 vers le fichier du quota, :20 vers `saved-moments.test.cjs`. À préciser après lecture complète de ces fichiers.
- **Risque du remède selon le relecteur :** Répartir des tests dont on n'a lu que le titre peut les ranger sous un module qu'ils n'exercent pas ; à détecter en lisant les require et les assertions de chaque test avant de fixer sa cible.

<a id="TSTB-16"></a>
#### TSTB-16 — Fichiers fourre-tout nommés par chantier, unités éparpillées

**Verdict : nuancé** · priorité P3 · effort M · risque faible · Tests de comportement

**Suite : pas de ticket.** Même cas que TSTA-18 : fichiers thématiques trop larges, hors des neuf fichiers comptés par le cliquet. — _Reprise :_ Après les lots L05 et L07, avec TSTA-18.

- **Où :** tests/viewing-features.test.cjs:10-32 ; tests/session-optimization.test.cjs:4-24 ; tests/video-research.test.cjs:6-60 ; tests/moment-index.test.cjs:60, 422, 478 ; tests/session-optimization.test.cjs:19
- **Preuve :** viewing-features : 6 tests pour 6 unités (CachedInspector, CodexQuota, frame-policy, SavedMoments et ses stores, VideoTools, DeepAsk). session-optimization : SessionClock et WatchSession, CodexSessionAgent, `streamedAnswer`, EmbeddingStore. video-research : MomentSearch, VideoTools, bail de LocalSessionStore, DeepAsk (5 tests), VideoBridge avec MCP sur stdio, ClipInspector avec ffmpeg. À l'inverse une unité est dispersée : `new DeepAsk(` 30 fois dans 10 fichiers, `new VideoTools(` 37 fois dans 12, EmbeddingStore testé dans 2 fichiers. Carte par require : core/deep-ask.cjs importé par 10 fichiers du périmètre, core/video-tools.cjs par 12, core/session.cjs par 9.
- **Impact :** Pour savoir ce qui protège DeepAsk il faut parcourir 10 fichiers ; doublons et trous restent invisibles (voir TSTB-06).
- **Nuance du relecteur (elle prime) :** Compteurs exacts : `new DeepAsk(` 30 fois dans 10 fichiers, `new VideoTools(` 37 fois dans 12, EmbeddingStore dans 2 fichiers, requires de deep-ask 10, video-tools 12, session 9 ; viewing-features a bien 6 tests pour 6 unités. Deux précisions. (1) Le titre est inexact : aucun des trois fichiers n'est nommé d'après un chantier (viewing-features, session-optimization, video-research sont des noms de thème) ; les fichiers nommés par chantier sont architecture-f04 à f10, hors de ce périmètre. (2) Prérequis incomplet : un bloc `test()` déplacé emporte les aides de son fichier (`fixture`, `passage`, `tick`), donc TSTB-04 doit précéder, pas seulement TSTB-02. Une partie des 30 `new DeepAsk(` sont des montages de tests d'intégration, pas des tests de DeepAsk : ils ne se regroupent pas.
- **Remède proposé par l'audit :** Avec l'arborescence de TSTB-02 : un fichier par unité et par aspect (`tests/unit/core/deep-ask.queue.test.cjs`, `.deadline`, `.citations`…), par `git mv` et déplacement de blocs `test()` entiers, sans réécriture, une demande de fusion par unité. Commencer par DeepAsk et VideoTools : les plus dispersés, et les cibles de CORE-13 et CORE-14.
- **Risque du remède selon le relecteur :** Un test oublié pendant le déplacement disparaît sans bruit et un bloc déplacé sans ses aides échoue au chargement ; le détectent le nombre de tests par unité avant et après et une première exécution du fichier cible seul.

<a id="OUBLI-33"></a>
#### OUBLI-33 — État global de processus partagé entre tests, absent de l'audit alors qu'il conditionne tout découpage ou déplacement

**Verdict : nuancé** · Signalement du relecteur — Tests nommés par chantier

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Même travail que TSTA-07 (état partagé entre tests d'un même fichier) : effort L, prérequis dans le lot L05. — _Reprise :_ Avec TSTA-07, après le lot L05 et la fin du lot L07.

- **Signalement :** État global de processus partagé entre tests, absent de l'audit alors qu'il conditionne tout découpage ou déplacement : l'ensemble `reported` de adapters/codex-session-client.cjs:46-52 (une ligne par constat et par processus), les journaux capturés au niveau du fichier (tests/codex-confinement.test.cjs:28-35, tests/architecture-f05.test.cjs:51-53) et la variable TVLENS_CODEX_CONFINEMENT retirée puis rendue par fichier. Les assertions de confinement:242, :304, :551, :640 et le compte exact de f05:384-396 dépendent de ce qui a tourné avant dans le même processus. Il manque une remise à zéro injectable ou un journal par test.

<a id="OUBLI-34"></a>
#### OUBLI-34 — Tests trop longs au seuil des standards

**Verdict : nuancé** · Signalement du relecteur — Tests nommés par chantier

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Effort L, même prérequis que TSTB-15 : à traiter après le formatage et la répartition. — _Reprise :_ Après jalon:format et la fin du lot L07, avec TSTB-15.

- **Signalement :** Tests trop longs au seuil des standards (80 lignes par fonction) : le périmètre en compte 33 sur la copie formatée, l'audit n'en traite que 9 (seuil de 150). Restent notamment tests/review-regressions.test.cjs:215 (149 lignes) et :356 (100), tests/architecture-f08.test.cjs:200 (139) et :261 (119), tests/architecture-f06.test.cjs:438 (126), tests/architecture-f05.test.cjs:527 (119) et :572 (115), tests/architecture-f04.test.cjs:56 (104).

<a id="OUBLI-39"></a>
#### OUBLI-39 — État global du processus modifié par des tests

**Verdict : nuancé** · Signalement du relecteur — Tests de comportement

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Dépend de TSTB-02 (rangement des tests par dossier) : sans retour sur A1 il n'a pas d'objet. — _Reprise :_ Avec TSTB-02, si A1 est révisé.

- **Signalement :** État global du processus modifié par des tests : tests/chat-trace.test.cjs:5 et 16 (`process.env.TVLENS_CODEX_TRACE`, `process.stderr.write`), tests/verification.test.cjs:185-187 (`process.stderr.write`), tests/media-asr-options.test.cjs:29-30 (`process.env.TMPDIR`). Restauré correctement, mais cela interdit de lancer la couche unitaire dans un seul processus (`--test-isolation=none`) pour la boucle rapide visée par TSTB-02, et toute concurrence à l'intérieur d'un fichier.

### L08 — Combler les trous de couverture qui comptent

Vague 1 · 16 constats · 11 tickets

- [T087](travail/tickets/087-pin-the-tool-and-question-limits-of-the-core-with-boundary.md) — Pin the tool and question limits of the core with boundary tests
- [T088](travail/tickets/088-pin-the-refusals-of-capture-blocks-budget-ledger-and-mcp.md) — Pin the refusals of capture blocks, budget ledger and MCP clients
- [T089](travail/tickets/089-pin-the-codex-transport-protocol-with-a-scripted-app-server.md) — Pin the Codex transport protocol with a scripted app server
- [T090](travail/tickets/090-test-the-settings-archive-decoder-and-language-modules.md) — Test the settings, archive, decoder and language modules directly
- [T091](travail/tickets/091-require-every-element-id-looked-up-by-a-tv-script-to-exist.md) — Require every element id looked up by a TV script to exist in its page
- [T092](travail/tickets/092-feed-the-tv-surveillance-views-with-states-published-by-the.md) — Feed the TV surveillance views with states published by the real core
- [T093](travail/tickets/093-test-the-dom-builders-of-the-mac-panels-on-the-shared-fake.md) — Test the DOM builders of the Mac panels on the shared fake document
- [T094](travail/tickets/094-pin-the-answer-of-every-server-command-route-to-a-malformed.md) — Pin the answer of every server command route to a malformed request
- [T095](travail/tickets/095-prove-that-two-overlapping-session-transitions-settle-on.md) — Prove that two overlapping session transitions settle on both hosts
- [T096](travail/tickets/096-compare-the-overlay-constants-of-the-page-and-the-supervisor.md) — Compare the overlay constants of the page and the supervisor to one shared file
- [T097](travail/tickets/097-share-the-ambient-launch-parameter-cases-between-supervisor.md) — Share the ambient launch parameter cases between supervisor and page tests

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [OPS-09](#OPS-09) | 701 assertions de parcours hors ligne dans 6 scripts monolithiques que rien ne lance | nuancé | P1 | pas de ticket |
| [TSTB-05](#TSTB-05) | Aucune table de charges malformées sur les routes HTTP | nuancé | P1 | [T094](travail/tickets/094-pin-the-answer-of-every-server-command-route-to-a-malformed.md) |
| [TSTB-14](#TSTB-14) | Courses entre transitions d'hôte non testées | nuancé | P1 | [T095](travail/tickets/095-prove-that-two-overlapping-session-transitions-settle-on.md) |
| [TSTC-09](#TSTC-09) | Quatre smokes navigateur TV sans script npm ni CI, seul test d'environ 2 730 lignes de vues | nuancé | P1 | pas de ticket |
| [UI-07](#UI-07) | Modules DOM sans test de comportement | confirmé | P2 | [T093](travail/tickets/093-test-the-dom-builders-of-the-mac-panels-on-the-shared-fake.md) |
| [TSTB-06](#TSTB-06) | Bornes dures et validateurs du cœur sans test ciblé | nuancé | P2 | [T087](travail/tickets/087-pin-the-tool-and-question-limits-of-the-core-with-boundary.md), [T088](travail/tickets/088-pin-the-refusals-of-capture-blocks-budget-ledger-and-mcp.md) |
| [TSTB-07](#TSTB-07) | Transport Codex : un seul test, aucun cas d'erreur | nuancé | P2 | [T089](travail/tickets/089-pin-the-codex-transport-protocol-with-a-scripted-app-server.md) |
| [TSTB-17](#TSTB-17) | Modules sans test propre et couverture jamais mesurée | nuancé | P2 | [T090](travail/tickets/090-test-the-settings-archive-decoder-and-language-modules.md) |
| [TSTC-10](#TSTC-10) | Le smoke Electron est l'unique filet de renderer.js et reste hors boucle | nuancé | P2 | pas de ticket |
| [TSTC-12](#TSTC-12) | Les modèles de vue TV sont testés sur des états écrits à la main, jamais sur ce que le serveur publie | confirmé | P2 | [T092](travail/tickets/092-feed-the-tv-surveillance-views-with-states-published-by-the.md) |
| [TSTC-14](#TSTC-14) | Généraliser la fixture partagée aux constantes et au format de lancement ambiant | confirmé | P2 | [T096](travail/tickets/096-compare-the-overlay-constants-of-the-page-and-the-supervisor.md), [T097](travail/tickets/097-share-the-ambient-launch-parameter-cases-between-supervisor.md) |
| [TSTB-18](#TSTB-18) | Des tests maintiennent en vie du code mort | confirmé | P3 | pas de ticket |
| [OUBLI-22](#OUBLI-22) | Aucun constat sur le filet de sécurité des chantiers L | nuancé | — | pas de ticket |
| [OUBLI-42](#OUBLI-42) | Le seul parcours où les vrais scripts TV parlent à la vraie page ambiante n'a pas de commande | nuancé | — | pas de ticket |
| [OUBLI-44](#OUBLI-44) | La composition de production de l'hôte Mac n'est exécutée par aucun test | nuancé | — | pas de ticket |
| [OUBLI-45](#OUBLI-45) | Aucun garde d'identifiants côté TV | confirmé | — | [T091](travail/tickets/091-require-every-element-id-looked-up-by-a-tv-script-to-exist.md) |

<a id="OPS-09"></a>
#### OPS-09 — 701 assertions de parcours hors ligne dans 6 scripts monolithiques que rien ne lance

**Verdict : nuancé** · priorité P1 · effort L · risque moyen · Scripts et outillage

**Suite : pas de ticket.** Les six scripts de parcours exigent navigateur ou Electron (TVLENS_CHROME présent 6 fois) ; tests/e2e/ contredit la règle A1 et le rangement dépend d'OPS-12 du lot L09. — _Reprise :_ Après le lot L09 (OPS-12), en session interactive du propriétaire avec Chrome et Electron.

- **Où :** scripts/smoke-tv-overlay.mjs:248 ; scripts/smoke-electron.mjs:7-18 ; scripts/smoke-electron.mjs:41 ; scripts/smoke-electron.mjs:222 ; scripts/smoke-electron.mjs:598 ; scripts/smoke-tv-ambient.mjs:22 ; scripts/smoke-lg-ui.mjs:13 ; scripts/simulate-tv-ambient.mjs:27 ; scripts/smoke-tv-timeline.mjs:72 ; package.json:12 ; README.md:176-179
- **Preuve :** Assertions par script : smoke-tv-overlay 294 (1 045 lignes), smoke-electron 200 (661), smoke-tv-ambient 110 (612), smoke-lg-ui 40 (126), simulate-tv-ambient 33 (343), smoke-tv-timeline 24 (289) ; total 701 sur 3 076 lignes. Un seul a une entrée npm (test:electron) ; le README en cite 2 des 5 autres. Chemin de Chrome macOS par défaut écrit 6 fois. smoke-electron écrit 19 fichiers à noms fixes dans /tmp, écrit dans docs/ en mode réel (:222, :254) et mêle le parcours hors ligne à 4 modes à fournisseur réel par drapeaux (:7-11). Chaque script est un flux unique : la première assertion fausse arrête tout, sans compte rendu par scénario. Ce sont les seules exécutions du DOM de app/renderer.js et de tv/app dans un vrai moteur (l'audit des interfaces le relève pour chacune de ses refontes).
- **Impact :** La seule couverture réelle des interfaces n'est lancée que si quelqu'un y pense ; elle ne peut pas tourner telle quelle sur un runner Linux ; un échec ne dit pas quel scénario est touché ni si les suivants passent.
- **Nuance du relecteur (elle prime) :** Compteurs exacts : 294, 200, 110, 40, 33 et 24 assertions, soit 701 sur 3 076 lignes ; chemin de Chrome écrit 6 fois ; écritures dans docs/ aux lignes 222 et 254. Précisions.

  (1) « Que rien ne lance » vaut pour l'automatisme : CONTRIBUTING.md:20 demande `npm run test:electron` à chaque modification.

  (2) Les scripts TV acceptent déjà TVLENS_CHROME : ils peuvent tourner sur un runner Linux sans réécriture. Seul le parcours Electron est incertain sous Linux (non vérifié).

  (3) smoke-electron écrit 17 noms distincts dans /tmp en 19 écritures, et porte 3 drapeaux à fournisseur réel (lignes 7 à 9) plus --local-inspection.

  (4) Le support partagé est annoncé à deux endroits : tests/e2e/support ici, scripts/lib dans OPS-12. N'en garder qu'un ; scripts/lib est le seul compatible avec la règle d'import d'OPS-13.

  (5) Les blocs partagent l'état d'une même app : découpés en tests, un échec se propage aux suivants. Prévoir l'arrêt du fichier au premier scénario rouge, ou des scénarios réellement indépendants.
- **Remède proposé par l'audit :** Dossier tests/e2e/ en node:test : mac.e2e.mjs (scénarios en blocs test partageant une app lancée dans before et fermée dans after), tv-panel, tv-timeline, tv-overlay, tv-ambient et tv-ambient-native. Support partagé tests/e2e/support/ (electron, tv-page, chrome ; voir OPS-12). Chrome résolu par TVLENS_CHROME puis par `channel: 'chrome'` de Playwright, comme le fait déjà prototypes/lg-sidebar/smoke.cjs:8. Sorties dans TVLENS_SMOKE_OUT, par défaut un dossier temporaire. Les variantes à fournisseur réel partent dans scripts/live/. Entrées npm test:e2e:tv et test:e2e:mac, tâches CI de OPS-05. Migration par extraction et non par réécriture : déplacer les blocs tels quels, dans le même ordre, un script par ticket, en comparant le nombre d'assertions avant et après (701).
- **Risque du remède selon le relecteur :** L'extraction perd ou réordonne une assertion, ou des scénarios dépendants masquent la cause du premier échec : détecté par le compte d'assertions avant et après (701) et par un passage vert de chaque parcours migré, un seul navigateur ou Electron à la fois sur ce poste.

<a id="TSTB-05"></a>
#### TSTB-05 — Aucune table de charges malformées sur les routes HTTP

**Verdict : nuancé** · priorité P1 · effort M · risque faible · Tests de comportement

**Suite :** [T094](travail/tickets/094-pin-the-answer-of-every-server-command-route-to-a-malformed.md) « Pin the answer of every server command route to a malformed request ».

- **Où :** server/http.cjs:8, 154-182, 205-219, 275-289 ; tests/remote-server.test.cjs:36, 40 ; tests/server-surveillance.test.cjs:59, 129, 151 ; tests/server-sessions.test.cjs:248-255, 613 ; tests/transcription-language.test.cjs:14-15
- **Preuve :** 16 routes POST. Sur les 76 fichiers de tests, les assertions de statut 400 portent sur 7 routes, un cas chacune, jamais avec un corps mal typé (tableau, null, nombre à la place d'une chaîne). Sans aucun test : 415 « JSON requis » (http.cjs:159), 400 « JSON invalide » (:180), jeton de moins de 32 caractères (:8), `/v1/settings/transcription` par HTTP (testée seulement par `HeadlessRuntime.prototype.setTranscriptionLanguage.call(stub)`), cas négatifs de `/v1/moments/detail`, `/v1/surveillance/stop` et `/history`. Le 413 n'est vérifié que dans architecture-f06:576. Six assertions ne vérifient que `status === 400`, statut par défaut de toute exception, TypeError compris (http.cjs:280-283) : elles passent aussi sur un plantage.
- **Impact :** SEC-01 (500 générique au lieu de 400 brut) et ADP-10 (schémas à la frontière) ne peuvent pas être menés sans filet ; un TypeError renvoyé au client reste invisible.
- **Nuance du relecteur (elle prime) :** 17 routes POST, pas 16 (server/http.cjs:181-220 : settings/transcription, session/start, pause, end, sessions/close, sessions/:id/open, resume, delete, moments/detail, questions, questions/:id/cancel, surveillance/start, stop, retry, history, detail, segments). « Un cas chacune » est faux pour deux routes : sessions/:id/(open|resume|delete) a 18 cas avec message exact (server-sessions:248-250, six identifiants par trois actions) et /v1/segments en a plusieurs (server-ingest-path:105, server-sessions:610 et 613, architecture-f06:383-386 et 507). Le reste tient : aucun test pour 415 (http.cjs:159), « JSON invalide » (:180), le jeton court (:8), /v1/settings/transcription par HTTP ; les six assertions au seul statut 400 sont remote-server:36 et 40, server-surveillance:59, 129, 151, server-sessions:613 ; le 400 par défaut est en http.cjs:279-283 et le message brut part ligne 284-285. Remédiation à préciser : un hôte unique pour des `test()` générés suppose un `describe` avec `before`/`after` (le `t` est propre à chaque test). Recoupe le test de contrat demandé par ADP-10 : un seul des deux tickets doit le porter.

<a id="TSTB-14"></a>
#### TSTB-14 — Courses entre transitions d'hôte non testées

**Verdict : nuancé** · priorité P1 · effort M · risque faible · Tests de comportement

**Suite :** [T095](travail/tickets/095-prove-that-two-overlapping-session-transitions-settle-on.md) « Prove that two overlapping session transitions settle on both hosts ».

- **Où :** runtime/headless-runtime.cjs:343 ; tests/architecture-f06.test.cjs:348 ; tests/chat-instruction.test.cjs:45-58 ; tests/session-durable.test.cjs:362, 539 ; tests/session-latency.test.cjs:231
- **Preuve :** Recherche sur les 76 fichiers : aucun `Promise.all` ne combine deux transitions de session (start, end, open, resume, remove, pause) ; `exclusive` n'apparaît qu'une fois, appelé directement (architecture-f06:348) ; « Réglage en cours, réessaie. » (headless-runtime.cjs:343) : 0 occurrence. Les courses testées dans le périmètre sont écriture contre fin de session (session-durable:362, 539 ; chat-instruction:45-58) et ingestions qui se chevauchent (session-latency:231), jamais transition contre transition. Des tests paramétrés par hôte existent dans architecture-f07 (9 titres « server host (HTTP) — … »), non lus : une couverture sous une autre forme y est possible.
- **Impact :** CORE-01 extrait `runtime/exclusive.cjs` pour les deux hôtes : sans contrat de course, une divergence Mac contre serveur (il en existe déjà, voir CORE-01) réapparaîtra sans bruit.
- **Nuance du relecteur (elle prime) :** L'absence est vérifiée, et non plus supposée : `exclusive` n'apparaît qu'en architecture-f06:348, « Réglage en cours, réessaie. » (headless-runtime.cjs:343) n'est affirmé nulle part, et les scénarios à deux hôtes d'architecture-f07 (lignes 322-460, lus par leurs titres) couvrent fin contre question, fin contre passage en cours d'écriture, suppression pendant la capture et disque qui refuse, jamais transition contre transition ; architecture-f06:343 couvre bloc contre fin. En revanche le harnais demandé existe déjà : architecture-f07.test.cjs:169 (`serverHost(t)`), :221 (`macHost(t)`), :311-312 (`HOSTS`, `onBothHosts(title, scenario)`), avec les gestes start, passage, pause, end, delete, open, ask. Le contrat de courses doit en être extrait, pas rebâti depuis mac-ipc-contract ; l'effort baisse d'autant.

<a id="TSTC-09"></a>
#### TSTC-09 — Quatre smokes navigateur TV sans script npm ni CI, seul test d'environ 2 730 lignes de vues

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Tests des interfaces

**Suite : pas de ticket.** Les quatre smokes TV exigent un vrai navigateur (Chrome) : ils ne peuvent pas tourner dans la boucle de tickets. — _Reprise :_ Session interactive du propriétaire sur une machine avec Chrome, avant les lots de rendu TV de la vague 2 (TV-01, TV-02).

- **Où :** scripts/smoke-lg-ui.mjs:10-13 ; scripts/smoke-tv-timeline.mjs:11-17, 69-72 ; scripts/smoke-tv-overlay.mjs:19-27, 248, 965-1036 ; scripts/smoke-tv-ambient.mjs:20-22, 48-54 ; tv/app/companion.js:363 ; tv/app/surveillance-view.js:544 ; tv/app/sessions-view.js:368 ; package.json:12-26
- **Preuve :** 2 072 lignes, 468 assertions : lg-ui 40 (appairage, focus, envoi, Retour, dictée) ; timeline 24 (frise, miniatures, regroupement, fin de session) ; overlay 294 en 8 sections (sondage léger et 304, serveur ancien, carte bas-gauche hors de la vidéo, registre restauré, vue surveillance à la télécommande, question longue, sessions, puis section 8 : le vrai RemoteServer et HeadlessRuntime en mode smoke sur port éphémère) ; ambient 110 en 17 vérifications (accord, touches, échéances, pixels hors boîte, paquet de sonde). Dépendances : playwright-core et un Chrome installé (chemin macOS en dur, surchargé par TVLENS_CHROME), sharp pour trois d'entre eux. Headless, copie temporaire de tv/app sans connection.js, requêtes interceptées, horloge de page pilotée ; ni modèle ni réseau. Validité statique vérifiée : tous les modules importés existent ; 10, 19, 50 et 1 ids référencés existent dans tv/app (hors `#close`, contrôle d'absence, et `#video-fixture`, injecté par le smoke) ; classes présentes ; RemoteServer.listen et HeadlessRuntime exportés. Seul smoke-electron a un script npm. Ce qui suit la garde CommonJS n'est atteignable par aucun test Node : companion.js 364-1263, surveillance-view.js 545-1249, sessions-view.js 369-714, plus timeline-view.js, capture-control.js et ambient.js en entier, soit environ 2 730 lignes sur 4 683.
- **Impact :** Focus télécommande, fenêtrage, boucle de sondage et dialogues régressent sans signal tant que personne ne lance ces scripts à la main ; les découpages TV-01 à TV-03 n'ont pas d'autre filet.
- **Nuance du relecteur (elle prime) :** Compteurs exacts : 2 072 lignes, 40 + 24 + 294 + 110 assertions, 2 736 lignes de vues hors d'atteinte de Node sur 4 683, chemin Chrome en dur dans les quatre scripts. Précisions pour le ticket : scripts/smoke-tv-ambient.mjs prend --out (l.19) et non TVLENS_SMOKE_OUT ; scripts/smoke-lg-ui.mjs n'écrit aucune sortie ; playwright-core ne télécharge aucun navigateur à l'installation, donc le repli « Chromium installé par playwright-core » demande une étape explicite (npx playwright-core install chromium). scripts/simulate-tv-ambient.mjs (vrais tv/controller.py et tv/ambient.py face à la vraie page ambiante, hermétique, 21 assertions) devrait entrer dans la même commande : c'est le seul parcours qui relie le Python à la page.
- **Remède proposé par l'audit :** Script `"test:smoke:tv"` enchaînant les quatre. Lancement commun scripts/lib/browser.mjs : `executablePath: process.env.TVLENS_CHROME`, sinon le Chromium installé par playwright-core, sinon message « NON exécuté » et code 2 (ce que seul smoke-tv-ambient.mjs:48-54 fait aujourd'hui). Sorties sous TVLENS_SMOKE_OUT pour les quatre (smoke-lg-ui n'en a pas). CI : job Linux headless à chaque changement de tv/app, server/ ou runtime/, captures en artefacts. Durée non mesurée (estimation : moins de deux minutes pour les quatre).
- **Risque du remède selon le relecteur :** En headless Linux, polices et rendu diffèrent du Chrome macOS : les contrôles au pixel de smoke-tv-ambient.mjs peuvent échouer à tort ; un premier passage en CI en mode informatif, captures en artefacts, le révèle avant de rendre le job bloquant.

<a id="UI-07"></a>
#### UI-07 — Modules DOM sans test de comportement

**Verdict : confirmé** · priorité P2 · effort M · Interfaces (Mac, TV, scripts Python)

**Suite :** [T093](travail/tickets/093-test-the-dom-builders-of-the-mac-panels-on-the-shared-fake.md) « Test the DOM builders of the Mac panels on the shared fake document ».

Constat d'origine :

- Où : `ui/job-card.js` (233 lignes), `surveillance-dom.js`, `sessions-dom.js`, `shell.js`.
- Preuve : seuls des regex les couvrent. Trois faux DOM artisanaux (`architecture-f09:227`, `tv-overlay-queue:236`, `recording:26`). Aucune bibliothèque DOM dans `package.json`.
- Remède : `tests/helpers/fake-dom.cjs` commun, puis tests de `jobEntry`, `cardNode`, `sessionEntry`.
- Effort M.

<a id="TSTB-06"></a>
#### TSTB-06 — Bornes dures et validateurs du cœur sans test ciblé

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Tests de comportement

**Suite :** [T087](travail/tickets/087-pin-the-tool-and-question-limits-of-the-core-with-boundary.md) « Pin the tool and question limits of the core with boundary tests » ; [T088](travail/tickets/088-pin-the-refusals-of-capture-blocks-budget-ledger-and-mcp.md) « Pin the refusals of capture blocks, budget ledger and MCP clients ».

- **Où :** core/video-tools.cjs:128, 146, 151-155 ; core/deep-ask.cjs:57-59 ; runtime/session-runtime.cjs:597-631 ; adapters/remote-media.cjs:29-39 ; adapters/trial-budget.cjs:17, 21, 42 ; adapters/local-store.cjs:113, 240, 254 ; adapters/video-bridge.cjs:26 ; tests/remote-media.test.cjs:13-14
- **Preuve :** Recherche par message et par symbole sur les 76 fichiers. Les 12 `assert.rejects(tools.call(…), /…/)` visent l'annulation, « postérieur », « expiré », « purgé » et exactSpeech ; aucune ne vise les 8 appels d'outils, les 60 s de transcription, les 20 s et 4 segments de réexamen, les 2 inspections, « Outil inconnu » ni la question invalide. « Cinq questions sont déjà en attente » : 0 occurrence. `validateSegment` : 0 référence et aucun de ses 4 messages. `validateRemote` : 2 refus affirmés sur 5 (/Intervalle/, /Ordre/). trial-budget : seul /plafond/ (×3), rien sur le registre illisible ou invalide, la réservation inconnue ni le verrou (ADP-16). « Média absent », « illisible », « tronqué » et « Trop de clients MCP » : 0 occurrence. Une couverture indirecte par simple statut 400 reste possible.
- **Impact :** CORE-14 (registre d'outils et limites en constantes), CORE-18 (une seule `validateCapturedSegment`) et ADP-10 changeront ces règles sans qu'aucun test ne signale un plafond perdu ou déplacé.
- **Nuance du relecteur (elle prime) :** Exact pour l'essentiel : 0 occurrence dans les 76 fichiers pour les huit appels (core/video-tools.cjs:128), 60 s (:146), « Outil inconnu » (:151), 20 s et quatre segments (:152), deux inspections (:154), question de réexamen (:155), « Question invalide » et « Cinq questions » (core/deep-ask.cjs:56-57), les quatre messages de validateSegment (runtime/session-runtime.cjs:597-631, appelé en headless-runtime.cjs:789 et app/main.cjs:415), « Trop de clients MCP » (video-bridge.cjs:26), registre illisible ou invalide, réservation, verrou. À corriger : /plafond/ apparaît 2 fois, pas 3 (budget.test.cjs:13 et 19), et la ligne 19 vise en fait le refus du modèle sans plafond validé. validateRemote : au-delà des 5 refus de premier niveau (2 affirmés), 5 autres messages le sont déjà dans server-ingest-path:63-66 et 76-86 (base64, taille, déclarations d'images masquées, 11 cas) : la table doit prolonger ce test, pas repartir de zéro. « Média tronqué » est couvert par le comportement dans architecture-f10:226-232 (404) ; les trois messages de local-store (:113, :240, :254) ne sortent jamais du module pour le clip servi (capturés ligne 259, rendus en 404), donc à affirmer par statut, pas par texte.

<a id="TSTB-07"></a>
#### TSTB-07 — Transport Codex : un seul test, aucun cas d'erreur

**Verdict : nuancé** · priorité P2 · effort S · risque faible · Tests de comportement

**Suite :** [T089](travail/tickets/089-pin-the-codex-transport-protocol-with-a-scripted-app-server.md) « Pin the Codex transport protocol with a scripted app server ».

- **Où :** adapters/codex-rpc.cjs:67-68, 72-77 ; tests/codex-stream-decoding.test.cjs:8-26
- **Preuve :** Dans le périmètre, CodexRpc n'a qu'un test : un vrai processus enfant et deux vraies minuteries (40 et 20 ms), pour le seul découpage UTF-8. Rien sur : ligne non JSON, tampon de plus de 4 Mo (fermeture muette, :67), exception du gestionnaire avalée par `try{this.receive(JSON.parse(line));}catch{}` (:67), `message.error` remplacé par un texte fixe (:76), délai de 15 000 ms sur un `setTimeout` non injectable (:72), `send` une fois déconnecté. Aucun des 76 fichiers ne fait lever `onEvent` (grep). Les tests de chantier qui importent CodexRpc (architecture-f05, f08, codex-confinement) n'ont pas été lus.
- **Impact :** ADP-01 et ADP-02 (séparer l'analyse de la distribution, garder le diagnostic) n'ont aucun test d'appui ; un changement de forme du protocole devient une question muette jusqu'au plafond de 5 minutes.
- **Nuance du relecteur (elle prime) :** Vrai dans le périmètre, faux sur l'ensemble : les tests de chantier que l'audit dit ne pas avoir lus couvrent une partie des cas listés. architecture-f08:291-301 affirme par message exact l'envoi sur transport mort (« Codex déconnecté. »), le délai dépassé et la requête en attente coupée par `close()` ; il y passe un délai de 30 ms par le troisième paramètre `request(method, params, timeoutMs)` : la durée est donc injectable par appel, seule la fonction de minuterie ne l'est pas (codex-rpc.cjs:72). codex-confinement:104-125 est un faux binaire qui répond `{ error }` à travers un vrai CodexRpc. architecture-f05:68-205 couvre le groupe de processus et la fermeture. Restent sans test nulle part : ligne non JSON, tampon de plus de 4 Mo (fermeture muette) et exception du gestionnaire avalée (:67), texte fixe à la place de `message.error` (:76). `receive()` est déjà appelable sans processus : le test par table peut précéder l'extraction de `decodeLines` et `dispatch`.

<a id="TSTB-17"></a>
#### TSTB-17 — Modules sans test propre et couverture jamais mesurée

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Tests de comportement

**Suite :** [T090](travail/tickets/090-test-the-settings-archive-decoder-and-language-modules.md) « Test the settings, archive, decoder and language modules directly ».

**Part laissée de côté :** Part restante hors L08-04 : la mesure de couverture par dossier touche le harnais ou la CI et demande une décision du propriétaire ; main de server/main.cjs attend le refactor de composition des hôtes ; les tests de fermeture de session sont couverts par le renommage L07-04. Non confirmé par le code : codex-analysis-agent, companion-prompt et mcp/server.cjs sont déjà importés ou lancés par des tests nommés d'après un comportement (tests/codex-confinement.test.cjs:10,12, tests/codex-thread-rotation.test.cjs:6, tests/video-research.test.cjs:54). — _Reprise :_ Mesure de couverture : décision du propriétaire (harnais) ; server/main.cjs : refactor de composition des hôtes de la vague 2.

- **Où :** core/ports.cjs ; core/transcription-language.cjs ; adapters/ffmpeg.cjs ; adapters/verification-archive.cjs ; adapters/viewing-settings.cjs ; mcp/server.cjs ; runtime/session-closing.cjs ; adapters/codex-analysis-agent.cjs ; adapters/companion-prompt.cjs ; server/main.cjs ; tests/server-sessions.test.cjs:620
- **Preuve :** Carte par require sur 72 fichiers de production : 63 importés par au moins un test du périmètre (core 20/22, runtime 4/5, adapters 36/41, server 2/2, mcp 1/2). Importés par aucun test : core/ports.cjs (103 lignes, 9 703 octets, décoratif selon CORE-09), core/transcription-language.cjs (6 l., 319 o), adapters/ffmpeg.cjs (16 l., 1 315 o ; 50 l. formaté), adapters/verification-archive.cjs (13 l., 605 o), adapters/viewing-settings.cjs (7 l., 640 o), mcp/server.cjs (81 l., 2 556 o ; lancé en processus enfant par video-research:54, lu comme texte par question-ceiling:207). Importés seulement par des tests de chantier : runtime/session-closing.cjs (134 l., 5 511 o), adapters/codex-analysis-agent.cjs (50 l., 1 232 o), adapters/companion-prompt.cjs (153 l., 15 290 o). server/main.cjs : seul `settings` est testé (:620), `main` jamais. Mesure sur 12 fichiers purs : clip-container à 21 % des branches sans son test d'intégration ; session.cjs lignes 427-476 non couvertes ; video-tools à 100 % des lignes mais 79 % des branches.
- **Impact :** Le modèle d'extraction du cœur (`session-closing`) et les consignes du compagnon (15 ko) ne sont protégés que par des tests de chantier voués à être rangés ; sans mesure, aucun seuil ne peut être tenu.
- **Nuance du relecteur (elle prime) :** La carte par require est exacte (72 fichiers ; core 20/22, runtime 4/5, adapters 36/41, server 2/2 ; les cinq fichiers sans aucun test ; session-closing, codex-analysis-agent et companion-prompt importés par des tests de chantier seulement ; tailles justes). Précisions. core/ports.cjs ne contient que des JSDoc (requis pour ses types par core/verification.cjs:10 et core/surveillance.cjs:19) : rien d'exécutable à tester, il n'a pas sa place dans la liste. adapters/ffmpeg.cjs et core/transcription-language.cjs sont exercés indirectement (clip-inspector, transcription-settings, local-transcriber) ; viewing-settings et verification-archive ne sont requis que par app/main.cjs, donc relèvent des tests de l'hôte Mac (non vérifié). session-closing a déjà sept tests unitaires directs (architecture-f07:75-154) : il s'agit de les déplacer, pas d'en écrire. « Rapport par dossier, en branches » n'est pas natif à la couverture de Node (seuils globaux) : il faut un lancement par dossier ou un script sur lcov. Les pourcentages de couverture cités n'ont pas été remesurés.

<a id="TSTC-10"></a>
#### TSTC-10 — Le smoke Electron est l'unique filet de renderer.js et reste hors boucle

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Tests des interfaces

**Suite : pas de ticket.** Le smoke Electron exige Electron et un affichage : il ne peut pas tourner dans la boucle de tickets. — _Reprise :_ Session interactive du propriétaire avec Electron, avant le lot de rendu Mac de la vague 2 (UI-02).

- **Où :** scripts/smoke-electron.mjs:1-12, 41-43, 269, 444, 580, 591-598, 625-656 ; package.json:12-13, 16, 19, 23 ; app/main.cjs:38-42 ; tests/mac-ui.test.cjs:692-698
- **Preuve :** 661 lignes, 200 assertions, 48 waitForFunction, un seul script séquentiel avec deux lancements d'Electron (parcours complet, puis plancher disque l.596-623). Electron réel piloté par `playwright-core._electron` avec `--smoke-test` : agents simulés et userData temporaire (main.cjs:38-42). Capture synthétique dans la page (canvas animé et oscillateur à la place de getDisplayMedia, l.625-656) : ni réseau ni modèle par défaut ; les drapeaux `--live-verifier`, `--live-video-agent`, `--live-inspection` (4 scripts npm) appellent Codex réel. Couvre : accueil et taille minimale, capture, passage sans image, récap, relecture par protocole média, chat et fraîcheur, annulation, surveillance (restauration, signal, carte, barre repliée, historique), sessions durables, registre non repris, plancher disque. Ne couvre pas la recherche de passages (l.580 : focus seulement). Écrit 17 fichiers à chemins fixes /tmp/tvlens-*.png et .json. Fenêtre réelle : non headless. Validité statique : 88 ids référencés, tous dans app/index.html sauf `#auto-frequency` et `#watch-signals` (contrôles d'absence l.275-278) ; 15 méthodes window.tvlens toutes exposées ; drapeaux reconnus par main.cjs. Faute de l'exécuter, mac-ui.test.cjs:694-698 relit son texte pour vérifier qu'il n'appelle rien d'inexistant.
- **Impact :** Les 837 lignes de renderer.js n'ont que ce parcours ; il n'est ni dans npm test ni en CI ; un échec en son milieu n'isole pas l'étape fautive et laisse des fichiers dans /tmp.
- **Nuance du relecteur (elle prime) :** 661 lignes, 200 assertions, 48 waitForFunction et 17 chemins fixes sous /tmp : exacts. Trois scripts npm appellent Codex réel (test:electron:verify-live, deep-live, full-live), pas quatre : test:electron:sheets (package.json:23) passe --local-inspection, sans drapeau live. « Hors boucle » vaut pour npm test et la CI seulement : CONTRIBUTING.md:20 prescrit déjà npm run test:electron après npm test. Le point 3 (étape recherche) est le filet de TSTC-01 et doit partir avec lui ; la recherche fonctionne en mode simulé (tests/mac-ipc-contract.test.cjs:660).
- **Remède proposé par l'audit :** (1) CI : job macOS (Linux sous xvfb à valider) lançant `npm run test:electron` à chaque changement de app/ ; sorties sous TVLENS_SMOKE_OUT (défaut : dossier temporaire) publiées en artefacts. (2) Découper le script en étapes nommées `step('surveillance', fn)` avec rapport PASS ou FAIL par étape, sur le modèle de `check` dans scripts/smoke-tv-ambient.mjs:148-151, sans toucher aux assertions. (3) Ajouter l'étape recherche : requête, résultat dessiné, changement de session qui vide la liste. (4) Renommer les variantes payantes en `probe:electron:*`.
- **Risque du remède selon le relecteur :** Envelopper un script séquentiel à état partagé dans des step() peut casser la portée de variables réutilisées plus loin ; le smoke lui-même le détecte s'il est lancé avant et après, en vérifiant que les 200 assertions y sont toujours.

<a id="TSTC-12"></a>
#### TSTC-12 — Les modèles de vue TV sont testés sur des états écrits à la main, jamais sur ce que le serveur publie

**Verdict : confirmé** · priorité P2 · effort M · risque faible · Tests des interfaces

**Suite :** [T092](travail/tickets/092-feed-the-tv-surveillance-views-with-states-published-by-the.md) « Feed the TV surveillance views with states published by the real core ».

- **Où :** tests/tv-panel.test.cjs:14-27, 226-297 ; tests/mac-ui.test.cjs:143-178, 347-360 ; scripts/smoke-tv-overlay.mjs:965-1036
- **Preuve :** tests/tv-panel.test.cjs ne requiert aucun module de core/, runtime/ ou server/ : l'état de surveillance est le littéral `compact()` (l.15-22), les cartes `sourcedCard()` (l.23-27). À l'inverse tests/mac-ui.test.cjs:143-178 fabrique l'état avec le vrai `Surveillance` et des ports scriptés (commentaire l.143-144 : vérifié contre l'état que les hôtes publient, pas contre une copie écrite à la main). Le seul passage d'un état réel vers la page TV est la section 8 du smoke overlay, hors npm test.
- **Impact :** Un champ renommé ou retiré côté serveur (backlog.passagesFailed, registry.status, activity.label) laisse les 19 tests de tv-panel verts ; le défaut n'apparaît que sur la TV.

<a id="TSTC-14"></a>
#### TSTC-14 — Généraliser la fixture partagée aux constantes et au format de lancement ambiant

**Verdict : confirmé** · priorité P2 · effort M · risque faible · Tests des interfaces

**Suite :** [T096](travail/tickets/096-compare-the-overlay-constants-of-the-page-and-the-supervisor.md) « Compare the overlay constants of the page and the supervisor to one shared file » ; [T097](travail/tickets/097-share-the-ambient-launch-parameter-cases-between-supervisor.md) « Share the ambient launch parameter cases between supervisor and page tests ».

- **Où :** tests/fixtures/tv-overlay-queue-cases.json ; tests/tv-overlay-queue.test.cjs:13-68 ; tests/test_tv_ambient.py:516-560 ; tv/ambient.py:32-48, 232-240 ; tv/app/surveillance-overlay.js:10-18 ; tv/app/surveillance-view.js:44-45 ; tv/app/ambient.js:17 ; app/ui/card-queue.mjs:11 ; tv/controller.py:239 ; tests/tv-ambient-params.test.cjs:11-25 ; scripts/smoke-tv-ambient.mjs:24-27
- **Preuve :** Modèle existant : 14 cas, champ `version`, protocole écrit dans le fichier, règle « ajouter un cas, ne jamais en modifier », joué par deux chemins JS (ingest ; reset et accept) et deux chemins Python (file pure ; superviseur avec latence). Limite constatée : les deux côtés construisent la file avec les `defaults` de la fixture (test_tv_ambient.py:527, tv-overlay-queue.test.cjs:16), donc QUEUE_MAX et FRESH_MS (ambient.py:48) ne sont jamais comparés à MAX_QUEUE et STALE_MS (surveillance-overlay.js:15-16). Valeurs en double sans test croisé : durées 8000, 14000, 20000 en cinq endroits ; 600 caractères (ambient.py:238, surveillance-overlay.js:18) ; boîtes (ambient.py:32-33, recopiées dans smoke-tv-ambient.mjs:24-27 et tv-ambient-params.test.cjs:13) ; PAGE_LIFE 21.5 et LIFE_MAX_MS 21500 ; port 8788. Format de lancement : `launch()` du test JS est un littéral présenté comme ce qu'envoie le superviseur ; aucune sortie réelle de `reduce_card` ne traverse `parseAmbientParams`.
- **Impact :** Une borne changée d'un seul côté (file, durée, longueur de texte, boîte) passe les deux suites ; le défaut est une carte refusée ou mal placée sur la TV, panneau fermé, là où rien ne se voit.

<a id="TSTB-18"></a>
#### TSTB-18 — Des tests maintiennent en vie du code mort

**Verdict : confirmé** · priorité P3 · effort S · risque faible · Tests de comportement

**Suite : pas de ticket.** P3 : retirer le code mort que des tests maintiennent en vie demande la décision du propriétaire sur CORE-05/ADP-11 (lot L09) et la suppression de tests ; ne vaut pas une session avant cette décision. — _Reprise :_ Après la décision du propriétaire sur CORE-05/ADP-11 dans le lot L09.

- **Où :** tests/adapters.test.cjs:7, 8, 25-56 ; tests/chat-codex.test.cjs:22-23 ; tests/session.test.cjs:3, 32, 41, 50, 58, 72-75, 80 ; tests/session-durable.test.cjs:274, 353
- **Preuve :** adapters.test : 4 tests sur 5 visent `OpenRouterAdapter`, qu'aucun code produit n'importe (ADP-11). chat-codex:22 teste `CodexVideoAgent` (hérité, scripts seulement) avec un faux binaire `codex`. session.test : 5 appels à `watch.ask()` et 4 à `selectEvidence`, dont le seul appelant de production est un script (CORE-05). `cleanupRawMedia` : 6 usages, tous dans des tests (ADP-11). Les 14 doublures `observe:` à voie unique font vivre le `drain` non scindé.
- **Impact :** Supprimer ce code oblige à supprimer une douzaine de tests ; en attendant ils le font paraître protégé et comptent dans les 602.
- **Remède proposé par l'audit :** Faire suivre les tests : `scripts/lib/legacy/` avec `tests/legacy/*.test.cjs` lancés par `npm run test:legacy` (hors commande par défaut), ou suppression dans la même demande de fusion que CORE-05 et ADP-11. Conserver la partie utile de session.test (ciblage temporel) en la portant sur `resolveTemporalTarget` dans `tests/unit/core/temporal-target.test.cjs`.
- **Risque du remède selon le relecteur :** Sortir ces tests de la commande par défaut les laisse pourrir, et retirer les tests de `ask()` enlève la couverture du ciblage temporel encore utilisé par core/moment-search.cjs:60 ; porter d'abord ces cas sur `resolveTemporalTarget`, puis comparer le nombre de tests, le détecte. La suppression de `cleanupRawMedia` emporte aussi session-durable:271, qui échoue sous disque lent.

<a id="OUBLI-22"></a>
#### OUBLI-22 — Aucun constat sur le filet de sécurité des chantiers L

**Verdict : nuancé** · Signalement du relecteur — Interfaces (Mac, TV, scripts Python)

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Le filet de sécurité des chantiers repose sur les smokes navigateur et Electron, qui ne tournent pas dans la boucle. — _Reprise :_ Avec TSTC-09 et TSTC-10, en session interactive du propriétaire avant les lots de rendu de la vague 2.

- **Signalement :** Aucun constat sur le filet de sécurité des chantiers L : les cinq scripts scripts/smoke-*.mjs (2 733 lignes) sont la seule exécution de app/renderer.js, de la fermeture de tv/app/companion.js et des quatre handleKey. Ils ne figurent dans aucun contrôle automatique (package.json:11-12) et l'audit ne dit pas s'ils passent à 8627b46 ; je ne les ai pas lancés non plus. Les rendre lançables un par un, un seul navigateur à la fois, est un prérequis de UI-02, TV-01 et TV-02 au même titre que UI-01.

<a id="OUBLI-42"></a>
#### OUBLI-42 — Le seul parcours où les vrais scripts TV parlent à la vraie page ambiante n'a pas de commande

**Verdict : nuancé** · Signalement du relecteur — Tests des interfaces

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** scripts/simulate-tv-ambient.mjs exige un vrai navigateur (mesuré : 343 lignes, 33 assertions, contre 342 et 21 dans l'audit) : il ne peut pas tourner dans la boucle. — _Reprise :_ Avec TSTC-09, en session interactive du propriétaire avant les lots TV de la vague 2.

- **Signalement :** scripts/simulate-tv-ambient.mjs (342 lignes, 21 assertions) : seul parcours où les vrais tv/controller.py et tv/ambient.py parlent à la vraie page ambiante dans un navigateur, hermétique (faux luna-send, port éphémère). Sans script npm et hors du test:smoke:tv proposé par TSTC-09.

<a id="OUBLI-44"></a>
#### OUBLI-44 — La composition de production de l'hôte Mac n'est exécutée par aucun test

**Verdict : nuancé** · Signalement du relecteur — Tests des interfaces

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** La composition de production de l'hôte Mac ne s'exécute que sous Electron ; un test hors Electron suppose le refactor de composition des hôtes. — _Reprise :_ Avec le refactor de composition commune des hôtes de la vague 2.

- **Signalement :** app/main.cjs porte 29 occurrences de smoke (branches aux l.55, 130, 183, 227, 276, 296, 512) et les deux filets du Mac forcent --smoke-test (tests/mac-ipc-contract.test.cjs:168, scripts/smoke-electron.mjs:11) : la composition de production (agents réels, loadConfig, desktopCapturer, raccourci global) n'est exécutée par aucun test du périmètre. Aucun constat ne le dit.

<a id="OUBLI-45"></a>
#### OUBLI-45 — Aucun garde d'identifiants côté TV

**Verdict : confirmé** · Signalement du relecteur — Tests des interfaces

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T091](travail/tickets/091-require-every-element-id-looked-up-by-a-tv-script-to-exist.md) « Require every element id looked up by a TV script to exist in its page ».

- **Signalement :** Aucun garde d'identifiants côté TV : tv/app compte 269 appels el("…") ou getElementById pour 93 ids de tv/app/index.html, tous valides aujourd'hui (rejoué), mais rien ne le vérifie alors que le Mac a ce garde (tests/mac-ui.test.cjs:676-680) et que les vues TV n'ont que des smokes manuels.

### L09 — Retirer le code mort et ranger le dépôt

Vague 1 · 20 constats · 10 tickets

- [T098](travail/tickets/098-give-every-paying-npm-script-the-live-suffix-and-test-the.md) — Give every paying npm script the :live suffix and test the rule
- [T099](travail/tickets/099-build-the-mac-package-from-an-allowlist-of-the-folders-the.md) — Build the Mac package from an allowlist of the folders the app loads
- [T100](travail/tickets/100-remove-dead-exports-and-move-the-temporal-target-out-of-the.md) — Remove dead exports and move the temporal target out of the session module
- [T101](travail/tickets/101-remove-unreachable-tv-panel-code-and-let-test-fixtures.md) — Remove unreachable TV panel code and let test fixtures escape the webm ignore
- [T102](travail/tickets/102-move-the-installed-tv-remote-and-the-ipk-builder-out-of.md) — Move the installed TV remote and the ipk builder out of prototypes _(touche au harnais)_
- [T103](travail/tickets/103-move-the-tv-remote-python-tests-into-tests-and-run-them-in.md) — Move the TV remote Python tests into tests and run them in one discovery _(touche au harnais)_
- [T104](travail/tickets/104-make-the-tv-ipk-build-reproducible-and-require-its-inputs.md) — Make the TV ipk build reproducible and require its inputs explicitly
- [T105](travail/tickets/105-build-both-tv-packages-from-a-file-manifest-with-one-npm.md) — Build both TV packages from a file manifest with one npm command
- [T106](travail/tickets/106-inventory-every-entry-of-the-scripts-folder-and-keep-the.md) — Inventory every entry of the scripts folder and keep the table in sync
- [T139](travail/tickets/139-remove-the-legacy-openrouter-and-codex-exec-adapters-and-the.md) — Remove the legacy OpenRouter and codex exec adapters and the scripts using them _(demande un ADR ; touche au harnais ; supprime des tests ; attend une décision du propriétaire)_

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [DOC-09](#DOC-09) | L'app Mac empaquetée embarque docs, tests, captures, film et promo | confirmé | P1 | [T099](travail/tickets/099-build-the-mac-package-from-an-allowlist-of-the-folders-the.md) |
| [DOC-12](#DOC-12) | docs/ sert de dossier de sortie aux sondes | nuancé | P1 | [T098](travail/tickets/098-give-every-paying-npm-script-the-live-suffix-and-test-the.md) |
| [OPS-08](#OPS-08) | Paquet Mac : tout l'arbre de travail entre dans l'asar | nuancé | P1 | [T099](travail/tickets/099-build-the-mac-package-from-an-allowlist-of-the-folders-the.md) |
| [TSTC-18](#TSTC-18) | Seize probes manuels : préfixe test: sur des scripts payants, écritures dans docs/, entrées à chemins fixes | nuancé | P1 | [T098](travail/tickets/098-give-every-paying-npm-script-the-live-suffix-and-test-the.md), [T106](travail/tickets/106-inventory-every-entry-of-the-scripts-folder-and-keep-the.md) |
| [CORE-05](#CORE-05) | Chemins hérités dans `WatchSession` | nuancé | P2 | [T100](travail/tickets/100-remove-dead-exports-and-move-the-temporal-target-out-of-the.md) |
| [DOC-10](#DOC-10) | Un composant livré de la TV vit sous prototypes/ | nuancé | P2 | [T102](travail/tickets/102-move-the-installed-tv-remote-and-the-ipk-builder-out-of.md), [T103](travail/tickets/103-move-the-tv-remote-python-tests-into-tests-and-run-them-in.md) |
| [OPS-10](#OPS-10) | Empaquetage TV : l'empaqueteur de production est un script de prototype, non reproductible | nuancé | P2 | [T102](travail/tickets/102-move-the-installed-tv-remote-and-the-ipk-builder-out-of.md), [T104](travail/tickets/104-make-the-tv-ipk-build-reproducible-and-require-its-inputs.md), [T105](travail/tickets/105-build-both-tv-packages-from-a-file-manifest-with-one-npm.md) |
| [OPS-11](#OPS-11) | Inventaire des scripts : 27 orphelins de package.json, 4 non référencés, 4 liés aux adaptateurs hérités, dérives silencieuses | nuancé | P2 | [T106](travail/tickets/106-inventory-every-entry-of-the-scripts-folder-and-keep-the.md), [T139](travail/tickets/139-remove-the-legacy-openrouter-and-codex-exec-adapters-and-the.md) |
| [OPS-12](#OPS-12) | Amorçages et utilitaires recopiés d'un script à l'autre | confirmé | P2 | pas de ticket |
| [OPS-18](#OPS-18) | prototypes/ contient du code de production déployé sur la TV | nuancé | P2 | [T102](travail/tickets/102-move-the-installed-tv-remote-and-the-ipk-builder-out-of.md), [T103](travail/tickets/103-move-the-tv-remote-python-tests-into-tests-and-run-them-in.md) |
| [CORE-17](#CORE-17) | Capacités optionnelles et compatibilités | nuancé | P3 | pas de ticket |
| [ADP-11](#ADP-11) | Code hérité et exports morts | confirmé | P3 | [T100](travail/tickets/100-remove-dead-exports-and-move-the-temporal-target-out-of-the.md), [T139](travail/tickets/139-remove-the-legacy-openrouter-and-codex-exec-adapters-and-the.md) |
| [TV-07](#TV-07) | Code mort | confirmé | P3 | [T101](travail/tickets/101-remove-unreachable-tv-panel-code-and-let-test-fixtures.md) |
| [DOC-11](#DOC-11) | Composition du dépôt : 76 % du poids n'est pas le produit, 6 Mo d'images sans référence | nuancé | P3 | pas de ticket |
| [OPS-20](#OPS-20) | Les scripts écrivent leurs rapports dans docs/ et leurs captures dans /tmp à noms fixes | nuancé | P3 | pas de ticket |
| [TSTC-20](#TSTC-20) | Listes tenues à la main, crochet d'observation en production et règle .gitignore qui piège les fixtures | nuancé | P3 | [T101](travail/tickets/101-remove-unreachable-tv-panel-code-and-let-test-fixtures.md) |
| [OUBLI-09](#OUBLI-09) | Code mort et surface inutile non relevés | confirmé | — | [T100](travail/tickets/100-remove-dead-exports-and-move-the-temporal-target-out-of-the.md) |
| [OUBLI-17](#OUBLI-17) | scripts/package.mjs:6 n'exclut pas ce que .gitignore:25-40 déclare privé ou local | confirmé | — | [T099](travail/tickets/099-build-the-mac-package-from-an-allowlist-of-the-folders-the.md) |
| [OUBLI-21](#OUBLI-21) | Composants TV installés rangés sous prototypes/ | confirmé | — | [T102](travail/tickets/102-move-the-installed-tv-remote-and-the-ipk-builder-out-of.md) |
| [OUBLI-29](#OUBLI-29) | Tests Python dépendants de leur emplacement et de l'historique Git | confirmé | — | [T103](travail/tickets/103-move-the-tv-remote-python-tests-into-tests-and-run-them-in.md) |

<a id="DOC-09"></a>
#### DOC-09 — L'app Mac empaquetée embarque docs, tests, captures, film et promo

**Verdict : confirmé** · priorité P1 · effort S · risque moyen · Documentation et dépôt

**Suite :** [T099](travail/tickets/099-build-the-mac-package-from-an-allowlist-of-the-folders-the.md) « Build the Mac package from an allowlist of the folders the app loads ».

- **Où :** scripts/package.mjs:3-6 ; package.json:9 ; adapters/codex-video-agent.cjs:8
- **Preuve :** scripts/package.mjs appelle packager avec dir: '.' et une liste ignore limitée à .env, env.local, .local, .scratch, challenge, media, dist et .git. Rien n'exclut docs/, screenshots/, design/, film/, promo/, tests/, prototypes/, scripts/, tv/, deploy/, server/. Au commit, cela fait au moins 17 Mo de fichiers que l'app n'exécute pas (screenshots 6,5 ; design 4,2 ; docs 3,1 ; tests 1,6 ; film 0,8 ; scripts 0,5 ; promo 0,4). À l'exécution, l'app n'a besoin que de app/, core/, adapters/, runtime/, mcp/ (codex-video-agent.cjs:8 lance mcp/server.cjs), package.json et les node_modules de production. Lecture de la configuration seulement : aucun build lancé, contenu réel du bundle non inspecté.
- **Impact :** L'app distribuée contient les tests, les rapports d'essais et toute la documentation interne. Sa taille dépend de l'arbre du développeur : si film/node_modules ou promo/node_modules sont installés, ils partent probablement dans l'archive (supposé). Tout nouveau dossier racine est embarqué par défaut.

<a id="DOC-12"></a>
#### DOC-12 — docs/ sert de dossier de sortie aux sondes

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Documentation et dépôt

**Suite :** [T098](travail/tickets/098-give-every-paying-npm-script-the-live-suffix-and-test-the.md) « Give every paying npm script the :live suffix and test the rule ».

**Part laissée de côté :** L09-01 ne traite que la partie de DOC-12 sur le renommage *:live. Le déplacement des 42 JSON vers docs/evidence et la sortie --out par défaut des sondes sont fusionnés avec OPS-20, qui dépend d'OPS-12. — _Reprise :_ Avec OPS-20.

- **Où :** scripts/probe-verify.cjs:8 ; scripts/probe-video-chat-live.mjs:64 ; scripts/smoke-electron.mjs:222,254 ; scripts/probe-live.cjs:57-58 ; scripts/compare-inspection-strategies.cjs:15,39,44 ; scripts/evaluate-actions.cjs:34,38 ; package.json:15,25
- **Preuve :** 13 scripts écrivent leur rapport dans docs/*.json (20 chemins littéraux). npm run test:verify (package.json:15) appelle le vrai vérificateur Codex et écrase docs/verification-live.json (probe-verify.cjs:8). probe-video-chat-live.mjs:64 écrit à la fois docs/video-chat-live.json et une copie horodatée, d'où le doublon de 306 Ko. Résultat : 42 JSON, 1,77 Mo, dans le dossier de documentation ; le rapport video-chat-live porte encore une clé « auto » du mode retiré. Cinq JSON sur 42 ont été ouverts.
- **Impact :** Lancer une sonde modifie des fichiers suivis présentés comme des preuves datées. La documentation grossit à chaque essai. Les rapports mêlent mesures et données de session (vignettes, textes transcrits).
- **Nuance du relecteur (elle prime) :** Confirmé : 13 scripts et 20 chemins littéraux docs/*.json, probe-verify.cjs:8, probe-video-chat-live.mjs:64 (double écriture, d'où le doublon), clé « auto » dans video-chat-live.json. Trois corrections. (1) Le renommage est incomplet : cinq scripts npm touchent des fournisseurs réels sans se terminer par « :live », pas deux — test:verify, test:codex:speed, test:electron:verify-live, test:electron:deep-live, test:electron:full-live (package.json:13, 15, 16, 19, 25). (2) L'enjeu dépasse CONTRIBUTING.md:25 : à la tête de branche, CLAUDE.md interdit aux agents les scripts « *:live », et aucun hook ne l'applique (.claude/hooks/guard-bash.mjs n'a aucune règle sur ces noms). Un agent qui lance « npm run test:verify » pour « vérifier » consomme du quota Codex et réécrit un fichier suivi. Ce renommage est la part urgente, à isoler en un ticket S. (3) Déplacer les 42 JSON casse environ 35 liens depuis les documents (36 cibles .json distinctes dans les .md), la reprise « --resume » de compare-inspection-strategies.cjs:15 qui relit docs/strategy-comparison-live.json, et les commentaires qui citent ces rapports comme source des modèles de latence (scripts/simulate-stream.cjs:62-64, scripts/replay-lg-stream.cjs:88).

<a id="OPS-08"></a>
#### OPS-08 — Paquet Mac : tout l'arbre de travail entre dans l'asar

**Verdict : nuancé** · priorité P1 · effort M · risque moyen · Scripts et outillage

**Suite :** [T099](travail/tickets/099-build-the-mac-package-from-an-allowlist-of-the-folders-the.md) « Build the Mac package from an allowlist of the folders the app loads ».

**Part laissée de côté :** Le reste (git archive, SDK et zod en devDependencies) modifie les dépendances installées et demande une décision du propriétaire. — _Reprise :_ Après L09-02, sur décision du propriétaire

- **Où :** scripts/package.mjs:3-6 ; .gitignore:26 ; .gitignore:34-41 ; package.json:34-38 ; mcp/server.cjs ; mcp/tool-definitions.cjs
- **Preuve :** `dir: '.'` avec 7 motifs d'exclusion (.env*, env.local, .local, .scratch, challenge, media, dist, .git). Ne sont pas exclus : tests/, docs/, scripts/, design/, prototypes/, tv/, deploy/, server/, soit 274 fichiers et 8,6 Mo dans la copie figée, contre 93 fichiers et 3,0 Mo réellement chargés (app, core, adapters, runtime) ; s'y ajoutent film/, promo/, screenshots/, docs/*.json et les dossiers non suivis, absents de la copie. Les secrets que .gitignore protège ne sont pas exclus non plus : tv/app/connection.js, deploy/runtime.env, deploy/server.env, auth.json, device-token, *.ovpn, sessions/. Dépendances : 94 paquets de production ne servent qu'à mcp/ (fermeture de @modelcontextprotocol/sdk dans le lockfile ; aucun autre dossier ne l'importe) ; ils partent dans le paquet et sur le serveur (`npm ci --omit=dev`).
- **Impact :** Le contenu du paquet dépend de ce qui se trouve sur le poste au moment de la commande ; un fichier d'appairage présent dans l'arbre se retrouve en clair dans l'archive ; le paquet et la surface d'audit sont gonflés par du code jamais chargé.
- **Nuance du relecteur (elle prime) :** Lecture du script exacte : 7 motifs, aucun secret de .gitignore exclu hors .env à la racine, 274 fichiers inutiles au paquet, 94 paquets dans la fermeture du SDK MCP (zod compris), importés par mcp/ et des tests seulement. Corrections.

  (1) Tailles recalculées : environ 8,1 Mo pour les 274 fichiers et 2,9 Mo pour 91 fichiers chargés (l'audit dit 8,6 Mo et 93).

  (2) Impact sous-estimé. Hors ROOT, dans l'arbre de travail, film/ pèse 557 Mo et promo/ 355 Mo avec leurs propres node_modules, que le packager n'élague pas : tout entrerait dans l'asar. Le dernier paquet présent sur le poste date du 29 septembre (asar de 27,9 Mo) : l'empaquetage n'a vraisemblablement pas été rejoué depuis les chantiers (supposé, d'après la date).

  (3) Remédiation : après `git archive` et `npm ci --omit=dev`, electron (devDependency) est absent et le packager ne peut plus déduire sa version : passer electronVersion. Un espace de travail npm reste installé par `npm ci --omit=dev` à la racine, sauf `--workspaces=false`, ce qui change la commande du serveur. Plus simple : passer le SDK et zod en devDependencies, puisque `npm run setup:codex` enregistre mcp/server.cjs depuis le clone de développement.

  (4) Doublon de DOC-09 (audit docs-dépôt), avec une autre forme cible (scripts/package-filter.mjs, isPackaged, mcp inclus) : à fusionner.

<a id="TSTC-18"></a>
#### TSTC-18 — Seize probes manuels : préfixe test: sur des scripts payants, écritures dans docs/, entrées à chemins fixes

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Tests des interfaces

**Suite :** [T098](travail/tickets/098-give-every-paying-npm-script-the-live-suffix-and-test-the.md) « Give every paying npm script the :live suffix and test the rule » ; [T106](travail/tickets/106-inventory-every-entry-of-the-scripts-folder-and-keep-the.md) « Inventory every entry of the scripts folder and keep the table in sync ».

**Part laissée de côté :** L09-01 couvre les noms *:live et L09-09 l'inventaire. Les sorties des probes vers --out suivent OPS-20. Le montage commun des trois probe-chat relève de la factorisation d'OPS-12. — _Reprise :_ Avec OPS-12 et OPS-20.

- **Où :** scripts/probe-verify.cjs:8 ; scripts/probe-shortcut.mjs:2-3 ; scripts/probe-codex-speed.cjs:4-7 ; scripts/probe-video-chat-live.mjs:8 ; scripts/probe-lg-network.cjs:7-8 ; scripts/probe-chat-memory.cjs:1-2 ; scripts/probe-chat-sources.cjs:1-2 ; scripts/probe-chat-web.cjs:1-2 ; package.json:14-15, 21, 25
- **Preuve :** 16 scripts, 1 513 lignes ; résolution statique de leurs modules : aucun manquant. 12 appellent un fournisseur réel (Codex connecté ou clé OpenRouter), dont probe-video-chat-live par Electron ; 3 demandent la TV ou le serveur privé (probe-lg-companion, probe-tv-ambient-capture, et probe-lg-network qui lit `~/Documents/TVLens-private/server/device-token`) ; probe-shortcut enregistre un vrai raccourci global macOS. Entrées à chemins fixes : /tmp/tvlens-jfk.wav, .local/models/ggml-base.bin, /tmp/tvlens-source-live.mp4. Deux écrivent dans le dépôt : docs/verification-live.json et docs/shortcut-validation.json. Quatre sont exposés sous le préfixe `test:` (test:live, test:verify, test:retrieval:live, test:codex:speed). Les trois probe-chat ont leurs deux premières lignes identiques mot pour mot. probe-chat-sources, probe-shortcut et probe-tv-ambient-capture ne sont cités par aucun document ni script de la copie.
- **Impact :** Aucun ne peut tourner en CI. `npm run test:verify` dépense un tour de modèle et modifie docs/ ; on ne sait pas lesquels font encore partie d'un protocole de validation en vigueur.
- **Nuance du relecteur (elle prime) :** 16 scripts et 1 513 lignes exacts ; les trois probe-chat ont bien leurs deux premières lignes identiques ; les trois scripts dits non cités ne le sont effectivement nulle part dans la copie. Fait faux : ce ne sont pas deux mais dix probes qui écrivent dans docs/ (chat-memory-live, chat-sources-live, chat-web-live, codex-speed-live, live-validation, refactor-live-report par défaut, retrieval-live, shortcut-validation, verification-live, video-chat-live avec une copie horodatée). Ces JSON sont suivis par Git et cités comme preuves par sept documents (docs/validation.md, verification.md, chat-overlay-validation.md, session-optimization.md, reexamen-validation.md, refactor-runtime.md, viewing-upgrade.md) : « jamais docs/ » doit devenir « jamais par défaut », avec un --out explicite pour rafraîchir une preuve. Priorité relevée à P1 pour le renommage : CONTRIBUTING.md:25 ne signale que les commandes *:live, or test:verify et test:codex:speed (et les trois test:electron:*-live) dépensent du quota sans porter ce suffixe, ce qu'une boucle d'agents ne peut pas deviner.

<a id="CORE-05"></a>
#### CORE-05 — Chemins hérités dans `WatchSession`

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Cœur et composition (`core/`, `runtime/`)

**Suite :** [T100](travail/tickets/100-remove-dead-exports-and-move-the-temporal-target-out-of-the.md) « Remove dead exports and move the temporal target out of the session module ».

**Part laissée de côté :** L09-03 ne traite que resolveTemporalTarget et passageText. Retirer WatchSession.ask() et le drain non scindé ôte environ 7 cas de test (session.test, topic-summary.test) et touche le cliquet cas_de_test. Après L09-10, le seul appelant de script de ask() (probe-live.cjs, watch.ask) a disparu, mais ce retrait-là relève d'une décision distincte. — _Reprise :_ Après L09-10, sur décision du propriétaire, avec le flag supprime_tests.

Constat d'origine :

- Emplacement : `core/session.cjs:228-256, 374-413, 523-535` ; `core/moment-search.cjs:3` ; `core/living-recap.cjs:1`.
- Preuve : `ask()`, `selectEvidence` et le port `answer` n'ont qu'un appelant, `scripts/probe-live.cjs:50`. `moment-search` importe `resolveTemporalTarget` depuis `session.cjs` ; `living-recap` importe `passageText` via `moment-search`.
- Impact : environ 110 lignes denses à maintenir pour un script ; dépendances internes à contresens.
- Remédiation : déplacer `ask` et `selectEvidence` vers `scripts/` ou les supprimer ; créer `core/temporal-target.cjs` ; retirer le `drain` non scindé.
- E : M. R : moyen (les tests qui utilisent `observe` seul n'ont pas été lus). P : CORE-04.

- **Nuance du relecteur (elle prime) :** « Un seul appelant » n'est vrai que pour le code de production. ask() et selectEvidence sont aussi appelés par tests/session.test.cjs (6 de ses 8 tests : lignes 25, 37, 47, 54, 70, 77) et par tests/topic-summary.test.cjs:120. Le port answer.ask n'a qu'une implémentation, adapters/openrouter.cjs:53, câblée dans aucun hôte ; CodexPerception n'a pas de méthode ask, donc WatchSession.ask() lèverait un TypeError dans un hôte réel (session-runtime.cjs:388 passe le même adaptateur comme answer). Le volume est d'environ 82 lignes (228-256, 374-413, 523-535), pas 110. Retirer le drain non scindé touche en plus les doublures « observe seul » de 6 fichiers de tests (17 occurrences), les 16 fichiers en smoke: true et scripts/probe-live.cjs (npm run test:live, que la boucle n'a pas le droit de lancer) : effort L, pas M. Supprimer ces tests fait baisser le cliquet cas_de_test (611 dans scripts/quality/baseline.json de la branche de travail, hors copie figée) et contredit la consigne « ne pas supprimer un test » : décision explicite requise avant le ticket.

<a id="DOC-10"></a>
#### DOC-10 — Un composant livré de la TV vit sous prototypes/

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Documentation et dépôt

**Suite :** [T102](travail/tickets/102-move-the-installed-tv-remote-and-the-ipk-builder-out-of.md) « Move the installed TV remote and the ipk builder out of prototypes » ; [T103](travail/tickets/103-move-the-tv-remote-python-tests-into-tests-and-run-them-in.md) « Move the TV remote Python tests into tests and run them in one discovery ».

- **Où :** README.md:139 ; prototypes/lg-remote/README.md:3 ; prototypes/lg-remote/runtime/panel.py:4 ; tv/app/appinfo.json:2 ; tv/ambient.py:27 ; prototypes/lg-sidebar/README.md:3 ; scripts/smoke-tv-overlay.mjs
- **Preuve :** README.md:139 : l'installation TV demande « gestion du panneau/télécommande prototypes/lg-remote ». Ce dossier (17 fichiers, 128 Ko) contient runtime/panel.py, runtime/ambient_relay.py, runtime/tvlens_mapper.py, un vendor/ sous licence MIT (LICENSE.upstream) et 33 tests Python (test_panel 15, test_ambient_relay 17, test_control 1) qu'aucune commande npm ne lance. Son README, en anglais, dit lui-même « The sections below retain the prototype history ». L'identifiant de l'app TV livrée est org.tvlens.sidebarprobe (tv/app/appinfo.json:2), le nom de la sonde de faisabilité. prototypes/lg-sidebar (10 fichiers) se déclare « Experimental, not the production companion ». prototypes/ est cité par le README, 7 documents et scripts/smoke-tv-overlay.mjs.
- **Impact :** Qui nettoie « les prototypes » casse l'installation TV. Les 33 tests ne tournent jamais en routine. Du code tiers est vendored hors d'un emplacement identifié comme produit.
- **Nuance du relecteur (elle prime) :** Confirmé : README.md:139, 17 fichiers dans prototypes/lg-remote, 33 tests Python jamais lancés, identifiant org.tvlens.sidebarprobe (tv/app/appinfo.json:2, tv/ambient.py:27, panel.py:4), citation du README de lg-remote. Trois erreurs dans la remédiation. (1) prototypes/lg-sidebar n'est pas qu'une sonde abandonnée : son package.py est l'empaqueteur de l'app TV livrée, appelé par docs/lg-installation.md:27 et par scripts/package-tv-ambient.mjs:288 (chemin construit par path.join, d'où son absence du grep « prototypes/ »). L'archiver sous docs/archive/ casse l'empaquetage ; package.py doit partir vers tv/ ou scripts/, le reste seul s'archive. La liste des fichiers à mettre à jour oublie donc scripts/package-tv-ambient.mjs. (2) Déplacer les tests vers tests/python/ les fait sortir du contrôle : à la tête de branche, scripts/check.mjs ne lance Python que s'il trouve des test_*.py directement dans tests/ et découvre avec « -s tests » ; un sous-dossier sans __init__.py n'est pas parcouru. Les garder à plat dans tests/ (test_tv_remote_panel.py, etc.), ou modifier le harnais. (3) Ce n'est pas un déplacement pur : test_panel.py:4, test_ambient_relay.py:9-10 et test_control.py:7 résolvent runtime/ et control.py par rapport à leur propre dossier, et tests/test_tv_*.py résolvent la racine par parents[1] (test_tv_control.py:14, test_tv_capture_gate.py:19, test_tv_ambient.py:23). test_ambient_relay.py:325 lit en plus l'ancien chemin dans l'historique Git (commit 9758633) et se saute sans dépôt.

<a id="OPS-10"></a>
#### OPS-10 — Empaquetage TV : l'empaqueteur de production est un script de prototype, non reproductible

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Scripts et outillage

**Suite :** [T102](travail/tickets/102-move-the-installed-tv-remote-and-the-ipk-builder-out-of.md) « Move the installed TV remote and the ipk builder out of prototypes » ; [T104](travail/tickets/104-make-the-tv-ipk-build-reproducible-and-require-its-inputs.md) « Make the TV ipk build reproducible and require its inputs explicitly » ; [T105](travail/tickets/105-build-both-tv-packages-from-a-file-manifest-with-one-npm.md) « Build both TV packages from a file manifest with one npm command ».

**Part laissée de côté :** Le reste (identifiant de l'ancienne sonde du panneau) n'a plus d'objet une fois L09-08 fait, et un P3 isolé ne vaut pas une session. — _Reprise :_ Après L09-08, à réévaluer

- **Où :** scripts/package-tv-ambient.mjs:288 ; prototypes/lg-sidebar/package.py:5 ; prototypes/lg-sidebar/package.py:13-14 ; prototypes/lg-sidebar/package.py:18 ; prototypes/lg-sidebar/app/appinfo.json:2 ; tv/app/appinfo.json:2-3 ; docs/lg-installation.md:27 ; docs/lg-remote-runtime.md:108
- **Preuve :** Le paquet ambiant passe par prototypes/lg-sidebar/package.py ; le paquet du panneau n'a ni script ni entrée npm, seulement une commande dans docs/lg-installation.md:27. package.py écrit la description « Reversible sidebar feasibility probe » dans tout paquet (:13), date les en-têtes avec time.time() (:18 ; et l'en-tête gzip, comportement de tarfile, de mémoire) : deux constructions des mêmes sources diffèrent. Son dossier par défaut (:5) est l'ancienne sonde, qui porte le même identifiant org.tvlens.sidebarprobe que le panneau de production : lancé sans argument, il produit la sonde 0.0.2 sous l'identité du panneau. Son filtre (:14) n'écarte que connection.js : le paquet du panneau embarque ambient.html, ambient.js et appinfo.ambient.json, qui appartiennent à l'autre application. Versions tenues à la main (0.0.4 et 0.1.0) ; la doc note que la fiche installée peut encore dire 0.0.2. Seul `assemble` du paquet ambiant est testé.
- **Impact :** Impossible de prouver qu'un paquet installé correspond à une révision ; une commande sans argument fabrique un paquet qui remplacerait le panneau par la sonde ; la moitié de l'empaquetage TV n'a ni test ni script.
- **Nuance du relecteur (elle prime) :** Preuve exacte : package.py:5, 13, 14 et 18 ; identifiant org.tvlens.sidebarprobe partagé par la sonde 0.0.2 et le panneau 0.0.4 ; appel du script de prototype en package-tv-ambient.mjs:288 ; commande manuelle en docs/lg-installation.md:27. Un point de la remédiation ne tient pas tel quel : la fonction `assemble` existante ne peut pas assembler le panneau. Elle ne lit que appinfo.ambient.json, refuse tout identifiant contenant « probe » hors mode sonde, puis tout identifiant autre que org.tvlens.ambient (package-tv-ambient.mjs:246-247). tests/tv-ambient-params.test.cjs:113 protège ce refus pour l'identifiant du panneau. Forme cible : une fonction d'assemblage commune (dossier vide, liste de fichiers, fiche d'application) sous `assemble`, qui garde ses refus, et une seconde entrée pour le panneau. Pour un paquet reproductible, tarfile en mode « w:gz » ne permet pas de fixer la date de l'en-tête gzip : passer par gzip.GzipFile avec mtime.

<a id="OPS-11"></a>
#### OPS-11 — Inventaire des scripts : 27 orphelins de package.json, 4 non référencés, 4 liés aux adaptateurs hérités, dérives silencieuses

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Scripts et outillage

**Suite :** [T106](travail/tickets/106-inventory-every-entry-of-the-scripts-folder-and-keep-the.md) « Inventory every entry of the scripts folder and keep the table in sync » ; [T139](travail/tickets/139-remove-the-legacy-openrouter-and-codex-exec-adapters-and-the.md) « Remove the legacy OpenRouter and codex exec adapters and the scripts using them ».

**Part laissée de côté :** Le reste (sous-dossiers par nature, dérives silencieuses des scripts) suppose l'inventaire de L09-09 et les suppressions de L09-10. — _Reprise :_ Après L09-10 et jalon:lint

- **Où :** scripts/probe-live.cjs:8 ; scripts/probe-live.cjs:17-19 ; scripts/evaluate-actions.cjs:4 ; scripts/evaluate-actions.cjs:14 ; scripts/compare-inspection-strategies.cjs:6 ; scripts/diagnose-inspect.cjs:1 ; scripts/probe-chat-web.cjs:8-9 ; scripts/probe-chat-memory.cjs:12-13 ; scripts/probe-chat-sources.cjs:8-9 ; scripts/probe-codex-speed.cjs:7 ; scripts/generate-action-fixtures.py:2 ; scripts/generate-action-fixtures.py:19 ; CONTRIBUTING.md:11
- **Preuve :** 39 fichiers, 6 609 lignes (17 675 une fois formatées). Par nature : construction 3 (package, open-mac, package-tv-ambient) ; installation 3 (setup-codex, setup-speech, check-codex-quota) ; parcours hors ligne 7 (smoke-electron, smoke-lg-ui, smoke-tv-timeline, smoke-tv-overlay, smoke-tv-ambient, simulate-tv-ambient, simulate-stream) ; bancs locaux 5 (bench-backend, bench-perceived, bench-whisper, replay-lg-stream, replay-reinspection) ; Codex réel 12 (probe-verify, probe-codex-speed, probe-chat-web, -memory, -sources, probe-surveillance, probe-overlap-live, probe-confinement, probe-refactor-live, probe-video-chat-live, capture-showcase, probe-shortcut) ; OpenRouter 6 (probe-live, evaluate-actions, compare-inspection-strategies, diagnose-inspect, probe-retrieval, et generate-action-fixtures.py qui les alimente) ; appareil réel 3 (probe-lg-companion, probe-lg-network, probe-tv-ambient-capture). 12 ont une entrée npm ; 27 n'en ont pas ; 4 ne sont cités nulle part (diagnose-inspect.cjs, probe-chat-sources.cjs, probe-shortcut.mjs, probe-tv-ambient-capture.mjs). openrouter.cjs est importé par 4 scripts, codex-video-agent.cjs par 1 ; 3 de ces 4 scripts ont une entrée npm. Contrôle statique : 77 imports relatifs et 32 chargements dynamiques pointent tous vers un fichier et un export existants ; méthodes du pont, identifiants DOM, routes /v1 et 11 drapeaux Electron concordent. Dérives que ce contrôle ne voit pas : les 3 probe-chat-* démarrent un VideoBridge et passent `bridge` à CodexSessionAgent, qui ne connaît plus cette option ; probe-live.cjs:19 appelle endsWith sur OPENROUTER_MODEL, que .env.example laisse non défini ; probe-codex-speed.cjs:7 lit /tmp/tvlens-jfk.wav que rien ne crée ; evaluate-actions.cjs:14 fige ~/.local/bin/codex ; le générateur de fixtures exige Pillow, non déclaré, et /opt/homebrew/bin/ffmpeg.
- **Impact :** On ne sait pas, sans lire chaque fichier, ce qui est payant, ce qui est mort et ce qui sert de preuve. Trois commandes npm publiées (test:live, test:codex:speed, test:actions:live) échouent sur un poste neuf. Les adaptateurs hérités ne peuvent pas être retirés tant que ces scripts existent.
- **Nuance du relecteur (elle prime) :** Inventaire exact : 39 fichiers, 6 609 lignes, 12 avec entrée npm, 4 cités nulle part, 4 scripts sur openrouter.cjs et 1 sur codex-video-agent.cjs. Recalcul : 78 imports relatifs et 33 chargements par load(), tous résolus ; 11 drapeaux Electron, tous lus par app/main.cjs. Les 5 dérives sont vérifiées. Corrections.

  (1) probe-retrieval.cjs n'est pas hérité : il dépend d'openrouter-embeddings.cjs, que runtime/session-runtime.cjs:25 utilise en production. scripts/legacy reçoit donc 4 scripts et le générateur ; probe-retrieval va dans scripts/live, comme le prévoit OPS-07.

  (2) Le déplacement touche aussi 65 références à scripts/&lt;nom> dans 18 documents, dont SECURITY.md et deploy/runtime.env.example:16 (procédure de cloisonnement), plus 9 commentaires de code : à compter dans l'effort.

  (3) Hors ROOT (HEAD 208d2e3) : scripts/check.mjs, scripts/quality/ et scripts/loop/ forment le harnais protégé et restent en place.

  (4) ADP-11 range les adaptateurs hérités sous scripts/lib/legacy, ce constat sous scripts/legacy : un seul choix.

  (5) Le test scripts-coherence compare du texte source, ce que docs/standards.md (HEAD) réserve aux gardes d'architecture : préférer n/no-missing-require, puis le contrôle de types sur scripts/ après OPS-14.

<a id="OPS-12"></a>
#### OPS-12 — Amorçages et utilitaires recopiés d'un script à l'autre

**Verdict : confirmé** · priorité P2 · effort M · risque faible · Scripts et outillage

**Suite : pas de ticket.** Il faudrait factoriser l'amorçage et les utilitaires des scripts dans scripts/lib (cli, time, electron, tv-page, host, report). Le chantier change la lecture d'arguments de commandes documentées. Le constat lui-même pose deux prérequis : OPS-11, pour ne pas factoriser ce que L09-10 supprime, et OPS-02. Son emplacement doit aussi s'accorder avec OPS-09 (tests/e2e/support), qui relève d'un autre lot. Ce n'est ni du code mort ni du rangement. — _Reprise :_ Après L09-10 et après le lot qui traite OPS-09 et OPS-02.

- **Où :** scripts/smoke-electron.mjs:12 ; scripts/smoke-electron.mjs:659 ; scripts/capture-showcase.mjs:13 ; scripts/capture-showcase.mjs:88 ; scripts/probe-shortcut.mjs:2 ; scripts/probe-video-chat-live.mjs:9 ; scripts/smoke-lg-ui.mjs:11-13 ; scripts/smoke-tv-timeline.mjs:15 ; scripts/smoke-tv-overlay.mjs:25 ; scripts/smoke-tv-ambient.mjs:43 ; scripts/simulate-tv-ambient.mjs:317 ; scripts/bench-backend.cjs:12-15 ; scripts/bench-perceived.cjs:18-26 ; scripts/replay-lg-stream.cjs:20-24 ; scripts/replay-reinspection.cjs:22-26 ; scripts/simulate-stream.cjs:121
- **Preuve :** Electron : 5 appels electron.launch dans 4 scripts et 2 définitions de waitState. Page TV : chemin de Chrome macOS écrit 6 fois, copie de tv/app sans connection.js 5 fois, écoute de pageerror 10 fois. Hôte de test : HeadlessRuntime construit 7 fois dans 6 scripts, chacun avec ses faux agents. Utilitaires : `option(nom, défaut)` défini 10 fois avec 4 variantes de comportement ; attente (sleep, delay, wait, pause) 10 fois dans 8 scripts ; `load = file => require(path.join(root, file))` 5 fois ; mkdtemp dans 22 scripts ; écriture d'un rapport JSON dans 25. Trois conventions de sortie coexistent : variable TVLENS_SMOKE_OUT, option --out, chemin fixe.
- **Impact :** Un changement de l'amorçage (nouveau drapeau Electron, nouveau fichier secret à écarter de la copie de tv/app, nouvelle option du runtime) est à refaire dans 5 à 7 fichiers ; l'oubli d'un seul envoie un parcours vers le vrai serveur avec le vrai jeton, risque que les commentaires des scripts décrivent eux-mêmes.
- **Remède proposé par l'audit :** scripts/lib/, en CommonJS pour être lu par les 23 scripts .cjs comme par les 15 .mjs : cli.cjs (util.parseArgs, une seule sémantique d'option et de drapeau), time.cjs (sleep, until avec délai), tree.cjs (load depuis une racine, pour les comparaisons --root), electron.cjs (lancement avec drapeaux et environnement, waitState), tv-page.cjs (copie de tv/app sans connection.js, résolution de Chrome, collecte des erreurs de page), host.cjs (HeadlessRuntime et RemoteServer sur port éphémère avec faux agents paramétrables), report.cjs (rapport JSON, dossier de sortie, code de retour). Migration script par script, en commençant par les 6 parcours de OPS-09.
- **Risque du remède selon le relecteur :** Unifier les 4 variantes d'`option` change la lecture d'arguments de commandes citées dans la documentation (valeur absente, forme `--nom=valeur`) : détecté par tests/stream-simulation.test.cjs, tests/question-ceiling.test.cjs, tests/media-asr-options.test.cjs:179 et par un passage de chaque parcours migré ; l'emplacement du support (scripts/lib) est à accorder avec OPS-09, qui annonce tests/e2e/support.

<a id="OPS-18"></a>
#### OPS-18 — prototypes/ contient du code de production déployé sur la TV

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Scripts et outillage

**Suite :** [T102](travail/tickets/102-move-the-installed-tv-remote-and-the-ipk-builder-out-of.md) « Move the installed TV remote and the ipk builder out of prototypes » ; [T103](travail/tickets/103-move-the-tv-remote-python-tests-into-tests-and-run-them-in.md) « Move the TV remote Python tests into tests and run them in one discovery ».

**Part laissée de côté :** Le reste (fixture JSON des rectangles, partagée avec OPS-16) touche du code installé sur la TV. — _Reprise :_ Avec le ticket OPS-16 de son lot, après L09-06

- **Où :** docs/lg-installation.md:20-21 ; docs/lg-ambient.md:26-28 ; README.md:139 ; scripts/smoke-tv-overlay.mjs:30 ; prototypes/lg-remote/30-tvlens-remote:3 ; prototypes/lg-remote/runtime/managed_mapper.py:29 ; prototypes/lg-remote/vendor/upstream.json ; prototypes/lg-remote/test_panel.py ; prototypes/lg-remote/test_ambient_relay.py ; prototypes/lg-remote/test_control.py ; prototypes/lg-sidebar/README.md
- **Preuve :** prototypes/lg-remote (control.py, runtime/ avec 5 modules et 1 114 lignes, vendor/, rakuten.json, crochet 30-tvlens-remote) est copié vers /media/developer/tvlens-remote selon le guide d'installation, et docs/lg-ambient.md compte trois de ses modules parmi les pièces de la fonction d'alertes. Ses 3 fichiers de tests (560 lignes ; 15, 17 et 1 tests d'après la documentation) ne sont lancés par rien. scripts/smoke-tv-overlay.mjs:30 recopie en JS des rectangles vidéo définis dans runtime/panel.py. prototypes/lg-sidebar, lui, se dit « experimental, not the production companion », mais fournit l'empaqueteur (OPS-10). Le code tiers est correctement tracé : la somme SHA-256 de vendor/magic_mapper.py, recalculée, égale celle de upstream.json.
- **Impact :** Le nom du dossier invite à ne pas tester, ne pas linter et à supprimer ce qui fait fonctionner la télécommande ; toute règle d'outillage par dossier (lint, CI, paquet) le classera à tort.
- **Nuance du relecteur (elle prime) :** Preuve exacte : destinations du guide d'installation, 5 modules et 1 114 lignes dans runtime/, 3 fichiers de tests de 560 lignes (15, 17 et 1 tests), rectangles de panel.py recopiés en scripts/smoke-tv-overlay.mjs:30-31, somme SHA-256 de vendor/magic_mapper.py conforme à upstream.json, README et 7 documents à mettre à jour. Un point de la remédiation ne tient pas : « un commit de déplacements seuls » est incompatible avec l'envoi des tests dans tests/. Ils trouvent leur code par le dossier du fichier (test_ambient_relay.py:9-10, test_panel.py:4, test_control.py:7), et test_ambient_relay.py:325 relit un chemin historique par `git show 9758633:prototypes/lg-remote/…` (encore valable après déplacement, mais sauté sans historique). Deux commits : déplacement pur de prototypes/lg-remote vers tv/remote avec ses tests, puis déplacement des tests avec correction de leurs chemins. Hors ROOT (HEAD 208d2e3) : scripts/check.mjs ne découvre que tests/test_*.py, ce qui justifie le second commit. Doublon de DOC-10, qui vise tests/python/ et test:python : à fusionner.

<a id="CORE-17"></a>
#### CORE-17 — Capacités optionnelles et compatibilités

**Verdict : nuancé** · priorité P3 · effort S · risque faible · Cœur et composition (`core/`, `runtime/`)

**Suite : pas de ticket.** Le constat porte sur un port d'index complet, un objet nul NoIndex et la suppression du constructeur de compatibilité de MomentSearch (mode exhaustive). C'est un sujet de ports (ISP/LSP), pas de code mort. Après L09-10, il reste un appelant de script, probe-retrieval.cjs (*:live, non exécutable par la boucle), plus des tests de moment-index et video-research. L09-10 ne citait CORE-17 sans rien en traiter : le constat a été retiré de son en-tête. — _Reprise :_ Après L09-10, dans le lot qui traite les ports du cœur.

Constat d'origine :

- Emplacement : `core/ports.cjs:54` ; `core/moment-search.cjs:29-33, 93-98` ; `core/moment-index.cjs:13` ; `core/deep-ask.cjs:37, 64, 67, 94, 148`.
- Preuve : cinq méthodes optionnelles d'index, mode `exhaustive` pour un script (`scripts/evaluate-actions.cjs:25`), options « inline ou second argument », `tools.release?/scope?/context?/availability?/freshness?`.
- Remédiation : port complet et objet nul `NoIndex` ; supprimer le constructeur de compatibilité (un script et deux tests à adapter).
- E : S à M. R : faible. T : `moment-index.test:391-395`.

- **Nuance du relecteur (elle prime) :** Le constructeur de compatibilité (core/moment-search.cjs:29-33) a deux scripts appelants, pas un : scripts/evaluate-actions.cjs:25 et scripts/probe-retrieval.cjs:3, tous deux *:live, donc non exécutables par la boucle. Côté tests : tests/video-research.test.cjs:7 et 12, et tests/moment-index.test.cjs:387-398 (index hérité sans request ni settle). Les cinq méthodes optionnelles sont observe, request, settle, status et close ; seules les trois premières figurent dans core/ports.cjs:54.
- **Risque du remède selon le relecteur :** Les deux scripts live adaptés ne peuvent pas être validés par exécution, et supprimer le test de l'index hérité fait baisser le compteur de cas de test ; détecté par moment-index.test, video-research et le cliquet cas_de_test.

<a id="ADP-11"></a>
#### ADP-11 — Code hérité et exports morts

**Verdict : confirmé** · priorité P3 · effort S · Adaptateurs et frontières

**Suite :** [T100](travail/tickets/100-remove-dead-exports-and-move-the-temporal-target-out-of-the.md) « Remove dead exports and move the temporal target out of the session module » ; [T139](travail/tickets/139-remove-the-legacy-openrouter-and-codex-exec-adapters-and-the.md) « Remove the legacy OpenRouter and codex exec adapters and the scripts using them ».

**Part laissée de côté :** cleanupRawMedia et son commentaire faux (adapters/local-store.cjs:262-266) : le fichier et son test sont modifiés par L01-03 et L06-06, et la suppression demande une décision du propriétaire. — _Reprise :_ Après L01-03 et L06-06, sur décision du propriétaire

Constat d'origine :

- `adapters/openrouter.cjs` : importé par 4 scripts et `tests/adapters.test.cjs`, aucun code produit.
- `adapters/codex-video-agent.cjs` : importé par `scripts/evaluate-actions.cjs` et `tests/chat-codex.test.cjs`. Il oblige `codex-verifier.cjs:18-25` à garder le lancement `codex exec`, que le fichier dit lui-même moins confiné.
- `cleanupRawMedia` (`local-store.cjs:267`) : tests seulement, commentaire inexact. `OPEN_ACTIONS` (`codex-confinement.cjs:442`) : jamais lu.
- Remédiation : déplacer sous `scripts/lib/legacy/`, supprimer les exports.
- Effort S–M. Tests : `architecture.test:20`.

<a id="TV-07"></a>
#### TV-07 — Code mort

**Verdict : confirmé** · priorité P3 · effort S · Interfaces (Mac, TV, scripts Python)

**Suite :** [T101](travail/tickets/101-remove-unreachable-tv-panel-code-and-let-test-fixtures.md) « Remove unreachable TV panel code and let test fixtures escape the webm ignore ».

Constat d'origine :

- `timeline-view.js:399-411` est inatteignable : `companion.js:483` (`dialogKeys`) renvoie `true` dès qu'un dialogue est ouvert, et `handleKey` n'a pas d'autre appelant.
- Globales nues `surveillance-overlay.js:495-499` : aucun appel trouvé dans `tv/app` ni dans `scripts`.
- Effort S.

<a id="DOC-11"></a>
#### DOC-11 — Composition du dépôt : 76 % du poids n'est pas le produit, 6 Mo d'images sans référence

**Verdict : nuancé** · priorité P3 · effort M · risque faible · Documentation et dépôt

**Suite : pas de ticket.** La composition du dépôt (film/, promo/, design/, captures sans référence, hero-coast.png) suppose une décision du propriétaire : dépôt média séparé ou suppression d'images peut-être utilisées hors du dépôt. Le constat demande DOC-09 d'abord, ce que fait L09-02. Aucun test ne protège ces déplacements. — _Reprise :_ Après L09-02 et une décision écrite du propriétaire.

- **Où :** app/assets/hero-coast.png ; design/ (3 PNG) ; screenshots/ (19 fichiers) ; film/ (31 fichiers) ; promo/ (28 fichiers) ; docs/*.json (42 fichiers) ; docs/video-chat-live.json
- **Preuve :** Commit 8627b46 : 498 fichiers, 20,71 Mo. Par dossier racine (Mo / fichiers) : screenshots 6,52 / 19 ; design 4,22 / 3 ; docs 3,06 / 137 (42 JSON pour 1,77 Mo, 92 md pour 1,12 Mo) ; app 2,32 / 23 (dont app/assets/hero-coast.png 2,05 Mo) ; tests 1,57 / 80 ; film 0,81 / 31 ; scripts 0,53 / 39 ; promo 0,42 / 28 ; tv 0,33 / 24 ; adapters 0,27 / 41 ; core 0,22 / 22 ; racine 0,15 / 9 ; prototypes 0,15 / 27 ; runtime 0,10 / 5 ; server 0,02 / 2 ; deploy, media, mcp moins de 0,01 chacun. Binaires suivis : 33 fichiers, 13,72 Mo, 66 % du poids (23 PNG pour 12,80 Mo, 5 JPEG, 1 MP3 de 0,50 Mo, 1 TTF, 3 WebM de test). Code livré (app hors image, tv, core, adapters, runtime, server, mcp, deploy, prototypes/lg-remote) : 1,34 Mo, 6,5 %. Hors produit (screenshots, design, film, promo, JSON de docs, hero-coast.png) : 15,8 Mo, 76 %. Sans aucune référence dans le commit : hero-coast.png, plus gros fichier du dépôt (0 occurrence de « hero-coast », sources de film/ et promo/ comprises) ; les 3 PNG de design/ ; 9 des 11 PNG à la racine de screenshots/. film/ et promo/ sont deux projets Remotion TypeScript autonomes, chacun avec package.json et package-lock.json (141 et 192 Ko) ; promo a ESLint, Prettier et tsc, que le produit n'a pas. docs/video-chat-live.json et docs/video-chat-live-1790637182683.json sont le même blob (2c4c42dbf0, 306 Ko), avec cinq vignettes JPEG en base64 d'environ 57 000 caractères chacune.
- **Impact :** Le signal est noyé : un quart seulement des fichiers suivis est du code livré. Toute recherche plein texte et tout outil (lint, format, empaquetage) doivent exclure à la main film/, promo/ et les rapports. Deux verrous npm supplémentaires à maintenir. Le poids n'est pas le problème, la lisibilité oui.
- **Nuance du relecteur (elle prime) :** Chiffres confirmés sur l'arbre Git de 8627b46 (unités décimales) : 498 fichiers, 20,71 Mo, répartition par dossier exacte, 33 binaires pour 13,72 Mo dont 23 PNG pour 12,80 Mo, hero-coast.png (2,05 Mo) et les 3 PNG de design/ sans aucune référence, 9 PNG sur 11 à la racine de screenshots/ sans référence (les deux autres sont cités par docs/validation.md), video-chat-live.json et sa copie horodatée sur le même blob 2c4c42dbf0. Portée de la remédiation incomplète : déplacer les six captures du README vers docs/images/ touche aussi scripts/capture-showcase.mjs:10 (npm run screenshots:live écrit dans screenshots/current), CONTRIBUTING.md:29 (« captures courantes dans screenshots/current/ ») et les deux README de screenshots/ liés par README.md:66, :83 et docs/README.md:33 ; seuls les scripts de promo/ sont cités. Ce déplacement n'apporte aucun gain de maintenance : garder screenshots/current et screenshots/lg, retirer seulement les 9 captures orphelines. Le coût réel (exclure film/ et promo/ des outils) se règle par une ligne d'exclusion dans ESLint, Prettier et le filtre d'empaquetage ; la séparation en dépôt distinct est une décision du propriétaire, sans urgence.
- **Remède proposé par l'audit :** Reste : app, core, adapters, runtime, server, mcp, tv, deploy, scripts, tests, docs (guides, reference, adr, travail), media/samples (README et manifeste), les six captures de screenshots/current et screenshots/lg citées par le README, à déplacer dans docs/images/. S'archive dans le dépôt, sous docs/archive/ : PRD.MD et les documents datés (DOC-07, DOC-08), les rapports JSON dédoublonnés et sans vignettes, prototypes/lg-sidebar. Part dans un dépôt séparé (par exemple tvlens-media) : film/, promo/, design/, les 9 captures non référencées. À supprimer après confirmation du propriétaire : app/assets/hero-coast.png. Pas de réécriture de l'historique git : un retrait simple suffit.
- **Risque du remède selon le relecteur :** Sortir film/ et promo/ casse leurs scripts d'assets (promo/scripts/assets.mjs:11-20, teaser-assets.mjs:15) et supprimer une image jugée orpheline peut retirer un visuel utilisé hors dépôt ; aucun test ne le couvre, seuls l'exécution de ces scripts et l'accord du propriétaire le détectent.

<a id="OPS-20"></a>
#### OPS-20 — Les scripts écrivent leurs rapports dans docs/ et leurs captures dans /tmp à noms fixes

**Verdict : nuancé** · priorité P3 · effort S · risque faible · Scripts et outillage

**Suite : pas de ticket.** Les sondes écrivent dans docs/*.json et dans /tmp à des noms fixes. La convention unique --out / .local/reports / --publish repose sur scripts/lib/report.cjs (OPS-12, reporté), et le constat dépend explicitement d'OPS-12. Le relecteur la donne pour doublon de DOC-12, dont la partie sur les sorties suit donc le même report. — _Reprise :_ Avec OPS-12, dans le même ticket que la partie « sorties » de DOC-12.

- **Où :** scripts/probe-live.cjs:57 ; scripts/probe-verify.cjs:8 ; scripts/probe-retrieval.cjs:7 ; scripts/probe-shortcut.mjs:3 ; scripts/evaluate-actions.cjs:34 ; scripts/compare-inspection-strategies.cjs:15 ; scripts/probe-codex-speed.cjs:14 ; scripts/probe-refactor-live.cjs:14 ; scripts/probe-video-chat-live.mjs:64 ; scripts/smoke-electron.mjs:222 ; scripts/smoke-electron.mjs:254 ; scripts/smoke-electron.mjs:41-43 ; scripts/diagnose-inspect.cjs:2
- **Preuve :** 13 scripts écrivent 16 chemins docs/*.json en dur (live-validation, verification-live, retrieval-live, action-evaluation-live, strategy-comparison-live, codex-speed-live, chat-web-live, chat-memory-live, chat-sources-live, shortcut-validation, refactor-live-report, video-chat-live et sa variante, verification-ui-live, mcp-ui-live, reexamen-ui-live). Ces fichiers sont suivis par Git et servent de preuves citées par la documentation. smoke-electron écrit 19 fichiers /tmp/tvlens-*.png ou .json à noms fixes ; 3 autres scripts font de même. Les parcours TV, eux, utilisent déjà TVLENS_SMOKE_OUT ou --out avec un dossier temporaire.
- **Impact :** Relancer une sonde, même en échec ou avec un autre modèle, écrase une preuve versionnée et salit l'arbre ; deux exécutions simultanées se marchent dessus dans /tmp ; la CI ne sait pas où ramasser les artefacts.
- **Nuance du relecteur (elle prime) :** Preuve exacte : 13 scripts, 16 chemins docs/*.json écrits en dur, lignes citées justes, .local/ déjà ignoré par Git. Deux précisions de compteur et de portée.

  (1) smoke-electron écrit 17 noms distincts dans /tmp en 19 écritures, pas 19 fichiers.

  (2) scripts/compare-inspection-strategies.cjs:15 relit son propre rapport dans docs/ avec --resume : la convention --out doit couvrir la lecture, pas seulement l'écriture.

  Doublon de DOC-12 (audit docs-dépôt), avec des cibles différentes (.local/reports/&lt;date>-&lt;nom>.json, publication vers docs/archive/…) : à fusionner avant le découpage. Le déplacement des JSON existants relève de ce même constat DOC-12.
- **Remède proposé par l'audit :** Convention unique portée par scripts/lib/report.cjs (OPS-12) : option --out partout ; défaut .local/reports/&lt;script>-&lt;date ISO>.json, déjà ignoré par Git ; publication d'une preuve dans docs/evidence/ uniquement par une option explicite --publish. Captures et fichiers intermédiaires dans TVLENS_SMOKE_OUT, par défaut un dossier temporaire créé par mkdtemp, y compris pour smoke-electron. Déplacer les docs/*.json existants sous docs/evidence/ dans un commit de déplacements seuls, avec mise à jour des liens.
- **Risque du remède selon le relecteur :** Un document continue de pointer vers l'ancien chemin d'une preuve déplacée, ou une sonde relancée ne retrouve plus le rapport qu'elle reprenait : détecté par un contrôle des liens de la documentation après le commit de déplacement.

<a id="TSTC-20"></a>
#### TSTC-20 — Listes tenues à la main, crochet d'observation en production et règle .gitignore qui piège les fixtures

**Verdict : nuancé** · priorité P3 · effort S · risque faible · Tests des interfaces

**Suite :** [T101](travail/tickets/101-remove-unreachable-tv-panel-code-and-let-test-fixtures.md) « Remove unreachable TV panel code and let test fixtures escape the webm ignore ».

- **Où :** tests/tv-panel.test.cjs:82 ; tests/tv-app-compat.test.cjs:13, 50 ; tests/mac-ipc-contract.test.cjs:39-42 ; tv/app/companion.js:1254-1255 ; scripts/smoke-tv-overlay.mjs:984 ; tests/fixtures/chromium-webm-head.webm ; .gitignore
- **Preuve :** Le garde « no duration literal » de tv-panel.test.cjs:82 parcourt 6 scripts nommés plus index.html ; tv/app en compte 8 : surveillance-overlay.js et ambient.js n'y sont pas, alors que tv-app-compat.test.cjs:13 liste le dossier. `KEPT` (l.39-42) recopie 43 noms de méthodes du pont. `window.tvlensPanel = { stats }` (companion.js:1254) n'est lu que par le smoke (smoke-tv-overlay.mjs:984). .gitignore ignore `*.webm` alors que trois fixtures .webm sont suivies (vérifié en lecture seule sur le commit 8627b46) : une quatrième serait ignorée sans message et le test ne passerait que sur la machine de son auteur.
- **Impact :** Un fichier ajouté échappe au garde sans échec ; une fixture ajoutée manque en CI ; un crochet de test en production sans statut déclaré finit supprimé ou détourné.
- **Nuance du relecteur (elle prime) :** Liste de 6 scripts sur 8, KEPT de 43 noms et règle *.webm face à trois fixtures suivies au commit 8627b46 : exacts. Étendre le garde de tests/tv-panel.test.cjs:82 à tout tv/app passe aujourd'hui (rejoué sur les 16 fichiers js, html, css et json). Un point de la remédiation est déjà fait : tv/app/companion.js:1253 documente le crochet (« Read by the smokes and handy on a bench… »). Le crochet expose stats, kick et state, et le smoke le lit à sept endroits (scripts/smoke-tv-overlay.mjs:241, 261, 263, 281, 302, 984, 989), pas seulement l.984.

<a id="OUBLI-09"></a>
#### OUBLI-09 — Code mort et surface inutile non relevés

**Verdict : confirmé** · Signalement du relecteur — Cœur et composition (`core/`, `runtime/`)

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T100](travail/tickets/100-remove-dead-exports-and-move-the-temporal-target-out-of-the.md) « Remove dead exports and move the temporal target out of the session module ».

**Part laissée de côté :** validateDetection et validateRecap sans tests : ce n'est pas du code mort, cela relève d'un lot de tests. — _Reprise :_ Lot de couverture des tests

- **Signalement :** Code mort et surface inutile non relevés : needsInspection (core/deep-ask.cjs:2-4, aucun appelant), HeadlessRuntime.listeners (runtime/headless-runtime.cjs:239 et 398, seul abonné scripts/replay-lg-stream.cjs:121), exports sans utilisateur hors de leur fichier (cosine, observedTopic, TEXT_LIMITS, DEFAULT_LIMITS, TRANSCRIPTION_LANGUAGES, VIEWS, SAVE_INTERVAL_MS). validateDetection et validateRecap, citées en section 4 comme « déjà isolées et testées », n'apparaissent dans aucun fichier de tests.

<a id="OUBLI-17"></a>
#### OUBLI-17 — scripts/package.mjs:6 n'exclut pas ce que .gitignore:25-40 déclare privé ou local

**Verdict : confirmé** · Signalement du relecteur — Documentation et dépôt

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T099](travail/tickets/099-build-the-mac-package-from-an-allowlist-of-the-folders-the.md) « Build the Mac package from an allowlist of the folders the app loads ».

- **Signalement :** scripts/package.mjs:6 n'exclut pas ce que .gitignore:25-40 déclare privé ou local (tv/app/connection.js, deploy/runtime.env, deploy/server.env, auth.json, device-token, docs/candidature-draft.md « never publish »). État constaté par noms de fichiers seulement : dans l'arbre de travail actuel, docs/candidature-draft.md, .claude/, .harness-state/, experiments/, film/node_modules et promo/node_modules existent et seraient embarqués par le prochain npm run package:mac (déduit de copy-filter.js, build non lancé). L'archive dist/ du 29 septembre, dont j'ai lu l'en-tête asar, contient déjà design (4,2 Mo), screenshots (4,1 Mo), docs (53 fichiers), tests, scripts et PRD.MD : le « contenu réel non inspecté » de DOC-09 est maintenant vérifié sur cette ancienne construction.

<a id="OUBLI-21"></a>
#### OUBLI-21 — Composants TV installés rangés sous prototypes/

**Verdict : confirmé** · Signalement du relecteur — Interfaces (Mac, TV, scripts Python)

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T102](travail/tickets/102-move-the-installed-tv-remote-and-the-ipk-builder-out-of.md) « Move the installed TV remote and the ipk builder out of prototypes ».

- **Signalement :** Composants TV installés rangés sous prototypes/ : prototypes/lg-remote/runtime/ (ambient_relay.py 270 lignes, panel.py 221, managed_mapper.py 334, tvlens_mapper.py 37) fait partie de l'installation (README.md:139, docs/lg-ambient.md:26-28), redéclare en dur les fichiers du protocole (ambient_relay.py:59-61, panel.py:8-16), et ses tests (prototypes/lg-remote/test_*.py, 560 lignes) ne sont lancés par aucun contrôle : ni package.json:11, ni la découverte unittest -s tests du harnais ajouté après la copie figée. L'audit ne le cite qu'en passant (« le mappeur », PY-05).

<a id="OUBLI-29"></a>
#### OUBLI-29 — Tests Python dépendants de leur emplacement et de l'historique Git

**Verdict : confirmé** · Signalement du relecteur — Scripts et outillage

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T103](travail/tickets/103-move-the-tv-remote-python-tests-into-tests-and-run-them-in.md) « Move the TV remote Python tests into tests and run them in one discovery ».

- **Signalement :** Tests Python dépendants de leur emplacement et de l'historique Git. prototypes/lg-remote/test_ambient_relay.py:325 compare la boucle à `git show 9758633:…` et se saute si le commit est absent (clone superficiel de CI). test_ambient_relay.py:9-10, test_panel.py:4 et test_control.py:7 trouvent le code par le dossier du fichier. À traiter dans OPS-05 (profondeur du clone) et OPS-18 (déplacement en deux commits).

### L10 — Une documentation qui dit l'état actuel

Vague 1 · 15 constats · 10 tickets

- [T107](travail/tickets/107-fail-the-check-on-documentation-links-and-commands-that.md) — Fail the check on documentation links and commands that point nowhere
- [T108](travail/tickets/108-make-the-architecture-page-and-the-docs-index-describe-the.md) — Make the architecture page and the docs index describe the current code
- [T109](travail/tickets/109-gather-every-known-debt-into-one-register-with-an-id-a.md) — Gather every known debt into one register with an id, a module and a state
- [T110](travail/tickets/110-keep-the-product-decisions-and-invariants-in-one-reference.md) — Keep the product decisions and invariants in one reference page
- [T111](travail/tickets/111-archive-the-first-architecture-loop-records-with-a-status.md) — Archive the first architecture loop records with a status line and a glossary
- [T112](travail/tickets/112-archive-superseded-plans-and-diagrams-and-rewrite-the.md) — Archive superseded plans and diagrams, and rewrite the roadmap from what is open
- [T113](travail/tickets/113-archive-the-night-mission-briefs-once-their-open-items-are.md) — Archive the night mission briefs once their open items are in the register
- [T114](travail/tickets/114-make-contributing-the-entry-page-that-points-to-the-rules.md) — Make CONTRIBUTING the entry page that points to the rules and the one check
- [T115](travail/tickets/115-give-each-decision-record-a-current-status-its-modules-and.md) — Give each decision record a current status, its modules and its guarding tests
- [T140](travail/tickets/140-state-what-runs-on-the-test-tv-and-the-server-in-one-place.md) — State what runs on the test TV and the server in one place _(attend une décision du propriétaire)_

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [DOC-02](#DOC-02) | Dérive entre documentation d'entrée et code : 9 affirmations sur 15 fausses, périmées ou incomplètes | nuancé | P1 | [T108](travail/tickets/108-make-the-architecture-page-and-the-docs-index-describe-the.md), [T140](travail/tickets/140-state-what-runs-on-the-test-tv-and-the-server-in-one-place.md) |
| [DOC-05](#DOC-05) | Dette connue enfouie dans dix historiques, sans registre | confirmé | P1 | [T109](travail/tickets/109-gather-every-known-debt-into-one-register-with-an-id-a.md) |
| [DOC-01](#DOC-01) | Aucune convention écrite ni définition de terminé | nuancé | P2 | [T114](travail/tickets/114-make-contributing-the-entry-page-that-points-to-the-rules.md) |
| [DOC-03](#DOC-03) | ADR et historique de la boucle sans aucun lien entrant ; architecture.md muette sur les dix décisions | confirmé | P2 | [T108](travail/tickets/108-make-the-architecture-page-and-the-docs-index-describe-the.md), [T115](travail/tickets/115-give-each-decision-record-a-current-status-its-modules-and.md) |
| [DOC-04](#DOC-04) | ADR : comptes rendus d'un chantier d'une journée, statut périmé, aucun test nommé, aucune décision fondatrice | nuancé | P2 | [T115](travail/tickets/115-give-each-decision-record-a-current-status-its-modules-and.md) |
| [DOC-07](#DOC-07) | L'index docs/README.md ne sépare pas l'état actuel des archives et ignore un tiers du dossier | nuancé | P2 | [T107](travail/tickets/107-fail-the-check-on-documentation-links-and-commands-that.md), [T108](travail/tickets/108-make-the-architecture-page-and-the-docs-index-describe-the.md) |
| [DOC-08](#DOC-08) | Cinq systèmes de tickets, trois PRD et trois feuilles de route coexistent ; deux documents racine sont périmés | nuancé | P2 | [T111](travail/tickets/111-archive-the-first-architecture-loop-records-with-a-status.md), [T112](travail/tickets/112-archive-superseded-plans-and-diagrams-and-rewrite-the.md), [T113](travail/tickets/113-archive-the-night-mission-briefs-once-their-open-items-are.md) |
| [DOC-13](#DOC-13) | Aucune documentation au niveau des modules, des scripts ni des tests | nuancé | P2 | pas de ticket |
| [DOC-15](#DOC-15) | Réglages documentés à huit endroits, cinq variables non documentées | nuancé | P2 | pas de ticket |
| [DOC-14](#DOC-14) | Vocabulaire de la boucle et du domaine sans glossaire | nuancé | P3 | [T111](travail/tickets/111-archive-the-first-architecture-loop-records-with-a-status.md) |
| [DOC-16](#DOC-16) | Règle de langue implicite, bien tenue mais non écrite ; noms de tests jusqu'à 327 caractères | nuancé | P3 | pas de ticket |
| [DOC-17](#DOC-17) | Les deux seuls diagrammes décrivent un état abandonné, sous le nom « current » | confirmé | P3 | [T112](travail/tickets/112-archive-superseded-plans-and-diagrams-and-rewrite-the.md) |
| [DOC-18](#DOC-18) | Commentaires qui décrivent le changement plutôt que l'état | nuancé | P3 | pas de ticket |
| [OUBLI-18](#OUBLI-18) | Le contrat produit en vigueur vit dans deux documents que DOC-08 envoie en archive « sans correction » | confirmé | — | [T110](travail/tickets/110-keep-the-product-decisions-and-invariants-in-one-reference.md) |
| [OUBLI-20](#OUBLI-20) | Deux commandes de vérification coexistent sans que l'audit le relève | confirmé | — | [T114](travail/tickets/114-make-contributing-the-entry-page-that-points-to-the-rules.md) |

<a id="DOC-02"></a>
#### DOC-02 — Dérive entre documentation d'entrée et code : 9 affirmations sur 15 fausses, périmées ou incomplètes

**Verdict : nuancé** · priorité P1 · effort S · risque faible · Documentation et dépôt

**Suite :** [T108](travail/tickets/108-make-the-architecture-page-and-the-docs-index-describe-the.md) « Make the architecture page and the docs index describe the current code » ; [T140](travail/tickets/140-state-what-runs-on-the-test-tv-and-the-server-in-one-place.md) « State what runs on the test TV and the server in one place ».

- **Où :** README.md:89,103,111,139,169,187,188 ; CONTRIBUTING.md:7-11,17-21,25 ; docs/architecture.md:3,5,18,26 ; docs/README.md:25 ; docs/installation.md:210-212
- **Preuve :** Tableau (affirmation → verdict : preuve).

  1. README.md:111 « Node.js 24+ » → NON OUTILLÉ : package.json sans champ engines, pas de .nvmrc ; répété dans docs/installation.md:9 et docs/server-installation.md:9.

  2. README.md:113-126 et :137, sept commandes npm (setup:speech, setup:codex, start, package:mac, open:mac, start:server, test:electron) → VRAI : toutes dans package.json:7-28.

  3. README.md:169 « 287 tests Node et 6 tests Python (tests/test_tv_control.py) » → PÉRIMÉ : 602 tests Node (mesure fournie) ; test_tv_control.py contient 9 fonctions test_, les trois fichiers Python de tests/ en contiennent 84, prototypes/lg-remote 33 de plus.

  4. README.md:139, panneau et télécommande installés depuis prototypes/lg-remote → VRAI (voir DOC-10).

  5. README.md:187, plancher disque de 1 Gio, et docs/architecture.md:45, alerte à 2 Gio → VRAI : adapters/disk-guard.cjs:34.

  6. README.md:188, cinq minutes par question et cinq questions en attente → VRAI : core/deep-ask.cjs:10 et :57.

  7. README.md:89 « installés sur la TV de test et sur le VPS le 13 octobre » → CONTREDIT trois fois : README.md:103 (« pas encore déployés »), docs/architecture.md:5 (« ni commitée ni déployée : la TV et le VPS tournent encore sur la version précédente »), docs/README.md:25 (« Rien n'est déployé »).

  8. CONTRIBUTING.md:7 et docs/architecture.md:18, cœur sans import externe, gardé par tests/architecture.test.cjs → VRAI : aucun import non relatif dans core/, test aux lignes 5-14.

  9. CONTRIBUTING.md:7-11 « Frontières à conserver » → INCOMPLET : cinq dossiers décrits ; runtime/ (composition partagée, 5 fichiers), server/, tv/, deploy/, prototypes/ absents.

  10. CONTRIBUTING.md:10, rôle de app/ui/ (navigation, pictogrammes, récapitulatif, helpers texte) → PÉRIMÉ : 15 fichiers, dont job-view, job-card, sessions-view, sessions-dom, surveillance-view, surveillance-dom, search-view, card-queue, list-view non décrits.

  11. CONTRIBUTING.md:17-21, vérifier = npm test + test:electron → INCOMPLET : package.json:11 lance tests/*.test.cjs seulement, 117 tests Python restent dehors.

  12. CONTRIBUTING.md:25 « *:live et screenshots:live utilisent des fournisseurs réels » → INCOMPLET : test:verify (scripts/probe-verify.cjs:6, vrai CodexVerifier) et test:codex:speed aussi ; trois scripts finissent par -live et non :live.

  13. docs/architecture.md:3, trois compositions partagées → INCOMPLET : runtime/session-closing.cjs (134 lignes) absent ; 0 occurrence de « session-closing », « scell », « révoqu », « redemand » dans la page.

  14. docs/architecture.md:5 « branche codex/tvlens-night-features, qui n'est ni commitée ni déployée » → FAUX dans le commit lu.

  15. docs/architecture.md:26 « deux files FIFO bornées (un travail actif et deux en attente chacune) » → IMPRÉCIS : maxPending vaut 2 (core/session.cjs:47) mais en perception séparée la file garde jusqu'à six passages (core/session.cjs:151).

  Bilan : 5 vraies, 4 périmées, fausses ou contredites, 5 incomplètes ou imprécises, 1 non outillée. Hors tableau, vérifiées vraies : pondération 55/45 (core/moment-search.cjs:133), modèle d'embeddings (adapters/openrouter-embeddings.cjs:1), attente de 1,5 s (core/moment-search.cjs:54), envois toutes les 30 s (runtime/session-runtime.cjs:36), 1 à 3 postes de surveillance (runtime/surveillance-runtime.cjs:61), vues ?view= et overlay (server/http.cjs:96-101), planches de six images (adapters/inspection-strategies.cjs:39-46). Autre dérive : docs/installation.md:210-212 dit que scripts/probe-video-chat-live.mjs « appelle encore l'ancien pont Auto », alors que le script appelle startSurveillance (ligne 28).
- **Impact :** Le lecteur ne peut pas savoir si la version de la nuit du 13 octobre tourne sur la TV et le VPS : quatre phrases se contredisent, dont deux dans le même README. Le chiffre de tests affiché est la moitié du réel. CONTRIBUTING ne mentionne pas runtime/, le dossier le plus retouché, ni les tests Python.
- **Nuance du relecteur (elle prime) :** Les 15 affirmations et leurs lignes sont vérifiées (disk-guard.cjs:34, deep-ask.cjs:10 et :57, session.cjs:47 et :151, architecture.test.cjs:5-14, probe-verify.cjs:6, probe-video-chat-live.mjs:28, 84 + 33 tests Python). Quatre précisions. (1) L'état de déploiement est affirmé ou nié à six endroits, pas quatre : README.md:89 et :170 et SECURITY.md:161 disent « installé sur la TV de test et le VPS / le serveur de référence le 13 octobre » ; README.md:103, docs/architecture.md:5 et docs/README.md:25 disent le contraire. La remédiation ne retire que README.md:89 et architecture.md:5 : il faut traiter aussi README.md:170, docs/README.md:25 et SECURITY.md:155-161. (2) README.md:169 est une phrase datée (« avant ses changements ») : périmée, pas fausse. (3) « Prérequis : aucun » est incohérent : la remédiation s'appuie sur DOC-19 (rubrique « Déployé »), DOC-01, DOC-03 et DOC-07 ; soit on les déclare, soit le ticket se limite aux corrections en place. (4) À la tête de branche, node scripts/check.mjs lance déjà les 84 tests Python de tests/ (unittest discover) : seuls les 33 de prototypes/lg-remote restent hors de tout contrôle ; npm test (package.json:11) n'a pas changé. CONTRIBUTING.md, README.md, docs/README.md et docs/architecture.md sont identiques entre 8627b46 et la tête : le constat s'applique tel quel, et CLAUDE.md envoie désormais les agents lire docs/architecture.md, dont la ligne 5 est fausse.

<a id="DOC-05"></a>
#### DOC-05 — Dette connue enfouie dans dix historiques, sans registre

**Verdict : confirmé** · priorité P1 · effort M · risque faible · Documentation et dépôt

**Suite :** [T109](travail/tickets/109-gather-every-known-debt-into-one-register-with-an-id-a.md) « Gather every known debt into one register with an id, a module and a state ».

- **Où :** docs/architecture-improvements/history/F01.md:72 ; F02.md:125 ; F03.md:143 ; F04.md:144 ; F05.md:210 ; F06.md:249 ; F07.md:195 ; F08.md:125 ; F09.md:157 ; F10.md:156 ; sections « Limites » des dix ADR
- **Preuve :** Chaque historique a une section « Limites et dettes » en tableau (Sujet, Origine, Suite proposée) : 176 lignes au total (7, 14, 16, 12, 27, 31, 20, 20, 16, 13), dont une quarantaine avec « Aucune » comme suite. Les ADR y ajoutent 55 puces « Limites ». Exemples dans F07.md : « Une troisième copie du format étape : message reste dans le runtime de session », « Le fichier dédié recopie une troisième fois le substitut d'Electron », « L'IPC Mac ne refuse pas un bloc pendant une fermeture », « Les lignes citées par la fiche sont périmées ». Aucun fichier ne les agrège, aucune n'est reliée à une issue.
- **Impact :** Le plan de remédiation va redécouvrir ou ignorer plus de cent dettes déjà qualifiées, avec leur origine et une suite proposée ; plusieurs recoupent les autres audits (CORE-01, CORE-11, UI-01). Archiver les historiques sans extraction les perd.

<a id="DOC-01"></a>
#### DOC-01 — Aucune convention écrite ni définition de terminé

**Verdict : nuancé** · priorité P2 · effort S · risque faible · Documentation et dépôt

**Suite :** [T114](travail/tickets/114-make-contributing-the-entry-page-that-points-to-the-rules.md) « Make CONTRIBUTING the entry page that points to the rules and the one check ».

- **Où :** CONTRIBUTING.md:1-31 ; docs/architecture-improvements/mission.md:3-27 ; package.json:7-28
- **Preuve :** CONTRIBUTING.md fait 31 lignes : 0 occurrence de « commit », « branche », « ADR », « langue », « lint », « format », « runtime », « tv/ », « deploy », « prototypes ». Les règles réellement suivies pendant F01–F10 (exploration avant modification, test rouge puis vert, deux relectures, aucun test assoupli) n'existent que dans mission.md, un prompt d'agent daté (mission.md:17 « Tu n'es pas seul dans le dépôt »). Aucun gabarit d'ADR, aucun CHANGELOG, aucun fichier d'instructions d'agent suivi dans le commit.
- **Impact :** Chaque session, humaine ou agent, réinvente la forme des tickets, des ADR et des noms de tests : le dépôt contient déjà cinq formes de tickets. Rien ne dit quand un ticket de refactor est fini. Les règles de la boucle disparaissent si mission.md est archivé.
- **Nuance du relecteur (elle prime) :** Preuve exacte sur 8627b46 (CONTRIBUTING.md fait 31 lignes, 0 occurrence des dix mots, règles de boucle seulement dans mission.md). Mais la remédiation ignore le harnais ajouté cinq commits plus tard sur refactor/maintenabilite (commit 0262480, tête 208d2e3, lu par git show, hors ROOT) : CLAUDE.md (frontières avec runtime/, server/, tv/ ; règle de langue ; commande de contrôle), docs/standards.md (60 lignes, chaque règle avec sa vérification), docs/adr/0000-gabarit.md, docs/travail/tickets/_gabarit.md, scripts/check.mjs (npm run check) et la skill ticket, qui porte déjà une définition de terminé (critères couverts, relecture par une session neuve, contrôle vert). Trois points de la remédiation contredisent ce harnais : (1) commit « Refs: CORE-03 en pied » alors que scripts/loop/run.mjs committe « T001: &lt;titre> » avec « Ticket: &lt;fichier> » ; (2) 72 caractères au plus alors que les 40 derniers sujets ont une médiane de 69 et un maximum de 166, et que 16 commits sur 56 portent « (F0x) » dans le sujet ; (3) « créer » un gabarit d'ADR qui existe avec d'autres champs. docs/standards.md et CLAUDE.md sont protégés en écriture pendant un ticket (.claude/hooks/guard-write.mjs, liste PROTECTED) : y ajouter une règle demande un ticket « harnais: oui ». Forme cible : CONTRIBUTING.md devient la page d'entrée humaine (carte des dossiers, commandes, où vit la documentation) qui renvoie à docs/standards.md et à la skill ticket, et n'ajoute que ce qui manque réellement : CHANGELOG, README de dossier, registre de dettes, niveau de preuve. Le point c (complexité) n'est pas exécutable tant qu'ESLint n'est pas installé : le cliquet ne mesure que 7 valeurs. Prérequis ADP-15 à moitié rempli (commande unique présente, lint et format absents). Prérequis circulaire avec DOC-04 sur le gabarit.

<a id="DOC-03"></a>
#### DOC-03 — ADR et historique de la boucle sans aucun lien entrant ; architecture.md muette sur les dix décisions

**Verdict : confirmé** · priorité P2 · effort S · risque faible · Documentation et dépôt

**Suite :** [T108](travail/tickets/108-make-the-architecture-page-and-the-docs-index-describe-the.md) « Make the architecture page and the docs index describe the current code » ; [T115](travail/tickets/115-give-each-decision-record-a-current-status-its-modules-and.md) « Give each decision record a current status, its modules and its guarding tests ».

**Part laissée de côté :** Ajouter des lignes dans le code avant le formatage crée du bruit de diff, et le contrôle automatique demande harnais: oui. — _Reprise :_ Après jalon:format et L10-09

- **Où :** docs/README.md:1-60 ; README.md:165 ; CONTRIBUTING.md:3 ; docs/architecture.md:3 ; docs/adr/ (10 fichiers) ; docs/architecture-improvements/index.md:1-14 ; runtime/session-closing.cjs:1
- **Preuve :** docs/adr/ et docs/architecture-improvements/ (32 fichiers, 3 234 lignes) ne se citent qu'entre eux. Recherche de « docs/adr », « architecture-improvements » et « ADR » hors de ces deux dossiers : 0 fichier, dans le code, les tests, README.md, CONTRIBUTING.md, docs/README.md et docs/architecture.md. index.md et mission.md n'ont aucun lien entrant. architecture.md ne contient ni « session-closing » ni les mots des règles des ADR 0002, 0005, 0006, 0008 (« scell », « révoqu », « admission », « redemand » : 0 occurrence).
- **Impact :** Le parcours README → docs/README.md → architecture.md ne révèle pas que dix décisions existent. Qui modifie la fin de session n'a aucun pointeur vers l'ADR 0007 et ses dix règles. Le travail documentaire le plus soigné du dépôt est invisible, donc non entretenu.

<a id="DOC-04"></a>
#### DOC-04 — ADR : comptes rendus d'un chantier d'une journée, statut périmé, aucun test nommé, aucune décision fondatrice

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Documentation et dépôt

**Suite :** [T115](travail/tickets/115-give-each-decision-record-a-current-status-its-modules-and.md) « Give each decision record a current status, its modules and its guarding tests ».

**Part laissée de côté :** La liste des décisions fondatrices à consigner relève du propriétaire. — _Reprise :_ Après décision du propriétaire

- **Où :** docs/adr/0001-resultats-de-recherche-lies-a-leur-session.md:7,8,11,47-49 ; docs/adr/0007-fin-de-session-par-un-meme-protocole-sur-les-deux-hotes.md:7,8,86-88,96 ; docs/adr/0006-bloc-possede-des-son-admission-et-preparation-annulee-quand-sa-session-part.md (section Décision, 12 règles) ; docs/adr/0005-groupe-codex-attendu-avant-d-etre-remplace-et-contextes-revoques-en-fin-de-session.md:1
- **Preuve :** Points forts : 10 sur 10 ont les sections Contexte, Décision, Alternatives écartées, Conséquences, Preuves, Limites ; les titres énoncent un invariant. Défauts : les dix sont datés du 13 octobre 2026 et correspondent chacun à un correctif F0x ; 9 sur 10 portent un statut de boucle périmé (« en attente d'intégration locale par le merger à la date de rédaction », « Non publié, non déployé ») ; 0 sur 10 nomme un fichier de test (« un fichier dédié de 22 tests ») ; 4 sur 10 (0002, 0003, 0005, 0006) ne citent aucun chemin de fichier source ; chacun est ancré sur un SHA (« Code relu ») et porte des chiffres volatils (« 476 sur 476 », « 150 sur 150 », « Le module fait 92 lignes de code ») ; la section Preuves raconte le processus (développeur, reviews, merger). L'ADR 0007 décrit le commit a2c86bb alors que le code de la copie est 8627b46, commit de code ultérieur du même sujet. La numérotation suit le numéro de chantier, pas l'ordre des décisions (0007 écrit après 0010 ; 0001 « rédigé après coup »). Titres de 77 à 149 caractères, noms de fichiers de 47 à 90. Aucun champ Remplace ou Remplacé par. Aucun ADR pour les décisions fondatrices : architecture hexagonale, CommonJS sans build ni typage, scripts classiques côté webOS, persistance en fichiers JSON par session, conservation jusqu'à suppression, Codex App Server et cloisonnement, Whisper local.
- **Impact :** Le statut ne dit pas si la règle est en vigueur. Les découpages prévus (headless-runtime, main.cjs) ne peuvent pas savoir quels tests protègent quelle règle. Les chiffres deviennent faux au commit suivant. L'ADR 0006 sert de seule spécification du comportement d'ingestion, noyée dans un récit. Les choix qui contraignent tout le plan (pas de typage, pas de build) ne sont écrits nulle part comme décisions révisables.
- **Nuance du relecteur (elle prime) :** Mesures confirmées : 10 ADR datés du 13 octobre, 9 sur 10 « en attente du merger », 10 sur 10 « Non publié, non déployé », 0 fichier de test nommé, 0002/0003/0006 sans chemin source et 0005 avec « core/ » seulement, 55 puces « Limites », noms de fichiers de 47 à 90 caractères, 0007:96 « 92 lignes ». Quatre faits à corriger. (1) Le gabarit existe à la tête de branche (docs/adr/0000-gabarit.md, commit 0262480) avec d'autres champs : Date, Ticket, Statut, puis Contexte, Décision, Alternatives écartées, Conséquences, Protégée par ; la skill ticket s'en sert. Il faut l'amender (ajouter Modules, Remplace, Limites), pas le créer. (2) L'écart « l'ADR 0007 décrit a2c86bb » est déjà résorbé : le commit cd5bcd9 l'a réécrit sur 8627b46 ; son statut reste périmé. (3) « Conservation jusqu'à suppression » et le plafond de cinq minutes sont écrits comme décisions : docs/features-proactives-et-retention-2026-10-13.md:80-107 numérote neuf décisions produit, citées par le code (core/deep-ask.cjs:8 « Product decision 1 », tests/viewing-features.test.cjs:4 « decision 8 »). L'ADR rétroactif doit les reprendre, pas les réinventer. (4) Les numéros 0011 à 0017 ne sont pas réservables : la boucle attribue « le numéro suivant » à tout ticket « adr: oui ». Le prérequis DOC-01 (gabarit) est circulaire avec DOC-01, qui renvoie ici.

<a id="DOC-07"></a>
#### DOC-07 — L'index docs/README.md ne sépare pas l'état actuel des archives et ignore un tiers du dossier

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Documentation et dépôt

**Suite :** [T107](travail/tickets/107-fail-the-check-on-documentation-links-and-commands-that.md) « Fail the check on documentation links and commands that point nowhere » ; [T108](travail/tickets/108-make-the-architecture-page-and-the-docs-index-describe-the.md) « Make the architecture page and the docs index describe the current code ».

- **Où :** docs/README.md:18-33,44,51-58 ; docs/validation.md:3-5 ; docs/refactor-runtime.md:1 ; docs/viewing-upgrade.md:3 ; docs/product-decisions-original.md:1 ; docs/tvlens-night-tickets.md:16-23 ; docs/PRD-V2.md:3,115,129,258
- **Preuve :** docs/ : 137 fichiers (92 md, 42 json, 2 puml, 1 jpg). Classement des 46 documents de premier niveau d'après leur contenu : 15 décrivent l'état actuel, 7 sont des rapports ou contrats de mission datés, 4 des travaux futurs, 20 des archives. La section « Recherche et historique » fait bien ce tri pour 15 documents, mais : (1) « Comprendre, développer, vérifier » range avec la référence quatre rapports datés (night-features-delivery.md, 1 022 lignes et 152 Ko ; backend-latency-optimization.md ; reinspection-transcript-reuse.md ; publication-audit.md) ; (2) deux documents de référence portent une date trompeuse : validation.md s'ouvre sur « État actuel — 4 octobre 2026 » et « 127 tests Node », refactor-runtime.md (« Rôles des agents » dans l'index) est titré « 30 septembre 2026 » ; (3) non indexés : docs/adr/, docs/architecture-improvements/, docs/diagrams/, six documents (active-goal, chat-overlay-validation, lg-companion-design, lg-pre-root-safety, reexamen-contract-original, research-dgx-spark-qwen38-2026-10-12) et 41 des 42 JSON, dont 7 liés de nulle part ; (4) 13 liens cassés : 5 vers experiments/ (non suivi), 8 vers .scratch/ (ignoré) ; (5) cinq documents seulement portent un bandeau d'archive, et trois de ces bandeaux renvoient à « l'état actuel » viewing-upgrade.md, lui-même marqué « Document historique (29 septembre 2026) » ; (6) une trentaine de décomptes de tests différents, de 100 à 498, sont répartis dans 27 documents ; aucun ne vaut 602.
- **Impact :** Un nouveau venu ne sait pas quel document fait foi. Les documents présentés comme actuels citent des chiffres d'époques différentes. Les archives non signalées se lisent comme la vérité (docs/lg-companion-tickets/05.md parle encore d'un délai de 60 secondes).
- **Nuance du relecteur (elle prime) :** Preuve confirmée point par point : 137 fichiers (92 md, 42 json, 2 puml, 1 jpg), 46 documents de premier niveau, 6 documents non indexés, 13 liens cassés exactement (5 vers experiments/, 8 vers .scratch/, sur 415 liens relatifs), 5 bandeaux d'archive dont 3 renvoient à viewing-upgrade.md, 31 décomptes de tests distincts de 100 à 498 dans 27 documents, aucun à 602. La répartition 15/7/4/20 est un jugement non revérifié. La remédiation est à recadrer sur la tête de branche : docs/standards.md, docs/adr/, docs/adr/0000-gabarit.md, docs/travail/tickets/ et docs/architecture.md sont codés en dur dans CLAUDE.md, .claude/skills/ et scripts/loop/, tous protégés ; l'arborescence cible doit les laisser en place ou le ticket porter « harnais: oui ». Brancher scripts/check-docs.mjs sur scripts/check.mjs est aussi une modification du harnais. Le contrôle « chemins de code entre accents graves existants » doit se limiter à guides/ et reference/, sinon chaque archive le fait échouer. Effort sous-estimé : 92 documents à classer, 415 liens à réécrire, plus les commentaires de code qui citent des chemins de documents (tests/test_tv_ambient.py:4, scripts/simulate-stream.cjs:6 et :62-64). Découper en deux : d'abord le contrôle de liens et la ligne de statut (S), puis les déplacements par lot (M à L).

<a id="DOC-08"></a>
#### DOC-08 — Cinq systèmes de tickets, trois PRD et trois feuilles de route coexistent ; deux documents racine sont périmés

**Verdict : nuancé** · priorité P2 · effort S · risque faible · Documentation et dépôt

**Suite :** [T111](travail/tickets/111-archive-the-first-architecture-loop-records-with-a-status.md) « Archive the first architecture loop records with a status line and a glossary » ; [T112](travail/tickets/112-archive-superseded-plans-and-diagrams-and-rewrite-the.md) « Archive superseded plans and diagrams, and rewrite the roadmap from what is open » ; [T113](travail/tickets/113-archive-the-night-mission-briefs-once-their-open-items-are.md) « Archive the night mission briefs once their open items are in the register ».

**Part laissée de côté :** Ce rapport porte encore la seule trace des réglages et de l'installation du 13 octobre. — _Reprise :_ Après DOC-15 et L10-10

- **Où :** PRD.MD:1-8 ; ROADMAP.md:5,9 ; docs/PRD-V2.md:3 ; docs/roadmap-original.md:1 ; docs/lg-companion-roadmap.md:3 ; docs/lg-companion-tickets/05.md:3,17-21 ; docs/tvlens-night-tickets.md:16-23 ; docs/architecture-improvements/10-f07.md:13,21-24
- **Preuve :** Cinq systèmes : 33 tickets de cadrage (docs/roadmap-original.md, 1 268 lignes, et ticket-drafts-original.json) ; LG-01 à LG-13 (13 fichiers au statut « en cours, non publié », cases non cochées, alors que lg-companion-roadmap.md dit le parcours livré) ; tickets de nuit 01 à 08 (sources dans .scratch/, liens cassés) ; F01 à F10 (fiches copiées d'issues GitHub : 37 critères d'acceptation tous non cochés alors que les dix sujets sont traités, 31 références fichier:ligne périmées — 10-f07.md:13 cite app/main.cjs:310, aujourd'hui une ligne de commentaire ; 150 des 302 lignes non vides des fiches sont du texte répété) ; PRD-V2 (travail futur). « 01 » désigne quatre choses. Trois documents de vision : PRD.MD (734 lignes, « Version 0.1 », « Exploration / Hackathon MVP », caméra, micro et GX10 : pas le produit construit ; aucun lien entrant), docs/PRD-V2.md, docs/features-proactives-et-retention-2026-10-13.md. Trois feuilles de route : ROADMAP.md, docs/roadmap-original.md, docs/lg-companion-roadmap.md. ROADMAP.md est périmé : ligne 5 « aucune implémentation de cette tranche annoncée » pour le companion LG que le README présente comme livré ; ligne 9 cite le mode « Auto », retiré (docs/architecture.md:65).
- **Impact :** La racine du dépôt présente deux documents faux sur l'état du produit. Les tickets clos ont l'air ouverts. Le prochain découpage créera un sixième système si rien n'est décidé.
- **Nuance du relecteur (elle prime) :** Confirmé : fiches F01–F10 avec 37 cases non cochées, 31 références fichier:ligne, 150 lignes répétées sur 302 ; app/main.cjs:310 est une ligne de commentaire ; ROADMAP.md:5 et :9 périmés ; PRD.MD sans lien entrant ; roadmap-original 1 268 lignes. Quatre faits faux ou manquants. (1) Les 13 tickets LG ne sont pas tous « en cours, non publié » : 01-02 « en cours — … », 03-06 « en cours, non publié », 07-13 « brouillon, non publié » ; lg-companion-roadmap.md ne dit livrés que LG-01 à LG-06 et annonce LG-07 à LG-10 « à poursuivre ». De même les huit tickets de nuit sont « partiel » ou « non clos » avec une colonne « Ce qui reste à prouver ». Ce sont des tickets ouverts, pas des tickets clos d'apparence ouverte : leur reste à faire doit entrer au registre (DOC-05) avant l'archivage. (2) Le système unique existe déjà à la tête de branche et contredit la forme proposée : docs/travail/tickets/NNN-slug.md, identifiant T suivi de trois chiffres imposé par scripts/loop/tickets.mjs, ticket conservé avec « statut: termine » (la boucle s'en sert pour résoudre bloque_par), commit « T001: titre ». Des identifiants CORE-03 et un retrait du fichier à la clôture casseraient la boucle ; l'identifiant d'audit va dans la rubrique « Sources » du gabarit. (3) docs/features-proactives-et-retention-2026-10-13.md n'est pas qu'un document de vision : ses lignes 80-107 portent neuf décisions produit en vigueur, citées par le code ; à extraire avant archivage. (4) night-features-delivery.md est lié quatre fois depuis README.md, depuis SECURITY.md:161 et architecture.md:5, et porte un tableau de réglages (DOC-15) : son archivage dépend de DOC-02 et DOC-15. Effort M plutôt que S.

<a id="DOC-13"></a>
#### DOC-13 — Aucune documentation au niveau des modules, des scripts ni des tests

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Documentation et dépôt

**Suite : pas de ticket.** Les README par dossier de code se font quand chaque dossier est découpé, pas en lot documentaire. tests/architecture.test.cjs lit tous les fichiers de core, runtime et server : un README ajouté là doit être vérifié contre ce test. — _Reprise :_ Pendant les tickets de découpage des modules concernés

- **Où :** core/ ; adapters/ ; runtime/ ; server/ ; mcp/ ; app/ ; tv/ ; scripts/ ; tests/ ; deploy/ ; docs/architecture.md:9-16
- **Preuve :** 10 README suivis : racine, docs, docs/diagrams, film, promo, media/samples, deux dans prototypes, deux dans screenshots. Aucun dans les dix dossiers de code, de scripts et de tests. Fichiers qui commencent par un commentaire d'en-tête : core 11 sur 22, adapters 7 sur 41, runtime 1 sur 5, server 0 sur 2, mcp 0 sur 2, app 0 sur 5, app/ui 3 sur 14, tv 5 sur 5, tv/app 3 sur 8, soit 30 sur 104. 58 balises JSDoc au total. 39 scripts sans index, dont 4 cités nulle part (scripts/diagnose-inspect.cjs, probe-chat-sources.cjs, probe-shortcut.mjs, probe-tv-ambient-capture.mjs). 74 fichiers de tests sans carte. architecture.md cite 3 fichiers de runtime/ sur 5 et désigne les adaptateurs par nom de classe, pas par fichier.
- **Impact :** Pour savoir où vit une responsabilité il faut lire architecture.md (129 lignes denses) puis chercher. Les découpages prévus (CORE-02, CORE-03, ADP-06, UI-02) vont créer des dizaines de fichiers sans endroit où dire leur rôle.
- **Nuance du relecteur (elle prime) :** Confirmé : 10 README suivis et aucun dans les dossiers de code, en-têtes 11/22 (core), 7/41 (adapters), 1/5 (runtime), 0/2, 0/2, 0/5, 3/14, 5/5, 3/8, 58 balises JSDoc, 39 scripts dont 4 cités nulle part, 71 fichiers .test.cjs et 3 Python, architecture.md 129 lignes. Un fait à corriger : architecture.md cite 4 fichiers de runtime/ sur 5 (headless-runtime, session-runtime, conversation-runtime, surveillance-runtime), pas 3 ; seul session-closing.cjs manque. Une contrainte que la remédiation ignore : tests/architecture.test.cjs:7 lit tous les fichiers de core/ et :16 tous ceux de runtime/ et server/, sans filtrer l'extension. Un core/README.md dont la prose contient « process. », « fetch( », « Buffer. », « document. » ou « window. » fait échouer la ligne 12 ; un README de runtime/ ou server/ qui écrit « require('electron') » fait échouer la ligne 17. Forme cible : filtrer ce test sur les extensions de code dans le même ticket, ou rédiger ces README sans ces motifs. Ne pas poser de README dans tv/app/ : prototypes/lg-sidebar/package.py:14 embarque tout fichier de premier niveau dans le paquet TV.
- **Remède proposé par l'audit :** Un README.md de 20 à 40 lignes par dossier source, même plan partout : Rôle ; Ce qui y entre et ce qui n'y entre pas (sens des dépendances) ; Points d'entrée ; Invariants (repris des ADR) ; Décisions liées ; Tests qui protègent. Une phrase d'en-tête par fichier (« Responsabilité : … »). tests/README.md : convention de nommage, commandes Node et Python, doublures partagées, fixtures. scripts/README.md : quatre familles (développement, sondes live, bancs, empaquetage) et le coût de chacune. architecture.md redevient une vue d'ensemble (couches, flux, hôtes) qui renvoie aux README de dossier. Chaque ticket de découpage crée ou met à jour le README du dossier touché (DOC-01, point d).
- **Risque du remède selon le relecteur :** Un README ajouté dans core/, runtime/ ou server/ est analysé comme du code par la garde d'architecture ; détecté immédiatement par tests/architecture.test.cjs, mais des README non contrôlés dériveront comme CONTRIBUTING.md sans le contrôle de chemins de DOC-07.

<a id="DOC-15"></a>
#### DOC-15 — Réglages documentés à huit endroits, cinq variables non documentées

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Documentation et dépôt

**Suite : pas de ticket.** La table des réglages doit être générée à partir d'une déclaration unique des réglages, qui n'existe pas encore. — _Reprise :_ Après ADP-09 (déclaration centralisée des réglages)

- **Où :** adapters/config.cjs:20-21,59-75 ; adapters/chat-trace.cjs:41 ; runtime/session-runtime.cjs:207 ; docs/installation.md:217-225 ; docs/server-installation.md ; docs/backend-latency-optimization.md ; docs/night-features-delivery.md:835 ; docs/lg-remote-runtime.md ; .env.example ; deploy/server.env.example
- **Preuve :** 42 noms TVLENS_* relevés dans le code de production (quelques-uns sont des constantes JavaScript de tv/app, par exemple TVLENS_SESSION_ID). Cinq variables d'environnement ne figurent dans aucun document : TVLENS_CODEX_TRACE (adapters/chat-trace.cjs:41), TVLENS_INSPECTION_MODEL et TVLENS_INSPECTION_STRATEGY (adapters/config.cjs:20-21), TVLENS_LOCAL_VLM_KEEP_ALIVE et TVLENS_LOCAL_VLM_TOKEN (adapters/config.cjs:75). Les autres sont décrites dans cinq tableaux distincts (installation.md, server-installation.md, backend-latency-optimization.md, night-features-delivery.md, lg-remote-runtime.md), plus README.md:187-188, .env.example et deploy/*.example (25 noms).
- **Impact :** Ajouter ou modifier un réglage oblige à retrouver jusqu'à huit endroits. Un défaut documenté peut diverger du code : adapters/config.cjs:21 donne « native-slow » par défaut alors que runtime/session-runtime.cjs:207 force « sheets-diverse » hors mode de test.
- **Nuance du relecteur (elle prime) :** Confirmé : 42 noms TVLENS_* dans le code de production (dont 4 constantes JavaScript de tv/app : TVLENS_POLL, TVLENS_SESSION_ID, TVLENS_KIND_LABELS, TVLENS_STATUS_LABELS), cinq tableaux de réglages (9 à 17 variables chacun), 25 noms dans les fichiers d'exemple, chat-trace.cjs:41, config.cjs:20-21 et :75, tests/portable-config.test.cjs à 2 tests. Deux corrections. (1) Quatre variables sont absentes de tout document, pas cinq : TVLENS_INSPECTION_MODEL figure dans .env.example:10, qui dit que l'app ne s'en sert plus. (2) L'exemple de divergence est mal qualifié : TVLENS_INSPECTION_STRATEGY est un réglage mort. config.cjs:21 le lit, et aucun module ne consomme la valeur (seule occurrence de la propriété) ; runtime/session-runtime.cjs:207 prend son argument « strategy », alimenté par l'option --inspection-strategy= de app/main.cjs:305, et seulement en mode smoke. TVLENS_INSPECTION_MODEL est écrasé par app/main.cjs:77 ; seuls deux scripts historiques le lisent directement (compare-inspection-strategies.cjs:14, evaluate-actions.cjs:10). Ces deux lectures se suppriment de config.cjs, elles ne se documentent pas. Restent à documenter : TVLENS_CODEX_TRACE, TVLENS_LOCAL_VLM_KEEP_ALIVE, TVLENS_LOCAL_VLM_TOKEN.
- **Remède proposé par l'audit :** docs/reference/configuration.md : un seul tableau (variable, défaut, bornes, hôte Mac ou serveur, effet), produit à partir d'une table déclarative unique dans adapters/config.cjs (forme cible de ADP-09). Test hors ligne : toute variable TVLENS_* lue dans core, adapters, runtime, server et app figure dans la table, et inversement. Les cinq tableaux existants sont remplacés par un lien. .env.example et deploy/*.example sont vérifiés par le même test.
- **Risque du remède selon le relecteur :** Le test « toute variable lue figure dans la table » échoue sur les constantes JavaScript de tv/app et sur les lectures directes de process.env hors config.cjs si son motif n'est pas borné, et supprimer un réglage mort peut casser un script historique ; détecté par ce test et par tests/portable-config.test.cjs, à écrire après ADP-09.

<a id="DOC-14"></a>
#### DOC-14 — Vocabulaire de la boucle et du domaine sans glossaire

**Verdict : nuancé** · priorité P3 · effort S · risque faible · Documentation et dépôt

**Suite :** [T111](travail/tickets/111-archive-the-first-architecture-loop-records-with-a-status.md) « Archive the first architecture loop records with a status line and a glossary ».

**Part laissée de côté :** Le glossaire du domaine dépend de la décision de nommage passage/segment. — _Reprise :_ Après CORE-21

- **Où :** docs/architecture-improvements/mission.md:3,17 ; docs/architecture-improvements/index.md:3 ; docs/adr/0007-fin-de-session-par-un-meme-protocole-sur-les-deux-hotes.md:86-88 ; docs/architecture.md:26
- **Preuve :** Acteurs et étapes de la boucle employés sans définition : « merger » 61 occurrences (toutes dans docs/adr et docs/architecture-improvements), « supervision » ou « superviseur » 190, « Astra » 25, « Opus » 35, « review standards », « review spécification », « doublure », « couture ». mission.md est un prompt d'agent collé tel quel (mission.md:3 « Autorisation Dabi13octobre2026 », :17 « Tu n'es pas seul dans le dépôt » ; index.md:3 « Opus5.5ultracode »). Vocabulaire du domaine : le même objet s'appelle « passage » (commentaires et documentation), segment (410 occurrences dans core, runtime, adapters, server), « bloc » ou block (transport TV), moment-N (identifiants et recherche), « tranche » (documentation).
- **Impact :** Le lecteur d'un ADR ne sait pas qui a validé quoi ni ce que vaut « confirmé par le merger ». Les cinq noms du passage compliquent toute recherche et tout renommage (rejoint CORE-21).
- **Nuance du relecteur (elle prime) :** Confirmé pour la boucle : « merger » 61 occurrences, toutes dans docs/adr et docs/architecture-improvements ; « Astra » 25 ; mission.md:3, :17 et index.md:3 cités exactement ; aucun glossaire. Le volet domaine est imprécis : « passage » n'est pas réservé aux commentaires et à la documentation. Dans core, runtime, adapters et server il apparaît 658 fois contre 423 pour « segment », y compris en identifiants (passageId 24 fois, passageText 17, passagesPending, lastPassage) et en nom de fichier (core/passage-text.cjs) ; « moment » nomme aussi des modules (moment-index.cjs, moment-search.cjs, saved-moments.cjs). L'entrée « passage (segment dans le code) » du glossaire proposé serait donc fausse : le code emploie les deux mots pour le même objet. Le glossaire doit constater cet état et désigner le terme retenu, ce qui est la décision de CORE-21 ; écrire la partie domaine après elle, la partie processus (dix lignes) peut partir tout de suite.

<a id="DOC-16"></a>
#### DOC-16 — Règle de langue implicite, bien tenue mais non écrite ; noms de tests jusqu'à 327 caractères

**Verdict : nuancé** · priorité P3 · effort S · risque faible · Documentation et dépôt

**Suite : pas de ticket.** Ne vaut pas une session. La règle de langue est déjà dans CLAUDE.md, et la compléter dans docs/standards.md demande harnais: oui. — _Reprise :_ Au prochain ticket harnais: oui qui touche docs/standards.md

- **Où :** tv/capture.py:107 ; tv/ambient.py:200 ; tv/luna.py:18 ; tv/controller.py:353 ; tv/transport.py:66 ; tests/architecture-f04.test.cjs:70-74 ; tests/architecture-f07.test.cjs:499 ; docs/lg-sidebar-validation.md:1 ; prototypes/lg-remote/README.md:1 ; PRD.MD:2
- **Preuve :** Règle implicite mesurée : identifiants, commentaires, noms de tests et sujets de commit en anglais ; tout ce que lit l'utilisateur ou le mainteneur francophone en français (messages d'erreur, interface, consignes aux agents, journal, documentation, ADR). Commentaires : 4 328 lignes classées anglais contre 18 français dans core, adapters, runtime, server, mcp, app, tv, scripts, tests, prototypes (heuristique par mots-outils). Messages de new Error classables hors tests : 116 en français, 0 en anglais. Noms de tests : 575 en anglais sur 576. Exceptions : (1) Python : erreurs en anglais (capture.py:107, ambient.py:200, luna.py:18, controller.py:353) sauf transport.py:66 en français ; (2) t.diagnostic en français dans des tests aux noms anglais (architecture-f04:70-74) ; (3) trois documents en anglais (docs/lg-sidebar-validation.md et les deux README de prototypes/) ; (4) noms de fichiers de documentation mêlés (night-features-delivery.md, features-proactives-et-retention-2026-10-13.md, ADR en français) ; (5) PRD.MD : sous-titre anglais, extension en majuscules. Longueur des noms de tests : médiane 98 caractères, 146 au-delà de 120, 36 au-delà de 200, maximum 327 (architecture-f07:499). La règle n'est écrite nulle part. Sujets de commit : cinq seulement ont été vus, tous en anglais.
- **Impact :** Sans règle écrite, chaque session choisit. Les messages français servent aussi d'identité d'erreur (CORE-10, ADP-04), ce qui rend leur langue structurante. Des noms de tests de 300 caractères rendent les sorties de test et les recherches illisibles.
- **Nuance du relecteur (elle prime) :** Mesures confirmées : 575 noms de tests relevés, 1 seul avec un mot français, médiane 98 caractères, 146 au-delà de 120, 36 au-delà de 200, maximum 327 (architecture-f07) ; côté tv/, 8 messages d'erreur Python en anglais et 1 en français (transport.py:66) ; aucun test Python ne compare un texte anglais (seul « Stockage plein », venu du serveur, est comparé). Deux corrections. (1) « La règle n'est écrite nulle part » n'est vrai que sur 8627b46 : à la tête de branche, CLAUDE.md la porte dans sa section « Langue » (documentation, messages utilisateur et consignes en français ; identifiants, noms de tests et commits en anglais). Il reste à écrire ce qu'elle ne couvre pas : commentaires, t.diagnostic, messages opérateur Python, noms de fichiers de documentation. L'endroit est docs/standards.md, fichier protégé (ticket « harnais: oui »), pas CONTRIBUTING.md. (2) Le plafond de 100 caractères met 263 noms sur 575 hors règle dès le premier jour : sans mesure au cliquet, c'est une règle morte ; avec, c'est un ticket de harnais. Les 56 sujets de commit de la branche sont en anglais.
- **Remède proposé par l'audit :** Écrire la règle dans CONTRIBUTING (DOC-01) : code, commentaires, noms de tests et commits en anglais ; textes vus par l'utilisateur, documentation et ADR en français ; diagnostics de test dans la langue des noms de tests ; messages opérateur des scripts Python alignés sur le français, comme le serveur ; noms de fichiers de documentation en français, minuscules et tirets, sans date hors de docs/archive/ ; nom de test de 100 caractères au plus, le détail en commentaire au-dessus. Aucune passe de traduction dédiée : appliquer en touchant les fichiers. Un seul lot mécanique pour les messages Python.
- **Risque du remède selon le relecteur :** Traduire les messages Python peut dérouter un opérateur ou un outil qui lit le texte anglais dans les journaux de la TV, et raccourcir des noms de tests casse les filtres --test-name-pattern cités dans les tickets ; les tests Python couvrent le premier point, rien ne couvre le second.

<a id="DOC-17"></a>
#### DOC-17 — Les deux seuls diagrammes décrivent un état abandonné, sous le nom « current »

**Verdict : confirmé** · priorité P3 · effort M · risque faible · Documentation et dépôt

**Suite :** [T112](travail/tickets/112-archive-superseded-plans-and-diagrams-and-rewrite-the.md) « Archive superseded plans and diagrams, and rewrite the roadmap from what is open ».

**Part laissée de côté :** Les diagrammes de couches et d'états doivent décrire la structure cible, pas l'actuelle qui va changer. — _Reprise :_ Après CORE-06

- **Où :** docs/diagrams/README.md:3,5-6 ; docs/diagrams/continuous-analysis-current.puml:13 ; docs/diagrams/continuous-analysis-target.puml:13,18
- **Preuve :** Les deux diagrammes datent du 4 octobre, « avant la séparation audio/vision » (README.md:3). Le fichier nommé « current » montre l'état d'avant ; les deux affichent « Médias : 5 min », et la cible « 60 s / question » : deux règles abandonnées le 13 octobre. Le rendu passe par deux liens vers uml.iamdabi.com qui portent le source encodé dans l'URL. Le dossier n'est lié depuis aucun autre document. Aucun diagramme ne montre les deux hôtes, les compositions de runtime/ ni les états d'une session, sujet de cinq ADR sur dix.
- **Impact :** Le seul support visuel induit en erreur. Le cycle de vie de session, zone la plus retouchée et la plus dupliquée (CORE-01, CORE-06), n'a aucune représentation.

<a id="DOC-18"></a>
#### DOC-18 — Commentaires qui décrivent le changement plutôt que l'état

**Verdict : nuancé** · priorité P3 · effort S · risque faible · Documentation et dépôt

**Suite : pas de ticket.** Ne vaut pas une session. Les commentaires périmés se corrigent quand leurs fichiers sont touchés ; un avertissement automatique demande harnais: oui. — _Reprise :_ Au fil des tickets qui touchent ces fichiers

- **Où :** adapters/config.cjs:31 ; adapters/companion-prompt.cjs:59 ; adapters/codex-verifier.cjs:19,65 ; core/session.cjs:330,499 ; runtime/session-runtime.cjs:38-39 ; runtime/headless-runtime.cjs:756 ; tv/capture.py:6 ; tv/app/sessions-view.js:703
- **Preuve :** 25 lignes de commentaire du code de production contiennent « no longer », « as before » ou « used to » ; une dizaine renvoient à un état passé que le lecteur ne peut pas connaître : « no file is created, as before » (config.cjs:31), « The three paragraphs the session agent used to append itself » (companion-prompt.cjs:59), « the tail the former five-minute window used to hold » (session-runtime.cjs:39), « same row as before » (sessions-view.js:703). Les tests en comptent 32.
- **Impact :** Faible mais cumulatif : le commentaire documente le diff, pas le code ; après deux refactors, « before » ne désigne plus rien.
- **Nuance du relecteur (elle prime) :** Ordre de grandeur confirmé : 26 lignes de commentaire et 2 lignes de docstring Python en production, 31 lignes de commentaire dans les tests (annoncés : 25 et 32). Neuf des dix emplacements cités sont bien des renvois à un état passé (config.cjs:31, companion-prompt.cjs:59, codex-verifier.cjs:19 et :65, session.cjs:330, session-runtime.cjs:38-39, headless-runtime.cjs:756, capture.py:6, sessions-view.js:703). core/session.cjs:499 n'en est pas un : « as before saying a session archived » décrit l'ordre des opérations présentes, pas l'historique. De même les deux docstrings (« no longer feeds », « no longer the one observed ») décrivent l'état courant. L'avertissement automatique sur ces motifs aura donc des faux positifs ; le limiter à « as before » en fin de proposition, « used to » et « formerly ». À la tête de branche, docs/standards.md porte déjà « Les commentaires disent pourquoi, pas quoi » : la règle se complète là (fichier protégé), et l'avertissement modifie scripts/check.mjs, donc ticket « harnais: oui ».
- **Remède proposé par l'audit :** Règle dans CONTRIBUTING : un commentaire énonce l'invariant présent et sa raison ; l'histoire vit dans l'ADR et le CHANGELOG. Réécrire au passage des tickets qui touchent ces fichiers (exemple : config.cjs:31 devient « Nothing to keep: no file is created. »). Avertissement non bloquant du contrôle qualité sur les motifs « as before », « used to », « formerly » dans les commentaires.
- **Risque du remède selon le relecteur :** Un motif trop large signale des commentaires corrects et pousse à les réécrire pour faire taire l'outil ; détecté à la première exécution du contrôle, à garder non bloquant.

<a id="OUBLI-18"></a>
#### OUBLI-18 — Le contrat produit en vigueur vit dans deux documents que DOC-08 envoie en archive « sans correction »

**Verdict : confirmé** · Signalement du relecteur — Documentation et dépôt

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T110](travail/tickets/110-keep-the-product-decisions-and-invariants-in-one-reference.md) « Keep the product decisions and invariants in one reference page ».

- **Signalement :** Le contrat produit en vigueur vit dans deux documents que DOC-08 envoie en archive « sans correction » : docs/features-proactives-et-retention-2026-10-13.md:80-107 (neuf décisions numérotées, citées par core/deep-ask.cjs:8 et tests/viewing-features.test.cjs:4) et docs/architecture-improvements/mission.md:21 (seule liste consolidée des invariants produit : conservation jusqu'à suppression, archives en lecture seule, cinq minutes, chat et surveillance en parallèle, files bornées, cloisonnement). À extraire dans un document de référence ou un ADR avant tout archivage : c'est la liste que chaque ticket de refactor doit préserver.

<a id="OUBLI-20"></a>
#### OUBLI-20 — Deux commandes de vérification coexistent sans que l'audit le relève

**Verdict : confirmé** · Signalement du relecteur — Documentation et dépôt

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T114](travail/tickets/114-make-contributing-the-entry-page-that-points-to-the-rules.md) « Make CONTRIBUTING the entry page that points to the rules and the one check ».

- **Signalement :** Deux commandes de vérification coexistent sans que l'audit le relève : CONTRIBUTING.md:17-21 et README.md:175-180 prescrivent npm test (package.json:11, fichiers en parallèle, sans Python), alors que la référence à la tête de branche est node scripts/check.mjs (--test-concurrency=1, tests Python de tests/ inclus). Sur une machine à court de mémoire où un test échoue déjà sous charge (tests/architecture-f06.test.cjs:530), la commande documentée pour les humains est celle qui reproduit l'échec.

### L11 — Un seul cycle de vie pour les deux hôtes

Vague 2 · 10 constats · 4 tickets · fiche de chantier : [hotes-cycle-de-vie.md](travail/fiches/hotes-cycle-de-vie.md)

- [T116](travail/tickets/116-pin-the-question-flag-warm-up-and-active-instruction-of-the.md) — Pin the question flag, warm-up and active instruction of the Mac host in tests
- [T117](travail/tickets/117-pin-the-server-host-warm-up-at-start-and-resume-never-on-a.md) — Pin the server host warm-up at start and resume, never on a read-only open
- [T118](travail/tickets/118-save-the-questions-of-both-hosts-through-one-shared.md) — Save the questions of both hosts through one shared checkpoint module
- [T119](travail/tickets/119-warm-up-a-session-and-read-the-active-instruction-through.md) — Warm up a session and read the active instruction through shared functions

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [CORE-01](#CORE-01) | Deux orchestrations d'hôte parallèles | nuancé | P1 | [T116](travail/tickets/116-pin-the-question-flag-warm-up-and-active-instruction-of-the.md), [T117](travail/tickets/117-pin-the-server-host-warm-up-at-start-and-resume-never-on-a.md), [T118](travail/tickets/118-save-the-questions-of-both-hosts-through-one-shared.md), [T119](travail/tickets/119-warm-up-a-session-and-read-the-active-instruction-through.md) |
| [CORE-02](#CORE-02) | `HeadlessRuntime` classe-dieu | nuancé | P1 | pas de ticket |
| [CORE-04](#CORE-04) | Doublures de test dans la composition de production | nuancé | P1 | pas de ticket |
| [ADP-06](#ADP-06) | `app/main.cjs` : une fermeture de 500 lignes | nuancé | P1 | pas de ticket |
| [ADP-07](#ADP-07) | Hôte Mac dupliquant `HeadlessRuntime` | nuancé | P1 | [T116](travail/tickets/116-pin-the-question-flag-warm-up-and-active-instruction-of-the.md), [T117](travail/tickets/117-pin-the-server-host-warm-up-at-start-and-resume-never-on-a.md), [T118](travail/tickets/118-save-the-questions-of-both-hosts-through-one-shared.md), [T119](travail/tickets/119-warm-up-a-session-and-read-the-active-instruction-through.md) |
| [ADP-09](#ADP-09) | Réglages d'hôte dupliqués et dispersés | nuancé | P2 | pas de ticket |
| [CORE-19](#CORE-19) | Configuration mutable partagée et chemins implicites | nuancé | P3 | pas de ticket |
| [OUBLI-03](#OUBLI-03) | Le binaire Codex est résolu différemment selon l'hôte | nuancé | — | pas de ticket |
| [OUBLI-07](#OUBLI-07) | Logique d'hôte dupliquée non listée dans CORE-01 | nuancé | — | pas de ticket |
| [OUBLI-10](#OUBLI-10) | Minuteries non injectées dans runtime/ | confirmé | — | [T118](travail/tickets/118-save-the-questions-of-both-hosts-through-one-shared.md) |

<a id="CORE-01"></a>
#### CORE-01 — Deux orchestrations d'hôte parallèles

**Verdict : nuancé** · priorité P1 · effort L (4 tickets S/M) · risque élevé · Cœur et composition (`core/`, `runtime/`)

**Suite :** [T116](travail/tickets/116-pin-the-question-flag-warm-up-and-active-instruction-of-the.md) « Pin the question flag, warm-up and active instruction of the Mac host in tests » ; [T117](travail/tickets/117-pin-the-server-host-warm-up-at-start-and-resume-never-on-a.md) « Pin the server host warm-up at start and resume, never on a read-only open » ; [T118](travail/tickets/118-save-the-questions-of-both-hosts-through-one-shared.md) « Save the questions of both hosts through one shared checkpoint module » ; [T119](travail/tickets/119-warm-up-a-session-and-read-the-active-instruction-through.md) « Warm up a session and read the active instruction through shared functions ».

**Part laissée de côté :** Part restante : la porte asking (markAsking), qui touche aussi scripts/simulate-stream.cjs et la fixture de tests/question-ceiling.test.cjs. Elle demande un test serveur pour la garde this.closing, qui n'est fixée par aucun test aujourd'hui. — _Reprise :_ Après L11-01 et L11-03 intégrés

Constat d'origine :

- Emplacement : `runtime/headless-runtime.cjs:289-305, 353-357, 376-385, 403-424, 644-649, 778-809` ; `app/main.cjs:91-92, 147-160, 164, 167, 408-409, 413-420`.
- Preuve : transition exclusive, checkpoint des questions (1 s), drapeau `watch.asking`, consigne active, warm-up, suivi des ingestions et pause sur disque plein, timers 5000/1000 sont écrits deux fois. Divergence déjà là : le Mac filtre `j.sessionId===watch.id`, le serveur non ; la condition du balayage diffère.
- Impact : chaque correctif de cycle de vie se fait deux fois (c'est ce que décrit l'ADR 0007 pour la fin de session).
- Remédiation : extraire, comme `session-closing.cjs`, `runtime/question-checkpoint.cjs`, `runtime/asking-gate.cjs`, `runtime/exclusive.cjs`, `runtime/ingest-tracker.cjs` ; les deux hôtes les consomment.
- E : L (4 tickets S/M). R : élevé. T : `server-sessions`, `architecture-f06/f07`, `mac-ipc-contract`.

- **Nuance du relecteur (elle prime) :** Emplacements et doublons exacts (exclusive, checkpoint 1 s, drapeau asking, consigne active, warm-up, ingestion, timers 5000/1000). Quatre précisions. (1) La condition de balayage différente n'est pas une dérive mais un choix commenté des deux côtés : runtime/headless-runtime.cjs:328-331 (une session durable au repos ne publie rien, pour que les polls reçoivent 304 ; fixé par tests/server-state-views.test.cjs:29) et app/main.cjs:308-311 (le Mac pousse son horloge pendant la capture). À ne pas unifier. (2) Une troisième copie de la porte asking existe dans scripts/simulate-stream.cjs:312. (3) Pour ingest-tracker, seule la queue validateSegment + watch.ingest + pause sur STORAGE_FULL est commune (une dizaine de lignes) : la possession des blocs (accept/current/finish/settleIngestions, headless 713-775) est propre au serveur (ADR 0006), et le Mac ne refuse pas un bloc pendant une fermeture (app/main.cjs:413-424, écart noté dans ADR 0007, Conséquences). (4) Chaque doublon fait 5 à 15 lignes : quatre tickets S ; le risque « élevé » ne vaut que pour asking-gate (le serveur y ajoute this.closing, ligne 295, le Mac un filtre par session, ligne 167) et pour l'ingestion. La dette est reconnue, pas voulue : ADR 0003 (Limites : « règle de cadence des questions dupliquée dans les deux hôtes ») et ADR 0007 (mutualisation de l'ouverture, de la reprise et de la sauvegarde des questions écartée pour une raison de périmètre).

<a id="CORE-02"></a>
#### CORE-02 — `HeadlessRuntime` classe-dieu

**Verdict : nuancé** · priorité P1 · effort L · risque moyen · Cœur et composition (`core/`, `runtime/`)

**Suite : pas de ticket.** Découpage de HeadlessRuntime. Premier temps : sortir les vues pures. Second temps : une phase explicite, après les extractions de cycle de vie. — _Reprise :_ Vues pures : dès jalon:format. Phase : après l'extraction de la queue d'ingestion

Constat d'origine :

- Emplacement : `runtime/headless-runtime.cjs:236-1143` (environ 52 méthodes, constructeur de 105 lignes).
- Preuve : huit rôles mêlés (vues et etag, admission des blocs, cycle de vie, questions, bibliothèque, façade surveillance, timers, réglage de langue). Les drapeaux `closing`, `ending`, `releasing`, `closed`, `savingLanguage` ne sont jamais initialisés (première écriture aux lignes 344, 850, 905, 1113, 1116). `server/http.cjs` lit `runtime.session` et `runtime.captureEpoch` directement.
- Impact : toute modification oblige à relire le fichier entier ; l'état n'est pas lisible depuis le constructeur.
- Remédiation : découpage en section 3 ; une `phase` explicite remplace `moving()`.
- E : L. R : moyen. T : `server-*`, `timeline-server`, `remote-server`. P : CORE-01.

- **Nuance du relecteur (elle prime) :** Chiffres exacts : classe 236-1143, 52 méthodes constructeur compris, constructeur 237-341 (105 lignes), premières écritures aux lignes 344, 850, 905, 1113, 1116 ; server/http.cjs lit runtime.session (83, 112, 130) et runtime.captureEpoch (12, 230, 233). Trois précisions. (1) ending (905) et closed (1116) ne sont pas des booléens mais des promesses mémorisées par ||= (coalescence de end() et de close()) : une « phase » ne remplace que closing et releasing, et doit garder ces deux mémorisations. (2) Le prérequis CORE-01 est trop fort : les vues et l'historique sont déjà des fonctions de module pures (lightPassage, lightJob, captureGapsOf, surveillanceHistory, surveillanceDetail, lignes 85-234) et s'extraient sans l'attendre ; seul le cycle de vie en dépend. (3) Contrainte non citée : tests/architecture-f07.test.cjs:578-590 exige, par regex sur le texte source, que runtime/headless-runtime.cjs contienne « closeSession({ » et « settleQuestions( » ; leave() doit rester dans ce fichier ou ce test doit être réécrit.
- **Risque du remède selon le relecteur :** Les tests atteignent runtime.session, .deep, .surveillance, .lastEnd et .admitted (environ 170 accès) et server/http.cjs lit session et captureEpoch : une façade qui déplace ces champs casse ces accès ; détecté par server-*, timeline-server, remote-server et le test de texte source architecture-f07:578.

<a id="CORE-04"></a>
#### CORE-04 — Doublures de test dans la composition de production

**Verdict : nuancé** · priorité P1 · effort M · risque moyen · Cœur et composition (`core/`, `runtime/`)

**Suite : pas de ticket.** Les doublures de test sont dans la composition de production. Il faut d'abord un banc Mac qui refuse une substitution perdue, et la décision D6 (simulateur smoke à deux voies, qui touche 16 fichiers de tests). — _Reprise :_ Après lot:L05 et la décision D6 du propriétaire

Constat d'origine :

- Emplacement : `runtime/session-runtime.cjs:56-60, 162-179, 190-202, 240-258` ; `core/session.cjs:58`.
- Preuve : quatre booléens (`smoke`, `liveInspection`, `localInspection`, `liveObservation`) plus `overrides`. Le faux `perception` n'offre que `observe` et `ask`, donc `splitPerception` est faux : le mode smoke passe par l'ancien `drain` (`session.cjs:228-256`), alors que `CodexPerception` a `transcribe` et `observeVisual`.
- Impact : le smoke Electron ne couvre pas les voies audio/vision de production ; 16 combinaisons de drapeaux.
- Remédiation : `adapters/simulated-perception.cjs` et `simulated-inspector.cjs` (comme `SimulatedSurveillanceAgent`), avec les deux voies ; un seul paramètre `providers`.
- E : M. R : moyen. T : smoke Electron (hors `npm test`), `session-optimization`.

- **Nuance du relecteur (elle prime) :** Preuve exacte, portée sous-estimée. Le faux perception (observe + ask, runtime/session-runtime.cjs:240-258) n'est pas réservé au smoke Electron : 16 fichiers de tests composent le runtime avec smoke: true (server-sessions, server-state-views, server-surveillance, server-ingest-path, architecture-f05/f06/f07/f10, session-durable, session-delete, disk-guard, remote-server, timeline-server, clip-unreadable, chat-instruction, review-regressions) et passent donc, sauf overrides.perception, par le drain hérité (core/session.cjs:228-256) que la production n'emprunte jamais. overrides est utilisé par une dizaine de sites dans 6 fichiers de tests et par scripts/replay-reinspection.cjs:150 : le paramètre unique « providers » doit les reprendre. Les 16 combinaisons sont théoriques : liveInspection et localInspection ne valent true que sous smoke (app/main.cjs:39-40). Tests protecteurs : ces 16 fichiers, pas seulement session-optimization. Effort M à L, risque élevé plutôt que moyen.
- **Risque du remède selon le relecteur :** Un simulateur à deux voies change la forme des passages publiés (audioStatus, visionStatus, états partial) et le nombre d'émissions et de sauvegardes par passage dans les 16 fichiers en smoke: true ; détecté par ces suites, avec un risque d'instabilité sur celles qui dépendent du temps réel (architecture-f06).

<a id="ADP-06"></a>
#### ADP-06 — `app/main.cjs` : une fermeture de 500 lignes

**Verdict : nuancé** · priorité P1 · effort L · risque moyen · Adaptateurs et frontières

**Suite : pas de ticket.** Le découpage d'app/main.cjs casse les substitutions du banc, qui dépendent du fichier appelant, et les assertions sur le texte de main.cjs. Il faut le faire après les extractions partagées, et sous un ADR de forme cible (D7). — _Reprise :_ Après lot:L05, les extractions de cycle de vie et la décision D7

Constat d'origine :

- Emplacement : `app/main.cjs:46-547`.
- Preuve : 27 variables mutables de module (`:31-36`), 49 canaux, 2 protocoles, 4 minuteries, doublures de test en ligne (`:130-138`, `:227-235` avec `'FAIL_TEST'`, `:296-301`), 15 drapeaux `--live-*`, consignes métier (`:489-494`), lignes jusqu'à 533 caractères.
- Remédiation : découpage du §4.
- Effort L, risque moyen. Tests : `mac-ipc-contract`, `mac-ui`. Prérequis : ADP-07, ADP-15.

- **Nuance du relecteur (elle prime) :** Exact : fermeture :46-547, 27 variables de module (:31-36), 49 canaux, 2 protocoles, doublures :130-138, :227-235, :296-301, consignes :489-494, ligne de 533 caractères (:269). Faux : il y a 7 drapeaux `--live-*` distincts pour 11 occurrences (16 lectures de process.argv au total), pas 15. Prérequis manquant, plus bloquant que ADP-15 : les trois doublures d'Electron des tests ne substituent sweepStaleContexts, DiskGuard et les runtimes que si le `require` vient de app/main.cjs (tests/mac-ipc-contract.test.cjs:173, architecture-f05.test.cjs:660, architecture-f07.test.cjs:257), et mac-ipc-contract.test.cjs:94-108 compare le texte de main.cjs (canaux par regex, `handle('verify:cancel', …)` au caractère près, nombre de `surveillance.stop(`). Portée : « toutes les doublures » ne tiennent pas dans app/ ; quatre autres vivent dans runtime/session-runtime.cjs:161-258.
- **Risque du remède selon le relecteur :** Après découpage, les tests balaieraient le vrai répertoire temporaire et mesureraient le vrai disque sans forcément échouer, puisque la substitution dépend du fichier appelant ; les assertions sur le texte de main.cjs (mac-ipc-contract.test.cjs:94-108) cassent, elles, tout de suite.

<a id="ADP-07"></a>
#### ADP-07 — Hôte Mac dupliquant `HeadlessRuntime`

**Verdict : nuancé** · priorité P1 · effort L · risque moyen · Adaptateurs et frontières

**Suite :** [T116](travail/tickets/116-pin-the-question-flag-warm-up-and-active-instruction-of-the.md) « Pin the question flag, warm-up and active instruction of the Mac host in tests » ; [T117](travail/tickets/117-pin-the-server-host-warm-up-at-start-and-resume-never-on-a.md) « Pin the server host warm-up at start and resume, never on a read-only open » ; [T118](travail/tickets/118-save-the-questions-of-both-hosts-through-one-shared.md) « Save the questions of both hosts through one shared checkpoint module » ; [T119](travail/tickets/119-warm-up-a-session-and-read-the-active-instruction-through.md) « Warm up a session and read the active instruction through shared functions ».

**Part laissée de côté :** Part restante : les transitions sérialisées (exclusive, dans les deux hôtes) et la queue commune de l'ingestion. L'ingestion dépend de la décision D1 : le Mac doit-il refuser un bloc pendant une fin ? — _Reprise :_ Transitions : après la porte asking. Ingestion : après la décision D1 du propriétaire

Constat d'origine :

- Preuve : sauvegarde des questions (`main:147-160` ≡ `headless:403-424`), liste des sessions (`314-325` / `925-976`), ingestion + disque plein (`413-424` / `778-809`), préchauffage (`408-409,460-461` / `644-649`), consigne active (`164` / `376-385`).
- Impact : tout correctif de cycle de vie est fait deux fois. L'ADR 0007 n'a mutualisé que la fermeture.
- Remédiation : extraire `runtime/session-host.cjs`, consommé par les deux hôtes.
- Effort L, risque moyen. Tests : `server-sessions`, `mac-ipc-contract`, `architecture-f06`.

- **Nuance du relecteur (elle prime) :** Les cinq doublons et leurs lignes sont exacts ; trois commentaires les reconnaissent (main.cjs:142, :312 ; headless-runtime.cjs:642). Précision de portée : l'ADR 0007 n'a écarté « mutualiser aussi ouverture, reprise, démarrage et sauvegarde des questions » que parce que la fiche se limitait à la fermeture, mais son point 7 garde par hôte l'ordre des étapes, la règle « session vide » et les gardes. La forme cible est donc celle de runtime/session-closing.cjs : des fonctions partagées paramétrées par chaque hôte (sauvegarde des questions, lignes de session, ingestion + disque plein, préchauffage, consigne active), pas un hôte unique. Tests omis : tests/architecture-f07.test.cjs:578-591 exige par regex que app/main.cjs et headless-runtime.cjs contiennent eux-mêmes `closeSession({` et `settleQuestions(` ; architecture-f05 et f07 lancent aussi l'hôte Mac.

<a id="ADP-09"></a>
#### ADP-09 — Réglages d'hôte dupliqués et dispersés

**Verdict : nuancé** · priorité P2 · effort M · Adaptateurs et frontières

**Suite : pas de ticket.** Réglages d'hôte communs. Dépend des décisions D2 (validation avec zod ou à la main) et D3 (TVLENS_MEDIA_RETENTION_MS=Infinity). Les messages restent mot pour mot (A5, A6). — _Reprise :_ Après les décisions D2 et D3 du propriétaire

Constat d'origine :

- Preuve : `app/main.cjs:58-71` et `server/main.cjs:9-21` font le même travail avec des défauts différents. `TVLENS_CHAT_REASONING_EFFORT` n'est pas validé (`server/main.cjs:29`). `process.env` est lu en paramètre par défaut dans des adaptateurs (`codex-session-client.cjs:107-108`, `companion-prompt.cjs:108`, `chat-trace.cjs:41`, `model-settings.cjs:20`, `codex-confinement.cjs:226,253`).
- Remédiation : un `readHostSettings(env)` unique, validé (zod), injecté par la composition.
- Effort M. Tests : `portable-config`, `mac-ipc-contract:451`.

- **Nuance du relecteur (elle prime) :** Double lecture exacte (app/main.cjs:58-71, server/main.cjs:9-21), mais « défauts différents » est faux : les seuils disque valent 1 Gio / 2 Gio des deux côtés (défauts de DiskGuard, disk-guard.cjs:34, côté Mac ; repli 1024/2048 Mo, server/main.cjs:20). Ce sont les règles qui divergent : le Mac accepte TVLENS_MEDIA_RETENTION_MS=Infinity (main.cjs:66-67), le serveur le refuse (server/main.cjs:18, vérifié par node -e) ; TVLENS_CHAT_REASONING_EFFORT et TVLENS_CODEX_BINARY ne sont lus que par le serveur. Seuls codex-session-client.cjs:107-108 et codex-confinement.cjs:218 lisent process.env en paramètre par défaut ; les autres le lisent dans le corps. Remédiation à restreindre : tests/codex-confinement.test.cjs:472 exige que `confinementMode` et `itemGuard` ne soient nommés que par le client (choix documenté en codex-session-client.cjs:101-102) ; les injecter par la composition revient sur cette décision et demande un ADR. Test omis : server-sessions.test.cjs:620-627 (forme et messages de settings()).
- **Risque du remède selon le relecteur :** Injecter confinementMode ou itemGuard casse l'invariant « nommés par le client seul », et remplacer les messages « Réglage X invalide » par ceux de zod casse les tests de réglages ; tests/codex-confinement.test.cjs:472, server-sessions.test.cjs:620-627 et mac-ipc-contract.test.cjs:451 le détectent.

<a id="CORE-19"></a>
#### CORE-19 — Configuration mutable partagée et chemins implicites

**Verdict : nuancé** · priorité P3 · effort S · risque faible · Cœur et composition (`core/`, `runtime/`)

**Suite : pas de ticket.** Réglage de langue muté dans options.config, défaut affiché « fr » alors que le défaut utilisé est « auto ». Risque de figer la langue à la création ; tests/transcription-language.test.cjs le détecte. Impact nul en production aujourd'hui. — _Reprise :_ Après le découpage de HeadlessRuntime (CORE-02)

Constat d'origine :

- Emplacement : `runtime/headless-runtime.cjs:283, 309, 347, 463, 568, 621` ; `runtime/session-runtime.cjs:145, 150-159`.
- Preuve : la langue est mutée dans `options.config`, puis lue paresseusement par le transcripteur. Défaut affiché « fr », défaut utilisé « auto ». Le chemin du modèle Whisper est dérivé du dossier du fichier de budget et de `process.cwd()`. `this.deep.now = …` est écrit après construction ; `...this.options` est passé en vrac aux fabriques.
- Remédiation : objet `TranscriptionSettings` injecté ; chemin résolu dans `adapters/config.cjs` ; paramètres explicites.
- E : S à M. R : faible.

- **Nuance du relecteur (elle prime) :** Faits exacts ; l'impact, donné comme supposé, est nul en production aujourd'hui. L'hôte serveur fixe toujours config.transcriptionLanguage au démarrage (server/main.cjs:33, défaut « fr » de adapters/transcription-settings.cjs), et l'hôte Mac ne le fixe jamais ni n'affiche cette valeur (transcription en « auto »). L'écart fr/auto n'apparaît qu'avec config: {} (tests, smoke). La lecture paresseuse getLanguage (runtime/session-runtime.cjs:145) est voulue : un changement de langue s'applique sans recréer la session.
- **Risque du remède selon le relecteur :** Remplacer la mutation de config par un objet injecté peut figer la langue à la création de la session ; détecté par transcription-language.test.

<a id="OUBLI-03"></a>
#### OUBLI-03 — Le binaire Codex est résolu différemment selon l'hôte

**Verdict : nuancé** · Signalement du relecteur — Adaptateurs et frontières

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Résolution commune du binaire Codex. Dépend de la décision D4 (ordre de recherche, TVLENS_CODEX_BINARY côté Mac) et de D5 (confinementMode et itemGuard : recommandation de ne pas les injecter). — _Reprise :_ Après la décision D4 du propriétaire

- **Signalement :** app/main.cjs:553-557 (findCodex) refait adapters/system-paths.cjs:6-19 (executable) avec un autre ordre de recherche et sans TVLENS_CODEX_BINARY, que seul server/main.cjs:39 honore : le même binaire est résolu différemment selon l'hôte.

<a id="OUBLI-07"></a>
#### OUBLI-07 — Logique d'hôte dupliquée non listée dans CORE-01

**Verdict : nuancé** · Signalement du relecteur — Cœur et composition (`core/`, `runtime/`)

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Il faut d'abord un test qui compare la ligne « en cours » des deux hôtes, champ par champ ; les écarts (titre, createdAt, pagination) sont à arbitrer par ce test. La garde disque par défaut construite deux fois est extractible seule. — _Reprise :_ Garde disque : dès jalon:format. Lignes de session : quand le test de comparaison existe

- **Signalement :** Logique d'hôte dupliquée non listée dans CORE-01 : liste des sessions et ligne « live » (runtime/headless-runtime.cjs:925-976 contre app/main.cjs:314-325, commenté « Same shape as the server host »), description de la session courante (headless 607-617 contre main.cjs:323), garde disque par défaut construite deux fois (headless 272-277 et runtime/session-runtime.cjs:100-105), libellé rolling / until-deleted dérivé à quatre endroits (core/session.cjs:480, headless 612-613, main.cjs:255 et 323).

<a id="OUBLI-10"></a>
#### OUBLI-10 — Minuteries non injectées dans runtime/

**Verdict : confirmé** · Signalement du relecteur — Cœur et composition (`core/`, `runtime/`)

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T118](travail/tickets/118-save-the-questions-of-both-hosts-through-one-shared.md) « Save the questions of both hosts through one shared checkpoint module ».

**Part laissée de côté :** Part restante : les setInterval du constructeur de HeadlessRuntime. Le délai de sauvegarde des questions est traité par L11-03. — _Reprise :_ Après le premier temps du découpage de HeadlessRuntime (CORE-02)

- **Signalement :** Minuteries non injectées dans runtime/ : HeadlessRuntime pose setInterval dans son constructeur (runtime/headless-runtime.cjs:326 et 334) et setTimeout pour le checkpoint (409, CHECKPOINT_MS non réglable) ; seuls wallClock et preparationWaitMs sont injectables. CORE-13 ne traite que core/. Effet sur la durée et la stabilité des tests d'hôte : supposé, non mesuré.

### L12 — Un cœur aux responsabilités séparées

Vague 2 · 14 constats · 4 tickets · fiche de chantier : [coeur.md](travail/fiches/coeur.md)

- [T120](travail/tickets/120-pin-the-pure-detection-source-and-card-text-rules-of.md) — Pin the pure detection, source and card text rules of surveillance in tests
- [T121](travail/tickets/121-revoke-the-inspector-of-a-closed-session-through-a-core.md) — Revoke the inspector of a closed session through a core decorator
- [T122](travail/tickets/122-decide-whether-an-answer-is-backed-by-its-evidence-in-one.md) — Decide whether an answer is backed by its evidence in one pure core function
- [T123](travail/tickets/123-let-a-watch-session-raise-its-own-ending-and-close-its.md) — Let a watch session raise its own ending and close its intake

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [CORE-03](#CORE-03) | `createSessionRuntime`, fonction de 520 lignes | confirmé | P1 | [T121](travail/tickets/121-revoke-the-inspector-of-a-closed-session-through-a-core.md) |
| [CORE-06](#CORE-06) | Machine à états implicite de `WatchSession` | nuancé | P2 | [T123](travail/tickets/123-let-a-watch-session-raise-its-own-ending-and-close-its.md) |
| [CORE-07](#CORE-07) | `core/surveillance.cjs`, six responsabilités | nuancé | P2 | [T120](travail/tickets/120-pin-the-pure-detection-source-and-card-text-rules-of.md) |
| [CORE-08](#CORE-08) | Snapshot = état publié = format disque = contrat réseau | confirmé | P2 | pas de ticket |
| [CORE-09](#CORE-09) | `ports.cjs` décoratif et divergent | nuancé | P2 | pas de ticket |
| [CORE-12](#CORE-12) | `createSurveillanceRuntime`, fermeture à 15 variables d'état | confirmé | P2 | pas de ticket |
| [CORE-13](#CORE-13) | `DeepAsk.run` et modèles de temps hétérogènes | nuancé | P2 | [T122](travail/tickets/122-decide-whether-an-answer-is-backed-by-its-evidence-in-one.md) |
| [CORE-16](#CORE-16) | Vocabulaire et utilitaires recopiés | confirmé | P2 | pas de ticket |
| [CORE-14](#CORE-14) | `VideoTools.invoke`, dispatch par `if` et limites en double | confirmé | P3 | pas de ticket |
| [CORE-15](#CORE-15) | Présentation dans le domaine, et persistée | nuancé | P3 | pas de ticket |
| [CORE-18](#CORE-18) | Constantes magiques dispersées | nuancé | P3 | pas de ticket |
| [CORE-20](#CORE-20) | Publication par snapshot complet | nuancé | P3 | pas de ticket |
| [CORE-21](#CORE-21) | Nommage | confirmé | P3 | pas de ticket |
| [OUBLI-08](#OUBLI-08) | Fonctions au-delà des seuils du projet | nuancé | — | pas de ticket |

<a id="CORE-03"></a>
#### CORE-03 — `createSessionRuntime`, fonction de 520 lignes

**Verdict : confirmé** · priorité P1 · effort M · risque moyen · Cœur et composition (`core/`, `runtime/`)

**Suite :** [T121](travail/tickets/121-revoke-the-inspector-of-a-closed-session-through-a-core.md) « Revoke the inspector of a closed session through a core decorator ».

**Part laissée de côté :** What remains after L12-02: extract recordManifest into runtime/session-manifest.cjs, turn the storage() figures into a pure function, and move the test doubles (161-208, 237-270) out of createSessionRuntime. The manifest is an on-disk form, and lot L11 (segment-intake) moves validateSegment. — _Reprise :_ L12-02 intégré et jalon:archive-reference posé (fiche, étape 8)

Constat d'origine :

- Emplacement : `runtime/session-runtime.cjs:48-568`.
- Preuve : validation de configuration, câblage de 12 adaptateurs, doublures de test, monkey-patch de `inspector.inspect` (214-232), chiffres de stockage (283-309), écriture du manifeste (337-382), `close/archive/seal` (478-565). L'objet rendu expose 12 internes, que les hôtes mutent (`main.cjs:403` écrit `runtime.store.manifest`).
- Impact : pas de test unitaire possible du manifeste ou de la révocation sans monter toute la session.
- Remédiation : section 3 ; `RevocableInspector` devient un décorateur de `core/` avec `revoke()`, sur le modèle de `CachedInspector`.
- E : M à L. R : moyen. T : `session-durable`, `architecture-f05`, `session-delete`, `disk-guard`.

<a id="CORE-06"></a>
#### CORE-06 — Machine à états implicite de `WatchSession`

**Verdict : nuancé** · priorité P2 · effort M · risque élevé · Cœur et composition (`core/`, `runtime/`)

**Suite :** [T123](travail/tickets/123-let-a-watch-session-raise-its-own-ending-and-close-its.md) « Let a watch session raise its own ending and close its intake ».

**Part laissée de côté :** What remains after L12-04, in three parts. (a) The asking writes in app/main.cjs:167 and headless-runtime.cjs:290-300 go through the shared asking gate created by lot L11, which must call a WatchSession method; the architecture guard is then extended to asking. (b) The 24 assignments in 6 test files and in scripts/simulate-stream.cjs:312 move to the methods. (c) The two axes, capture and cycle, are exposed for reading. — _Reprise :_ (a) once lot L11's asking gate is integrated; (b) after (a) and the wave-1 renaming of the architecture-f0x files; (c) publication only after step 9 (fiche, étapes 5 et 6)

Constat d'origine :

- Emplacement : `core/session.cjs:52-72, 76-77` ; écritures externes en `runtime/session-runtime.cjs:489-495`, `runtime/session-closing.cjs:73`, `runtime/headless-runtime.cjs:297`, `app/main.cjs:167`.
- Preuve : dix drapeaux (`accepting`, `closed`, `ending`, `readOnly`, `asking`, `running`, `audioRunning`, `visionRunning`, `storageError`, `saveError`). `asking` est surchargé : `close()` le met à `true` pour bloquer la perception, alors que son setter alimente la métrique `visionBlockedMs`.
- Impact : les combinaisons valides ne sont écrites nulle part ; chaque garde les réénumère (`retriesVision`, ligne 301).
- Remédiation : `phase` (`capturing | paused | read-only | ending | closed`) et méthodes `beginEnding()`, `holdVision(reason)` ; plus d'écriture externe.
- E : M. R : élevé. T : `session-durable`, `split-perception`, `session-latency` (qui touchent aux internes).

- **Nuance du relecteur (elle prime) :** Les dix drapeaux et les écritures externes sont exacts. Trois précisions. (1) C'est runtime.close() (runtime/session-runtime.cjs:489), non WatchSession.close(), qui force asking à true. (2) S'ajoutent aux écritures externes 24 affectations « watch.asking = » dans 6 fichiers de tests (session-latency 12, split-perception 5, architecture-f08 4, question-ceiling 1, session-timeline 1, timeline-server 1) et scripts/simulate-stream.cjs:312. (3) La cible « phase » à cinq valeurs exclusives ne décrit pas l'état réel : ending coexiste avec accepting (closeSession lève ending avant l'étape capture, et un bloc est encore stocké pendant la fin : tests/session-durable.test.cjs:539-560), readOnly coexiste avec ending, et asking, storageError et saveError sont orthogonaux. Forme cible à retenir : deux axes (capture : capturing | paused | read-only ; cycle : open | ending | closed), plus holdVision(reason) et beginEnding().

<a id="CORE-07"></a>
#### CORE-07 — `core/surveillance.cjs`, six responsabilités

**Verdict : nuancé** · priorité P2 · effort L · risque moyen · Cœur et composition (`core/`, `runtime/`)

**Suite :** [T120](travail/tickets/120-pin-the-pure-detection-source-and-card-text-rules-of.md) « Pin the pure detection, source and card text rules of surveillance in tests ».

**Part laissée de côté :** The split of core/surveillance.cjs into flat files (surveillance-text, -detection, -verdicts, -projection) depends on L12-01 and on formatting. The first split ticket must extend the guard of tests/surveillance.test.cjs, which reads the source and refuses asking|manualBusy|prioritizeManual|deep-ask, to every core/surveillance*.cjs file. — _Reprise :_ L12-01 intégré et jalon:format posé ; projection après l'étape 9 si elle touche la forme sauvegardée (fiche, étape 7)

Constat d'origine :

- Emplacement : `snapshot` 826-909 (84 lignes denses), `settleDetection` 619-685, `settleLot` 760-814, `restore` 518-563.
- Preuve : déduplication, validation de détection, verdicts, rédaction des cartes, ordonnancement et registre, projections et restauration dans un seul fichier. `snapshot()` calcule couverture, retard, libellés et trois formes (compacte, brève, sauvegardée).
- Impact : un changement de libellé touche la même fonction que le format disque.
- Remédiation : section 3.
- E : L. R : moyen (les fonctions pures sont déjà exportées). T : `surveillance.test` (874 lignes).

- **Nuance du relecteur (elle prime) :** Lignes et responsabilités exactes (snapshot 826-909, settleDetection 619-685, settleLot 760-814, restore 518-563). La forme cible « dossier core/surveillance/ » n'est pas faisable telle quelle : tests/architecture.test.cjs:7-10 lit core/ à plat (readFileSync sur chaque entrée, donc EISDIR sur un sous-dossier) et refuse tout require contenant « .. », ce qui interdit à un fichier du sous-dossier d'importer ../passage-text.cjs ou ../ports.cjs. Prérequis manquant : rendre cette garde récursive, ou garder des fichiers à plat (core/surveillance-*.cjs). core/surveillance.cjs doit rester le point d'entrée : il est importé par runtime/headless-runtime.cjs:5, runtime/surveillance-runtime.cjs:1, scripts/probe-surveillance.cjs:13 et deux tests. validateDetection, composeSignalText et acceptableText sont exportées mais n'apparaissent dans aucun test (0 occurrence dans tests/) : elles ne sont couvertes qu'à travers la classe, contrairement à ce que dit la section 4.

<a id="CORE-08"></a>
#### CORE-08 — Snapshot = état publié = format disque = contrat réseau

**Verdict : confirmé** · priorité P2 · effort L · risque élevé · Cœur et composition (`core/`, `runtime/`)

**Suite : pas de ticket.** Versioned toArchive/fromArchive, separate from snapshot(), with the current form read as version 0. This changes the on-disk form, so it needs an ADR and an owner decision on the version field (D8). Lot L17 already names the surveillance registry version. — _Reprise :_ jalon:archive-reference posé, décision D8 prise, ticket de version du registre du lot L17 intégré (fiche, étape 9)

Constat d'origine :

- Emplacement : `core/session.cjs:431, 501` ; `core/surveillance.cjs:547, 905-907` ; `core/deep-ask.cjs:25`.
- Preuve : `archive.save(this.snapshot())`. Seule la surveillance porte `version: 1`. L'ancien format est deviné par `saved.retention === undefined`. La forme d'un passage (une trentaine de champs optionnels) n'est déclarée nulle part.
- Impact : renommer un champ casse à la fois les archives, la TV et le renderer.
- Remédiation : `core/passage.cjs` (typedef et prédicats) ; `toArchive()` et `fromArchive()` versionnés par agrégat, distincts de `snapshot()`.
- E : L. R : élevé. T : `session-durable`, `deep-ask-restore`, `server-state-views`.

- **Risque du remède selon le relecteur :** Les archives déjà sur disque n'ont pas de version et doivent rester lisibles (fromArchive doit accepter la forme actuelle comme version 0), et des tests lisent session.json directement ; détecté par session-durable (lecture du fichier ligne 559), deep-ask-restore, mac-ipc-contract et server-state-views.

<a id="CORE-09"></a>
#### CORE-09 — `ports.cjs` décoratif et divergent

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Cœur et composition (`core/`, `runtime/`)

**Suite : pas de ticket.** ports.cjs as the single source, then @ts-check. The reviewer splits this in two: the single source first (no tooling), then @ts-check file by file once TypeScript is installed (installe: oui + ADR). The 13 constructors written with Object.assign would produce a wall of errors. — _Reprise :_ décision D6 du propriétaire (installation de TypeScript) ; source unique des ports après l'étape 7 (fiche, étape 14)

Constat d'origine :

- Emplacement : `core/ports.cjs:21, 54, 88, 98` ; `core/surveillance.cjs:9, 16`.
- Preuve : deux références JSDoc dans tout le dépôt. `ClaimDetectionPort` n'y a pas `maxClaims`, présent dans `surveillance.cjs`. `VideoAgentPort` et `AnswerPort` ne sont référencés nulle part.
- Ports implicites non déclarés : méthodes du store (`saveManifest`, `saveResearch`, `saveSurveillance`, `loadSurveillance`, `flush`, `seal`, `adopt`, `clearRaw`, `confirmed`), `thumbnails`, garde disque, `library.dir/folder/root`, `agent.prepare`, contrat `tools` lu par `DeepAsk`. `transcribe` et `observeVisual` n'existent qu'en prose.
- Impact : le contrat réel se lit dans les appelants ; `surveillance-runtime` teste `typeof store?.saveSurveillance` (122, 182, 439).
- Remédiation : source unique, plus `SessionStorePort`, `ThumbnailPort`, `DiskGuardPort`, `QuestionToolsPort` ; `// @ts-check` sur `core/` et `runtime/`.
- E : M. R : faible. P : outillage de typage.

- **Nuance du relecteur (elle prime) :** Preuve exacte : deux import('./ports.cjs') seulement (core/verification.cjs:10, core/surveillance.cjs:19), maxClaims absent de core/ports.cjs:88, VideoAgentPort et AnswerPort sans aucune référence ; runtime/surveillance-runtime.cjs:122 et 182 testent saveSurveillance, la ligne 439 teste loadSurveillance. L'effort M est sous-estimé pour « // @ts-check sur core/ et runtime/ » : 13 constructeurs de core/ posent leurs champs par Object.assign(this, {...}) (session.cjs:51, deep-ask.cjs:19, surveillance.cjs:365 et 373, living-recap.cjs:13…), forme que le contrôle de types ne suit pas, donc chaque this.x serait signalé (supposé : TypeScript est absent de node_modules, rien n'a été exécuté). À découper : d'abord ports.cjs en source unique avec les ports manquants (S à M, sans outillage), puis @ts-check fichier par fichier une fois l'outil installé.
- **Risque du remède selon le relecteur :** Activer @ts-check d'un bloc produit un mur d'erreurs qui pousse à des @ts-ignore ou à réécrire les constructeurs ; détecté par le contrôle de types lui-même, la suite restant verte puisque rien ne change à l'exécution.

<a id="CORE-12"></a>
#### CORE-12 — `createSurveillanceRuntime`, fermeture à 15 variables d'état

**Verdict : confirmé** · priorité P2 · effort L · risque élevé · Cœur et composition (`core/`, `runtime/`)

**Suite : pas de ticket.** Split createSurveillanceRuntime into RegistryPersistence and RegistryAdoption. High risk: epoch, bound and unreadable are shared, and the tests depend on timing. — _Reprise :_ étape 7 intégrée et aides de test du lot L05 disponibles (lot:L05) (fiche, étape 10)

Constat d'origine :

- Emplacement : `runtime/surveillance-runtime.cjs:74-101, 106-134, 337-372, 415-476`.
- Preuve : `store, bound, epoch, dirty, muted, hushed, released, lastSaveAt, adopting, unreadable, overdue, failing, toldAs, writing, releasing` ; statut dérivé par un ternaire à six niveaux. `restorable()` construit une `Surveillance` jetable (320-331).
- Impact : aucune transition n'est nommée ; l'extension demande de relire les 500 lignes.
- Remédiation : `RegistryPersistence` (liaison, époque, écriture cadencée) et `RegistryAdoption` (états `idle | reading | overdue | unreadable`), sous une façade mince.
- E : L. R : élevé. T : `surveillance-runtime.test` (834 lignes), `server-surveillance`.

- **Risque du remède selon le relecteur :** Persistance et adoption partagent epoch, bound et unreadable (write() refuse pendant une lecture, unbind() remet tout à zéro) : deux objets mal synchronisés réécriraient un registre qui n'a pas été lu ; détecté par surveillance-runtime.test (834 lignes) et server-surveillance.

<a id="CORE-13"></a>
#### CORE-13 — `DeepAsk.run` et modèles de temps hétérogènes

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Cœur et composition (`core/`, `runtime/`)

**Suite :** [T122](travail/tickets/122-decide-whether-an-answer-is-backed-by-its-evidence-in-one.md) « Decide whether an answer is backed by its evidence in one pure core function ».

**Part laissée de côté :** What remains after L12-03: inject { now, setTimer, clearTimer } into DeepAsk and LivingRecap, add jobMetrics(job), and extend the architecture guard to setTimeout. The composition must first supply the default values now set in moment-index.cjs:22 and moment-search.cjs:26. Lot L09 removes needsInspection. — _Reprise :_ aide d'horloge du lot L05 disponible (lot:L05) et L12-03 intégré (fiche, étape 11)

Constat d'origine :

- Emplacement : `core/deep-ask.cjs:77-158` (ligne 133 de 697 caractères), `81, 87` ; `core/living-recap.cjs:107` ; `core/saved-moments.cjs:9`.
- Preuve : file, plafond, aperçu, limites, validation des citations, métriques et traces dans une fonction. `setTimeout` global non injectable, alors que `MomentIndex` injecte ses timers et que `Surveillance` avance par `tick()`.
- Impact : la règle « réponse valide ou non » n'est pas testable seule ; le plafond de 5 minutes ne se teste qu'en l'abaissant.
- Remédiation : `core/answer-validation.cjs` (fonction pure), `jobMetrics(job)` ; `{now, setTimer, clearTimer}` injectés ; étendre `architecture.test` à `setTimeout`.
- E : M. R : moyen. T : `chat-sources`, `question-ceiling`, `evidence-refresh`.

- **Nuance du relecteur (elle prime) :** Lignes exactes : run 77-158, ligne 133 de 697 caractères, setTimeout aux lignes 81 et 87, core/living-recap.cjs:107 ; core/saved-moments.cjs:9 est un AbortSignal.timeout(15000), pas un setTimeout. Étendre tests/architecture.test.cjs à setTimeout échouerait tel quel sur les valeurs par défaut d'injection de core/moment-index.cjs:22 et core/moment-search.cjs:26, que runtime/session-runtime.cjs:133-141 ne remplace pas : il faut d'abord que la composition passe ses minuteries, ou exempter ces défauts. needsInspection (core/deep-ask.cjs:2-4, exportée ligne 174) n'a aucun appelant dans le dépôt : à supprimer dans le même ticket.

<a id="CORE-16"></a>
#### CORE-16 — Vocabulaire et utilitaires recopiés

**Verdict : confirmé** · priorité P2 · effort M · risque faible à moyen · Cœur et composition (`core/`, `runtime/`)

**Suite : pas de ticket.** The two copies are not equivalent. The surveillance fold also folds œ and æ, and the 1000 ms threshold tests subject adjacency rather than computing a gap. Unifying them would change claim deduplication and card grouping. Owner decisions D1 (250 vs 1000 ms) and D2 (fold) come first. — _Reprise :_ décisions D1 et D2 prises (fiche, étape 12)

Constat d'origine :

- Listes de statuts littérales dans 5 fichiers de `core/` (`['queued','analyzing']` ×6, `['error','skipped','expired']` ×5).
- Repli d'accents ×7 (`session.cjs:513, 526, 531`, `deep-ask:171`, `moment-search:4`, `session-timeline:3`, `surveillance:80`).
- Trou de capture calculé à 5 endroits, avec deux seuils : 250 ms (`video-tools:108`, `living-recap:67`) contre 1000 ms (`headless:141`, `session-timeline:24`, `perception-context:37`).
- Paires identiques : `sourceKey` et `pageKey` ; `stamp` et `clock` ; `ordinal` et `number` ; `said` et `closing`.
- Remédiation : `core/passage.cjs`, `core/text.cjs`, `core/coverage.cjs` (`gapsOf(passages, toleranceMs)`), `core/url.cjs`.
- E : M. R : faible à moyen. L'écart 250/1000 est-il voulu ? Non vérifié.

- **Risque du remède selon le relecteur :** Les copies ne sont pas identiques : le fold de core/surveillance.cjs:80 replie aussi œ et æ, et le seuil de 1000 ms de session-timeline.cjs:24 et perception-context.cjs:26-55 est un test d'adjacence de sujets, pas un calcul de trous ; unifier change la déduplication des affirmations ou le regroupement en cartes, détecté par surveillance.test, session-timeline, perception-context et living-recap.

<a id="CORE-14"></a>
#### CORE-14 — `VideoTools.invoke`, dispatch par `if` et limites en double

**Verdict : confirmé** · priorité P3 · effort M · risque moyen · Cœur et composition (`core/`, `runtime/`)

**Suite : pas de ticket.** P3. The tool descriptions are text sent to the model. Generating them from the constants changes their wording, and no test would detect it, so it needs an owner decision (D4). Lot L08 pins the limits first. — _Reprise :_ décision D4 et tickets de bornes du lot L08 intégrés (fiche, étape 15)

Constat d'origine :

- Emplacement : `core/video-tools.cjs:50, 126-191` (128, 146, 152, 154) ; `core/video-tool-contracts.cjs:17, 28`.
- Preuve : 8 appels, 60 s, 20 s et 4 segments, 2 inspections, 400 entrées de journal sont codés en dur, et répétés en prose dans les descriptions d'outils.
- Remédiation : registre `{name, schema, limits, run}` ; descriptions générées depuis les constantes.
- E : M. R : moyen. T : `refactor-boundaries`, `video-research`, `reinspection-transcript-reuse`.

- **Risque du remède selon le relecteur :** Les descriptions d'outils sont du texte envoyé au modèle : les générer depuis les constantes peut en changer la formulation, et un registre peut déplacer la validation d'intervalle commune à deux outils ; détecté par refactor-boundaries, video-research et reinspection-transcript-reuse, mais pas l'effet sur le modèle.

<a id="CORE-15"></a>
#### CORE-15 — Présentation dans le domaine, et persistée

**Verdict : nuancé** · priorité P3 · effort M · risque moyen · Cœur et composition (`core/`, `runtime/`)

**Suite : pas de ticket.** Arbitrage A6 : pas de déplacement de la rédaction française ; selon le relecteur, remark() se recalcule déjà à la projection et le gain est limité (produit en français seulement). — _Reprise :_ décision D7 du propriétaire, si elle lève l'arbitrage A6

Constat d'origine :

- Emplacement : `core/surveillance.cjs:207-215, 637, 674, 860-870, 907` ; `runtime/headless-runtime.cjs:5, 172`.
- Preuve : `remark()` rédige une phrase française stockée dans `entry.reason`, puis sauvegardée dans le registre. Les libellés d'activité sont construits dans `snapshot()`. Le message français est la seule identité de la plupart des erreurs.
- Impact : changer un libellé change des données sur disque et l'égalité d'état.
- Remédiation : stocker `{code, counts}` ; rédaction dans `core/surveillance-wording.cjs` à la projection, avec lecture tolérante des anciens `reason`.
- E : M. R : moyen.

- **Nuance du relecteur (elle prime) :** Lignes exactes. La remédiation est plus large que nécessaire : remark() (207-215) est une fonction pure de champs déjà sauvegardés à la ligne 907 (rejected, overflow, truncated, split, rescanError) ; le reason des passages lus se recalcule donc à la projection sans nouveau format {code, counts}. Les seuls textes réellement stockés sans donnée source sont le motif « unscannable » de classify() (ligne 472, dont le status d'origine est retiré de la forme sauvegardée) et claim.reason (lignes 248, 267, 723). Le produit est en français uniquement (consigne du dépôt) : gain limité.
- **Risque du remède selon le relecteur :** Une lecture tolérante des anciens reason ajoute un chemin de compatibilité de plus, et les clients Mac et TV affichent ces chaînes telles quelles ; détecté par surveillance.test, surveillance-runtime.test et tv-overlay-queue.

<a id="CORE-18"></a>
#### CORE-18 — Constantes magiques dispersées

**Verdict : nuancé** · priorité P3 · effort S · risque faible · Cœur et composition (`core/`, `runtime/`)

**Suite : pas de ticket.** The scope goes beyond core/ and runtime/ (QUESTION_QUEUE_LIMIT in app/main.cjs, adapters/remote-media.cjs, mcp/tool-definitions.cjs), so it needs owner decision D3. Merging the two timestamp validations can change the message, and lot L11 moves validateSegment. — _Reprise :_ décision D3, tickets de bornes du lot L08 intégrés et module d'ingestion du lot L11 intégré (fiche, étape 13)

Constat d'origine :

- Emplacement : `runtime/session-runtime.cjs:597-631` (3000, 20000000, 2100000, 8, 1000000, ±100) ; seconde validation d'horodatage en `core/session.cjs:85` (60000) ; `+3000` en `headless:816` ; `deep-ask:57, 93, 163` ; `surveillance:254-260, 399`.
- Remédiation : `core/limits.cjs` (`CAPTURE_LIMITS`, `QUESTION_LIMITS`) et une seule `validateCapturedSegment`.
- E : S. R : faible.

- **Nuance du relecteur (elle prime) :** Emplacements exacts ; la portée dépasse core/ et runtime/. La file de 5 questions est un littéral à core/deep-ask.cjs:57 et une constante distincte à app/main.cjs:30 (QUESTION_QUEUE_LIMIT, publiée au renderer ligne 255) ; 2100000 est répété dans adapters/remote-media.cjs:36 ; la borne de 2000 caractères figure dans 5 fichiers de core/ et dans mcp/tool-definitions.cjs:6 ; 1500 caractères de consigne à core/surveillance.cjs:399 et core/deep-ask.cjs:113. core/limits.cjs doit être la source que ces fichiers importent.
- **Risque du remède selon le relecteur :** Fusionner les deux validations d'horodatage peut changer le message rendu (« Horodatage invalide. » contre « Horodatage de capture invalide. ») ou l'ordre des refus ; détecté par server-ingest-path et session-latency.

<a id="CORE-20"></a>
#### CORE-20 — Publication par snapshot complet

**Verdict : nuancé** · priorité P3 · effort M · risque moyen · Cœur et composition (`core/`, `runtime/`)

**Suite : pas de ticket.** Correction du relecteur : coût de calcul négligeable (0,8 ms à 2 h) ; c'est la taille sérialisée qui croît, et la remédiation n'est pas une forme cible précise et change le contrat de publication. À mesurer sur le Mac avant d'en faire un ticket. — _Reprise :_ mesure sur le Mac (décision D5) après l'étape 9

Constat d'origine :

- Emplacement : `core/session.cjs:477-494` (19 appels à `emit`) ; `core/surveillance.cjs:911-916` ; `core/living-recap.cjs` (`emit`).
- Preuve : chaque événement recopie tous les passages et, côté surveillance, sérialise l'état en JSON pour détecter un changement. En rétention infinie, `segments` ne se vide jamais.
- Impact : c'est ce qui impose `derive()` et les vues allégées dans `HeadlessRuntime`.
- Remédiation : compteur de révision par agrégat et projections à la demande.
- E : M à L. R : moyen. P : CORE-08.

- **Nuance du relecteur (elle prime) :** Les 19 appels à emit et la copie par snapshot sont exacts, mais le coût de calcul est négligeable. Mesure ponctuelle (node -e sur la copie figée, passages synthétiques de taille réaliste) : snapshot() prend 0,8 ms pour 900 passages (2 h) et 2,2 ms pour 2 700 (6 h) ; un tick de surveillance, 0,2 ms. Ce qui croît est la taille sérialisée, 2,4 Mo à 2 h, payée à chaque persist() (session.json réécrit en entier, limite déjà notée dans ADR 0003) et à chaque envoi IPC watch:state du Mac (app/main.cjs:306). La remédiation « compteur de révision et projections à la demande » n'est pas une forme cible précise et change le contrat de publication (renderer, surveillance.observe, recap.observe, index) : à mesurer sur le Mac avant d'en faire un ticket.
- **Risque du remède selon le relecteur :** Passer d'un état poussé à des projections tirées casse le contrat IPC du renderer et les observateurs qui reçoivent l'état complet ; détecté par mac-ipc-contract, mac-ui, server-state-views et surveillance-runtime.

<a id="CORE-21"></a>
#### CORE-21 — Nommage

**Verdict : confirmé** · priorité P3 · effort S · risque faible · Cœur et composition (`core/`, `runtime/`)

**Suite : pas de ticket.** The remediation asks to rename at each extraction, with no dedicated ticket. The renames of closing/adopt and of the told/unread series go with the tickets of steps 7, 8 and 10. — _Reprise :_ à chaque extraction des étapes 7, 8 et 10

Constat d'origine :

- « closing » désigne trois choses : une fabrique de 503 (`headless:73`), un drapeau d'hôte (`headless:1113`), un exécuteur d'étape (`session-runtime:324`).
- `adopt` a quatre sens (`headless:630`, `session-runtime:414`, `surveillance:564`, `surveillance-runtime:377`).
- Série opaque `told / unread / outwaited / answered / awaited / drop / expire`.
- Passage en style dense dans un fichier formaté (`headless:342-351`).
- Remédiation : renommer à chaque extraction, sans ticket dédié.
- E : S. R : faible.

- **Risque du remède selon le relecteur :** Un renommage touche des noms que les tests et app/main.cjs atteignent (adopt, closing) ; détecté par la suite, sans risque propre s'il accompagne chaque extraction.

<a id="OUBLI-08"></a>
#### OUBLI-08 — Fonctions au-delà des seuils du projet

**Verdict : nuancé** · Signalement du relecteur — Cœur et composition (`core/`, `runtime/`)

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Function bounds confirmed in the code: perceptionContext 9-67, MomentSearch.search 48, LivingRecap.observe 47-72 and tick 88-~125, VerificationService.verify 17, closeSession 53-133. The complexity values cannot be measured without ESLint, which is not installed. — _Reprise :_ jalon:lint posé (complexité mesurée par l'outil), puis un ticket par fonction

- **Signalement :** Fonctions au-delà des seuils du projet (complexité 15, 80 lignes) sans aucun constat, d'après ESLint sur FMT : perceptionContext (core/perception-context.cjs:9-67, complexité 35), MomentSearch.search (core/moment-search.cjs:48, 29), LivingRecap.observe et tick (core/living-recap.cjs:47-72 et 88-125, 26 et 113 lignes formatées), VerificationService.verify (core/verification.cjs:17, 24), et closeSession (runtime/session-closing.cjs:53-133, 24), pourtant donné comme modèle des extractions.

### L13 — Des adaptateurs Codex lisibles

Vague 2 · 5 constats · 3 tickets · fiche de chantier : [adaptateurs-codex.md](travail/fiches/adaptateurs-codex.md)

- [T124](travail/tickets/124-put-a-stable-code-on-every-codex-and-local-vision-error-a.md) — Put a stable code on every Codex and local vision error a retry reads
- [T125](travail/tickets/125-decide-description-retries-and-verifier-failures-on-error.md) — Decide description retries and verifier failures on error codes, not wording _(demande un ADR)_
- [T126](travail/tickets/126-keep-the-key-of-a-cited-page-in-one-pure-core-module.md) — Keep the key of a cited page in one pure core module

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [ADP-04](#ADP-04) | Politique de reprise couplée au texte des erreurs | nuancé | P2 | [T124](travail/tickets/124-put-a-stable-code-on-every-codex-and-local-vision-error-a.md), [T125](travail/tickets/125-decide-description-retries-and-verifier-failures-on-error.md) |
| [ADP-08](#ADP-08) | `codex-session-client.cjs` : six responsabilités | confirmé | P2 | pas de ticket |
| [ADP-10](#ADP-10) | Validation sans couche ni schéma | nuancé | P2 | pas de ticket |
| [ADP-12](#ADP-12) | Duplication entre adaptateurs Codex | confirmé | P2 | [T126](travail/tickets/126-keep-the-key-of-a-cited-page-in-one-pure-core-module.md) |
| [ADP-13](#ADP-13) | Logique métier dans les adaptateurs | nuancé | P3 | pas de ticket |

<a id="ADP-04"></a>
#### ADP-04 — Politique de reprise couplée au texte des erreurs

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Adaptateurs et frontières

**Suite :** [T124](travail/tickets/124-put-a-stable-code-on-every-codex-and-local-vision-error-a.md) « Put a stable code on every Codex and local vision error a retry reads » ; [T125](travail/tickets/125-decide-description-retries-and-verifier-failures-on-error.md) « Decide description retries and verifier failures on error codes, not wording ».

Constat d'origine :

- Emplacement : `adapters/codex-perception.cjs:23-41`, `adapters/codex-verifier.cjs:36-38`.
- Preuve : ensembles de messages français exacts venus de trois adaptateurs.
- Impact : reformuler un message change en silence ce qui est retenté (ADR 0008).
- Remédiation : codes d'erreur stables (`CODEX_CONNECTION_LOST`, `CONFINEMENT_REFUSED`…).
- Effort M, risque moyen. Tests : `architecture-f08`, `split-perception`.

- **Nuance du relecteur (elle prime) :** Preuve exacte (codex-perception.cjs:23-41 : 5 messages exacts, 4 refus exacts, 2 préfixes, 2 regex ; codex-verifier.cjs:36-38 : 3 préfixes). Deux corrections. C'est une dette déjà consignée, pas une découverte : l'ADR 0008 écarte « un code posé à la source » uniquement parce que les trois adaptateurs étaient en lecture seule pendant la vague, et écrit « messages recopiés (dette) ». « En silence » est faux pour la liste blanche : tests/architecture-f08.test.cjs:291, :342 et :375 passent par les émetteurs réels, donc un message reformulé fait échouer un test ; seuls les refus (:264-266) sont recopiés à la main dans le test. La remédiation par codes reste la bonne et suit l'ADR.

<a id="ADP-08"></a>
#### ADP-08 — `codex-session-client.cjs` : six responsabilités

**Verdict : confirmé** · priorité P2 · effort L · risque élevé · Adaptateurs et frontières

**Suite : pas de ticket.** Splitting the Codex client (871 lines, six responsibilities) carries a high risk of races. The reviewer warned that spreading generation, rpc, draining, leaving and threads could reopen races that are already closed. The finding has two prerequisites: ADP-01, which belongs to lot L04, and ADP-04 (L13-02). Several test and script files read the client's fields, and tests/architecture.test.cjs cites its path. — _Reprise :_ After three things are integrated: L13-02, the handling of event-handler exceptions (ADP-01) in lot L04, and the shared App Server double of lot L05 that replaces the local copies, including the one in architecture-f08. Preferably also after the protocol tests of lot L08. The first ticket at that point would turn the event reduction into pure functions behind the facade adapters/codex-session-client.cjs.

Constat d'origine :

- Preuve : 871 lignes ; connexion et générations, confinement, fils, requêtes de Codex, réduction d'événements (145 lignes, `:555-701`), exécution du tour, libellés d'interface (`:530-534`, `:620-629`).
- Remédiation : découpage du §4.
- Effort L, risque élevé (courses). Tests : `codex-connect-race`, `codex-thread-rotation`, `architecture-f05`, `codex-confinement`. Prérequis : ADP-01, ADP-04.

- **Risque du remède selon le relecteur :** Répartir l'état partagé (generation, rpc, draining, leaving, threads) entre modules peut rouvrir les courses fermées par F05 ; codex-connect-race, codex-thread-rotation, architecture-f05 et codex-confinement les couvrent, mais neuf fichiers de tests et de scripts importent le client par son chemin et lisent ses champs (ready, rpc, dir, opened, confinement, active), et tests/architecture.test.cjs:22 cite ce chemin en dur.

<a id="ADP-10"></a>
#### ADP-10 — Validation sans couche ni schéma

**Verdict : nuancé** · priorité P2 · effort M · Adaptateurs et frontières

**Suite : pas de ticket.** The reviewer corrected the finding: validateRemote and validateSegment are not two versions of one rule. The remediation still has to be specified. Using zod outside mcp/ needs an ADR and an owner decision (arbitration A4), and there will be no boundary/ folder. A .strict() on /v1/segments could reject a companion already installed (tv/transport.py). The finding is not specific to Codex. — _Reprise :_ When three conditions hold: the owner has decided on zod outside mcp/ (A4), jalon:contrat-fil is reached, and the route table of lot L17 is written. The finding can also move to a boundaries lot.

Constat d'origine :

- Preuve : validation répartie entre hôte, runtime, core et adaptateurs. Deux validateurs de segment divergents : `remote-media.cjs:29-39` (≤ 5 images, ≤ 10 s) et `session-runtime.cjs:597-632` (≤ 8 images, ordre début/fin vérifié plus tard dans le core).
- Remédiation : `boundary/schemas.cjs` (zod `.strict()`) par canal et par route ; test de contrat qui envoie des charges malformées à chacun.
- Effort M. Prérequis : SEC-01.

- **Nuance du relecteur (elle prime) :** Le fond tient (validation répartie entre app/main.cjs en ligne, runtime, core et adaptateurs), mais l'exemple est faux : les deux validateurs ne sont pas deux versions divergentes d'une même règle. validateRemote (remote-media.cjs:29-39) contrôle le format de fil de la TV (base64, sequence, crop, overlay) ; validateSegment (session-runtime.cjs:597-631) contrôle le segment assemblé (clip Uint8Array, dataUrl). Sur le chemin HTTP ils s'enchaînent (http.cjs:221, puis headless-runtime.cjs:789) ; le Mac n'utilise que le second (main.cjs:415). Les bornes 5 et 8 images tiennent à deux transports. Remédiation à préciser : zod est déjà une dépendance racine (package.json), utilisée seulement par mcp/tool-definitions.cjs ; `.strict()` sur /v1/segments est risqué car le companion TV et le serveur se déploient séparément, et l'audit note lui-même que des champs en trop passent aujourd'hui (remote-media.cjs:110). Les messages français attendus par les tests doivent être conservés.
- **Risque du remède selon le relecteur :** Un schéma strict refuserait un champ qu'une version déjà installée du companion envoie, et la capture abandonnerait chaque bloc sur 400 (tv/transport.py:85) ; remote-server et tv-panel ne le voient que si leurs charges reflètent le companion réel.

<a id="ADP-12"></a>
#### ADP-12 — Duplication entre adaptateurs Codex

**Verdict : confirmé** · priorité P2 · effort M · Adaptateurs et frontières

**Suite :** [T126](travail/tickets/126-keep-the-key-of-a-cited-page-in-one-pure-core-module.md) « Keep the key of a cited page in one pure core module ».

**Part laissée de côté :** Only partly ticketed: the cited-page key is covered by L13-03. Three remainders are deferred. (1) The serial queue tail is written four times. Lot L17 already proposes a settled(promise) helper that replaces it, and the double agent-plus-client queue is intended. (2) coldStart/connectMs is not a pure copy: the agent measures its own preparation (codex-session-agent.cjs). (3) Output validation through assertShape(schema) depends on the zod decision (A4). — _Reprise :_ (1) When lot L17 delivers the settled() helper. (2) With the ADP-08 split, once connection preparation has a single owner. (3) After the owner's decision on zod outside mcp/ (A4).

Constat d'origine :

- File série `tail` écrite quatre fois, avec double mise en file agent + client (`session-client:173-183`, `session-agent:53-57`, `local-vlm-agent:27-31`).
- `coldStart`/`connectMs` calculés deux fois (`session-agent:75-80`, `session-client:720-728`).
- Règle « source citée = page ouverte » en trois lieux, normalisation d'URL en trois copies (`session-client:58`, `core/verification.cjs:4`, `core/surveillance.cjs:219`).
- Validation de sortie écrite à la main dans chaque adaptateur.
- Remédiation : `core/source-provenance.cjs`, utilitaire de file série, `assertShape(schema)`.
- Effort M. Tests : `chat-sources`, `opened-pages`.

<a id="ADP-13"></a>
#### ADP-13 — Logique métier dans les adaptateurs

**Verdict : nuancé** · priorité P3 · effort M · Adaptateurs et frontières

**Suite : pas de ticket.** The work moves the perception policy (sampling, topic continuity, classification) into core/perception-policy.cjs and renames the service. The classification can only enter core/ after ADP-04, and only once the codes are defined in core/: that is the single home for codes (arbitration A5, finding CORE-10 of lot L04). The rename touches the composition in runtime/session-runtime.cjs and the documentation. The gain is readability, not testability. Priority P3. — _Reprise :_ When three conditions hold: L13-02 is integrated, the owner has decided on the single home for codes in core/ (lot L04), and tests/architecture-f08.test.cjs has been renamed by lot L07.

Constat d'origine :

- Preuve : `codex-perception.cjs` porte la consigne (`:169`), la continuité de sujet (`:186-190`), l'échantillonnage (`:142-150`) et la classification des échecs (`:43-71`). Il sert aussi le modèle local (`session-runtime.cjs:267`) : le nom est trompeur. Consignes dans `companion-prompt`, `surveillance-prompt`, `codex-recap:58`.
- Remédiation : `core/perception-policy.cjs` pur + agent derrière un port ; renommer en `PerceptionService`.
- Effort M–L. Tests : `perception-context`, `topic-summary`, `split-perception`.

- **Nuance du relecteur (elle prime) :** Preuve exacte (codex-perception.cjs:43-71, :142-150, :169, :186-190 ; modèle local branché en session-runtime.cjs:267-269 ; consigne en codex-recap.cjs:58). Deux précisions sur la remédiation. La classification des échecs ne peut entrer dans core/ qu'après ADP-04, sinon le cœur connaîtrait les messages de trois adaptateurs : prérequis non annoncé. La règle est déjà testable sans processus par l'agent injecté (constructeur :79, :87-88) : le gain est de lisibilité et de nommage, pas de testabilité. Toutes les consignes vivent dans adapters/ (companion-prompt, surveillance-prompt, codex-recap) : convention du dépôt, sans ADR.
- **Risque du remède selon le relecteur :** Déplacer la classification avant l'existence des codes ferait entrer des messages d'adaptateurs dans core/, et le renommage touche la composition (session-runtime.cjs:180, :259) et la documentation ; architecture-f08, perception-context et split-perception le détectent.

### L14 — Une interface Mac découpée et testable

Vague 2 · 5 constats · 3 tickets · fiche de chantier : [interface-mac.md](travail/fiches/interface-mac.md)

- [T127](travail/tickets/127-name-and-test-the-request-rules-of-the-mac-chat-in-a-pure.md) — Name and test the request rules of the Mac chat in a pure module
- [T128](travail/tickets/128-derive-the-mac-window-controls-from-a-tested-pure-model.md) — Derive the Mac window controls from a tested pure model
- [T129](travail/tickets/129-keep-a-pushed-state-from-being-overwritten-by-an-older-read.md) — Keep a pushed state from being overwritten by an older read in the Mac window

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [UI-02](#UI-02) | `renderer.js` module à tout faire | nuancé | P1 | pas de ticket |
| [UI-03](#UI-03) | Réponses tardives traitées au cas par cas | nuancé | P2 | [T129](travail/tickets/129-keep-a-pushed-state-from-being-overwritten-by-an-older-read.md) |
| [UI-05](#UI-05) | État implicite : DOM comme canal, drapeaux répétés | confirmé | P2 | [T128](travail/tickets/128-derive-the-mac-window-controls-from-a-tested-pure-model.md) |
| [UI-06](#UI-06) | Gestionnaires réassignés, deux conventions d'événements | confirmé | P3 | pas de ticket |
| [OUBLI-23](#OUBLI-23) | Règles applicatives dans le renderer, non relevées | confirmé | — | [T127](travail/tickets/127-name-and-test-the-request-rules-of-the-mac-chat-in-a-pure.md) |

<a id="UI-02"></a>
#### UI-02 — `renderer.js` module à tout faire

**Verdict : nuancé** · priorité P1 · effort L · risque moyen · Interfaces (Mac, TV, scripts Python)

**Suite : pas de ticket.** app/renderer.js does everything (837 lines; state, capture, chat, library, surveillance, moments, recap, floating mode). The split into per-zone controllers and a renderer reduced to composition is structural. It depends on module interfaces fixed by the earlier steps, and only the Electron smoke, which runs outside the loop, loads the window. Fiche steps 7 and 8. — _Reprise :_ Fiche steps 4 to 6 integrated, then one ticket per zone. The owner runs the Electron smoke after each zone (fiche decision 1).

Constat d'origine :

- Où : `app/renderer.js:1-837`.
- Preuve : 50 variables `let` de module, 53 fonctions, 82 affectations `.on…=`, 166 ids distincts, 27 lignes de plus de 200 caractères. Quatre rendus groupés (`scheduleState/Chat/Surveillance/Stack`) cohabitent avec des appels directs à `drawChat()`, `drawStack()`, `drawBanners()`.
- Impact : aucune frontière ; toute modification touche l'état global.
- Remède : découpage en section 3.
- Effort L, risque moyen. Protégé par les gardes statiques et `scripts/smoke-electron.mjs` (hors `npm test`). Prérequis : UI-01.

- **Nuance du relecteur (elle prime) :** Tous les compteurs se retrouvent par grep : 50 variables let (14 déclarations), 53 fonctions, 82 affectations .on…=, 166 ids, 27 lignes de plus de 200 caractères, quatre batched() aux l.217, 283, 646, 676. Ce qui est imprécis est la protection annoncée. Les gardes statiques ne lisent que renderer.js, recording.js et app/ui/* (tests/mac-ui.test.cjs:661) et le contrôle des ids ne lit que renderer.js et ui/shell.js (l.678). Les fichiers cibles de la section 3 (app/state.js, app/controllers/, app/actions.js) sortiraient donc de toutes les gardes (imports et exports, contrat du pont, libellés interdits, ids) : il faut les placer sous app/ui/ ou élargir rendererFiles dans le même ticket. Les appels window.capture.* (renderer.js:46, 89, 363, 415) ne passent déjà par aucune garde renderer vers pont : la regex de mac-ui.test.cjs:688 ne reconnaît que bridge et window.tvlens. Vérifié en plus, que l'audit laissait ouvert : scripts/package.mjs empaquette tout le dossier, et la CSP script-src 'self' (app/index.html:6) accepte des modules supplémentaires.
- **Risque du remède selon le relecteur :** Régression de l'ordre d'initialisation (50 variables de module partagées, écouteurs du pont posés au chargement) invisible pour npm test puisque seul scripts/smoke-electron.mjs charge la fenêtre ; le détecteraient ce smoke lancé à chaque étape et les gardes statiques étendues aux nouveaux fichiers.

<a id="UI-03"></a>
#### UI-03 — Réponses tardives traitées au cas par cas

**Verdict : nuancé** · priorité P2 · effort S · risque faible · Interfaces (Mac, TV, scripts Python)

**Suite :** [T129](travail/tickets/129-keep-a-pushed-state-from-being-overwritten-by-an-older-read.md) « Keep a pushed state from being overwritten by an older read in the Mac window ».

**Part laissée de côté :** L14-03 covers only the initial deep and verification reads and the deep read of pullSession. Still unguarded:

  - refreshSessions (l.470-476)

  - renderSaved (l.563)

  - the initial bridge.surveillanceState() read (l.726)

  - the recap and surveillance reads of pullSession (l.500), which onRecap and onSurveillance pushes can overtake.

  commandSurveillance (watchPushes) and refreshRegistry should also move onto the same module, so that a single form remains. The content depends on the interface L14-03 fixes. Lot L04 also rewrites refreshRegistry (retry with a bounded delay after a failed read). Fiche step 4. — _Reprise :_ L14-03 integrated and lot L04 integrated.

Constat d'origine :

- Où : gardes à `renderer.js:572` (`searchRevision`), `:833` (`recapRevision`), `:696` (`watchPushes`), `:657` (sessionId).
- Preuve : aucune garde pour `bridge.deepState()` et `verificationState()` (l.305-306), `pullSession` (l.501, `deepState = deep`), `refreshSessions` (l.470-476), `renderSaved` (l.563). Une réponse lente peut remplacer un état poussé plus récent.
- Remède : un utilitaire `latest()` à jeton dans `app/ui/`, appliqué partout.
- Effort S-M, risque faible.

- **Nuance du relecteur (elle prime) :** Les quatre gardes existent aux lignes citées (l.572, 657, 696, 833) et l'absence de garde aux l.305-306, 470-476, 500-501 et 563 est exacte. Le remède est incomplet : un jeton latest() n'arbitre que deux lectures concurrentes (refreshSessions, renderSaved). Trois des cinq cas cités sont une lecture qui écrase un état poussé (deepState et verificationState aux l.305-306, deepState = deep à la l.501 après un Promise.all qui attend trois réponses). Il y faut le motif déjà en place pour la surveillance : compteur watchPushes incrémenté à chaque poussée (l.725), lecture écartée si une poussée est arrivée depuis (l.696-699), ou un numéro de révision publié par l'hôte. L'écrasement n'a pas été observé ; à la l.501 il est certain par construction dès qu'une poussée deep arrive entre la première et la dernière des trois réponses.

<a id="UI-05"></a>
#### UI-05 — État implicite : DOM comme canal, drapeaux répétés

**Verdict : confirmé** · priorité P2 · effort M · risque moyen · Interfaces (Mac, TV, scripts Python)

**Suite :** [T128](travail/tickets/128-derive-the-mac-window-controls-from-a-tested-pure-model.md) « Derive the Mac window controls from a tested pure model ».

**Part laissée de côté :** L14-02 covers only updateButtons. Still to do:

  - startPreview should return {ok, error}.

  - watchWithSelectedSource and float-source-form still read $('state') and $('notice') as an error channel (l.405, 407, 454, 456).

  - One busy wrapper should replace the 9 sites that set floatingCaptureBusy (l.403, 427, 443, 452) or quickBusy (l.730, 750, 761, 779, 792).

  - float-launch is still written outside the model (l.413, 420, 437, 452, 459).

  These paths call mediaDevices, window.capture and the DOM. Fiche step 5. — _Reprise :_ L14-02 integrated, lots L05 (tests/helpers/fake-dom.cjs) and L08 (tested DOM builders) integrated, and owner decision 1 on the Electron smoke.

Constat d'origine :

- Preuve : `throw Error($('state').textContent)` aux lignes 405 et 454, `$('notice').textContent` aux lignes 407 et 456. `quickBusy = true` cinq fois (l.728-795), `floatingCaptureBusy = true` quatre fois. `updateButtons()` appelé 35 fois à la main.
- Remède : `startPreview()` renvoie `{ok, error}`. Un `withBusy(flag, fn)`. `updateButtons` dérivé d'un `describeControls(state)` pur.
- Effort M, risque moyen.

<a id="UI-06"></a>
#### UI-06 — Gestionnaires réassignés, deux conventions d'événements

**Verdict : confirmé** · priorité P3 · effort S · risque faible · Interfaces (Mac, TV, scripts Python)

**Suite : pas de ticket.** shell.js:16 sets float-menu-toggle.onclick and renderer l.391 overwrites it. saved-all and nav-saved copy the value of open-library.onclick (l.567-568). momentCard (l.557) has a second replay path next to replay (l.164). renderSaved, renderSavedRail and recap-view.js l.44/63 use closure onclicks. The fixes need DOM tests that do not exist yet in the loop. Fiche step 6. — _Reprise :_ Lot L08 integrated (DOM builders tested on the fake document) and fiche step 5 integrated.

Constat d'origine :

- Preuve : `shell.js:16` est écrasé par `renderer.js:391`. Les lignes 567-568 copient `.onclick` par valeur. `recap-view.js:44, 63` et `renderer.js:561-564` utilisent des fermetures `onclick`, alors que le reste passe par `data-action`. La relecture existe deux fois (l.164-176 et l.561).
- Remède : tout passer par la table `actions` ; une seule `openReplay({title, src, note, offset})`.
- Effort S, risque faible.

- **Risque du remède selon le relecteur :** Une openReplay unique doit garder les deux différences de la relecture d'un moment conservé (l.561 : onloadedmetadata remis à null, note propre, adresse tvlens-saved:// sans replayTarget), faute de quoi un moment conservé démarre au décalage du passage précédent ; aucun test automatique ne couvre la relecture, seul smoke-electron le verrait.

<a id="OUBLI-23"></a>
#### OUBLI-23 — Règles applicatives dans le renderer, non relevées

**Verdict : confirmé** · Signalement du relecteur — Interfaces (Mac, TV, scripts Python)

_Signalé par un relecteur d'audit, vérifié dans le code par le rédacteur puis le relecteur du lot._

**Suite :** [T127](travail/tickets/127-name-and-test-the-request-rules-of-the-mac-chat-in-a-pure.md) « Name and test the request rules of the Mac chat in a pure module ».

- **Signalement :** Règles applicatives dans le renderer, non relevées : la consigne envoyée au modèle est composée dans la présentation (app/renderer.js:335, « Approfondis cette réponse : » suivi de 1 200 caractères de la réponse) et la reconnaissance d'une demande de vérification y est faite par regex (l.30 et 287-288). Aucun test ne les exerce, la TV ne peut pas les partager, et la section 3 les déplacerait telles quelles dans controllers/.

### L15 — Un companion TV et des scripts Python maintenables

Vague 2 · 11 constats · 4 tickets · fiche de chantier : [tv-et-python.md](travail/fiches/tv-et-python.md)

- [T130](travail/tickets/130-pin-the-remote-walk-of-the-tv-chat-column-in-a-page-harness.md) — Pin the remote walk of the TV chat column in a page harness without a browser
- [T131](travail/tickets/131-route-the-tv-thumbnail-through-the-shared-transport-and-name.md) — Route the TV thumbnail through the shared transport and name every /v1 call
- [T132](travail/tickets/132-share-the-clock-and-plural-helpers-of-the-tv-panel-views-in.md) — Share the clock and plural helpers of the TV panel views in one classic script _(demande un ADR)_
- [T133](travail/tickets/133-launch-and-stop-every-tv-controller-child-one-way-and-inject.md) — Launch and stop every TV controller child one way and inject the layout root

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [TV-01](#TV-01) | `companion.js` : une fermeture de 900 lignes | confirmé | P1 | [T130](travail/tickets/130-pin-the-remote-walk-of-the-tv-chat-column-in-a-page-harness.md) |
| [TV-02](#TV-02) | Pas d'abstraction de vue ni de graphe de focus | confirmé | P1 | [T130](travail/tickets/130-pin-the-remote-walk-of-the-tv-chat-column-in-a-page-harness.md) |
| [TV-03](#TV-03) | Duplication interne à `tv/app` | nuancé | P2 | [T132](travail/tickets/132-share-the-clock-and-plural-helpers-of-the-tv-panel-views-in.md) |
| [TV-04](#TV-04) | Modèles de vue dupliqués Mac ↔ TV | nuancé | P2 | [T132](travail/tickets/132-share-the-clock-and-plural-helpers-of-the-tv-panel-views-in.md) |
| [TV-06](#TV-06) | Transport éparpillé | confirmé | P2 | [T131](travail/tickets/131-route-the-tv-thumbnail-through-the-shared-transport-and-name.md) |
| [TV-09](#TV-09) | Constantes magiques dispersées | confirmé | P2 | pas de ticket |
| [PY-01](#PY-01) | `capture.py` : `run()` de 132 lignes | confirmé | P2 | pas de ticket |
| [PY-03](#PY-03) | `controller.py` | confirmé | P2 | [T133](travail/tickets/133-launch-and-stop-every-tv-controller-child-one-way-and-inject.md) |
| [PY-04](#PY-04) | Diagnostic, typage, branchement des tests | nuancé | P2 | pas de ticket |
| [PY-05](#PY-05) | Protocole par fichiers implicite | nuancé | P2 | pas de ticket |
| [PY-02](#PY-02) | `ambient.py` : `Supervisor` | nuancé | P3 | pas de ticket |

<a id="TV-01"></a>
#### TV-01 — `companion.js` : une fermeture de 900 lignes

**Verdict : confirmé** · priorité P1 · effort L · risque moyen · Interfaces (Mac, TV, scripts Python)

**Suite :** [T130](travail/tickets/130-pin-the-remote-walk-of-the-tv-chat-column-in-a-page-harness.md) « Pin the remote walk of the TV chat column in a page harness without a browser ».

**Part laissée de côté :** Seul le filet de caractérisation est livré (L15-01). Le découpage de la fermeture de companion.js (environ 900 lignes : vue de conversation, interrogation, disposition, réglages) demande d'abord la caractérisation du panneau appairé et l'extraction de la navigation. — _Reprise :_ Après L15-01, après l'extension du harnais au panneau appairé (horloge simulée du lot L05) et après l'extraction de la navigation et des aides DOM.

Constat d'origine :

- Où : `tv/app/companion.js:361-1263`.
- Preuve : environ 25 variables de fermeture. Racine de composition, vue chat, boucle de poll, graphe de focus, bascule de disposition, réglages, badge. `capture` (l.417) capture `client`, assigné l.573.
- Impact : seul le haut du fichier (modèles purs) est testable ; le reste dépend de l'ordre d'exécution.
- Remède : section 3.
- Effort L, risque moyen. Tests : `tv-panel.test.cjs`, `chat-error-ui.test.cjs` (modèles), smokes Playwright.

<a id="TV-02"></a>
#### TV-02 — Pas d'abstraction de vue ni de graphe de focus

**Verdict : confirmé** · priorité P1 · effort M · risque moyen · Interfaces (Mac, TV, scripts Python)

**Suite :** [T130](travail/tickets/130-pin-the-remote-walk-of-the-tv-chat-column-in-a-page-harness.md) « Pin the remote walk of the TV chat column in a page harness without a browser ».

**Part laissée de côté :** Seul le parcours de la colonne de conversation non appairée est fixé (L15-01). Il reste la navigation de la surveillance, des sessions et de la frise, puis la factorisation du déplacement par rangées. — _Reprise :_ Quand L15-01 et l'horloge simulée du lot L05 seront intégrés.

Constat d'origine :

- Où : `companion.js:482-566` ; `surveillance-view.js:1159-1244` ; `sessions-view.js:658-710` ; `timeline-view.js:393-486`.
- Preuve : trois `handleKey` chaînés. `surveillance-view.js:1159-1168` liste `capture`, `transcription-language`, `show-timeline`, qui appartiennent à d'autres modules. `sessions-view.js:468-469` écrit `timeline.sessionsOpen`, et `:704` recopie la barre de `timeline-view.js:464`. Les codes 461/13/37-40 sont en littéraux dans quatre fichiers.
- Impact : ajouter un bouton oblige à modifier jusqu'à trois gestionnaires.
- Remède : `tv/app/focus.js` (script classique avec export CommonJS) fournissant `KEYS`, `moveInRows(rows, active, key)` pur et testable, et une pile de vues `{handleKey, focus}`. Chaque vue déclare ses lignes.
- Effort M-L, risque moyen (régression télécommande). Seuls les smokes couvrent.

<a id="TV-03"></a>
#### TV-03 — Duplication interne à `tv/app`

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Interfaces (Mac, TV, scripts Python)

**Suite :** [T132](travail/tickets/132-share-the-clock-and-plural-helpers-of-the-tv-panel-views-in.md) « Share the clock and plural helpers of the TV panel views in one classic script ».

**Part laissée de côté :** L15-03 ne traite que les aides de texte. Le rail fenêtré et les aides DOM (el, set, flag), dupliqués avec des écarts (−2/+4 contre −3/+5), doivent d'abord voir leur fenêtrage caractérisé. — _Reprise :_ Après la caractérisation du panneau appairé et l'ADR de partage de L15-03.

Constat d'origine :

- Preuve :
  - Fenêtrage de rail en trois copies : `sessions-view.js:532-607`, `surveillance-view.js:1006-1078`, `timeline-view.js:197-284`.
  - `el` défini cinq fois ; « écrire si changé » quatre fois (`set/flag`, `set/able`, `attribute`).
  - Compteurs anti-réponse-tardive sous quatre noms (`run`, `listRun/detailRun/epoch`, `generation`, `revision`).
  - `keyboardVisible` tenu deux fois (`companion.js:444`, `surveillance-view.js:751`).
- Remède : `tv/app/dom.js` (`el`, `text`, `setText`, `setFlag`, `WindowedRail`, `latest()`), chargé avant les vues. Un seul propriétaire de l'état du clavier.
- Effort M, risque moyen. Prérequis : ajouter le fichier à `index.html` et à la liste de `tv-app-compat.test.cjs`.

- **Nuance du relecteur (elle prime) :** Duplications confirmées : el aux cinq endroits (capture-control.js:7, companion.js:380, timeline-view.js:3, sessions-view.js:373, surveillance-view.js:549), fenêtrage aux trois emplacements cités, keyboardVisible deux fois. Le prérequis annoncé est inexact : tests/tv-app-compat.test.cjs découvre les scripts par readdirSync (l.13), la liste de la l.50 n'est qu'un contrôle de présence ; un nouveau fichier est vérifié sans y toucher. La vraie contrainte est ailleurs : ambient.html ne charge que surveillance-overlay.js et ambient.js, liste figée par tv-app-compat.test.cjs:79 et par SHARED dans scripts/package-tv-ambient.mjs:23. dom.js ne doit donc être requis ni par surveillance-overlay.js ni par ambient.js. Les trois fenêtrages ne sont pas identiques (−2/+4 contre −3/+5, replaceChildren contre appendChild, restauration de follow et selected dans la frise à timeline-view.js:269-281) : WindowedRail doit paramétrer ces écarts, pas les gommer.

<a id="TV-04"></a>
#### TV-04 — Modèles de vue dupliqués Mac ↔ TV

**Verdict : nuancé** · priorité P2 · effort M · risque faible · Interfaces (Mac, TV, scripts Python)

**Suite :** [T132](travail/tickets/132-share-the-clock-and-plural-helpers-of-the-tv-panel-views-in.md) « Share the clock and plural helpers of the TV panel views in one classic script ».

**Part laissée de côté :** Les constantes répétées entre JS et Python (port 8788, durées d'affichage 8/14/20 s, durée de vie de page 21500 ms contre 21.5 s) demandent la forme de partage de L15-03 et des noms côté Python. — _Reprise :_ Après L15-03, et après les noms des fichiers d'exécution Python pour le côté Python.

Constat d'origine :

- Preuve :
  - `describeJob` : `app/ui/job-view.mjs:65` et `companion.js:138` (le commentaire `job-view.mjs:4` l'assume) ; assemblage d'`errorDetail` identique, libellés divergents.
  - Sessions et stockage : `app/ui/sessions-view.mjs` et `tv/app/sessions-view.js:59-223`.
  - Libellés de surveillance : `surveillance-view.mjs:19-38` et `surveillance-view.js:10-37`.
  - Horloge en six versions : `text.mjs:29`, `companion.js:32`, `surveillance-view.js:53`, `sessions-view.js:15`, `timeline-view.js:7`, `surveillance-overlay.js:67`. Les deux dernières ne gardent pas `NaN` ; le Mac écrit « 01:01 », la TV « 1:01 ».
  - `plural` cinq fois ; extraction d'hôte quatre fois, dont `ambient.py:214`.
- Remède réaliste : d'abord un jeu de cas partagé (`tests/fixtures/view-text-cases.json`) exécuté contre les deux côtés, comme le fait déjà `tv-overlay-queue-cases.json`. Ensuite fusionner dans un `tv/app/text.js` unique côté TV. Je n'ai pas vérifié qu'un fichier commun Mac/TV soit compatible avec les deux empaquetages.
- Effort M, risque faible.

- **Nuance du relecteur (elle prime) :** Duplications exactes aux emplacements cités (horloge en six versions, plural cinq fois, extraction d'hôte quatre fois). Deux faits manquent. 1) Un contrôle croisé Mac/TV existe déjà pour describeJob : tests/mac-ui.test.cjs:69-104 compare 17 cas sur le sens et non sur le vocabulaire ; la divergence des libellés y est donc voulue, et le jeu de cas partagé doit partir de ce test plutôt que le doubler. 2) Les formats d'horloge (« 01:01 » Mac, « 1:01 » TV) sont documentés et épinglés par des tests de chaque côté : les unifier est un changement visible, pas un refactoring. Côté TV, la fusion dans text.js ne peut pas inclure surveillance-overlay.js (clock l.67, plural l.87, hostOf l.45), seul script de modèle chargé par la page ambiante (tv-app-compat.test.cjs:79, package-tv-ambient.mjs:23). Restent fusionnables sans toucher à ce contrat : companion.js, surveillance-view.js, sessions-view.js, timeline-view.js.

<a id="TV-06"></a>
#### TV-06 — Transport éparpillé

**Verdict : confirmé** · priorité P2 · effort M · Interfaces (Mac, TV, scripts Python)

**Suite :** [T131](travail/tickets/131-route-the-tv-thumbnail-through-the-shared-transport-and-name.md) « Route the TV thumbnail through the shared transport and name every /v1 call ».

**Part laissée de côté :** L15-02 ne traite que le serveur /v1. Il reste à nommer les routes du client du contrôleur local (/capture, /panel, /ambient), à n'en garder qu'une instance remise à capture-control.js, et à décider d'un éventuel recul progressif de l'interrogation (décision D5). — _Reprise :_ Après L15-02 et la caractérisation du panneau appairé ; décision D5 pour le recul.

Constat d'origine :

- Preuve : routes en dur hors `RemoteClient` (`companion.js:588, 604-624, 673-683` ; `sessions-view.js:492`). Client du contrôleur instancié deux fois (`companion.js:594`, `capture-control.js:23`). `thumbnail` contourne `send` (`remote-client.js:116-130`), donc erreur sans `status` ni `network`. Poll de capture à 1 s fixe sans recul (`capture-control.js:41`).
- Remède : `ControlClient` nommé (`panel()`, `setPanel()`, `capture()`…), méthodes nommées côté serveur, miniature via `send`.
- Effort M. Test : `tv-panel.test.cjs:188`.

<a id="TV-09"></a>
#### TV-09 — Constantes magiques dispersées

**Verdict : confirmé** · priorité P2 · effort S · Interfaces (Mac, TV, scripts Python)

**Suite : pas de ticket.** L'accord entre les constantes JS et Python doit passer par un fichier de cas partagé, jamais par une lecture des sources, et suppose la forme de partage et les noms côté Python. — _Reprise :_ Après L15-03 et la déclaration unique des fichiers d'exécution Python.

Constat d'origine :

- TV : délais 8000 (deux fois dans `remote-client.js`), 7000, 15000 (deux fois), 12000, 200/300 ; pas de défilement 180/140/100 ; fenêtres −2/+4 et −3/+5.
- Mac : 500, 1000, 10000, 2000, 1600 ms ; 1200 et 2000 caractères ; bornes de `recording.js` (64, 768, 350, 2000).
- Inter-langages : durées `[8000,14000,20000]` en quatre endroits plus les routes de `controller.py:239` ; port 8788 six fois ; bornes 600/160/80/60 (`surveillance-overlay.js` et `ambient.py:237-239`) ; `PAGE_LIFE 21.5` et `LIFE_MAX_MS 21500`.
- Remède : un bloc de constantes nommées par fichier, et un test de contrat qui compare les valeurs partagées.
- Effort S-M.

- **Risque du remède selon le relecteur :** Un test de contrat écrit en regex sur les sources JS et Python recréerait le défaut de UI-01 : il doit lire des valeurs exportées (DISPLAY_CHOICES l'est déjà des deux côtés) ou une fixture commune comme tv-overlay-queue-cases.json, et dériver les routes /ambient/display/N d'une table ne doit pas ouvrir la liste fermée de controller.py:236-241, ce que test_tv_ambient.py vérifierait.

<a id="PY-01"></a>
#### PY-01 — `capture.py` : `run()` de 132 lignes

**Verdict : confirmé** · priorité P2 · effort M · risque moyen · Interfaces (Mac, TV, scripts Python)

**Suite : pas de ticket.** La caractérisation de capture.py run(), la politique d'abandon pure et le remplacement de luna() dépendent de la décision D4 et d'une vérification de luna.parse_reply sur getStatus. — _Reprise :_ Après la décision D4 du propriétaire.

Constat d'origine :

- Où : `tv/capture.py:105-236`.
- Preuve : indentation à une espace, 82 `;`, ligne 106 de 414 caractères, conditionnelle à six branches l.216. `luna()` (l.16-23) duplique `tv/luna.py:24` avec un parseur différent. Littéraux `'youtube.leanback.v4'` (doublon de `ambient.YOUTUBE`), `'hw:0,13'`, bloc de 8 s écrit trois fois. `report` est muté par deux fils ; seule l'écriture du fichier est verrouillée.
- Remède : `CaptureLoop` avec `capture_block()`, `classify_drop()`, `Report` verrouillé ; réutiliser `luna.call`.
- Effort M, risque moyen. Tests : `test_tv_capture_gate.py` (20, faux `luna-send` et `arecord`).

- **Risque du remède selon le relecteur :** tests/tv-panel.test.cjs:540-543 retrouve les causes par regex sur la forme littérale drop(report,'cause') dans capture.py et transport.py et en exige au moins six : un classify_drop() ou un Report à méthode le fait échouer sans régression réelle ; s'y ajoutent l'homonymie entre la fonction luna() et le module luna, et le parseur de luna.call qui exige returnValue ; test_tv_capture_gate.py (20 tests de bout en bout, faux luna-send et arecord) détecterait une régression de comportement.

<a id="PY-03"></a>
#### PY-03 — `controller.py`

**Verdict : confirmé** · priorité P2 · effort M · Interfaces (Mac, TV, scripts Python)

**Suite :** [T133](travail/tickets/133-launch-and-stop-every-tv-controller-child-one-way-and-inject.md) « Launch and stop every TV controller child one way and inject the layout root ».

**Part laissée de côté :** L15-04 couvre le lancement, l'arrêt et PanelLayout. L'horloge d'attente injectée dans page_ack et page_wait reste à faire. — _Reprise :_ Après la décision D7 du propriétaire.

Constat d'origine :

- Preuve : `stop()`/`reap` identiques (l.58-71 et l.155-168) ; `Popen` écrit trois fois. `Handler.do_POST` écrit lui-même la requête de disposition (l.324-335). Chemins `/tmp/…` en dur (l.290, 327-330) en doublon de `AmbientPaths`. `page_ack` et `page_wait` appellent `time.monotonic`/`time.sleep` directement (l.210-228) alors que `clock` est injecté. Deux styles de formatage dans le fichier (l.317-371).
- Remède : `ChildProcess` commun, `PanelLayout`, table de routes.
- Effort M. Test : `test_tv_control.py` (9).

<a id="PY-04"></a>
#### PY-04 — Diagnostic, typage, branchement des tests

**Verdict : nuancé** · priorité P2 · effort S · Interfaces (Mac, TV, scripts Python)

**Suite : pas de ticket.** La place de la cause perdue d'une capture qui échoue avant son premier rapport, et les sorties des enfants, dépendent d'une décision du propriétaire (D2), et de D6 si le harnais change. — _Reprise :_ Après la décision D2 (et D6 si le harnais change).

Constat d'origine :

- Preuve : sorties des enfants vers `DEVNULL` (`controller.py:54, 130, 151` ; `ambient.py:493`). `log_message` neutralisé (l.272). `except Exception` à l'import (`controller.py:18`, `capture.py:7`) masque la cause. Aucune annotation de type. `npm test` ne lance pas les tests Python (`package.json:11`).
- Remède : journal borné sur fichier, cause d'import publiée dans l'état, script `test:tv`.
- Effort S.

- **Nuance du relecteur (elle prime) :** Faits exacts à 8627b46 : DEVNULL à controller.py:54-55, 130-131, 151-152 et ambient.py:493, log_message vide (l.272), except Exception aux imports, aucune annotation, package.json:11. Le dernier point est déjà traité après la copie figée : le commit 0262480 ajoute scripts/check.mjs, dont le contrôle complet lance python3 -m unittest discover -s tests ; le script test:tv n'a plus d'objet. Il reste que le mode --changed ne lance pas les tests Python, même quand tv/*.py change, et que les tests de prototypes/lg-remote échappent à la découverte. L'avalement de l'import est voulu et commenté (controller.py:16-17, capture.py:5-6) : seule la cause perdue est à corriger. Le coût réel est côté capture : une erreur levée avant le premier save() (capture.py:107-112 : durée, verrou, configuration) part dans stderr donc dans DEVNULL, alors que le rapport vient d'être supprimé (controller.py:52) ; le panneau ne voit qu'un exitCode.
- **Risque du remède selon le relecteur :** Un journal sur /tmp d'une TV peut grossir sans borne ou consigner des secrets (les routes de la page ambiante portent le nonce dans le chemin, que log_message écrirait) ; le détecteraient un test de rotation à taille fixée et une assertion qu'aucun nonce ni jeton n'apparaît dans le journal.

<a id="PY-05"></a>
#### PY-05 — Protocole par fichiers implicite

**Verdict : nuancé** · priorité P2 · effort M · Interfaces (Mac, TV, scripts Python)

**Suite : pas de ticket.** Le nom et la place du module des fichiers d'exécution, et le déploiement du relais prototypes/lg-remote/runtime, dépendent de la décision D3. — _Reprise :_ Après L15-04 et la décision D3.

Constat d'origine :

- Preuve : 13 fichiers d'exécution dans `AmbientPaths` (`ambient.py:120-132`), lus par `dict.get` chez le contrôleur, le superviseur, la capture et le mappeur. Aucun schéma.
- Remède : lecteurs typés par fichier et cas d'exemple partagés.
- Effort M. Prérequis : PY-02.

- **Nuance du relecteur (elle prime) :** AmbientPaths (ambient.py:120-132) déclare 13 fichiers dans le dossier d'exécution, plus 2 chemins fixes (panel_layout, capture_report). Le protocole dépasse tv/ : prototypes/lg-remote/runtime/ambient_relay.py:59-61 et panel.py:8-16 redéclarent les mêmes noms de fichiers en dur, et le contrôleur ajoute /tmp/tvlens-panel-layout-request.json (controller.py:327-330). Le prérequis est à l'envers : des lecteurs typés par fichier n'ont pas besoin du découpage de Supervisor ; c'est PY-02 (séparation Inputs, décision, effets) qui s'appuierait sur eux. PY-05 passe donc avant, avec un risque bien moindre.
- **Risque du remède selon le relecteur :** Un lecteur typé plus strict que dict.get peut rejeter un fichier écrit par un composant installé plus ancien (relais du mappeur ou lanceur du panneau, non redéployés en même temps) et fermer ou ouvrir la porte à tort ; le détecteraient des cas d'exemple partagés incluant les formes anciennes, joués par test_tv_ambient.py et par prototypes/lg-remote/test_*.py.

<a id="PY-02"></a>
#### PY-02 — `ambient.py` : `Supervisor`

**Verdict : nuancé** · priorité P3 · effort L · risque élevé · Interfaces (Mac, TV, scripts Python)

**Suite : pas de ticket.** Le découpage du Supervisor d'ambient.py suppose des noms de fichiers d'exécution déclarés une fois. — _Reprise :_ Après la déclaration unique des fichiers d'exécution (PY-05).

Constat d'origine :

- Où : `tv/ambient.py:528-1021`.
- Preuve : 33 méthodes, constructeur à 21 paramètres, attributs posés par affectations chaînées (l.544-555). `self.card` est un dict à une vingtaine de clés avec phases en chaînes. `mode()` modifie `probation` (l.714). `block_reason()` a des effets de bord (l.777-783). `advance()` fait 56 lignes. Le profil livré est `focus: 'off'` : tout ce code est non validé sur l'appareil (docstring l.6-7).
- Remède : `Card` en dataclass avec `Phase` en Enum ; séparer les lectures de fichiers (`Inputs`), la décision pure et les effets (porte, Luna).
- Effort L, risque élevé (la porte protège les images capturées). Tests : `test_tv_ambient.py` (55, horloge injectée).

- **Nuance du relecteur (elle prime) :** Exact : classe aux l.528-1021, 33 méthodes, advance() de 56 lignes (871-926), mode() et block_reason() à effets de bord. Inexact : le constructeur a 18 paramètres hors self (l.530-532), pas 21. Deux contraintes manquent à la cible de la section 3. Un paquet ambient/ à côté d'un fichier ambient.py homonyme ne tient pas tel quel : à l'import le paquet l'emporte sur le module, la façade doit donc être ambient/__init__.py ou le paquet porter un autre nom ; le fichier ambient.py doit pourtant subsister comme point d'entrée, car owned_supervisor n'envoie de signal qu'à un processus dont la ligne de commande nomme ambient.py (l.457-461) et controller.py:94 le lance par chemin. Les tests remplacent des noms du module (patch.object sur ambient.spawn_detached, ambient.AmbientPaths, ambient.time, ambient.signal : tests/test_tv_ambient.py:738, 888-889) : après découpage ces substitutions n'atteignent plus les sous-modules. Priorité basse tant que le profil livré reste focus 'off' et que le protocole natif n'a pas été joué ; PY-05 se fait avant.
- **Risque du remède selon le relecteur :** La porte d'affichage protège les images capturées : un changement d'ordre entre l'écriture de la porte et le lancement (arm(), l.812-844) ou la perte d'un effet de bord de block_reason() laisserait une carte dans une image envoyée ; test_tv_ambient.py (55 tests, horloge injectée) le détecterait en simulation, rien ne le détecterait sur la TV puisque le protocole natif n'a jamais été exécuté.

### L16 — Des livraisons reproductibles

Vague 2 · 4 constats · 4 tickets · fiche de chantier : [livraison.md](travail/fiches/livraison.md)

- [T134](travail/tickets/134-document-every-setting-the-code-reads-and-group-the-unit-s.md) — Document every setting the code reads and group the unit's environment lines
- [T135](travail/tickets/135-record-the-build-identity-in-a-generated-file-and-read-it.md) — Record the build identity in a generated file and read it without Git _(demande un ADR)_
- [T136](travail/tickets/136-let-the-server-tell-which-build-it-runs-at-start-and-on-get.md) — Let the server tell which build it runs, at start and on GET /v1/version
- [T137](travail/tickets/137-describe-every-file-installed-on-the-tv-in-one-manifest.md) — Describe every file installed on the TV in one manifest checked against the code _(demande un ADR)_

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [OPS-15](#OPS-15) | Déploiement serveur : étapes manuelles, révision en service inconnue, exemples d'environnement incomplets | nuancé | P2 | [T134](travail/tickets/134-document-every-setting-the-code-reads-and-group-the-unit-s.md), [T135](travail/tickets/135-record-the-build-identity-in-a-generated-file-and-read-it.md), [T136](travail/tickets/136-let-the-server-tell-which-build-it-runs-at-start-and-on-get.md) |
| [OPS-16](#OPS-16) | Déploiement TV : copie manuelle, table d'installation incomplète, version installée inconnaissable | confirmé | P2 | [T137](travail/tickets/137-describe-every-file-installed-on-the-tv-in-one-manifest.md) |
| [OPS-17](#OPS-17) | Paquet Mac : signature ad hoc, ni notarisation, ni fusibles, ni identifiant de construction | nuancé | P2 | [T135](travail/tickets/135-record-the-build-identity-in-a-generated-file-and-read-it.md) |
| [OUBLI-28](#OUBLI-28) | Version de Codex CLI non fixée côté serveur | nuancé | — | pas de ticket |

<a id="OPS-15"></a>
#### OPS-15 — Déploiement serveur : étapes manuelles, révision en service inconnue, exemples d'environnement incomplets

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Scripts et outillage

**Suite :** [T134](travail/tickets/134-document-every-setting-the-code-reads-and-group-the-unit-s.md) « Document every setting the code reads and group the unit's environment lines » ; [T135](travail/tickets/135-record-the-build-identity-in-a-generated-file-and-read-it.md) « Record the build identity in a generated file and read it without Git » ; [T136](travail/tickets/136-let-the-server-tell-which-build-it-runs-at-start-and-on-get.md) « Let the server tell which build it runs, at start and on GET /v1/version ».

**Part laissée de côté :** Reste du constat : scripts deploy/install et deploy/update. Ils construiraient une release /opt/tvlens/releases/&lt;sha> depuis git archive, puis : npm ci --omit=dev, build-info, sonde probe-confinement avec --out, bascule du lien app, redémarrage, lecture de /v1/version, retour arrière. Ils auraient un essai à blanc avec exécuteur injecté. La doc serveur passerait ensuite aux scripts. Leur contenu dépend de L16-02 et L16-03 et de décisions du propriétaire (langage, disposition, sort d'un arbre modifié). Il dépend aussi de L01 (Node 24 exigé) et de L03 (prepare sans .git). — _Reprise :_ L16-02 et L16-03 terminés, lot:L01 et lot:L03 terminés, et décisions 2 et 3 de la fiche prises (fiche, § 8).

- **Où :** deploy/tvlens.service:11-22 ; deploy/hardening.conf.example:2-3 ; deploy/runtime.env.example:14-17 ; docs/server-installation.md:61-87 ; docs/server-installation.md:144-150 ; server/main.cjs:41 ; .env.example
- **Preuve :** L'unité est cohérente avec le code : ExecStart vise server/main.cjs, TVLENS_CONFIG et TVLENS_SERVER_DATA sont lus par server/main.cjs:24-28, ReadWritePaths couvre les données, et tests/deploy-unit.test.cjs lie TasksMax au nombre de rôles Codex. Mais l'installation est faite de 9 commandes manuelles (utilisateur, dossiers, deux fichiers d'environnement, connexion Codex, unité) plus l'installation séparée de Codex, de Whisper et du modèle ; la mise à jour est un paragraphe de prose. Aucune des 24 routes de server/http.cjs ne donne la version ; le journal de démarrage ne donne que l'URL. Dans l'unité, `Environment=TVLENS_PORT` (:20) suit `EnvironmentFile` (:19) comme s'il le surchargeait, alors que le fichier l'emporte quel que soit l'ordre (sémantique systemd, de mémoire). Le durcissement fourni n'a « jamais été essayé sur un serveur » selon son propre en-tête. 9 variables lues par la production sont absentes de .env.example et de deploy/*.example : TVLENS_CODEX_TRACE, TVLENS_INSPECTION_STRATEGY, TVLENS_PERCEPTION_BACKEND, TVLENS_WHISPER_AUDIO_CTX et les 5 TVLENS_LOCAL_VLM_* ; 4 d'entre elles n'apparaissent dans aucun document. La vérification du cloisonnement exigée avant mise en service est un script lancé à la main.
- **Impact :** Le relevé de déploiement dit lui-même qu'il ne garantit pas que le VPS suit le dépôt : après une mise à jour, rien ne prouve quelle révision répond ; chaque déploiement rejoue de mémoire une procédure de plusieurs pages.
- **Nuance du relecteur (elle prime) :** Preuve exacte : unité conforme au code, 9 variables TVLENS_* absentes des exemples dont 4 dans aucun document, aucune route de version, journal de démarrage réduit à l'URL (server/main.cjs:41), durcissement jamais essayé. Corrections.

  (1) La commande de sonde donnée échoue : scripts/probe-confinement.cjs:59-62 exige --out et sort en code 2 sans lui. La forme exacte est celle de deploy/runtime.env.example:16 : `--out <dossier neuf> --steps r --max-turns 0`.

  (2) Une dixième variable lue par la production manque aux exemples : OPENROUTER_AUDIO_INPUT.

  (3) Le test deploy-env ne doit pas viser tout nom TVLENS_* : TVLENS_STORAGE_FULL, TVLENS_RECAP_CAPACITY et TVLENS_VISION_TRANSIENT sont des codes d'erreur. Viser les lectures d'environnement. DOC-15 propose le même test : à fusionner.

  (4) La boucle ne peut pas exercer ces scripts : hors ROOT, les gardes de HEAD refusent ssh et sudo, et CLAUDE.md interdit le VPS. Le critère d'acceptation doit être un essai hors ligne (simulation, conteneur), sinon install.sh rejoint hardening.conf.example, « jamais essayé ».

<a id="OPS-16"></a>
#### OPS-16 — Déploiement TV : copie manuelle, table d'installation incomplète, version installée inconnaissable

**Verdict : confirmé** · priorité P2 · effort M · risque moyen · Scripts et outillage

**Suite :** [T137](travail/tickets/137-describe-every-file-installed-on-the-tv-in-one-manifest.md) « Describe every file installed on the TV in one manifest checked against the code ».

**Part laissée de côté :** Reste du constat : scripts/deploy-tv.mjs. Il ferait un essai à blanc qui compare les SHA-256 par ssh, puis --apply, et refuserait d'agir si une capture est active. Il ne toucherait jamais connection.json, ambient.json, ambient-settings.json, connection.js, state/, bin/ ni le crochet 25, et écrirait des fichiers VERSION. La doc TV renverrait ensuite au script. Il lit le manifeste de L16-04 et les paquets de L09. Les modes, propriétaires et chemins physiques des applis sont des relevés à faire sur la TV. — _Reprise :_ L16-04 terminé, lot:L09 terminé (npm run package:tv), relevés stat du propriétaire faits sur la TV, et décisions 7 et 8 de la fiche prises.

- **Où :** docs/lg-installation.md:16-22 ; docs/lg-installation.md:27 ; tv/controller.py:18-19 ; tv/capture.py:7-8 ; tv/ambient.py:24 ; tv/35-tvlens-capture-control:3 ; tv/tailscale-service.sh ; docs/lg-tailscale.md:50 ; docs/lg-remote-runtime.md:108
- **Preuve :** Aucun script : la table de docs/lg-installation.md répartit à la main les fichiers vers 3 dossiers de la TV et 2 crochets de démarrage. Elle liste controller.py, capture.py et transport.py, mais ni ambient.py ni luna.py, alors que controller.py et capture.py importent ambient (qui importe luna) sous un `except Exception` qui avale l'échec : un déploiement partiel démarre sans alertes et sans message. Le panneau a été mis à jour en remplaçant ses fichiers dans l'application déjà enregistrée, sans réinstaller le paquet : la fiche système « peut encore indiquer 0.0.2 ». Le crochet lance le contrôleur une fois, en arrière-plan, sortie dans /tmp, sans relance. tv/tailscale-service.sh est installé sous un autre nom (`service`) et son crochet 25-tvlens-tailscale n'est pas dans le dépôt.
- **Impact :** Personne ne peut dire quel code tourne sur la TV sans comparer les fichiers un à un ; la liste des fichiers à copier vit dans un tableau que le code a déjà dépassé.

<a id="OPS-17"></a>
#### OPS-17 — Paquet Mac : signature ad hoc, ni notarisation, ni fusibles, ni identifiant de construction

**Verdict : nuancé** · priorité P2 · effort M · risque moyen · Scripts et outillage

**Suite :** [T135](travail/tickets/135-record-the-build-identity-in-a-generated-file-and-read-it.md) « Record the build identity in a generated file and read it without Git ».

**Part laissée de côté :** Reste du constat après L16-02 : architecture du paquet par option, open-mac qui en déduit le chemin, build-info inclus et affiché dans les réglages, fusibles avec re-signature, identité de signature stable ou Developer ID, contrôle de lancement du paquet construit. Il faut installer @electron/fuses (installe). Couper RunAsNode casse l'adaptateur hérité codex-video-agent, et le smoke Playwright ne peut pas s'attacher à un paquet fusionné. Electron ne se lance pas dans la boucle. — _Reprise :_ lot:L09 terminé (OPS-08, liste d'inclusion ; ADP-11, sort de l'adaptateur hérité), L16-02 terminé, et décisions 5 et 6 de la fiche prises (fusibles, compte Apple et signature).

- **Où :** scripts/package.mjs:2-11 ; scripts/open-mac.mjs:5 ; package.json:3 ; package.json:29-33 ; app/main.cjs:38
- **Preuve :** scripts/package.mjs ne passe ni osxSign, ni osxNotarize, ni icône, et fige arm64 (:3) ; open-mac.mjs fige le chemin dist/TVLens-darwin-arm64. @electron/fuses n'est pas une dépendance. Lecture de @electron/packager 20.3.0 (dist/mac.js:424-441 et :517-533) : il inscrit l'empreinte d'intégrité de l'asar et rétablit une signature ad hoc ; aucun fusible n'est basculé, donc RunAsNode, NODE_OPTIONS et --inspect restent aux valeurs par défaut d'Electron et l'intégrité de l'asar n'est pas imposée (valeurs par défaut citées de mémoire). La version est figée à 0.1.0 ; rien dans le paquet ne dit de quel commit il vient. Point positif : les doublures de test ne s'activent que hors paquet (app/main.cjs:38).
- **Impact :** L'app détient l'autorisation de capture d'écran et de son : avec RunAsNode actif, un processus local peut exécuter du code sous cette identité. Une signature ad hoc change à chaque construction, ce qui redemande vraisemblablement les autorisations macOS après chaque `npm run package:mac` (supposé, non observé). L'app n'est pas distribuable hors du poste qui l'a construite.
- **Nuance du relecteur (elle prime) :** Lecture exacte : package.mjs:2-11, open-mac.mjs:5, @electron/packager dist/mac.js:424-441 et 517-533, app/main.cjs:38, @electron/fuses absent. Deux appelants manquent au constat.

  (1) adapters/codex-video-agent.cjs:15 lance mcp/server.cjs avec process.execPath et ELECTRON_RUN_AS_NODE=1. Dans le paquet, couper le fusible RunAsNode casse cet agent. Il est hérité (aucun import depuis app/ ni runtime/), donc sans effet sur le produit, mais la décision sur les adaptateurs hérités (OPS-11, ADP-11) devient un prérequis, en plus d'OPS-08.

  (2) Playwright pilote Electron par l'inspecteur Node : avec EnableNodeCliInspectArguments à faux, `_electron.launch` ne peut plus s'attacher au paquet. Le contrôle de lancement du point 5 ne peut donc pas réutiliser smoke-electron ; il lui faut un autre moyen (lancement, build-info lu par un fichier ou une sortie, fermeture).

  Le renouvellement des autorisations macOS après chaque construction reste supposé, comme l'audit le dit.

<a id="OUBLI-28"></a>
#### OUBLI-28 — Version de Codex CLI non fixée côté serveur

**Verdict : nuancé** · Signalement du relecteur — Scripts et outillage

_Signalé par un relecteur d'audit ; le découpage le reprend autrement._

**Suite : pas de ticket.** Épingler la version de Codex sur le serveur (deploy/codex/package.json plus verrou) exige de choisir entre 0.158.0, le serveur de référence (docs/server-installation.md:55), et 0.160.1, le cloisonnement mesuré (adapters/codex-confinement.cjs:182). Le verrou se génère en ligne, ce qui est interdit dans la boucle. — _Reprise :_ Décision 4 de la fiche prise par le propriétaire, et verrou généré par lui hors boucle ; à découper avec l'étape 5 (scripts serveur).

- **Signalement :** Version de Codex CLI non fixée côté serveur. deploy/tvlens.service:16 pointe /opt/tvlens/codex/node_modules/.bin/codex, une « installation npm séparée » (docs/server-installation.md:55) sans package.json ni lockfile dans le dépôt. Or le cloisonnement n'est mesuré que sur 0.160.1 (adapters/codex-confinement.cjs:182) et le serveur de référence est en 0.158.0 (docs/server-installation.md:9). Le script deploy/install.sh d'OPS-15 devrait installer une version épinglée depuis un fichier versionné.

### Signalements sans lot

Ces signalements portent sur la méthode de l'audit, pas sur le code.

| Constat | Titre | Verdict | Priorité | Suite |
| --- | --- | --- | --- | --- |
| [OUBLI-16](#OUBLI-16) | L'audit est figé sur 8627b46 et ignore le harnais ajouté cinq commits plus tard sur refactor/maintenabilite | confirmé | — | pas de ticket |
| [OUBLI-26](#OUBLI-26) | Harnais de qualité déjà présent sur la branche de travail | confirmé | — | pas de ticket |
| [OUBLI-30](#OUBLI-30) | Doublons entre audits, avec des formes cibles qui divergent, à fusionner avant le découpage en tickets | confirmé | — | pas de ticket |
| [OUBLI-31](#OUBLI-31) | Le harnais entré après la copie auditée contraint presque toutes les remédiations | confirmé | — | pas de ticket |
| [OUBLI-40](#OUBLI-40) | La copie auditée précède le harnais de livraison et le ticket sur le 429 | confirmé | — | pas de ticket |

<a id="OUBLI-16"></a>
#### OUBLI-16 — L'audit est figé sur 8627b46 et ignore le harnais ajouté cinq commits plus tard sur refactor/maintenabilite

**Verdict : confirmé** · Signalement du relecteur — Documentation et dépôt

_Signalé par un relecteur d'audit ; fait de méthode, sans objet pour le code._

**Suite : pas de ticket.** Sans objet pour un ticket : l'audit portait sur une copie figée antérieure au harnais, le découpage a été fait sur la tête de branche, harnais compris (ses contraintes figurent dans les règles données aux rédacteurs).

- **Signalement :** L'audit est figé sur 8627b46 et ignore le harnais ajouté cinq commits plus tard sur refactor/maintenabilite (commit 0262480, tête 208d2e3, vérifié par git show en lecture seule) : CLAUDE.md, docs/standards.md, docs/adr/0000-gabarit.md, docs/travail/tickets/_gabarit.md, scripts/check.mjs, scripts/quality/baseline.json, scripts/loop/. Ces fichiers réalisent déjà une partie de DOC-01, DOC-04, DOC-06, DOC-08 et DOC-16, et .claude/hooks/guard-write.mjs protège en écriture .claude/, scripts/check.mjs, scripts/quality/, scripts/loop/, CLAUDE.md et docs/standards.md : tout constat qui ajoute une règle ou un contrôle (DOC-03, 06, 07, 16, 18) doit devenir un ticket « harnais: oui ». Rebaser le plan sur la tête de branche avant le découpage.

<a id="OUBLI-26"></a>
#### OUBLI-26 — Harnais de qualité déjà présent sur la branche de travail

**Verdict : confirmé** · Signalement du relecteur — Scripts et outillage

_Signalé par un relecteur d'audit ; fait de méthode, sans objet pour le code._

**Suite : pas de ticket.** Sans objet pour un ticket : l'audit portait sur une copie figée antérieure au harnais, le découpage a été fait sur la tête de branche, harnais compris (ses contraintes figurent dans les règles données aux rédacteurs).

- **Signalement :** Harnais de qualité déjà présent sur la branche de travail (hors ROOT : HEAD 208d2e3 de refactor/maintenabilite, 6 commits après 8627b46). scripts/check.mjs est le contrôle unique (`npm run check`) : règles par fichier, emplacements Prettier et ESLint qui s'activent dès que l'outil est installé, tests JS en séquentiel, tests Python de tests/. S'y ajoutent scripts/quality/baseline.json (cliquet à 7 mesures), .claude/hooks/ (garde des commandes, fichiers protégés, installation refusée sans « installe: oui »), scripts/loop/, docs/standards.md (160 caractères par ligne, « aucun test ne compare le texte du code source ») et le ticket 001 sur l'échec intermittent. OPS-02, 03, 04, 05, 06, 07, 11, 13 et 19 décrivent un outillage à créer à côté : leurs remédiations doivent s'y brancher.

<a id="OUBLI-30"></a>
#### OUBLI-30 — Doublons entre audits, avec des formes cibles qui divergent, à fusionner avant le découpage en tickets

**Verdict : confirmé** · Signalement du relecteur — Scripts et outillage

_Signalé par un relecteur d'audit ; fait de méthode, sans objet pour le code._

**Suite : pas de ticket.** Sans objet pour un ticket : les doublons entre audits et leurs formes cibles divergentes ont été tranchés avant le découpage (arbitrages A1 à A9, repris dans le rapport de nuit).

- **Signalement :** Doublons entre audits, avec des formes cibles qui divergent, à fusionner avant le découpage en tickets : OPS-08 et DOC-09 (scripts/lib/package-filter.mjs `keeps` contre scripts/package-filter.mjs `isPackaged`, mcp inclus ou non) ; OPS-18 et DOC-10 (tests/test_tv_remote_*.py et test:py contre tests/python/ et test:python ; PY-04 dit test:tv) ; OPS-20 et DOC-12 (docs/evidence contre docs/archive) ; OPS-11 et ADP-11 (scripts/legacy contre scripts/lib/legacy) ; OPS-15 et DOC-15 (test des variables d'environnement) ; OPS-01 et DOC-19 (fichier de version de Node). Sources : consolide/audit_docs-depot.json, audit-adapters.md:151, audit-ui.md:134, dans le dossier de travail de l'audit.

<a id="OUBLI-31"></a>
#### OUBLI-31 — Le harnais entré après la copie auditée contraint presque toutes les remédiations

**Verdict : confirmé** · Signalement du relecteur — Tests nommés par chantier

_Signalé par un relecteur d'audit ; fait de méthode, sans objet pour le code._

**Suite : pas de ticket.** Sans objet pour un ticket : l'audit portait sur une copie figée antérieure au harnais, le découpage a été fait sur la tête de branche, harnais compris (ses contraintes figurent dans les règles données aux rédacteurs).

- **Signalement :** Le harnais entré après ROOT (commits 0262480 et e47c1aa, lus par git show) contraint presque toutes les remédiations et l'audit ne le connaît pas. scripts/check.mjs:53-66 refuse tout fichier qui gagne une ligne de plus de 160 caractères ; scripts/check.mjs:98-99 ne lance que tests/*.test.cjs, à plat, alors que scripts/quality/metrics.mjs:74 compte les tests récursivement ; scripts/quality/baseline.json fixe cas_de_test à 612 (ne peut pas baisser) et tests_nommes_par_chantier à 9. Conséquences : les sous-dossiers tests/architecture/ et tests/process/ ne seraient pas exécutés par le contrôle, les suppressions de TSTA-14 et 15 sont bloquées sans compensation, et aucun test ne se déplace sans formatage préalable.

<a id="OUBLI-40"></a>
#### OUBLI-40 — La copie auditée précède le harnais de livraison et le ticket sur le 429

**Verdict : confirmé** · Signalement du relecteur — Tests de comportement

_Signalé par un relecteur d'audit ; fait de méthode, sans objet pour le code._

**Suite : pas de ticket.** Sans objet pour un ticket : l'audit portait sur une copie figée antérieure au harnais, le découpage a été fait sur la tête de branche, harnais compris (ses contraintes figurent dans les règles données aux rédacteurs).

- **Signalement :** La copie figée (8627b46) précède le harnais de livraison du dépôt (commits 0262480 et 932b8e0 : scripts/check.mjs, cliquet, docs/standards.md, skill tests) et le ticket docs/travail/tickets/001-resent-block-duplicate-without-race.md, qui porte déjà sur le 429. Les scripts npm, seuils et conventions de nommage proposés par TSTB-02, TSTB-03 et TSTB-17 doivent s'y raccorder au lieu de créer une seconde porte de contrôle. Non vérifié : ces fichiers sont hors de ROOT et n'ont pas été ouverts.

## Ce qu'il faut préserver

Ce que les auditeurs ont trouvé sain et qu'un ticket ne doit pas abîmer en passant.

### Cœur et composition (`core/`, `runtime/`)

- `core/` sans import sortant ni `process` (test d'architecture) ; dépendances et horloge injectées par constructeur.
- Fonctions pures déjà isolées et testées : `validateDetection`, `applyVerdicts`, `claimKey`, `sameClaim`, `sentences`, `validateRecap`, `holdsMedia`, `perceptionContext`, `sessionTimeline`, `latency-trace`.
- Invariants de preuve : citations bornées aux preuves réellement consultées, source acceptée seulement si la page a été ouverte, préfixe figé par question.
- Gardes contre les résultats tardifs (`generation`, `epoch`, `latest`, `captureEpoch`). Une machine à états explicite doit en garder la sémantique.
- Files bornées avec compteur de perte : rien n'est écarté sans trace.
- `session-closing.cjs` : petit, sans I/O, ne rejette jamais. C'est le modèle des extractions.
- `tick()` piloté par l'hôte dans `Surveillance`, et timers injectés dans `MomentIndex`.
- Vues par liste blanche (`HEADER`) et etag par compteurs.
- `resolveLimits` avec `BOUNDS` : refus au démarrage d'un réglage mal saisi.
- Commentaires d'invariants (« pourquoi ») et ADR : à déplacer avec le code, pas à résumer.

### Adaptateurs et frontières

- `core/` n'importe ni adaptateur ni E/S (grep vérifié) ; aucun adaptateur n'importe `runtime/`, `server/` ou `app/`.
- Chemins : `SessionLibrary.dir()`/`folder()` (UUID, `lstat`, enfant direct), `LocalSessionStore.file()`, liste fermée `FILES`, écritures atomiques en `0600`.
- Confinement Codex : refus par défaut, relecture de `thread/start` et `config/read`, liste blanche d'éléments et d'environnement, `validMediaInput` (images en ligne seulement), plafonds de rôle.
- Processus : `spawn` sans shell, aucun argument issu de données externes, propriété du groupe de processus avec escalade et crochet de sortie, délais partout sur le chemin Codex.
- Secrets : jeton généré sur 32 octets, jamais journalisé ; `safeStorage` ; jeton du modèle local en champs privés ; expurgation `clean()`/`safeError()`.
- HTTP : authentification avant lecture du corps, CORS limité à `Origin: null`, ETag/304, une préparation à la fois, déduplication par empreinte.
- IPC : garde unique `handle`, navigation et fenêtres refusées, `safeExternalUrl` sur des sources réellement ouvertes, série `exclusive` des transitions.
- Points d'injection de test explicites (`rpcFactory`, `clientFactory`) et le test qui vérifie qu'aucun hôte ne les passe.

**Non vérifié** : le rendu du contenu de modèle dans `app/renderer.js` (hors périmètre ; un grep n'y trouve aucun `innerHTML`), le comportement réel d'Electron sur un accélérateur invalide, et l'exécution des tests cités (non lancés, par consigne).

### Interfaces (Mac, TV, scripts Python)

- Modèles de vue purs avec horloge injectée (`*.mjs`, haut des fichiers TV avec garde CommonJS). `tests/chat-error-ui.test.cjs` vérifie qu'ils ne touchent ni `window` ni `document`.
- `KeyedList` (`app/ui/list-view.mjs`) et la délégation `data-action` (`renderer.js:331-356`).
- Rendu en `textContent` uniquement (`format.js:element`). Sources ouvertes par `(jobId, index)` côté processus principal, jamais par URL venue du DOM. CSP du Mac.
- `preload.cjs` : chaque abonnement renvoie sa désinscription.
- TV : `PollPlan` avec ETag/304, recul et horloge monotone ; fusion d'état par identifiant ; `parseAmbientParams` reconstruit champ par champ ; tripwires d'`ambient.js`.
- Garde-fou `tv-app-compat.test.cjs` et fixture de file partagée JS/Python.
- Python : injection de `clock`, `sleep`, `luna`, `paths`, `proc_root` ; écriture atomique ; porte à écrivain unique sous verrou ; listes fermées de routes ; comparaison en temps constant.

Non vérifié : comportement réel sur le téléviseur, contenu de `scripts/package.mjs`, CSS au-delà de la densité, `main.cjs`.

### Déterminisme des tests

- Tous les sockets de test écoutent sur le port 0 en loopback (12 sites Node, plus ThreadingHTTPServer(('127.0.0.1', 0)) côté Python) : aucune collision possible entre fichiers parallèles.
- Un mkdtemp par test (91 appels dans 38 fichiers) nettoyé par t.after ou finally : après une centaine de lancements, mon TMPDIR privé était vide hors des deux exécutions tuées.
- Horloges injectées dans 37 fichiers de tests (now, readClock, wallClock) ; DiskGuard reçoit freeBytes et now ; MomentIndex, MomentSearch et CodexVerifier reçoivent setTimer et clearTimer. C'est la forme cible à généraliser.
- Doublures à barrière déjà en place : assembly().hold et held (architecture-f06.test.cjs:104-117), disk().hold, release et reached (server-sessions.test.cjs:32-49, session-durable.test.cjs:64), crochet gate du faux App Server (verification.test.cjs:88-96), 81 usages de deferred() et 74 de job.done.
- Signaux du produit sur lesquels les tests peuvent attendre : operation.settled (runtime/headless-runtime.cjs:722-741), watch.landed() (core/session.cjs:92), LocalStore.flush() (adapters/local-store.cjs:202).
- until et bounded de architecture-f05, f06 et f07 échouent en nommant le fait attendu au lieu de bloquer ; leurs bornes comptées en tours de sondage résistent mieux à un processus ralenti qu'une borne en temps mural.
- Faux binaires en scripts Node à shebang (ffmpeg, whisper, codex) : la suite n'a besoin d'aucun outil réel ni du réseau.
- En-têtes de architecture-f05, f06 et f07 qui disent ce qui est réel et ce qui est simulé, avec la règle « nothing here measures a latency ».
- Le contrat 429 « occupé, renvoyer » du transport et sa reprise par tv/transport.py:85-92 : c'est lui qui rend le défaut de FLK-01 bénin côté produit.
- Les états globaux modifiés par les tests (process.env, argv, stderr, require.cache, Date.now) sont tous restaurés en finally ou t.after.
- Aucun test.only, aucun todo, aucune relance dans la suite ; les seuls skip sont motivés (win32, ffmpeg).

### Documentation et dépôt

- La discipline des niveaux de preuve : SECURITY.md distingue réel, scripté, hors ligne et non mesuré ; le README sépare « ce qui est prouvé » de « ce qui reste à mesurer » et garde les échecs. C'est la meilleure qualité de cette documentation.
- La structure des ADR, identique sur les dix : Contexte, Décision en règles numérotées, Alternatives écartées avec la colonne « Exécutée ? », Conséquences, Limites. Les titres énoncent un invariant, pas un sujet.
- Les tableaux « Fichiers » (fichier → rôle) et « Limites et dettes » (sujet, origine, suite proposée) des historiques : matière première du registre de dettes et des champs Modules et Protégé par.
- Le code de production sans aucun identifiant de chantier : 0 occurrence de F01–F10 dans core, adapters, runtime, server, mcp, app, tv, scripts, deploy.
- La règle de langue, tenue presque sans exception : commentaires et noms de tests en anglais, messages et documentation en français.
- L'exactitude des mécanismes décrits dans docs/architecture.md : toutes les constantes vérifiées (55/45, 1,5 s, 30 s, 1 Gio et 2 Gio, 300 000 ms, cinq questions, 1 à 3 postes, six images par planche) correspondent au code.
- tests/architecture.test.cjs, qui rend vraie et outillée l'affirmation « cœur sans import externe » : modèle à suivre pour les autres affirmations de la documentation.
- La section « Recherche et historique » de docs/README.md et les cinq bandeaux d'archive existants : le principe est bon, il faut le généraliser.
- La provenance des médias et du code tiers : media/samples/README.md (sources, licences, SHA-256), README de screenshots/, prototypes/lg-remote/LICENSE.upstream et vendor/upstream.json.
- Le .gitignore qui écarte secrets, jetons d'appairage, profils VPN et médias bruts, et les fichiers .env.example et deploy/*.example aux valeurs fictives.
- Les liens relatifs de la documentation : 404 sur 417 se résolvent.
- Les rapports d'essais bruts comme preuves datées : à archiver et alléger, pas à supprimer.
- Les commentaires d'invariants en tête de fichier de test (une phrase qui dit la règle protégée) : à garder en remplaçant seulement l'étiquette F0x par le lien vers l'ADR.

### Scripts et outillage

- tests/deploy-unit.test.cjs : il lie TasksMax, Restart et KillMode de l'unité systemd au nombre de rôles Codex que le code peut garder vivants ; modèle à suivre pour les autres fichiers de déploiement.
- deploy/tvlens.service : utilisateur dédié, ProtectSystem=strict, PrivateTmp, ReadWritePaths limité, limites mémoire et CPU, et le commentaire daté qui explique la valeur de TasksMax par la mesure.
- tests/mac-ui.test.cjs:694-698 : garde statique qui vérifie que deux scripts n'appellent que des méthodes exposées par le preload ; à généraliser, pas à supprimer.
- tests/tv-app-compat.test.cjs : compilation de chaque fichier de tv/app en script classique et liste d'API trop récentes ; le lint peut la compléter, pas la remplacer.
- tests/architecture.test.cjs et la matrice d'imports actuelle, propre : core n'importe rien, aucune dépendance à contresens entre couches, aucune dépendance de la production vers scripts/ ou tests/.
- Les parcours TV chargent tv/app depuis une copie temporaire sans connection.js, avec un commentaire qui dit pourquoi ; ce réflexe doit survivre à la factorisation.
- scripts/package-tv-ambient.mjs : `assemble` refuse un dossier non vide, refuse un identifiant de sonde sans --probe et inversement, et est couvert par tests/tv-ambient-params.test.cjs.
- prototypes/lg-sidebar/package.py:14 écarte connection.js du paquet TV ; le filtre doit être repris dans le nouvel empaqueteur.
- Les en-têtes des scripts disent ce qu'ils prouvent et ce qu'ils ne prouvent pas, quels fournisseurs sont réels et ce qui coûte ; à reprendre dans scripts/README.md.
- L'option --root de 5 scripts (bench-backend, bench-perceived, simulate-stream, replay-lg-stream, replay-reinspection) permet de mesurer une autre révision avec le même script ; à conserver dans scripts/lib/tree.cjs.
- scripts/simulate-stream.cjs : rejeu déterministe avec horloge virtuelle et graine, réutilisé par deux tests.
- scripts/setup-speech.mjs vérifie le SHA-256 du modèle téléchargé et écrit d'abord dans un fichier temporaire ; scripts/setup-codex.cjs sauvegarde la configuration Codex et refuse d'écraser une entrée différente.
- scripts/probe-confinement.cjs et la procédure « avant tout déploiement » de SECURITY.md : une étape sans tour de modèle (--steps r) existe déjà et peut devenir une porte de deploy/update.sh.
- tests/tv_fakes (faux luna-send et faux arecord placés en tête de PATH) et la simulation simulate-tv-ambient.mjs qui fait tourner les vrais controller.py et ambient.py.
- prototypes/lg-remote/vendor : provenance, commit et SHA-256 dans upstream.json (somme recalculée, identique), licence amont conservée.
- package-lock.json en version 3, entièrement résolu sur le registre npm avec empreintes, cohérent avec package.json ; installation serveur par `npm ci --omit=dev`.
- .gitignore couvre les secrets connus (jeton d'appairage, auth.json, profils VPN, connection.js, fichiers d'environnement privés) ; aucun motif de secret trouvé dans la copie figée.
- app/main.cjs:38 : les doublures de test et les drapeaux --live-* ne s'activent que hors paquet (`!app.isPackaged`).
- tv/tailscale-service.sh : set -eu, umask 077, vérification du PID par /proc avant tout kill.

### Tests nommés par chantier

- Les titres de test rédigés comme des phrases de comportement : ils servent déjà de spécification et permettent de vérifier un déplacement (mêmes titres avant et après). Les garder à l'identique.
- Les en-têtes de fichier qui disent ce qui est prouvé hors ligne et ce qui ne l'est pas (« nothing here measures a latency », « what Codex really exposes to a model is measured by scripts/probe-confinement.cjs ») et les mentions « Measured on codex 0.160.1 » qui datent une observation externe.
- Les tests à travers les vraies compositions : vrai HeadlessRuntime derrière un vrai RemoteServer sur la boucle locale, vrais app/main.cjs et app/preload.cjs derrière un faux Electron, vrai client Codex derrière le vrai transport avec des programmes Node à la place de Codex et de FFmpeg.
- `onBothHosts` (architecture-f07.test.cjs:311-312) : le même scénario exécuté sur l'hôte Mac et sur l'hôte serveur, chaque hôte exposant les mêmes gestes (start, send, pause, end, remove, open, ask). C'est le modèle à généraliser pour la parité.
- La discipline de nettoyage : `t.after` qui tue les processus lancés (`reap`), qui ferme l'hôte avant de supprimer son dossier, `bounded()` qui fait échouer au lieu de bloquer, `created(t)` et `scratch(t)` qui ne suivent que les dossiers créés par le test, le numéro de groupe `NOBODY` pour qu'aucun signal n'atteigne un vrai processus, le dossier d'identifiants volontairement inexistant.
- Les faits nommés comparés d'un bloc dans f06 et f07 : tous les faits d'un scénario sont rapportés ensemble au lieu de s'arrêter au premier.
- Les horloges injectées et `t.mock.timers` pour les bornes de 3 s, 10 s et 24 h : aucun test n'attend un vrai délai long du produit.
- Les gardes statiques utiles : core sans dépendance sortante ni globale de plateforme, aucun hôte ne passe `rpcFactory` ni `features`, les fichiers de deploy/ ne posent aucun réglage affaibli.
- Les tables de cas des fonctions pures et des gardes (plages d'octets de f10, erreurs classées de f08, éléments refusés et autorisés de codex-confinement:585) : elles deviennent des sous-tests nommés, sans perdre un cas.
- Les tests de non-régression qui épinglent un défaut par son cas d'échec (review-regressions) : garder le cas et son commentaire, ne changer que le fichier d'accueil.
- La séparation déjà faite dans f07 entre le protocole seul sur des doubles (:75 à :154) et les scénarios sur les deux hôtes : c'est la bonne pyramide.
- Les fixtures partagées existantes (tests/fixtures/tv-overlay-queue-cases.json, les trois .webm) : seul exemple actuel de partage, à étendre.

### Tests de comportement

- Injection par constructeur partout : `now` ×49 dans 20 fichiers, `readClock` ×18, `wallClock`, `rpcFactory`, `clientFactory`, `fetchImpl`, `freeBytes`, `setTimer`. Aucun `global.fetch =` ni `Date.now =` dans le périmètre.
- tests/surveillance.test.cjs : harnais `harness()` (31-39), ports scriptés ou à barrière (20-29), et `invariants(state)` (41-44) vérifiés sur chaque état publié. Aucune minuterie, horloge injectée, avance par `tick()`.
- tests/moment-index.test.cjs:17-58 : `manualClock`, `provider`, `memoryCache`, `setup`. C'est le modèle de test unitaire à généraliser : délais exacts à la milliseconde, sans temps réel.
- Preuves « rien n'a été écrit » octet pour octet (`tree()` avec empreinte et date, `bytesOf()`), par exemple session-durable:131, 180, 473 et surveillance-runtime:616-617.
- Disque fautif déterministe : `refusing()` et `disk()` avec hold, release et refuse (session-durable:37-66). Garder ces scénarios en changeant seulement le mécanisme d'injection (TSTB-12).
- Faux exécutables pour éprouver la vraie gestion de processus (sortie non nulle, blocage, SIGKILL) plutôt qu'un mock de `spawn` : clip-unreadable:85-91, transcriber-sharing:9-22, codex-stream-decoding.
- Nettoyage systématique : les 29 fichiers qui créent un dossier temporaire le suppriment (`t.after` ×47, `finally` ×29) ; barrières relâchées en fin de test (session-durable:60).
- Archives héritées écrites à la main comme contrat de compatibilité (forme de septembre 2026, session-durable:152-161 ; ancien cache d'embeddings, moment-index:507-519) et fixtures binaires réelles dans tests/fixtures/*.webm.
- Noms de tests rédigés comme des règles métier en anglais, commentaires qui disent pourquoi, traces des contrats changés (« Adapted on purpose », session-durable:226-228 ; note de retrait dans viewing-features:4-9). À raccourcir, pas à perdre : le détail passe en commentaire ou en `describe`.
- Tables de cas hostiles déjà présentes : identifiants de session (server-sessions:248-255), états sauvegardés malformés (session-durable:499-527), expurgation des secrets (chat-trace:17-29), textes de carte refusés (surveillance:370-379).
- Sondes chiffrées par `t.diagnostic` (session-durable:870-871, server-sessions:770) et rejeu déterministe par graine (stream-simulation:20-23).
- Rapidité : 416 tests sur 602 durent moins de 20 ms ; les 12 fichiers purs du cœur passent en 0,39 s. La couche unitaire existe déjà de fait, il reste à la nommer.
- Garde contre les identifiants réels là où elle est appliquée (`authHome` inexistant, surveillance-runtime:20-21 et verification:75) et vérification qu'aucune clé ne passe au sous-processus (verification:44-48).

### Tests des interfaces

- La fixture partagée tests/fixtures/tv-overlay-queue-cases.json : versionnée, protocole écrit dans le fichier, règle « un changement de sens = un cas ajouté », jouée par deux chemins JS et deux chemins Python, et elle-même contrôlée (tests/tv-overlay-queue.test.cjs:41-51).
- Le banc d'hôte de tests/mac-ipc-contract.test.cjs:141-225 : vrai app/main.cjs et vrai app/preload.cjs sous un faux Electron, structuredClone dans les deux sens, préfixe d'erreur d'Electron reproduit, minuteries virtuelles, userData temporaire, hôtes toujours quittés avant suppression ; moins de 0,7 s par test.
- Les modèles de vue Mac testés sur l'état produit par le vrai coeur (watchedSession, tests/mac-ui.test.cjs:143-178) et le test de parité de sens Mac/TV (tests/mac-ui.test.cjs:69-103).
- tests/tv-app-compat.test.cjs : plancher moteur de la TV, auto-test du garde (l.58-67), message d'échec réduit à l'extrait fautif (fonction absent, l.31), fichier de secret connection.js jamais lu.
- Le plancher de non-vacuité de tests/tv-panel.test.cjs:542 (`counted.size >= 6`) : à généraliser à tout garde fondé sur une extraction.
- Les tests Python hermétiques : horloge injectée, dossier d'exécution temporaire, faux /proc, faux binaires par le PATH, ports éphémères, bibliothèque standard seule, scénario au rythme réel sur option TVLENS_SLOW.
- Les smokes navigateur TV : copie temporaire sans connection.js (jamais le vrai jeton), toutes les requêtes interceptées, horloge de page pilotée, contrôle au pixel, option --app ou TVLENS_SMOKE_APP pour prouver qu'une page cassée est détectée, et l'énoncé explicite de ce qui n'est pas prouvé sur la TV.
- Le smoke Electron : userData isolé en mode smoke (app/main.cjs:42), capture synthétique sans réseau ni modèle, second lancement à plancher disque absurde sans toucher l'espace réel.
- Le test du paquet ambiant par le vrai assembleur (tests/tv-ambient-params.test.cjs:94-116) et le refus en bloc de parseAmbientParams (l.33-55).
- tests/chat-error-ui.test.cjs:10-19 : les scripts TV se chargent en CommonJS sans toucher window ni document ; liste exacte des exports de companion.js.
- Les titres de tests écrits comme des phrases de comportement et les messages d'assertion qui nomment la règle produit.

### Complément : contrat de fil entre parties déployées

- Les contrats par fichiers internes à la TV portent déjà une version et des capacités entières, fermées par défaut : porte `v: 2` (tv/ambient.py:176, prototypes/lg-remote/runtime/ambient_relay.py:92), paramètres de la page `v: 1` (tv/app/surveillance-overlay.js:370), `ambientRelay >= 2` et `panelYield == 1` (tv/ambient.py:775-776), `gate == 1` dans le rapport de capture, avec des causes nommées (panel-outdated, server-unsupported, capture-not-gated, no-relay). C'est le modèle à étendre au fil HTTP.
- La revalidation par ETag pensée pour un serveur plus ancien : If-None-Match n'est envoyé qu'après qu'un serveur a donné un tag (tv/app/remote-client.js:64-85) ; le serveur route sur le chemin seul et ignore un paramètre de requête inconnu (server/http.cjs:67-69, observé).
- Les ajouts déjà faits dans les deux sens sans rupture : déclaration `overlay` absente quand rien n'est coupé (tv/capture.py:218-219), forme sans session de /ambient/seen encore acceptée (tv/controller.py:174-180), `sessionId` facultatif dans /v1/media (server/http.cjs:126-132).
- Le refus à statut et code (runtime/headless-runtime.cjs:68-70, server/http.cjs:278-279) et, côté capture, des exceptions distinctes avec leur cause : une réponse du serveur n'est jamais racontée comme une coupure réseau (tv/transport.py:7-17, :76-84, et leurs tests).
- La liste d'autorisation HEADER des vues (runtime/headless-runtime.cjs:40-60), les bornes de taille et les listes de clés affirmées dans tests/server-state-views.test.cjs:61-98 : à convertir en déclaration partagée, pas à supprimer.
- La dégradation douce côté TV : une phrase d'activité inconnue est gardée entière (tv/app/surveillance-overlay.js:140), une cause d'arrêt inconnue est dite avec les mots de la capture (tv/app/sessions-view.js:326), la fusion des questions par identifiant ne lit jamais une absence comme une suppression (tv/app/companion.js:326-360).
- La distinction entre refus de vue durable et refus passager, avec recul borné des interrogations, et ses tests (tv/app/companion.js:236-299, tests/tv-panel.test.cjs:120-165).
- Les scripts de tv/app sont des scripts classiques dont la partie pure est exportée pour Node (tv/app/remote-client.js:170, tv/app/companion.js:363-378) et tenus sous le plancher moteur par tests/tv-app-compat.test.cjs : c'est ce qui rend possible un test conjoint sans navigateur.
- L'authentification à temps constant des deux côtés et le message distinct pour un jeton refusé (server/http.cjs:52-58, tv/controller.py:285-288, tv/app/companion.js:1174).

### Complément : formats écrits sur disque

- Écriture d'état sérialisée et atomique, un seul état en attente par fichier, refus mémorisé jusqu'à la prochaine écriture réussie, barrière `flush` avant de dire une session archivée (adapters/local-store.cjs:157-207 ; ADR 0002 et 0003).
- Lire n'écrit pas : `SessionLibrary.list` et `read` ne créent ni ne modifient rien, et les tests le prouvent octet pour octet avec le helper `tree` (tests/session-durable.test.cjs:22-32, 22 comparaisons ; 24 dans tests/server-sessions.test.cjs). Ce helper est la base du test d'archive de référence.
- Gardes de forme qui refusent en clair avant de construire quoi que ce soit : `restorable` (core/session.cjs:17-20), `readableManifest` (adapters/session-library.cjs:18-23), contrôle dans createSessionRuntime (runtime/session-runtime.cjs:72-80), message unique « Archive illisible. », état `unreadable` dans la liste.
- La règle du registre de surveillance à l'activation : un registre qui ne se lit pas n'est ni repris ni remplacé, la surveillance continue en mémoire et le dit ; essai de restauration sur un cœur à part avant d'adopter (runtime/surveillance-runtime.cjs:172-184, :289-304, :320-331). C'est le modèle à généraliser aux autres fichiers.
- Lecture additive avec valeurs par défaut explicites (core/surveillance.cjs:529-550, core/session.cjs:453-462), champs inconnus d'un passage conservés par copie, champs inconnus du manifeste conservés par fusion (adapters/local-store.cjs:196).
- L'intervalle voyage avec le média (adapters/local-store.cjs:54-55), ce qui permet de remettre sur la frise un passage que l'état sauvegardé ne connaît pas ; les orphelins et les demi-paires sont comptés et signalés, jamais effacés (adapters/session-library.cjs:100-112).
- Liste par manifeste seul, sans lire session.json (adapters/session-library.cjs:123-124, vérifié par tests/session-durable.test.cjs:104-107).
- Le contrat de conservation appartient à l'archive : une session « until-deleted » le reste sur un hôte réglé en fenêtre glissante (core/session.cjs:472-474).
- Sûreté des chemins : identifiant de session par expression régulière, dossier vérifié par `lstat` sans suivre de lien, identifiant de passage validé, liste fermée des noms pour `load` (adapters/session-library.cjs:66-76 ; adapters/local-store.cjs:31-35, :143-144) ; modes 0600 et 0700.
- L'honnêteté du produit sur l'ancien : drapeau `legacy`, libellé « Texte seul », motif `not-kept`, et la doctrine écrite « additif, ni migré ni effacé » (docs/architecture.md:39 ; docs/night-features-delivery.md:195).
- En-tête de embeddings.json nommant le modèle, dernière ligne tronquée ignorée puis journal réécrit une fois (adapters/embedding-store.cjs:9-16).

### Complément : journal et diagnostic d'une panne

- core/ sans `process` ni `console` (grep vide) : le diagnostic y entre par constructeur (`onTrace`, `serializeError`, core/deep-ask.cjs:18) et ne peut jamais faire échouer un travail (`try { … } catch {}` autour des deux crochets, :22-23). Le port de journal doit suivre ce modèle.
- L'état comme premier journal : l'échec reste sur le passage, sur la question (`errorDetail` expurgé, core/deep-ask.cjs:141), sur la surveillance (compteurs, `backlog.failure`, `persistence`), dans `store.refused`, `closeErrors` et `lastEnd`. Le journal s'ajoute à ces traces, il ne les remplace pas.
- `safeError` : liste blanche de champs, profondeur bornée, ne lève jamais, couvert par 7 tests (tests/chat-trace.test.cjs) ; `clean()` expurge jetons, URL et valeurs opaques.
- Confidentialité déjà tenue aux points d'émission : `questionLength` au lieu de la question (core/deep-ask.cjs:68) ; seules des durées numériques sortent de la sortie d'erreur de Whisper (adapters/whisper-diagnostics.cjs:1) ; un refus d'écriture nomme le fichier logique et le code système, pas le chemin (adapters/local-store.cjs:9-11) ; la ligne de démarrage écrit le chemin du fichier du jeton, jamais le jeton (server/main.cjs:41).
- `closeSession` : un seul rédacteur de la ligne de fin incomplète, journal injecté, appel protégé (runtime/session-closing.cjs:126-131), même protocole sur les deux hôtes (ADR 0007), couvert par architecture-f06, architecture-f07, server-sessions et mac-ipc-contract.
- Les textes français et les statuts des réponses HTTP lus par la TV (400 pour le contenu, 503 `media-unavailable` pour l'hôte, 507 `storage-full`) : le journal reçoit le détail, la réponse ne change pas.
- Le rapport de capture de la TV : écriture atomique, 10 dernières erreurs, `dropReasons` par cause, `stopReason` toujours renseigné (tv/capture.py:121-129, 231-233).
- L'intention de `reportOnce` (pas d'inondation du journal du service) : garder une borne, en changer la forme.
- La sémantique de crash du serveur : sortie 1 et `Restart=on-failure` (deploy/tvlens.service:23-24). Le gestionnaire de dernier recours écrit puis sort ; il ne tente ni reprise ni archivage.
- Un arrêt propre de la capture n'écrit rien sur stderr (tests/test_tv_capture_gate.py:289).

## Ce qui n'a pas été vérifié

Ce que les auditeurs disent eux-mêmes ne pas avoir vérifié, puis ce que les rédacteurs de tickets n'ont pas pu vérifier.

### Déterminisme des tests

- La suite complète n'a pas été lancée (interdit) : toutes les reproductions portent sur un fichier à la fois. Le journal de l'échec d'origine (1 lancement complet sur 3) n'était pas disponible ; je l'ai reproduit moi-même.
- Lancements réussis, dont rien n'est conclu : B et E (horodatage seul) ; D1 et D2 ; 17 des 19 fichiers sous +5 ms ; 46 des 50 fichiers sous sonde large +10 ms, plus le second lancement de server-sessions ; les 13 lancements sous blocage de processus ; le témoin sans sonde de session-durable ; verification à +5 ms.
- Ce qui garde vivant le processus de verification.test.cjs après son échec n'est pas identifié.
- L'enchaînement exact de l'exception « parser.deref » de server-sessions (FLK-07) : observée 1 fois sur 2, non rendue déterministe.
- Les sondes ne retardent que node:fs/promises et ne bloquent que le processus de test. Ne sont pas injectés : fs synchrone, pool de threads de sharp, latence de lancement des processus enfants, latence des sockets.
- Les 204 attentes à nombre de tours et les 65 pauses n'ont pas été lues une par une : inventaire par motif, lecture par échantillon. Les sites de FLK-08 et une partie de ceux de FLK-09 sont repérés par motif.
- Tests Python (tests/test_tv_*.py, 1565 lignes) : en-têtes lus seulement, non lancés.
- Comportement de la suite sur un runner Linux ou sur une machine à 2-4 vCPU ; mémoire par processus de test et concurrence optimale non mesurées ; effet de VIPS_CONCURRENCY=1 non mesuré.
- Sensibilité au fuseau horaire et à la locale ; scripts/smoke-electron.mjs et les cibles test:electron non examinés.
- Les 20 dossiers tvlens-* présents dans le dossier temporaire système de l'utilisateur : origine non attribuée (une autre session travaille sur la machine).
- Écart à signaler : une mesure ponctuelle (node -e) a créé puis supprimé un dossier flk-turns-* dans le dossier temporaire système au lieu de flaky/tmp ; suppression vérifiée.

### Documentation et dépôt

- Le répertoire de travail et les commits postérieurs à 8627b46 : le commit suivant (cd5bcd9, « Rewrite the decision and history of F07 on its final code ») réécrit l'ADR 0007 et son historique ; ce que je dis de l'ADR 0007 vaut pour 8627b46 seulement.
- Les éléments non suivis vus dans l'état git (experiments/, design/continuous-context/, scripts/check.mjs, scripts/quality/, .claude/) : non lus. La cible docs/travail/tickets/ reprend le chemin cité par les descriptions des skills du projet, sans avoir lu ces skills.
- Les issues GitHub 1 à 10 : contenu et état non consultés ; l'identité entre fiches et issues est supposée.
- L'atteignabilité des 43 SHA de commits cités dans la documentation et l'historique complet des messages de commit (seuls 5 sujets vus dans l'instantané).
- Le contenu réel de l'app empaquetée : scripts/package.mjs lu, aucun build lancé ; présence de film/node_modules ou promo/node_modules sur la machine non vérifiée.
- L'usage éventuel de app/assets/hero-coast.png, des PNG de design/ et des captures racine par un outil extérieur au commit.
- Aucun test lancé, ni Node ni Python ; les décomptes de tests des ADR (par exemple 22 tests dans le fichier F07, qui en génère par boucle sur les deux hôtes) n'ont pas été recomptés.
- Lecture partielle : ADR 0002 à 0005 et 0008 à 0010 (en-têtes et titres de sections seulement), ADR 0006 (Décision et Preuves), historiques autres que F07 (comptages seulement), night-features-delivery.md (30 premières lignes et plan), SECURITY.md (20 premières lignes et plan), PRD-V2.md, roadmap-original.md, PRD.MD au-delà des extraits cités, 37 des 42 JSON de docs/.
- Les README de screenshots/lg et le détail des sources de film/ et promo/ (recherche de références d'images seulement).
- Les liens externes (YouTube, rendus PlantView sur uml.iamdabi.com) : non ouverts.
- La classification de langue des commentaires et messages repose sur une heuristique de mots-outils ; les chaînes courtes non classées (environ 115 messages) n'ont pas été lues une à une.
- La procédure d'installation sur la TV et les chemins lus sur l'appareil : non rejoués ; le risque du déplacement de prototypes/lg-remote est estimé à la lecture.

### Scripts et outillage

- Aucun script n'a été exécuté : la cohérence est statique (existence des fichiers et des exports, paramètres de quelques constructeurs, méthodes du pont, identifiants DOM, routes, drapeaux). Les arités d'appel et le comportement réel ne sont pas vérifiés.
- L'arbre de travail réel n'a pas été lu : présence effective des fichiers ignorés par Git (tv/app/connection.js, deploy/*.env, auth.json), contenu de film/, promo/, screenshots/, docs/*.json, experiments/, historique Git (étiquettes, gros fichiers, secrets anciens).
- Le paquet Mac n'a pas été construit : liste réelle de l'asar, taille, état de la signature, comportement des autorisations macOS après reconstruction. Les valeurs par défaut des fusibles Electron sont citées de mémoire.
- Prettier n'a pas été rejoué avec les réglages proposés (aucun binaire local, aucun téléchargement fait) : nombre de lignes à 100 ou 120 colonnes inconnu, et l'on ne sait pas lesquels des 5 tests survivraient à singleQuote. CSS, HTML et Markdown n'ont pas été évalués.
- Les règles ESLint absentes du JSON fourni (no-undef, eqeqeq, plugins n et import) ne sont pas mesurées par ESLint ; les chiffres donnés pour elles viennent de grep. La disponibilité des suppressions en vrac (ESLint 9.24 ou plus) est citée de mémoire.
- tsc n'a pas été lancé : le nombre d'erreurs de checkJs par lot est inconnu.
- Plancher de Node : déduit des API et des engines du lockfile ; aucun lancement sous Node 22 ; le rétroportage de la détection de syntaxe en 20.19 est cité de mémoire ; le Node embarqué d'Electron 44 est déduit de sa dépendance @types/node.
- Durées de CI : seule celle de `npm test` est mesurée (journaux locaux). Les parcours Electron et TV n'ont jamais tourné sur un runner ; leur fonctionnement sous Linux et sur macos-15 est supposé.
- Tests Python non lancés : durée et état inconnus ; la version 3.10 de la TV vient de la documentation.
- `npm audit` et `npm outdated` non lancés (pas d'accès réseau utilisé).
- État réel du VPS et de la TV non inspecté : versions installées, crochets présents, fichiers d'environnement. La priorité d'EnvironmentFile sur Environment dans systemd est citée de mémoire.
- Hébergement supposé sur GitHub d'après l'URL de clonage du README ; sur GitLab, le fichier de CI change de forme mais pas de contenu.
- La cause de l'échec intermittent de tests/architecture-f06.test.cjs:530 n'a pas été établie ici ; elle est seulement posée comme prérequis de la CI.
- Les modes des fichiers (tv/tailscale-service.sh non exécutable) sont ceux de la copie figée, pas forcément ceux de Git.

### Tests nommés par chantier

- Aucun test n'a été exécuté. L'échec intermittent de f06:530 n'a pas été reproduit : la fenêtre de course est établie par lecture de server/http.cjs et core/session.cjs.
- Les comptes d'assertions par sorte reposent sur des motifs appliqués au texte des assertions (marge d'environ 10 %). Une assertion placée dans une boucle est comptée une fois. Le couplage indirect (méthodes remplacées, faits calculés dans une fonction d'aide) n'apparaît pas dans ces comptes.
- Fichiers hors périmètre lus par leurs titres ou par recherche de motifs seulement : server-sessions, moment-index, opened-pages, question-ceiling, server-ingest-path, adapters, session-optimization, viewing-features, latency, chat-codex. mac-ipc-contract a été lu pour son harnais uniquement ; surveillance-runtime, verification, chat-sources pour leur faux App Server uniquement. Les constats TSTA-15 et TSTA-18 en dépendent.
- Les tests Python (tests/test_tv_*.py) et les tests TV (tv-panel, tv-overlay-queue, tv-app-compat, tv-ambient-params) n'ont pas été examinés.
- Ce que lit le client TV dans une réponse d'erreur HTTP (statut, code ou texte) n'a pas été vérifié : cela conditionne l'ordre de TSTA-12.
- Les 8 tests sautés sous Windows (`skip` sur win32 dans f05 et codex-confinement) : comportement non évalué.
- Que `--smoke-test` neutralise toutes les variables TVLENS_* autres que les 6 de HOST_SETTINGS n'a été vérifié que dans app/main.cjs, pas dans runtime/ ni adapters/.
- Les durées par fichier viennent de fmt-baseline.log (copie formatée), rapprochées des fichiers par les titres ; deux titres de f07 partagent un préfixe et ont pu être comptés ensemble.
- Les formes cibles d'API proposées pour remplacer les lectures d'état privé (`client.status()`, `onStep`, champ `ingest` de l'instantané, commandes de WatchSession) sont à confronter aux remédiations des audits du cœur et des adaptateurs.
- L'équivalence exacte des trois faux Electron n'a pas été comparée ligne à ligne : les divergences relevées sont celles des options et des modules interceptés.

### Tests de comportement

- Chemins relatifs à ROOT = la copie figée de l'audit. Les 50 fichiers retenus (tests/*.test.cjs) : adapters, budget, chat-codex, chat-instruction, chat-sources, chat-trace, clip-audio, clip-unreadable, codex-stream-decoding, deep-ask-restore, deploy-unit, disk-guard, evidence-refresh, inspection-strategies, latency, living-recap, local-vlm-agent, media-asr-options, moment-index, opened-pages, perception-context, portable-config, question-ceiling, question-freshness, reinspection-transcript-reuse, remote-media, remote-server, server-ingest-path, server-sessions, server-state-views, server-surveillance, session-delete, session-durable, session-latency, session-optimization, session-timeline, session, split-perception, stream-simulation, surveillance-runtime, surveillance, timeline-server, topic-summary, transcriber-sharing, transcription-language, verification, video-research, viewing-actions, viewing-features, whisper-diagnostics.
- Lus en entier : session-durable, surveillance, surveillance-runtime, server-sessions, moment-index, remote-media, transcription-language, codex-stream-decoding. Lus par extraits : remote-server, video-research, chat-trace, session-optimization, viewing-features, budget, stream-simulation, question-ceiling, server-surveillance, verification, transcriber-sharing, clip-unreadable, chat-instruction. Les 29 autres n'ont été examinés que par grep, compteurs et titres de tests ; les constats qui les citent reposent sur ces recherches, pas sur une lecture suivie.
- Les tests de chantier et d'interface (26 fichiers) n'ont pas été lus, seulement interrogés par grep. Un comportement donné ici comme non testé peut y être couvert sous une autre formulation, en particulier pour TSTB-14 (architecture-f06, architecture-f07) et TSTB-07 (architecture-f05, architecture-f08, codex-confinement).
- Les absences de test (TSTB-05, TSTB-06, TSTB-07) sont établies par recherche de messages et de symboles. Une couverture indirecte par simple statut 400 ou par `assert.rejects` sans attente reste possible. Un comptage automatique des messages d'erreur jamais affirmés a donné entre 2 et 102 sur 228 selon l'heuristique : trop peu fiable, je ne l'ai pas retenu.
- Aucun test d'intégration lancé. Seule exécution : 12 fichiers purs du cœur avec `--experimental-test-coverage` (121 tests, 0,39 s, aucune écriture). La couverture de runtime/, adapters/, server/ et mcp/ n'est pas mesurée ; les seuils proposés pour ces dossiers sont des cibles à calibrer.
- Liaison de `~/.codex/auth.json` quand `authHome` est omis (TSTB-01) : déduite de codex-session-client.cjs:272 et codex-confinement.cjs:253-262, non exécutée, pour ne pas toucher aux identifiants du poste.
- Échec des tests ffmpeg sur une machine sans ffmpeg (remote-media:7, video-research:60) : déduit de l'absence de garde, non exécuté.
- Cause de l'échec intermittent 429 (architecture-f06:530) : hypothèse tirée de la lecture de server/http.cjs:247-271, non reproduite.
- Les numéros de ligne de runtime/headless-runtime.cjs repris de l'audit du cœur pour l'exclusion mutuelle n'ont pas été relus ; seuls :343, :789, :818 et :1148 l'ont été.
- Hors périmètre, non examinés : les 3 tests Python, tests/tv_fakes, scripts/simulate-stream.cjs (dont deux tests du périmètre dépendent) et le smoke Electron.

### Tests des interfaces

- Tous les chemins cités sont relatifs à ROOT = la copie figée de l'audit.
- Aucun smoke ni probe n'a été exécuté (Electron et Chrome trop lourds pour la machine) : leur validité est statique (modules, ids, classes, méthodes du pont, drapeaux), leurs durées sont des estimations, et leur passage sous Linux avec xvfb (AudioContext, MediaRecorder) est supposé.
- Les tests Python ont été lancés une fois, sur Python 3.14.2 seulement ; rien n'a été exécuté sur 3.10, version de la TV.
- Le comportement sous une autre configuration de Prettier (singleQuote) ou avec le CSS et le HTML formatés n'a pas été rejoué : le journal fourni ne formate que le JavaScript. Les cas cités comme certains sont ceux où Prettier réécrit les espaces ou déplie un bloc quel que soit le réglage.
- La version minimale exacte de Node pour importer un .js à syntaxe ESM sans champ type (proposée : 22.12) vient de ma mémoire, pas d'une vérification.
- Les capacités des bibliothèques DOM candidates (showModal, focus et activeElement, scrollIntoView, keyCode) n'ont pas été vérifiées : d'où l'essai d'une heure demandé dans TSTC-06.
- Les assertions sur le texte source hors périmètre n'ont pas été inventoriées : une vingtaine d'autres fichiers de tests lisent des fichiers (architecture*.test.cjs, session-durable, server-sessions, codex-confinement…) ; seul tests/architecture-f09.test.cjs:237 est cité car il vise le même renderer.
- Le contenu du faux Luna embarqué dans scripts/simulate-tv-ambient.mjs n'a pas été comparé ligne à ligne à tests/tv_fakes/luna-send ; simulate-stream.cjs, replay-*.cjs et bench-*.cjs n'ont pas été lus.
- Les corps de 9 probes n'ont été lus qu'en tête de fichier ; leur classement repose sur leurs imports, leurs variables d'environnement et leurs commentaires d'en-tête.
- prototypes/lg-remote/test_*.py (trois fichiers Python cités par docs/lg-ambient.md) est hors périmètre et n'a pas été examiné.
- L'échec intermittent de tests/architecture-f06.test.cjs:530 n'a pas été étudié. Dans le périmètre, les attentes en temps réel de tests/mac-ipc-contract.test.cjs:204-212 (600 tours de 5 ms) et les sommeils des tests Python sont du même genre, mais aucun échec n'y a été observé.

### Complément : contrat de fil entre parties déployées

- Les versions réellement installées sur le VPS et sur la TV : je n'y ai pas touché (interdit). La documentation dit seulement que le VPS partait de 7015a64 avec des correctifs hors commit. Le plancher réel est donc inconnu ; j'ai raisonné avec 8627b46 comme plancher.
- Le comportement des serveurs plus anciens (routage sur l'URL exacte, absence des vues) : la copie n'a pas d'historique Git, je le tiens des commentaires et des tests, pas de l'ancien code.
- tv/ambient.py (1075 lignes) n'a été lu que par parties : Feed, capture_view, block_reason, constantes de causes. prototypes/lg-remote (panel.py, managed_mapper.py, vendor/) n'a été lu que pour les champs de version et de capacité.
- L'app Mac : seule l'absence d'appel /v1 dans app/ et mcp/ a été vérifiée par grep. Le contrat IPC et le pont MCP (même paquet) n'ont pas été examinés. Je n'ai pas vérifié si des dossiers de session voyagent entre le Mac et le VPS.
- Aucune suite n'a été lancée, ni Node ni Python. Deux exécutions ponctuelles seulement : un RemoteServer à runtime factice (7 requêtes, preflight) et le vrai tv/transport.py face à un serveur factice (5 réponses, délai ramené à 4 s). Le chiffre « une trentaine de renvois en 30 s » est extrapolé de cette mesure, pas observé.
- Le relancement de ffmpeg à chaque renvoi est déduit de la lecture de server/http.cjs:237-258, pas mesuré.
- « 3 phrases sur 7 sans test côté cœur » vient d'un grep de fragments littéraux dans tests/surveillance*.test.cjs et tests/server-surveillance.test.cjs : un test qui construit la phrase autrement m'échapperait.
- Le compte des routes sans client déployé repose sur un grep des littéraux « /v1/… » dans tv/ et prototypes/ ; un chemin construit par concaténation m'échapperait.
- Les scripts de fumée qui joignent TV et serveur (scripts/smoke-tv-overlay.mjs, smoke-tv-timeline.mjs, simulate-tv-ambient.mjs) n'ont pas été lus en entier.
- La possibilité d'installer les scripts Python par dossier versionné avec lien symbolique sur le système de fichiers de la TV.

### Complément : formats écrits sur disque

- Historique Git : dates d'apparition de chaque format, et différence éventuelle du code écrivain entre 8627b46 et la tête de branche actuelle. Le dépôt n'a pas été consulté (consigne de ne pas y toucher) ; la date du passage aux sessions durables vient de docs/night-features-delivery.md.
- Archives réelles du Mac et du VPS : nombre de dossiers par génération, tailles réelles des médias JSON, présence d'auto.json ou de médias à la racine. Aucune donnée d'utilisateur n'a été ouverte ; c'est l'objet du script d'inventaire proposé.
- Aucune exécution n'a écrit sur disque. Les scénarios de réécriture (deep-answers.json remplacé après une lecture vide, manifeste d'un autre format remplacé à la reprise, version 2 ramenée à 1) sont établis par lecture du code et par des sondes en mémoire sur les modules de la copie de référence, pas par un essai sur un dossier.
- Chemin de réouverture de l'hôte Mac (app/main.cjs:436-447) : lu, non exécuté (Electron).
- Partage effectif du dossier `userData` entre checkouts sur le Mac : déduit de `app.setName('TVLens')` et du comportement par défaut d'Electron, non observé.
- Le générateur de fixture n'a pas été écrit ni lancé : la faisabilité repose sur les paramètres injectables lus dans createSessionRuntime (id, readClock, wallClock, overrides.embeddings, smoke) et sur le montage déjà utilisé par tests/session-durable.test.cjs:68-80.
- Fichiers côté TV (tv/ambient.py, tv/capture.py, tv/controller.py : /tmp/tvlens-*.json, ambient.json) classés éphémères d'après leurs chemins seulement ; leur format n'est pas audité. Les deux clés localStorage (`tvlens.surveillance.display`, `tvlens.overlay`) sont relevées, pas auditées.
- Fichiers écrits par scripts/ (dont .local/trial-budget.json et .local/research-budget.json) : hors inventaire.
- Contenu réel de provider.enc et scénario du chemin absolu périmé (GAP2-08) : non reproduits.
- La suite de tests n'a pas été lancée ; les compteurs de tests cités viennent de grep.

### Complément : journal et diagnostic d'une panne

- VPS : configuration de journald (rétention, stockage, limites de débit), version réellement déployée et présence effective des lignes ; accès interdit par la consigne.
- macOS et Electron 44 : sort réel de stderr d'une app lancée par `open` ou le Finder, et comportement par défaut du processus principal sur exception non capturée ou rejet non géré. Déduits, non exécutés.
- Node 24 : sortie du processus sur rejet non géré non rejouée ici (comportement documenté de Node, pas observé sur ce code).
- TV : nature de /tmp (mémoire ou disque, survie à une veille), place disponible et usure de /media/developer, contenu réel de /tmp/tvlens-controller.log.
- Les 15 rejets neutralisés de app/renderer.js et les fichiers de tv/app/*.js n'ont pas été triés (périmètre de UI-04 et TV-05).
- Les 39 `catch` vides n'ont pas été relus un à un : seuls ceux cités dans les constats l'ont été. Mon grep sur une ligne en trouve 32, ESLint 39.
- Le classement des 61 rejets en trois familles repose sur le contexte immédiat de chaque ligne, pas sur le suivi complet de chaque appelant ; 5 à 10 sites pourraient changer de famille à la relecture.
- prototypes/lg-remote (control.py, runtime) et scripts/ n'ont pas été lus.
- Aucun test n'a été lancé. Les compteurs viennent de grep et d'un seul essai `node -e` sur `safeError`.
- Écart de comptage non expliqué : 23 appels à `this.trace(` (18 + 5) contre 21 annoncés dans la mission.
- docs/standards.md, cité par les consignes du dépôt, est absent de la copie figée du commit 8627b46.

### Au découpage en tickets

- **L01** — La suite complète n'a jamais été lancée : durée en séquentiel sous le lanceur inconnue, de même que l'existence d'un test qui dépasse légitimement 60 s.
- **L01** — Aucun fichier de test existant du dépôt n'a été lancé par moi.
- **L01** — Les 33 tests Python de prototypes/lg-remote n'ont été lancés ni à la version 0d5a954 ni sous unittest discover.
- **L01** — Les mesures sous sonde de FLK-02 et FLK-03 sont lues dans les journaux de l'audit, non rejouées.
- **L01** — L'échec de tests/server-sessions.test.cjs (ligne 688) n'est ni reproduit ni expliqué.
- **L01** — Que la suite réelle supporte un TMPDIR privé par fichier, et ce qu'elle y laisse.
- **L01** — La liste exacte des quinze appels du mode large de l'audit n'a pas été retrouvée ; celle de L01-06 est une proposition.
- **L01** — Le comportement de engine-strict (npm ci --dry-run --offline, EBADENGINE) n'a été observé que par le rédacteur, sur une copie hors dépôt ; je ne l'ai pas rejoué.
- **L01** — Qu'aucun code du dépôt n'utilise une API de Node postérieure à 24.0.
- **L01** — « Electron 44.4.5 embarque Node 24.21.0 » vient de l'audit.
- **L01** — Les tests Python n'ont pas été essayés sous Python 3.10.
- **L01** — Le « skipped 5 » attendu de L01-07 repose sur un comptage par grep, non par lancement, et suppose qu'aucun autre test de ces cinq fichiers n'est touché par TVLENS_FFMPEG forcé.
- **L01** — Que T001 couvre entièrement FLK-01, TSTA-01 et OUBLI-04.
- **L01** — La détection d'un fichier inactif par le lanceur (L01-04) n'a été observée que sous la forme des résultats par test diffusés par un fichier bloqué (rapporteur tap, Node 24.12.0, deux modes de lancement), pas comme un lanceur qui fonctionne.
- **L01** — Que le test du budget de 4 s de tests/quality-check.test.cjs passe sans modification une fois le lanceur branché (L01-11) : argumenté par la conception, non lancé.
- **L01** — « Les scripts de l'audit étaient en zsh et perl » (L01-06) vient du brief.
- **L01** — La suite complète n'a jamais été lancée au découpage : ni sa durée en séquentiel sous le futur lanceur, ni l'existence d'un test qui dépasse légitimement 60 s ne sont connues.
- **L01** — Les 33 tests Python de prototypes/lg-remote n'ont pas été lancés à la version 0d5a954 : ils sont comptés par `grep -c "def test_"`. L'un d'eux lit l'historique Git (`git show 9758633:…`) ; L01-10 prévoit un verdict BLOQUÉ s'il échoue.
- **L01** — Les mesures sous sonde de FLK-02 et FLK-03 (échecs reproduits, réussites après correction) sont lues dans les journaux de l'audit, non relancées.
- **L01** — L'échec de tests/server-sessions.test.cjs ligne 688 sous la sonde large n'a été ni reproduit ni expliqué.
- **L01** — Que `unref` sur la minuterie de garde suffise à laisser sortir un processus dont un tour Codex est abandonné : déduit de la lecture de codex-session-client.cjs, pas observé. L01-02 prévoit BLOQUÉ si une autre ressource retient le processus.
- **L01** — Que la suite réelle supporte un TMPDIR privé par fichier (longueur des chemins de sockets) et ce qu'elle y laisse : non essayé.
- **L01** — La liste exacte des quinze appels du mode large de la sonde de l'audit n'a pas été retrouvée.
- **L01** — Le comportement de `engine-strict` n'a été observé que sur une copie hors dépôt de package.json et du verrou, sans node_modules, avec Node 24.12.0 et npm 11.6.2 — pas dans le dépôt, ni sur le VPS.
- **L01** — Qu'aucun code du dépôt n'utilise une API de Node apparue après 24.0 : non vérifié ; le plancher `>=24` reprend les documents.
- **L01** — Que l'information « Electron 44.4.5 embarque Node 24.21.0 » soit exacte : reprise de l'audit.
- **L01** — Les tests Python n'ont pas été essayés sur Python 3.10.
- **L01** — Que `ffmpeg` soit installé sur la machine d'une session de ticket (critère 4 de L01-07) : non contrôlé au découpage.
- **L01** — Le nombre de tests sautés attendu par L01-07 (`skipped 5`) suppose que les cinq fichiers ne contiennent aujourd'hui qu'un seul saut, conditionnel à ffmpeg : relevé par grep, pas par un lancement.
- **L01** — Que T001 couvre entièrement FLK-01, TSTA-01 et OUBLI-04 : repris de la consigne du lot et du statut du ticket, sans relire sa preuve.
- **L02** — Aucun fichier de test n'a été lancé : les décomptes viennent de grep et de node -e ponctuels, pas d'une exécution de la suite.
- **L02** — La mesure de l'audit « un formatage à blanc casse 5 tests » n'est pas rejouable (Prettier n'est pas installé) ; que shape absorbe tout ce qu'un formateur réel change (parenthèses, guillemets de propriétés, reflux du HTML) ne se confirmera qu'au lot de formatage.
- **L02** — L02-01 : que la remise en page à la main fasse échouer exactement les cinq tests cités avant conversion n'a pas été observé.
- **L02** — L02-06 : la faisabilité sur le banc (poser une question avant la fin de la vérification simulée de 2 500 ms, minuteries simulées) est jugée plausible à la lecture du code, non exécutée ; le ticket garde une clause BLOQUÉ.
- **L02** — L02-05 : que les 49 gestionnaires soient tous enregistrés par un hôte lancé en --smoke-test sur le banc n'a pas été exécuté ; le ticket garde une clause BLOQUÉ.
- **L02** — L02-02 : l'absence d'effet de bord (minuterie, écriture) à l'import réel des 14 scripts de app/ui/ n'a pas été vérifiée au-delà de la réussite de l'import.
- **L02** — L02-04 : la suite [0, 0, 0, 0, 1] du critère de caractérisation est déduite de la lecture de app/renderer.js l.605 et de app/ui/surveillance-view.mjs l.194, non exécutée.
- **L02** — Report de TSTC-19 : l'existence du lot L15 et du constat PY-04 est reprise de l'index du rédacteur, non vérifiée dans les autres lots.
- **L02** — L02-08 : les 10 appels et 12 causes ont été recomptés par lecture et motif, pas par un parcours ast exécuté.
- **L02** — Prettier n'est pas installé et n'a pas été lancé : les cinq tests cassés et les chiffres du relevé à blanc viennent de l'audit ; l'identification des quatre tests de tests/mac-ui.test.cjs (l.105, 275, 615, 685) est une déduction. L'insensibilité à la mise en page de L02-01 n'aura sa confirmation réelle qu'au formatage du lot L03.
- **L02** — Aucun fichier de test n'a été exécuté. Les mesures (49 canaux, 11 événements, 57 méthodes du pont, 91 fichiers et 241 imports, arêtes entre couches, 10 appels drop( et 12 causes par ast, absence de littéral de durée dans tv/app) viennent de node -e, python3 et grep ponctuels à 0d5a954.
- **L02** — Que host.handlers d'un hôte lancé par launch() contienne exactement les 49 canaux relevés dans le texte (L02-05) n'a pas été exécuté ; app/main.cjs l.260-509 n'a pas été lu ligne à ligne.
- **L02** — Qu'une question puisse être posée sur le banc avant la fin de la vérification simulée de 2 500 ms sans toucher au code de production (L02-06) n'a pas été essayé ; le ticket prévoit un verdict BLOQUÉ dans ce cas.
- **L02** — Que les six scénarios de tests/recording.test.cjs passent tels quels avec une option env (L02-07) n'a pas été essayé ; seul l'import du module sans DOM a été vérifié.
- **L02** — Les décomptes de l'audit non recomptés : 65 assertions (TSTC-15), 24 assertions (TSTA-08) ; la couverture attribuée à tests/question-ceiling.test.cjs l.59 n'a pas été relue.
- **L02** — Les numéros de lot cités pour les suites (L03 pour OPS-04 et ESLint, L05 pour le faux DOM, L07, L08 pour UI-07, L11 pour ADP-09, L15 pour PY-01 et PY-04, L04) viennent du brief et de la répartition connue ; les briefs de ces lots n'ont pas été relus.
- **L02** — Si scripts/check.mjs applique la règle des 160 caractères aux fichiers Python et JSON créés par L02-08 n'a pas été vérifié ; le ticket l'exige de toute façon.
- **L03** — Le gel ESLint de L03-06 (1 184 infractions, plus 14 no-console) n'a pas été remesuré avec la configuration complète du périmètre. Le stock réel est celui que le ticket relèvera à son critère 4.
- **L03** — La sortie en 2 sur une suppression devenue inutile n'a été observée que sur la configuration d'essai.
- **L03** — La suite complète n'a jamais été lancée ni sur une copie formatée de l'arbre, ni sous Linux : c'est l'objet de L03-02 et de L03-10.
- **L03** — La valeur de la mesure cas_de_test (618) n'a pas été remesurée.
- **L03** — Le comportement de git blame --ignore-revs sur des lignes que le commit de formatage a créées ou fusionnées n'a pas été observé (critère de L03-04).
- **L03** — Le coût en minutes GitHub Actions et le quota du dépôt DabiK/tvlens sont inconnus. La première exécution du workflow n'est observable qu'après un envoi au dépôt distant.
- **L03** — Rien ne garantit que le SHA du commit de formatage, inscrit dans .git-blame-ignore-revs, restera stable si la branche est réécrite avant sa fusion.
- **L03** — Le nombre de 16 fichiers de tests liés aux fichiers de L03-11 vient d'un grep sur les noms et pas de l'analyse des imports.
- **L03** — Suite complète sur la copie formatée : non lancée pendant le découpage. C'est l'objet de L03-02.
- **L03** — Comportement sous Linux et sur GitHub Actions : ffmpeg par apt, npm ci sans binaire Electron, binaire sharp pour Linux, tests Python sous 3.14 sur Ubuntu. Rien de cela n'a été exécuté.
- **L03** — Stock exact d'ESLint avec la configuration finale de L03-06 (exemption des tests, globales navigateur pour les scripts) : environ 450 infractions attendues, non mesurées. no-console n'a pas été mesuré.
- **L03** — Effet sur la TV réelle du formatage de tv/app : non observé (interdit de toucher à la TV).
- **L03** — Durée de la vérification de fin sur environ 200 fichiers formatés : non mesurée.
- **L03** — Effet de .editorconfig sur la sortie de Prettier : non mesuré. Le critère 5 de L03-04 le vérifie.
- **L03** — Étape « gel du lint » de L03-07 en mode --changed : non essayée.
- **L03** — Correction des 74 erreurs tsc du premier lot par des annotations JSDoc seulement, en particulier les 5 TS2532 de core/viewing-actions.cjs : non essayée.
- **L03** — tsc lancé avec @types/node 24.19.0 installé en direct à la racine : la mesure a utilisé le tsc de promo/node_modules.
- **L04** — Aucun test n'a été lancé pendant la relecture : tout repose sur la lecture du code et des tests à la version 0d5a954 (grep, sed, wc). Les seules exécutions sont celles de l'auteur des tickets (validateRemote par node -e, mesures de scripts/quality/metrics.mjs).
- **L04** — La forme et le nom du port de journal (jalon:journal), du test de contrat /v1 (jalon:contrat-fil) et de l'aide tests/helpers/mac-host.cjs (lot:L05) : ces livrables n'existent pas à la version 0d5a954. Les tickets L04-06 à L04-10 en parlent sans en fixer l'API et prévoient un verdict BLOQUÉ si elle ne convient pas ; la clause de L04-06 sur le test de contrat ne peut pas être vérifiée aujourd'hui.
- **L04** — L04-01 : qu'une notification turn/started sans champ turn lève bien dans event() (accès p.turn.id, adapters/codex-session-client.cjs l.598) est lu, pas exécuté ; il n'a pas été établi qu'un rappel de event() lève en fonctionnement normal. Que close() du transport après le rejet n'ait pas d'effet de bord sur une question suivante est déduit du modèle foreignThread(), pas exécuté.
- **L04** — L04-02 : que le rejet de la requête turn/start par un double rpcFactory atteigne bien le catch qui trace turn.rejected avec la cause au premier niveau est lu (l.804-809), pas exécuté ; l'argument d'ordre entre stdout et stderr du faux binaire est raisonné, pas exécuté.
- **L04** — L04-03 : les plages Tailscale (100.64.0.0/10, fd7a:115c:a1e0::/48) viennent de la connaissance générale, pas du dépôt ; la valeur réelle de TVLENS_BIND sur le VPS n'a pas été consultée (accès interdit) ; qu'un port invalide fasse déjà lever listen de Node aujourd'hui est su, pas exécuté.
- **L04** — L04-04 : que fusionner et redessiner deux fois le même corps (relu après un dessin échoué) laisse l'état du panneau identique n'a pas été vérifié dans tvlensMergeState ; le ticket prévoit BLOQUÉ sinon. La suite exacte des délais du test « an outage backs the polls off… » n'a pas été recalculée : le critère compare aux pannes du même plan plutôt qu'à des valeurs.
- **L04** — L04-05 : que le nouveau module passe toutes les gardes statiques existantes (motifs de l.705-724) dépend de son texte ; seules les gardes sur les exports et sur 60000 ont été relues en détail.
- **L04** — L04-07 : il n'a pas été recherché, route par route, si une erreur brute du système est aujourd'hui l'issue d'un parcours normal du client (par exemple un média demandé qui n'existe plus) ni si un test existant épingle 400 pour une telle erreur ; le ticket prévoit BLOQUÉ dans les deux cas. Ce que devient une requête quand le catch actuel lève lui-même (valeur null levée) n'a pas été tracé.
- **L04** — L04-08 et L04-09 : le passage du journal dans app/main.cjs et createSessionRuntime ne peut pas être prouvé hors ligne (l'hôte de test ne lit aucune configuration et ne reçoit pas de journal) : il est relu par la session.
- **L04** — L04-09 : qu'aucun test n'exerce directement ViewingSettings repose sur un grep (seul tests/mac-ipc-contract.test.cjs en nomme le canal).
- **L04** — L04-10 : qu'un lancement de l'hôte factice avec --live-inspection, un fichier de configuration absent et aucune clé atteigne started sans réseau, Codex ni fournisseur est lu (les trois seuls usages de liveInspection dans app/main.cjs et runtime/session-runtime.cjs), pas exécuté ; que l'aide mac-host.cjs du lot L05 reprenne le comportement de l'aide locale launch (--smoke-test ajouté, erreurs en chaînes) est supposé.
- **L04** — OUBLI-05 : le contenu réel des messages d'outil renvoyés au modèle Codex et au client MCP n'a pas été tracé ; la présence d'un chemin de l'hôte reste supposée.
- **L04** — ADP-16 : le scénario d'arrêt brutal qui laisserait le verrou du budget en place est déduit par l'audit, non reproduit.
- **L04** — Les faits cités dans reportes par l'auteur (lignes de core/, adapters/, tv/app/ pour CORE-10, ADP-14, SEC-02, SEC-04, TV-08, UI-04, TV-05) n'ont pas tous été rouverts pendant cette relecture ; seuls ceux qui touchent un ticket du lot l'ont été.
- **L04** — Les numéros de ligne cités valent pour la version 0d5a954 ; le formatage du lot L03 les décalera, d'où le nom de fonction ou de test donné avant chaque ligne.
- **L04** — Aucun test n'a été lancé dans cette session. Seuls ont été observés : validateRemote par node -e (frames:[null] rend un TypeError, frames:[{}] rend « Ordre des images invalide. ») et les mesures de scripts/quality/metrics.mjs par fichier.
- **L04** — La forme et le nom du port de journal (jalon:journal), du test de contrat /v1 (jalon:contrat-fil) et de l'aide tests/helpers/mac-host.cjs (lot:L05) : ces livrables n'existent pas à la version 0d5a954. Les tickets L04-07 à L04-10 en parlent sans en fixer l'API et prévoient un verdict BLOQUÉ si elle ne convient pas.
- **L04** — L04-10 : que le lancement avec --live-inspection et --config pointant un dossier s'arrête avant toute composition réelle a été lu dans app/main.cjs (l.39, l.51-55), pas exécuté.
- **L04** — L04-07 : il n'a pas été recherché, route par route, si une erreur brute du système est aujourd'hui l'issue d'un parcours normal du client (par exemple un média demandé qui n'existe plus) ni si un test existant épingle 400 pour une telle erreur ; le ticket prévoit BLOQUÉ dans les deux cas.
- **L04** — L04-01 : qu'une notification turn/started sans champ turn lève bien dans event() (accès p.turn.id, adapters/codex-session-client.cjs l.598) est lu dans le code, pas exécuté.
- **L04** — L04-02 : qu'aucun test existant n'exige l'absence de trace d'échec pour un client sans recherche web et de rôle autre que surveillance n'a pas été vérifié test par test.
- **L04** — L04-03 : les plages Tailscale (100.64.0.0/10, fd7a:115c:a1e0::/48) viennent de la connaissance générale, pas du dépôt ; la valeur réelle de TVLENS_BIND sur le VPS n'a pas été consultée (accès interdit).
- **L04** — L04-06 : la façon dont tests/test_tv_control.py simule le serveur n'a pas été relue en détail ; le cas à ajouter s'appuie sur le test voisin test_archive_open_read_only_stops_by_name_and_a_plain_conflict_stays_a_rejected_block (l.131).
- **L05** — Aucun test n'a été lancé : toutes les vérifications sont des lectures et des grep à la version 0d5a954.
- **L05** — La sonde disque lent du ticket T001 n'a pas été exécutée ; le comportement des fichiers migrés sous sonde est inconnu.
- **L05** — Le comportement des attentes aujourd'hui muettes une fois rendues bruyantes (transcriber-sharing, review-regressions, architecture-f05 ligne 138, question-ceiling ligne 202).
- **L05** — L05-02 : si retenir whenReady du faux electron jusqu'à la vérification des substitutions laisse verts les tests existants de mac-ipc-contract ; si app/main.cjs a un effet au chargement hors de whenReady().then que cette retenue ne couvre pas.
- **L05** — L05-02 et L05-03 : que Module._resolveFilename rende bien, pour chaque demande de app/main.cjs, le fichier attendu sous le banc (non exécuté).
- **L05** — L05-04 : que manualClock({ turns: 6 }) à avance relative rejoue exactement les instants simulés de manualTimers et de l'horloge écrite sur place de moment-index.
- **L05** — L05-09 : si des tests de surveillance-runtime dépendent de config/read répondant {} ou de l'absence de runtimeWorkspaceRoots et instructionSources dans thread/start ; le ticket prévoit config: () => ({}) pour le premier cas et un BLOQUÉ pour le second.
- **L05** — L05-09 : les neuf autres fichiers sont listés d'après la présence de rpcFactory ; le contenu de chaque faux serveur n'a pas été comparé.
- **L05** — L05-10 : que l'absence de la clé overrides et de wallClock suffise à retrouver la configuration actuelle de server-ingest-path (la lecture de overrides par le runtime n'a pas été retrouvée dans runtime/headless-runtime.cjs).
- **L05** — L05-07 et L05-08 : les appels à until qui passent un nombre de tours explicite n'ont pas été énumérés un par un au-delà de architecture-f05 ligne 128 ; les tickets donnent la règle pour tout autre appel.
- **L05** — L'effet du formatage Prettier de jalon:format sur les numéros de ligne et sur les grep des critères ; les tickets citent le nom avant la ligne.
- **L05** — Un éventuel renommage des fichiers architecture-fNN par un autre lot ; les tickets donnent un grep pour les retrouver.
- **L05** — Le nombre exact de lignes de plus de 160 caractères de scripts/simulate-stream.cjs au-delà des lignes 1 à 68 (quatre vérifiées) ; le chiffre avancé par l'auteur a été retiré du report OPS-13.
- **L05** — Aucun test n'a été lancé : tous les décomptes et toutes les lignes citées viennent de grep, sed, awk et wc à la version 0d5a954.
- **L05** — Le comportement des attentes aujourd'hui muettes une fois rendues bruyantes (transcriber-sharing, review-regressions, architecture-f05 ligne 138, question-ceiling ligne 202), avec ou sans la sonde disque lent.
- **L05** — Si décider la substitution sur le module demandé change le résultat d'un test de mac-ipc-contract, architecture-f05 ou architecture-f07, par exemple quand un autre module requiert le vrai.
- **L05** — Si des tests de surveillance-runtime dépendent de config/read répondant {} ou de l'absence de runtimeWorkspaceRoots et instructionSources dans la réponse de thread/start.
- **L05** — Si un seul tour ou six tours entre deux minuteries garde verts à la fois moment-index et review-regressions avec un manualClock commun.
- **L05** — L'effet de Prettier (jalon:format) sur les numéros de ligne, les lignes longues et la forme exacte des définitions citées ; les greps des critères ont été écrits pour ne pas dépendre des guillemets ni des parenthèses de flèche, sans essai réel.
- **L05** — Un éventuel renommage des fichiers architecture-fNN par un autre lot avant l'exécution de ces tickets.
- **L05** — Les appels à until qui passent un nombre de tours explicite dans architecture-f05, f06, f07 et surveillance-runtime n'ont pas été énumérés un par un.
- **L05** — La sonde disque lent du ticket 001 n'a pas été exécutée ici ; son usage avant et après dans L05-01, L05-06, L05-07 et L05-08 repose sur sa description dans docs/travail/tickets/001-resent-block-duplicate-without-race.md.
- **L06** — Aucun test n'a été lancé (machine à court de mémoire) : les échecs, durées et compteurs de l'audit sont lus, pas rejoués.
- **L06** — Aucune mutation n'a été essayée : leur effet est lu dans le code. En particulier, non vérifié que retirer les deux levées de watch.ending fait échouer le test d'origine de chat-instruction (watch.asking et les gardes de drain peuvent masquer l'effet), ni que la fusion de persist ou le retrait de la paire partielle font échouer un test de server-sessions, disk-guard ou session-delete ; les tickets demandent de noter une mutation restée verte.
- **L06** — La forme des aides du lot L05 (wait.cjs avec until, deferred, bounded ; clock.cjs ; mac-host.cjs avec substitutions ; server-host.cjs avec startServerHost, runtimeOptions et overrides) est lue dans les tickets de L05, pas dans le code : ces fichiers n'existent pas à 0d5a954.
- **L06** — Les numéros de ligne sont ceux de 0d5a954 ; ils auront bougé après jalon:format et le lot L05, les tickets citent le nom d'abord.
- **L06** — L06-01 : la durée de vingt lancements de server-sessions demandés par un critère n'a pas été mesurée.
- **L06** — L06-03 : non exécuté qu'un transport dont close() est tenu suffit comme point d'arrêt dans le second test de review-regressions ; la suppression d'arbre tenue reste l'alternative écrite.
- **L06** — L06-06 : la propagation de overrides de HeadlessRuntime vers createSessionRuntime est lue, pas exécutée ; non vérifié que tout accès disque du magasin et de la bibliothèque (dont les fs.open des lignes 225 et 228 de local-store) passe par fsImpl sans changer de forme.
- **L06** — L06-07 : non vérifié que le repos de la voie d'analyse de core/session.cjs s'exprime par une promesse sans changer l'ordre de la file (clause BLOQUÉ prévue), ni qu'une session composée offre de quoi tenir une question (repli sur une Session seule prévu) ; la question de compter ou non l'index des moments est laissée à l'ADR.
- **L06** — L06-08 : non vérifié que snapshot({ brief: true }) de la surveillance porte de quoi nommer une vérification en cours ; aucun appel existant à surveillance.flush() n'a été trouvé dans runtime/headless-runtime.cjs ni app/main.cjs.
- **L06** — L06-09 : non vérifié, test par test, que les appels de f.settled, block et ask ont lieu sans doublure tenue, ni qu'aucun test de f06, f07 ou server-sessions ne dépend du moment où le registre de surveillance est écrit une fois que idle() appelle flush().
- **L06** — La sonde de disque lent (L06-07, L06-08, L06-09) n'a pas été lancée sur la version actuelle.
- **L06** — L06-11 : la forme rendue par startServerHost (hôte exposé, clé overrides) dépend de L05 ; clause BLOQUÉ prévue si elle diffère.
- **L06** — TSTB-12, fichiers reportés : leur cible n'a été lue que par motif (grep), pas test par test.
- **L06** — Aucun test n'a été lancé (machine à court de mémoire) : les échecs décrits par FLK-07 et les durées et compteurs de l'audit sont lus, pas rejoués ni remesurés.
- **L06** — Aucune des mutations demandées par les tickets n'a été essayée : qu'elles fassent bien rougir le test visé est à constater par la session, chaque ticket prévoit de noter un test resté vert.
- **L06** — La forme des aides du lot L05 (tests/helpers/wait.cjs, clock.cjs, mac-host.cjs avec substitutions, server-host.cjs avec runtimeOptions et overrides) est lue dans les tickets voisins du découpage, pas dans le code : ces fichiers n'existent pas à la version 0d5a954.
- **L06** — Les numéros de ligne sont ceux de 0d5a954 ; ils auront bougé après jalon:format et le lot L05, les tickets citent le nom d'abord pour cette raison.
- **L06** — L06-03 : non vérifié que le transport existe encore après connection/closed dans le second test de review-regressions ; le point d'arrêt peut devoir être la suppression de l'arbre privé (prévu comme alternative dans le ticket).
- **L06** — L06-04 : non vérifié qu'on peut constater de l'extérieur de LocalTranscriber qu'un lancement abandonné est terminé de façon à faire échouer la mutation dix fois sur dix, ni l'ordre exact des drapeaux levés par runtime.end() pour chat-instruction.
- **L06** — L06-06 : non vérifié que le repos de la voie d'analyse de core/session.cjs s'exprime par une promesse sans changer l'ordre de traitement de la file, ni que la surveillance expose de quoi nommer une vérification en cours ; aucun appel à surveillance.flush() n'a été trouvé dans runtime/headless-runtime.cjs ni app/main.cjs.
- **L06** — L06-07 : non vérifié que tous les appels actuels de f.settled, block et ask ont lieu sans doublure tenue ; le ticket prévoit un until sur pending() pour ce cas. La sonde de disque lent n'a pas été lancée sur la version actuelle.
- **L06** — L06-08 : la propagation de overrides de HeadlessRuntime vers createSessionRuntime est lue dans sessionOptions() (ligne 618), pas exécutée ; non vérifié que tout accès disque de adapters/local-store.cjs peut passer par fsImpl sans changer de forme.
- **L06** — L06-09 et L06-10 : non vérifié, test par test, que chaque panne vise une écriture faite par le magasin ou la bibliothèque et non par un autre module (miniatures, moments conservés) ; le ticket L06-09 prévoit l'exception.
- **L06** — TSTB-12 parle de cinq fichiers : d'autres fichiers remplacent fs globalement (liste dans les reports), leur cible n'a été lue que par motif.
- **L07** — Aucun test n'a été lancé : la « commande des titres » (rapporteur TAP de Node 24, grep, sed) n'a pas été exécutée, pas plus que les tests déplacés dans leurs fichiers d'arrivée. Chaque ticket le prouve par un lancement seul puis par fichier, et bloque en cas d'échec.
- **L07** — Le nombre de lignes et de titres encore au-dessus de 160 caractères après Prettier : mesuré seulement avant formatage (à 0d5a954). La chaîne de tests/review-regressions.test.cjs:365 est supposée rester sur une ligne après formatage.
- **L07** — Si le formateur change le décompte des lignes test( dans le fichier f07 (12 ou 13, selon la coupe de onBothHosts) : le critère s'appuie sur le nombre relevé avant modification.
- **L07** — L'état des fichiers après les lots L01, L02, L04, L05, L06 et L17 (aides remplacées par celles de tests/helpers/, tests ajoutés ou retouchés, titres modifiés) : lus uniquement à 0d5a954 ; les tickets se fient aux titres et comptent en relatif.
- **L07** — Que git status montre R ou RM pour un fichier renommé par git mv puis édité sans ré-indexation, et que le garde Bash d'une session de ticket autorise git mv : lu dans scripts/loop/run.mjs et scripts/check.mjs, non exécuté ; les tickets prévoient le verdict BLOQUÉ en cas de refus.
- **L07** — La façon dont la boucle résout lot:L0X, jalon:format et T001 dans bloque_par : non relue dans cette relecture.
- **L07** — Si les lots non encore découpés (L03, L08 à L16) citent les anciens chemins des fichiers renommés.
- **L07** — Si le contrôle de format posé par jalon:format accepte les lignes ajoutées dans les documents Markdown (historique F04 à F10, docs/backend-latency-optimization.md, docs/night-features-delivery.md).
- **L07** — Lesquelles des « quatre assertions » citées par docs/night-features-delivery.md:820 sont celles de tests/review-regressions.test.cjs : le document ne les nomme pas ; le ticket L07-09 renvoie donc aux fichiers où grep trouve visionDuringAsk.
- **L07** — Que les imports nécessaires aux tests déplacés vers tests/portable-config.test.cjs, tests/evidence-refresh.test.cjs et tests/session-runtime.test.cjs soient tous couverts par les règles du périmètre : vérifié pour les aides locales et les identifiants principaux, pas ligne à ligne pour chaque corps de test.
- **L07** — Les raisons de report des constats TSTA-07, TSTA-09, TSTA-10, TSTA-14 à TSTA-18, TSTB-02, TSTB-09, TSTB-15, TSTB-16, OUBLI-33, OUBLI-34 et OUBLI-39 reposent sur la lecture du brief et de sa relecture, sans nouvelle vérification du code pour chacun.
- **L07** — Le nombre de lignes et de titres encore au-dessus de 160 caractères après Prettier : mesuré seulement avant formatage (à 0d5a954).
- **L07** — L'état des fichiers après les lots L01, L02, L04, L05, L06 et L17 (aides remplacées, tests ajoutés ou retouchés) : lus uniquement à 0d5a954 ; les tickets se fient aux titres.
- **L07** — La compatibilité des tests déplacés avec les aides et l'état de processus de leur fichier d'arrivée : aucune exécution faite (un seul lancement isolé était permis) ; chaque ticket le prouve par un lancement seul puis par fichier, et bloque en cas d'échec.
- **L07** — Que Git montre toujours R ou RM pour un fichier renommé puis édité (seuil de similarité), et que le garde Bash d'une session de ticket autorise git mv : non exécuté ; les tickets prévoient le verdict BLOQUÉ en cas de refus.
- **L07** — La façon dont la boucle résout les blocages lot:L0X, jalon:format et T001 dans bloque_par, et l'usage de .harness-state/tickets/&lt;id>/ comme dossier d'état : repris de lectures antérieures, non rejoués.
- **L07** — Si les lots non encore découpés citent les anciens chemins des fichiers renommés.
- **L07** — Les raisons de report des constats TSTA-07, TSTA-09, TSTA-10, TSTA-14 à TSTA-18, TSTB-02, TSTB-09, TSTB-15, TSTB-16, OUBLI-33, OUBLI-34 et OUBLI-39 reposent sur la lecture de l'audit et de sa relecture, sans nouvelle vérification du code pour chacun.
- **L08** — Aucun test n'a été lancé : seuls des lectures, des grep et des node -e ponctuels ont servi.
- **L08** — Les statuts que le serveur répond aux corps mal formés (L08-09) et les issues des paires de transitions (L08-10) n'ont pas été observés ; les sessions les observeront. Le seuil de 80 cas de L08-09 n'est pas compté sur une table réelle.
- **L08** — L08-11 : il n'a pas été exécuté que les constantes Python et JavaScript sont égales aujourd'hui (elles le sont à la lecture), ni que `-k SharedConstants` sélectionne la classe avec discover sous Python 3.14.
- **L08** — Le comportement des livrables des lots L02, L04, L05, L07 et L17 (source-shape, fake-dom, server-host, mac-host, renommage du banc, textes fixes, wire-refusals) n'est connu que par le texte de leurs tickets.
- **L08** — Il n'a pas été vérifié que le banc Rig sait produire chaque cas de lancement de L08-06 (position low, activité en retard, cartes en attente).
- **L08** — Le chargement de app/ui/*.js sous Node (L08-08) repose sur un node -e de l'auteur, non relancé.
- **L08** — L08-10 : il n'a pas été vérifié qu'une reprise côté Mac puisse être tenue par une barrière sur un port obtenu par h.runtime() sans toucher au code de production ; le ticket prévoit de sortir la paire au journal sinon.
- **L08** — Les décomptes de l'audit diffèrent des mesures : 269 recherches d'identifiants contre 281 appels mesurés ; OUBLI-42 annonce 342 lignes et 21 assertions contre 343 et 33 mesurées.
- **L08** — Les statuts que le serveur répond aux corps mal formés (L08-09) et les issues des paires de transitions (L08-10) n'ont pas été observés ; les sessions les observeront.
- **L08** — Les décomptes de l'audit diffèrent des mesures : 269 recherches d'identifiants contre 281 mesurées ; OUBLI-42 annonce 342 lignes et 21 assertions contre 343 et 33 mesurées.
- **L08** — Le comportement des livrables des lots L04, L05, L07 et L17 (fake-dom, server-host, mac-host, renommage du banc, textes fixes) n'est connu que par le texte de leurs tickets.
- **L08** — Il n'a pas été vérifié que le banc Rig sait produire le cas au cadre abaissé et les autres cas de lancement de L08-06.
- **L08** — La forme exacte de l'appel unittest de check.mjs pour un seul fichier Python n'a pas été vérifiée.
- **L09** — Les DEFAULT_IGNORES de @electron/packager (copy-filter.js) ont été lus dans node_modules lors d'une passe précédente, puis non relus. Le comportement exact de la fonction ignore ("" pour la racine, dossiers refusés non parcourus) n'a pas été observé par une construction.
- **L09** — La classification de probe-shortcut.mjs (vrai raccourci global macOS via Electron) dans L09-09 est laissée « à classer ».
- **L09** — L'effet du jalon format (Prettier) sur les deux lignes longues de resolveTemporalTarget est inconnu. L09-03 fait relever leur nombre en début de session.
- **L09** — Aucune garantie que le chemin actif teste les drapeaux --ignore-user-config, --ephemeral, --sandbox read-only et web_search="live" retirés avec invocation dans L09-10. Le ticket impose un inventaire au journal et un verdict BLOQUÉ en cas de trou.
- **L09** — Le nombre de tests Python (33 : 17, 15, 1) est compté par grep de def test_. Leur passage par unittest discover n'a pas été observé.
- **L09** — Aucun test n'a été lancé pendant cette relecture. Tous les faits viennent de lectures et de git grep à 0d5a954.
- **L09** — Tests Python de prototypes/lg-remote non lancés : 33 tests, comptés par lecture.
- **L09** — Paquet Mac non construit, contenu de l'asar non vu.
- **L09** — Tests OpenRouter de tests/adapters.test.cjs non lus en détail : leur couverture d'un comportement actif reste à inventorier par L09-10.
- **L09** — État Prettier et ESLint des fichiers touchés inconnu.
- **L09** — Comportement de l'élagueur de @electron/packager lu dans le code source seulement, non exécuté.
- **L09** — Effet sur l'installateur webOS d'un paquet daté de SOURCE_DATE_EPOCH à 0, et d'un panneau sans les fichiers ambiant, inconnu (pas de TV).
- **L09** — Collision de modules Python lors d'une découverte unique non exécutée.
- **L09** — Classement des 40 scripts indicatif, tiré des noms et d'une lecture rapide.
- **L09** — check-codex-quota pourrait appeler Codex : non vérifié.
- **L09** — Parcours du dialogue de fin de session (smoke) non lancé.
- **L10** — L'état réel du déploiement sur la TV de test et sur le VPS, et la révision installée : non vérifiés, aucune commande lancée sur ces machines.
- **L10** — Si scripts/probe-video-chat-live.mjs a été rejoué depuis le passage à startSurveillance.
- **L10** — Le sens des noms « Astra » et « Opus » dans les textes de la première boucle, au-delà de ce que ces textes en disent.
- **L10** — Les décomptes de l'auditeur non recomptés : 602 et 645 tests, tests Python 84 et 33, 42 noms TVLENS_, nombres de commentaires.
- **L10** — prototypes/lg-sidebar/package.py:14 (constat non relu).
- **L10** — Si docs/travail/README.md, non suivi au moment du découpage, sera committé.
- **L10** — Aucun test lancé : les critères « échoue avant, passe après » des nouveaux tests sont à constater par la session qui traite chaque ticket.
- **L10** — Le décompte exact des liens relatifs et des citations node &lt;chemin> dépend de l'expression d'analyse. Les chiffres ronds des Sources de L10-01 sont des ordres de grandeur ; seuls les 13 liens cassés en tracé seul et les 8 dans l'univers suivi plus non suivi ont été recomptés.
- **L10** — Dans le checkout de la boucle, tests/documentation-links.test.cjs voit aussi les fichiers non suivis du propriétaire (experiments/, design/continuous-context/). Le résultat peut donc différer d'un clone propre. Aucun lien cassé n'a été trouvé dans ces fichiers à 0d5a954, mais ce point n'a pas été vérifié après les tickets du lot.
- **L10** — Le seuil de similarité de git (50 %) pour index.md devenu README.md (L10-05) et pour le README des diagrammes (L10-06) n'a pas été mesuré ; les critères comptent les renommages sans ces fichiers.
- **L10** — L'état clos ou ouvert des 54 cases non cochées des tickets LG n'a pas été vérifié ; L10-06 le déduit de la section « État actuel » de lg-companion-roadmap.md.
- **L11** — Aucun test lancé : ni mac-ipc-contract, ni server-sessions, ni architecture-f07, ni chat-instruction. Tous les faits viennent de la lecture du code à 0d5a954.
- **L11** — Je n'ai pas exécuté le scénario du test 1 de L11-01 : une question met asking à vrai, un passage capturé attend, puis il est analysé au microtask. Seule la lecture le dit plausible en mode smoke, par la voie héritée de drain().
- **L11** — Le filtre par session d'onChange côté Mac (main.cjs:167, 171) n'est peut-être atteignable par aucun geste du pont, puisque letGo vide deep.jobs. Non prouvé dans un sens ni dans l'autre.
- **L11** — Je n'ai pas exécuté le comportement de t.mock.timers face à un module qui lit setTimeout au moment de l'appel. Le fait est déduit de la documentation de node:test.
- **L11** — L'API de tests/helpers/mac-host.cjs (lot L05) n'existe pas encore. Les gestes launch, capture, analysed et wrap sont ceux de tests/mac-ipc-contract.test.cjs à 0d5a954.
- **L11** — Tous les numéros de ligne datent de 0d5a954. Ceux d'app/main.cjs bougeront à jalon:format ; headless-runtime.cjs et session-runtime.cjs sont déjà au format Prettier.
- **L11** — La garde this.closing de HeadlessRuntime.onChange n'est couverte par aucun test. Elle est reportée avec la porte asking, et ce report n'est pas vérifié par un test.
- **L11** — Je n'ai pas vérifié que le résumé et le préchauffage de l'agent de chat en smoke Mac passent par wrap.conversation à chaque reprise : la composition de conversation est faite une seule fois, à la ligne 161.
- **L11** — Aucun test n'a été lancé : ni la suite, ni un fichier isolé. Rien n'établit par exécution que les scénarios de L11-01 et L11-02 passent sur le code actuel.
- **L11** — Je n'ai trouvé aucun geste du pont Mac qui laisse un job d'une autre session pendant qu'une session est chargée : deep.jobs est vidé au letGo. Le filtre par session de main.cjs:167 n'est donc pas caractérisé, et il pourrait être inatteignable par l'IPC.
- **L11** — Le fonctionnement de t.mock.timers avec un module qui appelle setTimeout à l'exécution est déduit de la sémantique de node:test. Je ne l'ai pas exécuté.
- **L11** — Le nom exact du geste qui termine et archive une session sur HeadlessRuntime (end() ou release()) n'a pas été vérifié dans les tests : L11-02 le laisse à lire par la session.
- **L11** — L'API finale de tests/helpers/mac-host.cjs (lot L05) n'existe pas encore : L11-01 suppose qu'elle garde launch avec wrap.conversation et wrap.session.
- **L11** — Toutes les lignes citées valent pour 0d5a954. Elles bougeront au jalon de format, et les fichiers architecture-f0N pourront être renommés en vague 1.
- **L11** — La garde this.closing du serveur sur asking pendant close() n'est fixée par aucun test (grep seulement). Elle est prévue dans le ticket d'E4.
- **L12** — OUBLI-08 : valeurs de complexité (35, 29, 24…) non mesurées, ESLint absent ; seules les bornes de lignes ont été vérifiées.
- **L12** — CORE-09 : le mur d'erreurs de @ts-check n'est pas observé, TypeScript absent de node_modules.
- **L12** — CORE-16 : l'écart 250 ms / 1000 ms est-il voulu ? Non tranché par le code.
- **L12** — CORE-20 : chiffres de coût du relecteur (0,8 ms, 2,2 ms, 2,4 Mo) non remesurés.
- **L12** — Aucun test n'a été lancé, ni par le rédacteur ni par le relecteur : l'état vert à 0d5a954 des tests cités n'est pas observé ; les valeurs attendues de L12-01 (7 caractères donne invalid, sourceKey, composeSignalText à cinq éléments) ont été observées seulement par node -e sur les fonctions exportées.
- **L12** — L12-04 : que tests/split-perception et tests/session-latency restent verts n'est pas vérifié ; ils écrivent les drapeaux directement et ne sont pas modifiés par le ticket.
- **L12** — L12-04 : la garde d'architecture (et le grep du critère 4) ne voit que les écritures de la forme watch.&lt;drapeau> = ; une écriture par un autre nom de variable lui échapperait. À 0d5a954, le grep rend 3 lignes : session-closing:73 et session-runtime:492/495.
- **L12** — L12-02 : que le fichier de test contenant les tests de révocation n'utilise pas d'autres champs de runtime.inspector que inner/cache/hits/misses/inspect est vérifié par grep seulement.
- **L12** — docs/travail/fiches/coeur.md, cité par les quatre tickets, n'existe pas dans le dépôt à 0d5a954 : il doit être copié depuis FICHE.md du lot avant que la boucle ne traite un ticket.
- **L12** — Aucun test n'a été lancé : les titres de tests cités ont été lus par grep, leur état vert à 0d5a954 n'est pas observé.
- **L13** — Not traced: whether an error that already carries a code reaches job.errorDetail.code today, for example through a perception path inside a deep-ask job.
- **L13** — Not traced: whether a LocalVlmAgent error can reach the catch of server/http.cjs. The name httpStatus is a precaution.
- **L13** — Not run: the exact sequence of the new « Session Codex fermée. » test (perception.close() or agent close during observeVisual on a 'stalled' turn). The rejection at codex-session-client.cjs:856 is only read in the code.
- **L13** — Not searched exhaustively: an existing test that compares a whole emitter error with deepEqual and would break because of the added code field.
- **L13** — Not verified: that every assertion tied to a message in tests/codex-confinement.test.cjs and tests/local-vlm-agent.test.cjs belongs to the test names listed in L13-01. Only the lines found by grep were matched to them.
- **L13** — Read, but no test run: the test doubles in review-regressions and codex-thread-rotation that reject a bare « Connexion Codex interrompue. ». It is final both before and after L13-02, so their outcome should not change.
- **L13** — No test was run during this review. Only node -e was used: once to compare the two sourceKey variants, once to load the four emitter modules.
- **L13** — Si une erreur portant déjà un code atteint aujourd'hui job.errorDetail.code (par exemple par un chemin de perception dans un job de deep-ask) : non tracé.
- **L13** — Si une erreur de LocalVlmAgent peut atteindre le catch de server/http.cjs : non tracé. Le nom httpStatus est une précaution.
- **L13** — Le choix du fichier et du double App Server existant où tester « Session Codex fermée. » (fermeture pendant un tour) est laissé au ticket L13-01.
- **L13** — Un test existant qui comparerait par deepEqual une erreur entière d'un émetteur et casserait à cause du champ code : non recherché exhaustivement.
- **L13** — L'équivalence de new URL(value) et new URL(String(value)) n'a été essayée que sur la version locale de Node, sur 17 entrées.
- **L13** — Aucun test n'a été lancé (dépôt en lecture seule, mémoire saturée). Les critères qui citent des tests existants supposent qu'ils passent à 0d5a954.
- **L13** — La validation de sortie de codex-recap et de codex-surveillance-agent n'a pas été lue (reste d'ADP-12).
- **L13** — Numérotation ADR : L04-07 vise aussi « 0011 à la version 0d5a954 ». L13-02 dit « numéro suivant libre », mais l'ordre réel dépendra de l'intégration.
- **L13** — La portée exacte de L04-02 sur codex-rpc.cjs n'est connue que par l'en-tête et les sources du ticket, pas par sa réalisation.
- **L14** — No real race was reproduced for UI-03. That an older read overwrites a pushed state is inferred from the code (unguarded l.305-306 and l.501), not observed in the running app.
- **L14** — Whether every state change of DeepAsk and VerificationService is followed by a push was checked only by grep of emit() and restore. A change without a push would make L14-03 drop the only up-to-date state; the ticket now asks the session to check this and stop if one is found.
- **L14** — Whether Electron delivers the deep:state push sent in sessions:open before the openSession invoke reply, so that the push really comes before the read in pullSession, was not tested.
- **L14** — No test, node scripts/check.mjs or Electron smoke was run (read-only repo, short memory). The regex claims (current defect, 'siège' case, letter-aware fix) were checked only with node -e on copies of the l.30 expression.
- **L14** — docs/travail/fiches/interface-mac.md, cited by all three tickets, does not exist in the repo at 0d5a954. docs/travail/README.md (untracked) announces a fiches/ folder, so the fiche is assumed to be copied there before the loop runs. The tickets are written to be executable without it.
- **L14** — Line numbers are those of 0d5a954. After jalon:format and lots L02, L04, L05 and L08 they will have moved; the tickets name functions first.
- **L14** — The exact interfaces delivered by lots L02 (non-vacuous guards, search-controller.mjs) and L05 (tests/helpers/wait.cjs exporting deferred) come from their ticket files, not from integrated code.
- **L14** — Whether updateButtons throws when currentState has no segments or history (currentState?.segments.length) was not checked. L14-02 asks the case table to record the observed behaviour.
- **L14** — The fiche's count of lines over 160 characters in app/renderer.js (58) was matched with awk length, which may count bytes rather than characters for accented text.
- **L14** — No real race was reproduced for UI-03: an older read overwriting a pushed state is inferred from reading the code (unguarded l.305-306 and l.501; DeepAsk.emit pushes on every job change). It was not observed in the running app.
- **L14** — No test, node scripts/check.mjs or Electron smoke was run (read-only repo, short memory). The vérifie quelque chose defect was verified only by running the regex copied from l.30 with node -e.
- **L14** — Line numbers are those of 0d5a954. After wave 1 (formatting, lint, test reorganization) and lots L02 and L08, they will have moved, and the file holding the app/ui module tests may no longer be tests/mac-ui.test.cjs.
- **L14** — The exact contents of the L02 tickets after integration (search-controller.mjs, recap-state.mjs, non-vacuous guards) are taken from their ticket files, not from integrated code.
- **L14** — Whether every updateButtons expression behaves as read here for a currentState without segments or history (currentState?.segments.length throws if segments is missing) was not checked.
- **L15** — L15-01 : les cas de navigation des critères viennent de la lecture de companion.js (l.457-572) et d'index.html. Le harnais n'a pas été écrit ni lancé, et le ticket prévoit que le test fixe ce qu'il observe.
- **L15** — L15-04 : que le remplacement existant de controller.Path par le test continue de détourner les fichiers si PanelLayout construit ses chemins par Path(...) à chaque appel. Raisonné sur le code, non exécuté.
- **L15** — Aucun test Python ni JS n'a été lancé. Seul un `node -e` a confirmé que companion.js et sessions-view.js donnent les mêmes sorties de clock pour les 9 cas du critère 1 de L15-03.
- **L15** — L15-04 ne dépend pas de jalon:format parce que la mise en forme du lot L03 (Prettier, ESLint) ne touche pas les fichiers Python. Cette absence de Python a été lue dans la fiche du lot L03, pas dans sa configuration finale.
- **L15** — scripts/package.mjs existe, mais c'est l'empaqueteur Electron. L'empaquetage de la page ambiante TV est scripts/package-tv-ambient.mjs (constante SHARED l.23), seul cité par L15-03.
- **L15** — FICHE.md (dossier de travail de l'audit, ce n'est pas un ticket) annonce un chemin cible docs/travail/fiches/tv-et-python.md, et le dossier fiches/ n'existe pas dans le dépôt. Les tickets ne la citent plus ; FICHE.md n'a pas été modifiée.
- **L15** — Comportement réel sur la TV (moteur Chrome 103 de webOS) et smokes navigateur (smoke-lg-ui, smoke-tv-timeline, dont le faux /v1/thumbnail) : non lancés. Les cas de L15-01 n'ont été observés que par une sonde jetable sur un faux document écrit à la main.
- **L15** — API réelle des aides du lot L05 (tests/helpers/clock.cjs, fake-dom.cjs) : ces fichiers n'existent pas encore à 0d5a954.
- **L15** — Tests Python (tests/test_tv_control.py, test_tv_ambient.py) et node scripts/check.mjs : non lancés. La seule exécution a été node -e sur les clock de companion.js et des vues.
- **L15** — Arrêt forcé d'un enfant qui ignore SIGTERM dans le délai de 5 s prévu par L15-04 : non mesuré.
- **L15** — Anciennes formes des fichiers d'exécution écrits par des composants déjà installés sur la TV (étape 10, PY-05).
- **L15** — luna.parse_reply sur les réponses getStatus (préalable de l'étape 11, PY-01).
- **L15** — Empaquetage du panneau principal : aucun empaqueteur trouvé dans le dépôt (seul scripts/package-tv-ambient.mjs existe). L'ajout de text.js au paquet installé n'est donc pas vérifiable depuis le dépôt.
- **L15** — Prochain numéro libre d'ADR : 0011 d'après docs/adr à 0d5a954. Un autre lot peut le prendre avant L15-03.
- **L16** — Priorité de EnvironmentFile= sur Environment= dans systemd. Elle vient de systemd.exec(5) et n'a pas été essayée : le Mac n'a pas systemd.
- **L16** — Valeurs par défaut des fusibles d'Electron 44 et effet de chacun sur le paquet TVLens.
- **L16** — macOS redemande-t-il les autorisations (capture, micro) après chaque construction signée ad hoc ?
- **L16** — Chemin physique des applis enregistrées sur la TV, modes et propriétaires des fichiers installés, et contenu du crochet 25-tvlens-tailscale.
- **L16** — Présence réelle sur la TV de test de tv/ambient.py et tv/luna.py, et de ambient.json et ambient-settings.json dans le dossier du compagnon.
- **L16** — Les modules de la bibliothèque standard importés par le code TV existent-ils dans le Python de la TV ? sys.stdlib_module_names a été lu sur le Python 3.14 du Mac.
- **L16** — Aucun ticket DOC-15 dans les tickets L10 et L11 déjà écrits (grep des fichiers du dossier de découpage). La fusion du test de couverture est donc proposée ici.
- **L16** — Faut-il compter les fichiers non suivis dans dirty (git status --porcelain les compte) ? C'est un choix de conception laissé à L16-02 et à la décision 3.
- **L16** — Aucun test n'a été lancé pour cette relecture. Le relevé des 13 noms absents des exemples vient d'un script de lecture des sources, lancé le 2026-10-14 sur 0d5a954. Les autres faits ont été vérifiés par lecture et grep sur 0d5a954.
- **L16** — Présence réelle de tv/ambient.py et tv/luna.py sur la TV de test.
- **L16** — Aucun test n'a été lancé pour ce découpage. Le relevé des 13 noms absents des exemples vient d'un script de lecture des sources, lancé le 2026-10-14 sur 0d5a954.
- **L17** — Aucun test n'a été lancé pendant cette relecture, ni node scripts/check.mjs : tout repose sur la lecture du code et sur grep.
- **L17** — Prettier et ESLint ne sont pas installés : l'effet de .prettierignore et de .gitattributes (L17-02) n'est pas observé.
- **L17** — La négation de .gitignore pour tests/fixtures/archives/** n'a pas été essayée avec git check-ignore.
- **L17** — Le chargement du vrai tv/app/remote-client.js hors navigateur est déduit de scripts/bench-perceived.cjs:86-100, non exécuté.
- **L17** — La possibilité de provoquer hors ligne chaque refus de la table de L17-07 est déduite des tests existants, non essayée cause par cause.
- **L17** — L17-02 : que le runtime hors ligne produise au moins une affirmation de surveillance n'est pas établi ; le ticket admet un registre sans affirmation. Le chemin exact du statut du registre dans l'état que publie HeadlessRuntime après open() n'a pas été relu.
- **L17** — L17-08 : aucun test ne charge app/main.cjs ; le changement de l'appel de la ligne 447 n'est constaté que par grep. Les lecteurs de registry.status dans l'interface Mac n'ont pas été cherchés au-delà d'un grep.
- **L17** — L17-09 : ce que Transport.deliver fait d'une réponse de session dont id est nul n'a pas été relu ligne à ligne ; le critère compare donc deux exécutions au lieu d'affirmer un résultat.
- **L17** — L17-03 : le comportement de PollPlan.read après un refus n'est affirmé que pour refused et legacy ; la commande grep du critère 4 n'a pas été essayée sur un ADR réel.
- **L17** — Les consommateurs des deux console.log de démarrage de server/main.cjs n'ont pas été cherchés jusqu'au bout.
- **L17** — TVLENS_REVISION n'est posée par aucun déploiement lu : host.started et le bloc server diront unknown tant qu'elle ne l'est pas.
- **L17** — Les numéros de lot des constats cités dans les reports (SEC-01, CORE-08, CORE-10, CORE-11, CORE-15, CORE-19, PY-04, ADP-03, ADP-05, ADP-09, ADP-10, ADP-16, TV-06) ne sont pas connus.
- **L17** — Les constats reportés GAP2-05 à GAP2-09, GAP3-04, GAP3-06 à GAP3-10, OUBLI-46 à 48, 50 à 52, 54 et 56 n'ont pas été revérifiés dans le code ; le texte de GAP1-05 dans le brief n'a pas été relu en entier.
- **L17** — Aucun ticket n'a été écrit pour GAP2-07 (retrait de auto.json) alors que le thème formats sur disque garde deux places : le relecteur le dit détachable, mais son périmètre exact dans adapters/local-store.cjs n'a pas été relu.
- **L17** — Aucun test n'a été lancé pendant le découpage : chaque critère d'acceptation est déduit de la lecture du code à 0d5a954.
- **L17** — Prettier et ESLint ne sont pas installés : l'effet de .prettierignore et de .gitattributes sur l'archive figée (L17-02) n'a pas été observé.
- **L17** — La négation de .gitignore pour tests/fixtures/archives/ (les motifs *.webm, *.bin et sessions/ y sont exclus) n'a pas été essayée avec git check-ignore.
- **L17** — Le chargement du vrai tv/app/remote-client.js hors navigateur est déduit de scripts/bench-perceived.cjs:86-100, non exécuté ; L17-03 prévoit le verdict BLOQUÉ si cela échoue.
- **L17** — La possibilité de provoquer hors ligne chaque refus de la table de L17-07 est déduite des titres des tests existants (tests/architecture-f06.test.cjs lignes 323, 343, 360, 536), sans les avoir relus en entier.
- **L17** — Les consommateurs éventuels des deux lignes console.log de démarrage du serveur (server/main.cjs:36 et :41) n'ont pas été cherchés jusqu'au bout ; L17-06 les conserve.
- **L17** — TVLENS_REVISION n'est posée par aucun déploiement que j'aie lu : la révision publiée par L17-06 et L17-09 dira « unknown » tant qu'un déploiement ne la fournit pas.
- **L17** — Le délai entre deux renvois de Transport.deliver n'a pas été lu : la durée du test Python de L17-10 pour une ligne retry reste à constater.
- **L17** — Les numéros de lot des constats cités par le brief (SEC-01, CORE-08, CORE-10, CORE-11, CORE-15, PY-04, ADP-05, ADP-10, TV-06) ne me sont pas connus : les reports les nomment par constat, sauf lot:L03 et lot:L05.
- **L17** — Les constats reportés GAP2-05 à GAP2-09, GAP3-04, GAP3-06 à GAP3-10 et OUBLI-46 à 48, 50 à 52, 54, 56 n'ont pas été revérifiés dans le code : leurs raisons s'appuient sur le texte du brief et la correction du relecteur.
- **L17** — Les lignes citées de tv/app/companion.js:320 et tv/app/surveillance-overlay.js:281 (la TV ne lit de registry que ready === false) ont été lues, mais aucun autre lecteur de registry.status côté tv/ n'a été cherché au-delà d'un grep.

## Angles que l'audit n'a pas couverts

Un critique de complétude a relu l'ensemble des audits et cherché ce qu'ils avaient laissé de côté.

Fichiers. Sur les 35 fichiers de plus de 150 lignes de core/, adapters/, runtime/, server/, mcp/, app/ et tv/, trois ne sont cités par aucun constat : app/style.css (337 lignes), tv/app/timeline.css (219) et adapters/session-library.cjs (160, présent seulement dans les tableaux de frontières alors qu'il lit les archives et leur version). Trois autres ne sont cités que pour un détail et portent un problème non examiné : app/ui/surveillance-view.mjs (describeSurveillance, ligne 119 : complexité 163, la plus élevée du projet ; TV-04 n'y relève que des libellés en double), app/ui/sessions-view.mjs et app/ui/job-card.js. Ouverts et sans problème propre : core/moment-index.cjs, adapters/codex-session-agent.cjs (à rattacher à ADP-08), tv/app/ambient.js, tv/app/remote-client.js. La mesure de départ a aussi un trou : la passe Prettier de FMT n'a modifié aucun fichier .css, .html ni .py (comparaison ROOT/FMT par extension).

  Sujets transverses, vérifiés dans le code. Sans constat : journal et diagnostic (lacune 1), formats sur disque (lacune 2 ; CORE-08 n'en voit qu'une partie), compatibilité entre parties déployées séparément (lacune 3), coût d'une session longue (lacune 7 ; CORE-20 le dit « non mesuré »), serveur MCP (lacune 8). Déjà traités : empaquetage et déploiement (OPS-08, 10, 15, 16, 17 ; pas de mise à jour automatique, et rien ne la demande), dépendances (six directes ; OPS-01, OPS-19). Sans matière : internationalisation, le français étant la règle écrite du projet ; le vrai sujet, des phrases françaises servant d'identifiants, est traité par TSTA-12, ADP-04 et CORE-15. Matière faible, aucun constat : accessibilité (lang="fr", 105 vrais boutons, 50 attributs aria et 13 dialog dans les deux pages ; aucun contrôle automatique).

  Contradictions à trancher avant le découpage, en plus des six doublons déjà signalés par les relecteurs.

  (1) CORE-01 extrait quatre briques dans runtime/, ADP-07 un seul runtime/session-host.cjs, pour la même duplication et dans le même lot L11.

  (2) Les codes d'erreur ont cinq domiciles : core/errors.cjs (CORE-10), runtime/refusals.cjs (CORE-11), ValidationError et Refusal (SEC-01), adapters/codex/errors.cjs (ADP-08), codes posés à la source (TSTA-12), avec deux conventions d'écriture (CODEX_DISCONNECTED, read-only). TSTA-12, en vague 1, se termine par le travail d'ADP-04, placé en vague 2.

  (3) Validation : schémas zod dans un nouveau dossier boundary/ (ADP-10, ADP-09) contre un validateur unique dans core/ (CORE-18, CORE-03). boundary/ ne figure dans aucune règle de couches proposée.

  (4) Ces règles de couches sont écrites trois fois : ESLint (OPS-04), tests/architecture/dependency-rules.test.cjs (TSTA-08), extension de tests/architecture.test.cjs (CORE-13).

  (5) Arborescence de tests : tests/unit, contract et integration (TSTB-02) contre des fichiers à plat rangés par comportement, plus tests/architecture et tests/process (TSTA-05, 08, 13), alors que le contrôle ne lance que tests/*.test.cjs. Les aides vont sous tests/helpers ou tests/support selon l'audit, et la même aide porte deux noms : async.cjs et wait.cjs, clock.cjs et virtual-clock.cjs, dom.cjs (avec bibliothèque) et fake-dom.cjs (artisanal), electron-host.cjs et mac-host.cjs.

  (6) Rédaction française : dans une projection du cœur (CORE-15) ou dans les modèles de vue de chaque client (TV-04, TSTC-14).

  (7) Ordre : SEC-01, en vague 1, fait passer le refus par défaut de 400 à 500, alors que tv/app/companion.js:240-245 donne un sens propre à « tout autre 400 ». Les suppressions du lot L09 (ADP-11, CORE-05) retirent des tests : elles demandent le drapeau supprime_tests, que seule la consigne du lot L07 mentionne.

  Non vérifié : aucun test lancé ; ce que devient stderr dans l'app Mac empaquetée ; la version de Python sur la TV. scripts/check.mjs est hors ROOT : lu par git show à la tête de la branche, sans rien modifier.

| Angle | Importance | Suite |
| --- | --- | --- |
| Journal et diagnostic d'une panne en production | haute | audité ensuite : constats GAP1-01 à GAP1-10 (lot L17) |
| Formats écrits sur disque : inventaire, version et archives de référence | haute | audité ensuite : constats GAP2-01 à GAP2-10 (lot L17) |
| Contrat de fil entre parties déployées séparément, et versions mélangées | haute | audité ensuite : constats GAP3-01 à GAP3-10 (lot L17) |
| Modèles de vue : la complexité la plus élevée du projet, jamais examinée | moyenne | non audité — décision du propriétaire |
| Python, CSS et HTML hors des mesures et de tout outillage | moyenne | non audité — décision du propriétaire |
| Fournisseurs externes : versions prises en charge, montée de version, qualité des consignes | moyenne | non audité — décision du propriétaire |
| Coût d'une session longue en mémoire et en écritures, jamais mesuré | moyenne | non audité — décision du propriétaire |
| Serveur MCP externe : statut de la fonction et chaîne d'installation | faible | non audité — décision du propriétaire |

### Modèles de vue : la complexité la plus élevée du projet, jamais examinée

- **Périmètre :** app/ui/surveillance-view.mjs:119 (describeSurveillance, complexité 163), :62 (describeCard, 29), :93 (describeClaim, 28) ; app/ui/job-view.mjs:65 (describeJob, 58) et :34 (describeFreshness, 41) ; app/ui/sessions-view.mjs:50 (describeHealth, 32), :82 (describeStorage, 24), :116-122 ; app/ui/recap-view.js:6 (renderRecapView, 48) ; app/ui/job-card.js:34 (jobBlocks : 366 lignes une fois formaté, complexité 38) ; jumeaux côté TV : tv/app/surveillance-view.js:108 (60) et :437 (describeAmbient, 38), tv/app/sessions-view.js:250 (describeCapture, 48), tv/app/companion.js:138 (describeJob, 36). Complexités lues dans eslint-audit.json.
- **Question à trancher :** L'audit des interfaces range ces modèles de vue dans le « socle sain », et le découpage prévu (UI-02, TV-01) les déplace tels quels. Or 9 des 20 fonctions les plus complexes du projet sont des modèles de vue ou des rendus de cartes. Quelle part de cette complexité vient de la lecture défensive d'un état sans schéma, où chaque champ est supposé absent, et disparaît si l'état publié est normalisé une fois à l'entrée ? Quelle forme cible : une fonction normalize(state) par agrégat, puis un petit modèle par état (écoute, vérification, retard, restauration, arrêt) ? Les tests existants (35 appels à describeSurveillance dans tests/mac-ui.test.cjs, 10 dans tests/tv-panel.test.cjs) suffisent-ils comme filet pour ce découpage ?

### Python, CSS et HTML hors des mesures et de tout outillage

- **Périmètre :** tv/ambient.py, tv/capture.py, tv/controller.py, tv/transport.py, tv/luna.py et prototypes/lg-remote/runtime/*.py (2 947 lignes installées sur la TV, bibliothèque standard seulement ; tv/capture.py : 82 points-virgules et une ligne de 414 caractères ; 26 lignes de plus de 160 caractères dans tv/ ; aucun fichier de configuration Python à la racine) ; app/style.css (337 lignes, 20 de plus de 160 caractères, 87 couleurs hexadécimales distinctes pour 8 variables, 95 sélecteurs d'identifiant), app/ui/shell.css, tv/app/style.css, tv/app/timeline.css, tv/app/surveillance.css, tv/app/ambient.css (873 lignes en tout) ; app/index.html, tv/app/index.html, tv/app/ambient.html. Hors ROOT, lu par git show : scripts/check.mjs limite ses règles par fichier et son lint à l'expression /\.(cjs|mjs|js)$/.
- **Question à trancher :** Les mesures de départ (188 fichiers reformatés, 580 infractions) ne couvrent que le JavaScript, et OPS-02, OPS-03 et OPS-14 ne choisissent d'outil que pour lui. Quel formateur, quel lint et quel contrôle de types pour le Python de la TV, qui doit rester en bibliothèque standard et tourner sur le Python de l'appareil ? La règle des 160 caractères et le cliquet doivent-ils s'étendre aux fichiers .py, .css et .html ? Pour le CSS : les 95 sélecteurs d'identifiant de app/style.css freinent-ils le découpage de renderer.js (UI-02), et faut-il des variables de couleur avant de toucher aux vues ? Dans quel ordre formater le CSS et le HTML par rapport aux tests qui épinglent le balisage (tests/mac-ui.test.cjs:331-334) ?

### Fournisseurs externes : versions prises en charge, montée de version, qualité des consignes

- **Périmètre :** adapters/codex-confinement.cjs:80-93 (version de Codex lue pour le message de refus seulement) et :182 (blocage des sous-agents mesuré sur 0.160.1 seulement) ; adapters/codex-session-client.cjs:334 et adapters/codex-rpc.cjs (17 méthodes de l'App Server appelées ou écoutées) ; app/main.cjs:553-557 (le Mac prend le premier codex trouvé : ~/.local/bin, Homebrew, PATH) ; adapters/model-settings.cjs:3 et :20 (lit models_cache.json, fichier privé de Codex), adapters/codex-perception.cjs:76, app/main.cjs:74-75, server/main.cjs:34 (identifiant de modèle gpt-6-luna en littéral, 8 occurrences dans 4 fichiers) ; adapters/companion-prompt.cjs, adapters/surveillance-prompt.cjs, adapters/codex-recap.cjs:58 (consignes) ; adapters/local-transcriber.cjs et runtime/session-runtime.cjs:150-159 (whisper-cli et son modèle) ; SECURITY.md:25-28 (VPS en 0.158.0, « aucune mesure sous Linux ») ; scripts/probe-confinement.cjs, scripts/evaluate-actions.cjs.
- **Question à trancher :** Quelles versions de Codex, de modèle, de whisper-cli et de ffmpeg sont prises en charge, et que fait chaque hôte devant une autre : refus au démarrage, avertissement, rien ? Quand Codex ou le modèle change, quel script réenregistre les formes de protocole (la fixture tests/fixtures/codex-protocol/ proposée par TSTB-08), et qui le lance ? Quel jeu de questions hors ligne dit si une consigne réécrite ou déplacée par ADP-13 répond encore correctement, alors que TSTB-17 ne vérifie que la structure des consignes ? L'oubli déjà signalé ne porte que sur l'épinglage de Codex côté serveur.

### Coût d'une session longue en mémoire et en écritures, jamais mesuré

- **Périmètre :** core/session.cjs:477-494 (snapshot recopie tous les passages ; 19 appels à emit, 9 à persist) ; adapters/local-store.cjs:157-175 (chaque sauvegarde réécrit le fichier entier, indenté), :189 (registre de surveillance réécrit jusqu'à chaque seconde, « megabytes at saturation »), :55 ; core/surveillance.cjs:902 et :911 (état sérialisé en JSON pour détecter un changement) ; core/deep-ask.cjs:69 (questions jamais retirées de la liste) ; runtime/headless-runtime.cjs:326-335 (deux minuteries permanentes) et :925-980 (liste des sessions relue à chaque GET /v1/storage) ; server/main.cjs:18 (conservation sans limite par défaut) ; deploy/tvlens.service:33-34 (MemoryHigh 1500M, MemoryMax 2G) ; scripts/bench-backend.cjs (mesures courtes hors ligne, aucune sur la durée).
- **Question à trancher :** Pour une session de trois heures conservée jusqu'à suppression, qui est le réglage par défaut du serveur, combien d'octets sont réécrits à chaque passage, combien de temps prend un snapshot, et quelle mémoire tient le processus face au plafond de 2 Go du service ? Ces mesures, faites avec scripts/simulate-stream.cjs ou une extension de scripts/bench-backend.cjs, disent si CORE-20 (classé P3) et CORE-08 doivent monter dans le plan, et donnent le seuil qu'un test de non-régression devra garder.

### Serveur MCP externe : statut de la fonction et chaîne d'installation

- **Périmètre :** mcp/server.cjs:11-19 (descripteur par défaut sous ~/Library/Application Support, donc Mac seulement) et :21 ; mcp/tool-definitions.cjs ; adapters/video-bridge.cjs (méthode register et table scopes : leur seul appelant de production est adapters/codex-video-agent.cjs:13, adaptateur hérité d'ADP-11) ; app/main.cjs:177 (seul hôte qui ouvre le pont ; le serveur ne l'expose pas, docs/refactor-runtime.md:25) ; scripts/setup-codex.cjs:5-11 (inscrit le chemin absolu du dépôt dans la configuration Codex de l'utilisateur, après une copie de sauvegarde) ; README.md:163 ; tests/video-research.test.cjs:50-58, tests/architecture-f05.test.cjs:686-739, tests/question-ceiling.test.cjs:189-209.
- **Question à trancher :** Le MCP externe reste-t-il une fonction prise en charge ? Si oui : comment un client le lance-t-il depuis l'app empaquetée, alors que setup-codex pointe vers un dépôt cloné et qu'OPS-08 et DOC-09 ne s'accordent pas sur la présence de mcp/ dans le paquet (lancement depuis l'archive : supposé impossible, non essayé), et quel test le couvre sans dépendre de la machine ? Si non : que retire-t-on (mcp/, la moitié register et scopes de VideoBridge, setup-codex), et que deviennent @modelcontextprotocol/sdk et zod, que seul mcp/ utilise aujourd'hui alors qu'ADP-09 et ADP-10 veulent étendre zod ?

