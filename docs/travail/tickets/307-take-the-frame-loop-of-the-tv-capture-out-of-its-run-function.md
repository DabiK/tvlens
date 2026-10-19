---
id: T307
titre: Take the frame loop of the TV capture out of its run function
statut: termine
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
- 19/10, Codex : exploration terminée (capture, appelants, tests et ADR concernés). Extraction de la prise et de la
  classification d'un bloc, puis aides d'orchestration dans le même fichier pour respecter 80 lignes ; aucun écart prévu.
  État initial : statut du ticket et dossiers non suivis du propriétaire conservés. Détails dans le dossier d'état.
- 19/10, Codex : test direct ajouté, rouge observé sur l'absence d'une fonction de bloc, puis vert sur noir et images
  (`python3 -B -m unittest discover -s tests -p test_tv_capture.py -k test_one_block_can_be_captured_alone`).
  `capture_block` retourne médias, horodatages, activité, déplacements et cause ; `classify_block` décide du résultat.
  Suite capture intermédiaire : 40 tests OK. `node scripts/check.mjs --changed` : vert (ne lance pas Python).
- 19/10, Codex : le découpage de la prise conserve aussi la priorité d'un contrôle refusé avant lecture du rectangle.
  Test direct ajouté : rouge `lunaFailed` au lieu de `captureFailed`, puis vert après correction ; test noir/images
  encore vert. Commande : `python3 -B -m unittest discover -s tests -p test_tv_capture.py -k test_refused_control_keeps`.
  Sorties conservées dans le dossier d'état. Contrôle complet lancé après ces corrections.
- 19/10, Codex : inspection AST (`python3 -B .harness-state/tickets/T307/inspect_structure.py`) : `run` 72 lignes,
  toutes les fonctions sous 80 lignes, au plus une boucle explicite par fonction ; complexité indicative au plus 13.
  Les 46 méthodes préexistantes de tests capture restent identiques, assertions incluses.
  `node scripts/check.mjs` : vert (sortie complète dans `check-full.log` du dossier d'état).
  Aucun essai réel, commit ou push ; la relecture et l'intégration reviennent à la boucle.
- 19/10, Codex, reprise après relecture 1 : mineur sur l'import de `dataclasses` accepté. Correction limitée à une
  classe simple avec les mêmes champs et valeurs initiales, sans nouvel import. Les tests ajoutés restent inchangés.
  Préparation d'une preuve rouge/verte locale avec ce module volontairement indisponible, sans essai TV.
- 19/10, Codex : `python3 -B .harness-state/tickets/T307/check_capture_without_dataclasses.py` : rouge sur
  l'assertion de chargement sans `dataclasses`, puis vert après remplacement par un constructeur simple.
  La sonde précharge les dépendances du banc Mac avant l'interdiction ; une erreur de sonde est conservée et expliquée.
  Champs initiaux, listes indépendantes et deux tests directs inchangés : verts. Empreintes des tests inchangées.
  Inspection structurelle et `node scripts/check.mjs --changed` : verts ; contrôle complet relancé pour cette correction.
- 19/10, Codex, correction 1 : `node scripts/check.mjs` : vert, 3 031 tests JavaScript et 73 tests Python OK
  (`check-full-correction.log`). Mineur 1 corrigé, sans contestation ni réserve ; nouveau verdict remis à la boucle.
  Aucun essai TV, commit ou push.
