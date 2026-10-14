---
id: T002
titre: Refuse a ticket whose final change differs from the one its reviewer read
statut: termine
bloque_par: T001
adr: non
installe: non
harnais: oui
supprime_tests: non
---

## Ce que le ticket livre

Aujourd'hui, une session de ticket peut modifier le code après la relecture et se déclarer terminée : la
boucle intègre alors un changement que personne n'a relu. Après ce ticket, la boucle compare l'état
final du dépôt à l'état soumis au dernier relecteur et refuse l'intégration s'ils diffèrent, journal du
ticket mis à part.

## Sources

- Constats : ESSAI-02
- Fait observé pendant l'essai de la boucle sur T001, le 2026-10-14 : le relecteur accepte au tour 1, puis
  l'orchestrateur reformule lui-même un commentaire du test. Le journal du ticket le dit :
  `docs/travail/tickets/001-resent-block-duplicate-without-race.md`, jalon « Relecture (tour 1) » —
  « C'est la seule modification postérieure à la relecture ; elle ne touche aucune instruction et n'a pas
  été relue. » La boucle a intégré ce texte dans le commit `fb19ce6`.
- Code concerné, à la version `0d5a954` :
  - `scripts/loop/run.mjs`, fonction `gates(ticket, specBefore, untracked)` (ligne 183) : les contrôles
    faits après une session qui se dit terminée. Aucun ne regarde ce qui a été relu.
  - `scripts/loop/run.mjs`, fonction `processTicket` (ligne 234) : appelle `gates` et écrit
    `echec-<n>.txt` quand un contrôle refuse.
  - `.claude/skills/ticket/SKILL.md`, section « 4. Relire » (lignes 33 à 44) : l'orchestrateur écrit
    `revue-<n>.diff` et `revue-<n>.fichiers` dans `.harness-state/tickets/<ID>/` avant chaque relecture.
    La liste des fichiers ne garde que des noms : un fichier nouveau modifié après la relecture ne s'y
    voit pas.
  - `.claude/skills/ticket/SKILL.md`, section « 5. Corriger, puis relire de nouveau » (lignes 46 à 49).
  - `tests/ticket-loop.test.cjs` : la fausse session `FAKE_SESSION` (ligne 18) et ses scénarios ; `loopRepo`
    (ligne 84).
  - `docs/travail/README.md`, sections « Ce que fait la boucle pour un ticket » et « Garde-fous ».

## Périmètre

- À modifier : `scripts/loop/run.mjs` et, si la lecture y gagne, un nouveau module sous `scripts/loop/` ;
  `.claude/skills/ticket/SKILL.md` ; `docs/travail/README.md` ; `tests/ticket-loop.test.cjs` ;
  `scripts/quality/baseline.json` si le nombre de tests monte.
- `harnais: oui` parce que la boucle et la skill sont le harnais. Le contrôle ajouté est plus strict que
  l'existant : il ne retire ni n'assouplit aucun contrôle de `gates`.
- Forme attendue : une seule fonction calcule l'« état relu » — le diff des fichiers suivis par rapport
  à `HEAD` et le contenu des fichiers nouveaux, fichier du ticket exclu, fichiers non suivis présents
  avant la session exclus. La session l'enregistre par une commande avant chaque relecture ; la boucle
  la recalcule après la session et compare. La skill ne décrit plus deux commandes `git` à recopier mais
  cette commande unique.
- À ne pas toucher : les hooks de `.claude/hooks/`, `scripts/check.mjs`, les agents de `.claude/agents/`,
  le code du produit.
- Les tests existants de `tests/ticket-loop.test.cjs` gardent toutes leurs assertions. Les scénarios de
  la fausse session qui finissent par `TERMINÉ` enregistrent désormais une relecture, comme le fait une
  vraie session ; aucun test n'est retiré ni affaibli.

## Critères d'acceptation

Chaque critère se vérifie par un test de `tests/ticket-loop.test.cjs`, joué avec la fausse session.

1. Une session qui enregistre une relecture, modifie ensuite un fichier de code, puis se déclare
   `TERMINÉ` est refusée : le rapport d'échec nomme le fichier modifié depuis la relecture, la session
   est relancée, puis le ticket passe à `bloque` sans aucun commit.
2. Même refus quand le fichier modifié après la relecture est un fichier nouveau, non suivi par Git.
3. Une session qui se déclare `TERMINÉ` sans avoir enregistré aucune relecture est refusée, avec un
   message qui dit qu'aucune relecture n'est enregistrée.
4. Une session dont l'état final est celui de la dernière relecture enregistrée est intégrée, même si le
   journal du ticket a changé après cette relecture.
5. Un fichier non suivi présent avant la session n'entre pas dans la comparaison : le test « files that
   were already untracked before the loop are left out of the ticket commit » passe sans changer ses
   assertions.
6. La skill `ticket` donne la commande qui enregistre l'état relu et dit qu'après une relecture, toute
   modification autre que le journal du ticket demande une nouvelle relecture. `docs/travail/README.md`
   cite ce contrôle parmi ceux de la boucle. Vérification : `grep` sur les deux fichiers, sortie dans le
   journal.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Un nouveau test dans `tests/ticket-loop.test.cjs`, nommé d'après le comportement — par exemple « a
session that changes the code after its last review is refused, retried, then blocked without any
commit ». Frontière : `scripts/loop/run.mjs` lancé comme un processus par `loopRepo`, avec la fausse
session, comme les autres tests du fichier.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le drapeau `harnais: oui` a été posé au découpage et attend la relecture
du propriétaire avant le premier lancement. Si le contrôle ne peut pas distinguer le journal du ticket
du reste sans modifier un hook ou `scripts/check.mjs` : verdict BLOQUÉ, avec l'écart constaté.

## Journal

### Exploration

Rapport : `.harness-state/tickets/T002/exploration.md`. Aucun écart qui change le périmètre.
- Les lignes citées ont bougé (`gates` à `run.mjs:239`, `processTicket` à `:290`) ; la comparaison se place dans
  `gates`, juste avant `check.mjs`, dans un nouveau module de `scripts/loop/` copié aussi dans le dépôt de test.
- Aucun hook à modifier : `node scripts/loop/….mjs` passe `guard-bash`, `.harness-state/` est ignoré par Git.
- La skill écrit l'ADR après la relecture : elle sera réordonnée (ADR avant la relecture finale).
- Les non suivis d'avant la session ne sont connus que de la boucle : elle les écrira dans le dossier d'état
  pour que la fonction unique les exclue des deux côtés.
- Le plancher `cas_de_test` est resserré par la boucle elle-même ; la session n'y touche pas.

### Implémentation (tour 1)

- Nouveau module `scripts/loop/reviewed-state.mjs` : une seule fonction calcule l'état relu (empreinte par
  fichier, fichier du ticket et non suivis d'avant la session exclus). La commande
  `node scripts/loop/reviewed-state.mjs record` écrit `revue-<n>.diff`, `revue-<n>.fichiers` et
  `reviewed-state.json`.
- `run.mjs` écrit `untracked-before.json` au début du ticket ; `gates` compare juste avant `check.mjs`.
- La fausse session enregistre une relecture dans tous les scénarios TERMINÉ ; 6 tests ajoutés.
- `node --test tests/ticket-loop.test.cjs` : 26/26. Rouge vu avant d'ajouter le contrôle : 3 échecs.
- `node scripts/check.mjs --changed` : vert. `node scripts/check.mjs` dans cette session : rouge, 2 échecs
  dans `tests/agent-guards.test.cjs`, fichier non modifié. Reproduit : `node --test tests/agent-guards.test.cjs`
  donne 14/16 avec `TVLENS_HARNESS=1` hérité de la session, et 16/16 avec `env -u TVLENS_HARNESS`. Défaut
  d'isolation du test, antérieur au ticket et hors de son périmètre.

### Relecture (tour 1)

État relu enregistré avec `node scripts/loop/reviewed-state.mjs record --ticket T002`, après avoir écrit
`untracked-before.json` à la main avec les 9 fichiers non suivis d'avant la session (`experiments/`,
`design/continuous-context/`) : la boucle déjà chargée ne l'écrit pas pour ce ticket. Verdict : à corriger.
- Bloquant : aucun test ne protège l'exclusion des non suivis d'avant la session (remplacer la liste par `[]`
  laisse tout vert).
- Mineurs retenus : les chemins non ASCII sont lus différemment des deux côtés ; un fichier d'état
  illisible fait planter la boucle au lieu de la faire refuser ; un test lit le format interne de
  `reviewed-state.json`.
- Signalé au propriétaire, non corrigé : la boucle vérifie qu'une relecture est enregistrée, pas qu'elle a été
  acceptée.

### Correction (tour 2)

- Nouveau test par la boucle : un fichier non suivi avant la boucle et modifié après la relecture reste hors de
  la relecture et du commit, joué avec `notes/personal.md` et `notes/café.md`. Rouge vu avec la liste
  remplacée par `[]` : 2 échecs.
- La liste des non suivis d'avant la session est lue avec le même lecteur `git status -z` que l'état relu.
  Rouge vu avant ce changement : le cas `café.md` était refusé.
- Un `reviewed-state.json` ou un `untracked-before.json` illisible donne un refus avec rapport (`echec-<n>.txt`,
  puis `bloque`), et non plus un plantage. Rouge vu avant : code 1, sans rapport.
- Le test de la commande ne lit plus le format interne de `reviewed-state.json`.
- `node --test tests/ticket-loop.test.cjs` : 31/31.

### Relecture (tour 2)

`node scripts/loop/reviewed-state.mjs record --ticket T002` → `revue-2.diff`. Verdict : accepté. Mineurs
non corrigés, laissés au propriétaire :
- La boucle relit sur disque `untracked-before.json`, que la session pourrait réécrire, alors qu'elle garde la
  liste en mémoire. Une session qui falsifierait ce fichier y glisserait un fichier non relu. Cela reste
  dans la limite des garde-fous, qui rattrapent l'erreur et non la malveillance, comme un `record` relancé
  sans relecteur.
- `run.mjs` garde une deuxième lecture de `git status`, sans `-z`, pour `gates` et `integrate`.
- La boucle vérifie qu'une relecture est enregistrée, pas qu'elle a été acceptée.

### Contrôle final

Aucune modification hors de ce journal depuis `revue-2` : `unreviewedChange` sur l'arbre de travail répond
« identique ».
- `node scripts/check.mjs --changed` : vert, 31/31, `cas_de_test` 617 → 627.
- `node scripts/check.mjs` dans la session (`TVLENS_HARNESS=1` hérité) : ROUGE, 656/658. Les 2 échecs sont dans
  `tests/agent-guards.test.cjs`, fichier non modifié, comme au tour 1.
- `env -u TVLENS_HARNESS node scripts/check.mjs`, environnement de `gates` dans la boucle : vert, JS 658/658,
  Python 84 OK (1 sauté). Format et lint non lancés : outils non installés.

Critère 6, sortie de `grep` :

```
$ grep -n "reviewed-state.mjs record\|toute modification autre que le journal" .claude/skills/ticket/SKILL.md
44:node scripts/loop/reviewed-state.mjs record      # hors boucle : ajouter --ticket <ID>
52:Après une relecture, toute modification autre que le journal du ticket demande une nouvelle relecture,
$ grep -n -i "relecture" docs/travail/README.md
82:   - une relecture est enregistrée, et l'état final du dépôt est celui que le dernier relecteur a lu,
107:de test ont été supprimés », « Le ticket demande un ADR et aucun n'a été ajouté », « Aucune relecture
108:n'est enregistrée », « Aucune relecture lisible n'est enregistrée » (`reviewed-state.json` abîmé),
110:la boucle, abîmé), « Le changement a été modifié depuis la dernière relecture » suivi des fichiers
123:| `.harness-state/tickets/<ID>/revue-<n>.diff`, `revue-<n>.fichiers` | chaque relecture : le diff relu, fichiers nouveaux en entier, et la liste des fichiers |
124:| `.harness-state/tickets/<ID>/reviewed-state.json` | l'état de la dernière relecture, que la boucle compare à l'état final |
191:relecture, journal du ticket mis à part, fait refuser le ticket.
```
