---
id: T022
titre: Declare the TV drop causes once and prove each one has its words
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le panneau de la TV dit pourquoi un passage n'a pas été envoyé. Que chaque cause comptée par la capture
ait ses mots n'est gardé que par une expression régulière JavaScript appliquée au texte de deux fichiers
Python, qui ne voit que 7 des 17 causes et cesserait de les voir si ces fichiers passaient aux
guillemets doubles. Après ce ticket, les 17 causes sont déclarées une fois côté Python, une liste
partagée les donne aux deux suites, le test du panneau exige un libellé pour chacune, et un test Python
lit les appels `drop(` par l'arbre syntaxique, pas par leur texte.

## Sources

- Constats : TSTC-13
- Code concerné, à la version `0d5a954` :
  - `tv/transport.py`, `drop(report, reason, count=1)` (l.31-35) : ajoute au total et au compteur de la
    cause, sans rien refuser. Appels : l.59 et l.80 `'storageFull'`, l.62 et l.83 `'readOnly'`, l.65
    `'sessionChanged'`, l.93 `'stopped' if self.stop.is_set() else reason` ; `reason` y vaut
    `'deliveryExpired'` (l.52) ou `'deliveryRejected'` (l.87).
  - `tv/capture.py` : `from transport import … drop …` (l.3) ; appels l.159 `'deliveryError'`, l.216
    (`reason or ('stopped' if … else 'overlayVisible' if … else 'geometryChanged' if … else 'noFrames'
    if … else 'audioFailed' if … else 'tooLong')`), l.221 `'queueOverflow'`, l.230 `'leftAtStop'` ;
    `reason` y reçoit `'foreignApp'` (l.182), `'captureFailed'` (l.187), `'lunaFailed'` (l.202).
  - `tv/app/sessions-view.js`, `DROP_LABELS` (l.225-243) : 17 clés, dans l'ordre `foreignApp`,
    `captureFailed`, `geometryChanged`, `noFrames`, `audioFailed`, `tooLong`, `queueOverflow`,
    `sessionChanged`, `deliveryExpired`, `deliveryRejected`, `stopped`, `leftAtStop`, `overlayVisible`,
    `storageFull`, `readOnly`, `deliveryError`, `lunaFailed` ; affichage `(DROP_LABELS[key] || key)`
    (l.337) : une cause sans libellé s'affiche par son identifiant.
  - `tests/tv-panel.test.cjs`, test « capture button: every end of capture comes with its cause, and an
    open archive asks for a choice » (l.503) : lecture du texte Python (l.540), motif
    `/drop\((?:self\.)?report, ?'(\w+)'/g` (l.541), plancher de 6 causes (l.542), un libellé exigé pour
    chaque cause trouvée (l.543). La cause inconnue affichée telle quelle est déjà prouvée (l.535).
  - `tests/test_tv_ambient.py`, classe `Queue` (l.516-518) : modèle d'une liste de cas lue par les deux
    suites, `tests/fixtures/tv-overlay-queue-cases.json`.
- Mesures à `0d5a954` :
  - le motif de la l.541 trouve 7 causes : `deliveryError`, `queueOverflow`, `leftAtStop`,
    `storageFull`, `readOnly`, `sessionChanged`, `stopped` ;
  - un parcours `ast` des deux fichiers trouve 10 appels `drop(` à deux arguments au moins ; les chaînes
    qui peuvent être la valeur de leur deuxième argument (littéral, branches d'une expression
    conditionnelle, opérandes de `or`) sont 12 causes distinctes : les 7 ci-dessus et `overlayVisible`,
    `geometryChanged`, `noFrames`, `audioFailed`, `tooLong`. Un parcours naïf de tout le sous-arbre y
    ajoute à tort `'withheld'`, clé d'indexation de la l.216 ;
  - les 5 autres causes (`foreignApp`, `captureFailed`, `lunaFailed`, `deliveryExpired`,
    `deliveryRejected`) passent par la variable `reason`, nom qui sert aussi aux raisons d'arrêt
    (`'session-changed'`, `'storage-full'`, `'read-only'`, `tv/transport.py` l.9-17) : elles ne se
    relèvent pas par le nom de la variable.
- Le relecteur de l'audit confirme les 17 causes émises et l'égalité avec les 17 clés de `DROP_LABELS`.
  Risque nommé : un `drop()` qui lève sur une cause inconnue arrêterait le fil de capture sur la TV.
- `node scripts/check.mjs` lance déjà les tests Python
  (`python3 -B -m unittest discover -s tests -p "test_*.py"`).

## Périmètre

- À modifier : `tv/transport.py` — y déclarer `DROP_REASONS`, tuple des 17 causes. `drop()` ne change
  pas : il ne refuse rien et ne range rien sous une cause de repli.
- À créer : `tests/fixtures/tv-drop-reasons.json`, tableau JSON des 17 causes dans l'ordre de
  `DROP_LABELS` ; `tests/test_tv_drop_reasons.py`.
- À modifier : `tests/tv-panel.test.cjs`, test de la l.503 — les l.540-543 lisent la liste partagée au
  lieu du texte Python.
- À ne pas toucher : `tv/capture.py`, `tv/app/` (`DROP_LABELS` n'est pas exporté : un libellé en trop
  est sans effet à l'écran), les autres tests.
- Les fautes injectées pour la preuve du critère 4 sont défaites avant la fin de la session
  (`git checkout -- tv/capture.py` ; à la main dans `tv/transport.py` et la liste partagée, qui portent
  le travail du ticket) : `tv/capture.py` ne reste pas modifié.
- Limite assumée : une cause nouvelle portée par une variable, comme les cinq d'aujourd'hui, échappe à
  la lecture des appels. La déclaration `DROP_REASONS` est le seul endroit où l'ajouter ; rendre ces
  causes impossibles à oublier demanderait de toucher à la boucle de capture, hors de ce ticket.
- Aucune ligne de plus de 160 caractères dans les fichiers créés ; `tests/tv-panel.test.cjs` et
  `tv/transport.py` n'en gagnent aucune.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `python3 -B -m unittest discover -s tests -p "test_tv_drop_reasons.py"` passe et prouve :
   - `transport.DROP_REASONS` est la liste de `tests/fixtures/tv-drop-reasons.json`, sans doublon ;
   - par lecture `ast` de `tv/capture.py` et `tv/transport.py`, toute chaîne qui peut être la valeur du
     deuxième argument d'un appel `drop(` est dans `DROP_REASONS` ; la lecture trouve au moins 10 appels
     et 12 causes distinctes, sinon le test échoue ;
   - sur un texte Python écrit dans le test, la même lecture relève un littéral entre apostrophes, un
     littéral entre guillemets, les branches d'une expression conditionnelle, les opérandes d'un `or`,
     un appel écrit sur deux lignes, et ne relève pas une clé d'indexation.
2. `node --test tests/tv-panel.test.cjs` passe, 19 tests au moins. Dans le test de la l.503, la liste
   partagée compte au moins 17 causes et, pour chacune, le libellé d'une capture arrêtée avec
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

Aucune décision n'est attendue. Si la lecture `ast` ne retrouve pas les 10 appels et les 12 causes
mesurés, ou si l'une des 17 causes n'a pas de libellé : verdict BLOQUÉ, avec l'écart constaté.

## Journal
