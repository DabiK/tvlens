---
id: T307
titre: Take the frame loop of the TV capture out of its run function
statut: a-faire
bloque_par: T306
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

`run()` de la capture TV ne fait plus tout : la prise des images d'un bloc et la décision qui en sort (bloc avec images,
son seul, perte et sa cause) vivent dans une fonction nommée, testable seule. Aucun comportement ne change.

## Sources

- Réserve de clôture de T301 (`.harness-state/tickets/T301/relecture-1.md`, constat 5, reconduit en relecture 2) :
  `run()` dépasse de loin 80 lignes et une complexité de 15 ; Python n'est pas vérifié par ESLint ; T301 y a ajouté une
  trentaine de lignes de prise.
- Code à `600b304` (T306 change la prise de contrôle : relire les lignes après son intégration) : `tv/capture.py:43-234`,
  `run()` ; fonctions imbriquées `save` (`:58`), `end` (`:62`), `stop` (`:68`), `upload` (`:90`), `stamp` (`:106`) ;
  boucle des blocs et boucle des prises dans `run()`.
- `docs/standards.md` (taille et complexité des fonctions).
- Tests : `tests/test_tv_capture.py` (clés exactes du rapport, transitions noir et images, refus nommés),
  `tests/test_tv_control.py`, `tests/fixtures/tv-capture-refusals.json`.

## Périmètre

- À modifier : `tv/capture.py`, et `tests/test_tv_capture.py` seulement pour un test de la fonction sortie.
- Sortir au moins la prise des images d'un bloc (contrôle du noir, prise, géométrie, application suivie) et la
  classification du bloc, avec leurs entrées et sorties explicites ; `run()` garde l'orchestration (session, envoi,
  arrêts, rapport).
- À ne pas toucher : les causes et clés du rapport, la cadence, les messages, le contrôleur, le serveur.

## Critères d'acceptation

1. `run()` et chaque fonction sortie restent sous 80 lignes ; aucune fonction de `tv/capture.py` n'a plus de deux
   niveaux d'imbrication de boucles.
2. Un test appelle directement la fonction de prise d'un bloc, avec le faux `luna-send`, sur un bloc noir et un bloc
   avec images.
3. Les tests existants de `tests/test_tv_capture.py` et `tests/test_tv_control.py` passent sans modification de leurs
   assertions.
4. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/test_tv_capture.py` : la prise d'un bloc appelée seule, puis les tests existants inchangés.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, orchestrateur : ticket ouvert depuis la réserve de clôture de T301, en fin de file (aucun comportement ne
  change).
