---
id: T096
titre: Compare the overlay constants of the page and the supervisor to one shared file
statut: a-faire
bloque_par: T028, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

La file de l'incrustation existe deux fois : en JavaScript dans la page, en Python dans le superviseur. Leurs
cas partagés passent leurs limites en paramètre, si bien que les constantes par défaut des deux côtés (durées
d'affichage, intervalle, taille de la file, fraîcheur, longueur du texte) peuvent diverger sans qu'un test le
voie.

Après ce ticket, un fichier de constantes partagé est comparé aux constantes des deux côtés, par la suite
JavaScript et par la suite Python.

## Sources

- Constats : TSTC-14
- Code vérifié à la version `0d5a954` (nom d'abord, la ligne suit et bougera au formatage) :
  - Constantes de la page : `tv/app/surveillance-overlay.js` lignes 10-19 (`DISPLAY_CHOICES`,
    `DISPLAY_DEFAULT_MS` 14000, `DISPLAY_MAX_MS` 20000, `GAP_MS` 1500, `MAX_QUEUE` 4, `STALE_MS` 180000,
    `MAX_TEXT` 600) ; objet exporté lignes 481-492, qui ne contient ni `GAP_MS`, ni `MAX_QUEUE`, ni
    `STALE_MS`, ni `MAX_TEXT`. `MAX_TEXT` borne le texte d'une carte dans `parseAmbientParams` (ligne 389) :
    un texte de plus de 600 caractères est refusé.
  - Constantes du superviseur : `tv/ambient.py` ligne 38 (`DISPLAY_DEFAULT_MS, DISPLAY_CAP_MS,
    DISPLAY_CHOICES = 14000, 20000, (8000, 14000, 20000)`), `GAP = 1.5` (secondes, ligne 41),
    `QUEUE_MAX, FRESH_MS = 4, 180000` (ligne 48) ; `reduce_card(card, more)` (ligne 232) garde un texte de
    600 caractères au plus et coupe un texte plus long à 599 caractères suivis de « … » (ligne 238).
  - Cas partagés : `tests/fixtures/tv-overlay-queue-cases.json`, clé `defaults` (`tickMs` 250, `displayMs`
    14000, `gapMs` 1500, `maxQueue` 4, `staleMs` 180000) ; lus par `tests/tv-overlay-queue.test.cjs`
    (fonction `play`, ligne 13, qui fusionne `defaults`) et par `tests/test_tv_ambient.py`, classe `Queue`
    (ligne 516), test `test_shared_cases_exactly_on_the_queue_with_the_zero_latency_model` (ligne 523), qui
    construit `AmbientQueue(limit=options['maxQueue'], fresh_ms=options['staleMs'])` : la constante
    `QUEUE_MAX` du superviseur n'est jamais comparée.
  - Le contrôle lance les tests Python par `python3 -B -m unittest discover -s tests -p test_*.py`
    (`scripts/check.mjs`, ligne 130).

## Périmètre

- À modifier :
  - `tv/app/surveillance-overlay.js` : ajouter `GAP_MS`, `MAX_QUEUE`, `STALE_MS` et `MAX_TEXT` à l'objet
    exporté. Rien d'autre dans ce fichier ; aucune valeur ne change.
  - `tests/tv-overlay-queue.test.cjs` : un test qui compare le fichier de constantes aux exports de la page
    et à `defaults` des cas partagés.
  - `tests/test_tv_ambient.py` : une classe `SharedConstants` qui compare le même fichier aux constantes du
    superviseur.
- À créer : `tests/fixtures/tv-shared-constants.json`, avec `version`, une phrase `about` qui dit que les deux
  suites le lisent, et les valeurs `displayChoicesMs`, `displayDefaultMs`, `displayMaxMs`, `gapMs`,
  `queueMax`, `staleMs`, `cardTextMax`, écrites en littéraux.
- À ne pas toucher : `tv/ambient.py`, les autres scripts de `tv/app`, les pages HTML, les cas de
  `tests/fixtures/tv-overlay-queue-cases.json`, les autres classes de `tests/test_tv_ambient.py`.
- Hors contrat, à ne pas comparer : les libellés et textes affichés, qui diffèrent volontairement d'un côté
  à l'autre (par exemple les étiquettes de l'activité).

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/tv-overlay-queue.test.cjs` passe et exige : `GAP_MS`, `MAX_QUEUE`, `STALE_MS`,
   `DISPLAY_DEFAULT_MS`, `DISPLAY_MAX_MS`, `DISPLAY_CHOICES` et `MAX_TEXT` exportés par la page égaux aux
   valeurs du fichier de constantes ; `defaults` des cas partagés égal à ces mêmes valeurs pour `displayMs`,
   `gapMs`, `maxQueue` et `staleMs` ; une carte dont le texte fait `cardTextMax` caractères acceptée par
   `parseAmbientParams`, la même avec un caractère de plus refusée.
2. `python3 -B -m unittest discover -s tests -p test_tv_ambient.py -k SharedConstants -v` (lancé depuis la
   racine du dépôt) passe et exige : `DISPLAY_DEFAULT_MS`, `DISPLAY_CAP_MS`, `DISPLAY_CHOICES`, `QUEUE_MAX`,
   `FRESH_MS` et `GAP` (converti en millisecondes) égaux au fichier ; `reduce_card` rend entier un texte de
   `cardTextMax` caractères, et rend pour un texte plus long un texte de `cardTextMax` caractères exactement.
3. Preuve que la comparaison protège, au journal avec commande et sortie : en remplaçant provisoirement
   `QUEUE_MAX, FRESH_MS = 4, 180000` par `5, 180000` dans `tv/ambient.py`, `SharedConstants` échoue alors que
   la classe `Queue` passe encore ; en remplaçant provisoirement la valeur de `GAP_MS` dans
   `tv/app/surveillance-overlay.js`, le test JavaScript échoue. Les deux remplacements sont retirés avant la
   fin de la session.
4. `node --test tests/tv-app-compat.test.cjs` passe toujours : `tv/app/surveillance-overlay.js` reste un
   script classique sous le plancher du moteur.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/fixtures/tv-shared-constants.json`, le test ajouté à `tests/tv-overlay-queue.test.cjs` et la classe
`SharedConstants` de `tests/test_tv_ambient.py`. Frontières : les exports de `tv/app/surveillance-overlay.js` ;
les constantes et `reduce_card` de `tv/ambient.py`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si une constante diffère déjà d'un côté à l'autre quand la session commence :
le test n'est pas ajusté pour passer ; verdict BLOQUÉ avec les deux valeurs, car choisir la bonne est une
décision du propriétaire.

## Journal
