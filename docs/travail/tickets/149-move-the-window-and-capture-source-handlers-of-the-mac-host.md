---
id: T149
titre: Move the window and capture source handlers of the Mac host into their own modules
statut: termine
bloque_par: T146, T148
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

`app/main.cjs` écrit en ligne, au milieu de la composition, deux logiques qui ne lisent pas la session :
le mode de fenêtre flottante et le choix de la source capturée. Celle-ci tient l'état de l'hôte dans quatre
variables (`sources`, `selectedId`, `lastSource`, `capturedSource`), dont deux de module. Après ce
ticket, chacune vit dans son module de `app/`, se teste sans Electron, et `main.cjs` ne garde que la
table des canaux : une ligne `handle('…', …)` par canal, qui appelle le module. Le comportement de
l'hôte ne change pas. Le ticket fixe aussi la forme que suivront les modules suivants de l'hôte Mac.

## Sources

- Constat : ADP-06 (`docs/audit-maintenabilite.md`, ancre `ADP-06`) : `app/main.cjs` mêle composition,
  état mutable et corps des canaux.
- Plan court : section « Plan court » de `docs/travail/tickets/INDEX.md`.
- Code concerné, à la version `0d4c495` d'`app/main.cjs` (le nom d'abord, la ligne ensuite ; T146 et
  T148 auront décalé les lignes) :
  - mode de fenêtre : `let fullBounds = window.getBounds(), floating = false;` (l. 114) et
    `handle('window:mode', …)` (l. 115-127), qui lit `screen.getDisplayMatching` ;
  - source capturée :
    - `let sources = [], selectedId;` (l. 36) ;
    - `sourcePreferenceFile`, `lastSource` lu au démarrage, `capturedSource` (l. 272-274) ;
    - `handle('capture:sources', …)` (l. 275-281) : la source `Vidéo de démonstration` en smoke, sinon
      `desktopCapturer.getSources` ; la fenêtre `TVLens` exclue ; la présélection seulement si
      l'identifiant et le titre correspondent encore ; la permission lue par
      `systemPreferences.getMediaAccessStatus('screen')`, ou `granted` en smoke ;
    - `handle('capture:select', …)` (l. 282-289) : refus « Source indisponible », préférence écrite en
      mode `0o600` ;
    - `handle('capture:settings', …)` (l. 290) ;
    - lecteurs hors des canaux : le titre de session de `watch:start` (`capturedSource`, l. 402) et
      `setDisplayMediaRequestHandler` (l. 538-543), qui consomme `selectedId` une fois.
- Bancs du Mac, qui lancent le vrai `app/main.cjs` derrière un faux Electron :
  `tests/mac-ipc-contract.test.cjs` (faux `screen`, `desktopCapturer`, `systemPreferences` aux l. 156-159),
  `tests/architecture-f05.test.cjs`, `tests/architecture-f07.test.cjs`. Ils substituent `electron` pour
  tout module, mais d'autres modules seulement quand `app/main.cjs` les requiert, et ne retirent du cache
  que `app/main.cjs` : un module nouveau reste en cache d'un lancement à l'autre.
- Gardes de texte sur `app/main.cjs` : `tests/mac-ipc-contract.test.cjs:86-118`. Les canaux appelés par
  le bridge doivent égaler les `handle('…')` écrits dans `app/main.cjs`, et les événements écoutés
  égaler ses `send('…')`.
- Section « Interface et dépendances » de `docs/architecture.md` (l. 77).

## Périmètre

- À modifier :
  - créer `app/window-mode.cjs`, qui exporte une fabrique : elle reçoit `window` et `screen`, garde
    `fullBounds` et `floating` dans l'instance, et rend la fonction appelée par `window:mode` ;
  - créer `app/capture-sources.cjs`, qui exporte une fabrique : elle reçoit `smoke`, `desktopCapturer`,
    `systemPreferences`, `shell` et le chemin de la préférence, lit la dernière source, et rend les
    fonctions des trois canaux `capture:*`, plus une qui livre une fois la source choisie au gestionnaire
    de capture et une qui rend le nom de la source capturée pour le titre de session ;
  - `app/main.cjs` : requérir ces deux modules en tête, avec les autres ; chaque canal devient une ligne
    `handle('…', …)` qui appelle le module ; `watch:start` et `setDisplayMediaRequestHandler` lisent la
    source par le module ;
  - créer `tests/window-mode.test.cjs` et `tests/capture-sources.test.cjs` ;
  - `docs/architecture.md`, section « Interface et dépendances » : un paragraphe qui décrit la forme
    retenue (voir « Le ticket tranche ainsi »).
- Forme imposée à ces modules par les bancs et les gardes :
  - aucun `require('electron')` : les objets Electron arrivent en paramètre ;
  - aucun état au niveau du module : l'état vit dans l'instance que rend la fabrique ;
  - aucun `require` des modules que les bancs substituent (`runtime/*`, `adapters/codex-confinement.cjs`,
    `adapters/disk-guard.cjs`, `adapters/video-bridge.cjs`) ;
  - ni `process.env` ni `process.argv` : `app/main.cjs` décide, le module reçoit ;
  - aucun `handle('…')` ni `send('…')` : les canaux restent écrits dans `app/main.cjs`.
- À ne pas toucher :
  - les noms des canaux, leurs entrées, leurs réponses et leurs messages d'erreur ;
  - le gestionnaire `setDisplayMediaRequestHandler` lui-même et sa vérification de `mainFrame` ;
  - les autres canaux d'`app/main.cjs` ;
  - les tests existants, `tests/mac-ipc-contract.test.cjs` compris.

## Critères d'acceptation

1. `tests/window-mode.test.cjs`, avec un faux `window` et un faux `screen`, vérifie :
   - un mode invalide est refusé par « Mode de fenêtre invalide. » ;
   - le passage en flottant mémorise les bornes, met la fenêtre au premier plan et la place dans la zone
     de travail ;
   - le retour au mode plein rend les bornes mémorisées.
2. `tests/capture-sources.test.cjs`, avec des faux de `desktopCapturer`, `systemPreferences` et `shell`,
   et un dossier temporaire, vérifie :
   - la fenêtre `TVLens` n'est jamais listée ni sélectionnable ;
   - une source n'est présélectionnée que si son identifiant et son titre correspondent à la préférence ;
   - `capture:select` refuse une source inconnue par « Source indisponible » et écrit la préférence en
     mode `0o600` ;
   - la source choisie est livrée une fois au gestionnaire de capture, puis plus du tout ;
   - en smoke, seule `Vidéo de démonstration` est listée, avec la permission `granted`.
3. `grep -nE "^\s*let .*\b(sources|selectedId|lastSource|capturedSource|fullBounds|floating)\b" app/main.cjs`
   ne rend rien. Sortie (vide) dans le journal.
4. `grep -nE "require\(['\"]electron['\"]\)|process\.|handle\(|send\(" app/window-mode.cjs app/capture-sources.cjs`
   ne rend rien. Sortie (vide) dans le journal.
5. Les tests existants passent sans modification : `git diff --stat` ne cite sous `tests/` que les deux
   fichiers créés.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/window-mode.test.cjs` et `tests/capture-sources.test.cjs`, frontière : la fabrique de chaque module,
nourrie de faux objets Electron, appelée comme `app/main.cjs` l'appelle. Les bancs du Mac existants,
inchangés, prouvent que les canaux répondent comme avant.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **`app/main.cjs` garde la table des canaux.** Chaque `handle('…')` et chaque `send('…')` y reste écrit,
  sur une ligne qui appelle le module. Les gardes de `tests/mac-ipc-contract.test.cjs` lisent ce seul
  fichier : elles restent justes sans être modifiées, et la table se lit d'un coup d'œil.
- **Electron par paramètre.** Les bancs substituent `electron` à chaque lancement mais gardent en cache les
  modules autres que `app/main.cjs` : un module qui requiert Electron ou garde un état de module verrait le
  faux d'un lancement précédent. Le paragraphe de `docs/architecture.md` le dit.
- **Pas d'ADR.** La forme découle des bancs et des gardes existants ; elle ne choisit rien entre deux
  architectures. Le paragraphe de `docs/architecture.md` suffit à la transmettre.
- **Les réglages et les modèles restent dans `app/main.cjs`.** `models:save` et `app:import-config`
  réaffectent `config` et `selectedModels`, que la composition et les clients Codex lisent par référence.
  Les déplacer change l'objet modifié : hors du plan court.
- **Après T146 et T148**, qui modifient le même fichier : ce ticket part du code qu'ils laissent.

## Journal

- Exploration : règles, skills, code de l'hôte, appelants, bancs Mac et architecture lus ; témoin de hooks présent.
  Détails et absence d'écart dans `.harness-state/tickets/T149/{exploration,ecarts}.md`.
  État préexistant conservé : statut du ticket, `design/continuous-context/`, `experiments/`.

- Tests d'abord, fenêtre : `node --test tests/window-mode.test.cjs`.
  Validation : rouge observé « Missing expected exception », puis 1/1 vert ; placement flottant :
  rouge sur les bornes, puis 2/2 verts ; restauration : rouge sur les bornes, puis 4/4 verts.
  Le plafonnement et le maintien dans la zone de travail passent aussi. Sorties exactes :
  `.harness-state/tickets/T149/window-{validation,floating,restore}-{red,green}.log`.
- Tests d'abord, sources : `node --test tests/capture-sources.test.cjs`.
  Rouges observés sur les assertions de liste, préférence, écriture, consommation, smoke et réglages,
  puis respectivement 1/1, 2/2, 3/3, 4/4, 5/5 et 6/6 verts.
  Sorties : `.harness-state/tickets/T149/capture-{list,preference,select,consume,smoke,settings}-{red,green}.log`.
- Caractérisations complémentaires : préférence absente ou invalide et isolation entre instances.
  `node --test --test-concurrency=1 tests/window-mode.test.cjs tests/capture-sources.test.cjs` :
  12/12 verts (`modules-green.log`).
- Extraction et câblage : objets Electron injectés, état par instance, quatre canaux délégués sur
  une ligne chacun ; nom de source et consommation lus par le module. Vérification de `mainFrame`
  conservée dans l'hôte. Forme décrite dans « Interface et dépendances » de l'architecture.
- `node scripts/check.mjs --changed` : vert ; règles, format, cliquet et 12/12 tests réussis.
  ESLint non lancé (non installé ou non configuré). Sortie : `check-changed.log` dans le dossier d'état.
- `grep -nE "^\s*let .*\b(sources|selectedId|lastSource|capturedSource|fullBounds|floating)\b" app/main.cjs`
  : sortie vide (code 1, aucune correspondance).
- `grep -nE "require\(['\"]electron['\"]\)|process\.|handle\(|send\(" app/window-mode.cjs app/capture-sources.cjs`
  : sortie vide (code 1, aucune correspondance).
- `git diff --stat -- tests/` : sortie vide ; aucun test existant modifié.
  `git ls-files --others --exclude-standard tests/` : seulement `tests/capture-sources.test.cjs`
  et `tests/window-mode.test.cjs`. Les créations ne figurent pas dans `git diff --stat` avant indexation.
  `git diff --check` : sortie vide, code 0.
- `node scripts/check.mjs` : vert (code 0). 94 fichiers JavaScript, 1 086/1 086 tests réussis,
  dont les bancs Mac existants inchangés ; 84 tests Python exécutés, succès avec un test ignoré.
  Règles, format et cliquet verts ; ESLint non lancé (non installé ou non configuré).
  Sortie complète du contrôle : `.harness-state/tickets/T149/check-full.log`.
- Vérification finale après nettoyage de présentation des tests : `node scripts/check.mjs --changed`
  vert, 12/12 tests ; `git diff --check` vide (code 0). Sortie : `check-changed-final.log`.
  Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T149/verdict.json` ; aucun commit ni push.
- Reprise après `relecture-1.md` : rapport, ticket, journal, écarts, `git status` et `git diff` relus ;
  témoin de hooks renouvelé présent. Constat mineur 1 accepté ; constat 2 hors périmètre réservé.
  Avant correction : `node --test tests/capture-sources.test.cjs`, 8/8 verts (`review-capture-before.log`).
  Correction de nommage sans changement de comportement : aucun nouveau rouge revendiqué ni test de texte source ajouté.
- Constat 1 corrigé : `OWN_WINDOW_NAME` utilisée pour la liste et la sélection, avec commentaire
  indiquant qu'elle doit égaler le titre de la `BrowserWindow` créée dans `app/main.cjs`.
  Après correction : `node --test tests/capture-sources.test.cjs`, 8/8 verts (`review-capture-after.log`).
  `node scripts/check.mjs --changed` : vert, 12/12 tests (`review-check-changed.log`) ; ESLint non lancé.
  Les deux commandes `grep` des critères 3 et 4 donnent encore une sortie vide (code 1).
  `git diff --check` et `git diff --stat -- tests/` : sorties vides (code 0) ;
  `git ls-files --others --exclude-standard tests/` ne liste que les deux créations attendues.
- Contrôle complet après correction : `node scripts/check.mjs`, vert (code 0),
  1 086/1 086 tests JavaScript réussis dans 94 fichiers ; 84 tests Python exécutés avec succès,
  un ignoré. Règles, format et cliquet verts ; ESLint non lancé (absent ou non configuré).
  Sortie : `.harness-state/tickets/T149/review-check-full.log`.
  Nouveau verdict `TERMINÉ` avec réserve hors périmètre sur les tailles minimales de la fenêtre ;
  aucun constat bloquant ou mineur laissé à corriger. Aucun commit ni push.

### Réserves à la clôture

- Réserve hors périmètre, relecture-1 constat 2 : centraliser les tailles minimales du mode plein (1000 et 720) encore répétées entre app/window-mode.cjs et la création de BrowserWindow dans app/main.cjs. Cette création n'est pas autorisée à modification par le ticket ; à traiter dans un ticket suivant.
- .harness-state/tickets/T149/relecture-2.md : `app/main.cjs:89-90` (hors périmètre) : toujours en réserve

  Les tailles minimales `1000` et `720` restent écrites en dur dans `new BrowserWindow(…)`, alors que `app/window-mode.cjs` nomme `FULL_MIN_WIDTH` et `FULL_MIN_HEIGHT`. La création de la fenêtre ne fait toujours pas partie de ce que le ticket autorise à modifier. Le constat reste réel et `hors périmètre` ; `ecarts.md` le garde en réserve pour un ticket suivant. Il est compté dans la ligne `CONSTATS`, pas dans `NON CORRIGÉS`.
