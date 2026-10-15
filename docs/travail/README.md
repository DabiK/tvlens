# Travailler par tickets avec la boucle

La boucle traite les tickets de `docs/travail/tickets/` un par un. Pour chaque ticket elle lance une
session d'agent fraîche (Claude par défaut), puis relance elle-même tous les contrôles avant de committer et de pousser.
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
node scripts/loop/run.mjs --dry-run       # dit quel ticket partirait, sur quel modèle, sans rien lancer
node scripts/loop/run.mjs                 # le prochain ticket prêt, puis s'arrête
node scripts/loop/run.mjs --max 5
node scripts/loop/run.mjs --ticket T012
```

| Option | Défaut | Rôle |
| --- | --- | --- |
| `--max <n>` | 1 | nombre de tickets à enchaîner |
| `--engine claude\|codex` | `claude` | moteur de l'exploration et de l'implémentation ; relecteur Claude |
| `--ticket <id>` | prochain prêt | traiter ce ticket précisément |
| `--attempts <n>` | jusqu'en haut de l'échelle | sessions fraîches par ticket avant de le bloquer (3 avec `--model`) |
| `--model <m>` | l'échelle | fige le modèle de toutes les tentatives, sans escalade |
| `--effort <e>` | celui du palier | remplace l'effort de chaque palier |
| `--no-retro` | rétrospective | ne pas lancer la rétrospective après le ticket |
| `--tune-every <n>` | 0 (jamais) | harmoniser les consignes du harnais tous les n tickets intégrés (plus bas) |
| `--timeout-min <n>` | 120 | durée maximale d'une session |
| `--compact-window <n>` | 200000 | plafond de contexte d'une session, en tokens ; 0 pour ne pas le fixer |
| `--budget-usd <n>` | aucun | plafond de dépense d'une session |
| `--no-push` | pousse | committer sans pousser |
| `--permission-mode <m>` | `auto` | mode de permission des sessions |

Le prochain ticket prêt est le premier, dans l'ordre des numéros, dont le statut est `a-faire`, dont
tous les bloqueurs (`bloque_par`) sont `termine`, et qui n'attend aucune décision. Un ticket `en-cours`
ou `bloque` arrête la file : il attend une décision.

La boucle lit l'en-tête d'un ticket et le début de sa section « Hypothèses bloquantes ». Un ticket dont
la section commence par « Décision attendue du propriétaire : » n'est jamais lancé : il reste `a-faire`,
et ceux qui en dépendent attendent avec lui. La boucle continue avec les tickets prêts qui n'en dépendent
pas, et nomme une fois, au premier ticket choisi, ceux qui attendent une décision (`--dry-run` compris).
Quand plus rien n'est prêt, la raison d'arrêt les nomme et la boucle s'arrête (code 0).
`--ticket` sur un tel ticket est refusé avant toute session, avec la question (code 1). Pour trancher :
« Débloquer un ticket », plus bas.

Pendant la session, la boucle affiche une ligne par outil appelé, avec le temps écoulé :
`[boucle] 03:12  Read core/session.cjs`. Les lignes plus en retrait viennent d'un sous-agent.

Ordre de grandeur, mesuré sur Opus : T001 (six lignes dans un test) 29 tours, 18 min 40 s, 3,73 $ ;
T002 (un contrôle de la boucle et ses tests) 6,79 $. Commencer par `--max 1`, lire le résultat, puis
monter.

### Moteur Codex

```sh
node scripts/loop/run.mjs --engine codex --dry-run
node scripts/loop/run.mjs --engine codex --no-push --max 1
```

Codex suit `.agents/skills/ticket-codex/SKILL.md` : il explore et implémente lui-même, tests d'abord,
déclare les écarts avant de coder, tient le journal et écrit son verdict. `AGENTS.md` est un lien vers
`CLAUDE.md`. La boucle enregistre ensuite l'état relu et lance un processus Claude séparé avec
`--agent relecteur`, au modèle Claude du palier (au moins Opus pour un ticket standard).
Elle garde le rapport dans `relecture-<n>.md` et le verdict dans `relectures.jsonl`.

Seul un verdict TERMINÉ déclenche la relecture. Un BLOQUÉ arrête la boucle immédiatement avec sa
raison, y compris après une correction. Un verdict absent, illisible ou PARTIEL refuse la tentative
sans relecture ; la tentative suivante peut reprendre le travail à partir du rapport d'échec.
Le relecteur tourne hors mode ticket : les hooks ne lui demandent pas de corriger ni d'écrire le verdict.

Une relecture « à corriger » ou « illisible » reprend la même session avec `codex exec resume`, son
`thread_id` et le rapport complet. Trois corrections au plus par tentative, puis refus et escalade.
Les contrôles de la boucle restent communs ; la rétrospective et l'harmonisation restent sur Claude.
Le verdict appartient à la session, la boucle ne le réécrit pas.

| Palier | Modèle Codex | Effort |
| --- | --- | --- |
| 0 | `gpt-6.1-sol` | high |
| 1 | `gpt-6-astra` | high |
| 2 | `gpt-6-astra` | xhigh |
| 3 | `gpt-6-astra` | max |

Le niveau fixe le départ comme pour Claude. `--model` et `--effort` remplacent ces réglages ; le
relecteur reste Claude. `--dry-run` affiche le moteur et les paliers prévus. Toute valeur de moteur
autre que `claude` ou `codex` est refusée au démarrage. Les binaires se remplacent pour les tests
par `TVLENS_CODEX_BIN` et `TVLENS_CLAUDE_BIN`.

La boucle lance `codex exec --json` avec stdin ignoré et impose `workspace-write`,
`approval_policy="never"`, `sandbox_workspace_write.network_access=true`, `--ignore-user-config`
et `--dangerously-bypass-hook-trust`. À la reprise, le bac à sable passe par
`-c sandbox_mode="workspace-write"` et le processus part dans la racine : `resume` n'accepte pas
`-s` ni `-C`. Aucun `--ephemeral`, pour conserver la session. `--timeout-min` borne chaque processus.
`--budget-usd`, `--permission-mode` et `--compact-window` concernent les sessions Claude ; ils ne
remplacent pas les réglages imposés à Codex.

Le flux, reprises comprises, est archivé dans `.harness-state/tickets/<ID>/codex-<tentative>.jsonl`.
Les événements enregistrent le moteur, les jetons cumulés par catégorie, les tours, la durée mesurée
et le nombre de relectures. Le coût en dollars reste `null`, car le flux Codex ne le donne pas.
Une erreur du flux ou un processus Codex en échec refuse la tentative, même avec un verdict TERMINÉ.

Les hooks de `.codex/hooks.json` partagent `guard-write.mjs` et `guard-bash.mjs`, avec résolution de
la racine par Git. Un patch est refusé si un seul de ses chemins est interdit, déplacement compris.
Un hook Codex en erreur laisse passer l'appel : les contrôles de la boucle restent le dernier mur.
Le bac à sable interdit aussi l'écriture dans `.git`, `.codex` et `.agents` ; ces deux derniers
dossiers doivent être installés depuis un contexte disposant des droits nécessaires.

### Modèle de chaque tentative Claude

Chaque tentative tourne sur un palier d'une échelle, du moins cher au plus fort
(`scripts/loop/models.mjs`) :

| Palier | Modèle | Effort |
| --- | --- | --- |
| 0 | Sonnet 5.5 | high |
| 1 | Opus 5.5 | high |
| 2 | Opus 5.5 | xhigh |
| 3 | Fable 5.1 | high |

Le niveau du ticket fixe le palier de départ et le palier en dessous duquel le relecteur ne descend
pas. Une tentative refusée fait monter d'un palier ; par défaut la boucle tente jusqu'en haut.

| Niveau | Départ | Relecteur au moins | Par défaut pour |
| --- | --- | --- | --- |
| `simple` | 0 | 0 | — (à déclarer) |
| `standard` | 0 | 1 | tout ticket sans autre marque |
| `sensible` | 1 | 1 | `adr`, `supprime_tests` ou `installe` à `oui` |
| `critique` | 2 | 2 | `harnais: oui` |

Le champ `niveau:` de l'en-tête remplace le niveau déduit. Le modèle du relecteur est imposé par le
hook `guard-agent`, à partir de `TVLENS_REVIEW_MODEL` ; les autres sous-agents héritent du modèle de la
session. Le commit est signé du modèle de la tentative qui a abouti.

## Ce que fait la boucle pour un ticket

1. Elle passe le ticket à `en-cours` et lance `claude -p` avec la consigne de suivre la skill `ticket`.
2. La session explore (sous-agent `explorateur`), implémente (`implementeur`), fait relire
   (`relecteur`) après avoir enregistré l'état relu (`node scripts/loop/reviewed-state.mjs record`),
   corrige au besoin, puis écrit son verdict dans
   `.harness-state/tickets/<ID>/verdict.json`. Les sous-agents tournent au premier plan : le hook
   `guard-agent` corrige tout lancement en arrière-plan, qui ferait finir la session avant leur
   rapport. Le hook `record-review` enregistre le verdict de chaque relecteur dans `relectures.jsonl`,
   et son rapport dans `relecture-<n>.md`.
3. Si le verdict est TERMINÉ, la boucle vérifie elle-même :
   - le ticket n'a pas changé au-dessus de son journal ;
   - le harnais n'a pas été touché, sauf ticket marqué `harnais: oui` ;
   - aucun fichier de test n'a été supprimé, sauf ticket marqué `supprime_tests: oui` ;
   - un ADR a été ajouté si le ticket porte `adr: oui` ;
   - une relecture est enregistrée, et l'état final du dépôt est celui que le dernier relecteur a lu,
     journal du ticket et fichiers non suivis d'avant la session mis à part ;
   - le dernier relecteur a rendu « accepté », sur cette même revue ;
   - `node scripts/check.mjs` est vert en entier.
4. Tout est bon : elle resserre le cliquet, passe le ticket à `termine`, committe
   (`<ID>: <titre>`) et pousse. Elle affiche le coût total du ticket et les réserves (`reste`) du verdict.
5. Sinon : elle écrit la raison du refus et lance une nouvelle session fraîche, un palier plus haut, qui
   reprend à partir du journal et du rapport d'échec. Après le nombre de tentatives prévu, le ticket
   passe à `bloque`.
6. Intégré ou bloqué, elle lance la rétrospective du ticket (plus bas), puis s'arrête si le ticket est
   bloqué ou le push refusé.
7. Avec `--tune-every N`, tous les N tickets intégrés, elle harmonise les consignes du harnais (plus
   bas) avant le ticket suivant.

Codes de sortie : 0 terminé, 1 refus au démarrage, 2 ticket bloqué, 3 commit fait mais push refusé,
4 harmonisation refusée que la boucle n'a pas pu défaire.

## Lire un échec

La dernière ligne de la boucle dit dans quel cas on est.

| La boucle affiche | Ce que ça veut dire | Où regarder |
| --- | --- | --- |
| un refus avant toute session (code 1) | branche `main`, fichier suivi modifié, file invalide, ticket non suivi par Git, ou ticket demandé par `--ticket` qui ne peut pas partir (inconnu, pas prêt, en attente d'une décision, ou file arrêtée par un autre ticket `en-cours` ou `bloque`) | le message lui-même ; corriger puis relancer |
| `Tentative n refusée : …` | la session n'a pas rendu de verdict, s'est dite PARTIELLE, ou s'est dite TERMINÉE alors qu'un contrôle refuse | `.harness-state/tickets/<ID>/echec-<n>.txt` |
| `<ID> est bloqué : …` (code 2) | la session s'est dite BLOQUÉE, ou toutes les tentatives ont été refusées | la raison affichée, puis le journal du ticket |
| `Le commit est fait mais le push a échoué` (code 3) | le ticket est intégré en local, rien d'autre n'est lancé | `git status`, puis `git push` à la main |
| `Harmonisation <ID> refusée …` | l'harmonisation est annulée : fichiers suivis remis à `HEAD`, fichiers nouveaux mis de côté ; la file continue | `.harness-state/tickets/<ID>/refus.txt`, et `mis-de-cote/` pour un fichier à récupérer |
| `… sa remise à HEAD est incomplète …` (code 4) | refus non défait ; aucun ticket lancé | fichiers listés, `git status`, `.git/index.lock`, `refus.txt` |

Le rapport `echec-<n>.txt` commence par la raison, puis donne la sortie du contrôle qui a refusé.
Les raisons possibles : « sans verdict », « PARTIELLE » avec ce qui reste, « Le ticket a été modifié
au-dessus de son journal », « Le harnais a été modifié sans que le ticket l'autorise », « Des fichiers
de test ont été supprimés », « Le ticket demande un ADR et aucun n'a été ajouté », « Aucune relecture
n'est enregistrée », « Aucune relecture lisible n'est enregistrée » (`reviewed-state.json` abîmé),
« La liste des fichiers non suivis d'avant la session est perdue » (`untracked-before.json`, écrit par
la boucle, abîmé), « Le changement a été modifié depuis la dernière relecture » suivi des fichiers
concernés, « Aucun verdict de relecteur n'est enregistré », « Le dernier verdict porte sur revue-<n>,
pas sur la dernière revue enregistrée », « Le dernier relecteur n'a pas accepté », « Le contrôle
qualité complet est rouge » suivi de la sortie de `scripts/check.mjs`.

Pour aller plus loin :

| Où | Quoi |
| --- | --- |
| Le journal du ticket (section `## Journal`) | les jalons écrits par la session, avec commandes et sorties |
| `.harness-state/loop/events.jsonl` | une ligne par événement, avec la charge de la machine : session lancée (niveau, modèle, effort, palier, relecteur), session terminée (tours, durée, coût, coût par modèle, sous-agents, refus de permission, compactions), refus, intégration et blocage (tentatives, coût total), rétrospective, harmonisation (lancée : identifiant, sujets, observations ; puis intégrée avec son commit, les observations traitées et, s'il a échoué, la raison du marquage manqué, refusée avec sa raison et les fichiers mis de côté, ou sans changement ; sautée, avec la raison, quand le journal des retours est illisible ; non défaite, avec les fichiers restants, les commandes Git en échec et les fichiers déjà mis de côté, quand la remise à `HEAD` est incomplète) |
| `.harness-state/tickets/<ID>/verdict.json` | le verdict de la dernière session, ses preuves et ses réserves (`reste`) |
| `.harness-state/tickets/<ID>/session-<n>.json` | le compte rendu final de la session (tours, durée, coût) |
| `.harness-state/tickets/<ID>/session-<n>.jsonl` | le flux entier de la session, message par message |
| `.harness-state/tickets/<ID>/exploration.md` | le rapport d'exploration |
| `.harness-state/tickets/<ID>/ecarts.md` | les écarts aux critères déclarés avant l'implémentation et les constats contestés, que le relecteur tranche |
| `.harness-state/tickets/<ID>/revue-<n>.diff`, `revue-<n>.fichiers` | chaque relecture : le diff relu, fichiers nouveaux en entier, et la liste des fichiers |
| `.harness-state/tickets/<ID>/reviewed-state.json` | l'état de la dernière relecture, que la boucle compare à l'état final |
| `.harness-state/tickets/<ID>/relectures.jsonl` | le verdict de chaque relecteur, la revue qu'il a lue et son modèle |
| `.harness-state/tickets/<ID>/relecture-<n>.md` | le rapport du relecteur dont le verdict est la ligne `n` de `relectures.jsonl`, pour un ticket comme pour une harmonisation |
| `.harness-state/tickets/<ID>/retro-entree.md`, `retro.json` | ce que la rétrospective a reçu, et ce qu'elle a rendu |
| `.harness-state/tickets/H<nnn>/observations.json`, `refus.txt` | pour une harmonisation : les observations retenues par la boucle, et la raison d'un refus, que lit l'harmonisation suivante |
| `.harness-state/tickets/H<nnn>/mis-de-cote/` | pour une harmonisation refusée : les fichiers nouveaux apparus pendant la session, sous leur chemin, à récupérer à la main s'ils n'en venaient pas |

Un verdict TERMINÉ peut garder des réserves dans `reste` : un constat de relecture hors périmètre, un
écart à un critère accepté par le relecteur, ce qui n'a pas pu être vérifié, ou une question pour le
propriétaire. La boucle intègre et les affiche.

## Rétrospective

Après chaque ticket, intégré ou bloqué, une courte session Sonnet en lecture seule relit ce que la
boucle a observé (tentatives, modèles, coûts, refus, sous-agents, verdicts) et propose des
améliorations du harnais, chacune avec sa preuve. Elle coûte quelques dizaines de centimes ; son
échec est signalé et n'arrête jamais la boucle.

Les propositions s'accumulent dans `.harness-state/retours/observations.jsonl`, au statut `propose`.
Après un lot de tickets :

```sh
node scripts/loop/retro.mjs liste                     # propositions ouvertes ou différées, par cible puis impact
node scripts/loop/retro.mjs liste --tous              # avec celles déjà tranchées
node scripts/loop/retro.mjs decider R-T003-2 accepte "fait dans la skill ticket"
node scripts/loop/retro.mjs decider R-T003-4 ticket:T015
node scripts/loop/retro.mjs decider R-T004-1 refuse "voulu : garde-fou"
```

La rétrospective propose, elle ne modifie rien. Sans `--tune-every`, une proposition n'est appliquée
que par le propriétaire. Avec, l'harmonisation des consignes (plus bas) applique aux skills et aux
agents les problèmes qui reviennent, et les marque `harmonisation:<commit>` ; tout ce qui touche aux
contrôles reste au propriétaire. Une proposition qu'elle diffère passe à `differee:<ID>` : `liste` la montre
avec cette décision et sa note jusqu'à ce que le propriétaire la tranche.

Un échec qui ne se produit que sous charge se reproduit et s'explique avant d'être écarté : on ne
relance pas la boucle jusqu'à ce qu'elle passe.

`.harness-state/` est hors Git : c'est de l'état local. Le dossier d'un ticket se supprime sans risque
une fois le ticket intégré.

## Harmonisation des consignes

Avec `--tune-every N`, tous les N tickets intégrés depuis le lancement, après la rétrospective du
dernier, la boucle harmonise les consignes du harnais avant le ticket suivant. Par défaut (`0`), jamais.
`--dry-run` dit si elle est active, et tous les combien.

**Ce qui est retenu**, par le code et non par un modèle : parmi les observations en attente de type
`probleme` dont la cible est `skill` ou `agent`, les seules qu'une harmonisation peut corriger, les sujets
qui reviennent sur au moins deux tickets différents, ou dont une observation est d'impact `fort`. Les plus
fréquents d'abord (à égalité, le premier apparu dans le journal), trois sujets au plus ; un sujet retenu
apporte toutes ses observations de problème en attente qui visent une skill ou un agent. Un sujet qui mêle
plusieurs cibles n'apporte que celles-là, et ses tickets se comptent sur elles seules. Les autres cibles
(`hook`, `boucle`, `controle`, `ticket`, `autre`) restent au propriétaire, par `retro.mjs liste`. Deux
observations ne comptent pour le même sujet que s'il est écrit à l'identique, espaces de début et de fin mis à part : la
rétrospective reprend mot pour mot le sujet d'une proposition déjà ouverte. Sans rien à retenir, la boucle affiche « Rien à harmoniser » et
continue. Un journal des retours illisible (ligne tronquée, écrite à la main) fait sauter
l'harmonisation : la boucle l'affiche (« Harmonisation sautée ») et continue la file.

**La session** : `claude -p`, une seule tentative, sur le premier palier Opus de l'échelle (Opus 5.5,
effort high), relecteur Opus. `--budget-usd`, `--timeout-min`, `--permission-mode` et
`--compact-window` s'appliquent comme à un ticket ; `--model` et `--effort`, non. Elle a son propre
identifiant, `H001`, `H002`…, jamais réutilisé, et son dossier `.harness-state/tickets/<ID>/`, où la
boucle écrit `observations.json`. Elle suit la skill `harmonisation` : l'agent `harmoniseur` modifie les
consignes, un `relecteur` neuf relit le diff contre les observations et contre la règle « ne retire
aucune vérification », puis viennent `node scripts/check.mjs` et `verdict.json`.

**Ce qu'elle peut modifier** : `.claude/skills/` et `.claude/agents/`, hors ce que la portée y ferme
(ci-dessous) ; rien d'autre.

**Ce qu'elle ne peut pas modifier** : ses arbitres, c'est-à-dire `.claude/agents/relecteur.md`,
`.claude/agents/harmoniseur.md` et `.claude/skills/harmonisation/`, que la portée ferme bien qu'ils soient
dans ces dossiers ; les contrôles (`scripts/check.mjs`, `scripts/quality/` et le plancher du cliquet,
`scripts/loop/`, `.claude/hooks/`, `.claude/settings.json`) ; les tickets et leur gabarit, `CLAUDE.md`,
`docs/standards.md`. Le hook `guard-write` le refuse pendant la session, et la boucle le revérifie sur le
diff ; les deux lisent la même portée (`scripts/loop/harness-scopes.mjs`). Les modifier reste la décision
du propriétaire, par un ticket `harnais: oui`.

**Une observation différée** : une proposition qui viserait ces fichiers ou les contrôles, ou qui
retirerait une vérification, est différée par la session, avec sa raison. La boucle l'affiche et, si elle
intègre la session ou la termine sans changement, la marque `differee:<ID>` (l'identifiant de
l'harmonisation), avec cette raison en note. Une différée n'est plus retenue par les harmonisations
suivantes : elle attend le propriétaire, qui la voit dans `retro.mjs liste`, avec sa décision et sa note,
et la tranche avec `retro.mjs decider <id> accepte|refuse|ticket:T…`. Après un refus, aucune n'est
marquée.

**Après la session**, la boucle vérifie, dans cet ordre :

1. un verdict TERMINÉ ;
2. un diff (fichiers suivis modifiés, fichiers nouveaux) limité à `.claude/skills/` et `.claude/agents/`,
   hors fichiers fermés, avant de lancer quoi que ce soit : un contrôle modifié n'est jamais exécuté ;
3. une relecture enregistrée sur l'état final, et acceptée par le dernier relecteur ;
4. `node scripts/check.mjs` vert en entier.

Tout passe : un commit `Tune the harness: <resume du verdict>`, avec les identifiants des observations
traitées et la ligne `Co-Authored-By` du modèle. Ces observations passent à `harmonisation:<commit>`,
les différées à `differee:<ID>`, puis la boucle pousse ; un push refusé l'arrête (code 3), comme pour un
ticket. Si le marquage échoue (journal devenu illisible pendant la session), la boucle le dit, avec la
commande `retro.mjs decider` pour le faire à la main, et pousse quand même : le commit est fait. Un
verdict TERMINÉ sans aucun changement ne committe rien : les différées passent à `differee:<ID>`, les
autres observations restent en attente.

**Un refus** (verdict absent ou autre que TERMINÉ, diff hors des consignes, relecture absente, périmée
ou refusée, contrôle rouge) annule la session : la boucle désindexe, remet les fichiers suivis modifiés
dans leur état de `HEAD`, met de côté les fichiers nouveaux absents avant la session, puis vérifie qu'il
ne reste rien de la session et qu'aucune de ces commandes Git n'a échoué. **Mettre de côté**, c'est
déplacer chaque fichier, sous son chemin, dans `.harness-state/tickets/<ID>/mis-de-cote/`, hors Git : la
boucle ne sait pas qui l'a créé pendant la session (la session, le propriétaire, une autre session), et
ne supprime donc rien. Elle affiche la liste de ces fichiers et leur dossier, et l'événement du refus la
porte ; un fichier qui ne venait pas de la session se récupère à la main. Remise réussie : elle écrit la
raison dans `refus.txt`, l'affiche et continue la file ; les observations restent en attente, différées
comprises. Remise incomplète (par exemple un `.git/index.lock` resté en place, ou un fichier qui n'a pas
pu être déplacé) : elle s'arrête avec le code 4, sans lancer de ticket sur un arbre sale, et dit quels
fichiers restent et quoi examiner. Une harmonisation ne bloque donc jamais un ticket ; seuls une remise à
`HEAD` impossible (code 4) ou un push refusé (code 3) arrêtent la boucle.

**Reprise après un refus** : si l'harmonisation précédente, celle au numéro juste inférieur, a été
refusée, la consigne de la suivante nomme son `refus.txt` et, s'il existe, le dernier `relecture-<n>.md`
de son dossier ; la session les lit d'abord. Seule la précédente compte, pas tout l'historique. Après une
harmonisation intégrée, ou pour la première, la consigne n'en nomme aucun.

**Annuler une harmonisation intégrée** : `git revert <commit>` du commit `Tune the harness: …`. Ses
observations restent marquées de ce commit ; les trancher de nouveau avec `retro.mjs decider` (`refuse`
avec une note, ou `ticket:T…`).

## Débloquer un ticket

Le ticket est à `bloque`, la file est arrêtée, le travail en cours est laissé tel quel dans le dossier.
Lire d'abord la raison affichée et le dernier `echec-<n>.txt`, puis `git status` et `git diff`. Quatre
cas.

1. **Le ticket attend une décision.** La session a rendu BLOQUÉ sur une question au propriétaire.
   Écrire la décision au début de la section « Hypothèses bloquantes », à la place de la question,
   remettre `statut: a-faire`, committer, relancer.
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

### Trancher un ticket qui attend une décision

Un ticket dont la section « Hypothèses bloquantes » commence par
« Décision attendue du propriétaire : » n'est pas `bloque` : il reste `a-faire`, la boucle ne le lance
pas et continue sans lui. Pour le trancher, remplacer la question par la décision, au début de la
section, puis committer. Un accord écrit ailleurs, dans le journal par exemple, ne suffit pas : la
boucle ne lit que le début de la section, et le ticket resterait en attente.

Seul le début de la section compte. Une question posée ailleurs dans le ticket n'arrête pas la boucle :
la session peut rendre BLOQUÉ (cas 1 plus haut) ou trancher à la place du propriétaire. Relire alors
son commit comme une proposition.

## Écrire un ticket

Suivre la skill `decoupage` et partir de `docs/travail/tickets/_gabarit.md`. Un bon ticket tient dans
une session et un commit, livre seul quelque chose de vérifiable, et chacun de ses critères se vérifie
par un test ou une commande. Les champs `installe`, `harnais` et `supprime_tests` valent `non` par
défaut ; les passer à `oui` est une décision à relire. `niveau` vide laisse la boucle le déduire ;
`simple` n'est jamais déduit, il se déclare pour un ticket mécanique (renommage, texte, test isolé).

Ce que l'essai sur T001 a appris :

- Aucun critère ne porte sur l'état global du dossier (« `git status` ne montre que… ») : des fichiers
  non suivis étrangers au ticket le rendent impossible à tenir, et la boucle les écarte déjà du commit.
- Les retouches triviales d'un même fichier se regroupent dans un ticket : le coût fixe d'une session
  (explorer, relire, contrôle complet) domine pour un petit changement.
- La section « Hypothèses bloquantes » commence par l'une de deux phrases exactes :
  « Aucune décision n'est attendue. », ou
  « Décision attendue du propriétaire : » suivie de la question. La boucle ne lance pas un ticket qui
  attend une décision : elle continue avec les tickets prêts qui n'en dépendent pas et nomme ceux qui
  attendent. Le propriétaire tranche en remplaçant la question par sa décision, au début de la section ;
  un accord écrit ailleurs ne suffit pas.
- Le ticket cite les chemins et la version du code qu'il a lus. Si le code a bougé depuis, la session
  doit le dire et s'arrêter plutôt que deviner.

## Garde-fous

Dans une session de ticket, les hooks de `.claude/hooks/` refusent : commit, push, changement de
branche, session Claude ou Codex imbriquée, `gh`, installation de dépendance non autorisée, écriture
hors du projet, modification du harnais ou d'un autre ticket, création d'un fichier de test nommé
d'après un chantier. Un ticket `harnais: oui` lève le verrou du harnais et peut modifier le gabarit des
tickets, jamais un autre ticket. Une session d'harmonisation ne le lève que sur les consignes
(`TVLENS_HARNESS_SCOPE=consignes`) : `.claude/skills/` et `.claude/agents/`, sauf
`.claude/agents/relecteur.md`, `.claude/agents/harmoniseur.md` et `.claude/skills/harmonisation/` ; le
reste du harnais et le gabarit lui restent fermés, et une portée inconnue n'ouvre rien. Un sous-agent lancé en arrière-plan est
ramené au premier plan. Chaque fichier écrit est contrôlé aussitôt, et la session ne peut pas se terminer sans verdict ni se dire TERMINÉE sur
un contrôle rouge. La boucle n'intègre ensuite que le changement que le dernier relecteur a lu et
accepté : une modification faite après la relecture, journal du ticket mis à part, ou un dernier
verdict « à corriger », fait refuser le ticket.

Ce sont des garde-fous sur le texte des commandes, pas un bac à sable : ils rattrapent l'erreur, pas la
malveillance. La décision d'intégrer reste celle de la boucle.

En session interactive, modifier le harnais demande une confirmation. Pour l'ouvrir dix heures :

```sh
echo $(( $(date +%s) + 10*3600 )) > .harness-state/harnais-ouvert
```
