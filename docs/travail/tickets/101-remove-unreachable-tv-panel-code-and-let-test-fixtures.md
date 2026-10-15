---
id: T101
titre: Remove unreachable TV panel code and let test fixtures escape the webm ignore
statut: a-faire
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
