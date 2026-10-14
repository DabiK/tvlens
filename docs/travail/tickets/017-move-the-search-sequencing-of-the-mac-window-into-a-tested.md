---
id: T017
titre: Move the search sequencing of the Mac window into a tested controller
statut: a-faire
bloque_par: T015
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

L'ordre des opérations d'une recherche de passage (numéro de la demande, réponse tardive ignorée,
réponse d'une autre session effacée, refus tardif tu) n'est prouvé aujourd'hui que par des fragments du
texte de `app/renderer.js`. Après ce ticket, cet ordre vit dans un module sans DOM que les tests
exécutent avec des promesses qu'ils résolvent eux-mêmes, et la fenêtre ne garde que le branchement et
ses phrases. Le comportement de la fenêtre ne change pas.

## Sources

- Constats : TSTC-01
- Code concerné, à la version `0d5a954` :
  - `app/renderer.js`, `searchRevision`, `searchIntro`, `clearSearch` et le gestionnaire
    `$('moment-search-form').onsubmit` (l.572-575) : la demande prend `++searchRevision`, affiche
    « Recherche dans la session… », attend `bridge.searchMoments`, abandonne si le numéro a changé, passe
    par `searchCards(found, currentState)`, efface si `searchCards` rend `null`, sinon dessine les cartes
    et la phrase de résultat ; un refus n'est affiché que si le numéro est encore le sien.
  - `app/renderer.js`, `receiveState` (l.188) et `clearSession` (l.543) appellent `clearSearch()` ;
    `momentCard` (l.557-562) et `replay` (l.164-177, appel de `replayTarget` l.167) rejouent une carte.
  - `app/ui/search-view.mjs` : `searchCards` et `replayTarget`, fonctions pures déjà testées ; modèle de
    forme pour le nouveau module (ADR 0001, décision 4).
  - `tests/mac-ui.test.cjs`, test « search cards name the session they were searched in: a late answer is
    not drawn in another session, and an old card replays nothing there » (l.615) : sept assertions sur
    le texte (l.645-656) et une absence (l.657).
- Le relecteur de l'audit demande de garder la preuve que `receiveState` et `clearSession` effacent la
  recherche (l.646-647) : c'est la seule que `npm test` en donne. Risque nommé : oublier de brancher
  l'effacement dans la fenêtre.

## Périmètre

- À créer : `app/ui/search-controller.mjs`, qui exporte `createSearchController`. Il reçoit ses
  dépendances (la recherche, la session courante, ce qu'il faut faire quand une demande part, aboutit,
  est effacée, échoue) et rend `{ submit(query), clear() }`. Il importe `searchCards` de
  `./search-view.mjs`, ne touche ni au document ni au pont, et n'écrit aucune phrase.
- À modifier : `app/renderer.js` (l.572-575 et les appels de `clearSearch`), `tests/mac-ui.test.cjs`.
- Les phrases restent dans `app/renderer.js`, à l'identique : « Recherche dans la session… », la phrase
  de résultat avec `plural`, `found.mode` et `agreeText(found.warnings.join(' '))`, le texte
  d'introduction repris de la page, et `reason(e)` pour un refus.
- Tests : les assertions de texte sur le corps de `clearSearch` (l.645) et sur l'ordre des fragments du
  gestionnaire (l.648-654) sont remplacées par des tests de comportement du contrôleur. Restent, en
  gardes de branchement indifférents à la mise en page : `receiveState` efface la recherche au
  changement de session (l.646) et `clearSession` l'efface (l.647), adaptés au nom de l'appel ; la carte
  se remet à `replay` (l.655) ; `replay` interroge `replayTarget` (l.656) ; l'absence d'adresse média
  construite hors de `replayTarget` (l.657).
- À ne pas toucher : `app/ui/search-view.mjs`, `momentCard`, `replay`, le reste de la fenêtre ; aucun
  autre test.
- La faute injectée pour la preuve du critère 3 est défaite avant la fin de la session
  (`git checkout -- <chemin>` ne convient pas ici, le fichier portant le travail du ticket : la ligne
  retirée est remise à la main et le test relancé).
- `app/renderer.js` ne gagne aucune ligne de plus de 160 caractères ; la ligne de 615 caractères du
  gestionnaire (l.575) disparaît. Le nouveau module n'en a aucune.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/mac-ui.test.cjs` passe. Des tests du contrôleur, avec des promesses différées
   tenues par le test, prouvent :
   - une demande signale d'abord qu'elle est partie, puis son résultat passe par `searchCards` avec la
     session courante avant d'être dessiné ;
   - deux demandes dont la première répond en dernier : seule la seconde est dessinée, la première ne
     dessine rien et n'écrit rien ;
   - une réponse cherchée dans une autre session que la session courante efface les résultats et ne
     dessine rien ;
   - `clear()` pendant une demande en cours : la réponse tardive ne dessine rien ;
   - un refus de la demande en cours est signalé une fois ; un refus qui arrive après `clear()` ou après
     une demande plus récente n'est pas signalé.
2. Aucun de ces tests ne lit le texte de `app/renderer.js` ni n'utilise `vm` : ils importent
   `app/ui/search-controller.mjs`.
3. Les gardes de branchement listés au périmètre sont présents et passent ; une faute injectée puis
   défaite (retirer l'effacement de la recherche dans `clearSession`) fait échouer le test, sortie au
   journal.
4. `grep -c "searchRevision" app/renderer.js` rend 0 : le numéro de demande n'existe plus que dans le
   contrôleur.
5. `grep -c "^\s*test(" tests/mac-ui.test.cjs` ne baisse pas.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Dans `tests/mac-ui.test.cjs`. Frontière : `createSearchController` importé depuis
`app/ui/search-controller.mjs`, avec une recherche et des observateurs fournis par le test ; aucun DOM.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si l'extraction oblige à changer un texte affiché, l'ordre visible des
états de la recherche, ou `app/ui/search-view.mjs` : verdict BLOQUÉ, avec l'écart constaté.

## Journal
