# Travailler par tickets avec la boucle

La boucle traite les tickets de `docs/travail/tickets/` un par un. Pour chaque ticket elle lance une
session Claude Code fraîche, puis relance elle-même tous les contrôles avant de committer et de pousser.
La session propose ; le script décide.

Ce dossier contient :

| Quoi | Où |
| --- | --- |
| Les tickets, un fichier chacun, numérotés dans l'ordre d'exécution | `tickets/NNN-<sujet>.md` |
| La liste des tickets, leurs dépendances et ceux à relire d'abord | `tickets/INDEX.md` |
| Le modèle d'un ticket | `tickets/_gabarit.md` |
| Les fiches des chantiers de fond, pas encore découpés en entier | `fiches/` |
| Le rapport de la nuit qui a produit la file | `nuit-2026-10-14.md` |

Les constats qui justifient chaque ticket sont dans `docs/audit-maintenabilite.md`.

## Avant de lancer

- Être sur une branche de travail, jamais `main`.
- N'avoir aucun fichier suivi modifié : `git status` propre, fichiers non suivis mis à part.
- Avoir relu et committé les tickets. Un ticket est un contrat : la boucle refuse une session qui en
  modifie les critères, et elle refuse un ticket que Git ne suit pas.
- Avoir relu en priorité les tickets listés dans `tickets/INDEX.md` sous « Tickets à relire avant de
  lancer » (ils installent une dépendance, touchent au harnais, suppriment des tests ou demandent un
  ADR) et tranché ceux de « Tickets qui attendent une décision ».
- Ne rien écrire d'autre dans le dépôt pendant que la boucle tourne : tout fichier apparu pendant un
  ticket part dans le commit de ce ticket.
- Mac branché, capot ouvert. La machine sature vite : pas d'autre agent ni de navigateur lourd à côté.

## Lancer

```sh
node scripts/loop/run.mjs --dry-run                 # dit quel ticket partirait, sans rien lancer
node scripts/loop/run.mjs --model claude-opus-5-5   # le prochain ticket prêt, puis s'arrête
node scripts/loop/run.mjs --max 5 --model claude-opus-5-5
node scripts/loop/run.mjs --ticket T012 --model claude-opus-5-5
```

| Option | Défaut | Rôle |
| --- | --- | --- |
| `--max <n>` | 1 | nombre de tickets à enchaîner |
| `--ticket <id>` | prochain prêt | traiter ce ticket précisément |
| `--attempts <n>` | 3 | sessions fraîches par ticket avant de le bloquer |
| `--model`, `--effort` | ceux du compte | modèle et effort des sessions |
| `--timeout-min <n>` | 120 | durée maximale d'une session |
| `--compact-window <n>` | 200000 | plafond de contexte d'une session, en tokens ; 0 pour ne pas le fixer |
| `--budget-usd <n>` | aucun | plafond de dépense d'une session |
| `--no-push` | pousse | committer sans pousser |
| `--permission-mode <m>` | `auto` | mode de permission des sessions |

Le prochain ticket prêt est le premier, dans l'ordre des numéros, dont le statut est `a-faire` et dont
tous les bloqueurs (`bloque_par`) sont `termine`. Un ticket `en-cours` ou `bloque` arrête la file : il
attend une décision.

La boucle ne lit que l'en-tête d'un ticket. Elle ne sait pas qu'un ticket pose encore une question
dans « Hypothèses bloquantes » : elle lance sa session comme une autre. Trancher ces tickets avant de
lancer, ou s'arrêter avant eux avec `--max`. Le ticket qui corrige ce point est dans la file
(constat ESSAI-06 du rapport d'audit).

Pendant la session, la boucle affiche une ligne par outil appelé, avec le temps écoulé :
`[boucle] 03:12  Read core/session.cjs`. Les lignes plus en retrait viennent d'un sous-agent.

Ordre de grandeur, mesuré sur le seul ticket passé par la boucle (T001, six lignes dans un test) :
29 tours, 18 min 40 s de session, 3,73 $, puis environ 1 min 30 de contrôle complet. Commencer par
`--max 1`, lire le résultat, puis monter.

## Ce que fait la boucle pour un ticket

1. Elle passe le ticket à `en-cours` et lance `claude -p` avec la consigne de suivre la skill `ticket`.
2. La session explore (sous-agent `explorateur`), implémente (`implementeur`), fait relire
   (`relecteur`), corrige au besoin, puis écrit son verdict dans
   `.harness-state/tickets/<ID>/verdict.json`. Les sous-agents sont lancés au premier plan : une garde
   refuse tout lancement en arrière-plan, qui ferait finir la session avant leur rapport.
3. Si le verdict est TERMINÉ, la boucle vérifie elle-même :
   - le ticket n'a pas changé au-dessus de son journal ;
   - le harnais n'a pas été touché, sauf ticket marqué `harnais: oui` ;
   - aucun fichier de test n'a été supprimé, sauf ticket marqué `supprime_tests: oui` ;
   - un ADR a été ajouté si le ticket porte `adr: oui` ;
   - `node scripts/check.mjs` est vert en entier.
4. Tout est bon : elle resserre le cliquet, passe le ticket à `termine`, committe
   (`<ID>: <titre>`) et pousse.
5. Sinon : elle écrit la raison du refus et lance une nouvelle session fraîche, qui reprend à partir du
   journal et du rapport d'échec. Après le nombre de tentatives prévu, le ticket passe à `bloque` et la
   boucle s'arrête.

Codes de sortie : 0 terminé, 1 refus au démarrage, 2 ticket bloqué, 3 commit fait mais push refusé.

## Lire un échec

La dernière ligne de la boucle dit dans quel cas on est.

| La boucle affiche | Ce que ça veut dire | Où regarder |
| --- | --- | --- |
| un refus avant toute session (code 1) | branche `main`, fichier suivi modifié, file invalide ou ticket non suivi par Git | le message lui-même ; corriger puis relancer |
| `Tentative n refusée : …` | la session n'a pas rendu de verdict, s'est dite PARTIELLE, ou s'est dite TERMINÉE alors qu'un contrôle refuse | `.harness-state/tickets/<ID>/echec-<n>.txt` |
| `<ID> est bloqué : …` (code 2) | la session s'est dite BLOQUÉE, ou toutes les tentatives ont été refusées | la raison affichée, puis le journal du ticket |
| `Le commit est fait mais le push a échoué` (code 3) | le ticket est intégré en local, rien d'autre n'est lancé | `git status`, puis `git push` à la main |

Le rapport `echec-<n>.txt` commence par la raison, puis donne la sortie du contrôle qui a refusé.
Les raisons possibles : « sans verdict », « PARTIELLE » avec ce qui reste, « Le ticket a été modifié
au-dessus de son journal », « Le harnais a été modifié sans que le ticket l'autorise », « Des fichiers
de test ont été supprimés », « Le ticket demande un ADR et aucun n'a été ajouté », « Le contrôle
qualité complet est rouge » suivi de la sortie de `scripts/check.mjs`.

Pour aller plus loin :

| Où | Quoi |
| --- | --- |
| Le journal du ticket (section `## Journal`) | les jalons écrits par la session, avec commandes et sorties |
| `.harness-state/loop/events.jsonl` | une ligne par événement : session lancée, session terminée (tours, durée, coût, compactions), refus, intégration, blocage, avec la charge de la machine |
| `.harness-state/tickets/<ID>/verdict.json` | le verdict de la dernière session, ses preuves et ses réserves (`reste`) |
| `.harness-state/tickets/<ID>/session-<n>.json` | le compte rendu final de la session (tours, durée, coût) |
| `.harness-state/tickets/<ID>/session-<n>.jsonl` | le flux entier de la session, message par message |
| `.harness-state/tickets/<ID>/exploration.md`, `revue-<n>.diff` | le rapport d'exploration et les diffs relus |

Un verdict TERMINÉ peut garder des réserves dans `reste` : la boucle intègre sans les afficher. Tant
que ce point n'est pas tranché (voir le rapport de nuit), ouvrir `verdict.json` après chaque ticket.

Un échec qui ne se produit que sous charge se reproduit et s'explique avant d'être écarté : on ne
relance pas la boucle jusqu'à ce qu'elle passe.

`.harness-state/` est hors Git : c'est de l'état local. Le dossier d'un ticket se supprime sans risque
une fois le ticket intégré.

## Débloquer un ticket

Le ticket est à `bloque`, la file est arrêtée, le travail en cours est laissé tel quel dans le dossier.
Lire d'abord la raison affichée et le dernier `echec-<n>.txt`, puis `git status` et `git diff`. Quatre
cas.

1. **Le ticket attend une décision.** La section « Hypothèses bloquantes » pose une question au
   propriétaire et la session a rendu BLOQUÉ. Écrire la décision dans cette section, à la place de la
   question, remettre `statut: a-faire`, committer, relancer. Si la session a tranché elle-même au
   lieu de s'arrêter, relire son commit comme une proposition : rien dans la boucle ne l'en empêche.
2. **Le ticket est faux ou trop gros** (périmètre contredit par le code, critère invérifiable, session
   qui s'est compactée). Corriger ou recouper le ticket, garder ou jeter le travail en cours, remettre
   `statut: a-faire`, committer, relancer.
3. **Le travail est presque bon.** Le finir à la main ou dans une session interactive, lancer
   `node scripts/check.mjs`, passer le ticket à `termine`, committer.
4. **Le harnais se trompe** (contrôle faux, garde-fou trop large). Le corriger avec son test, dans un
   commit séparé, puis remettre le ticket à `a-faire`. Un contrôle se rend plus juste, jamais plus
   permissif pour faire passer un ticket.

Dans tous les cas la boucle ne repart que si `git status` ne montre aucun fichier suivi modifié.

Jeter le travail en cours d'un ticket :

```sh
git stash --include-untracked   # réversible ; `git stash drop` ensuite si le travail est bien à jeter
```

Attention : cette commande emporte aussi les fichiers non suivis qui ne viennent pas du ticket.

## Écrire un ticket

Suivre la skill `decoupage` et partir de `docs/travail/tickets/_gabarit.md`. Un bon ticket tient dans
une session et un commit, livre seul quelque chose de vérifiable, et chacun de ses critères se vérifie
par un test ou une commande. Les champs `installe`, `harnais` et `supprime_tests` valent `non` par
défaut ; les passer à `oui` est une décision à relire.

Ce que l'essai sur T001 a appris :

- Aucun critère ne porte sur l'état global du dossier (« `git status` ne montre que… ») : des fichiers
  non suivis étrangers au ticket le rendent impossible à tenir, et la boucle les écarte déjà du commit.
- Les retouches triviales d'un même fichier se regroupent dans un ticket : le coût fixe d'une session
  (explorer, relire, contrôle complet) domine pour un petit changement.
- La section « Hypothèses bloquantes » commence par « Aucune décision n'est attendue. » ou par
  « Décision attendue du propriétaire : » suivi de la question. Un ticket qui attend une décision se
  place en fin de file : la boucle le lancerait comme un autre, pour le prix d'une session entière.
- Le ticket cite les chemins et la version du code qu'il a lus. Si le code a bougé depuis, la session
  doit le dire et s'arrêter plutôt que deviner.

## Garde-fous

Dans une session de ticket, les hooks de `.claude/hooks/` refusent : commit, push, changement de
branche, session Claude ou Codex imbriquée, `gh`, installation de dépendance non autorisée, écriture
hors du projet, modification du harnais ou d'un autre ticket, création d'un fichier de test nommé
d'après un chantier, sous-agent lancé en arrière-plan. Chaque fichier écrit est contrôlé aussitôt, et la
session ne peut pas se terminer sans verdict ni se dire TERMINÉE sur un contrôle rouge.

Ce sont des garde-fous sur le texte des commandes, pas un bac à sable : ils rattrapent l'erreur, pas la
malveillance. La décision d'intégrer reste celle de la boucle.

En session interactive, modifier le harnais demande une confirmation. Pour l'ouvrir dix heures :

```sh
echo $(( $(date +%s) + 10*3600 )) > .harness-state/harnais-ouvert
```
