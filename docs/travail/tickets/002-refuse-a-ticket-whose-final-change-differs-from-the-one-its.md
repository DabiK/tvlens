---
id: T002
titre: Refuse a ticket whose final change differs from the one its reviewer read
statut: a-faire
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
