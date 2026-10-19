---
id: T022
titre: Declare the TV drop causes once and prove each one has its words
statut: a-faire
bloque_par: T294
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le panneau de la TV dit pourquoi un passage n'a pas été envoyé. Que chaque cause comptée par la capture
ait ses mots n'est gardé que par une expression régulière JavaScript appliquée au texte de deux fichiers
Python, qui ne voit que 7 des 16 causes et cesserait de les voir si ces fichiers passaient aux
guillemets doubles. Après ce ticket, les 16 causes sont déclarées une fois côté Python, une liste
partagée les donne aux deux suites, le test du panneau exige un libellé pour chacune, et un test Python
lit les appels `drop(` par l'arbre syntaxique, pas par leur texte.

## Sources

- Constats : TSTC-13
- Code concerné, à la version `1178657` (le constat d'origine porte sur `0d5a954`) :
  - `tv/transport.py`, `drop(report, reason, count=1)` (l.31-35) : ajoute au total et au compteur de la
    cause, sans rien refuser. Appels : l.59 et l.83 `'storageFull'`, l.62 et l.86 `'readOnly'`, l.65
    `'sessionChanged'`, l.96 `'stopped' if self.stop.is_set() else reason` ; `reason` y vaut
    `'deliveryExpired'` (l.52) ou `'deliveryRejected'` (l.90).
  - `tv/capture.py` : `from transport import … drop …` (l.3) ; appels l.96 `'deliveryError'`, l.177
    `drop(report,reason)`, l.181 `'queueOverflow'`, l.190 `'leftAtStop'`. Dans la boucle des blocs,
    `reason` reçoit `'stopped'` (l.121, l.171), `'foreignApp'` (l.128, l.135, l.142), `'captureFailed'`
    (l.138), `'geometryChanged'` (l.146, l.173), `'lunaFailed'` (l.160), `'noFrames'` (l.174),
    `'audioFailed'` (l.175) ou `'tooLong'` (l.176).
  - Changements depuis `0d5a954` : T181 (`566b4a2`) a retiré la cause `overlayVisible` et remplacé
    l'expression conditionnelle passée à `drop(` par des `if`/`elif` qui affectent `reason` (l.170-176).
    T287 (`1d8d64a`) suit une application parmi `VERIFIED_APPLICATIONS` (l.9-12) : `foreignApp` compte
    aussi une application autre que celle suivie (l.133-136) et un changement d'application pendant la
    prise (l.140-143). Une image prise pendant un déplacement du rectangle vidéo n'est pas une perte :
    elle est comptée à part dans `framesMoved` (l.149, l.166) ; un bloc dont toutes les prises ont
    bougé est perdu sous `geometryChanged` (l.173).
  - `tv/app/sessions-view.js`, `DROP_LABELS` (l.223-240) : 16 clés, dans l'ordre `foreignApp`,
    `captureFailed`, `geometryChanged`, `noFrames`, `audioFailed`, `tooLong`, `queueOverflow`,
    `sessionChanged`, `deliveryExpired`, `deliveryRejected`, `stopped`, `leftAtStop`, `storageFull`,
    `readOnly`, `deliveryError`, `lunaFailed` ; affichage `(DROP_LABELS[key] || key)` (l.340) : une
    cause sans libellé s'affiche par son identifiant. `describeCapture` est à la l.247.
  - `tests/tv-panel.test.cjs`, 21 tests ; test « capture button: every end of capture comes with its
    cause, and an open archive asks for a choice » (l.514) : lecture du texte Python (l.559), motif
    `/drop\((?:self\.)?report, ?'(\w+)'/g` (l.560), plancher de 6 causes (l.561), un libellé exigé pour
    chaque cause trouvée (l.562). La cause inconnue affichée telle quelle est déjà prouvée (l.554).
  - Modèle d'une liste lue par les deux suites : `tests/fixtures/tv-capture-refusals.json`, lu par
    `tests/test_tv_capture.py` (l.19), `tests/test_tv_control.py` (l.21), `tests/tv-panel.test.cjs`
    (l.10) et `tests/tv-paired-page.test.cjs` (l.5). L'ancien modèle, la classe `Queue` de
    `tests/test_tv_ambient.py`, a été retiré avec ce fichier par T166 (`13c5890`).
- Mesures à `1178657` :
  - le motif de la l.560 trouve 7 causes : `deliveryError`, `queueOverflow`, `leftAtStop`,
    `storageFull`, `readOnly`, `sessionChanged`, `stopped` ;
  - un parcours `ast` des deux fichiers trouve 10 appels `drop(` à deux arguments au moins ; les chaînes
    qui peuvent être la valeur de leur deuxième argument (littéral, branches d'une expression
    conditionnelle, opérandes de `or`) sont les 7 mêmes causes. À `0d5a954`, il en trouvait 12 : les
    cinq de l'ancienne expression conditionnelle passent désormais par `reason`. La clé d'indexation
    `'withheld'`, qu'un parcours naïf relevait à tort, a disparu avec T181 ;
  - les 9 autres causes (`foreignApp`, `captureFailed`, `geometryChanged`, `lunaFailed`, `noFrames`,
    `audioFailed`, `tooLong`, `deliveryExpired`, `deliveryRejected`) passent par la variable `reason`,
    nom qui sert aussi aux raisons d'arrêt (`'read-only'`, `'storage-full'`, `'error'` dans
    `tv/capture.py` l.78-80 ; attributs `reason` de `tv/transport.py` l.9, l.13 et l.17) : elles ne se
    relèvent pas par le nom de la variable ;
  - lecture du code : les 16 causes émises sont exactement les 16 clés de `DROP_LABELS`.
- À `0d5a954`, le relecteur de l'audit confirmait les 17 causes émises d'alors et l'égalité avec les 17
  clés de `DROP_LABELS`. Risque nommé : un `drop()` qui lève sur une cause inconnue arrêterait le fil de
  capture sur la TV.
- `node scripts/check.mjs` lance les tests Python en contrôle complet seulement (`pythonTests`,
  `scripts/check.mjs` l.193-199, appelé l.224 : `python3 -B -m unittest discover -s tests -p
  "test_*.py"`) ; `--changed` ne les lance pas.

## Périmètre

- À modifier : `tv/transport.py` — y déclarer `DROP_REASONS`, tuple des 16 causes. `drop()` ne change
  pas : il ne refuse rien et ne range rien sous une cause de repli.
- À créer : `tests/fixtures/tv-drop-reasons.json`, tableau JSON des 16 causes dans l'ordre de
  `DROP_LABELS` ; `tests/test_tv_drop_reasons.py`.
- À modifier : `tests/tv-panel.test.cjs`, test de la l.514 — les l.559-562 lisent la liste partagée au
  lieu du texte Python.
- À modifier aussi, dans `tv/capture.py` et `tv/transport.py`, le seul nom de la variable qui porte une cause de perte
  jusqu'à `drop(` (par exemple `cause`), pour qu'il ne serve plus aux raisons d'arrêt (`'read-only'`,
  `'storage-full'`, `'error'`) : aucun autre changement de comportement.
- À ne pas toucher : `tv/app/` (`DROP_LABELS` n'est pas exporté : un libellé en trop est sans effet à l'écran), les
  autres tests.
- Les fautes injectées pour la preuve du critère 4 sont défaites avant la fin de la session, à la main : seuls le
  renommage de la variable et le travail du ticket restent.
- Aucune ligne de plus de 160 caractères dans les fichiers créés ; `tests/tv-panel.test.cjs` et
  `tv/transport.py` n'en gagnent aucune.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `python3 -B -m unittest discover -s tests -p "test_tv_drop_reasons.py"` passe et prouve :
   - `transport.DROP_REASONS` est la liste de `tests/fixtures/tv-drop-reasons.json`, sans doublon ;
   - par lecture `ast` de `tv/capture.py` et `tv/transport.py`, toute chaîne qui peut être la valeur du
     deuxième argument d'un appel `drop(` est dans `DROP_REASONS` : littéraux de l'appel, et littéraux affectés,
     dans la même fonction, à la variable des causes passée à `drop(` ; la lecture trouve au moins 10 appels et
     toutes les causes de `DROP_REASONS`, sinon le test échoue ;
   - sur un texte Python écrit dans le test, la même lecture relève un littéral entre apostrophes, un
     littéral entre guillemets, les branches d'une expression conditionnelle, les opérandes d'un `or`,
     un appel écrit sur deux lignes, et ne relève pas une clé d'indexation.
2. `node --test tests/tv-panel.test.cjs` passe, 21 tests au moins. Dans le test de la l.514, la liste
   partagée compte au moins 16 causes et, pour chacune, le libellé d'une capture arrêtée avec
   `dropReasons: { [cause]: 1 }` ne contient pas `(cause 1)`.
3. `grep -c "capture\.py\|transport\.py" tests/tv-panel.test.cjs` rend 0.
4. Fautes injectées, consignées au journal puis défaites :
   - un appel `drop(report,'ghost')` ajouté dans `tv/capture.py` fait échouer le test Python ;
   - une cause ajoutée à `DROP_REASONS` seule fait échouer le test Python ; ajoutée aussi à la liste
     partagée, elle fait échouer le test du panneau ;
   - un appel `drop(` existant réécrit avec des guillemets doubles laisse les deux suites vertes.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/test_tv_drop_reasons.py` (nouveau) et le test existant de `tests/tv-panel.test.cjs`. Frontières :
la déclaration `DROP_REASONS` du module `transport` importé, l'arbre syntaxique des deux fichiers de
capture, et `describeCapture` de `tv/app/sessions-view.js` pour les libellés.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si la lecture `ast` ne retrouve pas les 10 appels et les 7 causes
mesurés, ou si l'une des 16 causes n'a pas de libellé : verdict BLOQUÉ, avec l'écart constaté.

## Journal

- 19/10, orchestrateur : rouvert sur décision du propriétaire (sélection du tri d'Astra) ; sources mises à
  jour à `1178657` : 16 causes au lieu de 17 (`overlayVisible` retirée par T181), lignes de
  `tv/capture.py`, `tv/transport.py`, `DROP_LABELS` et du test du panneau, modèle de liste partagée
  passé à `tests/fixtures/tv-capture-refusals.json` (`tests/test_tv_ambient.py` retiré par T166).
  Plancher de la lecture `ast` ramené de 12 à 7 causes : T181 a fait passer cinq causes par `reason`,
  la lecture n'en voit plus d'autres ; la limite assumée couvre désormais neuf causes. Plancher du
  panneau relevé de 19 à 21 tests, le nombre actuel. Bloqueurs revus : T145 retiré (file rouverte),
  T294 ajouté (le ticket passe après la file en cours).
- 19/10, orchestrateur : le plancher de la lecture `ast` reste à toutes les causes (16), pas 7 : la variable des causes est renommée pour que la lecture la suive, au lieu d'abaisser l'exigence.
