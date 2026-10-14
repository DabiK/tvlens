---
id: T018
titre: Extract the reception rules of the Mac window as pure tested functions
statut: termine
bloque_par: T015
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Deux règles de réception de la fenêtre Mac ne sont prouvées que par leur texte : quelle référence de
lecture prendre quand un état de surveillance arrive, et quoi garder du résumé précédent quand un nouvel
état de résumé arrive. Un test va jusqu'à découper `receiveRecap` dans `app/renderer.js` par expression
régulière pour l'exécuter. Après ce ticket, ces deux règles sont des fonctions pures que les tests
importent ; la fenêtre les appelle et son comportement ne change pas.

## Sources

- Constats : TSTC-02
- Code concerné, à la version `0d5a954` :
  - `app/renderer.js`, `sequences` (l.596) et `receiveSurveillance` (l.600-610), ligne 605 :
    `if (seenFor !== state.sessionId) { const restoring = isRestoring(state); seen = sequences(restoring
    ? null : state); if (!restoring) seenFor = state.sessionId; }`. Tant que la session est en cours de
    restauration, la référence est à zéro et sera reprise au prochain état ; sinon elle vaut les numéros
    de l'état reçu et la session est retenue.
  - `app/renderer.js`, `receiveRecap` (l.802-812) : un état d'une autre session que la session courante
    est ignoré sans rien toucher ; sinon `recapRevision++`, puis l'aperçu et les chapitres du résumé
    précédent sont gardés quand l'état reçu est de la même session, de statut `updating` ou `error`, et
    n'en porte pas ; un état vide donne `null` ; puis `renderRecap()`.
  - `app/ui/surveillance-view.mjs` : `isRestoring` (l.54), `describeSurveillance` (l.119, option
    `seen`) ; `seen` n'y sert qu'au compteur de non-lus (l.194), rendu dans `badge.count`.
  - `tests/mac-ui.test.cjs`, test « a saved history still being read is told as a restoration, and a
    history kept in memory only gets a discreet notice: both in the words of the state » (l.275) :
    assertion sur le texte de la ligne 605 (l.339).
  - `tests/architecture-f09.test.cjs`, aide `reception` (l.236-240) : extrait `receiveRecap` par
    `.match(/\nfunction receiveRecap\(state\) \{\n[\s\S]*?\n\}\n/)` et l'évalue par
    `vm.runInNewContext` ; utilisée deux fois par le test « the Mémoire view says a ceiling as a
    ceiling, with or without an earlier recap, and goes on showing that recap » (l.242, appels l.251 et
    l.262). L'ADR 0009 note que ce test dépend de la forme de `receiveRecap`.
  - Jumeau côté TV : `badgeReference` de `tv/app/companion.js`, testé dans `tests/tv-panel.test.cjs` par
    « a restored history is not news: the reference of the header count waits for a ready registry »
    (l.299) : sept résultats restaurés ne sont pas annoncés, le huitième l'est. Côté Mac, aucun test
    n'exécute ce scénario.
- Le relecteur de l'audit nomme le risque de l'extraction : une référence prise au mauvais moment
  annonce comme nouveaux les résultats d'un historique relu ; le scénario ci-dessus le détecte.

## Périmètre

- À modifier : `app/ui/surveillance-view.mjs` — y ajouter et exporter `nextSeen({ seen, seenFor }, state)`,
  qui rend `{ seen, seenFor }` selon la règle de la ligne 605, et y déplacer `sequences`.
- À créer : `app/ui/recap-state.mjs`, qui exporte `reduceRecap(previous, incoming, sessionId)` : rend
  `undefined` quand l'état appartient à une autre session (la fenêtre ne touche alors à rien), sinon le
  nouvel état, `null` compris.
- À modifier : `app/renderer.js` — `receiveSurveillance` et `drawSurveillance` appellent les fonctions
  de `surveillance-view.mjs` ; `receiveRecap` appelle `reduceRecap` et garde, pour un état accepté,
  `recapRevision++` puis `renderRecap()`.
- À modifier : `tests/mac-ui.test.cjs` — l'assertion de la l.339 devient des tests de `nextSeen`, plus
  un garde de branchement indifférent à la mise en page : `receiveSurveillance` prend sa référence par
  `nextSeen(` et `receiveRecap` passe par `reduceRecap(`. `tests/architecture-f09.test.cjs` —
  `reception` importe `reduceRecap` et n'utilise plus `vm` ni le texte de `app/renderer.js`.
- La faute injectée pour la preuve du critère 5 est défaite à la main avant la fin de la session.
- Restent tels que le premier ticket du lot les a laissés, en gardes de branchement : `banner: true`
  passé par `surveillanceView` (l.335), le dessin de la bannière (l.336-337), l'unique
  `cardQueue.offer(` nourri par `surveillanceView().cards` (l.705-706), la ligne de `memory-status`
  (l.710). Leur preuve par le rendu demande un faux DOM, qui relève du lot L05.
- À ne pas toucher : `app/ui/card-queue.mjs`, `app/ui/recap-view.js`, `tv/`, les autres tests.
- Aucun fichier modifié ne gagne de ligne de plus de 160 caractères ; le nouveau module n'en a aucune.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/mac-ui.test.cjs` passe. Des tests de `nextSeen`, importée depuis
   `app/ui/surveillance-view.mjs`, prouvent : un état d'une session nouvelle et prête donne pour
   référence les numéros `overlay.seq` et `signals.seq` de cet état et retient la session ; un état en
   cours de restauration donne une référence à zéro et ne retient pas la session, si bien que l'état
   suivant, prêt, reprend la référence ; un état de la session déjà retenue ne change rien.
2. Un test enchaîne `nextSeen` puis `describeSurveillance(état, { seen })` sur la suite d'états d'une
   session dont l'historique enregistré tient sept résultats — en restauration (numéros à zéro), encore
   en restauration, prête avec 7, prête avec 7, prête avec 8 — et exige pour `badge.count` la suite
   `[0, 0, 0, 0, 1]` : sept résultats restaurés ne sont pas annoncés, le huitième l'est.
3. `node --test tests/architecture-f09.test.cjs` passe, et `grep -c "receiveRecap\|runInNewContext"
   tests/architecture-f09.test.cjs` rend 0.
4. Des tests de `reduceRecap` (dans `tests/architecture-f09.test.cjs`, à côté du test qui s'en sert)
   prouvent : état d'une autre session ignoré (`undefined`) ; état `updating` ou `error` de la même
   session sans aperçu ni chapitres : ceux du précédent sont gardés ; état `ready` de la même session
   sans chapitres : liste vide ; état d'une autre session que le précédent : rien n'est repris ; état
   vide : `null`.
5. La fenêtre appelle les deux fonctions et ne garde pas de copie de leur règle : le garde de
   branchement du périmètre passe ; `grep -c "seenFor !== state.sessionId" app/renderer.js` et
   `grep -c "keepPrevious" app/renderer.js` rendent 0. Faute injectée puis défaite, sortie au journal :
   remplacer dans `receiveSurveillance` l'appel de `nextSeen` par `seen = sequences(state)` fait échouer
   le garde.
6. `grep -c "^\s*test(" tests/mac-ui.test.cjs` et `grep -c "^\s*test(" tests/architecture-f09.test.cjs`
   ne baissent pas.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`nextSeen` dans `tests/mac-ui.test.cjs`, `reduceRecap` dans `tests/architecture-f09.test.cjs`.
Frontière : les deux fonctions importées depuis `app/ui/`, appelées avec des états écrits par le test ;
aucun DOM. `app/renderer.js` n'est lu que pour le garde de branchement, pas pour prouver les règles.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si l'une des deux règles ne peut être extraite sans changer ce que la
fenêtre affiche ou l'ordre `recapRevision++` puis `renderRecap()` : verdict BLOQUÉ, avec l'écart
constaté.

## Journal

- Exploration faite (rapport dans .harness-state/tickets/T018/exploration.md) : aucun écart de périmètre,
  numéros de ligne du ticket décalés (renderer +10, mac-ui +6) ; plan en 6 incréments.
- Implémentation : `nextSeen` et `sequences` dans `app/ui/surveillance-view.mjs`, `reduceRecap` dans
  `app/ui/recap-state.mjs`, branchement de `receiveSurveillance` et `receiveRecap`, tests dans
  `tests/mac-ui.test.cjs` (23 tests, 21 avant) et `tests/architecture-f09.test.cjs` (10 tests, 9 avant).
  `node --test tests/mac-ui.test.cjs tests/architecture-f09.test.cjs` : 33 passent.
- Critère 5, faute injectée (`seen = sequences(state)` dans `receiveSurveillance`) : `node --test
  tests/mac-ui.test.cjs` donne pass 22 / fail 1, « the reference of the tab badge comes from nextSeen » ;
  faute défaite par restauration du renderer sain, 23 tests verts.
- `grep -c` : `receiveRecap\|runInNewContext` dans f09 = 0, `seenFor !== state.sessionId` et `keepPrevious`
  dans renderer.js = 0.
- Relecture 1 : « à corriger », 1 mineur (commentaire du garde de `mac-ui.test.cjs` disant « proved above »
  alors que la preuve est plus bas), 2 hors périmètre. Corrigé (« proved below »).
- Relecture 2 : « accepté », 0 bloquant, 0 mineur, 2 hors périmètre (ADR 0009 « Limites » et fiche
  interface-mac décrivent l'ancienne forme de `receiveRecap` ; libellé périmé d'un exemple de
  `tests/source-shape.test.cjs`).

### Réserves à la clôture

- Hors périmètre : docs/adr/0009 (« Limites »), docs/interface.md l.57 et docs/travail/fiches/interface-mac.md décrivent encore l'ancienne forme de receiveRecap / la liste des modules app/ui/
- Hors périmètre : le libellé d'un exemple de tests/source-shape.test.cjs recopie l'ancienne ligne de receiveSurveillance (test toujours juste, libellé périmé)
- Non vérifié : le comportement de la fenêtre Electron réelle n'a pas été exécuté ; il n'est couvert que par les tests purs et les gardes de branchement
