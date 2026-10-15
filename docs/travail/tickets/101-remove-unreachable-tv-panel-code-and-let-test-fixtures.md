---
id: T101
titre: Remove unreachable TV panel code and let test fixtures escape the webm ignore
statut: termine
bloque_par: T163
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: simple
---

## Ce que le ticket livre

L’app de la TV contient une branche inaccessible et cinq alias globaux sans lecteur.

- Dans la vue chronologique, une branche gère le dialogue de fin de session. Elle ne peut pas être atteinte,
  parce que l'écouteur du panneau donne d'abord la touche au gestionnaire commun des dialogues, qui la garde
  pour lui.
- `surveillance-overlay.js` crée cinq variables globales que plus aucune page ne lit.

Le dépôt a aussi deux pièges discrets.

- La règle `*.webm` de `.gitignore` masque toute nouvelle fixture `.webm` déposée dans `tests/fixtures/`.
  Trois fixtures `.webm` sont déjà suivies ; cela ne prouve pas comment elles ont été ajoutées.
- Deux interfaces ne disent pas pourquoi elles existent : la liste `KEPT` du contrat IPC du Mac, dont le
  commentaire parle d'une « mission » passée, et le crochet d'observation `window.tvlensPanel`, que le smoke
  lit sans dire ce qu'il est.

Après ce ticket, le code mort est retiré, une fixture `.webm` nouvelle n'est plus ignorée, et les deux
commentaires décrivent le comportement et non l'historique.

## Sources

- Constats TV-07 et TSTC-20. Décision du propriétaire, le 15/10 : après T150 et en conservant
  les tests de navigation désormais présents.
- Code vérifié à la version `e92c6a6` :
  - `tv/app/companion.js:445`, `dialogKeys`, rend `true` pour toute touche dès qu’un dialogue est
    ouvert ; `tv/app/companion.js:470` l’appelle avant `timeline.handleKey` à la ligne 473 ;
  - `tv/app/timeline-view.js:390` : la branche `end-session-dialog` va jusqu’à la ligne 402.
    Le seul appelant de cette méthode de `TimelineView` est l’écouteur du companion. L’ouverture et
    la fermeture effectives du dialogue à `tv/app/timeline-view.js:51`, `tv/app/timeline-view.js:55`
    et `tv/app/timeline-view.js:64` restent nécessaires ;
  - `tests/tv-remote-navigation.test.cjs:173` et les scénarios suivants conduisent le dialogue par
    la page réelle avec DOM simulé : flèches, confirmation et Retour. Ils restent inchangés ;
  - `tv/app/surveillance-overlay.js:494`, commentaire puis cinq alias globaux jusqu’à la ligne 499 ;
    l’export CommonJS suit à la ligne 500. Les lecteurs utilisent l’objet `TVLensOverlay`, notamment
    `tv/app/ambient.js:38` et `tv/app/surveillance-view.js:580`, ou l’export dans
    `scripts/package-tv-ambient.mjs:167`. Aucun lecteur des cinq alias seuls n’a été trouvé ;
  - `.gitignore:15`, `*.webm` ; les trois fixtures suivies sont
    `tests/fixtures/chromium-webm-head.webm`, `tests/fixtures/chromium-webm-no-frame.webm` et
    `tests/fixtures/ffmpeg-webm-head.webm` ; leur mode d’ajout initial n’est pas établi ;
  - `tests/mac-ipc-contract.test.cjs:39`, commentaire « before the mission » au-dessus de `KEPT` ;
  - `scripts/smoke-tv-overlay.mjs:241` lit `window.tvlensPanel` sans commentaire local. Le companion
    documente ce crochet d’observation au voisinage de son affectation ; d’autres smokes le lisent aussi.
- ADR 0011 : le module classique expose `TVLensOverlay` sur la page et par CommonJS ; ces deux accès
  restent disponibles après retrait des alias.

## Périmètre

À modifier :

- `tv/app/timeline-view.js`, dans `TimelineView.prototype.handleKey` : supprimer la branche
  `if (el("end-session-dialog").open) {…}` (lignes 390-402 à la version citée). La variable `active`
  déclarée juste avant reste : la suite de la fonction la lit.
- `tv/app/surveillance-overlay.js` : supprimer le commentaire « The names the pages use… » et la
  déclaration `var OverlayQueue = …, renderCard` qui le suit (lignes 494-499 à la version citée).
  `module.exports` reste.
- `.gitignore` : ajouter `!tests/fixtures/*.webm` juste après `*.webm`.
- `tests/mac-ipc-contract.test.cjs`, le commentaire au-dessus de `KEPT` : il dit ce qu'est `KEPT`, à savoir
  les canaux que le pont doit continuer d'offrir et qui font la référence du contrat. La liste ne change pas.
- `scripts/smoke-tv-overlay.mjs`, au premier `tools.until(() => window.tvlensPanel …)` : un commentaire qui
  dit que `window.tvlensPanel` est l'interface d'observation du panneau, documentée dans
  `tv/app/companion.js` juste au-dessus de son affectation. Le code ne change pas.

À ne pas toucher :

- `tv/app/companion.js`, `dialogKeys` et les appels `showModal()`/`close()` du dialogue dans la vue.
- Les assertions et la liste de fichiers des tests existants, dont `tests/tv-panel.test.cjs`.
- `tests/tv-remote-navigation.test.cjs` et son banc `tests/helpers/tv-page.cjs` : ils prouvent que le
  dialogue reste piloté après la suppression de la branche inaccessible.
- Les fixtures `.webm` elles-mêmes.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `rg -n 'end-session-dialog.*\.open' tv/app/timeline-view.js` ne rend rien : seule la branche
   inaccessible de `handleKey` disparaît. Les appels `showModal()`/`close()` du dialogue restent dans
   la vue ; les tests de navigation du critère 5 prouvent que les boutons et Retour fonctionnent.
2. `grep -nE "^var (OverlayQueue|describeCard)|as globals of a classic script" tv/app/surveillance-overlay.js`
   ne rend rien.
3. `git check-ignore -q tests/fixtures/nouvelle-fixture.webm` sort avec le code 1 (le nom n'est pas ignoré),
   alors que `git check-ignore -q enregistrement.webm` sort avec le code 0 (la règle s'applique toujours
   ailleurs). Aucun fichier n'est créé pour cette vérification.
4. `grep -n "before the mission" tests/mac-ipc-contract.test.cjs` ne rend rien. Le commentaire « Section 5.2
   of the mission contract », plus haut dans le fichier, n'est pas dans le périmètre.
5. Les fichiers `tests/tv-remote-navigation.test.cjs`, `tests/tv-panel.test.cjs`,
   `tests/tv-overlay-queue.test.cjs`, `tests/tv-ambient-params.test.cjs`, `tests/tv-app-compat.test.cjs`,
   `tests/chat-error-ui.test.cjs` et `tests/mac-ipc-contract.test.cjs` passent, un fichier à la fois avec
   `node --test`, sans changement d’assertion ; seul le commentaire du critère 4 est modifié. Si le retrait
   ambient a déjà supprimé `tests/tv-ambient-params.test.cjs`, le journal constate son absence au départ
   et les autres fichiers restent exigés.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les tests de navigation pilotent le dialogue par le chemin clavier courant de la page et restent
inchangés. Les tests du panneau et de l’overlay conservent la frontière CommonJS. Aucun test nouveau :
`git check-ignore` prouve la règle des fixtures sans créer de fichier.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La navigation du dialogue dispose désormais d’une preuve automatisée hors navigateur natif. Le smoke
`scripts/smoke-tv-timeline.mjs` reste une vérification visuelle distincte : s’il n’est pas lancé lors de
l’implémentation, son résultat est annoncé « non vérifié ». Si un lecteur des alias retirés apparaît,
la session nomme le lecteur et s’arrête avant leur suppression.

## Journal

Rafraîchi le 15/10 contre `e92c6a6` : T028/T145 remplacés par T150, repères clavier/IPC corrigés,
tests du dialogue reconnus et conservés, critère d’absence limité à la branche `.open`, appels légitimes
`showModal()`/`close()` préservés et affirmation sur l’ajout forcé des fixtures retirée.
Aucun test ni smoke exécuté pendant ce rafraîchissement.

- Relecture documentaire le 15/10 contre `e92c6a6` : sources rendues pérennes dans
  `docs/audit-points-chauds.md` ou attribuées à la décision du propriétaire, le 15/10.

- Exploration Codex sur `9931b60` : périmètre confirmé, aucun lecteur des cinq alias globaux trouvé ;
  sept fichiers de tests présents (dont `tv-ambient-params.test.cjs`), témoin des hooks présent.
  Détails et écarts : `.harness-state/tickets/T101/exploration.md` et `ecarts.md` (aucun écart).
- Avant modification : `node --test tests/tv-remote-navigation.test.cjs` — 20/20 passent.
  Assertion publique Git exécutée avec `node -e` : attendu code 1 pour
  `git check-ignore -q tests/fixtures/nouvelle-fixture.webm`, reçu 0 ; rouge observé sur cette assertion,
  sans créer de fixture. Commande exacte et sortie conservées dans `fixtures-red.log` ;
  sortie de navigation dans `navigation-before.log`, sous `.harness-state/tickets/T101/`.
- Implémentation : seule la branche inaccessible de `handleKey` et les cinq alias globaux sont retirés ;
  `active`, les trois appels `showModal()`/`close()`, `TVLensOverlay` et CommonJS restent en place.
  Exception `!tests/fixtures/*.webm` ajoutée ; les deux commentaires décrivent leur contrat actuel.
- Vert observé : `rg -n 'end-session-dialog.*\.open' tv/app/timeline-view.js`,
  `grep -nE "^var (OverlayQueue|describeCard)|as globals of a classic script" tv/app/surveillance-overlay.js`
  et `grep -n "before the mission" tests/mac-ipc-contract.test.cjs` ne rendent rien (code 1).
  `rg -n 'end-session-dialog.*(showModal|close)' tv/app/timeline-view.js` retrouve les trois appels (code 0).
  `git check-ignore -q tests/fixtures/nouvelle-fixture.webm` sort avec 1,
  `git check-ignore -q enregistrement.webm` avec 0 ; la même assertion Node que lors du rouge passe.
  Aucun fichier créé. Commandes et sorties : `acceptance-green.log` dans le dossier d’état.
- Régressions : sept commandes `node --test tests/<nom>.test.cjs`, lancées séparément et en séquentiel :
  `tv-remote-navigation` 20/20, `tv-panel` 19/19, `tv-overlay-queue` 23/23, `tv-ambient-params` 6/6,
  `tv-app-compat` 5/5, `chat-error-ui` 7/7, `mac-ipc-contract` 15/15 ; aucun échec ni saut (95/95).
  Commandes exactes et sorties : `*-after.log` et `targeted-results.json` dans le dossier d’état.
  Empreintes des tests, du banc, du companion et des fixtures conservées ; seul le commentaire IPC varie.
- `node scripts/check.mjs --changed` — vert : règles, format, lint, gel du lint, cliquet et 15 tests IPC passent.
  Sortie complète : `.harness-state/tickets/T101/check-changed.log`.
- `node scripts/check.mjs` — vert : règles, format, lint, gel du lint, cliquet,
  1 203/1 203 tests JavaScript (102 fichiers) et 84 cas Python acceptés, dont un ignoré.
  Code de sortie 0 ; sortie complète : `.harness-state/tickets/T101/check-full.log`.
- Vérification finale : `git diff --check` — code 0. Les cinq modifications prévues et le journal
  constituent le diff ; aucun changement d’assertion, de liste de tests, de fixture ou de harnais.
  Le contenu antérieur à `## Journal` est conservé, y compris le statut `en-cours` déjà présent au départ.
- Smoke visuel `scripts/smoke-tv-timeline.mjs` : **non vérifié** (non lancé).
  Aucun smoke navigateur exécuté ; aucune intervention sur la TV, le VPS ou les fournisseurs réels.
  Verdict Codex : **TERMINÉ**, prêt pour relecture par la boucle, sans commit ni push.

### Réserves à la clôture

- Smoke visuel scripts/smoke-tv-timeline.mjs non vérifié : non lancé, vérification distincte des critères automatisés. Aucun smoke navigateur exécuté.
