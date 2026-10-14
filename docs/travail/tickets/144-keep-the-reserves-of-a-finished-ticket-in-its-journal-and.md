---
id: T144
titre: Keep the reserves of a finished ticket in its journal and its commit
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Une session peut finir TERMINÉ en gardant des réserves : un critère rempli à la lettre près, un passage
non relu, une question pour le propriétaire. Aujourd'hui, ces réserves sont affichées une fois dans la
console de la boucle, puis restent dans `.harness-state/`, hors Git. Le propriétaire ne les voit pas s'il
n'a pas suivi la console, ni quand plusieurs tickets s'enchaînent. Après ce ticket, elles entrent dans
Git avec le ticket : dans son journal, en entier, et dans le message du commit, qui dit combien il y en
a. Elles entrent aussi dans le journal des événements. La boucle intègre toujours : une réserve ne
bloque pas un ticket.

## Sources

- Constat : ESSAI-05. Décision du propriétaire, le 14/10 : afficher les réserves plutôt que refuser un
  TERMINÉ qui en a. Refuser pousserait la session à les taire.
- Faits observés :
  - `.harness-state/tickets/T001/verdict.json` : TERMINÉ avec deux entrées dans `reste`, dont une
    décision attendue du propriétaire (fichiers non suivis étrangers au ticket) ;
  - `.harness-state/tickets/T003/verdict.json` : TERMINÉ avec cinq entrées dans `reste`, dont
    `INDEX.md:162-163` à corriger et un choix laissé au propriétaire sur le gabarit ;
  - ni le message des commits de T001 et T003 (`git log -1 --format=%B a5b9dd3`), ni l'événement
    `integre` de `.harness-state/loop/events.jsonl` ne portent ces réserves.
- Code concerné, à la version `e7b5c1d` :
  - `scripts/loop/run.mjs`, fonction `integrate` (lignes 314 à 338) :
    - le statut du ticket passe à `termine` (ligne 318), puis `git add` (ligne 320) ;
    - le message du commit est fait du titre, de la ligne `Ticket:` et du trailer (ligne 322) ;
    - l'événement `integre` (ligne 325) n'a pas les réserves ;
    - les lignes 327 et 328 affichent déjà les réserves à la console, après le commit
      (`Réserves de la session : …`). Aucun test ne le couvre.
  - `scripts/loop/run.mjs`, fonction `processTicket` (lignes 349 à 392) : elle n'appelle `integrate`
    qu'après les gates (`gates`, lignes 284 à 309). Les gates ne lisent pas le journal du ticket
    (`spec`, `scripts/loop/tickets.mjs:24`).
  - `.claude/skills/ticket/SKILL.md`, section « 8. Conclure » (lignes 70 à 87) : `reste` n'est décrit
    que pour PARTIEL.
  - `tests/ticket-loop.test.cjs` :
    - `FAKE_SESSION` (ligne 22) et son aide `verdict(statut, extra)` ;
    - test « a ticket whose session finishes green is committed under its title and marked finished »
      (ligne 291) ;
    - test du trailer (ligne 413), qui lit le message du commit avec `--format=%B`.

## Périmètre

- À modifier :
  - `scripts/loop/run.mjs` ;
  - `.claude/skills/ticket/SKILL.md`, section « 8. Conclure » seulement ;
  - `tests/ticket-loop.test.cjs` ;
  - `scripts/quality/baseline.json`, si le nombre de tests monte.
- `harnais: oui` parce que la boucle et la skill sont le harnais. Ce ticket ne retire ni n'assouplit
  aucun contrôle : il rend visible ce qu'une session déclare.
- Forme attendue :
  - avant le `git add`, la boucle ajoute à la fin du ticket un jalon « Réserves à la clôture », qui
    cite chaque entrée de `reste` telle que la session l'a écrite. Une entrée qui n'est pas une chaîne
    est écrite en JSON ;
  - le message du commit garde le titre en première ligne et le trailer en dernière. Entre les deux,
    une ligne en anglais donne le nombre de réserves et renvoie au journal du ticket, par exemple
    `Reserves: 2, listed in the ticket journal.`. Le texte des réserves reste en français dans le
    journal, pas dans le message ;
  - l'événement `integre` porte la liste des réserves ;
  - sans réserve (`reste` absent ou vide), ni jalon, ni ligne, ni champ.
- À ne pas toucher :
  - les gates et les verdicts PARTIEL et BLOQUÉ ;
  - la rétrospective (`scripts/loop/retro.mjs`) : elle lit déjà `verdict.json` en entier ;
  - les hooks, les agents et `scripts/check.mjs` ;
  - les autres tickets et le code du produit.
- Les tests existants de `tests/ticket-loop.test.cjs` gardent toutes leurs assertions.

## Critères d'acceptation

Les critères 1 à 3 se vérifient par des tests de `tests/ticket-loop.test.cjs`.

1. Une session TERMINÉ avec deux réserves, l'une en chaîne et l'autre en objet, est intégrée. Dans le
   commit du ticket :
   - le ticket finit par le jalon « Réserves à la clôture », qui cite les deux, l'objet en JSON ;
   - le message porte la ligne du nombre de réserves, avec le titre en première ligne et le trailer en
     dernière.
   L'événement `integre` porte les deux réserves.
2. Une session TERMINÉ sans `reste`, puis une avec `reste: []`, sont intégrées sans jalon de
   réserves, sans ligne de réserves dans le message et sans champ de réserves dans l'événement.
3. L'affichage console existant (`Réserves de la session : …`) reste, et un test le vérifie.
4. La skill `ticket` dit qu'un TERMINÉ met ses réserves dans `reste`, que la boucle les reporte dans le
   journal et le commit, et qu'une réserve ne remplace pas un PARTIEL ou un BLOQUÉ quand un critère
   n'est pas couvert. Vérification : `grep -n reste .claude/skills/ticket/SKILL.md`, sortie dans le
   journal.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Un nouveau test dans `tests/ticket-loop.test.cjs`, nommé d'après le comportement, par exemple « the
reserves of a finished session go into the ticket journal, the commit message and the integration
event ». Frontière : `scripts/loop/run.mjs` lancé comme un processus par `loopRepo`, avec un scénario du
faux `claude` qui finit vert et écrit `verdict("TERMINÉ", { reste: [...] })`, comme le test de la
ligne 291.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **Afficher, pas refuser.** C'est la décision du propriétaire.
- **Le texte des réserves va dans le journal, pas dans le message du commit.** Les messages de commit
  sont en anglais (`CLAUDE.md`) et les réserves sont écrites en français. Le message dit seulement
  combien il y en a, ce qui suffit pour les retrouver : `git log --grep "^Reserves:"`.

## Journal
