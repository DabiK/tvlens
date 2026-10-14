---
id: T128
titre: Derive the Mac window controls from a tested pure model
statut: a-faire
bloque_par: T028, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`updateButtons` décide, en une suite d'expressions et en relisant le DOM (`$('source').value`), quelles
commandes de la fenêtre Mac sont désactivées et quel libellé elles portent. Aucun test ne le vérifie : seul
le smoke Electron, hors de la boucle, clique. Après ce ticket, ce calcul est une fonction pure
`describeControls(input)` de `app/ui/controls-view.mjs`, fixée par une table de cas, et `updateButtons` ne
fait plus que rassembler l'entrée, appeler le modèle, appliquer le résultat et choisir les phrases. Aucun
état de commande ni aucune phrase ne change.

## Sources

- Constats : UI-05
- Fiche : `docs/travail/fiches/interface-mac.md`, étape 2 (l'étape 5 reprend le reste du constat :
  `startPreview`, enveloppe d'occupation, `float-launch`).
- Code concerné, à la version `0d5a954` :
  - `app/renderer.js`, `updateButtons` (l.65-85) : `float-status` (l.68), `new-session` (l.69),
    `float-record` désactivé, classe `recording` et titre (l.70-72), `observe` désactivé et libellé
    (l.73-74, lecture de `$('source').value` l.73), `archive-resume` (l.75), `archive-new` copié de
    `new-session` (l.76), `canAsk` (l.77), les quatre commandes rapides (l.78), les trois commandes de
    moment (l.79), `keep-moment` et `float-keep` (l.80), `question` (l.81), `verify` (l.82), `send` (l.83),
    `ask-status` (l.84). L'appel `shell.observation(currentState, Boolean(recorder))` (l.67) reste tel quel.
  - Entrées lues : `currentState` (`readOnly`, `id`, `analyzing`, `segments`, `history`, `asking`),
    `recorder`, `stream`, `stopping`, `floatingCaptureBusy`, `quickBusy`, `configuration`
    (`canObserve`, `verificationAvailable`), `verificationState.busy`, `pendingQuestion` (l.20-29).
  - `updateButtons` est appelée 34 fois dans `app/renderer.js` ; ces appels ne changent pas.
  - `tests/mac-ui.test.cjs`, garde des identifiants (test l.664, lecture l.678) : elle ne voit que les
    `$('…')` littéraux. Un identifiant rendu par le modèle n'est donc pas vérifié par elle.
- Modèle de forme : `app/ui/sessions-view.mjs` (`describeSessions`, `describeArchive`) et ses tests.

## Périmètre

- À créer : `app/ui/controls-view.mjs`, sans DOM ni phrase. `describeControls(input)` reçoit un objet
  explicite (la session courante, enregistrement en cours, prévisualisation ouverte, arrêt en cours, les
  deux occupations, la configuration, vérification occupée, question en attente, source choisie) et rend :
  - `disabled` : un objet `{ identifiant: booléen }` pour chaque commande que `updateButtons` désactive
    aujourd'hui (dix-sept identifiants, `question` compris) ;
  - `recording` : la classe de `float-record` ;
  - des modes nommés pour chaque texte choisi aujourd'hui par une condition (`float-status`, titre de
    `float-record`, libellé d'`observe`, `ask-status`), par exemple `'live' | 'archive' | 'paused' |
    'ready'`.
- À modifier : `app/renderer.js` (`updateButtons` seulement) et le fichier de tests des modules `app/ui/`
  (aujourd'hui `tests/mac-ui.test.cjs`).
- Les phrases restent dans `app/renderer.js`, à l'identique, dans des tables indexées par mode.
- Les quatre textes sont choisis aujourd'hui par des ternaires imbriqués (l.68, 72, 74, 84) : le module
  calcule ses modes sans ternaire imbriqué (`docs/standards.md`, règle « Pas de ternaires imbriqués »,
  qu'ESLint fera respecter avec `jalon:lint`), dans le même ordre de priorité que l'expression d'origine.
- Hors périmètre : `float-launch` et `float-refresh` (écrits dans `refreshFloatingSources`,
  `captureFromFloatingBar` et `float-source-form`), les poses de `floatingCaptureBusy` et `quickBusy`,
  `startPreview` : étape 5 de la fiche. `shell.js` n'est pas touché.
- La faute injectée pour le critère 4 est défaite à la main avant la fin de la session et le test relancé.
- Aucune ligne de plus de 160 caractères dans le nouveau module ; `app/renderer.js` n'en gagne aucune.

## Critères d'acceptation

1. Avant de brancher la fenêtre, une table de cas est tirée ligne à ligne des expressions de
   `updateButtons` et passe contre le module. Elle couvre au moins : aucune session ; session ouverte sans
   passage ; session en direct (enregistrement en cours) ; archive en lecture seule avec et sans
   historique ; arrêt en cours ; analyse en cours avec prévisualisation ouverte ; occupation de la barre
   flottante ; occupation rapide ; configuration absente, sans observation possible, sans vérification ;
   vérification occupée ; question en attente ; réponse en cours (`asking`) ; aucune source choisie ;
   aucun passage disponible à conserver.
2. Chaque cas vérifie l'objet `disabled` entier, `recording` et les quatre modes, pas un champ isolé.
3. Un test prouve que chaque identifiant de `disabled` existe dans `app/index.html`.
4. Une garde de branchement, indifférente à la mise en page, lit le corps de `updateButtons` et prouve
   qu'il appelle `describeControls`, que toute affectation `.disabled` y prend sa valeur dans le résultat
   du modèle, et que `$('source').value` n'y est plus lu qu'une fois, pour construire l'entrée. Une faute
   injectée puis défaite (une affectation `.disabled` rétablie à partir d'une expression d'état, par
   exemple `$('send').disabled = !canAsk`) la fait échouer, sortie au journal.
5. Les gardes statiques existantes de `tests/mac-ui.test.cjs` passent avec le nouveau module dans
   `rendererFiles`.
6. Le nombre de tests du fichier modifié ne baisse pas (`grep -c "^\s*test("` avant et après, au journal).
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Dans le fichier de tests des modules `app/ui/` (aujourd'hui `tests/mac-ui.test.cjs`). Frontière :
`describeControls` importé depuis `app/ui/controls-view.mjs` avec des entrées construites par le test ;
aucun DOM, aucun pont.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si la table de cas montre qu'une expression d'aujourd'hui se comporte
autrement que sa lecture (par exemple `currentState` sans `segments`), le test fixe le comportement
observé et l'écart est noté au journal. Si l'extraction oblige à changer un état de commande, une phrase,
ou `shell.js` : verdict BLOQUÉ, avec l'écart constaté.

## Journal
